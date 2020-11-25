
const CConf = require ('cascade-config');
const Log =   require ('winston-log-space');
const async = require ('async');

Log.init (err => {
  if (err) return console.error (err);

  const log = Log.logger ('main:main');
  const  cconf = new CConf ();

  const _defaults = {
    listen_port: 6677,
  };

  cconf
  .obj (_defaults)
  .env ()
  .file(__dirname + '/etc/config.js')
  .file(__dirname + '/etc/config-{NODE_ENV:development}.js')
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

