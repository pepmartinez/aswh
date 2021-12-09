const _ =     require ('lodash');
const async = require ('async');
const Log =   require ('winston-log-space');


const log = Log.logger ('app:q');



////////////////////////////////////////////////////////////////////////////////////
class model {
  ////////////////////////////////////////////////////////////////////////////////////
  constructor (ctrl) {
    this._ctrl = ctrl;
  }

  
  _manage_resp (err, ret, res) {
    if (err) return res.status (err.code || 500).send ({res: 'ko', text: err.err || err});
    res.status (ret.code || 200).send (ret.text || ret.ret || ret);
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_qgs (req, res) {
    this._ctrl._get_qgs ((err, ret) => this._manage_resp (err, ret, res));
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_qs_from_qg (req, res) {
    const ns = req.params.ns;
    this._ctrl._get_qs_from_qg (ns, (err, ret) => this._manage_resp (err, ret, res));
  }

  ////////////////////////////////////////////////////////////////////////////////////
  _get_q (req, res) {
    const qn = req.params.qn;
    const ns = req.params.ns;
    this._ctrl._get_q (ns, qn, (err, ret) => this._manage_resp (err, ret, res));
  }

  ////////////////////////////////////////////////////////////////////////////////////
  _delete_by_id_from_queue (req, res) {
    const qn = req.params.qn;
    const ns = req.params.ns;
    const id = req.params.id;

    this._ctrl._delete_by_id_from_queue (ns, qn, id, (err, ret) => this._manage_resp (err, ret, res));
  }
}



////////////////////////////////////////////////////////////////////////////////////
class ctrl {
  ////////////////////////////////////////////////////////////////////////////////////
  constructor (context) {
    this._context = context;
    this._k = this._context.components.Keuss;
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_qgs (cb) {
    const ret = {};
    _.each (this._k.queue_groups(), (v, k) => {
      ret[k] = {
        type: v.type(),
        url:  v._opts.url
      }
    });

    cb (null, ret);
  }

  
  ////////////////////////////////////////////////////////////////////////////////////
  _get_qs_from_qg (ns, cb) {
    const qg = this._k.queue_groups()[ns];

    if (!qg) return cb({code: 404, err: `queue group ${ns} does not exist`});

    const tasks = {};
    _.each (this._k.queues (), (v, k) => {
      const spl = k.split('@');
      if (spl[1] == ns) {
        tasks[spl[0]] = cb => {
          async.parallel ({
            stats:     cb => v.stats(cb),
            size:      cb => v.size(cb),
            totalSize: cb => v.totalSize(cb),
            schedSize: cb => v.schedSize(cb),
            resvSize:  cb => v.resvSize(cb),
          }, cb);
        };
      }
    });

    async.parallel (tasks, cb);
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_q (ns, qn, cb) {
    const qg = this._k.queue_groups()[ns];
    if (!qg) return cb({code: 404, err: `queue group ${ns} does not exist`});

    const q = this._k.queue(qn, ns);
    if (!q) return cb({code: 404, err: `queue ${qn} at group ${ns} does not exist`});

    async.parallel ({
      stats:     cb => q.stats(cb),
      size:      cb => q.size(cb),
      totalSize: cb => q.totalSize(cb),
      schedSize: cb => q.schedSize(cb),
      resvSize:  cb => q.resvSize(cb),
    }, cb);
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _delete_by_id_from_queue (ns, qn, id, cb) {
    const q = this._k.queue (qn, ns);
  
    if (!q) return cb ({
      code: 404,
      err: `queue [${qn}] or queue group [${ns}] not found`
    });
  
    log.debug ('deleting element [%s] from queue %s at %s', id, q, ns);
    q.remove (id, (err, res) => {
      if (err) return cb (err);
      if (!res) return cb ({code: 404, err: `element with id [${id}] not found`});
      cb ();
    });
  }
}


////////////////////////////////////////////////////////////////////////////////////
module.exports = {
  register: function (app, context) {
    const _ctrl = new ctrl (context);
    const _model = new model (_ctrl);

    app.get ('/q',         (req, res) => _model._get_qgs        (req, res));
    app.get ('/q/:ns',     (req, res) => _model._get_qs_from_qg (req, res));
    app.get ('/q/:ns/:qn', (req, res) => _model._get_q          (req, res));

    app.delete ('/q/:ns/:qn/:id', (req, res) => _model._delete_by_id_from_queue (req, res));
  }
};

