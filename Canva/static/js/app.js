/* ==========================================================================
   FormCraft TPM - Application Logic & Flask REST API Client
   ========================================================================== */

const DEFAULT_TPM_FIELDS = [
  { id: 'nama', label: 'Nama', type: 'text', placeholder: 'Masukkan nama pelapor / auditor', required: true },
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
let responses = JSON.parse(localStorage.getItem('tpm_responses_data')) || [];
let isSyncing = false;

document.addEventListener('DOMContentLoaded', () => {
  if (!currentFields.some(f => f.id === 'ilustrasi')) {
    currentFields = [...DEFAULT_TPM_FIELDS];
    localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields));
  }

  renderFormFiller();
  renderDashboard();
  renderBuilderCanvas();
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  const today = new Date().toISOString().split('T')[0];
  const tglTemuanEl = document.getElementById('tgl_temuan');
  if (tglTemuanEl && !tglTemuanEl.value) {
    tglTemuanEl.value = today;
  }

  const savedTheme = localStorage.getItem('theme_preference') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  // Initial Sync with Backend Server & Cloud
  syncFromBackend();

  // Auto Polling Every 4 seconds for real-time cross-device sync
  setInterval(syncFromBackend, 4000);
});

/* ==========================================================================
   REAL-TIME DATA SYNCHRONIZATION (FLASK API & CLOUD FALLBACK)
   ========================================================================== */
async function syncFromBackend() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    // 1. Try Flask API Endpoint
    const res = await fetch('/api/findings');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        responses = data;
        localStorage.setItem('tpm_responses_data', JSON.stringify(responses));
        renderDashboard();
        updateSyncBadge('online');
        isSyncing = false;
        return;
      }
    }
  } catch (err) {
    // Not running on Flask server (e.g. static site or direct file view)
  }

  // 2. Fallback to Shared Cloud KV Endpoint for Netlify / Static site
  try {
    const cloudRes = await fetch('https://kvdb.io/W8j2g47Z8x3M2p9Q4k1L6v/tpm_followup_master_v1');
    if (cloudRes.ok) {
      const cloudData = await cloudRes.json();
      if (Array.isArray(cloudData)) {
        responses = cloudData;
        localStorage.setItem('tpm_responses_data', JSON.stringify(responses));
        renderDashboard();
        updateSyncBadge('online');
        isSyncing = false;
        return;
      }
    }
  } catch (err) {
    // Cloud KV fetch offline
  }

  // 3. Fallback to local storage
  responses = JSON.parse(localStorage.getItem('tpm_responses_data')) || [];
  renderDashboard();
  updateSyncBadge('local');
  isSyncing = false;
}

function updateSyncBadge(status) {
  const badge = document.getElementById('cloud-sync-badge');
  if (!badge) return;

  if (status === 'online') {
    badge.className = 'badge badge-closed';
    badge.innerHTML = '<i data-lucide="cloud"></i> 🟢 Database Synced';
  } else {
    badge.className = 'badge';
    badge.style.background = 'var(--bg-input)';
    badge.innerHTML = '<i data-lucide="database"></i> 📱 Local Mode';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/* ==========================================================================
   NAVIGATION & TAB SWITCHING
   ========================================================================== */
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

  if (tabId === 'dashboard') {
    syncFromBackend();
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme_preference', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon && typeof lucide !== 'undefined') {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

/* ==========================================================================
   FORM FILLER ENGINE
   ========================================================================== */
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
      input = document.createElement('textarea');
      input.className = 'form-textarea';
      input.rows = 3;
    } else if (field.type === 'select') {
      input = document.createElement('select');
      input.className = 'form-select';
      (field.options || ['On progress', 'Close']).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
    } else if (field.type === 'file') {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = field.accept || 'image/*';
      input.className = 'form-input';

      const previewDiv = document.createElement('div');
      previewDiv.id = `preview-${field.id}`;
      previewDiv.style.marginTop = '0.5rem';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            activeMediaData[field.id] = event.target.result;
            previewDiv.innerHTML = `
              <div style="position: relative; display: inline-block;">
                <img src="${event.target.result}" style="max-height: 140px; border-radius: var(--radius-md); border: 2px solid var(--primary); object-fit: cover;">
                <span style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.7rem; cursor: pointer;" onclick="clearMediaPreview('${field.id}')">✕</span>
              </div>
            `;
          };
          reader.readAsDataURL(file);
        }
      };

      formGroup.appendChild(input);
      formGroup.appendChild(previewDiv);
      container.appendChild(formGroup);
      return;
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      input.className = 'form-input';
    }

    input.id = field.id;
    input.name = field.id;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.required) input.required = true;

    formGroup.appendChild(input);
    container.appendChild(formGroup);
  });
}

function clearMediaPreview(fieldId) {
  delete activeMediaData[fieldId];
  const previewDiv = document.getElementById(`preview-${fieldId}`);
  if (previewDiv) previewDiv.innerHTML = '';
  const fileInput = document.getElementById(fieldId);
  if (fileInput) fileInput.value = '';
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const formData = {
    id: 'TPM-' + Date.now().toString().slice(-6),
    createdAt: new Date().toISOString()
  };

  currentFields.forEach(field => {
    if (field.type === 'file') {
      formData[field.id] = activeMediaData[field.id] || '';
    } else {
      const el = document.getElementById(field.id);
      formData[field.id] = el ? el.value : '';
    }
  });

  // Save to Flask API Server
  try {
    await fetch('/api/findings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
  } catch (err) {
    // Cloud KV fallback
    try {
      await fetch('https://kvdb.io/W8j2g47Z8x3M2p9Q4k1L6v/tpm_followup_master_v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([formData, ...responses])
      });
    } catch (e) {}
  }

  responses.unshift(formData);
  localStorage.setItem('tpm_responses_data', JSON.stringify(responses));

  showToast('Laporan temuan TPM tersimpan & tersinkronisasi!', 'success');
  e.target.reset();
  activeMediaData = {};
  document.querySelectorAll('[id^="preview-"]').forEach(el => el.innerHTML = '');

  const today = new Date().toISOString().split('T')[0];
  const tglTemuanEl = document.getElementById('tgl_temuan');
  if (tglTemuanEl) tglTemuanEl.value = today;

  renderDashboard();
  switchTab('dashboard');
}

/* ==========================================================================
   DASHBOARD & TABLE RENDER
   ========================================================================== */
function renderDashboard() {
  const tableBody = document.getElementById('response-table-body');
  const mobileContainer = document.getElementById('mobile-response-cards');
  const emptyState = document.getElementById('empty-state');

  const total = responses.length;
  const onProgress = responses.filter(r => r.status === 'On progress').length;
  const closed = responses.filter(r => r.status === 'Close' || r.status === 'Closed').length;
  const completionRate = total > 0 ? Math.round((closed / total) * 100) : 0;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-progress').textContent = onProgress;
  document.getElementById('stat-closed').textContent = closed;
  document.getElementById('stat-rate').textContent = `${completionRate}%`;
  document.getElementById('badge-total-count').textContent = total;

  if (total === 0) {
    if (tableBody) tableBody.innerHTML = '';
    if (mobileContainer) mobileContainer.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  renderTableData(responses);
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
        <td style="text-align: center;">
          <input type="checkbox" class="row-checkbox" value="${item.id}" onchange="updateSelectedCount()">
        </td>
        <td><strong>#${index + 1}</strong></td>
        <td>${formatDate(item.tgl_temuan)}</td>
        <td><strong>${escapeHtml(item.nama || '-')}</strong></td>
        <td><span class="badge" style="background: var(--bg-input); border: 1px solid var(--border-color);">${escapeHtml(item.machine || '-')}</span></td>
        <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(item.problem || '-')}
        </td>
        <td style="text-align: center;">
          ${hasMedia ? `<img src="${item.ilustrasi}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; cursor: pointer; border: 1px solid var(--primary);" onclick="viewDetail('${item.id}')" title="Klik untuk lihat foto">` : '<span style="color:var(--text-light)">-</span>'}
        </td>
        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(item.countermeasure || '-')}
        </td>
        <td>${formatDate(item.tgl_countermeasure)}</td>
        <td>
          <select class="form-select" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; font-weight: 600; width: auto;" onchange="updateItemStatus('${item.id}', this.value)">
            <option value="On progress" ${!isClosed ? 'selected' : ''}>🟡 On progress</option>
            <option value="Close" ${isClosed ? 'selected' : ''}>🟢 Close</option>
          </select>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="viewDetail('${item.id}')" title="Lihat Detail">
            <i data-lucide="eye"></i> Detail
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteResponse('${item.id}')" title="Hapus Laporan Ini">
            <i data-lucide="trash-2"></i> Hapus
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    }

    if (mobileContainer) {
      const card = document.createElement('div');
      card.className = 'mobile-response-card';
      card.innerHTML = `
        <div class="mobile-card-header">
          <span class="mobile-card-title">${escapeHtml(item.machine || 'Machine')}</span>
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
          <button class="btn btn-secondary btn-sm" onclick="viewDetail('${item.id}')">
            <i data-lucide="eye"></i> Detail
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteResponse('${item.id}')">
            <i data-lucide="trash-2"></i> Hapus
          </button>
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  updateSelectedCount();
}

/* Bulk Selection & Modal Delete Controls */
let activeDetailId = null;

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
  if (btnDelete) {
    btnDelete.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

async function deleteSelectedResponses() {
  const selected = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => cb.value);
  if (selected.length === 0) return;

  if (confirm(`Apakah Anda yakin ingin menghapus ${selected.length} data temuan yang dipilih?`)) {
    for (const id of selected) {
      try {
        await fetch(`/api/findings/${id}`, { method: 'DELETE' });
      } catch (e) {}
    }
    
    responses = responses.filter(r => !selected.includes(r.id));
    localStorage.setItem('tpm_responses_data', JSON.stringify(responses));
    showToast(`${selected.length} data temuan berhasil dihapus`, 'info');
    renderDashboard();
  }
}

function deleteFromModal() {
  if (activeDetailId) {
    deleteResponse(activeDetailId);
    closeModal();
  }
}

async function updateItemStatus(id, newStatus) {
  const target = responses.find(r => r.id === id);
  if (target) {
    target.status = newStatus;
    
    try {
      await fetch(`/api/findings/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) {}

    localStorage.setItem('tpm_responses_data', JSON.stringify(responses));
    showToast(`Status temuan ${id} diperbarui menjadi "${newStatus}"`, 'info');
    renderDashboard();
  }
}

function filterTable() {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  const filtered = responses.filter(r => {
    const matchesSearch = (r.nama && r.nama.toLowerCase().includes(searchTerm)) ||
                          (r.machine && r.machine.toLowerCase().includes(searchTerm)) ||
                          (r.problem && r.problem.toLowerCase().includes(searchTerm)) ||
                          (r.countermeasure && r.countermeasure.toLowerCase().includes(searchTerm));

    const matchesStatus = statusFilter === 'ALL' ||
                          (statusFilter === 'On progress' && r.status === 'On progress') ||
                          (statusFilter === 'Closed' && (r.status === 'Close' || r.status === 'Closed'));

    return matchesSearch && matchesStatus;
  });

  renderTableData(filtered);
}

async function deleteResponse(id) {
  if (confirm('Apakah Anda yakin ingin menghapus data temuan ini?')) {
    try {
      await fetch(`/api/findings/${id}`, { method: 'DELETE' });
    } catch (e) {}

    responses = responses.filter(r => r.id !== id);
    localStorage.setItem('tpm_responses_data', JSON.stringify(responses));
    showToast('Data temuan berhasil dihapus', 'info');
    renderDashboard();
  }
}

function viewDetail(id) {
  const item = responses.find(r => r.id === id);
  if (!item) return;

  activeDetailId = id;
  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('modal-title');
  const dateSpan = document.getElementById('modal-date');
  const body = document.getElementById('modal-body-content');

  title.textContent = `Laporan Temuan: ${item.machine || 'Machine'}`;
  dateSpan.textContent = `ID: ${item.id} | Dibuat: ${formatDate(item.createdAt)}`;

  const mediaHtml = item.ilustrasi ? `
    <div style="margin-bottom: 0.5rem;">
      <h4 style="margin-bottom: 0.4rem; color: var(--text-main);">Ilustrasi / Foto Temuan:</h4>
      <img src="${item.ilustrasi}" style="width: 100%; max-height: 260px; border-radius: var(--radius-md); border: 1px solid var(--border-color); object-fit: cover;">
    </div>
  ` : '';

  body.innerHTML = `
    ${mediaHtml}
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: var(--bg-input); padding: 1rem; border-radius: var(--radius-md);">
      <div><strong>Nama Pelapor:</strong> ${escapeHtml(item.nama || '-')}</div>
      <div><strong>Nama Machine:</strong> ${escapeHtml(item.machine || '-')}</div>
      <div><strong>Tanggal Temuan:</strong> ${formatDate(item.tgl_temuan)}</div>
      <div><strong>Planning Perbaikan:</strong> ${formatDate(item.plan_perbaikan)}</div>
      <div><strong>Part Dibutuhkan:</strong> ${escapeHtml(item.part_butuh || '-')}</div>
      <div><strong>Type Part:</strong> ${escapeHtml(item.type_part || '-')}</div>
      <div><strong>Tanggal Countermeasure:</strong> ${formatDate(item.tgl_countermeasure)}</div>
      <div><strong>Status Temuan:</strong> <strong>${escapeHtml(item.status || '-')}</strong></div>
    </div>

    <div>
      <h4 style="margin-bottom: 0.4rem; color: var(--text-main);">Temuan / Problem Abnormality:</h4>
      <p style="background: var(--bg-input); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.9rem; line-height: 1.6;">
        ${escapeHtml(item.problem || 'Tidak ada deskripsi')}
      </p>
    </div>

    <div>
      <h4 style="margin-bottom: 0.4rem; color: var(--primary);">Countermeasure / Tindakan Perbaikan:</h4>
      <p style="background: var(--primary-light); color: var(--text-main); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.9rem; line-height: 1.6;">
        ${escapeHtml(item.countermeasure || 'Belum diisi')}
      </p>
    </div>
  `;

  modal.classList.add('active');
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function closeModal() {
  document.getElementById('detail-modal').classList.remove('active');
}

function openShareModal() {
  const modal = document.getElementById('share-modal');
  const input = document.getElementById('share-url-input');
  const qrImg = document.getElementById('share-qr-code');

  const currentUrl = (window.location.href.includes('127.0.0.1') || window.location.href.includes('localhost'))
    ? 'https://tpm-followup-app.loca.lt'
    : window.location.href;

  input.value = currentUrl;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`;

  modal.classList.add('active');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('active');
}

function copyShareUrl() {
  const input = document.getElementById('share-url-input');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Link Form berhasil disalin ke clipboard!', 'success');
  }).catch(() => {
    showToast('Link Form disalin!', 'info');
  });
}

function exportCSV() {
  if (responses.length === 0) {
    showToast('Tidak ada data untuk di-export!', 'warning');
    return;
  }

  const headers = ['ID', 'Nama', 'Machine', 'Temuan Problem', 'Tanggal Temuan', 'Planning Perbaikan', 'Part Dibutuhkan', 'Type Part', 'Countermeasure', 'Tanggal Countermeasure', 'Status'];
  const rows = responses.map(r => [
    r.id,
    `"${(r.nama || '').replace(/"/g, '""')}"`,
    `"${(r.machine || '').replace(/"/g, '""')}"`,
    `"${(r.problem || '').replace(/"/g, '""')}"`,
    r.tgl_temuan || '',
    r.plan_perbaikan || '',
    `"${(r.part_butuh || '').replace(/"/g, '""')}"`,
    `"${(r.type_part || '').replace(/"/g, '""')}"`,
    `"${(r.countermeasure || '').replace(/"/g, '""')}"`,
    r.tgl_countermeasure || '',
    r.status || ''
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `TPM_FollowUp_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('File CSV berhasil diunduh!', 'success');
}

function exportJSON() {
  if (responses.length === 0) {
    showToast('Tidak ada data untuk di-export!', 'warning');
    return;
  }

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(responses, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `TPM_FollowUp_Export_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('File JSON berhasil diunduh!', 'success');
}

function renderBuilderCanvas() {
  const container = document.getElementById('builder-canvas-fields');
  if (!container) return;

  container.innerHTML = '';

  currentFields.forEach((field, index) => {
    const card = document.createElement('div');
    card.className = 'canvas-field';
    card.innerHTML = `
      <div class="field-actions">
        <button class="action-btn" onclick="deleteBuilderField(${index})" title="Hapus Field">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <div style="font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">
        ${escapeHtml(field.label)} ${field.required ? '<span style="color:var(--danger)">*</span>' : ''}
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">
        Tipe: <code>${field.type}</code> | ID: <code>${field.id}</code>
      </div>
    `;
    container.appendChild(card);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function addFieldToForm(type) {
  const label = prompt('Masukkan Nama Label Field Baru:', 'Field Baru');
  if (!label) return;

  const id = label.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
  const newField = {
    id: id,
    label: label,
    type: type,
    placeholder: `Masukkan ${label}...`,
    required: false
  };

  if (type === 'select') {
    newField.options = ['On progress', 'Close'];
  }

  currentFields.push(newField);
  localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields));

  renderFormFiller();
  renderBuilderCanvas();
  showToast(`Field "${label}" berhasil ditambahkan!`, 'success');
}

function deleteBuilderField(index) {
  if (confirm(`Apakah Anda yakin ingin menghapus field "${currentFields[index].label}"?`)) {
    currentFields.splice(index, 1);
    localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields));
    renderFormFiller();
    renderBuilderCanvas();
    showToast('Field berhasil dihapus dari form!', 'info');
  }
}

function resetFormToDefault() {
  if (confirm('Kembalikan struktur form ke preset default TPM?')) {
    currentFields = [...DEFAULT_TPM_FIELDS];
    localStorage.setItem('tpm_form_fields', JSON.stringify(currentFields));
    renderFormFiller();
    renderBuilderCanvas();
    showToast('Form telah dikembalikan ke struktur default TPM!', 'success');
  }
}

async function loadSampleData() {
  try {
    await fetch('/api/seed', { method: 'POST' });
  } catch (e) {}

  syncFromBackend();
  showToast('Sample data temuan TPM dimasukkan & tersimpan!', 'success');
}

async function clearAllData() {
  if (confirm('Apakah Anda yakin ingin menghapus SELURUH data respons temuan?')) {
    try {
      await fetch('/api/findings/all', { method: 'DELETE' });
    } catch (e) {}

    responses = [];
    localStorage.removeItem('tpm_responses_data');
    renderDashboard();
    showToast('Seluruh data respons telah dikosongkan.', 'info');
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span style="font-size: 0.9rem; font-weight: 500;">${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
