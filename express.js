
/**
 * Module dependencies.
 */

var express = require('express');
var bodyParser = require('body-parser');
var swig = require('swig');

/**
 * Expose
 */

module.exports = function (app) {
  //var logger = require(config.glib+'library/logger')(config.logger.appenders, 'api');

  // Swig templating engine settings
  swig.setDefaults({
    cache: false
  });

  // set views path, template engine and default layout
  app.engine('html', swig.renderFile);
  app.set('views', 'views');
  app.set('view engine', 'html');

  // Static files middleware
  app.use(express.static('public'));

  // bodyParser should be above methodOverride
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
};
