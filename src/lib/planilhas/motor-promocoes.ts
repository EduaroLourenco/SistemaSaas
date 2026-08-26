/* eslint-disable */

// Util functions for math
export function roundup(x: number, d: number = 0): number {
  const m = Math.pow(10, d);
  const v = x * m;
  if (v > 0) {
    return Math.ceil(v - 1e-9) / m;
  } else {
    return -Math.ceil(-v - 1e-9) / m;
  }
}

export function norm(s: any): string {
  if (s == null) return "";
  return String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Interfaces
export interface BaseMLBEntry {
  tipo: string;
  padrao: number;
}

export interface FormulaBaseData {
  baseMlb: Map<string, BaseMLBEntry>;
  precosSKU: Map<string, Record<number, number>>;
  precosMLB: Map<string, Record<number, number>>;
}

export function getPrecoTabela(data: FormulaBaseData, sku: string, mlb: string, comissao: number): number | null {
  const k = Math.round(comissao * 1000) / 1000;
  
  if (data.precosSKU.has(sku)) {
    const row = data.precosSKU.get(sku)!;
    if (row[k] !== undefined) return row[k];
  }
  
  if (data.precosMLB.has(mlb)) {
    const row = data.precosMLB.get(mlb)!;
    if (row[k] !== undefined) return row[k];
  }
  
  return null;
}

export function processItem(
  mlb: string, 
  sku: string, 
  saleFee: number | null, 
  finalPrice: number | null, 
  originalPrice: number | null,
  data: FormulaBaseData,
  positiveAction: string = "Participar",
  negativeAction: string = "Não participar",
  extraDiscount: number = 0
) {
  // Caso A: Com Redução de Tarifa
  if (saleFee !== null && saleFee > 0) {
    if (!finalPrice) return { action: negativeAction, pendencia: "redução ou preço final ausente", newPrice: null };
    
    const entry = data.baseMlb.get(mlb);
    if (!entry || !entry.padrao) return { action: negativeAction, pendencia: "MLB não está na aba Base MLB", newPrice: null };
    
    const reduzida = saleFee / finalPrice;
    const considerar = Math.max(Math.round(((roundup((entry.padrao - reduzida) * 100) + 0.5) / 100) * 10000) / 10000, 0.045);
    
    const tabela = getPrecoTabela(data, sku, mlb, considerar);
    if (tabela === null) return { action: negativeAction, pendencia: `sem preço de tabela para a comissão ${(considerar*100).toFixed(1)}%`, newPrice: null };
    
    const aprovado = (tabela - finalPrice) < 0 || finalPrice >= (tabela * 0.95);
    return { 
      action: aprovado ? positiveAction : negativeAction, 
      pendencia: "", 
      newPrice: null, // Caso A não altera preço
      tabelaCalculada: tabela
    };
  } 
  // Caso B: Sem Redução de Tarifa
  else {
    const entry = data.baseMlb.get(mlb);
    if (!entry || !entry.tipo) return { action: negativeAction, pendencia: "MLB não está na aba Base MLB", newPrice: null };
    
    const comissao = norm(entry.tipo).startsWith("cl") ? 0.115 : 0.165;
    let p = getPrecoTabela(data, sku, mlb, comissao);
    
    if (p === null) return { action: negativeAction, pendencia: "sem preço de tabela", newPrice: null };
    
    if (extraDiscount > 0) {
      p = p * (1 - extraDiscount);
    }
    
    const newPrice = Math.round((p + 1e-9) * 100) / 100;

    // Preço de tabela ACIMA do preço já publicado: participar exigiria
    // AUMENTAR o preço, e promoção é desconto. O canal recusa qualquer
    // desconto abaixo de 5%, então mandar "participar" só gera erro no
    // retorno. Recusa aqui e não toca no preço — o item vai para a lista
    // de revisão com a tag correspondente.
    if (originalPrice && newPrice > originalPrice) {
      return {
        action: negativeAction,
        pendencia: "Preço de tabela acima do preço publicado — sem espaço para desconto",
        newPrice: null,
        tabelaCalculada: p,
      };
    }

    return {
      action: positiveAction,
      pendencia: "",
      newPrice,
      tabelaCalculada: p
    };
  }
}
