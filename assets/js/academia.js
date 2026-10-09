/**
 * Academia Digital (academia.html).
 *
 * Todo o conteúdo vem de data/academia/*.json — trilhas e perfis, recursos,
 * casos, a curiosidade da semana e os textos da página. Publicar conteúdo
 * novo é editar um JSON, nunca este arquivo.
 *
 * Os números do topo são calculados das trilhas. O detalhe de uma trilha
 * abre num painel lateral e fica na hash (#trilha=<id>) — é o endereço que o
 * Início, a busca e os Indicadores usam para apontar uma trilha.
 */

import { criar, linkExterno, buscarJSON, lerHash, escreverHash, movimentoReduzido } from './ui.js';
import { carregarTrilhas } from './conteudo.js';
import { montarCasca, revelar } from './shell.js';

const $ = (sel) => document.querySelector(sel);
const NIVEL = { 'Iniciante': 1, 'Intermediário': 2, 'Avançado': 3 };
const doisDigitos = (n) => String(n).padStart(2, '0');
const duracao = (t) => (Number(t.duracaoHoras) > 0 ? `${t.duracaoHoras} h` : '—');
const disponivel = (t) => t.disponivel === true;
/** Só http(s) vira link: um valor estranho no JSON não vira javascript:. */
const urlSegura = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);

let TRILHAS = [];
let porId = new Map();
let teamsUrl = null;

/* -------------------------------------------------------------------------- */
/* Hero e catálogo                                                            */
/* -------------------------------------------------------------------------- */

function montarHero(site) {
  $('#hero-kicker').textContent = site.kicker || 'Academia Digital';
  const titulo = $('#hero-titulo');
  titulo.textContent = '';
  if (site.tituloAntes) titulo.append(site.tituloAntes);
  if (site.tituloDestaque) titulo.appendChild(criar('em', null, site.tituloDestaque));
  if (site.tituloDepois) titulo.append(site.tituloDepois);
  if (!titulo.textContent.trim()) titulo.textContent = 'Academia Digital';
  const apoio = $('#hero-apoio');
  apoio.textContent = site.apoio || '';
  apoio.hidden = !site.apoio;
}

function montarNumeros() {
  const disp = TRILHAS.filter(disponivel).length;
  const horas = TRILHAS.reduce((s, t) => s + (Number(t.duracaoHoras) || 0), 0);
  const linhas = [
    [TRILHAS.length, TRILHAS.length === 1 ? 'trilha no catálogo' : 'trilhas no catálogo', ''],
    [disp, disp === 1 ? 'disponível agora' : 'disponíveis agora', 'acento'],
  ];
  if (horas) linhas.push([`${horas} h`, 'de conteúdo planejado', '']);
  const alvo = $('#numeros');
  alvo.textContent = '';
  linhas.forEach(([valor, rotulo, classe]) => {
    const par = criar('div', 'ac-numeros__item');
    par.append(criar('dd', `numero ac-numeros__valor${classe ? ` ac-numeros__valor--${classe}` : ''}`, valor), criar('dt', null, rotulo));
    alvo.appendChild(par);
  });
}

function montarCatalogo() {
  const disp = TRILHAS.filter(disponivel).length;
  const resumo = `${disp} de ${TRILHAS.length} ${TRILHAS.length === 1 ? 'trilha disponível' : 'trilhas disponíveis'}`;
  $('#catalogo-resumo').textContent = resumo;
  $('#trilhas-resumo').textContent = resumo;
  const lista = $('#catalogo');
  lista.textContent = '';
  const primeiraBreve = TRILHAS.findIndex((t) => !disponivel(t));
  lista.style.setProperty('--disponiveis', String(primeiraBreve < 0 ? TRILHAS.length : primeiraBreve));
  lista.style.setProperty('--total', String(TRILHAS.length));
  TRILHAS.forEach((t) => {
    const li = criar('li');
    const b = criar('button', `ac-catalogo__item${disponivel(t) ? ' ac-catalogo__item--disp' : ''}`);
    b.type = 'button';
    b.appendChild(criar('span', 'ac-catalogo__ponto'));
    const textos = criar('span', 'ac-catalogo__textos');
    textos.append(criar('span', 'ac-catalogo__nome', t.nome), criar('span', 'ac-catalogo__estado', disponivel(t) ? 'Disponível' : 'Em breve'));
    b.appendChild(textos);
    b.setAttribute('aria-label', `${t.nome}, ${disponivel(t) ? 'disponível' : 'em breve'}: ver detalhe`);
    b.addEventListener('click', () => abrir(t.id, b));
    li.appendChild(b);
    lista.appendChild(li);
  });
}

/* -------------------------------------------------------------------------- */
/* Por onde começar                                                           */
/* -------------------------------------------------------------------------- */

function metaTrilha(t, { aulasSempre = false } = {}) {
  const meta = [['Nível', t.nivel || '—'], ['Duração', duracao(t)]];
  if (t.aulas || aulasSempre) meta.push(['Aulas', t.aulas || '—']);
  return meta;
}

function listaMeta(meta, classe) {
  const dl = criar('dl', classe);
  meta.forEach(([k, v]) => {
    const par = criar('div');
    par.append(criar('dt', null, k), criar('dd', null, v));
    dl.appendChild(par);
  });
  return dl;
}

function montarPerfis(perfis) {
  const validos = perfis.map((p) => ({ ...p, alvo: porId.get(p.trilha) })).filter((p) => p.nome && p.alvo);
  if (!validos.length) return;
  const lista = $('#perfis');
  lista.textContent = '';
  const botoes = validos.map((p, i) => {
    const b = criar('button', 'ac-perfil');
    b.type = 'button';
    b.append(criar('span', 'ac-perfil__n', doisDigitos(i + 1)));
    const textos = criar('span', 'ac-perfil__textos');
    textos.append(criar('span', 'ac-perfil__nome', p.nome));
    if (p.descricao) textos.append(criar('span', 'ac-perfil__desc', p.descricao));
    b.append(textos, criar('span', 'ac-perfil__seta', '→'));
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => escolher(i));
    b.addEventListener('mouseenter', () => escolher(i));
    b.addEventListener('focus', () => escolher(i));
    lista.appendChild(b);
    return b;
  });

  const card = $('#recomendada');
  let atual = -1;
  function escolher(i) {
    if (i === atual) return;
    atual = i;
    botoes.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    const p = validos[i];
    const t = p.alvo;
    card.textContent = '';
    card.appendChild(criar('span', 'ac-recomendada__luz'));
    const topo = criar('div', 'ac-recomendada__topo');
    topo.append(
      criar('span', null, `Trilha recomendada · ${p.nome}`),
      criar('span', `selo selo--quadrado ${disponivel(t) ? 'selo--suave' : ''} ac-selo-mono`, disponivel(t) ? 'Disponível' : 'Em breve'),
    );
    card.append(topo, criar('h3', 'ac-recomendada__nome', t.nome));
    if (t.descricao) card.appendChild(criar('p', 'ac-recomendada__desc', t.descricao));
    card.appendChild(listaMeta(metaTrilha(t), 'ac-meta ac-recomendada__meta'));
    const acoes = criar('div', 'ac-recomendada__acoes');
    const ver = criar('button', 'botao botao--contorno');
    ver.type = 'button';
    ver.append('Ver trilha ', criar('span', null, '→'));
    ver.addEventListener('click', () => abrir(t.id, ver));
    acoes.appendChild(ver);
    // Recomendação ainda não liberada: aponta a primeira que já dá para fazer.
    const alternativa = disponivel(t) ? null : TRILHAS.find(disponivel);
    if (alternativa) {
      const alt = criar('button', 'botao botao--texto ac-recomendada__alt', `Enquanto isso, comece por ${alternativa.nome} →`);
      alt.type = 'button';
      alt.addEventListener('click', () => abrir(alternativa.id, alt));
      acoes.appendChild(alt);
    }
    card.appendChild(acoes);
  }
  escolher(0);
  $('#comecar').hidden = false;
}

/* -------------------------------------------------------------------------- */
/* Trilhas                                                                    */
/* -------------------------------------------------------------------------- */

function montarDestaques() {
  const alvo = $('#destaques');
  alvo.textContent = '';
  const disp = TRILHAS.filter(disponivel);
  $('#sem-disponivel').hidden = disp.length > 0;
  disp.forEach((t) => {
    const card = criar('article', 'vidro ac-destaque');
    const lado = criar('div', 'ac-destaque__principal');
    const estado = criar('p', 'ac-destaque__estado');
    estado.append(criar('span', 'ponto-vivo'), criar('span', null, `Disponível${t.ferramenta ? ` · ${t.ferramenta}` : ''}`));
    lado.append(estado, criar('h3', 'ac-destaque__nome', t.nome));
    if (t.descricao) lado.appendChild(criar('p', 'ac-destaque__desc', t.descricao));
    const acoes = criar('div', 'ac-destaque__acoes');
    const ver = criar('button', 'botao botao--primario');
    ver.type = 'button';
    ver.append('Ver detalhes da trilha ', criar('span', null, '→'));
    ver.addEventListener('click', (e) => { e.stopPropagation(); abrir(t.id, ver); });
    acoes.appendChild(ver);
    const resumo = [t.aulas ? `${t.aulas} aulas` : null, t.nivel].filter(Boolean).join(' · ');
    if (resumo) acoes.appendChild(criar('span', 'ac-destaque__resumo', resumo));
    lado.appendChild(acoes);

    const ficha = criar('div', 'ac-destaque__ficha');
    ficha.appendChild(listaMeta(metaTrilha(t, { aulasSempre: true }), 'ac-meta ac-meta--grande'));
    const n = Number(t.aulas) || 0;
    if (n) {
      const segs = criar('div', 'ac-destaque__aulas');
      segs.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < n; i++) {
        const s = criar('span');
        s.style.opacity = String(Math.max(0.3, 1 - i * 0.1).toFixed(2));
        segs.appendChild(s);
      }
      ficha.appendChild(segs);
    }
    if (t.aprende?.length) {
      ficha.appendChild(criar('p', 'ac-rotulo', 'O que você vai aprender'));
      ficha.appendChild(listaNumerada(t.aprende, 'ac-aprende'));
    }
    card.append(lado, ficha);
    // O cartão inteiro abre o detalhe no mouse; no teclado, o botão faz isso.
    card.addEventListener('click', (e) => { if (!e.target.closest('a')) abrir(t.id, ver); });
    alvo.appendChild(card);
  });
}

function listaNumerada(itens, classe) {
  const ol = criar('ol', classe);
  itens.forEach((texto, i) => {
    const li = criar('li');
    li.append(criar('span', 'ac-aprende__n', doisDigitos(i + 1)), criar('span', null, texto));
    ol.appendChild(li);
  });
  return ol;
}

function montarEmBreve() {
  const lista = $('#embreve');
  lista.textContent = '';
  const breve = TRILHAS.filter((t) => !disponivel(t));
  const base = TRILHAS.length - breve.length;
  breve.forEach((t, i) => {
    const li = criar('li');
    const b = criar('button', 'ac-breve');
    b.type = 'button';
    b.setAttribute('aria-label', `${t.nome}, em breve: ver detalhe`);
    const nivel = criar('span', 'ac-breve__nivel');
    const pontos = criar('span', 'ac-nivel');
    pontos.setAttribute('aria-hidden', 'true');
    [1, 2, 3].forEach((k) => pontos.appendChild(criar('span', k <= (NIVEL[t.nivel] || 0) ? 'ligado' : null)));
    nivel.append(pontos, criar('span', null, t.nivel || '—'));
    b.append(
      criar('span', 'ac-breve__n', doisDigitos(base + i + 1)),
      criar('span', 'ac-breve__nome', t.nome),
      criar('span', 'ac-breve__desc', t.descricao || ''),
      nivel,
      criar('span', 'ac-breve__duracao', duracao(t)),
      criar('span', 'selo ac-selo-mono ac-breve__selo', 'Em breve'),
    );
    b.addEventListener('click', () => abrir(t.id, b));
    li.appendChild(b);
    lista.appendChild(li);
  });
  $('#bloco-embreve').hidden = breve.length === 0;
}

/* -------------------------------------------------------------------------- */
/* Casos, curiosidade, recursos e convite                                     */
/* -------------------------------------------------------------------------- */

function montarCasos(casos) {
  const validos = casos.filter((c) => c && c.titulo);
  if (!validos.length) return;
  const alvo = $('#casos-lista');
  alvo.textContent = '';
  validos.forEach((caso, i) => {
    const card = criar('article', 'cartao ac-caso');
    const topo = criar('p', 'ac-caso__topo');
    topo.append(criar('span', 'ac-caso__n', doisDigitos(i + 1)));
    if (caso.ferramenta) topo.append(criar('span', null, caso.ferramenta));
    card.append(topo, criar('h3', 'ac-caso__titulo', caso.titulo));
    // Estruturado quando os campos existem; senão, o texto corrido.
    const blocos = [['Desafio', caso.desafio], ['Solução', caso.solucao], ['Resultado', caso.resultado]].filter(([, v]) => v);
    if (blocos.length) {
      const dl = criar('dl', 'ac-caso__blocos');
      blocos.forEach(([k, v]) => {
        const par = criar('div');
        par.append(criar('dt', null, k), criar('dd', null, v));
        dl.appendChild(par);
      });
      card.appendChild(dl);
    } else if (caso.descricao) {
      card.appendChild(criar('p', 'ac-caso__texto', caso.descricao));
    }
    alvo.appendChild(card);
  });
  $('#casos').hidden = false;
}

function montarCuriosidade(dados) {
  if (!dados?.titulo) return;
  const card = $('#curiosidade-card');
  card.textContent = '';
  card.appendChild(criar('span', 'ac-curiosidade__luz'));
  const lado = criar('div', 'ac-curiosidade__lado');
  lado.append(criar('p', 'kicker kicker--acento', 'Curiosidade da semana'));
  if (dados.categoria) lado.append(criar('p', 'ac-curiosidade__categoria', dados.categoria));
  const corpo = criar('div', 'ac-curiosidade__corpo');
  corpo.appendChild(criar('h2', 'display ac-curiosidade__titulo', dados.titulo));
  (dados.paragrafos || []).forEach((p) => corpo.appendChild(criar('p', 'ac-curiosidade__texto', p)));
  if (dados.dica) {
    const dica = criar('p', 'ac-curiosidade__dica');
    dica.append(criar('b', null, 'Dica'), criar('span', null, dados.dica));
    corpo.appendChild(dica);
  }
  card.append(lado, corpo);
  $('#curiosidade').hidden = false;
}

function origemDe(url) {
  if (/teams\.microsoft/i.test(url)) return 'Teams';
  if (/sharepoint\./i.test(url)) return 'SharePoint';
  if (/learn\.microsoft/i.test(url)) return 'Microsoft Learn';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function montarRecursos(recursos) {
  const validos = recursos.filter((r) => r?.titulo && urlSegura(r.url));
  if (!validos.length) return;
  const lista = $('#recursos-lista');
  lista.textContent = '';
  validos.forEach((r, i) => {
    const li = criar('li');
    const a = linkExterno(urlSegura(r.url), 'ac-recurso');
    const textos = criar('span', 'ac-recurso__textos');
    textos.append(criar('span', 'ac-recurso__titulo', r.titulo));
    if (r.descricao) textos.append(criar('span', 'ac-recurso__desc', r.descricao));
    a.append(
      criar('span', 'ac-recurso__n', doisDigitos(i + 1)),
      textos,
      criar('span', 'ac-recurso__origem', origemDe(r.url)),
      criar('span', 'ac-recurso__seta', '↗'),
    );
    a.setAttribute('aria-label', `${r.titulo} (abre em nova aba)`);
    li.appendChild(a);
    lista.appendChild(li);
  });
  $('#recursos').hidden = false;
}

function montarConvite(teams) {
  teamsUrl = urlSegura(teams?.url);
  if (!teamsUrl) return;
  // Última palavra do título em itálico laranja, como nos outros títulos do site.
  const titulo = String(teams.titulo || 'Não sabe por onde começar?').trim();
  const corte = titulo.lastIndexOf(' ');
  const h = $('#convite-titulo');
  h.textContent = '';
  if (corte > 0) h.append(`${titulo.slice(0, corte)} `, criar('em', null, titulo.slice(corte + 1)));
  else h.textContent = titulo;
  $('#convite-texto').textContent = teams.texto || '';
  const botao = $('#convite-teams');
  botao.href = teamsUrl;
  botao.textContent = '';
  botao.append(`${teams.rotulo || 'Falar com o time no Teams'} `, criar('span', null, '↗'));
  $('#fechamento').hidden = false;
}

/* -------------------------------------------------------------------------- */
/* Detalhe da trilha                                                          */
/* -------------------------------------------------------------------------- */

const gaveta = () => $('#gaveta');
let origemFoco = null;
let fechando = null;

function preencher(t) {
  const estado = $('#gaveta-estado');
  estado.textContent = `${disponivel(t) ? 'Disponível' : 'Em breve'}${t.ferramenta ? ` · ${t.ferramenta}` : ''}`;
  estado.classList.toggle('acento', disponivel(t));

  const corpo = $('#gaveta-corpo');
  corpo.textContent = '';
  const titulo = criar('h2', 'ac-gaveta__titulo', t.nome);
  titulo.id = 'gaveta-titulo';
  corpo.appendChild(titulo);
  if (t.descricao) corpo.appendChild(criar('p', 'ac-gaveta__desc', t.descricao));
  corpo.appendChild(listaMeta(metaTrilha(t), 'ac-meta ac-gaveta__meta'));
  const secao = (rotulo, conteudo) => {
    const s = criar('section', 'ac-gaveta__secao');
    s.append(criar('h3', 'ac-rotulo', rotulo), conteudo);
    corpo.appendChild(s);
  };
  if (t.publico) secao('Para quem é', criar('p', 'ac-gaveta__texto', t.publico));
  if (t.aprende?.length) secao('O que você vai aprender', listaNumerada(t.aprende, 'ac-aprende ac-aprende--gaveta'));
  if (t.preRequisitos?.length) {
    const ul = criar('ul', 'ac-gaveta__pre');
    t.preRequisitos.forEach((p) => ul.appendChild(criar('li', null, p)));
    secao('Pré-requisitos', ul);
  }
  if (!disponivel(t)) corpo.appendChild(criar('p', 'ac-gaveta__aviso', 'Esta trilha está em preparação. Conteúdo, aulas e pré-requisitos serão publicados aqui quando ela for liberada.'));

  const rodape = $('#gaveta-rodape');
  rodape.textContent = '';
  const link = disponivel(t) ? urlSegura(t.link) : null;
  if (link) {
    const a = linkExterno(link, 'botao botao--primario');
    a.append('Começar trilha ', criar('span', null, '↗'));
    rodape.appendChild(a);
  } else {
    rodape.appendChild(criar('span', 'ac-gaveta__breve', disponivel(t) ? 'Link em breve' : 'Em breve'));
  }
  if (teamsUrl) {
    const duvida = linkExterno(teamsUrl, 'ac-gaveta__duvida');
    duvida.textContent = 'Dúvidas? Fale no Teams';
    rodape.appendChild(duvida);
  }
}

function abrir(id, origem) {
  const t = porId.get(id);
  if (!t) return;
  const dlg = gaveta();
  if (fechando) { clearTimeout(fechando); fechando = null; }
  if (!dlg.open) {
    origemFoco = origem || document.activeElement;
    dlg.showModal();
    requestAnimationFrame(() => dlg.classList.add('aberta'));
  }
  preencher(t);
  $('#gaveta-corpo').scrollTop = 0;
  dlg.querySelector('[data-fechar]').focus();
  if (lerHash().trilha !== id) escreverHash({ trilha: id }, { substituir: true });
}

function fechar() {
  const dlg = gaveta();
  if (!dlg.open || fechando) return;
  dlg.classList.remove('aberta');
  fechando = setTimeout(() => { fechando = null; dlg.close(); }, movimentoReduzido() ? 0 : 420);
}

function ligarGaveta() {
  const dlg = gaveta();
  dlg.querySelector('[data-fechar]').addEventListener('click', fechar);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) fechar(); });
  dlg.addEventListener('close', () => {
    dlg.classList.remove('aberta');
    if (lerHash().trilha) escreverHash({}, { substituir: true });
    if (origemFoco && document.contains(origemFoco)) origemFoco.focus({ preventScroll: true });
    origemFoco = null;
  });
  const seguirHash = () => {
    const id = lerHash().trilha;
    if (id && porId.has(id)) abrir(id);
    else if (!id) fechar();
  };
  window.addEventListener('hashchange', seguirHash);
  seguirHash();
}

/* -------------------------------------------------------------------------- */
/* Início                                                                     */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  const opcional = (p) => p.catch((e) => { console.warn(`[academia] ${e.message}`); return null; });
  let site;
  let academia;
  let recursos;
  let casos;
  let curiosidade;
  try {
    [, site, academia, recursos, casos, curiosidade] = await Promise.all([
      montarCasca({ ativa: 'academia', marca: 'Academia Digital · Transformação Digital Itatiba' }),
      opcional(buscarJSON('data/academia/site.json')),
      carregarTrilhas(),
      opcional(buscarJSON('data/academia/recursos.json')),
      opcional(buscarJSON('data/academia/casos.json')),
      opcional(buscarJSON('data/academia/curiosidade.json')),
    ]);
  } catch (erro) {
    $('#estado-carga').hidden = true;
    $('#erro-texto').textContent = `As trilhas não puderam ser lidas. ${erro.message}`;
    $('#erro').hidden = false;
    return;
  }

  // Disponíveis primeiro; dentro de cada grupo, a ordem do JSON.
  TRILHAS = [...academia.trilhas].sort((a, b) => Number(disponivel(b)) - Number(disponivel(a)));
  porId = new Map(TRILHAS.map((t) => [t.id, t]));

  montarHero(site || {});
  montarNumeros();
  montarCatalogo();
  montarPerfis(academia.perfis);
  montarDestaques();
  montarEmBreve();
  montarCasos(casos?.casos || []);
  montarCuriosidade(curiosidade);
  montarRecursos(recursos?.recursos || []);
  montarConvite(site?.teams);

  $('#estado-carga').hidden = true;
  $('#pagina').hidden = false;

  document.querySelectorAll('.ac-catalogo, .ac-secao > *').forEach((el) => el.setAttribute('data-revelar', ''));
  revelar();
  ligarGaveta();
}
