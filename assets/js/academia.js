/**
 * Academia Digital (academia.html).
 *
 * Todo o conteúdo vem de data/academia/*.json — trilhas, perfis, recursos,
 * casos e a curiosidade da semana. Publicar conteúdo novo é editar um JSON,
 * nunca este arquivo.
 *
 * Os indicadores do hero são calculados a partir das trilhas, então nunca
 * mentem sobre o que existe.
 */

import {
  criar, linkExterno, buscarJSON, normalizar, debounce,
  escreverHash, lerHash, ligarSpotlight, animarContagem, ligarRolagemSuave, prenderFoco, plural,
} from './ui.js';
import { icone } from '../icons/icones.js';

const $ = (sel) => document.querySelector(sel);

const NIVEIS = ['Iniciante', 'Intermediário', 'Avançado'];

let TRILHAS = [];
let PERFIS = [];
let devolverFoco = null;
let cardDeOrigem = null;

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

function montarHero(site) {
  $('#hero-kicker').textContent = site.kicker ?? 'Academia Digital';

  // O acento em laranja é uma parte do título, não o título inteiro.
  const titulo = $('#hero-titulo');
  titulo.textContent = '';
  if (site.tituloAntes) titulo.appendChild(document.createTextNode(site.tituloAntes));
  if (site.tituloDestaque) titulo.appendChild(criar('span', 'topo__destaque', site.tituloDestaque));
  if (site.tituloDepois) titulo.appendChild(document.createTextNode(site.tituloDepois));

  const apoio = $('#hero-apoio');
  if (site.apoio) apoio.textContent = site.apoio;
  else apoio.hidden = true;
}

/** Indicadores calculados: nada é digitado à mão. */
function montarIndicadores(trilhas) {
  const disponiveis = trilhas.filter((t) => t.disponivel).length;
  const ferramentas = new Set(trilhas.map((t) => t.ferramenta ?? t.nome)).size;
  const horas = trilhas.reduce((soma, t) => soma + (Number(t.duracaoHoras) || 0), 0);

  // Rótulo concorda com o número: "1 trilha disponível", não "1 trilhas".
  const linhas = [
    [plural(disponiveis, 'Trilha disponível', 'Trilhas disponíveis'), disponiveis, ''],
    [plural(ferramentas, 'Ferramenta', 'Ferramentas'), ferramentas, ''],
    ['Horas de conteúdo', horas, 'h'],
  ];

  const lista = $('#indicadores');
  lista.textContent = '';
  linhas.forEach(([rotulo, valor, sufixo], indice) => {
    if (!valor) return; // indicador zerado não vira "0" na tela
    const bloco = criar('div', 'indicador');
    bloco.style.setProperty('--indice', String(indice));
    const numero = criar('dd', 'indicador__valor');
    bloco.appendChild(numero);
    bloco.appendChild(criar('dt', 'indicador__rotulo', rotulo));
    lista.appendChild(bloco);
    animarContagem(numero, valor, { sufixo });
  });
}

/* -------------------------------------------------------------------------- */
/* Por onde começar                                                           */
/* -------------------------------------------------------------------------- */

function montarPerfis(perfis, trilhas) {
  const validos = perfis
    .map((p) => ({ perfil: p, trilha: trilhas.find((t) => t.id === p.trilha) }))
    .filter((x) => x.trilha);

  if (!validos.length) return; // seção segue oculta

  const container = $('#perfis');
  container.textContent = '';

  validos.forEach(({ perfil, trilha }, indice) => {
    const card = criar('button', 'perfil cartao-base cartao-base--ativo');
    card.type = 'button';
    card.style.setProperty('--indice', String(indice));

    const topo = criar('div', 'perfil__topo');
    const marca = icone(perfil.icone ?? 'bussola', 'icone icone--titulo');
    if (marca) topo.appendChild(marca);
    topo.appendChild(criar('h3', 'perfil__nome', perfil.nome));
    card.appendChild(topo);

    if (perfil.descricao) card.appendChild(criar('p', 'perfil__descricao', perfil.descricao));

    const recomendacao = criar('p', 'perfil__trilha');
    recomendacao.appendChild(criar('span', 'perfil__rotulo', 'Comece por'));
    recomendacao.appendChild(criar('span', 'perfil__valor', trilha.nome));
    card.appendChild(recomendacao);

    card.addEventListener('click', () => abrirPainel(trilha, card));
    container.appendChild(card);
  });

  $('#comecar').hidden = false;
  ligarSpotlight(container, '.cartao-base');
}

/* -------------------------------------------------------------------------- */
/* Trilhas                                                                    */
/* -------------------------------------------------------------------------- */

function montarChips(container, valores, chaveHash, rotuloTodos) {
  container.textContent = '';
  const todos = [{ valor: '', rotulo: rotuloTodos }, ...valores.map((v) => ({ valor: v, rotulo: v }))];

  for (const { valor, rotulo } of todos) {
    const chip = criar('button', 'chip chip--acao', rotulo);
    chip.type = 'button';
    chip.dataset.valor = valor;
    chip.dataset.chave = chaveHash;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      const estado = lerHash();
      const atual = estado[chaveHash] ?? '';
      escreverHash({ ...estado, rota: undefined, [chaveHash]: atual === valor ? '' : valor });
      render();
    });
    container.appendChild(chip);
  }
}

function filtrar(trilhas, estado) {
  const busca = normalizar(estado.q ?? '');
  return trilhas.filter((t) => {
    if (estado.nivel && t.nivel !== estado.nivel) return false;
    if (estado.ferramenta && (t.ferramenta ?? t.nome) !== estado.ferramenta) return false;
    if (busca && !t.textoBusca.includes(busca)) return false;
    return true;
  });
}

function montarCardTrilha(trilha, indice) {
  const disponivel = Boolean(trilha.disponivel);
  const card = criar(disponivel ? 'button' : 'div', `trilha cartao-base${disponivel ? ' cartao-base--ativo' : ' trilha--embreve'}`);
  if (disponivel) card.type = 'button';
  card.style.setProperty('--indice', String(indice));

  const topo = criar('div', 'trilha__topo');
  const marca = icone(trilha.icone ?? 'livro', 'icone icone--titulo');
  if (marca) topo.appendChild(marca);
  topo.appendChild(criar('h3', 'trilha__nome', trilha.nome));
  card.appendChild(topo);

  if (trilha.descricao) card.appendChild(criar('p', 'trilha__descricao', trilha.descricao));

  const meta = criar('div', 'trilha__meta');
  if (trilha.nivel) meta.appendChild(criar('span', 'selo selo--neutro', trilha.nivel));

  // Duração e aulas só aparecem quando o JSON traz o dado.
  if (trilha.duracaoHoras) {
    const item = criar('span', 'trilha__dado');
    const ic = icone('relogio');
    if (ic) item.appendChild(ic);
    item.appendChild(criar('span', null, `${trilha.duracaoHoras}h`));
    meta.appendChild(item);
  }
  if (trilha.aulas) {
    const item = criar('span', 'trilha__dado');
    const ic = icone('lista');
    if (ic) item.appendChild(ic);
    item.appendChild(criar('span', null, `${trilha.aulas} aulas`));
    meta.appendChild(item);
  }
  if (meta.childElementCount) card.appendChild(meta);

  const rodape = criar('div', 'trilha__rodape');
  if (disponivel) {
    const acao = criar('span', 'trilha__acao', 'Ver trilha');
    const seta = icone('seta');
    if (seta) acao.appendChild(seta);
    rodape.appendChild(acao);
    card.addEventListener('click', () => abrirPainel(trilha, card));
    card.setAttribute('aria-label', `${trilha.nome} — ver detalhe da trilha`);
  } else {
    rodape.appendChild(criar('span', 'selo selo--contorno', 'Em breve'));
  }
  card.appendChild(rodape);

  return card;
}

function render() {
  const estado = lerHash();
  const visiveis = filtrar(TRILHAS, estado);

  // Sincroniza os controles com a hash (a hash é a fonte da verdade).
  for (const chip of document.querySelectorAll('.filtros-academia .chip')) {
    const ativo = (estado[chip.dataset.chave] ?? '') === chip.dataset.valor;
    chip.classList.toggle('chip--ativo', ativo);
    chip.setAttribute('aria-pressed', String(ativo));
  }
  const busca = $('#busca');
  if (busca.value !== (estado.q ?? '')) busca.value = estado.q ?? '';

  const temFiltro = Boolean(estado.nivel || estado.ferramenta || estado.q);
  $('#limpar').hidden = !temFiltro;

  const disponiveis = visiveis.filter((t) => t.disponivel);
  const embreve = visiveis.filter((t) => !t.disponivel);

  const alvoDisponiveis = $('#trilhas-disponiveis');
  const alvoEmBreve = $('#trilhas-embreve');
  alvoDisponiveis.textContent = '';
  alvoEmBreve.textContent = '';

  disponiveis.forEach((t, i) => alvoDisponiveis.appendChild(montarCardTrilha(t, i)));
  embreve.forEach((t, i) => alvoEmBreve.appendChild(montarCardTrilha(t, i)));

  $('#bloco-embreve').hidden = embreve.length === 0;
  $('#vazio').hidden = visiveis.length > 0;

  const resumo = $('#resumo-trilhas');
  resumo.textContent = temFiltro
    ? `${visiveis.length} de ${TRILHAS.length} trilhas`
    : `${TRILHAS.length} trilhas`;
}

/* -------------------------------------------------------------------------- */
/* Painel de detalhe                                                          */
/* -------------------------------------------------------------------------- */

function secaoDoPainel(rotulo, conteudo) {
  const bloco = criar('section', 'painel__secao');
  bloco.appendChild(criar('h3', 'painel__rotulo', rotulo));
  bloco.appendChild(conteudo);
  return bloco;
}

function abrirPainel(trilha, origem) {
  const dialogo = $('#painel-trilha');
  const corpo = $('#painel-corpo');
  corpo.textContent = '';
  cardDeOrigem = origem ?? null;

  const cabecalho = criar('header', 'painel__cabecalho');
  const marca = icone(trilha.icone ?? 'livro', 'icone icone--titulo');
  if (marca) cabecalho.appendChild(marca);
  const textos = criar('div');
  textos.appendChild(criar('h2', 'painel__titulo', trilha.nome));
  const meta = criar('p', 'painel__meta');
  if (trilha.nivel) meta.appendChild(criar('span', 'selo selo--neutro', trilha.nivel));
  // Mesma marca do card: sem ela o painel de uma trilha ainda não publicada
  // (para onde os perfis de "Por onde começar" podem apontar) não dava nenhum
  // sinal de que não há o que acessar.
  if (!trilha.disponivel) meta.appendChild(criar('span', 'selo selo--contorno', 'Em breve'));
  if (trilha.duracaoHoras) meta.appendChild(criar('span', 'painel__dado', `${trilha.duracaoHoras}h de conteúdo`));
  if (trilha.aulas) meta.appendChild(criar('span', 'painel__dado', `${trilha.aulas} aulas`));
  if (meta.childElementCount) textos.appendChild(meta);
  cabecalho.appendChild(textos);
  corpo.appendChild(cabecalho);

  if (trilha.descricao) corpo.appendChild(criar('p', 'painel__resumo', trilha.descricao));

  // Cada seção some por inteiro quando o campo não existe no JSON.
  if (trilha.aprende?.length) {
    const lista = criar('ul', 'painel__lista');
    for (const item of trilha.aprende) lista.appendChild(criar('li', null, item));
    corpo.appendChild(secaoDoPainel('O que você vai aprender', lista));
  }

  if (trilha.preRequisitos?.length) {
    const lista = criar('ul', 'painel__lista');
    for (const item of trilha.preRequisitos) lista.appendChild(criar('li', null, item));
    corpo.appendChild(secaoDoPainel('Pré-requisitos', lista));
  }

  if (trilha.publico) {
    corpo.appendChild(secaoDoPainel('Para quem é', criar('p', 'painel__texto', trilha.publico)));
  }

  if (trilha.link) {
    const acoes = criar('div', 'painel__acoes');
    const botao = linkExterno(trilha.link, 'botao botao--primario');
    botao.appendChild(criar('span', null, 'Acessar trilha'));
    const seta = icone('seta-externa');
    if (seta) botao.appendChild(seta);
    acoes.appendChild(botao);
    corpo.appendChild(acoes);
  }

  dialogo.showModal();
  devolverFoco = prenderFoco(dialogo, cardDeOrigem);
}

function fecharPainel() {
  const dialogo = $('#painel-trilha');
  if (dialogo.open) dialogo.close();
}

function ligarPainel() {
  const dialogo = $('#painel-trilha');

  dialogo.addEventListener('close', () => {
    if (devolverFoco) devolverFoco();
    devolverFoco = null;
  });

  dialogo.querySelector('[data-fechar]').addEventListener('click', fecharPainel);

  // Clique fora fecha: o <dialog> recebe o clique do próprio backdrop.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) fecharPainel();
  });

  const fechar = dialogo.querySelector('[data-fechar]');
  const x = icone('fechar');
  if (x) fechar.appendChild(x);
}

/* -------------------------------------------------------------------------- */
/* Demais seções                                                              */
/* -------------------------------------------------------------------------- */

function montarRecursos(recursos) {
  const container = $('#atalhos');
  container.textContent = '';
  recursos.forEach((recurso, indice) => {
    const atalho = linkExterno(recurso.url, 'atalho');
    atalho.style.setProperty('--indice', String(indice));
    const marca = icone(recurso.icone ?? 'pasta', 'icone icone--grande');
    if (marca) atalho.appendChild(marca);
    const textos = criar('span', 'atalho__textos');
    textos.appendChild(criar('span', 'atalho__titulo', recurso.titulo));
    if (recurso.descricao) textos.appendChild(criar('span', 'atalho__descricao', recurso.descricao));
    atalho.appendChild(textos);
    const seta = icone('seta-externa', 'icone atalho__seta');
    if (seta) atalho.appendChild(seta);
    container.appendChild(atalho);
  });
}

function montarCuriosidade(dados) {
  if (!dados?.titulo) return;
  const card = $('#curiosidade-card');
  card.textContent = '';

  if (dados.categoria) {
    const etiqueta = criar('p', 'curiosidade__categoria');
    const marca = icone(dados.icone ?? 'ideia');
    if (marca) etiqueta.appendChild(marca);
    etiqueta.appendChild(criar('span', null, dados.categoria));
    card.appendChild(etiqueta);
  }

  card.appendChild(criar('h3', 'curiosidade__titulo', dados.titulo));
  for (const paragrafo of dados.paragrafos ?? []) {
    card.appendChild(criar('p', 'curiosidade__texto', paragrafo));
  }
  if (dados.dica) card.appendChild(criar('p', 'curiosidade__dica', dados.dica));

  $('#curiosidade').hidden = false;
}

function montarCasos(casos) {
  const container = $('#casos-lista');
  container.textContent = '';

  casos.forEach((caso, indice) => {
    const card = criar('article', 'caso cartao-base');
    card.style.setProperty('--indice', String(indice));

    const topo = criar('div', 'caso__topo');
    const marca = icone(caso.icone ?? 'troféu', 'icone icone--titulo');
    if (marca) topo.appendChild(marca);
    const textos = criar('div');
    if (caso.ferramenta) textos.appendChild(criar('p', 'caso__ferramenta', caso.ferramenta));
    textos.appendChild(criar('h3', 'caso__titulo', caso.titulo));
    topo.appendChild(textos);
    card.appendChild(topo);

    // Estruturado quando os campos existem; senão, o texto corrido de sempre.
    const estruturado = [
      ['Desafio', caso.desafio],
      ['Solução', caso.solucao],
      ['Resultado', caso.resultado],
    ].filter(([, valor]) => valor);

    if (estruturado.length) {
      const lista = criar('dl', 'caso__blocos');
      for (const [rotulo, valor] of estruturado) {
        const bloco = criar('div', 'caso__bloco');
        bloco.appendChild(criar('dt', 'caso__rotulo', rotulo));
        bloco.appendChild(criar('dd', 'caso__valor', valor));
        lista.appendChild(bloco);
      }
      card.appendChild(lista);
    } else if (caso.descricao) {
      card.appendChild(criar('p', 'caso__descricao', caso.descricao));
    }

    container.appendChild(card);
  });

  ligarSpotlight(container, '.cartao-base');
}

function montarFaixa(teams) {
  if (!teams?.url) return;
  const faixa = $('#faixa-final');
  faixa.textContent = '';

  const textos = criar('div', 'faixa__textos');
  textos.appendChild(criar('h2', 'faixa__titulo', teams.titulo ?? 'Não encontrou o que precisa?'));
  if (teams.texto) textos.appendChild(criar('p', 'faixa__texto', teams.texto));
  faixa.appendChild(textos);

  const botao = linkExterno(teams.url, 'botao botao--primario');
  const marca = icone('chat');
  if (marca) botao.appendChild(marca);
  botao.appendChild(criar('span', null, teams.rotulo ?? 'Falar com o Digital'));
  faixa.appendChild(botao);
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

async function iniciar() {
  const aviso = $('#estado-carga');

  let site, trilhasCfg, recursosCfg, casosCfg, curiosidade;
  try {
    [site, trilhasCfg, recursosCfg, casosCfg, curiosidade] = await Promise.all([
      buscarJSON('data/academia/site.json'),
      buscarJSON('data/academia/trilhas.json'),
      buscarJSON('data/academia/recursos.json'),
      buscarJSON('data/academia/casos.json'),
      buscarJSON('data/academia/curiosidade.json'),
    ]);
  } catch (erro) {
    aviso.textContent = `Não foi possível carregar a Academia. ${erro.message}`;
    console.error(erro);
    return;
  }

  TRILHAS = (trilhasCfg.trilhas ?? []).map((t) => ({
    ...t,
    textoBusca: normalizar([t.nome, t.descricao, t.nivel, t.ferramenta, t.publico].filter(Boolean).join(' ')),
  }));
  PERFIS = trilhasCfg.perfis ?? [];

  montarHero(site);
  montarIndicadores(TRILHAS);
  montarPerfis(PERFIS, TRILHAS);

  const niveisPresentes = NIVEIS.filter((n) => TRILHAS.some((t) => t.nivel === n));
  const ferramentas = [...new Set(TRILHAS.map((t) => t.ferramenta ?? t.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  montarChips($('#filtro-nivel'), niveisPresentes, 'nivel', 'Todos os níveis');
  montarChips($('#filtro-ferramenta'), ferramentas, 'ferramenta', 'Todas as ferramentas');

  montarRecursos(recursosCfg.recursos ?? []);
  montarCuriosidade(curiosidade);
  montarCasos(casosCfg.casos ?? []);
  montarFaixa(site.teams);
  ligarPainel();
  ligarRolagemSuave();

  // Busca com debounce e replaceState: uma letra digitada não vira uma
  // entrada de histórico.
  const aplicarBusca = debounce((valor) => {
    escreverHash({ ...lerHash(), rota: undefined, q: valor }, { substituir: true });
    render();
  }, 250);
  $('#busca').addEventListener('input', (evento) => aplicarBusca(evento.target.value.trim()));

  for (const botao of document.querySelectorAll('#limpar, [data-limpar]')) {
    botao.addEventListener('click', () => {
      escreverHash({});
      render();
      $('#busca').value = '';
    });
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);

  render();
  ligarSpotlight($('#trilhas-disponiveis'), '.cartao-base');
  ligarSpotlight($('#trilhas-embreve'), '.cartao-base');

  aviso.hidden = true;
  $('#pagina').hidden = false;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
