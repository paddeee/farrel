const electron = require('electron');
const {app} = electron;  // Module to control application life.
const {BrowserWindow} = electron;  // Module to create native browser window.
const {ipcMain} = electron;
const {dialog} = electron;
const {shell} = electron;
//const Menu = require("menu");
const fs = require('fs');

/*
 Networked: 0
 Offline/Court: 1
 */
const buildType = 1;

let externalDisplay = false;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
var controllerWindow = null;
var courtWindow = null;
var publishWindow = null;

// Get the config file
var getConfig =  function () {

  return new Promise(function (resolve, reject) {

    var configDirectory = process.resourcesPath;

    fs.readFile(configDirectory + '/appConfig.json', 'utf-8', function(err, data) {

      if (data) {
        global.config = data;
        ldapPath = JSON.parse(data).paths.ldap;
        resolve();
      } else if (err) {
        reject(err);
      }
    });
  });
};

// Get the roles file
var getRoles =  function () {

  return new Promise(function (resolve, reject) {

    if (buildType !== 0) {
      global.roles = null;
      resolve();
    } else {

      var rolesDirectory = process.resourcesPath;

      fs.readFile(rolesDirectory + '/roles.json', 'utf-8', function(err, data) {

        if (data) {
          global.roles = data;
          resolve();
        } else if (err) {
          reject(err);
        }
      });
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {

  var createExternalWindow = function() {

    let controllerBounds = getControllerBounds();

    // Using find so will only return one external display. Need to know how this should work with
    // multiple displays before changing to use filter.
    let externalDisplay = electron.screen.getAllDisplays().find(function (display) {
      return display.workAreaSize.width > controllerBounds.width || display.workAreaSize.height > controllerBounds.height;
    });

    // Get screen size of external display
    let externalWidth = externalDisplay.workAreaSize.width;
    let externalHeight = externalDisplay.workAreaSize.height;

    // Create the court view window.
    courtWindow = new BrowserWindow({
      fullScreen: true,
      webSecurity: false,
      width: externalWidth,
      height: externalHeight,
      x: externalDisplay.bounds.x,
      y: externalDisplay.bounds.y,
      show: true
    });

    courtWindow.loadURL('file://' + __dirname + '/externalDisplay.html');

    courtWindow.webContents.openDevTools();
  };

  var createControllerWindow = function() {

// Create the browser window.
    controllerWindow = new BrowserWindow({
      backgroundColor: 'fff',
      webSecurity: false,
      show: true
    });

    controllerWindow.setBounds(getControllerBounds());

    // If controller window is resized, keep publish window bounds in sync
    controllerWindow.on('resize', function() {
      publishWindow.setBounds(controllerWindow.getBounds());
    });

    // Open the DevTools.
    controllerWindow.webContents.openDevTools();
  }

  var createPublishWindow = function() {

    if (buildType === 1) {

      // Create the publish window.
      publishWindow = new BrowserWindow({
        webSecurity: false,
        show: true
      });

      publishWindow.setBounds(getControllerBounds());

      publishWindow.loadURL('file://' + __dirname + '/publish.html');

      //publishWindow.webContents.openDevTools();
    }
  };

  var getControllerBounds = function() {

    let controllerBounds = {};

    // Get controller display based on smallest screen width
    let controllerDisplay = electron.screen.getAllDisplays().reduce(function (prev, current) {
      return (prev.size.width < current.size.width) ? prev : current;
    });

    // Get screen size of controller display
    controllerBounds.width = Math.round(controllerDisplay.workAreaSize.width * 0.9);
    controllerBounds.height = Math.round(controllerDisplay.workAreaSize.height * 0.9);
    controllerBounds.x = Math.round(controllerDisplay.bounds.x + (controllerBounds.width * 0.05));
    controllerBounds.y = Math.round(controllerDisplay.bounds.y + (controllerBounds.height * 0.05));

    return controllerBounds;
  };

  // Manage screens when Court mode is enabled/disabled
  ipcMain.on('court-mode-changed', function(event, courtMode) {

    externalDisplay = courtMode;

    // If only one screen when the court mode is changed, do nothing
    if (electron.screen.getAllDisplays().length < 2) {
      return;
    }

    // If court mode is on
    if (externalDisplay) {

      // Create external display window
      createExternalWindow();

      // If court mode is off
    } else {
      courtWindow.destroy();
    }
  });

  electron.screen.on('display-added', function(event, newDisplay) {

    if (externalDisplay) {
      createExternalWindow();
    }

    // Controller Window may have moved to external display so reposition it
    controllerWindow.setBounds(getControllerBounds());
  });

  electron.screen.on('display-removed', function(event, oldDisplay) {

    // If only primary display, set up new court window.
    if (electron.screen.getAllDisplays().length === 1) {

      externalDisplay = false;

      if (courtWindow) {
        courtWindow.destroy();
      }
    }
  });

  // Create controller Window
  createControllerWindow();

  // Create publish log hidden Window
  createPublishWindow();

  // If detect more than one display and court mode is on
  if (externalDisplay && electron.screen.getAllDisplays().length > 1) {
    createExternalWindow();
  }

  getConfig()
    .then(function() {
      console.log('Got config');

      getRoles()
        .then(function() {
          console.log('Got roles');

          switch (buildType) {
            case 0:
              controllerWindow.loadURL('file://' + __dirname + '/online.html');
              break;
            case 1:
              controllerWindow.loadURL('file://' + __dirname + '/offline.html');
              break;
            default:
              dialog.showErrorBox('Error with Build', 'No Valid Build Type specified');
          }
        })
        .catch(function() {
          dialog.showErrorBox('Roles File Missing', 'Please make sure the Roles File resides in the Application.');
          reject();
        }.bind(this));
    })
    .catch(function() {
      dialog.showErrorBox('Config File Missing', 'Please make sure the Config File resides in the Application.');
      reject();
    }.bind(this));

  // Emitted when the window is closed.
  controllerWindow.on('closed', function() {

    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    controllerWindow = null;
  });

  // Emitted when the window is closed.
  publishWindow.on('closed', function() {

    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    publishWindow = null;
  });

  // Emitted when the window is closed.
  if (courtWindow) {
    courtWindow.on('closed', function() {

      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      externalDisplay = false;
      courtWindow = null;
    });
  }

// Create the Application's main menu
  var template = [{
    label: "Application",
    submenu: [
      { label: "About SITF EPE", selector: "orderFrontStandardAboutPanel:" },
      { type: "separator" },
      { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
    ]}, {
    label: "Edit",
    submenu: [
      //{ label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
      //{ label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
      //{ type: "separator" },
      //{ label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
      { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
      { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
      //{ label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
    ]}
  ];

//Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {

  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('show-open-dialog', function(event, property, type) {

  var selection;

  if (property === 'directory') {
    selection = dialog.showOpenDialog({
      properties: ['openDirectory']
    });
  } else if (property === 'file') {

    if (type === '.dat') {

      selection = dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: 'Package',
            extensions: ['dat']
          }
        ]
      });
    }
  }

  event.sender.send(property + '-selected', selection);
});

// Send message to publish page to generate HTML with relevant data.
ipcMain.on('screenshot-published', function(event, pdfObject) {

  // Send image to external display
  if (externalDisplay) {
    courtWindow.webContents.send('publish', pdfObject);
  }

  publishWindow.webContents.send('create-pdf', pdfObject);
});

// Create and save the PDF.
ipcMain.on('save-pdf', function(event, pdfObject) {

  publishWindow.webContents.printToPDF({}, function(error, data) {

    if (error) {
      controllerWindow.webContents.send('pdf-error', error);
    } else {

      fs.writeFile(pdfObject.pdfPath, data, function(error) {

        if (error) {
          controllerWindow.webContents.send('pdf-error', error);
        } else {
          controllerWindow.webContents.send('pdf-created', pdfObject);

          // View file if user requested
          if (pdfObject.openOnSave === 'open') {
            shell.openItem(pdfPath);
          }
        }
      });
    }
  });
});
