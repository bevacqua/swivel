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
  navigator.serviceWorker.onmessage = postFromWorker;
  return api;

  function postToWorker () {
    var payload = serialization.parsePayload(atoa(arguments));
    return navigator.serviceWorker.controller.postMessage(payload);
  }

  function postFromWorker (e) {
    var data = e.data;
    if (data.type === 'error') {
      internalEmitter.emit('error', serialization.deserializeError(data.error));
    } else {
      internalEmitter.emit.apply(null, [data.type].concat(data.payload));
    }
  }
}
