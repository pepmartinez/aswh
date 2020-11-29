const Log =   require ('winston-log-space');
const _ =     require ('lodash');
const async = require ('async');

const consumer = require ('../lib/consumer');

var log = Log.logger ('Components:Consumer');


//////////////////////////////////////////////////////////////////
class Consumer {
  constructor (opts) {
    this._opts = opts || {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    this._context = context;
    _.each (context.components.Keuss.queues(), (q, qn) => {
      consumer.run (q);
      log.info ('started consumer on queue %s@%s', q.name (), q.ns());
    })

    cb (null, this);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  setup (context, cb) {
    this._http_req_cl_metric = context.metrics.http_request_client;
    cb ();
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    const tasks = [];
    _.each (this._context.components.Keuss.queues(), (q, qn) => {
      tasks.push (cb => {
        log.info ('stopping consumer on queue %s@%s', q.name (), q.ns());
        q.cancel ();
        q.drain (cb);
      });
    });

    async.series (tasks, cb);
  }
}

module.exports = Consumer;

