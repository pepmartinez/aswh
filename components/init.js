const async = require ('async');
const _ =     require ('lodash');
const Log =   require ('winston-log-space');

const log = Log.logger ('Components:init');

const components = [
  'Keuss',
  'Consumer'
];

function init (context, cb) {
  const config = context.config;
  const components_store = {};
  const tasks = {};

  log.info ('initializing components');

  _.each (components, component_name => {
    if (!context.components) context.components = {};

    const component = new (require ('./' + component_name)) (config, context, components_store);
    log.info ('created [%s]', component_name);

    components_store[component_name] = component;
    tasks[component_name] = cb => component.init (context, (err, who) => {
      if (!err) {
        context.components[component_name] = who;
        log.info ('initialized [%s] OK', component_name);
      }

      cb (err, who);
    });
  });

  async.series (tasks, cb);
}


module.exports = {
  init: init
};
