<?php
header('Access-Control-Allow-Origin: *');
?>
<!DOCTYPE html>
<html>
<head>
	<link rel="stylesheet" type="text/css" href="https://www.w3schools.com/w3css/4/w3.css">
	<title>Google Maps Traffic Data Retrieval</title>
	<style type="text/css">
		.loader {
		    border: 16px solid #f3f3f3; /* Light grey */
		    border-top: 16px solid #3498db; /* Blue */
		    border-radius: 50%;
		    width: 120px;
		    height: 120px;
		    animation: spin 2s linear infinite;
		    margin:auto;
		}

		@keyframes spin {
		    0% { transform: rotate(0deg); }
		    100% { transform: rotate(360deg); }
		}
	</style>
</head>
<body>
	<div class="w3-container w3-center" style="margin-top: 30px">
		<div id="map" class=""></div>
		<div><button id="update" class="w3-button w3-teal">Update</button></div>
		<div id="lastUpdate">
			<h4>Last Update: <span id="timestamp"></span></h4>
		</div>
		<div id="summary">
			<table id="summaryContent" class="w3-table w3-striped w3-hoverable">
				
			</table>
		</div>
	</div>

	<!-- The Modal -->
	<div id="id01" class="w3-modal">
	  <div class="w3-modal-content">
	    <div class="w3-container">
	      <div style="margin:auto">
	      	<div class="loader"></div>
	      </div>
	    </div>
	  </div>
	</div>

</body>
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
<script type="text/javascript">
	$(document).ajaxStart(function() {
		document.getElementById('id01').style.display='block';
	}).ajaxComplete(function() {
		document.getElementById('id01').style.display='none';
	});

	$(document).ready(function() {
		getSummary();
		

		$("#update").click(function() {
			$.ajax({
				method: "get",
				url: "http://localhost:3000/update/-6.8987453/107.6127278/-6.8852686/107.6137003",
				dataType: "json",
				success: function(res) {
					if (res) {
						var updateTime = new Date();
						$("#timestamp").html(updateTime);
						getSummary();
					}
				}
			})
		})
	});

	function getSummary() {
		$.ajax({
			method: "get",
			url: "http://localhost:3000/getSavedDirection/-6.8987453/107.6127278/-6.8852686/107.6137003",
			dataType: "json",
			success: function(res) {
				var durations = res[0].json.routes[0].legs[0].duration_in_traffic;
				var phpString = "<tr><th>Timestamp</th><th>Value</th><th>Text</th></tr>";
				for (var i =0; i<durations.length;i++) {
					phpString+="<tr>";
					phpString+="<td>"+durations[i].timestamp+"</td>";
					phpString+="<td>"+durations[i].value+"</td>";
					phpString+="<td>"+durations[i].text+"</td>";
					phpString+="</tr>";
				}
				$("#summaryContent").html(phpString);
			}

		});		
	}
</script>
</html>