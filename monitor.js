var fs = require('fs');
var join = require('path').join;
var fse = require('fs-extra');
var moment = require('moment');
var md5 = require('md5');
var moment = require('moment');
var ExifImage = require('exif').ExifImage;
var gm = require("gm");
var async = require('async');
var logger, connection;

//< configure
var income_dir = '/data/upload/income';
var storage_dir = '/data/storage/original';
var thumb_dir = '/data/storage/thumb';
var thumbnails = [[720, 720], [350, 350], [100, 100]];
var blacklist = ['.DS_Store', 'Thumbs.db'];
var whiteext = ['jpg', 'jpeg'];

function in_array(stringToSearch, arrayToSearch) {
  for (var s = 0; s < arrayToSearch.length; s++) {
    if (arrayToSearch[s] === stringToSearch) {
      return true;
    }
  }
  return false;
}

function generateMixed(n) {
  var chars = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  var res = "";
  for(var i = 0; i < n ; i ++) {
    var id = Math.ceil(Math.random()*35);
    res += chars[id];
  }
  return res;
}
function _async(arr, callback1, callback2) {
  if (Object.prototype.toString.call(arr) !== '[object Array]') {
    return callback2(new Error('第一个参数必须为数组'));
    }
    if (arr.length === 0)
      return callback2(null);
    (function walk(i) {
      if (i >= arr.length) {
        return callback2(null);
        }
        callback1(arr[i], function () {
         walk(++i);
          });
        })(0);
}
function read(dir, callback) {
  var filesArr = [];
  dir = ///$/.test(dir) ? dir : dir + '/';
  (function dir(dirpath, fn) {
    var files = fs.readdirSync(dirpath);
    _async(files, function (item, next) {
      var info = fs.statSync(join(dirpath , item));
      if (info.isDirectory()) {
        dir(join(dirpath, item) + '/', function () {
          next();
        });
      } else {
        filesArr.push([dirpath, item]);
        callback && callback(item, join(dirpath, item));
        next();
      }
    }, function (err) {
      !err && fn && fn();
    });
  })(dir);
  return filesArr;
}


//< 读取目录
function dojob(dir) {
  logger.debug('读取目录'+dir);
  var files = read(dir, function(filename, filefull){});

  async.eachSeries(files, function(file, cb){
    var dir = file[0], filename = file[1], ext = filename.substr(filename.lastIndexOf('.') + 1, filename.length -1).toLowerCase();
    var filefull = join(dir, filename);
    if(!in_array(filename, blacklist)) {
      if(in_array(ext, whiteext)) {
        logger.debug('发现文件：'+filefull);
        checkoutFileExist({filename: filename, or_file_path: filefull, ext: ext, cb: cb});
      }
      else {
        logger.debug('文件：'+filename+'不处理');
        cb();
      }
    }
    else {
      logger.debug('文件：'+filename+'不处理,删除');
      fs.unlink(filefull);
      cb();
    }
  }, function(error){
    if(error) {
        logger.debug(error);
    }
    logger.debug('处理完成');
    setTimeout(function(){dojob(dir)}, 1000);
  });
}

//< 判断文件是否已经存在
function checkoutFileExist(info) {
  fs.readFile(info.or_file_path, function(err, buf) {
    var _md5 = md5(buf);
    if(_md5) {
      connection.query('SELECT COUNT(*) as count FROM `pics` WHERE `md5` = "'+_md5+'"', function (error, results, fields) {
        if(results[0].count === 0) {
          logger.debug('这是新文件：'+info.filename);
          info.md5 = _md5;
          readExif(info);
        } else {
          logger.debug('这是旧文件：'+info.filename);
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
      logger.debug('读取文件：'+info.filename+'exif 失败');
      logger.debug('Error: '+error.message);
      info.cb();
    } else {
      var createdate = exifData && exifData.exif && exifData.exif.CreateDate ? exifData.exif.CreateDate : '';
      var year = createdate.substr(0, 4);
      var month = createdate.substr(5, 2);
      var day = createdate.substr(8, 2);

      if(year && month && day) {
        info.rel_path = year + '/' + year + '.' + month + '.' + day;
        logger.debug('读取文件：'+info.filename+'exif 成功');
        info.exifData = exifData;
        checkDirExist(info);
      }
      else {
        info.cb();
      }
    }
  });
}

//< 创建文件仓库的目录
function checkDirExist(info) {
  var path = storage_dir + '/' + info.rel_path;
  var thumb_path = join(thumb_dir, info.rel_path);
  fse.mkdirs(path, function(err){
    if (err) {
      logger.debug('创建路径：'+path+' 失败');
      logger.debug('Error: '+err.message);
      info.cb();
    } else {
      logger.debug('创建路径：'+path+' 成功');
      fse.mkdirs(thumb_path, function(err){
        if (err) {
          logger.debug('创建路径：'+thumb_path+' 失败');
          logger.debug('Error: '+err.message);
          info.cb();
        } else {
          logger.debug('创建路径：'+thumb_path+' 成功');
          info.dst = join(path, info.filename);
          moveto(info);
        }
      });
    }
  });
}

//< 移动文件到仓库
function moveto(info) {
  fs.exists(info.dst, function (exists) {
    if(exists) {
      var path = storage_dir + '/' + info.rel_path;
      info.filename = info.filename + generateMixed(8) + '.' + info.ext;
      info.dst = join(path, info.filename);
    }
    fse.copy(info.or_file_path, info.dst, function (err) {
      if (err) {
        logger.debug('移动文件：'+info.filename+'失败');
        info.cb();
      } else {
        logger.debug('移动文件：'+info.filename+'成功');
        genThumbs(info);
      }
    });
  });
}

//< 生成缩略图
function genThumbs(info) {
  var thumbs = [];
  async.eachSeries(thumbnails, function(item, callback){
    var thumb_path = join(thumb_dir, info.rel_path);
    var thumb_file_name = info.filename + '.'+item[0]+'x'+item[1]+'.'+info.ext;
    var _fileThumb = join(thumb_path, thumb_file_name);
    gm(info.dst).resize(item[0], item[1], '^').quality(80).write(_fileThumb, function(err){
      if(err) {
        callback(err);
      }
      logger.debug('生成缩略图：'+thumb_file_name+'成功');
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
      exif: JSON.stringify(info.exifData),
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
        logger.debug('数据保存到mysql成功，删除原文件:'+info.filename);
        fs.unlink(info.or_file_path);
      }
      else {
        logger.debug('数据保存失败');
      }
      info.cb();
    });
  });
}



//< 启动
exports.start = function(_logger, _connection){
  logger = _logger;
  connection = _connection;
  dojob(income_dir);
};
