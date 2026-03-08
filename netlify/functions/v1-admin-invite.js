const { json, getConfig } = require('./lib/supabase');
const { createOrRefreshRoleAssignment } = require('./lib/v1-data');
const { requireSupabaseUser } = require('./lib/identity');

const ALLOWED = new Set(['admin', 'pharma', 'non_pharma']);

function resolveInviteRedirectUrl() {
  const explicit = String(process.env.SUPABASE_INVITE_REDIRECT_URL || '').trim();
  if (explicit) return explicit;

  const siteUrl = String(process.env.NETLIFY_SITE_URL || '').trim();
  if (siteUrl) return `${siteUrl.replace(/\/$/, '')}/`;

  return null;
}


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
    if (auth.profile.role !== 'admin') return json(403, { error: 'Admin role required' });

    const body = JSON.parse(event.body || '{}');
    if (hasForbiddenSubjectFields(body)) return json(400, { error: 'Do not send identity fields in request body' });
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '').trim();

    if (!email || !ALLOWED.has(role)) {
      return json(400, { error: 'email and valid role are required' });
    }

    await createOrRefreshRoleAssignment({ email, role });

    const inviteRedirectUrl = resolveInviteRedirectUrl();
    if (!inviteRedirectUrl) {
      return json(500, { error: 'Missing SUPABASE_INVITE_REDIRECT_URL (or NETLIFY_SITE_URL fallback)' });
    }

    const { baseUrl, serviceKey } = getConfig();
    const inviteResp = await fetch(`${baseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, redirect_to: inviteRedirectUrl })
    });

    const inviteData = await inviteResp.json().catch(() => ({}));
    if (!inviteResp.ok) {
      return json(500, { error: `Supabase invite failed: ${JSON.stringify(inviteData)}` });
    }

    return json(200, {
      ok: true,
      invite: {
        email,
        role,
        status: 'sent_via_supabase_auth'
      }
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};
