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
    return self.clients.match(e.clientId).then(replyTo);
  }
}

},{"./serialization":6,"atoa":1,"contra/emitter":3}]},{},[7])(7)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYXRvYS9hdG9hLmpzIiwibm9kZV9tb2R1bGVzL2NvbnRyYS9kZWJvdW5jZS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZW1pdHRlci5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvbm9kZV9tb2R1bGVzL3RpY2t5L3RpY2t5LWJyb3dzZXIuanMiLCJwYWdlLmpzIiwic2VyaWFsaXphdGlvbi5qcyIsInN3aXZlbC5qcyIsIndvcmtlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHRpY2t5ID0gcmVxdWlyZSgndGlja3knKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBkZWJvdW5jZSAoZm4sIGFyZ3MsIGN0eCkge1xuICBpZiAoIWZuKSB7IHJldHVybjsgfVxuICB0aWNreShmdW5jdGlvbiBydW4gKCkge1xuICAgIGZuLmFwcGx5KGN0eCB8fCBudWxsLCBhcmdzIHx8IFtdKTtcbiAgfSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYXRvYSA9IHJlcXVpcmUoJ2F0b2EnKTtcbnZhciBkZWJvdW5jZSA9IHJlcXVpcmUoJy4vZGVib3VuY2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBlbWl0dGVyICh0aGluZywgb3B0aW9ucykge1xuICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gIHZhciBldnQgPSB7fTtcbiAgaWYgKHRoaW5nID09PSB1bmRlZmluZWQpIHsgdGhpbmcgPSB7fTsgfVxuICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGlmICghZXZ0W3R5cGVdKSB7XG4gICAgICBldnRbdHlwZV0gPSBbZm5dO1xuICAgIH0gZWxzZSB7XG4gICAgICBldnRbdHlwZV0ucHVzaChmbik7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcub25jZSA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICB0aGluZy5vbih0eXBlLCBmbik7XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5vZmYgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICB2YXIgYyA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgaWYgKGMgPT09IDEpIHtcbiAgICAgIGRlbGV0ZSBldnRbdHlwZV07XG4gICAgfSBlbHNlIGlmIChjID09PSAwKSB7XG4gICAgICBldnQgPSB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGV0ID0gZXZ0W3R5cGVdO1xuICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgIGV0LnNwbGljZShldC5pbmRleE9mKGZuKSwgMSk7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbiAgfTtcbiAgdGhpbmcuZW1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IGF0b2EoYXJndW1lbnRzKTtcbiAgICByZXR1cm4gdGhpbmcuZW1pdHRlclNuYXBzaG90KGFyZ3Muc2hpZnQoKSkuYXBwbHkodGhpcywgYXJncyk7XG4gIH07XG4gIHRoaW5nLmVtaXR0ZXJTbmFwc2hvdCA9IGZ1bmN0aW9uICh0eXBlKSB7XG4gICAgdmFyIGV0ID0gKGV2dFt0eXBlXSB8fCBbXSkuc2xpY2UoMCk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIGN0eCA9IHRoaXMgfHwgdGhpbmc7XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0Lmxlbmd0aCkgeyB0aHJvdyBhcmdzLmxlbmd0aCA9PT0gMSA/IGFyZ3NbMF0gOiBhcmdzOyB9XG4gICAgICBldC5mb3JFYWNoKGZ1bmN0aW9uIGVtaXR0ZXIgKGxpc3Rlbikge1xuICAgICAgICBpZiAob3B0cy5hc3luYykgeyBkZWJvdW5jZShsaXN0ZW4sIGFyZ3MsIGN0eCk7IH0gZWxzZSB7IGxpc3Rlbi5hcHBseShjdHgsIGFyZ3MpOyB9XG4gICAgICAgIGlmIChsaXN0ZW4uX29uY2UpIHsgdGhpbmcub2ZmKHR5cGUsIGxpc3Rlbik7IH1cbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaW5nO1xuICAgIH07XG4gIH07XG4gIHJldHVybiB0aGluZztcbn07XG4iLCJ2YXIgc2kgPSB0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nLCB0aWNrO1xuaWYgKHNpKSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbn0gZWxzZSB7XG4gIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gdGljazsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBhdG9hID0gcmVxdWlyZSgnYXRvYScpO1xudmFyIHNlcmlhbGl6YXRpb24gPSByZXF1aXJlKCcuL3NlcmlhbGl6YXRpb24nKTtcbnZhciBlbWl0dGVyID0gcmVxdWlyZSgnY29udHJhL2VtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVDaGFubmVsO1xuXG5mdW5jdGlvbiBjcmVhdGVDaGFubmVsICgpIHtcbiAgdmFyIGNoYW5uZWwgPSBhdChuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5jb250cm9sbGVyKTtcbiAgcmV0dXJuIGNoYW5uZWw7XG5cbiAgZnVuY3Rpb24gYXQgKHdvcmtlcikge1xuICAgIHZhciBpbnRlcm5hbEVtaXR0ZXIgPSBlbWl0dGVyKCk7XG4gICAgdmFyIGFwaSA9IHtcbiAgICAgIG9uOiBzZWxmZWQoJ29uJyksXG4gICAgICBvbmNlOiBzZWxmZWQoJ29uY2UnKSxcbiAgICAgIG9mZjogc2VsZmVkKCdvZmYnKSxcbiAgICAgIGVtaXQ6IHBvc3RUb1dvcmtlcixcbiAgICAgIGF0OiBhdFxuICAgIH07XG4gICAgdmFyIHBvc3RGcm9tV29ya2VyID0gc2VyaWFsaXphdGlvbi5lbWlzc2lvbihpbnRlcm5hbEVtaXR0ZXIsIHsgYnJvYWRjYXN0OiBmYWxzZSB9KTtcbiAgICBuYXZpZ2F0b3Iuc2VydmljZVdvcmtlci5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgYnJvYWRjYXN0SGFuZGxlcik7XG4gICAgcmV0dXJuIGFwaTtcblxuICAgIGZ1bmN0aW9uIHNlbGZlZCAobWV0aG9kKSB7XG4gICAgICByZXR1cm4gZnVuY3Rpb24gc2VsZmlzaCAoKSB7XG4gICAgICAgIGludGVybmFsRW1pdHRlclttZXRob2RdLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiBhcGk7XG4gICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBvc3RUb1dvcmtlciAoKSB7XG4gICAgICBpZiAoIXdvcmtlcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdTZXJ2aWNlV29ya2VyIG5vdCBmb3VuZC4nKSk7XG4gICAgICB9XG4gICAgICB2YXIgcGF5bG9hZCA9IHNlcmlhbGl6YXRpb24ucGFyc2VQYXlsb2FkKGF0b2EoYXJndW1lbnRzKSk7XG4gICAgICB2YXIgbWVzc2FnZUNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcbiAgICAgIG1lc3NhZ2VDaGFubmVsLnBvcnQxLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBwb3N0RnJvbVdvcmtlcik7XG4gICAgICByZXR1cm4gd29ya2VyLnBvc3RNZXNzYWdlKHBheWxvYWQsIFttZXNzYWdlQ2hhbm5lbC5wb3J0Ml0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJyb2FkY2FzdEhhbmRsZXIgKGUpIHtcbiAgICAgIGlmIChlLnNvdXJjZSAhPT0gd29ya2VyKSB7XG4gICAgICAgIHJldHVybjsgLy8gaWdub3JlIGJyb2FkY2FzdCBtZXNzYWdlcyBmcm9tIG90aGVyIHdvcmtlcnMgdGhhbiB0aGUgb25lIHdlJ3JlIHRhbGtpbmcgdG8uXG4gICAgICB9XG4gICAgICB2YXIgZGF0YSA9IGUuZGF0YTtcbiAgICAgIGlmIChkYXRhICYmIGRhdGEuX19icm9hZGNhc3QpIHtcbiAgICAgICAgc2VyaWFsaXphdGlvbi5lbWlzc2lvbihpbnRlcm5hbEVtaXR0ZXIsIHsgYnJvYWRjYXN0OiB0cnVlIH0pKGUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBzZXJpYWxpemVFcnJvciAoZXJyKSB7XG4gIHJldHVybiBlcnIgPyBlcnIudG9TdHJpbmcoKSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplRXJyb3IgKGVycikge1xuICByZXR1cm4gZXJyID8gbmV3IEVycm9yKGVycikgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBwYXJzZVBheWxvYWQgKHBheWxvYWQpIHtcbiAgdmFyIHR5cGUgPSBwYXlsb2FkLnNoaWZ0KCk7XG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgcmV0dXJuIHsgZXJyb3I6IHNlcmlhbGl6ZUVycm9yKHBheWxvYWRbMF0pLCB0eXBlOiB0eXBlLCBwYXlsb2FkOiBbXSB9O1xuICB9XG4gIHJldHVybiB7IGVycm9yOiBudWxsLCB0eXBlOiB0eXBlLCBwYXlsb2FkOiBwYXlsb2FkIH07XG59XG5cbmZ1bmN0aW9uIGVtaXNzaW9uIChlbWl0dGVyLCBjb250ZXh0KSB7XG4gIHJldHVybiBlbWl0O1xuICBmdW5jdGlvbiBlbWl0IChlKSB7XG4gICAgdmFyIGRhdGEgPSBlLmRhdGE7XG4gICAgaWYgKGRhdGEudHlwZSA9PT0gJ2Vycm9yJykge1xuICAgICAgZW1pdHRlci5lbWl0LmNhbGwobnVsbCwgJ2Vycm9yJywgY29udGV4dCwgZGVzZXJpYWxpemVFcnJvcihkYXRhLmVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVtaXR0ZXIuZW1pdC5hcHBseShudWxsLCBbZGF0YS50eXBlLCBjb250ZXh0XS5jb25jYXQoZGF0YS5wYXlsb2FkKSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwYXJzZVBheWxvYWQ6IHBhcnNlUGF5bG9hZCxcbiAgZW1pc3Npb246IGVtaXNzaW9uXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcGFnZSA9IHJlcXVpcmUoJy4vcGFnZScpO1xudmFyIHdvcmtlciA9IHJlcXVpcmUoJy4vd29ya2VyJyk7XG52YXIgYXBpO1xuXG5pZiAoJ3NlcnZpY2VXb3JrZXInIGluIG5hdmlnYXRvcikge1xuICBhcGkgPSBwYWdlKCk7XG59IGVsc2UgaWYgKCdjbGllbnRzJyBpbiBzZWxmKSB7XG4gIGFwaSA9IHdvcmtlcigpO1xufSBlbHNlIHtcbiAgYXBpID0ge1xuICAgIG9uOiBjb21wbGFpbixcbiAgICBvbmNlOiBjb21wbGFpbixcbiAgICBvZmY6IGNvbXBsYWluLFxuICAgIGVtaXQ6IGNvbXBsYWluLFxuICAgIGJyb2FkY2FzdDogY29tcGxhaW5cbiAgfTtcbn1cblxuZnVuY3Rpb24gY29tcGxhaW4gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoJ1N3aXZlbCBjb3VsZG5cXCd0IGRldGVjdCBTZXJ2aWNlV29ya2VyIHN1cHBvcnQuIFBsZWFzZSBmZWF0dXJlIGRldGVjdCBiZWZvcmUgdXNpbmcgU3dpdmVsIGluIHlvdXIgd2ViIHBhZ2VzIScpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGF0b2EgPSByZXF1aXJlKCdhdG9hJyk7XG52YXIgc2VyaWFsaXphdGlvbiA9IHJlcXVpcmUoJy4vc2VyaWFsaXphdGlvbicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUNoYW5uZWw7XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYW5uZWwgKCkge1xuICB2YXIgaW50ZXJuYWxFbWl0dGVyID0gZW1pdHRlcigpO1xuICB2YXIgYXBpID0ge1xuICAgIG9uOiBzZWxmZWQoJ29uJyksXG4gICAgb25jZTogc2VsZmVkKCdvbmNlJyksXG4gICAgb2ZmOiBzZWxmZWQoJ29mZicpLFxuICAgIGJyb2FkY2FzdDogYnJvYWRjYXN0VG9QYWdlcyxcbiAgICBlbWl0OiByZXBseVRvQ2xpZW50XG4gIH07XG5cbiAgc2VsZi5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcG9zdEZyb21QYWdlKTtcblxuICByZXR1cm4gYXBpO1xuXG4gIGZ1bmN0aW9uIHNlbGZlZCAobWV0aG9kKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIHNlbGZpc2ggKCkge1xuICAgICAgaW50ZXJuYWxFbWl0dGVyW21ldGhvZF0uYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBhcGk7XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBvc3RGcm9tUGFnZSAoZSkge1xuICAgIHZhciBjb250ZXh0ID0ge1xuICAgICAgcmVwbHk6IHJlcGx5VG9QYWdlKGUpXG4gICAgfTtcbiAgICBzZXJpYWxpemF0aW9uLmVtaXNzaW9uKGludGVybmFsRW1pdHRlciwgY29udGV4dCkoZSk7XG4gIH1cblxuICBmdW5jdGlvbiBicm9hZGNhc3RUb1BhZ2VzICh0eXBlKSB7XG4gICAgdmFyIHBheWxvYWQgPSBhdG9hKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIHNlbGYuY2xpZW50cy5tYXRjaEFsbCgpLnRoZW4oZ290Q2xpZW50cyk7XG4gICAgZnVuY3Rpb24gZ290Q2xpZW50cyAoY2xpZW50cykge1xuICAgICAgcmV0dXJuIGNsaWVudHMubWFwKGVtaXRUb0NsaWVudCk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGVtaXRUb0NsaWVudCAoY2xpZW50KSB7XG4gICAgICByZXR1cm4gY2xpZW50LnBvc3RNZXNzYWdlKHsgdHlwZTogdHlwZSwgcGF5bG9hZDogcGF5bG9hZCwgX19icm9hZGNhc3Q6IHRydWUgfSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcmVwbHlUbyAoY2xpZW50KSB7XG4gICAgdmFyIHBheWxvYWQgPSBzZXJpYWxpemF0aW9uLnBhcnNlUGF5bG9hZChhdG9hKGFyZ3VtZW50cywgMSkpO1xuICAgIHJldHVybiBjbGllbnQucG9zdE1lc3NhZ2UocGF5bG9hZCk7XG4gIH1cblxuICBmdW5jdGlvbiByZXBseVRvUGFnZSAoZSkge1xuICAgIHJldHVybiByZXBseVRvLmJpbmQobnVsbCwgZS5wb3J0c1swXSk7XG4gIH1cblxuICBmdW5jdGlvbiByZXBseVRvQ2xpZW50IChjbGllbnRJZCkge1xuICAgIHJldHVybiBzZWxmLmNsaWVudHMubWF0Y2goZS5jbGllbnRJZCkudGhlbihyZXBseVRvKTtcbiAgfVxufVxuIl19
