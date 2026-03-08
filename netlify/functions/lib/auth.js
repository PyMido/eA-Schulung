const crypto = require('crypto');
const { restGet, restPost, restPatch } = require('./supabase');

const SESSION_TTL_HOURS = 12;

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

async function createSession(userId) {
  const token = randomToken();
  const tokenHash = hashValue(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await restPost('user_sessions', {
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString()
  });

  return { token, expires_at: expiresAt };
}

async function invalidateSessionToken(token) {
  const tokenHash = hashValue(token);
  const patched = await restPatch(
    'user_sessions',
    `token_hash=eq.${tokenHash}`,
    { expires_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }
  );
  return patched.length > 0;
}

async function getSessionFromEvent(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const tokenHash = hashValue(token);
  const sessions = await restGet('user_sessions', `select=id,user_id,expires_at&token_hash=eq.${tokenHash}&limit=1`);
  const session = sessions[0];
  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }

  const users = await restGet('users', `select=id,email&id=eq.${session.user_id}&limit=1`);
  const user = users[0];
  if (!user) return null;

  const authAccount = await restGet('auth_accounts', `select=id,user_id,password_set_at&user_id=eq.${user.id}&limit=1`);
  if (!authAccount[0] || !authAccount[0].password_set_at) return null;

  const roles = await restGet('role_assignments', `select=role&email=eq.${encodeURIComponent(user.email)}&limit=1`);
  if (!roles[0]?.role) return null;

  await restPatch('user_sessions', `id=eq.${session.id}`, { last_seen_at: new Date().toISOString() });

  return {
    user_id: user.id,
    email: user.email,
    role: roles[0].role,
    session_id: session.id,
    expires_at: session.expires_at,
    token
  };
}

module.exports = {
  hashValue,
  randomToken,
  hashPassword,
  verifyPassword,
  createSession,
  invalidateSessionToken,
  getSessionFromEvent
};
