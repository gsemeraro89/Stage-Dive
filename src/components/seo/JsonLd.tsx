// Structured data for search engines and AI assistants (schema.org JSON-LD, src/lib/structured-data.ts).
// Not visible on the page. Null entries (e.g. a concert without a known date has no MusicEvent) are skipped.
import { jsonLd } from "@/lib/structured-data";

type Json = Record<string, unknown>;

export function JsonLd({ data }: { data: Json | (Json | null)[] }) {
  const list = Array.isArray(data) ? data.filter((d): d is Json => d !== null) : data;
  if (Array.isArray(list) && !list.length) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(list) }} />;
}
