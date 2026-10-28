import { carregarRegras } from "@/lib/dados/regras-promocao";
import { carregarCobertura } from "@/lib/dados/cobertura-regras";
import { carregarCanais } from "@/lib/dados/canais";
import RegrasCliente from "./regras-cliente";

export const dynamic = "force-dynamic";

export default async function Pagina() {
  const [{ regras, faltaMigracao }, cobertura, { contas }] = await Promise.all([
    carregarRegras(),
    carregarCobertura(),
    carregarCanais(),
  ]);
  return (
    <RegrasCliente
      regras={regras}
      faltaMigracao={faltaMigracao}
      cobertura={cobertura}
      contas={contas
        .filter((c) => c.canalCodigo === "mercado_livre" && c.ativa)
        .map((c) => ({ id: c.id, nome: c.nome }))}
    />
  );
}
