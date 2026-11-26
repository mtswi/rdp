// ===================== RAPOR -> KEJUARAAN =====================
function computeKejuaraanData() {
  const validClassCodes = new Set(state.classes.map(c => c.kode));
  const pool = state.students
    .filter(st => validClassCodes.has(st.kelas))
    .map(st => {
      const t = computeStudentTotals(st);
      return { ...st, totalWeighted: t.totalWeighted, syariWeighted: t.syariWeighted, avg: t.avg, hasAnyScore: t.hasAnyScore };
    })
    .filter(st => st.hasAnyScore);

  const sortByScoreDesc = (arr) => [...arr].sort((a, b) => {
    if (b.totalWeighted !== a.totalWeighted) return b.totalWeighted - a.totalWeighted;
    if (b.syariWeighted !== a.syariWeighted) return b.syariWeighted - a.syariWeighted;
    if (b.avg !== a.avg) return b.avg - a.avg;
    return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
  });

  const isScoreTied = (a, b) => a.totalWeighted === b.totalWeighted && a.syariWeighted === b.syariWeighted && Math.abs(a.avg - b.avg) < 1e-9;

  // Tabel A: Juara 1 - 3 setiap kelas
  const tabelA = [];
  for (const cls of sortClasses(state.classes)) {
    const inCls = sortByScoreDesc(pool.filter(st => st.kelas === cls.kode));
    let prev = null;
    let currentRank = 0;
    inCls.forEach((st, idx) => {
      if (!prev || !isScoreTied(st, prev)) {
        currentRank = idx + 1;
        prev = st;
      }
      if (currentRank <= 3) {
        tabelA.push({
          nama: st.nama,
          kelas: st.kelas,
          avg: st.avg,
          rank: currentRank,
          keterangan: `Juara ${currentRank} Kelas ${cls.kode}`
        });
      }
    });
  }

  // Tabel B: Juara Tingkat (dinamis sesuai daftar tingkat kelas aktif)
  const tabelB = [];
  const allTingkats = [...new Set(state.classes.map(c => String(c.tingkat || '')).filter(Boolean))]
    .sort((a, b) => (Number(a) || 99) - (Number(b) || 99));
  for (const tk of (allTingkats.length > 0 ? allTingkats : ['7', '8', '9'])) {
    const inTk = sortByScoreDesc(pool.filter(st => getKelasTingkat(st.kelas) === tk));
    if (inTk.length > 0) {
      const top = inTk[0];
      inTk.filter(st => isScoreTied(st, top))
        .forEach(champ => {
          tabelB.push({
            nama: champ.nama,
            kelas: champ.kelas,
            avg: champ.avg,
            tingkat: tk,
            keterangan: `Juara Tingkat Kelas ${tk}`
          });
        });
    }
  }

  // Tabel C: Juara Umum
  const allSorted = sortByScoreDesc(pool);
  const tabelC = allSorted.length > 0
    ? allSorted
        .filter(st => isScoreTied(st, allSorted[0]))
        .map(champ => ({
          nama: champ.nama,
          kelas: champ.kelas,
          avg: champ.avg,
          keterangan: 'Juara Umum'
        }))
    : [];

  return { tabelA, tabelB, tabelC };
}

function renderKejuaraanTable(rows, emptyMsg) {
  return `
    <div class="rdp-table-wrap rounded-lg border border-[#e7dcc3]">
      <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
        <thead>
          <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
            <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-10">No</th>
            <th class="px-3 py-2.5 border-r border-[#e7dcc3]">Nama</th>
            <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-28">Kelas</th>
            <th class="px-3 py-2.5 border-r border-[#e7dcc3] text-center w-32">Nilai Rata-rata</th>
            <th class="px-3 py-2.5">Keterangan</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#e7dcc3]">
          ${rows.length === 0 ? `
            <tr><td colspan="5" class="px-4 py-5 text-center text-slate-400 italic">${emptyMsg}</td></tr>
          ` : rows.map((r, i) => `
            <tr class="hover:bg-[#fbf8f1]">
              <td class="px-3 py-2 border-r border-[#e7dcc3] text-center">${i + 1}</td>
              <td class="px-3 py-2 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(r.nama)}</td>
              <td class="px-3 py-2 border-r border-[#e7dcc3] text-center font-semibold text-[#0f4c3a]">${escapeHtml(r.kelas)}</td>
              <td class="px-3 py-2 border-r border-[#e7dcc3] text-center font-bold tabular-nums">${r.avg.toFixed(2)}</td>
              <td class="px-3 py-2">
                <span class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  r.keterangan.includes('Juara Umum') || r.keterangan.includes('Juara Tingkat') || r.keterangan.startsWith('Juara 1 ')
                    ? 'bg-[#c9a227]/20 text-[#2b2200] border border-[#c9a227]/60'
                    : (r.keterangan.startsWith('Juara 2 ')
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border border-[#e7dcc3]')
                }">${escapeHtml(r.keterangan)}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function formatTanggalIndo(isoStr) {
  if (!isoStr) return '20 Desember 2025';
  const parts = String(isoStr).split('-');
  if (parts.length !== 3) return isoStr;
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  return `${Number(parts[2])} ${months[mIdx]} ${parts[0]}`;
}

async function saveNomorSkKejuaraan() {
  const inp = document.getElementById('input-nomor-sk');
  if (inp) state.pesantren.nomorSkKejuaraan = inp.value.trim();
  const res = await savePesantrenPartial({ nomorSkKejuaraan: state.pesantren.nomorSkKejuaraan });
  if (res && res.ok) showToast('Nomor SK Kejuaraan berhasil disimpan');
}

function openLampiranSkKejuaraanTab(autoPrint = false) {
  const inp = document.getElementById('input-nomor-sk');
  if (inp) {
    const val = inp.value.trim();
    if (val !== state.pesantren.nomorSkKejuaraan) {
      state.pesantren.nomorSkKejuaraan = val;
      savePesantrenPartial({ nomorSkKejuaraan: val });
    }
  }

  const win = window.open('', '_blank');
  if (!win) {
    showToast('Pop-up diblokir browser. Izinkan pop-up untuk membuka Lampiran SK Kejuaraan.');
    return;
  }

  const m = state.pesantren;
  const { tabelA, tabelB, tabelC } = computeKejuaraanData();
  const tglIndo = formatTanggalIndo(m.tanggalIso);
  const nomorSk = m.nomorSkKejuaraan || '001/SK-KEJ/PP-WI/XII/2025';

  const renderDocTable = (rows) => `
    <table class="sk-table w-full border-collapse text-[12px] mb-3">
      <thead>
        <tr class="bg-slate-100 font-bold text-center">
          <th class="w-10">No</th>
          <th class="text-left">Nama Santri</th>
          <th class="w-24">Kelas</th>
          <th class="w-28">Nilai Rata-rata</th>
          <th class="w-52 text-left">Keterangan</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr><td colspan="5" class="text-center italic py-2">Belum ada data</td></tr>
        ` : rows.map((r, i) => `
          <tr>
            <td class="text-center">${i + 1}</td>
            <td class="font-semibold">${escapeHtml(r.nama)}</td>
            <td class="text-center font-semibold">${escapeHtml(r.kelas)}</td>
            <td class="text-center font-bold">${r.avg.toFixed(2)}</td>
            <td class="font-semibold">${escapeHtml(r.keterangan)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const baseOrigin = location.protocol !== 'file:' ? location.origin : '';
  const twTag = baseOrigin
    ? `<link rel="stylesheet" href="${baseOrigin}/assets/tailwind.min.css?v=1" onerror="var s=document.createElement('script');s.src='${baseOrigin}/vendor/tailwindcss.min.js';document.head.appendChild(s);" />`
    : `<script src="https://cdn.tailwindcss.com"><\/script>`;

  const docHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  ${baseOrigin ? `<base href="${baseOrigin}/" />` : ''}
  <title>Lampiran_SK_Kejuaraan_${escapeHtml(m.tahun.replace('/', '_'))}</title>
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
      #sk-sheet {
        border: none !important;
        box-shadow: none !important;
        max-width: 100% !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }
    }
    .sk-table, .sk-table th, .sk-table td {
      border: 1pt solid #000 !important;
      padding: 4px 8px;
      line-height: 1.3;
    }
    .arabic-font { font-family: "Amiri", "Noto Naskh Arabic", "Traditional Arabic", "Scheherazade New", serif; }
  </style>
</head>
<body class="bg-[#f7f3ea] text-slate-900 min-h-screen py-4">
  <div class="no-print max-w-[210mm] mx-auto mb-4 bg-white border border-[#e7dcc3] rounded-lg shadow-sm px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
    <div class="font-bold text-[#0f4c3a]">
      Lampiran SK Kejuaraan • Nomor: <span class="font-mono">${escapeHtml(nomorSk)}</span>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="window.print()" class="px-4 py-1.5 rounded bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold shadow-sm">Download / Cetak PDF</button>
      <button onclick="window.close()" class="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold">Tutup Tab</button>
    </div>
  </div>

  <div id="sk-sheet" class="relative overflow-hidden bg-white rounded border border-slate-300 shadow-sm p-6 max-w-[210mm] mx-auto text-slate-900">
    ${renderWatermarkOverlay(m)}
    <div class="relative z-10">
      <!-- KOP SURAT RESMI -->
      <div class="border-b-4 border-double border-slate-900 pb-2.5 mb-3 flex items-center justify-between gap-4">
        <div class="w-16 h-16 flex items-center justify-center flex-shrink-0">
          ${isSafeImageDataUrl(m.logoDataUrl) ? `<img src="${escapeHtml(m.logoDataUrl)}" alt="Logo Pesantren" class="max-h-16 max-w-16 object-contain" />` : `<div class="w-14 h-14 rounded-full border-2 border-emerald-800 flex items-center justify-center font-bold text-xs text-emerald-800">RDP</div>`}
        </div>
        <div class="text-center flex-1">
          <div class="arabic-font text-2xl font-bold leading-none" dir="rtl">${escapeHtml(m.namaArab)}</div>
          <div class="text-sm font-bold uppercase tracking-wider text-slate-900 mt-1">${escapeHtml(m.nama)}</div>
          <div class="text-[11px] text-slate-600">${escapeHtml(m.alamat)} • NSPP: ${escapeHtml(m.nspp)} • NPSN: ${escapeHtml(m.npsn)}</div>
        </div>
        <div class="w-16"></div>
      </div>

      <!-- HEADER LAMPIRAN SK -->
      <div class="text-xs mb-3 leading-relaxed border border-slate-400 rounded p-2.5 bg-slate-50/70">
        <div class="font-bold uppercase">LAMPIRAN SURAT KEPUTUSAN PIMPINAN / KEPALA ${escapeHtml(m.nama)}</div>
        <table class="text-xs mt-1">
          <tr><td class="pr-3 font-semibold w-24">Nomor SK</td><td class="pr-2">:</td><td class="font-mono font-bold">${escapeHtml(nomorSk)}</td></tr>
          <tr><td class="pr-3 font-semibold">Tanggal</td><td class="pr-2">:</td><td>${escapeHtml(tglIndo)}</td></tr>
          <tr><td class="pr-3 font-semibold align-top">Tentang</td><td class="pr-2 align-top">:</td><td>Penetapan Santri Berprestasi (Juara Kelas, Juara Tingkat, dan Juara Umum) Semester ${escapeHtml(m.semester)} Tahun Pelajaran ${escapeHtml(m.tahun)}</td></tr>
        </table>
      </div>

      <div class="text-center mb-3">
        <h2 class="text-sm font-bold uppercase underline underline-offset-4">DAFTAR KEJUARAAN &amp; PERINGKAT SANTRI BERPRESTASI</h2>
        <div class="text-xs font-semibold uppercase mt-0.5">SEMESTER ${escapeHtml(m.semester)} — TAHUN PELAJARAN ${escapeHtml(m.tahun)}</div>
      </div>

      <!-- TABEL A -->
      <div class="text-xs font-bold uppercase mb-1">A. Juara 1 hingga 3 Setiap Kelas</div>
      ${renderDocTable(tabelA)}

      <!-- TABEL B -->
      <div class="text-xs font-bold uppercase mb-1">B. Juara Tingkat Kelas ${(() => {
        const tks = Array.from(new Set((state.classes || []).map(c => String(c.tingkat || '').trim()).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
        const list = tks.length > 0 ? tks : ['7', '8', '9'];
        if (list.length === 1) return escapeHtml(list[0]);
        return `${list.slice(0, -1).map(escapeHtml).join(', ')}, dan ${escapeHtml(list[list.length - 1])}`;
      })()}</div>
      ${renderDocTable(tabelB)}

      <!-- TABEL C -->
      <div class="text-xs font-bold uppercase mb-1">C. Juara Umum</div>
      ${renderDocTable(tabelC)}

      <!-- TANDA TANGAN RESMI -->
      <div class="mt-5 flex justify-end text-xs">
        <div class="w-64 text-left leading-snug">
          <div>Ditetapkan di : Kebarongan</div>
          <div>Pada Tanggal : ${escapeHtml(tglIndo)}</div>
          <div class="font-bold mt-1">Kepala / Pimpinan,</div>
          <div class="h-14"></div>
          <div class="font-bold underline">${escapeHtml(m.kepala)}</div>
        </div>
      </div>
    </div>
  </div>
  ${autoPrint ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));<\/script>` : ''}
</body>
</html>`;

  win.document.open();
  win.document.write(docHtml);
  win.document.close();
}

function renderKejuaraanPage() {
  const { tabelA, tabelB, tabelC } = computeKejuaraanData();
  const nomorSk = state.pesantren.nomorSkKejuaraan || '001/SK-KEJ/PP-WI/XII/2025';
  return `
    <div class="space-y-5">
      ${renderPageHeader(
        'Daftar Kejuaraan & SK Kejuaraan',
        `${escapeHtml(state.pesantren.nama)} • Tahun Pelajaran ${escapeHtml(state.pesantren.tahun)} (${escapeHtml(state.pesantren.semester)})`,
        `
          <button type="button" onclick="refreshStateFromServer(true).then(ok => { if (ok) showToast('Data kejuaraan diperbarui'); else if (state.authUser) showToast('Gagal memuat data dari server'); })" class="px-3 py-2 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] hover:bg-emerald-50 text-xs font-semibold">Refresh Data</button>
          <button type="button" onclick="exportKejuaraanExcel()" class="px-3.5 py-2 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white text-xs font-semibold">Download Excel (.xlsx)</button>
        `
      )}
      <div class="rdp-card p-5 space-y-3">
        <div class="flex flex-wrap items-end justify-between gap-3 bg-[#fbf8f1] p-3.5 rounded-lg border border-[#e7dcc3] text-xs">
          <div class="flex-1 min-w-[260px] max-w-lg">
            <label for="input-nomor-sk" class="block font-bold text-[#0f4c3a] mb-1">Nomor SK Kejuaraan (Surat Keputusan)</label>
            <div class="flex gap-2">
              <input id="input-nomor-sk" type="text" value="${escapeHtml(nomorSk)}" onchange="saveNomorSkKejuaraan()" placeholder="Contoh: 001/SK-KEJ/PP-WI/XII/2025" class="flex-1 border border-[#e7dcc3] rounded-lg px-3 py-1.5 bg-white font-mono font-semibold text-slate-800" />
              <button type="button" onclick="saveNomorSkKejuaraan()" class="px-3 py-1.5 rounded-lg bg-[#136048] hover:bg-[#0b3b2e] text-white font-semibold whitespace-nowrap">Simpan Nomor SK</button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="openLampiranSkKejuaraanTab(false)" class="px-3.5 py-2 rounded-lg border border-[#136048] bg-white hover:bg-emerald-50 text-[#0f4c3a] font-semibold">
              Pratinjau Lampiran SK (Tab Baru)
            </button>
            <button type="button" onclick="openLampiranSkKejuaraanTab(true)" class="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-[#f3e3b0] border-b-2 border-[#c9a227] font-bold shadow-sm">
              Download / Cetak PDF Lampiran SK
            </button>
          </div>
        </div>
      </div>

      <!-- TABEL A -->
      <div class="rdp-card p-5 space-y-3">
        <div class="border-b border-[#e7dcc3] pb-2 flex items-center justify-between">
          <div>
            <h2 class="font-bold text-sm text-[#0f4c3a]">Tabel A — Juara 1 hingga 3 Setiap Kelas</h2>
            <p class="text-xs text-slate-500">Daftar peringkat 1, 2, dan 3 pada masing-masing kelas.</p>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] text-xs font-semibold text-[#0f4c3a]">${tabelA.length} santri</span>
        </div>
        ${renderKejuaraanTable(tabelA, 'Belum ada data santri di kelas.')}
      </div>

      <!-- TABEL B -->
      <div class="rdp-card p-5 space-y-3">
        <div class="border-b border-[#e7dcc3] pb-2 flex items-center justify-between">
          <div>
            <h2 class="font-bold text-sm text-[#0f4c3a]">Tabel B — Juara Tingkat Kelas 7, 8, dan 9</h2>
            <p class="text-xs text-slate-500">Santri dengan nilai tertinggi pada masing-masing tingkat (Kelas 7, Kelas 8, dan Kelas 9).</p>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] text-xs font-semibold text-[#0f4c3a]">${tabelB.length} tingkat</span>
        </div>
        ${renderKejuaraanTable(tabelB, 'Belum ada data juara tingkat.')}
      </div>

      <!-- TABEL C -->
      <div class="rdp-card p-5 space-y-3">
        <div class="border-b border-[#e7dcc3] pb-2 flex items-center justify-between">
          <div>
            <h2 class="font-bold text-sm text-[#0f4c3a]">Tabel C — Juara Umum</h2>
            <p class="text-xs text-slate-500">Satu santri dengan nilai tertinggi dari seluruh kelas dan tingkat.</p>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/40 text-xs font-bold text-[#84670f]">Juara Umum</span>
        </div>
        ${renderKejuaraanTable(tabelC, 'Belum ada data juara umum.')}
      </div>
    </div>
  `;
}


async function exportKejuaraanExcel() {
  await ensureXlsxLoaded();
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel (XLSX) belum termuat.');
    return;
  }
  const { tabelA, tabelB, tabelC } = computeKejuaraanData();
  const aoa = [
    [sanitizeExcelCell(`LAMPIRAN SK KEJUARAAN SANTRI - ${state.pesantren.nama}`)],
    [sanitizeExcelCell(`Nomor SK: ${state.pesantren.nomorSkKejuaraan || '-'} | Tahun Pelajaran: ${state.pesantren.tahun} | Semester: ${state.pesantren.semester}`)],
    [],
    ['TABEL A: JUARA 1 HINGGA 3 SETIAP KELAS'],
    ['No', 'Nama', 'Kelas', 'Nilai Rata-rata', 'Keterangan'],
    ...tabelA.map((r, i) => [i + 1, sanitizeExcelCell(r.nama), sanitizeExcelCell(r.kelas), Number(r.avg.toFixed(2)), sanitizeExcelCell(r.keterangan)]),
    [],
    ['TABEL B: JUARA TINGKAT'],
    ['No', 'Nama', 'Kelas', 'Nilai Rata-rata', 'Keterangan'],
    ...tabelB.map((r, i) => [i + 1, sanitizeExcelCell(r.nama), sanitizeExcelCell(r.kelas), Number(r.avg.toFixed(2)), sanitizeExcelCell(r.keterangan)]),
    [],
    ['TABEL C: JUARA UMUM'],
    ['No', 'Nama', 'Kelas', 'Nilai Rata-rata', 'Keterangan'],
    ...tabelC.map((r, i) => [i + 1, sanitizeExcelCell(r.nama), sanitizeExcelCell(r.kelas), Number(r.avg.toFixed(2)), sanitizeExcelCell(r.keterangan)])
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 12 }, { wch: 16 }, { wch: 28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kejuaraan');
  const tahunSafe = String(state.pesantren.tahun || '2026_2027').replace(/[^0-9A-Za-z]/g, '_');
  const semSafe = String(state.pesantren.semester || 'Ganjil').replace(/[^0-9A-Za-z]/g, '_');
  XLSX.writeFile(wb, `Kejuaraan_RDP_${tahunSafe}_${semSafe}.xlsx`);
  showToast('File Kejuaraan (.xlsx) berhasil diunduh!');
}

function setStatusSort(key) {
  if (state.statusSortKey === key) {
    state.statusSortDir = state.statusSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.statusSortKey = key;
    state.statusSortDir = 'asc';
  }
  renderPage();
}

function renderStatusNilai() {
  const groupMap = new Map();
  for (const a of state.assignments) {
    const key = `${a.teacherId}__${a.mapel}`;
    if (!groupMap.has(key)) {
      const t = state.teachers.find(x => x.id === a.teacherId);
      const sub = state.subjects.find(x => x.namaArab === a.mapel);
      groupMap.set(key, {
        teacherId: a.teacherId,
        teacherName: t ? t.nama : a.teacherId,
        mapel: a.mapel,
        mapelName: sub ? sub.namaId : a.mapel,
        items: []
      });
    }
    groupMap.get(key).items.push({ id: a.id, kode: a.kode, sent: Boolean(a.sent), tingkat: getKelasTingkat(a.kode) });
  }

  let rows = [...groupMap.values()].map((g, idx) => {
    const sortedItems = sortClasses(g.items);
    const greenCount = sortedItems.filter(i => i.sent).length;
    const totalCount = sortedItems.length;
    const persen = totalCount > 0 ? Math.round((greenCount / totalCount) * 100) : 0;
    return {
      ...g,
      origNo: idx + 1,
      sortedItems,
      greenCount,
      totalCount,
      persen
    };
  });

  const countAllRows = rows.length;
  const countIncomplete = rows.filter(r => r.persen < 100).length;
  const countComplete = rows.filter(r => r.persen === 100).length;

  const sf = state.statusFilter || 'all';
  const sq = String(state.statusSearch || '').trim().toLowerCase();
  if (sf === 'incomplete') rows = rows.filter(r => r.persen < 100);
  else if (sf === 'complete') rows = rows.filter(r => r.persen === 100);
  if (sq) {
    rows = rows.filter(r =>
      r.teacherName.toLowerCase().includes(sq) ||
      r.mapelName.toLowerCase().includes(sq) ||
      r.mapel.toLowerCase().includes(sq) ||
      r.sortedItems.some(it => String(it.kode || '').toLowerCase().includes(sq))
    );
  }

  const dir = state.statusSortDir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    if (state.statusSortKey === 'no') {
      return dir * (a.origNo - b.origNo);
    }
    if (state.statusSortKey === 'mapel') {
      const mCmp = a.mapelName.localeCompare(b.mapelName, 'id', { sensitivity: 'base', numeric: true });
      if (mCmp !== 0) return dir * mCmp;
    }
    if (state.statusSortKey === 'persen') {
      if (a.persen !== b.persen) return dir * (a.persen - b.persen);
    }
    const gCmp = a.teacherName.localeCompare(b.teacherName, 'id', { sensitivity: 'base', numeric: true });
    if (gCmp !== 0) return dir * gCmp;
    return a.mapelName.localeCompare(b.mapelName, 'id', { sensitivity: 'base', numeric: true });
  });

  const totalSentAll = state.assignments.filter(a => a.sent).length;
  const totalAll = state.assignments.length;
  const persenAll = totalAll > 0 ? Math.round((totalSentAll / totalAll) * 100) : 0;
  const isAdmin = Boolean(state.authUser && state.authUser.role === 'admin');

  const renderClassStatusChip = (r, item, extraCls = '') => {
    const cls = `inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs shadow-sm ${extraCls} ${item.sent ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`;
    if (!isAdmin) {
      return `<span class="${cls}" title="${item.sent ? 'Sudah dikirim' : 'Belum dikirim'}"><span aria-hidden="true">${item.sent ? '✓' : '✕'}</span><span>${escapeHtml(item.kode)}</span></span>`;
    }
    return `<button type="button" data-teacher="${escapeHtml(r.teacherId)}" data-kelas="${escapeHtml(item.kode)}" data-mapel="${escapeHtml(r.mapel)}" onclick="openStatusNilaiItem(this.dataset.teacher, this.dataset.kelas, this.dataset.mapel)" class="${cls} hover:ring-2 hover:ring-[#c9a227] transition cursor-pointer" title="${item.sent ? 'Sudah dikirim' : 'Belum dikirim'} — Klik untuk buka Input Nilai ${escapeHtml(item.kode)}"><span aria-hidden="true">${item.sent ? '✓' : '✕'}</span><span>${escapeHtml(item.kode)}</span></button>`;
  };

  return `
    ${renderPageHeader(
      'Status Pengiriman Nilai Guru / Ustadz',
      'Pantau progres pengiriman nilai per guru & mapel. Klik badge kelas untuk menindaklanjuti input nilai.',
      `<span class="px-3 py-1.5 rounded-full bg-[#fbf8f1] border border-[#e7dcc3] text-xs font-bold text-[#0f4c3a] tabular-nums">Total Terkirim: ${totalSentAll}/${totalAll} (${persenAll}%)</span>`
    )}
    <div class="rdp-card p-5 space-y-4 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7dcc3] pb-3">
        <div class="flex flex-wrap items-center gap-1.5">
          ${[
            ['all', `Semua (${countAllRows})`],
            ['incomplete', `Belum Selesai (${countIncomplete})`],
            ['complete', `100% Terkirim (${countComplete})`]
          ].map(([k, lbl]) => `
            <button type="button" aria-pressed="${sf === k ? 'true' : 'false'}" onclick="state.statusFilter='${k}'; renderPage()" class="min-h-[34px] px-3 py-1 rounded-full font-semibold border transition ${sf === k ? 'bg-[#0f4c3a] text-[#f3e3b0] border-[#0f4c3a]' : 'bg-white text-slate-700 border-[#e7dcc3] hover:bg-[#fbf8f1]'}">${lbl}</button>
          `).join('')}
        </div>
        <div class="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div class="hidden sm:flex items-center gap-2 text-xs">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">✓ Terkirim</span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 text-white font-bold">✕ Draf</span>
          </div>
          <input id="status-search-input" type="search" aria-label="Cari guru, mata pelajaran, atau kelas" value="${escapeHtml(state.statusSearch || '')}" oninput="updateSearchAndRender('status-search-input', 'statusSearch', this.value)" placeholder="Cari guru, mapel, atau kelas..." class="w-full sm:w-60 border border-[#e7dcc3] rounded-lg px-3 py-1.5 bg-white text-xs" />
        </div>
      </div>

      <div class="hidden md:block rdp-table-wrap rounded-lg border border-[#e7dcc3]">
        <table class="w-full text-left border-collapse text-xs rdp-table-sticky">
          <thead>
            <tr class="bg-[#fbf8f1] border-b border-[#e7dcc3] font-bold text-[#0f4c3a]">
              ${renderSortableTh({ label: 'No', key: 'no', activeKey: state.statusSortKey, activeDir: state.statusSortDir, onClickJs: "setStatusSort('no')", align: 'center', extraClass: 'px-2 py-2 border-r border-[#e7dcc3] w-14' })}
              ${renderSortableTh({ label: 'Nama Guru', key: 'guru', activeKey: state.statusSortKey, activeDir: state.statusSortDir, onClickJs: "setStatusSort('guru')", extraClass: 'px-3 py-2 border-r border-[#e7dcc3]' })}
              ${renderSortableTh({ label: 'Mata Pelajaran', key: 'mapel', activeKey: state.statusSortKey, activeDir: state.statusSortDir, onClickJs: "setStatusSort('mapel')", extraClass: 'px-3 py-2 border-r border-[#e7dcc3]' })}
              ${renderSortableTh({ label: 'Persentase', key: 'persen', activeKey: state.statusSortKey, activeDir: state.statusSortDir, onClickJs: "setStatusSort('persen')", align: 'center', extraClass: 'px-3 py-2 border-r border-[#e7dcc3] w-36' })}
              <th class="px-3 py-2.5">Blok Kelas</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#e7dcc3]">
            ${rows.length === 0 ? `
              <tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">
                ${state.assignments.length === 0
                  ? 'Belum ada data penugasan mengajar.'
                  : `Tidak ada data yang cocok dengan filter aktif. <button type="button" onclick="state.statusFilter='all'; state.statusSearch=''; renderPage()" class="ml-2 underline font-semibold text-[#0f4c3a]">Reset Filter</button>`}
              </td></tr>
            ` : rows.map((r, i) => `
              <tr class="hover:bg-[#fbf8f1]">
                <td class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">${i + 1}</td>
                <td class="px-3 py-2.5 border-r border-[#e7dcc3] font-semibold text-slate-900">${escapeHtml(r.teacherName)}</td>
                <td class="px-3 py-2.5 border-r border-[#e7dcc3]">
                  <span class="font-semibold text-slate-800">${escapeHtml(r.mapelName)}</span>
                  ${r.mapel !== r.mapelName ? `<span class="arabic-font text-sm text-[#0f4c3a] ml-1">(${escapeHtml(r.mapel)})</span>` : ''}
                </td>
                <td class="px-3 py-2.5 border-r border-[#e7dcc3] text-center">
                  <div class="flex items-center justify-center gap-1.5 font-bold tabular-nums ${r.persen === 100 ? 'text-emerald-700' : (r.persen === 0 ? 'text-rose-700' : 'text-amber-700')}">
                    <span>${r.persen}%</span>
                    <span class="text-[11px] font-normal text-slate-500">(${r.greenCount}/${r.totalCount})</span>
                  </div>
                  <div class="w-full h-1.5 bg-[#efe7d6] rounded-full overflow-hidden mt-1">
                    <div class="h-full ${r.persen === 100 ? 'bg-emerald-600' : (r.persen === 0 ? 'bg-rose-600' : 'bg-amber-500')}" style="width: ${r.persen}%"></div>
                  </div>
                </td>
                <td class="px-3 py-2.5">
                  <div class="flex flex-wrap gap-1.5">
                    ${r.sortedItems.map(item => renderClassStatusChip(r, item)).join('')}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="md:hidden space-y-2.5 rdp-mobile-cards">
        ${rows.length === 0 ? `
          <div role="status" class="p-6 text-center rounded-xl border border-dashed border-[#e7dcc3] bg-[#fbf8f1]/60 text-slate-500">
            ${state.assignments.length === 0
              ? 'Belum ada data penugasan mengajar.'
              : `Tidak ada data yang cocok dengan filter aktif. <button type="button" onclick="state.statusFilter='all'; state.statusSearch=''; renderPage()" class="block mx-auto mt-2 px-3 py-1.5 rounded-lg border border-[#136048] bg-white text-[#0f4c3a] font-semibold">Reset Filter</button>`}
          </div>
        ` : rows.map((r) => `
          <div class="rounded-xl border border-[#e7dcc3] bg-[#fbf8f1]/60 p-3.5 space-y-2.5">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-bold text-sm text-[#0f4c3a] truncate">${escapeHtml(r.teacherName)}</div>
                <div class="text-xs text-slate-700 mt-0.5">
                  <span class="font-semibold">${escapeHtml(r.mapelName)}</span>
                  ${r.mapel !== r.mapelName ? `<span class="arabic-font text-sm text-[#0f4c3a] ml-1">(${escapeHtml(r.mapel)})</span>` : ''}
                </div>
              </div>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold tabular-nums flex-shrink-0 ${r.persen === 100 ? 'bg-emerald-100 text-emerald-800' : (r.persen === 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')}">
                ${r.persen}% (${r.greenCount}/${r.totalCount})
              </span>
            </div>
            <div class="w-full h-2 bg-[#efe7d6] rounded-full overflow-hidden">
              <div class="h-full ${r.persen === 100 ? 'bg-emerald-600' : (r.persen === 0 ? 'bg-rose-600' : 'bg-amber-500')}" style="width: ${r.persen}%"></div>
            </div>
            <div class="flex flex-wrap gap-1.5 pt-0.5">
              ${r.sortedItems.map(item => renderClassStatusChip(r, item, 'min-h-[34px] px-2.5')).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}


