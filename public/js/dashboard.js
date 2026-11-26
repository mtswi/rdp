// ===================== PROKTOR DASHBOARD =====================
function renderProktorDashboard() {
  const q = String(state.activitySearch || '').toLowerCase();
  const filtered = (state.activities || []).filter(a =>
    String(a.user || '').toLowerCase().includes(q) ||
    String(a.level || '').toLowerCase().includes(q) ||
    String(a.activity || '').toLowerCase().includes(q)
  );
  const p = state.pesantren || {};
  const activeTeachersCount = getActiveTeachers().length;
  const activeSubjectsCount = (state.subjects || []).filter(s => s.active !== false).length;
  const assignments = state.assignments || [];
  const totalAssign = assignments.length;
  const sentAssign = assignments.filter(a => a.sent).length;
  const pctAssign = totalAssign > 0 ? Math.round((sentAssign / totalAssign) * 100) : 0;
  const readyClasses = (state.classes || []).filter(c => {
    const classAssigns = assignments.filter(a => a.kode === c.kode);
    return classAssigns.length > 0 && classAssigns.every(a => a.sent);
  }).length;

  const kpiCards = [
    { label: 'Guru / Ustadz Aktif', value: activeTeachersCount, page: 'data-guru', accent: 'border-l-[#0f4c3a]', icon: svgIcons.users },
    { label: 'Santri Terdaftar', value: state.students.length, page: 'data-siswa', accent: 'border-l-[#136048]', icon: svgIcons.users },
    { label: 'Rombongan Kelas', value: state.classes.length, page: 'kelas', accent: 'border-l-[#c9a227]', icon: svgIcons.cls },
    { label: 'Mapel Aktif', value: activeSubjectsCount, page: 'mapel', accent: 'border-l-[#1d7a5c]', icon: svgIcons.book }
  ];

  const quickActions = [
    { label: 'Upload Data Santri', desc: 'Impor Excel data anggota kelas', page: 'data-siswa', icon: svgIcons.users },
    { label: 'Cetak Rapor & Ranking', desc: 'PDF rapor Arab & tabel ranking', page: 'rapor-siswa', icon: svgIcons.book },
    { label: 'Export Ledger Excel', desc: 'Rekap nilai kelas & angkatan', page: 'legger', icon: svgIcons.cls },
    { label: 'Backup Database', desc: 'Unduh cadangan SQLite lengkap', page: 'backup', icon: svgIcons.db }
  ];

  return `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-[#0f4c3a]">Dashboard Proktor</h1>
        <p class="text-xs sm:text-sm text-slate-600 mt-0.5">${escapeHtml(p.nama || 'Rapor Digital Pesantren')}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-3 py-1.5 rounded-full bg-white border border-[#e7dcc3] text-xs font-semibold text-[#0f4c3a] shadow-sm">
          Semester ${escapeHtml(p.semester || 'Ganjil')} &bull; ${escapeHtml(p.tahun || '2026/2027')}
        </span>
        <button type="button" onclick="refreshStateFromServer(true).then(ok => { if (ok) showToast('Data dashboard diperbarui'); })" class="px-3 py-1.5 rounded-lg border border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-semibold transition">
          Segarkan Data
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      ${kpiCards.map(c => `
        <button type="button" onclick="navigate('${c.page}')" class="rdp-card border-l-4 ${c.accent} p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition flex items-center justify-between gap-3 group">
          <div>
            <div class="text-xs font-semibold text-slate-500">${escapeHtml(c.label)}</div>
            <div class="text-2xl sm:text-3xl font-extrabold text-[#0f4c3a] tabular-nums mt-1">${c.value}</div>
            <div class="text-xs font-semibold text-[#136048] mt-1 group-hover:underline">Lihat detail &rarr;</div>
          </div>
          <div class="w-10 h-10 rounded-xl bg-[#fbf8f1] border border-[#e7dcc3] text-[#0f4c3a] flex items-center justify-center flex-shrink-0 p-2.5">${c.icon}</div>
        </button>
      `).join('')}
    </div>

    <!-- GOLDEN RATIO 2-COLUMN LAYOUT (~61.5% : 38.5% = 8fr : 5fr) -->
    <div class="grid grid-cols-1 lg:grid-cols-[8fr_5fr] gap-5 items-start">
      <div class="space-y-5 min-w-0">
        <div class="rdp-card p-5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-base font-bold text-[#0f4c3a]">Progres Pengumpulan Nilai Semester</h2>
              <p class="text-xs text-slate-600 mt-0.5">Memantau kelengkapan pengiriman nilai guru sebelum cetak rapor.</p>
            </div>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${pctAssign === 100 && totalAssign > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-[#fbf8f1] text-[#0f4c3a] border border-[#e7dcc3]'}">
              ${sentAssign} / ${totalAssign} Mapel (${pctAssign}%)
            </span>
          </div>
          <div class="w-full h-3 rounded-full bg-[#efe7d6] overflow-hidden" role="progressbar" aria-valuenow="${pctAssign}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres pengumpulan nilai semester">
            <div class="h-full bg-[#136048] transition-all duration-300" style="width: ${pctAssign}%"></div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div class="text-xs text-slate-600">
              <b class="text-[#0f4c3a] tabular-nums">${readyClasses}</b> dari <b class="tabular-nums">${(state.classes || []).length}</b> kelas sudah 100% terkirim &bull; KKM Aktif: <b class="tabular-nums">${getActiveKkm()}</b>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" onclick="navigate('status-nilai')" class="px-3 py-1.5 rounded-lg border-2 border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold transition">Status Nilai</button>
              <button type="button" onclick="navigate('cetak-ranking')" class="px-3 py-1.5 rounded-lg border border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-semibold transition">Cetak Ranking</button>
              <button type="button" onclick="navigate('rapor-siswa')" class="px-3.5 py-1.5 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold shadow-sm transition">Cetak Rapor (PDF)</button>
            </div>
          </div>
        </div>

        <div class="rdp-card overflow-hidden">
          <div class="px-5 py-3.5 border-b border-[#e7dcc3] bg-[#fbf8f1] flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-bold text-base text-[#0f4c3a]">Aktivitas Terbaru</h2>
            <input id="activity-search-input" type="search" aria-label="Cari aktivitas" value="${escapeHtml(state.activitySearch)}" oninput="updateSearchAndRender('activity-search-input', 'activitySearch', this.value)" placeholder="Cari aktivitas..." class="w-full sm:w-56 border border-[#e7dcc3] bg-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#c9a227]" />
          </div>
          <div class="p-4">
            ${filtered.length === 0 ? `
              <div role="status" class="py-8 px-4 text-center border border-dashed border-[#e7dcc3] rounded-xl bg-[#fbf8f1]/60 space-y-2">
                <div class="text-sm font-bold text-[#0f4c3a]">${q ? 'Aktivitas tidak ditemukan' : 'Belum ada catatan aktivitas'}</div>
                <p class="text-xs text-slate-600">${q ? `Tidak ada log aktivitas yang cocok dengan "${escapeHtml(state.activitySearch)}".` : 'Aktivitas login, unggah nilai, dan perubahan pengaturan akan muncul di sini.'}</p>
                ${q ? `<button type="button" onclick="updateSearchAndRender('activity-search-input', 'activitySearch', '')" class="mt-1 px-3 py-1.5 rounded-lg border border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-semibold">Reset Pencarian</button>` : ''}
              </div>
            ` : `
              <div class="hidden md:block rdp-table-wrap rounded-lg border border-[#e7dcc3]">
                <table class="w-full text-left border-collapse text-sm rdp-table-sticky">
                  <thead>
                    <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a] text-xs">
                      <th class="px-3 py-2.5 border-r border-[#e7dcc3]">User</th>
                      <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Level</th>
                      <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Aktivitas</th>
                      <th class="px-3 py-2.5">Waktu</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[#e7dcc3]">
                    ${filtered.map(a => `
                      <tr class="hover:bg-[#fbf8f1]/70">
                        <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(a.user)}</td>
                        <td class="px-3 py-2 border-r border-[#e7dcc3]"><span class="px-2 py-0.5 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] text-xs font-semibold text-[#0f4c3a]">${escapeHtml(a.level)}</span></td>
                        <td class="px-3 py-2 border-r border-[#e7dcc3] text-slate-700">${escapeHtml(a.activity)}</td>
                        <td class="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">${escapeHtml(a.time)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <div class="md:hidden space-y-2.5 rdp-mobile-cards">
                ${filtered.map(a => `
                  <div class="rounded-xl border border-[#e7dcc3] bg-[#fbf8f1]/50 p-3 space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-bold text-xs text-[#0f4c3a] truncate">${escapeHtml(a.user)}</span>
                      <span class="px-2 py-0.5 rounded-full bg-white border border-[#e7dcc3] text-[11px] font-semibold text-[#0f4c3a] flex-shrink-0">${escapeHtml(a.level)}</span>
                    </div>
                    <div class="text-xs text-slate-700 leading-snug">${escapeHtml(a.activity)}</div>
                    <div class="text-[11px] text-slate-500">${escapeHtml(a.time)}</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>

      <div class="space-y-5 min-w-0">
        <div class="rdp-card p-5 space-y-3">
          <h2 class="text-base font-bold text-[#0f4c3a]">Aksi Cepat</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
            ${quickActions.map(act => `
              <button type="button" onclick="navigate('${act.page}')" class="w-full p-3 rounded-xl border border-[#e7dcc3] bg-[#fbf8f1]/70 hover:bg-[#f3ead6] text-left transition flex items-center gap-3 group">
                <span class="w-9 h-9 rounded-lg bg-[#0f4c3a] text-[#f3e3b0] flex items-center justify-center p-2 flex-shrink-0">${act.icon}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-bold text-[#0f4c3a] group-hover:underline truncate">${escapeHtml(act.label)}</span>
                  <span class="block text-xs text-slate-600 truncate">${escapeHtml(act.desc)}</span>
                </span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="rdp-card p-5 bg-[#fbf8f1] space-y-3 text-xs">
          <div class="flex items-center justify-between gap-2 border-b border-[#e7dcc3] pb-2.5">
            <h2 class="text-sm font-bold text-[#0f4c3a]">Ringkasan Lembaga</h2>
            <span class="px-2 py-0.5 rounded-full bg-white border border-[#e7dcc3] text-xs font-semibold text-[#a07d18]">RDP v4.0</span>
          </div>
          <dl class="space-y-2 text-slate-700">
            <div class="flex justify-between gap-2"><dt class="text-slate-500">Kepala:</dt><dd class="font-semibold text-right">${escapeHtml(p.kepala || '-')}</dd></div>
            <div class="flex justify-between gap-2"><dt class="text-slate-500">Tahun Pelajaran:</dt><dd class="font-semibold">${escapeHtml(p.tahun || '2026/2027')}</dd></div>
            <div class="flex justify-between gap-2"><dt class="text-slate-500">Semester:</dt><dd class="font-semibold">${escapeHtml(p.semester || 'Ganjil')}</dd></div>
            <div class="flex justify-between gap-2"><dt class="text-slate-500">KKM Default:</dt><dd class="font-bold text-[#0f4c3a] tabular-nums">${getActiveKkm()}</dd></div>
            <div class="flex justify-between gap-2"><dt class="text-slate-500">Tanggal Rapor:</dt><dd class="font-semibold">${escapeHtml(p.tanggalIso || '-')}</dd></div>
          </dl>
          <button type="button" onclick="navigate('pengaturan')" class="w-full py-2 px-3 rounded-lg border border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold transition">
            Buka Pengaturan Lembaga
          </button>
        </div>
      </div>
    </div>
  `;
}


// ===================== PROFIL PESANTREN (WITH LOGO UPLOAD) =====================
function renderProfilPesantren() {
  const m = state.pesantren;
  return `
    ${renderPageHeader('Profil Pesantren', 'Identitas lembaga, logo kop rapor, dan data penetapan rapor.', renderDirtyBadge('profil'))}
    <div class="grid lg:grid-cols-3 gap-5 items-start">
      <div class="rdp-card p-5 text-center space-y-4">
        <h2 class="font-bold text-sm text-[#0f4c3a] border-b border-[#e7dcc3] pb-2">Logo Pesantren (Kop Rapor)</h2>
        <div class="w-32 h-32 mx-auto rounded-lg border-2 border-dashed border-[#e7dcc3] flex items-center justify-center overflow-hidden bg-[#fbf8f1]">
          ${isSafeImageDataUrl(m.logoDataUrl)
            ? `<img src="${escapeHtml(m.logoDataUrl)}" alt="Logo Pesantren" class="w-full h-full object-contain p-1" />`
            : `<span class="text-xs text-slate-400 px-3">Belum ada logo</span>`}
        </div>
        <div>
          <label class="inline-flex items-center justify-center min-h-[38px] cursor-pointer px-4 py-2 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-semibold shadow-sm transition">
            Upload Logo (.png / .jpg)
            <input type="file" aria-label="Upload logo pesantren" accept="image/png,image/jpeg,image/webp,image/gif" onchange="handleLogoUpload(event)" class="hidden" />
          </label>
          ${m.logoDataUrl ? `<button type="button" onclick="savePesantrenPartial({logoDataUrl:null}).then(r => { if (r && r.ok) { state.pesantren.logoDataUrl=null; state._mediaStamp=computeLocalMediaStamp(state.pesantren); updateSidebarLogo(); renderPage(); showToast('Logo dihapus'); } })" class="block mx-auto mt-2 text-xs text-rose-600 hover:underline font-semibold">Hapus Logo</button>` : ''}
        </div>
      </div>

      <div class="lg:col-span-2 rdp-card p-5 space-y-4 text-xs">
        <h2 class="font-bold text-sm text-[#0f4c3a] border-b border-[#e7dcc3] pb-2">Profil Pesantren &amp; Penetapan Rapor</h2>
        <div class="grid sm:grid-cols-2 gap-3.5">
          <div>
            <label for="prof-nama" class="block font-semibold text-[#0f4c3a] mb-1">Nama Pesantren (Latin)</label>
            <input id="prof-nama" type="text" value="${escapeHtml(m.nama)}" oninput="state.pesantren.nama=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
          </div>
          <div>
            <label for="prof-nama-arab" class="block font-semibold text-[#0f4c3a] mb-1">Nama Pesantren (Bahasa Arab)</label>
            <input id="prof-nama-arab" type="text" dir="rtl" value="${escapeHtml(m.namaArab)}" oninput="state.pesantren.namaArab=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white arabic-font text-base" />
          </div>
          <div class="sm:col-span-2">
            <label for="prof-alamat" class="block font-semibold text-[#0f4c3a] mb-1">Alamat Pesantren</label>
            <input id="prof-alamat" type="text" value="${escapeHtml(m.alamat || '')}" oninput="state.pesantren.alamat=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
          </div>
          <div>
            <label for="prof-nspp" class="block font-semibold text-[#0f4c3a] mb-1">NSPP / NSM</label>
            <input id="prof-nspp" type="text" value="${escapeHtml(m.nspp)}" oninput="state.pesantren.nspp=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-mono" />
          </div>
          <div>
            <label for="prof-npsn" class="block font-semibold text-[#0f4c3a] mb-1">NPSN</label>
            <input id="prof-npsn" type="text" value="${escapeHtml(m.npsn)}" oninput="state.pesantren.npsn=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-mono" />
          </div>
          <div>
            <label for="prof-kepala" class="block font-semibold text-[#0f4c3a] mb-1">Pimpinan / Kepala (Latin)</label>
            <input id="prof-kepala" type="text" value="${escapeHtml(m.kepala)}" oninput="state.pesantren.kepala=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white" />
          </div>
          <div>
            <label for="prof-kepala-arab" class="block font-semibold text-[#0f4c3a] mb-1">Pimpinan / Kepala (Bahasa Arab)</label>
            <input id="prof-kepala-arab" type="text" dir="rtl" value="${escapeHtml(m.kepalaArab)}" oninput="state.pesantren.kepalaArab=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white arabic-font text-base" />
          </div>
          <div>
            <label for="prof-kota-arab" class="block font-semibold text-[#0f4c3a] mb-1">Tempat Penetapan (Arab)</label>
            <input id="prof-kota-arab" type="text" dir="rtl" value="${escapeHtml(m.kotaArab)}" oninput="state.pesantren.kotaArab=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white arabic-font text-base" />
          </div>
          <div>
            <label for="prof-tanggal-arab" class="block font-semibold text-[#0f4c3a] mb-1">Tanggal Penetapan Rapor (Arab)</label>
            <input id="prof-tanggal-arab" type="text" dir="rtl" value="${escapeHtml(m.tanggalArab)}" oninput="state.pesantren.tanggalArab=this.value; markFormDirty('profil', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white arabic-font text-base" />
          </div>
        </div>
        <div class="pt-2 flex flex-wrap items-center gap-3">
          <button type="button" onclick="saveProfilFromForm()" class="min-h-[40px] px-5 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold shadow-sm transition">Simpan Profil</button>
        </div>
      </div>
    </div>
  `;
}

async function saveProfilFromForm() {
  const m = state.pesantren;
  if (!String(m.nama || '').trim() || !String(m.namaArab || '').trim()) {
    showToast('Nama Pesantren (Latin & Arab) tidak boleh kosong');
    await refreshStateFromServer(true);
    return;
  }
  const r = await savePesantrenPartial({
    nama: String(m.nama).trim(),
    namaArab: String(m.namaArab).trim(),
    alamat: m.alamat,
    nspp: m.nspp,
    npsn: m.npsn,
    kepala: m.kepala,
    kepalaArab: m.kepalaArab,
    kotaArab: m.kotaArab,
    tanggalArab: m.tanggalArab
  });
  if (r && r.ok) {
    markFormDirty('profil', false);
    updateLoginBranding(state.pesantren);
    updateFooterPesantren();
    showToast('Profil Pesantren berhasil disimpan ke database');
  } else {
    await refreshStateFromServer(true);
  }
}


function handleLogoUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Ukuran gambar maksimal 5 MB'); return; }
  const reader = new FileReader();
  reader.onerror = () => showToast('Gagal membaca file logo');
  reader.onload = async () => {
    const compressed = await compressImageDataUrl(reader.result, { maxDim: 360, quality: 0.82 });
    if (!compressed) { showToast('File gambar tidak valid (gunakan PNG/JPG/WebP)'); return; }
    const res = await savePesantrenPartial({ logoDataUrl: compressed });
    if (res && res.ok) {
      state.pesantren.logoDataUrl = compressed;
      state._mediaStamp = computeLocalMediaStamp(state.pesantren);
      updateSidebarLogo();
      renderPage();
      showToast('Logo pesantren berhasil dioptimalkan & disimpan!');
    }
  };
  reader.readAsDataURL(file);
}

function updateSidebarLogo() {
  updateLoginBranding(state.pesantren);
}

function updateLoginBranding(p) {
  if (!p) return;
  const logoBox = document.getElementById('login-logo-box');
  if (logoBox) {
    logoBox.innerHTML = isSafeImageDataUrl(p.logoDataUrl)
      ? `<img src="${escapeHtml(p.logoDataUrl)}" alt="Logo Pesantren" class="max-w-full max-h-full object-contain" />`
      : `<img src="/assets/rdp-icon.png" alt="Logo Pesantren" class="max-w-full max-h-full object-contain" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><svg class="rdp-brand-fallback" style="display:none;width:100%;height:100%;" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="2" y="2" width="32" height="32" rx="8" fill="#e8f5ee"/><path d="M18 9.5c-3.8 0-7.2 1.1-9.2 2.4v12.8c2.2-1.1 5.4-1.8 9.2-1.8s7 .7 9.2 1.8V11.9c-2-1.3-5.4-2.4-9.2-2.4z" stroke="#0f4c3a" stroke-width="2" stroke-linejoin="round" fill="#fff"/><path d="M18 9.5v13.4" stroke="#0f4c3a" stroke-width="1.8" stroke-linecap="round"/><path d="M25.5 7.5a3.2 3.2 0 0 0 0 5.5 2.7 2.7 0 1 1 0-5.5z" fill="#c9a227"/></svg>`;
  }
  const nameEl = document.getElementById('login-pesantren-name');
  if (nameEl && p.nama) nameEl.textContent = p.nama;
  const arabEl = document.getElementById('login-pesantren-arab');
  if (arabEl && typeof p.namaArab === 'string') {
    const arabText = p.namaArab.trim();
    arabEl.textContent = arabText;
    arabEl.classList.toggle('hidden', !arabText);
  }
  const tahunSpan = document.getElementById('login-period-tahun');
  if (tahunSpan && p.tahun) tahunSpan.textContent = p.tahun;
  const semSpan = document.getElementById('login-period-semester');
  if (semSpan && p.semester) semSpan.textContent = p.semester;
}

async function loadPublicBranding() {
  if (location.protocol === 'file:') { updateLoginBranding(state.pesantren); return; }
  try {
    const res = await fetch('/api/public/branding');
    if (res.ok) updateLoginBranding(await res.json());
  } catch (e) { /* ignore */ }
}

// ===================== LEMBAGA -> PENGATURAN =====================
function isoDateToArabic(isoStr) {
  if (!isoStr) return '';
  const parts = String(isoStr).split('-');
  if (parts.length !== 3) return isoStr;
  const yNum = Number(parts[0]);
  const mNum = Number(parts[1]);
  const dNum = Number(parts[2]);
  if (!Number.isFinite(yNum) || !Number.isFinite(mNum) || !Number.isFinite(dNum) || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return isoStr;
  const monthsAr = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  return `${toArabicDigits(dNum)} ${monthsAr[mNum - 1]} ${toArabicDigits(yNum)} م`;
}

function onTanggalRaporIsoChange(isoVal) {
  state.pesantren.tanggalIso = isoVal;
  if (!isoVal) return;
  state.pesantren.tanggalArab = isoDateToArabic(isoVal);
  const el = document.getElementById('input-tanggal-arab');
  if (el) el.value = state.pesantren.tanggalArab;
}

function handleWatermarkUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('Ukuran gambar maksimal 5 MB'); return; }
  const reader = new FileReader();
  reader.onerror = () => showToast('Gagal membaca file watermark');
  reader.onload = async () => {
    const compressed = await compressImageDataUrl(reader.result, { maxDim: 480, quality: 0.78 });
    if (!compressed) { showToast('File gambar tidak valid (gunakan PNG/JPG/WebP)'); return; }
    const res = await savePesantrenPartial({ watermarkDataUrl: compressed, watermarkType: 'image' });
    if (res && res.ok) {
      state.pesantren.watermarkDataUrl = compressed;
      state.pesantren.watermarkType = 'image';
      state._mediaStamp = computeLocalMediaStamp(state.pesantren);
      renderPage();
      showToast('Gambar watermark rapor berhasil dioptimalkan & disimpan!');
    }
  };
  reader.readAsDataURL(file);
}

function refreshA4WatermarkPreview() {
  const box = document.getElementById('a4-watermark-preview-box');
  if (!box) return;
  // Preview paper is 320px wide (real A4 width ~794px -> scale ~0.403)
  box.innerHTML = renderWatermarkOverlay(state.pesantren, 320 / 794);
  const info = document.getElementById('a4-watermark-preview-info');
  if (info) {
    const m = state.pesantren;
    const modeLbl = m.watermarkType === 'text' ? `Teks Berulang (${m.watermarkFontSize || 24}px)` : (m.watermarkType === 'none' ? 'Tanpa Watermark' : `Logo/Gambar (${m.watermarkSize || 300}px)`);
    info.textContent = `${modeLbl} • Opacity ${Math.round((m.watermarkOpacity ?? 0.08) * 100)}% • ${(m.watermarkColor || 'color') === 'grayscale' ? 'Grayscale' : 'Warna'}`;
  }
}

function adjustWatermarkSize(delta) {
  const cur = Number(state.pesantren.watermarkSize || 300);
  const next = Math.min(560, Math.max(100, cur + delta));
  state.pesantren.watermarkSize = next;
  const rng = document.getElementById('wm-size-range');
  const lbl = document.getElementById('wm-size-label');
  if (rng) rng.value = next;
  if (lbl) lbl.textContent = next + ' px';
  refreshA4WatermarkPreview();
}

function adjustWatermarkFontSize(delta) {
  const cur = Number(state.pesantren.watermarkFontSize || 24);
  const next = Math.min(64, Math.max(12, cur + delta));
  state.pesantren.watermarkFontSize = next;
  const rng = document.getElementById('wm-font-range');
  const lbl = document.getElementById('wm-font-label');
  if (rng) rng.value = next;
  if (lbl) lbl.textContent = next + ' px';
  refreshA4WatermarkPreview();
}

function ensureDraftPredikatConfig() {
  const kkm = getActiveKkm();
  if (!Array.isArray(state.pesantren.predikatConfig) || state.pesantren.predikatConfig.length !== 5) {
    state.pesantren.predikatConfig = buildDefaultPredikatConfig(kkm);
  } else {
    state.pesantren.predikatConfig = state.pesantren.predikatConfig.map((item, idx) => ({
      key: PREDIKAT_KEYS[idx],
      min: idx === 4 ? 0 : (idx === 3 ? kkm : (item && item.min !== undefined ? item.min : 0)),
      label: item && item.label !== undefined ? String(item.label) : DEFAULT_PREDIKAT_LABELS[idx]
    }));
  }
  return state.pesantren.predikatConfig;
}

function syncPredikatEditorDom(updateInputs = false) {
  const kkm = getActiveKkm();
  const cfg = ensureDraftPredikatConfig();
  if (updateInputs) {
    [0, 1, 2].forEach(idx => {
      const minInp = document.getElementById(`pred-min-${idx}`);
      if (minInp) minInp.value = cfg[idx].min;
    });
    const dMinEl = document.getElementById('pred-min-3');
    if (dMinEl) dMinEl.textContent = kkm;
    cfg.forEach((tier, idx) => {
      const lblInp = document.getElementById(`pred-label-${idx}`);
      if (lblInp) lblInp.value = tier.label;
    });
  }
  cfg.forEach((_, idx) => {
    const rngEl = document.getElementById(`pred-range-${idx}`);
    if (rngEl) rngEl.textContent = formatPredikatRangeLabel(cfg, idx, kkm);
  });
  const errEl = document.getElementById('pred-validation-msg');
  if (errEl) {
    const err = validatePredikatTiersClient(cfg, kkm);
    errEl.textContent = err || '';
    errEl.classList.toggle('hidden', !err);
  }
}

function onKkmDefaultChange(rawVal, commitInput = true) {
  if (String(rawVal ?? '').trim() === '') return;
  const n = Number(rawVal);
  if (!Number.isFinite(n)) return;
  const nextKkm = Math.min(100, Math.max(0, Math.round(n)));
  state.bobot.kkm = nextKkm;
  if (commitInput) {
    const kkmInp = document.getElementById('set-kkm-default');
    if (kkmInp) kkmInp.value = nextKkm;
  }
  const curLabels = ensureDraftPredikatConfig().map(x => String(x.label ?? '').trim());
  state.pesantren.predikatConfig = buildDefaultPredikatConfig(nextKkm, curLabels);
  syncPredikatEditorDom(true);
}

function onPredikatMinChange(idx, rawVal) {
  const cfg = ensureDraftPredikatConfig();
  const trimmed = String(rawVal ?? '').trim();
  if (trimmed === '') {
    cfg[idx].min = '';
  } else {
    const n = Number(trimmed);
    if (Number.isFinite(n)) cfg[idx].min = Math.min(100, Math.max(0, Math.round(n)));
  }
  syncPredikatEditorDom(false);
}

function onPredikatLabelChange(idx, rawVal) {
  const cfg = ensureDraftPredikatConfig();
  cfg[idx].label = String(rawVal ?? '');
  syncPredikatEditorDom(false);
}

function recalculatePredikatFromKkm() {
  const curLabels = ensureDraftPredikatConfig().map(x => String(x.label ?? '').trim());
  state.pesantren.predikatConfig = buildDefaultPredikatConfig(getActiveKkm(), curLabels);
  syncPredikatEditorDom(true);
  showToast('Rentang nilai predikat dihitung ulang dari KKM');
}

function resetPredikatDefaults() {
  state.pesantren.predikatConfig = buildDefaultPredikatConfig(getActiveKkm());
  syncPredikatEditorDom(true);
  showToast('Nama & rentang predikat dikembalikan ke default');
}

function renderLembagaPengaturan() {
  const m = state.pesantren;
  const wmType = m.watermarkType || 'logo';
  const wmOpacity = Number(m.watermarkOpacity ?? 0.08);
  const wmColor = m.watermarkColor || 'color';
  const wmSize = Number(m.watermarkSize || 300);
  const wmFontSize = Number(m.watermarkFontSize || 24);
  const modeLbl = wmType === 'text' ? `Teks Berulang (${wmFontSize}px)` : (wmType === 'none' ? 'Tanpa Watermark' : `Logo/Gambar (${wmSize}px)`);
  const activeKkm = getActiveKkm();
  const predTiers = ensureDraftPredikatConfig();
  const predErr = validatePredikatTiersClient(predTiers, activeKkm);

  return `
    ${renderPageHeader('Pengaturan Lembaga', 'Kelola tahun pelajaran aktif, KKM & rentang predikat, tanggal rapor, serta watermark A4.', renderDirtyBadge('pengaturan'))}
    <div class="grid lg:grid-cols-[8fr_5fr] gap-5 items-start">
      <!-- LEFT COLUMN: FORM PENGATURAN -->
      <div class="rdp-card p-5 space-y-5 text-sm">
        <h2 class="font-bold text-base sm:text-lg text-[#0f4c3a] border-b border-[#e7dcc3] pb-2">Pengaturan Lembaga, KKM &amp; Predikat, Tanggal Rapor &amp; Watermark</h2>

        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label for="set-tahun" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">Tahun Pelajaran Aktif</label>
            <div class="flex items-center gap-2">
              <select id="set-tahun" onchange="markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white text-sm">
                ${getAcademicYearOptions([m.tahun]).map(y => `<option value="${escapeHtml(y)}" ${m.tahun === y ? 'selected' : ''}>${escapeHtml(y)}</option>`).join('')}
              </select>
              <button type="button" onclick="addCustomAcademicYear()" title="Tambah opsi tahun pelajaran baru" class="min-h-[38px] px-3 py-2 rounded-lg border border-[#136048] text-[#136048] hover:bg-[#136048] hover:text-white text-xs font-semibold whitespace-nowrap transition">+ Tambah</button>
            </div>
            <span class="text-xs text-slate-500 mt-1 block">Klik "Simpan Pengaturan" untuk menerapkan perubahan tahun/semester.</span>
          </div>
          <div>
            <label for="set-semester" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">Semester Aktif</label>
            <select id="set-semester" onchange="markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white text-sm">
              <option value="Ganjil" ${m.semester==='Ganjil'?'selected':''}>Ganjil</option>
              <option value="Genap" ${m.semester==='Genap'?'selected':''}>Genap</option>
            </select>
          </div>
          <div>
            <label for="set-kurikulum" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">Sistem Kurikulum</label>
            <input id="set-kurikulum" type="text" value="${escapeHtml(m.kurikulum)}" oninput="state.pesantren.kurikulum=this.value; markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white text-sm" />
          </div>
          <div>
            <label for="set-kkm-default" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">KKM Default</label>
            <input id="set-kkm-default" type="number" min="0" max="100" value="${activeKkm}" oninput="onKkmDefaultChange(this.value, false); markFormDirty('pengaturan', true)" onchange="onKkmDefaultChange(this.value, true); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold tabular-nums text-sm" />
            <span class="text-xs text-slate-500 mt-1 block">Mengubah KKM otomatis menyesuaikan rentang predikat berbasis KKM.</span>
          </div>
        </div>

        <!-- 1. RANGE & NAMA PREDIKAT NILAI -->
        <div class="border-t border-[#e7dcc3] pt-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="font-bold text-xs text-[#0f4c3a] uppercase tracking-wider">1. Pengaturan Range &amp; Nama Predikat Nilai (Berbasis KKM)</h3>
              <div class="text-xs text-slate-500 mt-0.5">4 tingkat tuntas (&ge; KKM) + 1 tingkat belum tuntas (&lt; KKM). Nilai &amp; predikat di bawah KKM otomatis dicetak merah di Rapor.</div>
            </div>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <button type="button" onclick="recalculatePredikatFromKkm(); markFormDirty('pengaturan', true)" class="px-2.5 py-1.5 rounded-lg border border-[#136048] text-[#0f4c3a] bg-white hover:bg-emerald-50 font-semibold">Hitung Otomatis dari KKM</button>
              <button type="button" onclick="resetPredikatDefaults(); markFormDirty('pengaturan', true)" class="px-2.5 py-1.5 rounded-lg border border-[#e7dcc3] text-slate-700 bg-white hover:bg-slate-100 font-semibold">Reset Default</button>
            </div>
          </div>

          <div class="overflow-x-auto bg-[#fbf8f1] p-3 rounded-lg border border-[#e7dcc3]">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-[#e7dcc3] text-[#0f4c3a] font-bold">
                  <th class="py-1.5 px-2 w-12 text-center">Tingkat</th>
                  <th class="py-1.5 px-2">Status Ketuntasan</th>
                  <th class="py-1.5 px-2 w-28 text-center">Batas Minimal</th>
                  <th class="py-1.5 px-2 w-36 text-center">Rentang Nilai</th>
                  <th class="py-1.5 px-2">Nama Predikat (Tampil di Rapor)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#e7dcc3]">
                ${predTiers.map((tier, idx) => {
                  const isFailTier = idx === 4;
                  const isKkmTier = idx === 3;
                  const rangeLabel = formatPredikatRangeLabel(predTiers, idx, activeKkm);
                  return `
                    <tr>
                      <td class="py-2 px-2 text-center font-bold ${isFailTier ? 'text-[#d90000]' : 'text-[#0f4c3a]'}">${escapeHtml(tier.key)}</td>
                      <td class="py-2 px-2">
                        ${isFailTier
                          ? '<span class="inline-block px-2 py-0.5 rounded bg-rose-100 text-[#d90000] font-semibold">Di bawah KKM (Merah)</span>'
                          : `<span class="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">${isKkmTier ? 'Batas Tuntas (= KKM)' : 'Tuntas (&ge; KKM)'}</span>`}
                      </td>
                      <td class="py-2 px-2 text-center">
                        ${isFailTier
                          ? '<span class="inline-block px-2.5 py-1 rounded bg-slate-100 border border-slate-200 font-mono text-slate-500">0 (&lt; KKM)</span>'
                          : isKkmTier
                            ? `<span id="pred-min-3" class="inline-block px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 font-mono font-bold text-[#0f4c3a]">${activeKkm}</span>`
                            : `<input id="pred-min-${idx}" aria-label="Batas minimal predikat ${escapeHtml(tier.key)}" type="number" min="0" max="100" value="${escapeHtml(tier.min)}" oninput="onPredikatMinChange(${idx}, this.value); markFormDirty('pengaturan', true)" class="w-20 border border-[#e7dcc3] rounded-lg px-2 py-1 bg-white text-center font-mono font-bold tabular-nums" />`}
                      </td>
                      <td class="py-2 px-2 text-center">
                        <span id="pred-range-${idx}" class="inline-block px-2.5 py-1 rounded border font-mono font-bold tabular-nums ${isFailTier ? 'bg-rose-50 border-rose-200 text-[#d90000]' : 'bg-white border-[#e7dcc3] text-[#0f4c3a]'}">${escapeHtml(rangeLabel)}</span>
                      </td>
                      <td class="py-2 px-2">
                        <input id="pred-label-${idx}" aria-label="Nama predikat ${escapeHtml(tier.key)}" type="text" dir="rtl" maxlength="40" value="${escapeHtml(tier.label)}" oninput="onPredikatLabelChange(${idx}, this.value); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1 bg-white arabic-font text-base font-bold ${isFailTier ? 'text-[#d90000]' : 'text-slate-900'}" />
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            <div id="pred-validation-msg" class="${predErr ? '' : 'hidden'} mt-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">${escapeHtml(predErr || '')}</div>
          </div>
        </div>

        <!-- 2. TANGGAL RAPOR -->
        <div class="border-t border-[#e7dcc3] pt-4 space-y-3">
          <h3 class="font-bold text-xs text-[#0f4c3a] uppercase tracking-wider">2. Pengaturan Tanggal &amp; Tempat Penetapan Rapor</h3>
          <div class="grid sm:grid-cols-3 gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3]">
            <div>
              <label for="set-tanggal-iso" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">Pilih Tanggal (Kalender)</label>
              <input id="set-tanggal-iso" type="date" value="${escapeHtml(m.tanggalIso || '2025-12-20')}" onchange="onTanggalRaporIsoChange(this.value); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white text-xs" />
              <span class="text-xs text-slate-500 mt-1 block">Otomatis mengisi tanggal Arab di samping</span>
            </div>
            <div>
              <label for="input-tanggal-arab" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">Tanggal Rapor (Teks Arab di Rapor)</label>
              <input id="input-tanggal-arab" type="text" dir="rtl" value="${escapeHtml(m.tanggalArab || '')}" oninput="state.pesantren.tanggalArab=this.value; markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white arabic-font text-base" />
            </div>
            <div>
              <label for="set-kota-arab" class="block font-semibold text-[#0f4c3a] mb-1 text-xs">Tempat Penetapan (Arab)</label>
              <input id="set-kota-arab" type="text" dir="rtl" value="${escapeHtml(m.kotaArab || '')}" oninput="state.pesantren.kotaArab=this.value; markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white arabic-font text-base" />
            </div>
          </div>
        </div>

        <!-- 3. WATERMARK RAPOR -->
        <div class="border-t border-[#e7dcc3] pt-4 space-y-3">
          <h3 class="font-bold text-xs text-[#0f4c3a] uppercase tracking-wider">3. Pengaturan Watermark Cetak Rapor</h3>
          <div class="grid sm:grid-cols-2 gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3] text-xs">
            <div>
              <label for="set-wm-type" class="block font-semibold text-[#0f4c3a] mb-1">Mode Watermark pada Rapor</label>
              <select id="set-wm-type" onchange="state.pesantren.watermarkType=this.value; refreshA4WatermarkPreview(); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white font-semibold">
                <option value="logo" ${wmType === 'logo' ? 'selected' : ''}>Gunakan Logo Pesantren</option>
                <option value="image" ${wmType === 'image' ? 'selected' : ''}>Gunakan Gambar Watermark Khusus</option>
                <option value="text" ${wmType === 'text' ? 'selected' : ''}>Gunakan Teks Watermark (Berulang)</option>
                <option value="none" ${wmType === 'none' ? 'selected' : ''}>Tanpa Watermark</option>
              </select>
            </div>
            <div>
              <label for="set-wm-opacity" class="block font-semibold text-[#0f4c3a] mb-1">Ketebalan / Opacity Watermark</label>
              <select id="set-wm-opacity" onchange="state.pesantren.watermarkOpacity=Number(this.value); refreshA4WatermarkPreview(); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white">
                <option value="0.05" ${wmOpacity === 0.05 ? 'selected' : ''}>5% (Sangat Tipis)</option>
                <option value="0.08" ${wmOpacity === 0.08 ? 'selected' : ''}>8% (Standar Elegan)</option>
                <option value="0.12" ${wmOpacity === 0.12 ? 'selected' : ''}>12% (Sedang)</option>
                <option value="0.18" ${wmOpacity === 0.18 ? 'selected' : ''}>18% (Jelas)</option>
                <option value="0.25" ${wmOpacity === 0.25 ? 'selected' : ''}>25% (Tebal)</option>
              </select>
            </div>
            <div>
              <label for="set-wm-color" class="block font-semibold text-[#0f4c3a] mb-1">Warna Watermark (Warna / Grayscale)</label>
              <select id="set-wm-color" onchange="state.pesantren.watermarkColor=this.value; refreshA4WatermarkPreview(); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white font-semibold">
                <option value="color" ${wmColor === 'color' ? 'selected' : ''}>Warna Asli (Color)</option>
                <option value="grayscale" ${wmColor === 'grayscale' ? 'selected' : ''}>Hitam Putih (Grayscale)</option>
              </select>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="wm-size-range" class="font-semibold text-[#0f4c3a]">Ukuran Logo / Gambar Watermark</label>
                <span id="wm-size-label" class="font-mono font-bold text-[#0f4c3a]">${wmSize} px</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="adjustWatermarkSize(-20); markFormDirty('pengaturan', true)" class="px-2.5 py-1 rounded-lg border border-[#e7dcc3] bg-white hover:bg-slate-100 font-bold text-slate-700" aria-label="Perkecil ukuran logo watermark" title="Perkecil">−</button>
                <input id="wm-size-range" type="range" min="100" max="560" step="10" value="${wmSize}"
                  oninput="state.pesantren.watermarkSize=Number(this.value); document.getElementById('wm-size-label').textContent=this.value+' px'; refreshA4WatermarkPreview(); markFormDirty('pengaturan', true)"
                  class="w-full accent-[#136048] cursor-pointer" />
                <button type="button" onclick="adjustWatermarkSize(20); markFormDirty('pengaturan', true)" class="px-2.5 py-1 rounded-lg border border-[#e7dcc3] bg-white hover:bg-slate-100 font-bold text-slate-700" aria-label="Perbesar ukuran logo watermark" title="Perbesar">+</button>
              </div>
            </div>
            <div>
              <label for="set-wm-text" class="block font-semibold text-[#0f4c3a] mb-1">Teks Watermark Berulang (Mode Teks)</label>
              <input id="set-wm-text" type="text" placeholder="${escapeHtml(m.namaArab)}" value="${escapeHtml(m.watermarkText || '')}" oninput="state.pesantren.watermarkText=this.value; refreshA4WatermarkPreview(); markFormDirty('pengaturan', true)" class="w-full border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-white" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="wm-font-range" class="font-semibold text-[#0f4c3a]">Ukuran Huruf Teks Watermark</label>
                <span id="wm-font-label" class="font-mono font-bold text-[#0f4c3a]">${wmFontSize} px</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" onclick="adjustWatermarkFontSize(-2); markFormDirty('pengaturan', true)" class="px-2.5 py-1 rounded-lg border border-[#e7dcc3] bg-white hover:bg-slate-100 font-bold text-slate-700" aria-label="Perkecil huruf teks watermark" title="Perkecil Huruf">−</button>
                <input id="wm-font-range" type="range" min="12" max="64" step="2" value="${wmFontSize}"
                  oninput="state.pesantren.watermarkFontSize=Number(this.value); document.getElementById('wm-font-label').textContent=this.value+' px'; refreshA4WatermarkPreview(); markFormDirty('pengaturan', true)"
                  class="w-full accent-[#136048] cursor-pointer" />
                <button type="button" onclick="adjustWatermarkFontSize(2); markFormDirty('pengaturan', true)" class="px-2.5 py-1 rounded-lg border border-[#e7dcc3] bg-white hover:bg-slate-100 font-bold text-slate-700" aria-label="Perbesar huruf teks watermark" title="Perbesar Huruf">+</button>
              </div>
            </div>
            <div class="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg border border-[#e7dcc3] bg-white flex items-center justify-center overflow-hidden">
                  ${isSafeImageDataUrl(m.watermarkDataUrl)
                    ? `<img src="${escapeHtml(m.watermarkDataUrl)}" alt="Preview Watermark" class="max-w-full max-h-full object-contain" />`
                    : (isSafeImageDataUrl(m.logoDataUrl) ? `<img src="${escapeHtml(m.logoDataUrl)}" alt="Preview Logo Watermark" class="max-w-full max-h-full object-contain opacity-75" />` : `<span class="text-xs text-slate-400">Logo</span>`)}
                </div>
                <div>
                  <div class="font-semibold text-slate-700">Gambar Watermark Khusus (Opsional)</div>
                  <div class="text-xs text-slate-500">${m.watermarkDataUrl ? 'Menggunakan gambar watermark khusus' : 'Saat ini mengikuti Logo Pesantren'}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <label class="cursor-pointer px-3 py-1.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">
                  Upload Watermark (.png/.jpg)
                  <input type="file" aria-label="Upload gambar watermark" accept="image/png,image/jpeg,image/webp,image/gif" onchange="handleWatermarkUpload(event)" class="hidden" />
                </label>
                ${m.watermarkDataUrl ? `
                  <button type="button" onclick="savePesantrenPartial({watermarkDataUrl:null,watermarkType:'logo'}).then(r => { if (r && r.ok) { state.pesantren.watermarkDataUrl=null; state.pesantren.watermarkType='logo'; state._mediaStamp=computeLocalMediaStamp(state.pesantren); renderPage(); showToast('Watermark khusus dihapus'); } })" class="px-2.5 py-1.5 rounded-lg bg-rose-100 text-rose-700 font-semibold">Hapus</button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="pt-2 flex flex-wrap items-center gap-3">
          <button type="button" onclick="savePengaturanFromForm()" class="min-h-[42px] px-5 py-2.5 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-sm font-bold shadow-sm transition">Simpan Pengaturan</button>
        </div>
      </div>

      <!-- RIGHT COLUMN: LIVE BLANK A4 PAPER WATERMARK PREVIEW -->
      <div class="rdp-card p-5 flex flex-col items-center text-sm">
        <div class="w-full flex items-center justify-between border-b border-[#e7dcc3] pb-2 mb-3">
          <div>
            <h2 class="font-bold text-base text-[#0f4c3a]">Preview Kertas Kosong A4</h2>
            <div id="a4-watermark-preview-info" class="text-xs text-slate-500">${modeLbl} • Opacity ${Math.round(wmOpacity * 100)}% • ${wmColor === 'grayscale' ? 'Grayscale' : 'Warna'}</div>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] font-mono text-[11px] font-bold text-[#0f4c3a]">210 × 297 mm</span>
        </div>

        <div class="p-3 bg-[#f7f3ea] rounded-lg border border-[#e7dcc3] flex items-center justify-center w-full">
          <!-- A4 Aspect Ratio Sheet (320px x 453px = 210:297) -->
          <div class="relative bg-white shadow-md border border-[#e7dcc3] overflow-hidden select-none" style="width: 320px; height: 453px;">
            <!-- Subtle margin guide box (0.5cm top/bottom, 1.5cm left/right) -->
            <div class="absolute border border-dashed border-slate-200 pointer-events-none z-10" style="top: 8px; bottom: 8px; left: 23px; right: 23px;"></div>
            <div id="a4-watermark-preview-box" class="absolute inset-0">
              ${renderWatermarkOverlay(m, 320 / 794)}
            </div>
          </div>
        </div>
        <div class="text-xs text-slate-500 mt-2.5 text-center">Kertas A4 kosong (tanpa memuat data santri). Garis putus-putus menunjukkan batas margin cetak (1,5 cm kiri/kanan, 0,5 cm atas/bawah).</div>
      </div>
    </div>
  `;
}


