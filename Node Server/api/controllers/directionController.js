'use strict';

// var mongoose = require('mongoose'),	Direction = mongoose.model('Directions'),
var fs = require("file-system"), DOMParser = require("xmldom").DOMParser, 
http = require("http");

var googleMapsClient = require('@google/maps').createClient({
	key: 'AIzaSyADdQhERrPacCgqGzkOSpqewkjI6_IeU8Y'
})

exports.getSavedDirection = function(req,res) {

	var originLat = parseFloat(req.params.originLat);
	var originLng = parseFloat(req.params.originLng);
	var destLat = parseFloat(req.params.destLat);
	var destLng = parseFloat(req.params.destLng);

	Direction.find({
		"json.routes.0.legs.0.start_location.lat": originLat,
		"json.routes.0.legs.0.start_location.lng": originLng,
		"json.routes.0.legs.0.end_location.lat": destLat,
		"json.routes.0.legs.0.end_location.lng": destLng,
	},
	function(err,foundRes) {
		if (err)
			res.send(err);
		res.json(foundRes);
	});
}

exports.updateDirection = function(req,res) {
	//Menyimpan direction baru, jika sudah ada, ditambahkan saja ke yang sebelumnya
	googleMapsClient.directions({
		origin: req.params.originLat+','+req.params.originLng,
		destination: req.params.destLat+','+req.params.destLng,
		departure_time: 'now'
	}, function(err,response) {

		var currentTime = new Date();
		var newTimestamp = new Date(currentTime.getTime() - currentTime.getTimezoneOffset() * 60000);
		var newText = response.json.routes[0].legs[0].duration_in_traffic.text;
		var newValue = response.json.routes[0].legs[0].duration_in_traffic.value;

		var originLat = parseFloat(req.params.originLat);
		var originLng = parseFloat(req.params.originLng);
		var destLat = parseFloat(req.params.destLat);
		var destLng = parseFloat(req.params.destLng);
		Direction.findOneAndUpdate({
			"json.routes.0.legs.0.start_location.lat": originLat,
			"json.routes.0.legs.0.start_location.lng": originLng,
			"json.routes.0.legs.0.end_location.lat": destLat,
			"json.routes.0.legs.0.end_location.lng": destLng,
		},
		{
			$push : {
				"json.routes.0.legs.0.duration_in_traffic"	: {
					$each :[{"text": newText, "value": newValue, "timestamp": newTimestamp}]
				}
			}
			
		}, {
			"new" : true
		}, function(err,updateRes) {
			if (!err)
				res.json(updateRes);
		});
	});
}

exports.listAllDirections = function(req,res) {
	Direction.find({}, function(err,response) {
		if (!err)
			res.json(response);
	});
}

exports.saveNewDirection = function(req,res) {
	//Menyimpan direction baru, jika sudah ada, ditambahkan saja ke yang sebelumnya
	googleMapsClient.directions({
		origin: req.params.originLat+','+req.params.originLng,
		destination: req.params.destLat+','+req.params.destLng,
		departure_time: 'now'
	}, function(err,response) {
		if (err)
			res.send(err)
		var timeStamp = new Date();

		//Disimpan dulu supaya bisa jadi array
		var initialDurationInTraffic = response.json.routes[0].legs[0].duration_in_traffic;
		//Mengubah ke GMT+7
		initialDurationInTraffic.timestamp = new Date(timeStamp.getTime() - timeStamp.getTimezoneOffset()*60000);
		//duration_in_traffic diubah ke array
		response.json.routes[0].legs[0].duration_in_traffic = [];
		//push data awal
		response.json.routes[0].legs[0].duration_in_traffic.push(initialDurationInTraffic);
		var newDirection = new Direction(response);
		newDirection.save();
		res.json({message:"Success"});
	});
}

exports.getRealTimeDuration = function(req,res) {
	googleMapsClient.directions({
		origin: req.params.originLat+','+req.params.originLng,
		destination: req.params.destLat+','+req.params.destLng,
		departure_time: 'now'
	}, function(err,response) {
		res.json(response)
	})
}

exports.addNewElement = function(req,res) {
	var data = req.body;
	var elType = data.type;
	var elValue = data.value;

	fs.readFile('./public/map_preprocessed.osm', function(err,data) {
		if (!err) {
			var result = data.toString();
			var xml =  new DOMParser().parseFromString(result);
			if (elType=="node") {
				var newNode = xml.createElement("node");
				newNode.setAttribute("id","New Node "+xml.documentElement.getElementsByTagName("node").length+1);
				newNode.setAttribute("lat",elValue.lat);
				newNode.setAttribute("lon",elValue.lon);
				newNode.setAttribute("custom","true");
				var ways = xml.documentElement.getElementsByTagName("way");
				xml.documentElement.insertBefore(newNode,ways[0]);
			} else if (elType=="way") {
				var newWay = xml.createElement("way");
				var pathList = elValue.pathList;
				var waysLength = xml.documentElement.getElementsByTagName("way").length+1;
				newWay.setAttribute("id","New Way "+waysLength);
				newWay.setAttribute("timestamp", new Date());
				//node origin nd
				var originNd = xml.createElement("nd");
				originNd.setAttribute("ref", elValue.originId);
				newWay.appendChild(originNd);

				//tambahkan node baru di path
				for (var i=0; i<pathList.length; i++) {
					var newNode = xml.createElement("node");
					newNode.setAttribute("id","New Node "+xml.documentElement.getElementsByTagName("node").length+1);
					newNode.setAttribute("lat",pathList[i].lat);
					newNode.setAttribute("lon",pathList[i].lng);
					newNode.setAttribute("custom", "true");
					var ways = xml.documentElement.getElementsByTagName("way");
					xml.documentElement.insertBefore(newNode,ways[0]);
				}

				

			}
			
			fs.writeFile("./public/map_preprocessed.osm", xml.toString(), function(err){
				if (!err) {
					console.log("Berhasil menambahkan elemen baru");
					console.log(elType+" id:"+elValue.id+" lat:"+elValue.lat+" lon:"+elValue.lon);		
				} else {
					console.log(err);
				}
			});
			
		}
		res.json( {"Message":"success"});
		
	});
}

exports.mapPreprocess = function(req,res) {
	//Preproses untuk mengambil node dan way saja di jalan raya
	//Output : map.osm yang sudah difilter
	var boundary = req.params.boundary;
	console.log("\n\nMap Preprocessing")
	console.log("Enter HTTP GET");
	var getVar = http.get({
		host: "api.openstreetmap.org",
		path: "/api/0.6/map?bbox="+boundary
	}, function(response) {
		console.log("Response Available");
		let mapData;
		res.body = "";
		response.on("data", function(d) {
			res.body += d;
		});

		response.on("end", function() {
			var mapString = res.body;
	//=============================================
	// console.log("Enter map preprocess");
	// fs.readFile("./data/map_itb.osm", function(err,data) {
	// 	if (!err) {
	// 		var mapData = data.toString();
	//=============================================
			var mapXML = new DOMParser().parseFromString(mapString); //root
			if (mapXML != null) {
				var ways =  mapXML.documentElement.getElementsByTagName("way");
				var nodes = mapXML.documentElement.getElementsByTagName("node");
				
				//Filter way/jalan yang sesuai
				console.log("Processing Way");
				for (var i=0; i<ways.length;i++) {
					var tags = ways[i].getElementsByTagName("tag");
					var valid = false;
					for (var j=0; j<tags.length; j++) {
						if (tags[j].getAttribute("k")=="highway") {
							if (tags[j].getAttribute("v")=="primary" ||
					            tags[j].getAttribute("v")=="secondary" ||
					            tags[j].getAttribute("v")=="tertiary" ||
					            tags[j].getAttribute("v")=="primary_link" ||
					            tags[j].getAttribute("v")=="secondary_link" ||
					            tags[j].getAttribute("v")=="tertiary_link") {
								valid = true;
								break;
							}
						}
					}
					if (!valid) {
						var textNode = ways[i].previousSibling;
						if (textNode.nodeType != 1) {
							mapXML.removeChild(textNode);
						}
						mapXML.removeChild(ways[i]);
					}
				}//way sudah difilter hanya jalan raya saja (primary, secondary, dan tertiary)
				
				//sekarang filter nodenya
				process.stdout.write("Filter relevant node");
				console.log("Node Count: "+nodes.length);
				for (var i=0; i<nodes.length; i++) {
					var node = nodes[i];
					var ways = mapXML.documentElement.getElementsByTagName("way");
					var validNode = false;
					process.stdout.clearLine();  // clear current text
					process.stdout.cursorTo(0);  // move cursor to beginning of line
					process.stdout.write("Node:"+(i+1));
					for (var j=0; j<ways.length; j++) {
						var way = ways[j];
						var nds = way.getElementsByTagName("nd");
						for (var k=0; k<nds.length; k++) {
							if (node.getAttribute("id")==nds[k].getAttribute("ref")) {
								validNode = true;
								break;
							}
						}
						if (validNode) {
							break;
						}
					}
					if (!validNode) {
						var textNode = node.previousSibling;
						if (textNode.nodeType != 1) {
							mapXML.removeChild(textNode);
						}
						mapXML.removeChild(node);
					}
				}

				//Hapus tag <relation> sementara tidak diperlukan
				console.log("\nRemove relation");
				var relations = mapXML.documentElement.getElementsByTagName("relation");
				for (var i = 0; i<relations.length; i++) {
					mapXML.removeChild(relations[i].previousSibling);
					mapXML.removeChild(relations[i]);
				}


				fs.writeFile("./data/map_preprocessed.osm", mapXML.toString(), function(err) {
					if (!err)
						console.log("Preprocessed Map Berhasil");
				});
				res.body = mapXML.toString();
				res.send(res.body);
				
			} else {
				console.log("No Map Data")
			}

		});
		// } else {
		// 	console.log("Read file error");
		// }
	});
}

// exports.mapPreprocess = function(req,res) {
// 	fs.readFile("./data/map_preprocessed_itb.osm", function(err,data) {
// 		console.log("Read preprocessed map");
// 		if (!err) {
// 			var mapData = data.toString();
// 			res.send(mapData);
// 		}
// 	});
// }

exports.getProcessedMap = function(req,res) {
	fs.readFile("./data/map_preprocessed.osm", function(err,data) {
		if (!err) {
			var mapData = data.toString();
			res.send(mapData);
			console.log("getProcessedMap Berhasil");
		}
	});
}

