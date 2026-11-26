const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { db, DB_PATH, getFullState, carryOverEnrollmentsToGenap, buildDefaultPredikatConfig, parseAndValidatePredikatConfig, hashPassword, hashPasswordAsync, verifyPassword, verifyPasswordAsync, runInTransaction } = require('./db');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const HTML_PATH = path.join(__dirname, 'rdp_pesantren.html');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const DUMMY_PASSWORD_HASH = '0123456789abcdef0123456789abcdef:d3dc5eeb9e895ff7ca3282b2dc77eb56637757bf098ca429f2ef6f2e05d8247cfb3032628b557a0a39a692774c1ff83203a498ebdaa802ea33828ca43b58a4f7';

// Cache aset vendor statis di memori agar tidak membaca disk berulang kali
const vendorCache = new Map();
function getCachedVendorFile(key, filePath) {
  if (!vendorCache.has(key)) {
    if (!fs.existsSync(filePath)) return null;
    vendorCache.set(key, fs.readFileSync(filePath));
  }
  return vendorCache.get(key);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const WIB_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function formatWibTimestamp(date = new Date()) {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, '0');
  const mmm = WIB_MONTHS[wib.getUTCMonth()] || 'Jan';
  const yyyy = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mi = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${dd} ${mmm} ${yyyy}, ${hh}:${mi} WIB`;
}

function roleToActivityLevel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'siswa') return 'Siswa';
  return 'Guru';
}

function logActivity(userLike, activityText) {
  try {
    const actor = String((userLike && (userLike.displayName || userLike.username)) || 'Sistem').trim().slice(0, 120) || 'Sistem';
    const level = roleToActivityLevel(userLike && userLike.role);
    const cleanActivity = String(activityText || '').trim().slice(0, 500);
    if (!cleanActivity) return;
    db.prepare('INSERT INTO activities (user, level, activity, time) VALUES (?, ?, ?, ?)')
      .run(actor, level, cleanActivity, formatWibTimestamp());
  } catch (_) { /* fail-safe: jangan gagalkan request utama */ }
}

function purgeExpiredSessions() {
  try {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
    db.prepare('DELETE FROM sessions WHERE createdAt < ?').run(cutoff);
  } catch (_) {}
}
purgeExpiredSessions();
const sessionCleanupTimer = setInterval(purgeExpiredSessions, 6 * 60 * 60 * 1000);
if (typeof sessionCleanupTimer.unref === 'function') sessionCleanupTimer.unref();

// Rate limiting dual-bucket untuk POST /api/login & PUT /api/me/password
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_MAX_FAILS = 30;
const LOGIN_ACCT_MAX_FAILS = 10;
const PW_CHANGE_MAX_FAILS = 10;
const LOGIN_MAP_CAP = 4000;

function getClientIp(req) {
  const remote = req.socket?.remoteAddress || 'unknown';
  if (TRUST_PROXY) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return String(cfIp).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return remote;
}

function pruneLoginAttempts(now) {
  if (loginAttempts.size <= 500) return;
  for (const [k, rec] of loginAttempts.entries()) {
    if (now - rec.firstAt > LOGIN_WINDOW_MS) loginAttempts.delete(k);
  }
  while (loginAttempts.size >= LOGIN_MAP_CAP) {
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey === undefined) break;
    loginAttempts.delete(oldestKey);
  }
}

function isBucketLimited(key, maxFails) {
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec) return false;
  if (now - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return rec.count >= maxFails;
}

function bumpBucket(key) {
  const now = Date.now();
  pruneLoginAttempts(now);
  const rec = loginAttempts.get(key);
  if (!rec || now - rec.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
  } else {
    rec.count++;
  }
}

function checkLoginRateLimit(ip, uname = '') {
  if (isBucketLimited(`ip:${ip}`, LOGIN_IP_MAX_FAILS)) return true;
  const cleanUser = String(uname || '').trim().toLowerCase();
  if (cleanUser && isBucketLimited(`acct:${ip}:${cleanUser}`, LOGIN_ACCT_MAX_FAILS)) return true;
  return false;
}

function recordLoginFailure(ip, uname = '') {
  bumpBucket(`ip:${ip}`);
  const cleanUser = String(uname || '').trim().toLowerCase();
  if (cleanUser) bumpBucket(`acct:${ip}:${cleanUser}`);
}

function clearLoginFailures(ip, uname = '') {
  // Jangan pernah mereset bucket ip:${ip} saat akun lain (mis. siswa) berhasil login!
  const cleanUser = String(uname || '').trim().toLowerCase();
  if (cleanUser) loginAttempts.delete(`acct:${ip}:${cleanUser}`);
}

function checkPwChangeRateLimit(userId) {
  return isBucketLimited(`pw:${userId}`, PW_CHANGE_MAX_FAILS);
}

function recordPwChangeFailure(userId) {
  bumpBucket(`pw:${userId}`);
}

function clearPwChangeFailures(userId) {
  loginAttempts.delete(`pw:${userId}`);
}

function isHttpsRequest(req) {
  if (req.socket?.encrypted) return true;
  if (!TRUST_PROXY) return false;
  const xfp = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return xfp === 'https';
}

function buildSessionCookie(req, token, maxAgeSec) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `rdp_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

function isValidImageDataUrl(val) {
  return typeof val === 'string' && val.length <= 750 * 1024 &&
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+=*$/i.test(val);
}

function parseBoundedInt(raw, min, max) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < min || r > max) return null;
  return r;
}

function parseBoundedNumber(raw, min, max) {
  if (raw === null || raw === undefined || typeof raw === 'boolean' || typeof raw === 'object') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function isValidNuptk(val) {
  const s = String(val || '').trim();
  return /^\d{6,30}$/.test(s) && !/^0+$/.test(s);
}

function isValidNisn(val) {
  const s = String(val || '').trim();
  return s.length >= 4 && s.length <= 30 && s !== '-' && !/^0+$/.test(s) && /^[A-Za-z0-9._-]+$/.test(s);
}

function parseScoreValue(raw) {
  if (raw === null || raw === undefined || raw === '') return { empty: true };
  if (typeof raw === 'boolean' || typeof raw === 'object') return { invalid: true };
  if (typeof raw === 'string' && raw.trim() === '') return { empty: true };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { invalid: true };
  return { value: Math.min(100, Math.max(0, Math.round(n))) };
}

function parseAttendanceCount(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function normalizeHostHeader(hostStr, isHttps) {
  let h = String(hostStr || '').split(',')[0].trim().toLowerCase();
  if (isHttps && h.endsWith(':443')) h = h.slice(0, -4);
  if (!isHttps && h.endsWith(':80')) h = h.slice(0, -3);
  return h;
}

function validateOrigin(req) {
  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (secFetchSite === 'cross-site') return false;
  const rawHost = (TRUST_PROXY && req.headers['x-forwarded-host']) ? req.headers['x-forwarded-host'] : req.headers.host;
  const expectedHttps = isHttpsRequest(req);
  const expectedProto = expectedHttps ? 'https:' : 'http:';
  const expectedHost = rawHost ? normalizeHostHeader(rawHost, expectedHttps) : '';
  const origin = req.headers.origin;
  if (origin) {
    if (!expectedHost) return false;
    try {
      const originUrl = new URL(origin);
      const originHost = normalizeHostHeader(originUrl.host, originUrl.protocol === 'https:');
      if (originUrl.protocol !== expectedProto || originHost !== expectedHost) return false;
      return true;
    } catch (_) {
      return false;
    }
  }
  const referer = req.headers.referer;
  if (referer && expectedHost) {
    try {
      const refUrl = new URL(referer);
      const refHost = normalizeHostHeader(refUrl.host, refUrl.protocol === 'https:');
      if (refUrl.protocol !== expectedProto || refHost !== expectedHost) return false;
      return true;
    } catch (_) {
      return false;
    }
  }
  if (secFetchSite === 'same-site') return false;
  return true;
}

function getActivePeriod() {
  const row = db.prepare('SELECT tahun, semester FROM pesantren_profile WHERE id = 1').get();
  return {
    tahun: (row && row.tahun) || '2026/2027',
    semester: (row && row.semester) || 'Ganjil'
  };
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      try {
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
      } catch (_) {
        out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      }
    }
  }
  return out;
}

function getSessionUser(req) {
  const token = parseCookies(req).rdp_session;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, u.role, u.displayName, u.teacherId, u.studentId,
           s.createdAt AS sessionCreatedAt, t.active AS teacherActive
    FROM sessions s
    JOIN users u ON u.id = s.userId
    LEFT JOIN teachers t ON t.id = u.teacherId
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  const createdMs = Date.parse(row.sessionCreatedAt || '');
  if (!createdMs || Date.now() - createdMs > SESSION_TTL_MS) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  if (row.role === 'guru' && row.teacherId && (row.teacherActive === null || Number(row.teacherActive) === 0)) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.displayName,
    teacherId: row.teacherId,
    studentId: row.studentId
  };
}

function requireRole(req, res, allowedRoles) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Silahkan login terlebih dahulu' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    sendJson(res, 403, { error: 'Akses ditolak untuk peran ini' });
    return null;
  }
  return user;
}

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      req.pause();
      return reject(new Error('Payload too large'));
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const onData = chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        chunks.length = 0;
        req.off('data', onData);
        req.off('end', onEnd);
        req.off('error', onError);
        req.pause();
        return reject(new Error('Payload too large'));
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new SyntaxError('JSON body must be an object'));
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    const onError = err => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  let pathname = req.url || '/';

  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;

    // Basic CSRF origin guard for mutating API endpoints
    if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!validateOrigin(req)) {
        return sendJson(res, 403, { error: 'Permintaan lintas origin tidak diizinkan' });
      }
    }

    // Serve frontend
    if (method === 'GET' && (pathname === '/' || pathname === '/rdp_pesantren.html')) {
      const html = await fs.promises.readFile(HTML_PATH, 'utf8');
      res.writeHead(200, { ...SECURITY_HEADERS, 'Cache-Control': 'no-cache', 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Serve SheetJS (xlsx), Tailwind & local icons (cached in memory)
    if (method === 'GET' && pathname === '/vendor/xlsx.full.min.js') {
      const js = getCachedVendorFile('xlsx', path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'));
      if (!js) return sendJson(res, 404, { error: 'Asset not found' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': js.length, 'Cache-Control': 'public, max-age=86400' });
      res.end(js);
      return;
    }

    if (method === 'GET' && pathname === '/vendor/tailwindcss.min.js') {
      const js = getCachedVendorFile('tailwind', path.join(__dirname, 'vendor', 'tailwindcss.min.js'));
      if (!js) return sendJson(res, 404, { error: 'Asset not found' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': js.length, 'Cache-Control': 'public, max-age=86400' });
      res.end(js);
      return;
    }

    if (method === 'GET' && pathname === '/assets/rdp-sidebar-logo.jpg') {
      const img = getCachedVendorFile('sidebarLogo', path.join(__dirname, 'public', 'assets', 'rdp-sidebar-logo.jpg'));
      if (!img) return sendJson(res, 404, { error: 'Asset not found' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'image/jpeg', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=86400' });
      res.end(img);
      return;
    }

    if (method === 'GET' && pathname === '/assets/rdp-icon.png') {
      const img = getCachedVendorFile('rdpIcon', path.join(__dirname, 'public', 'assets', 'rdp-icon.png'));
      if (!img) return sendJson(res, 404, { error: 'Asset not found' });
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'image/png', 'Content-Length': img.length, 'Cache-Control': 'public, max-age=86400' });
      res.end(img);
      return;
    }

    // Health check (checks SQLite connectivity)
    if (method === 'GET' && pathname === '/api/health') {
      try {
        db.prepare('SELECT 1 AS ok').get();
        return sendJson(res, 200, { ok: true, db: 'ok', timestamp: new Date().toISOString() });
      } catch (e) {
        console.error('[HEALTH CHECK ERROR]', e);
        return sendJson(res, 503, { ok: false, db: 'error' });
      }
    }

    // Public branding (for login screen, no auth required)
    if (method === 'GET' && pathname === '/api/public/branding') {
      const p = db.prepare('SELECT nama, namaArab, logoDataUrl, tahun, semester FROM pesantren_profile WHERE id = 1').get() || {};
      return sendJson(res, 200, p);
    }

    // Auth: Login (with dual-bucket rate limiting, async scrypt & active teacher check)
    if (method === 'POST' && pathname === '/api/login') {
      const ip = getClientIp(req);
      const { username, password } = await readJsonBody(req, 64 * 1024);
      const uname = String(username || '').trim();
      const pw = String(password || '');
      if (checkLoginRateLimit(ip, uname)) {
        return sendJson(res, 429, { error: 'Terlalu banyak percobaan login gagal. Silakan coba lagi dalam 15 menit.' });
      }
      if (!uname || !pw || pw.length > 256) {
        recordLoginFailure(ip, uname);
        return sendJson(res, 401, { error: 'Username atau password salah' });
      }
      let userRow = db.prepare('SELECT * FROM users WHERE username = ?').get(uname);
      if (!userRow && isValidNuptk(uname)) {
        const teacherByNuptk = db.prepare('SELECT id FROM teachers WHERE nuptk = ?').get(uname);
        if (teacherByNuptk) {
          userRow = db.prepare("SELECT * FROM users WHERE role = 'guru' AND teacherId = ? ORDER BY id ASC LIMIT 1").get(teacherByNuptk.id);
        }
      }
      const pwOk = userRow
        ? await verifyPasswordAsync(pw, userRow.passwordHash)
        : (await verifyPasswordAsync(pw, DUMMY_PASSWORD_HASH), false);
      if (!userRow || !pwOk) {
        recordLoginFailure(ip, uname);
        return sendJson(res, 401, { error: 'Username atau password salah' });
      }
      if (userRow.role === 'guru' && userRow.teacherId) {
        const tRow = db.prepare('SELECT active FROM teachers WHERE id = ?').get(userRow.teacherId);
        if (!tRow || Number(tRow.active ?? 1) === 0) {
          return sendJson(res, 403, { error: 'Akun guru ini sedang dinonaktifkan oleh Proktor/Admin' });
        }
      }
      clearLoginFailures(ip, uname);
      const oldToken = parseCookies(req).rdp_session;
      const token = crypto.randomBytes(32).toString('hex');
      runInTransaction(() => {
        if (oldToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(oldToken);
        db.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)').run(token, userRow.id, new Date().toISOString());
      });
      const user = {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        displayName: userRow.displayName,
        teacherId: userRow.teacherId,
        studentId: userRow.studentId
      };
      logActivity(user, 'Login ke aplikasi RDP');
      return sendJson(res, 200, { ok: true, user }, {
        'Set-Cookie': buildSessionCookie(req, token, SESSION_TTL_SEC)
      });
    }

    // Auth: Logout
    if (method === 'POST' && pathname === '/api/logout') {
      const token = parseCookies(req).rdp_session;
      if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': buildSessionCookie(req, '', 0)
      });
    }

    // Auth: Current session
    if (method === 'GET' && pathname === '/api/me') {
      const user = getSessionUser(req);
      return sendJson(res, 200, user ? { authenticated: true, user } : { authenticated: false });
    }

    // Auth: Change own password (for any logged-in user, including siswa, with throttling)
    if (method === 'PUT' && pathname === '/api/me/password') {
      const user = requireRole(req, res, ['admin', 'guru', 'siswa']);
      if (!user) return;
      if (checkPwChangeRateLimit(user.id)) {
        return sendJson(res, 429, { error: 'Terlalu banyak percobaan ubah password gagal. Coba lagi dalam 15 menit.' });
      }
      const { oldPassword, newPassword } = await readJsonBody(req, 64 * 1024);
      const oldPw = String(oldPassword ?? '');
      const newPw = String(newPassword ?? '');
      if (!oldPw || !newPw.trim()) {
        return sendJson(res, 400, { error: 'Password lama dan password baru wajib diisi' });
      }
      if (newPw.trim().length < 6 || newPw.length > 256) {
        return sendJson(res, 400, { error: 'Password baru minimal 6 karakter (tanpa spasi saja)' });
      }
      const row = db.prepare('SELECT id, passwordHash FROM users WHERE id = ?').get(user.id);
      if (!row || !(await verifyPasswordAsync(oldPw, row.passwordHash))) {
        recordPwChangeFailure(user.id);
        return sendJson(res, 400, { error: 'Password lama tidak sesuai' });
      }
      clearPwChangeFailures(user.id);
      const newHash = await hashPasswordAsync(newPw);
      const newToken = crypto.randomBytes(32).toString('hex');
      runInTransaction(() => {
        db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(newHash, user.id);
        db.prepare('DELETE FROM sessions WHERE userId = ?').run(user.id);
        db.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)').run(newToken, user.id, new Date().toISOString());
      });
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': buildSessionCookie(req, newToken, SESSION_TTL_SEC)
      });
    }

    // Users management (Admin only)
    if (method === 'GET' && pathname === '/api/users') {
      if (!requireRole(req, res, ['admin'])) return;
      const users = db.prepare('SELECT id, username, role, displayName, teacherId, studentId FROM users ORDER BY id ASC').all();
      return sendJson(res, 200, { users });
    }

    if (method === 'POST' && pathname === '/api/users') {
      if (!requireRole(req, res, ['admin'])) return;
      const { username, password, role, displayName, teacherId, studentId } = await readJsonBody(req);
      const cleanUsername = String(username ?? '').trim();
      const cleanPassword = String(password ?? '');
      const cleanDisplay = String(displayName ?? '').trim();
      if (!cleanUsername || !cleanPassword.trim() || !role || !cleanDisplay) {
        return sendJson(res, 400, { error: 'Data akun belum lengkap' });
      }
      if (cleanPassword.trim().length < 6 || cleanPassword.length > 256) {
        return sendJson(res, 400, { error: 'Password minimal 6 karakter' });
      }
      if (!['admin', 'guru', 'siswa'].includes(role)) {
        return sendJson(res, 400, { error: 'Role tidak valid' });
      }
      let linkedTeacherId = null;
      let linkedStudentId = null;
      if (role === 'guru') {
        const cleanTid = String(teacherId ?? '').trim();
        const tRow = cleanTid ? db.prepare('SELECT id, active FROM teachers WHERE id = ?').get(cleanTid) : null;
        if (!tRow || Number(tRow.active ?? 1) === 0) {
          return sendJson(res, 400, { error: 'Guru tidak ditemukan atau sedang nonaktif' });
        }
        linkedTeacherId = cleanTid;
      } else if (role === 'siswa') {
        const isPosInt = studentId !== null && studentId !== undefined && typeof studentId !== 'boolean' &&
          String(studentId).trim() !== '' && Number.isInteger(Number(studentId)) && Number(studentId) > 0;
        const numSid = Number(studentId);
        if (!isPosInt || !db.prepare('SELECT id FROM students WHERE id = ?').get(numSid)) {
          return sendJson(res, 400, { error: 'Pilih santri yang valid untuk akun Siswa' });
        }
        linkedStudentId = numSid;
      }
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
      if (existing) return sendJson(res, 409, { error: 'Username sudah digunakan' });
      const pwHash = await hashPasswordAsync(cleanPassword);
      const info = db.prepare(`
        INSERT INTO users (username, passwordHash, role, displayName, teacherId, studentId)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        cleanUsername,
        pwHash,
        role,
        cleanDisplay,
        linkedTeacherId,
        linkedStudentId
      );
      return sendJson(res, 201, { ok: true, id: Number(info.lastInsertRowid) });
    }

    const userPassMatch = pathname.match(/^\/api\/users\/(\d+)\/password$/);
    if (method === 'PUT' && userPassMatch) {
      const current = requireRole(req, res, ['admin']);
      if (!current) return;
      const uid = Number(userPassMatch[1]);
      const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
      if (!targetUser) return sendJson(res, 404, { error: 'Akun pengguna tidak ditemukan' });
      const { password } = await readJsonBody(req, 64 * 1024);
      const cleanPw = String(password ?? '');
      if (!cleanPw.trim() || cleanPw.trim().length < 6 || cleanPw.length > 256) {
        return sendJson(res, 400, { error: 'Password baru minimal 6 karakter' });
      }
      const pwHash = await hashPasswordAsync(cleanPw);
      const isSelfReset = uid === current.id;
      const newToken = isSelfReset ? crypto.randomBytes(32).toString('hex') : null;
      runInTransaction(() => {
        db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(pwHash, uid);
        db.prepare('DELETE FROM sessions WHERE userId = ?').run(uid);
        if (isSelfReset && newToken) {
          db.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)').run(newToken, uid, new Date().toISOString());
        }
      });
      if (isSelfReset && newToken) {
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': buildSessionCookie(req, newToken, SESSION_TTL_SEC) });
      }
      return sendJson(res, 200, { ok: true });
    }

    const userDelMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (method === 'DELETE' && userDelMatch) {
      const current = requireRole(req, res, ['admin']);
      if (!current) return;
      const uid = Number(userDelMatch[1]);
      if (uid === current.id) return sendJson(res, 400, { error: 'Tidak dapat menghapus akun yang sedang aktif' });
      runInTransaction(() => {
        db.prepare('DELETE FROM sessions WHERE userId = ?').run(uid);
        db.prepare('DELETE FROM users WHERE id = ?').run(uid);
      });
      return sendJson(res, 200, { ok: true });
    }

    // Full state hydration (scoped by role)
    if (method === 'GET' && pathname === '/api/state') {
      const user = requireRole(req, res, ['admin', 'guru', 'siswa']);
      if (!user) return;
      const omitMedia = url.searchParams.get('omitMedia') === '1';
      const full = getFullState({ omitMedia });
      if (user.role === 'siswa') {
        const hasStudentId = user.studentId !== null && user.studentId !== undefined && user.studentId !== '' && Number.isFinite(Number(user.studentId));
        const sidNum = hasStudentId ? Number(user.studentId) : null;
        let myStudent = sidNum ? full.students.find(s => s.id === sidNum) : null;
        let targetTahun = full.pesantren.tahun;
        let targetSemester = full.pesantren.semester;
        let classPool = [];
        let targetSubjects = full.subjects;
        let targetAssignments = full.assignments;
        let myClass = null;
        let archiveNotice = null;

        if (myStudent) {
          classPool = full.students.filter(s => s.kelas === myStudent.kelas);
          myClass = full.classes.find(c => c.kode === myStudent.kelas) || null;
        } else if (sidNum) {
          const curEnr = db.prepare(`
            SELECT kelas, COALESCE(status, 'aktif') AS status, COALESCE(mutasiCatatan, '') AS mutasiCatatan, COALESCE(mutasiTanggal, '') AS mutasiTanggal
            FROM student_enrollments WHERE studentId = ? AND tahun = ? AND semester = ?
          `).get(sidNum, full.pesantren.tahun, full.pesantren.semester);
          const archEnr = db.prepare(`
            SELECT tahun, semester, kelas
            FROM student_enrollments
            WHERE studentId = ? AND COALESCE(status, 'aktif') = 'aktif'
            ORDER BY tahun DESC, CASE WHEN semester = 'Genap' THEN 2 ELSE 1 END DESC
            LIMIT 1
          `).get(sidNum);
          if (archEnr) {
            targetTahun = archEnr.tahun;
            targetSemester = archEnr.semester;
            const archRawStudents = db.prepare(`
              SELECT s.*, e.kelas AS enrKelas
              FROM student_enrollments e
              JOIN students s ON s.id = e.studentId
              WHERE e.tahun = ? AND e.semester = ? AND e.kelas = ? AND COALESCE(e.status, 'aktif') = 'aktif'
              ORDER BY s.id ASC
            `).all(targetTahun, targetSemester, archEnr.kelas);
            const archScores = db.prepare(`
              SELECT sc.studentId, sc.subjectId, sc.score
              FROM scores sc
              JOIN student_enrollments e ON e.studentId = sc.studentId AND e.tahun = sc.tahun AND e.semester = sc.semester
              WHERE sc.tahun = ? AND sc.semester = ? AND e.kelas = ? AND COALESCE(e.status, 'aktif') = 'aktif'
            `).all(targetTahun, targetSemester, archEnr.kelas);
            const archAtt = db.prepare('SELECT sakit, izin, alpa FROM student_attendance WHERE studentId = ? AND tahun = ? AND semester = ?')
              .get(sidNum, targetTahun, targetSemester);
            const archScoreMap = new Map();
            for (const row of archScores) {
              if (!archScoreMap.has(row.studentId)) archScoreMap.set(row.studentId, {});
              archScoreMap.get(row.studentId)[row.subjectId] = row.score;
            }
            classPool = archRawStudents.map(st => {
              const { enrKelas, ...rest } = st;
              return {
                ...rest,
                kelas: enrKelas,
                sakit: st.id === sidNum && archAtt ? (archAtt.sakit ?? 0) : 0,
                izin: st.id === sidNum && archAtt ? (archAtt.izin ?? 0) : 0,
                alpa: st.id === sidNum && archAtt ? (archAtt.alpa ?? 0) : 0,
                scores: archScoreMap.get(st.id) || {}
              };
            });
            myStudent = classPool.find(s => s.id === sidNum) || null;
            myClass = db.prepare('SELECT * FROM classes WHERE tahun = ? AND kode = ? LIMIT 1').get(targetTahun, archEnr.kelas) || null;
            targetAssignments = db.prepare('SELECT * FROM assignments WHERE tahun = ? AND kode = ?').all(targetTahun, archEnr.kelas);
            archiveNotice = {
              status: (curEnr && curEnr.status) || 'mutasi_keluar',
              tahun: full.pesantren.tahun,
              semester: full.pesantren.semester,
              archivedTahun: targetTahun,
              archivedSemester: targetSemester,
              archivedKelas: archEnr.kelas,
              mutasiTanggal: (curEnr && curEnr.mutasiTanggal) || '',
              mutasiCatatan: (curEnr && curEnr.mutasiCatatan) || ''
            };
          }
        }

        const usedSubIds = new Set();
        for (const st of classPool) {
          for (const [k, v] of Object.entries(st.scores || {})) {
            if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) usedSubIds.add(Number(k));
          }
        }
        const usedMapelNames = new Set(
          myStudent ? targetAssignments.filter(a => a.kode === myStudent.kelas).map(a => a.mapel) : []
        );
        const effectiveSubjects = targetSubjects.filter(sub => sub.active !== false || usedSubIds.has(sub.id) || usedMapelNames.has(sub.namaArab));
        const classScoredSubs = effectiveSubjects.filter(sub => usedSubIds.has(sub.id));
        const classScoredSubjectIds = classScoredSubs.map(sub => sub.id);
        const classScoredCount = classScoredSubs.length;
        const classScoredJam = classScoredSubs.reduce((acc, sub) => acc + (Number(sub.jam) || 0), 0);
        const classUmumSubs = classScoredSubs.filter(sub => sub.kelompok !== 'syari');
        const classSyariSubs = classScoredSubs.filter(sub => sub.kelompok === 'syari');
        const classScoredOverride = {
          classScoredSubjectIds,
          classScoredCount,
          classScoredJam,
          classUmumScoredCount: classUmumSubs.length,
          classUmumScoredJam: classUmumSubs.reduce((acc, sub) => acc + (Number(sub.jam) || 0), 0),
          classSyariScoredCount: classSyariSubs.length,
          classSyariScoredJam: classSyariSubs.reduce((acc, sub) => acc + (Number(sub.jam) || 0), 0)
        };
        let scopedStudents = [];
        if (myStudent) {
          const totals = classPool.map(s => {
            let sum = 0;
            let syariSum = 0;
            let scoredJam = 0;
            let scoredCount = 0;
            let rawSum = 0;
            for (const sub of effectiveSubjects) {
              const sc = s.scores[sub.id];
              const scNum = Number(sc);
              const jam = Number(sub.jam) || 0;
              if (sc !== undefined && sc !== null && sc !== '' && Number.isFinite(scNum)) {
                const weighted = scNum * jam;
                sum += weighted;
                scoredJam += jam;
                scoredCount++;
                rawSum += scNum;
                if (sub.kelompok === 'syari') syariSum += weighted;
              }
            }
            const denomJam = classScoredJam > 0 ? classScoredJam : scoredJam;
            const denomCount = classScoredCount > 0 ? classScoredCount : scoredCount;
            const avg = scoredCount > 0 ? (denomJam > 0 ? sum / denomJam : (denomCount > 0 ? rawSum / denomCount : 0)) : 0;
            return { id: s.id, total: sum, syari: syariSum, avg };
          }).sort((a, b) => (b.total - a.total) || (b.syari - a.syari) || (b.avg - a.avg));
          const meEntry = totals.find(x => x.id === myStudent.id);
          const rank = meEntry
            ? totals.findIndex(x => x.total === meEntry.total && x.syari === meEntry.syari && Math.abs(x.avg - meEntry.avg) < 1e-9) + 1
            : 1;
          scopedStudents = [{
            ...myStudent,
            classScoredOverride,
            rankOverride: { rank: rank || 1, totalStudents: classPool.length },
            ...(archiveNotice ? { archiveNotice } : {})
          }];
        }
        const myWali = (myClass && myClass.waliId) ? full.teachers.find(t => t.id === myClass.waliId) : null;
        return sendJson(res, 200, {
          pesantren: full.pesantren,
          bobot: full.bobot,
          classes: myClass ? [myClass] : [],
          subjects: effectiveSubjects,
          teachers: myWali ? [{ id: myWali.id, nama: myWali.nama, namaArab: myWali.namaArab, waliKelas: myWali.waliKelas, active: myWali.active }] : [],
          assignments: [],
          students: scopedStudents,
          mutatedStudents: [],
          activities: []
        });
      }
      if (user.role === 'guru') {
        const hasTid = Boolean(user.teacherId);
        const myTeacher = hasTid ? full.teachers.find(t => t.id === user.teacherId) : null;
        const waliClassObj = hasTid ? full.classes.find(c => c.waliId && c.waliId === user.teacherId) : null;
        const waliKelas = (waliClassObj && waliClassObj.kode) || (myTeacher && myTeacher.waliKelas) || null;
        const myAssignments = hasTid
          ? full.assignments.filter(a => a.teacherId === user.teacherId || (waliKelas && a.kode === waliKelas))
          : [];
        const allowedClasses = new Set(myAssignments.map(a => a.kode));
        if (waliKelas) allowedClasses.add(waliKelas);

        // Map kelas -> Set(subjectId) yang benar-benar diampu guru ini (bukan wali)
        const subjectIdByMapel = new Map(full.subjects.map(s => [s.namaArab, s.id]));
        const taughtSubjectsByClass = new Map();
        for (const a of myAssignments) {
          if (hasTid && a.teacherId === user.teacherId) {
            const sid = subjectIdByMapel.get(a.mapel);
            if (sid !== undefined) {
              if (!taughtSubjectsByClass.has(a.kode)) taughtSubjectsByClass.set(a.kode, new Set());
              taughtSubjectsByClass.get(a.kode).add(sid);
            }
          }
        }

        const scopedStudents = full.students
          .filter(st => allowedClasses.has(st.kelas))
          .map(st => {
            if (waliKelas && st.kelas === waliKelas) return st;
            // Untuk kelas yang hanya diajar (bukan wali kelas), sembunyikan biodata sensitif & nilai mapel guru lain
            const allowedSubs = taughtSubjectsByClass.get(st.kelas) || new Set();
            const filteredScores = {};
            for (const [k, v] of Object.entries(st.scores || {})) {
              if (allowedSubs.has(Number(k))) filteredScores[k] = v;
            }
            return {
              id: st.id,
              nama: st.nama,
              nis: st.nis,
              nisn: st.nisn,
              kelas: st.kelas,
              jk: st.jk,
              scores: filteredScores
            };
          });

        const scopedTeachers = full.teachers.map(t => ({
          id: t.id,
          nama: t.nama,
          namaArab: t.namaArab,
          initials: t.initials,
          role: t.role,
          nuptk: (hasTid && t.id === user.teacherId) ? t.nuptk : '',
          waliKelas: t.waliKelas,
          active: t.active
        }));

        return sendJson(res, 200, {
          pesantren: full.pesantren,
          bobot: full.bobot,
          classes: full.classes.filter(c => allowedClasses.has(c.kode)),
          subjects: full.subjects,
          teachers: scopedTeachers,
          assignments: myAssignments,
          students: scopedStudents,
          mutatedStudents: waliKelas ? (full.mutatedStudents || []).filter(s => s.kelas === waliKelas) : [],
          activities: []
        });
      }
      sendJson(res, 200, full);
      return;
    }

    // Download SQLite database backup (consistent standalone snapshot via VACUUM INTO, stripped of live sessions)
    if (method === 'GET' && pathname === '/api/backup/db') {
      if (!requireRole(req, res, ['admin'])) return;
      const tmpPath = path.join(os.tmpdir(), `rdp_backup_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.db`);
      let data;
      try {
        const escapedTmp = tmpPath.replace(/'/g, "''");
        db.exec(`VACUUM INTO '${escapedTmp}'`);
        // Hapus seluruh token sesi aktif & bersihkan byte bekas halaman SQLite
        const snap = new DatabaseSync(tmpPath);
        try {
          snap.exec('PRAGMA secure_delete = ON; DELETE FROM sessions; VACUUM;');
        } finally {
          snap.close();
        }
        data = fs.readFileSync(tmpPath);
      } finally {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Cache-Control': 'no-store',
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="rdp_backup.db"',
        'Content-Length': data.length
      });
      res.end(data);
      return;
    }

    // Update Pesantren profile / settings
    if (method === 'PUT' && pathname === '/api/pesantren') {
      if (!requireRole(req, res, ['admin'])) return;
      const body = await readJsonBody(req);
      const allowed = [
        'nama', 'namaArab', 'nspp', 'npsn', 'alamat', 'kotaArab', 'tanggalArab',
        'kepala', 'kepalaArab', 'tahun', 'semester', 'semesterArab', 'kurikulum',
        'kkmDefault', 'logoDataUrl', 'tanggalIso', 'watermarkType', 'watermarkText',
        'watermarkDataUrl', 'watermarkOpacity', 'watermarkColor', 'watermarkSize',
        'watermarkFontSize', 'nomorSkKejuaraan', 'predikatConfig'
      ];
      for (const imgField of ['logoDataUrl', 'watermarkDataUrl']) {
        if (Object.prototype.hasOwnProperty.call(body, imgField) && body[imgField] !== null && body[imgField] !== '') {
          if (!isValidImageDataUrl(body[imgField])) {
            return sendJson(res, 400, { error: `Format gambar ${imgField} tidak valid atau terlalu besar (maks 750 KB, PNG/JPG/WebP/GIF)` });
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'logoDataUrl') || Object.prototype.hasOwnProperty.call(body, 'watermarkDataUrl')) {
        const curImgs = db.prepare('SELECT logoDataUrl, watermarkDataUrl FROM pesantren_profile WHERE id = 1').get() || {};
        const nextLogo = Object.prototype.hasOwnProperty.call(body, 'logoDataUrl') ? (body.logoDataUrl || '') : (curImgs.logoDataUrl || '');
        const nextWm = Object.prototype.hasOwnProperty.call(body, 'watermarkDataUrl') ? (body.watermarkDataUrl || '') : (curImgs.watermarkDataUrl || '');
        if (String(nextLogo).length + String(nextWm).length > 1500000) {
          return sendJson(res, 400, { error: 'Total ukuran gabungan Logo + Watermark melebihi batas aman (maks 1.5 MB)' });
        }
      }
      const sets = [];
      const vals = [];
      const hasKkm = Object.prototype.hasOwnProperty.call(body, 'kkmDefault');
      const hasPred = Object.prototype.hasOwnProperty.call(body, 'predikatConfig');
      let curProf = null;
      if (hasKkm || hasPred) {
        curProf = db.prepare('SELECT kkmDefault, predikatConfig FROM pesantren_profile WHERE id = 1').get() || {};
      }
      let effectiveKkm = (curProf && curProf.kkmDefault !== undefined && curProf.kkmDefault !== null) ? Number(curProf.kkmDefault) : 75;
      if (hasKkm) {
        const parsedKkm = parseBoundedInt(body.kkmDefault, 0, 100);
        if (parsedKkm === null) {
          return sendJson(res, 400, { error: 'Kolom kkmDefault harus berupa angka bulat 0–100' });
        }
        effectiveKkm = parsedKkm;
      }
      if (hasPred) {
        const parsedPred = parseAndValidatePredikatConfig(body.predikatConfig, effectiveKkm);
        if (!parsedPred.ok) {
          return sendJson(res, 400, { error: parsedPred.error });
        }
        sets.push('predikatConfig = ?');
        vals.push(parsedPred.value ? JSON.stringify(parsedPred.value) : null);
      } else if (hasKkm && curProf && curProf.predikatConfig) {
        let existingLabels = null;
        try {
          const oldArr = JSON.parse(curProf.predikatConfig);
          if (Array.isArray(oldArr) && oldArr.length === 5) {
            existingLabels = oldArr.map(x => String(x?.label || '').trim());
          }
        } catch (_) {}
        sets.push('predikatConfig = ?');
        vals.push(JSON.stringify(buildDefaultPredikatConfig(effectiveKkm, existingLabels)));
      }
      const intBounds = {
        kkmDefault: [0, 100],
        watermarkSize: [50, 1000],
        watermarkFontSize: [8, 120]
      };
      const requiredNonEmpty = new Set(['nama', 'namaArab']);
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          if (key === 'predikatConfig') continue;
          const rawVal = body[key];
          if (rawVal !== null && typeof rawVal === 'object') {
            return sendJson(res, 400, { error: `Format kolom ${key} tidak valid` });
          }
          if (requiredNonEmpty.has(key)) {
            const cleanStr = String(rawVal ?? '').trim();
            if (!cleanStr) return sendJson(res, 400, { error: `Kolom ${key} tidak boleh kosong` });
            sets.push(`${key} = ?`);
            vals.push(cleanStr);
            continue;
          }
          if (key === 'tahun') {
            const cleanTahun = String(rawVal ?? '').trim();
            if (!cleanTahun || cleanTahun.length < 4 || cleanTahun.length > 32) {
              return sendJson(res, 400, { error: 'Tahun pelajaran tidak valid (4–32 karakter)' });
            }
            sets.push('tahun = ?');
            vals.push(cleanTahun);
            continue;
          }
          if (key === 'semester') {
            const semStr = String(rawVal ?? '').trim();
            if (!['Ganjil', 'Genap'].includes(semStr)) {
              return sendJson(res, 400, { error: 'Semester harus Ganjil atau Genap' });
            }
            sets.push('semester = ?');
            vals.push(semStr);
            if (!Object.prototype.hasOwnProperty.call(body, 'semesterArab')) {
              sets.push('semesterArab = ?');
              vals.push(semStr === 'Genap' ? 'الثاني' : 'الأول');
            }
            continue;
          }
          if (intBounds[key]) {
            const [minV, maxV] = intBounds[key];
            const parsed = parseBoundedInt(rawVal, minV, maxV);
            if (parsed === null) {
              return sendJson(res, 400, { error: `Kolom ${key} harus berupa angka bulat ${minV}–${maxV}` });
            }
            sets.push(`${key} = ?`);
            vals.push(parsed);
            continue;
          }
          if (key === 'watermarkOpacity') {
            const op = parseBoundedNumber(rawVal, 0, 1);
            if (op === null) {
              return sendJson(res, 400, { error: 'Kolom watermarkOpacity harus berupa angka 0–1' });
            }
            sets.push('watermarkOpacity = ?');
            vals.push(op);
            continue;
          }
          sets.push(`${key} = ?`);
          vals.push(rawVal === null ? null : String(rawVal));
        }
      }
      let carriedOver = 0;
      if (sets.length > 0) {
        db.prepare(`UPDATE pesantren_profile SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
      }
      const effectivePeriod = getActivePeriod();
      if (effectivePeriod.semester === 'Genap') {
        carriedOver = carryOverEnrollmentsToGenap(effectivePeriod.tahun);
      }
      sendJson(res, 200, { ok: true, carriedOver });
      return;
    }

    // Classes: Copy from another academic year into active year
    if (method === 'POST' && pathname === '/api/classes/copy') {
      if (!requireRole(req, res, ['admin'])) return;
      const { fromTahun } = await readJsonBody(req);
      const srcTahun = String(fromTahun || '').trim();
      const { tahun: activeTahun } = getActivePeriod();
      if (!srcTahun) return sendJson(res, 400, { error: 'Tahun sumber wajib dipilih' });
      if (srcTahun === activeTahun) return sendJson(res, 400, { error: 'Tahun sumber tidak boleh sama dengan tahun aktif' });
      const srcClasses = db.prepare('SELECT kode, tingkat, kurikulum FROM classes WHERE tahun = ? ORDER BY id ASC').all(srcTahun);
      const existingKodes = new Set(db.prepare('SELECT kode FROM classes WHERE tahun = ?').all(activeTahun).map(r => r.kode));
      const ins = db.prepare('INSERT INTO classes (tahun, kode, tingkat, waliId, kurikulum) VALUES (?, ?, ?, NULL, ?)');
      let copied = 0;
      runInTransaction(() => {
        for (const c of srcClasses) {
          if (existingKodes.has(c.kode)) continue;
          existingKodes.add(c.kode);
          ins.run(activeTahun, c.kode, c.tingkat, c.kurikulum || 'Kurikulum Pesantren');
          copied++;
        }
      });
      sendJson(res, 201, { ok: true, copied, fromTahun: srcTahun, toTahun: activeTahun });
      return;
    }

    // Classes: Add
    if (method === 'POST' && pathname === '/api/classes') {
      if (!requireRole(req, res, ['admin'])) return;
      const { kode, tingkat, waliId, kurikulum } = await readJsonBody(req);
      const cleanKode = String(kode || '').trim();
      const cleanTingkat = String(tingkat || '').trim();
      if (!cleanKode || !cleanTingkat) {
        return sendJson(res, 400, { error: 'Kode kelas dan tingkat wajib diisi' });
      }
      const cleanWali = waliId ? String(waliId).trim() : null;
      if (cleanWali) {
        const tWali = db.prepare('SELECT id, active FROM teachers WHERE id = ?').get(cleanWali);
        if (!tWali || Number(tWali.active ?? 1) === 0) {
          return sendJson(res, 400, { error: 'Wali kelas tidak ditemukan atau sedang nonaktif' });
        }
      }
      const { tahun: activeTahun } = getActivePeriod();
      const dup = db.prepare('SELECT id FROM classes WHERE tahun = ? AND kode = ?').get(activeTahun, cleanKode);
      if (dup) {
        return sendJson(res, 409, { error: `Kode kelas "${cleanKode}" sudah terdaftar di tahun ${activeTahun}` });
      }
      let classId;
      runInTransaction(() => {
        const info = db.prepare('INSERT INTO classes (tahun, kode, tingkat, waliId, kurikulum) VALUES (?, ?, ?, ?, ?)')
          .run(activeTahun, cleanKode, cleanTingkat, cleanWali, kurikulum || 'Kurikulum Pesantren');
        classId = Number(info.lastInsertRowid);
        if (cleanWali) {
          db.prepare('UPDATE classes SET waliId = NULL WHERE tahun = ? AND id != ? AND waliId = ?').run(activeTahun, classId, cleanWali);
        }
      });
      sendJson(res, 201, { ok: true, id: classId });
      return;
    }

    // Classes: Assign Wali Kelas
    const waliMatch = pathname.match(/^\/api\/classes\/(\d+)\/wali$/);
    if (method === 'PUT' && waliMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const classId = Number(waliMatch[1]);
      const { waliId } = await readJsonBody(req);
      const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
      if (!cls) return sendJson(res, 404, { error: 'Class not found' });
      const cleanWali = waliId ? String(waliId).trim() : null;
      if (cleanWali) {
        const tWali = db.prepare('SELECT id, active FROM teachers WHERE id = ?').get(cleanWali);
        if (!tWali || Number(tWali.active ?? 1) === 0) {
          return sendJson(res, 400, { error: 'Guru wali kelas tidak ditemukan atau sedang nonaktif' });
        }
      }
      runInTransaction(() => {
        if (cleanWali) {
          db.prepare('UPDATE classes SET waliId = NULL WHERE tahun = ? AND id != ? AND waliId = ?').run(cls.tahun, classId, cleanWali);
          db.prepare('UPDATE classes SET waliId = ? WHERE id = ?').run(cleanWali, classId);
        } else {
          db.prepare('UPDATE classes SET waliId = NULL WHERE id = ?').run(classId);
        }
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Classes: Delete (prevent deleting class that still has students, clean assignments)
    const classDelMatch = pathname.match(/^\/api\/classes\/(\d+)$/);
    if (method === 'DELETE' && classDelMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const classId = Number(classDelMatch[1]);
      const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
      if (!cls) return sendJson(res, 404, { error: 'Kelas tidak ditemukan' });
      const stCount = db.prepare("SELECT COUNT(*) AS cnt FROM student_enrollments WHERE tahun = ? AND kelas = ? AND COALESCE(status, 'aktif') = 'aktif'").get(cls.tahun, cls.kode).cnt;
      if (stCount > 0) {
        return sendJson(res, 409, { error: `Kelas ${cls.kode} masih memiliki ${stCount} santri di tahun ${cls.tahun}. Hapus atau pindahkan santri terlebih dahulu.` });
      }
      runInTransaction(() => {
        db.prepare('UPDATE teachers SET waliKelas = NULL WHERE waliKelas = ? OR id = ?').run(cls.kode, cls.waliId || '');
        db.prepare('DELETE FROM assignment_periods WHERE assignmentId IN (SELECT id FROM assignments WHERE tahun = ? AND kode = ?)').run(cls.tahun, cls.kode);
        db.prepare('DELETE FROM assignments WHERE tahun = ? AND kode = ?').run(cls.tahun, cls.kode);
        db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Teachers: Add one or bulk (preserve existing waliKelas & password, guard ALL other accounts, UUID id, atomic)
    if (method === 'POST' && pathname === '/api/teachers') {
      if (!requireRole(req, res, ['admin'])) return;
      const body = await readJsonBody(req);
      const isBulk = Array.isArray(body.teachers);
      const list = (isBulk ? body.teachers : [body]).filter(x => x && typeof x === 'object');
      const findTeacherByNuptk = db.prepare('SELECT id, waliKelas FROM teachers WHERE nuptk = ?');
      const findTeacherById = db.prepare('SELECT id, waliKelas FROM teachers WHERE id = ?');
      const upsertT = db.prepare(`
        INSERT INTO teachers (id, nama, namaArab, initials, role, nuptk, nip, ttl, pendidikan, waliKelas, jumlahSiswa, ekskul, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          nama = excluded.nama,
          namaArab = excluded.namaArab,
          initials = excluded.initials,
          role = excluded.role,
          nuptk = COALESCE(NULLIF(excluded.nuptk, ''), teachers.nuptk),
          nip = excluded.nip,
          ttl = excluded.ttl,
          pendidikan = excluded.pendidikan,
          waliKelas = COALESCE(excluded.waliKelas, teachers.waliKelas)
      `);
      const findUserByTeacher = db.prepare("SELECT id, username FROM users WHERE role = 'guru' AND teacherId = ?");
      const findUserByUsername = db.prepare('SELECT id, role, teacherId FROM users WHERE username = ?');
      const updateUserWithPw = db.prepare('UPDATE users SET username = ?, passwordHash = ?, displayName = ?, teacherId = ? WHERE id = ?');
      const updateUserKeepPw = db.prepare('UPDATE users SET username = ?, displayName = ?, teacherId = ? WHERE id = ?');
      const insertUser = db.prepare(`
        INSERT INTO users (username, passwordHash, role, displayName, teacherId, studentId)
        VALUES (?, ?, 'guru', ?, ?, NULL)
      `);
      const delUserSessions = db.prepare('DELETE FROM sessions WHERE userId = ?');

      if (!isBulk && list.length === 1) {
        const nuptkSingle = String(list[0].nuptk || '').trim();
        if (nuptkSingle && !isValidNuptk(nuptkSingle)) {
          return sendJson(res, 400, { error: 'NUPTK harus berupa angka 6–30 digit (tidak boleh semua nol)' });
        }
        if (isValidNuptk(nuptkSingle)) {
          const existingT = findTeacherByNuptk.get(nuptkSingle);
          if (existingT) {
            return sendJson(res, 409, { error: `NUPTK "${nuptkSingle}" sudah terdaftar pada data guru` });
          }
          const hit = findUserByUsername.get(nuptkSingle);
          if (hit) {
            return sendJson(res, 409, { error: `NUPTK / username "${nuptkSingle}" sudah dipakai oleh akun lain` });
          }
        }
        const pwSingle = list[0].password !== undefined && list[0].password !== null ? String(list[0].password) : '';
        if (pwSingle && (pwSingle.trim().length < 6 || pwSingle.length > 256)) {
          return sendJson(res, 400, { error: 'Password guru minimal 6 karakter' });
        }
      }

      // Pre-validate bulk passwords & pre-hash asynchronously outside synchronous SQLite tx
      let explicitPwCount = 0;
      const explicitHashesByIdx = new Map();
      const defaultPwIdxs = [];
      let needsDefaultGuruHash = false;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const nama = String(t.nama || '').trim();
        if (!nama) continue;
        const rawPw = (t.password !== undefined && t.password !== null) ? String(t.password) : '';
        if (rawPw !== '') {
          if (rawPw.trim().length < 6 || rawPw.length > 256) {
            return sendJson(res, 400, { error: `Password untuk guru "${nama}" minimal 6 karakter (maks 256)` });
          }
          if (rawPw === 'guru123') {
            needsDefaultGuruHash = true;
            defaultPwIdxs.push(i);
          } else {
            explicitPwCount++;
            if (isBulk && explicitPwCount > 25) {
              return sendJson(res, 400, { error: 'Maksimal 25 password kustom per upload massal guru' });
            }
            explicitHashesByIdx.set(i, await hashPasswordAsync(rawPw));
          }
        } else {
          needsDefaultGuruHash = true;
        }
      }
      const defaultGuruHash = needsDefaultGuruHash ? await hashPasswordAsync('guru123') : null;
      if (defaultGuruHash) {
        for (const idx of defaultPwIdxs) explicitHashesByIdx.set(idx, defaultGuruHash);
      }

      const skippedConflicts = [];
      let processed = 0;
      let lastTid = null;
      let lastUname = null;
      runInTransaction(() => {
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          const nama = String(t.nama || '').trim();
          if (!nama) continue;
          const nuptkRaw = String(t.nuptk || '').trim();
          const validNuptk = isValidNuptk(nuptkRaw) ? nuptkRaw : '';
          const byNuptk = validNuptk ? findTeacherByNuptk.get(validNuptk) : null;
          const byId = (!byNuptk && t.id) ? findTeacherById.get(String(t.id)) : null;
          const existingTeacher = byNuptk || byId;
          const tid = (existingTeacher && existingTeacher.id) || ('t_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16));
          lastTid = tid;
          const keptWali = t.waliKelas || (existingTeacher && existingTeacher.waliKelas) || null;
          upsertT.run(
            tid, nama, String(t.namaArab || nama).trim(), String(t.initials || '').trim(),
            String(t.role || 'Guru / Ustadz').trim(), validNuptk, String(t.nip || '-').trim(),
            String(t.ttl || '-').trim(), String(t.pendidikan || 'S1').trim(),
            keptWali, Number(t.jumlahSiswa) || 0, t.ekskul || null
          );
          processed++;

          const existingByTeacher = findUserByTeacher.get(tid);
          let uname = validNuptk || (existingByTeacher ? existingByTeacher.username : tid);
          const explicitHash = explicitHashesByIdx.get(i) || null;

          let existingByUsername = findUserByUsername.get(uname);

          // Jangan pernah menimpa/menghapus akun non-guru, akun guru milik guru lain, atau akun kedua guru yang sama
          const isUsernameCollision = (u) => Boolean(
            u && (u.role !== 'guru' || u.teacherId !== tid || (existingByTeacher && u.id !== existingByTeacher.id))
          );
          if (isUsernameCollision(existingByUsername)) {
            skippedConflicts.push(uname);
            uname = existingByTeacher ? existingByTeacher.username : tid;
            existingByUsername = findUserByUsername.get(uname);
            if (isUsernameCollision(existingByUsername)) continue;
          }
          lastUname = uname;

          if (existingByTeacher) {
            if (explicitHash) {
              updateUserWithPw.run(uname, explicitHash, nama, tid, existingByTeacher.id);
              delUserSessions.run(existingByTeacher.id);
            } else {
              updateUserKeepPw.run(uname, nama, tid, existingByTeacher.id);
            }
          } else if (existingByUsername && existingByUsername.role === 'guru' && existingByUsername.teacherId === tid) {
            if (explicitHash) {
              updateUserWithPw.run(uname, explicitHash, nama, tid, existingByUsername.id);
              delUserSessions.run(existingByUsername.id);
            } else {
              updateUserKeepPw.run(uname, nama, tid, existingByUsername.id);
            }
          } else if (!existingByUsername) {
            insertUser.run(uname, explicitHash || defaultGuruHash, nama, tid);
          }
        }
      });
      sendJson(res, 201, { ok: true, id: lastTid, username: lastUname, count: processed, skippedConflicts });
      return;
    }

    // Teachers: Toggle Active / Nonaktif (preserves historical rapors/assignments; revokes sessions on deactivate)
    const teacherActiveMatch = pathname.match(/^\/api\/teachers\/([^/]+)\/active$/);
    if (method === 'PUT' && teacherActiveMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const teacherId = decodeURIComponent(teacherActiveMatch[1]);
      const exists = db.prepare('SELECT id FROM teachers WHERE id = ?').get(teacherId);
      if (!exists) return sendJson(res, 404, { error: 'Guru tidak ditemukan' });
      const { active } = await readJsonBody(req);
      if (typeof active !== 'boolean') {
        return sendJson(res, 400, { error: 'Status active harus berupa boolean (true/false)' });
      }
      const activeVal = active ? 1 : 0;
      runInTransaction(() => {
        db.prepare('UPDATE teachers SET active = ? WHERE id = ?').run(activeVal, teacherId);
        if (activeVal === 0) {
          const linkedUsers = db.prepare("SELECT id FROM users WHERE role = 'guru' AND teacherId = ?").all(teacherId);
          for (const u of linkedUsers) db.prepare('DELETE FROM sessions WHERE userId = ?').run(u.id);
        }
      });
      sendJson(res, 200, { ok: true, active: Boolean(activeVal) });
      return;
    }

    // Teachers: Update field (and sync linked user account atomically)
    const teacherMatch = pathname.match(/^\/api\/teachers\/([^/]+)$/);
    if (method === 'PUT' && teacherMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const teacherId = decodeURIComponent(teacherMatch[1]);
      const exists = db.prepare('SELECT id FROM teachers WHERE id = ?').get(teacherId);
      if (!exists) return sendJson(res, 404, { error: 'Guru tidak ditemukan' });
      const body = await readJsonBody(req);
      let newPwHash = null;
      if (body.password !== undefined && body.password !== null && String(body.password) !== '') {
        if (typeof body.password === 'object') {
          return sendJson(res, 400, { error: 'Format password tidak valid' });
        }
        const cleanPw = String(body.password);
        if (cleanPw.trim().length < 6 || cleanPw.length > 256) {
          return sendJson(res, 400, { error: 'Password baru minimal 6 karakter' });
        }
        newPwHash = await hashPasswordAsync(cleanPw);
      }
      const allowed = ['nama', 'namaArab', 'nuptk', 'nip', 'ttl', 'pendidikan', 'role'];
      const sets = [];
      const vals = [];
      let validUpdatedNuptk = null;
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          const rawField = body[key];
          if (rawField !== null && typeof rawField === 'object') {
            return sendJson(res, 400, { error: `Format kolom ${key} tidak valid` });
          }
          let val = String(rawField ?? '').trim();
          if ((key === 'nama' || key === 'namaArab') && !val) {
            return sendJson(res, 400, { error: `Kolom ${key} tidak boleh kosong` });
          }
          if (key === 'nuptk') {
            if (val === '' || val === '-') {
              val = '';
            } else {
              if (!isValidNuptk(val)) {
                return sendJson(res, 400, { error: 'NUPTK harus berupa angka 6–30 digit (atau kosong/- untuk menghapus)' });
              }
              const teacherConflict = db.prepare('SELECT id FROM teachers WHERE nuptk = ? AND id != ?').get(val, teacherId);
              const userConflict = db.prepare('SELECT id FROM users WHERE username = ? AND (teacherId IS NULL OR teacherId != ?)').get(val, teacherId);
              if (teacherConflict || userConflict) {
                return sendJson(res, 409, { error: `NUPTK / username "${val}" sudah digunakan guru/akun lain` });
              }
              validUpdatedNuptk = val;
            }
          }
          sets.push(`${key} = ?`);
          vals.push(val);
        }
      }
      runInTransaction(() => {
        if (sets.length > 0) {
          vals.push(teacherId);
          db.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        }
        if (body.nama && String(body.nama).trim()) {
          db.prepare("UPDATE users SET displayName = ? WHERE role = 'guru' AND teacherId = ?").run(String(body.nama).trim(), teacherId);
        }
        if (validUpdatedNuptk) {
          const primaryUser = db.prepare("SELECT id FROM users WHERE role = 'guru' AND teacherId = ? ORDER BY id ASC LIMIT 1").get(teacherId);
          if (primaryUser) {
            const sameOwnerHit = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(validUpdatedNuptk, primaryUser.id);
            if (!sameOwnerHit) {
              db.prepare('UPDATE users SET username = ? WHERE id = ?').run(validUpdatedNuptk, primaryUser.id);
            }
          }
        }
        if (newPwHash) {
          db.prepare("UPDATE users SET passwordHash = ? WHERE role = 'guru' AND teacherId = ?").run(newPwHash, teacherId);
          const guruUsers = db.prepare("SELECT id FROM users WHERE role = 'guru' AND teacherId = ?").all(teacherId);
          for (const u of guruUsers) {
            db.prepare('DELETE FROM sessions WHERE userId = ?').run(u.id);
          }
        }
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Teachers: Delete (block if teacher still has historical assignments or wali kelas — suggest Nonaktifkan)
    if (method === 'DELETE' && teacherMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const teacherId = decodeURIComponent(teacherMatch[1]);
      const exists = db.prepare('SELECT id FROM teachers WHERE id = ?').get(teacherId);
      if (!exists) return sendJson(res, 404, { error: 'Guru tidak ditemukan' });
      const refAssign = db.prepare('SELECT COUNT(*) AS cnt FROM assignments WHERE teacherId = ?').get(teacherId).cnt;
      const refWali = db.prepare('SELECT COUNT(*) AS cnt FROM classes WHERE waliId = ?').get(teacherId).cnt;
      if (refAssign > 0 || refWali > 0) {
        return sendJson(res, 409, {
          error: 'Guru masih memiliki riwayat penugasan/wali kelas. Gunakan tombol "Nonaktifkan" agar arsip nilai & rapor tahun lalu tetap aman.'
        });
      }
      runInTransaction(() => {
        const linkedUsers = db.prepare("SELECT id FROM users WHERE role = 'guru' AND teacherId = ?").all(teacherId);
        for (const u of linkedUsers) {
          db.prepare('DELETE FROM sessions WHERE userId = ?').run(u.id);
        }
        db.prepare("DELETE FROM users WHERE role = 'guru' AND teacherId = ?").run(teacherId);
        db.prepare('DELETE FROM teachers WHERE id = ?').run(teacherId);
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Subjects: Add
    if (method === 'POST' && pathname === '/api/subjects') {
      if (!requireRole(req, res, ['admin'])) return;
      const s = await readJsonBody(req);
      const namaArab = String(s.namaArab || '').trim();
      const namaId = String(s.namaId || '').trim();
      if (!namaArab || !namaId) {
        return sendJson(res, 400, { error: 'Nama mata pelajaran (Arab & Indonesia) wajib diisi' });
      }
      const dupSub = db.prepare('SELECT id FROM subjects WHERE LOWER(TRIM(namaArab)) = LOWER(?)').get(namaArab);
      if (dupSub) {
        return sendJson(res, 409, { error: `Mata pelajaran "${namaArab}" sudah terdaftar` });
      }
      const kelompok = ['umum', 'syari'].includes(s.kelompok) ? s.kelompok : 'syari';
      let jam = 2;
      if (s.jam !== undefined) {
        const parsedJam = parseBoundedInt(s.jam, 1, 30);
        if (parsedJam === null) return sendJson(res, 400, { error: 'Jam pelajaran harus angka 1–30' });
        jam = parsedJam;
      }
      let kkm = 75;
      if (s.kkm !== undefined) {
        const parsedKkm = parseBoundedInt(s.kkm, 0, 100);
        if (parsedKkm === null) return sendJson(res, 400, { error: 'KKM harus angka 0–100' });
        kkm = parsedKkm;
      }
      const info = db.prepare('INSERT INTO subjects (kelompok, namaArab, namaId, jam, kkm, active) VALUES (?, ?, ?, ?, ?, 1)')
        .run(kelompok, namaArab, namaId, jam, kkm);
      sendJson(res, 201, { ok: true, id: Number(info.lastInsertRowid) });
      return;
    }

    // Subjects: Toggle Active / Nonaktif
    const subActiveMatch = pathname.match(/^\/api\/subjects\/(\d+)\/active$/);
    if (method === 'PUT' && subActiveMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const subId = Number(subActiveMatch[1]);
      const oldSub = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subId);
      if (!oldSub) return sendJson(res, 404, { error: 'Mata pelajaran tidak ditemukan' });
      const { active } = await readJsonBody(req);
      if (typeof active !== 'boolean') {
        return sendJson(res, 400, { error: 'Status active harus berupa boolean (true/false)' });
      }
      const activeVal = active ? 1 : 0;
      db.prepare('UPDATE subjects SET active = ? WHERE id = ?').run(activeVal, subId);
      sendJson(res, 200, { ok: true, active: Boolean(activeVal) });
      return;
    }

    // Subjects: Update (sync assignments.mapel if namaArab changes, atomic)
    const subMatch = pathname.match(/^\/api\/subjects\/(\d+)$/);
    if (method === 'PUT' && subMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const subId = Number(subMatch[1]);
      const oldSub = db.prepare('SELECT namaArab FROM subjects WHERE id = ?').get(subId);
      if (!oldSub) return sendJson(res, 404, { error: 'Mata pelajaran tidak ditemukan' });
      const body = await readJsonBody(req);
      const allowed = ['kelompok', 'namaArab', 'namaId', 'jam', 'kkm'];
      const sets = [];
      const vals = [];
      let newNamaArab = null;
      for (const key of allowed) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        if (key === 'kelompok' && !['umum', 'syari'].includes(body[key])) {
          return sendJson(res, 400, { error: 'Kelompok harus umum atau syari' });
        }
        if (key === 'namaArab' || key === 'namaId') {
          if (body[key] !== null && typeof body[key] === 'object') {
            return sendJson(res, 400, { error: `Format kolom ${key} tidak valid` });
          }
          const clean = String(body[key] ?? '').trim();
          if (!clean) return sendJson(res, 400, { error: `Kolom ${key} tidak boleh kosong` });
          if (key === 'namaArab') {
            const dupSub = db.prepare('SELECT id FROM subjects WHERE LOWER(TRIM(namaArab)) = LOWER(?) AND id != ?').get(clean, subId);
            if (dupSub) {
              return sendJson(res, 409, { error: `Nama Arab mata pelajaran "${clean}" sudah digunakan mapel lain` });
            }
            newNamaArab = clean;
          }
          sets.push(`${key} = ?`);
          vals.push(clean);
        } else if (key === 'jam') {
          const parsedJam = parseBoundedInt(body[key], 1, 30);
          if (parsedJam === null) return sendJson(res, 400, { error: 'Jam pelajaran harus 1–30' });
          sets.push('jam = ?');
          vals.push(parsedJam);
        } else if (key === 'kkm') {
          const parsedKkm = parseBoundedInt(body[key], 0, 100);
          if (parsedKkm === null) return sendJson(res, 400, { error: 'KKM harus 0–100' });
          sets.push('kkm = ?');
          vals.push(parsedKkm);
        } else {
          sets.push(`${key} = ?`);
          vals.push(body[key]);
        }
      }
      runInTransaction(() => {
        if (sets.length > 0) {
          vals.push(subId);
          db.prepare(`UPDATE subjects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        }
        if (newNamaArab && newNamaArab !== oldSub.namaArab) {
          db.prepare('UPDATE assignments SET mapel = ? WHERE mapel = ?').run(newNamaArab, oldSub.namaArab);
        }
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Subjects: Delete (block if referenced in scores or assignments — suggest Nonaktifkan)
    if (method === 'DELETE' && subMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const subId = Number(subMatch[1]);
      const oldSub = db.prepare('SELECT namaArab FROM subjects WHERE id = ?').get(subId);
      if (!oldSub) return sendJson(res, 404, { error: 'Mata pelajaran tidak ditemukan' });
      const refScores = db.prepare('SELECT COUNT(*) AS cnt FROM scores WHERE subjectId = ?').get(subId).cnt;
      const refAssign = db.prepare('SELECT COUNT(*) AS cnt FROM assignments WHERE mapel = ?').get(oldSub.namaArab).cnt;
      if (refScores > 0 || refAssign > 0) {
        return sendJson(res, 409, {
          error: 'Mata pelajaran masih memiliki riwayat nilai atau penugasan. Gunakan tombol "Nonaktifkan" agar arsip rapor tetap aman.'
        });
      }
      db.prepare('DELETE FROM subjects WHERE id = ?').run(subId);
      sendJson(res, 200, { ok: true });
      return;
    }

    // Students: Add or update bulk / single mutasi masuk (per-semester enrollments, lossless across semesters)
    if (method === 'POST' && pathname === '/api/students') {
      const actorUser = requireRole(req, res, ['admin']);
      if (!actorUser) return;
      const body = await readJsonBody(req);
      const { tahun: activeTahun, semester: activeSemester } = getActivePeriod();
      if (body.tahun && String(body.tahun).trim() !== activeTahun) {
        return sendJson(res, 409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
      }
      if (body.semester && String(body.semester).trim() !== activeSemester) {
        return sendJson(res, 409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
      }
      const isBulk = Array.isArray(body.students);
      const list = (isBulk ? body.students : [body]).filter(x => x && typeof x === 'object');
      if (!isBulk && list.length === 1) {
        const singleNama = String(list[0].nama || '').trim();
        const singleKelas = String(list[0].kelas || '').trim();
        if (!singleNama || !singleKelas) {
          return sendJson(res, 400, { error: 'Nama santri dan kelas wajib diisi' });
        }
        const clsRow = db.prepare('SELECT id FROM classes WHERE tahun = ? AND kode = ?').get(activeTahun, singleKelas);
        if (!clsRow) {
          return sendJson(res, 400, { error: `Kelas "${singleKelas}" tidak ditemukan di tahun pelajaran ${activeTahun}` });
        }
      }
      const findByNisn = db.prepare("SELECT id FROM students WHERE nisn = ?");
      const insertSt = db.prepare(`
        INSERT INTO students (nama, nis, nisn, nik, tempatLahir, tglLahir, kelas, jk, alamat, telp, ayah, ibu, wali, sakit, izin, alpa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateSt = db.prepare(`
        UPDATE students
        SET nama = ?,
            nis = COALESCE(NULLIF(NULLIF(?, ''), '-'), nis),
            nik = COALESCE(NULLIF(NULLIF(?, ''), '-'), nik),
            tempatLahir = COALESCE(NULLIF(NULLIF(?, ''), '-'), tempatLahir),
            tglLahir = COALESCE(NULLIF(NULLIF(?, ''), '-'), tglLahir),
            kelas = ?,
            jk = COALESCE(NULLIF(?, ''), jk),
            alamat = COALESCE(NULLIF(NULLIF(?, ''), '-'), alamat),
            telp = COALESCE(NULLIF(NULLIF(?, ''), '-'), telp),
            ayah = COALESCE(NULLIF(NULLIF(?, ''), '-'), ayah),
            ibu = COALESCE(NULLIF(NULLIF(?, ''), '-'), ibu),
            wali = COALESCE(NULLIF(NULLIF(?, ''), '-'), wali)
        WHERE id = ?
      `);
      const upsertEnrollment = db.prepare(`
        INSERT INTO student_enrollments (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
        VALUES (?, ?, ?, ?, 'aktif', ?, ?, 0, 0, 0)
        ON CONFLICT(studentId, tahun, semester) DO UPDATE SET
          kelas = excluded.kelas,
          status = 'aktif',
          mutasiCatatan = CASE WHEN excluded.mutasiCatatan != '' THEN excluded.mutasiCatatan ELSE student_enrollments.mutasiCatatan END,
          mutasiTanggal = CASE WHEN excluded.mutasiTanggal != '' THEN excluded.mutasiTanggal ELSE student_enrollments.mutasiTanggal END
      `);
      const upsertAttendance = db.prepare(`
        INSERT INTO student_attendance (studentId, tahun, semester, sakit, izin, alpa)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(studentId, tahun, semester) DO UPDATE SET
          sakit = COALESCE(?, student_attendance.sakit),
          izin = COALESCE(?, student_attendance.izin),
          alpa = COALESCE(?, student_attendance.alpa)
      `);
      const insertScore = db.prepare('INSERT OR IGNORE INTO scores (studentId, subjectId, tahun, semester, score) VALUES (?, ?, ?, ?, ?)');
      const findUserByUsername = db.prepare('SELECT id FROM users WHERE username = ?');
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (username, passwordHash, role, displayName, teacherId, studentId)
        VALUES (?, ?, 'siswa', ?, NULL, ?)
      `);
      const updateUserDisplay = db.prepare("UPDATE users SET displayName = ? WHERE role = 'siswa' AND studentId = ?");
      const validSubjectIds = new Set(db.prepare('SELECT id FROM subjects').all().map(r => r.id));
      let defaultSiswaHash = null;
      for (const st of list) {
        const cleanNama = String(st.nama || '').trim();
        const targetKelas = String(st.kelas || '').trim();
        if (!cleanNama || !targetKelas) continue;
        const rawNisn = String(st.nisn || '').trim();
        const cleanNisn = isValidNisn(rawNisn) ? rawNisn : '';
        const rawNis = String(st.nis || '').trim();
        const uname = cleanNisn || (isValidNisn(rawNis) ? rawNis : '');
        if (uname && !findUserByUsername.get(uname)) {
          defaultSiswaHash = await hashPasswordAsync('mtswihebat');
          break;
        }
      }
      let added = 0;
      let updated = 0;
      let lastStId = 0;
      runInTransaction(() => {
        for (const st of list) {
          const cleanNama = String(st.nama || '').trim();
          if (!cleanNama) continue;
          const rawNisn = String(st.nisn || '').trim();
          const cleanNisn = isValidNisn(rawNisn) ? rawNisn : '';
          const targetKelas = String(st.kelas || '').trim();
          if (!targetKelas) continue;
          const existing = cleanNisn ? findByNisn.get(cleanNisn) : null;
          let stId;
          const sakitVal = parseAttendanceCount(st.sakit);
          const izinVal = parseAttendanceCount(st.izin);
          const alpaVal = parseAttendanceCount(st.alpa);
          const mutCatatan = String(st.mutasiCatatan || '').trim().slice(0, 200);
          const mutTanggal = String(st.mutasiTanggal || '').trim().slice(0, 32);
          if (existing) {
            stId = existing.id;
            updateSt.run(
              cleanNama, String(st.nis || '').trim(), String(st.nik || '').trim(),
              String(st.tempatLahir || '').trim(), String(st.tglLahir || '').trim(),
              targetKelas, String(st.jk || '').trim(), String(st.alamat || '').trim(),
              String(st.telp || '').trim(), String(st.ayah || '').trim(),
              String(st.ibu || '').trim(), String(st.wali || '').trim(), stId
            );
            updateUserDisplay.run(cleanNama, stId);
            updated++;
          } else {
            const info = insertSt.run(
              cleanNama, String(st.nis || '').trim(), cleanNisn, String(st.nik || '').trim(),
              String(st.tempatLahir || '').trim(), String(st.tglLahir || '').trim(),
              targetKelas, String(st.jk || 'Laki-laki').trim(), String(st.alamat || '').trim(),
              String(st.telp || '').trim(), String(st.ayah || '').trim(),
              String(st.ibu || '').trim(), String(st.wali || '').trim(),
              0, 0, 0
            );
            stId = Number(info.lastInsertRowid);
            added++;
          }
          lastStId = stId;
          upsertEnrollment.run(stId, activeTahun, activeSemester, targetKelas, mutCatatan, mutTanggal);
          upsertAttendance.run(stId, activeTahun, activeSemester, sakitVal ?? 0, izinVal ?? 0, alpaVal ?? 0, sakitVal, izinVal, alpaVal);
          if (st.scores && typeof st.scores === 'object') {
            for (const [subId, val] of Object.entries(st.scores)) {
              const sidNum = Number(subId);
              const parsed = parseScoreValue(val);
              if (Number.isInteger(sidNum) && validSubjectIds.has(sidNum) && parsed.value !== undefined) {
                insertScore.run(stId, sidNum, activeTahun, activeSemester, parsed.value);
              }
            }
          }
          const rawNis = String(st.nis || '').trim();
          const uname = cleanNisn || (isValidNisn(rawNis) ? rawNis : '');
          if (uname && defaultSiswaHash && !findUserByUsername.get(uname)) {
            insertUser.run(uname, defaultSiswaHash, cleanNama, stId);
          }
        }
      });
      if (!isBulk && list.length === 1 && lastStId) {
        logActivity(actorUser, `Menambahkan santri ${String(list[0].nama || '').trim()} ke Kelas ${String(list[0].kelas || '').trim()} (${activeTahun} ${activeSemester})`);
      }
      sendJson(res, 201, { ok: true, id: lastStId, count: added + updated, added, updated });
      return;
    }

    // Student: Move class for active semester only (preserve previous semester class archive)
    const moveStudentMatch = pathname.match(/^\/api\/students\/(\d+)\/move-class$/);
    if (method === 'PUT' && moveStudentMatch) {
      const actorUser = requireRole(req, res, ['admin']);
      if (!actorUser) return;
      const stId = Number(moveStudentMatch[1]);
      const body = await readJsonBody(req);
      const { tahun: activeTahun, semester: activeSemester } = getActivePeriod();
      if (body.tahun && String(body.tahun).trim() !== activeTahun) {
        return sendJson(res, 409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
      }
      if (body.semester && String(body.semester).trim() !== activeSemester) {
        return sendJson(res, 409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
      }
      const targetKelas = String(body.targetKelas || '').trim();
      if (!targetKelas) return sendJson(res, 400, { error: 'Kelas tujuan wajib dipilih' });
      const clsRow = db.prepare('SELECT id FROM classes WHERE tahun = ? AND kode = ?').get(activeTahun, targetKelas);
      if (!clsRow) return sendJson(res, 400, { error: `Kelas tujuan "${targetKelas}" tidak ditemukan di tahun ${activeTahun}` });
      const enr = db.prepare(`
        SELECT e.kelas, COALESCE(e.status, 'aktif') AS status, s.nama
        FROM student_enrollments e
        JOIN students s ON s.id = e.studentId
        WHERE e.studentId = ? AND e.tahun = ? AND e.semester = ?
      `).get(stId, activeTahun, activeSemester);
      if (!enr) {
        return sendJson(res, 404, { error: `Santri tidak terdaftar pada ${activeTahun} (${activeSemester})` });
      }
      if (enr.status !== 'aktif') {
        return sendJson(res, 400, { error: 'Aktifkan kembali santri sebelum memindahkan kelas' });
      }
      if (enr.kelas === targetKelas) {
        return sendJson(res, 400, { error: `Santri sudah berada di kelas ${targetKelas}` });
      }
      runInTransaction(() => {
        db.prepare('UPDATE student_enrollments SET kelas = ? WHERE studentId = ? AND tahun = ? AND semester = ?')
          .run(targetKelas, stId, activeTahun, activeSemester);
        db.prepare('UPDATE students SET kelas = ? WHERE id = ?').run(targetKelas, stId);
      });
      logActivity(actorUser, `Memindahkan santri ${enr.nama} dari Kelas ${enr.kelas} ke ${targetKelas} (${activeTahun} ${activeSemester})`);
      sendJson(res, 200, { ok: true, studentId: stId, fromKelas: enr.kelas, toKelas: targetKelas });
      return;
    }

    // Student: Set enrollment status ('mutasi_keluar' | 'aktif') for active semester only
    const statusStudentMatch = pathname.match(/^\/api\/students\/(\d+)\/status$/);
    if (method === 'PUT' && statusStudentMatch) {
      const actorUser = requireRole(req, res, ['admin']);
      if (!actorUser) return;
      const stId = Number(statusStudentMatch[1]);
      const body = await readJsonBody(req);
      const { tahun: activeTahun, semester: activeSemester } = getActivePeriod();
      if (body.tahun && String(body.tahun).trim() !== activeTahun) {
        return sendJson(res, 409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
      }
      if (body.semester && String(body.semester).trim() !== activeSemester) {
        return sendJson(res, 409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
      }
      const nextStatus = String(body.status || '').trim();
      if (!['aktif', 'mutasi_keluar'].includes(nextStatus)) {
        return sendJson(res, 400, { error: 'Status santri harus "aktif" atau "mutasi_keluar"' });
      }
      const enr = db.prepare(`
        SELECT e.kelas, COALESCE(e.status, 'aktif') AS status, s.nama
        FROM student_enrollments e
        JOIN students s ON s.id = e.studentId
        WHERE e.studentId = ? AND e.tahun = ? AND e.semester = ?
      `).get(stId, activeTahun, activeSemester);
      if (!enr) {
        return sendJson(res, 404, { error: `Santri tidak terdaftar pada ${activeTahun} (${activeSemester})` });
      }
      const mutasiCatatan = nextStatus === 'mutasi_keluar' ? String(body.mutasiCatatan || '').trim().slice(0, 200) : '';
      const mutasiTanggal = nextStatus === 'mutasi_keluar' ? String(body.mutasiTanggal || '').trim().slice(0, 32) : '';
      db.prepare(`
        UPDATE student_enrollments
        SET status = ?, mutasiCatatan = ?, mutasiTanggal = ?
        WHERE studentId = ? AND tahun = ? AND semester = ?
      `).run(nextStatus, mutasiCatatan, mutasiTanggal, stId, activeTahun, activeSemester);
      logActivity(
        actorUser,
        nextStatus === 'mutasi_keluar'
          ? `Menandai santri ${enr.nama} (${enr.kelas}) mutasi keluar (${activeTahun} ${activeSemester})`
          : `Mengaktifkan kembali santri ${enr.nama} di Kelas ${enr.kelas} (${activeTahun} ${activeSemester})`
      );
      sendJson(res, 200, { ok: true, studentId: stId, status: nextStatus });
      return;
    }

    // Students: Delete all students in a specific class for active tahun + semester (keep other semesters' data!)
    if (method === 'DELETE' && pathname === '/api/students') {
      if (!requireRole(req, res, ['admin'])) return;
      const kelas = url.searchParams.get('kelas');
      if (!kelas) return sendJson(res, 400, { error: 'Parameter kelas wajib diisi' });
      const reqTahun = url.searchParams.get('tahun');
      const reqSemester = url.searchParams.get('semester');
      const { tahun: activeTahun, semester: activeSemester } = getActivePeriod();
      if (reqTahun && String(reqTahun).trim() !== activeTahun) {
        return sendJson(res, 409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
      }
      if (reqSemester && String(reqSemester).trim() !== activeSemester) {
        return sendJson(res, 409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
      }
      const rows = db.prepare('SELECT studentId AS id FROM student_enrollments WHERE tahun = ? AND semester = ? AND kelas = ?')
        .all(activeTahun, activeSemester, kelas);
      const delScoresPeriod = db.prepare('DELETE FROM scores WHERE studentId = ? AND tahun = ? AND semester = ?');
      const delScoresAll = db.prepare('DELETE FROM scores WHERE studentId = ?');
      const delAttPeriod = db.prepare('DELETE FROM student_attendance WHERE studentId = ? AND tahun = ? AND semester = ?');
      const delAttAll = db.prepare('DELETE FROM student_attendance WHERE studentId = ?');
      const countRemaining = db.prepare('SELECT COUNT(*) AS cnt FROM student_enrollments WHERE studentId = ?');
      const findUsers = db.prepare("SELECT id FROM users WHERE role = 'siswa' AND studentId = ?");
      const delSessions = db.prepare('DELETE FROM sessions WHERE userId = ?');
      const delUsers = db.prepare("DELETE FROM users WHERE role = 'siswa' AND studentId = ?");
      const delStudent = db.prepare('DELETE FROM students WHERE id = ?');
      runInTransaction(() => {
        db.prepare('DELETE FROM student_enrollments WHERE tahun = ? AND semester = ? AND kelas = ?')
          .run(activeTahun, activeSemester, kelas);
        for (const r of rows) {
          delScoresPeriod.run(r.id, activeTahun, activeSemester);
          delAttPeriod.run(r.id, activeTahun, activeSemester);
          if (countRemaining.get(r.id).cnt === 0) {
            delScoresAll.run(r.id);
            delAttAll.run(r.id);
            for (const u of findUsers.all(r.id)) delSessions.run(u.id);
            delUsers.run(r.id);
            delStudent.run(r.id);
          }
        }
      });
      sendJson(res, 200, { ok: true, deleted: rows.length, kelas });
      return;
    }

    // Assignments: Add one or bulk (validate active teacher, class & active subject, guard tahun, force sent=0)
    if (method === 'POST' && pathname === '/api/assignments') {
      if (!requireRole(req, res, ['admin'])) return;
      const body = await readJsonBody(req);
      const { tahun: activeTahun } = getActivePeriod();
      if (body.tahun && String(body.tahun).trim() !== activeTahun) {
        return sendJson(res, 409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
      }
      const list = (Array.isArray(body.assignments) ? body.assignments : [body]).filter(x => x && typeof x === 'object');
      const activeTeachers = new Set(db.prepare('SELECT id FROM teachers WHERE active = 1').all().map(r => r.id));
      const activeClasses = new Set(db.prepare('SELECT kode FROM classes WHERE tahun = ?').all(activeTahun).map(r => r.kode));
      const activeSubjects = new Set(db.prepare('SELECT namaArab FROM subjects WHERE active = 1').all().map(r => r.namaArab));

      const normalizedList = [];
      for (const a of list) {
        const tid = String(a.teacherId || '').trim();
        const kode = String(a.kode || '').trim();
        const mapel = String(a.mapel || '').trim();
        if (!tid || !kode || !mapel) {
          return sendJson(res, 400, { error: 'Guru, kelas, dan mata pelajaran penugasan wajib diisi' });
        }
        if (!activeTeachers.has(tid)) {
          return sendJson(res, 400, { error: `Guru "${tid}" tidak ditemukan atau sedang nonaktif` });
        }
        if (!activeClasses.has(kode)) {
          return sendJson(res, 400, { error: `Kelas "${kode}" tidak ditemukan di tahun ${activeTahun}` });
        }
        if (!activeSubjects.has(mapel)) {
          return sendJson(res, 400, { error: `Mata pelajaran "${mapel}" tidak ditemukan atau sedang nonaktif` });
        }
        normalizedList.push({ tid, kode, kelas: String(a.kelas || ('Kelas ' + kode)).trim(), mapel });
      }

      const existsStmt = db.prepare('SELECT id FROM assignments WHERE tahun = ? AND teacherId = ? AND kode = ? AND mapel = ?');
      const ins = db.prepare('INSERT OR IGNORE INTO assignments (tahun, teacherId, kelas, kode, mapel, sent) VALUES (?, ?, ?, ?, ?, 0)');
      let inserted = 0;
      const insertedIds = [];
      runInTransaction(() => {
        for (const item of normalizedList) {
          if (existsStmt.get(activeTahun, item.tid, item.kode, item.mapel)) continue;
          const info = ins.run(activeTahun, item.tid, item.kelas, item.kode, item.mapel);
          if (info.changes > 0) {
            insertedIds.push(Number(info.lastInsertRowid));
            inserted++;
          }
        }
      });
      sendJson(res, 201, { ok: true, count: inserted, ids: insertedIds });
      return;
    }

    // Assignments: Toggle sent or update (verify active tahun & period concurrency; guru can both send & cancel)
    const assignMatch = pathname.match(/^\/api\/assignments\/(\d+)$/);
    if (method === 'PUT' && assignMatch) {
      const user = requireRole(req, res, ['admin', 'guru']);
      if (!user) return;
      const id = Number(assignMatch[1]);
      const { sent, tahun: reqTahun, semester: reqSemester } = await readJsonBody(req);
      if (typeof sent !== 'boolean') {
        return sendJson(res, 400, { error: 'Status sent harus berupa boolean (true/false)' });
      }
      const { tahun: activeTahun, semester: activeSemester } = getActivePeriod();
      if ((reqTahun && String(reqTahun) !== activeTahun) || (reqSemester && String(reqSemester) !== activeSemester)) {
        return sendJson(res, 409, { error: `Periode aktif berubah (${activeTahun} ${activeSemester}). Muat ulang halaman sebelum mengirim nilai.` });
      }
      const row = db.prepare('SELECT id, teacherId, tahun, kelas, kode, mapel FROM assignments WHERE id = ? AND tahun = ?').get(id, activeTahun);
      if (!row) {
        return sendJson(res, 404, { error: 'Penugasan tidak ditemukan pada tahun pelajaran aktif' });
      }
      if (user.role === 'guru' && row.teacherId !== user.teacherId) {
        return sendJson(res, 403, { error: 'Anda tidak berhak mengubah status penugasan guru lain' });
      }
      const sentVal = sent ? 1 : 0;
      runInTransaction(() => {
        db.prepare(`
          INSERT INTO assignment_periods (assignmentId, tahun, semester, sent)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(assignmentId, tahun, semester) DO UPDATE SET sent = excluded.sent
        `).run(id, activeTahun, activeSemester, sentVal);
        db.prepare('UPDATE assignments SET sent = ? WHERE id = ?').run(sentVal, id);
      });
      let mapelLabel = row.mapel;
      try {
        const subRow = db.prepare('SELECT namaId FROM subjects WHERE namaArab = ? LIMIT 1').get(row.mapel);
        if (subRow && subRow.namaId) mapelLabel = subRow.namaId;
      } catch (_) {}
      const kelasLabel = row.kelas || ('Kelas ' + row.kode);
      logActivity(
        user,
        sent ? `Mengirim & mengunci nilai ${mapelLabel} ${kelasLabel}` : `Membuka kembali draf nilai ${mapelLabel} ${kelasLabel}`
      );
      sendJson(res, 200, { ok: true });
      return;
    }

    // Assignments: Delete batch
    if (method === 'POST' && pathname === '/api/assignments/delete-batch') {
      if (!requireRole(req, res, ['admin'])) return;
      const { ids } = await readJsonBody(req);
      const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite);
      const delPeriod = db.prepare('DELETE FROM assignment_periods WHERE assignmentId = ?');
      const del = db.prepare('DELETE FROM assignments WHERE id = ?');
      runInTransaction(() => {
        for (const id of list) {
          delPeriod.run(id);
          del.run(id);
        }
      });
      sendJson(res, 200, { ok: true, deleted: list.length });
      return;
    }

    // Assignments: Delete
    if (method === 'DELETE' && assignMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const id = Number(assignMatch[1]);
      runInTransaction(() => {
        db.prepare('DELETE FROM assignment_periods WHERE assignmentId = ?').run(id);
        db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    // Scores: Upsert or clear single/bulk (per active tahun + semester; locked if guru already sent)
    if (method === 'PUT' && pathname === '/api/scores') {
      const user = requireRole(req, res, ['admin', 'guru']);
      if (!user) return;
      const body = await readJsonBody(req);
      const { tahun: activeTahun, semester: activeSemester } = getActivePeriod();
      if ((body.tahun && String(body.tahun) !== activeTahun) || (body.semester && String(body.semester) !== activeSemester)) {
        return sendJson(res, 409, { error: `Periode aktif telah berubah menjadi ${activeTahun} (${activeSemester}). Silakan muat ulang halaman.` });
      }
      const upsert = db.prepare(`
        INSERT INTO scores (studentId, subjectId, tahun, semester, score) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(studentId, subjectId, tahun, semester) DO UPDATE SET score = excluded.score
      `);
      const delScore = db.prepare('DELETE FROM scores WHERE studentId = ? AND subjectId = ? AND tahun = ? AND semester = ?');
      const list = (Array.isArray(body.scores) ? body.scores : [body]).filter(x => x && typeof x === 'object');

      const enrolledMap = new Map(
        db.prepare("SELECT studentId, kelas FROM student_enrollments WHERE tahun = ? AND semester = ? AND COALESCE(status, 'aktif') = 'aktif'")
          .all(activeTahun, activeSemester)
          .map(r => [r.studentId, r.kelas])
      );
      const allSubjects = db.prepare('SELECT id, namaArab, namaId FROM subjects').all();
      const subjectMap = new Map(allSubjects.map(r => [r.id, r.namaArab]));
      const subjectLabelMap = new Map(allSubjects.map(r => [r.id, r.namaId || r.namaArab]));

      let guruAssignsByKey = null;
      let guruSentSet = null;
      if (user.role === 'guru') {
        guruAssignsByKey = new Map();
        const myAsg = db.prepare('SELECT id, kode, mapel FROM assignments WHERE tahun = ? AND teacherId = ?').all(activeTahun, user.teacherId);
        for (const a of myAsg) {
          const k = JSON.stringify([a.kode, a.mapel]);
          if (!guruAssignsByKey.has(k)) guruAssignsByKey.set(k, []);
          guruAssignsByKey.get(k).push(a.id);
        }
        guruSentSet = new Set(
          db.prepare('SELECT assignmentId FROM assignment_periods WHERE tahun = ? AND semester = ? AND sent = 1')
            .all(activeTahun, activeSemester).map(r => r.assignmentId)
        );
      }

      const validatedItems = [];
      const savedPairs = new Set();
      for (const item of list) {
        const sid = Number(item.studentId);
        const subId = Number(item.subjectId);
        if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(subId) || subId <= 0) {
          return sendJson(res, 400, { error: 'ID santri dan ID mata pelajaran harus valid' });
        }
        const parsed = parseScoreValue(item.score);
        if (parsed.invalid) {
          return sendJson(res, 400, { error: 'Nilai harus berupa angka 0–100 (atau kosong untuk menghapus)' });
        }
        const kelas = enrolledMap.get(sid);
        const mapel = subjectMap.get(subId);
        if (!kelas || !mapel) {
          if (user.role === 'guru') {
            return sendJson(res, 403, { error: 'Anda tidak ditugaskan mengampu mata pelajaran/kelas ini' });
          }
          return sendJson(res, 400, { error: `Santri #${sid} atau mapel #${subId} tidak ditemukan pada tahun ${activeTahun}` });
        }
        if (user.role === 'guru') {
          const asgIds = guruAssignsByKey.get(JSON.stringify([kelas, mapel])) || [];
          if (asgIds.length === 0) {
            return sendJson(res, 403, { error: 'Anda tidak ditugaskan mengampu mata pelajaran/kelas ini' });
          }
          if (asgIds.some(aid => guruSentSet.has(aid))) {
            return sendJson(res, 409, { error: 'Nilai sudah dikirim dan terkunci. Klik "Batal Kirim" terlebih dahulu untuk mengubah nilai.' });
          }
        }
        savedPairs.add(`${kelas}||${subjectLabelMap.get(subId) || mapel}`);
        validatedItems.push({ sid, subId, parsed });
      }

      runInTransaction(() => {
        for (const { sid, subId, parsed } of validatedItems) {
          if (parsed.empty) {
            delScore.run(sid, subId, activeTahun, activeSemester);
          } else {
            upsert.run(sid, subId, activeTahun, activeSemester, parsed.value);
          }
        }
      });
      if (validatedItems.length > 0) {
        let actMsg = `Menyimpan nilai (${validatedItems.length} entri)`;
        if (savedPairs.size === 1) {
          const [kls, lbl] = [...savedPairs][0].split('||');
          actMsg = `Menyimpan nilai ${lbl} Kelas ${kls} (${validatedItems.length} santri)`;
        }
        logActivity(user, actMsg);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    // Activities: Add (user & level derived strictly from session to prevent log spoofing)
    if (method === 'POST' && pathname === '/api/activities') {
      const sessionUser = requireRole(req, res, ['admin', 'guru']);
      if (!sessionUser) return;
      const { activity, time } = await readJsonBody(req, 16 * 1024);
      const cleanActivity = String(activity || '').trim().slice(0, 500);
      if (!cleanActivity) return sendJson(res, 400, { error: 'Aktivitas wajib diisi' });
      const derivedLevel = sessionUser.role === 'admin' ? 'Admin' : 'Guru';
      const cleanTime = String(time || 'Baru saja').trim().slice(0, 60) || 'Baru saja';
      db.prepare('INSERT INTO activities (user, level, activity, time) VALUES (?, ?, ?, ?)')
        .run(sessionUser.displayName || sessionUser.username, derivedLevel, cleanActivity, cleanTime);
      sendJson(res, 201, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[SERVER ERROR]', method, pathname, err);
    if (err && err.message === 'Payload too large') {
      sendJson(res, 413, { error: 'Ukuran data terlalu besar (maksimal 15 MB)' }, { Connection: 'close' });
    } else if (err instanceof SyntaxError) {
      sendJson(res, 400, { error: 'Format data JSON tidak valid' });
    } else if (err instanceof URIError || (err && err.code === 'ERR_INVALID_URL')) {
      sendJson(res, 400, { error: 'Format URL tidak valid' });
    } else {
      sendJson(res, 500, { error: 'Terjadi kesalahan pada server. Silakan coba lagi.' });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RDP Server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});

function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down RDP server...`);
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
  const timer = setTimeout(() => {
    try { db.close(); } catch (_) {}
    process.exit(0);
  }, 5000);
  timer.unref();
  server.close(() => {
    clearTimeout(timer);
    try { db.close(); } catch (_) {}
    process.exit(0);
  });
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
