const { json, restGet } = require('./lib/supabase');
const { requireSupabaseUser } = require('./lib/identity');


function hasIdentityOverrideParams(query) {
  if (!query || typeof query !== 'object') return false;
  return ['user_id', 'email', 'role'].some((k) => Object.hasOwn(query, k));
}
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
    if (hasIdentityOverrideParams(event.queryStringParameters)) return json(400, { error: 'Identity override params are not allowed' });

    const auth = await requireSupabaseUser(event);
    if (!auth.ok) return json(auth.status, { error: auth.error });
    if (!auth.profile?.id || !auth.profile?.role) return json(403, { error: 'Missing profile or role context' });
    if (auth.profile.role !== 'admin') return json(403, { error: 'Admin role required' });

    const [profiles, progress, attempts, certificates] = await Promise.all([
      restGet('user_profile', 'select=id,email,role,created_at'),
      restGet('training_progress', 'select=user_id,training_id,status,attempt_count,last_score,last_attempt_at,completed_at'),
      restGet('quiz_attempts', 'select=user_id,training_id,attempt_number,score,submitted_at&order=submitted_at.desc'),
      restGet('certificates', 'select=user_id,training_id,certificate_code,generated_at')
    ]);

    return json(200, {
      ok: true,
      users: profiles,
      training_progress: progress,
      quiz_attempts: attempts,
      certificates
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
