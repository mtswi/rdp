// ===================== RAPOR LOKAL ARAB (صحيفة الدرجات) + PDF + LEGGER EXCEL =====================
function onRaporTingkatChange(tingkat) {
  state.selectedRaporTingkat = tingkat;
  state.raporPrintAll = false;
  state.selectedRaporKelas = '';
  state.rankingSortKey = 'rank';
  state.rankingSortDir = 'asc';
  renderPage();
}

function onRaporKelasChange(kelas) {
  state.selectedRaporKelas = kelas;
  state.raporPrintAll = false;
  state.rankingSortKey = 'rank';
  state.rankingSortDir = 'asc';
  const firstSt = state.students.find(st => st.kelas === kelas);
  if (firstSt) state.selectedStudentId = firstSt.id;
  renderPage();
}

async function openRaporInNewTab(studentsList, autoPrint = false) {
  if (!studentsList || studentsList.length === 0) {
    showToast('Tidak ada data santri untuk ditampilkan');
    return;
  }
  const incompleteStudents = studentsList.filter(st => getMissingScoresForStudent(st).length > 0);
  let win = null;
  if (incompleteStudents.length > 0) {
    const ok = await openConfirmModal({
      title: 'Nilai Santri Belum Lengkap',
      message: `Peringatan: ${incompleteStudents.length} dari ${studentsList.length} santri masih memiliki nilai kosong (belum lengkap).\n\nNilai kosong akan ditampilkan sebagai "–". Tetap lanjutkan ${autoPrint ? 'mencetak' : 'membuka pratinjau'} rapor?`,
      confirmText: autoPrint ? 'Tetap Cetak' : 'Buka Pratinjau',
      variant: 'warning',
      onConfirmSync: () => { win = window.open('', '_blank'); }
    });
    if (!ok) return;
  } else {
    win = window.open('', '_blank');
  }
  if (!win) {
    showToast('Pop-up diblokir browser. Izinkan pop-up untuk membuka tab pratinjau rapor.');
    return;
  }

  // Optimalkan ukuran gambar kop & watermark (bake grayscale & opacity ke canvas JPEG ringan agar ukuran PDF < 200 KB)
  const m = state.pesantren;
  const printAssets = {
    logoDataUrl: m.logoDataUrl
      ? await compressImageDataUrl(m.logoDataUrl, { maxDim: 240, quality: 0.84, flattenWhite: true })
      : null,
    bakedWatermarkUrl: null
  };
  const wmType = m.watermarkType || 'logo';
  const wmSource = wmType === 'image' ? m.watermarkDataUrl : (wmType === 'logo' ? m.logoDataUrl : null);
  if (wmSource) {
    const targetDim = Math.min(420, Math.max(180, Number(m.watermarkSize || 300)));
    printAssets.bakedWatermarkUrl = await compressImageDataUrl(wmSource, {
      maxDim: targetDim,
      quality: 0.72,
      grayscale: (m.watermarkColor || 'color') === 'grayscale',
      opacity: Number(m.watermarkOpacity ?? 0.08),
      flattenWhite: true
    });
  } else if (wmType === 'text') {
    printAssets.bakedWatermarkUrl = await bakeTextWatermarkDataUrl(m);
  }

  const rankMapByKelas = new Map();
  const sheetsHtml = studentsList.map((st, idx) => {
    if (!st.rankOverride && st.kelas && !rankMapByKelas.has(st.kelas)) {
      rankMapByKelas.set(st.kelas, getClassRankMap(st.kelas));
    }
    const classRankMap = st.kelas ? (rankMapByKelas.get(st.kelas) || null) : null;
    return renderSingleRaporSheet(st, idx === studentsList.length - 1, printAssets, classRankMap);
  }).join('');
  const titleText = studentsList.length === 1
    ? `Rapor_${studentsList[0].nama}_${studentsList[0].kelas}`
    : `Rapor_Kelas_${state.selectedRaporKelas}_${studentsList.length}_Santri`;

  const baseOrigin = location.protocol !== 'file:' ? location.origin : '';
  const twTag = baseOrigin
    ? `<link rel="stylesheet" href="${baseOrigin}/assets/tailwind.min.css?v=1" onerror="var s=document.createElement('script');s.src='${baseOrigin}/vendor/tailwindcss.min.js';document.head.appendChild(s);" />`
    : `<script src="https://cdn.tailwindcss.com"><\/script>`;

  const docHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  ${baseOrigin ? `<base href="${baseOrigin}/" />` : ''}
  <title>${escapeHtml(titleText)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  ${twTag}
  <style>
    @page {
      size: A4 portrait;
      margin: 0.5cm 1.5cm 0.5cm 1.5cm;
    }
    @media print {
      .no-print { display: none !important; }
      *, *::before, *::after { box-sizing: border-box !important; }
      html, body {
        display: block !important;
        background: #fff !important;
        color: #000 !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      #rapor-print-area, #rapor-print-area > div {
        border: none !important;
        box-shadow: none !important;
        max-width: 100% !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .rapor-sheet-a4 {
        min-height: 282mm !important;
        display: flex !important;
        flex-direction: column !important;
      }
      .rapor-sheet-inner {
        display: flex !important;
        flex-direction: column !important;
      }
      .rapor-table {
        border-collapse: collapse !important;
        table-layout: fixed !important;
        width: 100% !important;
        border: 1pt solid #000 !important;
      }
      .rapor-table th, .rapor-table td {
        border: 1pt solid #000 !important;
      }
      .rapor-page-break {
        page-break-after: always !important;
        break-after: page !important;
      }
      .rapor-score-below-kkm {
        color: #d90000 !important;
        font-weight: 700 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    .rapor-table {
      border-collapse: collapse !important;
      table-layout: fixed !important;
      width: 100% !important;
      border: 1px solid #1e293b !important;
    }
    .rapor-table th, .rapor-table td {
      border: 1px solid #1e293b !important;
      padding: 2.5px 5px;
      line-height: 1.15;
    }
    .rapor-score-below-kkm {
      color: #d90000 !important;
      font-weight: 700 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .arabic-font { font-family: "Amiri", "Noto Naskh Arabic", "Traditional Arabic", "Scheherazade New", serif; }
  </style>
</head>
<body class="bg-[#f7f3ea] text-slate-900 min-h-screen py-4">
  <div class="no-print max-w-[210mm] mx-auto mb-4 bg-white border border-[#e7dcc3] rounded-lg shadow-sm px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
    <div class="font-bold text-[#0f4c3a]">
      Pratinjau Cetak Rapor (${studentsList.length} santri) • ${escapeHtml(state.pesantren.nama)}
    </div>
    <div class="flex items-center gap-2">
      <button onclick="window.print()" class="px-4 py-1.5 rounded bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold shadow-sm">Cetak / Simpan PDF</button>
      <button onclick="window.close()" class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold">Tutup Tab</button>
    </div>
  </div>
  <div id="rapor-print-area">
    ${sheetsHtml}
  </div>
  <script>
    function fitRaporToA4() {
      const maxPrintablePx = 1055; // ~279mm (pas 1 halaman A4 dengan margin atas/bawah 0.5cm)
      document.querySelectorAll('.rapor-sheet-a4').forEach(sheet => {
        const inner = sheet.querySelector('.rapor-sheet-inner');
        if (!inner) return;
        inner.style.zoom = '1';
        const h = inner.scrollHeight;
        if (h > maxPrintablePx) {
          inner.style.zoom = String((maxPrintablePx / h).toFixed(4));
        }
      });
    }
    window.addEventListener('load', () => {
      setTimeout(() => {
        fitRaporToA4();
        ${autoPrint ? 'setTimeout(() => window.print(), 200);' : ''}
      }, 250);
    });
    window.addEventListener('beforeprint', fitRaporToA4);
  <\/script>
</body>
</html>`;

  win.document.open();
  win.document.write(docHtml);
  win.document.close();
}

function previewSingleRapor(studentId) {
  const st = state.students.find(s => s.id === studentId);
  if (!st) return;
  openRaporInNewTab([st], false);
}

function printSingleRapor(studentId) {
  const st = state.students.find(s => s.id === studentId);
  if (!st) return;
  openRaporInNewTab([st], true);
}

function previewAllRapor() {
  const classStudents = state.students.filter(st => st.kelas === state.selectedRaporKelas);
  openRaporInNewTab(classStudents, false);
}

function printAllRapor() {
  const classStudents = state.students.filter(st => st.kelas === state.selectedRaporKelas);
  openRaporInNewTab(classStudents, true);
}

// ===================== CETAK RANKING (SORTABLE) =====================
const RANKING_COLUMNS = [
  { key: 'no', label: 'No', width: '6%', align: 'center' },
  { key: 'nama', label: 'Nama', width: '33%', align: 'left' },
  { key: 'avgUmum', label: 'Rata-rata Umum', width: '12%', align: 'center' },
  { key: 'avgSyari', label: "Rata-rata Ilmu Syar'i", width: '14%', align: 'center' },
  { key: 'totalWeighted', label: 'Total Terbobot', width: '13%', align: 'center' },
  { key: 'avg', label: 'Rata-rata', width: '13%', align: 'center' },
  { key: 'rank', label: 'Rank', width: '9%', align: 'center' }
];

function switchRaporSubTab(tab) {
  navigate(tab === 'ranking' ? 'cetak-ranking' : 'rapor-siswa');
}

function getDefaultRankingSortDir(colKey) {
  return ['avgUmum', 'avgSyari', 'totalWeighted', 'avg'].includes(colKey) ? 'desc' : 'asc';
}

function getRankingSortLabel(sortKey, sortDir) {
  const col = RANKING_COLUMNS.find(c => c.key === sortKey) || RANKING_COLUMNS.find(c => c.key === 'rank') || RANKING_COLUMNS[RANKING_COLUMNS.length - 1];
  const isDesc = sortDir === 'desc';
  if (sortKey === 'nama') return `${col.label} (${isDesc ? 'Z → A' : 'A → Z'})`;
  if (sortKey === 'rank' || sortKey === 'no') return `${col.label} (${isDesc ? 'Terakhir → Pertama' : '1 → Terakhir'})`;
  return `${col.label} (${isDesc ? 'Tertinggi → Terendah' : 'Terendah → Tertinggi'})`;
}

function buildRankingRowsForClass(kelasKode) {
  if (!kelasKode) return [];
  const classStudents = (state.students || []).filter(st => st.kelas === kelasKode);
  const rankMap = getClassRankMap(kelasKode);
  const rows = classStudents.map(st => {
    const entry = !st.rankOverride ? rankMap.byId.get(st.id) : null;
    const t = entry ? entry.totals : computeStudentTotals(st, rankMap.classCtx);
    const r = st.rankOverride || (entry ? { rank: entry.rank, totalStudents: entry.totalStudents } : getStudentRank(st.id));
    const rawRank = r && typeof r === 'object' ? r.rank : r;
    const rankNum = Number.isFinite(Number(rawRank)) ? Number(rawRank) : null;
    return {
      id: st.id,
      nama: String(st.nama || ''),
      avgUmum: t.hasUmumScore && t.avgUmum !== null ? t.avgUmum : null,
      avgSyari: t.hasSyariScore && t.avgSyari !== null ? t.avgSyari : null,
      avg: t.hasAnyScore ? t.avg : null,
      totalWeighted: t.hasAnyScore ? t.totalWeighted : null,
      syariWeighted: t.syariWeighted,
      hasAnyScore: t.hasAnyScore,
      scoredCount: t.scoredCount,
      classScoredCount: t.classScoredCount,
      classScoredJam: t.classScoredJam,
      missingFromClassCount: t.missingFromClassCount,
      missingSubjectsLabel: (t.missingSubjectNames || []).join(', '),
      rank: t.hasAnyScore ? rankNum : null
    };
  });

  rows.sort((a, b) => {
    if (a.hasAnyScore !== b.hasAnyScore) return a.hasAnyScore ? -1 : 1;
    if (a.hasAnyScore) {
      const ra = a.rank !== null ? a.rank : Number.MAX_SAFE_INTEGER;
      const rb = b.rank !== null ? b.rank : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      if ((b.totalWeighted ?? 0) !== (a.totalWeighted ?? 0)) return (b.totalWeighted ?? 0) - (a.totalWeighted ?? 0);
      if (b.syariWeighted !== a.syariWeighted) return b.syariWeighted - a.syariWeighted;
      const avga = a.avg ?? 0;
      const avgb = b.avg ?? 0;
      if (avgb !== avga) return avgb - avga;
    }
    return a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' });
  });

  rows.forEach((r, idx) => { r.defaultNo = idx + 1; });
  return rows;
}

function sortRankingRows(rows, sortKey = 'rank', sortDir = 'asc') {
  const list = Array.isArray(rows) ? [...rows] : [];
  const dirMul = sortDir === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'no') {
      cmp = ((a.defaultNo || 0) - (b.defaultNo || 0)) * dirMul;
    } else if (sortKey === 'nama') {
      cmp = String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }) * dirMul;
    } else {
      const va = a[sortKey];
      const vb = b[sortKey];
      const aNull = va === null || va === undefined || !Number.isFinite(Number(va));
      const bNull = vb === null || vb === undefined || !Number.isFinite(Number(vb));
      if (aNull && bNull) cmp = 0;
      else if (aNull) return 1;
      else if (bNull) return -1;
      else cmp = (Number(va) - Number(vb)) * dirMul;
    }
    return cmp !== 0 ? cmp : ((a.defaultNo || 0) - (b.defaultNo || 0));
  });
  return list;
}

function renderRankingTableHeadHtml(sortKey, sortDir, handlerName = 'sortRankingPreview') {
  return `
    <tr class="bg-emerald-50/90 font-bold text-slate-900">
      ${RANKING_COLUMNS.map(col => {
        const isActive = sortKey === col.key;
        const icon = isActive ? (sortDir === 'desc' ? '▼' : '▲') : '⇅';
        const ariaSort = isActive ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none';
        const alignClass = col.align === 'left' ? 'text-left' : 'text-center';
        return `<th scope="col" tabindex="0" aria-sort="${ariaSort}" title="Klik untuk mengurutkan berdasarkan ${escapeHtml(col.label)}" onclick="${handlerName}('${col.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${handlerName}('${col.key}');}" class="ranking-sortable-th ${isActive ? 'is-sorted bg-emerald-100/80' : ''} ${alignClass}">${escapeHtml(col.label)}<span class="ranking-sort-icon no-print" aria-hidden="true">${icon}</span></th>`;
      }).join('')}
    </tr>
  `;
}

function renderRankingTableBodyHtml(sortedRows, kkm) {
  if (!sortedRows || sortedRows.length === 0) {
    return `<tr><td colspan="${RANKING_COLUMNS.length}" class="text-center italic py-4 text-slate-500">Belum ada data santri di kelas ini.</td></tr>`;
  }
  const fmtAvgCell = (val, boldClass = '') => {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return `<td class="text-center text-slate-400">–</td>`;
    const num = Number(val);
    const belowCls = num < kkm ? ' rapor-score-below-kkm' : '';
    return `<td class="text-center tabular-nums${boldClass ? ' ' + boldClass : ''}${belowCls}">${num.toFixed(2)}</td>`;
  };
  return sortedRows.map((r, idx) => {
    const incompleteBadge = (r.classScoredCount > 0 && r.missingFromClassCount > 0)
      ? (r.hasAnyScore
        ? `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 align-middle whitespace-nowrap" title="Nilai belum terisi: ${escapeHtml(r.missingSubjectsLabel || '-')}">⚠ ${r.scoredCount}/${r.classScoredCount} mapel</span>`
        : `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-300 align-middle whitespace-nowrap" title="Belum ada nilai masuk (${r.classScoredCount} mapel kelas belum terisi)">0/${r.classScoredCount} mapel</span>`)
      : '';
    return `
      <tr class="hover:bg-[#fbf8f1]">
        <td class="text-center tabular-nums">${idx + 1}</td>
        <td class="text-left font-semibold text-slate-900">${escapeHtml(r.nama)}${incompleteBadge}</td>
        ${fmtAvgCell(r.avgUmum)}
        ${fmtAvgCell(r.avgSyari)}
        <td class="text-center tabular-nums font-semibold">${r.totalWeighted !== null && r.totalWeighted !== undefined ? r.totalWeighted : '–'}</td>
        ${fmtAvgCell(r.avg, 'font-bold')}
        <td class="text-center font-bold tabular-nums">${r.rank !== null && r.rank !== undefined ? r.rank : '–'}</td>
      </tr>
    `;
  }).join('');
}

function updateRankingPreviewDom() {
  const thead = document.getElementById('ranking-preview-thead');
  const tbody = document.getElementById('ranking-preview-tbody');
  if (!thead || !tbody) {
    renderPage();
    return;
  }
  const rows = buildRankingRowsForClass(state.selectedRaporKelas);
  const sortKey = state.rankingSortKey || 'rank';
  const sortDir = state.rankingSortDir || 'asc';
  const sortedRows = sortRankingRows(rows, sortKey, sortDir);
  thead.innerHTML = renderRankingTableHeadHtml(sortKey, sortDir, 'sortRankingPreview');
  tbody.innerHTML = renderRankingTableBodyHtml(sortedRows, getActiveKkm());
  const statusEl = document.getElementById('ranking-preview-sort-status');
  if (statusEl) statusEl.textContent = getRankingSortLabel(sortKey, sortDir);
}

function sortRankingPreview(colKey) {
  if (state.rankingSortKey === colKey) {
    state.rankingSortDir = state.rankingSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.rankingSortKey = colKey;
    state.rankingSortDir = getDefaultRankingSortDir(colKey);
  }
  updateRankingPreviewDom();
}

function resetRankingPreviewSort() {
  state.rankingSortKey = 'rank';
  state.rankingSortDir = 'asc';
  updateRankingPreviewDom();
}

function renderRankingSheetHtml(kelasKode, rows, sortKey = 'rank', sortDir = 'asc', printAssets = null, handlerName = 'sortRankingPreview', isPreview = true) {
  const m = state.pesantren;
  const logoSrc = (printAssets && isSafeImageDataUrl(printAssets.logoDataUrl))
    ? printAssets.logoDataUrl
    : (isSafeImageDataUrl(m.logoDataUrl) ? m.logoDataUrl : null);
  const bakedWm = printAssets ? printAssets.bakedWatermarkUrl : null;
  const clsObj = (state.classes || []).find(c => c.kode === kelasKode);
  const wali = (clsObj && clsObj.waliId) ? (state.teachers || []).find(t => t.id === clsObj.waliId) : null;
  const waliNama = wali ? (wali.nama || wali.namaArab || '-') : '-';
  const tglIndo = formatTanggalIndo(m.tanggalIso);
  const kkm = getActiveKkm();
  const sortedRows = sortRankingRows(rows, sortKey, sortDir);
  const theadId = isPreview ? 'ranking-preview-thead' : 'ranking-print-thead';
  const tbodyId = isPreview ? 'ranking-preview-tbody' : 'ranking-print-tbody';
  const classScoredCount = rows && rows.length > 0 ? (Number(rows[0].classScoredCount) || 0) : 0;
  const classScoredJam = rows && rows.length > 0 ? (Number(rows[0].classScoredJam) || 0) : 0;

  return `
    <div id="ranking-sheet" class="relative overflow-hidden bg-white rounded border border-slate-300 shadow-sm p-6 max-w-[210mm] mx-auto text-slate-900">
      ${renderWatermarkOverlay(m, 1, bakedWm)}
      <div class="ranking-sheet-inner relative z-10">
        <!-- KOP SURAT RESMI (MATCH RAPOR) -->
        <div class="border-b-2 border-slate-900 pb-2 mb-3 flex items-center justify-between gap-3">
          <div class="w-20 h-20 flex items-center justify-center flex-shrink-0">
            ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Logo Pesantren" class="max-h-20 max-w-20 object-contain" />` : `<div class="w-16 h-16 rounded-full border-2 border-emerald-800 flex items-center justify-center font-bold text-xs text-emerald-800">RDP</div>`}
          </div>
          <div class="text-center flex-1">
            <div class="arabic-font text-[25px] font-bold leading-none" dir="rtl">${escapeHtml(m.namaArab)}</div>
            <div class="text-[12.5px] font-sans font-bold uppercase tracking-wider text-slate-800 mt-0.5">${escapeHtml(m.nama)}</div>
            <div class="text-[11px] font-sans text-slate-600 leading-tight">${escapeHtml(m.alamat)} • NSPP: ${escapeHtml(m.nspp)}${m.npsn ? ` • NPSN: ${escapeHtml(m.npsn)}` : ''}</div>
          </div>
          <div class="w-20 flex-shrink-0"></div>
        </div>

        <h2 class="text-center text-base font-bold uppercase tracking-wide underline underline-offset-4 mb-2.5">DAFTAR RANKING / PERINGKAT SANTRI</h2>

        <!-- HEADER IDENTITAS KELAS (2 BARIS) -->
        <div class="mb-3 px-3 py-2 rounded border border-slate-800 text-xs bg-slate-50/70">
          <table class="ranking-meta-table w-full border-collapse">
            <tr>
              <td class="py-0.5 pr-2 font-semibold w-24 whitespace-nowrap">Kelas</td>
              <td class="py-0.5 pr-2 w-3">:</td>
              <td class="py-0.5 pr-4 font-bold">Kelas ${escapeHtml(kelasKode)}</td>
              <td class="py-0.5 pr-2 font-semibold w-24 whitespace-nowrap">Tahun Ajaran</td>
              <td class="py-0.5 pr-2 w-3">:</td>
              <td class="py-0.5 font-bold">${escapeHtml(m.tahun || '-')}</td>
            </tr>
            <tr>
              <td class="py-0.5 pr-2 font-semibold whitespace-nowrap">Wali Kelas</td>
              <td class="py-0.5 pr-2">:</td>
              <td class="py-0.5 pr-4 font-bold">${escapeHtml(waliNama)}</td>
              <td class="py-0.5 pr-2 font-semibold whitespace-nowrap">Semester</td>
              <td class="py-0.5 pr-2">:</td>
              <td class="py-0.5 font-bold">${escapeHtml(m.semester || '-')}</td>
            </tr>
          </table>
        </div>

        <!-- TABEL RANKING SORTABLE -->
        <table class="ranking-table w-full border-collapse text-[12px]">
          <colgroup>
            ${RANKING_COLUMNS.map(col => `<col style="width: ${col.width};" />`).join('')}
          </colgroup>
          <thead id="${theadId}">
            ${renderRankingTableHeadHtml(sortKey, sortDir, handlerName)}
          </thead>
          <tbody id="${tbodyId}">
            ${renderRankingTableBodyHtml(sortedRows, kkm)}
          </tbody>
        </table>
        ${classScoredCount > 0 ? `
          <div class="mt-2 text-[10.5px] text-slate-600 leading-snug">
            Basis perhitungan kelas: <strong>${classScoredCount} mapel terisi (${classScoredJam} jam berbobot)</strong>. Nilai mapel yang belum terisi dihitung 0 dalam pembagi rata-rata kelas agar konsisten dengan Total Terbobot &amp; Ranking.
          </div>
        ` : ''}

        <!-- FOOTER TANGGAL & TANDA TANGAN WALI KELAS -->
        <div class="ranking-sign-block mt-6 flex justify-end text-xs">
          <div class="w-64 text-center leading-snug">
            <div>Kebarongan, ${escapeHtml(tglIndo)}</div>
            <div class="font-bold mt-0.5">Wali Kelas ${escapeHtml(kelasKode)},</div>
            <div class="ranking-sign-space h-16"></div>
            ${wali && (wali.nama || wali.namaArab)
              ? `<div class="font-bold underline">${escapeHtml(wali.nama || wali.namaArab)}</div>`
              : `<div class="font-semibold">( ................................ )</div>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function openCetakRankingTab(autoPrint = false) {
  const kelasKode = state.selectedRaporKelas;
  if (!kelasKode) {
    showToast('Pilih kelas terlebih dahulu');
    return;
  }
  const rows = buildRankingRowsForClass(kelasKode);
  if (rows.length === 0) {
    showToast(`Belum ada data santri di kelas ${kelasKode}`);
    return;
  }

  // Buka tab baru secara sinkron sebelum await agar tidak diblokir popup blocker
  const win = window.open('', '_blank');
  if (!win) {
    showToast('Pop-up diblokir browser. Izinkan pop-up untuk membuka Cetak Ranking.');
    return;
  }

  const m = state.pesantren;
  const printAssets = {
    logoDataUrl: isSafeImageDataUrl(m.logoDataUrl) ? m.logoDataUrl : null,
    bakedWatermarkUrl: null
  };
  try {
    if (isSafeImageDataUrl(m.logoDataUrl)) {
      const compressedLogo = await compressImageDataUrl(m.logoDataUrl, { maxDim: 240, quality: 0.84, flattenWhite: true });
      if (isSafeImageDataUrl(compressedLogo)) printAssets.logoDataUrl = compressedLogo;
    }
    const wmType = m.watermarkType || 'logo';
    const wmSource = wmType === 'image' ? m.watermarkDataUrl : (wmType === 'logo' ? m.logoDataUrl : null);
    if (isSafeImageDataUrl(wmSource)) {
      const targetDim = Math.min(420, Math.max(180, Number(m.watermarkSize || 300)));
      printAssets.bakedWatermarkUrl = await compressImageDataUrl(wmSource, {
        maxDim: targetDim,
        quality: 0.72,
        grayscale: (m.watermarkColor || 'color') === 'grayscale',
        opacity: Number(m.watermarkOpacity ?? 0.08),
        flattenWhite: true
      });
    } else if (wmType === 'text') {
      printAssets.bakedWatermarkUrl = await bakeTextWatermarkDataUrl(m);
    }
  } catch (e) { /* fallback ke logo mentah / tanpa watermark */ }

  const sortKey = state.rankingSortKey || 'rank';
  const sortDir = state.rankingSortDir || 'asc';
  const kkm = getActiveKkm();
  const incompleteRows = rows.filter(r => r.classScoredCount > 0 && r.missingFromClassCount > 0);
  const sheetHtml = renderRankingSheetHtml(kelasKode, rows, sortKey, sortDir, printAssets, 'sortRankingTable', false);
  const initialSortLabel = getRankingSortLabel(sortKey, sortDir);

  const initialPayloadJson = JSON.stringify({ rows, sortKey, sortDir, kkm })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const baseOrigin = location.protocol !== 'file:' ? location.origin : '';
  const twTag = baseOrigin
    ? `<link rel="stylesheet" href="${baseOrigin}/assets/tailwind.min.css?v=1" onerror="var s=document.createElement('script');s.src='${baseOrigin}/vendor/tailwindcss.min.js';document.head.appendChild(s);" />`
    : `<script src="https://cdn.tailwindcss.com"><\/script>`;
  const safeDocTitle = `Ranking_Kelas_${String(kelasKode).replace(/\s+/g, '_')}_${String(m.tahun || '').replace('/', '_')}`;

  const docHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  ${baseOrigin ? `<base href="${baseOrigin}/" />` : ''}
  <title>${escapeHtml(safeDocTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  ${twTag}
  <style>
    @page {
      size: A4 portrait;
      margin: 1cm 1.5cm 1cm 1.5cm;
    }
    @media print {
      .no-print { display: none !important; }
      html, body {
        background: #fff !important;
        color: #000 !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      #ranking-sheet {
        border: none !important;
        box-shadow: none !important;
        max-width: 100% !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .ranking-table {
        border-collapse: collapse !important;
        table-layout: fixed !important;
        width: 100% !important;
        border: 1pt solid #000 !important;
      }
      .ranking-table th, .ranking-table td {
        border: 1pt solid #000 !important;
      }
      .ranking-table thead { display: table-header-group; }
      .ranking-table tr, .ranking-sign-block {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .rapor-score-below-kkm {
        color: #d90000 !important;
        font-weight: 700 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    .ranking-table {
      border-collapse: collapse !important;
      table-layout: fixed !important;
      width: 100% !important;
      border: 1px solid #1e293b !important;
    }
    .ranking-table th, .ranking-table td {
      border: 1px solid #1e293b !important;
      padding: 4px 7px;
      line-height: 1.3;
    }
    .ranking-sortable-th {
      cursor: pointer;
      user-select: none;
      transition: background-color 0.15s;
    }
    .ranking-sortable-th:hover {
      background-color: #d1fae5;
    }
    .ranking-sort-icon {
      display: inline-block;
      margin-left: 4px;
      font-size: 10px;
      opacity: 0.45;
    }
    .ranking-sortable-th.is-sorted .ranking-sort-icon {
      opacity: 1;
      color: #0f4c3a;
    }
    .rapor-score-below-kkm {
      color: #d90000 !important;
      font-weight: 700 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .arabic-font { font-family: "Amiri", "Noto Naskh Arabic", "Traditional Arabic", "Scheherazade New", serif; }

    /* ============ DESIGN SYSTEM TOKENS & AKSESIBILITAS ============ */
    :root {
      --rdp-bg-canvas: #f7f3ea;
      --rdp-bg-surface: #ffffff;
      --rdp-bg-subtle: #fbf8f1;
      --rdp-border: #e7dcc3;
      --rdp-primary: #0f4c3a;
      --rdp-primary-hover: #0b3b2e;
      --rdp-primary-mid: #136048;
      --rdp-accent: #c9a227;
      --rdp-accent-dark: #a07d18;
      --rdp-text: #0f4c3a;
      --rdp-text-muted: #52635c;
      --rdp-radius-card: 0.75rem;
      --rdp-radius-control: 0.5rem;
    }
    body {
      font-family: "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    @media screen {
      button:focus-visible,
      a:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible,
      [tabindex]:focus-visible {
        outline: 2px solid var(--rdp-accent);
        outline-offset: 2px;
      }
    }
    .rdp-card {
      background: var(--rdp-bg-surface);
      border: 1px solid var(--rdp-border);
      border-radius: var(--rdp-radius-card);
      box-shadow: 0 1px 2px rgba(15, 76, 58, 0.05);
    }
    @keyframes rdpShimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .rdp-skeleton {
      background: linear-gradient(90deg, #efe7d6 25%, #f9f5eb 50%, #efe7d6 75%);
      background-size: 200% 100%;
      animation: rdpShimmer 1.4s ease-in-out infinite;
    }
    .rdp-btn-busy {
      opacity: 0.72 !important;
      cursor: wait !important;
    }
    .rdp-table-sticky thead th {
      position: sticky;
      top: 0;
      z-index: 5;
      box-shadow: inset 0 -1px 0 var(--rdp-border);
    }
    .rdp-table-wrap {
      overflow-x: auto;
      overflow-y: auto;
      max-height: 70vh;
    }
    .rdp-input,
    .rdp-select {
      border-color: var(--rdp-border);
      border-radius: var(--rdp-radius-control);
      background-color: var(--rdp-bg-surface);
    }
    .rdp-skip-link {
      position: fixed;
      top: -100%;
      left: 0.75rem;
      z-index: 100;
      padding: 0.625rem 1rem;
      border-radius: 0.5rem;
      background-color: var(--rdp-primary);
      color: #f3e3b0;
      font-size: 0.75rem;
      font-weight: 700;
      border: 2px solid var(--rdp-accent);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      transition: top 0.15s ease;
    }
    .rdp-skip-link:focus {
      top: 0.75rem;
    }
    @media (prefers-reduced-motion: reduce) {
      .rdp-skeleton {
        animation: none !important;
      }
      #sidebar,
      #sidebar-collapse-icon,
      .sidebar-chevron,
      .rdp-skip-link,
      button,
      a {
        transition-duration: 0.01ms !important;
      }
    }
    /* Samakan lebar konten layar dengan area cetak A4 (210mm - margin 2 x 15mm = 180mm) agar pengukuran auto 1 halaman akurat */
    @media screen {
      #ranking-sheet {
        width: 210mm !important;
        max-width: 210mm !important;
        padding: 10mm 15mm !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body class="bg-[#f7f3ea] text-slate-900 min-h-screen py-4">
  <div class="no-print max-w-[210mm] mx-auto mb-4 bg-white border border-[#e7dcc3] rounded-lg shadow-sm px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
    <div>
      <div class="font-bold text-[#0f4c3a]">Daftar Ranking Kelas ${escapeHtml(kelasKode)} (${rows.length} santri) • ${escapeHtml(m.nama)}</div>
      <div class="text-[11px] text-slate-500">Klik header kolom tabel untuk mengurutkan. Urutan aktif: <strong id="ranking-sort-status" class="text-[#0f4c3a]">${escapeHtml(initialSortLabel)}</strong></div>
      ${incompleteRows.length > 0 ? `<div class="mt-1 text-[11px] text-amber-800 font-semibold">⚠ ${incompleteRows.length} santri belum memiliki nilai lengkap pada ${rows[0].classScoredCount} mapel kelas (${incompleteRows.slice(0, 3).map(r => escapeHtml(r.nama) + ' ' + r.scoredCount + '/' + r.classScoredCount).join(', ')}${incompleteRows.length > 3 ? `, +${incompleteRows.length - 3} lainnya` : ''}).</div>` : ''}
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#136048] bg-emerald-50 text-[#0f4c3a] font-semibold cursor-pointer" title="Perkecil jarak baris & ukuran font tabel bila perlu agar muat 1 halaman A4">
        <input type="checkbox" id="fit-one-page" checked onchange="fitRankingToOnePage()" />
        Auto 1 halaman
      </label>
      <span id="ranking-fit-info" class="text-[11px] text-slate-500"></span>
      <button type="button" onclick="resetRankingSort()" class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold">Reset Urutan (Rank 1–N)</button>
      <button type="button" onclick="window.print()" class="px-4 py-1.5 rounded bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold shadow-sm">Cetak / Simpan PDF</button>
      <button type="button" onclick="window.close()" class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold">Tutup Tab</button>
    </div>
  </div>

  ${sheetHtml}

  <script>
    const __RANKING_STATE = ${initialPayloadJson};
    const __RANKING_COLS = [
      { key: 'no', label: 'No', align: 'center' },
      { key: 'nama', label: 'Nama', align: 'left' },
      { key: 'avgUmum', label: 'Rata-rata Umum', align: 'center' },
      { key: 'avgSyari', label: "Rata-rata Ilmu Syar'i", align: 'center' },
      { key: 'totalWeighted', label: 'Total Terbobot', align: 'center' },
      { key: 'avg', label: 'Rata-rata', align: 'center' },
      { key: 'rank', label: 'Rank', align: 'center' }
    ];
    function esc(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, function(ch) {
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
      });
    }
    function getDefaultDir(key) {
      return (key === 'avgUmum' || key === 'avgSyari' || key === 'totalWeighted' || key === 'avg') ? 'desc' : 'asc';
    }
    function getSortLabel(key, dir) {
      const col = __RANKING_COLS.find(c => c.key === key) || __RANKING_COLS[__RANKING_COLS.length - 1];
      const isDesc = dir === 'desc';
      if (key === 'nama') return col.label + ' (' + (isDesc ? 'Z → A' : 'A → Z') + ')';
      if (key === 'rank' || key === 'no') return col.label + ' (' + (isDesc ? 'Terakhir → Pertama' : '1 → Terakhir') + ')';
      return col.label + ' (' + (isDesc ? 'Tertinggi → Terendah' : 'Terendah → Tertinggi') + ')';
    }
    function sortRows(rows, key, dir) {
      const list = rows.slice();
      const dirMul = dir === 'desc' ? -1 : 1;
      list.sort(function(a, b) {
        let cmp = 0;
        if (key === 'no') {
          cmp = ((a.defaultNo || 0) - (b.defaultNo || 0)) * dirMul;
        } else if (key === 'nama') {
          cmp = String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { sensitivity: 'base' }) * dirMul;
        } else {
          const va = a[key];
          const vb = b[key];
          const aNull = va === null || va === undefined || !Number.isFinite(Number(va));
          const bNull = vb === null || vb === undefined || !Number.isFinite(Number(vb));
          if (aNull && bNull) cmp = 0;
          else if (aNull) return 1;
          else if (bNull) return -1;
          else cmp = (Number(va) - Number(vb)) * dirMul;
        }
        return cmp !== 0 ? cmp : ((a.defaultNo || 0) - (b.defaultNo || 0));
      });
      return list;
    }
    function onThKey(ev, colKey) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        sortRankingTable(colKey);
      }
    }
    function renderTable() {
      const thead = document.getElementById('ranking-print-thead');
      const tbody = document.getElementById('ranking-print-tbody');
      const statusEl = document.getElementById('ranking-sort-status');
      const key = __RANKING_STATE.sortKey || 'rank';
      const dir = __RANKING_STATE.sortDir || 'asc';
      const kkm = Number(__RANKING_STATE.kkm) || 0;
      if (thead) {
        thead.innerHTML = '<tr class="bg-emerald-50/90 font-bold text-slate-900">' + __RANKING_COLS.map(function(col) {
          const active = key === col.key;
          const icon = active ? (dir === 'desc' ? '▼' : '▲') : '⇅';
          const ariaSort = active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none';
          const alignClass = col.align === 'left' ? 'text-left' : 'text-center';
          return '<th scope="col" tabindex="0" data-col="' + esc(col.key) + '" aria-sort="' + ariaSort + '" title="Klik untuk mengurutkan berdasarkan ' + esc(col.label) + '" onclick="sortRankingTable(this.dataset.col)" onkeydown="onThKey(event,this.dataset.col)" class="ranking-sortable-th ' + (active ? 'is-sorted bg-emerald-100/80 ' : '') + alignClass + '">' + esc(col.label) + '<span class="ranking-sort-icon no-print" aria-hidden="true">' + icon + '</span></th>';
        }).join('') + '</tr>';
      }
      if (tbody) {
        const sorted = sortRows(__RANKING_STATE.rows, key, dir);
        const fmtCell = function(val, boldCls) {
          if (val === null || val === undefined || !Number.isFinite(Number(val))) return '<td class="text-center text-slate-400">–</td>';
          const num = Number(val);
          const cls = 'text-center tabular-nums' + (boldCls ? ' ' + boldCls : '') + (num < kkm ? ' rapor-score-below-kkm' : '');
          return '<td class="' + cls + '">' + num.toFixed(2) + '</td>';
        };
        tbody.innerHTML = sorted.map(function(r, idx) {
          const incompleteBadge = (r.classScoredCount > 0 && r.missingFromClassCount > 0)
            ? (r.hasAnyScore
              ? '<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 align-middle whitespace-nowrap" title="Nilai belum terisi: ' + esc(r.missingSubjectsLabel || '-') + '">⚠ ' + r.scoredCount + '/' + r.classScoredCount + ' mapel</span>'
              : '<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-300 align-middle whitespace-nowrap" title="Belum ada nilai masuk (' + r.classScoredCount + ' mapel kelas belum terisi)">0/' + r.classScoredCount + ' mapel</span>')
            : '';
          return '<tr class="hover:bg-[#fbf8f1]">' +
            '<td class="text-center tabular-nums">' + (idx + 1) + '</td>' +
            '<td class="text-left font-semibold text-slate-900">' + esc(r.nama) + incompleteBadge + '</td>' +
            fmtCell(r.avgUmum, '') +
            fmtCell(r.avgSyari, '') +
            '<td class="text-center tabular-nums font-semibold">' + (r.totalWeighted !== null && r.totalWeighted !== undefined ? r.totalWeighted : '–') + '</td>' +
            fmtCell(r.avg, 'font-bold') +
            '<td class="text-center font-bold tabular-nums">' + (r.rank !== null && r.rank !== undefined ? r.rank : '–') + '</td>' +
          '</tr>';
        }).join('');
      }
      if (statusEl) statusEl.textContent = getSortLabel(key, dir);
      fitRankingToOnePage();
    }
    // ===== Auto 1 halaman A4: perkecil jarak baris & font tabel bertahap, lalu zoom bila masih belum muat =====
    const __AUTO_PRINT = ${autoPrint ? 'true' : 'false'};
    const __MAX_PRINT_PX = Math.floor(277 * 96 / 25.4) - 10; // tinggi area cetak A4 (297mm - margin 2 x 10mm)
    const __FIT_LEVELS = [
      { fs: 12, pad: 4, lh: 1.3, sign: 64 },
      { fs: 11.5, pad: 3, lh: 1.25, sign: 56 },
      { fs: 11, pad: 2.5, lh: 1.2, sign: 52 },
      { fs: 10.5, pad: 2, lh: 1.15, sign: 48 },
      { fs: 10, pad: 1.5, lh: 1.12, sign: 44 },
      { fs: 9.5, pad: 1, lh: 1.1, sign: 40 },
      { fs: 9, pad: 0.75, lh: 1.05, sign: 36 },
      { fs: 8.5, pad: 0.5, lh: 1.02, sign: 34 },
      { fs: 8, pad: 0.5, lh: 1.0, sign: 32 }
    ];
    function applyFitLevel(lv) {
      let st = document.getElementById('ranking-fit-style');
      if (!st) {
        st = document.createElement('style');
        st.id = 'ranking-fit-style';
        document.head.appendChild(st);
      }
      st.textContent = lv
        ? '.ranking-table{font-size:' + lv.fs + 'px !important}' +
          '.ranking-table th,.ranking-table td{padding-top:' + lv.pad + 'px !important;padding-bottom:' + lv.pad + 'px !important;line-height:' + lv.lh + ' !important}' +
          '.ranking-sign-space{height:' + lv.sign + 'px !important}'
        : '';
    }
    function fitRankingToOnePage() {
      const inner = document.querySelector('.ranking-sheet-inner');
      const info = document.getElementById('ranking-fit-info');
      if (!inner) return;
      inner.style.zoom = '1';
      const box = document.getElementById('fit-one-page');
      if (box && !box.checked) {
        applyFitLevel(null);
        if (info) info.textContent = '';
        return;
      }
      let used = __FIT_LEVELS[0];
      for (let i = 0; i < __FIT_LEVELS.length; i++) {
        used = __FIT_LEVELS[i];
        applyFitLevel(used);
        if (inner.scrollHeight <= __MAX_PRINT_PX) break;
      }
      let zoom = 1;
      const h = inner.scrollHeight;
      if (h > __MAX_PRINT_PX) {
        zoom = __MAX_PRINT_PX / h;
        inner.style.zoom = zoom.toFixed(4);
      }
      if (info) {
        info.textContent = (used === __FIT_LEVELS[0] && zoom === 1)
          ? 'Sudah muat 1 halaman'
          : ('Font tabel ' + used.fs + 'px' + (zoom < 1 ? ', skala ' + Math.round(zoom * 100) + '%' : ''));
      }
    }
    window.addEventListener('load', function() {
      setTimeout(function() {
        fitRankingToOnePage();
        if (__AUTO_PRINT) setTimeout(function() { window.print(); }, 200);
      }, 250);
    });
    window.addEventListener('beforeprint', fitRankingToOnePage);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() { fitRankingToOnePage(); });
    }
    function sortRankingTable(colKey) {
      if (__RANKING_STATE.sortKey === colKey) {
        __RANKING_STATE.sortDir = __RANKING_STATE.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        __RANKING_STATE.sortKey = colKey;
        __RANKING_STATE.sortDir = getDefaultDir(colKey);
      }
      renderTable();
    }
    function resetRankingSort() {
      __RANKING_STATE.sortKey = 'rank';
      __RANKING_STATE.sortDir = 'asc';
      renderTable();
    }
  <\/script>
</body>
</html>`;

  win.document.open();
  win.document.write(docHtml);
  win.document.close();
}

function renderWatermarkOverlay(m, scale = 1, bakedWatermarkUrl = null) {
  const wmType = m.watermarkType || 'logo';
  if (wmType === 'none') return '';
  const opacity = Number(m.watermarkOpacity ?? 0.08);
  const size = Math.round(Math.min(560, Math.max(100, Number(m.watermarkSize || 300))) * scale);
  const rawFontSize = Math.min(64, Math.max(12, Number(m.watermarkFontSize || 24)));
  const fontSize = Math.max(6, Math.round(rawFontSize * scale));
  const isGray = (m.watermarkColor || 'color') === 'grayscale';
  const filterCss = isGray ? 'filter: grayscale(100%); -webkit-filter: grayscale(100%);' : '';

  if (bakedWatermarkUrl && isSafeImageDataUrl(bakedWatermarkUrl) && (wmType === 'image' || wmType === 'logo')) {
    return `
      <div class="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden">
        <img src="${escapeHtml(bakedWatermarkUrl)}" alt="" aria-hidden="true" style="width:${size}px; height:${size}px;" class="object-contain" />
      </div>
    `;
  }
  if (bakedWatermarkUrl && isSafeImageDataUrl(bakedWatermarkUrl) && wmType === 'text') {
    return `
      <div class="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden">
        <img src="${escapeHtml(bakedWatermarkUrl)}" alt="" aria-hidden="true" class="w-full h-full object-cover" />
      </div>
    `;
  }

  if (wmType === 'image') {
    if (!isSafeImageDataUrl(m.watermarkDataUrl)) return '';
    return `
      <div class="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden" style="opacity: ${opacity};">
        <img src="${escapeHtml(m.watermarkDataUrl)}" alt="" aria-hidden="true" style="width:${size}px; height:${size}px; ${filterCss}" class="object-contain" />
      </div>
    `;
  }
  if (wmType === 'logo') {
    if (!isSafeImageDataUrl(m.logoDataUrl)) return '';
    return `
      <div class="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden" style="opacity: ${opacity};">
        <img src="${escapeHtml(m.logoDataUrl)}" alt="" aria-hidden="true" style="width:${size}px; height:${size}px; ${filterCss}" class="object-contain" />
      </div>
    `;
  }

  // Mode Teks Watermark (berulang dalam satu baris sekaligus berulang ke bawah memenuhi halaman A4)
  const text = (m.watermarkText && m.watermarkText.trim()) ? m.watermarkText.trim() : (m.namaArab || m.nama);
  const gapX = Math.max(12, Math.round(28 * scale));
  const gapY = Math.max(10, Math.round(24 * scale));
  const rowItems = Array.from({ length: 10 }, () => `<span class="whitespace-nowrap font-bold">${escapeHtml(text)}</span>`).join('');
  const rowsHtml = Array.from({ length: 24 }, (_, idx) =>
    `<div class="flex flex-nowrap items-center justify-center whitespace-nowrap" style="gap:${gapX}px; ${idx % 2 === 1 ? `margin-left:${Math.round(gapX * 1.5)}px;` : ''}">${rowItems}</div>`
  ).join('');
  return `
    <div class="pointer-events-none select-none absolute inset-0 overflow-hidden z-0 flex items-center justify-center" style="opacity: ${opacity};">
      <div style="font-size:${fontSize}px; row-gap:${gapY}px; ${filterCss}; width: 220%; height: 220%; transform: rotate(-24deg);" class="flex flex-col items-center justify-center text-center arabic-font">
        ${rowsHtml}
      </div>
    </div>
  `;
}


function renderSingleRaporSheet(s, isLastPage, printAssets = null, classRankMap = null) {
  const m = state.pesantren;
  const logoSrc = (printAssets && isSafeImageDataUrl(printAssets.logoDataUrl))
    ? printAssets.logoDataUrl
    : (isSafeImageDataUrl(m.logoDataUrl) ? m.logoDataUrl : null);
  const bakedWm = printAssets ? printAssets.bakedWatermarkUrl : null;
  const effSubjects = getEffectiveSubjects(s && s.kelas ? s.kelas : null);
  const umum = effSubjects.filter(x => x.kelompok === 'umum');
  const syari = effSubjects.filter(x => x.kelompok === 'syari');
  const rankEntry = (classRankMap && !s.rankOverride) ? classRankMap.byId.get(s.id) : null;
  const { totalWeighted, avg, hasAnyScore } = rankEntry ? rankEntry.totals : computeStudentTotals(s);
  const { rank, totalStudents } = s.rankOverride || (rankEntry ? { rank: rankEntry.rank, totalStudents: rankEntry.totalStudents } : getStudentRank(s.id));
  const clsObj = state.classes.find(c => c.kode === s.kelas);
  const wali = (clsObj && clsObj.waliId) ? state.teachers.find(t => t.id === clsObj.waliId) : null;
  const kkm = Number.isFinite(Number(state.bobot && state.bobot.kkm)) ? Number(state.bobot.kkm) : 75;
  const raporTahun = (s.archiveNotice && s.archiveNotice.archivedTahun) || m.tahun;
  const raporSemesterArab = (s.archiveNotice && s.archiveNotice.archivedSemester)
    ? (s.archiveNotice.archivedSemester === 'Genap' ? 'الثاني' : 'الأول')
    : m.semesterArab;

  const renderGroupRows = (list) => {
    let sumJam = 0, sumWeighted = 0, hasGroupScore = false;
    const rows = list.map((sub, i) => {
      const rawScore = s.scores ? s.scores[sub.id] : undefined;
      const hasVal = hasScoreValue(rawScore);
      const score = hasVal ? Number(rawScore) : null;
      const isBelowKkm = hasVal && score < kkm;
      const jam = Number(sub.jam) || 0;
      const jumlah = hasVal ? score * jam : null;
      sumJam += jam;
      if (hasVal) {
        sumWeighted += jumlah;
        hasGroupScore = true;
      }
      return `
        <tr class="border-b border-slate-700 text-center text-[16.5px]">
          <td class="border-l border-slate-700">${toArabicDigits(i + 1)}</td>
          <td class="border-l border-slate-700 text-right font-semibold text-[17.5px]">${escapeHtml(sub.namaArab)}</td>
          <td class="border-l border-slate-700">${toArabicDigits(jam)}</td>
          <td class="border-l border-slate-700 font-bold${isBelowKkm ? ' rapor-score-below-kkm' : ''}">${hasVal ? toArabicDigits(score) : '–'}</td>
          <td class="border-l border-slate-700 font-bold">${hasVal ? toArabicDigits(jumlah) : '–'}</td>
          <td class="border-l border-slate-700 font-semibold${isBelowKkm ? ' rapor-score-below-kkm' : ''}">${hasVal ? escapeHtml(getPredikatArab(score)) : '–'}</td>
          <td class="text-left font-sans text-[11.5px] text-slate-700 leading-none" dir="ltr">${escapeHtml(sub.namaId)}</td>
        </tr>
      `;
    }).join('');
    return `
      ${rows}
      <tr class="bg-slate-100/80 font-bold border-b border-slate-800 text-center text-[16.5px]">
        <td colspan="2" class="border-l border-slate-700 text-center">المجموع</td>
        <td class="border-l border-slate-700">${toArabicDigits(sumJam)}</td>
        <td class="border-l border-slate-700">—</td>
        <td class="border-l border-slate-700">${hasGroupScore ? toArabicDigits(sumWeighted) : '–'}</td>
        <td class="border-l border-slate-700">—</td>
        <td>—</td>
      </tr>
    `;
  };

  const raporColgroup = `
    <colgroup>
      <col style="width: 6%;" />
      <col style="width: 24%;" />
      <col style="width: 8.5%;" />
      <col style="width: 8.5%;" />
      <col style="width: 9.5%;" />
      <col style="width: 15.5%;" />
      <col style="width: 28%;" />
    </colgroup>
  `;

  return `
    <div dir="rtl" class="rapor-sheet-a4 relative overflow-hidden bg-white rounded border border-slate-300 shadow-sm p-4 max-w-[210mm] mx-auto arabic-font text-slate-900 leading-tight flex flex-col ${!isLastPage ? 'rapor-page-break mb-6 print:mb-0' : ''}">
      ${renderWatermarkOverlay(m, 1, bakedWm)}
      <div class="rapor-sheet-inner relative z-10 flex flex-col">
        <div>
          <div class="border-b-2 border-slate-900 pb-2 mb-2 flex items-center justify-between gap-3">
            <div class="w-20 h-20 flex items-center justify-center flex-shrink-0">
              ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Logo Pesantren" class="max-h-20 max-w-20 object-contain" />` : `<div class="w-16 h-16 rounded-full border-2 border-emerald-800 flex items-center justify-center font-bold text-xs text-emerald-800">RDP</div>`}
            </div>
            <div class="text-center flex-1">
              <div class="text-[25px] font-bold leading-none">${escapeHtml(m.namaArab)}</div>
              <div class="text-[12.5px] font-sans font-bold uppercase tracking-wider text-slate-700 mt-0.5">${escapeHtml(m.nama)}</div>
              <div class="text-[11px] font-sans text-slate-500 leading-tight">${escapeHtml(m.alamat)} • NSPP: ${escapeHtml(m.nspp)}</div>
            </div>
            <div class="w-20"></div>
          </div>

          <h2 class="text-center text-[32px] font-bold mb-2 leading-none">صحيفة الدرجات</h2>

          <div class="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[16.5px] mb-2 px-3 py-1.5 rounded border border-slate-800 leading-tight">
            <div class="flex justify-between"><span>الاسم :</span><span class="font-bold font-sans text-[13px] self-center">${escapeHtml(s.nama)}</span></div>
            <div class="flex justify-between"><span>الصف :</span><span class="font-bold">${escapeHtml(toArabicKelas(s.kelas))}</span></div>
            <div class="flex justify-between"><span>رقم القيد :</span><span class="font-bold">${escapeHtml(toArabicDigits(s.nisn))}</span></div>
            <div class="flex justify-between"><span>الفصل الدراسي :</span><span class="font-bold">${escapeHtml(raporSemesterArab)}</span></div>
            <div class="flex justify-between"><span>العام الدراسي :</span><span class="font-bold">${escapeHtml(toArabicDigits(raporTahun))}</span></div>
            <div></div>
          </div>

          <div class="text-[17.5px] font-bold mb-1 leading-tight">أولاً: العلوم العامة</div>
          <table class="rapor-table table-fixed w-full border border-slate-800 border-collapse text-[16.5px] mb-2">
            ${raporColgroup}
            <thead>
              <tr class="bg-emerald-50/80 border-b border-slate-800 font-bold text-center">
                <th class="border-l border-slate-700">رقم</th>
                <th class="border-l border-slate-700">اسم المادة</th>
                <th class="border-l border-slate-700">الساعات</th>
                <th class="border-l border-slate-700">الدرجة</th>
                <th class="border-l border-slate-700">المجموع</th>
                <th class="border-l border-slate-700">تقدير الدرجات</th>
                <th class="font-sans text-[12px]">Mata Pelajaran</th>
              </tr>
            </thead>
            <tbody>${renderGroupRows(umum)}</tbody>
          </table>

          <div class="text-[17.5px] font-bold mb-1 leading-tight">ثانياً: العلوم الشرعية</div>
          <table class="rapor-table table-fixed w-full border border-slate-800 border-collapse text-[16.5px] mb-2">
            ${raporColgroup}
            <thead>
              <tr class="bg-emerald-50/80 border-b border-slate-800 font-bold text-center">
                <th class="border-l border-slate-700">رقم</th>
                <th class="border-l border-slate-700">اسم المادة</th>
                <th class="border-l border-slate-700">الساعات</th>
                <th class="border-l border-slate-700">الدرجة</th>
                <th class="border-l border-slate-700">المجموع</th>
                <th class="border-l border-slate-700">تقدير الدرجات</th>
                <th class="font-sans text-[12px]">Mata Pelajaran</th>
              </tr>
            </thead>
            <tbody>${renderGroupRows(syari)}</tbody>
          </table>

          <div class="grid grid-cols-3 gap-2 border border-slate-800 rounded px-2.5 py-1.5 mb-2.5 bg-slate-50/75 text-center text-[16.5px] font-bold leading-tight">
            <div>المجموع الكلي: <span>${hasAnyScore ? toArabicDigits(totalWeighted) : '–'}</span></div>
            <div>المعدل العام: <span${hasAnyScore && avg < kkm ? ' class="rapor-score-below-kkm"' : ''}>${hasAnyScore ? `${toArabicDigits(avg.toFixed(2).replace('.', ','))} (${escapeHtml(getPredikatArab(avg))})` : '–'}</span></div>
            <div>الترتيب: <span class="text-emerald-800">${hasAnyScore ? toArabicOrdinal(rank) : '–'}</span> ${hasAnyScore ? `<span class="text-[13.5px] font-normal">(من ${toArabicDigits(totalStudents)})</span>` : ''}</div>
          </div>
        </div>

        <div class="pt-1">
          <div class="text-left text-[16.5px] mb-1.5 pl-4 leading-tight">
            تحريراً في ${escapeHtml(m.kotaArab)}، ${escapeHtml(toArabicDigits(m.tanggalArab))}
          </div>

          <div class="grid grid-cols-3 gap-3 text-center text-[16.5px] leading-tight">
            <div>
              <div class="font-bold">ولي الأمر / ولي الطالب</div>
              <div class="h-[72px]"></div>
              <div class="font-semibold">( ................................ )</div>
            </div>
            <div>
              <div class="font-bold">ولي الفصل</div>
              <div class="h-[72px]"></div>
              ${wali && wali.namaArab
                ? `<div class="font-bold underline">${escapeHtml(wali.namaArab)}</div>`
                : `<div class="font-semibold">( ................................ )</div>`}
            </div>
            <div>
              <div class="font-bold">مدير المعهد</div>
              <div class="h-[72px]"></div>
              <div class="font-bold underline">${escapeHtml(m.kepalaArab)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}


function renderRaporClassSelectorBar(waliKelas, matchingClasses, showLedgerButtons = true) {
  return `
    <div class="no-print rdp-card p-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-3 text-xs">
        ${waliKelas ? `
          <span class="px-3 py-1.5 rounded-lg bg-[#0f4c3a] text-[#f3e3b0] font-bold">Wali Kelas: Kelas ${escapeHtml(waliKelas)}</span>
        ` : `
          <div class="flex items-center gap-2">
            <label for="rapor-tingkat-select" class="font-semibold text-[#0f4c3a]">Tingkat:</label>
            <select id="rapor-tingkat-select" onchange="onRaporTingkatChange(this.value)" class="border border-[#e7dcc3] rounded-lg px-3 py-1.5 bg-[#fbf8f1] font-semibold">
              <option value="" ${!state.selectedRaporTingkat ? 'selected' : ''}>-- Pilih Tingkat --</option>
              <option value="7" ${state.selectedRaporTingkat === '7' ? 'selected' : ''}>7 (السابع)</option>
              <option value="8" ${state.selectedRaporTingkat === '8' ? 'selected' : ''}>8 (الثامن)</option>
              <option value="9" ${state.selectedRaporTingkat === '9' ? 'selected' : ''}>9 (التاسع)</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label for="rapor-kelas-select" class="font-semibold text-[#0f4c3a]">Kelas:</label>
            <select id="rapor-kelas-select" onchange="onRaporKelasChange(this.value)" ${!state.selectedRaporTingkat ? 'disabled' : ''} class="border border-[#e7dcc3] rounded-lg px-3 py-1.5 bg-[#fbf8f1] font-semibold disabled:bg-slate-100 disabled:text-slate-400">
              <option value="" ${!state.selectedRaporKelas ? 'selected' : ''}>${!state.selectedRaporTingkat ? '-- Pilih Tingkat dahulu --' : '-- Pilih Kelas --'}</option>
              ${matchingClasses.map(c => `<option value="${escapeHtml(c.kode)}" ${c.kode === state.selectedRaporKelas ? 'selected' : ''}>Kelas ${escapeHtml(c.kode)}</option>`).join('')}
            </select>
          </div>
        `}
        <button type="button" onclick="refreshStateFromServer(true).then(ok => { if (ok) showToast('Nilai terbaru dimuat dari server'); else if (state.authUser) showToast('Gagal memuat nilai dari server'); })" class="px-3 py-1.5 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 font-semibold transition">
          Refresh Nilai
        </button>
      </div>
      ${showLedgerButtons ? `
        <div class="flex flex-wrap gap-2 text-xs">
          <button type="button" onclick="exportLeggerExcel('kelas')" class="px-3 py-2 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold transition">Download Ledger Kelas ini</button>
          ${!waliKelas ? `
            <button type="button" onclick="exportLeggerExcel('tingkat')" class="px-3 py-2 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold transition">Download Ledger Tingkat ini</button>
            <button type="button" onclick="exportLeggerExcel('all')" class="px-3 py-2 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 font-semibold transition">Download Ledger Semua kelas</button>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function getRaporClassContext() {
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
  return { waliKelas, matchingClasses };
}

function renderCetakRankingPage() {
  const { waliKelas, matchingClasses } = getRaporClassContext();
  const rankingRows = state.selectedRaporKelas
    ? buildRankingRowsForClass(state.selectedRaporKelas)
    : [];
  const sortKey = state.rankingSortKey || 'rank';
  const sortDir = state.rankingSortDir || 'asc';
  const incompleteRows = rankingRows.filter(r => r.classScoredCount > 0 && r.missingFromClassCount > 0);
  const classScoredCount = rankingRows.length > 0 ? (Number(rankingRows[0].classScoredCount) || 0) : 0;
  const classScoredJam = rankingRows.length > 0 ? (Number(rankingRows[0].classScoredJam) || 0) : 0;

  return `
    ${renderPageHeader('Cetak Ranking Kelas', 'Urutkan peringkat perolehan nilai kelas dan cetak laporan ranking dalam format PDF.')}
    ${renderRaporClassSelectorBar(waliKelas, matchingClasses, false)}
    <div class="no-print rdp-card overflow-hidden">
      <div class="px-4 py-3 border-b border-[#e7dcc3] bg-[#fbf8f1] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold text-[#0f4c3a]">
            Ranking Kelas ${escapeHtml(state.selectedRaporKelas || '-')} (${rankingRows.length} santri)
          </h2>
          <div class="text-xs text-slate-600 mt-0.5">
            Klik header kolom tabel untuk mengurutkan. Urutan aktif:
            <strong id="ranking-preview-sort-status" class="text-[#0f4c3a]">${escapeHtml(getRankingSortLabel(sortKey, sortDir))}</strong>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onclick="resetRankingPreviewSort()" ${rankingRows.length === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-[#e7dcc3] bg-white hover:bg-slate-100 text-slate-700 font-semibold disabled:opacity-40 transition">
            Reset Urutan
          </button>
          <button type="button" onclick="openCetakRankingTab(false)" ${rankingRows.length === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border-2 border-[#136048] bg-white hover:bg-[#f0f7f4] text-[#0f4c3a] font-bold disabled:opacity-40 transition">
            Pratinjau Tab Baru
          </button>
          <button type="button" onclick="openCetakRankingTab(true)" ${rankingRows.length === 0 ? 'disabled' : ''} class="px-4 py-1.5 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold shadow-sm disabled:opacity-40 transition">
            Cetak Ranking (PDF)
          </button>
        </div>
      </div>
      ${incompleteRows.length > 0 ? `
        <div role="status" class="no-print mx-4 mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1.5">
          <div class="font-bold flex items-center gap-1.5">
            <span aria-hidden="true">⚠</span>
            <span>Peringatan Kelengkapan Nilai: ${incompleteRows.length} santri belum memiliki nilai lengkap (${classScoredCount} mapel / ${classScoredJam} jam kelas terisi)</span>
          </div>
          <div class="text-amber-900">
            Pembagi rata-rata memakai total jam mapel kelas yang sudah diinput (<strong>${classScoredJam} jam</strong>) sehingga nilai kosong tidak menaikkan rata-rata semu dan tetap searah dengan Total Terbobot &amp; Ranking.
          </div>
          <ul class="list-disc pl-5 space-y-0.5 text-amber-900">
            ${incompleteRows.slice(0, 5).map(r => `
              <li><b>${escapeHtml(r.nama)}</b> (${r.scoredCount}/${r.classScoredCount} mapel${r.missingSubjectsLabel ? ` — kurang: ${escapeHtml(r.missingSubjectsLabel)}` : ''})</li>
            `).join('')}
            ${incompleteRows.length > 5 ? `<li class="italic">+${incompleteRows.length - 5} santri lainnya belum lengkap</li>` : ''}
          </ul>
        </div>
      ` : ''}
      <div class="p-4 bg-[#f7f3ea]/60 overflow-x-auto">
        ${!state.selectedRaporKelas ? `
          <div role="status" class="rdp-card p-8 text-center text-xs text-slate-500 italic">
            Silakan pilih Tingkat dan Kelas terlebih dahulu untuk menampilkan &amp; mencetak tabel ranking.
          </div>
        ` : (rankingRows.length === 0 ? `
          <div role="status" class="rdp-card p-8 text-center text-xs text-slate-400 italic">
            Belum ada data santri di kelas ${escapeHtml(state.selectedRaporKelas)}.
          </div>
        ` : renderRankingSheetHtml(state.selectedRaporKelas, rankingRows, sortKey, sortDir, null, 'sortRankingPreview', true))}
      </div>
    </div>
  `;
}

function renderRaporLokal() {
  const { waliKelas, matchingClasses } = getRaporClassContext();
  const classStudents = state.selectedRaporKelas
    ? state.students.filter(st => st.kelas === state.selectedRaporKelas)
    : [];
  const classRankMap = state.selectedRaporKelas ? getClassRankMap(state.selectedRaporKelas) : null;

  return `
    ${renderPageHeader('Cetak Rapor Lokal (PDF)', 'Pratinjau dan cetak rapor Bahasa Arab (صحيفة الدرجات) per santri maupun seluruh kelas.')}
    ${renderRaporClassSelectorBar(waliKelas, matchingClasses, true)}
      <div class="no-print rdp-card overflow-hidden">
        <div class="px-4 py-3 border-b border-[#e7dcc3] bg-[#fbf8f1] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-bold text-[#0f4c3a]">
              Daftar Santri Kelas ${escapeHtml(state.selectedRaporKelas || '-')} (${classStudents.length} santri)
            </h2>
            <div class="text-xs text-slate-500 mt-0.5">Pratinjau &amp; cetak rapor dibuka di tab baru agar halaman tetap ringan dan cepat.</div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onclick="previewAllRapor()" ${classStudents.length === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg border border-[#136048] bg-white hover:bg-emerald-50 text-[#0f4c3a] font-semibold disabled:opacity-40">
              Pratinjau Semua Siswa (${classStudents.length})
            </button>
            <button type="button" onclick="printAllRapor()" ${classStudents.length === 0 ? 'disabled' : ''} class="px-4 py-1.5 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold flex items-center gap-1.5 disabled:opacity-40">
              Cetak Semua Siswa (${classStudents.length})
            </button>
          </div>
        </div>
        <div class="rdp-table-wrap">
          <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
            <thead>
              <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
                <th class="px-3 py-2.5 text-center w-10">No</th>
                <th class="px-3 py-2.5">NISN</th>
                <th class="px-3 py-2.5">Nama Siswa / Santri</th>
                <th class="px-3 py-2.5">L/P</th>
                <th class="px-3 py-2.5 text-center">Rata-rata</th>
                <th class="px-3 py-2.5 text-center">Peringkat</th>
                <th class="px-3 py-2.5 text-right">Aksi Rapor (Tab Baru)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#e7dcc3]">
              ${classStudents.length === 0 ? `
                <tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 italic">Belum ada data santri di kelas ${escapeHtml(state.selectedRaporKelas || '-')}.</td></tr>
              ` : classStudents.map((st, idx) => {
                const entry = classRankMap && !st.rankOverride ? classRankMap.byId.get(st.id) : null;
                const { avg, hasAnyScore, scoredCount, classScoredCount, missingFromClassCount, missingSubjectNames } = entry ? entry.totals : computeStudentTotals(st);
                const { rank } = st.rankOverride || (entry ? { rank: entry.rank, totalStudents: entry.totalStudents } : getStudentRank(st.id));
                const incompleteBadge = (classScoredCount > 0 && missingFromClassCount > 0)
                  ? `<span class="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${hasAnyScore ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300'} border align-middle whitespace-nowrap" title="${hasAnyScore ? `Nilai belum terisi: ${escapeHtml((missingSubjectNames || []).join(', ') || '-')}` : `Belum ada nilai masuk (${classScoredCount} mapel kelas belum terisi)`}">⚠ ${scoredCount}/${classScoredCount}</span>`
                  : '';
                return `
                  <tr class="hover:bg-[#fbf8f1]">
                    <td class="px-3 py-2 text-center">${idx + 1}</td>
                    <td class="px-3 py-2 font-mono text-slate-600">${escapeHtml(st.nisn)}</td>
                    <td class="px-3 py-2 font-semibold text-slate-900">${escapeHtml(st.nama)}${incompleteBadge}</td>
                    <td class="px-3 py-2">${(st.jk === 'Perempuan' || String(st.jk || '').toUpperCase() === 'P') ? 'P' : 'L'}</td>
                    <td class="px-3 py-2 text-center font-semibold tabular-nums">${hasAnyScore ? avg.toFixed(2) : '–'}</td>
                    <td class="px-3 py-2 text-center font-bold text-emerald-700">${hasAnyScore ? '#' + rank : '–'}</td>
                    <td class="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                      <button type="button" onclick="previewSingleRapor(${st.id})" class="px-2.5 py-1 rounded-lg border border-[#136048] bg-white hover:bg-emerald-50 text-[#0f4c3a] font-semibold">Pratinjau (Tab Baru)</button>
                      <button type="button" onclick="printSingleRapor(${st.id})" class="px-2.5 py-1 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold">Cetak Rapor</button>
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


