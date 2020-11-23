const request = require ('superagent');
const Log =     require ('winston-log-space');

const log = Log.logger ('lib:consumer');


///////////////////////////////////////////////////////////////////////////////////////
// calculate delay to apply on a rollback. Uses a 2nd-deg polynom based on tries
function _get_delay (elem) {
  const r = elem.tries || 0;
  return (r*r*3 + r*3 + 3) * 1000;
}


//////////////////////////////////////////////////////////////////////////////////////////////
// send a single webhook, call cb with result: cb (retry: boolean, ok/ko: boolean)
function _do_http_call (elem, cb) {
  const wh = elem.payload;
  request (wh.method, wh.url)
  .set (wh.headers)
  .send (wh.body)
  .end ((err, res) => {
    if (err) {
      log.info ('got error calling %s:', wh.url, err.status || err.code || err.errno || err);

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
function _consume_loop (q) {
  log.info ('getting element from queue...');

  q.pop('consumer-webhooks', {reserve: true}, (err, elem) => {
    if (err) {
      // error: log it, wait a bit and continue
      log.error ('error while popping: %o', err);
      return setTimeout (() => _consume_loop (q), 1000);
    }

    log.verbose ('got elem with id %s, tries %d', elem._id, elem.tries);

    _do_http_call (elem, (retry, ok) => {
      if (ok) {
        lof.verbose ('sent elem with id %s', elem._id);

        q.ok (elem, err => {
          if (err) log.error ('error while committing, continuing anyway: %o', err);
          else log.verbose ('committed elem %s', elem._id);

          _consume_loop (q);
        });
      }
      else {
        if (retry) {
          const delay = _get_delay (elem);
          log.info ('not sent elem with id %s, retrying with %d ms delay...', elem._id, delay);

          q.ko (elem, (new Date().getTime () + delay), err => {
            if (err) log.error ('error while rolling-back, continuing anyway: %o', err);
            else log.verbose ('rolled back elem %s', elem._id);

            _consume_loop (q);
          });
        }
        else {
          log.warn ('not sent elem with id %s, NOT retrying', elem._id);

          q.ok (elem, err => {
            if (err) log.error ('error while committing, continuing anyway: %o', err);
            else log.verbose ('committed elem %s', elem._id);

            _consume_loop (q);
          });
        }
      }
    });
  });
}


///////////////////////////////////////////////////
module.exports = (context) => {
  _consume_loop (context.q);
};
