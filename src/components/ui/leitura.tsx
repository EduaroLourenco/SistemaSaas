import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Info, AlertTriangle, RefreshCw } from "lucide-react";

/**
 * A frase que o sistema deve à pessoa que olha.
 *
 * Um gráfico mostra o que aconteceu; a leitura diz o que aquilo significa.
 * Sem ela, o trabalho de interpretar sobra para quem abriu a tela — e é
 * exatamente esse trabalho que o sistema deveria estar fazendo.
 *
 * Regras que valem para toda leitura escrita neste sistema:
 *
 *  - afirme, não descreva. "A conversão caiu porque o preço subiu 8%"
 *    vale mais que "a conversão caiu e o preço subiu";
 *  - diga o tamanho. "Caiu" sem número não é leitura, é impressão;
 *  - admita quando não sabe. Leitura inventada é pior que nenhuma,
 *    porque a próxima verdadeira já não é acreditada.
 */
export function Leitura({
  children,
  tom = "neutro",
  titulo = "Leitura",
  className,
}: {
  children: React.ReactNode;
  tom?: "neutro" | "bom" | "atencao";
  titulo?: string;
  className?: string;
}) {
  const Icone = tom === "bom" ? Check : tom === "atencao" ? AlertTriangle : Info;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 rounded-r1 border",
        tom === "bom" && "bg-up-wash border-up/20",
        tom === "atencao" && "bg-warn-wash border-warn/25",
        tom === "neutro" && "bg-panel-2 border-line",
        className
      )}
    >
      <Icone
        className={cn(
          "w-3.5 h-3.5 mt-[1px] shrink-0",
          tom === "bom" && "text-up",
          tom === "atencao" && "text-warn",
          tom === "neutro" && "text-ink-3"
        )}
        strokeWidth={2.25}
      />
      <p className="text-[12.5px] text-ink-2 leading-relaxed min-w-0">
        <span className="font-semibold text-ink">{titulo}: </span>
        {children}
      </p>
    </div>
  );
}

/**
 * O estado calmo.
 *
 * Quando não há nada errado, a tela precisa DIZER isso. Sem este estado,
 * um dia tranquilo se parece com um dia ruim — ambos cheios de painel — e
 * a pessoa acaba auditando tudo toda manhã porque nunca sabe se já pode
 * parar de procurar.
 *
 * Dizer "não há nada aqui" é uma resposta, e boa.
 */
export function TudoCerto({
  titulo = "Nada exige sua atenção",
  detalhe,
  acao,
}: {
  titulo?: string;
  detalhe?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      <div className="w-9 h-9 rounded-full bg-up-wash border border-up/20 flex items-center justify-center mb-2.5">
        <Check className="w-4.5 h-4.5 text-up" strokeWidth={2.5} />
      </div>
      <p className="text-[13px] font-semibold text-ink">{titulo}</p>
      {detalhe && (
        <p className="text-[12px] text-ink-3 mt-1 max-w-sm leading-relaxed">
          {detalhe}
        </p>
      )}
      {acao && <div className="mt-3.5">{acao}</div>}
    </div>
  );
}

/**
 * Erro que diz o próximo passo.
 *
 * Mensagem técnica sozinha transfere o problema para quem não pode
 * resolvê-lo. Três coisas fazem um erro útil: o que falhou, se é
 * passageiro, e o que fazer agora. O texto cru fica disponível, mas
 * recolhido — serve para quem vai investigar, não para quem só queria
 * ver a tela.
 */
export function ErroComSaida({
  titulo,
  causa,
  passo,
  detalheTecnico,
  onTentarDeNovo,
}: {
  titulo: string;
  causa?: string;
  passo: string;
  detalheTecnico?: string;
  onTentarDeNovo?: () => void;
}) {
  const [aberto, setAberto] = React.useState(false);

  return (
    <div className="rounded-r2 border border-down/25 bg-down-wash px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          className="w-4 h-4 text-down mt-[1px] shrink-0"
          strokeWidth={2.25}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">{titulo}</p>
          {causa && (
            <p className="text-[12px] text-ink-2 mt-0.5 leading-relaxed">
              {causa}
            </p>
          )}
          <p className="text-[12.5px] text-ink mt-2 leading-relaxed">
            <span className="font-semibold">O que fazer: </span>
            {passo}
          </p>

          <div className="flex items-center gap-3 mt-2.5">
            {onTentarDeNovo && (
              <button
                onClick={onTentarDeNovo}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink hover:text-brand"
              >
                <RefreshCw className="w-3 h-3" strokeWidth={2.25} />
                Tentar de novo
              </button>
            )}
            {detalheTecnico && (
              <button
                onClick={() => setAberto((v) => !v)}
                className="text-[12px] text-ink-3 hover:text-ink-2 underline underline-offset-2"
              >
                {aberto ? "Ocultar detalhe técnico" : "Ver detalhe técnico"}
              </button>
            )}
          </div>

          {aberto && detalheTecnico && (
            <pre className="num text-[11px] text-ink-2 bg-panel border border-line rounded-r1 px-2.5 py-2 mt-2.5 overflow-x-auto whitespace-pre-wrap">
              {detalheTecnico}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
