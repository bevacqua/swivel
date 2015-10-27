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
    broadcast: broadcastToPages
  };

  self.addEventListener('message', postFromPage);

  return api;

  function postFromPage (e) {
    var client = { reply: reply };
    var ports = e.ports;
    var source = e.source;
    var data = e.data;
    if (data.type === 'error') {
      internalEmitter.emit.call(client, 'error', serialization.deserializeError(data.error));
    } else {
      internalEmitter.emit.apply(client, [data.type].concat(data.payload));
    }
    function reply (type) {
      var payload = serialization.parsePayload(atoa(arguments));
      console.log('WORKER::', 'issue #1: e.source is null');
      return e.source.postMessage(payload);
    }
  }

  function broadcastToPages () {
    var payload = atoa(arguments);
    return self.clients.matchAll(gotClients);
    function gotClients (clients) {
      return clients.map(emitToClient);
    }
    function emitToClient (client) {
      return client.postMessage({
        error: null,
        type: 'broadcast',
        payload: payload
      });
    }
  }
}
