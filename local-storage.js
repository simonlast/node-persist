/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

var fs     = require('fs'),
    path   = require('path'),
    mkdirp = require("mkdirp"),
    Q      = require('q'),

    defaults = {
        dir: 'persist',
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8',
        logging: false,
        continuous: true,
        interval: false,
        ttl: false
    },

    defaultTTL = 24 * 60 * 60 * 1000 /* ttl is truthy but not a number ? 24h default */,

    isNumber = function(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    },

    isFunction = function(fn) {
        return typeof fn === 'function';
    },

    noop = function(err) {
        if (err) throw err;
    },

    /*
     * To support backward compatible callbacks,
     * i.e callback(data) vs callback(err, data);
     * replace with noop and fix args order, when ready to break backward compatibily for the following API functions
     * - values()
     * - valuesWithKeyMatch()
     * hint: look for 'todo-breaks-backward' in the source
     */
    noopWithoutError = function() {};

var LocalStorage = function (userOptions) {
    if(!(this instanceof LocalStorage)) {
        return new LocalStorage(userOptions);
    }
    this.data = {};
    this.ttls = {};
    this.changes = {};
    this.setOptions(userOptions);

    // we don't call init in the constructor because we can only so for the initSync
    // for init async, it returns a promise, and in order to maintain that API, we cannot return the promise in the constructor
    // so init must be called on the instance of new LocalStorage();
};

LocalStorage.prototype = {

    setOptions: function (userOptions) {
        var options = {};

        if (!userOptions) {
            options = defaults;
        } else {
            for (var key in defaults) {
                if (userOptions.hasOwnProperty(key)) {
                    options[key] = userOptions[key];
                } else {
                    options[key] = defaults[key];
                }
            }

            // dir is not absolute
            options.dir = this.resolveDir(options.dir);
            options.ttlDir = options.dir + '-ttl';
            options.ttl = options.ttl ? isNumber(options.ttl) && options.ttl > 0 ? options.ttl : defaultTTL : false;
        }

        // Check to see if we received an external logging function
        if (isFunction(options.logging)) {
            // Overwrite log function with external logging function
            this.log = options.logging;
            options.logging = true;
        }

        this.options = options;
    },

    init: function (userOptions, callback) {
        if (isFunction(userOptions)) {
            callback = userOptions;
            userOptions = null;
        }
        if (userOptions) {
            this.setOptions(userOptions);
        }
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var deferreds = [];

        var options = this.options;

        var result = {dir: options.dir};
        deferreds.push(this.parseDataDir());

        if (options.ttl) {
            result.ttlDir = options.ttlDir;
            deferreds.push(this.parseTTLDir());
        }

        //start persisting
        if (options.interval && options.interval > 0) {
            this._persistInterval = setInterval(this.persist.bind(this), options.interval);
        }

        if (deferreds.length) {
            Q.all(deferreds).then(
                function() {
                    deferred.resolve(result);
                    callback(null, result);
                },
                function(err) {
                    deferred.reject(err);
                    callback(null, err);
                });
        }

        return deferred.promise;
    },

    initSync: function (userOptions) {
        if (userOptions) {
            this.setOptions(userOptions);
        }

        var options = this.options;

        if (options.logging) {
            this.log("options:");
            this.log(options.stringify(options));
        }

        this.parseDataDirSync();

        if (options.ttl) {
            this.parseTTLDirSync();
        }

        //start synchronous persisting,
        if (options.interval && options.interval > 0) {
            this._persistInterval = setInterval(this.persistSync.bind(this), options.interval);
        }
    },

    key: function (n) {
        // todo-breaks-backward: remove this function
        // this is fragile, keys are not guaranteed to be in a any order, so 2 calls using the same index could return a different result
        // http://stackoverflow.com/a/5525820/493756, see the ECMAScript source in that answer
        var keys = this.keys();
        if (keys.length <= n) {
            return null;
        }
        return keys[n];
    },

    keys: function () {
        return Object.keys(this.data);
    },

    length: function () {
        return this.keys().length;
    },

    forEach: function(callback) {
        return this.keys().forEach(function(key) {
            callback(key, this.data[key]);
        }.bind(this));
    },

    values: function(callback) {

        // todo-breaks-backward: remove callback option
        callback = isFunction(callback) ? callback : noopWithoutError;

        var values = this.keys().map(function(k) {
            return this.data[k];
        }.bind(this));

        // todo-breaks-backward: remove callback, no need this is sync
        callback(values);

        return values;
    },


    valuesWithKeyMatch: function(match, callback) {
        // todo-breaks-backward: remove callback option
        callback = isFunction(callback) ? callback : noopWithoutError;

        match = match || /.*/;

        var filter = match instanceof RegExp ?
            function(key) {
                return match.test(key);
            } :
            function(key) {
                return match.indexOf(key) !== -1;
            };

        var values = [];
        this.keys().forEach(function(k) {
            if (filter(k)) {
                values.push(this.data[k]);
            }
        }.bind(this));

        // todo-breaks-backward: remove callback, no need this is sync
        callback(values);
        return values;
    },

    setItem: function (key, value, callback) {
        callback = isFunction(callback) ? callback : noop;

        var options = this.options;
        var result;
        var logmsg = "set (" + key + ": " + options.stringify(value) + ")";

        var deferred = Q.defer();
        var deferreds = [];

        this.data[key] = value;
        if (options.ttl) {
            this.ttls[key] = new Date().getTime() + options.ttl;
        }

        result = {key: key, value: value};

        if (options.interval) {
            changes[key] = true;
            this.log(logmsg);
            callback(null, result);
            result.queued = true;
            var defer = Q.defer();
            defer.resolve(result);
            return defer.promise;

        } else if (options.continuous) {
            deferreds.push(this.persistKey(key));

            Q.all(deferreds).then(
                function(result) {
                    result = result || {};
                    this.log(logmsg);
                    result.queued = false;
                    deferred.resolve(result);
                    callback(null, result);
                }.bind(this),
                function(err) {
                    deferred.resolve(err);
                    callback(err);
                });
        }

        return deferred.promise;
    },

    setItemSync: function (key, value) {
        this.data[key] = value;
        if (this.options.ttl) {
            this.ttls[key] = new Date().getTime() + this.options.ttl;
        }
        this.persistKeySync(key);
        this.log("set (" + key + ": " + this.options.stringify(value) + ")");
    },

    getItem: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;
        if (this.isExpired(key)) {
            if (this.options.interval || !this.options.continuous) {
                callback(null);
                return;
            }
            this.removeItem(key, function() {
                callback(null);
            });
        } else {
            callback(null, this.data[key]);
            return this.data[key];
        }
    },

    getItemSync: function (key) {
        if (this.isExpired(key)) {
            this.removeItemSync(key);
        } else {
            return this.data[key];
        }
    },

    removeItem: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var deferreds = [];

        deferreds.push(this.removePersistedKey(key));

        Q.all(deferreds).then(
            function() {
                delete this.data[key];
                delete this.ttls[key];
                this.log("removed" + key);
                callback(null, this.data);
                deferred.resolve(this.data);
            }.bind(this),
            function(err) {
                callback(err);
                deferred.reject(err);
            }
        );
    },

    removeItemSync: function (key) {
        this.removePersistedKeySync(key);
        delete this.data[key];
        delete this.ttls[key];
        this.log("removed" + key);
    },

    clear: function (callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var result;
        var deferreds = [];

        var keys = this.keys();
        for (var i = 0; i < keys.length; i++) {
            deferreds.push(this.removePersistedKey(keys[i]));
        }

        Q.all(deferreds).then(
            function(result) {
                this.data = {};
                this.ttls = {};
                this.changes = {};
                deferred.resolve(result);
                callback(null, result);
            }.bind(this),
            function(err) {
                deferred.reject(result);
                callback(err);
            });

        return deferred.promise;
    },

    clearSync: function () {
        var keys = this.keys(true);
        for (var i = 0; i < keys.length; i++) {
            this.removePersistedKeySync(keys[i]);
        }
        this.data = {};
        this.ttls = {};
        this.changes = {};
    },

    persist: function (callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var result;
        var deferreds = [];

        for (var key in this.data) {
            if (this.changes[key]) {
                deferreds.push(this.persistKey(key));
            }
        }

        Q.all(deferreds).then(
            function(result) {
                deferred.resolve(result);
                callback(null, result);
                this.log('persist done');
            }.bind(this),
            function(err) {
                deferred.reject(result);
                callback(err);
            });

        return deferred.promise;
    },

    persistSync: function () {
        for (var key in this.data) {
            if (this.changes[key]) {
                this.persistKeySync(key);
            }
        }
        this.log('persistSync done');
    },

    /*
     * This function triggers a key within the database to persist asynchronously.
     */
    persistKey: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;

        var options = this.options;
        var json = options.stringify(this.data[key]);
        var file = path.join(options.dir, key);

        var deferred = Q.defer();
        var result;

        fs.writeFile(file, json, options.encoding, function(err) {

            var fail = function(err) {
                deferred.reject(err);
                return callback(err);
            };

            var done = function() {
                this.changes[key] = false;
                this.log("wrote: " + key);
                result = {key: key, data: json, file: file};
                deferred.resolve(result);
                callback(null, result);
            }.bind(this);

            if (err) {
                fail(err);
            }
            if (options.ttl) {
                fs.writeFile(path.join(options.ttlDir, key), options.stringify(this.ttls[key]), options.encoding, function() {
                    if (err) {
                        fail(err);
                    } else {
                        done();
                    }
                });
            } else {
                done();
            }
        }.bind(this));

        return deferred.promise;
    },

    persistKeySync: function (key) {
        var options = this.options;
        fs.writeFileSync(path.join(options.dir, key), options.stringify(this.data[key]));

        if (options.ttl) {
            fs.writeFileSync(path.join(options.ttlDir, key), options.stringify(this.ttls[key]));
        }

        this.changes[key] = false;
        this.log("wrote: " + key);
    },

    removePersistedKey: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;

        var options = this.options;
        var deferred = Q.defer();
        var result;

        //check to see if key has been persisted
        var file = path.join(options.dir, key);
        fs.exists(file, function (exists) {
            if (exists) {
                fs.unlink(file, function (err) {
                    result = {key: key, removed: !err, exists: true};

                    var fail = function(err) {
                        deferred.reject(err);
                        callback(err, result);
                    };

                    var done = function() {
                        deferred.resolve(result);
                        callback(null, result);
                    };

                    if (err) {
                        return fail(err);
                    }

                    if (options.ttl) {
                        var ttlFile = path.join(options.ttlDir, key);
                        fs.exists(ttlFile, function (exists) {
                            if (exists) {
                                fs.unlink(ttlFile, function (err) {
                                    if (err) {
                                        fail(err);
                                    }
                                    done();
                                });
                            } else {
                                done();
                            }
                        });
                    } else {
                        done();
                    }
                });
            } else {
                result = {key: key, removed: false, exists: false};
                deferred.resolve(result);
                callback(null, result);
            }
        });

        return deferred.promise;
    },

    parseString: function(str){
        try {
            return this.options.parse(str);
        } catch(e) {
            this.log("parse error: ", this.options.stringify(e));
            return undefined;
        }
    },

    parseTTLDir: function(callback) {
        return this.parseDir(this.options.ttlDir, this.parseTTLFile.bind(this), callback);
    },

    parseTTLDirSync: function() {
        return this.parseDirSync(this.options.ttlDir, this.ttls);
    },

    parseDataDir: function(callback) {
        return this.parseDir(this.options.dir, this.parseDataFile.bind(this), callback);
    },

    parseDataDirSync: function() {
        return this.parseDirSync(this.options.dir, this.data);
    },

    parseDir: function(dir, parseFn, callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var deferreds = [];

        var result = {dir: dir};
        //check to see if dir is present
        fs.exists(dir, function (exists) {
            if (exists) {
                //load data
                fs.readdir(dir, function (err, arr) {
                    if (err) {
                        deferred.reject(err);
                        callback(err);
                    }

                    for (var i in arr) {
                        var curr = arr[i];
                        if (curr[0] !== '.') {
                            deferreds.push(parseFn(curr));
                        }
                    }
                }.bind(this));
            } else {
                //create the directory
                mkdirp(dir, function (err) {
                    if (err) {
                        console.error(err);
                        deferred.reject(err);
                        callback(err);
                    } else {
                        this.log('created ' + dir);
                        deferred.resolve(result);
                        callback(null, result);
                    }
                }.bind(this));
            }
        }.bind(this));

        if (deferreds.length) {
            Q.all(deferreds).then(
                function() {
                    deferred.resolve(result);
                    callback(null, result);
                },
                function(err) {
                    deferred.reject(err);
                    callback(null, err);
                });
        }

        return deferred.promise;
    },

    parseDirSync: function(dir, hash) {
        var exists = fs.existsSync(dir);

        if (exists) { //load data
            var arr = fs.readdirSync(dir);
            for (var i = 0; i < arr.length; i++) {
                var curr = arr[i];
                if (arr[i] && curr[0] !== '.') {
                    var json = fs.readFileSync(path.join(dir, curr), this.options.encoding);
                    hash[curr] = this.parseString(json);
                }
            }
        } else { //create the directory
            mkdirp.sync(dir);
        }
    },

    parseDataFile: function(key, callback) {
        this.parseFile(key, this.options.dir, this.data, callback);
    },

    parseDataFileSync: function(key) {
        this.parseFileSync(key, this.options.dir, this.data);
    },

    parseTTLFile : function(key, callback) {
        this.parseFile(key, this.options.ttlDir, this.ttls, callback);
    },

    parseTTLFileSync: function(key) {
        this.parseFileSync(key, this.options.ttlDir, this.ttls);
    },

    parseFile: function (key, dir, hash, callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var result;
        var file = path.join(dir, key);
        var options = this.options;

        fs.readFile(file, options.encoding, function (err, json) {
            if (err) {
                deferred.reject(err);
                return callback(err);
            }

            var value = this.parseString(json);

            hash[key] = value;

            this.log("loaded: " + dir + "/" + key);

            result = {key: key, value: value, file: file};
            deferred.resolve(result);
            callback(null, result);

        }.bind(this));

        return deferred.promise;
    },

    parseFileSync: function(key, dir, hash) {
        var file = path.join(dir, key);
        hash[key] = fs.readFileSync(file, this.options.encoding);
        this.log("loaded: " + dir + "/" + key);
        return hash[key];
    },

    isExpired: function (key) {
        if (!this.options.ttl) return false;
        return this.ttls[key] < (new Date()).getTime();
    },

    removePersistedKeySync: function(key) {
        var options = this.options;

        var file = path.join(options.dir, key);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
        if (options.ttl) {
            var ttlFile = path.join(options.ttlDir, key);
            if (fs.existsSync(ttlFile)) {
                fs.unlinkSync(ttlFile);
            }
        }
    },

    resolveDir: function(dir) {
        dir = path.normalize(dir);
        if (dir !== path.resolve(dir)) {
            dir = path.join(__dirname, "storage", dir || "");
            this.log("Made dir absolute: " + dir);
        }
        return dir;
    },

    stopInterval: function () {
        clearInterval(this._persistInterval);
    },

    log: function () {
        this.options && this.options.logging && console.log.apply(console, arguments);
    }
};

module.exports = LocalStorage;
