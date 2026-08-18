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
        "subject": "Ваш доступ к AIm",
        "brand": "AIm",
        "title": "Ваш журнал тренировок готов",
        "lead": "Сохраните это письмо. Ссылка ниже и есть ваш вход, без паролей.",
        "map_title": "Как всё устроено",
        "map_steps": "Открыть приложение по кнопке → подключить ИИ (две минуты) → рассказывать тренеру в чате → смотреть прогресс в приложении",
        "map_note": "Записываете тренировки вы в чате с ИИ. А приложение открываете, чтобы смотреть программу, прогресс и графики.",
        "open": "Открыть AIm",
        "connect_title": "Подключите ИИ за две минуты",
        "claude": "Claude: Settings → Connectors → Add custom connector → вставьте адрес ниже. Работает и на бесплатном тарифе.",
        "chatgpt": "ChatGPT: Settings → Security and login → включите Developer mode. Затем Settings → Plugins → плюс → вставьте адрес ниже, Authentication: No Auth → Create. После этого перезагрузите страницу.",
        "guide": "Пошаговая инструкция со скриншотами",
        "mcp_label": "Ваш адрес для подключения",
        "start_title": "С чего начать",
        "start_lead": "После подключения напишите или скажите ассистенту:",
        "prompt": "Составь мне программу тренировок с моим тренером AIm",
        "start_note": "При первом разговоре тренер сначала познакомится: спросит про цель, опыт, график, оборудование и травмы. Потом соберёт программу и будет вести вас дальше.",
        "start_more": "Потом можно просить: спланируй следующую тренировку, разбери мою неделю, проверь, не нужен ли разгруз.",
        "warning": "Не делитесь этой ссылкой: она даёт полный доступ к вашему журналу.",
        "footer": "AIm · тренер внутри вашего ИИ · Workout hard and smart",
    },
    "en": {
        "subject": "Your access to AIm",
        "brand": "AIm",
        "title": "Your workout journal is ready",
        "lead": "Keep this email. The link below is your login, no passwords.",
        "map_title": "How it all fits together",
        "map_steps": "Open the app via the button → connect your AI (two minutes) → talk to the coach in the chat → watch your progress in the app",
        "map_note": "You log workouts in the chat with your AI. You open the app to see your program, progress and charts.",
        "open": "Open AIm",
        "connect_title": "Connect your AI in two minutes",
        "claude": "Claude: Settings → Connectors → Add custom connector → paste the address below. Works on the free plan too.",
        "chatgpt": "ChatGPT: Settings → Security and login → turn on Developer mode. Then Settings → Plugins → plus → paste the address below, Authentication: No Auth → Create. Reload the page afterward.",
        "guide": "Step by step guide with screenshots",
        "mcp_label": "Your connection address",
        "start_title": "Where to start",
        "start_lead": "Once connected, tell your assistant:",
        "prompt": "Build me a training program with my AIm coach",
        "start_note": "In the first conversation the coach gets to know you: your goal, experience, schedule, equipment and injuries. Then it builds your program and keeps coaching you.",
        "start_more": "Later you can ask: plan my next workout, review my week, check if I need a deload.",
        "warning": "Don't share this link: it grants full access to your journal.",
        "footer": "AIm · the coach inside your AI · Workout hard and smart",
    },
    "pt": {
        "subject": "O seu acesso ao AIm",
        "brand": "AIm",
        "title": "O seu diário de treinos está pronto",
        "lead": "Guarde este e-mail. O link abaixo é o seu acesso, sem senhas.",
        "map_title": "Como tudo funciona",
        "map_steps": "Abrir o app pelo botão → conectar a sua IA (dois minutos) → contar ao treinador no chat → ver o seu progresso no app",
        "map_note": "Os treinos você registra no chat com a IA. O app você abre para ver o seu programa, progresso e gráficos.",
        "open": "Abrir o AIm",
        "connect_title": "Conecte a sua IA em dois minutos",
        "claude": "Claude: Settings → Connectors → Add custom connector → cole o endereço abaixo. Funciona também no plano gratuito.",
        "chatgpt": "ChatGPT: Settings → Security and login → ative o Developer mode. Depois Settings → Plugins → mais → cole o endereço abaixo, Authentication: No Auth → Create. Recarregue a página depois.",
        "guide": "Guia passo a passo com capturas de tela",
        "mcp_label": "O seu endereço de conexão",
        "start_title": "Por onde começar",
        "start_lead": "Depois de conectar, diga ao seu assistente:",
        "prompt": "Monte um programa de treino comigo usando o meu treinador AIm",
        "start_note": "Na primeira conversa o treinador primeiro conhece você: objetivo, experiência, agenda, equipamento e lesões. Depois monta o seu programa e acompanha.",
        "start_more": "Depois você pode pedir: planeje a minha próxima sessão, revise a minha semana, veja se preciso de uma semana leve.",
        "warning": "Não compartilhe este link: ele dá acesso completo ao seu diário.",
        "footer": "AIm · o treinador dentro da sua IA · Workout hard and smart",
    },
    "es": {
        "subject": "Su acceso a AIm",
        "brand": "AIm",
        "title": "Su diario de entrenamientos está listo",
        "lead": "Guarde este correo. El enlace de abajo es su acceso, sin contraseñas.",
        "map_title": "Cómo funciona todo",
        "map_steps": "Abrir la app con el botón → conectar su IA (dos minutos) → contarle al entrenador en el chat → ver su progreso en la app",
        "map_note": "Los entrenamientos los registra usted en el chat con la IA. La app la abre para ver su programa, progreso y gráficos.",
        "open": "Abrir AIm",
        "connect_title": "Conecte su IA en dos minutos",
        "claude": "Claude: Settings → Connectors → Add custom connector → pegue la dirección de abajo. Funciona también en el plan gratuito.",
        "chatgpt": "ChatGPT: Settings → Security and login → active Developer mode. Luego Settings → Plugins → más → pegue la dirección de abajo, Authentication: No Auth → Create. Recargue la página después.",
        "guide": "Guía paso a paso con capturas de pantalla",
        "mcp_label": "Su dirección de conexión",
        "start_title": "Por dónde empezar",
        "start_lead": "Una vez conectado, dígale a su asistente:",
        "prompt": "Hazme un programa de entrenamiento con mi entrenador AIm",
        "start_note": "En la primera conversación el entrenador primero le conoce: objetivo, experiencia, horario, equipamiento y lesiones. Luego arma su programa y le acompaña.",
        "start_more": "Después puede pedir: planifica mi próxima sesión, repasa mi semana, mira si necesito una descarga.",
        "warning": "No comparta este enlace: da acceso completo a su diario.",
        "footer": "AIm · el entrenador dentro de tu IA · Workout hard and smart",
    },
    "fr": {
        "subject": "Votre accès à AIm",
        "brand": "AIm",
        "title": "Votre journal d'entraînement est prêt",
        "lead": "Gardez cet e-mail. Le lien ci-dessous est votre accès, sans mot de passe.",
        "map_title": "Comment tout s'articule",
        "map_steps": "Ouvrir l'app via le bouton → connecter votre IA (deux minutes) → parler au coach dans le chat → suivre votre progression dans l'app",
        "map_note": "Les séances, vous les racontez dans le chat avec l'IA. L'app, vous l'ouvrez pour voir votre programme, votre progression et vos graphiques.",
        "open": "Ouvrir AIm",
        "connect_title": "Connectez votre IA en deux minutes",
        "claude": "Claude : Settings → Connectors → Add custom connector → collez l'adresse ci-dessous. Fonctionne aussi avec le plan gratuit.",
        "chatgpt": "ChatGPT : Settings → Security and login → activez Developer mode. Puis Settings → Plugins → plus → collez l'adresse ci-dessous, Authentication : No Auth → Create. Rechargez la page ensuite.",
        "guide": "Guide pas à pas avec captures d'écran",
        "mcp_label": "Votre adresse de connexion",
        "start_title": "Par où commencer",
        "start_lead": "Une fois connecté, dites à votre assistant :",
        "prompt": "Crée-moi un programme d'entraînement avec mon coach AIm",
        "start_note": "Lors de la première conversation, le coach fait d'abord connaissance : objectif, expérience, emploi du temps, matériel et blessures. Ensuite il bâtit votre programme et vous suit.",
        "start_more": "Ensuite vous pouvez demander : planifie ma prochaine séance, fais le bilan de ma semaine, vérifie s'il me faut une décharge.",
        "warning": "Ne partagez pas ce lien : il donne un accès complet à votre journal.",
        "footer": "AIm · le coach dans votre IA · Workout hard and smart",
    },
}


def _base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "https://workout-storage.vercel.app").rstrip("/")


def _magic_link_html(ui_url: str, mcp_url: str, lang: str = DEFAULT_LANG) -> str:
    s = STRINGS.get(lang, STRINGS[DEFAULT_LANG])
    card = (
        f"background:{_CARD};border:1px solid {_BORDER};border-radius:16px;"
        "padding:20px 22px;margin:0 0 14px;"
    )
    muted = f"color:{_MUTED};font-size:14px;line-height:1.55;margin:0;"
    return f"""\
<div style="background:{_BG};padding:36px 16px;">
  <div style="max-width:520px;margin:0 auto;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

    <p style="color:{_TEXT};font-size:19px;font-weight:500;margin:0 0 28px;">
      {s["brand"]} <span style="color:{_ACCENT};">&#9679;</span>
    </p>

    <h1 style="color:{_TEXT};font-size:27px;line-height:1.2;font-weight:500;margin:0 0 12px;">{s["title"]}</h1>
    <p style="{muted}margin-bottom:20px;">{s["lead"]}</p>

    <div style="{card}">
      <p style="color:{_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">{s["map_title"]}</p>
      <p style="color:{_TEXT};font-size:14px;line-height:1.6;margin:0 0 10px;">{s["map_steps"]}</p>
      <p style="color:{_MUTED};font-size:12px;line-height:1.5;margin:0;">{s["map_note"]}</p>
    </div>

    <p style="margin:0 0 10px;">
      <a href="{ui_url}"
         style="display:inline-block;background:{_ACCENT};color:{_BG};font-size:15px;font-weight:500;
                padding:14px 30px;border-radius:12px;text-decoration:none;">{s["open"]}</a>
    </p>
    <p style="color:{_MUTED};font-size:12px;word-break:break-all;margin:0 0 28px;">{ui_url}</p>

    <div style="{card}">
      <p style="color:{_TEXT};font-size:16px;font-weight:500;margin:0 0 12px;">{s["connect_title"]}</p>
      <p style="{muted}margin-bottom:10px;">{s["claude"]}</p>
      <p style="{muted}margin-bottom:10px;">{s["chatgpt"]}</p>
      <p style="margin:0 0 16px;">
        <a href="{ui_url}/connect" style="color:{_ACCENT};font-size:14px;text-decoration:underline;">{s["guide"]} &rarr;</a>
      </p>
      <p style="color:{_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">{s["mcp_label"]}</p>
      <p style="background:{_BG};border:1px solid {_BORDER};border-radius:10px;padding:12px 14px;margin:0;">
        <code style="color:{_ACCENT};font-size:13px;word-break:break-all;">{mcp_url}</code>
      </p>
    </div>

    <div style="{card}">
      <p style="color:{_TEXT};font-size:16px;font-weight:500;margin:0 0 10px;">{s["start_title"]}</p>
      <p style="{muted}margin-bottom:12px;">{s["start_lead"]}</p>
      <p style="margin:0 0 12px;">
        <span style="display:inline-block;background:{_ACCENT};color:{_BG};font-size:14px;line-height:1.4;
                     padding:10px 16px;border-radius:14px 14px 4px 14px;">{s["prompt"]}</span>
      </p>
      <p style="{muted}margin-bottom:10px;">{s["start_note"]}</p>
      <p style="color:{_MUTED};font-size:12px;line-height:1.5;margin:0;">{s["start_more"]}</p>
    </div>

    <p style="color:{_MUTED};font-size:12px;line-height:1.5;margin:0 0 24px;">&#128737;&#65039; {s["warning"]}</p>

    <p style="color:#6B7280;font-size:11px;margin:0;border-top:1px solid {_BORDER};padding-top:16px;">{s["footer"]}</p>
  </div>
</div>"""


async def send_magic_link(to: str, token: str, lang: str = DEFAULT_LANG) -> bool:
    """Email the user their UI + MCP URLs. Returns True if Resend accepted the message."""
    api_key = os.environ.get("RESEND_API_KEY")
    base = _base_url()
    ui_url = f"{base}/{token}"
    mcp_url = f"{base}/{token}/mcp"
    if lang not in STRINGS:
        lang = DEFAULT_LANG

    if not api_key:
        # Never log the link itself — it contains the user's live credential.
        log.warning(
            "RESEND_API_KEY unset, skipping magic-link email",
            extra={"event": "email_skipped", "to": to, "token": mask_token(token)},
        )
        await telegram_alert.notify("magic-link email", "RESEND_API_KEY unset")
        return False

    payload = {
        "from": os.environ.get("EMAIL_FROM", _DEFAULT_FROM),
        "to": [to],
        "subject": STRINGS[lang]["subject"],
        "html": _magic_link_html(ui_url, mcp_url, lang),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            resp.raise_for_status()
        log.info("magic-link email sent", extra={"event": "email_sent", "to": to, "lang": lang})
        return True
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
        return False
