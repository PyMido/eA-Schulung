function getConfig() {
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return { baseUrl, serviceKey };
}

function headers(prefer) {
  const { serviceKey } = getConfig();
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function restGet(table, query = '') {
  const { baseUrl } = getConfig();
  const resp = await fetch(`${baseUrl}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: headers()
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`GET ${table} failed: ${JSON.stringify(data)}`);
  return data;
}

async function restPost(table, payload, prefer = 'return=representation') {
  const { baseUrl } = getConfig();
  const resp = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(prefer),
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`POST ${table} failed: ${JSON.stringify(data)}`);
  return data;
}

async function restPatch(table, query, payload, prefer = 'return=representation') {
  const { baseUrl } = getConfig();
  const resp = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers(prefer),
    body: JSON.stringify(payload)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`PATCH ${table} failed: ${JSON.stringify(data)}`);
  return data;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

module.exports = {
  getConfig,
  restGet,
  restPost,
  restPatch,
  json
};
