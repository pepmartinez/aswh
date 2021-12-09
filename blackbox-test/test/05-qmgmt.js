const should =  require ('should');
const async =   require ('async');
const request = require ('supertest');
const _ =       require ('lodash');
const express = require ('express');
const bodyParser = require ('body-parser');

const cfg =      require ('../config');
const tools =    require ('../tools');


[
  'default',
  'tape',
  'bucket'
].forEach (mq => {
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  describe (`queue management - ${mq}`, () => {
    let app = null;
    let app_http = null;

    before (done => {
      tools.waitforit(cfg.aswh.base_url, {path: cfg.aswh.chk_path}, done);
    });

    after (done => {
      done ();
    });

    beforeEach (done => {
//      console.log ('beforeEach')
      done ();
    });

    afterEach (done => {
//      console.log ('afterEach')
      if (app) {
        app_http.close (err => {
          app_http = null;
          app = null;
//          console.log ('afterEach app down')
          done (err);
        });
      }
      else {
        done ();
      }
    });
    
    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    it ('gets all queues ok', done => {
      request (cfg.aswh.base_url)
      .get(cfg.aswh.q_path + `/${mq}`)
      .expect (200)
      .end ((err, res) => {
        res.body.should.match ({
          default: { stats: {}, size: 0, resvSize: 0, schedSize: 0, totalSize: 0 },
          __failed__cb__: { stats: {}, totalSize: 0, resvSize: 0, size: 0, schedSize: 0 },
          __failed__: { stats: {}, size: 0, schedSize: 0, totalSize: 0, resvSize: 0 },
          __completed__cb__: { stats: {}, schedSize: 0, totalSize: 0, size: 0, resvSize: 0 }
        })
        done (err);
      });
    });


    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    it ('gets one queue ok', done => {
      request (cfg.aswh.base_url)
      .get(cfg.aswh.q_path + `/${mq}/default`)
      .expect (200)
      .end ((err, res) => {
        res.body.should.match ({ stats: {}, size: 0, resvSize: 0, schedSize: 0, totalSize: 0 })
        done (err);
      });
    });


    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    it ('returns 404 on unknown queue', done => {
      request (cfg.aswh.base_url)
      .get(cfg.aswh.q_path + `/${mq}/unknown-queue`)
      .expect (404)
      .end (done);
    });


    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    it ('returns 404 when attempting to remove a non-existing element from queue', done => {
      request (cfg.aswh.base_url)
      .delete(cfg.aswh.q_path + `/${mq}/default/11223344556677889900aabb`)
      .expect (404)
      .end (done);
    });


    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    it ('removes a waiting element from queue ok');


    /////////////////////////////////////////////////////////////////////////////////////////////////////////
    it ('does not remove a reserved element from queue');
  });
});

