const Log = require ('winston-log-space');

const consumer = require ('../lib/consumer');

var log = Log.logger ('Components:Consumer');


//////////////////////////////////////////////////////////////////
class Consumer {
  constructor (opts) {
    this._opts = opts || {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    this._q = context.MQ.queue ('webhook_default_queue', {});
    context.q = this._q;

    consumer (context);
    cb (null, this);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    this._q.cancel ();
    this._q.drain (cb);
  }
}

module.exports = Consumer;

