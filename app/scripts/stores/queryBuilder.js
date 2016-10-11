'use strict';

var Reflux = require('reflux');
var QueryBuilderActions = require('../actions/queryBuilder.js');
var dataSourceStore = require('../stores/dataSource.js');
var presentationsStore = require('../stores/presentations.js');
var importPackageStore = require('../stores/importPackage.js');
var config = appMode === 'app' ? global.config : require('../config/config.js');
var queriesCollection = 'Queries';

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in QueryBuilderActions, using onKeyname (or keyname) as callbacks
  listenables: [QueryBuilderActions],

  packageName: 'ViewingFilter',

  // Called on Store initialisation
  init: function() {

    // Register importPackageStore's changes
    this.listenTo(importPackageStore, this.importPackageChanged);

    // Register dataSourceStores's changes
    this.listenTo(dataSourceStore, this.dataSourceChanged);

    // Register presentationStore changes
    this.listenTo(presentationsStore, this.presentationsChanged);

    // Used to prevent Checkboxes being displayed when none of the filters have values
    this.filtersWithValues = [];

    // Does the Query contain any events filters with values set by the user
    this.containsEvents = false;
  },

  // Set the filteredData Object
  dataSourceChanged: function (dataSourceStore) {

    var queryCollection;

    if (dataSourceStore.dataSource.message.type === 'packageImported' || dataSourceStore.message === 'presentationSaved') {
      return;
    }

    queryCollection = dataSourceStore.dataSource.getCollection(queriesCollection);

    if (dataSourceStore.dataSource.message.type === 'dataBaseLoaded') {

      if (!queryCollection) {
        dataSourceStore.dataSource.addCollection(queriesCollection, { disableChangesApi: false });
      }

      this.createDefaultQuery('defaultQueryAdded');
    }
  },

  // Add the images as blobs on the person's profile Object
  importPackageChanged: function (importPackageStore) {

    if (importPackageStore.message === 'importSuccess') {

      // Can set config object now
      config = global.config;

      this.createDefaultQuery('importSuccess');
    }
  },

  // Reset filters and selections
  presentationsChanged: function(presentationsStore) {

    var action;

    if (presentationsStore.lastAction === 'dataSourceChanged') {
      action = 'defaultQueryAdded';
    } else if (presentationsStore.lastAction === 'presentationStateChanged') {
      action = 'creatingSelected';
    } else {
      return;
    }

    if (presentationsStore.presentationState === 'creating') {
      this.packageName = 'ViewingFilter';
      this.resetFiltersWithValues();
      this.createDefaultQuery(action);
    }
  },

  // When a presentation is saved
  presentationSaved: function(presentationObject) {

    var queryObjectToSave;

    this.queryObject.packageName = this.packageName;
    this.packageName = presentationObject.presentationName;

    // If this presentation is a new one
    if (presentationObject.presentationState === 'creating') {
      queryObjectToSave = this.cloneDocument(this.queryObject, true);
      this.insertQueryObject(queryObjectToSave);
    } else if (presentationObject.presentationState === 'editing') {
      queryObjectToSave = this.cloneDocument(this.queryObject, false);
      this.updateQueryObject(queryObjectToSave);
    }
  },

  presentationDeleted: function(presentationObject) {
    this.queryObject.packageName = presentationObject.presentationName;
  },

  // Triggered when a package is chosen to be viewed or edited
  packageSelected: function (packageName) {
    this.packageName = packageName;
    this.getQuery();

    // Add each filter into the filterWithValues Array
    this.queryObject.filters.forEach(function(filterObject) {
      this.addFilterWithValues(filterObject);
    }.bind(this));
  },

  // Create a default query object
  createDefaultQuery: function(action) {

    var queryObjectToClone;

    this.queryObject = {
      packageName: this.packageName,
      globalSearchValue: '',
      filters: [{
        filter: 'global',
        value: ''
      }]
    };

    queryObjectToClone = this.cloneDocument(this.queryObject, false);

    this.insertQueryObject(queryObjectToClone);

    this.message = {
      type: action
    };

    if (action !== 'importSuccess') {
      this.trigger(this);
    }
  },

  // Retrieve a query based on the transform name
  getQuery: function() {

    var queryCollection = dataSourceStore.dataSource.getCollection(queriesCollection);

    var queryObject = queryCollection.find({
      packageName: this.packageName
    })[0];

    this.queryObject = this.cloneDocument(queryObject, false);

    this.message = {
      type: 'packageSelected'
    };

    this.trigger(this);
  },

  // Insert query object into collection
  insertQueryObject: function(queryObject) {

    var queryCollection = dataSourceStore.dataSource.getCollection(queriesCollection);

    // Insert queryObject for this filter if it doesn't already exist
    if (queryCollection && queryCollection.find({ packageName: this.packageName }).length === 0) {
      queryCollection.insert(queryObject);
    }
  },

  // Update query object in collection
  updateQueryObject: function(queryObject) {

    var queryCollection = dataSourceStore.dataSource.getCollection(queriesCollection);

    queryCollection.update(queryObject);
  },

  // Deep Clone Query Object and remove $loki property
  cloneDocument: function(queryObject, removeLoki) {

    var queryObjectToClone = _.cloneDeep(queryObject);
    queryObjectToClone.packageName = this.packageName;

    if (removeLoki) {
      delete queryObjectToClone.$loki;
    }

    return queryObjectToClone;
  },

  queryFiltersChanged: function(arg, action) {

    var broadcastMessage = '';

    // If the filters have changed as a result of a package being selected send a different message to hook on to
    if (this.message.type === 'packageSelected') {
      broadcastMessage = 'PackageSelected';
    }

    if (action === 'add') {
      this.queryObject.filters.push(arg);

      this.manageFiltersWithValues(arg, 'update');

      this.message = {
        type: 'queryAdded' + broadcastMessage
      };
    } else if (action === 'remove') {

      this.queryObject.filters = this.queryObject.filters.filter(function(filterObject) {

        if (filterObject.filter === 'global') {
          return true;
        }

        if (arg.fieldName === filterObject.fieldName && arg.value === filterObject.value) {
          return false;
        }

        return true;
      }.bind(this));

      this.manageFiltersWithValues(arg, 'remove');

      this.message = {
        type: 'queryUpdated' + broadcastMessage
      };
    } else if (action === 'update') {

      this.manageFiltersWithValues(arg, 'update');

      this.message = {
        type: 'queryUpdated' + broadcastMessage
      };
    }

    this.trigger(this);
  },

  // Used to prevent Checkboxes being displayed when none of the filters have values
  manageFiltersWithValues: function(filter, action) {

    if (action === 'add') {
      this.addFilterWithValues(filter);
    } else if (action === 'update') {
      this.updateFilterWithValues(filter);
    } else if (action === 'remove') {
      this.removeFilterWithValues(filter);
    }

    this.manageContainsEventFilters();
  },

  // Update global filter value
  updateGlobalFilter: function(globalFilter) {

    this.queryObject.filters[0].value = globalFilter.value;

    if (globalFilter.value === '') {
      this.removeFilterWithValues(globalFilter);
    } else {
      this.addFilterWithValues(globalFilter);
    }
  },

  // See whether to add an object to filtersWithValues
  addFilterWithValues: function(filterToAdd) {

    var filterExists;

    // Check to see if filter already exists
    this.filtersWithValues.forEach(function(filterObject) {

      if (filterToAdd.filter === 'global' && filterObject.filter === 'global') {
        filterExists = true;
        return;
      }

      if (filterToAdd.fieldName === filterObject.fieldName && filterToAdd.value === filterObject.value) {
        filterExists = true;
      }
    }.bind(this));

    if (!filterExists && filterToAdd.value !== '') {
      this.filtersWithValues.push(filterToAdd);
    }
  },

  // See whether to remove an object from filtersWithValues
  updateFilterWithValues: function(updatedFilter) {

    if (updatedFilter.filter === 'global') {
      this.updateGlobalFilter(updatedFilter);
      return;
    }

    if (updatedFilter.value === '') {
      this.removeFilterWithValues(updatedFilter);
    } else {
      this.addFilterWithValues(updatedFilter);
    }
  },

  // Remove an object from filtersWithValues
  removeFilterWithValues: function(filterToRemove) {

    var tempFilterWithValues;

    tempFilterWithValues = this.filtersWithValues.filter(function(filterObject) {

      if (filterToRemove.filter === 'global' && filterToRemove.filter === filterObject.filter) {
        if (filterToRemove.value === '') {
          return false;
        } else {
          return true;
        }
      }

      if (filterToRemove.fieldName === filterObject.fieldName && filterToRemove.value === filterObject.value) {
        return false;
      }

      return true;
    }.bind(this));

    this.filtersWithValues = tempFilterWithValues;
  },

  // Reset filtersWithValues
  resetFiltersWithValues: function() {

    this.filtersWithValues = [];

    this.manageContainsEventFilters();
  },

  // Manage property to indicate if there are any event filters. Because if not, the application shouldn't select all
  // event checkboxes if a filter is added to a different data type. Otherwise a filter on people will select all
  // events which will select more people which would be confusing to user.
  manageContainsEventFilters: function() {

    var containsEvents = false;

    this.filtersWithValues.forEach(function() {
      containsEvents = true;
    });

    this.containsEvents = containsEvents;
  }
});
