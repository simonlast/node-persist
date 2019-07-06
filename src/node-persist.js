/*
 * Simon Last, Sept 2013
 * http://simonlast.org
 */

const LocalStorage = require('./local-storage');

(function(nodePersist) {
    /*
     * This function just creates a localStorage instance, incase you don't plan on using the default one
     * i.e.
     * var myStorage = nodePersist.create();
     * myStorage.init(myOptions);  // you still have to call init
     */
    nodePersist.create = function (userOptions) {
        return LocalStorage(userOptions);
    };

    /*
     * This function, (or init) must be called before the library can be used.
     * An options hash can be optionally passed.
     */
    nodePersist.init = async function (userOptions) {
        const localStorage = nodePersist.defaultInstance = nodePersist.create(userOptions);
        let ret = await localStorage.init(userOptions);
        mixin(nodePersist, localStorage, {skip: ['init', 'create']});
        return ret;
    };

    // expose all the API methods on the main module using a default instance
    function mixin (target, source, options) {
        options = options || {};
        options.skip = options.skip || [];
        for (let key in source) {
            if (typeof source[key] === 'function' && key.indexOf('_') !== 0 && options.skip.indexOf(key) === -1) {
                target[key] = source[key].bind(source);
            }
        }
    }

}(module.exports));
