import Link from "next/link";

/** Large display words flowing in lines, alternating solid and outlined, each with its set count. */
export function GenreWords({
  genres,
  size,
}: {
  genres: { slug: string; name: string; count: number }[];
  size?: "xl";
}) {
  return (
    <ul className={`od-words display${size === "xl" ? " od-words--xl" : ""}`} data-od="genre-words">
      {genres.map((g) => (
        <li key={g.slug}>
          <Link href={`/genres/${g.slug}`}>
            {g.name}
            <sup className="meta">
              {String(g.count).padStart(2, "0")}
              <span className="od-sr"> {g.count === 1 ? "set" : "sets"}</span>
            </sup>
          </Link>
        </li>
      ))}
    </ul>
  );
}
