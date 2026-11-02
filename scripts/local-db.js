// Starts a private MongoDB for development: its own data folder inside this
// project and its own port, so it never touches any other MongoDB instance.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const port = process.env.LOCAL_DB_PORT || '27027';
const dbPath = path.join(__dirname, '..', '.localdb');
const candidates = [
    process.env.MONGOD_PATH,
    'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe',
    '/usr/bin/mongod',
    '/usr/local/bin/mongod',
    '/opt/homebrew/bin/mongod',
].filter(Boolean);
const binary = candidates.find(candidate => fs.existsSync(candidate)) || 'mongod';

fs.mkdirSync(dbPath, { recursive: true });
console.log(`Starting private MongoDB on 127.0.0.1:${port}\n  data: ${dbPath}\n  use:  MONGO_URI=mongodb://127.0.0.1:${port}\n`);

const child = spawn(binary, ['--dbpath', dbPath, '--port', port, '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
