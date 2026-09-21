/**
 * Hub (hub.html): porta de entrada do roadmap digital.
 *
 * Um card por área, com o resumo vivo calculado no navegador a partir do mesmo
 * `data/initiatives.json` das páginas de área — a normalização e as derivações
 * vêm inteiras de data.js, então os números daqui são os mesmos que o gestor vê
 * ao abrir o roadmap da sua área.
 *
 * O card leva à página da área no SharePoint (`pageUrl` em config/areas.json).
 * Enquanto esse endereço não estiver preenchido, o card fica em "em breve" —
 * melhor do que um link quebrado.
 */

import { carregarPortal, FASE, formatarDataHora, plural } from './data.js';

const CIRCUNFERENCIA = 2 * Math.PI * 19; // raio 19 no viewBox 44x44

function criar(tag, classe, conteudo) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (conteudo !== undefined && conteudo !== null) node.textContent = String(conteudo);
  return node;
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

function resumoDaArea(itens) {
  const porFase = (fase) => itens.filter((i) => i.fase === fase).length;
  const entregues = porFase(FASE.ENTREGUE);
  return {
    total: itens.length,
    entregues,
    execucao: porFase(FASE.EXECUCAO),
    planejamento: porFase(FASE.PLANEJAMENTO),
    interrompidas: porFase(FASE.INTERROMPIDA),
    atrasadas: itens.filter((i) => i.atrasada).length,
    proporcao: itens.length ? entregues / itens.length : 0,
  };
}

/** Anel de entregues: o traço escuro é o que já foi concluído. */
function desenharAnel(proporcao) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'anel');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('aria-hidden', 'true');

  // Com 0% o arco não é desenhado: a ponta arredondada viraria um ponto solto
  // sobre a trilha, que se lê como "um pouquinho entregue".
  const classes = proporcao > 0 ? ['anel__trilha', 'anel__valor'] : ['anel__trilha'];
  for (const classe of classes) {
    const circulo = document.createElementNS(NS, 'circle');
    circulo.setAttribute('class', classe);
    circulo.setAttribute('cx', '22');
    circulo.setAttribute('cy', '22');
    circulo.setAttribute('r', '19');
    if (classe === 'anel__valor') {
      circulo.style.setProperty('--traco', `${(proporcao * CIRCUNFERENCIA).toFixed(2)}`);
      circulo.style.setProperty('--volta', `${CIRCUNFERENCIA.toFixed(2)}`);
    }
    svg.appendChild(circulo);
  }
  return svg;
}

function montarResumo(resumo) {
  const bloco = criar('div', 'cartao__resumo');

  const progresso = criar('div', 'cartao__progresso');
  progresso.appendChild(desenharAnel(resumo.proporcao));
  const numeros = criar('div', 'cartao__progresso-texto');
  numeros.appendChild(criar('span', 'cartao__percentual', `${Math.round(resumo.proporcao * 100)}%`));
  numeros.appendChild(criar('span', 'cartao__legenda', 'entregue'));
  progresso.appendChild(numeros);
  bloco.appendChild(progresso);

  // Contagem por fase: fase sem nenhuma iniciativa não vira rótulo vazio.
  const lista = criar('dl', 'cartao__fases');
  const linhas = [
    ['Em execução', resumo.execucao, 'execucao'],
    ['Planejamento', resumo.planejamento, 'planejamento'],
    ['Entregue', resumo.entregues, 'entregue'],
    ['Interrompida', resumo.interrompidas, 'interrompida'],
  ];
  for (const [rotulo, valor, chave] of linhas) {
    if (!valor) continue;
    const par = criar('div', `cartao__fase cartao__fase--${chave}`);
    par.appendChild(criar('dt', 'cartao__fase-rotulo', rotulo));
    par.appendChild(criar('dd', 'cartao__fase-valor', valor));
    lista.appendChild(par);
  }
  bloco.appendChild(lista);

  // Atenção só quando existe: zero não vira selo.
  if (resumo.atrasadas) {
    bloco.appendChild(criar('p', 'cartao__alerta', plural(resumo.atrasadas, 'atrasada', 'atrasadas')));
  }
  return bloco;
}

function montarCartao(area, itens, indice) {
  const temEndereco = enderecoValido(area.pageUrl);
  const cartao = document.createElement(temEndereco ? 'a' : 'div');
  cartao.className = `cartao${temEndereco ? '' : ' cartao--em-breve'}`;
  cartao.style.setProperty('--indice', String(indice));

  if (temEndereco) {
    cartao.href = area.pageUrl;
    // O hub roda dentro de um iframe: sem isso a página da área abriria
    // espremida aqui dentro, em vez de numa aba inteira.
    cartao.target = '_blank';
    cartao.rel = 'noopener';
  } else {
    cartao.setAttribute('aria-disabled', 'true');
  }

  const topo = criar('div', 'cartao__topo');
  topo.appendChild(criar('h2', 'cartao__nome', area.name));
  topo.appendChild(
    temEndereco
      ? criar('span', 'cartao__seta', '↗')
      : criar('span', 'cartao__selo', 'em breve'),
  );
  cartao.appendChild(topo);

  if (area.description) cartao.appendChild(criar('p', 'cartao__descricao', area.description));

  if (!area.ocultarEstatisticas) {
    if (itens.length) {
      cartao.appendChild(montarResumo(resumoDaArea(itens)));
    } else {
      cartao.appendChild(criar('p', 'cartao__vazio', 'Nenhuma iniciativa cadastrada ainda.'));
    }
  }

  if (temEndereco) {
    cartao.setAttribute('aria-label', `${area.name} — abrir o roadmap da área em nova aba`);
  }
  return cartao;
}

/** Brilho que segue o ponteiro. Só onde há ponteiro de verdade (ver hub.css). */
function ligarSpotlight(grade) {
  if (!window.matchMedia('(hover: hover)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  grade.addEventListener('pointermove', (evento) => {
    const cartao = evento.target.closest('.cartao');
    if (!cartao) return;
    const caixa = cartao.getBoundingClientRect();
    cartao.style.setProperty('--mx', `${evento.clientX - caixa.left}px`);
    cartao.style.setProperty('--my', `${evento.clientY - caixa.top}px`);
  });
}

async function iniciar() {
  const aviso = document.querySelector('#estado-carga');
  const portal = document.querySelector('#portal');

  let dados;
  try {
    dados = await carregarPortal();
  } catch (erro) {
    aviso.textContent = `Não foi possível carregar as áreas. ${erro.message}`;
    console.error(erro);
    return;
  }

  const { dataset, areas, site } = dados;

  document.title = `Roadmap Digital · ${site.plantName ?? 'Syensqo Itatiba'}`;
  const apoio = document.querySelector('#portal-apoio');
  const textoApoio = site.allAreasDescription
    ?? 'Acompanhe o andamento das iniciativas digitais de cada área da planta.';
  apoio.textContent = textoApoio;

  const atualizacao = formatarDataHora(dataset.atualizadoEm);
  const nodeAtualizacao = document.querySelector('#portal-atualizacao');
  if (atualizacao) nodeAtualizacao.textContent = `Dados atualizados em ${atualizacao}`;
  else nodeAtualizacao.hidden = true;

  const grade = document.querySelector('#portal-grade');
  areas.forEach((area, indice) => {
    const itens = dataset.itens.filter((i) => i.slugArea === area.slug);
    grade.appendChild(montarCartao(area, itens, indice));
  });

  ligarSpotlight(grade);

  aviso.hidden = true;
  portal.hidden = false;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
