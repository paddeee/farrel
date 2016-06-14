'use strict';

var Reflux = require('reflux');
var config = global.config;
var loki = require('lokijs');
var exportFileAdapter = require('../adapters/loki-export-file-adapter.js');
var ExportActions = require('../actions/export.js');
var dataSourceStore = require('../stores/dataSource.js');
var eventsStore = require('../stores/events.js');
var placesStore = require('../stores/places.js');
var peopleStore = require('../stores/people.js');
var fsExtra = window.electronRequire('fs-extra');
var zipFolder = window.electronRequire('zip-folder');
var encryptor = window.electronRequire('file-encryptor');
//var usb = window.electronRequire('electron-usb');

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in ExportActions, using onKeyname (or keyname) as callbacks
  listenables: [ExportActions],

  packagePassword: '',

  // Check if YubiKey is inserted
  // ToDO: For now always saying true. Need to add npm yub to check for real
  onYubiKeyCheck: function() {

    var isYubiKeyInserted = true;

   // console.log(usb.getDeviceList());

    if (isYubiKeyInserted) {
      this.message = 'yubiKeyInserted';
    } else {
      this.message = 'noYubiKey';
    }

    this.trigger(this);
  },

  // Export a presentation to the filesystem
  onExportPresentation: function (presentationObject) {

    var exportDatabase = new loki('SITF.json', { adapter: exportFileAdapter });

    // Set property to be used by the loki export file adapter
    exportFileAdapter.tempExportDirectory = presentationObject.packageLocation + presentationObject.packageName;

    // Set the package password
    this.packagePassword = presentationObject.packagePassword;

    // Create a temporary directory for database file and related source files
    fsExtra.mkdirs(exportFileAdapter.tempExportDirectory, function(err) {

      if (err) {
        return console.error(err);
      } else {

        // Load the Export Database Collections into the DB
        // Then Update the collections depending on what the user has selected to export, filtered or selected
        // When the Export Database file is successfully saved, start the Export sequence
        exportDatabase.loadDatabase({}, function() {
          this.updateDataCollections(exportDatabase, presentationObject);
          this.commenceExportProcess(exportDatabase, presentationObject);
        }.bind(this));
      }
    }.bind(this));
  },

  // Start the chain of Promises that will handle the Export Process
  commenceExportProcess: function(exportDatabase, presentationObject) {

    var saveExportDatabase;
    var zipTempDirectory;

    // Create promise for saving the export Database
    saveExportDatabase = new Promise(function (resolve, reject) {

      // Save database
      exportDatabase.saveDatabase(function(response, error) {

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }.bind(this));
    });

    // Create promise for zipping the Temporary Directory
    zipTempDirectory = new Promise(function (resolve, reject) {

      // Add artificial timeout to make sure the directory is ready with all its contents
      setTimeout(function() {
        zipFolder(exportFileAdapter.tempExportDirectory, exportFileAdapter.tempExportDirectory + '.zip', function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }, 100);
    });

    saveExportDatabase
    .then(function() {
      console.log('Export DB File Saved');

      // Iterate through each Source Object and copy the file from its Source Path into the temp directory
      this.copySourceFiles(exportDatabase.getCollection(config.SourcesCollection.name).data, presentationObject, exportFileAdapter.tempExportDirectory)
      .then(function() {
        console.log('Source Files Copied');

        // Zip temporary directory
        zipTempDirectory
        .then(function() {
          console.log('Folder Zipped');

          // Encrypt zip file
          this.encryptPackage(presentationObject)
          .then(function() {
            console.log('Package Encrypted');

            // Delete temporary directory
            this.deleteTempDirectory(exportFileAdapter.tempExportDirectory)
            .then(function() {
              console.log('Temp directory removed');

              this.deleteZipFile(exportFileAdapter.tempExportDirectory + '.zip')
              .then(function() {
                console.log('Zip File removed');

                this.message = 'exportSuccess';
                this.trigger(this);
              }.bind(this))
              .catch(function(reason) {
                console.error(reason);
                this.message = 'removeZipFileFailure';

                  // Delete temporary directory
                  this.deleteTempDirectory(exportFileAdapter.tempExportDirectory);

                this.trigger(this);
              }.bind(this));
            }.bind(this))
            .catch(function(reason) {
              console.log(this);
              console.error(reason);

                // Delete zip file
                this.deleteZipFile(exportFileAdapter.tempExportDirectory + '.zip');

              this.message = 'removeDirectoryFailure';
              this.trigger(this);
            }.bind(this));
            }.bind(this))
            .catch(function(reason) {
              console.error(reason);
              this.message = 'encryptionFailure';

              // Delete temporary directory
              this.deleteTempDirectory(exportFileAdapter.tempExportDirectory);

              // Delete zip file
              this.deleteZipFile(exportFileAdapter.tempExportDirectory + '.zip');

              this.trigger(this);
            }.bind(this));
          }.bind(this))
          .catch(function(reason) {
            console.error(reason);
            this.message = 'zipDirectoryFailure';

            // Delete temporary directory
            this.deleteTempDirectory(exportFileAdapter.tempExportDirectory);

            // Delete zip file
            this.deleteZipFile(exportFileAdapter.tempExportDirectory + '.zip');

            this.trigger(this);
          }.bind(this));
      }.bind(this))
      .catch(function(reason) {
        console.error(reason);
        this.message = 'sourceFileCopyFailure';

          // Delete temporary directory
          this.deleteTempDirectory(exportFileAdapter.tempExportDirectory);

          // Delete zip file
          this.deleteZipFile(exportFileAdapter.tempExportDirectory + '.zip');

        this.trigger(this);
      }.bind(this));
    }.bind(this))
    .catch(
    function(reason) {
      console.error(reason);
      this.message = 'dbCopyFailure';

      // Delete temporary directory
      this.deleteTempDirectory(exportFileAdapter.tempExportDirectory);

      this.trigger(this);
    }.bind(this));
  },

  // Base on whether the export has chosen filtered or selected records, set the collection data to the correct subset
  updateDataCollections: function(exportDatabase, presentationObject) {

    var exportEventData;
    var exportPlaceData;
    var exportPeopleData;
    var exportSourceData;
    var eventsCollection = exportDatabase.getCollection(config.EventsCollection.name);
    var placeCollection = exportDatabase.getCollection(config.PlacesCollection.name);
    var peopleCollection = exportDatabase.getCollection(config.PeopleCollection.name);
    var sourceCollection = exportDatabase.getCollection(config.SourcesCollection.name);
    var presentationsCollection = dataSourceStore.dataSource.getCollection('Presentations');
    var selectedPresentationObject = presentationsCollection.find({
      presentationName: presentationObject.packageName
    })[0];

      // If exporting filtered records, user the userFilteredCollection data
    if (presentationObject.filteredOrSelected === 'filtered') {
      exportEventData = eventsStore.userFilteredCollection.data();
      exportPlaceData = placesStore.userFilteredCollection.data();
      exportPeopleData = peopleStore.userFilteredCollection.data();

      // If exporting selected records, use the records stored in the presentations collection
    } else if (presentationObject.filteredOrSelected === 'selected') {
      exportEventData = selectedPresentationObject.selectedEvents;
      exportPlaceData = selectedPresentationObject.selectedPlaces;
      exportPeopleData = selectedPresentationObject.selectedPeople;
    }

    // Always export just selected sources
    exportSourceData = selectedPresentationObject.selectedSources;

    // Remove $loki properties from data so we can insert the documents afresh
    exportEventData = exportEventData.map(function(object) {

      var clonedObject = _.cloneDeep(object);

      delete clonedObject.$loki;
      return clonedObject;
    });

    exportPlaceData = exportPlaceData.map(function(object) {

      var clonedObject = _.cloneDeep(object);

      delete clonedObject.$loki;
      return clonedObject;
    });

    exportPeopleData = exportPeopleData.map(function(object) {

      var clonedObject = _.cloneDeep(object);

      delete clonedObject.$loki;
      return clonedObject;
    });

    exportSourceData = exportSourceData.map(function(object) {

      var clonedObject = _.cloneDeep(object);

      delete clonedObject.$loki;
      return clonedObject;
    });

    // Remove All records
    eventsCollection.removeDataOnly();
    placeCollection.removeDataOnly();
    peopleCollection.removeDataOnly();
    sourceCollection.removeDataOnly();

    // Add filtered or selected records
    eventsCollection.insert(exportEventData);
    placeCollection.insert(exportPlaceData);
    peopleCollection.insert(exportPeopleData);
    sourceCollection.insert(exportSourceData);
  },

  // Encrypt a zip file using aes-256 and the package password
  encryptPackage: function (presentationObject) {

    return new Promise(function (resolve, reject) {

      var packageName = presentationObject.packageName;
      var tempDirectory = presentationObject.packageLocation;
      var zipPath = tempDirectory + packageName + '.zip';
      var options = {
        algorithm: 'aes256'
      };

      // Encrypt file
      encryptor.encryptFile(zipPath, tempDirectory + packageName + '.dat', this.packagePassword, options, function(err) {

        if (err) {
          reject('Error encrypting Zip file: ' + err);
        } else {
          resolve();
        }
      });

    }.bind(this));
  },

  // Iterate through each Source Object and copy the file from its Source Path into the temp directory
  copySourceFiles: function(sourceFilesArray, presentationObject, tempExportDirectory) {

    return new Promise(function (resolve, reject) {

      var sourceFilePath = config.paths.sourcePath;

      // Return a new Promise for every file to be copied
      /*var copyFile = function(sourceFile) {

        return new Promise(function(resolve, reject) {

          var read = fsExtra.createReadStream(sourceFilePath + sourceFile['Linked File']);
          var write = fsExtra.createWriteStream(tempExportDirectory + sourceFile['Linked File']);

          //read.on('error', reject);
          write.on('error', reject);
          write.on('finish', resolve);
          read.pipe(write);
        });
      };*/

      // Return a new Promise for every file to be copied
      var copyFile = function (sourceFile) {

        return new Promise(function(resolve, reject) {

          fsExtra.stat(tempExportDirectory + '/' + sourceFile['Linked File'], function(err) {

            // File exists
            if (err === null) {
              console.log(tempExportDirectory + '/' + sourceFile['Linked File'] + ' File exists');
              resolve();

            } else if (err.code === 'ENOENT') {

              // File does not exist
              // Copy each source file to the temp directory
              fsExtra.ensureLink(sourceFilePath + '/' + sourceFile['Linked File'], tempExportDirectory + '/' + sourceFile['Linked File'], function (error) {

                if (error) {

                  if (error.code === 'EEXIST') {
                    console.log(sourceFile['Linked File'] + ' file exists');
                    resolve();
                  } else {
                    console.log(sourceFile['Linked File'] + ' failed');
                    reject(error);
                  }
                } else {
                  console.log(sourceFile['Linked File'] + ' copied');
                  resolve();
                }
              });

            } else {
              reject('Some other error: ', err.code);
            }
          });
        });
      };

      // run the function over all items.
      var arrayOfPromises = sourceFilesArray.map(copyFile);

      // Resolve or reject Promise when all Promises have been evaluated
      Promise.all(arrayOfPromises).then(function() {
        console.log('All source files copied');
        resolve();
      })
        .catch(function(err) {
          reject(Error(err));
        });
    });
  },

  // Delete the temporary Directory
  deleteTempDirectory: function(tempExportDirectory) {

    return new Promise(function (resolve, reject) {

      fsExtra.remove(tempExportDirectory, function (err) {

        if (err) {
          reject(Error(err));
        } else {
          resolve();
        }
      }.bind(this));
    });
  },

  // Delete the zip file
  deleteZipFile: function(zipPath) {

    return new Promise(function (resolve, reject) {

      fsExtra.remove(zipPath, function (err) {

        if (err) {
          reject(Error(err));
        } else {
          resolve();
        }
      }.bind(this));
    });
  }
});
