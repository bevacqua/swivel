'use strict';

var atoa = require('atoa');

function serializeError (err) {
  return err ? err.toString() : null;
}

function deserializeError (err) {
  return err ? new Error(err) : null;
}

function parsePayload (payload) {
  var type = payload.shift();
  if (type === 'error') {
    return { error: serializeError(payload[0]), type: type, payload: [] };
  }
  return { error: null, type: type, payload: payload };
}

function emission (emitter, context) {
  return emit;
  function emit (e) {
    var data = e.data;
    if (data.type === 'error') {
      emitter.emit.call(context, 'error', deserializeError(data.error));
    } else {
      emitter.emit.apply(context, [data.type].concat(data.payload));
    }
  }
}

module.exports = {
  serializeError: serializeError,
  deserializeError: deserializeError,
  parsePayload: parsePayload,
  emission: emission
};
