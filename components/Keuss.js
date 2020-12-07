var _ =     require('lodash');
var Log =   require ('winston-log-space');
var async = require ('async');

var MQ_simple = require ('keuss/backends/mongo');
var MQ_tape =   require ('keuss/backends/ps-mongo');
var MQ_bucket = require ('keuss/backends/bucket-mongo-safe');

var log = Log.logger ('Components:Keuss');


//////////////////////////////////////////////////////////////////
class Keuss {
  constructor (opts) {
    this._opts = opts || {};
    this._factories = {};
    this._queues = {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    var tasks_mq = [];
    var tasks_q = [];

    _.each (this._opts.keuss.queue_groups, (qg, qg_name)  => {
      var keuss_factories_opts = {
        name: qg_name,
        url: `${this._opts.keuss.base_url}_${qg_name}`,
        deadletter: {
          max_ko: qg.max_retries || this._opts.defaults.retries.max
        }
      };

      tasks_mq.push (cb => this._mq (qg.mq) (keuss_factories_opts, (err, factory) => {
        if (err) return cb (err);
        this._factories[qg_name] = factory;
        log.info ('created factory %s of type %s', factory.name(), factory.type ());
        cb ();
      }));

      _.each (qg.queues, (q, q_name) => {
        tasks_q.push (cb => {
          const fqn = `${q_name}@${qg_name}`
          this._queues[fqn] = this._factories[qg_name].queue (q_name, q.opts || {});
          log.info ('created queue %s', fqn);
          cb ();
        });
      });
    });

    async.series ([
      cb => async.series(tasks_mq, cb),
      cb => async.series(tasks_q, cb),
    ], err => {
      cb (err, this);
    });
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    _.each (this._factories, (factory, factory_name) => {
      factory.close ();
      log.info ('closed factory %s', factory_name);
    });

    cb ();
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  queues (name, ns) {
    return this._queues;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  queue (name, ns) {
    ns = ns || 'default';
    name = name || 'default';

    const k = name + '@' + ns;
    const q = this._queues[k];

    if (q) return q;

    // use default
    return this._queues[name + '@' + ns];
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  _mq (id) {
    switch (id) {
      case 'default':
      case 'simple': return MQ_simple;
      case 'tape':   return MQ_tape;
      case 'bucket': return MQ_bucket;

      default: return MQ_simple;
    }
  }
}

module.exports = Keuss;

