# swivel

> Message passing between `ServiceWorker` and pages made simple

# Inspiration

[Understanding the raw API][3] for message passing between `ServiceWorker` and pages can be kind of confusing. There's `MessageChannel`, ports, `postMessage` deeply buried in `navigator.serviceWorker.controller.postMessage`, `addEventListener`, multiple `ServiceWorkerRegistration` instances, and even promises are involved.

`ServiceWorker` is too awesome to let this problem hinder its adoption, so I made `swivel` in hopes people will find it easier to share messages across pages and their `ServiceWorker`. For an introduction of `ServiceWorker` you should look at [this article][1].

> I named it `swivel` mostly because it starts with `sw` and it wasn't taken on `npm`. And, [because][2].

# Installation

Install it from `npm`. You can then include `swivel` in your pages and your `ServiceWorker`, and Swivel will figure out what API to export depending on whether it's running within the `ServiceWorker` or a regular web page.

```shell
npm i -S swivel
```

# Usage

On your web pages, you can listen for messages from the `ServiceWorker`. Remember to wait for `ServiceWorker` to become active, and always feature test to ensure `ServiceWorker` is available.

```js
if (!('serviceWorker' in navigator)) {
  return;
}
navigator.serviceWorker
  .register('/service-worker.js')
  .then(navigator.serviceWorker.ready)
  .then(function () {
    swivel.on('data', function handler (context, ...data) {
      // do something with ...data
    });
  });
```

You can also emit messages to the `ServiceWorker` from your pages.

```js
swivel.emit('data', ...data);
```

Emitting returns a `Promise`, in case you want to wait until the message is transferred to do something else.

```js
swivel.emit('data', ...data).then(function () {
  // ... more swivelling!
});
```

In your `ServiceWorker`, the API barely changes. You can listen to messages posted from web pages with `swivel.emit` using `swivel.on` in the `ServiceWorker` code.

```js
swivel.on('data', function handler (context, ...data) {
  // do something with ...data
});
```

If you need to reply to this particular page in the `ServiceWorker`, you could just use code like the following.


```js
swivel.on('data', function handler (context, ...data) {
  context.reply('data', ...response);
});
```

You guessed correctly, `context.reply` returns a `Promise`.

```js
swivel.on('data', function handler (context, ...data) {
  context.reply('data', ...response).then(function () {
    // ... more swivelling!
  });
});
```

You can also emit messages to every page using `swivel.broadcast`.

```js
swivel.broadcast(type, ...data);
```

Broadcast also returns a `Promise` that awaits all `client.postMessage` signals to be processed.

```js
swivel.broadcast(type, ...data).then(function () {
  // ... more swivelling!
});
```

Pages can then listen for the `type` event, which will go out to every page controlled by the `ServiceWorker`.

```js
swivel.on(type, function (...data) {
  // do something with ...data
});
```

# Importing

The `swivel` package performs a convenient bit of feature testing in order to decide what API to export. In your web pages, it'll export an API corresponding to web pages. In a `ServiceWorker` script, it'll export an API corresponding to the `ServiceWorker` side.

#### Automatic

```js
import swivel from 'swivel'
```

If you prefer being explicit, you could `import` the individual modules separately.

#### Manual

Here's an example of manual setup for your web pages.

```js
import createChannel from 'swivel/page'
var swivel = createChannel()
```

Here's an example of manual setup for your `ServiceWorker` script.

```js
import createChannel from 'swivel/worker'
var swivel = createChannel()
```

# API in Web Pages

The public `swivel` API exports a number of methods designed for web pages.

## `swivel.on(type, handler)`

This method listens for events emitted by the [`ServiceWorker` API][sw-api]. You can bind an event handler that receives all arguments emitted at that level. It can be triggered from a `ServiceWorker` in 3 different ways. Returns [`swivel`][wp-api] for chaining.

The following methods -- when called from a `ServiceWorker` -- trigger handlers registered with `swivel.on(type, fn)` on web pages.

- [`swivel.broadcast(type, ...data)`][sw-broadcast] _(message is broadcasted to every page)_
- [`swivel.emit(clientId, type, ...data)`][sw-emit] _(message is unicasted using `client.postMessage`)_
- [`context.reply(type, ...data)`][sw-reply] _(message is unicasted using `MessageChannel`)_

The handler has a `context, ...data` signature.

A `context.broadcast` flag in the `handler` indicates whether the message was broadcasted or unicasted by the `ServiceWorker`.

##### Example

```js
swivel.on('data', function handler (context, ...data) {
  console.log(...data);
});
```

## `swivel.once(type, handler)`

Equivalent to [`swivel.on`][wp-listen] but will only ever be called once. Returns [`swivel`][wp-api] for chaining.

##### Example

```js
swivel.once('data', function handler (context, ...data) {
  console.log(...data);
});
```

## `swivel.off(type, handler)`

Unregisters a `handler` of type `type` that was previously registered using [`swivel.on`][wp-listen] or [`swivel.once`][wp-once]. Returns [`swivel`][wp-api] for chaining.

##### Example

```js
swivel.on('data', function handler (context, ...data) {
  swivel.off('data', handler);
});
```

## `swivel.emit(type, ...data)`

This method posts a message to the `ServiceWorker`. You can then use [`swivel.on(type, handler)`][sw-listen] from the `ServiceWorker` to listen to it.

##### Example

```js
swivel.emit('data', { foo: 'bar' }, 'baz');
```

This method returns a `Promise` so you can await for the message to be successfully transferred to the `ServiceWorker`.

##### Example

```js
swivel.emit('data', { foo: 'bar' }, 'baz').then(function () {
  console.log('success');
});
```

## `swivel.at(worker)`

The `swivel.at(worker)` method returns an API identical to [`swivel`][wp-api] that talks strictly with `worker`. The default `swivel` API interacts with the worker found at `navigator.serviceWorker.controller`. You can use as many channels as necessary.

##### Example

```js
navigator.serviceWorker
  .getRegistration('/other')
  .then(function (registration) {
    var otherChannel = swivel.at(registration.active);
    otherChannel.emit('data', { hello: 'world' });
    otherChannel.on('data', function handler (context, ...data) {
      console.log(...data);
    });
  });
```

# API in `ServiceWorker`

The public `swivel` API exports a number of methods designed for `ServiceWorker` scripts.

## `swivel.broadcast(type, ...data)`

This method sends a message of type `type` from the `ServiceWorker` to every client it controls. Pages can listen for broadcasted messages using [`swivel.on`][wp-listen] or [`swivel.once`][wp-once].

##### Example

```js
swivel.broadcast('urgent', ...data);
```

This method returns a `Promise` so you can await for the message to be successfully transferred to all clients.

##### Example

```js
swivel.broadcast('urgent', ...data).then(function () {
  console.log('success');
});
```

## `swivel.emit(clientId, type, ...data)`

During `fetch` events in a `ServiceWorker`, it's possible to message a client using `swivel.emit`. The web page can then receive and handle the message using [`swivel.on`][wp-listen].

##### Example

```js
self.addEventListener('fetch', function (e) {
  swivel.emit(e.clientId, 'data', { foo: 'bar' });
});
```

Furthermore, `swivel.emit` returns a `Promise`, so you can await for the message to be successfully transferred.

##### Example

```js
self.addEventListener('fetch', function (e) {
  swivel.emit(e.clientId, 'data', { foo: 'bar' }).then(function () {
    console.log('success');
  });
});
```

## `swivel.on(type, handler)`

You can use this method to listen from messages sent from a web page to the `ServiceWorker` using [`swivel.emit`][wp-emit]. Returns [`swivel`][sw-api] for chaining.

##### Example

```js
swivel.on('data', function handler (context, ...data) {
  console.log(...data);
});
```

The event `handler` is provided with a `context` object that allows for replies to messages originating from a web page.

### `context.reply(type, ...data)`

Using this method, your `ServiceWorker` can reply to messages received from an individual web page.

##### Example

```js
swivel.on('data', function handler (context, [x, y]) {
  context.reply('result', x * y);
});
```

Furthermore, `context.reply` returns a `Promise`, so you can await for the reply to be successfully transferred.

##### Example

```js
swivel.on('data', function handler (context, [x, y]) {
  context.reply('result', x * y).then(function () {
    console.log('success');
  });
});
```

## `swivel.once(type, handler)`

Equivalent to [`swivel.on`][sw-listen] but will only ever be called once. Returns [`swivel`][sw-api] for chaining. Also able to use [`context.reply`][sw-reply] in `handler(context, ...data)` for bidirectional communication.

##### Example

```js
swivel.once('data', function handler (context, [x, y]) {
  context.reply('result', x * y).then(function () {
    console.log('success');
  });
});
```

## `swivel.off(type, handler)`

Unregisters a `handler` of type `type` that was previously registered using [`swivel.on`][sw-listen] or [`swivel.once`][sw-once]. Returns [`swivel`][sw-api] for chaining.

##### Example

```js
swivel.on('data', function handler (context, ...data) {
  swivel.off('data', handler);
});
```

# License

MIT

[1]: https://ponyfoo.com/articles/serviceworker-revolution "ServiceWorker: Revolution of the Web Platform on Pony Foo"
[wp-api]: #api-in-web-pages
[wp-listen]: #swivelontype-handler
[wp-once]: #swiveloncetype-handler
[wp-emit]: #swivelemittype-data
[sw-api]: #api-in-serviceworker
[sw-listen]: #swivelontype-handler-2
[sw-once]: #swiveloncetype-handler-2
[sw-broadcast]: #swivelbroadcasttype-data
[sw-reply]: #contextreplytype-data
[sw-emit]: #swivelemitclientid-type-data
[2]: https://i.imgur.com/Svqju4J.gif
[3]: https://ponyfoo.com/articles/serviceworker-messagechannel-postmessage "ServiceWorker, MessageChannel, & postMessage on Pony Foo"
