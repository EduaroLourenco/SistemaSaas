import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root = process.cwd();
const out = path.join(root, 'docs/auditoria-visual-2026-10-07');
const clean = s => s.replace(/\s+/g, ' ').trim();
const relative = p => path.relative(root, p).replaceAll('\\', '/');
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
const files = walk(path.join(root,'src')).filter(p=>p.endsWith('.tsx'));
const records = files.map(p => {
  const source = fs.readFileSync(p,'utf8');
  const ast = ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const record = {file:relative(p), sha256:crypto.createHash('sha256').update(source).digest('hex'), lines:source.split('\n').length, imports:[], states:[], components:[], text:[], labels:[], controls:[], conditions:[]};
  const line = node => ast.getLineAndCharacterOfPosition(node.getStart()).line+1;
  const interesting = /^(PageHeader|PanelHeader|SectionHeader|StatTile|Metrica|Chart|.*Chart|.*Table|.*Tabela|.*Modal|.*Drawer|Painel|Dialog|Button|Input|Select|Tabs|TabBar|Segmented|EmptyState|SemFonte|Alerta|Leitura|Campo|FilterBar|BarraFiltros|h[1-6]|button|input|textarea|select|dialog|table|summary|details|form)$/;
  function visit(n) {
    if(ts.isImportDeclaration(n)) record.imports.push(n.moduleSpecifier.text);
    if(ts.isCallExpression(n) && n.expression.kind===ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(n.arguments[0])) record.imports.push(n.arguments[0].text);
    if(ts.isPropertyAssignment(n) && /^(title|titulo|label|rotulo|header|nome|description|descricao|hint|texto)$/.test(n.name.getText(ast))) record.labels.push({line:line(n),code:clean(n.getText(ast)).slice(0,400)});
    if(ts.isVariableDeclaration(n) && n.initializer && /useState|useReducer|useRef/.test(n.initializer.getText(ast).slice(0,75))) record.states.push({line:line(n),code:clean(n.getText(ast)).slice(0,350)});
    if(ts.isJsxText(n) && clean(n.text)) record.text.push({line:line(n),text:clean(n.text)});
    if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)) {
      const tag=n.tagName.getText(ast);
      record.components.push(tag);
      const attrs=Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(ast),a.initializer?clean(a.initializer.getText(ast)).slice(0,700):true]));
      if(interesting.test(tag)||Object.keys(attrs).some(a=>/onClick|onChange|title|titulo|label|aria-label|placeholder/.test(a))) record.controls.push({line:line(n),tag,attrs});
    }
    if(ts.isJsxExpression(n)&&n.expression) {
      const e=n.expression;
      if(ts.isConditionalExpression(e)) record.conditions.push({line:line(n),condition:clean(e.condition.getText(ast)).slice(0,200)});
      if(ts.isBinaryExpression(e)&&e.operatorToken.kind===ts.SyntaxKind.AmpersandAmpersandToken) record.conditions.push({line:line(n),condition:clean(e.left.getText(ast)).slice(0,200)});
    }
    ts.forEachChild(n,visit);
  }
  visit(ast); record.components=[...new Set(record.components)]; return record;
});
const byPath = new Map(records.map(r=>[r.file,r]));
function resolveImport(file,imp){
  if(!imp.startsWith('.')&&!imp.startsWith('@/'))return null;
  const base=imp.startsWith('@/') ? path.join(root,'src',imp.slice(2)) : path.resolve(root,path.dirname(file),imp);
  for(const suffix of ['.tsx','/index.tsx']) { const rel=relative(base+suffix); if(byPath.has(rel))return rel; }
  return null;
}
function dependencies(file,seen=new Set()){
  if(seen.has(file))return seen; seen.add(file);
  for(const imp of byPath.get(file)?.imports??[]) { const child=resolveImport(file,imp); if(child)dependencies(child,seen); }
  return seen;
}
const routes=records.filter(r=>/src\/app\/(?:.*\/)?page\.tsx$/.test(r.file)).map(r=>({route:r.file.replace(/^src\/app/,'').replace(/\/page\.tsx$/,'')||'/',file:r.file,files:[...dependencies(r.file)]}));
fs.mkdirSync(path.join(out,'evidencias'),{recursive:true});
fs.writeFileSync(path.join(out,'evidencias/inventario-codigo.json'),JSON.stringify({generatedAt:new Date().toISOString(),evidence:'Análise estática do código. Não comprova comportamento no navegador.',routes,files:records},null,2));
for(const area of ['geral','vendas','mercado-livre','financeiro','planejamento','gestao','componentes']) {
  const relevant=records.filter(r=>{
    if(area==='componentes')return r.file.startsWith('src/components/');
    if(area==='vendas')return r.file.includes('/vendas/');
    if(area==='mercado-livre')return /\/(anuncios|promocoes|monitoramento)\//.test(r.file);
    if(area==='financeiro')return r.file.includes('/financeiro/');
    if(area==='planejamento')return r.file.includes('/planejamento/');
    if(area==='geral')return /src\/app\/(page|painel-cliente)\.tsx|\/(alertas|conversa|importar)\//.test(r.file);
    return r.file.startsWith('src/app/')&&!/\/(vendas|anuncios|promocoes|monitoramento|financeiro|planejamento|alertas|conversa|importar)\//.test(r.file)&&!/^src\/app\/(page|painel-cliente)\.tsx$/.test(r.file);
  });
  const text=relevant.map(r=>`# ${r.file} (${r.lines} linhas)\n\nESTADOS\n${r.states.map(s=>`${s.line}: ${s.code}`).join('\n')}\n\nESTRUTURA\n${r.controls.map(c=>`${c.line}: ${c.tag} ${Object.entries(c.attrs).filter(([k])=>!['className','key'].includes(k)).map(([k,v])=>`${k}=${v}`).join(' ')}`).join('\n')}\n\nRÓTULOS\n${r.labels.map(t=>`${t.line}: ${t.code}`).join('\n')}\n\nTEXTOS\n${r.text.map(t=>`${t.line}: ${t.text}`).join('\n')}\n\nCONDIÇÕES\n${r.conditions.map(c=>`${c.line}: ${c.condition}`).join('\n')}`).join('\n\n');
  fs.writeFileSync(path.join(out,`evidencias/${area}.txt`),text);
}
console.log(JSON.stringify({routes:routes.length,tsx:records.length,lines:records.reduce((n,r)=>n+r.lines,0),routeList:routes.map(r=>({route:r.route,components:r.files.length}))},null,2));
