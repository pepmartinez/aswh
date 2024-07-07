const { MongoClient } = require('mongodb');
const Redis =           require('ioredis');
const pg =              require ('pg');

const async =   require ('async');
const request = require ('supertest');
const _ =       require ('lodash');

const cfg = require ('./config');

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = {
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  waitforit: function (url, opts, done) {
    if (!done) {
      done = opts;
      opts = {};
    }

    if (_.isNil (opts.tries)) opts.tries = 60;

    console.log (`    trying ${url}/${opts.path} (${opts.tries} retries left)...`);

    request(url).get (opts.path).end ((err, res) => {
      if (res && (res.status == 200)) return done();
      if (opts.tries == 0) return done (`too many tries waiting for HTTP 200 OK on ${url}/${opts.path}`);

      opts.tries--
      setTimeout (() => this.waitforit (url, opts, done), opts.wait || 1000);
    });
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _getColl (uri, coll, q, cb) {
    if (!cb) {
      cb = q;
      q = {};
    }

    const client = new MongoClient (uri, { useUnifiedTopology: true });
    client.connect ((err, cl) => {
      if (err) return cb (err);
      cl.db ().collection(coll).find (q).toArray ((err, docs) => {
//        console.log (`got coll ${coll} on ${uri} with query`, q, ':',  docs);
        cl.close (() => cb (err, docs));
      });
    });
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _getQueueContents_mongo: function (type, queue, cb) {
    const uri = cfg.keuss.base_url + '_' + type;
    let q;
    
    switch (type) {
      case 'tape':
        q = {processed: {$exists: false}}
        break;

      default:
        q = {};
    }

    setTimeout (() => this._getColl (uri, queue, q, (err, res) => {
//      console.log ('read coll %s at %s -> %j', queue, uri, res);
      if (type == 'bucket') {
        let ret = [];
        res.forEach (i => i.b.forEach (o => ret.push ({payload: o, tries: i.tries})));
        cb (err, ret);
      }
      else  {
        cb (err, res);
      }
    }), 1000);
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _getQueueContents_postgres(type, queue, cb) {
    const client = new pg.Client(cfg.postgres);

    async.series ([
      cb => client.connect(cb),
      cb => client.query(`SELECT * FROM _k_tbl_${queue}`, cb),
      cb => client.end (cb)
    ], (err, res) => {
      client.end (() => {})
//      console.log ('_getQueueContents_postgres err', err)
//      console.log ('_getQueueContents_postgres res', res[1].rows)
      if (err) return cb (err);

      const ret = res[1].rows.map (i => {
        const ret = _.merge ({}, i, i._pl);
        delete (ret._pl);
        return ret;
      });

//      console.log ('_getQueueContents_postgres res', ret);
      return cb (null, ret);
    });
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _getQueueContents_redis(type, queue, cb) {
    const redis = new Redis(cfg.redis);
    redis.hgetall(`keuss:q:ordered_queue:hash:${queue}`, (err, res) => {
      const arr = [];
      _.each (res, v => arr.push (JSON.parse (v)));
      redis.quit(() => cb (err, arr));
    });
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getQueueContents: function (type, queue, cb) {
    switch (type) {
      case 'default':
      case 'simple':   
      case 'tape':     
      case 'bucket':   return this._getQueueContents_mongo(type, queue, cb);
      case 'postgres': return this._getQueueContents_postgres(type, queue, cb);
      case 'redis':    return this._getQueueContents_redis(type, queue, cb);
    }
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _clearQueue_mongo: function (type, queue, cb) {
    const uri = cfg.keuss.base_url + '_' + type;
    const client = new MongoClient (uri, { useUnifiedTopology: true });
    client.connect ((err, cl) => {
      if (err) return cb (err);
      cl.db ().collection(queue).deleteMany ({}, () => cl.close (cb));
    });
  },

  
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _clearQueue_postgres: function (type, queue, cb) {
    const client = new pg.Client(cfg.postgres);

    async.series ([
      cb => client.connect(cb),
      cb => client.query(`DELETE FROM _k_tbl_${queue}`, cb),
      cb => client.end (cb)
    ], (err, res) => {
      client.end (() => {})
//      console.log ('_clearQueue_postgres err', err)
//      console.log ('_clearQueue_postgres res', res[1].rowCount)
      if (err) return cb (err);
      return cb ();
    });
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  _clearQueue_redis: function (type, queue, cb) {
    const redis = new Redis(cfg.redis);

    async.series ([
      cb => redis.del (`keuss:q:ordered_queue:hash:${queue}`, cb),
      cb => redis.del (`keuss:q:ordered_queue:index:${queue}`, cb),
    ], (err, res) => {
      redis.quit(() => cb (err));
    });
  },


  /////////////////////////////////////////////////////////////////////////////////////////////////////////////
  clearQueue: function (type, queue, cb) {
    switch (type) {
      case 'default':
      case 'simple':   
      case 'tape':     
      case 'bucket':   return this._clearQueue_mongo(type, queue, cb);
      case 'postgres': return this._clearQueue_postgres(type, queue, cb);
      case 'redis':    return this._clearQueue_redis(type, queue, cb);
    }
  },

};
