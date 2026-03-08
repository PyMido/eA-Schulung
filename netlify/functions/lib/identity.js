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
  const rows = await restGet('user_profile', `select=id,org_id,email,role,updated_at,created_at&id=eq.${id}&limit=1`);
  return rows[0] || null;
}

async function resolveDefaultOrgId() {
  const configured = String(process.env.SUPABASE_DEFAULT_ORG_ID || '').trim();
  if (configured) return configured;

  try {
    const orgRows = await restGet('org', 'select=id&order=created_at.asc.nullslast,id.asc&limit=1');
    if (orgRows[0]?.id) return orgRows[0].id;
  } catch (_) {
    // ignore and fail with explicit error below
  }

  throw new Error('No organization configured');
}

function isMissingColumnError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('column') && msg.includes('org_id');
}

async function ensureUserProfileFromAuthUser(authUser) {
  const email = String(authUser?.email || '').trim().toLowerCase();
  if (!email) return null;

  const assignment = await getRoleAssignmentByEmail(email);
  if (!assignment) return null;

  const orgId = await resolveDefaultOrgId();
  const now = new Date().toISOString();
  const existing = await getUserProfileById(authUser.id);

  if (existing) {
    const patchPayload = {
      role: assignment.role,
      email,
      updated_at: now,
      org_id: existing.org_id || orgId
    };

    try {
      const patched = await restPatch('user_profile', `id=eq.${authUser.id}`, patchPayload);
      return patched[0] || { ...existing, ...patchPayload };
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      const patched = await restPatch('user_profile', `id=eq.${authUser.id}`, {
        role: assignment.role,
        email,
        updated_at: now
      });
      return patched[0] || { ...existing, role: assignment.role, email, updated_at: now };
    }
  }

  const createPayload = {
    id: authUser.id,
    org_id: orgId,
    email,
    role: assignment.role,
    created_at: now,
    updated_at: now
  };

  try {
    const created = await restPost('user_profile', createPayload);
    return created[0];
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    const created = await restPost('user_profile', {
      id: authUser.id,
      email,
      role: assignment.role,
      created_at: now,
      updated_at: now
    });
    return created[0];
  }
}

async function requireSupabaseUser(event) {
  const token = readBearerToken(event);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const authUser = await fetchSupabaseAuthUser(token);
  if (!authUser?.id) return { ok: false, status: 401, error: 'Invalid Supabase session' };

  try {
    const profile = await ensureUserProfileFromAuthUser(authUser);
    if (!profile?.role) return { ok: false, status: 403, error: 'Missing role assignment' };

    return {
      ok: true,
      authUser,
      profile,
      accessToken: token
    };
  } catch (err) {
    if (String(err?.message || '').includes('No organization configured')) {
      return { ok: false, status: 500, error: 'No organization configured' };
    }
    return { ok: false, status: 500, error: 'Failed to initialize user profile' };
  }
}

module.exports = {
  requireSupabaseUser,
  readBearerToken
};
