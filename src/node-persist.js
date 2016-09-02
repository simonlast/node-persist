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
     * This function, (or init) must be called before the library can be used.
     * An options hash can be optionally passed.
     */
    nodePersist.init = function (userOptions, callback) {
        localStorage = nodePersist.defaultInstance = nodePersist.create(userOptions);
        var ret = localStorage.init(callback);
        mixin(nodePersist, localStorage, {skip: ['init', 'initSync', 'create']});
        return ret;
    };
    /*
     * This function, (or initSync) must be called before the library can be used.
     * An options hash can be optionally passed.
     */
    nodePersist.initSync = function (userOptions) {
        localStorage = nodePersist.defaultInstance = nodePersist.create(userOptions);
        var ret = localStorage.initSync();
        mixin(nodePersist, localStorage, {skip: ['init', 'initSync', 'create']});
        return ret;
    };

    // expose all the API methods on the main module using a default instance
    function mixin (target, source, options) {
        options = options || {};
        options.skip = options.skip || [];
        var key;
        for (key in source) {
            if (typeof source[key] === 'function' && key.indexOf('_') !== 0 && options.skip.indexOf(key) == -1) {
                target[key] = source[key].bind(source);
            }
        }
    }

}(module.exports));
