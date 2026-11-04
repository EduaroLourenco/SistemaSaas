"use client";

import * as React from "react";
import { Badge } from "@/components/ui/primitives";
import { money, count } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RaioXSku } from "@/lib/dados/raio-x-sku";

/**
 * Os blocos do raio-x que não vêm com a listagem.
 *
 * A listagem carrega 1.000 anúncios e não pode carregar, para cada um, o
 * histórico inteiro do SKU, o giro e a situação de catálogo. Então estes
 * três blocos buscam sob demanda, em `/api/anuncios/sku/[sku]`, quando o
 * drawer abre.
 *
 * São três perguntas que o resto da tela não responde:
 *   · isto aqui é pouco? — contra o recorde do próprio SKU;
 *   · dá para vender mais? — saldo contra o giro;
 *   · é este anúncio ou o irmão? — os outros MLBs do mesmo produto.
 */

const SITUACAO: Record<string, { texto: string; tom: "up" | "warn" | "down" | "neutral" }> = {
  ganhando: { texto: "ganhando", tom: "up" },
  dividindo: { texto: "dividindo", tom: "warn" },
  competindo: { texto: "competindo", tom: "warn" },
  listado: { texto: "listado", tom: "neutral" },
  fora: { texto: "fora", tom: "neutral" },
};

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 border-b border-line">
      <p className="label mb-2.5">{titulo}</p>
      {children}
    </div>
  );
}

export function BlocosDoSku({ sku, atual, selecionar }: { sku: string; atual?: string; selecionar?: (mlb: string) => void }) {
  const [dados, setDados] = React.useState<RaioXSku | null>(null);
  const [estado, setEstado] = React.useState<"carregando" | "pronto" | "erro" | "sem-sku">(
    sku ? "carregando" : "sem-sku"
  );

  React.useEffect(() => {
    if (!sku) {
      setEstado("sem-sku");
      return;
    }
    let vivo = true;
    setEstado("carregando");
    fetch(`/api/anuncios/sku/${encodeURIComponent(sku)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RaioXSku) => {
        if (!vivo) return;
        setDados(d);
        setEstado("pronto");
      })
      .catch(() => vivo && setEstado("erro"));
    return () => {
      vivo = false;
    };
  }, [sku]);

  if (estado === "sem-sku")
    return (
      <Bloco titulo="Histórico do produto">
        <p className="text-[12.5px] text-ink-3">
          Cadastre o SKU para reunir os anúncios deste produto.
        </p>
      </Bloco>
    );

  if (estado === "carregando")
    return (
      <Bloco titulo="Histórico do produto">
        <div className="h-16 rounded-r1 bg-panel-3 animate-pulse" />
      </Bloco>
    );

  if (estado === "erro" || !dados)
    return (
      <Bloco titulo="Histórico do produto">
        {/* Estado vazio honesto: não consegui ler, que é diferente de não ter. */}
        <p className="text-[12.5px] text-ink-3">Histórico indisponível. Tente novamente mais tarde.</p>
      </Bloco>
    );

  const { recorde, estoque, anuncios } = dados;
  const pico = recorde.recorde;
  const ultima = recorde.ultima;
  /* Onde a última semana está em relação ao melhor que este SKU já fez. */
  const doRecorde = pico && ultima && pico.unidades ? (ultima.unidades / pico.unidades) * 100 : null;

  return (
    <>
      <Bloco titulo="Vendas do produto">
        {pico ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[12px] text-ink-3">Última semana</p>
                <p className="num text-[16px] font-semibold text-ink leading-none mt-1">
                  {count(ultima!.unidades)} un
                </p>
                <p className="num text-[11.5px] text-ink-3 mt-1">{money(ultima!.precoMedio)}</p>
              </div>
              <div>
                <p className="text-[12px] text-ink-3">Recorde</p>
                <p className="num text-[16px] font-semibold text-ink leading-none mt-1">
                  {count(pico.unidades)} un
                </p>
                <p className="num text-[11.5px] text-ink-3 mt-1">{money(pico.precoMedio)}</p>
              </div>
              <div>
                <p className="text-[12px] text-ink-3">Do recorde</p>
                <p className="mt-1">
                  <Badge tone={doRecorde == null ? "neutral" : doRecorde >= 70 ? "up" : doRecorde >= 35 ? "warn" : "down"}>
                    <span className="num">
                      {doRecorde == null ? "—" : `${Math.round(doRecorde)}%`}
                    </span>
                  </Badge>
                </p>
              </div>
            </div>
            <p className="text-[11.5px] text-ink-3 mt-2.5">
              recorde em {pico.rotulo} · {recorde.semanasComVenda} semanas com venda desde{" "}
              {recorde.desde?.split("-").reverse().join("/")}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-ink-3">Sem venda registrada deste SKU.</p>
        )}
      </Bloco>

      <Bloco titulo="Estoque por origem">
        <p className="text-[12px] text-ink-3 mb-3">Giro: {estoque.giroDiario == null ? "sem vendas" : estoque.giroDiario.toLocaleString("pt-BR") + "/dia"} · 4 semanas fechadas</p>
        {estoque.leituras.length ? <>
          <div className="grid gap-3">{estoque.leituras.map(l => <div key={l.id} className="flex justify-between gap-3 border-b border-line pb-3">
            <div className="min-w-0"><p className="text-[13px] text-ink">{l.origem}</p><p className="text-[12px] text-ink-3">{l.local}</p><p className="text-[11px] text-ink-3">{new Date(l.consultadoEm).toLocaleDateString("pt-BR")}</p></div>
            <strong className="text-[14px] whitespace-nowrap">{l.disponivel == null ? "Sem leitura" : l.disponivel >= 40000 && l.origem !== "Bling · ERP" ? "Sob encomenda" : count(l.disponivel) + " un"}</strong>
          </div>)}</div>
          <p className="text-[12px] text-ink-3 mt-3">As origens podem compartilhar o mesmo estoque; os saldos não são somados.</p>
        </> : <p className="text-[12px] text-ink-3">{estoque.erroLeitura ? "Não foi possível consultar as origens agora." : "Sem leitura por origem. Confira o saldo de cada anúncio abaixo."}</p>}
        {(estoque.sobEncomenda > 0 || estoque.zerados > 0) && (
          <p className="text-[11.5px] text-ink-3 mt-2.5">
            {estoque.zerados > 0 && (
              <span className="text-down font-medium">
                {estoque.zerados} anúncio{estoque.zerados > 1 ? "s" : ""} ativo
                {estoque.zerados > 1 ? "s" : ""} sem estoque
              </span>
            )}
            {estoque.zerados > 0 && estoque.sobEncomenda > 0 && " · "}
            {estoque.sobEncomenda > 0 &&
              `${estoque.sobEncomenda} sob encomenda, fora do saldo`}
          </p>
        )}
      </Bloco>

      <Bloco titulo={`Anúncios do produto · ${anuncios.length}`}>
        <div className="flex flex-col gap-1.5">
          {anuncios.map((a) => {
            const s = a.catalogo ? SITUACAO[a.catalogo] : null;
            return (
              <div
                key={a.mlb}
                className="flex items-center justify-between gap-3 py-1 border-b border-line/60 last:border-0"
              >
                <span className="min-w-0">
                  {selecionar ? <button type="button" disabled={atual===a.mlb} className="num text-[12px] text-brand text-left min-h-11 disabled:text-ink disabled:cursor-default" onClick={()=>selecionar(a.mlb)}>{a.mlb}{atual===a.mlb?" · atual":" →"}</button> : <span className="num text-[12px] text-ink block">{a.mlb}</span>}
                  <span className="text-[11.5px] text-ink-3 block">
                    {a.tipo} · {a.conta}
                    {a.status !== "ativo" && ` · ${a.status}`}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {s && <Badge tone={s.tom}>{s.texto}</Badge>}
                  <span className="text-right">
                    <span className="num text-[12.5px] text-ink block">
                      {a.precoDeVenda ? money(a.precoDeVenda.preco) : "—"}
                    </span>
                    <span
                      className={cn(
                        "num text-[11px] block",
                        a.estoque === 0 ? "text-down" : "text-ink-3"
                      )}
                    >
                      {a.estoque == null
                        ? "sem leitura"
                        : a.estoque >= 40000
                          ? "sob encomenda"
                          : `${count(a.estoque)} un`}
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11.5px] text-ink-3 mt-2.5">
          preço de venda da última leitura; situação de catálogo da última apuração
        </p>
      </Bloco>
    </>
  );
}
