(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.swivel = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = function atoa (a, n) { return Array.prototype.slice.call(a, n); }

},{}],2:[function(require,module,exports){
'use strict';

var ticky = require('ticky');

module.exports = function debounce (fn, args, ctx) {
  if (!fn) { return; }
  ticky(function run () {
    fn.apply(ctx || null, args || []);
  });
};

},{"ticky":4}],3:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var debounce = require('./debounce');

module.exports = function emitter (thing, options) {
  var opts = options || {};
  var evt = {};
  if (thing === undefined) { thing = {}; }
  thing.on = function (type, fn) {
    if (!evt[type]) {
      evt[type] = [fn];
    } else {
      evt[type].push(fn);
    }
    return thing;
  };
  thing.once = function (type, fn) {
    fn._once = true; // thing.off(fn) still works!
    thing.on(type, fn);
    return thing;
  };
  thing.off = function (type, fn) {
    var c = arguments.length;
    if (c === 1) {
      delete evt[type];
    } else if (c === 0) {
      evt = {};
    } else {
      var et = evt[type];
      if (!et) { return thing; }
      et.splice(et.indexOf(fn), 1);
    }
    return thing;
  };
  thing.emit = function () {
    var args = atoa(arguments);
    return thing.emitterSnapshot(args.shift()).apply(this, args);
  };
  thing.emitterSnapshot = function (type) {
    var et = (evt[type] || []).slice(0);
    return function () {
      var args = atoa(arguments);
      var ctx = this || thing;
      if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
      et.forEach(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        if (listen._once) { thing.off(type, listen); }
      });
      return thing;
    };
  };
  return thing;
};

},{"./debounce":2,"atoa":1}],4:[function(require,module,exports){
var si = typeof setImmediate === 'function', tick;
if (si) {
  tick = function (fn) { setImmediate(fn); };
} else {
  tick = function (fn) { setTimeout(fn, 0); };
}

module.exports = tick;
},{}],5:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var serialization = require('./serialization');
var emitter = require('contra/emitter');

module.exports = createChannel;

function createChannel () {
  var channel = at(navigator.serviceWorker.controller);
  return channel;

  function at (worker) {
    var internalEmitter = emitter();
    var api = {
      on: selfed('on'),
      once: selfed('once'),
      off: selfed('off'),
      emit: postToWorker,
      at: at
    };
    var postFromWorker = serialization.emission(internalEmitter, { broadcast: false });
    navigator.serviceWorker.addEventListener('message', broadcastHandler);
    return api;

    function selfed (method) {
      return function selfish () {
        internalEmitter[method].apply(null, arguments);
        return api;
      };
    }

    function postToWorker () {
      if (!worker) {
        return Promise.reject(new Error('ServiceWorker not found.'));
      }
      var payload = serialization.parsePayload(atoa(arguments));
      var messageChannel = new MessageChannel();
      messageChannel.port1.addEventListener('message', postFromWorker);
      messageChannel.port1.start();
      return worker.postMessage(payload, [messageChannel.port2]);
    }

    function broadcastHandler (e) {
      if (e.source !== worker) {
        return; // ignore broadcast messages from other workers than the one we're talking to.
      }
      var data = e.data;
      if (data && data.__broadcast) {
        serialization.emission(internalEmitter, { broadcast: true })(e);
      }
    }
  }
}

},{"./serialization":6,"atoa":1,"contra/emitter":3}],6:[function(require,module,exports){
'use strict';

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
      emitter.emit.call(null, 'error', context, deserializeError(data.error));
    } else {
      emitter.emit.apply(null, [data.type, context].concat(data.payload));
    }
  }
}

module.exports = {
  parsePayload: parsePayload,
  emission: emission
};

},{}],7:[function(require,module,exports){
'use strict';

var page = require('./page');
var worker = require('./worker');
var api;

if ('serviceWorker' in navigator) {
  api = page();
} else if ('clients' in self) {
  api = worker();
} else {
  api = {
    on: complain,
    once: complain,
    off: complain,
    emit: complain,
    broadcast: complain
  };
}

function complain () {
  throw new Error('Swivel couldn\'t detect ServiceWorker support. Please feature detect before using Swivel in your web pages!');
}

module.exports = api;

},{"./page":5,"./worker":8}],8:[function(require,module,exports){
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
    return self.clients.matchAll().then(findClientById(clientId)).then(replyTo);
  }

  function findClientById (clientId) {
    return function findClientByIdFromList (clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].id === clientId) {
          return clients[i];
        }
      }
      return null;
    };
  }
}

},{"./serialization":6,"atoa":1,"contra/emitter":3}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYXRvYS9hdG9hLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9kZWJvdW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy90aWNreS90aWNreS1icm93c2VyLmpzIiwicGFnZS5qcyIsInNlcmlhbGl6YXRpb24uanMiLCJzd2l2ZWwuanMiLCJ3b3JrZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0aWNreSA9IHJlcXVpcmUoJ3RpY2t5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHtcbiAgaWYgKCFmbikgeyByZXR1cm47IH1cbiAgdGlja3koZnVuY3Rpb24gcnVuICgpIHtcbiAgICBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7XG4gIH0pO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgZGVib3VuY2UgPSByZXF1aXJlKCcuL2RlYm91bmNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgZXZ0ID0ge307XG4gIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICBpZiAoIWV2dFt0eXBlXSkge1xuICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXZ0W3R5cGVdLnB1c2goZm4pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgdGhpbmcub24odHlwZSwgZm4pO1xuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGlmIChjID09PSAxKSB7XG4gICAgICBkZWxldGUgZXZ0W3R5cGVdO1xuICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgZXZ0ID0ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldC5zcGxpY2UoZXQuaW5kZXhPZihmbiksIDEpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdChhcmdzLnNoaWZ0KCkpLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9O1xuICB0aGluZy5lbWl0dGVyU25hcHNob3QgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgIHZhciBldCA9IChldnRbdHlwZV0gfHwgW10pLnNsaWNlKDApO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciBjdHggPSB0aGlzIHx8IHRoaW5nO1xuICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldC5sZW5ndGgpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgZXQuZm9yRWFjaChmdW5jdGlvbiBlbWl0dGVyIChsaXN0ZW4pIHtcbiAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCBjdHgpOyB9IGVsc2UgeyBsaXN0ZW4uYXBwbHkoY3R4LCBhcmdzKTsgfVxuICAgICAgICBpZiAobGlzdGVuLl9vbmNlKSB7IHRoaW5nLm9mZih0eXBlLCBsaXN0ZW4pOyB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICB9O1xuICByZXR1cm4gdGhpbmc7XG59O1xuIiwidmFyIHNpID0gdHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJywgdGljaztcbmlmIChzaSkge1xuICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG59IGVsc2Uge1xuICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRpY2s7IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBzZXJpYWxpemF0aW9uID0gcmVxdWlyZSgnLi9zZXJpYWxpemF0aW9uJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2hhbm5lbDtcblxuZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbCAoKSB7XG4gIHZhciBjaGFubmVsID0gYXQobmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIuY29udHJvbGxlcik7XG4gIHJldHVybiBjaGFubmVsO1xuXG4gIGZ1bmN0aW9uIGF0ICh3b3JrZXIpIHtcbiAgICB2YXIgaW50ZXJuYWxFbWl0dGVyID0gZW1pdHRlcigpO1xuICAgIHZhciBhcGkgPSB7XG4gICAgICBvbjogc2VsZmVkKCdvbicpLFxuICAgICAgb25jZTogc2VsZmVkKCdvbmNlJyksXG4gICAgICBvZmY6IHNlbGZlZCgnb2ZmJyksXG4gICAgICBlbWl0OiBwb3N0VG9Xb3JrZXIsXG4gICAgICBhdDogYXRcbiAgICB9O1xuICAgIHZhciBwb3N0RnJvbVdvcmtlciA9IHNlcmlhbGl6YXRpb24uZW1pc3Npb24oaW50ZXJuYWxFbWl0dGVyLCB7IGJyb2FkY2FzdDogZmFsc2UgfSk7XG4gICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGJyb2FkY2FzdEhhbmRsZXIpO1xuICAgIHJldHVybiBhcGk7XG5cbiAgICBmdW5jdGlvbiBzZWxmZWQgKG1ldGhvZCkge1xuICAgICAgcmV0dXJuIGZ1bmN0aW9uIHNlbGZpc2ggKCkge1xuICAgICAgICBpbnRlcm5hbEVtaXR0ZXJbbWV0aG9kXS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gYXBpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb3N0VG9Xb3JrZXIgKCkge1xuICAgICAgaWYgKCF3b3JrZXIpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignU2VydmljZVdvcmtlciBub3QgZm91bmQuJykpO1xuICAgICAgfVxuICAgICAgdmFyIHBheWxvYWQgPSBzZXJpYWxpemF0aW9uLnBhcnNlUGF5bG9hZChhdG9hKGFyZ3VtZW50cykpO1xuICAgICAgdmFyIG1lc3NhZ2VDaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICBtZXNzYWdlQ2hhbm5lbC5wb3J0MS5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcG9zdEZyb21Xb3JrZXIpO1xuICAgICAgbWVzc2FnZUNoYW5uZWwucG9ydDEuc3RhcnQoKTtcbiAgICAgIHJldHVybiB3b3JrZXIucG9zdE1lc3NhZ2UocGF5bG9hZCwgW21lc3NhZ2VDaGFubmVsLnBvcnQyXSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYnJvYWRjYXN0SGFuZGxlciAoZSkge1xuICAgICAgaWYgKGUuc291cmNlICE9PSB3b3JrZXIpIHtcbiAgICAgICAgcmV0dXJuOyAvLyBpZ25vcmUgYnJvYWRjYXN0IG1lc3NhZ2VzIGZyb20gb3RoZXIgd29ya2VycyB0aGFuIHRoZSBvbmUgd2UncmUgdGFsa2luZyB0by5cbiAgICAgIH1cbiAgICAgIHZhciBkYXRhID0gZS5kYXRhO1xuICAgICAgaWYgKGRhdGEgJiYgZGF0YS5fX2Jyb2FkY2FzdCkge1xuICAgICAgICBzZXJpYWxpemF0aW9uLmVtaXNzaW9uKGludGVybmFsRW1pdHRlciwgeyBicm9hZGNhc3Q6IHRydWUgfSkoZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUVycm9yIChlcnIpIHtcbiAgcmV0dXJuIGVyciA/IGVyci50b1N0cmluZygpIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVzZXJpYWxpemVFcnJvciAoZXJyKSB7XG4gIHJldHVybiBlcnIgPyBuZXcgRXJyb3IoZXJyKSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUGF5bG9hZCAocGF5bG9hZCkge1xuICB2YXIgdHlwZSA9IHBheWxvYWQuc2hpZnQoKTtcbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICByZXR1cm4geyBlcnJvcjogc2VyaWFsaXplRXJyb3IocGF5bG9hZFswXSksIHR5cGU6IHR5cGUsIHBheWxvYWQ6IFtdIH07XG4gIH1cbiAgcmV0dXJuIHsgZXJyb3I6IG51bGwsIHR5cGU6IHR5cGUsIHBheWxvYWQ6IHBheWxvYWQgfTtcbn1cblxuZnVuY3Rpb24gZW1pc3Npb24gKGVtaXR0ZXIsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGVtaXQ7XG4gIGZ1bmN0aW9uIGVtaXQgKGUpIHtcbiAgICB2YXIgZGF0YSA9IGUuZGF0YTtcbiAgICBpZiAoZGF0YS50eXBlID09PSAnZXJyb3InKSB7XG4gICAgICBlbWl0dGVyLmVtaXQuY2FsbChudWxsLCAnZXJyb3InLCBjb250ZXh0LCBkZXNlcmlhbGl6ZUVycm9yKGRhdGEuZXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0LmFwcGx5KG51bGwsIFtkYXRhLnR5cGUsIGNvbnRleHRdLmNvbmNhdChkYXRhLnBheWxvYWQpKTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHBhcnNlUGF5bG9hZDogcGFyc2VQYXlsb2FkLFxuICBlbWlzc2lvbjogZW1pc3Npb25cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBwYWdlID0gcmVxdWlyZSgnLi9wYWdlJyk7XG52YXIgd29ya2VyID0gcmVxdWlyZSgnLi93b3JrZXInKTtcbnZhciBhcGk7XG5cbmlmICgnc2VydmljZVdvcmtlcicgaW4gbmF2aWdhdG9yKSB7XG4gIGFwaSA9IHBhZ2UoKTtcbn0gZWxzZSBpZiAoJ2NsaWVudHMnIGluIHNlbGYpIHtcbiAgYXBpID0gd29ya2VyKCk7XG59IGVsc2Uge1xuICBhcGkgPSB7XG4gICAgb246IGNvbXBsYWluLFxuICAgIG9uY2U6IGNvbXBsYWluLFxuICAgIG9mZjogY29tcGxhaW4sXG4gICAgZW1pdDogY29tcGxhaW4sXG4gICAgYnJvYWRjYXN0OiBjb21wbGFpblxuICB9O1xufVxuXG5mdW5jdGlvbiBjb21wbGFpbiAoKSB7XG4gIHRocm93IG5ldyBFcnJvcignU3dpdmVsIGNvdWxkblxcJ3QgZGV0ZWN0IFNlcnZpY2VXb3JrZXIgc3VwcG9ydC4gUGxlYXNlIGZlYXR1cmUgZGV0ZWN0IGJlZm9yZSB1c2luZyBTd2l2ZWwgaW4geW91ciB3ZWIgcGFnZXMhJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYXBpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBzZXJpYWxpemF0aW9uID0gcmVxdWlyZSgnLi9zZXJpYWxpemF0aW9uJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2hhbm5lbDtcblxuZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbCAoKSB7XG4gIHZhciBpbnRlcm5hbEVtaXR0ZXIgPSBlbWl0dGVyKCk7XG4gIHZhciBhcGkgPSB7XG4gICAgb246IHNlbGZlZCgnb24nKSxcbiAgICBvbmNlOiBzZWxmZWQoJ29uY2UnKSxcbiAgICBvZmY6IHNlbGZlZCgnb2ZmJyksXG4gICAgYnJvYWRjYXN0OiBicm9hZGNhc3RUb1BhZ2VzLFxuICAgIGVtaXQ6IHJlcGx5VG9DbGllbnRcbiAgfTtcblxuICBzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBwb3N0RnJvbVBhZ2UpO1xuXG4gIHJldHVybiBhcGk7XG5cbiAgZnVuY3Rpb24gc2VsZmVkIChtZXRob2QpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gc2VsZmlzaCAoKSB7XG4gICAgICBpbnRlcm5hbEVtaXR0ZXJbbWV0aG9kXS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIGFwaTtcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gcG9zdEZyb21QYWdlIChlKSB7XG4gICAgdmFyIGNvbnRleHQgPSB7XG4gICAgICByZXBseTogcmVwbHlUb1BhZ2UoZSlcbiAgICB9O1xuICAgIHNlcmlhbGl6YXRpb24uZW1pc3Npb24oaW50ZXJuYWxFbWl0dGVyLCBjb250ZXh0KShlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJyb2FkY2FzdFRvUGFnZXMgKHR5cGUpIHtcbiAgICB2YXIgcGF5bG9hZCA9IGF0b2EoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gc2VsZi5jbGllbnRzLm1hdGNoQWxsKCkudGhlbihnb3RDbGllbnRzKTtcbiAgICBmdW5jdGlvbiBnb3RDbGllbnRzIChjbGllbnRzKSB7XG4gICAgICByZXR1cm4gY2xpZW50cy5tYXAoZW1pdFRvQ2xpZW50KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gZW1pdFRvQ2xpZW50IChjbGllbnQpIHtcbiAgICAgIHJldHVybiBjbGllbnQucG9zdE1lc3NhZ2UoeyB0eXBlOiB0eXBlLCBwYXlsb2FkOiBwYXlsb2FkLCBfX2Jyb2FkY2FzdDogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXBseVRvIChjbGllbnQpIHtcbiAgICB2YXIgcGF5bG9hZCA9IHNlcmlhbGl6YXRpb24ucGFyc2VQYXlsb2FkKGF0b2EoYXJndW1lbnRzLCAxKSk7XG4gICAgcmV0dXJuIGNsaWVudC5wb3N0TWVzc2FnZShwYXlsb2FkKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlcGx5VG9QYWdlIChlKSB7XG4gICAgcmV0dXJuIHJlcGx5VG8uYmluZChudWxsLCBlLnBvcnRzWzBdKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlcGx5VG9DbGllbnQgKGNsaWVudElkKSB7XG4gICAgcmV0dXJuIHNlbGYuY2xpZW50cy5tYXRjaEFsbCgpLnRoZW4oZmluZENsaWVudEJ5SWQoY2xpZW50SWQpKS50aGVuKHJlcGx5VG8pO1xuICB9XG5cbiAgZnVuY3Rpb24gZmluZENsaWVudEJ5SWQgKGNsaWVudElkKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIGZpbmRDbGllbnRCeUlkRnJvbUxpc3QgKGNsaWVudHMpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2xpZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoY2xpZW50c1tpXS5pZCA9PT0gY2xpZW50SWQpIHtcbiAgICAgICAgICByZXR1cm4gY2xpZW50c1tpXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfTtcbiAgfVxufVxuIl19
