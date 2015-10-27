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
      emitter.emit.call(context, 'error', deserializeError(data.error));
    } else {
      emitter.emit.apply(context, [data.type].concat(data.payload));
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

},{"./serialization":6,"atoa":1,"contra/emitter":3}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYXRvYS9hdG9hLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9kZWJvdW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvbm9kZV9tb2R1bGVzL3RpY2t5L3RpY2t5LWJyb3dzZXIuanMiLCJwYWdlLmpzIiwic2VyaWFsaXphdGlvbi5qcyIsInN3aXZlbC5qcyIsIndvcmtlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGF0b2EgKGEsIG4pIHsgcmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGEsIG4pOyB9XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0aWNreSA9IHJlcXVpcmUoJ3RpY2t5Jyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHtcbiAgaWYgKCFmbikgeyByZXR1cm47IH1cbiAgdGlja3koZnVuY3Rpb24gcnVuICgpIHtcbiAgICBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7XG4gIH0pO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgZGVib3VuY2UgPSByZXF1aXJlKCcuL2RlYm91bmNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgdmFyIG9wdHMgPSBvcHRpb25zIHx8IHt9O1xuICB2YXIgZXZ0ID0ge307XG4gIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgdGhpbmcub24gPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICBpZiAoIWV2dFt0eXBlXSkge1xuICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXZ0W3R5cGVdLnB1c2goZm4pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICBmbi5fb25jZSA9IHRydWU7IC8vIHRoaW5nLm9mZihmbikgc3RpbGwgd29ya3MhXG4gICAgdGhpbmcub24odHlwZSwgZm4pO1xuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub2ZmID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGlmIChjID09PSAxKSB7XG4gICAgICBkZWxldGUgZXZ0W3R5cGVdO1xuICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgZXZ0ID0ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldC5zcGxpY2UoZXQuaW5kZXhPZihmbiksIDEpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgcmV0dXJuIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdChhcmdzLnNoaWZ0KCkpLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9O1xuICB0aGluZy5lbWl0dGVyU25hcHNob3QgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgIHZhciBldCA9IChldnRbdHlwZV0gfHwgW10pLnNsaWNlKDApO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICAgIHZhciBjdHggPSB0aGlzIHx8IHRoaW5nO1xuICAgICAgaWYgKHR5cGUgPT09ICdlcnJvcicgJiYgb3B0cy50aHJvd3MgIT09IGZhbHNlICYmICFldC5sZW5ndGgpIHsgdGhyb3cgYXJncy5sZW5ndGggPT09IDEgPyBhcmdzWzBdIDogYXJnczsgfVxuICAgICAgZXQuZm9yRWFjaChmdW5jdGlvbiBlbWl0dGVyIChsaXN0ZW4pIHtcbiAgICAgICAgaWYgKG9wdHMuYXN5bmMpIHsgZGVib3VuY2UobGlzdGVuLCBhcmdzLCBjdHgpOyB9IGVsc2UgeyBsaXN0ZW4uYXBwbHkoY3R4LCBhcmdzKTsgfVxuICAgICAgICBpZiAobGlzdGVuLl9vbmNlKSB7IHRoaW5nLm9mZih0eXBlLCBsaXN0ZW4pOyB9XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICB9O1xuICByZXR1cm4gdGhpbmc7XG59O1xuIiwidmFyIHNpID0gdHlwZW9mIHNldEltbWVkaWF0ZSA9PT0gJ2Z1bmN0aW9uJywgdGljaztcbmlmIChzaSkge1xuICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldEltbWVkaWF0ZShmbik7IH07XG59IGVsc2Uge1xuICB0aWNrID0gZnVuY3Rpb24gKGZuKSB7IHNldFRpbWVvdXQoZm4sIDApOyB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHRpY2s7IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBzZXJpYWxpemF0aW9uID0gcmVxdWlyZSgnLi9zZXJpYWxpemF0aW9uJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2hhbm5lbDtcblxuZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbCAoKSB7XG4gIHZhciBpbnRlcm5hbEVtaXR0ZXIgPSBlbWl0dGVyKCk7XG4gIHZhciBhcGkgPSB7XG4gICAgb246IHNlbGZlZCgnb24nKSxcbiAgICBvbmNlOiBzZWxmZWQoJ29uY2UnKSxcbiAgICBvZmY6IHNlbGZlZCgnb2ZmJyksXG4gICAgZW1pdDogcG9zdFRvV29ya2VyXG4gIH07XG4gIHZhciBwb3N0RnJvbVdvcmtlciA9IHNlcmlhbGl6YXRpb24uZW1pc3Npb24oaW50ZXJuYWxFbWl0dGVyLCB7IGJyb2FkY2FzdDogZmFsc2UgfSk7XG4gIG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLm9ubWVzc2FnZSA9IGJyb2FkY2FzdEhhbmRsZXI7XG4gIHJldHVybiBhcGk7XG5cbiAgZnVuY3Rpb24gc2VsZmVkIChtZXRob2QpIHtcbiAgICByZXR1cm4gc2VsZmlzaDtcbiAgICBmdW5jdGlvbiBzZWxmaXNoICgpIHtcbiAgICAgIGludGVybmFsRW1pdHRlclttZXRob2RdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gYXBpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBvc3RUb1dvcmtlciAoKSB7XG4gICAgdmFyIHBheWxvYWQgPSBzZXJpYWxpemF0aW9uLnBhcnNlUGF5bG9hZChhdG9hKGFyZ3VtZW50cykpO1xuICAgIHZhciBtZXNzYWdlQ2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICAgIG1lc3NhZ2VDaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IHBvc3RGcm9tV29ya2VyO1xuICAgIGlmIChuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5jb250cm9sbGVyID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdTZXJ2aWNlV29ya2VyIGNvbnRyb2xsZXIgbm90IGZvdW5kLicpKTtcbiAgICB9XG4gICAgcmV0dXJuIG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLmNvbnRyb2xsZXIucG9zdE1lc3NhZ2UocGF5bG9hZCwgW21lc3NhZ2VDaGFubmVsLnBvcnQyXSk7XG4gIH1cblxuICBmdW5jdGlvbiBicm9hZGNhc3RIYW5kbGVyIChlKSB7XG4gICAgdmFyIGRhdGEgPSBlLmRhdGE7XG4gICAgaWYgKGRhdGEgJiYgZGF0YS5fX2Jyb2FkY2FzdCkge1xuICAgICAgaW50ZXJuYWxFbWl0dGVyLmVtaXQuYXBwbHkoeyBicm9hZGNhc3Q6IHRydWUgfSwgW2RhdGEudHlwZV0uY29uY2F0KGRhdGEucGF5bG9hZCkpO1xuICAgIH1cbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBzZXJpYWxpemVFcnJvciAoZXJyKSB7XG4gIHJldHVybiBlcnIgPyBlcnIudG9TdHJpbmcoKSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplRXJyb3IgKGVycikge1xuICByZXR1cm4gZXJyID8gbmV3IEVycm9yKGVycikgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXJzZVBheWxvYWQgKHBheWxvYWQpIHtcbiAgdmFyIHR5cGUgPSBwYXlsb2FkLnNoaWZ0KCk7XG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgcmV0dXJuIHsgZXJyb3I6IHNlcmlhbGl6ZUVycm9yKHBheWxvYWRbMF0pLCB0eXBlOiB0eXBlLCBwYXlsb2FkOiBbXSB9O1xuICB9XG4gIHJldHVybiB7IGVycm9yOiBudWxsLCB0eXBlOiB0eXBlLCBwYXlsb2FkOiBwYXlsb2FkIH07XG59XG5cbmZ1bmN0aW9uIGVtaXNzaW9uIChlbWl0dGVyLCBjb250ZXh0KSB7XG4gIHJldHVybiBlbWl0O1xuICBmdW5jdGlvbiBlbWl0IChlKSB7XG4gICAgdmFyIGRhdGEgPSBlLmRhdGE7XG4gICAgaWYgKGRhdGEudHlwZSA9PT0gJ2Vycm9yJykge1xuICAgICAgZW1pdHRlci5lbWl0LmNhbGwoY29udGV4dCwgJ2Vycm9yJywgZGVzZXJpYWxpemVFcnJvcihkYXRhLmVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXR0ZXIuZW1pdC5hcHBseShjb250ZXh0LCBbZGF0YS50eXBlXS5jb25jYXQoZGF0YS5wYXlsb2FkKSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwYXJzZVBheWxvYWQ6IHBhcnNlUGF5bG9hZCxcbiAgZW1pc3Npb246IGVtaXNzaW9uXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFnZSA9IHJlcXVpcmUoJy4vcGFnZScpO1xudmFyIHdvcmtlciA9IHJlcXVpcmUoJy4vd29ya2VyJyk7XG52YXIgYXBpO1xuXG5pZiAoJ3NlcnZpY2VXb3JrZXInIGluIG5hdmlnYXRvcikge1xuICBhcGkgPSBwYWdlKCk7XG59IGVsc2UgaWYgKCdjbGllbnRzJyBpbiBzZWxmKSB7XG4gIGFwaSA9IHdvcmtlcigpO1xufSBlbHNlIHtcbiAgYXBpID0ge1xuICAgIG9uOiBjb21wbGFpbixcbiAgICBvbmNlOiBjb21wbGFpbixcbiAgICBvZmY6IGNvbXBsYWluLFxuICAgIGVtaXQ6IGNvbXBsYWluLFxuICAgIGJyb2FkY2FzdDogY29tcGxhaW5cbiAgfTtcbn1cblxuZnVuY3Rpb24gY29tcGxhaW4gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ1N3aXZlbCBjb3VsZG5cXCd0IGRldGVjdCBTZXJ2aWNlV29ya2VyIHN1cHBvcnQuIFBsZWFzZSBmZWF0dXJlIGRldGVjdCBiZWZvcmUgdXNpbmcgU3dpdmVsIGluIHlvdXIgd2ViIHBhZ2VzIScpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgc2VyaWFsaXphdGlvbiA9IHJlcXVpcmUoJy4vc2VyaWFsaXphdGlvbicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNoYW5uZWw7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwgKCkge1xuICB2YXIgaW50ZXJuYWxFbWl0dGVyID0gZW1pdHRlcigpO1xuICB2YXIgYXBpID0ge1xuICAgIG9uOiBzZWxmZWQoJ29uJyksXG4gICAgb25jZTogc2VsZmVkKCdvbmNlJyksXG4gICAgb2ZmOiBzZWxmZWQoJ29mZicpLFxuICAgIGJyb2FkY2FzdDogYnJvYWRjYXN0VG9QYWdlc1xuICB9O1xuXG4gIHNlbGYuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIHBvc3RGcm9tUGFnZSk7XG5cbiAgcmV0dXJuIGFwaTtcblxuICBmdW5jdGlvbiBzZWxmZWQgKG1ldGhvZCkge1xuICAgIHJldHVybiBzZWxmaXNoO1xuICAgIGZ1bmN0aW9uIHNlbGZpc2ggKCkge1xuICAgICAgaW50ZXJuYWxFbWl0dGVyW21ldGhvZF0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBhcGk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcG9zdEZyb21QYWdlIChlKSB7XG4gICAgdmFyIGNsaWVudCA9IHsgcmVwbHk6IHJlcGx5IH07XG4gICAgc2VyaWFsaXphdGlvbi5lbWlzc2lvbihpbnRlcm5hbEVtaXR0ZXIsIGNsaWVudCkoZSk7XG4gICAgZnVuY3Rpb24gcmVwbHkgKCkge1xuICAgICAgdmFyIHBheWxvYWQgPSBzZXJpYWxpemF0aW9uLnBhcnNlUGF5bG9hZChhdG9hKGFyZ3VtZW50cykpO1xuICAgICAgcmV0dXJuIGUucG9ydHNbMF0ucG9zdE1lc3NhZ2UocGF5bG9hZCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYnJvYWRjYXN0VG9QYWdlcyAodHlwZSkge1xuICAgIHZhciBwYXlsb2FkID0gYXRvYShhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBzZWxmLmNsaWVudHMubWF0Y2hBbGwoKS50aGVuKGdvdENsaWVudHMpO1xuICAgIGZ1bmN0aW9uIGdvdENsaWVudHMgKGNsaWVudHMpIHtcbiAgICAgIHJldHVybiBjbGllbnRzLm1hcChlbWl0VG9DbGllbnQpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBlbWl0VG9DbGllbnQgKGNsaWVudCkge1xuICAgICAgcmV0dXJuIGNsaWVudC5wb3N0TWVzc2FnZSh7IHR5cGU6IHR5cGUsIHBheWxvYWQ6IHBheWxvYWQsIF9fYnJvYWRjYXN0OiB0cnVlIH0pO1xuICAgIH1cbiAgfVxufVxuIl19
