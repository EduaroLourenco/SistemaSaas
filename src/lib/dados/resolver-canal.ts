/**
 * Casamento entre o que o arquivo escreve e o canal cadastrado.
 *
 * Fica separado de `importar.ts` porque é lógica pura — sem banco, sem
 * `server-only` — e porque é a parte que mais precisa de teste. Errar
 * aqui grava venda na conta errada, e o total continua batendo: o erro
 * só aparece quando alguém compara conta a conta com o painel do canal,
 * meses depois.
 */

export type LinhaCanal = {
  canal_id: string;
  canal_codigo: string;
  canal_nome: string;
  canal_apelidos: string[];
  conta_id: string;
  conta_nome: string;
  conta_apelidos: string[];
  padrao: boolean;
};

export type Resolucao = {
  canalId: string;
  contaCanalId: string;
  canal: string;
  conta: string;
};

/**
 * Sem acento, sem caixa, sem espaço sobrando.
 *
 * O hub escreveu "COLCHÕES PROBEL" num pedido e "COLCHOES_PROBEL_SP" em
 * outro. Exigir acentuação idêntica obrigaria a cadastrar cada variação
 * à mão, e a que faltasse viraria pedido recusado sem motivo claro.
 *
 * O intervalo U+0300 a U+036F é o dos diacríticos combinantes, que é o
 * que a decomposição NFD separa das letras. Escrito em escape, e não com
 * os caracteres literais: eles são invisíveis no editor e somem numa
 * conversão de codificação sem ninguém perceber.
 */
export function normalizar(t: string): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Acha canal e conta. Devolve `null` quando não tem certeza.
 *
 * O `null` é o ponto do arquivo. Cair na conta padrão quando o nome não
 * casa seria conveniente e errado — e errado de um jeito que não dá
 * alarme nenhum.
 */
export function resolver(
  linhas: LinhaCanal[],
  marketplace: string,
  conta: string
): Resolucao | null {
  const m = normalizar(marketplace);
  const k = normalizar(conta);
  if (!m) return null;

  const doCanal = linhas.filter(
    (l) =>
      normalizar(l.canal_nome) === m ||
      normalizar(l.canal_codigo) === m ||
      l.canal_apelidos.some((a) => normalizar(a) === m)
  );
  if (!doCanal.length) return null;

  const monta = (l: LinhaCanal): Resolucao => ({
    canalId: l.canal_id,
    contaCanalId: l.conta_id,
    canal: l.canal_nome,
    conta: l.conta_nome,
  });

  // Canal com uma conta só: o que o arquivo chamou de conta é irrelevante.
  if (doCanal.length === 1) return monta(doCanal[0]);

  const porApelido = doCanal.find((l) =>
    l.conta_apelidos.some((a) => normalizar(a) === k)
  );
  if (porApelido) return monta(porApelido);

  const porNome = doCanal.find((l) => normalizar(l.conta_nome) === k);
  if (porNome) return monta(porNome);

  return null;
}
