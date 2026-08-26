/**
 * Guarda temporária dos arquivos gerados.
 *
 * Enquanto o Supabase Storage não está ligado, o .zip do processamento fica
 * em memória por 15 minutos, só até o usuário clicar em baixar. É deliberado
 * e provisório: no momento em que a rota passar a subir para o bucket
 * `exportacoes`, este arquivo inteiro sai do projeto.
 *
 * Limitação conhecida: memória do processo não sobrevive a restart nem é
 * compartilhada entre instâncias. Para um único servidor de desenvolvimento
 * resolve; em produção com mais de uma instância, não.
 */

type Pacote = { buffer: Buffer; criadoEm: number };

const VALIDADE_MS = 15 * 60 * 1000;
const TETO = 20;

// Sobrevive ao hot reload do Next em desenvolvimento.
const g = globalThis as unknown as { __pacotes?: Map<string, Pacote> };
const pacotes: Map<string, Pacote> = g.__pacotes ?? new Map();
g.__pacotes = pacotes;

function limpar() {
  const agora = Date.now();
  for (const [id, p] of pacotes) {
    if (agora - p.criadoEm > VALIDADE_MS) pacotes.delete(id);
  }
  // Teto de segurança: se algo escapar da validade, o mais antigo sai.
  while (pacotes.size > TETO) {
    const maisAntigo = [...pacotes.entries()].sort(
      (a, b) => a[1].criadoEm - b[1].criadoEm
    )[0];
    if (!maisAntigo) break;
    pacotes.delete(maisAntigo[0]);
  }
}

export function guardarPacote(buffer: Buffer): string {
  limpar();
  const id = `pac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  pacotes.set(id, { buffer, criadoEm: Date.now() });
  return id;
}

export function pegarPacote(id: string): Buffer | null {
  limpar();
  return pacotes.get(id)?.buffer ?? null;
}
