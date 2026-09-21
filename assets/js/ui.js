/**
 * Utilitários compartilhados pelas páginas do site.
 *
 * Nada aqui conhece o conteúdo de nenhuma página: só DOM, hash, foco e
 * movimento. Todo texto entra por textContent.
 */

/** Cria um elemento. O conteúdo vai por textContent, nunca por innerHTML. */
export function criar(tag, classe, conteudo) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (conteudo !== undefined && conteudo !== null && conteudo !== '') {
    node.textContent = String(conteudo);
  }
  return node;
}

/** Link externo: sempre em nova aba e sem passar a janela de origem adiante. */
export function linkExterno(href, classe) {
  const a = criar('a', classe);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** Carrega um JSON local. Erro vira mensagem legível, não "undefined". */
export async function buscarJSON(caminho) {
  const resposta = await fetch(caminho, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Não foi possível ler ${caminho} (HTTP ${resposta.status}).`);
  }
  return resposta.json();
}

/** Minúsculas sem acento: a busca não pode depender de digitação exata. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Escolhe a forma do rótulo pelo número, sem repetir o número no texto. */
export function plural(quantidade, singular, plural_) {
  return Number(quantidade) === 1 ? singular : plural_;
}

export function debounce(fn, ms) {
  let cronometro = null;
  return (...args) => {
    clearTimeout(cronometro);
    cronometro = setTimeout(() => fn(...args), ms);
  };
}

export const movimentoReduzido = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* -------------------------------------------------------------------------- */
/* Estado na hash                                                             */
/* -------------------------------------------------------------------------- */

/** Lê a hash como pares chave=valor. `#/algo` é tratado como rota. */
export function lerHash() {
  const bruta = window.location.hash.replace(/^#/, '');
  if (bruta.startsWith('/')) return { rota: bruta.slice(1) };

  const params = new URLSearchParams(bruta);
  const estado = { rota: '' };
  for (const [chave, valor] of params) estado[chave] = valor;
  return estado;
}

/** Escreve a hash. Campo vazio some da URL em vez de virar `chave=`. */
export function escreverHash(campos, { substituir = false } = {}) {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor) params.set(chave, String(valor));
  }
  const texto = params.toString();
  const url = `${window.location.pathname}${window.location.search}${texto ? `#${texto}` : ''}`;
  if (substituir) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/* -------------------------------------------------------------------------- */
/* Movimento                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Brilho que acompanha o ponteiro nos cartões de um container.
 * Só onde há ponteiro de verdade, e nunca com movimento reduzido.
 */
export function ligarSpotlight(container, seletor = '.cartao-base') {
  if (!window.matchMedia('(hover: hover)').matches || movimentoReduzido()) return;

  container.addEventListener('pointermove', (evento) => {
    const alvo = evento.target.closest(seletor);
    if (!alvo) return;
    const caixa = alvo.getBoundingClientRect();
    alvo.style.setProperty('--mx', `${evento.clientX - caixa.left}px`);
    alvo.style.setProperty('--my', `${evento.clientY - caixa.top}px`);
  });
}

/** Conta de 0 até o valor quando o elemento entra na tela. */
export function animarContagem(elemento, valor, { sufixo = '' } = {}) {
  const alvo = Number(valor) || 0;
  if (movimentoReduzido() || !('IntersectionObserver' in window)) {
    elemento.textContent = `${alvo}${sufixo}`;
    return;
  }

  elemento.textContent = `0${sufixo}`;
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      observador.disconnect();

      const duracao = 900;
      const inicio = performance.now();
      const passo = (agora) => {
        const t = Math.min(1, (agora - inicio) / duracao);
        // Desacelera no fim, para o número "assentar" em vez de parar seco.
        const suave = 1 - Math.pow(1 - t, 3);
        elemento.textContent = `${Math.round(alvo * suave)}${sufixo}`;
        if (t < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }
  }, { threshold: 0.4 });

  observador.observe(elemento);
}

/** Rolagem suave para âncoras internas, respeitando movimento reduzido. */
export function ligarRolagemSuave(raiz = document) {
  raiz.addEventListener('click', (evento) => {
    const link = evento.target.closest('a[data-rolar]');
    if (!link) return;
    const alvo = document.querySelector(link.getAttribute('href'));
    if (!alvo) return;
    evento.preventDefault();
    alvo.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth', block: 'start' });
  });
}

/* -------------------------------------------------------------------------- */
/* Foco                                                                       */
/* -------------------------------------------------------------------------- */

const FOCAVEIS = 'a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Prende o foco dentro de um elemento sobreposto e o devolve ao fechar.
 * Retorna a função que solta o foco.
 */
export function prenderFoco(container, origem) {
  const aoTeclar = (evento) => {
    if (evento.key !== 'Tab') return;
    const focaveis = [...container.querySelectorAll(FOCAVEIS)].filter((n) => n.offsetParent !== null);
    if (!focaveis.length) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  };

  container.addEventListener('keydown', aoTeclar);
  const primeiro = container.querySelector(FOCAVEIS);
  if (primeiro) primeiro.focus();

  return () => {
    container.removeEventListener('keydown', aoTeclar);
    if (origem && document.contains(origem)) origem.focus();
  };
}
