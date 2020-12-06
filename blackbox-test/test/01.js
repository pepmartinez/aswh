const should =  require ('should');
const async =   require ('async');
const request = require ('supertest');
const _ =       require ('lodash');
const express = require ('express');
const bodyParser = require ('body-parser');

const cfg =      require ('../config');
const tools =    require ('../tools');
const fixtures = require ('../fixtures');


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe ('blackbox tests, phase I', () => {
  let app = null;
  let app_http = null;

  before (done => {
    tools.waitforit(cfg.aswh.base_url, {path: cfg.aswh.chk_path}, done);
  });

  after (done => {
    done ();
  });

  beforeEach (done => {
    done ();
  });

  afterEach (done => {
    if (app) {
      app_http.close (err => {
        app_http = null;
        app = null;
        done (err);
      });
    }
    else {
      done ();
    }
  });


  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  it ('returns 400 if no x-dest-url passed', done => {
    request (cfg.aswh.base_url)
    .get(cfg.aswh.api_path)
    .expect (400, 'no x-dest-url, ignoring request')
    .end (done);
  });


  it ('forwards a GET ok', done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app.get ('/this/is/the/path', (req, res) => {
      res.send ('ok');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});

      done ();
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      .get(cfg.aswh.api_path)
      .set ({
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
          ns: 'default'
        });
      });
    });
  });


  it ('forwards a json PUT ok', done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app.put ('/this/is/the/path', (req, res) => {
      res.send ('ok');

      req.headers.should.match ({
        host: 'tests:36677',
        a_a_a: '123',
        b_b_b: 'qwe',
        'content-type': 'application/json',
        'content-length': '39'
      });

      req.query.should.eql ({a: '1', bb: 'ww'});
      req.body.should.equal ('{"a":false,"b":4,"c":"qwe","d":{"a":1}}');

      done ();
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      .put(cfg.aswh.api_path)
      .set ({
        'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
        a_a_a: '123',
        b_b_b: 'qwe'
      })
      .send ({a: false, b: 4, c: 'qwe', d: {a: 1}})
      .expect (201)
      .end ((err, res) => {
        if (err) return done (err);
        res.body.should.match ({
          res: 'ok',
          id: /.+/,
          q: 'default',
          ns: 'default'
        });
      });
    });
  });


  it ('forwards a text POST ok', done => {
    app = new express ();
    app.use (bodyParser.text ({type: () => true}));
    app.post ('/this/is/the/path', (req, res) => {
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

      done ();
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      .post (cfg.aswh.api_path)
      .set ({
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
          ns: 'default'
        });
      });
    });
  });



});
