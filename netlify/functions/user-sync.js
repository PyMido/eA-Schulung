// user-sync.js
exports.handler = async (event, context) => {
  try {
    // --- 1) Netlify Identity User aus clientContext holen ---
    const raw = context?.clientContext?.custom?.netlify;
    if (!raw) {
      return { statusCode: 401, body: "Unauthorized (no netlify context)" };
    }
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const { user } = JSON.parse(decoded);

    if (!user?.sub) {
      return { statusCode: 401, body: "Unauthorized (no user)" };
    }

    // --- 2) Supabase Env Vars prüfen ---
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return { statusCode: 500, body: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const provider = "netlify";
    const providerSubject = user.sub;
    const email = user.email ?? null;

    // --- 3) Prüfen: existiert auth_account schon? ---
    const lookupUrl =
      `${supabaseUrl}/rest/v1/auth_account` +
      `?select=user_id&id=eq.dummy` // placeholder, wird unten ersetzt
        .replace("id=eq.dummy", `provider=eq.${provider}&provider_subject=eq.${providerSubject}`);

    const lookupResp = await fetch(lookupUrl, { headers });
    const lookupData = await lookupResp.json();

    if (lookupResp.ok && Array.isArray(lookupData) && lookupData.length > 0) {
      // Schon vorhanden
      return {
        statusCode: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: true, alreadySynced: true, userProfileId: lookupData[0].user_id }, null, 2),
      };
    }

    // --- 4) Org-ID holen (wir nehmen die erste Org; reicht für den Start) ---
    const orgResp = await fetch(`${supabaseUrl}/rest/v1/org?select=id&limit=1`, { headers });
    const orgData = await orgResp.json();
    if (!orgResp.ok || !orgData?.[0]?.id) {
      return { statusCode: 500, body: "No org found. Please insert one org row first." };
    }
    const orgId = orgData[0].id;

    // --- 5) user_profile anlegen ---
    const createProfileResp = await fetch(`${supabaseUrl}/rest/v1/user_profile`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        org_id: orgId,
        display_name: email, // minimal; kannst du später schöner machen
      }),
    });

    const profileData = await createProfileResp.json();
    if (!createProfileResp.ok || !profileData?.[0]?.id) {
      return { statusCode: 500, body: `Create user_profile failed: ${JSON.stringify(profileData)}` };
    }
    const userProfileId = profileData[0].id;

    // --- 6) auth_account anlegen (Link zum Netlify-User) ---
    const createAuthResp = await fetch(`${supabaseUrl}/rest/v1/auth_account`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userProfileId,
        provider,
        provider_subject: providerSubject,
        email,
      }),
    });

    const authData = await createAuthResp.json();
    if (!createAuthResp.ok) {
      return { statusCode: 500, body: `Create auth_account failed: ${JSON.stringify(authData)}` };
    }

    // --- 7) Audit-Event schreiben (optional, aber gut) ---
    await fetch(`${supabaseUrl}/rest/v1/audit_event`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        org_id: orgId,
        actor_user_id: userProfileId,
        event_type: "USER_SYNC",
        entity_table: "user_profile",
        entity_id: userProfileId,
        detail: { provider, email },
      }),
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true, alreadySynced: false, userProfileId }, null, 2),
    };
  } catch (e) {
    return { statusCode: 500, body: String(e?.message ?? e) };
  }
};
