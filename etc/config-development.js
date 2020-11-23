
module.exports = {
  rooms: {
    cleanup_period: 30,
    expiration_delta: 60
  },
  middlewares: {
    'sip-auth' : {
      disable: true
    }
  }
};
