import Form from "next/form";
import Link from "next/link";
import { SORT_LABELS, SORTS, type ConcertFilters } from "@/lib/filters";

interface Option {
  slug: string;
  name: string;
  count: number;
}

/**
 * Search, filters and sorting for the list of gigs. The choices go in the address
 * (?genre=punk&sort=longest), so every result can be shared as a link and works without JavaScript.
 * With JavaScript the page changes without a reload, so the music keeps playing.
 * Dead straight: you type into it. Styles: src/styles/pages.css (.pg-filters).
 */
export function GigFilters({
  filters,
  options,
}: {
  filters: ConcertFilters;
  options: { genres: Option[]; artists: Option[]; venues: Option[]; venueKinds: Option[] };
}) {
  const select = (name: string, label: string, anyLabel: string, value: string | null, items: Option[]) => (
    <label className="pg-field" data-on={value ? "" : undefined}>
      <span className="zn-label">{label}</span>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">{anyLabel}</option>
        {items.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name} ({o.count})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Form action="/concerts" role="search" data-od="filters" className="pg-filters" key={JSON.stringify(filters)}>
      <label className="pg-field pg-field--q" data-on={filters.q ? "" : undefined}>
        <span className="zn-marker">find a gig:</span>
        <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="band / venue / year" maxLength={80} />
      </label>
      {select("artist", "Band", "Any band", filters.artist, options.artists)}
      {select("venue", "Field or room", "Anywhere", filters.venue, options.venues)}
      {select("genre", "Genre", "Any noise", filters.genre, options.genres)}
      {select("venueKind", "Kind of place", "Any kind", filters.venueKind, options.venueKinds)}
      <label className="pg-field">
        <span className="zn-label">Order</span>
        <select name="sort" defaultValue={filters.sort}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="pg-filter-actions">
        <button type="submit" className="zn-btn" data-tone="black" data-size="small">
          Show gigs
        </button>
        <Link href="/concerts" className="hm-more">
          CLEAR
        </Link>
      </div>
    </Form>
  );
}
