'use strict';

var Reflux = require('reflux');
var config = appMode === 'app' ? global.config : require('../config/config.js');
var ImportActions = require('../actions/import.js');
var DataSourceActions = require('../actions/dataSource.js');
var dataSourceStore = require('../stores/dataSource.js');
var loggingStore = require('../stores/logging.js');
var presentationsCollectionName = 'Presentations';

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in ImportActions, using onKeyname (or keyname) as callbacks
  listenables: [ImportActions, DataSourceActions],

  init: function() {
    this.eventsSchemaFields = [];
    this.placesSchemaFields = [];
    this.peopleSchemaFields = [];
    this.sourcesSchemaFields = [];
    this.errorArray = [];
  },

  // Create arrays based on fields in schema to validate imported files
  createSchemaArrays: function() {

    // Events
    config.EventsCollection.fields.forEach(function(object) {
      this.eventsSchemaFields.push(object.name);
    }.bind(this));

    // Places
    config.PlacesCollection.fields.forEach(function(object) {
      this.placesSchemaFields.push(object.name);
    }.bind(this));

    // People
    config.PeopleCollection.fields.forEach(function(object) {
      this.peopleSchemaFields.push(object.name);
    }.bind(this));

    // Sources
    config.SourcesCollection.fields.forEach(function(object) {
      this.sourcesSchemaFields.push(object.name);
    }.bind(this));
  },

  // When a CSV file has been selected by an Administrator
  importFile: function (fileObject) {

    var parsedFile;
    var dataSource = dataSourceStore.dataSource;
    var dataCollection = dataSource.getCollection(fileObject.collectionName);

    // Parse the CSV into an array
    parsedFile = this.parseCSV(fileObject);

    // If file import failed
    if (!(parsedFile instanceof Array)) {
      return parsedFile;
    }

    // Create/Update a collection in the database
    if (dataCollection) {
      dataCollection.clear();
      dataCollection.setChangesApi(true);
    } else {
      dataCollection = this.addDBCollection(dataSource, fileObject);
    }

    // Insert the array into the database collection
    this.populateCollection(parsedFile, dataCollection, fileObject.collectionName);

    dataSource.message = {
      type: 'collectionImported',
      collectionName: fileObject.collectionName
    };

    // Call collectionImported method on DataSource store
    dataSourceStore.collectionImported(dataSource);

    return true;
  },

  // When a bunch of data files have been imported by an Administrator
  onFilesImported: function (importObject) {

    var dataSource = dataSourceStore.dataSource;
    this.importDirectory = importObject.directoryName;

    this.createSchemaArrays();

    // If any files failed set flag so we don't save the database
    importObject.sheetsArray.forEach(function(fileObject) {

      var importFile = this.importFile(fileObject);

      if (typeof importFile !== 'boolean') {
        this.errorArray.push(importFile);
      }
    }.bind(this));

    // If any file import has failed send array of fail objects
    if (this.errorArray.length) {
      this.trigger(this.errorArray);
      this.logFailedImport(this.errorArray);
      this.errorArray = [];
      return;
    }

    // Replace shortNames in description field of Event collection
    this.replaceShortnames(dataSource);

    // Replace shortNames in description field of Event collection
    this.generateSupportingDocsHTML(dataSource);

    // Copies of selected data objects are stored in Presentations Collection. These need to be updated.
    this.updateSelectedPresentationsData();

    dataSourceStore.syncDatabase('import')
      .then(function() {

        // Save database
        dataSourceStore.latestDB.saveDatabase(function(response) {

          var messageType;
          var message;

          // If response.code it is an error
          if (response.code) {
            if (response.code === 'EACCES') {
              messageType = 'ImportDbError';
              message = 'The DataBase file is locked by another user. Try again in a few seconds. If the problem persists, please contact Evidential.';
            } else {
              messageType = 'ImportDbError';
              message = 'There was a problem saving to the database. Try again in a few seconds. If the problem persists, please contact Evidential.';
            }

            // Pass on to listeners
            this.trigger({
              type: messageType,
              title: 'Import Failure',
              message: message
            });

          } else {

            console.log('DataBase saved');

            // Fix for App not working properly after import.
            // Reloading database into memory seems to sort things
            dataSourceStore.loadDatabase();

            // Pass on to listeners
            this.trigger({
              type: 'success',
              title: 'Import Successful',
              message: 'All files have been successfully imported'
            });

            this.logSuccessfulImport();
          }

         }.bind(this));

      }.bind(this))
      .catch(function(error) {
        console.log(error);
      });
  },

  // For Supporting Documents in each collection, add HTML
  generateSupportingDocsHTML: function(dataSource) {

    var eventData = dataSource.getCollection(config.EventsCollection.name).data;

    // Replace shortnames in Events
    eventData.forEach(function(event) {

      if (event['Supporting Documents']) {
        event['Supporting Document Links'] = this.addSupportingDocsHTML(event, dataSource);
      }
    }.bind(this));
  },

  // Add HTML to supporting documents so they can be linked from the data grid
  addSupportingDocsHTML: function(event, dataSource) {

    var supportingDocuments = event['Supporting Documents'];

    var supportingDocsHTMLArray = [];

    supportingDocuments = supportingDocuments.split(',');

    supportingDocuments.forEach(function(supportingDoc) {

      var supportingDocObject = this.getSupportingDocId(supportingDoc.trim(), dataSource);

      if (supportingDocObject) {
        supportingDocObject = JSON.stringify(supportingDocObject);
        //supportingDocsHTMLArray.push(`<span class='supporting-doc' data-source='${supportingDocObject}'>${supportingDoc.trim()}</span>`);
        supportingDocsHTMLArray.push(supportingDoc.trim());
      } else {
        supportingDocsHTMLArray.push(supportingDoc.trim());
      }

    }.bind(this));

    return supportingDocsHTMLArray.join(', ');
  },

  // Get the id of the Supporting document from the Source Collection
  getSupportingDocId: function(docShortName, dataSource) {

    var sourceCollection = dataSource.getCollection(config.SourcesCollection.name);

    return sourceCollection.find({
      'Short Name': {
        '$eq': docShortName
      }
    })[0];
  },

  // Find and Replace by a dictionary
  replaceShortnames: function(dataSource) {

    var shortNameDictionary = {};
    var eventData = dataSource.getCollection(config.EventsCollection.name).data;
    var placeData = dataSource.getCollection(config.PlacesCollection.name).data;
    var personData = dataSource.getCollection(config.PeopleCollection.name).data;

    shortNameDictionary = this.addToShortnameDictionary(shortNameDictionary, eventData);
    shortNameDictionary = this.addToShortnameDictionary(shortNameDictionary, placeData);
    shortNameDictionary = this.addToShortnameDictionary(shortNameDictionary, personData);

    var handlerFunction = function(key, shortNameDictionary) {
      return shortNameDictionary[key] + ' [' + key + '] ';
    };

    // Replace shortnames in Events
    eventData.forEach(function(event) {

      if (event['Linked events']) {
        event['Linked events'] = this.replaceUsingDictionary(shortNameDictionary, event['Linked events'], handlerFunction);
      }

      if (event.Place) {
        event.Place = this.replaceUsingDictionary(shortNameDictionary, event.Place, handlerFunction);
      }

      if (event.Suspects) {
        event.Suspects = this.replaceUsingDictionary(shortNameDictionary, event.Suspects, handlerFunction);
      }

      if (event.Victims) {
        event.Victims = this.replaceUsingDictionary(shortNameDictionary, event.Victims, handlerFunction);
      }

      if (event.Witnesses) {
        event.Witnesses = this.replaceUsingDictionary(shortNameDictionary, event.Witnesses, handlerFunction);
      }

      if (event.Description) {
        event.Description = this.replaceUsingDictionary(shortNameDictionary, event.Description, handlerFunction);
      }
    }.bind(this));

    // Replace shortnames in Places
    placeData.forEach(function(place) {

      if (place.Description) {
        place.Description = this.replaceUsingDictionary(shortNameDictionary, place.Description, handlerFunction);
      }

    }.bind(this));

    // Replace shortnames in Persons
    personData.forEach(function(person) {

      if (person.Profile) {
        person.Profile = this.replaceUsingDictionary(shortNameDictionary, person.Profile, handlerFunction);
      }

      if (person.Description) {
        person.Description = this.replaceUsingDictionary(shortNameDictionary, person.Description, handlerFunction);
      }

    }.bind(this));
  },

  // Return a dictionary of Shortname/Full Name pairs from a collection
  addToShortnameDictionary: function(shortNameDictionary, collection) {

    collection.forEach(function(record) {
      shortNameDictionary[record['Short Name']] = record['Full Name'];
    });

    return shortNameDictionary;
  },

  // Replaces phrases in a string, based on keys in a given dictionary
  replaceUsingDictionary: function(dictionary, content, replacehandler) {

    var patterns = [];
    var patternHash = {};
    var key;
    var index = 0;
    var output = [];
    var pattern;
    var lastIndex;

    if (typeof replacehandler !== 'function') {

      // Default replacehandler function.
      replacehandler = function(key, dictionary) {
        return dictionary[key];
      };
    }

    for (key in dictionary) {

      // Sanitize the key, and push it in the list
      patterns.push('\\b(?:' + key.replace(/([[^$.|?*+(){}])/g, '\\$1') + ')\\b');

      // Add entry to hash variable, for an optimized backtracking at the next loop
      patternHash[key] = index++;
    }

    pattern = new RegExp(patterns.join('|'), 'gi');
    lastIndex = 0;

    // We should actually test using !== null, but for foolproofness,
    // we also reject empty strings
    // Using extra parentheses to pass JSHint
    while ((key = pattern.exec(content))) {

      // Case-insensitivity
      key = key[0];

      // Add to output buffer
      output.push(content.substring(lastIndex, pattern.lastIndex - key.length));

      // The next line is the actual replacement method
      output.push(replacehandler(key, dictionary));

      // Update lastIndex variable
      lastIndex = pattern.lastIndex;

      // IMPORTANT: Update lastIndex property. Otherwise, enjoy an infinite loop
      pattern.lastIndex = lastIndex;
    }
    output.push(content.substring(lastIndex, content.length));
    return output.join('');
  },

  // Create an array of cellObjects which can be iterated through to return a dataCollection
  parseCSV: function (fileObject) {

    var headingRow = 1;
    var collectionName = fileObject.collectionName;
    var cellArray;
    var dataCollection = [];
    var cellRow;
    var headingsHash = {};
    var sheet = fileObject.CSV.Sheets[fileObject.CSV.SheetNames[0]];
    var fileInvalid;

    // Create an array of cellObjects
    cellArray = this.createCellArray(sheet);

    // Iterate through each cell in cellArray
    cellArray.forEach(function (cellObject) {

      var cellIdentifier = Object.keys(cellObject)[0];
      var lettersPattern = /(\D+)/g;
      var cellLetterIdentifier;
      var dataRecord = {};

      // Letter part of the cellIdentifier, e.g A, B, AA
      cellLetterIdentifier = lettersPattern.exec(cellIdentifier)[0];

      // If the cell belongs to a new row, add the cellObject to the array
      if (cellRow !== parseInt(cellIdentifier.replace(/\D+/g, ''), 10)) {

        if (cellRow) {
          dataCollection.push(dataRecord);
        }
        cellRow = parseInt(cellIdentifier.replace(/\D+/g, ''), 10);
      }

      // If the cell comes from the row of headings, keep a record in the temporary headingsHash
      if (cellRow === headingRow) {

        if (this.validateFieldName(collectionName, cellObject[cellIdentifier].v)) {
          headingsHash[cellLetterIdentifier] = cellObject[cellIdentifier].v;
        } else {
          fileInvalid = {
            type: 'collectionFailed',
            collectionName: fileObject.collectionName,
            message: 'Field Name "' + cellObject[cellIdentifier].v + '" does not match the "' + collectionName + '" schema in the config file.'
          };
        }

      } else {

        // Using cellRow - 2 below because the index starts at 0 and we won't have pushed an object in the array for
        // headings
        dataRecord = dataCollection[cellRow - 2];
        dataRecord[headingsHash[cellLetterIdentifier]] = cellObject[cellIdentifier].v;

        // Set all record's 'showRecord' and 'disabled' properties to false by default
        dataRecord.selectedByEvent = false;
        dataRecord.showRecord = false;
      }

    }.bind(this));

    if (collectionName === config.EventsCollection.name && dataCollection.length > 550) {
      return {
        type: 'eventsLimitExceeded',
        message: 'The Events CaseMap file exceeds the 550 Events limit. Please remove Events records in CaseMap and try again.'
      };
    }

    if (collectionName === config.PeopleCollection.name && dataCollection.length > 110) {
      return {
        type: 'eventsLimitExceeded',
        message: 'The People CaseMap file exceeds the 110 people limit. Please remove People records in CaseMap and try again.'
      };
    }

    if (fileInvalid) {
      return fileInvalid;
    } else {
      return dataCollection;
    }
  },

  // Validate the incoming fieldName for a collection exists in the schema
  validateFieldName: function (collectionName, fieldName) {

    var validFieldName = false;

    switch (collectionName) {
      case config.EventsCollection.name:
        if (_.indexOf(this.eventsSchemaFields, fieldName) !== -1) {
          validFieldName = true;
        }
        break;
      case config.PlacesCollection.name:
        if (_.indexOf(this.placesSchemaFields, fieldName) !== -1) {
          validFieldName = true;
        }
        break;
      case config.PeopleCollection.name:
        if (_.indexOf(this.peopleSchemaFields, fieldName) !== -1) {
          validFieldName = true;
        }
        break;
      case config.SourcesCollection.name:
        if (_.indexOf(this.sourcesSchemaFields, fieldName) !== -1) {
          validFieldName = true;
        }
        break;
      default:
        validFieldName = true;
    }

    return validFieldName;
  },

  // Create an array of cellObjects which can be iterated through to generate our dataCollection
  createCellArray: function (sheet) {

    var cellArray = [];

    // For each cellName in a sheet, pass the letters of the cell name into the array
    for (var cellName in sheet) {
      cellArray = this.addCellToArray(sheet, cellName, cellArray);
    }

    return cellArray;
  },

  // Create a cellObject and add it to the cellArray if it is a valid data cell
  addCellToArray: function (sheet, cellName, cellArray) {

    var cellObject = {};

    if (cellName !== '!ref') {
      cellObject[cellName] = sheet[cellName];
      cellArray.push(cellObject);
    }

    return cellArray;
  },

  // Add a collection to a Loki database
  addDBCollection: function (db, fileObject) {

    return db.addCollection(fileObject.collectionName, {
      indices: this.getIndices(fileObject.collectionName)
    });
  },

  // Based on which collection has been imported, return an array of indices
  getIndices: function (collectionName) {

    var indices = [];

    switch (collectionName) {
      case config.PlacesCollection.name:
        indices.push('Full Name');
        break;
      case config.PeopleCollection.name:
        indices.push('Full Name');
        break;
      case config.EventsCollection.name:
        indices.push('Full Name');
        break;
      case config.SourcesCollection.name:
        indices.push('Full Name');
        break;
      default:
        break;
    }

    return indices;
  },

  // Populate the Loki collection with our array of data
  populateCollection: function (collectionArray, dataCollection, collectionName) {

    // Pass on to listeners
    this.trigger({
      type: 'fileImported',
      title: 'File Import Successful',
      message: collectionName
    });

    dataCollection.insert(collectionArray);
  },

  // Copies of selected data objects are stored in Presentations Collection. These need to be updated.
  updateSelectedPresentationsData: function() {

    var presentationsCollection = dataSourceStore.dataSource.getCollection(presentationsCollectionName);
    var eventsCollection = dataSourceStore.dataSource.getCollection(config.EventsCollection.name);
    var placeCollection = dataSourceStore.dataSource.getCollection(config.PlacesCollection.name);
    var personCollection = dataSourceStore.dataSource.getCollection(config.PeopleCollection.name);
    var sourceCollection = dataSourceStore.dataSource.getCollection(config.SourcesCollection.name);

    // For Each Presentation

    if (presentationsCollection) {

      presentationsCollection.data.forEach(function(presentation) {

        presentation.selectedEvents = this.updateSelectedPresentationData(presentation.selectedEvents, eventsCollection);
        presentation.selectedPlaces = this.updateSelectedPresentationData(presentation.selectedPlaces, placeCollection);
        presentation.selectedPeople = this.updateSelectedPresentationData(presentation.selectedPeople, personCollection);
        presentation.selectedSources = this.updateSelectedPresentationData(presentation.selectedSources, sourceCollection);

      }.bind(this));
    }
  },

  // Update the objects stored in arrays of Presentation Store that are used to export selected records
  updateSelectedPresentationData: function(selectedCollection, eventsCollection) {

    var selectedIds = [];

    // Return empty array if selected records haven't previously been added to presentation
    if (!selectedCollection) {
      return [];
    }

    selectedCollection.forEach(function(selectedObject) {
      selectedIds.push(selectedObject.$loki);
    });

    return eventsCollection.find({
      '$loki': {
        '$in': selectedIds
      }
    });
  },

  // Log on successful import
  logSuccessfulImport: function() {

    var importLogObject = {
      directoryName: this.importDirectory
    };

    if (global.config) {
      loggingStore.dataImported(importLogObject);
    }
  },

  // Log on failed import
  logFailedImport: function(errorArray) {

    var importLogObject = {
      directoryName: this.importDirectory,
      errorMessage: errorArray.map(function(errorObject){
        return errorObject.message;
      }).join(' -- ').replace(/"/g, '\'')
    };

    if (global.config) {
      loggingStore.dataImportFailed(importLogObject);
    }
  }
});
