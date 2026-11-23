// The photocopied festival photo (PNG) for news pictures (src/lib/news/festival-photos.ts). Licensed
// Wikimedia Commons photos only; never a press photo, never a YouTube image.
import { getDb } from "@/lib/db";

// Built on its first request, then served ready-made and rebuilt in the background at most every 6 hours
// (as the band photos: the database is not read on every request). Photos change at most once a month; a
// new photo also gets a new ?v= address (toFestivalPhotoView).
export const revalidate = 21600;
/** No photo is built ahead: each one is built on its first request, then kept. */
export function generateStaticParams() {
  return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const photo = await getDb().festivalPhoto.findFirst({ where: { venue: { slug }, width: { not: null } }, select: { image: true, updatedAt: true } });
  if (!photo?.image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.image), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Last-Modified": photo.updatedAt.toUTCString(),
    },
  });
}
