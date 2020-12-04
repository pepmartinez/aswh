const Log =   require ('winston-log-space');
const _ =     require ('lodash');
const async = require ('async');

const consumer = require ('../lib/consumer');

var log = Log.logger ('Components:Consumer');


//////////////////////////////////////////////////////////////////
class Consumer {
  constructor (opts) {
    this._opts = opts || {};
    this._clients =  {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    this._context = context;
    this._http_agents = context.components.HttpAgents;

    _.each (context.components.Keuss.queues(), (q, qn) => {
      this._clients[qn] = new consumer (q, this);
      log.info ('created consumer on queue %s@%s', q.name (), q.ns());
    })

    cb (null, this);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  setup (context, cb) {
    this._http_req_cl_metric = context.metrics.http_request_client;
    _.each (this._clients, (v, k) => {
      v.run ();
      log.info ('started consumer on queue %s', k);
    });
    cb ();
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    const tasks = [];
    _.each (this._clients, v => {
      tasks.push (cb => v.stop (cb));
    });

    async.series (tasks, cb);
  }
}

module.exports = Consumer;

