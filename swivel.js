'use strict';

var page = require('./page');
var worker = require('./worker');
var api;

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  api = page();
} else if (typeof self !== 'undefined' && 'clients' in self) {
  api = worker();
} else {
  api = {
    on: complain,
    once: complain,
    off: complain,
    emit: complain,
    broadcast: complain
  };
}

function complain () {
  throw new Error('Swivel couldn\'t detect ServiceWorker support. Please feature detect before using Swivel in your web pages!');
}

module.exports = api;
