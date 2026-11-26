// ===================== SIDEBAR & MOBILE BOTTOM NAV =====================
function navItem(label, pageId, iconSvg, active) {
  return `
    <button type="button" onclick="navigate('${pageId}')" title="${escapeHtml(label)}" ${active ? 'aria-current="page"' : ''} class="sidebar-item-btn w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
      active ? 'bg-white/10 text-white font-semibold border-l-4 border-[#c9a227]' : 'text-white/75 hover:bg-white/5 hover:text-white border-l-4 border-transparent'
    }">
      <span class="w-4 h-4 flex-shrink-0 opacity-85" aria-hidden="true">${iconSvg}</span>
      <span class="sidebar-text truncate">${label}</span>
    </button>
  `;
}

function navGroup(key, label, iconSvg, children) {
  const isOpen = Boolean(state.openGroups[key]);
  const hasActiveChild = children.some(c => state.page === c.page);
  return `
    <div>
      <button type="button" onclick="toggleGroup('${key}')" aria-expanded="${isOpen ? 'true' : 'false'}" title="${escapeHtml(label)}" class="sidebar-item-btn w-full flex items-center justify-between px-4 py-2.5 transition ${
        hasActiveChild ? 'text-[#f3e3b0] font-semibold bg-white/5' : 'text-white/80 hover:bg-white/5 hover:text-white'
      }">
        <span class="flex items-center gap-3 min-w-0">
          <span class="w-4 h-4 flex-shrink-0 opacity-85" aria-hidden="true">${iconSvg}</span>
          <span class="sidebar-text truncate">${escapeHtml(label)}</span>
        </span>
        <svg class="sidebar-chevron w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div class="sidebar-sub ${isOpen ? 'block' : 'hidden'} bg-[#0b3b2e]/70">
        ${children.map(c => {
          const isChildActive = state.page === c.page;
          return `
          <button type="button" onclick="navigate('${c.page}')" title="${escapeHtml(c.label)}" ${isChildActive ? 'aria-current="page"' : ''} class="w-full text-left pl-11 pr-4 py-2 text-xs transition ${
            isChildActive ? 'text-white font-semibold bg-white/10 border-l-4 border-[#c9a227]' : 'text-white/70 hover:text-white hover:bg-white/5 border-l-4 border-transparent'
          }">${c.label}</button>
        `;
        }).join('')}
      </div>
    </div>
  `;
}


const svgIcons = {
  dash: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
  school: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>',
  cog: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
  users: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>',
  book: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>',
  db: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>',
  logout: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>',
  cls: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>',
  menu: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>',
  key: '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>'
};

function renderMobileBottomNav() {
  const bar = document.getElementById('mobile-bottom-nav');
  if (!bar) return;
  if (!state.authUser) {
    bar.innerHTML = '';
    return;
  }

  let items = [];
  if (state.mode === 'proktor') {
    items = [
      { label: 'Menu', action: 'toggleSidebar()', icon: svgIcons.menu, active: state.sidebarOpenMobile },
      { label: 'Beranda', action: "navigate('dashboard')", icon: svgIcons.dash, active: state.page === 'dashboard' },
      { label: 'Santri', action: "navigate('data-siswa')", icon: svgIcons.users, active: state.page === 'data-siswa' },
      { label: 'Rapor', action: "navigate('rapor-siswa')", icon: svgIcons.book, active: ['rapor-siswa', 'cetak-ranking', 'legger', 'kejuaraan'].includes(state.page) },
      { label: 'Status', action: "navigate('status-nilai')", icon: svgIcons.cls, active: state.page === 'status-nilai' }
    ];
  } else if (state.mode === 'siswa') {
    items = [
      { label: 'Menu', action: 'toggleSidebar()', icon: svgIcons.menu, active: state.sidebarOpenMobile },
      { label: 'Rapor', action: "navigate('siswa-rapor')", icon: svgIcons.book, active: state.page === 'siswa-rapor' },
      { label: 'Data Diri', action: "navigate('siswa-profil')", icon: svgIcons.users, active: state.page === 'siswa-profil' },
      { label: 'Password', action: "navigate('siswa-password')", icon: svgIcons.key, active: state.page === 'siswa-password' }
    ];
  } else {
    const waliKelas = getWaliKelasKode();
    items = [
      { label: 'Menu', action: 'toggleSidebar()', icon: svgIcons.menu, active: state.sidebarOpenMobile },
      { label: 'Beranda', action: "navigate('dashboard')", icon: svgIcons.dash, active: state.page === 'dashboard' },
      { label: 'Input Nilai', action: "navigate('penilaian')", icon: svgIcons.cls, active: state.page === 'penilaian' }
    ];
    if (waliKelas) {
      items.push({ label: `Wali ${escapeHtml(waliKelas)}`, action: "navigate('status-nilai-kelas')", icon: svgIcons.book, active: ['status-nilai-kelas', 'rapor-siswa', 'cetak-ranking', 'data-siswa', 'legger'].includes(state.page) });
    }
  }

  bar.innerHTML = `
    <div class="grid" style="grid-template-columns: repeat(${items.length}, minmax(0, 1fr));">
      ${items.map(it => `
        <button type="button" onclick="${it.action}" ${it.active ? 'aria-current="page"' : ''} class="flex flex-col items-center justify-center py-2 px-1 text-[11px] font-semibold transition ${
          it.active ? 'text-[#f3e3b0] bg-white/10 border-t-2 border-[#c9a227]' : 'text-white/70 hover:text-white border-t-2 border-transparent'
        }">
          <span class="w-4 h-4 mb-0.5" aria-hidden="true">${it.icon}</span>
          <span class="truncate max-w-full">${it.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderSidebar() {
  const periodLabel = document.getElementById('sidebar-period-label');
  if (periodLabel && state.pesantren) {
    periodLabel.textContent = `Semester ${state.pesantren.semester || 'Ganjil'} • ${state.pesantren.tahun || '2026/2027'}`;
  }
  const nav = document.getElementById('sidebar-nav');
  if (state.mode === 'proktor') {
    nav.innerHTML = `
      ${navItem('Dashboard', 'dashboard', svgIcons.dash, state.page === 'dashboard')}
      ${navItem('Profil Pesantren', 'profil', svgIcons.school, state.page === 'profil')}
      ${navGroup('lembaga', 'Lembaga', svgIcons.cog, [
        { label: 'Pengaturan', page: 'pengaturan' },
        { label: 'Mata Pelajaran', page: 'mapel' },
        { label: 'Akun & Hak Akses', page: 'users' }
      ])}
      ${navGroup('kelas_menu', 'Kelas', svgIcons.cls, [
        { label: 'Wali Kelas', page: 'kelas' },
        { label: 'Pengampu', page: 'pengampu-kelas' }
      ])}
      ${navGroup('guru', 'Guru', svgIcons.users, [
        { label: 'Data Guru', page: 'data-guru' },
        { label: 'Mengajar', page: 'mengajar' }
      ])}
      ${navGroup('siswa', 'Santri / Siswa', svgIcons.users, [
        { label: 'Data Santri (Upload Excel)', page: 'data-siswa' }
      ])}
      ${navGroup('rapor', 'Rapor', svgIcons.book, [
        { label: 'Cetak Rapor Lokal (PDF)', page: 'rapor-siswa' },
        { label: 'Cetak Ranking', page: 'cetak-ranking' },
        { label: 'Ledger Excel', page: 'legger' },
        { label: 'Kejuaraan', page: 'kejuaraan' },
        { label: 'Status Nilai', page: 'status-nilai' }
      ])}
      ${navItem('Backup Restore', 'backup', svgIcons.db, state.page === 'backup')}
      <div class="mt-2 pt-2 border-t border-white/10">
        <button onclick="logoutUser()" title="Logout" class="sidebar-item-btn w-full flex items-center gap-3 px-4 py-2.5 text-white/75 hover:bg-white/5 hover:text-white transition">
          <span class="w-4 h-4 flex-shrink-0 opacity-80">${svgIcons.logout}</span><span class="sidebar-text">Logout</span>
        </button>
      </div>
    `;
  } else if (state.mode === 'siswa') {
    nav.innerHTML = `
      <div class="sidebar-section-label px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/45">Portal Santri / Siswa</div>
      ${navItem('Rapor Saya (PDF)', 'siswa-rapor', svgIcons.book, state.page === 'siswa-rapor')}
      ${navItem('Cek Data Diri', 'siswa-profil', svgIcons.users, state.page === 'siswa-profil')}
      ${navItem('Ganti Password', 'siswa-password', svgIcons.key, state.page === 'siswa-password')}
      <div class="mt-2 pt-2 border-t border-white/10">
        <button onclick="logoutUser()" title="Logout" class="sidebar-item-btn w-full flex items-center gap-3 px-4 py-2.5 text-white/75 hover:bg-white/5 hover:text-white transition">
          <span class="w-4 h-4 flex-shrink-0 opacity-80">${svgIcons.logout}</span><span class="sidebar-text">Logout</span>
        </button>
      </div>
    `;
  } else {
    const t = getCurrentTeacher();
    const waliKelas = getWaliKelasKode();
    const mine = getTeacherAssignments();
    const tingkatGroups = [...new Set(mine.map(k => getKelasTingkat(k.kode)))].sort((a, b) => Number(a) - Number(b));
    const renderGuruTingkatGroup = (tk) => {
      const key = 'guru_tk_' + tk;
      if (state.openGroups[key] === undefined) state.openGroups[key] = true;
      const isOpen = state.openGroups[key];
      const items = sortClasses(mine.filter(k => getKelasTingkat(k.kode) === tk))
        .sort((a, b) => {
          const cmp = String(a.kode).localeCompare(String(b.kode), 'id', { numeric: true, sensitivity: 'base' });
          return cmp !== 0 ? cmp : String(a.mapel).localeCompare(String(b.mapel), 'id');
        });
      return `
        <div>
          <button type="button" data-group-key="${escapeHtml(key)}" onclick="toggleGroup(this.dataset.groupKey)" aria-expanded="${isOpen ? 'true' : 'false'}" title="Tingkat ${escapeHtml(tk)} (${items.length} kelas)" class="sidebar-item-btn w-full flex items-center justify-between px-4 py-2 text-white/85 hover:bg-white/5 hover:text-white transition">
            <span class="flex items-center gap-2.5 text-xs font-semibold min-w-0">
              <span class="w-4 h-4 flex-shrink-0 opacity-80" aria-hidden="true">${svgIcons.cls}</span>
              <span class="sidebar-text truncate">Tingkat ${escapeHtml(tk)} <span class="text-[11px] text-white/55 font-normal">(${items.length})</span></span>
            </span>
            <svg class="sidebar-chevron w-3.5 h-3.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div class="sidebar-sub ${isOpen ? 'block' : 'hidden'} bg-[#0b3b2e]/60">
            ${items.map(k => {
              const sub = state.subjects.find(s => s.namaArab === k.mapel);
              const labelMapel = sub ? sub.namaId : k.mapel;
              const isSelected = state.page === 'penilaian' && state.selectedKelasMengajar === k.kode && state.selectedMapelMengajar === k.mapel;
              return `
                <button type="button" data-kelas="${escapeHtml(k.kode)}" data-mapel="${escapeHtml(k.mapel)}" onclick="navigate('penilaian', {kelas:this.dataset.kelas, mapel:this.dataset.mapel})" ${isSelected ? 'aria-current="page"' : ''} title="${escapeHtml(k.kode)} - ${escapeHtml(labelMapel)}" class="w-full flex items-center justify-between pl-8 pr-3 py-2 text-left transition ${
                  isSelected
                    ? 'bg-white/10 text-white font-semibold border-l-4 border-[#c9a227]'
                    : 'text-white/75 hover:bg-white/5 hover:text-white border-l-4 border-transparent'
                }">
                  <span class="min-w-0">
                    <span class="font-semibold text-xs">${escapeHtml(k.kode)}</span>
                    <span class="block text-[11px] text-white/65 truncate">${escapeHtml(labelMapel)}</span>
                  </span>
                  <span class="sidebar-badge inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 shadow-sm ${k.sent ? 'bg-[#fbf8f1] text-[#0f4c3a]' : 'bg-rose-600 text-white'}">${k.sent ? '✓ Terkirim' : '✕ Draf'}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    nav.innerHTML = `
      ${navItem('Dashboard', 'dashboard', svgIcons.dash, state.page === 'dashboard')}
      <div class="sidebar-section-label px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/45">Kelas Mengajar (${mine.length})</div>
      ${mine.length === 0 ? `<div class="sidebar-text px-4 py-2 text-xs text-white/50 italic">Belum ada kelas ditugaskan</div>` : tingkatGroups.map(renderGuruTingkatGroup).join('')}
      ${waliKelas ? `
        <div class="sidebar-section-label px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/45">Wali Kelas (${escapeHtml(waliKelas)})</div>
        ${navGroup('kelas_menu', 'Kelas', svgIcons.cls, [
          { label: 'Status Nilai', page: 'status-nilai-kelas' }
        ])}
        ${navGroup('walikelas', waliKelas, svgIcons.users, [
          { label: 'Data Santri', page: 'data-siswa' },
          { label: 'Rapor Santri (PDF)', page: 'rapor-siswa' },
          { label: 'Cetak Ranking', page: 'cetak-ranking' },
          { label: 'Ledger Kelas (Excel)', page: 'legger' }
        ])}
      ` : ''}
      <div class="mt-2 pt-2 border-t border-white/10">
        <button onclick="logoutUser()" title="Logout" class="sidebar-item-btn w-full flex items-center gap-3 px-4 py-2.5 text-white/75 hover:bg-white/5 hover:text-white transition">
          <span class="w-4 h-4 flex-shrink-0 opacity-80">${svgIcons.logout}</span><span class="sidebar-text">Logout</span>
        </button>
      </div>
    `;
  }
  syncSidebarView();
  renderMobileBottomNav();
}

// ===================== PAGE ROUTER =====================
const PAGE_META = {
  dashboard: { title: 'Dashboard' },
  profil: { title: 'Profil Pesantren' },
  pengaturan: { title: 'Pengaturan Lembaga' },
  mapel: { title: 'Mata Pelajaran' },
  users: { title: 'Akun & Hak Akses' },
  kelas: { title: 'Wali Kelas & Rombel' },
  'pengampu-kelas': { title: 'Pengampu Kelas' },
  'status-nilai-kelas': { title: 'Status Nilai Kelas' },
  'data-guru': { title: 'Data Guru / Ustadz' },
  mengajar: { title: 'Jadwal Mengajar Guru' },
  'data-siswa': { title: 'Data Santri' },
  penilaian: { title: 'Input Nilai Santri' },
  bobot: { title: 'Bobot Penilaian' },
  'rapor-siswa': { title: 'Cetak Rapor Lokal' },
  'cetak-ranking': { title: 'Cetak Ranking' },
  legger: { title: 'Ledger Excel' },
  kejuaraan: { title: 'Kejuaraan & SK' },
  'status-nilai': { title: 'Status Pengumpulan Nilai' },
  backup: { title: 'Backup & Restore' },
  'siswa-dashboard': { title: 'Beranda Santri' },
  'siswa-rapor': { title: 'Rapor Saya' },
  'siswa-profil': { title: 'Cek Data Diri' },
  'siswa-password': { title: 'Ganti Password' }
};

function renderPage() {
  const el = document.getElementById('main-content');
  const bc = document.getElementById('breadcrumb-current');

  if (state.mode === 'siswa') {
    if (!['siswa-rapor', 'siswa-profil', 'siswa-password'].includes(state.page)) {
      state.page = 'siswa-rapor';
    }
    if (bc) bc.textContent = (PAGE_META[state.page] && PAGE_META[state.page].title) || 'Rapor Saya';
    if (state.page === 'siswa-profil') el.innerHTML = renderSiswaProfil();
    else if (state.page === 'siswa-password') el.innerHTML = renderSiswaPassword();
    else el.innerHTML = renderSiswaRapor();
    return;
  }

  const allowedPages = getAllowedPagesForCurrentMode();
  if (allowedPages && !allowedPages.includes(state.page)) {
    state.page = 'dashboard';
  }

  if (bc) {
    bc.textContent = (PAGE_META[state.page] && PAGE_META[state.page].title)
      || state.page.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  if (state.page === 'dashboard') el.innerHTML = state.mode === 'proktor' ? renderProktorDashboard() : renderGuruDashboard();
  else if (state.page === 'siswa-dashboard') el.innerHTML = renderSiswaDashboard();
  else if (state.page === 'siswa-rapor') el.innerHTML = renderSiswaRapor();
  else if (state.page === 'users') el.innerHTML = renderUsersManagement();
  else if (state.page === 'profil') el.innerHTML = renderProfilPesantren();
  else if (state.page === 'pengaturan') el.innerHTML = renderLembagaPengaturan();
  else if (state.page === 'mapel') el.innerHTML = renderMapelSettings();
  else if (state.page === 'kelas') el.innerHTML = renderLembagaKelas();
  else if (state.page === 'pengampu-kelas') el.innerHTML = renderPengampuKelas();
  else if (state.page === 'status-nilai-kelas') el.innerHTML = renderStatusNilaiKelas();
  else if (state.page === 'data-guru') el.innerHTML = renderDataGuru();
  else if (state.page === 'mengajar') el.innerHTML = renderMengajarProktor();
  else if (state.page === 'data-siswa') el.innerHTML = renderDataSiswa();
  else if (state.page === 'penilaian') el.innerHTML = renderPenilaian();
  else if (state.page === 'bobot') el.innerHTML = renderBobot();
  else if (state.page === 'rapor-siswa') el.innerHTML = renderRaporLokal();
  else if (state.page === 'cetak-ranking') el.innerHTML = renderCetakRankingPage();
  else if (state.page === 'legger') el.innerHTML = renderLeggerPage();
  else if (state.page === 'kejuaraan') el.innerHTML = renderKejuaraanPage();
  else if (state.page === 'status-nilai') el.innerHTML = renderStatusNilai();
  else if (state.page === 'backup') el.innerHTML = renderBackup();
  else el.innerHTML = `<div class="bg-white rounded border border-[#e7dcc3] p-6 text-xs"><h2 class="font-bold text-sm mb-2 capitalize">${escapeHtml(state.page)}</h2><button onclick="navigate('dashboard')" class="px-3 py-1.5 rounded bg-[#136048] text-white font-semibold">Kembali ke Dashboard</button></div>`;
}

function updateSearchAndRender(inputId, stateKey, val) {
  const cur = document.getElementById(inputId);
  const pos = cur && typeof cur.selectionStart === 'number' ? cur.selectionStart : String(val || '').length;
  state[stateKey] = val;
  renderPage();
  const next = document.getElementById(inputId);
  if (next) {
    next.focus();
    try { next.setSelectionRange(pos, pos); } catch (_) {}
  }
}

function renderPageHeader(title, subtitle = '', rightHtml = '') {
  return `
    <div class="flex flex-wrap items-start sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl sm:text-2xl font-extrabold text-[#0f4c3a] leading-tight">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="text-xs sm:text-sm text-slate-600 mt-0.5">${subtitle}</p>` : ''}
      </div>
      ${rightHtml ? `<div class="flex flex-wrap items-center gap-2">${rightHtml}</div>` : ''}
    </div>
  `;
}

function markFormDirty(formKey, isDirty = true) {
  if (!state.dirtyForms) state.dirtyForms = {};
  state.dirtyForms[formKey] = Boolean(isDirty);
  const badge = document.getElementById(`dirty-badge-${formKey}`);
  if (badge) {
    badge.classList.toggle('hidden', !isDirty);
    badge.classList.toggle('inline-flex', Boolean(isDirty));
  }
}

function renderDirtyBadge(formKey) {
  const isDirty = Boolean(state.dirtyForms && state.dirtyForms[formKey]);
  return `
    <span id="dirty-badge-${escapeHtml(formKey)}" role="status" class="${isDirty ? 'inline-flex' : 'hidden'} items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold">
      <span class="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true"></span>
      <span>Perubahan belum disimpan</span>
    </span>
  `;
}

function renderSortableTh({ label, key, activeKey, activeDir, onClickJs, align = 'left', extraClass = '' }) {
  const isActive = activeKey === key;
  const ariaSort = isActive ? (activeDir === 'desc' ? 'descending' : 'ascending') : 'none';
  const alignCls = align === 'center' ? 'justify-center text-center' : (align === 'right' ? 'justify-end text-right' : 'justify-between text-left');
  const icon = isActive ? (activeDir === 'asc' ? '▲' : '▼') : '⇅';
  const iconCls = isActive ? 'text-[#0f4c3a] text-[11px]' : 'opacity-40 text-[11px]';
  return `
    <th scope="col" aria-sort="${ariaSort}" class="${extraClass}">
      <button type="button" onclick="${onClickJs}" class="w-full inline-flex items-center ${alignCls} gap-1 font-bold text-[#0f4c3a] hover:text-[#0b3b2e] hover:bg-[#f2ebda]/70 rounded px-1 py-0.5 transition">
        <span>${escapeHtml(label)}</span>
        <span aria-hidden="true" class="${iconCls}">${icon}</span>
      </button>
    </th>
  `;
}

function openStatusNilaiItem(teacherId, kelasKode, mapelArab) {
  if (state.authUser && state.authUser.role !== 'admin') return;
  if (!teacherId || !kelasKode || !mapelArab) return;
  state.mode = 'guru';
  state.activeTeacherId = teacherId;
  state.selectedKelasMengajar = kelasKode;
  state.selectedMapelMengajar = mapelArab;
  state.page = 'penilaian';
  renderModeButtons();
  renderSidebar();
  renderPage();
  const tr = state.teachers.find(t => t.id === teacherId);
  showToast(`Membuka Input Nilai ${kelasKode} (${tr ? tr.nama : teacherId})`, 'info');
}

