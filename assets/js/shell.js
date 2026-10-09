/**
 * Casca compartilhada por todas as páginas: navegação em pílula, rodapé,
 * revelação ao rolar e fio de progresso de leitura.
 *
 * Os links de "Nova iniciativa" e do Teams vêm de config/site.json — nunca
 * escritos aqui. Todo texto entra por textContent.
 */

import { criar, linkExterno, buscarJSON, movimentoReduzido } from './ui.js';

const PAGINAS = [
  { id: 'inicio', rotulo: 'Início', href: 'home.html' },
  { id: 'roadmaps', rotulo: 'Roadmaps', href: 'hub.html' },
  { id: 'indicadores', rotulo: 'Indicadores', href: 'indicadores.html' },
  { id: 'academia', rotulo: 'Academia', href: 'academia.html' },
  { id: 'noticias', rotulo: 'Notícias', href: 'noticias.html' },
];

let promessaSite = null;

/** config/site.json, lido uma vez por página. Falha vira objeto vazio. */
export function carregarSite() {
  if (!promessaSite) {
    promessaSite = buscarJSON('config/site.json').catch((erro) => {
      console.warn(`[casca] ${erro.message}`);
      return {};
    });
  }
  return promessaSite;
}

/** URL de chat do Teams com mensagem pronta, a partir de config/site.json. */
export function urlTeams(site, mensagem) {
  const email = site?.teams?.email ?? '';
  const texto = mensagem ?? site?.teams?.message ?? '';
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}&message=${encodeURIComponent(texto)}`;
}

/** URL do formulário de nova iniciativa. */
export function urlNovaIniciativa(site) {
  return site?.newInitiative?.url || '#';
}

/* -------------------------------------------------------------------------- */
/* Navegação                                                                  */
/* -------------------------------------------------------------------------- */

function montarNav(ativa, comNovaIniciativa, site) {
  const header = criar('header', 'nav');
  const pilula = criar('nav', 'nav__pilula');
  pilula.setAttribute('aria-label', 'Seções do portal');

  for (const pagina of PAGINAS) {
    const link = criar('a', 'nav__link', pagina.rotulo);
    link.href = pagina.href;
    if (pagina.id === ativa) link.setAttribute('aria-current', 'page');
    pilula.appendChild(link);
  }

  if (comNovaIniciativa) {
    const cta = linkExterno(urlNovaIniciativa(site), 'nav__link nav__link--cta');
    cta.textContent = site?.newInitiative?.label ?? 'Nova iniciativa';
    pilula.appendChild(cta);
  }

  header.appendChild(pilula);
  document.body.prepend(header);

  // No celular a pílula rola na horizontal: o item atual fica à vista.
  const atual = pilula.querySelector('[aria-current]');
  if (atual && pilula.scrollWidth > pilula.clientWidth) {
    pilula.scrollLeft = atual.offsetLeft - (pilula.clientWidth - atual.offsetWidth) / 2;
  }
}

/* -------------------------------------------------------------------------- */
/* Rodapé                                                                     */
/* -------------------------------------------------------------------------- */

function montarRodape(tipo, marca, site) {
  const rodape = criar('footer', `rodape rodape--${tipo}`);
  const conteudo = criar('div', 'rodape__conteudo');
  const copy = criar('span', 'rodape__copy', `© ${new Date().getFullYear()} SYENSQO · ITATIBA`);

  if (tipo === 'simples') {
    conteudo.append(criar('span', 'rodape__marca', marca), copy);
  } else {
    const grade = criar('div', 'rodape__grade');
    const sobre = criar('div');
    sobre.append(
      criar('div', 'rodape__titulo', 'Transformação Digital · Itatiba'),
      criar('p', 'rodape__texto', 'Portal interno da Syensqo Itatiba.'),
    );

    const colunas = criar('div', 'rodape__colunas');
    const portal = criar('div', 'rodape__coluna');
    portal.appendChild(criar('span', 'rodape__rotulo', 'PORTAL'));
    for (const pagina of PAGINAS.slice(1)) {
      const link = criar('a', 'rodape__link', pagina.id === 'academia' ? 'Academia Digital' : pagina.rotulo);
      link.href = pagina.href;
      portal.appendChild(link);
    }

    const contato = criar('div', 'rodape__coluna');
    contato.appendChild(criar('span', 'rodape__rotulo', 'CONTATO'));
    const nova = linkExterno(urlNovaIniciativa(site), 'rodape__link');
    nova.textContent = 'Nova iniciativa';
    const teams = linkExterno(urlTeams(site), 'rodape__link');
    teams.textContent = 'Canal no Teams';
    contato.append(nova, teams);

    colunas.append(portal, criar('span'), contato);
    colunas.lastElementChild.previousElementSibling.setAttribute('aria-hidden', 'true');
    grade.append(sobre, colunas);
    conteudo.append(grade, copy);
  }

  rodape.appendChild(conteudo);
  document.body.appendChild(rodape);
}

/* -------------------------------------------------------------------------- */
/* Efeitos de rolagem                                                         */
/* -------------------------------------------------------------------------- */

let observador = null;
let viuAlgo = false;

/**
 * Revela os elementos [data-revelar] que entram na tela, em cascata pela
 * ordem de leitura (linha → coluna) dentro de cada grupo de irmãos.
 * Pode ser chamada de novo depois de um render: só pega o que é novo.
 */
export function revelar(raiz = document) {
  const alvos = [...raiz.querySelectorAll('[data-revelar]:not([data-revelar-visto])')];
  if (!alvos.length) return;

  if (!document.documentElement.classList.contains('fx')) {
    alvos.forEach((el) => el.removeAttribute('data-revelar'));
    return;
  }

  // Atraso em cascata: colunas da mesma linha entram em sequência.
  const grupos = new Map();
  alvos.forEach((el) => {
    const pai = el.parentElement;
    if (!grupos.has(pai)) grupos.set(pai, []);
    grupos.get(pai).push(el);
  });
  for (const irmaos of grupos.values()) {
    const caixas = irmaos.map((el) => ({ el, r: el.getBoundingClientRect() }));
    caixas.sort((a, b) => (Math.abs(a.r.top - b.r.top) > 40 ? a.r.top - b.r.top : a.r.left - b.r.left));
    let topoLinha = null;
    let coluna = 0;
    let linha = 0;
    for (const { el, r } of caixas) {
      if (topoLinha === null || Math.abs(r.top - topoLinha) > 40) { topoLinha = r.top; coluna = 0; linha += 1; } else coluna += 1;
      el.style.setProperty('--atraso', `${(coluna * 0.09 + (linha > 1 ? 0.04 : 0)).toFixed(2)}s`);
    }
  }

  alvos.forEach((el) => {
    el.setAttribute('data-revelar-visto', '');
    observador.observe(el);
  });
}

function mostrar(el) {
  if (el.classList.contains('revelado')) return;
  el.classList.add('revelado');
  const atraso = parseFloat(el.style.getPropertyValue('--atraso')) || 0;
  window.setTimeout(() => {
    el.classList.remove('revelado');
    el.removeAttribute('data-revelar');
    el.style.removeProperty('--atraso');
  }, (1.05 + atraso) * 1000 + 80);
}

function ligarEfeitos() {
  if (movimentoReduzido() || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('fx');

  observador = new IntersectionObserver((entradas) => {
    viuAlgo = true;
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      mostrar(entrada.target);
      observador.unobserve(entrada.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  // Iframe em segundo plano não recebe callbacks: mostra tudo.
  window.setTimeout(() => {
    if (viuAlgo) return;
    document.querySelectorAll('[data-revelar]').forEach(mostrar);
  }, 1600);

  // Fio de progresso de leitura.
  const fio = criar('div', 'fio-progresso');
  fio.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fio);
  let pendente = false;
  const atualizar = () => {
    pendente = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    fio.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  };
  window.addEventListener('scroll', () => {
    if (pendente) return;
    pendente = true;
    window.requestAnimationFrame(atualizar);
  }, { passive: true });
  atualizar();
}

/**
 * Marca o elemento com `.em-cena` quando ele aparece na tela — é o gatilho
 * das transições dos gráficos (barras crescendo, bolhas inflando). Sem
 * IntersectionObserver, com movimento reduzido ou em iframe sem callbacks,
 * entra direto no estado final.
 */
export function entrarEmCena(el) {
  if (!el) return;
  if (movimentoReduzido() || !('IntersectionObserver' in window)) {
    el.classList.add('em-cena');
    return;
  }
  const io = new IntersectionObserver((entradas) => {
    if (!entradas.some((e) => e.isIntersecting)) return;
    io.disconnect();
    // Um quadro de folga para a transição partir do estado inicial.
    window.requestAnimationFrame(() => el.classList.add('em-cena'));
  }, { threshold: 0.2 });
  io.observe(el);
  window.setTimeout(() => {
    if (el.classList.contains('em-cena')) return;
    io.disconnect();
    el.classList.add('em-cena');
  }, 2600);
}

/* -------------------------------------------------------------------------- */
/* Montagem                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Monta a casca da página. Devolve o config/site.json para quem precisar
 * dos mesmos links (Teams, nova iniciativa).
 *
 * @param {object} opcoes
 * @param {string} opcoes.ativa        id da página atual na navegação
 * @param {'completo'|'simples'} [opcoes.rodape]
 * @param {string} [opcoes.marca]      texto do rodapé simples
 * @param {boolean} [opcoes.novaIniciativa] mostra o botão na pílula
 */
export async function montarCasca({ ativa, rodape = 'simples', marca = 'Transformação Digital Itatiba', novaIniciativa = true } = {}) {
  const site = await carregarSite();
  montarNav(ativa, novaIniciativa, site);
  montarRodape(rodape, marca, site);
  ligarEfeitos();
  return site;
}
