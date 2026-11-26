// ===================== DATA SANTRI / SISWA (SYNC EMIS & EXCEL UPLOAD/TEMPLATE) =====================
function onSiswaTingkatChange(tingkat) {
  state.selectedSiswaTingkat = tingkat;
  state.selectedSiswaKelas = '';
  renderPage();
}

function onSiswaKelasChange(kelas) {
  state.selectedSiswaKelas = kelas;
  renderPage();
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur.trim());
  return result;
}

let _studentModalState = null;

function closeStudentActionModal() {
  const overlay = document.getElementById('student-action-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  const prev = _studentModalState && _studentModalState.prevFocus;
  _studentModalState = null;
  try {
    if (prev && typeof prev.focus === 'function') prev.focus();
  } catch (_) {}
}

function _openStudentActionOverlay({ mode, studentId = null, title, subtitle, submitText, submitVariant = 'primary', bodyHtml, focusId }) {
  const overlay = document.getElementById('student-action-modal-overlay');
  const titleEl = document.getElementById('student-action-modal-title');
  const subEl = document.getElementById('student-action-modal-subtitle');
  const bodyEl = document.getElementById('student-action-modal-body');
  const submitBtn = document.getElementById('student-action-modal-submit');
  if (!overlay || !bodyEl || !submitBtn) return;

  _studentModalState = { mode, studentId, prevFocus: document.activeElement };
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle || '';
  bodyEl.innerHTML = bodyHtml;
  submitBtn.textContent = submitText || 'Simpan';
  submitBtn.className = submitVariant === 'danger'
    ? 'px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-sm transition'
    : 'px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold shadow-sm transition';
  overlay.classList.remove('hidden');
  setTimeout(() => {
    const el = focusId ? document.getElementById(focusId) : null;
    if (el) el.focus();
  }, 15);
}

function openAddStudentModal() {
  const sortedClasses = sortClasses(state.classes || []);
  if (sortedClasses.length === 0) {
    showToast('Tambahkan kelas terlebih dahulu di menu Kelas → Wali Kelas');
    return;
  }
  const defaultKelas = state.selectedSiswaKelas && sortedClasses.some(c => c.kode === state.selectedSiswaKelas)
    ? state.selectedSiswaKelas
    : sortedClasses[0].kode;
  const p = state.pesantren || {};
  const todayIso = new Date().toISOString().slice(0, 10);

  _openStudentActionOverlay({
    mode: 'add',
    title: 'Tambah Santri / Mutasi Masuk',
    subtitle: `Periode aktif: Semester ${p.semester || 'Ganjil'} • ${p.tahun || '2026/2027'}`,
    submitText: '+ Simpan Santri',
    focusId: 'sa-nama',
    bodyHtml: `
      <div class="p-3 rounded-lg bg-[#fbf8f1] border border-[#e7dcc3] text-slate-600 leading-relaxed">
        Santri baru atau <b>mutasi masuk</b> akan langsung terdaftar aktif pada <b>Semester ${escapeHtml(p.semester || 'Ganjil')} (${escapeHtml(p.tahun || '')})</b> tanpa memengaruhi daftar santri di semester sebelumnya.
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2">
          <label for="sa-nama" class="block font-semibold text-[#0f4c3a] mb-1">Nama Lengkap Santri <span class="text-rose-600">*</span></label>
          <input id="sa-nama" type="text" required placeholder="Nama lengkap sesuai data resmi" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label for="sa-kelas" class="block font-semibold text-[#0f4c3a] mb-1">Kelas Penempatan <span class="text-rose-600">*</span></label>
          <select id="sa-kelas" required class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold">
            ${sortedClasses.map(c => `<option value="${escapeHtml(c.kode)}" ${c.kode === defaultKelas ? 'selected' : ''}>Kelas ${escapeHtml(c.kode)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="sa-jk" class="block font-semibold text-[#0f4c3a] mb-1">Jenis Kelamin</label>
          <select id="sa-jk" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white">
            <option value="Laki-laki">L (Laki-laki)</option>
            <option value="Perempuan">P (Perempuan)</option>
          </select>
        </div>
        <div>
          <label for="sa-nisn" class="block font-semibold text-[#0f4c3a] mb-1">NISN (juga Username Login)</label>
          <input id="sa-nisn" type="text" placeholder="Contoh: 0138811379" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-mono" />
        </div>
        <div>
          <label for="sa-nis" class="block font-semibold text-[#0f4c3a] mb-1">NIS</label>
          <input id="sa-nis" type="text" placeholder="Opsional" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-mono" />
        </div>
        <div>
          <label for="sa-tempat" class="block font-semibold text-[#0f4c3a] mb-1">Tempat Lahir</label>
          <input id="sa-tempat" type="text" placeholder="Kabupaten / Kota" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label for="sa-tgl" class="block font-semibold text-[#0f4c3a] mb-1">Tanggal Lahir</label>
          <input id="sa-tgl" type="text" placeholder="Contoh: 15-07-2013" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div class="sm:col-span-2">
          <label for="sa-alamat" class="block font-semibold text-[#0f4c3a] mb-1">Alamat</label>
          <input id="sa-alamat" type="text" placeholder="Alamat tempat tinggal santri" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label for="sa-ayah" class="block font-semibold text-[#0f4c3a] mb-1">Nama Ayah / Wali</label>
          <input id="sa-ayah" type="text" placeholder="Nama orang tua / wali" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label for="sa-mutasi-tgl" class="block font-semibold text-[#0f4c3a] mb-1">Tanggal Masuk (Opsional)</label>
          <input id="sa-mutasi-tgl" type="date" value="${escapeHtml(todayIso)}" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div class="sm:col-span-2">
          <label for="sa-mutasi-cat" class="block font-semibold text-[#0f4c3a] mb-1">Keterangan Mutasi Masuk (Opsional)</label>
          <input id="sa-mutasi-cat" type="text" maxlength="200" placeholder="Mis. Pindahan dari MTs ... pada Semester 2" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
      </div>
    `
  });
}

function openMoveStudentModal(studentId) {
  const st = state.students.find(s => s.id === Number(studentId));
  if (!st) return;
  const targetChoices = sortClasses((state.classes || []).filter(c => c.kode !== st.kelas));
  if (targetChoices.length === 0) {
    showToast('Belum ada kelas lain yang tersedia sebagai tujuan pindah kelas');
    return;
  }
  const p = state.pesantren || {};
  _openStudentActionOverlay({
    mode: 'move',
    studentId: st.id,
    title: 'Pindah Kelas Santri',
    subtitle: `${st.nama} • Kelas saat ini: ${st.kelas}`,
    submitText: 'Pindahkan Kelas',
    focusId: 'sa-target-kelas',
    bodyHtml: `
      <div class="p-3 rounded-lg bg-[#fbf8f1] border border-[#e7dcc3] text-slate-700 leading-relaxed">
        Perpindahan hanya berlaku pada <b>Semester ${escapeHtml(p.semester || 'Ganjil')} (${escapeHtml(p.tahun || '')})</b>. Riwayat kelas pada semester sebelumnya tetap tercatat <b>${escapeHtml(st.kelas)}</b>, sedangkan nilai semester aktif ikut terbawa ke kelas baru.
      </div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <div class="font-semibold text-[#0f4c3a] mb-1">Kelas Asal</div>
          <div class="px-3 py-2 rounded-lg border border-[#e7dcc3] bg-slate-100 font-bold text-slate-700">Kelas ${escapeHtml(st.kelas)}</div>
        </div>
        <div>
          <label for="sa-target-kelas" class="block font-semibold text-[#0f4c3a] mb-1">Kelas Tujuan <span class="text-rose-600">*</span></label>
          <select id="sa-target-kelas" required class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold">
            ${targetChoices.map(c => `<option value="${escapeHtml(c.kode)}">Kelas ${escapeHtml(c.kode)}</option>`).join('')}
          </select>
        </div>
      </div>
    `
  });
}

function openMutasiKeluarModal(studentId) {
  const st = state.students.find(s => s.id === Number(studentId));
  if (!st) return;
  const p = state.pesantren || {};
  const todayIso = new Date().toISOString().slice(0, 10);
  _openStudentActionOverlay({
    mode: 'mutasi_keluar',
    studentId: st.id,
    title: 'Tandai Mutasi Keluar',
    subtitle: `${st.nama} • Kelas ${st.kelas}`,
    submitText: 'Tandai Mutasi Keluar',
    submitVariant: 'danger',
    focusId: 'sa-mutasi-cat',
    bodyHtml: `
      <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 leading-relaxed">
        Santri akan dikeluarkan dari daftar penilaian, rapor, ranking, dan ledger <b>Semester ${escapeHtml(p.semester || 'Ganjil')} (${escapeHtml(p.tahun || '')})</b>. Arsip nilai semester sebelumnya tetap tersimpan aman, dan santri tetap bisa login untuk melihat rapor terakhirnya.
      </div>
      <div class="space-y-3">
        <div>
          <label for="sa-mutasi-tgl" class="block font-semibold text-[#0f4c3a] mb-1">Tanggal Mutasi Keluar</label>
          <input id="sa-mutasi-tgl" type="date" value="${escapeHtml(todayIso)}" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
        <div>
          <label for="sa-mutasi-cat" class="block font-semibold text-[#0f4c3a] mb-1">Catatan / Sekolah Tujuan (Opsional)</label>
          <input id="sa-mutasi-cat" type="text" maxlength="200" placeholder="Mis. Pindah ke MTsN / Pondok lain" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
        </div>
      </div>
    `
  });
}

async function submitStudentActionModal(e) {
  e.preventDefault();
  if (!_studentModalState) return;
  const { mode, studentId } = _studentModalState;
  const submitBtn = document.getElementById('student-action-modal-submit');
  setButtonBusy(submitBtn, true, 'Menyimpan...');
  try {
    if (mode === 'add') {
      const nama = (document.getElementById('sa-nama')?.value || '').trim();
      const kelas = (document.getElementById('sa-kelas')?.value || '').trim();
      const jk = document.getElementById('sa-jk')?.value || 'Laki-laki';
      const nisn = (document.getElementById('sa-nisn')?.value || '').trim();
      const nis = (document.getElementById('sa-nis')?.value || '').trim();
      const tempatLahir = (document.getElementById('sa-tempat')?.value || '').trim();
      const tglLahir = (document.getElementById('sa-tgl')?.value || '').trim();
      const alamat = (document.getElementById('sa-alamat')?.value || '').trim();
      const ayah = (document.getElementById('sa-ayah')?.value || '').trim();
      const mutasiTanggal = (document.getElementById('sa-mutasi-tgl')?.value || '').trim();
      const mutasiCatatan = (document.getElementById('sa-mutasi-cat')?.value || '').trim();
      if (!nama || !kelas) { showToast('Nama dan kelas santri wajib diisi'); return; }
      const payload = {
        tahun: state.pesantren.tahun,
        semester: state.pesantren.semester,
        nama,
        kelas,
        jk,
        nisn,
        nis,
        tempatLahir,
        tglLahir,
        alamat,
        ayah,
        wali: ayah,
        mutasiTanggal,
        mutasiCatatan
      };
      const res = await apiCall('POST', '/api/students', payload);
      if (!res || !res.ok) return;
      state.selectedSiswaTingkat = getKelasTingkat(kelas);
      state.selectedSiswaKelas = kelas;
      state.siswaViewTab = 'aktif';
      closeStudentActionModal();
      await refreshStateFromServer(true);
      await loadUsersList();
      showToast(`Santri ${nama} ditambahkan ke Kelas ${kelas}`);
    } else if (mode === 'move') {
      const targetKelas = (document.getElementById('sa-target-kelas')?.value || '').trim();
      if (!targetKelas) { showToast('Pilih kelas tujuan terlebih dahulu'); return; }
      const res = await apiCall('PUT', `/api/students/${studentId}/move-class`, {
        targetKelas,
        tahun: state.pesantren.tahun,
        semester: state.pesantren.semester
      });
      if (!res || !res.ok) return;
      closeStudentActionModal();
      await refreshStateFromServer(true);
      showToast(`Santri dipindahkan ke Kelas ${targetKelas}`);
    } else if (mode === 'mutasi_keluar') {
      const mutasiTanggal = (document.getElementById('sa-mutasi-tgl')?.value || '').trim();
      const mutasiCatatan = (document.getElementById('sa-mutasi-cat')?.value || '').trim();
      const res = await apiCall('PUT', `/api/students/${studentId}/status`, {
        status: 'mutasi_keluar',
        mutasiTanggal,
        mutasiCatatan,
        tahun: state.pesantren.tahun,
        semester: state.pesantren.semester
      });
      if (!res || !res.ok) return;
      closeStudentActionModal();
      await refreshStateFromServer(true);
      showToast('Santri ditandai mutasi keluar untuk semester aktif');
    }
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function restoreMutatedStudent(studentId) {
  const st = (state.mutatedStudents || []).find(s => s.id === Number(studentId));
  if (!st) return;
  const ok = await openConfirmModal({
    title: 'Aktifkan Kembali Santri',
    message: `Aktifkan kembali ${st.nama} di Kelas ${st.kelas} untuk Semester ${state.pesantren.semester} (${state.pesantren.tahun})?`,
    confirmText: 'Aktifkan Kembali',
    variant: 'primary'
  });
  if (!ok) return;
  const res = await apiCall('PUT', `/api/students/${studentId}/status`, {
    status: 'aktif',
    tahun: state.pesantren.tahun,
    semester: state.pesantren.semester
  });
  if (res && res.ok) {
    state.siswaViewTab = 'aktif';
    await refreshStateFromServer(true);
    showToast(`${st.nama} kembali aktif di Kelas ${st.kelas}`);
  }
}

function renderDataSiswa() {
  const waliKelas = getWaliKelasKode();
  if (waliKelas) {
    state.selectedSiswaKelas = waliKelas;
    state.selectedSiswaTingkat = getKelasTingkat(waliKelas);
  }
  const matchingClasses = state.selectedSiswaTingkat
    ? sortClasses(state.classes.filter(c => c.tingkat === state.selectedSiswaTingkat))
    : [];
  if (!waliKelas && state.selectedSiswaKelas && !matchingClasses.some(c => c.kode === state.selectedSiswaKelas)) {
    state.selectedSiswaKelas = '';
  }
  const kelas = waliKelas || state.selectedSiswaKelas;
  const viewTab = state.siswaViewTab === 'mutasi' ? 'mutasi' : 'aktif';
  const classStudents = kelas ? state.students.filter(s => s.kelas === kelas) : [];
  const allMutated = state.mutatedStudents || [];
  const scopedMutated = kelas ? allMutated.filter(s => s.kelas === kelas) : allMutated;
  const qSiswa = String(state.siswaSearch || '').trim().toLowerCase();
  const visibleStudents = qSiswa
    ? classStudents.filter(s =>
        String(s.nama || '').toLowerCase().includes(qSiswa) ||
        String(s.nis || '').toLowerCase().includes(qSiswa) ||
        String(s.nisn || '').toLowerCase().includes(qSiswa)
      )
    : classStudents;
  const visibleMutated = qSiswa
    ? scopedMutated.filter(s =>
        String(s.nama || '').toLowerCase().includes(qSiswa) ||
        String(s.nis || '').toLowerCase().includes(qSiswa) ||
        String(s.nisn || '').toLowerCase().includes(qSiswa) ||
        String(s.mutasiCatatan || '').toLowerCase().includes(qSiswa)
      )
    : scopedMutated;
  const isAdmin = state.mode === 'proktor' && (!state.authUser || state.authUser.role === 'admin');
  const activeSemesterLabel = `${state.pesantren?.semester || 'Ganjil'} • ${state.pesantren?.tahun || ''}`;

  return `
    ${renderPageHeader(
      `Data Santri / Peserta Didik${waliKelas ? ` — Kelas ${waliKelas}` : ''}`,
      waliKelas
        ? `Menampilkan data santri khusus kelas perwalian Anda (Kelas ${escapeHtml(waliKelas)}) pada ${escapeHtml(activeSemesterLabel)}.`
        : `Kelola santri aktif, mutasi masuk, pindah kelas, & mutasi keluar untuk ${escapeHtml(activeSemesterLabel)}.`,
      isAdmin ? `
        <button type="button" onclick="openAddStudentModal()" class="px-3.5 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold shadow-sm transition whitespace-nowrap">
          + Tambah / Mutasi Masuk
        </button>
      ` : ''
    )}
    <div class="rdp-card p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7dcc3] pb-3">
        ${waliKelas ? `
          <div class="flex items-center gap-2 text-xs">
            <span class="px-3 py-1.5 rounded-lg bg-[#0f4c3a] text-[#f3e3b0] font-bold">Wali Kelas: ${escapeHtml(waliKelas)}</span>
          </div>
        ` : `
          <div class="flex flex-wrap items-center gap-2.5 text-xs">
            <div class="flex items-center gap-1.5">
              <label for="siswa-tingkat-select" class="font-semibold text-[#0f4c3a]">Tingkat:</label>
              <select id="siswa-tingkat-select" onchange="onSiswaTingkatChange(this.value)" class="border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-[#fbf8f1] font-semibold">
                <option value="" ${!state.selectedSiswaTingkat ? 'selected' : ''}>-- Pilih Tingkat --</option>
                <option value="7" ${state.selectedSiswaTingkat === '7' ? 'selected' : ''}>7 (السابع)</option>
                <option value="8" ${state.selectedSiswaTingkat === '8' ? 'selected' : ''}>8 (الثامن)</option>
                <option value="9" ${state.selectedSiswaTingkat === '9' ? 'selected' : ''}>9 (التاسع)</option>
              </select>
            </div>
            <div class="flex items-center gap-1.5">
              <label for="siswa-kelas-select" class="font-semibold text-[#0f4c3a]">Kelas:</label>
              <select id="siswa-kelas-select" onchange="onSiswaKelasChange(this.value)" ${!state.selectedSiswaTingkat ? 'disabled' : ''} class="border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-[#fbf8f1] font-semibold disabled:bg-slate-100 disabled:text-slate-400">
                <option value="" ${!kelas ? 'selected' : ''}>${!state.selectedSiswaTingkat ? '-- Pilih Tingkat dahulu --' : '-- Pilih Kelas --'}</option>
                ${matchingClasses.map(c => `<option value="${escapeHtml(c.kode)}" ${c.kode === kelas ? 'selected' : ''}>Kelas ${escapeHtml(c.kode)}</option>`).join('')}
              </select>
            </div>
          </div>
        `}
        <div class="w-full sm:w-64">
          <input id="siswa-search-input" type="search" aria-label="Cari santri berdasarkan nama, NIS, atau NISN" value="${escapeHtml(state.siswaSearch || '')}" oninput="updateSearchAndRender('siswa-search-input', 'siswaSearch', this.value)" placeholder="Cari nama, NIS, atau NISN..." ${!kelas && viewTab === 'aktif' ? 'disabled' : ''} class="w-full border border-[#e7dcc3] rounded-lg px-3 py-1.5 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 bg-[#fbf8f1] p-3 rounded-lg border border-[#e7dcc3] text-xs">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed="${viewTab === 'aktif' ? 'true' : 'false'}" onclick="state.siswaViewTab='aktif'; renderPage()" class="min-h-[34px] px-3 py-1 rounded-full font-semibold border transition ${viewTab === 'aktif' ? 'bg-[#0f4c3a] text-[#f3e3b0] border-[#0f4c3a]' : 'bg-white text-slate-700 border-[#e7dcc3] hover:bg-white/80'}">
            Santri Aktif (${kelas ? visibleStudents.length : classStudents.length})
          </button>
          <button type="button" aria-pressed="${viewTab === 'mutasi' ? 'true' : 'false'}" onclick="state.siswaViewTab='mutasi'; renderPage()" class="min-h-[34px] px-3 py-1 rounded-full font-semibold border transition ${viewTab === 'mutasi' ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-slate-700 border-[#e7dcc3] hover:bg-white/80'}">
            Mutasi Keluar (${scopedMutated.length})
          </button>
          ${kelas ? `<span class="text-slate-600 font-medium ml-1">Kelas <b class="text-[#0f4c3a]">${escapeHtml(kelas)}</b></span>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          ${isAdmin ? `
            <button type="button" onclick="downloadStudentTemplate()" ${!kelas ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 font-semibold disabled:opacity-50">Download Template (.xlsx)</button>
            <label class="${kelas ? 'cursor-pointer' : 'opacity-50 pointer-events-none'} px-3 py-1.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">
              Upload Data (.xlsx)
              <input type="file" aria-label="Upload data santri Excel" accept=".xlsx,.xls,.csv" onchange="handleStudentUpload(event)" class="hidden" ${!kelas ? 'disabled' : ''} />
            </label>
            <button type="button" data-kelas="${escapeHtml(kelas || '')}" onclick="deleteAllStudentsInClass(this.dataset.kelas)" ${!kelas || classStudents.length === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-40">
              Hapus Kelas ${escapeHtml(kelas || '')}
            </button>
          ` : `
            <span class="px-2.5 py-1 rounded-lg bg-white border border-[#e7dcc3] text-slate-600 font-medium">Mode baca (Wali Kelas)</span>
          `}
        </div>
      </div>

      ${viewTab === 'mutasi' ? `
        <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
          <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
            <thead>
              <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
                <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">NISN</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama Santri</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">Kelas Asal</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Tgl Mutasi</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Catatan / Tujuan</th>
                ${isAdmin ? '<th class="px-3 py-2.5 text-center w-36">Aksi</th>' : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-[#e7dcc3]">
              ${visibleMutated.length === 0 ? `
                <tr><td colspan="${isAdmin ? 7 : 6}" class="px-4 py-8 text-center text-slate-500 italic">
                  Tidak ada santri berstatus mutasi keluar pada ${escapeHtml(activeSemesterLabel)}${kelas ? ` untuk Kelas ${escapeHtml(kelas)}` : ''}.
                </td></tr>
              ` : visibleMutated.map((s, i) => `
                <tr class="hover:bg-[#fbf8f1]">
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono">${escapeHtml(s.nisn || '-')}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(s.nama)}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center font-semibold text-[#0f4c3a]">${escapeHtml(s.kelas)}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono text-slate-600">${escapeHtml(s.mutasiTanggal || '-')}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-slate-700">${escapeHtml(s.mutasiCatatan || '-')}</td>
                  ${isAdmin ? `
                    <td class="px-3 py-2 text-center whitespace-nowrap">
                      <button type="button" onclick="restoreMutatedStudent(${s.id})" class="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold transition">Aktifkan Kembali</button>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
          <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
            <thead>
              <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
                <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">NIS</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">NISN</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">L/P</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Tempat, Tgl Lahir</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Alamat</th>
                <th class="px-3 py-2.5 ${isAdmin ? 'border-r border-[#e7dcc3]' : ''}">Nama Ayah / Wali</th>
                ${isAdmin ? '<th class="px-3 py-2.5 text-center w-44">Aksi</th>' : ''}
              </tr>
            </thead>
            <tbody class="divide-y divide-[#e7dcc3]">
              ${visibleStudents.length === 0 ? `
                <tr><td colspan="${isAdmin ? 9 : 8}" class="px-4 py-8 text-center text-slate-500">
                  ${!kelas
                    ? 'Silakan pilih <b>Tingkat</b> dan <b>Kelas</b> terlebih dahulu.'
                    : (qSiswa
                      ? `Tidak ada santri yang cocok dengan pencarian "<b>${escapeHtml(state.siswaSearch)}</b>". <button type="button" onclick="updateSearchAndRender('siswa-search-input', 'siswaSearch', '')" class="ml-2 underline font-semibold text-[#0f4c3a]">Reset</button>`
                      : `Belum ada santri aktif di Kelas ${escapeHtml(kelas)}.${isAdmin ? ' Gunakan <b>+ Tambah / Mutasi Masuk</b> atau <b>Upload Data (.xlsx)</b> untuk menambahkan.' : ''}`)}
                </td></tr>
              ` : visibleStudents.map((s, i) => `
                <tr class="hover:bg-[#fbf8f1]">
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono">${escapeHtml(s.nis || '-')}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono">${escapeHtml(s.nisn || '-')}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(s.nama)}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${s.jk === 'Perempuan' || s.jk === 'P' ? 'P' : 'L'}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3]">${escapeHtml(s.tempatLahir || '-')}, ${escapeHtml(s.tglLahir || '-')}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3]">${escapeHtml(s.alamat || '-')}</td>
                  <td class="px-3 py-2 ${isAdmin ? 'border-r border-[#e7dcc3]' : ''}">${escapeHtml(s.wali && s.wali !== '-' ? s.wali : (s.ayah || '-'))}</td>
                  ${isAdmin ? `
                    <td class="px-3 py-2 text-center whitespace-nowrap space-x-1">
                      <button type="button" onclick="openMoveStudentModal(${s.id})" class="px-2 py-1 rounded-lg border border-[#136048] bg-white hover:bg-emerald-50 text-[#0f4c3a] font-semibold transition">Pindah Kelas</button>
                      <button type="button" onclick="openMutasiKeluarModal(${s.id})" class="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold transition">Mutasi Keluar</button>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function downloadStudentTemplate() {
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum termuat. Pastikan server berjalan.');
    return;
  }
  const kelas = state.selectedSiswaKelas || 'VII.A';
  const tingkatRomawi = kelas.split('.')[0] || 'VII';
  const title1 = [`DATA SISWA KELAS ${kelas}`];
  const title2 = [`${state.pesantren.nama} - TAHUN AJARAN ${state.pesantren.tahun}`];
  const blank = [];
  const headers = [
    'No','NIS','NISN','Nama','L/P','Tempat Lahir','Tanggal Lahir','Agama','Alamat','No. HP',
    'Status Anak','Anak Ke','Sekolah Asal','Tanggal Diterima','Diterima di Kelas',
    'Nama Ayah','Pekerjaan Ayah','Nama Ibu','Pekerjaan Ibu','Alamat Orang Tua',
    'Nama Wali','Pekerjaan Wali','Alamat Wali'
  ];
  const sample1 = [
    1,'260006','3146282554','ABIDZAR FAZA NURDIAN','L','BANYUMAS','15-07-2014','Islam',
    'RT 02 RW 02 KARANGPETIR','6285747750775','Anak Kandung',2,'MIS AL ISLAM KARANGPETIR',
    '13-07-2026',tingkatRomawi,'MEYDANI NURDIANTO','Pegawai Swasta','NUNI HAIRNAWATI','PNS',
    'RT 02 RW 02 KARANGPETIR','','-',''
  ];
  const sample2 = [
    2,'260005','0149569985','ACHMAD RAFLI ARSENIO','L','BANYUMAS','20-02-2014','Islam',
    'Kebarongan, RT 01 RW 01','6285726745298','Anak Kandung',3,'MIS TARBIYATUL ATHFAL KEBARONGAN',
    '13-07-2026',tingkatRomawi,'MUSLIKHIN','Pegawai Swasta','SITI ZULAIKHAH','Tidak Bekerja',
    'Kebarongan, RT 01 RW 01','','-',''
  ];

  const aoa = [title1, title2, blank, headers, sample1, sample2];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 5 }, { wch: 10 }, { wch: 14 }, { wch: 28 }, { wch: 5 }, { wch: 14 }, { wch: 13 },
    { wch: 8 }, { wch: 28 }, { wch: 15 }, { wch: 14 }, { wch: 8 }, { wch: 30 }, { wch: 15 },
    { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 28 }, { wch: 18 },
    { wch: 16 }, { wch: 24 }
  ];
  const wb = XLSX.utils.book_new();
  const safeSheet = (`Kelas ${kelas}`).replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Data Santri';
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);
  XLSX.writeFile(wb, `Template_Santri_Kelas_${String(kelas).replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`);
  showToast(`Template Kelas ${kelas} (.xlsx) diunduh!`);
}

async function handleStudentUpload(e) {
  const kelas = state.selectedSiswaKelas;
  const inputEl = e.target;
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (inputEl) inputEl.value = '';
  if (!kelas) { showToast('Pilih kelas terlebih dahulu'); return; }
  if (!file) return;
  if (state._uploadingStudents) { showToast('Upload santri sebelumnya masih diproses...'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('Ukuran file maksimal 10 MB'); return; }
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum termuat.');
    return;
  }

  state._uploadingStudents = true;
  const reader = new FileReader();
  reader.onerror = () => { state._uploadingStudents = false; e.target.value = ''; showToast('Gagal membaca file santri'); };
  reader.onabort = () => { state._uploadingStudents = false; e.target.value = ''; };
  reader.onload = async (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

      let startIdx = 1;
      let colMap = { nis: 1, nisn: 2, nama: 3, lp: 4, tempat: 5, tgl: 6, alamat: 8, telp: 9, ayah: 15, ibu: 17, wali: 20, nik: -1 };
      const scanLimit = Math.min(rows.length, 15);
      const findNamaCol = (cols) => cols.findIndex(c =>
        c === 'nama' || c === 'nama lengkap' || c === 'nama santri' || c === 'nama siswa' ||
        c === 'nama peserta didik' || c === 'nama lengkap santri' || c === 'nama lengkap siswa'
      );
      const findNisnCol = (cols) => cols.findIndex(c => c === 'nisn' || c === 'no. nisn' || c === 'no nisn');
      const findNisCol = (cols) => cols.findIndex(c => c === 'nis' || c === 'no. nis' || c === 'no nis' || c === 'no induk' || c === 'no. induk' || c === 'nomor induk');
      const buildColMap = (cols, idxNisn, idxNama, idxNis) => ({
        nis: idxNis,
        nisn: idxNisn,
        nama: idxNama,
        nik: cols.findIndex(c => c === 'nik'),
        lp: cols.findIndex(c => c === 'l/p' || c === 'jk' || c.includes('kelamin')),
        tempat: cols.findIndex(c => c.includes('tempat')),
        tgl: cols.findIndex(c => c.includes('tanggal lahir') || c.includes('tgl lahir')),
        alamat: cols.findIndex(c => c === 'alamat' || c === 'alamat santri' || c === 'alamat siswa' || c === 'alamat rumah'),
        telp: cols.findIndex(c => c.includes('hp') || c.includes('telp') || c.includes('telepon') || c.includes('whatsapp') || /\bwa\b/.test(c)),
        ayah: cols.findIndex(c => c.includes('nama ayah') || c === 'ayah'),
        ibu: cols.findIndex(c => c.includes('nama ibu') || c === 'ibu'),
        wali: cols.findIndex(c => c.includes('nama wali') || c === 'wali')
      });

      let matchedHeader = false;
      for (let i = 0; i < scanLimit; i++) {
        const cols = (rows[i] || []).map(c => String(c || '').replace(/\s+/g, ' ').trim().toLowerCase());
        const idxNisn = findNisnCol(cols);
        const idxNama = findNamaCol(cols);
        if (idxNisn >= 0 && idxNama >= 0) {
          startIdx = i + 1;
          colMap = buildColMap(cols, idxNisn, idxNama, findNisCol(cols));
          matchedHeader = true;
          break;
        }
      }
      if (!matchedHeader) {
        for (let i = 0; i < scanLimit; i++) {
          const cols = (rows[i] || []).map(c => String(c || '').replace(/\s+/g, ' ').trim().toLowerCase());
          const idxNis = findNisCol(cols);
          const idxNama = findNamaCol(cols);
          if (idxNis >= 0 && idxNama >= 0) {
            startIdx = i + 1;
            colMap = buildColMap(cols, findNisnCol(cols), idxNama, idxNis);
            matchedHeader = true;
            break;
          }
        }
      }

      const imported = [];
      for (let i = startIdx; i < rows.length; i++) {
        const cols = (rows[i] || []).map(c => String(c ?? '').trim());
        if (!cols.some(Boolean)) continue;
        const nama = colMap.nama >= 0 ? (cols[colMap.nama] || '') : '';
        if (!nama) continue;
        const lp = (colMap.lp >= 0 ? (cols[colMap.lp] || 'L') : 'L').toUpperCase();
        const jk = lp.startsWith('P') ? 'Perempuan' : 'Laki-laki';
        const ayah = colMap.ayah >= 0 ? (cols[colMap.ayah] || '') : '';
        const ibu = colMap.ibu >= 0 ? (cols[colMap.ibu] || '') : '';
        const waliRaw = colMap.wali >= 0 ? (cols[colMap.wali] || '') : '';
        const wali = (waliRaw && waliRaw !== '-') ? waliRaw : ayah;
        const rawNisn = colMap.nisn >= 0 ? (cols[colMap.nisn] || '') : '';
        const cleanNisn = (rawNisn && rawNisn !== '-' && !/^0+$/.test(rawNisn)) ? rawNisn : '';
        const nikVal = colMap.nik >= 0 ? (cols[colMap.nik] || '') : '';

        imported.push({
          nis: colMap.nis >= 0 ? (cols[colMap.nis] || '') : '',
          nisn: cleanNisn,
          nama,
          nik: nikVal,
          tempatLahir: colMap.tempat >= 0 ? (cols[colMap.tempat] || '') : '',
          tglLahir: colMap.tgl >= 0 ? (cols[colMap.tgl] || '') : '',
          kelas,
          jk,
          alamat: colMap.alamat >= 0 ? (cols[colMap.alamat] || '') : '',
          telp: colMap.telp >= 0 ? (cols[colMap.telp] || '') : '',
          ayah,
          ibu,
          wali
        });
      }
      if (imported.length === 0) {
        showToast('Tidak ada data santri valid ditemukan pada file');
        return;
      }
      showToast(`Mengupload ${imported.length} santri ke Kelas ${kelas}...`);
      const res = await apiCall('POST', '/api/students', { tahun: state.pesantren.tahun, semester: state.pesantren.semester, students: imported });
      if (!res || !res.ok) return;
      if (location.protocol === 'file:') {
        for (const stObj of imported) {
          const existing = stObj.nisn ? state.students.find(x => x.nisn === stObj.nisn) : null;
          if (existing) Object.assign(existing, { ...stObj, id: existing.id, scores: existing.scores });
          else state.students.push({ ...stObj, id: Date.now() + Math.floor(Math.random() * 10000), scores: {} });
        }
        renderPage();
        showToast(`${imported.length} santri berhasil diupload ke Kelas ${kelas}!`);
      } else {
        await refreshStateFromServer(true);
        await loadUsersList();
        const addedCount = Number(res.added ?? imported.length);
        const updatedCount = Number(res.updated ?? 0);
        showToast(`Upload Kelas ${kelas} selesai: ${addedCount} santri baru, ${updatedCount} santri diperbarui`);
      }
    } catch (err) {
      console.error('Upload santri gagal:', err);
      showToast('Gagal membaca file Excel santri. Pastikan format file .xlsx/.xls/.csv valid.');
    } finally {
      state._uploadingStudents = false;
      e.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

async function deleteAllStudentsInClass(kelas) {
  if (!kelas) return;
  const count = state.students.filter(s => s.kelas === kelas).length;
  if (count === 0) {
    showToast(`Tidak ada santri di Kelas ${kelas}`);
    return;
  }
  const ok = await openConfirmModal({
    title: `Hapus Semua Santri Kelas ${kelas}`,
    message: `Hapus SEMUA ${count} anggota santri di Kelas ${kelas} pada Semester ${state.pesantren.semester || 'Ganjil'} (${state.pesantren.tahun || ''})? Arsip semester sebelumnya tetap dipertahankan.`,
    confirmText: `Hapus ${count} Santri`,
    variant: 'danger'
  });
  if (!ok) return;
  const res = await apiCall('DELETE', `/api/students?kelas=${encodeURIComponent(kelas)}&tahun=${encodeURIComponent(state.pesantren.tahun || '')}&semester=${encodeURIComponent(state.pesantren.semester || '')}`);
  if (res && res.ok) {
    state.students = state.students.filter(s => s.kelas !== kelas);
    state.mutatedStudents = (state.mutatedStudents || []).filter(s => s.kelas !== kelas);
    await loadUsersList();
    renderPage();
    showToast(`Semua (${count}) anggota Kelas ${kelas} pada semester ini telah dihapus`);
  }
}

