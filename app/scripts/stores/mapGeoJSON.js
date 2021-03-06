'use strict';

var Reflux = require('reflux');
var config = appMode === 'app' ? global.config : require('../config/config.js');
var selectedRecordsStore = require('../stores/selectedRecords.js');
var importPackageStore = require('../stores/importPackage.js');

module.exports = Reflux.createStore({

  // Called on Store initialisation
  init: function() {

    // Set default display type
    this.displayType = 'all';

    // Register importPackageStore's changes
    this.listenTo(importPackageStore, this.importPackageChanged);

    // Register selectedRecordsStore's changes
    this.listenTo(selectedRecordsStore, this.selectedRecordStoreUpdated);
  },

  // Add the images as blobs on the person's profile Object
  importPackageChanged: function (importPackageStore) {

    if (importPackageStore.message === 'importSuccess') {

      // Can set config object now
      config = global.config;
    }
  },

  // Triggered by updates to selectedRecords store
  selectedRecordStoreUpdated: function(selectedRecordStore) {

    // If selected records is changed
    if (selectedRecordStore.message.type === 'selectedRecordsUpdated') {

      // Reset active event
      this.activeEvent = '0';

      this.createGeoJSON();

      // If changed to setToAll events
    } else if (selectedRecordStore.message.type === 'setToAll') {

      this.activeEvent = selectedRecordStore.activeEvent;
      this.activePlace = selectedRecordStore.activePlace;

      this.displayType = 'all';

      this.createGeoJSON();

      // If changed to show one event only at a time
    } else if (selectedRecordStore.message.type === 'setToOneChanged') {

      this.activeEvent = selectedRecordStore.activeEvent;
      this.activePlace = selectedRecordStore.activePlace;

      this.displayType = 'one';

      this.createGeoJSON();

      // If changed to show events cumulatively
    } else if (selectedRecordStore.message.type === 'setToPlusOneChanged') {

      this.activeEvent = selectedRecordStore.activeEvent;
      this.activePlace = selectedRecordStore.activePlace;

      this.displayType = 'plusOne';

      this.createGeoJSON();

    // If event selected has changed
    } else if (selectedRecordStore.message.type === 'timeLineSelectedRecord') {

      this.activeEvent = selectedRecordStore.activeEvent;
      this.activePlace = selectedRecordStore.activePlace;

      this.message = {
        type: 'timeLineSelectedRecord'
      };

      this.trigger(this);
    }
  },

  // Create a GeoJSON Object that can be used by the Map to visualise data
  createGeoJSON: function() {

    var geoJSONObject;
    var indexOfActiveEvent;
    var plusOneEvents;
    var activePlusOneEvent = parseInt(this.activeEvent, 10);

    // Create an empty GeoJSON object
    var defaultGeoJSONObject = {
      'type': 'FeatureCollection',
      'features': []
    };

    var noneGeoJSONObject = {
      events: []
    };

    var messageType = 'geoJSONCreated';

    // Assign selected events from each store
    this.selectedEvents = selectedRecordsStore.selectedRecords[config.EventsCollection.name];
    this.selectedPlaces = selectedRecordsStore.selectedRecords[config.PlacesCollection.name];
    this.selectedPeople = selectedRecordsStore.selectedRecords[config.PeopleCollection.name];
    this.selectedSources = selectedRecordsStore.selectedRecords[config.SourcesCollection.name];

    // If no selected events
    if (!this.selectedEvents.data().length) {
      geoJSONObject = defaultGeoJSONObject;
    } else {

      if (this.displayType === 'one') {

        this.selectedEvents.copy().find({
          $loki: parseInt(this.activeEvent, 10)
        }).data().forEach(function(selectedEvent) {

          this.getFeatureObject(selectedEvent, defaultGeoJSONObject, noneGeoJSONObject);

        }.bind(this));

        messageType = 'setToOneChanged';

      } else if (this.displayType === 'plusOne') {

        indexOfActiveEvent = _.findIndex(this.selectedEvents.data(), function(selectedEvent) {
          return selectedEvent.$loki === activePlusOneEvent;
        }.bind(this));

        plusOneEvents = this.selectedEvents.data().slice(0, indexOfActiveEvent + 1);

        // Push a feature object for each Event record
        plusOneEvents.forEach(function(selectedEvent) {

          this.getFeatureObject(selectedEvent, defaultGeoJSONObject, noneGeoJSONObject);

        }.bind(this));

        messageType = 'setToPlusOneChanged';

      } else if (this.displayType === 'all') {

        // Push a feature object for each Event record
        this.selectedEvents.data().forEach(function(selectedEvent) {

          this.getFeatureObject(selectedEvent, defaultGeoJSONObject, noneGeoJSONObject);

        }.bind(this));

        messageType = 'setToAll';
      }
    }

    this.noneGeoJSONObject = _.cloneDeep(noneGeoJSONObject);

    this.getPointOfInterestObject(defaultGeoJSONObject);

    this.geoJSONObject = _.cloneDeep(defaultGeoJSONObject);

    this.message = {
      type: messageType
    };

    this.trigger(this);
  },

  // Return a GeoJSON Feature Object if event has related place selected
  getFeatureObject: function(selectedEvent, geoJSONObject, noneGeoJSONObject) {

    var featureObject = {
      'type': 'Feature',
      'properties': {
        'id': selectedEvent.$loki,
        'eventName': selectedEvent['Full Name'],
        'eventDescription': selectedEvent.Description,
        'type': selectedEvent.Type,
        'placeInfo': null,
        'relatedEvents': [],
        'relatedPeople': {
          suspects: [],
          victims: [],
          witnesses: []
        },
        'supportingEvidence': {
          eventsEvidence: [],
          placeEvidence: []
        }
      }
    };

    var getShortName = function (item) {

      if (item.match(/[^[\]]+(?=])/g)) {
        item = item.match(/[^[\]]+(?=])/g)[0];
      }
      return item.trim();
    };

    var selectedPlace = selectedEvent.Place ? selectedEvent.Place : '';

    var relatedPlace = this.selectedPlaces.copy().find({
      'Short Name': {
        '$eq': getShortName(selectedPlace)
      }
    }).data()[0];

    this.addRelatedEventsDataToGeoJSON(featureObject, selectedEvent);

    this.addRelatedPeopleDataToGeoJSON(featureObject, selectedEvent);

    this.addRelatedSourceDataToGeoJSON(featureObject, selectedEvent, relatedPlace);

    // Don't add to GeoJSON if no related place exists
    if (this.addPlaceDataToGeoJSON(featureObject, selectedEvent, relatedPlace)) {

      // Push features onto the GeoJSON Object
      geoJSONObject.features.push(featureObject);
    } else {
      noneGeoJSONObject.events.push(featureObject);
    }
  },

  // Add Place data to the geoJSON Object
  addPlaceDataToGeoJSON: function(featureObject, selectedEvent, relatedPlace) {

    // If the event has no related place selected
    if (relatedPlace) {

      // Assign Geometry
      featureObject.geometry = this.getGeometryObject(relatedPlace);

      // Assign values
      featureObject.properties.placeInfo = {};
      featureObject.properties.placeInfo.placeName = relatedPlace['Full Name'];
      featureObject.properties.placeInfo.type = relatedPlace.Type;
      featureObject.properties.placeInfo.kforArea = relatedPlace.AOR_KFOR;
      featureObject.properties.placeInfo.klaArea = relatedPlace.AOR_KLA;
      featureObject.properties.placeInfo.kumanavoRegion = relatedPlace.AOR_Kumanovo;
      featureObject.properties.placeInfo.country = relatedPlace.Country;
      featureObject.properties.placeInfo.region = relatedPlace.Region;
      featureObject.properties.placeInfo.municipality = relatedPlace.Municipality;
      featureObject.properties.placeInfo.description = relatedPlace.Description;

      return featureObject;
    } else {
      return false;
    }
  },

  // Add Related Events data to the geoJSON Object
  addRelatedEventsDataToGeoJSON: function(featureObject, selectedEvent) {

    var getShortName = function (item) {

      if (item.match(/[^[\]]+(?=])/g)) {
        item = item.match(/[^[\]]+(?=])/g)[0];
      }
      return item.trim();
    };

    var relatedEvents = selectedEvent['Linked events'] ? selectedEvent['Linked events'].split(',') : [];

    relatedEvents = _.map(relatedEvents, function(relatedEvent) {
      return getShortName(relatedEvent);
    });

    var eventDetails = this.selectedEvents.copy().find({
      'Short Name': {
        '$in': relatedEvents
      }
    }).data();

    eventDetails.forEach(function(eventObject) {

      var newEventObject = {
        id: eventObject.$loki,
        name: eventObject['Full Name'],
        description: eventObject.Description
      };

      featureObject.properties.relatedEvents.push(newEventObject);
    });
  },

  // Add Related People data to the geoJSON Object
  addRelatedPeopleDataToGeoJSON: function(featureObject, selectedEvent) {

    var getShortName = function (item) {

      if (item.match(/[^[\]]+(?=])/g)) {
        item = item.match(/[^[\]]+(?=])/g)[0];
      }
      return item.trim();
    };

    var suspectsArray = selectedEvent.Suspects ? selectedEvent.Suspects.split(',') : [];
    var victimsArray = selectedEvent.Victims ? selectedEvent.Victims.split(',') : [];
    var witnessesArray = selectedEvent.Witnesses ? selectedEvent.Witnesses.split(',') : [];

    var relatedSuspects = _.map(suspectsArray, getShortName);
    var relatedVictims = _.map(victimsArray, getShortName);
    var relatedWitnesses = _.map(witnessesArray, getShortName);

    this.addRelatedPersonToArray(relatedSuspects, featureObject.properties.relatedPeople.suspects);
    this.addRelatedPersonToArray(relatedVictims, featureObject.properties.relatedPeople.victims);
    this.addRelatedPersonToArray(relatedWitnesses, featureObject.properties.relatedPeople.witnesses);
  },

  // Add Related Source data to the geoJSON Object
  addRelatedSourceDataToGeoJSON: function(featureObject, selectedEvent, relatedPlace) {

    var supportingEventsSource;
    var supportingPlaceSource;

    if (!selectedEvent['Supporting Documents']) {
      return;
    }

    supportingEventsSource = this.splitStringByCommas(selectedEvent['Supporting Documents'].toString());

    // Event may not have related place
    if (relatedPlace) {
      supportingPlaceSource = this.splitStringByCommas(relatedPlace['Supporting Documents']);
    }

    // Push supporting Events evidence
    if (supportingEventsSource) {
      this.arrayToPushTo = featureObject.properties.supportingEvidence.eventsEvidence;
      supportingEventsSource.forEach(this.addSourceObject.bind(this));
    }

    // Push supporting Place evidence
    if (supportingPlaceSource) {
      this.arrayToPushTo = featureObject.properties.supportingEvidence.placeEvidence;
      supportingPlaceSource.forEach(this.addSourceObject.bind(this));
    }

    // Reset
    this.arrayToPushTo = [];
  },

  // Create and add a Source Object and push onto relevant Supporting Evidence array
  addSourceObject: function(supportingSource) {

    var shortName = this.getSupportingEvidenceShortname(supportingSource);

    var supportingSourceObject = this.selectedSources.copy().find({
      'Short Name': {
        '$eq': shortName
      }
    }).data()[0];

    var sourceObject = {};
    sourceObject.fullName = supportingSource.trim();
    sourceObject.shortName = shortName;
    sourceObject.description = this.getSupportingEvidenceDescription(supportingSource);
    sourceObject.supportingSourceObject = supportingSourceObject;

    this.arrayToPushTo.push(sourceObject);
  },

  // Push a person Object onto the relevant array
  addRelatedPersonToArray: function(personArray, arrayToPushTo) {

    var personDetails = this.selectedPeople.copy().find({
      'Short Name': {
        '$in': personArray
      }
    }).data();

    personDetails.forEach(function(object) {

      var newObject = {
        id: object.$loki,
        name: object['Full Name'],
        blob: object.blob,
        photo: object.Photo
      };

      arrayToPushTo.push(newObject);
    });
  },

  // Return a Geometry object based off the placeObject's
  getGeometryObject: function(placeObject) {

    var mapLocation = JSON.parse(placeObject['Map location']);

    var geometryObject = {
      coordinates: mapLocation
    };

    if (typeof mapLocation[0] === 'number') {
      geometryObject.type = 'Point';
    } else if (typeof mapLocation[0][0] === 'number') {
      geometryObject.type = 'LineString';
    } else if (typeof mapLocation[0][0][0] === 'number') {
      geometryObject.type = 'Polygon';
    }

    return geometryObject;
  },

  //
  getPointOfInterestObject: function(geoJSONObject) {

    var pointsOfInterest = this.selectedPlaces.copy().where(function(place) {
      return place.showRecord === true && place.selectedByEvent !== true;
    }).data();

    // If the event has no related place selected
    pointsOfInterest.forEach(function(pointOfInterest) {

      var featureObject = {
        'type': 'Feature',
        'properties': {
          'id': 'noEvent',
          'placeInfo': null,
          'relatedEvents': [],
          'relatedPeople': {
            suspects: [],
            victims: [],
            witnesses: []
          },
          'supportingEvidence': [{
            placeEvidence: []
          }]
        }
      };

      // Assign Geometry
      featureObject.geometry = this.getGeometryObject(pointOfInterest);

      // Assign values
      featureObject.properties.pointOfInterest = true;
      featureObject.properties.placeId = pointOfInterest.$loki;
      featureObject.properties.placeInfo = {};
      featureObject.properties.placeInfo.placeName = pointOfInterest['Full Name'];
      featureObject.properties.placeInfo.type = pointOfInterest.Type;
      featureObject.properties.placeInfo.kforArea = pointOfInterest.AOR_KFOR;
      featureObject.properties.placeInfo.klaArea = pointOfInterest.AOR_KLA;
      featureObject.properties.placeInfo.kumanavoRegion = pointOfInterest.AOR_Kumanovo;
      featureObject.properties.placeInfo.country = pointOfInterest.Country;
      featureObject.properties.placeInfo.region = pointOfInterest.Region;
      featureObject.properties.placeInfo.municipality = pointOfInterest.Municipality;
      featureObject.properties.placeInfo.description = pointOfInterest.Description;

      geoJSONObject.features.push(featureObject);
    }.bind(this));
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
  },

  // Helper to get Shortname part of supporting Evidence
  getSupportingEvidenceShortname: function(supportingEvidence) {

    var shortNameMatch = supportingEvidence.match(/^[^\(]+/g);

    if (shortNameMatch) {
      return shortNameMatch[0].trim();
    }
    return supportingEvidence;
  },

  // Helper to get Description part of supporting Evidence
  getSupportingEvidenceDescription: function(supportingEvidence) {

    var descriptionMatch = supportingEvidence.match(/\(([^)]+)\)/g);

    if (descriptionMatch) {
      return descriptionMatch[0].trim();
    }
    return '';
  }
});
