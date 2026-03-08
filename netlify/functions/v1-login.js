const { json } = require('./lib/supabase');

exports.handler = async () => {
  return json(410, {
    error: 'Deprecated endpoint. Use Supabase Auth signInWithPassword on client, then call protected endpoints with Supabase access token.'
  });
};
