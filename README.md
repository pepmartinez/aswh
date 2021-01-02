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
  * If the request fails with a retriable error (http 5xx, non-http errors) it is rolled back (ie, marked as available again) with a delay of `tries^2 * c2 + tries * c1 + c0` seconds (those c0, c1, c2 default to 3 but are configurable).
  * If the request fails with a non-retriable error (http 4xx) it is committed (ie, removed)
  * If they succeed (http 2xx) it is committed (ie, removed)
* Also, deadletter is used. If a webhook is retried over 5 times (by default; it's configurable), it is moved to the queue `__deadletter__`

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

`Aswh` uses [cascade-config](https://www.npmjs.com/package/cascade-config) as configuration engine; so, configuration can come from:

* environment variables

* CLI args

* `etc/config.js` file

* `etc/config-${NODE_ENV:-development}.js` file (optional)

See `cascade-config` documentation on more details how to pass extra configuration (or override it) using environment variables or CLI args

## General

* `listen_port`(defaults to 6677): port to listen to for incoming http

* `defaults.`: global defaults for `aswh`. They, in turn, default to:
  
  ```js
  defaults: {
    retry: {
      max: 5,
      delay: {
        c0: 3,
        c1: 3,
        c2: 3
      }
    }
  }
  ```

## Queues and queue groups

`Aswh` supports the use of many queues; queues are organized in *queue groups* , which are implemented as a keuss queue factory (plus keuss stats and keuss signaller); in turn, each queue-group/keuss-factory can use its own mongodb database (although they all share the same mongodb cluster/server)

Queue groups are declared using the following configuration schema:

```js
keuss: {
  // base mongodb url. All queue groups share the same server/cluster
  // but each one goes to a separated database whose name is created
  // by suffixing the db in base_url with '_$queue_group_name'
  base_url: 'mongodb://localhost/aswh',
  queue_groups: {
    qg_1: {
      // queue group named 'qg_1'. It will use the following databases:
      // mongodb://localhost/aswh_qg_1 : main data, queues
      // mongodb://localhost/aswh_qg_1_signal : keuss signaller
      // mongodb://localhost/aswh_qg_1_stats : keuss stats

      // optional, defaults to 'default'
      mq: 'default' | 'tape' | 'bucket',

      // maximum number of retries before moving elements to
      // __deadletter__ queue. defaults to defaults.retry.max or 5
      max_retries: <int>,

      // queue definitions go here
      queues: {
        default: {  // default queue, items for the group go here if no queue is specified
          <opts>
        },
        q1: { // queue 'q1'
          window: 3,  // consumer uses a window size of 3
          retry: {
            delay: { // c0, c1 and c2 values for retry delay
              c0: 1,
              c1: 1,
              c2: 1
            }
          },
          <opts>
        },
        q2: {
          <opts>
        },
        ...
      }
    },
    qg_2: {...},
    ...
    qg_n: {...}
  }
}
```

Each queue has its own consumer to relay http requests; each consumer consists basically in a http client plus a loop with reserves elements from the queue, sends them and commits or rollbacks the elements on the queue depending on the http response

The consumer can keep more than one http request sent and awaiting for response; by default, only one is kept (which amounts to one-request-at-a-time), but a different value can be specified at `<queue>.window` option. `window=10` would allow the cosnumer to keep up to 10 requests sent and awaiting for response (and thus up to 10 elements reserved and waiting for commit/rollback at the queue)

## HTTP agents

Queue consumers can use http(s) agents, which allow for connection pooling. To do so, you need 2 steps: first, configure one or more HTTP agents 

```js
  agents: {
    http: {
      // standard node.js http agents
      agent_a : {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
        maxFreeSockets: 2,
        timeout: 12000
      },
      agent_b: {
        ...
      }
    },
    https: {
      // standard node.js https agents
      agent_z : {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
        maxFreeSockets: 2,
        timeout: 12000
      },
      agent_other: {
        ...  
      },
      agent_other_one: {
        ...  
      }
    },
  },
```

Both take the standard node.js http and https agents specified at [here](https://nodejs.org/dist/latest-v14.x/docs/api/http.html#http_class_http_agent) and [here](https://nodejs.org/dist/latest-v14.x/docs/api/https.html#https_class_https_agent). `agents.http` specify http agents to be used on `http://` target urls, `agents.https` specify agents for `https://` targets.

The use of an agent is specified on a per-request basis, using the `x-http-agent`header; with the above config a request

```js
curl -v \
  -H 'x-dest-url: https://alpha.omega/a/b' \
  -H 'x-http-agent: agent_z' \
  http://location_of_aswh/
```

would end up calling `https://alpha.omega/a/b` using the https agent configured at `agents.https.agent_z`

If no agent is specified, no agent will be used; this would force `connection: close` upstream

# Installation

Easiest way is to use the docker image and mount your configuration:

```bash
docker run \
  --rm \
  -d \
  --name aswh \
  -v /path/to/configuration/dir:/usr/src/app/etc \
  - e NODE_ENV=development \
  pepmartinez/aswh:1.0.0
```

The configuration dir should must contain:

* A base config file, `config.js`. This would contain common configuration

* Zero or more per-env files, `config-${NODE_ENV}.js`, which would contain configuration specific for each `$NODE_ENV` 

Also, configuration can be added or overriden using env vars:

```bash
docker run \
  --rm \
  -d \
  --name aswh \
  -v /path/to/configuration/dir:/usr/src/app/etc \
  -e NODE_ENV=development \
  -e defaults__retry__max=11 \ # this sets teh default for max retries to 11
  pepmartinez/aswh:1.0.0
```

# Monitoring (Prometheus metrics)

`aswh`uses [promster](https://github.com/tdeekens/promster) to maintain and provice `prometheus`metrics; along with the standard metrics provided by `promster`the following metrics are also provided:

* `http_request_client`: histogram of client http requests, labelled with `protocol`, `http method`, `destination` (host:port) and `http status`
