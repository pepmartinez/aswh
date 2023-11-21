const request =     require ('superagent');
const Log =         require ('winston-log-space');
const _ =           require ('lodash');
const cron_parser = require ('cron-parser');

class HttpClient {
  constructor (q, env, consumer, opts) {
    this._id = `${q.name()}@${q.ns()}`
    this._q = q;
    this._failed_q = env.failed_q;
    this._failed_cb_q = env.failed_cb_q;
    this._completed_cb_q = env.completed_cb_q;
    this._consumer = consumer;
    this._opts = opts || {};
    this._http_agents = consumer._http_agents;
    this._log = Log.logger (`lib:consumer[${this._id}]`);

    this._w_size = 0;
    this._w_max = opts.window || 10;
    this._in_consume_loop = false;

    this._c0 = _.get (opts, 'retry.delay.c0', 3);
    this._c1 = _.get (opts, 'retry.delay.c1', 3);
    this._c2 = _.get (opts, 'retry.delay.c2', 3);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  status (cb) {
    const ret = {
      ns:             this._q.ns(),
      q:              this._q.name(),
      failed_q:       this._failed_q.name(),
      failed_cb_q:    this._failed_cb_q.name(),
      completed_cb_q: this._completed_cb_q.name(),
      window:         {size: this._w_size, max: this._w_max},
      retry:          {c0: this._c0, c1: this._c1, c2: this._c2},
      in_loop:        this._in_consume_loop
    };


    cb (null, ret);
  }


  ///////////////////////////////////////////////////////////////////////////////////////
  // calculate delay to apply on a rollback. Uses a 2nd-deg polynom based on tries
  _get_delay (elem) {
    const r = elem.tries || 0;
    return (r*r*this._c2 + r*this._c1 + this._c0) * 1000;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////
  // send a single webhook, call cb with result: cb (retry: boolean, ok/ko: boolean)
  _do_http_call (elem, cb) {
    const wh = elem.payload;
    const id = elem._id;
    const time = process.hrtime();
    const agent = this._http_agents.get_by_req (wh);
    this._log.verbose ('%s: calling %j with agent %j', id, wh, agent);

    const r = request (wh.method, wh.url)
    .agent (agent)  // set http(s) agent
    .set (wh.headers);

    if (wh.body) r.send (wh.body);

    r.end ((err, res) => {
      const diff = process.hrtime(time);
      const delta = (diff[0] * 1e9 + diff[1]) / 1e9;

      if (err) {
        this._consumer._metrics.http_request_client.labels (
          r.protocol,
          r.method,
          r.host,
          err.status || err.code || err.errno
        ).observe (delta);

        this._log.info ('%s: (%d msec) got error calling %s: %o', id, delta, wh.url, err.status || err.code || err.errno || err);
        // non-http error, retry always
        if (!err.status) return cb (true);

        const status_series = Math.floor (err.status/100);
        switch (status_series) {
          case 3:  return cb (null,  true, res);  // http 3xx, not an error
          case 4:  return cb (false, null, res);  // http 4xx, error, do not retry
          case 5:  return cb (true,  null, res);  // http 5xx, error, retry
          default: return cb (true,  null, res);  // unknown http error, retry
        }
      }
      else {
        // all ok
        this._consumer._metrics.http_request_client.labels (
          r.protocol,
          r.method,
          r.host,
          res.status
        ).observe (delta);

        this._log.info (`${id}: (${delta} msec) call ok to ${wh.url}`);
        cb (null, true, res);
      }
    });
  }


  ///////////////////////////////////////////////////////////////////
  // main consumer loop: reserve -> send -> commit/rollback
  _consume_loop () {
    if (this._w_size >= this._w_max) {
      this._log.verbose (`window is full (${this._w_size}/${this._w_max}), waiting for window relief`);
      this._in_consume_loop = false;
      return;
    }

    this._log.info ('getting element from queue...');

    this._q.pop('consumer-webhooks', {reserve: true}, (err, elem) => {
      if (err) {
        // just end if pop was cancelled
        if (err == 'cancel') {
          this._log.info ('pop cancelled, ending consumer');
          return;
        }

        // error: log it, wait a bit and continue
        this._log.error ('error while popping: %o', err);
        this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'pop', 'ko').set (this._w_size);
        return setTimeout (() => this._consume_loop (), 1000);
      }

      this._log.verbose (`got elem with id ${elem._id}, tries ${elem.tries}`);
      this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'reserve', 'ok').inc ();

      this._w_size++;
      this._log.verbose (`window acquired, occupation now (${this._w_size}/${this._w_max})`);
      this._consumer._metrics.consumer_window.labels(this._id).set (this._w_size);

      this._do_http_call (elem, (retry, ok, res) => {
        this._w_size--;
        this._log.verbose (`window released, occupation now (${this._w_size}/${this._w_max})`);
        this._consumer._metrics.consumer_window.labels(this._id).set (this._w_size);

        if (!this._in_consume_loop) {
          this._in_consume_loop = true;
          this._consume_loop ();
          this._log.verbose ('consume loop rearmed');
        }

        if (ok) {
          this._manage_process_ok (elem, res);
        }
        else {
          if (retry) {
            this._manage_process_retry (elem);
          }
          else {
            this._manage_process_ko (elem, res);
          }
        }
      });

      this._consume_loop ();
    });
  }


  ///////////////////////////////////////////////////////////////////
  _manage_process_ok (elem, res) {
    this._log.verbose ('sent elem with id %s', elem._id);

    this._attempt_rearm (elem, res);

    if (elem.payload.cb_url) {
      const pl = {
        url: elem.payload.cb_url,
        method: 'POST',
        headers: {},
        body: {
          req: elem.payload,
          res: _.pick (res, 'status', 'body', 'text', 'headers')
        },
        xtra: {}
      };

      // ...and queue it
      this._completed_cb_q.push (pl, {}, (err, id) => {
        // error while queuing?
        if (err) {
          this._log.error ('error while pushing payload in completed_cb_q: %o', err);
          this._consumer._metrics.q_ops.labels(this._completed_cb_q.ns(), this._completed_cb_q.name(), 'push', 'ko').inc ();
        }
        else {
          this._log.verbose (`inserted callback-completed call for ${id}`);
          this._consumer._metrics.q_ops.labels(this._completed_cb_q.ns(), this._completed_cb_q.name(), 'push', 'ok').inc ();
        }

        this._q.ok (elem, err => {
          if (err) {
            this._log.error ('error while committing, continuing anyway: %o', err);
            this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ko').inc ();
          }
          else {
            this._log.verbose (`committed elem ${elem._id}`);
            this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ok').inc ();
          }
        });
      });
    }
    else {
      this._q.ok (elem, err => {
        if (err) {
          this._log.error ('error while committing, continuing anyway: %o', err);
          this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ko').inc ();
        }
        else {
          this._log.verbose (`committed elem ${elem._id}` );
          this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ok').inc ();
        }
      });
    }
  }


  ///////////////////////////////////////////////////////////////////
  _manage_process_retry (elem) {
    const delay = this._get_delay (elem);
    this._log.info (`not sent elem with id ${elem._id}, retrying with ${delay} ms delay...`);

    this._q.ko (elem, (new Date().getTime () + delay), (err, res) => {
      if (err) {
        this._log.error ('error while rolling-back, continuing anyway: %o', err);
        this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'rollback', 'ko').inc ();
        
        this._attempt_rearm (elem);
      }
      else {
        if (res == 'deadletter') {
          this._log.warn (`elem ${elem._id} moved to deadletter upon retry attempt (too many retries, not really retried)`);
          this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'deadletter', 'ok').inc ();
      
          this._attempt_rearm (elem);
        }
        else {
          this._log.verbose (`rolled back elem ${elem._id}` );
          this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'rollback', 'ok').inc ();
        }
      }
    });
  }


  ///////////////////////////////////////////////////////////////////
  _manage_process_ko (elem, res) {
    this._log.verbose (`not-sent elem with id ${elem._id}`);

    // Rearm if has x-periodic-cron
    this._attempt_rearm (elem, res);

    if (elem.payload.cb_url) {
      const pl = {
        url: elem.payload.cb_url,
        method: 'POST',
        headers: {},
        body: {
          req: elem.payload,
          res: _.pick (res, 'status', 'body', 'text', 'headers')
        },
        xtra: {}
      };

      // ...and queue it
      this._failed_cb_q.push (pl, {}, (err, id) => {
        // error while queuing?
        if (err) {
          this._log.error ('error while pushing payload in failed_cb_q: %o'. err);
          this._consumer._metrics.q_ops.labels(this._failed_cb_q.ns(), this._failed_cb_q.name(), 'push', 'ko').inc ();
        }
        else {
          this._log.verbose (`inserted callback-failed call for %{id}`);
          this._consumer._metrics.q_ops.labels(this._failed_cb_q.ns(), this._failed_cb_q.name(), 'push', 'ok').inc ();
        }

        this._q.ok (elem, err => {
          if (err) {
            this._log.error ('error while committing, continuing anyway: %o', err);
            this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ko').inc ();
          }
          else {
            this._log.verbose (`committed elem ${elem._id}` );
            this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ok').inc ();
          }
        });
      });
    }
    else {
      this._log.warn (`not sent elem with id ${elem._id}, NOT retrying and moving to queue ${this._failed_q.name()}`);

      // insert element into __failed__ queue
      elem.payload.xtra.res = _.pick (res, 'status', 'body', 'text', 'headers');
      
      this._failed_q.push (elem.payload, (err, id) => {
        if (err) {
          this._log.error ('can not insert failed element into %s queue. Error is %j, elem is %j', this._failed_q.name (), err, elem);
          this._consumer._metrics.q_ops.labels(this._failed_q.ns(), this._failed_q.name(), 'push', 'ko').inc ();
        }
        else {
          this._consumer._metrics.q_ops.labels(this._failed_q.ns(), this._failed_q.name(), 'push', 'ok').inc ();
        }

        this._q.ok (elem, err => {
          if (err) {
            this._log.error ('error while committing, continuing anyway: %o', err);
            this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ko').inc ();
          }
          else {
            this._log.verbose (`committed elem ${elem._id}` );
            this._consumer._metrics.q_ops.labels(this._q.ns(), this._q.name(), 'commit', 'ok').inc ();
          }
        });
      });
    }
  }


  ///////////////////////////////////////////////////////////////////
  _attempt_rearm (elem, res) {

    if (!elem.payload.rearm_cron) return;

    try {
      const interval = cron_parser.parseExpression (elem.payload.rearm_cron);
      const next = interval.next();

      this._log.info ('rescheduling element for %s', next.toString ());

    } catch (err) {
      this._log.error ('Can not parse x-periodic-cron spec [%s]: %s', elem.payload.rearm_cron, err.message);
    }
  }


  ///////////////////////////////////////////////////////////////////
  run () {
    this._in_consume_loop = true;
    this._consume_loop ();
  }

  ///////////////////////////////////////////////////////////////////
  stop (cb) {
    this._log.info ('stopping consumer');
    this._q.cancel ();
    this._q.drain (cb);
  }

}


///////////////////////////////////////////////////
module.exports = HttpClient;
