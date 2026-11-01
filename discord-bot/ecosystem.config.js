module.exports = {
  apps: [
    {
      name: 'headless-dice-bot',
      script: './index.js',
      cwd: __dirname,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};

