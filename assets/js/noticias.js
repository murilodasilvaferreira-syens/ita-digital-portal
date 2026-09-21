/**
 * Portal de Notícias (noticias.html).
 *
 * Duas telas na mesma página: a listagem editorial e a leitura do artigo,
 * escolhidas pela hash — `#/<slug>` abre o artigo, qualquer outra coisa é a
 * lista (com `#categoria=ia` e `#q=texto` como filtros).
 *
 * O índice vem de content/noticias/index.json e o corpo de cada artigo de
 * content/noticias/<slug>.md. Publicar é criar o .md e acrescentar a entrada.
 *
 * O corpo do artigo é a única parte do site renderizada como HTML — e vem de
 * arquivo do repositório, nunca de dado externo. HTML bruto dentro do Markdown
 * fica desligado.
 */

import {
  criar, linkExterno, buscarJSON, normalizar, debounce,
  lerHash, escreverHash, ligarSpotlight, movimentoReduzido,
} from './ui.js';
import { icone } from '../icons/icones.js';

const $ = (sel) => document.querySelector(sel);

const PALAVRAS_POR_MINUTO = 200;
const TEAMS_BASE = 'https://teams.microsoft.com/l/chat/0/0';

let ARTIGOS = [];
const CACHE_CORPO = new Map();

/* -------------------------------------------------------------------------- */
/* Datas e leitura                                                            */
/* -------------------------------------------------------------------------- */

const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

function formatarData(iso) {
  if (!iso) return '';
  const data = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return '';
  return FMT_DATA.format(data);
}

/** Tempo de leitura a partir do texto, nunca de um campo digitado à mão. */
function tempoDeLeitura(markdown) {
  const palavras = String(markdown ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / PALAVRAS_POR_MINUTO));
}

function urlTeams(artigo) {
  const mensagem = [artigo.titulo, artigo.resumo].filter(Boolean).join('\n\n');
  return `${TEAMS_BASE}?message=${encodeURIComponent(mensagem)}`;
}

/* -------------------------------------------------------------------------- */
/* Markdown                                                                   */
/* -------------------------------------------------------------------------- */

/** marked com HTML bruto desligado: o Markdown vira texto, nunca marcação. */
function configurarMarkdown() {
  if (typeof window.marked?.parse !== 'function') return false;
  window.marked.use({ gfm: true, breaks: false, headerIds: false, mangle: false });
  return true;
}

/**
 * Protocolos aceitos dentro do corpo do artigo. O marked v12 não filtra
 * `javascript:` nem `data:` em links e imagens do Markdown, então um
 * `[texto](javascript:...)` num .md viraria um link executável. Relativo e
 * âncora resolvem para http(s) e passam.
 */
const PROTOCOLOS_SEGUROS = new Set(['http:', 'https:', 'mailto:']);

function protocoloSeguro(valor) {
  if (!valor) return false;
  try {
    return PROTOCOLOS_SEGUROS.has(new URL(valor, window.location.href).protocol);
  } catch {
    return false;
  }
}

function escaparHtmlBruto(markdown) {
  // Desliga HTML embutido antes de o marked ver o texto: tags viram literal.
  return String(markdown).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // devolve o `>` das citações no início da linha, que é sintaxe Markdown
    .replace(/^(\s*)&gt;/gm, '$1>');
}

async function carregarCorpo(slug) {
  if (CACHE_CORPO.has(slug)) return CACHE_CORPO.get(slug);
  const resposta = await fetch(`content/noticias/${slug}.md`, { cache: 'no-store' });
  if (!resposta.ok) throw new Error(`Arquivo do artigo não encontrado (HTTP ${resposta.status}).`);
  const texto = await resposta.text();
  CACHE_CORPO.set(slug, texto);
  return texto;
}

/* -------------------------------------------------------------------------- */
/* Listagem                                                                   */
/* -------------------------------------------------------------------------- */

function metaDoArtigo(artigo, { comResumo = false } = {}) {
  const meta = criar('div', 'meta');

  if (artigo.categoria) meta.appendChild(criar('span', 'meta__categoria', artigo.categoria));

  const data = formatarData(artigo.data);
  if (data) meta.appendChild(criar('span', 'meta__item', data));

  if (artigo.minutos) meta.appendChild(criar('span', 'meta__item', `${artigo.minutos} min de leitura`));
  if (comResumo && artigo.autor) meta.appendChild(criar('span', 'meta__item', artigo.autor));
  if (artigo.rascunho) meta.appendChild(criar('span', 'selo selo--contorno', 'rascunho'));

  return meta;
}

/** Artigo sem capa usa tratamento tipográfico, nunca um retângulo vazio. */
function capaDoArtigo(artigo, classe) {
  if (artigo.capa) {
    const figura = criar('div', `${classe} ${classe}--imagem`);
    const img = document.createElement('img');
    img.src = artigo.capa;
    img.alt = '';
    img.loading = 'lazy';
    figura.appendChild(img);
    return figura;
  }

  const marca = criar('div', `${classe} ${classe}--tipografica`);
  marca.setAttribute('aria-hidden', 'true');
  marca.appendChild(criar('span', 'capa__inicial', (artigo.categoria ?? artigo.titulo).slice(0, 1)));
  marca.appendChild(criar('span', 'capa__categoria', artigo.categoria ?? ''));
  return marca;
}

function cartaoDeArtigo(artigo, { tipo = 'feed', indice = 0 } = {}) {
  const card = criar('a', `${tipo} cartao-base cartao-base--ativo`);
  card.href = `#/${artigo.slug}`;
  card.style.setProperty('--indice', String(indice));

  if (tipo !== 'feed' || artigo.capa) card.appendChild(capaDoArtigo(artigo, `${tipo}__capa capa`));

  const corpo = criar('div', `${tipo}__corpo`);
  corpo.appendChild(metaDoArtigo(artigo));
  corpo.appendChild(criar('h2', `${tipo}__titulo`, artigo.titulo));
  if (artigo.resumo) corpo.appendChild(criar('p', `${tipo}__resumo`, artigo.resumo));
  card.appendChild(corpo);

  return card;
}

function filtrar(artigos, estado) {
  const busca = normalizar(estado.q ?? '');
  return artigos.filter((a) => {
    if (estado.categoria && normalizar(a.categoria) !== normalizar(estado.categoria)) return false;
    if (busca && !a.textoBusca.includes(busca)) return false;
    return true;
  });
}

function renderLista() {
  const estado = lerHash();
  const visiveis = filtrar(ARTIGOS, estado);

  for (const chip of document.querySelectorAll('#filtro-categoria .chip')) {
    const ativo = normalizar(estado.categoria ?? '') === normalizar(chip.dataset.valor);
    chip.classList.toggle('chip--ativo', ativo);
    chip.setAttribute('aria-pressed', String(ativo));
  }

  const busca = $('#busca');
  if (busca.value !== (estado.q ?? '')) busca.value = estado.q ?? '';

  const temFiltro = Boolean(estado.categoria || estado.q);
  $('#limpar').hidden = !temFiltro;
  $('#resumo').textContent = temFiltro
    ? `${visiveis.length} de ${ARTIGOS.length} publicações`
    : `${ARTIGOS.length} publicações`;

  // Manchete: o marcado como destaque ou, na falta, o mais recente.
  const manchete = visiveis.find((a) => a.destaque) ?? visiveis[0] ?? null;
  const restantes = visiveis.filter((a) => a !== manchete);
  const secundarios = restantes.slice(0, 2);
  const feed = restantes.slice(2);

  const alvoManchete = $('#manchete');
  alvoManchete.textContent = '';
  alvoManchete.hidden = !manchete;
  if (manchete) {
    const card = criar('a', 'manchete__link cartao-base cartao-base--ativo');
    card.href = `#/${manchete.slug}`;
    card.appendChild(capaDoArtigo(manchete, 'manchete__capa capa'));
    const corpo = criar('div', 'manchete__corpo');
    corpo.appendChild(metaDoArtigo(manchete, { comResumo: true }));
    corpo.appendChild(criar('h2', 'manchete__titulo', manchete.titulo));
    if (manchete.resumo) corpo.appendChild(criar('p', 'manchete__resumo', manchete.resumo));
    const chamada = criar('span', 'manchete__acao', 'Ler publicação');
    const seta = icone('seta');
    if (seta) chamada.appendChild(seta);
    corpo.appendChild(chamada);
    card.appendChild(corpo);
    alvoManchete.appendChild(card);
  }

  const alvoSecundarios = $('#secundarios');
  alvoSecundarios.textContent = '';
  alvoSecundarios.hidden = secundarios.length === 0;
  secundarios.forEach((a, i) => alvoSecundarios.appendChild(cartaoDeArtigo(a, { tipo: 'destaque', indice: i })));

  const alvoFeed = $('#feed');
  alvoFeed.textContent = '';
  feed.forEach((a, i) => alvoFeed.appendChild(cartaoDeArtigo(a, { tipo: 'feed', indice: i })));

  $('#vazio').hidden = visiveis.length > 0;
}

/* -------------------------------------------------------------------------- */
/* Artigo                                                                     */
/* -------------------------------------------------------------------------- */

async function renderArtigo(slug) {
  const artigo = ARTIGOS.find((a) => a.slug === slug);

  if (!artigo) {
    $('#nao-encontrado-texto').textContent =
      `Não existe publicação com o endereço "${slug}". Ela pode ter sido renomeada.`;
    mostrarTela('nao-encontrado');
    return;
  }

  let markdown;
  try {
    markdown = await carregarCorpo(slug);
  } catch (erro) {
    $('#nao-encontrado-texto').textContent = `Não foi possível abrir "${artigo.titulo}". ${erro.message}`;
    mostrarTela('nao-encontrado');
    return;
  }

  document.title = `${artigo.titulo} · Notícias · Digital Itatiba`;

  const cabecalho = $('#artigo-cabecalho');
  cabecalho.textContent = '';
  cabecalho.appendChild(metaDoArtigo({ ...artigo, minutos: tempoDeLeitura(markdown) }, { comResumo: true }));
  cabecalho.appendChild(criar('h1', 'artigo__titulo', artigo.titulo));
  if (artigo.resumo) cabecalho.appendChild(criar('p', 'artigo__resumo', artigo.resumo));
  if (artigo.capa) {
    const img = document.createElement('img');
    img.className = 'artigo__capa';
    img.src = artigo.capa;
    img.alt = '';
    cabecalho.appendChild(img);
  }

  // Única exceção à regra do textContent no site, e por isso a fonte é um
  // arquivo do próprio repositório, com HTML bruto desligado.
  const corpo = $('#artigo-corpo');
  corpo.innerHTML = window.marked.parse(escaparHtmlBruto(markdown));

  // Endereço com protocolo fora da lista (javascript:, data:) perde o atributo:
  // o texto continua lá, o clique deixa de executar qualquer coisa.
  for (const no of corpo.querySelectorAll('a[href], img[src], source[src]')) {
    const atributo = no.tagName === 'A' ? 'href' : 'src';
    if (!protocoloSeguro(no.getAttribute(atributo))) no.removeAttribute(atributo);
  }

  for (const link of corpo.querySelectorAll('a[href^="http"]')) {
    link.target = '_blank';
    link.rel = 'noopener';
  }

  const rodape = $('#artigo-rodape');
  rodape.textContent = '';

  const acoes = criar('div', 'artigo__acoes');
  if (artigo.link) {
    const externo = linkExterno(artigo.link, 'botao botao--secundario');
    externo.appendChild(criar('span', null, 'Abrir link relacionado'));
    const seta = icone('seta-externa');
    if (seta) externo.appendChild(seta);
    acoes.appendChild(externo);
  }
  const teams = linkExterno(urlTeams(artigo), 'botao botao--primario');
  const marcaTeams = icone('enviar');
  if (marcaTeams) teams.appendChild(marcaTeams);
  teams.appendChild(criar('span', null, 'Enviar no Teams'));
  acoes.appendChild(teams);
  rodape.appendChild(acoes);

  // Relacionados: até três da mesma categoria.
  const relacionados = ARTIGOS
    .filter((a) => a.slug !== artigo.slug && normalizar(a.categoria) === normalizar(artigo.categoria))
    .slice(0, 3);

  if (relacionados.length) {
    const bloco = criar('section', 'relacionados');
    bloco.appendChild(criar('h2', 'relacionados__titulo', 'Continue lendo'));
    const grade = criar('div', 'relacionados__grade');
    relacionados.forEach((a, i) => grade.appendChild(cartaoDeArtigo(a, { tipo: 'feed', indice: i })));
    bloco.appendChild(grade);
    rodape.appendChild(bloco);
    ligarSpotlight(grade, '.cartao-base');
  }

  const voltar = criar('a', 'artigo__voltar artigo__voltar--fim');
  voltar.href = '#';
  voltar.dataset.voltar = '';
  const setaVoltar = icone('seta-esquerda');
  if (setaVoltar) voltar.appendChild(setaVoltar);
  voltar.appendChild(criar('span', null, 'Voltar para notícias'));
  rodape.appendChild(voltar);

  mostrarTela('artigo');
  window.scrollTo({ top: 0, behavior: 'auto' });

  // Leva o foco ao título: sem isso quem navega por teclado continua no fim
  // da lista, numa tela que já não existe.
  const titulo = cabecalho.querySelector('.artigo__titulo');
  if (titulo) {
    titulo.setAttribute('tabindex', '-1');
    titulo.focus({ preventScroll: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Navegação entre telas                                                      */
/* -------------------------------------------------------------------------- */

function mostrarTela(qual) {
  $('#lista').hidden = qual !== 'lista';
  $('#artigo').hidden = qual !== 'artigo';
  $('#nao-encontrado').hidden = qual !== 'nao-encontrado';
  $('#progresso').hidden = qual !== 'artigo';

  if (qual !== 'artigo') document.title = 'Notícias · Digital Itatiba';
}

function rotear() {
  const estado = lerHash();
  if (estado.rota) {
    renderArtigo(estado.rota);
  } else {
    mostrarTela('lista');
    renderLista();
  }
}

/** Barra de progresso de leitura, presa ao scroll da janela. */
function ligarProgresso() {
  const barra = $('#progresso-barra');
  const atualizar = () => {
    if ($('#artigo').hidden) return;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const razao = total > 0 ? Math.min(1, window.scrollY / total) : 0;
    barra.style.transform = `scaleX(${razao})`;
  };
  window.addEventListener('scroll', atualizar, { passive: true });
  window.addEventListener('resize', atualizar);
  atualizar();
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

async function iniciar() {
  const aviso = $('#estado-carga');

  if (!configurarMarkdown()) {
    aviso.textContent = 'Não foi possível carregar o renderizador de texto (assets/vendor/marked.min.js).';
    return;
  }

  let indice;
  try {
    indice = await buscarJSON('content/noticias/index.json');
  } catch (erro) {
    aviso.textContent = `Não foi possível carregar as notícias. ${erro.message}`;
    console.error(erro);
    return;
  }

  ARTIGOS = (indice.artigos ?? [])
    .filter((a) => a.slug && a.titulo)
    .map((a) => ({
      ...a,
      textoBusca: normalizar([a.titulo, a.resumo, a.categoria, a.autor].filter(Boolean).join(' ')),
    }))
    .sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));

  // Tempo de leitura: precisa do corpo, então busca todos uma vez só.
  await Promise.all(ARTIGOS.map(async (artigo) => {
    try {
      artigo.minutos = tempoDeLeitura(await carregarCorpo(artigo.slug));
    } catch {
      artigo.minutos = null; // artigo sem .md ainda: o campo some da tela
    }
  }));

  const categorias = [...new Set(ARTIGOS.map((a) => a.categoria).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const alvoChips = $('#filtro-categoria');
  alvoChips.textContent = '';
  for (const { valor, rotulo } of [{ valor: '', rotulo: 'Tudo' }, ...categorias.map((c) => ({ valor: c, rotulo: c }))]) {
    const chip = criar('button', 'chip chip--acao', rotulo);
    chip.type = 'button';
    chip.dataset.valor = valor;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const estado = lerHash();
      const atual = estado.categoria ?? '';
      escreverHash({ q: estado.q, categoria: atual === valor ? '' : valor });
      renderLista();
    });
    alvoChips.appendChild(chip);
  }

  const aplicarBusca = debounce((valor) => {
    escreverHash({ categoria: lerHash().categoria, q: valor }, { substituir: true });
    renderLista();
  }, 250);
  $('#busca').addEventListener('input', (evento) => aplicarBusca(evento.target.value.trim()));

  for (const botao of document.querySelectorAll('#limpar, [data-limpar]')) {
    botao.addEventListener('click', () => {
      escreverHash({});
      $('#busca').value = '';
      renderLista();
    });
  }

  document.addEventListener('click', (evento) => {
    const voltar = evento.target.closest('[data-voltar]');
    if (!voltar) return;
    evento.preventDefault();
    escreverHash({});
    rotear();
    window.scrollTo({ top: 0, behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  });

  const setaTopo = icone('seta-esquerda');
  if (setaTopo) $('#voltar-topo').prepend(setaTopo);

  window.addEventListener('hashchange', rotear);
  window.addEventListener('popstate', rotear);
  ligarProgresso();

  aviso.hidden = true;
  rotear();
  ligarSpotlight($('#feed'), '.cartao-base');
  ligarSpotlight($('#secundarios'), '.cartao-base');
  ligarSpotlight($('#manchete'), '.cartao-base');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
