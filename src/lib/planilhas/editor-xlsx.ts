/* eslint-disable */
import JSZip from "jszip";

export async function surgicallyEditExcel(
  originalBuffer: Buffer,
  worksheetName: string,
  updates: { rowIndex: number, colLetter: string, value: string | number }[]
): Promise<Buffer> {
  const zip = new JSZip();
  await zip.loadAsync(originalBuffer);

  // 1. Achar o r:id da aba pelo nome no workbook.xml
  const workbookXmlStr = await zip.file("xl/workbook.xml")?.async("string");
  if (!workbookXmlStr) throw new Error("workbook.xml não encontrado");

  // Regex para achar: <sheet name="Promocoes" ... r:id="rId3" ... />
  // CUIDADO: a ordem dos atributos varia. Vamos pegar a tag inteira primeiro.
  const sheetTagRegex = new RegExp(`<sheet[^>]*name=["']${escapeRegExp(worksheetName)}["'][^>]*>`, 'i');
  const sheetTagMatch = workbookXmlStr.match(sheetTagRegex);
  if (!sheetTagMatch) throw new Error(`Aba ${worksheetName} não encontrada no workbook.xml`);

  const rIdMatch = sheetTagMatch[0].match(/r:id=["']([^"']+)["']/i);
  if (!rIdMatch) throw new Error(`r:id não encontrado na aba ${worksheetName}`);
  const rId = rIdMatch[1];

  // 2. Achar o Target no _rels/workbook.xml.rels
  const relsXmlStr = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!relsXmlStr) throw new Error("workbook.xml.rels não encontrado");

  const relTagRegex = new RegExp(`<Relationship[^>]*Id=["']${rId}["'][^>]*>`, 'i');
  const relTagMatch = relsXmlStr.match(relTagRegex);
  if (!relTagMatch) throw new Error(`Relationship ${rId} não encontrado`);

  const targetMatch = relTagMatch[0].match(/Target=["']([^"']+)["']/i);
  if (!targetMatch) throw new Error(`Target não encontrado no Relationship ${rId}`);
  let targetFile = `xl/${targetMatch[1].replace(/^\//, '')}`;

  // 3. Modificar o XML da aba alvo
  let sheetXmlStr = await zip.file(targetFile)?.async("string");
  if (!sheetXmlStr) throw new Error(`Arquivo ${targetFile} não encontrado no zip`);

  // Se formos adicionar strings de texto, precisamos lidar com sharedStrings ou inlineStr
  let sharedStringsXmlStr = await zip.file("xl/sharedStrings.xml")?.async("string");
  let sharedStringsChanged = false;

  function getSharedStringIndex(text: string): string {
    if (!sharedStringsXmlStr) return ""; // Retorna fallback para inlineStr
    
    // Procura se a string exata já existe
    const searchStr = `<si><t>${escapeXml(text)}</t></si>`;
    const idx = sharedStringsXmlStr.split('<si>').findIndex(part => part.includes(`<t>${escapeXml(text)}</t>`));
    if (idx > 0) return String(idx - 1); // 0-indexed count based on tags
    
    // Se não existe, adicionamos
    const insertPos = sharedStringsXmlStr.indexOf("</sst>");
    if (insertPos !== -1) {
      sharedStringsXmlStr = sharedStringsXmlStr.slice(0, insertPos) + searchStr + sharedStringsXmlStr.slice(insertPos);
      sharedStringsChanged = true;
      
      // Update count attributes if necessary (simplified)
      return String(sharedStringsXmlStr.split('<si>').length - 2); // new index
    }
    return "";
  }

  // Agrupar updates por linha
  const updatesByRow = updates.reduce((acc, update) => {
    if (!acc[update.rowIndex]) acc[update.rowIndex] = [];
    acc[update.rowIndex].push(update);
    return acc;
  }, {} as Record<number, typeof updates>);

  for (const [rowIdxStr, rowUpdates] of Object.entries(updatesByRow)) {
    const rowIdx = parseInt(rowIdxStr);
    
    // Acha a <row r="N"> ... </row>
    const rowStartRegex = new RegExp(`<row[^>]*r=["']${rowIdx}["'][^>]*>`);
    const rowMatch = sheetXmlStr.match(rowStartRegex);
    if (!rowMatch) continue; // Linha não encontrada, pula (poderiamos inserir mas é raro não existir a linha)

    const rowStartIdx = rowMatch.index!;
    const rowEndIdx = sheetXmlStr.indexOf("</row>", rowStartIdx);
    if (rowEndIdx === -1) continue;

    let rowContent = sheetXmlStr.slice(rowStartIdx, rowEndIdx + 6);
    let newRowContent = rowContent;

    for (const update of rowUpdates) {
      const cellRef = `${update.colLetter}${update.rowIndex}`;
      const isString = typeof update.value === "string";
      
      const valStr = isString ? escapeXml(String(update.value)) : update.value;

      // Localiza a célula
      const cellRegex = new RegExp(`<c[^>]*r=["']${cellRef}["'][^>]*>[\\s\\S]*?</c>`);
      const cellMatch = newRowContent.match(cellRegex);

      if (cellMatch) {
        // Célula existe, substitui valor
        let cellTag = cellMatch[0];

        // TRAVA: nunca escrever por cima de fórmula.
        // Neste fluxo o alvo é sempre uma célula que o vendedor preenche.
        // Se veio uma <f>, a coluna foi escolhida errado — gravar aqui deixa
        // a fórmula no arquivo com um valor fixo grudado, e o erro só
        // aparece quando o canal recusa a planilha. Melhor não escrever.
        if (/<f[\s>]/.test(cellTag)) {
          continue;
        }

        // Remove conteúdo atual (a tag <v> interna ou <is>)
        cellTag = cellTag.replace(/<v>[\s\S]*?<\/v>/g, '').replace(/<is>[\s\S]*?<\/is>/g, '');
        
        if (isString) {
          const sstIdx = getSharedStringIndex(String(update.value));
          if (sstIdx !== "") {
            // Usa shared string
            cellTag = cellTag.replace(/t=["'][^"']*["']/, 't="s"');
            if (!cellTag.includes('t=')) cellTag = cellTag.replace('<c ', '<c t="s" ');
            cellTag = cellTag.replace('</c>', `<v>${sstIdx}</v></c>`);
          } else {
            // Usa inline string se não houver sharedStrings.xml
            cellTag = cellTag.replace(/t=["'][^"']*["']/, 't="inlineStr"');
            if (!cellTag.includes('t=')) cellTag = cellTag.replace('<c ', '<c t="inlineStr" ');
            cellTag = cellTag.replace('</c>', `<is><t>${valStr}</t></is></c>`);
          }
        } else {
          // Numero
          cellTag = cellTag.replace(/t=["'][^"']*["']/, 't="n"'); // Ou remove o t=""
          if (!cellTag.includes('t=')) cellTag = cellTag.replace('<c ', '<c t="n" ');
          cellTag = cellTag.replace('</c>', `<v>${valStr}</v></c>`);
        }
        
        newRowContent = newRowContent.replace(cellMatch[0], cellTag);
      } else {
        // A célula não existe na linha. A documentação do Meli diz: "se a celula nao existir... insira... na POSICAO CORRETA".
        // Inserir células em ordem não é trivial sem um parser XML real.
        // Simplificação: Adiciona no final da linha (antes de </row>).
        // Na maioria das planilhas do Meli, a célula existe (pode estar vazia, mas a tag <c> existe).
        let newCell = "";
        if (isString) {
          const sstIdx = getSharedStringIndex(String(update.value));
          if (sstIdx !== "") {
             newCell = `<c r="${cellRef}" t="s"><v>${sstIdx}</v></c>`;
          } else {
             newCell = `<c r="${cellRef}" t="inlineStr"><is><t>${valStr}</t></is></c>`;
          }
        } else {
          newCell = `<c r="${cellRef}" t="n"><v>${valStr}</v></c>`;
        }
        newRowContent = newRowContent.replace('</row>', `${newCell}</row>`);
      }
    }

    sheetXmlStr = sheetXmlStr.replace(rowContent, newRowContent);
  }

  // 4. Salvar tudo
  zip.file(targetFile, sheetXmlStr);
  if (sharedStringsChanged && sharedStringsXmlStr) {
    // ── CORREÇÃO ────────────────────────────────────────────────────
    // O código original acrescentava <si> novos mas deixava os contadores
    // do <sst> intactos (o comentário dizia "simplified"). Com uniqueCount
    // menor que a quantidade real de <si>, o leitor não resolve os índices
    // acrescentados e a célula aparece como NÚMERO em vez do texto — foi
    // exatamente o que aconteceu com "Participar" nas campanhas sem
    // redução de tarifa. Aqui os contadores são recalculados.
    sharedStringsXmlStr = corrigirContadoresSst(sharedStringsXmlStr);
    zip.file("xl/sharedStrings.xml", sharedStringsXmlStr);
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Ajusta `count` e `uniqueCount` do <sst> para a quantidade real de <si>.
 *
 * `uniqueCount` é o que define até qual índice o leitor resolve. Se ficar
 * defasado, toda string acrescentada vira número na planilha. `count` conta
 * referências e é tolerante, mas nunca pode ficar abaixo de uniqueCount.
 */
function corrigirContadoresSst(xml: string): string {
  const totalSi = (xml.match(/<si[\s>]/g) || []).length;
  if (totalSi === 0) return xml;

  const sstTag = xml.match(/<sst[^>]*>/);
  if (!sstTag) return xml;

  const uniqueAntes = parseInt(
    (sstTag[0].match(/uniqueCount=["'](\d+)["']/) || [])[1] || "0",
    10
  );
  const countAntes = parseInt(
    (sstTag[0].match(/count=["'](\d+)["']/) || [])[1] || "0",
    10
  );

  const novos = Math.max(0, totalSi - uniqueAntes);
  const novoCount = Math.max(countAntes + novos, totalSi);

  let nova = sstTag[0];
  nova = nova.includes("uniqueCount=")
    ? nova.replace(/uniqueCount=["']\d+["']/, `uniqueCount="${totalSi}"`)
    : nova.replace("<sst", `<sst uniqueCount="${totalSi}"`);
  nova = nova.includes("count=")
    ? nova.replace(/(?<!unique)count=["']\d+["']/, `count="${novoCount}"`)
    : nova.replace("<sst", `<sst count="${novoCount}"`);

  return xml.replace(sstTag[0], nova);
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(unsafe: string) {
  return unsafe
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&apos;');
}
