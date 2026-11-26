// ===================== KELAS -> STATUS NILAI (WALI KELAS) =====================
function renderStatusNilaiKelas() {
  const t = getCurrentTeacher();
  const kelasKode = getWaliKelasKode();
  if (state.mode !== 'guru' || !kelasKode) {
    return `<div class="rdp-card p-6 text-xs text-rose-700 font-semibold">Menu Status Nilai Kelas hanya tersedia bagi Guru yang menjabat sebagai Wali Kelas.</div>`;
  }

  const norm = (v) => String(v || '').trim().toLowerCase();
  const rows = getEffectiveSubjects(kelasKode).map((sub, idx) => {
    const matched = state.assignments.filter(a => norm(a.kode) === norm(kelasKode) && norm(a.mapel) === norm(sub.namaArab));
    const hasAssignment = matched.length > 0;
    const allSent = hasAssignment && matched.every(a => Boolean(a.sent));
    const pengampuNames = matched.map(a => {
      const tr = state.teachers.find(x => x.id === a.teacherId);
      return tr ? tr.nama : a.teacherId;
    });
    return {
      no: idx + 1,
      sub,
      hasAssignment,
      allSent,
      pengampuNames
    };
  });

  const sentCount = rows.filter(r => r.allSent).length;
  const totalCount = rows.length;
  const persen = totalCount > 0 ? Math.round((sentCount / totalCount) * 100) : 0;

  return `
    ${renderPageHeader(
      `Status Nilai Kelas ${kelasKode}`,
      `Wali Kelas: ${escapeHtml(t.nama)} • Pantau status pengiriman nilai seluruh mata pelajaran di kelas Anda.`,
      `<span class="px-3 py-1.5 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] text-xs font-bold text-[#0f4c3a] tabular-nums">Terkirim: ${sentCount}/${totalCount} (${persen}%)</span>`
    )}
    <div class="rdp-card p-5 space-y-4 text-xs">
      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-12">No</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Mata Pelajaran</th>
              <th class="px-3 py-2.5 text-center w-48">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${rows.map(r => `
              <tr class="hover:bg-[#fbf8f1]">
                <td class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">${r.no}</td>
                <td class="px-3 py-2.5 border-r border-[#e7dcc3]">
                  <div class="font-semibold text-slate-900">
                    ${escapeHtml(r.sub.namaId)}
                    <span class="arabic-font text-base text-[#0f4c3a] ml-1.5">(${escapeHtml(r.sub.namaArab)})</span>
                  </div>
                  ${r.pengampuNames.length > 0 ? `<div class="text-xs text-slate-500 mt-0.5">Pengampu: ${escapeHtml(r.pengampuNames.join(', '))}</div>` : ''}
                </td>
                <td class="px-3 py-2.5 text-center">
                  ${!r.hasAssignment
                    ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs">Belum Ada Pengampu</span>`
                    : (r.allSent
                      ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600 text-white font-bold text-xs shadow-sm">✓ Sudah Dikirim</span>`
                      : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-600 text-white font-bold text-xs shadow-sm">✕ Belum Dikirim</span>`)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function downloadDatabaseBackup() {
  if (location.protocol === 'file:') {
    showToast('Fitur backup database memerlukan server aktif');
    return;
  }
  showToast('Menyiapkan backup database...');
  try {
    const res = await fetch('/api/backup/db');
    if (res.status === 401) {
      clearClientSessionData(false);
      showLogin();
      showToast('Sesi berakhir, silakan login kembali');
      return;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      showToast('Gagal mengunduh backup: ' + (errData.error || `HTTP ${res.status}`));
      return;
    }
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/i);
    const filename = (m && m[1]) ? m[1] : 'rdp_backup.db';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);
    showToast('Backup database berhasil diunduh!');
  } catch (err) {
    console.warn('Backup download failed:', err);
    showToast('Gagal terhubung ke server saat mengunduh backup');
  }
}

function getAdminWaPreviewHtml(rawVal) {
  const digits = normalizeWhatsAppNumber(rawVal);
  const waUrl = buildOperatorWhatsappUrl(rawVal, state.pesantren && state.pesantren.nama);
  if (waUrl) {
    return `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="font-semibold text-[#0f4c3a]">Tautan WhatsApp Aktif (+${escapeHtml(digits)})</div>
          <div class="text-[11px] text-slate-600 truncate max-w-md">${escapeHtml(waUrl)}</div>
        </div>
        <a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#136048] bg-white hover:bg-emerald-50 text-[#0f4c3a] font-bold transition whitespace-nowrap">
          Tes Buka WhatsApp ↗
        </a>
      </div>
    `;
  }
  if (digits) {
    return `<div class="text-rose-700 font-semibold">Format belum valid (${digits.length} digit) — gunakan 8–15 digit angka, contoh 081234567890 atau 6281234567890.</div>`;
  }
  return `<div class="text-slate-500">Nomor belum diatur. Tombol <strong>Hubungi Operator</strong> pada halaman login akan menampilkan pesan informasi standar.</div>`;
}

function updateAdminWaPreview() {
  const inp = document.getElementById('admin-wa-input');
  const box = document.getElementById('admin-wa-preview');
  if (!inp || !box) return;
  box.innerHTML = getAdminWaPreviewHtml(inp.value);
}

async function saveAdminInfoFromForm(e) {
  if (e) e.preventDefault();
  const inp = document.getElementById('admin-wa-input');
  const raw = inp ? inp.value : '';
  const normalized = normalizeWhatsAppNumber(raw);
  if (normalized && !/^[0-9]{8,15}$/.test(normalized)) {
    showToast('Nomor WhatsApp admin harus 8–15 digit (contoh: 081234567890)');
    if (inp) inp.focus();
    return;
  }
  const res = await savePesantrenPartial({ adminWhatsapp: normalized });
  if (res && res.ok) {
    state.pesantren.adminWhatsapp = normalized;
    markFormDirty('info-admin', false);
    updateLoginBranding(state.pesantren);
    renderPage();
    showToast('Informasi Admin berhasil disimpan');
  } else {
    await refreshStateFromServer(true);
  }
}

function renderInformasiAdmin() {
  const curWa = (state.pesantren && state.pesantren.adminWhatsapp) || '';
  return `
    ${renderPageHeader('Informasi Admin', 'Atur nomor WhatsApp admin/operator pesantren yang tertaut ke tombol Hubungi Operator pada halaman login.', renderDirtyBadge('info-admin'))}
    <form onsubmit="saveAdminInfoFromForm(event)" class="rdp-card p-5 max-w-xl space-y-4 text-xs">
      <div>
        <label for="admin-wa-input" class="block font-bold text-[#0f4c3a] mb-1">Nomor WhatsApp Admin / Operator</label>
        <input id="admin-wa-input" type="tel" inputmode="tel" value="${escapeHtml(curWa)}" placeholder="Contoh: 081234567890 atau 6281234567890" oninput="markFormDirty('info-admin', true); updateAdminWaPreview();" class="w-full px-3 py-2.5 rounded-lg border border-[#e7dcc3] bg-white text-sm text-[#0f4c3a] focus:outline-none focus:ring-2 focus:ring-[#c9a227] focus:border-[#c9a227]" />
        <p class="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
          Awalan <code>08…</code> otomatis dikonversi ke format internasional <code>628…</code> saat disimpan. Kosongkan jika ingin menonaktifkan tautan WhatsApp di halaman login.
        </p>
      </div>
      <div id="admin-wa-preview" class="rounded-lg border border-[#e7dcc3] bg-[#fbf8f1] p-3 text-xs">
        ${getAdminWaPreviewHtml(curWa)}
      </div>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button type="submit" class="min-h-[40px] inline-flex items-center px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold shadow-sm transition">
          Simpan Informasi Admin
        </button>
      </div>
    </form>
  `;
}

function renderBackup() {
  return `
    ${renderPageHeader('Backup Database', 'Unduh salinan lengkap database aplikasi (tanpa token sesi aktif) untuk arsip keamanan.')}
    <div class="rdp-card p-5 max-w-lg space-y-3 text-xs">
      <h2 class="font-bold text-sm text-[#0f4c3a]">Backup Database RDP</h2>
      <p class="text-slate-600 leading-relaxed">Unduh salinan lengkap database (format <code>.db</code> di server lokal atau <code>.sql</code> di Cloudflare D1) yang berisi profil pesantren, kelas, guru, mapel, santri, dan nilai (tanpa token sesi aktif).</p>
      <button type="button" onclick="downloadDatabaseBackup()" class="min-h-[40px] inline-flex items-center px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold shadow-sm transition">Download Backup Database</button>
    </div>
  `;
}

// ===================== AKUN & HAK AKSES (ADMIN) =====================
async function loadUsersList(showDoneToast = false) {
  if (!state.authUser || state.authUser.role !== 'admin') return false;
  if (state._usersLoading) return false;
  state._usersLoading = true;
  try {
    const res = await apiCall('GET', '/api/users');
    if (!state.authUser || state.authUser.role !== 'admin') return false;
    if (res && res.users) {
      state.usersList = res.users;
      state.usersLoaded = true;
      if (state.page === 'users') renderPage();
      if (showDoneToast) showToast('Daftar akun diperbarui');
      return true;
    }
    return false;
  } finally {
    state._usersLoading = false;
  }
}

function renderUsersManagement() {
  if (!state.usersLoaded && !state._usersLoading && location.protocol !== 'file:') {
    loadUsersList();
  }
  const q = (state.usersSearch || '').toLowerCase();
  const rf = state.usersRoleFilter || 'all';
  const filtered = state.usersList.filter(u => {
    if (rf !== 'all' && u.role !== rf) return false;
    if (!q) return true;
    return (u.username || '').toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q);
  });
  const countByRole = {
    all: state.usersList.length,
    admin: state.usersList.filter(u => u.role === 'admin').length,
    guru: state.usersList.filter(u => u.role === 'guru').length,
    siswa: state.usersList.filter(u => u.role === 'siswa').length
  };

  return `
    ${renderPageHeader(
      'Manajemen Akun & Hak Akses',
      'Akun & password guru dari Guru → Data Guru dan santri dari Data Santri otomatis tersinkron ke sini.',
      `<button type="button" onclick="loadUsersList(true)" class="px-3 py-2 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 text-xs font-semibold">Refresh Akun</button>`
    )}
    <div class="rdp-card p-5 space-y-4">
      <form onsubmit="createUserAccount(event)" class="grid sm:grid-cols-3 lg:grid-cols-6 gap-2.5 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3] text-xs">
        <input id="new-u-username" aria-label="Username, NISN, atau NUPTK" type="text" required placeholder="Username / NISN / NUPTK" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
        <input id="new-u-password" aria-label="Password akun baru" type="password" required placeholder="Password" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
        <input id="new-u-name" aria-label="Nama Tampilan" type="text" required placeholder="Nama Tampilan" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
        <select id="new-u-role" aria-label="Role akun" onchange="toggleNewUserLink()" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white">
          <option value="admin">Admin</option>
          <option value="guru" selected>Guru</option>
          <option value="siswa">Siswa</option>
        </select>
        <select id="new-u-teacher" aria-label="Tautkan ke Guru" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white">
          <option value="">- Pilih Guru -</option>
          ${sortByLabel(getActiveTeachers(), t => t.nama).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nama)}</option>`).join('')}
        </select>
        <select id="new-u-student" aria-label="Tautkan ke Santri" class="hidden border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white">
          <option value="">- Pilih Santri -</option>
          ${sortByLabel(state.students, st => st.nama).map(st => `<option value="${st.id}">${escapeHtml(st.nama)} (${escapeHtml(st.kelas)})</option>`).join('')}
        </select>
        <button type="submit" class="py-2 px-3 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">+ Tambah Akun</button>
      </form>
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="flex flex-wrap items-center gap-1.5">
          ${[
            ['all', 'Semua'],
            ['admin', 'Admin'],
            ['guru', 'Guru'],
            ['siswa', 'Siswa']
          ].map(([k, lbl]) => `
            <button type="button" aria-pressed="${rf === k ? 'true' : 'false'}" onclick="state.usersRoleFilter='${k}'; renderPage()" class="min-h-[34px] px-3 py-1 rounded-full font-semibold border transition ${rf === k ? 'bg-[#0f4c3a] text-[#f3e3b0] border-[#0f4c3a]' : 'bg-white text-slate-700 border-[#e7dcc3] hover:bg-[#fbf8f1]'}">${lbl} (${countByRole[k]})</button>
          `).join('')}
        </div>
        <input id="users-search-input" type="search" aria-label="Cari username atau nama tampilan" value="${escapeHtml(state.usersSearch || '')}" oninput="updateSearchAndRender('users-search-input', 'usersSearch', this.value)" placeholder="Cari username / nama..." class="border border-[#e7dcc3] rounded-lg px-3 py-1.5 w-full sm:w-56 bg-white" />
      </div>
      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Username / NUPTK / NISN</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama Tampilan</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">Role</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Tautan Data</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">Status Password</th>
              <th class="px-3 py-2.5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${filtered.length === 0 ? `
              <tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 italic">Tidak ada akun yang cocok.</td></tr>
            ` : filtered.map((u, i) => {
              const linked = u.role === 'guru'
                ? (state.teachers.find(t => t.id === u.teacherId)?.nama || u.teacherId || '-')
                : (u.role === 'siswa' ? (state.students.find(s => s.id === u.studentId)?.nama || `ID ${u.studentId || '-'}`) : 'Akses Penuh');
              const badgeCls = u.role === 'admin'
                ? 'bg-[#0f4c3a]/10 text-[#0f4c3a] border border-[#0f4c3a]/25'
                : (u.role === 'guru' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800');
              return `
                <tr class="hover:bg-[#fbf8f1]">
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono font-semibold">${escapeHtml(u.username)}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold">${escapeHtml(u.displayName)}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${badgeCls}">${escapeHtml(u.role)}</span></td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-slate-600">${escapeHtml(linked)}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center"><span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">Aktif (Terenkripsi)</span></td>
                  <td class="px-3 py-2 text-center space-x-1 whitespace-nowrap">
                    <button type="button" data-uname="${escapeHtml(u.username)}" onclick="resetUserPassword(${u.id}, this.dataset.uname)" class="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold">Reset Password</button>
                    <button type="button" onclick="deleteUserAccount(${u.id})" class="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Hapus</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


function toggleNewUserLink() {
  const role = document.getElementById('new-u-role').value;
  document.getElementById('new-u-teacher').classList.toggle('hidden', role !== 'guru');
  document.getElementById('new-u-student').classList.toggle('hidden', role !== 'siswa');
}

async function createUserAccount(e) {
  e.preventDefault();
  const username = document.getElementById('new-u-username').value.trim();
  const password = document.getElementById('new-u-password').value;
  const displayName = document.getElementById('new-u-name').value.trim();
  const role = document.getElementById('new-u-role').value;
  const teacherId = role === 'guru' ? document.getElementById('new-u-teacher').value || null : null;
  const studentId = role === 'siswa' ? Number(document.getElementById('new-u-student').value) || null : null;
  if (password.trim().length < 6) { showToast('Password minimal 6 karakter'); return; }
  if (role === 'guru' && !teacherId) { showToast('Pilih guru terkait untuk akun Guru'); return; }
  if (role === 'siswa' && !studentId) { showToast('Pilih santri terkait untuk akun Siswa'); return; }
  const res = await apiCall('POST', '/api/users', { username, password, displayName, role, teacherId, studentId });
  if (res && res.ok) {
    showToast(`Akun ${username} (${role}) ditambahkan`);
    await loadUsersList();
  }
}

async function resetUserPassword(uid, uname) {
  const pw = await openInputModal({
    title: 'Reset Password Akun',
    message: `Masukkan password baru untuk akun "${uname}".`,
    label: 'Password Baru (minimal 6 karakter)',
    placeholder: 'Minimal 6 karakter',
    inputType: 'password',
    confirmText: 'Simpan Password',
    validate: (val) => (!val || val.trim().length < 6)
      ? 'Password baru minimal 6 karakter.'
      : null
  });
  if (!pw) return;
  const res = await apiCall('PUT', `/api/users/${uid}/password`, { password: pw });
  if (res && res.ok) showToast(`Password ${uname} diperbarui`);
}

async function deleteUserAccount(uid) {
  const ok = await openConfirmModal({
    title: 'Hapus Akun Pengguna',
    message: 'Hapus akun pengguna ini secara permanen? Tindakan ini tidak dapat dibatalkan.',
    confirmText: 'Hapus Permanen',
    variant: 'danger'
  });
  if (!ok) return;
  const res = await apiCall('DELETE', `/api/users/${uid}`);
  if (res && res.ok) {
    showToast('Akun dihapus');
    await loadUsersList();
  }
}

// ===================== PORTAL SANTRI / SISWA =====================
function getLoggedInStudent() {
  if (state.authUser && state.authUser.role === 'siswa') {
    const sid = Number(state.authUser.studentId);
    return Number.isFinite(sid) ? (state.students.find(s => s.id === sid) || null) : null;
  }
  const sid = state.selectedStudentId;
  return state.students.find(s => s.id === sid) || state.students[0] || null;
}

function renderSiswaDashboard() {
  const st = getLoggedInStudent();
  if (!st) return `<div class="bg-white rounded border p-6 text-xs">Data santri tidak ditemukan.</div>`;
  const { totalWeighted, avg, hasAnyScore } = computeStudentTotals(st);
  const { rank, totalStudents } = getStudentRank(st.id);
  const clsObj = state.classes.find(c => c.kode === st.kelas);
  const wali = clsObj && clsObj.waliId ? state.teachers.find(t => t.id === clsObj.waliId) : null;

  return `
    <div class="space-y-4">
      <div class="bg-white rounded border border-[#e7dcc3] shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div class="text-xs text-slate-500">Portal Santri / Siswa • ${escapeHtml(state.pesantren.tahun)} (${escapeHtml(state.pesantren.semester)})</div>
          <h2 class="text-lg font-bold text-slate-900 mt-0.5">${escapeHtml(st.nama)}</h2>
          <div class="text-xs text-slate-600 mt-1">
            NISN: <span class="font-mono font-semibold">${escapeHtml(st.nisn)}</span> • Kelas: <b>${escapeHtml(st.kelas)}</b> • Wali Kelas: <b>${escapeHtml(wali ? wali.nama : '-')}</b>
          </div>
        </div>
        <button onclick="navigate('siswa-rapor')" class="px-4 py-2 rounded bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-semibold">Lihat &amp; Cetak Rapor Saya (PDF)</button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded bg-[#c9a227] text-[#2b2200] p-4 shadow-sm border border-[#a07d18]/40"><div class="text-2xl font-bold tabular-nums">${hasAnyScore ? avg.toFixed(2) : '–'}</div><div class="text-xs mt-1">Rata-rata Nilai${hasAnyScore ? ` (${escapeHtml(getPredikatArab(avg))})` : ''}</div></div>
        <div class="rounded bg-[#136048] text-white p-4 shadow-sm"><div class="text-2xl font-bold tabular-nums">${hasAnyScore ? `#${rank} <span class="text-sm font-normal">/ ${totalStudents}</span>` : '–'}</div><div class="text-xs mt-1">Peringkat Sementara</div></div>
        <div class="rounded bg-[#1d7a5c] text-white p-4 shadow-sm"><div class="text-2xl font-bold tabular-nums">${hasAnyScore ? totalWeighted : '–'}</div><div class="text-xs mt-1">Total Nilai Terbobot</div></div>
      </div>

      <div class="bg-white rounded border border-[#e7dcc3] shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b bg-[#fbf8f1] font-bold text-xs text-slate-800">Daftar Nilai Mata Pelajaran</div>
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b font-bold">
              <th class="px-3 py-2 text-center w-10">No</th>
              <th class="px-3 py-2">Mata Pelajaran</th>
              <th class="px-3 py-2 text-right arabic-font text-sm">اسم المادة</th>
              <th class="px-3 py-2 text-center">Jam</th>
              <th class="px-3 py-2 text-center">Nilai</th>
              <th class="px-3 py-2 text-center">Predikat</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${state.subjects.map((sub, i) => {
              const rawVal = st.scores ? st.scores[sub.id] : undefined;
              const hasVal = hasScoreValue(rawVal);
              const sc = hasVal ? Number(rawVal) : null;
              const isBelowKkm = hasVal && sc < getActiveKkm();
              return `
                <tr>
                  <td class="px-3 py-2 text-center">${i + 1}</td>
                  <td class="px-3 py-2 font-semibold">${escapeHtml(sub.namaId)}</td>
                  <td class="px-3 py-2 text-right arabic-font text-base">${escapeHtml(sub.namaArab)}</td>
                  <td class="px-3 py-2 text-center">${sub.jam}</td>
                  <td class="px-3 py-2 text-center font-bold tabular-nums${isBelowKkm ? ' text-[#d90000]' : ''}">${hasVal ? sc : '–'}</td>
                  <td class="px-3 py-2 text-center arabic-font text-sm font-bold${isBelowKkm ? ' text-[#d90000]' : ''}">${hasVal ? escapeHtml(getPredikatArab(sc)) : '–'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


function renderSiswaRapor() {
  const st = getLoggedInStudent();
  if (!st) return `<div class="rdp-card p-6 text-xs">Data santri tidak ditemukan.</div>`;
  const clsObj = state.classes.find(c => c.kode === st.kelas);
  const wali = clsObj && clsObj.waliId ? state.teachers.find(t => t.id === clsObj.waliId) : null;
  const effSubjects = getEffectiveSubjects(st.kelas || null);
  const kkm = getActiveKkm();
  const totals = computeStudentTotals(st);
  const rankInfo = getStudentRank(st.id);
  const totalSubjects = effSubjects.length;
  const scoredSubjects = effSubjects.filter(sub => hasScoreValue(st.scores && st.scores[sub.id]));
  const scoredCount = scoredSubjects.length;
  const tuntasCount = scoredSubjects.filter(sub => Number(st.scores[sub.id]) >= kkm).length;
  const belowKkmCount = scoredCount - tuntasCount;
  const avgPredikat = totals.hasAnyScore ? getPredikatArab(totals.avg) : '—';
  const arch = st.archiveNotice || null;
  const displayTahun = (arch && arch.archivedTahun) || state.pesantren.tahun;
  const displaySemester = (arch && arch.archivedSemester) || state.pesantren.semester;

  return `
    <div class="max-w-3xl mx-auto space-y-4">
      <div class="rdp-card overflow-hidden">
        <div class="bg-[#0f4c3a] text-white px-5 py-4 border-b-2 border-[#c9a227]">
          <div class="text-[11px] uppercase tracking-[0.2em] text-[#d9b84a] font-semibold">Portal Rapor Santri / Siswa</div>
          <h1 class="text-lg sm:text-xl font-extrabold mt-0.5">${escapeHtml(st.nama)}</h1>
          <div class="text-xs text-[#e3eee9] mt-0.5">${escapeHtml(state.pesantren.nama)} • Tahun Pelajaran ${escapeHtml(displayTahun)} (${escapeHtml(displaySemester)})${arch ? ' — Arsip Semester Terakhir' : ''}</div>
        </div>
        <div class="p-5 space-y-4">
          ${arch ? `
            <div role="status" class="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1">
              <div class="font-bold flex items-center gap-1.5">
                <span aria-hidden="true">ℹ</span>
                <span>Status Semester ${escapeHtml(arch.semester)} ${escapeHtml(arch.tahun)}: Mutasi Keluar${arch.mutasiTanggal ? ` (${escapeHtml(arch.mutasiTanggal)})` : ''}</span>
              </div>
              <div class="text-amber-900">
                Menampilkan arsip rapor semester aktif terakhir Anda: <b>Semester ${escapeHtml(arch.archivedSemester)} ${escapeHtml(arch.archivedTahun)} — Kelas ${escapeHtml(arch.archivedKelas)}</b>.
                ${arch.mutasiCatatan ? ` Catatan: ${escapeHtml(arch.mutasiCatatan)}.` : ''}
              </div>
            </div>
          ` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div class="p-3 rounded-lg bg-[#fbf8f1] border border-[#e7dcc3]">
              <div class="text-[11px] uppercase text-slate-500 font-semibold">NISN</div>
              <div class="font-mono font-bold text-[#0f4c3a] mt-0.5">${escapeHtml(st.nisn || '-')}</div>
            </div>
            <div class="p-3 rounded-lg bg-[#fbf8f1] border border-[#e7dcc3]">
              <div class="text-[11px] uppercase text-slate-500 font-semibold">Kelas</div>
              <div class="font-bold text-[#0f4c3a] mt-0.5">${escapeHtml(st.kelas || '-')}</div>
            </div>
            <div class="p-3 rounded-lg bg-[#fbf8f1] border border-[#e7dcc3]">
              <div class="text-[11px] uppercase text-slate-500 font-semibold">Wali Kelas</div>
              <div class="font-bold text-[#0f4c3a] mt-0.5 truncate">${escapeHtml(wali ? wali.nama : '-')}</div>
            </div>
          </div>

          <!-- RINGKASAN CAPAIAN SEMESTER -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h2 class="text-xs font-bold uppercase tracking-wider text-[#0f4c3a]">Ringkasan Capaian Semester</h2>
              <span class="text-xs text-slate-500">KKM Aktif: <b class="text-[#0f4c3a] tabular-nums">${kkm}</b></span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div class="p-3.5 rounded-xl bg-white border border-[#e7dcc3] space-y-1">
                <div class="text-slate-500 font-semibold">Rata-rata Nilai</div>
                <div class="flex items-baseline justify-between gap-2">
                  <span class="text-2xl font-extrabold text-[#0f4c3a] tabular-nums">${totals.hasAnyScore ? totals.avg.toFixed(2) : '–'}</span>
                  <span class="arabic-font text-base font-bold text-[#a07d18]" dir="rtl">${escapeHtml(avgPredikat)}</span>
                </div>
                <div class="text-[11px] text-slate-500">Berbobot jam pelajaran</div>
              </div>
              <div class="p-3.5 rounded-xl bg-white border border-[#e7dcc3] space-y-1.5">
                <div class="text-slate-500 font-semibold">Ketuntasan (KKM ${kkm})</div>
                <div class="text-xl font-extrabold text-[#0f4c3a] tabular-nums">${tuntasCount} / ${scoredCount} <span class="text-xs font-semibold text-slate-500">Mapel</span></div>
                <div>
                  ${scoredCount === 0
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">Menunggu input nilai</span>`
                    : (belowKkmCount === 0
                      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">✓ Semua Tuntas</span>`
                      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">⚠ ${belowKkmCount} &lt; KKM</span>`)}
                </div>
              </div>
              <div class="p-3.5 rounded-xl bg-white border border-[#e7dcc3] space-y-1">
                <div class="text-slate-500 font-semibold">Peringkat &amp; Kelengkapan</div>
                <div class="text-2xl font-extrabold text-[#0f4c3a] tabular-nums">${totals.hasAnyScore ? `#${rankInfo.rank}` : '–'} <span class="text-xs font-semibold text-slate-500">${totals.hasAnyScore ? `/ ${rankInfo.totalStudents}` : ''}</span></div>
                <div class="text-[11px] text-slate-500 tabular-nums">${scoredCount} dari ${totalSubjects} mapel terisi</div>
              </div>
            </div>
          </div>

          <div class="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div class="text-sm font-bold text-[#0f4c3a]">Rapor Digital Pesantren (صحيفة الدرجات)</div>
              <div class="text-xs text-slate-600 mt-0.5">Buka pratinjau atau unduh/cetak rapor resmi Anda dalam format PDF.</div>
            </div>
            <div class="flex flex-wrap gap-2 text-xs flex-shrink-0">
              <button type="button" onclick="previewSingleRapor(${st.id})" class="min-h-[40px] px-4 py-2 rounded-lg border border-[#136048] bg-white hover:bg-emerald-50 text-[#0f4c3a] font-semibold shadow-sm transition">
                Pratinjau Rapor
              </button>
              <button type="button" onclick="printSingleRapor(${st.id})" class="min-h-[40px] px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold shadow-sm transition">
                ${arch ? 'Cetak / Download PDF Arsip' : 'Cetak / Download PDF'}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button type="button" onclick="navigate('siswa-profil')" class="p-3.5 rounded-xl border border-[#e7dcc3] bg-[#fbf8f1] hover:bg-[#f2ead6] text-left transition flex items-center justify-between gap-2">
              <div>
                <div class="text-xs font-bold text-[#0f4c3a]">Cek Data Diri</div>
                <div class="text-xs text-slate-500 mt-0.5">Periksa biodata &amp; identitas santri Anda</div>
              </div>
              <span class="text-[#a07d18] font-bold text-sm" aria-hidden="true">&rarr;</span>
            </button>
            <button type="button" onclick="navigate('siswa-password')" class="p-3.5 rounded-xl border border-[#e7dcc3] bg-[#fbf8f1] hover:bg-[#f2ead6] text-left transition flex items-center justify-between gap-2">
              <div>
                <div class="text-xs font-bold text-[#0f4c3a]">Ganti Password</div>
                <div class="text-xs text-slate-500 mt-0.5">Ubah kata sandi akun santri Anda</div>
              </div>
              <span class="text-[#a07d18] font-bold text-sm" aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}


function renderSiswaProfil() {
  const st = getLoggedInStudent();
  if (!st) return `<div class="rdp-card p-6 text-xs">Data santri tidak ditemukan.</div>`;
  const clsObj = state.classes.find(c => c.kode === st.kelas);
  const wali = clsObj && clsObj.waliId ? state.teachers.find(t => t.id === clsObj.waliId) : null;
  const rows = [
    ['Nama Lengkap', st.nama || '-'],
    ['NIS', st.nis || '-'],
    ['NISN', st.nisn || '-'],
    ['NIK', st.nik || '-'],
    ['Kelas', st.kelas || '-'],
    ['Wali Kelas', wali ? wali.nama : '-'],
    ['Jenis Kelamin', st.jk || '-'],
    ['Tempat, Tanggal Lahir', `${st.tempatLahir || '-'}${st.tglLahir ? ', ' + st.tglLahir : ''}`],
    ['Alamat', st.alamat || '-'],
    ['No. Telepon / WA', st.telp || '-'],
    ['Nama Ayah', st.ayah || '-'],
    ['Nama Ibu', st.ibu || '-'],
    ['Nama Wali', st.wali || '-']
  ];

  return `
    <div class="max-w-2xl mx-auto space-y-4">
      <div class="rdp-card overflow-hidden">
        <div class="bg-[#0f4c3a] text-white px-5 py-4 border-b-2 border-[#c9a227] flex items-center justify-between gap-3">
          <div>
            <div class="text-[11px] uppercase tracking-[0.2em] text-[#d9b84a] font-semibold">Cek Data Diri Santri</div>
            <h1 class="text-base sm:text-lg font-extrabold mt-0.5">${escapeHtml(st.nama)}</h1>
          </div>
          <button type="button" onclick="navigate('siswa-rapor')" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold">
            &larr; Rapor Saya
          </button>
        </div>
        <div class="p-4 sm:p-5">
          <div class="divide-y divide-[#e7dcc3] border border-[#e7dcc3] rounded-lg overflow-hidden text-xs">
            ${rows.map(([label, val]) => `
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-1 px-3.5 py-2.5 bg-white hover:bg-[#fbf8f1]">
                <div class="font-semibold text-slate-500">${escapeHtml(label)}</div>
                <div class="sm:col-span-2 font-semibold text-[#0f4c3a] break-words">${escapeHtml(val)}</div>
              </div>
            `).join('')}
          </div>
          <div class="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            Jika terdapat kesalahan penulisan nama, NISN, atau data diri lainnya, silakan hubungi <b>Operator / Wali Kelas</b> untuk pembaruan data.
          </div>
        </div>
      </div>
    </div>
  `;
}


function renderSiswaPassword() {
  const eyeBtns = (id) => `
    <button type="button" onclick="togglePasswordVisibility('${id}', this)" class="absolute inset-y-0 right-0 px-2.5 flex items-center text-slate-400 hover:text-[#0f4c3a] focus:outline-none" title="Tampilkan / Sembunyikan Password" aria-label="Tampilkan atau sembunyikan password">
      <svg class="w-4 h-4 eye-open" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
      <svg class="w-4 h-4 eye-closed hidden" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
    </button>
  `;

  return `
    <div class="max-w-lg mx-auto space-y-4">
      <div class="rdp-card overflow-hidden">
        <div class="bg-[#0f4c3a] text-white px-5 py-4 border-b-2 border-[#c9a227] flex items-center justify-between gap-3">
          <div>
            <div class="text-[11px] uppercase tracking-[0.2em] text-[#d9b84a] font-semibold">Keamanan Akun Santri</div>
            <h1 class="text-base sm:text-lg font-extrabold mt-0.5">Ganti Password</h1>
          </div>
          <button type="button" onclick="navigate('siswa-rapor')" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold">
            &larr; Rapor Saya
          </button>
        </div>
        <form onsubmit="submitChangeOwnPassword(event)" class="p-5 space-y-3.5 text-xs">
          <div id="siswa-pw-msg" role="status" class="hidden px-3 py-2 rounded-lg text-xs font-semibold"></div>
          <div>
            <label for="siswa-pw-old" class="block font-semibold text-[#0f4c3a] mb-1">Password Lama</label>
            <div class="relative">
              <input id="siswa-pw-old" type="password" required placeholder="Masukkan password saat ini" class="w-full px-3 py-2 pr-10 rounded-lg border border-[#e7dcc3] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a227]" />
              ${eyeBtns('siswa-pw-old')}
            </div>
          </div>
          <div>
            <label for="siswa-pw-new" class="block font-semibold text-[#0f4c3a] mb-1">Password Baru</label>
            <div class="relative">
              <input id="siswa-pw-new" type="password" required minlength="6" placeholder="Minimal 6 karakter" class="w-full px-3 py-2 pr-10 rounded-lg border border-[#e7dcc3] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a227]" />
              ${eyeBtns('siswa-pw-new')}
            </div>
          </div>
          <div>
            <label for="siswa-pw-confirm" class="block font-semibold text-[#0f4c3a] mb-1">Konfirmasi Password Baru</label>
            <div class="relative">
              <input id="siswa-pw-confirm" type="password" required minlength="6" placeholder="Ulangi password baru" class="w-full px-3 py-2 pr-10 rounded-lg border border-[#e7dcc3] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#c9a227]" />
              ${eyeBtns('siswa-pw-confirm')}
            </div>
          </div>
          <div class="pt-1">
            <button type="submit" class="w-full min-h-[42px] py-2.5 px-4 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold uppercase tracking-wider shadow transition">
              Simpan Password Baru
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}


async function submitChangeOwnPassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('siswa-pw-old').value;
  const newPassword = document.getElementById('siswa-pw-new').value;
  const confirmPassword = document.getElementById('siswa-pw-confirm').value;
  const msgEl = document.getElementById('siswa-pw-msg');

  const showMsg = (text, ok) => {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = ok
      ? 'px-3 py-2 rounded text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800'
      : 'px-3 py-2 rounded text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700';
  };

  if (newPassword.trim().length < 6) {
    showMsg('Password baru minimal 6 karakter (tanpa spasi saja).', false);
    return;
  }
  if (newPassword !== confirmPassword) {
    showMsg('Konfirmasi password baru tidak cocok.', false);
    return;
  }

  if (location.protocol === 'file:') {
    showMsg('Mode offline: jalankan server untuk menyimpan password baru.', false);
    return;
  }

  try {
    const res = await fetch('/api/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearClientSessionData(false);
      showLogin();
      showToast('Sesi berakhir, silakan login kembali');
      return;
    }
    if (!res.ok) {
      showMsg(data.error || 'Gagal mengganti password.', false);
      return;
    }
    document.getElementById('siswa-pw-old').value = '';
    document.getElementById('siswa-pw-new').value = '';
    document.getElementById('siswa-pw-confirm').value = '';
    showMsg('Password berhasil diperbarui!', true);
    showToast('Password berhasil diganti');
  } catch (err) {
    showMsg('Gagal terhubung ke server.', false);
  }
}

// Init
function applyAllLocalScoreDrafts() {
  if (state.mode !== 'guru' || !state.activeTeacherId) return;
  const prefix = `${getActivePeriodDraftPrefix()}${state.activeTeacherId}_`;
  const sentKeys = new Set();
  const allowedUnsentKeys = new Set();
  for (const a of (state.assignments || [])) {
    if (a.teacherId !== state.activeTeacherId) continue;
    const sub = state.subjects.find(s => s.namaArab === a.mapel);
    if (!sub) continue;
    const keyStr = `${a.kode}::${sub.id}`;
    if (a.sent) sentKeys.add(keyStr);
    else allowedUnsentKeys.add(keyStr);
  }

  // Hapus draft lama untuk penugasan yang sudah dikirim (sent=true) agar tidak menimpa nilai resmi saat Batalkan Kirim
  const staleToRemove = [];
  const matchingKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const lastUnderscore = rest.lastIndexOf('_');
    if (lastUnderscore <= 0) continue;
    const keyKelas = rest.slice(0, lastUnderscore);
    const subId = Number(rest.slice(lastUnderscore + 1));
    if (!Number.isFinite(subId) || subId <= 0) continue;
    const kPair = `${keyKelas}::${subId}`;
    if (sentKeys.has(kPair)) {
      staleToRemove.push(key);
    } else if (allowedUnsentKeys.has(kPair)) {
      matchingKeys.push({ key, keyKelas, subId });
    }
  }
  for (const k of staleToRemove) {
    try { localStorage.removeItem(k); } catch (_) {}
  }

  // Hanya terapkan draft lokal saat Guru berada di halaman input nilai (jangan mencemari Rapor/Ledger Wali Kelas)
  if (state.page !== 'penilaian') return;
  for (const { key, keyKelas, subId } of matchingKeys) {
    try {
      const map = JSON.parse(localStorage.getItem(key) || '{}');
      if (!map || typeof map !== 'object') continue;
      state.students.filter(st => st.kelas === keyKelas).forEach(st => {
        if (!st.scores) st.scores = {};
        if (Object.prototype.hasOwnProperty.call(map, String(st.id))) {
          const v = map[String(st.id)];
          if (v === null || v === '') {
            delete st.scores[subId];
          } else {
            const n = Number(v);
            if (Number.isFinite(n) && n >= 0 && n <= 100) st.scores[subId] = Math.round(n);
          }
        }
      });
    } catch (_) {}
  }
}

function applyRemoteStatePayload(remote, preserveNav = true, preserveScoreFocus = false) {
  if (!remote || !state.authUser) return false;
  if (!remote.pesantren || !remote.pesantren.mediaOmitted) {
    state._mediaStamp = (remote.pesantren && remote.pesantren.mediaStamp) || computeLocalMediaStamp(remote.pesantren);
  }
  state.pesantren = remote.pesantren;
  state.bobot = remote.bobot;
  state.classes = remote.classes;
  state.subjects = remote.subjects;
  state.teachers = remote.teachers;
  state.assignments = remote.assignments;
  state.students = remote.students;
  state.mutatedStudents = Array.isArray(remote.mutatedStudents) ? remote.mutatedStudents : [];
  state.activities = remote.activities;
  if (!preserveNav && state.authUser) applyAuthRole(state.authUser);
  if (state.authUser && state.authUser.role === 'admin') {
    if (!state.teachers.some(t => t.id === state.activeTeacherId) && state.teachers.length > 0) {
      state.activeTeacherId = state.teachers[0].id;
    }
  }
  applyAllLocalScoreDrafts();
  updateSidebarLogo();
  updateFooterPesantren();
  renderTeacherSwitcherOptions();
  renderModeButtons();
  renderSidebar();
  const activeEl = document.activeElement;
  const isEditingScoreCell = preserveScoreFocus && state.page === 'penilaian' && activeEl && (
    (activeEl.id && activeEl.id.startsWith('nilai-cell-'))
    || activeEl.id === 'default-nilai-input'
    || activeEl.id === 'default-nilai-input-mob'
  );
  if (!isEditingScoreCell) {
    renderPage();
  }
  return true;
}

async function refreshStateFromServer(preserveNav = true, preserveScoreFocus = false) {
  const seq = ++_stateFetchSeq;
  const useOmitMedia = Boolean(state._mediaStamp);
  let remote = await apiCall('GET', useOmitMedia ? '/api/state?omitMedia=1' : '/api/state');
  if (seq !== _stateFetchSeq || !state.authUser) return false;
  if (!remote) return false;
  if (remote.pesantren && remote.pesantren.mediaOmitted) {
    if (remote.pesantren.mediaStamp !== state._mediaStamp) {
      remote = await apiCall('GET', '/api/state');
      if (seq !== _stateFetchSeq || !state.authUser) return false;
      if (!remote) return false;
    } else {
      remote.pesantren.logoDataUrl = (state.pesantren && state.pesantren.logoDataUrl) || null;
      remote.pesantren.watermarkDataUrl = (state.pesantren && state.pesantren.watermarkDataUrl) || null;
    }
  }
  return applyRemoteStatePayload(remote, preserveNav, preserveScoreFocus);
}

async function loadDbState() {
  return refreshStateFromServer(false);
}

function trapFocusInOverlay(overlay, ev) {
  if (!overlay || overlay.classList.contains('hidden') || ev.key !== 'Tab') return false;
  const focusables = Array.from(overlay.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null);
  if (focusables.length === 0) return false;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (ev.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
    ev.preventDefault();
    last.focus();
    return true;
  }
  if (!ev.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
    ev.preventDefault();
    first.focus();
    return true;
  }
  return true;
}

document.addEventListener('keydown', (ev) => {
  if (_rdpModalState) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeRdpModal(null);
      return;
    }
    if (ev.key === 'Tab') {
      trapFocusInOverlay(document.getElementById('rdp-modal-overlay'), ev);
      return;
    }
  }
  const studentDlg = document.getElementById('student-action-modal-overlay');
  if (studentDlg && !studentDlg.classList.contains('hidden')) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeStudentActionModal();
      return;
    }
    if (ev.key === 'Tab') {
      trapFocusInOverlay(studentDlg, ev);
      return;
    }
  }
  const assignDlg = document.getElementById('assign-modal-overlay');
  if (assignDlg && !assignDlg.classList.contains('hidden')) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeAssignModal();
      return;
    }
    if (ev.key === 'Tab') {
      trapFocusInOverlay(assignDlg, ev);
      return;
    }
  }
  const loginDlg = document.getElementById('login-screen');
  if (loginDlg && !loginDlg.classList.contains('hidden')) {
    if (ev.key === 'Tab') {
      trapFocusInOverlay(loginDlg, ev);
    }
    return;
  }
  if (ev.key !== 'Escape') return;
  if (state.sidebarOpenMobile) {
    closeMobileSidebar();
    return;
  }
  const addTeacherForm = document.getElementById('form-add-teacher');
  if (addTeacherForm && !addTeacherForm.classList.contains('hidden')) {
    addTeacherForm.classList.add('hidden');
  }
  document.querySelectorAll('[role="dialog"]:not(#login-screen):not(#rdp-modal-overlay):not(.hidden)').forEach((dlg) => {
    dlg.classList.add('hidden');
  });
});

let _lastGlobalErrorToastAt = 0;
function notifyGlobalClientError(errLike) {
  const msg = String((errLike && (errLike.message || errLike.reason)) || errLike || '');
  if (/ResizeObserver loop/i.test(msg)) return;
  console.error('[RDP CLIENT ERROR]', errLike);
  const now = Date.now();
  if (now - _lastGlobalErrorToastAt > 5000) {
    _lastGlobalErrorToastAt = now;
    try {
      showToast('Terjadi kesalahan pada tampilan aplikasi. Silakan muat ulang halaman jika masalah berlanjut.');
    } catch (_) {}
  }
}
window.addEventListener('error', (ev) => {
  if (ev && (ev.error || ev.message)) notifyGlobalClientError(ev.error || ev.message);
});
window.addEventListener('unhandledrejection', (ev) => {
  notifyGlobalClientError(ev ? ev.reason : 'Unhandled rejection');
});

function renderLoadingSkeleton() {
  const el = document.getElementById('main-content');
  if (!el) return;
  el.innerHTML = `
    <div role="status" aria-busy="true" aria-label="Memuat data aplikasi" class="space-y-5">
      <div class="h-8 w-56 rounded-lg rdp-skeleton"></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="h-24 rounded-xl border border-[#e7dcc3] rdp-skeleton"></div>
        <div class="h-24 rounded-xl border border-[#e7dcc3] rdp-skeleton"></div>
        <div class="h-24 rounded-xl border border-[#e7dcc3] rdp-skeleton"></div>
        <div class="h-24 rounded-xl border border-[#e7dcc3] rdp-skeleton"></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-[8fr_5fr] gap-5">
        <div class="h-64 rounded-xl border border-[#e7dcc3] rdp-skeleton"></div>
        <div class="h-64 rounded-xl border border-[#e7dcc3] rdp-skeleton"></div>
      </div>
    </div>
  `;
}

async function initApp() {
  if (location.protocol === 'file:') {
    renderModeButtons();
    renderSidebar();
    renderPage();
    return;
  }
  renderLoadingSkeleton();
  const boot = await apiCall('GET', '/api/bootstrap');
  if (boot && boot.authenticated && boot.user && boot.state) {
    applyAuthRole(boot.user);
    const ok = applyRemoteStatePayload(boot.state, false, false);
    if (ok) {
      closeLogin();
      return;
    }
  }
  clearClientSessionData(false);
  if (boot && boot.branding) {
    updateLoginBranding(boot.branding);
  } else {
    await loadPublicBranding();
  }
  showLogin();
}
initApp();
