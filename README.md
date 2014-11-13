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

### `init(options, [callback])` - asynchronous*, returns Promise
This function reads what's on disk and loads it into memory, if the storage dir is new, it will create it
#### Options
You can pass `init()` or `initSync()` an options object to customize the behavior of node-persist

```js
storage.init({
	dir:'relative/path/to/persist',
	stringify: JSON.stringify,
	parse: JSON.parse,
	encoding: 'utf8',
	logging: false,  // can also be custom logging function
	continuous: true,
	interval: false,
	ttl: false, // [NEW] can be true for 1 week default or a number in milliseconds
}, /* optional callback */ ).then(onSuccess, onError); // or use the promise
```
##### Node-persist has 3 ways of running:

1. By default, keys will be persisted after every call of setItem
2. If you set an interval, node-persist will persist changed keys at that interval instead of after every call of setItem.
3. If you set continuous to false and don't specify an interval, keys aren't persisted automatically, giving you complete control over when to persist them.

### `initSync(options)` - synchronous, throws Error on failure 
like `init()` but synchronous,


### `getItem(key)` - synchronous, returns "value"
This function will get a key from your database in memory, and return its value, or undefined if it is not present.

```js
storage.getItem('name');
storage.getItem('obj').key1;
storage.getItem('arr')[42];
```

### `setItem(key, value, [callback])` - asynchronous*, returns Promise
This function sets 'key' in your database to 'value'. It also sets a flag, notifying that 'key' has been changed and needs to be persisted in the next sweep. Because the flag must be set for the object to be persisted, it is best to use node-persist in a functional way, as shown below.

```js
storage.setItem('fibonacci',[0,1,1,2,3,5,8]);
storage.setItem(42,'the answer to life, the universe, and everything.', function(err) {
    // done
});

var batman = storage.getItem('batman');
batman.sidekick = 'Robin';
storage.setItem('batman', batman).then(
  function() {
    // success
  }, 
  function() {
     // error
  })
```
\* `setItem()` is asynchronous, however, depending on your global options, the item might not persist to disk immediately, so, if you set `options.interval=true` or `options.continuous=false`, your (optional) callback or your returned promise from this function will get called/resolved immediately, even if the value has not been persisted to disk yet, either waiting for the interval to kick in or for your manual call to `persist()`

### `setItemSync(key, value)` - synchronous, throws Error on failure
If you want to immediately persist to disk, __regardless of the `options.interval` and `options.continuous`__ setting, use this function

### `removeItem(key, [callback])` - asynchronous, returns Promise 
This function removes key in the database if it is present, and immediately deletes it from the file system asynchronously.

```js
storage.removeItem('me', /* optional callback */ function(err) {
  // done 
}).then(onSuccess, onError); // or use the promise
```
### `removeItemSync(key, [callback])` - synchronous,  throws Error on failure
```js
storage.removeItemSync('me');
```
### `clear([callback])` - asynchronous, returns Promise 
This function removes all keys in the database, and immediately deletes all keys from the file system asynchronously.
### `clearSync()` - synchronous, throws Error on failure
like `clear()` by synchronous

### `values()` -  synchronous, returns array 
This function returns all of the values in the database in memory

```js
storage.setItem("batman", {name: "Bruce Wayne"});
storage.setItem("superman", {name: "Clark Kent"});
console.log(storage.values()); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
```
### `values(callback)` -  [DEPRECATED] synchronous, but still returns array 
This function is synchronous, it does not need to accept a callback, so it's getting deprecated
```js
// notice this callback does not accept an error as a 1st argument, to support backward compatibility
// but will be removed on next minor release
storage.values(function(values) {
}));
```

### `key(n)` - synchronous, returns string 

This function returns a key with index n in the database, or null if it is not present. The ordering of keys is not known to the user.

### `length()` - synchronous, returns number 
This function returns the number of keys stored in the database.

## Fine-grained control
Make sure you set `continuous:false` in the `options` hash, and you don't set an `interval`

### `persist([callback])` - asynchronous, returns Promise 
These function can be used to manually persist the database
```js
storage.persist( /* optional callback */ function(err) {
    // when done
}).then(onSuccess, onError); // or you can use the promise
```
### `persistSync()` - synchronous, throws Error on failure
like `persist()` but synchronous
```js
storage.persistSync();
```

### `persistKey(key, [callback])` - asynchronous, returns Promise 
This function manually persist a 'key' within the database
```js
storage.setItem('name','myname');
storage.persistKey('name', /* optional callback */ function(err) {
    // when done
}).then(onSuccess, onError); // or you can use the promise
```

### `persistKeySync(key)`
like `persistKey()` but synchronous
```js
storage.setItem('name','myname');
storage.persistKeySync('name');
```

### [Simon Last](http://simonlast.org)
