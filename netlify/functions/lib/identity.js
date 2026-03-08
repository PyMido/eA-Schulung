const { restGet, restPost, restPatch, getConfig } = require('./supabase');

function readBearerToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function fetchSupabaseAuthUser(accessToken) {
  const { baseUrl, serviceKey } = getConfig();
  const resp = await fetch(`${baseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function getRoleAssignmentByEmail(email) {
  const rows = await restGet('role_assignments', `select=email,role&email=eq.${encodeURIComponent(email)}&limit=1`);
  return rows[0] || null;
}

async function getUserProfileById(id) {
  const rows = await restGet('user_profile', `select=id,email,role,updated_at,created_at&id=eq.${id}&limit=1`);
  return rows[0] || null;
}

async function ensureUserProfileFromAuthUser(authUser) {
  const email = String(authUser?.email || '').trim().toLowerCase();
  if (!email) return null;

  const assignment = await getRoleAssignmentByEmail(email);
  if (!assignment) return null;

  const existing = await getUserProfileById(authUser.id);
  if (existing) {
    if (existing.role !== assignment.role || existing.email !== email) {
      const patched = await restPatch('user_profile', `id=eq.${authUser.id}`, {
        role: assignment.role,
        email,
        updated_at: new Date().toISOString()
      });
      return patched[0];
    }
    return existing;
  }

  const created = await restPost('user_profile', {
    id: authUser.id,
    email,
    role: assignment.role,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return created[0];
}

async function requireSupabaseUser(event) {
  const token = readBearerToken(event);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const authUser = await fetchSupabaseAuthUser(token);
  if (!authUser?.id) return { ok: false, status: 401, error: 'Invalid Supabase session' };

  const profile = await ensureUserProfileFromAuthUser(authUser);
  if (!profile?.role) return { ok: false, status: 403, error: 'Missing role assignment' };

  return {
    ok: true,
    authUser,
    profile,
    accessToken: token
  };
}

module.exports = {
  requireSupabaseUser,
  readBearerToken
};
