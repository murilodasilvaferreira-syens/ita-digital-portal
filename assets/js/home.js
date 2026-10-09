/**
 * Início (home.html) — a porta de entrada do portal.
 *
 * Cruza as três frentes lendo os mesmos arquivos que as outras páginas:
 * iniciativas (Power Automate), trilhas da Academia e índice de notícias.
 * Nenhum número é digitado aqui: tudo sai de metricas.js e conteudo.js.
 *
 * Cada fonte carrega de forma independente — se uma falhar, só a sua parte
 * some. Todo texto entra por textContent.
 */

import { criar, linkExterno, normalizar, debounce, animarContagem, plural, movimentoReduzido } from './ui.js';
import { carregarPortal } from './data.js';
import { montarCasca, revelar, entrarEmCena, urlTeams, urlNovaIniciativa } from './shell.js';
import { carregarArtigos, carregarTrilhas, minutosDoArtigo, escolherManchete, dataCurta, diasDesde } from './conteudo.js';
import * as M from './metricas.js';
import { icone } from '../icons/icones.js';

const $ = (sel) => document.querySelector(sel);
const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, atributos = {}) {
  const no = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, String(v));
  return no;
}

/** Texto com um trecho em negrito: ("12 entregas", " neste mês"). */
function textoComDestaque(alvo, forte, resto) {
  alvo.textContent = '';
  alvo.append(criar('b', null, forte), document.createTextNode(resto));
}

async function tentar(promessa, rotulo) {
  try {
    return await promessa;
  } catch (erro) {
    console.warn(`[início] ${rotulo}: ${erro.message}`);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Início                                                                     */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  const [site, portal, academia, artigos] = await Promise.all([
    montarCasca({ ativa: 'inicio', rodape: 'completo' }),
    tentar(carregarPortal(), 'iniciativas'),
    tentar(carregarTrilhas(), 'trilhas'),
    tentar(carregarArtigos(), 'notícias'),
  ]);

  const itens = portal?.dataset.itens ?? [];
  const areas = portal?.areas ?? [];
  const trilhas = academia?.trilhas ?? [];
  const lista = artigos ?? [];
  const slugsDeArea = new Set(areas.map((a) => a.slug));
  const urlEtapa = (item) => (slugsDeArea.has(item.slugArea)
    ? `index.html?area=${item.slugArea}#i=${item.id}`
    : `index.html#i=${item.id}`);

  $('#convite-nova').href = urlNovaIniciativa(site);

  montarLetreiro(areas, itens);
  montarFrentes(itens, trilhas, lista);
  if (itens.length) montarNumeros(itens);
  else $('#numeros').hidden = true;
  montarTrilhas(trilhas, site);
  montarNovidades(itens, lista, urlEtapa);
  montarBusca(itens, trilhas, lista, urlEtapa);

  revelar();
}

/* -------------------------------------------------------------------------- */
/* Letreiro de áreas                                                          */
/* -------------------------------------------------------------------------- */

function montarLetreiro(areas, itens) {
  const faixa = $('#letreiro-areas');
  const nomes = areas.length
    ? areas.map((a) => a.name)
    : [...new Set(itens.map((i) => i.area).filter((a) => a !== 'Sem área'))];
  if (!nomes.length) {
    faixa.closest('.letreiro').hidden = true;
    return;
  }

  // O laço infinito anda meia faixa: a lista vai duas vezes. Parado, uma só.
  const voltas = movimentoReduzido() ? 1 : 2;
  for (let v = 0; v < voltas; v++) {
    nomes.forEach((nome) => {
      const area = criar('span', 'letreiro__area', nome);
      if (v > 0) area.setAttribute('aria-hidden', 'true');
      const sep = criar('span', 'letreiro__sep');
      sep.setAttribute('aria-hidden', 'true');
      faixa.append(area, sep);
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Três frentes                                                               */
/* -------------------------------------------------------------------------- */

function montarFrentes(itens, trilhas, artigos) {
  // Roadmaps: entregas (conclusão) do mês; sem nenhuma, o último mês com entrega.
  const vivo = $('#frente-roadmaps-vivo');
  if (itens.length) {
    const mes = M.mesAtual();
    const doMes = M.implantadasNoMes(itens, mes);
    if (doMes > 0) {
      textoComDestaque(vivo, `${doMes} ${plural(doMes, 'entrega', 'entregas')}`, ' neste mês');
    } else {
      const meses = Object.keys(M.porMes(itens.filter((i) => i.status === 'Implantada'), 'doneDate')).sort();
      const ultimo = meses[meses.length - 1];
      if (ultimo) {
        const n = M.implantadasNoMes(itens, ultimo);
        textoComDestaque(vivo, `${n} ${plural(n, 'entrega', 'entregas')}`, ` em ${M.nomeMesLongo(ultimo)}`);
      } else {
        textoComDestaque(vivo, `${itens.length} etapas`, ' no roadmap');
      }
    }
  }

  // Academia: duas trilhas (disponíveis primeiro) e a contagem real.
  const listaTrilhas = $('#frente-trilhas');
  const ordenadas = [...trilhas].sort((a, b) => Number(b.disponivel === true) - Number(a.disponivel === true));
  ordenadas.slice(0, 2).forEach((t) => {
    const li = criar('li', 'bento__item');
    li.appendChild(criar('span', null, [t.nome, t.nivel].filter(Boolean).join(' · ')));
    if (t.disponivel === true) {
      const seta = icone('seta');
      if (seta) li.appendChild(seta);
    } else {
      li.appendChild(criar('small', null, 'em breve'));
    }
    listaTrilhas.appendChild(li);
  });
  if (trilhas.length) {
    const disp = trilhas.filter((t) => t.disponivel === true).length;
    const vivoAcademia = $('#frente-academia-vivo');
    if (disp) textoComDestaque(vivoAcademia, `${disp} ${plural(disp, 'trilha', 'trilhas')}`, ` ${plural(disp, 'disponível', 'disponíveis')} de ${trilhas.length}`);
    else textoComDestaque(vivoAcademia, `${trilhas.length} trilhas`, ' em preparação');
  }

  // Notícias: o artigo mais recente, com tempo de leitura do próprio texto.
  const recente = artigos[0];
  if (recente) {
    $('#frente-noticias').href = `noticias.html#/${recente.slug}`;
    $('#frente-artigo').hidden = false;
    $('#frente-artigo-titulo').textContent = recente.titulo;
    $('#frente-artigo-novo').hidden = (diasDesde(recente.data) ?? 99) > 14;
    const data = dataCurta(recente.data, { ano: false });
    $('#frente-artigo-data').textContent = data;
    $('#frente-noticias-vivo').textContent = 'Artigo mais recente';
    minutosDoArtigo(recente.slug).then((min) => {
      if (min) $('#frente-artigo-data').textContent = `${data} · ${min} min`;
    });
  }
}

/* -------------------------------------------------------------------------- */
/* A planta em números                                                        */
/* -------------------------------------------------------------------------- */

function montarNumeros(itens) {
  const projetos = M.projetosDistintos(itens);
  $('#numeros-kicker').textContent = `Indicadores · ${itens.length} etapas · ${projetos} projetos`;

  montarPortfolio(itens, projetos);
  montarEvolucao(itens);
  montarMatriz(itens);
  montarRitmo(itens);
  montarLeituras(itens);
  montarVetores(itens);

  document.querySelectorAll('#numeros .viz').forEach(entrarEmCena);
}

/** Campo radial de pontos: cada ponto é uma fatia do portfólio por status. */
function montarPortfolio(itens, projetos) {
  const status = M.contarPorStatus(itens);
  const implantadas = status.get('Implantada') || 0;

  animarContagem($('#portfolio-projetos'), projetos);
  animarContagem($('#portfolio-etapas'), itens.length);
  $('#portfolio-parcela').textContent = `${Math.round((implantadas / itens.length) * 100)}% implantado`;

  const fatias = ['Implantada', 'Em desenvolvimento', 'Dependente'];
  const aneis = [{ r: 56, c: 22 }, { r: 74, c: 28 }, { r: 92, c: 34 }, { r: 110, c: 40 }];
  const total = aneis.reduce((s, a) => s + a.c, 0);
  const sementes = [];
  fatias.forEach((st) => {
    const q = Math.round(((status.get(st) || 0) / itens.length) * total);
    for (let i = 0; i < q; i++) sementes.push(st);
  });

  const campo = $('#portfolio-pontos');
  let k = 0;
  aneis.forEach((anel, a) => {
    for (let i = 0; i < anel.c; i++) {
      const st = sementes[k++] || 'resto';
      const ang = (i / anel.c) * Math.PI * 2 - Math.PI / 2 + a * 0.12;
      const ponto = svg('circle', {
        cx: (126 + Math.cos(ang) * anel.r).toFixed(1),
        cy: (126 + Math.sin(ang) * anel.r).toFixed(1),
        r: (2.2 + a * 0.5).toFixed(1),
        opacity: (0.45 + a * 0.18).toFixed(2),
      });
      ponto.style.fill = st === 'resto' ? 'var(--areia-3)' : M.corStatus(st);
      ponto.dataset.st = st;
      campo.appendChild(ponto);
    }
  });

  const legenda = $('#portfolio-legenda');
  fatias.forEach((st) => {
    const li = criar('li');
    li.style.setProperty('--cor', M.corStatus(st));
    li.tabIndex = 0;
    const n = criar('div', 'portfolio__legenda-n');
    li.append(n, criar('div', 'portfolio__legenda-rotulo', M.rotuloStatus(st)));
    animarContagem(n, status.get(st) || 0);
    const entrar = () => {
      legenda.classList.add('tem-destaque');
      li.classList.add('ativo');
      campo.querySelectorAll('circle').forEach((c) => c.classList.toggle('fora', c.dataset.st !== st));
    };
    const sair = () => {
      legenda.classList.remove('tem-destaque');
      li.classList.remove('ativo');
      campo.querySelectorAll('circle.fora').forEach((c) => c.classList.remove('fora'));
    };
    li.addEventListener('mouseenter', entrar);
    li.addEventListener('mouseleave', sair);
    li.addEventListener('focus', entrar);
    li.addEventListener('blur', sair);
    legenda.appendChild(li);
  });
}

/** Pirulitos: a altura de cada um codifica o total acumulado no mês. */
function montarEvolucao(itens) {
  const { pontos, semData } = M.implantadasAcumuladas(itens, 6);
  const card = $('#viz-evolucao');
  if (!pontos.length) {
    card.hidden = true;
    return;
  }

  const sub = [`Total acumulado nos últimos ${pontos.length} ${plural(pontos.length, 'mês', 'meses')}`];
  if (semData) sub.push(`${semData} sem data de conclusão`);
  $('#evolucao-sub').textContent = sub.join(' · ');

  const ultimo = pontos[pontos.length - 1];
  const anterior = pontos[pontos.length - 2];
  if (anterior && anterior.valor) {
    const pct = Math.round(((ultimo.valor - anterior.valor) / anterior.valor) * 100);
    const selo = $('#evolucao-crescimento');
    selo.textContent = `${pct >= 0 ? '↗ +' : '↘ '}${pct}% vs. ${anterior.rotulo}`;
    selo.hidden = false;
  }

  const trilho = $('#evolucao-pontos');
  const meses = $('#evolucao-meses');
  const maximo = Math.max(...pontos.map((p) => p.valor)) || 1;
  pontos.forEach((p) => {
    const col = criar('div', 'evolucao__ponto');
    col.style.setProperty('--pos', `${(4 + (p.valor / maximo) * 70).toFixed(2)}%`);
    col.tabIndex = 0;
    col.setAttribute('aria-label', `${p.rotulo}: ${p.valor} ${plural(p.valor, 'etapa implantada', 'etapas implantadas')} no acumulado`);
    col.append(criar('span', 'evolucao__haste'), criar('span', 'evolucao__capsula'), criar('span', 'evolucao__valor', p.valor));
    const rotulo = criar('span', null, p.rotulo.toUpperCase());
    const entrar = () => { trilho.classList.add('tem-destaque'); col.classList.add('ativo'); rotulo.classList.add('ativo'); };
    const sair = () => { trilho.classList.remove('tem-destaque'); col.classList.remove('ativo'); rotulo.classList.remove('ativo'); };
    col.addEventListener('mouseenter', entrar);
    col.addEventListener('mouseleave', sair);
    col.addEventListener('focus', entrar);
    col.addEventListener('blur', sair);
    trilho.appendChild(col);
    meses.appendChild(rotulo);
  });
}

/** Matriz prioridade × complexidade em bolhas proporcionais. */
function montarMatriz(itens) {
  const { celulas } = M.matrizPrioridade(itens);
  const plano = $('#matriz-plano');
  const dica = $('#matriz-dica');
  const foco = celulas.find((c) => c.prioridade === 'Alta' && c.complexidade === 'Alta');
  animarContagem($('#matriz-foco'), foco ? foco.n : 0);

  const grade = criar('div', 'matriz__grade');
  for (const pos of ['33.333%', '66.666%']) {
    const h = criar('span');
    Object.assign(h.style, { left: '0', right: '0', top: pos, height: '1px' });
    const v = criar('span');
    Object.assign(v.style, { top: '0', bottom: '0', left: pos, width: '1px' });
    grade.append(h, v);
  }
  plano.appendChild(grade);

  M.PRIORIDADES.forEach((p, i) => {
    const r = criar('span', 'matriz__rotulo-l', p);
    r.style.top = `${16.666 + i * 33.333}%`;
    plano.appendChild(r);
  });
  M.COMPLEXIDADES.forEach((c, i) => {
    const r = criar('span', 'matriz__rotulo-c', c);
    r.style.left = `${16.666 + i * 33.333}%`;
    plano.appendChild(r);
  });

  // Poeira decorativa, em posições fixas (nada aleatório entre recargas).
  for (let i = 0; i < 22; i++) {
    const d = criar('span', 'matriz__poeira');
    d.setAttribute('aria-hidden', 'true');
    d.style.left = `${6 + ((i * 41) % 88)}%`;
    d.style.top = `${7 + ((i * 67) % 86)}%`;
    plano.appendChild(d);
  }

  const maximo = Math.max(1, ...celulas.map((c) => c.n));
  // As bolhas encolhem junto com o card no celular.
  const escala = Math.min(1, Math.max(0.6, (plano.clientWidth || 320) / 320));
  celulas.filter((c) => c.n > 0).forEach((c) => {
    const ehFoco = c === foco;
    const tamanho = (24 + (c.n / maximo) * 44) * escala;
    const left = `${16.666 + M.COMPLEXIDADES.indexOf(c.complexidade) * 33.333}%`;
    const top = `${16.666 + M.PRIORIDADES.indexOf(c.prioridade) * 33.333}%`;

    const halo = criar('span', `matriz__halo${ehFoco ? ' matriz__halo--foco' : ''}`);
    Object.assign(halo.style, { left, top, width: `${tamanho * 1.75}px`, height: `${tamanho * 1.75}px` });
    halo.setAttribute('aria-hidden', 'true');

    let classe = 'matriz__bolha';
    if (ehFoco) classe += ' matriz__bolha--foco';
    else if (c.n >= 15) classe += ' matriz__bolha--forte';
    const bolha = criar('span', classe, c.n);
    Object.assign(bolha.style, { left, top, width: `${tamanho}px`, height: `${tamanho}px` });
    if (tamanho > 46) bolha.style.fontSize = '15px';
    const texto = `${c.n} ${plural(c.n, 'etapa', 'etapas')} · prioridade ${c.prioridade.toLowerCase()} · complexidade ${c.complexidade.toLowerCase()}`;
    bolha.tabIndex = 0;
    bolha.setAttribute('aria-label', texto);
    const entrar = () => { dica.textContent = texto; };
    const sair = () => { dica.textContent = ''; };
    bolha.addEventListener('mouseenter', entrar);
    bolha.addEventListener('mouseleave', sair);
    bolha.addEventListener('focus', entrar);
    bolha.addEventListener('blur', sair);
    plano.append(halo, bolha);
  });
}

/** Mapa de calor área × mês. */
function montarRitmo(itens) {
  const { meses, linhas, maximo } = M.ritmoPorArea(itens, 6);
  const card = $('#viz-ritmo');
  if (!linhas.length) {
    card.hidden = true;
    return;
  }
  const rotulos = meses.map(M.nomeMes);
  const ano = meses[meses.length - 1].slice(0, 4);
  $('#ritmo-sub').textContent = `Etapas movimentadas por mês · ${rotulos[0]}–${rotulos[rotulos.length - 1]} ${ano}`;

  const grade = $('#ritmo-grade');
  grade.style.setProperty('--colunas', String(meses.length));
  const dica = $('#ritmo-dica');

  grade.appendChild(criar('span'));
  const cabec = criar('div', 'ritmo__meses');
  cabec.setAttribute('aria-hidden', 'true');
  rotulos.forEach((r) => cabec.appendChild(criar('span', null, r)));
  grade.appendChild(cabec);

  const celulas = [];
  linhas.forEach((linha, li) => {
    grade.appendChild(criar('span', 'ritmo__area', linha.area));
    const fila = criar('div', 'ritmo__celulas');
    linha.valores.forEach((n, ci) => {
      const cel = criar('span', 'ritmo__celula');
      cel.style.setProperty('--cor', M.corCalor(M.nivelCalor(n, maximo)));
      cel.dataset.l = li;
      cel.dataset.c = ci;
      const texto = `${linha.area} · ${rotulos[ci]}: ${n} ${plural(n, 'etapa', 'etapas')}`;
      cel.setAttribute('aria-label', texto);
      cel.setAttribute('role', 'img');
      cel.addEventListener('mouseenter', () => {
        grade.classList.add('tem-destaque');
        celulas.forEach((x) => {
          x.classList.toggle('na-cruz', x.dataset.l === cel.dataset.l || x.dataset.c === cel.dataset.c);
          x.classList.toggle('ativa', x === cel);
        });
        dica.textContent = texto;
        dica.hidden = false;
      });
      cel.addEventListener('mouseleave', () => {
        grade.classList.remove('tem-destaque');
        celulas.forEach((x) => x.classList.remove('na-cruz', 'ativa'));
        dica.hidden = true;
      });
      celulas.push(cel);
      fila.appendChild(cel);
    });
    grade.appendChild(fila);
  });

  const escala = $('#ritmo-escala');
  for (let n = 1; n <= 6; n++) {
    const d = criar('span');
    d.style.setProperty('--cor', M.corCalor(n));
    escala.appendChild(d);
  }
}

function montarLeituras(itens) {
  const l = M.leituras(itens);
  animarContagem($('#leitura-dependem'), l.dependem);
  animarContagem($('#leitura-zero'), l.semProgresso);
  if (l.ganhoPrincipal) {
    $('#leitura-ganho').hidden = false;
    $('#leitura-ganho-nome').textContent = l.ganhoPrincipal.rotulo;
    $('#leitura-ganho-texto').textContent = `é o principal vetor de valor da transformação, citado em ${l.ganhoPrincipal.n} ${plural(l.ganhoPrincipal.n, 'etapa', 'etapas')}.`;
  }
}

function montarVetores(itens) {
  const ganhos = M.rankingGanhos(itens).slice(0, 7);
  const lista = $('#vetores');
  if (!ganhos.length) {
    $('#viz-vetores').hidden = true;
    return;
  }
  const maximo = ganhos[0][1];
  ganhos.forEach(([rotulo, n]) => {
    const li = criar('li');
    li.style.setProperty('--pct', `${((n / maximo) * 100).toFixed(1)}%`);
    li.tabIndex = 0;
    li.setAttribute('aria-label', `${rotulo}: citado em ${n} ${plural(n, 'etapa', 'etapas')}`);
    const trilho = criar('span', 'vetor__trilho');
    trilho.append(criar('span', 'vetor__barra'), criar('span', 'vetor__ponta'));
    li.append(criar('span', 'vetor__nome', rotulo), trilho, criar('span', 'vetor__valor', n));
    const entrar = () => { lista.classList.add('tem-destaque'); li.classList.add('ativo'); };
    const sair = () => { lista.classList.remove('tem-destaque'); li.classList.remove('ativo'); };
    li.addEventListener('mouseenter', entrar);
    li.addEventListener('mouseleave', sair);
    li.addEventListener('focus', entrar);
    li.addEventListener('blur', sair);
    lista.appendChild(li);
  });
}

/* -------------------------------------------------------------------------- */
/* Trilhas                                                                    */
/* -------------------------------------------------------------------------- */

function montarTrilhas(trilhas, site) {
  if (!trilhas.length) return;
  const grade = $('#trilhas-grade');
  const ordenadas = [...trilhas].sort((a, b) => Number(b.disponivel === true) - Number(a.disponivel === true)).slice(0, 3);

  ordenadas.forEach((t) => {
    const disponivel = t.disponivel === true;
    const meta = [t.duracaoHoras ? `${t.duracaoHoras}h` : null, t.nivel].filter(Boolean).join(' · ');
    let card;

    if (disponivel) {
      card = t.link ? linkExterno(t.link, 'cartao trilha') : criar('a', 'cartao trilha');
      if (!t.link) card.href = `academia.html#trilha=${encodeURIComponent(t.id)}`;
      const topo = criar('div', 'trilha__topo');
      const selo = criar('span', 'selo selo--acento');
      selo.append(criar('span', 'ponto-vivo'), document.createTextNode('Disponível'));
      topo.append(criar('span', 'trilha__cat', t.nome), selo);
      const acao = criar('span', 'trilha__acao', 'Começar');
      const seta = icone('seta');
      if (seta) acao.appendChild(seta);
      const rodape = criar('div', 'trilha__rodape');
      rodape.append(criar('span', 'trilha__meta', meta), acao);
      card.append(topo, criar('h3', 'trilha__titulo', t.descricao || t.nome), criar('div', 'trilha__titulo-espaco'), rodape);
    } else {
      card = criar('div', 'trilha trilha--breve');
      const topo = criar('div', 'trilha__topo');
      topo.append(criar('span', 'trilha__cat', t.nome), criar('span', 'selo', 'Em breve'));
      // "Avise-me" abre o Teams com o pedido pronto: interesse real, não botão morto.
      const avise = linkExterno(urlTeams(site, `Olá! Quero ser avisado quando a trilha ${t.nome} da Academia Digital abrir.`), 'trilha__avise');
      avise.textContent = 'Avise-me';
      avise.setAttribute('aria-label', `Avise-me quando a trilha ${t.nome} abrir`);
      const rodape = criar('div', 'trilha__rodape');
      rodape.append(criar('span', 'trilha__meta', meta), avise);
      card.append(topo, criar('h3', 'trilha__titulo', t.descricao || t.nome), criar('div', 'trilha__titulo-espaco'), rodape);
    }
    card.setAttribute('data-revelar', '');
    grade.appendChild(card);
  });
  $('#trilhas').hidden = false;
}

/* -------------------------------------------------------------------------- */
/* Movimento recente                                                          */
/* -------------------------------------------------------------------------- */

function montarNovidades(itens, artigos, urlEtapa) {
  const entregas = itens
    .filter((i) => i.status === 'Implantada' && i.doneDate)
    .sort((a, b) => b.doneDate.localeCompare(a.doneDate) || a.id - b.id)
    .map((i) => ({ tipo: 'entregue', data: i.doneDate, titulo: i.title, fonte: `Roadmap · ${i.area}`, href: urlEtapa(i) }));
  const doArtigo = (a) => ({
    tipo: 'artigo', data: a.data, titulo: a.titulo, slug: a.slug, capa: a.capa,
    fonte: ['Notícias', a.categoria].filter(Boolean).join(' · '), href: `noticias.html#/${a.slug}`,
  });

  const manchete = escolherManchete(artigos);
  const destaque = manchete ? doArtigo(manchete) : entregas[0] ?? null;
  const resto = [
    ...artigos.filter((a) => a !== manchete).map(doArtigo),
    ...entregas.filter((e) => e !== destaque),
  ].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 3);

  if (!destaque) return;
  const grade = $('#novidades-grade');
  grade.appendChild(criarDestaque(destaque));
  if (resto.length) {
    const pilha = criar('div', 'novidades__pilha');
    resto.forEach((n) => pilha.appendChild(criarNovidade(n)));
    grade.appendChild(pilha);
  } else {
    grade.style.gridTemplateColumns = 'minmax(0, 1fr)';
  }
  $('#novidades').hidden = false;
}

function metaLeitura(alvo, item) {
  const data = dataCurta(item.data).toUpperCase();
  alvo.textContent = data;
  if (item.tipo !== 'artigo') return;
  minutosDoArtigo(item.slug).then((min) => {
    if (min) alvo.textContent = `${data} · ${min} MIN DE LEITURA`;
  });
}

function criarDestaque(item) {
  const card = criar('a', 'destaque');
  card.href = item.href;
  card.setAttribute('data-revelar', '');

  const midia = criar('div', 'destaque__midia');
  if (item.capa) {
    const img = criar('img');
    img.src = item.capa;
    img.alt = '';
    img.loading = 'lazy';
    midia.appendChild(img);
  } else {
    // Sem imagem: tratamento tipográfico com a inicial do título, nunca moldura vazia.
    midia.appendChild(criar('span', 'destaque__letra', item.titulo.charAt(0)));
  }
  card.append(midia, criar('div', 'destaque__desfoque'), criar('div', 'destaque__veu'));

  const corpo = criar('div', 'destaque__corpo');
  const texto = criar('div');
  const tags = criar('div', 'destaque__tags');
  tags.append(
    criar('span', 'selo selo--cheio', 'Destaque'),
    criar('span', 'selo selo--claro', item.tipo === 'artigo' ? 'Artigo' : 'Entregue'),
  );
  const meta = criar('div', 'destaque__meta');
  metaLeitura(meta, item);
  texto.append(tags, criar('h3', 'destaque__titulo', item.titulo), meta);
  const seta = criar('span', 'destaque__seta');
  const icSeta = icone('seta');
  if (icSeta) seta.appendChild(icSeta);
  seta.setAttribute('aria-hidden', 'true');
  corpo.append(texto, seta);
  card.appendChild(corpo);
  return card;
}

function criarNovidade(item) {
  const card = criar('a', 'novidade');
  card.href = item.href;
  card.setAttribute('data-revelar', '');

  const mini = criar('div', `novidade__miniatura novidade__miniatura--${item.tipo}`);
  mini.setAttribute('aria-hidden', 'true');
  if (item.capa) {
    const img = criar('img');
    img.src = item.capa;
    img.alt = '';
    img.loading = 'lazy';
    mini.appendChild(img);
  } else {
    const ic = icone(item.tipo === 'artigo' ? 'documento' : 'check');
    if (ic) mini.appendChild(ic);
  }

  const corpo = criar('div', 'novidade__corpo');
  const linha = criar('div', 'novidade__linha');
  linha.append(
    criar('span', item.tipo === 'entregue' ? 'selo selo--acento' : 'selo', item.tipo === 'entregue' ? 'Entregue' : 'Artigo'),
    criar('span', 'novidade__fonte', item.fonte),
  );
  const meta = criar('div', 'novidade__meta');
  metaLeitura(meta, item);
  corpo.append(linha, criar('div', 'novidade__titulo', item.titulo), meta);

  const seta = icone('seta-externa', 'icone novidade__seta');
  card.append(mini, corpo);
  if (seta) card.appendChild(seta);
  return card;
}

/* -------------------------------------------------------------------------- */
/* Busca única do hero                                                        */
/* -------------------------------------------------------------------------- */

function montarBusca(itens, trilhas, artigos, urlEtapa) {
  const form = $('#busca');
  const campo = $('#busca-campo');
  const caixa = $('#busca-resultados');

  const indice = [
    ...itens.map((i) => ({ frente: 'Roadmaps', icone: 'fabrica', rotulo: i.title, meta: i.area, href: urlEtapa(i), norm: normalizar(`${i.title} ${i.project}`) })),
    ...trilhas.map((t) => ({ frente: 'Academia', icone: t.icone || 'livro', rotulo: t.nome, meta: t.disponivel === true ? 'disponível' : 'em breve', href: `academia.html#trilha=${encodeURIComponent(t.id)}`, norm: normalizar(`${t.nome} ${t.ferramenta ?? ''}`) })),
    ...artigos.map((a) => ({ frente: 'Notícias', icone: 'documento', rotulo: a.titulo, meta: a.categoria, href: `noticias.html#/${a.slug}`, norm: normalizar(a.titulo) })),
  ];
  const ORDEM = ['Roadmaps', 'Academia', 'Notícias'];
  const escopos = new Set(ORDEM);
  let opcoes = [];
  let selecionada = -1;

  const fechar = () => {
    caixa.hidden = true;
    campo.setAttribute('aria-expanded', 'false');
    campo.removeAttribute('aria-activedescendant');
    opcoes = [];
    selecionada = -1;
  };

  const marcar = () => {
    opcoes.forEach((op, i) => op.setAttribute('aria-selected', String(i === selecionada)));
    const atual = opcoes[selecionada];
    if (atual) {
      campo.setAttribute('aria-activedescendant', atual.id);
      atual.scrollIntoView({ block: 'nearest' });
    } else {
      campo.removeAttribute('aria-activedescendant');
    }
  };

  const render = () => {
    const consulta = campo.value.trim();
    const q = normalizar(consulta);
    caixa.textContent = '';
    opcoes = [];
    selecionada = -1;
    if (!q) { fechar(); return; }

    const achados = indice.filter((e) => escopos.has(e.frente) && e.norm.includes(q));
    if (!achados.length) {
      caixa.appendChild(criar('p', 'busca__vazio', `Nada encontrado para “${consulta}”.`));
    }
    let n = 0;
    for (const frente of ORDEM) {
      const doGrupo = achados.filter((e) => e.frente === frente).slice(0, 5);
      if (!doGrupo.length) continue;
      const grupo = criar('div', 'busca__grupo');
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-label', frente);
      grupo.appendChild(criar('div', 'busca__grupo-rotulo', frente));
      doGrupo.forEach((e) => {
        const op = criar('a', 'busca__item');
        op.id = `busca-op-${n++}`;
        op.href = e.href;
        op.setAttribute('role', 'option');
        op.setAttribute('aria-selected', 'false');
        const ic = criar('span', 'busca__item-icone');
        const marca = icone(e.icone);
        if (marca) ic.appendChild(marca);
        op.append(ic, criar('span', 'busca__item-texto', e.rotulo));
        if (e.meta) op.appendChild(criar('span', 'busca__item-meta', e.meta));
        grupo.appendChild(op);
        opcoes.push(op);
      });
      caixa.appendChild(grupo);
    }
    caixa.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
  };

  campo.addEventListener('input', debounce(render, 120));
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { fechar(); return; }
    if (caixa.hidden || !opcoes.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      selecionada = (selecionada + 1) % opcoes.length;
      marcar();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      selecionada = (selecionada - 1 + opcoes.length) % opcoes.length;
      marcar();
    }
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (caixa.hidden) render();
    const alvo = opcoes[selecionada] ?? opcoes[0];
    if (alvo) window.location.assign(alvo.href);
  });

  form.querySelectorAll('[data-escopo]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const ligado = botao.getAttribute('aria-pressed') === 'true';
      // Pelo menos uma frente fica ligada: busca em nada não ajuda ninguém.
      if (ligado && escopos.size === 1) return;
      botao.setAttribute('aria-pressed', String(!ligado));
      if (ligado) escopos.delete(botao.dataset.escopo);
      else escopos.add(botao.dataset.escopo);
      if (campo.value.trim()) render();
    });
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!form.contains(ev.target)) fechar();
  });

  // Ctrl+K / ⌘K leva direto à busca.
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      campo.focus();
      campo.select();
    }
  });
  if (/Mac|iPhone|iPad/.test(navigator.platform || '')) {
    const atalho = form.querySelector('.busca__atalho');
    if (atalho) atalho.textContent = '⌘ K';
  }
}
