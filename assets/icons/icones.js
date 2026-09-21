/**
 * Conjunto único de ícones do site.
 *
 * Todos desenhados na mesma grade de 24×24, só com traço (`fill: none`,
 * `stroke: currentColor`), espessura e cantos definidos em `.icone`, no
 * base.css. Nenhum emoji, nenhuma fonte de ícone, nenhuma dependência.
 *
 * Uso:  elemento.appendChild(icone('raio'))
 */

const NS = 'http://www.w3.org/2000/svg';

/* Cada entrada é a lista de formas do ícone: ['tag', {atributos}]. */
const FORMAS = {
  /* --- ferramentas ------------------------------------------------------ */
  raio: [['path', { d: 'M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z' }]],
  serie: [
    ['path', { d: 'M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21' }],
    ['path', { d: 'M7 15.5 11 10l3.5 3L20 6' }],
  ],
  monitor: [
    ['rect', { x: 2.5, y: 4, width: 19, height: 13, rx: 2 }],
    ['path', { d: 'M8.5 21h7M12 17v4' }],
  ],
  fluxo: [
    ['path', { d: 'M4 7h8a4 4 0 0 1 0 8H7' }],
    ['path', { d: 'M9.5 12.5 6.5 15.5l3 3' }],
    ['circle', { cx: 4, cy: 7, r: 1.6 }],
  ],
  barras: [
    ['path', { d: 'M4.5 20V12M12 20V4M19.5 20v-5' }],
  ],
  fabrica: [
    ['path', { d: 'M3 20V10.5l5.5 3.5V10.5L14 14V6.5l5.5 3V20Z' }],
    ['path', { d: 'M3 20h18' }],
  ],
  dados: [
    ['ellipse', { cx: 12, cy: 5.5, rx: 7.5, ry: 3 }],
    ['path', { d: 'M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13' }],
    ['path', { d: 'M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3' }],
  ],

  /* --- recursos --------------------------------------------------------- */
  video: [
    ['rect', { x: 2.5, y: 5, width: 14, height: 14, rx: 2 }],
    ['path', { d: 'M16.5 10.5 21.5 7.5v9l-5-3Z' }],
  ],
  documento: [
    ['path', { d: 'M14 2.5H7A2 2 0 0 0 5 4.5v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5Z' }],
    ['path', { d: 'M14 2.5V7.5H19' }],
    ['path', { d: 'M8.5 13h7M8.5 17h5' }],
  ],
  livro: [
    ['path', { d: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5Z' }],
    ['path', { d: 'M4 17.5h15' }],
  ],
  pasta: [
    ['path', { d: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H4.5A1.5 1.5 0 0 1 3 17.5Z' }],
  ],
  chat: [
    ['path', { d: 'M20.5 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-5.1A7.5 7.5 0 1 1 20.5 12Z' }],
  ],

  /* --- conceitos -------------------------------------------------------- */
  ideia: [
    ['path', { d: 'M9.5 17.5a6 6 0 1 1 5 0' }],
    ['path', { d: 'M9.5 17.5h5M10.5 20.5h3' }],
  ],
  bussola: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'm15 9-2 4.5-4.5 2 2-4.5Z' }],
  ],
  degraus: [
    ['path', { d: 'M3.5 19.5h5v-5h5v-5h5v-4' }],
  ],
  alvo: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['circle', { cx: 12, cy: 12, r: 0.8, fill: 'currentColor', stroke: 'none' }],
  ],
  troféu: [
    ['path', { d: 'M7.5 4h9v5a4.5 4.5 0 0 1-9 0Z' }],
    ['path', { d: 'M7.5 5.5H5a2 2 0 0 0 2.5 3.5M16.5 5.5H19a2 2 0 0 1-2.5 3.5' }],
    ['path', { d: 'M12 13.5V17M9 20.5h6' }],
  ],
  pessoas: [
    ['circle', { cx: 9, cy: 8, r: 3.2 }],
    ['path', { d: 'M3.5 19.5a5.5 5.5 0 0 1 11 0' }],
    ['path', { d: 'M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.6a5.5 5.5 0 0 1 3 4.9' }],
  ],

  /* --- interface -------------------------------------------------------- */
  busca: [
    ['circle', { cx: 11, cy: 11, r: 6.5 }],
    ['path', { d: 'm16 16 4.5 4.5' }],
  ],
  relogio: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['path', { d: 'M12 7.5V12l3 2' }],
  ],
  lista: [
    ['path', { d: 'M9 6.5h11M9 12h11M9 17.5h11' }],
    ['path', { d: 'M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01' }],
  ],
  calendario: [
    ['rect', { x: 3.5, y: 5, width: 17, height: 16, rx: 2 }],
    ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }],
  ],
  etiqueta: [
    ['path', { d: 'M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-6.1 6.1a2 2 0 0 1-2.8 0L4.1 12.6a2 2 0 0 1-.6-1.4Z' }],
    ['circle', { cx: 8, cy: 8, r: 1.3 }],
  ],
  seta: [['path', { d: 'M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5' }]],
  'seta-esquerda': [['path', { d: 'M19.5 12h-14M11 6.5 5.5 12l5.5 5.5' }]],
  'seta-externa': [
    ['path', { d: 'M8 16 16.5 7.5' }],
    ['path', { d: 'M9.5 7.5h7v7' }],
  ],
  externo: [
    ['path', { d: 'M13.5 4.5H19.5V10.5' }],
    ['path', { d: 'M19.5 4.5 11 13' }],
    ['path', { d: 'M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4' }],
  ],
  fechar: [['path', { d: 'm6.5 6.5 11 11M17.5 6.5l-11 11' }]],
  enviar: [
    ['path', { d: 'M20.5 3.5 10.5 13.5' }],
    ['path', { d: 'M20.5 3.5 14 20.5l-3.5-7-7-3.5Z' }],
  ],
  filtro: [['path', { d: 'M3.5 5.5h17l-6.5 7.5v6l-4 2v-8Z' }]],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
  bloqueio: [
    ['rect', { x: 4.5, y: 10.5, width: 15, height: 10, rx: 2 }],
    ['path', { d: 'M8 10.5V7a4 4 0 0 1 8 0v3.5' }],
  ],
};

/** Cria o SVG de um ícone. Nome desconhecido devolve null, nunca um quadrado vazio. */
export function icone(nome, classe = 'icone') {
  const formas = FORMAS[nome];
  if (!formas) return null;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const [tag, atributos] of formas) {
    const forma = document.createElementNS(NS, tag);
    for (const [chave, valor] of Object.entries(atributos)) {
      forma.setAttribute(chave, String(valor));
    }
    svg.appendChild(forma);
  }
  return svg;
}

export const NOMES_DE_ICONE = Object.keys(FORMAS);
