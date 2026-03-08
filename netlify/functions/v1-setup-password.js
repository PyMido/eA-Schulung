const { json } = require('./lib/supabase');

exports.handler = async () => {
  return json(410, {
    error: 'Deprecated endpoint. Use Supabase invite/recovery flow for password setup.'
  });
};
