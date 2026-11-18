import { PressButton, StripHeading } from "@/components/zine";

export default function NotFound() {
  return (
    <main data-od="not-found" className="zn-404">
      <p className="zn-label">Error 404 /// this page is not in the zine</p>
      <StripHeading as="h1" size="h1" lines={["Page torn out.", "Somebody took it home."]} />
      <p className="zn-404-links">
        <PressButton href="/" tone="black">
          Back to the front page
        </PressButton>
        <span className="zn-marker">the gigs are still here</span>
      </p>
    </main>
  );
}
