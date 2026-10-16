/**
 * Akylman Quiz Bowl - Shared App Utilities
 * Toast notifications, non-blocking modal dialogs, API client, and draft manager.
 */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- 1. Toast Notification System ---
const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.id = 'akylman-toast-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 3500) {
    this.init();

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type} toast-enter`;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };

    const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="${isKy ? 'Жабуу' : 'Close'}">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 300);
    };

    closeBtn.addEventListener('click', dismiss);
    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  },

  success(msg, dur) {
    this.show(msg, 'success', dur);
  },
  error(msg, dur) {
    this.show(msg, 'error', dur || 4500);
  },
  warning(msg, dur) {
    this.show(msg, 'warning', dur);
  },
  info(msg, dur) {
    this.show(msg, 'info', dur);
  },
};

// --- 2. Custom Modal Confirm Dialog ---
function showConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  isDestructive = false,
}) {
  return new Promise((resolve) => {
    const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
    const cleanTitle = title || (isKy ? 'Тастыктоо' : 'Confirmation');
    const cleanMessage = message || (isKy ? 'Ишеничтесизби?' : 'Are you sure?');
    const cleanConfirm = confirmText || (isKy ? 'Ооба' : 'Confirm');
    const cleanCancel = cancelText || (isKy ? 'Жокко чыгаруу' : 'Cancel');

    // Remove existing if any
    const existing = document.getElementById('akylman-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'akylman-confirm-modal';
    modal.className = 'custom-modal-overlay';
    modal.innerHTML = `
      <div class="custom-modal-card" role="dialog" aria-modal="true">
        <h3 class="custom-modal-title">${cleanTitle}</h3>
        <div class="custom-modal-body">${cleanMessage}</div>
        <div class="custom-modal-actions">
          <button class="btn btn-secondary modal-cancel-btn">${cleanCancel}</button>
          <button class="btn ${isDestructive ? 'btn-danger' : 'btn-primary'} modal-confirm-btn">${cleanConfirm}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cancelBtn = modal.querySelector('.modal-cancel-btn');
    const confirmBtn = modal.querySelector('.modal-confirm-btn');

    const cleanup = (val) => {
      modal.classList.add('modal-exit');
      setTimeout(() => modal.remove(), 200);
      resolve(val);
    };

    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cleanup(false);
    });

    confirmBtn.focus();
  });
}

// --- 3. Unified API Client ---
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: options.credentials || 'include',
  };

  try {
    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
      const errorMsg = (data && data.error) ? data.error : (isKy ? `Сервер катасы (${res.status})` : `Server error (${res.status})`);
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    throw err;
  }
}

// --- 4. Quiz Draft Manager (Local Storage Auto-Save) ---
const DraftManager = {
  getKey(testId) {
    const teamId = localStorage.getItem('team_id') || 'active_team';
    return `quiz_draft_${teamId}_${testId}`;
  },

  save(testId, answers) {
    try {
      const key = this.getKey(testId);
      localStorage.setItem(key, JSON.stringify({
        answers,
        updatedAt: Date.now(),
      }));
    } catch (e) {
      console.warn('Draft save error:', e);
    }
  },

  load(testId) {
    try {
      const key = this.getKey(testId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  clear(testId) {
    try {
      const key = this.getKey(testId);
      localStorage.removeItem(key);
    } catch (e) {}
  },
};

window.escapeHtml = escapeHtml;
window.Toast = Toast;
window.showConfirmDialog = showConfirmDialog;
window.apiFetch = apiFetch;
window.DraftManager = DraftManager;
