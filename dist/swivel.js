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
    broadcast: broadcastToPages,
    emit: replyTo
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
    var client = {
      reply: replyTo.bind(null, e.ports[0])
    };
    serialization.emission(internalEmitter, client)(e);
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
    client.postMessage(payload);
  }
}

},{"./serialization":6,"atoa":1,"contra/emitter":3}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYXRvYS9hdG9hLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9kZWJvdW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvbm9kZV9tb2R1bGVzL3RpY2t5L3RpY2t5LWJyb3dzZXIuanMiLCJwYWdlLmpzIiwic2VyaWFsaXphdGlvbi5qcyIsInN3aXZlbC5qcyIsIndvcmtlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRpY2t5ID0gcmVxdWlyZSgndGlja3knKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWJvdW5jZSAoZm4sIGFyZ3MsIGN0eCkge1xuICBpZiAoIWZuKSB7IHJldHVybjsgfVxuICB0aWNreShmdW5jdGlvbiBydW4gKCkge1xuICAgIGZuLmFwcGx5KGN0eCB8fCBudWxsLCBhcmdzIHx8IFtdKTtcbiAgfSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBkZWJvdW5jZSA9IHJlcXVpcmUoJy4vZGVib3VuY2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbWl0dGVyICh0aGluZywgb3B0aW9ucykge1xuICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBldnQgPSB7fTtcbiAgaWYgKHRoaW5nID09PSB1bmRlZmluZWQpIHsgdGhpbmcgPSB7fTsgfVxuICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICBldnRbdHlwZV0gPSBbZm5dO1xuICAgIH0gZWxzZSB7XG4gICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub25jZSA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgaWYgKGMgPT09IDEpIHtcbiAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgfSBlbHNlIGlmIChjID09PSAwKSB7XG4gICAgICBldnQgPSB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcuZW1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gIH07XG4gIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdCA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0Lmxlbmd0aCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBldC5mb3JFYWNoKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIGlmIChsaXN0ZW4uX29uY2UpIHsgdGhpbmcub2ZmKHR5cGUsIGxpc3Rlbik7IH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gIH07XG4gIHJldHVybiB0aGluZztcbn07XG4iLCJ2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuaWYgKHNpKSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbn0gZWxzZSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGljazsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBhdG9hID0gcmVxdWlyZSgnYXRvYScpO1xudmFyIHNlcmlhbGl6YXRpb24gPSByZXF1aXJlKCcuL3NlcmlhbGl6YXRpb24nKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhL2VtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVDaGFubmVsO1xuXG5mdW5jdGlvbiBjcmVhdGVDaGFubmVsICgpIHtcbiAgdmFyIGludGVybmFsRW1pdHRlciA9IGVtaXR0ZXIoKTtcbiAgdmFyIGFwaSA9IHtcbiAgICBvbjogc2VsZmVkKCdvbicpLFxuICAgIG9uY2U6IHNlbGZlZCgnb25jZScpLFxuICAgIG9mZjogc2VsZmVkKCdvZmYnKSxcbiAgICBlbWl0OiBwb3N0VG9Xb3JrZXJcbiAgfTtcbiAgdmFyIHBvc3RGcm9tV29ya2VyID0gc2VyaWFsaXphdGlvbi5lbWlzc2lvbihpbnRlcm5hbEVtaXR0ZXIsIHsgYnJvYWRjYXN0OiBmYWxzZSB9KTtcbiAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIub25tZXNzYWdlID0gYnJvYWRjYXN0SGFuZGxlcjtcbiAgcmV0dXJuIGFwaTtcblxuICBmdW5jdGlvbiBzZWxmZWQgKG1ldGhvZCkge1xuICAgIHJldHVybiBzZWxmaXNoO1xuICAgIGZ1bmN0aW9uIHNlbGZpc2ggKCkge1xuICAgICAgaW50ZXJuYWxFbWl0dGVyW21ldGhvZF0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBhcGk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcG9zdFRvV29ya2VyICgpIHtcbiAgICB2YXIgcGF5bG9hZCA9IHNlcmlhbGl6YXRpb24ucGFyc2VQYXlsb2FkKGF0b2EoYXJndW1lbnRzKSk7XG4gICAgdmFyIG1lc3NhZ2VDaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgbWVzc2FnZUNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gcG9zdEZyb21Xb3JrZXI7XG4gICAgaWYgKG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLmNvbnRyb2xsZXIgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1NlcnZpY2VXb3JrZXIgY29udHJvbGxlciBub3QgZm91bmQuJykpO1xuICAgIH1cbiAgICByZXR1cm4gbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIuY29udHJvbGxlci5wb3N0TWVzc2FnZShwYXlsb2FkLCBbbWVzc2FnZUNoYW5uZWwucG9ydDJdKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJyb2FkY2FzdEhhbmRsZXIgKGUpIHtcbiAgICB2YXIgZGF0YSA9IGUuZGF0YTtcbiAgICBpZiAoZGF0YSAmJiBkYXRhLl9fYnJvYWRjYXN0KSB7XG4gICAgICBpbnRlcm5hbEVtaXR0ZXIuZW1pdC5hcHBseSh7IGJyb2FkY2FzdDogdHJ1ZSB9LCBbZGF0YS50eXBlXS5jb25jYXQoZGF0YS5wYXlsb2FkKSk7XG4gICAgfVxuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUVycm9yIChlcnIpIHtcbiAgcmV0dXJuIGVyciA/IGVyci50b1N0cmluZygpIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gZGVzZXJpYWxpemVFcnJvciAoZXJyKSB7XG4gIHJldHVybiBlcnIgPyBuZXcgRXJyb3IoZXJyKSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBhcnNlUGF5bG9hZCAocGF5bG9hZCkge1xuICB2YXIgdHlwZSA9IHBheWxvYWQuc2hpZnQoKTtcbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICByZXR1cm4geyBlcnJvcjogc2VyaWFsaXplRXJyb3IocGF5bG9hZFswXSksIHR5cGU6IHR5cGUsIHBheWxvYWQ6IFtdIH07XG4gIH1cbiAgcmV0dXJuIHsgZXJyb3I6IG51bGwsIHR5cGU6IHR5cGUsIHBheWxvYWQ6IHBheWxvYWQgfTtcbn1cblxuZnVuY3Rpb24gZW1pc3Npb24gKGVtaXR0ZXIsIGNvbnRleHQpIHtcbiAgcmV0dXJuIGVtaXQ7XG4gIGZ1bmN0aW9uIGVtaXQgKGUpIHtcbiAgICB2YXIgZGF0YSA9IGUuZGF0YTtcbiAgICBpZiAoZGF0YS50eXBlID09PSAnZXJyb3InKSB7XG4gICAgICBlbWl0dGVyLmVtaXQuY2FsbChjb250ZXh0LCAnZXJyb3InLCBkZXNlcmlhbGl6ZUVycm9yKGRhdGEuZXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0LmFwcGx5KGNvbnRleHQsIFtkYXRhLnR5cGVdLmNvbmNhdChkYXRhLnBheWxvYWQpKTtcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHBhcnNlUGF5bG9hZDogcGFyc2VQYXlsb2FkLFxuICBlbWlzc2lvbjogZW1pc3Npb25cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBwYWdlID0gcmVxdWlyZSgnLi9wYWdlJyk7XG52YXIgd29ya2VyID0gcmVxdWlyZSgnLi93b3JrZXInKTtcbnZhciBhcGk7XG5cbmlmICgnc2VydmljZVdvcmtlcicgaW4gbmF2aWdhdG9yKSB7XG4gIGFwaSA9IHBhZ2UoKTtcbn0gZWxzZSBpZiAoJ2NsaWVudHMnIGluIHNlbGYpIHtcbiAgYXBpID0gd29ya2VyKCk7XG59IGVsc2Uge1xuICBhcGkgPSB7XG4gICAgb246IGNvbXBsYWluLFxuICAgIG9uY2U6IGNvbXBsYWluLFxuICAgIG9mZjogY29tcGxhaW4sXG4gICAgZW1pdDogY29tcGxhaW4sXG4gICAgYnJvYWRjYXN0OiBjb21wbGFpblxuICB9O1xufVxuXG5mdW5jdGlvbiBjb21wbGFpbiAoKSB7XG4gIHRocm93IG5ldyBFcnJvcignU3dpdmVsIGNvdWxkblxcJ3QgZGV0ZWN0IFNlcnZpY2VXb3JrZXIgc3VwcG9ydC4gUGxlYXNlIGZlYXR1cmUgZGV0ZWN0IGJlZm9yZSB1c2luZyBTd2l2ZWwgaW4geW91ciB3ZWIgcGFnZXMhJyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYXBpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBzZXJpYWxpemF0aW9uID0gcmVxdWlyZSgnLi9zZXJpYWxpemF0aW9uJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS9lbWl0dGVyJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gY3JlYXRlQ2hhbm5lbDtcblxuZnVuY3Rpb24gY3JlYXRlQ2hhbm5lbCAoKSB7XG4gIHZhciBpbnRlcm5hbEVtaXR0ZXIgPSBlbWl0dGVyKCk7XG4gIHZhciBhcGkgPSB7XG4gICAgb246IHNlbGZlZCgnb24nKSxcbiAgICBvbmNlOiBzZWxmZWQoJ29uY2UnKSxcbiAgICBvZmY6IHNlbGZlZCgnb2ZmJyksXG4gICAgYnJvYWRjYXN0OiBicm9hZGNhc3RUb1BhZ2VzLFxuICAgIGVtaXQ6IHJlcGx5VG9cbiAgfTtcblxuICBzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBwb3N0RnJvbVBhZ2UpO1xuXG4gIHJldHVybiBhcGk7XG5cbiAgZnVuY3Rpb24gc2VsZmVkIChtZXRob2QpIHtcbiAgICByZXR1cm4gc2VsZmlzaDtcbiAgICBmdW5jdGlvbiBzZWxmaXNoICgpIHtcbiAgICAgIGludGVybmFsRW1pdHRlclttZXRob2RdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gYXBpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBvc3RGcm9tUGFnZSAoZSkge1xuICAgIHZhciBjbGllbnQgPSB7XG4gICAgICByZXBseTogcmVwbHlUby5iaW5kKG51bGwsIGUucG9ydHNbMF0pXG4gICAgfTtcbiAgICBzZXJpYWxpemF0aW9uLmVtaXNzaW9uKGludGVybmFsRW1pdHRlciwgY2xpZW50KShlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJyb2FkY2FzdFRvUGFnZXMgKHR5cGUpIHtcbiAgICB2YXIgcGF5bG9hZCA9IGF0b2EoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gc2VsZi5jbGllbnRzLm1hdGNoQWxsKCkudGhlbihnb3RDbGllbnRzKTtcbiAgICBmdW5jdGlvbiBnb3RDbGllbnRzIChjbGllbnRzKSB7XG4gICAgICByZXR1cm4gY2xpZW50cy5tYXAoZW1pdFRvQ2xpZW50KTtcbiAgICB9XG4gICAgZnVuY3Rpb24gZW1pdFRvQ2xpZW50IChjbGllbnQpIHtcbiAgICAgIHJldHVybiBjbGllbnQucG9zdE1lc3NhZ2UoeyB0eXBlOiB0eXBlLCBwYXlsb2FkOiBwYXlsb2FkLCBfX2Jyb2FkY2FzdDogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiByZXBseVRvIChjbGllbnQpIHtcbiAgICB2YXIgcGF5bG9hZCA9IHNlcmlhbGl6YXRpb24ucGFyc2VQYXlsb2FkKGF0b2EoYXJndW1lbnRzLCAxKSk7XG4gICAgY2xpZW50LnBvc3RNZXNzYWdlKHBheWxvYWQpO1xuICB9XG59XG4iXX0=
