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
    serialization.emission(internalEmitter, client)(e);
    function reply (type) {
      var payload = serialization.parsePayload(atoa(arguments));
      return e.ports[0].postMessage(payload);
    }
  }

  function broadcastToPages () {
    var payload = atoa(arguments);
    return self.clients.matchAll().then(gotClients);
    function gotClients (clients) {
      return clients.map(emitToClient);
    }
    function emitToClient (client) {
      return client.postMessage({ type: 'swivel:_broadcast', payload: payload });
    }
  }
}
