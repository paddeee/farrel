/*
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

'use strict';

// Include Gulp & Tools We'll Use
var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var del = require('del');
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var runSequence = require('run-sequence');
var browserSync = require('browser-sync');
var buffer = require('vinyl-buffer');
var reload = browserSync.reload;
var merge = require('merge-stream');
var path = require('path');
var fs = require('fs');
var glob = require('glob');
var globby = require('globby');
var mocha = require('gulp-mocha');
var through = require('through2');
var rename = require('gulp-rename');
var historyApiFallback = require('connect-history-api-fallback');
var useref = require('gulp-useref');
var gutil = require('gulp-util');
var packager = require('electron-packager');
var electronInstaller = require('electron-winstaller');
var exec = require('child_process').exec;

const buildVersion = '0.9.7';
const electronVersion = '1.3.5';

var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];

var styleTask = function (stylesPath, srcs) {
  return gulp.src(srcs.map(function(src) {
      return path.join('app', stylesPath, src);
    }))
    .pipe($.changed(stylesPath, {extension: '.css'}))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('.tmp/' + stylesPath))
    .pipe($.if('*.css', $.cssmin()))
    .pipe(gulp.dest('dist/' + stylesPath))
    .pipe($.size({title: stylesPath}));
};

// Compile and Automatically Prefix Stylesheets
gulp.task('styles', function () {
  return styleTask('styles', ['**/*.css']);
});

gulp.task('elements', function () {
  return styleTask('elements', ['**/*.css']);
});

// Browserify npm modules
gulp.task('browserify', function () {

  return browserify('app/scripts/app.js')
    .bundle()
    //Pass desired output filename to vinyl-source-stream
    .pipe(source('bundle.js'))
    // Uglify
    //.pipe(streamify($.uglify()))
    // Start piping stream to tasks!
    .pipe(gulp.dest('./app/scripts/'));
});

// Lint JavaScript
gulp.task('jshint', function () {
  return gulp.src([
      'app/scripts/**/*.js',
      '!app/scripts/adapters/**/*.js',
      '!app/scripts/vendor/**/*.js',
      'app/elements/**/*.js',
      'app/elements/**/*.html'
    ])
    .pipe(reload({stream: true, once: true}))
    .pipe($.jshint.extract()) // Extract JS from .html files
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.if(!browserSync.active, $.jshint.reporter('fail')));
});

// Optimize Images
gulp.task('images', function () {
  return gulp.src('app/images/**/*')
    /*.pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))*/
    .pipe(gulp.dest('dist/images'))
    .pipe($.size({title: 'images'}));
});

// Copy All Files At The Root Level (app)
gulp.task('copy', function () {
  var app = gulp.src([
    'app/*',
    '!app/test',
    '!app/sourcefiles',
    '!app/precache.json'
  ], {
    dot: true
  }).pipe(gulp.dest('dist'));

  var bower = gulp.src([
    'bower_components/**/*'
  ]).pipe(gulp.dest('dist/bower_components'));

  var elements = gulp.src(['app/elements/**/*'])
    .pipe(gulp.dest('dist/elements'));

  var images = gulp.src(['app/images/**/*'])
    .pipe(gulp.dest('dist/images'));

  var swBootstrap = gulp.src(['bower_components/platinum-sw/bootstrap/*.js'])
    .pipe(gulp.dest('dist/elements/bootstrap'));

  var swToolbox = gulp.src(['bower_components/sw-toolbox/*.js'])
    .pipe(gulp.dest('dist/sw-toolbox'));

  var vendorScripts = gulp.src(['app/scripts/vendor/**/*'])
    .pipe(gulp.dest('dist/scripts/vendor'));

  var vendorStyles = gulp.src(['app/styles/vendor/**/*'])
    .pipe(gulp.dest('dist/styles/vendor'));

  var vulcanized = gulp.src(['app/elements/elements.html'])
    .pipe($.rename('elements.vulcanized.html'))
    .pipe(gulp.dest('dist/elements'));

  var profiles = gulp.src(['app/profiles/**/*'])
    .pipe(gulp.dest('dist/profiles'));

  var fonts = gulp.src(['app/fonts/**/*'])
    .pipe(gulp.dest('dist/fonts'));

  return merge(app, bower, elements, vulcanized, swBootstrap, swToolbox, profiles, vendorScripts, vendorStyles, fonts)
    .pipe($.size({title: 'copy'}));
});

// Copy Web Fonts To Dist
gulp.task('fonts', function () {
  return gulp.src(['app/fonts/**'])
    .pipe(gulp.dest('dist/fonts'))
    .pipe($.size({title: 'fonts'}));
});

// Scan Your HTML For Assets & Optimize Them
gulp.task('html', function () {

  var assets = useref.assets({searchPath: ['.tmp', 'app', 'dist']});

  return gulp.src(['app/**/*.html', '!app/{elements,test}/**/*.html'])
    // Replace path for vulcanized assets
    .pipe($.if('*.html', $.replace('elements/elements.html', 'elements/elements.vulcanized.html')))
    .pipe(assets)
    // Concatenate And Minify JavaScript
    .pipe($.if('*.js', $.uglify({preserveComments: 'some'}).on('error', gutil.log)))
    // Concatenate And Minify Styles
    // In case you are still using useref build blocks
    .pipe($.if('*.css', $.cssmin()))
    .pipe(assets.restore())
    .pipe(useref())
    // Minify Any HTML
    .pipe($.if('*.html', $.minifyHtml({
      quotes: true,
      empty: true,
      spare: true
    })))
    // Output Files
    .pipe(gulp.dest('dist'))
    .pipe($.size({title: 'html'}));
});

// Vulcanize imports
gulp.task('vulcanize', function () {
  var DEST_DIR = 'dist/elements';

  return gulp.src('dist/elements/elements.vulcanized.html')
    .pipe($.vulcanize({
      stripComments: true,
      inlineCss: true,
      inlineScripts: true
    }))
    .pipe(gulp.dest(DEST_DIR))
    .pipe($.size({title: 'vulcanize'}));
});

gulp.task('npm-install', function () {

  var npmInstallPromise = new Promise(function (resolve, reject) {

    exec('cd dist && npm install', function (error, stdout, stderr) {
      console.log(stdout);
      console.log(stderr);

      if (error) {
        console.log(error);
        reject(error);
      } else {
        resolve();
      }
    });
  });

  return npmInstallPromise;
});

// Generate a list of files that should be precached when serving from 'dist'.
// The list will be consumed by the <platinum-sw-cache> element.
gulp.task('precache', function (callback) {
  var dir = 'dist';

  glob('{elements,scripts,styles}/**/*.*', {cwd: dir}, function(error, files) {
    if (error) {
      callback(error);
    } else {
      files.push('online.html', 'offline.html', './', 'bower_components/webcomponentsjs/webcomponents-lite.min.js');
      var filePath = path.join(dir, 'precache.json');
      fs.writeFile(filePath, JSON.stringify(files), callback);
    }
  });
});

// Clean Output Directory
gulp.task('clean', del.bind(null, ['.tmp', 'dist']));

// Watch Files For Changes & Reload
gulp.task('serve', ['styles', 'elements', 'images'], function () {
  browserSync({
    notify: false,
    logPrefix: 'PSK',
    snippetOptions: {
      rule: {
        match: '<span id="browser-sync-binding"></span>',
        fn: function (snippet) {
          return snippet;
        }
      }
    },
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    // will present a certificate warning in the browser.
    // https: true,
    server: {
      baseDir: ['.tmp', 'app'],
      middleware: [ historyApiFallback() ],
      routes: {
        '/bower_components': 'bower_components'
      }
    }
  });

  gulp.watch(['app/**/*.html'], reload);
  gulp.watch(['app/styles/**/*.css'], ['styles', reload]);
  gulp.watch(['app/elements/**/*.css'], ['elements', reload]);
  gulp.watch(['app/{scripts,elements}/**/*.js', '!app/scripts/bundle.js'], ['browserify']);
  gulp.watch(['app/scripts/bundle.js'], ['jshint', reload]);
  gulp.watch(['app/images/**/*'], reload);
});

// Build and serve the output from the dist build
gulp.task('serve:dist', ['default'], function () {
  browserSync({
    notify: false,
    logPrefix: 'PSK',
    snippetOptions: {
      rule: {
        match: '<span id="browser-sync-binding"></span>',
        fn: function (snippet) {
          return snippet;
        }
      }
    },
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    // will present a certificate warning in the browser.
    // https: true,
    server: 'dist',
    middleware: [ historyApiFallback() ]
  });
});

gulp.task("browser-unit-tests", function () {

  "use strict";

  browserSync({
    server: {
      //serve tests and the root as base dirs
      baseDir: ["./app/test/", "./"],
      index: "testrunner.html"
    }
  });
});

gulp.task('unit-tests', function () {

  // gulp expects tasks to return a stream, so we create one here.
  var bundledStream = through();

  bundledStream
    // turns the output bundle stream into a stream containing
    // the normal attributes gulp plugins expect.
    .pipe(source('stores-test.js'))
    // the rest of the gulp task, as you would normally write it.
    .pipe(buffer())
    .pipe(gulp.dest('./app/test/scripts/build/'))
    .pipe(mocha({
      bail: false,
      reporter: 'doc'
    }));

  // "globby" replaces the normal "gulp.src" as Browserify
  // creates it's own readable stream.
  globby(['./app/test/scripts/specs/*.js'], function(err, entries) {
    // ensure any errors from globby are handled
    if (err) {
      bundledStream.emit('error', err);
      return;
    }

    // create the Browserify instance and pipe the Browserify stream into the stream we created earlier
    // this starts our gulp pipeline.
    browserify({
      entries: entries
    })
    .ignore('browserify-fs')
    .bundle()
    .pipe(bundledStream);
  });

  // finally, we return the stream, so gulp knows when this task is done.
  return bundledStream;
});

// Build Production Files, the Default Task
gulp.task('default', ['clean'], function (cb) {
  runSequence(
    'browserify',
    ['copy', 'styles'],
    'elements',
    ['jshint', 'images', 'fonts', 'html', /*'unit-tests'*/],
    'npm-install',
    //'vulcanize',
    cb);
    // Note: add , 'precache' , after 'vulcanize', if your are going to use Service Worker
});

gulp.task('packager:osxpackagecreator', function () {

  var options = {
    'app-version': buildVersion,
    'app-category-type': 'public.app-category.business',
    'asar': true,
    'arch': 'all',
    'dir': './dist',
    'icon': './icons/SITFonline.ico.icns',
    'name': 'EPEPackageCreator',
    'productName': 'EPE Package Creator',
    'out': '/Users/ODonnell/SITF/Builds',
    'overwrite': true,
    'platform': 'darwin',
    'version': electronVersion
  };

  var taskPromise = new Promise(function (resolve, reject) {

    packager(options, function (error, appPaths) {

      if (error) {
        console.log(error);
        reject(error);
      } else {
        console.log(appPaths);
        resolve(appPaths);
      }
    }.bind(this));
  });

  return taskPromise;
});

gulp.task('packager:osxpackageviewer', function () {

  var options = {
    'app-version': buildVersion,
    'app-category-type': 'public.app-category.business',
    'asar': true,
    'arch': 'all',
    'dir': './dist',
    'icon': './icons/SITFoffline.ico.icns',
    'name': 'EPEPackageViewer',
    'productName': 'EPE Package Viewer',
    'out': '/Users/ODonnell/SITF/Builds',
    'overwrite': true,
    'platform': 'darwin',
    'version': electronVersion
  };

  var taskPromise = new Promise(function (resolve, reject) {

    packager(options, function (error, appPaths) {

      if (error) {
        console.log(error);
        reject(error);
      } else {
        console.log(appPaths);
        resolve(appPaths);
      }
    }.bind(this));
  });

  return taskPromise;
});

gulp.task('packager:windowspackagecreator', function () {

  var options = {
    'app-version': buildVersion,
    'asar': true,
    'arch': 'all',
    'dir': './dist',
    'icon': './icons/SITFonline.ico',
    'name': 'EPEPackageCreator',
    'productName': 'EPE Package Creator',
    'out': '/Users/ODonnell/SITF/Builds',
    'overwrite': true,
    'platform': 'win32',
    'version': electronVersion,
    'version-string': {
      'CompanyName': 'Evidential Ltd',
      'FileDescription': 'EPE Package Creator',
      'OriginalFilename': 'EPEPackageCreator',
      'ProductName': 'EPEPackageCreator',
      'InternalName': 'EPEPackageCreator'
    }
  };

  var taskPromise = new Promise(function (resolve, reject) {

    packager(options, function (error, appPaths) {

      if (error) {
        console.log(error);
        reject(error);
      } else {
        console.log(appPaths);
        resolve(appPaths);
      }
    }.bind(this));
  });

  return taskPromise;
});

gulp.task('packager:windowspackageviewer', function () {

  var options = {
    'app-version': buildVersion,
    'asar': true,
    'arch': 'all',
    'dir': './dist',
    'icon': './icons/SITFoffline.ico',
    'name': 'EPEPackageViewer',
    'productName': 'EPE Package Viewer',
    'out': '/Users/ODonnell/SITF/Builds',
    'overwrite': true,
    'platform': 'win32',
    'version': electronVersion,
    'version-string': {
      'CompanyName': 'Evidential Ltd',
      'FileDescription': 'EPE Package Viewer',
      'OriginalFilename': 'EPEPackageViewer',
      'ProductName': 'EPEPackageViewer',
      'InternalName': 'EPEPackageViewer'
    }
  };

  var taskPromise = new Promise(function (resolve, reject) {

    packager(options, function (error, appPaths) {

      if (error) {
        console.log(error);
        reject(error);
      } else {
        console.log(appPaths);
        resolve(appPaths);
      }
    }.bind(this));
  });

  return taskPromise;
});

gulp.task('installer:windowspackagecreator', function () {

  var appDirectory = '/Users/ODonnell/SITF/Builds';

  var installerPromise = electronInstaller.createWindowsInstaller({
    appDirectory: appDirectory + '/EPEPackageCreator-win32-x64',
    outputDirectory: '/Users/ODonnell/SITF/Builds',
    authors: 'Evidential Ltd',
    exe: 'EPEPackageCreator.exe',
    version: buildVersion,
    loadingGif: './icons/gears.gif',
    iconUrl: 'https://paddeee.github.io/icons/SITFonline.ico',
    setupIcon: './icons/SITFonline.ico',
    setupExe: 'EPEPackageCreatorSetUp.exe'
  });

  return installerPromise.then(function() {
    console.log('Package Creator Installer Complete');
  }, function(error) {
    console.log(`No dice: ${error.message}`);
  });
});

gulp.task('installer:windowspackageviewer', function () {

  var appDirectory = '/Users/ODonnell/SITF/Builds';

  var installerPromise = electronInstaller.createWindowsInstaller({
    appDirectory: appDirectory + '/EPEPackageViewer-win32-x64',
    outputDirectory: '/Users/ODonnell/SITF/Builds',
    authors: 'Evidential Ltd',
    exe: 'EPEPackageViewer.exe',
    version: buildVersion,
    loadingGif: './icons/gears.gif',
    iconUrl: 'https://paddeee.github.io/icons/SITFoffline.ico',
    setupIcon: './icons/SITFoffline.ico',
    setupExe: 'EPEPackageViewerSetUp.exe'
  });

  return installerPromise.then(function() {
    console.log('Package Creator Installer Complete');
  }, function(error) {
    console.log(`No dice: ${error.message}`);
  });
});

gulp.task('build:osx', function (cb) {
  runSequence(
    'default',
    'packager:osxpackagecreator',
    'packager:osxpackageviewer',
    cb);
});

gulp.task('build:windows', function (cb) {
  runSequence(
    'default',
    'packager:windowspackagecreator',
    'packager:windowspackageviewer',
    'installer:windowspackagecreator',
    'installer:windowspackageviewer',
    cb);
});

// Load tasks for web-component-tester
// Adds tasks for `gulp test:local` and `gulp test:remote`
//require('web-component-tester').gulp.init(gulp);

// Load custom tasks from the `tasks` directory
try { require('require-dir')('tasks'); } catch (err) {}
