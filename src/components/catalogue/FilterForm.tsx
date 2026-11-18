import Form from "next/form";
import Link from "next/link";
import { SORT_LABELS, SORTS, type SetFilters } from "@/lib/filters";

interface Option {
  slug: string;
  name: string;
  count: number;
}

/**
 * Search, filters and sorting for the set list. The choices go in the address
 * (?genre=techno&sort=longest), so every result can be shared as a link and works without
 * JavaScript. With JavaScript the page changes without a reload, so the music keeps playing.
 */
export function FilterForm({
  filters,
  options,
}: {
  filters: SetFilters;
  options: { genres: Option[]; artists: Option[]; venues: Option[]; settings: Option[] };
}) {
  const select = (name: string, label: string, anyLabel: string, value: string | null, items: Option[]) => (
    <label className="od-field" data-on={value ? "" : undefined}>
      <span className="meta">{label}</span>
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
    <Form action="/sets" role="search" data-od="filters" className="od-filters" key={JSON.stringify(filters)}>
      <label className="od-field" data-on={filters.q ? "" : undefined}>
        <span className="meta">Search</span>
        <input type="search" name="q" defaultValue={filters.q ?? ""} placeholder="NTO, Cercle, Monegros" maxLength={80} />
      </label>
      {select("genre", "Genre", "Any genre", filters.genre, options.genres)}
      {select("artist", "DJ", "Any DJ", filters.artist, options.artists)}
      {select("venue", "Venue or festival", "Any venue", filters.venue, options.venues)}
      {select("setting", "Setting", "Any setting", filters.setting, options.settings)}
      <label className="od-field">
        <span className="meta">Sort</span>
        <select name="sort" defaultValue={filters.sort}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="od-filter-actions">
        <button type="submit" className="od-play">
          Show sets
        </button>
        <Link href="/sets" className="od-link">
          Clear
        </Link>
      </div>
    </Form>
  );
}
