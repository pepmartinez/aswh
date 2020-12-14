# aswh: Asynchronous WebHook delivery

This is a simple yet powerful component to perforn asynchronous delivery of webhooks, or other HTTP calls. In a nutshell, it works as a store-and-forward http proxy: you call the proxy and get a HTTP 201, and the proxy then sees to deliver your HTTP call

The *store*  part uses [keuss](https://pepmartinez.github.io/keuss/) as a job-queue middleware; your HTTP calls would be stored in MongoDB collections; you get the following storage options:

* *simple*: the HTTP calls are stored in a collection, one object per request, and are removed after being confirmed

* *tape*: the HTTP calls are stored in a collection, one object per request, and are marked as consumed after being confirmed. Consumed objects are removed at a later time using a TTL index

* *bucket*: the HTTP calls are stored in a collecton, but they are packed, several in a single object. This raises performance by an order of magnitude without taxing durability much

Generally speaking, `aswh` works for any HTTP request, not just webhooks, with the following limitations:

* The HTTP requests need to be completed at the time they're passed to `aswh`. Any auth header, for example, nust be added beforehand, so no reactive auth is allowed

* For the same reason, no body streaming is performed. `aswh` will read the request bodies completely before adding them to the store. There is, in fact, a size limit for bodies (100kb by default)

* HTTP response bodies are totally ignored. HTTP responses are used only to decide whether to retry or not, and the HTTP status is all that's needed. HTTP responses are properly read, completely.

# How it works

* you make HTTP calls (any method) to `http://localhost:6677/wh`. The whole HTTP request will be queued for later. You'll receive a `HTTP 201 Created` response, immediately after successful queuing
* The queued requests are extracted by means of a reserve (they are not immediately removed, but marked as taken) from the queue and forwarded. The destination uri must be specified as the content of the `x-dest-url` header. The original uri, querystring included, is not used in the forwarding
  * If the request fails with a retriable error (http 5xx, non-http errors) it is rolled back (ie, marked as available again) with a delay of `tries^2 * c2 + tries * c1 + c0` seconds.
  * If the request fails with a non-retriable error (http 4xx) it is committed (ie, removed)
  * If they succeed (http 2xx) it is committed (ie, removed)
* Also, deadletter is used. If a webhook is retried over 7 times, it is moved to the queue `__deadletter__`

Also, you can specify an initial delay in secons in the header `x-delay`, which is not passed along either

For example, you can issue a POST webhook which would be retried if needed like this:

```bash
curl -X POST -i \
  --data-bin @wh-payload.json \
  -H 'x-dest-url: https://the-rea-location.api/ai/callback' \
  -H 'content-type: text/plain' \
  -H 'x-delay: 1' http://localhost:6677/wh
```

You would need to first create a file `wh-payload.json` with the webhook payload or content. Also, it will be issued with an initial delay of 1 second.



# Configuration

# Installation
