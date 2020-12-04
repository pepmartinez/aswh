const _ =     require ('lodash');
const http =  require ('http');
const https = require ('https');
var Log =     require ('winston-log-space');

var log = Log.logger ('Components:HttpAgents');

//////////////////////////////////////////////////////////////////
class Agents {
  constructor (opts) {
    this._opts = opts;
    this._agents_http = {};
    this._agents_https = {};
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    _.each (_.get (this._opts, 'agents.http', {}), (v, k) => {
      this._agents_http[k] = new http.Agent (v);
      log.verbose ('created http agent [%s]', k);
    });

    _.each (_.get (this._opts, 'agents.https', {}), (v, k) => {
      this._agents_https[k] = new https.Agent (v);
      log.verbose ('created https agent [%s]', k);
    });

    this._http_default = this.get_http ('default');
    this._https_default = this.get_https ('default');

    cb (null, this);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    _.each (this._agents_http, (v, k) => {
      v.destroy ();
      log.verbose ('destroyed http agent [%s]', k);
    });

    _.each (this._agents_https, (v, k) => {
      v.destroy ();
      log.verbose ('destroyed https agent [%s]', k);
    });

    cb ();
  }


  //////////////////////////////////////////////////////////////////
  get_http (id) {
    if (!id) return this._agents_http.default;
    let a =  this._agents_http[id];
    if (!a) a = this._agents_http.default || false;
    return a;
  }


  //////////////////////////////////////////////////////////////////
  get_https (id) {
    if (!id) return this._agents_https.default;
    let a =  this._agents_https[id];
    if (!a) a = this._agents_https.default || false;
    return a;
  }


  //////////////////////////////////////////////////////////////////
  get_by_url (url) {
    if (url.match (/^http:/)) return this._http_default;
    if (url.match (/^https:/)) return this._https_default;
    return false;
  }

  //////////////////////////////////////////////////////////////////
  status () {
    return {
      http: this._agents_http,
      https: this._agents_https
    };
  }


}


module.exports = Agents;
