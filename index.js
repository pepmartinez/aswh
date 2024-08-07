
const CConf = require ('cascade-config');
const Log =   require ('winston-log-space');
const async = require ('async');

Log.init (err => {
  if (err) return console.error (err);

  const log = Log.logger ('main:main');
  const  cconf = new CConf ();

  const _defaults = {
    listen_port: 6677,
    keuss: {
      base_url: 'mongodb://localhost/aswh',
      queue_groups: {
        default: {
          mq: 'simple',
          queues: {
            default: {
            }
          }
        }
      }
    },
    defaults: {
      retry: {
        max: 5,
        delay: {
          c0: 3,
          c1: 3,
          c2: 3
        }
      }
    },
    agents: {
      http: {
        default : {
          keepAlive: true,
          keepAliveMsecs: 10000,
          maxSockets: 1024,
          maxFreeSockets: 256,
          timeout: 120000
        }
      },
      https: {
        default : {
          keepAlive: true,
          keepAliveMsecs: 10000,
          maxSockets: 1024,
          maxFreeSockets: 256,
          timeout: 120000
        }
      },
    },
  };

  cconf
  .obj (_defaults)
  .env ()
  .file(`${__dirname}/etc/config.js`,                          {ignore_missing: true})
  .file(`${__dirname}/etc/config-{NODE_ENV:development}.js`,   {ignore_missing: true})
  .yaml(`${__dirname}/etc/config.yaml`,                        {ignore_missing: true})
  .yaml(`${__dirname}/etc/config-{NODE_ENV:development}.yaml`, {ignore_missing: true})
  .env ()
  .args ()
  .done ((err, config) => {
    if (err) return log.error (err);

    const full_app = require ('./uber-app');

    full_app (config, (err, context) => {
      async.series ([
        cb => cb (err),
        cb => {
          var listen_port = config.listen_port;
          var server = require ('http').createServer (context.app);
          context.server = require ('http-shutdown') (server);

          context.server.listen (listen_port, err => {
            if (err) return cb (err);
            log.info ('app listening at %s', listen_port);
            cb ();
          });
        },
        cb => {
          require ('@promster/express').signalIsUp();
          cb ();
        }
      ], err => {  // all done
        if (err) {
          log.error (err);
          process.exit (1);
        }

        // set up shutdown hooks
        process.on ('SIGINT',  () => context.shutdown (true));
        process.on ('SIGTERM', () => context.shutdown (true));

        log.info ('instance ready');
      });
    });
  });
});

