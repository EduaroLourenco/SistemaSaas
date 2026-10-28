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

/*
 * As faixas de cobertura.
 *
 * Abaixo de duas semanas, repor é urgente. Acima de quatro meses não é
 * conforto: é capital parado, e pintar de verde diria o contrário. Por
 * isso o verde tem teto — a faixa boa é um intervalo, não "quanto mais,
 * melhor".
 */
const COBERTURA_CRITICA = 14;
const COBERTURA_ATENCAO = 30;
const COBERTURA_DEMAIS = 120;

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

export function BlocosDoSku({ sku }: { sku: string }) {
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
          Este anúncio não tem SKU no canal, então não dá para juntar os irmãos dele.
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
        <p className="text-[12.5px] text-ink-3">Não consegui ler o histórico deste SKU agora.</p>
      </Bloco>
    );

  const { recorde, estoque, anuncios } = dados;
  const pico = recorde.recorde;
  const ultima = recorde.ultima;
  /* Onde a última semana está em relação ao melhor que este SKU já fez. */
  const doRecorde = pico && ultima && pico.unidades ? (ultima.unidades / pico.unidades) * 100 : null;

  const tomCobertura =
    estoque.diasDeCobertura == null
      ? "neutral"
      : estoque.diasDeCobertura <= COBERTURA_CRITICA
        ? "down"
        : estoque.diasDeCobertura <= COBERTURA_ATENCAO
          ? "warn"
          : estoque.diasDeCobertura <= COBERTURA_DEMAIS
            ? "up"
            : "neutral";

  return (
    <>
      <Bloco titulo="Contra o recorde do próprio SKU">
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

      <Bloco titulo="Estoque e ruptura">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[12px] text-ink-3">Saldo</p>
            <p className="num text-[16px] font-semibold text-ink leading-none mt-1">
              {estoque.saldo == null ? "—" : count(estoque.saldo)}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-ink-3">Giro</p>
            <p className="num text-[16px] font-semibold text-ink leading-none mt-1">
              {estoque.giroDiario == null
                ? "—"
                : `${estoque.giroDiario.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}/dia`}
            </p>
            <p className="text-[11.5px] text-ink-3 mt-1">4 semanas fechadas</p>
          </div>
          <div>
            <p className="text-[12px] text-ink-3">Cobertura</p>
            <p className="mt-1">
              <Badge tone={tomCobertura}>
                <span className="num">
                  {estoque.diasDeCobertura == null ? "—" : `${estoque.diasDeCobertura} dias`}
                </span>
              </Badge>
            </p>
          </div>
        </div>
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

      <Bloco titulo={`Os ${anuncios.length} anúncios deste SKU`}>
        <div className="flex flex-col gap-1.5">
          {anuncios.map((a) => {
            const s = a.catalogo ? SITUACAO[a.catalogo] : null;
            return (
              <div
                key={a.mlb}
                className="flex items-center justify-between gap-3 py-1 border-b border-line/60 last:border-0"
              >
                <span className="min-w-0">
                  <span className="num text-[12px] text-ink block">{a.mlb}</span>
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
