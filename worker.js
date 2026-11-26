import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

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

async function logActivity(db, userLike, activityText) {
  try {
    const actor = String((userLike && (userLike.displayName || userLike.username)) || 'Sistem').trim().slice(0, 120) || 'Sistem';
    const level = roleToActivityLevel(userLike && userLike.role);
    const cleanActivity = String(activityText || '').trim().slice(0, 500);
    if (!cleanActivity) return;
    await db.prepare('INSERT INTO activities (user, level, activity, time) VALUES (?, ?, ?, ?)')
      .bind(actor, level, cleanActivity, formatWibTimestamp())
      .run();
  } catch (_) { /* fail-safe: jangan gagalkan request utama */ }
}

// Rate limiting dual-bucket untuk POST /api/login & PUT /api/me/password
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_MAX_FAILS = 30;
const LOGIN_ACCT_MAX_FAILS = 10;
const PW_CHANGE_MAX_FAILS = 10;
const LOGIN_MAP_CAP = 4000;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

const DUMMY_PASSWORD_HASH = '0123456789abcdef0123456789abcdef:d3dc5eeb9e895ff7ca3282b2dc77eb56637757bf098ca429f2ef6f2e05d8247cfb3032628b557a0a39a692774c1ff83203a498ebdaa802ea33828ca43b58a4f7';
// Hash scrypt valid terkomputasi awal untuk password bawaan agar upload massal <5ms CPU (batas 10ms Cloudflare Workers Free)
const DEFAULT_SISWA_PASSWORD_HASH = '27229eca1b7c92a400c4f02a032f6658:41dc3fce3adf43a591b71d236d4c451ff8cfd7be996ef0fae2c7eaba1ae48561bb9338f8ec6cbe6c36112c91b00276b4c1fb951fcfbbb0751a0886056dc0376f';
const DEFAULT_GURU_PASSWORD_HASH = '7a476ba1fc54889110253bd08913937a:9c2ffc13e2ed125c3e8155fed9355fe96a854aae6ec6983bbf9256155409091d7f943aeee4da13fb6cb5ab4d100c2fc85b19267449794c0bb817e45554ec3c31';

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex || keyHex.length !== 128) return false;
  const keyBuf = hexToBytes(keyHex);
  if (!keyBuf) return false;
  const derived = scryptSync(String(password), salt, 64);
  if (derived.length !== keyBuf.length) return false;
  return timingSafeEqual(derived, keyBuf);
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
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

function isHttpsRequest(request) {
  try {
    if (new URL(request.url).protocol === 'https:') return true;
  } catch (_) {}
  const xfp = String(request.headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return xfp === 'https';
}

function buildSessionCookie(request, token, maxAgeSec) {
  const secure = isHttpsRequest(request) ? '; Secure' : '';
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

const DEFAULT_PREDIKAT_LABELS = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];
const PREDIKAT_KEYS = ['A', 'B', 'C', 'D', 'E'];

function buildDefaultPredikatConfig(kkmRaw, labelsOverride = null) {
  const kkm = Math.min(100, Math.max(0, Math.round(Number.isFinite(Number(kkmRaw)) ? Number(kkmRaw) : 75)));
  const span = 100 - kkm;
  const min2 = Math.min(100, Math.max(kkm, Math.round(kkm + span * 0.25)));
  const min1 = Math.min(100, Math.max(min2, Math.round(kkm + span * 0.50)));
  const min0 = Math.min(100, Math.max(min1, Math.round(kkm + span * 0.75)));
  const mins = [min0, min1, min2, kkm, 0];
  return PREDIKAT_KEYS.map((key, idx) => {
    const customLabel = Array.isArray(labelsOverride) && labelsOverride[idx] ? String(labelsOverride[idx]).trim() : '';
    return { key, min: mins[idx], label: customLabel || DEFAULT_PREDIKAT_LABELS[idx] };
  });
}

function parseAndValidatePredikatConfig(raw, effectiveKkm) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch (_) { return { ok: false, error: 'Format predikatConfig JSON tidak valid' }; }
  }
  if (!Array.isArray(arr) || arr.length !== 5) {
    return { ok: false, error: 'Konfigurasi predikat harus terdiri dari 5 tingkat (A–E)' };
  }
  const kkm = Math.min(100, Math.max(0, Math.round(Number.isFinite(Number(effectiveKkm)) ? Number(effectiveKkm) : 75)));
  const out = [];
  for (let i = 0; i < 5; i++) {
    const item = arr[i];
    if (!item || typeof item !== 'object') return { ok: false, error: 'Item predikat tidak valid' };
    const label = String(item.label ?? '').trim();
    if (!label || label.length > 40) {
      return { ok: false, error: `Nama predikat tingkat ${PREDIKAT_KEYS[i]} wajib diisi (maks 40 karakter)` };
    }
    let minVal;
    if (i === 4) minVal = 0;
    else if (i === 3) minVal = kkm;
    else {
      const n = Number(item.min);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return { ok: false, error: `Batas minimal predikat tingkat ${PREDIKAT_KEYS[i]} harus angka 0–100` };
      }
      minVal = Math.round(n);
    }
    out.push({ key: PREDIKAT_KEYS[i], min: minVal, label });
  }
  const strictOrder = (100 - kkm) >= 3;
  if (strictOrder) {
    if (!(100 >= out[0].min && out[0].min > out[1].min && out[1].min > out[2].min && out[2].min > out[3].min)) {
      return { ok: false, error: 'Batas minimal predikat A > B > C > KKM harus terurut menurun tanpa tumpang tindih' };
    }
  } else {
    if (!(100 >= out[0].min && out[0].min >= out[1].min && out[1].min >= out[2].min && out[2].min >= out[3].min)) {
      return { ok: false, error: 'Batas minimal predikat tidak valid terhadap KKM' };
    }
  }
  return { ok: true, value: out };
}

function validateOrigin(request, url) {
  const secFetchSite = String(request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (secFetchSite === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return false;
      return true;
    } catch (_) {
      return false;
    }
  }
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      if (new URL(referer).origin !== url.origin) return false;
      return true;
    } catch (_) {
      return false;
    }
  }
  if (secFetchSite === 'same-site') return false;
  return true;
}

function jsonResponse(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
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

async function getSessionUser(request, env) {
  const token = parseCookies(request).rdp_session;
  if (!token) return null;
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.role, u.displayName, u.teacherId, u.studentId,
           s.createdAt AS sessionCreatedAt, t.active AS teacherActive
    FROM sessions s
    JOIN users u ON u.id = s.userId
    LEFT JOIN teachers t ON t.id = u.teacherId
    WHERE s.token = ?
  `).bind(token).first();
  if (!row) return null;
  const createdMs = Date.parse(row.sessionCreatedAt || '');
  if (!createdMs || Date.now() - createdMs > SESSION_TTL_MS) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  if (row.role === 'guru' && row.teacherId && (row.teacherActive === null || Number(row.teacherActive) === 0)) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
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

async function requireRole(request, env, allowedRoles) {
  const user = await getSessionUser(request, env);
  if (!user) {
    return { error: jsonResponse(401, { error: 'Silahkan login terlebih dahulu' }) };
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return { error: jsonResponse(403, { error: 'Akses ditolak untuk peran ini' }) };
  }
  return { user };
}

async function readJsonBody(request, maxBytes = 15 * 1024 * 1024) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > maxBytes) {
    throw new Error('Payload too large');
  }
  let raw = '';
  if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch (_) {}
        throw new Error('Payload too large');
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    raw = parts.join('');
  } else {
    raw = await request.text();
    if (raw.length > maxBytes) throw new Error('Payload too large');
  }
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('JSON body must be an object');
  }
  return parsed;
}

async function getActivePeriod(db) {
  const row = await db.prepare('SELECT tahun, semester FROM pesantren_profile WHERE id = 1').first();
  return {
    tahun: (row && row.tahun) || '2026/2027',
    semester: (row && row.semester) || 'Ganjil'
  };
}

async function getFullState(db, opts = {}) {
  const omitMedia = Boolean(opts && opts.omitMedia);
  const profileSql = omitMedia
    ? `SELECT id, nama, namaArab, nspp, npsn, alamat, kotaArab, tanggalArab,
              kepala, kepalaArab, tahun, semester, semesterArab, kurikulum,
              kkmDefault, tanggalIso, watermarkType, watermarkText,
              watermarkOpacity, watermarkColor, watermarkSize, watermarkFontSize,
              nomorSkKejuaraan, predikatConfig,
              (length(COALESCE(logoDataUrl, '')) || ':' || substr(COALESCE(logoDataUrl, ''), 1, 24) || ':' ||
               length(COALESCE(watermarkDataUrl, '')) || ':' || substr(COALESCE(watermarkDataUrl, ''), 1, 24)) AS mediaStamp
       FROM pesantren_profile WHERE id = 1`
    : 'SELECT * FROM pesantren_profile WHERE id = 1';
  const p = (await db.prepare(profileSql).first()) || {};
  const logoStr = !omitMedia ? (p.logoDataUrl || '') : '';
  const wmStr = !omitMedia ? (p.watermarkDataUrl || '') : '';
  const mediaStamp = omitMedia
    ? (p.mediaStamp || '0::0:')
    : `${logoStr.length}:${logoStr.slice(0, 24)}:${wmStr.length}:${wmStr.slice(0, 24)}`;
  const activeTahun = p.tahun || '2026/2027';
  const activeSemester = p.semester || 'Ganjil';
  const activeKkm = (p.kkmDefault !== undefined && p.kkmDefault !== null) ? Number(p.kkmDefault) : 75;
  const parsedPred = parseAndValidatePredikatConfig(p.predikatConfig, activeKkm);
  const effectivePredikatConfig = (parsedPred.ok && parsedPred.value)
    ? parsedPred.value
    : buildDefaultPredikatConfig(activeKkm);

  const [clsRes, subRes, tRes, asgRes, apRes, stRes, attRes, scRes, actRes] = await db.batch([
    db.prepare('SELECT * FROM classes WHERE tahun = ? ORDER BY id ASC').bind(activeTahun),
    db.prepare('SELECT * FROM subjects ORDER BY id ASC'),
    db.prepare('SELECT * FROM teachers'),
    db.prepare('SELECT * FROM assignments WHERE tahun = ? ORDER BY id ASC').bind(activeTahun),
    db.prepare('SELECT assignmentId, sent FROM assignment_periods WHERE tahun = ? AND semester = ?').bind(activeTahun, activeSemester),
    db.prepare(`
      SELECT s.*, e.kelas AS enrKelas,
             COALESCE(e.status, 'aktif') AS enrStatus,
             COALESCE(e.mutasiCatatan, '') AS mutasiCatatan,
             COALESCE(e.mutasiTanggal, '') AS mutasiTanggal
      FROM student_enrollments e
      JOIN students s ON s.id = e.studentId
      WHERE e.tahun = ? AND e.semester = ?
      ORDER BY s.id ASC
    `).bind(activeTahun, activeSemester),
    db.prepare('SELECT studentId, sakit, izin, alpa FROM student_attendance WHERE tahun = ? AND semester = ?').bind(activeTahun, activeSemester),
    db.prepare('SELECT studentId, subjectId, score FROM scores WHERE tahun = ? AND semester = ?').bind(activeTahun, activeSemester),
    db.prepare('SELECT user, level, activity, time FROM activities ORDER BY id DESC LIMIT 50')
  ]);

  const classes = clsRes.results || [];
  const subjects = subRes.results || [];
  for (const s of subjects) {
    s.active = s.active === undefined || s.active === null ? true : Boolean(s.active);
  }
  const waliByTeacherId = new Map();
  for (const c of classes) {
    if (c.waliId) waliByTeacherId.set(c.waliId, c.kode);
  }
  const teachers = tRes.results || [];
  for (const t of teachers) {
    t.active = t.active === undefined || t.active === null ? true : Boolean(t.active);
    t.waliKelas = waliByTeacherId.get(t.id) || null;
  }
  const periodSentMap = new Map();
  for (const r of (apRes.results || [])) {
    periodSentMap.set(r.assignmentId, Boolean(r.sent));
  }
  const assignments = asgRes.results || [];
  for (const a of assignments) {
    a.sent = periodSentMap.get(a.id) ?? false;
  }
  const rawStudents = stRes.results || [];
  const attMap = new Map();
  for (const r of (attRes.results || [])) {
    attMap.set(r.studentId, r);
  }
  const rawScores = scRes.results || [];
  const activities = actRes.results || [];

  const scoreMap = new Map();
  for (const row of rawScores) {
    let sm = scoreMap.get(row.studentId);
    if (!sm) {
      sm = {};
      scoreMap.set(row.studentId, sm);
    }
    sm[row.subjectId] = row.score;
  }

  const students = [];
  const mutatedStudents = [];
  for (const st of rawStudents) {
    const att = attMap.get(st.id);
    const enrKelas = st.enrKelas;
    const enrStatus = st.enrStatus || 'aktif';
    const mutCatatan = st.mutasiCatatan || '';
    const mutTanggal = st.mutasiTanggal || '';
    if (enrStatus === 'mutasi_keluar') {
      mutatedStudents.push({
        id: st.id,
        nama: st.nama,
        nis: st.nis,
        nisn: st.nisn,
        jk: st.jk,
        kelas: enrKelas,
        status: 'mutasi_keluar',
        mutasiCatatan: mutCatatan,
        mutasiTanggal: mutTanggal
      });
    } else {
      delete st.enrKelas;
      delete st.enrStatus;
      delete st.mutasiCatatan;
      delete st.mutasiTanggal;
      st.kelas = enrKelas;
      st.status = 'aktif';
      st.sakit = att ? (att.sakit ?? 0) : 0;
      st.izin = att ? (att.izin ?? 0) : 0;
      st.alpa = att ? (att.alpa ?? 0) : 0;
      st.scores = scoreMap.get(st.id) || {};
      students.push(st);
    }
  }

  return {
    pesantren: {
      nama: p.nama || '',
      namaArab: p.namaArab || '',
      nspp: p.nspp || '',
      npsn: p.npsn || '',
      alamat: p.alamat || '',
      kotaArab: p.kotaArab || '',
      tanggalArab: p.tanggalArab || '',
      kepala: p.kepala || '',
      kepalaArab: p.kepalaArab || '',
      tahun: activeTahun,
      semester: activeSemester,
      semesterArab: p.semesterArab || (activeSemester === 'Genap' ? 'الثاني' : 'الأول'),
      kurikulum: p.kurikulum || '',
      ...(omitMedia ? {} : { logoDataUrl: p.logoDataUrl || null }),
      tanggalIso: p.tanggalIso || '2025-12-20',
      watermarkType: p.watermarkType || 'logo',
      watermarkText: p.watermarkText || '',
      ...(omitMedia ? {} : { watermarkDataUrl: p.watermarkDataUrl || null }),
      watermarkOpacity: p.watermarkOpacity ?? 0.08,
      watermarkColor: p.watermarkColor || 'color',
      watermarkSize: Number(p.watermarkSize || 300),
      watermarkFontSize: Number(p.watermarkFontSize || 24),
      nomorSkKejuaraan: p.nomorSkKejuaraan || '001/SK-KEJ/PP-WI/XII/2025',
      predikatConfig: effectivePredikatConfig,
      mediaStamp,
      mediaOmitted: omitMedia
    },
    bobot: { harian: 60, pas: 40, kkm: activeKkm },
    classes,
    subjects,
    teachers,
    assignments,
    students,
    mutatedStudents,
    activities
  };
}

function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  const s = String(v).replace(/\0/g, '').replace(/'/g, "''");
  if (!/[\r\n]/.test(s)) return "'" + s + "'";
  return "'" + s.replace(/\r/g, "'||char(13)||'").replace(/\n/g, "'||char(10)||'") + "'";
}

const utf8Encoder = new TextEncoder();
function emitRowBackupSql(tbl, r, lines) {
  const cols = Object.keys(r);
  const fullLine = `INSERT OR REPLACE INTO ${tbl} (${cols.join(',')}) VALUES (${cols.map(c => sqlLit(r[c])).join(',')});`;
  if (tbl === 'pesantren_profile' && utf8Encoder.encode(fullLine).length > 75000) {
    const bigCols = cols.filter(c => typeof r[c] === 'string' && r[c].length > 25000);
    if (bigCols.length > 0) {
      const bigSet = new Set(bigCols);
      lines.push(`INSERT OR REPLACE INTO ${tbl} (${cols.join(',')}) VALUES (${cols.map(c => bigSet.has(c) ? "''" : sqlLit(r[c])).join(',')});`);
      for (const col of bigCols) {
        const str = r[col];
        for (let i = 0; i < str.length; i += 40000) {
          const piece = str.slice(i, i + 40000);
          lines.push(`UPDATE ${tbl} SET ${col} = COALESCE(${col}, '') || ${sqlLit(piece)} WHERE id = 1;`);
        }
      }
      return;
    }
  }
  lines.push(fullLine);
}

async function runSingleOrChunkedBatch(db, stmts, maxPerBatch = 1000) {
  if (stmts.length === 0) return [];
  if (stmts.length <= maxPerBatch) return await db.batch(stmts);
  const results = [];
  for (let i = 0; i < stmts.length; i += maxPerBatch) {
    const chunk = stmts.slice(i, i + maxPerBatch);
    if (chunk.length > 0) results.push(...(await db.batch(chunk)));
  }
  return results;
}

async function runEntityBatches(db, entityStmtGroups, maxPerBatch = 1000) {
  let batch = [];
  for (const group of entityStmtGroups) {
    if (!group || group.length === 0) continue;
    if (batch.length > 0 && batch.length + group.length > maxPerBatch) {
      await db.batch(batch);
      batch = [];
    }
    if (group.length > maxPerBatch) {
      await db.batch(group);
    } else {
      batch.push(...group);
    }
  }
  if (batch.length > 0) await db.batch(batch);
}

function serveStaticAsset(assetResp, contentType, cacheControl) {
  if (!assetResp.ok && assetResp.status !== 304) return assetResp;
  const headers = new Headers(assetResp.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.set('Cache-Control', cacheControl);
  headers.set('Content-Type', contentType);
  return new Response(assetResp.status === 304 ? null : assetResp.body, { status: assetResp.status, headers });
}

const STATIC_ASSET_CACHE = 'public, max-age=604800, stale-while-revalidate=86400';

async function buildScopedStateForUser(env, user, opts = {}) {
  const omitMedia = Boolean(opts && opts.omitMedia);
  const full = await getFullState(env.DB, { omitMedia });
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
      const [curEnr, archEnr] = await env.DB.batch([
        env.DB.prepare(`
          SELECT kelas, COALESCE(status, 'aktif') AS status, COALESCE(mutasiCatatan, '') AS mutasiCatatan, COALESCE(mutasiTanggal, '') AS mutasiTanggal
          FROM student_enrollments WHERE studentId = ? AND tahun = ? AND semester = ?
        `).bind(sidNum, full.pesantren.tahun, full.pesantren.semester),
        env.DB.prepare(`
          SELECT tahun, semester, kelas
          FROM student_enrollments
          WHERE studentId = ? AND COALESCE(status, 'aktif') = 'aktif'
          ORDER BY tahun DESC, CASE WHEN semester = 'Genap' THEN 2 ELSE 1 END DESC
          LIMIT 1
        `).bind(sidNum)
      ]);
      const curRow = curEnr?.results?.[0] || null;
      const archRow = archEnr?.results?.[0] || null;
      if (archRow) {
        targetTahun = archRow.tahun;
        targetSemester = archRow.semester;
        const [archStRes, archScRes, archAttRes, archClsRes, archAsgRes] = await env.DB.batch([
          env.DB.prepare(`
            SELECT s.*, e.kelas AS enrKelas
            FROM student_enrollments e
            JOIN students s ON s.id = e.studentId
            WHERE e.tahun = ? AND e.semester = ? AND e.kelas = ? AND COALESCE(e.status, 'aktif') = 'aktif'
            ORDER BY s.id ASC
          `).bind(targetTahun, targetSemester, archRow.kelas),
          env.DB.prepare(`
            SELECT sc.studentId, sc.subjectId, sc.score
            FROM scores sc
            JOIN student_enrollments e ON e.studentId = sc.studentId AND e.tahun = sc.tahun AND e.semester = sc.semester
            WHERE sc.tahun = ? AND sc.semester = ? AND e.kelas = ? AND COALESCE(e.status, 'aktif') = 'aktif'
          `).bind(targetTahun, targetSemester, archRow.kelas),
          env.DB.prepare('SELECT sakit, izin, alpa FROM student_attendance WHERE studentId = ? AND tahun = ? AND semester = ?')
            .bind(sidNum, targetTahun, targetSemester),
          env.DB.prepare('SELECT * FROM classes WHERE tahun = ? AND kode = ? LIMIT 1').bind(targetTahun, archRow.kelas),
          env.DB.prepare('SELECT * FROM assignments WHERE tahun = ? AND kode = ?').bind(targetTahun, archRow.kelas)
        ]);
        const archScoreMap = new Map();
        for (const row of (archScRes?.results || [])) {
          if (!archScoreMap.has(row.studentId)) archScoreMap.set(row.studentId, {});
          archScoreMap.get(row.studentId)[row.subjectId] = row.score;
        }
        const archAtt = archAttRes?.results?.[0] || null;
        classPool = (archStRes?.results || []).map(st => {
          const enrKelas = st.enrKelas;
          delete st.enrKelas;
          st.kelas = enrKelas;
          st.sakit = (st.id === sidNum && archAtt) ? (archAtt.sakit ?? 0) : 0;
          st.izin = (st.id === sidNum && archAtt) ? (archAtt.izin ?? 0) : 0;
          st.alpa = (st.id === sidNum && archAtt) ? (archAtt.alpa ?? 0) : 0;
          st.scores = archScoreMap.get(st.id) || {};
          return st;
        });
        myStudent = classPool.find(s => s.id === sidNum) || null;
        myClass = archClsRes?.results?.[0] || null;
        targetAssignments = archAsgRes?.results || [];
        archiveNotice = {
          status: (curRow && curRow.status) || 'mutasi_keluar',
          tahun: full.pesantren.tahun,
          semester: full.pesantren.semester,
          archivedTahun: targetTahun,
          archivedSemester: targetSemester,
          archivedKelas: archRow.kelas,
          mutasiTanggal: (curRow && curRow.mutasiTanggal) || '',
          mutasiCatatan: (curRow && curRow.mutasiCatatan) || ''
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
    return {
      pesantren: full.pesantren,
      bobot: full.bobot,
      classes: myClass ? [myClass] : [],
      subjects: effectiveSubjects,
      teachers: myWali ? [{ id: myWali.id, nama: myWali.nama, namaArab: myWali.namaArab, waliKelas: myWali.waliKelas, active: myWali.active }] : [],
      assignments: [],
      students: scopedStudents,
      mutatedStudents: [],
      activities: []
    };
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

    return {
      pesantren: full.pesantren,
      bobot: full.bobot,
      classes: full.classes.filter(c => allowedClasses.has(c.kode)),
      subjects: full.subjects,
      teachers: scopedTeachers,
      assignments: myAssignments,
      students: scopedStudents,
      mutatedStudents: waliKelas ? (full.mutatedStudents || []).filter(s => s.kelas === waliKelas) : [],
      activities: []
    };
  }
  return full;
}

async function handleRequest(request, env) {
  const method = request.method || 'GET';
  let pathname = '/';

  try {
    const url = new URL(request.url);
    pathname = url.pathname;

    if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!validateOrigin(request, url)) {
        return jsonResponse(403, { error: 'Permintaan lintas origin tidak diizinkan' });
      }
    }

    // Static frontend & vendor assets via Workers Static Assets
    if (method === 'GET' && (pathname === '/' || pathname === '/rdp_pesantren.html')) {
      const assetUrl = new URL('/rdp_pesantren.html', url.origin);
      const assetResp = await env.ASSETS.fetch(new Request(assetUrl, { headers: request.headers }));
      return serveStaticAsset(assetResp, 'text/html; charset=utf-8', 'no-cache');
    }

    if (method === 'GET' && (pathname === '/vendor/xlsx.full.min.js' || pathname === '/vendor/tailwindcss.min.js')) {
      const assetResp = await env.ASSETS.fetch(request);
      return serveStaticAsset(assetResp, 'application/javascript; charset=utf-8', STATIC_ASSET_CACHE);
    }

    if (method === 'GET' && pathname === '/assets/tailwind.min.css') {
      const assetResp = await env.ASSETS.fetch(request);
      return serveStaticAsset(assetResp, 'text/css; charset=utf-8', STATIC_ASSET_CACHE);
    }

    if (method === 'GET' && pathname === '/assets/rdp-sidebar-logo.jpg') {
      const assetResp = await env.ASSETS.fetch(request);
      return serveStaticAsset(assetResp, 'image/jpeg', STATIC_ASSET_CACHE);
    }

    if (method === 'GET' && pathname === '/assets/rdp-icon.png') {
      const assetResp = await env.ASSETS.fetch(request);
      return serveStaticAsset(assetResp, 'image/png', STATIC_ASSET_CACHE);
    }

    // Health check (checks D1 connectivity)
    if (method === 'GET' && pathname === '/api/health') {
      try {
        await env.DB.prepare('SELECT 1 AS ok').first();
        return jsonResponse(200, { ok: true, db: 'ok', timestamp: new Date().toISOString() });
      } catch (e) {
        console.error('[HEALTH CHECK ERROR]', e);
        return jsonResponse(503, { ok: false, db: 'error' });
      }
    }

    // Public branding
    if (method === 'GET' && pathname === '/api/public/branding') {
      const p = (await env.DB.prepare('SELECT nama, namaArab, logoDataUrl, tahun, semester FROM pesantren_profile WHERE id = 1').first()) || {};
      return jsonResponse(200, p, { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' });
    }

      // Auth: Login
      if (method === 'POST' && pathname === '/api/login') {
        const ip = getClientIp(request);
        const { username, password } = await readJsonBody(request, 64 * 1024);
        const uname = String(username || '').trim();
        const pw = String(password || '');
        if (checkLoginRateLimit(ip, uname)) {
          return jsonResponse(429, { error: 'Terlalu banyak percobaan login gagal. Silakan coba lagi dalam 15 menit.' });
        }
        if (!uname || !pw || pw.length > 256) {
          recordLoginFailure(ip, uname);
          return jsonResponse(401, { error: 'Username atau password salah' });
        }
        let userRow = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(uname).first();
        if (!userRow && isValidNuptk(uname)) {
          const teacherByNuptk = await env.DB.prepare('SELECT id FROM teachers WHERE nuptk = ?').bind(uname).first();
          if (teacherByNuptk) {
            userRow = await env.DB.prepare("SELECT * FROM users WHERE role = 'guru' AND teacherId = ? ORDER BY id ASC LIMIT 1").bind(teacherByNuptk.id).first();
          }
        }
        const pwOk = userRow
          ? verifyPassword(pw, userRow.passwordHash)
          : (verifyPassword(pw, DUMMY_PASSWORD_HASH), false);
        if (!userRow || !pwOk) {
          recordLoginFailure(ip, uname);
          return jsonResponse(401, { error: 'Username atau password salah' });
        }
        if (userRow.role === 'guru' && userRow.teacherId) {
          const tRow = await env.DB.prepare('SELECT active FROM teachers WHERE id = ?').bind(userRow.teacherId).first();
          if (!tRow || Number(tRow.active ?? 1) === 0) {
            return jsonResponse(403, { error: 'Akun guru ini sedang dinonaktifkan oleh Proktor/Admin' });
          }
        }
        clearLoginFailures(ip, uname);
        const oldToken = parseCookies(request).rdp_session;
        const token = randomBytes(32).toString('hex');
        const loginStmts = [];
        if (oldToken) loginStmts.push(env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(oldToken));
        if (Math.random() < 0.05) {
          const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
          loginStmts.push(env.DB.prepare('DELETE FROM sessions WHERE createdAt < ?').bind(cutoff));
        }
        loginStmts.push(
          env.DB.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)')
            .bind(token, userRow.id, new Date().toISOString())
        );
        await env.DB.batch(loginStmts);
        const user = {
          id: userRow.id,
          username: userRow.username,
          role: userRow.role,
          displayName: userRow.displayName,
          teacherId: userRow.teacherId,
          studentId: userRow.studentId
        };
        await logActivity(env.DB, user, 'Login ke aplikasi RDP');
        return jsonResponse(200, { ok: true, user }, {
          'Set-Cookie': buildSessionCookie(request, token, SESSION_TTL_SEC)
        });
      }

      // Auth: Logout
      if (method === 'POST' && pathname === '/api/logout') {
        const token = parseCookies(request).rdp_session;
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return jsonResponse(200, { ok: true }, {
          'Set-Cookie': buildSessionCookie(request, '', 0)
        });
      }

      // Auth: Current session
      if (method === 'GET' && pathname === '/api/me') {
        const user = await getSessionUser(request, env);
        return jsonResponse(200, user ? { authenticated: true, user } : { authenticated: false });
      }

      // Single-RTT app bootstrap (returns branding if unauthenticated, or user + scoped state if authenticated)
      if (method === 'GET' && pathname === '/api/bootstrap') {
        const user = await getSessionUser(request, env);
        if (user && ['admin', 'guru', 'siswa'].includes(user.role)) {
          const state = await buildScopedStateForUser(env, user, { omitMedia: false });
          return jsonResponse(200, { authenticated: true, user, state });
        }
        const branding = (await env.DB.prepare('SELECT nama, namaArab, logoDataUrl, tahun, semester FROM pesantren_profile WHERE id = 1').first()) || {};
        return jsonResponse(200, { authenticated: false, branding });
      }

      // Auth: Change own password (rotates session token, with throttling)
      if (method === 'PUT' && pathname === '/api/me/password') {
        const { user, error } = await requireRole(request, env, ['admin', 'guru', 'siswa']);
        if (error) return error;
        if (checkPwChangeRateLimit(user.id)) {
          return jsonResponse(429, { error: 'Terlalu banyak percobaan ubah password gagal. Coba lagi dalam 15 menit.' });
        }
        const { oldPassword, newPassword } = await readJsonBody(request, 64 * 1024);
        const oldPw = String(oldPassword ?? '');
        const newPw = String(newPassword ?? '');
        if (!oldPw || !newPw.trim()) {
          return jsonResponse(400, { error: 'Password lama dan password baru wajib diisi' });
        }
        if (newPw.trim().length < 6 || newPw.length > 256) {
          return jsonResponse(400, { error: 'Password baru minimal 6 karakter (tanpa spasi saja)' });
        }
        const row = await env.DB.prepare('SELECT id, passwordHash FROM users WHERE id = ?').bind(user.id).first();
        if (!row || !verifyPassword(oldPw, row.passwordHash)) {
          recordPwChangeFailure(user.id);
          return jsonResponse(400, { error: 'Password lama tidak sesuai' });
        }
        clearPwChangeFailures(user.id);
        const newToken = randomBytes(32).toString('hex');
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').bind(hashPassword(newPw), user.id),
          env.DB.prepare('DELETE FROM sessions WHERE userId = ?').bind(user.id),
          env.DB.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)').bind(newToken, user.id, new Date().toISOString())
        ]);
        return jsonResponse(200, { ok: true }, {
          'Set-Cookie': buildSessionCookie(request, newToken, SESSION_TTL_SEC)
        });
      }

      // Users management (Admin only)
      if (method === 'GET' && pathname === '/api/users') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const res = await env.DB.prepare('SELECT id, username, role, displayName, teacherId, studentId FROM users ORDER BY id ASC').all();
        return jsonResponse(200, { users: res.results || [] });
      }

      if (method === 'POST' && pathname === '/api/users') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const { username, password, role, displayName, teacherId, studentId } = await readJsonBody(request);
        const cleanUsername = String(username ?? '').trim();
        const cleanPassword = String(password ?? '');
        const cleanDisplay = String(displayName ?? '').trim();
        if (!cleanUsername || !cleanPassword.trim() || !role || !cleanDisplay) {
          return jsonResponse(400, { error: 'Data akun belum lengkap' });
        }
        if (cleanPassword.trim().length < 6 || cleanPassword.length > 256) {
          return jsonResponse(400, { error: 'Password minimal 6 karakter' });
        }
        if (!['admin', 'guru', 'siswa'].includes(role)) {
          return jsonResponse(400, { error: 'Role tidak valid' });
        }
        let linkedTeacherId = null;
        let linkedStudentId = null;
        if (role === 'guru') {
          const cleanTid = String(teacherId ?? '').trim();
          const tRow = cleanTid ? await env.DB.prepare('SELECT id, active FROM teachers WHERE id = ?').bind(cleanTid).first() : null;
          if (!tRow || Number(tRow.active ?? 1) === 0) {
            return jsonResponse(400, { error: 'Guru tidak ditemukan atau sedang nonaktif' });
          }
          linkedTeacherId = cleanTid;
        } else if (role === 'siswa') {
          const isPosInt = studentId !== null && studentId !== undefined && typeof studentId !== 'boolean' &&
            String(studentId).trim() !== '' && Number.isInteger(Number(studentId)) && Number(studentId) > 0;
          const numSid = Number(studentId);
          const sExists = isPosInt ? await env.DB.prepare('SELECT id FROM students WHERE id = ?').bind(numSid).first() : null;
          if (!sExists) return jsonResponse(400, { error: 'Pilih santri yang valid untuk akun Siswa' });
          linkedStudentId = numSid;
        }
        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(cleanUsername).first();
        if (existing) return jsonResponse(409, { error: 'Username sudah digunakan' });
        const info = await env.DB.prepare(`
          INSERT INTO users (username, passwordHash, role, displayName, teacherId, studentId)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          cleanUsername,
          hashPassword(cleanPassword),
          role,
          cleanDisplay,
          linkedTeacherId,
          linkedStudentId
        ).run();
        return jsonResponse(201, { ok: true, id: Number(info.meta?.last_row_id || 0) });
      }

      const userPassMatch = pathname.match(/^\/api\/users\/(\d+)\/password$/);
      if (method === 'PUT' && userPassMatch) {
        const { user: current, error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const uid = Number(userPassMatch[1]);
        const targetUser = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(uid).first();
        if (!targetUser) return jsonResponse(404, { error: 'Akun pengguna tidak ditemukan' });
        const { password } = await readJsonBody(request, 64 * 1024);
        const cleanPw = String(password ?? '');
        if (!cleanPw.trim() || cleanPw.trim().length < 6 || cleanPw.length > 256) {
          return jsonResponse(400, { error: 'Password baru minimal 6 karakter' });
        }
        const isSelfReset = uid === current.id;
        const newToken = isSelfReset ? randomBytes(32).toString('hex') : null;
        const stmts = [
          env.DB.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').bind(hashPassword(cleanPw), uid),
          env.DB.prepare('DELETE FROM sessions WHERE userId = ?').bind(uid)
        ];
        if (isSelfReset && newToken) {
          stmts.push(
            env.DB.prepare('INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)').bind(newToken, uid, new Date().toISOString())
          );
        }
        await env.DB.batch(stmts);
        if (isSelfReset && newToken) {
          return jsonResponse(200, { ok: true }, { 'Set-Cookie': buildSessionCookie(request, newToken, SESSION_TTL_SEC) });
        }
        return jsonResponse(200, { ok: true });
      }

      const userDelMatch = pathname.match(/^\/api\/users\/(\d+)$/);
      if (method === 'DELETE' && userDelMatch) {
        const { user: current, error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const uid = Number(userDelMatch[1]);
        if (uid === current.id) return jsonResponse(400, { error: 'Tidak dapat menghapus akun yang sedang aktif' });
        await env.DB.batch([
          env.DB.prepare('DELETE FROM sessions WHERE userId = ?').bind(uid),
          env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid)
        ]);
        return jsonResponse(200, { ok: true });
      }

      // Full state hydration (scoped by role)
      if (method === 'GET' && pathname === '/api/state') {
        const { user, error } = await requireRole(request, env, ['admin', 'guru', 'siswa']);
        if (error) return error;
        const omitMedia = url.searchParams.get('omitMedia') === '1';
        const state = await buildScopedStateForUser(env, user, { omitMedia });
        return jsonResponse(200, state);
      }

      // Backup database as SQL dump (D1 compatible — NO BEGIN/COMMIT; chunked lines < 80 KB; excludes sessions)
      if (method === 'GET' && pathname === '/api/backup/db') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const tables = ['pesantren_profile', 'classes', 'subjects', 'teachers', 'assignments', 'assignment_periods', 'students', 'student_enrollments', 'student_attendance', 'scores', 'activities', 'users'];
        const results = await env.DB.batch(tables.map(t => env.DB.prepare(`SELECT * FROM ${t}`)));
        const lines = [`-- RDP D1 SQL Backup (${new Date().toISOString()})`];
        tables.forEach((tbl, idx) => {
          const rows = results[idx]?.results || [];
          for (const r of rows) {
            emitRowBackupSql(tbl, r, lines);
          }
        });
        return new Response(lines.join('\n'), {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-store',
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': 'attachment; filename="rdp_backup.sql"'
          }
        });
      }

      // Update Pesantren profile / settings
      if (method === 'PUT' && pathname === '/api/pesantren') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const body = await readJsonBody(request);
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
              return jsonResponse(400, { error: `Format gambar ${imgField} tidak valid atau terlalu besar (maks 750 KB, PNG/JPG/WebP/GIF)` });
            }
          }
        }
        if (Object.prototype.hasOwnProperty.call(body, 'logoDataUrl') || Object.prototype.hasOwnProperty.call(body, 'watermarkDataUrl')) {
          const curImgs = (await env.DB.prepare('SELECT logoDataUrl, watermarkDataUrl FROM pesantren_profile WHERE id = 1').first()) || {};
          const nextLogo = Object.prototype.hasOwnProperty.call(body, 'logoDataUrl') ? (body.logoDataUrl || '') : (curImgs.logoDataUrl || '');
          const nextWm = Object.prototype.hasOwnProperty.call(body, 'watermarkDataUrl') ? (body.watermarkDataUrl || '') : (curImgs.watermarkDataUrl || '');
          if (String(nextLogo).length + String(nextWm).length > 1500000) {
            return jsonResponse(400, { error: 'Total ukuran gabungan Logo + Watermark melebihi batas D1 (maks 1.5 MB)' });
          }
        }
        const sets = [];
        const vals = [];
        const hasKkm = Object.prototype.hasOwnProperty.call(body, 'kkmDefault');
        const hasPred = Object.prototype.hasOwnProperty.call(body, 'predikatConfig');
        let curProf = null;
        if (hasKkm || hasPred) {
          curProf = (await env.DB.prepare('SELECT kkmDefault, predikatConfig FROM pesantren_profile WHERE id = 1').first()) || {};
        }
        let effectiveKkm = (curProf && curProf.kkmDefault !== undefined && curProf.kkmDefault !== null) ? Number(curProf.kkmDefault) : 75;
        if (hasKkm) {
          const parsedKkm = parseBoundedInt(body.kkmDefault, 0, 100);
          if (parsedKkm === null) {
            return jsonResponse(400, { error: 'Kolom kkmDefault harus berupa angka bulat 0–100' });
          }
          effectiveKkm = parsedKkm;
        }
        if (hasPred) {
          const parsedPred = parseAndValidatePredikatConfig(body.predikatConfig, effectiveKkm);
          if (!parsedPred.ok) {
            return jsonResponse(400, { error: parsedPred.error });
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
              return jsonResponse(400, { error: `Format kolom ${key} tidak valid` });
            }
            if (requiredNonEmpty.has(key)) {
              const cleanStr = String(rawVal ?? '').trim();
              if (!cleanStr) return jsonResponse(400, { error: `Kolom ${key} tidak boleh kosong` });
              sets.push(`${key} = ?`);
              vals.push(cleanStr);
              continue;
            }
            if (key === 'tahun') {
              const cleanTahun = String(rawVal ?? '').trim();
              if (!cleanTahun || cleanTahun.length < 4 || cleanTahun.length > 32) {
                return jsonResponse(400, { error: 'Tahun pelajaran tidak valid (4–32 karakter)' });
              }
              sets.push('tahun = ?');
              vals.push(cleanTahun);
              continue;
            }
            if (key === 'semester') {
              const semStr = String(rawVal ?? '').trim();
              if (!['Ganjil', 'Genap'].includes(semStr)) {
                return jsonResponse(400, { error: 'Semester harus Ganjil atau Genap' });
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
                return jsonResponse(400, { error: `Kolom ${key} harus berupa angka bulat ${minV}–${maxV}` });
              }
              sets.push(`${key} = ?`);
              vals.push(parsed);
              continue;
            }
            if (key === 'watermarkOpacity') {
              const op = parseBoundedNumber(rawVal, 0, 1);
              if (op === null) {
                return jsonResponse(400, { error: 'Kolom watermarkOpacity harus berupa angka 0–1' });
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
          await env.DB.prepare(`UPDATE pesantren_profile SET ${sets.join(', ')} WHERE id = 1`).bind(...vals).run();
        }
        const effectivePeriod = await getActivePeriod(env.DB);
        if (effectivePeriod.semester === 'Genap') {
          const carryInfo = await env.DB.prepare(`
            INSERT OR IGNORE INTO student_enrollments
              (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
            SELECT studentId, tahun, 'Genap', kelas, 'aktif', '', '', 0, 0, 0
            FROM student_enrollments
            WHERE tahun = ? AND semester = 'Ganjil' AND COALESCE(status, 'aktif') = 'aktif'
          `).bind(effectivePeriod.tahun).run();
          carriedOver = Number(carryInfo.meta?.changes || 0);
        }
        return jsonResponse(200, { ok: true, carriedOver });
      }

      // Classes: Copy from another academic year into active year
      if (method === 'POST' && pathname === '/api/classes/copy') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const { fromTahun } = await readJsonBody(request);
        const srcTahun = String(fromTahun || '').trim();
        const { tahun: activeTahun } = await getActivePeriod(env.DB);
        if (!srcTahun) return jsonResponse(400, { error: 'Tahun sumber wajib dipilih' });
        if (srcTahun === activeTahun) return jsonResponse(400, { error: 'Tahun sumber tidak boleh sama dengan tahun aktif' });
        const [srcRes, existRes] = await env.DB.batch([
          env.DB.prepare('SELECT kode, tingkat, kurikulum FROM classes WHERE tahun = ? ORDER BY id ASC').bind(srcTahun),
          env.DB.prepare('SELECT kode FROM classes WHERE tahun = ?').bind(activeTahun)
        ]);
        const existingKodes = new Set((existRes.results || []).map(r => r.kode));
        const srcClasses = srcRes.results || [];
        const stmts = [];
        let copied = 0;
        for (const c of srcClasses) {
          if (existingKodes.has(c.kode)) continue;
          existingKodes.add(c.kode);
          stmts.push(
            env.DB.prepare('INSERT OR IGNORE INTO classes (tahun, kode, tingkat, waliId, kurikulum) VALUES (?, ?, ?, NULL, ?)')
              .bind(activeTahun, c.kode, c.tingkat, c.kurikulum || 'Kurikulum Pesantren')
          );
          copied++;
        }
        await runSingleOrChunkedBatch(env.DB, stmts);
        return jsonResponse(201, { ok: true, copied, fromTahun: srcTahun, toTahun: activeTahun });
      }

      // Classes: Add
      if (method === 'POST' && pathname === '/api/classes') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const { kode, tingkat, waliId, kurikulum } = await readJsonBody(request);
        const cleanKode = String(kode || '').trim();
        const cleanTingkat = String(tingkat || '').trim();
        if (!cleanKode || !cleanTingkat) {
          return jsonResponse(400, { error: 'Kode kelas dan tingkat wajib diisi' });
        }
        const cleanWali = waliId ? String(waliId).trim() : null;
        if (cleanWali) {
          const tRow = await env.DB.prepare('SELECT id, active FROM teachers WHERE id = ?').bind(cleanWali).first();
          if (!tRow || Number(tRow.active ?? 1) === 0) {
            return jsonResponse(400, { error: 'Wali kelas tidak ditemukan atau sedang nonaktif' });
          }
        }
        const { tahun: activeTahun } = await getActivePeriod(env.DB);
        const dup = await env.DB.prepare('SELECT id FROM classes WHERE tahun = ? AND kode = ?').bind(activeTahun, cleanKode).first();
        if (dup) {
          return jsonResponse(409, { error: `Kode kelas "${cleanKode}" sudah terdaftar di tahun ${activeTahun}` });
        }
        const stmts = [];
        if (cleanWali) {
          stmts.push(env.DB.prepare('UPDATE classes SET waliId = NULL WHERE tahun = ? AND waliId = ?').bind(activeTahun, cleanWali));
        }
        stmts.push(
          env.DB.prepare('INSERT INTO classes (tahun, kode, tingkat, waliId, kurikulum) VALUES (?, ?, ?, ?, ?)')
            .bind(activeTahun, cleanKode, cleanTingkat, cleanWali, kurikulum || 'Kurikulum Pesantren')
        );
        const batchRes = await env.DB.batch(stmts);
        const insInfo = batchRes[batchRes.length - 1];
        const classId = Number(insInfo?.meta?.last_row_id || 0);
        return jsonResponse(201, { ok: true, id: classId });
      }

      // Classes: Assign Wali Kelas
      const waliMatch = pathname.match(/^\/api\/classes\/(\d+)\/wali$/);
      if (method === 'PUT' && waliMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const classId = Number(waliMatch[1]);
        const { waliId } = await readJsonBody(request);
        const cls = await env.DB.prepare('SELECT * FROM classes WHERE id = ?').bind(classId).first();
        if (!cls) return jsonResponse(404, { error: 'Class not found' });
        const cleanWali = waliId ? String(waliId).trim() : null;
        if (cleanWali) {
          const tRow = await env.DB.prepare('SELECT id, active FROM teachers WHERE id = ?').bind(cleanWali).first();
          if (!tRow || Number(tRow.active ?? 1) === 0) {
            return jsonResponse(400, { error: 'Guru wali kelas tidak ditemukan atau sedang nonaktif' });
          }
          await env.DB.batch([
            env.DB.prepare('UPDATE classes SET waliId = NULL WHERE tahun = ? AND id != ? AND waliId = ?').bind(cls.tahun, classId, cleanWali),
            env.DB.prepare('UPDATE classes SET waliId = ? WHERE id = ?').bind(cleanWali, classId)
          ]);
        } else {
          await env.DB.prepare('UPDATE classes SET waliId = NULL WHERE id = ?').bind(classId).run();
        }
        return jsonResponse(200, { ok: true });
      }

      // Classes: Delete
      const classDelMatch = pathname.match(/^\/api\/classes\/(\d+)$/);
      if (method === 'DELETE' && classDelMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const classId = Number(classDelMatch[1]);
        const cls = await env.DB.prepare('SELECT * FROM classes WHERE id = ?').bind(classId).first();
        if (!cls) return jsonResponse(404, { error: 'Kelas tidak ditemukan' });
        const stRow = await env.DB.prepare("SELECT COUNT(*) AS cnt FROM student_enrollments WHERE tahun = ? AND kelas = ? AND COALESCE(status, 'aktif') = 'aktif'").bind(cls.tahun, cls.kode).first();
        const stCount = Number(stRow?.cnt || 0);
        if (stCount > 0) {
          return jsonResponse(409, { error: `Kelas ${cls.kode} masih memiliki ${stCount} santri di tahun ${cls.tahun}. Hapus atau pindahkan santri terlebih dahulu.` });
        }
        await env.DB.batch([
          env.DB.prepare('UPDATE teachers SET waliKelas = NULL WHERE waliKelas = ? OR id = ?').bind(cls.kode, cls.waliId || ''),
          env.DB.prepare('DELETE FROM assignment_periods WHERE assignmentId IN (SELECT id FROM assignments WHERE tahun = ? AND kode = ?)').bind(cls.tahun, cls.kode),
          env.DB.prepare('DELETE FROM assignments WHERE tahun = ? AND kode = ?').bind(cls.tahun, cls.kode),
          env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(classId)
        ]);
        return jsonResponse(200, { ok: true });
      }

      // Teachers: Add one or bulk (live Map sync, UUID IDs, guard all other accounts, entity-atomic)
      if (method === 'POST' && pathname === '/api/teachers') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const body = await readJsonBody(request);
        const isBulk = Array.isArray(body.teachers);
        const list = (isBulk ? body.teachers : [body]).filter(x => x && typeof x === 'object');

        if (!isBulk && list.length === 1) {
          const nuptkSingle = String(list[0].nuptk || '').trim();
          if (nuptkSingle && !isValidNuptk(nuptkSingle)) {
            return jsonResponse(400, { error: 'NUPTK harus berupa angka 6–30 digit (tidak boleh semua nol)' });
          }
          if (isValidNuptk(nuptkSingle)) {
            const [hit, existingT] = await env.DB.batch([
              env.DB.prepare('SELECT id, role, teacherId FROM users WHERE username = ?').bind(nuptkSingle),
              env.DB.prepare('SELECT id FROM teachers WHERE nuptk = ?').bind(nuptkSingle)
            ]);
            if (existingT.results?.length) {
              return jsonResponse(409, { error: `NUPTK "${nuptkSingle}" sudah terdaftar pada data guru` });
            }
            if (hit.results?.length) {
              return jsonResponse(409, { error: `NUPTK / username "${nuptkSingle}" sudah dipakai oleh akun lain` });
            }
          }
          const pwSingle = list[0].password !== undefined && list[0].password !== null ? String(list[0].password) : '';
          if (pwSingle && (pwSingle.trim().length < 6 || pwSingle.length > 256)) {
            return jsonResponse(400, { error: 'Password guru minimal 6 karakter' });
          }
        }

        // Pre-validate passwords & cap custom passwords per batch (default 'guru123' memakai hash terkomputasi awal)
        let explicitPwCount = 0;
        for (const t of list) {
          const nama = String(t.nama || '').trim();
          if (!nama) continue;
          const rawPw = (t.password !== undefined && t.password !== null) ? String(t.password) : '';
          if (rawPw !== '') {
            if (rawPw.trim().length < 6 || rawPw.length > 256) {
              return jsonResponse(400, { error: `Password untuk guru "${nama}" minimal 6 karakter (maks 256)` });
            }
            if (rawPw !== 'guru123') {
              explicitPwCount++;
              if (isBulk && explicitPwCount > 25) {
                return jsonResponse(400, { error: 'Maksimal 25 password kustom per upload massal guru' });
              }
            }
          }
        }
        const defaultGuruHash = DEFAULT_GURU_PASSWORD_HASH;
        const resolveTeacherPwHash = (pw) => (pw === 'guru123' ? DEFAULT_GURU_PASSWORD_HASH : hashPassword(pw));

        const [tRes, uRes] = await env.DB.batch([
          env.DB.prepare('SELECT id, nuptk, waliKelas FROM teachers'),
          env.DB.prepare('SELECT id, username, role, teacherId FROM users ORDER BY id ASC')
        ]);
        const teacherByNuptk = new Map();
        const teacherById = new Map();
        for (const row of (tRes.results || [])) {
          if (isValidNuptk(row.nuptk)) teacherByNuptk.set(row.nuptk, row);
          teacherById.set(row.id, row);
        }
        const userByTeacher = new Map();
        const userByUsername = new Map();
        for (const u of (uRes.results || [])) {
          if (u.role === 'guru' && u.teacherId && !userByTeacher.has(u.teacherId)) userByTeacher.set(u.teacherId, u);
          userByUsername.set(u.username, u);
        }

        const skippedConflicts = [];
        const groups = [];
        let processed = 0;
        let lastTid = null;
        let lastUname = null;
        for (const t of list) {
          const nama = String(t.nama || '').trim();
          if (!nama) continue;
          const gStmts = [];
          const nuptkRaw = String(t.nuptk || '').trim();
          const validNuptk = isValidNuptk(nuptkRaw) ? nuptkRaw : '';
          const existingTeacher = (validNuptk ? teacherByNuptk.get(validNuptk) : null) || (t.id ? teacherById.get(String(t.id)) : null);
          const tid = (existingTeacher && existingTeacher.id) || ('t_' + randomUUID().replace(/-/g, '').slice(0, 16));
          lastTid = tid;
          const keptWali = t.waliKelas || (existingTeacher && existingTeacher.waliKelas) || null;

          // Keep Maps in sync across bulk rows
          const cachedT = { id: tid, nuptk: validNuptk || (existingTeacher?.nuptk || ''), waliKelas: keptWali };
          teacherById.set(tid, cachedT);
          if (validNuptk) teacherByNuptk.set(validNuptk, cachedT);

          gStmts.push(
            env.DB.prepare(`
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
            `).bind(
              tid, nama, String(t.namaArab || nama).trim(), String(t.initials || '').trim(),
              String(t.role || 'Guru / Ustadz').trim(), validNuptk, String(t.nip || '-').trim(),
              String(t.ttl || '-').trim(), String(t.pendidikan || 'S1').trim(),
              keptWali, Number(t.jumlahSiswa) || 0, t.ekskul || null
            )
          );
          processed++;

          const existingByTeacher = userByTeacher.get(tid);
          let uname = validNuptk || (existingByTeacher ? existingByTeacher.username : tid);
          const rawPw = (t.password !== undefined && t.password !== null) ? String(t.password) : '';
          const explicitPw = (rawPw.trim().length >= 6 && rawPw.length <= 256) ? rawPw : null;

          let existingByUsername = userByUsername.get(uname);

          // Guard against overwriting non-guru, another teacher's account, or second account of same teacher
          const isUsernameCollision = (u) => Boolean(
            u && (u.role !== 'guru' || u.teacherId !== tid || (existingByTeacher && u !== existingByTeacher && u.id !== existingByTeacher.id))
          );
          if (isUsernameCollision(existingByUsername)) {
            skippedConflicts.push(uname);
            uname = existingByTeacher ? existingByTeacher.username : tid;
            existingByUsername = userByUsername.get(uname);
            if (isUsernameCollision(existingByUsername)) {
              groups.push(gStmts);
              continue;
            }
          }
          lastUname = uname;

          if (existingByTeacher) {
            if (existingByTeacher.username !== uname) {
              userByUsername.delete(existingByTeacher.username);
              existingByTeacher.username = uname;
              userByUsername.set(uname, existingByTeacher);
            }
            if (existingByTeacher.id === null || existingByTeacher.id === undefined) {
              if (explicitPw) {
                gStmts.push(
                  env.DB.prepare("UPDATE users SET username = ?, passwordHash = ?, displayName = ? WHERE role = 'guru' AND teacherId = ?")
                    .bind(uname, resolveTeacherPwHash(explicitPw), nama, tid)
                );
              } else {
                gStmts.push(
                  env.DB.prepare("UPDATE users SET username = ?, displayName = ? WHERE role = 'guru' AND teacherId = ?")
                    .bind(uname, nama, tid)
                );
              }
            } else if (explicitPw) {
              gStmts.push(
                env.DB.prepare('UPDATE users SET username = ?, passwordHash = ?, displayName = ?, teacherId = ? WHERE id = ?')
                  .bind(uname, resolveTeacherPwHash(explicitPw), nama, tid, existingByTeacher.id),
                env.DB.prepare('DELETE FROM sessions WHERE userId = ?').bind(existingByTeacher.id)
              );
            } else {
              gStmts.push(
                env.DB.prepare('UPDATE users SET username = ?, displayName = ?, teacherId = ? WHERE id = ?')
                  .bind(uname, nama, tid, existingByTeacher.id)
              );
            }
          } else if (existingByUsername && existingByUsername.role === 'guru' && existingByUsername.teacherId === tid) {
            userByTeacher.set(tid, existingByUsername);
            if (existingByUsername.id === null || existingByUsername.id === undefined) {
              if (explicitPw) {
                gStmts.push(
                  env.DB.prepare("UPDATE users SET username = ?, passwordHash = ?, displayName = ? WHERE role = 'guru' AND teacherId = ?")
                    .bind(uname, resolveTeacherPwHash(explicitPw), nama, tid)
                );
              } else {
                gStmts.push(
                  env.DB.prepare("UPDATE users SET username = ?, displayName = ? WHERE role = 'guru' AND teacherId = ?")
                    .bind(uname, nama, tid)
                );
              }
            } else if (explicitPw) {
              gStmts.push(
                env.DB.prepare('UPDATE users SET username = ?, passwordHash = ?, displayName = ?, teacherId = ? WHERE id = ?')
                  .bind(uname, resolveTeacherPwHash(explicitPw), nama, tid, existingByUsername.id),
                env.DB.prepare('DELETE FROM sessions WHERE userId = ?').bind(existingByUsername.id)
              );
            } else {
              gStmts.push(
                env.DB.prepare('UPDATE users SET username = ?, displayName = ?, teacherId = ? WHERE id = ?')
                  .bind(uname, nama, tid, existingByUsername.id)
              );
            }
          } else if (!existingByUsername) {
            const syntheticUser = { id: null, username: uname, role: 'guru', teacherId: tid };
            userByUsername.set(uname, syntheticUser);
            userByTeacher.set(tid, syntheticUser);
            gStmts.push(
              env.DB.prepare(`
                INSERT OR IGNORE INTO users (username, passwordHash, role, displayName, teacherId, studentId)
                VALUES (?, ?, 'guru', ?, ?, NULL)
              `).bind(uname, explicitPw ? resolveTeacherPwHash(explicitPw) : defaultGuruHash, nama, tid)
            );
          }
          groups.push(gStmts);
        }
        await runEntityBatches(env.DB, groups, 1000);
        return jsonResponse(201, { ok: true, id: lastTid, username: lastUname, count: processed, skippedConflicts });
      }

      // Teachers: Toggle Active / Nonaktif
      const teacherActiveMatch = pathname.match(/^\/api\/teachers\/([^/]+)\/active$/);
      if (method === 'PUT' && teacherActiveMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const teacherId = decodeURIComponent(teacherActiveMatch[1]);
        const exists = await env.DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(teacherId).first();
        if (!exists) return jsonResponse(404, { error: 'Guru tidak ditemukan' });
        const { active } = await readJsonBody(request);
        if (typeof active !== 'boolean') {
          return jsonResponse(400, { error: 'Status active harus berupa boolean (true/false)' });
        }
        const activeVal = active ? 1 : 0;
        const stmts = [env.DB.prepare('UPDATE teachers SET active = ? WHERE id = ?').bind(activeVal, teacherId)];
        if (activeVal === 0) {
          stmts.push(env.DB.prepare("DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE role = 'guru' AND teacherId = ?)").bind(teacherId));
        }
        await env.DB.batch(stmts);
        return jsonResponse(200, { ok: true, active: Boolean(activeVal) });
      }

      // Teachers: Update / Delete
      const teacherMatch = pathname.match(/^\/api\/teachers\/([^/]+)$/);
      if (method === 'PUT' && teacherMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const teacherId = decodeURIComponent(teacherMatch[1]);
        const exists = await env.DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(teacherId).first();
        if (!exists) return jsonResponse(404, { error: 'Guru tidak ditemukan' });
        const body = await readJsonBody(request);
        if (body.password !== undefined && body.password !== null && String(body.password) !== '') {
          if (typeof body.password === 'object') {
            return jsonResponse(400, { error: 'Format password tidak valid' });
          }
          const cleanPw = String(body.password);
          if (cleanPw.trim().length < 6 || cleanPw.length > 256) {
            return jsonResponse(400, { error: 'Password baru minimal 6 karakter' });
          }
        }
        const allowed = ['nama', 'namaArab', 'nuptk', 'nip', 'ttl', 'pendidikan', 'role'];
        const sets = [];
        const vals = [];
        let validUpdatedNuptk = null;
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(body, key)) {
            const rawField = body[key];
            if (rawField !== null && typeof rawField === 'object') {
              return jsonResponse(400, { error: `Format kolom ${key} tidak valid` });
            }
            let val = String(rawField ?? '').trim();
            if ((key === 'nama' || key === 'namaArab') && !val) {
              return jsonResponse(400, { error: `Kolom ${key} tidak boleh kosong` });
            }
            if (key === 'nuptk') {
              if (val === '' || val === '-') {
                val = '';
              } else {
                if (!isValidNuptk(val)) {
                  return jsonResponse(400, { error: 'NUPTK harus berupa angka 6–30 digit (atau kosong/- untuk menghapus)' });
                }
                const [tConf, uConf] = await env.DB.batch([
                  env.DB.prepare('SELECT id FROM teachers WHERE nuptk = ? AND id != ?').bind(val, teacherId),
                  env.DB.prepare('SELECT id FROM users WHERE username = ? AND (teacherId IS NULL OR teacherId != ?)').bind(val, teacherId)
                ]);
                if ((tConf.results?.length || 0) > 0 || (uConf.results?.length || 0) > 0) {
                  return jsonResponse(409, { error: `NUPTK / username "${val}" sudah digunakan guru/akun lain` });
                }
                validUpdatedNuptk = val;
              }
            }
            sets.push(`${key} = ?`);
            vals.push(val);
          }
        }
        const stmts = [];
        if (sets.length > 0) {
          vals.push(teacherId);
          stmts.push(env.DB.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`).bind(...vals));
        }
        if (body.nama && String(body.nama).trim()) {
          stmts.push(env.DB.prepare("UPDATE users SET displayName = ? WHERE role = 'guru' AND teacherId = ?").bind(String(body.nama).trim(), teacherId));
        }
        if (validUpdatedNuptk) {
          const primaryUser = await env.DB.prepare("SELECT id FROM users WHERE role = 'guru' AND teacherId = ? ORDER BY id ASC LIMIT 1").bind(teacherId).first();
          if (primaryUser) {
            const sameOwnerHit = await env.DB.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(validUpdatedNuptk, primaryUser.id).first();
            if (!sameOwnerHit) {
              stmts.push(env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(validUpdatedNuptk, primaryUser.id));
            }
          }
        }
        if (body.password && String(body.password).trim()) {
          stmts.push(
            env.DB.prepare("UPDATE users SET passwordHash = ? WHERE role = 'guru' AND teacherId = ?").bind(hashPassword(String(body.password)), teacherId),
            env.DB.prepare("DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE role = 'guru' AND teacherId = ?)").bind(teacherId)
          );
        }
        if (stmts.length > 0) await env.DB.batch(stmts);
        return jsonResponse(200, { ok: true });
      }

      if (method === 'DELETE' && teacherMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const teacherId = decodeURIComponent(teacherMatch[1]);
        const [exRes, asgRes, waliRes] = await env.DB.batch([
          env.DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(teacherId),
          env.DB.prepare('SELECT COUNT(*) AS cnt FROM assignments WHERE teacherId = ?').bind(teacherId),
          env.DB.prepare('SELECT COUNT(*) AS cnt FROM classes WHERE waliId = ?').bind(teacherId)
        ]);
        if (!exRes.results?.length) return jsonResponse(404, { error: 'Guru tidak ditemukan' });
        if (Number(asgRes.results?.[0]?.cnt || 0) > 0 || Number(waliRes.results?.[0]?.cnt || 0) > 0) {
          return jsonResponse(409, {
            error: 'Guru masih memiliki riwayat penugasan/wali kelas. Gunakan tombol "Nonaktifkan" agar arsip nilai & rapor tahun lalu tetap aman.'
          });
        }
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE role = 'guru' AND teacherId = ?)").bind(teacherId),
          env.DB.prepare("DELETE FROM users WHERE role = 'guru' AND teacherId = ?").bind(teacherId),
          env.DB.prepare('DELETE FROM teachers WHERE id = ?').bind(teacherId)
        ]);
        return jsonResponse(200, { ok: true });
      }

      // Subjects: Add
      if (method === 'POST' && pathname === '/api/subjects') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const s = await readJsonBody(request);
        const namaArab = String(s.namaArab || '').trim();
        const namaId = String(s.namaId || '').trim();
        if (!namaArab || !namaId) {
          return jsonResponse(400, { error: 'Nama mata pelajaran (Arab & Indonesia) wajib diisi' });
        }
        const dupSub = await env.DB.prepare('SELECT id FROM subjects WHERE LOWER(TRIM(namaArab)) = LOWER(?)').bind(namaArab).first();
        if (dupSub) {
          return jsonResponse(409, { error: `Mata pelajaran "${namaArab}" sudah terdaftar` });
        }
        const kelompok = ['umum', 'syari'].includes(s.kelompok) ? s.kelompok : 'syari';
        let jam = 2;
        if (s.jam !== undefined) {
          const parsedJam = parseBoundedInt(s.jam, 1, 30);
          if (parsedJam === null) return jsonResponse(400, { error: 'Jam pelajaran harus angka 1–30' });
          jam = parsedJam;
        }
        let kkm = 75;
        if (s.kkm !== undefined) {
          const parsedKkm = parseBoundedInt(s.kkm, 0, 100);
          if (parsedKkm === null) return jsonResponse(400, { error: 'KKM harus angka 0–100' });
          kkm = parsedKkm;
        }
        const info = await env.DB.prepare('INSERT INTO subjects (kelompok, namaArab, namaId, jam, kkm, active) VALUES (?, ?, ?, ?, ?, 1)')
          .bind(kelompok, namaArab, namaId, jam, kkm)
          .run();
        return jsonResponse(201, { ok: true, id: Number(info.meta?.last_row_id || 0) });
      }

      // Subjects: Toggle Active / Nonaktif
      const subActiveMatch = pathname.match(/^\/api\/subjects\/(\d+)\/active$/);
      if (method === 'PUT' && subActiveMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const subId = Number(subActiveMatch[1]);
        const oldSub = await env.DB.prepare('SELECT id FROM subjects WHERE id = ?').bind(subId).first();
        if (!oldSub) return jsonResponse(404, { error: 'Mata pelajaran tidak ditemukan' });
        const { active } = await readJsonBody(request);
        if (typeof active !== 'boolean') {
          return jsonResponse(400, { error: 'Status active harus berupa boolean (true/false)' });
        }
        const activeVal = active ? 1 : 0;
        await env.DB.prepare('UPDATE subjects SET active = ? WHERE id = ?').bind(activeVal, subId).run();
        return jsonResponse(200, { ok: true, active: Boolean(activeVal) });
      }

      // Subjects: Update / Delete
      const subMatch = pathname.match(/^\/api\/subjects\/(\d+)$/);
      if (method === 'PUT' && subMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const subId = Number(subMatch[1]);
        const oldSub = await env.DB.prepare('SELECT namaArab FROM subjects WHERE id = ?').bind(subId).first();
        if (!oldSub) return jsonResponse(404, { error: 'Mata pelajaran tidak ditemukan' });
        const body = await readJsonBody(request);
        const allowed = ['kelompok', 'namaArab', 'namaId', 'jam', 'kkm'];
        const sets = [];
        const vals = [];
        let newNamaArab = null;
        for (const key of allowed) {
          if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
          if (key === 'kelompok' && !['umum', 'syari'].includes(body[key])) {
            return jsonResponse(400, { error: 'Kelompok harus umum atau syari' });
          }
          if (key === 'namaArab' || key === 'namaId') {
            if (body[key] !== null && typeof body[key] === 'object') {
              return jsonResponse(400, { error: `Format kolom ${key} tidak valid` });
            }
            const clean = String(body[key] ?? '').trim();
            if (!clean) return jsonResponse(400, { error: `Kolom ${key} tidak boleh kosong` });
            if (key === 'namaArab') {
              const dupSub = await env.DB.prepare('SELECT id FROM subjects WHERE LOWER(TRIM(namaArab)) = LOWER(?) AND id != ?').bind(clean, subId).first();
              if (dupSub) {
                return jsonResponse(409, { error: `Nama Arab mata pelajaran "${clean}" sudah digunakan mapel lain` });
              }
              newNamaArab = clean;
            }
            sets.push(`${key} = ?`);
            vals.push(clean);
          } else if (key === 'jam') {
            const parsedJam = parseBoundedInt(body[key], 1, 30);
            if (parsedJam === null) return jsonResponse(400, { error: 'Jam pelajaran harus 1–30' });
            sets.push('jam = ?');
            vals.push(parsedJam);
          } else if (key === 'kkm') {
            const parsedKkm = parseBoundedInt(body[key], 0, 100);
            if (parsedKkm === null) return jsonResponse(400, { error: 'KKM harus 0–100' });
            sets.push('kkm = ?');
            vals.push(parsedKkm);
          } else {
            sets.push(`${key} = ?`);
            vals.push(body[key]);
          }
        }
        const stmts = [];
        if (sets.length > 0) {
          vals.push(subId);
          stmts.push(env.DB.prepare(`UPDATE subjects SET ${sets.join(', ')} WHERE id = ?`).bind(...vals));
        }
        if (newNamaArab && newNamaArab !== oldSub.namaArab) {
          stmts.push(env.DB.prepare('UPDATE assignments SET mapel = ? WHERE mapel = ?').bind(newNamaArab, oldSub.namaArab));
        }
        if (stmts.length > 0) await env.DB.batch(stmts);
        return jsonResponse(200, { ok: true });
      }

      if (method === 'DELETE' && subMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const subId = Number(subMatch[1]);
        const oldSub = await env.DB.prepare('SELECT namaArab FROM subjects WHERE id = ?').bind(subId).first();
        if (!oldSub) return jsonResponse(404, { error: 'Mata pelajaran tidak ditemukan' });
        const [scRes, asgRes] = await env.DB.batch([
          env.DB.prepare('SELECT COUNT(*) AS cnt FROM scores WHERE subjectId = ?').bind(subId),
          env.DB.prepare('SELECT COUNT(*) AS cnt FROM assignments WHERE mapel = ?').bind(oldSub.namaArab)
        ]);
        if (Number(scRes.results?.[0]?.cnt || 0) > 0 || Number(asgRes.results?.[0]?.cnt || 0) > 0) {
          return jsonResponse(409, {
            error: 'Mata pelajaran masih memiliki riwayat nilai atau penugasan. Gunakan tombol "Nonaktifkan" agar arsip rapor tetap aman.'
          });
        }
        await env.DB.prepare('DELETE FROM subjects WHERE id = ?').bind(subId).run();
        return jsonResponse(200, { ok: true });
      }

      // Students: Add or update bulk / single mutasi masuk (per-semester enrollments, lossless across semesters)
      if (method === 'POST' && pathname === '/api/students') {
        const { user: actorUser, error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const body = await readJsonBody(request);
        const { tahun: activeTahun, semester: activeSemester } = await getActivePeriod(env.DB);
        if (body.tahun && String(body.tahun).trim() !== activeTahun) {
          return jsonResponse(409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
        }
        if (body.semester && String(body.semester).trim() !== activeSemester) {
          return jsonResponse(409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
        }
        const isBulk = Array.isArray(body.students);
        const list = (isBulk ? body.students : [body]).filter(x => x && typeof x === 'object');
        if (!isBulk && list.length === 1) {
          const singleNama = String(list[0].nama || '').trim();
          const singleKelas = String(list[0].kelas || '').trim();
          if (!singleNama || !singleKelas) {
            return jsonResponse(400, { error: 'Nama santri dan kelas wajib diisi' });
          }
          const clsRow = await env.DB.prepare('SELECT id FROM classes WHERE tahun = ? AND kode = ?').bind(activeTahun, singleKelas).first();
          if (!clsRow) {
            return jsonResponse(400, { error: `Kelas "${singleKelas}" tidak ditemukan di tahun pelajaran ${activeTahun}` });
          }
        }
        const [existingRows, existingUsersRes, subjectsRes] = await env.DB.batch([
          env.DB.prepare("SELECT id, nisn FROM students WHERE nisn != ''"),
          env.DB.prepare('SELECT username FROM users'),
          env.DB.prepare('SELECT id FROM subjects')
        ]);
        const byNisn = new Map();
        for (const r of (existingRows.results || [])) {
          if (isValidNisn(r.nisn)) byNisn.set(r.nisn, r.id);
        }
        const existingUsernames = new Set((existingUsersRes.results || []).map(u => u.username));
        const validSubjectIds = new Set((subjectsRes.results || []).map(s => s.id));

        const parsedRows = [];
        const newInsertStmts = [];
        const newInsertMeta = [];
        const pendingNewByNisn = new Map();

        for (const st of list) {
          const cleanNama = String(st.nama || '').trim();
          const targetKelas = String(st.kelas || '').trim();
          if (!cleanNama || !targetKelas) continue;
          const rawNisn = String(st.nisn || '').trim();
          const cleanNisn = isValidNisn(rawNisn) ? rawNisn : '';
          const rawNis = String(st.nis || '').trim();
          const uname = cleanNisn || (isValidNisn(rawNis) ? rawNis : '');

          const existingId = cleanNisn ? byNisn.get(cleanNisn) : null;
          let batchDupRef = null;
          let insertSlotIdx = -1;
          if (!existingId) {
            if (cleanNisn && pendingNewByNisn.has(cleanNisn)) {
              batchDupRef = pendingNewByNisn.get(cleanNisn);
            } else {
              insertSlotIdx = newInsertStmts.length;
              newInsertStmts.push(
                env.DB.prepare(`
                  INSERT INTO students (nama, nis, nisn, nik, tempatLahir, tglLahir, kelas, jk, alamat, telp, ayah, ibu, wali, sakit, izin, alpa)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
                  RETURNING id
                `).bind(
                  cleanNama, rawNis, cleanNisn, String(st.nik || '').trim(),
                  String(st.tempatLahir || '').trim(), String(st.tglLahir || '').trim(),
                  targetKelas, String(st.jk || 'Laki-laki').trim(), String(st.alamat || '').trim(),
                  String(st.telp || '').trim(), String(st.ayah || '').trim(),
                  String(st.ibu || '').trim(), String(st.wali || '').trim()
                )
              );
              const metaObj = { assignedId: null };
              newInsertMeta.push(metaObj);
              if (cleanNisn) pendingNewByNisn.set(cleanNisn, metaObj);
              batchDupRef = metaObj;
            }
          }
          parsedRows.push({
            st,
            cleanNama,
            cleanNisn,
            rawNis,
            uname,
            targetKelas,
            existingId,
            insertSlotIdx,
            batchDupRef,
            sakitVal: parseAttendanceCount(st.sakit),
            izinVal: parseAttendanceCount(st.izin),
            alpaVal: parseAttendanceCount(st.alpa),
            mutCatatan: String(st.mutasiCatatan || '').trim().slice(0, 200),
            mutTanggal: String(st.mutasiTanggal || '').trim().slice(0, 32)
          });
        }

        if (newInsertStmts.length > 0) {
          const insertRes = await runSingleOrChunkedBatch(env.DB, newInsertStmts, 900);
          for (let i = 0; i < insertRes.length; i++) {
            const res = insertRes[i];
            newInsertMeta[i].assignedId = Number(res?.results?.[0]?.id || res?.meta?.last_row_id || 0);
          }
        }

        const defaultSiswaHash = DEFAULT_SISWA_PASSWORD_HASH;
        let added = 0;
        let updated = 0;
        let lastStId = 0;
        const groups = [];

        for (const item of parsedRows) {
          const { st, cleanNama, rawNis, uname, targetKelas, existingId, insertSlotIdx, batchDupRef, sakitVal, izinVal, alpaVal, mutCatatan, mutTanggal } = item;
          const gStmts = [];
          let stId;
          if (existingId) {
            stId = existingId;
            gStmts.push(
              env.DB.prepare(`
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
              `).bind(
                cleanNama, rawNis, String(st.nik || '').trim(),
                String(st.tempatLahir || '').trim(), String(st.tglLahir || '').trim(),
                targetKelas, String(st.jk || '').trim(), String(st.alamat || '').trim(),
                String(st.telp || '').trim(), String(st.ayah || '').trim(),
                String(st.ibu || '').trim(), String(st.wali || '').trim(), stId
              ),
              env.DB.prepare("UPDATE users SET displayName = ? WHERE role = 'siswa' AND studentId = ?").bind(cleanNama, stId)
            );
            updated++;
          } else {
            stId = batchDupRef?.assignedId || 0;
            if (!stId) continue;
            if (insertSlotIdx === -1) {
              gStmts.push(
                env.DB.prepare(`
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
                `).bind(
                  cleanNama, rawNis, String(st.nik || '').trim(),
                  String(st.tempatLahir || '').trim(), String(st.tglLahir || '').trim(),
                  targetKelas, String(st.jk || '').trim(), String(st.alamat || '').trim(),
                  String(st.telp || '').trim(), String(st.ayah || '').trim(),
                  String(st.ibu || '').trim(), String(st.wali || '').trim(), stId
                ),
                env.DB.prepare("UPDATE users SET displayName = ? WHERE role = 'siswa' AND studentId = ?").bind(cleanNama, stId)
              );
              updated++;
            } else {
              added++;
            }
          }
          lastStId = stId;

          gStmts.push(
            env.DB.prepare(`
              INSERT INTO student_enrollments (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
              VALUES (?, ?, ?, ?, 'aktif', ?, ?, 0, 0, 0)
              ON CONFLICT(studentId, tahun, semester) DO UPDATE SET
                kelas = excluded.kelas,
                status = 'aktif',
                mutasiCatatan = CASE WHEN excluded.mutasiCatatan != '' THEN excluded.mutasiCatatan ELSE student_enrollments.mutasiCatatan END,
                mutasiTanggal = CASE WHEN excluded.mutasiTanggal != '' THEN excluded.mutasiTanggal ELSE student_enrollments.mutasiTanggal END
            `).bind(stId, activeTahun, activeSemester, targetKelas, mutCatatan, mutTanggal),
            env.DB.prepare(`
              INSERT INTO student_attendance (studentId, tahun, semester, sakit, izin, alpa)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(studentId, tahun, semester) DO UPDATE SET
                sakit = COALESCE(?, student_attendance.sakit),
                izin = COALESCE(?, student_attendance.izin),
                alpa = COALESCE(?, student_attendance.alpa)
            `).bind(stId, activeTahun, activeSemester, sakitVal ?? 0, izinVal ?? 0, alpaVal ?? 0, sakitVal, izinVal, alpaVal)
          );

          if (st.scores && typeof st.scores === 'object') {
            for (const [subId, val] of Object.entries(st.scores)) {
              const sidNum = Number(subId);
              const parsed = parseScoreValue(val);
              if (Number.isInteger(sidNum) && validSubjectIds.has(sidNum) && parsed.value !== undefined) {
                gStmts.push(
                  env.DB.prepare('INSERT OR IGNORE INTO scores (studentId, subjectId, tahun, semester, score) VALUES (?, ?, ?, ?, ?)')
                    .bind(stId, sidNum, activeTahun, activeSemester, parsed.value)
                );
              }
            }
          }

          if (uname && defaultSiswaHash && !existingUsernames.has(uname)) {
            existingUsernames.add(uname);
            gStmts.push(
              env.DB.prepare(`
                INSERT OR IGNORE INTO users (username, passwordHash, role, displayName, teacherId, studentId)
                VALUES (?, ?, 'siswa', ?, NULL, ?)
              `).bind(uname, defaultSiswaHash, cleanNama, stId)
            );
          }
          groups.push(gStmts);
        }

        await runEntityBatches(env.DB, groups, 900);
        if (!isBulk && list.length === 1 && lastStId) {
          await logActivity(env.DB, actorUser, `Menambahkan santri ${String(list[0].nama || '').trim()} ke Kelas ${String(list[0].kelas || '').trim()} (${activeTahun} ${activeSemester})`);
        }
        return jsonResponse(201, { ok: true, id: lastStId, count: added + updated, added, updated });
      }

      // Student: Move class for active semester only (preserve previous semester class archive)
      const moveStudentMatch = pathname.match(/^\/api\/students\/(\d+)\/move-class$/);
      if (method === 'PUT' && moveStudentMatch) {
        const { user: actorUser, error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const stId = Number(moveStudentMatch[1]);
        const body = await readJsonBody(request);
        const { tahun: activeTahun, semester: activeSemester } = await getActivePeriod(env.DB);
        if (body.tahun && String(body.tahun).trim() !== activeTahun) {
          return jsonResponse(409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
        }
        if (body.semester && String(body.semester).trim() !== activeSemester) {
          return jsonResponse(409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
        }
        const targetKelas = String(body.targetKelas || '').trim();
        if (!targetKelas) return jsonResponse(400, { error: 'Kelas tujuan wajib dipilih' });
        const [clsRow, enr] = await env.DB.batch([
          env.DB.prepare('SELECT id FROM classes WHERE tahun = ? AND kode = ?').bind(activeTahun, targetKelas),
          env.DB.prepare(`
            SELECT e.kelas, COALESCE(e.status, 'aktif') AS status, s.nama
            FROM student_enrollments e
            JOIN students s ON s.id = e.studentId
            WHERE e.studentId = ? AND e.tahun = ? AND e.semester = ?
          `).bind(stId, activeTahun, activeSemester)
        ]);
        if (!clsRow?.results?.[0]) {
          return jsonResponse(400, { error: `Kelas tujuan "${targetKelas}" tidak ditemukan di tahun ${activeTahun}` });
        }
        const enrRow = enr?.results?.[0];
        if (!enrRow) {
          return jsonResponse(404, { error: `Santri tidak terdaftar pada ${activeTahun} (${activeSemester})` });
        }
        if (enrRow.status !== 'aktif') {
          return jsonResponse(400, { error: 'Aktifkan kembali santri sebelum memindahkan kelas' });
        }
        if (enrRow.kelas === targetKelas) {
          return jsonResponse(400, { error: `Santri sudah berada di kelas ${targetKelas}` });
        }
        await env.DB.batch([
          env.DB.prepare('UPDATE student_enrollments SET kelas = ? WHERE studentId = ? AND tahun = ? AND semester = ?')
            .bind(targetKelas, stId, activeTahun, activeSemester),
          env.DB.prepare('UPDATE students SET kelas = ? WHERE id = ?').bind(targetKelas, stId)
        ]);
        await logActivity(env.DB, actorUser, `Memindahkan santri ${enrRow.nama} dari Kelas ${enrRow.kelas} ke ${targetKelas} (${activeTahun} ${activeSemester})`);
        return jsonResponse(200, { ok: true, studentId: stId, fromKelas: enrRow.kelas, toKelas: targetKelas });
      }

      // Student: Set enrollment status ('mutasi_keluar' | 'aktif') for active semester only
      const statusStudentMatch = pathname.match(/^\/api\/students\/(\d+)\/status$/);
      if (method === 'PUT' && statusStudentMatch) {
        const { user: actorUser, error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const stId = Number(statusStudentMatch[1]);
        const body = await readJsonBody(request);
        const { tahun: activeTahun, semester: activeSemester } = await getActivePeriod(env.DB);
        if (body.tahun && String(body.tahun).trim() !== activeTahun) {
          return jsonResponse(409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
        }
        if (body.semester && String(body.semester).trim() !== activeSemester) {
          return jsonResponse(409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
        }
        const nextStatus = String(body.status || '').trim();
        if (!['aktif', 'mutasi_keluar'].includes(nextStatus)) {
          return jsonResponse(400, { error: 'Status santri harus "aktif" atau "mutasi_keluar"' });
        }
        const enrRow = await env.DB.prepare(`
          SELECT e.kelas, COALESCE(e.status, 'aktif') AS status, s.nama
          FROM student_enrollments e
          JOIN students s ON s.id = e.studentId
          WHERE e.studentId = ? AND e.tahun = ? AND e.semester = ?
        `).bind(stId, activeTahun, activeSemester).first();
        if (!enrRow) {
          return jsonResponse(404, { error: `Santri tidak terdaftar pada ${activeTahun} (${activeSemester})` });
        }
        const mutasiCatatan = nextStatus === 'mutasi_keluar' ? String(body.mutasiCatatan || '').trim().slice(0, 200) : '';
        const mutasiTanggal = nextStatus === 'mutasi_keluar' ? String(body.mutasiTanggal || '').trim().slice(0, 32) : '';
        await env.DB.prepare(`
          UPDATE student_enrollments
          SET status = ?, mutasiCatatan = ?, mutasiTanggal = ?
          WHERE studentId = ? AND tahun = ? AND semester = ?
        `).bind(nextStatus, mutasiCatatan, mutasiTanggal, stId, activeTahun, activeSemester).run();
        await logActivity(
          env.DB,
          actorUser,
          nextStatus === 'mutasi_keluar'
            ? `Menandai santri ${enrRow.nama} (${enrRow.kelas}) mutasi keluar (${activeTahun} ${activeSemester})`
            : `Mengaktifkan kembali santri ${enrRow.nama} di Kelas ${enrRow.kelas} (${activeTahun} ${activeSemester})`
        );
        return jsonResponse(200, { ok: true, studentId: stId, status: nextStatus });
      }

      // Students: Delete all in class for active tahun + semester atomically (scoped orphan cleanup matching server.js)
      if (method === 'DELETE' && pathname === '/api/students') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const kelas = url.searchParams.get('kelas');
        if (!kelas) return jsonResponse(400, { error: 'Parameter kelas wajib diisi' });
        const reqTahun = url.searchParams.get('tahun');
        const reqSemester = url.searchParams.get('semester');
        const { tahun: activeTahun, semester: activeSemester } = await getActivePeriod(env.DB);
        if (reqTahun && String(reqTahun).trim() !== activeTahun) {
          return jsonResponse(409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
        }
        if (reqSemester && String(reqSemester).trim() !== activeSemester) {
          return jsonResponse(409, { error: `Semester aktif telah berubah menjadi ${activeSemester}. Silakan muat ulang halaman.` });
        }
        const rowsRes = await env.DB.prepare('SELECT studentId AS id FROM student_enrollments WHERE tahun = ? AND semester = ? AND kelas = ?')
          .bind(activeTahun, activeSemester, kelas).all();
        const targetIds = (rowsRes.results || []).map(r => r.id);
        if (targetIds.length === 0) {
          return jsonResponse(200, { ok: true, deleted: 0, kelas });
        }
        const stmts = [
          env.DB.prepare('DELETE FROM scores WHERE tahun = ? AND semester = ? AND studentId IN (SELECT studentId FROM student_enrollments WHERE tahun = ? AND semester = ? AND kelas = ?)').bind(activeTahun, activeSemester, activeTahun, activeSemester, kelas),
          env.DB.prepare('DELETE FROM student_attendance WHERE tahun = ? AND semester = ? AND studentId IN (SELECT studentId FROM student_enrollments WHERE tahun = ? AND semester = ? AND kelas = ?)').bind(activeTahun, activeSemester, activeTahun, activeSemester, kelas),
          env.DB.prepare('DELETE FROM student_enrollments WHERE tahun = ? AND semester = ? AND kelas = ?').bind(activeTahun, activeSemester, kelas)
        ];
        // Chunk IN (...) to <= 80 params to stay below D1's 100-bound-parameter limit
        for (let i = 0; i < targetIds.length; i += 80) {
          const chunk = targetIds.slice(i, i + 80);
          const ph = chunk.map(() => '?').join(',');
          stmts.push(
            env.DB.prepare(`DELETE FROM scores WHERE studentId IN (${ph}) AND NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.studentId = scores.studentId)`).bind(...chunk),
            env.DB.prepare(`DELETE FROM student_attendance WHERE studentId IN (${ph}) AND NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.studentId = student_attendance.studentId)`).bind(...chunk),
            env.DB.prepare(`DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE role = 'siswa' AND studentId IN (${ph}) AND NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.studentId = users.studentId))`).bind(...chunk),
            env.DB.prepare(`DELETE FROM users WHERE role = 'siswa' AND studentId IN (${ph}) AND NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.studentId = users.studentId)`).bind(...chunk),
            env.DB.prepare(`DELETE FROM students WHERE id IN (${ph}) AND NOT EXISTS (SELECT 1 FROM student_enrollments e WHERE e.studentId = students.id)`).bind(...chunk)
          );
        }
        const batchRes = await runSingleOrChunkedBatch(env.DB, stmts, 900);
        const deleted = Number(batchRes[2]?.meta?.changes ?? targetIds.length);
        return jsonResponse(200, { ok: true, deleted, kelas });
      }

      // Assignments: Add one or bulk (validate active teacher/class/subject, guard tahun, force sent=0, return ids)
      if (method === 'POST' && pathname === '/api/assignments') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const body = await readJsonBody(request);
        const { tahun: activeTahun } = await getActivePeriod(env.DB);
        if (body.tahun && String(body.tahun).trim() !== activeTahun) {
          return jsonResponse(409, { error: `Tahun pelajaran aktif telah berubah menjadi ${activeTahun}. Silakan muat ulang halaman.` });
        }
        const list = (Array.isArray(body.assignments) ? body.assignments : [body]).filter(x => x && typeof x === 'object');
        const [existingRes, tRes, cRes, sRes] = await env.DB.batch([
          env.DB.prepare('SELECT teacherId, kode, mapel FROM assignments WHERE tahun = ?').bind(activeTahun),
          env.DB.prepare('SELECT id FROM teachers WHERE active = 1'),
          env.DB.prepare('SELECT kode FROM classes WHERE tahun = ?').bind(activeTahun),
          env.DB.prepare('SELECT namaArab FROM subjects WHERE active = 1')
        ]);
        const existingSet = new Set((existingRes.results || []).map(a => JSON.stringify([a.teacherId, a.kode, a.mapel])));
        const activeTeachers = new Set((tRes.results || []).map(r => r.id));
        const activeClasses = new Set((cRes.results || []).map(r => r.kode));
        const activeSubjects = new Set((sRes.results || []).map(r => r.namaArab));

        const stmts = [];
        for (const a of list) {
          const tid = String(a.teacherId || '').trim();
          const kode = String(a.kode || '').trim();
          const mapel = String(a.mapel || '').trim();
          if (!tid || !kode || !mapel) {
            return jsonResponse(400, { error: 'Guru, kelas, dan mata pelajaran penugasan wajib diisi' });
          }
          if (!activeTeachers.has(tid)) {
            return jsonResponse(400, { error: `Guru "${tid}" tidak ditemukan atau sedang nonaktif` });
          }
          if (!activeClasses.has(kode)) {
            return jsonResponse(400, { error: `Kelas "${kode}" tidak ditemukan di tahun ${activeTahun}` });
          }
          if (!activeSubjects.has(mapel)) {
            return jsonResponse(400, { error: `Mata pelajaran "${mapel}" tidak ditemukan atau sedang nonaktif` });
          }
          const key = JSON.stringify([tid, kode, mapel]);
          if (existingSet.has(key)) continue;
          existingSet.add(key);
          stmts.push(
            env.DB.prepare('INSERT OR IGNORE INTO assignments (tahun, teacherId, kelas, kode, mapel, sent) VALUES (?, ?, ?, ?, ?, 0)')
              .bind(activeTahun, tid, String(a.kelas || ('Kelas ' + kode)).trim(), kode, mapel)
          );
        }
        const batchRes = await runSingleOrChunkedBatch(env.DB, stmts, 900);
        const insertedIds = [];
        for (const r of batchRes) {
          if (Number(r?.meta?.changes || 0) > 0 && r?.meta?.last_row_id) {
            insertedIds.push(Number(r.meta.last_row_id));
          }
        }
        return jsonResponse(201, { ok: true, count: insertedIds.length, ids: insertedIds });
      }

      const assignMatch = pathname.match(/^\/api\/assignments\/(\d+)$/);
      if (method === 'PUT' && assignMatch) {
        const { user, error } = await requireRole(request, env, ['admin', 'guru']);
        if (error) return error;
        const id = Number(assignMatch[1]);
        const { sent, tahun: reqTahun, semester: reqSemester } = await readJsonBody(request);
        if (typeof sent !== 'boolean') {
          return jsonResponse(400, { error: 'Status sent harus berupa boolean (true/false)' });
        }
        const { tahun: activeTahun, semester: activeSemester } = await getActivePeriod(env.DB);
        if ((reqTahun && String(reqTahun) !== activeTahun) || (reqSemester && String(reqSemester) !== activeSemester)) {
          return jsonResponse(409, { error: `Periode aktif berubah (${activeTahun} ${activeSemester}). Muat ulang halaman sebelum mengirim nilai.` });
        }
        const row = await env.DB.prepare('SELECT id, teacherId, tahun, kelas, kode, mapel FROM assignments WHERE id = ? AND tahun = ?').bind(id, activeTahun).first();
        if (!row) {
          return jsonResponse(404, { error: 'Penugasan tidak ditemukan pada tahun pelajaran aktif' });
        }
        if (user.role === 'guru' && row.teacherId !== user.teacherId) {
          return jsonResponse(403, { error: 'Anda tidak berhak mengubah status penugasan guru lain' });
        }
        const sentVal = sent ? 1 : 0;
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO assignment_periods (assignmentId, tahun, semester, sent)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(assignmentId, tahun, semester) DO UPDATE SET sent = excluded.sent
          `).bind(id, activeTahun, activeSemester, sentVal),
          env.DB.prepare('UPDATE assignments SET sent = ? WHERE id = ?').bind(sentVal, id)
        ]);
        const subRow = await env.DB.prepare('SELECT namaId FROM subjects WHERE namaArab = ? LIMIT 1').bind(row.mapel).first().catch(() => null);
        const mapelLabel = (subRow && subRow.namaId) ? subRow.namaId : row.mapel;
        const kelasLabel = row.kelas || ('Kelas ' + row.kode);
        await logActivity(
          env.DB,
          user,
          sent ? `Mengirim & mengunci nilai ${mapelLabel} ${kelasLabel}` : `Membuka kembali draf nilai ${mapelLabel} ${kelasLabel}`
        );
        return jsonResponse(200, { ok: true });
      }

      if (method === 'POST' && pathname === '/api/assignments/delete-batch') {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const { ids } = await readJsonBody(request);
        const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite);
        const stmts = [];
        for (const id of list) {
          stmts.push(
            env.DB.prepare('DELETE FROM assignment_periods WHERE assignmentId = ?').bind(id),
            env.DB.prepare('DELETE FROM assignments WHERE id = ?').bind(id)
          );
        }
        await runSingleOrChunkedBatch(env.DB, stmts, 900);
        return jsonResponse(200, { ok: true, deleted: list.length });
      }

      if (method === 'DELETE' && assignMatch) {
        const { error } = await requireRole(request, env, ['admin']);
        if (error) return error;
        const id = Number(assignMatch[1]);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM assignment_periods WHERE assignmentId = ?').bind(id),
          env.DB.prepare('DELETE FROM assignments WHERE id = ?').bind(id)
        ]);
        return jsonResponse(200, { ok: true });
      }

      // Scores: Upsert or clear single/bulk (per active tahun + semester; locked if guru already sent)
      if (method === 'PUT' && pathname === '/api/scores') {
        const { user, error } = await requireRole(request, env, ['admin', 'guru']);
        if (error) return error;
        const body = await readJsonBody(request);
        const { tahun: activeTahun, semester: activeSemester } = await getActivePeriod(env.DB);
        if ((body.tahun && String(body.tahun) !== activeTahun) || (body.semester && String(body.semester) !== activeSemester)) {
          return jsonResponse(409, { error: `Periode aktif telah berubah menjadi ${activeTahun} (${activeSemester}). Silakan muat ulang halaman.` });
        }
        const list = (Array.isArray(body.scores) ? body.scores : [body]).filter(x => x && typeof x === 'object');

        const batchReads = [
          env.DB.prepare("SELECT studentId AS id, kelas FROM student_enrollments WHERE tahun = ? AND semester = ? AND COALESCE(status, 'aktif') = 'aktif'").bind(activeTahun, activeSemester),
          env.DB.prepare('SELECT id, namaArab, namaId FROM subjects')
        ];
        if (user.role === 'guru') {
          batchReads.push(
            env.DB.prepare('SELECT id, kode, mapel FROM assignments WHERE tahun = ? AND teacherId = ?').bind(activeTahun, user.teacherId),
            env.DB.prepare('SELECT assignmentId, sent FROM assignment_periods WHERE tahun = ? AND semester = ? AND sent = 1').bind(activeTahun, activeSemester)
          );
        }
        const readRes = await env.DB.batch(batchReads);
        const stMap = new Map((readRes[0].results || []).map(r => [r.id, r.kelas]));
        const subMap = new Map((readRes[1].results || []).map(r => [r.id, r.namaArab]));
        const subLabelMap = new Map((readRes[1].results || []).map(r => [r.id, r.namaId || r.namaArab]));
        const guruAssignsByKey = new Map();
        const sentSet = new Set();
        if (user.role === 'guru') {
          for (const r of (readRes[2].results || [])) {
            const k = JSON.stringify([r.kode, r.mapel]);
            if (!guruAssignsByKey.has(k)) guruAssignsByKey.set(k, []);
            guruAssignsByKey.get(k).push(r.id);
          }
          for (const r of (readRes[3].results || [])) {
            sentSet.add(r.assignmentId);
          }
        }

        const stmts = [];
        const savedPairs = new Set();
        for (const item of list) {
          const sid = Number(item.studentId);
          const subId = Number(item.subjectId);
          if (!Number.isInteger(sid) || sid <= 0 || !Number.isInteger(subId) || subId <= 0) {
            return jsonResponse(400, { error: 'ID santri dan ID mata pelajaran harus valid' });
          }
          const parsed = parseScoreValue(item.score);
          if (parsed.invalid) {
            return jsonResponse(400, { error: 'Nilai harus berupa angka 0–100 (atau kosong untuk menghapus)' });
          }
          const kelas = stMap.get(sid);
          const mapel = subMap.get(subId);
          if (!kelas || !mapel) {
            if (user.role === 'guru') {
              return jsonResponse(403, { error: 'Anda tidak ditugaskan mengampu mata pelajaran/kelas ini' });
            }
            return jsonResponse(400, { error: `Santri #${sid} atau mapel #${subId} tidak ditemukan pada tahun ${activeTahun}` });
          }
          if (user.role === 'guru') {
            const asgIds = guruAssignsByKey.get(JSON.stringify([kelas, mapel])) || [];
            if (asgIds.length === 0) {
              return jsonResponse(403, { error: 'Anda tidak ditugaskan mengampu mata pelajaran/kelas ini' });
            }
            if (asgIds.some(aid => sentSet.has(aid))) {
              return jsonResponse(409, { error: 'Nilai sudah dikirim dan terkunci. Klik "Batal Kirim" terlebih dahulu untuk mengubah nilai.' });
            }
          }
          savedPairs.add(`${kelas}||${subLabelMap.get(subId) || mapel}`);
          if (parsed.empty) {
            stmts.push(
              env.DB.prepare('DELETE FROM scores WHERE studentId = ? AND subjectId = ? AND tahun = ? AND semester = ?')
                .bind(sid, subId, activeTahun, activeSemester)
            );
          } else {
            stmts.push(
              env.DB.prepare(`
                INSERT INTO scores (studentId, subjectId, tahun, semester, score) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(studentId, subjectId, tahun, semester) DO UPDATE SET score = excluded.score
              `).bind(sid, subId, activeTahun, activeSemester, parsed.value)
            );
          }
        }
        await runSingleOrChunkedBatch(env.DB, stmts, 900);
        if (list.length > 0) {
          let actMsg = `Menyimpan nilai (${list.length} entri)`;
          if (savedPairs.size === 1) {
            const [kls, lbl] = [...savedPairs][0].split('||');
            actMsg = `Menyimpan nilai ${lbl} Kelas ${kls} (${list.length} santri)`;
          }
          await logActivity(env.DB, user, actMsg);
        }
        return jsonResponse(200, { ok: true });
      }

      // Activities: Add (user & level derived strictly from session)
      if (method === 'POST' && pathname === '/api/activities') {
        const { user: sessionUser, error } = await requireRole(request, env, ['admin', 'guru']);
        if (error) return error;
        const { activity, time } = await readJsonBody(request, 16 * 1024);
        const cleanActivity = String(activity || '').trim().slice(0, 500);
        if (!cleanActivity) return jsonResponse(400, { error: 'Aktivitas wajib diisi' });
        const derivedLevel = sessionUser.role === 'admin' ? 'Admin' : 'Guru';
        const cleanTime = String(time || 'Baru saja').trim().slice(0, 60) || 'Baru saja';
        await env.DB.prepare('INSERT INTO activities (user, level, activity, time) VALUES (?, ?, ?, ?)')
          .bind(sessionUser.displayName || sessionUser.username, derivedLevel, cleanActivity, cleanTime)
          .run();
        return jsonResponse(201, { ok: true });
      }

    return jsonResponse(404, { error: 'Not found' });
  } catch (err) {
    console.error('[WORKER ERROR]', method, pathname, err);
    if (err && err.message === 'Payload too large') {
      return jsonResponse(413, { error: 'Ukuran data terlalu besar (maksimal 15 MB)' });
    }
    if (err instanceof SyntaxError || err instanceof URIError || (err && err.code === 'ERR_INVALID_URL')) {
      return jsonResponse(400, { error: 'Format permintaan tidak valid' });
    }
    return jsonResponse(500, { error: 'Terjadi kesalahan pada server. Silakan coba lagi.' });
  }
}

export default {
  async fetch(request, env) {
    const resp = await handleRequest(request, env);
    if (isHttpsRequest(request) && !resp.headers.has('Strict-Transport-Security')) {
      const h = new Headers(resp.headers);
      h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      return new Response(resp.status === 304 ? null : resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: h
      });
    }
    return resp;
  }
};
