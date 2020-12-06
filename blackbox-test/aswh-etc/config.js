module.exports = {
  listen_port: 6677,
  keuss: {
    base_url: 'mongodb://mongo/aswh',
    queue_groups: {
      default: {
        mq: 'simple',
        queues: {
          default: {
          }
        }
      },
      tape: {
        mq: 'tape',
        queues: {
          default: {
          },
          extra: {
          }
        }
      },
      bucket: {
        mq: 'bucket',
        queues: {
          default: {
          },
          extra: {
          }
        }
      }
    }
  }
};
