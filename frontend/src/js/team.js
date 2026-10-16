
// Security: Anti-inspection and test integrity protection
document.addEventListener("contextmenu", function(e) {
  if (document.querySelector(".quiz-sticky-hud") || document.querySelector(".question-block")) {
    e.preventDefault();
    return false;
  }
});

document.addEventListener("keydown", function(e) {
  if (
    e.key === "F12" ||
    ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U" || e.key === "s" || e.key === "S")) ||
    ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c"))
  ) {
    if (document.querySelector(".quiz-sticky-hud") || document.querySelector(".question-block")) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }
});


// Token is now handled via httpOnly cookies or Authorization header
let teamData = null;

// Функция для получения переводов
function t(key) {
  if (typeof AkylI18n !== 'undefined' && AkylI18n.t) {
    return AkylI18n.t(key);
  }
  return key;
}

const ALLOWED_CLASSES = [
  '7-A', '7-B', '7-C',
  '8-A', '8-B', '8-C',
  '9-A', '9-B', '9-C'
];

function buildClassSelectOptions(selectedClass = '', isKy = false) {
  const placeholder = isKy ? 'Классты тандаңыз' : 'Select grade';
  let html = `<option value="">-- ${placeholder} * --</option>`;
  const trimmed = String(selectedClass || '').trim();
  ALLOWED_CLASSES.forEach(c => {
    const isSel = String(c).toUpperCase() === trimmed.toUpperCase();
    html += `<option value="${c}" ${isSel ? 'selected' : ''}>${c}</option>`;
  });
  return html;
}

function updateTeamNameHeader() {
  const teamNameHeader = document.getElementById('teamNameHeader');
  const avatarEl = document.getElementById('sidebarTeamAvatar');
  const catEl = document.getElementById('sidebarCategoryLabel');

  if (teamData) {
    const tName = teamData.team_name || 'Команда';
    if (teamNameHeader) teamNameHeader.textContent = tName;
    const teamNameSidebar = document.getElementById('teamNameSidebar');
    if (teamNameSidebar) teamNameSidebar.textContent = tName;
    if (avatarEl) {
      avatarEl.textContent = tName.trim().charAt(0).toUpperCase();
    }
    if (catEl) {
      const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
      const isKy = lang === 'ky';
      const catName = isKy
        ? (teamData.category_name_ky || teamData.category_name_en || teamData.category_name_ru)
        : (teamData.category_name_en || teamData.category_name_ru || teamData.category_name_ky);
      catEl.textContent = catName || (isKy ? 'Турнирдин катышуучусу' : 'Tournament Participant');
    }
  }
}

async function load() {
  try {
    const data = await apiFetch('/api/me');
    if (!data || !data.ok || !data.team) {
      localStorage.removeItem('token');
      localStorage.removeItem('team');
      location.href = '/login';
      return;
    }
    teamData = data.team;
    localStorage.setItem('team', JSON.stringify(teamData));
    if (teamData.id) localStorage.setItem('team_id', String(teamData.id));
    updateTeamNameHeader();
    try {
      await renderHomeSection(document.getElementById('tabHome'));
    } catch (renderErr) {
      console.error('Initial render error:', renderErr);
    }
  } catch (e) {
    console.warn('Session check warning:', e);
    // If unauthorized / token error, clear and redirect to login
    if (e.status === 401 || e.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('team');
      location.href = '/login';
      return;
    }
    // Otherwise try cached profile
    const cached = localStorage.getItem('team');
    if (cached) {
      try {
        teamData = JSON.parse(cached);
        updateTeamNameHeader();
        renderHomeSection(document.getElementById('tabHome')).catch(() => {});
      } catch (err) {}
    } else {
      location.href = '/login';
    }
  }
}

async function updateSidebarCounters() {
  try {
    const [annRes, supRes] = await Promise.all([
      apiFetch('/api/announcements').catch(() => null),
      apiFetch('/api/team/support/tickets').catch(() => null)
    ]);
    if (annRes && annRes.announcements) {
      const aCount = annRes.announcements.length;
      const aBadge = document.getElementById('sidebarAnnouncementsBadge');
      if (aBadge) {
        if (aCount > 0) {
          aBadge.textContent = String(aCount);
          aBadge.style.display = 'inline-block';
        } else {
          aBadge.style.display = 'none';
        }
      }
    }
    if (supRes && supRes.tickets) {
      const activeTickets = supRes.tickets.filter(t => t.status !== 'resolved').length;
      const sBadge = document.getElementById('sidebarSupportBadge');
      if (sBadge) {
        if (activeTickets > 0) {
          sBadge.textContent = String(activeTickets);
          sBadge.style.display = 'inline-block';
        } else {
          sBadge.style.display = 'none';
        }
      }
    }
  } catch (e) {}
}

load().then(() => updateSidebarCounters());

document.getElementById('logout').onclick = async () => {
  const isKy = window.AkylI18n.getLang() === 'ky';
  const confirmed = await showConfirmDialog({
    title: isKy ? 'Аккаунттан чыгуу' : 'Log Out',
    message: isKy ? 'Чын эле команданын кабинетинен чыгууну каалайсызбы?' : 'Are you sure you want to log out of the team cabinet?',
    confirmText: isKy ? 'Чыгуу' : 'Log Out',
    cancelText: isKy ? 'Жокко чыгаруу' : 'Cancel',
    isDestructive: true,
  });
  if (confirmed) {
    try {
      console.log('Logout API call started');
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      console.log('Logout API call finished');
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('team');
    localStorage.removeItem('team_id');
    location.href = '/';
  }
};

function setActiveTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    btn.setAttribute('tabindex', '0');
    document.getElementById('tabContent')?.setAttribute('aria-labelledby', btn.id);
  }

  // Update topbar section title with bilingual support
  const topbarTitle = document.getElementById('topbarSectionTitle');
  if (topbarTitle && btn) {
    const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
    const isKy = lang === 'ky';
    const titles = {
      tabHome: isKy ? 'Кабинетти карап чыгуу' : 'Cabinet Overview',
      tabTests: isKy ? 'Жеткиликтүү онлайн-тесттер' : 'Available Online Tests',
      tabResults: isKy ? 'Тесттин жыйынтыктары' : 'Testing Results',
      tabLeaderboard: isKy ? 'Турнирдин рейтинги' : 'Leaderboard',
      tabAnnouncements: isKy ? 'Кулактандыруулар жана жаңылыктар' : 'Announcements & Updates',
      tabSupport: isKy ? 'Команданы колдоо кызматы' : 'Team Support & Help Desk',
      tabRules: isKy ? 'Регламент жана эрежелер' : 'Tournament Regulations & Rules',
      tabSettings: isKy ? 'Команданын жөндөөлөрү жана паспорту' : 'Team Settings & Passport',
    };
    topbarTitle.textContent = titles[btn.id] || (isKy ? 'Команданын кабинети' : 'Team Cabinet');
  }

  // Close mobile sidebar if open
  document.getElementById('appSidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('visible');
}

// Mobile sidebar toggle handler
const toggleMobileSidebar = () => {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
    if (backdrop) backdrop.classList.toggle('visible', sidebar.classList.contains('mobile-open'));
  }
};

const closeMobileSidebar = () => {
  document.getElementById('appSidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop')?.classList.remove('visible');
};

document.getElementById('mobileMenuBtn')?.addEventListener('click', toggleMobileSidebar);
document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeMobileSidebar);
document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);

// Close mobile sidebar on click outside
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('appSidebar');
  const toggleBtn = document.getElementById('mobileMenuBtn');
  if (sidebar?.classList.contains('mobile-open') && !sidebar.contains(e.target) && !toggleBtn?.contains(e.target)) {
    closeMobileSidebar();
  }
});

async function renderHomeSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div class="app-skeleton" style="height: 110px; width: 100%;"></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="app-skeleton" style="height: 300px;"></div>
        <div class="app-skeleton" style="height: 300px;"></div>
      </div>
    </div>
  `;
  
  if (!teamData) {
    try {
      const j = await apiFetch('/api/me');
      if (j.ok && j.team) {
        teamData = j.team;
        updateTeamNameHeader();
      }
    } catch (err) {
      console.error(err);
      out.setAttribute('aria-busy', 'false');
      out.innerHTML = '<div class="modern-empty-state"><p style="color: var(--app-rose);">Ошибка загрузки данных. Пожалуйста, обновите страницу.</p></div>';
      return;
    }
  }
  
  out.setAttribute('aria-busy', 'false');
  
  if (teamData) {
    const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
    const isKy = lang === 'ky';

    // Calculate total participants: participant list
    const membersList = Array.isArray(teamData.members) 
      ? teamData.members.filter(m => m && (m.name || m.class)) 
      : [];

    let categoryLabel = '';
    if (teamData.category_name_en || teamData.category_name_ru || teamData.category_name_ky) {
      categoryLabel = isKy
        ? (teamData.category_name_ky || teamData.category_name_en || teamData.category_name_ru || '')
        : (teamData.category_name_en || teamData.category_name_ru || teamData.category_name_ky || '');
    } else if (teamData.category_id) {
      categoryLabel = 'ID: ' + teamData.category_id;
    }

    const branchVal = teamData.city || teamData.school || (isKy ? 'Талас' : 'Талас');

    // Build member rows - strictly showing ONLY participant's class
    const displayList = membersList.length >= 2 
      ? membersList 
      : [
          membersList[0] || { name: (isKy ? '1-катышуучу' : 'Member 1'), class: '' },
          membersList[1] || { name: (isKy ? '2-катышуучу' : 'Member 2'), class: '' }
        ];

    const totalCount = membersList.length || displayList.length;

    let membersHtml = displayList.map((m, idx) => {
      const memNum = idx + 1;
      const memName = escapeHtml(m.name || (isKy ? `${memNum}-катышуучу` : `Member ${memNum}`));
      const memClass = m.class ? escapeHtml(m.class) : '';
      const classDisplay = memClass 
        ? `${memClass} ${isKy ? 'класс' : 'grade'}` 
        : (isKy ? 'Классы көрсөтүлгөн эмес' : 'Grade not specified');

      return `
        <div class="member-item-row">
          <div class="member-person-meta">
            <span class="member-index-badge">${memNum}</span>
            <div>
              <div class="member-name-text">${memName}</div>
              <div style="font-size: 12.5px; color: var(--app-primary); font-weight: 600; margin-top: 2px;">
                ${classDisplay}
              </div>
            </div>
          </div>
          <span style="font-size: 12px; font-weight: 600; color: var(--app-primary-dark); background: var(--app-primary-light); border: 1px solid var(--app-primary-border); padding: 4px 12px; border-radius: 9999px;">${isKy ? `${memNum}-катышуучу` : `Member ${memNum}`}</span>
        </div>
      `;
    }).join('');

    out.innerHTML = `
      <!-- Welcome Hero Banner -->
      <div class="dashboard-hero-card">
        <div class="hero-content">
          <div class="hero-text-block">
            <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 14px; background:var(--app-primary-light); border:1px solid var(--app-primary-border); border-radius:9999px; color:var(--app-primary-dark); font-size:12.5px; font-weight:700; margin-bottom:12px;">
              <span>🏆</span>
              <span>Akylman Quiz Bowl</span>
            </div>
            <h2>«${escapeHtml(teamData.team_name || 'Команда')}»</h2>
            <ul class="hero-bullet-list">
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Филиал:' : 'Branch:'}</strong> ${escapeHtml(branchVal)}</span>
              </li>
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Категория:' : 'Category:'}</strong> ${escapeHtml(categoryLabel || (isKy ? 'Негизги' : 'Main'))}</span>
              </li>
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Катышуучулардын саны:' : 'Number of participants:'}</strong> ${totalCount}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Quick Navigation Hub: Light Pastel Blue & Soft Champagne Gold -->
      <div class="quick-hub-section">
        <div class="quick-hub-header">
          <span>⚡</span>
          <span>${isKy ? 'Негизги бөлүмдөр' : 'Quick Navigation'}</span>
        </div>
        <div class="quick-hub-grid">
          <!-- Card 1: Tests -->
          <div class="quick-hub-card" id="hubTileTests" role="button" tabindex="0">
            <div class="quick-hub-card-body">
              <div class="quick-hub-icon">📝</div>
              <div>
                <h4 class="quick-hub-title">${isKy ? 'Тестирлөө' : 'Online Testing'}</h4>
                <p class="quick-hub-desc">${isKy ? 'Олимпиаданын тесттерин тапшыруу' : 'Available league tests'}</p>
              </div>
            </div>
            <div class="quick-hub-action-row">
              <span class="quick-hub-btn">${isKy ? 'Тесттерге өтүү →' : 'Go to tests →'}</span>
            </div>
          </div>

          <!-- Card 2: Results -->
          <div class="quick-hub-card" id="hubTileResults" role="button" tabindex="0">
            <div class="quick-hub-card-body">
              <div class="quick-hub-icon">📊</div>
              <div>
                <h4 class="quick-hub-title">${isKy ? 'Жыйынтыктар' : 'Results'}</h4>
                <p class="quick-hub-desc">${isKy ? 'Упайлар жана сынак статистикасы' : 'Scores and answer statistics'}</p>
              </div>
            </div>
            <div class="quick-hub-action-row">
              <span class="quick-hub-btn">${isKy ? 'Жыйынтыктарды көрүү →' : 'View results →'}</span>
            </div>
          </div>

          <!-- Card 3: Leaderboard -->
          <div class="quick-hub-card" id="hubTileLeaderboard" role="button" tabindex="0">
            <div class="quick-hub-card-body">
              <div class="quick-hub-icon">🏆</div>
              <div>
                <h4 class="quick-hub-title">${isKy ? 'Турнирдин рейтинги' : 'Leaderboard'}</h4>
                <p class="quick-hub-desc">${isKy ? 'Жалпы таблица жана орундар' : 'Tournament team rankings'}</p>
              </div>
            </div>
            <div class="quick-hub-action-row">
              <span class="quick-hub-btn">${isKy ? 'Рейтингди ачуу →' : 'Open leaderboard →'}</span>
            </div>
          </div>

          <!-- Card 4: Rules -->
          <div class="quick-hub-card" id="hubTileRules" role="button" tabindex="0">
            <div class="quick-hub-card-body">
              <div class="quick-hub-icon">📜</div>
              <div>
                <h4 class="quick-hub-title">${isKy ? 'Регламент жана эрежелер' : 'Tournament Regulations & Rules'}</h4>
                <p class="quick-hub-desc">${isKy ? 'Сынактын расмий тартиби' : 'Official rules and regulations'}</p>
              </div>
            </div>
            <div class="quick-hub-action-row">
              <span class="quick-hub-btn">${isKy ? 'Эрежелерди окуу →' : 'Read rules →'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Two Clean Cards: Team Members & Quick Passport -->
      <div class="dashboard-content-grid" style="margin-bottom: 24px;">
        <!-- Card 1: Team Members -->
        <div class="app-card card-blue-top">
          <div class="app-card-header">
            <h3 class="app-card-title">
              <span>👥</span>
              <span>${isKy ? `Команданын курамы (${totalCount})` : `Team Roster (${totalCount})`}</span>
            </h3>
            <button type="button" class="app-card-action-btn" id="openSettingsMembersBtn">
              ⚙️ ${isKy ? 'Өзгөртүү' : 'Edit'}
            </button>
          </div>
          <div class="members-flow-grid">
            ${membersHtml}
          </div>
        </div>

        <!-- Card 2: Team Passport Overview -->
        <div class="app-card card-gold-top">
          <div class="app-card-header">
            <h3 class="app-card-title">
              <span>📋</span>
              <span>${isKy ? 'Команданын паспорту' : 'Team Passport'}</span>
            </h3>
            <button type="button" class="app-card-action-btn" id="openSettingsPassportBtn">
              ⚙️ ${isKy ? 'Настройкалар' : 'Settings'}
            </button>
          </div>
          <div class="info-row-list">
            <div class="info-row">
              <span class="info-row-label">🏷️ ${isKy ? 'Команданын аты:' : 'Team Name:'}</span>
              <span class="info-row-value">${escapeHtml(teamData.team_name || '')}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">📍 ${isKy ? 'Филиал:' : 'Branch:'}</span>
              <span class="info-row-value">${escapeHtml(branchVal)}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">🏆 ${isKy ? 'Категория:' : 'Category:'}</span>
              <span class="info-row-value">${escapeHtml(categoryLabel || (isKy ? 'Негизги' : 'Main'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">✉️ ${isKy ? 'Почта:' : 'Login Email:'}</span>
              <span class="info-row-value">${escapeHtml(teamData.email || '')}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach click actions
    document.getElementById('hubTileTests')?.addEventListener('click', () => {
      document.getElementById('tabTests')?.click();
    });
    document.getElementById('hubTileResults')?.addEventListener('click', () => {
      document.getElementById('tabResults')?.click();
    });
    document.getElementById('hubTileLeaderboard')?.addEventListener('click', () => {
      document.getElementById('tabLeaderboard')?.click();
    });
    document.getElementById('hubTileRules')?.addEventListener('click', () => {
      document.getElementById('tabRules')?.click();
    });
    document.getElementById('openSettingsMembersBtn')?.addEventListener('click', () => {
      document.getElementById('tabSettings')?.click();
    });
    document.getElementById('openSettingsPassportBtn')?.addEventListener('click', () => {
      document.getElementById('tabSettings')?.click();
    });
  } else {
    out.innerHTML = '<div class="modern-empty-state"><p data-i18n="team.loading">Загрузка...</p></div>';
  }
  
  if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
    AkylI18n.applyI18n(AkylI18n.getLang(), out);
  }
}

// Cached categories for settings dropdown
let cachedCategoriesList = null;
async function fetchCategoriesList(force = false) {
  if (!force && cachedCategoriesList && cachedCategoriesList.length) return cachedCategoriesList;
  try {
    const res = await fetch('/api/categories', { cache: 'no-store' });
    if (res.ok) {
      cachedCategoriesList = await res.json();
    }
  } catch (e) {
    console.error('Failed to load categories', e);
  }
  return cachedCategoriesList || [];
}

// Dedicated Settings Section (Team Passport & Roster Management)
async function renderSettingsSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div class="app-skeleton" style="height: 90px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 380px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 250px; width: 100%;"></div>
    </div>
  `;

  if (!teamData) {
    try {
      const j = await apiFetch('/api/me');
      if (j.ok && j.team) {
        teamData = j.team;
        updateTeamNameHeader();
      }
    } catch (err) {
      console.error(err);
      out.setAttribute('aria-busy', 'false');
      out.innerHTML = '<div class="modern-empty-state"><p style="color: var(--app-rose);">Ошибка загрузки данных.</p></div>';
      return;
    }
  }

  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';
  const categories = await fetchCategoriesList(true);

  out.setAttribute('aria-busy', 'false');

  const membersList = Array.isArray(teamData.members) 
    ? teamData.members.filter(m => m && (m.name || m.class)) 
    : [];

  const member1Name = membersList.length > 0 ? (membersList[0].name || '') : '';
  const member1Class = membersList.length > 0 ? (membersList[0].class || '') : '';
  const member2Name = membersList.length > 1 ? (membersList[1].name || '') : '';
  const member2Class = membersList.length > 1 ? (membersList[1].class || '') : '';

  // Build categories select options
  const categoryOptions = categories.map(c => {
    const isSelected = String(c.id) === String(teamData.category_id);
    const catName = isKy ? (c.name_ky || c.name_en || c.name_ru) : (c.name_en || c.name_ru || c.name_ky);
    return `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(catName)}</option>`;
  }).join('');

  // Extra members HTML (starting from index 2 in membersList, which is member 3+)
  let extraMembersHtml = '';
  if (membersList.length > 2) {
    for (let i = 2; i < membersList.length; i++) {
      const m = membersList[i];
      const memNum = i + 1;
      extraMembersHtml += `
        <div class="settings-member-box extra-member-item" data-index="${memNum}">
          <div class="settings-member-top">
            <span style="font-size: 14px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 8px;">
              <span class="member-index-badge equal-badge" style="width: 26px; height: 26px; font-size: 12px;">${memNum}</span>
              <span>${isKy ? `${memNum}-катышуучу` : `Member ${memNum}`}</span>
            </span>
            <button type="button" class="btn-remove-extra-member" style="background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); color: #f43f5e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
              🗑️ ${isKy ? 'Өчүрүү' : 'Remove'}
            </button>
          </div>
          <div class="settings-grid">
            <div class="settings-field">
              <label class="settings-label">${isKy ? 'Аты-жөнү' : 'ФИО участника'} <span style="color:#ef4444">*</span></label>
              <input type="text" class="settings-input extra-mem-name" placeholder="${isKy ? 'Асанов Үсөн' : 'Иванов Иван Иванович'}" value="${escapeHtml(m.name || '')}"/>
            </div>
            <div class="settings-field">
              <label class="settings-label">${isKy ? 'Классы' : 'Grade'} <span style="color:#ef4444">*</span></label>
              <select class="settings-select extra-mem-class" required>
                ${buildClassSelectOptions(m.class || '', isKy)}
              </select>
            </div>
          </div>
        </div>
      `;
    }
  }

  out.innerHTML = `
    <div class="settings-container">
      
      <!-- Settings Header Banner -->
      <div class="settings-header-card">
        <div>
          <h2 class="settings-header-title">⚙️ ${t('team.settings_title')}</h2>
          <p class="settings-header-desc">
            ${t('team.settings_subtitle')}
          </p>
        </div>
        <div>
          <span style="font-size: 12.5px; background: var(--app-primary-light); border: 1px solid var(--app-primary-border); color: var(--app-primary-dark); padding: 6px 14px; border-radius: 9999px; font-weight: 700;">
            ${t('team.team_id')}: ${teamData.id || ''}
          </span>
        </div>
      </div>

      <!-- Card 1: Team Passport (Full Editing) -->
      <div class="settings-card card-blue-top">
        <div class="settings-card-header">
          <h3 class="settings-card-title">
            <span>📋</span>
            <span>${t('team.passport_card_title')}</span>
          </h3>
          <span style="font-size: 12px; color: var(--app-text-muted);">${t('team.passport_editable')}</span>
        </div>

        <div class="settings-grid" style="margin-bottom: 20px;">
          <!-- Team Name -->
          <div class="settings-field">
            <label class="settings-label" for="setTeamName">
              <span>🏷️ ${t('team.team_name')}</span>
              <span style="color:#ef4444">*</span>
            </label>
            <input type="text" id="setTeamName" class="settings-input" value="${escapeHtml(teamData.team_name || '')}" placeholder="${isKy ? 'Мисалы: Шумкарлар' : 'e.g. Shumkarlar'}" required/>
          </div>

          <!-- Category -->
          <div class="settings-field">
            <label class="settings-label" for="setCategoryId">
              <span>🏆 ${t('team.category')}</span>
              <span style="color:#ef4444">*</span>
            </label>
            <select id="setCategoryId" class="settings-select">
              <option value="">${isKy ? 'Категорияны тандаңыз' : 'Select category'}</option>
              ${categoryOptions}
            </select>
          </div>

          <!-- Branch -->
          <div class="settings-field">
            <label class="settings-label" for="setBranch">
              <span>📍 ${t('register.branch')}</span>
              <span style="color:#ef4444">*</span>
            </label>
            <select id="setBranch" class="settings-select">
              <option value="Талас" ${(teamData.city === 'Талас' || teamData.school === 'Талас') ? 'selected' : ''}>Талас</option>
              <option value="Манас" ${(teamData.city === 'Манас' || teamData.school === 'Манас') ? 'selected' : ''}>Манас</option>
              <option value="Чолпон-Ата" ${(teamData.city === 'Чолпон-Ата' || teamData.school === 'Чолпон-Ата') ? 'selected' : ''}>Чолпон-Ата</option>
            </select>
          </div>

          <!-- Email -->
          <div class="settings-field">
            <label class="settings-label" for="setEmail">
              <span>✉️ ${t('team.email')}</span>
              <span style="color:#ef4444">*</span>
            </label>
            <input type="email" id="setEmail" class="settings-input" value="${escapeHtml(teamData.email || '')}" placeholder="example@email.com" required/>
          </div>
        </div>
      </div>

      <!-- Card 2: Team Members -->
      <div class="settings-card card-blue-top">
        <div class="settings-card-header">
          <div>
            <h3 class="settings-card-title">
              <span>👥</span>
              <span>${t('team.members')}</span>
            </h3>
            <div style="font-size: 12.5px; color: var(--app-text-muted); margin-top: 4px;">
              ${t('team.members_composition_note')}
            </div>
          </div>
          <button type="button" id="btnAddExtraMember" class="app-card-action-btn" style="background:#eff6ff; color:#1e40af; border-color:#bfdbfe; font-size:13px; padding:7px 14px;">
            + ${t('team.add_member')}
          </button>
        </div>

        <div id="settingsMembersListContainer">
          <!-- Participant 1 -->
          <div class="settings-member-box" style="border-left: 4px solid #3b82f6;">
            <div class="settings-member-top">
              <span style="font-size: 14.5px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 8px;">
                <span class="member-index-badge equal-badge" style="width: 26px; height: 26px; font-size: 12px; background:#3b82f6; color:#ffffff;">1</span>
                <span>${isKy ? '1-катышуучу' : 'Member 1'}</span>
              </span>
            </div>
            <div class="settings-grid">
              <div class="settings-field">
                <label class="settings-label" for="setMem1Name">
                  ${t('team.member_name')} <span style="color:#ef4444">*</span>
                </label>
                <input type="text" id="setMem1Name" class="settings-input" placeholder="${isKy ? 'Асанов Үсөн' : 'Иванов Иван Иванович'}" value="${escapeHtml(member1Name)}" required/>
              </div>
              <div class="settings-field">
                <label class="settings-label" for="setMem1Class">
                  ${t('team.member_class')} <span style="color:#ef4444">*</span>
                </label>
                <select id="setMem1Class" class="settings-select" required>
                  ${buildClassSelectOptions(member1Class, isKy)}
                </select>
              </div>
            </div>
          </div>

          <!-- Participant 2 -->
          <div class="settings-member-box" style="border-left: 4px solid #3b82f6;">
            <div class="settings-member-top">
              <span style="font-size: 14.5px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 8px;">
                <span class="member-index-badge equal-badge" style="width: 26px; height: 26px; font-size: 12px; background:#3b82f6; color:#ffffff;">2</span>
                <span>${isKy ? '2-катышуучу' : 'Member 2'}</span>
              </span>
            </div>
            <div class="settings-grid">
              <div class="settings-field">
                <label class="settings-label" for="setMem2Name">
                  ${t('team.member_name')} <span style="color:#ef4444">*</span>
                </label>
                <input type="text" id="setMem2Name" class="settings-input" placeholder="${isKy ? 'Беков Азамат' : 'Петров Петр Петрович'}" value="${escapeHtml(member2Name)}" required/>
              </div>
              <div class="settings-field">
                <label class="settings-label" for="setMem2Class">
                  ${t('team.member_class')} <span style="color:#ef4444">*</span>
                </label>
                <select id="setMem2Class" class="settings-select" required>
                  ${buildClassSelectOptions(member2Class, isKy)}
                </select>
              </div>
            </div>
          </div>

          <!-- Extra Members (3, 4) Container -->
          <div id="extraMembersContainer">
            ${extraMembersHtml}
          </div>
        </div>
      </div>

      <!-- Card 3: Security & Password -->
      <div class="settings-card">
        <div class="settings-card-header">
          <h3 class="settings-card-title">
            <span>🔐</span>
            <span>${t('team.security_title')}</span>
          </h3>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-size: 14px; font-weight: 600; color: var(--app-text-main); margin-bottom: 2px;">
              ${t('team.login_email_label')} <code>${escapeHtml(teamData.email || '')}</code>
            </div>
            <div style="font-size: 12.5px; color: var(--app-text-muted);">
              ${t('team.security_note')}
            </div>
          </div>
          <button type="button" id="settingsChangePassBtn" class="btn-hero-secondary" style="background:#f8fafc; border:1px solid #cbd5e1; color:var(--app-text-main);">
            🔐 ${t('team.change_password')}
          </button>
        </div>
      </div>

      <!-- Save Action Bar & Toast Feedback -->
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: flex-start; padding-top: 8px;">
        <div id="settingsStatusMsg" style="display: none; padding: 12px 18px; border-radius: 10px; font-size: 14px; font-weight: 600; width: 100%; box-sizing: border-box;"></div>
        
        <button type="button" id="saveSettingsBtn" class="btn-save-settings">
          <span>💾</span>
          <span>${t('team.save_all_settings')}</span>
        </button>
      </div>

    </div>
  `;

  // Attach dynamic handlers
  document.getElementById('settingsChangePassBtn')?.addEventListener('click', handlePasswordChange);

  // Add extra member handler
  document.getElementById('btnAddExtraMember')?.addEventListener('click', () => {
    const container = document.getElementById('extraMembersContainer');
    if (!container) return;
    const currentExtra = container.querySelectorAll('.extra-member-item').length;
    const totalNow = 2 + currentExtra;
    if (totalNow >= 4) {
      alert(isKy ? 'Эң көбү 4 катышуучу кошууга болот.' : 'Максимум 4 участника в команде.');
      return;
    }
    const nextNum = totalNow + 1;
    const div = document.createElement('div');
    div.className = 'settings-member-box extra-member-item';
    div.dataset.index = nextNum;
    div.innerHTML = `
      <div class="settings-member-top">
        <span style="font-size: 14px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 8px;">
          <span class="member-index-badge equal-badge" style="width: 26px; height: 26px; font-size: 12px;">${nextNum}</span>
          <span>${isKy ? `${nextNum}-катышуучу` : `Member ${nextNum}`}</span>
        </span>
        <button type="button" class="btn-remove-extra-member" style="background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); color: #f43f5e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
          🗑️ ${isKy ? 'Өчүрүү' : 'Удалить'}
        </button>
      </div>
      <div class="settings-grid">
        <div class="settings-field">
          <label class="settings-label">${isKy ? 'Аты-жөнү' : 'ФИО участника'} <span style="color:#ef4444">*</span></label>
          <input type="text" class="settings-input extra-mem-name" placeholder="${isKy ? 'Асанов Үсөн' : 'Иванов Иван Иванович'}"/>
        </div>
        <div class="settings-field">
          <label class="settings-label">${isKy ? 'Классы' : 'Grade'} <span style="color:#ef4444">*</span></label>
          <select class="settings-select extra-mem-class" required>
            ${buildClassSelectOptions('', isKy)}
          </select>
        </div>
      </div>
    `;
    div.querySelector('.btn-remove-extra-member')?.addEventListener('click', () => {
      div.remove();
    });
    container.appendChild(div);
  });

  // Attach remove buttons to existing extra members
  out.querySelectorAll('.btn-remove-extra-member').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.extra-member-item')?.remove();
    });
  });

  // Save settings handler
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveAllSettings);
}

function showSettingsMessage(text, isError) {
  const el = document.getElementById('settingsStatusMsg');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  if (isError) {
    el.style.background = '#fef2f2';
    el.style.border = '1px solid #fecaca';
    el.style.color = '#b91c1c';
  } else {
    el.style.background = '#f0fdf4';
    el.style.border = '1px solid #bbf7d0';
    el.style.color = '#15803d';
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveAllSettings() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  const teamName = document.getElementById('setTeamName')?.value.trim();
  const catId = document.getElementById('setCategoryId')?.value;
  const branch = document.getElementById('setBranch')?.value || 'Talas';
  const email = document.getElementById('setEmail')?.value.trim();

  const mem1Name = document.getElementById('setMem1Name')?.value.trim();
  const mem1Class = document.getElementById('setMem1Class')?.value.trim();
  const mem2Name = document.getElementById('setMem2Name')?.value.trim();
  const mem2Class = document.getElementById('setMem2Class')?.value.trim();

  if (!teamName) {
    showSettingsMessage(isKy ? 'Команданын атын жазыңыз' : 'Please specify a team name', true);
    document.getElementById('setTeamName')?.focus();
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showSettingsMessage(isKy ? 'Туура электрондук почтаны жазыңыз' : 'Please provide a valid email address', true);
    document.getElementById('setEmail')?.focus();
    return;
  }

  if (!mem1Name) {
    showSettingsMessage(isKy ? '1-катышуучунун аты-жөнүн жазыңыз' : 'Please enter full name of member #1', true);
    document.getElementById('setMem1Name')?.focus();
    return;
  }

  if (!mem1Class || !ALLOWED_CLASSES.includes(mem1Class)) {
    showSettingsMessage(isKy ? '1-катышуучунун классын тизмеден тандаңыз' : 'Please select grade for member #1 from list', true);
    document.getElementById('setMem1Class')?.focus();
    return;
  }

  if (!mem2Name) {
    showSettingsMessage(isKy ? '2-катышуучунун аты-жөнүн жазыңыз' : 'Please enter full name of member #2', true);
    document.getElementById('setMem2Name')?.focus();
    return;
  }

  if (!mem2Class || !ALLOWED_CLASSES.includes(mem2Class)) {
    showSettingsMessage(isKy ? '2-катышуучунун классын тизмеден тандаңыз' : 'Please select grade for member #2 from list', true);
    document.getElementById('setMem2Class')?.focus();
    return;
  }

  const members = [
    { name: mem1Name, class: mem1Class },
    { name: mem2Name, class: mem2Class }
  ];

  // Extra members (3, 4)
  let extraError = null;
  const extraInputs = document.querySelectorAll('.extra-member-item');
  extraInputs.forEach((row, rIdx) => {
    const memNum = rIdx + 3;
    const name = row.querySelector('.extra-mem-name')?.value.trim();
    const cls = row.querySelector('.extra-mem-class')?.value.trim();
    if (name || cls) {
      if (!name) {
        extraError = isKy ? `${memNum}-катышуучунун аты-жөнүн жазыңыз` : `Please enter full name of member #${memNum}`;
        return;
      }
      if (!cls || !ALLOWED_CLASSES.includes(cls)) {
        extraError = isKy ? `${memNum}-катышуучунун классын тизмеден тандаңыз` : `Please select grade for member #${memNum} from list`;
        return;
      }
      members.push({ name: name || '', class: cls || '' });
    }
  });

  if (extraError) {
    showSettingsMessage(extraError, true);
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span>⏳</span> <span>${isKy ? 'Сакталууда...' : 'Saving...'}</span>`;
    }

    const payload = {
      team_name: teamName,
      category_id: catId ? parseInt(catId, 10) : null,
      school: branch,
      city: branch,
      branch: branch,
      email: email,
      members
    };

    const res = await apiFetch('/api/me', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res && res.ok && res.team) {
      teamData = res.team;
      localStorage.setItem('team', JSON.stringify(teamData));
      updateTeamNameHeader();
      showSettingsMessage(isKy ? '✓ Өзгөртүүлөр ийгиликтүү сакталды!' : '✓ All changes saved successfully!', false);
    } else {
      showSettingsMessage(res.error || (isKy ? 'Өзгөртүүлөрдү сактоо мүмкүн болбоду' : 'Failed to save changes'), true);
    }
  } catch (err) {
    console.error(err);
    showSettingsMessage(err.message || (isKy ? 'Ката кетти' : 'An error occurred while saving'), true);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<span>💾</span> <span>${isKy ? 'Бардык өзгөртүүлөрдү сактоо' : 'Save All Changes'}</span>`;
    }
  }
}

// Функция для экранирования HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}



async function renderLeaderboardSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="app-skeleton" style="height: 100px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 320px; width: 100%;"></div>
    </div>
  `;

  try {
    const data = await apiFetch(`/api/leaderboard${teamData && teamData.category_id ? `?category_id=${encodeURIComponent(teamData.category_id)}` : ''}`);
    out.setAttribute('aria-busy', 'false');

    if (!data.published) {
      out.innerHTML = `
        <div class="modern-empty-state">
          <div class="modern-empty-icon">🔒</div>
          <h3 class="modern-empty-title">${isKy ? 'Рейтинг азырынча жарыялана элек' : 'Leaderboard is not published yet'}</h3>
          <p class="modern-empty-desc">${isKy ? 'Турнирдик таблица раунддун жыйынтыгы чыгарылгандан кийин уюштуруучулар тарабынан жарыяланат.' : 'Leaderboard will become available after round results are finalized by organizers.'}</p>
        </div>
      `;
      if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
        AkylI18n.applyI18n(AkylI18n.getLang(), out);
      }
      return;
    }

    const leaderboard = data.leaderboard || [];
    if (!leaderboard.length) {
      out.innerHTML = `
        <div class="modern-empty-state">
          <div class="modern-empty-icon">🏆</div>
          <h3 class="modern-empty-title">${isKy ? 'Рейтинг азырынча бош' : 'Leaderboard is empty'}</h3>
          <p class="modern-empty-desc">${isKy ? 'Командалар тесттерди тапшырып бүткөндөн кийин жыйынтыктар бул жерде пайда болот.' : 'Results will appear here immediately after the teams finish the tests.'}</p>
        </div>
      `;
      if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
        AkylI18n.applyI18n(AkylI18n.getLang(), out);
      }
      return;
    }

    function renderMedal(rank) {
      if (rank === 1) return '🥇 ';
      if (rank === 2) return '🥈 ';
      if (rank === 3) return '🥉 ';
      return '';
    }

    out.innerHTML = `
      <div class="app-card card-teal-top">
        <div class="app-card-header">
          <h3 class="app-card-title">
            <span>🏆</span>
            <span>${isKy ? 'Турнирдин рейтинги жана жыйынтыктары' : 'Турнирная таблица и рейтинг'}</span>
          </h3>
          <div style="font-size: 13px; font-weight: 600; color: var(--app-text-muted);">
            ${isKy ? 'Жалпы командалар:' : 'Total Teams:'} <strong>${leaderboard.length}</strong>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table class="results-modern-table">
            <thead>
              <tr>
                <th style="width: 70px;">${isKy ? 'Орун' : 'Rank'}</th>
                <th>${isKy ? 'Команда' : 'Team'}</th>
                <th>${isKy ? 'Филиал' : 'Branch'}</th>
                <th style="text-align: right;">${isKy ? 'Тесттер' : 'Tests'}</th>
                <th style="text-align: right;">${isKy ? 'Жалпы балл' : 'Total Score'}</th>
              </tr>
            </thead>
            <tbody>
              ${leaderboard.map((item) => {
                const isCurrentTeam = teamData && (Number(item.team_id || item.id) === Number(teamData.id) || item.team_name === teamData.team_name);
                const rowBg = isCurrentTeam ? 'background: rgba(13, 148, 136, 0.08); font-weight: 700;' : '';
                const branchVal = escapeHtml(item.branch || item.city || item.school || 'Талас');
                return `
                  <tr style="${rowBg}">
                    <td>
                      <span style="font-weight: 800; font-size: 14px;">${renderMedal(item.rank)}${item.rank}</span>
                    </td>
                    <td>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${escapeHtml(item.team_name || '—')}</span>
                        ${isCurrentTeam ? `<span style="font-size: 10px; background: #0d9488; color: #fff; padding: 1px 6px; border-radius: 999px;">${isKy ? 'Сиздер' : 'You'}</span>` : ''}
                      </div>
                    </td>
                    <td style="color: var(--app-text-muted); font-size: 13px;">${branchVal}</td>
                    <td style="text-align: right; color: var(--app-text-muted); font-size: 13px;">${item.tests_taken || 0}</td>
                    <td style="text-align: right;">
                      <span class="score-badge-circle">${item.total_score || 0}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
      AkylI18n.applyI18n(AkylI18n.getLang(), out);
    }
  } catch (err) {
    console.error(err);
    out.setAttribute('aria-busy', 'false');
    out.innerHTML = `
      <div class="modern-empty-state">
        <div class="modern-empty-icon">⚠️</div>
        <h3 class="modern-empty-title">${isKy ? 'Рейтингди жүктөөдө ката' : 'Failed to load leaderboard'}</h3>
        <p class="modern-empty-desc">${isKy ? 'Маалыматтарды алуу мүмкүн болбоду. Кайра аракет кылыңыз.' : 'Could not fetch leaderboard data. Please try again.'}</p>
        <button class="btn-hero-primary" onclick="renderLeaderboardSection()" style="margin-top: 14px;">${isKy ? 'Жаңылоо' : 'Refresh'}</button>
      </div>
    `;
  }
}

async function renderTestsSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px;">
      <div class="app-skeleton" style="height: 220px;"></div>
      <div class="app-skeleton" style="height: 220px;"></div>
    </div>
  `;
  
  try {
    let url = '/api/tests';
    if (teamData && teamData.category_id) {
      url += `?category_id=${encodeURIComponent(teamData.category_id)}`;
    }
    const tests = await apiFetch(url);
    out.setAttribute('aria-busy', 'false');
    
    // Update badge in sidebar
    const badgeEl = document.getElementById('sidebarTestsBadge');
    if (badgeEl) {
      badgeEl.textContent = tests.length;
      badgeEl.style.display = tests.length ? 'inline-block' : 'none';
    }

    if (!tests.length) {
      out.innerHTML = `
        <div class="modern-empty-state">
          <div class="modern-empty-icon">📝</div>
          <h3 class="modern-empty-title" data-i18n="team.no_tests">${isKy ? 'Азыркы учурда тесттер жок' : 'No tests currently available'}</h3>
          <p class="modern-empty-desc">${isKy ? 'Тесттер регламент жана жадыбалга ылайык жеткиликтүү болот.' : 'Tests will become available according to the tournament schedule and rules.'}</p>
        </div>
      `;
      if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
        AkylI18n.applyI18n(AkylI18n.getLang(), out);
      }
      return;
    }

    out.innerHTML = `
      <div style="margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 22px; font-weight: 800; color: var(--app-text-main); margin: 0 0 4px 0;">${isKy ? 'Жеткиликтүү онлайн-тесттер' : 'Available Online Tests'}</h2>
          <p style="font-size: 14px; color: var(--app-text-muted); margin: 0;">${isKy ? 'Тапшыруу үчүн тестти тандаңыз. Таймер баскычты баскандан кийин дароо эсептей баштайт.' : 'Select a test to begin. The countdown timer starts immediately once started.'}</p>
        </div>
        <div style="font-size: 13px; font-weight: 700; color: #0d9488; background: rgba(13,148,136,0.1); padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(13,148,136,0.25);">
          ${isKy ? 'Жалпы тесттер:' : 'Total tests:'} ${tests.length}
        </div>
      </div>

      <div class="tests-grid-container">
        ${tests.map((t) => {
          const status = t.auto_status || 'active';
          const labels = {
            scheduled: isKy ? 'Пландаштырылган' : 'Scheduled',
            active: isKy ? 'Жеткиликтүү' : 'Available',
            closed: isKy ? 'Жабык' : 'Closed'
          };
          const isDisabled = (status === 'scheduled' || status === 'closed');
          return `
            <div class="test-modern-card">
              <div class="test-card-top">
                <div class="test-card-badges">
                  <span class="test-category-tag">${escapeHtml(t.category_name || (isKy ? teamData.category_name_ky : (teamData.category_name_en || teamData.category_name_ru)) || 'Test')}</span>
                  <span class="test-status-pill status-${status}">${labels[status] || status}</span>
                </div>
                <h3 class="test-modern-title">${escapeHtml(t.title || (isKy ? 'Аталышсыз тест' : 'Untitled Test'))}</h3>
                ${t.description ? `<p class="test-modern-desc">${escapeHtml(t.description)}</p>` : ''}
              </div>

              <div>
                <div class="test-meta-pills">
                  <div class="test-meta-item">
                    <span>⏱️</span>
                    <span>${t.duration_minutes || 60} ${isKy ? 'мүн' : 'min'}</span>
                  </div>
                  <div class="test-meta-item">
                    <span>📅</span>
                    <span>${t.window_start ? t.window_start : (isKy ? 'Чектөөсүз' : 'No limits')}</span>
                  </div>
                </div>

                ${t.countdown_sec && t.countdown_sec > 0 ? `
                  <div style="font-size: 12px; color: var(--app-amber); font-weight: 600; margin-bottom: 12px; text-align: center;">
                    ⏳ ${isKy ? `Тест ${Math.floor(t.countdown_sec / 60)} мүн ${t.countdown_sec % 60} сек кийин башталат` : `Test starts in ${Math.floor(t.countdown_sec / 60)} min ${t.countdown_sec % 60} sec`}
                  </div>
                ` : ''}

                <button
                  data-id="${t.id}"
                  class="btn-start-test take"
                  type="button"
                  ${isDisabled ? 'disabled' : ''}>
                  <span>${isDisabled ? (isKy ? '🔒 Жеткиликсиз' : '🔒 Unavailable') : (isKy ? '🚀 Тестти баштоо' : '🚀 Start Test')}</span>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
      AkylI18n.applyI18n(AkylI18n.getLang(), out);
    }

    out.querySelectorAll('.take').forEach(b => {
      b.onclick = () => startTest(b.dataset.id);
    });
  } catch (err) {
    console.error(err);
    out.setAttribute('aria-busy', 'false');
    out.innerHTML = `
      <div class="modern-empty-state">
        <div class="modern-empty-icon">⚠️</div>
        <h3 class="modern-empty-title">${isKy ? 'Тесттерди жүктөөдө ката' : 'Failed to load tests'}</h3>
        <p class="modern-empty-desc">${isKy ? 'Серверден маалыматтарды алуу мүмкүн болбоду. Кайра аракет кылыңыз.' : 'Could not retrieve tests from server. Please try again.'}</p>
        <button class="btn-hero-primary" onclick="renderTestsSection()" style="margin-top: 14px;">${isKy ? 'Кайталоо' : 'Try Again'}</button>
      </div>
    `;
  }
}

async function renderResultsSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="app-skeleton" style="height: 90px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 280px; width: 100%;"></div>
    </div>
  `;

  try {
    const settings = await apiFetch('/api/settings');
    if (!settings || !settings.results_published) {
      out.setAttribute('aria-busy', 'false');
      out.innerHTML = `
        <div class="modern-empty-state">
          <div class="modern-empty-icon">🔒</div>
          <h3 class="modern-empty-title">${isKy ? 'Жыйынтыктар азырынча жарыялана элек' : 'Results Not Yet Published'}</h3>
          <p class="modern-empty-desc">${isKy ? 'Жыйынтыктар бардык катышуучулардын сессиялары текшерилгенден кийин уюштуруучулар тарабынан чыгарылат.' : 'Official results will be published by organizers after reviewing all sessions.'}</p>
        </div>
      `;
      if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
        AkylI18n.applyI18n(AkylI18n.getLang(), out);
      }
      return;
    }

    const rows = await apiFetch('/api/me/results');
    out.setAttribute('aria-busy', 'false');

    if (!rows.length) {
      out.innerHTML = `
        <div class="modern-empty-state">
          <div class="modern-empty-icon">📊</div>
          <h3 class="modern-empty-title" data-i18n="team.no_results">${isKy ? 'Жыйынтыктар жок' : 'No results yet'}</h3>
          <p class="modern-empty-desc">${isKy ? 'Сиздер азырынча бир да тест тапшыра элексиздер. Катышуу үчүн «Тесттер» бөлүмүнө өтүңүз.' : 'You have not completed any tests yet. Go to the Tests tab to participate.'}</p>
          <button class="btn-hero-primary" onclick="document.getElementById('tabTests').click()" style="margin-top: 16px;">
            <span>📝</span> ${isKy ? 'Тесттерге өтүү' : 'Go to Tests'}
          </button>
        </div>
      `;
      if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
        AkylI18n.applyI18n(AkylI18n.getLang(), out);
      }
      return;
    }

    function formatTimeTaken(sec) {
      if (!sec && sec !== 0) return '—';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m} ${isKy ? 'мүн' : 'min'} ${s} ${isKy ? 'сек' : 'sec'}`;
    }

    let totalScore = 0;
    rows.forEach(r => {
      const num = parseFloat(r.score) || 0;
      totalScore += num;
    });

    out.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="metrics-grid">
          <div class="metric-card card-blue" style="border-top: 3px solid #0284c7;">
            <div class="metric-icon-box">📊</div>
            <div class="metric-info">
              <span class="metric-label">${isKy ? 'Тапшырылган тесттер' : 'Tests Completed'}</span>
              <span class="metric-value">${rows.length}</span>
              <span class="metric-sub">${isKy ? 'Аяктаган сессиялар' : 'Finished sessions'}</span>
            </div>
          </div>

          <div class="metric-card card-green" style="border-top: 3px solid #10b981;">
            <div class="metric-icon-box">⭐</div>
            <div class="metric-info">
              <span class="metric-label">${isKy ? 'Жалпы балл' : 'Total Score'}</span>
              <span class="metric-value" style="color: #047857;">${totalScore}</span>
              <span class="metric-sub">${isKy ? 'Турнирдик эсепке упайлар' : 'Tournament rank points'}</span>
            </div>
          </div>
        </div>

        <div class="app-card card-teal-top">
          <div class="app-card-header">
            <h3 class="app-card-title">
              <span>📋</span>
              <span>${isKy ? 'Тесттин тарыхы жана жыйынтыктары' : 'Testing History & Results'}</span>
            </h3>
          </div>

          <div style="overflow-x: auto;">
            <table class="results-modern-table">
              <thead>
                <tr>
                  <th style="width: 50px;">№</th>
                  <th>${isKy ? 'Тест' : 'Test'}</th>
                  <th>${isKy ? 'Категория' : 'Category'}</th>
                  <th>${isKy ? 'Тапшырылган күнү' : 'Date'}</th>
                  <th>${isKy ? 'Убакыт' : 'Time'}</th>
                  <th style="text-align: right;">${isKy ? 'Баллдар' : 'Score'}</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r, idx) => `
                  <tr>
                    <td style="color: var(--app-text-muted); font-size: 13px;">${idx + 1}</td>
                    <td style="font-weight: 600;">${escapeHtml(r.test_title || r.title || 'Тест')}</td>
                    <td style="color: var(--app-text-muted); font-size: 13px;">${escapeHtml((isKy ? r.category_name_ky : r.category_name_ru) || r.category_name || (isKy ? 'Негизги' : 'Main'))}</td>
                    <td style="color: var(--app-text-muted); font-size: 13px;">${escapeHtml(r.taken_at_formatted || '—')}</td>
                    <td style="color: var(--app-text-muted); font-size: 13px;">${formatTimeTaken(r.time_taken_sec)}</td>
                    <td style="text-align: right;">
                      <span class="score-badge-circle">${r.score_display || r.score || '0'}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
      AkylI18n.applyI18n(AkylI18n.getLang(), out);
    }
  } catch (err) {
    console.error(err);
    out.setAttribute('aria-busy', 'false');
    out.innerHTML = `
      <div class="modern-empty-state">
        <div class="modern-empty-icon">⚠️</div>
        <h3 class="modern-empty-title">${isKy ? 'Жыйынтыктарды жүктөөдө ката' : 'Failed to load results'}</h3>
        <p class="modern-empty-desc">${isKy ? 'Интернет байланышын текшерип, кайра аракет кылыңыз.' : 'Please check your internet connection and try again.'}</p>
        <button class="btn-hero-primary" onclick="renderResultsSection()" style="margin-top: 14px;">${isKy ? 'Жаңылоо' : 'Refresh'}</button>
      </div>
    `;
  }
}

async function startTest(id) {
  const out = document.getElementById('tabContent');
  const runner = new QuizRunner({
    testId: id,
    container: out,
    onFinish: () => {
      renderResultsSection(document.getElementById('tabResults'));
    },
    onCancel: () => {
      renderTestsSection(document.getElementById('tabTests'));
    },
  });
  await runner.start();
}

// Editing profile fields (except email)
let currentEditField = null;

function handleInlineEdit(field) {
  if (!teamData) return;
  
  currentEditField = field;
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  
  const fieldNames = {
    team_name: { label: isKy ? 'Команданын аталышы' : 'Team Name', title: isKy ? 'Өзгөртүү' : 'Edit' },
    branch: { label: isKy ? 'Филиал' : 'Branch', title: isKy ? 'Өзгөртүү' : 'Edit' }
  };
  
  const fieldInfo = fieldNames[field] || { label: field, title: isKy ? 'Өзгөртүү' : 'Edit' };
  const current = (teamData[field] || '').toString();
  
  const modal = document.getElementById('fieldEditModal');
  if (!modal) return;
  
  document.getElementById('fieldEditTitle').textContent = fieldInfo.title;
  document.getElementById('fieldEditLabel').textContent = fieldInfo.label;
  document.getElementById('fieldEditInput').value = current;
  document.getElementById('fieldEditInput').placeholder = isKy ? 'Маанини киргизиңиз' : 'Enter value';
  document.getElementById('fieldEditMessage').style.display = 'none';
  document.getElementById('fieldEditMessage').textContent = '';
  
  modal.style.display = 'flex';
  document.getElementById('fieldEditInput').focus();
  document.getElementById('fieldEditInput').select();
  
  AkylI18n.applyI18n(AkylI18n.getLang(), modal);
}

function closeFieldEditModal(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const modal = document.getElementById('fieldEditModal');
  if (modal) {
    modal.style.display = 'none';
    currentEditField = null;
  }
}

async function saveFieldEdit() {
  if (!currentEditField || !teamData) return;
  
  const input = document.getElementById('fieldEditInput');
  const newValue = (input?.value || '').trim();
  const messageEl = document.getElementById('fieldEditMessage');
  const btn = document.getElementById('saveFieldBtn');
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  
  btn.disabled = true;
  btn.textContent = isKy ? 'Сакталууда...' : 'Saving...';
  
  try {
    const body = {};
    body[currentEditField] = newValue;
    
    const j = await apiFetch('/api/me', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    
    if (!j.ok) {
      const msg = j && j.error ? j.error : (isKy ? 'Өзгөртүүлөрдү сактоо мүмкүн болбоду' : 'Failed to save changes');
      messageEl.textContent = msg;
      messageEl.className = 'reset-message error';
      messageEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isKy ? 'Сактоо' : 'Save';
      return;
    }
    
    teamData = j.team || teamData;
    updateTeamNameHeader();
    
    try {
      const currentStored = JSON.parse(localStorage.getItem('team') || 'null');
      if (currentStored && Number(currentStored.id) === Number(teamData.id)) {
        localStorage.setItem('team', JSON.stringify({ ...currentStored, ...teamData }));
      }
    } catch {}
    
    messageEl.textContent = isKy ? 'Өзгөртүүлөр ийгиликтүү сакталды' : 'Changes saved successfully';
    messageEl.className = 'reset-message success';
    messageEl.style.display = 'block';
    
    setTimeout(() => {
      closeFieldEditModal();
      renderHomeSection(document.getElementById('tabHome'));
    }, 1000);
    
  } catch (err) {
    console.error(err);
    messageEl.textContent = isKy ? 'Сактоо учурунда ката кетти. Кайра аракет кылыңыз.' : 'An error occurred while saving. Please try again.';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = isKy ? 'Сактоо' : 'Save';
  }
}

function handlePasswordChange() {
  const modal = document.getElementById('passwordChangeModal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('passwordStep1').style.display = 'block';
    document.getElementById('passwordStep2').style.display = 'none';
    document.getElementById('passwordOldPassword').value = '';
    document.getElementById('passwordNewPassword').value = '';
    document.getElementById('passwordConfirmPassword').value = '';
    document.getElementById('passwordStep1Message').style.display = 'none';
    document.getElementById('passwordStep2Message').style.display = 'none';
    document.getElementById('passwordOldPassword').focus();
  }
}

function closePasswordChangeModal(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const modal = document.getElementById('passwordChangeModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function goBackToPasswordStep1() {
  document.getElementById('passwordStep1').style.display = 'block';
  document.getElementById('passwordStep2').style.display = 'none';
  document.getElementById('passwordOldPassword').value = '';
  document.getElementById('passwordStep1Message').style.display = 'none';
  document.getElementById('passwordOldPassword').focus();
}

async function verifyOldPassword() {
  const oldPassword = document.getElementById('passwordOldPassword').value;
  const messageEl = document.getElementById('passwordStep1Message');
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  
  if (!oldPassword) {
    messageEl.textContent = isKy ? 'Учурдагы сырсөздү киргизиңиз' : 'Enter current password';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('verifyOldPasswordBtn');
  btn.disabled = true;
  btn.textContent = isKy ? 'Текшерүүдө...' : 'Verifying...';

  try {
    const j = await apiFetch('/api/me/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password: oldPassword })
    });
    
    if (!j.ok) {
      messageEl.textContent = j && j.error ? j.error : (isKy ? 'Сырсөз туура эмес' : 'Incorrect password');
      messageEl.className = 'reset-message error';
      messageEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isKy ? 'Текшерүү' : 'Verify';
      return;
    }

    document.getElementById('passwordStep1').style.display = 'none';
    document.getElementById('passwordStep2').style.display = 'block';
    document.getElementById('passwordNewPassword').focus();
    
    const newPwdInput = document.getElementById('passwordNewPassword');
    const confirmPwdInput = document.getElementById('passwordConfirmPassword');
    
    newPwdInput.addEventListener('input', checkPasswordRequirements);
    confirmPwdInput.addEventListener('input', checkPasswordMatch);
    
  } catch (err) {
    console.error(err);
    messageEl.textContent = isKy ? 'Ката кетти. Кайра аракет кылыңыз.' : 'An error occurred. Please try again.';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = isKy ? 'Текшерүү' : 'Verify';
  }
}

function checkPasswordRequirements() {
  const password = document.getElementById('passwordNewPassword').value;
  const reqs = {
    length: password.length >= 8,
    upper: /[A-ZА-ЯЁ]/.test(password),
    lower: /[a-zа-яё]/.test(password),
    number: /[0-9]/.test(password)
  };
  
  document.getElementById('pwd-req-length').classList.toggle('met', reqs.length);
  document.getElementById('pwd-req-upper').classList.toggle('met', reqs.upper);
  document.getElementById('pwd-req-lower').classList.toggle('met', reqs.lower);
  document.getElementById('pwd-req-number').classList.toggle('met', reqs.number);
  
  checkPasswordMatch();
}

function checkPasswordMatch() {
  const newPwd = document.getElementById('passwordNewPassword').value;
  const confirmPwd = document.getElementById('passwordConfirmPassword').value;
  const messageEl = document.getElementById('passwordStep2Message');
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  
  if (confirmPwd && newPwd !== confirmPwd) {
    messageEl.textContent = isKy ? 'Сырсөздөр дал келбейт' : 'Passwords do not match';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
  } else {
    messageEl.style.display = 'none';
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('passwordOldPassword').value;
  const newPassword = document.getElementById('passwordNewPassword').value;
  const confirmPassword = document.getElementById('passwordConfirmPassword').value;
  const messageEl = document.getElementById('passwordStep2Message');
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  
  const reqs = {
    length: newPassword.length >= 8,
    upper: /[A-ZА-ЯЁ]/.test(newPassword),
    lower: /[a-zа-яё]/.test(newPassword),
    number: /[0-9]/.test(newPassword)
  };
  
  if (!reqs.length || !reqs.upper || !reqs.lower || !reqs.number) {
    messageEl.textContent = isKy ? 'Сырсөз талаптарга жооп бербейт' : 'Password does not meet requirements';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    return;
  }
  
  if (newPassword !== confirmPassword) {
    messageEl.textContent = isKy ? 'Сырсөздөр дал келбейт' : 'Passwords do not match';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('changePasswordBtn');
  btn.disabled = true;
  btn.textContent = isKy ? 'Өзгөртүлүүдө...' : 'Changing...';

  try {
    const j = await apiFetch('/api/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    });
    
    if (!j.ok) {
      const msg = j && j.error ? j.error : (isKy ? 'Сырсөздү өзгөртүү мүмкүн болбоду' : 'Failed to change password');
      messageEl.textContent = msg;
      messageEl.className = 'reset-message error';
      messageEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isKy ? 'Сырсөздү өзгөртүү' : 'Change Password';
      return;
    }
    
    messageEl.textContent = isKy ? 'Сырсөз ийгиликтүү өзгөртүлдү' : 'Password changed successfully';
    messageEl.className = 'reset-message success';
    messageEl.style.display = 'block';
    
    setTimeout(() => {
      closePasswordChangeModal();
    }, 1500);
    
  } catch (err) {
    console.error(err);
    messageEl.textContent = isKy ? 'Сырсөздү өзгөртүүдө ката кетти. Кайра аракет кылыңыз.' : 'An error occurred while changing password. Please try again.';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = isKy ? 'Сырсөздү өзгөртүү' : 'Change Password';
  }
}

// Edit team members
function handleMembersEdit(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const modal = document.getElementById('membersEditModal');
  if (!modal || !teamData) {
    console.error('Modal or teamData not found');
    return;
  }

  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';
  
  modal.style.display = 'flex';
  const listContainer = document.getElementById('membersEditList');
  if (!listContainer) {
    console.error('membersEditList not found');
    return;
  }

  // Reset message state and save button
  const messageEl = document.getElementById('membersEditMessage');
  const btn = document.getElementById('saveMembersBtn');
  if (messageEl) {
    messageEl.style.display = 'none';
    messageEl.textContent = '';
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = isKy ? 'Өзгөрүүлөрдү сактоо' : 'Save Changes';
  }

  listContainer.innerHTML = '';
  
  // Load all members
  const members = (Array.isArray(teamData.members) && teamData.members.length > 0)
    ? teamData.members
    : [{ name: '', class: '' }, { name: '', class: '' }];

  members.forEach((member, index) => {
    addMemberRow(member.name || '', member.class || '', index);
  });
  
  if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
    AkylI18n.applyI18n(AkylI18n.getLang(), modal);
  }
}

function addMemberRow(name = '', className = '', index = null) {
  const listContainer = document.getElementById('membersEditList');
  if (!listContainer) return;
  
  const rowIndex = index !== null ? index : listContainer.children.length;
  const memNum = rowIndex + 1;
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  const row = document.createElement('div');
  row.className = 'member-edit-row';
  row.style.cssText = 'display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-start;';
  row.innerHTML = `
    <div style="flex: 1.2;">
      <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #334155;">${isKy ? `${memNum}-катышуучунун аты-жөнү` : `Member #${memNum} Full Name`}</label>
      <input type="text" class="settings-input member-name-input" placeholder="${isKy ? 'Аты-жөнү' : 'Member Full Name'}" value="${escapeHtml(name)}" style="min-height: 46px;"/>
    </div>
    <div style="flex: 0.8;">
      <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: #334155;">${isKy ? 'Классы' : 'Grade'} <span style="color:#ef4444">*</span></label>
      <select class="settings-select member-class-input member-class-select" required style="min-height: 46px;">
        ${buildClassSelectOptions(className, isKy)}
      </select>
    </div>
    ${memNum > 2 ? `<button type="button" onclick="removeMemberRow(this)" style="margin-top: 26px; padding: 11px 14px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700; line-height: 1;" aria-label="${isKy ? 'Катышуучуну өчүрүү' : 'Remove member'}" title="${isKy ? 'Өчүрүү' : 'Remove'}">✕</button>` : ''}
  `;
  listContainer.appendChild(row);
  
  if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
    AkylI18n.applyI18n(AkylI18n.getLang(), row);
  }
}

function removeMemberRow(btn) {
  const row = btn.closest('.member-edit-row');
  if (row) {
    row.remove();
  }
}

function closeMembersEditModal(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const modal = document.getElementById('membersEditModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function saveMembers() {
  const listContainer = document.getElementById('membersEditList');
  if (!listContainer) return;
  
  const rows = listContainer.querySelectorAll('.member-edit-row');
  const members = [];
  let validationError = null;
  const isKy = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang && AkylI18n.getLang() === 'ky');
  
  rows.forEach((row, idx) => {
    const nameInput = row.querySelector('.member-name-input');
    const classInput = row.querySelector('.member-class-input, .member-class-select');
    const name = (nameInput?.value || '').trim();
    const className = (classInput?.value || '').trim();
    const memNum = idx + 1;
    
    if (name || className) {
      if (!name) {
        validationError = isKy ? `${memNum}-катышуучунун аты-жөнүн жазыңыз` : `Please enter full name for member #${memNum}`;
        return;
      }
      if (!className || !ALLOWED_CLASSES.includes(className)) {
        validationError = isKy ? `${memNum}-катышуучунун классын тандаңыз` : `Please select grade for member #${memNum}`;
        return;
      }
      members.push({
        name: name,
        class: className
      });
    }
  });

  const messageEl = document.getElementById('membersEditMessage');
  const btn = document.getElementById('saveMembersBtn');

  if (validationError) {
    if (messageEl) {
      messageEl.textContent = validationError;
      messageEl.className = 'reset-message error';
      messageEl.style.display = 'block';
    }
    return;
  }

  if (members.length < 2) {
    if (messageEl) {
      messageEl.textContent = isKy ? 'Топто кеминде 2 катышуучу болушу керек' : 'Team must have at least 2 members';
      messageEl.className = 'reset-message error';
      messageEl.style.display = 'block';
    }
    return;
  }
  
  btn.disabled = true;
  btn.textContent = t('team.saving') || 'Saving...';
  
  try {
    const j = await apiFetch('/api/me', {
      method: 'PUT',
      body: JSON.stringify({ members: members })
    });
    
    if (!j.ok) {
      const msg = j && j.error ? j.error : (isKy ? 'Өзгөртүүлөрдү сактоо мүмкүн болбоду' : 'Failed to save changes');
      messageEl.textContent = msg;
      messageEl.className = 'reset-message error';
      messageEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = isKy ? 'Сактоо' : 'Save';
      return;
    }
    
    teamData = j.team || teamData;
    if (teamData.members && typeof teamData.members === 'string') {
      try {
        teamData.members = JSON.parse(teamData.members);
      } catch {
        teamData.members = [];
      }
    }
    
    messageEl.textContent = isKy ? 'Катышуучулар ийгиликтүү жаңыртылды' : 'Members updated successfully';
    messageEl.className = 'reset-message success';
    messageEl.style.display = 'block';
    
    setTimeout(() => {
      closeMembersEditModal();
      renderHomeSection(document.getElementById('tabHome'));
    }, 1000);
    
  } catch (err) {
    console.error(err);
    messageEl.textContent = isKy ? 'Сактоо учурунда ката кетти. Кайра аракет кылыңыз.' : 'An error occurred while saving. Please try again.';
    messageEl.className = 'reset-message error';
    messageEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = isKy ? 'Сактоо' : 'Save';
  }
}

// Keyboard navigation for tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('keydown', (e) => {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const currentIndex = tabs.indexOf(btn);
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      let nextIndex;
      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      }
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    } else if (e.key === 'Home') {
      e.preventDefault();
      tabs[0].focus();
      tabs[0].click();
    } else if (e.key === 'End') {
      e.preventDefault();
      tabs[tabs.length - 1].focus();
      tabs[tabs.length - 1].click();
    }
  });
});

// ==========================================================================
// Announcements Section (Team Cabinet)
// ==========================================================================
async function renderAnnouncementsSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  out.setAttribute('aria-busy', 'true');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="app-skeleton" style="height: 120px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 120px; width: 100%;"></div>
    </div>
  `;

  try {
    const res = await apiFetch('/api/announcements');
    const announcements = (res && res.announcements) ? res.announcements : [];

    out.setAttribute('aria-busy', 'false');

    // Update sidebar badge
    const badgeEl = document.getElementById('sidebarAnnouncementsBadge');
    if (badgeEl) {
      if (announcements.length > 0) {
        badgeEl.textContent = String(announcements.length);
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    if (announcements.length === 0) {
      out.innerHTML = `
        <div class="dash-card" style="padding: 48px 24px; text-align: center; border: 1px dashed var(--line); background: var(--surface);">
          <div style="font-size: 38px; margin-bottom: 12px;">📢</div>
          <h3 style="font-family: 'Spectral', serif; font-size: 20px; margin: 0 0 6px; color: var(--ink);">
            ${isKy ? 'Азырынча кулактандыруулар жок' : 'No announcements yet'}
          </h3>
          <p style="font-size: 14px; color: var(--ink-3); max-width: 440px; margin: 0 auto;">
            ${isKy 
              ? 'Турнирдин расмий жаңылыктары жана маанилүү билдирүүлөрү бул жерде жарыяланат. Кийинчерээк кайра текшериңиз.' 
              : 'Important tournament news, schedules, and notices will be published here. Check back later!'}
          </p>
        </div>
      `;
      return;
    }

    let cardsHtml = announcements.map(a => {
      const priorityClass = a.priority === 'urgent' ? 'priority-urgent' 
        : a.priority === 'important' ? 'priority-important' 
        : 'priority-normal';

      const priorityLabel = isKy
        ? (a.priority === 'urgent' ? 'Шашылыш' : a.priority === 'important' ? 'Маанилүү' : 'Маалымат')
        : (a.priority === 'urgent' ? 'Urgent' : a.priority === 'important' ? 'Important' : 'Notice');

      const audienceLabel = a.target_type === 'category'
        ? (isKy ? `Категория: ${escapeHtml(a.category_name_ky || a.category_name_ru || '')}` : `Category: ${escapeHtml(a.category_name_en || a.category_name_ru || a.category_name_ky || '')}`)
        : (isKy ? 'Бардык командаларга' : 'All Teams');

      // Title & Content based on active lang
      const title = isKy
        ? (a.title_ky || a.title_ru || a.title_en || '')
        : (a.title_en || a.title_ru || a.title_ky || '');

      const content = isKy
        ? (a.content_ky || a.content_ru || a.content_en || '')
        : (a.content_en || a.content_ru || a.content_ky || '');

      const dateStr = a.created_at ? new Date(a.created_at).toLocaleString(isKy ? 'ky-KG' : 'en-US', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';

      const hasAltLang = (a.title_ky && a.title_ru && a.title_ky !== a.title_ru) || (a.content_ky && a.content_ru && a.content_ky !== a.content_ru);

      return `
        <article class="announcement-card ${priorityClass}">
          <div class="announcement-meta-bar">
            <span class="announcement-priority-badge">${priorityLabel}</span>
            <span class="announcement-audience-tag">🎯 ${audienceLabel}</span>
            <span class="announcement-date">📅 ${dateStr}</span>
          </div>

          <h3 class="announcement-title">${escapeHtml(title)}</h3>
          <div class="announcement-content">${escapeHtml(content)}</div>

          ${hasAltLang ? `
            <div class="announcement-lang-toggle">
              <span>${isKy ? 'Тилди которуу:' : 'Alternate version:'}</span>
              <button type="button" class="announcement-lang-btn ${isKy ? 'active' : ''}" onclick="toggleAnnouncementLang(this, '${escapeHtml(a.title_ky || a.title_ru || '')}', '${escapeHtml(a.content_ky || a.content_ru || '')}')">
                🇰🇬 Кыргызча
              </button>
              <button type="button" class="announcement-lang-btn ${!isKy ? 'active' : ''}" onclick="toggleAnnouncementLang(this, '${escapeHtml(a.title_ru || a.title_en || '')}', '${escapeHtml(a.content_ru || a.content_en || '')}')">
                🇷🇺 Русский / EN
              </button>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');

    out.innerHTML = `
      <div class="support-container">
        <div style="margin-bottom: 6px;">
          <h2 style="font-family: 'Spectral', serif; font-size: 26px; color: var(--ink); margin: 0 0 6px;">
            ${isKy ? 'Кулактандыруулар жана жаңылыктар' : 'Announcements & Updates'}
          </h2>
          <p style="font-size: 14px; color: var(--ink-3); margin: 0;">
            ${isKy ? 'Турнирдин маанилүү жаңылыктары, графиктери жана расмий билдирүүлөр' : 'Important tournament news, schedules, and official notices'}
          </p>
        </div>

        <div class="announcements-grid">
          ${cardsHtml}
        </div>
      </div>
    `;

  } catch (err) {
    console.error('Error rendering announcements:', err);
    out.setAttribute('aria-busy', 'false');
    out.innerHTML = `<div class="modern-empty-state"><p style="color: var(--err);">${err.message}</p></div>`;
  }
}

window.toggleAnnouncementLang = function(btn, title, content) {
  const card = btn.closest('.announcement-card');
  if (!card) return;
  const tEl = card.querySelector('.announcement-title');
  const cEl = card.querySelector('.announcement-content');
  if (tEl && title) tEl.textContent = title;
  if (cEl && content) cEl.textContent = content;
  card.querySelectorAll('.announcement-lang-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

// ==========================================================================
// Support & Tickets Section (Team Cabinet)
// ==========================================================================
let activeTeamTicketId = null;

async function renderSupportSection(btn, targetTicketId = null) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  out.setAttribute('aria-busy', 'true');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="app-skeleton" style="height: 80px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 200px; width: 100%;"></div>
    </div>
  `;

  if (targetTicketId) {
    activeTeamTicketId = targetTicketId;
  }

  try {
    const res = await apiFetch('/api/team/support/tickets');
    const tickets = (res && res.tickets) ? res.tickets : [];

    out.setAttribute('aria-busy', 'false');

    // Update sidebar badge for active tickets
    const activeCount = tickets.filter(t => t.status !== 'resolved').length;
    const badgeEl = document.getElementById('sidebarSupportBadge');
    if (badgeEl) {
      if (activeCount > 0) {
        badgeEl.textContent = String(activeCount);
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // If viewing single ticket thread
    if (activeTeamTicketId) {
      await renderTicketThread(activeTeamTicketId, isKy);
      return;
    }

    // Otherwise render tickets list view
    renderTicketsListView(tickets, isKy);

  } catch (err) {
    console.error('Error rendering support:', err);
    out.setAttribute('aria-busy', 'false');
    out.innerHTML = `<div class="modern-empty-state"><p style="color: var(--err);">${err.message}</p></div>`;
  }
}

function renderTicketsListView(tickets, isKy) {
  const out = document.getElementById('tabContent');

  const categoryNames = {
    general: isKy ? 'Жалпы суроо' : 'General Question',
    technical: isKy ? 'Техникалык көйгөй' : 'Technical Issue',
    test: isKy ? 'Тест жана суроолор' : 'Test & Questions',
    results: isKy ? 'Жыйынтыктар жана баллдар' : 'Results & Scoring'
  };

  const statusNames = {
    open: { label: isKy ? 'Ачык' : 'Open', cls: 'status-open' },
    in_progress: { label: isKy ? 'Каралууда' : 'In Progress', cls: 'status-in_progress' },
    resolved: { label: isKy ? 'Чечилди' : 'Resolved', cls: 'status-resolved' }
  };

  let listHtml = '';
  if (tickets.length === 0) {
    listHtml = `
      <div class="dash-card" style="padding: 44px 24px; text-align: center; border: 1px dashed var(--line); background: var(--surface);">
        <div style="font-size: 38px; margin-bottom: 12px;">💬</div>
        <h3 style="font-family: 'Spectral', serif; font-size: 20px; margin: 0 0 6px; color: var(--ink);">
          ${isKy ? 'Сизде азырынча берилген суроолор жок' : 'You have not submitted any questions yet'}
        </h3>
        <p style="font-size: 14px; color: var(--ink-3); max-width: 440px; margin: 0 auto 16px;">
          ${isKy 
            ? 'Тесттер, расписание же турнирдин эрежелери боюнча суроолоруңуз болсо, администрацияга түздөн-түз кайрылсаңыз болот.' 
            : 'If you have questions about tests, timetable, or tournament rules, you can directly message administration.'}
        </p>
        <button type="button" class="btn-brand" onclick="openNewTicketModal()">
          <span>+</span> ${isKy ? 'Биринчи суроону берүү' : 'Ask Your First Question'}
        </button>
      </div>
    `;
  } else {
    listHtml = tickets.map(t => {
      const s = statusNames[t.status] || statusNames.open;
      const catLabel = categoryNames[t.category] || categoryNames.general;
      const dateStr = t.updated_at ? new Date(t.updated_at).toLocaleString(isKy ? 'ky-KG' : 'en-US', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';

      return `
        <div class="support-ticket-card" onclick="openTicketThread(${t.id})">
          <div class="support-ticket-top">
            <h4 class="support-ticket-subject">${escapeHtml(t.subject)}</h4>
            <span class="support-status-chip ${s.cls}">${s.label}</span>
          </div>

          <div class="support-ticket-preview">
            ${t.last_sender === 'admin' ? `<b>${isKy ? 'Администрация:' : 'Admin:'}</b> ` : `<b>${isKy ? 'Сиз:' : 'You:'}</b> `}
            ${escapeHtml(t.last_message || '')}
          </div>

          <div class="support-ticket-footer">
            <span style="background:var(--surface-2); border:1px solid var(--line-soft); padding:2px 7px; border-radius:2px; font-weight:500;">
              📁 ${catLabel}
            </span>
            <span style="font-family:'JetBrains Mono', monospace;">
              🕒 ${dateStr} • ${t.message_count || 1} ${isKy ? 'билдирүү' : 'msgs'}
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  out.innerHTML = `
    <div class="support-container">
      <div class="support-top-actions">
        <div>
          <h2 style="font-family: 'Spectral', serif; font-size: 24px; color: var(--ink); margin: 0 0 4px;">
            ${isKy ? 'Команданы колдоо кызматы' : 'Team Support & Help Desk'}
          </h2>
          <div style="font-size: 13px; color: var(--ink-3);">
            ${isKy ? 'Суроолоруңузду берип, турнирдин администраторлорунан түз жооп алыңыз' : 'Ask questions and receive direct assistance from tournament administrators'}
          </div>
        </div>

        <button type="button" class="btn-brand" onclick="openNewTicketModal()" style="display:inline-flex; align-items:center; gap:6px;">
          <span>+</span> <span>${isKy ? 'Жаңы суроо берүү' : 'New Question'}</span>
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${listHtml}
      </div>
    </div>

    <!-- Модальное окно нового тикета -->
    <div id="newTicketModal" class="reset-modal" style="display: none;">
      <div class="reset-modal-content" style="max-width: 580px;">
        <div class="reset-modal-header">
          <h3 style="font-family:'Spectral',serif; font-size:20px; margin:0;">
            ${isKy ? 'Жаңы суроо берүү' : 'New Support Question'}
          </h3>
          <button class="reset-close-btn" onclick="closeNewTicketModal()" aria-label="Close">✕</button>
        </div>

        <form id="newTicketForm" style="display:flex; flex-direction:column; gap:16px; margin-top:14px;">
          <div>
            <label class="modern-label" style="display:block; margin-bottom:4px; font-weight:600; font-size:13px;">
              ${isKy ? 'Суроонун темасы *' : 'Subject *'}
            </label>
            <input type="text" id="ticketSubjectInput" class="modern-input" style="width:100%;" required 
                   placeholder="${isKy ? 'Мисалы: Тестке кирүү же расписание боюнча суроо' : 'E.g., Issue with test access or timetable question'}">
          </div>

          <div>
            <label class="modern-label" style="display:block; margin-bottom:4px; font-weight:600; font-size:13px;">
              ${isKy ? 'Категория *' : 'Category *'}
            </label>
            <select id="ticketCategorySelect" class="modern-input" style="width:100%;">
              <option value="general">${isKy ? 'Жалпы суроо' : 'General Question'}</option>
              <option value="technical">${isKy ? 'Техникалык көйгөй' : 'Technical Issue'}</option>
              <option value="test">${isKy ? 'Тест жана суроолор' : 'Test & Questions'}</option>
              <option value="results">${isKy ? 'Жыйынтыктар жана баллдар' : 'Results & Scoring'}</option>
            </select>
          </div>

          <div>
            <label class="modern-label" style="display:block; margin-bottom:4px; font-weight:600; font-size:13px;">
              ${isKy ? 'Каттын тексти *' : 'Message *'}
            </label>
            <textarea id="ticketMessageInput" class="modern-textarea" rows="4" style="width:100%; resize:vertical;" required 
                      placeholder="${isKy ? 'Сурооңузду толук жазыңыз...' : 'Describe your question in detail...'}"></textarea>
          </div>

          <div id="newTicketError" class="reset-message error" style="display:none;"></div>

          <div class="reset-actions" style="margin-top:8px;">
            <button type="button" class="nav-btn" onclick="closeNewTicketModal()">
              ${isKy ? 'Жокко чыгаруу' : 'Cancel'}
            </button>
            <button type="submit" id="submitTicketBtn" class="primary">
              ${isKy ? 'Суроону жөнөтүү' : 'Send Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach submit handler for new ticket form
  const form = document.getElementById('newTicketForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const sInput = document.getElementById('ticketSubjectInput');
      const cSelect = document.getElementById('ticketCategorySelect');
      const mInput = document.getElementById('ticketMessageInput');
      const btn = document.getElementById('submitTicketBtn');
      const errBox = document.getElementById('newTicketError');

      const subject = sInput.value.trim();
      const category = cSelect.value;
      const message = mInput.value.trim();

      if (!subject || !message) return;

      btn.disabled = true;
      btn.textContent = isKy ? 'Жөнөтүлүүдө...' : 'Sending...';
      errBox.style.display = 'none';

      try {
        const res = await apiFetch('/api/team/support/tickets', {
          method: 'POST',
          body: JSON.stringify({ subject, category, message })
        });

        if (res && res.ok && res.ticket_id) {
          closeNewTicketModal();
          // Immediately open newly created ticket thread
          activeTeamTicketId = res.ticket_id;
          renderSupportSection(document.getElementById('tabSupport'), res.ticket_id);
        } else {
          errBox.textContent = (res && res.error) || 'Error sending ticket';
          errBox.style.display = 'block';
        }
      } catch (err) {
        errBox.textContent = err.message || 'Network error';
        errBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = isKy ? 'Суроону жөнөтүү' : 'Send Question';
      }
    };
  }
}

window.openNewTicketModal = function() {
  const modal = document.getElementById('newTicketModal');
  if (modal) modal.style.display = 'flex';
};

window.closeNewTicketModal = function() {
  const modal = document.getElementById('newTicketModal');
  if (modal) modal.style.display = 'none';
};

window.openTicketThread = function(ticketId) {
  activeTeamTicketId = ticketId;
  renderSupportSection(document.getElementById('tabSupport'), ticketId);
};

window.backToTicketsList = function() {
  activeTeamTicketId = null;
  renderSupportSection(document.getElementById('tabSupport'));
};

async function renderTicketThread(ticketId, isKy) {
  const out = document.getElementById('tabContent');

  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div class="app-skeleton" style="height: 60px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 360px; width: 100%;"></div>
    </div>
  `;

  try {
    const res = await apiFetch(`/api/team/support/tickets/${ticketId}`);
    if (!res || !res.ok || !res.ticket) {
      out.innerHTML = `
        <div class="modern-empty-state">
          <p style="color:var(--err);">${isKy ? 'Обращение табылбай калды' : 'Ticket not found'}</p>
          <button type="button" class="btn-brand" onclick="backToTicketsList()">${isKy ? '← Тизмеге кайтуу' : '← Back to Questions'}</button>
        </div>
      `;
      return;
    }

    const t = res.ticket;
    const messages = res.messages || [];

    const categoryNames = {
      general: isKy ? 'Жалпы суроо' : 'General Question',
      technical: isKy ? 'Техникалык көйгөй' : 'Technical Issue',
      test: isKy ? 'Тест жана суроолор' : 'Test & Questions',
      results: isKy ? 'Жыйынтыктар жана баллдар' : 'Results & Scoring'
    };

    const statusNames = {
      open: { label: isKy ? 'Ачык' : 'Open', cls: 'status-open' },
      in_progress: { label: isKy ? 'Каралууда' : 'In Progress', cls: 'status-in_progress' },
      resolved: { label: isKy ? 'Чечилди' : 'Resolved', cls: 'status-resolved' }
    };
    const s = statusNames[t.status] || statusNames.open;
    const catLabel = categoryNames[t.category] || categoryNames.general;

    out.innerHTML = `
      <div class="support-container">
        <button type="button" class="btn-ghost" onclick="backToTicketsList()" style="align-self:flex-start; display:inline-flex; align-items:center; gap:6px;">
          <span>←</span> <span>${isKy ? 'Суроолор тизмесине кайтуу' : 'Back to Questions'}</span>
        </button>

        <div class="ticket-thread-view">
          <!-- Шапка тикета -->
          <div class="ticket-thread-header">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
              <div>
                <h3 style="font-family:'Spectral',serif; font-size:22px; color:var(--ink); margin:0 0 6px;">
                  ${escapeHtml(t.subject)}
                </h3>
                <div style="font-size:12.5px; color:var(--ink-3); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                  <span>📁 ${catLabel}</span>
                  <span>•</span>
                  <span>📅 ${new Date(t.created_at).toLocaleString(isKy ? 'ky-KG' : 'en-US', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
              </div>

              <span class="support-status-chip ${s.cls}">${s.label}</span>
            </div>
          </div>

          <!-- Лента сообщений -->
          <div class="ticket-thread-messages" id="teamChatMessagesStream">
            ${messages.map(m => {
              const isAdmin = m.sender_type === 'admin';
              const timeStr = m.created_at ? new Date(m.created_at).toLocaleString(isKy ? 'ky-KG' : 'en-US', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
              }) : '';

              return `
                <div class="chat-bubble ${isAdmin ? 'from-admin' : 'from-team'}">
                  <div class="chat-bubble-author">
                    ${isAdmin ? `🛡️ ${isKy ? 'Турнирдин администрациясы' : 'Tournament Administration'}` : `👥 ${isKy ? 'Сиздин команда' : 'Your Team'}`}
                  </div>
                  <div class="chat-bubble-text">${escapeHtml(m.message)}</div>
                  <div class="chat-bubble-time">${timeStr}</div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Форма ответа -->
          <form class="ticket-thread-reply-form" id="teamReplyForm">
            <div>
              <textarea id="teamReplyInput" class="modern-textarea" rows="3" style="width:100%; resize:vertical;" 
                        placeholder="${isKy ? 'Жообуңузду же кошумча сурооңузду жазыңыз...' : 'Type your reply here...'}"></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button type="submit" id="teamSendReplyBtn" class="primary" style="display:inline-flex; align-items:center; gap:6px;">
                <span>${isKy ? 'Жооп жөнөтүү' : 'Send Reply'}</span> <span>➤</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Scroll chat stream to bottom
    const stream = document.getElementById('teamChatMessagesStream');
    if (stream) stream.scrollTop = stream.scrollHeight;

    // Handle reply submit
    const rForm = document.getElementById('teamReplyForm');
    const rInput = document.getElementById('teamReplyInput');
    const rBtn = document.getElementById('teamSendReplyBtn');

    rInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        rForm.dispatchEvent(new Event('submit'));
      }
    });

    rForm.onsubmit = async (e) => {
      e.preventDefault();
      const msg = rInput.value.trim();
      if (!msg) return;

      rBtn.disabled = true;
      rBtn.textContent = isKy ? 'Жөнөтүлүүдө...' : 'Sending...';

      try {
        const res = await apiFetch(`/api/team/support/tickets/${ticketId}/reply`, {
          method: 'POST',
          body: JSON.stringify({ message: msg })
        });

        if (res && res.ok) {
          rInput.value = '';
          
          // Add new message to stream without full rerender
          const stream = document.getElementById('teamChatMessagesStream');
          const timeStr = new Date().toLocaleString(isKy ? 'ky-KG' : 'en-US', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
          });

          const newBubble = document.createElement('div');
          newBubble.className = 'chat-bubble from-team';
          newBubble.innerHTML = `
            <div class="chat-bubble-author">
              👥 ${isKy ? 'Сиздин команда' : 'Your Team'}
            </div>
            <div class="chat-bubble-text">${escapeHtml(msg)}</div>
            <div class="chat-bubble-time">${timeStr}</div>
          `;
          stream.appendChild(newBubble);
          stream.scrollTop = stream.scrollHeight;
        } else {
          alert((res && res.error) || 'Failed to send message');
        }
      } catch (err) {
        alert(err.message || 'Network error');
      } finally {
        rBtn.disabled = false;
        rBtn.innerHTML = `<span>${isKy ? 'Жооп жөнөтүү' : 'Send Reply'}</span> <span>➤</span>`;
      }
    };

  } catch (err) {
    console.error('Error rendering ticket thread:', err);
    out.innerHTML = `<div class="modern-empty-state"><p style="color:var(--err);">${err.message}</p></div>`;
  }
}

// Tab handlers + URL update (/team/<section>)
function attachTabHandlers() {
  const map = {
    tabHome: { section: 'main', render: renderHomeSection },
    tabTests: { section: 'tests', render: renderTestsSection },
    tabResults: { section: 'results', render: renderResultsSection },
    tabLeaderboard: { section: 'leaderboard', render: renderLeaderboardSection },
    tabAnnouncements: { section: 'announcements', render: renderAnnouncementsSection },
    tabSupport: { section: 'support', render: renderSupportSection },
    tabSettings: { section: 'settings', render: renderSettingsSection }
  };

  Object.keys(map).forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const { section, render } = map[id];
    btn.onclick = (e) => {
      const targetBtn = e.currentTarget;
      // Change URL without reloading the page
      const newPath = section === 'main' ? '/team/main' : `/team/${section}`;
      if (window.location.pathname !== newPath && window.history && window.history.pushState) {
        window.history.pushState({ section }, '', newPath);
      }
      render(targetBtn);
    };
  });
}

// Router for subpages: /team, /team/main, /team/tests, /team/results, /team/leaderboard, /team/announcements, /team/support, /team/settings
function initTeamSectionFromUrl() {
  const path = window.location.pathname || '';
  const match = path.match(/^\/team\/([^/]+)/);
  const section = match ? match[1] : 'main';
  const map = {
    main: 'tabHome',
    tests: 'tabTests',
    results: 'tabResults',
    leaderboard: 'tabLeaderboard',
    announcements: 'tabAnnouncements',
    support: 'tabSupport',
    settings: 'tabSettings'
  };
  const btnId = map[section] || 'tabHome';
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.click();
  } else {
    document.getElementById('tabHome').click();
  }
}

attachTabHandlers();
initTeamSectionFromUrl();

// Handlers for closing modals when clicking outside them
document.addEventListener('click', (e) => {
  const fieldModal = document.getElementById('fieldEditModal');
  const membersModal = document.getElementById('membersEditModal');
  const passwordModal = document.getElementById('passwordChangeModal');
  
  // Close only if click was on modal backdrop, not content
  if (fieldModal && fieldModal.style.display === 'flex' && e.target === fieldModal) {
    closeFieldEditModal();
  }
  if (membersModal && membersModal.style.display === 'flex' && e.target === membersModal) {
    closeMembersEditModal();
  }
  if (passwordModal && passwordModal.style.display === 'flex' && e.target === passwordModal) {
    closePasswordChangeModal();
  }
});

// Prevent closing when clicking on modal content
// Execute after DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.reset-modal-content').forEach(content => {
      content.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  });
} else {
  document.querySelectorAll('.reset-modal-content').forEach(content => {
    content.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

// Enter handler for saving in field edit modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && currentEditField) {
    const modal = document.getElementById('fieldEditModal');
    if (modal && modal.style.display === 'flex') {
      e.preventDefault();
      saveFieldEdit();
    }
  }
  if (e.key === 'Escape') {
    const fieldModal = document.getElementById('fieldEditModal');
    const membersModal = document.getElementById('membersEditModal');
    const passwordModal = document.getElementById('passwordChangeModal');
    
    if (fieldModal && fieldModal.style.display === 'flex') {
      closeFieldEditModal();
    } else if (membersModal && membersModal.style.display === 'flex') {
      closeMembersEditModal();
    } else if (passwordModal && passwordModal.style.display === 'flex') {
      closePasswordChangeModal();
    }
  }
});

// Language change handler
window.addEventListener('akyl-langchange', () => {
  if (typeof AkylI18n !== 'undefined') {
    const lang = AkylI18n.getLang();
    AkylI18n.applyI18n(lang);
    updateTeamNameHeader();
    // Reload current tab
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
      activeTab.click();
    }
  }
});
