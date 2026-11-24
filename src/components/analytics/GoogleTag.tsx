// The Google tag (GA4) in the page's own HTML <head>, so it starts as early as possible and Google's
// tag checks can see it. Consent Mode first: nothing is stored until the visitor accepts
// (src/lib/consent.ts). Nothing at all without NEXT_PUBLIC_GA_ID.
import { CONSENT_KEY, GA_ID } from "@/lib/analytics";

export function GoogleTag() {
  if (!GA_ID) return null;
  const init = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{var c=localStorage.getItem(${JSON.stringify(CONSENT_KEY)});if(c==='granted'||c==='denied')gtag('consent','update',{analytics_storage:c});}catch(e){}
gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)});`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: init }} />
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} />
    </>
  );
}
