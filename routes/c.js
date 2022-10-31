const _ =     require ('lodash');
const async = require ('async');
const Log =   require ('winston-log-space');


const log = Log.logger ('app:c');



////////////////////////////////////////////////////////////////////////////////////
class model {
  ////////////////////////////////////////////////////////////////////////////////////
  constructor (ctrl) {
    this._ctrl = ctrl;
  }

  
  ////////////////////////////////////////////////////////////////////////////////////
  _manage_resp (err, ret, res) {
    if (err) return res.status (err.code || 500).send ({res: 'ko', text: err.err || err});
    if (!ret) return res.status (204).end ();
    res.status (ret.code || 200).send (ret.text || ret.ret || ret);
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_consumers (req, res) {
    this._ctrl._get_consumers ((err, ret) => this._manage_resp (err, ret, res));
  }

  ////////////////////////////////////////////////////////////////////////////////////
  _get_consumer (req, res) {
    const c = req.params.c;
    this._ctrl._get_consumer (c, (err, ret) => this._manage_resp (err, ret, res));
  }
}



////////////////////////////////////////////////////////////////////////////////////
class ctrl {
  ////////////////////////////////////////////////////////////////////////////////////
  constructor (context) {
    this._context = context;
    this._c = this._context.components.Consumer;
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_consumers (cb) {
    const ret = {};
    _.each (this._c.consumers(), (v, k) => {
      ret[k] = {
        id: v._id
      };
    });

    cb (null, ret);
  }


  ////////////////////////////////////////////////////////////////////////////////////
  _get_consumer (cn, cb) {
    const c = this._c.consumers()[cn];
    if (!c) return cb({code: 404, err: `consumer ${cn} does not exist`});
    c.status(cb);
  }
}


////////////////////////////////////////////////////////////////////////////////////
module.exports = {
  register: function (app, context) {
    const _ctrl = new ctrl (context);
    const _model = new model (_ctrl);

    app.get ('/c',     (req, res) => _model._get_consumers  (req, res));
    app.get ('/c/:c',  (req, res) => _model._get_consumer   (req, res));
  }
};