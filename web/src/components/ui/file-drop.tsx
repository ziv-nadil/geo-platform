"use client";

import { FileUp, FileCheck2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/ui/cn";

export interface DroppedFile {
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  status: "uploading" | "stored" | "local";
  note?: string;
}

function fmtSize(n: number) {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

/**
 * Drag-and-drop file input. `onFile` receives the File; the parent decides where it goes and
 * returns the stored state. A dark preview tile is offered for assets meant for dark backgrounds.
 */
export function FileDrop({
  id,
  accept,
  value,
  onFile,
  onClear,
  darkPreview,
  describedBy,
}: {
  id?: string;
  accept?: string;
  value?: DroppedFile | null;
  onFile: (file: File) => void;
  onClear: () => void;
  darkPreview?: boolean;
  describedBy?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-sm border border-line-strong bg-surface p-2.5">
        <div className={cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xs border border-line", darkPreview ? "bg-ink" : "bg-subtle")}>
          {value.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.previewUrl} alt="" className="max-h-10 max-w-10 object-contain" />
          ) : (
            <FileCheck2 className={cn("size-5", darkPreview ? "text-white" : "text-ink-3")} aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{value.name}</p>
          <p className="text-xs text-ink-3">
            {fmtSize(value.size)} · {value.status === "uploading" ? "Uploading…" : value.status === "stored" ? "Stored" : value.note ?? "Kept in this browser (demo)"}
          </p>
        </div>
        <button type="button" onClick={onClear} className="rounded-xs p-1.5 text-ink-3 hover:bg-subtle hover:text-ink" aria-label={`Remove ${value.name}`}>
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-sm border border-dashed border-line-strong bg-surface px-3 py-3 transition-colors hover:border-accent hover:bg-accent-soft/40",
        over && "border-accent bg-accent-soft/60",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xs bg-subtle text-ink-3">
        <FileUp className="size-4" aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-ink">
          Drop a file or <span className="text-accent underline underline-offset-2">browse</span>
        </span>
        <span className="text-xs text-ink-3">{accept ? accept.split(",").join(" ") : "Any file"} · max 10 MB</span>
      </span>
      <input
        ref={ref}
        id={inputId}
        type="file"
        accept={accept}
        aria-describedby={describedBy}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (ref.current) ref.current.value = "";
        }}
      />
    </label>
  );
}
