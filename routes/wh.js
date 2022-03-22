const Log = require ('winston-log-space');


const log = Log.logger ('app:wh');


function _get_mw (context) {
  return function (req, res) {
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

    log.debug (`queue query: ${q_name}:${q_ns} -> ${q.name()}-${q.ns()}`);

    q.push (pl, {delay}, (err, id) => {
      // error while queuing?
      if (err) {
        log.error ('error while pushing payload: %o', err);
        context.metrics.q_ops.labels(q.ns(), q.name(), 'push', 'ko').inc ();
        return res.status (500).send (err);
      }

      // no errors, return a 201 Created...
      log.verbose (`inserted element in queue ${q.name()}@${q.ns()} with id ${id}`);
      context.metrics.q_ops.labels(q.ns(), q.name(), 'push', 'ok').inc ();
      return res.status (201).send ({res: 'ok', id: id, q: q.name(), ns: q.ns ()});
    });
  };
}



module.exports = {
  register: function (app, context) {app.all ('/wh', _get_mw (context));}
};
