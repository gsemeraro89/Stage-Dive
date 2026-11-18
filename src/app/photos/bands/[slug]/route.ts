// The photocopied band photo (PNG). Licensed photos only (src/lib/photos); YouTube images never come here.
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

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
