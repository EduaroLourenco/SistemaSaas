import Link from "next/link";

/** Os dois roteiros da aba Apresentação. Link de verdade: dá para guardar e mandar. */
export function TrocaRoteiro({ atual }: { atual: "resultado" | "meli" }) {
  const item = (valor: "resultado" | "meli", rotulo: string, href: string) => (
    <Link
      href={href}
      aria-current={atual === valor ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-r1 px-3 text-[14px] font-semibold ${atual === valor ? "bg-brand-wash text-brand-2" : "text-ink-2 hover:bg-panel-3"}`}
    >
      {rotulo}
    </Link>
  );
  return (
    <nav aria-label="Roteiro" className="flex rounded-r2 border border-line bg-panel p-0.5">
      {item("resultado", "Resultado", "/relatorios/apresentacao")}
      {item("meli", "Acompanhamento Meli", "/relatorios/apresentacao?roteiro=meli")}
    </nav>
  );
}
