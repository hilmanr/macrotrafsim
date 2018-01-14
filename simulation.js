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
var bottleNeckNodes = [];
var simulationTimer = {};
var featureMarkerGroup = {};
var segmentFeatureGroup = {};
var segmentFeatureArr = [];
var globalAlert = "";
var globalEditStat = 0;

//============================
//CONSTRUCTOR
//============================

function clearSegments(way) {
	for (var i = 0 ; i < way.segments.length; i++) {
		way.segments[i].marker.removeFrom(mymap);
		if (way.segments[i].markerDecorator != null) {
			way.segments[i].markerDecorator.removeFrom(mymap);	
		}
		if (way.segments[i].altmarker != null) {
			way.segments[i].altmarker.removeFrom(mymap);	
		}
		if (way.segments[i].altmarkerDecorator != null) {
			way.segments[i].altmarkerDecorator.removeFrom(mymap);	
		}
		way.segments[i] = null;
	}
	way.segments = [];
}

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
		marker : L.polyline([startNode.latLng,endNode.latLng], {weight: way.wayClass*(2), color:"grey"}).addTo(mymap),
		markerDecorator : null, //untuk gambar panah
		altmarker : null,
		altmarkerDecorator : null, //untuk gambar panah
		setMarker: function() {
			// this.marker.openPopup();
			this.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});
			if (!way.tags["oneway"]) { //jalan dua arah
				this.marker.setOffset(-6);
				this.altmarker = L.polyline([endNode.latLng,startNode.latLng], {weight: way.wayClass*(2), color:"grey", offset: -6}).addTo(mymap);
				this.altmarker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});
			} else { //Jalan satu arah, buat gambar panah
				this.markerDecorator = L.polylineDecorator(this.marker, {
					patterns: [
						{offSet:0,repeat:'50%', symbol: L.Symbol.arrowHead({pixelSize: 10, polygon: false, pathOptions: {stroke: true}})}
					]
				}).addTo(mymap);
				
			}
		},
		setPopup: function() {
			
			if (this.altmarker != null) {
				this.altmarker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});	
			}
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
				if (this.way.editStat != 0) {
					this.marker.setStyle({color:"purple"});
				} else {
					this.marker.setStyle({color:"grey"});
				}
				
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
					if (this.way.editStat != 0) {
						this.altmarker.setStyle({color:"purple"});
					} else {
						this.altmarker.setStyle({color:"grey"});
					}
				}

			} else {
				this.altn = 0;
			}
		},
		showPopup: function() {
			var str = "Segment Cap: "+this.N;
			str +="<br>Cells: "+this.defaultCells.length+" N: "+this.defaultCells[0].N;
			str +=" Q: "+this.defaultCells[0].N;
			str +="<br>Cell Def n: ";
			for (var i = 0; i< this.defaultCells.length; i++) {
				str +=this.defaultCells[i].n+",";
			}
			str+="<br>Def n: "+this.n;
			this.marker.setPopupContent(str, {closeOnClick: false, autoClose: false, autoPan: false});

			if (this.alternateCells.length>0) {
				var str2 = "Segment Cap: "+this.N;
				str2 +="<br>Cells: "+this.alternateCells.length+" N: "+this.alternateCells[0].N;
				str2 +=" Q: "+this.alternateCells[0].N;
				str2 +="<br>Cell Alt n: ";
				for (var i = 0; i< this.alternateCells.length; i++) {
					str2 +=this.alternateCells[i].n+",";
				}
				str2 +="<br>Alt n: "+this.altn;
				this.altmarker.setPopupContent(str2, {closeOnClick: false, autoClose: false, autoPan: false});				
			}
		}
	}
	segment.setMarker();
	// segment.marker.on("click", segment.defaultMarkerFunction());
	return segment;
}


function createCell(segment, avgVLength, clockTick) {
	var cellLength = Math.ceil((segment.way.tags["avgspeed"]*1000*(clockTick/3600)));
	var cellCapacity = Math.ceil((cellLength/avgVLength)*segment.way.wayClass);
	var segmentFlow = Math.ceil((((segment.length/avgVLength)*segment.way.wayClass)/(segment.length/segment.way.tags["avgspeed"]))/3);
	var cell = {
		segment : segment,
		dist : cellLength, //panjang cell
		type : "", //def atau alt
		isIntersect : false,
		isSink : false,
		isSource : false,
		isUpdated : false, //Penanda jika sudah diupdate yang kedua
		isFinal : false,
		nextCell : null, //.nextCell cell yang akan menerima transfer, bentuk linked list
		prevCell : null,
		N : cellCapacity, //Max Capacity, static, (length/avgVLength)*priority
		Q : cellCapacity, //Max Flow, static, Q max dihitung dari v/vehLength * lane (mungkin terdapat error di jumlah lane)
		currentQ : cellCapacity,
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
					var send = Math.min(emptySpace,this.nextCell.currentQ, this.n);
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
					newR = Math.min(currentCell.receiveCap, currentCell.currentQ, currentCell.prevCell.n); //Send diperbarui sesuai dengan receiveCap curr yang sudah fix
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
						currentCell.prevCell.distributeBasedOnRandomTrajectory(); //minta intersect buat distribute lagi
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
				if (this.inCells[i].currentQ > this.maxQ) {
					this.maxQ = this.inCells[i].currentQ;
				}
				// str+= this.inCells[i].segment.way.id+",";
			}
			// str+="<br>outCells Id: ";
			//var str = "outCells: ";
			for (var i = 0; i < this.outCells.length; i++) {
				this.sumOutPriority += this.outCells[i].segment.priority;
				if (this.outCells[i].currentQ > this.maxQ) {
					this.maxQ = this.outCells[i].currentQ;
				}
				// str+= this.outCells[i].segment.way.id+",";
			}
			// this.node.marker.bindPopup(str, {closeOnClick: false, autoClose: false, autoPan: false});
		},
		distributeFluidBasedOnPriority: function() {

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
					var remainDist = Math.floor(remain * (this.outCells[k].segment.priority/eachOutSumPriority));
					if (remainDist < 1) {
						remainDist = 1;
					}
					if (this.inCells[i].segment.way.id != this.outCells[k].segment.way.id) {
						if (this.outCells[k].N-this.outCells[k].n-this.outCells[k].R+this.outCells[k].S > remainDist) {
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
					if (k == this.outCells.length) {
						if (!cont) { //hasil semua inCell false, semua sudah habis tidak bisa dikirim
							finish = true;
						}
						cont = false;
						k=0;
					}
					// alert("Stuck here? Cont = "+cont+" remain = "+remain+" k = "+k);
				} //selesai jika semua inCells sudah habis (tidak bisa send) atau outCells sudah penuh
				cellReceiveQueue.push(this.inCells[i]);
			} //sebuah outCells sudah diisi berdasarkan inCells yang boleh mengisi, outCells mungkin masih sisa, inCells mungkin masih bisa kirim
		},
		distributeBasedOnRandomTrajectory: function() {
			//Distribusi berdasarkan tujuan kendaraan dari inCells
			//Kendaraan-kendaraan memiliki tujuannya masing-masing (lurus atau belok), misalnya pengguna jalan mau pergi ke sekolah, jadi dia akan lurus/belok
			//Jumlah kendaraan yang lurus atau belok dari inCells ditentukan dengan jumlah peluang. Di fungsi ini peluang ditentukan random


			//Generate random variable
			for (var i = 0; i<this.inCells.length; i++) {
				var portion = 0;
				var outCellsProbsLength = 0;
				if ((this.inCells[i].segment.way.tags["oneway"] && this.inCells[i].segment.way.editStat == 0) ||
					this.inCells[i].segment.way.editStat == 1 || this.inCells[i].segment.way.editStat == 2) {
					portion = 100/this.outCells.length;
					outCellsProbsLength = this.outCells.length;
				} else {
					portion = 100/(this.outCells.length-1);
					outCellsProbsLength = this.outCells.length-1;
				}
					
				var sum = 0;
				var adjust = 0;
				var outCellsProbs = [];
				for (var j = 0; j < outCellsProbsLength; j++) {
					var eachProb = Math.random()*portion;
					outCellsProbs.push(eachProb);
					sum+= eachProb;
				}
				//outCellsProbs sudah diisi sama masing-masing random probnya
				var outCellsProbsCheck = "";
				adjust = 1/sum;
				for (var j = 0; j < outCellsProbs.length; j++) {
					outCellsProbs[j] = outCellsProbs[j]*adjust; //nilainya sudah disesuaikan dengan total proporsi 100%
					outCellsProbsCheck += outCellsProbs[j]+"\n";
				} //Sum total semua seharusnya menjadi 100%
				//probabiliti siap digunakan untuk setiap outCells
				//Distribute setiap outCells
				// alert(outCellsProbsCheck);
				var remain = this.inCells[i].n - this.inCells[i].S;
				var k = 0;
				for (var j = 0; j < this.outCells.length; j++) { //index outCells sama dengan index outCellsProbs
					if (!(this.outCells[j].segment.way === this.inCells[i].segment.way)) {
						var eachOutReceive = Math.floor(outCellsProbs[k]*(remain));
						if (this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S >= eachOutReceive) {
							this.outCells[j].R += eachOutReceive;
							this.inCells[i].S += eachOutReceive;
						} else {
							this.inCells[i].S += this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S;
							this.outCells[j].R += this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S;
						}
						k++;
					}
					
				}

				remain = this.inCells[i].n - this.inCells[i].S;
				var finish = false;
				var cont = false;
				var j = 0;
				k = 0;
				while (remain > 0 && !finish) {
					if (!(this.outCells[j].segment.way === this.inCells[i].segment.way)) {
						var eachOutRemainReceive = Math.floor(outCellsProbs[k]*remain);
						if (eachOutRemainReceive < 1) {
							eachOutRemainReceive = 1;
						}

						if (this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S > eachOutRemainReceive) {
							cont = cont || true;
							this.outCells[j].R += eachOutRemainReceive;
							this.inCells[i].S += eachOutRemainReceive;
						} else {
							cont = cont || false;
							this.inCells[i].S += this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S;
							this.outCells[j].R += this.outCells[j].N-this.outCells[j].n-this.outCells[j].R+this.outCells[j].S;
						}

						remain = this.inCells[i].n - this.inCells[i].S;
						k++;

						if (k == outCellsProbsLength) {
							k = 0;
						}
					}
					j++;

					if (j == this.outCells.length) {
						if (!cont) {
							finish = true;
						} else {
							j = 0;
							cont = false;	
						}
					}
				}
				cellReceiveQueue.push(this.inCells[i]);
			}
		}
	}
	// cell.node.marker = L.marker(cell.node.latLng).addTo(mymap);
	return cell;
}

//Struktur untuk simulasi dibuat ulang disini
//Struktur untuk node ada di simulation-stucture.js sudah ditambahkan untuk simulasi
function createWaySegments(clockTick, avgVLength) { //Istansiasi
	sourceCells = [];
	// sourceNodes = [];
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

	clearNodeCells();
	for (var i = 0; i < ways.length; i++) { //instansiasi setiap road segment
		var sourceNode = ways[i].nodes[0];
		var sinkNode = ways[i].nodes[ways[i].nodes.length-1];
		var eachWay = ways[i];
		clearSegments(ways[i]); //menghapus segment untuk memastikan marker dan segmen konsisten
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
				var cell = createCell(segment, avgVLength, clockTick);
				cell.type = "def";
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
				

				for (var k = 0; k < cellCount; k++) {
					var cell = createCell(segment, avgVLength, clockTick);
					cell.type = "alt";
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
			// segment.setPopup();
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
		intersectNodes[i].isIntersect = true;
		var interCell = createInterCell(intersectNodes[i]);
		intersectNodes[i].intersectCell = interCell;
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
		intermediateNodes[i].isIntermediate = true;
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
		var effGen = generateValue;
		var str = "";
		for (var j = 0; j < sourceNodes[i].outCells.length; j++) {
			if (sourceNodes[i].outCells[j].currentQ < effGen) {
				effGen = sourceNodes[i].outCells[j].currentQ;
			}
			str += "outCells["+i+"] Gen: "+effGen+"<br>";
		}
		sourceNodes[i].marker.setPopupContent("Generate: "+generateValue+"<br>"+str, {closeOnClick: false, autoClose: false, autoPan: false});
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
	sourceNodes = sourceNodes.concat(getDefaultSourceNodes().sourceNodes);
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
		// sourceNodes[j].isSource = true;
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
				nodes[i].isSink = true;
				sinkCells.push(nodes[i].inCells[j]);
			}
		}
	}
	// alert("Sink Cells Length: "+sinkCells.length);
}

function drawNodeCircleMarkers() {
	var featureMarkerArr = [];
	for (var i in nodes) {
		nodes[i].circleMarker = L.circleMarker(nodes[i].latLng,{color: "#2c46a3", fillColor: "#ccc", fillOpacity: 1});
		featureMarkerArr.push(nodes[i].circleMarker);
	}
	featureMarkerGroup = L.layerGroup(featureMarkerArr).addTo(mymap);
	
}
//===============================
//
//===============================
var nearestNodeMarker = {};
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
					//markers.push(L.marker(outerNode.latLng).addTo(mymap));
					// outerNode.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
					outerNode.isSource = true;
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

function closeAllSegmentPopup() {
	for (var i = 0; i<segments.length; i++) {
		segments[i].marker.closePopup();
		if (!segments[i].way.tags["oneway"]) {
			segments[i].altmarker.closePopup();
		}
	}
}

function openAllSegmentPopup() {
	for (var i = 0; i<segments.length; i++) {
		segments[i].setPopup();
	}
}

/*
#########################################################
SET BOTTLENECK NODE
#########################################################
*/


function setBottleNeckNode(latLng) {
	var nodeId = getNearestNodeId(latLng);
	//set nilai currentQ, ubah fill nodes jadi warna merah, kemudian bind popup
	nodes[nodeId].circleMarker.setStyle({fillColor: "red"});
	var str = "";
	for (var i = 0; i < nodes[nodeId].inCells.length; i++) {
		nodes[nodeId].inCells[i].currentQ = Math.floor(nodes[nodeId].inCells[i].Q * ((100-parseInt($("#bottleNeckV").val()))/100)); //set bottleneck
		str += "inCells["+i+"] Q: "+nodes[nodeId].inCells[i].Q+" current Q: "+nodes[nodeId].inCells[i].currentQ+"<br>";
	}
	
	nodes[nodeId].circleMarker.bindPopup("Bottleneck Value: "+$("#bottleNeckV").val()+"%<br>"+str, {closeOnClick: false, autoClose: false, autoPan: false}).openPopup();	
	
	bottleNeckNodes.push(nodes[nodeId]);
	alert("Bottleneck Berhasil di Set");
}

function updateBottleNeckVal() {
	var str = "";
	for (var i = 0; i < bottleNeckNodes.length; i++) {
		for (var j = 0; j < bottleNeckNodes[i].inCells.length; j++) {
			bottleNeckNodes[i].inCells[j].currentQ = Math.floor(bottleNeckNodes[i].inCells[j].Q * ((100-parseInt($("#bottleNeckV").val()))/100)); //set bottleneck
			str += "inCells["+j+"] Q: "+bottleNeckNodes[i].inCells[j].Q+" current Q: "+bottleNeckNodes[i].inCells[j].currentQ+"<br>";
		}
		bottleNeckNodes[i].circleMarker.setPopupContent("Bottleneck Value: "+$("#bottleNeckV").val()+"%<br>"+str, {closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
	}
}

function clearBottleNeckNodes() {
	for (var i = 0; i < bottleNeckNodes.length; i++) {
		bottleNeckNodes[i].circleMarker.setStyle({fillColor: "#ccc"});
		bottleNeckNodes[i].circleMarker.closePopup();
		bottleNeckNodes[i].circleMarker.unbindPopup();
		for (var j = 0; j < bottleNeckNodes[i].inCells.length; j++) {
			bottleNeckNodes[i].inCells[j].currentQ = bottleNeckNodes[i].inCells[j].Q; //reset nilai Q nya
		}
	}
}

/*
#########################################################
EDIT JARINGAN JALAN
#########################################################
*/

function connectedNodes(node1,node2) {
	var result = {found: false, routes: [], mode : 0};
	for (var i = 0; i<node1.inCells.length && !result.found; i++) {
		var currentCell = node1.inCells[i];
		var currentNode = node1;
		var currentWay = node1.inCells[i].segment.way;
		var eachCellMode = "";
		var cont = true;
		while (cont && !result.found) {
			currentWay = currentCell.segment.way;
			if (currentCell.type == "def") {
				eachCellMode = "def";
				currentNode = currentCell.segment.way.nodes[0];
			} else {
			 	eachCellMode = "alt";
			 	currentNode = currentCell.segment.way.nodes[currentCell.segment.way.nodes.length-1];
			}
			if (currentNode.id == node2.id) { //found
				result.found = true;
				var route = {way:currentWay, mode: ""};
				if (currentWay.editStat == 0) { //kondisi belum di edit
					if (currentWay.tags["oneway"]) { //kondisi awal satu arah
						result.mode = 2; //diubah ke 2 arah
					} else { //kondisi awal 2 arah
						result.mode = 1; //diubah ke 1 arah dengan arah sesuai mode masing2 way
					}
				} else if (currentWay.editStat == 1 || currentWay.editStat == 2) { //kondisi awal satu arah
					result.mode = 2; //ubah ke dua arah
				} else if (currentWay.editStat == 3) {//kondisi jalan 2 arah hasil editing
					result.mode = 1; //diubah ke 1 arah dengan arah sesuai mode masing-masing way
				}
				if (eachCellMode == "def") {
					route.mode = "alt";
				} else {
					route.mode = "def";
				}
				// alert("route.mode found in: "+route.mode);
				result.routes.push(route);
			} else { //tidak ketemu
				if (currentNode.isIntersect || currentNode.isSource || currentNode.isSink) { //hentikan pencarian, tidak ketemu di titik itu
					cont = false;
					result.routes = [];
				} else if (currentNode.isIntermediate) { //lanjut pencarian
					var route = {way:currentWay, mode: ""};
					if (eachCellMode == "def") { //cell yang dipilih sekarang adalah defaultCells
						for (var j = 0; j < currentNode.inCells.length; j ++) {
							if (currentNode.inCells[j].segment.way.id != currentWay.id) {
								//ini yang dipilih
								currentCell = currentNode.inCells[j];
							}
						}
						route.mode =  "alt";
						
					} else if (eachCellMode == "alt") {
						for (var j = 0; j < currentNode.outCells.length; j ++) {
							if (currentNode.outCells[j].segment.way.id != currentWay.id) {
								//outi yang dipilih
								currentCell = currentNode.outCells[j];
							}
						}
						route.mode =  "def";
					}
					result.routes.push(route);
				}
			}
		}
	}

	if (!result.found) { //cari di outcells
		// alert("enter here");
		for (var i = 0; i<node1.outCells.length && !result.found; i++) {
			var currentCell = node1.outCells[i];
			var currentNode = node1;
			var currentWay = node1.outCells[i].segment.way;
			var eachCellMode = "";
			var cont = true;
			while (cont && !result.found) {
				currentWay = currentCell.segment.way;
				if (currentCell.type == "def") {
					eachCellMode = "def";
					currentNode = currentCell.segment.way.nodes[currentCell.segment.way.nodes.length-1];
				} else {
				 	eachCellMode = "alt";
				 	currentNode = currentCell.segment.way.nodes[0];
				}
				if (currentNode.id == node2.id) { //found
					// alert("enter found");
					result.found = true;
					var route = {way:currentWay, mode: ""};
					if (currentWay.editStat == 0) { //kondisi belum di edit
						if (currentWay.tags["oneway"]) { //kondisi awal satu arah
							// alert("enter here 2");
							result.mode = 2; //diubah ke 2 arah
						} else { //kondisi awal 2 arah
							result.mode = 1; //diubah ke 1 arah dengan arah sesuai mode masing2 way
						}
					} else if (currentWay.editStat == 1 || currentWay.editStat == 2) { //kondisi awal satu arah
						result.mode = 2; //ubah ke dua arah
					} else if (currentWay.editStat == 3) {//kondisi jalan 2 arah hasil editing
						result.mode = 1; //diubah ke 1 arah dengan arah sesuai mode masing-masing way
					}
					route.mode = eachCellMode;
					// alert("route.mode found out: "+route.mode);
					result.routes.push(route);
				} else { //tidak ketemu
					if (currentNode.isIntersect || currentNode.isSource || currentNode.isSink) { //hentikan pencarian, tidak ketemu di titik itu
						cont = false;
						result.routes = [];
					} else if (currentNode.isIntermediate) { //lanjut pencarian
						var route = {way:currentWay, mode: eachCellMode};
						if (eachCellMode == "def") { //cell yang dipilih sekarang adalah defaultCells
							for (var j = 0; j < currentNode.inCells.length; j ++) {
								if (currentNode.inCells[j].segment.way.id != currentWay.id) {
									//ini yang dipilih
									currentCell = currentNode.inCells[j];
								}
							}
						} else if (eachCellMode == "alt") {
							for (var j = 0; j < currentNode.outCells.length; j ++) {
								if (currentNode.outCells[j].segment.way.id != currentWay.id) {
									//outi yang dipilih
									currentCell = currentNode.outCells[j];
								}
							}
						}
						result.routes.push(route);
					}
				}
			}
		}
	}
	return result;
}

function editToTwoWay(routes) {
	//parameter input refer ke routes yang ada di connectedNodes
	if (routes[0].way.editStat == 0) {
		for (var i = 0; i < routes.length; i++) {
			var mode = routes[i].mode;
			var way = routes[i].way;
			way.editStat = 3;

			// alert("segment length: "+way.segments.length);
			for (var j = 0; j < way.segments.length; j++) {
				var segment = way.segments[j];	
				//buat alt cell di masing-masing segment
				for (var k = 0; k < segment.defaultCells.length; k++) {
					var cell = createCell(segment, parseInt($("#vLength").val()), parseInt($("#clockTick").val()));
					cell.type = "alt";
					segment.alternateCells.push(cell);
					cells.push(cell); //by reference
				}

				way.segments[j].nodes[1].outCells.push(way.segments[j].alternateCells[0]);
				way.segments[j].nodes[0].inCells.push(way.segments[j].alternateCells[way.segments[j].alternateCells.length-1]);

				var k = 0;
				while (k< segment.alternateCells.length-1) {
					segment.alternateCells[k].nextCell = segment.alternateCells[k+1];
					segment.alternateCells[k+1].prevCell = segment.alternateCells[k];
					k++;
				} //alternate cell sudah disambung di segmen
				//Edit marker jalan
				segment.markerDecorator.removeFrom(mymap);
				segment.marker.setOffset(-6);
				segment.marker.setStyle({color: "purple"});
				rectangleBound.bringToBack();
				segment.altmarker = L.polyline([segment.nodes[1].latLng,segment.nodes[0].latLng], {weight: way.wayClass*(2), color:"purple", offset: -6}).addTo(mymap);
				segment.altmarker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});
				segment.nodes[0].circleMarker.bringToFront();
				segment.nodes[1].circleMarker.bringToFront();
				//marker sudah dibuat
			}

			for (var j = 0; j < way.segments.length-1; j++) {
				var segment1 = way.segments[j];
				var segment2 = way.segments[j+1];
				segment1.alternateCells[0].prevCell = segment2.alternateCells[segment2.alternateCells.length-1]; 
				segment2.alternateCells[segment2.alternateCells.length-1].nextCell = segment1.alternateCells[0]; 
			} //sisa di ujung2 jalan yang belum

			if (way.nodes[0].isIntersect) {
				way.segments[0].alternateCells[way.segments[0].alternateCells.length-1].nextCell = way.segments[0].nodes[0].intersectCell;
			}

			if (way.nodes[way.nodes.length-1].isIntersect) {
				way.segments[way.segments.length-1].alternateCells[0].prevCell = way.segments[0].nodes[0].intersectCell;
			}

			// hubungkan ujung2 jalannya
			//alternate cells sudah dibuat dan dihubungkan
			//marker jalan sudah dibuat
		}
		//menghubungkan cell antar way
	}
	else if (routes[0].way.editStat == 1) { //1 arah def hasil edit
		//sudah punya alt cell tapi tidak tersambung
		//hubungkan di ujung2 jalan saja
		for (var i = 0; i < routes.length-1; i++) {
			var way1 = routes[i].way;
			var way2 = routes[i+1].way;
			if (routes[i].mode == "def") {
				way1.segments[way1.segments.length-1].alternateCells[0].prevCell = way2.segments[0].alternateCells[way2.segments[0].alternateCells.length-1];
				way2.segments[0].alternateCells[way2.segments[0].alternateCells.length-1].nextCell = way1.segments[way1.segments.length-1].alternateCells[0];	
			} else {
				way2.segments[way2.segments.length-1].alternateCells[0].prevCell = way1.segments[0].alternateCells[way1.segments[0].alternateCells.length-1];
				way1.segments[0].alternateCells[way1.segments[0].alternateCells.length-1].nextCell = way2.segments[way2.segments.length-1].alternateCells[0];	
			}
			
		}
		//hubungkan ke ujung2 jalan
		if (routes[0].mode == "def") {
			routes[0]
			.way.nodes[0]
			.inCells
			.push(
				routes[0]
				.way
				.segments[0]
				.alternateCells[routes[0].way.segments[0].alternateCells.length-1]
			);

			routes[routes.length-1] //way terakhir
			.way.nodes[routes[routes.length-1].way.nodes.length-1] //node terakhir
			.outCells
			.push(
				routes[routes.length-1] //way terakhir
				.way.segments[routes[routes.length-1].way.segments.length-1] //segmen terakihr
				.alternateCells[0]
			);

			if (routes[0].way.nodes[0].isIntersect) {
				routes[0]
				.way
				.segments[0]
				.alternateCells[routes[0].way.segments[0].alternateCells.length-1].nextCell = routes[0].way.nodes[0].intersetCell;
			}

			if (routes[routes.length-1].way.nodes[routes[routes.length-1].way.nodes.length-1].isIntersect) {
				routes[routes.length-1] //way terakhir
				.way
				.segments[routes[routes.length-1].way.segments.length-1] //segmen terakihr
				.alternateCells[0].	prevCell = routes[routes.length-1].way.nodes[routes[routes.length-1].way.nodes.length-1].intersectCell;
			}

		} else {
			routes[routes.length-1]
			.way.nodes[0]
			.inCells
			.push(
				routes[routes.length-1]
				.way
				.segments[0]
				.alternateCells[routes[routes.length-1].way.segments[0].alternateCells.length-1]
			);

			routes[0] //way terakhir
			.way.nodes[routes[0].way.nodes.length-1] //node terakhir
			.outCells
			.push(
				routes[0] //way terakhir
				.way.segments[routes[0].way.segments.length-1] //segmen terakihr
				.alternateCells[0]
			);

			if (routes[routes.length-1].way.nodes[0].isIntersect) {
				routes[routes.length-1]
				.way
				.segments[0]
				.alternateCells[routes[0].way.segments[0].alternateCells.length-1].nextCell = routes[routes.length-1].way.nodes[0].intersetCell;
			}

			if (routes[0].way.nodes[routes[0].way.nodes.length-1].isIntersect) {
				routes[0] //way terakhir
				.way
				.segments[routes[0].way.segments.length-1] //segmen terakihr
				.alternateCells[0].	prevCell = routes[0].way.nodes[routes[0].way.nodes.length-1].intersectCell;
			}
		}
	

		//Marker T_T
		for (var i = 0; i < routes.length; i++) {
			routes[i].way.editStat = 3;
			for (var j = 0; j < routes[i].way.segments.length; j++) {
				var segment = routes[i].way.segments[j];
				segment.markerDecorator.removeFrom(mymap);
				segment.marker.setOffset(-6);
				segment.marker.setStyle({color: "purple"});
				rectangleBound.bringToBack();
				segment.altmarker.setStyle({color:"purple"}); //altmarker sudah ada tapi disembunyikan
				segment.altmarker.addTo(mymap); //ditambahkan lagi ke map, popup sudah ada, sudah ada offset
				segment.altmarker.bringToBack();
			}
		}
	} else if (routes[0].way.editStat == 2) {
		//sudah punya alt cell tapi tidak tersambung
		//hubungkan di ujung2 jalan saja
		for (var i = 0; i < routes.length-1; i++) {
			var way1 = routes[i].way;
			var way2 = routes[i+1].way;
			if (routes[i].mode == "def") {
				way1.segments[way1.segments.length-1].defaultCells[way1.segments[way1.segments.length-1].defaultCells.length-1].nextCell = way2.segments[0].defaultCells[0];
				way2.segments[0].defaultCells[0].prevCell = way1.segments[way1.segments.length-1].defaultCells[way1.segments[way1.segments.length-1].defaultCells.length-1];	
			} else {
				way2.segments[way2.segments.length-1].defaultCells[way2.segments[way2.segments.length-1].defaultCells.length-1].nextCell = way1.segments[0].defaultCells[0];
				way1.segments[0].defaultCells[0].prevCell = way2.segments[way2.segments.length-1].defaultCells[way2.segments[way2.segments.length-1].defaultCells.length-1];	
			}
			
		}

		//hubungkan ke ujung2 jalan
		if (routes[0].mode == "def") {
			routes[0]
			.way.nodes[0]
			.outCells
			.push(
				routes[0]
				.way
				.segments[0]
				.defaultCells[0]
			);

			routes[routes.length-1] //way terakhir
			.way.nodes[routes[routes.length-1].way.nodes.length-1] //node terakhir
			.inCells
			.push(
				routes[routes.length-1] //way terakhir
				.way.segments[routes[routes.length-1].way.segments.length-1] //segmen terakihr
				.defaultCells[routes[routes.length-1].way.segments[routes[routes.length-1].way.segments.length-1].defaultCells.length-1]
			);

			if (routes[0].way.nodes[0].isIntersect) {
				routes[0]
				.way
				.segments[0]
				.defaultCells[0].prevCell = routes[0].way.nodes[0].intersetCell;
			}

			if (routes[routes.length-1].way.nodes[routes[routes.length-1].way.nodes.length-1].isIntersect) {
				routes[routes.length-1] //way terakhir
				.way
				.segments[routes[routes.length-1].way.segments.length-1] //segmen terakihr
				.defaultCells[routes[routes.length-1].way.segments[routes[routes.length-1].way.segments.length-1].defaultCells.length-1].nextCell = routes[routes.length-1].way.nodes[routes[routes.length-1].way.nodes.length-1].intersectCell;
			}

		} else {
			routes[routes.length-1]
			.way.nodes[0]
			.outCells
			.push(
				routes[routes.length-1]
				.way
				.segments[0]
				.defaultCells[0]
			);

			routes[0] //way terakhir
			.way.nodes[routes[0].way.nodes.length-1] //node terakhir
			.inCells
			.push(
				routes[0] //way terakhir
				.way.segments[routes[0].way.segments.length-1] //segmen terakihr
				.defaultCells[routes[0].way.segments[routes[routes.length-1].way.segments.length-1].defaultCells.length-1]
			);

			if (routes[routes.length-1].way.nodes[0].isIntersect) {
				routes[routes.length-1]
				.way
				.segments[0]
				.defaultCells[0].prevCell = routes[routes.length-1].way.nodes[0].intersetCell;
			}

			if (routes[0].way.nodes[routes[0].way.nodes.length-1].isIntersect) {
				routes[0] //way terakhir
				.way
				.segments[routes[0].way.segments.length-1] //segmen terakihr
				.defaultCells[routes[0].way.segments[routes[0].way.segments.length-1].defaultCells.length-1].nextCell = routes[0].way.nodes[routes[0].way.nodes.length-1].intersectCell;
			}
		}
	

		//Marker T_T
		for (var i = 0; i < routes.length; i++) {
			routes[i].way.editStat = 3;
			for (var j = 0; j < routes[i].way.segments.length; j++) {
				var segment = routes[i].way.segments[j];
				segment.altmarkerDecorator.removeFrom(mymap);
				segment.altmarker.setOffset(-6);
				segment.altmarker.setStyle({color: "purple"});
				rectangleBound.bringToBack();
				segment.marker.setStyle({color:"purple"}); //altmarker sudah ada tapi disembunyikan
				segment.marker.addTo(mymap); //ditambahkan lagi ke map, popup sudah ada, sudah ada offset
				segment.marker.bringToBack();
			}
		}
	}
}

function editToOneWay(routes) {
	// alert("Enter edit to one way");
	// alert("enter stat 0, mode: "+routes[0].mode);
	if (routes[0].mode == "def") {
		var lastAlternateCell = routes[0].way.segments[0].alternateCells[routes[0].way.segments[0].alternateCells.length-1]; //alternate cell terakhir segmen pertama
		lastAlternateCell.nextCell = null;
		// alert(lastAlternateCell.segment === lastAlternateCell.prevCell.segment);
		var index = routes[0].way.nodes[0].inCells.findIndex( eachCell => eachCell.segment.way === lastAlternateCell.segment.way);
		routes[0].way.nodes[0].inCells.splice(index,1); //cell sudah diputus
	} else { //routes[0].mode == "alt"
		var lastDefaultCell = routes[0].way.segments[routes[0].way.segments.length-1].defaultCells[routes[0].way.segments[routes[0].way.segments.length-1].defaultCells.length-1]; //default cell terakhir segmen terakhir
		lastDefaultCell.nextCell = null;
		// alert(lastAlternateCell.segment === lastAlternateCell.prevCell.segment);
		var index = routes[0].way.nodes[routes[0].way.nodes.length-1].inCells.findIndex( eachCell => eachCell.segment.way === lastDefaultCell.segment.way);
		routes[0].way.nodes[routes[0].way.nodes.length-1].inCells.splice(index,1); //cell sudah diputus
	}

	if (routes[routes.length-1].mode == "def") {
		var firstAlternateCell = routes[routes.length-1].way.segments[routes[routes.length-1].way.segments.length-1].alternateCells[0]; //default cell terakhir segmen terakhir
		firstAlternateCell.prevCell = null;
		// alert(lastAlternateCell.segment === lastAlternateCell.prevCell.segment);
		var index = routes[routes.length-1].way.nodes[routes[routes.length-1].way.nodes.length-1].outCells.findIndex( eachCell => eachCell.segment.way === firstAlternateCell.segment.way);
		routes[routes.length-1].way.nodes[routes[routes.length-1].way.nodes.length-1].outCells.splice(index,1); //cell sudah diputus
	} else {
		var firstDefaultCell = routes[routes.length-1].way.segments[0].defaultCells[0]; //default cell terakhir segmen terakhir
		firstDefaultCell.prevCell = null;
		// alert(lastAlternateCell.segment === lastAlternateCell.prevCell.segment);
		var index = routes[routes.length-1].way.nodes[0].outCells.findIndex( eachCell => eachCell.segment.way === firstDefaultCell.segment.way);
		routes[routes.length-1].way.nodes[0].outCells.splice(index,1); //cell sudah diputus
	}

	//Ngurus marker lagi T_T
	for (var i = 0; i < routes.length; i++) {
		if (routes[i].mode == "def") {
			//alt disembunyikan
			for (var j = 0; j < routes[i].way.segments.length; j ++) {
				var segment = routes[i].way.segments[j];
				segment.altmarker.removeFrom(mymap);
				segment.marker.setOffset(0);
				segment.marker.setStyle({color:"purple"});
				segment.markerDecorator = L.polylineDecorator(segment.marker, {
					patterns: [
						{offSet:0,repeat:'50%', symbol: L.Symbol.arrowHead({pixelSize: 10, polygon: false, pathOptions: {stroke: true}})}
					]
				}).addTo(mymap);
			}
			routes[i].way.editStat = 1; //1 arah def
		} else { //1 arah alt
			for (var j = 0; j < routes[i].way.segments.length; j ++) {
				var segment = routes[i].way.segments[j];
				segment.marker.removeFrom(mymap);
				segment.altmarker.setOffset(0);
				segment.altmarker.setStyle({color:"purple"});
				segment.altmarkerDecorator = L.polylineDecorator(segment.altmarker, {
					patterns: [
						{offSet:0,repeat:'50%', symbol: L.Symbol.arrowHead({pixelSize: 10, polygon: false, pathOptions: {stroke: true}})}
					]
				}).addTo(mymap);
			}
			routes[i].way.editStat = 2; //1 arah def
		}
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
	// createWaySegments(clockTick, avgVLength); //Instansiasi segments dan cells
	// drawNodeCircleMarkers();
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
	// closeAllSegmentPopup();
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
		intValue = $("#simV").val()*1000;

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
			interCells[i].distributeBasedOnRandomTrajectory();
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
	sourceNodes = [];
	sourceCells = [];
	// sourceNodes = [];
	segments = [];
	cells = [];
	interCells = [];
	interNodes = [];
	clearInterval(simulationTimer);
}