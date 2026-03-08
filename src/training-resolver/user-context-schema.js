const ALLOWED_ROLES = new Set(['admin', 'pharma', 'non_pharma']);

function normalizeUserContext(userContext = {}) {
  const email = typeof userContext.email === 'string' ? userContext.email.trim().toLowerCase() : null;
  const role = typeof userContext.role === 'string' ? userContext.role : null;

  return {
    normalized: {
      email,
      role: ALLOWED_ROLES.has(role) ? role : null
    },
    validation: {
      validRole: ALLOWED_ROLES.has(role),
      isAdmin: role === 'admin'
    }
  };
}

module.exports = {
  ALLOWED_ROLES,
  normalizeUserContext
};
