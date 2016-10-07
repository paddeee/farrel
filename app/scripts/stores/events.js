'use strict';

var Reflux = require('reflux');
var dataSourceStore = require('../stores/dataSource.js');
var config = appMode === 'app' ? global.config : require('../config/config.js');
var presentationsStore = require('../stores/presentations.js');
var importPackageStore = require('../stores/importPackage.js');

module.exports = Reflux.createStore({

  // Data storage for all collections
  dataSource: null,

  // The Loki collection transform array
  collectionTransform: [],

  // Called on Store initialisation
  init: function() {

    if (!presentationMode || presentationMode === 'online') {
      this.collectionName = config.EventsCollection.name;
      this.setDefaultTransform();
    }

    // Register importPackageStore's changes
    this.listenTo(importPackageStore, this.importPackageChanged);

    // Register dataSourceStores's changes
    this.listenTo(dataSourceStore, this.dataSourceChanged);

    this.listenTo(presentationsStore, this.presentationsStoreChanged);
  },

  // Set the filteredData Object
  dataSourceChanged: function (dataSourceStore) {

    this.dataSource = dataSourceStore.dataSource;

    if (presentationMode && presentationMode === 'offline') {
      return;
    }

    this.setDefaultTransform();

    // Call when the source data is updated
    this.createFilterTransform(this.filterTransform, dataSourceStore.message);
  },

  // Add the images as blobs on the person's profile Object
  importPackageChanged: function (importPackageStore) {

    if (importPackageStore.message === 'importSuccess') {

      // Can set config object now
      config = global.config;

      this.collectionName = config.EventsCollection.name;

      this.setDefaultTransform();

      // Call when the source data is updated
      this.createFilterTransform(this.filterTransform, dataSourceStore.message);
    }
  },

  // Set search filter on our collectionTransform
  filterStateChanged: function(filterTransformBroadcast) {

    this.setDatesTransform();
    this.setParams();

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

    } else {

      if (message !== 'presentationSaved') {
        this.userFilteredCollection = collectionToAddTransformTo.chain().copy();
      }
    }
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

    // Send collection object out to all listeners
    this.trigger(this.userFilteredCollection.data());
  },

  // When a collection is filtered, the removed records need to be set to not selected.
  // Otherwise, any records in the other data types will still be selected even though the record which made
  // them selected has been filtered out
  setFilteredOutItemsToNotSelected: function(eventsCollection, filteredEventsCollection) {
    _.difference(eventsCollection, filteredEventsCollection).forEach(function(eventObject) {
      eventObject.showRecord = false;
    });
  },

  // Set a default transform to be used immediately on the store
  setDefaultTransform: function() {

    var collectionToAddTransformTo;

    this.filterTransform = {};

    this.filterTransform[this.collectionName] = {
      filters: [
      {
        type: 'where',
        value: '[%lktxp]globalQuery'
      },
      {
        type: 'where',
        value: '[%lktxp]filterQueries'
      },
      {
      type: 'where',
      value: '[%lktxp]filterDates'
      }],
      sorting: {
        type: 'simplesort',
        property: '$loki',
        desc: false
      },
      globalQuery: [],
      filterQueries: [],
      dateQueries: {
        from: [],
        to: []
      }
    };

    this.setDatesTransform();
    this.setParams();

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
    config.EventsCollection.fields.forEach(function(filter) {
      if (filter.filter === 'gte') {
        this.fromFilterName = filter.name;
      } else if (filter.filter === 'lte') {
        this.toFilterName = filter.name;
      }
    }.bind(this));

    // Transform Params to be used in collection chain transforms
    this.setParams();
  },

  // Set up params for transform
  setParams: function() {

    // Transform Params to be used in collection chain transforms
    this.params = {
      globalQuery: this.globalQuery,
      filterQueries: this.filterQueries,
      filterDates: this.filterDates
    };
  },

  // Create a loki 'where' query based on global search term selected by user
  globalQuery: function(obj) {

    var globalQueryArray = this.filterTransform[this.collectionName].globalQuery;
    var globalQuery = '';
    var or = '';

    if (!globalQueryArray.length) {
      return true;
    }

    _.keys(obj).forEach(function(key) {

      config.EventsCollection.fields.forEach(function(field, index) {

        if (index > 0) {
          or = ' || ';
        }

        if (field.name === key && field.display === 'true') {

          // If the field is empty in database
          if (!obj[field.name]) {
            globalQuery =  globalQuery + or + 'false';
            return;
          }

          globalQuery = globalQuery + or + !!obj[field.name].match(globalQueryArray[0].$regex);
        }
      });
    });

    // ToDo: Eval is evil and all that. However, I don't know of a better way to dynamically create an if statement.
    // Change if there is a way to do this without eval.
    if (eval(globalQuery)) {
      return true;
    }
  },

  // Create a loki 'where' query based on filters selected by user
  filterQueries: function(obj) {

    var filterQueriesArray = this.filterTransform[this.collectionName].filterQueries;
    var queryConditions = '';
    var queryOperator = '';
    var openMainGroup = '';
    var closeMainGroup = '';

    // If no filters
    if (!filterQueriesArray.length) {
      return true;
    }

    filterQueriesArray.forEach(function(filterQuery, index) {

      if (index > 0) {

        if (filterQuery.andOrNot === 'and' || filterQuery.andOrNot === 'not') {
          queryOperator = '&&';
        } else if (filterQuery.andOrNot === 'or') {
          queryOperator = '||';
        }

        if (index === filterQueriesArray.length - 2) {
          openMainGroup = '(';
          closeMainGroup = ')';
        }
      }

      // If the field is empty in database
      if (!obj[filterQuery.fieldName]) {
        queryConditions =  false;
        return;
      }

      queryConditions = openMainGroup + queryConditions + queryOperator + !!obj[filterQuery.fieldName].match(filterQuery.$regex) + closeMainGroup;
    });

    // ToDo: Eval is evil and all that. However, I don't know of a better way to dynamically create an if statement.
    // Change if there is a way to do this without eval.
    if (eval(queryConditions)) {
      return true;
    }

    return false;
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
  }
});
