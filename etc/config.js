
module.exports = {
  listen_port: 6677,
  keuss: {
    base_url: 'mongodb://localhost/aswh',
    queue_groups: {
      default: {
        mq: 'simple',
        queues: {
          default: {
          }
        }
      }
    }
  }
};
