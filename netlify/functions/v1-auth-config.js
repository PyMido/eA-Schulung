const { json } = require('./lib/supabase');

exports.handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL || null;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || null;

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' });
  }

  return json(200, {
    ok: true,
    supabase_url: supabaseUrl,
    supabase_anon_key: supabaseAnonKey
  });
};
