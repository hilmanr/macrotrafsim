//Variabel untuk struktur data simulasi
//Diinisialisasi oleh createNodes dan createWays
//Sumber data dari var nodes, ways leaflet-osm-customized.js
var sourceCells = [];
var sinkCells = [];
var sourceNodes = [];
var segments = [];
var cells = [];
var cellReceiveQueue = [];
var interCells = [];
var interNodes = [];
// var updatedCells = [];
var simulationTimer = {};
var featureMarkerGroup = {};
var globalAlert = "";
var globalI = 0;

//============================
//CONSTRUCTOR
//============================
function createSegment(way,startNode,endNode) {
	var segment = {
		way : way,
		nodes : [startNode, endNode],
		length : startNode.latLng.distanceTo(endNode.latLng),
		priority : way.wayClass, //diupdate sesuai kondisi lalu lintas. Nilai maks 4 karena ada 4 jenis klasifikasi kondisi lalu lintas
		defaultCells : [], //menampung cells yang ada
		alternateCells : [], //menampung cells untuk arah sebalik urutan nodes
		n : 0, //segment occupancy
		altn : 0,
		N : 0, //segment total capacity dari total seluruh cell, kapasitas cell * jumlah cell
		Q : 0,
		marker : L.polyline([startNode.latLng,endNode.latLng], {weight: way.wayClass*(1.75), color:"grey"}).addTo(mymap),
		altmarker : {},
		setPopup: function() {
			this.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
		},
		setCapacity : function() {
			for (var i = 0; i< this.defaultCells.length; i++) { //Capacity defaultCells
				this.N += this.defaultCells[i].N;
			}
		},
		setOccupancy: function() {
			//Akses n setiap cell, jumlahkan semua, dibagi total capacity
			//Return percentage
			var totalN = 0;
			for (var i = 0; i< this.defaultCells.length; i++) {
				totalN += this.defaultCells[i].n;
			}
			this.n = totalN;

			if (((this.n)/this.N)>0.7) {
				this.marker.setStyle({color:"red"});
			} else if (((this.n)/this.N)>0.5) {
				this.marker.setStyle({color:"orange"});
			} else if (((this.n)/this.N)>0){
				this.marker.setStyle({color:"#00bf01"});
			} else {
				this.marker.setStyle({color:"grey"});
			}


			if (this.alternateCells.length > 0) {
				totalN = 0;
				for (var i = 0; i< this.alternateCells.length; i++) {
					totalN += this.alternateCells[i].n;
				}
				this.altn = totalN;	
				if (((this.altn)/this.N)>0.7) {
					this.altmarker.setStyle({color:"red"});
				} else if (((this.altn)/this.N)>0.5) {
					this.altmarker.setStyle({color:"orange"});
				} else if (((this.altn)/this.N)>0){
					this.altmarker.setStyle({color:"#00bf01"});
				} else {
					this.altmarker.setStyle({color:"grey"});
				}

			} else {
				this.altn = 0;
			}
		},
		showPopup: function() {
			var strN = "",strQ= "",strR= "",strS= "",strn= "";
			str = "Segment Cap: "+this.N;
			strN+="<br>Cells: "+this.defaultCells.length+" N: "+this.defaultCells[0].N;
			strQ+=" Q: "+this.defaultCells[0].N;
			// strR+="<li>Cell R: ";
			// strS+="<li>Cell S: ";
			strn+="<br>Cell Def n: ";
			for (var i = 0; i< this.defaultCells.length; i++) {
				strn+=this.defaultCells[i].n+",";
			}

			strn+="<br>Cell Alt n: ";
			for (var i = 0; i< this.alternateCells.length; i++) {
				strn+=this.alternateCells[i].n+",";
			}

			str+=strN+strQ+strR+strS+strn;

			str+="<br>Def n: "+this.n;
			str+="<br>Alt n: "+this.altn;
			this.marker.setPopupContent(str, {closeOnClick: false, autoClose: false, autoPan: false});
		}
	}
	segment.setPopup();
	return segment;
}


function createCell(segment, avgVLength, clockTick, isIntersect) {
	var cellLength = Math.ceil((segment.way.tags["avgspeed"]*1000*(clockTick/3600)));
	var cellCapacity = Math.ceil((cellLength/avgVLength)*segment.way.wayClass);
	var segmentFlow = Math.ceil((((segment.length/avgVLength)*segment.way.wayClass)/(segment.length/segment.way.tags["avgspeed"]))/3);
	var cell = {
		segment : segment,
		dist : cellLength, //panjang cell
		isIntersect : false,
		isSink : false,
		isSource : false,
		isUpdated : false, //Penanda jika sudah diupdate yang kedua
		isFinal : false,
		nextCell : null, //.nextCell cell yang akan menerima transfer, bentuk linked list
		prevCell : null,
		N : cellCapacity, //Max Capacity, static, (length/avgVLength)*priority
		Q : cellCapacity, //Max Flow, static, Q max dihitung dari v/vehLength * lane (mungkin terdapat error di jumlah lane)
		receiveCap : 0, //Kemampuan tampung, N-(n-S)
		n : 0, //Occupancy, dynamic
		R : 0, //Receive Count, jumlah yang akan diterima, dynamic
		S : 0, //Send Count, jumlah yang akan ditransfer, dynamic
		setMaxFlow : function() {
			if (this.nextCell != null) {
				var maxFlow = Math.min(this.N, this.nextCell.N);
				this.nextCell.Q = maxFlow;
			} else {
				this.isSink = true;
			}
		},
		send : function() {
			//Akses.nextCell cell
			//Set jumlah Send cell ini, set jumlah Receive.nextCell Cell
			//Gunakan perhitungan seperti yang ada di referensi
			if (this.nextCell == null) { //sink cell
				this.S = this.n;
				cellReceiveQueue.push(this);
				// updatedCells.push(this);
			} else {
				if (!this.nextCell.isIntersect) {
					var emptySpace = this.nextCell.N-this.nextCell.n;
					var send = Math.min(emptySpace,this.nextCell.Q, this.n);
					// alert("Empty Space: "+emptySpace+".nextCellQ: "+nextCellQ+" send:"+send);

					this.S = send;
					//akses hanya ke nextCell, nilai receive diubah  setelah nilai sendnya fix
				 //Kalau intersection cell tidak perlu update S, si cell itu akan akses langsung this.n
				} else {
					// var sendQuota = Math.ceil((this.segment.priority/this.nextCell.sumInPriority)*this.nextCell.maxQ);
					// if (this.n >= sendQuota) {
					// 	this.S = sendQuota;	
					// } else {
						this.S = 0; //distribute yang akan ngeset
						// globalAlert +="send to intersect";
					// }
					
				}
			}
			
			//receiveCap di nextCell tidak diketahui, karena nilai nextCell.S belum tentu sudah diset
		},
		receive : function() {
			var currentCell = this;
			while (currentCell.prevCell!=null && !currentCell.isIntersect) {
				if (!currentCell.prevCell.isIntersect) {
					var newR = 0;
					currentCell.receiveCap = currentCell.N-(currentCell.n-currentCell.S);
					newR = Math.min(currentCell.receiveCap, currentCell.Q, currentCell.prevCell.n); //Send diperbarui sesuai dengan receiveCap curr yang sudah fix
					if (currentCell.nextCell == null) {
						currentCell.isFinal = true;
					} else {
						if (newR == currentCell.prevCell.S) {
							currentCell.prevCell.isFinal = true;
						} else {
							currentCell.prevCell.isFinal = false;
						}	
					}
					currentCell.R = newR;
					currentCell.prevCell.S = newR; //nearby.S sudah fix
					if (currentCell.prevCell == null) {
						cellReceiveQueue.push(currentCell);
					}
				} else {
					if (!currentCell.isFinal) {
						currentCell.prevCell.distribute(); //minta intersect buat distribute lagi
						//ketika distribute, akan nambah antrian receive lagi
					}
				}

				currentCell = currentCell.prevCell;
			}
		},
		update : function() {
			//Update n (occupancy)
			this.n -= this.S; //occupancy dikurangi S (send, yang dikirimkan ke cell selanjutnya)
			this.n += this.R; //occupancy ditambah R (receive, yang diterima dari cell sebelumnya)
			this.S = 0;
			this.R = 0;
		}
	}
	return cell;
}

function createInterCell(node) {
	/*
	############################
	KHUSUS UNTUK INTERSECT CELLS
	############################
	*/
	var cell = {
		node : node,
		outCells : [], //.nextCell cell yang akan menerima transfer, bentuk linked list
		inCells : [],
		maxQ : 0, //nilai Q max dari outCells inisialisasi, nanti akan berubah ketika disambungkan
		isIntersect : true,
		isFinal : false,
		isUpdated : true,
		maxDur : 30, //Maximum duration lampu hijau
		sumInPriority : 0, //index inCells yang kebagian jatah untuk transfer, index disesuaikan dengan priority
		sumOutPriority : 0,
		R : 0, //Receive Count, jumlah yang akan diterima, dynamic
		S : 0, //Send Count, jumlah yang akan ditransfer, dynamic
		init: function() {
			// var str = "inCells Id: ";
			this.maxQ = 0;
			for (var i = 0; i < this.inCells.length; i++) {
				this.sumInPriority += this.inCells[i].segment.priority;
				if (this.inCells[i].Q > this.maxQ) {
					this.maxQ = this.inCells[i].Q;
				}
				// str+= this.inCells[i].segment.way.id+",";
			}
			// str+="<br>outCells Id: ";
			//var str = "outCells: ";
			for (var i = 0; i < this.outCells.length; i++) {
				this.sumOutPriority += this.outCells[i].segment.priority;
				if (this.outCells[i].Q > this.maxQ) {
					this.maxQ = this.outCells[i].Q;
				}
				// str+= this.outCells[i].segment.way.id+",";
			}
			// this.node.marker.bindPopup(str, {closeOnClick: false, autoClose: false, autoPan: false});
		},
		distribute: function() {

			//Pastikan urutan outCells sesuai dengan prioritas, outCells pertama selalu dapat jatah terbanyak
			for (var i = this.inCells.length-1; i >= 0; i--) {
				var eachOutSumPriority = 0;

				for (var j = 0; j < this.outCells.length; j++) {
					if ( this.inCells[i].segment.way.id != this.outCells[j].segment.way.id) {
						eachOutSumPriority += this.outCells[j].segment.priority;
					}//sumPriority spesifik tiap outCells
				} //Dapat sum priority incells yang bisa kirim ke outcells
				var initialSend = this.inCells[i].n-this.inCells[i].S;
				for (var j = 0; j < this.outCells.length; j++) { //Initial distribute
					if ( this.inCells[i].segment.way.id != this.outCells[j].segment.way.id) {
						var currentOutCellReceive = 0;

						if (initialSend > 1) {
							currentOutCellReceive = Math.floor((initialSend) * (this.outCells[j].segment.priority/eachOutSumPriority));
						} else if (initialSend > 0) { //khusus kalau == 1
							currentOutCellReceive = this.inCells[i].n-this.inCells[i].S;	
						}
						globalAlert += "this.outCells["+j+"].n: "+(this.outCells[j].n)+" ";
						globalAlert += "this.outCells["+j+"].R: "+(this.outCells[j].R)+" ";
						globalAlert += "currentOutCellReceive: "+currentOutCellReceive+" ";


						if (this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S >= currentOutCellReceive) {
							globalAlert += "Enter Quota";
							this.inCells[i].S += currentOutCellReceive;
							this.outCells[j].R += currentOutCellReceive;
						} else {
							globalAlert += "Enter Remain";
							this.inCells[i].S += this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S;
							this.outCells[j].R += this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S;
						}
						globalAlert += ", R["+j+"]: "+this.outCells[j].R+"\n";
					}
				}
				// alert(str);

				var k = 0;
				var cont = false;
				var finish = false;
				var remain = this.inCells[i].n-this.inCells[i].S;

				while (remain>0 && !finish) {
					var remainDist = Math.floor(remain / (this.outCells[k].segment.priority/eachOutSumPriority));
					if (remainDist < 1) {
						remainDist = 0;
					}
					if (this.inCells[i].segment.way.id != this.outCells[k].segment.way.id) {
						if (this.outCells[k].N-this.outCells[k].n-this.outCells[k].R+this.outCells[k].S >= remainDist) {
							cont = cont || true;
							this.outCells[k].R += remainDist;
							this.inCells[i].S += remainDist;
						} else {
							cont = cont || false;
							this.inCells[i].S += this.outCells[k].N-this.outCells[k].n-this.outCells[k].R+this.outCells[k].S;
							this.outCells[k].R += this.outCells[k].N-this.outCells[k].n-this.outCells[k].R+this.outCells[k].S;
						}
					}
					var remain = this.inCells[i].n-this.inCells[i].S;
					k++;
					if (k == this.inCells.length) {
						if (!cont) { //hasil semua inCell false, semua sudah habis tidak bisa dikirim
							finish = true;
						} else {
							k=0;
						}
					}
				} //selesai jika semua inCells sudah habis (tidak bisa send) atau outCells sudah penuh
				cellReceiveQueue.push(this.inCells[i]);
			} //sebuah outCells sudah diisi berdasarkan inCells yang boleh mengisi, outCells mungkin masih sisa, inCells mungkin masih bisa kirim
		}
	}
	// cell.node.marker = L.marker(cell.node.latLng).addTo(mymap);
	return cell;
}

//Struktur untuk simulasi dibuat ulang disini
//Struktur untuk node ada di simulation-stucture.js sudah ditambahkan untuk simulasi
function createWaySegments(clockTick, avgVLength) { //Istansiasi
	sourceCells = [];
	sourceNodes = [];
	segments = [];
	cells = [];
	interCells = [];
	interNodes = [];
	//Variabel nodes dan ways sudah diinisialisasi saat set map
	/*
		deklarasi di simulation.js
		var nodes;
		var ways;
		*/
	//Struktur simulasi ways bisa menggunakan variabel ways langsung
	// alert("Ways Count: "+ways.length);
	clearNodeCells();
	for (var i = 0; i < ways.length; i++) { //instansiasi setiap road segment
		var sourceNode = ways[i].nodes[0];
		var sinkNode = ways[i].nodes[ways[i].nodes.length-1];
		var eachWay = ways[i];
		for (var j = 0; j < eachWay.nodes.length-1; j++) {
			var startNode = eachWay.nodes[j];
			var endNode = eachWay.nodes[j+1];
			var segment = createSegment(eachWay,startNode,endNode);
			
			//Instansiasi setiap cells, jumlah cells ditentukan dengan clock tick dan avgspeed
		
			var cellLength = Math.ceil((segment.way.tags["avgspeed"]*1000*(clockTick/3600)));
			var cellCount = Math.ceil(segment.length / cellLength); //kecepatan km/jam
			var cellCapacity = Math.ceil((cellLength/avgVLength)*segment.way.wayClass);
			//segment.N = cellCapacity*cellCount; //set max capacity of segment
			//Cell satu arah pertama
			for (var k = 0; k < cellCount; k++) {
				var cell = createCell(segment, avgVLength, clockTick, false);
				segment.defaultCells.push(cell);
				cells.push(cell); //by reference

			}
			//UNTUK AKOMODASI CUSTOM SOURCE CELL
			// segment.nodes[0].inCells = [];
			// segment.nodes[0].outCells = [];
			// segment.nodes[1].inCells = [];
			// segment.nodes[1].outCells = [];

			segment.nodes[0].outCells.push(segment.defaultCells[0]);
			segment.nodes[1].inCells.push(segment.defaultCells[segment.defaultCells.length-1]);

			segment.setCapacity(); //Set kapasitas maksimum sel, didapat dari total kapasitas sel
			//Push tiap segment ke way
			//Buat link antar cell, isi.nextCell dari defaultCells

			var k = 0;
			while (k< segment.defaultCells.length-1) {
				segment.defaultCells[k].nextCell = segment.defaultCells[k+1];
				segment.defaultCells[k+1].prevCell = segment.defaultCells[k];
				k++;
			}
			// Cell di ujung belum ada hubungan ke.nextCellnya, cell ujung nanti dihubungkan setelah semua segment diinstansiasi
			//Node di set inCells dan outCells untuk akomodasi set custom source node


			/*
			###########################################
			BUAT ALTERNATE CELLS
			###########################################
			*/

			//Cek jalan rayanya, kalau dua arah, cells diinstansiasi dua kali
			if (!segment.way.tags["oneway"]) {
				segment.altmarker = L.polyline([segment.nodes[0].latLng,segment.nodes[1].latLng], {weight: segment.way.wayClass*(1.75), color:"grey", offset: 5}).addTo(mymap);
				segment.marker.setOffset(-5);

				for (var k = 0; k < cellCount; k++) {
					var cell = createCell(segment, avgVLength, clockTick, false);
					segment.alternateCells.push(cell);
					cells.push(cell); //by reference
				}
				
				segment.nodes[0].inCells.push(segment.alternateCells[segment.alternateCells.length-1]);
				segment.nodes[1].outCells.push(segment.alternateCells[0]);

				k = 0;
				while (k< segment.alternateCells.length-1) {
					segment.alternateCells[k].nextCell = segment.alternateCells[k+1];
					segment.alternateCells[k+1].prevCell = segment.alternateCells[k];
					// segment.alternateCells[k].setMaxFlow();
					k++;
				}// Cell di ujung belum ada hubungan ke.nextCellnya, cell ujung nanti dihubungkan setelah semua segment diinstansiasi
			}
			//Push segment ke ways
			/*
			##########################
			PUSH SEGMENT KE SETIAP WAY
			##########################
			*/
			eachWay.segments.push(segment);
			segments.push(segment);
		}
	}
	/*
	########################################
	MENGHUBUNGKAN CELL ANTAR WAY
	########################################
	*/
	var intersectNodes = getIntersectionNodes().interNodes;
	var intermediateNodes = getIntermediateNodes().interNodes;
	// alert("Connect each Way, intermediate length: "+intermediate.length+" intersection length: "+intersect.length);
	for (var i = 0; i< intersectNodes.length; i++) {
		var interCell = createInterCell(intersectNodes[i]);
		for (var j = 0; j < intersectNodes[i].inCells.length; j++) {
			intersectNodes[i].inCells[j].nextCell = interCell;
		}
		for (var j = 0; j < intersectNodes[i].outCells.length; j++) {
			intersectNodes[i].outCells[j].prevCell = interCell;
			
		}
		interCell.inCells = intersectNodes[i].inCells;
		interCell.outCells = intersectNodes[i].outCells;
		interCell.init();
		interCells.push(interCell);
		interNodes.push(intersectNodes[i]);
	}

	for (var i = 0; i< intermediateNodes.length; i++) { //hubungkan intermediate node
		if (intermediateNodes[i].inCells.length == 1 && intermediateNodes[i].outCells.length == 1) {//jalan satu arah
			intermediateNodes[i].inCells[0].nextCell = intermediateNodes[i].outCells[0];
			intermediateNodes[i].outCells[0].prevCell = intermediateNodes[i].inCells[0];
		} else if (intermediateNodes[i].inCells.length == 2 && intermediateNodes[i].outCells.length == 2) { //jalan dua arah
			if (intermediateNodes[i].inCells[0].segment === intermediateNodes[i].outCells[0].segment) {

				intermediateNodes[i].inCells[0].nextCell = intermediateNodes[i].outCells[1];
				intermediateNodes[i].outCells[1].prevCell = intermediateNodes[i].inCells[0];
				intermediateNodes[i].inCells[1].nextCell = intermediateNodes[i].outCells[0];
				intermediateNodes[i].outCells[0].prevCell = intermediateNodes[i].inCells[1];
			} else {
				intermediateNodes[i].inCells[0].nextCell = intermediateNodes[i].outCells[0];
				intermediateNodes[i].outCells[0].prevCell = intermediateNodes[i].inCells[0];
				intermediateNodes[i].inCells[1].nextCell = intermediateNodes[i].outCells[1];
				intermediateNodes[i].outCells[1].prevCell = intermediateNodes[i].inCells[1];
			}
		}
		interNodes.push(intermediateNodes[i]);
	}

}


//=============================
//COMMON METHOD
//=============================

function clearNodeCells() {
	for (var i in nodes) {
		nodes[i].inCells = [];
		nodes[i].outCells = [];
	}
}

function sourceGenerate(generateValue) {
	//sourceCells variabel global
	for (var i = 0; i < sourceCells.length; i++) {
		if (sourceCells[i].N-(sourceCells[i].n-sourceCells[i].S)-sourceCells[i].R>=generateValue) {
			sourceCells[i].R += generateValue;
		} else {
			sourceCells[i].R += sourceCells[i].N-(sourceCells[i].n-sourceCells[i].S)-sourceCells[i].R;
		}
	}
	// alert("sourceNodes length: "+sourceNodes.length);
	for (var i = 0; i < sourceNodes.length; i++) {
		sourceNodes[i].marker.setPopupContent("Generate: "+generateValue, {closeOnClick: false, autoClose: false, autoPan: false});
	}
}

function findCells(nodeId) {
	var returnCells = [];
	for (var i=0; i<segments.length; i++) {
		if (nodeId == segments[i].nodes[0].id) {
			returnCells.push(segments[i].defaultCells[0]);
			
		} else if (nodeId == segments[i].nodes[1].id) {
			if (!segments[i].way.tags["oneway"]) { //Kalau dua arah
				returnCells.push(segments[i].alternateCells[0]);
			}
		}
	}
	// alert("Retrieved Cells Count: "+returnCells.length);
	return returnCells; //Sel-sel yang akan digenerate kendaraannya
}

function initInterCells() {
	for (var i = 0; i<interCells.length; i++) {
		interCells[i].init();
	}
}

function outOfBound(node) {
	var boundary = $("#boundary").val();
	var splitRes = boundary.split(",");
	// alert(parseFloat(splitRes[0])+","+parseFloat(splitRes[2])+", Node Val: "+node.latLng.lng+", check: "+(parseFloat(node.latLng.lng) < parseFloat(splitRes[0]) ||
	// 	parseFloat(node.latLng.lng) > parseFloat(splitRes[2]))+
	// 	"\n"+parseFloat(splitRes[1])+","+parseFloat(splitRes[3])+", Node Val: "+node.latLng.lat+", check: "+(node.latLng.lat < parseFloat(splitRes[1]) ||
	// 	node.latLng.lat > parseFloat(splitRes[3])));
	if ((node.latLng.lng < parseFloat(splitRes[0]) ||
		node.latLng.lng > parseFloat(splitRes[2])) ||
		(node.latLng.lat < parseFloat(splitRes[1]) ||
		node.latLng.lat > parseFloat(splitRes[3]))) {
		return true;
	} else {
		return false;
	}
}

function setDefaultSourceNodes() {
	sourceNodes = getDefaultSourceNodes().sourceNodes;
	for (var i = 0; i < sourceNodes.length; i++) {
		sourceNodes[i].marker = L.marker(sourceNodes[i].latLng).addTo(mymap);
	}
	
}

function setCustomSourceNode(latLng) {
	var nodeId = getNearestNodeId(latLng);
	nodes[nodeId].marker = L.marker(nodes[nodeId].latLng).addTo(mymap);
	// nodes[nodeId].marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
	sourceNodes.push(nodes[nodeId]);
	alert("Custom Source Node sudah ditambahkan");
}

function setSourceCells() {
	for (var j = 0; j < sourceNodes.length; j++) {
		sourceNodes[j].marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
		for(var i = 0; i<sourceNodes[j].outCells.length; i++) {
			sourceNodes[j].outCells[i].isSource = true;
			sourceCells.push(sourceNodes[j].outCells[i]);
		}
	}
}

function setSinkCells() {
	for (var i in nodes) {
		for (var j = 0; j < nodes[i].inCells.length; j++) {
			if (nodes[i].inCells[j].nextCell == null) {
				sinkCells.push(nodes[i].inCells[j]);
			}
		}
	}
	alert("Sink Cells Length: "+sinkCells.length);
}

function drawNodeCircleMarkers() {
	var featureMarkerArr = [];
	for (var i in nodes) {
		var circleMarker = L.circleMarker(nodes[i].latLng,{color: "#2c46a3", fillColor: "#ccc", fillOpacity: 1});
		featureMarkerArr.push(circleMarker);
	}
	featureMarkerGroup = L.layerGroup(featureMarkerArr).addTo(mymap);
	
}
//===============================
//GETTER
//===============================
var nearestNodeMarker = {};
function getNearestNodeId(latLng) {
	//nodes sudah tersedia
	//inisialisasi
	//cari minimumdistance, buat objek latLng
	var firstKey = Object.keys(nodes)[0];
	var minDistance = 9999999999;
	var nearestNode = null;//nearest Node
	var nearestLatLng;

	for (var idx in nodes) {
		var distance  = latLng.distanceTo(nodes[idx].latLng);
		if (distance < minDistance) {
			minDistance = distance;
			nearestNode = nodes[idx];
		}
	}
	return nearestNode.id;
}

function showNearestNode(latLng) {
	var nodeId = getNearestNodeId(latLng);

	var message = "Posisi Click: "+latLng+"\nNearest Node Id: "+nodes[nodeId].id+"\nPosisi Node"+nodes[nodeId].latLng+"\nJarak: "+
	nodes[nodeId].latLng.distanceTo(latLng)+" meter\n";
	message+= "Incoming Ways Ids: ";
	for (var i=0; i<nodes[nodeId].inWays.length; i++) {
		var way = nodes[nodeId].inWays[i].id;
		message+=way+", ";
	}
	message+= "\n";
	message+= "Outcoming Ways Ids: ";
	for (var i=0; i<nodes[nodeId].outWays.length; i++) {
		var way = nodes[nodeId].outWays[i].id;
		message+=way+", ";
	}
	message+= "\n";
	message+= "Incoming Cells: "+nodes[nodeId].inCells.length;
	message+= "\n";
	message+= "Incoming Cells Next: ";
	for (var i=0; i<nodes[nodeId].inCells.length; i++) {
		var cell = nodes[nodeId].inCells[i].nextCell;
		message+=cell+", ";
	}
	message+= "\n";
	message+= "Outcoming Cells: "+nodes[nodeId].outCells.length;
	message+= "\n";
	message+= "outOfBound: "+outOfBound(nodes[nodeId]);
	alert(message);
	nodes[nodeId].marker = L.marker(nodes[nodeId].latLng).addTo(mymap);
	nearestNodeMarker = nodes[nodeId].marker;
}

function getIntersectionNodes() {
	var markers = [];
	var intersectionNodes = [];
	for (var idx in nodes) {
		var node = nodes[idx];
		if ((node.inCells.length + node.outCells.length) > 2) { //Cari intersection node
			if ((node.inCells.length + node.outCells.length) == 4) {

				if (node.inCells.length == 2 && node.outCells.length == 2) { //2 Jalan dua arah
					if (node.inWays.length + node.outWays.length == 1 || node.inWays.length + node.outWays.length > 2) {
						//node.inWays.length + node.outWays.length == 1, kasus khusus persimpangan tetapi terhubung dengan tengah-tengah jalan
						//jadi hanya diketahui 1 incoming atau outcoming way
						intersectionNodes.push(node);
						markers.push(L.marker(node.latLng));		
					}
				} else {
					intersectionNodes.push(node);
					markers.push(L.marker(node.latLng));	
				}
			} else {
				intersectionNodes.push(node);
				markers.push(L.marker(node.latLng));
			}		
		}
	}
	var result = {};
	result.interNodes = (intersectionNodes);
	result.markers = (markers);
	return result;
}

function getIntermediateNodes() { //intermediate dan intersection
	var markers = [];
	var intermediateNodes = [];
	for (var idx in nodes) {
		var node = nodes[idx];
		if ((node.inCells.length + node.outCells.length) == 2) { //Cari intermediate node
			if (node.inCells.length == 1 && node.outCells.length == 1) { //Jalan satu arah
				if (node.inWays.length+node.outWays.length != 1) { //di ujung
					intermediateNodes.push(node);
					markers.push(L.marker(node.latLng));	
				}
			}
		} else if (node.inCells.length + node.outCells.length == 4) {

			if (node.inCells.length == 2 && node.outCells.length == 2) { //Jalan dua arah
				if (node.inWays.length + node.outWays.length == 0 || node.inWays.length + node.outWays.length == 2) { //di tengah-tengah jalan
					intermediateNodes.push(node);
					markers.push(L.marker(node.latLng));		
				}
			}
		}
	}
	var result = {};
	result.interNodes = (intermediateNodes);
	result.markers = (markers);
	return result;
}

function getDefaultSourceNodes() {
	var markers = [];
	var nodesArr = [];

	for (var i = 0; i<ways.length; i++) { //cari way yang ujung2nya di luar boundary
		if (outOfBound(ways[i].nodes[0]) || outOfBound(ways[i].nodes[ways[i].nodes.length-1])) {
			//Cari di dalam validNodes, kalau belum ada, tambahkan
			var outerNode = {};
			if (outOfBound(ways[i].nodes[0])) { //pasti salah satu antara nodes[0] atau lainnya
				outerNode = ways[i].nodes[0];
			} else {
				outerNode = ways[i].nodes[ways[i].nodes.length-1];
			}
			var j = 0;
			var validOuterNode = false;
			if (outerNode.outCells.length > 0) {
				validOuterNode = true;
			}
			//cari di validNodes
			if (validOuterNode) {
				var found = false;
				
				//sourceNodes global variable
				while (j<sourceNodes.length && !found) {
					if (outerNode === sourceNodes[j]) {
						found = true;
					}
					j++;
				}
				if (!found) {
					markers.push(L.marker(outerNode.latLng).addTo(mymap));
					// outerNode.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
					nodesArr.push(outerNode);
				}
			}
		}
	}


	var result = {};
	result.sourceNodes = nodesArr;
	result.markers = markers;
	return result;
}

function closeAllSegmentPopup() {
	for (var i = 0; i<segments.length; i++) {
		segments[i].marker.closePopup();
	}
}


//Memperoleh Node-Node batas yang akan generate kendaraan

//Menjalankan simulasi menggunakan timer
function runSimulation() {
	mymap.removeLayer(initialLayer);
	var clockTick = parseInt($("#clockTick").val()); //satuan detik (second)
	var avgVLength = parseInt($("#vLength").val());
	var clock = 1;
	var intValue = $("#simV").val()*1000;
	createWaySegments(clockTick, avgVLength); //Instansiasi segments dan cells
	drawNodeCircleMarkers();
	/*
	SET SOURCE NODES
	1. Cek apakah user pilih setDefaultSource di chekcbox
	2. Kalau iya, source nodes = source nodes dari user + default nodes
		Source nodes user mungkin kosong, jadi tetap default nodes
	3. Kalau tidak, source nodes = source nodes dari user
		Source nodes user mungkin kosong, jadi tetap default nodes
		*/
	// alert($("#setDefaultSource").val());
	if ($("#setDefaultSource").is(":checked")) {
		setDefaultSourceNodes();
	}
	setSourceCells();
	setSinkCells();
	initInterCells();
	closeAllSegmentPopup();
	// findFirstAccessIntercell();
	var vehicleGen = parseInt($("#vehicleGen").val());
	// sourceGenerate(vehicleGen);
	document.getElementById("wayCount").innerHTML = ways.length;
	document.getElementById("segmentCount").innerHTML = segments.length;
	document.getElementById("cellCount").innerHTML = cells.length;
	document.getElementById("intersectCount").innerHTML = interCells.length;
	// alert("Source cell: "+sourceCells.length);
	// alert("out?");
	simulationTimer = setInterval(function() {
		vehicleGen = parseInt($("#vehicleGen").val());
		

		//Set nilai send berdasarkan emptyspace
		for (var i = 0; i<cells.length; i++) {
			cells[i].send();
		}

		//Set status isFinal, penanda jika receiveCap dan send sudah fix
		// for (var i = 0; i<cells.length; i++) {
		// 	cells[i].statUpdate();
		// }

		//Set nilai send dan receiveCap yang belum final, akses mundur dari masing-masing cell final
		globalAlert = "";
		// globalAlert+="InterCells length:"+interCells.length+"\n";
		// alert("out?");
		globalAlert+="Enter distribute\n";
		for (var i = 0; i<interCells.length; i++) {
			interCells[i].distribute();
			globalI = i;
		}
		globalAlert+="exit distribute\n";

		// alert(globalAlert);

		// for (var i = 0; i<cells.length; i++) {
		// 	cells[i].receive();
		// }

		while (cellReceiveQueue.length > 0) {
			var shiftedCell = cellReceiveQueue.shift(); //jadi semacam queue
			shiftedCell.receive();
		}


		sourceGenerate(vehicleGen);
		// alert("update");	//Update kendaraan
		for (var i = 0; i<cells.length; i++) {
			cells[i].update();
		}
		
		
		// alert("show");
		for (var i = 0; i<segments.length; i++) {

			segments[i].setOccupancy();
			segments[i].showPopup();
		}
		document.getElementById("timer").innerHTML = clock;
		clock++;
	}, intValue);
}

function stopSimulation() {
	circleMarkerGroup.removeFrom(mymap);
	clearInterval(simulationTimer);
}