"use client";

import * as React from "react";
import { money, shortDate } from "@/lib/format";
import { rotuloPromocao, tomPromocao } from "@/lib/promocao-rotulos";
import type { PromocaoDoAnuncio, PromocoesDoAnuncio } from "@/lib/meli/promocoes-canal";

/**
 * O que o canal está cobrando por este anúncio AGORA.
 *
 * ── Por que não sai do banco ──
 *
 * `campanhas` guarda o que o motor decidiu de planilha. Não sabe de
 * relâmpago, de cupom, nem do desconto que o próprio Meli aplica sem
 * perguntar. O preço que o comprador vê pode estar 54% abaixo do
 * cadastro sem que nada disso tenha passado por aqui.
 *
 * ── O que ele responde, em ordem ──
 *
 * 1. quanto o comprador paga hoje — o MENOR preço entre as promoções no
 *    ar, porque é esse que vale na vitrine;
 * 2. quem banca o desconto — a parte do canal e a nossa, em pontos;
 * 3. o que está esperando aceite, e até onde o canal aceitaria descer.
 *
 * ── Zero, nulo e "não perguntei" ──
 *
 * Três coisas diferentes, e a mais fácil de errar está no meio:
 *   · promoções lidas e nenhuma no ar → "Nenhuma no ar" (medimos);
 *   · o canal recusou responder → travessão e o motivo (não medimos);
 *   · convite sem preço proposto → "sem proposta", não R$ 0,00.
 */

const tons: Record<string, string> = {
  info: "bg-info-wash text-info",
  down: "bg-down-wash text-down",
  up: "bg-up-wash text-up",
  warn: "bg-warn-wash text-warn",
  neutral: "bg-panel-3 text-ink-2",
};

/* O canal manda timestamp com e sem fuso; o dia é o que interessa. */
const dia = (iso: string | null) => (iso ? shortDate(iso.slice(0, 10)) : null);

/* Faixa do canal: 1.877 em vez de R$ 1.877,40, porque vai dentro de uma
   linha de detalhe e o cifrão já está na coluna do valor. */
const curto = (v: number) =>
  v.toLocaleString("pt-BR", { maximumFractionDigits: v < 100 ? 2 : 0 });

const pp = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function Bloco({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 border-b border-line">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <p className="label">Promoção no canal</p>
        <span className="text-[11px] text-ink-3 whitespace-nowrap">leitura agora</span>
      </div>
      {children}
    </div>
  );
}

function Linha({ p, convite }: { p: PromocaoDoAnuncio; convite: boolean }) {
  /* O que não existe não vira coluna vazia: some da linha. */
  const detalhe = [
    p.nome,
    p.meioPagamento,
    p.precoMinimo != null || p.precoMaximo != null
      ? `aceita ${p.precoMinimo == null ? "—" : curto(p.precoMinimo)} – ${p.precoMaximo == null ? "—" : curto(p.precoMaximo)}`
      : null,
    p.estoqueMin != null ? `${p.estoqueMin}–${p.estoqueMax ?? "?"} un` : null,
    p.fim ? `até ${dia(p.fim)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* No convite o `price` do canal NÃO é proposta — chega a vir acima do
     teto dele mesmo. A proposta é `sugerido`. */
  const valor = convite ? p.sugerido : p.preco;

  return (
    <tr>
      <td className="py-[7px] align-top border-t border-line">
        <span
          className={
            "inline-block text-[10.5px] font-semibold px-1.5 py-0.5 rounded-[5px] whitespace-nowrap " +
            (tons[tomPromocao(p.tipo)] ?? tons.neutral)
          }
        >
          {rotuloPromocao(p.tipo)}
        </span>
        {detalhe && (
          <span className="block text-[11.5px] text-ink-3 mt-0.5 break-words">{detalhe}</span>
        )}
      </td>
      <td className="py-[7px] pl-2 align-top border-t border-line text-right whitespace-nowrap">
        {valor == null ? (
          <span className="text-[12.5px] text-ink-3">
            {convite ? "sem proposta" : "sem preço"}
          </span>
        ) : (
          <span className="num text-[12.5px] text-ink">{money(valor)}</span>
        )}
      </td>
    </tr>
  );
}

function Grupo({
  titulo,
  lista,
  convite,
}: {
  titulo: string;
  lista: PromocaoDoAnuncio[];
  convite: boolean;
}) {
  if (!lista.length) return null;
  return (
    <>
      <p className="label mt-2.5 mb-1">{titulo}</p>
      <table className="w-full border-collapse [&_tr:first-child_td]:border-t-0">
        <tbody>
          {lista.map((p, i) => (
            <Linha key={`${p.codigo ?? p.tipo}-${i}`} p={p} convite={convite} />
          ))}
        </tbody>
      </table>
    </>
  );
}

export function PromocaoAoVivo({ mlb }: { mlb: string }) {
  const [dados, setDados] = React.useState<PromocoesDoAnuncio | null>(null);
  const [estado, setEstado] = React.useState<"carregando" | "pronto" | "erro">("carregando");

  React.useEffect(() => {
    if (!mlb) return;
    let vivo = true;
    setEstado("carregando");
    fetch(`/api/anuncios/promocoes/${encodeURIComponent(mlb)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PromocoesDoAnuncio) => {
        if (!vivo) return;
        setDados(d);
        setEstado("pronto");
      })
      .catch(() => vivo && setEstado("erro"));
    return () => {
      vivo = false;
    };
  }, [mlb]);

  if (estado === "carregando")
    return (
      <Bloco>
        <div className="h-12 rounded-r1 bg-panel-3 animate-pulse" />
      </Bloco>
    );

  /* Falha nossa e recusa do canal são a mesma coisa para quem lê a tela:
     ninguém perguntou com sucesso. O que muda é o motivo. */
  if (estado === "erro" || !dados)
    return (
      <Bloco>
        <p className="text-[19px] font-semibold text-ink-3">—</p>
        <p className="mt-1 text-[12.5px] text-ink-3">não consegui perguntar ao canal</p>
      </Bloco>
    );

  if (!dados.lido)
    return (
      <Bloco>
        <p className="text-[19px] font-semibold text-ink-3">—</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{dados.motivo}</p>
      </Bloco>
    );

  const noAr = dados.promocoes.filter((p) => p.status === "started");
  const agendadas = dados.promocoes.filter((p) => p.status === "pending");
  const convites = dados.promocoes.filter(
    (p) => p.status !== "started" && p.status !== "pending"
  );

  if (!dados.promocoes.length)
    return (
      <Bloco>
        <p className="text-[19px] font-semibold text-ink-2">Nenhuma no ar</p>
        <p className="mt-1 text-[12.5px] text-ink-2">nenhum convite</p>
      </Bloco>
    );

  const cheio = dados.promocoes.find((p) => p.precoOriginal != null)?.precoOriginal ?? null;
  /* O menor preço no ar é o que o comprador vê: promoções empilham e a
     vitrine mostra a mais barata. */
  const barata = noAr
    .filter((p) => p.preco != null)
    .sort((a, b) => (a.preco as number) - (b.preco as number))[0];
  const piso = convites
    .map((p) => p.precoMinimo)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)[0];
  const off =
    barata && cheio ? Math.round((1 - (barata.preco as number) / cheio) * 100) : null;

  const chips: [string, string][] = [];
  if (noAr.length) chips.push([`${noAr.length} no ar`, "bg-up-wash text-up"]);
  if (agendadas.length)
    chips.push([
      `${agendadas.length} agendada${agendadas.length > 1 ? "s" : ""}`,
      "bg-info-wash text-info",
    ]);
  if (convites.length)
    chips.push([
      `${convites.length} convite${convites.length > 1 ? "s" : ""}`,
      "bg-panel-3 text-ink-2",
    ]);

  return (
    <Bloco>
      {barata ? (
        <>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="num text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {money(barata.preco as number)}
            </span>
            {cheio != null && (
              <span className="num text-[13px] text-ink-3 line-through">{money(cheio)}</span>
            )}
            {off != null && (
              <span className="num text-[12px] font-semibold text-down bg-down-wash px-[7px] py-0.5 rounded-full">
                -{off}%
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-2 break-words">
            {rotuloPromocao(barata.tipo)}
            {barata.nome ? ` · ${barata.nome}` : ""}
            {barata.fim ? ` · até ${dia(barata.fim)}` : ""}
          </p>
          {(barata.sellerPct != null || barata.meliPct != null) && (
            <p className="mt-1 text-[11.5px] text-ink-3 num">
              desconto: nós {pp(barata.sellerPct ?? 0)} · canal {pp(barata.meliPct ?? 0)}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-[19px] font-semibold text-ink-2">Nenhuma no ar</p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {convites.length} convite{convites.length > 1 ? "s" : ""}
            {piso != null ? ` · o canal aceita até ${money(piso)}` : ""}
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {chips.map(([texto, cor]) => (
          <span
            key={texto}
            className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${cor}`}
          >
            {texto}
          </span>
        ))}
      </div>

      <details className="mt-2.5 border-t border-line">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-brand min-h-11 flex items-center list-none [&::-webkit-details-marker]:hidden">
          ver as {dados.promocoes.length}
        </summary>
        <Grupo titulo="No ar" lista={noAr} convite={false} />
        <Grupo titulo="Agendada" lista={agendadas} convite={false} />
        <Grupo titulo="Convites · proposta do canal" lista={convites} convite />
      </details>
    </Bloco>
  );
}
