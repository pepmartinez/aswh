const request = require ('superagent');
const Log =     require ('winston-log-space');

class HttpClient {
  constructor (q, consumer) {
    this._q = q;
    this._consumer = consumer;
    this._log = Log.logger (`lib:consumer[${q.name()}@${q.ns()}]`);
  }


  ///////////////////////////////////////////////////////////////////////////////////////
  // calculate delay to apply on a rollback. Uses a 2nd-deg polynom based on tries
  _get_delay (elem) {
    const r = elem.tries || 0;
    return (r*r*3 + r*3 + 3) * 1000;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////
  // send a single webhook, call cb with result: cb (retry: boolean, ok/ko: boolean)
  _do_http_call (elem, cb) {
    const wh = elem.payload;
    request (wh.method, wh.url)
    .set (wh.headers)
    .send (wh.body)
    .end ((err, res) => {
      if (err) {
        this._log.info ('got error calling %s:', wh.url, err.status || err.code || err.errno || err);

        // non-http error, retry always
        if (!err.status) return cb (true);

        const status_series = Math.floor (err.status/100);
        switch (status_series) {
          case 3:  return cb (null, true);  // http 3xx, not an error
          case 4:  return cb (false);       // http 4xx, error, do not retry
          case 5:  return cb (true);        // http 5xx, error, retry
          default: return cb (true);        // unknown http error, retry
        }
      }
      else {
        // all ok
        cb (null, true);
      }
    });
  }


  ///////////////////////////////////////////////////////////////////
  // main consumer loop: reserve -> send -> commit/rollback
  _consume_loop () {
    this._log.info ('getting element from queue...');

    this._q.pop('consumer-webhooks', {reserve: true}, (err, elem) => {
      if (err) {
        // error: log it, wait a bit and continue
        this._log.error ('error while popping: %o', err);
        return setTimeout (() => this._consume_loop (), 1000);
      }

      this._log.verbose ('got elem with id %s, tries %d', elem._id, elem.tries);

      this._do_http_call (elem, (retry, ok) => {
        if (ok) {
          this._log.verbose ('sent elem with id %s', elem._id);

          this._q.ok (elem, err => {
            if (err) this._log.error ('error while committing, continuing anyway: %o', err);
            else this._log.verbose ('committed elem %s', elem._id);

            this._consume_loop ();
          });
        }
        else {
          if (retry) {
            const delay = this._get_delay (elem);
            this._log.info ('not sent elem with id %s, retrying with %d ms delay...', elem._id, delay);

            this._q.ko (elem, (new Date().getTime () + delay), err => {
              if (err) this._log.error ('error while rolling-back, continuing anyway: %o', err);
              else this._log.verbose ('rolled back elem %s', elem._id);

              this._consume_loop ();
            });
          }
          else {
            this._log.warn ('not sent elem with id %s, NOT retrying', elem._id);

            this._q.ok (elem, err => {
              if (err) this._log.error ('error while committing, continuing anyway: %o', err);
              else this._log.verbose ('committed elem %s', elem._id);

              this._consume_loop ();
            });
          }
        }
      });
    });
  }


  ///////////////////////////////////////////////////////////////////
  run () {
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
