"""Transactional email via Resend's REST API (over the existing httpx dependency).

Used by the public signup flow to deliver a user's magic link: their personal UI URL plus the
MCP connector URL, localized to the language the landing was viewed in (ru/en/es/fr; the SPA
passes it with the signup request). If RESEND_API_KEY is unset the send is a logged no-op so
local/dev and tests work without an email provider configured.

Copy rules mirror the landing (docs/LANDING_COPY.md): no em dashes, no quotation marks, tone
matches the app. The template is dark and brand-colored like the product, with a starter prompt
the user can say to their assistant right after connecting.
"""

from __future__ import annotations

import logging
import os

import httpx

from . import telegram_alert
from .observability import mask_token

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
_DEFAULT_FROM = "Workout <onboarding@resend.dev>"

DEFAULT_LANG = "en"

# Visual tokens shared with the app (web/src/styles/theme.css, dark).
_BG = "#0B0D0E"
_CARD = "#15181A"
_TEXT = "#F5F5F5"
_MUTED = "#9CA3AF"
_ACCENT = "#C6F432"
_BORDER = "rgba(255,255,255,0.08)"

STRINGS: dict[str, dict[str, str]] = {
    "ru": {
        "subject": "Твой журнал AIm готов",
        "brand": "AIm",
        "title": "Твой журнал готов",
        "lead": "AIm работает внутри твоего ассистента: рассказываешь про тренировку в чате, он записывает и планирует следующую от твоих весов.",
        "connect_cta": "Открыть приложение и подключиться",
        "mcp_label": "Адрес для подключения",
        "preheader": "Осталось подключить ассистента.",
        "mcp_hint": "Скопируй, если настраиваешь вручную.",
        "warning": "Ссылка даёт полный доступ к журналу, не пересылай её.",
        "footer": "AIm · тренер внутри твоего ИИ · Workout hard and smart",
    },
    "en": {
        "subject": "Your AIm journal is ready",
        "brand": "AIm",
        "title": "Your journal is ready",
        "lead": "AIm runs inside your assistant: tell it about a workout in chat, it logs the session and plans the next one from your numbers.",
        "connect_cta": "Open the app and connect",
        "mcp_label": "Connection address",
        "preheader": "One step left: connect your assistant.",
        "mcp_hint": "Copy it if you are setting this up by hand.",
        "warning": "This link gives full access to your journal. Do not forward it.",
        "footer": "AIm · the coach inside your AI · Workout hard and smart",
    },
    "pt": {
        "subject": "O seu diário AIm está pronto",
        "brand": "AIm",
        "title": "O seu diário está pronto",
        "lead": "O AIm funciona dentro do seu assistente: você conta o treino no chat, ele registra e planeja o próximo a partir das suas cargas.",
        "connect_cta": "Abrir o app e conectar",
        "mcp_label": "Endereço de conexão",
        "preheader": "Falta conectar o seu assistente.",
        "mcp_hint": "Copie se for configurar manualmente.",
        "warning": "Este link dá acesso completo ao seu diário. Não encaminhe.",
        "footer": "AIm · o treinador dentro da sua IA · Workout hard and smart",
    },
    "es": {
        "subject": "Su diario AIm está listo",
        "brand": "AIm",
        "title": "Su diario está listo",
        "lead": "AIm funciona dentro de su asistente: usted le cuenta el entrenamiento en el chat, él lo registra y planifica el siguiente con sus cargas.",
        "connect_cta": "Abrir la app y conectar",
        "mcp_label": "Dirección de conexión",
        "preheader": "Solo falta conectar su asistente.",
        "mcp_hint": "Cópiela si va a configurarlo a mano.",
        "warning": "Este enlace da acceso completo a su diario. No lo reenvíe.",
        "footer": "AIm · el entrenador dentro de tu IA · Workout hard and smart",
    },
    "fr": {
        "subject": "Votre journal AIm est prêt",
        "brand": "AIm",
        "title": "Votre journal est prêt",
        "lead": "AIm fonctionne dans votre assistant : vous racontez la séance dans le chat, il l'enregistre et planifie la suivante à partir de vos charges.",
        "connect_cta": "Ouvrir l'app et se connecter",
        "mcp_label": "Adresse de connexion",
        "preheader": "Il reste à connecter votre assistant.",
        "mcp_hint": "Copiez-la si vous configurez à la main.",
        "warning": "Ce lien donne un accès complet à votre journal. Ne le transférez pas.",
        "footer": "AIm · le coach dans votre IA · Workout hard and smart",
    },
}


# Where the email's one button lands. Normally the in-app connect page; the OAuth consent screen
# passes its own path so a link mailed mid-authorization drops the person back into the flow they
# started instead of the app's front door (see oauth.py's resume route). A parameter rather than a
# second template, so there is one email to write, translate and keep honest.
CONNECT_PATH = "/connect"


def _base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "https://workout-storage.vercel.app").rstrip("/")


def _magic_link_text(
    ui_url: str, mcp_url: str, lang: str = DEFAULT_LANG, connect_path: str = CONNECT_PATH
) -> str:
    """The plain-text part, written rather than derived.

    Resend generates one from the HTML when we do not send it, but that converter's treatment of
    the hidden preview block is an assumption: if it does not honour display:none, every
    text-only reader starts with the preheader followed by a run of invisible-glyph entities
    before any real content. Writing it costs five lines and removes the guess.
    """
    s = STRINGS.get(lang, STRINGS[DEFAULT_LANG])
    return (
        f"{s['title']}\n\n"
        f"{s['lead']}\n\n"
        f"{s['connect_cta']}: {ui_url}{connect_path}\n\n"
        f"{s['mcp_label']}:\n{mcp_url}\n{s['mcp_hint']}\n\n"
        f"{s['warning']}\n\n"
        f"{s['footer']}\n"
    )


def _magic_link_html(
    ui_url: str, mcp_url: str, lang: str = DEFAULT_LANG, connect_path: str = CONNECT_PATH
) -> str:
    s = STRINGS.get(lang, STRINGS[DEFAULT_LANG])
    card = (
        f"background:{_CARD};border:1px solid {_BORDER};border-radius:16px;"
        "padding:20px 22px;margin:0 0 14px;"
    )
    muted = f"color:{_MUTED};font-size:14px;line-height:1.55;margin:0;"
    # A document, not a fragment. This used to return a bare <div> and Resend was handed that
    # directly, so the mail went out with no charset (a real risk for the Cyrillic and accented
    # copy), no lang for screen readers, and nothing telling a client the dark palette is
    # deliberate. color-scheme is what stops a client's own dark-mode pass from inverting the
    # solid button's background without lightening its near-black text, which would leave dark
    # text on a dark button.
    return f"""\
<!doctype html>
<html lang="{lang if lang in STRINGS else DEFAULT_LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{s["subject"]}</title>
</head>
<body style="margin:0;padding:0;background:{_BG};">
<div style="background:{_BG};padding:36px 16px;">
  <!-- Preview text. Mail clients render the first visible text next to the subject; without this
       they showed the brand line, wasting the slot. Kept under ~50 characters so the second app
       name survives a 30-character mobile truncation. The trailing spaces stop the client from
       pulling the next line of the body in after it. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;">
    {s["preheader"]}&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;&#8199;&#65279;
  </div>
  <div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

    <p style="color:{_TEXT};font-size:19px;font-weight:500;margin:0 0 28px;">
      {s["brand"]} <span style="color:{_ACCENT};">&#9679;</span>
    </p>

    <h1 style="color:{_TEXT};font-size:27px;line-height:1.2;font-weight:500;margin:0 0 12px;">{s["title"]}</h1>
    <p style="{muted}margin-bottom:20px;">{s["lead"]}</p>

    <!-- One button, and it goes to the connect page rather than the app. Sending someone into
         an empty journal first read as "it is broken" in the first-run review: nothing is logged
         until the assistant is connected. /connect is inside the app, so this still lands them in
         their own account, on the page that has a copy button and instructions. -->
    <p style="margin:0 0 22px;">
      <a href="{ui_url}{connect_path}"
         style="display:block;width:100%;box-sizing:border-box;background:{_ACCENT};color:{_BG};
                font-size:16px;font-weight:600;line-height:20px;padding:16px 20px;
                border-radius:12px;text-decoration:none;text-align:center;">{s["connect_cta"]}</a>
    </p>

    <div style="{card}">
      <p style="color:{_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">{s["mcp_label"]}</p>
      <!-- For the person who pastes straight from the inbox, which is how the only user who ever
           activated did it. A real anchor rather than styled text, because long-pressing a link
           offers Copy while long-pressing plain text forces selection handles across a wrapped
           60-character string. Deliberately not a button: a browser GET answers 405, so a tap
           would look broken, and the hint says so. The platform steps are not repeated here;
           they live on the page the second button opens. -->
      <p style="background:{_BG};border:1px solid {_BORDER};border-radius:10px;padding:12px 14px;margin:0 0 8px;">
        <a href="{mcp_url}" style="color:{_ACCENT};font-size:13px;word-break:break-all;
           text-decoration:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">{mcp_url}</a>
      </p>
      <p style="color:{_MUTED};font-size:12px;line-height:1.5;margin:0;">{s["mcp_hint"]}</p>
    </div>

    <p style="color:{_MUTED};font-size:12px;line-height:1.5;margin:0 0 22px;">{s["warning"]}</p>

    <!-- #6B7280 on this background computes to 4.0:1, under the 4.5:1 AA bar for 11px text. -->
    <p style="color:{_MUTED};font-size:11px;margin:0;border-top:1px solid {_BORDER};padding-top:16px;">{s["footer"]}</p>
  </div>
</div>
</body>
</html>"""


async def send_magic_link(
    to: str, token: str, lang: str = DEFAULT_LANG, *, connect_path: str = CONNECT_PATH
) -> str | None:
    """Email the user their UI + MCP URLs. Returns Resend's message id, or None if not sent.

    The id is the join key for delivery telemetry: Resend's webhooks (delivered, opened, bounced,
    complained) carry it and nothing else that identifies the message. It used to be discarded,
    which is why we could never tell an ignored email from one that never arrived. Callers record
    it against the user via repo.record_email_event so a webhook can be traced back to a person.
    """
    api_key = os.environ.get("RESEND_API_KEY")
    base = _base_url()
    ui_url = f"{base}/{token}"
    # The OAuth endpoint: one address for everybody, no token in it. Claude asks the person to
    # sign in and approve instead of having them paste a credential, which is the step the funnel
    # was losing people at. The personal `/{token}/mcp` address still works and is what the app's
    # connect screen shows for ChatGPT, whose connector flow is configured with no authentication.
    mcp_url = f"{base}/mcp"
    if lang not in STRINGS:
        lang = DEFAULT_LANG

    if not api_key:
        # Never log the link itself — it contains the user's live credential.
        log.warning(
            "RESEND_API_KEY unset, skipping magic-link email",
            extra={"event": "email_skipped", "to": to, "token": mask_token(token)},
        )
        await telegram_alert.notify("magic-link email", "RESEND_API_KEY unset")
        return None

    payload = {
        "from": os.environ.get("EMAIL_FROM", _DEFAULT_FROM),
        "to": [to],
        "subject": STRINGS[lang]["subject"],
        "html": _magic_link_html(ui_url, mcp_url, lang, connect_path),
        "text": _magic_link_text(ui_url, mcp_url, lang, connect_path),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            resp.raise_for_status()
            # Resend answers {"id": "..."}. A malformed body is not worth failing the signup
            # over: the mail is already away, we just lose the ability to trace this one.
            email_id = (resp.json() or {}).get("id")
        log.info(
            "magic-link email sent",
            extra={"event": "email_sent", "to": to, "lang": lang, "email_id": email_id},
        )
        return str(email_id) if email_id else None
    except Exception as exc:  # noqa: BLE001 - never let an email failure surface the token/abort signup
        log.error(
            "Resend send failed: %s",
            exc,
            extra={"event": "email_send_failed", "to": to},
        )
        # This exact failure mode (Resend test mode / unverified EMAIL_FROM domain) silently
        # blocked real signups before it was caught — see docs/DEPLOYMENT.md runbook. The account
        # itself is created regardless, so it's recoverable, but only if someone finds out.
        await telegram_alert.notify("magic-link email", f"{type(exc).__name__}: {exc}")
        return None
