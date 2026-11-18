"use client"; // Error boundaries must be client components.

import { useEffect } from "react";
import { PressButton, StripHeading } from "@/components/zine";

/** Something broke while building a page. The player lives in the layout, so the music keeps playing. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main data-od="error" className="zn-404">
      <p className="zn-label">Error /// something came unstuck</p>
      <StripHeading as="h1" size="h1" lines={["The tape", "jammed."]} />
      <p className="zn-error-text" role="alert">
        Hit play again, it usually behaves.
      </p>
      <p className="zn-404-links">
        <PressButton tone="black" onClick={() => retry()}>
          Try again
        </PressButton>
        <PressButton href="/" tone="white">
          Back to the front page
        </PressButton>
      </p>
    </main>
  );
}
