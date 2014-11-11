/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

var fs     = require('fs'),
    path   = require('path'),
    mkdirp = require("mkdirp"),
    _      = require("underscore");

var options = {};
var defaults = {
    dir: 'persist',
    stringify: JSON.stringify,
    parse: JSON.parse,
    encoding: 'utf8',
    logging: false,
    continuous: true,
    interval: false,
    ttl: false
};

var data = {};
var changes = {};
var log = console.log;

var dir = __dirname;

var noop = function(err) {
    if (err) throw err;
};

// to support backward compatible callbacks,
// i.e callback(data) vs callback(err, data);
// replace with noop and fix args order,
// when ready to break backward compatibily for the following API functions
// * values()
// * valuesWithKeyMatch()
// look for 'todo-breaks-backward'
var noopWithoutError = function() {};


/*
 * This function, (or initSync) must be called before the library can be used.
 * An options hash can be optionally passed.
 */
exports.init = function (userOptions, callback) {

    setOptions(userOptions);

    if (options.logging) {
        log("options:");
        log(options.stringify(options));
    }

    //remove cached data
    data = {};

    //check to see if dir is present
    fs.exists(options.dir, function (exists) {
        if (exists) {
            //load data
            fs.readdir(options.dir, function (err, arr) {
                for (var i in arr) {
                    var curr = arr[i];
                    if (curr[0] !== '.') {
                        parseFile(curr, function() {

                        });
                    }
                }
            });
        } else {

            //create the directory
            mkdirp(options.dir, function (err) {
                if (err) console.error(err);
                else if(options.logging) log('created ' + options.dir);

            });
        }
    });

    //start persisting
    if (options.interval && options.interval > 0)
        setInterval(exports.persist, options.interval);
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
    var keys = Object.keys(data);
    if (keys.length <= n) {
        return null;
    }
    return keys[n];
};


/*
 * This function returns the value associated with a key in the database,
 *  or undefined if it is not present.
 */
exports.getItem = function (key) {
    return data[key];
};


/*
 * This function returns all the values in the database.
 */
exports.values = function(callback) {
    // todo-breaks-backward: change to ': noopWithoutError;'
    callback = _.isFunction(callback) ? callback : noopWithoutError;

    var values = _.values(data);

    // todo-breaks-backward: change to 'callback(null, values);'
    // @akhoury:note: this is synchronous all the time, you don't need a callback, I would get rid of it
    callback(values);
    return values;
};


exports.valuesWithKeyMatch = function(match, callback) {
    // todo-breaks-backward: change to ': noopWithoutError;'
    callback = _.isFunction(callback) ? callback : noopWithoutError;

    var values = _.filter(data, function(value, key){
        return key.has(match);
    });

    // todo-breaks-backward: change to 'callback(null, values);'
    // @akhoury:note: this is synchronous all the time, you don't need a callback, I would get rid of it
    callback(values);
    return values;
};


/*
 * This function sets a key to a given value in the database.
 */
exports.setItem = function (key, value, callback) {
    callback = _.isFunction(callback) ? callback : noop;
    var msg = "set (" + key + ": " + options.stringify(value) + ")";

    data[key] = value;
    if (options.interval) {
        changes[key] = true;
        if (options.logging)
            log(msg);
        callback(null, {key: key, value: value, queued: true});
    } else if (options.continuous) {
        exports.persistKey(key, function(err, ret) {
            if (err) return callback(err);
            if (options.logging)
                log(msg);
            ret.queued = false;
            callback(null, ret);
        });
    }
};


/*
 * This function removes key in the database if it is present, and
 *  immediately deletes it from the file system asynchronously.
 */
exports.removeItem = function (key, callback) {
    callback = _.isFunction(callback) ? callback : noop;

    delete data[key];
    removePersistedKey(key, function(err, data) {
        if (err) return callback(err);

        if (options.logging) {
            log("removed" + key);
        }
        callback(null, data);
    });
};


/*
 * This function removes all keys in the database, and immediately
 *  deletes all keys from the file system asynchronously.
 */
exports.clear = function (callback) {
    callback = _.isFunction(callback) ? callback : noop;

    // todo, callback all
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
        removePersistedKey(keys[i]);
    }
    data = {};
};


/*
 * This function returns the number of keys stored in the database.
 */
exports.length = function () {
    return Object.keys(data).length;
};


/*
 * This function triggers the database to persist asynchronously.
 */
exports.persist = function (callback) {
    for (var key in data) {
        if (changes[key]) {
            exports.persistKey(key, function() {

            });
        }
    }
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
};


/*
 * This function triggers a key within the database to persist asynchronously.
 */
exports.persistKey = function (key, callback) {
    callback = _.isFunction(callback) ? callback : noop;

    var json = options.stringify(data[key]);
    var file = path.join(options.dir, key);

    fs.writeFile(file, json, options.encoding, function(err) {
        if (err) return callback(err);

        changes[key] = false;
        if (options.logging) {
            log("wrote: " + key);
        }

        callback(null, {key: key, data: json, file: file});
    });

};


/*
 * This function triggers a key within the database to persist synchronously.
 */
exports.persistKeySync = function (key) {
    var json = options.stringify(data[key]);
    fs.writeFileSync(path.join(options.dir, key), json);
    changes[key] = false;
    if (options.logging)
        log("wrote: " + key);
};


/*
 * Helper functions.
 */

var removePersistedKey = function (key, callback) {
    callback = _.isFunction(callback) ? callback : noop;

    //check to see if key has been persisted
    var file = path.join(options.dir, key);
    fs.exists(file, function (exists) {
        if (exists) {
            fs.unlink(file, function (err) {
                callback(err, {key: key, removed: !err, exists: true});
            });
        } else {
            callback(null, {key: key, removed: false, exists: false});
        }
    });
};


var setOptions = function (userOptions) {
    if (!userOptions) {
        options = defaults;
    } else {
        for (var key in defaults) {
            if (userOptions[key]) {
                options[key] = userOptions[key];
            } else {
                options[key] = defaults[key];
            }
        }

        // dir is not absolute
        options.dir = path.normalize(options.dir);
        if (options.dir !== path.resolve(options.dir)) {
            options.dir = path.join(dir, "persist", options.dir);
            if (options.logging) {
                log("Made dir absolute: " + options.dir);
            }
        }

    }
    
    // Check to see if we recieved an external logging function
    if (options.logging && typeof options.logging === 'function') {
        // Overwrite log function with external logging function
        log = options.logging;
        options.logging = true;
    }
};


var parseString = function(str){
    try {
        return options.parse(str);
    } catch(e){
        if(options.logging){
            log("parse error: ", options.stringify(e));
        }
        return undefined;
    }
};


var parseFile = function (key, callback) {
    callback = _.isFunction(callback) ? callback : noop;

    var file = path.join(options.dir, key);
    fs.readFile(file, options.encoding, function (err, json) {
        if (err) return callback(err);

        var value = parseString(json);
        data[key] = value;
        if (options.logging) {
            log("loaded: " + key);
        }
        callback(null, {key: key, value: value, file: file});
    });
};
