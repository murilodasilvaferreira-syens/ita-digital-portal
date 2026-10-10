/**
 * Roadmaps (hub.html): um card por área e o "Pulso das áreas" no topo.
 *
 * Os números vêm de metricas.js sobre o mesmo data/initiatives.json das
 * páginas de área — são os mesmos que o gestor vê ao abrir o roadmap.
 *
 * O card leva à página da área no SharePoint (`pageUrl` em config/areas.json),
 * em nova aba: este hub roda dentro de um iframe, e um link comum abriria a
 * página da área espremida nele. Sem pageUrl válido, o card abre o roadmap
 * da área aqui mesmo.
 */

import { criar, linkExterno, animarContagem, plural, lerHash, escreverHash } from './ui.js';
import { carregarPortal } from './data.js';
import { montarCasca, revelar, entrarEmCena } from './shell.js';
import * as M from './metricas.js';
import { icone } from '../icons/icones.js';

const $ = (sel) => document.querySelector(sel);
const SVG = 'http://www.w3.org/2000/svg';
const CIRCUNFERENCIA = 2 * Math.PI * 25;

function svg(tag, atributos = {}) {
  const no = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, String(v));
  return no;
}

/** Só aceita endereço http(s) de verdade: o resto conta como não preenchido. */
function enderecoValido(url) {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Início                                                                     */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  let portal;
  try {
    [, portal] = await Promise.all([
      montarCasca({ ativa: 'roadmaps', marca: 'Roadmap Digital · Transformação Digital Itatiba' }),
      carregarPortal(),
    ]);
  } catch (erro) {
    $('#erro').hidden = false;
    $('#erro-texto').textContent = erro.message;
    document.querySelectorAll('.rm-topo, .rm-areas').forEach((el) => { el.hidden = true; });
    return;
  }

  const { dataset, areas } = portal;
  const itens = dataset.itens;
  const resumo = M.resumoPorArea(itens);
  const reais = resumo.filter((r) => !r.semArea);

  montarTotais(itens, reais.length);
  if (reais.length > 1) montarPulso(reais, itens);
  montarAreas(resumo, areas);
  revelar();
}

/* -------------------------------------------------------------------------- */
/* Cabeçalho                                                                  */
/* -------------------------------------------------------------------------- */

function montarTotais(itens, nAreas) {
  animarContagem($('#total-etapas'), itens.length);
  animarContagem($('#total-projetos'), M.projetosDistintos(itens));
  animarContagem($('#total-areas'), nAreas);
  animarContagem($('#total-implantadas'), M.contarPorStatus(itens).get('Implantada') || 0);
}

/* -------------------------------------------------------------------------- */
/* Pulso das áreas                                                            */
/* -------------------------------------------------------------------------- */

/** Cor do nó pelo avanço médio da área (mesma rampa da legenda). */
function tom(media) {
  if (media < 25) return { fill: 'var(--laranja-palido)', stroke: 'rgba(207, 95, 24, 0.18)', claro: true };
  if (media < 50) return { fill: 'var(--laranja-suave)', stroke: 'rgba(207, 95, 24, 0.12)' };
  if (media < 65) return { fill: 'var(--laranja)', stroke: 'transparent' };
  return { fill: 'var(--laranja-forte)', stroke: 'transparent' };
}

/**
 * Rede: a área de maior volume no centro, as outras numa elipse em volta,
 * alternando dois raios para não parecer um relógio. Tamanho = volume de
 * etapas; cor = avanço médio; arestas = ligação com o centro e projetos que
 * duas áreas compartilham.
 */
function montarPulso(areas, itens) {
  const W = 440;
  const H = 310;
  const centro = [215, 158];
  const ordenadas = [...areas].sort((a, b) => b.n - a.n);
  const hub = ordenadas[0];
  const resto = [...ordenadas.slice(1)].sort((a, b) => a.area.localeCompare(b.area, 'pt-BR'));
  const maxN = hub.n;

  const nos = new Map();
  const raio = (a, ehHub) => 7 + Math.sqrt(a.n / maxN) * (ehHub ? 21 : 16);
  nos.set(hub.area, { ...hub, x: centro[0], y: centro[1], r: raio(hub, true), hub: true });
  resto.forEach((a, i) => {
    const ang = (i / resto.length) * Math.PI * 2 - Math.PI / 2 + 0.35;
    const k = i % 2 === 0 ? 1 : 0.74;
    nos.set(a.area, {
      ...a,
      x: +(centro[0] + Math.cos(ang) * 168 * k).toFixed(1),
      y: +(centro[1] + Math.sin(ang) * 116 * k).toFixed(1),
      r: raio(a, false),
    });
  });

  const area = $('#pulso-svg');
  area.appendChild(svg('circle', { cx: centro[0], cy: centro[1], r: 138, class: 'pulso__orbita' }));
  for (let i = 0; i < 14; i++) {
    area.appendChild(svg('circle', {
      cx: 30 + ((i * 83) % 390),
      cy: 18 + ((i * 131) % 280),
      r: i % 4 === 0 ? 2 : 1.3,
      class: i % 5 === 0 ? 'pulso__poeira pulso__poeira--acento' : 'pulso__poeira',
    }));
  }

  const arestas = [];
  const ligar = (de, para, projeto) => {
    const a = nos.get(de);
    const b = nos.get(para);
    if (!a || !b) return;
    const linha = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: projeto ? 'pulso__aresta pulso__aresta--projeto' : 'pulso__aresta' });
    linha.dataset.de = de;
    linha.dataset.para = para;
    arestas.push(linha);
    area.appendChild(linha);
  };
  resto.forEach((a) => ligar(hub.area, a.area, false));
  M.areasComProjetoEmComum(itens)
    .filter(([a, b]) => a !== hub.area && b !== hub.area)
    .forEach(([a, b]) => ligar(a, b, true));

  // Rótulos fixos: o centro, a de maior avanço e a de menor. O resto aparece no hover.
  const porAvanco = [...resto].sort((a, b) => b.media - a.media);
  const fixos = new Set([hub.area, porAvanco[0]?.area, porAvanco[porAvanco.length - 1]?.area].filter(Boolean));
  const camadaRotulos = $('#pulso-rotulos');

  const desenharRotulos = (extra) => {
    camadaRotulos.textContent = '';
    const nomes = new Set(fixos);
    if (extra) nomes.add(extra);
    for (const nome of nomes) {
      const no = nos.get(nome);
      const r = criar('div', 'pulso__rotulo');
      const t = tom(no.media);
      r.style.setProperty('--cor', t.claro ? 'var(--laranja-suave)' : t.fill);
      r.append(criar('b', null, no.area), criar('small', null, `${no.media}%`));
      const direita = no.x <= 300;
      r.style.left = `${(((direita ? no.x + no.r + 8 : no.x - no.r - 8)) / W) * 100}%`;
      r.style.top = `${(no.y / H) * 100}%`;
      r.style.transform = direita ? 'translate(0, -50%)' : 'translate(-100%, -50%)';
      camadaRotulos.appendChild(r);
    }
  };

  // O centro por último, para ficar por cima das arestas e dos vizinhos.
  [...resto.map((a) => nos.get(a.area)), nos.get(hub.area)].forEach((no) => {
    const t = tom(no.media);
    const g = svg('g', { class: 'pulso__no', tabindex: 0, role: 'img' });
    g.setAttribute('aria-label', `${no.area}: ${no.n} ${plural(no.n, 'etapa', 'etapas')}, ${no.media}% de avanço médio`);
    const quente = no.hub || no.media >= 50;
    const brilho = svg('circle', { cx: no.x, cy: no.y, r: (no.r * (no.hub ? 2.6 : 2)).toFixed(1), fill: quente ? 'url(#pulso-brilho)' : 'transparent' });
    const bola = svg('circle', { cx: no.x, cy: no.y, r: no.r.toFixed(1) });
    bola.style.fill = t.fill;
    bola.style.stroke = t.stroke;
    g.append(brilho, bola);

    const entrar = () => {
      bola.setAttribute('r', (no.r * 1.12).toFixed(1));
      if (!quente) brilho.setAttribute('fill', 'url(#pulso-brilho-suave)');
      arestas.forEach((l) => l.classList.toggle('ativa', l.dataset.de === no.area || l.dataset.para === no.area));
      desenharRotulos(no.area);
    };
    const sair = () => {
      bola.setAttribute('r', no.r.toFixed(1));
      if (!quente) brilho.setAttribute('fill', 'transparent');
      arestas.forEach((l) => l.classList.remove('ativa'));
      desenharRotulos(null);
    };
    g.addEventListener('mouseenter', entrar);
    g.addEventListener('mouseleave', sair);
    g.addEventListener('focus', entrar);
    g.addEventListener('blur', sair);
    area.appendChild(g);
  });

  const nucleo = $('#pulso-nucleo');
  nucleo.style.left = `${(centro[0] / W) * 100}%`;
  nucleo.style.top = `${(centro[1] / H) * 100}%`;
  desenharRotulos(null);

  $('#pulso-sub').textContent = `${areas.length} áreas conectadas`;
  animarContagem($('#pulso-n'), areas.length);
  $('#pulso').hidden = false;
}

/* -------------------------------------------------------------------------- */
/* Cards das áreas                                                            */
/* -------------------------------------------------------------------------- */

function montarAreas(resumo, config) {
  const grade = $('#rm-grade');
  const porSlug = new Map(config.map((a) => [a.slug, a]));

  // Área configurada sem nenhuma etapa ainda também aparece (vazia, sem número inventado).
  const vistas = new Set(resumo.map((r) => r.slug));
  const cards = [
    ...resumo,
    ...config.filter((a) => !vistas.has(a.slug)).map((a) => ({ area: a.name, slug: a.slug, n: 0, media: 0, atrasadas: 0, status: new Map(), projetos: [], semArea: false })),
  ];

  const botoes = [...document.querySelectorAll('[data-ordem]')];
  let primeira = true;

  const render = (ordem) => {
    botoes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ordem === ordem)));
    const lista = [...cards].sort((a, b) => (a.semArea - b.semArea)
      || (ordem === 'avanco' ? b.media - a.media : b.n - a.n)
      || a.area.localeCompare(b.area, 'pt-BR'));

    grade.textContent = '';
    lista.forEach((r) => {
      const card = criarCard(r, porSlug.get(r.slug));
      if (primeira) card.setAttribute('data-revelar', '');
      grade.appendChild(card);
      const anel = card.querySelector('.anel');
      if (!anel) return;
      if (primeira) entrarEmCena(anel);
      else anel.classList.add('em-cena');
    });
    primeira = false;
  };

  const ordemInicial = lerHash().ordem === 'avanco' ? 'avanco' : 'volume';
  botoes.forEach((b) => b.addEventListener('click', () => {
    escreverHash({ ordem: b.dataset.ordem === 'avanco' ? 'avanco' : '' }, { substituir: true });
    render(b.dataset.ordem);
  }));
  render(ordemInicial);
}

function criarCard(r, cfg) {
  const nome = r.semArea ? 'Outros' : (cfg?.name || r.area);
  const externo = enderecoValido(cfg?.pageUrl);
  let card;
  if (externo) {
    card = linkExterno(cfg.pageUrl, 'area');
    card.setAttribute('aria-label', `Roadmap de ${nome} (abre em nova aba)`);
  } else {
    card = criar('a', 'area');
    card.href = r.semArea || !r.slug ? 'index.html' : `index.html?area=${encodeURIComponent(r.slug)}`;
    card.setAttribute('aria-label', r.semArea ? 'Roadmap com todas as áreas' : `Roadmap de ${nome}`);
  }

  const topo = criar('div', 'area__topo');
  const titulo = criar('div');
  titulo.append(criar('h3', 'area__nome', nome));
  const nProj = r.projetos.length;
  titulo.append(criar('div', 'area__meta', r.n
    ? `${r.n} ${plural(r.n, 'etapa', 'etapas')} · ${nProj} ${plural(nProj, 'projeto', 'projetos')}`
    : 'Sem etapas registradas'));
  const seta = criar('span', 'area__seta');
  seta.setAttribute('aria-hidden', 'true');
  const ic = icone(externo ? 'seta-externa' : 'seta');
  if (ic) seta.appendChild(ic);
  topo.append(titulo, seta);
  card.appendChild(topo);

  if (nProj) {
    const projetos = criar('ul', 'area__projetos');
    projetos.setAttribute('aria-label', 'Projetos');
    r.projetos.slice(0, 5).forEach((p) => projetos.appendChild(criar('li', null, p)));
    if (nProj > 5) projetos.appendChild(criar('li', null, `+${nProj - 5}`));
    card.appendChild(projetos);
  }

  if (!r.n) {
    card.appendChild(criar('p', 'area__vazio', 'As etapas desta área aparecem aqui assim que forem cadastradas.'));
    return card;
  }
  if (cfg?.ocultarEstatisticas) return card;

  const resumo = criar('div', 'area__resumo');
  const anel = criar('div', 'anel');
  anel.setAttribute('aria-hidden', 'true');
  const desenho = svg('svg', { viewBox: '0 0 58 58' });
  desenho.appendChild(svg('circle', { cx: 29, cy: 29, r: 25, class: 'anel__trilha' }));
  // Com 0% o arco não é desenhado: a ponta arredondada viraria um ponto solto
  // sobre a trilha, que se lê como "um pouquinho feito".
  if (r.media > 0) {
    const arco = svg('circle', { cx: 29, cy: 29, r: 25, class: 'anel__valor' });
    arco.style.setProperty('--arco', ((r.media / 100) * CIRCUNFERENCIA).toFixed(1));
    desenho.appendChild(arco);
  }
  anel.append(desenho, criar('span', 'anel__pct', `${r.media}%`));

  const status = criar('ul', 'area__status');
  status.setAttribute('aria-label', `Avanço médio de ${r.media}%`);
  for (const [st, n] of r.status) {
    if (!n) continue;
    const li = criar('li');
    li.style.setProperty('--cor', M.corStatus(st));
    li.append(criar('span', null, M.rotuloStatus(st)), criar('b', null, n));
    status.appendChild(li);
  }
  resumo.append(anel, status);
  card.appendChild(resumo);
  return card;
}
