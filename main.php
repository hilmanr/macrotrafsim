<?php
header('Access-Control-Allow-Origin: *');
?>
<!DOCTYPE html>
<html style="height: 100%">
<head>
	<title>Dashboard Simulator Green Wave</title>
	<link rel="stylesheet" type="text/css" href="https://www.w3schools.com/w3css/4/w3.css">
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.0.3/dist/leaflet.css"
  integrity="sha512-07I2e+7D8p6he1SIM+1twR5TIrhUQn9+I6yjqD53JQjFiMf8EtC93ty0/5vJTZGF8aAocvHYNEDJajGdNx1IsQ=="
  crossorigin=""/>
  <link rel="stylesheet" type="text/css" href="jquery.loading.css">
</head>
<style type="text/css">
	hr { 
	  border: 0; 
	  height: 1px; 
	  background-image: -webkit-linear-gradient(left, #f0f0f0, #8c8b8b, #f0f0f0);
	  background-image: -moz-linear-gradient(left, #f0f0f0, #8c8b8b, #f0f0f0);
	  background-image: -ms-linear-gradient(left, #f0f0f0, #8c8b8b, #f0f0f0);
	  background-image: -o-linear-gradient(left, #f0f0f0, #8c8b8b, #f0f0f0); 
	}
</style>
<body style="height:100%;"">
<div id="menu" style="width:20%; height:inherit; position:absolute; overflow-y: auto; padding-left: 10px">
	<h4>Simulation Parameter</h4>
	<h5>Set Boundary</h5>
	<div>
		<input type="text" id="boundary" value="107.59797,-6.90644,107.60401,-6.90271" placeholder="left,bottom,right,top">
	</div>
	<h5>Clock Tick Duration</h5>
	<div>
		<input type="number" style="width:150px" value="3" id="clockTick" placeholder="Durasi clock tick"> second(s)
	</div>
	<h5>Average Vehicle Length</h5>
	<div>
		<input type="number" style="width:150px" value="4" id="vLength" placeholder="Rata-rata panjang kendaraan"> meter(s)
	</div>
	<h5>Vehicle Generate</h5>
	<div>
		<input type="number" style="width:150px" value="1" id="vehicleGen" placeholder="Jumlah kendaraan dibangkitkan"> veh(s)
		<br>
		<input type="checkbox" id="setDefaultSource" value="setDefaultOK" checked> Include default source nodes (node di ujung batas peta)
	</div>
	<h5>Simulation Speed</h5>
	<div>
		<input type="number" style="width:150px" value="1" id="simV" placeholder="Kecepatan simulasi (detik)">
	</div>
	<h4>Simulation Clock</h4>
	<h5>Detik-<span id="timer"></span></h5>
	<hr>
	<h4>Simulation Set Up</h4>
	<div id="setMap" class="w3-button">Set Map</div>
	<div id="createStructure" class="w3-button">Create Structure (Cells)</div>
	<div id="setSource" class="w3-button">Set Source Node</div>
	<hr>
	<div>
		Bottleneck Value <input type="number" style="width:50px" value="0" id="bottleNeckV" placeholder="Bottleneck Value (%)">%
	</div>
	<div id="setBottleNeck" class="w3-button">Set Bottleneck Node</div>
	<div id="clearBottleNeck" class="w3-button">Clear Bottleneck Nodes</div>
	<hr>
	<h4>Edit Road Network</h4>
	<div id="editWay" class="w3-button"> Edit Way</div><br>
	<div id="editToOneWay" class="w3-button w3-disabled" >Edit to One Way</div><br>
	<div id="editToTwoWay" class="w3-button w3-disabled">Edit to Two Way</div><br>
	<div id="editToTwoWay" class="w3-button">Select New Way</div><br>
	<hr>
	<div id="runSim" class="w3-button">Run simulation</div>
	<hr>
	<h4>Basic Function</h4>
	<div id="getNearest" class="w3-button">Find Nearest Node Id</div>
	<div id="getSource" class="w3-button">Show Source Node</div>
	<div id="getSink" class="w3-button">Show Sink Node</div>
	<div id="getIntersection" class="w3-button">Show Intersections Node</div>
	<div id="getIntermediate" class="w3-button">Show Intermediate Node</div>
	<div id="closePopup" class="w3-button">Close Popup</div>
	<hr>	
	<div>
		<h3>Road Traffic Network Summary</h3>
		<p>Way Count: <span id="wayCount"></span></p>
		<p>Segment Count: <span id="segmentCount"></span></p>
		<p>Cell Count: <span id="cellCount"></span></p>
		<p>Intersection Node Count: <span id="intersectCount"></span></p>
		<p>Intermediate Node Count: <span id="intermedCount"></span></p>
	</div>
</div>
<div id="mapid" style="width:80%;height:inherit;float:right;"></div>	

</body>
<script type='text/javascript' src='//ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js'></script>
<script type="text/javascript" src="jquery.loading.js"></script>
<script type="text/javascript" src="leaflet.js"></script>
<script type="text/javascript" src="L.Symbol.js"></script>  
<script type="text/javascript" src="patternUtils.js"></script> 
<script type="text/javascript" src="leaflet.polylineoffset.js"></script> 
<script type="text/javascript" src="L.PolylineDecorator.js"></script>   
<script type="text/javascript" src="http://localhost:3000/simulation-structure.js"></script>

<script type="text/javascript">

</script>

<script type="text/javascript" src="simulation.js"></script>
<!--Script untuk manipulasi Map -->
<script type="text/javascript" src="front.js"></script>
</html>