import { useEffect, useState } from "react";
import { LoginMarks } from "./login-marks";
import { useHostUser } from "./host-auth";

const CMS_URL = "https://cert-oki-cms.ip7ochard.workers.dev";
const SESSION_KEY = "cert-oki-cms-user";

type Entry = { id: number; title: string; slug: string; body: string; status: "draft" | "published" };
type CmsUser = { id: number; name: string; email: string; role: "admin" | "editor" };

export function AccountDock({ onApply }: { onApply: (entry: { title: string; body: string }) => void }) {
  const sessionUser = useHostUser();
  const [cmsUser, setCmsUser] = useState<CmsUser | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const name = sessionUser?.displayName || sessionUser?.primaryEmail || cmsUser?.name || "";

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) setCmsUser(JSON.parse(saved) as CmsUser);
    fetch(CMS_URL + "/entries")
      .then((response) => response.json())
      .then((rows: Entry[]) => Array.isArray(rows) && setEntries(rows))
      .catch(() => setError("CMS 没有连上"));
  }, []);

  function remember(user: CmsUser) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setCmsUser(user);
  }

  return (
    <aside className="account-dock" aria-label="登录">
      {name ? (
        <div className="account-dock-head">
          <strong>{name}</strong>
          {!sessionUser && (
            <button type="button" onClick={() => { localStorage.removeItem(SESSION_KEY); setCmsUser(null); }}>退出</button>
          )}
        </div>
      ) : (
        <LoginMarks onVerified={remember} />
      )}
      {error && <p className="account-dock-note">{error}</p>}
      {!!name && (
        <ul className="account-dock-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.title}<small>{entry.status === "published" ? "已发布" : "草稿"}</small></span>
              <button type="button" onClick={() => onApply(entry)}>用到合格证</button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
