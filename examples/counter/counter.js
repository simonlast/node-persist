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
    ttl: ttl,
    dir: __dirname + '/store'
}).then(function() {
    if(!storage.getItem('counter')) {
        storage.setItemSync('counter', 0);
    }
    console.log("counter is: " + storage.getItem('counter'));
}, function(err) {
    console.error(err);
});


var resolveType = function (str) {
    var type = typeof str;
    if (type !== 'string') {
        return str;
    } else {
        var nb = parseFloat(str);
        if (!isNaN(parseFloat(str)) && isFinite(str))
            return nb;
        if (str === 'false')
            return false;
        if (str === 'true')
            return true;
        if (str === 'undefined')
            return undefined;
        if (str === 'null')
            return null;
        try {
            str = JSON.parse(str);
        } catch (e) {
        }
        return str;
    }
};

http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    if (req.url === '/') {
        var c = storage.getItemSync('counter');
        if (!c) {
            console.log('counter ttl expired, resetting to 0');
            c = 0;
            storage.setItemSync('counter', 0);
        }
        storage.setItemSync('counter', c + 1);
        res.end("counter is: " + storage.getItem('counter') + ' (everytime you refresh you reset the ttl timer, but just wait ' + ttl / 1000 + ' seconds, it should reset back to 1)');

    } if (/\/\w+/.test(req.url)) { // secret paths
        var url = req.url.slice(1);
        var parts = url.split('?');
        var fn = parts[0];
        var args = (parts[1] || '').split(',').map(function(v) { return resolveType(v); });
        if (typeof storage[fn] === 'function') {
            res.end(JSON.stringify(storage[fn].apply(storage, args), undefined, 4));
        } else {
            res.end(fn + ' is not a known storage function');
        }

    } else {
        res.end();
    }

}).listen(8080, '127.0.0.1');
