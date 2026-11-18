import type { DadosEnvios, EnvioMeli } from "@/lib/dados/envios-meli";

// Somente fixtures: os IDs não representam pedidos nem contas reais.
export const CONTA_DOCUMENTOS_A = "Loja de demonstração · conta A";
export const CONTA_DOCUMENTOS_B = "Loja de demonstração · conta B";

const envio = (i: number, extra: Partial<EnvioMeli> = {}): EnvioMeli => ({
  conta: CONTA_DOCUMENTOS_A,
  contaId: "fixture-documentos-a",
  envio: 900001 + i,
  substatus: "ready_to_print",
  pedido: 910001 + i,
  compra: "2026-11-16T10:00:00-03:00",
  limite: "2026-11-17T16:00:00-03:00",
  origem: "canal",
  dias: 0,
  situacao: "Etiqueta para imprimir",
  comprador: "Pessoa de demonstração",
  itens: [{ titulo: "Produto de demonstração com descrição completa para conferir a separação e a leitura em celular estreito", sku: `DEMO-DOC-${i + 1}`, quantidade: i === 0 ? 2 : 1 }],
  total: 59.9,
  ...extra,
});

const base: Omit<DadosEnvios, "envios"> = {
  hoje: "2026-11-17",
  geradoEm: "2026-11-17T14:00:00-03:00",
  contas: [CONTA_DOCUMENTOS_A, CONTA_DOCUMENTOS_B],
  falhas: [],
};

export const documentos: DadosEnvios = {
  ...base,
  envios: [
    envio(0),
    envio(1, { substatus: "printed", situacao: "Etiqueta impressa" }),
    envio(2, { substatus: "invoice_pending", situacao: "Falta emitir a nota" }),
    envio(3, { conta: CONTA_DOCUMENTOS_B, contaId: "fixture-documentos-b" }),
    envio(4, { contaId: undefined, envio: undefined, substatus: undefined, situacao: "Retrato anterior à coleta dos documentos" }),
  ],
};

export const documentosLimite: DadosEnvios = {
  ...base,
  envios: Array.from({ length: 102 }, (_, i) => envio(i)),
};

export const documentosLegado: DadosEnvios = {
  ...base,
  contas: [CONTA_DOCUMENTOS_A],
  envios: [envio(4, { contaId: undefined, envio: undefined, substatus: undefined })],
};
