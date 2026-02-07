module.exports = {
  apps: [
    // 1. Frontend (Your Existing Config)
    {
      name: "frontend-production",
      script: "launcher.cjs",
      cwd: "E:\\umiya-rms\\frontend",
      windowsHide: true,
      env: {
        NODE_ENV: "production"
      }
    },

    // 2. Backend (Your Existing Config)
    {
      name: "backend-server",
      script: "app.js",
      cwd: "E:\\umiya-rms\\backend",
      windowsHide: true,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    },

    {
      name: "ngrok-tunnel",
      script: "C:\\Users\\Umiya\\AppData\\Local\\Microsoft\\WinGet\\Links\\ngrok.exe", 
      args: "http --domain=epiphytically-horsy-tyrone.ngrok-free.dev 4173",
      windowsHide: true, 
      autorestart: true,
      max_memory_restart: '1G'
    },

    {
      name: "localtunnel",
      script: "tunnel.cjs", // 👈 Runs the robust script instead of the command
      cwd: "E:\\umiya-rms\\frontend",
      windowsHide: true,
      autorestart: true
    }
  ]
};