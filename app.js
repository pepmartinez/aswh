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

  // parse everything as text. A more robust and generic solution shoudl use raw() and manage Buffers, though
  app.use (bodyParser.text ({type: () => true}));

  // main server entry point: anything here is queued for async delivery
  app.all ('/wh', (req, res) => {
    const url =    req.headers['x-dest-url'];
    const cb_url = req.headers['x-cb-url'];
    const q_name = req.headers['x-queue'];
    const q_ns =   req.headers['x-queue-ns'];
    const agent =  req.headers['x-http-agent'];

    let delay = 0;

    // we expect a header x-dest-url to specif the webhook's url
    if (!url) return res.status (400).send ({res: 'ko', text: 'no x-dest-url, ignoring request'});

    // one can specify the initial delay, if desired
    const delay_str = req.headers['x-delay'];
    if (delay_str) {
      delete req.headers['x-delay'];
      delay = parseInt (delay_str);
    }

    // build the payload...
    const cl = req.headers['content-length'];

    // remove one-hop headers
    delete req.headers['host'];
    delete req.headers['content-length'];
    delete req.headers['connection'];
    delete req.headers['transfer-encoding'];

    delete req.headers['x-dest-url'];
    delete req.headers['x-cb-url'];
    delete req.headers['x-queue'];
    delete req.headers['x-queue-ns'];
    delete req.headers['x-http-agent'];

    const pl = {
      url: url,
      method: req.method,
      headers: req.headers,
      body: cl ? req.body : null,
      xtra: {}
    };

    if (agent)  pl.xtra.agent = agent;
    if (cb_url) pl.cb_url = cb_url;

    // ...and queue it
    const q = context.components.Keuss.queue(q_name, q_ns);

    if (!q) {
      return res.status (404).send ({res: 'ko', text: `queue [${q_name || 'default'}] or queue group [${q_ns || 'default'}] not found`});
    }

    log.debug ('queue query: %s:%s -> %s-%s', q_name, q_ns, q.name(), q.ns());

    q.push (pl, {delay}, (err, id) => {
      // error while queuing?
      if (err) {
        log.error ('error while pushing payload:', err);
        context.metrics.q_ops.labels(q.ns(), q.name(), 'push', 'ko').inc ();
        return res.status (500).send (err);
      }

      // no errors, return a 201 Created...
      log.verbose ('inserted element in queue %s@%s with id %s', q.name(), q.ns(), id);
      context.metrics.q_ops.labels(q.ns(), q.name(), 'push', 'ok').inc ();
      return res.status (201).send ({res: 'ok', id: id, q: q.name(), ns: q.ns ()});
    });
  });

  function delay (req, res, next) {
    const delay = parseInt(req.query.d);
    if (delay <= 0) return next();
    log.verbose ('enforce delay of %d', delay);
    setTimeout (() => next (), delay);
  }

  // test responses for various http response codes
  app.all ('/test/200', [delay], (req, res) => res.status (200).send ('a 200'));
  app.all ('/test/400', [delay], (req, res) => res.status (400).send ('a 400'));
  app.all ('/test/404', [delay], (req, res) => res.status (404).send ('a 404'));
  app.all ('/test/500', [delay], (req, res) => res.status (500).send ('a 500'));

  // do not respond
  app.all ('/test/noresponse', [delay],  (req, res) => {});

  // close socket
  app.all ('/test/drop', [delay], (req, res) => req.socket.destroy());

  // express error manager
  app.use (function (err, req, res, next) {
    log.error ('error caught: %s', err.stack);
    res.status (err.status || 500).send (err.stack);
  });

  done (null, app);
};

