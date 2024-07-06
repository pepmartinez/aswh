const should =  require ('should');
const async =   require ('async');
const request = require ('supertest');
const _ =       require ('lodash');
const express = require ('express');
const bodyParser = require ('body-parser');

const cfg =   require ('../config');
const tools = require ('../tools');

[
  'default',
  'tape',
  'bucket',
  'redis'
].forEach (mq => {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe ('insertions & forwards 1-to-1 on queue NS ' + mq, () => {
  let app = null;
  let app_http = null;

  before (done => {
    tools.waitforit(cfg.aswh.base_url, {path: cfg.aswh.chk_path}, done);
  });

  after (done => {
    done ();
  });

  beforeEach (done => {
//    console.log ('beforeEach')
    done ();
  });

  afterEach (done => {
//    console.log ('afterEach')
    if (app) {
      app_http.close (err => {
        app_http = null;
        app = null;
//        console.log ('afterEach app down')
        done (err);
      });
    }
    else {
      done ();
    }
  });


  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  it ('returns 404 if unknown x-queue-ns passed', done => {
    request (cfg.aswh.base_url)
    .get(cfg.aswh.api_path)
    .set ({'x-dest-url': 'http://a.b/', 'x-queue-ns': 'odin-knows'})
    .expect (404)
    .end (done);
  });


  it ('returns 404 if unknown x-queue passed', done => {
    request (cfg.aswh.base_url)
    .get(cfg.aswh.api_path)
    .set ({'x-dest-url': 'http://a.b/', 'x-queue': 'odin-knows'})
    .expect (404)
    .end (done);
  });

  
  it ('returns 400 if no x-dest-url passed', done => {
    request (cfg.aswh.base_url)
    .get(cfg.aswh.api_path)
    .expect (400)
    .end (done);
  });


  [
    'get',
    'delete'
  ].forEach (verb => it (`forwards a ${verb} ok`, done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app[verb] ('/this/is/the/path', (req, res) => {
      res.send ('ok');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});

      tools.getQueueContents (mq, 'default', (err, res) => {
        res.should.eql([]);
        done ();
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb](cfg.aswh.api_path)
      .set ({
        'x-queue-ns': mq,
        'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
        a_a_a: '123',
        b_b_b: 'qwe'
      })
      .expect (201)
      .end ((err, res) => {
        if (err) return done (err);
        res.body.should.match ({
          res: 'ok',
          id: /.+/,
          q: 'default',
          ns: mq
        });

      });
    });
  }));


  [
    'get',
    'delete'
  ].forEach (verb => it (`forwards a ${verb} ok, element does callback via __completed__cb__`, done => {
    app = new express ();
    app.use (bodyParser.json ());
    app[verb] ('/this/is/the/path', (req, res) => {
      res.status (200).send ('ok');
    });

    app.post ('/cb', (req, res) => {
      res.send ('ok');
      req.body.should.match ({
        req: {
          url:"http://tests:36677/this/is/the/path?a=1&bb=ww",
          method: verb.toUpperCase (),
          headers:{
            a_a_a:"123",
            b_b_b:"qwe"
          },
          xtra:{},
          cb_url:"http://tests:36677/cb"
        },
        res:{
          status:200,
          body:{},
          text:"ok",
          headers:{
            "content-type":/.+/,
            "content-length":"2"
          }
        }
      });

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
      ], (err, res) => {
        if (err) return done (err);
        res[1].should.eql([]);
        done ();
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb](cfg.aswh.api_path)
      .set ({
        'x-queue-ns': mq,
        'x-cb-url': 'http://tests:36677/cb',
        'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
        a_a_a: '123',
        b_b_b: 'qwe'
      })
      .expect (201)
      .end ((err, res) => {
        if (err) return done (err);
        res.body.should.match ({
          res: 'ok',
          id: /.+/,
          q: 'default',
          ns: mq
        });
      });
    });
  }));


  [
    'post',
    'put',
    'patch'
  ].forEach (verb => it (`forwards a text ${verb} ok`, done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app[verb] ('/this/is/the/path', (req, res) => {
      res.send ('ok');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe',
        'content-type': 'text/plain',
        'content-length': '10'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});
      req.body.should.equal ('qwertyuiop');

      tools.getQueueContents (mq, 'default', (err, res) => {
        res.should.eql([]);
        done ();
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb] (cfg.aswh.api_path)
      .set ({
        'x-queue-ns': mq,
        'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
        a_a_a: '123',
        b_b_b: 'qwe'
      })
      .type ('text')
      .send ('qwertyuiop')
      .expect (201)
      .end ((err, res) => {
        if (err) return done (err);
        res.body.should.match ({
          res: 'ok',
          id: /.+/,
          q: 'default',
          ns: mq
        });
      });
    });
  }));


  [
    'post',
    'put',
    'patch'
  ].forEach (verb => it (`forwards a text ${verb} ok, element does callback via __completed__cb__`, done => {
    app = new express ();
    app.use (bodyParser.json ());
    app[verb] ('/this/is/the/path', (req, res) => {
      res.status (200).send ('ok');
    });

    app.post ('/cb', (req, res) => {
      res.send ('ok');
      req.body.should.match ({
        req: {
          url:"http://tests:36677/this/is/the/path?a=1&bb=ww",
          method: verb.toUpperCase (),
          headers:{
            a_a_a:"123",
            b_b_b:"qwe"
          },
          body: 'qwertyuiop',
          xtra:{},
          cb_url:"http://tests:36677/cb"
        },
        res:{
          status:200,
          body:{},
          text:"ok",
          headers:{
            "content-type":/.+/,
            "content-length":"2"
          }
        }
      });

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
      ], (err, res) => {
        if (err) return done (err);
        res[1].should.eql([]);
        done ();
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb] (cfg.aswh.api_path)
      .set ({
        'x-queue-ns': mq,
        'x-cb-url': 'http://tests:36677/cb',
        'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
        a_a_a: '123',
        b_b_b: 'qwe'
      })
      .type ('text')
      .send ('qwertyuiop')
      .expect (201)
      .end ((err, res) => {
        if (err) return done (err);
        res.body.should.match ({
          res: 'ok',
          id: /.+/,
          q: 'default',
          ns: mq
        });
      });
    });
  }));

});

});
