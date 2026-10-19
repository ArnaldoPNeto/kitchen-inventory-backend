// Inventory API tests: starts the server, tests every inventory route, cleans up, stops.
// Usage: stop any running server (Ctrl+C), then run: npm run test:inventory
require('dotenv').config({ quiet: true });
const { spawn } = require('child_process');
const path = require('path');
const db = require('../config/database');

const PORT = process.env.PORT || 5001;
const BASE = `http://localhost:${PORT}/api`;
const EMPLOYEE = { email: 'inv-employee@tiny.com', username: 'invemployee', password: 'test123456' };
const MANAGER = { email: 'inv-manager@tiny.com', username: 'invmanager', password: 'test123456' };
const TEST_PREFIX = 'TEST ITEM';

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
    try { await fetch(`${BASE}/health`); return; } catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error(`Server did not start on port ${PORT}`);
};
const cleanup = async () => {
  await db.query('DELETE FROM inventory_items WHERE name LIKE $1', [`${TEST_PREFIX}%`]);
  await db.query('DELETE FROM users WHERE email = ANY($1)', [[EMPLOYEE.email, MANAGER.email]]);
};
const loginAs = async (user) => (await call('POST', '/auth/login', { body: user })).data.token;

(async () => {
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], { stdio: 'ignore' });
  try {
    await waitForServer();
    await cleanup();

    // Setup: one employee and one manager
    await call('POST', '/auth/register', { body: EMPLOYEE });
    await call('POST', '/auth/register', { body: MANAGER });
    await db.query("UPDATE users SET role = 'manager' WHERE email = $1", [MANAGER.email]);
    const employeeToken = await loginAs(EMPLOYEE);
    const managerToken = await loginAs(MANAGER);

    console.log('\n🧪 Inventory tests\n');

    // --- Access control
    let r = await call('GET', '/inventory');
    check('List without token → 401', r.status === 401, r);

    r = await call('POST', '/inventory', { token: employeeToken, body: { name: `${TEST_PREFIX} Hacker` } });
    check('Employee cannot create item → 403', r.status === 403, r);

    // --- Create (manager)
    r = await call('POST', '/inventory', { token: managerToken, body: { quantity: 5 } });
    check('Create without name → 400', r.status === 400, r);

    r = await call('POST', '/inventory', { token: managerToken, body: { name: `${TEST_PREFIX} Tomatoes`, quantity: -3 } });
    check('Create with negative quantity → 400', r.status === 400, r);

    r = await call('POST', '/inventory', {
      token: managerToken,
      body: { name: `${TEST_PREFIX} Tomatoes`, quantity: 2, unit: 'kg', min_quantity: 5, unit_cost: 3.5 },
    });
    check('Manager creates item → 201', r.status === 201 && r.data.item?.id, r);
    const lowItemId = r.data.item?.id;
    check('Numbers come back as numbers (not strings)', typeof r.data.item?.quantity === 'number', r.data.item);

    r = await call('POST', '/inventory', {
      token: managerToken,
      body: { name: `${TEST_PREFIX} Onions`, quantity: 20, unit: 'kg', min_quantity: 5 },
    });
    const okItemId = r.data.item?.id;

    r = await call('POST', '/inventory', { token: managerToken, body: { name: `${TEST_PREFIX} Bad`, category_id: 999999 } });
    check('Create with non-existent category → 400', r.status === 400, r);

    // --- Read (employee)
    r = await call('GET', '/inventory', { token: employeeToken });
    check('Employee lists items → 200', r.status === 200 && Array.isArray(r.data.items), r);

    r = await call('GET', `/inventory?search=${encodeURIComponent(TEST_PREFIX)}`, { token: employeeToken });
    check('Search finds the 2 test items', r.data.count === 2, r.data);

    r = await call('GET', '/inventory?lowStock=true', { token: employeeToken });
    const lowIds = (r.data.items || []).map(i => i.id);
    check('Low-stock filter includes Tomatoes (2 ≤ 5)', lowIds.includes(lowItemId), lowIds);
    check('Low-stock filter excludes Onions (20 > 5)', !lowIds.includes(okItemId), lowIds);

    r = await call('GET', `/inventory/${lowItemId}`, { token: employeeToken });
    check('Get one item → 200 with is_low_stock = true', r.status === 200 && r.data.item?.is_low_stock === true, r);

    r = await call('GET', '/inventory/999999', { token: employeeToken });
    check('Get non-existent item → 404', r.status === 404, r);

    r = await call('GET', '/inventory/abc', { token: employeeToken });
    check('Get with invalid id → 400', r.status === 400, r);

    // --- Stock count (employee)
    r = await call('PATCH', `/inventory/${lowItemId}/quantity`, { token: employeeToken, body: { quantity: 10 } });
    check('Employee updates quantity → 200', r.status === 200 && r.data.item?.quantity === 10, r);

    r = await call('PATCH', `/inventory/${lowItemId}/quantity`, { token: employeeToken, body: { quantity: 'lots' } });
    check('Invalid quantity → 400', r.status === 400, r);

    r = await call('GET', `/inventory/${lowItemId}`, { token: employeeToken });
    check('Item no longer low stock after restock', r.data.item?.is_low_stock === false, r.data.item);

    // --- Edit (manager)
    r = await call('PUT', `/inventory/${lowItemId}`, { token: employeeToken, body: { unit_cost: 1 } });
    check('Employee cannot edit item → 403', r.status === 403, r);

    r = await call('PUT', `/inventory/${lowItemId}`, { token: managerToken, body: { unit_cost: 4.25, min_quantity: 8 } });
    check('Manager edits item → 200', r.status === 200 && r.data.item?.unit_cost === 4.25 && r.data.item?.min_quantity === 8, r);

    r = await call('PUT', `/inventory/${lowItemId}`, { token: managerToken, body: {} });
    check('Edit with no fields → 400', r.status === 400, r);

    // --- Delete (manager)
    r = await call('DELETE', `/inventory/${okItemId}`, { token: employeeToken });
    check('Employee cannot delete → 403', r.status === 403, r);

    r = await call('DELETE', `/inventory/${okItemId}`, { token: managerToken });
    check('Manager deletes item → 200', r.status === 200, r);

    r = await call('GET', `/inventory/${okItemId}`, { token: managerToken });
    check('Deleted item is gone → 404', r.status === 404, r);

    console.log(`\n${failed === 0 ? '🎉' : '⚠️'}  ${passed} passed, ${failed} failed\n`);
  } catch (err) {
    console.error('\n❌ Test run error:', err.message);
    failed++;
  } finally {
    try { await cleanup(); } catch {}
    server.kill();
    await db.end();
    process.exit(failed ? 1 : 0);
  }
})();
