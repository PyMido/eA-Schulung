const { json } = require('./lib/supabase');
const { getProgress, getAttempts, getCertificates } = require('./lib/v1-data');
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

    const [progress, attempts, certificates] = await Promise.all([
      getProgress(auth.profile.id),
      getAttempts(auth.profile.id),
      getCertificates(auth.profile.id)
    ]);

    return json(200, {
      ok: true,
      user: { id: auth.profile.id, email: auth.profile.email, role: auth.profile.role },
      progress,
      attempts,
      certificates
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
