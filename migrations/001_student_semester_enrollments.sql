-- Migrasi Per-Semester Keanggotaan Santri (student_enrollments)
-- Kompatibel untuk Cloudflare D1 (tanpa BEGIN/COMMIT eksplisit)

CREATE TABLE IF NOT EXISTS student_enrollments_v2 (
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

-- 1. Salin seluruh data keanggotaan lama ke Semester Ganjil
INSERT OR IGNORE INTO student_enrollments_v2
  (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
SELECT studentId, tahun, 'Ganjil', kelas, 'aktif', '', '', COALESCE(sakit, 0), COALESCE(izin, 0), COALESCE(alpa, 0)
FROM student_enrollments;

-- 2. Jika profil pesantren saat ini sedang aktif di Genap, salin juga ke Genap
INSERT OR IGNORE INTO student_enrollments_v2
  (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
SELECT e.studentId, e.tahun, 'Genap', e.kelas, 'aktif', '', '', COALESCE(e.sakit, 0), COALESCE(e.izin, 0), COALESCE(e.alpa, 0)
FROM student_enrollments e
JOIN pesantren_profile p ON p.id = 1
WHERE p.semester = 'Genap' AND e.tahun = p.tahun;

-- 3. Pastikan semua kombinasi (studentId, tahun, semester) dari nilai/absensi ikut terdaftar aktif
INSERT OR IGNORE INTO student_enrollments_v2
  (studentId, tahun, semester, kelas, status, mutasiCatatan, mutasiTanggal, sakit, izin, alpa)
SELECT DISTINCT p.studentId, p.tahun, p.semester, e.kelas, 'aktif', '', '', 0, 0, 0
FROM (
  SELECT studentId, tahun, semester FROM scores
  UNION
  SELECT studentId, tahun, semester FROM student_attendance
) p
JOIN student_enrollments e ON e.studentId = p.studentId AND e.tahun = p.tahun;

DROP TABLE student_enrollments;
ALTER TABLE student_enrollments_v2 RENAME TO student_enrollments;

CREATE INDEX IF NOT EXISTS idx_enrollments_tahun_kelas ON student_enrollments(tahun, kelas);
CREATE INDEX IF NOT EXISTS idx_enrollments_period_kelas ON student_enrollments(tahun, semester, kelas, status);
