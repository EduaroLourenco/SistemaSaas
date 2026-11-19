export const demoJson = (dados: unknown, status = 200) => Response.json(dados, { status, headers: { "cache-control": "no-store", "x-gerizo-demo": "local" } });

export async function corpoDemo(req: Request): Promise<Record<string, unknown>> {
  if (["GET", "HEAD"].includes(req.method)) return {};
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    const resultado: Record<string, unknown> = {};
    for (const chave of new Set(form.keys())) {
      const valores = form.getAll(chave);
      resultado[chave] = valores.length === 1 ? valores[0] : valores;
    }
    return resultado;
  }
  try { const corpo = await req.json(); return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? corpo : {}; }
  catch { return {}; }
}
