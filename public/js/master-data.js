// ===================== KELAS -> WALI KELAS =====================
async function savePengaturanFromForm() {
  const m = state.pesantren;
  const activeKkm = getActiveKkm();
  const draftTiers = ensureDraftPredikatConfig().map((item, idx) => ({
    key: PREDIKAT_KEYS[idx],
    min: idx === 4 ? 0 : (idx === 3 ? activeKkm : (String(item.min ?? '').trim() === '' ? NaN : Math.round(Number(item.min)))),
    label: String(item.label ?? '').trim()
  }));
  const predErr = validatePredikatTiersClient(draftTiers, activeKkm);
  if (predErr) {
    showToast('Gagal: ' + predErr);
    return;
  }
  const newTahun = document.getElementById('set-tahun')?.value || m.tahun;
  const newSemester = document.getElementById('set-semester')?.value || m.semester;
  const periodChanged = (newTahun !== m.tahun) || (newSemester !== m.semester);
  const payload = {
    tahun: newTahun,
    semester: newSemester,
    semesterArab: newSemester === 'Ganjil' ? 'الأول' : 'الثاني',
    kurikulum: m.kurikulum,
    kkmDefault: activeKkm,
    predikatConfig: draftTiers,
    tanggalIso: m.tanggalIso,
    tanggalArab: m.tanggalArab,
    kotaArab: m.kotaArab,
    watermarkType: m.watermarkType,
    watermarkText: m.watermarkText,
    watermarkOpacity: m.watermarkOpacity,
    watermarkColor: m.watermarkColor,
    watermarkSize: m.watermarkSize,
    watermarkFontSize: m.watermarkFontSize
  };
  const r = await savePesantrenPartial(payload);
  if (r && r.ok) {
    markFormDirty('pengaturan', false);
    if (periodChanged) resetPeriodCachedSelections();
    const ok = await refreshStateFromServer(true);
    if (ok) {
      showToast('Pengaturan Lembaga, KKM & Predikat, Tanggal Rapor & Watermark disimpan ke database');
    } else if (state.authUser) {
      showToast('Pengaturan tersimpan, silakan muat ulang halaman untuk menyegarkan tampilan');
    }
  } else {
    await refreshStateFromServer(true);
  }
}

function renderLembagaKelas() {
  const activeTahun = (state.pesantren && state.pesantren.tahun) || '2026/2027';
  const yearOptions = getAcademicYearOptions([activeTahun]).filter(y => y !== activeTahun);
  const activeNorm = normalizeAcademicYear(activeTahun);
  const prevYear = activeNorm ? `${Number(activeNorm.slice(0, 4)) - 1}/${Number(activeNorm.slice(0, 4))}` : null;
  const defaultFromTahun = (prevYear && yearOptions.includes(prevYear))
    ? prevYear
    : (yearOptions.includes('2026/2027') ? '2026/2027' : (yearOptions[yearOptions.length - 1] || ''));
  return `
    ${renderPageHeader('Wali Kelas & Rombel', `Kelola daftar kelas dan penetapan wali kelas untuk Tahun Pelajaran ${escapeHtml(activeTahun)}.`)}
    <div class="rdp-card p-5 space-y-4">
      <div class="border-b border-[#e7dcc3] pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-sm text-[#0f4c3a]">Daftar Kelas (${escapeHtml(activeTahun)})</h2>
          <p class="text-xs text-slate-500">Tingkat 7 = السابع, 8 = الثامن, 9 = التاسع.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs bg-[#fbf8f1] border border-[#e7dcc3] rounded-lg px-2.5 py-1.5">
          <label for="copy-cls-from-tahun" class="font-semibold text-[#0f4c3a]">Salin Kelas dari Tahun:</label>
          <select id="copy-cls-from-tahun" class="border border-[#e7dcc3] rounded-lg px-2 py-1 bg-white">
            ${yearOptions.map(y => `<option value="${escapeHtml(y)}" ${y === defaultFromTahun ? 'selected' : ''}>${escapeHtml(y)}</option>`).join('')}
          </select>
          <button type="button" onclick="copyClassesFromYear()" class="px-2.5 py-1.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">Salin Daftar Kelas</button>
        </div>
      </div>
      <form onsubmit="addClass(event)" class="grid sm:grid-cols-4 gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3] text-xs">
        <div>
          <label for="new-cls-tingkat" class="block font-semibold text-[#0f4c3a] mb-1">Tingkat</label>
          <select id="new-cls-tingkat" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white">
            <option value="7">7 (السابع)</option>
            <option value="8">8 (الثامن)</option>
            <option value="9">9 (التاسع)</option>
          </select>
        </div>
        <div>
          <label for="new-cls-kode" class="block font-semibold text-[#0f4c3a] mb-1">Nama / Kode Kelas</label>
          <input id="new-cls-kode" type="text" required placeholder="Contoh: VII.C" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white" />
        </div>
        <div>
          <label for="new-cls-wali" class="block font-semibold text-[#0f4c3a] mb-1">Wali Kelas</label>
          <select id="new-cls-wali" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">- Pilih Wali Kelas -</option>
            ${sortByLabel(getActiveTeachers(), t => t.nama).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.nama)}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-end">
          <button type="submit" class="w-full py-2 px-3 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">+ Tambah Kelas</button>
        </div>
      </form>
      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
      <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
        <thead><tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]"><th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th><th class="px-3 py-2.5 border-r border-[#e7dcc3]">Kelas</th><th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama Arab (الصف)</th><th class="px-3 py-2.5 border-r border-[#e7dcc3]">Wali Kelas</th><th class="px-3 py-2.5 text-center">Aksi</th></tr></thead>
        <tbody class="divide-y divide-[#e7dcc3]">
          ${sortClasses(state.classes).map((c, i) => {
            const opts = sortByLabel(state.teachers.filter(t => t.active !== false || t.id === c.waliId), t => t.nama);
            return `
              <tr class="hover:bg-[#fbf8f1]/70">
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold">Kelas ${escapeHtml(c.kode)}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] arabic-font text-base">${escapeHtml(toArabicKelas(c.kode))}</td>
                <td class="px-3 py-1.5 border-r border-[#e7dcc3]">
                  <select aria-label="Wali kelas ${escapeHtml(c.kode)}" onchange="assignWaliKelas(${c.id}, this.value)" class="w-full border border-[#e7dcc3] rounded-lg px-2 py-1 bg-white text-xs">
                    <option value="">- Belum diatur -</option>
                    ${opts.map(t => `<option value="${escapeHtml(t.id)}" ${c.waliId === t.id ? 'selected' : ''}>${escapeHtml(t.nama)}${t.active === false ? ' (Nonaktif)' : ''}</option>`).join('')}
                  </select>
                </td>
                <td class="px-3 py-2 text-center"><button type="button" onclick="deleteClass(${c.id})" class="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Hapus</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `;
}

async function copyClassesFromYear() {
  const sel = document.getElementById('copy-cls-from-tahun');
  const fromTahun = sel ? sel.value : '';
  if (!fromTahun) return;
  const res = await apiCall('POST', '/api/classes/copy', { fromTahun });
  if (!res || !res.ok) return;
  await refreshStateFromServer(true);
  if (res.copied > 0) {
    showToast(`${res.copied} kelas disalin dari tahun ${fromTahun} ke ${res.toTahun}`);
  } else {
    showToast(`Tidak ada kelas baru untuk disalin dari tahun ${fromTahun}`);
  }
}

async function assignWaliKelas(classId, teacherId) {
  const cls = state.classes.find(c => c.id === classId);
  if (!cls) return;
  const res = await apiCall('PUT', `/api/classes/${classId}/wali`, { waliId: teacherId || null });
  if (!res || !res.ok) {
    renderPage();
    return;
  }
  state.teachers.forEach(t => {
    if (t.id === cls.waliId || t.waliKelas === cls.kode) t.waliKelas = null;
  });

  if (teacherId) {
    state.classes.forEach(c => {
      if (c.id !== classId && c.waliId === teacherId) c.waliId = null;
    });
    cls.waliId = teacherId;
    const newWali = state.teachers.find(t => t.id === teacherId);
    if (newWali) newWali.waliKelas = cls.kode;
    renderSidebar();
    renderPage();
    showToast(`Wali kelas ${cls.kode}: ${newWali ? newWali.nama : ''}`);
  } else {
    cls.waliId = null;
    renderSidebar();
    renderPage();
    showToast(`Wali kelas ${cls.kode} dikosongkan`);
  }
}

async function deleteClass(classId) {
  const cls = state.classes.find(c => c.id === classId);
  if (!cls) return;
  const ok = await openConfirmModal({
    title: 'Hapus Kelas',
    message: `Hapus Kelas ${cls.kode}? Penugasan mengajar pada kelas ini juga akan dihapus.`,
    confirmText: 'Hapus Kelas',
    variant: 'danger'
  });
  if (!ok) return;
  const res = await apiCall('DELETE', `/api/classes/${classId}`);
  if (!res || !res.ok) return;
  state.teachers.forEach(t => {
    if (t.id === cls.waliId || t.waliKelas === cls.kode) t.waliKelas = null;
  });
  state.classes = state.classes.filter(x => x.id !== classId);
  state.assignments = state.assignments.filter(a => a.kode !== cls.kode);
  if (state.selectedSiswaKelas === cls.kode) state.selectedSiswaKelas = '';
  if (state.selectedRaporKelas === cls.kode) state.selectedRaporKelas = '';
  if (state.selectedPengampuKelas === cls.kode) state.selectedPengampuKelas = '';
  if (state.selectedKelasMengajar === cls.kode) state.selectedKelasMengajar = '';
  renderSidebar();
  renderPage();
  showToast(`Kelas ${cls.kode} dihapus`);
}

async function addClass(e) {
  e.preventDefault();
  const tingkat = document.getElementById('new-cls-tingkat').value;
  const kode = document.getElementById('new-cls-kode').value.trim();
  if (!kode) { showToast('Kode kelas wajib diisi'); return; }
  const waliId = document.getElementById('new-cls-wali').value || null;
  const res = await apiCall('POST', '/api/classes', { kode, tingkat, waliId, kurikulum: 'Kurikulum Pesantren' });
  if (!res || !res.ok) return;
  const newId = res.id || Date.now();
  const clsObj = { id: newId, kode, tingkat, waliId, kurikulum: 'Kurikulum Pesantren' };
  state.classes.push(clsObj);
  if (waliId) {
    state.classes.forEach(c => {
      if (c.id !== newId && c.waliId === waliId) c.waliId = null;
    });
    state.teachers.forEach(t => { if (t.waliKelas === kode) t.waliKelas = null; });
    const t = state.teachers.find(x => x.id === waliId);
    if (t) t.waliKelas = kode;
  }
  renderSidebar();
  renderPage();
  showToast(`Kelas ${kode} ditambahkan`);
}

// ===================== KELAS -> PENGAMPU (ADMIN) =====================
function onPengampuTingkatChange(tingkat) {
  state.selectedPengampuTingkat = tingkat;
  state.selectedPengampuKelas = '';
  renderPage();
}

function onPengampuKelasChange(kelasKode) {
  state.selectedPengampuKelas = kelasKode;
  renderPage();
}

function renderPengampuKelas() {
  if (state.mode !== 'proktor') {
    return `<div class="rdp-card p-6 text-xs text-rose-700 font-semibold">Halaman Pengampu hanya dapat diakses oleh Admin / Proktor.</div>`;
  }
  const tk = state.selectedPengampuTingkat || '';
  const kls = state.selectedPengampuKelas || '';
  const matchingClasses = tk ? sortClasses(state.classes.filter(c => c.tingkat === tk)) : [];
  const validClass = matchingClasses.some(c => c.kode === kls) ? kls : '';
  if (validClass !== kls) state.selectedPengampuKelas = validClass;

  const clsObj = validClass ? state.classes.find(c => c.kode === validClass) : null;
  const wali = (clsObj && clsObj.waliId) ? state.teachers.find(t => t.id === clsObj.waliId) : null;

  return `
    ${renderPageHeader('Pengampu Mata Pelajaran', 'Menampilkan guru pengampu setiap mata pelajaran berdasarkan penugasan di Guru → Mengajar.', `<button type="button" onclick="navigate('mengajar')" class="px-3.5 py-2 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-semibold shadow-sm transition">Kelola di Guru &rarr; Mengajar</button>`)}
    <div class="rdp-card p-5 space-y-4 text-xs">
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3]">
        <div>
          <label for="pengampu-tingkat" class="block font-semibold text-[#0f4c3a] mb-1">Tingkat</label>
          <select id="pengampu-tingkat" onchange="onPengampuTingkatChange(this.value)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold text-slate-700">
            <option value="" ${tk === '' ? 'selected' : ''}>-- Pilih Tingkat --</option>
            <option value="7" ${tk === '7' ? 'selected' : ''}>7 (السابع)</option>
            <option value="8" ${tk === '8' ? 'selected' : ''}>8 (الثامن)</option>
            <option value="9" ${tk === '9' ? 'selected' : ''}>9 (التاسع)</option>
          </select>
        </div>
        <div>
          <label for="pengampu-kelas" class="block font-semibold text-[#0f4c3a] mb-1">Kelas</label>
          <select id="pengampu-kelas" onchange="onPengampuKelasChange(this.value)" ${!tk ? 'disabled' : ''} class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold text-slate-700 disabled:bg-slate-100 disabled:text-slate-400">
            <option value="" ${validClass === '' ? 'selected' : ''}>${!tk ? '-- Pilih Tingkat terlebih dahulu --' : '-- Pilih Kelas --'}</option>
            ${matchingClasses.map(c => `<option value="${escapeHtml(c.kode)}" ${c.kode === validClass ? 'selected' : ''}>Kelas ${escapeHtml(c.kode)}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-end">
          <div class="w-full px-3 py-2 rounded-lg bg-white border border-[#e7dcc3] text-slate-600">
            <span class="text-xs text-slate-500 block">Wali Kelas:</span>
            <span class="font-bold text-[#0f4c3a]">${validClass ? escapeHtml(wali ? wali.nama : '- Belum diatur -') : '-'}</span>
          </div>
        </div>
      </div>

      ${!validClass ? `
        <div role="status" class="p-8 rounded-xl border border-dashed border-[#e7dcc3] bg-[#fbf8f1]/60 text-center text-slate-500">
          Silakan pilih <b>Tingkat</b> dan <b>Kelas</b> terlebih dahulu untuk melihat daftar pengampu mata pelajaran.
        </div>
      ` : `
        <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
          <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
            <thead>
              <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
                <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-12">No</th>
                <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Mata Pelajaran</th>
                <th class="px-3 py-2.5">Pengampu</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#e7dcc3]">
              ${getEffectiveSubjects(validClass).map((sub, idx) => {
                const matched = state.assignments.filter(a => a.kode === validClass && a.mapel === sub.namaArab);
                const teacherNames = matched.map(a => {
                  const tr = state.teachers.find(t => t.id === a.teacherId);
                  return tr ? tr.nama : a.teacherId;
                });
                return `
                  <tr class="hover:bg-[#fbf8f1]">
                    <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${idx + 1}</td>
                    <td class="px-3 py-2 border-r border-[#e7dcc3]">
                      <span class="font-semibold text-slate-800">${escapeHtml(sub.namaId)}</span>
                      <span class="arabic-font text-base text-[#0f4c3a] ml-1.5">(${escapeHtml(sub.namaArab)})</span>
                    </td>
                    <td class="px-3 py-2">
                      ${teacherNames.length > 0
                        ? teacherNames.map(nm => `<span class="inline-block px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[#0f4c3a] font-semibold mr-1 mb-0.5">${escapeHtml(nm)}</span>`).join('')
                        : `<span class="text-slate-400 italic">- Belum ada pengampu -</span>`}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ===================== GURU -> DATA GURU =====================
function renderDataGuru() {
  return `
    ${renderPageHeader('Data Guru / Ustadz', 'Tambah guru secara manual atau upload Excel (.xlsx/.csv). Akun login otomatis dibuat menggunakan NUPTK & Password.', `
      <button type="button" onclick="document.getElementById('form-add-teacher').classList.toggle('hidden')" class="px-3 py-2 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-semibold">+ Tambah Guru</button>
      <button type="button" onclick="downloadTeacherTemplate()" class="px-3 py-2 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 text-xs font-semibold">Template (.xlsx)</button>
      <label class="cursor-pointer px-3 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold">
        Upload Data (.xlsx / .csv)
        <input type="file" aria-label="Upload file data guru" accept=".xlsx,.xls,.csv" onchange="handleTeacherUpload(event)" class="hidden" />
      </label>
    `)}
    <div class="rdp-card p-5 space-y-4">
      <form id="form-add-teacher" onsubmit="addTeacher(event)" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3] text-xs">
        <input id="new-t-nama" aria-label="Nama Lengkap Latin" type="text" required placeholder="Nama Lengkap (Latin)" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
        <input id="new-t-arab" aria-label="Nama Arab" type="text" dir="rtl" placeholder="الاسم بالعربية (Opsional)" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 arabic-font text-sm bg-white" />
        <input id="new-t-nuptk" aria-label="NUPTK Username Login" type="text" required placeholder="NUPTK (Username Login)" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 font-mono bg-white" />
        <input id="new-t-nip" aria-label="NIP Opsional" type="text" placeholder="NIP (Opsional)" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 font-mono bg-white" />
        <select id="new-t-jk" aria-label="Jenis Kelamin Guru" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white">
          <option value="L">L (Guru / Ustadz)</option>
          <option value="P">P (Guru / Ustadzah)</option>
        </select>
        <input id="new-t-ttl" aria-label="Tempat dan Tanggal Lahir" type="text" placeholder="Tempat, Tgl Lahir" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
        <input id="new-t-pend" aria-label="Pendidikan Terakhir" type="text" placeholder="Pendidikan (mis. Sarjana (S1))" class="border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
        <div class="flex gap-2">
          <input id="new-t-pass" aria-label="Password Guru" type="password" placeholder="Password (default: guru123)" class="flex-1 min-w-0 border border-[#e7dcc3] rounded-lg px-2.5 py-2 bg-white" />
          <button type="submit" class="py-2 px-3 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold whitespace-nowrap">Simpan</button>
        </div>
      </form>

      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">NUPTK</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">NIP</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama Ustadz / Guru</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-right">الاسم (untuk Rapor)</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">TTL</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Pendidikan</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Wali Kelas</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">Status</th>
              <th class="px-3 py-2.5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${state.teachers.map((t, i) => {
              const isAct = t.active !== false;
              return `
              <tr class="hover:bg-[#fbf8f1] ${isAct ? '' : 'opacity-65 bg-slate-50'}">
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono">${escapeHtml(t.nuptk || '-')}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] font-mono text-slate-600">${escapeHtml(t.nip || '-')}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(t.nama)}</td>
                <td class="px-3 py-1 border-r border-[#e7dcc3] text-right arabic-font text-base">
                  <input type="text" dir="rtl" aria-label="Nama Arab ${escapeHtml(t.nama)}" value="${escapeHtml(t.namaArab || '')}" data-tid="${escapeHtml(t.id)}" onchange="updateTeacher(this.dataset.tid, 'namaArab', this.value)" class="w-full text-right bg-transparent border border-transparent hover:border-[#e7dcc3] focus:border-[#136048] rounded px-1.5 py-0.5" />
                </td>
                <td class="px-3 py-2 border-r border-[#e7dcc3]">${escapeHtml(t.ttl || '-')}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3]">${escapeHtml(t.pendidikan || '-')}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3]">${t.waliKelas ? `Kelas ${escapeHtml(t.waliKelas)}` : '-'}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${isAct ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">${isAct ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td class="px-3 py-2 text-center whitespace-nowrap space-x-1">
                  <button type="button" data-tid="${escapeHtml(t.id)}" onclick="toggleTeacherActive(this.dataset.tid, ${isAct ? 'false' : 'true'})" class="px-2 py-1 rounded-lg ${isAct ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'} font-semibold">${isAct ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button type="button" data-tid="${escapeHtml(t.id)}" onclick="deleteTeacher(this.dataset.tid)" class="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Hapus</button>
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


async function addTeacher(e) {
  e.preventDefault();
  const nama = document.getElementById('new-t-nama').value.trim();
  const namaArab = document.getElementById('new-t-arab').value.trim() || nama;
  const nuptk = document.getElementById('new-t-nuptk').value.trim();
  if (!nama || !nuptk) { showToast('Nama dan NUPTK wajib diisi'); return; }
  if (!/^\d{6,30}$/.test(nuptk) || /^0+$/.test(nuptk)) {
    showToast('NUPTK harus berupa angka 6–30 digit (tidak boleh semua nol)');
    return;
  }
  if (state.teachers.some(t => String(t.nuptk || '').trim() === nuptk)) {
    showToast('NUPTK sudah terdaftar pada data guru');
    return;
  }
  const nip = document.getElementById('new-t-nip').value.trim() || '-';
  const jk = document.getElementById('new-t-jk').value;
  const ttl = document.getElementById('new-t-ttl').value.trim() || '-';
  const pendidikan = document.getElementById('new-t-pend').value.trim() || 'Sarjana (S1)';
  const rawPass = document.getElementById('new-t-pass').value;
  const password = rawPass.trim() ? rawPass : 'guru123';
  if (password.trim().length < 6 || password.length > 256) {
    showToast('Password guru minimal 6 karakter');
    return;
  }
  const initials = nama.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'GR';
  const role = jk === 'P' ? 'Guru / Ustadzah' : 'Guru / Ustadz';
  const payload = { nama, namaArab, initials, role, nuptk, nip, ttl, pendidikan, waliKelas: null, jumlahSiswa: 0, ekskul: null, password };
  const res = await apiCall('POST', '/api/teachers', payload);
  if (!res || !res.ok) return;
  await refreshStateFromServer(true);
  await loadUsersList();
  renderTeacherSwitcherOptions();
  showToast(`Guru ${nama} ditambahkan (Login: ${res.username || nuptk})`);
}

async function toggleTeacherActive(id, nextActive) {
  const target = state.teachers.find(t => t.id === id);
  if (!target) return;
  const label = nextActive ? 'Aktifkan kembali' : 'Nonaktifkan';
  const ok = await openConfirmModal({
    title: `${label} Guru`,
    message: `${label} guru "${target.nama}"?${nextActive ? '' : ' Guru tidak bisa login dan tidak muncul di pilihan penugasan baru, namun arsip nilai & rapor tetap aman.'}`,
    confirmText: label,
    variant: nextActive ? 'primary' : 'warning'
  });
  if (!ok) return;
  const res = await apiCall('PUT', `/api/teachers/${encodeURIComponent(id)}/active`, { active: nextActive });
  if (!res || !res.ok) return;
  target.active = nextActive;
  renderTeacherSwitcherOptions();
  renderPage();
  showToast(`Guru ${target.nama} berhasil di${nextActive ? 'aktifkan' : 'nonaktifkan'}`);
}

async function updateTeacher(id, field, val) {
  const t = state.teachers.find(x => x.id === id);
  if (!t) return;
  const res = await apiCall('PUT', `/api/teachers/${encodeURIComponent(id)}`, { [field]: val });
  if (!res || !res.ok) {
    renderPage();
    return;
  }
  t[field] = val;
  showToast('Data guru diperbarui');
}

async function deleteTeacher(id) {
  if (state.teachers.length <= 1) { showToast('Minimal 1 guru harus ada'); return; }
  const target = state.teachers.find(t => t.id === id);
  const ok = await openConfirmModal({
    title: 'Hapus Permanen Guru',
    message: `Hapus permanen guru "${target ? target.nama : id}"?\n(Jika guru memiliki riwayat penugasan/wali kelas, gunakan tombol Nonaktifkan.)`,
    confirmText: 'Hapus Permanen',
    variant: 'danger'
  });
  if (!ok) return;
  const res = await apiCall('DELETE', `/api/teachers/${encodeURIComponent(id)}`);
  if (!res || !res.ok) return;
  await refreshStateFromServer(true);
  await loadUsersList();
  renderTeacherSwitcherOptions();
  renderSidebar();
  showToast('Data guru & akun login dihapus');
}

async function downloadTeacherTemplate() {
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum termuat.');
    return;
  }
  const headers = ['No', 'NUPTK', 'NIP', 'NAMA ', 'JENIS KELAMIN', 'Tempat Lahir', 'Tgl Lahir (dd-mm-yyyy)', 'Pendidikan Terakhir', 'Password'];
  const sample1 = [1, '12345678901234', '', 'Contoh Ustadz Ahmad, S.Pd.I.', 'L', 'Banyumas', '01-01-1990', 'Sarjana (S1)', 'guru123'];
  const sample2 = [2, '12345678901235', '', 'Contoh Ustadzah Fatimah, S.Pd.', 'P', 'Banyumas', '02-02-1992', 'Sarjana (S1)', 'guru123'];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
  ws['!cols'] = [
    { wch: 5 }, { wch: 18 }, { wch: 20 }, { wch: 30 }, { wch: 14 },
    { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 14 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Guru');
  XLSX.writeFile(wb, 'Template_Upload_Guru_RDP.xlsx');
  showToast('Template Guru (.xlsx) diunduh!');
}

async function handleTeacherUpload(e) {
  const inputEl = e.target;
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (inputEl) inputEl.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('Ukuran file maksimal 10 MB'); return; }
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum termuat.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => { e.target.value = ''; showToast('Gagal membaca file guru'); };
  reader.onload = async (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

      let startIdx = 1;
      let colMap = { nuptk: 1, nip: 2, nama: 3, jk: 4, tempat: 5, tgl: 6, pend: 7, pass: 8 };
      for (let i = 0; i < Math.min(rows.length, 5); i++) {
        const cols = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
        const idxNuptk = cols.findIndex(c => c.includes('nuptk'));
        const idxNama = cols.findIndex(c => c === 'nama' || c.startsWith('nama'));
        if (idxNuptk >= 0 && idxNama >= 0) {
          startIdx = i + 1;
          colMap = {
            nuptk: idxNuptk,
            nip: cols.findIndex(c => c === 'nip'),
            nama: idxNama,
            jk: cols.findIndex(c => c.includes('kelamin') || c === 'jk' || c === 'l/p'),
            tempat: cols.findIndex(c => c.includes('tempat')),
            tgl: cols.findIndex(c => c.includes('tgl') || c.includes('tanggal')),
            pend: cols.findIndex(c => c.includes('pendidikan')),
            pass: cols.findIndex(c => c.includes('password') || c.includes('sandi'))
          };
          break;
        }
      }

      const imported = [];
      for (let i = startIdx; i < rows.length; i++) {
        const cols = (rows[i] || []).map(c => String(c ?? '').trim());
        if (!cols.some(Boolean)) continue;
        const nuptk = colMap.nuptk >= 0 ? (cols[colMap.nuptk] || '') : '';
        const nip = colMap.nip >= 0 ? (cols[colMap.nip] || '-') : '-';
        const nama = colMap.nama >= 0 ? (cols[colMap.nama] || '') : '';
        if (!nama) continue;
        const jk = (colMap.jk >= 0 ? (cols[colMap.jk] || 'L') : 'L').toUpperCase();
        const tempat = colMap.tempat >= 0 ? (cols[colMap.tempat] || '') : '';
        const tgl = colMap.tgl >= 0 ? (cols[colMap.tgl] || '') : '';
        const ttl = [tempat, tgl].filter(Boolean).join(', ') || '-';
        const pendidikan = (colMap.pend >= 0 && cols[colMap.pend]) ? cols[colMap.pend] : 'Sarjana (S1)';
        const rawPassword = colMap.pass >= 0 ? (cols[colMap.pass] || '') : '';
        const role = jk.startsWith('P') ? 'Guru / Ustadzah' : 'Guru / Ustadz';
        const initials = nama.replace(/[^A-Za-z\s]/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'GR';

        const existing = (nuptk && /^\d{6,30}$/.test(nuptk)) ? state.teachers.find(t => t.nuptk === nuptk) : null;
        const password = existing ? rawPassword : (rawPassword || 'guru123');
        imported.push({
          nama,
          namaArab: existing ? existing.namaArab : nama,
          initials,
          role,
          nuptk,
          nip: nip || '-',
          ttl,
          pendidikan,
          waliKelas: existing ? existing.waliKelas : null,
          jumlahSiswa: existing ? existing.jumlahSiswa : 0,
          ekskul: existing ? existing.ekskul : null,
          password
        });
      }

      if (imported.length === 0) {
        showToast('Tidak ada data guru valid ditemukan pada file');
        return;
      }

      let conflictNote = '';
      const res = await apiCall('POST', '/api/teachers', { teachers: imported });
      if (!res || !res.ok) return;
      if (res.skippedConflicts && res.skippedConflicts.length > 0) {
        conflictNote = ` (${res.skippedConflicts.length} NUPTK bertabrakan dengan akun lain & dilewati)`;
      }
      await refreshStateFromServer(true);
      await loadUsersList();
      renderTeacherSwitcherOptions();
      showToast(`${res.count ?? imported.length} data guru & akun login berhasil disimpan!${conflictNote}`);
    } catch (err) {
      console.error('Upload guru gagal:', err);
      showToast('Gagal membaca file Excel guru. Pastikan format file .xlsx/.xls/.csv valid.');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===================== LEMBAGA -> MATA PELAJARAN (CUSTOMIZABLE) =====================
function renderMapelSettings() {
  return `
    ${renderPageHeader('Mata Pelajaran Rapor Lokal', 'Tambah, ubah jam (الساعات), atau nonaktifkan mata pelajaran. Perubahan otomatis memperbarui Rapor Bahasa Arab & Ledger Excel.')}
    <div class="rdp-card p-5 space-y-4">
      <form onsubmit="addSubject(event)" class="grid sm:grid-cols-5 gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3] text-xs">
        <div>
          <label for="new-sub-kelompok" class="block font-semibold text-[#0f4c3a] mb-1">Kelompok</label>
          <select id="new-sub-kelompok" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white">
            <option value="umum">العلوم العامة (Umum)</option>
            <option value="syari">العلوم الشرعية (Syar'i)</option>
          </select>
        </div>
        <div>
          <label for="new-sub-arab" class="block font-semibold text-[#0f4c3a] mb-1">Nama Mapel (Arab)</label>
          <input id="new-sub-arab" type="text" dir="rtl" required placeholder="مثال: البلاغة" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white arabic-font text-sm" />
        </div>
        <div>
          <label for="new-sub-id" class="block font-semibold text-[#0f4c3a] mb-1">Nama Mapel (Indonesia)</label>
          <input id="new-sub-id" type="text" required placeholder="Contoh: Balaghah" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white" />
        </div>
        <div>
          <label for="new-sub-jam" class="block font-semibold text-[#0f4c3a] mb-1">Jam (الساعات)</label>
          <input id="new-sub-jam" type="number" min="1" max="30" value="2" required class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white tabular-nums" />
        </div>
        <div class="flex items-end">
          <button type="submit" class="w-full py-2 px-3 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">+ Tambah Mapel</button>
        </div>
      </form>

      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Kelompok</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-right">اسم المادة (Arab)</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Mata Pelajaran (Indonesia)</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">الساعات (Jam)</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">Status</th>
              <th class="px-3 py-2.5 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${state.subjects.map((sub, idx) => {
              const isAct = sub.active !== false;
              return `
              <tr class="hover:bg-[#fbf8f1]/70 ${isAct ? '' : 'opacity-65 bg-slate-50'}">
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${idx + 1}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3]">
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${sub.kelompok === 'umum' ? 'bg-sky-100 text-sky-800' : 'bg-emerald-100 text-emerald-800'}">
                    ${sub.kelompok === 'umum' ? 'العلوم العامة' : 'العلوم الشرعية'}
                  </span>
                </td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-right font-bold arabic-font text-base" dir="rtl">
                  <input type="text" dir="rtl" aria-label="Nama Arab ${escapeHtml(sub.namaId)}" value="${escapeHtml(sub.namaArab)}" onchange="updateSubject(${sub.id}, 'namaArab', this.value)" class="border border-transparent hover:border-[#e7dcc3] focus:border-[#136048] rounded px-2 py-0.5 text-right w-full bg-transparent" />
                </td>
                <td class="px-3 py-2 border-r border-[#e7dcc3]">
                  <input type="text" aria-label="Nama Indonesia ${escapeHtml(sub.namaId)}" value="${escapeHtml(sub.namaId)}" onchange="updateSubject(${sub.id}, 'namaId', this.value)" class="border border-transparent hover:border-[#e7dcc3] focus:border-[#136048] rounded px-2 py-0.5 w-full bg-transparent" />
                </td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">
                  <input type="number" min="1" max="30" aria-label="Jam ${escapeHtml(sub.namaId)}" value="${sub.jam}" onchange="updateSubject(${sub.id}, 'jam', Number(this.value))" class="w-16 border border-[#e7dcc3] rounded-lg px-1.5 py-0.5 text-center bg-white tabular-nums" />
                </td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${isAct ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">${isAct ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td class="px-3 py-2 text-center whitespace-nowrap space-x-1">
                  <button type="button" onclick="toggleSubjectActive(${sub.id}, ${isAct ? 'false' : 'true'})" class="px-2 py-1 rounded-lg ${isAct ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'} font-semibold">${isAct ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button type="button" onclick="deleteSubject(${sub.id})" class="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold">Hapus</button>
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


async function addSubject(e) {
  e.preventDefault();
  const kelompok = document.getElementById('new-sub-kelompok').value;
  const namaArab = document.getElementById('new-sub-arab').value.trim();
  const namaId = document.getElementById('new-sub-id').value.trim();
  if (!namaArab || !namaId) { showToast('Nama Arab & Indonesia wajib diisi'); return; }
  const jam = Math.min(30, Math.max(1, Math.round(Number(document.getElementById('new-sub-jam').value) || 2)));
  const res = await apiCall('POST', '/api/subjects', { kelompok, namaArab, namaId, jam, kkm: 75 });
  if (!res || !res.ok) return;
  state.subjects.push({ id: res.id || Date.now(), kelompok, namaArab, namaId, jam, kkm: 75, active: true });
  renderPage();
  showToast(`Mata pelajaran "${namaArab}" ditambahkan!`);
}

async function toggleSubjectActive(id, nextActive) {
  const s = state.subjects.find(x => x.id === id);
  if (!s) return;
  const label = nextActive ? 'Aktifkan kembali' : 'Nonaktifkan';
  const ok = await openConfirmModal({
    title: `${label} Mata Pelajaran`,
    message: `${label} mata pelajaran "${s.namaId}"?${nextActive ? '' : ' Mapel disembunyikan dari penugasan/tahun baru, namun arsip nilai & rapor tahun lalu tetap aman.'}`,
    confirmText: label,
    variant: nextActive ? 'primary' : 'warning'
  });
  if (!ok) return;
  const res = await apiCall('PUT', `/api/subjects/${id}/active`, { active: nextActive });
  if (!res || !res.ok) return;
  s.active = nextActive;
  renderPage();
  showToast(`Mata pelajaran ${s.namaId} di${nextActive ? 'aktifkan' : 'nonaktifkan'}`);
}

async function updateSubject(id, field, val) {
  const s = state.subjects.find(x => x.id === id);
  if (!s) return;
  let cleanVal = val;
  if (field === 'namaArab' || field === 'namaId') {
    cleanVal = String(val ?? '').trim();
    if (!cleanVal) { renderPage(); showToast('Nama mata pelajaran tidak boleh kosong'); return; }
  } else if (field === 'jam') {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1 || n > 30) { renderPage(); showToast('Jam pelajaran harus 1–30'); return; }
    cleanVal = Math.round(n);
  }
  const oldNamaArab = s.namaArab;
  const res = await apiCall('PUT', `/api/subjects/${id}`, { [field]: cleanVal });
  if (!res || !res.ok) {
    renderPage();
    return;
  }
  s[field] = cleanVal;
  if (field === 'namaArab' && cleanVal && oldNamaArab && cleanVal !== oldNamaArab) {
    state.assignments.forEach(a => {
      if (a.mapel === oldNamaArab) a.mapel = cleanVal;
    });
    if (state.selectedMapelMengajar === oldNamaArab) state.selectedMapelMengajar = cleanVal;
    renderSidebar();
  }
  showToast('Mata pelajaran diperbarui');
}

async function deleteSubject(id) {
  const s = state.subjects.find(x => x.id === id);
  if (!s) return;
  const ok = await openConfirmModal({
    title: 'Hapus Permanen Mata Pelajaran',
    message: `Hapus permanen mata pelajaran "${s.namaId}" (${s.namaArab})?\n(Jika mapel sudah memiliki nilai/penugasan, gunakan tombol Nonaktifkan.)`,
    confirmText: 'Hapus Permanen',
    variant: 'danger'
  });
  if (!ok) return;
  const res = await apiCall('DELETE', `/api/subjects/${id}`);
  if (!res || !res.ok) return;
  state.subjects = state.subjects.filter(x => x.id !== id);
  renderSidebar();
  renderPage();
  showToast('Mata pelajaran dihapus');
}

