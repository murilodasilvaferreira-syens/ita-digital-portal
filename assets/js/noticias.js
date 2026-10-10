/**
 * Notícias (noticias.html).
 *
 * Duas telas na mesma página, escolhidas pela hash: `#/<slug>` abre a
 * leitura do artigo, qualquer outra coisa é a listagem (com `#categoria=…`
 * e `#q=…` como filtros). A leitura é página inteira e cresce com o texto —
 * dentro do iframe do SharePoint quem rola é o iframe, nunca um painel.
 *
 * O índice vem de content/noticias/index.json e o corpo de cada artigo de
 * content/noticias/<slug>.md. Publicar é criar o .md e acrescentar a entrada.
 *
 * O corpo do artigo é a única parte do site renderizada como HTML — e vem de
 * arquivo do repositório, nunca de dado externo. HTML bruto dentro do
 * Markdown fica desligado e links com protocolo fora da lista perdem o href.
 */

import { criar, linkExterno, normalizar, debounce, lerHash, escreverHash, movimentoReduzido } from './ui.js';
import { carregarArtigos, carregarCorpo, minutosDeLeitura, minutosDoArtigo, escolherManchete, dataCurta, diasDesde } from './conteudo.js';
import { montarCasca, revelar, urlTeams } from './shell.js';

const $ = (sel) => document.querySelector(sel);
const TITULO_PAGINA = 'Notícias · Digital Itatiba';
const DIAS_NOVO = 14;

let ARTIGOS = [];

/* -------------------------------------------------------------------------- */
/* Markdown seguro                                                            */
/* -------------------------------------------------------------------------- */

function configurarMarkdown() {
  if (typeof window.marked?.parse !== 'function') return false;
  window.marked.use({ gfm: true, breaks: false });
  return true;
}

/**
 * Protocolos aceitos dentro do corpo do artigo. O marked não filtra
 * `javascript:` nem `data:` em links e imagens do Markdown; relativo e âncora
 * resolvem para http(s) e passam.
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

/** Desliga HTML embutido antes de o marked ver o texto: tags viram literal. */
function escaparHtmlBruto(markdown) {
  return String(markdown).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // devolve o `>` das citações no início da linha, que é sintaxe Markdown
    .replace(/^(\s*)&gt;/gm, '$1>');
}

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

const urlDoArtigo = (a) => `#/${encodeURIComponent(a.slug)}`;
const ehNovo = (a) => { const d = diasDesde(a.data); return d !== null && d >= 0 && d <= DIAS_NOVO; };

function linhaMeta(a) {
  return [dataCurta(a.data), a.minutos ? `${a.minutos} min` : null].filter(Boolean).join(' · ');
}

/** Mídia do cartão: a capa quando existe; senão, a inicial em tipografia. */
function midia(a, classe) {
  const caixa = criar('div', `nt-midia ${classe}`);
  if (a.capa && protocoloSeguro(a.capa)) {
    const img = document.createElement('img');
    img.src = a.capa;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    caixa.appendChild(img);
    caixa.classList.add('nt-midia--imagem');
  } else {
    const inicial = criar('span', 'nt-midia__inicial', (a.titulo || '·').trim().charAt(0));
    inicial.setAttribute('aria-hidden', 'true');
    caixa.appendChild(inicial);
  }
  caixa.append(criar('span', 'nt-midia__desfoque'), criar('span', 'nt-midia__veu'));
  return caixa;
}

function selos(a) {
  const lista = [];
  if (a.rascunho === true) lista.push(criar('span', 'nt-selo nt-selo--rascunho', 'Rascunho'));
  else if (ehNovo(a)) lista.push(criar('span', 'nt-selo nt-selo--novo', 'Novo'));
  return lista;
}

function cartaoManchete(a) {
  const link = criar('a', 'vidro nt-manchete');
  link.href = urlDoArtigo(a);
  const m = midia(a, 'nt-manchete__midia');
  const sobre = criar('div', 'nt-manchete__sobre');
  const linha = criar('div', 'nt-manchete__meta');
  if (a.categoria) linha.appendChild(criar('span', 'nt-selo nt-selo--cheio', a.categoria));
  linha.appendChild(criar('span', null, linhaMeta(a)));
  linha.append(...selos(a));
  sobre.append(linha, criar('h2', 'nt-manchete__titulo', a.titulo));
  m.appendChild(sobre);
  const lado = criar('div', 'nt-manchete__lado');
  lado.appendChild(criar('span', 'nt-manchete__rotulo', a.destaque === true ? 'Em destaque' : 'Mais recente'));
  if (a.resumo) lado.appendChild(criar('p', 'nt-manchete__resumo', a.resumo));
  if (a.autor) lado.appendChild(criar('p', 'nt-manchete__autor', `Por ${a.autor}`));
  const acao = criar('span', 'nt-manchete__acao', 'Ler artigo completo ');
  acao.appendChild(criar('span', null, '→'));
  lado.appendChild(acao);
  link.append(m, lado);
  return link;
}

function cartaoSecundario(a) {
  const link = criar('a', 'vidro nt-secundaria');
  link.href = urlDoArtigo(a);
  const m = midia(a, 'nt-secundaria__midia');
  if (a.categoria) m.appendChild(criar('span', 'nt-selo nt-selo--claro nt-secundaria__categoria', a.categoria));
  const marcas = selos(a);
  if (marcas.length) {
    const canto = criar('span', 'nt-secundaria__canto');
    canto.append(...marcas);
    m.appendChild(canto);
  }
  const corpo = criar('div', 'nt-secundaria__corpo');
  corpo.appendChild(criar('h3', 'nt-secundaria__titulo', a.titulo));
  if (a.resumo) corpo.appendChild(criar('p', 'nt-secundaria__resumo', a.resumo));
  corpo.appendChild(criar('span', 'nt-meta', linhaMeta(a)));
  link.append(m, corpo);
  return link;
}

function cartaoFeed(a, i) {
  const link = criar('a', 'nt-item');
  link.href = urlDoArtigo(a);
  const lado = criar('div', 'nt-item__lado');
  lado.append(criar('span', 'nt-item__n', String(i + 1).padStart(2, '0')));
  const glifo = criar('span', 'nt-item__glifo', (a.titulo || '·').trim().charAt(0));
  glifo.setAttribute('aria-hidden', 'true');
  lado.appendChild(glifo);
  const corpo = criar('div', 'nt-item__corpo');
  const topo = criar('span', 'nt-item__categoria', a.categoria || 'Notícia');
  topo.append(...selos(a));
  corpo.append(topo, criar('h3', 'nt-item__titulo', a.titulo), criar('span', 'nt-meta', linhaMeta(a)));
  link.append(lado, corpo);
  return link;
}

/* -------------------------------------------------------------------------- */
/* Listagem                                                                   */
/* -------------------------------------------------------------------------- */

function filtrar(estado) {
  const busca = normalizar(estado.q ?? '');
  return ARTIGOS.filter((a) => {
    if (estado.categoria && normalizar(a.categoria) !== normalizar(estado.categoria)) return false;
    if (busca && !a.textoBusca.includes(busca)) return false;
    return true;
  });
}

function renderLista() {
  const estado = lerHash();
  const filtrando = Boolean(estado.categoria || estado.q);
  const visiveis = filtrar(estado);

  document.querySelectorAll('#categorias .chip').forEach((c) => {
    c.setAttribute('aria-pressed', String(normalizar(c.dataset.valor) === normalizar(estado.categoria ?? '')));
  });
  const busca = $('#busca');
  if (document.activeElement !== busca && busca.value !== (estado.q ?? '')) busca.value = estado.q ?? '';

  // Sem filtro: manchete + até três secundárias + o resto. Com filtro, a
  // manchete sai e os resultados ocupam as secundárias e a lista.
  const manchete = filtrando ? null : escolherManchete(ARTIGOS);
  const resto = visiveis.filter((a) => a !== manchete);
  const secundarias = resto.slice(0, 3);
  const feed = resto.slice(3);

  const alvoManchete = $('#manchete');
  alvoManchete.textContent = '';
  if (manchete) alvoManchete.appendChild(cartaoManchete(manchete));
  alvoManchete.hidden = !manchete;

  const alvoSec = $('#secundarias');
  alvoSec.textContent = '';
  secundarias.forEach((a) => alvoSec.appendChild(cartaoSecundario(a)));
  alvoSec.hidden = !secundarias.length;
  alvoSec.dataset.n = String(secundarias.length);

  const alvoFeed = $('#feed');
  alvoFeed.textContent = '';
  feed.forEach((a, i) => alvoFeed.appendChild(cartaoFeed(a, i)));
  $('#feed-secao').hidden = !feed.length;
  $('#feed-resumo').textContent = `${visiveis.length} ${visiveis.length === 1 ? 'artigo' : 'artigos'}`;

  $('#vazio').hidden = visiveis.length > 0;
  revelar();
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

function naoEncontrado(texto) {
  $('#nao-encontrado-texto').textContent = texto;
  mostrarTela('nao-encontrado');
}

async function renderArtigo(slug) {
  const artigo = ARTIGOS.find((a) => a.slug === slug);
  if (!artigo) {
    naoEncontrado(`Não existe publicação com o endereço “${slug}”. Ela pode ter sido renomeada ou removida.`);
    return;
  }
  let markdown;
  try {
    markdown = await carregarCorpo(slug);
  } catch (erro) {
    naoEncontrado(`Não foi possível abrir “${artigo.titulo}” (${erro.message}).`);
    return;
  }
  // Outra navegação aconteceu enquanto o corpo carregava.
  if (lerHash().rota !== slug) return;

  document.title = `${artigo.titulo} · ${TITULO_PAGINA}`;

  const cab = $('#artigo-cabecalho');
  cab.textContent = '';
  const meta = criar('div', 'nt-leitura__meta');
  if (artigo.categoria) meta.appendChild(criar('span', 'nt-selo nt-selo--cheio', artigo.categoria));
  meta.appendChild(criar('span', null, [dataCurta(artigo.data), `${minutosDeLeitura(markdown)} min de leitura`].filter(Boolean).join(' · ')));
  meta.append(...selos(artigo));
  const titulo = criar('h1', 'display nt-leitura__titulo', artigo.titulo);
  titulo.tabIndex = -1;
  cab.append(meta, titulo);
  if (artigo.resumo) cab.appendChild(criar('p', 'nt-leitura__resumo', artigo.resumo));
  if (artigo.capa && protocoloSeguro(artigo.capa)) {
    const img = document.createElement('img');
    img.className = 'nt-leitura__capa';
    img.src = artigo.capa;
    img.alt = '';
    cab.appendChild(img);
  }

  // Única exceção à regra do textContent no site, e por isso a fonte é um
  // arquivo do próprio repositório, com HTML bruto desligado.
  const corpo = $('#artigo-corpo');
  corpo.innerHTML = window.marked.parse(escaparHtmlBruto(markdown));
  corpo.querySelectorAll('a[href], img[src], source[src]').forEach((no) => {
    const atributo = no.tagName === 'A' ? 'href' : 'src';
    if (!protocoloSeguro(no.getAttribute(atributo))) no.removeAttribute(atributo);
  });
  corpo.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  corpo.querySelectorAll('img').forEach((img) => { img.loading = 'lazy'; if (!img.hasAttribute('alt')) img.alt = ''; });

  const rodape = $('#artigo-rodape');
  rodape.textContent = '';
  rodape.appendChild(criar('span', 'nt-leitura__autor', artigo.autor ? `Publicado por ${artigo.autor}` : 'Transformação Digital Itatiba'));
  const acoes = criar('div', 'nt-leitura__acoes');
  if (protocoloSeguro(artigo.link) && /^https?:/i.test(artigo.link)) {
    const externo = linkExterno(artigo.link, 'botao botao--contorno');
    externo.append('Abrir link relacionado ', criar('span', null, '↗'));
    acoes.appendChild(externo);
  }
  // Compartilhar: abre o Teams com título e resumo prontos, sem destinatário.
  const mensagem = [artigo.titulo, artigo.resumo].filter(Boolean).join('\n\n');
  const teams = linkExterno(`https://teams.microsoft.com/l/chat/0/0?message=${encodeURIComponent(mensagem)}`, 'botao botao--primario');
  teams.append('Enviar no Teams ', criar('span', null, '↗'));
  acoes.appendChild(teams);
  rodape.appendChild(acoes);

  // Continue lendo: mesma categoria primeiro, completando com os mais recentes.
  const outros = ARTIGOS.filter((a) => a.slug !== artigo.slug);
  const relacionados = [
    ...outros.filter((a) => normalizar(a.categoria) === normalizar(artigo.categoria)),
    ...outros.filter((a) => normalizar(a.categoria) !== normalizar(artigo.categoria)),
  ].slice(0, 3);
  const lista = $('#relacionados-lista');
  lista.textContent = '';
  relacionados.forEach((a, i) => lista.appendChild(cartaoFeed(a, i)));
  $('#relacionados').hidden = !relacionados.length;

  mostrarTela('artigo');
  window.scrollTo({ top: 0, behavior: 'auto' });
  // Quem navega por teclado chega ao título, não ao fim de uma lista que sumiu.
  titulo.focus({ preventScroll: true });
}

/* -------------------------------------------------------------------------- */
/* Telas                                                                      */
/* -------------------------------------------------------------------------- */

function mostrarTela(qual) {
  $('#lista').hidden = qual !== 'lista';
  $('#artigo').hidden = qual !== 'artigo';
  $('#nao-encontrado').hidden = qual !== 'nao-encontrado';
  if (qual !== 'artigo') document.title = TITULO_PAGINA;
}

let ultimaTela = null;

function rotear() {
  const estado = lerHash();
  if (estado.rota) {
    ultimaTela = 'artigo';
    renderArtigo(decodeURIComponent(estado.rota));
    return;
  }
  const vindoDoArtigo = ultimaTela === 'artigo';
  ultimaTela = 'lista';
  mostrarTela('lista');
  renderLista();
  if (vindoDoArtigo) window.scrollTo({ top: 0, behavior: 'auto' });
}

function montarCategorias() {
  const categorias = [...new Set(ARTIGOS.map((a) => a.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const alvo = $('#categorias');
  alvo.textContent = '';
  [['', 'Todas'], ...categorias.map((c) => [c, c])].forEach(([valor, rotulo]) => {
    const chip = criar('button', 'chip', rotulo);
    chip.type = 'button';
    chip.dataset.valor = valor;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const atual = lerHash();
      escreverHash({ q: atual.q, categoria: valor && atual.categoria !== valor ? valor : '' }, { substituir: true });
      renderLista();
    });
    alvo.appendChild(chip);
  });
}

/* -------------------------------------------------------------------------- */
/* Início                                                                     */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  const falhar = (texto) => {
    $('#estado-carga').hidden = true;
    $('#erro-texto').textContent = texto;
    $('#erro').hidden = false;
  };
  const casca = montarCasca({ ativa: 'noticias', marca: 'Notícias · Transformação Digital Itatiba' });
  if (!configurarMarkdown()) {
    await casca;
    falhar('O leitor de texto (assets/vendor/marked.min.js) não carregou. Tente recarregar a página.');
    return;
  }
  let site;
  try {
    [site, ARTIGOS] = await Promise.all([casca, carregarArtigos()]);
  } catch (erro) {
    falhar(`O índice de notícias não pôde ser lido. ${erro.message}`);
    return;
  }
  // Tempo de leitura vem do texto: os corpos são poucos e já ficam em cache
  // para a leitura.
  await Promise.all(ARTIGOS.map(async (a) => { a.minutos = await minutosDoArtigo(a.slug); }));

  $('#total').textContent = String(ARTIGOS.length);
  $('#total-rotulo').textContent = ARTIGOS.length === 1 ? 'artigo publicado' : 'artigos publicados';
  montarCategorias();

  const convite = $('#convite-teams');
  convite.href = urlTeams(site, 'Olá! Quero acompanhar as novidades do digital em Itatiba.');
  $('#convite').hidden = false;

  const aplicarBusca = debounce((valor) => {
    escreverHash({ categoria: lerHash().categoria, q: valor }, { substituir: true });
    renderLista();
  }, 220);
  $('#busca').addEventListener('input', (e) => aplicarBusca(e.target.value.trim()));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-limpar]')) {
      escreverHash({}, { substituir: true });
      $('#busca').value = '';
      renderLista();
      return;
    }
    const voltar = e.target.closest('[data-voltar]');
    if (!voltar) return;
    e.preventDefault();
    escreverHash({});
    rotear();
    window.scrollTo({ top: 0, behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  });

  window.addEventListener('hashchange', rotear);

  $('#estado-carga').hidden = true;
  document.querySelectorAll('.nt-topo, .nt-feed-secao, .nt-convite').forEach((el) => el.setAttribute('data-revelar', ''));
  rotear();
}

