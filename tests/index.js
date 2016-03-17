
var path = require("path");
var fs = require("fs");
var mkdirp = require("mkdirp");
var assert = require("chai").assert;
var rmdir = require('rimraf');

var pkg = require("../package.json");
var LocalStorage = require('../src/local-storage');
var nodePersist = require('../src/node-persist');

var TEST_BASE_DIR = path.join(__dirname, '/storage-dirs');

var rand  = function (prefix) {
    return (prefix ? prefix + '-' : '') + (+ new Date()) + '-' + Math.floor(Math.random() * 1000);
};
var randDir = function () {
    return path.join(TEST_BASE_DIR, "/" + rand());
};

describe("node-persist " + pkg.version + " tests:", function() {

    before(function(done) {
        mkdirp(TEST_BASE_DIR, done);
    });

    describe("instances", function() {

        var storage1 = nodePersist.create({
            dir: randDir()
        });
        var storage2 = nodePersist.create({
            dir: randDir()
        });

        storage1.initSync();
        storage2.initSync();

        it("should create 2 new different instances of LocalStorage", function() {
            assert.ok(storage1 instanceof LocalStorage);
            assert.ok(storage2 instanceof LocalStorage);
            assert.ok(storage1 != storage2);
        });

        it("should create a default instance", function(done) {
            var dir = randDir();
            nodePersist.init({dir: dir}).then(function(options) {
                assert.equal(options.dir, dir, "Options don't match");
                done();
            });
        });
    });

    describe("synchronous operations", function() {
        var options = {
            dir: randDir()
        };
        var storage = nodePersist.create();

        var items = {
            "item1": 1,
            "item2": 2
        };

        describe("general items operations", function() {

            it("should initSync()", function(done) {
                storage.initSync(options);
                assert.equal(storage.options.dir, options.dir);
                assert.ok(fs.existsSync(options.dir));
                done();
            });

            it("should setItemSync()", function(done) {
                storage.setItemSync("item1", items.item1);
                assert.equal(storage.getItemSync("item1"), items.item1);
                done();
            });

            it("should getItemSync()", function(done) {
                assert.equal(storage.getItemSync("item1"), items.item1);
                done();
            });

            it("should removeItemSync()", function(done) {
                storage.removeItemSync("item1");
                assert.equal(storage.getItemSync("item1"), undefined);
                done();
            });
        });

        describe("general sync operations", function() {
            beforeEach(function(done) {
                storage.setItemSync("item1", items.item1);
                done();
            });
            afterEach(function(done) {
                storage.clearSync();
                done();
            });

            it("should clearSync()", function(done) {
                storage.clearSync();
                assert.equal(storage.getItemSync("item1"), undefined);
                done();
            });

            it("should return return all values()", function(done) {
                assert.deepEqual(storage.values(), [items.item1]);
                done();
            });

            it("should return return all valuesWithKeyMatch()", function(done) {
                storage.setItemSync("item2", items.item2);
                assert.deepEqual(storage.valuesWithKeyMatch('item1'), [items.item1]);
                storage.removeItemSync("item2");
                done();
            });

            it("should return a key() by index", function(done) {
                storage.setItemSync("item2", items.item2);
                assert.equal(storage.key(1), Object.keys(items)[1]);
                storage.removeItemSync("item2");
                done();
            });

            it("should return all keys()", function(done) {
                assert.deepEqual(storage.keys(), ["item1"]);
                done();
            });

            it("should iterate over each key/value pair using forEach()", function(done) {
                var hash = {};
                storage.forEach(function(key, value) {
                    hash[key] = value;
                });
                assert.deepEqual({item1: 1}, hash);
                done();
            });
        });
    });

    describe("asynchronous operations", function() {
        var options = {
            dir: randDir()
        };
        var storage = nodePersist.create();

        var items = {
            "item1": 1,
            "item2": 2
        };

        describe("general items operations", function() {

            it("should init().then()", function(done) {
                storage.init(options).then(function() {
                    assert.equal(storage.options.dir, options.dir);
                    assert.ok(fs.existsSync(options.dir));
                    done();
                });
            });

            it("should init(callback)", function(done) {
                storage.init(options, function(err) {
                    if (err) throw err;

                    assert.equal(storage.options.dir, options.dir);
                    assert.ok(fs.existsSync(options.dir));
                    done();
                });
            });

            it("should setItem().then()", function(done) {
                storage.setItem("item1", items.item1).then(function() {
                    assert.equal(storage.getItemSync("item1"), items.item1);
                    done();
                });
            });

            it("should setItem(.., callback)", function(done) {
                storage.setItem("item2", items.item2, function(err) {
                    if (err) throw err;

                    assert.equal(storage.getItemSync("item2"), items.item2);
                    done();
                });
            });

            it("should getItem() from cache", function(done) {
                var value = storage.getItem("item1");
                assert.equal(value, items.item1);
                done();
            });

            it("should getItem(.., callback)", function(done) {
                storage.getItem("item2", function(err, value) {
                    if (err) throw err;

                    assert.equal(value, items.item2);
                    done();
                });
            });

            it("should removeItem().then()", function(done) {
                storage.removeItem("item1").then(function() {
                    assert.equal(storage.getItemSync("item1"), undefined);
                    done();
                });
            });

            it("should removeItem(..., callback)", function(done) {
                storage.removeItem("item2", function(err) {
                    if (err) throw err;

                    assert.equal(storage.getItemSync("item2"), undefined);
                    done();
                });
            });
        });

        describe("general sync operations", function() {
            beforeEach(function(done) {
                storage.setItemSync("item1", items.item1);
                storage.setItemSync("item2", items.item2);
                done();
            });
            afterEach(function(done) {
                storage.clearSync();
                done();
            });

            it("should clear().then()", function(done) {
                storage.clear().then(function() {
                    assert.equal(storage.getItemSync("item1"), undefined);
                    assert.equal(storage.getItemSync("item2"), undefined);
                    done();
                });
            });

            it("should clear(callback)", function(done) {
                storage.clear(function(err) {
                    if (err) throw err;

                    assert.equal(storage.getItemSync("item1"), undefined);
                    assert.equal(storage.getItemSync("item2"), undefined);
                    done();
                });
            });
        });
    });

    describe("interval and ttl ", function() {
        this.timeout(5000); // increase the default mocha test timeout.

        it("should respect expired ttl and delete the items", function(done) {

            var storage = nodePersist.create();

            storage.initSync({
                dir: randDir(),
                ttl: 1000 // 1 second
            });

            storage.setItemSync("item1", 1);

            // wait 2 seconds, then try to read the file, should be undefined.
            setTimeout(function() {
                var value = storage.getItemSync("item1");
                assert.equal(value, undefined);

                done();
            }, 2000);
        });

        it("don't persist to disk immediately, but rather on a timely interval", function(done) {

            var storage = nodePersist.create();

            storage.initSync({
                dir: randDir(),
                interval: 2000 // persist to disk every 2 seconds
            });

            var startTime = +new Date();

            storage.setItem("item1", 1).then(function() {
                // 2 seconds later, that file should be there and that promise should resolve now.
                var endTime = +new Date();
                assert.approximately(endTime, startTime, 2500, "within 2.5s or so");
                assert.equal(true, fs.existsSync(storage.options.dir + "/item1"));
                done();
            });

            // check if the item1 file exists immediately, it shouldnt
            assert.notEqual(true, fs.existsSync(storage.options.dir + "/item1"));

        });
    });

    after(function(done) {
        rmdir(TEST_BASE_DIR, done);
    });
});

