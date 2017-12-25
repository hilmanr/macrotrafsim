//Variabel untuk struktur data simulasi
//Diinisialisasi oleh createNodes dan createWays
//Sumber data dari var nodes, ways leaflet-osm-customized.js
var sourceCells = [];
var sourceNodes = [];
var segments = [];
var cells = [];
var interCells = [];
var interNodes = [];

function createSegment(way,startNode,endNode) {
	var segment = {
		way : way,
		nodes : [startNode, endNode],
		length : startNode.latLng.distanceTo(endNode.latLng),
		defaultCells : [], //menampung cells yang ada
		alternateCells : [], //menampung cells untuk arah sebalik urutan nodes
		n : 0, //segment occupancy
		n2 : 0,
		N : 0, //segment total capacity dari total seluruh cell, kapasitas cell * jumlah cell
		Q : 0,
		marker : L.polyline([startNode.latLng,endNode.latLng], {color:"blue"}).addTo(mymap),
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

			if (this.alternateCells.length == 0) {
				totalN = 0;
				for (var i = 0; i< this.alternateCells.length; i++) {
					totalN += this.alternateCells[i].n;
				}
				this.n2 = totalN;	
			} else {
				this.n2 = 0;
			}

			if (((this.n+this.n2)/this.N)>0.5 && ((this.n+this.n2)/this.N)<=0.7) {
				this.marker.setStyle({color:"orange"});
			} else if (((this.n+this.n2)/this.N)>0.7) {
				this.marker.setStyle({color:"red"});
			} else {
				this.marker.setStyle({color:"blue"});
			}
		},
		showPopup: function() {
			var str = "<ul>";
			var strN = "",strQ= "",strR= "",strS= "",strn= "";
			str+="<li>N Segment: "+this.N+"</li>";
			strN+="<li>Cells: "+this.defaultCells.length+" Cell N: "+this.defaultCells[0].N;
			strQ+=" Cell Q: "+this.defaultCells[0].N+"</li>";
			// strR+="<li>Cell R: ";
			// strS+="<li>Cell S: ";
			strn+="<li>Cell Def n: ";
			for (var i = 0; i< this.defaultCells.length; i++) {
				strn+=this.defaultCells[i].n+",";
			}
			strn+="</li>";

			strn+="<li>Cell Alt n: ";
			for (var i = 0; i< this.alternateCells.length; i++) {
				strn+=this.alternateCells[i].n+",";
			}
			strn+="</li>";

			str+=strN+strQ+strR+strS+strn;
	
			str+="<li>Def n: "+this.n+"</li>";
			str+="<li>Alt n: "+this.n2+"</li>";
			str+="</ul>";
			this.marker.setPopupContent(str, {closeOnClick: false, autoClose: false, autoPan: false});
		}
	}
	segment.setPopup();
	return segment;
}


function createCell(segment, avgVLength, clockTick, isIntersect) {
	var cellLength = Math.ceil((segment.way.tags["avgspeed"]*1000*(clockTick/3600)));
	var cellCapacity = Math.ceil((cellLength/avgVLength)*segment.way.priority);
	var segmentFlow = Math.ceil((((segment.length/avgVLength)*segment.way.priority)/(segment.length/segment.way.tags["avgspeed"]))/3);
	var cell = {
		segment : segment,
		dist : cellLength, //panjang cell
		isIntersect : false,
		nextCell : null, //.nextCell cell yang akan menerima transfer, bentuk linked list
		N : cellCapacity, //Max Capacity, static, (length/avgVLength)*priority
		Q : cellCapacity, //Max Flow, static, Q max dihitung dari v/vehLength * lane (mungkin terdapat error di jumlah lane)
		n : 0, //Occupancy, dynamic
		R : 0, //Receive Count, jumlah yang akan diterima, dynamic
		S : 0, //Send Count, jumlah yang akan ditransfer, dynamic
		setMaxFlow : function() {
			if (this.nextCell != null) {
				var maxFlow = Math.min(this.N, this.nextCell.N);
				this.nextCell.Q = maxFlow;
			}
		},
		send : function() {
			//Akses.nextCell cell
			//Set jumlah Send cell ini, set jumlah Receive.nextCell Cell
			//Gunakan perhitungan seperti yang ada di referensi
			if (this.nextCell == null) { //sink cell
				this.S = this.n;
				// alert("Null nextCell");
			} else {
				if (!this.nextCell.isIntersect) {
					var emptySpace = this.nextCell.N - this.nextCell.n;
					var nextCellQ = this.nextCell.Q;
					var send = Math.min(emptySpace,nextCellQ, this.n);
					// alert("Empty Space: "+emptySpace+".nextCellQ: "+nextCellQ+" send:"+send);

					this.S = send; 
					this.nextCell.R += send; //.nextCell cell receive di set ke send
				 //Kalau intersection cell tidak perlu update S, si cell itu akan akses langsung this.n
				} 
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
	alert("Retrieved Cells Count: "+returnCells.length);
	return returnCells; //Sel-sel yang akan digenerate kendaraannya
}

function sourceGenerate(generateValue) {
	//sourceCells variabel global

	for (var i = 0; i < sourceNodes.length; i++) {
		if (sourceNodes[i].marker!=null) {
			sourceNodes[i].marker.setPopupContent("N: "+generateValue, {closeOnClick: false, autoClose: false, autoPan: false});
		}
	}

	for (var i = 0; i < sourceCells.length; i++) {
		var remain = sourceCells[i].N-sourceCells[i].n;
		if (remain >= generateValue) { //Sisa tempat masih banyak
			sourceCells[i].n += generateValue;
		} else {
			sourceCells[i].n += remain; //Sisa tempat tidak cukup ke setValue
		}
	}
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
		smallestQ : 1000, //nilai Q terkecil dari outCells inisialisasi, nanti akan berubah ketika disambungkan
		isIntersect : true,
		R : 0, //Receive Count, jumlah yang akan diterima, dynamic
		S : 0, //Send Count, jumlah yang akan ditransfer, dynamic
		altR : 0,
		altS : 0,
		send : function() {
			var sumEmptySpace = 0; //jumlah tempat kosong
			var sumQ = 0; //jumlah flow total

			for (var i = 0; i < this.inCells.length; i++) {
				this.R += inCells[i].n; //diisi occupancynya	
			}

			//Jumlah inputnya ditampung di variabel R
			for (var i = 0; i < outCells.length; i++) {
				sumEmptySpace += (outCells[i].N-outCells[i].n);
				sumQ += outCells[i].Q;
			}
			this.S = Math.min(sumEmptySpace, sumQ, this.R);
			var nRemain = this.R-this.S; //Jumlah kendaraan yang akan ditransfer (kalau ternyata sama, berarti habis, semua ditransfer)
			//this.R artinya sisa yang tidak di transmisikan
			//Sekarang distribute ke masing-masing.nextCellCell, sementara distribusi rata dulu saja
			//Distribute nanti disesuaikan dengan data traffic
			var totalSent = this.S;
			var allSent = false;
			var defDist = this.smallestQ;
			while (!allSent) {
				var pass = true;
				for (var i = 0; i < outCells.length; i++) {
					if (outCells[i].Q > outCells[i].R) { //Cek flownya dulu
						if (outCells[i].Q <= defDist) {
							outCells[i].R += outCells[i].Q;
							totalSent -= outCells[i].Q;
							pass = pass && true; 
						} else { //Q > defDist, bisa tampung
							var space = outCells[i].Q - outcells[i].R; //Sisa flow kosong
							if (space > defDist) {
								totalSent -= defDist;
								pass = pass && false; // flow masih ada sisa
							} else {
								totalSent -= space;
								pass = pass && true; //flow penuh
							}
						}
					}
				}
				allSent = allSent || pass; //operasi OR, kalau passnya true, berarti sudah 
			} // Sent sudah didistribusikan, seharusnya sudah terbagi rata semua
			
			//Jumlah yang dikirimkan (S) belum tentu sama dengan jumlah yang diterima intersectCell (R)
			var smallestN = 1000;
			for (var i = 0; i < inCells.length; i++) {
				if (inCells[i].n < smallestN) {
					smallestN = inCells[i];
				}
			}

			var allReceive = false;
			var recDist = smallestN;
			while (!allReceive) {
				var pass = true;
				for (var i = 0; i < inCells.length; i++) {
					if (inCells[i].n > recDist) { //Cek flownya dulu
						inCells[i].n -= recDist;
						pass = pass && false;
					} else { //Q > defDist, bisa tampung
						var space = inCells[i].n; //Sisa flow kosong
						if (space > defDist) {
							totalSent -= defDist;
							pass = pass && false; // flow masih ada sisa
						} else {
							totalSent -= space;
							pass = pass && true; //flow penuh
						}
					}
				}
				allSent = allSent || pass; //operasi OR, kalau passnya true, berarti sudah 
			} // Sent sudah didistribusikan, seharusnya sudah terbagi rata semua
			/*
			##################################################################################
			SEND PASTI BISA MASUK KARENA BERDASARKAN MINIMUM TEMPAT KOSONG.nextCell CELL
			TETAPI,
			RECEIVE BELUM TENTU BISA MASUK DI INTERSECT CELL,
			KARENA JUMLAH TOTAL CELL MASUK DENGAN JUMLAH TOTAL KAPASITAS CELL KELUAR BISA BEDA
			CELL MASUK DAN CELL KELUAR BERSIFAT AGREGAT
			##################################################################################
			*/
		/*
		############################
		KHUSUS UNTUK INTERSECT CELLS
		############################
		*/
		}
	}
	return cell;
}
			
			
//Struktur untuk simulasi dibuat ulang disini
//Struktur untuk node ada di simulation-stucture.js sudah ditambahkan untuk simulasi
function createWaySegments(clockTick, avgVLength) { //Istansiasi
	//Variabel nodes dan ways sudah diinisialisasi saat set map
	/*
		deklarasi di simulation.js
		var nodes;
		var ways;
	*/
	//Struktur simulasi ways bisa menggunakan variabel ways langsung
	// alert("Ways Count: "+ways.length);
	for (var i = 0; i < ways.length; i++) { //instansiasi setiap road segment
		var sourceNode = ways[i].nodes[0];
		var sinkNode = ways[i].nodes[ways[i].nodes.length-1];
		var eachWay = ways[i];
		for (var j = 0; j < eachWay.nodes.length-1; j++) {
			var startNode = eachWay.nodes[j];
			var endNode = eachWay.nodes[j+1];
			/*
			######################
			ROAD SEGMENT
			######################
			*/
			var segment = createSegment(eachWay,startNode,endNode);
			//Instansiasi setiap cells, jumlah cells ditentukan dengan clock tick dan avgspeed
			
			/*
			######################
			CELL
			######################
			*/
			var cellLength = Math.ceil((segment.way.tags["avgspeed"]*1000*(clockTick/3600)));
			var cellCount = Math.ceil(segment.length / cellLength); //kecepatan km/jam
			var cellCapacity = Math.ceil((cellLength/avgVLength)*segment.way.priority);
			//segment.N = cellCapacity*cellCount; //set max capacity of segment
			//Cell satu arah pertama
			for (var k = 0; k < cellCount; k++) {
				var cell = createCell(segment, avgVLength, clockTick, false);
				//Push tiap cell ke segment
				/*
				#############################
				PUSH DEFAULT CELLS KE SEGMENT
				#############################
				*/
				segment.defaultCells.push(cell);
				cells.push(cell); //by reference
			}
			segment.setCapacity(); //Set kapasitas maksimum sel, didapat dari total kapasitas sel
			//Push tiap segment ke way
			//Buat link antar cell, isi.nextCell dari defaultCells
			var k = 0;
			// alert("defaultCells Length: "+segment.defaultCells.length);
			while (k< segment.defaultCells.length-1) {
				segment.defaultCells[k].nextCell = segment.defaultCells[k+1];
				
				// alert("Test "+segment.defaultCells[k].nextCell.N);
				k++;
			}// Cell di ujung belum ada hubungan ke.nextCellnya, cell ujung nanti dihubungkan setelah semua segment diinstansiasi
			// segment.defaultCells[k].setMaxFlow();

			/*
			###########################################
			BUAT ALTERNATE CELLS
			###########################################
			*/

			//Cek jalan rayanya, kalau dua arah, cells diinstansiasi dua kali
			if (!segment.way.tags["oneway"]) {
				for (var k = 0; k < cellCount; k++) {
					var cell = createCell(segment, avgVLength, clockTick, false);
					//Push tiap cell ke segment
					/*
					#############################
					PUSH ALTERNATE CELLS KE SEGMENT
					#############################
					*/
					segment.alternateCells.push(cell);
					cells.push(cell); //by reference
				}
				//Push tiap segment ke way
				//Buat link antar cell, isi.nextCell dari defaultCells
				k = 0;
				while (k< segment.alternateCells.length-1) {
					segment.alternateCells[k].nextCell = segment.alternateCells[k+1];
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
		/*
		#########################################
		SEGMENT SUDAH DI PUSH SEMUA KE SEBUAH WAY
		#########################################
		*/
		//Sekarang buat link antar segment, segment-segment di ujung terhubung ke source/sink node
		//DEFAULT CELL
		for (var p = 0; p < eachWay.segments.length-1; p++) {
			var initialSegmentCell = eachWay.segments[p].defaultCells[eachWay.segments[p].defaultCells.length-1]; //LAST CELL
			var nextSegmentCell = eachWay.segments[p+1].defaultCells[0]; //FIRST CELL
			initialSegmentCell.nextCell = nextSegmentCell;
		}
		//ALTERNATE CELL
		if (!eachWay.tags["oneway"]) {
			for (var p = eachWay.segments.length-1; p > 0; p--) { //dibalik sesuai urutan segmen ~ arah jalan
				var initialSegmentCell = eachWay.segments[p].alternateCells[eachWay.segments[p].alternateCells.length-1]; //LAST CELL
				var nextSegmentCell = eachWay.segments[p-1].alternateCells[0]; //FIRST CELL
				initialSegmentCell.nextCell = nextSegmentCell;
			}
		}
		//Cell antar segment sudah terhubung. Cell terakhir di segmen terakhir belum dihubungkan
		//Menunggu seluruh segment dan way terinstansiasi dulu

	}
	/*
	###################################
	SELURUH WAY SUDAH DIBUAT SEGMENTNYA
	###################################
	*/
	//Menghubungkan cell antar way, caranya akses si way di variabel global way
	//Segment-segment sudah dimasukan ke waynya masing-masing

	/*
	########################################
	MENGHUBUNGKAN CELL ANTAR WAY
	########################################
	*/
	for (var i = 0; i < nodes.length; i++) {
		var node = nodes[i];
		if ((node.inWays.length + node.outWays.length) >= 2) { //Intersection atau intermediate cells
			if ((node.inWays.length + node.outWays.length) == 2) { //Intermediate cells
				//CASE Jalan 2 arah normal 
				if (node.inWays == 1 && node.outWays == 1) { //1 in 1 out
					var inWaysLastSegment = node.inWays[0].segments[node.inWays[0].segments.length-1];
					var inWaysLastCell = inWaysLastSegment.defaultCells[inWaysLastSegment.defaultCells.length-1];
					var outWaysFirstSegment = node.outWays[0].segments[0];
					var outWaysFirstCell = outWaysFirstSegment.defaultCells[0];
					inWaysLastCell.nextCell = outWaysFirstCell;
					if (!node.inWays[0].tags["oneway"] && !node.outWays[0].tags["oneway"]) { //dua-duanya punya 2 arah
						var inWaysLastSegment = node.inWays[0].segments[node.inWays[0].segments.length-1];
						var inWaysFirstCell = inWaysLastSegment.alternateCells[0];
						var outWaysFirstSegment = node.outWays[0].segments[0];
						var outWaysLastCell = outWaysFirstSegment.alternateCells[outWaysFirstSegment.alternateCells.length-1];
						outWaysLastCell.nextCell = inWaysFirstCell;
					}
				} else if (node.inWays == 2)  {//CASE Jalan 2 arah in-in, PASTI 2 ARAH
					var inWaysLastSegment1 = node.inWays[0].segments[node.inWays[0].segments.length-1];
					var inWaysLastSegment2 = node.inWays[1].segments[node.inWays[0].segments.length-1];
					var inWaysLastCell1 = inWaysLastSegment1.defaultCells[inWaysLastSegment1.defaultCells.length-1];
					var inWaysFirstCell2 = inWaysLastSegment2.alternateCells[0];
					inWaysLastCell1.nextCell = inWaysFirstCell2; //.nextCell ke alternate cell
					if (!node.inWays[0].tags["oneway"] && !node.outWays[0].tags["oneway"]) { //dua-duanya punya 2 arah
						var inWaysFirstCell1 = inWaysLastSegment1.alternateCells[0];
						var inWaysLastCell2 = inWaysLastSegment2.defaultCells[inWaysLastSegment2.defaultCells.length-1];
						inWaysLastCell2.nextCell = inWaysFirstCell1; //.nextCell ke alternate cell
					}
				} else if (node.outWays == 2) {//CASE Jalan 2 arah out-out, PASTI 2 ARAH
					var outWaysFirstSegment1 = node.outWays[0].segments[0];
					var outWaysFirstSegment2 = node.outWays[1].segments[0];
					var outWaysLastCell1 = outWaysFirstSegment1.alternateCells[outWaysFirstSegment1.alternate.length-1];
					var outWaysFirstCell2 = outWaysFirstSegment2.defaultCells[0];
					outWaysLastCell1.nextCell = outWaysFirstCell2; //.nextCell ke alternate cell
					if (!node.outWays[0].tags["oneway"] && !node.outWays[0].tags["oneway"]) { //dua-duanya punya 2 arah
						var outWaysFirstCell1 = outWaysLastSegment1.defaultCells[0];
						var outWaysLastCell2 = outWaysLastSegment2.alternateCells[outWaysLastSegment2.defaultCells.length-1];
						outWaysLastCell2.nextCell = outWaysFirstCell1; //.nextCell ke alternate cell
					}
				}
				//JALAN TERHUBUNG DI INTERMEDIATE CELL, CELLS MASING-MASING JALAN SUDAH TERHUBUNG

			} else { //Intersection Cells
				/*
				######################################################

				PERSIMPANGAN JALAN

				######################################################
				*/
				interNodes.push(node);
				var interCell = createInterCell(node);
				
				//Akses way yang masuk
				for (var j = 0; j < node.inWays.length; j++) {
					var way = inWays[j];
					var defaultLastSegment = way.segments[way.segments.length-1];
					var defaultLastCell = defaultLastSegment.defaultCells[defaultLastSegment.defaultCells.length-1]; //Last cell
					defaultLastCell.nextCell = interCell; //last cell bisa akses S dari intersection Cell
					interCell.inCells.push(defaultLastCell);
					if (!way.tags["oneway"]) { //ada dua arah
						var alternateFirstCell = defaultLastSegment.alternateCells[0] //segmen pertama jadi yang terakhir k
						if (alternateFirstCell.Q < interCell.smallestQ) {
							interCell.smallestQ = alternateFirstCell.Q;
						}
						interCell.outCells.push(alternateFirstCell);

					}
				}//Jalan masuk ke intercell sudah terhubung dengan intercell
				//Akses way yang keluar
				for (var j = 0; j < node.inWays.length; j++) {
					var way = outWays[j]; //Jalan keluar dari interCell
					var defaultFirstSegment = way.segments[0]; //segmen pertama yang terhubung dengan interCell
					var defaultFirstCell = defaultFirstSegment.defaultCells[0]; //First cell
					if (defaultFirstCell.Q < interCell.smallestQ) {
						interCell.smallestQ = defaultFirstCell.Q;
					}
					interCell.outCells.push(defaultFirstCell);
					if (!way.tags["oneway"]) { //ada dua arah
						var alternateLastCell = defaultFirstSegment.alternateCells[defaultFirstSegment.alternateCells.length-1] //segmen pertama jadi yang terakhir k
						interCell.inCells.push(alternateLastCell);
						alternateLastCell.nextCell = interCell;
					}
				}//Jalan keluar dari intercell sudah terhubung
				
				//Push ke repo pusat nanti update lebih mudah
				interCells.push(interCell);
			}
		}
	}

	/*
	########################################
	UPDATE MAXFLOW TIAP CELLS
	########################################
	*/
	for (var i = 0; i < cells.length; i++) {
		cells[i].setMaxFlow();
	}
}

//===============================
//Persiapan simulasi
var nearestNodeMarker = {};
function getNearestNode(latLng, markerList) {
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
			nearestLatLng = nodes[idx].latLng;
			nearestNode = nodes[idx];
		}
	}

	//
	var message = "Posisi Click: "+nearestLatLng+"\nNearest Node Id: "+nearestNode.id+"\nDistance: "+minDistance+"\n";
	message+= "Incoming Ways Ids: ";
	for (var i=0; i<nearestNode.inWays.length; i++) {
		var way = nearestNode.inWays[i].id;
		message+=way+", ";
	}
	message+= "\n";
	message+= "Outcoming Ways Ids: ";
	for (var i=0; i<nearestNode.outWays.length; i++) {
		var way = nearestNode.outWays[i].id;
		message+=way+", ";
	}
	message+= "\n";
	alert(message);
	nearestNode.marker = L.marker(nearestLatLng).addTo(mymap);
	nearestNodeMarker = nearestNode.marker;

	return nearestNode.id;
}

var sourceNodeMarker = {};
function setSource(latLng) {
	alert("Set Source Cells");
	var nodeId = getNearestNode(latLng);
	sourceCells = sourceCells.concat(findCells(nodeId));
	sourceNodes.push(nodes[nodeId]);
}

function getSourceNodes() {
	var markers = [];
	var sourceNodes = [];
	// alert("Enter getSourceNodes");
	for (var idx in nodes) {
		var node = nodes[idx];
		if ((node.inWays.length + node.outWays.length) == 1) { //artinya sink/source, tapi belum tahu
			if (node.isSource) { //cari source node
				sourceNodes.push(node);
				node.marker = L.marker(node.latLng).addTo(mymap);
				node.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});
				markers.push(node.marker);	
				sourceCells = sourceCells.concat(findCells(node.id));
				sourceNodes.push(node);
			}
		}
	}
	var result = [];
	result.push(sourceNodes);
	result.push(markers);
	return result;
}

function getSinkNodes() {
	var markers = [];
	var sinkNodes = [];
	for (var idx in nodes) {
		var node = nodes[idx];
		if ((node.inWays.length + node.outWays.length) == 1) { //artinya sink/source, tapi belum tahu
			if (node.isSink) { //cari source node
				sinkNodes.push(node);
				node.marker = L.popup({closeOnClick: false, autoClose: false}).setLatLng(node.latLng).setContent("Sink Nodes"); 
				markers.push(L.marker(node.latLng).bindPopup("Sink Nodes"));	
			}
		}
	}
	var result = [];
	result.push(sinkNodes);
	result.push(markers);
	return result;
}

function getIntersectionNodes() {
	var markers = [];
	var intersectionNodes = [];
	for (var idx in nodes) {
		var node = nodes[idx];
		if ((node.inWays.length + node.outWays.length) > 2) { //Cari intersection node
			intersectionNodes.push(node);
			markers.push(L.marker(node.latLng));	
		}
	}
	var result = [];
	result.push(intersectionNodes);
	result.push(markers);
	return result;
}

function getIntermediateNodes() { //intermediate dan intersection
	var markers = [];
	var intersectionNodes = [];
	for (var idx in nodes) {
		var node = nodes[idx];
		if ((node.inWays.length + node.outWays.length) == 2) { //Cari intersection node
			intersectionNodes.push(node);
			markers.push(L.marker(node.latLng));	
		}
	}
	var result = [];
	result.push(intersectionNodes);
	result.push(markers);
	return result;
}


//Memperoleh Node-Node batas yang akan generate kendaraan

//Menjalankan simulasi menggunakan timer
function runSimulation() {
	var clockTick = parseInt($("#clockTick").val()); //satuan detik (second)
	var avgVLength = parseInt($("#vLength").val());
	var clock = 1;
	createWaySegments(clockTick, avgVLength); //Instansiasi segments dan cells
	sourceNodes = getSourceNodes()[0];
	document.getElementById("wayCount").innerHTML = ways.length;
	document.getElementById("segmentCount").innerHTML = segments.length;
	document.getElementById("cellCount").innerHTML = cells.length;
	document.getElementById("intersectCount").innerHTML = interCells.length;
	alert("Source cell: "+sourceCells.length);
	
	var timer = setInterval(function() { 
		//Source Cell Generate Dulu
		var vehicleGen = parseInt($("#vehicleGen").val());
		sourceGenerate(vehicleGen);
		// alert("transfer");
		//Distribusi kendaraan
		//alert("Cell count: "+cells.length);
		for (var i = 0; i<cells.length; i++) {
			cells[i].send();
		}

		// alert("distribute");
		//Update kendaraan di persimpangan
		// alert("Cell count: "+interCells.length);
		for (var i = 0; i<interCells.length; i++) {
			interCells[i].send();
		}	

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
	}, 2000);
}