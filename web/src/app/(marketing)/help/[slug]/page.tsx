import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ONBOARDING_STEPS } from "@/config/onboarding";
import { getStep, STEP_SLUGS } from "../help-content";

type Params = { slug: string };

export function generateStaticParams() {
  return STEP_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const step = getStep((await params).slug);
  if (!step) return { title: "Help" };
  return { title: step.title, description: step.why };
}

/** Renders an instruction line; lines with ``` fences become a preformatted block. */
function Step({ text }: { text: string }) {
  if (text.includes("```")) {
    const code = text.replace(/```[a-zA-Z]*\n?/g, "").replace(/\n$/, "");
    return (
      <li className="list-none">
        <pre className="overflow-x-auto rounded-sm border border-line bg-subtle p-3 font-mono text-xs leading-relaxed text-ink-2">{code}</pre>
      </li>
    );
  }
  return <li>{text}</li>;
}

export default async function HelpStepPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const step = getStep(slug);
  if (!step) notFound();
  const idx = ONBOARDING_STEPS.findIndex((s) => s.id === slug);
  const prev = ONBOARDING_STEPS[idx - 1];
  const next = ONBOARDING_STEPS[idx + 1];
  const requiredFields = step.fields.filter((f) => f.required && !f.showIf);
  const optionalFields = step.fields.filter((f) => !f.required && !f.showIf);

  return (
    <article className="max-w-2xl">
      <p className="text-xs font-medium text-ink-4">
        Step {idx + 1} of {ONBOARDING_STEPS.length}
        {step.optional ? " · optional" : ""}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{step.title}</h1>
      <p className="mt-3 text-md leading-relaxed text-ink-2">{step.why}</p>

      {requiredFields.length || optionalFields.length ? (
        <section className="mt-8">
          <h2 className="text-md font-semibold text-ink">What to provide</h2>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface text-sm">
            {[...requiredFields, ...optionalFields].map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5 px-4 py-3">
                <span className="font-medium text-ink">
                  {f.label}
                  {f.required ? <span className="ml-1.5 text-2xs font-medium text-accent-ink">Required</span> : null}
                </span>
                {f.help ? <span className="text-ink-3">{f.help}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {step.instructions.length ? (
        <section className="mt-8">
          <h2 className="text-md font-semibold text-ink">How to do it</h2>
          {step.instructions.map((block) => (
            <div key={block.title} className="mt-4 rounded-md border border-line bg-surface p-5">
              <h3 className="font-medium text-ink">{block.title}</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-2 marker:text-ink-4">
                {block.steps.map((s, i) => (
                  <Step key={i} text={s} />
                ))}
              </ol>
              {block.links?.length ? (
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {block.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noreferrer" className="font-medium text-accent-ink underline underline-offset-2">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {step.tests.length ? (
        <section className="mt-8">
          <h2 className="text-md font-semibold text-ink">What we check</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {step.tests.map((t) => (
              <li key={t.id} className="rounded-sm border border-line bg-canvas p-4">
                <span className="font-medium text-ink">{t.label}</span>
                <span className="mt-1 block text-ink-3">{t.description}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Step navigation" className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6 text-sm">
        {prev ? (
          <Link href={`/help/${prev.id}`} className="flex items-center gap-2 text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" /> {prev.short}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/help/${next.id}`} className="flex items-center gap-2 font-medium text-accent-ink hover:underline">
            {next.short} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : <span />}
      </nav>
    </article>
  );
}
