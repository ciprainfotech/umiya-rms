const { exec } = require('child_process');

// We use 'vite preview' because it reads your vite.config.js (and basicSsl)
const cmd = 'npx vite preview --port 4173 --host';

console.log(`Starting HTTPS Frontend via Vite Preview...`);

const child = exec(cmd, { cwd: __dirname, windowsHide: true });

child.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(output);
});

child.stderr.on('data', (data) => console.error(data.toString()));