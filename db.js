const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function hashPasswordAsync(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(String(password), salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt}:${derived.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex || keyHex.length !== 128 || !/^[0-9a-f]+$/i.test(keyHex)) return false;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function verifyPasswordAsync(password, storedHash) {
  return new Promise((resolve) => {
    if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return resolve(false);
    const [salt, keyHex] = storedHash.split(':');
    if (!salt || !keyHex || keyHex.length !== 128 || !/^[0-9a-f]+$/i.test(keyHex)) return resolve(false);
    crypto.scrypt(String(password), salt, 64, (err, derived) => {
      if (err) return resolve(false);
      const keyBuf = Buffer.from(keyHex, 'hex');
      if (derived.length !== keyBuf.length) return resolve(false);
      resolve(crypto.timingSafeEqual(derived, keyBuf));
    });
  });
}

const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, 'rdp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

function runInTransaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS pesantren_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nama TEXT NOT NULL,
    namaArab TEXT NOT NULL,
    nspp TEXT,
    npsn TEXT,
    alamat TEXT,
    kotaArab TEXT,
    tanggalArab TEXT,
    kepala TEXT,
    kepalaArab TEXT,
    tahun TEXT,
    semester TEXT,
    semesterArab TEXT,
    kurikulum TEXT,
    kkmDefault INTEGER DEFAULT 75,
    logoDataUrl TEXT
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY,
    tahun TEXT NOT NULL DEFAULT '2026/2027',
    kode TEXT NOT NULL,
    tingkat TEXT NOT NULL,
    waliId TEXT,
    kurikulum TEXT,
    UNIQUE(tahun, kode)
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    kelompok TEXT NOT NULL,
    namaArab TEXT NOT NULL,
    namaId TEXT NOT NULL,
    jam INTEGER NOT NULL DEFAULT 2,
    kkm INTEGER NOT NULL DEFAULT 75,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    namaArab TEXT NOT NULL,
    initials TEXT,
    role TEXT,
    nuptk TEXT,
    nip TEXT,
    ttl TEXT,
    pendidikan TEXT,
    waliKelas TEXT,
    jumlahSiswa INTEGER DEFAULT 0,
    ekskul TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY,
    tahun TEXT NOT NULL DEFAULT '2026/2027',
    teacherId TEXT NOT NULL,
    kelas TEXT NOT NULL,
    kode TEXT NOT NULL,
    mapel TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS student_enrollments (
    studentId INTEGER NOT NULL,
    tahun TEXT NOT NULL,
    semester TEXT NOT NULL DEFAULT 'Ganjil',
    kelas TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aktif',
    mutasiCatatan TEXT DEFAULT '',
    mutasiTanggal TEXT DEFAULT '',
    sakit INTEGER DEFAULT 0,
    izin INTEGER DEFAULT 0,
    alpa INTEGER DEFAULT 0,
    PRIMARY KEY (studentId, tahun, semester)
  );

  CREATE TABLE IF NOT EXISTS student_attendance (
    studentId INTEGER NOT NULL,
    tahun TEXT NOT NULL,
    semester TEXT NOT NULL,
    sakit INTEGER DEFAULT 0,
    izin INTEGER DEFAULT 0,
    alpa INTEGER DEFAULT 0,
    PRIMARY KEY (studentId, tahun, semester)
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    nama TEXT NOT NULL,
    nis TEXT,
    nisn TEXT,
    nik TEXT,
    tempatLahir TEXT,
    tglLahir TEXT,
    kelas TEXT NOT NULL,
    jk TEXT,
    alamat TEXT,
    telp TEXT,
    ayah TEXT,
    ibu TEXT,
    wali TEXT,
    sakit INTEGER DEFAULT 0,
    izin INTEGER DEFAULT 0,
    alpa INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS scores (
    studentId INTEGER NOT NULL,
    subjectId INTEGER NOT NULL,
    tahun TEXT NOT NULL DEFAULT '2026/2027',
    semester TEXT NOT NULL DEFAULT 'Ganjil',
    score REAL NOT NULL DEFAULT 80,
    PRIMARY KEY (studentId, subjectId, tahun, semester)
  );

  CREATE TABLE IF NOT EXISTS assignment_periods (
    assignmentId INTEGER NOT NULL,
    tahun TEXT NOT NULL,
    semester TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (assignmentId, tahun, semester)
  );

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    level TEXT NOT NULL,
    activity TEXT NOT NULL,
    time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'guru', 'siswa')),
    displayName TEXT NOT NULL,
    teacherId TEXT,
    studentId INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    createdAt TEXT NOT NULL
  );
`);

try {
  db.exec('ALTER TABLE students ADD COLUMN nis TEXT;');
} catch (_) {
  // column already exists
}
for (const colDef of [
  "tanggalIso TEXT DEFAULT '2025-12-20'",
  "watermarkType TEXT DEFAULT 'logo'",
  "watermarkText TEXT DEFAULT ''",
  "watermarkDataUrl TEXT",
  "watermarkOpacity REAL DEFAULT 0.08",
  "watermarkColor TEXT DEFAULT 'color'",
  "watermarkSize INTEGER DEFAULT 300",
  "watermarkFontSize INTEGER DEFAULT 24",
  "nomorSkKejuaraan TEXT DEFAULT '001/SK-KEJ/PP-WI/XII/2025'",
  "predikatConfig TEXT",
  "adminWhatsapp TEXT DEFAULT ''"
]) {
  try { db.exec(`ALTER TABLE pesantren_profile ADD COLUMN ${colDef};`); } catch (_) {}
}
try { db.exec('ALTER TABLE teachers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;'); } catch (_) {}
try { db.exec('ALTER TABLE subjects ADD COLUMN active INTEGER NOT NULL DEFAULT 1;'); } catch (_) {}

function ensureIndexes() {
  // Deduplikasi assignment sebelum membuat unique index agar DB lama aman
  const dupGroups = db.prepare(`
    SELECT tahun, teacherId, kode, mapel, COUNT(*) AS cnt
    FROM assignments
    GROUP BY tahun, teacherId, kode, mapel
    HAVING cnt > 1
  `).all();
  if (dupGroups.length > 0) {
    runInTransaction(() => {
      for (const g of dupGroups) {
        const rows = db.prepare(`
          SELECT a.id, COALESCE(MAX(ap.sent), a.sent, 0) AS isSent
          FROM assignments a
          LEFT JOIN assignment_periods ap ON ap.assignmentId = a.id
          WHERE a.tahun = ? AND a.teacherId = ? AND a.kode = ? AND a.mapel = ?
          GROUP BY a.id
          ORDER BY isSent DESC, a.id ASC
        `).all(g.tahun, g.teacherId, g.kode, g.mapel);
        for (let i = 1; i < rows.length; i++) {
          db.prepare('DELETE FROM assignment_periods WHERE assignmentId = ?').run(rows[i].id);
          db.prepare('DELETE FROM assignments WHERE id = ?').run(rows[i].id);
        }
      }
    });
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_classes_tahun ON classes(tahun);
    CREATE INDEX IF NOT EXISTS idx_assignments_tahun_teacher ON assignments(tahun, teacherId, kode, mapel);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_unique ON assignments(tahun, teacherId, kode, mapel);
    CREATE INDEX IF NOT EXISTS idx_assignment_periods_period ON assignment_periods(tahun, semester);
    CREATE INDEX IF NOT EXISTS idx_enrollments_tahun_kelas ON student_enrollments(tahun, kelas);
    CREATE INDEX IF NOT EXISTS idx_enrollments_period_kelas ON student_enrollments(tahun, semester, kelas, status);
    CREATE INDEX IF NOT EXISTS idx_attendance_period ON student_attendance(tahun, semester);
    CREATE INDEX IF NOT EXISTS idx_scores_period ON scores(tahun, semester);
    CREATE INDEX IF NOT EXISTS idx_scores_student_period ON scores(studentId, tahun, semester);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacherId);
    CREATE INDEX IF NOT EXISTS idx_users_student ON users(studentId);
    CREATE INDEX IF NOT EXISTS idx_students_nisn ON students(nisn);
    CREATE INDEX IF NOT EXISTS idx_teachers_nuptk ON teachers(nuptk);
  `);
}

function seedIfEmpty() {
  const existing = db.prepare('SELECT id FROM pesantren_profile WHERE id = 1').get();
  if (existing) return;

  const SEED_TAHUN = '2026/2027';
  const SEED_SEMESTER = 'Ganjil';

  db.prepare(`
    INSERT INTO pesantren_profile (
      id, nama, namaArab, nspp, npsn, alamat, kotaArab, tanggalArab,
      kepala, kepalaArab, tahun, semester, semesterArab, kurikulum, kkmDefault, logoDataUrl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    1,
    'PP. WATHONIYAH ISLAMIYAH KEBARONGAN',
    'معهد الوطنية الإسلامية كباروعان',
    '510033020041',
    '20364218',
    'Jl. Kebarongan Km 02, Kemranjen, Banyumas, Jawa Tengah',
    'كباروعان',
    '٢٠ ديسمبر ٢٠٢٥ م',
    'H. Ahmad Muhaimin, S.Ag., M.Pd',
    'الشيخ أحمد مهيمن، الماجستير',
    SEED_TAHUN,
    SEED_SEMESTER,
    'الأول',
    'Kurikulum Pesantren & Merdeka',
    75,
    null
  );

  const insertClass = db.prepare('INSERT INTO classes (id, tahun, kode, tingkat, waliId, kurikulum) VALUES (?, ?, ?, ?, ?, ?)');
  [
    [1, SEED_TAHUN, 'VII.A', '7', null, 'Kurikulum Pesantren'],
    [2, SEED_TAHUN, 'VII.B', '7', null, 'Kurikulum Pesantren'],
    [3, SEED_TAHUN, 'VIII.A', '8', 'rina', 'Kurikulum Pesantren'],
    [4, SEED_TAHUN, 'VIII.B', '8', null, 'Kurikulum Pesantren'],
    [5, SEED_TAHUN, 'IX.A', '9', null, 'Kurikulum Pesantren'],
    [6, SEED_TAHUN, 'IX.B', '9', 'ahsin', 'Kurikulum Pesantren']
  ].forEach(r => insertClass.run(...r));

  const insertSubject = db.prepare('INSERT INTO subjects (id, kelompok, namaArab, namaId, jam, kkm, active) VALUES (?, ?, ?, ?, ?, ?, 1)');
  const subjects = [
    [1, 'umum', 'التربية المدنية', 'Pendidikan Pancasila / PKn', 1, 75],
    [2, 'umum', 'اللغة الإندونيسية', 'Bahasa Indonesia', 4, 75],
    [3, 'umum', 'الرياضيات', 'Matematika', 4, 75],
    [4, 'umum', 'العلوم الطبيعية', 'Ilmu Pengetahuan Alam (IPA)', 4, 75],
    [5, 'umum', 'العلوم الاجتماعية', 'Ilmu Pengetahuan Sosial (IPS)', 1, 75],
    [6, 'umum', 'اللغة الإنجليزية', 'Bahasa Inggris', 3, 75],
    [7, 'umum', 'المعلوماتية', 'Informatika', 2, 75],
    [8, 'umum', 'اللغة الجاوية', 'Bahasa Jawa', 1, 75],
    [9, 'syari', 'التوحيد', 'Tauhid / Akidah', 3, 75],
    [10, 'syari', 'الحديث', 'Hadits', 3, 75],
    [11, 'syari', 'القرآن الكريم', "Al-Qur'an", 3, 75],
    [12, 'syari', 'التجويد', 'Tajwid', 2, 75],
    [13, 'syari', 'التفسير', 'Tafsir', 2, 75],
    [14, 'syari', 'الفقه', 'Fikih', 3, 75],
    [15, 'syari', 'السيرة النبوية', 'Sirah Nabawiyah / SKI', 2, 75],
    [16, 'syari', 'التهجي والإملاء', "Imla'", 3, 75],
    [17, 'syari', 'الخط', 'Khat / Kaligrafi', 1, 75],
    [18, 'syari', 'اللغة العربية', 'Bahasa Arab', 6, 75],
    [19, 'syari', 'النحو', 'Nahwu', 2, 75],
    [20, 'syari', 'الصرف', 'Shorof', 2, 75],
    [21, 'syari', 'المحفوظات', 'Mahfudzot', 2, 75]
  ];
  subjects.forEach(r => insertSubject.run(...r));

  const insertTeacher = db.prepare(`
    INSERT INTO teachers (id, nama, namaArab, initials, role, nuptk, nip, ttl, pendidikan, waliKelas, jumlahSiswa, ekskul, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  [
    ['ahsin', 'Ahsin Hasanul Lutfi, S.Pd.I', 'أحسن حسن اللطفي', 'AH', 'Guru / Ustadz', '20302199188003', '-', 'Banyumas, 07 Juli 1988', 'Sarjana (S1)', 'IX.B', 22, 'Sepak Bola'],
    ['siti', 'Siti Aminah, M.Pd', 'ستي أمينة', 'SA', 'Guru / Ustadzah', '19850412201001', '198504122010012014', 'Purwokerto, 12 April 1985', 'Magister (S2)', null, 0, null],
    ['rina', 'Rina Marlina, S.Pd', 'رينا مارلينا', 'RM', 'Guru / Ustadzah', '19910821201903', '-', 'Cilacap, 21 Agustus 1991', 'Sarjana (S1)', 'VIII.A', 24, 'KIR']
  ].forEach(r => insertTeacher.run(...r));

  const insertAssignment = db.prepare('INSERT INTO assignments (id, tahun, teacherId, kelas, kode, mapel, sent) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertAssignPeriod = db.prepare('INSERT OR IGNORE INTO assignment_periods (assignmentId, tahun, semester, sent) VALUES (?, ?, ?, ?)');
  [
    [1, 'ahsin', 'Kelas IX.B', 'IX.B', 'القرآن الكريم', 1],
    [2, 'ahsin', 'Kelas IX.B', 'IX.B', 'التجويد', 1],
    [3, 'ahsin', 'Kelas VII.B', 'VII.B', 'القرآن الكريم', 0],
    [4, 'siti', 'Kelas VIII.A', 'VIII.A', 'السيرة النبوية', 1],
    [5, 'siti', 'Kelas VIII.B', 'VIII.B', 'الفقه', 0],
    [6, 'rina', 'Kelas VIII.A', 'VIII.A', 'الرياضيات', 1],
    [7, 'rina', 'Kelas IX.B', 'IX.B', 'الرياضيات', 0]
  ].forEach(r => {
    insertAssignment.run(r[0], SEED_TAHUN, r[1], r[2], r[3], r[4], r[5]);
    if (r[5]) insertAssignPeriod.run(r[0], SEED_TAHUN, SEED_SEMESTER, 1);
  });

  const insertStudent = db.prepare(`
    INSERT INTO students (id, nama, nisn, nik, tempatLahir, tglLahir, kelas, jk, alamat, telp, ayah, ibu, wali, sakit, izin, alpa)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEnroll = db.prepare("INSERT OR IGNORE INTO student_enrollments (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa) VALUES (?, ?, ?, ?, 'aktif', '', '', ?, ?, ?)");
  const insertAtt = db.prepare('INSERT OR IGNORE INTO student_attendance (studentId, tahun, semester, sakit, izin, alpa) VALUES (?, ?, ?, ?, ?, ?)');
  const students = [
    [1, 'Imam Suhada', '123456789', '3302060903130001', 'BANYUMAS', '2013-03-09', 'IX.B', 'Laki-laki', 'Kebarongan, Kemranjen, Banyumas', '6282143335497', 'Ahmad Suhada', 'Siti Aminah', 'Ahmad Suhada', 1, 0, 0],
    [2, 'AKHTAR AHSANU PUTRA', '3132820755', '3302060903130002', 'BANYUMAS', '2013-03-09', 'IX.B', 'Laki-laki', 'Sirau, RT 003 RW 003, Kemranjen, Banyumas', '6282143335497', 'JOHAN BACHTIAR', 'YULI KURNIAWATI', 'JOHAN BACHTIAR', 0, 1, 0],
    [3, 'ADILA NISA ARDANI', '0146781443', '3302054502140002', 'BANYUMAS', '2014-02-05', 'IX.B', 'Perempuan', 'Bangsa, Kebasen, Banyumas', '6283121074884', 'SUYATNO', 'SRUWIYATI', 'SUYATNO', 0, 0, 0],
    [4, 'IFFA ASTILA NADHIFA', '0138811379', '3302064803130004', 'BANYUMAS', '2013-03-08', 'IX.B', 'Perempuan', 'Sidamulya, Kemranjen, Banyumas', '6281328221116', 'SONO', 'KHOMSAH APRIANI', 'SONO', 2, 0, 1],
    [5, 'ALIEF SYAFEI IBRAHIM', '3119424430', '1219010111110007', 'BATU BARA', '2011-11-01', 'IX.B', 'Laki-laki', 'Pageralang, Kemranjen, Banyumas', '6285257348600', 'MISNO APRILIA NANDA', 'RAMLAH', 'MISNO APRILIA NANDA', 1, 1, 0]
  ];
  students.forEach(r => {
    insertStudent.run(...r);
    insertEnroll.run(r[0], SEED_TAHUN, SEED_SEMESTER, r[6], r[13], r[14], r[15]);
    insertAtt.run(r[0], SEED_TAHUN, SEED_SEMESTER, r[13], r[14], r[15]);
  });

  const insertScore = db.prepare('INSERT INTO scores (studentId, subjectId, tahun, semester, score) VALUES (?, ?, ?, ?, ?)');
  students.forEach((st, idx) => {
    subjects.forEach((sub, sIdx) => {
      const val = Math.min(98, 76 + ((idx * 3 + sIdx * 5) % 21));
      insertScore.run(st[0], sub[0], SEED_TAHUN, SEED_SEMESTER, val);
    });
  });

  const insertActivity = db.prepare('INSERT INTO activities (user, level, activity, time) VALUES (?, ?, ?, ?)');
  [
    ['Ahsin Hasanul Lutfi, S.Pd.I', 'Guru', 'kirim nilai القرآن الكريم Kelas IX.B', '1 jam lalu'],
    ['Proktor Pesantren', 'Admin', 'memperbarui profil pesantren & mata pelajaran', '3 jam lalu'],
    ['Siti Aminah, M.Pd', 'Guru', 'sinkronisasi nilai السيرة النبوية', 'Kemarin']
  ].forEach(r => insertActivity.run(...r));
}

seedIfEmpty();

function seedUsersIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  if (count > 0) return;

  const ins = db.prepare(`
    INSERT INTO users (username, passwordHash, role, displayName, teacherId, studentId)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Default Admin / Proktor
  ins.run('admin', hashPassword('admin123'), 'admin', 'Proktor / Admin Pesantren', null, null);

  // Default Guru accounts (each teacher by short id)
  const teachers = db.prepare('SELECT id, nama FROM teachers').all();
  for (const t of teachers) {
    ins.run(t.id, hashPassword('guru123'), 'guru', t.nama, t.id, null);
  }

  // Default Siswa accounts (each student by NISN, plus 'siswa' alias for student #1)
  const students = db.prepare('SELECT id, nama, nisn FROM students').all();
  if (students.length > 0) {
    ins.run('siswa', hashPassword('mtswihebat'), 'siswa', students[0].nama, null, students[0].id);
  }
  for (const st of students) {
    if (st.nisn) {
      db.prepare(`
        INSERT OR IGNORE INTO users (username, passwordHash, role, displayName, teacherId, studentId)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(st.nisn, hashPassword('mtswihebat'), 'siswa', st.nama, null, st.id);
    }
  }
}

seedUsersIfEmpty();

function migrateMultiSemester() {
  const cols = db.prepare('PRAGMA table_info(scores)').all();
  const hasTahun = cols.some(c => c.name === 'tahun');
  if (hasTahun) return;

  const prof = db.prepare('SELECT tahun, semester FROM pesantren_profile WHERE id = 1').get();
  const activeTahun = (prof && prof.tahun) || '2026/2027';
  const activeSemester = (prof && prof.semester) || 'Ganjil';

  runInTransaction(() => {
    db.exec(`
      CREATE TABLE scores_v2 (
        studentId INTEGER NOT NULL,
        subjectId INTEGER NOT NULL,
        tahun TEXT NOT NULL DEFAULT '2026/2027',
        semester TEXT NOT NULL DEFAULT 'Ganjil',
        score REAL NOT NULL DEFAULT 80,
        PRIMARY KEY (studentId, subjectId, tahun, semester)
      );
    `);
    db.prepare(`
      INSERT OR REPLACE INTO scores_v2 (studentId, subjectId, tahun, semester, score)
      SELECT studentId, subjectId, ?, ?, score FROM scores
    `).run(activeTahun, activeSemester);
    db.exec('DROP TABLE scores; ALTER TABLE scores_v2 RENAME TO scores;');

    db.prepare(`
      INSERT OR IGNORE INTO assignment_periods (assignmentId, tahun, semester, sent)
      SELECT id, ?, ?, sent FROM assignments WHERE sent = 1
    `).run(activeTahun, activeSemester);
  });
}

migrateMultiSemester();

function migratePerYearData() {
  const prof = db.prepare('SELECT tahun FROM pesantren_profile WHERE id = 1').get();
  const activeTahun = (prof && prof.tahun) || '2026/2027';

  const clsCols = db.prepare('PRAGMA table_info(classes)').all();
  if (!clsCols.some(c => c.name === 'tahun')) {
    runInTransaction(() => {
      db.exec(`
        CREATE TABLE classes_v2 (
          id INTEGER PRIMARY KEY,
          tahun TEXT NOT NULL DEFAULT '2026/2027',
          kode TEXT NOT NULL,
          tingkat TEXT NOT NULL,
          waliId TEXT,
          kurikulum TEXT,
          UNIQUE(tahun, kode)
        );
      `);
      db.prepare(`
        INSERT INTO classes_v2 (id, tahun, kode, tingkat, waliId, kurikulum)
        SELECT id, ?, kode, tingkat, waliId, kurikulum FROM classes
      `).run(activeTahun);
      db.exec('DROP TABLE classes; ALTER TABLE classes_v2 RENAME TO classes;');
    });
  }

  const asgCols = db.prepare('PRAGMA table_info(assignments)').all();
  if (!asgCols.some(c => c.name === 'tahun')) {
    runInTransaction(() => {
      db.exec(`
        CREATE TABLE assignments_v2 (
          id INTEGER PRIMARY KEY,
          tahun TEXT NOT NULL DEFAULT '2026/2027',
          teacherId TEXT NOT NULL,
          kelas TEXT NOT NULL,
          kode TEXT NOT NULL,
          mapel TEXT NOT NULL,
          sent INTEGER NOT NULL DEFAULT 0
        );
      `);
      db.prepare(`
        INSERT INTO assignments_v2 (id, tahun, teacherId, kelas, kode, mapel, sent)
        SELECT id, ?, teacherId, kelas, kode, mapel, sent FROM assignments
      `).run(activeTahun);
      db.exec('DROP TABLE assignments; ALTER TABLE assignments_v2 RENAME TO assignments;');
    });
  }

  const enrCount = db.prepare('SELECT COUNT(*) AS cnt FROM student_enrollments').get().cnt;
  if (enrCount === 0) {
    const profFull0 = db.prepare('SELECT semester FROM pesantren_profile WHERE id = 1').get();
    const activeSem0 = (profFull0 && profFull0.semester) || 'Ganjil';
    const enrCols0 = db.prepare('PRAGMA table_info(student_enrollments)').all();
    if (enrCols0.some(c => c.name === 'semester')) {
      db.prepare(`
        INSERT OR IGNORE INTO student_enrollments (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
        SELECT id, ?, ?, kelas, 'aktif', '', '', COALESCE(sakit, 0), COALESCE(izin, 0), COALESCE(alpa, 0) FROM students
      `).run(activeTahun, activeSem0);
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO student_enrollments (studentId, tahun, kelas, sakit, izin, alpa)
        SELECT id, ?, kelas, COALESCE(sakit, 0), COALESCE(izin, 0), COALESCE(alpa, 0) FROM students
      `).run(activeTahun);
    }
  }

  const attCount = db.prepare('SELECT COUNT(*) AS cnt FROM student_attendance').get().cnt;
  if (attCount === 0) {
    const profFull = db.prepare('SELECT semester FROM pesantren_profile WHERE id = 1').get();
    const activeSemester = (profFull && profFull.semester) || 'Ganjil';
    db.prepare(`
      INSERT OR IGNORE INTO student_attendance (studentId, tahun, semester, sakit, izin, alpa)
      SELECT studentId, tahun, ?, COALESCE(sakit, 0), COALESCE(izin, 0), COALESCE(alpa, 0) FROM student_enrollments
    `).run(activeSemester);
  }
}

function migratePerSemesterEnrollments() {
  const cols = db.prepare('PRAGMA table_info(student_enrollments)').all();
  if (!cols.some(c => c.name === 'semester')) {
    const prof = db.prepare('SELECT semester FROM pesantren_profile WHERE id = 1').get();
    const activeSemester = (prof && prof.semester === 'Genap') ? 'Genap' : 'Ganjil';
    runInTransaction(() => {
      db.exec(`
        CREATE TABLE student_enrollments_v2 (
          studentId INTEGER NOT NULL,
          tahun TEXT NOT NULL,
          semester TEXT NOT NULL DEFAULT 'Ganjil',
          kelas TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'aktif',
          mutasiCatatan TEXT DEFAULT '',
          mutasiTanggal TEXT DEFAULT '',
          sakit INTEGER DEFAULT 0,
          izin INTEGER DEFAULT 0,
          alpa INTEGER DEFAULT 0,
          PRIMARY KEY (studentId, tahun, semester)
        );
      `);
      // 1. Seluruh enrollment per-tahun lama disalin ke Ganjil
      db.exec(`
        INSERT OR IGNORE INTO student_enrollments_v2
          (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
        SELECT studentId, tahun, 'Ganjil', kelas, 'aktif', '', '', COALESCE(sakit, 0), COALESCE(izin, 0), COALESCE(alpa, 0)
        FROM student_enrollments;
      `);
      // 2. Jika semester aktif saat ini Genap, carryover juga ke Genap agar santri aktif langsung tampil
      if (activeSemester === 'Genap') {
        db.exec(`
          INSERT OR IGNORE INTO student_enrollments_v2
            (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
          SELECT studentId, tahun, 'Genap', kelas, 'aktif', '', '', COALESCE(sakit, 0), COALESCE(izin, 0), COALESCE(alpa, 0)
          FROM student_enrollments;
        `);
      }
      // 3. Pastikan setiap pasangan (studentId, tahun, semester) yang punya nilai/absensi ikut tercatat
      db.exec(`
        INSERT OR IGNORE INTO student_enrollments_v2
          (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
        SELECT DISTINCT p.studentId, p.tahun, p.semester, e.kelas, 'aktif', '', '', 0, 0, 0
        FROM (
          SELECT studentId, tahun, semester FROM scores
          UNION
          SELECT studentId, tahun, semester FROM student_attendance
        ) p
        JOIN student_enrollments e ON e.studentId = p.studentId AND e.tahun = p.tahun;
      `);
      db.exec('DROP TABLE student_enrollments; ALTER TABLE student_enrollments_v2 RENAME TO student_enrollments;');
    });
  } else {
    for (const colDef of [
      "status TEXT NOT NULL DEFAULT 'aktif'",
      "mutasiCatatan TEXT DEFAULT ''",
      "mutasiTanggal TEXT DEFAULT ''"
    ]) {
      try { db.exec(`ALTER TABLE student_enrollments ADD COLUMN ${colDef};`); } catch (_) {}
    }
  }
}

function carryOverEnrollmentsToGenap(tahun) {
  if (!tahun) return 0;
  const info = db.prepare(`
    INSERT OR IGNORE INTO student_enrollments
      (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
    SELECT studentId, tahun, 'Genap', kelas, 'aktif', '', '', 0, 0, 0
    FROM student_enrollments
    WHERE tahun = ? AND semester = 'Ganjil' AND COALESCE(status, 'aktif') = 'aktif'
  `).run(tahun);
  return Number(info.changes || 0);
}

migratePerYearData();
migratePerSemesterEnrollments();
ensureIndexes();

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

function getFullState(opts = {}) {
  const omitMedia = Boolean(opts && opts.omitMedia);
  const profileSql = omitMedia
    ? `SELECT id, nama, namaArab, nspp, npsn, alamat, kotaArab, tanggalArab,
              kepala, kepalaArab, tahun, semester, semesterArab, kurikulum,
              kkmDefault, tanggalIso, watermarkType, watermarkText,
              watermarkOpacity, watermarkColor, watermarkSize, watermarkFontSize,
              nomorSkKejuaraan, predikatConfig, adminWhatsapp,
              (length(COALESCE(logoDataUrl, '')) || ':' || substr(COALESCE(logoDataUrl, ''), 1, 24) || ':' ||
               length(COALESCE(watermarkDataUrl, '')) || ':' || substr(COALESCE(watermarkDataUrl, ''), 1, 24)) AS mediaStamp
       FROM pesantren_profile WHERE id = 1`
    : 'SELECT * FROM pesantren_profile WHERE id = 1';
  const profile = db.prepare(profileSql).get() || {};
  const logoStr = !omitMedia ? (profile.logoDataUrl || '') : '';
  const wmStr = !omitMedia ? (profile.watermarkDataUrl || '') : '';
  const mediaStamp = omitMedia
    ? (profile.mediaStamp || '0::0:')
    : `${logoStr.length}:${logoStr.slice(0, 24)}:${wmStr.length}:${wmStr.slice(0, 24)}`;
  const activeTahun = profile.tahun || '2026/2027';
  const activeSemester = profile.semester || 'Ganjil';
  const activeKkm = (profile.kkmDefault !== undefined && profile.kkmDefault !== null) ? Number(profile.kkmDefault) : 75;
  const parsedPred = parseAndValidatePredikatConfig(profile.predikatConfig, activeKkm);
  const effectivePredikatConfig = (parsedPred.ok && parsedPred.value)
    ? parsedPred.value
    : buildDefaultPredikatConfig(activeKkm);
  const classes = db.prepare('SELECT * FROM classes WHERE tahun = ? ORDER BY id ASC').all(activeTahun);
  const subjects = db.prepare('SELECT * FROM subjects ORDER BY id ASC').all().map(s => ({
    ...s,
    active: s.active === undefined || s.active === null ? true : Boolean(s.active)
  }));
  const rawTeachers = db.prepare('SELECT * FROM teachers').all();
  const waliByTeacherId = new Map(classes.filter(c => c.waliId).map(c => [c.waliId, c.kode]));
  const teachers = rawTeachers.map(t => ({
    ...t,
    active: t.active === undefined || t.active === null ? true : Boolean(t.active),
    waliKelas: waliByTeacherId.get(t.id) || null
  }));
  const rawAssignments = db.prepare('SELECT * FROM assignments WHERE tahun = ? ORDER BY id ASC').all(activeTahun);
  const periodRows = db.prepare('SELECT assignmentId, sent FROM assignment_periods WHERE tahun = ? AND semester = ?')
    .all(activeTahun, activeSemester);
  const periodSentMap = new Map(periodRows.map(r => [r.assignmentId, Boolean(r.sent)]));
  const assignments = rawAssignments.map(a => ({
    ...a,
    sent: periodSentMap.get(a.id) ?? false
  }));
  const rawStudents = db.prepare(`
    SELECT s.*, e.kelas AS enrKelas,
           COALESCE(e.status, 'aktif') AS enrStatus,
           COALESCE(e.mutasiCatatan, '') AS mutasiCatatan,
           COALESCE(e.mutasiTanggal, '') AS mutasiTanggal
    FROM student_enrollments e
    JOIN students s ON s.id = e.studentId
    WHERE e.tahun = ? AND e.semester = ?
    ORDER BY s.id ASC
  `).all(activeTahun, activeSemester);
  const attRows = db.prepare('SELECT studentId, sakit, izin, alpa FROM student_attendance WHERE tahun = ? AND semester = ?')
    .all(activeTahun, activeSemester);
  const attMap = new Map(attRows.map(r => [r.studentId, r]));
  const rawScores = db.prepare('SELECT studentId, subjectId, score FROM scores WHERE tahun = ? AND semester = ?')
    .all(activeTahun, activeSemester);
  const activities = db.prepare('SELECT user, level, activity, time FROM activities ORDER BY id DESC LIMIT 50').all();

  const scoreMap = new Map();
  for (const row of rawScores) {
    if (!scoreMap.has(row.studentId)) scoreMap.set(row.studentId, {});
    scoreMap.get(row.studentId)[row.subjectId] = row.score;
  }

  const students = [];
  const mutatedStudents = [];
  for (const st of rawStudents) {
    const att = attMap.get(st.id);
    const { enrKelas, enrStatus, mutasiCatatan, mutasiTanggal, ...rest } = st;
    if (enrStatus === 'mutasi_keluar') {
      mutatedStudents.push({
        id: st.id,
        nama: st.nama,
        nis: st.nis,
        nisn: st.nisn,
        jk: st.jk,
        kelas: enrKelas,
        status: 'mutasi_keluar',
        mutasiCatatan: mutasiCatatan || '',
        mutasiTanggal: mutasiTanggal || ''
      });
    } else {
      students.push({
        ...rest,
        kelas: enrKelas,
        status: 'aktif',
        sakit: att ? (att.sakit ?? 0) : 0,
        izin: att ? (att.izin ?? 0) : 0,
        alpa: att ? (att.alpa ?? 0) : 0,
        scores: scoreMap.get(st.id) || {}
      });
    }
  }

  return {
    pesantren: {
      nama: profile.nama || '',
      namaArab: profile.namaArab || '',
      nspp: profile.nspp || '',
      npsn: profile.npsn || '',
      alamat: profile.alamat || '',
      kotaArab: profile.kotaArab || '',
      tanggalArab: profile.tanggalArab || '',
      kepala: profile.kepala || '',
      kepalaArab: profile.kepalaArab || '',
      tahun: activeTahun,
      semester: activeSemester,
      semesterArab: profile.semesterArab || (activeSemester === 'Genap' ? 'الثاني' : 'الأول'),
      kurikulum: profile.kurikulum || '',
      ...(omitMedia ? {} : { logoDataUrl: profile.logoDataUrl || null }),
      tanggalIso: profile.tanggalIso || '2025-12-20',
      watermarkType: profile.watermarkType || 'logo',
      watermarkText: profile.watermarkText || '',
      ...(omitMedia ? {} : { watermarkDataUrl: profile.watermarkDataUrl || null }),
      watermarkOpacity: profile.watermarkOpacity ?? 0.08,
      watermarkColor: profile.watermarkColor || 'color',
      watermarkSize: Number(profile.watermarkSize || 300),
      watermarkFontSize: Number(profile.watermarkFontSize || 24),
      nomorSkKejuaraan: profile.nomorSkKejuaraan || '001/SK-KEJ/PP-WI/XII/2025',
      predikatConfig: effectivePredikatConfig,
      adminWhatsapp: profile.adminWhatsapp || '',
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

module.exports = { db, DB_PATH, getFullState, carryOverEnrollmentsToGenap, buildDefaultPredikatConfig, parseAndValidatePredikatConfig, hashPassword, hashPasswordAsync, verifyPassword, verifyPasswordAsync, runInTransaction };
