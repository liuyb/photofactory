var mysql = require('mysql');
var express = require('express');
var log4js = require('log4js');
var moment = require('moment');

var app = express();
var port = '8888';

var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'root@asdf',
  database : 'photos'
});
connection.connect();

log4js.configure({
  "appenders": [
    { "type": "dateFile", "filename": "/data/storage/log/log", "pattern": "-yyyy-MM-dd", "alwaysIncludePattern": true, "category": "log"}
  ]
});

var logger = log4js.getLogger('log');
logger.setLevel('Debug');

require('./express.js')(app);

app.get('/show', function (req, res, next) {
  res.render('index.html', {
    title: 'test文件上传'
  });
});

app.get('/result', function (req, res, next) {
  // SELECT * FROM `pics` WHERE 1 ORDER BY `datetimeoriginal` DESC LIMIT 0, 3
  var page = req.query.page || 1;
  var size = 10;
  var start = (page - 1) * size;
  connection.query('SELECT * FROM `pics` WHERE 1 ORDER BY datetimeoriginal DESC LIMIT '+start+', '+size, function (error, results, fields) {
    for(var i = 0; i<results.length; i++) {
      results[i].original = '/original/'+results[i].original;
      results[i].thumbs = JSON.parse(results[i].thumbs);
      if(results[i].thumbs.length) {
        for(var j = 0; j<results[i].thumbs.length; j++) {
          results[i].thumbs[j] = '/thumb/' + results[i].thumbs[j];
        }
      }
      results[i].showdatetime = moment(results[i].datetimeoriginal).format('YYYY-MM-DD HH:mm:ss');
    }
    res.send(results);
    res.end();
  });
});

app.listen(port);
logger.debug('Express app started on port ' + port);

var monitor = require('./monitor.js');
monitor.start(logger, connection);

module.exports = app;
