// Token-less calls for the public landing page (signup). Mirrors api.ts's ORIGIN handling but
// hits the public, non-token-scoped endpoint.
import i18n from "../i18n";

const ORIGIN = (import.meta as any).env?.VITE_API_ORIGIN ?? "";

/** Request a magic link. Resolves on success; the token is never returned — it arrives by email. */
export async function signup(email: string): Promise<void> {
  const res = await fetch(`${ORIGIN}/api/public/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    // Language rides along so the magic-link email matches what the visitor read on the landing.
    body: JSON.stringify({ email, lang: i18n.resolvedLanguage ?? "en" }),
  });
  if (res.status === 429) throw new Error(i18n.t("errors.rateLimit"));
  const generic = i18n.t("errors.emailSend");
  if (!res.ok) throw new Error(generic);
  // Confirm it's actually our endpoint's JSON {ok:true}, not e.g. the SPA index.html served with
  // a 200 by a catch-all rewrite if the endpoint is missing/misrouted — that must not read as sent.
  let data: { ok?: boolean } | null = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(generic);
  }
  if (!data?.ok) throw new Error(generic);
}
