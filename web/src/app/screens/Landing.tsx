import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart2,
  Check,
  ChevronDown,
  Download,
  MessageSquare,
  Shield,
  Zap,
} from "lucide-react";
import Body from "react-muscle-highlighter";
import { SUPPORTED_LANGUAGES, landingPath } from "../i18n";
import {
  LOAD_GRADIENT_DARK,
  LOAD_GRADIENT_LIGHT,
  loadColor,
  useLoadTheme,
} from "../components/MuscleMap2D";
import { StreakFlame, WindowRing } from "../components/StreakWidget";
import { track } from "../lib/analytics";
import { signup } from "../lib/publicApi";
import { reportError } from "../lib/telemetry";

const CONTACT_EMAIL = "contact@aim-journal.com";

// ── Email capture form ──────────────────────────────────────────────────────
type FormState = "idle" | "loading" | "success" | "error";

function EmailCapture({ id }: { id: string }) {
  const { t } = useTranslation("landing");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    if (!email.includes("@")) {
      setError(t("form.invalid"));
      setState("error");
      return;
    }
    setState("loading");
    setError("");
    try {
      await signup(email.trim());
      setState("success");
      track("signup_submitted", { outcome: "success" });
    } catch (err) {
      reportError(err, { source: "signup" });
      track("signup_submitted", { outcome: "error" });
      setError(err instanceof Error ? err.message : t("form.errorGeneric"));
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-accent/10 border border-accent/30 px-5 py-4">
        <Check size={20} className="text-accent shrink-0" aria-hidden />
        <span className="text-foreground text-sm">{t("form.success")}</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:gap-2" noValidate>
      <label htmlFor={id} className="sr-only">
        Email
      </label>
      <input
        id={id}
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === "error") setState("idle");
        }}
        placeholder={t("form.placeholder")}
        className="flex-1 rounded-xl bg-foreground/5 border border-accent/40 px-4 py-3.5 text-foreground placeholder-muted-foreground text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-all min-w-0"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="shrink-0 rounded-xl bg-accent text-accent-foreground font-medium text-sm px-6 py-3.5 hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-60"
      >
        {state === "loading" ? t("form.submitting") : t("form.submit")}
      </button>
      {state === "error" && (
        <p className="text-destructive text-xs sm:w-full" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

// ── Language switcher ───────────────────────────────────────────────────────
// Real links, not buttons: each language is a distinct prerendered URL ("/" for English, "/<lng>/"
// otherwise) with its own canonical and localized head. Anchors let crawlers walk between the
// hreflang alternates, keep the address bar matching the canonical, and make a shared link carry
// the right Open Graph preview. Costs a page load per switch, which is the point.
function LangSwitch({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  return (
    <span className={`flex items-center gap-3 text-xs text-muted-foreground ${className}`}>
      {SUPPORTED_LANGUAGES.map((l) => (
        <a
          key={l.code}
          href={landingPath(l.code)}
          hrefLang={l.code}
          aria-label={l.label}
          aria-current={i18n.resolvedLanguage === l.code ? "true" : undefined}
          className={`hover:text-foreground transition-colors ${
            i18n.resolvedLanguage === l.code ? "text-accent" : ""
          }`}
        >
          {l.code.toUpperCase()}
        </a>
      ))}
    </span>
  );
}

// ── Accordion ───────────────────────────────────────────────────────────────
function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left text-foreground text-sm font-medium hover:text-accent transition-colors"
      >
        <span>{q}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* Always in the DOM (hidden, not unmounted) so search engines and LLM crawlers see the answers */}
      <p hidden={!open} className="pb-5 text-muted-foreground text-sm leading-relaxed max-w-prose">
        {a}
      </p>
    </div>
  );
}

// ── Chat demo (hero): the actual product moment, framed as a conversation ───
function ChatDemo() {
  const { t } = useTranslation("landing");
  return (
    <div className="relative mt-14 lg:mt-0" aria-hidden>
      <div className="absolute -inset-10 bg-accent/8 blur-3xl rounded-full pointer-events-none" />
      <div className="relative flex flex-col gap-2.5 max-w-sm mx-auto">
        {/* Header chip: user talks to Claude, Zhurnal is the connector */}
        <div className="flex items-center gap-2 self-center rounded-full bg-card border border-border pl-2 pr-3 py-1.5 mb-2">
          <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-foreground text-[11px] font-medium">
            C
          </span>
          <span className="text-foreground text-xs font-medium">{t("chat.assistantName")}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/25 px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-accent text-[10px]">{t("chat.chip")}</span>
          </span>
        </div>

        <div className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5">
          <p className="text-accent-foreground text-sm leading-snug">{t("chat.user1")}</p>
        </div>
        <div className="self-start max-w-[85%] rounded-2xl rounded-bl-md bg-card border border-border px-4 py-2.5">
          <p className="text-foreground text-sm leading-snug">{t("chat.assistant1")}</p>
        </div>

        {/* Record card — the stored result, styled like an in-app stat tile */}
        <div className="self-start w-[240px] rounded-xl bg-card border border-border p-4 my-1">
          <p className="text-muted-foreground text-xs mb-1">{t("chat.cardName")}</p>
          <p className="text-accent text-3xl font-medium tabular-nums tracking-tight leading-none">
            {t("chat.cardValue")}
          </p>
          <p className="text-muted-foreground text-xs mt-1.5">{t("chat.cardSub")}</p>
        </div>

        {/* No second user bubble: like in the real transcript, the coach follows up on its own */}
        <div className="self-start max-w-[85%] rounded-2xl rounded-bl-md bg-card border border-border px-4 py-2.5">
          <p className="text-foreground text-sm leading-snug">{t("chat.assistant2")}</p>
        </div>
      </div>
    </div>
  );
}

// ── Showcase mockups ────────────────────────────────────────────────────────
// Static weekly-load sample rendered with the SAME silhouette (react-muscle-highlighter) and heat
// ramp as the in-app map, so the "real screens" promise in the showcase copy holds.
const MUSCLE_MOCK_FRONT: [string, number][] = [
  ["chest", 0.9],
  ["deltoids", 0.6],
  ["biceps", 0.5],
  ["abs", 0.35],
  ["quadriceps", 0.15],
];
const MUSCLE_MOCK_BACK: [string, number][] = [
  ["upper-back", 0.7],
  ["trapezius", 0.35],
  ["triceps", 0.55],
  ["gluteal", 0.45],
  ["hamstring", 0.2],
];

function MuscleMockup() {
  const { t } = useTranslation("landing");
  const { t: tm } = useTranslation("muscles");
  const theme = useLoadTheme();
  const ramp = theme === "light" ? LOAD_GRADIENT_LIGHT : LOAD_GRADIENT_DARK;
  const mock = (rows: [string, number][]) =>
    rows.map(([slug, heat]) => ({ slug, color: loadColor(heat, theme) }));
  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <p className="text-muted-foreground text-xs mb-4 uppercase tracking-widest text-center">
        {t("showcase.muscle.caption")}
      </p>
      <div className="flex justify-center gap-8 pointer-events-none" aria-hidden>
        <div className="w-[120px] [&_svg]:w-full [&_svg]:h-auto">
          <Body data={mock(MUSCLE_MOCK_FRONT) as never} side="front" gender="male" />
          <p className="text-muted-foreground text-[10px] text-center mt-2">{tm("view.front")}</p>
        </div>
        <div className="w-[120px] [&_svg]:w-full [&_svg]:h-auto">
          <Body data={mock(MUSCLE_MOCK_BACK) as never} side="back" gender="male" />
          <p className="text-muted-foreground text-[10px] text-center mt-2">{tm("view.back")}</p>
        </div>
      </div>
      <div className="max-w-[240px] mx-auto mt-5">
        <div
          className="h-1.5 rounded-full"
          style={{ background: `linear-gradient(90deg, ${ramp.join(", ")})` }}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
          <span>{tm("legend.low")}</span>
          <span>{tm("legend.mid")}</span>
          <span>{tm("legend.high")}</span>
        </div>
      </div>
    </div>
  );
}

function ProgressMockup() {
  const { t } = useTranslation("landing");
  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-foreground text-sm font-medium">{t("showcase.progress.exercise")}</p>
          <p className="text-muted-foreground text-xs mt-0.5">{t("showcase.progress.caption")}</p>
        </div>
        <div className="text-right">
          <p className="text-accent text-2xl font-medium tabular-nums tracking-tight leading-none">
            {t("showcase.progress.value")}
          </p>
          <p className="text-muted-foreground text-xs mt-1">{t("showcase.progress.valueSub")}</p>
        </div>
      </div>
      <svg
        width="100%"
        height="80"
        viewBox="0 0 200 60"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="landing-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,45 C20,42 40,38 60,35 C80,32 90,28 110,24 C130,20 150,18 170,12 C185,8 195,5 200,3"
          stroke="var(--accent)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M0,45 C20,42 40,38 60,35 C80,32 90,28 110,24 C130,20 150,18 170,12 C185,8 195,5 200,3 L200,60 L0,60 Z"
          fill="url(#landing-line-grad)"
        />
        <path
          d="M0,38 C20,35 40,31 60,27 C80,23 90,20 110,16 C130,12 150,10 170,6 C185,3 195,1 200,0"
          stroke="var(--muted-foreground)"
          strokeWidth="1"
          strokeDasharray="4,3"
          fill="none"
          opacity="0.5"
        />
        <circle cx="200" cy="3" r="3" fill="var(--accent)" />
      </svg>
      <div className="flex justify-between mt-2">
        <span className="text-muted-foreground text-[10px]">{t("showcase.progress.m1")}</span>
        <span className="text-muted-foreground text-[10px]">{t("showcase.progress.m2")}</span>
        <span className="text-muted-foreground text-[10px]">{t("showcase.progress.m3")}</span>
      </div>
      <div className="flex gap-4 mt-3">
        <span className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
          <span className="inline-block w-5 border-t-2 border-accent" />{" "}
          {t("showcase.progress.legendTop")}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
          <span className="inline-block w-5 border-t border-dashed border-muted-foreground" />{" "}
          {t("showcase.progress.legend1rm")}
        </span>
      </div>
      {/* Goal progress, mirroring the Home screen's featured goal card */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-muted-foreground text-[10px]">
            {t("showcase.progress.goalLabel")}
          </span>
          <span className="text-foreground text-xs font-medium tabular-nums">
            {t("showcase.progress.goalValue")}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/10">
          <div className="h-full w-[86%] rounded-full bg-accent" />
        </div>
      </div>
      {/* The Home screen's consistency widget: the real WindowRing + StreakFlame components with
          static data, so the mockup stays an honest copy of the app (LANDING_COPY.md §4 — a
          mockup that is not a real screen has to go). The three numbers agree with each other and
          with services._streak, re-verified 2026-08-29 against the fuel gauge: 8 lit ticks, the
          count "8", and 8 training days at roughly a 2x/week spacing with the last one today
          score exactly level 5, heat 0.836 — a good stretch, deliberately not a maxed-out trophy
          case. The previous 10-tick pattern was honest under the old ratio model (0.83 → level 5,
          heat 0.975) and this change made it dishonest: it now scores 6 / 0.963. */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
        <div className="relative shrink-0 flex items-center justify-center w-[88px] h-[88px]">
          <WindowRing
            days={Array.from({ length: 28 }, (_, i) => [2, 6, 9, 13, 16, 20, 24, 27].includes(i))}
          />
          <StreakFlame level={5} heat={0.836} scale={1.12} />
        </div>
        <div className="min-w-0">
          <div className="text-foreground text-2xl font-medium tabular-nums leading-tight">8</div>
          <div className="text-muted-foreground text-sm">{t("showcase.progress.streakWindow")}</div>
        </div>
      </div>
    </div>
  );
}

function CoachMockup() {
  const { t } = useTranslation("landing");
  const coachAvatar = (
    <div className="w-6 h-6 rounded-full bg-accent shrink-0 flex items-center justify-center text-accent-foreground text-[10px] font-medium">
      {t("brand").charAt(0)}
    </div>
  );
  return (
    <div className="rounded-xl bg-card border border-border p-6 space-y-3">
      <div className="flex gap-2.5">
        {coachAvatar}
        <div className="rounded-xl rounded-tl-md bg-foreground/6 border border-border px-3.5 py-2.5 flex-1">
          <p className="text-foreground text-xs leading-relaxed">{t("showcase.coach.q1")}</p>
        </div>
      </div>
      <div className="flex gap-2.5 justify-end">
        <div className="rounded-xl rounded-tr-md bg-accent px-3.5 py-2.5 max-w-[80%]">
          <p className="text-accent-foreground text-xs leading-relaxed">{t("showcase.coach.a1")}</p>
        </div>
      </div>
      <div className="flex gap-2.5">
        {coachAvatar}
        <div className="rounded-xl rounded-tl-md bg-foreground/6 border border-border px-3.5 py-2.5 flex-1">
          <p className="text-foreground text-xs leading-relaxed">{t("showcase.coach.q2")}</p>
        </div>
      </div>
    </div>
  );
}

function ProgramMockup() {
  const { t } = useTranslation("landing");
  const rows = ["r1", "r2", "r3", "r4"] as const;
  return (
    <div className="rounded-xl bg-card border border-border p-6">
      <p className="text-muted-foreground text-xs uppercase tracking-widest mb-3">
        {t("showcase.program.caption")}
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div
            key={r}
            className="flex items-center justify-between gap-3 rounded-lg bg-foreground/3 border border-border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
                {t(`showcase.program.${r}Tag`)}
              </p>
              <p className="text-foreground text-xs mt-0.5 truncate">
                {t(`showcase.program.${r}Name`)}
              </p>
            </div>
            <span className="text-accent text-xs tabular-nums shrink-0">
              {t(`showcase.program.${r}Target`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Steps visuals ───────────────────────────────────────────────────────────
function EmailVisual() {
  const { t } = useTranslation("landing");
  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-xs">
          ✉️
        </div>
        <div>
          <p className="text-foreground text-xs font-medium">{t("steps.s1.emailFrom")}</p>
          <p className="text-muted-foreground text-[10px]">{t("steps.s1.emailSubject")}</p>
        </div>
      </div>
      <div className="rounded-lg bg-accent/8 border border-accent/20 px-3 py-2.5 text-center">
        <p className="text-accent text-xs">{t("steps.s1.emailButton")}</p>
        <p className="text-muted-foreground text-[10px] font-mono mt-0.5">
          {t("steps.s1.emailLink")}
        </p>
      </div>
    </div>
  );
}

function ConnectorVisual() {
  const { t } = useTranslation("landing");
  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <p className="text-muted-foreground text-[10px] mb-2">{t("steps.s2.path")}</p>
      <div className="rounded-lg bg-secondary border border-border px-3 py-2.5 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <p className="text-accent text-[11px] font-mono truncate">{t("steps.s2.url")}</p>
      </div>
      <p className="text-muted-foreground text-[10px] mt-2">{t("steps.s2.hint")}</p>
    </div>
  );
}

function TilesVisual() {
  const { t } = useTranslation("landing");
  return (
    <div className="rounded-xl bg-card border border-border p-4">
      {/* The concrete first phrase: triggers new_program, which runs the coach intake first */}
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-2">
        {t("steps.s3.promptLead")}
      </p>
      <div className="inline-block rounded-xl rounded-br-md bg-accent px-3.5 py-2.5 mb-3">
        <p className="text-accent-foreground text-xs">{t("steps.s3.prompt")}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["tile1", "tile2"] as const).map((k) => (
          <div key={k} className="rounded-lg bg-secondary p-3 text-center">
            <p className="text-accent text-lg font-medium tabular-nums">
              {t(`steps.s3.${k}Value`)}
            </p>
            <p className="text-muted-foreground text-[10px] mt-0.5">{t(`steps.s3.${k}Label`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main landing ─────────────────────────────────────────────────────────────
export function Landing() {
  const { t, i18n } = useTranslation("landing");
  const [stickyVisible, setStickyVisible] = useState(false);
  const heroFormRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const canonicalUrl = `${window.location.origin}${landingPath(i18n.resolvedLanguage ?? "en")}`;

  // Belt and braces, not the fix. Each language is served as its own prerendered document with a
  // fully localized head (guides/landing.mjs), which is what crawlers and social unfurlers read —
  // none of them run this. This only keeps the DOM self-consistent when the language is overridden
  // in-session (a legacy ?lng= link). Token app screens keep the static PWA title.
  useEffect(() => {
    document.title = t("meta.title");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("meta.description"));
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", t("meta.title"));
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", t("meta.description"));
  }, [t, i18n.resolvedLanguage, canonicalUrl]);

  useEffect(() => {
    const el = heroFormRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      {
        threshold: 0,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToCTA = () => ctaRef.current?.scrollIntoView({ behavior: "smooth" });

  const benefits = [
    { icon: MessageSquare, text: t("benefits.b1") },
    { icon: BarChart2, text: t("benefits.b2") },
    { icon: Shield, text: t("benefits.b3") },
  ];

  // The coach (pre-built coaching prompts) leads: it's the differentiator, the rest is table stakes.
  const showcase = [
    { key: "coach", mockup: <CoachMockup /> },
    { key: "muscle", mockup: <MuscleMockup /> },
    { key: "progress", mockup: <ProgressMockup /> },
    { key: "program", mockup: <ProgramMockup /> },
  ] as const;

  const steps = [
    { key: "s1", visual: <EmailVisual /> },
    { key: "s2", visual: <ConnectorVisual /> },
    { key: "s3", visual: <TilesVisual /> },
  ] as const;

  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-5 h-14 max-w-[1120px] mx-auto">
          {/* Brand is "AIm" in every locale; the AI half carries the accent */}
          <span className="font-medium tracking-tight text-xl">
            <span className="text-accent">AI</span>m
          </span>
          <div className="flex items-center gap-5">
            <LangSwitch className="hidden sm:flex" />
            <button
              onClick={scrollToCTA}
              className="rounded-xl bg-accent text-accent-foreground font-medium text-xs px-4 py-2 hover:bg-accent/90 active:scale-95 transition-all"
            >
              {t("nav.cta")}
            </button>
          </div>
        </div>
      </nav>

      {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
      <header className="pt-28 lg:pt-36 pb-16 lg:pb-24 px-5 max-w-[1120px] mx-auto">
        <div className="lg:grid lg:grid-cols-[7fr_5fr] lg:gap-16 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-foreground/6 border border-border px-4 py-1.5 mb-8">
              <Zap size={12} className="text-accent" aria-hidden />
              <span className="text-muted-foreground text-xs">{t("hero.badge")}</span>
            </div>

            <h1 className="text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.25rem] font-medium tracking-tight mb-7">
              {t("hero.title")}
              <br />
              <span className="text-accent">{t("hero.titleAccent")}</span>
            </h1>

            <p className="text-muted-foreground text-base lg:text-lg leading-relaxed mb-9 max-w-lg">
              {t("hero.subtitle")}
            </p>

            <div ref={heroFormRef} className="max-w-lg">
              <EmailCapture id="hero-email" />
            </div>
          </div>

          <ChatDemo />
        </div>
      </header>

      {/* ── 2. Benefits strip ───────────────────────────────────────────── */}
      <section className="border-y border-border">
        <div className="max-w-[1120px] mx-auto px-5 py-8 grid gap-6 md:grid-cols-3 md:gap-10">
          {benefits.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={15} className="text-accent" aria-hidden />
                </div>
                <span className="text-sm leading-relaxed">{item.text}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 3. Showcase: numbered feature rows ──────────────────────────── */}
      <section className="px-5 max-w-[1120px] mx-auto pt-20 lg:pt-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl lg:text-4xl font-medium tracking-tight">{t("showcase.title")}</h2>
          <p className="text-muted-foreground text-sm mt-3">{t("showcase.subtitle")}</p>
        </div>

        <div className="mt-6 lg:mt-10">
          {showcase.map((card, i) => (
            <div
              key={card.key}
              className={`py-12 lg:py-16 border-t border-border first:border-0 flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-20 ${
                i % 2 ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className="flex-1">
                <span className="block text-accent text-5xl lg:text-6xl font-medium tabular-nums tracking-tight leading-none">
                  0{i + 1}
                </span>
                <h3 className="text-2xl lg:text-3xl font-medium tracking-tight mt-4">
                  {t(`showcase.${card.key}.title`)}
                </h3>
                <p className="text-muted-foreground text-sm lg:text-base leading-relaxed mt-4 max-w-md">
                  {t(`showcase.${card.key}.text`)}
                </p>
              </div>
              <div className="flex-1 w-full max-w-md mx-auto lg:mx-0">{card.mockup}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. Three steps + connect instructions (one story: signup → connect → train) ── */}
      <section className="px-5 max-w-[1120px] mx-auto pt-8 lg:pt-16 pb-20 lg:pb-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl lg:text-4xl font-medium tracking-tight">{t("steps.title")}</h2>
          <p className="text-muted-foreground text-sm mt-3">{t("steps.subtitle")}</p>
        </div>

        <div className="mt-10 lg:mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {steps.map((step, i) => (
            <div key={step.key} className="relative">
              <div className="flex items-center gap-4 mb-4">
                <span className="w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-medium tabular-nums shrink-0">
                  {i + 1}
                </span>
                <h3 className="text-lg font-medium">{t(`steps.${step.key}.title`)}</h3>
                {/* connector line to the next step (desktop) */}
                {i < steps.length - 1 && (
                  <span className="hidden lg:block flex-1 border-t border-border" aria-hidden />
                )}
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5 lg:pr-8">
                {t(`steps.${step.key}.text`)}
              </p>
              <div className="lg:pr-8">{step.visual}</div>
            </div>
          ))}
        </div>

        {/* Detailed connect instructions for step 2; #connect anchor target for the footer link */}
        <div id="connect" className="mt-14 lg:mt-20">
          <h3 className="text-2xl lg:text-3xl font-medium tracking-tight mb-8">
            {t("connect.title")}
          </h3>

          <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-card border border-border px-5">
              {(["claude", "chatgpt"] as const).map((k) => (
                <AccordionItem key={k} q={t(`connect.${k}Q`)} a={t(`connect.${k}A`)} />
              ))}
            </div>

            <div className="rounded-xl bg-accent/6 border border-accent/20 px-5 py-4 flex items-start gap-3">
              <Download size={16} className="text-accent shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-sm font-medium mb-1">{t("connect.pwaTitle")}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t("connect.pwaText")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. FAQ ──────────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="px-5 max-w-[1120px] mx-auto py-20 lg:py-28">
          <h2 className="text-3xl lg:text-4xl font-medium tracking-tight mb-8">{t("faq.title")}</h2>
          <div>
            {(
              [
                "f1",
                "f2",
                "f10",
                "f3",
                "f11",
                "f4",
                "f5",
                "f12",
                "f13",
                "f6",
                "f7",
                "f8",
                "f9",
              ] as const
            ).map((k) => (
              <AccordionItem key={k} q={t(`faq.${k}.q`)} a={t(`faq.${k}.a`)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. Final CTA + footer ───────────────────────────────────────── */}
      <section className="border-t border-border relative overflow-hidden" ref={ctaRef}>
        <div
          className="absolute inset-x-0 bottom-0 h-56 bg-accent/6 blur-3xl pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"
          aria-hidden
        />

        <div className="relative px-5 max-w-[1120px] mx-auto py-24 lg:py-32 text-center">
          <p className="text-accent text-xs uppercase tracking-[0.25em] mb-6">{t("slogan")}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight mb-4 max-w-3xl mx-auto">
            {t("cta.title")}
          </h2>
          <p className="text-muted-foreground text-sm lg:text-base mb-10">{t("cta.subtitle")}</p>

          <div className="max-w-md mx-auto text-left">
            <EmailCapture id="footer-email" />
            <p className="text-muted-foreground text-xs mt-3 text-center">{t("form.micro")}</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="px-5 max-w-[1120px] mx-auto py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-medium">
            {t("footer.copyright")}{" "}
            <span className="text-muted-foreground font-normal">· {t("slogan")}</span>
          </span>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <a href="#connect" className="hover:text-foreground transition-colors">
              {t("footer.how")}
            </a>
            <a
              href={`/guides/${i18n.resolvedLanguage ?? "en"}/`}
              className="hover:text-foreground transition-colors"
            >
              {t("footer.guides")}
            </a>
            <a
              href={`/guides/${i18n.resolvedLanguage ?? "en"}/one-rep-max-calculator/`}
              className="hover:text-foreground transition-colors"
            >
              {t("footer.calc")}
            </a>
            <a
              href={
                i18n.resolvedLanguage === "en" || !i18n.resolvedLanguage
                  ? "/privacy/"
                  : `/privacy/${i18n.resolvedLanguage}/`
              }
              className="hover:text-foreground transition-colors"
            >
              {t("footer.privacy")}
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground transition-colors">
              {t("footer.contact")}
            </a>
          </div>
          <LangSwitch />
        </div>
      </footer>

      {/* ── Sticky mobile CTA ───────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 inset-x-0 z-50 sm:hidden transition-transform duration-300 ${
          stickyVisible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="bg-background/95 backdrop-blur-md border-t border-border px-5 py-3">
          <button
            onClick={scrollToCTA}
            className="w-full rounded-xl bg-accent text-accent-foreground font-medium py-3.5 text-sm hover:bg-accent/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {t("form.submit")} <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </div>
      <div className="h-20 sm:hidden" aria-hidden />
    </div>
  );
}
