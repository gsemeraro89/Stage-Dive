// The questions at the bottom of a venue or band-like page (src/lib/answers.ts): closed by default
// (owner choice), a native <details>, readable without JavaScript. Only these visible questions become
// FAQPage structured data. An answer from a news article links to it (data-od="faq-news-link", unstyled for now: designer).
import Link from "next/link";

export function Faq({ title, questions }: { title: string; questions: { question: string; answer: string; link?: { href: string; text: string } }[] }) {
  if (!questions.length) return null;
  return (
    <details className="pg-faq" data-od="faq">
      <summary>{title}</summary>
      <dl>
        {questions.map((q) => (
          <div key={q.question}>
            <dt>{q.question}</dt>
            <dd>
              {q.answer}
              {q.link && (
                <>
                  {" "}
                  <Link href={q.link.href} data-od="faq-news-link">
                    {q.link.text}
                  </Link>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
