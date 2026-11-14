/*
 * app.js — Interface do simulador (HTML/CSS/JS puros, sem bibliotecas).
 * Toda a lógica do Ant System está em js/aco.js; aqui só há tela e controles.
 */
(function () {
  'use strict';

  const { Colony, validateConfig, fmtNum } = window.ACO;

  /* ------------------------------ utilidades ------------------------------ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function setAttrs(el, attrs) {
    if (!attrs) return;
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  function addKids(el, kids) {
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    setAttrs(el, attrs);
    addKids(el, kids);
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    setAttrs(el, attrs);
    addKids(el, kids);
    return el;
  }
  const f4 = (x) => fmtNum(x, 4);
  const pct = (p) => fmtNum(p * 100, 2) + ' %';

  /* ------------------------------ cenários ------------------------------ */
  const PRESETS = {
    padrao: {
      vertices: [
        ['A', 150, 120], ['B', 420, 60], ['C', 780, 140], ['D', 900, 420],
        ['E', 720, 700], ['F', 430, 880], ['G', 160, 740], ['H', 400, 430],
        ['I', 610, 330], ['J', 260, 520],
      ],
      params: { ants: 15, iterations: 60, alpha: 1, beta: 2, rho: 10, tau0: 1, Q: 1000, seed: 42 },
    },
    referencia: {
      vertices: [['A', 0, 0], ['B', 3, 0], ['C', 3, 4], ['D', 0, 4]],
      params: { ants: 10, iterations: 30, alpha: 1, beta: 2, rho: 50, tau0: 1, Q: 14, seed: 42 },
    },
  };
  const PARAM_KEYS = ['ants', 'iterations', 'alpha', 'beta', 'rho', 'tau0', 'Q', 'seed'];

  /* -------------------------------- estado -------------------------------- */
  const draft = { vertices: [], depot: 0 }; // texto digitado (ainda não validado)
  let colony = null;        // execução aplicada
  let appliedSig = null;    // assinatura da configuração aplicada
  let lastValidation = null;
  let status = 'ready';     // ready | running | paused | finished
  let timer = null;
  let hoverEdge = null;
  let selEdge = null;
  let hl = null;            // destaque de um passo da construção: {iteration, step}
  let logIter = null;

  /* ------------------------ formulário de vértices ------------------------ */
  function renderVertexList() {
    const box = $('#vertexList');
    box.textContent = '';
    draft.vertices.forEach((v, i) => {
      const mk = (key, label, mode) =>
        h('input', {
          type: 'text', inputmode: mode, autocomplete: 'off', 'data-key': key,
          'aria-label': label + ' do vértice ' + (i + 1), value: v[key], maxlength: key === 'id' ? 12 : 12,
          oninput: (e) => {
            draft.vertices[i][key] = e.target.value;
            updateDepotOptions();
            onEdited();
          },
        });
      box.append(
        h('div', { class: 'vrow', 'data-i': i },
          h('div', { class: 'vrow-main' },
            h('span', { class: 'vidx', text: String(i + 1) }),
            mk('id', 'Identificador', 'text'),
            mk('x', 'Coordenada x', 'decimal'),
            mk('y', 'Coordenada y', 'decimal'),
            h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': 'Remover vértice ' + (i + 1), title: 'Remover vértice',
              disabled: draft.vertices.length <= 1, text: '✕', onclick: () => removeVertex(i),
            })),
          h('div', { class: 'rowerr' }))
      );
    });
    $('#btnAddVertex').disabled = draft.vertices.length >= 12;
    updateDepotOptions();
  }

  function updateDepotOptions() {
    const sel = $('#f-depot');
    sel.textContent = '';
    draft.vertices.forEach((v, i) => {
      const id = String(v.id).trim();
      sel.append(h('option', { value: String(i), text: id === '' ? '(vértice ' + (i + 1) + ')' : id }));
    });
    sel.value = String(draft.depot);
  }

  function nextFreeId() {
    const used = new Set(draft.vertices.map((v) => String(v.id).trim().toLowerCase()));
    for (let k = 0; k < 26; k++) {
      const c = String.fromCharCode(65 + k);
      if (!used.has(c.toLowerCase())) return c;
    }
    let k = 1;
    while (used.has('v' + k)) k++;
    return 'V' + k;
  }

  function nextFreePoint() {
    const taken = new Set(draft.vertices.map((v) => String(v.x).trim() + '|' + String(v.y).trim()));
    for (let k = 1; k < 1000; k++) {
      const x = Math.round(((k * 0.618034 * 1000) % 1000) * 100) / 100;
      const y = Math.round(((k * 0.414214 * 1000 + 250) % 1000) * 100) / 100;
      if (!taken.has(x + '|' + y)) return [String(x), String(y)];
    }
    return ['500', '500'];
  }

  function addVertex() {
    if (draft.vertices.length >= 12) return;
    const [x, y] = nextFreePoint();
    draft.vertices.push({ id: nextFreeId(), x, y });
    renderVertexList();
    onEdited();
  }

  function removeVertex(i) {
    if (draft.vertices.length <= 1) return;
    draft.vertices.splice(i, 1);
    if (i < draft.depot) draft.depot--;
    else if (i === draft.depot) draft.depot = 0;
    draft.depot = Math.min(draft.depot, draft.vertices.length - 1);
    renderVertexList();
    onEdited();
  }

  /* ----------------------------- validação ----------------------------- */
  function readRaw() {
    const raw = { vertices: draft.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y })), depot: draft.depot };
    PARAM_KEYS.forEach((k) => { raw[k === 'rho' ? 'rhoPct' : k] = $('#f-' + k).value; });
    return raw;
  }

  function showErrors(errors) {
    $$('.err').forEach((e) => { e.textContent = ''; });
    $$('.rowerr').forEach((e) => { e.textContent = ''; });
    $$('[aria-invalid="true"]').forEach((e) => e.removeAttribute('aria-invalid'));
    const list = [];
    errors.forEach((er) => {
      const m = /^v(\d+)\.(id|x|y)$/.exec(er.field);
      if (m) {
        const row = $('.vrow[data-i="' + m[1] + '"]');
        if (row) {
          const inp = $('[data-key="' + m[2] + '"]', row);
          if (inp) inp.setAttribute('aria-invalid', 'true');
          const re = $('.rowerr', row);
          re.textContent += (re.textContent ? ' ' : '') + er.message;
        }
        list.push('Vértice ' + (+m[1] + 1) + ' — ' + er.message);
      } else {
        const t = $('#e-' + er.field);
        if (t) t.textContent += (t.textContent ? ' ' : '') + er.message;
        const inp = $('#f-' + er.field);
        if (inp) inp.setAttribute('aria-invalid', 'true');
        list.push(er.message);
      }
    });
    const box = $('#summaryErr');
    box.textContent = '';
    if (list.length) {
      box.append(
        h('strong', { text: list.length === 1 ? 'Há 1 problema que impede a execução:' : 'Há ' + list.length + ' problemas que impedem a execução:' }),
        h('ul', null, list.slice(0, 8).map((m) => h('li', { text: m })), list.length > 8 ? h('li', { text: '… e mais ' + (list.length - 8) + '.' }) : null)
      );
      box.hidden = false;
    } else box.hidden = true;
  }

  function revalidate() {
    lastValidation = validateConfig(readRaw());
    showErrors(lastValidation.errors);
    updateButtons();
  }

  function isPending() {
    return !!(lastValidation && lastValidation.ok && JSON.stringify(lastValidation.cfg) !== appliedSig);
  }

  function onEdited() {
    if (status === 'running') pause();
    revalidate();
    updateStatus();
  }

  /* ------------------------------ controles ------------------------------ */
  function updateButtons() {
    const valid = !!(lastValidation && lastValidation.ok);
    const pending = isPending();
    const canRun = valid && !pending && colony && !colony.finished;
    $('#btnRun').disabled = !(canRun && status !== 'running');
    $('#btnPause').disabled = status !== 'running';
    $('#btnStep').disabled = !canRun;
    $('#btnReset').disabled = !valid;
    $('#pendingBanner').hidden = !(valid && pending);
  }

  function updateStatus() {
    const el = $('#statusText');
    el.textContent = '';
    if (!colony) return;
    const valid = !!(lastValidation && lastValidation.ok);
    let msg;
    if (!valid) msg = 'Corrija os campos destacados para liberar a execução.';
    else if (isPending()) msg = 'Alterações pendentes: clique em Reiniciar para aplicá-las.';
    else if (status === 'running') msg = 'Executando… (iteração ' + colony.iteration + ' de ' + colony.cfg.iterations + ')';
    else if (status === 'paused') msg = 'Pausado na iteração ' + colony.iteration + ' de ' + colony.cfg.iterations + '. O estado foi preservado.';
    else if (status === 'finished') msg = 'Execução concluída após ' + colony.cfg.iterations + ' iterações.';
    else msg = 'Pronto. Semente ' + colony.cfg.seed + ', ' + colony.cfg.ants + ' formigas, ' + colony.cfg.iterations + ' iterações.';
    el.textContent = msg;
  }

  function stopTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function pause() {
    stopTimer();
    if (status === 'running') status = 'paused';
    updateButtons();
    updateStatus();
  }

  function run() {
    if ($('#btnRun').disabled) return;
    status = 'running';
    updateButtons();
    updateStatus();
    tick();
  }

  function tick() {
    if (status !== 'running') return;
    doStep();
    if (status === 'running') timer = setTimeout(tick, Number($('#speed').value));
  }

  function doStep() {
    const rec = colony.step();
    if (!rec) return;
    logIter = rec.iteration;
    if (colony.finished) { status = 'finished'; stopTimer(); }
    renderAll();
    const wrap = $('#historyWrap');
    wrap.scrollTop = wrap.scrollHeight;
  }

  function stepOnce() {
    if ($('#btnStep').disabled) return;
    if (status === 'running') { stopTimer(); status = 'paused'; }
    doStep();
    if (status !== 'finished') status = 'paused';
    updateButtons();
    updateStatus();
  }

  function applyConfig() {
    stopTimer();
    const res = validateConfig(readRaw());
    lastValidation = res;
    showErrors(res.errors);
    if (!res.ok) { updateButtons(); return false; }
    colony = new Colony(res.cfg);
    appliedSig = JSON.stringify(res.cfg);
    status = 'ready';
    hoverEdge = null; selEdge = null; hl = null; logIter = null;
    renderAll();
    return true;
  }

  function loadPreset(key) {
    const p = PRESETS[key];
    draft.vertices = p.vertices.map(([id, x, y]) => ({ id, x: String(x), y: String(y) }));
    draft.depot = 0;
    PARAM_KEYS.forEach((k) => { $('#f-' + k).value = String(p.params[k]); });
    renderVertexList();
    applyConfig();
  }

  /* ------------------------------- métricas ------------------------------- */
  function setMetric(sel, value) {
    const el = $(sel);
    if (value === null) { el.textContent = 'ainda não calculada'; el.classList.add('na'); }
    else { el.textContent = value; el.classList.remove('na'); }
  }

  const routeText = (route) => route.map((i) => colony.cfg.vertices[i].id).join(' → ');

  function renderMetrics() {
    const last = colony.history[colony.history.length - 1];
    $('#m-iter').textContent = colony.iteration + ' / ' + colony.cfg.iterations;
    setMetric('#m-iterbest', last ? f4(last.iterBestLength) : null);
    setMetric('#m-mean', last ? f4(last.mean) : null);
    setMetric('#m-best', colony.bestLength === null ? null : f4(colony.bestLength));

    const box = $('#bestRoute');
    box.textContent = '';
    if (colony.bestRoute === null) {
      box.append(h('p', { class: 'na', text: 'Ainda não calculada. Execute ou avance uma iteração.' }));
    } else {
      const seqEl = h('div', { class: 'seq' });
      colony.bestRoute.forEach((v, k) => {
        if (k > 0) seqEl.append(h('span', { class: 'arrow', text: '→' }));
        seqEl.append(colony.cfg.vertices[v].id);
      });
      box.append(
        seqEl,
        h('p', null, 'Distância total: ', h('strong', { text: f4(colony.bestLength) }), ' · encontrada na iteração ' + colony.bestIteration + ' (a rota inclui o retorno ao depósito).')
      );
    }
  }

  /* -------------------------------- grafo -------------------------------- */
  const GW = 760, GH = 560, GP = 66;

  function layout() {
    const V = colony.cfg.vertices;
    const xs = V.map((v) => v.x), ys = V.map((v) => v.y);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    const sx = (GW - 2 * GP) / Math.max(maxx - minx, 1e-6);
    const sy = (GH - 2 * GP) / Math.max(maxy - miny, 1e-6);
    const k = Math.min(sx, sy);
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    return V.map((v) => ({ x: GW / 2 + (v.x - cx) * k, y: GH / 2 - (v.y - cy) * k }));
  }

  // Escala visual cumulativa: nunca diminui, e começa em 4·τ₀ para que o estado inicial
  // não pareça "saturado". A espessura máxima corresponde a τ = refScale().
  const refOf = (x) => Math.max(x, 4 * colony.cfg.tau0);
  const refScale = () => refOf(colony.scaleMax);

  function edgeStyle(tau) {
    const r = Math.min(1, tau / refScale());
    return { width: 0.8 + 4.6 * r, opacity: 0.12 + 0.78 * r };
  }

  function line(a, b, attrs) {
    return s('line', Object.assign({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, attrs));
  }

  function shortened(a, b, r1, r2) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return [{ x: a.x + (dx / len) * r1, y: a.y + (dy / len) * r1 }, { x: b.x - (dx / len) * r2, y: b.y - (dy / len) * r2 }];
  }

  function renderGraph() {
    const svg = $('#graph');
    svg.textContent = '';
    const V = colony.cfg.vertices, n = V.length, P = layout();
    const mode = $('#labelMode').value;

    svg.append(
      s('defs', null,
        s('marker', { id: 'arrBest', viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' },
          s('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--best)' })),
        s('marker', { id: 'arrTrace', viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 4.5, markerHeight: 4.5, orient: 'auto' },
          s('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--trace)' })))
    );

    const gEdges = s('g'), gSel = s('g'), gBest = s('g'), gTrace = s('g'), gLabels = s('g'), gHit = s('g'), gNodes = s('g');
    svg.append(gSel, gEdges, gBest, gTrace, gLabels, gNodes, gHit);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const tau = colony.tau[i][j], d = colony.dist[i][j];
        const st = edgeStyle(tau);
        if (selEdge && selEdge[0] === i && selEdge[1] === j) {
          gSel.append(line(P[i], P[j], { class: 'edge-sel', 'stroke-width': st.width + 8 }));
        }
        gEdges.append(line(P[i], P[j], { class: 'edge', 'stroke-width': st.width.toFixed(2), 'stroke-opacity': st.opacity.toFixed(3) }));
        if (mode !== 'none') {
          const t = 0.5;
          gLabels.append(s('text', { class: 'elabel', x: P[i].x + (P[j].x - P[i].x) * t, y: P[i].y + (P[j].y - P[i].y) * t + 4 },
            mode === 'tau' ? f4(tau) : f4(d)));
        }
        const hit = line(P[i], P[j], { class: 'edge-hit' });
        hit.append(s('title', null, V[i].id + '–' + V[j].id + ' · distância d = ' + f4(d) + ' · feromônio τ = ' + f4(tau)));
        hit.addEventListener('mouseenter', () => { hoverEdge = [i, j]; renderEdgeInfo(); });
        hit.addEventListener('mouseleave', () => { hoverEdge = null; renderEdgeInfo(); });
        hit.addEventListener('click', () => {
          selEdge = selEdge && selEdge[0] === i && selEdge[1] === j ? null : [i, j];
          renderGraph();
          renderEdgeInfo();
        });
        gHit.append(hit);
      }
    }

    // Melhor rota acumulada
    if (colony.bestRoute) {
      const r = colony.bestRoute;
      for (let k = 0; k < r.length - 1; k++) {
        const [a, b] = shortened(P[r[k]], P[r[k + 1]], 17, 20);
        gBest.append(line(a, b, { class: 'best', 'marker-end': 'url(#arrBest)' }));
      }
    }

    drawTrace(gTrace, P);

    // Vértices
    V.forEach((v, i) => {
      const isDepot = i === colony.cfg.depot;
      const g = s('g');
      g.append(
        s('title', null, v.id + ' (' + fmtNum(v.x, 2) + '; ' + fmtNum(v.y, 2) + ')' + (isDepot ? ' · depósito' : '')),
        s('circle', { class: 'node' + (isDepot ? ' depot' : ''), cx: P[i].x, cy: P[i].y, r: isDepot ? 16 : 13 }),
        s('text', { class: 'vlabel', x: P[i].x, y: P[i].y - 22 }, v.id)
      );
      if (isDepot) g.append(s('text', { class: 'vsub', x: P[i].x, y: P[i].y + 32 }, 'depósito'));
      gNodes.append(g);
    });

    renderLegend();
  }

  function drawTrace(layer, P) {
    if (!hl) return;
    const rec = colony.history[hl.iteration - 1];
    if (!rec || !rec.trace) return;
    const steps = rec.trace;
    for (let k = 0; k < hl.step; k++) {
      const st = steps[k];
      layer.append(line(P[st.from], P[st.chosen !== undefined ? st.chosen : st.returnTo], { class: 'tr-done' }));
    }
    const st = steps[hl.step];
    if (!st) return;
    if (st.candidates) {
      st.candidates.forEach((c) => {
        if (c.j === st.chosen) return;
        layer.append(line(P[st.from], P[c.j], { class: 'tr-cand' }));
      });
      const [a, b] = shortened(P[st.from], P[st.chosen], 17, 20);
      layer.append(line(a, b, { class: 'tr-pick', 'marker-end': 'url(#arrTrace)' }));
      st.candidates.forEach((c) => {
        const t = c.j === st.chosen ? 0.45 : 0.6;
        layer.append(s('text', { class: 'plabel', x: P[st.from].x + (P[c.j].x - P[st.from].x) * t, y: P[st.from].y + (P[c.j].y - P[st.from].y) * t - 6 }, pct(c.p)));
      });
    } else {
      const [a, b] = shortened(P[st.from], P[st.returnTo], 17, 20);
      layer.append(line(a, b, { class: 'tr-pick', 'marker-end': 'url(#arrTrace)' }));
    }
    layer.append(s('circle', { class: 'tr-ring', cx: P[st.from].x, cy: P[st.from].y, r: 21 }));
  }

  function renderLegend() {
    const box = $('#legend');
    box.textContent = '';
    const ref = refScale();
    const sample = (frac) => {
      const st = edgeStyle(ref * frac);
      return h('span', { class: 'sample' },
        s('svg', { viewBox: '0 0 44 14' }, s('line', { x1: 2, y1: 7, x2: 42, y2: 7, stroke: 'var(--accent)', 'stroke-linecap': 'round', 'stroke-width': st.width, 'stroke-opacity': st.opacity })),
        'τ = ' + f4(ref * frac));
    };
    const last = colony.history[colony.history.length - 1];
    const changed = last && refOf(last.scaleAfter) > refOf(last.scaleBefore);
    const rows = [
      h('div', { class: 'row' }, h('strong', { text: 'Feromônio (τ):' }), sample(1), sample(0.5), sample(0.1), 'quanto mais grossa e opaca, mais feromônio.'),
      h('div', { class: 'row' },
        h('span', { class: 'sample' }, s('svg', { viewBox: '0 0 44 14' }, s('line', { x1: 2, y1: 7, x2: 38, y2: 7, stroke: 'var(--best)', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'marker-end': 'url(#arrBest)' })), 'melhor rota acumulada'),
        h('span', { class: 'sample' }, s('svg', { viewBox: '0 0 44 14' }, s('line', { x1: 2, y1: 7, x2: 42, y2: 7, stroke: 'var(--trace)', 'stroke-width': 2, 'stroke-dasharray': '6 5' })), 'candidatos do passo selecionado (% = probabilidade)')),
      h('div', { class: 'note', text: 'Escala visual: a espessura máxima corresponde a τ = ' + f4(ref) + '. A escala é cumulativa (só aumenta), então uma aresta cujo τ diminuiu aparece mais fina. A distância d é um custo fixo da aresta e não muda durante a execução.' })
    ];
    if (changed) rows.push(h('div', { class: 'chg', text: 'A escala aumentou nesta iteração: de τ = ' + f4(refOf(last.scaleBefore)) + ' para τ = ' + f4(refOf(last.scaleAfter)) + '. Arestas com o mesmo τ de antes parecem mais finas.' }));
    box.append(...rows);
  }

  function renderEdgeInfo() {
    const box = $('#edgeInfo');
    box.textContent = '';
    const e = hoverEdge || selEdge;
    if (!e) {
      box.append('Passe o cursor sobre uma aresta, ou clique nela para fixar, e veja sua distância e seu feromônio.');
      return;
    }
    const V = colony.cfg.vertices, [i, j] = e;
    box.append(
      h('b', { text: 'Aresta ' + V[i].id + '–' + V[j].id }),
      ' · distância d = ', h('b', { text: f4(colony.dist[i][j]) }),
      ' · feromônio atual τ = ', h('b', { text: f4(colony.tau[i][j]) })
    );
    const last = colony.history[colony.history.length - 1];
    if (last) {
      const u = last.edges.find((x) => x.i === i && x.j === j);
      box.append(h('div', { class: 'mono', text: 'Última atualização (iteração ' + last.iteration + '): ' + window.ACO.formatEdgeLog(u) }));
    }
    if (selEdge) box.append(h('div', { class: 'hint', text: 'Aresta fixada; clique nela de novo para soltar.' }));
  }

  /* ------------------------------- gráfico ------------------------------- */
  function renderChart() {
    const svg = $('#chart');
    svg.textContent = '';
    const H = colony.history;
    const W = 760, Ht = 290, m = { l: 62, r: 18, t: 34, b: 36 };
    if (!H.length) {
      svg.append(s('text', { x: W / 2, y: Ht / 2, 'text-anchor': 'middle' }, 'Execute ao menos uma iteração para ver o gráfico.'));
      return;
    }
    const series = [
      { key: 'iterBestLength', name: 'Menor da iteração', cls: 's1' },
      { key: 'mean', name: 'Média das formigas', cls: 's2' },
      { key: 'bestLength', name: 'Melhor acumulada', cls: 's3' },
    ];
    let lo = Infinity, hi = -Infinity;
    H.forEach((r) => series.forEach((se) => { lo = Math.min(lo, r[se.key]); hi = Math.max(hi, r[se.key]); }));
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const padY = (hi - lo) * 0.08;
    lo -= padY; hi += padY;
    const N = colony.cfg.iterations;
    const X = (it) => m.l + (N === 1 ? (W - m.l - m.r) / 2 : ((it - 1) / (N - 1)) * (W - m.l - m.r));
    const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (Ht - m.t - m.b);

    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, y = Y(v);
      svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y, y2: y }), s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end' }, fmtNum(v, 2)));
    }
    const ticks = Math.min(N, 8);
    for (let k = 0; k < ticks; k++) {
      const it = ticks === 1 ? 1 : Math.round(1 + (k * (N - 1)) / (ticks - 1));
      svg.append(s('text', { x: X(it), y: Ht - 12, 'text-anchor': 'middle' }, String(it)));
    }
    svg.append(
      s('line', { class: 'axis', x1: m.l, x2: m.l, y1: m.t, y2: Ht - m.b }),
      s('line', { class: 'axis', x1: m.l, x2: W - m.r, y1: Ht - m.b, y2: Ht - m.b }),
      s('text', { x: (m.l + W - m.r) / 2, y: Ht - 2, 'text-anchor': 'middle' }, 'iteração (o eixo vertical não começa em zero)')
    );
    series.forEach((se) => {
      const pts = H.map((r) => X(r.iteration).toFixed(1) + ',' + Y(r[se.key]).toFixed(1)).join(' ');
      svg.append(s('polyline', { class: 'line ' + se.cls, points: pts }));
      H.forEach((r) => {
        const c = s('circle', { class: se.cls, cx: X(r.iteration), cy: Y(r[se.key]), r: H.length > 80 ? 1.6 : 3 });
        c.append(s('title', null, se.name + ' · iteração ' + r.iteration + ': ' + f4(r[se.key])));
        svg.append(c);
      });
    });
    let lx = m.l;
    series.forEach((se) => {
      svg.append(s('line', { class: 'line ' + se.cls, x1: lx, x2: lx + 22, y1: 14, y2: 14 }), s('text', { class: 'legend-t', x: lx + 28, y: 18 }, se.name));
      lx += 190;
    });
  }

  /* ---------------------------- histórico e logs ---------------------------- */
  function renderHistory() {
    const tb = $('#historyTable tbody');
    tb.textContent = '';
    tb.append(h('tr', { class: 'init' },
      h('td', { text: '0 (início)' }),
      h('td', { colspan: 4, text: 'τ = ' + f4(colony.cfg.tau0) + ' em todas as arestas · nenhuma rota calculada · melhor distância: ainda não calculada' })));
    colony.history.forEach((r) => {
      tb.append(h('tr', { class: 'clickable' + (r.iteration === logIter ? ' sel' : ''), onclick: () => { logIter = r.iteration; renderHistory(); renderLogs(); } },
        h('td', { text: String(r.iteration) }),
        h('td', { class: 'num', text: f4(r.iterBestLength) }),
        h('td', { class: 'num', text: f4(r.mean) }),
        h('td', { class: 'num', text: f4(r.bestLength) }),
        h('td', { text: routeText(r.iterBestRoute) })));
    });
  }

  function renderLogs() {
    const sel = $('#logIter');
    sel.textContent = '';
    colony.history.forEach((r) => sel.append(h('option', { value: String(r.iteration), text: String(r.iteration) })));
    const box = $('#logs');
    box.textContent = '';
    if (!colony.history.length) {
      sel.disabled = true;
      box.append(h('p', { class: 'empty', text: 'Nenhuma iteração concluída ainda. Os registros da construção das rotas e da atualização do feromônio aparecem aqui.' }));
      return;
    }
    sel.disabled = false;
    if (logIter === null || logIter > colony.iteration) logIter = colony.iteration;
    sel.value = String(logIter);
    const rec = colony.history[logIter - 1];
    const V = colony.cfg.vertices;
    const id = (i) => V[i].id;

    // 1) Rotas e comprimentos de todas as formigas
    const antRows = rec.routes.map((r) => h('tr', null,
      h('td', { text: String(r.ant) }), h('td', { text: routeText(r.route) }), h('td', { class: 'num', text: f4(r.length) })));
    box.append(h('details', null,
      h('summary', { text: 'Rota e comprimento de cada formiga (' + rec.routes.length + ')' }),
      h('div', { class: 'tablewrap tall' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', { text: 'Formiga' }), h('th', { text: 'Rota' }), h('th', { class: 'num', text: 'Comprimento L' }))),
        h('tbody', null, antRows))),
      h('p', { class: 'logmeta', text: 'Menor da iteração: ' + f4(rec.iterBestLength) + ' (formiga ' + rec.iterBestAnt + ') · média: ' + f4(rec.mean) + ' · melhor acumulada: ' + f4(rec.bestLength) })));

    // 2) Construção passo a passo (formiga 1)
    const stepRows = rec.trace.map((st, k) => {
      let cells;
      if (st.candidates) {
        cells = [
          h('td', { text: String(k + 1) }),
          h('td', { text: id(st.from) }),
          h('td', null, h('ul', { class: 'cands' }, st.candidates.map((c) =>
            h('li', { class: c.j === st.chosen ? 'picked' : '' }, id(c.j) + ': w = ' + fmtNum(c.w, 6) + ' · p = ' + pct(c.p))))),
          h('td', { text: id(st.chosen) + ' (d = ' + f4(colony.dist[st.from][st.chosen]) + ')' }),
        ];
      } else {
        cells = [
          h('td', { text: String(k + 1) }), h('td', { text: id(st.from) }),
          h('td', { text: 'todos os vértices visitados: retorno obrigatório ao depósito' }),
          h('td', { text: id(st.returnTo) + ' (d = ' + f4(st.distance) + ')' }),
        ];
      }
      const tr = h('tr', { class: 'clickable steprow' + (hl && hl.iteration === rec.iteration && hl.step === k ? ' sel' : ''), 'data-step': k, tabindex: 0, title: 'Clique para destacar este passo no grafo' }, cells);
      const act = () => {
        hl = { iteration: rec.iteration, step: k };
        renderGraph();
        $$('.steprow').forEach((r) => r.classList.toggle('sel', Number(r.dataset.step) === k));
        $('#graph').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      tr.addEventListener('click', act);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      return tr;
    });
    const r1 = rec.routes[0];
    box.append(h('details', { open: true },
      h('summary', { text: 'Construção da rota da formiga 1 (candidatos, pesos w, probabilidades p e escolha)' }),
      h('div', { class: 'tablewrap tall' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', { text: 'Passo' }), h('th', { text: 'Vértice atual' }), h('th', { text: 'Candidatos (não visitados)' }), h('th', { text: 'Escolhido' }))),
        h('tbody', null, stepRows))),
      h('p', { class: 'logmeta' }, 'Rota: ' + routeText(r1.route) + ' · comprimento L = ' + f4(r1.length) + '. Todas as formigas da iteração usaram os mesmos feromônios, do fim da iteração anterior. ',
        h('button', { type: 'button', class: 'btn small', onclick: () => { hl = null; renderGraph(); $$('.steprow').forEach((r) => r.classList.remove('sel')); }, text: 'Limpar destaque no grafo' }))));

    // 3) Atualização do feromônio
    const c = colony.cfg;
    const edgeRows = rec.edges.map((e) => h('tr', null,
      h('td', { text: id(e.i) + '–' + id(e.j) }),
      h('td', { class: 'num', text: fmtNum(e.before, 6) }),
      h('td', { class: 'num', text: fmtNum(e.evap, 6) }),
      h('td', { class: 'num', text: fmtNum(e.deposit, 6) }),
      h('td', { class: 'num', text: fmtNum(e.final, 6) })));
    const logLines = rec.edges.map((e) => id(e.i) + id(e.j) + ': ' + window.ACO.formatEdgeLog(e)).join('\n');
    box.append(h('details', null,
      h('summary', { text: 'Atualização do feromônio (evaporação e depósito)' }),
      h('p', { class: 'logmeta', text: 'τ_novo = (1 − ρ) · τ_antigo + Σ Δτ, com ρ = ' + fmtNum(c.rho, 6) + ' e Δτ = Q/L = ' + fmtNum(c.Q, 6) + '/L por formiga que usou a aresta (retorno ao depósito incluído). Piso numérico: 10⁻¹².' }),
      h('div', { class: 'tablewrap tall' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', { text: 'Aresta' }), h('th', { class: 'num', text: 'Anterior' }), h('th', { class: 'num', text: 'Após evaporação' }), h('th', { class: 'num', text: 'Depósito total' }), h('th', { class: 'num', text: 'Final' }))),
        h('tbody', null, edgeRows))),
      h('details', null, h('summary', { text: 'Ver em formato de log' }), h('pre', { class: 'logtext', text: logLines }))));
  }

  function renderEdgeTable() {
    const t = $('#edgeTable');
    t.textContent = '';
    const V = colony.cfg.vertices, n = V.length;
    const last = colony.history[colony.history.length - 1];
    t.append(h('thead', null, h('tr', null,
      h('th', { text: 'Aresta' }), h('th', { class: 'num', text: 'Distância d (fixa)' }), h('th', { class: 'num', text: 'Feromônio τ atual' }), h('th', { class: 'num', text: 'Depósito na última iteração' }))));
    const body = h('tbody');
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const u = last ? last.edges.find((x) => x.i === i && x.j === j) : null;
        body.append(h('tr', null,
          h('td', { text: V[i].id + '–' + V[j].id }),
          h('td', { class: 'num', text: f4(colony.dist[i][j]) }),
          h('td', { class: 'num', text: f4(colony.tau[i][j]) }),
          h('td', { class: 'num', text: u ? f4(u.deposit) : '—' })));
      }
    }
    t.append(body);
  }

  /* ------------------------------ renderização ------------------------------ */
  function renderAll() {
    renderMetrics();
    renderGraph();
    renderEdgeInfo();
    renderChart();
    renderHistory();
    renderLogs();
    renderEdgeTable();
    updateButtons();
    updateStatus();
  }

  /* ----------------------------- inicialização ----------------------------- */
  function init() {
    $('#btnAddVertex').addEventListener('click', addVertex);
    $('#f-depot').addEventListener('change', (e) => { draft.depot = Number(e.target.value); onEdited(); });
    PARAM_KEYS.forEach((k) => $('#f-' + k).addEventListener('input', onEdited));
    $('#btnRun').addEventListener('click', run);
    $('#btnPause').addEventListener('click', pause);
    $('#btnStep').addEventListener('click', stepOnce);
    $('#btnReset').addEventListener('click', () => { applyConfig(); });
    $('#presetPadrao').addEventListener('click', () => loadPreset('padrao'));
    $('#presetRef').addEventListener('click', () => loadPreset('referencia'));
    $('#labelMode').addEventListener('change', () => { if (colony) renderGraph(); });
    $('#logIter').addEventListener('change', (e) => { logIter = Number(e.target.value); renderHistory(); renderLogs(); });
    $('#speed').addEventListener('input', (e) => { $('#speedOut').textContent = e.target.value + ' ms'; });
    // No GitHub Pages (usuario.github.io/repositorio) o link do repositório é montado sozinho.
    (function () {
      const m = /^([^.]+)\.github\.io$/i.exec(location.hostname);
      const repo = location.pathname.split('/').filter(Boolean)[0];
      if (m && repo) $('#repoLink').href = 'https://github.com/' + m[1] + '/' + repo;
      $('#repoLink2').href = $('#repoLink').href;
    })();
    loadPreset('padrao');
  }

  init();
})();
