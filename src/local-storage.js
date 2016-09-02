/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

var fs     = require('fs'),
    path   = require('path'),
    crypto   = require('crypto'),
    mkdirp = require('mkdirp'),
    Q      = require('q'),
    pkg    = require('../package.json'),

    defaults = {
        dir: '.' + pkg.name + '/storage',
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8',
        logging: false,
        continuous: true,
        interval: false,
        ttl: false
    },

    defaultTTL = 24 * 60 * 60 * 1000 /* if ttl is truthy but it's not a number, use 24h as default */,

    isNumber = function(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    },

    isFunction = function(fn) {
        return typeof fn === 'function';
    },

    noop = function(err) {
        if (err) throw err;
    },

    md5 = function (data) {
        return crypto.createHash('md5').update(data).digest("hex");
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
    this.changes = {};
    this.setOptions(userOptions);

    // we don't call init in the constructor because we can only do so for the initSync
    // for init async, it returns a promise, and in order to maintain that API, we cannot return the promise in the constructor
    // so init must be called, separately, on the instance of new LocalStorage();
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

            options.dir = this.resolveDir(options.dir);
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
        deferreds.push(this.parseStorageDir());

        //start persisting
        if (options.interval && options.interval > 0) {
            this._persistInterval = setInterval(this.persist.bind(this), options.interval);
        }

        Q.all(deferreds).then(
            function() {
                deferred.resolve(result);
                callback(null, result);
            },
            function(err) {
                deferred.reject(err);
                callback(err);
            });

        return deferred.promise;
    },

    initSync: function (userOptions) {
        if (userOptions) {
            this.setOptions(userOptions);
        }

        var options = this.options;

        if (options.logging) {
            this.log("options:");
            this.log(this.stringify(options));
        }

        this.parseStorageDirSync();

        //start synchronous persisting,
        if (options.interval && options.interval > 0) {
            this._persistInterval = setInterval(this.persistSync.bind(this), options.interval);
        }
    },

    keys: function () {
        return Object.keys(this.data);
    },

    length: function () {
        return this.keys().length;
    },

    forEach: function(callback) {
        return this.keys().forEach(function(key) {
            callback(key, this.data[key].value);
        }.bind(this));
    },

    values: function() {
        return this.keys().map(function(k) {
            return this.data[k].value;
        }.bind(this));
    },

    valuesWithKeyMatch: function(match) {
        match = match || /.*/;

        var filter = match instanceof RegExp ?
            function(key) {
                return match.test(key);
            } :
            function(key) {
                return key.indexOf(match) !== -1;
            };

        var values = [];
        this.keys().forEach(function(k) {
            if (filter(k)) {
                values.push(this.data[k].value);
            }
        }.bind(this));

        return values;
    },

    set: function (key, value, callback) {
        return this.setItem(key, value, callback);
    },

    setItem: function (key, value, callback) {
        callback = isFunction(callback) ? callback : noop;

        var options = this.options;
        var logmsg = "set (" + key + ": " + this.stringify(value) + ")";

        var deferred = Q.defer();
        var deferreds = [];

        var ttl = options.ttl ? new Date().getTime() + options.ttl : undefined;
        this.data[key] = {value: value, ttl: ttl};

        var result = {key: key, value: value, ttl: ttl, queued: !!options.interval, manual: !options.interval && !options.continuous};

        var onSuccess = function () {
            callback(null, result);
            deferred.resolve(result);
        };

        var onError = function (err) {
            callback(err);
            deferred.reject(err);
        };

        this.log(logmsg);

        if (options.interval || !options.continuous) {
            this.changes[key] = {onSuccess: onSuccess, onError: onError};
        } else {
            deferreds.push(this.persistKey(key));

            Q.all(deferreds).then(
                function(result) {
                    deferred.resolve(result);
                    callback(null, result);
                }.bind(this),
                function(err) {
                    deferred.reject(err);
                    callback(err);
                });
        }

        return deferred.promise;
    },

    setItemSync: function (key, value) {
        var ttl = this.options.ttl ? new Date().getTime() + this.options.ttl: undefined;
        this.data[key] = {key: key, value: value, ttl: ttl};
        this.persistKeySync(key);
        this.log("set (" + key + ": " + this.stringify(value) + ")");
    },

    get: function (key, callback) {
        return this.getItem(key, callback);
    },

    getItem: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;
        var deferred = Q.defer();

        if (this.isExpired(key)) {
            this.log(key + ' has expired');
            if (this.options.interval || !this.options.continuous) {
                callback(null, null);
                return deferred.resolve(null);
            }
            return this.removeItem(key).then(function() {
                return null;
            });
        } else {
            callback(null, this.data[key] && this.data[key].value);
            deferred.resolve(this.data[key] && this.data[key].value);
        }
        return deferred.promise;
    },

    getItemSync: function (key) {
        if (this.isExpired(key)) {
            this.removeItemSync(key);
        } else {
            return this.data[key] && this.data[key].value;
        }
    },

    del: function (key, callback) {
        return this.removeItem(key, callback);
    },

    rm: function (key, callback) {
        return this.removeItem(key, callback);
    },

    removeItem: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var deferreds = [];

        deferreds.push(this.removePersistedKey(key));

        Q.all(deferreds).then(
            function() {
                var value = this.data[key].value;
                delete this.data[key];
                this.log('removed: ' + key);
                callback(null, value);
                deferred.resolve(value);
            }.bind(this),
            function(err) {
                callback(err);
                deferred.reject(err);
            }
        );
        return deferred.promise;
    },

    removeItemSync: function (key) {
        var value = this.data[key].value;
        this.removePersistedKeySync(key);
        delete this.data[key];
        this.log('removed: ' + key);
        return value;
    },

    clear: function (callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var deferreds = [];

        var keys = this.keys();
        for (var i = 0; i < keys.length; i++) {
            deferreds.push(this.removePersistedKey(keys[i]));
        }

        Q.all(deferreds).then(
            function() {
                this.data = {};
                this.changes = {};
                deferred.resolve();
                callback();
            }.bind(this),
            function(err) {
                deferred.reject(err);
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

        var self = this;
        var options = this.options;
        var file = path.join(options.dir, md5(key));

        var deferred = Q.defer();
        var output = {key: key, value: this.data[key].value, file: file, ttl: this.data[key].ttl};

        fs.writeFile(file, this.stringify(output), options.encoding, function(err) {
            if (err) {
                self.changes[key] && self.changes[key].onError && self.changes[key].onError(err);
                deferred.reject(err);
                return callback(err);
            }

            self.changes[key] && self.changes[key].onSuccess && self.changes[key].onSuccess();
            delete self.changes[key];
            deferred.resolve(output);
            callback(null, output);
            self.log("wrote: " + key);
        });

        return deferred.promise;
    },

    persistKeySync: function (key) {
        var options = this.options;
        var file = path.join(options.dir, md5(key));

        var output = {key: key, value: this.data[key].value, file: file, ttl: this.data[key].ttl};
        try {
            fs.writeFileSync(file, this.stringify(output));
            this.changes[key] && this.changes[key].onSuccess && this.changes[key].onSuccess();
        } catch (err) {
            this.changes[key] && this.changes[key].onError && this.changes[key].onError(err);
            throw err;
        }
        delete this.changes[key];
        this.log("wrote: " + key);
    },

    removePersistedKey: function (key, callback) {
        callback = isFunction(callback) ? callback : noop;

        var options = this.options;
        var deferred = Q.defer();
        var result;

        //check to see if key has been persisted
        var file = path.join(options.dir, md5(key));
        fs.exists(file, function (exists) {
            if (exists) {
                fs.unlink(file, function (err) {
                    result = {key: key, removed: !err, existed: exists};
                    if (err) {
                        deferred.reject(err);
                        return callback(err);
                    }
                    deferred.resolve(result);
                    callback(null, result);
                });
            } else {
                result = {key: key, removed: false, existed: exists};
                deferred.resolve(result);
                callback(null, result);
            }
        });

        return deferred.promise;
    },

    removePersistedKeySync: function(key) {
        var options = this.options;
        var file = path.join(options.dir, md5(key));
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            return {key: key, removed: true, existed: true};
        }
        return {key: key, removed: false, existed: false};
    },
    
    stringify: function (obj) {
        return this.options.stringify(obj);    
    },

    parse: function(str){
        try {
            return this.options.parse(str);
        } catch(e) {
            this.log("parse error: ", this.stringify(e));
            return undefined;
        }
    },

    parseStorageDir: function(callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var deferreds = [];

        var dir = this.options.dir;
        var self = this;
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
                        var currentFile = arr[i];
                        if (currentFile[0] !== '.') {
                            deferreds.push(self.parseFile(currentFile));
                        }
                    }

                    Q.all(deferreds).then(
                        function() {
                            deferred.resolve(result);
                            callback(null, result);
                        },
                        function(err) {
                            deferred.reject(err);
                            callback(err);
                        });
                });
            } else {
                //create the directory
                mkdirp(dir, function (err) {
                    if (err) {
                        console.error(err);
                        deferred.reject(err);
                        callback(err);
                    } else {
                        self.log('created ' + dir);
                        deferred.resolve(result);
                        callback(null, result);
                    }
                });
            }
        });

        return deferred.promise;
    },

    parseStorageDirSync: function() {
        var dir = this.options.dir;
        var exists = fs.existsSync(dir);

        if (exists) { //load data
            var arr = fs.readdirSync(dir);
            for (var i = 0; i < arr.length; i++) {
                var currentFile = arr[i];
                if (arr[i] && currentFile[0] !== '.') {
                    this.parseFileSync(currentFile);
                }
            }
        } else { //create the directory
            mkdirp.sync(dir);
        }
    },

    parseFile: function (filename, callback) {
        callback = isFunction(callback) ? callback : noop;

        var deferred = Q.defer();
        var self = this;
        var options = this.options;
        var dir = this.options.dir;
        var file = path.join(dir, filename);

        fs.readFile(file, options.encoding, function (err, text) {
            if (err) {
                deferred.reject(err);
                return callback(err);
            }
            var input = self.parse(text);
            self.data[input.key] = input;
            self.log("loaded: " + dir + "/" + input.key);
            deferred.resolve(input);
            callback(null, input);
        });

        return deferred.promise;
    },

    parseFileSync: function(filename) {
        var dir = this.options.dir;
        var file = path.join(dir, filename);
        var input = this.parse(fs.readFileSync(file, this.options.encoding));
        this.data[input.key] = input;
        this.log("loaded: " + dir + "/" + input.key);
        return this.data[input.key];
    },

    isExpired: function (key) {
        if (!this.options.ttl) return false;
        return this.data[key] && this.data[key].ttl && this.data[key].ttl < (new Date()).getTime();
    },

    resolveDir: function(dir) {
        dir = path.normalize(dir);
        if (path.isAbsolute(dir)) {
            return dir;
        }
        return path.join(process.cwd(), dir);
    },

    stopInterval: function () {
        clearInterval(this._persistInterval);
    },

    log: function () {
        this.options && this.options.logging && console.log.apply(console, arguments);
    },

    md5: md5
};

module.exports = LocalStorage;
