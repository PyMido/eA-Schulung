// netlify/functions/whoami.js

exports.handler = async (event, context) => {
  try {
    // 1) Identity-User aus clientContext lesen (Netlify Identity)
    let user = null;
    let identity = null;

    const raw = context?.clientContext?.custom?.netlify;
    if (raw) {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      user = parsed?.user ?? null;
      identity = parsed?.identity ?? null;
    }

    // 2) Env Vars prüfen (ohne Inhalte zu verraten)
    const hasSupabaseUrl = !!process.env.SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 3) Supabase Ping (kleiner GET auf eine Tabelle)
    //    -> Wir geben NICHT die URL oder Keys zurück, nur ob es klappt.
    let supabaseOk = false;
    let supabaseStatus = null;

    if (hasSupabaseUrl && hasServiceKey) {
      const url = `${process.env.SUPABASE_URL}/rest/v1/org?select=id&limit=1`;

      const resp = await fetch(url, {
        method: "GET",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      });

      supabaseStatus = resp.status;
      supabaseOk = resp.ok;
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(
        {
          loggedIn: !!user,
          userEmail: user?.email ?? null,
          userId: user?.sub ?? null,
          env: {
            hasSupabaseUrl,
            hasServiceKey,
          },
          supabase: {
            ok: supabaseOk,
            httpStatus: supabaseStatus,
          },
          note:
            "Wenn loggedIn=false: Token fehlt/ungültig. Wenn supabase.ok=false: Env Vars oder Supabase-Zugriff prüfen.",
        },
        null,
        2
      ),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: String(e?.message ?? e) }),
    };
  }
};
