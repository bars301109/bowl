/**
 * Akylman Quiz Bowl — Homepage Logic
 * Supports Kyrgyz (KY) and English (EN)
 */
(function() {
  'use strict';

  function addOrnaments() {
    const ornaments = ['orn-1.png', 'orn-2.png'];
    const horizontalOpposite = {
      'top-left': 'top-right',
      'top-right': 'top-left',
      'bottom-left': 'bottom-right',
      'bottom-right': 'bottom-left'
    };
    
    const sections = document.querySelectorAll('section:not(.hero)');
    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    let prevCorner = null;
    
    sections.forEach((section, index) => {
      const ornament = ornaments[index % 2];
      
      let corner;
      if (prevCorner) {
        corner = horizontalOpposite[prevCorner];
      } else {
        corner = corners[Math.floor(Math.random() * corners.length)];
      }
      
      prevCorner = corner;
      
      const ornDiv = document.createElement('div');
      ornDiv.className = `ornament ${corner}`;
      ornDiv.style.backgroundImage = `url('/images/${ornament}')`;
      section.appendChild(ornDiv);
    });
  }
  
  // Initialize language switcher when AkylI18n is ready
  function initLanguageSwitcher() {
    if (typeof AkylI18n !== 'undefined' && AkylI18n.initSwitcher) {
      AkylI18n.initSwitcher();
    } else {
      setTimeout(initLanguageSwitcher, 50);
    }
  }

  function updateNavBar() {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';

    // Check auth status via API (supports Bearer token and cookies)
    fetch('/api/me', { headers, credentials: 'include' })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((data) => {
        const team = (data && data.team) || data || {};
        const teamName = team.team_name || (lang === 'ky' ? 'Команда' : 'Team');

        const navReg = document.getElementById('nav-register');
        const navLog = document.getElementById('nav-login');
        const navProf = document.getElementById('nav-profile');
        const navOut = document.getElementById('nav-logout');

        const heroTeam = document.getElementById('hero-team-btn');

        const footLog = document.getElementById('footer-login');
        const footReg = document.getElementById('footer-register');
        const footProf = document.getElementById('footer-profile');

        if (navReg) navReg.style.display = 'none';
        if (navLog) navLog.style.display = 'none';
        if (navProf) {
          navProf.style.display = 'inline-flex';
          navProf.innerHTML = `<span>🏆</span> <span>${lang === 'ky' ? 'Кабинет' : 'Cabinet'} (${teamName})</span>`;
        }
        if (navOut) navOut.style.display = 'inline-flex';

        if (heroTeam) {
          heroTeam.style.display = 'inline-block';
          heroTeam.innerHTML = `<span>🏆 ${lang === 'ky' ? 'Кабинетке өтүү' : 'Go to Cabinet'} (${teamName}) →</span>`;
        }

        if (footLog) footLog.style.display = 'none';
        if (footReg) footReg.style.display = 'none';
        if (footProf) {
          footProf.style.display = 'inline';
          footProf.textContent = `🏆 ${lang === 'ky' ? 'Кабинет' : 'Cabinet'} (${teamName})`;
        }
      })
      .catch(() => {
        const navReg = document.getElementById('nav-register');
        const navLog = document.getElementById('nav-login');
        const navProf = document.getElementById('nav-profile');
        const navOut = document.getElementById('nav-logout');

        const heroTeam = document.getElementById('hero-team-btn');

        const footLog = document.getElementById('footer-login');
        const footReg = document.getElementById('footer-register');
        const footProf = document.getElementById('footer-profile');

        if (navReg) navReg.style.display = 'inline-flex';
        if (navLog) navLog.style.display = 'inline-flex';
        if (navProf) navProf.style.display = 'none';
        if (navOut) navOut.style.display = 'none';

        if (heroTeam) heroTeam.style.display = 'none';

        if (footLog) footLog.style.display = 'inline';
        if (footReg) footReg.style.display = 'inline';
        if (footProf) footProf.style.display = 'none';
      });
  }

  window.logout = function() {
    const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
    const msg = lang === 'ky'
      ? 'Чын эле команданын аккаунтунан чыгууну каалайсызбы?'
      : 'Are you sure you want to log out of the team account?';
    if (confirm(msg)) {
      localStorage.removeItem('token');
      localStorage.removeItem('team');
      localStorage.removeItem('team_id');
      fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
        window.location.href = '/';
      });
    }
  };

  function formatDate(dateStr, lang = 'en') {
    if (!dateStr) return dateStr;
    
    const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsKy = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    
    let date;
    if (dateStr.includes('-') && !dateStr.includes(',')) {
      const [year, month, day] = dateStr.split('-');
      date = new Date(year, parseInt(month) - 1, day);
    } else {
      date = new Date(dateStr);
    }
    
    if (isNaN(date.getTime())) return dateStr;
    
    const d = date.getDate();
    const m = date.getMonth();
    const y = date.getFullYear();
    
    if (lang === 'ky') {
      return `${d}-${monthsKy[m]}, ${y}-жыл`;
    }
    return `${monthsEn[m]} ${d}, ${y}`;
  }
  
  async function renderSettings() {
    try {
      const s = await fetch('/api/settings').then(r => r.json());
      const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
      if (s) {
        if (s.day1_date && document.getElementById('d1')) document.getElementById('d1').textContent = formatDate(s.day1_date, lang);
        if (s.day2_date && document.getElementById('d2')) document.getElementById('d2').textContent = formatDate(s.day2_date, lang);
        if (s.day3_date && document.getElementById('d3')) document.getElementById('d3').textContent = formatDate(s.day3_date, lang);
        if ((s.final_place_en || s.final_place_ru || s.final_place_ky) && document.getElementById('finalPlace')) {
          document.getElementById('finalPlace').textContent = lang === 'ky' ? (s.final_place_ky || '') : (s.final_place_en || s.final_place_ru || '');
        }
      }
    } catch (e) {
      console.warn('settings load failed', e);
    }
  }
  
  function getCategoryMeta(title = '') {
    const lower = title.toLowerCase();
    if (lower.includes('информ') || lower.includes('компьют') || lower.includes('cs') || lower.includes('it') || lower.includes('inform')) {
      return {
        themeClass: 'cat-informatics',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
        tagEn: 'Informatics & IT',
        tagKy: 'Информатика жана IT',
        isFiller: false
      };
    }
    if (lower.includes('матем') || lower.includes('геометр') || lower.includes('алгебр') || lower.includes('math')) {
      return {
        themeClass: 'cat-math',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M4 5h16M14 5l-4 14"></path></svg>',
        tagEn: 'Math & Logic',
        tagKy: 'Математика жана логика',
        isFiller: false
      };
    }
    if (lower.includes('кыргызстан') || lower.includes('тануу') || lower.includes('таануу') || lower.includes('kyrgyz')) {
      return {
        themeClass: 'cat-kyrgyzstan',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 22 22 22 12 2"></polygon><line x1="12" y1="12" x2="12" y2="18"></line></svg>',
        tagEn: 'History & Culture of KR',
        tagKy: 'КР тарыхы жана маданияты',
        isFiller: false
      };
    }
    if (lower.includes('англ') || lower.includes('english') || lower.includes('тил') || lower.includes('lang')) {
      return {
        themeClass: 'cat-english',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z"></path></svg>',
        tagEn: 'English Proficiency',
        tagKy: 'Англис тили',
        isFiller: false
      };
    }
    if (lower.includes('логик') || lower.includes('эрудиц') || lower.includes('logic')) {
      return {
        themeClass: 'cat-logic',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"></path></svg>',
        tagEn: 'Thematic Round',
        tagKy: 'Тематикалык раунд',
        isFiller: false
      };
    }
    if (lower.includes('маданий') || lower.includes('маданият') || lower.includes('культур') || lower.includes('culture')) {
      return {
        themeClass: 'cat-culture',
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="20" y2="21"></line><line x1="4" y1="10" x2="20" y2="10"></line><polygon points="12 2 4 10 20 10 12 2"></polygon><line x1="7" y1="10" x2="7" y2="21"></line><line x1="12" y1="10" x2="12" y2="21"></line><line x1="17" y1="10" x2="17" y2="21"></line></svg>',
        tagEn: 'Special Discipline',
        tagKy: 'Атайын багыт',
        isFiller: false
      };
    }
    return {
      themeClass: 'cat-default',
      iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
      tagEn: 'Olympiad Discipline',
      tagKy: 'Олимпиадалык багыт',
      isFiller: false
    };
  }

  let categoriesCache = null;
  
  async function renderCategories() {
    if (typeof AkylI18n === 'undefined') {
      setTimeout(renderCategories, 100);
      return;
    }
    
    const lang = AkylI18n.getLang();
    const grid = document.getElementById('catsGrid');
    const list = document.getElementById('cats-list');
    
    if (!grid) return;
    
    try {
      const response = await fetch('/api/categories', { cache: 'no-store' });
      if (!response.ok) {
        if (categoriesCache && categoriesCache.length > 0) {
          renderCategoriesFromData(categoriesCache, lang, grid, list);
        } else {
          grid.innerHTML = '<p style="text-align:center;color:#ef4444;grid-column:1/-1;">' + (lang === 'ky' ? 'Категорияларды жүктөөдө ката.' : 'Failed to load categories. Please refresh the page.') + '</p>';
        }
        return;
      }
      const cats = await response.json();
      
      if (!Array.isArray(cats)) {
        if (categoriesCache && categoriesCache.length > 0) {
          renderCategoriesFromData(categoriesCache, lang, grid, list);
        }
        return;
      }
      
      categoriesCache = cats;
      renderCategoriesFromData(cats, lang, grid, list);
    } catch (e) { 
      console.error('categories load failed', e);
      if (categoriesCache && categoriesCache.length > 0) {
        renderCategoriesFromData(categoriesCache, lang, grid, list);
      } else {
        grid.innerHTML = '<p style="text-align:center;color:#ef4444;grid-column:1/-1;">' + (lang === 'ky' ? 'Категорияларды жүктөөдө ката.' : 'Failed to load categories.') + '</p>';
      }
    }
  }
  
  function renderCategoriesFromData(cats, lang, grid, list) {
    function escHtml(text) {
      const div = document.createElement('div');
      div.textContent = text ?? '';
      return div.innerHTML;
    }

    if (!cats || !Array.isArray(cats) || cats.length === 0) {
      if (grid) grid.innerHTML = '<p style="text-align:center;color:#64748b;grid-column:1/-1;padding:24px 0;">' + (lang === 'ky' ? 'Категориялар жакында жарыяланат.' : 'Categories will be announced soon.') + '</p>';
      if (list) list.innerHTML = '<p style="margin:4px 0 0 0;color:#64748b;font-size:14px;">' + (lang === 'ky' ? 'Категориялар жакында жарыяланат' : 'Categories will be announced soon') + '</p>';
      return;
    }
    
    if (!grid) return;

    const displayCats = [...cats];
    try {
      grid.innerHTML = displayCats.map((c, idx) => {
        const title = lang === 'ky'
          ? (c.name_ky || c.name_en || c.name_ru || '')
          : (c.name_en || c.name_ru || c.name_ky || '');
        const safeTitle = escHtml(title);
        const meta = getCategoryMeta(title);
        const isFiller = c.is_filler || meta.isFiller;
        const statusText = isFiller 
          ? (lang === 'ky' ? 'Жакында' : 'Coming Soon') 
          : (lang === 'ky' ? 'Негизги раунд' : 'Main Round');
        const tagText = lang === 'ky' ? meta.tagKy : meta.tagEn;

        return `<div class="category-card ${meta.themeClass}" data-cat-index="${idx}">
          <div class="category-card-top">
            <div class="category-icon-box" aria-hidden="true">
              ${meta.iconSvg}
            </div>
            <span class="category-status-badge ${isFiller ? 'filler' : 'active'}">
              ${statusText}
            </span>
          </div>
          <div class="category-card-body">
            <h3 class="category-card-title">${safeTitle}</h3>
          </div>
          <div class="category-card-footer">
            <span class="category-card-tag">${tagText}</span>
            <span class="category-card-arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </div>
        </div>`;
      }).join('');
      
      if (list) {
        list.innerHTML = '<ul style="margin:4px 0 0 0; padding-left:18px; line-height:1.6;">' + displayCats.map(c => {
          const title = lang === 'ky'
            ? (c.name_ky || c.name_en || c.name_ru || '')
            : (c.name_en || c.name_ru || c.name_ky || '');
          return `<li>${escHtml(title)}</li>`;
        }).join('') + '</ul>';
      }
    } catch (e) {
      console.error('Error rendering categories:', e);
      grid.innerHTML = '<p style="text-align:center;color:#ef4444;">' + (lang === 'ky' ? 'Категорияларды көрсөтүүдө ката' : 'Error rendering categories') + '</p>';
    }
  }

  const BLOCKS_STORAGE_KEY = 'akyl_homepage_blocks_v2';
  let cachedHomepageBlocks = (typeof window.INITIAL_HOMEPAGE_BLOCKS !== 'undefined' && window.INITIAL_HOMEPAGE_BLOCKS && Object.keys(window.INITIAL_HOMEPAGE_BLOCKS).length > 0)
    ? window.INITIAL_HOMEPAGE_BLOCKS
    : null;

  if (!cachedHomepageBlocks) {
    try {
      const stored = localStorage.getItem(BLOCKS_STORAGE_KEY);
      if (stored) {
        cachedHomepageBlocks = JSON.parse(stored);
      }
    } catch (e) {}
  }

  function applyBlocks(blocks) {
    if (!blocks || typeof blocks !== 'object') return;
    cachedHomepageBlocks = blocks;
    try {
      localStorage.setItem(BLOCKS_STORAGE_KEY, JSON.stringify(blocks));
    } catch (e) {}

    const lang = (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
    document.querySelectorAll('[data-block-key]').forEach(el => {
      const key = el.getAttribute('data-block-key');
      if (!key || !blocks[key]) return;
      const block = blocks[key];
      if (el.hasAttribute('data-block-field')) {
        const field = el.getAttribute('data-block-field');
        const value = lang === 'ky'
          ? (block[`${field}_ky`] ?? '')
          : (block[`${field}_en`] ?? '');
        if (value !== '') el.textContent = value;
      }
      el.querySelectorAll('[data-block-field]').forEach(child => {
        const field = child.getAttribute('data-block-field');
        if (!field) return;
        const value = lang === 'ky'
          ? (block[`${field}_ky`] ?? '')
          : (block[`${field}_en`] ?? '');
        if (value !== '') child.textContent = value;
      });
    });
  }

  // Apply instantly upon script parse if cached
  if (cachedHomepageBlocks) {
    applyBlocks(cachedHomepageBlocks);
  }

  async function loadHomepageBlocks() {
    if (cachedHomepageBlocks) {
      applyBlocks(cachedHomepageBlocks);
    }
    try {
      const res = await fetch('/api/homepage-blocks');
      if (!res.ok) return;
      const blocks = await res.json();
      if (blocks && typeof blocks === 'object') {
        applyBlocks(blocks);
      }
    } catch (e) {
      console.warn('Failed to load homepage blocks:', e);
    }
  }
  
  function initApp() {
    if (typeof AkylI18n === 'undefined') {
      setTimeout(initApp, 50);
      return;
    }
    
    if (AkylI18n.initSwitcher) {
      try {
        AkylI18n.initSwitcher();
      } catch (e) {
        console.warn('Failed to init language switcher:', e);
      }
    }
    
    addOrnaments();
    updateNavBar();
    renderSettings();
    renderCategories();
    loadHomepageBlocks();
  }
  
  initLanguageSwitcher();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
  
  window.reloadHomepageBlocks = loadHomepageBlocks;

  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'AKYL_HOMEPAGE_SYNC') {
      loadHomepageBlocks();
    }
  });

  window.addEventListener('storage', (ev) => {
    if (ev.key === 'akyl_blocks_updated' || ev.key === BLOCKS_STORAGE_KEY) {
      loadHomepageBlocks();
    }
  });

  window.addEventListener('akyl-langchange', () => {
    if (typeof AkylI18n !== 'undefined') {
      // 1. Immediately apply cached blocks synchronously without waiting for network!
      if (cachedHomepageBlocks) {
        applyBlocks(cachedHomepageBlocks);
      }
      // 2. Apply static i18n
      AkylI18n.applyI18n(AkylI18n.getLang());
      // 3. Render dynamic content
      renderSettings();
      renderCategories();
      updateNavBar();
    }
  });
})();
