// robots.txt: rules in src/lib/robots.ts (open to search engines and every AI crawler on the live
// site only; closed everywhere else).
import type { MetadataRoute } from "next";
import { robotsRules } from "@/lib/robots";

// Read at request time: SITE_INDEXABLE is a runtime setting of each service.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
