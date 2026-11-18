import type { Metadata } from "next";
import { ArtistSquares } from "@/components/ui/ArtistSquares";
import { count2, SectionHead } from "@/components/ui/SectionHead";
import { listArtists } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Artists — every DJ and live act",
  description: "Every artist on FullDJSet with full-length DJ concerts and live acts you can watch free.",
  alternates: { canonical: "/artists" },
};

export default async function ArtistsPage() {
  const artists = await listArtists();
  return (
    <main data-od="artists-index">
      <section className="od-section od-section--bleed od-section--first">
        <SectionHead as="h1" title="Artists" note={`${count2(artists.length)} · A–Z`} />
        {artists.length === 0 ? (
          <div className="od-empty" data-od="empty" style={{ paddingInline: "var(--pad-x)" }}>
            <p className="display">No artists yet</p>
          </div>
        ) : (
          <ArtistSquares artists={artists} columns={4} label="Artists, A to Z" />
        )}
      </section>
    </main>
  );
}
