/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

var LocalStorage = require('./local-storage');

(function(nodePersist) {
    var localStorage;

    /*
     * This function just creates a localStorage instance, incase you don't plan on using the default one
     * i.e.
     * var myStorage = nodePersist.create();
     * myStorage.init(myOptions);  // you still have to call init or initSync();
     */
    nodePersist.create = function (userOptions) {
        return LocalStorage(userOptions);
    };

    /*
     * All functions below are just helpers to use the default storage instance
     * and to maintain backward compatibility
     */


    /*
     * This function, (or init) must be called before the library can be used.
     * An options hash can be optionally passed.
     */
    nodePersist.init = function (userOptions, callback) {
        localStorage = nodePersist.create(userOptions);
        return localStorage.init(callback);
    };
    /*
     * This function, (or initSync) must be called before the library can be used.
     * An options hash can be optionally passed.
     */
    nodePersist.initSync = function (userOptions) {
        localStorage = nodePersist.create(userOptions);
        return localStorage.initSync();
    };

    /*
     * This function returns a key with index n in the database, or null if
     *  it is not present.
     * This function runs in 0(k), where k is the number of keys in the
     *  database. You probably shouldn't use it.
     */
    nodePersist.key = function (n) {
        return localStorage.key(n);
    };

    /*
     * This function returns an array of all the keys in the database
     *
     */
    nodePersist.keys = function () {
        return localStorage.keys();
    };

    /*
     * This function returns the number of keys stored in the database.
     */
    nodePersist.length = function () {
        return localStorage.length();
    };

    /*
     * This function iterates over each key/value pair and executes a callback
     */
    nodePersist.forEach = function(callback) {
        return localStorage.forEach(callback);
    };

    /*
     * This function returns all the values in the database.
     */
    nodePersist.values = function(callback) {
        return localStorage.values(callback);
    };


    nodePersist.valuesWithKeyMatch = function(match, callback) {
        return localStorage.valuesWithKeyMatch(match, callback);
    };

    /*
     * This function sets a key to a given value in the database.
     */
    nodePersist.setItem = function (key, value, callback) {
        return localStorage.setItem(key, value, callback);
    };

    /*
     * This function sets a key to a given value in the database.
     */
    nodePersist.setItemSync = function (key, value) {
        return localStorage.setItemSync(key, value);
    };

    /*
     * This function returns the value associated with a key in the database,
     *  or undefined if it is not present.
     */
    nodePersist.getItem = function (key, callback) {
        return localStorage.getItem(key, callback);
    };

    nodePersist.getItemSync = function (key) {
        return localStorage.getItemSync(key);
    };

    /*
     * This function removes key in the database if it is present, and
     *  immediately deletes it from the file system asynchronously.
     */
    nodePersist.removeItem = function (key, callback) {
        return localStorage.removeItem(key, callback);
    };

    /*
     * This function removes key in the database if it is present, and
     *  immediately deletes it from the file system synchronously.
     */
    nodePersist.removeItemSync = function (key) {
        return localStorage.removeItemSync(key);
    };

    /*
     * This function removes all keys in the database, and immediately
     *  deletes all keys from the file system asynchronously.
     */
    nodePersist.clear = function (callback) {
        return localStorage.clear(callback);
    };

    /*
     * This function removes all keys in the database, and immediately
     *  deletes all keys from the file system synchronously.
     */
    nodePersist.clearSync = function () {
        return localStorage.clearSync();
    };

    /*
     * This function triggers the database to persist asynchronously.
     */
    nodePersist.persist = function (callback) {
        return localStorage.persist(callback);
    };

    /*
     * This function triggers the database to persist synchronously.
     */
    nodePersist.persistSync = function () {
        return localStorage.persistSync();
    };

    /*
     * This function triggers a key within the database to persist asynchronously.
     */
    nodePersist.persistKey = function (key, callback) {
        return localStorage.persistKey(key, callback);
    };

    /*
     * This function triggers a key within the database to persist synchronously.
     */
    nodePersist.persistKeySync = function (key) {
        return localStorage.persistKeySync(key);
    };

}(module.exports));
