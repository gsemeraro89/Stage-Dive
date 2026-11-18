"use client";

import Form from "next/form";

/**
 * "If you like ___": type a band, open the map from there. One left-aligned line of display
 * type with an underlined field (DESIGN.md section 8, Map search). `lead` is the large version
 * on the home page; without it the line is the compact one at the top of the map.
 * Focusing the field selects what is in it, so a new name can be typed straight away.
 */
export function MapSearch({
  artists,
  id,
  value,
  lead,
  children,
}: {
  artists: { slug: string; name: string }[];
  id: string;
  /** What the field starts with (the artist the map is centred on). */
  value?: string;
  lead?: boolean;
  /** Hidden fields to keep in the address (the map's view and genres). */
  children?: React.ReactNode;
}) {
  return (
    <Form action="/map" role="search" className={`od-mapsearch${lead ? " od-mapsearch--lead" : ""}`} data-od="map-search">
      <label htmlFor={id} className="display">
        If you like
      </label>
      <input
        id={id}
        name="q"
        className="display"
        list={`${id}-list`}
        defaultValue={value}
        placeholder="A band"
        autoComplete="off"
        maxLength={80}
        required
        // The field starts with the centre artist: typing replaces it, nothing to delete first.
        onFocus={(e) => e.currentTarget.select()}
      />
      <datalist id={`${id}-list`}>
        {artists.map((a) => (
          <option key={a.slug} value={a.name} />
        ))}
      </datalist>
      {children}
      <button type="submit" className="od-play">
        {lead ? "Find bands" : "Show"}
      </button>
    </Form>
  );
}
