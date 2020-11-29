const async = require ('async');
const _ =     require ('lodash');
const Log =   require ('winston-log-space');

const log = Log.logger ('main:uber-app');




////////////////////////////////////////////////////////////
function _do_ns_init (ns, context, cb) {
  const NS = require (`./${ns}/init`);

  NS.init (context, (err, res) => {
    if (err) return cb (err);
    context[ns] = res;
    log.info ('%s initialized', ns);
    cb ();
  });
}


////////////////////////////////////////////////////////////
function _do_ns_setup (ns, context, cb) {
  var tasks = [];
  _.each (context[ns], (v, k) => {
    if (v.setup) {
      tasks.push (cb => {
        log.info ('setting up %s %s', ns, k);
        v.setup (context, cb);
      });
    }
  });

  log.info ('setting up %s', ns);
  async.series (tasks, cb);
}


////////////////////////////////////////////////////////////
function _do_ns_end (ns, context, cb) {
  var tasks = [];
  _.each (context[ns], (v, k) => {
    tasks.push (cb => {
      log.info ('shutting down %s %s', ns, k);
      v.end (cb);
    });
  });

  log.info ('shutting down %s', ns);
  async.series (tasks, cb);
}


////////////////////////////////////////////////////////////////
function __shutdown__ (context, doexit, cb) {
  log.info ('http server shutdown starts...');

  async.series ([
    cb => {
      require ('@promster/express').signalIsNotUp();
      cb ();
    },
    cb => {
      if (context.server) {
        log.info ('shutting down http server');
        context.server.shutdown (() => {
          log.info ('http server cleanly shutdown');
          cb ();
        });
      }
      else {
        cb ();
      }
    },
    cb => _do_ns_end ('mw', context, cb),
    cb => _do_ns_end ('controllers', context, cb),
    cb => _do_ns_end ('components', context, cb),
    cb => {
      // stop promster
      if (context.promster) context.promster.register.clear();
      cb ();
    }
  ], () => {
    log.info ('instance clean-shutdown completed');
//          require('active-handles').print();

    if (doexit) {
      log.info ('Exiting...');
      process.exit (0);
    }
    else {
      if (cb) cb ();
    }
  });
}


////////////////////////////////////////////////////////////////
function _init_metrics (context, cb) {
  context.promster = context.app.locals.Prometheus;
  context.metrics = {};

  context.metrics.http_request_client = new context.promster.Histogram({
    name: 'http_request_client',
    help: 'HTTP requests as client',
    buckets: [0.01, 0.1, 0.5, 1, 5, 10],
    labelNames: ['status', 'dest']
  });

  log.info ('metrics initialized');
  cb ();
}


/////////////////////////////////////////////////////////////////
function uber_app (config, cb) {
  let context = {config};

  async.series ([
    cb => _do_ns_init ('components', context, cb),
    cb => _do_ns_init ('controllers', context, cb),
    cb => _do_ns_init ('mw', context, cb),
    cb => {
      // init app
      var App = require ('./app');

      App (config, context, (err, app) => {
        if (err) return cb (err);
        context.app = app;
        log.info ('app initialized');
        cb ();
      });
    },
    cb => _init_metrics (context, cb),
    cb => _do_ns_setup ('components', context, cb),
    cb => _do_ns_setup ('controllers', context, cb),
    cb => _do_ns_setup ('mw', context, cb),
  ], err => {
    context.shutdown = (doexit, cb) => __shutdown__ (context, doexit, cb);
    cb (err, context);
  });
}

module.exports = uber_app;
