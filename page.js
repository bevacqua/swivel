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
  navigator.serviceWorker.onmessage = broadcastHandler;
  return api;

  function postToWorker () {
    var payload = serialization.parsePayload(atoa(arguments));
    var messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = postFromWorker;
    if (navigator.serviceWorker.controller === null) {
      return Promise.reject(new Error('ServiceWorker controller not found.'));
    }
    return navigator.serviceWorker.controller.postMessage(payload, [messageChannel.port2]);
  }

  function broadcastHandler (e) {
    var data = e.data;
    if (data && data.type === 'swivel:_broadcast') {
      internalEmitter.emit.apply(null, ['broadcast'].concat(data.payload));
    }
  }
}
