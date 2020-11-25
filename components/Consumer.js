const Log =   require ('winston-log-space');
const _ =     require ('lodash');
const async = require ('async');

const consumer = require ('../lib/consumer');

var log = Log.logger ('Components:Consumer');


//////////////////////////////////////////////////////////////////
class Consumer {
  constructor (opts) {
    this._opts = opts || {};
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  init (context, cb) {
    this._context = context;
    _.each (context.q, (q, qn) => {
      consumer.run (q);
    })

    cb (null, this);
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////
  end (cb) {
    const tasks = [];
    _.each (this._context.q, (q, qn) => {
      tasks.push (cb => {
        q.cancel ();
        q.drain (cb);
      });
    });

    async.series (tasks, cb);
  }
}

module.exports = Consumer;

