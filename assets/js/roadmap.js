/**
 * Roadmap de uma área (index.html?area=<slug>) ou de todas (index.html).
 *
 * Estado mora na hash — dentro do iframe do SharePoint não dá para contar com
 * localStorage nem cookie. `hashchange` é a única porta de entrada do render:
 * os controles escrevem na hash, e o render lê de lá. As chaves são as de
 * sempre, para links antigos continuarem valendo:
 *
 *   #fase=execucao,planejamento  #projeto=<slug>  #tech=<slug>  #q=<texto>
 *   #i=<id> (etapa aberta)       #raia=<área::projeto> (resumo do projeto)
 */

import { carregarPortal, FASES_ORDEM, criarSlug, normalizarBusca } from './data.js';
import { montarCasca, urlTeams, urlNovaIniciativa } from './shell.js';
import { criar, plural } from './ui.js';
import { criarQuadro, classeFase } from './quadro.js';
import { criarAtencao } from './atencao.js';
import { criarGaveta } from './gaveta.js';

const FASE_POR_SLUG = new Map(FASES_ORDEM.map((f) => [criarSlug(f), f]));
const ATRASO_BUSCA = 250;
const ATRASO_RESIZE = 120;
const $ = (sel) => document.querySelector(sel);

/* -------------------------------------------------------------------------- */
/* Estado na hash                                                             */
/* -------------------------------------------------------------------------- */

function lerEstado() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const fases = (params.get('fase') || '').split(',').map((s) => FASE_POR_SLUG.get(s.trim())).filter(Boolean);
  // `i` só vale se for inteiro: `#i=abc` viraria NaN e grudaria na URL.
  const bruto = Number(params.get('i'));
  return {
    fases: new Set(fases),
    projeto: params.get('projeto') || '',
    tech: params.get('tech') || '',
    busca: params.get('q') || '',
    aberta: params.get('i') && Number.isInteger(bruto) ? bruto : null,
    resumo: params.get('raia') || '',
  };
}

function escreverEstado(parcial, { substituir = false } = {}) {
  const p = { ...lerEstado(), ...parcial };
  const params = new URLSearchParams();
  if (p.fases.size) params.set('fase', [...p.fases].map(criarSlug).join(','));
  if (p.projeto) params.set('projeto', p.projeto);
  if (p.tech) params.set('tech', p.tech);
  if (p.busca) params.set('q', p.busca);
  if (p.aberta !== null && p.aberta !== undefined) params.set('i', String(p.aberta));
  if (p.resumo) params.set('raia', p.resumo);
  const hash = params.toString();
  const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`;
  window.history[substituir ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function filtrar(itens, estado) {
  const termo = normalizarBusca(estado.busca);
  return itens.filter((i) => (!estado.fases.size || estado.fases.has(i.fase))
    && (!estado.projeto || i.slugProjeto === estado.projeto)
    && (!estado.tech || i.technologies.some((t) => criarSlug(t) === estado.tech))
    && (!termo || i.textoBusca.includes(termo)));
}

/** '2026-09-24T19:11:00Z' -> '24 SET 2026 · 16:11' (hora local). */
function dataHoraCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));
  return `${p.day} ${p.month.replace('.', '')} ${p.year} · ${p.hour}:${p.minute}`.toUpperCase();
}

/* -------------------------------------------------------------------------- */
/* Início                                                                     */
/* -------------------------------------------------------------------------- */

iniciar();

async function iniciar() {
  let portal;
  try {
    [, portal] = await Promise.all([
      montarCasca({ ativa: 'roadmaps', novaIniciativa: false, marca: 'Roadmap Digital · Transformação Digital Itatiba' }),
      carregarPortal(),
    ]);
  } catch (erro) {
    $('#estado-carga').textContent = `Não foi possível carregar os dados. ${erro.message}`;
    console.error(erro);
    return;
  }
  const { dataset, areas, site } = portal;

  /* ---- área da URL ------------------------------------------------------- */

  const pedido = new URLSearchParams(window.location.search).get('area');
  const area = pedido ? areas.find((a) => a.slug === criarSlug(pedido)) : null;
  $('#estado-carga').hidden = true;

  if (pedido && !area) {
    $('#area-invalida-texto').textContent = `O endereço desta página pede a área "${pedido}", que não existe na configuração do portal. Verifique o parâmetro ?area= do iframe.`;
    const lista = $('#area-invalida-lista');
    areas.forEach((a) => lista.appendChild(criar('li', null, `${a.slug} — ${a.name}`)));
    $('#area-invalida').hidden = false;
    return;
  }
  $('#pagina').hidden = false;

  const itensDaArea = area ? dataset.itens.filter((i) => i.slugArea === area.slug) : dataset.itens;
  const mostrarArea = !area;

  /* ---- cabeçalho --------------------------------------------------------- */

  const nome = area ? area.name : (site.allAreasLabel || 'Todas as áreas');
  document.title = `${nome} · Roadmap Digital · ${site.plantName || 'Syensqo Itatiba'}`;
  $('#area-nome').textContent = nome;
  const nProjetos = new Set(itensDaArea.map((i) => i.project)).size;
  $('#area-descricao').textContent = (area ? area.description : site.allAreasDescription)
    || `Roadmap da área · ${nProjetos} ${plural(nProjetos, 'projeto', 'projetos')} · ${itensDaArea.length} ${plural(itensDaArea.length, 'iniciativa', 'iniciativas')}`;

  const seletorArea = $('#seletor-area');
  [{ slug: '', name: site.allAreasLabel || 'Todas as áreas' }, ...areas].forEach((a) => {
    const op = criar('option', null, a.name);
    op.value = a.slug;
    seletorArea.appendChild(op);
  });
  seletorArea.value = area ? area.slug : '';
  seletorArea.addEventListener('change', () => {
    window.location.assign(seletorArea.value ? `index.html?area=${encodeURIComponent(seletorArea.value)}` : 'index.html');
  });

  if (dataset.atualizadoEm) {
    $('#atualizacao-texto').textContent = `Atualizado ${dataHoraCurta(dataset.atualizadoEm)}`;
    $('#atualizacao').hidden = false;
  }

  const nova = $('#botao-nova');
  nova.href = urlNovaIniciativa(site);
  $('#botao-nova-rotulo').textContent = site.newInitiative?.label ?? 'Nova iniciativa';
  const teams = $('#botao-teams');
  teams.href = urlTeams(site, `${site.teams?.message ?? ''} as iniciativas digitais ${area ? `da área ${area.name}` : 'do site'}.`.trim());
  teams.textContent = site.teams?.label ?? 'Falar com o Digital';

  /* ---- filtros ------------------------------------------------------------- */

  const chips = $('#filtro-fases');
  for (const fase of FASES_ORDEM) {
    const n = itensDaArea.filter((i) => i.fase === fase).length;
    if (!n) continue;
    const chip = criar('button', `rd-fase rd-fase--${classeFase(fase)}`);
    chip.type = 'button';
    chip.dataset.fase = criarSlug(fase);
    chip.setAttribute('aria-pressed', 'false');
    chip.append(criar('span', 'rd-fase__ponto'), criar('span', null, fase), criar('span', 'rd-fase__n', n));
    chip.addEventListener('click', () => {
      const fases = new Set(lerEstado().fases);
      const alvo = FASE_POR_SLUG.get(chip.dataset.fase);
      if (fases.has(alvo)) fases.delete(alvo);
      else fases.add(alvo);
      escreverEstado({ fases });
    });
    chips.appendChild(chip);
  }

  const preencher = (seletor, valores, vazio) => {
    seletor.textContent = '';
    const op = criar('option', null, vazio);
    op.value = '';
    seletor.appendChild(op);
    valores.forEach(({ valor, rotulo }) => {
      const o = criar('option', null, rotulo);
      o.value = valor;
      seletor.appendChild(o);
    });
  };
  const seletorProjeto = $('#filtro-projeto');
  const seletorTech = $('#filtro-tech');
  const campoBusca = $('#filtro-busca');
  preencher(seletorProjeto, [...new Map(itensDaArea.map((i) => [i.slugProjeto, i.project])).entries()]
    .map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')), 'Todos os projetos');
  preencher(seletorTech, [...new Set(itensDaArea.flatMap((i) => i.technologies))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')).map((t) => ({ valor: criarSlug(t), rotulo: t })), 'Todas as tecnologias');

  seletorProjeto.addEventListener('change', () => escreverEstado({ projeto: seletorProjeto.value }));
  seletorTech.addEventListener('change', () => escreverEstado({ tech: seletorTech.value }));
  // Busca: debounce + replaceState, para não gerar uma entrada de histórico por tecla.
  let esperaBusca = null;
  campoBusca.addEventListener('input', () => {
    clearTimeout(esperaBusca);
    esperaBusca = setTimeout(() => escreverEstado({ busca: campoBusca.value.trim() }, { substituir: true }), ATRASO_BUSCA);
  });
  const limpar = () => escreverEstado({ fases: new Set(), projeto: '', tech: '', busca: '' });
  $('#limpar-filtros').addEventListener('click', limpar);
  document.querySelector('[data-limpar]').addEventListener('click', limpar);

  /* ---- componentes ----------------------------------------------------------- */

  const secaoQuadro = $('#quadro');
  const palco = $('#palco');
  let origemFoco = null;      // elemento que abriu o painel, para devolver o foco
  let opcoesAbertura = {};    // como o próximo painel foi aberto (navegando/voltando)

  const quadro = criarQuadro({
    palco,
    dataset,
    aoAbrirDetalhe: (id, el) => {
      origemFoco = el;
      escreverEstado({ aberta: id, resumo: '' });
    },
    aoAbrirProjeto: (raia) => {
      origemFoco = document.activeElement;
      escreverEstado({ resumo: raia.chave, aberta: null });
    },
    aoAtualizar: ({ escala, arrastavel, min, max }) => {
      $('#zoom-valor').textContent = `${Math.round(escala * 100)}%`;
      document.querySelector('[data-acao="menos"]').disabled = min;
      document.querySelector('[data-acao="mais"]').disabled = max;
      $('#quadro-dica').textContent = arrastavel
        ? 'Arraste para navegar · Ctrl + rolagem para zoom'
        : 'Passe o mouse para ver a cadeia · duplo clique centraliza';
    },
  });

  const atencao = criarAtencao({
    container: $('#atencao'),
    dataset,
    aoAbrir: (id, el) => {
      origemFoco = el;
      opcoesAbertura = { focar: true };
      escreverEstado({ aberta: id, resumo: '' });
    },
    aoDestacar: (id) => quadro.destacar(id),
  });

  const gaveta = criarGaveta({
    raiz: $('#gaveta'),
    dataset,
    site,
    aoAbrirItem: (id, opcoes = {}) => {
      // Veio do painel: a etapa pode estar longe na tela, então enquadra.
      opcoesAbertura = { ...opcoes, focar: true };
      escreverEstado({ aberta: id, resumo: '' });
    },
    aoAbrirProjeto: (chave, opcoes = {}) => {
      opcoesAbertura = opcoes;
      escreverEstado({ resumo: chave, aberta: null });
    },
    aoFechar: () => escreverEstado({ aberta: null, resumo: '' }, { substituir: true }),
    aoDestacar: (id) => quadro.destacar(id),
  });

  document.querySelector('[data-acao="centralizar"]').addEventListener('click', () => quadro.centralizar());
  document.querySelector('[data-acao="mais"]').addEventListener('click', () => quadro.zoomMais());
  document.querySelector('[data-acao="menos"]').addEventListener('click', () => quadro.zoomMenos());

  /* Ampliar: o quadro ocupa a área visível do iframe — por CSS, porque a API
     de tela cheia costuma ser bloqueada dentro de iframe. */
  const botaoAmpliar = document.querySelector('[data-acao="ampliar"]');
  const definirAmpliado = (ativo) => {
    secaoQuadro.classList.toggle('quadro--ampliado', ativo);
    document.documentElement.classList.toggle('com-quadro-ampliado', ativo);
    botaoAmpliar.setAttribute('aria-pressed', String(ativo));
    botaoAmpliar.querySelector('span').textContent = ativo ? 'Reduzir' : 'Ampliar';
    botaoAmpliar.querySelector('path').setAttribute('d', ativo ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5');
    ultimoFiltro = '';
    render();
  };
  botaoAmpliar.addEventListener('click', () => definirAmpliado(!secaoQuadro.classList.contains('quadro--ampliado')));

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (gaveta.aberta) {
      ev.preventDefault();
      gaveta.esconder();
      escreverEstado({ aberta: null, resumo: '' }, { substituir: true });
    } else if (secaoQuadro.classList.contains('quadro--ampliado')) {
      ev.preventDefault();
      definirAmpliado(false);
    }
  });

  /* ---- render --------------------------------------------------------------- */

  let ultimoFiltro = '';
  let abertoAgora = null;

  function sincronizar(estado) {
    chips.querySelectorAll('.rd-fase').forEach((c) => {
      c.setAttribute('aria-pressed', String(estado.fases.has(FASE_POR_SLUG.get(c.dataset.fase))));
    });
    if (seletorProjeto.value !== estado.projeto) seletorProjeto.value = estado.projeto;
    if (seletorTech.value !== estado.tech) seletorTech.value = estado.tech;
    seletorProjeto.classList.toggle('ativo', Boolean(estado.projeto));
    seletorTech.classList.toggle('ativo', Boolean(estado.tech));
    if (campoBusca.value !== estado.busca && document.activeElement !== campoBusca) campoBusca.value = estado.busca;
    $('#limpar-filtros').hidden = !(estado.fases.size || estado.projeto || estado.tech || estado.busca);
  }

  function render() {
    const estado = lerEstado();
    sincronizar(estado);
    const visiveis = filtrar(itensDaArea, estado);
    const chave = JSON.stringify([...estado.fases].sort().concat(estado.projeto, estado.tech, estado.busca));
    const mudou = chave !== ultimoFiltro;
    ultimoFiltro = chave;

    if (mudou) {
      quadro.render(visiveis, { mostrarArea });
      atencao.render(visiveis);
      $('#resumo-filtro').textContent = `${visiveis.length} de ${itensDaArea.length} ${plural(itensDaArea.length, 'iniciativa', 'iniciativas')}`;
      $('#quadro-vazio').hidden = visiveis.length > 0;
      palco.hidden = visiveis.length === 0;
      const l = quadro.layout;
      $('#resumo-arvore').textContent = l ? `${l.raias.length} ${plural(l.raias.length, 'raia', 'raias')} · ${l.nos.size} ${plural(l.nos.size, 'etapa', 'etapas')}` : '';
    }

    const opcoes = opcoesAbertura;
    opcoesAbertura = {};
    if (estado.aberta !== null) {
      const chaveAberta = `i:${estado.aberta}`;
      if (abertoAgora !== chaveAberta) {
        abertoAgora = chaveAberta;
        if (gaveta.mostrarItem(estado.aberta, opcoes)) {
          quadro.selecionar(estado.aberta);
          // Clique no próprio card não precisa enquadrar: ele já está à vista.
          if (opcoes.focar) quadro.focarNo(estado.aberta);
        }
      }
    } else if (estado.resumo) {
      const chaveAberta = `r:${estado.resumo}`;
      if (abertoAgora !== chaveAberta) {
        abertoAgora = chaveAberta;
        quadro.selecionar(null);
        // O resumo respeita o filtro corrente: mostra a raia como ela está na tela.
        const daRaia = estado.resumo === 'independentes'
          ? (quadro.layout?.raias.find((r) => r.chave === 'independentes')?.itens ?? [])
          : visiveis.filter((i) => i.chaveRaia === estado.resumo);
        gaveta.mostrarProjeto(estado.resumo, daRaia, opcoes);
      }
    } else if (abertoAgora) {
      abertoAgora = null;
      quadro.selecionar(null);
      if (gaveta.aberta) gaveta.esconder();
      if (origemFoco && document.contains(origemFoco)) origemFoco.focus({ preventScroll: true });
      origemFoco = null;
    }
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);

  // Redesenha no resize, mas só quando a largura muda de verdade.
  let larguraAnterior = palco.clientWidth;
  let esperaResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(esperaResize);
    esperaResize = setTimeout(() => {
      const largura = palco.clientWidth;
      if (Math.abs(largura - larguraAnterior) < 24) return;
      larguraAnterior = largura;
      ultimoFiltro = '';
      render();
    }, ATRASO_RESIZE);
  });

  render();
  // Item vindo de link (#i=…): enquadra depois do primeiro desenho.
  const inicial = lerEstado();
  if (inicial.aberta !== null) requestAnimationFrame(() => quadro.focarNo(inicial.aberta));
}

