const { restGet, restPost, restPatch } = require('./supabase');

async function createOrRefreshRoleAssignment({ email, role }) {
  await restPost(
    'role_assignments',
    { email, role, assigned_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=representation'
  );
}

async function getProgress(userId) {
  return restGet(
    'training_progress',
    `select=id,user_id,training_id,status,started_at,attempt_count,last_score,last_attempt_at,completed_at,updated_at&user_id=eq.${userId}`
  );
}

async function getAttempts(userId) {
  return restGet(
    'quiz_attempts',
    `select=id,user_id,training_id,attempt_number,score,submitted_at&user_id=eq.${userId}&order=submitted_at.desc`
  );
}

async function getCertificates(userId) {
  return restGet(
    'certificates',
    `select=id,user_id,training_id,certificate_code,generated_at,download_url&user_id=eq.${userId}`
  );
}

async function ensureTrainingProgress(userId, trainingId) {
  const existing = await restGet(
    'training_progress',
    `select=id,user_id,training_id,status,started_at,attempt_count,last_score,last_attempt_at,completed_at&user_id=eq.${userId}&training_id=eq.${trainingId}&limit=1`
  );
  if (existing[0]) return existing[0];

  const created = await restPost('training_progress', {
    user_id: userId,
    training_id: trainingId,
    status: 'in_progress',
    started_at: new Date().toISOString(),
    attempt_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return created[0];
}

async function recordQuizSubmission(userId, trainingId, score) {
  const progress = await ensureTrainingProgress(userId, trainingId);
  const attemptNumber = Number(progress.attempt_count || 0) + 1;
  const submittedAt = new Date().toISOString();

  const insertedAttempt = await restPost('quiz_attempts', {
    user_id: userId,
    training_id: trainingId,
    attempt_number: attemptNumber,
    score,
    submitted_at: submittedAt,
    created_at: submittedAt
  });

  const updated = await restPatch('training_progress', `id=eq.${progress.id}`, {
    status: 'completed',
    attempt_count: attemptNumber,
    last_score: score,
    last_attempt_at: submittedAt,
    completed_at: submittedAt,
    updated_at: new Date().toISOString()
  });

  const certRows = await restGet(
    'certificates',
    `select=id,user_id,training_id,certificate_code,generated_at,download_url&user_id=eq.${userId}&training_id=eq.${trainingId}&limit=1`
  );

  const code = `CERT-${trainingId}-${userId}-${Date.now()}`;
  let certificate;
  if (certRows[0]) {
    const patched = await restPatch('certificates', `id=eq.${certRows[0].id}`, {
      generated_at: submittedAt,
      certificate_code: code,
      updated_at: new Date().toISOString()
    });
    certificate = patched[0];
  } else {
    const created = await restPost('certificates', {
      user_id: userId,
      training_id: trainingId,
      certificate_code: code,
      generated_at: submittedAt,
      download_url: null,
      created_at: submittedAt,
      updated_at: submittedAt
    });
    certificate = created[0];
  }

  return {
    progress: updated[0],
    attempt: insertedAttempt[0],
    certificate
  };
}

module.exports = {
  createOrRefreshRoleAssignment,
  getProgress,
  getAttempts,
  getCertificates,
  ensureTrainingProgress,
  recordQuizSubmission
};
