(async function () {
  const state = {
    matrix: null,
    supabase: null,
    session: null,
    authToken: null,
    dashboardData: null,
    currentTrainingId: null,
    currentSlide: 0,
    quizAnswers: {}
  };

  const el = {
    loginView: document.getElementById('loginView'),
    appView: document.getElementById('appView'),
    adminView: document.getElementById('adminView'),
    dashboardView: document.getElementById('dashboardView'),
    trainingView: document.getElementById('trainingView'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    setupTokenInput: document.getElementById('setupTokenInput'),
    setupPasswordInput: document.getElementById('setupPasswordInput'),
    setupPasswordBtn: document.getElementById('setupPasswordBtn'),
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userBadge: document.getElementById('userBadge'),
    requiredList: document.getElementById('requiredList'),
    optionalList: document.getElementById('optionalList'),
    trainingTitle: document.getElementById('trainingTitle'),
    slideProgress: document.getElementById('slideProgress'),
    slideBar: document.getElementById('slideBar'),
    slideCanvas: document.getElementById('slideCanvas'),
    prevSlideBtn: document.getElementById('prevSlideBtn'),
    nextSlideBtn: document.getElementById('nextSlideBtn'),
    startQuizBtn: document.getElementById('startQuizBtn'),
    backToDashboardBtn: document.getElementById('backToDashboardBtn'),
    quizSection: document.getElementById('quizSection'),
    quizList: document.getElementById('quizList'),
    submitQuizBtn: document.getElementById('submitQuizBtn'),
    quizResult: document.getElementById('quizResult'),
    downloadCertBtn: document.getElementById('downloadCertBtn'),
    adminTableBody: document.getElementById('adminTableBody')
  };

  async function initSupabaseClient() {
    const cfgResp = await fetch('/.netlify/functions/v1-auth-config');
    const cfg = await cfgResp.json();
    if (!cfgResp.ok) throw new Error(cfg.error || 'Auth config unavailable');

    state.supabase = window.supabase.createClient(cfg.supabase_url, cfg.supabase_anon_key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true
      }
    });
  }



  async function consumeAuthRedirectSession() {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const code = url.searchParams.get('code');
    const type = hash.get('type') || url.searchParams.get('type');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');

    let sessionError = null;

    if (code) {
      const { error } = await state.supabase.auth.exchangeCodeForSession(code);
      if (error) sessionError = error;
      url.searchParams.delete('code');
      url.searchParams.delete('type');
      url.searchParams.delete('error');
      url.searchParams.delete('error_code');
      url.searchParams.delete('error_description');
    } else if (accessToken && refreshToken) {
      const { error } = await state.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) sessionError = error;
    }

    if (window.location.hash) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    } else if (code) {
      window.history.replaceState({}, '', url.toString());
    }

    if (sessionError && (type === 'recovery' || type === 'invite' || code || accessToken)) {
      throw new Error(`Auth redirect session invalid: ${sessionError.message}`);
    }

    const { data } = await state.supabase.auth.getSession();
    return data.session || null;
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.authToken) headers.Authorization = `Bearer ${state.authToken}`;

    const response = await fetch(`/.netlify/functions/${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        state.session = null;
        state.authToken = null;
      }
      throw new Error(data.error || `API error ${response.status}`);
    }
    return data;
  }

  async function setupPassword() {
    const token = (el.setupTokenInput.value || '').trim();
    const password = el.setupPasswordInput.value || '';
    if (!password || password.length < 8) return alert('Passwort (mind. 8 Zeichen) erforderlich.');

    const { error } = await state.supabase.auth.updateUser({ password });
    if (error) return alert(`Passwort-Setup fehlgeschlagen: ${error.message}. Bitte den Invite-/Recovery-Link erneut öffnen.`);

    alert('Passwort gesetzt. Bitte jetzt regulär einloggen.');
    if (token) el.setupTokenInput.value = token;
    el.setupPasswordInput.value = '';
  }

  async function loadDashboardData() {
    state.dashboardData = await api('v1-dashboard');
    state.session = state.dashboardData.user;
  }

  function resolveForRole(role) {
    if (role === 'admin') return { required: [], optional: [] };
    return {
      required: state.matrix.trainings.filter((t) => t.required_for.includes(role)),
      optional: state.matrix.trainings.filter((t) => t.optional_for.includes(role))
    };
  }

  function getProgressByTrainingId(trainingId) {
    const rows = state.dashboardData?.progress || [];
    return rows.find((r) => r.training_id === trainingId) || null;
  }

  function getLatestAttempt(trainingId) {
    const rows = state.dashboardData?.attempts || [];
    return rows.find((a) => a.training_id === trainingId) || null;
  }

  function getCertificate(trainingId) {
    const rows = state.dashboardData?.certificates || [];
    return rows.find((c) => c.training_id === trainingId) || null;
  }

  function statusLabel(trainingId) {
    const progress = getProgressByTrainingId(trainingId);
    if (!progress) return 'offen';
    return progress.completed_at ? 'abgeschlossen' : 'begonnen';
  }

  async function login() {
    const email = (el.emailInput.value || '').trim().toLowerCase();
    const password = el.passwordInput.value || '';
    if (!email || !password) return alert('Bitte E-Mail und Passwort eingeben.');

    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(`Login fehlgeschlagen: ${error.message}`);

    state.authToken = data.session?.access_token || null;
    if (!state.authToken) return alert('Login fehlgeschlagen: Keine Supabase Session erhalten.');

    try {
      await loadDashboardData();
      renderApp();
    } catch (e) {
      alert(`Login ok, aber Profilzugriff fehlgeschlagen: ${e.message}`);
    }
  }

  async function logout() {
    try {
      await state.supabase.auth.signOut();
    } catch (_) {
      // noop
    }
    state.session = null;
    state.authToken = null;
    state.dashboardData = null;
    state.currentTrainingId = null;
    state.quizAnswers = {};
    renderApp();
  }

  async function startTraining(trainingId) {
    try {
      await api('v1-start-training', {
        method: 'POST',
        body: JSON.stringify({ training_id: trainingId })
      });
      await loadDashboardData();
      state.currentTrainingId = trainingId;
      state.currentSlide = 0;
      state.quizAnswers = {};
      renderTraining();
    } catch (e) {
      alert(`Start fehlgeschlagen: ${e.message}`);
    }
  }

  function downloadCertificate(trainingId) {
    const cert = getCertificate(trainingId);
    const attempt = getLatestAttempt(trainingId);
    const progress = getProgressByTrainingId(trainingId);
    const training = state.matrix.trainings.find((t) => t.id === trainingId);
    if (!cert || !progress) return alert('Noch keine Teilnahmebestätigung vorhanden.');

    const lines = [
      'Teilnahmebestätigung',
      '',
      `E-Mail: ${state.session.email}`,
      `Rolle: ${state.session.role}`,
      `Schulung: ${training.title}`,
      `Abgeschlossen am: ${progress.completed_at}`,
      `Score: ${attempt?.score ?? '-'}%`,
      `Versuch: ${attempt?.attempt_number ?? '-'}`,
      `Code: ${cert.certificate_code}`,
      `Erstellt: ${cert.generated_at}`
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teilnahme-${trainingId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function createCard(training, type) {
    const wrapper = document.createElement('div');
    wrapper.className = 'card';
    wrapper.innerHTML = `
      <span class="status-pill">${type === 'required' ? 'Pflicht' : 'Optional'}</span>
      <h4>${training.title}</h4>
      <p class="meta">${training.slides.length} Folien · ${training.quiz.length} Quizfragen</p>
      <p class="meta">Status: <b>${statusLabel(training.id)}</b></p>
      <button data-id="${training.id}">Modul starten</button>
    `;
    wrapper.querySelector('button').addEventListener('click', () => startTraining(training.id));
    return wrapper;
  }

  function renderDashboard() {
    const { required, optional } = resolveForRole(state.session.role);
    el.requiredList.innerHTML = '';
    el.optionalList.innerHTML = '';
    required.forEach((t) => el.requiredList.appendChild(createCard(t, 'required')));
    optional.forEach((t) => el.optionalList.appendChild(createCard(t, 'optional')));
  }

  function renderSlideContent(slide) {
    const infoBoxes = (slide.info || [])
      .map((item) => `<div class="info-box"><small>${item.label}</small><strong>${item.value}</strong></div>`)
      .join('');

    const bullets = (slide.bullets || []).map((point) => `<li>${point}</li>`).join('');

    const doList = (slide.do || []).map((x) => `<li>${x}</li>`).join('');
    const dontList = (slide.dont || []).map((x) => `<li>${x}</li>`).join('');

    const doDontSection = (slide.do || slide.dont)
      ? `<div class="do-dont">
          <div class="do"><h4>Do</h4><ul>${doList}</ul></div>
          <div class="dont"><h4>Don't</h4><ul>${dontList}</ul></div>
        </div>`
      : '';

    el.slideCanvas.innerHTML = `
      <span class="slide-tag">${slide.tag || 'Modulfolie'}</span>
      <h3>${slide.title}</h3>
      <p>${slide.lead || ''}</p>
      ${bullets ? `<ul>${bullets}</ul>` : ''}
      ${infoBoxes ? `<div class="info-grid">${infoBoxes}</div>` : ''}
      ${doDontSection}
    `;
  }

  function renderTraining() {
    const training = state.matrix.trainings.find((t) => t.id === state.currentTrainingId);
    if (!training) return;

    el.dashboardView.classList.add('hidden');
    el.adminView.classList.add('hidden');
    el.trainingView.classList.remove('hidden');

    const slide = training.slides[state.currentSlide];
    el.trainingTitle.textContent = training.title;
    el.slideProgress.textContent = `Folie ${state.currentSlide + 1} / ${training.slides.length}`;
    el.slideBar.style.width = `${((state.currentSlide + 1) / training.slides.length) * 100}%`;
    renderSlideContent(slide);

    el.prevSlideBtn.disabled = state.currentSlide === 0;
    el.nextSlideBtn.disabled = state.currentSlide >= training.slides.length - 1;
    el.startQuizBtn.classList.toggle('hidden', state.currentSlide < training.slides.length - 1);

    el.quizSection.classList.add('hidden');
    el.quizResult.textContent = '';
    el.downloadCertBtn.classList.toggle('hidden', !getCertificate(training.id));
  }

  function renderQuiz() {
    const training = state.matrix.trainings.find((t) => t.id === state.currentTrainingId);
    el.quizSection.classList.remove('hidden');
    el.quizList.innerHTML = '';

    training.quiz.forEach((q, qIndex) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'quiz-item';
      fieldset.innerHTML = `<legend>${qIndex + 1}. ${q.question}</legend>`;

      q.options.forEach((opt, optIndex) => {
        const id = `q-${qIndex}-${optIndex}`;
        const row = document.createElement('label');
        row.className = 'quiz-option';
        row.innerHTML = `<input id="${id}" type="radio" name="q-${qIndex}" value="${optIndex}" /> ${opt}`;
        fieldset.appendChild(row);
      });

      fieldset.querySelectorAll('input').forEach((input) => {
        input.addEventListener('change', () => {
          state.quizAnswers[qIndex] = Number(input.value);
        });
      });

      el.quizList.appendChild(fieldset);
    });
  }

  async function submitQuiz() {
    const training = state.matrix.trainings.find((t) => t.id === state.currentTrainingId);
    if (!training) return;

    const answeredCount = Object.keys(state.quizAnswers).length;
    if (answeredCount !== training.quiz.length) {
      return alert('Bitte alle Quizfragen beantworten.');
    }

    let correct = 0;
    training.quiz.forEach((q, idx) => {
      if (state.quizAnswers[idx] === q.correctIndex) correct += 1;
    });
    const score = Math.round((correct / training.quiz.length) * 100);

    try {
      await api('v1-submit-quiz', {
        method: 'POST',
        body: JSON.stringify({ training_id: training.id, score })
      });
      await loadDashboardData();
      el.quizResult.textContent = `Quiz abgeschickt. Ergebnis: ${correct}/${training.quiz.length} korrekt (${score}%).`;
      el.downloadCertBtn.classList.remove('hidden');
    } catch (e) {
      alert(`Quiz-Abgabe fehlgeschlagen: ${e.message}`);
    }
  }

  async function renderAdmin() {
    try {
      const report = await api('v1-admin-report');
      el.adminTableBody.innerHTML = '';

      report.users.forEach((u) => {
        const row = document.createElement('tr');

        const statusText = state.matrix.trainings
          .map((t) => {
            const p = report.training_progress.find((x) => x.user_id === u.id && x.training_id === t.id);
            const status = p?.completed_at ? 'abgeschlossen' : p ? 'begonnen' : 'offen';
            return `${t.id}: ${status}`;
          })
          .join(' | ');

        const latestAttempt = report.quiz_attempts.find((a) => a.user_id === u.id);
        const certAvailable = report.certificates.some((c) => c.user_id === u.id) ? 'ja' : 'nein';

        [
          u.email,
          u.role,
          statusText,
          latestAttempt ? `${latestAttempt.submitted_at} (Score ${latestAttempt.score})` : '-',
          report.training_progress.find((x) => x.user_id === u.id && x.completed_at)?.completed_at || '-',
          certAvailable
        ].forEach((text) => {
          const td = document.createElement('td');
          td.textContent = text;
          row.appendChild(td);
        });

        el.adminTableBody.appendChild(row);
      });
    } catch (e) {
      alert(`Admin-Daten konnten nicht geladen werden: ${e.message}`);
    }
  }

  async function renderApp() {
    if (!state.session) {
      el.loginView.classList.remove('hidden');
      el.appView.classList.add('hidden');
      return;
    }

    el.loginView.classList.add('hidden');
    el.appView.classList.remove('hidden');
    el.userBadge.textContent = `${state.session.email} (${state.session.role})`;

    if (state.session.role === 'admin') {
      el.dashboardView.classList.add('hidden');
      el.trainingView.classList.add('hidden');
      el.adminView.classList.remove('hidden');
      await renderAdmin();
      return;
    }

    if (state.currentTrainingId) return renderTraining();

    el.trainingView.classList.add('hidden');
    el.adminView.classList.add('hidden');
    el.dashboardView.classList.remove('hidden');
    renderDashboard();
  }

  el.loginBtn.addEventListener('click', login);
  el.setupPasswordBtn.addEventListener('click', setupPassword);
  el.logoutBtn.addEventListener('click', logout);
  el.prevSlideBtn.addEventListener('click', () => {
    state.currentSlide = Math.max(0, state.currentSlide - 1);
    renderTraining();
  });
  el.nextSlideBtn.addEventListener('click', () => {
    const t = state.matrix.trainings.find((x) => x.id === state.currentTrainingId);
    state.currentSlide = Math.min(t.slides.length - 1, state.currentSlide + 1);
    renderTraining();
  });
  el.startQuizBtn.addEventListener('click', renderQuiz);
  el.submitQuizBtn.addEventListener('click', submitQuiz);
  el.backToDashboardBtn.addEventListener('click', async () => {
    state.currentTrainingId = null;
    state.quizAnswers = {};
    await loadDashboardData();
    renderApp();
  });
  el.downloadCertBtn.addEventListener('click', () => downloadCertificate(state.currentTrainingId));

  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get('setup_token');
  if (tokenFromUrl) {
    el.setupTokenInput.value = tokenFromUrl;
    url.searchParams.delete('setup_token');
    window.history.replaceState({}, '', url.toString());
  }

  state.matrix = await fetch('/training-matrix-v1.json').then((r) => r.json());
  await initSupabaseClient();

  try {
    const redirectSession = await consumeAuthRedirectSession();
    state.authToken = redirectSession?.access_token || null;
    if (state.authToken) {
      try {
        await loadDashboardData();
      } catch (_) {
        // wait for user to login manually if token/session cannot be used
      }
    }
  } catch (e) {
    alert(`Invite-/Recovery-Link ungültig: ${e.message}`);
  }

  renderApp();
})();
