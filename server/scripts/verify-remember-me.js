// Verifies "Remember me" on login against a running API: ticked, the login
// cookie is kept for the token's lifetime (JWT_EXPIRE, 7 days by default);
// not ticked, it is a session cookie (gone when the browser closes) holding a
// token that expires within 12 hours. Both sign in.
//
// Usage (from server/): node scripts/verify-remember-me.js
// API_URL defaults to http://localhost:5000/api. Signs in as the seed dev1
// account; it changes nothing.

const API = process.env.API_URL || 'http://localhost:5000/api';
const HOUR = 60 * 60;

let failures = 0;
const check = (name, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
    if (!ok) failures++;
};

// Signs in and describes the token cookie it gets back
const login = async (extra) => {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev1@company.com', password: 'Password1', ...extra })
    });
    if (res.status === 429) {
        console.error('rate limited: clear rl:* keys in Redis and retry');
        process.exit(2);
    }
    const setCookie = res.headers.getSetCookie().find(c => c.startsWith('token=')) || '';
    const token = setCookie.split(';')[0].slice('token='.length);
    const maxAge = Number(setCookie.match(/Max-Age=(\d+)/i)?.[1]);
    const persistent = /Max-Age=|Expires=/i.test(setCookie);
    let tokenLifetime = NaN;
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        tokenLifetime = payload.exp - payload.iat;
    } catch { /* no token */ }
    const me = token ? await fetch(`${API}/auth/me`, { headers: { Cookie: `token=${token}` } }) : null;
    return { status: res.status, persistent, maxAge, tokenLifetime, meStatus: me?.status };
};
const show = (r) => `login=${r.status} persistent=${r.persistent} maxAge=${r.maxAge}s token=${r.tokenLifetime}s me=${r.meStatus}`;

// 1. Ticked: a cookie that outlives the browser, as long as the token
const remembered = await login({ rememberMe: true });
check('1 remember me keeps the cookie', remembered.status === 200 && remembered.persistent && remembered.tokenLifetime >= 24 * HOUR &&
    Math.abs(remembered.maxAge - remembered.tokenLifetime) <= 5 && remembered.meStatus === 200, show(remembered));

// 2. Not ticked (or not sent): a session cookie with a token of at most 12 hours
const session = await login({ rememberMe: false });
const omitted = await login({});
check('2 otherwise a short session cookie', [session, omitted].every(r => r.status === 200 && !r.persistent && r.tokenLifetime <= 12 * HOUR && r.tokenLifetime > 0 && r.meStatus === 200),
    `false: ${show(session)} | omitted: ${show(omitted)}`);

// 3. A value that isn't true/false is refused
const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev1@company.com', password: 'Password1', rememberMe: 'forever' })
});
check('3 rememberMe must be true or false', res.status === 400, `status=${res.status}`);

console.log('---');
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
