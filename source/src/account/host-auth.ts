import { useEffect, useState } from "react";

const BEARER_KEY = "grok-auth.bearer-token";
const SESSION_EVENT = "cert-oki-host-session";

export type HostUser = { displayName: string | null; primaryEmail: string | null };

function inLivePreview() {
  return typeof window !== "undefined" && window.location.hostname.endsWith(".grok-sandbox.com");
}

function readBearer() {
  try {
    return sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function writeBearer(token: string | null) {
  try {
    if (token) sessionStorage.setItem(BEARER_KEY, token);
    else sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function useHostUser() {
  const [user, setUser] = useState<HostUser | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(SESSION_EVENT, refresh);
    return () => window.removeEventListener(SESSION_EVENT, refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const headers = new Headers();
    const token = readBearer();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    fetch("/api/auth/get-session", { credentials: "include", headers })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const id = data?.user?.id;
        if (cancelled || !id || id === "dev-user") return;
        setUser({ displayName: data.user.name ?? null, primaryEmail: data.user.email ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return user;
}

type PopupMessage = { source?: string; token?: string | null };

export async function signIn(providerId: string, opts: { callbackURL?: string } = {}) {
  const callbackURL = opts.callbackURL ?? "/";
  const popup = inLivePreview() ? openPopup(providerId) : null;
  if (inLivePreview()) {
    if (!popup) throw new Error("弹窗被拦住了，允许弹窗后再登录");
    const token = await waitForPopup(popup);
    if (!token) throw new Error("登录已取消");
    writeBearer(token);
    window.dispatchEvent(new Event(SESSION_EVENT));
    return;
  }
  const response = await fetch("/api/auth/sign-in/oauth2", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId, callbackURL, errorCallbackURL: callbackURL })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "登录没有连上");
  if (data.url) window.location.href = data.url;
}

function openPopup(providerId: string) {
  const url = `${window.location.origin}/auth/popup?providerId=${encodeURIComponent(providerId)}`;
  return window.open(url, `cert-oki-signin-${Date.now()}`, "popup,width=500,height=650");
}

function waitForPopup(popup: Window) {
  return new Promise<string | null>((resolve) => {
    const origin = window.location.origin;
    let settled = false;
    const timer = window.setInterval(() => {
      if (popup.closed) finish(null);
    }, 400);
    function finish(token: string | null) {
      if (settled) return;
      settled = true;
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
      resolve(token);
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const data = event.data as PopupMessage | undefined;
      if (data?.source !== "grok-auth-popup") return;
      finish(data.token ?? null);
    }
    window.addEventListener("message", onMessage);
  });
}
