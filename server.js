var fs = require('fs');
var fse = require('fs-extra');
var join = require('path').join;
var md5 = require('md5');
var mysql = require('mysql');
var async = require('async');
var moment = require('moment');
var images = require("images");
var express = require('express');
var ExifImage = require('exif').ExifImage;

var app = express();
var port = '8888';

//< configure
var income_dir = '/develop/source/income';
var storage_dir = '/develop/source/storage/original';
var thumb_dir = '/develop/source/storage/thumb';
var thumbnails = [[720, 720], [350, 350], [100, 100]];
var blacklist = ['.DS_Store'];

var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'root@asdf',
  database : 'liuyb.photo'
});
connection.connect();

app.listen(port);
console.log('Express app started on port ' + port);

readdir();

function in_array(stringToSearch, arrayToSearch) {
  for (var s = 0; s < arrayToSearch.length; s++) {
    if (arrayToSearch[s] === stringToSearch) {
      return true;
    }
  }
  return false;
}

//< 读取目录
function readdir() {
  console.log('读取目录'+income_dir);
  fs.readdir(income_dir, function (err, files) {
    console.log(files);
    async.eachSeries(files, function(filename, cb){
      if(!in_array(filename, blacklist)) {
        var filefull = join(income_dir, filename);
        console.log('发现文件：'+filefull);
        checkoutFileExist({filename: filename, or_file_path: filefull, ext: filename.substr(filename.lastIndexOf('.') + 1, filename.length -1), cb: cb});
      }
      else {
        console.log('文件：'+filename+'不处理');
        cb();
      }
    }, function(error){
      if(error) {
          console.log(error);
      }
      console.log('处理完成');
      setTimeout(function(){readdir()}, 10000);
    });
  });
}

//< 判断文件是否已经存在
function checkoutFileExist(info) {
  fs.readFile(info.or_file_path, function(err, buf) {
    var _md5 = md5(buf);
    if(_md5) {
      connection.query('SELECT COUNT(*) as count FROM `pics` WHERE `md5` = "'+_md5+'"', function (error, results, fields) {
        if(results[0].count === 0) {
          console.log('这是新文件：'+info.filename);
          info.md5 = _md5;
          readExif(info);
        } else {
          console.log('这是旧文件：'+info.filename);
          fs.unlink(info.or_file_path);
          info.cb();
        }
      });
    }
    else {
      info.cb();
    }
  });
}

//< 读取文件的exif
function readExif(info) {
  new ExifImage({ image : info.or_file_path}, function (error, exifData) {
    if (error) {
      console.log('读取文件：'+info.filename+'exif 失败');
      console.log('Error: '+error.message);
      info.cb();
    } else {
      var createdate = exifData.exif.CreateDate;
      var year = createdate.substr(0, 4);
      var month = createdate.substr(5, 2);
      var day = createdate.substr(8, 2);

      if(year && month && day) {
        info.rel_path = year + '/' + year + '.' + month + '.' + day;
        console.log('读取文件：'+info.filename+'exif 成功');
        info.exifData = exifData;
        checkDirExist(info);
      }
    }
  });
}

//< 创建文件仓库的目录
function checkDirExist(info) {
  var path = storage_dir + '/' + info.rel_path;
  var thumb_path = join(thumb_dir, info.rel_path);
  fse.mkdirs(path, function(err){
    if (error) {
      console.log('创建路径：'+path+' 失败');
      console.log('Error: '+err.message);
      info.cb();
    } else {
      console.log('创建路径：'+path+' 成功');
      fse.mkdirs(thumb_path, function(err){
        if (error) {
          console.log('创建路径：'+thumb_path+' 失败');
          console.log('Error: '+err.message);
          info.cb();
        } else {
          console.log('创建路径：'+thumb_path+' 成功');
          info.dst = join(path, info.filename);
          moveto(info);
        }
      });
    }
  });
}

//< 移动文件到仓库
function moveto(info) {
  fse.copy(info.or_file_path, info.dst, function (err) {
    if (error) {
      console.log('移动文件：'+info.filename+'失败');
      info.cb();
    } else {
      console.log('移动文件：'+info.filename+'成功');
      genThumbs(info);
    }
  });
}

//< 生成缩略图
function genThumbs(info) {
  var thumbs = [];
  async.eachSeries(thumbnails, function(item, callback){
    var thumb_path = join(thumb_dir, info.rel_path);
    var thumb_file_name = info.filename + '.'+item[0]+'x'+item[1]+'.'+info.ext;
    var _fileThumb = join(thumb_path, thumb_file_name);
    images(info.dst).size(item[0]).saveAsync(_fileThumb, null, { quality : 100 }, function(){
      console.log('生成缩略图：'+thumb_file_name+'成功');
      thumbs.push(join(info.rel_path, thumb_file_name));
      callback();
    });
  }, function(error){
    if(error) {
      info.cb();
    }
    var insert_arr = {
      md5: info.md5,
      original: join(info.rel_path, info.filename),
      thumbs: JSON.stringify(thumbs),
      make: info.exifData.image.Make,
      model: info.exifData.image.Model,
      datetimeoriginal: info.exifData.exif.CreateDate,
      software: info.exifData.image.Software,
      created: moment().format('YYYY:MM:DD HH:mm:ss'),
      status:0
    };
    connection.query('INSERT INTO pics SET ?', insert_arr, function(err, result) {
      if (err) throw err;
      if(result.insertId) {
        console.log('数据保存到mysql成功，删除原文件:'+info.filename);
        fs.unlink(info.or_file_path);
      }
      else {
        console.log('数据保存失败');
      }
      info.cb();
    });
  });
}

module.exports = app;
