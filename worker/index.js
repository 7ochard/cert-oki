const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/entries" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          "select id, title, slug, body, status from cms_entry order by id desc"
        ).all();
        return json(results ?? []);
      }
      if (url.pathname === "/login" && request.method === "POST") {
        const body = await request.json();
        const name = String(body.name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!name || !email.includes("@")) return json({ error: "请填写姓名和邮箱" }, 400);
        const existing = await env.DB.prepare(
          "select id, name, email, role from app_user where email = ?"
        ).bind(email).first();
        if (existing) return json(existing);
        const count = await env.DB.prepare("select count(*) as n from app_user").first();
        const role = Number(count?.n ?? 0) === 0 ? "admin" : "editor";
        await env.DB.prepare("insert into app_user (name, email, role) values (?, ?, ?)").bind(name, email, role).run();
        const created = await env.DB.prepare(
          "select id, name, email, role from app_user where email = ?"
        ).bind(email).first();
        return json(created);
      }
      if (url.pathname === "/email/start" && request.method === "POST") {
        const body = await request.json();
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) return json({ error: "请填写邮箱" }, 400);
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await env.DB.prepare(
          "insert into email_code (email, code, expires_at) values (?, ?, datetime('now', '+10 minutes')) on conflict(email) do update set code = excluded.code, expires_at = excluded.expires_at"
        ).bind(email, code).run();
        return json({ error: "验证码邮件还没接上" }, 503);
      }
      if (url.pathname === "/email/verify" && request.method === "POST") {
        const body = await request.json();
        const email = String(body.email ?? "").trim().toLowerCase();
        const code = String(body.code ?? "").trim();
        const row = await env.DB.prepare(
          "select email from email_code where email = ? and code = ? and expires_at > datetime('now')"
        ).bind(email, code).first();
        if (!row) return json({ error: "验证码不对或已过期" }, 400);
        await env.DB.prepare("delete from email_code where email = ?").bind(email).run();
        const existing = await env.DB.prepare("select id, name, email, role from app_user where email = ?").bind(email).first();
        if (existing) return json(existing);
        const count = await env.DB.prepare("select count(*) as n from app_user").first();
        const role = Number(count?.n ?? 0) === 0 ? "admin" : "editor";
        const name = email.split("@")[0];
        await env.DB.prepare("insert into app_user (name, email, role) values (?, ?, ?)").bind(name, email, role).run();
        return json(await env.DB.prepare("select id, name, email, role from app_user where email = ?").bind(email).first());
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "error" }, 500);
    }
  }
};
