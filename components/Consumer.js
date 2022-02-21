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
      let q_config = this._opts.keuss.queue_groups[q.ns()].queues[q.name()];

      if (!q_config) {
        // special queues such as __*__cb__
        if ((q.name() == '__failed__cb__') || (q.name() == '__completed__cb__')) {
          q_config = {};
        }
        else {
          // not a consumable queue. __failed__ or __deadletter__, for example
          return;
        }
      }

      const opts = {
        window: q_config.window,
        retry: {
          delay: {
            c0: _.get (q_config, 'retry.delay.c0'),
            c1: _.get (q_config, 'retry.delay.c1'),
            c2: _.get (q_config, 'retry.delay.c2'),
          }
        }
      };

      // TODO not for __failed__, __failed__cb__ or __completed__cb__
      const failed_q =       context.components.Keuss.queues() [`__failed__@${q.ns()}`];
      const failed_cb_q =    context.components.Keuss.queues() [`__failed__cb__@${q.ns()}`];
      const completed_cb_q = context.components.Keuss.queues() [`__completed__cb__@${q.ns()}`];

      this._clients[qn] = new consumer (q, {failed_q, failed_cb_q, completed_cb_q}, this, opts);
      log.info ('created consumer on queue %s@%s', q.name (), q.ns());
    });

    cb (null, this);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  setup (context, cb) {
    this._metrics = context.metrics;
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

