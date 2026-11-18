/** 7416 -> "2:03:36", 3001 -> "50:01". */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Date -> "30.09.26" (DESIGN.md: dates as DD.MM.YY). */
export function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

/** Credit line: "NTO", "NTO with Sofiane Pamart", "NTO with Joachim Pastor (as Sinners)". */
export function formatCredits(
  credits: { role: "MAIN" | "WITH"; creditNote: string | null; artist: { name: string } }[],
): string {
  const main = credits.filter((c) => c.role === "MAIN").map((c) => c.artist.name);
  const withs = credits
    .filter((c) => c.role === "WITH")
    .map((c) => (c.creditNote ? `${c.artist.name} (${c.creditNote})` : c.artist.name));
  return withs.length ? `${main.join(" & ")} with ${withs.join(" & ")}` : main.join(" & ");
}
