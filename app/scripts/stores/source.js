'use strict';

var Reflux = require('reflux');
var dataSourceStore = require('../stores/dataSource.js');
var config = appMode === 'app' ? global.config : require('../config/config.js');
var presentationsStore = require('../stores/presentations.js');
var importPackageStore = require('../stores/importPackage.js');
var SourceActions = require('../actions/source.js');
var fsExtra = appMode === 'app' ? window.electronRequire('fs-extra') : null;
var crypto = appMode === 'app' ? window.electronRequire('crypto') : null;
var getRawBody = appMode === 'app' ? window.electronRequire('raw-body') : null;
var usersStore = require('../stores/users.js');
var relatedItemCollectionName = 'Relateditem';

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in SourceActions,
  // using onKeyname (or keyname) as callbacks
  listenables: [SourceActions],

  // Data storage for all collections
  dataSource: null,

  // The Loki collection transform array
  collectionTransform: [],

  // Called on Store initialisation
  init: function() {

    if (!presentationMode || presentationMode === 'online') {
      this.collectionName = config.SourcesCollection.name;
      this.setDefaultTransform();
    }

    // Register importPackageStore's changes
    this.listenTo(importPackageStore, this.importPackageChanged);

    // Register dataSourceStores's changes
    this.listenTo(dataSourceStore, this.dataSourceChanged);

    this.listenTo(presentationsStore, this.presentationsStoreChanged);

    // Register usersStores's changes
    this.listenTo(usersStore, this.userStoreChanged);
  },

  // Set the filteredData Object
  dataSourceChanged: function (dataSourceStore) {

    this.dataSource = dataSourceStore.dataSource;

    if (presentationMode && presentationMode === 'offline') {
      return;
    }

    this.setDefaultTransform();

    // Call when the source data is updated
    this.filterStateChanged(this.filterTransform);
  },

  // Add the images as blobs on the person's profile Object
  importPackageChanged: function (importPackageStore) {

    if (importPackageStore.message === 'importSuccess') {

      // Can set config object now
      config = global.config;

      this.collectionName = config.SourcesCollection.name;

      this.setDefaultTransform();

      // Call when the source data is updated
      this.createFilterTransform(this.filterTransform, dataSourceStore.message);
    }
  },

  // Set search filter on our collectionTransform
  filterStateChanged: function(filterTransformBroadcast) {

    this.setDatesTransform();

    this.createFilterTransform(filterTransformBroadcast);
  },

  // Listener to changes on Presentations Store
  presentationsStoreChanged: function() {

    // If presentation name has been set to 'ViewingFilter', reset the presentation
    if (presentationsStore.presentationName === 'ViewingFilter') {
      this.resetFilterTransform();
    }
  },

  // Create a transform from the passed in object and save it on the collection
  createFilterTransform: function(filterTransformObject, message) {

    if (!this.dataSource) {
      return;
    }

    var collectionTransformObject = this.filterTransform[this.collectionName];
    var collectionToAddTransformTo = this.dataSource.getCollection(this.collectionName);

    if (!collectionToAddTransformTo) {
      return;
    }

    // Add filter to the transform
    this.collectionTransform = [];
    this.collectionTransform.push(collectionTransformObject.filters);
    this.collectionTransform.push(collectionTransformObject.sorting);

    // Save the transform to the collection
    if (filterTransformObject.transformName) {

      if (collectionToAddTransformTo.chain(filterTransformObject.transformName)) {
        collectionToAddTransformTo.setTransform(filterTransformObject.transformName, this.collectionTransform);
      } else {
        collectionToAddTransformTo.addTransform(filterTransformObject.transformName, this.collectionTransform);
      }

      // Apply the filter
      this.userFilteredCollection = collectionToAddTransformTo.chain(collectionToAddTransformTo.transforms[filterTransformObject.transformName][0], this.params).copy();

      // Apply the sort
      this.userFilteredCollection.simplesort(collectionTransformObject.sorting.property, collectionTransformObject.sorting.desc);

      // Call the presentations store's flagUnapprovedSources method to set whether any source records are not approved
      // for release
      presentationsStore.flagUnapprovedSources(this.userFilteredCollection);

    } else {

      if (message !== 'presentationSaved') {
        this.userFilteredCollection = collectionToAddTransformTo.chain().copy();

        // Call the presentations store's flagUnapprovedSources method to set whether any source records are not approved
        // for release
        presentationsStore.flagUnapprovedSources(this.userFilteredCollection);
      }
    }

    // Set viewingSource property to false
    this.viewingSource = false;
  },

  // Reset a transform on this collection
  resetFilterTransform: function() {

    var collectionToAddTransformTo;
    var transformName = 'ViewingFilter';

    if (!this.dataSource) {
      return;
    }

    collectionToAddTransformTo = this.dataSource.getCollection(this.collectionName);

    if (!collectionToAddTransformTo || !this.dataSource.getCollection(this.collectionName).transforms[transformName]) {
      return;
    }

    // Update this store's filterTransform so the filters will be updated when a presentation changes
    this.filterTransform[this.collectionName].filters = this.dataSource.getCollection(this.collectionName).transforms[transformName][0];

    // Update the collection resulting from the transform
    this.userFilteredCollection = collectionToAddTransformTo.chain(transformName);

    // Call the presentations store's flagUnapprovedSources method to set whether any source records are not approved
    // for release
    presentationsStore.flagUnapprovedSources(this.userFilteredCollection);

    // Set viewingSource property to false
    this.viewingSource = false;

    // Send collection object out to all listeners
    this.trigger(this);
  },

  // Set a default transform to be used immediately on the store
  setDefaultTransform: function() {

    var collectionToAddTransformTo;

    this.filterTransform = {};
    this.filterTransform[this.collectionName] = {
      filters: [{
        type: 'find',
        value: {
          '$and': []
        }
      },
      {
        type: 'where',
        value: '[%lktxp]filterDates'
      }],
      sorting: {
        type: 'simplesort',
        property: '$loki',
        desc: true
      },
      dateQueries: {
        from: [],
        to: []
      }
    };

    this.setDatesTransform();

    if (!this.dataSource) {
      return;
    }

    collectionToAddTransformTo = this.dataSource.getCollection(this.collectionName);

    if (!collectionToAddTransformTo) {
      return;
    }

    this.collectionTransform = [];
    this.collectionTransform.push(this.filterTransform[this.collectionName].filters);
    this.collectionTransform.push(this.filterTransform[this.collectionName].sorting);

    collectionToAddTransformTo.setTransform('ViewingFilter', this.collectionTransform);
  },

  // Set up functionality to perform a 'where' query on selected Date filters
  setDatesTransform: function() {

    // Get name of Field with a filter type of 'gte'
    config.SourcesCollection.fields.forEach(function(filter) {
      if (filter.filter === 'gte') {
        this.fromFilterName = filter.name;
      } else if (filter.filter === 'lte') {
        this.toFilterName = filter.name;
      }
    }.bind(this));

    // Transform Params to be used in collection chain transforms
    this.params = {
      filterDates: this.filterDates
    };
  },

  // Used by the lokijs 'where' query to filter on dates in a transform
  filterDates: function (obj) {

    var validItem;
    var fromArray = this.filterTransform[this.collectionName].dateQueries.from;
    var toArray = this.filterTransform[this.collectionName].dateQueries.to;
    var fromDefaultObject = {
      includeExclude: 'include',
      value: '1800-01-01 00:00:00'
    };
    var toDefaultObject = {
      includeExclude: 'include',
      value: '3000-01-01 00:00:00'
    };
    var fromDate = obj[this.fromFilterName];
    var toDate = obj[this.toFilterName];

    // If datastore has no date filters return
    if (!this.fromFilterName) {
      return true;
    }

    if (!fromArray.length) {
      fromArray.push(fromDefaultObject);
    } else if (!toArray.length) {
      toArray.push(toDefaultObject);
    }

    // Parse invalid dates
    if (fromDate === '' || fromDate === 'TBD') {
      fromDate = fromDefaultObject.value;
    }

    if (!toDate || toDate === '' || toDate === 'TBD') {
      toDate = toDefaultObject.value;
    }

    // Sort arrays so dates are in order in each array
    fromArray = _.sortBy(fromArray, function(object) {
      return object.value;
    });

    toArray = _.sortBy(toArray, function(object) {
      return object.value;
    });

    // If more From filters than To filters
    if (fromArray.length >= toArray.length) {

      fromArray.forEach(function(fromObject, index) {

        var toObject = toArray[index];

        // If no corresponding To Date, set it to a far future date
        if (!toObject) {
          toObject = toDefaultObject;
        }

        // If the date filter is an include
        if (toObject.includeExclude === 'include') {

          if (fromDate >= fromObject.value && toDate <= toObject.value) {
            validItem = true;
          }
        } else if (toObject.includeExclude === 'exclude') {

          if (fromDate >= fromObject.value && toDate <= toObject.value) {
            validItem = true;
          }
        }
      }.bind(this));

      // Catch-all in case user adds more to filters than from filters which would be wrong anyway
    } else {

      toArray.forEach(function(toObject, index) {

        var fromObject = fromArray[index];

        // If no corresponding From Date, set it to a far past date
        if (!fromObject) {
          fromObject = fromDefaultObject;
        }

        // If the date filter is an include
        if (fromObject.includeExclude === 'include') {

          if (fromDate > fromObject.value && fromDate < toObject.value) {
            validItem = true;
          }
        } else if (fromObject.includeExclude === 'exclude') {

          if (fromDate > fromObject.value && toDate < toObject.value) {
            validItem = true;
          }
        }

      }.bind(this));
    }

    return validItem;
  },

  // Called when a user attempts to view a source file
  viewSourceFile: function(sourceObject) {

    var sourcePath = '';

    if (global.config && presentationMode === 'offline') {
      sourcePath = global.config.packagePath + '/sourcefiles/';
    } else if (global.config && presentationMode === 'online') {
      sourcePath = global.config.paths.sourcePath;
    }

    this.message = '';

    // Set selectedSourceObject property
    this.setSelectedSourceObject(sourceObject);

    // Add related items
    this.setRelatedItems();

    // Hack based around need to trigger pdf creation in pdf element so we broadcast a change to null
    // before sending out the object again.
    if (!sourceObject) {
      this.trigger(this);
      return;
    }

    // Set selectedSourceObject property
    this.setSelectedSourceFileType(sourceObject);

    // Check file exists first
    if (global.config) {

      fsExtra.stat(sourcePath + sourceObject['Linked File'], function(error) {

        if (error) {
          this.message = 'fileDoesNotExist';
          this.trigger(this);
        } else {

          // Decrypt the file if in Offline Application
          if (global.config && presentationMode === 'offline') {
            this.decryptSourceFile(sourceObject);
          } else {

            // Set viewingSource property to true
            this.viewingSource = true;

            // Send object out to all listeners
            this.trigger(this);

            // Reset viewingSource property to false
            this.viewingSource = false;
          }
        }
      }.bind(this));
    } else {

      // Set viewingSource property to true
      this.viewingSource = true;

      // Send object out to all listeners
      this.trigger(this);

      // Reset viewingSource property to false
      this.viewingSource = false;
    }
  },

  // Set a property on this store object to indicate current selected source object
  setSelectedSourceObject: function(sourceObject) {
    this.selectedSourceObject = sourceObject;
  },

  // Set a property on this store object to indicate the type of file
  setSelectedSourceFileType: function(sourceObject) {

    var filePath = sourceObject['Linked File'];
    var fileExtension = filePath.substr(filePath.lastIndexOf('.') + 1);

    switch (fileExtension) {
      case 'pdf':
        this.selectedSourceRoute = 'pdf';
        this.selectedSourceFileType = 'pdf';
        break;
      case 'jpg':
        this.selectedSourceRoute = 'image';
        this.selectedSourceFileType = 'image';
        break;
      case 'jpeg':
        this.selectedSourceRoute = 'image';
        this.selectedSourceFileType = 'image';
        break;
      case 'gif':
        this.selectedSourceRoute = 'image';
        this.selectedSourceFileType = 'image';
        break;
      case 'png':
        this.selectedSourceRoute = 'image';
        this.selectedSourceFileType = 'image';
        break;
      case 'm4a':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'audio';
        break;
      case 'mp3':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'audio';
        break;
      case 'wav':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'audio';
        break;
      case 'avi':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'video';
        break;
      case 'mp4':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'video';
        break;
      case 'mov':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'video';
        break;
      case 'webm':
        this.selectedSourceRoute = 'media';
        this.selectedSourceFileType = 'video';
        break;
      case 'tif':
        this.selectedSourceRoute = 'tiff';
        this.selectedSourceFileType = 'tiff';
        break;
      case 'tiff':
        this.selectedSourceRoute = 'tiff';
        this.selectedSourceFileType = 'tiff';
        break;
      default:
        this.message = 'invalidFileType';
        console.warn(fileExtension + 'not a supported type');
    }
  },

  // Decrypt the selected source file
  decryptSourceFile: function(sourceObject) {

    // Input file
    var readStream = fsExtra.createReadStream(global.config.packagePath + '/sourcefiles/' + sourceObject['Linked File']);

    // Decrypt content
    var decrypt = crypto.createDecipher('aes-256-ctr', importPackageStore.packagePassword);

    // Start pipe
    getRawBody(readStream.pipe(decrypt))
      .then(function (buffer) {

        this.setBlob(buffer);

        // Set viewingSource property to true
        this.viewingSource = true;

        // Send object out to all listeners
        this.trigger(this);

        // Reset viewingSource property to false
        this.viewingSource = false;

      }.bind(this))
      .catch(function (err) {
        console.log('Error decrypting ' + sourceObject['Linked File'] + err);
      });
  },

  // Set the blob property depending on the media type
  setBlob: function(buffer) {

    var filePath = this.selectedSourceObject['Linked File'];
    var fileExtension = filePath.substr(filePath.lastIndexOf('.') + 1);

    switch (fileExtension) {
      case 'pdf':
        this.selectedSourceObject.blob = 'data:application/pdf;base64,' + buffer.toString('base64');
        break;
      case 'jpg':
        this.selectedSourceObject.blob = 'data:image/jpg;base64,' + buffer.toString('base64');
        break;
      case 'jpeg':
        this.selectedSourceObject.blob = 'data:image/jpg;base64,' + buffer.toString('base64');
        break;
      case 'gif':
        this.selectedSourceObject.blob = 'data:image/gif;base64,' + buffer.toString('base64');
        break;
      case 'png':
        this.selectedSourceObject.blob = 'data:image/png;base64,' + buffer.toString('base64');
        break;
      case 'm4a':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'mp3':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'wav':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'avi':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'mp4':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'mov':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'webm':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'tif':
        this.selectedSourceObject.blob = buffer;
        break;
      case 'tiff':
        this.selectedSourceObject.blob = buffer;
        break;
      default:
        console.warn(fileExtension + 'not a supported type');
    }
  },

  // Set related items property
  setRelatedItems: function() {

    var relatedItemsArray = [];
    var relatedItemsShortNames;
    var relatedItems = this.selectedSourceObject ? this.selectedSourceObject['Related items'] : undefined;

    // Create array of Related items
    if (relatedItems) {

      relatedItemsShortNames = relatedItems.split(',');

      // Iterate through related item statements
      relatedItemsShortNames.forEach(function(relatedItem) {

        var trimmedItem = relatedItem.trim();

        if (this.findRelatedItems(trimmedItem)) {
          relatedItemsArray.push(this.findRelatedItems(trimmedItem));
        }

      }.bind(this));
    }

    if (this.selectedSourceObject) {
      this.selectedSourceObject.relatedItems = relatedItemsArray;
    }
  },

  // Find related items to the relatedItems array property of the relatedItemObject
  findRelatedItems: function(relatedItem) {

    var relatedItemCollection = dataSourceStore.dataSource.getCollection(relatedItemCollectionName);

    return relatedItemCollection.find({
      'Short Name': {
        '$eq': relatedItem
      }
    })[0];
  },

  // If user logs out cleanup state on this store
  userStoreChanged: function(user) {

    if (user.status === 'loggedout') {
      this.selectedSourceObject = null;
      this.trigger(this);
    }
  }
});
