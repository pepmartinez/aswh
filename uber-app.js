const async = require ('async');
const _ =     require ('lodash');
const Log =   require ('winston-log-space');

const log = Log.logger ('main:uber-app');


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
    cb => {
      var tasks = [];
      _.each (context.mw, (v, k) => {
        tasks.push (cb => {
          log.info ('shutting down middleware %s', k);
          v.end (cb);
        });
      });

      log.info ('shutting down middlewares');
      async.series (tasks, cb);
    },
    cb => {
      var tasks = [];
      _.each (context.controllers, (v, k) => {
        tasks.push (cb => {
          log.info ('shutting down controller %s', k);
          v.end (cb);
        });
      });

      log.info ('shutting down controllers');
      async.series (tasks, cb);
    },
    cb => {
      // stop promster
      if (context.promster) context.promster.register.clear();
      cb ();
    },
    cb => {
      var tasks = [];
      _.each (context.components, (v, k) => {
        tasks.push (cb => {
          log.info ('shutting down component %s', k);
          v.end (cb);
        });
      });

      log.info ('shutting down components');
      async.series (tasks, cb);
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


/////////////////////////////////////////////////////////////////
function uber_app (config, cb) {
  let context = {config};

  async.series ([
    cb => {
      // init components
      var Components = require ('./components/init');

      Components.init (context, (err, res) => {
        if (err) return cb (err);
        context.components = res;
        log.info ('components initialized');
        cb ();
      });
    },
    cb => {
      // init controllers
      var Controllers = require ('./controllers/init');

      Controllers.init (context, (err, res) => {
        if (err) return cb (err);
        context.controllers = res;
        log.info ('controllers initialized');
        cb ();
      });
    },
    cb => {
      // init middlewares
      var MW = require ('./mw/init');

      MW.init (context, (err, res) => {
        if (err) return cb (err);
        context.mw = res;
        log.info ('middlewares initialized');
        cb ();
      });
    },
    cb => {
      // init app
      var App = require ('./app');

      App (config, context, (err, app) => {
        if (err) return cb (err);
        context.app = app;
        context.promster = context.app.locals.Prometheus;
        log.info ('app initialized');
        cb ();
      });
    },
  ], err => {
    context.shutdown = (doexit, cb) => __shutdown__ (context, doexit, cb);
    cb (err, context);
  });
}

module.exports = uber_app;
