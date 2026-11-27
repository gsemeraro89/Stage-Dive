// The Google tag (GA4) in the page's own HTML <head>, so Google's tag checks can see it. Consent Mode
// first: nothing is stored until the visitor accepts (src/lib/consent.ts). Nothing at all without
// NEXT_PUBLIC_GA_ID.
// Speed (27 Nov 2026): the tag itself (gtag.js, the big file) is fetched once the page has loaded, when
// the browser is idle, so it never competes with the page on a phone. Until then gtag() only queues
// (dataLayer), so the page view and the consent choice are sent as soon as it arrives.
import { CONSENT_KEY, GA_ID } from "@/lib/analytics";

/** The address of Google's tag for a GA4 ID. */
export function gtagUrl(id: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
}

export function GoogleTag() {
  if (!GA_ID) return null;
  const init = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{var c=localStorage.getItem(${JSON.stringify(CONSENT_KEY)});if(c==='granted'||c==='denied')gtag('consent','update',{analytics_storage:c});}catch(e){}
gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)});
(function(){function l(){var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(gtagUrl(GA_ID))};document.head.appendChild(s);}
function idle(){if(window.requestIdleCallback)requestIdleCallback(l,{timeout:3000});else setTimeout(l,1);}
if(document.readyState==='complete')idle();else window.addEventListener('load',idle,{once:true});})();`;
  return <script dangerouslySetInnerHTML={{ __html: init }} />;
}
