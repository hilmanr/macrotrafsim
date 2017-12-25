var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var DirectionSchema = new Schema({},{ strict: false });

module.exports = mongoose.model('Directions', DirectionSchema);