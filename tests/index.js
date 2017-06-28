
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
        var dir1 = randDir();
        var storage1 = nodePersist.create({
            dir: dir1
        });
        var dir2 = randDir();
        var storage2 = nodePersist.create({
            dir: dir2
        });

        storage1.initSync();
        storage2.initSync();

        it("should create 2 new different instances of LocalStorage", function(done) {
            assert.ok(storage1 instanceof LocalStorage);
            assert.ok(storage2 instanceof LocalStorage);
            assert.ok(storage1 != storage2);
            done();
        });

        storage1.setItemSync("s1", 1111);
        storage2.setItemSync("s2", {a: 1});

        var storage11 = nodePersist.create({
            dir: dir1
        });
        var storage22 = nodePersist.create({
            dir: dir2
        });

        it("should use the 2 previous dirs and initSync correctly", function(done) {
            storage11.initSync();
            assert.equal(storage11.getItemSync("s1"), 1111, "write/read didn't work");

            storage22.init().then(function() {
                storage2.getItem("s2").then(function(value) {
                    assert.deepEqual(value, {a: 1}, "write/read didn't work");
                    done();
                })
            });
        });

        it("should create the default instance of LocalStorage sync and use it", function(done) {
            nodePersist.initSync({
                dir: randDir()
            });
            assert.ok(nodePersist.defaultInstance instanceof LocalStorage);
            nodePersist.setItemSync("item8877", "hello");
            assert.equal(nodePersist.getItemSync("item8877"), 'hello', "write/read didn't work");
            done();
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
                storage.setItemSync("item11", items.item1);
                assert.deepEqual(storage.valuesWithKeyMatch('item1'), [items.item1, items.item1]);
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

            it("should getItem().then() from cache", function(done) {
                storage.getItem("item1").then(function(value) {
                    assert.equal(value, items.item1);
                    done();
                })
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

        it("should respect an expired different ttl per setItem and delete the items", function(done) {
            this.timeout(10000);
            var storage = nodePersist.create();

            storage.initSync({
                dir: randDir(),
                ttl: 1000 // 1 second,
            });

            storage.setItemSync("item1", 1, {ttl: 5000});


            // wait 2 seconds, then try to read the item1 file, should still be there because we asked this one to live for 5 seconds, despite the default 1 second ttl
            setTimeout(function() {
                var value = storage.getItemSync("item1");
                assert.equal(value, 1);
            }, 2000);

            // wait 5.5 seconds, then try to read the item1 file, should be undefined
            setTimeout(function() {
                var value = storage.getItemSync("item1");
                assert.equal(value, undefined);

                // call done only once here, since it's 3 seconds after
                done();
            }, 5500);
        });

        it("should automatically delete expired items", function(done) {
            this.timeout(10000);

            var storage = nodePersist.create();
            storage.initSync({
                dir: randDir(),
                expiredInterval: 3000
            });

            storage.setItemSync("item1", 1, {ttl: 5000});

            // wait 8 seconds, then check the keys, should be empty, item1 should've been deleted automatically based on the expiredInterval
            setTimeout(function() {
                var value = storage.keys();
                assert.equal(value.length, 0);
                done();
            }, 7000);
        });

        it("don't persist to disk immediately, but rather on a timely interval", function(done) {

            var storage = nodePersist.create();

            storage.init({
                dir: randDir(),
                interval: 2000 // persist to disk every 2 seconds
            }).then(function() {
                var startTime = +new Date();

                storage.setItem("item999", 1).then(function () {
                    // should resolve immediately but should not create the storate file immediately
                    assert.notEqual(true, fs.existsSync(storage.options.dir + "/" + storage.md5("item999")));

                    setTimeout(function() {
                        // 2 seconds later, that file should be there
                        var endTime = +new Date();
                        assert.approximately(endTime, startTime, 2500, "within 2.5s or so");
                        assert.equal(true, fs.existsSync(storage.options.dir + "/" + storage.md5("item999")));
                        done();
                    }, 2000);
                });

                // check if the item1 file exists immediately, it shouldnt
                assert.notEqual(true, fs.existsSync(storage.options.dir + "/" + storage.md5("item999")));
            });
        });
    });

    describe("Parsing errors", function() {
        it("should throw an error (sync) because of an invalid file in the storage dir", function (done) {
            this.timeout(5000);
            var dir = randDir();
            var storage = nodePersist.create();

            // make sure the dir is there, and write a random file in there
            mkdirp.sync(dir);
            fs.writeFileSync(dir + '/foo.bar', 'nothing that makes sense');

            try {
                storage.initSync({
                    dir: dir
                });
            } catch (e) {
                assert.equal(true, /^\[PARSE-ERROR\].*does not look like a valid storage file/.test(e.message));
                done();
            }
        });

        it("should NOT throw an error (sync) because of an invalid file in the storage dir, because forgiveParseErrors=true", function (done) {
            this.timeout(5000);
            var dir = randDir();
            var storage = nodePersist.create();

            // make sure the dir is there, and write a random file in there
            mkdirp.sync(dir);
            fs.writeFileSync(dir + '/foo.bar', 'nothing that makes sense');

            storage.initSync({
                dir: dir,
                forgiveParseErrors: true
            });
            assert.equal(storage.options.dir, dir, "options.dir don't match");
            done();
        });

        it("should throw an error (async) because of an invalid file in the storage dir", function (done) {
            this.timeout(5000);
            var dir = randDir();
            var storage = nodePersist.create();

            // make sure the dir is there, and write a random file in there
            mkdirp.sync(dir);
            fs.writeFileSync(dir + '/foo.bar', 'nothing that makes sense');

            storage.init({
                dir: dir
            }).catch(function(err) {
                assert.equal(true, /^\[PARSE-ERROR\].*does not look like a valid storage file/.test(err.message));
                done();
            });
        });

        it("should NOT throw an error (async) because of an invalid file in the storage dir, because forgiveParseErrors=true", function (done) {
            this.timeout(5000);
            var dir = randDir();
            var storage = nodePersist.create();

            // make sure the dir is there, and write a random file in there
            mkdirp.sync(dir);
            fs.writeFileSync(dir + '/foo.bar', 'nothing that makes sense');

            storage.init({
                dir: dir,
                forgiveParseErrors: true
            }).then(function(options) {
                assert.equal(options.dir, dir, "options.dir don't match");
                done();
            }).catch(function(err) {
                throw err;
            });
        });
    });

    after(function(done) {
        rmdir(TEST_BASE_DIR, done);
    });
});
