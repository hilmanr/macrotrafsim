//Variabel untuk struktur data simulasi
//Diinisialisasi oleh createNodes dan createWays
//Sumber data dari var nodes, ways leaflet-osm-customized.js
var sourceCells = [];
var sourceNodes = [];
var segments = [];
var cells = [];
var interCells = [];
var interNodes = [];
var updatedCells = [];
var finalCellsQueue = [];
var simulationTimer = {};

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
		n2 : 0,
		N : 0, //segment total capacity dari total seluruh cell, kapasitas cell * jumlah cell
		Q : 0,
		marker : L.polyline([startNode.latLng,endNode.latLng], {weight: way.wayClass*(1.75), color:"grey"}).addTo(mymap),
		setPopup: function() {
			this.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});
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

			if (((this.n+this.n2)/this.N)>0.7) {
				this.marker.setStyle({color:"red"});
			} else if (((this.n+this.n2)/this.N)>0.5) {
				this.marker.setStyle({color:"orange"});
			} else if (((this.n+this.n2)/this.N)>0){
				this.marker.setStyle({color:"#00bf01"});
			} else {
				this.marker.setStyle({color:"grey"});
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
			str+="<br>Alt n: "+this.n2;
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
			}
		},
		send : function() {
			//Akses.nextCell cell
			//Set jumlah Send cell ini, set jumlah Receive.nextCell Cell
			//Gunakan perhitungan seperti yang ada di referensi
			this.isFinal = false;
			if (this.nextCell == null) { //sink cell
				this.S = this.n;
				// alert("Null nextCell");
			} else {
				if (!this.nextCell.isIntersect) {
					var emptySpace = this.nextCell.N-this.nextCell.n;
					var send = Math.min(emptySpace,this.nextCell.Q, this.n);
					// alert("Empty Space: "+emptySpace+".nextCellQ: "+nextCellQ+" send:"+send);

					this.S = send;
					//akses hanya ke nextCell, nilai receive diubah  setelah nilai sendnya fix
				 //Kalau intersection cell tidak perlu update S, si cell itu akan akses langsung this.n
				} else {
					this.S = this.n;
				}
			}
			this.receiveCap = this.N-(this.n-this.S); 
			//receiveCap di nextCell tidak diketahui, karena nilai nextCell.S belum tentu sudah diset
		},
		statUpdate : function() { //receiveCap setiap sel harus dilakukan setelah semuanya punya nilai, karena akses belum tentu berurutan. Ada kemungkinan nilai receiveCap
			this.isUpdated = false;
			this.isFinal = false;
			if (this.nextCell == null) { //sink cell, pasti updated 
				this.isUpdated = true;
				this.isFinal = true;
				this.isSink = true;
				updatedCells.push(this);
				// alert("Null nextCell");
			} else {
				if (this.nextCell.isIntersect) { //jika nextnya intersect, sementara update dulu 
					this.isUpdated = true;
					updatedCells.push(this);
				}
			}

		},
		receive : function(updateVal) { //dilakukan oleh cell-cell yang S nya sudah semi final, mengupdate nilai S cell-cell sebelumnya yang belum final
			//firstUpdate = true, status belum final, sel-sel sebelumnya belum pernah diupdate
			//firstUpdate = false, isUpdated tiap sel == true, updateKedua untuk set jumlah akibat intersection cell
			//operasinya mundur, berbeda dengan send yang melihat nextCell, operasi ini mundur ke prevCell
			var prev = this.prevCell;
			var curr = this;
			var finish = false;
			// if (curr.isFinal) {
			// 	alert(curr.isFinal);	
			// }
			while (prev!= null && !finish) {
				if (!prev.isIntersect) {
					if (updateVal) {
						prev.S = Math.min(curr.receiveCap, curr.Q, prev.n); //Send diperbarui sesuai dengan receiveCap curr yang sudah fix
						curr.R = prev.S; //prev.S sudah fix
						prev.receiveCap = prev.N-(prev.n-prev.S); //Receive cap prev sudah fix
						prev.isUpdated = true; //Penanda kalau sudah final
					}
					if (curr.isFinal) { //Terhubung dengan sink cell atau cell lain yang juga terhubung dengannya
						prev.isFinal = true;
						// if (prev.prevCell.isIntersect) {
						// 	// alert("prev stat: "+prev.isFinal+" prev.prev==intersect?: "+prev.prevCell.isIntersect);	
						// }
					}
					curr = prev;
					prev = curr.prevCell;
					// alert("Normal prev");
				} else {
					// alert("Enter intersect cell, getStat: "+prev.getStat());
					if (prev.getStat()) { //jika stat final, set intersect Final, push ke global variabel sebagai titik mulai traversal tree
						prev.isFinal = true;
						finalCellsQueue.push(prev);
						// alert("Final Intersection");
					}
					finish = true;
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
		isFinal : false,
		isUpdated : true,
		maxDur : 30, //Maximum duration lampu hijau
		sumInPriority : 0, //index inCells yang kebagian jatah untuk transfer, index disesuaikan dengan priority
		sumOutPriority : 0,
		maxQ : 0, //flow maksimum salah satu jalan, digunakan untuk kuota inCells
		R : 0, //Receive Count, jumlah yang akan diterima, dynamic
		S : 0, //Send Count, jumlah yang akan ditransfer, dynamic
		init: function() {
			var str = "inCells Id: ";

			for (var i = 0; i < this.inCells.length; i++) {
				this.sumInPriority += this.inCells[i].segment.priority;
				str+= this.inCells[i].segment.way.id+",";
			}
			str+="<br>outCells Id: ";
			//var str = "outCells: ";
			for (var i = 0; i < this.outCells.length; i++) {
				this.sumOutPriority += this.outCells[i].segment.priority;
				str+= this.outCells[i].segment.way.id+",";
			}

			this.node.marker.bindPopup(str, {closeOnClick: false, autoClose: false, autoPan: false});
		},
		getStat: function() { //Update status persimpangan apakah ready untuk set jumlah kendaraan untuk ditransmisikan
			var stat = true;
			var str = "getStat list: ";
			for (var i = 0; i < this.outCells.length; i++) {
				stat = stat && this.outCells[i].isFinal;
				str+= this.outCells[i].isFinal;
			}
			alert(str);
			return stat;
		},
		distribute: function() { //Conceptnya traversal tree depth first, hanya dilakukan oleh intersect yang final
			
			if (this.isFinal) { //Outcells nilainya sudah fix semua
				var sumSend = 0;
				var sumReceive = 0;

				//Cari jumlah kendaraan yang bisa ditampung
				for (var i = 0; i < this.outCells.length; i++) {
					sumSend+= this.outCells[i].receiveCap;
				}

				//Cari jumlah kendaraan yang diterima persimpangan
				for (var i = 0; i < this.inCells.length; i++) {
					sumReceive+= this.inCells[i].S;
				}

				//DISTRIBUSI ke inCells
				var effIn = Math.min(sumSend,sumReceive); //Cari mana yang lebih kecil, jumlah send efektif
				var effOut = effIn;
				var inVal = effIn/this.sumInPriority;
				// alert("Initial effIn:"+effIn);
				for (var i = 0; i < this.inCells.length; i++) {
					var eachSend = Math.floor(this.inCells[i].segment.priority*inVal);
					// var eachSend = ((this.inCells[i].segment.priority/this.sumInPriority)*this.maxQ); //kuota berdasarkan flow maksimum
					if (this.inCells[i].S >= eachSend) { //n nya lebih besar dari distribusi masing-masing sel
						effIn -= eachSend;
						this.inCells[i].S = eachSend;
					} else { //n lebih kecil jadi ditransfer semuass
						effIn -= this.inCells[i].n;
						this.inCells[i].S = this.inCells[i].n;
					}
				}
				inVal = effIn/this.sumInPriority;
				var k = 0;
				// inVal = effIn/this.sumInPriority;
				while (effIn > 0) {
					var remainDist = Math.floor(this.inCells[k].segment.priority*inVal);
					if (remainDist < 1) {
						remainDist = 1;
					}
					if ((this.inCells[k].n-this.inCells[k].S) > 0) {
						if ((this.inCells[k].n-this.inCells[k].S) >= remainDist) {
							effIn -= remainDist;
							this.inCells[k].S += remainDist;
						} else { //in case kendaraan sudah habis, this.inCells[k].n-this.inCells[k].S = 0; safe untuk operation, tapi redundan
							effIn -= this.inCells[k].n-this.inCells[k].S;
							this.inCells[k].S += this.inCells[k].n-this.inCells[k].S;
						}
					}
					k++;
					if (k == this.inCells.length) {
						k = 0;
					}
				} //effIn harusnya bernilai 0

				//DISTRIBUSI ke outCells
				var outVal = effOut/this.sumOutPriority;
				for (var i = 0; i < this.outCells.length; i++) {
					var eachSend = Math.floor(this.outCells[i].segment.priority*outVal);
					if (this.outCells[i].receiveCap >= eachSend) { //n nya lebih besar dari distribusi masing-masing sel
						effOut -= eachSend;
						this.outCells[i].R = eachSend;
					} else { //n lebih kecil jadi ditransfer semuass
						effOut -= this.outCells[i].receiveCap;
						this.outCells[i].R = this.outCells[i].receiveCap;
					}
				}
				k = 0;
				outVal = effOut/this.sumOutPriority;
				while (effOut > 0) {
					var remainDist = Math.floor(this.outCells[k].segment.priority*outVal);
					if (remainDist < 1) {
						remainDist = 1;
					}

					if ((this.outCells[k].receiveCap-this.outCells[k].R) > 0) { //cek masih ada tempat atau tidak
						if ((this.outCells[k].receiveCap-this.outCells[k].R) >= remainDist) { //Sisa tempat cukup untuk remainDist
							effOut -= remainDist;
							this.outCells[k].R += remainDist;
						} else { //Sisa tempat tidak cukup untuk remainDist
							effOut -= this.outCells[k].receiveCap-this.outCells[k].R;
							this.outCells[k].R += this.outCells[k].n-this.outCells[k].R;
						}
					}
					k++;
					if (k == this.outCells.length) {
						k = 0;
					}
				}//effOut harusnya bernilai 0

				//UPDATE CELL-CELL yang terhubung ke inCells
				for (var i = 0; i < this.inCells.length; i++) {
					if (this.inCells[i].n-this.inCells[i].S == 0) { //nilainya sama, untuk save processing, receive tanpa update nilai
						this.inCells[i].receive(false);
					} else {
						this.inCells[i].receive(true);
					}
				}
			}
		}
	}
	cell.node.marker = L.marker(cell.node.latLng).addTo(mymap);
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
			var cellCapacity = Math.ceil((cellLength/avgVLength)*segment.way.wayClass);
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
			//UNTUK AKOMODASI CUSTOM SOURCE CELL
			segment.nodes[0].outCells.push(segment.defaultCells[0]);
			segment.nodes[1].inCells.push(segment.defaultCells[segment.defaultCells.length-1]);
			segment.setCapacity(); //Set kapasitas maksimum sel, didapat dari total kapasitas sel
			//Push tiap segment ke way
			//Buat link antar cell, isi.nextCell dari defaultCells
			var k = 0;
			while (k< segment.defaultCells.length-1) {
				segment.defaultCells[k].nextCell = segment.defaultCells[k+1];
				segment.defaultCells[k+1].prevCell = segment.defaultCells[k];				
				// alert("Test "+segment.defaultCells[k].nextCell.N);
				k++;
			}// Cell di ujung belum ada hubungan ke.nextCellnya, cell ujung nanti dihubungkan setelah semua segment diinstansiasi
			//Node di set inCells dan outCells untuk akomodasi set custom source node


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
				//Buat link antar cell, isi.nextCell dari alternateCells
				//UNTUK AKOMODASI CUSTOM SOURCE CELL
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
			nextSegmentCell.prevCell = initialSegmentCell;
		}
		//ALTERNATE CELL
		if (!eachWay.tags["oneway"]) {
			for (var p = eachWay.segments.length-1; p > 0; p--) { //dibalik sesuai urutan segmen ~ arah jalan
				var initialSegmentCell = eachWay.segments[p].alternateCells[eachWay.segments[p].alternateCells.length-1]; //LAST CELL
				var nextSegmentCell = eachWay.segments[p-1].alternateCells[0]; //FIRST CELL
				initialSegmentCell.nextCell = nextSegmentCell;
				nextSegmentCell.prevCell = initialSegmentCell;
			}
		}
		//Cell antar segment sudah terhubung. Cell terakhir di segmen terakhir belum dihubungkan
		//Menunggu seluruh segment dan way terinstansiasi dulu

	}
	/*
	####################################
	SELURUH WAY SUDAH DIBUAT SEGMENTNYA
	####################################
	*/
	//Menghubungkan cell antar way, caranya akses si way di variabel global way
	//Segment-segment sudah dimasukan ke waynya masing-masing

	/*
	########################################
	MENGHUBUNGKAN CELL ANTAR WAY
	########################################
	*/
	var intersect = getIntersectionNodes()[0];
	var intermediate = getIntermediateNodes()[0];
	// alert("Connect each Way, intermediate length: "+intermediate.length+" intersection length: "+intersect.length);
	for (var i = 0; i< intersect.length; i++) {
		interNodes.push(intersect[i]);
	}

	for (var i = 0; i< intermediate.length; i++) {
		interNodes.push(intermediate[i]);
	}
	/*
	##########################################
	MEMBUAT INTERSECTION DAN INTERMEDIATE NODE
	##########################################
	*/
	for (var i = 0; i < interNodes.length; i++) {
		var node = interNodes[i];
		if ((node.inWays.length + node.outWays.length) >= 2) { //Intersection atau intermediate cells
			if ((node.inWays.length + node.outWays.length) == 2) { //Intermediate cells
		 		//CASE Jalan 2 arah normal 
				if (node.inWays.length == 1 && node.outWays.length == 1) { //1 in 1 out
					// alert("this is here");
					var inWaysLastSegment = node.inWays[0].segments[node.inWays[0].segments.length-1];
					var inWaysLastCell = inWaysLastSegment.defaultCells[inWaysLastSegment.defaultCells.length-1];
					var outWaysFirstSegment = node.outWays[0].segments[0];
					var outWaysFirstCell = outWaysFirstSegment.defaultCells[0];
					inWaysLastCell.nextCell = outWaysFirstCell;
					outWaysFirstCell.prevCell = inWaysLastCell;

					if (!node.inWays[0].tags["oneway"] && !node.outWays[0].tags["oneway"]) { //dua-duanya punya 2 arah
						var inWaysLastSegment = node.inWays[0].segments[node.inWays[0].segments.length-1];
						var inWaysFirstCell = inWaysLastSegment.alternateCells[0];
						var outWaysFirstSegment = node.outWays[0].segments[0];
						var outWaysLastCell = outWaysFirstSegment.alternateCells[outWaysFirstSegment.alternateCells.length-1];
						outWaysLastCell.nextCell = inWaysFirstCell;
						inWaysFirstCell.prevCell = outWaysLastCell;
					}

				} else if (node.inWays.length == 2)  {//CASE Jalan 2 arah in-in, PASTI 2 ARAH
					if (!node.inWays[0].tags["oneway"] && !node.outWays[0].tags["oneway"]) { //dua-duanya punya 2 arah
						var inWaysLastSegment1 = node.inWays[0].segments[node.inWays[0].segments.length-1];
						var inWaysLastSegment2 = node.inWays[1].segments[node.inWays[0].segments.length-1];
						var inWaysLastCell1 = inWaysLastSegment1.defaultCells[inWaysLastSegment1.defaultCells.length-1];
						var inWaysFirstCell2 = inWaysLastSegment2.alternateCells[0];
						inWaysLastCell1.nextCell = inWaysFirstCell2; //.nextCell ke alternate cell
						inWaysFirstCell2.prevCell = inWaysLastCell1;
						//HANDLING UNTUK ARAH SEBALIKNYA
						var inWaysFirstCell1 = inWaysLastSegment1.alternateCells[0];
						var inWaysLastCell2 = inWaysLastSegment2.defaultCells[inWaysLastSegment2.defaultCells.length-1];
						inWaysLastCell2.nextCell = inWaysFirstCell1; //.nextCell ke alternate cell
						inWaysFirstCell1.prevCell = inWaysLastCell2;
					}
				} else if (node.outWays.length == 2) {//CASE Jalan 2 arah out-out, PASTI 2 ARAH
					if (!node.outWays[0].tags["oneway"] && !node.outWays[0].tags["oneway"]) { //dua-duanya punya 2 arah
						var outWaysFirstSegment1 = node.outWays[0].segments[0];
						var outWaysFirstSegment2 = node.outWays[1].segments[0];
						var outWaysLastCell1 = outWaysFirstSegment1.alternateCells[outWaysFirstSegment1.alternate.length-1];
						var outWaysFirstCell2 = outWaysFirstSegment2.defaultCells[0];
						outWaysLastCell1.nextCell = outWaysFirstCell2; //.nextCell ke alternate cell
						outWaysFirstCell2.prevCell = outWaysLastCell1;

						var outWaysFirstCell1 = outWaysLastSegment1.defaultCells[0];
						var outWaysLastCell2 = outWaysLastSegment2.alternateCells[outWaysLastSegment2.defaultCells.length-1];
						outWaysLastCell2.nextCell = outWaysFirstCell1; //.nextCell ke alternate cell
						outWaysFirstCell1.prevCell = outWaysLastCell2;
					}
				}
		 		//JALAN TERHUBUNG DI INTERMEDIATE CELL, CELLS MASING-MASING JALAN SUDAH TERHUBUNG
			} else { //Intersection Cells
				/*
				######################################################

				PERSIMPANGAN JALAN

				######################################################
				*/
				var interCell = createInterCell(node);
				
				//Akses way yang masuk
				for (var j = 0; j < node.inWays.length; j++) {
					var way = node.inWays[j];
					var defaultLastSegment = way.segments[way.segments.length-1];
					var defaultLastCell = defaultLastSegment.defaultCells[defaultLastSegment.defaultCells.length-1]; //Last cell
					defaultLastCell.nextCell = interCell; //last cell bisa akses S dari intersection Cell
					interCell.inCells.push(defaultLastCell);
					if (!way.tags["oneway"]) { //ada dua arah
						var alternateFirstCell = defaultLastSegment.alternateCells[0] //segmen pertama jadi yang terakhir k
						alternateFirstCell.prevCell = interCell;
						if (alternateFirstCell.Q < interCell.smallestQ) {
							interCell.smallestQ = alternateFirstCell.Q;
						}
						interCell.outCells.push(alternateFirstCell);

					}
				}//Jalan masuk ke intercell sudah terhubung dengan intercell
				//Akses way yang keluar
				for (var j = 0; j < node.outWays.length; j++) {
					var way = node.outWays[j]; //Jalan keluar dari interCell
					var defaultFirstSegment = way.segments[0]; //segmen pertama yang terhubung dengan interCell
					var defaultFirstCell = defaultFirstSegment.defaultCells[0]; //First cell
					if (defaultFirstCell.Q < interCell.smallestQ) {
						interCell.smallestQ = defaultFirstCell.Q;
					}
					defaultFirstCell.prevCell = interCell;
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


//=============================
//COMMON METHOD
//=============================


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
	// alert(parseFloat(splitRes[0])+","+parseFloat(splitRes[2])+" Node Val"+node.latLng.lng+
		// "\n"+parseFloat(splitRes[1])+","+parseFloat(splitRes[3])+" Node Val"+node.latLng.lat);
		if ((node.latLng.lng <= parseFloat(splitRes[0]) ||
			node.latLng.lng >= parseFloat(splitRes[2])) ||
			(node.latLng.lat <= parseFloat(splitRes[1]) ||
				node.latLng.lat >= parseFloat(splitRes[3]))) {
			return true;
	} else {
		return false;
	}
}

function setDefaultSourceNodes() {
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
					outerNode.marker = L.marker(outerNode.latLng).addTo(mymap);
					// outerNode.marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false}).openPopup();
					sourceNodes.push(outerNode);
				}
			}
		}
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
		sourceNodes[j].marker.bindPopup("",{closeOnClick: false, autoClose: false, autoPan: false});
		for(var i = 0; i<sourceNodes[j].outCells.length; i++) {
			sourceCells.push(sourceNodes[j].outCells[i]);
		}
	}
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
	message+= "Outcoming Ways Ids: "+nodes[nodeId].outCells.length;
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
		if ((node.inWays.length + node.outWays.length) > 2) { //Cari intersection node
			intersectionNodes.push(node);
			markers.push(L.marker(node.latLng));	
		}
	}
	var result = [];
	result[0] = (intersectionNodes);
	result[1] = (markers);
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
	result[0] = (intersectionNodes);
	result[1] = (markers);
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
	var clockTick = parseInt($("#clockTick").val()); //satuan detik (second)
	var avgVLength = parseInt($("#vLength").val());
	var clock = 1;
	var intValue = $("#simV").val()*1000;
	createWaySegments(clockTick, avgVLength); //Instansiasi segments dan cells
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
	initInterCells();
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
		for (var i = 0; i<cells.length; i++) {
			cells[i].statUpdate();
		}

		//Set nilai send dan receiveCap yang belum final, akses mundur dari masing-masing cell final
		// alert("Final Cells length:"+finalCells.length);
		// alert("out?");
		
		for (var i = 0; i<updatedCells.length; i++) {
			updatedCells[i].receive(true);
		}
		updatedCells = [];

		//Setiap cell sudah diupdate statnya sesuai dengan receiveCap (N-n dan S)
		//Beberapa sel sudah final, jadi sekarang update intersection cell yang final
		//Intersection cell final akan update inCellsnya menjadi final sehingga akan merambat ke intersection cell lain
		//Saat mencapai intersection cell, ditentukan apakah sel tersebut sudah final atau belum
		//Kalau sudah final, masukan ke finalCellsQueue untuk nanti diupdate
		alert("finalCellsQueue length:"+finalCellsQueue.length);
		while (finalCellsQueue.length>0) { //menggunakan mekanisme queue, shift() mengeluarkan elemen pertama dan geser yang lain
			// alert("finalCellsQueue length:"+finalCellsQueue.length);
			var finalIntersection = finalCellsQueue.shift();
			// finalIntersection.distribute(); //ada kemungkinan intersectCell baru masuk ke finalCellsQueue, lakukan mekanisme yang sama selama masih ada
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
	clearInterval(simulationTimer);
}