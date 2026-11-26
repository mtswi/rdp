// ===================== ACADEMIC YEAR CONFIG & HELPERS =====================
const ACADEMIC_YEAR_CONFIG = {
  startYear: 2024,
  yearsAhead: 5,
  minLastStartYear: 2029,
  storageKey: 'rdp_custom_academic_years'
};

function normalizeAcademicYear(val) {
  const s = String(val ?? '').trim();
  const m = /^(\d{4})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start < 2000 || start > 2100 || end !== start + 1) return null;
  return `${m[1]}/${m[2]}`;
}

function loadCustomAcademicYears() {
  try {
    const raw = localStorage.getItem(ACADEMIC_YEAR_CONFIG.storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAcademicYear).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function saveCustomAcademicYear(yearStr) {
  const norm = normalizeAcademicYear(yearStr);
  if (!norm) return null;
  try {
    const merged = Array.from(new Set([...loadCustomAcademicYears(), norm])).sort();
    localStorage.setItem(ACADEMIC_YEAR_CONFIG.storageKey, JSON.stringify(merged));
  } catch (e) { /* ignore storage errors */ }
  return norm;
}

function getAcademicYearOptions(extraYears = []) {
  const collected = new Set();
  const pushYear = (y) => {
    const norm = normalizeAcademicYear(y);
    if (norm) collected.add(norm);
  };
  (Array.isArray(extraYears) ? extraYears : [extraYears]).forEach(pushYear);
  if (typeof state !== 'undefined' && state.pesantren && state.pesantren.tahun) {
    pushYear(state.pesantren.tahun);
  }
  loadCustomAcademicYears().forEach(pushYear);

  const collectedStartYears = Array.from(collected).map(y => Number(y.slice(0, 4)));
  const maxStartYear = Math.max(
    ACADEMIC_YEAR_CONFIG.minLastStartYear,
    new Date().getFullYear() + ACADEMIC_YEAR_CONFIG.yearsAhead,
    ...(collectedStartYears.length ? collectedStartYears.map(y => y + 1) : [])
  );

  for (let y = ACADEMIC_YEAR_CONFIG.startYear; y <= maxStartYear; y++) {
    collected.add(`${y}/${y + 1}`);
  }
  return Array.from(collected).sort();
}

async function addCustomAcademicYear() {
  const existing = getAcademicYearOptions();
  const last = existing[existing.length - 1] || `${ACADEMIC_YEAR_CONFIG.minLastStartYear}/${ACADEMIC_YEAR_CONFIG.minLastStartYear + 1}`;
  const nextStart = Number(last.slice(0, 4)) + 1;
  const suggested = `${nextStart}/${nextStart + 1}`;
  const input = await openInputModal({
    title: 'Tambah Tahun Pelajaran',
    message: 'Tambahkan tahun pelajaran baru ke daftar pilihan. Format harus berupa dua tahun berurutan (YYYY/YYYY).',
    label: 'Tahun Pelajaran',
    defaultValue: suggested,
    placeholder: suggested,
    confirmText: 'Tambahkan',
    validate: (val) => normalizeAcademicYear(val)
      ? null
      : `Format tahun pelajaran tidak valid. Gunakan format YYYY/YYYY berurutan (contoh: ${suggested}).`
  });
  if (input === null) return;
  const normalized = normalizeAcademicYear(input);
  if (!normalized) return;
  saveCustomAcademicYear(normalized);
  const sel = document.getElementById('set-tahun');
  if (sel) {
    const options = getAcademicYearOptions([state.pesantren && state.pesantren.tahun, normalized]);
    sel.innerHTML = options.map(y => `<option value="${escapeHtml(y)}" ${y === normalized ? 'selected' : ''}>${escapeHtml(y)}</option>`).join('');
    sel.value = normalized;
  }
  showToast(`Tahun pelajaran ${normalized} ditambahkan. Klik "Simpan Pengaturan" untuk mengaktifkan.`);
}

// ===================== STATE =====================
const state = {
  authUser: null,
  usersList: [],
  usersRoleFilter: 'all',
  usersSearch: '',
  usersLoaded: false,
  mode: 'proktor',
  activeTeacherId: 'ahsin',
  page: 'dashboard',
  sidebarCollapsedDesktop: false,
  sidebarOpenMobile: false,
  openGroups: { lembaga: true, guru: true, siswa: true, rapor: true, kelas_menu: true, walikelas: true },
  selectedKelasMengajar: 'IX.B',
  selectedMapelMengajar: 'الرياضيات',
  selectedStudentId: 1,
  selectedRaporTingkat: '',
  selectedRaporKelas: '',
  selectedSiswaTingkat: '',
  selectedSiswaKelas: '',
  selectedPengampuTingkat: '',
  selectedPengampuKelas: '',
  assignSortKey: 'guru',
  assignSortDir: 'asc',
  assignPageSize: '10',
  assignPage: 1,
  statusSortKey: 'guru',
  statusSortDir: 'asc',
  raporPrintAll: false,
  raporSubTab: 'rapor',
  rankingSortKey: 'rank',
  rankingSortDir: 'asc',
  activitySearch: '',
  siswaSearch: '',
  statusSearch: '',
  statusFilter: 'all',
  dirtyForms: {},
  bobot: { harian: 60, pas: 40, kkm: 75 },

  pesantren: {
    nama: 'Rapor Digital Pesantren',
    namaArab: '',
    nspp: '',
    npsn: '',
    alamat: '',
    kotaArab: '',
    tanggalArab: '',
    kepala: '',
    kepalaArab: '',
    tahun: '2026/2027',
    semester: 'Ganjil',
    semesterArab: 'الأول',
    kurikulum: 'Kurikulum Pesantren',
    logoDataUrl: null,
    tanggalIso: '2025-12-20',
    watermarkType: 'logo',
    watermarkText: '',
    watermarkDataUrl: null,
    watermarkOpacity: 0.08,
    watermarkColor: 'color',
    watermarkSize: 300,
    watermarkFontSize: 24,
    nomorSkKejuaraan: '',
    predikatConfig: null
  },

  classes: [],
  subjects: [],
  teachers: [],
  assignments: [],
  students: [],
  mutatedStudents: [],
  siswaViewTab: 'aktif',
  activities: [],
  _mediaStamp: null
};

let _stateFetchSeq = 0;

function computeLocalMediaStamp(p) {
  const l = (p && p.logoDataUrl) ? String(p.logoDataUrl) : '';
  const w = (p && p.watermarkDataUrl) ? String(p.watermarkDataUrl) : '';
  return `${l.length}:${l.slice(0, 24)}:${w.length}:${w.slice(0, 24)}`;
}

function isSafeImageDataUrl(val) {
  return typeof val === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+=*$/i.test(val);
}

function sanitizeExcelCell(val) {
  if (typeof val !== 'string') return val;
  return /^[=+\-@\t\r]/.test(val) ? ("'" + val) : val;
}

function getActiveTeachers() {
  return (state.teachers || []).filter(t => t.active !== false);
}

function getEffectiveSubjects(kelasKode = null) {
  const subs = state.subjects || [];
  if (state.mode === 'siswa') return subs;
  const usedIds = new Set();
  const assignmentsPool = kelasKode
    ? (state.assignments || []).filter(a => a.kode === kelasKode)
    : (state.assignments || []);
  const studentsPool = kelasKode
    ? (state.students || []).filter(st => st.kelas === kelasKode)
    : (state.students || []);
  const usedMapel = new Set(assignmentsPool.map(a => a.mapel));
  for (const st of studentsPool) {
    if (!st.scores) continue;
    for (const [k, v] of Object.entries(st.scores)) {
      if (hasScoreValue(v)) usedIds.add(Number(k));
    }
  }
  return subs.filter(s => s.active !== false || usedIds.has(s.id) || usedMapel.has(s.namaArab));
}

function updateFooterPesantren() {
  const el = document.getElementById('footer-pesantren');
  if (el && state.pesantren) {
    el.textContent = `${state.pesantren.nama || 'Rapor Digital Pesantren'} • Tahun Pelajaran ${state.pesantren.tahun || '2026/2027'} (${state.pesantren.semester || 'Ganjil'})`;
  }
}

function resetPeriodCachedSelections() {
  state.selectedKelasMengajar = '';
  state.selectedMapelMengajar = '';
  state.selectedStudentId = null;
  state.selectedRaporTingkat = '';
  state.selectedRaporKelas = '';
  state.rankingSortKey = 'rank';
  state.rankingSortDir = 'asc';
  state.selectedSiswaTingkat = '';
  state.selectedSiswaKelas = '';
  state.siswaSearch = '';
  state.siswaViewTab = 'aktif';
  state.selectedPengampuTingkat = '';
  state.selectedPengampuKelas = '';
  state.filterAssignTeacherId = '';
  state.statusSearch = '';
  state.statusFilter = 'all';
  state.dirtyForms = {};
  state.assignPage = 1;
  state.nilaiUploadReport = null;
}

function clearClientSessionData(clearDrafts = false) {
  ++_stateFetchSeq;
  state.authUser = null;
  state.mode = 'proktor';
  state.page = 'dashboard';
  state.usersList = [];
  state.usersLoaded = false;
  state.classes = [];
  state.subjects = [];
  state.teachers = [];
  state.assignments = [];
  state.students = [];
  state.mutatedStudents = [];
  state.activities = [];
  state.activeTeacherId = '';
  state._mediaStamp = null;
  state.dirtyForms = {};
  resetPeriodCachedSelections();
  const main = document.getElementById('main-content');
  if (main) main.innerHTML = '';
  const nav = document.getElementById('sidebar-nav');
  if (nav) nav.innerHTML = '';
  const mbn = document.getElementById('mobile-bottom-nav');
  if (mbn) mbn.innerHTML = '';
  const ts = document.getElementById('teacher-switcher');
  if (ts) ts.innerHTML = '';
  const badge = document.getElementById('auth-user-badge');
  if (badge) badge.innerHTML = '';
  if (clearDrafts) {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rdp_draft_scores_')) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }
}

let _xlsxLoadPromise = null;
function ensureXlsxLoaded() {
  if (typeof XLSX !== 'undefined') return Promise.resolve(true);
  if (_xlsxLoadPromise) return _xlsxLoadPromise;
  _xlsxLoadPromise = new Promise((resolve) => {
    const finish = (ok) => {
      if (!ok) _xlsxLoadPromise = null;
      resolve(ok && typeof XLSX !== 'undefined');
    };
    const loadScript = (src, onFail) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => finish(true);
      s.onerror = onFail;
      document.head.appendChild(s);
    };
    const primary = location.protocol !== 'file:'
      ? '/vendor/xlsx.full.min.js'
      : 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    loadScript(primary, () => {
      if (primary.startsWith('/')) {
        loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', () => finish(false));
      } else {
        finish(false);
      }
    });
  });
  return _xlsxLoadPromise;
}

async function apiCall(method, url, body, opts = {}) {
  if (location.protocol === 'file:') {
    return method === 'GET' ? null : { ok: true, offline: true };
  }
  const silent = !!opts.silent;
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && data.error)
        ? data.error
        : (res.status === 503
          ? 'Server sedang sibuk / batas eksekusi terlampaui (HTTP 503). Silakan coba lagi.'
          : `Gagal menghubungi server (HTTP ${res.status})`);
      if (res.status === 401 && url !== '/api/me' && url !== '/api/login' && url !== '/api/logout') {
        clearClientSessionData(false);
        showLogin();
        if (!silent) showToast('Sesi berakhir, silakan login kembali');
      } else if (!silent && method !== 'GET') {
        showToast('Gagal: ' + msg);
      }
      console.warn('API error:', method, url, res.status, msg);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('API sync failed:', url, err);
    if (!silent && method !== 'GET') {
      showToast('Gagal terhubung ke server. Periksa koneksi Anda.');
    }
    return null;
  }
}

function savePesantrenPartial(fields = {}) {
  return apiCall('PUT', '/api/pesantren', fields);
}

function savePesantrenToDb(extra = {}) {
  return apiCall('PUT', '/api/pesantren', {
    ...state.pesantren,
    kkmDefault: state.bobot.kkm,
    ...extra
  });
}

function hasScoreValue(val) {
  return val !== undefined && val !== null && typeof val !== 'boolean' && String(val).trim() !== '' && Number.isFinite(Number(val));
}

function getMissingScoresForStudent(student) {
  if (!student) return [];
  return getEffectiveSubjects(student.kelas || null).filter(sub => !hasScoreValue(student.scores && student.scores[sub.id]));
}

// ===================== HELPERS =====================
function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function togglePasswordVisibility(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const showing = inp.type === 'text';
  inp.type = showing ? 'password' : 'text';
  if (btn) {
    const openIcon = btn.querySelector('.eye-open');
    const closedIcon = btn.querySelector('.eye-closed');
    if (openIcon) openIcon.classList.toggle('hidden', !showing);
    if (closedIcon) closedIcon.classList.toggle('hidden', showing);
  }
}

function compressImageDataUrl(dataUrl, opts = {}) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string') return resolve(dataUrl);
    const {
      maxDim = 360,
      quality = 0.8,
      grayscale = false,
      opacity = 1,
      flattenWhite = false
    } = opts;
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width || maxDim;
        let h = img.naturalHeight || img.height || maxDim;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        if (flattenWhite) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0.01, Math.min(1, Number(opacity ?? 1)));
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();

        if (grayscale) {
          const imgData = ctx.getImageData(0, 0, w, h);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            d[i] = g;
            d[i + 1] = g;
            d[i + 2] = g;
          }
          ctx.putImageData(imgData, 0, 0);
        }

        const outMime = flattenWhite ? 'image/jpeg' : (dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
        if (outMime === 'image/jpeg' && !flattenWhite) {
          // Ensure non-PNG transparent formats (e.g., WebP/GIF) don't turn solid black
          const bgCanvas = document.createElement('canvas');
          bgCanvas.width = w;
          bgCanvas.height = h;
          const bgCtx = bgCanvas.getContext('2d');
          if (bgCtx) {
            bgCtx.fillStyle = '#ffffff';
            bgCtx.fillRect(0, 0, w, h);
            bgCtx.drawImage(canvas, 0, 0);
            const bgResult = bgCanvas.toDataURL('image/jpeg', quality);
            return resolve(bgResult && isSafeImageDataUrl(bgResult) ? bgResult : null);
          }
        }
        const result = outMime === 'image/jpeg'
          ? canvas.toDataURL('image/jpeg', quality)
          : canvas.toDataURL('image/png');
        resolve(result && isSafeImageDataUrl(result) ? result : null);
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function bakeTextWatermarkDataUrl(m) {
  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
    }
    const w = 520;
    const h = 735; // Rasio A4
    const scale = w / 794;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const text = (m.watermarkText && m.watermarkText.trim()) ? m.watermarkText.trim() : (m.namaArab || m.nama || 'RDP');
    const rawFontSize = Math.min(64, Math.max(12, Number(m.watermarkFontSize || 24)));
    const fontSize = Math.max(8, Math.round(rawFontSize * scale));
    const opacity = Math.max(0.01, Math.min(1, Number(m.watermarkOpacity ?? 0.08)));
    const isGray = (m.watermarkColor || 'color') === 'grayscale';

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-24 * Math.PI) / 180);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = isGray ? '#334155' : '#0f4c3a';
    ctx.font = `bold ${fontSize}px "Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif`;
    try { ctx.direction = 'rtl'; } catch (_) {}
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textW = Math.max(60, ctx.measureText(text).width);
    const stepX = textW + Math.max(14, Math.round(28 * scale));
    const stepY = fontSize + Math.max(12, Math.round(24 * scale));
    const diag = Math.ceil(Math.hypot(w, h));

    let rowIdx = 0;
    for (let y = -diag; y <= diag; y += stepY) {
      const offsetX = (rowIdx % 2 === 1) ? stepX * 0.5 : 0;
      for (let x = -diag; x <= diag; x += stepX) {
        ctx.fillText(text, x + offsetX, y);
      }
      rowIdx++;
    }
    ctx.restore();

    return canvas.toDataURL('image/jpeg', 0.65);
  } catch (_) {
    return null;
  }
}

function hideToast() {
  const el = document.getElementById('toast');
  if (el) el.classList.add('hidden');
  clearTimeout(window._t);
}

function showToast(msg, type = 'auto') {
  const el = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  const iconEl = document.getElementById('toast-icon');
  if (!el || !msgEl) return;
  const text = String(msg ?? '');
  let variant = type;
  if (variant === 'auto') {
    if (/^(gagal|terjadi kesalahan|pop-up diblokir)|tidak valid|gagal/i.test(text)) variant = 'error';
    else if (/peringatan|cek typo|belum ada|minimal |kosong|terkunci|dibatalkan|penuh|wajib|tidak ditemukan/i.test(text)) variant = 'warning';
    else if (/menyiapkan|memproses|hubungi/i.test(text)) variant = 'info';
    else variant = 'success';
  }
  const styles = {
    success: { box: 'bg-[#0b3b2e] text-white border-[#c9a227]/50', icon: 'bg-emerald-500/25 text-emerald-200', symbol: '✓', ms: 3000 },
    error: { box: 'bg-rose-900 text-white border-rose-400/50', icon: 'bg-rose-500/30 text-rose-100', symbol: '✕', ms: 4600 },
    warning: { box: 'bg-amber-900 text-amber-50 border-amber-400/50', icon: 'bg-amber-400/30 text-amber-100', symbol: '⚠', ms: 4200 },
    info: { box: 'bg-slate-800 text-white border-slate-500/50', icon: 'bg-sky-400/25 text-sky-200', symbol: 'ℹ', ms: 3200 }
  };
  const cfg = styles[variant] || styles.success;
  el.className = `no-print fixed bottom-5 right-5 z-[90] max-w-sm px-4 py-3 rounded-xl shadow-xl border text-xs font-medium flex items-center gap-2.5 ${cfg.box}`;
  if (iconEl) {
    iconEl.className = `w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[11px] ${cfg.icon}`;
    iconEl.textContent = cfg.symbol;
  }
  msgEl.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(window._t);
  window._t = setTimeout(() => el.classList.add('hidden'), cfg.ms);
}

function setButtonBusy(btnOrId, busy, busyLabel = 'Memproses...') {
  const btn = typeof btnOrId === 'string' ? document.getElementById(btnOrId) : btnOrId;
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('rdp-btn-busy');
    btn.textContent = busyLabel;
  } else {
    btn.disabled = false;
    btn.classList.remove('rdp-btn-busy');
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }
  }
}

let _rdpModalState = null;

function openConfirmModal(opts = {}) {
  const {
    title = 'Konfirmasi',
    message = '',
    confirmText = 'Lanjutkan',
    cancelText = 'Batal',
    variant = 'primary',
    onConfirmSync = null
  } = opts;
  return _openRdpModalInternal({ mode: 'confirm', title, message, confirmText, cancelText, variant, onConfirmSync });
}

function openInputModal(opts = {}) {
  const {
    title = 'Masukkan Data',
    message = '',
    label = '',
    defaultValue = '',
    placeholder = '',
    inputType = 'text',
    confirmText = 'Simpan',
    cancelText = 'Batal',
    variant = 'primary',
    validate = null
  } = opts;
  return _openRdpModalInternal({ mode: 'input', title, message, label, defaultValue, placeholder, inputType, confirmText, cancelText, variant, validate });
}

function _openRdpModalInternal(cfg) {
  if (_rdpModalState) closeRdpModal(null);
  const overlay = document.getElementById('rdp-modal-overlay');
  const titleEl = document.getElementById('rdp-modal-title');
  const msgEl = document.getElementById('rdp-modal-message');
  const inputWrap = document.getElementById('rdp-modal-input-wrap');
  const inputLabel = document.getElementById('rdp-modal-input-label');
  const inputEl = document.getElementById('rdp-modal-input');
  const errEl = document.getElementById('rdp-modal-error');
  const cancelBtn = document.getElementById('rdp-modal-cancel');
  const confirmBtn = document.getElementById('rdp-modal-confirm');

  if (!overlay || !confirmBtn || !cancelBtn) {
    return Promise.resolve(cfg.mode === 'confirm' ? false : null);
  }

  const prevFocus = document.activeElement;
  if (titleEl) titleEl.textContent = cfg.title || 'Konfirmasi';
  if (msgEl) {
    msgEl.textContent = cfg.message || '';
    msgEl.classList.toggle('hidden', !cfg.message);
  }
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }
  if (inputWrap && inputEl) {
    if (cfg.mode === 'input') {
      inputWrap.classList.remove('hidden');
      if (inputLabel) {
        inputLabel.textContent = cfg.label || '';
        inputLabel.classList.toggle('hidden', !cfg.label);
      }
      inputEl.type = cfg.inputType || 'text';
      inputEl.value = cfg.defaultValue ?? '';
      inputEl.placeholder = cfg.placeholder || '';
      inputEl.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          confirmRdpModal();
        }
      };
    } else {
      inputWrap.classList.add('hidden');
      inputEl.value = '';
      inputEl.onkeydown = null;
    }
  }

  cancelBtn.textContent = cfg.cancelText || 'Batal';
  confirmBtn.textContent = cfg.confirmText || 'Lanjutkan';
  const variantClasses = {
    danger: 'px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold shadow-sm transition',
    warning: 'px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition',
    primary: 'px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-[#0b3b2e] text-white text-xs font-semibold shadow-sm transition'
  };
  confirmBtn.className = variantClasses[cfg.variant] || variantClasses.primary;

  overlay.classList.remove('hidden');

  return new Promise((resolve) => {
    _rdpModalState = { ...cfg, resolve, prevFocus };
    setTimeout(() => {
      if (cfg.mode === 'input' && inputEl) {
        inputEl.focus();
        if (inputEl.select) inputEl.select();
      } else {
        confirmBtn.focus();
      }
    }, 10);
  });
}

function confirmRdpModal() {
  if (!_rdpModalState) return;
  const st = _rdpModalState;
  if (st.mode === 'input') {
    const inputEl = document.getElementById('rdp-modal-input');
    const errEl = document.getElementById('rdp-modal-error');
    const rawVal = inputEl ? inputEl.value : '';
    if (typeof st.validate === 'function') {
      const errMsg = st.validate(rawVal);
      if (errMsg) {
        if (errEl) {
          errEl.textContent = errMsg;
          errEl.classList.remove('hidden');
        }
        if (inputEl) inputEl.focus();
        return;
      }
    }
    closeRdpModal(rawVal);
    return;
  }
  if (typeof st.onConfirmSync === 'function') {
    try { st.onConfirmSync(); } catch (_) {}
  }
  closeRdpModal(true);
}

function closeRdpModal(result) {
  const overlay = document.getElementById('rdp-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  const st = _rdpModalState;
  _rdpModalState = null;
  if (!st) return;
  const finalResult = st.mode === 'confirm' ? Boolean(result) : (result === undefined ? null : result);
  try {
    if (st.prevFocus && typeof st.prevFocus.focus === 'function') st.prevFocus.focus();
  } catch (_) {}
  st.resolve(finalResult);
}

function syncSidebarView() {
  const wrapper = document.getElementById('app-wrapper');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!wrapper) return;
  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    wrapper.classList.remove('desktop-sidebar-collapsed');
    wrapper.classList.toggle('mobile-sidebar-open', !!state.sidebarOpenMobile);
    if (backdrop) backdrop.classList.toggle('hidden', !state.sidebarOpenMobile);
    document.body.classList.toggle('mobile-drawer-lock', !!state.sidebarOpenMobile);
  } else {
    state.sidebarOpenMobile = false;
    wrapper.classList.remove('mobile-sidebar-open');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.classList.remove('mobile-drawer-lock');
    wrapper.classList.toggle('desktop-sidebar-collapsed', !!state.sidebarCollapsedDesktop);
  }
  if (typeof renderMobileBottomNav === 'function') {
    renderMobileBottomNav();
  }
}

function closeMobileSidebar() {
  state.sidebarOpenMobile = false;
  syncSidebarView();
}

function toggleSidebar() {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    state.sidebarOpenMobile = !state.sidebarOpenMobile;
  } else {
    state.sidebarCollapsedDesktop = !state.sidebarCollapsedDesktop;
    try {
      localStorage.setItem('rdp_sidebar_collapsed', state.sidebarCollapsedDesktop ? '1' : '0');
    } catch (_) {}
  }
  syncSidebarView();
}

// Inisialisasi state sidebar dari localStorage & gesture swipe pada Mobile
(function initResponsiveSidebarEvents() {
  try {
    state.sidebarCollapsedDesktop = localStorage.getItem('rdp_sidebar_collapsed') === '1';
  } catch (_) {}

  window.addEventListener('resize', () => {
    syncSidebarView();
  });

  // Swipe gesture pada layar HP (swipe kanan dari tepi kiri untuk buka menu, swipe kiri untuk tutup menu)
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const loginEl = document.getElementById('login-screen');
    if (!state.authUser || (loginEl && !loginEl.classList.contains('hidden'))) return;
    if (window.innerWidth >= 768 || !e.changedTouches || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (dy > 60) return; // Abaikan jika scroll vertikal
    if (!state.sidebarOpenMobile && touchStartX <= 24 && dx > 65) {
      state.sidebarOpenMobile = true;
      syncSidebarView();
    } else if (state.sidebarOpenMobile && dx < -65) {
      state.sidebarOpenMobile = false;
      syncSidebarView();
    }
  }, { passive: true });
})();

function resetLoginPasswordField() {
  const pw = document.getElementById('login-password');
  if (pw) {
    pw.value = '';
    pw.type = 'password';
  }
  const loginScreen = document.getElementById('login-screen');
  if (loginScreen) {
    const openIc = loginScreen.querySelector('.eye-open');
    const closedIc = loginScreen.querySelector('.eye-closed');
    if (openIc) openIc.classList.remove('hidden');
    if (closedIc) closedIc.classList.add('hidden');
  }
}

function showLogin() {
  resetLoginPasswordField();
  state.sidebarOpenMobile = false;
  syncSidebarView();
  const err = document.getElementById('login-error');
  if (err) { err.classList.add('hidden'); err.textContent = ''; }
  const brandImg = document.getElementById('login-brand-logo-full');
  if (brandImg && !brandImg.getAttribute('src') && brandImg.dataset && brandImg.dataset.src) {
    brandImg.setAttribute('src', brandImg.dataset.src);
  }
  const app = document.getElementById('app-wrapper');
  if (app) {
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
  }
  const skip = document.querySelector('.rdp-skip-link');
  if (skip) skip.setAttribute('tabindex', '-1');
  const loginEl = document.getElementById('login-screen');
  if (loginEl) {
    loginEl.classList.remove('hidden');
    loginEl.scrollTop = 0;
  }
  requestAnimationFrame(() => {
    const userInput = document.getElementById('login-username');
    if (userInput) userInput.focus();
  });
}
function closeLogin() {
  resetLoginPasswordField();
  const loginEl = document.getElementById('login-screen');
  if (loginEl) loginEl.classList.add('hidden');
  const app = document.getElementById('app-wrapper');
  if (app) {
    app.inert = false;
    app.removeAttribute('aria-hidden');
  }
  const skip = document.querySelector('.rdp-skip-link');
  if (skip) skip.removeAttribute('tabindex');
}

async function submitLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');
  errEl.classList.add('hidden');

  if (location.protocol === 'file:') {
    const role = username === 'admin' ? 'admin' : (username === 'siswa' ? 'siswa' : 'guru');
    const mockUser = { id: 1, username, role, displayName: username, teacherId: role === 'guru' ? 'ahsin' : null, studentId: role === 'siswa' ? 1 : null };
    applyAuthRole(mockUser);
    closeLogin();
    renderModeButtons(); renderSidebar(); renderPage();
    showToast(`Login offline sebagai ${role}`);
    return;
  }

  setButtonBusy(submitBtn, true, 'Memproses...');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errEl.textContent = data.error || 'Login gagal';
      errEl.classList.remove('hidden');
      return;
    }
    applyAuthRole(data.user);
    const hydrated = await loadDbState();
    if (!hydrated) {
      clearClientSessionData(false);
      errEl.textContent = 'Login berhasil, tetapi gagal memuat data dari server. Silakan coba lagi.';
      errEl.classList.remove('hidden');
      return;
    }
    closeLogin();
    showToast(`Selamat datang, ${data.user.displayName}`);
  } catch (err) {
    errEl.textContent = 'Gagal terhubung ke server';
    errEl.classList.remove('hidden');
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

async function logoutUser() {
  await apiCall('POST', '/api/logout', undefined, { silent: true });
  clearClientSessionData(true);
  const uInp = document.getElementById('login-username');
  if (uInp) uInp.value = '';
  loadPublicBranding();
  showLogin();
  showToast('Anda telah keluar');
}

function applyAuthRole(user) {
  state.authUser = user;
  const badge = document.getElementById('auth-user-badge');
  if (badge) {
    const roleLabel = user.role === 'admin' ? 'Admin' : (user.role === 'guru' ? 'Guru' : 'Siswa');
    badge.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] uppercase">${roleLabel}</span><span class="truncate max-w-[140px]">${escapeHtml(user.displayName)}</span>`;
  }
  if (user.role === 'admin') {
    state.mode = 'proktor';
    state.page = 'dashboard';
  } else if (user.role === 'guru') {
    state.mode = 'guru';
    state.activeTeacherId = user.teacherId || '';
    const mine = getTeacherAssignments(state.activeTeacherId);
    if (mine.length > 0) {
      state.selectedKelasMengajar = mine[0].kode;
      state.selectedMapelMengajar = mine[0].mapel;
    } else {
      state.selectedKelasMengajar = '';
      state.selectedMapelMengajar = '';
    }
    state.page = 'dashboard';
  } else if (user.role === 'siswa') {
    state.mode = 'siswa';
    state.selectedStudentId = user.studentId || null;
    state.page = 'siswa-rapor';
  }
}

function getCurrentTeacher() {
  if (state.authUser && state.authUser.role === 'guru') {
    return state.activeTeacherId ? (state.teachers.find(t => t.id === state.activeTeacherId) || null) : null;
  }
  return state.teachers.find(t => t.id === state.activeTeacherId) || state.teachers[0] || null;
}
function getWaliKelasKode() {
  if (state.mode !== 'guru') return null;
  const t = getCurrentTeacher();
  if (!t) return null;
  const cls = state.classes.find(c => c.waliId && c.waliId === t.id);
  return cls ? cls.kode : (t.waliKelas || null);
}
function getTeacherAssignments(tid = state.activeTeacherId) {
  if (!tid) return [];
  return state.assignments.filter(a => a.teacherId === tid);
}

function sortByLabel(arr, getLabel) {
  return [...arr].sort((a, b) => String(getLabel(a) || '').localeCompare(String(getLabel(b) || ''), 'id', { sensitivity: 'base', numeric: true }));
}

function sortClasses(arr) {
  return [...arr].sort((a, b) => {
    const tA = Number(a.tingkat) || 99;
    const tB = Number(b.tingkat) || 99;
    if (tA !== tB) return tA - tB;
    return String(a.kode || '').localeCompare(String(b.kode || ''), 'id', { sensitivity: 'base', numeric: true });
  });
}

function renderTeacherSwitcherOptions() {
  const sel = document.getElementById('teacher-switcher');
  if (!sel) return;
  sel.innerHTML = sortByLabel(state.teachers, t => t.nama)
    .map(t => `<option value="${escapeHtml(t.id)}" ${t.id === state.activeTeacherId ? 'selected' : ''}>${escapeHtml(t.nama)}</option>`)
    .join('');
}

const DEFAULT_PREDIKAT_LABELS = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'];
const PREDIKAT_KEYS = ['A', 'B', 'C', 'D', 'E'];

function getActiveKkm() {
  return Number.isFinite(Number(state.bobot && state.bobot.kkm))
    ? Math.min(100, Math.max(0, Math.round(Number(state.bobot.kkm))))
    : 75;
}

function buildDefaultPredikatConfig(kkmRaw, labelsOverride = null) {
  const kkm = Math.min(100, Math.max(0, Math.round(Number.isFinite(Number(kkmRaw)) ? Number(kkmRaw) : 75)));
  const span = 100 - kkm;
  const min2 = Math.min(100, Math.max(kkm, Math.round(kkm + span * 0.25)));
  const min1 = Math.min(100, Math.max(min2, Math.round(kkm + span * 0.50)));
  const min0 = Math.min(100, Math.max(min1, Math.round(kkm + span * 0.75)));
  const mins = [min0, min1, min2, kkm, 0];
  return PREDIKAT_KEYS.map((key, idx) => {
    const customLabel = Array.isArray(labelsOverride) && labelsOverride[idx] ? String(labelsOverride[idx]).trim() : '';
    return { key, min: mins[idx], label: customLabel || DEFAULT_PREDIKAT_LABELS[idx] };
  });
}

function getEffectivePredikatConfig() {
  const kkm = getActiveKkm();
  const cfg = state.pesantren && state.pesantren.predikatConfig;
  if (Array.isArray(cfg) && cfg.length === 5 && cfg.every(x => x && typeof x === 'object')) {
    return cfg.map((item, idx) => ({
      key: PREDIKAT_KEYS[idx],
      min: idx === 4 ? 0 : (idx === 3 ? kkm : (Number.isFinite(Number(item.min)) ? Math.min(100, Math.max(0, Math.round(Number(item.min)))) : 0)),
      label: String(item.label ?? '').trim() || DEFAULT_PREDIKAT_LABELS[idx]
    }));
  }
  return buildDefaultPredikatConfig(kkm);
}

function validatePredikatTiersClient(tiers, kkmRaw) {
  if (!Array.isArray(tiers) || tiers.length !== 5) return 'Konfigurasi predikat harus terdiri dari 5 tingkat (A–E)';
  const kkm = Math.min(100, Math.max(0, Math.round(Number.isFinite(Number(kkmRaw)) ? Number(kkmRaw) : 75)));
  for (let i = 0; i < 5; i++) {
    const lbl = String(tiers[i]?.label ?? '').trim();
    if (!lbl || lbl.length > 40) return `Nama predikat tingkat ${PREDIKAT_KEYS[i]} wajib diisi (maks 40 karakter)`;
  }
  const m0 = Math.round(Number(tiers[0]?.min));
  const m1 = Math.round(Number(tiers[1]?.min));
  const m2 = Math.round(Number(tiers[2]?.min));
  if (![m0, m1, m2].every(Number.isFinite)) return 'Batas minimal predikat harus berupa angka bulat 0–100';
  const strictOrder = (100 - kkm) >= 3;
  const ok = strictOrder
    ? (100 >= m0 && m0 > m1 && m1 > m2 && m2 > kkm)
    : (100 >= m0 && m0 >= m1 && m1 >= m2 && m2 >= kkm);
  if (!ok) return `Batas minimal predikat A (${m0}) > B (${m1}) > C (${m2}) > KKM (${kkm}) harus terurut menurun tanpa tumpang tindih.`;
  return null;
}

function formatPredikatRangeLabel(tiers, idx, kkm) {
  const m0 = Number(tiers[0]?.min);
  const m1 = Number(tiers[1]?.min);
  const m2 = Number(tiers[2]?.min);
  if (idx === 0) return m0 >= 100 ? '100' : `${m0} – 100`;
  if (idx === 1) return m1 < m0 ? `${m1} – ${m0 - 1}` : 'Tidak valid';
  if (idx === 2) return m2 < m1 ? `${m2} – ${m1 - 1}` : 'Tidak valid';
  if (idx === 3) return kkm < m2 ? `${kkm} – ${m2 - 1}` : (kkm === m2 && (100 - kkm) < 3 ? `${kkm}` : 'Tidak valid');
  return kkm > 0 ? `0 – ${kkm - 1}` : 'Tidak ada (KKM = 0)';
}

function getPredikatArab(nilai) {
  if (!hasScoreValue(nilai)) return '—';
  const n = Number(nilai);
  const kkm = getActiveKkm();
  const tiers = getEffectivePredikatConfig();
  if (n < kkm) return tiers[4].label;
  if (n >= tiers[0].min) return tiers[0].label;
  if (n >= tiers[1].min) return tiers[1].label;
  if (n >= tiers[2].min) return tiers[2].label;
  return tiers[3].label;
}

function getClassScoredContext(kelasKode) {
  if (!kelasKode) return null;
  const effSubjects = getEffectiveSubjects(kelasKode);
  const classStudents = (state.students || []).filter(s => s.kelas === kelasKode);
  const scoredSubIds = new Set();
  for (const st of classStudents) {
    if (!st || !st.scores) continue;
    for (const sub of effSubjects) {
      if (hasScoreValue(st.scores[sub.id])) scoredSubIds.add(sub.id);
    }
  }
  const classScoredSubjects = [];
  const classScoredSubjectIds = [];
  let classScoredJam = 0;
  let classUmumScoredCount = 0;
  let classUmumScoredJam = 0;
  let classSyariScoredCount = 0;
  let classSyariScoredJam = 0;
  for (const sub of effSubjects) {
    if (!scoredSubIds.has(sub.id)) continue;
    const jam = Number(sub.jam) || 0;
    classScoredSubjectIds.push(sub.id);
    classScoredSubjects.push({
      id: sub.id,
      namaId: sub.namaId,
      namaArab: sub.namaArab,
      kelompok: sub.kelompok,
      jam
    });
    classScoredJam += jam;
    if (sub.kelompok === 'syari') {
      classSyariScoredCount++;
      classSyariScoredJam += jam;
    } else {
      classUmumScoredCount++;
      classUmumScoredJam += jam;
    }
  }
  return {
    classScoredSubjectIds,
    classScoredSubjects,
    classScoredCount: classScoredSubjectIds.length,
    classScoredJam,
    classUmumScoredCount,
    classUmumScoredJam,
    classSyariScoredCount,
    classSyariScoredJam
  };
}

function computeStudentTotals(student, classCtxOverride = null) {
  const effSubjects = getEffectiveSubjects(student && student.kelas ? student.kelas : null);
  const classCtx = classCtxOverride || (student && student.classScoredOverride) || (student && student.kelas ? getClassScoredContext(student.kelas) : null);
  let totalJam = 0, scoredJam = 0, scoredCount = 0, totalWeighted = 0, totalRawSum = 0, syariWeighted = 0, umumWeighted = 0, missingCount = 0;
  let umumScoredJam = 0, umumScoredCount = 0, umumRawSum = 0;
  let syariScoredJam = 0, syariScoredCount = 0, syariRawSum = 0;
  const studentScoredIds = new Set();
  effSubjects.forEach(sub => {
    const jam = Number(sub.jam) || 0;
    totalJam += jam;
    const raw = student && student.scores ? student.scores[sub.id] : undefined;
    if (hasScoreValue(raw)) {
      const numRaw = Number(raw);
      const weighted = numRaw * jam;
      scoredJam += jam;
      scoredCount++;
      totalWeighted += weighted;
      totalRawSum += numRaw;
      studentScoredIds.add(sub.id);
      if (sub.kelompok === 'syari') {
        syariWeighted += weighted;
        syariScoredJam += jam;
        syariScoredCount++;
        syariRawSum += numRaw;
      } else {
        umumWeighted += weighted;
        umumScoredJam += jam;
        umumScoredCount++;
        umumRawSum += numRaw;
      }
    } else {
      missingCount++;
    }
  });
  const hasAnyScore = scoredCount > 0;
  const classScoredCount = classCtx ? (Number(classCtx.classScoredCount) || 0) : scoredCount;
  const classScoredJam = classCtx ? (Number(classCtx.classScoredJam) || 0) : scoredJam;
  const denomTotalJam = classScoredJam > 0 ? classScoredJam : scoredJam;
  const denomTotalCount = classScoredCount > 0 ? classScoredCount : scoredCount;
  const avg = hasAnyScore
    ? (denomTotalJam > 0 ? (totalWeighted / denomTotalJam) : (denomTotalCount > 0 ? (totalRawSum / denomTotalCount) : 0))
    : 0;

  const classUmumScoredCount = classCtx ? (Number(classCtx.classUmumScoredCount) || 0) : umumScoredCount;
  const classUmumScoredJam = classCtx ? (Number(classCtx.classUmumScoredJam) || 0) : umumScoredJam;
  const hasUmumScore = hasAnyScore && (umumScoredCount > 0 || classUmumScoredCount > 0);
  const denomUmumJam = classUmumScoredJam > 0 ? classUmumScoredJam : umumScoredJam;
  const denomUmumCount = classUmumScoredCount > 0 ? classUmumScoredCount : umumScoredCount;
  const avgUmum = hasUmumScore
    ? (denomUmumJam > 0 ? (umumWeighted / denomUmumJam) : (denomUmumCount > 0 ? (umumRawSum / denomUmumCount) : null))
    : null;

  const classSyariScoredCount = classCtx ? (Number(classCtx.classSyariScoredCount) || 0) : syariScoredCount;
  const classSyariScoredJam = classCtx ? (Number(classCtx.classSyariScoredJam) || 0) : syariScoredJam;
  const hasSyariScore = hasAnyScore && (syariScoredCount > 0 || classSyariScoredCount > 0);
  const denomSyariJam = classSyariScoredJam > 0 ? classSyariScoredJam : syariScoredJam;
  const denomSyariCount = classSyariScoredCount > 0 ? classSyariScoredCount : syariScoredCount;
  const avgSyari = hasSyariScore
    ? (denomSyariJam > 0 ? (syariWeighted / denomSyariJam) : (denomSyariCount > 0 ? (syariRawSum / denomSyariCount) : null))
    : null;

  let missingFromClassCount = 0;
  let missingSubjectNames = [];
  if (classCtx && Array.isArray(classCtx.classScoredSubjects)) {
    const missingClassSubjects = classCtx.classScoredSubjects.filter(sub => !studentScoredIds.has(sub.id));
    missingFromClassCount = missingClassSubjects.length;
    missingSubjectNames = missingClassSubjects.map(sub => sub.namaId || sub.namaArab);
  } else if (classCtx && Array.isArray(classCtx.classScoredSubjectIds)) {
    const ctxIdSet = new Set(classCtx.classScoredSubjectIds.map(Number));
    const missingClassSubjects = effSubjects.filter(sub => ctxIdSet.has(Number(sub.id)) && !studentScoredIds.has(sub.id));
    missingFromClassCount = missingClassSubjects.length;
    missingSubjectNames = missingClassSubjects.map(sub => sub.namaId || sub.namaArab);
  }

  return {
    totalJam,
    scoredJam,
    scoredCount,
    classScoredCount,
    classScoredJam,
    totalWeighted,
    syariWeighted,
    umumWeighted,
    umumScoredJam,
    syariScoredJam,
    avg,
    avgUmum,
    avgSyari,
    missingCount,
    missingFromClassCount,
    missingSubjectNames,
    hasAnyScore,
    hasUmumScore,
    hasSyariScore
  };
}

function getClassRankMap(kelasKode) {
  const pool = kelasKode ? (state.students || []).filter(s => s.kelas === kelasKode) : (state.students || []);
  const classCtx = kelasKode ? getClassScoredContext(kelasKode) : null;
  const list = pool.map(s => {
    const totals = computeStudentTotals(s, classCtx);
    return { id: s.id, totals };
  });
  // Urutkan berdasarkan Total Terbobot, lalu Mapel Agama (syari), lalu rata-rata
  list.sort((a, b) => (b.totals.totalWeighted - a.totals.totalWeighted) || (b.totals.syariWeighted - a.totals.syariWeighted) || (b.totals.avg - a.totals.avg));
  const byId = new Map();
  let curRank = 1;
  for (let i = 0; i < list.length; i++) {
    if (i > 0) {
      const prev = list[i - 1].totals;
      const cur = list[i].totals;
      const isTie = prev.totalWeighted === cur.totalWeighted
        && prev.syariWeighted === cur.syariWeighted
        && Math.abs(prev.avg - cur.avg) < 1e-9;
      if (!isTie) curRank = i + 1;
    }
    byId.set(list[i].id, { totals: list[i].totals, rank: curRank, totalStudents: list.length });
  }
  return { classCtx, totalStudents: list.length, byId };
}

function getStudentRank(studentId) {
  const target = state.students.find(s => s.id === studentId);
  if (target && target.rankOverride) {
    return target.rankOverride;
  }
  const rankMap = getClassRankMap(target && target.kelas ? target.kelas : null);
  const entry = rankMap.byId.get(studentId);
  if (!entry) return { rank: 1, totalStudents: rankMap.totalStudents };
  return { rank: entry.rank > 0 ? entry.rank : 1, totalStudents: entry.totalStudents };
}

function toArabicOrdinal(n) {
  const map = { 1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', 5: 'الخامس', 6: 'السادس', 7: 'السابع', 8: 'الثامن', 9: 'التاسع', 10: 'العاشر' };
  return map[n] || toArabicDigits(n);
}

function toArabicDigits(val) {
  const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(val ?? '').replace(/[0-9]/g, d => map[d]);
}

function toArabicKelas(kelasStr) {
  let k = String(kelasStr || '').trim();
  const gradeMap = { '7': 'السابع', 'VII': 'السابع', '8': 'الثامن', 'VIII': 'الثامن', '9': 'التاسع', 'IX': 'التاسع' };
  const secMap = { 'A': 'أ', 'B': 'ب', 'C': 'ج', 'D': 'د', 'E': 'هـ', 'F': 'و' };
  const m = k.match(/^(VII|VIII|IX|7|8|9)[\s.\-]*([A-F])$/i);
  if (m) {
    const gradeAr = gradeMap[m[1].toUpperCase()] || m[1];
    const secAr = secMap[m[2].toUpperCase()] || m[2];
    return `${gradeAr} - ${secAr}`;
  }
  return k;
}

function switchTeacher(teacherId) {
  if (state.authUser && state.authUser.role !== 'admin') return;
  state.activeTeacherId = teacherId;
  const mine = getTeacherAssignments(teacherId);
  if (mine.length > 0) {
    state.selectedKelasMengajar = mine[0].kode;
    state.selectedMapelMengajar = mine[0].mapel;
  } else {
    state.selectedKelasMengajar = '';
    state.selectedMapelMengajar = '';
  }
  state.page = 'dashboard';
  renderSidebar();
  renderPage();
  refreshStateFromServer(true);
  const curT = getCurrentTeacher();
  if (curT) showToast(`Login sebagai ${curT.nama}`);
}

function switchMode(mode) {
  if (state.authUser && state.authUser.role !== 'admin') return;
  state.mode = mode;
  state.page = 'dashboard';
  if (mode === 'guru') {
    const mine = getTeacherAssignments();
    if (mine.length > 0) {
      state.selectedKelasMengajar = mine[0].kode;
      state.selectedMapelMengajar = mine[0].mapel;
    } else {
      state.selectedKelasMengajar = '';
      state.selectedMapelMengajar = '';
    }
  } else if (mode === 'proktor') {
    refreshStateFromServer(true);
  }
  renderModeButtons();
  renderSidebar();
  renderPage();
}

function renderModeButtons() {
  const pBtn = document.getElementById('btn-mode-proktor');
  const gBtn = document.getElementById('btn-mode-guru');
  const modeWrap = document.getElementById('mode-switcher-wrap');
  const guruTabs = document.getElementById('guru-header-tabs');
  const bc = document.getElementById('proktor-breadcrumb');
  const bcPrefix = document.getElementById('breadcrumb-prefix');
  const tWrap = document.getElementById('teacher-switcher-wrap');
  const isAdmin = Boolean(state.authUser && state.authUser.role === 'admin');

  if (modeWrap) {
    modeWrap.classList.toggle('hidden', !isAdmin);
    modeWrap.classList.toggle('flex', isAdmin);
  }

  if (state.mode === 'siswa') {
    guruTabs.classList.add('hidden');
    bc.classList.remove('hidden');
    if (bcPrefix) bcPrefix.textContent = 'Santri / ';
    tWrap.classList.add('hidden'); tWrap.classList.remove('flex');
    return;
  }

  if (bcPrefix) bcPrefix.textContent = 'Proktor / ';

  if (state.mode === 'proktor') {
    pBtn.className = 'px-2 sm:px-2.5 py-1 rounded font-semibold transition bg-[#136048] text-white shadow-sm';
    gBtn.className = 'px-2 sm:px-2.5 py-1 rounded font-semibold transition text-slate-600 hover:text-slate-900';
    guruTabs.classList.add('hidden');
    bc.classList.remove('hidden');
    tWrap.classList.add('hidden'); tWrap.classList.remove('flex');
  } else {
    gBtn.className = 'px-2 sm:px-2.5 py-1 rounded font-semibold transition bg-[#84670f] text-white shadow-sm';
    pBtn.className = 'px-2 sm:px-2.5 py-1 rounded font-semibold transition text-slate-600 hover:text-slate-900';
    guruTabs.classList.remove('hidden');
    bc.classList.add('hidden');
    if (isAdmin) {
      tWrap.classList.remove('hidden'); tWrap.classList.add('flex');
      renderTeacherSwitcherOptions();
    } else {
      tWrap.classList.add('hidden'); tWrap.classList.remove('flex');
    }
  }
}

function getAllowedPagesForCurrentMode() {
  if (state.mode === 'siswa') return ['siswa-rapor', 'siswa-profil', 'siswa-password'];
  if (state.mode === 'guru') {
    const base = ['dashboard', 'bobot', 'penilaian'];
    if (getWaliKelasKode()) base.push('status-nilai-kelas', 'data-siswa', 'rapor-siswa', 'cetak-ranking', 'legger');
    return base;
  }
  return null; // proktor/admin can access all pages
}

function navigate(page, extra = {}) {
  const allowed = getAllowedPagesForCurrentMode();
  if (allowed && !allowed.includes(page)) {
    page = state.mode === 'siswa' ? 'siswa-rapor' : 'dashboard';
  }
  if (state.page !== page) state.dirtyForms = {};
  state.page = page;
  if (extra.kelas) state.selectedKelasMengajar = extra.kelas;
  if (extra.mapel) state.selectedMapelMengajar = extra.mapel;
  if (page === 'users') loadUsersList();
  if (['rapor-siswa', 'cetak-ranking', 'legger', 'kejuaraan', 'status-nilai', 'status-nilai-kelas', 'pengampu-kelas', 'siswa-rapor', 'penilaian'].includes(page)) {
    refreshStateFromServer(true, page === 'penilaian');
  }
  if (window.innerWidth < 768) {
    closeMobileSidebar();
  }
  renderSidebar();
  renderPage();
}

function toggleGroup(key) {
  if (window.innerWidth >= 768 && state.sidebarCollapsedDesktop) {
    state.sidebarCollapsedDesktop = false;
    try { localStorage.setItem('rdp_sidebar_collapsed', '0'); } catch (_) {}
    state.openGroups[key] = true;
    syncSidebarView();
  } else {
    state.openGroups[key] = !state.openGroups[key];
  }
  renderSidebar();
}

