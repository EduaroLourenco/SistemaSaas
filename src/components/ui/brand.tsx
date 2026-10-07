import { cn } from "@/lib/utils";

/** Recorte de apresentação do arquivo oficial, sem redesenhar a marca. */
export function Brand({ className, descriptor = false }: { className?: string; descriptor?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col items-start gap-2", className)}>
      <svg viewBox="530 185 1115 350" role="img" aria-label="Gerizo" className="gerizo-logo h-8 w-[102px] shrink-0">
        <image href="/brand/gerizo-wordmark.png" width="2172" height="724" />
      </svg>
      {descriptor && <span className="text-[12px] text-ink-2">Inteligência de mercado</span>}
    </span>
  );
}
