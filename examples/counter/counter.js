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

var ttl = 3000;

storage.init({
    logging: true,
    ttl: ttl
}).then(function() {

    if(!storage.getItem('counter')) {
      storage.setItemSync('counter', 0);
    }

    console.log("counter is: " + storage.getItem('counter'));
}, function(err) {
    console.error(err);
});

http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    if (req.url === '/') {
        var c = storage.getItemSync('counter');
        if (!c) {
            console.log('counter ttl expired, resetting to 0');
            c = 0;
            storage.setItemSync('counter', 0);
        }
        storage.setItem('counter', c + 1).then(function() {
            res.end("counter is: " + storage.getItem('counter') + ' (everytime you refresh you reset the ttl timer, but just wait ' + ttl / 1000 + ' seconds, it should reset back to 1)');
        });
    } else {
        res.end();
    }

}).listen(8081, '127.0.0.1');
