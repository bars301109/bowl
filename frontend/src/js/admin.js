
// Check admin auth via API (supports cookie and Bearer token)
async function checkAdminAuth() {
  try {
    const adminToken = localStorage.getItem('adminToken');
    const headers = {};
    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
    const res = await fetch('/api/admin/check', { headers, credentials: 'include' });
    if (!res.ok) {
      localStorage.removeItem('adminToken');
      document.cookie = 'admin_token=; path=/; max-age=0;';
      window.location.replace('/admin-login');
      return false;
    }
    document.body.classList.add('auth-checked');
    return true;
  } catch {
    localStorage.removeItem('adminToken');
    document.cookie = 'admin_token=; path=/; max-age=0;';
    window.location.replace('/admin-login');
    return false;
  }
}

function showAdminConfirm(title, message, subMessage = '', onConfirm) {
  const modal = document.getElementById('adminConfirmModal');
  const titleEl = document.getElementById('adminConfirmModalTitle');
  const msgEl = document.getElementById('adminConfirmModalMessage');
  const subEl = document.getElementById('adminConfirmModalSub');
  const okBtn = document.getElementById('adminConfirmOkBtn');
  const cancelBtn = document.getElementById('adminConfirmCancelBtn');
  const closeBtn = document.getElementById('closeAdminConfirmModal');

  if (!modal) {
    if (confirm(message)) onConfirm();
    return;
  }

  if (titleEl) titleEl.textContent = title || 'Подтверждение';
  if (msgEl) msgEl.innerHTML = message || 'Вы уверены?';
  if (subEl) subEl.textContent = subMessage || '';

  modal.style.display = 'flex';

  const close = () => {
    modal.style.display = 'none';
    if (okBtn) okBtn.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;
    if (closeBtn) closeBtn.onclick = null;
  };

  if (cancelBtn) cancelBtn.onclick = close;
  if (closeBtn) closeBtn.onclick = close;
  if (okBtn) {
    okBtn.onclick = async () => {
      close();
      if (typeof onConfirm === 'function') await onConfirm();
    };
  }
}

function showAdminChoiceModal({ title, message, subMessage = '', options = [], onChoice }) {
  let modal = document.getElementById('adminChoiceModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'adminChoiceModal';
    modal.className = 'admin-modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.65);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px);';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="admin-modal-card" style="background:#ffffff;border-radius:18px;max-width:500px;width:100%;padding:28px;box-shadow:0 24px 48px -12px rgba(15,23,42,0.25);position:relative;">
      <h3 style="margin:0 0 10px 0;font-size:18.5px;color:#0f172a;font-weight:700;">${esc(title || 'Выберите действие')}</h3>
      <p style="margin:0 0 8px 0;font-size:14px;color:#475569;line-height:1.5;">${esc(message || '')}</p>
      ${subMessage ? `<p style="margin:0 0 18px 0;font-size:12.5px;color:#64748b;line-height:1.4;">${esc(subMessage)}</p>` : ''}
      <div id="adminChoiceOptions" style="display:flex;flex-direction:column;gap:10px;margin-top:16px;"></div>
      <div style="margin-top:20px;text-align:right;">
        <button type="button" id="adminChoiceCancelBtn" class="admin-button secondary" style="padding:8px 20px;">Отмена</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  const close = () => { modal.style.display = 'none'; };
  document.getElementById('adminChoiceCancelBtn').onclick = () => {
    close();
    if (typeof onChoice === 'function') onChoice(null);
  };

  const optsContainer = document.getElementById('adminChoiceOptions');
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = opt.class || 'admin-button';
    btn.style.cssText = 'padding:11px 16px;font-size:14px;font-weight:600;text-align:left;display:flex;align-items:center;justify-content:flex-start;border-radius:10px;cursor:pointer;';
    btn.textContent = opt.label;
    btn.onclick = () => {
      close();
      if (typeof onChoice === 'function') onChoice(opt.id);
    };
    optsContainer.appendChild(btn);
  });
}

function logoutAdmin() {
  showAdminConfirm('Выход из системы', 'Вы уверены, что хотите выйти из админ-панели?', '', () => {
    localStorage.removeItem('adminToken');
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      window.location.href = '/admin-login';
    });
  });
}

function aHeaders(){
  const h = { 'Content-Type':'application/json' };
  const adminToken = localStorage.getItem('adminToken');
  if (adminToken) h['Authorization'] = `Bearer ${adminToken}`;
  return h;
}
function aAuthHeaders(){
  const h = {};
  const adminToken = localStorage.getItem('adminToken');
  if (adminToken) h['Authorization'] = `Bearer ${adminToken}`;
  return h;
}

async function adminFetch(url, options = {}) {
  let headers = options.headers ? { ...options.headers } : {};
  const adminToken = localStorage.getItem('adminToken');
  if (adminToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  }

  // Robust check for FormData across iframes & realms
  const isFormData = options.body && (
    (typeof FormData !== 'undefined' && options.body instanceof FormData) ||
    typeof options.body.append === 'function' ||
    Object.prototype.toString.call(options.body) === '[object FormData]'
  );

  if (isFormData) {
    // Browser MUST automatically compute multipart boundary
    delete headers['Content-Type'];
    delete headers['content-type'];
  } else {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const res = await fetch(url, { ...options, headers, credentials: 'include' });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin-login';
      return { ok: false, status: res.status, json: async () => ({ error: 'Unauthorized' }), text: async () => 'Unauthorized' };
    }
    return res;
  } catch (err) {
    console.warn('adminFetch network error:', err);
    return { ok: false, status: 0, json: async () => ({ error: err.message }), text: async () => err.message };
  }
}
const content = document.getElementById('content');

// Helper functions for better UI
function showAlert(message, type = 'info') {
  let toastBox = document.getElementById('adminToastContainer');
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.id = 'adminToastContainer';
    toastBox.className = 'admin-panel-toasts';
    document.body.appendChild(toastBox);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${esc(message)}</span>`;
  toastBox.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function showImageZoom(url) {
  if (!url) return;
  let modal = document.getElementById('imgZoomModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imgZoomModal';
    modal.innerHTML = `
      <span class="close-zoom" onclick="document.getElementById('imgZoomModal').style.display='none'">&times;</span>
      <img id="zoomModalImg" src="" alt="Изображение"/>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    document.body.appendChild(modal);
  }
  document.getElementById('zoomModalImg').src = url;
  modal.style.display = 'flex';
}

async function showResponseError(res, fallback) {
  try {
    if (!res) {
      showAlert(fallback, 'error');
      return;
    }
    let errorMsg = '';
    // If res has a cloned json or text
    if (typeof res.json === 'function') {
      try {
        const j = await res.json();
        if (j && j.error) errorMsg = j.error;
      } catch {}
    }
    if (!errorMsg && typeof res.text === 'function') {
      try {
        const t = await res.text();
        if (t) {
          try {
            const j = JSON.parse(t);
            if (j && j.error) errorMsg = j.error;
            else errorMsg = t;
          } catch {
            errorMsg = t;
          }
        }
      } catch {}
    }
    showAlert(errorMsg ? `${fallback}: ${errorMsg}` : fallback, 'error');
  } catch {
    showAlert(fallback, 'error');
  }
}

function val(id){
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}
function num(id){
  return parseInt(val(id) || '0', 10) || 0;
}
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'": '&#39;' }[c]));
}
function pluralizeRu(count, one, two, five) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
}

function showLoading(message = 'Загрузка...') {
  content.innerHTML = `<div class="admin-loading">${message}</div>`;
}

function setActiveTab(activeButton) {
  document.querySelectorAll('.sidebar-nav button, .admin-nav button, .tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  if (activeButton) {
    activeButton.classList.add('active');
    activeButton.setAttribute('aria-selected', 'true');
    const title = activeButton.dataset?.title;
    const titleEl = document.getElementById('topbarSectionTitle');
    if (titleEl && title) titleEl.textContent = title;
  }
}

function toDatetimeLocalValue(iso){
  if(!iso) return '';
  try{
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const pad = (n)=> String(n).padStart(2,'0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }catch{ return ''; }
}

function computeAutoStatus(t){
  const now = new Date();
  const ws = t.window_start ? new Date(t.window_start) : null;
  const we = t.window_end ? new Date(t.window_end) : null;
  if(t.status === 'published'){
    if(ws && now < ws) return 'scheduled';
    if(ws && we && now >= ws && now <= we) return 'active';
    if(we && now > we) return 'closed';
  }
  return null;
}

function statusLabel(status, autoStatus){
  if(autoStatus){
    const labels = { scheduled: 'Запланирован', active: 'Активен', closed: 'Закрыт' };
    return (labels[autoStatus] || autoStatus);
  }
  const labels = { draft: 'Черновик', published: 'Опубликован', archived: 'Архив' };
  return labels[status] || status;
}

// Settings Tab
async function renderSettings(){
  setActiveTab(document.getElementById('tabSettings'));
  showLoading('Загрузка настроек...');
  const [sRes, testsRes] = await Promise.all([
    fetch('/api/settings'),
    adminFetch('/api/admin/tests', { headers: aHeaders() })
  ]);
  const s = await sRes.json();
  const tests = testsRes.ok ? await testsRes.json() : [];
  const oneSubmission = s?.one_submission_allowed || false;
  const resultsPublished = s?.results_published || false;
  content.innerHTML = `
    <div class="admin-form" style="max-width:880px;">
      <div style="margin-bottom:20px;">
        <h3 style="margin:0 0 4px 0;">⚙️ Общие настройки турнира</h3>
        <div class="small-muted">Управление датами этапов, местом финала и публикацией результатов</div>
      </div>

      <!-- Dates Section -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px; margin-bottom:18px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:14px; color:#1e293b; display:flex; align-items:center; gap:6px;">
          <span>📅</span> Даты этапов олимпиады:
        </div>
        <div class="form-row">
          <label>📅 Этап 1 (Отборочный тур)
            <input id="d1" type="date" class="admin-input" value="${esc(s?.day1_date||'')}"/>
          </label>
          <label>📅 Этап 2 (Полуфинал)
            <input id="d2" type="date" class="admin-input" value="${esc(s?.day2_date||'')}"/>
          </label>
          <label>📅 Этап 3 (Финал)
            <input id="d3" type="date" class="admin-input" value="${esc(s?.day3_date||'')}"/>
          </label>
        </div>
      </div>

      <!-- Final Place Section -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px; margin-bottom:18px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:14px; color:#1e293b; display:flex; align-items:center; gap:6px;">
          <span>🏆</span> Место проведения финала:
        </div>
        <div class="form-row">
          <label>🇷🇺 Место финала (RU)
            <input id="fpru" class="admin-input" placeholder="например: Президентский лицей «Акылман» (Чолпон-Ата)" value="${esc(s?.final_place_ru||'')}"/>
          </label>
          <label>🇰🇬 Место финала (KY)
            <input id="fpky" class="admin-input" placeholder="мисалы: «Акылман» Президенттик лицейи (Чолпон-Ата)" value="${esc(s?.final_place_ky||'')}"/>
          </label>
        </div>
      </div>

      <!-- Test Control & Results Section -->
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px; margin-bottom:18px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:14px; color:#1e293b; display:flex; align-items:center; gap:6px;">
          <span>🔧</span> Правила прохождения и видимость:
        </div>
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
          <label class="toggle-label" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
            <input type="checkbox" id="one_submission" ${oneSubmission ? 'checked' : ''}/>
            <span class="toggle-slider"></span>
            <span class="toggle-text" style="font-weight:500;">Строгий режим: только 1 попытка на каждый тест</span>
          </label>
          <label class="toggle-label" style="display:flex; align-items:center; gap:10px; cursor:pointer;">
            <input type="checkbox" id="results_published" ${resultsPublished ? 'checked' : ''}/>
            <span class="toggle-slider"></span>
            <span class="toggle-text" style="font-weight:500;">Публикация таблицы лидеров для участников</span>
          </label>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="admin-button success" id="publishResults" style="padding:8px 14px;">✅ Опубликовать результаты</button>
          <button class="admin-button secondary" id="hideResults" style="padding:8px 14px;">🙈 Скрыть результаты</button>
          <button class="admin-button" id="updateStatuses" style="padding:8px 14px;">🔄 Обновить статусы тестов</button>
        </div>
      </div>

      <div>
        <button class="admin-button success" id="save" style="padding:10px 24px; font-weight:600;">💾 Сохранить настройки</button>
      </div>
    </div>
  `;
  document.getElementById('save').onclick = async ()=>{
    const body = { day1_date:val('d1'),day2_date:val('d2'),day3_date:val('d3'),final_place_ru:val('fpru'),final_place_ky:val('fpky'),
      one_submission_allowed: document.getElementById('one_submission').checked,
      results_published: document.getElementById('results_published').checked
    };
    const r = await adminFetch('/api/admin/settings',{ method:'PUT', headers:aHeaders(), body: JSON.stringify(body) });
    if(!r.ok){ showAlert('Ошибка сохранения', 'error'); return; }
    showAlert('Настройки сохранены!', 'success');
  };
  document.getElementById('publishResults').onclick = async ()=>{
    const r = await adminFetch('/api/admin/settings/publish-results',{ method:'POST', headers:aHeaders(), body: JSON.stringify({ publish: true }) });
    if(!r.ok){ showAlert('Ошибка публикации результатов', 'error'); return; }
    showAlert('Результаты опубликованы!', 'success');
    renderSettings();
  };
  document.getElementById('hideResults').onclick = async ()=>{
    const r = await adminFetch('/api/admin/settings/publish-results',{ method:'POST', headers:aHeaders(), body: JSON.stringify({ publish: false }) });
    if(!r.ok){ showAlert('Ошибка скрытия результатов', 'error'); return; }
    showAlert('Результаты скрыты!', 'success');
    renderSettings();
  };
  document.getElementById('updateStatuses').onclick = async ()=>{
    const r = await adminFetch('/api/admin/tests/update-statuses',{ method:'POST', headers:aHeaders() });
    if(!r.ok){ showAlert('Ошибка обновления статусов', 'error'); return; }
    showAlert('Статусы тестов обновлены!', 'success');
    renderSettings();
  };
}

// Tests Tab
async function renderTests(){
  setActiveTab(document.getElementById('tabTests'));
  showLoading('Загрузка тестов...');
  const [testsRes, catsRes] = await Promise.all([
    adminFetch('/api/admin/tests',{ headers: aHeaders() }),
    adminFetch('/api/admin/categories',{ headers: aHeaders() })
  ]);
  if(!testsRes.ok){ await showResponseError(testsRes, 'Ошибка загрузки тестов'); return; }
  if(!catsRes.ok){ await showResponseError(catsRes, 'Ошибка загрузки категорий'); return; }
  const tests = await testsRes.json();
  const cats = await catsRes.json();

  function renderTestRows(filterText = '') {
    const term = filterText.toLowerCase().trim();
    const filtered = term ? tests.filter(t => 
      (t.title || '').toLowerCase().includes(term) ||
      (t.category_name_ru || '').toLowerCase().includes(term) ||
      (t.status || '').toLowerCase().includes(term) ||
      String(t.id).includes(term)
    ) : tests;

    const tbody = document.getElementById('testsTbody');
    if (!tbody) return;

    if (filtered.length > 0) {
      tbody.innerHTML = filtered.map(t => {
        const autoStatus = computeAutoStatus(t);
        return `
          <tr>
            <td><span style="font-weight:600; color:#64748b;">#${t.id}</span></td>
            <td>
              <div style="font-weight:600; color:#0f172a; font-size:14.5px;">${esc(t.title||'')}</div>
              ${t.preview_text ? `<div class="small-muted" style="margin-top:2px;">${esc(t.preview_text)}</div>` : ''}
            </td>
            <td><span class="status-badge status-${esc(t.status||'draft')}">${statusLabel(t.status||'draft', autoStatus)}</span></td>
            <td><span style="text-transform:uppercase; font-size:12px; font-weight:700; color:#475569; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${esc(t.lang||'ru')}</span></td>
            <td><span style="color:#334155; font-weight:500;">${t.duration_minutes||60} мин</span></td>
            <td style="font-size:12.5px; color:#64748b;">${t.window_start ? `${esc(t.window_start)}<br>→ ${esc(t.window_end||'-')}` : '<span style="color:#94a3b8;">Не ограничено</span>'}</td>
            <td><span class="status-badge status-published">${esc(t.category_name_ru || 'Без категории')}</span></td>
            <td>
              <div class="admin-table-actions">
                <button data-id="${t.id}" class="admin-button primary qs" title="Управление вопросами теста">❓ Вопросы (${t.questions_count ?? 0})</button>
                <button data-id="${t.id}" class="admin-button secondary export-test-json" title="Экспорт теста и всех вопросов в JSON файл">📤 Экспорт</button>
                <button data-id="${t.id}" class="admin-button secondary import-test-json" title="Импорт вопросов или теста из файла JSON">📥 Импорт</button>
                <button data-id="${t.id}" class="admin-button secondary export-q-csv" title="Экспорт вопросов теста в CSV">📄 CSV</button>
                <button data-id="${t.id}" class="admin-button secondary edit" title="Редактировать параметры теста">✏️ Редакт.</button>
                <button data-id="${t.id}" class="admin-button danger del" title="Удалить тест">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Тесты не найдены${term ? ` по запросу «${esc(term)}»` : ''}</td></tr>`;
    }

    tbody.querySelectorAll('button.edit').forEach(b => b.onclick = () => editTest(b.dataset.id));
    tbody.querySelectorAll('button.del').forEach(b => b.onclick = () => deleteTest(b.dataset.id));
    tbody.querySelectorAll('button.qs').forEach(b => b.onclick = () => renderQuestions(parseInt(b.dataset.id, 10)));
    tbody.querySelectorAll('button.export-test-json').forEach(b => b.onclick = async () => {
      const testId = b.dataset.id;
      try {
        showAlert('Подготовка экспорта теста...', 'info');
        const res = await adminFetch(`/api/admin/tests/${testId}/export-json`, { headers: aHeaders() });
        if (!res.ok) { showAlert('Ошибка экспорта теста', 'error'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const testObj = tests.find(x => String(x.id) === String(testId));
        const cleanTitle = (testObj?.title || `test_${testId}`).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50).trim();
        a.download = `test_${testId}_${cleanTitle}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showAlert(`Тест #${testId} и все его вопросы успешно экспортированы!`, 'success');
      } catch (e) {
        showAlert('Ошибка экспорта: ' + e.message, 'error');
      }
    });
    tbody.querySelectorAll('button.import-test-json').forEach(b => b.onclick = () => {
      const testId = b.dataset.id;
      const testObj = tests.find(x => String(x.id) === String(testId));
      const testTitle = testObj?.title || `#${testId}`;

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);

      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        document.body.removeChild(fileInput);
        if (!file) return;

        showAdminChoiceModal({
          title: `Импорт в тест «${testTitle}»`,
          message: 'Как вы хотите импортировать данные из выбранного файла?',
          options: [
            { id: 'append', label: '➕ Добавить вопросы к существующим в тесте', class: 'admin-button primary' },
            { id: 'replace', label: '🔄 Заменить все вопросы в этом тесте', class: 'admin-button danger' },
            { id: 'as_new', label: '✨ Создать как отдельный новый тест', class: 'admin-button success' }
          ],
          onChoice: async (choice) => {
            if (!choice) return;
            try {
              showAlert('Импорт данных из файла...', 'info');
              const text = await file.text();
              const json = JSON.parse(text);

              if (choice === 'as_new') {
                const res = await adminFetch('/api/admin/tests/import-json', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(json)
                });
                const resData = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(resData.error || 'Ошибка импорта нового теста');
                showAlert(`Новый тест успешно создан! Вопросов: ${resData.imported_questions || 0}`, 'success');
                renderTests();
              } else {
                const res = await adminFetch(`/api/admin/tests/${testId}/import-questions-json?mode=${choice}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(json)
                });
                const resData = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(resData.error || 'Ошибка импорта вопросов в тест');
                showAlert(`Вопросы успешно импортированы (${choice === 'replace' ? 'заменено' : 'добавлено'}: ${resData.imported_questions || 0})!`, 'success');
                renderTests();
              }
            } catch (err) {
              console.error('Import error:', err);
              showAlert('Ошибка импорта: ' + err.message, 'error');
            }
          }
        });
      };

      fileInput.click();
    });
    tbody.querySelectorAll('button.export-q-csv').forEach(b => b.onclick = async () => {
      const testId = b.dataset.id;
      try {
        const res = await adminFetch(`/api/admin/tests/${testId}/questions/export-csv`, { headers: aHeaders() });
        if (!res.ok) { showAlert('Ошибка экспорта вопросов', 'error'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test_${testId}_questions.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showAlert('Вопросы успешно экспортированы в CSV!', 'success');
      } catch (e) {
        showAlert('Ошибка экспорта: ' + e.message, 'error');
      }
    });
  }

  content.innerHTML = `
    <div class="admin-form" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h3 style="margin:0 0 4px 0;">📝 Управление тестами (${tests.length})</h3>
          <div class="small-muted">Создавайте тесты, настраивайте окна доступа, привязывайте к категориям и редактируйте вопросы</div>
        </div>
        <div class="admin-toolbar-actions">
          <button class="admin-button secondary" id="exportAllTestsJsonBtn">📤 Экспорт (JSON)</button>
          <button class="admin-button secondary" id="importTestsJsonBtn">📥 Импорт (JSON)</button>
          <input type="file" id="testsImportJsonFile" accept=".json,application/json" style="display:none"/>
          
          <button class="admin-button secondary" id="exportAllTestsBtn">📤 Тесты (CSV)</button>
          <button class="admin-button secondary" id="exportAllQsBtn">❓ Вопросы (CSV)</button>
          <button class="admin-button secondary" id="importTestBtn">📥 Импорт CSV</button>
          <input type="file" id="testImportFile" accept=".csv" style="display:none"/>
          <button class="admin-button danger" id="resetTests">🧹 Очистить все</button>
        </div>
      </div>

      <!-- New Test Card Form -->
      <div class="admin-subcard" style="margin-top:12px;">
        <div style="font-weight:600; font-size:14px; margin-bottom:14px; color:#1d1b18; display:flex; align-items:center; gap:6px;">
          <span>➕</span> Создание нового теста:
        </div>
        <div class="form-row">
          <label>Название теста <span style="color:#ef4444;">*</span>
            <input id="t_title" class="admin-input" placeholder="например: Отборочный тур по Математике"/>
          </label>
          <label>Категория <span style="color:#ef4444;">*</span>
            <select id="t_category" class="admin-input">
              <option value="">Выберите категорию</option>
              ${cats.map(c=>`<option value="${c.id}">${esc(c.name_ru || '')}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>🌐 Язык теста
            <select id="t_lang" class="admin-input">
              <option value="ru">🇷🇺 Русский</option>
              <option value="ky">🇰🇬 Кыргызча</option>
            </select>
          </label>
          <label>⏱️ Длительность (минут)
            <input id="t_dur" class="admin-input" type="number" value="60"/>
          </label>
          <label>📌 Статус
            <select id="t_status" class="admin-input">
              <option value="draft" selected>Черновик</option>
              <option value="published">Опубликован</option>
              <option value="archived">Архив</option>
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>🕐 Начало окна доступа (опционально)
            <input id="t_start" class="admin-input" type="datetime-local"/>
          </label>
          <label>🕐 Конец окна доступа (опционально)
            <input id="t_end" class="admin-input" type="datetime-local"/>
          </label>
        </div>
        <div class="form-row">
          <label>Краткое превью для карточки
            <input id="t_preview" class="admin-input" placeholder="Краткая аннотация для участников"/>
          </label>
          <label>Полное описание теста
            <input id="t_desc" class="admin-input" placeholder="Подробное описание регламента или правил"/>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:14px;">
          <button class="admin-button primary" id="addTest">➕ Создать тест</button>
        </div>
      </div>

      <div style="margin-top:16px;">
        <input id="testsSearchInput" class="admin-input" placeholder="🔍 Поиск тестов по названию, категории или статусу..." style="max-width:480px;"/>
      </div>
    </div>

    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:50px;">ID</th>
            <th>Название</th>
            <th>Статус</th>
            <th style="width:70px;">Язык</th>
            <th style="width:90px;">Длит.</th>
            <th>Окно доступа</th>
            <th>Категория</th>
            <th style="width:230px; text-align:right;">Действия</th>
          </tr>
        </thead>
        <tbody id="testsTbody">
        </tbody>
      </table>
    </div>
  `;

  renderTestRows();

  const searchInput = document.getElementById('testsSearchInput');
  if (searchInput) {
    searchInput.oninput = (e) => renderTestRows(e.target.value);
  }

  document.getElementById('addTest').onclick = async ()=>{
    const titleV = val('t_title');
    if(!titleV){ showAlert('Введите название теста', 'error'); return; }
    const catV = val('t_category');
    if (!catV) {
      showAlert('Выберите категорию для теста', 'error');
      return;
    }
    const body = {
      title: titleV,
      description: val('t_desc'),
      preview_text: val('t_preview'),
      status: val('t_status'),
      lang: val('t_lang'),
      duration_minutes: num('t_dur'),
      window_start: val('t_start') ? new Date(val('t_start')).toISOString() : null,
      window_end: val('t_end') ? new Date(val('t_end')).toISOString() : null,
      category_id: catV
    };
    const r = await adminFetch('/api/admin/tests',{ method:'POST', headers: aHeaders(), body: JSON.stringify(body) });
    if(!r.ok){ let msg=''; try{ msg = await r.text(); }catch{} showAlert('Ошибка создания'+(msg?': '+msg:''), 'error'); return; }
    showAlert('Тест создан!', 'success');
    renderTests();
  };

  const exportAllQsBtn = document.getElementById('exportAllQsBtn');
  if (exportAllQsBtn) {
    exportAllQsBtn.onclick = async () => {
      try {
        const res = await adminFetch('/api/admin/tests/questions/export-all-csv', { headers: aHeaders() });
        if (!res.ok) { showAlert('Ошибка экспорта всех вопросов', 'error'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all_questions_export.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showAlert('Все вопросы всех тестов успешно экспортированы в CSV!', 'success');
      } catch (e) {
        showAlert('Ошибка экспорта: ' + e.message, 'error');
      }
    };
  }

  const exportAllBtn = document.getElementById('exportAllTestsBtn');
  if (exportAllBtn) {
    exportAllBtn.onclick = async () => {
      try {
        const res = await adminFetch('/api/admin/tests/export-csv', { headers: aHeaders() });
        if (!res.ok) { showAlert('Ошибка экспорта тестов', 'error'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tests_export.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showAlert('Экспорт всех тестов завершен!', 'success');
      } catch (e) {
        showAlert('Ошибка экспорта: ' + e.message, 'error');
      }
    };
  }

  // Export all tests & questions in full fidelity JSON
  const exportAllTestsJsonBtn = document.getElementById('exportAllTestsJsonBtn');
  if (exportAllTestsJsonBtn) {
    exportAllTestsJsonBtn.onclick = async () => {
      try {
        showAlert('Подготовка экспорта всех тестов и вопросов...', 'info');
        const res = await adminFetch('/api/admin/tests/export-all-json', { headers: aHeaders() });
        if (!res.ok) { showAlert('Ошибка экспорта всех тестов', 'error'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `all_tests_akylman_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showAlert('Все тесты и их вопросы успешно экспортированы в JSON!', 'success');
      } catch (e) {
        showAlert('Ошибка экспорта: ' + e.message, 'error');
      }
    };
  }

  // Import tests & questions from JSON
  const importTestsJsonBtn = document.getElementById('importTestsJsonBtn');
  const testsImportJsonFile = document.getElementById('testsImportJsonFile');
  if (importTestsJsonBtn && testsImportJsonFile) {
    importTestsJsonBtn.onclick = () => {
      testsImportJsonFile.value = '';
      testsImportJsonFile.click();
    };

    testsImportJsonFile.onchange = async () => {
      const file = testsImportJsonFile.files && testsImportJsonFile.files[0];
      if (!file) return;
      try {
        showAlert('Загрузка и обработка файла тестов...', 'info');
        const text = await file.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (pe) {
          showAlert('Выбранный файл не является валидным JSON файлом', 'error');
          return;
        }

        const res = await adminFetch('/api/admin/tests/import-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json)
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || 'Ошибка импорта тестов');
        }

        showAlert(`Успешно импортировано тестов: ${resData.imported_tests || 0}, вопросов: ${resData.imported_questions || 0}!`, 'success');
        renderTests();
      } catch (err) {
        console.error('Import tests error:', err);
        showAlert('Ошибка при импорте тестов: ' + err.message, 'error');
      } finally {
        testsImportJsonFile.value = '';
      }
    };
  }

  document.getElementById('testImportFile').onchange = async ()=>{
    const f = document.getElementById('testImportFile').files[0];
    if (!f) return;
    const form = new FormData();
    form.append('file', f);
    const r = await adminFetch('/api/admin/tests/import-csv', { method:'POST', body: form });
    if (!r.ok) {
      let msg = 'Ошибка импорта';
      try { const j = await r.json(); msg += ': ' + (j.error || ''); } catch {}
      showAlert(msg, 'error');
      return;
    }
    const j = await r.json();
    showAlert(`Тест "${j.test_title || 'импортированный'}" создан! Вопросы: ${j.imported || 0}`, 'success');
    renderTests();
    document.getElementById('testImportFile').value = '';
  };

  document.getElementById('resetTests').onclick = async ()=>{
    if(!confirm('🧹 Удалить ВСЕ тесты, вопросы и результаты? Это действие нельзя отменить!')) return;
    try {
      const r = await adminFetch('/api/admin/tests',{ method:'DELETE', headers: aHeaders() });
      if(!r.ok){
        const errorText = await r.text();
        let errorMsg = 'Ошибка удаления всех тестов';
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg += ': ' + (errorJson.error || errorText);
        } catch {
          errorMsg += ': ' + errorText;
        }
        showAlert(errorMsg, 'error');
        console.error('Delete all tests error:', errorText);
        return;
      }
      showAlert('Все тесты и результаты удалены', 'success');
      renderTests();
    } catch (e) {
      showAlert('Ошибка удаления всех тестов: ' + e.message, 'error');
      console.error('Delete all tests exception:', e);
    }
  };
}
async function editTest(id){
  const [testsRes, catsRes] = await Promise.all([
    adminFetch('/api/admin/tests',{ headers: aHeaders() }),
    adminFetch('/api/admin/categories',{ headers: aHeaders() })
  ]);
  const tests = await testsRes.json();
  const cats = catsRes.ok ? await catsRes.json() : [];
  const t = tests.find(x=> x.id==id);
  if(!t){ showAlert('Тест не найден', 'error'); return; }
  content.innerHTML = `
    <div class="admin-form">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h3 style="margin:0 0 4px 0;">✏️ Редактирование теста #${t.id}</h3>
          <div class="small-muted">Измените параметры теста, привязку к категории и статус видимости</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="admin-button" id="openQuestionsFromEdit" style="padding:8px 14px;">❓ Вопросы (${t.questions_count || '...'})</button>
          <button class="admin-button secondary" id="back" style="padding:8px 14px;">⬅️ Назад к списку</button>
        </div>
      </div>
      <div class="form-row">
        <label>📝 Название теста <span style="color:#ef4444;">*</span>
          <input id="t_title" class="admin-input" value="${esc(t.title)}"/>
        </label>
        <label>📂 Категория <span style="color:#ef4444;">*</span>
          <select id="t_category" class="admin-input">
            <option value="">Выберите категорию</option>
            ${cats.map(c=>`<option value="${c.id}" ${t.category_id===c.id?'selected':''}>${esc(c.name_ru || '')}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="form-row">
        <label>🌐 Язык теста
          <select id="t_lang" class="admin-input">
            <option value="ru" ${t.lang==='ru'?'selected':''}>🇷🇺 Русский</option>
            <option value="ky" ${t.lang==='ky'?'selected':''}>🇰🇬 Кыргызча</option>
          </select>
        </label>
        <label>⏱️ Длительность (минут)
          <input id="t_dur" class="admin-input" type="number" value="${t.duration_minutes}"/>
        </label>
        <label>📌 Статус
          <select id="t_status" class="admin-input">
            <option value="draft" ${t.status==='draft'?'selected':''}>Черновик</option>
            <option value="published" ${t.status==='published'?'selected':''}>Опубликован</option>
            <option value="archived" ${t.status==='archived'?'selected':''}>Архив</option>
          </select>
        </label>
      </div>
      <div class="form-row">
        <label>🕐 Начало окна доступа
          <input id="t_start" class="admin-input" type="datetime-local" value="${toDatetimeLocalValue(t.window_start)}"/>
        </label>
        <label>🕐 Конец окна доступа
          <input id="t_end" class="admin-input" type="datetime-local" value="${toDatetimeLocalValue(t.window_end)}"/>
        </label>
      </div>
      <div class="form-row">
        <label>Краткое превью
          <input id="t_preview" class="admin-input" value="${esc(t.preview_text||'')}"/>
        </label>
        <label>Полное описание
          <input id="t_desc" class="admin-input" value="${esc(t.description||'')}"/>
        </label>
      </div>
      <div style="margin-top:16px; display:flex; gap:8px;">
        <button class="admin-button success" id="save" style="padding:10px 24px; font-weight:600;">💾 Сохранить изменения</button>
      </div>
    </div>
  `;
  document.getElementById('back').onclick = renderTests;
  document.getElementById('openQuestionsFromEdit').onclick = () => renderQuestions(t.id);
  document.getElementById('save').onclick = async ()=>{
    const titleV = val('t_title');
    if(!titleV){ showAlert('Введите название теста', 'error'); return; }
    const catV = val('t_category');
    if (!catV) {
      showAlert('Выберите категорию для теста', 'error');
      return;
    }
    const body = {
      title: titleV,
      description: val('t_desc'),
      preview_text: val('t_preview'),
      status: val('t_status'),
      lang: val('t_lang'),
      duration_minutes: num('t_dur'),
      window_start: val('t_start') ? new Date(val('t_start')).toISOString() : null,
      window_end: val('t_end') ? new Date(val('t_end')).toISOString() : null,
      category_id: catV
    };
    const r = await adminFetch('/api/admin/tests/'+id,{ method:'PUT', headers: aHeaders(), body: JSON.stringify(body) });
    if(!r.ok){ let msg=''; try{ msg = await r.text(); }catch{} showAlert('Ошибка сохранения'+(msg?': '+msg:''), 'error'); return; }
    showAlert('Тест обновлен!', 'success');
    renderTests();
  };
}
let pendingDeleteTestId = null;

function showDeleteTestModal(id) {
  pendingDeleteTestId = id;
  const modal = document.getElementById('deleteTestModal');
  modal.style.display = 'flex';
}

function hideDeleteTestModal() {
  const modal = document.getElementById('deleteTestModal');
  modal.style.display = 'none';
  pendingDeleteTestId = null;
}

async function confirmDeleteTest() {
  if (!pendingDeleteTestId) return;
  const id = pendingDeleteTestId;
  hideDeleteTestModal();
  
  try {
    const r = await adminFetch('/api/admin/tests/' + id, { method: 'DELETE', headers: aHeaders() });
    if (!r.ok) {
      showAlert('Ошибка удаления', 'error');
      return;
    }
    showAlert('Тест удален!', 'success');
    renderTests();
  } catch (e) {
    showAlert('Ошибка удаления: ' + e.message, 'error');
  }
}

// Инициализация обработчиков модального окна (выполняется сразу, так как модальное окно уже в DOM)
(function initDeleteModal() {
  const modal = document.getElementById('deleteTestModal');
  const closeBtn = document.getElementById('closeDeleteModal');
  const cancelBtn = document.getElementById('cancelDeleteTest');
  const confirmBtn = document.getElementById('confirmDeleteTest');
  
  if (closeBtn) closeBtn.onclick = hideDeleteTestModal;
  if (cancelBtn) cancelBtn.onclick = hideDeleteTestModal;
  if (confirmBtn) confirmBtn.onclick = confirmDeleteTest;
  
  // Закрытие при клике вне модального окна
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) hideDeleteTestModal();
    };
  }
  
  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      hideDeleteTestModal();
    }
  });
})();

async function deleteTest(id) {
  showDeleteTestModal(id);
}

// --- Category Modals & Handlers ---
let pendingDeleteCategoryId = null;

function showCategoryModal(cat = null) {
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  const idInput = document.getElementById('cat_edit_id');
  const ruInput = document.getElementById('modal_cat_ru');
  const kyInput = document.getElementById('modal_cat_ky');
  const druInput = document.getElementById('modal_cat_dru');
  const dkyInput = document.getElementById('modal_cat_dky');

  if (cat) {
    title.textContent = `✏️ Редактирование категории #${cat.id}`;
    idInput.value = cat.id;
    ruInput.value = cat.name_ru || '';
    kyInput.value = cat.name_ky || '';
    druInput.value = cat.desc_ru || '';
    dkyInput.value = cat.desc_ky || '';
  } else {
    title.textContent = '➕ Добавление новой категории';
    idInput.value = '';
    ruInput.value = '';
    kyInput.value = '';
    druInput.value = '';
    dkyInput.value = '';
  }

  modal.style.display = 'flex';
  setTimeout(() => ruInput.focus(), 60);
}

function hideCategoryModal() {
  const modal = document.getElementById('categoryModal');
  if (modal) modal.style.display = 'none';
}

function showDeleteCategoryModal(id, name) {
  pendingDeleteCategoryId = id;
  const modal = document.getElementById('deleteCategoryModal');
  const text = document.getElementById('deleteCatConfirmText');
  const sub = document.getElementById('deleteCatWarningSub');
  const btn = document.getElementById('confirmDeleteCat');
  if (text) {
    text.innerHTML = `Вы уверены, что хотите удалить категорию <strong>«${esc(name || `#${id}`)}»</strong>?`;
  }
  if (sub) {
    sub.innerHTML = `Это действие необратимо. При необходимости привязанные тесты будут отвязаны.`;
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Удалить';
    btn.onclick = () => confirmDeleteCategory(false);
  }
  if (modal) modal.style.display = 'flex';
}

function hideDeleteCategoryModal() {
  pendingDeleteCategoryId = null;
  const modal = document.getElementById('deleteCategoryModal');
  if (modal) modal.style.display = 'none';
}

async function confirmDeleteCategory(force = false) {
  if (!pendingDeleteCategoryId) return;
  const id = pendingDeleteCategoryId;
  const btn = document.getElementById('confirmDeleteCat');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Удаление...'; }

  try {
    const url = force ? `/api/admin/categories/${id}?force=true` : `/api/admin/categories/${id}`;
    const res = await adminFetch(url, { method: 'DELETE', headers: aHeaders() });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch {}
      if (data.hasTests) {
        const text = document.getElementById('deleteCatConfirmText');
        const sub = document.getElementById('deleteCatWarningSub');
        if (text) {
          text.innerHTML = `⚠️ <strong>Внимание:</strong> к этой категории привязано тестов: <strong>${data.testsCount}</strong> (${(data.testTitles || []).map(t => `«${esc(t)}»`).join(', ')}).`;
        }
        if (sub) {
          sub.innerHTML = `<span style="color: #b91c1c; font-weight: 500;">Вы хотите отвязать эти тесты от категории и всё равно удалить категорию?</span>`;
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Отвязать тесты и удалить';
          btn.onclick = () => confirmDeleteCategory(true);
        }
        return;
      }
      showAlert(data.error || 'Не удалось удалить категорию', 'error');
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.unlinkedTests) {
      showAlert(`Категория удалена, ${data.unlinkedTests} тест(ов) отвязано.`, 'success');
    } else {
      showAlert('Категория успешно удалена!', 'success');
    }
    hideDeleteCategoryModal();
    renderCategories();
  } catch (err) {
    showAlert('Ошибка при удалении: ' + err.message, 'error');
  } finally {
    if (btn && btn.textContent !== 'Отвязать тесты и удалить') {
      btn.disabled = false;
      btn.textContent = prevText || 'Удалить';
    }
  }
}

async function handleSaveCategory() {
  const id = (document.getElementById('cat_edit_id').value || '').trim();
  const name_ru = (document.getElementById('modal_cat_ru').value || '').trim();
  const name_ky = (document.getElementById('modal_cat_ky').value || '').trim();
  const desc_ru = (document.getElementById('modal_cat_dru').value || '').trim();
  const desc_ky = (document.getElementById('modal_cat_dky').value || '').trim();

  if (!name_ru) {
    showAlert('Укажите название категории на русском языке', 'error');
    document.getElementById('modal_cat_ru').focus();
    return;
  }
  if (!name_ky) {
    showAlert('Укажите название категории на кыргызском языке', 'error');
    document.getElementById('modal_cat_ky').focus();
    return;
  }

  const btn = document.getElementById('saveCategoryBtn');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  const body = { name_ru, name_ky, desc_ru, desc_ky };

  try {
    let res;
    if (id) {
      res = await adminFetch(`/api/admin/categories/${id}`, {
        method: 'PUT',
        headers: aHeaders(),
        body: JSON.stringify(body)
      });
    } else {
      res = await adminFetch('/api/admin/categories', {
        method: 'POST',
        headers: aHeaders(),
        body: JSON.stringify(body)
      });
    }

    if (!res.ok) {
      await showResponseError(res, id ? 'Ошибка обновления категории' : 'Ошибка создания категории');
      return;
    }

    showAlert(id ? 'Категория успешно обновлена!' : 'Категория успешно создана!', 'success');
    hideCategoryModal();
    renderCategories();
  } catch (err) {
    showAlert('Ошибка: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
  }
}

// Initializing category modal events
(function initCategoryModals() {
  const catModal = document.getElementById('categoryModal');
  const closeCatBtn = document.getElementById('closeCategoryModal');
  const cancelCatBtn = document.getElementById('cancelCategoryBtn');
  const saveCatBtn = document.getElementById('saveCategoryBtn');

  if (closeCatBtn) closeCatBtn.onclick = hideCategoryModal;
  if (cancelCatBtn) cancelCatBtn.onclick = hideCategoryModal;
  if (saveCatBtn) saveCatBtn.onclick = handleSaveCategory;

  if (catModal) {
    catModal.onclick = (e) => {
      if (e.target === catModal) hideCategoryModal();
    };
  }

  const delModal = document.getElementById('deleteCategoryModal');
  const closeDelBtn = document.getElementById('closeDeleteCatModal');
  const cancelDelBtn = document.getElementById('cancelDeleteCat');
  const confirmDelBtn = document.getElementById('confirmDeleteCat');

  if (closeDelBtn) closeDelBtn.onclick = hideDeleteCategoryModal;
  if (cancelDelBtn) cancelDelBtn.onclick = hideDeleteCategoryModal;
  if (confirmDelBtn) confirmDelBtn.onclick = confirmDeleteCategory;

  if (delModal) {
    delModal.onclick = (e) => {
      if (e.target === delModal) hideDeleteCategoryModal();
    };
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (catModal && catModal.style.display === 'flex') hideCategoryModal();
      if (delModal && delModal.style.display === 'flex') hideDeleteCategoryModal();
    }
  });
})();

// Categories Tab
async function renderCategories(){
  setActiveTab(document.getElementById('tabCategories'));
  showLoading('Загрузка категорий...');
  const res = await adminFetch('/api/admin/categories', { headers: aHeaders() });
  if(!res.ok){ await showResponseError(res, 'Ошибка загрузки категорий'); return; }
  const cats = await res.json();

  content.innerHTML = `
    <div class="admin-form" style="margin-bottom: 24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom: 16px;">
        <div>
          <h3 style="margin-bottom: 4px;">📂 Управление категориями (${cats.length})</h3>
          <p class="small-muted" style="margin: 0; font-size: 13.5px; color: #64748b;">
            Категории определяют направления олимпиады, группируют тесты и команды.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="admin-button success" id="btnOpenNewCat" style="padding: 9px 18px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
            ➕ Добавить категорию
          </button>
          ${cats.length > 0 ? `
          <button class="admin-button danger" id="btnWipeAllCats" style="padding: 9px 18px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
            🗑️ Очистить все категории
          </button>
          ` : ''}
        </div>
      </div>

      <!-- Quick Add Category Form -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 8px;">
        <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px; color: #1e293b; display: flex; align-items: center; gap: 6px;">
          <span>⚡</span> Быстрое добавление новой категории:
        </div>
        <div class="form-row" style="margin-bottom: 10px;">
          <label style="flex:1;">
            🇷🇺 Название (RU) <span style="color:#ef4444;">*</span>
            <input id="quick_cat_ru" class="admin-input" placeholder="например: Информатика" />
          </label>
          <label style="flex:1;">
            🇰🇬 Название (KY) <span style="color:#ef4444;">*</span>
            <input id="quick_cat_ky" class="admin-input" placeholder="мисалы: Информатика" />
          </label>
        </div>
        <div class="form-row" style="margin-bottom: 12px;">
          <label style="flex:1;">
            🇷🇺 Описание (RU, опционально)
            <textarea id="quick_cat_dru" class="admin-input" rows="2" placeholder="Краткое описание категории"></textarea>
          </label>
          <label style="flex:1;">
            🇰🇬 Описание (KY, опционально)
            <textarea id="quick_cat_dky" class="admin-input" rows="2" placeholder="Категория жөнүндө кыскача маалымат"></textarea>
          </label>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button class="admin-button success" id="quickAddCatBtn" style="padding: 8px 18px; font-weight: 500;">
            ➕ Создать категорию
          </button>
        </div>
      </div>
    </div>

    <div class="admin-table-wrapper" style="margin-top: 0;">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width: 50px;">ID</th>
            <th>🇷🇺 Название и описание (RU)</th>
            <th>🇰🇬 Название и описание (KY)</th>
            <th style="width: 140px; text-align: center;">Статистика</th>
            <th style="width: 180px; text-align: right;">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${cats.length > 0 ? cats.map(c => `
            <tr>
              <td><span style="font-weight: 600; color: #64748b;">#${c.id}</span></td>
              <td>
                <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${esc(c.name_ru || '')}</div>
                ${c.desc_ru ? `<div class="small-muted" style="margin-top: 3px; font-size: 12.5px; line-height: 1.4; color: #64748b;">${esc(c.desc_ru)}</div>` : ''}
              </td>
              <td>
                <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${esc(c.name_ky || '')}</div>
                ${c.desc_ky ? `<div class="small-muted" style="margin-top: 3px; font-size: 12.5px; line-height: 1.4; color: #64748b;">${esc(c.desc_ky)}</div>` : ''}
              </td>
              <td style="text-align: center;">
                <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11.5px; font-weight: 600; background: #e0e7ff; color: #3730a3;">
                    📝 ${c.tests_count || 0} ${pluralizeRu(c.tests_count || 0, 'тест', 'теста', 'тестов')}
                  </span>
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11.5px; font-weight: 600; background: #ecfdf5; color: #065f46;">
                    👥 ${c.teams_count || 0} ${pluralizeRu(c.teams_count || 0, 'команда', 'команды', 'команд')}
                  </span>
                </div>
              </td>
              <td style="text-align: right;">
                <div class="admin-table-actions" style="justify-content: flex-end;">
                  <button class="admin-button secondary cedit" data-id="${c.id}">
                    ✏️ Редакт.
                  </button>
                  <button class="admin-button danger cdel" data-id="${c.id}" data-name="${esc(c.name_ru || '')}">
                    🗑️ Удалить
                  </button>
                </div>
              </td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="5" style="text-align:center; padding:32px 16px; color:#64748b;">
                <div style="font-size: 24px; margin-bottom: 8px;">📂</div>
                <div style="font-weight: 500;">Нет добавленных категорий</div>
                <div style="font-size: 13px; margin-top: 4px;">Добавьте первую категорию с помощью формы выше.</div>
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;

  // Bind Open Modal Button
  const btnOpenModal = document.getElementById('btnOpenNewCat');
  if (btnOpenModal) btnOpenModal.onclick = () => showCategoryModal(null);

  // Bind Wipe All Categories Button
  const btnWipeAllCats = document.getElementById('btnWipeAllCats');
  if (btnWipeAllCats) {
    btnWipeAllCats.onclick = () => {
      showAdminConfirm(
        'Очистка всех категорий',
        'Удалить <strong>ВСЕ категории</strong>?',
        'Категории будут безвозвратно удалены. Связанные тесты и команды будут отвязаны от категорий.',
        async () => {
          btnWipeAllCats.disabled = true;
          try {
            const res = await adminFetch('/api/admin/reset-categories', {
              method: 'POST',
              headers: aHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              showAlert(data.error || 'Ошибка при очистке категорий', 'error');
              btnWipeAllCats.disabled = false;
              return;
            }
            showAlert(data.message || 'Все категории успешно удалены!', 'success');
            renderCategories();
          } catch (err) {
            showAlert('Ошибка запроса: ' + err.message, 'error');
            btnWipeAllCats.disabled = false;
          }
        }
      );
    };
  }

  // Bind Quick Add Form
  const quickAddBtn = document.getElementById('quickAddCatBtn');
  if (quickAddBtn) {
    quickAddBtn.onclick = async () => {
      const name_ru = (document.getElementById('quick_cat_ru').value || '').trim();
      const name_ky = (document.getElementById('quick_cat_ky').value || '').trim();
      const desc_ru = (document.getElementById('quick_cat_dru').value || '').trim();
      const desc_ky = (document.getElementById('quick_cat_dky').value || '').trim();

      if (!name_ru) {
        showAlert('Укажите название категории на русском языке', 'error');
        document.getElementById('quick_cat_ru').focus();
        return;
      }
      if (!name_ky) {
        showAlert('Укажите название категории на кыргызском языке', 'error');
        document.getElementById('quick_cat_ky').focus();
        return;
      }

      quickAddBtn.disabled = true;
      quickAddBtn.textContent = 'Добавление...';

      try {
        const body = { name_ru, name_ky, desc_ru, desc_ky };
        const r = await adminFetch('/api/admin/categories', {
          method: 'POST',
          headers: aHeaders(),
          body: JSON.stringify(body)
        });

        if (!r.ok) {
          await showResponseError(r, 'Ошибка создания категории');
          return;
        }

        showAlert('Категория успешно создана!', 'success');
        renderCategories();
      } catch (err) {
        showAlert('Ошибка: ' + err.message, 'error');
      } finally {
        quickAddBtn.disabled = false;
        quickAddBtn.textContent = '➕ Создать категорию';
      }
    };
  }

  // Bind Edit buttons
  content.querySelectorAll('.cedit').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.id, 10);
      const category = cats.find(c => c.id === id);
      if (category) {
        showCategoryModal(category);
      } else {
        showAlert('Категория не найдена', 'error');
      }
    };
  });

  // Bind Delete buttons
  content.querySelectorAll('.cdel').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.id, 10);
      const name = btn.dataset.name || `Категория #${id}`;
      showDeleteCategoryModal(id, name);
    };
  });
}

// Questions Management
let currentTestId = null;
async function renderQuestions(testId){
  setActiveTab(document.getElementById('tabTests'));
  if(testId) currentTestId = testId;
  if(!currentTestId){
    renderTests();
    return;
  }
  showLoading('Загрузка вопросов...');
  const res = await adminFetch('/api/admin/tests/'+currentTestId+'/questions',{ headers: aHeaders() });
  const qs = res.ok ? await res.json() : [];
  const testInfoRes = await adminFetch('/api/admin/tests', { headers: aHeaders() });
  const allTests = testInfoRes.ok ? await testInfoRes.json() : [];
  const currentTestObj = allTests.find(t => String(t.id) === String(currentTestId)) || { title: `Тест #${currentTestId}` };

  content.innerHTML = `
    <div class="admin-header-actions" style="margin-bottom:16px;">
      <div>
        <h3 style="margin:0 0 4px 0;">❓ Вопросы теста: «${esc(currentTestObj.title || 'Тест #' + currentTestId)}»</h3>
        <div class="small-muted">Всего вопросов: ${qs.length} • Перетаскивайте за ≡ для изменения порядка</div>
      </div>
      <div class="admin-toolbar-actions">
        <button id="backTests" class="admin-button secondary">⬅️ К списку тестов</button>
        <button id="addBlank" class="admin-button primary">➕ Добавить вопрос</button>
        <button id="exportTestJsonFromQs" class="admin-button secondary">📤 Экспорт (JSON)</button>
        <button id="importTestJsonFromQs" class="admin-button secondary">📥 Импорт (JSON)</button>
        <input type="file" id="importJsonFromQsFile" accept=".json,application/json" style="display:none"/>
        <button id="exportCsv" class="admin-button secondary">📄 Экспорт CSV</button>
        <label class="admin-button secondary" style="cursor:pointer; margin:0;">
          📥 Импорт CSV <input id="csvFile" type="file" accept=".csv" style="display:none"/>
        </label>
      </div>
    </div>
    <div id="qList" class="q-list" style="display:flex;flex-direction:column;gap:12px;margin-top:10px"></div>
    <div style="margin-top:20px; padding-top:16px; border-top:1px solid var(--adm-border, #b8b0a0); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <button id="saveAllQuestions" class="admin-button success">💾 Сохранить все вопросы</button>
      <button id="addBlankBottom" class="admin-button secondary">➕ Добавить еще вопрос</button>
    </div>
  `;
  document.getElementById('backTests').onclick = renderTests;

  // Export JSON from Questions view
  const exportTestJsonFromQs = document.getElementById('exportTestJsonFromQs');
  if (exportTestJsonFromQs) {
    exportTestJsonFromQs.onclick = async () => {
      try {
        showAlert('Подготовка экспорта вопросов...', 'info');
        const res = await adminFetch(`/api/admin/tests/${currentTestId}/export-json`, { headers: aHeaders() });
        if (!res.ok) { showAlert('Ошибка экспорта теста', 'error'); return; }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanTitle = (currentTestObj?.title || `test_${currentTestId}`).replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50).trim();
        a.download = `test_${currentTestId}_${cleanTitle}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showAlert('Тест и вопросы успешно экспортированы в JSON!', 'success');
      } catch (e) {
        showAlert('Ошибка экспорта: ' + e.message, 'error');
      }
    };
  }

  // Import JSON from Questions view
  const importTestJsonFromQs = document.getElementById('importTestJsonFromQs');
  const importJsonFromQsFile = document.getElementById('importJsonFromQsFile');
  if (importTestJsonFromQs && importJsonFromQsFile) {
    importTestJsonFromQs.onclick = () => {
      importJsonFromQsFile.value = '';
      importJsonFromQsFile.click();
    };

    importJsonFromQsFile.onchange = async () => {
      const file = importJsonFromQsFile.files && importJsonFromQsFile.files[0];
      if (!file) return;

      showAdminChoiceModal({
        title: `Импорт вопросов в «${currentTestObj.title}»`,
        message: 'Как вы хотите загрузить вопросы из выбранного файла?',
        options: [
          { id: 'append', label: '➕ Добавить вопросы к текущему тесту', class: 'admin-button primary' },
          { id: 'replace', label: '🔄 Заменить все вопросы в этом тесте', class: 'admin-button danger' }
        ],
        onChoice: async (choice) => {
          if (!choice) return;
          try {
            showAlert('Импорт вопросов...', 'info');
            const text = await file.text();
            const json = JSON.parse(text);

            const res = await adminFetch(`/api/admin/tests/${currentTestId}/import-questions-json?mode=${choice}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(json)
            });
            const resData = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(resData.error || 'Ошибка импорта вопросов');
            showAlert(`Вопросы успешно импортированы (${choice === 'replace' ? 'заменено' : 'добавлено'}: ${resData.imported_questions || 0})!`, 'success');
            renderQuestions(currentTestId);
          } catch (err) {
            showAlert('Ошибка импорта: ' + err.message, 'error');
          } finally {
            importJsonFromQsFile.value = '';
          }
        }
      });
    };
  }
  document.getElementById('exportCsv').onclick = async ()=>{
    try{
      const res = await adminFetch('/api/admin/tests/'+currentTestId+'/questions/export-csv', { headers: aHeaders() });
      if(!res.ok){ showAlert('Ошибка экспорта', 'error'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `test_${currentTestId}_questions.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showAlert('Вопросы теста успешно экспортированы в CSV!', 'success');
    }catch(e){
      showAlert('Ошибка экспорта: ' + e.message, 'error');
    }
  };
  const csvFileInput = document.getElementById('csvFile');
  if (csvFileInput) {
    csvFileInput.onchange = async () => {
      const f = csvFileInput.files[0];
      if (!f) return;
      const form = new FormData();
      form.append('file', f);
      showLoading('Импортируем вопросы из CSV...');
      const r = await adminFetch('/api/admin/tests/'+currentTestId+'/questions/import-csv', { method:'POST', body: form });
      if(!r.ok){ showAlert('Ошибка импорта CSV', 'error'); }
      else { showAlert('Вопросы успешно импортированы!', 'success'); }
      renderQuestions(currentTestId);
    };
  }

  const qList = document.getElementById('qList');

  async function saveAllQuestions(){
    const btn = document.getElementById('saveAllQuestions');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '💾 Сохранение...';
    
    const cards = Array.from(qList.querySelectorAll('.card'));
    let errors = [];
    let saved = 0;
    
    for(let i = 0; i < cards.length; i++){
      const card = cards[i];
      const qid = card.dataset.qid;
      const typeSel = card.querySelector('.q-type');
      const type = (typeSel && typeSel.value === 'text') ? 'text' : 'mcq';
      const text = (card.querySelector('.q-text')?.value || '').replace(/\r\n/g, '\n').trim();
      const points = parseInt(card.querySelector('.q-points')?.value || '1', 10) || 1;
      const attachment = (card.querySelector('.q-attachment')?.value || '').trim();

      let options = null;
      let correct = '';

      if(type === 'mcq'){
        const optsWrap = card.querySelector('.opts');
        if(optsWrap){
          const res = collectOptionsFrom(optsWrap);
          options = res.options;
          correct = res.correct;
        }
      } else {
        correct = (card.querySelector('.q-correct-text')?.value || '').trim();
        options = null;
      }

      if(!text){
        continue; // Пропускаем пустые вопросы
      }

      const ordinal = i + 1;

      try{
        if(qid){
          // Обновление существующего вопроса
          const payload = { ordinal, text, options, correct, points, type, attachment_url: attachment || null };
          const r = await adminFetch('/api/admin/questions/'+qid, { method:'PUT', headers:aHeaders(), body: JSON.stringify(payload) });
          if(!r.ok){
            errors.push(`Вопрос #${ordinal}: ошибка сохранения`);
            continue;
          }
        } else {
          // Создание нового вопроса
          const payload = { ordinal, text, options, correct, points, type, attachment_url: attachment || null };
          const r = await adminFetch('/api/admin/tests/'+currentTestId+'/questions', { method:'POST', headers:aHeaders(), body: JSON.stringify(payload) });
          if(!r.ok){
            errors.push(`Вопрос #${ordinal}: ошибка создания`);
            continue;
          }
        }
        saved++;
      } catch(e){
        errors.push(`Вопрос #${ordinal}: ${e.message}`);
      }
    }
    
    btn.disabled = false;
    btn.textContent = originalText;
    
    if(errors.length > 0){
      showAlert(`Сохранено: ${saved}, ошибок: ${errors.length}`, 'error');
    } else {
      showAlert(`Все вопросы успешно сохранены (${saved})!`, 'success');
    }
    
    renderQuestions(currentTestId);
  }
  
  document.getElementById('saveAllQuestions').onclick = saveAllQuestions;

  function buildImageWidget(initialUrl, onUrlChanged) {
    const widget = document.createElement('div');
    widget.tabIndex = 0;
    let currentUrl = (initialUrl || '').trim();

    function render() {
      widget.className = 'q-image-widget' + (currentUrl ? ' has-image' : '');
      if (currentUrl) {
        widget.innerHTML = `
          <div class="q-image-preview-container">
            <img src="${esc(currentUrl)}" class="q-image-preview-thumb" alt="Картинка к вопросу" title="Нажмите для увеличения" onerror="this.onerror=null; this.classList.add('img-error'); this.alt='Ошибка отображения';"/>
            <div class="q-image-meta">
              <div class="q-image-status-badge"><span>🖼️</span><span>Изображение прикреплено</span></div>
              <div class="q-image-url-text">${esc(currentUrl)}</div>
            </div>
            <div class="q-image-actions">
              <button type="button" class="admin-button secondary btn-zoom-img" title="Увеличить">🔍 Просмотр</button>
              <button type="button" class="admin-button secondary btn-change-img" title="Заменить картинку">🔄 Заменить</button>
              <button type="button" class="admin-button danger btn-remove-img" title="Удалить картинку">🗑️ Удалить</button>
            </div>
          </div>
          <input type="file" class="hidden-file-input" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.svg,.bmp,.jfif,.ico,.avif" style="display:none;"/>
        `;
        widget.querySelector('.q-image-preview-thumb').onclick = () => showImageZoom(currentUrl);
        widget.querySelector('.btn-zoom-img').onclick = () => showImageZoom(currentUrl);
        const changeFileInput = widget.querySelector('.hidden-file-input');
        widget.querySelector('.btn-change-img').onclick = () => {
          changeFileInput.value = '';
          changeFileInput.click();
        };
        widget.querySelector('.btn-remove-img').onclick = () => {
          currentUrl = '';
          onUrlChanged('');
          render();
        };
        changeFileInput.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) await uploadFile(file);
          changeFileInput.value = '';
        };
      } else {
        widget.innerHTML = `
          <div class="q-image-dropzone" title="Нажмите или перетащите файл сюда">
            <div class="dropzone-icon">🖼️</div>
            <div class="dropzone-title">Прикрепить картинку к вопросу</div>
            <div class="dropzone-hint">Перетащите изображение сюда, нажмите для выбора или вставьте скриншот (Ctrl+V)</div>
            <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap;">
              <button type="button" class="admin-button secondary btn-select-file" style="padding: 5px 12px; font-size: 12.5px;">📁 Загрузить файл</button>
              <button type="button" class="admin-button secondary btn-toggle-url" style="padding: 5px 12px; font-size: 12.5px;">🔗 Ссылка (URL)</button>
            </div>
            <div class="manual-url-box" style="display:none; margin-top:10px; max-width: 460px; margin-left: auto; margin-right: auto;">
              <div style="display:flex; gap:6px;">
                <input type="text" class="admin-input manual-url-input" placeholder="https://example.com/image.jpg или /uploads/..." style="padding: 6px 10px; font-size: 12.5px;"/>
                <button type="button" class="admin-button success btn-apply-url" style="padding: 6px 12px; font-size: 12.5px;">OK</button>
              </div>
            </div>
            <input type="file" class="hidden-file-input" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.svg,.bmp,.jfif,.ico,.avif" style="display:none;"/>
          </div>
        `;
        const dropzone = widget.querySelector('.q-image-dropzone');
        const fileInput = widget.querySelector('.hidden-file-input');
        const btnSelect = widget.querySelector('.btn-select-file');
        const btnToggleUrl = widget.querySelector('.btn-toggle-url');
        const manualBox = widget.querySelector('.manual-url-box');
        const urlInput = widget.querySelector('.manual-url-input');
        const btnApplyUrl = widget.querySelector('.btn-apply-url');

        btnSelect.onclick = (e) => {
          e.stopPropagation();
          fileInput.value = '';
          fileInput.click();
        };
        fileInput.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) await uploadFile(file);
          fileInput.value = '';
        };

        btnToggleUrl.onclick = (e) => {
          e.stopPropagation();
          manualBox.style.display = manualBox.style.display === 'none' ? 'block' : 'none';
          if (manualBox.style.display === 'block') urlInput.focus();
        };

        btnApplyUrl.onclick = (e) => {
          e.stopPropagation();
          const u = urlInput.value.trim();
          if (u) {
            currentUrl = u;
            onUrlChanged(u);
            render();
          }
        };

        dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
        dropzone.ondragleave = () => { dropzone.classList.remove('drag-over'); };
        dropzone.ondrop = async (e) => {
          e.preventDefault();
          dropzone.classList.remove('drag-over');
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await uploadFile(e.dataTransfer.files[0]);
          }
        };

        dropzone.onclick = (e) => {
          if (!e.target.closest('button') && !e.target.closest('input')) {
            fileInput.value = '';
            fileInput.click();
          }
        };
      }
    }

    async function uploadFile(file) {
      if (!file) return;
      const isImage = (file.type && file.type.startsWith('image/')) ||
        /\.(jpe?g|png|webp|gif|svg|bmp|jfif|heic|ico|avif|tiff?)$/i.test(file.name || '') ||
        (!file.type && file.size > 0);
      if (!isImage) {
        showAlert('Пожалуйста, выберите файл изображения (JPG, PNG, WEBP, GIF, SVG, BMP)', 'error');
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        showAlert('Размер файла не должен превышать 50 МБ', 'error');
        return;
      }

      widget.innerHTML = `<div style="padding:16px; text-align:center; color:#2563eb; font-size:13px; font-weight:600;"><span style="display:inline-block; width:16px; height:16px; border:2px solid #2563eb; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:8px; vertical-align:middle;"></span> Загрузка изображения (${Math.round(file.size / 1024) || 1} КБ)...</div>`;

      let uploadSuccess = false;
      let uploadedUrl = '';
      let errorMsg = '';

      // 1. Try standard multipart upload
      try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await adminFetch('/api/admin/upload-image', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.url) {
            uploadedUrl = data.url;
            uploadSuccess = true;
          }
        } else {
          try {
            const j = await res.json();
            if (j.error) errorMsg = j.error;
          } catch {}
        }
      } catch (err) {
        errorMsg = err.message;
      }

      // 2. Seamless base64 fallback if multipart fails
      if (!uploadSuccess) {
        try {
          const base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const bRes = await adminFetch('/api/admin/upload-image-base64', {
            method: 'POST',
            body: JSON.stringify({ base64Data, filename: file.name || 'image.png' })
          });
          if (bRes.ok) {
            const bData = await bRes.json().catch(() => ({}));
            if (bData.url) {
              uploadedUrl = bData.url;
              uploadSuccess = true;
            }
          } else {
            try {
              const bj = await bRes.json();
              if (bj.error) errorMsg = bj.error;
            } catch {}
          }
        } catch (bErr) {
          if (!errorMsg) errorMsg = bErr.message;
        }
      }

      try {
        if (uploadSuccess && uploadedUrl) {
          currentUrl = uploadedUrl;
          onUrlChanged(uploadedUrl);
          showAlert('Изображение успешно прикреплено!', 'success');
        } else {
          showAlert('Ошибка загрузки изображения' + (errorMsg ? ': ' + errorMsg : ''), 'error');
        }
      } catch (postErr) {
        console.warn('post upload callback error:', postErr);
      } finally {
        render();
      }
    }

    // Support paste directly into widget
    widget.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && (item.type.startsWith('image/') || item.type === '')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            await uploadFile(file);
            break;
          }
        }
      }
    });

    // Expose uploadFile method for external callers (e.g. card paste)
    widget.uploadFile = uploadFile;

    render();
    return widget;
  }

  function createOptionRow(initialValue='', groupName, isChecked=false){
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.style.cssText = 'margin-bottom: 10px; width: 100%;';
    row.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px;width:100%">
        <input type="radio" class="q-correct-radio" name="${groupName}" ${isChecked?'checked':''} title="Правильный" style="flex-shrink:0; margin-top:10px;"/>
        <textarea class="admin-input opt" placeholder="Вариант ответа" style="flex:1; min-width:0; min-height:42px; resize:vertical; white-space:pre-wrap;">${esc(initialValue)}</textarea>
        <button class="admin-button danger opt-del" title="Удалить вариант" style="padding:8px 12px; flex-shrink:0; white-space:nowrap; margin-top:2px;">✖ Удалить</button>
      </div>
    `;
    const input = row.querySelector('textarea.opt');
    const delBtn = row.querySelector('.opt-del');
    delBtn.onclick = (e)=>{ e.preventDefault(); row.remove(); };
    input.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' && !e.shiftKey){
        e.preventDefault();
        const parent = row.parentElement;
        const newRow = createOptionRow('', groupName, false);
        parent.insertBefore(newRow, row.nextSibling);
        newRow.querySelector('textarea.opt').focus();
      } else if(e.key==='Backspace' && input.value===''){
        const parent = row.parentElement;
        const siblings = Array.from(parent.querySelectorAll('.opt-row'));
        if(siblings.length>1){
          e.preventDefault();
          const prev = row.previousElementSibling || row.nextElementSibling;
          row.remove();
          if(prev) prev.querySelector('textarea.opt')?.focus();
        }
      }
    });
    return row;
  }

  function collectOptionsFrom(container){
    const rows = Array.from(container.querySelectorAll('.opt-row'));
    const options = [];
    let correctIdx = '';
    for(const r of rows){
      const textarea = r.querySelector('textarea.opt') || r.querySelector('input.opt');
      const val = (textarea ? textarea.value : '').replace(/\r\n/g, '\n').trim();
      const checked = !!r.querySelector('input.q-correct-radio')?.checked;
      if(val){
        if(checked && correctIdx===''){ correctIdx = String(options.length); }
        options.push(val);
      }
    }
    return { options, correct: correctIdx };
  }

  async function saveNewQuestion(blank){
    const type = (blank.querySelector('.q-type')?.value === 'text') ? 'text' : 'mcq';
    const text = (blank.querySelector('.q-text')?.value || '').replace(/\r\n/g, '\n').trim();
    const points = parseInt(blank.querySelector('.q-points')?.value || '1', 10) || 1;
    const attachment = (blank.querySelector('.q-attachment')?.value || '').trim();
    let options = null;
    let correct = '';
    
    if (!text) {
      showAlert('Введите текст вопроса', 'error');
      return;
    }

    if (type === 'mcq') {
      const res = collectOptionsFrom(blank.querySelector('.opts'));
      options = res.options;
      correct = res.correct;
      if (options.length === 0) {
        showAlert('Добавьте хотя бы один вариант ответа для закрытого вопроса', 'error');
        return;
      }
    } else {
      correct = (blank.querySelector('.q-correct-text')?.value || '').trim();
      options = null;
    }

    const payload = { ordinal: (qs.length + 1), text, options, correct, points, type, attachment_url: attachment || null };
    const r = await adminFetch('/api/admin/tests/' + currentTestId + '/questions', { method: 'POST', headers: aHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) {
      showAlert('Ошибка сохранения вопроса', 'error');
      return;
    }
    showAlert('Вопрос успешно добавлен!', 'success');
    renderQuestions(currentTestId);
  }

  function renderCard(q){
    const isText = (q.type === 'text');
    const card = document.createElement('div');
    card.className = 'card p-3';
    card.draggable = true;
    card.dataset.qid = q.id;
    card.innerHTML = `
      <div class="d-flex align-items-center" style="gap:8px; flex-wrap:wrap;">
        <span class="drag-handle" title="Перетащить" style="cursor:grab">≡</span>
        <span class="q-ord-pill">#${q.ordinal}</span>
        <select class="admin-input q-type" style="width:220px; font-weight:600;">
          <option value="mcq" ${!isText ? 'selected' : ''}>🔘 Закрытый (с вариантами)</option>
          <option value="text" ${isText ? 'selected' : ''}>✍️ Открытый (текстовый ответ)</option>
        </select>
        <div style="display:flex; align-items:center; gap:6px;">
          <label style="font-size:12.5px; font-weight:600; color:#64748b; margin:0;">Баллы:</label>
          <input class="admin-input q-points" type="number" min="1" max="100" value="${q.points||1}" style="width:68px; padding:5px 8px;"/>
        </div>
        <div style="margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <button class="admin-button success q-save-card" style="padding:6px 14px; font-size:12.5px; font-weight:600;">💾 Сохранить</button>
          <button class="admin-button secondary q-dup" style="padding:6px 12px; font-size:12.5px;">📋 Дублировать</button>
          <button class="admin-button danger q-del" style="padding:6px 12px; font-size:12.5px;">🗑️ Удалить</button>
        </div>
      </div>
      <div class="mt-2">
        <textarea class="admin-input q-text" rows="6" style="min-height: 150px; resize: vertical; white-space: pre-wrap;" placeholder="Введите текст вопроса...">${esc(q.text||'')}</textarea>
      </div>
      <div class="q-image-mount mt-2"></div>
      <input type="hidden" class="q-attachment" value="${esc(q.attachment_url||'')}"/>
      <div class="q-options mt-2" ${!isText ? '' : 'style="display:none"'}>
        <div class="opts"></div>
        <div class="d-flex align-items-center mt-2" style="gap:6px">
          <button class="admin-button secondary add-opt" style="padding:6px 12px; font-size:12.5px;">➕ Добавить вариант</button>
          <span class="small-muted">Отметьте кружком правильный вариант ответа</span>
        </div>
      </div>
      <div class="q-answer-text mt-2" ${isText ? '' : 'style="display:none"'}>
        <label style="font-size:13px; font-weight:600; color:#1e293b;">Эталонный правильный ответ (текст)
          <input class="admin-input q-correct-text" placeholder="Введите правильный ответ (или несколько через |)..." value="${isText ? esc(q.correct||'') : ''}"/>
        </label>
        <div class="small-muted" style="margin-top:4px;">Ответ команды будет сопоставляться без учета регистра и пробелов. Можно указать альтернативы через знак «|» (например: 42 | сорок два).</div>
      </div>
    `;

    // Mount Image Widget
    const mount = card.querySelector('.q-image-mount');
    const hiddenInput = card.querySelector('.q-attachment');
    const imgWidget = buildImageWidget(q.attachment_url || '', async (newUrl) => {
      hiddenInput.value = newUrl;
      // Immediately sync image to database if editing existing question
      if (q && q.id) {
        try {
          const r = await adminFetch('/api/admin/questions/' + q.id, {
            method: 'PUT',
            body: JSON.stringify({ attachment_url: newUrl || null })
          });
          if (r.ok) {
            q.attachment_url = newUrl || null;
            if (!newUrl) {
              showAlert('Изображение удалено из вопроса', 'info');
            }
          }
        } catch (e) {
          console.warn('Auto-save image error:', e);
        }
      }
    });
    mount.appendChild(imgWidget);

    // Also support pasting directly into the card
    card.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && (item.type.startsWith('image/') || item.type === '')) {
          const file = item.getAsFile();
          if (file && typeof imgWidget.uploadFile === 'function') {
            e.preventDefault();
            await imgWidget.uploadFile(file);
            break;
          }
        }
      }
    });

    const optsWrap = card.querySelector('.opts');
    const groupName = 'g'+Math.random().toString(36).slice(2);
    if(Array.isArray(q.options)){
      const corrIdx = /^[0-9]+$/.test(String(q.correct||'')) ? parseInt(q.correct,10) : -1;
      q.options.forEach((o,idx)=> optsWrap.appendChild(createOptionRow(o, groupName, idx===corrIdx)));
      if(q.options.length===0){ optsWrap.appendChild(createOptionRow('', groupName, false)); }
    }
    const typeSel = card.querySelector('.q-type');
    const optBlock = card.querySelector('.q-options');
    const textBlock = card.querySelector('.q-answer-text');
    typeSel.onchange = ()=>{
      const isNowText = typeSel.value==='text';
      optBlock.style.display = isNowText ? 'none' : '';
      textBlock.style.display = isNowText ? '' : 'none';
    };
    card.querySelector('.add-opt').onclick = (e)=>{ e.preventDefault(); optsWrap.appendChild(createOptionRow('', groupName, false)); };
    
    // Save single card directly
    const saveCardBtn = card.querySelector('.q-save-card');
    if (saveCardBtn) {
      saveCardBtn.onclick = async () => {
        saveCardBtn.disabled = true;
        saveCardBtn.textContent = '💾 Сохраняем...';
        const type = (typeSel.value === 'text') ? 'text' : 'mcq';
        const text = card.querySelector('.q-text').value.replace(/\r\n/g, '\n').trim();
        const points = parseInt(card.querySelector('.q-points').value || '1', 10) || 1;
        const attachment = (card.querySelector('.q-attachment')?.value || '').trim();
        let options = null;
        let correct = '';
        if (type === 'mcq') {
          const res = collectOptionsFrom(optsWrap);
          options = res.options;
          correct = res.correct;
        } else {
          correct = (card.querySelector('.q-correct-text').value || '').trim();
          options = null;
        }
        const payload = { text, options, correct, points, type, attachment_url: attachment || null };
        try {
          const r = await adminFetch('/api/admin/questions/' + q.id, {
            method: 'PUT',
            headers: aHeaders(),
            body: JSON.stringify(payload)
          });
          if (r.ok) {
            q.text = text;
            q.options = options;
            q.correct = correct;
            q.points = points;
            q.type = type;
            q.attachment_url = attachment || null;
            showAlert(`Вопрос #${q.ordinal} успешно сохранен!`, 'success');
          } else {
            showAlert('Ошибка при сохранении вопроса', 'error');
          }
        } catch (e) {
          showAlert('Ошибка: ' + e.message, 'error');
        } finally {
          saveCardBtn.disabled = false;
          saveCardBtn.textContent = '💾 Сохранить';
        }
      };
    }

    card.querySelector('.q-del').onclick = async ()=>{
      if(!confirm('Удалить этот вопрос?')) return;
      const r=await adminFetch('/api/admin/questions/'+q.id,{ method:'DELETE', headers:aHeaders() });
      if(!r.ok){ showAlert('Ошибка удаления', 'error'); return; }
      showAlert('Вопрос удален', 'success');
      renderQuestions(currentTestId);
    };
    card.querySelector('.q-dup').onclick = async ()=>{
      const type = (typeSel.value === 'text') ? 'text' : 'mcq';
      const text = card.querySelector('.q-text').value.replace(/\r\n/g, '\n').trim();
      const points = parseInt(card.querySelector('.q-points').value||'1',10)||1;
      const attachment = (card.querySelector('.q-attachment')?.value || '').trim();
      let options = null; let correct = '';
      if(type==='mcq'){
        const res = collectOptionsFrom(optsWrap);
        options = res.options;
        correct = res.correct;
      } else {
        correct = (card.querySelector('.q-correct-text').value||'').trim();
        options = null;
      }
      const payload = { ordinal: qs.length+1, text, options, correct, points, type, attachment_url: attachment || null };
      const r = await adminFetch('/api/admin/tests/'+currentTestId+'/questions',{ method:'POST', headers:aHeaders(), body: JSON.stringify(payload) });
      if(!r.ok){ showAlert('Ошибка дублирования', 'error'); return; }
      showAlert('Вопрос сдублирован', 'success');
      renderQuestions(currentTestId);
    };

    // Drag & drop reorder
    card.addEventListener('dragstart', (e)=>{ card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', async ()=>{
      card.classList.remove('dragging');
      const items = Array.from(qList.children);
      for (let i=0;i<items.length;i++){
        const id = items[i].dataset.qid;
        const newOrd = i+1;
        const qq = qs.find(x=> String(x.id)===String(id));
        if(qq && qq.ordinal !== newOrd){
          try{ await adminFetch('/api/admin/questions/'+id,{ method:'PUT', headers:aHeaders(), body: JSON.stringify({ ordinal:newOrd, text: qq.text, options: qq.options, correct: qq.correct, points: qq.points, type: qq.type, attachment_url: qq.attachment_url }) }); }catch{}
        }
      }
      renderQuestions(currentTestId);
    });
    qList.addEventListener('dragover', (e)=>{
      e.preventDefault();
      const dragging = qList.querySelector('.dragging');
      const siblings = Array.from(qList.querySelectorAll('.card:not(.dragging)'));
      const nextSibling = siblings.find(sib=> e.clientY <= sib.getBoundingClientRect().top + sib.offsetHeight/2);
      qList.insertBefore(dragging, nextSibling||null);
    });

    return card;
  }

  function renderBlankCard(){
    const card = document.createElement('div');
    card.className = 'card p-3';
    card.style.border = '2px dashed #3b82f6';
    card.style.background = '#f8fafc';
    card.innerHTML = `
      <div class="d-flex align-items-center" style="gap:8px; flex-wrap:wrap;">
        <span class="q-ord-pill" style="background:#dbeafe; color:#1d4ed8;">Новый вопрос</span>
        <select class="admin-input q-type" style="width:220px; font-weight:600;">
          <option value="mcq" selected>🔘 Закрытый (с вариантами)</option>
          <option value="text">✍️ Открытый (текстовый ответ)</option>
        </select>
        <div style="display:flex; align-items:center; gap:6px;">
          <label style="font-size:12.5px; font-weight:600; color:#64748b; margin:0;">Баллы:</label>
          <input class="admin-input q-points" type="number" min="1" max="100" value="1" style="width:68px; padding:5px 8px;"/>
        </div>
      </div>
      <div class="mt-2">
        <textarea class="admin-input q-text" rows="6" style="min-height: 150px; resize: vertical; white-space: pre-wrap;" placeholder="Введите текст нового вопроса..."></textarea>
      </div>
      <div class="q-image-mount mt-2"></div>
      <input type="hidden" class="q-attachment" value=""/>
      <div class="q-options mt-2">
        <div class="opts"></div>
        <div class="d-flex align-items-center mt-2" style="gap:6px">
          <button class="admin-button secondary add-opt" style="padding:6px 12px; font-size:12.5px;">➕ Добавить вариант</button>
          <span class="small-muted">Отметьте кружком правильный вариант ответа</span>
        </div>
      </div>
      <div class="q-answer-text mt-2" style="display:none">
        <label style="font-size:13px; font-weight:600; color:#1e293b;">Эталонный правильный ответ (текст)
          <input class="admin-input q-correct-text" placeholder="Введите правильный ответ (или несколько через |)..."/>
        </label>
        <div class="small-muted" style="margin-top:4px;">Ответ команды будет сопоставляться без учета регистра и пробелов. Можно указать альтернативы через знак «|» (например: 42 | сорок два).</div>
      </div>
      <div class="mt-3 d-flex" style="gap:8px">
        <button class="admin-button success q-create" style="padding:8px 18px; font-weight:600;">➕ Сохранить вопрос</button>
        <button class="admin-button secondary q-cancel" style="padding:8px 16px;">Отмена</button>
      </div>
    `;

    // Mount Image Widget
    const mount = card.querySelector('.q-image-mount');
    const hiddenInput = card.querySelector('.q-attachment');
    const imgWidget = buildImageWidget('', (newUrl) => {
      hiddenInput.value = newUrl;
    });
    mount.appendChild(imgWidget);

    card.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && (item.type.startsWith('image/') || item.type === '')) {
          const file = item.getAsFile();
          if (file && typeof imgWidget.uploadFile === 'function') {
            e.preventDefault();
            await imgWidget.uploadFile(file);
            break;
          }
        }
      }
    });

    const typeSel = card.querySelector('.q-type');
    const optBlock = card.querySelector('.q-options');
    const textBlock = card.querySelector('.q-answer-text');
    typeSel.onchange = ()=>{
      const isText = typeSel.value==='text';
      optBlock.style.display = isText ? 'none' : '';
      textBlock.style.display = isText ? '' : 'none';
    };
    const optsWrap = card.querySelector('.opts');
    const groupName = 'g'+Math.random().toString(36).slice(2);
    const addOptBtn = card.querySelector('.add-opt');
    addOptBtn.onclick = (e)=>{ e.preventDefault(); optsWrap.appendChild(createOptionRow('', groupName, false)); };
    optsWrap.appendChild(createOptionRow('', groupName, true));
    optsWrap.appendChild(createOptionRow('', groupName, false));

    card.querySelector('.q-create').onclick = ()=> saveNewQuestion(card);
    card.querySelector('.q-cancel').onclick = ()=> card.remove();
    return card;
  }

  // Render list
  qs.sort((a,b)=> a.ordinal-b.ordinal).forEach(q=> qList.appendChild(renderCard(q)));

  const addBlankHandler = ()=>{
    const blank = renderBlankCard();
    qList.appendChild(blank);
    blank.scrollIntoView({ behavior:'smooth', block:'center' });
  };
  document.getElementById('addBlank').onclick = addBlankHandler;
  const bottomAddBtn = document.getElementById('addBlankBottom');
  if (bottomAddBtn) bottomAddBtn.onclick = addBlankHandler;
}
function editQuestion(id, qs, cs){
  const q = qs.find(x=> x.id==id);
  if (!q) { showAlert('Вопрос не найден', 'error'); return; }
  content.innerHTML = `
    <div class="admin-form">
      <h3>✏️ Редактировать вопрос #${q.id}</h3>
      <div class="form-row">
        <label style="max-width:120px;"># Порядковый номер<input id="q_ord" class="admin-input" type="number" value="${q.ordinal}"/></label>
        <label style="max-width:120px;">Баллы<input id="q_points" class="admin-input" type="number" value="${q.points||1}"/></label>
        <label>Тип вопроса
          <select id="q_type" class="admin-input">
            <option value="mcq" ${q.type==='text'?'':'selected'}>Закрытый (с вариантами)</option>
            <option value="text" ${q.type==='text'?'selected':''}>Открытый (текстовый)</option>
          </select>
        </label>
      </div>
      <div class="form-row">
        <label style="width:100%;">Текст вопроса
          <textarea id="q_text" class="admin-input" rows="5" style="min-height: 120px; resize: vertical;" placeholder="Введите текст вопроса...">${esc(q.text||'')}</textarea>
        </label>
      </div>
      <div id="q_edit_img_mount" style="margin-bottom:16px;"></div>
      <input type="hidden" id="q_attachment" value="${esc(q.attachment_url||'')}"/>
      <div class="form-row" id="q_opts_row" ${q.type==='text'?'style="display:none"':''}>
        <label>Варианты ответов (через | )<input id="q_opts" class="admin-input" value="${esc(Array.isArray(q.options)?q.options.join(' | '):(q.options||''))}" placeholder="Вариант 1 | Вариант 2 | Вариант 3"/></label>
        <label style="max-width:220px;">Индекс правильного (0, 1...)<input id="q_correct" class="admin-input" value="${esc(q.correct||'')}"/></label>
      </div>
      <div class="form-row" id="q_text_answer_row" ${q.type==='text'?'':'style="display:none"'}>
        <label>Правильный ответ (текст)<input id="q_correct_text" class="admin-input" value="${esc(q.correct||'')}"/></label>
      </div>
      <div style="margin-top:16px; display:flex; gap:8px;">
        <button class="admin-button success" id="save" style="padding:9px 20px;">💾 Сохранить</button>
        <button class="admin-button secondary" id="back" style="padding:9px 16px;">⬅️ Назад</button>
      </div>
    </div>
  `;

  const mount = document.getElementById('q_edit_img_mount');
  const hiddenInput = document.getElementById('q_attachment');
  const imgWidget = buildImageWidget(q.attachment_url || '', (newUrl) => {
    hiddenInput.value = newUrl;
  });
  mount.appendChild(imgWidget);

  const typeSel = document.getElementById('q_type');
  typeSel.onchange = ()=>{
    document.getElementById('q_opts_row').style.display = typeSel.value==='mcq'?'':'none';
    document.getElementById('q_text_answer_row').style.display = typeSel.value==='text'?'':'none';
  };
  document.getElementById('back').onclick = ()=> renderQuestions(currentTestId);
  document.getElementById('save').onclick = async ()=>{
    const payload = {
      ordinal: num('q_ord'),
      text: document.getElementById('q_text').value.trim(),
      type: document.getElementById('q_type').value,
      attachment_url: document.getElementById('q_attachment').value.trim() || null,
      points: num('q_points')
    };
    if(payload.type === 'mcq'){
      payload.options = val('q_opts') ? val('q_opts').split('|').map(s=>s.trim()).filter(Boolean) : null;
      payload.correct = val('q_correct');
    } else {
      payload.options = null;
      payload.correct = document.getElementById('q_correct_text')?.value || '';
    }
    const r = await adminFetch('/api/admin/questions/'+id,{ method:'PUT', headers:aHeaders(), body: JSON.stringify(payload) });
    if(!r.ok){ showAlert('Ошибка сохранения вопроса', 'error'); return; }
    showAlert('Вопрос сохранен!', 'success');
    renderQuestions(currentTestId);
  };
}

// Teams Tab
async function renderTeams(){
  setActiveTab(document.getElementById('tabTeams'));
  showLoading('Загрузка команд...');
  const r = await adminFetch('/api/admin/teams',{ headers: aHeaders() });
  if(!r.ok){ showAlert('Нет доступа', 'error'); return; }
  const rows = await r.json();

  function renderTable(filterText = '') {
    const term = filterText.toLowerCase().trim();
    const filtered = term ? rows.filter(t => 
      (t.team_name||'').toLowerCase().includes(term) ||
      (t.team_email||t.email||'').toLowerCase().includes(term) ||
      (t.members_str||'').toLowerCase().includes(term) ||
      (t.phone||'').toLowerCase().includes(term) ||
      (t.category_name||'').toLowerCase().includes(term) ||
      (t.branch||t.school||'').toLowerCase().includes(term) ||
      String(t.id).includes(term)
    ) : rows;

    const tbody = document.getElementById('teamsTbody');
    if (!tbody) return;
    if (filtered.length > 0) {
      tbody.innerHTML = filtered.map(t => {
        const branchVal = esc(t.branch || t.school || 'Талас');
        const emailVal = esc(t.team_email || t.email || '');
        const membersDisplay = esc(t.members_str || (Array.isArray(t.members) ? t.members.map(m=>m.name).filter(Boolean).join(', ') : '') || '—');
        const phoneVal = esc(t.phone || '—');
        return `
          <tr>
            <td><span style="font-weight:600; color:#64748b;">#${t.id}</span></td>
            <td><strong style="color:#0f172a;">${esc(t.team_name||'')}</strong></td>
            <td><span style="font-size:13px; color:#1e293b;" title="${membersDisplay}">${membersDisplay}</span></td>
            <td><span style="color:#0284c7; font-weight:500;">${emailVal}</span></td>
            <td><span class="status-badge status-published">${esc(t.category_name||'Основная')}</span></td>
            <td><span style="background:#f1f5f9; padding:3px 8px; border-radius:6px; font-size:12.5px; font-weight:600; color:#334155;">${branchVal}</span></td>
            <td style="color:#64748b; font-size:12.5px;">${esc(t.created_at||'')}</td>
            <td>
              <div class="admin-table-actions">
                <button class="admin-button danger delete-team-btn" data-id="${t.id}" data-name="${esc(t.team_name||'Команда')}">
                  🗑️ Удалить
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Wire delete buttons
      tbody.querySelectorAll('.delete-team-btn').forEach(btn => {
        btn.onclick = () => {
          const tId = btn.dataset.id;
          const tName = btn.dataset.name;
          showAdminConfirm('Удаление команды', `Удалить команду <strong>«${esc(tName)}»</strong> (#${tId})?`, 'Все результаты тестирования и сессии этой команды также будут удалены.', async () => {
            const delRes = await adminFetch(`/api/admin/teams/${tId}`, { method: 'DELETE', headers: aHeaders() });
            if (!delRes.ok) {
              const err = await delRes.json().catch(() => ({}));
              showAlert(err.error || 'Ошибка при удалении команды', 'error');
              return;
            }
            showAlert(`Команда «${tName}» успешно удалена`, 'success');
            renderTeams();
          });
        };
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b;">Команды не найдены${term ? ` по запросу «${esc(term)}»` : ''}</td></tr>`;
    }
  }

  content.innerHTML = `
    <div class="admin-form">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div>
          <h3 style="margin:0 0 4px 0;">👥 Зарегистрированные команды (${rows.length})</h3>
          <div class="small-muted">Список всех зарегистрированных участников турнира (участники и контактные данные)</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <input type="file" id="importTeamsInput" accept=".csv" style="display:none;"/>
          <button id="importTeamsBtn" class="admin-button" style="padding:8px 16px;">📥 Импорт CSV</button>
          <button id="exportTeams" class="admin-button success" style="padding:8px 16px;">📤 Экспорт CSV</button>
          <button id="wipeTeams" class="admin-button danger" style="padding:8px 16px;">🗑️ Очистить команды</button>
        </div>
      </div>
      <div style="margin-top:12px;">
        <input id="teamsSearchInput" class="admin-input" placeholder="🔍 Поиск команды по названию, участникам, филиалу, категории или email..." style="max-width:480px;"/>
      </div>
    </div>
    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:60px;">ID</th>
            <th>Название команды</th>
            <th>Участники</th>
            <th>Email команды</th>
            <th>Категория</th>
            <th>Филиал</th>
            <th>Дата регистрации</th>
            <th style="width:100px;">Действия</th>
          </tr>
        </thead>
        <tbody id="teamsTbody">
        </tbody>
      </table>
    </div>
  `;

  renderTable();

  const searchInput = document.getElementById('teamsSearchInput');
  if (searchInput) {
    searchInput.oninput = (e) => renderTable(e.target.value);
  }

  // Import Teams CSV
  const importTeamsInput = document.getElementById('importTeamsInput');
  const importTeamsBtn = document.getElementById('importTeamsBtn');
  if (importTeamsBtn && importTeamsInput) {
    importTeamsBtn.onclick = () => importTeamsInput.click();
    importTeamsInput.onchange = async () => {
      const file = importTeamsInput.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      showLoading('Импорт команд из CSV...');
      try {
        const res = await adminFetch('/api/admin/teams/import-csv', { method: 'POST', body: form });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          showAlert(j.error || 'Ошибка при импорте команд', 'error');
          return;
        }
        showAlert(`Успешно импортировано команд: ${j.imported || 0}`, 'success');
        renderTeams();
      } catch (err) {
        showAlert('Ошибка импорта: ' + err.message, 'error');
      } finally {
        importTeamsInput.value = '';
      }
    };
  }

  document.getElementById('exportTeams').onclick = async ()=>{
    try{
      const res = await adminFetch('/api/admin/teams/export-csv', { headers: aHeaders() });
      if(!res.ok){ showAlert('Ошибка экспорта', 'error'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'teams_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showAlert('Экспорт завершен!', 'success');
    }catch(e){
      showAlert('Ошибка экспорта: ' + e.message, 'error');
    }
  };
  document.getElementById('wipeTeams').onclick = ()=>{
    showAdminConfirm(
      'Очистка всех команд',
      'Удалить <strong>ВСЕ</strong> команды и результаты тестирования?',
      'Это действие необратимо. Все зарегистрированные команды, их данные и баллы будут полностью очищены.',
      async () => {
        const res = await adminFetch('/api/admin/reset-teams', { method: 'POST', headers: aHeaders() });
        if(!res.ok){
          const err = await res.json().catch(() => ({}));
          showAlert(err.error || 'Ошибка очистки', 'error');
          return;
        }
        showAlert('Все команды и результаты удалены', 'success');
        renderTeams();
      }
    );
  };
}

// Results Tab
async function renderResults(){
  setActiveTab(document.getElementById('tabResults'));
  showLoading('Загрузка результатов...');
  const [rRes, teamsRes] = await Promise.all([
    adminFetch('/api/admin/results',{ headers: aHeaders() }),
    adminFetch('/api/admin/teams',{ headers: aHeaders() })
  ]);
  if(!rRes.ok){ showAlert('Нет доступа', 'error'); return; }
  const rows = await rRes.json();
  const teams = teamsRes.ok ? await teamsRes.json() : [];

  // Group results by team for export buttons
  const teamResults = {};
  rows.forEach(r => {
    if (!teamResults[r.team_name]) teamResults[r.team_name] = r.team_id || (teams.find(t => t.team_name === r.team_name)?.id);
  });

  function renderResultsTable(filterText = '') {
    const term = filterText.toLowerCase().trim();
    const filtered = term ? rows.filter(x =>
      (x.team_name||'').toLowerCase().includes(term) ||
      (x.category_name||'').toLowerCase().includes(term) ||
      String(x.score_display||'').includes(term) ||
      String(x.id).includes(term)
    ) : rows;

    const tbody = document.getElementById('resultsTbody');
    if (!tbody) return;
    if (filtered.length > 0) {
      tbody.innerHTML = filtered.map(x => {
        const timeSec = x.time_taken_sec ? `${Math.floor(x.time_taken_sec/60)} мин ${x.time_taken_sec%60} сек` : '-';
        return `
          <tr>
            <td><span style="font-weight:600; color:#64748b;">#${x.id}</span></td>
            <td><strong style="color:#0f172a;">${esc(x.team_name||'')}</strong></td>
            <td><span style="display:inline-block; padding:3px 10px; border-radius:999px; background:#eff6ff; color:#1e40af; font-weight:700;">${x.score_display || '0'}</span></td>
            <td style="color:#64748b; font-size:13px;">${esc(x.taken_at_formatted||'')}</td>
            <td style="color:#475569;">${timeSec}</td>
            <td><span class="status-badge status-published">${esc(x.category_name||'')}</span></td>
            <td>
              <div class="admin-table-actions">
                <button class="admin-button danger delete-res-btn" data-id="${x.id}" data-team="${esc(x.team_name||'')}" title="Удалить результат">
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // Wire delete buttons for results
      tbody.querySelectorAll('.delete-res-btn').forEach(btn => {
        btn.onclick = () => {
          const resId = btn.dataset.id;
          const teamName = btn.dataset.team;
          showAdminConfirm('Удаление результата', `Удалить результат #${resId} команды <strong>«${esc(teamName)}»</strong>?`, '', async () => {
            const delRes = await adminFetch(`/api/admin/results/${resId}`, { method: 'DELETE', headers: aHeaders() });
            if (!delRes.ok) {
              const err = await delRes.json().catch(() => ({}));
              showAlert(err.error || 'Ошибка удаления результата', 'error');
              return;
            }
            showAlert(`Результат #${resId} успешно удален`, 'success');
            renderResults();
          });
        };
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b;">Результаты не найдены${term ? ` по запросу «${esc(term)}»` : ''}</td></tr>`;
    }
  }

  content.innerHTML = `
    <div class="admin-form">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div>
          <h3 style="margin:0 0 4px 0;">📊 Результаты тестирования (${rows.length} записей)</h3>
          <div class="small-muted">Баллы, затраченное время и категории пройденных тестов</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="exportResults" class="admin-button success" style="padding:8px 16px;">📥 Экспорт всех CSV</button>
        </div>
      </div>
      <div style="margin-top:12px;">
        <input id="resultsSearchInput" class="admin-input" placeholder="🔍 Поиск по имени команды, баллам или категории..." style="max-width:480px;"/>
      </div>
    </div>
    <div class="admin-table-wrapper">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="width:60px;">№</th>
            <th>Имя команды</th>
            <th>Баллы</th>
            <th>Время прохождения</th>
            <th>Затрачено</th>
            <th>Категория теста</th>
            <th style="width:60px;">Удалить</th>
          </tr>
        </thead>
        <tbody id="resultsTbody">
        </tbody>
      </table>
    </div>
  `;

  renderResultsTable();

  const searchInput = document.getElementById('resultsSearchInput');
  if (searchInput) {
    searchInput.oninput = (e) => renderResultsTable(e.target.value);
  }
  document.getElementById('exportResults').onclick = async ()=>{
    try{
      const res = await adminFetch('/api/admin/results/export-csv', { headers: aHeaders() });
      if(!res.ok){ showAlert('Ошибка экспорта', 'error'); return; }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'results_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showAlert('Экспорт завершен!', 'success');
    }catch(e){
      showAlert('Ошибка экспорта: ' + e.message, 'error');
    }
  };
}

// Storage and Backup
async function updateStorageBadge() {
  try {
    const res = await adminFetch('/api/admin/storage/status');
    if (res.ok) {
      const data = await res.json();
      const txt = document.getElementById('storageStatusText');
      if (txt && data.counts) {
        txt.textContent = `База данных синхронизирована (💾 PostgreSQL Cloud Database: ${data.counts.teams} команд, ${data.counts.categories} категорий, ${data.counts.tests} тестов)`;
      }
    }
  } catch {}
}

async function renderBackup() {
  setActiveTab(document.getElementById('tabBackup'));
  showLoading('Загрузка информации о хранилище...');
  try {
    const res = await adminFetch('/api/admin/storage/status');
    const status = res.ok ? await res.json() : { counts: { teams: 0, categories: 0, tests: 0, results: 0 }, store_file: 'PostgreSQL Cloud Database' };

    content.innerHTML = `
      <div class="admin-form">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin-bottom: 4px;">💾 Хранение данных и резервное копирование</h3>
            <p class="small-muted" style="margin: 0; font-size: 13.5px; color: #64748b;">
              Все изменения, зарегистрированные команды, категории и тесты сохраняются немедленно после каждого действия.
            </p>
          </div>
          <button class="admin-button success" id="btnDownloadBackup" style="padding: 10px 20px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
            📥 Скачать резервную копию (JSON)
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">База данных</div>
            <div style="font-size: 15px; font-weight: 600; color: #0f172a; word-break: break-all;">☁️ ${status.store_file || 'Cloud SQL PostgreSQL Database'}</div>
            <div style="font-size: 12px; color: #16a34a; margin-top: 4px; font-weight: 500;">✓ Облачное хранилище активно</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Зарегистрировано команд</div>
            <div style="font-size: 24px; font-weight: 700; color: #2563eb;">👥 ${status.counts?.teams || 0}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Хранятся в Cloud SQL</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
            <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">Категории и тесты</div>
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">📂 ${status.counts?.categories || 0} / 📝 ${status.counts?.tests || 0}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Облачная синхронизация</div>
          </div>
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h4 style="margin: 0 0 8px 0; color: #1e40af; font-size: 15px; display: flex; align-items: center; gap: 8px;">
            <span>ℹ️</span> Как работает хранение информации?
          </h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 13.5px; color: #1e3a8a; line-height: 1.6;">
            <li><strong>Облачная база данных:</strong> Все операции (регистрация команд, ответы на тесты, создание категорий и настроек) выполняются непосредственно в облачной базе данных Cloud SQL (PostgreSQL).</li>
            <li><strong>Исключение наложений:</strong> Локальные файлы хранилища полностью исключены, данные хранятся централизованно в облаке.</li>
            <li><strong>Сохранность при перезапусках:</strong> Все данные персистентны и не зависят от локальной файловой системы или редеплоев приложения.</li>
          </ul>
        </div>

        <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
          <h4 style="margin-top: 0; margin-bottom: 10px;">📤 Восстановление из резервной копии</h4>
          <p class="small-muted" style="margin-bottom: 16px; font-size: 13.5px;">
            Вы можете загрузить ранее сохраненный JSON-файл бэкапа для полного восстановления состояния приложения в Cloud SQL базе данных.
          </p>
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <input type="file" id="restoreFileInput" accept=".json,application/json,text/plain" style="font-size: 13px;"/>
            <button class="admin-button secondary" id="btnRestoreBackup" style="padding: 8px 18px;">
              Восстановить данные
            </button>
          </div>
          <div style="margin-top: 12px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #334155; cursor: pointer;">
              <input type="checkbox" id="restoreOverwriteCheckbox" checked style="width: 16px; height: 16px; cursor: pointer;"/>
              <span>Полная перезапись (очистить базу перед восстановлением для исключения дубликатов и наложений)</span>
            </label>
            <div id="restoreFileInfo" style="margin-top: 8px; font-size: 13px; color: #2563eb;"></div>
          </div>
        </div>

        <!-- Danger Zone: Full System Reset / Wipe -->
        <div style="background: #fff; border: 2px solid #ef4444; border-radius: 12px; padding: 24px; margin-top: 24px; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.08);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
            <div style="flex: 1; min-width: 280px;">
              <h4 style="margin: 0 0 6px 0; color: #dc2626; font-size: 17px; display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span> Опасная зона: Полная очистка системы
              </h4>
              <p style="margin: 0; color: #64748b; font-size: 13.5px; line-height: 1.5;">
                Удаляет <strong>ВСЕ</strong> данные из базы: зарегистрированные команды, категории, тесты, вопросы и результаты тестирования. Сбрасывает счетчики нумерации (ID) к 1. Это действие необратимо и позволяет получить чистую систему для добавления своих данных с нуля.
              </p>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
              <button class="admin-button danger" id="btnDangerWipeTeams" type="button" style="padding: 10px 18px; font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
                👥 Удалить команды
              </button>
              <button class="admin-button danger" id="btnDangerWipeAll" type="button" style="padding: 10px 22px; font-weight: 700; font-size: 13.5px; background: #dc2626; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);">
                🗑️ Очистить ВСЁ (Полный сброс)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const fileInput = document.getElementById('restoreFileInput');
    const fileInfo = document.getElementById('restoreFileInfo');
    if (fileInput && fileInfo) {
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files[0]) {
          const f = fileInput.files[0];
          const sz = f.size > 1024 * 1024 ? (f.size / (1024 * 1024)).toFixed(1) + ' МБ' : (f.size / 1024).toFixed(1) + ' КБ';
          fileInfo.innerHTML = `📄 Выбран файл: <strong>${esc(f.name)}</strong> (${sz})`;
        } else {
          fileInfo.textContent = '';
        }
      };
    }

    document.getElementById('btnDownloadBackup').onclick = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const h = token ? { 'Authorization': `Bearer ${token}` } : {};
        const r = await fetch('/api/admin/storage/backup', { headers: h });
        if (!r.ok) throw new Error('Не удалось скачать бэкап');
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `akylman-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAlert('Резервная копия успешно скачана!', 'success');
      } catch (err) {
        showAlert('Ошибка: ' + err.message, 'error');
      }
    };

    document.getElementById('btnRestoreBackup').onclick = async () => {
      if (!fileInput.files || !fileInput.files[0]) {
        showAlert('Пожалуйста, выберите JSON-файл бэкапа', 'error');
        return;
      }
      const overwrite = document.getElementById('restoreOverwriteCheckbox')?.checked ?? true;
      const file = fileInput.files[0];

      showAdminConfirm(
        'Восстановление базы данных',
        `Вы уверены, что хотите восстановить базу данных из файла «${esc(file.name)}»?`,
        overwrite
          ? 'Текущая база данных будет очищена и заполнена данными из файла бэкапа.'
          : 'Данные из файла бэкапа будут добавлены и обновлены в текущей базе данных.',
        async () => {
          const btn = document.getElementById('btnRestoreBackup');
          if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Восстановление данных...';
          }
          showAlert('Запуск восстановления базы данных...', 'info');

          try {
            let text = '';
            if (file.text) {
              text = await file.text();
            } else {
              text = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsText(file);
              });
            }

            text = String(text || '').trim().replace(/^\uFEFF/, '');
            let parsedJson = null;
            try {
              parsedJson = JSON.parse(text);
            } catch (jsonErr) {
              showAlert('Ошибка формата файла: файл не является корректным JSON (' + jsonErr.message + ')', 'error');
              if (btn) {
                btn.disabled = false;
                btn.textContent = 'Восстановить данные';
              }
              return;
            }

            const payload = (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson))
              ? { ...parsedJson, overwrite }
              : { tables: parsedJson, overwrite };

            let r = null;
            // 1. Try Multipart upload first
            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('overwrite', String(overwrite));
              r = await adminFetch('/api/admin/storage/restore', {
                method: 'POST',
                body: formData
              });
            } catch (formErr) {
              console.warn('FormData restore attempt error, falling back to JSON:', formErr);
            }

            // 2. Fallback to JSON payload if multipart failed
            if (!r || !r.ok) {
              try {
                r = await adminFetch('/api/admin/storage/restore', {
                  method: 'POST',
                  headers: aHeaders(),
                  body: JSON.stringify(payload)
                });
              } catch (jsonFetchErr) {
                throw new Error(jsonFetchErr.message || 'Сетевая ошибка при передаче данных');
              }
            }

            if (!r.ok) {
              await showResponseError(r, 'Ошибка восстановления базы данных');
              if (btn) {
                btn.disabled = false;
                btn.textContent = 'Восстановить данные';
              }
              return;
            }

            const data = await r.json().catch(() => ({}));
            let successMsg = data.message || 'Данные успешно восстановлены в Cloud SQL!';
            if (Array.isArray(data.warnings) && data.warnings.length > 0) {
              successMsg += ` (Предупреждений: ${data.warnings.length})`;
            }
            showAlert(successMsg, 'success');
            updateStorageBadge();
            await renderBackup();
          } catch (err) {
            showAlert('Ошибка при чтении или отправке файла: ' + err.message, 'error');
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Восстановить данные';
            }
          }
        }
      );
    };

    // Danger Zone: Wipe All Data
    const btnWipeAll = document.getElementById('btnDangerWipeAll');
    if (btnWipeAll) {
      btnWipeAll.onclick = () => {
        showAdminConfirm(
          '⚠️ ПОЛНАЯ ОЧИСТКА ВСЕЙ СИСТЕМЫ',
          'Вы действительно хотите <strong>БЕЗВОЗВРАТНО УДАЛИТЬ ВСЕ ДАННЫЕ</strong>?<br><br>' +
          '• Будут удалены все зарегистрированные команды<br>' +
          '• Будут удалены все категории<br>' +
          '• Будут удалены все тесты и вопросы<br>' +
          '• Будут удалены все результаты и сессии<br>' +
          '• Нумерация (ID) будет сброшена с 1<br><br>' +
          '<span style="color:#dc2626; font-weight:600;">Система станет абсолютно чистой, и вы сможете добавить всё с нуля.</span>',
          'Внимание: это действие невозможно отменить!',
          async () => {
            btnWipeAll.disabled = true;
            btnWipeAll.textContent = '⏳ Очистка системы...';
            try {
              const res = await adminFetch('/api/admin/danger/wipe-all', {
                method: 'POST',
                headers: aHeaders(),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                showAlert(data.error || 'Ошибка при очистке системы', 'error');
                btnWipeAll.disabled = false;
                btnWipeAll.textContent = '🗑️ Очистить ВСЁ (Полный сброс)';
                return;
              }
              showAlert(data.message || 'Вся система успешно очищена! База данных пуста.', 'success');
              updateStorageBadge();
              await renderBackup();
            } catch (err) {
              showAlert('Ошибка запроса: ' + err.message, 'error');
              btnWipeAll.disabled = false;
              btnWipeAll.textContent = '🗑️ Очистить ВСЁ (Полный сброс)';
            }
          }
        );
      };
    }

    // Danger Zone: Wipe Teams Only
    const btnWipeTeams = document.getElementById('btnDangerWipeTeams');
    if (btnWipeTeams) {
      btnWipeTeams.onclick = () => {
        showAdminConfirm(
          'Очистка команд и результатов',
          'Удалить <strong>все зарегистрированные команды</strong> и результаты тестирования?',
          'Категории и тесты останутся нетронутыми. Команды будут полностью очищены.',
          async () => {
            btnWipeTeams.disabled = true;
            try {
              const res = await adminFetch('/api/admin/reset-teams', {
                method: 'POST',
                headers: aHeaders(),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                showAlert(data.error || 'Ошибка при очистке команд', 'error');
                btnWipeTeams.disabled = false;
                return;
              }
              showAlert(data.message || 'Все команды и результаты успешно удалены!', 'success');
              updateStorageBadge();
              await renderBackup();
            } catch (err) {
              showAlert('Ошибка запроса: ' + err.message, 'error');
              btnWipeTeams.disabled = false;
            }
          }
        );
      };
    }
  } catch (e) {
    showAlert('Ошибка: ' + e.message, 'error');
  }
}

// Homepage Live Interactive Replica & Editor Tab
async function renderHomepageBlocks() {
  const bTab = document.getElementById('tabHomepage');
  if (bTab) setActiveTab(bTab);
  showLoading('Загрузка интерактивной копии главной страницы...');

  try {
    const [blocksRes, catsRes, settingsRes] = await Promise.all([
      adminFetch('/api/admin/homepage-blocks'),
      adminFetch('/api/admin/categories'),
      fetch('/api/settings')
    ]);

    if (!blocksRes.ok) {
      await showResponseError(blocksRes, 'Ошибка загрузки карточек');
      content.innerHTML = `
        <div class="admin-card" style="padding:32px 24px; text-align:center; max-width:620px; margin:40px auto; background:#fffdf9; border:1px solid #b8b0a0; border-radius:14px; box-shadow:0 4px 16px rgba(29,27,24,0.06);">
          <div style="font-size:42px; margin-bottom:12px;">⚠️</div>
          <h3 style="margin:0 0 10px 0; font-size:19px; font-weight:700; color:#1d1b18; font-family:'Spectral',Georgia,serif;">Не удалось загрузить карточки главной страницы</h3>
          <p style="color:#64748b; font-size:14px; line-height:1.6; margin:0 0 24px 0;">Произошла ошибка при обращении к Cloud SQL. Нажмите «Повторить попытку» или «Инициализировать стандартные карточки» для автоматического создания структуры таблицы.</p>
          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="admin-button" id="btnRetryHomepageLoad" style="padding:9px 20px; font-weight:700;">🔄 Повторить попытку</button>
            <button type="button" class="admin-button secondary" id="btnInitDefaultsDirect" style="padding:9px 18px;">⚡ Инициализировать стандартные</button>
          </div>
        </div>
      `;
      const btnRetry = document.getElementById('btnRetryHomepageLoad');
      if (btnRetry) btnRetry.onclick = () => renderHomepageBlocks();
      const btnInit = document.getElementById('btnInitDefaultsDirect');
      if (btnInit) {
        btnInit.onclick = async () => {
          showLoading('Инициализация карточек...');
          const r = await adminFetch('/api/admin/homepage-blocks/reset-defaults', { method: 'POST' });
          if (r.ok) {
            showAlert('Карточки успешно созданы в Cloud SQL!', 'success');
            renderHomepageBlocks();
          } else {
            await showResponseError(r, 'Ошибка создания карточек');
          }
        };
      }
      return;
    }

  const blocks = await blocksRes.json();
  const cats = catsRes.ok ? await catsRes.json() : [];
  const siteSettings = settingsRes.ok ? await settingsRes.json() : {};

  const blockMap = {};
  (blocks || []).forEach(b => {
    blockMap[b.block_key] = b;
  });

  // Current view language in the replica (EN / KY)
  let currentLang = 'en';

  const blockMeta = {
    hero_subtitle: {
      name: 'Первый блок (Подзаголовок Hero)',
      section: 'Главный экран',
      icon: '🏛️',
      defaultBadgeEn: '',
      defaultBadgeKy: '',
      defaultBadgeRu: '',
      defaultTitleEn: '',
      defaultTitleKy: '',
      defaultTitleRu: '',
      defaultContentEn: 'For middle and high school students',
      defaultContentKy: 'Орто жана жогорку класстын окуучулары үчүн',
      defaultContentRu: 'Для учеников средней и старшей школы',
    },
    stage_1: {
      name: 'Этап 1: Предварительный раунд',
      section: 'О соревновании',
      icon: '📝',
      defaultBadgeEn: 'Round 1',
      defaultBadgeKy: 'Раунд 1',
      defaultBadgeRu: 'Раунд 1',
      defaultTitleEn: 'Preliminary Round',
      defaultTitleKy: 'Алгачкы раунд',
      defaultTitleRu: 'Предварительный раунд',
      defaultContentEn: 'Online test: multiple choice and short answer questions',
      defaultContentKy: 'Онлайн-тест: бир нече тандоо жана кыска жооп',
      defaultContentRu: 'Онлайн-тест: множественный выбор и короткий ответ',
    },
    stage_2: {
      name: 'Этап 2: Полуфинал',
      section: 'О соревновании',
      icon: '🎯',
      defaultBadgeEn: 'Round 2',
      defaultBadgeKy: 'Раунд 2',
      defaultBadgeRu: 'Раунд 2',
      defaultTitleEn: 'Semifinal',
      defaultTitleKy: 'Жарым финал',
      defaultTitleRu: 'Полуфинал',
      defaultContentEn: 'Live blitz questions in real time',
      defaultContentKy: 'Реалдуу убакыт режиминде түз блиц-суроолор',
      defaultContentRu: 'Живые блиц-вопросы в режиме реального времени',
    },
    stage_3: {
      name: 'Этап 3: Гранд-Финал',
      section: 'О соревновании',
      icon: '🏆',
      defaultBadgeEn: 'Grand Final',
      defaultBadgeKy: 'Гранд-Финал',
      defaultBadgeRu: 'Гранд-Финал',
      defaultTitleEn: 'Final',
      defaultTitleKy: 'Финал',
      defaultTitleRu: 'Финал',
      defaultContentEn: 'Final concluding round with top qualifying teams',
      defaultContentKy: 'Эң мыкты командалар менен финалдык раунд',
      defaultContentRu: 'Финальный раунд с лучшими командами',
    },
    team_composition: {
      name: 'Карточка 01: Состав команды',
      section: 'Как это работает',
      icon: '01',
      defaultBadgeEn: '01',
      defaultBadgeKy: '01',
      defaultBadgeRu: '01',
      defaultTitleEn: 'Team Composition',
      defaultTitleKy: 'Команданын курамы',
      defaultTitleRu: 'О составе команды',
      defaultContentEn: '2–4 members from the same school',
      defaultContentKy: 'Бир мектептен 2–4 адам',
      defaultContentRu: '2–4 человека из одной школы',
    },
    categories_info: {
      name: 'Карточка 02: Категории турнира',
      section: 'Как это работает',
      icon: '02',
      defaultBadgeEn: '02',
      defaultBadgeKy: '02',
      defaultBadgeRu: '02',
      defaultTitleEn: 'Categories',
      defaultTitleKy: 'Категориялар',
      defaultTitleRu: 'Категории',
      defaultContentEn: 'Olympiad disciplines across subjects and tracks',
      defaultContentKy: 'Предметтер жана багыттар боюнча олимпиадалык сабактар',
      defaultContentRu: 'Дисциплины олимпиады по предметам и направлениям',
    },
    format_info: {
      name: 'Карточка 03: Формат соревнований',
      section: 'Как это работает',
      icon: '03',
      defaultBadgeEn: '03',
      defaultBadgeKy: '03',
      defaultBadgeRu: '03',
      defaultTitleEn: 'Tournament Format',
      defaultTitleKy: 'Форматы',
      defaultTitleRu: 'Формат',
      defaultContentEn: 'Stages 1 and 2 are held online. Stage 3 (Final) is held offline at Akylman Presidential Lyceum.',
      defaultContentKy: '1 жана 2-этаптар онлайн форматта өткөрүлөт. Үчүнчү этап оффлайн форматта өтөт.',
      defaultContentRu: 'Этапы 1 и 2 проводятся в онлайн-формате. Третий этап проводится в оффлайн-формате.',
    },
    timeline_stage1: {
      name: 'Таймлайн: Этап 1 - Отборочный тур',
      section: 'Таймлайн',
      icon: '🌐',
      defaultBadgeEn: '🌐 Online Round',
      defaultBadgeKy: '🌐 Онлайн-тур',
      defaultBadgeRu: '🌐 Онлайн-тур',
      defaultTitleEn: 'Stage 1 - Preliminary Round',
      defaultTitleKy: '1-этап - Тандоо туру',
      defaultTitleRu: 'Этап 1 - Отборочный тур',
      defaultContentEn: 'Teams take an online test in selected categories with multiple-choice and short-answer questions. Results determine teams advancing to the next round.',
      defaultContentKy: 'Бул этапта командалар тандалган категориялар боюнча онлайн тестирлөөдөн өтүшөт. Катышуучулар бир нече тандоо жана кыска жооптуу суроолорго жооп беришет. Бул этаптын жыйынтыгы боюнча кийинки раундга чыга турган командалар аныкталат.',
      defaultContentRu: 'На этом этапе команды проходят онлайн-тестирование по выбранным категориям. Участники отвечают на вопросы с множественным выбором и короткими ответами. По результатам этого этапа определяются команды, которые пройдут в следующий раунд.',
    },
    timeline_stage2: {
      name: 'Таймлайн: Этап 2 - Полуфинал',
      section: 'Таймлайн',
      icon: '⚡',
      defaultBadgeEn: '⚡ Semifinal • Online',
      defaultBadgeKy: '⚡ Жарым финал • Онлайн',
      defaultBadgeRu: '⚡ Полуфинал • Онлайн',
      defaultTitleEn: 'Stage 2 - Semifinal',
      defaultTitleKy: '2-этап - Жарым финал',
      defaultTitleRu: 'Этап 2 - Полуфинал',
      defaultContentEn: 'This stage highlights the best teams among successful qualifiers. Teams compete in real time with challenging blitz questions across various domains.',
      defaultContentKy: 'Бул этап ийгиликтүү командалардын арасынан эң мыктыларды аныктайт. Бул этапта татаалыраак суроолор камтылган онлайн тестирлөө өткөрүлөт. Командалар билимдин ар кандай категориялары боюнча блиц-суроолорго реалдуу убакытта жооп берип күч сынашышат.',
      defaultContentRu: 'Этап выявляет лучшие команды среди уже успешных. На этом этапе проводится онлайн-тестирование с более сложными вопросами. Команды соревнуются в режиме реального времени, отвечая на блиц-вопросы по различным категориям знаний.',
    },
    timeline_stage3: {
      name: 'Таймлайн: Этап 3 - Финал',
      section: 'Таймлайн',
      icon: '🏆',
      defaultBadgeEn: '🏆 Grand Final • Offline',
      defaultBadgeKy: '🏆 Гранд-Финал • Оффлайн',
      defaultBadgeRu: '🏆 Гранд-Финал • Оффлайн',
      defaultTitleEn: 'Stage 3 - Final',
      defaultTitleKy: '3-этап - Финал',
      defaultTitleRu: 'Этап 3 - Финал',
      defaultContentEn: 'The Final is held offline at Akylman Presidential Lyceum (Cholpon-Ata). Concluding test among top teams from semifinals determines winners by total score.',
      defaultContentKy: 'Финал «Акылман» Президенттик лицейинде (Чолпон-Ата ш.) оффлайн форматта өткөрүлөт. Жарым финалдын жыйынтыгы боюнча эң мыкты командалардын ортосунда жыйынтыктоочу тест. Жеңүүчүлөр топтолгон жалпы упайлардын саны боюнча аныкталат.',
      defaultContentRu: 'Финал проводится в оффлайн формате в Президентском лицее «Акылман» (Чолпон-Ата). Итоговый тест между лучшими командами по результатам полуфинала. Победители определяются по общему количеству набранных баллов.',
    },
    footer_desc: {
      name: 'Футер (Описание внизу страницы)',
      section: 'Футер',
      icon: '📄',
      defaultBadgeEn: '',
      defaultBadgeKy: '',
      defaultBadgeRu: '',
      defaultTitleEn: '',
      defaultTitleKy: '',
      defaultTitleRu: '',
      defaultContentEn: 'Join the intellectual tournament for school students and unlock new opportunities for your team.',
      defaultContentKy: 'Орто жана жогорку класстын окуучулары үчүн интеллектуалдык турнирге кошулуңуз жана командаңыз менен жаңы мүмкүнчүлүктөрдү ачкыла.',
      defaultContentRu: 'Присоединяйтесь к интеллектуальному турниру для школьников и откройте новые возможности для своей команды.',
    }
  };

  function getVal(key, field, lang) {
    const b = blockMap[key] || {};
    const meta = blockMeta[key] || {};
    const suffix = lang === 'ky' ? 'Ky' : 'En';
    const dbProp = `${field}_${lang}`;
    const defProp = `default${field.charAt(0).toUpperCase() + field.slice(1)}${suffix}`;
    const val = b[dbProp];
    if (val !== undefined && val !== null && val !== '') return val;
    if (lang === 'en' && b[`${field}_ru`]) return b[`${field}_ru`];
    return meta[defProp] || '';
  }

  function renderView() {
    content.innerHTML = `
      <div class="homepage-clone-workspace">
        
        <!-- Toolbar / Header of Replica -->
        <div class="homepage-clone-toolbar" style="background:#ffffff; border:1px solid #b8b0a0; border-radius:12px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; box-shadow:0 2px 8px rgba(29,27,24,0.06);">
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="display:inline-flex; align-items:center; gap:8px;">
              <span style="font-size:22px;">🏛️</span>
              <h2 style="margin:0; font-size:18px; font-weight:700; color:#1d1b18;">Визуальная копия главной страницы</h2>
            </div>
            <span class="badge-sql-live" style="background:#e5ede6; color:#3d6a4d; border:1px solid #c2d8c5; font-size:12px; font-weight:700; padding:4px 10px; border-radius:99px; display:inline-flex; align-items:center; gap:5px;">
              <span class="status-dot" style="background:#3d6a4d; width:7px; height:7px; border-radius:50%; display:inline-block;"></span>
              Синхронизация с Cloud SQL
            </span>
          </div>

          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <!-- Language preview switch -->
            <div class="lang-switch-group" style="display:inline-flex; background:#faf7f0; border:1px solid #b8b0a0; border-radius:8px; padding:3px; gap:4px;">
              <button type="button" id="btnLangEn" class="admin-button ${currentLang === 'en' ? 'active-lang' : 'secondary'}" style="padding:5px 12px; font-size:12.5px; font-weight:700; border-radius:6px; ${currentLang === 'en' ? 'background:#1d1b18; color:#fffdf9; border-color:#1d1b18;' : ''}">
                🇬🇧 English (EN)
              </button>
              <button type="button" id="btnLangKy" class="admin-button ${currentLang === 'ky' ? 'active-lang' : 'secondary'}" style="padding:5px 12px; font-size:12.5px; font-weight:700; border-radius:6px; ${currentLang === 'ky' ? 'background:#1d1b18; color:#fffdf9; border-color:#1d1b18;' : ''}">
                🇰🇬 Кыргызча (KY)
              </button>
            </div>

            <button type="button" id="btnQuickEditAll" class="admin-button" style="padding:7px 16px; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
              <span>📋</span> <span>Табличный режим</span>
            </button>

            <button type="button" id="btnResetToDefaults" class="admin-button secondary" style="padding:7px 14px; font-size:13px; color:#a3302b; border-color:#fca5a5;">
              <span>🔄</span> <span>Сброс к исходным</span>
            </button>

            <a href="/" target="_blank" class="admin-button success" style="padding:7px 16px; font-size:13px; text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-weight:700;">
              <span>↗</span> <span>Открыть реальный сайт</span>
            </a>
          </div>
        </div>

        <div class="replica-instructions" style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 16px; margin-top:12px; color:#92400e; font-size:13px; display:flex; align-items:center; gap:8px;">
          <span>💡</span>
          <span><strong>Кликайте прямо по любой карточке</strong> в интерактивном макете ниже, чтобы мгновенно отредактировать её бейдж, заголовок и описание. Все изменения немедленно сохраняются в облачную базу данных PostgreSQL и отображаются на реальной главной странице.</span>
        </div>

        <!-- REPLICA CONTAINER (Full fidelity clone of index.html) -->
        <div class="homepage-replica-canvas" style="margin-top:20px; background:#f4f1ea; border:2px dashed #b8b0a0; border-radius:16px; padding:24px 16px; overflow:hidden;">
          
          <!-- Mock Header Bar -->
          <div style="background:#fffdf9; border:1px solid #b8b0a0; border-radius:10px; padding:12px 24px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="/images/лого.png" alt="Akylman" height="34"/>
              <span style="font-family:'Spectral',Georgia,serif; font-weight:700; font-size:17px; color:#1d1b18;">Akylman Quiz Bowl</span>
            </div>
            <div style="font-size:13px; color:#857f73;">
              <span>Главная</span> &bull; <span>Регистрация</span> &bull; <span>Войти</span> &bull; <span>Кабинет</span>
            </div>
          </div>

          <!-- Hero Section Clone -->
          <div class="replica-editable-card" data-block-key="hero_subtitle" style="cursor:pointer; position:relative; background-image:linear-gradient(180deg, rgba(29,27,24,0.78) 0%, rgba(75,71,63,0.82) 55%, rgba(29,27,24,0.92) 100%), url('/images/akylman-1.jpg'); background-size:cover; background-position:center 35%; color:#fffdf9; padding:56px 20px; text-align:center; border-radius:12px; border:2px solid #b8b0a0; margin-bottom:24px; transition:all 0.2s ease;">
            <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
              ✏️ Редактировать
            </div>
            <div style="display:inline-block; background:rgba(244,241,234,0.15); border:1px solid rgba(221,215,202,0.3); color:#f4f1ea; font-size:12px; font-weight:600; padding:4px 14px; border-radius:99px; text-transform:uppercase; margin-bottom:14px;">
              🏛️ Президентский лицей «Акылман»
            </div>
            <h1 style="font-family:'Spectral',Georgia,serif; font-size:36px; margin:0 0 10px 0; color:#fffdf9;">Akylman Quiz Bowl</h1>
            <p style="font-size:16px; color:#f4f1ea; margin:0 auto; max-width:550px;">${esc(getVal('hero_subtitle', 'content', currentLang))}</p>
          </div>

          <!-- SECTION 1: О соревновании (Round 1, 2, 3) -->
          <div class="replica-section" style="background:#fffdf9; border:1px solid #b8b0a0; border-radius:14px; padding:32px 24px; margin-bottom:28px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px;">
              <h2 style="font-family:'Spectral',Georgia,serif; font-size:26px; color:#1d1b18; margin:0;">
                О соревновании
              </h2>
              <span style="font-size:12px; background:#f4f1ea; padding:4px 10px; border-radius:6px; color:#857f73; border:1px solid #cfc7b9;">
                Секция 1 &bull; 3 карточки (нажмите для редактирования)
              </span>
            </div>

            <div class="replica-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
              
              <!-- Card 1: stage_1 -->
              <div class="replica-editable-card" data-block-key="stage_1" style="cursor:pointer; background:#fffdf9; border:2px solid #b8b0a0; border-radius:12px; padding:24px 20px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; margin-top:6px;">
                  <div style="width:44px; height:44px; border-radius:10px; background:#eff6ff; display:flex; align-items:center; justify-content:center; font-size:20px;">
                    📝
                  </div>
                  <span class="card-step-kicker" style="font-size:11px; font-weight:700; text-transform:uppercase; color:#2563eb; background:#eff6ff; border:1px solid #dbeafe; padding:4px 10px; border-radius:99px;">
                    ${esc(getVal('stage_1', 'badge', currentLang))}
                  </span>
                </div>
                <h3 style="font-size:19px; font-weight:700; color:#1d1b18; margin:0 0 10px 0; font-family:'Spectral',Georgia,serif;">
                  ${esc(getVal('stage_1', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:14px; line-height:1.6; margin:0;">
                  ${esc(getVal('stage_1', 'content', currentLang))}
                </p>
              </div>

              <!-- Card 2: stage_2 -->
              <div class="replica-editable-card" data-block-key="stage_2" style="cursor:pointer; background:#fffdf9; border:2px solid #b8b0a0; border-radius:12px; padding:24px 20px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; margin-top:6px;">
                  <div style="width:44px; height:44px; border-radius:10px; background:#f5f3ff; display:flex; align-items:center; justify-content:center; font-size:20px;">
                    🎯
                  </div>
                  <span class="card-step-kicker" style="font-size:11px; font-weight:700; text-transform:uppercase; color:#7c3aed; background:#f5f3ff; border:1px solid #ede9fe; padding:4px 10px; border-radius:99px;">
                    ${esc(getVal('stage_2', 'badge', currentLang))}
                  </span>
                </div>
                <h3 style="font-size:19px; font-weight:700; color:#1d1b18; margin:0 0 10px 0; font-family:'Spectral',Georgia,serif;">
                  ${esc(getVal('stage_2', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:14px; line-height:1.6; margin:0;">
                  ${esc(getVal('stage_2', 'content', currentLang))}
                </p>
              </div>

              <!-- Card 3: stage_3 -->
              <div class="replica-editable-card" data-block-key="stage_3" style="cursor:pointer; background:#fffdf9; border:2px solid #b8b0a0; border-radius:12px; padding:24px 20px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; margin-top:6px;">
                  <div style="width:44px; height:44px; border-radius:10px; background:#fffbeb; display:flex; align-items:center; justify-content:center; font-size:20px;">
                    🏆
                  </div>
                  <span class="card-step-kicker kicker-final" style="font-size:11px; font-weight:700; text-transform:uppercase; color:#d97706; background:#fffbeb; border:1px solid #fde68a; padding:4px 10px; border-radius:99px;">
                    ${esc(getVal('stage_3', 'badge', currentLang))}
                  </span>
                </div>
                <h3 style="font-size:19px; font-weight:700; color:#1d1b18; margin:0 0 10px 0; font-family:'Spectral',Georgia,serif;">
                  ${esc(getVal('stage_3', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:14px; line-height:1.6; margin:0;">
                  ${esc(getVal('stage_3', 'content', currentLang))}
                </p>
              </div>

            </div>
          </div>

          <!-- SECTION 2: Как это работает (Cards 01, 02, 03) -->
          <div class="replica-section" style="background:#faf7f0; border:1px solid #b8b0a0; border-radius:14px; padding:32px 24px; margin-bottom:28px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px;">
              <h2 style="font-family:'Spectral',Georgia,serif; font-size:26px; color:#1d1b18; margin:0;">
                Как это работает
              </h2>
              <span style="font-size:12px; background:#fffdf9; padding:4px 10px; border-radius:6px; color:#857f73; border:1px solid #cfc7b9;">
                Секция 2 &bull; 3 карточки (нажмите для редактирования)
              </span>
            </div>

            <div class="replica-cards-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
              
              <!-- Card 01: team_composition -->
              <div class="replica-editable-card" data-block-key="team_composition" style="cursor:pointer; background:#fffdf9; border:2px solid #b8b0a0; border-radius:16px; padding:28px 22px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="width:36px; height:36px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:#2563eb; font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
                  ${esc(getVal('team_composition', 'badge', currentLang))}
                </div>
                <h3 style="font-size:19px; font-weight:700; color:#0f172a; margin:0 0 10px 0;">
                  ${esc(getVal('team_composition', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:14px; line-height:1.6; margin:0;">
                  ${esc(getVal('team_composition', 'content', currentLang))}
                </p>
              </div>

              <!-- Card 02: categories_info -->
              <div class="replica-editable-card" data-block-key="categories_info" style="cursor:pointer; background:#fffdf9; border:2px solid #b8b0a0; border-radius:16px; padding:28px 22px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="width:36px; height:36px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:#2563eb; font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
                  ${esc(getVal('categories_info', 'badge', currentLang))}
                </div>
                <h3 style="font-size:19px; font-weight:700; color:#0f172a; margin:0 0 10px 0;">
                  ${esc(getVal('categories_info', 'title', currentLang))}
                </h3>
                <div style="color:#64748b; font-size:14px; line-height:1.6; margin:0;">
                  <ul style="padding-left:18px; margin:0; line-height:1.5;">
                    ${(cats && cats.length > 0) 
                      ? cats.slice(0, 4).map(c => `<li>${esc(currentLang === 'ky' ? (c.name_ky || c.name_ru) : c.name_ru)}</li>`).join('')
                      : '<li>Информатика и IT</li><li>Математика и логика</li><li>English Proficiency</li>'}
                  </ul>
                </div>
              </div>

              <!-- Card 03: format_info -->
              <div class="replica-editable-card" data-block-key="format_info" style="cursor:pointer; background:#fffdf9; border:2px solid #b8b0a0; border-radius:16px; padding:28px 22px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="width:36px; height:36px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:#2563eb; font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
                  ${esc(getVal('format_info', 'badge', currentLang))}
                </div>
                <h3 style="font-size:19px; font-weight:700; color:#0f172a; margin:0 0 10px 0;">
                  ${esc(getVal('format_info', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:14px; line-height:1.6; margin:0;">
                  ${esc(getVal('format_info', 'content', currentLang))}
                </p>
              </div>

            </div>
          </div>

          <!-- SECTION 3: Таймлайн (Timeline Items) -->
          <div class="replica-section" style="background:#fffdf9; border:1px solid #b8b0a0; border-radius:14px; padding:32px 24px; margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:22px;">
              <h2 style="font-family:'Spectral',Georgia,serif; font-size:26px; color:#1d1b18; margin:0;">
                Таймлайн
              </h2>
              <span style="font-size:12px; background:#f4f1ea; padding:4px 10px; border-radius:6px; color:#857f73; border:1px solid #cfc7b9;">
                Секция 3 &bull; 3 карточки (нажмите для редактирования)
              </span>
            </div>

            <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:20px;">
              
              <!-- Timeline 1: timeline_stage1 -->
              <div class="replica-editable-card" data-block-key="timeline_stage1" style="cursor:pointer; background:#ffffff; border:2px solid #b8b0a0; border-radius:16px; padding:24px 20px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="margin-bottom:12px; margin-top:6px;">
                  <span class="timeline-badge" style="font-size:11.5px; font-weight:700; color:#1e40af; background:#eff6ff; border:1px solid #dbeafe; padding:4px 10px; border-radius:99px;">
                    ${esc(getVal('timeline_stage1', 'badge', currentLang))}
                  </span>
                </div>
                <h3 style="font-size:18px; font-weight:700; color:#0f172a; margin:0 0 10px 0;">
                  ${esc(getVal('timeline_stage1', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:13.5px; line-height:1.6; margin:0 0 16px 0;">
                  ${esc(getVal('timeline_stage1', 'content', currentLang))}
                </p>
                <div style="font-size:12.5px; color:#1e293b; font-weight:600; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
                  📅 <span>${siteSettings.day1_date || '15-декабрь, 2025-жыл'}</span>
                </div>
              </div>

              <!-- Timeline 2: timeline_stage2 -->
              <div class="replica-editable-card" data-block-key="timeline_stage2" style="cursor:pointer; background:#ffffff; border:2px solid #b8b0a0; border-radius:16px; padding:24px 20px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="margin-bottom:12px; margin-top:6px;">
                  <span class="timeline-badge" style="font-size:11.5px; font-weight:700; color:#1e40af; background:#eff6ff; border:1px solid #dbeafe; padding:4px 10px; border-radius:99px;">
                    ${esc(getVal('timeline_stage2', 'badge', currentLang))}
                  </span>
                </div>
                <h3 style="font-size:18px; font-weight:700; color:#0f172a; margin:0 0 10px 0;">
                  ${esc(getVal('timeline_stage2', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:13.5px; line-height:1.6; margin:0 0 16px 0;">
                  ${esc(getVal('timeline_stage2', 'content', currentLang))}
                </p>
                <div style="font-size:12.5px; color:#1e293b; font-weight:600; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
                  📅 <span>${siteSettings.day2_date || '20-декабрь, 2025-жыл'}</span>
                </div>
              </div>

              <!-- Timeline 3: timeline_stage3 (Full width) -->
              <div class="replica-editable-card" data-block-key="timeline_stage3" style="grid-column:1/-1; cursor:pointer; background:linear-gradient(180deg, #ffffff 0%, #fffdfa 100%); border:2px solid #fed7aa; border-radius:16px; padding:24px 20px; position:relative; transition:all 0.2s ease;">
                <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
                  ✏️ Редактировать
                </div>
                <div style="margin-bottom:12px; margin-top:6px;">
                  <span class="timeline-badge timeline-badge-final" style="font-size:11.5px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; padding:4px 10px; border-radius:99px;">
                    ${esc(getVal('timeline_stage3', 'badge', currentLang))}
                  </span>
                </div>
                <h3 style="font-size:18px; font-weight:700; color:#0f172a; margin:0 0 10px 0;">
                  ${esc(getVal('timeline_stage3', 'title', currentLang))}
                </h3>
                <p style="color:#64748b; font-size:13.5px; line-height:1.6; margin:0 0 16px 0;">
                  ${esc(getVal('timeline_stage3', 'content', currentLang))}
                </p>
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                  <div style="font-size:12.5px; color:#92400e; font-weight:600; background:#fffbeb; border:1px solid #fef3c7; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
                    📍 <span>${siteSettings.final_place_ru || 'Президентский лицей «Акылман»'}</span>
                  </div>
                  <div style="font-size:12.5px; color:#1e293b; font-weight:600; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
                    📅 <span>${siteSettings.day3_date || '5-январь, 2026-жыл'}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Mock Footer Clone -->
          <div class="replica-editable-card" data-block-key="footer_desc" style="cursor:pointer; position:relative; background:#090e1a; color:#94a3b8; border-radius:12px; border:2px solid #334155; padding:24px 20px; font-size:13px; transition:all 0.2s ease;">
            <div class="replica-card-edit-hint" style="position:absolute; top:8px; right:8px; background:#9a3a24; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px; font-weight:700;">
              ✏️ Редактировать
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div>
                <strong style="color:#ffffff;">Akylman Quiz Bowl</strong> &mdash; ${esc(getVal('footer_desc', 'content', currentLang))}
              </div>
              <div style="color:#94a3b8;">
                &copy; 2025–2026 Akylman Presidential School. Все права защищены.
              </div>
            </div>
          </div>

        </div>

      </div>

      <!-- Quick Edit All Modal / Drawer (Full table mode) -->
      <div id="batchEditModal" class="reset-modal" style="display:none; align-items:flex-start; overflow-y:auto; padding:24px 16px;">
        <div class="reset-modal-content" style="max-width:960px; width:100%; margin:20px auto; background:#fff; border-radius:16px; padding:26px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid #e2e8f0; padding-bottom:14px;">
            <div>
              <h3 style="margin:0 0 4px 0; font-size:20px; color:#0f172a;">📋 Редактирование всех карточек главной</h3>
              <p style="margin:0; font-size:13px; color:#64748b;">Быстрое редактирование текстов всех карточек сайта с сохранением в PostgreSQL</p>
            </div>
            <button id="closeBatchEditModal" type="button" class="admin-button secondary" style="padding:4px 12px; font-size:18px;">&times;</button>
          </div>

          <div id="batchCardsList" style="display:flex; flex-direction:column; gap:18px; max-height:65vh; overflow-y:auto; padding-right:8px;"></div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:16px;">
            <button id="cancelBatchEdit" type="button" class="admin-button secondary">Отмена</button>
            <button id="saveBatchEdit" type="button" class="admin-button success" style="padding:10px 24px; font-weight:700;">💾 Сохранить всё в базу данных</button>
          </div>
        </div>
      </div>

      <!-- Single Block Edit Modal -->
      <div id="singleBlockModal" class="reset-modal" style="display:none;">
        <div class="reset-modal-content" style="max-width:620px; width:100%; background:#fff; border-radius:16px; padding:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
            <div>
              <h3 id="singleModalTitle" style="margin:0 0 4px 0; font-size:18.5px; color:#0f172a;">Редактирование карточки</h3>
              <code id="singleModalKey" style="font-size:12px; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;"></code>
            </div>
            <button id="closeSingleModal" type="button" class="admin-button secondary" style="padding:4px 12px; font-size:18px;">&times;</button>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            <!-- Badge -->
            <div class="form-row">
              <label style="flex:1;">🏷️ Бейдж / Номер (EN)
                <input type="text" id="smBadgeEn" class="admin-input" placeholder="e.g. Round 1"/>
              </label>
              <label style="flex:1;">🏷️ Бейдж / Номер (KY)
                <input type="text" id="smBadgeKy" class="admin-input" placeholder="мисалы: Раунд 1"/>
              </label>
            </div>

            <!-- Title -->
            <div class="form-row">
              <label style="flex:1;">🇬🇧 Заголовок (EN)
                <input type="text" id="smTitleEn" class="admin-input" placeholder="Title in English"/>
              </label>
              <label style="flex:1;">🇰🇬 Заголовок (KY)
                <input type="text" id="smTitleKy" class="admin-input" placeholder="Кыргызча аталышы"/>
              </label>
            </div>

            <!-- Description -->
            <div class="form-row">
              <label style="flex:1;">🇬🇧 Описание (EN)
                <textarea id="smContentEn" class="admin-input" rows="3" style="resize:vertical;" placeholder="Description text in English"></textarea>
              </label>
              <label style="flex:1;">🇰🇬 Описание (KY)
                <textarea id="smContentKy" class="admin-input" rows="3" style="resize:vertical;" placeholder="Кыргызча түшүндүрмөсү"></textarea>
              </label>
            </div>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:14px;">
            <button id="cancelSingleModal" type="button" class="admin-button secondary">Отмена</button>
            <button id="saveSingleModal" type="button" class="admin-button success" style="padding:9px 22px; font-weight:700;">💾 Сохранить карточку в SQL</button>
          </div>
        </div>
      </div>
    `;

    // Language switcher handlers
    document.getElementById('btnLangEn').onclick = () => {
      currentLang = 'en';
      renderView();
    };
    document.getElementById('btnLangKy').onclick = () => {
      currentLang = 'ky';
      renderView();
    };

    // Card hover effects and click to open single modal
    document.querySelectorAll('.replica-editable-card').forEach(card => {
      card.onmouseenter = () => {
        card.style.borderColor = '#9a3a24';
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 10px 20px rgba(154,58,36,0.12)';
      };
      card.onmouseleave = () => {
        card.style.borderColor = '#b8b0a0';
        card.style.transform = 'none';
        card.style.boxShadow = 'none';
      };

      card.onclick = () => {
        const key = card.getAttribute('data-block-key');
        openSingleBlockModal(key);
      };
    });

    // Reset defaults handler
    document.getElementById('btnResetToDefaults').onclick = () => {
      showAdminConfirm(
        'Сброс карточек главной страницы',
        'Вы уверены, что хотите сбросить тексты всех карточек к исходным стандартным значениям?',
        'Все изменения в Cloud SQL будут заменены стандартными текстами.',
        async () => {
          const r = await adminFetch('/api/admin/homepage-blocks/reset-defaults', { method: 'POST' });
          if (!r.ok) {
            await showResponseError(r, 'Ошибка сброса карточек');
            return;
          }
          try {
            localStorage.setItem('akyl_blocks_updated', String(Date.now()));
            window.postMessage({ type: 'AKYL_HOMEPAGE_SYNC' }, '*');
          } catch {}
          showAlert('Все карточки главной успешно сброшены к стандартным!', 'success');
          renderHomepageBlocks();
        }
      );
    };

    // Quick edit all / table mode button
    document.getElementById('btnQuickEditAll').onclick = openBatchModal;
  }

  function openSingleBlockModal(key) {
    const meta = blockMeta[key] || { name: key };
    const b = blockMap[key] || {};
    const modal = document.getElementById('singleBlockModal');
    if (!modal) return;

    document.getElementById('singleModalTitle').textContent = `Редактирование: ${meta.name}`;
    document.getElementById('singleModalKey').textContent = `key: ${key}`;

    const badgeEn = b.badge_en ?? b.badge_ru ?? meta.defaultBadgeEn ?? meta.defaultBadgeRu ?? '';
    const badgeKy = b.badge_ky ?? meta.defaultBadgeKy ?? '';
    const titleEn = b.title_en ?? b.title_ru ?? meta.defaultTitleEn ?? meta.defaultTitleRu ?? '';
    const titleKy = b.title_ky ?? meta.defaultTitleKy ?? '';
    const contentEn = b.content_en ?? b.content_ru ?? meta.defaultContentEn ?? meta.defaultContentRu ?? '';
    const contentKy = b.content_ky ?? meta.defaultContentKy ?? '';

    document.getElementById('smBadgeEn').value = badgeEn;
    document.getElementById('smBadgeKy').value = badgeKy;
    document.getElementById('smTitleEn').value = titleEn;
    document.getElementById('smTitleKy').value = titleKy;
    document.getElementById('smContentEn').value = contentEn;
    document.getElementById('smContentKy').value = contentKy;

    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; };
    document.getElementById('closeSingleModal').onclick = close;
    document.getElementById('cancelSingleModal').onclick = close;

    document.getElementById('saveSingleModal').onclick = async () => {
      const badge_en = document.getElementById('smBadgeEn').value.trim();
      const badge_ky = document.getElementById('smBadgeKy').value.trim();
      const title_en = document.getElementById('smTitleEn').value.trim();
      const title_ky = document.getElementById('smTitleKy').value.trim();
      const content_en = document.getElementById('smContentEn').value.trim();
      const content_ky = document.getElementById('smContentKy').value.trim();

      const payload = {
        badge_en,
        badge_ky,
        badge_ru: badge_en,
        title_en,
        title_ky,
        title_ru: title_en,
        content_en,
        content_ky,
        content_ru: content_en
      };

      const res = await adminFetch(`/api/admin/homepage-blocks/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        await showResponseError(res, 'Ошибка сохранения в базу данных');
        return;
      }

      // Update local memory map
      blockMap[key] = { ...(blockMap[key] || {}), ...payload };
      try {
        localStorage.setItem('akyl_blocks_updated', String(Date.now()));
        window.postMessage({ type: 'AKYL_HOMEPAGE_SYNC' }, '*');
      } catch {}
      close();
      showAlert(`Карточка «${meta.name}» сохранена в Cloud SQL!`, 'success');
      renderView();
    };
  }

  function openBatchModal() {
    const modal = document.getElementById('batchEditModal');
    const container = document.getElementById('batchCardsList');
    if (!modal || !container) return;

    let itemsHtml = '';
    Object.keys(blockMeta).forEach(key => {
      const meta = blockMeta[key];
      const b = blockMap[key] || {};
      const badgeEn = b.badge_en ?? b.badge_ru ?? meta.defaultBadgeEn ?? meta.defaultBadgeRu ?? '';
      const badgeKy = b.badge_ky ?? meta.defaultBadgeKy ?? '';
      const titleEn = b.title_en ?? b.title_ru ?? meta.defaultTitleEn ?? meta.defaultTitleRu ?? '';
      const titleKy = b.title_ky ?? meta.defaultTitleKy ?? '';
      const contentEn = b.content_en ?? b.content_ru ?? meta.defaultContentEn ?? meta.defaultContentRu ?? '';
      const contentKy = b.content_ky ?? meta.defaultContentKy ?? '';

      itemsHtml += `
        <div class="batch-edit-row" data-key="${key}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px;">
          <div style="font-weight:700; color:#1e293b; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>${meta.name} (${meta.section})</span>
            <code style="font-size:11px; background:#e2e8f0; padding:2px 6px; border-radius:4px;">${key}</code>
          </div>
          <div class="form-row" style="margin-bottom:8px;">
            <label style="flex:1;">Бейдж (EN)
              <input type="text" class="admin-input batch-badge-en" value="${esc(badgeEn)}"/>
            </label>
            <label style="flex:1;">Бейдж (KY)
              <input type="text" class="admin-input batch-badge-ky" value="${esc(badgeKy)}"/>
            </label>
          </div>
          <div class="form-row" style="margin-bottom:8px;">
            <label style="flex:1;">Заголовок (EN)
              <input type="text" class="admin-input batch-title-en" value="${esc(titleEn)}"/>
            </label>
            <label style="flex:1;">Заголовок (KY)
              <input type="text" class="admin-input batch-title-ky" value="${esc(titleKy)}"/>
            </label>
          </div>
          <div class="form-row">
            <label style="flex:1;">Описание (EN)
              <textarea class="admin-input batch-content-en" rows="2" style="resize:vertical;">${esc(contentEn)}</textarea>
            </label>
            <label style="flex:1;">Описание (KY)
              <textarea class="admin-input batch-content-ky" rows="2" style="resize:vertical;">${esc(contentKy)}</textarea>
            </label>
          </div>
        </div>
      `;
    });

    container.innerHTML = itemsHtml;
    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; };
    document.getElementById('closeBatchEditModal').onclick = close;
    document.getElementById('cancelBatchEdit').onclick = close;

    document.getElementById('saveBatchEdit').onclick = async () => {
      const rows = container.querySelectorAll('.batch-edit-row');
      const blocksToSave = [];
      rows.forEach(r => {
        const key = r.getAttribute('data-key');
        const badgeEn = r.querySelector('.batch-badge-en')?.value || '';
        const badgeKy = r.querySelector('.batch-badge-ky')?.value || '';
        const titleEn = r.querySelector('.batch-title-en')?.value || '';
        const titleKy = r.querySelector('.batch-title-ky')?.value || '';
        const contentEn = r.querySelector('.batch-content-en')?.value || '';
        const contentKy = r.querySelector('.batch-content-ky')?.value || '';

        const itemPayload = {
          block_key: key,
          badge_en: badgeEn.trim(),
          badge_ky: badgeKy.trim(),
          badge_ru: badgeEn.trim(),
          title_en: titleEn.trim(),
          title_ky: titleKy.trim(),
          title_ru: titleEn.trim(),
          content_en: contentEn.trim(),
          content_ky: contentKy.trim(),
          content_ru: contentEn.trim()
        };
        blocksToSave.push(itemPayload);
        blockMap[key] = { ...(blockMap[key] || {}), ...itemPayload };
      });

      const res = await adminFetch('/api/admin/homepage-blocks/batch', {
        method: 'POST',
        body: JSON.stringify({ blocks: blocksToSave })
      });

      if (!res.ok) {
        await showResponseError(res, 'Ошибка сохранения всех карточек');
        return;
      }

      try {
        localStorage.setItem('akyl_blocks_updated', String(Date.now()));
        window.postMessage({ type: 'AKYL_HOMEPAGE_SYNC' }, '*');
      } catch {}
      close();
      showAlert('Все карточки сохранены в Cloud SQL!', 'success');
      renderView();
    };
  }

    // Initial draw
    renderView();
  } catch (err) {
    console.error('Render homepage replica error:', err);
    showAlert('Ошибка отображения макета: ' + err.message, 'error');
    content.innerHTML = `
      <div class="admin-card" style="padding:32px 24px; text-align:center; max-width:620px; margin:40px auto; background:#fffdf9; border:1px solid #b8b0a0; border-radius:14px;">
        <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
        <h3 style="margin:0 0 8px; font-size:18px; color:#1d1b18;">Сбой отображения редактора</h3>
        <p style="color:#64748b; font-size:14px; margin-bottom:20px;">${esc(err.message)}</p>
        <button type="button" class="admin-button" onclick="renderHomepageBlocks()">🔄 Попробовать снова</button>
      </div>
    `;
  }
}

// ==========================================================================
// Announcements Tab (Admin)
// ==========================================================================
let editingAnnouncementId = null;

async function renderAnnouncements() {
  setActiveTab(document.getElementById('tabAnnouncements'));
  showLoading('Загрузка объявлений...');

  try {
    const [annRes, catRes] = await Promise.all([
      adminFetch('/api/admin/announcements'),
      adminFetch('/api/admin/categories')
    ]);

    const annData = await annRes.json();
    const catData = await catRes.json();

    const announcements = (annData && annData.announcements) ? annData.announcements : [];
    const categories = (catData && catData.categories) ? catData.categories : [];

    let currentFilter = 'all';

    function renderList(filter = 'all') {
      currentFilter = filter;
      const filtered = announcements.filter(a => {
        if (filter === 'published') return a.is_published === 1;
        if (filter === 'draft') return a.is_published === 0;
        if (filter === 'urgent') return a.priority === 'urgent';
        return true;
      });

      const listHtml = filtered.length === 0 ? `
        <div class="empty-state-card" style="background:#fffdf9; border:1px dashed var(--adm-border); padding:36px; text-align:center; border-radius:6px;">
          <div style="font-size:32px; margin-bottom:8px;">📢</div>
          <div style="font-size:16px; font-weight:600; color:var(--adm-ink);">Объявлений пока нет</div>
          <div style="font-size:13px; color:var(--adm-ink-3); margin-top:4px;">Нажмите «+ Новое объявление», чтобы оповестить команды о важных новостях турнира.</div>
        </div>
      ` : filtered.map(a => {
        const priorityLabels = {
          urgent: { label: 'Срочное', bg: '#fbebee', color: '#a82020', border: '#a82020' },
          important: { label: 'Важное', bg: '#fdf2e7', color: '#b86214', border: '#b86214' },
          normal: { label: 'Информация', bg: '#f5ebe6', color: '#9a3a24', border: '#cfc7b9' }
        };
        const pInfo = priorityLabels[a.priority] || priorityLabels.normal;

        const audienceText = a.target_type === 'category' 
          ? `Категория: ${esc(a.category_name_ru || a.category_name_ky || 'Категория #' + a.target_category_id)}`
          : '📢 Все команды (Broadcast)';

        const isPub = a.is_published === 1;
        const createdDate = a.created_at ? new Date(a.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

        return `
          <div class="announcement-item" style="background:#fffdf9; border:1px solid var(--adm-border); border-left:4px solid ${pInfo.color}; border-radius:6px; padding:20px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="background:${pInfo.bg}; color:${pInfo.color}; border:1px solid ${pInfo.border}; font-size:11px; font-weight:700; padding:3px 8px; border-radius:3px; text-transform:uppercase;">
                  ${pInfo.label}
                </span>
                <span style="background:#faf7f0; border:1px solid #cfc7b9; color:var(--adm-ink-2); font-size:12px; font-weight:600; padding:3px 9px; border-radius:3px;">
                  ${audienceText}
                </span>
                <span style="font-size:12px; color:var(--adm-ink-3); font-family:monospace;">
                  ${createdDate}
                </span>
              </div>

              <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="admin-button-secondary toggle-pub-btn" data-id="${a.id}" style="font-size:12px; padding:5px 10px; background:${isPub ? '#eaf3ee' : '#f8fafc'}; color:${isPub ? '#2d6a4f' : '#64748b'}; border:1px solid ${isPub ? '#82b99a' : '#cbd5e1'};">
                  ${isPub ? '● Опубликовано' : '○ Черновик'}
                </button>
                <button type="button" class="admin-button-secondary edit-ann-btn" data-id="${a.id}" style="font-size:12px; padding:5px 10px;">
                  ✏️ Редактировать
                </button>
                <button type="button" class="admin-button-danger delete-ann-btn" data-id="${a.id}" style="font-size:12px; padding:5px 10px;">
                  🗑️ Удалить
                </button>
              </div>
            </div>

            <!-- Заголовок -->
            <div style="margin-bottom:8px;">
              <h3 style="font-family:'Spectral',serif; font-size:18px; margin:0 0 4px; color:var(--adm-ink); font-weight:700;">
                ${esc(a.title_ru || a.title_ky || a.title_en || 'Без заголовка')}
              </h3>
              ${(a.title_ky && a.title_ky !== a.title_ru) ? `
                <div style="font-size:13px; color:var(--adm-ink-3); font-style:italic;">
                  🇰🇬 ${esc(a.title_ky)}
                </div>
              ` : ''}
            </div>

            <!-- Текст -->
            <div style="font-size:14px; line-height:1.55; color:var(--adm-ink-2); white-space:pre-wrap; margin-bottom:10px;">
              ${esc(a.content_ru || a.content_ky || a.content_en || '')}
            </div>

            ${(a.content_ky && a.content_ky !== a.content_ru) ? `
              <div style="margin-top:10px; padding-top:8px; border-top:1px dashed #cfc7b9; font-size:13px; color:var(--adm-ink-2); white-space:pre-wrap;">
                <span style="font-weight:600; color:var(--adm-primary);">🇰🇬 Кыргызча вариант:</span><br/>
                ${esc(a.content_ky)}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      const listContainer = document.getElementById('announcementsListContainer');
      if (listContainer) listContainer.innerHTML = listHtml;
      attachAnnouncementItemListeners();
    }

    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
        <div>
          <h2 style="font-family:'Spectral',serif; font-size:24px; margin:0; color:var(--adm-ink);">📢 Объявления для команд</h2>
          <div style="font-size:13px; color:var(--adm-ink-3); margin-top:3px;">
            Создавайте общие оповещения или таргетируйте по категориям. Оповещения моментально видны в кабинете команд.
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="admin-button" id="openNewAnnouncementBtn" style="display:inline-flex; align-items:center; gap:6px;">
            <span>+</span> <span>Новое объявление</span>
          </button>
          <button type="button" class="admin-button-secondary" onclick="renderAnnouncements()" title="Обновить">
            🔄
          </button>
        </div>
      </div>

      <!-- Фильтры -->
      <div class="admin-tab-filter-bar">
        <span style="font-size:13px; font-weight:600; color:var(--adm-ink-3); margin-right:4px;">Фильтр:</span>
        <button type="button" class="admin-filter-pill active" data-filter="all">Все (${announcements.length})</button>
        <button type="button" class="admin-filter-pill" data-filter="published">Опубликованные (${announcements.filter(a=>a.is_published===1).length})</button>
        <button type="button" class="admin-filter-pill" data-filter="draft">Черновики (${announcements.filter(a=>a.is_published===0).length})</button>
        <button type="button" class="admin-filter-pill" data-filter="urgent">Срочные (${announcements.filter(a=>a.priority==='urgent').length})</button>
      </div>

      <!-- Список объявлений -->
      <div id="announcementsListContainer"></div>

      <!-- Модальное окно создания/редактирования -->
      <div id="announcementModal" class="custom-modal-backdrop" style="display:none; position:fixed; inset:0; background:rgba(29,27,24,0.55); z-index:9999; align-items:center; justify-content:center; padding:16px;">
        <div class="admin-form" style="max-width:720px; width:100%; max-height:92vh; overflow-y:auto; background:#fffdf9; border:1px solid var(--adm-border); border-radius:8px; padding:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--adm-border); padding-bottom:12px;">
            <h3 id="annModalTitle" style="margin:0; font-family:'Spectral',serif; font-size:20px; color:var(--adm-ink);">
              Новое объявление
            </h3>
            <button type="button" id="closeAnnModalBtn" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:var(--adm-ink-3);">✕</button>
          </div>

          <form id="announcementForm" style="display:flex; flex-direction:column; gap:16px;">
            <input type="hidden" id="annFormId" value="">

            <!-- Билингвальные табы переключения языка формы -->
            <div style="display:flex; gap:8px; border-bottom:1px solid #cfc7b9; padding-bottom:8px;">
              <button type="button" class="admin-filter-pill active" id="tabLangRu" style="padding:4px 12px; font-size:12px;">🇷🇺 Русский</button>
              <button type="button" class="admin-filter-pill" id="tabLangKy" style="padding:4px 12px; font-size:12px;">🇰🇬 Кыргызча</button>
              <button type="button" class="admin-filter-pill" id="tabLangEn" style="padding:4px 12px; font-size:12px;">🇬🇧 English</button>
            </div>

            <!-- Русский блок -->
            <div id="annBlockRu" style="display:flex; flex-direction:column; gap:12px;">
              <div>
                <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Заголовок (RU) *
                </label>
                <input type="text" id="annTitleRu" class="admin-input" style="width:100%;" placeholder="Например: Обновление расписания 2-го тура">
              </div>
              <div>
                <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Текст объявления (RU) *
                </label>
                <textarea id="annContentRu" class="admin-input" rows="4" style="width:100%; resize:vertical;" placeholder="Подробный текст сообщения..."></textarea>
              </div>
            </div>

            <!-- Кыргызский блок -->
            <div id="annBlockKy" style="display:none; flex-direction:column; gap:12px;">
              <div>
                <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Темасы / Заголовок (KY) *
                </label>
                <input type="text" id="annTitleKy" class="admin-input" style="width:100%;" placeholder="Мисалы: 2-турдун расписаниеси боюнча маалымат">
              </div>
              <div>
                <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Кабардын тексти (KY) *
                </label>
                <textarea id="annContentKy" class="admin-input" rows="4" style="width:100%; resize:vertical;" placeholder="Кулактандыруунун толук тексти..."></textarea>
              </div>
            </div>

            <!-- Английский блок -->
            <div id="annBlockEn" style="display:none; flex-direction:column; gap:12px;">
              <div>
                <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Title (EN)
                </label>
                <input type="text" id="annTitleEn" class="admin-input" style="width:100%;" placeholder="Tournament Announcement Title">
              </div>
              <div>
                <label style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Content (EN)
                </label>
                <textarea id="annContentEn" class="admin-input" rows="4" style="width:100%; resize:vertical;" placeholder="Announcement body in English..."></textarea>
              </div>
            </div>

            <!-- Настройки таргетинга и приоритета -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; background:#faf7f0; border:1px solid #cfc7b9; padding:14px; border-radius:6px;">
              <div>
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Аудитория (Кому адресовано)
                </label>
                <select id="annTargetType" class="admin-input" style="width:100%;">
                  <option value="all">📢 Всем командам (Broadcast)</option>
                  <option value="category">Определенной категории</option>
                </select>
              </div>

              <div id="annCategorySelectWrap" style="display:none;">
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Выберите категорию
                </label>
                <select id="annTargetCategoryId" class="admin-input" style="width:100%;">
                  ${categories.map(c => `<option value="${c.id}">${esc(c.name_ru || c.name_ky || 'Категория #' + c.id)}</option>`).join('')}
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px; color:var(--adm-ink);">
                  Приоритет
                </label>
                <select id="annPriority" class="admin-input" style="width:100%;">
                  <option value="normal">Информация (Обычное)</option>
                  <option value="important">Важное</option>
                  <option value="urgent">Срочное (Красная плашка)</option>
                </select>
              </div>

              <div style="display:flex; align-items:center; gap:8px; margin-top:20px;">
                <input type="checkbox" id="annIsPublished" checked style="width:18px; height:18px; accent-color:var(--adm-primary); cursor:pointer;">
                <label for="annIsPublished" style="font-size:13px; font-weight:600; color:var(--adm-ink); cursor:pointer;">
                  Опубликовать сразу
                </label>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
              <button type="button" id="cancelAnnBtn" class="admin-button-secondary">Отмена</button>
              <button type="submit" id="saveAnnBtn" class="admin-button">Сохранить и опубликовать</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Filters event listeners
    document.querySelectorAll('.admin-filter-pill[data-filter]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.admin-filter-pill[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderList(btn.dataset.filter);
      };
    });

    // Language tabs in modal
    const tabRu = document.getElementById('tabLangRu');
    const tabKy = document.getElementById('tabLangKy');
    const tabEn = document.getElementById('tabLangEn');
    const bRu = document.getElementById('annBlockRu');
    const bKy = document.getElementById('annBlockKy');
    const bEn = document.getElementById('annBlockEn');

    function switchAnnLang(activeLang) {
      tabRu.classList.toggle('active', activeLang === 'ru');
      tabKy.classList.toggle('active', activeLang === 'ky');
      tabEn.classList.toggle('active', activeLang === 'en');
      bRu.style.display = activeLang === 'ru' ? 'flex' : 'none';
      bKy.style.display = activeLang === 'ky' ? 'flex' : 'none';
      bEn.style.display = activeLang === 'en' ? 'flex' : 'none';
    }

    tabRu.onclick = () => switchAnnLang('ru');
    tabKy.onclick = () => switchAnnLang('ky');
    tabEn.onclick = () => switchLangEn();
    function switchLangEn() { switchAnnLang('en'); }

    // Target type change
    const targetTypeSelect = document.getElementById('annTargetType');
    const catSelectWrap = document.getElementById('annCategorySelectWrap');
    targetTypeSelect.onchange = () => {
      catSelectWrap.style.display = targetTypeSelect.value === 'category' ? 'block' : 'none';
    };

    // Modal controls
    const modal = document.getElementById('announcementModal');
    const openBtn = document.getElementById('openNewAnnouncementBtn');
    const closeBtn = document.getElementById('closeAnnModalBtn');
    const cancelBtn = document.getElementById('cancelAnnBtn');

    function openModal(editItem = null) {
      editingAnnouncementId = editItem ? editItem.id : null;
      document.getElementById('annModalTitle').textContent = editItem ? 'Редактировать объявление' : 'Новое объявление';
      document.getElementById('annFormId').value = editItem ? editItem.id : '';
      document.getElementById('annTitleRu').value = editItem ? (editItem.title_ru || '') : '';
      document.getElementById('annTitleKy').value = editItem ? (editItem.title_ky || '') : '';
      document.getElementById('annTitleEn').value = editItem ? (editItem.title_en || '') : '';
      document.getElementById('annContentRu').value = editItem ? (editItem.content_ru || '') : '';
      document.getElementById('annContentKy').value = editItem ? (editItem.content_ky || '') : '';
      document.getElementById('annContentEn').value = editItem ? (editItem.content_en || '') : '';
      
      targetTypeSelect.value = editItem ? editItem.target_type : 'all';
      catSelectWrap.style.display = targetTypeSelect.value === 'category' ? 'block' : 'none';
      if (editItem && editItem.target_category_id) {
        document.getElementById('annTargetCategoryId').value = editItem.target_category_id;
      }
      document.getElementById('annPriority').value = editItem ? (editItem.priority || 'normal') : 'normal';
      document.getElementById('annIsPublished').checked = editItem ? (editItem.is_published === 1) : true;

      switchAnnLang('ru');
      modal.style.display = 'flex';
    }

    function closeModal() {
      modal.style.display = 'none';
      editingAnnouncementId = null;
    }

    openBtn.onclick = () => openModal();
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    // Form submit
    const form = document.getElementById('announcementForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('saveAnnBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';

      const payload = {
        title_ru: document.getElementById('annTitleRu').value.trim(),
        title_ky: document.getElementById('annTitleKy').value.trim(),
        title_en: document.getElementById('annTitleEn').value.trim(),
        content_ru: document.getElementById('annContentRu').value.trim(),
        content_ky: document.getElementById('annContentKy').value.trim(),
        content_en: document.getElementById('annContentEn').value.trim(),
        target_type: targetTypeSelect.value,
        target_category_id: targetTypeSelect.value === 'category' ? parseInt(document.getElementById('annTargetCategoryId').value, 10) : null,
        priority: document.getElementById('annPriority').value,
        is_published: document.getElementById('annIsPublished').checked ? 1 : 0
      };

      if (!payload.title_ru && !payload.title_ky) {
        showAlert('Укажите заголовок хотя бы на одном языке (RU или KY)', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить и опубликовать';
        return;
      }
      if (!payload.content_ru && !payload.content_ky) {
        showAlert('Укажите текст объявления', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить и опубликовать';
        return;
      }

      // Auto-populate Kyrgyz/Russian if one was left empty
      if (!payload.title_ky) payload.title_ky = payload.title_ru;
      if (!payload.title_ru) payload.title_ru = payload.title_ky;
      if (!payload.content_ky) payload.content_ky = payload.content_ru;
      if (!payload.content_ru) payload.content_ru = payload.content_ky;

      try {
        let res;
        if (editingAnnouncementId) {
          res = await adminFetch(`/api/admin/announcements/${editingAnnouncementId}`, {
            method: 'PUT',
            headers: aHeaders(),
            body: JSON.stringify(payload)
          });
        } else {
          res = await adminFetch('/api/admin/announcements', {
            method: 'POST',
            headers: aHeaders(),
            body: JSON.stringify(payload)
          });
        }

        const data = await res.json();
        if (res.ok && data.ok) {
          showAlert(editingAnnouncementId ? 'Объявление обновлено' : 'Объявление создано', 'success');
          closeModal();
          renderAnnouncements();
        } else {
          showAlert(data.error || 'Ошибка при сохранении объявления', 'error');
        }
      } catch (err) {
        showAlert('Сетевая ошибка: ' + err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить и опубликовать';
      }
    };

    function attachAnnouncementItemListeners() {
      // Toggle publish
      document.querySelectorAll('.toggle-pub-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          try {
            const res = await adminFetch(`/api/admin/announcements/${id}/toggle`, {
              method: 'PATCH',
              headers: aHeaders()
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              showAlert(data.is_published ? 'Объявление опубликовано' : 'Объявление скрыто в черновики', 'success');
              renderAnnouncements();
            } else {
              showAlert(data.error || 'Ошибка изменения статуса', 'error');
            }
          } catch (e) {
            showAlert('Ошибка: ' + e.message, 'error');
          }
        };
      });

      // Edit announcement
      document.querySelectorAll('.edit-ann-btn').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.dataset.id, 10);
          const item = announcements.find(a => a.id === id);
          if (item) openModal(item);
        };
      });

      // Delete announcement
      document.querySelectorAll('.delete-ann-btn').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          if (!confirm('Вы уверены, что хотите удалить это объявление?')) return;
          try {
            const res = await adminFetch(`/api/admin/announcements/${id}`, {
              method: 'DELETE',
              headers: aHeaders()
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              showAlert('Объявление удалено', 'success');
              renderAnnouncements();
            } else {
              showAlert(data.error || 'Ошибка удаления', 'error');
            }
          } catch (e) {
            showAlert('Ошибка: ' + e.message, 'error');
          }
        };
      });
    }

    renderList('all');

  } catch (err) {
    console.error('Error in renderAnnouncements:', err);
    content.innerHTML = `
      <div class="admin-error-card" style="padding:24px; background:#fbebee; border:1px solid #a82020; border-radius:6px; color:#a82020;">
        <h3 style="margin:0 0 8px;">Ошибка загрузки объявлений</h3>
        <div>${esc(err.message)}</div>
        <button type="button" class="admin-button" onclick="renderAnnouncements()" style="margin-top:12px;">Попробовать снова</button>
      </div>
    `;
  }
}

// ==========================================================================
// Support Tickets Desk (Admin)
// ==========================================================================
let activeAdminTicketId = null;

async function renderSupport() {
  setActiveTab(document.getElementById('tabSupport'));
  showLoading('Загрузка обращений поддержки...');

  try {
    const res = await adminFetch('/api/admin/support/tickets');
    const data = await res.json();
    const tickets = (data && data.tickets) ? data.tickets : [];

    let currentStatusFilter = 'all';

    function renderView() {
      const openCount = tickets.filter(t => t.status === 'open').length;
      const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
      const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

      // Update badge in sidebar
      const badgeEl = document.getElementById('adminSupportBadge');
      if (badgeEl) {
        if (openCount > 0) {
          badgeEl.textContent = String(openCount);
          badgeEl.style.display = 'inline-block';
        } else {
          badgeEl.style.display = 'none';
        }
      }

      const filtered = tickets.filter(t => {
        if (currentStatusFilter === 'all') return true;
        return t.status === currentStatusFilter;
      });

      content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
          <div>
            <h2 style="font-family:'Spectral',serif; font-size:24px; margin:0; color:var(--adm-ink);">💬 Поддержка и обращения команд</h2>
            <div style="font-size:13px; color:var(--adm-ink-3); margin-top:3px;">
              Отвечайте на вопросы участников, помогайте с доступами к тестам и решайте технические сложности.
            </div>
          </div>
          <button type="button" class="admin-button-secondary" onclick="renderSupport()" title="Обновить список">
            🔄 Обновить обращения
          </button>
        </div>

        <!-- Фильтры по статусам -->
        <div class="admin-tab-filter-bar">
          <span style="font-size:13px; font-weight:600; color:var(--adm-ink-3); margin-right:4px;">Статус:</span>
          <button type="button" class="admin-filter-pill ${currentStatusFilter === 'all' ? 'active' : ''}" data-status="all">
            Все (${tickets.length})
          </button>
          <button type="button" class="admin-filter-pill ${currentStatusFilter === 'open' ? 'active' : ''}" data-status="open" style="color:${openCount > 0 ? '#b86214' : 'inherit'}; font-weight:${openCount > 0 ? '700' : '600'};">
            ⚡ Открытые (${openCount})
          </button>
          <button type="button" class="admin-filter-pill ${currentStatusFilter === 'in_progress' ? 'active' : ''}" data-status="in_progress">
            ⏳ В работе (${inProgressCount})
          </button>
          <button type="button" class="admin-filter-pill ${currentStatusFilter === 'resolved' ? 'active' : ''}" data-status="resolved">
            ✓ Решенные (${resolvedCount})
          </button>
        </div>

        <!-- Рабочая зона: список слева + чат справа -->
        <div class="admin-support-grid">
          <div class="admin-tickets-sidebar" id="adminTicketsListContainer">
            ${filtered.length === 0 ? `
              <div style="background:#fffdf9; border:1px dashed var(--adm-border); padding:30px; text-align:center; border-radius:6px;">
                <div style="font-size:24px; margin-bottom:6px;">📬</div>
                <div style="font-size:14px; font-weight:600; color:var(--adm-ink);">Обращений в этой категории нет</div>
              </div>
            ` : filtered.map(t => {
              const isActive = activeAdminTicketId === t.id;
              const statusBadges = {
                open: { label: 'Открыто', bg: '#fdf2e7', color: '#b86214', border: '#d4976a' },
                in_progress: { label: 'В работе', bg: '#ebf4ff', color: '#1e40af', border: '#93c5fd' },
                resolved: { label: 'Решено', bg: '#eaf3ee', color: '#2d6a4f', border: '#82b99a' }
              };
              const sInfo = statusBadges[t.status] || statusBadges.open;
              const dateStr = t.updated_at ? new Date(t.updated_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

              return `
                <div class="admin-ticket-item ${isActive ? 'active' : ''}" data-ticket-id="${t.id}">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="background:${sInfo.bg}; color:${sInfo.color}; border:1px solid ${sInfo.border}; font-size:10.5px; font-weight:700; padding:2px 7px; border-radius:3px; text-transform:uppercase;">
                      ${sInfo.label}
                    </span>
                    <span style="font-size:11px; color:var(--adm-ink-3); font-family:monospace;">
                      ${dateStr}
                    </span>
                  </div>

                  <div style="font-size:14.5px; font-weight:600; color:var(--adm-ink); line-height:1.3; margin-top:2px;">
                    ${esc(t.subject)}
                  </div>

                  <div style="font-size:12px; color:var(--adm-primary); font-weight:600;">
                    👥 ${esc(t.team_name || 'Команда #' + t.team_id)}
                  </div>

                  <div style="font-size:12.5px; color:var(--adm-ink-3); line-height:1.35; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${t.last_sender === 'admin' ? '<b>Вы:</b> ' : ''}${esc(t.last_message || 'Новое обращение')}
                  </div>

                  <div style="font-size:11px; color:var(--adm-ink-3); display:flex; justify-content:space-between; margin-top:2px;">
                    <span>${esc(t.school || '')}</span>
                    <span style="font-weight:600;">${t.message_count || 1} сообщ.</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Правая колонка: Чат и управление диалогом -->
          <div class="admin-chat-pane" id="adminChatPane">
            <div style="padding:48px 24px; text-align:center; color:var(--adm-ink-3); margin:auto;">
              <div style="font-size:36px; margin-bottom:10px;">💬</div>
              <div style="font-size:16px; font-weight:600; color:var(--adm-ink);">Выберите обращение из списка слева</div>
              <div style="font-size:13px; margin-top:4px;">Вы сможете прочитать сообщения команды и отправить оперативный ответ.</div>
            </div>
          </div>
        </div>
      `;

      // Status filter buttons
      document.querySelectorAll('.admin-filter-pill[data-status]').forEach(btn => {
        btn.onclick = () => {
          currentStatusFilter = btn.dataset.status;
          renderView();
        };
      });

      // Ticket items click
      document.querySelectorAll('.admin-ticket-item').forEach(card => {
        card.onclick = () => {
          const tId = parseInt(card.dataset.ticketId, 10);
          activeAdminTicketId = tId;
          document.querySelectorAll('.admin-ticket-item').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          loadTicketDialogue(tId);
        };
      });

      // If active ticket already selected or if first ticket exists
      if (activeAdminTicketId) {
        loadTicketDialogue(activeAdminTicketId);
      } else if (filtered.length > 0) {
        activeAdminTicketId = filtered[0].id;
        loadTicketDialogue(activeAdminTicketId);
      }
    }

    async function loadTicketDialogue(ticketId) {
      const pane = document.getElementById('adminChatPane');
      if (!pane) return;

      pane.innerHTML = `
        <div style="padding:40px; text-align:center; color:var(--adm-ink-3);">
          <div>⏳ Загрузка переписки...</div>
        </div>
      `;

      try {
        const res = await adminFetch(`/api/admin/support/tickets/${ticketId}`);
        const d = await res.json();
        if (!res.ok || !d.ok || !d.ticket) {
          pane.innerHTML = `<div style="padding:24px; color:#a82020;">Обращение не найдено</div>`;
          return;
        }

        const t = d.ticket;
        const messages = d.messages || [];

        pane.innerHTML = `
          <!-- Шапка переписки -->
          <div class="admin-chat-header">
            <div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <h3 style="margin:0; font-family:'Spectral',serif; font-size:18px; color:var(--adm-ink);">
                  ${esc(t.subject)}
                </h3>
                <span style="font-size:12px; background:#faf7f0; border:1px solid #cfc7b9; padding:2px 6px; border-radius:3px;">
                  Категория: ${esc(t.category || 'general')}
                </span>
              </div>
              <div style="font-size:13px; color:var(--adm-ink-2); margin-top:4px;">
                <b>Команда:</b> «${esc(t.team_name || '')}» 
                ${t.school ? `• ${esc(t.school)}` : ''} 
                ${t.city ? `(${esc(t.city)})` : ''}
                ${t.team_email || t.email ? `• 📧 <a href="mailto:${esc(t.team_email || t.email)}" style="color:var(--adm-primary);">${esc(t.team_email || t.email)}</a>` : ''}
                ${t.phone ? `• 📞 ${esc(t.phone)}` : ''}
              </div>
            </div>

            <!-- Смена статуса и Удаление -->
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:12px; font-weight:600; color:var(--adm-ink-3);">Статус:</span>
              <select id="ticketStatusSelect" class="admin-input" style="padding:4px 8px; font-size:12px; font-weight:600;">
                <option value="open" ${t.status === 'open' ? 'selected' : ''}>⚡ Открыто</option>
                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>⏳ В работе</option>
                <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>✓ Решено</option>
              </select>
              <button type="button" id="deleteTicketBtn" class="admin-button-danger" style="font-size:11px; padding:4px 8px;" title="Удалить обращение">🗑️</button>
            </div>
          </div>

          <!-- Лента сообщений -->
          <div class="admin-chat-stream" id="adminChatStream">
            ${messages.length === 0 ? `
              <div style="text-align:center; color:var(--adm-ink-3); padding:20px;">Нет сообщений</div>
            ` : messages.map(m => {
              const isAdmin = m.sender_type === 'admin';
              const timeStr = m.created_at ? new Date(m.created_at).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
              return `
                <div class="admin-chat-bubble ${isAdmin ? 'from-admin' : 'from-team'}">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:2px;">
                    <span style="font-size:11px; font-weight:700; color:${isAdmin ? 'var(--adm-primary)' : '#2d6a4f'}; text-transform:uppercase;">
                      ${isAdmin ? '🛡️ Администрация' : `👥 ${esc(m.sender_name || t.team_name || 'Команда')}`}
                    </span>
                    <span style="font-size:11px; color:var(--adm-ink-3); font-family:monospace;">
                      ${timeStr}
                    </span>
                  </div>
                  <div style="color:var(--adm-ink); font-size:14px; white-space:pre-wrap; word-break:break-word;">
                    ${esc(m.message)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Форма ответа -->
          <form class="admin-chat-composer" id="adminReplyForm">
            <div>
              <textarea id="adminReplyMessage" class="admin-input" rows="3" style="width:100%; resize:vertical;" placeholder="Напишите ответ команде... (Ctrl+Enter для отправки)"></textarea>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; color:var(--adm-ink-3);">Перевести статус при ответе:</span>
                <select id="replyStatusOption" class="admin-input" style="padding:4px 8px; font-size:12px;">
                  <option value="in_progress">⏳ В работе</option>
                  <option value="resolved">✓ Решено</option>
                  <option value="open">Оставить «Открыто»</option>
                </select>
              </div>
              <button type="submit" id="adminSendReplyBtn" class="admin-button" style="display:inline-flex; align-items:center; gap:6px;">
                <span>Отправить ответ</span> <span>➤</span>
              </button>
            </div>
          </form>
        `;

        // Scroll chat to bottom
        const stream = document.getElementById('adminChatStream');
        if (stream) stream.scrollTop = stream.scrollHeight;

        // Delete ticket handler
        document.getElementById('deleteTicketBtn').onclick = async () => {
          if (!confirm('Вы уверены, что хотите удалить это обращение вместе со всей историей переписки?')) return;
          try {
            const dRes = await adminFetch(`/api/admin/support/tickets/${ticketId}`, {
              method: 'DELETE',
              headers: aHeaders()
            });
            const dData = await dRes.json();
            if (dRes.ok && dData.ok) {
              showAlert('Обращение удалено', 'success');
              activeAdminTicketId = null;
              renderSupport();
            } else {
              showAlert(dData.error || 'Ошибка удаления', 'error');
            }
          } catch (e) {
            showAlert('Ошибка: ' + e.message, 'error');
          }
        };

        // Change status handler
        const statusSelect = document.getElementById('ticketStatusSelect');
        if (statusSelect) {
          statusSelect.onchange = async () => {
            const newStatus = statusSelect.value;
            statusSelect.disabled = true;
            try {
              const sRes = await adminFetch(`/api/admin/support/tickets/${ticketId}/status`, {
                method: 'PATCH',
                headers: aHeaders(),
                body: JSON.stringify({ status: newStatus })
              });
              const sData = await sRes.json();
              if (sRes.ok && sData.ok) {
                showAlert('Статус обращения изменен на: ' + newStatus, 'success');
                renderSupport();
              } else {
                showAlert(sData.error || 'Ошибка смены статуса', 'error');
              }
            } catch (e) {
              showAlert('Ошибка: ' + e.message, 'error');
            } finally {
              statusSelect.disabled = false;
            }
          };
        }


        // Reply form handler
        const replyForm = document.getElementById('adminReplyForm');
        const replyInput = document.getElementById('adminReplyMessage');
        const replyStatusOption = document.getElementById('replyStatusOption');
        const sendBtn = document.getElementById('adminSendReplyBtn');

        replyInput.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            replyForm.dispatchEvent(new Event('submit'));
          }
        });

        replyForm.onsubmit = async (e) => {
          e.preventDefault();
          const msg = replyInput.value.trim();
          if (!msg) {
            showAlert('Введите текст ответа', 'error');
            replyInput.focus();
            return;
          }

          sendBtn.disabled = true;
          sendBtn.textContent = 'Отправка...';

          try {
            const rRes = await adminFetch(`/api/admin/support/tickets/${ticketId}/reply`, {
              method: 'POST',
              headers: aHeaders(),
              body: JSON.stringify({
                message: msg,
                status: replyStatusOption.value
              })
            });

            const rData = await rRes.json();
            if (rRes.ok && rData.ok) {
              showAlert('Ответ успешно отправлен команде', 'success');
              replyInput.value = '';
              loadTicketDialogue(ticketId);
            } else {
              showAlert(rData.error || 'Ошибка при отправке ответа', 'error');
            }
          } catch (err) {
            showAlert('Ошибка: ' + err.message, 'error');
          } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span>Отправить ответ</span> <span>➤</span>';
          }
        };

      } catch (err) {
        pane.innerHTML = `<div style="padding:24px; color:#a82020;">Ошибка: ${esc(err.message)}</div>`;
      }
    }

    renderView();

  } catch (err) {
    console.error('Error in renderSupport:', err);
    content.innerHTML = `
      <div class="admin-error-card" style="padding:24px; background:#fbebee; border:1px solid #a82020; border-radius:6px; color:#a82020;">
        <h3 style="margin:0 0 8px;">Ошибка загрузки поддержки</h3>
        <div>${esc(err.message)}</div>
        <button type="button" class="admin-button" onclick="renderSupport()" style="margin-top:12px;">Попробовать снова</button>
      </div>
    `;
  }
}

async function updateAdminBadges() {
  try {
    const res = await adminFetch('/api/admin/support/tickets?status=open');
    if (!res.ok) return;
    const data = await res.json();
    const openCount = (data && data.tickets) ? data.tickets.length : 0;
    const badgeEl = document.getElementById('adminSupportBadge');
    if (badgeEl) {
      if (openCount > 0) {
        badgeEl.textContent = String(openCount);
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }
  } catch (e) {}
}

// Tab bindings
const bTests = document.getElementById('tabTests');
const bCats = document.getElementById('tabCategories');
const bTeams = document.getElementById('tabTeams');
const bResults = document.getElementById('tabResults');
const bAnnouncements = document.getElementById('tabAnnouncements');
const bSupport = document.getElementById('tabSupport');
const bSettings = document.getElementById('tabSettings');
const bHomepage = document.getElementById('tabHomepage');
const bBackup = document.getElementById('tabBackup');

if (bTests) bTests.onclick = () => { closeMobileSidebar(); renderTests(); };
if (bCats) bCats.onclick = () => { closeMobileSidebar(); renderCategories(); };
if (bTeams) bTeams.onclick = () => { closeMobileSidebar(); renderTeams(); };
if (bResults) bResults.onclick = () => { closeMobileSidebar(); renderResults(); };
if (bAnnouncements) bAnnouncements.onclick = () => { closeMobileSidebar(); renderAnnouncements(); };
if (bSupport) bSupport.onclick = () => { closeMobileSidebar(); renderSupport(); };
if (bSettings) bSettings.onclick = () => { closeMobileSidebar(); renderSettings(); };
if (bHomepage) bHomepage.onclick = () => { closeMobileSidebar(); renderHomepageBlocks(); };
if (bBackup) bBackup.onclick = () => { closeMobileSidebar(); renderBackup(); };

// Periodic badge updates for admin support
setInterval(updateAdminBadges, 25000);
setTimeout(updateAdminBadges, 1000);

let lastAdminToggleTime = 0;
function toggleAdminSidebar(e) {
  const now = Date.now();
  if (now - lastAdminToggleTime < 250) return;
  lastAdminToggleTime = now;

  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;

  const isMobileOrTablet = window.innerWidth <= 1024;
  const isOpen = sidebar.classList.contains('open') || sidebar.classList.contains('mobile-open');

  if (isMobileOrTablet) {
    if (isOpen) {
      sidebar.classList.remove('open', 'mobile-open');
      if (backdrop) backdrop.classList.remove('visible');
    } else {
      sidebar.classList.add('open', 'mobile-open');
      if (backdrop) backdrop.classList.add('visible');
    }
  } else {
    // Desktop: toggle collapsed state
    document.body.classList.toggle('sidebar-collapsed');
    sidebar.classList.remove('open', 'mobile-open');
    if (backdrop) backdrop.classList.remove('visible');
  }
}
window.toggleAdminSidebar = toggleAdminSidebar;

function closeMobileSidebar(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) {
    sidebar.classList.remove('open', 'mobile-open');
  }
  if (backdrop) {
    backdrop.classList.remove('visible');
  }
}
window.closeMobileSidebar = closeMobileSidebar;

// Sidebar toggle button listener
const mobBtn = document.getElementById('mobileMenuBtn');
if (mobBtn) {
  mobBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAdminSidebar(e);
  });
}

// Sidebar close button inside header
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
if (sidebarCloseBtn) {
  sidebarCloseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMobileSidebar();
  });
}

// Backdrop overlay click
const sidebarBackdropEl = document.getElementById('sidebarBackdrop');
if (sidebarBackdropEl) {
  sidebarBackdropEl.addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileSidebar();
  });
}

// Click outside sidebar on mobile/tablet to close
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('appSidebar');
  const toggleBtn = document.getElementById('mobileMenuBtn');
  if (window.innerWidth <= 1024 && sidebar && (sidebar.classList.contains('open') || sidebar.classList.contains('mobile-open'))) {
    if (!sidebar.contains(e.target) && !toggleBtn?.contains(e.target)) {
      closeMobileSidebar();
    }
  }
});

// Close drawer on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMobileSidebar();
  }
});

// Initial auth check and render
async function initAdmin() {
  const isAuth = await checkAdminAuth();
  if (isAuth) {
    updateStorageBadge();
    renderTests();
  }
}
initAdmin();
