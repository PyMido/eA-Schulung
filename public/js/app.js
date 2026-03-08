(async function () {
  const state = {
    matrix: null,
    supabase: null,
    session: null,
    authToken: null,
    dashboardData: null,
    currentTrainingId: null,
    currentSlide: 0,
    quizAnswer: null
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
    slideText: document.getElementById('slideText'),
    slideProgress: document.getElementById('slideProgress'),
    prevSlideBtn: document.getElementById('prevSlideBtn'),
    nextSlideBtn: document.getElementById('nextSlideBtn'),
    startQuizBtn: document.getElementById('startQuizBtn'),
    backToDashboardBtn: document.getElementById('backToDashboardBtn'),
    quizSection: document.getElementById('quizSection'),
    quizQuestion: document.getElementById('quizQuestion'),
    quizOptions: document.getElementById('quizOptions'),
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
    if (error) {
      return alert(`Passwort-Setup fehlgeschlagen: ${error.message}. Bitte Einladung/Recovery-Link nutzen.`);
    }

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
      state.quizAnswer = null;
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
      <h4>${training.title}</h4>
      <p class="meta">${type === 'required' ? 'Pflichtschulung' : 'Optionale Schulung'}</p>
      <p class="status">Status: <b>${statusLabel(training.id)}</b></p>
      <button data-id="${training.id}">Öffnen</button>
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

  function renderTraining() {
    const training = state.matrix.trainings.find((t) => t.id === state.currentTrainingId);
    if (!training) return;

    el.dashboardView.classList.add('hidden');
    el.adminView.classList.add('hidden');
    el.trainingView.classList.remove('hidden');

    el.trainingTitle.textContent = training.title;
    el.slideText.textContent = training.slides[state.currentSlide];
    el.slideProgress.textContent = `Folie ${state.currentSlide + 1} / ${training.slides.length}`;

    el.prevSlideBtn.disabled = state.currentSlide === 0;
    el.nextSlideBtn.disabled = state.currentSlide >= training.slides.length - 1;
    el.startQuizBtn.classList.toggle('hidden', state.currentSlide < training.slides.length - 1);

    el.quizSection.classList.add('hidden');
    el.quizResult.textContent = '';
    el.downloadCertBtn.classList.toggle('hidden', !getCertificate(training.id));
  }

  function renderQuiz() {
    const training = state.matrix.trainings.find((t) => t.id === state.currentTrainingId);
    const q = training.quiz[0];
    el.quizSection.classList.remove('hidden');
    el.quizQuestion.textContent = q.question;
    el.quizOptions.innerHTML = '';

    q.options.forEach((opt, index) => {
      const row = document.createElement('label');
      row.className = 'quiz-option';
      row.innerHTML = `<input type="radio" name="quizOption" value="${index}" /> ${opt}`;
      el.quizOptions.appendChild(row);
    });

    [...el.quizOptions.querySelectorAll('input')].forEach((input) => {
      input.addEventListener('change', () => {
        state.quizAnswer = Number(input.value);
      });
    });
  }

  async function submitQuiz() {
    if (state.quizAnswer === null) return alert('Bitte eine Antwort auswählen.');
    const training = state.matrix.trainings.find((t) => t.id === state.currentTrainingId);
    const q = training.quiz[0];
    const score = state.quizAnswer === q.correctIndex ? 100 : 0;

    try {
      await api('v1-submit-quiz', {
        method: 'POST',
        body: JSON.stringify({ training_id: training.id, score })
      });
      await loadDashboardData();
      el.quizResult.textContent = `Quiz abgeschickt. Score: ${score}%. Abschluss zählt in V1 unabhängig vom Score.`;
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

  if (tokenFromUrl) {
    const { data } = await state.supabase.auth.getSession();
    state.authToken = data.session?.access_token || null;
    if (state.authToken) {
      try {
        await loadDashboardData();
      } catch (_) {
        // wait for user to login manually if token/session cannot be used
      }
    }
  }

  renderApp();
})();
