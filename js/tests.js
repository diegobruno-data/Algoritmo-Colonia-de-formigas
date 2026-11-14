/*
 * tests.js — Testes de validação da seção 6 do enunciado.
 * Roda no navegador (tests.html) e no Node (node run-tests.js).
 * Os testes controlados chamam as funções do núcleo diretamente.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./aco.js'));
  else root.ACOTests = factory(root.ACO);
})(typeof self !== 'undefined' ? self : this, function (ACO) {
  'use strict';

  const {
    Colony, distanceMatrix, routeLength, checkRoute, choiceProbabilities,
    validateConfig, fmtNum, formatEdgeLog, mulberry32,
  } = ACO;

  const TOL = 1e-6; // tolerância absoluta do enunciado
  const near = (a, b) => Math.abs(a - b) <= TOL;
  const REF = [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: 3, y: 0 },
    { id: 'C', x: 3, y: 4 },
    { id: 'D', x: 0, y: 4 },
  ];
  const NAMES = 'ABCD';
  const seq = (r) => r.map((i) => NAMES[i]).join(' → ');
  const f = (x, d) => fmtNum(x, d === undefined ? 6 : d);

  function refCfg(over) {
    return Object.assign(
      { vertices: REF, depot: 0, ants: 10, iterations: 30, alpha: 1, beta: 2, rho: 0.5, tau0: 1, Q: 14, seed: 42 },
      over || {}
    );
  }

  function finish(t) {
    t.pass = t.checks.every((c) => c.pass);
    return t;
  }

  /* ----------------------------- 6.1 ----------------------------- */
  function test61() {
    const dist = distanceMatrix(REF);
    const expected = { 'A-B': 3, 'A-C': 5, 'A-D': 4, 'B-C': 4, 'B-D': 5, 'C-D': 3 };
    const checks = [];
    const outputs = [];
    for (const k in expected) {
      const i = NAMES.indexOf(k[0]);
      const j = NAMES.indexOf(k[2]);
      const ok = near(dist[i][j], expected[k]) && near(dist[j][i], expected[k]);
      outputs.push('d(' + k + ') = ' + f(dist[i][j]) + ' (esperado ' + expected[k] + ')');
      checks.push({ label: 'distância ' + k, pass: ok });
    }
    checks.push({ label: 'd(i,i) = 0', pass: [0, 1, 2, 3].every((i) => dist[i][i] === 0) });

    const routes = [
      [[0, 1, 2, 3, 0], 14], [[0, 1, 3, 2, 0], 16], [[0, 2, 1, 3, 0], 18],
      [[0, 2, 3, 1, 0], 16], [[0, 3, 1, 2, 0], 18], [[0, 3, 2, 1, 0], 14],
    ];
    for (const [r, L] of routes) {
      const got = routeLength(r, dist);
      outputs.push(seq(r) + ': L = ' + f(got) + ' (esperado ' + L + ')');
      checks.push({ label: 'comprimento de ' + seq(r), pass: near(got, L) && checkRoute(r, 4, 0).valid });
    }
    const bad = [[0, 1, 2, 0], [0, 1, 1, 2, 0], [0, 1, 2, 3, 1], [1, 0, 2, 3, 1]];
    for (const r of bad) {
      const c = checkRoute(r, 4, 0);
      outputs.push('rota inválida [' + r.map((i) => NAMES[i]).join(',') + ']: ' + (c.valid ? 'ACEITA (erro)' : 'rejeitada — ' + c.reason));
      checks.push({ label: 'rejeita ' + r.join(','), pass: !c.valid });
    }
    return finish({
      id: '6.1',
      title: 'Instância de referência e cálculo das rotas',
      inputs: ['A = (0,0), B = (3,0), C = (3,4), D = (0,4); depósito A', 'As seis rotas possíveis a partir de A e quatro rotas inválidas'],
      outputs,
      checks,
      conclusion: 'Distâncias e comprimentos das seis rotas coincidem com o enunciado (ótimo 14 em duas orientações); rotas incompletas, com repetição ou sem retorno ao depósito são rejeitadas.',
    });
  }

  /* ----------------------------- 6.2 ----------------------------- */
  function test62() {
    const dist = distanceMatrix(REF);
    const ones = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => (i === j ? 0 : 1)));
    const checks = [];
    const outputs = [];

    const a = choiceProbabilities(0, [1, 2, 3], ones, dist, 1, 2);
    const expW = [1 / 9, 1 / 25, 1 / 16];
    const expP = [400 / 769, 144 / 769, 225 / 769];
    const nm = ['B', 'C', 'D'];
    a.forEach((it, k) => {
      outputs.push('w(A,' + nm[k] + ') = ' + f(it.w, 8) + ' (esperado ' + f(expW[k], 8) + '); p(A,' + nm[k] + ') = ' + f(it.p, 8) + ' (esperado ' + f(expP[k], 8) + ')');
      checks.push({ label: 'w(A,' + nm[k] + ')', pass: near(it.w, expW[k]) });
      checks.push({ label: 'p(A,' + nm[k] + ')', pass: near(it.p, expP[k]) });
    });
    const sumA = a.reduce((s, it) => s + it.p, 0);
    outputs.push('Σ p = ' + f(sumA, 10));
    checks.push({ label: 'soma das probabilidades = 1', pass: near(sumA, 1) });

    const b = choiceProbabilities(1, [2, 3], ones, dist, 1, 2);
    outputs.push('Após visitar B: p(B,C) = ' + f(b[0].p, 8) + ' (esperado ' + f(25 / 41, 8) + '); p(B,D) = ' + f(b[1].p, 8) + ' (esperado ' + f(16 / 41, 8) + ')');
    checks.push({ label: 'p(B,C)', pass: near(b[0].p, 25 / 41) });
    checks.push({ label: 'p(B,D)', pass: near(b[1].p, 16 / 41) });
    checks.push({ label: 'A e B fora do sorteio', pass: b.length === 2 && b.every((it) => it.j !== 0 && it.j !== 1) });

    const nonUniform = ones.map((r) => r.slice());
    nonUniform[0][1] = nonUniform[1][0] = 7;
    nonUniform[0][3] = nonUniform[3][0] = 0.2;
    const z = choiceProbabilities(0, [1, 2, 3], nonUniform, dist, 0, 0);
    outputs.push('α = 0, β = 0 (τ e distâncias diferentes): p = ' + z.map((it) => f(it.p, 8)).join(', '));
    checks.push({ label: 'α = β = 0 → probabilidades iguais', pass: z.every((it) => near(it.p, 1 / 3)) });

    const one = choiceProbabilities(2, [3], ones, dist, 1, 2);
    outputs.push('Um único candidato: p = ' + f(one[0].p, 10));
    checks.push({ label: 'único candidato → p = 1', pass: near(one[0].p, 1) });

    // Sorteio proporcional: nenhuma opção é descartada por não ter o maior peso.
    const rng = mulberry32(7);
    const counts = [0, 0, 0];
    const N = 200000;
    const pick = require_pick();
    for (let k = 0; k < N; k++) counts[pick(a, rng) - 1]++;
    const freq = counts.map((c) => c / N);
    outputs.push('Sorteio proporcional (' + N + ' sorteios, semente 7): freq. B/C/D = ' + freq.map((x) => f(x, 4)).join(' / '));
    freq.forEach((x, k) => checks.push({ label: 'frequência de ' + nm[k] + ' ≈ p', pass: Math.abs(x - expP[k]) < 0.01 }));
    checks.push({ label: 'nenhuma opção é excluída', pass: counts.every((c) => c > 0) });

    return finish({
      id: '6.2',
      title: 'Probabilidades de escolha',
      inputs: ['Formiga em A, τ = 1 em todas as arestas, α = 1, β = 2', 'Após visitar B (candidatos C e D)', 'α = 0 e β = 0 com τ e distâncias diferentes', 'Um único candidato restante'],
      outputs,
      checks,
      conclusion: 'Pesos e probabilidades batem com os valores do enunciado dentro de 10⁻⁶; a soma é 1; o sorteio por roleta reproduz as probabilidades sem escolher sempre o maior peso.',
    });
  }
  function require_pick() { return ACO.pickVertex; }

  /* ----------------------------- 6.3 ----------------------------- */
  function test63() {
    const R = [[0, 1, 2, 3, 0]];
    const per = [[0, 1], [1, 2], [2, 3], [0, 3]];
    const diag = [[0, 2], [1, 3]];
    const checks = [];
    const outputs = [];

    const c = new Colony(refCfg({ ants: 1, iterations: 2 }));
    const r1 = c.step(R);
    const find = (rec, i, j) => rec.edges.find((e) => e.i === i && e.j === j);
    outputs.push('Iteração 1 (rota forçada A → B → C → D → A, L = ' + f(r1.routes[0].length) + '):');
    checks.push({ label: 'L = 14', pass: near(r1.routes[0].length, 14) });
    checks.push({ label: 'todas as arestas com 0,5 após evaporação', pass: r1.edges.every((e) => near(e.evap, 0.5)) });
    per.forEach(([i, j]) => {
      const e = find(r1, i, j);
      outputs.push('  ' + NAMES[i] + NAMES[j] + ': ' + formatEdgeLog(e));
      checks.push({ label: 'aresta ' + NAMES[i] + NAMES[j] + ' final 1,5 (depósito 1 em D→A incluso)', pass: near(e.deposit, 1) && near(e.final, 1.5) && near(c.tau[i][j], 1.5) && near(c.tau[j][i], 1.5) });
    });
    diag.forEach(([i, j]) => {
      const e = find(r1, i, j);
      outputs.push('  ' + NAMES[i] + NAMES[j] + ': ' + formatEdgeLog(e));
      checks.push({ label: 'diagonal ' + NAMES[i] + NAMES[j] + ' final 0,5', pass: near(e.deposit, 0) && near(e.final, 0.5) });
    });
    checks.push({
      label: 'log de AB e AC no formato do enunciado',
      pass: formatEdgeLog(find(r1, 0, 1)) === 'anterior 1; após evaporação 0,5; depósito 1; final 1,5' &&
            formatEdgeLog(find(r1, 0, 2)) === 'anterior 1; após evaporação 0,5; depósito 0; final 0,5',
    });
    checks.push({ label: 'diagonal da matriz = 0', pass: [0, 1, 2, 3].every((i) => c.tau[i][i] === 0) });

    c.step(R);
    outputs.push('Iteração 2 (mesma rota forçada): perímetro = ' + per.map(([i, j]) => f(c.tau[i][j])).join(', ') + '; diagonais = ' + diag.map(([i, j]) => f(c.tau[i][j])).join(', '));
    per.forEach(([i, j]) => checks.push({ label: 'iteração 2: ' + NAMES[i] + NAMES[j] + ' = 1,75', pass: near(c.tau[i][j], 1.75) }));
    diag.forEach(([i, j]) => checks.push({ label: 'iteração 2: ' + NAMES[i] + NAMES[j] + ' = 0,25', pass: near(c.tau[i][j], 0.25) }));

    const c2 = new Colony(refCfg({ ants: 2, iterations: 1 }));
    c2.step(R);
    outputs.push('Duas formigas, mesma rota, 1 iteração: perímetro = ' + per.map(([i, j]) => f(c2.tau[i][j])).join(', ') + '; diagonais = ' + diag.map(([i, j]) => f(c2.tau[i][j])).join(', '));
    per.forEach(([i, j]) => checks.push({ label: '2 formigas: ' + NAMES[i] + NAMES[j] + ' = 2,5', pass: near(c2.tau[i][j], 2.5) }));
    diag.forEach(([i, j]) => checks.push({ label: '2 formigas: ' + NAMES[i] + NAMES[j] + ' = 0,5', pass: near(c2.tau[i][j], 0.5) }));

    return finish({
      id: '6.3',
      title: 'Evaporação e depósito',
      inputs: ['τ₀ = 1, ρ = 50 %, Q = 14, 1 formiga, rota forçada A → B → C → D → A (L = 14), 2 iterações', 'Reinício com τ₀ = 1 e 2 formigas na mesma rota, 1 iteração'],
      outputs,
      checks,
      conclusion: 'Evaporação (0,5), depósito Q/L = 1 (incluindo o retorno D→A), valores finais 1,5/0,5, segunda iteração 1,75/0,25 e soma dos depósitos de duas formigas (2,5/0,5) conferem com o enunciado; a matriz permanece simétrica.',
    });
  }

  /* ----------------------------- 6.4 ----------------------------- */
  function runFull(cfg) {
    const c = new Colony(cfg);
    while (!c.finished) c.step();
    return c;
  }

  function test64() {
    const cfg = refCfg();
    const checks = [];
    const outputs = [];
    const c = new Colony(cfg);
    checks.push({ label: 'iteração 0: melhor distância "ainda não calculada" (não é zero)', pass: c.bestLength === null && c.iteration === 0 && c.history.length === 0 });
    outputs.push('Estado inicial: iteração 0, melhor distância = ainda não calculada, τ = 1 nas arestas');
    while (!c.finished) c.step();

    const best = c.history.map((h) => h.bestLength);
    const dist = c.dist;
    outputs.push('Registros de resultados: ' + c.history.length);
    outputs.push('Melhor distância acumulada por iteração: ' + best.map((x) => f(x, 4)).join(' | '));
    outputs.push('Melhor rota: ' + seq(c.bestRoute) + ' — comprimento ' + f(c.bestLength));
    outputs.push('Primeira iteração em que a melhor rota apareceu: ' + c.bestIteration);

    checks.push({ label: '30 registros (um por iteração)', pass: c.history.length === 30 });
    checks.push({ label: 'melhor acumulada nunca aumenta', pass: best.every((x, k) => k === 0 || x <= best[k - 1] + 1e-12) });
    checks.push({ label: 'comprimento final ∈ {14, 16, 18}', pass: [14, 16, 18].some((v) => near(c.bestLength, v)) });
    checks.push({ label: 'melhor rota é válida e seu comprimento confere', pass: checkRoute(c.bestRoute, 4, 0).valid && near(routeLength(c.bestRoute, dist), c.bestLength) });
    checks.push({ label: 'todas as rotas de todas as formigas são válidas', pass: c.history.every((h) => h.routes.every((r) => checkRoute(r.route, 4, 0).valid && near(routeLength(r.route, dist), r.length))) });
    checks.push({ label: 'cada iteração registra rota construída (candidatos, p, escolha, retorno)', pass: c.history.every((h) => h.trace && h.trace.length === 4 && h.trace[3].returnTo === 0) });

    const again = runFull(cfg);
    const same = JSON.stringify(again.history) === JSON.stringify(c.history);
    outputs.push('Repetição (mesmos dados, parâmetros e semente 42): histórico idêntico = ' + (same ? 'sim' : 'NÃO'));
    checks.push({ label: 'reprodutibilidade com a mesma semente', pass: same });

    const p = new Colony(cfg);
    for (let k = 0; k < 11; k++) p.step();
    for (let k = 0; k < 5; k++) Math.random(); // "pausa": nada externo pode alterar os sorteios
    for (let k = 0; k < 7; k++) p.step();
    while (!p.finished) p.step();
    const resumed = JSON.stringify(p.history) === JSON.stringify(c.history);
    outputs.push('Pausar na iteração 11 e retomar (e mudar a velocidade visual): histórico idêntico = ' + (resumed ? 'sim' : 'NÃO'));
    checks.push({ label: 'pausar/retomar preserva o resultado', pass: resumed });

    c.reset();
    const r = c.step();
    const fresh = new Colony(cfg).step();
    checks.push({ label: 'Reiniciar restaura τ₀, histórico e semente', pass: c.history.length === 1 && JSON.stringify(r) === JSON.stringify(fresh) });

    return finish({
      id: '6.4',
      title: 'Execução completa e reprodutibilidade',
      inputs: ['Instância 6.1, depósito A, 10 formigas, 30 iterações, α = 1, β = 2, ρ = 50 %, τ₀ = 1, Q = 14, semente 42'],
      outputs,
      checks,
      conclusion: 'A execução gerou 30 registros, a melhor distância acumulada é não crescente e a rota final é válida (' + seq(c.bestRoute) + ', L = ' + f(c.bestLength) + '). Repetir a semente ou pausar/retomar reproduz o mesmo histórico.',
    });
  }

  /* ----------------------------- 6.5 ----------------------------- */
  function rawRef(over) {
    return Object.assign({
      vertices: REF.map((v) => ({ id: v.id, x: String(v.x), y: String(v.y) })),
      depot: 0, ants: '10', iterations: '30', alpha: '1', beta: '2', rhoPct: '50', tau0: '1', Q: '14', seed: '42',
    }, over || {});
  }

  function test65() {
    const checks = [];
    const outputs = [];

    // Efeito de β
    const rows = [];
    for (const beta of [0, 2]) {
      const finals = [1, 2, 3, 4, 5].map((seed) => runFull(refCfg({ beta, seed })).bestLength);
      const mean = finals.reduce((s, x) => s + x, 0) / finals.length;
      const hits = finals.filter((x) => near(x, 14)).length;
      rows.push({ beta, finals, mean, hits });
      outputs.push('β = ' + beta + ': melhores finais (sementes 1–5) = ' + finals.map((x) => f(x, 4)).join(', ') + ' | média = ' + f(mean, 4) + ' | atingiram 14: ' + hits + ' de 5');
      checks.push({ label: 'β = ' + beta + ': resultados válidos (14, 16 ou 18)', pass: finals.every((x) => [14, 16, 18].some((v) => near(x, v))) });
    }

    // Entradas inválidas
    const refV = (k, key, val) => rawRef().vertices.map((v, i) => (i === k ? Object.assign({}, v, { [key]: val }) : v));
    const cases = [
      ['controle (entrada válida)', rawRef(), true],
      ['identificador repetido', rawRef({ vertices: refV(1, 'id', 'A') }), false],
      ['identificador vazio', rawRef({ vertices: refV(1, 'id', '  ') }), false],
      ['coordenadas duplicadas', rawRef({ vertices: refV(1, 'x', '0') }), false],
      ['menos de 4 vértices', rawRef({ vertices: rawRef().vertices.slice(0, 3) }), false],
      ['mais de 12 vértices', rawRef({ vertices: Array.from({ length: 13 }, (_, i) => ({ id: 'V' + i, x: String(i * 10), y: String(i * 7) })) }), false],
      ['coordenada x vazia', rawRef({ vertices: refV(2, 'x', '') }), false],
      ['coordenada x > 1000', rawRef({ vertices: refV(2, 'x', '1001') }), false],
      ['coordenada y negativa', rawRef({ vertices: refV(2, 'y', '-1') }), false],
      ['coordenada com 3 casas decimais', rawRef({ vertices: refV(2, 'x', '1.234') }), false],
      ['coordenada não numérica', rawRef({ vertices: refV(2, 'x', 'abc') }), false],
      ['depósito inexistente', rawRef({ depot: 9 }), false],
      ['formigas = 0', rawRef({ ants: '0' }), false],
      ['formigas = 101', rawRef({ ants: '101' }), false],
      ['formigas = 2,5 (não inteiro)', rawRef({ ants: '2,5' }), false],
      ['formigas vazio', rawRef({ ants: '' }), false],
      ['iterações = 0', rawRef({ iterations: '0' }), false],
      ['iterações = 201', rawRef({ iterations: '201' }), false],
      ['α = -0,1', rawRef({ alpha: '-0,1' }), false],
      ['α = 5,1', rawRef({ alpha: '5,1' }), false],
      ['β = 6', rawRef({ beta: '6' }), false],
      ['ρ = 91 %', rawRef({ rhoPct: '91' }), false],
      ['ρ = -1 %', rawRef({ rhoPct: '-1' }), false],
      ['τ₀ = 0', rawRef({ tau0: '0' }), false],
      ['τ₀ = 100,1', rawRef({ tau0: '100,1' }), false],
      ['Q = 0', rawRef({ Q: '0' }), false],
      ['Q = 10001', rawRef({ Q: '10001' }), false],
      ['semente vazia', rawRef({ seed: '' }), false],
      ['semente = 1,5', rawRef({ seed: '1,5' }), false],
      ['limites válidos (α = 0, β = 5, ρ = 90 %)', rawRef({ alpha: '0', beta: '5', rhoPct: '90' }), true],
    ];
    outputs.push('Entradas inválidas (devem bloquear a execução com mensagem clara):');
    for (const [name, raw, shouldPass] of cases) {
      const r = validateConfig(raw);
      const ok = shouldPass ? r.ok : !r.ok && r.errors.length > 0 && r.errors.every((e) => e.message.length > 5);
      outputs.push('  ' + (ok ? '✓' : '✗') + ' ' + name + ' → ' + (r.ok ? 'aceita' : 'bloqueada: ' + r.errors[0].message));
      checks.push({ label: name, pass: ok });
    }
    const pct = validateConfig(rawRef({ rhoPct: '50' }));
    checks.push({ label: 'ρ = 50 % vira fração 0,5', pass: pct.ok && pct.cfg.rho === 0.5 });

    // ρ = 0 %
    const z = new Colony(refCfg({ rho: 0, iterations: 30 }));
    let neverReduced = true;
    let evapUntouched = true;
    while (!z.finished) {
      const rec = z.step();
      for (const e of rec.edges) {
        if (e.evap !== e.before) evapUntouched = false;
        if (e.final < e.before - 1e-15) neverReduced = false;
      }
    }
    outputs.push('ρ = 0 %: evaporação não alterou nenhuma aresta = ' + (evapUntouched ? 'sim' : 'NÃO') + '; feromônio nunca diminuiu em 30 iterações = ' + (neverReduced ? 'sim' : 'NÃO'));
    checks.push({ label: 'ρ = 0 %: evaporação não reduz o feromônio', pass: evapUntouched && neverReduced });

    const zf = new Colony(refCfg({ rho: 0, ants: 1, iterations: 1 }));
    zf.step([[0, 1, 2, 3, 0]]);
    checks.push({ label: 'ρ = 0 %: só os depósitos alteram τ (perímetro 2, diagonais 1)', pass: near(zf.tau[0][1], 2) && near(zf.tau[0][2], 1) });

    const r0 = rows[0];
    const r2 = rows[1];
    let conclusion = 'β = 2: média ' + f(r2.mean, 4) + ' e ótimo (14) em ' + r2.hits + ' de 5 execuções; β = 0: média ' + f(r0.mean, 4) + ' e ótimo em ' + r0.hits + ' de 5. ';
    conclusion += 'Em uma instância com apenas 3 rotas distintas e 10 formigas × 30 iterações, qualquer configuração visita praticamente todas as rotas, por isso a diferença é pequena ou inexistente; o efeito de β só se torna claro em grafos maiores. Todas as entradas inválidas foram bloqueadas com mensagem e ρ = 0 % não reduz o feromônio.';

    return finish({
      id: '6.5',
      title: 'Efeito dos parâmetros e entradas inválidas',
      inputs: ['Instância 6.1; 10 formigas, 30 iterações, α = 1, ρ = 50 %, τ₀ = 1, Q = 14; β ∈ {0, 2}; sementes 1, 2, 3, 4 e 5', 'Bateria de entradas inválidas e ρ = 0 %'],
      outputs,
      checks,
      conclusion,
      table: rows,
    });
  }

  function runAll() {
    return [test61(), test62(), test63(), test64(), test65()];
  }

  return { runAll };
});
