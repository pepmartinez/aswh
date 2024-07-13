
module.exports = {
  aswh: {
    base_url: 'http://aswh:6677',
    chk_path: '/metrics',
    api_path: '/wh',
    q_path:   '/q'
  },
  keuss: {
    base_url: 'mongodb://mongo/aswh',
  },
  redis: {
    port: 6379,
    host: 'redis'
  },
  postgres: {
    user:     'pg', 
    password: 'pg',
    host:     'postgres',
    port:     5432,
    database: 'pg'

  }
};
