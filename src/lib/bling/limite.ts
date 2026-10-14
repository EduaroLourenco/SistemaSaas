/** O limite do Bling é por conta, compartilhado por todos os seus recursos.
 * Esta fila coordena chamadas na mesma instância. Outras instâncias e outros
 * aplicativos da conta podem consumir a cota: por isso o 429 também é tratado.
 * https://developer.bling.com.br/limites
 */
const INTERVALO = 450;
const MAX_REPETICOES = 4;
const ORCAMENTO_ESPERA = 45_000;

type Fila = {
  cauda: Promise<void>;
  pendentes: number;
  proxima: number;
  pausaAte: number;
  diario: boolean;
};

/** Retry-After pode ser segundos ou uma data HTTP. Nunca encurtar a pausa. */
export function esperaPedida(headers: Headers, agora: number): number | null {
  const valor = headers.get("retry-after")?.trim();
  if (!valor) return null;
  if (/^\d+$/.test(valor)) {
    const ms = Number(valor) * 1000;
    return Number.isFinite(ms) ? ms : null;
  }
  const data = Date.parse(valor);
  if (!Number.isFinite(data)) return null;
  const servidor = Date.parse(headers.get("date") ?? "");
  return Math.max(0, data - (Number.isFinite(servidor) ? servidor : agora));
}

function erroLimite(caminho: string, espera: number, diario: boolean) {
  return new Error(diario
    ? `O Bling atingiu o limite diário de consultas (429 em ${caminho}). Esta leitura ficou pendente. Tente novamente quando a cota do Bling estiver disponível.`
    : `O Bling ainda está limitando as consultas (429 em ${caminho}). Esta leitura ficou pendente. Aguarde pelo menos ${Math.max(1, Math.ceil(espera / 1000))} segundos e clique em Atualizar agora.`);
}

/** Preparar roda dentro da fila: duas chamadas não renovam o mesmo token juntas. */
export function criarLeitorBling({
  agora = () => Date.now(),
  dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  aleatorio = () => Math.random(),
} = {}) {
  const filas = new Map<string, Fila>();
  return function ler(
    conta: string,
    caminho: string,
    preparar: () => Promise<() => Promise<Response>>,
  ): Promise<Response> {
    for (const [id, f] of filas) {
      if (!f.pendentes && Math.max(f.proxima, f.pausaAte) <= agora()) filas.delete(id);
    }
    let fila = filas.get(conta);
    if (!fila) {
      fila = { cauda: Promise.resolve(), pendentes: 0, proxima: 0, pausaAte: 0, diario: false };
      filas.set(conta, fila);
    }
    const estado = fila;
    estado.pendentes++;
    const executar = estado.cauda.then(async () => {
      const inicio = agora();
      if (estado.pausaAte - inicio > ORCAMENTO_ESPERA) {
        throw erroLimite(caminho, estado.pausaAte - inicio, estado.diario);
      }
      const enviar = await preparar();
      for (let tentativa = 0; ; tentativa++) {
        const espera = Math.max(0, estado.proxima - agora(), estado.pausaAte - agora());
        if (agora() - inicio + espera > ORCAMENTO_ESPERA) {
          throw erroLimite(caminho, espera, estado.diario);
        }
        if (espera) await dormir(espera);
        estado.proxima = agora() + INTERVALO;
        const resposta = await enviar();
        if (resposta.status !== 429) return resposta;

        const corpo = await resposta.json().catch(() => null);
        const descricao = [corpo?.error?.type, corpo?.error?.message, corpo?.error?.description]
          .filter((v): v is string => typeof v === "string").join(" ");
        estado.diario = /di[aá]ri[oa]s?|por dia|daily|per day/i.test(descricao);
        const pausa = Math.max(
          esperaPedida(resposta.headers, agora()) ?? 0,
          estado.diario ? 60_000 : 2000 * 2 ** tentativa + Math.floor(aleatorio() * 500),
        );
        estado.pausaAte = agora() + pausa;
        // A pausa fica na conta, incluindo chamadas que já esperam na fila.
        // Limite diário e pausas longas não viram uma sequência de novas tentativas.
        if (estado.diario || tentativa >= MAX_REPETICOES || agora() - inicio + pausa > ORCAMENTO_ESPERA) {
          throw erroLimite(caminho, pausa, estado.diario);
        }
      }
    });
    estado.cauda = executar.then(() => undefined, () => undefined);
    return executar.finally(() => { estado.pendentes--; });
  };
}
