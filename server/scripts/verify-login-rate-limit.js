// Verifies the login rate limits against a running API:
// only failed attempts count, per account+IP (5 per 15 min), plus a per-IP
// cap across accounts (50 per 15 min). All requests come from this machine.
//
// Usage (from server/): node scripts/verify-login-rate-limit.js
// API_URL defaults to http://localhost:5000/api. Clear the rl:* keys in Redis
// first; the per-IP counter carries over between runs for 15 minutes, and
// this script leaves this IP rate limited for login when it finishes.

const API = process.env.API_URL || 'http://localhost:5000/api';
const SEED = { email: 'superadmin@company.com', password: 'Password1' };
const IP_CAP_MESSAGE = 'Too many failed login attempts from this network, please try again after 15 minutes';

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

const login = async (email, password, headers = {}) => {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, message: json.message };
};

const stamp = Date.now();
const accountA = `rl-a-${stamp}@example.com`;

// 1. Successful logins don't use up the limit
const ok = [];
for (let i = 0; i < 7; i++) ok.push((await login(SEED.email, SEED.password)).status);
check('1 successful logins are not limited', ok.every(s => s === 200), `statuses=${ok.join(',')}`);

// 2. Five failed attempts on one account, then that account is blocked
const failed = [];
for (let i = 0; i < 6; i++) failed.push((await login(accountA, 'Wrong-pass1')).status);
check('2 account blocked after 5 failures', failed.slice(0, 5).every(s => s === 401) && failed[5] === 429,
    `statuses=${failed.join(',')}`);

// 3. Someone else on the same IP can still sign in
const other = await login(SEED.email, SEED.password);
check('3 other account on same IP unaffected', other.status === 200, `status=${other.status}`);

// 4. A spoofed X-Forwarded-For doesn't reset the counter (TRUST_PROXY unset)
const spoofed = await login(accountA, 'Wrong-pass1', { 'X-Forwarded-For': '203.0.113.7' });
check('4 X-Forwarded-For does not bypass', spoofed.status === 429, `status=${spoofed.status}`);

// 5. Failures spread over many accounts hit the per-IP cap of 50
// (7 failed requests so far: 5x401 + 429 in check 2, 429 in check 4)
let firstBlockedAt = null;
let blockedMessage = '';
for (let i = 1; i <= 60 && firstBlockedAt === null; i++) {
    const res = await login(`rl-spray-${stamp}-${i}@example.com`, 'Wrong-pass1');
    if (res.status === 429) {
        firstBlockedAt = 7 + i;
        blockedMessage = res.message;
    }
}
check('5 per-IP cap after 50 failures', firstBlockedAt === 51 && blockedMessage === IP_CAP_MESSAGE,
    `first 429 at failed request #${firstBlockedAt} msg='${blockedMessage}'`);

// 6. Once the per-IP cap is reached, every login from this IP waits it out
const afterCap = await login(SEED.email, SEED.password);
check('6 cap blocks the whole IP', afterCap.status === 429, `status=${afterCap.status}`);

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
console.log('note: clear the rl:* keys in Redis to sign in from this machine again');
process.exit(failures === 0 ? 0 : 1);
