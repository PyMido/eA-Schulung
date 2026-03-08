const { json } = require('./lib/supabase');
const { recordQuizSubmission } = require('./lib/v1-data');
const { requireSupabaseUser } = require('./lib/identity');


function hasForbiddenSubjectFields(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.hasOwn(payload, 'user_id');
}

function hasIdentityOverrideParams(query) {
  if (!query || typeof query !== 'object') return false;
  return ['user_id', 'email', 'role'].some((k) => Object.hasOwn(query, k));
}
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    if (hasIdentityOverrideParams(event.queryStringParameters)) return json(400, { error: 'Identity override params are not allowed' });

    const auth = await requireSupabaseUser(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });
    if (!auth.profile?.id || !auth.profile?.role) return json(403, { error: 'Missing profile or role context' });
    if (auth.profile.role === 'admin') return json(403, { error: 'Role not allowed for learning flow' });

    const body = JSON.parse(event.body || '{}');
    if (hasForbiddenSubjectFields(body)) return json(400, { error: 'Do not send identity fields in request body' });
    const trainingId = String(body.training_id || '').trim();
    const score = Number(body.score);

    if (!trainingId || Number.isNaN(score)) {
      return json(400, { error: 'training_id and score are required' });
    }

    const result = await recordQuizSubmission(auth.profile.id, trainingId, score);
    return json(200, { ok: true, ...result });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
