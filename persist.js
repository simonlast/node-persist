
var fs = require('fs');

var options = {};
var defaults = {
	dir:'persist',
	interval:300000,
	stringify: JSON.stringify,
	parse: JSON.parse,
	encoding: 'utf8',
	logging: false,
	isInterval: true
};

var data = {};
var changes = {};

exports.init = function(userOptions){
	
	setOptions(userOptions);

	if(options.logging){
		console.log("options:");
		console.log(options);
	}

	//check to see if dir is present
	fs.exists(options.dir,function(exists){
			if(exists){ //load data
				fs.readdir(options.dir, function(err,arr){
						for(var i in arr){
							var curr = arr[i];
							if(curr[0] !== '.'){
								parseFile(curr);
							}
						}
				});
			}else{ //create the directory
				fs.mkdir(options.dir);
			}
	});

	//start persisting
	if(options.isInterval)
		setInterval(exports.persist,options.interval);
}

exports.initSync = function(userOptions){
	
	setOptions(userOptions);

	if(options.logging){
		console.log("options:");
		console.log(options);
	}

	//check to see if dir is present
	var exists = fs.existsSync(options.dir);
	if(exists){ //load data
		var arr = fs.readdirSync(options.dir);
		for(var i in arr){
			var curr = arr[i];
			if(curr[0] !== '.'){
				var json = fs.readFileSync(options.dir + "/" + curr,
					options.encoding);
				var value = options.parse(json);
				data[curr] = value;
			}
		}
	}else{ //create the directory
		fs.mkdirSync(options.dir);
	}

	//start persisting
	if(options.isInterval)
		setInterval(exports.persistSync,options.interval);
}

exports.persist = function(){
	for(var key in data){
		if(changes[key]){
			exports.persistKey(key);
		}
	}
}

exports.persistSync = function(){
	for(var key in data){
		if(changes[key]){
			exports.persistKeySync(key);
		}
	}
}

exports.persistKey = function(key){
	var json = options.stringify(data[key]);
	fs.writeFile(options.dir + "/" + key, json, options.encoding);
	changes[key] = false;
	if(options.logging)
		console.log("wrote: " + key)
}

exports.persistKeySync = function(key){
	var json = options.stringify(data[key]);
	fs.writeFile(options.dir + "/" + key, json,
		options.encoding, function (err) {
  			if (err) throw err;
		}
	);
	changes[key] = false;
}

exports.get = function(key){
	return data[key];
}

exports.set = function(key,value){
	data[key] = value;
	changes[key] = true;
	if(options.logging)
		console.log("set (" + key +":" + value + ")");
}

var setOptions = function(userOptions){
	if(!userOptions){
		options = defaults;
	}else{
		for(var key in defaults){
			if(userOptions[key]){
				options[key] = userOptions[key];
			}else{
				options[key] = defaults[key];
			}
		}
	}
}

var parseFile = function(key){
	fs.readFile(options.dir + "/" + key, options.encoding, function(err,json){
		if (err) throw err;
		var value = options.parse(json);
		data[key] = value;
		if(options.logging){
			console.log("loaded: " + key);
		}
	});
}

