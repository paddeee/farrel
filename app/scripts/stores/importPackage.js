'use strict';

var Reflux = require('reflux');
var loki = require('lokijs');
var importFileAdapter = require('../adapters/loki-import-file-adapter.js');
var ImportPackageActions = require('../actions/importPackage.js');
var dataSourceStore = require('../stores/dataSource.js');
var fsExtra = appMode === 'app' ? window.electronRequire('fs-extra') : null;
var crypto = appMode === 'app' ? window.electronRequire('crypto') : null;
var getRawBody = appMode === 'app' ? window.electronRequire('raw-body') : null;

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in ExportActions, using onKeyname (or keyname) as callbacks
  listenables: [ImportPackageActions],

  packagePassword: '',

  // Check if YubiKey is inserted
  // ToDO: For now always saying true. Need to add npm yub to check for real
  onPackageSelected: function(packageObject) {

    importFileAdapter.tempPackageDirectory = packageObject.packageLocation;

    this.commenceImportProcess(packageObject);
  },

  // Start the chain of Promises that will handle the Import Process
  commenceImportProcess: function(packageObject) {

    // Decrypt the DB File
    this.decryptConfigFile(packageObject)
      .then(function(configJSON) {
        console.log('Config File Decrypted');

        // Set the Global Config property here
        global.config = configJSON;

      // Decrypt the DB File
      this.decryptDatabaseFile(packageObject)
        .then(function(dbJSON) {
          console.log('DB File Decrypted');

          // Load Loki DB into memory
          this.loadDatabase(dbJSON)
            .then(function() {
              console.log('Database Loaded');

              // Send object out to all listeners when database loaded
              dataSourceStore.dataSource.message = {
                type: 'dataBaseLoaded'
              };

              // Add the package filesystem location so we can use it later for Publishing functionality
              global.config.packagePath = importFileAdapter.tempPackageDirectory;

              // Set packagePassword so we can access it if application locks
              this.packagePassword = packageObject.packagePassword;

              dataSourceStore.dataSource.message = {
                type: 'packageImported'
              };

              dataSourceStore.trigger(dataSourceStore);

              this.message = 'importSuccess';
              this.trigger(this);
              dataSourceStore.dataSource.message = {
                type: ''
              };
              this.message = '';
            }.bind(this));
          }.bind(this))
        .catch(function(error) {

          console.warn('DATABASE DECRYPTION FAILURE', error);

          this.message = 'dbDecryptionFailure';
          this.trigger(this);
          this.message = '';
        }.bind(this));
      }.bind(this))
      .catch(function(error) {

        console.warn('CONFIG FILE DECRYPTION FAILURE', error);

        this.message = 'configDecryptionFailure';
        this.trigger(this);
        this.message = '';
      }.bind(this));
  },

  // Decrypt the config file
  decryptConfigFile: function(packageObject) {

    return new Promise(function (resolve, reject) {

      // Input file
      var configStream = fsExtra.createReadStream(importFileAdapter.tempPackageDirectory + '/appConfig.json');

      // Decrypt content
      var decrypt = crypto.createDecipher('aes-256-ctr', packageObject.packagePassword);

      configStream.on('error', function(error) {
        reject(error);
      });

      // Start pipe
      getRawBody(configStream.pipe(decrypt))
        .then(function (buffer) {
          try {
            JSON.parse(buffer.toString());
            resolve(JSON.parse(buffer.toString()));
          } catch (error) {
            console.log('Error decrypting DataBase file: ' + error);
            reject(error);
          }
        })
        .catch(function (error) {
          console.log('Error decrypting DataBase file: ' + error);
          reject(error);
        });
    });
  },

  // Decrypt the database file
  decryptDatabaseFile: function(packageObject) {

    return new Promise(function (resolve, reject) {

      // Input file
      var dbStream = fsExtra.createReadStream(importFileAdapter.tempPackageDirectory + '/EPE.dat');

      // Decrypt content
      var decrypt = crypto.createDecipher('aes-256-ctr', packageObject.packagePassword);

      dbStream.on('error', function(error) {
        reject(error);
      });

      // Start pipe
      getRawBody(dbStream.pipe(decrypt))
        .then(function (buffer) {
          try {
            JSON.parse(buffer.toString());
            resolve(buffer.toString());
          } catch (error) {
            console.log('Error decrypting DataBase file: ' + error);
            reject(error);
          }
        })
        .catch(function (error) {
          console.log('Error decrypting DataBase file: ' + error);
          reject(error);
        });
    });
  },

  // Load Database JSON File in to memory
  loadDatabase: function(dbJSON) {

    return new Promise(function (resolve) {

      dataSourceStore.dataSource = new loki('EPE.json');

      dataSourceStore.dataSource.loadJSON(dbJSON, {});

      resolve();
    });
  }
});
