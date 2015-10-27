# swivel

> Message passing between `ServiceWorker` and pages made simple

# Inspiration

Understanding the raw API for message passing between `ServiceWorker` and pages can be kind of confusing. There's `MessageChannel`, ports, `postMessage` deeply buried in `navigator.serviceWorker.controller.postMessage`, `addEventListener`, and even promises are involved.

`ServiceWorker` is too awesome to let this problem hinder its adoption, so I made `swivel` in hopes people will find it easier to share messages across pages and their `ServiceWorker`. For an introduction of `ServiceWorker` you should look at [this article][1].

> I named it `swivel` mostly because it starts with `sw` and it wasn't taken on `npm`.

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
    swivel.on('data', function (...data) {
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
swivel.on('data', function (...data) {
  // do something with ...data
});
```

If you need to reply to this particular page in the `ServiceWorker`, you could just use code like the following.


```js
swivel.on('data', function (...data) {
  this.reply('data', ...response);
});
```

You guessed correctly, `this.reply` returns a `Promise`.

```js
swivel.on('data', function (...data) {
  this.reply('data', ...response).then(function () {
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

This method listens for events emitted by the [`ServiceWorker` API][sw-api]. You can bind an event handler that receives all arguments emitted at that level. It can be triggered from a `ServiceWorker` in two different ways. Returns [`swivel`][wp-api] for chaining.

- [`swivel.broadcast(type, ...data)`][sw-broadcast] triggers handlers registered with `swivel.on(type, fn)` on every page
- `this.reply(type, ...data)` triggers handlers registered with `swivel.on(type, fn)`

To differentiate between the two, you may check the `this.broadcast` boolean property in your `handler`.

##### Example

```js
swivel.on('data', function (datum1, datum2) {
  console.log(datum1, datum2);
});
```

## `swivel.once(type, handler)`

Equivalent to [`swivel.on`][wp-listen] but will only ever be called once. Returns [`swivel`][wp-api] for chaining.

##### Example

```js
swivel.once('data', function (datum1, datum2) {
  console.log(datum1, datum2);
});
```

## `swivel.off(type, handler)`

Unregisters a `handler` of type `type` that was previously registered using [`swivel.on`][wp-listen] or [`swivel.once`][wp-once]. Returns [`swivel`][wp-api] for chaining.

##### Example

```js
swivel.on('data', function handler (datum1, datum2) {
  console.log(datum1, datum2);
  if (datum1 === 'end') {
    swivel.off('data', handler);
  }
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

# API in `ServiceWorker`

The public `swivel` API exports a number of methods designed for `ServiceWorker` scripts.

## `swivel.broadcast(type, ...data)`

This method sends a message of type `type` from the `ServiceWorker` to every client it controls. Pages can listen for broadcasted messages using [`swivel.on`][wp-listen] or [`swivel.once`][wp-once].

##### Example

```js
swivel.broadcast('urgent', 'news', 'New pope elected');
```

This method returns a `Promise` so you can await for the message to be successfully transferred to all clients.

##### Example

```js
swivel.broadcast('urgent', 'news', 'New pope elected').then(function () {
  console.log('success');
});
```

## `swivel.on(type, handler)`

You can use this method to listen from messages sent from a web page to the `ServiceWorker` using [`swivel.emit`][wp-emit]. Returns [`swivel`][sw-api] for chaining.

##### Example

```js
swivel.on('data', function (datum1, datum2) {
  console.log(datum1, datum2);
});
```

The event `handler` is provided with a `this` context that's able to reply to messages originating from a web page.

### `this.reply(type, ...data)`

Using this method, your `ServiceWorker` can reply to messages received from an individual web page.

##### Example

```js
swivel.on('data', function (datum1, datum2) {
  console.log(datum1, datum2);
  this.reply('datum3', datum1 * datum2);
});
```

Furthermore, `this.reply` returns a `Promise`, so you can await for the reply to be successfully transferred.

##### Example

```js
swivel.on('data', function (datum1, datum2) {
  console.log(datum1, datum2);
  this.reply('datum3', datum1 * datum2).then(function () {
    console.log('success');
  });
});
```

## `swivel.once(type, handler)`

Equivalent to [`swivel.on`][sw-listen] but will only ever be called once. Returns [`swivel`][sw-api] for chaining. Also able to use `this.reply` for bidirectional communication.

##### Example

```js
swivel.once('data', function (datum1, datum2) {
  console.log(datum1, datum2);
  this.reply('datum3', datum1 * datum2).then(function () {
    console.log('success');
  });
});
```

## `swivel.off(type, handler)`

Unregisters a `handler` of type `type` that was previously registered using [`swivel.on`][sw-listen] or [`swivel.once`][sw-once]. Returns [`swivel`][sw-api] for chaining.

##### Example

```js
swivel.on('data', function handler (datum1, datum2) {
  console.log(datum1, datum2);
  if (datum1 === 'end') {
    swivel.off('data', handler);
  }
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
