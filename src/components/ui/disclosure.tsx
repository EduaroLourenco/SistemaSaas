import type { ReactNode } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({ title = "Como ler estes dados", children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <details className={cn("gerizo-disclosure group rounded-r1 border border-line bg-panel text-ink-2", className)}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] font-medium">
        <Info className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        <span className="flex-1">{title}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-4 py-3 text-[13px] leading-relaxed">{children}</div>
    </details>
  );
}
