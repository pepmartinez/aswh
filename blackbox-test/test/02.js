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
describe ('erors and retries', () => {
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
  ].forEach (verb => it (`forwards a ${verb} ok, gets a 400, does not retry`, done => {
    let tries = 0;
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

      tools.getQueueContents ('default', 'default', (err, res) => {
        res.should.eql([]);
        done ();
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb](cfg.aswh.api_path)
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

      tools.getQueueContents ('default', 'default', (err, res) => {
        if (tries <= 3) {
          res.should.match([{
            payload: {
              url: 'http://tests:36677/this/is/the/path?a=1&bb=ww',
              headers: {
                a_a_a: '123',
                b_b_b: 'qwe'
              },
              body: null
            },
            tries: tries
          }]);
        }
        else {
          res.should.eql([]);
          done ();
        }
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb](cfg.aswh.api_path)
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
  }));


  [
    'post',
    'put',
    'patch'
  ].forEach (verb => it (`forwards a text ${verb} ok, gets a 400, does not retry`, done => {
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

      tools.getQueueContents ('default', 'default', (err, res) => {
        res.should.eql([]);
        done ();
      });
    });

    app_http = app.listen (36677, () => {
      request (cfg.aswh.base_url)
      [verb] (cfg.aswh.api_path)
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
  }));


});