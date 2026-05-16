module.exports = {
  apps: [
    {
      name: 'whasender-api',
      script: './api/src/index.js',
      cwd: '/opt/whasender',
      watch: false,
      max_memory_restart: '400M',
      restart_delay: 5000,
      log_file: '/opt/whasender/logs/api.log',
      error_file: '/opt/whasender/logs/api-error.log',
      out_file: '/opt/whasender/logs/api-out.log',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
