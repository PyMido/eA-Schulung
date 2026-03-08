const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function withMockedModules(targetPath, mockedModuleMap) {
  const resolvedTarget = path.resolve(targetPath);
  const saved = new Map();

  for (const [modulePath, mockedExports] of Object.entries(mockedModuleMap)) {
    const resolvedModule = path.resolve(modulePath);
    saved.set(resolvedModule, require.cache[resolvedModule]);
    require.cache[resolvedModule] = {
      id: resolvedModule,
      filename: resolvedModule,
      loaded: true,
      exports: mockedExports
    };
  }

  delete require.cache[resolvedTarget];
  const loaded = require(resolvedTarget);

  return {
    module: loaded,
    restore() {
      delete require.cache[resolvedTarget];
      for (const [resolvedModule, prior] of saved.entries()) {
        if (prior) {
          require.cache[resolvedModule] = prior;
        } else {
          delete require.cache[resolvedModule];
        }
      }
    }
  };
}

test('Non-admin cannot call v1-admin-report (403)', async () => {
  const { module, restore } = withMockedModules(
    'netlify/functions/v1-admin-report.js',
    {
      'netlify/functions/lib/identity.js': {
        requireSupabaseUser: async () => ({ ok: true, profile: { role: 'pharma', id: 'u1' } })
      },
      'netlify/functions/lib/supabase.js': {
        json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
        restGet: async () => {
          throw new Error('restGet must not run for non-admin users');
        }
      }
    }
  );

  const resp = await module.handler({ httpMethod: 'GET', headers: {} });
  restore();

  assert.equal(resp.statusCode, 403);
  assert.match(resp.body, /Admin role required/);
});

test('Non-admin cannot call v1-admin-invite (403)', async () => {
  const { module, restore } = withMockedModules(
    'netlify/functions/v1-admin-invite.js',
    {
      'netlify/functions/lib/identity.js': {
        requireSupabaseUser: async () => ({ ok: true, profile: { role: 'non_pharma', id: 'u1' } })
      },
      'netlify/functions/lib/supabase.js': {
        json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
        getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' })
      },
      'netlify/functions/lib/v1-data.js': {
        createOrRefreshRoleAssignment: async () => {
          throw new Error('createOrRefreshRoleAssignment must not run for non-admin users');
        }
      }
    }
  );

  const resp = await module.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ email: 'new@example.com', role: 'pharma' })
  });
  restore();

  assert.equal(resp.statusCode, 403);
  assert.match(resp.body, /Admin role required/);
});

test('Request without bearer token returns 401', async () => {
  const { module: identity, restore } = withMockedModules(
    'netlify/functions/lib/identity.js',
    {
      'netlify/functions/lib/supabase.js': {
        getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' }),
        restGet: async () => [],
        restPost: async () => [],
        restPatch: async () => []
      }
    }
  );

  const result = await identity.requireSupabaseUser({ headers: {} });
  restore();

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test('Request with invalid token returns 401', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, json: async () => ({ error: 'bad token' }) });

  const { module: identity, restore } = withMockedModules(
    'netlify/functions/lib/identity.js',
    {
      'netlify/functions/lib/supabase.js': {
        getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' }),
        restGet: async () => [],
        restPost: async () => [],
        restPatch: async () => []
      }
    }
  );

  const result = await identity.requireSupabaseUser({ headers: { authorization: 'Bearer manipulated' } });
  restore();
  global.fetch = originalFetch;

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test('Valid token but missing role assignment returns 403', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: '13f7cd97-b407-4f49-bad8-c9e1139335f4', email: 'no-role@example.com' })
  });

  const { module: identity, restore } = withMockedModules(
    'netlify/functions/lib/identity.js',
    {
      'netlify/functions/lib/supabase.js': {
        getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' }),
        restGet: async (table) => {
          if (table === 'role_assignments') return [];
          if (table === 'user_profile') return [];
          return [];
        },
        restPost: async () => {
          throw new Error('user_profile insert should not run without role assignment');
        },
        restPatch: async () => []
      }
    }
  );

  const result = await identity.requireSupabaseUser({ headers: { authorization: 'Bearer valid-but-no-role' } });
  restore();
  global.fetch = originalFetch;

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test('authenticated direct write to training_progress is blocked by grants/policies', () => {
  const schema = fs.readFileSync(path.resolve('supabase-schema.sql'), 'utf8');

  assert.match(schema, /grant select on table training_progress to authenticated;/i);
  assert.match(schema, /revoke insert, update, delete on table training_progress from authenticated;/i);
  assert.doesNotMatch(schema, /grant[^\n]*insert[^\n]*training_progress[^\n]*authenticated;/i);
  assert.doesNotMatch(schema, /create policy training_progress_insert_own[\s\S]*for insert/i);
});

test('authenticated manipulation of training_progress is blocked by grants/policies', () => {
  const schema = fs.readFileSync(path.resolve('supabase-schema.sql'), 'utf8');

  assert.doesNotMatch(schema, /grant[^\n]*update[^\n]*training_progress[^\n]*authenticated;/i);
  assert.doesNotMatch(schema, /create policy training_progress_update_own[\s\S]*for update/i);
  assert.match(schema, /create policy training_progress_select_own[\s\S]*using \(user_id = auth\.uid\(\)\)/i);
});

test('authenticated direct write to quiz_attempts outside flow is blocked', () => {
  const schema = fs.readFileSync(path.resolve('supabase-schema.sql'), 'utf8');

  assert.match(schema, /grant select on table quiz_attempts to authenticated;/i);
  assert.match(schema, /revoke insert, update, delete on table quiz_attempts from authenticated;/i);
  assert.doesNotMatch(schema, /grant[^\n]*insert[^\n]*quiz_attempts[^\n]*authenticated;/i);
  assert.doesNotMatch(schema, /create policy quiz_attempts_insert_own[\s\S]*for insert/i);
});

test('authenticated cannot directly update role in user_profile', () => {
  const schema = fs.readFileSync(path.resolve('supabase-schema.sql'), 'utf8');

  assert.match(schema, /grant update \(email, updated_at\) on table user_profile to authenticated;/i);
  assert.doesNotMatch(schema, /grant update \(.*role.*\) on table user_profile to authenticated;/i);
  assert.match(schema, /create policy user_profile_update_own[\s\S]*using \(id = auth\.uid\(\)\)[\s\S]*with check \(id = auth\.uid\(\)\)/i);
});

test('authenticated cannot directly write or modify certificates', () => {
  const schema = fs.readFileSync(path.resolve('supabase-schema.sql'), 'utf8');

  assert.match(schema, /grant select on table certificates to authenticated;/i);
  assert.match(schema, /revoke insert, update, delete on table certificates from authenticated;/i);
  assert.doesNotMatch(schema, /grant[^\n]*insert[^\n]*certificates[^\n]*authenticated;/i);
  assert.doesNotMatch(schema, /grant[^\n]*update[^\n]*certificates[^\n]*authenticated;/i);
  assert.match(schema, /create policy certificates_select_own[\s\S]*using \(user_id = auth\.uid\(\)\)/i);
});

test('role_assignments remains direct-read/write blocked for authenticated', () => {
  const schema = fs.readFileSync(path.resolve('supabase-schema.sql'), 'utf8');

  assert.match(schema, /create policy role_assignments_no_direct_access[\s\S]*using \(false\)[\s\S]*with check \(false\)/i);
  assert.match(schema, /revoke all on table role_assignments, user_profile, training_progress, quiz_attempts, certificates from anon, authenticated;/i);
});

test('Learning endpoints reject client-provided user_id override', async () => {
  const baseIdentity = {
    requireSupabaseUser: async () => ({
      ok: true,
      profile: { id: 'f3e2ab7d-8e88-4c2d-a7fc-9c1a95f938d2', role: 'pharma', email: 'u@example.com' }
    })
  };

  const start = withMockedModules('netlify/functions/v1-start-training.js', {
    'netlify/functions/lib/identity.js': baseIdentity,
    'netlify/functions/lib/supabase.js': { json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }) },
    'netlify/functions/lib/v1-data.js': { ensureTrainingProgress: async () => ({ id: 'tp1' }) }
  });

  const submit = withMockedModules('netlify/functions/v1-submit-quiz.js', {
    'netlify/functions/lib/identity.js': baseIdentity,
    'netlify/functions/lib/supabase.js': { json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }) },
    'netlify/functions/lib/v1-data.js': { recordQuizSubmission: async () => ({}) }
  });

  const startResp = await start.module.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ user_id: 'victim-id', training_id: 'hygiene-basics' })
  });

  const submitResp = await submit.module.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ user_id: 'victim-id', training_id: 'hygiene-basics', score: 85 })
  });

  start.restore();
  submit.restore();

  assert.equal(startResp.statusCode, 400);
  assert.equal(submitResp.statusCode, 400);
});


test('v1-admin-invite returns 500 when invite redirect url env is missing', async () => {
  const oldRedirect = process.env.SUPABASE_INVITE_REDIRECT_URL;
  const oldSite = process.env.NETLIFY_SITE_URL;
  delete process.env.SUPABASE_INVITE_REDIRECT_URL;
  delete process.env.NETLIFY_SITE_URL;

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Supabase invite call must not run without redirect url');
  };

  const { module, restore } = withMockedModules('netlify/functions/v1-admin-invite.js', {
    'netlify/functions/lib/identity.js': {
      requireSupabaseUser: async () => ({ ok: true, profile: { id: 'admin-id', role: 'admin', email: 'admin@example.com' } })
    },
    'netlify/functions/lib/supabase.js': {
      json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
      getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' })
    },
    'netlify/functions/lib/v1-data.js': {
      createOrRefreshRoleAssignment: async () => {}
    }
  });

  const resp = await module.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ email: 'new@example.com', role: 'pharma' })
  });

  restore();
  global.fetch = originalFetch;
  if (oldRedirect === undefined) delete process.env.SUPABASE_INVITE_REDIRECT_URL; else process.env.SUPABASE_INVITE_REDIRECT_URL = oldRedirect;
  if (oldSite === undefined) delete process.env.NETLIFY_SITE_URL; else process.env.NETLIFY_SITE_URL = oldSite;

  assert.equal(resp.statusCode, 500);
  assert.match(resp.body, /SUPABASE_INVITE_REDIRECT_URL/);
});

test('v1-admin-invite forwards redirect_to from environment', async () => {
  const oldRedirect = process.env.SUPABASE_INVITE_REDIRECT_URL;
  process.env.SUPABASE_INVITE_REDIRECT_URL = 'https://staging.example.netlify.app/';

  const originalFetch = global.fetch;
  let invitePayload = null;
  global.fetch = async (_, options) => {
    invitePayload = JSON.parse(options.body);
    return { ok: true, json: async () => ({}) };
  };

  const { module, restore } = withMockedModules('netlify/functions/v1-admin-invite.js', {
    'netlify/functions/lib/identity.js': {
      requireSupabaseUser: async () => ({ ok: true, profile: { id: 'admin-id', role: 'admin', email: 'admin@example.com' } })
    },
    'netlify/functions/lib/supabase.js': {
      json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) }),
      getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' })
    },
    'netlify/functions/lib/v1-data.js': {
      createOrRefreshRoleAssignment: async () => {}
    }
  });

  const resp = await module.handler({
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ email: 'new@example.com', role: 'pharma' })
  });

  restore();
  global.fetch = originalFetch;
  if (oldRedirect === undefined) delete process.env.SUPABASE_INVITE_REDIRECT_URL; else process.env.SUPABASE_INVITE_REDIRECT_URL = oldRedirect;

  assert.equal(resp.statusCode, 200);
  assert.equal(invitePayload.redirect_to, 'https://staging.example.netlify.app/');
});


test('v1-auth-config exposes only public supabase values', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldAnon = process.env.SUPABASE_ANON_KEY;
  const oldService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://abcd1234.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-public-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-secret-key';

  const { module, restore } = withMockedModules('netlify/functions/v1-auth-config.js', {
    'netlify/functions/lib/supabase.js': {
      json: (statusCode, body) => ({ statusCode, body: JSON.stringify(body) })
    }
  });

  const resp = await module.handler();
  restore();

  if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
  if (oldAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = oldAnon;
  if (oldService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldService;

  assert.equal(resp.statusCode, 200);
  const payload = JSON.parse(resp.body);
  assert.equal(payload.supabase_url, 'https://abcd1234.supabase.co');
  assert.equal(payload.supabase_anon_key, 'anon-public-key');
  assert.equal(Object.hasOwn(payload, 'supabase_service_role_key'), false);
});


test('requireSupabaseUser bootstraps profile with org_id from org table', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: 'auth-user-1', email: 'new.user@example.com' })
  });

  let createdPayload = null;
  const { module: identity, restore } = withMockedModules('netlify/functions/lib/identity.js', {
    'netlify/functions/lib/supabase.js': {
      getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' }),
      restGet: async (table) => {
        if (table === 'role_assignments') return [{ email: 'new.user@example.com', role: 'pharma' }];
        if (table === 'user_profile') return [];
        if (table === 'org') return [{ id: 'org-default-1' }];
        return [];
      },
      restPost: async (table, payload) => {
        if (table === 'user_profile') {
          createdPayload = payload;
          return [payload];
        }
        return [];
      },
      restPatch: async () => []
    }
  });

  const result = await identity.requireSupabaseUser({ headers: { authorization: 'Bearer ok' } });
  restore();
  global.fetch = originalFetch;

  assert.equal(result.ok, true);
  assert.equal(createdPayload.org_id, 'org-default-1');
  assert.equal(createdPayload.id, 'auth-user-1');
});

test('requireSupabaseUser returns clear error when no organization exists', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: 'auth-user-2', email: 'new.user2@example.com' })
  });

  const { module: identity, restore } = withMockedModules('netlify/functions/lib/identity.js', {
    'netlify/functions/lib/supabase.js': {
      getConfig: () => ({ baseUrl: 'https://example.supabase.co', serviceKey: 'service-role' }),
      restGet: async (table) => {
        if (table === 'role_assignments') return [{ email: 'new.user2@example.com', role: 'non_pharma' }];
        if (table === 'user_profile') return [];
        if (table === 'org') return [];
        return [];
      },
      restPost: async () => [],
      restPatch: async () => []
    }
  });

  const result = await identity.requireSupabaseUser({ headers: { authorization: 'Bearer ok' } });
  restore();
  global.fetch = originalFetch;

  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.error, 'No organization configured');
});
