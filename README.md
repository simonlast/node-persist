# node-persist
## (localStorage on the server)

### Super-easy asynchronous persistent data structures in Node.js, modeled after HTML5 localStorage
Node-persist doesn't use a database. Instead, JSON documents are stored in the file system for persistence. Because there is no network overhead, node-persist is just about as fast as a database can get. Node-persist uses the HTML5 localStorage API, so it's easy to learn.

This is still a work in progress. Send pull requests please.
## Note
If you're looking for the version that supports both `synchronous` and `asynchronous` use `node-persist@2.1.0`

## Install

```sh
$ npm install node-persist
```

## Basic Example

```js
const storage = require('node-persist');

//you must first call storage.init
await storage.init( /* options ... */ );
await storage.setItem('name','yourname')
console.log(await storage.getItem('name')); // yourname
```

## Run the counter example:

```sh
$ cd examples/counter
$ node counter.js
$ open up localhost:8080
```

## 3.1.1 change logs

backward changes

* Added the `writeQueue*` options, trying to resolve [issue#108](https://github.com/simonlast/node-persist/issues/108), see the API Documentation below.


## 3.0.0 change logs

Non-backward changes

* All the `*Sync` functions were removed, __every__ operation is now __asynchronous__
* All the `persist*` functions were removed
* __Nothing__ is held up in __RAM__ use your own memory caching module, i.e. [nano-cache](https://github.com/akhoury/nano-cache)
* [Node 7.6+](https://stackoverflow.com/a/41757243/493756) is required now, we're using `async/await`
* `continuous` and `interval` options were removed, since we immediately persist to disk now, __asynchronously__
* `forEach` callback now accepts an object `callback({key, value})` instead of 2 arguments `callback(key, value)`

## 2.0.0 change logs

Non-backward changes

* filenames on the file system are now md5 hashed now and the structure of the saved data has changed to include the ttl in them.
* no longer need/support a `options.ttlDir`, since the `ttls` are now stored in the same file as each value
* added `expiredInterval` option
* added `forgiveParseErrors` option

## 1.0.0 change logs

Mostly non-backward changes

* `storage.getItem()` now returns a promise
* `storage.valuesWithKeyMatch()` no longer accepts a callback
* `storage.values()` no longer accepts a callback
* `storage.key()` is gone
* The default `dir` is now `process.cwd() + (dir || '.node-persist/storage')`, unless you use an absolute path
* added `storage.get()`, alias to `getItem()`
* added `storage.set()`, alias to `setItem()`
* added `storage.del()`, `storage.rm()`, as aliases to `removeItem()`
* Keys, on the file system are base64 encoded with the replacement of the `/`

## API Documentation

#### `async init(options, [callback])`
if the storage dir is new, it will create it
##### Options
You can pass `init()` an options object to customize the behavior of node-persist

These are the defaults
```js
await storage.init({
	dir: 'relative/path/to/persist',

	stringify: JSON.stringify,

	parse: JSON.parse,

	encoding: 'utf8',

	// can also be custom logging function
	logging: false,  

	// ttl* [NEW], can be true for 24h default or a number in MILLISECONDS or a valid Javascript Date object
	ttl: false,

	// every 2 minutes the process will clean-up the expired cache
	expiredInterval: 2 * 60 * 1000, 

    // in some cases, you (or some other service) might add non-valid storage files to your
    // storage dir, i.e. Google Drive, make this true if you'd like to ignore these files and not throw an error
    forgiveParseErrors: false,
	
	// instead of writing to file immediately, each "file" will have its own mini queue to avoid corrupted files, keep in mind that this would not properly work in multi-process setting.
	writeQueue: true, 
	
	// how often to check for pending writes, don't worry if you feel like 1s is a lot, it actually tries to process every time you setItem as well
	writeQueueIntervalMs: 1000, 
	
	// if you setItem() multiple times to the same key, only the last one would be set, BUT the others would still resolve with the results of the last one, if you turn this to false, each one will execute, but might slow down the writing process.
	writeQueueWriteOnlyLast: true, 
});

```
#### `async getItem(key)`
This function will get the value for that key stored on disk

```js
let value = await storage.getItem('obj');
```

#### `async setItem(key, value, [options])`
This function sets 'key' in your database to 'value'

```js
await storage.setItem('fibonacci',[0,1,1,2,3,5,8]);
await storage.setItem(42,'the answer to life, the universe, and everything.');
await storage.setItem(42,'the answer to life, the universe, and everything.', {ttl: 1000*60 /* 1 min */ });
```
\* The only option available when calling `setItem(key, value, option)` is `{ttl: Number|Date}`

#### `async updateItem(key, value, [options])`
This function updates a 'key' in your database with a new 'value' without touching the `ttl`, however, if the `key` was not found or if it was `expired` a new item will get set

```js
await storage.updateItem(42,'the answer to life, the universe, and everything.', {ttl: 1000*60*10 /* 10 minutes */ });
await storage.updateItem(42,'means nothing, do not trust wikipedia'); // ttl is still the same, will expired in 10 minutes since it was first set
```
\* The only option available when calling `updateItem(key, value, option)` is `{ttl: Number|Date}`

#### `async removeItem(key)`
This function immediately deletes it from the file system asynchronously

```js
await storage.removeItem('me');
```

#### `async clear()`
This function immediately deletes all files from the file system asynchronously.

```js
await storage.clear();
```

#### `async values()`
This function returns all of the values

```js
await storage.setItem("batman", {name: "Bruce Wayne"});
await storage.setItem("superman", {name: "Clark Kent"});
console.log(await storage.values()); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
```
#### `async valuesWithKeyMatch(match)`
This function returns all of the values matching a string or RegExp
```js
await storage.setItem("batman", {name: "Bruce Wayne"});
await storage.setItem("superman", {name: "Clark Kent"});
await storage.setItem("hulk", {name: "Bruce Banner"});
console.log(await storage.valuesWithKeyMatch('man')); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
// also accepts a Regular Expression
console.log(await storage.valuesWithKeyMatch(/man/)); //output: [{name: "Bruce Wayne"},{name: "Clark Kent"}]
```
#### `async keys()`
this function returns an array of all the keys in the database.
```js
console.log(await storage.keys()); // ['batman', 'superman']
```
#### `async length()`
This function returns the number of keys stored in the database.
```js
console.log(await storage.length()); // 2
```
#### `async forEach(callback)`
This function iterates over each key/value pair and executes an asynchronous callback as well

```javascript
storage.forEach(async function(datum) {
	// use datum.key and datum.value
});
```
### Factory method

#### `create(options)` - synchronous, static method

If you choose to create multiple instances of storage, you can. Just avoid using the same `dir` for the storage location.
__You still have to call `init` after `create`__ - you can pass your configs to either `create` or `init`

```javascript
const storage = require('node-persist');
const myStorage = storage.create({dir: 'myDir', ttl: 3000});
await myStorage.init();
```

#### Tests

```
npm install
npm test
```

##### [Simon Last](http://simonlast.org)
