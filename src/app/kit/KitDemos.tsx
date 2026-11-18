"use client";

import { useState } from "react";
import {
  CutOut,
  DockedPlayerFrame,
  IconButton,
  OnNowStamp,
  PaperStrip,
  PhotoFrame,
  PressButton,
  Sheet,
  Staple,
  StripHeading,
  Tape,
  TypewriterSetlist,
  type SetlistSong,
} from "@/components/zine";

const SONGS: SetlistSong[] = [
  { title: "Opening number", seconds: 0 },
  { title: "The loud one", seconds: 252 },
  { title: "Everybody knows this one", seconds: 541 },
  { title: "New song, be nice", seconds: 803 },
  { title: "The slow one (lighters up)", seconds: 1102 },
  { title: "Feedback, mostly", seconds: 1415 },
  { title: "The hit", seconds: 1730 },
  { title: "Encore: the other hit", seconds: 2046 },
];

/** The setlist, live: click a song, the ones before it get struck out. */
export function SetlistDemo() {
  const [last, setLast] = useState<string>("nothing yet. click a song.");
  return (
    <div className="kit-setlist">
      <Sheet
        as="aside"
        label="Setlist demo"
        title="Setlist"
        meta={`${SONGS.length} songs`}
        tilt={1.2}
        fixings={
          <>
            <Tape at="top-center" tilt={-2} />
            <Staple at="top-right" />
          </>
        }
      >
        <TypewriterSetlist
          songs={SONGS}
          defaultCurrentIndex={3}
          onSelect={(seconds, index) => setLast(`onSelect(${seconds}) for song ${index + 1}`)}
        />
        <p className="zn-marker" style={{ margin: "10px 0 0" }}>
          click a song. it jumps, the ones before get crossed out.
        </p>
      </Sheet>
      <p className="zn-label" aria-live="polite">
        Last call: {last}
      </p>
    </div>
  );
}

/** Press play: light bar (900ms), "On now" stamp (320ms, one bounce), then the player docks. */
export function PressPlayDemo() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="kit-play">
      <PhotoFrame
        kind="treated"
        src="/brandbook/x-fists.jpg"
        alt="A crowd with fists in the air, photocopied"
        ratio="16 / 7"
        tilt={-0.8}
        scan={playing ? "run" : undefined}
        stamp={playing ? <OnNowStamp animate /> : undefined}
      >
        <StripHeading as="p" size="name" lines={["Gig of", "the week"]} keyline />
      </PhotoFrame>
      <div className="kit-row">
        {playing ? (
          <PressButton tone="black" icon="pause" onClick={() => setPlaying(false)}>
            Stop the tape
          </PressButton>
        ) : (
          <PressButton icon="play" onClick={() => setPlaying(true)}>
            Play it loud
          </PressButton>
        )}
        <span className="zn-marker">1 click. watch the photo, then the bar.</span>
      </div>
      <div className="kit-dockwell">
        {playing && (
          <DockedPlayerFrame
            docking
            title="The band you came for"
            meta="Song 04 /// New song, be nice"
            time="0:13:23 / 0:55:45"
            progress={24}
          >
            <IconButton icon="previous" label="Previous song" tone="on-toner" />
            <IconButton icon="pause" label="Pause" live />
            <IconButton icon="next" label="Next song" tone="on-toner" />
          </DockedPlayerFrame>
        )}
      </div>
    </div>
  );
}

/** Page load: photo, strip, strip, tape, sticker slap on, 80ms apart. */
export function SlapDemo() {
  const [round, setRound] = useState(0);
  const from = (["left", "right", "near"] as const)[round % 3];
  return (
    <div className="kit-slap">
      <div className="kit-slap-stage" key={round}>
        <div className="zn-slap kit-slap-photo" data-from={from} style={{ ["--i" as string]: 0 }}>
          <PhotoFrame kind="treated" src="/brandbook/x-hands.jpg" alt="" ratio="3 / 2" tilt={-1} />
        </div>
        <div className="zn-slap kit-slap-s1" data-from={from} style={{ ["--i" as string]: 1 }}>
          <PaperStrip tone="white" size="h2" tilt={-2}>
            Fresh off
          </PaperStrip>
        </div>
        <div className="zn-slap kit-slap-s2" data-from={from} style={{ ["--i" as string]: 2 }}>
          <PaperStrip tone="black" size="h2" tilt={1.5} keyline>
            the copier
          </PaperStrip>
        </div>
        <div className="zn-slap kit-slap-tape" data-from={from} style={{ ["--i" as string]: 3.4 }}>
          <span className="zn-tape" aria-hidden="true" style={{ position: "static", display: "block", ["--tilt" as string]: "4deg" }} />
        </div>
        <div className="zn-slap kit-slap-sticker" data-from={from} style={{ ["--i" as string]: 4.9 }}>
          <CutOut tone="pink" sticker tilt={3}>
            3 new gigs today
          </CutOut>
        </div>
      </div>
      <PressButton tone="white" size="small" onClick={() => setRound((n) => n + 1)}>
        Slap it on again
      </PressButton>
    </div>
  );
}

/** Next page: the leaf turns on its left edge, 600ms. */
export function PageTurnDemo() {
  const [turned, setTurned] = useState(false);
  return (
    <div className="kit-turn">
      <div className="kit-turn-spread">
        <div className="kit-turn-cover">
          <span className="kit-turn-title">
            Stage
            <br />
            dive
          </span>
          <span className="zn-data">
            Issue No.001
            <br />
            Free
          </span>
        </div>
        <div className="zn-book kit-turn-book">
          <div className="kit-turn-page kit-turn-under">
            <span className="zn-label">P.3</span>
            <span className="kit-turn-title">Pick a decade</span>
            <span className="kit-turn-decades">60 70 80 90 00 10 20</span>
          </div>
          <div className="zn-leaf" data-turned={turned || undefined}>
            <div className="kit-turn-page">
              <span className="zn-label">P.1</span>
              <span className="kit-turn-title">Fresh off the copier</span>
              <span className="zn-data">
                Five gigs
                <br />
                you have not
                <br />
                seen yet
              </span>
            </div>
            <div className="kit-turn-page kit-turn-back">
              <span className="zn-label" style={{ color: "inherit" }}>
                P.2
              </span>
              <span className="kit-turn-title">Most played</span>
              <span className="zn-data">
                1 to 5,
                <br />
                loudest first
              </span>
            </div>
          </div>
        </div>
      </div>
      <PressButton tone="white" size="small" onClick={() => setTurned((v) => !v)}>
        {turned ? "Turn it back" : "Turn the page"}
      </PressButton>
    </div>
  );
}
