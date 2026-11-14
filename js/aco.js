/*
 * aco.js — Núcleo do Ant System para roteamento de entregas (TSP).
 * Implementação própria, sem bibliotecas. Não depende do DOM, então roda
 * no navegador (window.ACO) e no Node (require) para os testes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ACO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Piso numérico do feromônio por aresta (proteção contra zero). */
  const MIN_TAU = 1e-12;

  /* ------------------------------------------------------------------ *
   * Gerador pseudoaleatório com semente (mulberry32).
   * Todos os sorteios da execução passam por uma única instância.
   * ------------------------------------------------------------------ */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------ Grafo ------------------------------ */

  /** Matriz de distâncias euclidianas d(i,j) = sqrt((xi-xj)^2 + (yi-yj)^2). */
  function distanceMatrix(vertices) {
    const n = vertices.length;
    const d = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = vertices[i].x - vertices[j].x;
        const dy = vertices[i].y - vertices[j].y;
        const v = Math.sqrt(dx * dx + dy * dy);
        d[i][j] = v;
        d[j][i] = v;
      }
    }
    return d;
  }

  /** Comprimento L: soma das arestas percorridas, incluindo o retorno. */
  function routeLength(route, dist) {
    let L = 0;
    for (let k = 0; k < route.length - 1; k++) L += dist[route[k]][route[k + 1]];
    return L;
  }

  /** Uma rota válida começa e termina no depósito e visita cada outro vértice uma vez. */
  function checkRoute(route, n, depot) {
    if (!Array.isArray(route) || route.length !== n + 1) {
      return { valid: false, reason: 'rota incompleta ou com vértices a mais' };
    }
    if (route[0] !== depot || route[n] !== depot) {
      return { valid: false, reason: 'a rota deve começar e terminar no depósito' };
    }
    const seen = new Set();
    for (let k = 1; k < n; k++) {
      const v = route[k];
      if (!Number.isInteger(v) || v < 0 || v >= n || v === depot) {
        return { valid: false, reason: 'vértice intermediário inválido' };
      }
      if (seen.has(v)) return { valid: false, reason: 'vértice repetido' };
      seen.add(v);
    }
    return { valid: true, reason: '' };
  }

  /* --------------------- Escolha do próximo vértice -------------------- */

  /**
   * Para cada candidato j: w(i,j) = tau(i,j)^alpha * (1/d(i,j))^beta e
   * p(i,j) = w(i,j) / soma(w). As probabilidades são calculadas em escala
   * logarítmica (equivalente matematicamente) para evitar overflow/underflow
   * quando alpha/beta são grandes; w é devolvido para exibição.
   */
  function choiceProbabilities(current, candidates, tau, dist, alpha, beta) {
    const items = candidates.map((j) => {
      const t = tau[current][j];
      const d = dist[current][j];
      return {
        j,
        w: Math.pow(t, alpha) * Math.pow(1 / d, beta),
        lw: alpha * Math.log(t) - beta * Math.log(d),
      };
    });
    let maxLw = -Infinity;
    for (const it of items) if (it.lw > maxLw) maxLw = it.lw;
    let sum = 0;
    for (const it of items) {
      it.e = Math.exp(it.lw - maxLw);
      sum += it.e;
    }
    return items.map((it) => ({ j: it.j, w: it.w, p: it.e / sum }));
  }

  /** Sorteio proporcional às probabilidades (roleta). Devolve o vértice escolhido. */
  function pickVertex(items, rng) {
    const r = rng();
    let acc = 0;
    for (const it of items) {
      acc += it.p;
      if (r < acc) return it.j;
    }
    for (let k = items.length - 1; k >= 0; k--) if (items[k].p > 0) return items[k].j;
    return items[items.length - 1].j;
  }

  /** Uma formiga constrói uma rota completa a partir do depósito. */
  function constructTour({ depot, dist, tau, alpha, beta, rng, trace }) {
    const n = dist.length;
    const visited = new Array(n).fill(false);
    visited[depot] = true;
    const route = [depot];
    const steps = trace ? [] : null;
    let current = depot;
    for (let k = 1; k < n; k++) {
      const cands = [];
      for (let j = 0; j < n; j++) if (!visited[j]) cands.push(j);
      const items = choiceProbabilities(current, cands, tau, dist, alpha, beta);
      const chosen = pickVertex(items, rng);
      if (steps) steps.push({ from: current, candidates: items, chosen });
      visited[chosen] = true;
      route.push(chosen);
      current = chosen;
    }
    route.push(depot);
    if (steps) steps.push({ from: current, returnTo: depot, distance: dist[current][depot] });
    return { route, length: routeLength(route, dist), steps };
  }

  /* ------------------------ Atualização do feromônio ----------------------- */

  /**
   * tau_novo(i,j) = (1 - rho) * tau_antigo(i,j) + soma_k delta_k(i,j),
   * com delta_k = Q / L_k se a formiga k percorreu a aresta (contada uma vez
   * por formiga, inclusive o retorno ao depósito). Matriz simétrica, diagonal 0.
   * Devolve também, por aresta, os valores anterior / após evaporação /
   * depósito total / final, usados nos logs.
   */
  function updatePheromone(tau, tours, rho, Q) {
    const n = tau.length;
    const deposit = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const t of tours) {
      const seen = new Set();
      for (let k = 0; k < t.route.length - 1; k++) {
        const a = Math.min(t.route[k], t.route[k + 1]);
        const b = Math.max(t.route[k], t.route[k + 1]);
        const key = a * n + b;
        if (seen.has(key)) continue;
        seen.add(key);
        deposit[a][b] += Q / t.length;
      }
    }
    const next = Array.from({ length: n }, () => new Array(n).fill(0));
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = tau[i][j];
        const evap = (1 - rho) * before;
        const dep = deposit[i][j];
        const fin = Math.max(evap + dep, MIN_TAU);
        next[i][j] = fin;
        next[j][i] = fin;
        edges.push({ i, j, before, evap, deposit: dep, final: fin });
      }
    }
    return { tau: next, edges };
  }

  /* ------------------------------ Colônia ------------------------------ */

  class Colony {
    /**
     * cfg: { vertices:[{id,x,y}], depot:índice, ants, iterations, alpha, beta,
     *        rho (fração 0..0,9), tau0, Q, seed }
     */
    constructor(cfg) {
      this.cfg = cfg;
      this.n = cfg.vertices.length;
      this.dist = distanceMatrix(cfg.vertices);
      this.reset();
    }

    /** Limpa o histórico, restaura tau0 e restabelece a semente. */
    reset() {
      const { n, cfg } = this;
      this.tau = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 0 : cfg.tau0))
      );
      this.rng = mulberry32(cfg.seed);
      this.iteration = 0;
      this.history = [];
      this.bestLength = null; // null = "ainda não calculada"
      this.bestRoute = null;
      this.bestIteration = null;
      this.scaleMax = cfg.tau0; // escala visual cumulativa (só cresce)
    }

    get finished() {
      return this.iteration >= this.cfg.iterations;
    }

    /**
     * Executa uma iteração completa. Todas as formigas usam os feromônios do
     * fim da iteração anterior; evaporação e depósito só ocorrem depois que
     * todas terminam. `forcedRoutes` (apenas para testes controlados) fornece
     * as rotas diretamente, em vez de sorteá-las.
     */
    step(forcedRoutes) {
      if (this.finished) return null;
      const { cfg, dist, n } = this;
      const iteration = this.iteration + 1;
      const tours = [];
      let trace = null;
      for (let k = 0; k < cfg.ants; k++) {
        let route;
        let length;
        if (forcedRoutes) {
          route = forcedRoutes[k % forcedRoutes.length].slice();
          const chk = checkRoute(route, n, cfg.depot);
          if (!chk.valid) throw new Error('Rota forçada inválida: ' + chk.reason);
          length = routeLength(route, dist);
        } else {
          const t = constructTour({
            depot: cfg.depot,
            dist,
            tau: this.tau,
            alpha: cfg.alpha,
            beta: cfg.beta,
            rng: this.rng,
            trace: k === 0,
          });
          route = t.route;
          length = t.length;
          if (k === 0) trace = t.steps;
        }
        tours.push({ ant: k + 1, route, length });
      }

      const upd = updatePheromone(this.tau, tours, cfg.rho, cfg.Q);
      this.tau = upd.tau;

      let iterBest = tours[0];
      let sum = 0;
      for (const t of tours) {
        sum += t.length;
        if (t.length < iterBest.length) iterBest = t;
      }
      const mean = sum / tours.length;

      if (this.bestLength === null || iterBest.length < this.bestLength) {
        this.bestLength = iterBest.length;
        this.bestRoute = iterBest.route.slice();
        this.bestIteration = iteration;
      }

      const scaleBefore = this.scaleMax;
      for (const e of upd.edges) if (e.final > this.scaleMax) this.scaleMax = e.final;

      const record = {
        iteration,
        routes: tours,
        trace,
        iterBestLength: iterBest.length,
        iterBestRoute: iterBest.route.slice(),
        iterBestAnt: iterBest.ant,
        mean,
        bestLength: this.bestLength,
        bestRoute: this.bestRoute.slice(),
        bestIteration: this.bestIteration,
        edges: upd.edges,
        scaleBefore,
        scaleAfter: this.scaleMax,
      };
      this.history.push(record);
      this.iteration = iteration;
      return record;
    }
  }

  /* ------------------------- Formatação (pt-BR) ------------------------- */

  /** Formata número com vírgula decimal; arredonda só na exibição. */
  function fmtNum(x, max) {
    if (max === undefined) max = 6;
    if (x === null || x === undefined) return '—';
    if (!Number.isFinite(x)) return String(x);
    if (x !== 0 && (Math.abs(x) < 1e-4 || Math.abs(x) >= 1e9)) {
      return x.toExponential(3).replace('.', ',');
    }
    return String(+x.toFixed(max)).replace('.', ',');
  }

  function formatEdgeLog(e) {
    return (
      'anterior ' + fmtNum(e.before) +
      '; após evaporação ' + fmtNum(e.evap) +
      '; depósito ' + fmtNum(e.deposit) +
      '; final ' + fmtNum(e.final)
    );
  }

  /* ----------------------------- Validação ----------------------------- */

  /**
   * Valida os campos (como texto) e devolve { ok, errors:[{field,message}], cfg }.
   * Campos de vértice: v<i>.id | v<i>.x | v<i>.y. Demais: vertices, depot,
   * ants, iterations, alpha, beta, rho, tau0, Q, seed.
   */
  function validateConfig(raw) {
    const errors = [];
    const err = (field, message) => errors.push({ field, message });

    const rangeText = (lo, hi) => String(lo).replace('.', ',') + ' e ' + String(hi).replace('.', ',');

    function parseNumber(str, label, o) {
      const s = String(str === undefined || str === null ? '' : str).trim().replace(',', '.');
      if (s === '') return { error: label + ': campo obrigatório.' };
      const re = o.integer ? /^[+-]?\d+$/ : /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
      if (!re.test(s)) {
        return { error: label + ': ' + (o.integer ? 'informe um número inteiro.' : 'informe um número válido.') };
      }
      if (o.maxDecimals !== undefined && (s.split('.')[1] || '').length > o.maxDecimals) {
        return { error: label + ': use no máximo ' + o.maxDecimals + ' casas decimais.' };
      }
      let v = Number(s);
      if (!Number.isFinite(v)) return { error: label + ': valor fora do limite numérico.' };
      if (v === 0) v = 0; // evita -0
      if (o.integer && !Number.isSafeInteger(v)) return { error: label + ': inteiro grande demais.' };
      if (v < o.min || v > o.max) return { error: label + ': deve estar entre ' + rangeText(o.min, o.max) + '.' };
      return { value: v };
    }

    // Vértices
    const vs = raw.vertices || [];
    if (vs.length < 4) err('vertices', 'São necessários pelo menos 4 vértices (há ' + vs.length + ').');
    if (vs.length > 12) err('vertices', 'O máximo é 12 vértices (há ' + vs.length + ').');

    const parsed = [];
    const ids = new Map();
    vs.forEach((v, i) => {
      const id = String(v.id === undefined || v.id === null ? '' : v.id).trim();
      if (id === '') err('v' + i + '.id', 'Identificador obrigatório.');
      else if (id.length > 12) err('v' + i + '.id', 'Use no máximo 12 caracteres.');
      else {
        const key = id.toLowerCase();
        if (ids.has(key)) err('v' + i + '.id', 'Identificador "' + id + '" já usado no vértice ' + (ids.get(key) + 1) + '.');
        else ids.set(key, i);
      }
      const cx = parseNumber(v.x, 'x', { min: 0, max: 1000, maxDecimals: 2 });
      const cy = parseNumber(v.y, 'y', { min: 0, max: 1000, maxDecimals: 2 });
      if (cx.error) err('v' + i + '.x', cx.error);
      if (cy.error) err('v' + i + '.y', cy.error);
      parsed.push({ id, x: cx.value, y: cy.value });
    });
    for (let j = 1; j < parsed.length; j++) {
      if (parsed[j].x === undefined || parsed[j].y === undefined) continue;
      for (let k = 0; k < j; k++) {
        if (parsed[k].x === parsed[j].x && parsed[k].y === parsed[j].y) {
          err('v' + j + '.x', 'Mesmas coordenadas do vértice ' + (k + 1) + ' (distância zero).');
          break;
        }
      }
    }

    // Depósito
    const depot = raw.depot;
    if (!Number.isInteger(depot) || depot < 0 || depot >= vs.length) {
      err('depot', 'Selecione um dos vértices cadastrados como depósito.');
    }

    // Parâmetros
    const P = {};
    const defs = [
      ['ants', raw.ants, 'Número de formigas', { min: 1, max: 100, integer: true }],
      ['iterations', raw.iterations, 'Número de iterações', { min: 1, max: 200, integer: true }],
      ['alpha', raw.alpha, 'Influência do feromônio (α)', { min: 0, max: 5 }],
      ['beta', raw.beta, 'Influência da distância (β)', { min: 0, max: 5 }],
      ['rho', raw.rhoPct, 'Taxa de evaporação (ρ, %)', { min: 0, max: 90 }],
      ['tau0', raw.tau0, 'Feromônio inicial (τ₀)', { min: 0.01, max: 100 }],
      ['Q', raw.Q, 'Constante de depósito (Q)', { min: 0.01, max: 10000 }],
      ['seed', raw.seed, 'Semente aleatória', { min: -9007199254740991, max: 9007199254740991, integer: true }],
    ];
    for (const [field, value, label, o] of defs) {
      const r = parseNumber(value, label, o);
      if (r.error) err(field, r.error);
      else P[field] = r.value;
    }

    if (errors.length) return { ok: false, errors, cfg: null };
    return {
      ok: true,
      errors: [],
      cfg: {
        vertices: parsed,
        depot,
        ants: P.ants,
        iterations: P.iterations,
        alpha: P.alpha,
        beta: P.beta,
        rho: P.rho / 100, // percentual -> fração
        tau0: P.tau0,
        Q: P.Q,
        seed: P.seed,
      },
    };
  }

  return {
    MIN_TAU,
    mulberry32,
    distanceMatrix,
    routeLength,
    checkRoute,
    choiceProbabilities,
    pickVertex,
    constructTour,
    updatePheromone,
    Colony,
    validateConfig,
    fmtNum,
    formatEdgeLog,
  };
});
