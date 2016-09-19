'use strict';

var Reflux = require('reflux');
var FilterStateActions = require('../actions/filterState.js');
var dataSourceStore = require('../stores/dataSource.js');
var eventsStore = require('../stores/events.js');
var placesStore = require('../stores/places.js');
var peopleStore = require('../stores/people.js');
var sourcesStore = require('../stores/source.js');
var queryBuilderStore = require('../stores/queryBuilder.js');
var importPackageStore = require('../stores/importPackage.js');

var eventsName = 'Event';
var placesName = 'Place';
var peopleName = 'Person';
var sourcesName = 'Document';

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in FilterStateActions,
  // using onKeyname (or keyname) as callbacks
  listenables: [FilterStateActions],

  init: function () {

    this.transformName = 'ViewingFilter';

    // Arrays to keep track of selected related documents in each data store
    this.selectedEventDocuments = [];
    this.selectedPeopleDocuments = [];
    this.selectedPlaceDocuments = [];

    // Initialise filterTransforms object
    this.filterTransforms = {};

    // Register importPackageStore's changes
    this.listenTo(importPackageStore, this.importPackageChanged);

    // Register queryBuilderStores's changes
    this.listenTo(queryBuilderStore, this.queryBuilderChanged);

    // Register dataSourceStores's changes
    this.listenTo(dataSourceStore, this.dataSourceChanged);
  },

  // Set search filter on our collectionTransform
  queryBuilderChanged: function (queryBuilderStore) {

    this.convertQueryObjectToFilterTransform(queryBuilderStore.queryObject.filters);

    // If A Package has just been chosen we don't want to select all or deselect all checkboxes
    if (queryBuilderStore.message.type === 'packageSelected') {
      this.resetSelectedSources();
      this.selectSelectedRecords(queryBuilderStore.packageName);
      this.autoFilterCollections(false, true, true);
    } else if (queryBuilderStore.message.type === 'queryUpdatedPackageSelected') {
      this.autoFilterCollections(false, true, true);
    } else if (queryBuilderStore.message.type === 'queryUpdated') {
      this.autoFilterCollections(true, true, true);
    } else if (queryBuilderStore.message.type === 'creatingSelected') {
      this.resetSelectedSources();
      this.resetShowFilterProperties();
      this.autoFilterCollections(true, false, false);
    }
  },

  // Set the filteredData Object
  dataSourceChanged: function (dataSourceBroadcast) {

    // Don't do this on load or import or when presentation saved
    if (dataSourceBroadcast.dataSource.message.type !== 'collectionImported' && dataSourceBroadcast.message !== 'presentationSaved') {

      // When the userFilteredCollection has been created on each data store, we can call the autoFilterCollections
      // method
      this.autoFilterCollections(false, false);
    }
  },

  // Add the images as blobs on the person's profile Object
  importPackageChanged: function (importPackageStore) {

    if (importPackageStore.message === 'importSuccess') {

      // When the userFilteredCollection has been created on each data store, we can call the autoFilterCollections
      // method
      this.autoFilterCollections(false, false);
    }
  },

  // Set simpleSort on our collectionTransform
  sortingChanged: function (sortingObject) {

    this.updateSortedData(sortingObject);

    // When the userFilteredCollection has been created on each data store, we can call the autoFilterCollections
    // method
    this.autoFilterCollections(false, false, false, true);
  },

  // Convert a queryBuilder object into one that can be used by loki to apply a transform on the data
  convertQueryObjectToFilterTransform: function(filters) {

    var eventsTransform = eventsStore.filterTransform[eventsName];

    // Reset transform filters array and date arrays
    eventsTransform.filterQueries = [];
    eventsTransform.dateQueries.from = [];
    eventsTransform.dateQueries.to = [];

    filters.forEach(function (field) {

      // If the field is an input or a select box
      if (field.filter === 'regex' || field.filter === 'select') {
        this.setQueriesArray(eventsTransform, field);

        // If field is a date
      } else if (field.filter === 'lte' || field.filter === 'gte') {
        this.setDateArrays(eventsTransform, field);
      }
    }.bind(this));
  },

  // Populate and set a loki transform
  setQueriesArray: function(transformObject, field) {

    // If date is populated
    if (field.value) {

      // Perform partial search on text input and full word search on select drop down
      if (field.filter === 'regex') {
        if (field.andOrNot === 'and' || field.andOrNot === 'or') {
          field.$regex = new RegExp('^(.*' + field.value + ')', 'i');
        } else if (field.andOrNot === 'not') {
          field.$regex = new RegExp('^(?!.*' + field.value + ')', 'i');
        }
      } else if (field.filter === 'select') {
        if (field.andOrNot === 'and' || field.andOrNot === 'or') {
          field.$regex = new RegExp('^(.*\\b' + field.value + '\\b)', 'i');
        } else if (field.andOrNot === 'not') {
          field.$regex = new RegExp('^(?!.*\\b' + field.value + '\\b)', 'i');
        }
      }

      transformObject.filterQueries.push(field);
    }
  },

  // Populate and set a loki transform
  setDateArrays: function(transformObject, field) {

      // If date is populated
      if (field.value) {

        if (field.includeExclude === 'include') {

          if (field.filter === 'gte') {
            transformObject.dateQueries.from.push(field);
          } else if (field.filter === 'lte') {
            transformObject.dateQueries.to.push(field);
          }
        } else if (field.includeExclude === 'exclude') {

          if (field.filter === 'gte') {
            transformObject.dateQueries.to.push(field);
          } else if (field.filter === 'lte') {
            transformObject.dateQueries.from.push(field);
          }
        }
      }
  },

  // Update sorted data based on the collection
  // ToDo: Need to make this dynamic based on passed in fields
  updateSortedData: function (sortingObject) {

    // Set blank transform objects for each data type
    var eventsTransform = eventsStore.filterTransform[eventsName];
    var placesTransform = placesStore.filterTransform[placesName];
    var peopleTransform = peopleStore.filterTransform[peopleName];
    var sourcesTransform = sourcesStore.filterTransform[sourcesName];

    switch (sortingObject.collectionName) {
      case eventsName:
        eventsTransform.sorting = this.createSortingObject(sortingObject);
        break;
      case placesName:
        placesTransform.sorting = this.createSortingObject(sortingObject);
        break;
      case peopleName:
        peopleTransform.sorting = this.createSortingObject(sortingObject);
        break;
      case sourcesName:
        sourcesTransform.sorting = this.createSortingObject(sortingObject);
        break;
      default:
        console.error('No collection Name');
    }
  },

  // Create a sorting transform object from a sorting Object
  createSortingObject: function (sortingObject) {

    var transform = {
      type: 'simplesort',
      property: sortingObject.fieldName,
      desc: sortingObject.desc
    };

    return transform;
  },

  // Triggered when a package is chosen to be viewed or edited
  packageSelected: function (presentationName) {

    // Call filterStateChanged on each data store
    eventsStore.filterStateChanged(presentationName);
    placesStore.filterStateChanged(presentationName);
    peopleStore.filterStateChanged(presentationName);
    sourcesStore.filterStateChanged(presentationName);
  },

  // Reset the arrays used by Sources to remember what Sources are selected by which records
  resetSelectedSources: function() {

    this.selectedEventDocuments = [];
    this.selectedPlaceDocuments = [];
    this.selectedPeopleDocuments = [];
  },

  // Remove showRecord and selectedByEvent properties from each record in each collection
  resetShowFilterProperties: function() {

    dataSourceStore.dataSource.collections.forEach(function (collection) {

      // Leave presentations collection which needs to remember a package's state
      if (collection.name !== 'Presentations') {

        collection.data.forEach(function(object) {

          // Need to clone an object as for some reason the object in events, places etc is same object as the one in
          // presentations collection
          var clonedObject = _.cloneDeep(object);

          clonedObject.showRecord = false;
          clonedObject.selectedByEvent = false;
          clonedObject.selectedByPlace = false;
          clonedObject.selectedByPeople = false;
          clonedObject.highlightAsRelatedToEvent = false;

          collection.update(clonedObject);
        });
      }
    });
  },

  // Filter on datastore userFilteredCollections based on linkage rules between tables
  // Event Place field links to Places Shortname field
  // Event Suspects, Victims and Witnesses fields link to People's Shortname field
  autoFilterCollections: function (selectAllCheckBoxes, sortCheckBoxes, sortEvents, sortPerformed) {

    var eventsCollection = dataSourceStore.dataSource.getCollection(eventsName);

    if (!eventsCollection || !eventsStore.userFilteredCollection) {
      return;
    }

    // Manage the filter transform name in this store and listening collection
    // stores can use it when broadcasted
    this.filterTransforms.transformName = this.transformName;

    // Call filterStateChanged on each data store to ensure each store's userFilteredCollection is up to date
    eventsStore.filterStateChanged(this.filterTransforms);
    placesStore.filterStateChanged(this.filterTransforms);
    peopleStore.filterStateChanged(this.filterTransforms);
    sourcesStore.filterStateChanged(this.filterTransforms);

    // Set all event record's 'showRecord' properties that have been filtered out, to false
    eventsStore.setFilteredOutItemsToNotSelected(eventsCollection.data, eventsStore.userFilteredCollection.data());

    // Update all Checkboxes with a value selected by the user
    if (selectAllCheckBoxes) {
      this.selectAllCheckboxes(eventsStore, true);
    }

    // Update all data types checkboxes to only show records from filtered records
    // Don't do this if called by column sorting
    if (!sortPerformed) {
      this.eventsCheckBoxUpdated(eventsCollection.data);
    }

    // Let listeners know data has been updated
    this.selectedDataChanged(sortCheckBoxes, sortEvents);
  },

  // Select all checkboxes in a store
  selectAllCheckboxes: function (store, value) {

    store.showAllSelected = value;

    // Set all records showRecord property to value
    store.userFilteredCollection.update(function (item) {
      item.showRecord = value;
    });
  },

  // When a package is selected, select the selected records for each data table
  selectSelectedRecords: function(packageName) {

    var presentationsCollection = dataSourceStore.dataSource.getCollection('Presentations');

    var eventsCollection = dataSourceStore.dataSource.getCollection(eventsName);
    var placesCollection = dataSourceStore.dataSource.getCollection(placesName);
    var peopleCollection = dataSourceStore.dataSource.getCollection(peopleName);
    var sourcesCollection = dataSourceStore.dataSource.getCollection(sourcesName);

    var presentationObject;

    if (!presentationsCollection) {
      return;
    }

    presentationObject = presentationsCollection.find({
      presentationName: packageName
    })[0];

    if (!presentationObject) {
      return;
    }

    // Reset any selected records in the data tables to showRecord false
    this.selectAllCheckboxes(eventsStore, false);

    // Add showRecord true to selected records in presentation object
    presentationObject.selectedEvents.forEach(function(selectedEvent) {
      selectedEvent.showRecord = true;
    });

    presentationObject.selectedPlaces.forEach(function(selectedPlace) {
      selectedPlace.showRecord = true;
    });

    presentationObject.selectedPeople.forEach(function(selectedPerson) {
      selectedPerson.showRecord = true;
    });

    presentationObject.selectedSources.forEach(function(selectedSource) {
      selectedSource.showRecord = true;
    });

    eventsCollection.update(presentationObject.selectedEvents);
    placesCollection.update(presentationObject.selectedPlaces);
    peopleCollection.update(presentationObject.selectedPeople);
    sourcesCollection.update(presentationObject.selectedSources);

    // Let listeners know data has been updated
    this.selectedDataChanged(true, true);
  },

  // Fired from grid view when Select all checkbox is selected
  // If Select All is ticked on People or Places update the Related Sources
  showAllSelected: function(showAllObject) {

    // Events
    if (showAllObject.collectionName === eventsName) {

      this.selectAllCheckboxes(eventsStore, showAllObject.showAllSelected);
      this.eventsCheckBoxUpdated(eventsStore.userFilteredCollection.data());

      // Places
    } else if (showAllObject.collectionName === placesName) {

      this.selectAllCheckboxes(placesStore, showAllObject.showAllSelected);

      placesStore.userFilteredCollection.data().forEach(function (placeObject) {

        // Manage the Source Collection Selected Records
        this.autoUpdateSourceCheckboxes(placeObject, placesName);
      }.bind(this));

      // People
    } else if (showAllObject.collectionName === peopleName) {

      this.selectAllCheckboxes(peopleStore, showAllObject.showAllSelected);

      peopleStore.userFilteredCollection.data().forEach(function (personObject) {

        // Manage the Source Collection Selected Records
        this.autoUpdateSourceCheckboxes(personObject, peopleName);
      }.bind(this));

      // Source
    } else if (showAllObject.collectionName === sourcesName) {

      this.selectAllCheckboxes(sourcesStore, showAllObject.showAllSelected);
    }

    // Sort the order of selected records
    this.selectedDataChanged(true, false);
  },

  // Update showRecord property of collections
  checkBoxUpdated: function (showRecordObject) {

    switch (showRecordObject.collectionName) {
      case eventsName:

        // Start process of updating related data tables
        if (showRecordObject.userSelected) {

          if (showRecordObject.checkBoxSelected) {
            showRecordObject.item.showRecord = true;
          } else {
            showRecordObject.item.showRecord = false;
          }

          this.eventsCheckBoxUpdated(showRecordObject.collectionData);
        }

        // If there has been a change to Select all, start the process of updating related data tables
        if (eventsStore.showAllSelected !== showRecordObject.showAllSelected) {
          this.eventsCheckBoxUpdated(showRecordObject.collectionData);
        }

        // Set property on the events store so the show All checkbox state will be maintained
        eventsStore.showAllSelected = showRecordObject.showAllSelected;

        // Let listeners know data has been updated
        this.selectedDataChanged(true, false);

        break;
      case placesName:

        if (showRecordObject.userSelected) {

          // Set property on the events store so the show All checkbox state will be maintained
          placesStore.showAllSelected = showRecordObject.showAllSelected;

          this.checkBoxUpdatedByUser(showRecordObject.item, showRecordObject.checkBoxSelected, placesName);
          this.selectedDataChanged(false, false);
        }

        break;
      case peopleName:

        // Set property on the events store so the show All checkbox state will be maintained
        peopleStore.showAllSelected = showRecordObject.showAllSelected;

        if (showRecordObject.userSelected) {
          this.checkBoxUpdatedByUser(showRecordObject.item, showRecordObject.checkBoxSelected, peopleName);
          this.selectedDataChanged(false, false);
        }

        break;
      case sourcesName:

        // Set property on the events store so the show All checkbox state will be maintained
        sourcesStore.showAllSelected = showRecordObject.showAllSelected;

        break;
      default:
    }
  },

  // Auto Update the Places, People and Sources selected records
  eventsCheckBoxUpdated: function (collectionData) {

    // Manage the Source Collection Selected Records that are related to Event Supporting Documents
    collectionData.forEach(function (eventObject) {
      this.autoUpdateSourceCheckboxes(eventObject, eventsName);
    }.bind(this));

    // Auto Update related Place checkboxes
    this.autoUpdatePlacesCheckboxes(collectionData);

    // Auto Update related People checkboxes
    this.autoUpdatePeopleCheckboxes(collectionData);
  },

  // When a checkbox has been manually updated
  checkBoxUpdatedByUser: function(item, checkBoxSelected, collectionName) {

    if (checkBoxSelected) {
      item.showRecord = true;
      item.userSelected = true;
    } else {
      item.showRecord = false;
      item.userSelected = false;
    }

    // Manage the Source Collection Selected Records
    this.autoUpdateSourceCheckboxes(item, collectionName);

    // Sort the order of Source records to selected
    this.sortBySelectedSourceRecords();
  },

  // Iterate through each record in Places collection and set showRecord to true and selectedByEvent to true
  autoUpdatePlacesCheckboxes: function (itemArray) {

    // Used to keep track of places in case the same place is used by an event record that isn't set to show and
    // then removes it from being set by a previous event which was set to show.
    var placeArray = [];

    itemArray.forEach(function (eventObject) {

      if (!eventObject.Place) {
        return;
      }

      // Match any shortNames inside square brackets
      var place = eventObject.Place.replace(/(^.*\[|\].*$)/g, '');

      placesStore.userFilteredCollection.copy().find({
        'Short Name': {
          '$eq': place
        }
      }).update(function (placeObject) {

        // If the event record is selected
        if (eventObject.showRecord) {
          placeArray.push(placeObject);
          placeObject.showRecord = true;
          placeObject.selectedByEvent = true;
          placeObject.highlightAsRelatedToEvent = true;
        } else {
          if (placeArray.indexOf(placeObject) === -1) {

            // Only hide record if the user hadn't manually selected it
            if (!placeObject.userSelected) {
              placeObject.showRecord = false;
            }

            placeObject.selectedByEvent = false;
            placeObject.highlightAsRelatedToEvent = false;
          }
        }

        // Manage the Source Collection Selected Records
        this.autoUpdateSourceCheckboxes(placeObject, placesName);

      }.bind(this));
    }.bind(this));
  },

  // Find each record in People collection where People matches a person in Events collection and set showRecord,
  // selectedByEvent and highlightAsRelatedToEvent properties
  autoUpdatePeopleCheckboxes: function (itemArray) {

    // Helper methods for parsing People fields
    var filterSelected = function (item) {
      return item.showRecord === true;
    };

    var filterNonSelected = function (item) {
      return item.showRecord === false;
    };

    var split = function (item) {

      var suspects = item.Suspects ? item.Suspects.split(',') : [];
      var victims = item.Victims ? item.Victims.split(',') : [];
      var witnesses = item.Witnesses? item.Witnesses.split(',') : [];

      // Match any shortNames inside square brackets
      suspects = suspects.map(function(suspect) {
        return suspect.replace(/(^.*\[|\].*$)/g, '');
      });

      victims = victims.map(function(victim) {
        return victim.replace(/(^.*\[|\].*$)/g, '');
      });

      witnesses = witnesses.map(function(witness) {
        return witness.replace(/(^.*\[|\].*$)/g, '');
      });

      return _.union(suspects, victims, witnesses);
    };

    var trim = function (item) {
      return item.trim();
    };

    // Parse People fields into single array of unique related people
    var relatedPeopleArray = _.uniq(_.map(_.flatten(_.map(_.filter(itemArray, filterSelected), split)), trim));

    // Parse People fields into single array of unique non related people
    var nonRelatedPeopleArray = _.difference(_.uniq(_.map(_.flatten(_.map(_.filter(itemArray, filterNonSelected), split)), trim)), relatedPeopleArray);

    // Update all People from the relatedPeople array to show
    relatedPeopleArray.forEach(function (person) {
      peopleStore.userFilteredCollection.copy().find({
        'Short Name': {
          '$eq': person
        }
      }).update(function (personObject) {

        personObject.showRecord = true;
        personObject.selectedByEvent = true;
        personObject.highlightAsRelatedToEvent = true;

        // Manage the Source Collection Selected Records
        this.autoUpdateSourceCheckboxes(personObject, peopleName);

      }.bind(this));
    }.bind(this));

    // Update all People from the nonRelatedPeople array to not show
    nonRelatedPeopleArray.forEach(function (person) {
      peopleStore.userFilteredCollection.copy().find({
        'Short Name': {
          '$eq': person
        }
      }).update(function (personObject) {

        // Only hide record if the user hadn't manually selected it
        if (!personObject.userSelected) {
          personObject.showRecord = false;
        }

        personObject.selectedByEvent = false;
        personObject.highlightAsRelatedToEvent = false;

        // Manage the Source Collection Selected Records
        this.autoUpdateSourceCheckboxes(personObject, peopleName);

      }.bind(this));
    }.bind(this));
  },

  // Add or remove Supporting Documents to each data type's array to work out whether to show a Source Record or not
  autoUpdateSourceCheckboxes: function (item, dataType) {

    var mergedObjectArray;
    var relatedSourceArray = [];

    // Helper methods for parsing Source records
    var getShortName = function (item) {
      if (item) {

        // Account for Source Documents which relate to certain pages/ times, etc.
        if (item.match(/^.*?(?=\s\()/g)) {
          item = item.match(/^.*?(?=\s\()/g)[0];
        }
        return item.trim();
      }
    };

    // Manage each data type's array
    switch (dataType) {
      case eventsName:
        if (item.showRecord === true && item['Supporting Documents']) {
          item.selectedByEvent = true;
          this.selectedEventDocuments.push(item);
        } else {
          item.selectedByEvent = false;
          _.remove(this.selectedEventDocuments, item);
        }
        break;
      case placesName:
        if (item.showRecord === true && item['Supporting Documents']) {
          item.selectedByPlace = true;
          this.selectedPlaceDocuments.push(item);
        } else {
          item.selectedByPlace = false;
          _.remove(this.selectedPlaceDocuments, item);
        }
        break;
      case peopleName:
        if (item.showRecord === true && item['Supporting Documents']) {
          item.selectedByPeople = true;
          this.selectedPeopleDocuments.push(item);
        } else {
          item.selectedByPeople = false;
          _.remove(this.selectedPeopleDocuments, item);
        }
        break;
      default:
    }

    // Created array of related source shortnames to match
    mergedObjectArray = _.union(this.selectedEventDocuments, this.selectedPlaceDocuments, this.selectedPeopleDocuments);

    mergedObjectArray.forEach(function (item) {
      relatedSourceArray.push(_.map(this.splitStringByCommas(item['Supporting Documents'].toString()), getShortName));
    }.bind(this));

    relatedSourceArray = _.uniq(_.flatten(relatedSourceArray));

    // Update related source records to show
    sourcesStore.userFilteredCollection.copy().where(function (sourceObject) {
      return relatedSourceArray.indexOf(sourceObject['Short Name'].toString()) !== -1;
    }).update(function (sourceObject) {
      sourceObject.showRecord = true;
      sourceObject.selectedByEvent = true;
      sourceObject.highlightAsRelatedToEvent = true;
    });

    // Update non related source records to not show
    sourcesStore.userFilteredCollection.copy().data().forEach(function (item) {

      var itemArray = [];

      relatedSourceArray.forEach(function (sourceName) {
        if (item['Short Name'].toString() === sourceName) {
          itemArray.push(item);
        }
      });

      if (!itemArray.length) {
        item.showRecord = false;
        item.selectedByEvent = false;
        item.highlightAsRelatedToEvent = false;
      }
    });
  },

  // Let listeners know the userFilteredCollections have been updated
  selectedDataChanged: function(sortCheckBoxes, sortEvents) {

    // Only sort when checkboxes have been ticked, not when a sort has been done
    if (sortCheckBoxes) {
      this.sortBySelectedRecords(sortEvents);
    }

    // Pass data onto views
    eventsStore.trigger(eventsStore.userFilteredCollection.data());
    placesStore.trigger(placesStore.userFilteredCollection.data());
    peopleStore.trigger(peopleStore.userFilteredCollection.data());
    sourcesStore.trigger(sourcesStore);

    this.message = {
      type: 'userFilteredCollectionsUpdated'
    };

    this.trigger(this);
  },

  // Sort the collections by selected records
  sortBySelectedRecords: function(sortEvents) {

    if (sortEvents) {
      eventsStore.userFilteredCollection.simplesort('showRecord', true).data();
    }

    placesStore.userFilteredCollection.simplesort('showRecord', true).data();
    peopleStore.userFilteredCollection.simplesort('showRecord', true).data();
    this.sortBySelectedSourceRecords();
  },

  // Sort the collections by selected source records
  // Needed because of scenario that all data tables can order sources
  sortBySelectedSourceRecords: function() {
    sourcesStore.userFilteredCollection.simplesort('showRecord', true).data();
  },

  // Helper to split string by commas not inside parentheses
  splitStringByCommas: function(input) {

    if (!input) {
      return;
    }

    var out = [];
    var iLen = input.length;
    var parens = 0;
    var state = '';
    var buffer = ''; //using string for simplicity, but an array might be faster

    for(var i=0; i<iLen; i++) {

      if (input[i] === ',' && !parens && !state) {
        out.push(buffer);
        buffer = '';
      } else {
        buffer += input[i];
      }
      switch(input[i]) {
        case '(':
        case '[':
        case '{':
          if (!state) {
            parens++;
          }
          break;
        case ')':
        case ']':
        case '}':
          if (!state) {
            if (parens < 1) {
              throw new SyntaxError('closing paren, but no opening');
            }
            parens--;
          }
          break;
        case '"':
          if (!state) {
            state = '"';
          }
          else if (state === '"') {
            state = '';
          }
          break;
        case '\'':
          if (!state) {
            state = '\'';
          }
          else if (state === '\'') {
            state = '';
          }
          break;
        case '\\':
          buffer += input[++i];
          break;
      }//end of switch-input
    }//end of for-input

    if (state || parens) {
      throw new SyntaxError('unfinished input');
    }

    out.push(buffer);

    return out;
  }
});
