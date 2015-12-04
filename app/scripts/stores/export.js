'use strict';

var Reflux = require('reflux');
var ExportActions = require('../actions/export.js');
var dataSourceStore = require('../stores/dataSource.js');
var fs = window.electronRequire('fs-extra');

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in ImportActions, using onKeyname (or keyname) as callbacks
  listenables: [ExportActions],

  packagePassword: '',

  // Check if YubiKey is inserted
  // ToDO: For now always saying true. Need to add npm yub to check for real
  onYubiKeyCheck: function() {

    var isYubiKeyInserted = true;

    if (isYubiKeyInserted) {
      this.message = 'yubiKeyInserted';
    } else {
      this.message = 'noYubiKey';
    }

    this.trigger(this);
  },

  // Export a presentation to the filesystem
  onExportPresentation: function (presentationObject) {

    var tempExportDirectory = presentationObject.packageLocation + 'ExportTemp';
    var dbName = '/SITF.json';
    var dbFilePath = window.appConfig.paths.dbPath + dbName;

    // Set the package password
    this.packagePassword = presentationObject.packagePassword;

    // Create a temporary directory for database file and related source files
    fs.mkdirs(tempExportDirectory, function(err) {

      if (err) {
        return console.error(err);
      }
    });

    // ToDo: Remove all other package transforms
    this.removeOtherTransformFilters();

    // Copy the database file into the temp directory
    fs.copy(dbFilePath, tempExportDirectory + dbName, function(err) {

      if (err) {
        return console.error(err);
      }
    });

    // Iterate through each Source Object and copy the file from its Source Path into the temp directory
    this.copySourceFiles(this.getLokiSourceObjects(presentationObject.presentationName), presentationObject);
  },

  // Get an array of loki Source objects that we can use to copy files across
  getLokiSourceObjects: function(presentationName) {

    var sourceObjects;

    // ToDO: In unlikely case of no source collection, don't need to copy source files
    if (!dataSourceStore.dataSource.getCollection('Source')) {

    }

    // If a filter has been applied, only get selected source records otherwise get all
    if (dataSourceStore.dataSource.getCollection('Source').chain(presentationName)) {
      sourceObjects = dataSourceStore.dataSource.getCollection('Source').chain(presentationName).data();
    } else {
      sourceObjects = dataSourceStore.dataSource.getCollection('Source').data;
    }

    return sourceObjects;
  },

  // ToDo: Remove other transform filters
  removeOtherTransformFilters: function() {
    console.log('ToDo: Remove Other transform package names');
  },

  // Iterate through each Source Object and copy the file from its Source Path into the temp directory
  copySourceFiles: function(sourceFilesArray, presentationObject) {

    var sourceFilePath = window.appConfig.paths.sourcePath;
    var tempExportDirectory = presentationObject.packageLocation + 'ExportTemp';

    sourceFilesArray.forEach(function(sourceFile) {

      // Copy each source file to the temp directory
      fs.copy(sourceFilePath + '/' + sourceFile.Src, tempExportDirectory + '/' + sourceFile.Src, function(err) {

        if (err) {
          return console.error(err);
        }
      });
    });
  }
});
