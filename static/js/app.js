const SUPABASE_URL = 'https://mcpialjglophvgmjlrid.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcGlhbGpnbG9waHZnbWpscmlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjEzMDcsImV4cCI6MjEwNDE5NzMwN30.JC4zIWs4XJH0kaRdUIHj5hcY3DR3AA8DlCglwUfHhsY';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

const OFFICIAL_LINES = [
  'Melting',
  'Core Making',
  'RCS',
  'Moulding',
  'Sand Preparation',
  'Finishing',
  'Die Press'
];

const DEFAULT_TPM_FIELDS = [
  { id: 'nama', label: 'Nama', type: 'text', placeholder: 'Masukkan nama pelapor / auditor', required: true },
  { id: 'line', label: 'Production Line', type: 'select', options: OFFICIAL_LINES, required: true },
  { id: 'machine', label: 'Machine', type: 'text', placeholder: 'Contoh: Machine CNC Milling 01, Stamping Press 200T', required: true },
  { id: 'problem', label: 'Temuan/Problem', type: 'textarea', placeholder: 'Jelaskan abnormality atau temuan masalah pada mesin...', required: true },
  { id: 'tgl_temuan', label: 'Tanggal temuan', type: 'date', required: true },
  { id: 'ilustrasi', label: 'Ilustrasi temuan', type: 'file', accept: 'image/*', placeholder: 'Upload foto / media bukti temuan', required: false },
  { id: 'plan_perbaikan', label: 'Planning perbaikan', type: 'date', required: false },
  { id: 'part_butuh', label: 'Part yang dibutuhkan', type: 'text', placeholder: 'Contoh: Bearing 6204ZZ, O-Ring Seal Kit, Limit Switch', required: false },
  { id: 'type_part', label: 'Type part', type: 'text', placeholder: 'Contoh: Mechanical, Electrical, Pneumatic, Hydraulic', required: false },
  { id: 'countermeasure', label: 'Countermeasure', type: 'textarea', placeholder: 'Tindakan perbaikan yang dilakukan atau direncanakan...', required: false },
  { id: 'tgl_countermeasure', label: 'Tanggal countermeasure', type: 'date', required: false },
  { id: 'status', label: 'Status temuan', type: 'select', options: ['On progress', 'Close'], required: true }
];

let activeMediaData = {};
let currentFields = JSON.parse(localStorage.getItem('tpm_form_fields')) || [...DEFAULT_TPM_FIELDS];
let responses = [];
let isSyncing = false;
let isSubmitting = false;
let activeDetailId = null;

// Chart Instances
let lineBarChartInstance = null;
let monthlyTrendChartInstance = null;
let statusDonutChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!currentFields.some(f => f.id === 'line')) {
    currentFields = [...DEFAULT_TPM_FIELDS];
    localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields));
  }
  initClock();
  renderFormFiller();
  renderDashboard();
  renderBuilderCanvas();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  
  const today = new Date().toISOString().split('T')[0];
  const tglTemuanEl = document.getElementById('tgl_temuan');
  if (tglTemuanEl && !tglTemuanEl.value) tglTemuanEl.value = today;
  
  const savedTheme = localStorage.getItem('theme_preference') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  
  syncFromBackend();
  setInterval(syncFromBackend, 10000);
});

// Clock Manager
function initClock() {
  function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('realtime-clock');
    const dateEl = document.getElementById('realtime-date');
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
    }
    if (dateEl) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateEl.textContent = now.toLocaleDateString('id-ID', options);
    }
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// Fiscal Year Helpers (April → March)
function getFiscalYear(dateObjOrStr) {
  if (!dateObjOrStr) dateObjOrStr = new Date();
  const d = new Date(dateObjOrStr);
  if (isNaN(d.getTime())) return getFiscalYear(new Date());
  const month = d.getMonth() + 1; // 1 - 12
  const year = d.getFullYear();
  if (month >= 4) {
    return `FY ${year}/${year + 1}`;
  } else {
    return `FY ${year - 1}/${year}`;
  }
}

// Check 3 Calendar Months Overdue Rule
function isFindingOverdue(item, evalDate = new Date()) {
  if (item.status === 'Close' || item.status === 'Closed') return false;
  if (!item.tgl_temuan) return false;
  
  const start = new Date(item.tgl_temuan);
  const end = new Date(evalDate);
  if (isNaN(start.getTime())) return false;
  
  const targetDate = new Date(start);
  targetDate.setMonth(targetDate.getMonth() + 3);
  return end > targetDate;
}

function getFindingAgeText(tgl_temuan_str, evalDate = new Date()) {
  if (!tgl_temuan_str) return '-';
  const start = new Date(tgl_temuan_str);
  const end = new Date(evalDate);
  if (isNaN(start.getTime())) return '-';
  
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months >= 1) {
    const remDays = Math.max(0, end.getDate() - start.getDate());
    return `${months} bulan ${remDays} hari`;
  }
  return `${diffDays} hari`;
}

function calculateAvgClosureDays(findingsList) {
  const closedItems = findingsList.filter(r => (r.status === 'Close' || r.status === 'Closed') && r.tgl_temuan && r.tgl_countermeasure);
  if (closedItems.length === 0) return '-';
  
  let totalDays = 0;
  let validCount = 0;
  closedItems.forEach(r => {
    const start = new Date(r.tgl_temuan);
    const end = new Date(r.tgl_countermeasure);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
      const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
      totalDays += days;
      validCount++;
    }
  });
  
  if (validCount === 0) return '-';
  return `${Math.round(totalDays / validCount)} Hari`;
}

// Load Data from Supabase
async function syncFromBackend() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/findings?select=*&order=id.desc`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    responses = await res.json();
    
    responses.forEach(r => {
      if (!r.line) r.line = 'Unassigned';
    });
    
    updateFiscalYearFilterOptions();
    renderDashboard();
    updateSyncBadge('online');
  } catch (err) {
    console.warn('Sync error:', err);
    updateSyncBadge('offline');
  } finally {
    isSyncing = false;
  }
}

function updateSyncBadge(status) {
  const badge = document.getElementById('cloud-sync-badge');
  if (!badge) return;
  if (status === 'online') {
    badge.className = 'badge badge-closed';
    badge.innerHTML = '<i data-lucide="cloud"></i> 🟢 Supabase Cloud Synced';
  } else {
    badge.className = 'badge badge-open';
    badge.innerHTML = '<i data-lucide="wifi-off"></i> 🔴 Cloud Disconnected';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateFiscalYearFilterOptions() {
  const fySelect = document.getElementById('fy-filter');
  if (!fySelect) return;
  
  const currentFY = getFiscalYear(new Date());
  const fySet = new Set();
  fySet.add(currentFY);
  
  responses.forEach(r => {
    if (r.tgl_temuan) {
      fySet.add(getFiscalYear(r.tgl_temuan));
    }
  });
  
  const sortedFY = Array.from(fySet).sort().reverse();
  const currentVal = fySelect.value || currentFY;
  fySelect.innerHTML = sortedFY.map(fy => `<option value="${fy}">${fy}</option>`).join('');
  fySelect.value = fySet.has(currentVal) ? currentVal : currentFY;
}

function onDashboardFilterChange() {
  renderDashboard();
}

function getFilteredResponses() {
  const fySelect = document.getElementById('fy-filter');
  const monthSelect = document.getElementById('month-filter');
  
  const selectedFY = fySelect ? fySelect.value : getFiscalYear(new Date());
  const selectedMonth = monthSelect ? monthSelect.value : 'ALL';
  
  return responses.filter(r => {
    if (!r.tgl_temuan) return selectedFY === getFiscalYear(new Date());
    const rFY = getFiscalYear(r.tgl_temuan);
    if (rFY !== selectedFY) return false;
    
    if (selectedMonth !== 'ALL') {
      const d = new Date(r.tgl_temuan);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth() + 1;
        if (m.toString() !== selectedMonth) return false;
      }
    }
    return true;
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-page').forEach(page => page.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(btn => btn.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);
  const targetMobileNav = document.getElementById(`mobile-nav-${tabId}`);

  if (targetTab) targetTab.style.display = 'block';
  if (targetNav) targetNav.classList.add('active');
  if (targetMobileNav) targetMobileNav.classList.add('active');

  const titles = {
    filler: { title: 'Form Follow Up Temuan TPM', subtitle: 'Input data temuan abnormality & planning perbaikan' },
    dashboard: { title: 'Web Dashboard Follow Up TPM', subtitle: 'Monitoring real-time status temuan & perbaikan mesin' },
    builder: { title: 'Form Builder Studio', subtitle: 'Kustomisasi struktur field & kriteria form temuan' },
    settings: { title: 'Pengaturan & Demo Data', subtitle: 'Kelola data laporan & simulasi sampel' }
  };

  if (titles[tabId]) {
    document.getElementById('page-title').textContent = titles[tabId].title;
    document.getElementById('page-subtitle').textContent = titles[tabId].subtitle;
  }
  if (tabId === 'dashboard') syncFromBackend();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme_preference', next);
  updateThemeIcon(next);
  renderDashboard();
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon && typeof lucide !== 'undefined') {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

function renderFormFiller() {
  const container = document.getElementById('dynamic-form-fields');
  if (!container) return;
  container.innerHTML = '';
  currentFields.forEach(field => {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    const label = document.createElement('label');
    label.className = 'form-label';
    label.innerHTML = `${field.label}${field.required ? ' <span class="required">*</span>' : ''}`;
    formGroup.appendChild(label);
    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea'); input.className = 'form-textarea'; input.rows = 3;
    } else if (field.type === 'select') {
      input = document.createElement('select'); input.className = 'form-select';
      const opts = field.options || ['On progress', 'Close'];
      opts.forEach(opt => {
        const option = document.createElement('option'); option.value = opt; option.textContent = opt; input.appendChild(option);
      });
    } else if (field.type === 'file') {
      input = document.createElement('input'); input.type = 'file'; input.accept = field.accept || 'image/*'; input.className = 'form-input';
      const previewDiv = document.createElement('div'); previewDiv.id = `preview-${field.id}`; previewDiv.style.marginTop = '0.5rem';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            activeMediaData[field.id] = event.target.result;
            previewDiv.innerHTML = `<div style="position: relative; display: inline-block;"><img src="${event.target.result}" style="max-height: 140px; border-radius: var(--radius-md); border: 2px solid var(--primary); object-fit: cover;"><span style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.7rem; cursor: pointer;" onclick="clearMediaPreview('${field.id}')">✕</span></div>`;
          };
          reader.readAsDataURL(file);
        }
      };
      formGroup.appendChild(input); formGroup.appendChild(previewDiv); container.appendChild(formGroup); return;
    } else {
      input = document.createElement('input'); input.type = field.type || 'text'; input.className = 'form-input';
    }
    input.id = field.id; input.name = field.id;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.required) input.required = true;
    formGroup.appendChild(input); container.appendChild(formGroup);
  });
}

function clearMediaPreview(fieldId) {
  delete activeMediaData[fieldId];
  const previewDiv = document.getElementById(`preview-${fieldId}`);
  if (previewDiv) previewDiv.innerHTML = '';
  const fileInput = document.getElementById(fieldId);
  if (fileInput) fileInput.value = '';
}

function submitTpmForm() {
  if (isSubmitting) return;
  const form = document.getElementById('tpm-submit-form');
  if (!form) return;
  if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const fakeEvent = { preventDefault: () => {}, target: form };
  handleFormSubmit(fakeEvent);
}

// SUBMIT - POST to Supabase
async function handleFormSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;

  const btn = document.getElementById('btn-submit-tpm');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2"></i> Menyimpan...'; }

  const formData = {};
  currentFields.forEach(field => {
    if (field.type === 'file') formData[field.id] = activeMediaData[field.id] || '';
    else { const el = document.getElementById(field.id); formData[field.id] = el ? el.value.trim() : ''; }
  });

  if (!formData.line) formData.line = 'Unassigned';
  if (!formData.status) formData.status = 'On progress';

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(formData)
    });
    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error('Save failed: ' + res.status + ' ' + errTxt);
    }
    
    await syncFromBackend();
    showToast('✅ Laporan temuan TPM berhasil disimpan!', 'success');
    switchTab('dashboard');

    const form = document.getElementById('tpm-submit-form');
    if (form) form.reset();
    activeMediaData = {};
    document.querySelectorAll('[id^="preview-"]').forEach(el => el.innerHTML = '');
    const today = new Date().toISOString().split('T')[0];
    const tglTemuanEl = document.getElementById('tgl_temuan'); if (tglTemuanEl) tglTemuanEl.value = today;
  } catch (err) {
    showToast('❌ Gagal menyimpan: ' + err.message, 'error');
  } finally {
    isSubmitting = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i> Kirim Ke Web Dashboard'; if (typeof lucide !== 'undefined') lucide.createIcons(); }
  }
}

// MAIN DASHBOARD RENDERER
function renderDashboard() {
  const filteredList = getFilteredResponses();
  
  const total = filteredList.length;
  const onProgress = filteredList.filter(r => r.status === 'On progress').length;
  const closed = filteredList.filter(r => r.status === 'Close' || r.status === 'Closed').length;
  const completionRate = total > 0 ? Math.round((closed / total) * 100) : 0;
  const overdueCount = filteredList.filter(r => isFindingOverdue(r)).length;
  const avgClosureDays = calculateAvgClosureDays(filteredList);

  // Update Top KPI Cards
  const statTotal = document.getElementById('stat-total'); if (statTotal) statTotal.textContent = total;
  const statProgress = document.getElementById('stat-progress'); if (statProgress) statProgress.textContent = onProgress;
  const statClosed = document.getElementById('stat-closed'); if (statClosed) statClosed.textContent = closed;
  const statRate = document.getElementById('stat-rate'); if (statRate) statRate.textContent = `${completionRate}%`;
  const statOverdue = document.getElementById('stat-overdue'); if (statOverdue) statOverdue.textContent = overdueCount;
  const statAvgClosure = document.getElementById('stat-avg-closure'); if (statAvgClosure) statAvgClosure.textContent = avgClosureDays;
  
  // Highlight Overdue Card if > 0
  const cardOverdue = document.getElementById('card-stat-overdue');
  if (cardOverdue) {
    if (overdueCount > 0) {
      cardOverdue.style.borderColor = 'var(--danger)';
      cardOverdue.style.background = 'var(--danger-light)';
    } else {
      cardOverdue.style.borderColor = 'var(--border-color)';
      cardOverdue.style.background = 'var(--bg-card-solid)';
    }
  }

  // Update Progress Penanggulangan Card
  const progressPctBadge = document.getElementById('progress-pct-badge');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressDetailText = document.getElementById('progress-detail-text');
  
  if (total === 0) {
    if (progressPctBadge) progressPctBadge.textContent = 'N/A';
    if (progressBarFill) progressBarFill.style.width = '0%';
    if (progressDetailText) progressDetailText.textContent = '0 Closed / 0 Total Temuan';
  } else {
    if (progressPctBadge) progressPctBadge.textContent = `${completionRate}%`;
    if (progressBarFill) progressBarFill.style.width = `${completionRate}%`;
    if (progressDetailText) progressDetailText.textContent = `${closed} Closed / ${total} Total Temuan`;
  }

  // Update Judgement Card (O / X)
  const judgementSymbolBox = document.getElementById('judgement-symbol-box');
  const judgementStatusBadge = document.getElementById('judgement-status-badge');
  const judgementMessage = document.getElementById('judgement-message');
  
  if (overdueCount > 0) {
    if (judgementSymbolBox) {
      judgementSymbolBox.className = 'judgement-symbol-box judgement-ng';
      judgementSymbolBox.textContent = 'X';
    }
    if (judgementStatusBadge) {
      judgementStatusBadge.style.color = 'var(--danger)';
      judgementStatusBadge.textContent = 'X (NG)';
    }
    if (judgementMessage) judgementMessage.textContent = `Ada ${overdueCount} temuan terhambat (> 3 bulan)`;
  } else {
    if (judgementSymbolBox) {
      judgementSymbolBox.className = 'judgement-symbol-box judgement-ok';
      judgementSymbolBox.textContent = 'O';
    }
    if (judgementStatusBadge) {
      judgementStatusBadge.style.color = 'var(--success)';
      judgementStatusBadge.textContent = 'O (OK)';
    }
    if (judgementMessage) {
      judgementMessage.textContent = total === 0 ? 'No finding recorded' : 'Semua temuan tertanggulangi tepat waktu (< 3 bulan)';
    }
  }

  // Render Charts
  renderLineBarChart(filteredList);
  renderMonthlyTrendChart();
  renderStatusDonutChart(closed, onProgress);
  renderLineRanking(filteredList);
  renderOverduePanel(filteredList);
  renderRecentFindings(filteredList);

  // Main Findings Table
  const emptyState = document.getElementById('empty-state');
  if (filteredList.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
  } else {
    if (emptyState) emptyState.style.display = 'none';
  }
  renderTableData(filteredList);
}

// CHART 1: Grouped Bar Chart by Line
function renderLineBarChart(filteredList) {
  const ctx = document.getElementById('chart-line-performance');
  if (!ctx) return;
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  
  const lines = [...OFFICIAL_LINES];
  const totalCounts = lines.map(line => filteredList.filter(r => r.line === line).length);
  const closedCounts = lines.map(line => filteredList.filter(r => r.line === line && (r.status === 'Close' || r.status === 'Closed')).length);

  if (lineBarChartInstance) lineBarChartInstance.destroy();
  
  lineBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: lines,
      datasets: [
        {
          label: 'Total Temuan',
          data: totalCounts,
          backgroundColor: '#2563eb',
          borderRadius: 6
        },
        {
          label: 'Closed / Follow Up',
          data: closedCounts,
          backgroundColor: '#10b981',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor, font: { family: 'Inter', weight: 600 } } },
        tooltip: {
          callbacks: {
            footer: (items) => {
              const idx = items[0].dataIndex;
              const tot = totalCounts[idx];
              const cls = closedCounts[idx];
              const rate = tot > 0 ? Math.round((cls / tot) * 100) : 0;
              return `Achievement: ${rate}% (${cls}/${tot})`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { family: 'Inter' } }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
}

// CHART 2: Monthly Trend Line Chart (12 Months FY: Apr -> Mar)
function renderMonthlyTrendChart() {
  const ctx = document.getElementById('chart-monthly-trend');
  if (!ctx) return;
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  
  const fySelect = document.getElementById('fy-filter');
  const selectedFY = fySelect ? fySelect.value : getFiscalYear(new Date());
  
  const fyResponses = responses.filter(r => r.tgl_temuan && getFiscalYear(r.tgl_temuan) === selectedFY);
  
  const fyMonths = [
    { m: 4, name: 'Apr' }, { m: 5, name: 'Mei' }, { m: 6, name: 'Jun' },
    { m: 7, name: 'Jul' }, { m: 8, name: 'Agu' }, { m: 9, name: 'Sep' },
    { m: 10, name: 'Okt' }, { m: 11, name: 'Nov' }, { m: 12, name: 'Des' },
    { m: 1, name: 'Jan' }, { m: 2, name: 'Feb' }, { m: 3, name: 'Mar' }
  ];
  
  const totalTrend = [];
  const closedTrend = [];
  
  fyMonths.forEach(fm => {
    const monthItems = fyResponses.filter(r => {
      const d = new Date(r.tgl_temuan);
      return !isNaN(d.getTime()) && (d.getMonth() + 1) === fm.m;
    });
    totalTrend.push(monthItems.length);
    closedTrend.push(monthItems.filter(r => r.status === 'Close' || r.status === 'Closed').length);
  });

  if (monthlyTrendChartInstance) monthlyTrendChartInstance.destroy();

  monthlyTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: fyMonths.map(fm => fm.name),
      datasets: [
        {
          label: 'Total Temuan',
          data: totalTrend,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Closed',
          data: closedTrend,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor } }
      },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, precision: 0 }, grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
}

// CHART 3: Status Donut Chart
function renderStatusDonutChart(closed, onProgress) {
  const ctx = document.getElementById('chart-status-donut');
  if (!ctx) return;
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#475569';

  if (statusDonutChartInstance) statusDonutChartInstance.destroy();

  statusDonutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Closed', 'On Progress'],
      datasets: [{
        data: [closed, onProgress],
        backgroundColor: ['#10b981', '#f59e0b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { size: 10 } } }
      },
      cutout: '70%'
    }
  });
}

// Line Performance Ranking List
function renderLineRanking(filteredList) {
  const container = document.getElementById('line-ranking-list');
  if (!container) return;
  
  const rankingData = OFFICIAL_LINES.map(line => {
    const lineItems = filteredList.filter(r => r.line === line);
    const total = lineItems.length;
    const closed = lineItems.filter(r => r.status === 'Close' || r.status === 'Closed').length;
    const rate = total > 0 ? Math.round((closed / total) * 100) : 0;
    return { line, total, closed, rate };
  });

  rankingData.sort((a, b) => b.rate - a.rate || b.total - a.total);

  container.innerHTML = rankingData.map((item, idx) => {
    const rankClass = idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : '';
    return `
      <div class="ranking-item">
        <span class="rank-badge ${rankClass}">#${idx + 1}</span>
        <span style="font-weight: 600; flex: 1; color: var(--text-main); font-size: 0.825rem;">${item.line}</span>
        <div style="width: 70px; height: 6px; background: var(--bg-card); border-radius: 3px; overflow: hidden;">
          <div style="width: ${item.rate}%; height: 100%; background: var(--primary);"></div>
        </div>
        <span style="font-weight: 700; font-size: 0.8rem; color: var(--primary); width: 38px; text-align: right;">${item.rate}%</span>
      </div>
    `;
  }).join('');
}

// Overdue Panel (> 3 Bulan)
function renderOverduePanel(filteredList) {
  const container = document.getElementById('overdue-panel-list');
  const badge = document.getElementById('overdue-count-badge');
  if (!container) return;

  const overdueList = filteredList.filter(r => isFindingOverdue(r));
  if (badge) badge.textContent = `${overdueList.length} Items`;

  if (overdueList.length === 0) {
    container.innerHTML = `
      <div style="padding: 1rem; text-align: center; color: var(--success); font-weight: 600; font-size: 0.875rem;">
        ✓ Tidak ada temuan yang terlambat (> 3 bulan). Semua penanggulangan berjalan lancar!
      </div>
    `;
    return;
  }

  container.innerHTML = overdueList.map(item => {
    const ageText = getFindingAgeText(item.tgl_temuan);
    return `
      <div class="overdue-item">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
          <strong style="color: var(--danger); font-size: 0.875rem;">${escapeHtml(item.machine)} (${escapeHtml(item.line)})</strong>
          <span class="badge badge-open">Usia: ${ageText}</span>
        </div>
        <div style="font-size: 0.825rem; color: var(--text-main); margin-bottom: 0.25rem;">
          <strong>Problem:</strong> ${escapeHtml(item.problem)}
        </div>
        <div style="font-size: 0.775rem; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span>Pelapor: ${escapeHtml(item.nama)} | Tgl: ${formatDate(item.tgl_temuan)}</span>
          <button class="btn btn-secondary btn-sm" onclick="viewDetail('${item.id}')" style="padding: 0.15rem 0.4rem; font-size: 0.75rem;">Detail</button>
        </div>
      </div>
    `;
  }).join('');
}

// Recent Findings List (Latest 5)
function renderRecentFindings(filteredList) {
  const container = document.getElementById('recent-findings-list');
  if (!container) return;

  const recent = filteredList.slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = '<div style="padding: 0.75rem; color: var(--text-muted); text-align: center;">Belum ada data.</div>';
    return;
  }

  container.innerHTML = `
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.825rem;">
        <thead>
          <tr style="background: var(--bg-input); border-bottom: 1px solid var(--border-color);">
            <th style="padding: 0.5rem; text-align: left;">Line</th>
            <th style="padding: 0.5rem; text-align: left;">Machine</th>
            <th style="padding: 0.5rem; text-align: left;">Problem</th>
            <th style="padding: 0.5rem; text-align: left;">Tgl</th>
            <th style="padding: 0.5rem; text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(item => `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 0.5rem;"><strong>${escapeHtml(item.line)}</strong></td>
              <td style="padding: 0.5rem;">${escapeHtml(item.machine)}</td>
              <td style="padding: 0.5rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.problem)}</td>
              <td style="padding: 0.5rem;">${formatDate(item.tgl_temuan)}</td>
              <td style="padding: 0.5rem; text-align: center;">
                <span class="badge ${item.status === 'Close' || item.status === 'Closed' ? 'badge-closed' : 'badge-onprogress'}">${escapeHtml(item.status)}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function scrollToFullTable() {
  const tableEl = document.getElementById('search-input');
  if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
}

function renderTableData(dataList) {
  const tableBody = document.getElementById('response-table-body');
  const mobileContainer = document.getElementById('mobile-response-cards');
  if (tableBody) tableBody.innerHTML = '';
  if (mobileContainer) mobileContainer.innerHTML = '';

  dataList.forEach((item, index) => {
    const isClosed = item.status === 'Close' || item.status === 'Closed';
    const hasMedia = item.ilustrasi && item.ilustrasi.length > 0;
    if (tableBody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align: center;"><input type="checkbox" class="row-checkbox" value="${item.id}" onchange="updateSelectedCount()"></td>
        <td><strong>#${item.id || (index + 1)}</strong></td>
        <td>${formatDate(item.tgl_temuan)}</td>
        <td><strong>${escapeHtml(item.nama || '-')}</strong></td>
        <td><span class="badge" style="background: var(--primary-light); color: var(--primary); font-weight: 700;">${escapeHtml(item.line || 'Unassigned')}</span></td>
        <td><span class="badge" style="background: var(--bg-input); border: 1px solid var(--border-color);">${escapeHtml(item.machine || '-')}</span></td>
        <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.problem || '-')}</td>
        <td style="text-align: center;">${hasMedia ? `<img src="${item.ilustrasi}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; cursor: pointer; border: 1px solid var(--primary);" onclick="viewDetail('${item.id}')" title="Klik untuk lihat foto">` : '<span style="color:var(--text-light)">-</span>'}</td>
        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.countermeasure || '-')}</td>
        <td>${formatDate(item.tgl_countermeasure)}</td>
        <td>
          <select class="form-select" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; font-weight: 600; width: auto;" onchange="updateItemStatus('${item.id}', this.value)">
            <option value="On progress" ${!isClosed ? 'selected' : ''}>🟡 On progress</option>
            <option value="Close" ${isClosed ? 'selected' : ''}>🟢 Close</option>
          </select>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="viewDetail('${item.id}')" title="Lihat Detail"><i data-lucide="eye"></i> Detail</button>
          <button class="btn btn-danger btn-sm" onclick="deleteResponse('${item.id}')" title="Hapus Laporan Ini"><i data-lucide="trash-2"></i> Hapus</button>
        </td>
      `;
      tableBody.appendChild(tr);
    }
    if (mobileContainer) {
      const card = document.createElement('div');
      card.className = 'mobile-response-card';
      card.innerHTML = `
        <div class="mobile-card-header">
          <div>
            <span class="badge" style="background: var(--primary-light); color: var(--primary); font-weight: 700; font-size: 0.7rem; margin-right: 0.35rem;">${escapeHtml(item.line || 'Unassigned')}</span>
            <span class="mobile-card-title">${escapeHtml(item.machine || 'Machine')}</span>
          </div>
          <select class="form-select" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; font-weight: 600; width: auto;" onchange="updateItemStatus('${item.id}', this.value)">
            <option value="On progress" ${!isClosed ? 'selected' : ''}>🟡 On progress</option>
            <option value="Close" ${isClosed ? 'selected' : ''}>🟢 Close</option>
          </select>
        </div>
        <div class="mobile-card-detail">
          <div><strong>Pelapor:</strong> ${escapeHtml(item.nama || '-')} | <strong>Tgl:</strong> ${formatDate(item.tgl_temuan)}</div>
          <div style="margin-top: 0.35rem; color: var(--text-main);"><strong>Problem:</strong> ${escapeHtml(item.problem || '-')}</div>
          ${hasMedia ? `<div style="margin-top: 0.5rem;"><img src="${item.ilustrasi}" style="width: 100%; max-height: 160px; border-radius: var(--radius-md); object-fit: cover;"></div>` : ''}
          <div style="margin-top: 0.35rem; color: var(--primary);"><strong>Countermeasure:</strong> ${escapeHtml(item.countermeasure || '-')}</div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
          <button class="btn btn-secondary btn-sm" onclick="viewDetail('${item.id}')"><i data-lucide="eye"></i> Detail</button>
          <button class="btn btn-danger btn-sm" onclick="deleteResponse('${item.id}')"><i data-lucide="trash-2"></i> Hapus</button>
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
  updateSelectedCount();
}

function toggleSelectAll(master) {
  const checkboxes = document.querySelectorAll('.row-checkbox');
  checkboxes.forEach(cb => cb.checked = master.checked);
  updateSelectedCount();
}

function updateSelectedCount() {
  const selected = document.querySelectorAll('.row-checkbox:checked');
  const count = selected.length;
  const btnDelete = document.getElementById('btn-delete-selected');
  const countSpan = document.getElementById('selected-count');
  if (countSpan) countSpan.textContent = count;
  if (btnDelete) btnDelete.style.display = count > 0 ? 'inline-flex' : 'none';
}

async function deleteSelectedResponses() {
  const selected = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
  if (selected.length === 0) return;
  if (!confirm(`Apakah Anda yakin ingin menghapus ${selected.length} data temuan yang dipilih?`)) return;
  
  let deletedCount = 0;
  for (const id of selected) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/findings?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (res.ok) deletedCount++;
    } catch (e) {
      console.error(e);
    }
  }
  
  await syncFromBackend();
  if (deletedCount > 0) {
    showToast(`${deletedCount} data temuan berhasil dihapus`, 'info');
  } else {
    showToast(`❌ Gagal menghapus data.`, 'error');
  }
}

function deleteFromModal() {
  if (activeDetailId) { deleteResponse(activeDetailId); closeModal(); }
}

// STATUS UPDATE - PATCH to Supabase
async function updateItemStatus(id, newStatus) {
  try {
    const payload = { status: newStatus };
    if (newStatus === 'Close' || newStatus === 'Closed') {
      payload.tgl_countermeasure = new Date().toISOString().split('T')[0];
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/findings?id=eq.${id}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await syncFromBackend();
    showToast(`Status berhasil diperbarui → "${newStatus}"`, 'info');
  } catch (err) {
    showToast('❌ Gagal update status: ' + err.message, 'error');
    await syncFromBackend();
  }
}

function filterTable() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const filtered = responses.filter(r => {
    const matchesSearch = (r.nama && r.nama.toLowerCase().includes(searchTerm)) || 
                          (r.line && r.line.toLowerCase().includes(searchTerm)) ||
                          (r.machine && r.machine.toLowerCase().includes(searchTerm)) || 
                          (r.problem && r.problem.toLowerCase().includes(searchTerm)) || 
                          (r.countermeasure && r.countermeasure.toLowerCase().includes(searchTerm));
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'On progress' && r.status === 'On progress') || (statusFilter === 'Closed' && (r.status === 'Close' || r.status === 'Closed'));
    return matchesSearch && matchesStatus;
  });
  renderTableData(filtered);
}

// DELETE single item from Supabase
async function deleteResponse(id) {
  if (!confirm('Hapus data temuan ini?')) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/findings?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await syncFromBackend();
    showToast('Data berhasil dihapus dari Cloud Supabase.', 'info');
  } catch (err) {
    showToast('❌ Gagal menghapus: ' + err.message, 'error');
  }
}

function viewDetail(id) {
  const item = responses.find(r => r.id == id); if (!item) return;
  activeDetailId = id;
  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('modal-title');
  const dateSpan = document.getElementById('modal-date');
  const body = document.getElementById('modal-body-content');
  title.textContent = `Laporan Temuan: ${item.machine || 'Machine'}`;
  dateSpan.textContent = `ID: #${item.id} | Line: ${item.line || 'Unassigned'} | Dibuat: ${formatDate(item.created_at || item.tgl_temuan)}`;
  const mediaHtml = item.ilustrasi ? `<div style="margin-bottom: 0.5rem;"><h4 style="margin-bottom: 0.4rem; color: var(--text-main);">Ilustrasi / Foto Temuan:</h4><img src="${item.ilustrasi}" style="width: 100%; max-height: 260px; border-radius: var(--radius-md); border: 1px solid var(--border-color); object-fit: cover;"></div>` : '';
  body.innerHTML = `${mediaHtml}<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: var(--bg-input); padding: 1rem; border-radius: var(--radius-md);"><div><strong>Nama Pelapor:</strong> ${escapeHtml(item.nama || '-')}</div><div><strong>Production Line:</strong> <span class="badge" style="background: var(--primary-light); color: var(--primary);">${escapeHtml(item.line || 'Unassigned')}</span></div><div><strong>Nama Machine:</strong> ${escapeHtml(item.machine || '-')}</div><div><strong>Tanggal Temuan:</strong> ${formatDate(item.tgl_temuan)}</div><div><strong>Planning Perbaikan:</strong> ${formatDate(item.plan_perbaikan)}</div><div><strong>Part Dibutuhkan:</strong> ${escapeHtml(item.part_butuh || '-')}</div><div><strong>Type Part:</strong> ${escapeHtml(item.type_part || '-')}</div><div><strong>Tanggal Countermeasure:</strong> ${formatDate(item.tgl_countermeasure)}</div><div><strong>Status Temuan:</strong> <strong>${escapeHtml(item.status || '-')}</strong></div></div><div><h4 style="margin-bottom: 0.4rem; color: var(--text-main);">Temuan / Problem Abnormality:</h4><p style="background: var(--bg-input); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.9rem; line-height: 1.6;">${escapeHtml(item.problem || 'Tidak ada deskripsi')}</p></div><div><h4 style="margin-bottom: 0.4rem; color: var(--primary);">Countermeasure / Tindakan Perbaikan:</h4><p style="background: var(--primary-light); color: var(--text-main); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.9rem; line-height: 1.6;">${escapeHtml(item.countermeasure || 'Belum diisi')}</p></div>`;
  modal.classList.add('active'); if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeModal() { document.getElementById('detail-modal').classList.remove('active'); }

function openShareModal() {
  const modal = document.getElementById('share-modal');
  const input = document.getElementById('share-url-input');
  const qrImg = document.getElementById('share-qr-code');
  const currentUrl = window.location.origin + window.location.pathname;
  input.value = currentUrl;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`;
  modal.classList.add('active'); if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeShareModal() { document.getElementById('share-modal').classList.remove('active'); }

function copyShareUrl() {
  const input = document.getElementById('share-url-input'); input.select();
  navigator.clipboard.writeText(input.value).then(() => showToast('Link Form berhasil disalin ke clipboard!', 'success')).catch(() => showToast('Link Form disalin!', 'info'));
}

function exportCSV() {
  if (responses.length === 0) { showToast('Tidak ada data untuk di-export!', 'warning'); return; }
  const headers = ['ID', 'Nama', 'Line', 'Machine', 'Temuan Problem', 'Tanggal Temuan', 'Planning Perbaikan', 'Part Dibutuhkan', 'Type Part', 'Countermeasure', 'Tanggal Countermeasure', 'Status'];
  const rows = responses.map(r => [r.id, `"${(r.nama || '').replace(/"/g, '""')}"`, `"${(r.line || 'Unassigned').replace(/"/g, '""')}"`, `"${(r.machine || '').replace(/"/g, '""')}"`, `"${(r.problem || '').replace(/"/g, '""')}"`, r.tgl_temuan || '', r.plan_perbaikan || '', `"${(r.part_butuh || '').replace(/"/g, '""')}"`, `"${(r.type_part || '').replace(/"/g, '""')}"`, `"${(r.countermeasure || '').replace(/"/g, '""')}"`, r.tgl_countermeasure || '', r.status || '']);
  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent); const link = document.createElement('a'); link.setAttribute('href', encodedUri); link.setAttribute('download', `TPM_FollowUp_Export_${new Date().toISOString().slice(0, 10)}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  showToast('File CSV berhasil diunduh!', 'success');
}

function exportJSON() {
  if (responses.length === 0) { showToast('Tidak ada data untuk di-export!', 'warning'); return; }
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(responses, null, 2));
  const link = document.createElement('a'); link.setAttribute('href', dataStr); link.setAttribute('download', `TPM_FollowUp_Export_${new Date().toISOString().slice(0, 10)}.json`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
  showToast('File JSON berhasil diunduh!', 'success');
}

function renderBuilderCanvas() {
  const container = document.getElementById('builder-canvas-fields'); if (!container) return;
  container.innerHTML = '';
  currentFields.forEach((field, index) => {
    const card = document.createElement('div'); card.className = 'canvas-field';
    card.innerHTML = `<div class="field-actions"><button class="action-btn" onclick="deleteBuilderField(${index})" title="Hapus Field"><i data-lucide="trash-2"></i></button></div><div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">${escapeHtml(field.label)} ${field.required ? '<span style="color:var(--danger)">*</span>' : ''}</div><div style="font-size: 0.8rem; color: var(--text-muted);">Tipe: <code>${field.type}</code> | ID: <code>${field.id}</code></div>`;
    container.appendChild(card);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function addFieldToForm(type) {
  const label = prompt('Masukkan Nama Label Field Baru:', 'Field Baru'); if (!label) return;
  const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
  const newField = { id: id, label: label, type: type, placeholder: `Masukkan ${label}...`, required: false };
  if (type === 'select') newField.options = ['On progress', 'Close'];
  currentFields.push(newField); localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields));
  renderFormFiller(); renderBuilderCanvas(); showToast(`Field "${label}" berhasil ditambahkan!`, 'success');
}

function deleteBuilderField(index) {
  if (confirm(`Apakah Anda yakin ingin menghapus field "${currentFields[index].label}"?`)) {
    currentFields.splice(index, 1); localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields)); renderFormFiller(); renderBuilderCanvas(); showToast('Field berhasil dihapus dari form!', 'info');
  }
}

function resetFormToDefault() {
  if (confirm('Kembalikan struktur form ke preset default TPM?')) {
    currentFields = [...DEFAULT_TPM_FIELDS]; localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields)); renderFormFiller(); renderBuilderCanvas(); showToast('Form telah dikembalikan ke struktur default TPM!', 'success');
  }
}

// SEED SAMPLE DATA - POST to Supabase with official lines
async function loadSampleData() {
  const samples = [
    { nama: "Budi Santoso", line: "Melting", machine: "Induction Furnace M1", problem: "Suara abnormal (clunking noise) pada Spindle Motor saat RPM > 3000.", tgl_temuan: "2026-08-01", ilustrasi: "", plan_perbaikan: "2026-08-02", part_butuh: "Bearing Spindle 7014 C/DB", type_part: "Mechanical Part", countermeasure: "Penggantian Bearing Spindle & Re-alignment Spindle shaft.", tgl_countermeasure: "2026-08-03", status: "Close" },
    { nama: "Agus Setyawan", line: "Core Making", machine: "Core Shooter Machine C2", problem: "Kebocoran oli hidrolik pada Main Cylinder Seal Kit.", tgl_temuan: "2026-08-03", ilustrasi: "", plan_perbaikan: "2026-08-05", part_butuh: "Hydraulic Seal Kit NOK 150mm", type_part: "Hydraulic System", countermeasure: "Overhaul Cylinder unit & Ganti Seal Kit.", tgl_countermeasure: "2026-08-04", status: "Close" },
    { nama: "Rian Pratama", line: "RCS", machine: "Resin Coated Sand Mixer R1", problem: "Nozzle Welding Torch cepat aus dan akumulasi Spatter tinggi.", tgl_temuan: "2026-08-05", ilustrasi: "", plan_perbaikan: "2026-08-06", part_butuh: "Copper Nozzle 16mm & Anti Spatter Spray", type_part: "Welding Torch", countermeasure: "Penggantian Nozzle & penambahan auto spatter cleaner.", tgl_countermeasure: "2026-08-06", status: "Close" },
    { nama: "Eko Wijaya", line: "Moulding", machine: "Automatic Moulding Line M4", problem: "Tekanan Udara Drop dari 7.5 Bar menjadi 5.8 Bar saat Line Assembly Full Operation.", tgl_temuan: "2026-08-07", ilustrasi: "", plan_perbaikan: "2026-08-10", part_butuh: "Air Filter Element & Intake Valve Maintenance Kit", type_part: "Pneumatic System", countermeasure: "Inspeksi kebocoran pipa utama & pembersihan air filter.", tgl_countermeasure: "", status: "On progress" },
    { nama: "Hendra Gunawan", line: "Sand Preparation", machine: "Sand Mixer S1", problem: "Temperatur mixer pasir melebihi threshold 65 derajat celcius.", tgl_temuan: "2026-08-10", ilustrasi: "", plan_perbaikan: "2026-08-12", part_butuh: "Cooling Water Valve", type_part: "Pneumatic", countermeasure: "Penggantian solenoid valve pendingin air pasir.", tgl_countermeasure: "2026-08-11", status: "Close" },
    { nama: "Dedi Kurniawan", line: "Finishing", machine: "Shot Blast Machine F3", problem: "Impeller blade shot blast mengalami keretakan aus tebal.", tgl_temuan: "2026-08-12", ilustrasi: "", plan_perbaikan: "2026-08-15", part_butuh: "High Chrome Blade Set", type_part: "Mechanical", countermeasure: "Penggantian 1 set impeller blade baru.", tgl_countermeasure: "2026-08-14", status: "Close" },
    { nama: "Slamet Susilo", line: "Die Press", machine: "Hydraulic Die Press D1", problem: "Kebocoran pressure valve 150 bar pada cylinder clamp.", tgl_temuan: "2026-05-10", ilustrasi: "", plan_perbaikan: "2026-05-15", part_butuh: "Proportional Valve Rexroth", type_part: "Hydraulic", countermeasure: "", tgl_countermeasure: "", status: "On progress" }
  ];
  try { 
    const res = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(samples)
    }); 
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await syncFromBackend();
    showToast('Sample data temuan TPM dimasukkan & tersimpan!', 'success');
  } catch (err) {
    showToast('❌ Gagal memuat sampel data: ' + err.message, 'error');
  }
}

// CLEAR ALL DATA - DELETE from Supabase
async function clearAllData() {
  if (confirm('Apakah Anda yakin ingin menghapus SELURUH data respons temuan?')) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/findings?id=gt.0`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await syncFromBackend();
      showToast('Seluruh data respons telah dikosongkan & disinkronisasi.', 'info');
    } catch (err) {
      showToast('❌ Gagal menghapus data: ' + err.message, 'error');
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'; const d = new Date(dateStr); if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); const year = d.getFullYear(); return `${day}/${month}/${year}`;
}
function escapeHtml(str) {
  if (!str) return ''; return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container'); if (!container) return;
  const toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `<span style="font-size: 0.9rem; font-weight: 500;">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3500);
}
