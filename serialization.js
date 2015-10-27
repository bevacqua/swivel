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

module.exports = {
  serializeError: serializeError,
  deserializeError: deserializeError,
  parsePayload: parsePayload
};
