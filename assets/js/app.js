/**
 * Orquestração: área da URL, filtros, estado na hash e render dos três blocos
 * (cabeçalho, árvore, gestão).
 *
 * Estado mora na hash — dentro do iframe do SharePoint não dá para contar com
 * localStorage nem cookie. `hashchange` é a única porta de entrada do render:
 * os controles escrevem na hash, e o render lê de lá.
 */

import { carregarPortal, FASE, FASES_ORDEM, criarSlug, normalizarBusca, formatarDataHora, plural } from './data.js';
import { criarArvore } from './tree.js';
import { criarPainelGestao, criarPainelDetalhe, urlTeams } from './panels.js';

const FASE_POR_SLUG = new Map(FASES_ORDEM.map((fase) => [criarSlug(fase), fase]));
const ATRASO_BUSCA = 250;
const ATRASO_RESIZE = 120;

const $ = (seletor) => document.querySelector(seletor);

/* -------------------------------------------------------------------------- */
/* Estado na hash                                                              */
/* -------------------------------------------------------------------------- */

function lerHash() {
  const bruta = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(bruta);
  const fases = (params.get('fase') || '')
    .split(',')
    .map((s) => FASE_POR_SLUG.get(s.trim()))
    .filter(Boolean);

  // `i` só vale se for id inteiro: sem isso um `#i=abc` vira NaN e volta para a
  // URL como `i=NaN` na primeira escrita seguinte, e fica grudado ali.
  const idBruto = Number(params.get('i'));
  const aberta = params.get('i') && Number.isInteger(idBruto) ? idBruto : null;

  return {
    fases: new Set(fases),
    projeto: params.get('projeto') || '',
    tech: params.get('tech') || '',
    busca: params.get('q') || '',
    aberta,
    resumo: params.get('raia') || '',
  };
}

function escreverHash(parcial, { substituir = false } = {}) {
  const atual = lerHash();
  const proximo = { ...atual, ...parcial };
  const params = new URLSearchParams();

  if (proximo.fases.size) {
    params.set('fase', [...proximo.fases].map((f) => criarSlug(f)).join(','));
  }
  if (proximo.projeto) params.set('projeto', proximo.projeto);
  if (proximo.tech) params.set('tech', proximo.tech);
  if (proximo.busca) params.set('q', proximo.busca);
  if (proximo.aberta !== null && proximo.aberta !== undefined) params.set('i', String(proximo.aberta));
  if (proximo.resumo) params.set('raia', proximo.resumo);

  const hash = params.toString();
  const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`;

  if (substituir) {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.history.pushState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

/** '2026-09-17T17:41:14Z' -> '17 set 2026, 14:41'. Só para o cabeçalho. */
const FMT_CURTO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function dataHoraCurta(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const partes = Object.fromEntries(
    FMT_CURTO.formatToParts(data).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  const mes = partes.month.replace('.', '');
  return `${partes.day} ${mes} ${partes.year}, ${partes.hour}:${partes.minute}`;
}

/* -------------------------------------------------------------------------- */
/* Filtro                                                                      */
/* -------------------------------------------------------------------------- */

function filtrar(itens, estado) {
  const termo = normalizarBusca(estado.busca);
  return itens.filter((item) => {
    if (estado.fases.size && !estado.fases.has(item.fase)) return false;
    if (estado.projeto && item.slugProjeto !== estado.projeto) return false;
    if (estado.tech && !item.technologies.some((t) => criarSlug(t) === estado.tech)) return false;
    if (termo && !item.textoBusca.includes(termo)) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

async function iniciar() {
  const raiz = $('#app');
  const aviso = $('#estado-carga');

  let portal;
  try {
    portal = await carregarPortal();
  } catch (erro) {
    aviso.hidden = false;
    aviso.textContent = `Não foi possível carregar os dados. ${erro.message}`;
    console.error(erro);
    return;
  }

  const { dataset, areas, site } = portal;

  /* ---- área da URL ------------------------------------------------------- */

  const slugPedido = new URLSearchParams(window.location.search).get('area');
  const area = slugPedido ? areas.find((a) => a.slug === criarSlug(slugPedido)) : null;

  if (slugPedido && !area) {
    // Falha visível: melhor do que mostrar o site inteiro para o gestor de uma área.
    aviso.hidden = false;
    aviso.className = 'estado estado--erro';
    aviso.textContent = '';
    const titulo = document.createElement('h2');
    titulo.textContent = 'Área não encontrada';
    const texto = document.createElement('p');
    texto.textContent = `O endereço desta página pede a área "${slugPedido}", que não existe na configuração do portal. Verifique o parâmetro ?area= do iframe.`;
    const rotulo = document.createElement('p');
    rotulo.className = 'estado__rotulo';
    rotulo.textContent = 'Áreas válidas:';
    const lista = document.createElement('ul');
    lista.className = 'estado__lista';
    for (const a of areas) {
      const li = document.createElement('li');
      li.textContent = `${a.slug} — ${a.name}`;
      lista.appendChild(li);
    }
    aviso.append(titulo, texto, rotulo, lista);
    raiz.hidden = true;
    return;
  }

  aviso.hidden = true;
  raiz.hidden = false;

  const itensDaArea = area ? dataset.itens.filter((i) => i.slugArea === area.slug) : dataset.itens;
  const mostrarArea = !area;

  /* ---- cabeçalho --------------------------------------------------------- */

  document.title = `${area ? area.name : site.allAreasLabel} · ${site.portalTitle} · ${site.plantName}`;
  $('#area-nome').textContent = area ? area.name : site.allAreasLabel;

  const descricao = area ? area.description : site.allAreasDescription;
  const nodeDescricao = $('#area-descricao');
  if (descricao) {
    nodeDescricao.textContent = descricao;
    // A descrição fica numa linha só; o texto inteiro vem no title.
    nodeDescricao.title = descricao;
  } else {
    nodeDescricao.hidden = true;
  }

  // No cabeçalho a data vai na forma curta, para não empurrar os botões para
  // uma linha própria; o texto por extenso fica no title.
  const atualizacao = formatarDataHora(dataset.atualizadoEm);
  const nodeAtualizacao = $('#atualizacao');
  if (atualizacao) {
    nodeAtualizacao.textContent = `Atualizado ${dataHoraCurta(dataset.atualizadoEm)}`;
    nodeAtualizacao.title = `Dados atualizados em ${atualizacao}`;
  } else {
    nodeAtualizacao.hidden = true;
  }

  const botaoNova = $('#botao-nova');
  botaoNova.href = site.newInitiative?.url ?? '#';
  botaoNova.textContent = site.newInitiative?.label ?? 'Nova iniciativa';

  const botaoTeams = $('#botao-teams');
  const mensagemPadrao = area
    ? `${site.teams?.message ?? ''} as iniciativas digitais da área ${area.name}.`
    : `${site.teams?.message ?? ''} as iniciativas digitais do site.`;
  botaoTeams.href = urlTeams(site, mensagemPadrao.trim());
  botaoTeams.textContent = site.teams?.label ?? 'Falar com o Digital';

  /* ---- filtros ----------------------------------------------------------- */

  const chips = $('#filtro-fases');
  const seletorProjeto = $('#filtro-projeto');
  const seletorTech = $('#filtro-tech');
  const campoBusca = $('#filtro-busca');
  const resumo = $('#resumo-filtro');

  for (const fase of FASES_ORDEM) {
    const quantidade = itensDaArea.filter((i) => i.fase === fase).length;
    if (!quantidade) continue;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip chip--acao chip--${criarSlug(fase)}`;
    chip.dataset.fase = criarSlug(fase);
    chip.setAttribute('aria-pressed', 'false');
    const rotulo = document.createElement('span');
    rotulo.textContent = fase;
    const contagem = document.createElement('span');
    contagem.className = 'chip__contagem';
    contagem.textContent = String(quantidade);
    chip.append(rotulo, contagem);
    chip.addEventListener('click', () => {
      const estado = lerHash();
      const alvo = FASE_POR_SLUG.get(chip.dataset.fase);
      const fases = new Set(estado.fases);
      if (fases.has(alvo)) fases.delete(alvo);
      else fases.add(alvo);
      escreverHash({ fases });
    });
    chips.appendChild(chip);
  }

  const preencherSeletor = (seletor, valores, rotuloVazio) => {
    seletor.textContent = '';
    const opcaoVazia = document.createElement('option');
    opcaoVazia.value = '';
    opcaoVazia.textContent = rotuloVazio;
    seletor.appendChild(opcaoVazia);
    for (const { valor, rotulo } of valores) {
      const opcao = document.createElement('option');
      opcao.value = valor;
      opcao.textContent = rotulo;
      seletor.appendChild(opcao);
    }
  };

  const projetos = [...new Map(itensDaArea.map((i) => [i.slugProjeto, i.project])).entries()]
    .map(([valor, rotulo]) => ({ valor, rotulo }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  preencherSeletor(seletorProjeto, projetos, 'Todos os projetos');

  const tecnologias = [...new Set(itensDaArea.flatMap((i) => i.technologies))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((t) => ({ valor: criarSlug(t), rotulo: t }));
  preencherSeletor(seletorTech, tecnologias, 'Todas as tecnologias');

  seletorProjeto.addEventListener('change', () => escreverHash({ projeto: seletorProjeto.value }));
  seletorTech.addEventListener('change', () => escreverHash({ tech: seletorTech.value }));

  // Busca: debounce + replaceState, para não gerar um render e uma entrada de
  // histórico por tecla digitada.
  let temporizadorBusca = null;
  campoBusca.addEventListener('input', () => {
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(() => {
      escreverHash({ busca: campoBusca.value.trim() }, { substituir: true });
    }, ATRASO_BUSCA);
  });

  $('#limpar-filtros').addEventListener('click', () => {
    escreverHash({ fases: new Set(), projeto: '', tech: '', busca: '' });
  });

  /* ---- componentes ------------------------------------------------------- */

  const containerArvore = $('#arvore');
  const arvore = criarArvore({
    container: containerArvore,
    dataset,
    aoAbrirDetalhe: (id) => escreverHash({ aberta: id, resumo: '' }),
    // Clique no rótulo da raia abre o resumo daquele projeto.
    aoAbrirProjeto: (raia) => escreverHash({ resumo: raia.chave, aberta: null }),
  });

  const gestao = criarPainelGestao({
    container: $('#gestao'),
    dataset,
    aoAbrir: (id) => {
      arvore.focarNo(id);
      escreverHash({ aberta: id, resumo: '' });
    },
    aoDestacar: (id) => arvore.destacar(id),
  });

  let idQueAbriu = null;
  let raiaAberta = '';
  const detalhe = criarPainelDetalhe({
    dialog: $('#detalhe'),
    dataset,
    site,
    aoNavegar: (id) => escreverHash({ aberta: id, resumo: '' }),
    aoFechar: () => {
      const estado = lerHash();
      if (estado.aberta !== null || estado.resumo) {
        escreverHash({ aberta: null, resumo: '' }, { substituir: true });
      }
      if (idQueAbriu !== null) arvore.focarElementoDoNo(idQueAbriu);
    },
  });

  $('[data-acao="centralizar"]').addEventListener('click', () => arvore.centralizar());
  $('[data-acao="mais"]').addEventListener('click', () => arvore.zoomMais());
  $('[data-acao="menos"]').addEventListener('click', () => arvore.zoomMenos());
  $('[data-acao="ampliar"]').addEventListener('click', () => arvore.ampliar());

  /* ---- render ------------------------------------------------------------ */

  let ultimoEstadoFiltro = '';

  function sincronizarControles(estado) {
    for (const chip of chips.querySelectorAll('.chip--acao')) {
      const ativo = estado.fases.has(FASE_POR_SLUG.get(chip.dataset.fase));
      chip.classList.toggle('chip--ativo', ativo);
      chip.setAttribute('aria-pressed', String(ativo));
    }
    if (seletorProjeto.value !== estado.projeto) seletorProjeto.value = estado.projeto;
    if (seletorTech.value !== estado.tech) seletorTech.value = estado.tech;
    if (campoBusca.value !== estado.busca && document.activeElement !== campoBusca) {
      campoBusca.value = estado.busca;
    }
    const temFiltro = Boolean(estado.fases.size || estado.projeto || estado.tech || estado.busca);
    $('#limpar-filtros').hidden = !temFiltro;
  }

  function render() {
    const estado = lerHash();
    sincronizarControles(estado);

    const visiveis = filtrar(itensDaArea, estado);
    const chaveFiltro = JSON.stringify([...estado.fases].sort().concat(estado.projeto, estado.tech, estado.busca));
    const mudouFiltro = chaveFiltro !== ultimoEstadoFiltro;
    ultimoEstadoFiltro = chaveFiltro;

    if (mudouFiltro) {
      arvore.render(visiveis, { mostrarArea });
      gestao.render(visiveis);

      const total = itensDaArea.length;
      resumo.textContent = visiveis.length === total
        ? plural(total, 'iniciativa', 'iniciativas')
        : `${visiveis.length} de ${plural(total, 'iniciativa', 'iniciativas')}`;
      $('#arvore-vazia').hidden = visiveis.length > 0;
    }

    if (estado.aberta !== null && !Number.isNaN(estado.aberta)) {
      if (idQueAbriu !== estado.aberta) {
        idQueAbriu = estado.aberta;
        raiaAberta = '';
        detalhe.abrir(estado.aberta);
        // Depois de refiltrar a árvore já se reorganizou: não mexe no enquadramento.
        arvore.focarNo(estado.aberta, { centralizar: !mudouFiltro });
      }
    } else if (estado.resumo) {
      if (raiaAberta !== estado.resumo) {
        raiaAberta = estado.resumo;
        idQueAbriu = null;
        // O resumo respeita o filtro corrente: mostra a raia como ela está na tela.
        const daRaia = estado.resumo === 'independentes'
          ? visiveis.filter((i) => i.independente)
          : visiveis.filter((i) => i.chaveRaia === estado.resumo);
        detalhe.abrirProjeto(estado.resumo, daRaia);
      }
    } else if (detalhe.aberto) {
      detalhe.fechar();
      idQueAbriu = null;
      raiaAberta = '';
    }
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);

  // Redesenha no resize, mas só quando a largura muda de verdade.
  let larguraAnterior = containerArvore.clientWidth;
  let temporizadorResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(() => {
      const largura = containerArvore.clientWidth;
      if (Math.abs(largura - larguraAnterior) < 24) return;
      larguraAnterior = largura;
      ultimoEstadoFiltro = '';
      render();
    }, ATRASO_RESIZE);
  });

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
