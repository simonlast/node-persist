/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

var fs     = require('fs'),
    path   = require('path'),
    mkdirp = require("mkdirp"),
    Q      = require('q'),
    options = {},
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
    data = {},
    ttls = {},
    changes = {},
    log = function() {
        if (options.logging) {
            console.log.apply(console, arguments);
        }
    },
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


/*
 * This function, (or initSync) must be called before the library can be used.
 * An options hash can be optionally passed.
 */
exports.init = function (userOptions, callback) {
    callback = isFunction(callback) ? callback : noop;

    var deferred = Q.defer();
    var deferreds = [];
    setOptions(userOptions);

    log("options:", options.stringify(options));

    //remove cached data
    data = {};
    ttls = {};

    var result = {dir: options.dir};
    deferreds.push(parseDataDir());

    if (options.ttl) {
        result.ttlDir = options.ttlDir;
        deferreds.push(parseTTLDir());
    }

    //start persisting
    if (options.interval && options.interval > 0) {
        exports._persistInterval = setInterval(function() {
            exports._persistDeferred = exports.persist();
        }, options.interval);
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
};


/*
 * This function, (or init) must be called before the library can be used.
 * An options hash can be optionally passed.
 */
exports.initSync = function (userOptions) {
    setOptions(userOptions);
    if (options.logging) {
        log("options:");
        log(options.stringify(options));
    }

    //remove cached data
    data = {};
    ttls = {};

    parseDataDirSync();

    if (options.ttl) {
        parseTTLDirSync();
    }

    //start persisting
    if (options.interval && options.interval > 0)
        setInterval(exports.persistSync, options.interval);
};

/*
 * This function returns a key with index n in the database, or null if
 *  it is not present.
 * This function runs in 0(k), where k is the number of keys in the
 *  database. You probably shouldn't use it.
 */
exports.key = function (n) {
    // todo-breaks-backward: remove this function
    // this is fragile, keys are not guaranteed to be in a any order, so 2 calls using the same index could return a different result
    // http://stackoverflow.com/a/5525820/493756, see the ECMAScript source in that answer
    var keys = exports.keys();
    if (keys.length <= n) {
        return null;
    }
    return keys[n];
};

/*
 * This function returns an array of all the keys in the database
 *
 */
exports.keys = function () {
    return Object.keys(data);
};


/*
 * This function returns the number of keys stored in the database.
 */
exports.length = function () {
    return exports.keys().length;
};

/*
 * This function iterates over each key/value pair and executes a callback
 */
exports.forEach = function(callback) {
    exports.keys().forEach(function(key) {
        callback(key, data[key]);
    });
};

/*
 * This function returns all the values in the database.
 */

exports.values = function(callback) {

    // todo-breaks-backward: remove callback option
    callback = isFunction(callback) ? callback : noopWithoutError;

    var values = exports.keys().map(function(k) {
        return data[k];
    });

    // todo-breaks-backward: remove callback, no need this is sync
    callback(values);

    return values;
};


exports.valuesWithKeyMatch = function(match, callback) {
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
    exports.keys().forEach(function(k) {
        if (filter(k)) {
            values.push(data[k]);
        }
    });

    // todo-breaks-backward: remove callback, no need this is sync
    callback(values);
    return values;
};


/*
 * This function sets a key to a given value in the database.
 */
exports.setItem = function (key, value, callback) {
    callback = isFunction(callback) ? callback : noop;

    var result;
    var logmsg = "set (" + key + ": " + options.stringify(value) + ")";

    var deferred = Q.defer();
    var deferreds = [];

    data[key] = value;
    if (options.ttl) {
        ttls[key] = new Date().getTime() + options.ttl;
    }

    result = {key: key, value: value};

    if (options.interval) {
        changes[key] = true;
        log(logmsg);
        callback(null, result);
        result.queued = true;
        var defer = Q.defer();
        defer.resolve(result);
        return defer.promise;

    } else if (options.continuous) {
        deferreds.push(exports.persistKey(key));

        Q.all(deferreds).then(
            function(result) {
                result = result || {};
                log(logmsg);
                result.queued = false;
                deferred.resolve(result);
                callback(null, result);
            },
            function(err) {
                deferred.resolve(err);
                callback(err);
            });
    }

    return deferred.promise;
};


/*
 * This function sets a key to a given value in the database.
 */
exports.setItemSync = function (key, value) {
    data[key] = value;
    if (options.ttl) {
        ttls[key] = new Date().getTime() + options.ttl;
    }
    exports.persistKeySync(key);
    log("set (" + key + ": " + options.stringify(value) + ")");
};

/*
 * This function returns the value associated with a key in the database,
 *  or undefined if it is not present.
 */
exports.getItem = function (key, callback) {
    callback = isFunction(callback) ? callback : noop;
    if (isExpired(key)) {
        if (options.interval || !options.continuous) {
            callback(null);
            return;
        }
        exports.removeItem(key, function() {
            callback(null);
        });
    } else {
        callback(null, data[key]);
        return data[key];
    }
};

exports.getItemSync = function (key) {
    if (isExpired(key)) {
        exports.removeItemSync(key);
    } else {
        return data[key];
    }
};


/*
 * This function removes key in the database if it is present, and
 *  immediately deletes it from the file system asynchronously.
 */
exports.removeItem = function (key, callback) {
    callback = isFunction(callback) ? callback : noop;

    var deferred = Q.defer();
    var deferreds = [];

    deferreds.push(removePersistedKey(key));

    Q.all(deferreds).then(
        function() {
            delete data[key];
            delete ttls[key];
            log("removed" + key);
            callback(null, data);
            deferred.resolve(data);
        },
        function(err) {
            callback(err);
            deferred.reject(err);
        }
    );
};

/*
 * This function removes key in the database if it is present, and
 *  immediately deletes it from the file system synchronously.
 */
exports.removeItemSync = function (key) {
    removePersistedKeySync(key);
    delete data[key];
    delete ttls[key];
    log("removed" + key);
};


/*
 * This function removes all keys in the database, and immediately
 *  deletes all keys from the file system asynchronously.
 */
exports.clear = function (callback) {
    callback = isFunction(callback) ? callback : noop;

    var deferred = Q.defer();
    var result;
    var deferreds = [];

    var keys = exports.keys();
    for (var i = 0; i < keys.length; i++) {
        deferreds.push(removePersistedKey(keys[i]));
    }

    Q.all(deferreds).then(
        function(result) {
            data = {};
            ttls = {};
            changes = {};
            deferred.resolve(result);
            callback(null, result);
        },
        function(err) {
            deferred.reject(result);
            callback(err);
        });

    return deferred.promise;
};

/*
 * This function removes all keys in the database, and immediately
 *  deletes all keys from the file system synchronously.
 */
exports.clearSync = function () {
    var keys = exports.keys(true);
    for (var i = 0; i < keys.length; i++) {
        removePersistedKeySync(keys[i]);
    }
    data = {};
    ttls = {};
    changes = {};
};

/*
 * This function triggers the database to persist asynchronously.
 */
exports.persist = function (callback) {
    callback = isFunction(callback) ? callback : noop;

    var deferred = Q.defer();
    var result;
    var deferreds = [];

    for (var key in data) {
        if (changes[key]) {
            deferreds.push(exports.persistKey(key));
        }
    }

    Q.all(deferreds).then(
        function(result) {
            deferred.resolve(result);
            callback(null, result);
            log('persist done');
        },
        function(err) {
            deferred.reject(result);
            callback(err);
        });

    return deferred.promise;
};


/*
 * This function triggers the database to persist synchronously.
 */
exports.persistSync = function () {
    for (var key in data) {
        if (changes[key]) {
            exports.persistKeySync(key);
        }
    }
    log('persistSync done');
};


/*
 * This function triggers a key within the database to persist asynchronously.
 */
exports.persistKey = function (key, callback) {
    callback = isFunction(callback) ? callback : noop;

    var json = options.stringify(data[key]);
    var file = path.join(options.dir, key);

    var deferred = Q.defer();
    var result;

    fs.writeFile(file, json, options.encoding, function(err) {
        var fail = function(err) {
            deferred.reject(err);
            return callback(err);
        };
        var done = function() {
            changes[key] = false;
            log("wrote: " + key);
            result = {key: key, data: json, file: file};
            deferred.resolve(result);
            callback(null, result);
        };
        if (err) {
            fail(err);
        }
        if (options.ttl) {
            fs.writeFile(path.join(options.ttlDir, key), options.stringify(ttls[key]), options.encoding, function() {
                if (err) {
                    fail(err);
                } else {
                    done();
                }
            });
        } else {
            done();
        }
    });
    return deferred.promise;
};


/*
 * This function triggers a key within the database to persist synchronously.
 */
exports.persistKeySync = function (key) {
    fs.writeFileSync(path.join(options.dir, key), options.stringify(data[key]));

    if (options.ttl) {
        fs.writeFileSync(path.join(options.ttlDir, key), options.stringify(ttls[key]));
    }

    changes[key] = false;
    log("wrote: " + key);
};


/*
 * Helper functions.
 */

var removePersistedKey = function (key, callback) {
    callback = isFunction(callback) ? callback : noop;

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
};

var removePersistedKeySync = function(key) {
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
};


var setOptions = function (userOptions) {
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
        options.dir = resolveDir(options.dir);
        options.ttlDir = options.dir + '-ttl';
        options.ttl = options.ttl ? isNumber(options.ttl) && options.ttl > 0 ? options.ttl : defaultTTL : false;
    }

    // Check to see if we received an external logging function
    if (isFunction(options.logging)) {
        // Overwrite log function with external logging function
        log = options.logging;
        options.logging = true;
    }
};

var resolveDir = function(dir) {
    dir = path.normalize(dir);
    if (dir !== path.resolve(dir)) {
        dir = path.join(__dirname, "storage", dir || "");
        log("Made dir absolute: " + dir);
    }
    return dir
};


var parseString = function(str){
    try {
        return options.parse(str);
    } catch(e) {
        log("parse error: ", options.stringify(e));
        return undefined;
    }
};

var parseTTLDir = function(callback) {
    return parseDir(options.ttlDir, parseTTLFile, callback);
};

var parseTTLDirSync = function() {
    return parseDirSync(options.ttlDir, ttls);
};

var parseDataDir = function(callback) {
    return parseDir(options.dir, parseDataFile, callback);
};

var parseDataDirSync = function() {
    return parseDirSync(options.dir, data);
};

var parseDir = function(dir, parseFn, callback) {
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
            });
        } else {
            //create the directory
            mkdirp(dir, function (err) {
                if (err) {
                    console.error(err);
                    deferred.reject(err);
                    callback(err);
                } else {
                    log('created ' + dir);
                    deferred.resolve(result);
                    callback(null, result);
                }
            });
        }
    });

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
};

var parseDirSync = function(dir, hash) {
    var exists = fs.existsSync(dir);

    if (exists) { //load data
        var arr = fs.readdirSync(dir);
        for (var i = 0; i < arr.length; i++) {
            var curr = arr[i];
            if (arr[i] && curr[0] !== '.') {
                var json = fs.readFileSync(path.join(dir, curr), options.encoding);
                hash[curr] = parseString(json);
            }
        }
    } else { //create the directory
        mkdirp.sync(dir);
    }
};

var parseDataFile = function(key, callback) {
    parseFile(key, options.dir, data, callback);
};

var parseDataFileSync = function(key) {
    parseFileSync(key, options.dir, data);
};

var parseTTLFile = function(key, callback) {
    parseFile(key, options.ttlDir, ttls, callback);
};

var parseTTLFileSync = function(key) {
    parseFileSync(key, options.ttlDir, ttls);
};

var parseFile = function (key, dir, hash, callback) {
    callback = isFunction(callback) ? callback : noop;
    var deferred = Q.defer();
    var result;
    var file = path.join(dir, key);

    fs.readFile(file, options.encoding, function (err, json) {
        if (err) {
            deferred.reject(err);
            return callback(err);
        }

        var value = parseString(json);

        hash[key] = value;

        log("loaded: " + dir + "/" + key);

        result = {key: key, value: value, file: file};
        deferred.resolve(result);
        callback(null, result);
    });

    return deferred.promise;
};

var parseFileSync = function(key, dir, hash) {
    var file = path.join(dir, key);
    hash[key] = fs.readFileSync(file, options.encoding);
    log("loaded: " + dir + "/" + key);
    return hash[key];
};

var isExpired = function (key) {
    if (!options.ttl) return false;
    return ttls[key] < (new Date()).getTime();
};
