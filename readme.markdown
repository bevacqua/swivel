# WIP

# swivel

> Message passing between ServiceWorker and pages made simple

# Inspiration

Understanding the raw API for message passing between ServiceWorker and pages can be kind of confusing. There's `MessageChannel`, ports, `postMessage` deeply buried in `navigator.serviceWorker.controller.postMessage`, `addEventListener`, and even promises are involved.

ServiceWorker is too awesome to let this problem hinder its adoption, so I made `swivel` in hopes people will find it easier to share messages across pages and their ServiceWorker. For an introduction of ServiceWorker you should look at [this article][1].

> I named it `swivel` mostly because it starts with `sw` and it wasn't taken on `npm`.

# Installation

Install it from `npm`. You can then include `swivel` in your pages and your ServiceWorker, and Swivel will figure out what API to export depending on whether it's running within the ServiceWorker or a regular web page.

```shell
npm i -S swivel
```

# Usage

On your web pages, you can listen for messages from the ServiceWorker. Remember to wait for ServiceWorker to become active, and always feature test to ensure ServiceWorker is available.

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

You can also emit messages to the ServiceWorker from your pages.

```js
swivel.emit('data', ...data);
```

Emitting returns a `Promise`, in case you want to wait until the message is transferred to do something else.

```js
swivel.emit('data', ...data).then(function () {
  // ... more swivelling!
});
```

In your ServiceWorker, the API barely changes. You can listen to messages posted from web pages with `swivel.emit` using `swivel.on` in the ServiceWorker code.

```js
swivel.on('data', function (...data) {
  // do something with ...data
});
```

If you need to reply to this particular page in the ServiceWorker, you could just use code like the following.


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
swivel.broadcast(...data);
```

Broadcast also returns a `Promise` that awaits all `client.postMessage` signals to be processed.

```js
swivel.broadcast(...data).then(function () {
  // ... more swivelling!
});
```

Pages can then listen for the `'broadcast'` event.

```js
swivel.on('broadcast', function (...data) {
  // do something with ...data
});
```

# License

MIT

[1]: https://ponyfoo.com/articles/serviceworker-revolution "ServiceWorker: Revolution of the Web Platform on Pony Foo"
