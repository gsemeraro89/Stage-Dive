// Loading placeholder: the section rule and flat blocks in the page grid (DESIGN.md section 8).
// Not wired as app/loading.tsx on purpose: a root loading file makes missing set, artist, venue and
// genre pages answer 200 instead of 404. Use it inside a <Suspense> or a route group that has no 404.
export function LoadingBlocks() {
  return (
    <main data-od="loading" aria-busy="true">
      <p className="od-sr" role="status">
        Loading
      </p>
      <div className="od-section od-section--first" aria-hidden="true">
        <div className="od-head">
          <span className="od-skel" style={{ width: "min(46vw, 520px)", height: "clamp(30px, 4.2vw, 60px)" }} />
        </div>
        <div className="od-lead-grid">
          <div className="od-lead">
            <div className="od-skel" style={{ aspectRatio: "16 / 9" }} />
            <div className="od-skel" style={{ height: 14, width: "40%", marginTop: 14 }} />
            <div className="od-skel" style={{ height: 30, width: "80%", marginTop: 12 }} />
          </div>
          <div className="od-rest" data-count="4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="od-loading-tile">
                <div className="od-skel" style={{ aspectRatio: "16 / 9" }} />
                <div className="od-skel" style={{ height: 14, width: "70%", marginTop: 12 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
