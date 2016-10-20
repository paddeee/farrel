/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
var reflux = require('reflux');
var moment = require('moment');
var config = appMode === 'app' ? global.config : require('./config/config.js');
var CSVParser = require('./vendor/harb-customised.js');
var dataSourceActions = require('./actions/dataSource.js');
var selectedRecordsActions = require('./actions/selectedRecords.js');
var queryBuilderActions = require('./actions/queryBuilder.js');
var queryBuilderStore = require('./stores/queryBuilder.js');
var filterStateActions = require('./actions/filterState.js');
var filterStateStore = require('./stores/filterState.js');
var eventsStore = require('./stores/events.js');
var placesStore = require('./stores/places.js');
var peopleActions = require('./actions/people.js');
var peopleStore = require('./stores/people.js');
var sourceActions = require('./actions/source.js');
var sourceStore = require('./stores/source.js');
var userActions = require('./actions/users.js');
var userStore = require('./stores/users.js');
var presentationsActions = require('./actions/presentations.js');
var importPackageActions = require('./actions/importPackage.js');
var importPackageStore = appMode === 'app' ? require('./stores/importPackage.js') : null;
var presentationsStore = require('./stores/presentations.js');
var importActions = require('./actions/import.js');
var importStore = require('./stores/import.js');
var exportActions = require('./actions/export.js');
var exportStore = appMode === 'app' ? require('./stores/export.js') : null;
var loggingStore = require('./stores/logging.js');
var screenActions = require('./actions/screen.js');
var screenStore = appMode === 'app' ? require('./stores/screen.js') : null;
var mapGeoJsonStore = require('./stores/mapGeoJSON.js');
var timeLineStore = require('./stores/timeLine.js');
var webChimeraPlayer = appMode === 'app' ? window.electronRequire('wcjs-player') : null;

(function(document, reflux, moment, sourceActions, selectedRecordsActions, queryBuilderActions, queryBuilderStore, presentationsActions, userStore, presentationsStore, filterStateActions, filterStateStore, eventsStore, placesStore, peopleActions, peopleStore, sourceStore, dataSourceActions, importActions, importStore, exportActions, exportStore, mapGeoJsonStore, timeLineStore, importPackageActions, importPackageStore, screenActions, screenStore, loggingStore, webChimeraPlayer) {
  'use strict';

  // Grab a reference to our auto-binding template
  // and give it some initial binding values
  // Learn more about auto-binding templates at http://goo.gl/Dx1u2g
  var app = document.querySelector('#app');

  // Set required modules as attributes on app
  app.appMode = appMode;
  app.config = config;
  app.presentationMode = presentationMode;
  app.reflux = reflux;
  app.moment = moment;
  app.CSVParser = CSVParser;
  app.dataSourceActions = dataSourceActions;
  app.selectedRecordsActions = selectedRecordsActions;
  app.userActions = userActions;
  app.userStore = userStore;
  app.presentationsActions = presentationsActions;
  app.presentationsStore = presentationsStore;
  app.queryBuilderActions = queryBuilderActions;
  app.queryBuilderStore = queryBuilderStore;
  app.importActions = importActions;
  app.importStore = importStore;
  app.importPackageActions = importPackageActions;
  app.importPackageStore = importPackageStore;
  app.exportActions = exportActions;
  app.exportStore = exportStore;
  app.screenActions = screenActions;
  app.screenStore = screenStore;
  app.loggingStore = loggingStore;
  app.filterStateActions = filterStateActions;
  app.filterStateStore = filterStateStore;
  app.eventsStore = eventsStore;
  app.placesStore = placesStore;
  app.peopleActions = peopleActions;
  app.peopleStore = peopleStore;
  app.sourceStore = sourceStore;
  app.sourceActions = sourceActions;
  app.sourceStore = sourceStore;
  app.mapGeoJsonStore = mapGeoJsonStore;
  app.timeLineStore = timeLineStore;
  app.webChimeraPlayer = webChimeraPlayer;

  app.displayInstalledToast = function() {
    document.querySelector('#caching-complete').show();
  };

  // Listen for template bound event to know when bindings
  // have resolved and content has been stamped to the page
  app.addEventListener('dom-change', function() {
    console.log('Operation Farrell content all added to page!');
    console.log('dom-change');

    if (presentationMode === 'online') {
      app.route = 'login';
    } else if (presentationMode === 'offline') {
      app.route = 'choose-package';
    }
  });

  // See https://github.com/Polymer/polymer/issues/1381
  window.addEventListener('WebComponentsReady', function() {

    // Set the correct path for leaflet images due to it breaking with the build
    window.L.Icon.Default.imagePath = './images/leaflet/';
    console.log('components ready');

    // Load Database in Networked Online mode
    if (presentationMode === 'online') {
      dataSourceActions.loadDatabase();
    }
  });

  // Close drawer after menu item is selected if drawerPanel is narrow
  app.onMenuSelect = function() {
    var drawerPanel = document.querySelector('#paperDrawerPanel');
    if (drawerPanel.narrow) {
      drawerPanel.closeDrawer();
    }
  };

  // Helper to let us use forEach on DOM collections
  // Maybe dangerous but can change for different approach if needed
  NodeList.prototype.forEach = Array.prototype.forEach;

})(document, reflux, moment, sourceActions, selectedRecordsActions, queryBuilderActions, queryBuilderStore, presentationsActions, userStore, presentationsStore, filterStateActions, filterStateStore, eventsStore, placesStore, peopleActions, peopleStore, sourceStore, dataSourceActions, importActions, importStore, exportActions, exportStore, mapGeoJsonStore, timeLineStore, importPackageActions, importPackageStore, screenActions, screenStore, loggingStore, webChimeraPlayer);
