var _ =     require('lodash');
var Log =   require ('winston-log-space');
var async = require ('async');


var MQ =                  require ('keuss/backends/mongo');
var signal_mongo_capped = require ('keuss/signal/mongo-capped');
var stats_mongo =         require ('keuss/stats/mongo');

var log = Log.logger ('Components:Keuss');


//////////////////////////////////////////////////////////////////
class Keuss {
  constructor (opts) {
    this._opts = opts || {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    var keuss_factories_opts = {
      name: 'aswh',
      url: this._opts.keuss.mongo_url,
      signaller: {
        provider: signal_mongo_capped
      },
      stats: {
        provider: stats_mongo,
      },
      deadletter: {
        max_ko: 13
      }
    };

    async.series([
      cb => MQ (keuss_factories_opts, (err, factory) => {
        if (err) return cb (err);
        context.MQ = factory;
        this._factory = factory;
        log.info ('created factory MQ');
        cb ();
      })
    ], err => cb (err, this));
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    if (this._factory) {
      this._factory.close ();
      log.info ('closed factory MQ');
    }

    cb ();
  }
}

module.exports = Keuss;

