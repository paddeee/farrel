'use strict';

var Reflux = require('reflux');
var dataSourceStore = require('../stores/dataSource.js');
var filterStateStore = require('../stores/filterState.js');

module.exports = Reflux.createStore({

  // Name to use for this collection
  collectionName: 'Places',

  // Data storage for all collections
  dataSource: null,

  // Default state object on application load
  filterState: {
    Places: {
      name: '',
      type: ''
    }
  },

  // The filtered places object
  filteredEvents: null,

  // The Loki collection transform array
  collectionTransform: [],

  // Called on Store initialistion
  init: function() {

    // Register dataSourceStores's changes
    this.listenTo(dataSourceStore, this.dataSourceChanged);

    // Register filterStateStore's changes
    this.listenTo(filterStateStore, this.filterStateChanged);
  },

  // Set the filteredData Object
  dataSourceChanged: function (dataSource) {

    this.dataSource = dataSource;

    // Call when the source data is updated
    this.filterStateChanged(this.filterState);
  },

  // Set search filter on our collectionTransform
  filterStateChanged: function(filterStateObject) {

    this.filterState.Places = filterStateObject.Places;

    if (!this.dataSource) {
      return;
    }

    var collectionToAddTransformTo = this.dataSource.getCollection(this.collectionName);
    var filterTransformObject = this.createTransformObject(this.filterState.Places);

    // Add filter to the transform
    this.collectionTransform = []; // ToDo push transform if new, replace if not
    this.collectionTransform.push(filterTransformObject);

    // Save the transform to the collection
    if (collectionToAddTransformTo.chain('PaddyFilter')) {
      collectionToAddTransformTo.setTransform('PaddyFilter', this.collectionTransform);
    } else {
      collectionToAddTransformTo.addTransform('PaddyFilter', this.collectionTransform);
    }

    this.filteredEvents = collectionToAddTransformTo.chain('PaddyFilter').data();

    // Send object out to all listeners
    this.trigger(this.filteredEvents);
  },

  // Create a filter transform object from a filter Object
  createTransformObject: function(filterTransformObject) {

    return {
      type: 'find',
      value: {
        'name': {
          '$regex' : new RegExp(filterTransformObject.name, 'i')
        },
        'type': {
          '$regex' : new RegExp(filterTransformObject.type, 'i')
        }
      }
    };
  }
});
