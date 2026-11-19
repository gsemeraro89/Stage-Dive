// The IndexNow key file: proves to search engines that pings come from this site (src/lib/indexnow.ts).
import { INDEXNOW_KEY } from "@/lib/indexnow";

// Served as a file: the key never changes between requests.
export const dynamic = "force-static";

export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
