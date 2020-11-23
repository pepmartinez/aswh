const async = require ('async');
const _ =     require ('lodash');


const middlewares = [
];

function init (context, cb) {
  const config = context.config;
  const ctrls = {};
  const tasks = {};

  _.each (middlewares, ctrl_name => {
    if (_.get (config, `middlewares.${ctrl_name}.disable`)) return;
    const ctrl = new (require ('./' + ctrl_name)) (config, context, ctrls);
    ctrls[ctrl_name] = ctrl;
    tasks[ctrl_name] = cb => ctrl.init (cb);
  });

  async.series (tasks, cb);
}

module.exports = {
  init: init
};
