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
    broadcast: broadcastToPages,
    emit: replyToClient
  };

  self.addEventListener('message', postFromPage);

  return api;

  function selfed (method) {
    return function selfish () {
      internalEmitter[method].apply(null, arguments);
      return api;
    };
  }

  function postFromPage (e) {
    var context = {
      reply: replyToPage(e)
    };
    serialization.emission(internalEmitter, context)(e);
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

  function replyTo (client) {
    var payload = serialization.parsePayload(atoa(arguments, 1));
    return client.postMessage(payload);
  }

  function replyToPage (e) {
    return replyTo.bind(null, e.ports[0]);
  }

  function replyToClient (clientId) {
    return self.clients.match(e.clientId).then(replyTo);
  }
}
