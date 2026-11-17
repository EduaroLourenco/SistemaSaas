"use client";

import { useState } from "react";
import Planejamento from "@/app/planejamento/planejamento-cliente";
import { PLANEJAMENTO_FIXTURE, HOJE_ESTUDIO } from "./fixtures-estudio-financeiro";

/** Exercício isolado de estado React. Não autentica nem troca uma empresa real. */
export function QaEstudioIsolamento() {
  const [segunda, setSegunda] = useState(false);
  const nome = segunda ? "Fixture B" : "Fixture A";
  const operacao = segunda ? "fixture-operacao-b" : "fixture-operacao-a";
  const dados = {
    ...PLANEJAMENTO_FIXTURE,
    operacao,
    empresa: nome,
    itens: PLANEJAMENTO_FIXTURE.itens.map(item => ({ ...item, operacao_id: operacao, titulo: `${nome} · ${item.titulo}` })),
  };
  return <><div className="px-4 py-3 text-[14px]"><span>Teste local de estado · </span><button type="button" className="min-h-11 rounded-r1 border border-line-2 px-3" onClick={() => setSegunda(v => !v)}>Alternar operação sintética</button></div><Planejamento key={dados.operacao} dados={dados} hoje={HOJE_ESTUDIO} /></>;
}
