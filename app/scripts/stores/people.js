'use strict';

var Reflux = require('reflux');
var dataSourceStore = require('../stores/dataSource.js');
var config = appMode === 'app' ? global.config : require('../config/config.js');
var presentationsStore = require('../stores/presentations.js');
var PeopleActions = require('../actions/people.js');
var importPackageStore = require('../stores/importPackage.js');
var fsExtra = appMode === 'app' ? window.electronRequire('fs-extra') : null;
var crypto = appMode === 'app' ? window.electronRequire('crypto') : null;
var getRawBody = appMode === 'app' ? window.electronRequire('raw-body') : null;

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in SourceActions,
  // using onKeyname (or keyname) as callbacks
  listenables: [PeopleActions],

  // Data storage for all collections
  dataSource: null,

  // The Loki collection transform array
  collectionTransform: [],

  // Called on Store initialisation
  init: function() {

    if (!presentationMode || presentationMode === 'online') {
      this.collectionName = config.PeopleCollection.name;
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
    this.filterStateChanged(this.filterTransform);
  },

  // Add the images as blobs on the person's profile Object
  importPackageChanged: function (importPackageStore) {

    if (importPackageStore.message === 'importSuccess') {

      // Can set config object now
      config = global.config;

      this.collectionName = config.PeopleCollection.name;

      this.setDefaultTransform();

      // Call when the source data is updated
      this.createFilterTransform(this.filterTransform, dataSourceStore.message);

      // Iterate through each profile
      this.dataSource.getCollection(this.collectionName).data.forEach(function(profileObject) {

        // Decrypt the file if in Offline Application
        if (global.config && profileObject.Photo) {
          this.decryptProfileFile(profileObject);
        }
      }.bind(this));
    }
  },

  // Set search filter on our collectionTransform
  filterStateChanged: function(filterTransformBroadcast) {

    this.setDatesTransform();

    // If the incoming parameter is a string, we are setting the transform from a pre-existing one
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
        desc: false
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
    config.PeopleCollection.fields.forEach(function(filter) {
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

    var validItem = false;
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

  // Update the current profile when selected records are changed
  updateProfile: function() {
    if (this.selectedProfileObject) {
      this.viewProfile(this.selectedProfileObject.$loki);
    }
  },

  // Called when a user attempts to view a profile
  viewProfile: function(profileId) {

    if (this.userFilteredCollection) {

      // Set selectedProfileObject property
      this.setSelectedProfileObject(profileId);

      // Add related affiliations
      this.setRelatedAffiliations();

      // Add related events
      this.setRelatedEvents();

      // Add Supporting Documents
      this.setSupportingDocs();

      this.message = 'viewProfile';

      // Send object out to all listeners
      this.trigger(this);
    }
  },

  // Set a property on this store object to indicate current selected profile
  setSelectedProfileObject: function(profileId) {

    this.selectedProfileObject = this.userFilteredCollection.copy().find({
      '$loki': {
        '$eq': profileId
      }
    }).data()[0];
  },

  // Set related affiliations property
  setRelatedAffiliations: function() {

    var relatedAffiliations = [];
    var linkedPersons = this.selectedProfileObject['Linked persons'];
    var relatedItems;
    var affiliationCollection = dataSourceStore.dataSource.getCollection('Affiliation');

    // Create array of Related people statements filtering out empty strings if last statement ends in a full stop
    if (linkedPersons) {
      relatedItems = linkedPersons.split('.').filter(function(person) {
        return person;
      });

      // Iterate through related item statements
      relatedItems.forEach(function(statement) {

        var affiliationObject = {};

        // Set affiliation property
        this.setAffiliation(statement, affiliationObject, affiliationCollection);

        // Add related profiles
        this.addRelatedProfiles(statement, affiliationObject);

        // Only add the Affiliation if there are related profiles associated
        if (affiliationObject.relatedProfiles.length) {
          relatedAffiliations.push(affiliationObject);
        }

      }.bind(this));
    }

    this.relatedAffiliations = relatedAffiliations;
  },

  // Set related events property
  setRelatedEvents: function() {

    var relatedEvents = [];
    var relatedAsSuspect = this.getRoleObject('Suspects');
    var relatedAsVictim = this.getRoleObject('Victims');
    var relatedAsWitness = this.getRoleObject('Witnesses');

    if (relatedAsSuspect.relatedEvents.length) {
      relatedEvents.push(relatedAsSuspect);
    }

    if (relatedAsVictim.relatedEvents.length) {
      relatedEvents.push(relatedAsVictim);
    }

    if (relatedAsWitness.relatedEvents.length) {
      relatedEvents.push(relatedAsWitness);
    }

    this.relatedEvents = relatedEvents;
  },

  // Find a person in the specified column of the Events Collection and return a role object
  getRoleObject: function(roleName) {

    var role;
    var roleObject = {};
    var eventsCollection = dataSourceStore.dataSource.getCollection(config.EventsCollection.name);
    var relatedEvents = eventsCollection.where(function(event) {

      if (event[roleName] && event[roleName].indexOf('[' + this.selectedProfileObject['Short Name'] + ']') > -1) {
        if (event.showRecord === true) {
          return true;
        }
      }
    }.bind(this));

    switch(roleName) {
      case 'Suspects':
        role = 'Suspect';
        break;
      case 'Victims':
        role = 'Victim';
        break;
      case 'Witnesses':
        role = 'Witness';
        break;
    }

    roleObject.role = role;
    roleObject.relatedEvents = relatedEvents;

    return roleObject;
  },


  // Set supporting documents array property
  setSupportingDocs: function() {

    var supportingDocs = this.selectedProfileObject['Supporting Documents'];
    var sourceCollection = dataSourceStore.dataSource.getCollection(config.SourcesCollection.name);
    var relatedDocs;

    var trim = function (item) {
      return item.trim();
    };

    // Create array of Related people statements filtering out empty strings if last statement ends in a full stop
    if (supportingDocs) {

      relatedDocs = _.map(supportingDocs.split(',').filter(function (doc) {
        return doc;
      }), trim);

      // Iterate through relatedDocs array
      this.supportingDocs = sourceCollection.find({
        'Short Name': {
          '$in': relatedDocs
        }
      });
      return;
    }

    this.supportingDocs = [];
  },

  // Check if any Affiliation name exists in Statement
  getAffiliationShortname: function(statement, affiliationCollection) {

    var affiliationShortNames = [];

    // Create array of Affiliation Short Names
    affiliationCollection.data.forEach(function(affiliation) {
      affiliationShortNames.push(affiliation['Short Name']);
    }.bind(this));

    var affiliationArray = affiliationShortNames.filter(function(shortName) {
      return statement.indexOf(shortName) > -1;
    });

    // Should only be one affiliation per statement so just return the first found
    return affiliationArray[0];
  },

  // Set the affiliation property of the affiliationObject
  setAffiliation: function(statement, affiliationObject, affiliationCollection) {

    var affiliationShortname = this.getAffiliationShortname(statement, affiliationCollection);

    affiliationObject.affiliation = affiliationCollection.where(function (affiliation) {
      return affiliation['Short Name'] === affiliationShortname;
    })[0]['Full Name'];
  },

  // Check if any Profile names exists in Statement
  getProfileShortnames: function(statement) {

    var profileShortNames = [];

    // Create array of Affiliation Short Names
    this.userFilteredCollection.data().forEach(function(person) {
      profileShortNames.push(person['Short Name']);
    }.bind(this));

    var profileArray = profileShortNames.filter(function(shortName) {
      return statement.indexOf(shortName) > -1;
    });

    // Should only be one affiliation per statement so just return the first found
    return profileArray;
  },

  // Add related profiles to the relatedProfiles array property of the affiliationObject
  addRelatedProfiles: function(statement, affiliationObject) {

    var profileShortnames = this.getProfileShortnames(statement);

    var profiles = this.userFilteredCollection.copy().find({
      'Short Name': {
        '$in': profileShortnames
      }
    }).data();

    affiliationObject.relatedProfiles = profiles;
  },

  // If user logs out cleanup state on this store
  userStoreChanged: function(user) {

    if (user.status === 'loggedout') {
      this.selectedProfileObject = null;
      this.relatedAffiliations = null;
      this.supportingDocs = [];
      this.relatedEvents = [];
      this.trigger(this);
    }
  },

  // Decrypt the selected profile file
  decryptProfileFile: function(profileObject) {

    // Input file
    var readStream = fsExtra.createReadStream(global.config.packagePath + '/profiles' + profileObject.Photo);

    // Decrypt content
    var decrypt = crypto.createDecipher('aes-256-ctr', importPackageStore.packagePassword);

    // Start pipe
    getRawBody(readStream.pipe(decrypt))
      .then(function (buffer) {

        this.setBlob(buffer, profileObject);

      }.bind(this))
      .catch(function (err) {
        console.log('Error decrypting ' + profileObject.Photo + ' ' + err);
      });
  },

  // Set the blob property depending on the media type
  setBlob: function(buffer, profileObject) {

    var filePath = profileObject.Photo;
    var fileExtension = filePath.substr(filePath.lastIndexOf('.') + 1);

    switch (fileExtension) {
      case 'jpg':
        profileObject.blob = 'data:image/jpg;base64,' + buffer.toString('base64');
        break;
      case 'jpeg':
        profileObject.blob = 'data:image/jpg;base64,' + buffer.toString('base64');
        break;
      case 'gif':
        profileObject.blob = 'data:image/gif;base64,' + buffer.toString('base64');
        break;
      case 'png':
        profileObject.blob = 'data:image/png;base64,' + buffer.toString('base64');
        break;
      default:
        console.warn('Profile Image error: ' + fileExtension + 'not a supported type');
    }
  }
});
