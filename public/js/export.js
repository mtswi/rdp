// ===================== LEDGER EXCEL EXPORT =====================
function renderLeggerPage() {
  const waliKelas = getWaliKelasKode();
  if (waliKelas) {
    state.selectedRaporKelas = waliKelas;
    state.selectedRaporTingkat = getKelasTingkat(waliKelas);
  }
  const matchingClasses = state.selectedRaporTingkat
    ? sortClasses(state.classes.filter(c => c.tingkat === state.selectedRaporTingkat))
    : [];
  if (!waliKelas && state.selectedRaporKelas && !matchingClasses.some(c => c.kode === state.selectedRaporKelas)) {
    state.selectedRaporKelas = '';
  }
  const classStudents = state.selectedRaporKelas
    ? state.students.filter(st => st.kelas === state.selectedRaporKelas)
    : [];
  const classRankMap = state.selectedRaporKelas ? getClassRankMap(state.selectedRaporKelas) : null;
  const previewSubs = getEffectiveSubjects(state.selectedRaporKelas || null).slice(0, 6);

  return `
    ${renderPageHeader(
      `Ledger Nilai Santri${waliKelas ? ` — Kelas ${waliKelas}` : ''}`,
      'Rekapitulasi nilai seluruh mata pelajaran, total terbobot, rata-rata, dan ranking dalam format Excel.'
    )}
    <div class="rdp-card p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7dcc3] pb-3">
        <div>
          <h2 class="font-bold text-sm text-[#0f4c3a]">Pratinjau &amp; Unduh Ledger (Excel)</h2>
        </div>
        ${waliKelas ? `
          <div class="flex items-center gap-2 text-xs">
            <span class="px-3 py-1.5 rounded-lg bg-[#0f4c3a] text-[#f3e3b0] font-bold">Wali Kelas: Kelas ${escapeHtml(waliKelas)}</span>
          </div>
        ` : `
          <div class="flex flex-wrap items-center gap-2.5 text-xs">
            <div class="flex items-center gap-1.5">
              <label for="legger-tingkat-select" class="font-semibold text-[#0f4c3a]">Tingkat:</label>
              <select id="legger-tingkat-select" onchange="onRaporTingkatChange(this.value)" class="border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-[#fbf8f1] font-semibold">
                <option value="" ${!state.selectedRaporTingkat ? 'selected' : ''}>-- Pilih Tingkat --</option>
                <option value="7" ${state.selectedRaporTingkat === '7' ? 'selected' : ''}>Tingkat 7</option>
                <option value="8" ${state.selectedRaporTingkat === '8' ? 'selected' : ''}>Tingkat 8</option>
                <option value="9" ${state.selectedRaporTingkat === '9' ? 'selected' : ''}>Tingkat 9</option>
              </select>
            </div>
            <div class="flex items-center gap-1.5">
              <label for="legger-kelas-select" class="font-semibold text-[#0f4c3a]">Kelas:</label>
              <select id="legger-kelas-select" onchange="onRaporKelasChange(this.value)" ${!state.selectedRaporTingkat ? 'disabled' : ''} class="border border-[#e7dcc3] rounded-lg px-2.5 py-1.5 bg-[#fbf8f1] font-semibold disabled:bg-slate-100 disabled:text-slate-400">
                <option value="" ${!state.selectedRaporKelas ? 'selected' : ''}>${!state.selectedRaporTingkat ? '-- Pilih Tingkat dahulu --' : '-- Pilih Kelas --'}</option>
                ${matchingClasses.map(c => `<option value="${escapeHtml(c.kode)}" ${c.kode === state.selectedRaporKelas ? 'selected' : ''}>Kelas ${escapeHtml(c.kode)}</option>`).join('')}
              </select>
            </div>
          </div>
        `}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 bg-[#fbf8f1] p-3 rounded-lg border border-[#e7dcc3] text-xs">
        <div class="font-semibold text-[#0f4c3a]">Pratinjau Kelas ${escapeHtml(state.selectedRaporKelas || '-')} (${classStudents.length} santri)</div>
        <div class="flex flex-wrap gap-2">
          <button type="button" onclick="exportLeggerExcel('kelas')" class="px-3 py-1.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">Download Ledger Kelas ini</button>
          ${!waliKelas ? `
            <button type="button" onclick="exportLeggerExcel('tingkat')" class="px-3 py-1.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">Download Ledger Tingkat ini</button>
            <button type="button" onclick="exportLeggerExcel('all')" class="px-3 py-1.5 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 font-semibold">Download Ledger Semua kelas</button>
          ` : ''}
        </div>
      </div>

      <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              <th class="px-2 py-2.5 border-r border-[#e7dcc3]">No</th>
              <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama Santri</th>
              <th class="px-2 py-2.5 border-r border-[#e7dcc3]">Kelas</th>
              ${previewSubs.map(sub => `<th class="px-2 py-2.5 border-r border-[#e7dcc3] text-center arabic-font">${escapeHtml(sub.namaArab)}</th>`).join('')}
              <th class="px-2 py-2.5 border-r border-[#e7dcc3] text-center">Total</th>
              <th class="px-2 py-2.5 border-r border-[#e7dcc3] text-center">Rata-rata</th>
              <th class="px-2 py-2.5 text-center">Ranking</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${classStudents.length === 0 ? `
              <tr><td colspan="${6 + previewSubs.length}" class="px-4 py-6 text-center text-slate-400 italic">Belum ada data santri di kelas ${escapeHtml(state.selectedRaporKelas || '-')}.</td></tr>
            ` : classStudents.map((st, i) => {
              const entry = classRankMap && !st.rankOverride ? classRankMap.byId.get(st.id) : null;
              const t = entry ? entry.totals : computeStudentTotals(st);
              const r = st.rankOverride || (entry ? { rank: entry.rank, totalStudents: entry.totalStudents } : getStudentRank(st.id));
              return `
                <tr class="hover:bg-[#fbf8f1]">
                  <td class="px-2 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                  <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold">${escapeHtml(st.nama)}</td>
                  <td class="px-2 py-2 border-r border-[#e7dcc3]">${escapeHtml(st.kelas)}</td>
                  ${previewSubs.map(sub => {
                    const raw = st.scores ? st.scores[sub.id] : undefined;
                    return `<td class="px-2 py-2 border-r border-[#e7dcc3] text-center tabular-nums">${hasScoreValue(raw) ? Number(raw) : '–'}</td>`;
                  }).join('')}
                  <td class="px-2 py-2 border-r border-[#e7dcc3] text-center font-bold tabular-nums">${t.hasAnyScore ? t.totalWeighted : '–'}</td>
                  <td class="px-2 py-2 border-r border-[#e7dcc3] text-center tabular-nums">${t.hasAnyScore ? t.avg.toFixed(2) : '–'}</td>
                  <td class="px-2 py-2 text-center font-bold text-emerald-700">${t.hasAnyScore ? '#' + r.rank : '–'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


async function exportLeggerExcel(scope = 'kelas') {
  const validClassCodes = new Set(state.classes.map(c => c.kode));
  let targetStudents = state.students.filter(st => validClassCodes.has(st.kelas));
  let scopeLabel = 'Semua_Kelas';
  let titleScope = 'Semua Kelas';
  let effSubjects = [];

  if (scope === 'kelas') {
    const k = state.selectedRaporKelas;
    if (!k) { showToast('Pilih kelas terlebih dahulu'); return; }
    targetStudents = targetStudents.filter(st => st.kelas === k);
    scopeLabel = `Kelas_${String(k).replace(/[^A-Za-z0-9_-]/g, '_')}`;
    titleScope = `Kelas ${k}`;
    effSubjects = getEffectiveSubjects(k);
  } else if (scope === 'tingkat') {
    const tk = state.selectedRaporTingkat;
    if (!tk) { showToast('Pilih tingkat terlebih dahulu'); return; }
    targetStudents = targetStudents.filter(st => getKelasTingkat(st.kelas) === String(tk));
    scopeLabel = `Tingkat_${tk}`;
    titleScope = `Tingkat ${tk}`;
    const usedSubIds = new Set();
    for (const st of targetStudents) {
      if (!st.scores) continue;
      for (const [k, v] of Object.entries(st.scores)) {
        if (hasScoreValue(v)) usedSubIds.add(Number(k));
      }
    }
    const usedMapel = new Set(
      (state.assignments || [])
        .filter(a => getKelasTingkat(a.kode) === String(tk))
        .map(a => a.mapel)
    );
    effSubjects = (state.subjects || []).filter(s => s.active !== false || usedSubIds.has(s.id) || usedMapel.has(s.namaArab));
  } else {
    effSubjects = getEffectiveSubjects(null);
  }

  targetStudents = [...targetStudents].sort((a, b) => {
    const tA = Number(getKelasTingkat(a.kelas)) || 99;
    const tB = Number(getKelasTingkat(b.kelas)) || 99;
    if (tA !== tB) return tA - tB;
    const kCmp = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id', { numeric: true });
    if (kCmp !== 0) return kCmp;
    return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
  });

  if (targetStudents.length === 0) {
    showToast(`Tidak ada data santri untuk Ledger ${titleScope}`);
    return;
  }

  const tahunSafe = String(state.pesantren.tahun || '2026_2027').replace(/[^0-9A-Za-z]/g, '_');
  const semSafe = String(state.pesantren.semester || 'Ganjil').replace(/[^0-9A-Za-z]/g, '_');
  const rankMapCache = new Map();
  const getCachedClassRankMap = (kelasKode) => {
    if (!rankMapCache.has(kelasKode)) rankMapCache.set(kelasKode, getClassRankMap(kelasKode));
    return rankMapCache.get(kelasKode);
  };
  await ensureXlsxLoaded();
  if (typeof XLSX !== 'undefined') {
    const headers = [
      'No', 'NIS', 'NISN', 'Nama Santri', 'Kelas',
      ...effSubjects.map(sub => sanitizeExcelCell(`${sub.namaId} (${sub.namaArab} - ${sub.jam}j)`)),
      'Total (المجموع)', 'Rata-rata', 'Ranking Kelas (الترتيب)'
    ];
    const aoa = [
      [sanitizeExcelCell(`LEDGER NILAI RAPOR DIGITAL PESANTREN (RDP) - ${state.pesantren.nama}`)],
      [sanitizeExcelCell(`Tahun Pelajaran: ${state.pesantren.tahun} | Semester: ${state.pesantren.semester} | Cakupan: ${titleScope}`)],
      [],
      headers,
      ...targetStudents.map((st, i) => {
        const entry = !st.rankOverride ? getCachedClassRankMap(st.kelas).byId.get(st.id) : null;
        const t = entry ? entry.totals : computeStudentTotals(st);
        const r = st.rankOverride || (entry ? { rank: entry.rank, totalStudents: entry.totalStudents } : getStudentRank(st.id));
        return [
          i + 1,
          sanitizeExcelCell(String(st.nis || '')),
          sanitizeExcelCell(String(st.nisn || '')),
          sanitizeExcelCell(String(st.nama || '')),
          sanitizeExcelCell(String(st.kelas || '')),
          ...effSubjects.map(sub => {
            const raw = st.scores ? st.scores[sub.id] : undefined;
            return hasScoreValue(raw) ? Number(raw) : '';
          }),
          t.hasAnyScore ? t.totalWeighted : '',
          t.hasAnyScore ? Number(t.avg.toFixed(2)) : '',
          t.hasAnyScore ? r.rank : ''
        ];
      })
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger Nilai');
    XLSX.writeFile(wb, `Ledger_RDP_${scopeLabel}_${tahunSafe}_${semSafe}.xlsx`);
    showToast(`Ledger ${titleScope} (.xlsx) berhasil diunduh!`);
    return;
  }

  const thSubjects = effSubjects.map(sub => `<th>${escapeHtml(sanitizeExcelCell(sub.namaArab))} (${sub.jam}j)</th>`).join('');
  const rows = targetStudents.map((st, i) => {
    const entry = !st.rankOverride ? getCachedClassRankMap(st.kelas).byId.get(st.id) : null;
    const t = entry ? entry.totals : computeStudentTotals(st);
    const r = st.rankOverride || (entry ? { rank: entry.rank, totalStudents: entry.totalStudents } : getStudentRank(st.id));
    const tds = effSubjects.map(sub => {
      const raw = st.scores ? st.scores[sub.id] : undefined;
      return `<td>${hasScoreValue(raw) ? Number(raw) : '–'}</td>`;
    }).join('');
    return `<tr><td>${i + 1}</td><td style="mso-number-format:'\\@'">${escapeHtml(sanitizeExcelCell(st.nisn))}</td><td>${escapeHtml(sanitizeExcelCell(st.nama))}</td><td>${escapeHtml(sanitizeExcelCell(st.kelas))}</td>${tds}<td><b>${t.hasAnyScore ? t.totalWeighted : '–'}</b></td><td>${t.hasAnyScore ? t.avg.toFixed(2) : '–'}</td><td><b>${t.hasAnyScore ? r.rank : '–'}</b></td></tr>`;
  }).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body>
      <h3>LEDGER NILAI RAPOR DIGITAL PESANTREN (RDP) - ${escapeHtml(sanitizeExcelCell(state.pesantren.nama))} (${escapeHtml(sanitizeExcelCell(state.pesantren.tahun))} - ${escapeHtml(sanitizeExcelCell(state.pesantren.semester))}) - ${escapeHtml(sanitizeExcelCell(titleScope))}</h3>
      <table border="1">
        <thead>
          <tr style="background:#d1fae5;font-weight:bold;">
            <th>No</th><th>NISN</th><th>Nama Santri</th><th>Kelas</th>${thSubjects}<th>Total (المجموع)</th><th>Rata-rata</th><th>Ranking (الترتيب)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>
  `;
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Ledger_RDP_${scopeLabel}_${tahunSafe}_${semSafe}.xls`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);
  showToast(`File Ledger ${titleScope} (.xls) berhasil diunduh!`);
}

