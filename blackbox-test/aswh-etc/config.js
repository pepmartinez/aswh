module.exports = {
  listen_port: 6677,
  keuss: {
    base_url: 'mongodb://mongo/aswh',
    queue_groups: {
      default: {
        max_retries: 2,
        mq: 'simple',
        queues: {
          default: {
            window: 3,
            retry: {
              delay: {
                c0: 1,
                c1: 1,
                c2: 1
              }
            }
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
