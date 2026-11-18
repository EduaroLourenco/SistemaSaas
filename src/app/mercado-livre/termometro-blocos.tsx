"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowDown, ArrowUp } from "lucide-react";
import { Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import { linkDoAnuncio } from "@/lib/links";
import { money, count, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { semControleDeEstoque } from "@/lib/estoque-sem-controle";
import { ROTULO_GRUPO, type PromoCanal } from "@/lib/planejamento/canal";
import type { DadosTermometro, ProdutoDoDia } from "@/lib/dados/termometro";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

function Chip({ texto, mlb }: { texto: string; mlb?: string }) {
  const href = mlb ? linkDoAnuncio(mlb) : null;
  const classe = "num inline-flex min-h-7 items-center rounded-r1 bg-panel-2 px-2 text-[12px] text-ink-2";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cn(classe, "hover:text-brand")}>
      {texto}
    </a>
  ) : (
    <span className={classe}>{texto}</span>
  );
}

function CartaoAtencao({ a }: { a: DadosTermometro["atencao"][number] }) {
  const [tudo, setTudo] = React.useState(false);
  const itens = a.itens ?? [];
  const visiveis = tudo ? itens : itens.slice(0, 4);
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-r2 border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "num text-[32px] font-semibold leading-9 tracking-tight",
              a.gravidade === "alta" ? "text-down" : a.gravidade === "media" ? "text-warn" : "text-ink",
            )}
          >
            {a.numero}
          </p>
          <p className="text-[13px] font-medium text-ink-2">{a.rotulo}</p>
        </div>
        {a.href && (
          <Link href={a.href} aria-label={`Abrir: ${a.rotulo}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-3 hover:text-ink">
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {itens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visiveis.map((i) => (
            <Chip key={i.texto} texto={i.texto} mlb={i.mlb} />
          ))}
          {itens.length > 4 && (
            <button type="button" onClick={() => setTudo((v) => !v)} className="min-h-7 px-1 text-[12px] font-medium text-brand">
              {tudo ? "menos" : `+${itens.length - 4}`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function PontosDeAtencao({ atencao }: { atencao: DadosTermometro["atencao"] }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Precisa de olho hoje" />
      {atencao.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3">nada fora do esperado</p>
      ) : (
        <ul className="grid gap-3 p-4 pt-1 sm:grid-cols-2 xl:grid-cols-4">
          {atencao.map((a) => (
            <CartaoAtencao key={a.chave} a={a} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

type Evento = DadosTermometro["acontecimentos"][number];

function ListaPreco({ titulo, itens, tom }: { titulo: string; itens: Evento[]; tom: "up" | "down" }) {
  const [tudo, setTudo] = React.useState(false);
  if (!itens.length) return null;
  const ordem = [...itens].sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
  const Icone = tom === "down" ? ArrowDown : ArrowUp;
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Icone className={cn("h-3.5 w-3.5", tom === "down" ? "text-up" : "text-down")} />
        {titulo} <span className="num font-normal text-ink-3">{itens.length}</span>
      </p>
      <ul className="divide-y divide-line">
        {(tudo ? ordem : ordem.slice(0, 5)).map((e) => (
          <li key={e.texto} className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
            <span className="num min-w-0 font-medium text-ink">{e.sku}</span>
            <span className="num ml-auto whitespace-nowrap text-ink-3">
              {money(e.de ?? 0)} → {money(e.para ?? 0)}
            </span>
            <span className="num w-12 text-right font-semibold text-ink">
              {(e.pct ?? 0) > 0 ? "+" : ""}
              {Math.round(e.pct ?? 0)}%
            </span>
          </li>
        ))}
      </ul>
      {itens.length > 5 && (
        <button type="button" onClick={() => setTudo((v) => !v)} className="mt-1 min-h-9 text-[12.5px] font-medium text-brand">
          {tudo ? "Ver menos" : `Ver todos os ${itens.length}`}
        </button>
      )}
    </div>
  );
}

export function OQueAconteceu({ lista }: { lista: Evento[] }) {
  const dias = React.useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of lista) m.set(e.data, [...(m.get(e.data) ?? []), e]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [lista]);
  const [aberto, setAberto] = React.useState(dias[0]?.[0] ?? "");
  const eventos = dias.find(([d]) => d === aberto)?.[1] ?? dias[0]?.[1] ?? [];
  const campanhas = eventos.filter((e) => e.tipo === "campanha");
  const precos = eventos.filter((e) => e.tipo === "preco");
  const estoque = eventos.filter((e) => e.tipo === "estoque");

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="O que aconteceu" />
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3" role="group" aria-label="Escolher dia">
        {dias.map(([d, itens]) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === aberto}
            onClick={() => setAberto(d)}
            className={cn(
              "min-h-14 w-[68px] shrink-0 rounded-r1 border px-1 py-1.5 text-center",
              d === aberto ? "border-brand bg-brand-wash" : "border-line bg-panel hover:bg-panel-2",
            )}
          >
            <span className="num block text-[12.5px] font-semibold text-ink">{dataBr(d)}</span>
            <span className="block text-[11px] text-ink-3">
              {diaSemana(d)} · <span className="num">{itens.length}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="grid gap-5 border-t border-line p-4 lg:grid-cols-3">
        {campanhas.length > 0 && (
          <div className="min-w-0">
            <p className="mb-1 text-[13px] font-semibold text-ink">Campanhas</p>
            <ul className="flex flex-col gap-1.5">
              {campanhas.map((e) => (
                <li key={e.texto} className="flex items-baseline gap-2 text-[12.5px] text-ink-2">
                  <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full", e.tom === "up" ? "bg-up" : "bg-down")} />
                  {e.texto}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ListaPreco key={`b${aberto}`} titulo="Baixou" tom="down" itens={precos.filter((e) => (e.pct ?? 0) < 0)} />
        <ListaPreco key={`s${aberto}`} titulo="Subiu" tom="up" itens={precos.filter((e) => (e.pct ?? 0) > 0)} />
        {estoque.length > 0 && (
          <div className="min-w-0">
            <p className="mb-1.5 text-[13px] font-semibold text-ink">Estoque</p>
            <div className="flex flex-wrap gap-1.5">
              {estoque.map((e) => (
                <Chip key={e.texto} texto={e.texto} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function NoAr({ canal, campanhas, hoje }: { canal: PromoCanal[]; campanhas: DadosTermometro["campanhas"]; hoje: string }) {
  const noAr = canal.filter((p) => p.situacao === "no-ar");
  const principais = noAr
    .filter((p) => p.grupo !== "automatica" && p.grupo !== "cupom")
    .sort((a, b) => Number(b.grupo === "relampago") - Number(a.grupo === "relampago") || a.fim.localeCompare(b.fim));
  const automaticas = noAr.filter((p) => p.grupo === "automatica").length;
  const cupons = noAr.filter((p) => p.grupo === "cupom").length;
  const resto = [automaticas && `${automaticas} automáticas`, cupons && `${cupons} cupons`].filter(Boolean).join(" · ");
  const doPlano = campanhas.filter((c) => c.status === "Em andamento" && c.fim >= hoje);
  const terminaram = campanhas.filter((c) => c.fim < hoje && c.status !== "Cancelada");

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="No ar agora"
        hint={resto ? `+ ${resto}` : undefined}
        action={
          <Link href="/planejamento" className="inline-flex min-h-11 items-center text-[12.5px] font-medium text-brand hover:underline">
            Planejamento
          </Link>
        }
      />
      {principais.length + doPlano.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3">nenhuma promoção na última leitura</p>
      ) : (
        <ul className="grid border-t border-line sm:grid-cols-2 xl:grid-cols-3">
          {principais.map((p) => (
            <li key={p.id} className="flex min-w-0 flex-col gap-1 border-b border-line px-4 py-3">
              <span className="flex items-center justify-between gap-2">
                <Badge tone={p.grupo === "relampago" ? "down" : p.grupo === "consultor" ? "up" : "neutral"}>{ROTULO_GRUPO[p.grupo]}</Badge>
                <span className="num text-[12px] text-ink-3">até {dataBr(p.diaFim)}</span>
              </span>
              <span className="text-[13.5px] font-medium text-ink">{p.nome}</span>
              <span className="num text-[12px] text-ink-3">{count(p.anuncios ?? 0)} anúncios</span>
            </li>
          ))}
          {doPlano.map((c) => (
            <li key={`${c.titulo}-${c.inicio}`} className="flex min-w-0 flex-col gap-1 border-b border-line px-4 py-3">
              <span className="flex items-center justify-between gap-2">
                <Badge tone="info">Plano</Badge>
                <span className="num text-[12px] text-ink-3">até {dataBr(c.fim)}</span>
              </span>
              <span className="text-[13.5px] font-medium text-ink">{c.titulo}</span>
              <span className="num text-[12px] text-ink-3">{c.skus ? `${count(c.skus)} SKUs` : "sem SKU"}</span>
            </li>
          ))}
        </ul>
      )}
      {terminaram.length > 0 && (
        <details className="border-t border-line px-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-ink-2">
            Terminaram nas duas semanas · {terminaram.length}
          </summary>
          <ul className="pb-3 text-[12.5px] text-ink-2">
            {terminaram.map((c) => (
              <li key={`${c.titulo}-${c.inicio}`} className="flex justify-between gap-3 py-1">
                <span>{c.titulo}</span>
                <span className="num shrink-0 text-ink-3">{dataBr(c.fim)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

type Chave = "titulo" | "visitas" | "unidades" | "conversao" | "receita" | "estoque";
const COLUNAS: { chave: Exclude<Chave, "titulo">; rotulo: string }[] = [
  { chave: "visitas", rotulo: "Visitas" },
  { chave: "unidades", rotulo: "Unidades" },
  { chave: "conversao", rotulo: "Conversão" },
  { chave: "receita", rotulo: "Receita" },
  { chave: "estoque", rotulo: "Estoque" },
];
const GRADE = "md:grid-cols-[minmax(0,1fr)_72px_76px_84px_104px_104px]";

export function MaisVistos({ lista, dia }: { lista: ProdutoDoDia[]; dia: string }) {
  const [chave, setChave] = React.useState<Chave>("visitas");
  const [desc, setDesc] = React.useState(true);
  const [semVenda, setSemVenda] = React.useState(false);
  const [tudo, setTudo] = React.useState(false);

  const filtrada = semVenda ? lista.filter((p) => p.unidades === 0) : lista;
  const ordenada = [...filtrada].sort((a, b) => {
    const r =
      chave === "titulo" ? a.titulo.localeCompare(b.titulo, "pt-BR") : (a[chave] ?? -1) - (b[chave] ?? -1);
    return desc ? -r : r;
  });
  const visiveis = tudo ? ordenada : ordenada.slice(0, 6);
  const ordenar = (c: Chave) => {
    if (c === chave) setDesc((v) => !v);
    else {
      setChave(c);
      setDesc(c !== "titulo");
    }
  };
  const cabecalho = (c: Chave, rotulo: string, direita = true) => (
    <button
      key={c}
      type="button"
      onClick={() => ordenar(c)}
      className={cn("min-h-11 shrink-0 text-[12px] font-medium", direita && "md:text-right", chave === c ? "text-ink" : "text-ink-3")}
    >
      {rotulo}
      {chave === c ? (desc ? " ↓" : " ↑") : ""}
    </button>
  );

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={`Mais vistos · ${dataBr(dia)}`}
        action={
          <button
            type="button"
            aria-pressed={semVenda}
            onClick={() => setSemVenda((v) => !v)}
            className={cn("min-h-11 rounded-r1 border px-3 text-[12.5px] font-medium", semVenda ? "border-brand bg-brand-wash text-brand" : "border-line-2 text-ink-2")}
          >
            Sem venda · {lista.filter((p) => p.unidades === 0).length}
          </button>
        }
      />
      {lista.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3">sem visita medida neste dia</p>
      ) : (
        <>
          <div className="thermometer-ranking-sort">
            <label>Ordenar por
              <select aria-label="Ordenar produtos mais vistos" value={chave} onChange={(e) => ordenar(e.target.value as Chave)}>
                <option value="titulo">Produto</option>
                {COLUNAS.map((c) => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setDesc((v) => !v)} aria-label={desc ? "Ordenar em ordem crescente" : "Ordenar em ordem decrescente"} title={desc ? "Decrescente" : "Crescente"}>
              {desc ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
          <div className={cn("thermometer-ranking-columns flex gap-4 overflow-x-auto border-y border-line bg-panel-2 px-4 md:grid md:gap-3", GRADE)}>
            <span className="md:text-left">{cabecalho("titulo", "Produto", false)}</span>
            {COLUNAS.map((c) => cabecalho(c.chave, c.rotulo))}
          </div>
          <ul className="divide-y divide-line">
            {visiveis.map((p) => {
              const link = linkDoAnuncio(p.mlb);
              return (
                <li key={p.mlb} className={cn("grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3 md:items-center", GRADE)}>
                  <div className="col-span-3 min-w-0 md:col-span-1">
                    <p className="text-[13px] font-medium text-ink">{p.titulo}</p>
                    <p className="num flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                      {p.sku || "sem SKU"}
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                          {p.mlb}
                        </a>
                      ) : (
                        p.mlb
                      )}
                      {p.tipo === "Premium" && <span>premium</span>}
                    </p>
                  </div>
                  <Celula rotulo="Visitas" forte>{count(p.visitas)}</Celula>
                  <Celula rotulo="Unidades" ruim={p.unidades === 0}>{count(p.unidades)}</Celula>
                  <Celula rotulo="Conversão">{p.conversao == null ? "—" : pct(p.conversao, 2)}</Celula>
                  <Celula rotulo="Receita">{p.receita > 0 ? money(p.receita) : "sem venda"}</Celula>
                  <Celula rotulo="Estoque" ruim={p.estoque === 0}>
                    {p.estoque == null ? "—" : semControleDeEstoque(p.estoque) ? "sob encomenda" : count(p.estoque)}
                  </Celula>
                </li>
              );
            })}
          </ul>
          {ordenada.length > 6 && (
            <button type="button" onClick={() => setTudo((v) => !v)} className="min-h-11 w-full border-t border-line text-[13px] font-medium text-brand hover:bg-panel-2">
              {tudo ? "Ver menos" : `Ver todos os ${ordenada.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function Celula({ rotulo, forte, ruim, children }: { rotulo: string; forte?: boolean; ruim?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 md:text-right">
      <p className="text-[11px] text-ink-3 md:hidden">{rotulo}</p>
      <p className={cn("num text-[13px]", forte ? "font-semibold text-ink" : "text-ink-2", ruim && "font-medium text-down")}>{children}</p>
    </div>
  );
}
