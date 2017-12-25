// var nodes = L.OSM.getNodes(mapxml);
// var ways = L.OSM.getWays(mapxml, nodes);

var nodes;

//Menjalankan simulasi menggunakan timer

function runSimulation(xml) {
	//Jalankan originNodes untuk menentukan nodes yang akan menghasilkan kendaraan
	//Buat struktur data untuk jalan dan nodesnya
	//Tiap nodes punya signal duration, nanti diupdate jumlah kendaraan yang
	//Kendaraan masuk --> nQue dikurangi
	//Kendaraan keluar --> nMov di jalan lain dikurangi
	alert("Enter run?");
	var simulationDuration = 7200; //Default duration dicoba 7200 detik dulu buat dalam milisecond 
	var simulationFrame = 1000; //Satuan milisecond, 1000 milisecond

	//Inisialisasi
	var nodes = createNodes(xml);
	var ways = createWays(xml);
	alert("Enter interval");
	var simulationInterval = setInterval(function() {
		//Inisialisasi
		 //nantinya akan diisi oleh function createNodes

		/*
		1. Generate kendaraan dari masing-masing origin nodes
		2. Update jumlah kendaraan di setiap node
		*/

		//TEST GENERATING NODES
		alert("Enter generating nodes");
		var generatingNodes = getGeneratingNodes(); //array id generating nodes
		alert("Enter for loop");
		for (id in generatingNodes) { //array berisi id, [id1,id2,id3,...]
			var node = nodes[id];
			//Defaultnya untuk setiap node kita pakai yang outgoing nodes
			//Defaultnya juga outgoing nodes hanya ada satu, karena terhubung dengan 1 jalan
			//Cek outgoingWays
			for (var i =0; i<node.outgoingWays.length; i++) {
				//ada outgoingWays, maka nMov ditambahkan di nMov[0] ways tersebut karena arah default.
				//Karena default sebagai outgoing ways, jalan dua arah atau satu arah sama saja
				var way = node.outgoingWays[i];
				way.nMov[0]+= 10; //arah default, nMov[0] yang ditambah, artinya generate kendaraan
				way.marker.bindPopup(way.nMov[0]).openPopup(); //nanti bindPopup disesuaikan lagi untuk jalan satu arah atau dua arah
			}

			//Cek incomingWays
			for (var i =0; i<node.incomingWays.length; i++) {
				//tidak ada outgoingWays, generatingNodes menjadi ujung keluar jalan
				//Cek dulu apakah jalan dua arah, setiap node minimal ada 1 in/out ways, jadi aman kalau dicek
				var way = node.incomingWays[i];
				if (!way.oneway) {
					way.nMov[1]+= 10 //arah sebaliknya, nMov[1] yang ditambah, artinya generate kendaraan di jalan dua arah
					way.marker.bindPopup(way.nMov[1]).openPopup();
				}
			}
		}
		alert("Exit for loop");

		simulationDuration -= simulationFrame;
		if (simulationDuration==0) {
			clearInterval(simulationInverval);
		}
	}, simulationFrame);
}

/*
Membuat ulang node untuk digunakan dalam simulasi.
Menggunakan sparse matrix, index berupa id node.
Masing-masing node merepresentasikan traffic signal.
Jika node tidak berupa traffic signal (sebagai penghubung di jalan), maka signal durationnya 0.
Node nanti akan berfungsi mengupdate jumlah kendaraan yang ada di jalan.
Masing-masing node memiliki akses ke masing-masing way yang terhubung.
Node akan menjalankan fungsi lampu lalu lintas dan akan mengupdate jumlah kendaraan di 
jalan-jalan yang terhubung.
Simulator akan menggunakan sebuah main controller yang menentukan durasi simulasi dan menjalankan
waktu simulasi.
Objek nodes akan digunakan oleh main controller tersebut untuk menjalankan simulasi.
*/
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
			trafficLights : null,
			nMov : 0, //jumlah kendaraan yang sedang jalan di persimpangan jalan
			//=======================================

			//REPRESENTASI LAMPU LALU LINTAS
			incomingWays: new Array(), //ways masuk ke node, digunakan untuk traffic signal
			outgoingWays: new Array(), //ways keluar dari node
			signalPhase: 0,
			signalDuration: new Array(), //signal duration = 0 artinya tanpa traffic light
			cycleDuration: 60, //default cycle duration 1 menit = 60 detik
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
			},
			//============================================

			//REPORTING ATTRIBUT untuk melakukan analisis
			nodePopUp: null, //popup untuk menampilkan jumlah kendaraan secara real time saat simulasi


		}
		result[node_ins.id] = node_ins;
	}
	return result;
}

//Membuat struktur data jalan baru untuk digunakan dalam simulasi
function createWays(xml) {
	nodes = createNodes(xml);
	//---------------------
	var result = [];
    var ways = xml.getElementsByTagName("way");
    alert("Enter Loop");
    for (var i = 0; i < ways.length; i++) {
      	var way = ways[i], nds = way.getElementsByTagName("nd");
      	var tags = L.OSM.getTags(way);
      	//satu way terdiri dari beberapa node, distandarkan linknya ke dalam segmen antar node
      	var reverse = false;
      	if (tags["oneway"]=="-1") { //oneway==-1 artinya tetap oneway tetapi arahnya terbalik
      		reverse = true;
      	}

      	for (var j = 0; j<nds.length-1; j++) { //setiap penghubung node jadi satu way sendiri
      		var way_object = {
				id: way.getAttribute("id"),
				nodes : null,
	           	nodesLatLng: null, //urutan menyatakan arah kendaraan jika satu arah, inisialisasi
	        	tags: tags, //tag disamakan
				oneway : true, //distandarkan, tidak perlu pakai oneway=-1 seperti di xml, default true
				priority : 0,
				capacity : new Array(2), //capacity[0] untuk arah default, capacity[1] sebaliknya
				nMov : new Array(2), //nMov[0] jumlah kendaraan bergerak di arah default, nMov[1] sebaliknya
				nQue : new Array(2), //nQue[0] jumlah kendaraan antre di ujung arah default, nQue[1] sebaliknya
				travelTime : 0, //inisialisasi
				avSpeed : 0,
				marker : null //marker untuk line adalah polyline
	    	};

	    	if (reverse) { //nodes baru diisi ketika reverse sudah fix
	    		// nodes = [nds[j+1].getAttribute("ref"),nds[j].getAttribute("ref")];
	    		//UNTUK PENGUJIAN
	    		//way_object.nodes = [node1,node2], array berisi 2 node
	    		way_object.nodes = [nodes[nds[j+1].getAttribute("ref")], nodes[nds[j].getAttribute("ref")]];
	    		// L.polyline(way_object.nodes, {color:"red"}).addTo(mymap);
	    	} else {
				// nodes = [nds[j].getAttribute("ref"),nds[j+1].getAttribute("ref")];
				// way_object.nodesLatLng = [nodes[nds[j].getAttribute("ref")].latLng, nodes[nds[j+1].getAttribute("ref")].latLng];
				way_object.nodes = [nodes[nds[j].getAttribute("ref")], nodes[nds[j+1].getAttribute("ref")]];
				if (tags["oneway"] == "no") {
		    		way_object.oneway = false;
		    		// L.polyline(way_object.nodes, {color:"green"}).addTo(mymap);
		    	}	
	    	}
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
    	way.nodes[0].addOutWays(way); //Node 0 artinya kendaraan keluar dari node tersebut, lalu masuk ke jalan sampai di node 1
    	way.nodes[1].addInWays(way);
    }

    alert("Exit loop");
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

//Memperoleh Node-Node batas yang akan generate kendaraan
function getGeneratingNode() { 
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
	var nodes = mapxml.getElementsByTagName("node");
	var ways = L.OSM.getWays(mapxml, L.OSM.getNodes(mapxml));
	var outerNodes = [];
	var outerNodesById = [];
	var outerWays = [];
	var i,j;
	j=0;
	for (i = 0; i<nodes.length; i++) {
		var lat = parseFloat(nodes[i].getAttribute("lat"));
		var lon = parseFloat(nodes[i].getAttribute("lon"));
		var id = nodes[i].getAttribute("id");
		if ((lat <= boundary.minlat || 
			lat >= boundary.maxlat) ||
			(lon <= boundary.minlon || 
			lon >= boundary.maxlon)) {
			outerNodes.push(nodes[i]);
			outerNodesById[id] = nodes[i];
			//alert(outerNodesById[id].getAttribute("id"));
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
			if (!(way.tags["oneway"] == "-1")) { //Jika jalan satu arah (atau dua arah) dan nd[0] ada di luar boundary, nd[0] tidak digunakan
				L.marker([ndStart.latLng.lat,ndStart.latLng.lng]).addTo(mymap); //initial node terpilih
				generatingNodes.push(ndStart.id); //catat id nya
			}	
		} else { //nd[0] ada di dalam boundary
			//cek dulu apakah jalan satu arah
			//nd Start di dalam, nd End diluar, cek apakah dua arah
			if (!(way.tags["oneway"]=="yes")) { //Jika jalan satu arah, nd[0] tidak digunakan
				ndStart = nds[nds.length-1]; //node di luar yang dipilih untuk generate kendaraan	
				L.marker([ndStart.latLng.lat,ndStart.latLng.lng]).addTo(mymap);
				generatingNodes.push(ndStart.id); //catat id nya
			}
		}
	} //generating nodes sudah dicatat
	alert("Jumlah Generating Node: "+outerWays.length+" Generating Nodes sudah dicatat di variabel generatingNodes");
	return generatingNodes;
}

function runSimulationB(xml) {
	alert("simulation B");
}

function createSimulation(xml) {
	alert("createSimulation");
}