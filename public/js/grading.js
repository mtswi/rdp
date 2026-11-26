// ===================== GURU DASHBOARD, MENGAJAR & PENILAIAN =====================
function renderGuruDashboard() {
  const g = getCurrentTeacher();
  if (!g) {
    return `<div class="rdp-card p-6 text-sm text-slate-600">Data profil guru belum tertaut ke akun ini. Hubungi Admin / Proktor.</div>`;
  }
  const mine = getTeacherAssignments();
  const totalMine = mine.length;
  const sentMine = mine.filter(k => k.sent).length;
  const pctMine = totalMine > 0 ? Math.round((sentMine / totalMine) * 100) : 0;
  const p = state.pesantren || {};
  const waliKelasKode = getWaliKelasKode();

  return `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold text-[#0f4c3a]">Dashboard Guru &amp; Wali Kelas</h1>
        <p class="text-xs sm:text-sm text-slate-600 mt-0.5">Kelola input nilai mata pelajaran dan status pengiriman kelas Anda.</p>
      </div>
      <span class="px-3 py-1.5 rounded-full bg-white border border-[#e7dcc3] text-xs font-semibold text-[#0f4c3a] shadow-sm">
        Semester ${escapeHtml(p.semester || 'Ganjil')} &bull; ${escapeHtml(p.tahun || '2026/2027')}
      </span>
    </div>

    <!-- GOLDEN RATIO 2-COLUMN LAYOUT (~38.5% : 61.5% = 5fr : 8fr) -->
    <div class="grid grid-cols-1 lg:grid-cols-[5fr_8fr] gap-5 items-start">
      <div class="space-y-4 min-w-0">
        <div class="rdp-card p-5 text-center space-y-3">
          <div class="w-20 h-20 rounded-full bg-[#0f4c3a] text-[#f3e3b0] border-2 border-[#c9a227] font-bold text-2xl flex items-center justify-center mx-auto shadow">${escapeHtml(g.initials)}</div>
          <div>
            <h2 class="font-bold text-base text-slate-900">${escapeHtml(g.nama)}</h2>
            <div class="text-xs text-slate-500 mt-0.5">${escapeHtml(g.role)} &bull; NUPTK: <span class="font-mono">${escapeHtml(g.nuptk)}</span></div>
          </div>
          <div class="pt-3 border-t border-[#e7dcc3] text-left text-xs space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-600">Progres Pengiriman Nilai</span>
              <span class="font-bold text-[#0f4c3a] tabular-nums">${sentMine} / ${totalMine} (${pctMine}%)</span>
            </div>
            <div class="w-full h-2.5 rounded-full bg-[#efe7d6] overflow-hidden" role="progressbar" aria-valuenow="${pctMine}" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full bg-[#136048] transition-all duration-300" style="width: ${pctMine}%"></div>
            </div>
            <div class="text-slate-600 pt-1">
              Wali Kelas: <b class="text-[#0f4c3a]">${waliKelasKode ? `Kelas ${escapeHtml(waliKelasKode)}` : 'Bukan wali kelas'}</b>
            </div>
          </div>
        </div>

        ${waliKelasKode ? `
          <div class="rdp-card p-4 bg-[#fbf8f1] space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-bold text-[#0f4c3a]">Pintasan Wali Kelas ${escapeHtml(waliKelasKode)}</h2>
              <span class="px-2 py-0.5 rounded-full bg-white border border-[#e7dcc3] text-xs font-semibold text-[#a07d18]">Wali Kelas</span>
            </div>
            <div class="grid grid-cols-1 gap-2">
              <button type="button" onclick="navigate('status-nilai-kelas')" class="w-full px-3 py-2 rounded-lg border border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold text-left transition flex items-center justify-between">
                <span>Status Nilai Kelas ${escapeHtml(waliKelasKode)}</span><span>&rarr;</span>
              </button>
              <button type="button" onclick="navigate('rapor-siswa')" class="w-full px-3 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold text-left transition flex items-center justify-between">
                <span>Cetak Rapor (PDF)</span><span>&rarr;</span>
              </button>
              <button type="button" onclick="navigate('cetak-ranking')" class="w-full px-3 py-2 rounded-lg border border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold text-left transition flex items-center justify-between">
                <span>Cetak Ranking</span><span>&rarr;</span>
              </button>
              <button type="button" onclick="navigate('legger')" class="w-full px-3 py-2 rounded-lg border border-[#e7dcc3] bg-white hover:bg-[#f3ead6] text-[#0f4c3a] text-xs font-semibold text-left transition flex items-center justify-between">
                <span>Ledger Kelas (Excel)</span><span>&rarr;</span>
              </button>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="rdp-card overflow-hidden min-w-0">
        <div class="px-5 py-3.5 border-b border-[#e7dcc3] bg-[#fbf8f1] flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-bold text-base text-[#0f4c3a]">Kelas Mengajar Anda</h2>
          <span class="text-xs text-slate-600">Menampilkan ${totalMine} penugasan aktif milik <b>${escapeHtml(g.nama)}</b></span>
        </div>
        ${mine.length === 0 ? `
          <div role="status" class="p-8 text-center space-y-2">
            <div class="text-sm font-bold text-[#0f4c3a]">Belum ada jadwal mengajar yang ditugaskan</div>
            <p class="text-xs text-slate-600">Hubungi Proktor / Admin Pesantren untuk menambahkan penugasan kelas &amp; mata pelajaran Anda.</p>
          </div>
        ` : `
          <div class="hidden md:block rdp-table-wrap">
            <table class="w-full text-left border-collapse text-sm rdp-table-sticky">
              <thead>
                <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a] text-xs">
                  <th class="px-4 py-3">Kelas</th>
                  <th class="px-4 py-3">Mata Pelajaran</th>
                  <th class="px-4 py-3 text-center">Kelengkapan</th>
                  <th class="px-4 py-3 text-center">Status</th>
                  <th class="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#e7dcc3]">
                ${mine.map(k => {
                  const sub = state.subjects.find(s => s.namaArab === k.mapel);
                  const clsStudents = state.students.filter(st => st.kelas === k.kode);
                  const filled = sub ? clsStudents.filter(st => hasScoreValue(st.scores && st.scores[sub.id])).length : 0;
                  const totalSt = clsStudents.length;
                  const fillPct = totalSt > 0 ? Math.round((filled / totalSt) * 100) : 0;
                  return `
                    <tr class="hover:bg-[#fbf8f1]/70">
                      <td class="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">${escapeHtml(k.kelas)}</td>
                      <td class="px-4 py-3">
                        <div class="arabic-font text-base font-bold text-[#0f4c3a]">${escapeHtml(k.mapel)}</div>
                        ${sub ? `<div class="text-xs text-slate-500">${escapeHtml(sub.namaId)}</div>` : ''}
                      </td>
                      <td class="px-4 py-3 text-center">
                        <div class="text-xs font-semibold tabular-nums text-slate-700">${filled} / ${totalSt}</div>
                        <div class="w-20 h-1.5 rounded-full bg-[#efe7d6] overflow-hidden mx-auto mt-1">
                          <div class="h-full bg-[#136048]" style="width: ${fillPct}%"></div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-center">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${k.sent ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                          ${k.sent ? '✓ Terkirim' : '● Draf'}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-center">
                        <button type="button" data-kelas="${escapeHtml(k.kode)}" data-mapel="${escapeHtml(k.mapel)}" onclick="navigate('penilaian',{kelas:this.dataset.kelas,mapel:this.dataset.mapel})" class="px-3 py-1.5 rounded-lg ${k.sent ? 'border border-[#136048] bg-white text-[#0f4c3a] hover:bg-[#f0f7f4]' : 'bg-[#136048] hover:bg-[#0b3b2e] text-white'} text-xs font-semibold whitespace-nowrap transition">
                          ${k.sent ? 'Lihat Nilai' : 'Input Nilai'}
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="md:hidden p-3 space-y-2.5 rdp-mobile-cards">
            ${mine.map(k => {
              const sub = state.subjects.find(s => s.namaArab === k.mapel);
              const clsStudents = state.students.filter(st => st.kelas === k.kode);
              const filled = sub ? clsStudents.filter(st => hasScoreValue(st.scores && st.scores[sub.id])).length : 0;
              const totalSt = clsStudents.length;
              const fillPct = totalSt > 0 ? Math.round((filled / totalSt) * 100) : 0;
              return `
                <div class="rounded-xl border border-[#e7dcc3] bg-[#fbf8f1]/60 p-3.5 space-y-2.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <span class="inline-block px-2 py-0.5 rounded-md bg-[#0f4c3a] text-[#f3e3b0] text-xs font-bold">${escapeHtml(k.kode)}</span>
                      <div class="arabic-font text-lg font-bold text-[#0f4c3a] leading-snug mt-1">${escapeHtml(k.mapel)}</div>
                      ${sub ? `<div class="text-xs text-slate-600">${escapeHtml(sub.namaId)}</div>` : ''}
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 ${k.sent ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                      ${k.sent ? '✓ Terkirim' : '● Draf'}
                    </span>
                  </div>
                  <div class="space-y-1">
                    <div class="flex items-center justify-between text-xs text-slate-600">
                      <span>Kelengkapan nilai</span>
                      <span class="font-bold text-[#0f4c3a] tabular-nums">${filled} / ${totalSt} (${fillPct}%)</span>
                    </div>
                    <div class="w-full h-2 rounded-full bg-[#efe7d6] overflow-hidden">
                      <div class="h-full bg-[#136048]" style="width: ${fillPct}%"></div>
                    </div>
                  </div>
                  <button type="button" data-kelas="${escapeHtml(k.kode)}" data-mapel="${escapeHtml(k.mapel)}" onclick="navigate('penilaian',{kelas:this.dataset.kelas,mapel:this.dataset.mapel})" class="w-full min-h-[40px] px-3 py-2 rounded-lg ${k.sent ? 'border border-[#136048] bg-white text-[#0f4c3a] hover:bg-[#f0f7f4]' : 'bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227]'} text-xs font-bold transition">
                    ${k.sent ? 'Lihat Nilai' : 'Input Nilai Sekarang'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}


function toggleAssignCheckboxes(name, checked) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(cb => { cb.checked = checked; });
}

function getKelasTingkat(kode) {
  const cls = state.classes.find(c => c.kode === kode);
  if (cls && cls.tingkat) return String(cls.tingkat);
  const k = String(kode || '').trim().toUpperCase();
  if (k.startsWith('IX') || k.startsWith('9')) return '9';
  if (k.startsWith('VIII') || k.startsWith('8')) return '8';
  if (k.startsWith('VII') || k.startsWith('7')) return '7';
  return k;
}

function setAssignSort(key) {
  if (state.assignSortKey === key) {
    state.assignSortDir = state.assignSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.assignSortKey = key;
    state.assignSortDir = 'asc';
  }
  state.assignPage = 1;
  renderPage();
}

let _assignModalPrevFocus = null;
let _assignModalLastMapel = '';

function renderAssignKelasCards(teacherId, mapelArab, preserveChecked = new Set()) {
  const sortedClasses = sortClasses(state.classes || []);
  const tingkatList = [...new Set(sortedClasses.map(c => String(c.tingkat || '')))].sort((a, b) => Number(a) - Number(b));
  if (sortedClasses.length === 0) {
    return `<div class="p-6 text-center text-xs text-slate-500 italic bg-[#fbf8f1] rounded-lg border border-dashed border-[#e7dcc3]">Belum ada kelas pada tahun pelajaran aktif.</div>`;
  }
  const colsCount = Math.min(3, Math.max(1, tingkatList.length));
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 ${colsCount === 3 ? 'lg:grid-cols-3' : (colsCount === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1')} gap-3 max-h-[44vh] overflow-y-auto pr-1">
      ${tingkatList.map(tk => {
        const clsInTk = sortedClasses.filter(c => String(c.tingkat || '') === tk);
        return `
          <div class="space-y-2">
            <div class="text-xs font-bold text-center text-[#0f4c3a] bg-[#fbf8f1] border border-[#e7dcc3] rounded-lg py-1.5">Tingkat ${escapeHtml(tk)}</div>
            <div class="space-y-2">
              ${clsInTk.map(c => {
                const existing = mapelArab
                  ? (state.assignments || []).filter(a => a.kode === c.kode && a.mapel === mapelArab)
                  : [];
                const pengampuNames = existing.map(a => {
                  const t = (state.teachers || []).find(x => x.id === a.teacherId);
                  return t ? t.nama : a.teacherId;
                });
                const isAssignedToSelectedTeacher = Boolean(teacherId && mapelArab && existing.some(a => a.teacherId === teacherId));
                const isOtherPengampu = !isAssignedToSelectedTeacher && pengampuNames.length > 0;
                const isChecked = isAssignedToSelectedTeacher || preserveChecked.has(c.kode);
                const pengampuText = mapelArab
                  ? (pengampuNames.length > 0 ? pengampuNames.join(', ') : 'Belum ada pengampu')
                  : 'Pilih mapel dahulu';

                let cardCls = 'flex items-start gap-2.5 p-2.5 rounded-lg border transition ';
                let pengampuCls = 'text-[11px] mt-0.5 truncate ';
                if (isAssignedToSelectedTeacher) {
                  cardCls += 'border-emerald-300 bg-emerald-50/80 cursor-not-allowed opacity-90';
                  pengampuCls += 'font-semibold text-[#0f4c3a]';
                } else if (isOtherPengampu) {
                  cardCls += 'border-amber-300 bg-amber-50/60 hover:bg-amber-50 cursor-pointer';
                  pengampuCls += 'font-semibold text-amber-800';
                } else {
                  cardCls += 'border-[#e7dcc3] bg-white hover:bg-[#fbf8f1] cursor-pointer';
                  pengampuCls += 'text-slate-400 italic';
                }

                return `
                  <label class="${cardCls}">
                    <input type="checkbox" name="assign-kelas-cb" value="${escapeHtml(c.kode)}"
                      ${isChecked ? 'checked' : ''}
                      ${isAssignedToSelectedTeacher ? 'disabled' : 'onchange="updateAssignSubmitCount()"'}
                      class="mt-0.5 rounded border-slate-300 text-[#136048] focus:ring-[#136048] flex-shrink-0" />
                    <span class="min-w-0 flex-1">
                      <span class="block font-bold text-xs ${isAssignedToSelectedTeacher ? 'text-[#0f4c3a]' : 'text-slate-900'}">Kelas ${escapeHtml(c.kode)}</span>
                      <span class="block ${pengampuCls}" title="${escapeHtml(pengampuText)}">${escapeHtml(pengampuText)}</span>
                    </span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderAssignModalBody(selectedTeacherId = '', selectedMapel = '') {
  const sortedActiveTeachers = sortByLabel(getActiveTeachers(), t => t.nama);
  const sortedSubjects = sortByLabel((state.subjects || []).filter(s => s.active !== false), s => s.namaId);
  _assignModalLastMapel = selectedMapel || '';

  return `
    <div class="grid sm:grid-cols-2 gap-3.5">
      <div>
        <label for="assign-teacher" class="block font-bold text-[#0f4c3a] mb-1">1. Pilih Guru / Ustadz</label>
        <select id="assign-teacher" required onchange="onAssignModalChange()" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold text-slate-800">
          <option value="" ${!selectedTeacherId ? 'selected' : ''}>-- Pilih Guru / Ustadz --</option>
          ${sortedActiveTeachers.map(t => `<option value="${escapeHtml(t.id)}" ${t.id === selectedTeacherId ? 'selected' : ''}>${escapeHtml(t.nama)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="assign-mapel" class="block font-bold text-[#0f4c3a] mb-1">2. Pilih Mata Pelajaran</label>
        <select id="assign-mapel" required onchange="onAssignModalChange()" class="w-full border border-[#e7dcc3] rounded-lg px-3 py-2 bg-white font-semibold text-slate-800">
          <option value="" ${!selectedMapel ? 'selected' : ''}>-- Pilih Mata Pelajaran --</option>
          ${sortedSubjects.map(s => `<option value="${escapeHtml(s.namaArab)}" ${s.namaArab === selectedMapel ? 'selected' : ''}>${escapeHtml(s.namaId)} (${escapeHtml(s.namaArab)})</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="bg-[#fbf8f1] rounded-xl border border-[#e7dcc3] p-3.5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7dcc3] pb-2">
        <span class="font-bold text-[#0f4c3a]">3. Pilih Kelas yang Diampu</span>
        <div class="flex items-center gap-3 text-xs">
          <button type="button" onclick="toggleAssignModalKelas(true)" class="text-[#136048] font-semibold hover:underline">Pilih Semua</button>
          <button type="button" onclick="toggleAssignModalKelas(false)" class="text-slate-500 hover:underline">Kosongkan</button>
        </div>
      </div>
      <div id="assign-kelas-cards-wrap">
        ${renderAssignKelasCards(selectedTeacherId, selectedMapel)}
      </div>
    </div>
  `;
}

function updateAssignSubmitCount() {
  const btn = document.getElementById('btn-submit-assign');
  const wrap = document.getElementById('assign-kelas-cards-wrap');
  if (!btn || !wrap) return;
  const count = wrap.querySelectorAll('input[name="assign-kelas-cb"]:checked:not(:disabled)').length;
  btn.textContent = count > 0 ? `+ Tugaskan (${count} Kelas)` : '+ Tugaskan';
}

function onAssignModalChange() {
  const teacherId = document.getElementById('assign-teacher')?.value || '';
  const mapelArab = document.getElementById('assign-mapel')?.value || '';
  const wrap = document.getElementById('assign-kelas-cards-wrap');
  if (!wrap) return;
  const preserve = new Set();
  if (mapelArab === _assignModalLastMapel) {
    wrap.querySelectorAll('input[name="assign-kelas-cb"]:checked:not(:disabled)').forEach(cb => {
      preserve.add(cb.value);
    });
  }
  _assignModalLastMapel = mapelArab;
  wrap.innerHTML = renderAssignKelasCards(teacherId, mapelArab, preserve);
  updateAssignSubmitCount();
}

function toggleAssignModalKelas(checked) {
  const wrap = document.getElementById('assign-kelas-cards-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('input[name="assign-kelas-cb"]:not(:disabled)').forEach(cb => {
    cb.checked = checked;
  });
  updateAssignSubmitCount();
}

function openAssignModal() {
  const overlay = document.getElementById('assign-modal-overlay');
  const body = document.getElementById('assign-modal-body');
  if (!overlay || !body) return;
  _assignModalPrevFocus = document.activeElement;
  const defaultTeacher = (state.filterAssignTeacherId && state.filterAssignTeacherId !== 'all')
    ? state.filterAssignTeacherId
    : '';
  body.innerHTML = renderAssignModalBody(defaultTeacher, '');
  updateAssignSubmitCount();
  overlay.classList.remove('hidden');
  setTimeout(() => {
    const sel = document.getElementById(defaultTeacher ? 'assign-mapel' : 'assign-teacher');
    if (sel) sel.focus();
  }, 15);
}

function closeAssignModal() {
  const overlay = document.getElementById('assign-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  try {
    if (_assignModalPrevFocus && typeof _assignModalPrevFocus.focus === 'function') {
      _assignModalPrevFocus.focus();
    }
  } catch (_) {}
  _assignModalPrevFocus = null;
}

function renderMengajarProktor() {
  const sortedTeachers = sortByLabel(state.teachers, t => t.nama);
  let filterTid = state.filterAssignTeacherId || 'all';
  if (filterTid !== 'all' && !state.teachers.some(t => t.id === filterTid)) {
    filterTid = 'all';
    state.filterAssignTeacherId = 'all';
  }
  const visibleAssignments = state.assignments.filter(a => filterTid === 'all' || a.teacherId === filterTid);

  // Group assignments by (teacherId, mapel, tingkat)
  const groupMap = new Map();
  for (const a of visibleAssignments) {
    const tingkat = getKelasTingkat(a.kode);
    const key = `${a.teacherId}__${a.mapel}__${tingkat}`;
    if (!groupMap.has(key)) {
      const t = state.teachers.find(x => x.id === a.teacherId);
      const sub = state.subjects.find(x => x.namaArab === a.mapel);
      groupMap.set(key, {
        teacherId: a.teacherId,
        teacherName: t ? t.nama : a.teacherId,
        mapel: a.mapel,
        mapelName: sub ? sub.namaId : a.mapel,
        tingkat,
        items: []
      });
    }
    groupMap.get(key).items.push({ id: a.id, kode: a.kode, tingkat });
  }

  let groupedRows = [...groupMap.values()].map(g => {
    const sortedItems = sortClasses(g.items);
    return {
      ...g,
      ids: sortedItems.map(i => i.id),
      kelasListText: sortedItems.map(i => i.kode).join(' , ')
    };
  });

  // Sort grouped rows by clicked column header
  const dir = state.assignSortDir === 'desc' ? -1 : 1;
  groupedRows.sort((a, b) => {
    if (state.assignSortKey === 'mapel') {
      return dir * a.mapelName.localeCompare(b.mapelName, 'id', { sensitivity: 'base', numeric: true });
    }
    if (state.assignSortKey === 'kelas') {
      const tDiff = (Number(a.tingkat) || 99) - (Number(b.tingkat) || 99);
      if (tDiff !== 0) return dir * tDiff;
      return dir * a.kelasListText.localeCompare(b.kelasListText, 'id', { sensitivity: 'base', numeric: true });
    }
    const gCmp = a.teacherName.localeCompare(b.teacherName, 'id', { sensitivity: 'base', numeric: true });
    if (gCmp !== 0) return dir * gCmp;
    return a.mapelName.localeCompare(b.mapelName, 'id', { sensitivity: 'base', numeric: true });
  });

  // Pagination (10, 25, 50, all)
  const totalRows = groupedRows.length;
  const pageSizeRaw = state.assignPageSize || '10';
  const pageSize = pageSizeRaw === 'all' ? Math.max(1, totalRows) : Number(pageSizeRaw);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  if (state.assignPage > totalPages) state.assignPage = totalPages;
  if (state.assignPage < 1) state.assignPage = 1;
  const startIdx = pageSizeRaw === 'all' ? 0 : (state.assignPage - 1) * pageSize;
  const pagedRows = pageSizeRaw === 'all' ? groupedRows : groupedRows.slice(startIdx, startIdx + pageSize);

  const sortIcon = (key) => {
    if (state.assignSortKey !== key) return '<span class="opacity-40 ml-1">⇅</span>';
    return `<span class="ml-1">${state.assignSortDir === 'asc' ? '▲' : '▼'}</span>`;
  };

  return `
    ${renderPageHeader('Setting Mengajar Ustadz / Guru', 'Kelola penugasan guru, mata pelajaran, dan kelas yang diampu.', `<button type="button" onclick="openAssignModal()" class="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] text-xs font-bold shadow-sm transition whitespace-nowrap">+ Tambah Penugasan</button>`)}
    <div class="rdp-card p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div class="font-bold text-[#0f4c3a]">
          Daftar Penugasan Mengajar (${totalRows} baris &bull; ${visibleAssignments.length} kelas-mapel)
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-1.5">
            <label for="assign-page-size" class="text-slate-600 font-semibold">Tampilkan:</label>
            <select id="assign-page-size" onchange="state.assignPageSize=this.value; state.assignPage=1; renderPage()" class="border border-[#e7dcc3] rounded-lg px-2 py-1 bg-white font-semibold">
              <option value="10" ${pageSizeRaw === '10' ? 'selected' : ''}>10</option>
              <option value="25" ${pageSizeRaw === '25' ? 'selected' : ''}>25</option>
              <option value="50" ${pageSizeRaw === '50' ? 'selected' : ''}>50</option>
              <option value="all" ${pageSizeRaw === 'all' ? 'selected' : ''}>All</option>
            </select>
          </div>
          <div class="flex items-center gap-1.5">
            <label for="assign-filter-guru" class="text-slate-600 font-semibold">Filter Guru:</label>
            <select id="assign-filter-guru" onchange="state.filterAssignTeacherId=this.value; state.assignPage=1; renderPage()" class="border border-[#e7dcc3] rounded-lg px-2.5 py-1 bg-white">
              <option value="all" ${filterTid === 'all' ? 'selected' : ''}>- Semua Guru -</option>
              ${sortedTeachers.map(t => `<option value="${escapeHtml(t.id)}" ${filterTid === t.id ? 'selected' : ''}>${escapeHtml(t.nama)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
              ${renderSortableTh({ label: 'Nama Guru', key: 'guru', activeKey: state.assignSortKey, activeDir: state.assignSortDir, onClickJs: "setAssignSort('guru')", extraClass: 'px-3 py-2 border-r border-[#e7dcc3]' })}
              ${renderSortableTh({ label: 'Mata Pelajaran', key: 'mapel', activeKey: state.assignSortKey, activeDir: state.assignSortDir, onClickJs: "setAssignSort('mapel')", extraClass: 'px-3 py-2 border-r border-[#e7dcc3]' })}
              ${renderSortableTh({ label: 'Kelas', key: 'kelas', activeKey: state.assignSortKey, activeDir: state.assignSortDir, onClickJs: "setAssignSort('kelas')", extraClass: 'px-3 py-2 border-r border-[#e7dcc3]' })}
              <th class="px-3 py-2.5 text-center w-24">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${pagedRows.length === 0 ? `
              <tr><td colspan="5" class="px-4 py-6 text-center text-slate-400 italic">Belum ada penugasan mengajar. Klik tombol "+ Tambah Penugasan" untuk memulai.</td></tr>
            ` : pagedRows.map((g, idx) => `
              <tr class="hover:bg-[#fbf8f1]">
                <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${startIdx + idx + 1}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(g.teacherName)}</td>
                <td class="px-3 py-2 border-r border-[#e7dcc3]">
                  <span class="font-semibold text-slate-800">${escapeHtml(g.mapelName)}</span>
                  ${g.mapel !== g.mapelName ? `<span class="arabic-font text-sm text-[#0f4c3a] mr-1">(${escapeHtml(g.mapel)})</span>` : ''}
                </td>
                <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-[#0f4c3a]">${escapeHtml(g.kelasListText)}</td>
                <td class="px-3 py-2 text-center">
                  <button type="button" onclick="deleteAssignmentGroup([${g.ids.join(',')}])" class="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-semibold transition">Hapus</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${pageSizeRaw !== 'all' && totalPages > 1 ? `
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
          <div class="text-slate-500">Menampilkan ${startIdx + 1}–${Math.min(startIdx + pageSize, totalRows)} dari ${totalRows} data</div>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="state.assignPage=Math.max(1, state.assignPage-1); renderPage()" ${state.assignPage <= 1 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-[#e7dcc3] bg-white hover:bg-[#fbf8f1] disabled:opacity-40 font-semibold">Sebelumnya</button>
            <span class="px-2 font-semibold text-[#0f4c3a]">Hal ${state.assignPage} / ${totalPages}</span>
            <button type="button" onclick="state.assignPage=Math.min(${totalPages}, state.assignPage+1); renderPage()" ${state.assignPage >= totalPages ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg border border-[#e7dcc3] bg-white hover:bg-[#fbf8f1] disabled:opacity-40 font-semibold">Berikutnya</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function deleteAssignment(id) {
  const res = await apiCall('DELETE', `/api/assignments/${id}`);
  if (!res || !res.ok) return;
  state.assignments = state.assignments.filter(x => x.id !== id);
  renderPage();
  showToast('Jadwal mengajar dihapus');
}

async function deleteAssignmentGroup(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const ok = await openConfirmModal({
    title: 'Hapus Penugasan Mengajar',
    message: `Hapus ${ids.length} penugasan mengajar tersebut?`,
    confirmText: 'Hapus Penugasan',
    variant: 'danger'
  });
  if (!ok) return;
  const res = await apiCall('POST', '/api/assignments/delete-batch', { ids });
  if (!res || !res.ok) return;
  const idSet = new Set(ids);
  state.assignments = state.assignments.filter(x => !idSet.has(x.id));
  renderPage();
  showToast(`${ids.length} penugasan kelas dihapus`);
}

async function addAssignment(e) {
  e.preventDefault();
  const teacherId = document.getElementById('assign-teacher')?.value || '';
  const mapel = document.getElementById('assign-mapel')?.value || '';
  const wrap = document.getElementById('assign-kelas-cards-wrap');
  const kelasList = wrap
    ? [...wrap.querySelectorAll('input[name="assign-kelas-cb"]:checked:not(:disabled)')].map(cb => cb.value)
    : [];

  if (!teacherId) {
    showToast('Pilih Guru / Ustadz terlebih dahulu', 'warning');
    return;
  }
  if (!mapel) {
    showToast('Pilih Mata Pelajaran terlebih dahulu', 'warning');
    return;
  }
  if (kelasList.length === 0) {
    showToast('Centang minimal 1 Kelas yang belum ditugaskan', 'warning');
    return;
  }

  const created = [];
  for (const kode of kelasList) {
    const exists = state.assignments.some(a => a.teacherId === teacherId && a.kode === kode && a.mapel === mapel);
    if (!exists) {
      created.push({ teacherId, kelas: 'Kelas ' + kode, kode, mapel, sent: false });
    }
  }

  if (created.length === 0) {
    showToast('Semua kelas terpilih sudah ditugaskan untuk guru & mapel ini', 'warning');
    return;
  }

  setButtonBusy('btn-submit-assign', true, 'Menyimpan...');
  try {
    const res = await apiCall('POST', '/api/assignments', { tahun: state.pesantren.tahun, assignments: created });
    if (!res || !res.ok) return;
    closeAssignModal();
    await refreshStateFromServer(true);
    showToast(`${res.count ?? created.length} penugasan mengajar berhasil ditambahkan`);
  } finally {
    setButtonBusy('btn-submit-assign', false);
  }
}

function getActivePeriodDraftPrefix() {
  const th = String(state.pesantren?.tahun || '2026/2027').replace(/[^0-9A-Za-z]/g, '');
  const sm = String(state.pesantren?.semester || 'Ganjil').replace(/[^0-9A-Za-z]/g, '');
  return `rdp_draft_scores_${th}_${sm}_`;
}

function getDraftStorageKey(kelasKode, subId) {
  return `${getActivePeriodDraftPrefix()}${state.activeTeacherId}_${kelasKode}_${subId}`;
}

function loadLocalScoreDraft(kelasKode, subId) {
  if (state.mode !== 'guru' || !state.activeTeacherId) return false;
  try {
    const raw = localStorage.getItem(getDraftStorageKey(kelasKode, subId));
    if (!raw) return false;
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object') return false;
    let applied = false;
    state.students.filter(st => st.kelas === kelasKode).forEach(st => {
      if (!st.scores) st.scores = {};
      if (Object.prototype.hasOwnProperty.call(map, String(st.id))) {
        const v = map[String(st.id)];
        if (v === null || v === '') {
          delete st.scores[subId];
          applied = true;
        } else {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 100) {
            st.scores[subId] = Math.round(n);
            applied = true;
          }
        }
      }
    });
    return applied;
  } catch (_) {
    return false;
  }
}

function saveLocalScoreDraft(kelasKode, subId) {
  let savedOk = true;
  try {
    const map = {};
    state.students.filter(st => st.kelas === kelasKode).forEach(st => {
      const raw = st.scores ? st.scores[subId] : undefined;
      map[String(st.id)] = hasScoreValue(raw) ? Number(raw) : null;
    });
    localStorage.setItem(getDraftStorageKey(kelasKode, subId), JSON.stringify(map));
  } catch (_) {
    savedOk = false;
  }
  const badge = document.getElementById('penilaian-save-status');
  if (badge) {
    badge.className = savedOk
      ? 'inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold'
      : 'inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-xs font-semibold';
    badge.textContent = savedOk
      ? 'Tersimpan lokal (belum di-Save ke server)'
      : 'Penyimpanan lokal penuh — segera klik Save Nilai';
  }
}

async function savePenilaianToServer(assignId, subId, kelasKode, silent = false) {
  const targets = state.students.filter(st => st.kelas === kelasKode);
  if (targets.length === 0) {
    if (!silent) showToast('Tidak ada santri untuk disimpan');
    return false;
  }
  const bulk = targets.map(st => {
    const raw = st.scores ? st.scores[subId] : undefined;
    return {
      studentId: st.id,
      subjectId: subId,
      score: hasScoreValue(raw) ? Math.min(100, Math.max(0, Math.round(Number(raw)))) : null
    };
  });
  setButtonBusy('btn-save-nilai-top', true, 'Menyimpan...');
  setButtonBusy('btn-save-nilai-foot', true, 'Menyimpan...');
  setButtonBusy('btn-save-nilai-mob', true, 'Menyimpan...');
  try {
    const res = await apiCall('PUT', '/api/scores', {
      tahun: state.pesantren.tahun,
      semester: state.pesantren.semester,
      scores: bulk
    });
    if (!res || !res.ok) return false;
    try { localStorage.removeItem(getDraftStorageKey(kelasKode, subId)); } catch (_) {}
    const badge = document.getElementById('penilaian-save-status');
    if (badge) {
      badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold';
      badge.textContent = 'Tersimpan di server';
    }
    if (!silent) showToast(`Nilai Kelas ${kelasKode} (${bulk.length} santri) berhasil disimpan ke server!`);
    return true;
  } finally {
    setButtonBusy('btn-save-nilai-top', false);
    setButtonBusy('btn-save-nilai-foot', false);
    setButtonBusy('btn-save-nilai-mob', false);
  }
}

async function toggleAssignmentSent(assignId, subId, kelasKode) {
  const kObj = state.assignments.find(k => k.id === assignId);
  if (!kObj) return;
  const nextSent = !kObj.sent;
  setButtonBusy('btn-send-nilai-top', true, nextSent ? 'Mengirim...' : 'Membuka...');
  setButtonBusy('btn-send-nilai-foot', true, nextSent ? 'Mengirim...' : 'Membuka...');
  setButtonBusy('btn-send-nilai-mob', true, nextSent ? 'Mengirim...' : 'Membuka...');
  try {
    if (nextSent && subId && kelasKode) {
      const saved = await savePenilaianToServer(assignId, subId, kelasKode, false);
      if (!saved) return;
    }
    const res = await apiCall('PUT', '/api/assignments/' + kObj.id, {
      sent: nextSent,
      tahun: state.pesantren.tahun,
      semester: state.pesantren.semester
    });
    if (!res || !res.ok) return;
    kObj.sent = nextSent;
    if (subId && kelasKode) {
      try { localStorage.removeItem(getDraftStorageKey(kelasKode, subId)); } catch (_) {}
    }
    renderSidebar();
    renderPage();
    showToast(kObj.sent ? `Nilai ${kObj.kelas} disimpan, dikirim & dikunci` : `Status nilai ${kObj.kelas} dikembalikan ke Draf (dapat diedit lagi)`);
  } finally {
    setButtonBusy('btn-send-nilai-top', false);
    setButtonBusy('btn-send-nilai-foot', false);
    setButtonBusy('btn-send-nilai-mob', false);
  }
}

function handleNilaiKeydown(ev, idx, attrPrefix = 'row') {
  if (!ev) return;
  let delta = 0;
  if (ev.key === 'Enter' || ev.key === 'ArrowDown') delta = 1;
  else if (ev.key === 'ArrowUp') delta = -1;
  if (delta === 0) return;
  const selector = attrPrefix === 'mob' ? `[data-mob-row-idx="${idx + delta}"]` : `[data-row-idx="${idx + delta}"]`;
  const target = document.querySelector(selector);
  if (target && !target.disabled) {
    ev.preventDefault();
    target.focus();
    if (typeof target.select === 'function') target.select();
  }
}

function updatePenilaianFilledCount(kelasKode, subId) {
  const countEl = document.getElementById('penilaian-filled-count');
  const barEl = document.getElementById('penilaian-filled-bar');
  if (!countEl && !barEl) return;
  const targets = state.students.filter(st => st.kelas === kelasKode);
  const total = targets.length;
  const filled = targets.filter(st => hasScoreValue(st.scores && st.scores[subId])).length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  if (countEl) countEl.textContent = `${filled} / ${total}`;
  if (barEl) barEl.style.width = `${pct}%`;
}

function syncPenilaianCellUi(studentId, numVal, jamNum, sourceId = null) {
  const hasVal = hasScoreValue(numVal);
  const isLow = hasVal && numVal < 60;
  const isBelowKkm = hasVal && numVal < getActiveKkm();
  const deskCls = `w-20 border ${isLow ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white'} rounded-lg px-2 py-1.5 text-center text-sm font-semibold tabular-nums`;
  const mobCls = `w-20 h-11 border ${isLow ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white'} rounded-lg px-2 py-1.5 text-center text-base font-bold tabular-nums`;

  [
    { id: `nilai-cell-${studentId}`, cls: deskCls },
    { id: `nilai-mob-${studentId}`, cls: mobCls }
  ].forEach(({ id, cls }) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id !== sourceId || (hasVal && String(el.value) !== String(numVal) && (Number(el.value) > 100 || Number(el.value) < 0))) {
      el.value = hasVal ? numVal : '';
    }
    el.className = cls;
  });

  [
    `jumlah-cell-${studentId}`,
    `jumlah-mob-${studentId}`
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = hasVal ? numVal * jamNum : '–';
  });

  [
    `pred-cell-${studentId}`,
    `pred-mob-${studentId}`
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = hasVal ? getPredikatArab(numVal) : '–';
      el.classList.toggle('text-[#d90000]', isBelowKkm);
    }
  });

  [
    `typo-warn-${studentId}`,
    `typo-warn-mob-${studentId}`
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !isLow);
  });

  [
    `kkm-badge-${studentId}`,
    `kkm-badge-mob-${studentId}`
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !isBelowKkm);
  });
}

function renderPenilaian() {
  const mine = getTeacherAssignments();
  const kObj = mine.find(k => k.kode === state.selectedKelasMengajar && k.mapel === state.selectedMapelMengajar) || mine[0];
  if (!kObj) return `<div class="rdp-card p-6 text-sm text-slate-600">Tidak ada mapel yang ditugaskan.</div>`;
  state.selectedKelasMengajar = kObj.kode;
  state.selectedMapelMengajar = kObj.mapel;
  const sub = state.subjects.find(s => s.namaArab === kObj.mapel);
  if (!sub) return `<div class="rdp-card border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">Mata pelajaran <b>${escapeHtml(kObj.mapel)}</b> tidak ditemukan pada daftar mata pelajaran. Hubungi Proktor/Admin.</div>`;
  const curTeacher = getCurrentTeacher();
  const isLocked = Boolean(kObj.sent);
  const hasLocalDraft = !isLocked && loadLocalScoreDraft(kObj.kode, sub.id);
  const classStudents = state.students.filter(st => st.kelas === kObj.kode);
  const filledCount = classStudents.filter(st => hasScoreValue(st.scores && st.scores[sub.id])).length;
  const fillPct = classStudents.length > 0 ? Math.round((filledCount / classStudents.length) * 100) : 0;
  const activeKkm = getActiveKkm();
  const report = (state.nilaiUploadReport && state.nilaiUploadReport.kelasKode === kObj.kode && state.nilaiUploadReport.subId === sub.id)
    ? state.nilaiUploadReport
    : null;
  const jamNum = Number(sub.jam) || 0;

  return `
    <div class="rdp-card p-4 sm:p-5 space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-base sm:text-lg font-extrabold text-[#0f4c3a]">Input Nilai: ${escapeHtml(sub.namaId)} (<span class="arabic-font text-xl">${escapeHtml(kObj.mapel)}</span>) — ${escapeHtml(kObj.kelas)}</h1>
            <span id="penilaian-save-status" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${isLocked ? 'bg-sky-100 text-sky-900 border-sky-300' : (hasLocalDraft ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300')}">
              ${isLocked ? '🔒 Terkirim & Terkunci' : (hasLocalDraft ? 'Tersimpan lokal (belum di-Save)' : 'Tersimpan di server')}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>Pengampu: <b>${escapeHtml(curTeacher ? curTeacher.nama : '-')}</b></span>
            <span>&bull; Jam (الساعات): <b>${jamNum}</b></span>
            <span>&bull; KKM: <b>${activeKkm}</b></span>
            <span>&bull; Terisi: <b id="penilaian-filled-count" class="tabular-nums text-[#0f4c3a]">${filledCount} / ${classStudents.length}</b> santri</span>
          </div>
          <div class="w-full max-w-xs h-1.5 rounded-full bg-[#efe7d6] overflow-hidden" aria-hidden="true">
            <div id="penilaian-filled-bar" class="h-full bg-[#136048] transition-all duration-200" style="width: ${fillPct}%"></div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="downloadNilaiTemplate(${sub.id}, this.dataset.kelas)" class="px-3 py-2 rounded-lg border border-[#e7dcc3] bg-[#fbf8f1] hover:bg-[#efe6d0] text-[#0f4c3a] text-xs font-semibold transition flex items-center gap-1.5">
            <span>⬇</span> Download Template
          </button>
          ${isLocked ? '' : `
            <label class="px-3 py-2 rounded-lg border border-[#c9a227] bg-[#fdfaf2] hover:bg-[#f5ebd0] text-[#7c5e10] text-xs font-semibold cursor-pointer transition flex items-center gap-1.5">
              <span>⬆</span> Upload Nilai
              <input type="file" accept=".xlsx,.xls,.csv" class="hidden" data-kelas="${escapeHtml(kObj.kode)}" onchange="handleNilaiUpload(event, ${kObj.id}, ${sub.id}, ${jamNum}, this.dataset.kelas)" />
            </label>
            <button id="btn-save-nilai-top" type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="savePenilaianToServer(${kObj.id}, ${sub.id}, this.dataset.kelas)" class="px-3.5 py-2 rounded-lg border-2 border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold transition">
              Save Nilai
            </button>
          `}
          <button id="btn-send-nilai-top" type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="toggleAssignmentSent(${kObj.id}, ${sub.id}, this.dataset.kelas)" class="px-4 py-2 rounded-lg ${isLocked ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227]'} text-xs font-bold shadow-sm transition">
            ${isLocked ? 'Batalkan Kirim' : 'Kirim Nilai'}
          </button>
        </div>
      </div>
      ${isLocked ? '' : `<div class="hidden md:block text-xs text-slate-500">Tips input cepat: tekan <b>Enter</b> atau panah <b>↑ / ↓</b> untuk berpindah baris santri.</div>`}
    </div>
    ${isLocked ? `
      <div class="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
        <b>Nilai sudah dikirim dan dikunci.</b> Jika Anda perlu melakukan perubahan, klik tombol <b>Batalkan Kirim</b> terlebih dahulu.
      </div>
    ` : ''}
    ${report ? `
      <div class="rounded-xl border ${report.hasMismatch ? 'border-amber-300 bg-amber-50/90 text-amber-950' : 'border-emerald-300 bg-emerald-50/90 text-emerald-950'} p-4 shadow-sm text-xs space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="font-bold text-sm flex items-center gap-1.5">
            <span>${report.hasMismatch ? '⚠️ Laporan Validasi NISN Upload Nilai' : '✓ Laporan Upload Nilai'}</span>
            <span class="text-xs font-normal text-slate-600">(${escapeHtml(report.fileName || '')})</span>
          </div>
          <button type="button" onclick="clearNilaiUploadReport()" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold">Tutup</button>
        </div>
        <div class="text-xs">
          ${escapeHtml(report.summaryText || '')}
        </div>
        ${report.metaMismatch && report.metaMismatch.length > 0 ? `
          <div class="p-2.5 rounded-lg bg-white/80 border border-amber-200 space-y-1">
            <div class="font-bold text-amber-900">Perbedaan Identitas Template:</div>
            <ul class="list-disc list-inside space-y-0.5 text-xs text-amber-800">
              ${report.metaMismatch.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${report.unmatchedInFile && report.unmatchedInFile.length > 0 ? `
          <div class="p-2.5 rounded-lg bg-white/80 border border-rose-200 space-y-1">
            <div class="font-bold text-rose-800">NISN di File Tidak Ditemukan pada Kelas ${escapeHtml(kObj.kode)} (${report.unmatchedInFile.length} baris):</div>
            <ul class="list-disc list-inside space-y-0.5 text-xs text-rose-700 max-h-36 overflow-y-auto">
              ${report.unmatchedInFile.map(item => `<li>Baris ${item.rowNum}: NISN <b>${escapeHtml(item.nisn || '(Kosong)')}</b> — ${escapeHtml(item.nama || '-')} (Nilai: ${escapeHtml(String(item.nilai ?? '-'))})</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${report.missingFromFile && report.missingFromFile.length > 0 ? `
          <div class="p-2.5 rounded-lg bg-white/80 border border-amber-200 space-y-1">
            <div class="font-bold text-amber-900">Santri Kelas ${escapeHtml(kObj.kode)} yang Tidak Ada di File Upload (${report.missingFromFile.length} santri):</div>
            <ul class="list-disc list-inside space-y-0.5 text-xs text-amber-800 max-h-36 overflow-y-auto">
              ${report.missingFromFile.map(st => `<li>NISN <b>${escapeHtml(st.nisn || '-')}</b> — ${escapeHtml(st.nama || '-')}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${report.duplicateInFile && report.duplicateInFile.length > 0 ? `
          <div class="p-2.5 rounded-lg bg-white/80 border border-amber-200 space-y-1">
            <div class="font-bold text-amber-900">NISN Ganda di Dalam File (${report.duplicateInFile.length}):</div>
            <div class="text-xs text-amber-800">${report.duplicateInFile.map(n => `<code class="px-1 py-0.5 bg-amber-100 rounded">${escapeHtml(n)}</code>`).join(', ')}</div>
          </div>
        ` : ''}
        ${report.invalidScores && report.invalidScores.length > 0 ? `
          <div class="p-2.5 rounded-lg bg-white/80 border border-rose-200 space-y-1">
            <div class="font-bold text-rose-800">Nilai di Luar Rentang 0–100 (Diabaikan, ${report.invalidScores.length} baris):</div>
            <ul class="list-disc list-inside space-y-0.5 text-xs text-rose-700 max-h-36 overflow-y-auto">
              ${report.invalidScores.map(item => `<li>Baris ${item.rowNum}: <b>${escapeHtml(item.nama)}</b> — Nilai tertulis <b>"${escapeHtml(String(item.nilai))}"</b> (harus angka 0–100 atau kosong)</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${report.lowScores && report.lowScores.length > 0 ? `
          <div class="p-2.5 rounded-lg bg-white/80 border border-amber-300 space-y-1">
            <div class="font-bold text-amber-900">Catatan: Nilai di Bawah 60 — Kemungkinan Typo (${report.lowScores.length} santri):</div>
            <ul class="list-disc list-inside space-y-0.5 text-xs text-amber-800 max-h-36 overflow-y-auto">
              ${report.lowScores.map(item => `<li>Baris ${item.rowNum}: <b>${escapeHtml(item.nama)}</b> — Nilai <b>${escapeHtml(String(item.nilai))}</b> (tetap dimuat, harap periksa kembali)</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- DESKTOP GRADING TABLE WITH STICKY HEADER -->
    <div class="hidden md:block rdp-card overflow-hidden">
      <div class="max-h-[68vh] overflow-y-auto overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-3 py-3 text-center w-12 bg-[#fbf8f1]">No</th>
              <th class="px-3 py-3 bg-[#fbf8f1]">NISN</th>
              <th class="px-3 py-3 bg-[#fbf8f1]">Nama Santri (${escapeHtml(kObj.kelas)})</th>
              <th class="px-3 py-2.5 text-center bg-[#fbf8f1]">
                <div>الدرجة (Nilai)</div>
                ${isLocked ? '' : `
                  <div class="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 font-normal">
                    <input id="default-nilai-input" type="number" inputmode="decimal" min="0" max="100" placeholder="Default" aria-label="Nilai default kelas"
                      class="w-20 border border-emerald-400 bg-emerald-50/70 rounded-lg px-2 py-1 text-center text-xs font-semibold text-emerald-900 placeholder-emerald-600/70 tabular-nums" />
                    <button type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="applyDefaultNilai(${sub.id}, ${jamNum}, this.dataset.kelas)" class="px-2.5 py-1 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-semibold">Terapkan</button>
                    <label class="inline-flex items-center gap-1 text-xs text-slate-600 cursor-pointer" title="Jika dicentang, nilai yang sudah ada tidak ditimpa">
                      <input id="default-nilai-empty-only" type="checkbox" checked class="rounded border-slate-300 text-[#136048]" />
                      <span>Kosong saja</span>
                    </label>
                  </div>
                `}
              </th>
              <th class="px-3 py-3 text-center bg-[#fbf8f1]">المجموع (Nilai × ${jamNum})</th>
              <th class="px-3 py-3 text-center bg-[#fbf8f1]">تقدير الدرجات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${classStudents.length === 0 ? `
              <tr><td colspan="6" class="px-4 py-8 text-center text-slate-500 italic">Belum ada data santri di ${escapeHtml(kObj.kelas)}.</td></tr>
            ` : classStudents.map((st, i) => {
              const rawVal = st.scores ? st.scores[sub.id] : undefined;
              const hasVal = hasScoreValue(rawVal);
              const numVal = hasVal ? Number(rawVal) : '';
              const isLow = hasVal && numVal < 60;
              const isBelowKkm = hasVal && numVal < activeKkm;
              return `
                <tr class="hover:bg-[#fbf8f1]/80 transition-colors">
                  <td class="px-3 py-2.5 text-center text-slate-600 tabular-nums">${i + 1}</td>
                  <td class="px-3 py-2.5 font-mono text-xs text-slate-600">${escapeHtml(st.nisn)}</td>
                  <td class="px-3 py-2.5 font-semibold text-slate-900">${escapeHtml(st.nama)}</td>
                  <td class="px-3 py-2 text-center">
                    <div class="inline-flex flex-col items-center">
                      <input id="nilai-cell-${st.id}" data-row-idx="${i}" type="number" inputmode="decimal" min="0" max="100" placeholder="–" value="${numVal}" ${isLocked ? 'disabled' : ''}
                        aria-label="Nilai ${escapeHtml(st.nama)}"
                        data-kelas="${escapeHtml(kObj.kode)}"
                        onkeydown="handleNilaiKeydown(event, ${i}, 'row')"
                        oninput="stScore(${st.id},${sub.id},this.value,${jamNum},this.dataset.kelas,'nilai-cell-${st.id}')"
                        class="w-20 border ${isLow ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white'} ${isLocked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''} rounded-lg px-2 py-1.5 text-center text-sm font-semibold tabular-nums" />
                      <span id="typo-warn-${st.id}" class="${isLow ? '' : 'hidden'} text-xs font-semibold text-amber-700 mt-0.5">⚠ &lt; 60 (Cek typo)</span>
                    </div>
                  </td>
                  <td id="jumlah-cell-${st.id}" class="px-3 py-2.5 text-center font-bold tabular-nums">${hasVal ? numVal * jamNum : '–'}</td>
                  <td class="px-3 py-2.5 text-center">
                    <div class="inline-flex items-center justify-center gap-1.5 flex-wrap">
                      <span id="pred-cell-${st.id}" class="arabic-font text-base font-bold${isBelowKkm ? ' text-[#d90000]' : ''}">${hasVal ? escapeHtml(getPredikatArab(numVal)) : '–'}</span>
                      <span id="kkm-badge-${st.id}" class="${isBelowKkm ? '' : 'hidden '}px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold whitespace-nowrap">&lt; KKM</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
          ${classStudents.length > 0 ? `
            <tfoot>
              <tr class="bg-[#fbf8f1] border-t-2 border-[#e7dcc3]">
                <td colspan="3" class="px-3 py-3 text-right text-xs text-slate-600 font-semibold">${isLocked ? 'Nilai sedang dikunci. Batalkan kirim untuk mengubah nilai:' : 'Perubahan sementara tersimpan lokal. Klik tombol untuk menyimpan ke server:'}</td>
                <td class="px-3 py-3 text-center">
                  ${isLocked ? '<span class="text-xs text-slate-400 italic">Terkunci</span>' : `
                    <button id="btn-save-nilai-foot" type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="savePenilaianToServer(${kObj.id}, ${sub.id}, this.dataset.kelas)" class="px-3.5 py-2 rounded-lg border-2 border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold whitespace-nowrap transition">
                      Save Nilai
                    </button>
                  `}
                </td>
                <td colspan="2" class="px-3 py-3 text-center">
                  <button id="btn-send-nilai-foot" type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="toggleAssignmentSent(${kObj.id}, ${sub.id}, this.dataset.kelas)" class="px-4 py-2 rounded-lg ${isLocked ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227]'} text-xs font-bold shadow-sm whitespace-nowrap transition">
                    ${isLocked ? 'Batalkan Kirim' : 'Kirim Nilai'}
                  </button>
                </td>
              </tr>
            </tfoot>
          ` : ''}
        </table>
      </div>
    </div>

    <!-- MOBILE TOUCH-FRIENDLY GRADING CARDS (< 768px) -->
    <div class="md:hidden space-y-2.5 penilaian-mobile-cards">
      ${!isLocked && classStudents.length > 0 ? `
        <div class="rdp-card p-3.5 bg-[#fbf8f1] space-y-2">
          <div class="text-xs font-bold text-[#0f4c3a]">Isi Nilai Default Kelas</div>
          <div class="flex flex-wrap items-center gap-2">
            <input id="default-nilai-input-mob" type="number" inputmode="decimal" min="0" max="100" placeholder="0–100" aria-label="Nilai default kelas (mobile)"
              class="w-24 h-10 border border-emerald-400 bg-white rounded-lg px-2.5 py-1.5 text-center text-sm font-bold text-emerald-900 placeholder-emerald-600/60 tabular-nums" />
            <button type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="applyDefaultNilai(${sub.id}, ${jamNum}, this.dataset.kelas, 'mob')" class="h-10 px-3.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-bold transition">
              Terapkan
            </button>
            <label class="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-auto" title="Jika dicentang, nilai yang sudah ada tidak ditimpa">
              <input id="default-nilai-empty-only-mob" type="checkbox" checked class="w-4 h-4 rounded border-slate-300 text-[#136048]" />
              <span>Kosong saja</span>
            </label>
          </div>
        </div>
      ` : ''}
      ${classStudents.length === 0 ? `
        <div class="rdp-card p-6 text-center text-sm text-slate-500 italic">Belum ada data santri di ${escapeHtml(kObj.kelas)}.</div>
      ` : classStudents.map((st, i) => {
        const rawVal = st.scores ? st.scores[sub.id] : undefined;
        const hasVal = hasScoreValue(rawVal);
        const numVal = hasVal ? Number(rawVal) : '';
        const isLow = hasVal && numVal < 60;
        const isBelowKkm = hasVal && numVal < activeKkm;
        return `
          <div class="rdp-card p-3.5 space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] text-xs font-bold text-[#0f4c3a] tabular-nums flex-shrink-0">${i + 1}</span>
                  <div class="font-bold text-sm text-slate-900 truncate">${escapeHtml(st.nama)}</div>
                </div>
                <div class="text-xs font-mono text-slate-500 mt-0.5 pl-8">NISN: ${escapeHtml(st.nisn)}</div>
              </div>
              <div class="flex-shrink-0">
                <input id="nilai-mob-${st.id}" data-mob-row-idx="${i}" type="number" inputmode="decimal" min="0" max="100" placeholder="–" value="${numVal}" ${isLocked ? 'disabled' : ''}
                  aria-label="Nilai ${escapeHtml(st.nama)}"
                  data-kelas="${escapeHtml(kObj.kode)}"
                  onkeydown="handleNilaiKeydown(event, ${i}, 'mob')"
                  oninput="stScore(${st.id},${sub.id},this.value,${jamNum},this.dataset.kelas,'nilai-mob-${st.id}')"
                  class="w-20 h-11 border ${isLow ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white'} ${isLocked ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''} rounded-lg px-2 py-1.5 text-center text-base font-bold tabular-nums" />
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#e7dcc3]/70 text-xs">
              <span class="text-slate-600">Jumlah: <b id="jumlah-mob-${st.id}" class="tabular-nums text-[#0f4c3a]">${hasVal ? numVal * jamNum : '–'}</b></span>
              <div class="inline-flex items-center gap-1.5">
                <span class="text-slate-600">Predikat:</span>
                <span id="pred-mob-${st.id}" class="arabic-font text-base font-bold${isBelowKkm ? ' text-[#d90000]' : ''}">${hasVal ? escapeHtml(getPredikatArab(numVal)) : '–'}</span>
                <span id="kkm-badge-mob-${st.id}" class="${isBelowKkm ? '' : 'hidden '}px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold">&lt; KKM</span>
              </div>
            </div>
            <div id="typo-warn-mob-${st.id}" class="${isLow ? '' : 'hidden '}text-xs font-semibold text-amber-700">⚠ Nilai di bawah 60 — cek kemungkinan typo</div>
          </div>
        `;
      }).join('')}
      ${classStudents.length > 0 ? `
        <div class="rdp-card p-3.5 bg-[#fbf8f1] flex items-center gap-2">
          ${isLocked ? '' : `
            <button id="btn-save-nilai-mob" type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="savePenilaianToServer(${kObj.id}, ${sub.id}, this.dataset.kelas)" class="flex-1 py-2.5 px-3 rounded-lg border-2 border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] text-xs font-bold transition">
              Save Nilai
            </button>
          `}
          <button id="btn-send-nilai-mob" type="button" data-kelas="${escapeHtml(kObj.kode)}" onclick="toggleAssignmentSent(${kObj.id}, ${sub.id}, this.dataset.kelas)" class="flex-1 py-2.5 px-3 rounded-lg ${isLocked ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227]'} text-xs font-bold shadow-sm transition">
            ${isLocked ? 'Batalkan Kirim' : 'Kirim Nilai'}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

async function applyDefaultNilai(subId, jam, kelasKode, source = 'desktop') {
  if (!kelasKode) return;
  const inputId = source === 'mob' ? 'default-nilai-input-mob' : 'default-nilai-input';
  const emptyCbId = source === 'mob' ? 'default-nilai-empty-only-mob' : 'default-nilai-empty-only';
  const defInp = document.getElementById(inputId);
  const rawVal = defInp ? defInp.value.trim() : '';
  if (rawVal === '') { showToast('Isi angka nilai default terlebih dahulu', 'warning'); return; }
  const parsed = Number(rawVal);
  if (!Number.isFinite(parsed)) { showToast('Nilai default harus berupa angka', 'error'); return; }
  const val = Math.min(100, Math.max(0, Math.round(parsed)));
  ['default-nilai-input', 'default-nilai-input-mob'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  const emptyOnly = Boolean(document.getElementById(emptyCbId)?.checked);
  const targets = state.students.filter(st => st.kelas === kelasKode);
  const affected = emptyOnly ? targets.filter(st => !hasScoreValue(st.scores && st.scores[subId])) : targets;
  if (affected.length === 0) {
    showToast('Semua santri sudah memiliki nilai');
    return;
  }
  const msg = emptyOnly
    ? `Isi nilai ${val} ke ${affected.length} santri yang masih kosong di Kelas ${kelasKode}?`
    : `TIMPA seluruh nilai (${affected.length} santri) di Kelas ${kelasKode} dengan angka ${val}?`;
  const confirmed = await openConfirmModal({
    title: emptyOnly ? 'Terapkan Nilai Default' : 'Timpa Seluruh Nilai',
    message: msg,
    confirmText: emptyOnly ? 'Terapkan Nilai' : 'Ya, Timpa Semua',
    variant: emptyOnly ? 'primary' : 'warning'
  });
  if (!confirmed) return;
  const isLow = val < 60;
  const jamNum = Number(jam) || 0;
  affected.forEach(st => {
    if (!st.scores) st.scores = {};
    st.scores[subId] = val;
    syncPenilaianCellUi(st.id, val, jamNum);
  });
  updatePenilaianFilledCount(kelasKode, subId);
  saveLocalScoreDraft(kelasKode, subId);
  showToast(isLow
    ? `Default ${val} (< 60, cek typo) diterapkan ke ${affected.length} santri — klik Save Nilai atau Kirim Nilai`
    : `Default ${val} diterapkan ke ${affected.length} santri — klik Save Nilai atau Kirim Nilai`);
}

function stScore(studentId, subId, val, jam, kelasKode, sourceId = null) {
  const s = state.students.find(x => x.id === studentId);
  if (!s) return;
  if (!s.scores) s.scores = {};

  if (val === '' || val === null || val === undefined || String(val).trim() === '') {
    delete s.scores[subId];
    syncPenilaianCellUi(studentId, '', Number(jam) || 0, sourceId);
    updatePenilaianFilledCount(kelasKode || s.kelas, subId);
    saveLocalScoreDraft(kelasKode || s.kelas, subId);
    return;
  }

  const parsedRaw = Number(val);
  if (!Number.isFinite(parsedRaw)) return;
  const num = Math.min(100, Math.max(0, Math.round(parsedRaw)));
  const jamNum = Number(jam) || 0;
  s.scores[subId] = num;
  syncPenilaianCellUi(studentId, num, jamNum, sourceId);
  updatePenilaianFilledCount(kelasKode || s.kelas, subId);
  saveLocalScoreDraft(kelasKode || s.kelas, subId);
}

function clearNilaiUploadReport() {
  state.nilaiUploadReport = null;
  renderPage();
}

async function downloadNilaiTemplate(subId, kelasKode) {
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Pustaka Excel (XLSX) belum siap');
    return;
  }
  const sub = state.subjects.find(s => Number(s.id) === Number(subId));
  if (!sub) { showToast('Mata pelajaran tidak ditemukan'); return; }
  const classStudents = state.students.filter(st => st.kelas === kelasKode);

  const aoa = [
    [`Kelas : ${kelasKode}`, '', '', ''],
    [`Mata Pelajaran : ${sub.namaId} (${sub.namaArab})`, '', '', ''],
    [`Periode : ${state.pesantren.tahun || ''} | ${state.pesantren.semester || ''}`, '', '', ''],
    ['No', 'NISN', 'Nama Siswa', 'Nilai']
  ];

  classStudents.forEach((st, idx) => {
    const raw = st.scores ? st.scores[sub.id] : undefined;
    const curVal = hasScoreValue(raw) ? Number(raw) : '';
    aoa.push([
      idx + 1,
      sanitizeExcelCell(String(st.nisn || '')),
      sanitizeExcelCell(String(st.nama || '')),
      curVal
    ]);
  });

  // Auto width untuk kolom Nama Siswa berdasarkan panjang nama santri terpanjang
  const maxNamaChars = Math.max(
    14,
    'Nama Siswa'.length,
    ...classStudents.map(st => String(st.nama || '').length)
  ) + 3;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }
  ];
  ws['!cols'] = [
    { wch: 4 },
    { wch: 15, hidden: true },
    { wch: maxNamaChars },
    { wch: 6 }
  ];

  const wb = XLSX.utils.book_new();
  const safeSheetName = (`Nilai_${kelasKode}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  const safeMapel = String(sub.namaId || 'Mapel').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKelas = String(kelasKode || 'Kelas').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const safeTahun = String(state.pesantren?.tahun || '').replace(/[^0-9A-Za-z]/g, '_');
  const safeSem = String(state.pesantren?.semester || '').replace(/[^0-9A-Za-z]/g, '_');
  const fileName = `Template_Nilai_${safeKelas}_${safeMapel}_${safeTahun}_${safeSem}.xlsx`;

  try {
    if (XLSX.CFB && typeof TextDecoder !== 'undefined' && typeof TextEncoder !== 'undefined') {
      const rawBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const cfb = XLSX.CFB.read(new Uint8Array(rawBuf), { type: 'array' });
      const dec = new TextDecoder('utf-8');
      const enc = new TextEncoder();

      // 6. Styling tabel (warna header #D9E1F2, border tipis, highlight kolom Nilai #FFF9DB) + Protect semua sel kecuali kolom Nilai
      const stylesEntry = XLSX.CFB.find(cfb, '/xl/styles.xml');
      if (stylesEntry && stylesEntry.content) {
        const customStylesXml =
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<fonts count="2">' +
              '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>' +
              '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font>' +
            '</fonts>' +
            '<fills count="5">' +
              '<fill><patternFill patternType="none"/></fill>' +
              '<fill><patternFill patternType="gray125"/></fill>' +
              '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>' +
              '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>' +
              '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF9DB"/><bgColor indexed="64"/></patternFill></fill>' +
            '</fills>' +
            '<borders count="2">' +
              '<border><left/><right/><top/><bottom/><diagonal/></border>' +
              '<border>' +
                '<left style="thin"><color rgb="FF000000"/></left>' +
                '<right style="thin"><color rgb="FF000000"/></right>' +
                '<top style="thin"><color rgb="FF000000"/></top>' +
                '<bottom style="thin"><color rgb="FF000000"/></bottom>' +
                '<diagonal/>' +
              '</border>' +
            '</borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="6">' +
              // s=0: Default locked
              '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="1"/></xf>' +
              // s=1: Judul Kelas / Mapel (Bold, locked)
              '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1" applyProtection="1"><alignment horizontal="left" vertical="center"/><protection locked="1"/></xf>' +
              // s=2: Header Tabel (Bold, Biru Muda #D9E1F2, Border, Center, locked)
              '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="center" vertical="center"/><protection locked="1"/></xf>' +
              // s=3: Kolom No (Border, Tint Abu #F8FAFC, Center, locked)
              '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="center" vertical="center"/><protection locked="1"/></xf>' +
              // s=4: Kolom NISN & Nama Siswa (Border, Tint Abu #F8FAFC, Left, locked)
              '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="left" vertical="center"/><protection locked="1"/></xf>' +
              // s=5: Kolom Nilai Santri (Border, Kuning Lembut #FFF9DB, Center, UNLOCKED locked="0")
              '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment horizontal="center" vertical="center"/><protection locked="0"/></xf>' +
            '</cellXfs>' +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
          '</styleSheet>';
        stylesEntry.content = enc.encode(customStylesXml);
      }

      const sheetEntry = XLSX.CFB.find(cfb, '/xl/worksheets/sheet1.xml');
      if (sheetEntry && sheetEntry.content) {
        let sheetXml = dec.decode(sheetEntry.content);
        // 1. Sembunyikan seluruh baris yang tidak terpakai (zeroHeight="1" pada sheetFormatPr + baris 3 kosong disembunyikan)
        sheetXml = sheetXml.replace(
          '</sheetViews>',
          '</sheetViews><sheetFormatPr defaultRowHeight="15" zeroHeight="1"/>'
        );
        // 1. Sembunyikan seluruh kolom yang tidak terpakai (Kolom E / 5 sampai XFD / 16384) + bestFit="1" pada kolom Nama Siswa (3)
        sheetXml = sheetXml.replace(
          /<col min="3" max="3"([^>]*)\/>/,
          '<col min="3" max="3"$1 bestFit="1"/>'
        );
        sheetXml = sheetXml.replace(
          '</cols>',
          '<col min="5" max="16384" width="8.43" hidden="1" customWidth="1"/></cols>'
        );
        sheetXml = sheetXml.replace(/<row r="(\d+)">/g, (m, rNum) => {
          const r = Number(rNum);
          if (r === 4) return '<row r="4" ht="22" customHeight="1">';
          return `<row r="${r}" ht="19" customHeight="1">`;
        });
        sheetXml = sheetXml.replace(/<c r="([A-D])(\d+)"/g, (m, col, rStr) => {
          const r = Number(rStr);
          if (r >= 1 && r <= 3) return `<c r="${col}${r}" s="1"`;
          if (r === 4) return `<c r="${col}${r}" s="2"`;
          if (r >= 5) {
            if (col === 'A') return `<c r="A${r}" s="3"`;
            if (col === 'B' || col === 'C') return `<c r="${col}${r}" s="4"`;
            if (col === 'D') return `<c r="D${r}" s="5"`;
          }
          return m;
        });
        // Aktifkan proteksi worksheet (selectLockedCells & selectUnlockedCells default false = DIIZINKAN memilih & mengedit sel unlocked!)
        sheetXml = sheetXml.replace(
          '</sheetData>',
          '</sheetData><sheetProtection sheet="1" objects="1" scenarios="1"/>'
        );
        // Validasi Data Excel: Kolom Nilai (D5:D{lastRow}) rentang 0-100, dengan peringatan (Warning) jika di bawah 60 (kemungkinan typo)
        const lastRow = 4 + classStudents.length;
        if (lastRow >= 5) {
          const dvXml =
            '<dataValidations count="1">' +
              `<dataValidation type="whole" operator="between" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="warning" errorTitle="Peringatan Nilai (&lt; 60)" error="Nilai di bawah 60 atau di atas 100. Pastikan bukan salah ketik (typo). Rentang resmi 0–100 tetap diperbolehkan." promptTitle="Input Nilai (0 - 100)" prompt="Masukkan angka 0 - 100 (kosongkan jika belum ada). Nilai &lt; 60 akan memunculkan catatan cek typo." sqref="D5:D${lastRow}">` +
                '<formula1>60</formula1>' +
                '<formula2>100</formula2>' +
              '</dataValidation>' +
            '</dataValidations>';
          if (sheetXml.includes('</mergeCells>')) {
            sheetXml = sheetXml.replace('</mergeCells>', '</mergeCells>' + dvXml);
          } else {
            sheetXml = sheetXml.replace('</worksheet>', dvXml + '</worksheet>');
          }
        }
        sheetEntry.content = enc.encode(sheetXml);
      }

      const outZip = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array' });
      const blob = new Blob([new Uint8Array(outZip)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 5000);
      showToast(`Template Nilai ${kelasKode} - ${sub.namaId} (Terproteksi) berhasil diunduh`);
      return;
    }
  } catch (err) {
    console.warn('Fallback ke XLSX.writeFile standar:', err);
  }

  XLSX.writeFile(wb, fileName);
  showToast(`Template Nilai ${kelasKode} - ${sub.namaId} berhasil diunduh`);
}

async function handleNilaiUpload(event, assignId, subId, jam, kelasKode) {
  const inputEl = event.target;
  const file = inputEl && inputEl.files && inputEl.files[0];
  if (inputEl) inputEl.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('Ukuran file maksimal 10 MB');
    return;
  }
  const sub = state.subjects.find(s => Number(s.id) === Number(subId));
  if (!sub) {
    showToast('Mata pelajaran tidak ditemukan');
    return;
  }
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Pustaka Excel (XLSX) belum siap');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => { event.target.value = ''; showToast('Gagal membaca file nilai'); };
  reader.onload = async function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

      if (!rows || rows.length === 0) {
        showToast('File Excel kosong');
        return;
      }

      let headerRowIdx = -1;
      let colNisn = 1;
      let colNama = 2;
      let colNilai = 3;
      let fileKelasMeta = '';
      let fileMapelMeta = '';
      let filePeriodeMeta = '';

      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        const row = rows[r].map(c => String(c || '').trim());
        const lower = row.map(c => c.toLowerCase());

        const nisnIdx = lower.findIndex(c => c === 'nisn' || c.includes('nisn'));
        const nilaiIdx = lower.findIndex(c => c === 'nilai' || c.includes('nilai') || c.includes('الدرجة'));
        if (nisnIdx !== -1 && nilaiIdx !== -1) {
          headerRowIdx = r;
          colNisn = nisnIdx;
          colNilai = nilaiIdx;
          const namaIdx = lower.findIndex(c => c.includes('nama'));
          if (namaIdx !== -1) colNama = namaIdx;
          break;
        }

        const firstCell = lower[0] || '';
        if (firstCell === 'kelas' || firstCell.startsWith('kelas')) {
          fileKelasMeta = row[1] || row[0].replace(/^kelas\s*[:=-]?\s*/i, '').trim();
        } else if (firstCell === 'mata pelajaran' || firstCell.startsWith('mata pelajaran') || firstCell === 'mapel') {
          fileMapelMeta = row[1] || row[0].replace(/^(mata pelajaran|mapel)\s*[:=-]?\s*/i, '').trim();
        } else if (firstCell.startsWith('periode')) {
          filePeriodeMeta = row[1] || row[0].replace(/^periode\s*[:=-]?\s*/i, '').trim();
        }
      }

      const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

      // Ambil daftar santri terbaru dari state (menghindari race condition dengan refreshStateFromServer)
      const classStudents = state.students.filter(st => st.kelas === kelasKode);
      const studentByNisn = new Map();
      const dupClassNisn = new Set();
      classStudents.forEach(st => {
        const key = String(st.nisn || '').trim();
        if (!key || key === '0000000000' || key === '-') return;
        if (studentByNisn.has(key)) dupClassNisn.add(key);
        else studentByNisn.set(key, st);
      });

      const unmatchedInFile = [];
      const duplicateInFile = [];
      const seenNisnInFile = new Set();
      const matchedByStudentId = new Map();

      for (let r = startRow; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every(cell => String(cell || '').trim() === '')) continue;

        const rawNisn = String(row[colNisn] ?? '').trim();
        const rawNama = String(row[colNama] ?? '').trim();
        const rawNilai = String(row[colNilai] ?? '').trim();

        if (!rawNisn && !rawNama && !rawNilai) continue;

        if (rawNisn) {
          if (seenNisnInFile.has(rawNisn)) {
            if (!duplicateInFile.includes(rawNisn)) duplicateInFile.push(rawNisn);
            continue; // Abaikan baris duplikat berikutnya agar tidak diam-diam menimpa
          }
          seenNisnInFile.add(rawNisn);
        }

        const matchedSt = (rawNisn && !dupClassNisn.has(rawNisn)) ? studentByNisn.get(rawNisn) : null;
        if (!matchedSt) {
          unmatchedInFile.push({
            rowNum: r + 1,
            nisn: rawNisn,
            nama: rawNama,
            nilai: rawNilai
          });
        } else {
          matchedByStudentId.set(matchedSt.id, {
            studentId: matchedSt.id,
            nama: matchedSt.nama,
            rawNilai,
            rowNum: r + 1
          });
        }
      }

      const matchedUpdates = [...matchedByStudentId.values()];
      const missingFromFile = classStudents.filter(st => !matchedByStudentId.has(st.id));

      const metaMismatch = [];
      if (fileKelasMeta && fileKelasMeta.toLowerCase() !== String(kelasKode).toLowerCase()) {
        metaMismatch.push(`Kelas pada file tertulis "${fileKelasMeta}", sedangkan kelas aktif adalah "${kelasKode}".`);
      }
      if (fileMapelMeta && !fileMapelMeta.toLowerCase().includes(String(sub.namaId).toLowerCase()) && !fileMapelMeta.includes(String(sub.namaArab))) {
        metaMismatch.push(`Mata Pelajaran pada file tertulis "${fileMapelMeta}", sedangkan mapel aktif adalah "${sub.namaId} (${sub.namaArab})".`);
      }
      if (filePeriodeMeta) {
        const curTh = String(state.pesantren?.tahun || '');
        const curSm = String(state.pesantren?.semester || '');
        if ((curTh && !filePeriodeMeta.includes(curTh)) || (curSm && !filePeriodeMeta.toLowerCase().includes(curSm.toLowerCase()))) {
          metaMismatch.push(`Periode pada file tertulis "${filePeriodeMeta}", sedangkan periode aktif adalah "${curTh} | ${curSm}".`);
        }
      }

      const hasNisnMismatch = unmatchedInFile.length > 0 || missingFromFile.length > 0 || duplicateInFile.length > 0 || metaMismatch.length > 0;

      state.nilaiUploadReport = {
        kelasKode,
        subId: sub.id,
        fileName: file.name,
        hasMismatch: hasNisnMismatch,
        metaMismatch,
        unmatchedInFile,
        missingFromFile: missingFromFile.map(s => ({ nisn: s.nisn, nama: s.nama })),
        duplicateInFile,
        summaryText: hasNisnMismatch
          ? `Ditemukan perbedaan data: ${matchedUpdates.length} santri cocok, ${unmatchedInFile.length} baris di file tidak cocok dengan kelas ${kelasKode}, dan ${missingFromFile.length} santri kelas ${kelasKode} tidak ada di file.`
          : `Seluruh ${matchedUpdates.length} NISN pada file cocok dengan data santri Kelas ${kelasKode}.`
      };

      if (matchedUpdates.length === 0) {
        renderPage();
        showToast('Tidak ada NISN yang cocok dengan kelas ini');
        return;
      }

      if (hasNisnMismatch) {
        const lines = [
          `[PERINGATAN VALIDASI UPLOAD - ${kelasKode} (${sub.namaId})]`,
          `• NISN Cocok: ${matchedUpdates.length} dari ${classStudents.length} santri kelas ${kelasKode}`
        ];
        if (metaMismatch.length > 0) lines.push(`• Perbedaan Identitas Template: ${metaMismatch.join(' ')}`);
        if (unmatchedInFile.length > 0) {
          const sample = unmatchedInFile.slice(0, 5).map(u => `Baris ${u.rowNum}: ${u.nisn || '(Kosong)'} (${u.nama || '-'})`).join('; ');
          lines.push(`• NISN di file TIDAK ditemukan di kelas ${kelasKode} (${unmatchedInFile.length} baris): ${sample}${unmatchedInFile.length > 5 ? ', dst.' : ''}`);
        }
        if (missingFromFile.length > 0) {
          const sample = missingFromFile.slice(0, 5).map(m => `${m.nisn} (${m.nama})`).join('; ');
          lines.push(`• Santri kelas ${kelasKode} TIDAK ada di file (${missingFromFile.length} santri): ${sample}${missingFromFile.length > 5 ? ', dst.' : ''}`);
        }
        if (duplicateInFile.length > 0) lines.push(`• NISN ganda di file: ${duplicateInFile.join(', ')}`);
        lines.push('', 'Tetap lanjutkan memuat nilai yang cocok dari file ini?');
        const keepLoading = await openConfirmModal({
          title: 'Konfirmasi Hasil Validasi File',
          message: lines.join('\n'),
          confirmText: 'Tetap Muat Nilai',
          variant: 'warning'
        });
        if (!keepLoading) {
          state.nilaiUploadReport.summaryText += ' (Upload dibatalkan oleh guru).';
          renderPage();
          showToast('Upload nilai dibatalkan');
          return;
        }
      }

      // Re-resolve student references from live state.students setelah dialog konfirmasi
      const liveById = new Map(state.students.filter(st => st.kelas === kelasKode).map(st => [st.id, st]));
      const hasExistingScores = matchedUpdates.some(item => {
        if (item.rawNilai === '') return false;
        const st = liveById.get(item.studentId);
        return st && hasScoreValue(st.scores && st.scores[sub.id]);
      });

      if (hasExistingScores) {
        const ok = await openConfirmModal({
          title: 'Timpa Nilai yang Sudah Ada?',
          message: 'Sebagian santri di kelas ini sudah memiliki nilai. Apakah Anda yakin ingin menimpa dengan nilai baru dari file ini?',
          confirmText: 'Ya, Timpa Nilai',
          variant: 'warning'
        });
        if (!ok) {
          state.nilaiUploadReport.summaryText += ' (Upload nilai baru dibatalkan oleh guru).';
          renderPage();
          showToast('Upload nilai dibatalkan');
          return;
        }
      }

      // Re-resolve sekali lagi setelah confirm kedua
      const finalById = new Map(state.students.filter(st => st.kelas === kelasKode).map(st => [st.id, st]));
      let appliedCount = 0;
      const invalidScores = [];
      const lowScores = [];
      matchedUpdates.forEach(({ studentId, nama, rawNilai, rowNum }) => {
        if (rawNilai === '') return;
        const st = finalById.get(studentId);
        if (!st) return;
        if (!st.scores) st.scores = {};
        const parsed = Number(String(rawNilai).replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
          invalidScores.push({ rowNum, nama, nilai: rawNilai });
          return;
        }
        const rounded = Math.round(parsed);
        if (rounded < 60) {
          lowScores.push({ rowNum, nama, nilai: rounded });
        }
        st.scores[sub.id] = rounded;
        appliedCount++;
      });

      if (invalidScores.length > 0) {
        state.nilaiUploadReport.invalidScores = invalidScores;
        state.nilaiUploadReport.hasMismatch = true;
        state.nilaiUploadReport.summaryText += ` Ditemukan ${invalidScores.length} nilai di luar rentang 0–100 yang diabaikan.`;
      }
      if (lowScores.length > 0) {
        state.nilaiUploadReport.lowScores = lowScores;
        state.nilaiUploadReport.hasMismatch = true;
        state.nilaiUploadReport.summaryText += ` Catatan: ${lowScores.length} nilai di bawah 60 (kemungkinan typo).`;
      }

      if (appliedCount > 0) saveLocalScoreDraft(kelasKode, sub.id);
      renderPage();
      showToast(
        invalidScores.length > 0
          ? `Memuat ${appliedCount} nilai valid (${invalidScores.length} nilai di luar 0–100 diabaikan). Klik Save Nilai / Kirim Nilai.`
          : (lowScores.length > 0
            ? `Memuat ${appliedCount} nilai (${lowScores.length} nilai < 60, cek kemungkinan typo). Klik Save Nilai / Kirim Nilai.`
            : `Berhasil memuat ${appliedCount} nilai santri dari file. Klik "Save Nilai" atau "Kirim Nilai" untuk menyimpan ke server.`)
      );
    } catch (err) {
      console.error(err);
      showToast('Gagal membaca file nilai: ' + (err.message || 'Format tidak valid'));
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderBobot() {
  return `
    ${renderPageHeader('Bobot Penilaian', 'Ketentuan pembobotan nilai dan Kriteria Ketuntasan Minimal (KKM) rapor lokal.')}
    <div class="rdp-card p-5 max-w-xl text-xs space-y-3">
      <h2 class="font-bold text-sm text-[#0f4c3a]">Ketentuan Pembobotan Otomatis</h2>
      <p class="text-slate-700 leading-relaxed">Bobot tiap mata pelajaran otomatis mengikuti jumlah jam pelajaran (<span class="arabic-font text-base font-bold text-[#0f4c3a]">الساعات</span>) pada pengaturan Mata Pelajaran Lembaga.</p>
      <div class="p-3 rounded-lg bg-[#fbf8f1] border border-[#e7dcc3] flex items-center justify-between">
        <span class="font-semibold text-[#0f4c3a]">KKM Aktif Saat Ini:</span>
        <span class="px-2.5 py-1 rounded-full bg-[#0f4c3a] text-[#f3e3b0] font-bold tabular-nums">${getActiveKkm()}</span>
      </div>
    </div>
  `;
}

