// =============================================================================
// pm2 process config for the SIRAH LIFE backend.
// Usage (from /var/www/sirah):
//   pm2 start deploy/vps/ecosystem.config.cjs
//   pm2 save            # persist across reboots
//   pm2 startup         # print the systemd command to enable boot-start
//
// Env is NOT injected here — the app reads /var/www/sirah/backend/.env via
// Nest's ConfigModule (envFilePath: ['.env.local', '.env']). Keep secrets there.
// =============================================================================

module.exports = {
  apps: [
    {
      name: 'sirah-backend',
      cwd: '/var/www/sirah/backend',
      script: 'dist/main.js',

      // fork (single instance). The realtime gateway uses socket.io; cluster
      // mode would need sticky sessions, unnecessary at this scale.
      instances: 1,
      exec_mode: 'fork',

      env: { NODE_ENV: 'production' },

      max_memory_restart: '600M',
      autorestart: true,
      // Backoff so a crash-loop (e.g. bad env) doesn't hammer the box.
      restart_delay: 3000,
      max_restarts: 10,

      merge_logs: true,
      time: true,
      out_file: '/var/log/sirah/backend-out.log',
      error_file: '/var/log/sirah/backend-err.log',
    },
  ],
};
