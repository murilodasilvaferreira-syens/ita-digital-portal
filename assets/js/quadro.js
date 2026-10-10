/**
 * Quadro de dependências: cards HTML sobre arestas SVG, numa superfície com
 * zoom, arrasto com inércia, pinça e destaque de cadeia.
 *
 * O layout vem de grafo.js; aqui só se desenha e se interage. A página não
 * rola por dentro: o quadro ocupa a altura inteira do layout e quem rola é o
 * iframe. O deslocamento horizontal só existe com zoom acima de 100%.
 *
 * Todo texto entra por textContent.
 */

import { FASE, classeFase } from './data.js';
import { M, montarRaias, calcularLayout, caminhoAresta } from './grafo.js';
import { criar, movimentoReduzido, plural } from './ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const LIMIAR_ARRASTO = 4;          // px antes de um toque virar arrasto
const ESPERA_DUPLO_CLIQUE = 200;   // janela para o segundo clique chegar

function svg(tag, atributos = {}) {
  const no = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) if (v !== null && v !== undefined) no.setAttribute(k, String(v));
  return no;
}

/** Ícone redondo da fase: ✓ entregue, ● em execução, ‖ interrompida, tracejado planejamento. */
export function iconeFase(fase) {
  const ic = criar('span', `fase-ic fase-ic--${classeFase(fase)}`);
  ic.setAttribute('aria-hidden', 'true');
  if (fase === FASE.ENTREGUE) ic.textContent = '✓';
  else if (fase === FASE.EXECUCAO) ic.textContent = '●';
  else if (fase === FASE.INTERROMPIDA) ic.textContent = '‖';
  return ic;
}

export { classeFase };

function marcaAtraso() {
  const s = svg('svg', { viewBox: '0 0 12 11', class: 'no__marca no__marca--atraso', 'aria-hidden': 'true' });
  s.append(
    svg('path', { d: 'M6 .5 11.5 10.5H.5Z' }),
    svg('path', { d: 'M6 4v3.2', class: 'traco' }),
    svg('circle', { cx: 6, cy: 8.9, r: 0.75 }),
  );
  return s;
}

function marcaBloqueio() {
  const s = svg('svg', { viewBox: '0 0 12 12', class: 'no__marca no__marca--bloqueio', 'aria-hidden': 'true' });
  s.append(svg('path', { d: 'M3.4 4.6V3.4a2.6 2.6 0 0 1 5.2 0v1.2', class: 'traco' }), svg('rect', { x: 1.8, y: 4.6, width: 8.4, height: 6.4, rx: 1.6 }));
  return s;
}

/* -------------------------------------------------------------------------- */
/* Quadro                                                                     */
/* -------------------------------------------------------------------------- */

/** Altura mínima que o palco reserva abaixo do topo do painel ancorado. */
const ALTURA_PAINEL = 560;

export function criarQuadro({ palco, painel, dataset, aoAbrirDetalhe, aoAbrirProjeto, aoAtualizar }) {
  let layout = null;
  let itensVisiveis = [];
  let mostrarArea = false;
  let escala = 1;
  let deslocX = 0;
  let inercia = null;
  let idHover = null;
  let idSelecionado = null;
  // Painel de detalhe: a que raia ele está ancorado e em que altura do palco.
  let ancora = null; // { tipo: 'item', id } | { tipo: 'raia', chave }
  let painelTopo = 8;

  const plano = criar('div', 'quadro__plano');
  const camadaRaias = criar('div', 'quadro__raias');
  const desenho = svg('svg', { class: 'quadro__arestas', 'aria-hidden': 'true' });
  const camadaNos = criar('div', 'quadro__nos');
  camadaNos.setAttribute('role', 'group');
  camadaNos.setAttribute('aria-label', 'Etapas do roadmap');
  plano.append(camadaRaias, desenho, camadaNos);
  palco.appendChild(plano);

  // Defs: setas (neutra e acesa) e o desfoque do brilho da cadeia.
  const defs = svg('defs');
  for (const [id, classe] of [['qd-seta', 'seta'], ['qd-seta-acesa', 'seta seta--acesa']]) {
    const m = svg('marker', { id, class: classe, viewBox: '0 0 8 8', refX: 6.4, refY: 4, markerWidth: 5.5, markerHeight: 5.5, orient: 'auto-start-reverse' });
    m.appendChild(svg('path', { d: 'M1 1 L6.5 4 L1 7 Z' }));
    defs.appendChild(m);
  }
  const filtro = svg('filter', { id: 'qd-brilho', x: '-10%', y: '-10%', width: '120%', height: '120%' });
  filtro.appendChild(svg('feGaussianBlur', { stdDeviation: 3 }));
  defs.appendChild(filtro);
  const camadaBrilho = svg('g', { class: 'quadro__brilhos' });
  const camadaArestas = svg('g');
  const camadaFluxo = svg('g', { class: 'quadro__fluxos' });
  desenho.append(defs, camadaBrilho, camadaArestas, camadaFluxo);

  let elementosNo = new Map();
  let arestas = [];

  /* ---- desenho ----------------------------------------------------------- */

  function criarNo(caixa) {
    const it = caixa.item;
    const no = criar('button', `no no--${classeFase(it.fase)}`);
    no.type = 'button';
    no.dataset.id = String(it.id);
    const partes = [it.title, it.status];
    if (it.bloqueada) partes.push('bloqueada por dependência');
    if (it.atrasada) partes.push(`atrasada há ${it.diasAtraso} ${plural(it.diasAtraso, 'dia', 'dias')}`);
    if (it.progress !== null) partes.push(`${it.progress}% concluído`);
    no.setAttribute('aria-label', partes.join(' — '));

    const tag = criar('span', 'no__tag');
    tag.setAttribute('aria-hidden', 'true');
    const topo = criar('span', 'no__topo');
    topo.append(iconeFase(it.fase), criar('span', 'no__status', it.status));
    if (it.atrasada) topo.appendChild(marcaAtraso());
    if (it.bloqueada) topo.appendChild(marcaBloqueio());
    const progresso = criar('span', 'no__progresso');
    const trilho = criar('span', 'no__trilho');
    const barra = criar('span', 'no__barra');
    barra.style.width = `${it.progress ?? 0}%`;
    trilho.appendChild(barra);
    progresso.append(trilho, criar('span', 'no__pct', it.progress === null ? '—' : `${it.progress}%`));
    no.append(tag, topo, criar('span', 'no__titulo', it.title), progresso);

    // Clique abre o detalhe; o duplo clique só enquadra. Teclado abre na hora.
    let espera = null;
    no.addEventListener('click', (ev) => {
      if (ev.detail === 0) { aoAbrirDetalhe(it.id, no); return; }
      clearTimeout(espera);
      espera = setTimeout(() => aoAbrirDetalhe(it.id, no), ESPERA_DUPLO_CLIQUE);
    });
    no.addEventListener('dblclick', (ev) => {
      ev.preventDefault();
      clearTimeout(espera);
      centralizarNo(it.id);
    });
    no.addEventListener('pointerenter', () => { if (!arrasto?.ativo) hover(it.id); });
    no.addEventListener('pointerleave', () => hover(null));
    no.addEventListener('focus', () => hover(it.id));
    no.addEventListener('blur', () => hover(null));
    return no;
  }

  function desenharRaias() {
    camadaRaias.textContent = '';
    for (const raia of layout.raias) {
      const indep = raia.tipo === 'independentes';
      const el = criar('div', `raia${indep ? ' raia--independentes' : ''}${layout.vertical ? ' raia--vertical' : ''}`);
      el.dataset.chave = raia.chave;
      Object.assign(el.style, { top: `${raia.topo}px`, height: `${raia.base - raia.topo}px`, width: `${layout.largura}px` });

      const cab = criar('div', 'raia__cabecalho');
      const nome = criar(indep ? 'span' : 'button', 'raia__nome', raia.projeto);
      if (!indep) {
        nome.type = 'button';
        nome.setAttribute('aria-label', `Resumo do projeto ${raia.projeto}`);
        nome.addEventListener('click', () => aoAbrirProjeto(raia));
      }
      const meta = [mostrarArea && raia.area ? raia.area : null, `${raia.itens.length} ${plural(raia.itens.length, 'iniciativa', 'iniciativas')}`]
        .filter(Boolean).join(' · ');
      const titulo = criar('div', 'raia__titulo');
      titulo.append(nome, criar('div', 'raia__meta', meta));

      const media = Math.round(raia.itens.reduce((s, i) => s + (i.progress || 0), 0) / raia.itens.length);
      const avanco = criar('div', 'raia__avanco');
      avanco.setAttribute('aria-label', `Avanço médio ${media}%`);
      const segs = criar('span', 'raia__segmentos');
      segs.style.width = `${Math.min(200, Math.max(60, raia.itens.length * 22))}px`;
      raia.itens.forEach((i) => segs.appendChild(criar('span', `seg seg--${classeFase(i.fase)}`)));
      avanco.append(criar('span', 'raia__pct', `${media}%`), segs);

      cab.append(titulo, avanco);
      el.appendChild(cab);
      camadaRaias.appendChild(el);
    }
  }

  function desenharArestas() {
    camadaArestas.textContent = '';
    arestas = [];
    for (const [id, caixa] of layout.nos) {
      for (const idDep of caixa.item.deps) {
        const origem = layout.nos.get(idDep);
        if (!origem) continue;
        const cruza = origem.item.chaveRaia !== caixa.item.chaveRaia;
        const d = caminhoAresta(origem, caixa, layout.vertical, layout.largura);
        const path = svg('path', { d, class: `aresta${cruza ? ' aresta--entre-raias' : ''}`, 'marker-end': 'url(#qd-seta)' });
        camadaArestas.appendChild(path);
        arestas.push({ de: idDep, para: id, d, path, execucao: caixa.item.fase === FASE.EXECUCAO });
      }
    }
  }

  /* ---- destaque de cadeia ------------------------------------------------- */

  function aplicarDestaque() {
    const ativo = idHover ?? (idSelecionado !== null && layout?.nos.has(idSelecionado) ? idSelecionado : null);
    const acima = ativo !== null ? dataset.ancestrais(ativo) : new Set();
    const abaixo = ativo !== null ? dataset.descendentes(ativo) : new Set();
    const naCadeia = (id) => id === ativo || acima.has(id) || abaixo.has(id);
    plano.classList.toggle('com-cadeia', ativo !== null);

    for (const [id, no] of elementosNo) {
      const sel = id === ativo;
      no.classList.toggle('ativo', sel);
      no.classList.toggle('antes', !sel && acima.has(id));
      no.classList.toggle('depois', !sel && abaixo.has(id));
      no.querySelector('.no__tag').textContent = !sel && acima.has(id) ? 'ANTES' : !sel && abaixo.has(id) ? 'DEPOIS' : '';
    }

    camadaRaias.querySelectorAll('.raia').forEach((r) => {
      const raia = layout.raias.find((x) => x.chave === r.dataset.chave);
      r.classList.toggle('na-cadeia', ativo !== null && raia?.itens.some((i) => naCadeia(i.id)));
    });

    camadaBrilho.textContent = '';
    camadaFluxo.textContent = '';
    const fluxo = !movimentoReduzido();
    for (const a of arestas) {
      const acesa = ativo !== null && naCadeia(a.de) && naCadeia(a.para);
      a.path.classList.toggle('acesa', acesa);
      a.path.setAttribute('marker-end', acesa ? 'url(#qd-seta-acesa)' : 'url(#qd-seta)');
      if (acesa) {
        camadaBrilho.appendChild(svg('path', { d: a.d, class: 'brilho', filter: 'url(#qd-brilho)' }));
        if (fluxo) camadaFluxo.appendChild(svg('path', { d: a.d, class: 'fluxo fluxo--aceso' }));
      } else if (fluxo && ativo === null && a.execucao) {
        // Em repouso, o que está em execução mostra energia correndo.
        camadaFluxo.appendChild(svg('path', { d: a.d, class: 'fluxo' }));
      }
    }
    // A cadeia acesa fica por cima das outras arestas.
    arestas.filter((a) => a.path.classList.contains('acesa')).forEach((a) => camadaArestas.appendChild(a.path));
  }

  function hover(id) {
    if (idHover === id) return;
    idHover = id;
    if (layout) aplicarDestaque();
  }

  /* ---- zoom, arrasto e inércia --------------------------------------------- */

  const larguraVisivel = () => palco.clientWidth;
  const minimo = () => Math.min(0, larguraVisivel() - (layout ? layout.largura * escala : 0));
  const limitar = (v) => Math.max(minimo(), Math.min(0, v));

  /* ---- painel ancorado -------------------------------------------------------
     O painel de detalhe abre no topo da raia da etapa (ou do projeto) e ocupa a
     largura do quadro. Fica fora do plano, então não acompanha o zoom: só o
     ponto de ancoragem é convertido para a escala atual. */

  /** Topo do painel, em pixels de tela; mantém o último se a raia sumiu do filtro. */
  function topoAncora() {
    if (!layout || !ancora) return painelTopo;
    const raia = ancora.tipo === 'raia'
      ? layout.raias.find((r) => r.chave === ancora.chave)
      : layout.raias.find((r) => r.itens.some((i) => i.id === ancora.id));
    return raia ? Math.round(raia.topo * escala) : painelTopo;
  }

  /** O palco cresce para o painel caber inteiro abaixo da raia onde ancorou. */
  function alturaPalco() {
    const base = Math.round(layout.altura * escala);
    return ancora ? Math.max(base, topoAncora() + ALTURA_PAINEL) : base;
  }

  function posicionarPainel() {
    if (!painel || !ancora || !layout) return;
    painelTopo = topoAncora();
    painel.style.top = `${painelTopo}px`;
    painel.style.maxHeight = `${Math.max(260, alturaPalco() - painelTopo - 8)}px`;
  }

  function aplicar({ suave = false } = {}) {
    plano.classList.toggle('quadro__plano--suave', suave && !movimentoReduzido());
    plano.style.transform = `translateX(${deslocX}px) scale(${escala})`;
    if (layout) palco.style.height = `${alturaPalco()}px`;
    posicionarPainel();
  }

  function avisar() {
    palco.classList.toggle('quadro__palco--movel', minimo() < 0);
    aoAtualizar?.({ escala, arrastavel: minimo() < 0, min: escala <= M.escalaMin, max: escala >= M.escalaMax });
  }

  function pararInercia() {
    if (inercia) cancelAnimationFrame(inercia);
    inercia = null;
  }

  /** Solta o quadro: desliza, desacelera e volta elástico se passou do limite. */
  function lancarInercia(v0) {
    pararInercia();
    if (movimentoReduzido()) {
      deslocX = limitar(deslocX);
      aplicar({ suave: true });
      return;
    }
    let v = v0;
    const passo = () => {
      v *= 0.94;
      const proximo = deslocX + v;
      const dentro = limitar(proximo);
      if (proximo !== dentro || Math.abs(v) < 0.35) {
        deslocX = dentro;
        aplicar({ suave: true });
        inercia = null;
        return;
      }
      deslocX = proximo;
      aplicar();
      inercia = requestAnimationFrame(passo);
    };
    inercia = requestAnimationFrame(passo);
  }

  function aplicarEscala(nova, ancoraX) {
    const anterior = escala;
    escala = Math.min(M.escalaMax, Math.max(M.escalaMin, Number(nova.toFixed(2))));
    if (!layout || escala === anterior) return;
    const ancora = ancoraX ?? larguraVisivel() / 2;
    // Mantém fixo o ponto do desenho que está sob a âncora.
    deslocX = limitar(ancora - (ancora - deslocX) * (escala / anterior));
    aplicar({ suave: true });
    avisar();
  }

  // Roda só com Ctrl: sem isso, a página do SharePoint deixaria de rolar.
  palco.addEventListener('wheel', (ev) => {
    if (ev.target.closest('.det')) return; // rolar dentro do painel não dá zoom
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    pararInercia();
    const r = palco.getBoundingClientRect();
    aplicarEscala(escala + (ev.deltaY < 0 ? M.passoZoom : -M.passoZoom), ev.clientX - r.left);
  }, { passive: false });

  const ponteiros = new Map();
  let distanciaInicial = 0;
  let escalaInicial = 1;
  let arrasto = null;
  let suprimirClique = false;

  palco.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    if (ev.target.closest('.raia__nome') || ev.target.closest('.det')) return;
    pararInercia();
    ponteiros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      distanciaInicial = Math.hypot(a.x - b.x, a.y - b.y);
      escalaInicial = escala;
      arrasto = null;
      return;
    }
    if (minimo() === 0) return; // nada a arrastar: tudo já cabe
    // O arrasto pode começar em cima de um card; só vira arrasto após o limiar.
    arrasto = { x: ev.clientX, inicio: deslocX, ultimoX: ev.clientX, ultimoT: performance.now(), v: 0, ativo: false, id: ev.pointerId };
  });

  palco.addEventListener('pointermove', (ev) => {
    if (ponteiros.has(ev.pointerId)) ponteiros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ponteiros.size === 2 && distanciaInicial > 0) {
      const [a, b] = [...ponteiros.values()];
      const r = palco.getBoundingClientRect();
      aplicarEscala(escalaInicial * (Math.hypot(a.x - b.x, a.y - b.y) / distanciaInicial), (a.x + b.x) / 2 - r.left);
      return;
    }
    if (!arrasto) return;
    const percorrido = ev.clientX - arrasto.x;
    if (!arrasto.ativo) {
      if (Math.abs(percorrido) < LIMIAR_ARRASTO) return;
      arrasto.ativo = true;
      palco.classList.add('quadro__palco--arrastando');
      hover(null);
      try { palco.setPointerCapture(arrasto.id); } catch { /* ponteiro já liberado */ }
    }
    const bruto = arrasto.inicio + percorrido;
    const dentro = limitar(bruto);
    // Resistência ao passar do limite, em vez de parede seca.
    deslocX = dentro + (bruto - dentro) / 3.2;
    aplicar();
    const agora = performance.now();
    const dt = agora - arrasto.ultimoT;
    if (dt > 0) {
      arrasto.v = ((ev.clientX - arrasto.ultimoX) / dt) * 16;
      arrasto.ultimoX = ev.clientX;
      arrasto.ultimoT = agora;
    }
  });

  const soltar = (ev) => {
    ponteiros.delete(ev.pointerId);
    if (ponteiros.size < 2) distanciaInicial = 0;
    if (!arrasto) return;
    const arrastou = arrasto.ativo;
    const v = Math.abs(arrasto.v) > 1 ? arrasto.v : 0;
    arrasto = null;
    palco.classList.remove('quadro__palco--arrastando');
    if (!arrastou) return; // foi um clique: o card recebe o evento
    suprimirClique = true;
    lancarInercia(v);
  };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);

  // Soltar depois de arrastar não pode abrir o card que estava sob o dedo.
  palco.addEventListener('click', (ev) => {
    if (!suprimirClique) return;
    suprimirClique = false;
    ev.stopPropagation();
    ev.preventDefault();
  }, true);

  /* ---- render --------------------------------------------------------------- */

  function render(itens, opcoes = {}) {
    itensVisiveis = itens;
    mostrarArea = Boolean(opcoes.mostrarArea);
    const largura = Math.max(320, palco.clientWidth);
    layout = calcularLayout(montarRaias(itensVisiveis, mostrarArea), largura);

    if (!itensVisiveis.length) {
      camadaRaias.textContent = '';
      camadaArestas.textContent = '';
      camadaBrilho.textContent = '';
      camadaFluxo.textContent = '';
      camadaNos.textContent = '';
      elementosNo = new Map();
      arestas = [];
      palco.style.height = '';
      layout = null;
      avisar();
      return;
    }

    plano.classList.toggle('quadro__plano--vertical', layout.vertical);
    Object.assign(plano.style, { width: `${layout.largura}px`, height: `${layout.altura}px` });
    desenho.setAttribute('viewBox', `0 0 ${layout.largura} ${layout.altura}`);
    desenho.setAttribute('width', layout.largura);
    desenho.setAttribute('height', layout.altura);

    desenharRaias();
    desenharArestas();

    // Cards que saíram do filtro somem; os que ficaram deslizam; os novos entram.
    for (const [id, no] of elementosNo) {
      if (!layout.nos.has(id)) {
        no.remove();
        elementosNo.delete(id);
      }
    }
    let indice = 0;
    for (const [id, caixa] of layout.nos) {
      let no = elementosNo.get(id);
      if (!no) {
        no = criarNo(caixa);
        no.style.setProperty('--indice', String(Math.min(indice, 30)));
        elementosNo.set(id, no);
      }
      Object.assign(no.style, { left: `${caixa.x}px`, top: `${caixa.y}px`, width: `${caixa.largura}px`, height: `${caixa.altura}px` });
      camadaNos.appendChild(no); // ordem do DOM = ordem de leitura (Tab)
      indice++;
    }

    deslocX = limitar(deslocX);
    aplicar();
    aplicarDestaque();
    avisar();
  }

  /* ---- API ------------------------------------------------------------------ */

  function centralizarNo(id, { vertical = true } = {}) {
    if (!layout || !layout.nos.has(id)) return false;
    pararInercia();
    const c = layout.nos.get(id);
    deslocX = limitar(larguraVisivel() / 2 - (c.x + c.largura / 2) * escala);
    aplicar({ suave: true });
    if (vertical) {
      elementosNo.get(id)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: movimentoReduzido() ? 'auto' : 'smooth' });
    }
    return true;
  }

  return {
    render,
    /** Ancora o painel no topo da raia do alvo (ou solta, com `null`). */
    ancorarPainel(alvo) {
      ancora = alvo;
      if (layout) aplicar({ suave: true });
    },
    /** Rola a página até o painel quando ele está fora da área confortável. */
    revelarPainel() {
      if (!painel || !ancora) return;
      const y = palco.getBoundingClientRect().top + painelTopo;
      if (y >= 90 && y <= window.innerHeight * 0.55) return;
      window.scrollTo({ top: window.scrollY + y - 110, behavior: movimentoReduzido() ? 'auto' : 'smooth' });
    },
    /** Destaque temporário (hover numa lista fora do quadro). */
    destacar: (id) => hover(id),
    /** Etapa aberta no painel: a cadeia dela fica acesa enquanto ele estiver aberto. */
    selecionar(id) {
      idSelecionado = id;
      if (layout) aplicarDestaque();
    },
    focarNo(id, { centralizar = true, vertical = true } = {}) {
      if (!layout || !layout.nos.has(id)) return false;
      if (centralizar) centralizarNo(id, { vertical });
      return true;
    },
    focarElemento(id) {
      elementosNo.get(id)?.focus({ preventScroll: true });
    },
    centralizarNo,
    centralizar() {
      pararInercia();
      escala = 1;
      deslocX = 0;
      aplicar({ suave: true });
      avisar();
    },
    zoomMais: () => aplicarEscala(escala + M.passoZoom),
    zoomMenos: () => aplicarEscala(escala - M.passoZoom),
    get layout() { return layout; },
  };
}
