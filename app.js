const express =    require ('express');
const bodyParser = require ('body-parser');
const promster =   require ('@promster/express');
const morgan =     require ('morgan');
const Log =        require ('winston-log-space');
const path =       require ('path');

module.exports = function  (opts, context, done) {
  var log = Log.logger ('app');
  var access_log = Log.logger ('access');
  var app = express();

  app.use (morgan ('combined', { stream: { write: message => access_log.info (message.trim ()) }}));

  app.use (promster.createMiddleware({
    app: app,
    options: {
      normalizePath: (full_path, {req, res}) => (req.route ? path.join (req.baseUrl, req.route.path) : full_path.split ('?')[0])
    }
  }));

  app.use('/metrics', async (req, res) => {
    res.setHeader ('Content-Type', promster.getContentType());
    res.end (await promster.getSummary());
  });

  // parse everything as text. A more robust and generic solution should use raw() and manage Buffers, though
  app.use (bodyParser.text ({type: () => true}));

  require ('./routes/wh')  .register (app, context);
  require ('./routes/q')   .register (app, context);
  require ('./routes/util').register (app, context);

  // express error manager
  app.use (function (err, req, res, next) {
    log.error (`error caught: ${err.stack}`);
    res.status (err.status || 500).send (err.stack);
  });

  done (null, app);
}
