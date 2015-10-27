'use strict';

var atoa = require('atoa');
var serialization = require('./serialization');
var emitter = require('contra/emitter');

module.exports = createChannel;

function createChannel () {
  var internalEmitter = emitter();
  var api = {
    on: selfed('on'),
    once: selfed('once'),
    off: selfed('off'),
    emit: postToWorker
  };
  var postFromWorker = serialization.emission(internalEmitter, { broadcast: false });
  navigator.serviceWorker.onmessage = broadcastHandler;
  return api;

  function selfed (method) {
    return selfish;
    function selfish () {
      internalEmitter[method].apply(this, arguments);
      return api;
    }
  }

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
    if (data && data.__broadcast) {
      internalEmitter.emit.apply({ broadcast: true }, [data.type].concat(data.payload));
    }
  }
}
