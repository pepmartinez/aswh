const _ =     require('lodash');
const Log =   require ('winston-log-space');
const async = require ('async');

const MQ_simple =     require ('keuss/backends/mongo');
const MQ_tape =       require ('keuss/backends/ps-mongo');
const MQ_bucket =     require ('keuss/backends/bucket-mongo-safe');
const MQ_postgres =   require ('keuss/backends/postgres');
const MQ_redis_oq =   require ('keuss/backends/redis-oq');

const signal_redis_pubsub = require ('keuss/signal/redis-pubsub');
const signal_mongo_capped = require ('keuss/signal/mongo-capped');
const signal_local =        require ('keuss/signal/local');

const stats_redis = require ('keuss/stats/redis');
const stats_mongo = require ('keuss/stats/mongo');
const stats_mem =   require ('keuss/stats/mem');

const log = Log.logger ('Components:Keuss');


//////////////////////////////////////////////////////////////////
class Keuss {
  constructor (opts) {
    this._opts = opts || {};
    this._factories = {};
    this._queues = {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  _compose_keuss_url (qgroup) {
    const url = new URL(this._opts.keuss.base_url);
    url.pathname = `${url.pathname}_${qgroup}`;
    return url.toString(); 
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  _build_factory_opts (qg_name, qg) {
    const opts = {
      name: qg_name,
      deadletter: {
        max_ko: qg.max_retries || this._opts.defaults.retry.max
      }
    };

    // per-mq-type condif
    switch (qg.mq) {
      case 'default':
      case 'simple':
      case 'tape':
      case 'bucket':
        opts.url = this._compose_keuss_url (qg_name);
        break;

      case 'redis':
        opts.redis = _.merge ({}, this._opts.keuss.redis, qg.redis);
        break;

      case 'postgres': 
        opts.postgres = _.merge ({}, this._opts.keuss.postgres, qg.postgres);
        break;
    }

    // add signaller if specified
    if (this._opts.keuss.signaller || qg.signaller) {
      const from_k = this._opts.keuss.signaller || {};
      const from_qg = qg.signaller || {};

      opts.signaller = {
        type:     from_k.provider || from_qg.provider,
        provider: this._signaller (from_k.provider || from_qg.provider),
        opts:     _.merge ({}, from_k.opts, from_qg.opts)
      };
    }

    // add stats if specified
    if (this._opts.keuss.stats || qg.stats) {
      const from_k = this._opts.keuss.stats || {};
      const from_qg = qg.stats || {};

      opts.stats = {
        type:     from_k.provider || from_qg.provider,
        provider: this._stats (from_k.provider || from_qg.provider),
        opts:     _.merge ({}, from_k.opts, from_qg.opts)
      };
    }

    return opts;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    const tasks_mq = [];
    const tasks_q = [];

    _.each (this._opts.keuss.queue_groups, (qg, qg_name)  => {
      const keuss_factories_opts = this._build_factory_opts (qg_name, qg);

      tasks_mq.push (cb => this._mq (qg.mq) (keuss_factories_opts, (err, factory) => {
        if (err) return cb (err);
        this._factories[qg_name] = factory;

        log.info ('created factory %s of type %s, using signaller %s and stats %s', 
                  factory.name(),
                  factory.type (),
                  _.get (keuss_factories_opts, 'signaller.type', '<default>'),
                  _.get (keuss_factories_opts, 'stats.type',     '<default>'));

        cb ();
      }));

      _.each (qg.queues, (q, q_name) => {
        tasks_q.push (cb => {
          const fqn = `${q_name}@${qg_name}`
          this._factories[qg_name].queue (q_name, q.opts || {}, (err, q) => {
            if (err) return cb(err);
            this._queues[fqn] = q
            log.info ('created queue %s', fqn);
            cb ();
          });
        });
      });

      tasks_q.push (cb => {
        const failed_queue = '__failed__';
        const fqn = `${failed_queue}@${qg_name}`;
        this._factories[qg_name].queue (failed_queue, (err, q) => {
          if (err) return cb(err);
          this._queues[fqn] = q
          log.info ('created *failed* queue %s', fqn);
          cb ();
        });
      });

      tasks_q.push (cb => {
        const failed_cb_queue = '__failed__cb__';
        const fcbqn = `${failed_cb_queue}@${qg_name}`;
        this._factories[qg_name].queue (failed_cb_queue, (err, q) => {
          if (err) return cb(err);
          this._queues[fcbqn] = q
          log.info ('created *callback for failed* queue %s', fcbqn);
          cb ();
        });
      });

      tasks_q.push (cb => {
        const completed_cb_queue = '__completed__cb__';
        const ccbqn = `${completed_cb_queue}@${qg_name}`;
        this._factories[qg_name].queue (completed_cb_queue, (err, q) => {
          if (err) return cb(err);
          this._queues[ccbqn] = q
          log.info ('created *callback for completed* queue %s', ccbqn);
          cb ();
        });
      });

      tasks_q.push (cb => {
        const deadletter_queue = '__deadletter__';
        const fqn = `${deadletter_queue}@${qg_name}`;
        this._factories[qg_name].queue (deadletter_queue, (err, q) => {
          if (err) return cb(err);
          this._queues[fqn] = q
          log.info ('created *deadletter* queue %s', fqn);
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
  setup (context, cb) {
    this._metrics = context.metrics;
    async.series ([
      cb => {
        this._rqgm_timer = setInterval (() => this._refresh_q_global_metrics (), 5000);
        cb ();
      }
    ], cb);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    clearInterval (this._rqgm_timer);
    _.each (this._factories, (factory, factory_name) => {
      factory.close ();
      log.info ('closed factory %s', factory_name);
    });

    cb ();
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  queues () {
    return this._queues;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  queue_groups () {
    return this._factories;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  queue (name, ns) {
    ns = ns || 'default';
    name = name || 'default';

    const k = name + '@' + ns;
    const q = this._queues[k];

    if (q) return q;

    // no queue found, return null
    return null;
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  _mq (id) {
    switch (id) {
      case 'default':
      case 'simple':   return MQ_simple;
      case 'tape':     return MQ_tape;
      case 'bucket':   return MQ_bucket;
      case 'postgres': return MQ_postgres;
      case 'redis':    return MQ_redis_oq;

      default: return MQ_simple;
    }
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  _signaller (id) {
    switch (id) {
      case 'default':
      case 'mongo':   return signal_mongo_capped;
      case 'redis':   return signal_redis_pubsub;
      case 'mem':     return signal_local;
    }
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  _stats (id) {
    switch (id) {
      case 'default':
      case 'mongo':   return stats_mongo;
      case 'redis':   return stats_redis;
      case 'mem':     return stats_mem;
    }
  }


  //////////////////////////////
  _refresh_q_global_metrics () {
    const tasks = [];

    _.each (this._queues, (q, id) => {
      tasks.push (cb => this._refresh_q_global_metrics_for_queue (q, id, cb))
    });

    async.parallel (tasks, err => {
      if (err) return log.error ('while refreshing q_global metrics: %j', err);
    });
  }


  //////////////////////////////////////////////////
  _refresh_q_global_metrics_for_queue (q, id, cb) {
    async.parallel ({
      size:          cb => q.size (cb),
      totalSize:     cb => q.totalSize (cb),
      schedSize:     cb => q.schedSize (cb),
      resvSize:      cb => q.resvSize (cb),
//      next_t:        cb => q.next_t (cb),
    }, (err, res) => {
      if (err) return cb (err);

      _.each (res, (v, k) => this._metrics.q_sizes.labels (q.ns(), q.name(), k).set (v || 0));
      cb ();
    });
  }
}

module.exports = Keuss;

