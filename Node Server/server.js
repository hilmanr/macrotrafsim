var express = require('express'),
	app = express(),
	port = process.env.PORT || 3000;
	// mongoose = require('mongoose'),
	// bodyParser = require('body-parser');s
    // serveStatic = require('serve-static');

app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});

app.use(express.static('public'));
// app.use(bodyParser);

var routes = require('./api/routes/directionRoute');
routes(app);



app.listen(port);
console.log("#######################################");
console.log("Web Based Macroscopic Traffic Simulator");
console.log('Data Processing Service Started On Port: '+port);