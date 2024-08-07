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
        max_retries: 2,
        mq: 'tape',
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
          },
          extra: {
          }
        }
      },
      bucket: {
        max_retries: 3,
        mq: 'bucket',
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
          },
          extra: {
          }
        }
      },
      redis: {
        max_retries: 3,
        mq: 'redis',
        redis: {
          Redis: {
            host: 'redis'
          }
        },
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
          },
          extra: {
          }
        }
      },
      postgres: {
        max_retries: 3,
        mq: 'postgres',
        postgres: {
          host: 'postgres'
        },
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
          },
          extra: {
          }
        }
      },
    }
  }
};
