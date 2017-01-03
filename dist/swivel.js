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
    const args = atoa(arguments)
    return self.clients.matchAll().then(findClientById(clientId)).then(reply);
    function reply (client) {
      args[0] = client;
      replyTo.apply(this, args);
    }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYXRvYS9hdG9hLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9kZWJvdW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy90aWNreS90aWNreS1icm93c2VyLmpzIiwicGFnZS5qcyIsInNlcmlhbGl6YXRpb24uanMiLCJzd2l2ZWwuanMiLCJ3b3JrZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhdG9hIChhLCBuKSB7IHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhLCBuKTsgfVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGlja3kgPSByZXF1aXJlKCd0aWNreScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7XG4gIGlmICghZm4pIHsgcmV0dXJuOyB9XG4gIHRpY2t5KGZ1bmN0aW9uIHJ1biAoKSB7XG4gICAgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pO1xuICB9KTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBhdG9hID0gcmVxdWlyZSgnYXRvYScpO1xudmFyIGRlYm91bmNlID0gcmVxdWlyZSgnLi9kZWJvdW5jZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGV2dCA9IHt9O1xuICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gIHRoaW5nLm9uID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgfSBlbHNlIHtcbiAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgZm4uX29uY2UgPSB0cnVlOyAvLyB0aGluZy5vZmYoZm4pIHN0aWxsIHdvcmtzIVxuICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBpZiAoYyA9PT0gMSkge1xuICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgIGV2dCA9IHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgIHJldHVybiB0aGluZy5lbWl0dGVyU25hcHNob3QoYXJncy5zaGlmdCgpKS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfTtcbiAgdGhpbmcuZW1pdHRlclNuYXBzaG90ID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICB2YXIgZXQgPSAoZXZ0W3R5cGVdIHx8IFtdKS5zbGljZSgwKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICB2YXIgY3R4ID0gdGhpcyB8fCB0aGluZztcbiAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQubGVuZ3RoKSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGV0LmZvckVhY2goZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgaWYgKGxpc3Rlbi5fb25jZSkgeyB0aGluZy5vZmYodHlwZSwgbGlzdGVuKTsgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgfTtcbiAgcmV0dXJuIHRoaW5nO1xufTtcbiIsInZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG5pZiAoc2kpIHtcbiAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRJbW1lZGlhdGUoZm4pOyB9O1xufSBlbHNlIHtcbiAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRUaW1lb3V0KGZuLCAwKTsgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0aWNrOyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgc2VyaWFsaXphdGlvbiA9IHJlcXVpcmUoJy4vc2VyaWFsaXphdGlvbicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNoYW5uZWw7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwgKCkge1xuICB2YXIgY2hhbm5lbCA9IGF0KG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLmNvbnRyb2xsZXIpO1xuICByZXR1cm4gY2hhbm5lbDtcblxuICBmdW5jdGlvbiBhdCAod29ya2VyKSB7XG4gICAgdmFyIGludGVybmFsRW1pdHRlciA9IGVtaXR0ZXIoKTtcbiAgICB2YXIgYXBpID0ge1xuICAgICAgb246IHNlbGZlZCgnb24nKSxcbiAgICAgIG9uY2U6IHNlbGZlZCgnb25jZScpLFxuICAgICAgb2ZmOiBzZWxmZWQoJ29mZicpLFxuICAgICAgZW1pdDogcG9zdFRvV29ya2VyLFxuICAgICAgYXQ6IGF0XG4gICAgfTtcbiAgICB2YXIgcG9zdEZyb21Xb3JrZXIgPSBzZXJpYWxpemF0aW9uLmVtaXNzaW9uKGludGVybmFsRW1pdHRlciwgeyBicm9hZGNhc3Q6IGZhbHNlIH0pO1xuICAgIG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBicm9hZGNhc3RIYW5kbGVyKTtcbiAgICByZXR1cm4gYXBpO1xuXG4gICAgZnVuY3Rpb24gc2VsZmVkIChtZXRob2QpIHtcbiAgICAgIHJldHVybiBmdW5jdGlvbiBzZWxmaXNoICgpIHtcbiAgICAgICAgaW50ZXJuYWxFbWl0dGVyW21ldGhvZF0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIGFwaTtcbiAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcG9zdFRvV29ya2VyICgpIHtcbiAgICAgIGlmICghd29ya2VyKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1NlcnZpY2VXb3JrZXIgbm90IGZvdW5kLicpKTtcbiAgICAgIH1cbiAgICAgIHZhciBwYXlsb2FkID0gc2VyaWFsaXphdGlvbi5wYXJzZVBheWxvYWQoYXRvYShhcmd1bWVudHMpKTtcbiAgICAgIHZhciBtZXNzYWdlQ2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgICAgbWVzc2FnZUNoYW5uZWwucG9ydDEuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIHBvc3RGcm9tV29ya2VyKTtcbiAgICAgIG1lc3NhZ2VDaGFubmVsLnBvcnQxLnN0YXJ0KCk7XG4gICAgICByZXR1cm4gd29ya2VyLnBvc3RNZXNzYWdlKHBheWxvYWQsIFttZXNzYWdlQ2hhbm5lbC5wb3J0Ml0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJyb2FkY2FzdEhhbmRsZXIgKGUpIHtcbiAgICAgIGlmIChlLnNvdXJjZSAhPT0gd29ya2VyKSB7XG4gICAgICAgIHJldHVybjsgLy8gaWdub3JlIGJyb2FkY2FzdCBtZXNzYWdlcyBmcm9tIG90aGVyIHdvcmtlcnMgdGhhbiB0aGUgb25lIHdlJ3JlIHRhbGtpbmcgdG8uXG4gICAgICB9XG4gICAgICB2YXIgZGF0YSA9IGUuZGF0YTtcbiAgICAgIGlmIChkYXRhICYmIGRhdGEuX19icm9hZGNhc3QpIHtcbiAgICAgICAgc2VyaWFsaXphdGlvbi5lbWlzc2lvbihpbnRlcm5hbEVtaXR0ZXIsIHsgYnJvYWRjYXN0OiB0cnVlIH0pKGUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBzZXJpYWxpemVFcnJvciAoZXJyKSB7XG4gIHJldHVybiBlcnIgPyBlcnIudG9TdHJpbmcoKSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplRXJyb3IgKGVycikge1xuICByZXR1cm4gZXJyID8gbmV3IEVycm9yKGVycikgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXJzZVBheWxvYWQgKHBheWxvYWQpIHtcbiAgdmFyIHR5cGUgPSBwYXlsb2FkLnNoaWZ0KCk7XG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgcmV0dXJuIHsgZXJyb3I6IHNlcmlhbGl6ZUVycm9yKHBheWxvYWRbMF0pLCB0eXBlOiB0eXBlLCBwYXlsb2FkOiBbXSB9O1xuICB9XG4gIHJldHVybiB7IGVycm9yOiBudWxsLCB0eXBlOiB0eXBlLCBwYXlsb2FkOiBwYXlsb2FkIH07XG59XG5cbmZ1bmN0aW9uIGVtaXNzaW9uIChlbWl0dGVyLCBjb250ZXh0KSB7XG4gIHJldHVybiBlbWl0O1xuICBmdW5jdGlvbiBlbWl0IChlKSB7XG4gICAgdmFyIGRhdGEgPSBlLmRhdGE7XG4gICAgaWYgKGRhdGEudHlwZSA9PT0gJ2Vycm9yJykge1xuICAgICAgZW1pdHRlci5lbWl0LmNhbGwobnVsbCwgJ2Vycm9yJywgY29udGV4dCwgZGVzZXJpYWxpemVFcnJvcihkYXRhLmVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXR0ZXIuZW1pdC5hcHBseShudWxsLCBbZGF0YS50eXBlLCBjb250ZXh0XS5jb25jYXQoZGF0YS5wYXlsb2FkKSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwYXJzZVBheWxvYWQ6IHBhcnNlUGF5bG9hZCxcbiAgZW1pc3Npb246IGVtaXNzaW9uXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFnZSA9IHJlcXVpcmUoJy4vcGFnZScpO1xudmFyIHdvcmtlciA9IHJlcXVpcmUoJy4vd29ya2VyJyk7XG52YXIgYXBpO1xuXG5pZiAoJ3NlcnZpY2VXb3JrZXInIGluIG5hdmlnYXRvcikge1xuICBhcGkgPSBwYWdlKCk7XG59IGVsc2UgaWYgKCdjbGllbnRzJyBpbiBzZWxmKSB7XG4gIGFwaSA9IHdvcmtlcigpO1xufSBlbHNlIHtcbiAgYXBpID0ge1xuICAgIG9uOiBjb21wbGFpbixcbiAgICBvbmNlOiBjb21wbGFpbixcbiAgICBvZmY6IGNvbXBsYWluLFxuICAgIGVtaXQ6IGNvbXBsYWluLFxuICAgIGJyb2FkY2FzdDogY29tcGxhaW5cbiAgfTtcbn1cblxuZnVuY3Rpb24gY29tcGxhaW4gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ1N3aXZlbCBjb3VsZG5cXCd0IGRldGVjdCBTZXJ2aWNlV29ya2VyIHN1cHBvcnQuIFBsZWFzZSBmZWF0dXJlIGRldGVjdCBiZWZvcmUgdXNpbmcgU3dpdmVsIGluIHlvdXIgd2ViIHBhZ2VzIScpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgc2VyaWFsaXphdGlvbiA9IHJlcXVpcmUoJy4vc2VyaWFsaXphdGlvbicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNoYW5uZWw7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwgKCkge1xuICB2YXIgaW50ZXJuYWxFbWl0dGVyID0gZW1pdHRlcigpO1xuICB2YXIgYXBpID0ge1xuICAgIG9uOiBzZWxmZWQoJ29uJyksXG4gICAgb25jZTogc2VsZmVkKCdvbmNlJyksXG4gICAgb2ZmOiBzZWxmZWQoJ29mZicpLFxuICAgIGJyb2FkY2FzdDogYnJvYWRjYXN0VG9QYWdlcyxcbiAgICBlbWl0OiByZXBseVRvQ2xpZW50XG4gIH07XG5cbiAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcG9zdEZyb21QYWdlKTtcblxuICByZXR1cm4gYXBpO1xuXG4gIGZ1bmN0aW9uIHNlbGZlZCAobWV0aG9kKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIHNlbGZpc2ggKCkge1xuICAgICAgaW50ZXJuYWxFbWl0dGVyW21ldGhvZF0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBhcGk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvc3RGcm9tUGFnZSAoZSkge1xuICAgIHZhciBjb250ZXh0ID0ge1xuICAgICAgcmVwbHk6IHJlcGx5VG9QYWdlKGUpXG4gICAgfTtcbiAgICBzZXJpYWxpemF0aW9uLmVtaXNzaW9uKGludGVybmFsRW1pdHRlciwgY29udGV4dCkoZSk7XG4gIH1cblxuICBmdW5jdGlvbiBicm9hZGNhc3RUb1BhZ2VzICh0eXBlKSB7XG4gICAgdmFyIHBheWxvYWQgPSBhdG9hKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIHNlbGYuY2xpZW50cy5tYXRjaEFsbCgpLnRoZW4oZ290Q2xpZW50cyk7XG4gICAgZnVuY3Rpb24gZ290Q2xpZW50cyAoY2xpZW50cykge1xuICAgICAgcmV0dXJuIGNsaWVudHMubWFwKGVtaXRUb0NsaWVudCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGVtaXRUb0NsaWVudCAoY2xpZW50KSB7XG4gICAgICByZXR1cm4gY2xpZW50LnBvc3RNZXNzYWdlKHsgdHlwZTogdHlwZSwgcGF5bG9hZDogcGF5bG9hZCwgX19icm9hZGNhc3Q6IHRydWUgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVwbHlUbyAoY2xpZW50KSB7XG4gICAgdmFyIHBheWxvYWQgPSBzZXJpYWxpemF0aW9uLnBhcnNlUGF5bG9hZChhdG9hKGFyZ3VtZW50cywgMSkpO1xuICAgIHJldHVybiBjbGllbnQucG9zdE1lc3NhZ2UocGF5bG9hZCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXBseVRvUGFnZSAoZSkge1xuICAgIHJldHVybiByZXBseVRvLmJpbmQobnVsbCwgZS5wb3J0c1swXSk7XG4gIH1cblxuICBmdW5jdGlvbiByZXBseVRvQ2xpZW50IChjbGllbnRJZCkge1xuICAgIGNvbnN0IGFyZ3MgPSBhdG9hKGFyZ3VtZW50cylcbiAgICByZXR1cm4gc2VsZi5jbGllbnRzLm1hdGNoQWxsKCkudGhlbihmaW5kQ2xpZW50QnlJZChjbGllbnRJZCkpLnRoZW4ocmVwbHkpO1xuICAgIGZ1bmN0aW9uIHJlcGx5IChjbGllbnQpIHtcbiAgICAgIGFyZ3NbMF0gPSBjbGllbnQ7XG4gICAgICByZXBseVRvLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmRDbGllbnRCeUlkIChjbGllbnRJZCkge1xuICAgIHJldHVybiBmdW5jdGlvbiBmaW5kQ2xpZW50QnlJZEZyb21MaXN0IChjbGllbnRzKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsaWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGNsaWVudHNbaV0uaWQgPT09IGNsaWVudElkKSB7XG4gICAgICAgICAgcmV0dXJuIGNsaWVudHNbaV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH07XG4gIH1cbn1cbiJdfQ==
