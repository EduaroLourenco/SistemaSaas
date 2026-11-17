// Gera somente um esqueleto sintético de contrato. Não importa nem executa loaders.
import ts from 'typescript';
import { writeFileSync } from 'node:fs';
const [file, nome, destino] = process.argv.slice(2);
if (!file || !nome || !destino) throw new Error('Informe arquivo TS, tipo exportado e destino JSON.');
const program = ts.createProgram([file], { strict: true, skipLibCheck: true, noEmit: true, target: ts.ScriptTarget.ES2020, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext });
const checker = program.getTypeChecker();
const source = program.getSourceFile(file);
const declaration = source.statements.find(s => (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name.text === nome);
if (!declaration) throw new Error(`Tipo ${nome} não encontrado.`);
function valor(type, key = '', depth = 0) {
  if (depth > 15) return null;
  if (type.isUnion()) {
    if (type.types.some(t => t.flags & ts.TypeFlags.Null)) return null;
    return valor(type.types.find(t => !(t.flags & ts.TypeFlags.Undefined)) || type.types[0], key, depth + 1);
  }
  if (type.isStringLiteral()) return type.value;
  if (type.isNumberLiteral()) return type.value;
  if (type.flags & ts.TypeFlags.BooleanLike) return false;
  if (type.flags & ts.TypeFlags.NumberLike) return key === 'dias' ? 7 : 0;
  if (type.flags & ts.TypeFlags.StringLike) {
    if (/^(de|ate|hoje|data|inicio|fim)$|data$/i.test(key)) return '2026-11-16';
    if (/em$|quando$/i.test(key)) return '2026-11-16T14:00:00-03:00';
    if (/^id$|Id$|chave|token/i.test(key)) return 'fixture-demo';
    return 'Demonstração';
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) return [];
  const propriedades = checker.getPropertiesOfType(type);
  if (!propriedades.length) return {};
  return Object.fromEntries(propriedades.filter(p => !(p.flags & ts.SymbolFlags.Method)).map(p => {
    const d = p.valueDeclaration || p.declarations?.[0] || declaration;
    return [p.name, valor(checker.getTypeOfSymbolAtLocation(p, d), p.name, depth + 1)];
  }));
}
writeFileSync(destino, JSON.stringify(valor(checker.getTypeAtLocation(declaration)), null, 2) + '\n');
console.log(`Fixture sintética de ${nome} gravada em ${destino}.`);
