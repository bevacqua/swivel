# 4.0.0 Client, Ack

- Changed API to reply to a client, uses `event.clientId` proposal
- `swivel.emit` and `context.reply`, on the ServiceWorker, now return a `Promise` as documented

# 3.0.0 Twisted Mind

- Dropped `this` context for `.on` handlers, in favor of a `context` parameter, because arrow functions
- Introduced `swivel.at(worker)` API that interacts with a `ServiceWorker` other than the current page's controller

# 2.1.0 Revolving Door

- Added `swivel.emit` to the `ServiceWorker` side

# 2.0.0 IPO

- Initial Public Release
