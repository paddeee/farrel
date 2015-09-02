/**
 * @file lokiFileAdapter.js
 */

/*
 * Uses browserify-fs rather than fs so can run in browser for easier testing in development
 */


/**
 * require libs
 * @ignore
 */
var fs = require('browserify-fs');

/**
 * The constructor is automatically called on `require` , see examples below
 * @constructor
 */
function lokiFileAdapter() {}

/**
 * loadDatabase() - Retrieves a serialized db string from the catalog.
 *
 *  @example
 // LOAD
 var fileAdapter = require('./lokiFileAdapter');
 var db = new loki('test', { adapter: fileAdapter });
 db.loadDatabase(function(result) {
		console.log('done');
	});
 *
 * @param {string} dbname - the name of the database to retrieve.
 * @param {function} callback - callback should accept string param containing serialized db string.
 */
lokiFileAdapter.prototype.loadDatabase = function loadDatabase(dbname, callback) {
  var callbackFunction = callback || console.log;

  fs.readFile(dbname,'utf8', function(err, data) {
    var db = err || data;
    callbackFunction(db);
  });
};

/**
 *
 @example
 // SAVE : will save database in 'test'
 var fileAdapter = require('./lokiFileAdapter');
 var loki=require('lokijs');
 var db = new loki('test',{ adapter: fileAdapter });
 var coll = db.addCollection('testColl');
 coll.insert({test: 'val'});
 db.saveDatabase();  // could pass callback if needed for async complete

 * saveDatabase() - Saves a serialized db to the catalog.
 *
 * @param {string} dbname - the name to give the serialized database within the catalog.
 * @param {string} dbstring - the serialized db string to save.
 * @param {function} callback - (Optional) callback passed obj.success with true or false
 */
lokiFileAdapter.prototype.saveDatabase = function saveDatabase(dbname, dbstring, callback) {
  var callbackFunction = callback || function (){};
  //fs.writeFile(dbname, dbstring, 'utf8',callbackFunction);

  fs.mkdir('/home', function() {
    fs.writeFile('./home/' + dbname, dbstring, function() {
      fs.readFile('/home/' + dbname, 'utf-8', function(err, data) {
        console.log(err);
        console.log(data);
      });
    });
  });
};

module.exports = new lokiFileAdapter();
exports.lokiFileAdapter = lokiFileAdapter;
