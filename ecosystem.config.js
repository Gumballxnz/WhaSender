module.exports = {
  apps: [
    {
      name: 'whasender-api',
      script: './api/src/index.js',
      cwd: './',
      watch: false,
      max_memory_restart: '400M',
      restart_delay: 5000,
      log_file: './logs/api.log',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
