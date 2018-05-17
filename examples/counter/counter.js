/*
 * This example uses node-persist to store a global counter.
 * Every time the server gets a request, the counter increments
 * by one. This counter will survive process restarts.
 *
 * Open up your browser to 'localhost:8080' to see it in action.
 * It will probably be incremented several times per page due to
 * multiple requests.
 */

const storage = require('../../src/node-persist');
const http = require('http');

const ttl = 3000;
const host = '127.0.0.1';
const port = 8080;

const resolveType = function (str) {
	let type = typeof str;
	if (type !== 'string') {
		return str;
	} else {
		let nb = parseFloat(str);
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

(async () => {
	await storage.init({logging: true, ttl: ttl});

	let counter = await storage.getItem('counter');

	if (! counter) {
		await storage.setItem('counter', 0);
	}
	counter = await storage.getItem('counter');
	console.log('counter is ' + counter);


	http.createServer(async function (req, res) {
		res.writeHead(200, {'Content-Type': 'text/plain'});
		if (req.url === '/') {
			let c = await storage.getItem('counter');

			if (!c) {
				console.log('counter ttl expired, resetting to 0');
				c = 0;
				await storage.setItem('counter', 0);
			}
			await storage.setItem('counter', c + 1);

			res.end("counter is: " + (await storage.getItem('counter')) + ' (every time you refresh you reset the ttl timer, but just wait ' + ttl / 1000 + ' seconds, it should reset back to 1)');

		}
		if (/\/\w+/.test(req.url)) { // secret paths
			let url = req.url.slice(1);
			let parts = url.split('?');
			let fn = parts[0];
			let args = (parts[1] || '').split(',').map(v => resolveType(v));

			if (typeof storage[fn] === 'function') {
				res.end(JSON.stringify(await storage[fn].apply(storage, args), undefined, 4));
			} else {
				res.end(fn + ' is not a known storage function');
			}
		} else {
			res.end();
		}

	}).listen(port, host);

	console.log("running on " + host + ":" + port);

})();

