function createNodes(xml) { 
	var nodes = xml.getElementsByTagName("node");

	result = [];
	for (var i = 0; i<nodes.length; i++) {
		var node = nodes[i];
		//satu objek node
		var node_ins = {
			//ATRIBUT DASAR NODE
			id : node.getAttribute("id"),
			latLng : L.latLng(node.getAttribute("lat"), node.getAttribute("lon")),
			tags : L.OSM.getTags(node),
			type : null, //jenis node, penghubung way, traffic light, terminal, initial
			isIntersect : false, //defaultnya false, asumsi node berupa node penghubung
			isSource: false,
			isSink: false,
			//=======================================

			//METHOD
			addInWays: function(way) { //menambahkan way masuk ke node, untuk inisialisasi
				this.incomingWays.push(way);
				this.signalPhase++;
			},
			addOutWays: function(way) { //menambahkan way keluar dari node, untuk inisialisasi
				this.outgoingWays.push(way);
			},
			moveQueue: function() { //Traffic signal coordinator untuk masing-masing node
				//kurangi jumlah antrean dari in way, masing-masing in ways jumlahnya akan dikurangi
				//Jumlah kendaraan tersebut selanjutnya ditambahkan ke nMov outgoing ways
				//pengurangannya mengikuti durasi traffic light, jadi harus ada counter, untuk mengurangi
				//harus ada state yang disimpan, jalur mana yang bergerak atau yang mana
				//jadi harus ada satu attribute yang menentukan fase per durasi
				var currentPhase; //menentukan trafficSignal yang aktif atau incomingWays yang sedang hijau
				//Setiap incoming ways akan didistribusikan ke berbagai outgoingways secara probabilistik
				var probability; // peluang kendaraan akan memasuki outgoingWays
				//Array, isinya probability di masing-masing outgoingWays, kira-kira berapa yang akan masuk ke sana

				var timer;
				//Array isinya, durasi untuk masing-masing incomingNodes
				/*
				1. currentPhase --> menentukan incomingWays
				2. kurangi jumlah antrean dari incomingWays, nQue dari ways
				3. tambahkan jumlah moving dari outgoingWays, nMov dari masing-masing outWays
				4. Update timer dan update currentPhase
				*/
				
				/*
				Untuk intermediary nodes, jumlah kendaraan dari incomingWays dikurangi dan ditambahkan
				ke outgoingWays
				*/

				//INI JADI TIDAK USAH KARENA SUDAH DIHANDLE SECARA GENERIK DI BAWAH HAHAHAHAHAHAHAHA
				// if (this.isIntersect) { //moveQueue untuk di persimpangan jalan

				// } else { //moveQueue untuk intermediary nodes
					var nodeWays = []; //untuk menampung daftar jalan
					var validLinkCount; //untuk menentukan jumlah way yang akan menerima kendaraan dari incomingWays
					// var defaultIn = true; //asumsi awalnya semua jalannya masuk ke node
					if (this.incomingWays.length == 0) { //tidak adalah incomingWays, semuanya outgoing ways
						defaultIn = false;
						for (var i = 0; i<this.outgoingWays.length; i++) {
							var way = this.outgoingWays[i];
							var way_object = {
								way : way,
								dir : "out",
								nMovIdx : 1,
								updateIdx : 0
							}
							nodeWays.push(way_object);
							validLinkCount++;
							if (way.oneway) {
								way_object.nMovIdx = -1;
							}
						}
					} else if (this.outgoingWays.length == 0) {
						for (var i = 0; i<this.incomingWays.length; i++) {
							var way = this.incomingWays[i];
							var way_object = {
								way : way,
								dir : "in",
								nMovIdx : 0,
								updateIdx : 1
							}
							nodeWays.push(way_object);
							if (way.oneway) {
								way_object.updateIdx = -1;
							} else {
								validLinkCount++;	
							}
							
						}
					} else {
						for (var i = 0; i<this.incomingWays.length; i++) {
							var way = this.incomingWays[i];
							var way_object = {
								way : way,
								dir : "in",
								nMovIdx : 0,
								updateIdx : 1
							}
							nodeWays.push(way_object);
							if (way.oneway) {
								way_object.updateIdx = -1;
							} else {
								validLinkCount++;	
							}
						}
						for (var i = 0; i<this.outgoingWays.length; i++) {
							var way = this.outgoingWays[i];
							var way_object = {
								way : way,
								dir : "out",
								nMovIdx : 1,
								updateIdx: 0
							}
							nodeWays.push(way_object);
							if (way.oneway) {
								way_object.nMovIdx = -1;
							}
							validLinkCount++;
						}
					} //way sudah ditandai sebagai in atau out ways

					//Disini implement traffic light
					//index i untuk NodeWays baru berubah ketika lampu hijau/merah
					for (var i = 0; i<nodeWays.length; i++) {
						var weight; //Untuk menentukan jumlah kendaraan yang didistribusikan
						var proceed;
						var currentWay = nodeWays[i];
						if (currentWay.nMovIdx == 0) {
							if (currentWay.way.oneway) {
								weight = validLinkCount/nodeWays.length; //Semua link out digunakan
							} else {
								weight = (validLinkCount-1)/nodeWays.length; //Semua link out digunakan KECUALI link/way itu sendiri
							}
							proceed = true;

						} else if (currentWay.nMovIdx == 1) {
							if (currentWay.way.oneway) {
								proceed = false;
							} else {
								weight = (validLinkCount-1)/nodeWays.length; //Semua link out digunakan KECUALI link/way itu sendiri
								proceed = true;
							}
						}

						//Proceed untuk melanjutkan ke pendistribusian kendaraan (menyebarkan kendaraan dari sebuah incoming link)
						if (proceed) { //Di sini dilakukan perubahan jumlah kendaraan di jalan
							if (currentWay.nMovIdx != -1) {
								currentWay.way.nMov[currentWay.nMovIdx]-=10; //dikurangi jumlahnya di index yang sesuai
							}

							for (var j = i-1; j>=0; j--) {
								if ((currentWay.nMovIdx != -1) && (nodeWays[j].updateIdx != -1)) { //Kendaraan keluar hanya jika kendaraannya bukan in dan bukan searah
									nodeWays[j].way.nMov[nodeWays[j].updateIdx]+= 10; //ditambah sejumlah tertentu tergantung jumlah distribusinya
								}
							}

							for (var k = i+1; k<nodeWays.length; k++) {
								if ((currentWay.nMovIdx != -1) && (nodeWays[k].updateIdx != -1)) { //Kendaraan keluar hanya jika kendaraannya bukan in dan bukan searah
									nodeWays[k].way.nMov[nodeWays[k].updateIdx]+= 10; //ditambah sejumlah tertentu tergantung jumlah distribusinya
								}
							}
						}
					}
			},
			//============================================

			//REPORTING ATTRIBUT untuk melakukan analisis
			marker: null //popup untuk menampilkan jumlah kendaraan secara real time saat simulasi


		}
		node_ins.marker = L.marker(node_ins.latLng);
		result[node_ins.id] = node_ins;
		nodeIds.push(node_ins.id);
		/*alert("Incoming ways length = "+node_ins.incomingWays.length);*/
	}
	return result;
}

//Membuat struktur data jalan baru untuk digunakan dalam simulasi
//Jalan ini nanti menjadi Cell dalam Cell Transmission Model
function createWays(xml) {
	nodes = createNodes(xml);
	//---------------------
	var result = [];
    var ways = xml.getElementsByTagName("way");
    // alert("Enter Loop");
    for (var i = 0; i < ways.length; i++) {
      	var way = ways[i], nds = way.getElementsByTagName("nd");
      	var tags = L.OSM.getTags(way);
      	//satu way terdiri dari beberapa node, distandarkan linknya ke dalam segmen antar node
      	var reverse = false;
      	var onewayValid = false;
      	if (tags["oneway"]=="-1") { //oneway==-1 artinya tetap oneway tetapi arahnya terbalik
      		reverse = true;
      		onewayValid = true;
      	} else if (tags["oneway"]=="yes") {
      		onewayValid = true;
      	}

      	if (tags["avgspeed"] == null) {
      		tags["avgspeed"] = 30; //isi default kalau tidak ada tag avgspeed
      	}

      	for (var j = 0; j<nds.length-1; j++) { //setiap penghubung node jadi satu way sendiri
      		var way_object = {
				id: way.getAttribute("id"),
				nodes : null,
				wayClass : 1, //kelas jalan
	        	tags: tags, //tag disamakan
				oneway : true, //distandarkan, tidak perlu pakai oneway=-1 seperti di xml, default true
				cells : new Array(2), //array isi cell, indeks 0 untuk default, indeks 1 untuk arah balik
				maxQ : new Array(2), //input flow Maksimum, (kecepatan/average panjang mobil)*jumlahlane(priority jalan)
				density : 0, //density menyatakan tingkat kepadatan, jumlahlane(priority jalan)/average panjang mobil
				delay : 0, //satu way terdiri atas beberapa cell, karena akan dilihat 1 way = 1 cell, jadi dalam 1 clock tick, kendaraan tidak bisa lolos
				//delaynya sesuai dengan jumlah cell, misal 1 way = 3 cell, jadi ada delay 3 clock tick
				Q : new Array(2), //immediate maximum input flow a
				nMov : new Array(2), //nMov[0] jumlah kendaraan bergerak di arah default, nMov[1] sebaliknya
				//nQue : new Array(), //nQue[0] jumlah kendaraan antre di ujung arah default, nQue[1] sebaliknya
				y : 0, //actual input flow a
				t : 0, //inisialisasi 
				v : tags["avgspeed"], //average speed
				marker : null //marker untuk line adalah polyline
	    	};

	    	//Validasi oneway, dan penentuan urutan nodes berdasarkan reverse
	    	way_object.oneway = onewayValid;

	    	if (reverse) { //nodes baru diisi ketika reverse sudah fix
	    		way_object.nodes = [nodes[nds[j+1].getAttribute("ref")], nodes[nds[j].getAttribute("ref")]];
	    	} else {
				way_object.nodes = [nodes[nds[j].getAttribute("ref")], nodes[nds[j+1].getAttribute("ref")]];
	    	}

	    	//Inisialisasi cells, 1 way = 1 cells (1 cells = array of cell)
	    	//function createCells
	    	cells[0] = null;
	  		cells[1] = null;

	    	
	    	result.push(way_object);
      	}
    }

    for (var i=0; i<result.length; i++) {
    	var way = result[i];
    	var latLngs = [way.nodes[0].latLng, way.nodes[1].latLng];
    	if (way.oneway) {
    		way.marker = L.polyline(latLngs, {color:"green"}).addTo(mymap); //marker diisi polyline, nanti bindPopup ke marker
    	} else {
    		way.marker = L.polyline(latLngs, {color:"blue"}).addTo(mymap); //marker diisi polyline, nanti bindPopup ke marker
    	}
    	// way.marker.bindPopup("Jumlah nMov: "+way.nMov[0]).openPopup();
    	way.nodes[0].addOutWays(way); //Node 0 artinya kendaraan keluar dari node tersebut, lalu masuk ke jalan sampai di node 1
    	way.nodes[1].addInWays(way);
    }

    // alert("Exit loop");
}

function getGeneratingNodes() { 
	//ambil data xml map
	//Ambil data boundary, di tag <bounds>
	var generatingNodes = []; //berisi id dari masing-masing generating nodes
	var boundaryData = mapxml.getElementsByTagName("bounds");
	var boundary = {};
	boundary.minlat = parseFloat(boundaryData[0].getAttribute("minlat"));
	boundary.minlon = parseFloat(boundaryData[0].getAttribute("minlon"));
	boundary.maxlat = parseFloat(boundaryData[0].getAttribute("maxlat"));
	boundary.maxlon = parseFloat(boundaryData[0].getAttribute("maxlon"));
	/*L.marker([boundary.minlat, boundary.minlon]).addTo(mymap);
	L.marker([boundary.maxlat, boundary.maxlon]).addTo(mymap);*/
	var local_nodes = mapxml.getElementsByTagName("node");
	var ways = L.OSM.getWays(mapxml, L.OSM.getNodes(mapxml));
	var outerNodes = [];
	var outerNodesById = [];
	var outerWays = [];
	var i,j;
	j=0;
	for (i = 0; i<local_nodes.length; i++) {
		var lat = parseFloat(local_nodes[i].getAttribute("lat"));
		var lon = parseFloat(local_nodes[i].getAttribute("lon"));
		var id = local_nodes[i].getAttribute("id");
		if ((lat <= boundary.minlat || 
			lat >= boundary.maxlat) ||
			(lon <= boundary.minlon || 
			lon >= boundary.maxlon)) {
			outerNodes.push(local_nodes[i]);
			outerNodesById[id] = local_nodes[i];
			alert(outerNodesById[id].getAttribute("id"));
			// terminalNodeMarker = L.marker([lat,lon]).addTo(mymap);
			// terminalMarkers.push(terminalNodeMarker);
			j++;
		}	
	} //outerNodes sudah dicatat

	for (i = 0; i<outerNodes.length; i++) { //cek masing-masing outer node
		var j;
		var id = outerNodes[i].getAttribute("id");
		for (j=0; j<ways.length; j++) { //cek masing-masing ways di seluruh map
			var nds = ways[j].nodes;
			var k = 0;
			var found = false;
			while (!found && k<nds.length) { //cek masing-masing nd di sebuah way
				if (nds[k].id == id) {
					found = true;
					var l = 0;
					var wayFound = false;
					while (!wayFound && l < outerWays.length) { //cek apakah sudah dicatat dalam outer node
						if (outerWays[l].id ==  ways[j].id) { //jika sudah, jangan dicatat lagi
							wayFound = true;
						}
						l++;
					}
					if (!wayFound) {
						outerWays.push(ways[j]); //way yang mengandung node terluar sudah dicatat
					}
				}
				k++;
			}
		}
	} //outerWay sudah dicatat

	for (i = 0; i<outerWays.length; i++) {
		var way = outerWays[i];
		var nds = way.nodes;
		var ndStart = nds[0];
		var ndLat = parseFloat(ndStart.latLng.lat);
		var ndLon = parseFloat(ndStart.latLng.lng);
		//asumsi arah default benar, nd start di luar boundary
		//Salah satu ujung jalan pasti ada di dalam boundary
		//Cari ujung jalan di luar boundary
		if ((ndLat <= boundary.minlat || 
			ndLat >= boundary.maxlat) ||
			(ndLon <= boundary.minlon || 
			ndLon >= boundary.maxlon)) { //cek nd[0]
			//nd[0] ada di luar sehingga digunakan untuk mengenerate kendaraan
			//jalan dua arah atau satu arah tidak masalah
			if (!(way.tags["oneway"] == "-1")) { //Jika jalan satu arah terbalik dan nd[0] ada di luar boundary, nd[0] tidak digunakan
				L.marker([ndStart.latLng.lat,ndStart.latLng.lng]).addTo(mymap); //initial node terpilih
				generatingNodes.push(ndStart.id); //catat id nya
				nodes[ndStart.id].isGenerating = true;
			}	
		} else { //nd[0] ada di dalam boundary
			//cek dulu apakah jalan satu arah
			//nd Start di dalam, nd End diluar, cek apakah dua arah
			if (!(way.tags["oneway"]=="yes")) { //Jika jalan satu arah, nd[0] tidak digunakan
				ndStart = nds[nds.length-1]; //node di luar yang dipilih untuk generate kendaraan	
				//L.marker([ndStart.latLng.lat,ndStart.latLng.lng]).addTo(mymap);
				generatingNodes.push(ndStart.id); //catat id nya
				nodes[ndStart.id].isGenerating = true;
			}
		}
	} //generating nodes sudah dicatat
	alert("Jumlah Generating Node: "+outerWays.length+" Generating Nodes sudah dicatat di variabel generatingNodes");
	return generatingNodes;
}

function getIntersectingNodes() {
	var nodeList = [];
	var count = 0;
	var xmlNodes = mapxml.getElementsByTagName("node");
	var nodeIds = [];
	for (var i = 0; i<xmlNodes.length; i++) { //Karena iterate sparse matrix susah, jadi manual T______T ngambil dari xml
		var node = xmlNodes[i];
		nodeIds.push(node.getAttribute("id"));
	} //semua node id diambil lagi huhu T____T

	for (var i = 0; i<nodeIds.length; i++) {
		var id = nodeIds[i];
		if ((nodes[id].incomingWays.length + nodes[id].outgoingWays.length) > 2) {
			nodeList.push(id);
			nodes[id].marker = L.marker(nodes[id].latLng).addTo(mymap);
		}
	}
	alert("Intersecting node length = "+nodeList.length);
	return nodeList;
}

//DEBUGGING PURPOSE, cek way masuk dan keluar dari sebuah node
function getNode(id) {
	var found = false;
	var i=0;
	var message = "";
	//var nodes = createNodes(xml);
	
	if (nodes!=null) {
		message+= "Incoming Nodes: ";
		for (var j = 0; j<nodes[id].incomingWays.length; j++) {
			var way = nodes[id].incomingWays[j];
			message+=way.id+", ";
		}
		message+= " | Outgoing Ways: ";
		for (var j = 0; j<nodes[id].outgoingWays.length; j++) {
			var way = nodes[id].outgoingWays[j];
			message+=way.id+", ";
		}	
	} else {
		message+= "Nodes kosong";
	}
	return message;
}

function runSimulation(xml) {
	//Jalankan originNodes untuk menentukan nodes yang akan menghasilkan kendaraan
	//Buat struktur data untuk jalan dan nodesnya
	//Tiap nodes punya signal duration, nanti diupdate jumlah kendaraan yang
	//Kendaraan masuk --> nQue dikurangi
	//Kendaraan keluar --> nMov di jalan lain dikurangi
	//Kendaraan keluar --> nMov di jalan lain dikurangi
	// alert("Enter run?");
	var simulationDuration = 7200000; //Default duration dicoba 7200 detik dulu buat dalam milisecond 
	var simulationFrame = 1000; //Satuan milisecond, 1000 milisecond

	//Inisialisasi
	var ways = createWays(xml);
	var generatingNodes = getGeneratingNodes(); //array id generating nodes
	var intersectingNodes = getIntersectingNodes(); //array id intersecting nodes
	// alert("Outgoing ways: "+node.outgoingWays.length+" Incoming Ways: "+node.incomingWays.length);
	var simulationInterval = setInterval( function() {
		$("#timer").html(simulationDuration/1000);
		//Inisialisasi
		 //nantinya akan diisi oleh function createNodes

		/*
		1. Generate kendaraan dari masing-masing origin nodes
		2. Update jumlah kendaraan di setiap node
		*/

		//TEST GENERATING NODES
		for (var j = 0; j<nodeIds.length; j++) { //array berisi id way, [id1,id2,id3,...]
			var node = nodes[nodeIds[j]];
			if (node.isGenerating) { //Untuk mengelola generating nodes
				//Defaultnya untuk setiap node kita pakai yang outgoing nodes
				//Defaultnya juga outgoing nodes hanya ada satu, karena terhubung dengan 1 jalan
				//Cek outgoingWays
				//alert("OutgoingWays: "+node.outgoingWays.length);
				
				for (var i =0; i<node.outgoingWays.length; i++) {
					//ada outgoingWays, maka nMov ditambahkan di nMov[0] ways tersebut karena arah default.
					//Karena default sebagai outgoing ways, jalan dua arah atau satu arah sama saja
					// alert("Enter outgoingWays loop");
					var way = node.outgoingWays[i];

					way.nodes[0].marker.remove();
					way.nodes[1].marker.remove();
					way.nodes[0].marker.addTo(mymap);
					way.nodes[0].marker.bindPopup("start");
					way.nodes[1].marker.addTo(mymap);
					way.nodes[1].marker.bindPopup("finish");

					// alert("nMov: "+way.nMov.length);
					if ((simulationDuration/1000)% 5 == 0) {
						way.nMov[0]+= 10; //arah default, nMov[0] yang ditambah, artinya generate kendaraan	
					}
					way.marker.closePopup();

					if (way.oneway) {
						way.marker.bindPopup("Jumlah nMov = "+way.nMov[0],{autoPan:false, offset : L.point(0,-20)}).openPopup(); //nanti bindPopup disesuaikan lagi untuk jalan satu arah atau dua arah	
					} else {
						way.marker.bindPopup("Upstream nMov = "+way.nMov[0]+"\n Downstream nMov = "+way.nMov[1],{autoPan:false, offset : L.point(0,-20)}).openPopup(); //nanti bindPopup disesuaikan lagi untuk jalan satu arah atau dua arah
					}
				}

				//Cek incomingWays
				// alert("IncomingWays: "+node.incomingWays.length);
				for (var i =0; i<node.incomingWays.length; i++) {
					//tidak ada outgoingWays, generatingNodes menjadi ujung keluar jalan
					//Cek dulu apakah jalan dua arah, setiap node minimal ada 1 in/out ways, jadi aman kalau dicek
					// alert("Enter incomingWays loop");
					var way = node.incomingWays[i];

					way.nodes[0].marker.remove();
					way.nodes[1].marker.remove();
					way.nodes[0].marker.addTo(mymap);
					way.nodes[0].marker.bindPopup("start");
					way.nodes[1].marker.addTo(mymap);
					way.nodes[1].marker.bindPopup("finish");

					if ((simulationDuration/1000) % 5 == 0) { //Generate jumlah kendaraan
						way.nMov[1]+= 10; //arah sebaliknya, nMov[1] yang ditambah, artinya generate kendaraan di jalan dua arah	
					}
					way.marker.closePopup();
					way.marker.bindPopup("Upstream nMov = "+way.nMov[0]+"\n Downstream nMov = "+way.nMov[1],{autoPan:false, offset : L.point(0,-20)}).openPopup(); //nanti bindPopup disesuaikan lagi untuk jalan satu arah atau dua arah
				}	
			} else if (node.isIntersect) { //Bukan generating nodes, tetapi intersection

			} else { //Bukan generating nodes dan bukan intersection, berupa node perantara
				if ((simulationDuration/1000) % node.avTime == 0) {
					node.moveQueue();
				}
			}
		}

		//TEST MARKING INTERSECTING NODE
		/*for (var j = 0; j<intersectingNodes.length; j++) {
			var node = nodes[intersectingNodes[j]];
			
			node.marker.bindPopup("Intersecting node");
		}*/
		// alert("Exit for loop");

		//TEST UPDATE VEHICLE NUMBER

		simulationDuration -= simulationFrame;
		if (simulationDuration<=0) {
			clearInterval(simulationInverval);
		}
	}, simulationFrame);
}