const localtunnel = require('localtunnel');

(async () => {
  console.log("Starting LocalTunnel...");
  // Tries to connect to port 4173 with your custom name
  const tunnel = await localtunnel({ 
    port: 4173, 
    subdomain: 'umiya-rms-cipra' 
  });

  console.log(`✅ Tunnel is active at: ${tunnel.url}`);

  tunnel.on('close', () => {
    console.log("Tunnel closed");
  });
})();