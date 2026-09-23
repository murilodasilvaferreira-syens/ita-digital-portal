/**
 * Landing (home.html) — a porta de entrada do portal.
 *
 * Cruza as três frentes já existentes lendo os mesmos arquivos que o resto do
 * site: as iniciativas do Power Automate, as trilhas da Academia e o índice de
 * notícias. Nenhum número é digitado aqui; tudo é derivado dos dados reais.
 *
 * Cada fonte é carregada de forma independente: se uma falhar, a sua seção
 * some sem derrubar as outras. Todo texto entra por textContent (via `criar`),
 * nunca por innerHTML.
 */

import {
  criar, linkExterno, normalizar, debounce,
  animarContagem, ligarSpotlight, ligarRolagemSuave, movimentoReduzido, plural,
} from './ui.js';
import { criarDataset, FASE, formatarData } from './data.js';
import { icone } from '../icons/icones.js';

/* -------------------------------------------------------------------------- */
/* Carga                                                                       */
/* -------------------------------------------------------------------------- */

/** Lê um JSON local sem cache. Devolve null (com aviso) em vez de estourar. */
async function carregar(url) {
  try {
    const resposta = await fetch(url, { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await resposta.json();
  } catch (erro) {
    console.warn(`[home] Não foi possível ler ${url}: ${erro.message}`);
    return null;
  }
}

const $ = (sel) => document.querySelector(sel);

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

const AGORA = new Date();
const ANO_MES = `${AGORA.getFullYear()}-${String(AGORA.getMonth() + 1).padStart(2, '0')}`;
const HA_SETE_DIAS = new Date(AGORA.getTime() - 7 * 86400000);

/** Timestamp comparável de um item do feed (artigo por data, entrega por updatedAt). */
function quando(item) {
  const iso = item.tipo === 'artigo' ? `${item.data}T12:00:00` : item.updatedAt;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/* -------------------------------------------------------------------------- */
/* Início                                                                      */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  const [site, dadosInic, dadosTrilhas, indiceNoticias] = await Promise.all([
    carregar('config/site.json'),
    carregar('data/initiatives.json'),
    carregar('data/academia/trilhas.json'),
    carregar('content/noticias/index.json'),
  ]);

  // Iniciativas: mesma camada de derivação do resto do site (status -> fase).
  let itens = [];
  if (dadosInic && Array.isArray(dadosInic.initiatives)) {
    try {
      itens = criarDataset(dadosInic.initiatives, { staleDays: site?.staleDays ?? 30 }).itens;
    } catch (erro) {
      console.warn(`[home] Falha ao derivar iniciativas: ${erro.message}`);
    }
  }

  const trilhas = Array.isArray(dadosTrilhas?.trilhas) ? dadosTrilhas.trilhas : [];
  const artigos = (Array.isArray(indiceNoticias?.artigos) ? indiceNoticias.artigos : [])
    .filter((a) => a && a.slug && a.titulo)
    .slice()
    .sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));

  configurarLinks(site);
  montarDestinos(itens, trilhas, artigos);
  montarAcademia(trilhas);
  montarNovo(itens, artigos);
  montarNumeros(itens, trilhas, artigos);
  montarBusca(itens, trilhas, artigos);

  // Revela a página e liga os gestos compartilhados.
  $('#estado-carga').hidden = true;
  $('#pagina').hidden = false;
  ligarRolagemSuave(document);
  ligarSpotlight($('#pagina'), '.destino, .trilha-card, .novo-item');
}

/* -------------------------------------------------------------------------- */
/* Links de ação (Teams e nova iniciativa)                                     */
/* -------------------------------------------------------------------------- */

function urlTeams(site, mensagem) {
  const email = site?.teams?.email ?? '';
  const texto = mensagem ?? site?.teams?.message ?? '';
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}&message=${encodeURIComponent(texto)}`;
}

function configurarLinks(site) {
  const linkTeams = urlTeams(site, (site?.teams?.message ?? '').trim());
  const linkNova = site?.newInitiative?.url ?? '#';

  ['#nav-teams', '#hero-teams', '#fechamento-teams', '#rodape-teams'].forEach((sel) => {
    const el = $(sel);
    if (el) el.href = linkTeams;
  });
  ['#fechamento-nova', '#rodape-nova'].forEach((sel) => {
    const el = $(sel);
    if (el) el.href = linkNova;
  });
}

/* -------------------------------------------------------------------------- */
/* Três destinos                                                               */
/* -------------------------------------------------------------------------- */

function montarDestinos(itens, trilhas, artigos) {
  const grade = $('#destinos-grade');
  if (!grade) return;

  const entregasMes = itens.filter(
    (i) => i.status === 'Implantada' && i.updatedAt && i.updatedAt.slice(0, 7) === ANO_MES,
  ).length;
  const disponiveis = trilhas.filter((t) => t.disponivel === true).length;
  const artigoRecente = artigos[0]?.titulo ?? null;

  const destinos = [
    {
      num: '01', icon: 'fabrica', nome: 'Roadmaps', href: 'hub.html',
      proposito: 'Acompanhe o que está em execução em cada área da planta.',
      vivo: entregasMes > 0
        ? `${entregasMes} ${plural(entregasMes, 'entrega', 'entregas')} neste mês`
        : 'Roadmaps de todas as áreas',
    },
    {
      num: '02', icon: 'livro', nome: 'Academia Digital', href: 'academia.html',
      proposito: 'Capacite-se nas ferramentas digitais e de IA.',
      vivo: disponiveis > 0
        ? `${disponiveis} ${plural(disponiveis, 'trilha disponível', 'trilhas disponíveis')}`
        : 'Trilhas em preparação',
    },
    {
      num: '03', icon: 'documento', nome: 'Notícias', href: 'noticias.html',
      proposito: 'Novidades do mundo digital e da inteligência artificial.',
      vivo: artigoRecente ?? 'Novidades em breve',
    },
  ];

  grade.textContent = '';
  for (const d of destinos) {
    const card = criar('a', 'destino');
    card.href = d.href;

    const topo = criar('div', 'destino__topo');
    const marca = criar('div', 'destino__marca');
    const ic = icone(d.icon);
    if (ic) marca.appendChild(ic);
    topo.appendChild(marca);
    topo.appendChild(criar('span', 'destino__num', d.num));
    card.appendChild(topo);

    card.appendChild(criar('h3', 'destino__nome', d.nome));
    card.appendChild(criar('p', 'destino__proposito', d.proposito));

    const rodape = criar('div', 'destino__rodape');
    const vivo = criar('span', 'destino__vivo');
    vivo.appendChild(criar('span', 'destino__vivo-ponto'));
    vivo.appendChild(criar('span', 'destino__vivo-texto', d.vivo));
    rodape.appendChild(vivo);
    const seta = criar('span', 'destino__seta');
    seta.appendChild(criar('span', 'destino__seta-icone'));
    rodape.appendChild(seta);
    card.appendChild(rodape);

    grade.appendChild(card);
  }
}

/* -------------------------------------------------------------------------- */
/* Academia — grid de trilhas                                                  */
/* -------------------------------------------------------------------------- */

function montarAcademia(trilhas) {
  const secao = $('#academia');
  const grade = $('#trilhas-grade');
  if (!secao || !grade) return;
  if (!trilhas.length) { secao.hidden = true; return; }

  // Disponíveis primeiro; dentro de cada grupo, a ordem do arquivo.
  const ordenadas = trilhas
    .slice()
    .sort((a, b) => Number(b.disponivel === true) - Number(a.disponivel === true));

  grade.textContent = '';
  for (const t of ordenadas) {
    const disponivel = t.disponivel === true;
    const card = criar(disponivel && t.link ? 'a' : 'div', `trilha-card${disponivel ? '' : ' trilha-card--breve'}`);
    if (disponivel && t.link) {
      card.href = t.link;
      card.target = '_blank';
      card.rel = 'noopener';
    }

    const topo = criar('div', 'trilha-card__topo');
    const marca = criar('div', 'trilha-card__marca');
    const ic = icone(t.icone ?? 'livro');
    if (ic) marca.appendChild(ic);
    topo.appendChild(marca);
    topo.appendChild(criar(
      'span',
      `trilha-card__pilula trilha-card__pilula--${disponivel ? 'disponivel' : 'breve'}`,
      disponivel ? 'Disponível' : 'Em breve',
    ));
    card.appendChild(topo);

    if (t.nivel) card.appendChild(criar('div', 'trilha-card__cat', t.nivel));
    card.appendChild(criar('h3', 'trilha-card__titulo', t.nome ?? 'Trilha'));
    card.appendChild(criar('div', 'trilha-card__espaco'));

    const rodape = criar('div', 'trilha-card__rodape');
    const partes = [];
    if (t.duracaoHoras) partes.push(`${t.duracaoHoras}h`);
    if (t.aulas) partes.push(`${t.aulas} ${plural(t.aulas, 'aula', 'aulas')}`);
    rodape.appendChild(criar('span', 'trilha-card__meta', partes.join(' · ')));
    const act = criar('span', 'trilha-card__act');
    const marcaAct = icone(disponivel ? 'seta' : 'relogio');
    if (marcaAct) act.appendChild(marcaAct);
    rodape.appendChild(act);
    card.appendChild(rodape);

    grade.appendChild(card);
  }
  secao.hidden = false;
}

/* -------------------------------------------------------------------------- */
/* O que há de novo — feed misto                                               */
/* -------------------------------------------------------------------------- */

function montarNovo(itens, artigos) {
  const secao = $('#novo');
  const grade = $('#novo-grade');
  if (!secao || !grade) return;

  const doArtigo = (a) => ({
    tipo: 'artigo', data: a.data, titulo: a.titulo, categoria: a.categoria,
    href: `noticias.html#/${a.slug}`,
  });
  const entregas = itens
    .filter((i) => i.status === 'Implantada' && i.updatedAt && new Date(i.updatedAt) >= HA_SETE_DIAS)
    .map((i) => ({
      tipo: 'entregue', updatedAt: i.updatedAt, titulo: i.title, area: i.area,
      href: `index.html#i=${i.id}`,
    }));

  const feedArtigos = artigos.map(doArtigo);
  // O item mais recente (artigo de preferência) vira o destaque grande.
  let destaque = feedArtigos[0] ?? null;
  let resto = feedArtigos.slice(1).concat(entregas);
  if (!destaque && entregas.length) {
    resto = entregas.slice(1);
    destaque = entregas[0];
  }
  resto.sort((a, b) => quando(b) - quando(a));
  resto = resto.slice(0, 3); // destaque + até 3 = no máximo 4 itens

  if (!destaque && !resto.length) { secao.hidden = true; return; }

  grade.textContent = '';
  if (destaque) grade.appendChild(criarDestaque(destaque));
  if (resto.length) {
    const pilha = criar('div', 'novo__pilha');
    for (const item of resto) pilha.appendChild(criarItemNovo(item));
    grade.appendChild(pilha);
  }
  secao.hidden = false;
}

function criarDestaque(item) {
  const ehArtigo = item.tipo === 'artigo';
  const card = criar('a', 'novo-destaque');
  card.href = item.href;

  const tags = criar('div', 'novo-destaque__tags');
  tags.appendChild(criar('span', 'novo-destaque__tag novo-destaque__tag--acento', 'Destaque'));
  tags.appendChild(criar(
    'span', 'novo-destaque__tag novo-destaque__tag--clara',
    ehArtigo ? 'Artigo' : 'Entregue',
  ));
  card.appendChild(tags);

  const base = criar('div', 'novo-destaque__base');
  base.appendChild(criar('h3', 'novo-destaque__titulo', item.titulo));
  const meta = criar('div', 'novo-destaque__meta');
  const dataTxt = ehArtigo ? formatarData(item.data) : formatarData(item.updatedAt.slice(0, 10));
  if (dataTxt) meta.appendChild(criar('span', null, dataTxt));
  const detalhe = ehArtigo ? item.categoria : item.area;
  if (detalhe) {
    meta.appendChild(criar('span', 'novo-destaque__meta-sep'));
    meta.appendChild(criar('span', null, detalhe));
  }
  base.appendChild(meta);
  card.appendChild(base);
  return card;
}

function criarItemNovo(item) {
  const ehArtigo = item.tipo === 'artigo';
  const card = criar('a', 'novo-item');
  card.href = item.href;

  const marca = criar('div', 'novo-item__marca');
  const ic = icone(ehArtigo ? 'documento' : 'check');
  if (ic) marca.appendChild(ic);
  card.appendChild(marca);

  const corpo = criar('div', 'novo-item__corpo');
  const linha = criar('div', 'novo-item__linha');
  linha.appendChild(criar(
    'span', `novo-item__tag novo-item__tag--${ehArtigo ? 'artigo' : 'entregue'}`,
    ehArtigo ? 'Artigo' : 'Entregue',
  ));
  const rotuloMeta = ehArtigo
    ? ['Notícias', item.categoria].filter(Boolean).join(' · ')
    : ['Roadmap', item.area].filter(Boolean).join(' · ');
  linha.appendChild(criar('span', 'novo-item__meta', rotuloMeta));
  corpo.appendChild(linha);
  corpo.appendChild(criar('div', 'novo-item__titulo', item.titulo));
  card.appendChild(corpo);

  card.appendChild(criar('span', 'novo-item__seta'));
  return card;
}

/* -------------------------------------------------------------------------- */
/* Números do site                                                             */
/* -------------------------------------------------------------------------- */

function montarNumeros(itens, trilhas, artigos) {
  const grade = $('#numeros-grade');
  if (!grade) return;

  const emExecucao = itens.filter((i) => i.fase === FASE.EXECUCAO).length;
  const trilhasDisp = trilhas.filter((t) => t.disponivel === true).length;
  const totalArtigos = artigos.length;
  const areas = new Set(itens.map((i) => i.area).filter(Boolean)).size;

  const numeros = [
    { valor: emExecucao, rotulo: 'iniciativas em execução' },
    { valor: trilhasDisp, rotulo: 'trilhas na academia' },
    { valor: totalArtigos, rotulo: 'artigos publicados' },
    { valor: areas, rotulo: 'áreas conectadas' },
  ];

  grade.textContent = '';
  for (const n of numeros) {
    const bloco = criar('div', 'numero');
    const valor = criar('div', 'numero__valor');
    bloco.appendChild(valor);
    bloco.appendChild(criar('div', 'numero__rotulo', n.rotulo));
    grade.appendChild(bloco);
    animarContagem(valor, n.valor);
  }

  // Selo flutuante do hero: áreas realmente conectadas nos dados.
  if (areas > 0) {
    const flutuante = $('#hero-flutuante');
    const valor = $('#hero-flutuante-valor');
    if (flutuante && valor) {
      valor.textContent = `${areas} áreas conectadas`;
      flutuante.hidden = false;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Busca única do hero                                                         */
/* -------------------------------------------------------------------------- */

function montarBusca(itens, trilhas, artigos) {
  const form = $('#busca-form');
  const input = $('#busca-input');
  const caixa = $('#busca-resultados');
  if (!form || !input || !caixa) return;

  // Índice em memória das três frentes.
  const indice = [
    ...itens.map((i) => ({
      frente: 'Roadmaps', icon: 'fabrica', rotulo: i.title,
      href: `index.html#i=${i.id}`, norm: normalizar(i.title),
    })),
    ...trilhas.map((t) => ({
      frente: 'Academia', icon: t.icone ?? 'livro', rotulo: t.nome,
      href: 'academia.html', norm: normalizar(t.nome),
    })),
    ...artigos.map((a) => ({
      frente: 'Notícias', icon: 'documento', rotulo: a.titulo,
      href: `noticias.html#/${a.slug}`, norm: normalizar(a.titulo),
    })),
  ].filter((e) => e.rotulo);

  const ORDEM = ['Roadmaps', 'Academia', 'Notícias'];
  let selecionavel = []; // itens <a> na ordem visual, para o teclado
  let indiceSel = -1;

  function fechar() {
    caixa.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    selecionavel = [];
    indiceSel = -1;
  }

  function marcarSelecao() {
    selecionavel.forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === indiceSel));
      if (i === indiceSel) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function render(consulta) {
    const q = normalizar(consulta);
    caixa.textContent = '';
    selecionavel = [];
    indiceSel = -1;

    if (!q) { fechar(); return; }

    const achados = indice.filter((e) => e.norm.includes(q));
    if (!achados.length) {
      caixa.appendChild(criar('p', 'busca__vazio', `Nada encontrado para “${consulta.trim()}”.`));
      caixa.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    for (const frente of ORDEM) {
      const doGrupo = achados.filter((e) => e.frente === frente).slice(0, 4);
      if (!doGrupo.length) continue;
      const grupo = criar('div', 'busca__grupo');
      grupo.appendChild(criar('div', 'busca__grupo-rotulo', frente));
      for (const e of doGrupo) {
        const item = criar('a', 'busca__item');
        item.href = e.href;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        const ic = criar('span', 'busca__item-icone');
        const marca = icone(e.icon);
        if (marca) ic.appendChild(marca);
        item.appendChild(ic);
        const texto = criar('div', 'busca__item-texto');
        texto.appendChild(criar('span', null, e.rotulo));
        item.appendChild(texto);
        grupo.appendChild(item);
        selecionavel.push(item);
      }
      caixa.appendChild(grupo);
    }

    caixa.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', debounce(() => render(input.value), 120));

  input.addEventListener('keydown', (ev) => {
    if (caixa.hidden || !selecionavel.length) {
      if (ev.key === 'Escape') input.blur();
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      indiceSel = (indiceSel + 1) % selecionavel.length;
      marcarSelecao();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      indiceSel = (indiceSel - 1 + selecionavel.length) % selecionavel.length;
      marcarSelecao();
    } else if (ev.key === 'Enter') {
      const alvo = selecionavel[indiceSel] ?? selecionavel[0];
      if (alvo) { ev.preventDefault(); window.location.assign(alvo.href); }
    } else if (ev.key === 'Escape') {
      fechar();
    }
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const alvo = selecionavel[indiceSel] ?? selecionavel[0];
    if (alvo) window.location.assign(alvo.href);
  });

  // Fecha ao clicar fora ou perder o foco do conjunto.
  document.addEventListener('pointerdown', (ev) => {
    if (!form.contains(ev.target)) fechar();
  });
}
