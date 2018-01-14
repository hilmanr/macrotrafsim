
//Variabel Global untuk simulasi
var markerList = [];
var mymap = L.map('mapid');
var mapxml = null;
var initialLayer = {};
var rectangleBound = null;

$(document).ajaxStop(function() {
		$('body').loading("stop");
	});
	

function setMap(boundary) {
	// alert("Enter setMap");
	new L.OSM.Mapnik().addTo(mymap);

	//initial load
	$.ajax({
	  url : "http://localhost:3000/mapPreprocess/"+boundary,
	  // url : "http://localhost:3000/getProcessedMap/map_preprocessed.xml",
	  // url : "http://localhost:3000/preprocessSavedMapData",
	  // type : "post",
	  dataType: "xml",
	  success: function (xml) {
	  	mapxml = xml;
	    initialLayer = new L.OSM.DataLayer(xml).addTo(mymap); //addTo di leaflet-osm.js akan panggil add Data, selanjutnya buildFeatures() untuk render
	    mymap.fitBounds(initialLayer.getBounds());
	    mymap.removeLayer(initialLayer);
	    //bound variabel global di simulation-structure.js
	    rectangleBound = L.rectangle(bound.latLngBounds).addTo(mymap);

		createWaySegments(parseInt($("#clockTick").val()), parseInt($("#vLength").val()));
		setSinkCells(); //Untuk menandai sink node untuk edit way
		getDefaultSourceNodes(); //untuk menandai source node untuk edit way
		// openAllSegmentPopup();
		drawNodeCircleMarkers();
		// openAllSegmentPopup();
		// closeAllSegmentPopup();
		
	  },
	});
}

function writeMarkerList() {
	alert("writeMarkerList");
	var string = "<ul class='w3-ul'>";
	for (var eachMark in markerList) {
		string += "<li>"+markerList[eachMark]+"</li>";
	}
	string += "</ul>";
	$("#markerList").html(string);
}

var stat = 0;
var createCells = false;

$("#setMap").on("click", function() {
	$('body').loading();
	var boundVal = $("#boundary").val();
	setMap(boundVal);
});

$("#getNearest").on("click", function() {
	// alert("getNearest");
	if ($(this).hasClass("active")) {
		stat = 0;
		mymap.removeLayer(nearestNodeMarker);
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
	} else {
		stat = 1;
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
		$(this).addClass("w3-green");	
		$(this).addClass("active");
	}
});


var sourceMarkers = L.layerGroup();
$("#getSource").on("click", function() {
	if ($(this).hasClass("active")) {
		sourceMarkers.clearLayers();
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
	} else {
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
		sourceMarkers = L.layerGroup(getDefaultSourceNodes().markers);
		sourceMarkers.addTo(mymap);
		$(this).addClass("w3-green");	
		$(this).addClass("active");
	}
});

$("#getSink").on("click", function() {
	if ($(this).hasClass("active")) {
		sourceMarkers.clearLayers();
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
	} else {
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
		sourceMarkers = L.layerGroup(getSinkNodes()[1]);
		sourceMarkers.addTo(mymap);
		$(this).addClass("w3-green");	
		$(this).addClass("active");
	}
});

$("#getIntersection").on("click", function() {
	if ($(this).hasClass("active")) {
		sourceMarkers.clearLayers();
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
	} else {
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
		// sourceMarkers.clearLayers();
		sourceMarkers = L.layerGroup(getIntersectionNodes().markers);
		sourceMarkers.addTo(mymap);
		$(this).addClass("w3-green");	
		$(this).addClass("active");
	}
});

$("#getIntermediate").on("click", function() {
	if ($(this).hasClass("active")) {
		sourceMarkers.clearLayers();
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
	} else {
		$(".active").removeClass("w3-green");
		$(".active").removeClass("active");
		// sourceMarkers.clearLayers();
		sourceMarkers = L.layerGroup(getIntermediateNodes().markers);
		sourceMarkers.addTo(mymap);
		$(this).addClass("w3-green");	
		$(this).addClass("active");
	}
});

$("#createStructure").on("click", function() {
	createWaySegments($("#clockTick").val(),$("#vLength").val());
	drawNodeCircleMarkers();
	createCells = true;
	$(this).addClass("w3-blue");
	alert("Struktur simulasi (segmen dan cell) sudah dibuat");
});


$("#setSource").on("click", function() {
	// alert("Set Custom Source");
	if (createCells) {
		if ($(this).hasClass("active")) {
			stat = 0;
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
		} else {
			stat = 2;
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			$(this).addClass("w3-green");	
			$(this).addClass("active");
		}
	} else {
		alert("Create Structure (Cells) terlebih dahulu");

	}
});

var editNodes = []; //harus ada dua node untuk bisa mulai edit
var editNodesMarkerGroup = L.layerGroup();
var connected = {};
$("#editWay").click( function() {
	if (createCells) {
		if ($(this).hasClass("active")) {
			stat = 0;
			$(".active").removeClass("w3-blue");
			$(".active").removeClass("active");
		} else {
			stat = 4;
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			$(this).addClass("w3-blue");	
			$(this).addClass("active");
		}
	} else {
		alert("Create Structure (Cells) terlebih dahulu");
	}
});



$("#runSim").on("click", function() {
	if (createCells) {
		if ($(this).hasClass("active")) {
			stopSimulation();
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			$(this).html("Run Simulation");
		} else {
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			$(this).html("Stop Simulation");
			stat = 0;
			runSimulation();
			$(this).addClass("w3-green");	
			$(this).addClass("active");
		}	
	} else {
		alert("Create Structure (Cells) terlebih dahulu");
	}
			
});

$("#setBottleNeck").on("click", function() {
	if (createCells) {
		if ($(this).hasClass("active")) {
			stat = 0;
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
		} else {
			stat = 3;
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			$(this).addClass("w3-green");	
			$(this).addClass("active");
		}
	} else {
		alert("Create Structure (Cells) terlebih dahulu");

	}
	
});

$("#bottleNeckV").on("change", function() {
	updateBottleNeckVal();
});

$("#clearBottleNeck").on("click", function() {
	if (createCells) {
		clearBottleNeckNodes();
	} else {
		alert("Create Structure (Cells) terlebih dahulu");
	}
});

$("#closePopup").on("click", function() {
	closeAllSegmentPopup();
});

$("#editToTwoWay").on("click", function() {
	if (editNodes.length == 2 && connected.mode == 2) {
		editToTwoWay(connected.routes);
		alert("Edit berhasil, silahkan pilih node untuk edit ulang");
		$(this).addClass("w3-disabled");
		editNodes[0].circleMarker.setStyle({fillColor:"#ccc"});
		editNodes[1].circleMarker.setStyle({fillColor:"#ccc"});
		editNodes = [];	
	}
	
});

$("#editToOneWay").on("click", function() {
	if (editNodes.length == 2 && connected.mode == 1) {
		editToOneWay(connected.routes);
		alert("Edit berhasil, silahkan pilih node untuk lanjut edit");
		$(this).addClass("w3-disabled");
		editNodes[0].circleMarker.setStyle({fillColor:"#ccc"});
		editNodes[1].circleMarker.setStyle({fillColor:"#ccc"});
		editNodes = [];	
	}
	
});

mymap.on("click", function(e) {
	//DEBUGGING PURPOSE
	if (stat == 1) {
		// sourceMarkers.clearLayers();
		mymap.removeLayer(nearestNodeMarker);
		showNearestNode(e.latlng);
	} else if (stat == 2) {
		setCustomSourceNode(e.latlng);
	} else if (stat == 3) {
		setBottleNeckNode(e.latlng);
	} else if (stat == 4) { //editting mode

		if (editNodes.length == 2) { //edit option muncul
			alert("Pilih menu edit yang dinginkan");
		} else { //edit option di hide
			$("#editToTwoWay").click(false);
			$("#editToOneWay").click(false);
			var retrievedNode = nodes[getNearestNodeId(e.latlng)]
			retrievedNode.circleMarker.setStyle({fillColor:"orange"});
			editNodes.push(retrievedNode);
			if (editNodes.length == 2) {
				// alert("editNodes[0]"+editNodes[0].isSource+","+editNodes[0].isSink+","+editNodes[0].isIntersect+"\n"+
				// 	"editNodes[1]"+editNodes[1].isSource+","+editNodes[1].isSink+","+editNodes[1].isIntersect+"\n")

				if ((editNodes[0].isSource || editNodes[0].isSink || editNodes[0].isIntersect) &&
				 (editNodes[1].isSource || editNodes[1].isSink || editNodes[1].isIntersect)) {

					connected = connectedNodes(editNodes[0],editNodes[1]);
					// alert(connected.found+","+connected.routes[0].way.id+","+connected.routes[0].mode+","+connected.mode);
					if (connected.found) {
						alert("Pilih menu edit yang tersedia");
						if (connected.mode == 1) { //edit to one way
							$("#editToOneWay").removeClass("w3-disabled");
						} else if (connected.mode == 2) { //edit to two way
							$("#editToTwoWay").removeClass("w3-disabled");
							
						}
					} else {
						alert("Edit Gagal, pilih 2 intersection/source/sink yang terhubung langsung");
						editNodes[0].circleMarker.setStyle({fillColor:"#ccc"});
						editNodes[1].circleMarker.setStyle({fillColor:"#ccc"});
						editNodes = [];
					}
				} else {
					alert("Pilih node berupa persimpangan/source/sink yang terhubung langsung");
					editNodes[0].circleMarker.setStyle({fillColor:"#ccc"});
					editNodes[1].circleMarker.setStyle({fillColor:"#ccc"});
					editNodes = [];
				}
			}
		}
	}
});