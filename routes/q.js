const Log = require ('winston-log-space');


const log = Log.logger ('app:q');


////////////////////////////////////////////////////////////////////////////////////
class model {
  ////////////////////////////////////////////////////////////////////////////////////
  constructor (ctrl) {
    this._ctrl = ctrl;
  }

  ////////////////////////////////////////////////////////////////////////////////////
  _delete (req, res) {
    const qn = req.params.qn;
    const ns = req.params.ns;
    const id = req.params.id;

    this._ctrl._delete (ns, qn, id, (err, ret) => {
      if (err) return res.status (err.code || 500).send ({res: 'ko', text: err.err});
      res.status (ret.code || 200).send (ret.text || ret.ret || ret)
    });
  }
}


////////////////////////////////////////////////////////////////////////////////////
class ctrl {
  ////////////////////////////////////////////////////////////////////////////////////
  constructor (context) {
    this._context = context;
  }

  ////////////////////////////////////////////////////////////////////////////////////
  _delete (ns, qn, id, cb) {
    const q = this._context.components.Keuss.queue (qn, ns);
  
    if (!q) return cb ({
      code: 404,
      err: `queue [${qn}] or queue group [${ns}] not found`
    });
  
    log.debug ('deleting element [%s] from queue %s at %s', id, q, ns);
  
    cb (null, 'ok');
  }
}


////////////////////////////////////////////////////////////////////////////////////
module.exports = {
  register: function (app, context) {
    const _ctrl = new ctrl (context);
    const _model = new model (_ctrl);

    app.delete ('/q/:ns/:qn/:id', (req, res) => _model._delete (req, res));
  }
};

