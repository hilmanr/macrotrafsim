//Variabel global untuk object nodes dan ways
//Jadi hanya perlu dibuat sekali ketika load map
//Menggunakan dasar dari leaflet-osm.js, link https://github.com/jfirebaugh/leaflet-osm
var nodes = {};
var ways = {};
var bound = {};
var layerArr = [];
var initialLayerGroup = {};
L.OSM = {};

L.OSM.TileLayer = L.TileLayer.extend({
	options: {
		url: document.location.protocol === 'https:' ?
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' :
		'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		attribution: '© <a href="http://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
	},

	initialize: function (options) {
		options = L.Util.setOptions(this, options);
		L.TileLayer.prototype.initialize.call(this, options.url);
	}
});

L.OSM.Mapnik = L.OSM.TileLayer.extend({
	options: {
		url: document.location.protocol === 'https:' ?
		'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' :
		'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		maxZoom: 19
	}
});

L.OSM.DataLayer = L.FeatureGroup.extend({
	options: {
		areaTags: ['area', 'building', 'leisure', 'tourism', 'ruins', 'historic', 'landuse', 'military', 'natural', 'sport'],
		uninterestingTags: ['source', 'source_ref', 'source:ref', 'history', 'attribution', 'created_by', 'tiger:county', 'tiger:tlid', 'tiger:upload_uuid'],
		styles: {}
	},

	initialize: function (xml, options) {
		L.Util.setOptions(this, options);

		L.FeatureGroup.prototype.initialize.call(this);

		if (xml) {
			this.addData(xml);
		}
	},

	addData: function (features) {
		if (!(features instanceof Array)) {
			features = this.buildFeatures(features);
		}

		for (var i = 0; i < features.length; i++) {
			var feature = features[i], layer;

			//Gambar changeset
			if (feature.type === "changeset") {
				layer = L.rectangle(feature.latLngBounds, this.options.styles.changeset);
			} else if (feature.type === "node") { //gambar node
				layer = L.circleMarker(feature.latLng, {color:"blue"});

			} else { //gambar relation dan way
				var latLngs = new Array(feature.nodes.length);

				for (var j = 0; j < feature.nodes.length; j++) {
					latLngs[j] = feature.nodes[j].latLng;
				}
				layer = L.polyline(latLngs, {color:"grey"});
			}

			//Dari library masternya, digunakan untuk getBoundsLayer Saja
			layer.addTo(this);
			layer.feature = feature;
		}
},

buildFeatures: function (xml) {
	var features = L.OSM.getChangesets(xml),
	nodes = L.OSM.getNodes(xml),
	ways = L.OSM.getWays(xml, nodes);

	for (var node_id in nodes) {
		var node = nodes[node_id];
		features.push(node);
	}

	for (var i = 0; i < ways.length; i++) {
		var way = ways[i];
		features.push(way);
	}

	return features;
}

});

L.Util.extend(L.OSM, {
	getChangesets: function (xml) {
		var result = [];

		var nodes = xml.getElementsByTagName("bounds");
		for (var i = 0; i < nodes.length; i++) {
			var node = nodes[i];
			//variabel global
			bound = {
				id: "bound",
				type: "changeset",
				latLngBounds: L.latLngBounds(
					[node.getAttribute("minlat"), node.getAttribute("minlon")],
					[node.getAttribute("maxlat"), node.getAttribute("maxlon")]),
			};
			result.push(bound);
		}

		return result;
	},

	getNodes: function (xml) {
		var result = {};
		var count = 0;
		var xmlNodes = xml.getElementsByTagName("node");
		for (var i = 0; i < xmlNodes.length; i++) {
			var node = xmlNodes[i], id = node.getAttribute("id");
			result[id] = {
				id: id,
				type: "node",
				latLng: L.latLng(node.getAttribute("lat"),
					node.getAttribute("lon"),
					true),
				tags: this.getTags(node),
				//Disini tambahan untuk langsung masuk ke simulasi lebih mudah
				isIntersect : false, //true = persimpangan, false = jalan lurus
				isIntermediate : false,
				isSource : false, //source node lokal sebuah way, bukan dalam jaringan
				isSink : false, //sink node lokal sebuah way, bukan dalam jaringan
				inWays : [], //daftar jalan masuk, HANYA DIMILIKI DI UJUNG-UJUNG JALAN
				outWays : [], //daftar jalan keluar, HANYA DIMILIKI DI UJUNG-UJUNG JALAN
				intersectCell : null,
				inCells : [], //untuk akomodasi custom source Cell
				outCells : [], //untuk akomodasi custom source Cell
				// wayCount : 0, //jumlah way yang memiliki node ini, sink/source hanya punya 1,
				//tapi tetap harus dicatat karena waycount = 1 bisa sink atau source
				inCellsCount : 0, //dicatat sendiri karena statik sementara objek cells (meskipun jumlahnya sama) bisa berubah (menjadi objek yang lain)
				outCellsCount : 0,
				marker : null, //untuk membuat marker supaya bisa diakses balik
				circleMarker : null

			};
			count++;
		}
		//Set variabel global nodes
		nodes = result;
		// alert("Node count: "+count);


		return result;
	},

	getWays: function (xml, nodes) { //XML sudah difilter dari XML, disini hanya convert ke object saja
		var result = [];

		var waysXML = xml.getElementsByTagName("way");
		for (var i = 0; i < waysXML.length; i++) {
			var way = waysXML[i], nds = waysXML[i].getElementsByTagName("nd");

			var way_object = {
				id: way.getAttribute("id"),
				editStat : 0, //0 = default kondisi awal, 1 = edited to oneway, default sebagai oneway, 2 = edited to oneway, alternate sebagai oneway, 3 = edited to two way
				type: "way",
				nodes: new Array(nds.length),
				tags: this.getTags(way),
				wayClass: 0,
				segments: [] //menampung segmen
			};

			//KELAS JAlAN
			//SEMENTARA DIGUNAKAN UNTUK MENENTUKAN DISTRIBUSI KENDARAAN
			if (way_object.tags["highway"]=="primary") { 
				way_object.wayClass = 5;
			} else if (way_object.tags["highway"]=="primary_link") {
				way_object.wayClass = 4;
			} else if (way_object.tags["highway"]=="secondary") {
				way_object.wayClass = 3;
			} else if (way_object.tags["highway"]=="secondary_link") {
				way_object.wayClass = 3;
			} else {
				way_object.wayClass = 2;
			}

			var k; //untuk iterasi balik
			var reverse; //untuk iterasi balik
			if (way_object.tags["oneway"] == -1) {
				way_object.tags["oneway"] = true;
				k = nds.length-1;
				reverse = true; //false
			} else {
				k = 0;
				reverse = false;
			}

			for (var j = 0; j<nds.length; j++) {
				way_object.nodes[j] = nodes[nds[k].getAttribute("ref")];
				if (reverse) {
					k--;
				} else {
					k++;
				}
			}//Urutan nodes sudah uniform untuk setiap ways, tidak ada arah (-1) jadi akses lebih seragam

			way_object.nodes[0].outWays.push(way_object);
			way_object.nodes[way_object.nodes.length-1].inWays.push(way_object);

			//Cek apakah intersect atau tidak
			if ((way_object.nodes[0].outWays.length + way_object.nodes[0].inWays.length)>2) {
				way_object.nodes[0].isIntersect = true;  
			//Jangan lupa set merging dan diverging cellnya
			}
			if ((way_object.nodes[[way_object.nodes.length-1]].inWays.length + way_object.nodes[[way_object.nodes.length-1]].outWays.length)>2) {
				way_object.nodes[[way_object.nodes.length-1]].isIntersect = true;  
			//Jangan lupa set merging dan diverging cellnya
			}

			//Dipakai untuk simulation.js getWaySegment

			result.push(way_object);
		}

		//Set variabel global ways
		ways = result;
		//alert("Way Count: "+ways.length);

		return result;
	},

	getTags: function (xml) {
		var result = {};
		var tags = xml.getElementsByTagName("tag");
		for (var j = 0; j < tags.length; j++) {
			result[tags[j].getAttribute("k")] = tags[j].getAttribute("v");
		}
		//cek tag oneway
		if (!result.hasOwnProperty("oneway")) {
			result["oneway"] = false;
		} else {
			if (result["oneway"] == "yes") {
				result["oneway"] = true;
			} else if (result["oneway"] == "no") {
				result["oneway"] = false;
			}
		}//tag oneway hanya berisi true, false, atau -1

		if (!result.hasOwnProperty("avgspeed")) {
			result["avgspeed"] = 30;
		}

	return result;
	}
});
