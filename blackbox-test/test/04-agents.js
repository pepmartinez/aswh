const should =  require ('should');
const async =   require ('async');
const request = require ('supertest');
const _ =       require ('lodash');
const express = require ('express');
const bodyParser = require ('body-parser');

const cfg =      require ('../config');
const tools =    require ('../tools');


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
describe ('http(s) agent selection', () => {
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
    'delete',
    'post',
    'put',
    'patch'
  ].forEach (verb => {
    it (`calls ${verb} with default agent`, done => {
      app = new express ();
      app.use (bodyParser.text ({type: () => true}));
      app[verb] ('/this/is/the/path', (req, res) => {
        res.send ('ok');

        req.headers.should.match ({
          host: 'tests:36677',
          a_a_a: '123',
          b_b_b: 'qwe',
          connection: 'keep-alive'
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
        .end (() => {});
      });
    });

    it (`calls ${verb} with no agent`, done => {
      app = new express ();
      app.use (bodyParser.text ({type: () => true}));
      app[verb] ('/this/is/the/path', (req, res) => {
        res.send ('ok');

        req.headers.should.match ({
          host: 'tests:36677',
          a_a_a: '123',
          b_b_b: 'qwe',
          connection: 'close'
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
          'x-http-agent': 'none',
          'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
          a_a_a: '123',
          b_b_b: 'qwe'
        })
        .expect (201)
        .end (() => {});
      });
    });


    it (`calls ${verb} with explicit agent`, done => {
      app = new express ();
      app.use (bodyParser.text ({type: () => true}));
      app[verb] ('/this/is/the/path', (req, res) => {
        res.send ('ok');

        req.headers.should.match ({
          host: 'tests:36677',
          a_a_a: '123',
          b_b_b: 'qwe',
          connection: 'keep-alive'
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
          'x-http-agent': 'default',
          'x-dest-url': 'http://tests:36677/this/is/the/path?a=1&bb=ww',
          a_a_a: '123',
          b_b_b: 'qwe'
        })
        .expect (201)
        .end (() => {});
      });
    });

  });

});

