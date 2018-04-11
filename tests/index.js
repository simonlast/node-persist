
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const assert = require('chai').assert;
const rmdir = require('rimraf');

const pkg = require('../package.json');
const LocalStorage = require('../src/local-storage');
const nodePersist = require('../src/node-persist');

const TEST_BASE_DIR = path.join(__dirname, '/storage-dirs');

const rand  = function (prefix) {
	return (prefix ? prefix + '-' : '') + (+ new Date()) + '-' + Math.floor(Math.random() * 1000);
};
const randDir = function () {
	return path.join(TEST_BASE_DIR, '/' + rand());
};

process.on('unhandledRejection', (reason, p) => {
	console.error('Unhandled Rejection at: Promise', p);
});

describe('node-persist ' + pkg.version + ' tests:', async function() {

	before(function(done) {
		mkdirp(TEST_BASE_DIR, done);
	});

	after(function(done) {
		rmdir(TEST_BASE_DIR, done);
	});

	describe('instances', function() {
		let dir1, dir2, storage1, storage2, storage11, storage22;

		beforeEach(async function () {
			dir1 = randDir();
			storage1 = nodePersist.create({
				dir: dir1
			});
			dir2 = randDir();
			storage2 = nodePersist.create({
				dir: dir2
			});
			await storage1.init();
			await storage2.init();

			await storage1.setItem('s1', 1111);
			await storage2.setItem('s2', {a: 1});

			storage11 = nodePersist.create({
				dir: dir1
			});
			storage22 = nodePersist.create({
				dir: dir2
			});
		});

		it('should create 2 new different instances of LocalStorage', async function() {
			assert.ok(storage1 instanceof LocalStorage);
			assert.ok(storage2 instanceof LocalStorage);
			assert.ok(storage1 != storage2);
		});

		it('should use the 2 previous dirs and init correctly', async function() {
			await storage11.init();
			assert.equal(await storage11.getItem('s1'), 1111, `write/read didn't work`);
			await storage22.init();
			let value = await storage2.getItem('s2');
			assert.deepEqual(value, {a: 1}, `write/read didn't work`);
		});

		it('should create the default instance of LocalStorage sync and use it', async function() {
			await nodePersist.init({dir: randDir()});
			assert.ok(nodePersist.defaultInstance instanceof LocalStorage);
			await nodePersist.setItem('item8877', 'hello');
			assert.equal(await nodePersist.getItem('item8877'), 'hello', `write/read didn't work`);
		});

		it('should create a default instance', async function() {
			let dir = randDir();
			let options = await nodePersist.init({dir: dir});
			assert.equal(options.dir, dir, `Options don't match`);
		});
	});

	describe('operations', function() {
		let options = {
			dir: randDir(),
			// logging: true
		};
		let storage = nodePersist.create();

		let items = {
			'item1': 1,
			'item2': 2
		};

		describe('general items operations', function() {
			it('should init()', async function() {
				await storage.init(options);
				assert.equal(storage.options.dir, options.dir);
				assert.ok(fs.existsSync(options.dir));
			});

			it('should setItem()', async function() {
				await storage.setItem('item1', items.item1);
				assert.equal(await storage.getItem('item1'), items.item1);
			});


			it('should getItem()', async function() {
				let value = await storage.getItem('item1');
				assert.equal(value, items.item1);
			});

			it('should getRawDatum()', async function() {
				let value = await storage.getRawDatum('item1');
				assert.equal(value, JSON.stringify({key: 'item1', value: items.item1}));
			});

			it('should removeItem()', async function() {
				await storage.removeItem('item1');
				assert.equal(await storage.getItem('item1'), undefined);
			});
		});

		describe('general global operations', function() {
			beforeEach(async function() {
				await storage.init(options);
				await storage.setItem('item1', items.item1);
				await storage.setItem('item2', items.item2);
			});

			afterEach(async function() {
				await storage.clear();
			});

			it('should keys()', async function() {
				assert.equal((await storage.keys()).length, 2);
			});

			it('should length()', async function() {
				assert.equal((await storage.length()), 2);
			});

			it('should values()', async function() {
				assert.equal((await storage.values()).length, 2);
			});

			it('should clear()', async function() {
				await storage.clear();
                assert.equal(await storage.getItem('item1'), undefined);
                assert.equal(await storage.getItem('item2'), undefined);
			});
		});
	});

	describe('interval and ttl ', function() {
		this.timeout(5000); // increase the default mocha test timeout.

		it('should respect expired ttl and delete the items', async function() {
			let storage = nodePersist.create();
			await storage.init({
				dir: randDir(),
				ttl: 1000 // 1 second
			});
			await storage.setItem('item1', 1);

			// wait 2 seconds, then try to read the file, should be undefined.
			await new Promise((resolve, reject) => {
				setTimeout(async function() {
					try {
						let value = await storage.getItem('item1');
						assert.equal(value, undefined);
						resolve();
					} catch (e) {
						reject(e);
					}
				}, 2000);
			});
		});

		it('should respect an expired different ttl per setItem and delete the items', async function() {
			this.timeout(10000);
			let storage = nodePersist.create();

			await storage.init({
				dir: randDir(),
				ttl: 1000 // 1 second,
			});

			await storage.setItem('item1', 1, {ttl: 5000});

			// wait 2 seconds, then try to read the item1 file, should still be there because we asked this one to live for 5 seconds, despite the default 1 second ttl
			await new Promise((resolve, reject) => {
				setTimeout(async function() {
					try {
						let value = await storage.getItem('item1');
						assert.equal(value, 1);
						resolve();
					} catch (e) {
						reject(e);
					}
				}, 2000);
			});

			// wait 5.5 seconds, then try to read the item1 file, should be undefined
			await new Promise((resolve, reject) => {
				setTimeout(async function() {
					try {
						let value = await storage.getItem('item1');
						assert.equal(value, undefined);
						resolve();
					} catch (e) {
						reject(e);
					}
				}, 5500);
			});
		});

		it('should automatically delete expired items', async function() {
			this.timeout(10000);

			let storage = nodePersist.create();
			await storage.init({dir: randDir(), expiredInterval: 3000});

			storage.setItem('item1', 1, {ttl: 5000});

			// wait 8 seconds, then check the keys, should be empty, item1 should've been deleted automatically based on the expiredInterval
			await new Promise((resolve, reject) => {
				setTimeout(async function() {
					try {
						let length = await storage.length();
						assert.equal(length, 0);
						resolve();
					} catch (e) {
						reject(e);
					}
				}, 7000);
			});
		});
	});

	describe('Parsing errors', function() {
		it('should throw an error because of an invalid file in the storage dir', async function () {
			this.timeout(5000);
			let dir = randDir();
			let storage = nodePersist.create();

			// make sure the dir is there, and write a random file in there
			mkdirp.sync(dir);
			fs.writeFileSync(dir + '/foo.bar', 'nothing that makes sense');

			try {
				await storage.init({
					dir: dir
				});
			} catch (e) {
				assert.equal(true, /^\[node-persist]\[readFile]*does not look like a valid storage file/.test(e.message));
			}
		});
		it('should NOT throw an error because of an invalid file in the storage dir, because forgiveParseErrors=true', async function () {
			this.timeout(5000);
			let dir = randDir();
			let storage = nodePersist.create();

			// make sure the dir is there, and write a random file in there
			mkdirp.sync(dir);
			fs.writeFileSync(dir + '/foo.bar', 'nothing that makes sense');

			await storage.init({
				dir: dir,
				forgiveParseErrors: true
			});
			assert.equal(storage.options.dir, dir, `options.dir don't match`);
		});
	});
});
