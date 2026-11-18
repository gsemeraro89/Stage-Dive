"use client";

import Form from "next/form";

/**
 * "If you like ___": type a band, open the map from there. Without `lead` it is the compact line
 * at the top of the map. `lead` is the homepage's version, in the zine's own pieces: a marker label,
 * a framed field you type into and a black press button, all dead straight (styles: home.css, hm-next).
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
    <Form action="/map" role="search" className={lead ? "hm-next-form" : "od-mapsearch"} data-od="map-search">
      <label htmlFor={id} className={lead ? "zn-marker" : "display"}>
        {lead ? "if you like:" : "If you like"}
      </label>
      <input
        id={id}
        name="q"
        className={lead ? undefined : "display"}
        list={`${id}-list`}
        defaultValue={value}
        placeholder={lead ? "Type a band you love…" : "A band"}
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
      {lead ? (
        <button type="submit" className="zn-btn" data-tone="black">
          Find bands
        </button>
      ) : (
        <button type="submit" className="od-play">
          Show
        </button>
      )}
    </Form>
  );
}
