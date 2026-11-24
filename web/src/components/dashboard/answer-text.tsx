import { Fragment } from "react";

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Render an AI answer with brand and competitor mentions highlighted and [n] citation markers styled. */
export function AnswerText({ text, brand, competitors }: { text: string; brand: string; competitors: string[] }) {
  const names = [brand, ...competitors].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(${names.join("|")}|\\[\\d+\\])`, "g");
  return (
    <div className="flex flex-col gap-1 text-base leading-relaxed text-ink-2">
      {text.split("\n").map((line, li) =>
        line.trim() === "" ? (
          <div key={li} className="h-1" />
        ) : (
          <p key={li}>
            {line.split(re).map((part, i) => {
              if (part === brand) return <mark key={i} className="mention-brand">{part}</mark>;
              if (competitors.includes(part)) return <mark key={i} className="mention-competitor">{part}</mark>;
              if (/^\[\d+\]$/.test(part)) return <sup key={i} className="ml-0.5 font-mono text-2xs text-accent">{part}</sup>;
              return <Fragment key={i}>{part}</Fragment>;
            })}
          </p>
        ),
      )}
    </div>
  );
}
