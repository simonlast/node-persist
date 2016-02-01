# node-persist
## (localStorage on the server)

### Super-easy (and fast) persistent data structures in Node.js, modeled after HTML5 localStorage
Node-persist doesn't use a database. Instead, JSON documents are stored in the file system for persistence. Because there is no network overhead and your data is just in-memory, node-persist is just about as fast as a database can get. Node-persist uses the HTML5 localStorage API, so it's easy to learn.

This is still a work in progress. Send pull requests please.

## Install

```sh
$ npm install node-persist
```

Then in code you can do: 

```js
var storage = require('node-persist');
```

## Basic Example

```js
//you must first call storage.init or storage.initSync
storage.initSync();

//then start using it
storage.setItem('name','yourname');
console.log(storage.getItem('name'));

var batman = {
	first: 'Bruce',
	last: 'Wayne',
	alias: 'Batman'
};

storage.setItem('batman',batman);
console.log(storage.getItem('batman').alias);
```

## Run the examples:

```sh
$ cd examples/examplename
$ node examplename.js
$ open up localhost:8080
```

## API Documentation

#### `init(options, [callback])` - asynchronous*, returns Promise
This function reads what's on disk and loads it into memory, if the storage dir is new, it will create it
##### Options
You can pass `init()` or `initSync()` an options object to customize the behavior of node-persist

These are the defaults
```js
storage.init({
	dir:'relative/path/to/persist',
	stringify: JSON.stringify,
	parse: JSON.parse,
	encoding: 'utf8',
	logging: false,  // can also be custom logging function
	continuous: true,
	interval: false,
	ttl: false, // ttl* [NEW], can be true for 24h default or a number in MILLISECONDS
}, /* optional callback */ ).then(onSuccess, onError); // or use the promise
```
\* With ttl (time to live), it is recommended that you use `getItem(key, callback)` or `getItemSync(key)` since, if a `ttl` of a certain key is expired the key-file is immediately deleted from disk, the callback will execute whenever that happends, if there is no ttl used or it has expired yet, the callback will also immediately execute in a synchronous fashion.  

##### Node-persist has 3 ways of running:

1. By default, keys will be persisted after every call of setItem
2. If you set an interval, node-persist will persist changed keys at that interval instead of after every call of setItem.
3. If you set continuous to false and don't specify an interval, keys aren't persisted automatically, giving you complete control over when to persist them.

#### `initSync(options)` - synchronous, throws Error on failure 
like `init()` but synchronous,


#### `getItem(key, [callback])` - returns value synchronous* but may linger async call if unless ttl expired,
This function will get a key from your database in memory, and return its value, or undefined if it is not present.

\* you can always use it in a asynchronous mode, meaning passing a callback (because we cannot return a Promise for this one) - the callback will be executed immediately and synchronously if there is no ttl used. If you are using ttl but you are also using `options.interval` or `options.continous=false` the deletion of the expired keys will wait for either the interval to kick in or if you manually `persist`

```js
storage.getItem('name', function (err, value) {
// use value here after makign sure expired-ttl key deletion has occured, in that case value === undefined
}); // value is also returned 
storage.getItem('obj').key1;
storage.getItem('arr')[42];
```
#### `getItemSync(key)` - returns value
The only synchronous part is the deletion of an expired-ttl key, if `options.ttl` is used, otherwise it behaves just like `getItem`

#### `setItem(key, value, [callback])` - asynchronous*, returns Promise
This function sets 'key' in your database to 'value'. It also sets a flag, notifying that 'key' has been changed and needs to be persisted in the next sweep. Because the flag must be set for the object to be persisted, it is best to use node-persist in a functional way, as shown below.

```js
storage.setItem('fibonacci',[0,1,1,2,3,5,8]);
storage.setItem(42,'the answer to life, the universe, and everything.', function(err) {
    // done
});

var batman = storage.getItem('batman');
batman.sidekick = 'Robin';

// using the promise
storage.setItem('batman', batman).then(
  function() {
    // success
  }, 
  function() {
     // error
  })
```
\* `setItem()` is asynchronous, however, depending on your global options, the item might not persist to disk immediately, so, if you set `options.interval` or `options.continuous=false`, your (optional) callback or your returned promise from this function will get called/resolved immediately, even if the value has not been persisted to disk yet, which could be either waiting for the interval to kick in or for your manual call to `persist()`

#### `setItemSync(key, value)` - synchronous, throws Error on failure
If you want to immediately persist to disk, __regardless of the `options.interval` and `options.continuous`__ settings, use this function. 

#### `removeItem(key, [callback])` - asynchronous, returns Promise 
This function removes key in the database if it is present, and immediately deletes it from the file system asynchronously. If ttl is used, the corrresponding ttl-key is removed as well

```js
storage.removeItem('me', /* optional callback */ function(err) {
  // done 
}).then(onSuccess, onError); // or use the promise
```
#### `removeItemSync(key)` - synchronous,  throws Error on failure
just like removeItem, but synchronous
```js
storage.removeItemSync('me');
```
#### `clear([callback])` - asynchronous, returns Promise 
This function removes all keys in the database, and immediately deletes all keys from the file system asynchronously.
#### `clearSync()` - synchronous, throws Error on failure
like `clear()` but synchronous

#### `values()` -  synchronous, returns array 
This function returns all of the values in the database in memory. 

```js
storage.setItem("batman", {name: "Bruce Wayne"});
storage.setItem("superman", {name: "Clark Kent"});
console.log(storage.values()); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
```
#### `values([callback])` -  [DEPRECATED] synchronous, but still returns array
This function is synchronous, it does not need to accept a callback, so that signature is getting deprecated.

```js
// notice this callback does not accept an error as a 1st argument, to support backward compatibility
// but will be removed on next minor release
storage.values(function(values) {
}));
```

#### `valuesWithKeyMatch(match)` -  synchronous, returns array 
This function returns all of the values in the database matching a string or RegExp

```js
storage.setItem("batman", {name: "Bruce Wayne"});
storage.setItem("superman", {name: "Clark Kent"});
storage.setItem("hulk", {name: "Bruce Banner"});
console.log(storage.valuesWithKeyMatch('man')); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
// also accepts a Regular Expression
console.log(storage.valuesWithKeyMatch(/man/)); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
```
#### `valuesWithKeyMatch(match, [callback])` -  [DEPRECATED] synchronous, but still returns array 
This function is synchronous, it does not need to accept a callback, so that signature getting deprecated
```js
// notice this callback does not accept an error as a 1st argument, to support backward compatibility
// but will be removed on next minor release
storage.valuesWithKeyMatch('man', function(values) {
}));
```

#### `key(n)` - [DEPRECATED] synchronous, returns string

This function returns a key with index n in the database, or null if it is not present. The ordering of keys is not known to the user. It is getting deprecated because `Object.keys()` does not guarantee the order of the keys, so this functionality is fragile.

#### `keys()` - synchronous, returns array

this function returns an array of all the keys in the database. This function returns the number of keys stored in the database.

#### `length()` - synchronous, returns number

This function returns the number of keys stored in the database.

#### `forEach(callback)` - synchronous, assuming callback is as well.

This function iterates over each key/value pair and executes a callback. 

```javascript
storage.forEach(function(key, value) {
	// use key and value
});
```

### Fine-grained control
Make sure you set `continuous:false` in the `options` hash, and you don't set an `interval`

#### `persist([callback])` - asynchronous, returns Promise 
These function can be used to manually persist the database
```js
storage.persist( /* optional callback */ function(err) {
    // when done
}).then(onSuccess, onError); // or you can use the promise
```
#### `persistSync()` - synchronous, throws Error on failure
like `persist()` but synchronous
```js
storage.persistSync();
```
##### note:
Both `persist()`, `persistSync()`, `persistKey()`, and `persistKeySync()` will automatically persist the ttl keys/values in the persistance process

#### `persistKey(key, [callback])` - asynchronous, returns Promise 
This function manually persist a 'key' within the database
```js
storage.setItem('name','myname');
storage.persistKey('name', /* optional callback */ function(err) {
    // when done
}).then(onSuccess, onError); // or you can use the promise
```

#### `persistKeySync(key)`
like `persistKey()` but synchronous
```js
storage.setItem('name','myname');
storage.persistKeySync('name');
```

### Factory method

#### `create(options)` - synchronous, static method 

If you choose to create multiple instances of storage, you can. Just avoid using the same `dir` for the storage location.
__You still have to call `init` or `initSync` after `create`__ - you can pass your configs to either `create` or `init/Sync`

The reason we don't call `init` in the constructor (or when you `create`) because we can only do so for the `initSync` version, the async `init` returns a promise, and in order to maintain that API, we cannot return the promise in the constructor, so `init` must be called on the instance of new LocalStorage();

```javascript
var storage = require('node-persist');
var myStorage = storage.create({dir: 'myDir', ttl: 3000});
myStorage.init().then(function() { // or you can use initSync()
   // ...
});
```

### Contributing

#### Tests

```
npm install
npm test
```

##### [Simon Last](http://simonlast.org)
