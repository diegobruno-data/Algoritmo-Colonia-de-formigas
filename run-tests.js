/* Uso: node run-tests.js  — executa os testes de validação (seção 6) no terminal. */
const { runAll } = require('./js/tests.js');
let failed = 0;
for (const t of runAll()) {
  console.log('\n=== Teste ' + t.id + ' — ' + t.title + ' : ' + (t.pass ? 'PASSOU' : 'FALHOU'));
  console.log('Entradas:'); t.inputs.forEach((l) => console.log('  - ' + l));
  console.log('Saídas:'); t.outputs.forEach((l) => console.log('  ' + l));
  const bad = t.checks.filter((c) => !c.pass);
  console.log('Verificações: ' + (t.checks.length - bad.length) + '/' + t.checks.length + ' ok');
  bad.forEach((c) => console.log('  ✗ ' + c.label));
  console.log('Conclusão: ' + t.conclusion);
  if (!t.pass) failed++;
}
console.log('\n' + (failed ? failed + ' teste(s) falharam.' : 'Todos os testes passaram.'));
process.exit(failed ? 1 : 0);
