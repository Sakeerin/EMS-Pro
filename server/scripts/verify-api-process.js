// Checks the helper npm test uses to wait for its API (scripts/lib/
// apiProcess.js): waiting for /api/health gives up on time even when the
// port accepts connections but never answers.
//
// Usage (from server/): node scripts/verify-api-process.js
// Needs no API or database; listens briefly on a free local port.

import net from 'net';
import { waitForHealth } from './lib/apiProcess.js';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

// 1. A server that accepts connections and never replies doesn't hold the wait past its limit
const sockets = [];
const silent = net.createServer((socket) => sockets.push(socket));
await new Promise((resolve) => silent.listen(0, resolve));
const { port } = silent.address();
const started = Date.now();
const healthy = await Promise.race([
    waitForHealth(`http://127.0.0.1:${port}/api`, { timeoutMs: 3000 }),
    new Promise((resolve) => setTimeout(() => resolve('still waiting'), 15000))
]);
const seconds = ((Date.now() - started) / 1000).toFixed(1);
check('1 gives up on a server that never answers', healthy === false && seconds < 8, `result=${healthy} after ${seconds}s (limit 3s)`);
for (const socket of sockets) socket.destroy();
silent.close();

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
