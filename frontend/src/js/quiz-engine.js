/**
 * Akylman Quiz Bowl - Interactive Client-Side Quiz Engine
 * Features: Server-synced timer, local draft auto-save, sticky HUD, quick-jump question map, and bilingual KY/EN support.
 */

function getQuizLang() {
  return (typeof AkylI18n !== 'undefined' && AkylI18n.getLang) ? AkylI18n.getLang() : 'en';
}

const QUIZ_STRINGS = {
  syncing: {
    en: 'Synchronizing session with server...',
    ky: 'Сессия сервер менен байланыштырылууда...'
  },
  default_title: {
    en: 'Test',
    ky: 'Тест'
  },
  invalid_format: {
    en: 'Invalid questions format',
    ky: 'Суроолордун форматы туура эмес'
  },
  no_questions: {
    en: 'There are no questions in this test yet',
    ky: 'Бул тестте азырынча суроолор жок'
  },
  back_to_tests: {
    en: 'Back to tests',
    ky: 'Тесттерге кайтуу'
  },
  draft_restored: {
    en: 'Saved answer draft restored',
    ky: 'Сакталган жооптордун долбоору калыбына келтирилди'
  },
  start_failed: {
    en: 'Failed to start test',
    ky: 'Тестти баштоо мүмкүн болбоду'
  },
  network_error: {
    en: 'Network error',
    ky: 'Интернет байланышында ката'
  },
  try_again: {
    en: 'Try again',
    ky: 'Кайра аракет кылуу'
  },
  back: {
    en: 'Back',
    ky: 'Артка'
  },
  time_expired: {
    en: 'Test time has expired. Submitting answers automatically...',
    ky: 'Тесттин убактысы бүттү. Жооптор автоматтык түрүндө жөнөтүлүүдө...'
  },
  hud_label: {
    en: 'Test status panel',
    ky: 'Тесттин абалынын панели'
  },
  draft_saved: {
    en: '● Draft auto-saved',
    ky: '● Долбоор автоматтык сакталды'
  },
  answered: {
    en: 'Answered',
    ky: 'Жооп берилди'
  },
  of: {
    en: 'of',
    ky: '/'
  },
  question: {
    en: 'Question',
    ky: 'Суроо'
  },
  click_to_zoom: {
    en: 'Click image to view in full size',
    ky: 'Сүрөттү чоңойтуу үчүн басыңыз'
  },
  open_attachment: {
    en: 'Open attached material/file',
    ky: 'Тиркелген файлды/материалды ачуу'
  },
  enter_answer: {
    en: 'Enter your answer...',
    ky: 'Жообуңузду киргизиңиз...'
  },
  prev: {
    en: '← Previous',
    ky: '← Мурунку'
  },
  next: {
    en: 'Next →',
    ky: 'Кийинки →'
  },
  go_finish: {
    en: 'Proceed to finish',
    ky: 'Жыйынтыктоого өтүү'
  },
  finish_test: {
    en: 'Finish test',
    ky: 'Тестти бүтүрүү'
  },
  confirm_title: {
    en: 'Finish Test',
    ky: 'Тестти бүтүрүү'
  },
  confirm_msg1: {
    en: 'You have answered <strong>{answered}</strong> of <strong>{total}</strong> questions.',
    ky: 'Сиз <strong>{total}</strong> суроонун <strong>{answered}</strong> суроосуна жооп бердиңиз.'
  },
  confirm_unanswered: {
    en: '<br><span style="color: var(--danger); font-weight: 600;">Warning: {count} questions left unanswered!</span>',
    ky: '<br><span style="color: var(--danger); font-weight: 600;">Эскертүү: {count} суроо жоопсуз калды!</span>'
  },
  confirm_submit_prompt: {
    en: '<br>Complete testing and submit answers?',
    ky: '<br>Тестти аяктап, жоопторду жөнөтүүнү каалайсызбы?'
  },
  btn_submit: {
    en: 'Submit answers',
    ky: 'Жоопторду жөнөтүү'
  },
  btn_continue: {
    en: 'Continue test',
    ky: 'Тестти улантуу'
  },
  submitting: {
    en: 'Submitting results and verifying answers...',
    ky: 'Жыйынтыктар жөнөтүлүүдө жана текшерилүүдө...'
  },
  success_toast: {
    en: 'Test results saved successfully!',
    ky: 'Тесттин жыйынтыктары ийгиликтүү сакталды!'
  },
  completed_title: {
    en: 'Test Completed!',
    ky: 'Тест аяктады!'
  },
  correct_answers: {
    en: 'Correct answers:',
    ky: 'Туура жооптор:'
  },
  score_points: {
    en: 'Points earned:',
    ky: 'Топтолгон баллдар:'
  },
  success_rate: {
    en: 'Success rate:',
    ky: 'Ийгилик пайызы:'
  },
  time_spent: {
    en: 'Time spent:',
    ky: 'Кеткен убакыт:'
  },
  min: {
    en: 'min',
    ky: 'мүн'
  },
  sec: {
    en: 'sec',
    ky: 'сек'
  },
  submit_failed: {
    en: 'Failed to submit answers',
    ky: 'Жоопторду жөнөтүү мүмкүн болбоду'
  },
  answers_kept_safe: {
    en: 'Your answers are stored safely in local draft.',
    ky: 'Жоопторуңуз жергиликтүү долбоордо коопсуз сакталды.'
  },
  retry_submit: {
    en: 'Retry submission',
    ky: 'Кайра жөнөтүү'
  }
};

function qText(key, lang) {
  const l = (lang === 'ky') ? 'ky' : 'en';
  return (QUIZ_STRINGS[key] && QUIZ_STRINGS[key][l]) || (QUIZ_STRINGS[key] && QUIZ_STRINGS[key].en) || key;
}

class QuizRunner {
  constructor(options) {
    this.testId = options.testId;
    this.container = options.container;
    this.onFinish = options.onFinish || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.testData = null;
    this.questions = [];
    this.currentIndex = 0;
    this.answers = {};
    this.timerInterval = null;
    this.syncInterval = null;
    this.startedAt = new Date().toISOString();
    this.clientEndTime = null;
    this.remainingSec = 3600;
    this.isSubmitting = false;

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.syncServerSession();
      }
    };
  }

  async start() {
    const lang = getQuizLang();
    this.container.innerHTML = `
      <div class="loading-spinner" role="status"></div>
      <p class="text-center mt-3 font-semibold text-gray-700">${qText('syncing', lang)}</p>
    `;

    try {
      // 1. Register or sync session with server
      let sessionData = null;
      try {
        const sessionRes = await apiFetch(`/api/tests/${this.testId}/start`, {
          method: 'POST',
        });
        if (sessionRes && sessionRes.session) {
          sessionData = sessionRes.session;
          this.startedAt = sessionData.started_at ? new Date(sessionData.started_at).getTime() : Date.now();
          this.expiresAt = sessionData.expires_at ? new Date(sessionData.expires_at).getTime() : null;
          this.remainingSec = sessionData.remaining_seconds ?? sessionData.time_remaining_sec ?? 3600;
          this.clientEndTime = this.expiresAt || (Date.now() + (this.remainingSec * 1000));
        }
      } catch (err) {
        console.warn('Session start note:', err.message);
      }

      // 2. Fetch test questions
      const res = await apiFetch(`/api/tests/${this.testId}`);
      if (res.test && res.questions) {
        this.testData = res.test;
        this.questions = res.questions;
      } else if (Array.isArray(res)) {
        this.testData = { id: this.testId, title: qText('default_title', lang) };
        this.questions = res;
      } else {
        throw new Error(qText('invalid_format', lang));
      }

      if (!this.questions.length) {
        this.container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📝</div>
            <p class="empty-message">${qText('no_questions', lang)}</p>
            <button class="btn btn-secondary mt-3" id="quizBackBtn">${qText('back_to_tests', lang)}</button>
          </div>
        `;
        document.getElementById('quizBackBtn')?.addEventListener('click', this.onCancel);
        return;
      }

      // 3. Fallback timer if session did not provide one
      if (!this.clientEndTime) {
        const durMins = this.testData.duration_minutes || 60;
        this.remainingSec = durMins * 60;
        this.clientEndTime = Date.now() + (this.remainingSec * 1000);
      }

      // 4. Recover draft if available
      const draft = DraftManager.load(this.testId);
      if (draft && draft.answers && Object.keys(draft.answers).length > 0) {
        this.answers = { ...draft.answers };
        Toast.info(qText('draft_restored', lang));
      }

      // 5. Initialize Timer & View & Periodic Server Sync
      this.initTimer();
      this.initPeriodicSync();
      this.render();
    } catch (err) {
      console.error('Quiz start error:', err);
      const lang = getQuizLang();
      this.container.innerHTML = `
        <div class="error-message" role="alert">
          <div class="error-icon">⚠️</div>
          <p class="error-text">${qText('start_failed', lang)}: ${escapeHtml(err.message || qText('network_error', lang))}</p>
          <button class="btn btn-primary mt-3" id="quizRetryBtn">${qText('try_again', lang)}</button>
          <button class="btn btn-secondary mt-3 ms-2" id="quizBackBtn">${qText('back', lang)}</button>
        </div>
      `;
      document.getElementById('quizRetryBtn')?.addEventListener('click', () => this.start());
      document.getElementById('quizBackBtn')?.addEventListener('click', this.onCancel);
    }
  }

  initTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.clientEndTime) {
        const now = Date.now();
        this.remainingSec = Math.max(0, Math.round((this.clientEndTime - now) / 1000));
      } else {
        this.remainingSec = Math.max(0, this.remainingSec - 1);
      }

      this.updateTimerDisplay();

        if (this.remainingSec <= 0 && !this.isSubmitting) {
        this.stopTimers();
        const lang = getQuizLang();
        Toast.warning(qText('time_expired', lang));
        this.submitAnswers(true);
      }
    }, 1000);
  }

  initPeriodicSync() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    // Sync with server every 20 seconds
    this.syncInterval = setInterval(() => this.syncServerSession(), 20000);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  async syncServerSession() {
    if (this.isSubmitting) return;
    try {
      const res = await apiFetch(`/api/tests/${this.testId}/session`);
      if (res && res.session && typeof res.session.remaining_seconds === 'number') {
        const serverRemaining = Math.max(0, res.session.remaining_seconds);
        const localRemaining = this.clientEndTime
          ? Math.max(0, Math.round((this.clientEndTime - Date.now()) / 1000))
          : this.remainingSec;

        // If local timer drifted by more than 3 seconds from server, re-align smoothly
        if (Math.abs(localRemaining - serverRemaining) > 3) {
          this.remainingSec = serverRemaining;
          this.clientEndTime = Date.now() + (serverRemaining * 1000);
          this.updateTimerDisplay();
        }
      }
    } catch {
      // Background sync failures should not interrupt quiz taker
    }
  }

  stopTimers() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  updateTimerDisplay() {
    const timerEl = document.getElementById('quizHudTimer');
    if (!timerEl) return;

    const s = Math.max(0, this.remainingSec);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    timerEl.textContent = `⏱ ${m}:${ss}`;

    timerEl.classList.remove('warning', 'urgent');
    if (s < 120) {
      timerEl.classList.add('urgent');
    } else if (s < 300) {
      timerEl.classList.add('warning');
    }
  }

  getAnsweredCount() {
    let count = 0;
    for (const q of this.questions) {
      const val = this.answers[q.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        count++;
      }
    }
    return count;
  }

  render() {
    const lang = getQuizLang();
    const total = this.questions.length;
    const answeredCount = this.getAnsweredCount();
    const progressPercent = Math.round((answeredCount / total) * 100);
    const q = this.questions[this.currentIndex];

    this.container.innerHTML = `
      <div class="quiz-sticky-hud" role="region" aria-label="${qText('hud_label', lang)}">
        <div class="quiz-hud-top">
          <div>
            <span class="quiz-timer-badge" id="quizHudTimer">⏱ --:--</span>
            <span class="draft-indicator ms-3">${qText('draft_saved', lang)}</span>
          </div>
          <div class="quiz-progress-stats">
            <span>${qText('answered', lang)}: <strong>${answeredCount}</strong> ${qText('of', lang)} <strong>${total}</strong> (${progressPercent}%)</span>
          </div>
        </div>
        <div class="quiz-progress-bar-wrap">
          <div class="quiz-progress-bar-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="quiz-question-map" role="navigation" aria-label="${qText('hud_label', lang)}">
          ${this.questions.map((item, idx) => {
            const isAnswered = this.answers[item.id] !== undefined && this.answers[item.id] !== null && String(this.answers[item.id]).trim() !== '';
            const isCurrent = idx === this.currentIndex;
            const cls = ['qmap-pill', isAnswered ? 'answered' : '', isCurrent ? 'current' : ''].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-goto="${idx}" aria-label="${qText('question', lang)} ${idx + 1}">${idx + 1}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="question-block" role="region" aria-labelledby="question-number">
        <div class="question-header">
          <h4 id="question-number" class="question-number">${qText('question', lang)} ${this.currentIndex + 1} ${qText('of', lang)} ${total}</h4>
          ${q.category_name ? `<span class="badge bg-light text-dark">${escapeHtml(q.category_name)}</span>` : ''}
        </div>

        <p class="question-text" id="question-text-${this.currentIndex}" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(q.text || '')}</p>

        ${(() => {
          const att = (q.attachment_url || q.image_url || '').trim();
          if (!att) return '';
          const isImg = /\.(jpe?g|png|gif|webp|svg|bmp)(\?.*)?$/i.test(att) || att.startsWith('/uploads/') || att.startsWith('data:image/');
          if (isImg) {
            return `
              <div class="question-image-container" style="margin: 18px 0; text-align: center;">
                <div style="display: inline-block; position: relative; max-width: 100%;">
                  <img 
                    src="${escapeHtml(att)}" 
                    alt="${qText('question', lang)} ${this.currentIndex + 1}" 
                    class="question-hero-img"
                    loading="lazy"
                    style="max-width: 100%; max-height: 460px; width: auto; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 18px rgba(0,0,0,0.08); object-fit: contain; cursor: zoom-in; background: #ffffff;"
                    onclick="window.openQuizImageZoom && window.openQuizImageZoom(this.src)"
                    title="${qText('click_to_zoom', lang)}"
                  />
                  <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px; font-size: 12px; color: #64748b;">
                    <span>🔍</span>
                    <span>${qText('click_to_zoom', lang)}</span>
                  </div>
                </div>
              </div>
            `;
          }
          return `
            <div class="question-attachment-file" style="margin: 14px 0;">
              <a href="${escapeHtml(att)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; color: #0f172a; text-decoration: none; font-weight: 500; font-size: 14px;">
                <span>📎</span>
                <span>${qText('open_attachment', lang)}</span>
                <span style="font-size: 12px; color: #64748b;">↗</span>
              </a>
            </div>
          `;
        })()}

        <fieldset class="question-options" role="radiogroup" aria-labelledby="question-text-${this.currentIndex}">
          ${q.options && q.options.length ? q.options.map((opt, optIdx) => `
            <div class="option-item">
              <label>
                <input 
                  type="radio" 
                  name="quiz_opt" 
                  value="${optIdx}" 
                  id="opt_${this.currentIndex}_${optIdx}"
                  ${String(this.answers[q.id]) === String(optIdx) ? 'checked' : ''}
                />
                <span style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(opt)}</span>
              </label>
            </div>
          `).join('') : `
            <div class="text-answer">
              <label for="quiz_txt_ans" class="sr-only">${qText('enter_answer', lang)}</label>
              <input 
                id="quiz_txt_ans" 
                type="text" 
                class="form-control"
                placeholder="${qText('enter_answer', lang)}"
                value="${escapeHtml(this.answers[q.id] || '')}"
              />
            </div>
          `}
        </fieldset>
      </div>

      <nav class="test-navigation d-flex justify-content-between align-items-center mt-4 gap-2 flex-wrap" aria-label="Navigation">
        <div>
          <button 
            id="quizPrevBtn" 
            class="nav-btn" 
            ${this.currentIndex === 0 ? 'disabled aria-disabled="true"' : ''}
            type="button">
            ${qText('prev', lang)}
          </button>
        </div>
        <div class="d-flex gap-2">
          <button 
            id="quizNextBtn" 
            class="btn btn-primary"
            type="button">
            ${this.currentIndex >= total - 1 ? qText('go_finish', lang) : qText('next', lang)}
          </button>
          <button 
            id="quizFinishDirectBtn" 
            class="btn btn-outline-success font-semibold"
            type="button">
            ${qText('finish_test', lang)} (${answeredCount}/${total})
          </button>
        </div>
      </nav>
    `;

    this.updateTimerDisplay();
    this.bindEvents(q);
  }

  bindEvents(currentQ) {
    // Radio buttons change
    document.querySelectorAll('input[name="quiz_opt"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.answers[currentQ.id] = e.target.value;
        DraftManager.save(this.testId, this.answers);
        this.refreshHud();
      });
    });

    // Text answer change
    const txtInput = document.getElementById('quiz_txt_ans');
    if (txtInput) {
      txtInput.addEventListener('input', (e) => {
        this.answers[currentQ.id] = e.target.value;
        DraftManager.save(this.testId, this.answers);
        this.refreshHud();
      });
    }

    // Prev Button
    document.getElementById('quizPrevBtn')?.addEventListener('click', () => {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        this.render();
        window.scrollTo({ top: 120, behavior: 'smooth' });
      }
    });

    // Next Button
    document.getElementById('quizNextBtn')?.addEventListener('click', () => {
      if (this.currentIndex < this.questions.length - 1) {
        this.currentIndex++;
        this.render();
        window.scrollTo({ top: 120, behavior: 'smooth' });
      } else {
        this.confirmAndSubmit();
      }
    });

    // Finish Direct Button
    document.getElementById('quizFinishDirectBtn')?.addEventListener('click', () => {
      this.confirmAndSubmit();
    });

    // Question map buttons
    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetIdx = parseInt(btn.dataset.goto, 10);
        if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < this.questions.length) {
          this.currentIndex = targetIdx;
          this.render();
          window.scrollTo({ top: 120, behavior: 'smooth' });
        }
      });
    });
  }

  refreshHud() {
    const lang = getQuizLang();
    const total = this.questions.length;
    const answeredCount = this.getAnsweredCount();
    const progressPercent = Math.round((answeredCount / total) * 100);

    const fillEl = document.querySelector('.quiz-progress-bar-fill');
    if (fillEl) fillEl.style.width = `${progressPercent}%`;

    const statsEl = document.querySelector('.quiz-progress-stats span');
    if (statsEl) {
      statsEl.innerHTML = `${qText('answered', lang)}: <strong>${answeredCount}</strong> ${qText('of', lang)} <strong>${total}</strong> (${progressPercent}%)`;
    }

    const finishBtn = document.getElementById('quizFinishDirectBtn');
    if (finishBtn) {
      finishBtn.textContent = `${qText('finish_test', lang)} (${answeredCount}/${total})`;
    }

    // Refresh map pills
    this.questions.forEach((item, idx) => {
      const isAnswered = this.answers[item.id] !== undefined && this.answers[item.id] !== null && String(this.answers[item.id]).trim() !== '';
      const pill = document.querySelector(`[data-goto="${idx}"]`);
      if (pill) {
        if (isAnswered) pill.classList.add('answered');
        else pill.classList.remove('answered');
      }
    });
  }

  async confirmAndSubmit() {
    const lang = getQuizLang();
    const total = this.questions.length;
    const answeredCount = this.getAnsweredCount();
    const unanswered = total - answeredCount;

    let msg = qText('confirm_msg1', lang).replace('{answered}', answeredCount).replace('{total}', total);
    if (unanswered > 0) {
      msg += qText('confirm_unanswered', lang).replace('{count}', unanswered);
    }
    msg += qText('confirm_submit_prompt', lang);

    const confirmed = await showConfirmDialog({
      title: qText('confirm_title', lang),
      message: msg,
      confirmText: qText('btn_submit', lang),
      cancelText: qText('btn_continue', lang),
      isDestructive: false,
    });

    if (confirmed) {
      this.submitAnswers(false);
    }
  }

  async submitAnswers(auto = false) {
    this.isSubmitting = true;
    this.stopTimers();
    const lang = getQuizLang();

    this.container.innerHTML = `
      <div class="loading-spinner" role="status"></div>
      <p class="text-center mt-3 font-semibold text-gray-700">${qText('submitting', lang)}</p>
    `;

    try {
      const payload = {
        answers: this.answers,
        started_at: this.startedAt,
      };

      const result = await apiFetch(`/api/tests/${this.testId}/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Clear draft on successful submission
      DraftManager.clear(this.testId);

      const total = typeof result.total === 'number' ? result.total : this.questions.length;
      const score = typeof result.score === 'number' ? result.score : 0;
      const maxScore = typeof result.maxScore === 'number' ? result.maxScore : total;
      const correct = typeof result.correct === 'number' ? result.correct : score;
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const timeTakenSec = result.time_taken_sec ?? result.timeTakenSec ?? 0;
      const timeMins = Math.floor(timeTakenSec / 60);
      const timeSecs = timeTakenSec % 60;

      Toast.success(qText('success_toast', lang));

      this.container.innerHTML = `
        <div class="test-result text-center p-4" role="region" aria-label="${qText('completed_title', lang)}">
          <div class="result-icon mb-3" style="font-size: 56px;">${percentage >= 75 ? '🏆' : percentage >= 50 ? '🎉' : '📝'}</div>
          <h3 class="font-bold text-2xl mb-2">${qText('completed_title', lang)}</h3>
          <p class="text-muted mb-4">${escapeHtml(this.testData.title || qText('default_title', lang))}</p>

          <div class="card p-4 mx-auto mb-4" style="max-width: 480px; text-align: left;">
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span>${qText('correct_answers', lang)}</span>
              <strong>${correct} ${qText('of', lang)} ${total}</strong>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span>${qText('score_points', lang)}</span>
              <strong class="text-primary font-bold">${score} ${qText('of', lang)} ${maxScore}</strong>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span>${qText('success_rate', lang)}</span>
              <strong class="${percentage >= 50 ? 'text-success' : 'text-warning'} font-bold">${percentage}%</strong>
            </div>
            <div class="d-flex justify-content-between py-2">
              <span>${qText('time_spent', lang)}</span>
              <strong>${timeMins} ${qText('min', lang)} ${timeSecs} ${qText('sec', lang)}</strong>
            </div>
          </div>

          <div class="d-flex justify-content-center gap-3">
            <button class="btn btn-primary" id="quizFinishBackBtn">${qText('back_to_tests', lang)}</button>
          </div>
        </div>
      `;

      document.getElementById('quizFinishBackBtn')?.addEventListener('click', () => {
        this.onFinish(result);
      });
    } catch (err) {
      console.error('Quiz submit error:', err);
      const lang = getQuizLang();
      Toast.error(qText('submit_failed', lang) + ': ' + err.message);

      this.container.innerHTML = `
        <div class="error-message" role="alert">
          <div class="error-icon">⚠️</div>
          <p class="error-text">${qText('submit_failed', lang)}: ${escapeHtml(err.message)}</p>
          <p class="text-sm text-gray-600 mt-2">${qText('answers_kept_safe', lang)}</p>
          <button class="btn btn-primary mt-3" id="quizRetrySubmitBtn">${qText('retry_submit', lang)}</button>
        </div>
      `;
      document.getElementById('quizRetrySubmitBtn')?.addEventListener('click', () => this.submitAnswers());
    }
  }
}

window.QuizRunner = QuizRunner;

window.openQuizImageZoom = function(src) {
  if (!src) return;
  let modal = document.getElementById('quizImageZoomModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'quizImageZoomModal';
    modal.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.85); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:20px; cursor:zoom-out;';
    modal.innerHTML = `
      <div style="position:relative; max-width:92vw; max-height:92vh; display:flex; align-items:center; justify-content:center;">
        <img id="quizImageZoomImg" src="" style="max-width:100%; max-height:90vh; border-radius:8px; box-shadow:0 10px 40px rgba(0,0,0,0.5); object-fit:contain; background:#fff;"/>
        <button type="button" style="position:absolute; top:-12px; right:-12px; width:32px; height:32px; border-radius:50%; background:#ef4444; color:#fff; border:none; font-size:16px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.3);">✕</button>
      </div>
    `;
    modal.onclick = (e) => {
      if (!e.target.closest('#quizImageZoomImg') || e.target.closest('button')) {
        modal.style.display = 'none';
      }
    };
    document.body.appendChild(modal);
  }
  const img = modal.querySelector('#quizImageZoomImg');
  if (img) img.src = src;
  modal.style.display = 'flex';
};
