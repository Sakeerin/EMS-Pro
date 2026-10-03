// Runs the API (node server.js) as a child process for npm test, keeping the
// tail of its output so a failing run can show what the API logged.

import { spawn } from 'child_process';
import net from 'net';

// True when nothing is listening on the port
export const isPortFree = (port) => new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port);
});

export const startApi = ({ cwd, env, maxLines = 200 }) => {
    const child = spawn(process.execPath, ['server.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = [];
    const keep = (chunk) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
            if (line) lines.push(line);
        }
        if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);

    let exited = false;
    child.once('exit', () => { exited = true; });

    // Last resort if the runner dies without cleaning up (an uncaught error,
    // process.exit): don't leave an API holding the port
    const killOnExit = () => { if (!exited) child.kill(); };
    process.on('exit', killOnExit);

    return {
        logTail: (count = 40) => lines.slice(-count).join('\n'),
        hasExited: () => exited,
        stop: () => new Promise((resolve) => {
            process.off('exit', killOnExit);
            if (exited) return resolve();
            child.once('exit', () => resolve());
            child.kill();
            setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 5000).unref();
        })
    };
};

// Polls GET <apiUrl>/health until it answers 200, the API exits, or time runs out
export const waitForHealth = async (apiUrl, { timeoutMs = 30000, hasExited = () => false } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !hasExited()) {
        const status = await fetch(`${apiUrl}/health`).then((res) => res.status).catch(() => null);
        if (status === 200) return true;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
};
