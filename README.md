#node-persist
##(localStorage on the server)

###Super-easy (and fast) persistent data structures in Node.js, modeled after HTML5 localStorage
Node-persist doesn't use a database. Instead, JSON documents are stored in the file system periodically for persistence. Because there is no network overhead and your data is just in-memory, node-persist is just about as fast as a database can get. Node-persist uses the HTML5 localStorage API, so it's easy to learn.

This is still a work in progress. Send pull requests please.

##Install
First, put 'persist.js' in your directory. Then,

	var storage = require('./persist');

##Basic
	//you must first call storage.init or storage.initSync
	storage.init();
	
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
	
##Options
You can pass init or initSync a hash options to customize the behavior of node-persist
	
	storage.init({
			dir:'myDir', // The Directory to save documents
			interval:6000, // Saving interval, in milliseconds
			stringify: myStringifyFunction,
			parse: myParsingFunction,
			encoding: 'utf8',
			logging: false, //print storage logs,
			isInterval: true // turn off for fine-grained control
	});
	
##Documentation
###getItem(key)
This function will get a key from your database, and return its value, or undefined if it is not present.
	
	storage.getItem('name');
	storage.getItem('obj').key1;
	storage.getItem('arr')[42];


###setItem(key, value)
This function sets 'key' in your database to 'value'. It also sets a flag, notifying that 'key' has been changed and needs to be persisted in the next sweep. Because the flag must be set for the object to be persisted, it is best to use node-persist in a functional way, as shown below.

	storage.setItem('fibonacci',[0,1,1,2,3,5,8]);
	storage.setItem(42,'the answer to life, the universe, and everything.')
	
	var batman = storage.getItem('batman');
	batman.sidekick = 'Robin';
	storage.setItem('batman',batman); //this ensures the object is persisted
	
###removeItem(key)
This function removes key in the database if it is present, and immediately deletes it from the file system asynchronously.

	storage.removeItem('me');
	storage.removeItem(42);

###clear()
This function removes all keys in the database, and immediately deletes all keys from the file system asynchronously.

###key(n)
This function returns a key with index n in the database, or null if it is not present. The ordering of keys is not known to the user.

###length()
This function returns the number of keys stored in the database.	
	
##Fine-grained control
Make sure you set isInterval: false in the options hash.
###persist(), persistSync()
These functions can be used to manually persist the database

		storage.persist();
		storage.persistSync();


###persistKey(key), persistKeySync(key)
These functions manually persist 'key' within the database

		storage.setItem('name','myname');
		storage.persistKey('name'); 
