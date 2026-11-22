// The photocopied band photo (PNG). Licensed photos only (src/lib/photos); YouTube images never come here.
import { getDb } from "@/lib/db";

// Built on its first request, then served ready-made and rebuilt in the background at most every 6 hours
// (22 Nov 2026: read from the database on every request, the /artists page alone sent about 1.4 MB of
// photos from the database per new visitor). Photos change at most once a month (band-photos job); a new
// photo also gets a new ?v= address (bandPhotoFor), and browsers keep the old one a day at most.
export const revalidate = 21600;
/** No photo is built ahead: each one is built on its first request, then kept. */
export function generateStaticParams() {
  return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const photo = await getDb().bandPhoto.findFirst({ where: { artist: { slug } }, select: { image: true, updatedAt: true } });
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.image), {
    headers: {
      "Content-Type": "image/png",
      // A new photo gets a new URL through ?v= (see bandPhotoFor), so browsers may keep this a long time.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Last-Modified": photo.updatedAt.toUTCString(),
    },
  });
}
