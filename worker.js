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
    broadcast: broadcastToPages
  };

  self.addEventListener('message', postFromPage);

  return api;

  function selfed (method) {
    return selfish;
    function selfish () {
      internalEmitter[method].apply(this, arguments);
      return api;
    }
  }

  function postFromPage (e) {
    var client = { reply: reply };
    serialization.emission(internalEmitter, client)(e);
    function reply () {
      var payload = serialization.parsePayload(atoa(arguments));
      return e.ports[0].postMessage(payload);
    }
  }

  function broadcastToPages (type) {
    var payload = atoa(arguments, 1);
    return self.clients.matchAll().then(gotClients);
    function gotClients (clients) {
      return clients.map(emitToClient);
    }
    function emitToClient (client) {
      return client.postMessage({ type: type, payload: payload, __broadcast: true });
    }
  }
}
