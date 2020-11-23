# Keuss example app: WebHook delivery

This is a small but fully functional WebHook Delivery System using keuss as job-queue middleware. It can be certainly improved in many ways, but it is perfectly usable in its current state

## install & run
You need a mongodb instance running locally.

Then, run the usual `npm install` and then `node .`

## How it works
This system works as a store-and-forward http relay:
* you make HTTP calls (any method) to `http://localhost:6677/wh`. The whole HTTP request will be queued for later. You'll receive a `HTTP 201 Created` response, immediately
* The queued requests are extracted by means of a reserve from the queue and *executed*.
  * If they fail with a retriable error (http 5xx, non-http errors) they are rolled back with a delay of `tries^2 * 3 + tries * 3 + 3` seconds.
  * If they fail with a non-retriable error (http 4xx) they are committed
  * If they succeed (http 2xx) they are committed
* Also, deadletter is used. If a webhook is retried over 14 times, it is moved to `__deadletter__`

In order to work, you need to pass along the destination url as `x-dest-url` header. This header is not passed along. Also, you can specify an initial delay in secons in the header `x-delay`, which is not passed along either

A set of testing urls is also provided for a self-contained testing:
* `/test/200`: returns a HTTP 200
* `/test/400`: returns a HTTP 400
* `/test/404`: returns a HTTP 404
* `/test/500`: returns a HTTP 500
* `/test/drop`: no response, and close the socket

Then, you can issue a POST webhook which would be retried 14 times and then moved to deadletter like this:

```bash
curl -X POST --data-bin @wh-payload.json -v -H 'x-dest-url: http://localhost:6677/test/500' -H 'content-type: text/plain' -H 'x-delay: 1' http://localhost:6677/wh
```

You would need to first create a file `wh-payload.json` with the webhook payload or content. Also, it will be issued with an initial delay of 1 second.
The provided sample in the `wh-payload.json` file is a sample content for posting a message to a Microsoft Teams channel using webhooks connector. You can find the sample and more  concrete explanation of how to build your own cards for Microsoft Teams here:
https://docs.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference#thumbnail-card
