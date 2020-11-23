const express =    require ('express');
const bodyParser = require ('body-parser');
var promster =     require ('@promster/express');
var morgan =       require ('morgan');
var Log =          require ('winston-log-space');


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

  app.use('/metrics', (req, res) => {
    res.setHeader ('Content-Type', promster.getContentType());
    res.end (promster.getSummary());
  });

  // parse everything as text. A more robust and generic solution shoudl use raw() and manage Buffers, though
  app.use (bodyParser.text ({type: () => true}));

  // main server entry point: anything here is queued for async delivery
  app.all ('/wh', (req, res) => {
    const url = req.headers['x-dest-url'];
    let delay = 0;

    // we expect a header x-dest-url to specif the webhook's url
    if (!url) return res.status (400).send ('no x-dest-url, ignoring request');

    // one can specify the initial delay, if desired
    const delay_str = req.headers['x-delay'];
    if (delay_str) {
      delete req.headers['x-delay'];
      delay = parseInt (delay_str);
    }

    // build the payload...
    delete req.headers['x-dest-url'];
    const pl = {
      url: url,
      method: req.method,
      headers: req.headers,
      body: req.body
    };

    // ...and queue it
    context.q.push (pl, {delay: delay}, (err, id) => {
      // error while queuing?
      if (err) {
        console.error ('error whipe pushing payload:', err);
        return res.status (500).send (err);
      }

      // no errors, return a 201 Created...
      console.log ('inserted element with id %s', id);
      return res.status (201).send ({res: 'ok', id: id});
    });
  });


  // test respnses for various http response codes
  app.all ('/test/200', (req, res) => res.status (200).send ('a 200'));
  app.all ('/test/400', (req, res) => res.status (400).send ('a 400'));
  app.all ('/test/404', (req, res) => res.status (404).send ('a 404'));
  app.all ('/test/500', (req, res) => res.status (500).send ('a 500'));

  // do not respond
  app.all ('/test/noresponse', (req, res) => {});

  // close socket
  app.all ('/test/drop', (req, res) => req.socket.destroy());

  // express error manager
  app.use (function (err, req, res, next) {
    console.error ('error caught: %s', err.stack);
    res.status (err.status || 500).send (err.stack);
  });

  done (null, app);
};

