import type { Metadata } from "next";
import {
  CutOut,
  DockedPlayerFrame,
  IconButton,
  OnNowStamp,
  PaperStrip,
  PhotoFrame,
  PressButton,
  SdStamp,
  Sheet,
  Staple,
  StripHeading,
  Tape,
  Wordmark,
  type IconName,
} from "@/components/zine";
import { PageTurnDemo, PressPlayDemo, SetlistDemo, SlapDemo } from "./KitDemos";
import "./kit.css";

// The design kit: every zine component and state on one page. Not for visitors or search engines.
export const metadata: Metadata = {
  title: "The kit",
  description: "Every STAGEDIVE zine component and state, for the people building the site.",
  robots: { index: false, follow: false },
};

const SWATCHES = [
  { name: "Toner black", hex: "#0A0A0A", tone: "toner", use: "Text, photos, strips, the player. A quarter of any page." },
  { name: "Copier paper", hex: "#ECEAE4", tone: "paper", use: "The ground, always speckled. Never pure white, never flat." },
  { name: "Clean sheet", hex: "#FBFAF6", tone: "sheet", use: "Labels, setlists, anything glued on top of the page." },
  { name: "Highlighter pink", hex: "#FF2D7A", tone: "pink", use: "A block behind black words: one live thing per view. Never text, never on a photo." },
  { name: "Masking tape", hex: "#D8D2B4", tone: "tape", use: "Decoration only. Holds things down. Never carries words." },
] as const;

const ICONS: { icon: IconName; label: string }[] = [
  { icon: "play", label: "Play" },
  { icon: "pause", label: "Pause" },
  { icon: "next", label: "Next song" },
  { icon: "previous", label: "Previous song" },
  { icon: "setlist", label: "Setlist" },
  { icon: "search", label: "Search" },
  { icon: "share", label: "Share this gig" },
];

const VOICE: [string, string][] = [
  ["Play", "Play it loud"],
  ["New concerts", "Fresh off the copier"],
  ["Loading", "Warming up the copier…"],
  ["Empty search", "Nothing. Not even a bootleg. Check the spelling or yell a different band."],
  ["404", "Page torn out. Somebody took it home."],
  ["Error", "The tape jammed. Hit play again, it usually behaves."],
  ["Newsletter", "The zine, in your inbox. One issue a week. No glitter."],
  ["Cookie notice", "We keep two cookies: one remembers your volume, one counts heads. That’s the lot."],
];

const TIMINGS: [string, string][] = [
  ["Slap-on", "260 ms, overshoot, 60–120 ms stagger"],
  ["Light bar", "900 ms linear, once per play"],
  ["Stamp", "320 ms, one bounce, after the bar"],
  ["Marker strike", "350 ms in 5 jerky steps"],
  ["Paper lift", "90 ms up and down; press sinks 3 px"],
  ["Page turn", "600 ms, hinged on the left edge"],
  ["Reduced motion", "all of it lands at once; no bar, no turn"],
];

function Section({ id, n, title, note, children }: { id: string; n: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="kit-section" aria-labelledby={`${id}-h`}>
      <div className="kit-section-head">
        <span className="zn-label">{n}</span>
        <PaperStrip as="h2" tone="black" size="h2" tilt={Number(n) % 2 ? -1.2 : 1}>
          <span id={`${id}-h`}>{title}</span>
        </PaperStrip>
        {note && <p className="kit-note">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function KitPage() {
  return (
    <main className="kit" data-od="kit">
      <div className="zn-band">Stagedive /// the kit /// every piece of the zine, every state /// not for visitors</div>

      <header className="kit-top">
        <StripHeading as="h1" size="h1" lines={["The", "kit"]} />
        <p className="kit-lede">
          Scissors, glue and one copier. Everything the pages are built from, taken from the approved brand book.
          Rules are in <code>design/DESIGN.md</code>; pieces are in <code>src/components/zine</code>.
        </p>
        <span className="zn-marker" data-size="big">
          if two things are pink, one of them is wrong
        </span>
      </header>

      <Section id="logo" n="01" title="Logo" note="Nine cut-outs, drawn letter by letter. Not typed. Not a font. Min 160 px full, 90 px flat; under 60 px the symbol takes over.">
        <div className="kit-logo-grid">
          <div className="kit-tile kit-tile--sheet kit-logo-main">
            <Wordmark width={620} />
            <span className="zn-label">Full, on paper or a clean sheet</span>
          </div>
          <div className="kit-tile kit-tile--toner">
            <Wordmark variant="on-toner" width={300} />
            <span className="zn-label">On toner black</span>
          </div>
          <div className="kit-tile kit-tile--sheet">
            <Wordmark variant="flat" width={203} />
            <Wordmark variant="flat" width={133} />
            <Wordmark variant="flat" width={90} label="" />
            <span className="zn-label">Flat: half tilt, no tape. 203 / 133 / 90</span>
          </div>
          <div className="kit-tile kit-tile--sheet">
            <div className="kit-row">
              <SdStamp size={132} label="SD symbol" />
              <SdStamp size={56} flat label="" />
              <SdStamp size={34} flat label="" />
            </div>
            <span className="zn-label">SD symbol /// 132, 56 flat, 34 flat</span>
          </div>
          <div className="kit-tile kit-tile--sheet">
            <div className="kit-row kit-row--end">
              {/* The favicon set served from src/app (icon.svg, favicon.ico with 16/32/64, apple-icon.png). */}
              <img src="/icon.svg" width={64} height={64} alt="Favicon at 64 pixels" />
              <img src="/icon.svg" width={32} height={32} alt="Favicon at 32 pixels" />
              <img src="/favicon.ico" width={16} height={16} alt="Favicon at 16 pixels" />
            </div>
            <span className="zn-label">Favicon 64 / 32 / 16</span>
          </div>
        </div>
      </Section>

      <Section id="colour" n="02" title="Colour" note="Per page: paper 58 / toner 25 / sheet 11 / pink 6. Black on paper 17:1, black on pink 5.4:1. Pink on paper fails, so it is never ink.">
        <div className="kit-swatches">
          {SWATCHES.map((s, i) => (
            <div key={s.hex} className="kit-swatch" data-tone={s.tone} style={{ rotate: `${[-0.8, 0.6, -0.5, 1, -0.6][i]}deg` }}>
              <div className="kit-swatch-top">
                <span className="kit-swatch-name">{s.name}</span>
                <span>{s.hex}</span>
              </div>
              <p>{s.use}</p>
            </div>
          ))}
        </div>
        <div className="kit-proportion" role="img" aria-label="Proportions: paper 58, toner 25, sheet 11, pink 6">
          <span style={{ flex: 58 }} data-tone="paper" />
          <span style={{ flex: 25 }} data-tone="toner" />
          <span style={{ flex: 11 }} data-tone="sheet" />
          <span style={{ flex: 6 }} data-tone="pink" />
        </div>
        <div className="kit-proportion-key zn-data">
          <span>Paper 58</span>
          <span>Toner 25</span>
          <span>Sheet 11</span>
          <span>Pink 6</span>
        </div>
      </Section>

      <Section id="type" n="03" title="Type" note="Three hands, one job each.">
        <div className="kit-type">
          <div>
            <StripHeading as="p" size="h1" lines={["Play it", "loud"]} />
            <p className="kit-spec">ARCHIVO BLACK, CAPS /// H1 56–74 px on a cut strip (33 on a phone), one strip per line, alternate white and black. H2 34–42. Names 22–26. Never below 15.</p>
            <div className="kit-stack">
              <PaperStrip tone="black" size="h2" tilt={-1}>
                Fresh off the copier
              </PaperStrip>
              <PaperStrip tone="white" size="name">
                Name label, 22–26
              </PaperStrip>
              <PaperStrip tone="white" size="small" tilt={1}>
                Smallest strip, 15
              </PaperStrip>
            </div>
          </div>
          <div>
            <p className="kit-body">Nobody has told them to behave. Forty-eight minutes, start to finish, and not one of them is wasted.</p>
            <p className="zn-data">Glastonbury 2024 /// 1:14:20</p>
            <p className="zn-label">Label, 13, tracked</p>
            <p className="kit-spec">SPECIAL ELITE /// everything you read. Body 16–18 / 1.6. Data in caps with triple slashes. Labels 13, tracked.</p>
            <p>
              <span className="zn-marker" data-size="big">
                click any song = jump straight to it
              </span>
            </p>
            <p className="kit-spec">PERMANENT MARKER /// someone wrote on the page afterwards. 17–27, tilted, lower case. Never navigation, never more than one line.</p>
          </div>
          <div>
            <span className="zn-label">Hierarchy on a real entry</span>
            <div className="kit-entry">
              <PhotoFrame kind="treated" src="/brandbook/x-hands.jpg" alt="Hands in the air in front of a stage, photocopied" ratio="16 / 7">
                <PaperStrip tone="white" size="name" tilt={-1}>
                  The band
                </PaperStrip>
              </PhotoFrame>
              <p className="zn-data">Some field 2019 /// 2:18:40</p>
              <span className="zn-marker">27 songs. yes, twenty-seven</span>
            </div>
            <p className="kit-spec">1 photo /// 2 name strip /// 3 typed data /// 4 one marker line</p>
          </div>
        </div>
      </Section>

      <Section id="paper" n="04" title="Paper" note="Tilt 1–4° for cut-outs, alternating with each neighbour; 0° for anything you type into or press twice. Edges square, always. Things touch: nothing floats alone.">
        <div className="kit-paper">
          <div className="kit-block">
            <span className="zn-label">PaperStrip /// white, black, black on a photo (keyline), pink, typed, marker</span>
            <div className="kit-stack">
              <PaperStrip tone="white" size="h2" tilt={-1.5}>
                White strip
              </PaperStrip>
              <PaperStrip tone="black" size="h2" tilt={1}>
                Black strip
              </PaperStrip>
              <span className="kit-on-toner">
                <PaperStrip tone="black" size="name" tilt={-1} keyline>
                  With keyline
                </PaperStrip>
              </span>
              <PaperStrip tone="pink" hand="type" tilt={1}>
                Finsbury Park /// 06.06.2010
              </PaperStrip>
              <PaperStrip tone="white" hand="marker" tilt={-3}>
                gig of the week!
              </PaperStrip>
            </div>
          </div>

          <div className="kit-block">
            <span className="zn-label">CutOut /// nav labels (one current, on pink), tag, sticker</span>
            <nav aria-label="Kit example navigation" className="kit-nav">
              <CutOut href="#paper" tilt={-1.5}>
                Bands
              </CutOut>
              <CutOut href="#paper" tilt={1}>
                Fields + Rooms
              </CutOut>
              <CutOut href="#paper" tone="pink" tilt={-1} current>
                Decades
              </CutOut>
              <CutOut href="#paper" tilt={1.5}>
                Genres
              </CutOut>
              <CutOut href="#paper" tilt={-1}>
                Tours
              </CutOut>
            </nav>
            <div className="kit-row">
              <CutOut tone="white" tilt={2}>
                1:17:45
              </CutOut>
              <CutOut tone="black" sticker tilt={-3}>
                Bootleg
              </CutOut>
              <CutOut tone="white" sticker tilt={3}>
                3 new gigs today
              </CutOut>
            </div>
          </div>

          <div className="kit-block">
            <span className="zn-label">Sheet /// keyline + 7 px solid shadow; tape bridges two things; staple = stacked sheets</span>
            <div className="kit-sheets">
              <Sheet tilt={-1.2} title="Manifesto" fixings={<Tape at="top-left" tilt={-5} />}>
                <p className="kit-body">
                  No login. No algorithm. We’ve got scissors, glue and every full gig we could find. Free, like the
                  flyer on the venue wall.
                </p>
                <span className="zn-marker">the crowd will catch you →</span>
              </Sheet>
              <Sheet tilt={2} title="Stapled" meta="2 sheets" level={3} fixings={<Staple at="top-left" tilt={-8} />}>
                <p className="kit-body">A staple says these sheets are stacked.</p>
              </Sheet>
              <Sheet flat title="Flat" level={3}>
                <p className="kit-body">Nothing under it, so no shadow.</p>
              </Sheet>
            </div>
          </div>
        </div>
      </Section>

      <Section id="photos" n="05" title="Photos" note="Two kinds, two sets of rules. Words go on a strip, never on the picture.">
        <div className="kit-photos">
          <div className="kit-block">
            <span className="zn-label">kind=&quot;treated&quot; /// our own, already photocopied pictures. Crop hard; hands, not faces.</span>
            <PhotoFrame
              kind="treated"
              src="/brandbook/x-fists.jpg"
              alt="A crowd with fists in the air, photocopied"
              ratio="16 / 9"
              tilt={-1}
              shadow
              fixings={
                <>
                  <Tape at="top-left" tilt={-5} />
                  <Tape at="top-right" tilt={4} />
                </>
              }
              control={<IconButton icon="play" label="Play this gig" size="large" />}
            >
              <StripHeading as="p" size="h2" lines={["Gig of", "the week"]} keyline />
              <PaperStrip tone="pink" hand="type">
                Some park, London /// the free one
              </PaperStrip>
            </PhotoFrame>
            <ul className="kit-rules">
              <li>4 px black frame, 7 px shadow only when it sits on something.</li>
              <li>A strip bites 20–30 px into the picture.</li>
              <li>Licensed pictures carry their credit under the frame.</li>
            </ul>
          </div>

          <div className="kit-block">
            <span className="zn-label">kind=&quot;youtube&quot; /// a YouTube thumbnail, exactly as YouTube serves it</span>
            <PhotoFrame
              kind="youtube"
              src="https://i.ytimg.com/vi/7VBl29wkCX4/maxresdefault.jpg"
              width={1280}
              height={720}
              alt="Radiohead on stage at Pinkpop 1996, the thumbnail of the YouTube video"
              tilt={1}
              shadow
              fixings={<Tape at="top-left" tilt={-4} />}
              control={<IconButton icon="play" label="Play Radiohead at Pinkpop 1996" size="large" />}
            >
              <StripHeading as="p" size="h2" lines={["Radiohead"]} tilts={[-1]} />
              <PaperStrip tone="white" hand="type" tilt={0.6}>
                Pinkpop 1996 /// 55:45
              </PaperStrip>
            </PhotoFrame>
            <ul className="kit-rules">
              <li>No filter, no recolouring, no crop: the picture keeps the shape of its file.</li>
              <li>Nothing on it except a play control. Strips, stamp and tape sit on the black mount.</li>
              <li>A visible “YouTube” credit under the frame, always.</li>
            </ul>
          </div>

          <div className="kit-block">
            <span className="zn-label">States /// playing (stamp), small, portrait cut, with credit</span>
            <div className="kit-photo-states">
              <PhotoFrame
                kind="youtube"
                src="https://i.ytimg.com/vi/7VBl29wkCX4/mqdefault.jpg"
                width={320}
                height={180}
                alt="Radiohead at Pinkpop 1996, YouTube thumbnail"
                stamp={<OnNowStamp />}
                control={<IconButton icon="pause" label="Pause" live />}
              />
              <PhotoFrame kind="treated" src="/brandbook/x-arena.jpg" alt="An arena crowd under stage lights, photocopied" ratio="4 / 3" tilt={-1.2} stamp={<OnNowStamp />}>
                <PaperStrip tone="white" size="small">
                  On a treated photo
                </PaperStrip>
              </PhotoFrame>
              <PhotoFrame
                kind="treated"
                src="/brandbook/x-guitar.jpg"
                alt="Hands on a guitar neck, photocopied"
                ratio="3 / 4"
                focus="50% 40%"
                tilt={1.5}
                credit="Photo: brand book"
              >
                <PaperStrip tone="white" size="small" tilt={-1.5}>
                  Hands, not faces
                </PaperStrip>
              </PhotoFrame>
            </div>
          </div>
        </div>
      </Section>

      <Section id="icons" n="06" title="Icons" note="Solid shapes cut with scissors, on a 48 px square label. Never outlines. The live control (pause, while playing) is the one on pink. Real buttons and links, named for screen readers.">
        <div className="kit-icons">
          {ICONS.map(({ icon, label }, i) => (
            <div key={icon} className="kit-icon">
              <div className="kit-row">
                <IconButton icon={icon} label={label} tilt={i % 2 ? 1.5 : -2} />
                <IconButton icon={icon} label={`${label} (on black)`} tone="black" tilt={i % 2 ? -1.5 : 2} />
              </div>
              <span className="zn-label">{icon}</span>
            </div>
          ))}
        </div>
        <div className="kit-icon-states">
          <div className="kit-block">
            <span className="zn-label">Live control /// pause while playing, on pink</span>
            <div className="kit-row">
              <IconButton icon="pause" label="Pause" live size="large" pressed />
              <IconButton icon="next" label="Next song" size="large" />
              <IconButton icon="share" label="Share this gig" size="large" />
            </div>
          </div>
          <div className="kit-block">
            <span className="zn-label">On the player /// paper outline, disabled</span>
            <div className="kit-row kit-on-toner">
              <IconButton icon="previous" label="Previous song (none)" tone="on-toner" disabled />
              <IconButton icon="pause" label="Pause" live />
              <IconButton icon="next" label="Next song" tone="on-toner" />
              <IconButton icon="setlist" label="Setlist" tone="on-toner" />
            </div>
          </div>
          <div className="kit-block">
            <span className="zn-label">As a link /// search</span>
            <div className="kit-row">
              <IconButton icon="search" label="Search for a gig" href="/concerts" tone="black" />
            </div>
          </div>
        </div>
        <div className="kit-block">
          <span className="zn-label">PressButton /// lifts 2 px on hover, slams 4 px down when pressed. Pink only for the one live action.</span>
          <div className="kit-row kit-row--wrap">
            <PressButton icon="play" size="large">
              Play it loud
            </PressButton>
            <PressButton tone="black" icon="pause">
              Stop the tape
            </PressButton>
            <PressButton tone="white" size="small">
              No thanks
            </PressButton>
            <PressButton tone="black" size="small">
              OK, fine
            </PressButton>
          </div>
        </div>
      </Section>

      <Section id="setlist" n="07" title="Setlist" note="Every song is a real button. Played songs get struck by marker, the song on now sits on pink. onSelect(seconds) is ready for the player.">
        <SetlistDemo />
      </Section>

      <Section id="player" n="08" title="Player" note="The only thing that sits dead straight. Toner black, 5 px pink rule, 8 px progress line. Nothing is ever drawn on the video.">
        <div className="kit-block">
          <span className="zn-label">Slim /// the video is playing in the page</span>
          <DockedPlayerFrame title="Radiohead" meta="Song 04 /// New song, be nice" time="0:13:23 / 0:55:45" progress={24}>
            <IconButton icon="previous" label="Previous song" tone="on-toner" />
            <IconButton icon="pause" label="Pause" live />
            <IconButton icon="next" label="Next song" tone="on-toner" />
            <button type="button" className="zn-dock-text">
              Setlist
            </button>
          </DockedPlayerFrame>
        </div>
        <div className="kit-block">
          <span className="zn-label">Docked /// holds the video box (356 × 200, or 200 × 200 on a phone). Paused.</span>
          <DockedPlayerFrame
            title="Radiohead"
            nowLabel="paused"
            meta="Pinkpop 1996"
            time="0:13:23 / 0:55:45"
            progress={24}
            video={<span className="kit-video-note zn-label">the YouTube video goes here, untouched</span>}
          >
            <IconButton icon="previous" label="Previous song" tone="on-toner" />
            <IconButton icon="play" label="Play" tone="on-toner" />
            <IconButton icon="next" label="Next song" tone="on-toner" />
          </DockedPlayerFrame>
        </div>
      </Section>

      <Section id="motion" n="09" title="Motion" note="Nothing fades. Things get slapped, stamped, struck and lifted. With reduced motion everything lands at once: no light bar, no page turn.">
        <div className="kit-motion">
          <div className="kit-block">
            <span className="zn-label">1 /// Press play: light bar, stamp, player docks</span>
            <PressPlayDemo />
          </div>
          <div className="kit-block">
            <span className="zn-label">2 /// Page load: strips slap on</span>
            <SlapDemo />
          </div>
          <div className="kit-block">
            <span className="zn-label">3 /// Hover or tab: paper lifts. The middle one is shown lifted.</span>
            <div className="kit-lifts">
              {[
                { name: "One band", where: "Some field 2024", tilt: 0, turn: "-2deg", src: "/brandbook/x-hands.jpg", lifted: false },
                { name: "Another band", where: "Some room 2022", tilt: 0, turn: "1.5deg", src: "/brandbook/x-guitar.jpg", lifted: true },
                { name: "A third band", where: "Some park 2019", tilt: 0, turn: "-1.5deg", src: "/brandbook/x-arena.jpg", lifted: false },
              ].map((card) => (
                <a
                  key={card.name}
                  href="#motion"
                  className="zn-sheet zn-lift kit-lift"
                  data-lifted={card.lifted || undefined}
                  style={{ ["--lift-turn" as string]: card.turn }}
                >
                  <Tape at="top-left" tilt={-4} width={84} />
                  <PhotoFrame kind="treated" src={card.src} alt="" ratio="3 / 2" />
                  <span className="kit-lift-name">{card.name}</span>
                  <span className="zn-data">{card.where}</span>
                </a>
              ))}
            </div>
          </div>
          <div className="kit-block">
            <span className="zn-label">4 /// Next page = a page turn</span>
            <PageTurnDemo />
          </div>
          <div className="kit-block">
            <span className="zn-label">Timings for the build</span>
            <dl className="kit-table">
              {TIMINGS.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <Section id="voice" n="10" title="Voice" note="Short, funny, on your side, slightly too loud. We say gig, free, jump in, the whole set. Never content, at no cost, get started, curated.">
        <dl className="kit-table kit-voice">
          {VOICE.map(([k, v]) => (
            <div key={k}>
              <dt className="zn-label">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="kit-row kit-row--wrap">
          <PressButton tone="black" size="small">
            OK, fine
          </PressButton>
          <PressButton tone="white" size="small">
            No thanks
          </PressButton>
        </div>
      </Section>

      <section className="kit-section" aria-label="How a section ends">
        <span className="zn-label">A section ends with a dashed cut line or a full-bleed black band. Never with empty space.</span>
      </section>
      <hr className="zn-cutline" data-scissors />
      <div className="kit-end">
        <span className="zn-marker">that’s the lot. go make a page.</span>
      </div>
      <div className="zn-band">The player is the only thing that sits dead straight</div>
    </main>
  );
}
