/**
 * Indicadores (indicadores.html) — o Observatório da Transformação.
 *
 * Tudo é calculado no navegador a partir dos mesmos arquivos das outras
 * páginas: iniciativas (data.js), trilhas e notícias (conteudo.js). As
 * derivações moram em metricas.js; aqui só se filtra e se desenha.
 *
 * Filtros de período, área e tema ficam na hash (#periodo=mes&area=…&tema=…)
 * para o link poder ser compartilhado. Nada de dado inventado: o que não tem
 * fonte não aparece. Todo texto entra por textContent.
 */

import { criar, plural, lerHash, escreverHash } from './ui.js';
import { carregarPortal, criarSlug } from './data.js';
import { montarCasca, revelar, entrarEmCena } from './shell.js';
import { carregarArtigos, carregarTrilhas, dataCurta } from './conteudo.js';
import * as M from './metricas.js';

const $ = (sel) => document.querySelector(sel);
const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, atributos = {}) {
  const no = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) if (v !== null && v !== undefined) no.setAttribute(k, String(v));
  return no;
}

/** Laranja com intensidade proporcional (0..1), sem cor solta: mistura o token. */
const laranjaA = (f) => `color-mix(in srgb, var(--laranja) ${Math.round(f * 100)}%, transparent)`;

const ICONES_KPI = {
  projetos: ['M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z'],
  etapas: ['M9 6h11M9 12h11M9 18h11', 'M4 6h.01M4 12h.01M4 18h.01'],
  implantadas: ['M5 21V4.5M5 5h11l-1.6 3.2L16 11.5H5'],
  areas: ['M17 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20', 'M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3', 'M10 4.1a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z', 'M17.5 4.9a2.6 2.6 0 1 1 0 5.2'],
  trilhas: ['M12 7.5 2.5 4.2 12 1l9.5 3.2Z', 'M6 9.4v5.2c0 1.7 2.7 3.1 6 3.1s6-1.4 6-3.1V9.4', 'M21.5 4.2v6'],
  artigos: ['M5 3.5h9l5 5V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20Z', 'M14 3.5v5h5M8.5 12.5h7M8.5 16h5'],
  aulas: ['M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5ZM10.5 9.5v5l4-2.5Z'],
  horas: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2'],
  categorias: ['M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-6.1 6.1a2 2 0 0 1-2.8 0L4.1 12.6a2 2 0 0 1-.6-1.4Z'],
  calendario: ['M3.5 5h17v16h-17Z', 'M3.5 10h17M8 3v4M16 3v4'],
};

function iconeSvg(nome, classe = 'ind-ic') {
  const s = svg('svg', { viewBox: '0 0 24 24', class: classe, 'aria-hidden': 'true' });
  (ICONES_KPI[nome] || []).forEach((d) => s.appendChild(svg('path', { d })));
  return s;
}

const SIGLAS = { 'Fabric': 'FB', 'Power BI': 'BI', 'Power Automate': 'PA', 'SharePoint': 'SP', 'Power Apps': 'AP', 'PI System': 'PI', 'Web App': 'WA', 'Seeq': 'SQ', 'SAP': 'SA', 'DCS': 'DC', 'Salesforce': 'SF', 'Outro': '··' };

/* -------------------------------------------------------------------------- */
/* Estado                                                                     */
/* -------------------------------------------------------------------------- */

const local = { metrica: 'status', seriesOcultas: new Set(), ordemAreas: 'total', periodoConteudo: 'mensal' };
let base = { itens: [], trilhas: [], artigos: [], atualizadoEm: null };

function lerFiltros() {
  const h = lerHash();
  return {
    periodo: h.periodo === 'mes' || h.periodo === 'ano' ? h.periodo : '',
    area: h.area || '',
    tema: h.tema || '',
  };
}

function filtrar(itens, f) {
  let lista = itens;
  if (f.area) lista = lista.filter((i) => i.slugArea === f.area);
  if (f.tema) lista = lista.filter((i) => i.gainTypes.some((g) => criarSlug(g) === f.tema));
  if (f.periodo) {
    const fim = M.mesAtual();
    const inicio = f.periodo === 'mes' ? fim : `${fim.slice(0, 4)}-01`;
    lista = M.movimentadasEntre(lista, inicio, fim);
  }
  return lista;
}

/* -------------------------------------------------------------------------- */
/* Início                                                                     */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  const seguro = (p) => p.catch((e) => { console.warn(`[indicadores] ${e.message}`); return null; });
  const [, portal, academia, artigos] = await Promise.all([
    montarCasca({ ativa: 'indicadores', novaIniciativa: false, marca: 'Indicadores · Transformação Digital Itatiba' }),
    seguro(carregarPortal()),
    seguro(carregarTrilhas()),
    seguro(carregarArtigos()),
  ]);
  $('#estado-carga').hidden = true;
  if (!portal) {
    $('#erro-texto').textContent = 'O arquivo de iniciativas não pôde ser lido. Tente recarregar a página.';
    $('#erro').hidden = false;
    return;
  }

  base = {
    itens: portal.dataset.itens,
    trilhas: academia?.trilhas ?? [],
    artigos: artigos ?? [],
    atualizadoEm: portal.dataset.atualizadoEm,
    fontes: { trilhas: Boolean(academia), artigos: Boolean(artigos) },
  };

  if (base.atualizadoEm) {
    $('#atualizado-texto').textContent = `Dados de ${dataCurta(base.atualizadoEm).toUpperCase()}`;
    $('#atualizado').hidden = false;
  }

  montarFiltros();
  ligarControles();
  $('#conteudo').hidden = false;
  render();
  document.querySelectorAll('.painel, .ind-kpi').forEach((el) => el.setAttribute('data-revelar', ''));
  revelar();
  // Os contêineres sobrevivem aos re-renders: a entrada em cena acontece uma vez.
  ['#tecs', '#mtz-plano', '#tabela-areas', '#prg'].forEach((sel) => entrarEmCena($(sel)));
  window.addEventListener('hashchange', render);
}

function montarFiltros() {
  const areas = [...new Map(base.itens.filter((i) => i.area !== 'Sem área').map((i) => [i.slugArea, i.area])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const temas = [...new Set(base.itens.flatMap((i) => i.gainTypes))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const preencher = (sel, vazio, opcoes) => {
    sel.textContent = '';
    const op = criar('option', null, vazio);
    op.value = '';
    sel.appendChild(op);
    opcoes.forEach(([v, l]) => {
      const o = criar('option', null, l);
      o.value = v;
      sel.appendChild(o);
    });
  };
  preencher($('#filtro-area'), 'Todas as áreas', areas);
  preencher($('#filtro-tema'), 'Todos os temas', temas.map((t) => [criarSlug(t), t]));
}

function ligarControles() {
  const escrever = (parcial) => escreverHash({ ...lerFiltros(), ...parcial }, { substituir: true });
  document.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => { escrever({ periodo: b.dataset.periodo }); render(); }));
  $('#filtro-area').addEventListener('change', (e) => { escrever({ area: e.target.value }); render(); });
  $('#filtro-tema').addEventListener('change', (e) => { escrever({ tema: e.target.value }); render(); });
  $('#limpar').addEventListener('click', () => { escreverHash({}, { substituir: true }); render(); });
  $('#evolucao-metrica').addEventListener('change', (e) => {
    local.metrica = e.target.value;
    local.seriesOcultas.clear();
    render();
  });
  $('#areas-ordem').addEventListener('change', (e) => { local.ordemAreas = e.target.value; render(); });
  $('#conteudo-periodo').addEventListener('change', (e) => { local.periodoConteudo = e.target.value; render(); });
}

/* -------------------------------------------------------------------------- */
/* Render                                                                     */
/* -------------------------------------------------------------------------- */

function render() {
  const f = lerFiltros();
  document.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === f.periodo)));
  const selArea = $('#filtro-area');
  const selTema = $('#filtro-tema');
  selArea.value = f.area;
  selTema.value = f.tema;
  selArea.classList.toggle('ativo', Boolean(f.area));
  selTema.classList.toggle('ativo', Boolean(f.tema));
  $('#limpar').hidden = !(f.periodo || f.area || f.tema);

  const itens = filtrar(base.itens, f);
  $('#escopo').textContent = `${itens.length} de ${base.itens.length} etapas`;

  renderKpis(itens);
  renderEvolucao(itens);
  renderAtividade(itens);
  renderTecnologias(itens);
  renderMatriz(itens);
  renderAreas(itens);
  renderFluxo(itens);
  renderProgresso(itens);
  renderAcademia();
  renderConteudo();
}

/* ---- KPIs ------------------------------------------------------------------ */

function renderKpis(itens) {
  const mes = M.mesAtual();
  const ant = M.mesAnterior(mes);
  const implantadas = itens.filter((i) => i.status === 'Implantada');
  const porArea = M.areaPorStatus(itens).filter((a) => a.area !== 'Sem área').sort((a, b) => b.total - a.total);
  const vProj = M.variacaoProjetos(itens, mes);
  const vEtapas = M.variacaoPorCampo(itens, 'requestedDate', mes);
  const vImpl = M.variacaoPorCampo(implantadas, 'doneDate', mes);
  const disp = base.trilhas.filter((t) => t.disponivel === true).length;
  const nm = M.nomeMes(mes).toLowerCase();
  const na = M.nomeMes(ant).toLowerCase();

  const kpis = [
    { icone: 'projetos', rotulo: 'Projetos digitais', valor: M.projetosDistintos(itens), v: vProj,
      dica: vProj && `${vProj.atual} novos em ${nm} contra ${vProj.anterior} em ${na}`,
      sub: vProj ? `${vProj.atual} iniciados em ${nm}` : 'Agrupados por projeto' },
    { icone: 'etapas', rotulo: 'Etapas no portfólio', valor: itens.length, v: vEtapas,
      dica: vEtapas && `${vEtapas.atual} solicitadas em ${nm} contra ${vEtapas.anterior} em ${na}`,
      sub: vEtapas ? `${vEtapas.atual} solicitadas em ${nm}` : 'Registros válidos' },
    { icone: 'implantadas', rotulo: 'Etapas implantadas', valor: implantadas.length, v: vImpl,
      dica: vImpl && `${vImpl.atual} concluídas em ${nm} contra ${vImpl.anterior} em ${na}`,
      sub: `${itens.length ? Math.round((implantadas.length / itens.length) * 100) : 0}% do portfólio` },
    { icone: 'areas', rotulo: 'Áreas envolvidas', valor: M.areasDistintas(itens),
      sub: porArea[0] ? `${porArea[0].area} concentra ${porArea[0].total}` : '' },
    { icone: 'trilhas', rotulo: 'Trilhas na Academia', valor: base.fontes.trilhas ? base.trilhas.length : null,
      sub: base.fontes.trilhas ? `${disp} ${plural(disp, 'disponível', 'disponíveis')} agora` : 'Fonte indisponível' },
    { icone: 'artigos', rotulo: 'Artigos publicados', valor: base.fontes.artigos ? base.artigos.length : null,
      sub: base.fontes.artigos ? (base.artigos[0] ? `Último em ${dataCurta(base.artigos[0].data)}` : 'Nenhum ainda') : 'Fonte indisponível' },
  ];

  const grade = $('#kpis');
  grade.textContent = '';
  kpis.forEach((k) => {
    const card = criar('article', 'ind-kpi');
    const topo = criar('div', 'ind-kpi__topo');
    const ic = criar('span', 'ind-kpi__ic');
    ic.appendChild(iconeSvg(k.icone));
    topo.append(ic, criar('h3', 'ind-kpi__rotulo', k.rotulo));
    const linha = criar('div', 'ind-kpi__linha');
    linha.appendChild(criar('span', k.valor === null ? 'ind-kpi__valor ind-kpi__valor--vazio' : 'numero ind-kpi__valor', k.valor === null ? '—' : k.valor));
    if (k.v && k.valor !== null) {
      const sobe = k.v.pct >= 0;
      const selo = criar('span', `ind-kpi__var${sobe ? '' : ' ind-kpi__var--desce'}`, `${sobe ? '↗' : '↘'} ${Math.abs(k.v.pct)}%`);
      selo.title = k.dica;
      selo.setAttribute('aria-label', k.dica);
      linha.appendChild(selo);
    }
    card.append(topo, linha, criar('p', 'ind-kpi__sub', k.sub));
    grade.appendChild(card);
  });
  $('#nota-kpis').textContent = `Variação calculada sobre datas reais do portfólio (${M.nomeMes(mes).toLowerCase()} vs ${M.nomeMes(ant).toLowerCase()}). Indicadores sem base histórica comparável mostram informação de apoio.`;
}

/* ---- Evolução do portfólio ----------------------------------------------------- */

const SERIES = {
  status: [
    { k: 'impl', nome: 'Implantadas', cor: 'var(--laranja)', campo: 'doneDate', filtro: (i) => i.status === 'Implantada', topo: 0.3 },
    { k: 'exec', nome: 'Iniciadas', cor: 'var(--laranja-medio)', campo: 'startDate', filtro: (i) => Boolean(i.startDate), topo: 0.22 },
    { k: 'bkl', nome: 'Em backlog', cor: 'var(--quente)', campo: 'requestedDate', filtro: (i) => Boolean(i.requestedDate) && !i.startDate, topo: 0.1 },
  ],
  fluxo: [
    { k: 'sol', nome: 'Solicitadas', cor: 'var(--tinta-2)', campo: 'requestedDate', filtro: () => true, topo: 0.12 },
    { k: 'impl2', nome: 'Implantadas', cor: 'var(--laranja)', campo: 'doneDate', filtro: (i) => i.status === 'Implantada', topo: 0.3 },
  ],
};

function renderEvolucao(itens) {
  const mes = M.mesAtual();
  const comDado = [...new Set(['doneDate', 'requestedDate', 'startDate'].flatMap((c) => Object.keys(M.porMes(itens, c))))]
    .filter((m) => m <= mes).sort();
  const grafico = $('#evo-grafico');
  const legenda = $('#evo-legenda');
  grafico.textContent = '';
  legenda.textContent = '';
  if (!comDado.length) {
    grafico.appendChild(criar('p', 'painel__vazio', 'Sem datas registradas para este recorte.'));
    $('#evolucao-sub').textContent = '';
    $('#evolucao-nota').textContent = '';
    return;
  }
  const todos = M.intervaloMeses(comDado[0], comDado[comDado.length - 1]);
  const meses = todos.slice(-6);
  $('#evolucao-sub').textContent = `Acumulado dos últimos ${meses.length} ${plural(meses.length, 'mês', 'meses')} com registro`;

  // Acumulado conta também o que veio antes da janela.
  const dados = SERIES[local.metrica].map((s) => {
    const mapa = M.porMes(itens.filter(s.filtro), s.campo);
    const anterior = Object.entries(mapa).filter(([m]) => m < meses[0]).reduce((t, [, n]) => t + n, 0);
    return { ...s, vals: M.acumular(mapa, meses).map((v) => v + anterior), oculta: local.seriesOcultas.has(s.k) };
  });
  const visiveis = dados.filter((d) => !d.oculta);
  const W = 320;
  const H = 176;
  const PT = 14;
  const PB = 12;
  const maximo = Math.max(1, ...visiveis.flatMap((d) => d.vals));
  const px = (i) => (meses.length > 1 ? (i * W) / (meses.length - 1) : W / 2);
  const py = (v) => PT + (H - PT - PB) * (1 - v / maximo);

  const desenho = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'evo__svg', 'aria-hidden': 'true' });
  const defs = svg('defs');
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => desenho.appendChild(svg('path', { d: `M0 ${(PT + (H - PT - PB) * f).toFixed(1)}H${W}`, class: 'grade-linha' })));
  const cursor = svg('path', { class: 'evo__cursor', d: '' });
  desenho.append(defs, cursor);
  dados.forEach((d) => {
    const grad = svg('linearGradient', { id: `evo-g-${d.k}`, x1: 0, y1: 0, x2: 0, y2: 1 });
    const s1 = svg('stop', { offset: 0 });
    s1.style.stopColor = d.cor;
    s1.style.stopOpacity = d.topo;
    const s2 = svg('stop', { offset: 1 });
    s2.style.stopColor = d.cor;
    s2.style.stopOpacity = 0;
    grad.append(s1, s2);
    defs.appendChild(grad);
    if (d.oculta) return;
    const pts = d.vals.map((v, i) => [px(i), py(v)]);
    const linha = M.curva(pts);
    const area = svg('path', { d: `${linha} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`, fill: `url(#evo-g-${d.k})`, class: 'evo__area' });
    const traco = svg('path', { d: linha, class: 'evo__linha' });
    traco.style.stroke = d.cor;
    area.dataset.k = d.k;
    traco.dataset.k = d.k;
    desenho.append(area, traco);
  });
  grafico.appendChild(desenho);

  // Pontos, rótulos e eixos em HTML: o SVG estica, os pontos continuam redondos.
  const pontos = [];
  visiveis.forEach((d) => d.vals.forEach((v, i) => {
    const p = criar('span', 'evo__ponto');
    Object.assign(p.style, { left: `${(px(i) / W) * 100}%`, top: `${(py(v) / H) * 100}%`, borderColor: d.cor });
    p.dataset.k = d.k;
    p.dataset.i = i;
    grafico.appendChild(p);
    pontos.push(p);
  }));
  const passo = Math.ceil(meses.length / 6);
  const rotulos = meses.map((m, i) => {
    const r = criar('span', 'evo__mes', M.nomeMes(m).toLowerCase());
    r.style.left = `${(px(i) / W) * 100}%`;
    if (i % passo) r.hidden = true;
    grafico.appendChild(r);
    return r;
  });
  [1, 0.75, 0.5, 0.25, 0].forEach((f) => {
    const a = criar('span', 'evo__eixo', Math.round(maximo * f));
    a.style.top = `${((PT + (H - PT - PB) * (1 - f)) / H) * 100}%`;
    grafico.appendChild(a);
  });

  const dica = criar('div', 'evo__dica');
  dica.hidden = true;
  grafico.appendChild(dica);
  const mostrar = (i) => {
    cursor.setAttribute('d', `M${px(i)} 0V${H}`);
    pontos.forEach((p) => p.classList.toggle('ativo', Number(p.dataset.i) === i));
    rotulos.forEach((r, j) => r.classList.toggle('ativo', j === i));
    dica.textContent = '';
    dica.appendChild(criar('div', 'evo__dica-mes', `${M.nomeMes(meses[i]).toUpperCase()} ${meses[i].slice(0, 4)}`));
    visiveis.forEach((d) => {
      const l = criar('div', 'evo__dica-linha');
      const bola = criar('span');
      bola.style.background = d.cor;
      l.append(bola, criar('span', null, `${d.vals[i]} ${d.nome.toLowerCase()}`));
      dica.appendChild(l);
    });
    const x = (px(i) / W) * 100;
    dica.style.left = `${x}%`;
    dica.style.transform = x > 60 ? 'translateX(-100%)' : 'none';
    dica.hidden = false;
  };
  const esconder = () => {
    cursor.setAttribute('d', '');
    pontos.forEach((p) => p.classList.remove('ativo'));
    rotulos.forEach((r) => r.classList.remove('ativo'));
    dica.hidden = true;
  };
  grafico.onpointermove = (ev) => {
    if (meses.length < 2) return;
    const r = grafico.getBoundingClientRect();
    mostrar(Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (meses.length - 1)));
  };
  grafico.onpointerleave = esconder;

  dados.forEach((d) => {
    const b = criar('button', 'evo__serie');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!d.oculta));
    const bola = criar('span', 'evo__serie-bola');
    bola.style.borderColor = d.cor;
    if (!d.oculta) bola.style.background = d.cor;
    const txt = criar('span');
    txt.append(criar('span', 'evo__serie-nome', d.nome), criar('span', 'numero evo__serie-total', d.vals[d.vals.length - 1] ?? 0));
    b.append(bola, txt);
    b.addEventListener('click', () => {
      if (local.seriesOcultas.has(d.k)) local.seriesOcultas.delete(d.k);
      else if (visiveis.length > 1) local.seriesOcultas.add(d.k); // pelo menos uma série fica à vista
      renderEvolucao(itens);
    });
    const destacar = (on) => grafico.querySelectorAll('[data-k]').forEach((el) => el.classList.toggle('apagado', on && el.dataset.k !== d.k));
    b.addEventListener('mouseenter', () => destacar(true));
    b.addEventListener('mouseleave', () => destacar(false));
    legenda.appendChild(b);
  });

  const semData = itens.filter((i) => i.status === 'Implantada' && !i.doneDate).length;
  $('#evolucao-nota').textContent = `Implantadas pela data de conclusão; iniciadas pela de início; solicitadas pela de solicitação.${semData ? ` ${semData} ${plural(semData, 'implantada sem data de conclusão fica', 'implantadas sem data de conclusão ficam')} fora da curva.` : ''}`;
}

/* ---- Atividade ao longo do ano ------------------------------------------------------ */

const ROTULOS_ATIVIDADE = [['implantadas', 'implantada', 'implantadas'], ['solicitadas', 'solicitada', 'solicitadas'], ['iniciadas', 'iniciada', 'iniciadas'], ['trilhas', 'trilha', 'trilhas'], ['artigos', 'artigo', 'artigos']];
const ROTULOS_PREVISTO = { implantadas: ['prevista para implantar', 'previstas para implantar'], solicitadas: ['solicitada', 'solicitadas'], iniciadas: ['prevista para iniciar', 'previstas para iniciar'], trilhas: ['trilha prevista', 'trilhas previstas'], artigos: ['artigo previsto', 'artigos previstos'] };

function renderAtividade(itens) {
  const mes = M.mesAtual();
  const atividade = M.atividadePorMes(itens, base.trilhas, base.artigos);
  const ocorridos = Object.keys(atividade).filter((m) => m <= mes).sort();
  const ano = Number((ocorridos[ocorridos.length - 1] || mes).slice(0, 4));
  $('#atividade-titulo').textContent = `Atividade ao longo de ${ano}`;
  // Escala só com meses já ocorridos: datas planejadas não inflam a intensidade.
  const maximo = Math.max(0, ...ocorridos.map((m) => atividade[m].total));

  const cal = $('#calendario');
  cal.textContent = '';
  for (let i = 0; i < 12; i++) {
    const m = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const b = atividade[m];
    const n = b ? b.total : 0;
    const futuro = m > mes;
    const f = maximo ? n / maximo : 0;
    const cel = criar('div', `cal__mes${futuro ? ' cal__mes--futuro' : ''}${n ? ' cal__mes--com' : ''}${f > 0.55 && !futuro ? ' cal__mes--forte' : ''}`, M.nomeMes(m));
    if (!futuro && n) cel.style.background = laranjaA(0.14 + f * 0.76);
    const detalhe = !n
      ? (futuro ? 'ainda sem registro' : 'sem registro')
      : futuro
        ? `previsto no plano: ${ROTULOS_ATIVIDADE.filter(([k]) => b[k]).map(([k]) => `${b[k]} ${ROTULOS_PREVISTO[k][b[k] === 1 ? 0 : 1]}`).join(', ')}`
        : `${n} ${plural(n, 'registro', 'registros')}: ${ROTULOS_ATIVIDADE.filter(([k]) => b[k]).map(([k, s, p]) => `${b[k]} ${plural(b[k], s, p)}`).join(', ')}`;
    cel.title = `${M.nomeMesLongo(m)} · ${detalhe}`;
    cel.tabIndex = 0;
    cel.setAttribute('role', 'img');
    cel.setAttribute('aria-label', cel.title);
    if (n) cel.appendChild(criar('span', 'cal__n', n));
    cal.appendChild(cel);
  }
  const semData = itens.filter((i) => i.status === 'Implantada' && !i.doneDate).length;
  const semTrilhaData = !base.trilhas.some((t) => t.dataDisponibilizacao);
  $('#atividade-nota').textContent = `Cada acontecimento conta pela sua data real. Meses futuros aparecem tracejados: são datas previstas, não atividade realizada.${semTrilhaData ? ' Trilhas entram quando trilhas.json trouxer a data de disponibilização.' : ''}${semData ? ` ${semData} ${plural(semData, 'implantada sem data de conclusão fica', 'implantadas sem data de conclusão ficam')} fora.` : ''}`;
}

/* ---- Tecnologias -------------------------------------------------------------------- */

function renderTecnologias(itens) {
  const todas = M.rankingTecnologias(itens);
  const topo = todas.slice(0, 7);
  const maximo = Math.max(1, ...topo.map((t) => t[1]));
  $('#tec-total').textContent = `${todas.length} no total`;
  const area = $('#tecs');
  area.textContent = '';
  if (!topo.length) {
    area.appendChild(criar('p', 'painel__vazio', 'Nenhuma tecnologia registrada neste recorte.'));
    return;
  }
  topo.forEach(([nome, n]) => {
    const f = n / maximo;
    const col = criar('div', `tec${f > 0.55 ? ' tec--forte' : f > 0.28 ? ' tec--media' : ''}`);
    col.tabIndex = 0;
    col.setAttribute('aria-label', `${nome}: ${n} ${plural(n, 'iniciativa', 'iniciativas')}`);
    const barra = criar('span', 'tec__barra');
    barra.style.setProperty('--h', `${Math.round(28 + f * 82)}px`);
    col.append(
      criar('span', 'tec__sigla', SIGLAS[nome] || nome.slice(0, 2).toUpperCase()),
      criar('span', 'tec__n', n),
      barra,
      criar('span', 'tec__nome', nome),
    );
    col.title = nome;
    area.appendChild(col);
  });
}

/* ---- Matriz prioridade × complexidade -------------------------------------------------- */

function renderMatriz(itens) {
  const plano = $('#mtz-plano');
  plano.textContent = '';
  const { celulas, semClassificacao } = M.matrizPrioridade(itens);
  const W = 300;
  const H = 220;
  const X0 = 30;
  const X1 = 296;
  const Y0 = 8;
  const Y1 = 200;
  const cw = (X1 - X0) / 3;
  const ch = (Y1 - Y0) / 3;
  const cx = (i) => X0 + (i + 0.5) * cw;
  const cy = (i) => Y0 + (i + 0.5) * ch;
  const desenho = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mtz__svg', role: 'group', 'aria-label': 'Bolhas por prioridade, complexidade e status' });
  for (let i = 0; i <= 3; i++) {
    desenho.appendChild(svg('path', { d: `M${(X0 + i * cw).toFixed(1)} ${Y0}V${Y1}`, class: 'grade-linha' }));
    desenho.appendChild(svg('path', { d: `M${X0} ${(Y0 + i * ch).toFixed(1)}H${X1}`, class: 'grade-linha' }));
  }
  const maxCel = Math.max(1, ...celulas.flatMap((c) => [...c.status.values()]));
  const kicker = $('#matriz-kicker');
  const texto = $('#matriz-texto');
  const maior = [...celulas].sort((a, b) => b.n - a.n)[0];
  const padrao = () => {
    kicker.textContent = maior?.n ? 'Maior concentração' : '';
    texto.textContent = maior?.n ? `${maior.n} em ${maior.prioridade.toLowerCase()} × ${maior.complexidade.toLowerCase()}` : '';
    texto.classList.remove('acento');
  };
  const bolhas = [];
  celulas.forEach((c) => {
    const sts = [...c.status.entries()].filter(([, n]) => n);
    const raio = sts.length > 1 ? 13 : 0;
    sts.forEach(([st, n], i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / sts.length;
      const b = svg('circle', {
        cx: (cx(M.COMPLEXIDADES.indexOf(c.complexidade)) + Math.cos(ang) * raio).toFixed(1),
        cy: (cy(M.PRIORIDADES.indexOf(c.prioridade)) + Math.sin(ang) * raio).toFixed(1),
        r: (5 + Math.sqrt(n / maxCel) * 14).toFixed(1),
        class: 'mtz__bolha',
        tabindex: 0,
      });
      b.style.fill = M.corStatus(st);
      b.dataset.st = st;
      const rotulo = `${c.prioridade} × ${c.complexidade}: ${n} ${plural(n, 'iniciativa', 'iniciativas')} · ${st.toLowerCase()}`;
      b.setAttribute('aria-label', rotulo);
      b.setAttribute('role', 'img');
      const entrar = () => {
        bolhas.forEach((x) => x.classList.toggle('apagado', x !== b));
        b.classList.add('ativo');
        kicker.textContent = `${c.prioridade} × ${c.complexidade}`.toUpperCase();
        texto.textContent = `${n} ${plural(n, 'iniciativa', 'iniciativas')} · ${st.toLowerCase()}`;
        texto.classList.add('acento');
      };
      const sair = () => {
        bolhas.forEach((x) => x.classList.remove('apagado', 'ativo'));
        padrao();
      };
      b.addEventListener('mouseenter', entrar);
      b.addEventListener('mouseleave', sair);
      b.addEventListener('focus', entrar);
      b.addEventListener('blur', sair);
      b.dataset.n = n;
      bolhas.push(b);
    });
  });
  // As maiores atrás, para as pequenas continuarem ao alcance do ponteiro.
  [...bolhas].sort((a, b) => b.dataset.n - a.dataset.n).forEach((el) => desenho.appendChild(el));
  plano.appendChild(desenho);
  M.PRIORIDADES.forEach((p, i) => {
    const r = criar('span', 'mtz__rot-y', p);
    r.style.top = `${(cy(i) / H) * 100}%`;
    plano.appendChild(r);
  });
  M.COMPLEXIDADES.forEach((c, i) => {
    const r = criar('span', 'mtz__rot-x', c);
    r.style.left = `${(cx(i) / W) * 100}%`;
    plano.appendChild(r);
  });
  padrao();

  // Legenda por status: passar o mouse apaga as outras cores.
  const legenda = $('#mtz-legenda');
  legenda.textContent = '';
  const totais = M.contarPorStatus(itens);
  for (const [st, n] of totais) {
    if (!n) continue;
    const item = criar('span', 'legenda-status__item');
    item.tabIndex = 0;
    const bola = criar('span', 'legenda-status__bola');
    bola.style.background = M.corStatus(st);
    item.append(bola, criar('span', null, st), criar('b', null, n));
    const on = () => { legenda.classList.add('tem-destaque'); item.classList.add('ativo'); bolhas.forEach((b) => b.classList.toggle('apagado', b.dataset.st !== st)); };
    const off = () => { legenda.classList.remove('tem-destaque'); item.classList.remove('ativo'); bolhas.forEach((b) => b.classList.remove('apagado')); };
    item.addEventListener('mouseenter', on);
    item.addEventListener('mouseleave', off);
    item.addEventListener('focus', on);
    item.addEventListener('blur', off);
    legenda.appendChild(item);
  }
  const vazias = M.COMPLEXIDADES.filter((c) => !itens.some((i) => i.complexity === c));
  $('#matriz-nota').textContent = `${vazias.length ? `Nenhuma iniciativa com complexidade ${vazias.join(' ou ').toLowerCase()}. ` : ''}${semClassificacao ? `${semClassificacao} sem prioridade ou complexidade ${plural(semClassificacao, 'ficou', 'ficaram')} fora.` : 'Todas as iniciativas têm prioridade e complexidade.'}`;
}

/* ---- Áreas em movimento ---------------------------------------------------------------- */

const CURTO = { 'Implantada': 'IMPL', 'Em desenvolvimento': 'DESENV', 'Dependente': 'DEP', 'Backlog': 'BACKLOG', 'Ideia': 'IDEIA' };

function renderAreas(itens) {
  const lista = M.areaPorStatus(itens);
  const semUlt = (a, b) => (a.area === 'Sem área') - (b.area === 'Sem área');
  if (local.ordemAreas === 'az') lista.sort((a, b) => semUlt(a, b) || a.area.localeCompare(b.area, 'pt-BR'));
  else if (local.ordemAreas === 'impl') lista.sort((a, b) => semUlt(a, b) || (b.status.Implantada || 0) - (a.status.Implantada || 0) || b.total - a.total);
  else lista.sort((a, b) => semUlt(a, b) || b.total - a.total || a.area.localeCompare(b.area, 'pt-BR'));

  const legenda = $('#areas-legenda');
  legenda.textContent = '';
  M.STATUS_ORDEM.forEach((st) => {
    const item = criar('span', 'legenda-status__item');
    const bola = criar('span', 'legenda-status__bola');
    bola.style.background = M.corStatus(st);
    item.append(bola, criar('span', null, st));
    legenda.appendChild(item);
  });

  const tabela = $('#tabela-areas');
  tabela.textContent = '';
  const cab = criar('div', 'tabela-areas__linha tabela-areas__cabecalho');
  cab.setAttribute('role', 'row');
  const c0 = criar('span', null, 'Área');
  c0.setAttribute('role', 'columnheader');
  cab.appendChild(c0);
  M.STATUS_ORDEM.forEach((st) => {
    const c = criar('span', 'tabela-areas__col');
    c.setAttribute('role', 'columnheader');
    c.title = st;
    c.setAttribute('aria-label', st);
    const bola = criar('span', 'legenda-status__bola');
    bola.style.background = M.corStatus(st);
    c.append(bola, criar('span', null, CURTO[st]));
    cab.appendChild(c);
  });
  const ct = criar('span', 'tabela-areas__total', 'Total');
  ct.setAttribute('role', 'columnheader');
  cab.appendChild(ct);
  tabela.appendChild(cab);

  const maxCol = Object.fromEntries(M.STATUS_ORDEM.map((s) => [s, Math.max(1, ...lista.map((a) => a.status[s] || 0))]));
  const dica = $('#areas-dica');
  const nOper = lista.filter((a) => a.area !== 'Sem área').length;
  const padrao = () => { dica.textContent = `${nOper} ${plural(nOper, 'área', 'áreas')} · ${itens.length} ${plural(itens.length, 'iniciativa', 'iniciativas')}`; dica.classList.remove('acento'); };
  lista.forEach((a) => {
    const linha = criar('div', 'tabela-areas__linha');
    linha.setAttribute('role', 'row');
    linha.tabIndex = 0;
    const nome = criar('span', 'tabela-areas__nome', a.area);
    nome.setAttribute('role', 'rowheader');
    linha.appendChild(nome);
    M.STATUS_ORDEM.forEach((st) => {
      const n = a.status[st] || 0;
      const cel = criar('span', 'tabela-areas__cel');
      cel.setAttribute('role', 'cell');
      cel.setAttribute('aria-label', `${st}: ${n}`);
      const trilho = criar('span', 'tabela-areas__trilho');
      const barra = criar('span', 'tabela-areas__barra');
      barra.style.width = `${(n / maxCol[st]) * 100}%`;
      barra.style.background = M.corStatus(st);
      trilho.appendChild(barra);
      cel.append(trilho, criar('span', n ? 'tabela-areas__n' : 'tabela-areas__n tabela-areas__n--zero', n));
      linha.appendChild(cel);
    });
    const tot = criar('span', 'tabela-areas__total', a.total);
    tot.setAttribute('role', 'cell');
    linha.appendChild(tot);
    const on = () => {
      tabela.classList.add('tem-destaque');
      linha.classList.add('ativa');
      dica.textContent = `${a.area} · ${M.STATUS_ORDEM.filter((s) => a.status[s]).map((s) => `${a.status[s]} ${s.toLowerCase()}`).join(' · ')}`;
      dica.classList.add('acento');
    };
    const off = () => { tabela.classList.remove('tem-destaque'); linha.classList.remove('ativa'); padrao(); };
    linha.addEventListener('mouseenter', on);
    linha.addEventListener('mouseleave', off);
    linha.addEventListener('focus', on);
    linha.addEventListener('blur', off);
    tabela.appendChild(linha);
  });
  padrao();
  const sem = lista.find((a) => a.area === 'Sem área');
  $('#areas-nota').textContent = `Números = iniciativas em cada status; cada coluna tem escala própria.${sem ? ` “Sem área” reúne ${sem.total} ${plural(sem.total, 'registro', 'registros')} sem área informada e não conta como área.` : ''}`;
}

/* ---- Fluxo (Sankey) ------------------------------------------------------------------------ */

function empilhar(nos, H, gap, minH) {
  const total = nos.reduce((s, n) => s + n.v, 0) || 1;
  const livre = Math.max(10, H - gap * Math.max(0, nos.length - 1));
  let hs = nos.map((n) => Math.max(minH, (n.v / total) * livre));
  const soma = hs.reduce((a, b) => a + b, 0);
  if (soma > livre) hs = hs.map((h) => (h * livre) / soma);
  let y = 0;
  return nos.map((n, i) => {
    const o = { ...n, y, h: hs[i] };
    y += hs[i] + gap;
    return o;
  });
}

/** Fitas entre duas colunas, empilhadas nas duas pontas para reduzir cruzamentos. */
function fitasEntre(origem, destino, ligacoes, x0, x1) {
  const so = new Map(origem.map((n) => [n.k, n.y]));
  const to = new Map(destino.map((n) => [n.k, n.y]));
  const xm = (x0 + x1) / 2;
  const saida = [];
  origem.forEach((s) => destino.forEach((t) => {
    const v = ligacoes.get(`${s.k}→${t.k}`);
    if (!v) return;
    const hs = (s.h * v) / s.v;
    const ht = (t.h * v) / t.v;
    const y0 = so.get(s.k);
    const y1 = to.get(t.k);
    so.set(s.k, y0 + hs);
    to.set(t.k, y1 + ht);
    saida.push({ s: s.k, t: t.k, d: `M${x0} ${y0.toFixed(1)} C${xm} ${y0.toFixed(1)} ${xm} ${y1.toFixed(1)} ${x1} ${y1.toFixed(1)} L${x1} ${(y1 + ht).toFixed(1)} C${xm} ${(y1 + ht).toFixed(1)} ${xm} ${(y0 + hs).toFixed(1)} ${x0} ${(y0 + hs).toFixed(1)} Z` });
  }));
  return saida;
}

function renderFluxo(itens) {
  const area = $('#snk');
  area.textContent = '';
  if (!itens.length) {
    area.appendChild(criar('p', 'painel__vazio', 'Nada a mostrar neste recorte.'));
    return;
  }
  const W = 480;
  const H = 330;
  const fx = M.fluxoTransformacao(itens, 5, 5);
  const colA = empilhar(fx.areas, H, 9, 6);
  const colT = empilhar(fx.tecs, H, 9, 30);
  const colS = empilhar(fx.status, H, 9, 6);
  const f1 = fitasEntre(colA, colT, fx.l1, 126, 188);
  const f2 = fitasEntre(colT, colS, fx.l2, 292, 354);
  const pct = (x) => `${(x / W) * 100}%`;
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

  const desenho = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'snk__svg', 'aria-hidden': 'true' });
  const fitas = [];
  f1.forEach((f) => {
    const p = svg('path', { d: f.d, class: 'snk__fita snk__fita--origem' });
    p.dataset.a = f.s;
    p.dataset.t = f.t;
    fitas.push(p);
    desenho.appendChild(p);
  });
  f2.forEach((f) => {
    const p = svg('path', { d: f.d, class: 'snk__fita snk__fita--status' });
    p.style.fill = M.corStatus(f.t);
    p.dataset.t = f.s;
    p.dataset.s = f.t;
    fitas.push(p);
    desenho.appendChild(p);
  });
  area.appendChild(desenho);

  const kicker = $('#fluxo-kicker');
  const texto = $('#fluxo-texto');
  const padrao = () => { kicker.textContent = 'Total no fluxo'; texto.textContent = `${itens.length} ${plural(itens.length, 'iniciativa', 'iniciativas')}`; texto.classList.remove('acento'); };
  const elementos = [];
  const focar = (col, k, rotulo) => {
    area.classList.add('tem-destaque');
    fitas.forEach((p) => {
      const toca = (col === 0 && p.dataset.a === k) || (col === 1 && p.dataset.t === k) || (col === 2 && p.dataset.s === k);
      p.classList.toggle('acesa', toca);
    });
    elementos.forEach((e) => e.el.classList.toggle('ativo', e.col === col && e.k === k));
    kicker.textContent = ['Área', 'Tecnologia', 'Status'][col];
    texto.textContent = rotulo;
    texto.classList.add('acento');
  };
  const soltar = () => {
    area.classList.remove('tem-destaque');
    fitas.forEach((p) => p.classList.remove('acesa'));
    elementos.forEach((e) => e.el.classList.remove('ativo'));
    padrao();
  };
  const interativo = (el, col, k, rotulo) => {
    el.tabIndex = 0;
    el.setAttribute('aria-label', rotulo);
    el.addEventListener('mouseenter', () => focar(col, k, rotulo));
    el.addEventListener('mouseleave', soltar);
    el.addEventListener('focus', () => focar(col, k, rotulo));
    el.addEventListener('blur', soltar);
    elementos.push({ el, col, k });
  };

  colA.forEach((n) => {
    const barra = criar('div', 'snk__barra');
    Object.assign(barra.style, { left: pct(120), width: pct(6), top: `${(n.y / H) * 100}%`, height: `${(n.h / H) * 100}%` });
    const rot = criar('div', 'snk__rotulo snk__rotulo--esq');
    Object.assign(rot.style, { left: '0', width: pct(114), top: `${((n.y + n.h / 2) / H) * 100}%` });
    rot.append(criar('span', 'snk__nome', n.k), criar('span', 'snk__valor', n.v));
    interativo(rot, 0, n.k, `${n.k}: ${n.v} ${plural(n.v, 'iniciativa', 'iniciativas')}`);
    area.append(barra, rot);
  });
  colT.forEach((n) => {
    const pilula = criar('div', 'snk__tec');
    Object.assign(pilula.style, { left: pct(188), width: pct(104), top: `${(n.y / H) * 100}%`, height: `${(n.h / H) * 100}%` });
    pilula.append(criar('span', 'snk__nome', n.k), criar('span', 'snk__valor-mini', fmt(n.v)));
    interativo(pilula, 1, n.k, `${n.k}: participação de ${fmt(n.v)} iniciativas`);
    area.appendChild(pilula);
  });
  colS.forEach((n) => {
    const barra = criar('div', 'snk__barra');
    Object.assign(barra.style, { left: pct(354), width: pct(6), top: `${(n.y / H) * 100}%`, height: `${(n.h / H) * 100}%`, background: M.corStatus(n.k) });
    const rot = criar('div', 'snk__rotulo');
    Object.assign(rot.style, { left: pct(366), width: pct(114), top: `${((n.y + n.h / 2) / H) * 100}%` });
    rot.append(criar('span', 'snk__nome', n.k), criar('span', 'snk__valor', n.v));
    interativo(rot, 2, n.k, `${n.k}: ${n.v} ${plural(n.v, 'iniciativa', 'iniciativas')}`);
    area.append(barra, rot);
  });
  padrao();
  $('#fluxo-nota').textContent = `Cada iniciativa vale 1 e divide esse peso entre suas tecnologias, então cada coluna soma ${itens.length}. A largura das fitas é participação ponderada, não contagem de iniciativas únicas.${fx.agrupou ? ' Áreas e tecnologias menores foram agrupadas em “Outras”.' : ''}${fx.semTecnologia ? ` ${fx.semTecnologia} sem tecnologia ${plural(fx.semTecnologia, 'aparece', 'aparecem')} como “Sem tecnologia”.` : ''}`;
}

/* ---- Progresso ----------------------------------------------------------------------------- */

const COR_FAIXA = ['var(--laranja-palido)', 'color-mix(in srgb, var(--laranja) 35%, var(--laranja-palido))', 'color-mix(in srgb, var(--laranja) 52%, var(--laranja-palido))', 'color-mix(in srgb, var(--laranja) 68%, var(--laranja-palido))', 'color-mix(in srgb, var(--laranja) 84%, var(--laranja-palido))', 'var(--laranja)'];

function renderProgresso(itens) {
  const { contagem, semValor } = M.distribuicaoProgresso(itens);
  const total = contagem.reduce((a, b) => a + b, 0);
  const pct = (n) => (total ? `${Math.round((n / total) * 100)}%` : '—');
  const area = $('#prg');
  area.textContent = '';
  const kicker = $('#prg-kicker');
  const texto = $('#prg-texto');
  const padrao = () => { kicker.textContent = 'Iniciativas'; texto.textContent = `${total} com progresso${semValor ? ` · ${semValor} sem valor` : ''}`; texto.classList.remove('acento'); };
  M.FAIXAS_PROGRESSO.forEach((faixa, i) => {
    const n = contagem[i];
    const col = criar('div', 'prg__col');
    col.tabIndex = 0;
    col.setAttribute('aria-label', `Faixa ${faixa.rotulo}: ${n} ${plural(n, 'iniciativa', 'iniciativas')}`);
    const pontos = criar('span', 'prg__pontos');
    pontos.style.height = `${Math.max(10, Math.ceil(n / 4) * 10)}px`;
    for (let j = 0; j < n; j++) {
      const p = criar('span', 'prg__ponto');
      p.style.background = COR_FAIXA[i];
      p.style.transitionDelay = `${(Math.floor(j / 4) * 0.035).toFixed(3)}s`;
      pontos.appendChild(p);
    }
    col.append(criar('span', 'prg__n', n), pontos, criar('span', 'prg__faixa', faixa.rotulo));
    const on = () => { area.classList.add('tem-destaque'); col.classList.add('ativa'); kicker.textContent = `Faixa ${faixa.rotulo}`; texto.textContent = `${n} ${plural(n, 'iniciativa', 'iniciativas')} · ${pct(n)}`; texto.classList.add('acento'); };
    const off = () => { area.classList.remove('tem-destaque'); col.classList.remove('ativa'); padrao(); };
    col.addEventListener('mouseenter', on);
    col.addEventListener('mouseleave', off);
    col.addEventListener('focus', on);
    col.addEventListener('blur', off);
    area.appendChild(col);
  });
  padrao();
  const andamento = contagem.slice(1, 5).reduce((a, b) => a + b, 0);
  miniCards($('#prg-resumo'), [
    { valor: contagem[0], extra: pct(contagem[0]), rotulo: 'Sem avanço', classe: 'quente' },
    { valor: andamento, extra: pct(andamento), rotulo: 'Em andamento', classe: 'medio' },
    { valor: contagem[5], extra: pct(contagem[5]), rotulo: 'Concluídas', classe: 'acento' },
  ]);
}

function miniCards(alvo, cards) {
  alvo.textContent = '';
  cards.forEach((c) => {
    const card = criar('div', 'mini-card');
    const topo = criar('div', 'mini-card__topo');
    if (c.icone) topo.appendChild(iconeSvg(c.icone, 'mini-card__ic'));
    topo.append(criar('span', `numero mini-card__valor${c.classe ? ` mini-card__valor--${c.classe}` : ''}`, c.valor));
    if (c.extra) topo.appendChild(criar('span', 'mini-card__extra', c.extra));
    card.append(topo, criar('p', 'mini-card__rotulo', c.rotulo));
    alvo.appendChild(card);
  });
}

/* ---- Academia ------------------------------------------------------------------------------ */

function renderAcademia() {
  const t = base.trilhas;
  const painel = $('#painel-academia');
  if (!base.fontes.trilhas || !t.length) {
    painel.hidden = true;
    return;
  }
  const disp = t.filter((x) => x.disponivel === true).length;
  const aulas = t.reduce((s, x) => s + (Number(x.aulas) || 0), 0);
  const comAulas = t.filter((x) => Number(x.aulas) > 0).length;
  const horas = t.reduce((s, x) => s + (Number(x.duracaoHoras) || 0), 0);
  miniCards($('#acd-stats'), [
    { icone: 'trilhas', valor: t.length, rotulo: plural(t.length, 'trilha', 'trilhas') },
    { icone: 'aulas', valor: aulas, rotulo: comAulas < t.length ? `aulas · ${comAulas} ${plural(comAulas, 'trilha', 'trilhas')}` : 'aulas' },
    { icone: 'horas', valor: `${horas}h`, rotulo: 'duração total' },
  ]);
  $('#acd-disp').textContent = `${disp} de ${t.length} ${plural(t.length, 'trilha disponível', 'trilhas disponíveis')}`;
  const ordenadas = [...t].sort((a, b) => Number(b.disponivel === true) - Number(a.disponivel === true));
  const segs = $('#acd-segs');
  segs.textContent = '';
  ordenadas.forEach((x) => segs.appendChild(criar('span', x.disponivel === true ? 'ligado' : null)));
  const lista = $('#acd-lista');
  lista.textContent = '';
  ordenadas.forEach((x) => {
    const li = criar('li');
    const a = criar('a', `acd__trilha${x.disponivel === true ? ' acd__trilha--disp' : ''}`);
    a.href = `academia.html#trilha=${encodeURIComponent(x.id)}`;
    const nome = criar('span', 'acd__nome');
    nome.append(criar('b', null, x.nome), criar('small', null, [x.nivel, x.aulas ? `${x.aulas} aulas` : null].filter(Boolean).join(' · ')));
    const selo = criar('span', x.disponivel === true ? 'acd__selo acd__selo--disp' : 'acd__selo', x.disponivel === true ? 'Disponível' : 'Em breve');
    a.append(nome, criar('span', 'acd__duracao', x.duracaoHoras ? `${x.duracaoHoras}h` : '—'), selo);
    li.appendChild(a);
    lista.appendChild(li);
  });
}

/* ---- Produção de conteúdo --------------------------------------------------------------------- */

function renderConteudo() {
  const artigos = base.artigos;
  const painel = $('#painel-conteudo');
  if (!base.fontes.artigos) {
    painel.hidden = true;
    return;
  }
  const mes = M.mesAtual();
  const porMes = M.porMes(artigos, 'data');
  let serie;
  if (local.periodoConteudo === 'trimestral') {
    const tri = (m) => `${m.slice(0, 4)}-T${Math.ceil(Number(m.slice(5, 7)) / 3)}`;
    const meses = M.intervaloMeses(M.somarMeses(mes, -11), mes);
    const grupos = new Map();
    meses.forEach((m) => grupos.set(tri(m), (grupos.get(tri(m)) || 0) + (porMes[m] || 0)));
    serie = [...grupos.entries()].map(([k, v]) => ({ t: `${k.split('-')[1]} ${k.split('-')[0]}`, v }));
  } else {
    serie = M.intervaloMeses(M.somarMeses(mes, -5), mes).map((m) => ({ t: M.nomeMes(m), v: porMes[m] || 0 }));
  }

  const g = $('#cnt-grafico');
  g.textContent = '';
  const W = 300;
  const H = 150;
  const CT = 12;
  const CB = 6;
  const maximo = Math.max(2, Math.ceil(Math.max(...serie.map((s) => s.v)) / 2) * 2);
  const cx = (i) => (serie.length > 1 ? (i * W) / (serie.length - 1) : W / 2);
  const cy = (v) => CT + (H - CT - CB) * (1 - v / maximo);
  const pts = serie.map((s, i) => [cx(i), cy(s.v)]);
  const linha = M.curva(pts);
  const desenho = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'cnt__svg', 'aria-hidden': 'true' });
  const defs = svg('defs');
  const grad = svg('linearGradient', { id: 'cnt-g', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svg('stop', { offset: 0, class: 'cnt__luz' }), svg('stop', { offset: 1, class: 'cnt__luz-fim' }));
  defs.appendChild(grad);
  desenho.appendChild(defs);
  [0, 0.5, 1].forEach((f) => desenho.appendChild(svg('path', { d: `M0 ${(CT + (H - CT - CB) * f).toFixed(1)}H${W}`, class: 'grade-linha' })));
  const cursor = svg('path', { d: '', class: 'evo__cursor' });
  desenho.append(cursor, svg('path', { d: `${linha} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`, fill: 'url(#cnt-g)' }), svg('path', { d: linha, class: 'cnt__linha' }));
  g.appendChild(desenho);
  const pontos = pts.map((p) => {
    const d = criar('span', 'cnt__ponto');
    Object.assign(d.style, { left: `${(p[0] / W) * 100}%`, top: `${(p[1] / H) * 100}%` });
    g.appendChild(d);
    return d;
  });
  const rotulos = serie.map((s, i) => {
    const r = criar('span', 'evo__mes', s.t);
    r.style.left = `${(cx(i) / W) * 100}%`;
    g.appendChild(r);
    return r;
  });
  [1, 0.5, 0].forEach((f) => {
    const a = criar('span', 'evo__eixo', Math.round(maximo * f));
    a.style.top = `${((CT + (H - CT - CB) * (1 - f)) / H) * 100}%`;
    g.appendChild(a);
  });
  const dica = criar('div', 'cnt__dica');
  dica.hidden = true;
  g.appendChild(dica);
  g.onpointermove = (ev) => {
    if (serie.length < 2) return;
    const r = g.getBoundingClientRect();
    const i = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (serie.length - 1));
    cursor.setAttribute('d', `M${cx(i)} 0V${H}`);
    pontos.forEach((p, j) => p.classList.toggle('ativo', j === i));
    rotulos.forEach((p, j) => p.classList.toggle('ativo', j === i));
    dica.textContent = '';
    dica.append(criar('b', null, serie[i].t), criar('span', null, `${serie[i].v} ${plural(serie[i].v, 'artigo', 'artigos')}`));
    const x = (cx(i) / W) * 100;
    Object.assign(dica.style, { left: `${x}%`, top: `${(pts[i][1] / H) * 100}%`, transform: x > 70 ? 'translate(-100%, -120%)' : x < 20 ? 'translate(0, -120%)' : 'translate(-50%, -120%)' });
    dica.hidden = false;
  };
  g.onpointerleave = () => {
    cursor.setAttribute('d', '');
    pontos.forEach((p) => p.classList.remove('ativo'));
    rotulos.forEach((p) => p.classList.remove('ativo'));
    dica.hidden = true;
  };

  const categorias = new Set(artigos.map((a) => a.categoria).filter(Boolean)).size;
  miniCards($('#cnt-stats'), [
    { icone: 'artigos', valor: artigos.length, rotulo: plural(artigos.length, 'artigo publicado', 'artigos publicados') },
    { icone: 'categorias', valor: categorias, rotulo: plural(categorias, 'categoria', 'categorias') },
    { icone: 'calendario', valor: artigos[0] ? dataCurta(artigos[0].data, { ano: false }) : '—', rotulo: 'último artigo' },
  ]);
}
