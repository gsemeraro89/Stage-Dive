import Link from "next/link";

export default function NotFound() {
  return (
    <main data-od="not-found" className="od-notfound">
      <p className="od-rail meta">
        <span>Error 404</span>
        <span>Nothing on this deck</span>
      </p>
      <p className="od-notfound-code display" aria-hidden="true">
        404
      </p>
      <h1 className="display size-section">Page not found</h1>
      <p className="od-notfound-text">That concert, artist or page is not here.</p>
      <p className="od-notfound-links">
        <Link href="/" className="od-play">
          Back to all concerts
        </Link>
        <Link href="/artists" className="od-link">
          Artists
        </Link>
        <Link href="/genres" className="od-link">
          Genres
        </Link>
      </p>
    </main>
  );
}
