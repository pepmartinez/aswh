const Log = require ('winston-log-space');


const log = Log.logger ('app:util');

function delay (req, res, next) {
  const delay = parseInt(req.query.d);
  if (delay <= 0) return next();
  log.verbose ('enforce delay of %d', delay);
  setTimeout (() => next (), delay);
}


module.exports = {
  register: function (app) {
    app.all ('/test/200', [delay], (req, res) => res.status (200).send ('a 200'));
    app.all ('/test/400', [delay], (req, res) => res.status (400).send ('a 400'));
    app.all ('/test/404', [delay], (req, res) => res.status (404).send ('a 404'));
    app.all ('/test/500', [delay], (req, res) => res.status (500).send ('a 500'));
  
    // do not respond
    app.all ('/test/noresponse', [delay],  (req, res) => {});
  
    // close socket
    app.all ('/test/drop', [delay], (req, res) => req.socket.destroy());
  }
};
