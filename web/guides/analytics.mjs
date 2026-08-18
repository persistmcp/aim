// PostHog for the static guide pages.
//
// These pages are plain HTML rendered at build time (template.mjs) and served straight off the
// CDN to crawlers and humans alike — they never load the SPA bundle, so until this file existed
// they reported nothing at all: 40 days, 181 Search Console impressions on /guides/*, exactly
// zero $pageview in PostHog. Every visitor arriving from organic search was invisible.
//
// Why a hand-written snippet instead of posthog-js:
//   - these pages exist for SEO; array.full.js is ~200 KB over a third-party connection, against
//     ~1.5 KB inline (well under a gzip block) for what we actually need;
//   - what we need is exactly two events, and the page has no app state to autocapture;
//   - inline at the end of <body> means no extra request, no render-blocking, no CLS, and with
//     JavaScript off the page is unchanged — it just reports nothing, as before.
//
// It deliberately reuses the SPA's person id (shared/analytics.mjs → personStorageKey) so the
// guide → landing → signup journey is one person rather than two anonymous ones. It does NOT
// manage sessions: session stitching is posthog-js's job and faking $session_id here would fight
// with it, so guide events land on the person and on the pathname, without a session replay.
//
// Not tracked here: the bare /guides/ root, which redirects to a language hub the moment JS runs
// (a beacon racing location.replace is not worth the ambiguity in the data).

import {
  POSTHOG_HOST,
  POSTHOG_KEY,
  TOKEN_PATH_SOURCE,
  personStorageKey,
} from "../shared/analytics.mjs";

// Links that leave a guide for the landing carry this attribute; its value says which one was
// clicked. The click handler below is delegated, so adding another exit link anywhere in the
// template is enough to have it measured.
export const CTA_ATTR = "data-cta";

// One statement, wrapped in try/catch end to end: a broken browser API must never leave a
// visible error on a page whose only job is to be read.
//
// Bot and DNT handling: the SPA does neither (posthog-js is initialized with defaults), but these
// pages are the ones crawlers actually hit — an unfiltered $pageview per crawl would drown the
// handful of real readers we are trying to see. DNT/GPC is honoured here for the same reason it
// costs nothing: these visitors are anonymous readers who never asked us for anything.
const SNIPPET = `(function(){try{
var C=__CFG__,n=navigator,u=n.userAgent||"";
if(n.webdriver||/bot|crawler|crawling|spider|slurp|headless|lighthouse|preview|facebookexternalhit|python-requests|curl|wget/i.test(u))return;
if(n.doNotTrack=="1"||window.doNotTrack=="1"||n.msDoNotTrack=="1"||n.globalPrivacyControl)return;
var T=new RegExp(C.token,"g");
var clean=function(v){return typeof v=="string"?v.replace(T,"$1/:token"):v};
var id=null;
try{var raw=localStorage.getItem(C.store);if(raw)id=JSON.parse(raw).distinct_id}catch(e){}
if(!id){
id=window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
try{var st=JSON.stringify({distinct_id:id,$device_id:id});
localStorage.setItem(C.store,st);
document.cookie=C.store+"="+encodeURIComponent(st)+";path=/;max-age=31536000;SameSite=Lax"+(location.protocol=="https:"?";Secure":"")}catch(e){}}
var send=function(ev,extra){try{
var p={};for(var k in C.props)p[k]=C.props[k];
p.$current_url=clean(location.href);p.$pathname=location.pathname;p.$host=location.host;
p.$raw_user_agent=u;p.$lib="aim-guides";p.$lib_version="1";p.title=document.title;
var ref=document.referrer||"";
p.$referrer=ref?clean(ref):"$direct";
p.$referring_domain="$direct";
if(ref){try{p.$referring_domain=new URL(ref).hostname}catch(e){}}
if(extra)for(var x in extra)p[x]=extra[x];
var body=JSON.stringify({api_key:C.key,event:ev,distinct_id:id,timestamp:new Date().toISOString(),properties:p});
var url=C.host+"/i/v0/e/";
try{if(n.sendBeacon&&n.sendBeacon(url,new Blob([body],{type:"text/plain"})))return}catch(e){}
fetch(url,{method:"POST",body:body,keepalive:true,mode:"no-cors",headers:{"Content-Type":"text/plain"}})
}catch(e){}};
send("$pageview");
document.addEventListener("click",function(e){
var t=e.target,a=t&&t.closest?t.closest("a[${CTA_ATTR}]"):null;
if(a)send("guide_cta_clicked",{cta:a.getAttribute("${CTA_ATTR}"),cta_href:a.getAttribute("href")})
},true);
}catch(e){}})();`;

/**
 * The inline <script> for one rendered page.
 *
 * @param {{lang: string, pageType: "guide"|"guide_hub"|"privacy", slug?: string|null}} page
 * @returns {string} a single <script> element, safe to place last inside <body>.
 */
export function analyticsScript({ lang, pageType, slug = null }) {
  const props = { page_type: pageType, locale: lang };
  if (slug) props.guide_slug = slug;
  const config = JSON.stringify({
    key: POSTHOG_KEY,
    host: POSTHOG_HOST,
    store: personStorageKey(),
    token: TOKEN_PATH_SOURCE,
    props,
  });
  // Function replacement: a literal one would interpret $-sequences inside the pattern.
  return `<script>${SNIPPET.replace("__CFG__", () => config)}</script>`;
}
