/*
 * This example uses node-persist to store a global counter.
 * Every time the server gets a request, the counter increments
 * by one. This counter will survive process restarts.
 *
 * Open up your browser to 'localhost:8080' to see it in action.
 * It will probably be incremented several times per page due to
 * multiple requests.
 */

var storage = require('../../../node-persist');
var http = require('http');

storage.init({
    logging: true,
    ttl: 30000
}).then(function() {
    debugger;

    if(!storage.getItem('counter')) {
      storage.setItem('counter', 0);
    }
    console.log("counter is: " + storage.getItem('counter'));
}, function(err) {
    console.error(err);
});

http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    storage.setItem('counter', storage.getItem('counter') + 1);
    res.end("counter is: " + storage.getItem('counter'));
}).listen(8081, '127.0.0.1');
