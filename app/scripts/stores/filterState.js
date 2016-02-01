'use strict';

var Reflux = require('reflux');
var config = require('../config/config.js');
var filterTransforms = require('../config/filterTransforms.js');
var FilterStateActions = require('../actions/filterState.js');
var dataSourceStore = require('../stores/dataSource.js');
var eventsStore = require('../stores/events.js');
var placesStore = require('../stores/places.js');
var peopleStore = require('../stores/people.js');
var sourcesStore = require('../stores/source.js');
var uniq = require('lodash/array/uniq');

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in FilterStateActions,
  // using onKeyname (or keyname) as callbacks
  listenables: [FilterStateActions],

  init: function() {
    this.transformName = 'ViewingFilter';

    // Register dataSourceStores's changes
    this.listenTo(dataSourceStore, this.dataSourceChanged);
  },

  // Set the filteredData Object
  dataSourceChanged: function () {

    // When the userFilteredCollection has been created on each data store, we can call the autoFilterCollections
    // method
    this.autoFilterCollections();
  },

  // Set search filter on our collectionTransform
  searchFilterChanged: function(searchFilterObject) {

    this.updateFilteredData(searchFilterObject);

    // Manage the filter transform name in this store and listening collection
    // stores can use it when broadcasted
    filterTransforms.transformName = this.transformName;

    // Call filterStateChanged on each data store
    eventsStore.filterStateChanged(filterTransforms);
    placesStore.filterStateChanged(filterTransforms);
    peopleStore.filterStateChanged(filterTransforms);
    sourcesStore.filterStateChanged(filterTransforms);

    // When the userFilteredCollection has been created on each data store, we can call the autoFilterCollections
    // method
    this.autoFilterCollections();

    console.log(eventsStore.userFilteredCollection);
    console.log(placesStore.userFilteredCollection);
    console.log(peopleStore.userFilteredCollection);
    console.log(sourcesStore.userFilteredCollection);
  },

  // Set simpleSort on our collectionTransform
  sortingChanged: function(sortingObject) {

    this.updateSortedData(sortingObject);

    // Manage the filter transform name in this store and listening collection
    // stores can use it when broadcasted
    filterTransforms.transformName = this.transformName;

    // Call filterStateChanged on each data store
    eventsStore.filterStateChanged(filterTransforms);
    placesStore.filterStateChanged(filterTransforms);
    peopleStore.filterStateChanged(filterTransforms);
    sourcesStore.filterStateChanged(filterTransforms);

    // When the userFilteredCollection has been created on each data store, we can call the autoFilterCollections
    // method
    this.autoFilterCollections();
  },

  // Update showRecord property of collections
  checkBoxesUpdated: function(showRecordObject) {

    switch(showRecordObject.collectionName) {
      case config.EventsCollection:

        // Start process of updating related data tables
        this.eventsCheckBoxesUpdated(showRecordObject.collectionData);

        // Set property on the events store so the show All checkbox state will be maintained
        eventsStore.showAllSelected = showRecordObject.showAllSelected;

        break;
      case config.PlacesCollection:

        console.log('Places Records Checkbox Changed');

        // Set property on the events store so the show All checkbox state will be maintained
        placesStore.showAllSelected = showRecordObject.showAllSelected;

        break;
      case config.PeopleCollection:

        console.log('People Records Checkbox Changed');

        // Set property on the events store so the show All checkbox state will be maintained
        peopleStore.showAllSelected = showRecordObject.showAllSelected;

        break;
      case config.SourcesCollection:

        console.log('Sources Records Checkbox Changed');

        // Set property on the events store so the show All checkbox state will be maintained
        sourcesStore.showAllSelected = showRecordObject.showAllSelected;

        break;
      default:
        return;
    }
  },

  // Update filtered data based on the collection
  // ToDo: Need to make this dynamic based on passed in fields
  updateFilteredData: function(searchFilterObject) {

      switch (searchFilterObject.collectionName) {
        case config.EventsCollection:
          filterTransforms[config.EventsCollection].filters = this.createFilterObject(searchFilterObject);
          break;
        case config.PlacesCollection:
          filterTransforms[config.PlacesCollection].filters = this.createFilterObject(searchFilterObject);
          break;
        case config.PeopleCollection:
          filterTransforms[config.PeopleCollection].filters = this.createFilterObject(searchFilterObject);
          break;
        case config.SourcesCollection:
          filterTransforms[config.SourcesCollection].filters = this.createFilterObject(searchFilterObject);
          break;
        default:
          console.error('No collection Name');
      }
  },

  // Update sorted data based on the collection
  // ToDo: Need to make this dynamic based on passed in fields
  updateSortedData: function(sortingObject) {

    switch (sortingObject.collectionName) {
      case config.EventsCollection:
        filterTransforms[config.EventsCollection].sorting = this.createSortingObject(sortingObject);
        break;
      case config.PlacesCollection:
        filterTransforms[config.PlacesCollection].sorting = this.createSortingObject(sortingObject);
        break;
      case config.PeopleCollection:
        filterTransforms[config.PeopleCollection].sorting = this.createSortingObject(sortingObject);
        break;
      case config.SourcesCollection:
        filterTransforms[config.SourcesCollection].sorting = this.createSortingObject(sortingObject);
        break;
      default:
        console.error('No collection Name');
    }
  },

  // Create a filter transform object from a filter Object
  createFilterObject: function(searchFilterObject) {

    var transform = {
      type: 'find',
      value: {
        $and: []
      }
    };

    searchFilterObject.fields.forEach(function (field) {

      var fieldObject = {};
      var queryObject = {};

      if (field.queryType !== 'regex') {
        queryObject[field.queryType] = field.value;
      } else {
        queryObject.$regex = [field.value, 'i'];
      }

      fieldObject[field.name] = queryObject;

      transform.value.$and.push(fieldObject);
    });

    return transform;
  },

  // Create a sorting transform object from a sorting Object
  createSortingObject: function(sortingObject) {

    var transform = {
      type: 'simplesort',
      property: sortingObject.fieldName,
      desc: sortingObject.desc
    };

    return transform;
  },

  // Triggered when a package is chosen to be viewed or edited
  packageSelected: function(presentationName) {

    // Call filterStateChanged on each data store
    eventsStore.filterStateChanged(presentationName);
    placesStore.filterStateChanged(presentationName);
    peopleStore.filterStateChanged(presentationName);
    sourcesStore.filterStateChanged(presentationName);
  },

  // Filter on datastore userFilteredCollections based on linkage rules between tables
  autoFilterCollections: function() {

    // Example of filtering on a branched subset of data
    //console.log(eventsStore.userFilteredCollection.find({'Full Name':{'$contains': ['M']}}).data());

    // ToDo:
    // Parse collections to filter down other collections. For now, just assigning to each datastore's
    // filteredCollection data
    eventsStore.filteredCollection = eventsStore.userFilteredCollection;
    placesStore.filteredCollection = placesStore.userFilteredCollection;
    peopleStore.filteredCollection = peopleStore.userFilteredCollection;
    sourcesStore.filteredCollection = sourcesStore.userFilteredCollection;

    // Pass data onto views
    eventsStore.trigger(eventsStore.filteredCollection.data());
    placesStore.trigger(placesStore.filteredCollection.data());
    peopleStore.trigger(peopleStore.filteredCollection.data());
    sourcesStore.trigger(sourcesStore);

    this.message = {
      type: 'filteredCollectionsUpdated'
    };

    this.trigger(this);
  },

  // Parse the 'Place' field of each events record to build up an array of all places associated with events
  // in order to automatically select related records in Places, People and Sources collections
  eventsCheckBoxesUpdated: function(eventsCollectionData) {

    var placeArray = [];

    eventsCollectionData.forEach(function(event) {

      // If checkbox is selected
      if (event.showRecord) {
        placeArray.push(event.Place);
      }
    });

    this.autoUpdatePlacesCheckboxes(uniq(placeArray));
  },

  // Iterate through each record in Places collection and set showRecord to true and disableCheckbox to true
  autoUpdatePlacesCheckboxes: function(placeArray) {

    placeArray.forEach(function(place) {
      placesStore.filteredCollection.copy().find({
        'Short Name': {
          '$eq' : place
        }
      }).update(function(placeObject) {
        placeObject.showRecord = true;
        placeObject.disabled = true;
        console.log(placeObject);
      });
    });
    console.log(placesStore.filteredCollection);
  }
});
