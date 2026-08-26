/**
 * Akylman Quiz Bowl - Interactive Client-Side Quiz Engine
 * Features: Server-synced timer, local draft auto-save, sticky HUD, quick-jump question map, and validation.
 */

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
    this.startedAt = Date.now();
    this.expiresAt = null;
    this.remainingSec = 3600;
  }

  async start() {
    this.container.innerHTML = `
      <div class="loading-spinner" role="status"></div>
      <p class="text-center mt-3 font-semibold text-gray-700">Синхронизация сессии с сервером...</p>
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
          this.startedAt = sessionData.started_at;
          this.expiresAt = sessionData.expires_at;
          this.remainingSec = sessionData.time_remaining_sec;
        }
      } catch (err) {
        console.warn('Session sync notice:', err.message);
      }

      // 2. Fetch test questions
      const res = await apiFetch(`/api/tests/${this.testId}`);
      if (res.test && res.questions) {
        this.testData = res.test;
        this.questions = res.questions;
      } else if (Array.isArray(res)) {
        this.testData = { id: this.testId, title: 'Тест' };
        this.questions = res;
      } else {
        throw new Error('Некорректный формат вопросов');
      }

      if (!this.questions.length) {
        this.container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📝</div>
            <p class="empty-message">В данном тесте пока нет вопросов</p>
            <button class="btn btn-secondary mt-3" id="quizBackBtn">Вернуться к тестам</button>
          </div>
        `;
        document.getElementById('quizBackBtn')?.addEventListener('click', this.onCancel);
        return;
      }

      // 3. Fallback timer if session did not provide one
      if (!this.expiresAt) {
        const durMins = this.testData.duration_minutes || 60;
        this.remainingSec = durMins * 60;
        this.expiresAt = this.startedAt + durMins * 60 * 1000;
      }

      // 4. Recover draft if available
      const draft = DraftManager.load(this.testId);
      if (draft && draft.answers && Object.keys(draft.answers).length > 0) {
        this.answers = { ...draft.answers };
        Toast.info('Восстановлен сохраненный черновик ответов');
      }

      // 5. Initialize Timer & View
      this.initTimer();
      this.render();
    } catch (err) {
      console.error('Quiz start error:', err);
      this.container.innerHTML = `
        <div class="error-message" role="alert">
          <div class="error-icon">⚠️</div>
          <p class="error-text">Не удалось запустить тест: ${escapeHtml(err.message || 'Ошибка сети')}</p>
          <button class="btn btn-primary mt-3" id="quizRetryBtn">Попробовать снова</button>
          <button class="btn btn-secondary mt-3 ms-2" id="quizBackBtn">Назад</button>
        </div>
      `;
      document.getElementById('quizRetryBtn')?.addEventListener('click', () => this.start());
      document.getElementById('quizBackBtn')?.addEventListener('click', this.onCancel);
    }
  }

  initTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (this.expiresAt) {
        const now = Date.now();
        this.remainingSec = Math.max(0, Math.round((this.expiresAt - now) / 1000));
      } else {
        this.remainingSec--;
      }

      this.updateTimerDisplay();

      if (this.remainingSec <= 0) {
        clearInterval(this.timerInterval);
        Toast.warning('Время тестирования истекло. Автоматическая отправка ответов...');
        this.submitAnswers(true);
      }
    }, 1000);
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
    const total = this.questions.length;
    const answeredCount = this.getAnsweredCount();
    const progressPercent = Math.round((answeredCount / total) * 100);
    const q = this.questions[this.currentIndex];

    this.container.innerHTML = `
      <div class="quiz-sticky-hud" role="region" aria-label="Панель состояния теста">
        <div class="quiz-hud-top">
          <div>
            <span class="quiz-timer-badge" id="quizHudTimer">⏱ --:--</span>
            <span class="draft-indicator ms-3">● Черновик автосохранен</span>
          </div>
          <div class="quiz-progress-stats">
            <span>Отвечено: <strong>${answeredCount}</strong> из <strong>${total}</strong> (${progressPercent}%)</span>
          </div>
        </div>
        <div class="quiz-progress-bar-wrap">
          <div class="quiz-progress-bar-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="quiz-question-map" role="navigation" aria-label="Карта вопросов">
          ${this.questions.map((item, idx) => {
            const isAnswered = this.answers[item.id] !== undefined && this.answers[item.id] !== null && String(this.answers[item.id]).trim() !== '';
            const isCurrent = idx === this.currentIndex;
            const cls = ['qmap-pill', isAnswered ? 'answered' : '', isCurrent ? 'current' : ''].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-goto="${idx}" aria-label="Вопрос ${idx + 1}">${idx + 1}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="question-block" role="region" aria-labelledby="question-number">
        <div class="question-header">
          <h4 id="question-number" class="question-number">Вопрос ${this.currentIndex + 1} из ${total}</h4>
          ${q.category_name ? `<span class="badge bg-light text-dark">${escapeHtml(q.category_name)}</span>` : ''}
          ${q.points ? `<span class="badge bg-primary">${q.points} б.</span>` : ''}
        </div>

        <p class="question-text" id="question-text-${this.currentIndex}">${escapeHtml(q.text || '')}</p>

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
                <span>${escapeHtml(opt)}</span>
              </label>
            </div>
          `).join('') : `
            <div class="text-answer">
              <label for="quiz_txt_ans" class="sr-only">Введите ваш ответ</label>
              <input 
                id="quiz_txt_ans" 
                type="text" 
                class="form-control"
                placeholder="Введите ваш ответ..."
                value="${escapeHtml(this.answers[q.id] || '')}"
              />
            </div>
          `}
        </fieldset>
      </div>

      <nav class="test-navigation d-flex justify-content-between align-items-center mt-4 gap-2 flex-wrap" aria-label="Навигация по вопросам">
        <div>
          <button 
            id="quizPrevBtn" 
            class="nav-btn" 
            ${this.currentIndex === 0 ? 'disabled aria-disabled="true"' : ''}
            type="button">
            ← Предыдущий
          </button>
        </div>
        <div class="d-flex gap-2">
          <button 
            id="quizNextBtn" 
            class="btn btn-primary"
            type="button">
            ${this.currentIndex >= total - 1 ? 'Перейти к завершению' : 'Следующий →'}
          </button>
          <button 
            id="quizFinishDirectBtn" 
            class="btn btn-outline-success font-semibold"
            type="button">
            Завершить тест (${answeredCount}/${total})
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
    const total = this.questions.length;
    const answeredCount = this.getAnsweredCount();
    const progressPercent = Math.round((answeredCount / total) * 100);

    const fillEl = document.querySelector('.quiz-progress-bar-fill');
    if (fillEl) fillEl.style.width = `${progressPercent}%`;

    const statsEl = document.querySelector('.quiz-progress-stats span');
    if (statsEl) {
      statsEl.innerHTML = `Отвечено: <strong>${answeredCount}</strong> из <strong>${total}</strong> (${progressPercent}%)`;
    }

    const finishBtn = document.getElementById('quizFinishDirectBtn');
    if (finishBtn) {
      finishBtn.textContent = `Завершить тест (${answeredCount}/${total})`;
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
    const total = this.questions.length;
    const answeredCount = this.getAnsweredCount();
    const unanswered = total - answeredCount;

    let msg = `Вы ответили на <strong>${answeredCount}</strong> из <strong>${total}</strong> вопросов.`;
    if (unanswered > 0) {
      msg += `<br><span style="color: var(--danger); font-weight: 600;">Внимание: ${unanswered} вопросов остались без ответа!</span>`;
    }
    msg += '<br>Завершить тестирование и отправить ответы?';

    const confirmed = await showConfirmDialog({
      title: 'Завершение тестирования',
      message: msg,
      confirmText: 'Отправить ответы',
      cancelText: 'Продолжить тест',
      isDestructive: false,
    });

    if (confirmed) {
      this.submitAnswers(false);
    }
  }

  async submitAnswers(auto = false) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.container.innerHTML = `
      <div class="loading-spinner" role="status"></div>
      <p class="text-center mt-3 font-semibold text-gray-700">Отправка результатов и проверка ответов...</p>
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
      const timeTakenSec = result.timeTakenSec || 0;
      const timeMins = Math.floor(timeTakenSec / 60);
      const timeSecs = timeTakenSec % 60;

      Toast.success('Результаты тестирования успешно сохранены!');

      this.container.innerHTML = `
        <div class="test-result text-center p-4" role="region" aria-label="Результат теста">
          <div class="result-icon mb-3" style="font-size: 56px;">${percentage >= 75 ? '🏆' : percentage >= 50 ? '🎉' : '📝'}</div>
          <h3 class="font-bold text-2xl mb-2">Тестирование завершено!</h3>
          <p class="text-muted mb-4">${escapeHtml(this.testData.title || 'Тест')}</p>

          <div class="card p-4 mx-auto mb-4" style="max-width: 480px; text-align: left;">
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span>Правильных ответов:</span>
              <strong>${correct} из ${total}</strong>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span>Набрано баллов:</span>
              <strong class="text-primary font-bold">${score} из ${maxScore}</strong>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span>Процент успешности:</span>
              <strong class="${percentage >= 50 ? 'text-success' : 'text-warning'} font-bold">${percentage}%</strong>
            </div>
            <div class="d-flex justify-content-between py-2">
              <span>Затраченное время:</span>
              <strong>${timeMins} мин ${timeSecs} сек</strong>
            </div>
          </div>

          <div class="d-flex justify-content-center gap-3">
            <button class="btn btn-primary" id="quizFinishBackBtn">К списку тестов</button>
          </div>
        </div>
      `;

      document.getElementById('quizFinishBackBtn')?.addEventListener('click', () => {
        this.onFinish(result);
      });
    } catch (err) {
      console.error('Quiz submit error:', err);
      Toast.error('Ошибка при отправке ответов: ' + err.message);

      this.container.innerHTML = `
        <div class="error-message" role="alert">
          <div class="error-icon">⚠️</div>
          <p class="error-text">Не удалось отправить ответы: ${escapeHtml(err.message)}</p>
          <p class="text-sm text-gray-600 mt-2">Ваши ответы сохранены в локальном черновике и не потеряны.</p>
          <button class="btn btn-primary mt-3" id="quizRetrySubmitBtn">Повторить отправку</button>
        </div>
      `;
      document.getElementById('quizRetrySubmitBtn')?.addEventListener('click', () => this.submitAnswers());
    }
  }
}

window.QuizRunner = QuizRunner;
