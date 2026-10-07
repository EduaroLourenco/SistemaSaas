"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A faixa de filtros — uma só, no mesmo lugar, em toda tela.
 *
 * ── O problema que ela resolve ──
 *
 * A plataforma tinha DOIS padrões de filtro convivendo. Metade das telas
 * punha os controles na faixa do cabeçalho (`PageHeader filters`), sem
 * rótulo, colados uns nos outros. A outra metade abria o corpo com um
 * `<Panel className="p-3 mb-3">` cheio de `<Field>` rotulado.
 *
 * O resultado: o mesmo controle — "Canal" — aparecia em dois lugares
 * diferentes conforme a tela. Quem vem de Vendas · Dia e entra em
 * Financeiro procura o seletor onde ele estava e não acha. Isso não é
 * detalhe de estilo; é o usuário perdendo o fio a cada navegação.
 *
 * ── A escolha ──
 *
 * Venceu a faixa do cabeçalho, por três razões:
 *
 *   1. Filtro não é conteúdo. Ocupar a primeira dobra do corpo com
 *      controles empurra a resposta da tela para baixo.
 *   2. Ela já é fixa em relação ao corpo que rola.
 *   3. Sendo mais apertada, obriga a escolher: uma tela que não cabe na
 *      faixa provavelmente tem filtro demais.
 *
 * Mas o rótulo do padrão do corpo era melhor — um `<select>` mudo
 * dizendo "90 dias" não conta se é período de análise ou de comparação.
 * Então a faixa ganhou rótulo em cima, miúdo, sem custar altura.
 *
 * ── Uso ──
 *
 *   <PageHeader
 *     title="Financeiro"
 *     filters={
 *       <BarraFiltros>
 *         <Filtro rotulo="Período">…</Filtro>
 *         <Filtro rotulo="Canal">…</Filtro>
 *         <FiltroAcoes>…</FiltroAcoes>
 *       </BarraFiltros>
 *     }
 *   />
 */

export function BarraFiltros({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("gerizo-filter-bar flex items-end gap-3 flex-wrap w-full", className)}>
      {children}
    </div>
  );
}

/**
 * Um filtro rotulado.
 *
 * O rótulo fica acima em 10px maiúsculo — legível de relance, e some do
 * caminho quando você já sabe o que é. `<label>` de verdade, então clicar
 * no texto foca o controle.
 */
export function Filtro({
  rotulo,
  children,
  className,
  composto,
}: {
  rotulo: string;
  children: React.ReactNode;
  className?: string;
  /*
   * Controle composto (menu que abre por cima, com caixas de marcar
   * próprias): vira <div> sem rolagem. Com <label>, os rótulos do menu
   * ficariam dentro de outro rótulo — HTML inválido, e o clique no menu
   * acionaria o botão de abrir —, e a rolagem lateral cortaria o menu.
   */
  composto?: boolean;
}) {
  if (composto) {
    return (
      <div role="group" aria-label={rotulo} className={cn("flex flex-col gap-1 min-w-0 max-w-full shrink-0", className)}>
        <span className="text-[12px] font-semibold tracking-normal text-ink-3 leading-none">{rotulo}</span>
        {children}
      </div>
    );
  }
  return (
    /*
     * `max-w-full` + rolagem própria no conteúdo: com `shrink-0` sozinho, um
     * filtro largo (as pílulas de conta da Análise de anúncios, as métricas
     * do Semanal) passava da largura do celular e a PÁGINA inteira rolava
     * para o lado. Agora só o filtro rola, dentro dele.
     */
    <label className={cn("flex flex-col gap-1 min-w-0 max-w-full shrink-0", className)}>
      <span className="text-[12px] font-semibold tracking-normal text-ink-3 leading-none">
        {rotulo}
      </span>
      <div className="max-w-full overflow-x-auto">{children}</div>
    </label>
  );
}

/**
 * O bloco de ações no fim da faixa — exportar, atualizar, aplicar.
 *
 * Empurrado para a direita com `ml-auto`, e alinhado pela base junto dos
 * filtros. Separado do `actions` do PageHeader de propósito: ação que
 * depende do filtro atual (exportar ESTE recorte) pertence à faixa; ação
 * da tela inteira (importar, configurar) pertence ao cabeçalho.
 */
export function FiltroAcoes({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // `ml-auto` só a partir de `sm`. No celular a faixa já empilhou, e
        // empurrar as ações para a direita deixava um vão à esquerda com o
        // botão principal encostado na borda.
        "flex items-center gap-2 shrink-0 sm:ml-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Divisor entre grupos de filtro.
 *
 * Para quando a faixa tem recorte (período, canal) e refino (busca, tipo)
 * ao mesmo tempo: sem separação, os seis viram uma fileira indistinta.
 */
export function FiltroDivisor() {
  // Some no celular: com a faixa empilhada, um traço vertical entre duas
  // linhas não separa nada — só aparece solto no meio do caminho.
  return <span aria-hidden className="hidden sm:block w-px h-7 bg-line shrink-0" />;
}
