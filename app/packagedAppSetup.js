var config;
var configPath;
var roles;
var electronRequire;
var ipcRenderer;
var remote;
var presentationMode;
var appMode;
var _;

if (typeof process === 'object') {
  appMode = 'app';
} else {
  appMode = 'browser';
}

if (appMode === 'app') {

  remote = require('electron').remote;
  _ = require('lodash');

  config = remote.getGlobal('config');
  configPath = remote.getGlobal('appConfigPath');
  roles = remote.getGlobal('roles');

  if (config) {

    // preserve newlines, etc - use valid JSON
    config = config.replace(/\\n/g, "\\n")
      .replace(/\\'/g, "\\'")
      .replace(/\\"/g, '\\"')
      .replace(/\\&/g, "\\&")
      .replace(/\\r/g, "\\r")
      .replace(/\\t/g, "\\t")
      .replace(/\\b/g, "\\b")
      .replace(/\\f/g, "\\f");

    // remove non-printable and other non-valid JSON chars
    config = config.replace(/[\u0000-\u0019]+/g,"");

    // Convert to JavaScript Object
    config = JSON.parse(config);

    // Set global property to use in stores
    presentationMode = 'online';

    // preserve newlines, etc - use valid JSON
    roles = roles.replace(/\\n/g, "\\n")
      .replace(/\\'/g, "\\'")
      .replace(/\\"/g, '\\"')
      .replace(/\\&/g, "\\&")
      .replace(/\\r/g, "\\r")
      .replace(/\\t/g, "\\t")
      .replace(/\\b/g, "\\b")
      .replace(/\\f/g, "\\f");

    // remove non-printable and other non-valid JSON chars
    roles = roles.replace(/[\u0000-\u0019]+/g,"");

    // Convert to JavaScript Object
    roles = JSON.parse(roles);
  } else {

    // Set global property to use in stores
    presentationMode = 'offline';
  }

  // Use for non browserify requires
  electronRequire = require;

  // Use to communicate with Electron
  ipcRenderer = require('electron').ipcRenderer;
}
