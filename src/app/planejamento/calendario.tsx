"use client";
import { useState, type DragEvent } from "react";
import { Plus, Flag, Sparkles, Tag } from "lucide-react";
import {
  type Item,
  type Dados,
  dataUTC,
  somarDias,
  segunda,
  diasEntre,
  sobrepoe,
} from "@/lib/planejamento/modelo";
import type { Oportunidade } from "@/lib/planejamento/sazonal";
type Evento = {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  cor: string;
  categoria: "item" | "data" | "promo";
  legenda: string;
  clicar: () => void;
  item?: Item;
};

export function faixas<T extends { inicio: string; fim: string }>(
  eventos: T[],
  inicio: string,
  fim: string,
) {
  const ocupados: number[] = [];
  return eventos
    .filter((e) => sobrepoe(e.inicio, e.fim, inicio, fim))
    .sort(
      (a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim),
    )
    .map((e) => {
      const de = Math.max(0, diasEntre(inicio, e.inicio)),
        ate = Math.min(diasEntre(inicio, fim), diasEntre(inicio, e.fim));
      let linha = ocupados.findIndex((ultimo) => ultimo < de);
      if (linha < 0) linha = ocupados.length;
      ocupados[linha] = ate;
      return { e, de, ate, linha };
    });
}
export default function Calendario({
  referencia,
  visao,
  hoje,
  itens,
  oportunidades,
  dados,
  mostrarPromos,
  abrir,
  criar,
  oportunidade,
  promocao,
  filtrarCanal,
  sku,
  mover,
  ocupado,
}: {
  referencia: string;
  visao: string;
  hoje: string;
  itens: Item[];
  oportunidades: Oportunidade[];
  dados: Dados;
  mostrarPromos: boolean;
  abrir: (i: Item) => void;
  criar: (dia: string) => void;
  oportunidade: (o: Oportunidade) => void;
  promocao: (id: string) => void;
  filtrarCanal: string;
  sku: string;
  mover: (item: Item, data: string) => Promise<void>;
  ocupado: boolean;
}) {
  const [alvo, setAlvo] = useState<string | null>(null);
  function diaNoPonto(ev: DragEvent<HTMLDivElement>, comeco: string) {
    const r = ev.currentTarget.getBoundingClientRect();
    return somarDias(
      comeco,
      Math.max(
        0,
        Math.min(6, Math.floor((ev.clientX - r.left) / (r.width / 7))),
      ),
    );
  }
  const mes = referencia.slice(0, 7),
    primeiro = `${mes}-01`;
  const ultimo = new Date(
    Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0, 12),
  )
    .toISOString()
    .slice(0, 10);
  const inicio = visao === "Mês" ? segunda(primeiro) : segunda(referencia);
  const semanas =
    visao === "Mês" ? Math.ceil((diasEntre(inicio, ultimo) + 1) / 7) : 1;
  const eventos: Evento[] = itens.map((i) => ({
    id: i.id,
    titulo: i.titulo,
    inicio: i.inicio,
    fim: i.fim,
    cor: i.cor,
    categoria: "item",
    legenda: `${i.natureza === "campanha" ? "Campanha" : i.tipo} · ${i.status}`,
    clicar: () => abrir(i),
    item: i,
  }));
  oportunidades.forEach((o) =>
    eventos.push({
      id: o.id,
      titulo: o.nome,
      inicio: o.data,
      fim: o.data,
      cor: "var(--warn)",
      categoria: "data",
      legenda: "Data sazonal · clique para planejar",
      clicar: () => oportunidade(o),
    }),
  );
  if (mostrarPromos)
    dados.promocoes
      .filter(
        (p) =>
          p.ativa &&
          p.inicio &&
          p.fim &&
          (!filtrarCanal ||
            p.canal_id === filtrarCanal ||
            p.ofertas.some(
              (o) =>
                o.conta === filtrarCanal &&
                (!sku || o.sku.toLowerCase().includes(sku.toLowerCase())),
            )) &&
          (!sku ||
            p.ofertas.some((o) =>
              o.sku.toLowerCase().includes(sku.toLowerCase()),
            )),
      )
      .forEach((p) =>
        eventos.push({
          id: "promo-" + p.id,
          titulo: p.nome,
          inicio: p.inicio!,
          fim: p.fim!,
          cor: "var(--info)",
          categoria: "promo",
          legenda: "Promoção registrada · consulta",
          clicar: () => promocao(p.id),
        }),
      );
  function barra(e: Evento) {
    return (
      <button
        type="button"
        draggable={
          !!e.item &&
          e.item.natureza === "acao" &&
          visao !== "Por canal" &&
          !ocupado
        }
        onDragStart={(ev) => {
          if (e.item) {
            ev.dataTransfer.setData("application/x-planejamento", e.item.id);
            ev.dataTransfer.effectAllowed = "move";
          }
        }}
        onDragEnd={() => setAlvo(null)}
        className={`pl-event ${e.categoria} ${e.item?.status === "Cancelada" ? "cancelada" : ""}`}
        style={{
          borderColor: e.cor,
          ...(e.categoria === "item"
            ? { background: `color-mix(in srgb, ${e.cor} 14%, var(--panel))` }
            : {}),
        }}
        title={`${e.titulo} · ${e.legenda}`}
        onClick={e.clicar}
      >
        {e.categoria === "data" ? (
          <Sparkles size={11} />
        ) : e.categoria === "promo" ? (
          <Tag size={11} />
        ) : e.item?.natureza === "campanha" ? (
          <Flag size={11} />
        ) : (
          <span className="pl-dot" style={{ background: e.cor }} />
        )}
        <span>{e.titulo}</span>
        {visao !== "Mês" && <small>{e.legenda}</small>}
      </button>
    );
  }
  if (visao === "Por canal") {
    const linhas = [
      ...dados.canais.filter(
        (c) =>
          !filtrarCanal ||
          c.id === filtrarCanal ||
          dados.contas.some(
            (a) => a.id === filtrarCanal && a.canal_id === c.id,
          ),
      ),
      ...(!filtrarCanal
        ? [{ id: "sem", nome: "Institucional / sem canal" }]
        : []),
    ];
    return (
      <div className="pl-calendar-scroll">
        <div className="pl-channel-calendar">
          <div className="pl-channel-header">
            <strong>Canal de venda</strong>
            {Array.from({ length: 7 }, (_, n) => {
              const d = somarDias(inicio, n);
              return (
                <span key={d} className={d === hoje ? "today" : ""}>
                  {dataUTC(d).toLocaleDateString("pt-BR", {
                    timeZone: "UTC",
                    weekday: "short",
                    day: "2-digit",
                  })}
                </span>
              );
            })}
          </div>
          {linhas.map((c) => {
            const lista = eventos.filter((e) =>
              e.item
                ? c.id === "sem"
                  ? !e.item.canais.length && !e.item.contas.length
                  : e.item.canais.includes(c.id) ||
                    dados.contas.some(
                      (a) =>
                        a.canal_id === c.id && e.item!.contas.includes(a.id),
                    )
                : e.categoria === "promo" &&
                  dados.promocoes.some(
                    (p) => "promo-" + p.id === e.id && p.canal_id === c.id,
                  ),
            );
            const fs = faixas(lista, inicio, somarDias(inicio, 6));
            return (
              <div className="pl-channel-row" key={c.id}>
                <strong>
                  {c.nome}
                  <small>{fs.length} planejamentos / registros</small>
                </strong>
                <div
                  className="pl-channel-tracks"
                  style={{
                    minHeight: Math.max(
                      100,
                      (Math.max(-1, ...fs.map((f) => f.linha)) + 1) * 36 + 14,
                    ),
                  }}
                >
                  {fs.map(({ e, de, ate, linha }) => (
                    <div
                      key={e.id}
                      style={{
                        gridColumn: `${de + 1} / ${ate + 2}`,
                        gridRow: linha + 1,
                      }}
                    >
                      {barra(e)}
                    </div>
                  ))}
                  {!fs.length && (
                    <span className="pl-channel-empty">
                      Espaço para a próxima ideia
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="pl-calendar-help">
            Uma ação com vários canais aparece em cada linha. As datas sazonais
            ficam disponíveis na biblioteca.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="pl-calendar-scroll">
      <div className={`pl-calendar ${visao === "Semana" ? "weekly" : ""}`}>
        <div className="pl-weekdays">
          {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {Array.from({ length: semanas }, (_, w) => {
          const comeco = somarDias(inicio, w * 7),
            fim = somarDias(comeco, 6),
            fs = faixas(eventos, comeco, fim);
          return (
            <div
              className="pl-week"
              key={comeco}
              onDragOver={(ev) => {
                if (
                  !ocupado &&
                  ev.dataTransfer.types.includes("application/x-planejamento")
                ) {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                  setAlvo(diaNoPonto(ev, comeco));
                }
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                const item = itens.find(
                  (i) =>
                    i.id ===
                    ev.dataTransfer.getData("application/x-planejamento"),
                );
                const dia = diaNoPonto(ev, comeco);
                setAlvo(null);
                if (
                  item &&
                  item.natureza === "acao" &&
                  item.inicio !== dia &&
                  !ocupado
                )
                  void mover(item, dia);
              }}
            >
              <div className="pl-day-backgrounds">
                {Array.from({ length: 7 }, (_, n) => (
                  <div
                    key={n}
                    className={`${n > 4 ? "weekend" : ""} ${alvo === somarDias(comeco, n) ? "st-calendar-drop" : ""}`}
                  />
                ))}
              </div>
              {Array.from({ length: 7 }, (_, n) => {
                const d = somarDias(comeco, n);
                return (
                  <div
                    className={`pl-date ${d.slice(0, 7) !== mes && visao === "Mês" ? "outside" : ""}`}
                    style={{ gridColumn: n + 1, gridRow: 1 }}
                    key={d}
                  >
                    <button
                      type="button"
                      title={`Criar ação em ${d}`}
                      className={d === hoje ? "today" : ""}
                      onClick={() => criar(d)}
                    >
                      {Number(d.slice(8))}
                    </button>
                    <button
                      type="button"
                      className="pl-day-add"
                      aria-label={`Adicionar ação em ${d}`}
                      onClick={() => criar(d)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                );
              })}
              {fs.map(({ e, de, ate, linha }) => (
                <div
                  className="pl-event-cell"
                  key={e.id}
                  style={{
                    gridColumn: `${de + 1} / ${ate + 2}`,
                    gridRow: linha + 2,
                  }}
                >
                  {barra(e)}
                </div>
              ))}
              <div
                className="pl-week-space"
                style={{
                  gridColumn: "1 / -1",
                  gridRow: Math.max(2, ...fs.map((f) => f.linha + 3)),
                }}
              />
            </div>
          );
        })}
        <p className="pl-calendar-help">
          <Plus size={13} /> Clique em um dia para criar uma ação. Clique nos
          cartões para editar. Arraste uma ação para outro dia; sua duração é
          mantida.
        </p>
      </div>
    </div>
  );
}
