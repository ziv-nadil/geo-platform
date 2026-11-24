import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export function TableWrap({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("w-full overflow-x-auto", className)} {...rest} />;
}

export function Table({ className, ...rest }: ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-sm tabular", className)} {...rest} />;
}

export function THead({ className, ...rest }: ComponentProps<"thead">) {
  return <thead className={cn("border-y border-line bg-subtle/60", className)} {...rest} />;
}

export function Th({ className, ...rest }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("h-9 px-3 text-left text-2xs font-semibold tracking-wide whitespace-nowrap text-ink-3 uppercase first:pl-5 last:pr-5", className)}
      {...rest}
    />
  );
}

export function TBody({ className, ...rest }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-line", className)} {...rest} />;
}

export function Tr({ className, ...rest }: ComponentProps<"tr">) {
  return <tr className={cn("transition-colors hover:bg-subtle/50", className)} {...rest} />;
}

export function Td({ className, ...rest }: ComponentProps<"td">) {
  return <td className={cn("h-11 px-3 align-middle text-ink-2 first:pl-5 last:pr-5", className)} {...rest} />;
}
