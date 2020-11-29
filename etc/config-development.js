module.exports = {
  keuss: {
    base_url: 'mongodb://localhost/aswh',
    queue_groups: {
      tape: {
        mq: 'tape',
        queues: {
          default: {
          },
          fastlane: {
          }
        }
      },
      bucket: {
        mq: 'bucket',
        queues: {
          default: {
          },
          fastlane: {
          }
        }
      },
    }
  }
};
