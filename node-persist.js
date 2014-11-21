/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

var dir = __dirname,
    fs     = require('fs'),
    path   = require('path'),
    mkdirp = require("mkdirp"),
    Q      = require('q'),
    pkg    = require(path.join(__dirname, '/package.json')),
    options = {},
    defaults = {
        dir: 'persist',
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8',
        logging: false,
        continuous: true,
        interval: false,
        ttl: false,
        ttlKeysPostFix: '-' + pkg.name + '-ttl'
    },
    defaultTTL = 7 * 24 * 60 * 60 * 1000 /* ttl is truthy but not a number ? 1 week default */,
    data = {},
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
// to support backward compatible callbacks,
// i.e callback(data) vs callback(err, data);
// replace with noop and fix args order,
// when ready to break backward compatibily for the following API functions
// * values()
// * valuesWithKeyMatch()
// look for 'todo-breaks-backward'
    noopWithoutError = function() {};


/*
 * This function, (or initSync) must be called before the library can be used.
 * An options hash can be optionally passed.
 */
exports.init = function (userOptions, callback) {
    callback = isFunction(callback) ? callback : noop;

    var deferred = Q.defer();
    var result;
    var deferreds = [];

    setOptions(userOptions);

    log("options:", options.stringify(options));

    //remove cached data
    data = {};

    result = {dir: options.dir};

    //check to see if dir is present
    fs.exists(options.dir, function (exists) {
        if (exists) {
            //load data
            fs.readdir(options.dir, function (err, arr) {
                if (err) {
                    deferred.reject(err);
                    callback(err);
                }

                for (var i in arr) {
                    var curr = arr[i];
                    if (curr[0] !== '.') {
                        deferreds.push(parseFile(curr));
                    }
                }
            });
        } else {

            //create the directory
            mkdirp(options.dir, function (err) {
                if (err) {
                    console.error(err);
                    deferred.reject(err);
                    callback(err);
                } else {
                    log('created ' + options.dir);
                    deferred.resolve(result);
                    callback(null, result);
                }
            });
        }
    });

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
                deferred.resolve(err);
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

    //check to see if dir is present
    var exists = fs.existsSync(options.dir);
    if (exists) { //load data
        var arr = fs.readdirSync(options.dir);
        for (var i in arr) {
            var curr = arr[i];
            if (curr[0] !== '.') {
                var json = fs.readFileSync(path.join(options.dir, curr),
                    options.encoding);
                var value = parseString(json);
                data[curr] = value;
            }
        }
    } else { //create the directory
        mkdirp.sync(options.dir);
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
 * however, if using options.ttl and not-passing a true boolean, the ttl-keys will be filtered
 *
 */
exports.keys = function (includeTTLKeys) {
    var keys = Object.keys(data);
    if (!options.ttl || includeTTLKeys) {
        return keys;
    }
    return keys.filter(function(key) {
        return !options.ttlRegExp.test(key);
    });
};


/*
 * This function returns the number of keys stored in the database.
 */
exports.length = function (includeTTLKeys) {
    return exports.keys(includeTTLKeys).length;
};

/*
 * This function iterates over each key/value pair and executes a callback
 */
exports.forEach = function(includeTTLKeys, callback) {
    if (isFunction(includeTTLKeys)) {
        callback = includeTTLKeys;
        includeTTLKeys = null;
    }
    exports.keys(includeTTLKeys).forEach(function(key) {
        callback(key, data[key]);
    });
};

/*
 * This function returns all the values in the database.
 */

exports.values = function(includeTTLKeys, callback) {
    if (isFunction(includeTTLKeys)) {
        callback = includeTTLKeys;
        includeTTLKeys = null;
    }

    // todo-breaks-backward: remove callback option
    callback = isFunction(callback) ? callback : noopWithoutError;

    var values = exports.keys(includeTTLKeys).map(function(k) {
        return data[k];
    });

    // todo-breaks-backward: remove callback, no need this is sync
    callback(values);

    return values;
};


exports.valuesWithKeyMatch = function(match, includeTTLKeys, callback) {
    if (isFunction(includeTTLKeys)) {
        callback = includeTTLKeys;
        includeTTLKeys = null;
    }

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
    exports.keys(includeTTLKeys).forEach(function(k) {
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
        data[key + options.ttlKeysPostFix] = new Date().getTime() + options.ttl;
    }

    result = {key: key, value: value};

    if (options.interval) {
        changes[key] = true;

        if (options.ttl) {
            changes[key + options.ttlKeysPostFix] = true;
        }

        log(logmsg);
        callback(null, result);
        result.queued = true;
        return Q.defer().resolve(result).promise;

    } else if (options.continuous) {
        deferreds.push(exports.persistKey(key));
        if (options.ttl) {
            deferreds.push(exports.persistKey(key + options.ttlKeysPostFix));
        }

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
    exports.persistKeySync(key);
    if (options.ttl) {
        data[key + options.ttlKeysPostFix] = new Date().getTime() + options.ttl;
        exports.persistKeySync(key + options.ttlKeysPostFix);
    }
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
    if (options.ttl) {
        deferreds.push(removePersistedKey(key + options.ttlKeysPostFix));
    }

    Q.all(deferreds).then(
        function() {
            delete data[key];
            if (options.ttl) {
                delete data[key + options.ttlKeysPostFix];
            }
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
    if (options.ttl) {
        removePersistedKeySync(key + options.ttlKeysPostFix);
    }
    delete data[key];
    if (options.ttl) {
        delete data[key + options.ttlKeysPostFix];
    }
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

    var keys = exports.keys(true);
    for (var i = 0; i < keys.length; i++) {
        deferreds.push(removePersistedKey(keys[i]));
    }

    Q.all(deferreds).then(
        function(result) {
            data = {};
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
        if (err) {
            deferred.reject(err);
            return callback(err);
        }

        changes[key] = false;
        log("wrote: " + key);
        result = {key: key, data: json, file: file};

        deferred.resolve(result);
        callback(null, result);
    });

    return deferred.promise;
};


/*
 * This function triggers a key within the database to persist synchronously.
 */
exports.persistKeySync = function (key) {
    var json = options.stringify(data[key]);
    fs.writeFileSync(path.join(options.dir, key), json);
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

                if (err) {
                    deferred.reject(err);
                    return callback(err, result);
                }

                deferred.resolve(result);
                callback(err, result);
            });
        } else {
            result = {key: key, removed: false, exists: false};
            deferred.resolve(result);
            callback(err, result);
        }
    });

    return deferred.promise;
};

var removePersistedKeySync = function(key) {
    var file = path.join(options.dir, key);
    if (fs.existsSync(file)) {
        return fs.unlinkSync(file);
    }
};


var setOptions = function (userOptions) {
    if (!userOptions) {
        options = defaults;
    } else {
        for (var key in defaults) {
            if (userOptions[key] != null) { // not null and not undefined
                options[key] = userOptions[key];
            } else {
                options[key] = defaults[key];
            }
        }

        // dir is not absolute
        options.dir = path.normalize(options.dir);
        if (options.dir !== path.resolve(options.dir)) {
            options.dir = path.join(dir, "persist", options.dir);
            log("Made dir absolute: " + options.dir);
        }

        options.ttl = options.ttl ? isNumber(options.ttl) && options.ttl > 0 ? options.ttl : defaultTTL : false;
    }

    options.ttlRegExp = new RegExp(escapeRegExp(options.ttlKeysPostFix) + '$');

    // Check to see if we received an external logging function
    if (isFunction(options.logging)) {
        // Overwrite log function with external logging function
        log = options.logging;
        options.logging = true;
    }
};


var parseString = function(str){
    try {
        return options.parse(str);
    } catch(e) {
        log("parse error: ", options.stringify(e));
        return undefined;
    }
};


var parseFile = function (key, callback) {
    callback = isFunction(callback) ? callback : noop;

    var deferred = Q.defer();
    var result;
    var file = path.join(options.dir, key);

    fs.readFile(file, options.encoding, function (err, json) {
        if (err) {
            deferred.reject(err);
            return callback(err);
        }

        var value = parseString(json);
        data[key] = value;

        log("loaded: " + key);

        result = {key: key, value: value, file: file};
        deferred.resolve(result);
        callback(null, result);
    });

    return deferred.promise;
};

var isExpired = function (key) {
    if (!options.ttl) return false;
    return data[key + options.ttlKeysPostFix] < (new Date()).getTime();
};

var escapeRegExp = function(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
};
