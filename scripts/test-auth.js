// Auth smoke test: starts the server, runs register/login/protected-route checks, then stops.
// Usage: stop any running server (Ctrl+C), then run: npm run test:auth
require('dotenv').config({ quiet: true });
const { spawn } = require('child_process');
const path = require('path');
const db = require('../config/database');

const PORT = process.env.PORT || 5001;
const BASE = `http://localhost:${PORT}/api/auth`;
const EMAIL = 'auth-test@tiny.com';
const PASSWORD = 'test123456';

let passed = 0, failed = 0;
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`, detail ?? ''); }
};
const call = async (method, url, { body, token } = {}) => {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const waitForServer = async () => {
  for (let i = 0; i < 30; i++) {
    try { await fetch(`http://localhost:${PORT}/api/health`); return; } catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error(`Server did not start on port ${PORT}`);
};

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], { stdio: 'ignore' });
  try {
    await waitForServer();
    await db.query('DELETE FROM users WHERE email = $1', [EMAIL]); // start clean
    console.log('\n🧪 Auth tests\n');

    let r = await call('POST', '/register', { body: { email: EMAIL, username: 'authtest', password: PASSWORD, role: 'manager' } });
    check('Register returns 201', r.status === 201, r);
    check('Register ignores role sent by client (is employee)', r.data.user?.role === 'employee', r.data.user);

    r = await call('POST', '/register', { body: { email: EMAIL, username: 'authtest', password: PASSWORD } });
    check('Duplicate register returns 409', r.status === 409, r);

    r = await call('POST', '/login', { body: { email: EMAIL, password: 'wrong-password' } });
    check('Wrong password returns 401', r.status === 401, r);

    r = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
    check('Login returns token', r.status === 200 && !!r.data.token, r);
    let token = r.data.token;

    r = await call('GET', '/me');
    check('/me without token returns 401', r.status === 401, r);

    r = await call('GET', '/me', { token });
    check('/me with token returns user', r.status === 200 && r.data.user?.email === EMAIL, r);

    r = await call('GET', '/manager-test', { token });
    check('Employee blocked from manager route (403)', r.status === 403, r);

    await db.query("UPDATE users SET role = 'manager' WHERE email = $1", [EMAIL]);
    r = await call('POST', '/login', { body: { email: EMAIL, password: PASSWORD } });
    token = r.data.token;
    r = await call('GET', '/manager-test', { token });
    check('Manager allowed on manager route (200)', r.status === 200, r);

    await db.query('DELETE FROM users WHERE email = $1', [EMAIL]); // clean up
    console.log(`\n${failed === 0 ? '🎉' : '⚠️'}  ${passed} passed, ${failed} failed\n`);
  } catch (err) {
    console.error('\n❌ Test run error:', err.message);
    failed++;
  } finally {
    server.kill();
    await db.end();
    process.exit(failed ? 1 : 0);
  }
})();
