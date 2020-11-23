const async = require ('async');
const _ =     require ('lodash');


const controllers = [
];

function init (context, cb) {
  const config = context.config;
  const ctrls = {};
  const tasks = {};

  _.each (controllers, ctrl_name => {
    const ctrl = new (require ('./' + ctrl_name)) (config, context, ctrls);
    ctrls[ctrl_name] = ctrl;
    tasks[ctrl_name] = cb => ctrl.init (cb);
  });

  async.series (tasks, cb);
};


module.exports = {
  init: init
};
