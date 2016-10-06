'use strict';

const Reflux = require('reflux');
const ScreenActions = require('../actions/screen.js');
const electron = window.electronRequire('electron');

const fs = window.electronRequire('fs');
const path = window.electronRequire('path');

module.exports = Reflux.createStore({

  // this will set up listeners to all publishers in ScreenActions, using onKeyname (or keyname) as callbacks
  listenables: [ScreenActions],

  onPublishScreen: function(publishObject) {

    var fileName = publishObject.fileName + '.png';
    var pdfName = publishObject.fileName + '.pdf';
    var location = publishObject.location;
    var windows = electron.remote.BrowserWindow.getAllWindows();
    var controllerWindow;
    var rect;

    this.message = {
      type: 'gatheringScreens'
    };

    this.trigger(this);

    controllerWindow = windows.find(function (window) {
      return window.getTitle() === 'Electronic Presentation of Evidence';
    });

    rect = this.getPageCrop(publishObject, controllerWindow);

    controllerWindow.capturePage(rect, function(image) {

      var screenshotPath;
      var pdfPath;

      // Save log in different location depending on court mode state
      if (publishObject.courtMode) {
        screenshotPath = path.join(location, fileName);
        pdfPath = path.join(location, pdfName);
      } else {
        screenshotPath = path.join(global.config.packagePath, fileName);
        pdfPath = path.join(global.config.packagePath, pdfName);
      }

      var pdfObject = {
        fileName: publishObject.fileName,
        imagePath: screenshotPath,
        imageSize: [rect.width, rect.height],
        pdfPath: pdfPath,
        ernRefs: publishObject.ernRefs,
        openOnSave: publishObject.openOnSave,
        courtMode: publishObject.courtMode
      };

      fs.writeFile(screenshotPath, image.toPng(), function (error) {

        if (error) {

          this.message = {
            type: 'screenshotFailure',
            text: error
          };

          this.trigger(this);
          return console.error(error);
        }

        // Send message to Electron
        ipcRenderer.send('screenshot-published', pdfObject);

        this.trigger(this);

      }.bind(this));
    }.bind(this));
  },

  // Get rectangle coordinates of screen to capture
  getPageCrop: function(publishObject, controllerWindow) {

    var rect = {};
    var controllerWindowBounds = controllerWindow.getContentSize();
    var headerSize = 64;
    var footerSize = 0;

    if (publishObject.screenView === 'source') {
      footerSize = 52;
    }

    rect.x = 0;
    rect.y = headerSize;
    rect.width = controllerWindowBounds[0];
    rect.height = controllerWindowBounds[1] - headerSize - footerSize;

    return rect;
  }
});
