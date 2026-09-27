/**
 * DB audit script — runs within the server's already-started process via HTTP
 * Use the running server's admin API to get the data we need.
 */
import https from 'https';
import http from 'http';

const BASE = 'http://localhost:5050';

async function fetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request(url, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

// 1. Admin login
const loginRes = await fetch('/api/admin/auth/login', {
  method: 'POST',
  body: { email: 'admin@indulge.com', password: 'indulge123' }
});
if (!loginRes.body.token) {
  console.log('Admin login failed:', JSON.stringify(loginRes.body));
  process.exit(1);
}
const adminToken = loginRes.body.token;
console.log('Admin logged in ✓');

const authH = { Authorization: `Bearer ${adminToken}` };

// 2. Get all inspections
const insRes = await fetch('/api/admin/inspections', { headers: authH });
console.log(`\n=== ALL INSPECTIONS (${insRes.body.inspections?.length || 0}) ===`);
(insRes.body.inspections || []).forEach(i => {
  console.log(JSON.stringify({
    id: i.inspectionId,
    resource: i.resourceName,
    status: i.status,
    assignedTo: i.technician?.name || null,
    assignedId: i.technician?.id || null,
  }));
});

// 3. Get technicians
const techRes = await fetch('/api/admin/technicians', { headers: authH });
console.log(`\n=== TECHNICIANS (${techRes.body.technicians?.length || 0}) ===`);
(techRes.body.technicians || []).forEach(t => {
  console.log(JSON.stringify({ id: t._id, name: t.name, email: t.email, open: t.open, completed: t.completed }));
});

// 4. User login as inspector to see their queue
const techLogin = await fetch('/api/auth/login', {
  method: 'POST',
  body: { email: 'inspector@indulge.com', password: 'indulge123' }
});
if (!techLogin.body.token) {
  console.log('Technician login failed:', JSON.stringify(techLogin.body));
} else {
  const tToken = techLogin.body.token;
  console.log('\nTechnician logged in ✓');
  
  // Queue - open inspections
  const queueRes = await fetch('/api/verifications?scope=open', { headers: { Authorization: `Bearer ${tToken}` } });
  console.log(`\n=== TECHNICIAN QUEUE (open) (${queueRes.body.inspections?.length || 0}) ===`);
  console.log('Stats:', JSON.stringify(queueRes.body.stats));
  (queueRes.body.inspections || []).forEach(i => {
    console.log(JSON.stringify({ id: i.inspectionId, resource: i.resourceName, status: i.status }));
  });
  
  // All
  const allRes = await fetch('/api/verifications', { headers: { Authorization: `Bearer ${tToken}` } });
  console.log(`\n=== TECHNICIAN ALL (default scope) (${allRes.body.inspections?.length || 0}) ===`);
  (allRes.body.inspections || []).forEach(i => {
    console.log(JSON.stringify({ id: i.inspectionId, resource: i.resourceName, status: i.status }));
  });
}

process.exit(0);
