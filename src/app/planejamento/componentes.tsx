"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Search, Check, Package, ExternalLink, Plus } from "lucide-react";
import {
  type Produto,
  type Item,
  type Dados,
  type Promocao,
  formatarData,
  sobrepoe,
} from "@/lib/planejamento/modelo";

export function Painel({
  titulo,
  subtitulo,
  fechar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  fechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = anterior;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="pl-drawer"
      aria-label={titulo}
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
    >
      <header className="pl-drawer-head">
        <div>
          <p className="pl-eyebrow">PLANEJAMENTO</p>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <button
          type="button"
          className="pl-icon"
          onClick={fechar}
          aria-label="Fechar painel"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Campo({
  nome,
  children,
}: {
  nome: string;
  children: ReactNode;
}) {
  return (
    <label className="pl-field">
      <span>{nome}</span>
      {children}
    </label>
  );
}
export function Produtos({
  catalogo,
  selecionados,
  mudar,
}: {
  catalogo: Produto[];
  selecionados: string[];
  mudar: (s: string[]) => void;
}) {
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(40);
  const [curva, setCurva] = useState<"" | "A" | "B" | "C">("");
  const [comEstoque, setComEstoque] = useState(false);
  const [ordem, setOrdem] = useState<"receita" | "nome" | "preco">("receita");
  /*
   * Curva, estoque e ordem: escolher "os curva A com estoque" para uma
   * campanha era rolar a lista inteira lendo nome por nome.
   */
  const encontrados = catalogo
    .filter((p) =>
      `${p.sku} ${p.titulo}`
        .toLocaleLowerCase()
        .includes(busca.toLocaleLowerCase()),
    )
    .filter((p) => !curva || p.curva === curva)
    .filter((p) => !comEstoque || (p.estoque ?? 0) > 0)
    .sort((a, b) =>
      ordem === "nome"
        ? a.titulo.localeCompare(b.titulo, "pt-BR")
        : ordem === "preco"
          ? (b.preco ?? 0) - (a.preco ?? 0)
          : (b.receita90 ?? 0) - (a.receita90 ?? 0),
    );
  const temDados = catalogo.some((p) => p.receita90 !== undefined);
  function toggle(sku: string) {
    mudar(
      selecionados.includes(sku)
        ? selecionados.filter((s) => s !== sku)
        : [...selecionados, sku],
    );
  }
  return (
    <div className="pl-products">
      <div className="pl-search">
        <Search size={16} />
        <input
          aria-label="Buscar produto por nome ou SKU"
          placeholder="Buscar por nome ou SKU…"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(40);
          }}
        />
      </div>
      {temDados && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {(["", "A", "B", "C"] as const).map((c) => (
            <button
              type="button"
              key={c || "todas"}
              className={`pl-chip${curva === c ? " selected" : ""}`}
              onClick={() => { setCurva(c); setLimite(40); }}
            >
              {c ? `Curva ${c}` : "Todas as curvas"}
            </button>
          ))}
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={comEstoque} onChange={(e) => setComEstoque(e.target.checked)} />
            com estoque
          </label>
          <select
            aria-label="Ordenar"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as typeof ordem)}
            className="h-8 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2"
          >
            <option value="receita">Maior receita (90 dias)</option>
            <option value="preco">Maior preço</option>
            <option value="nome">Nome</option>
          </select>
          {encontrados.length > 0 && (
            <button
              type="button"
              className="pl-chip"
              onClick={() => mudar([...new Set([...selecionados, ...encontrados.map((p) => p.sku)])])}
            >
              <Plus size={13} /> Selecionar os {encontrados.length} filtrados
            </button>
          )}
        </div>
      )}
      <div className="pl-products-summary">
        <span>{selecionados.length} produtos selecionados</span>
        {selecionados.length > 0 && (
          <button type="button" onClick={() => mudar([])}>
            Limpar seleção
          </button>
        )}
      </div>
      {selecionados.length > 0 && (
        <div className="pl-chips">
          {selecionados.map((s) => (
            <button
              type="button"
              className="pl-chip selected"
              key={s}
              onClick={() => toggle(s)}
              aria-label={`Remover ${s}`}
            >
              {s}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="pl-product-list">
        {encontrados.slice(0, limite).map((p) => (
          <label key={p.sku} className="pl-product">
            <input
              type="checkbox"
              checked={selecionados.includes(p.sku)}
              onChange={() => toggle(p.sku)}
            />
            <Package size={17} />
            <span>
              <strong>{p.titulo}</strong>
              <small>
                {p.sku}
                {p.origem === "anuncio" ? " · SKU do anúncio" : ""}
                {p.curva ? ` · curva ${p.curva}` : ""}
                {p.receita90 ? ` · ${p.receita90.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} em 90 dias` : ""}
                {p.preco != null
                  ? ` · ${p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${p.precoOrigem === "vendido" ? " (último vendido)" : " agora"}`
                  : ""}
                {p.estoque != null ? ` · estoque ${p.estoque}` : ""}
                {p.temCusto === false ? " · sem custo" : ""}
              </small>
            </span>
          </label>
        ))}
        {!encontrados.length && (
          <p className="pl-muted pl-padding">
            {catalogo.length
              ? "Nenhum produto encontrado."
              : "Seu catálogo ainda não tem produtos com SKU. Você pode planejar sem produtos."}
          </p>
        )}
        {encontrados.length > limite && (
          <button
            type="button"
            className="pl-btn"
            onClick={() => setLimite((l) => l + 40)}
          >
            Mostrar mais produtos ({encontrados.length - limite})
          </button>
        )}
      </div>
    </div>
  );
}
export function nomeCanais(item: Item, dados: Dados): string {
  const nomes = [
    ...dados.canais
      .filter((c) => item.canais.includes(c.id))
      .map((c) => c.nome),
    ...dados.contas
      .filter((c) => item.contas.includes(c.id))
      .map((c) => c.nome),
  ];
  return nomes.length ? nomes.join(" · ") : "Sem canal definido";
}
export function ContextoPromocoes({
  item,
  dados,
}: {
  item: Item;
  dados: Dados;
}) {
  const lista = dados.promocoes.filter((p) => {
    if (
      !p.ativa ||
      !p.inicio ||
      !p.fim ||
      !sobrepoe(item.inicio, item.fim, p.inicio, p.fim)
    )
      return false;
    if (item.canais.length || item.contas.length) {
      if (
        !item.canais.includes(p.canal_id) &&
        !p.ofertas.some((o) => item.contas.includes(o.conta))
      )
        return false;
    }
    return (
      item.skus.length > 0 &&
      p.ofertas.some(
        (o) =>
          item.skus.some((s) => s.toUpperCase() === o.sku.toUpperCase()) &&
          ((!item.canais.length && !item.contas.length) ||
            item.canais.includes(p.canal_id) ||
            item.contas.includes(o.conta)),
      )
    );
  });
  return (
    <section className="pl-context">
      <h3>O que já está registrado</h3>
      <p>
        Promoções relacionadas aos produtos e ao período. Consulta apenas;
        salvar o planejamento não altera ofertas.
      </p>
      {!item.skus.length ? (
        <p className="pl-muted">
          Selecione produtos para consultar suas promoções.
        </p>
      ) : !lista.length ? (
        <p className="pl-muted">
          Nenhuma promoção com período conhecido encontrada para esta seleção.
          Isso não confirma ausência de ofertas no canal.
        </p>
      ) : (
        lista.map((p) => (
          <ResumoPromocao
            key={p.id}
            promocao={p}
            dados={dados}
            skus={item.skus}
            contas={item.canais.includes(p.canal_id) ? [] : item.contas}
          />
        ))
      )}
      <a
        className="pl-link"
        href="/promocoes/campanhas"
        target="_blank"
        rel="noreferrer"
      >
        Abrir Central de Promoções <ExternalLink size={13} />
      </a>
    </section>
  );
}
export function ResumoPromocao({
  promocao: p,
  dados,
  skus = [],
  contas = [],
}: {
  promocao: Promocao;
  dados: Dados;
  skus?: string[];
  contas?: string[];
}) {
  const ofertas = p.ofertas.filter(
    (o) =>
      (!skus.length ||
        skus.some((s) => s.toUpperCase() === o.sku.toUpperCase())) &&
      (!contas.length || contas.includes(o.conta)),
  );
  return (
    <article className="pl-promo">
      <strong>{p.nome}</strong>
      <small>
        {dados.canais.find((c) => c.id === p.canal_id)?.nome} ·{" "}
        {p.inicio ? formatarData(p.inicio) : "Início não informado"} →{" "}
        {p.fim ? formatarData(p.fim) : "Fim não informado"}
      </small>
      {ofertas.slice(0, 12).map((o, i) => (
        <p key={o.anuncio + i}>
          {o.sku || "SKU não vinculado"} ·{" "}
          {dados.contas.find((c) => c.id === o.conta)?.nome} · {o.anuncio}
          <br />
          <b>
            {o.preco == null
              ? "Preço não informado"
              : o.preco.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
          </b>{" "}
          <span>· {o.decisao}</span>
        </p>
      ))}
      {ofertas.length > 12 && (
        <small>
          Mais {ofertas.length - 12} ofertas na Central de Promoções.
        </small>
      )}
      <small>
        Registro atualizado em{" "}
        {new Date(p.atualizado_em).toLocaleDateString("pt-BR")}. A aprovação
        interna não confirma publicação no canal.
      </small>
    </article>
  );
}
export function Progresso({ item }: { item: Item }) {
  const total = item.detalhes.checklist.length,
    feitos = item.detalhes.checklist.filter((c) => c.feito).length;
  return total ? (
    <span className="pl-progress">
      <Check size={12} />
      {feitos}/{total} preparativos
    </span>
  ) : null;
}
