// The questions at the bottom of a venue or band-like page (src/lib/answers.ts): closed by default
// (owner choice), a native <details>, readable without JavaScript. Only these visible questions become
// FAQPage structured data.
export function Faq({ title, questions }: { title: string; questions: { question: string; answer: string }[] }) {
  if (!questions.length) return null;
  return (
    <details className="pg-faq" data-od="faq">
      <summary>{title}</summary>
      <dl>
        {questions.map((q) => (
          <div key={q.question}>
            <dt>{q.question}</dt>
            <dd>{q.answer}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
