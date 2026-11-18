import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Somente explicações estáticas do cabeçalho. Datas, cobertura e estados
// calculados continuam visíveis; textos de formulários e vazios não mudam.
const excluidos = /[/\\](promocoes|comercial)[/\\]|[/\\]anuncios[/\\](trafego-pago|preco-ideal)[/\\]|[/\\]vendas[/\\](skus|queda)[/\\]|termometro-cliente/;
const alterados = [];
function visitar(pasta) {
  for (const entrada of fs.readdirSync(pasta, {withFileTypes:true})) {
    const arquivo = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) { visitar(arquivo); continue; }
    if (!arquivo.endsWith('.tsx') || excluidos.test(arquivo)) continue;
    const texto = fs.readFileSync(arquivo, 'utf8');
    const ast = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const edicoes = [];
    function no(n) {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText(ast) === 'PageHeader') {
        if (!n.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(ast) === 'help')) {
          for (const a of n.attributes.properties) {
            if (ts.isJsxAttribute(a) && a.name.getText(ast) === 'description' && a.initializer && ts.isStringLiteral(a.initializer)) {
              edicoes.push([a.name.getStart(ast), a.name.end]);
            }
          }
        }
      }
      ts.forEachChild(n, no);
    }
    no(ast);
    if (edicoes.length) {
      let novo = texto;
      for (const [inicio,fim] of edicoes.reverse()) novo = novo.slice(0,inicio)+'help'+novo.slice(fim);
      fs.writeFileSync(arquivo, novo);
      alterados.push(arquivo);
    }
  }
}
visitar('src/app');
console.log(JSON.stringify(alterados,null,2));
