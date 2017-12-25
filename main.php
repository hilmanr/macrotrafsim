<?php
header('Access-Control-Allow-Origin: *');
?>
<!DOCTYPE html>
<html>
<head>
	<title>Dashboard Simulator Green Wave</title>
	<link rel="stylesheet" type="text/css" href="https://www.w3schools.com/w3css/4/w3.css">
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.0.3/dist/leaflet.css"
  integrity="sha512-07I2e+7D8p6he1SIM+1twR5TIrhUQn9+I6yjqD53JQjFiMf8EtC93ty0/5vJTZGF8aAocvHYNEDJajGdNx1IsQ=="
  crossorigin=""/>
</head>
<body>
<div class="w3-row">
	<div class="w3-quarter w3-padding">
		<h4>Set Boundary</h4>
		<div>
			<input type="text" id="boundary" value="107.60344,-6.90806,107.60554,-6.90607" placeholder="left,bottom,right,top">
		</div>
		<h4>Clock Tick Duration</h4>
		<div>
			<input type="number" value="2" id="clockTick" placeholder="Durasi clock tick">
		</div>
		<h4>Average Vehicle Length</h4>
		<div>
			<input type="number" value="4" id="vLength" placeholder="Rata-rata panjang kendaraan">
		</div>
		<h4>Vehicle Generate</h4>
		<div>
			<input type="number" value="5" id="vehicleGen" placeholder="Jumlah kendaraan dibangkitkan">
		</div>
		<div id="setMap" class="w3-button">Set Map</div>
		<div id="getNearest" class="w3-button">Find Nearest Node Id</div>
		<div id="setSource" class="w3-button">Set Source Node</div>
		<div id="getSource" class="w3-button">Show Source Node</div>
		<div id="getSink" class="w3-button">Show Sink Node</div>
		<div id="getIntersection" class="w3-button">Show Intersections Node</div>
		<div id="getIntermediate" class="w3-button">Show Intermediate Node</div>
		<div id="runSim" class="w3-button">Run simulation</div>
		<h3 id="timer"></h3>
		<div>
			<h3>Road Traffic Network Summary</h3>
			<p>Way Count: <span id="wayCount"></span></p>
			<p>Segment Count: <span id="segmentCount"></span></p>
			<p>Cell Count: <span id="cellCount"></span></p>
			<p>Intersection Node Count: <span id="intersectCount"></span></p>
			<p>Intermediate Node Count: <span id="intermedCount"></span></p>
		</div>
	</div>
	<div class="w3-threequarter" id="mapid" style="height: 1280px"></div>	
</div>

</body>
<script type='text/javascript' src='//ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js'></script>
<script src="https://unpkg.com/leaflet@1.0.3/dist/leaflet.js"
  integrity="sha512-A7vV8IFfih/D732iSSKi20u/ooOfj/AGehOKq0f4vLT1Zr2Y+RX7C+w8A1gaSasGtRUZpF/NZgzSAu4/Gc41Lg=="
  crossorigin=""></script>
<script type="text/javascript" src="http://localhost:3000/simulation-structure.js"></script>

<script type="text/javascript">
	//Variabel Global untuk simulasi
	var markerList = [];
	var mymap = L.map('mapid');
	var mapxml = null;
</script>

<script type="text/javascript" src="simulation.js"></script>
<!--Script untuk manipulasi Map -->
<script>
	

	function setMap(boundary) {
		// alert("Enter setMap");
		new L.OSM.Mapnik().addTo(mymap);

		//initial load
		$.ajax({
		  url : "http://localhost:3000/getProcessedMap/",//+boundary,
		  dataType: "xml",
		  success: function (xml) {
		  	mapxml = xml;
		    var layer = new L.OSM.DataLayer(xml).addTo(mymap); //addTo di leaflet-osm.js akan panggil add Data, selanjutnya buildFeatures() untuk render
		    mymap.fitBounds(layer.getBounds());
		    alert("fitBound berhasil");
		  },
		  async: false
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

	

	/*function createSimulation(xml) {
		alert("In Main createSimulation");
	}*/
	var stat = 0;
	var createNodesStat = false;

	$("#setMap").on("click", function() {
		var bound = $("#boundary").val();
		setMap(bound);
	});

	$("#getNearest").on("click", function() {
		alert("getNearest");
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

	$("#setSource").on("click", function() {
		alert("Set Source");
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
	});


	var sourceMarkers = {};
	$("#getSource").on("click", function() {
		if ($(this).hasClass("active")) {
			sourceMarkers.clearLayers();
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
		} else {
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			sourceMarkers = L.layerGroup(getSourceNodes()[1]);
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
			sourceMarkers = L.layerGroup(getIntersectionNodes()[1]);
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
			sourceMarkers = L.layerGroup(getIntermediateNodes()[1]);
			sourceMarkers.addTo(mymap);
			$(this).addClass("w3-green");	
			$(this).addClass("active");
		}
	});


	$("#runSim").on("click", function() {
		if ($(this).hasClass("active")) {
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
		} else {
			$(".active").removeClass("w3-green");
			$(".active").removeClass("active");
			runSimulation();
			$(this).addClass("w3-green");	
			$(this).addClass("active");
		}		
	});
	
	mymap.on("click", function(e) {
		//DEBUGGING PURPOSE
		if (stat == 1) {
			mymap.removeLayer(nearestNodeMarker);
			getNearestNode(e.latlng, nearestNodeMarker);
		} else if (stat == 2) {
			setSource(e.latlng);
		}
	});
</script>
</html>