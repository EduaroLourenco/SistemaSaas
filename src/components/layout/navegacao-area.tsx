"use client";

import { DemoLink as Link } from "@/lib/demo/runtime";
import { useGerizoPathname as usePathname, useGerizoSearchParams as useSearchParams } from "@/lib/demo/runtime";
import { AREAS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function NavegacaoArea() {
  const pathname = usePathname();
  const params = useSearchParams();
  const area = AREAS.find((a) => a.items.some((i) => i.href === pathname || i.rotas?.includes(pathname)));
  if (!area) return null;
  const comuns = new URLSearchParams();
  for (const chave of ["canal", "inicio", "fim", "de", "ate", "ano", "mes"]) {
    const valor = params.get(chave);
    if (valor) comuns.set(chave, valor);
  }
  const query = comuns.toString();
  return (
    <nav aria-label={area.label} className="mt-4 flex max-w-full gap-1 overflow-x-auto border-b border-line pb-px">
      {area.items.map((i) => <Link key={i.href} href={`${i.href}${query ? `?${query}` : ""}`}
        aria-current={pathname === i.href || i.rotas?.includes(pathname) ? "page" : undefined}
        className={cn("flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[13px] transition-colors", pathname === i.href || i.rotas?.includes(pathname) ? "border-brand font-semibold text-brand" : "border-transparent text-ink-2 hover:border-line-2 hover:text-ink")}
      >{i.label}</Link>)}
    </nav>
  );
}
