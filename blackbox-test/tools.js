const { MongoClient } = require('mongodb');

const async =   require ('async');
const request = require ('supertest');
const _ =       require ('lodash');


module.exports = {
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


  getColl (uri, coll, q, cb) {
    if (!cb) {
      cb = q;
      q = {};
    }

    const client = new MongoClient (uri, { useUnifiedTopology: true });
    client.connect ((err, cl) => {
      if (err) return cb (err);
      cl.db ().collection(coll).find (q).toArray ((err, docs) => {
        cl.close (() => cb (err, docs));
      });
    });
  },

  clearColls: function (uri, cb) {
    const client = new MongoClient (uri, { useUnifiedTopology: true });
    client.connect ((err, cl) => {
      if (err) return cb (err);
      cl.db ().collections ((err, colls) => {
        if (err) return cl.close (() => cb (err));

        let tasks = [];
        _.each (colls, coll => {
          tasks.push (cb => coll.deleteMany ({}, cb))
        })

        async.series (tasks, (err, res) => {
          if (err) return cl.close (() => cb (err));
          cl.close (cb);
        });
      });
    });
  },


  dropDB: function (uri, cb) {
    const client = new MongoClient (uri, { useUnifiedTopology: true });
    client.connect ((err, cl) => {
      if (err) return cb (err);
      cl.db ().dropDatabase (err => {
        cl.close (() => cb (err));
      });
    });
  },

};
