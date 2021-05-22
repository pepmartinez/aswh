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
  'bucket'
].forEach (mq => {

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe ('errors and retries on queue NS ' + mq, () => {
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

  [
    'get',
    'delete'
  ].forEach (verb => it (`forwards a ${verb} ok, gets a 400, does not retry, element goes to __failed__`, done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app[verb] ('/this/is/the/path', (req, res) => {
      res.status (400).send ('ko');
      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
        cb => tools.getQueueContents (mq, '__failed__', cb),
        cb => tools.clearColl        (mq, '__failed__', cb),
      ], (err, res) => {
        if (err) return done (err);
        res[1].should.eql([]);
        res[2].map (i => i.payload.__p ?  i.payload.__p :  i.payload).should.match ([{
          url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
          method: verb.toUpperCase (),
          headers: {a_a_a: '123', b_b_b: 'qwe'},
          body: null,
          xtra: {}
        }]);
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
  ].forEach (verb => it (`forwards a ${verb} ok, gets a 400, does not retry, element does callback via __failed__cb__`, done => {
    app = new express ();
    app.use (bodyParser.json ());
    app[verb] ('/this/is/the/path', (req, res) => {
      res.status (400).send ('ko');
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
          status:400,
          body:{},
          text:"ko",
          headers:{
            "content-type":/.+/,
            "content-length":"2"
          }
        }
      });

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
        cb => tools.getQueueContents (mq, '__failed__', cb),
      ], (err, res) => {
        if (err) return done (err);
        res[1].should.eql([]);
        res[2].should.eql([]);
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
    'get',
    'delete'
  ].forEach (verb => it (`forwards a ${verb} ok, gets a 500, retries to deadletter`, done => {
    let tries = 0;
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app[verb] ('/this/is/the/path', (req, res) => {
      tries++;
      res.status (500).send ('ko');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
        cb => tools.getQueueContents (mq, '__failed__', cb),
        cb => tools.getQueueContents (mq, '__deadletter__', cb),
        cb => tools.clearColl        (mq, '__failed__', cb),
        cb => tools.clearColl        (mq, '__deadletter__', cb),
      ], (err, res) => {
        if (err) return done (err);
        try {

        const q_cnt =  res[1].map (i => i.payload.__p ?  i.payload.__p :  i.payload);
        const fl_cnt = res[2].map (i => i.payload.__p ?  i.payload.__p :  i.payload);
        const dl_cnt = res[3].map (i => i.payload.__p ?  i.payload.__p :  i.payload);

        fl_cnt.should.eql([]);

        if (dl_cnt.length == 0) {
          q_cnt.should.match([{
            url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
            headers: {
              a_a_a: '123',
              b_b_b: 'qwe'
            },
            body: null
          }]);
        }
        else {
          q_cnt.should.eql([]);
          dl_cnt.should.match([{
            url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
            headers: {
              a_a_a: '123',
              b_b_b: 'qwe'
            },
            body: null
          }]);
          console.log ('got to DL in %d tries', tries)
          done ();
        }
      } catch (e) {return done(e)}
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
    'post',
    'put',
    'patch'
  ].forEach (verb => it (`forwards a text ${verb} ok, gets a 400, does not retry, element goes to __failed__`, done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app[verb] ('/this/is/the/path', (req, res) => {
      res.status(400).send ('ko');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe',
        'content-type': 'text/plain',
        'content-length': '10'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});
      req.body.should.equal ('qwertyuiop');

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
        cb => tools.getQueueContents (mq, '__failed__', cb),
        cb => tools.clearColl        (mq, '__failed__', cb),
      ], (err, res) => {
        if (err) return done (err);
        res[1].should.eql([]);
        res[2].map (i =>  i.payload.__p ?  i.payload.__p :  i.payload).should.match ([{
          url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
          method: verb.toUpperCase (),
          headers: {a_a_a: '123', b_b_b: 'qwe'},
          body: 'qwertyuiop',
          xtra: {}
        }]);
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
  ].forEach (verb => it (`forwards a text ${verb} ok, gets a 400, does not retry, element does callback via __failed__cb__does callback via __failed__cb__`, done => {
    app = new express ();
    app.use (bodyParser.json ());
    app[verb] ('/this/is/the/path', (req, res) => {
      res.status (400).send ('ko');
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
          status:400,
          body:{},
          text:"ko",
          headers:{
            "content-type":/.+/,
            "content-length":"2"
          }
        }
      });

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
        cb => tools.getQueueContents (mq, '__failed__', cb),
      ], (err, res) => {
        if (err) return done (err);
        res[1].should.eql([]);
        res[2].should.eql([]);
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

  [
    'post',
    'put',
    'patch'
  ].forEach (verb => it (`forwards a text ${verb} ok, gets a 500, retries to deadletter`, done => {
    let tries = 0;
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app[verb] ('/this/is/the/path', (req, res) => {
      tries++;
      res.status(500).send ('ko');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe',
        'content-type': 'text/plain',
        'content-length': '10'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});
      req.body.should.equal ('qwertyuiop');

      async.series ([
        cb => setTimeout (cb, 1000),
        cb => tools.getQueueContents (mq, 'default', cb),
        cb => tools.getQueueContents (mq, '__failed__', cb),
        cb => tools.getQueueContents (mq, '__deadletter__', cb),
        cb => tools.clearColl        (mq, '__failed__', cb),
        cb => tools.clearColl        (mq, '__deadletter__', cb),
      ], (err, res) => {
        if (err) return done (err);

        const q_cnt =  res[1].map (i => i.payload.__p ?  i.payload.__p :  i.payload);
        const fl_cnt = res[2].map (i => i.payload.__p ?  i.payload.__p :  i.payload);
        const dl_cnt = res[3].map (i => i.payload.__p ?  i.payload.__p :  i.payload);

        fl_cnt.should.eql([]);

        if (dl_cnt.length == 0) {
          q_cnt.should.match([{
            url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
            headers: {
              a_a_a: '123',
              b_b_b: 'qwe',
              'content-type': 'text/plain',
            },
            body: 'qwertyuiop'
          }]);
        }
        else {
          q_cnt.should.eql([]);
          dl_cnt.should.match([{
            url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
            headers: {
              a_a_a: '123',
              b_b_b: 'qwe',
              'content-type': 'text/plain',
            },
            body: 'qwertyuiop'
          }]);
          console.log ('got to DL in %d tries', tries)
          done ();
        }
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

});

});
