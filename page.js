'use strict';

var atoa = require('atoa');
var serialization = require('./serialization');
var emitter = require('contra/emitter');

module.exports = createChannel;

function createChannel () {
  var internalEmitter = emitter();
  var api = {
    on: internalEmitter.on,
    once: internalEmitter.once,
    off: internalEmitter.off,
    emit: postToWorker
  };
  var postFromWorker = serialization.emission(internalEmitter, null);
  navigator.serviceWorker.onmessage = postFromWorker;
  return api;

  function postToWorker () {
    var payload = serialization.parsePayload(atoa(arguments));
    return navigator.serviceWorker.controller.postMessage(payload);
  }
}
