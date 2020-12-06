module.exports = {
  agents: {
    http: {
      agent_a : {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
        maxFreeSockets: 2,
        timeout: 12000
      }
    },
    https: {
      agent_z : {
        keepAlive: true,
        keepAliveMsecs: 10000,
        maxSockets: 10,
        maxFreeSockets: 2,
        timeout: 12000
      }
    },
  },
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
