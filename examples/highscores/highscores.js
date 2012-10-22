/*
 * This example uses node-persist to store high scores for a game
 * Open up your browser to 'localhost:8080' to see it in action.
 */

 var storage = require('../../persist');
 var express = require('express');
 var fs = require('fs');

//persist every 4 seconds
storage.initSync({
	interval: 4000
});

if(!storage.getItem('scores')){
	storage.setItem('scores',[]);
}
console.log("scores: " + storage.getItem('scores'));

var app = express();

app.configure( function(){
  app.use(express.static(__dirname + '/public'));
  app.use(express.errorHandler());
  app.use(express.bodyParser());
});

// submit a score
app.post("/submit" ,function(req,res){
	var user = req.body.user;
	var score = parseInt(req.body.score,10);

	if(user && score){
		var scores = storage.getItem('scores');
		scores.push({'user':user,'score':score});
		scores.sort(function(a,b){
			return b.score - a.score;
		});
		console.log(scores);
		storage.setItem('scores',scores);
		res.send("OK");
	}else{
		res.send("BAD");
	}

});

// show scores
app.get("/scores" ,function(req,res){
	var str = "Scores: <br />";
	var scores = storage.getItem('scores');
	for(var i=0; i<scores.length; i++){
		var curr = scores[i];
		str += curr.user + ": " + curr.score + "<br />";
	}
	res.send(str);


});

app.listen(8080);
