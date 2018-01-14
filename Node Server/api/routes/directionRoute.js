'use strict';
module.exports = function(app) {
	var directionController = require('../controllers/directionController.js');

	app.route('/getSavedDirection/:originLat/:originLng/:destLat/:destLng')
	.get(directionController.getSavedDirection);

	app.route('/update/:originLat/:originLng/:destLat/:destLng')
	.get(directionController.updateDirection);

	app.route('/listAll')
	.get(directionController.listAllDirections);

	app.route('/getRealTimeDuration/:originLat/:originLng/:destLat/:destLng')
	.get(directionController.getRealTimeDuration);

	app.route('/saveNewDirection/:originLat/:originLng/:destLat/:destLng')
	.get(directionController.saveNewDirection);

	app.route('/mapPreprocess/:boundary')
	.get(directionController.mapPreprocess);
	
	app.route('/preprocessSavedMapData')
	.get(directionController.preprocessSavedMapData);

	app.route('/getProcessedMap/:fileName')
	.get(directionController.getProcessedMap);

	app.route('/addNewElement')
	.post(directionController.addNewElement);



};