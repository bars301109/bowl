
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
  const teamNameSidebar = document.getElementById('teamNameSidebar');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  if (teamData && teamData.team_name) {
    const tName = teamData.team_name;
    if (teamNameHeader) teamNameHeader.textContent = tName;
    if (teamNameSidebar) teamNameSidebar.textContent = tName;
    if (avatarEl) {
      avatarEl.textContent = tName.trim().charAt(0).toUpperCase();
    }
    if (catEl) {
      const catName = isKy
        ? (teamData.category_name_ky || teamData.category_name_en || teamData.category_name_ru)
        : (teamData.category_name_en || teamData.category_name_ru || teamData.category_name_ky);
      catEl.textContent = catName || (teamData.school ? `${teamData.school} (3/3)` : (isKy ? 'Турнирдин командасы' : 'Tournament Team'));
    }
  } else if (window.participantData) {
    const p = window.participantData;
    const pName = p.full_name || 'Участник';
    if (teamNameHeader) teamNameHeader.textContent = pName;
    if (teamNameSidebar) teamNameSidebar.textContent = pName;
    if (avatarEl) {
      avatarEl.textContent = pName.trim().charAt(0).toUpperCase();
    }
    if (catEl) {
      catEl.textContent = p.school ? `${p.school} · ${p.grade}` : (isKy ? 'Жеке кабинет' : 'Personal Cabinet');
    }
  }
}

async function load() {
  try {
    const data = await apiFetch('/api/me');
    if (!data || !data.ok || !data.participant) {
      localStorage.removeItem('token');
      localStorage.removeItem('team');
      location.href = '/login';
      return;
    }
    window.participantData = data.participant;
    window.currentTeam = data.team;
    window.teammatesList = data.teammates || [];
    window.categoriesList = data.categories || [];

    if (data.team) {
      teamData = {
        ...data.team,
        members: data.teammates || []
      };
      localStorage.setItem('team', JSON.stringify(teamData));
      if (teamData.id) localStorage.setItem('team_id', String(teamData.id));
    } else {
      teamData = null;
      localStorage.removeItem('team');
      localStorage.removeItem('team_id');
    }

    updateTeamNameHeader();
    try {
      await renderHomeSection(document.getElementById('tabHome'));
    } catch (renderErr) {
      console.error('Initial render error:', renderErr);
    }
  } catch (e) {
    console.warn('Session check warning:', e);
    if (e.status === 401 || e.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('team');
      location.href = '/login';
      return;
    }
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
      tabHome: isKy ? 'Башкы бет' : 'Обзор кабинета',
      tabTeam: isKy ? 'Команда жана Категориялар' : 'Команда и Категории',
      tabTests: isKy ? 'Жеткиликтүү онлайн-тесттер' : 'Доступные онлайн-тесты',
      tabResults: isKy ? 'Тесттин жыйынтыктары' : 'Результаты тестирования',
      tabLeaderboard: isKy ? 'Турнирдин рейтинги' : 'Рейтинг команд',
      tabAnnouncements: isKy ? 'Кулактандыруулар жана жаңылыктар' : 'Объявления турнира',
      tabSupport: isKy ? 'Колдоо кызматы' : 'Служба поддержки',
      tabRules: isKy ? 'Регламент жана эрежелер' : 'Регламент и правила',
      tabSettings: isKy ? 'Жеке жөндөөлөр' : 'Настройки профиля',
    };
    topbarTitle.textContent = titles[btn.id] || (isKy ? 'Жеке кабинет' : 'Личный кабинет');
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
  else {
    const hBtn = document.getElementById('tabHome');
    if (hBtn) setActiveTab(hBtn);
  }
  const out = document.getElementById('tabContent');
  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div class="app-skeleton" style="height: 110px; width: 100%;"></div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="app-skeleton" style="height: 250px;"></div>
        <div class="app-skeleton" style="height: 250px;"></div>
      </div>
    </div>
  `;

  try {
    const data = await apiFetch('/api/me');
    if (data && data.ok) {
      window.participantData = data.participant;
      window.currentTeam = data.team;
      window.teammatesList = data.teammates || [];
      window.categoriesList = data.categories || [];
      teamData = data.team ? { ...data.team, members: data.teammates } : null;
      updateTeamNameHeader();
    }
  } catch (err) {
    console.warn('Refresh me warning in renderHomeSection:', err);
  }

  out.setAttribute('aria-busy', 'false');

  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';
  const participant = window.participantData;
  const team = window.currentTeam;
  const teammates = window.teammatesList || [];
  const pName = participant?.full_name || (isKy ? 'Катышуучу' : 'Participant');
  const pSchool = participant?.school || (isKy ? 'Филиал көрсөтүлгөн эмес' : 'Branch not specified');
  const pGrade = participant?.grade ? `${participant.grade} ${isKy ? 'класс' : 'Grade'}` : '';

  let teamBannerHtml = '';
  if (team) {
    const memberCount = teammates.length;
    const isReady = team.status === 'ready';
    const isFull = memberCount === 3;
    let statusText = isReady 
      ? (isKy ? '🟢 Команда даяр (3/3)' : '🟢 Squad Ready (3/3)')
      : (isFull 
          ? (isKy ? '🔵 Категорияларды тандоо (3/3)' : '🔵 Category Selection (3/3)')
          : (isKy ? `🟡 Курамды топтоо (${memberCount}/3)` : `🟡 Gathering Squad (${memberCount}/3)`));

    teamBannerHtml = `
      <div class="app-card card-blue-top" style="padding: 24px; margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="font-size:12px; font-weight:700; padding:4px 10px; background:#eff6ff; color:#1d4ed8; border-radius:6px;">${isKy ? 'Сиздин командаңыз' : 'Your Squad'}</span>
              <span style="font-size:12px; font-weight:700;">${statusText}</span>
            </div>
            <h3 style="margin:0 0 8px 0; font-size:22px; color:var(--app-text-main);">«${escapeHtml(team.team_name || '')}»</h3>
            <div style="font-size:13.5px; color:var(--ink-2); display:flex; flex-wrap:wrap; gap:14px;">
              <span>📍 <strong>${isKy ? 'Филиал:' : 'Branch:'}</strong> ${escapeHtml(team.school || '')}</span>
              <span>👥 <strong>${isKy ? 'Катышуучулар:' : 'Members:'}</strong> ${memberCount}/3</span>
              <span>🔑 <strong>${isKy ? 'Код:' : 'Invite Code:'}</strong> <code style="background:var(--accent-wash); color:var(--accent); padding:2px 8px; border-radius:4px; font-weight:700;">${escapeHtml(team.invite_code || '')}</code></span>
            </div>
          </div>
          <button type="button" id="homeGoTeamBtn" class="btn btn-primary" style="padding:10px 20px; font-weight:600; font-size:14px;">
            👥 ${isKy ? 'Команда бөлүмүн ачуу' : 'Open Team Section'} →
          </button>
        </div>
      </div>
    `;
  } else {
    teamBannerHtml = `
      <div class="app-card card-gold-top" style="padding: 24px; margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="font-size:12px; font-weight:700; padding:4px 10px; background:#fef3c7; color:#b45309; border-radius:6px; display:inline-block; margin-bottom:8px;">
              ${isKy ? 'Команда түзүлө элек' : 'No Team Yet'}
            </div>
            <h3 style="margin:0 0 6px 0; font-size:18px; color:var(--app-text-main);">
              ${isKy ? 'Турнирге катышуу үчүн команда түзүңүз же кошулуңуз' : 'Create or join a team to compete'}
            </h3>
            <p style="margin:0; font-size:13.5px; color:var(--ink-2);">
              ${isKy ? `Сиздин филиалыңыздан (${pSchool}) 3 катышуучу биригип, бир команданы түзүшү керек.` : `3 participants from your branch (${pSchool}) must join together in one squad.`}
            </p>
          </div>
          <button type="button" id="homeGoTeamBtn" class="btn btn-primary" style="padding:10px 20px; font-weight:600; font-size:14px;">
            🚀 ${isKy ? 'Команда түзүү / кошулуу' : 'Create or Join Team'} →
          </button>
        </div>
      </div>
    `;
  }

  out.innerHTML = `
    <!-- Personal Welcome Card -->
    <div class="dashboard-hero-card" style="margin-bottom: 24px;">
      <div class="hero-content">
        <div class="hero-text-block">
          <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 14px; background:var(--app-primary-light); border:1px solid var(--app-primary-border); border-radius:9999px; color:var(--app-primary-dark); font-size:12.5px; font-weight:700; margin-bottom:12px;">
            <span>🏆</span>
            <span>Akylman Quiz Bowl · ${isKy ? 'Жеке кабинет' : 'Personal Cabinet'}</span>
          </div>
          <h2>${escapeHtml(pName)}</h2>
          <ul class="hero-bullet-list">
            <li class="hero-bullet-item">
              <span class="hero-bullet-dot"></span>
              <span><strong>${isKy ? 'Филиал:' : 'Branch:'}</strong> ${escapeHtml(pSchool)}</span>
            </li>
            ${pGrade ? `
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Класс:' : 'Grade:'}</strong> ${escapeHtml(pGrade)}</span>
              </li>
            ` : ''}
            <li class="hero-bullet-item">
              <span class="hero-bullet-dot"></span>
              <span><strong>${isKy ? 'Формат:' : 'Format:'}</strong> ${isKy ? '3 катышуучу (1 филиалдан)' : '3 members (same branch)'}</span>
            </li>
          </ul>
        </div>
        <!-- Animated Pixel Art Cat Mascot -->
        <div class="hero-cat-container" id="teamCatMascot" title="${isKy ? 'Команданын талисманы 🐾' : 'Mascot 🐾'}">
          <div class="hero-cat-speech-bubble" id="catMascotSpeech">${team ? (isKy ? 'Командаңыз менен алга! 🐾' : 'Good luck to your squad! 🐾') : (isKy ? 'Команда түз же коду менен кошул! 🐾' : 'Create a team or join by code! 🐾')}</div>
          <div class="pixelart-cat-scaler">
            <div class="pixelart-to-css" role="img" aria-label="Pixel art cat mascot"></div>
          </div>
        </div>
      </div>
    </div>

    ${teamBannerHtml}

    <!-- Quick Navigation Hub -->
    <div class="quick-hub-section">
      <div class="quick-hub-header">
        <span>⚡</span>
        <span>${isKy ? 'Негизги бөлүмдөр' : 'Quick Navigation'}</span>
      </div>
      <div class="quick-hub-grid">
        <div class="quick-hub-card" id="hubTileTeam" role="button" tabindex="0">
          <div class="quick-hub-card-body">
            <div class="quick-hub-icon">👥</div>
            <div>
              <h4 class="quick-hub-title">${isKy ? 'Команда' : 'Team'}</h4>
              <p class="quick-hub-desc">${isKy ? 'Катышуучулар жана категорияларды тандоо' : 'Team members and category selection'}</p>
            </div>
          </div>
          <div class="quick-hub-action-row">
            <span class="quick-hub-btn">${isKy ? 'Командага өтүү →' : 'Go to Team →'}</span>
          </div>
        </div>

        <div class="quick-hub-card" id="hubTileTests" role="button" tabindex="0">
          <div class="quick-hub-card-body">
            <div class="quick-hub-icon">📝</div>
            <div>
              <h4 class="quick-hub-title">${isKy ? 'Тестирлөө' : 'Online Testing'}</h4>
              <p class="quick-hub-desc">${isKy ? 'Сиздин категорияңыз боюнча тесттер' : 'Take your assigned category test'}</p>
            </div>
          </div>
          <div class="quick-hub-action-row">
            <span class="quick-hub-btn">${isKy ? 'Тесттерге өтүү →' : 'Go to tests →'}</span>
          </div>
        </div>

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

        <div class="quick-hub-card" id="hubTileSettings" role="button" tabindex="0">
          <div class="quick-hub-card-body">
            <div class="quick-hub-icon">⚙️</div>
            <div>
              <h4 class="quick-hub-title">${isKy ? 'Жөндөөлөр' : 'Settings'}</h4>
              <p class="quick-hub-desc">${isKy ? 'Аты-жөнүңүз, класс, email жана сырсөз' : 'Your name, grade, email and password'}</p>
            </div>
          </div>
          <div class="quick-hub-action-row">
            <span class="quick-hub-btn">${isKy ? 'Жөндөөлөргө өтүү →' : 'Open Settings →'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('homeGoTeamBtn')?.addEventListener('click', () => {
    document.getElementById('tabTeam')?.click();
  });
  document.getElementById('hubTileTeam')?.addEventListener('click', () => {
    document.getElementById('tabTeam')?.click();
  });
  document.getElementById('hubTileTests')?.addEventListener('click', () => {
    document.getElementById('tabTests')?.click();
  });
  document.getElementById('hubTileResults')?.addEventListener('click', () => {
    document.getElementById('tabResults')?.click();
  });
  document.getElementById('hubTileSettings')?.addEventListener('click', () => {
    document.getElementById('tabSettings')?.click();
  });
}

// Dedicated Team Section: Squad Roster, Creation, Joining, and Category Selection
async function renderTeamSection(btn) {
  if (btn) setActiveTab(btn);
  else {
    const tBtn = document.getElementById('tabTeam');
    if (tBtn) setActiveTab(tBtn);
  }
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

  // Always refresh latest state from /api/me
  try {
    const data = await apiFetch('/api/me');
    if (data && data.ok) {
      window.participantData = data.participant;
      window.currentTeam = data.team;
      window.teammatesList = data.teammates || [];
      window.categoriesList = data.categories || [];
      teamData = data.team ? { ...data.team, members: data.teammates } : null;
      updateTeamNameHeader();
    }
  } catch (err) {
    console.warn('Refresh me warning in renderHomeSection:', err);
  }

  out.setAttribute('aria-busy', 'false');

  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';
  const participant = window.participantData;

  // ==========================================
  // CASE 1: Student has no team yet (State 1)
  // ==========================================
  if (!window.currentTeam || !participant?.team_id) {
    const pName = participant?.full_name || (isKy ? 'Катышуучу' : 'Participant');
    const pSchool = participant?.school || (isKy ? 'Филиал көрсөтүлгөн эмес' : 'Branch not specified');
    const pGrade = participant?.grade || '';

    out.innerHTML = `
      <!-- Personal Welcome Card -->
      <div class="dashboard-hero-card" style="margin-bottom: 24px;">
        <div class="hero-content">
          <div class="hero-text-block">
            <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 14px; background:var(--app-primary-light); border:1px solid var(--app-primary-border); border-radius:9999px; color:var(--app-primary-dark); font-size:12.5px; font-weight:700; margin-bottom:12px;">
              <span>🏆</span>
              <span>Akylman Quiz Bowl · ${isKy ? 'Жеке кабинет' : 'Personal Cabinet'}</span>
            </div>
            <h2>${escapeHtml(pName)}</h2>
            <ul class="hero-bullet-list">
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Филиал:' : 'Branch:'}</strong> ${escapeHtml(pSchool)}</span>
              </li>
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Класс:' : 'Grade:'}</strong> ${escapeHtml(pGrade)}</span>
              </li>
              <li class="hero-bullet-item">
                <span class="hero-bullet-dot"></span>
                <span><strong>${isKy ? 'Командалык формат:' : 'Team Format:'}</strong> ${isKy ? '3 катышуучу (1 филиалдан)' : '3 members (same branch)'}</span>
              </li>
            </ul>
          </div>
          <!-- Animated Pixel Art Cat Mascot -->
          <div class="hero-cat-container" id="teamCatMascot" title="${isKy ? 'Команданын талисманы 🐾' : 'Талисман турнира 🐾'}">
            <div class="hero-cat-speech-bubble" id="catMascotSpeech">${isKy ? 'Команда түз же коду менен кошул! 🐾' : 'Создай команду или вступи по коду! 🐾'}</div>
            <div class="pixelart-cat-scaler">
              <div class="pixelart-to-css" role="img" aria-label="Pixel art cat mascot"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Team Formation Choice Cards -->
      <div class="dashboard-content-grid" style="grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px;">
        <!-- Option 1: Create Team -->
        <div class="app-card card-blue-top" style="padding: 24px;">
          <div class="app-card-header" style="margin-bottom: 16px;">
            <h3 class="app-card-title">
              <span>🚀</span>
              <span>${isKy ? 'Жаңы команда түзүү' : 'Create New Team'}</span>
            </h3>
          </div>
          <p style="font-size: 14px; color: var(--ink-2); line-height: 1.5; margin-bottom: 20px;">
            ${isKy 
              ? 'Командаңыздын атын жазып түзүңүз. Сизге автоматтык түрдө чакыруу коду берилет. Аны өз филиалыңыздагы 2 катышуучу менен бөлүшүңүз.' 
              : 'Enter team name to generate your squad invite code. Share the code with 2 classmates from your branch.'}
          </p>

          <form id="createTeamForm" style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:6px;">
                ${isKy ? 'Команданын аталышы' : 'Team Name'} <span style="color:#ef4444;">*</span>
              </label>
              <input type="text" id="newTeamNameInput" class="reg-input" placeholder="${isKy ? 'Мисалы: Шумкарлар' : 'e.g. Phoenix Squad'}" required style="width:100%;" />
            </div>

            <div style="font-size:12.5px; color:var(--ink-2); background:var(--surface-2); padding:10px 14px; border-radius:8px; border:1px solid var(--line);">
              📍 <strong>${isKy ? 'Филиал:' : 'Branch:'}</strong> ${escapeHtml(pSchool)} (${isKy ? 'команда ушул филиалга бекитилет' : 'team will be locked to this branch'})
            </div>

            <div id="createTeamMsg" style="display:none; font-size:13px; font-weight:600;"></div>

            <button type="submit" id="createTeamSubmitBtn" class="btn btn-primary" style="width:100%; padding:10px; font-weight:600;">
              ✨ ${isKy ? 'Команда түзүү жана код алуу' : 'Create Team & Generate Code'}
            </button>
          </form>
        </div>

        <!-- Option 2: Join Team by Code -->
        <div class="app-card card-gold-top" style="padding: 24px;">
          <div class="app-card-header" style="margin-bottom: 16px;">
            <h3 class="app-card-title">
              <span>🔑</span>
              <span>${isKy ? 'Код менен кошулуу' : 'Join Team by Code'}</span>
            </h3>
          </div>
          <p style="font-size: 14px; color: var(--ink-2); line-height: 1.5; margin-bottom: 20px;">
            ${isKy 
              ? 'Эгерде командалаштарыңыз команда түзүп койгон болсо, алардын 8 орундуу чакыруу кодун жазып, курамга кошулуңуз.' 
              : 'If your classmate already created a team, enter the 8-character invite code to join their squad.'}
          </p>

          <form id="joinTeamForm" style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:6px;">
                ${isKy ? 'Чакыруу коду' : 'Invite Code'} <span style="color:#ef4444;">*</span>
              </label>
              <input type="text" id="joinInviteCodeInput" class="reg-input" placeholder="AKYL-XXXX" maxlength="12" required style="width:100%; text-transform:uppercase; font-family:monospace; font-weight:700; letter-spacing:1px;" />
            </div>

            <div style="font-size:12.5px; color:var(--ink-2); background:var(--surface-2); padding:10px 14px; border-radius:8px; border:1px solid var(--line);">
              ⚠️ ${isKy ? `Эскертүү: Сиздин филиал ${pSchool}. Сиз башка филиалдын командасына кошула албайсыз.` : `Note: Your branch is ${pSchool}. You can only join teams from the same branch.`}
            </div>

            <div id="joinTeamMsg" style="display:none; font-size:13px; font-weight:600;"></div>

            <button type="submit" id="joinTeamSubmitBtn" class="btn btn-primary" style="width:100%; padding:10px; font-weight:600;">
              🤝 ${isKy ? 'Командага кошулуу' : 'Join Team'}
            </button>
          </form>
        </div>
      </div>
    `;

    // Attach Create Team handler
    document.getElementById('createTeamForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('newTeamNameInput');
      const msgEl = document.getElementById('createTeamMsg');
      const submitBtn = document.getElementById('createTeamSubmitBtn');
      const teamName = (nameInput?.value || '').trim();
      if (!teamName) return;

      submitBtn.disabled = true;
      submitBtn.textContent = isKy ? 'Түзүлүүдө...' : 'Creating...';
      msgEl.style.display = 'none';

      try {
        const res = await apiFetch('/api/teams/create', {
          method: 'POST',
          body: JSON.stringify({ team_name: teamName })
        });
        if (res.ok) {
          msgEl.style.display = 'block';
          msgEl.style.color = '#10b981';
          msgEl.textContent = isKy ? `Команда түзүлдү! Код: ${res.invite_code}` : `Team created! Code: ${res.invite_code}`;
          setTimeout(() => { load(); }, 700);
        }
      } catch (err) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#ef4444';
        msgEl.textContent = err.message || (isKy ? 'Ката кетти' : 'Error creating team');
        submitBtn.disabled = false;
        submitBtn.textContent = isKy ? 'Команда түзүү жана код алуу' : 'Create Team & Generate Code';
      }
    });

    // Attach Join Team handler
    document.getElementById('joinTeamForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('joinInviteCodeInput');
      const msgEl = document.getElementById('joinTeamMsg');
      const submitBtn = document.getElementById('joinTeamSubmitBtn');
      const inviteCode = (codeInput?.value || '').trim().toUpperCase();
      if (!inviteCode) return;

      submitBtn.disabled = true;
      submitBtn.textContent = isKy ? 'Текшерилүүдө...' : 'Joining...';
      msgEl.style.display = 'none';

      try {
        const res = await apiFetch('/api/teams/join', {
          method: 'POST',
          body: JSON.stringify({ invite_code: inviteCode })
        });
        if (res.ok) {
          msgEl.style.display = 'block';
          msgEl.style.color = '#10b981';
          msgEl.textContent = isKy ? 'Ийгиликтүү кошулдуңуз!' : 'Joined successfully!';
          setTimeout(() => { load(); }, 700);
        }
      } catch (err) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#ef4444';
        msgEl.textContent = err.message || (isKy ? 'Код туура эмес же ката' : 'Invalid code or error');
        submitBtn.disabled = false;
        submitBtn.textContent = isKy ? 'Командага кошулуу' : 'Join Team';
      }
    });

    if (typeof AkylI18n !== 'undefined' && AkylI18n.applyI18n) {
      AkylI18n.applyI18n(AkylI18n.getLang(), out);
    }
    return;
  }

  // ==========================================
  // CASE 2: Student is in a team (State 2, 3, 4)
  // ==========================================
  const team = window.currentTeam;
  const teammates = window.teammatesList || [];
  const categories = window.categoriesList || [];
  const memberCount = teammates.length;
  const isFull = memberCount === 3;
  const isReady = team.status === 'ready';

  // Status badge config
  let statusBadgeHtml = '';
  if (isReady) {
    statusBadgeHtml = `<span style="display:inline-flex; align-items:center; gap:6px; background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:4px 12px; border-radius:9999px; font-size:12.5px; font-weight:700;">🟢 ${isKy ? 'Команда даяр (3/3)' : 'Squad Ready (3/3)'}</span>`;
  } else if (isFull) {
    statusBadgeHtml = `<span style="display:inline-flex; align-items:center; gap:6px; background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; padding:4px 12px; border-radius:9999px; font-size:12.5px; font-weight:700;">🔵 ${isKy ? 'Категорияларды тандоо (3/3)' : 'Category Selection (3/3)'}</span>`;
  } else {
    statusBadgeHtml = `<span style="display:inline-flex; align-items:center; gap:6px; background:#fef3c7; color:#b45309; border:1px solid #fcd34d; padding:4px 12px; border-radius:9999px; font-size:12.5px; font-weight:700;">🟡 ${isKy ? `Катышуучуларды күтүү (${memberCount}/3)` : `Gathering Squad (${memberCount}/3)`}</span>`;
  }

  // Build 3 distinct slots
  const slotsHtml = [0, 1, 2].map(slotIdx => {
    const mem = teammates[slotIdx] || null;
    const slotNum = slotIdx + 1;
    if (mem) {
      const isMe = mem.id === participant.id;
      const memCat = categories.find(c => c.id === mem.category_id);
      const catTitle = memCat ? (isKy ? memCat.name_ky : memCat.name_ru) : (isKy ? 'Категория тандала элек' : 'No category selected');
      const isConfirmed = !!mem.category_confirmed;

      return `
        <div class="member-item-row" style="background:var(--surface); border:1px solid ${isMe ? 'var(--accent)' : 'var(--line)'}; border-radius:12px; padding:16px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span class="member-index-badge" style="background:${isMe ? 'var(--accent)' : 'var(--surface-2)'}; color:${isMe ? '#fff' : 'var(--ink)'}; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-weight:700;">${slotNum}</span>
              <div>
                <div style="font-weight:700; font-size:15px; color:var(--ink);">
                  ${escapeHtml(mem.full_name || `Member #${slotNum}`)}
                  ${isMe ? `<span style="font-size:11.5px; padding:2px 8px; background:var(--accent-wash); color:var(--accent); border-radius:6px; font-weight:700; margin-left:6px;">${isKy ? 'Сиз' : 'You'}</span>` : ''}
                </div>
                <div style="font-size:12.5px; color:var(--ink-2); margin-top:2px;">
                  ${escapeHtml(mem.school || team.school || '')} · ${escapeHtml(mem.grade || '')}
                </div>
              </div>
            </div>

            <!-- Category & Confirmation Status -->
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <span style="font-size:12.5px; font-weight:600; padding:4px 10px; border-radius:8px; background:${memCat ? 'var(--accent-wash)' : 'var(--surface-2)'}; color:${memCat ? 'var(--accent)' : 'var(--ink-2)'};">
                📚 ${escapeHtml(catTitle)}
              </span>
              <span style="font-size:12px; font-weight:600; color:${isConfirmed ? '#16a34a' : '#d97706'};">
                ${isConfirmed ? (isKy ? '✓ Ырасталды' : '✓ Confirmed') : (isKy ? '⏳ Ырастала элек' : '⏳ Pending confirmation')}
              </span>
            </div>
          </div>

          ${isMe && (!isReady || !isConfirmed) ? `
            <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--line); display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
              <label style="font-size:13px; font-weight:600; color:var(--ink);">${isKy ? 'Сиздин категорияңыз:' : 'Your Category:'}</label>
              <select id="myCategorySelect" class="reg-select" style="max-width:240px; padding:6px 12px; font-size:13px;">
                <option value="">${isKy ? '-- Категорияны тандаңыз --' : '-- Select Category --'}</option>
                ${categories.map(c => {
                  const isTakenByOther = teammates.some(t => t.id !== participant.id && t.category_id === c.id);
                  const isSelected = mem.category_id === c.id;
                  const cTitle = isKy ? c.name_ky : c.name_ru;
                  return `<option value="${c.id}" ${isSelected ? 'selected' : ''} ${isTakenByOther ? 'disabled' : ''}>${escapeHtml(cTitle)}${isTakenByOther ? ` (${isKy ? 'ээленген' : 'taken'})` : ''}</option>`;
                }).join('')}
              </select>
              <button type="button" id="confirmMyCategoryBtn" class="btn btn-primary" style="padding:6px 16px; font-size:13px;">
                ${isKy ? 'Категорияны бекитүү жана ырастоо' : 'Save & Confirm Category'}
              </button>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      return `
        <div class="member-item-row" style="background:var(--paper); border:1.5px dashed var(--line); border-radius:12px; padding:16px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="background:var(--surface-2); color:var(--ink-2); width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-weight:700;">${slotNum}</span>
            <div>
              <div style="font-weight:600; font-size:14px; color:var(--ink-2);">
                ${isKy ? `Бош орун #${slotNum}` : `Empty Slot #${slotNum}`}
              </div>
              <div style="font-size:12px; color:var(--ink-2);">
                ${isKy ? `Филиалдагы катышуучуну күтүү (${team.school})` : `Waiting for teammate from branch (${team.school})`}
              </div>
            </div>
          </div>
          <button type="button" class="copy-invite-code-btn btn" data-code="${escapeHtml(team.invite_code || '')}" style="font-size:12.5px; padding:6px 12px; background:var(--surface); border:1px solid var(--line);">
            📋 ${isKy ? 'Кодду көчүрүү' : 'Copy Code'}
          </button>
        </div>
      `;
    }
  }).join('');

  out.innerHTML = `
    <!-- Welcome Hero Banner -->
    <div class="dashboard-hero-card">
      <div class="hero-content">
        <div class="hero-text-block">
          <div style="display:inline-flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
            <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 14px; background:var(--app-primary-light); border:1px solid var(--app-primary-border); border-radius:9999px; color:var(--app-primary-dark); font-size:12.5px; font-weight:700;">
              <span>🏆</span>
              <span>Akylman Quiz Bowl</span>
            </div>
            ${statusBadgeHtml}
          </div>

          <h2>«${escapeHtml(team.team_name || 'Команда')}»</h2>

          <ul class="hero-bullet-list">
            <li class="hero-bullet-item">
              <span class="hero-bullet-dot"></span>
              <span><strong>${isKy ? 'Филиал:' : 'Branch:'}</strong> ${escapeHtml(team.school || '')}</span>
            </li>
            <li class="hero-bullet-item">
              <span class="hero-bullet-dot"></span>
              <span><strong>${isKy ? 'Курамы:' : 'Roster:'}</strong> ${memberCount} / 3 ${isKy ? 'катышуучу' : 'members'}</span>
            </li>
            <li class="hero-bullet-item">
              <span class="hero-bullet-dot"></span>
              <span><strong>${isKy ? 'Чакыруу коду:' : 'Invite Code:'}</strong> <code style="font-weight:700; font-size:15px; background:var(--accent-wash); color:var(--accent); padding:2px 8px; border-radius:6px; letter-spacing:1px;">${escapeHtml(team.invite_code || '')}</code></span>
            </li>
          </ul>

          <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" id="heroCopyCodeBtn" class="btn" style="background:var(--surface); border:1px solid var(--line); font-size:13px; font-weight:600; padding:8px 16px;">
              📋 ${isKy ? 'Чакыруу кодун көчүрүү' : 'Copy Invite Code'}
            </button>
            <button type="button" id="renameTeamBtn" class="btn" style="background:var(--surface); border:1px solid var(--line); font-size:13px; font-weight:600; padding:8px 16px;">
              ✏️ ${isKy ? 'Атын өзгөртүү' : 'Изменить название'}
            </button>
            <button type="button" id="leaveTeamBtn" class="btn" style="background:transparent; border:1px solid #fecaca; color:#dc2626; font-size:13px; padding:8px 14px;">
              🚪 ${isKy ? 'Командадан чыгуу' : 'Leave Team'}
            </button>
          </div>
        </div>

        <!-- Animated Pixel Art Cat Mascot -->
        <div class="hero-cat-container" id="teamCatMascot" title="${isKy ? 'Команданын талисманы 🐾' : 'Team Mascot 🐾'}">
          <div class="hero-cat-speech-bubble" id="catMascotSpeech">${isReady ? (isKy ? 'Команда даяр, алга! 🐾' : 'Team is ready, let\'s go! 🐾') : (isKy ? '3 катышуучу тең категориясын ырасташы керек! 🐾' : 'All 3 members must confirm their categories! 🐾')}</div>
          <div class="pixelart-cat-scaler">
            <div class="pixelart-to-css" role="img" aria-label="Pixel art cat mascot"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Squad Members & Category Matrix Card -->
    <div class="app-card card-blue-top" style="padding: 24px; margin-bottom: 24px;">
      <div class="app-card-header" style="margin-bottom: 16px;">
        <h3 class="app-card-title">
          <span>👥</span>
          <span>${isKy ? 'Команданын курамы жана категориялар (3 катышуучу)' : 'Squad Roster & 3-Way Category Distribution'}</span>
        </h3>
      </div>

      <div style="margin-bottom:16px; font-size:13.5px; color:var(--ink-2); line-height:1.5;">
        ${isKy 
          ? 'Ар бир катышуучу 3 категориянын бирин тандайт (бир категорияны 2 адам тандай албайт). Бардык 3 катышуучу тандоону ырастаганда гана команда сынакка даяр болот.' 
          : 'Each member takes exactly 1 distinct category. All 3 members must mutually confirm their category distribution to unlock tournament exams.'}
      </div>

      <div id="membersSlotsContainer">
        ${slotsHtml}
      </div>

      ${isReady ? `
        <div style="margin-top:16px; padding:14px 18px; background:#ecfdf5; border:1.5px solid #86efac; border-radius:10px; color:#15803d; font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:10px;">
          <span>🎉</span>
          <span>${isKy 
            ? 'Бардык 3 катышуучу категорияларды ийгиликтүү ырасташты! Сынак күнү ар бири өз категориясы боюнча тест тапшырат. Команданын упайы 3 катышуучунун тест упайларынын суммасы катары эсептелет.' 
            : 'All 3 members confirmed category distribution! On competition day, each student takes their category exam. Team standing is the sum of all 3 scores.'}</span>
        </div>
      ` : ''}
    </div>

    <!-- Quick Navigation Hub -->
    <div class="quick-hub-section">
      <div class="quick-hub-header">
        <span>⚡</span>
        <span>${isKy ? 'Негизги бөлүмдөр' : 'Quick Navigation'}</span>
      </div>
      <div class="quick-hub-grid">
        <div class="quick-hub-card" id="hubTileTests" role="button" tabindex="0">
          <div class="quick-hub-card-body">
            <div class="quick-hub-icon">📝</div>
            <div>
              <h4 class="quick-hub-title">${isKy ? 'Тестирлөө' : 'Online Testing'}</h4>
              <p class="quick-hub-desc">${isKy ? 'Сиздин категорияңыз боюнча тест' : 'Take your assigned category test'}</p>
            </div>
          </div>
          <div class="quick-hub-action-row">
            <span class="quick-hub-btn">${isKy ? 'Тесттерге өтүү →' : 'Go to tests →'}</span>
          </div>
        </div>

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

        <div class="quick-hub-card" id="hubTileLeaderboard" role="button" tabindex="0">
          <div class="quick-hub-card-body">
            <div class="quick-hub-icon">🏆</div>
            <div>
              <h4 class="quick-hub-title">${isKy ? 'Турнирдин рейтинги' : 'Leaderboard'}</h4>
              <p class="quick-hub-desc">${isKy ? '3 катышуучунун упайларынын суммасы' : 'Sum of 3 member test scores'}</p>
            </div>
          </div>
          <div class="quick-hub-action-row">
            <span class="quick-hub-btn">${isKy ? 'Рейтингди ачуу →' : 'Open leaderboard →'}</span>
          </div>
        </div>

        <div class="quick-hub-card" id="hubTileRules" role="button" tabindex="0">
          <div class="quick-hub-card-body">
            <div class="quick-hub-icon">📜</div>
            <div>
              <h4 class="quick-hub-title">${isKy ? 'Регламент жана эрежелер' : 'Regulations'}</h4>
              <p class="quick-hub-desc">${isKy ? 'Сынактын расмий тартиби' : 'Official tournament rules'}</p>
            </div>
          </div>
          <div class="quick-hub-action-row">
            <span class="quick-hub-btn">${isKy ? 'Эрежелерди окуу →' : 'Read rules →'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach Copy Code handler
  const copyBtns = out.querySelectorAll('.copy-invite-code-btn, #heroCopyCodeBtn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const code = team.invite_code || '';
      navigator.clipboard.writeText(code).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = `✓ ${isKy ? 'Көчүрүлдү!' : 'Copied!'}`;
        setTimeout(() => { btn.innerHTML = orig; }, 1800);
      }).catch(() => {
        prompt(isKy ? 'Кодду көчүрүңүз:' : 'Copy code:', code);
      });
    });
  });

  // Attach Confirm Category handler
  // Attach Confirm Category handler
  document.getElementById('confirmMyCategoryBtn')?.addEventListener('click', async () => {
    const sel = document.getElementById('myCategorySelect');
    const catId = sel?.value;
    if (!catId) {
      if (typeof Toast !== 'undefined') {
        Toast.error(isKy ? 'Категорияны тандаңыз' : 'Please select a category');
      }
      return;
    }

    try {
      // 1. Select category
      await apiFetch('/api/teams/category', {
        method: 'POST',
        body: JSON.stringify({ category_id: parseInt(catId, 10) })
      });
      // 2. Confirm category
      await apiFetch('/api/teams/confirm', {
        method: 'POST',
        body: JSON.stringify({ confirmed: true })
      });
      if (typeof Toast !== 'undefined') {
        Toast.success(isKy ? 'Категория ийгиликтүү ырасталды!' : 'Category successfully confirmed!');
      }
      load();
    } catch (err) {
      if (typeof Toast !== 'undefined') {
        Toast.error(err.message || (isKy ? 'Ката кетти' : 'Error confirming category'));
      }
    }
  });

  // Attach Rename Team handler
  document.getElementById('renameTeamBtn')?.addEventListener('click', async () => {
    const currentName = team.team_name || '';
    const newName = prompt(isKy ? 'Команданын жаңы аталышын киргизиңиз:' : 'Введите новое название команды:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    try {
      const res = await apiFetch('/api/teams/rename', {
        method: 'POST',
        body: JSON.stringify({ team_name: newName.trim() })
      });
      if (res && res.ok) {
        team.team_name = newName.trim();
        if (teamData) teamData.team_name = newName.trim();
        updateTeamNameHeader();
        if (typeof Toast !== 'undefined') {
          Toast.success(isKy ? 'Команданын аты өзгөртүлдү!' : 'Название команды обновлено!');
        }
        renderTeamSection(document.getElementById('tabTeam'));
      }
    } catch (err) {
      if (typeof Toast !== 'undefined') {
        Toast.error(err.message || (isKy ? 'Атын өзгөртүүдө ката чыкты' : 'Ошибка изменения названия команды'));
      } else {
        alert(err.message || (isKy ? 'Атын өзгөртүүдө ката чыкты' : 'Ошибка изменения названия команды'));
      }
    }
  });

  // Attach Leave Team handler
  document.getElementById('leaveTeamBtn')?.addEventListener('click', async () => {
    let ok = false;
    if (typeof showConfirmDialog === 'function') {
      ok = await showConfirmDialog({
        title: isKy ? 'Командадан чыгуу' : 'Leave Team',
        message: isKy ? 'Чын эле командадан чыгууну каалайсызбы?' : 'Are you sure you want to leave this team?',
        confirmText: isKy ? 'Чыгуу' : 'Leave',
        cancelText: isKy ? 'Жокко чыгаруу' : 'Cancel',
        isDestructive: true
      });
    } else {
      ok = confirm(isKy ? 'Чын эле командадан чыгууну каалайсызбы?' : 'Are you sure you want to leave this team?');
    }
    if (!ok) return;

    try {
      await apiFetch('/api/teams/leave', { method: 'POST' });
      if (typeof Toast !== 'undefined') {
        Toast.info(isKy ? 'Командадан чыктыңыз' : 'You left the team');
      }
      load();
    } catch (err) {
      if (typeof Toast !== 'undefined') {
        Toast.error(err.message || (isKy ? 'Ката кетти' : 'Error leaving team'));
      }
    }
  });

  // Quick Hub navigation
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

  // Mascot click interaction
  const catEl = document.getElementById('teamCatMascot');
  if (catEl) {
    const speechEl = document.getElementById('catMascotSpeech');
    const phrasesKy = [
      'Ийгилик, команда! 🐾',
      'Мяу! 100 упай алгыла! 🏆',
      'Биримдикте күч бар! 🍀',
      'Муррр... 3 адам тең жакшы тапшырсын! 🎯'
    ];
    const phrasesRu = [
      'Мяу! Вперёд к победе! 🐾',
      '100/100 очков впереди! 🏆',
      'Командный дух не сломить! ✨',
      'Сумма баллов всех 3 решит победу! ⚡'
    ];
    let phraseIdx = 0;
    catEl.addEventListener('click', () => {
      const list = isKy ? phrasesKy : phrasesRu;
      phraseIdx = (phraseIdx + 1) % list.length;
      if (speechEl) {
        speechEl.textContent = list[phraseIdx];
        speechEl.style.transform = 'scale(1.1) translateY(-3px)';
        setTimeout(() => { speechEl.style.transform = ''; }, 250);
      }
    });
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

// Dedicated Settings Section (Personal Profile & Password Management)
async function renderSettingsSection(btn) {
  if (btn) setActiveTab(btn);
  const out = document.getElementById('tabContent');
  out.setAttribute('aria-busy', 'true');
  out.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div class="app-skeleton" style="height: 90px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 320px; width: 100%;"></div>
      <div class="app-skeleton" style="height: 180px; width: 100%;"></div>
    </div>
  `;

  // Always refresh latest participant profile
  try {
    const data = await apiFetch('/api/me');
    if (data && data.ok) {
      window.participantData = data.participant;
      window.currentTeam = data.team;
      window.teammatesList = data.teammates || [];
      window.categoriesList = data.categories || [];
      teamData = data.team ? { ...data.team, members: data.teammates } : null;
      updateTeamNameHeader();
    }
  } catch (err) {
    console.warn('Profile fetch warning in renderSettingsSection:', err);
  }

  out.setAttribute('aria-busy', 'false');

  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';
  const p = window.participantData || {};
  const currentTeam = window.currentTeam;

  const fullNameVal = p.full_name || '';
  const emailVal = p.email || '';
  const gradeVal = p.grade || '';
  const branchVal = p.school || p.city || (isKy ? 'Көрсөтүлгөн эмес' : 'Не указан');

  out.innerHTML = `
    <div class="settings-container" style="max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
      
      <!-- Settings Header Banner -->
      <div class="settings-header-card" style="display: flex; justify-content: space-between; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <div>
          <h2 class="settings-header-title" style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 10px;">
            <span>⚙️</span>
            <span>${isKy ? 'Жеке жөндөөлөр' : 'Настройки профиля'}</span>
          </h2>
          <p class="settings-header-desc" style="margin: 0; font-size: 14px; color: var(--app-text-muted);">
            ${isKy ? 'Жеке маалыматтарды, класс жана сырсөздү башкаруу' : 'Управление личными данными, своим классом и паролем'}
          </p>
        </div>
        <div>
          <span style="font-size: 12.5px; background: var(--app-primary-light); border: 1px solid var(--app-primary-border); color: var(--app-primary-dark); padding: 6px 14px; border-radius: 9999px; font-weight: 700;">
            ID #${p.id || ''}
          </span>
        </div>
      </div>

      <!-- Card 1: Personal Data Editing -->
      <div class="settings-card card-blue-top" style="background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <div class="settings-card-header" style="margin-bottom: 20px; border-bottom: 1px solid var(--line); padding-bottom: 14px;">
          <h3 class="settings-card-title" style="margin: 0; font-size: 17px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 8px;">
            <span>👤</span>
            <span>${isKy ? 'Жеке маалыматтар' : 'Личные данные участника'}</span>
          </h3>
          <span style="font-size: 12.5px; color: var(--app-text-muted);">${isKy ? 'Аты-жөнүңүздү, класс жана почтаңызды өзгөртө аласыз' : 'Изменение имени, почты и класса'}</span>
        </div>

        <form id="personalSettingsForm" style="display: flex; flex-direction: column; gap: 18px;">
          <div class="settings-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
            <!-- Full Name -->
            <div class="settings-field">
              <label class="settings-label" for="setFullName" style="display: block; margin-bottom: 6px; font-size: 13.5px; font-weight: 600; color: var(--ink);">
                <span>${isKy ? 'Аты-жөнү (ФИО)' : 'Свое имя (ФИО)'}</span> <span style="color:#ef4444">*</span>
              </label>
              <input type="text" id="setFullName" class="settings-input reg-input" value="${escapeHtml(fullNameVal)}" placeholder="${isKy ? 'Асанов Үсөн' : 'Иванов Иван Иванович'}" required style="width: 100%; min-height: 44px;"/>
            </div>

            <!-- Email -->
            <div class="settings-field">
              <label class="settings-label" for="setEmail" style="display: block; margin-bottom: 6px; font-size: 13.5px; font-weight: 600; color: var(--ink);">
                <span>✉️ ${isKy ? 'Электрондук почта' : 'Почта (Email)'}</span> <span style="color:#ef4444">*</span>
              </label>
              <input type="email" id="setEmail" class="settings-input reg-input" value="${escapeHtml(emailVal)}" placeholder="example@email.com" required style="width: 100%; min-height: 44px;"/>
            </div>

            <!-- Grade / Class -->
            <div class="settings-field">
              <label class="settings-label" for="setGrade" style="display: block; margin-bottom: 6px; font-size: 13.5px; font-weight: 600; color: var(--ink);">
                <span>🎓 ${isKy ? 'Сиздин класс' : 'Свой класс'}</span> <span style="color:#ef4444">*</span>
              </label>
              <select id="setGrade" class="settings-select reg-select" required style="width: 100%; min-height: 44px;">
                ${buildClassSelectOptions(gradeVal, isKy)}
              </select>
            </div>

            <!-- Branch (Fixed / Read-only) -->
            <div class="settings-field">
              <label class="settings-label" style="display: block; margin-bottom: 6px; font-size: 13.5px; font-weight: 600; color: var(--ink);">
                <span>📍 ${isKy ? 'Филиал' : 'Филиал'}</span>
              </label>
              <div style="min-height: 44px; display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px;">
                <span style="font-weight: 700; color: var(--app-primary-dark);">${escapeHtml(branchVal)}</span>
                <span style="font-size: 11.5px; color: var(--ink-2); margin-left: auto;">${isKy ? 'Каттоого бекитилген' : 'Привязан к регистрации'}</span>
              </div>
            </div>
          </div>

          <!-- Status Feedback -->
          <div id="settingsStatusMsg" style="display: none; padding: 12px 18px; border-radius: 10px; font-size: 14px; font-weight: 600; width: 100%; box-sizing: border-box;"></div>

          <!-- Save Button -->
          <div style="display: flex; justify-content: flex-end; padding-top: 8px;">
            <button type="submit" id="saveSettingsBtn" class="btn btn-primary" style="padding: 11px 24px; font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
              <span>💾</span>
              <span>${isKy ? 'Өзгөртүүлөрдү сактоо' : 'Сохранить изменения'}</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Card 2: Security & Password -->
      <div class="settings-card" style="background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <div class="settings-card-header" style="margin-bottom: 16px; border-bottom: 1px solid var(--line); padding-bottom: 14px;">
          <h3 class="settings-card-title" style="margin: 0; font-size: 17px; font-weight: 700; color: var(--app-text-main); display: flex; align-items: center; gap: 8px;">
            <span>🔐</span>
            <span>${isKy ? 'Сырсөз жана коопсуздук' : 'Пароль и безопасность'}</span>
          </h3>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-size: 14px; font-weight: 600; color: var(--app-text-main); margin-bottom: 4px;">
              ${isKy ? 'Аккаунтка кирүү сырсөзүн алмаштыруу' : 'Смена пароля от учетной записи'}
            </div>
            <div style="font-size: 13px; color: var(--app-text-muted);">
              ${isKy ? 'Сырсөз кеминде 8 белгиден турушу керек' : 'Пароль должен содержать не менее 8 символов'}
            </div>
          </div>
          <button type="button" id="settingsChangePassBtn" class="btn" style="background: var(--surface); border: 1px solid var(--line); color: var(--app-text-main); font-weight: 600; padding: 10px 20px; font-size: 13.5px;">
            🔐 ${isKy ? 'Сырсөздү алмаштыруу' : 'Изменить пароль'}
          </button>
        </div>
      </div>

      <!-- Card 3: Notice about Team Section -->
      <div class="settings-card card-gold-top" style="background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #fef3c7; color: #b45309; border-radius: 6px; font-size: 12px; font-weight: 700; margin-bottom: 8px;">
              👥 ${isKy ? 'Команда бөлүмү' : 'Раздел «Команда»'}
            </div>
            <h4 style="margin: 0 0 6px 0; font-size: 16px; color: var(--app-text-main); font-weight: 700;">
              ${currentTeam ? (isKy ? `Сиз «${escapeHtml(currentTeam.team_name || '')}» командасындасыз` : `Вы состоите в команде «${escapeHtml(currentTeam.team_name || '')}»`) : (isKy ? 'Сиз азырынча командада жоксуз' : 'Вы пока не состоите в команде')}
            </h4>
            <p style="margin: 0; font-size: 13.5px; color: var(--ink-2); line-height: 1.5;">
              ${isKy 
                ? 'Команда түзүү, атын өзгөртүү, катышуучуларды көрүү жана категорияларды тандоо — өзүнчө «Команда» бөлүмүндө жүргүзүлөт.' 
                : 'Создание команды, изменение названия, просмотр участников и выбор категорий осуществляются в разделе «Команда».'}
            </p>
          </div>
          <button type="button" id="settingsGoTeamBtn" class="btn btn-primary" style="padding: 10px 20px; font-size: 13.5px; font-weight: 600;">
            👥 ${isKy ? '«Команда» бөлүмүнө өтүү' : 'Перейти в раздел «Команда»'} →
          </button>
        </div>
      </div>

    </div>
  `;

  // Attach dynamic handlers
  document.getElementById('settingsChangePassBtn')?.addEventListener('click', handlePasswordChange);
  document.getElementById('settingsGoTeamBtn')?.addEventListener('click', () => {
    document.getElementById('tabTeam')?.click();
  });

  const form = document.getElementById('personalSettingsForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePersonalSettings();
  });
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

async function savePersonalSettings() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';

  const fullName = document.getElementById('setFullName')?.value.trim();
  const email = document.getElementById('setEmail')?.value.trim();
  const grade = document.getElementById('setGrade')?.value.trim();

  if (!fullName) {
    showSettingsMessage(isKy ? 'Аты-жөнүңүздү жазыңыз' : 'Введите свое имя (ФИО)', true);
    document.getElementById('setFullName')?.focus();
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showSettingsMessage(isKy ? 'Туура электрондук почтаны жазыңыз' : 'Укажите корректный адрес электронной почты', true);
    document.getElementById('setEmail')?.focus();
    return;
  }

  if (!grade) {
    showSettingsMessage(isKy ? 'Классты тизмеден тандаңыз' : 'Выберите свой класс из списка', true);
    document.getElementById('setGrade')?.focus();
    return;
  }

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span>⏳</span> <span>${isKy ? 'Сакталууда...' : 'Сохранение...'}</span>`;
    }

    const res = await apiFetch('/api/me', {
      method: 'PUT',
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        grade: grade
      })
    });

    if (res && res.ok && res.participant) {
      window.participantData = res.participant;
      updateTeamNameHeader();
      showSettingsMessage(isKy ? '✓ Өзгөртүүлөр ийгиликтүү сакталды!' : '✓ Личные данные успешно сохранены!', false);
    } else {
      showSettingsMessage(res?.error || (isKy ? 'Сактоодо ката чыкты' : 'Не удалось сохранить изменения'), true);
    }
  } catch (err) {
    console.error('Save personal settings error:', err);
    showSettingsMessage(err.message || (isKy ? 'Ката кетти' : 'Произошла ошибка при сохранении'), true);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<span>💾</span> <span>${isKy ? 'Өзгөртүүлөрдү сактоо' : 'Сохранить изменения'}</span>`;
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
      const testCard = b.closest('.test-card-modern') || b.closest('.test-card');
      const title = testCard?.querySelector('.test-card-title')?.textContent || '';
      b.onclick = () => showProctorBriefingModal(b.dataset.id, title);
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

function showProctorBriefingModal(testId, testTitle = '') {
  const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
  const isKy = lang === 'ky';
  const isRu = lang === 'ru';

  let modal = document.getElementById('proctorBriefModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'proctorBriefModal';
  modal.className = 'proctor-brief-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const titleText = isKy ? 'Тестти толук экранда тапшыруу' : (isRu ? 'Сдача теста в полноэкранном режиме' : 'Fullscreen Proctoring Mode');
  const rule1Title = isKy ? 'Толук экран режими' : (isRu ? 'Полноэкранный режим' : 'Fullscreen Mode');
  const rule1Desc = isKy 
    ? 'Тест бүткөнгө чейин браузер толук экран режиминде болот. Чыгууга жана башка барактарга өтүүгө болбойт.' 
    : (isRu ? 'Тест развернется на весь экран. Выход из полноэкранного режима и навигация по сайту заблокированы.' : 'The test opens in full screen. Exiting fullscreen and site navigation are locked until submitted.');

  const rule2Title = isKy ? 'Өтмөктөрдү которууга тыюу салынат' : (isRu ? 'Запрет переключения вкладок' : 'Tab Switching Prohibited');
  const rule2Desc = isKy 
    ? 'Башка өтмөккө, терезеге же программага өтүү аракети эреже бузуу катары катталат.' 
    : (isRu ? 'Попытки свернуть окно, переключиться на другие вкладки или сторонние приложения фиксируются.' : 'Attempts to switch tabs, minimize windows, or use other apps are recorded as violations.');

  const rule3Title = isKy ? '3 эскертүү чеги' : (isRu ? 'Лимит в 3 предупреждения' : '3-Warning Maximum Limit');
  const rule3Desc = isKy 
    ? '3 эскертүүдөн кийин тест автоматтык түрдө аяктап, учурдагы жооптор жөнөтүлөт.' 
    : (isRu ? 'После 3 предупреждений тест завершится автоматически с отправкой текущих ответов.' : 'After 3 warnings, the test is automatically ended and your answers are submitted.');

  const cancelBtnText = isKy ? 'Артка' : (isRu ? 'Отмена' : 'Cancel');
  const startBtnText = isKy ? '⛶ Эрежелерди кабыл алып баштоо' : (isRu ? '⛶ Принять правила и начать' : '⛶ Accept & Start Test');

  modal.innerHTML = `
    <div class="proctor-brief-card">
      <div class="proctor-brief-header">
        <span class="proctor-brief-icon">🔒</span>
        <h3 class="proctor-brief-title">${titleText}</h3>
      </div>
      <p class="proctor-brief-subtitle">${escapeHtml(testTitle || '')}</p>

      <div class="proctor-brief-rules">
        <div class="proctor-rule-item">
          <span class="proctor-rule-num">1</span>
          <div>
            <strong>${rule1Title}</strong>
            <p>${rule1Desc}</p>
          </div>
        </div>
        <div class="proctor-rule-item">
          <span class="proctor-rule-num">2</span>
          <div>
            <strong>${rule2Title}</strong>
            <p>${rule2Desc}</p>
          </div>
        </div>
        <div class="proctor-rule-item">
          <span class="proctor-rule-num">3</span>
          <div>
            <strong>${rule3Title}</strong>
            <p>${rule3Desc}</p>
          </div>
        </div>
      </div>

      <div class="proctor-brief-actions">
        <button type="button" class="btn btn-secondary" id="proctorCancelBtn">${cancelBtnText}</button>
        <button type="button" class="btn btn-primary" id="proctorStartBtn">
          <span>${startBtnText}</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('proctorCancelBtn').onclick = () => {
    modal.remove();
  };

  document.getElementById('proctorStartBtn').onclick = async () => {
    modal.remove();
    // Synchronously request browser fullscreen on click user activation
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen().catch(() => {});
      } else if (el.mozRequestFullScreen) {
        await el.mozRequestFullScreen().catch(() => {});
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen().catch(() => {});
      }
    } catch {}
    executeStartTest(testId);
  };
}

async function startTest(id, title = '') {
  showProctorBriefingModal(id, title);
}

async function executeStartTest(id) {
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
    tabTeam: { section: 'team', render: renderTeamSection },
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

// Router for subpages: /team, /team/main, /team/team, /team/tests, /team/results, /team/leaderboard, /team/announcements, /team/support, /team/settings
function initTeamSectionFromUrl() {
  const path = window.location.pathname || '';
  const match = path.match(/^\/team\/([^/]+)/);
  const section = match ? match[1] : 'main';
  const map = {
    main: 'tabHome',
    team: 'tabTeam',
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
