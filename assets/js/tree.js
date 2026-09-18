/**
 * Árvore de dependências em SVG, sem biblioteca de grafos.
 *
 * O layout é calculado em três modos, escolhidos pela largura útil:
 *   horizontal  — a raia inteira cabe numa linha, fluindo da esquerda para a direita
 *   serpentina  — a cadeia quebra em zigue-zague, com conector curvo de continuidade
 *   vertical    — abaixo de ~600px, cada iniciativa vira um card de largura total
 *
 * Coordenadas: todo nó é posicionado em espaço absoluto do SVG (as raias são
 * apenas faixas com deslocamento vertical), então uma aresta entre raias — como
 * a 19 -> 15 em Confiabilidade — é desenhada como qualquer outra.
 *
 * Zoom: o SVG tem viewBox do tamanho do conteúdo e width/height em pixels
 * multiplicados pela escala. Em escala 1 o conteúdo sempre cabe na largura, e o
 * container só rola na vertical — nada de rolagem horizontal infinita.
 */

import { FASE, criarSlug, plural } from './data.js';

const NS = 'http://www.w3.org/2000/svg';

/* Métricas do layout (espelham os tokens de assets/css/tokens.css). */
const M = {
  noLargura: 200,
  noAltura: 88,
  gapX: 56,
  gapY: 16,
  raiaCabecalho: 52,
  raiaCabecalhoVertical: 74,
  raiaEspaco: 36,
  padding: 16,
  verticalAltura: 78,
  verticalGap: 30,
  verticalCalha: 22,
  limiteVertical: 600,
  escalaMin: 0.5,
  escalaMax: 2.2,
  passoZoom: 0.2,
};

const FASE_CLASSE = {
  [FASE.PLANEJAMENTO]: 'planejamento',
  [FASE.EXECUCAO]: 'execucao',
  [FASE.ENTREGUE]: 'entregue',
  [FASE.INTERROMPIDA]: 'interrompida',
};

/* -------------------------------------------------------------------------- */
/* Utilidades de SVG e de texto                                                */
/* -------------------------------------------------------------------------- */

function el(nome, atributos = {}) {
  const node = document.createElementNS(NS, nome);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor !== null && valor !== undefined) node.setAttribute(chave, String(valor));
  }
  return node;
}

/** Texto sempre por textContent — nenhuma string de dado vira HTML. */
function texto(node, valor) {
  node.textContent = valor;
  return node;
}

let contexto2d = null;
const cacheMedida = new Map();

function medirTexto(str, fonte) {
  const chave = `${fonte}|${str}`;
  const emCache = cacheMedida.get(chave);
  if (emCache !== undefined) return emCache;
  if (!contexto2d) contexto2d = document.createElement('canvas').getContext('2d');
  contexto2d.font = fonte;
  const largura = contexto2d.measureText(str).width;
  cacheMedida.set(chave, largura);
  return largura;
}

/**
 * Quebra o título em no máximo `maxLinhas` linhas, com reticências na última.
 * O título completo continua disponível no <title> do nó.
 */
function quebrarTitulo(titulo, larguraMax, fonte, maxLinhas = 2) {
  const palavras = titulo.split(' ');
  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (medirTexto(tentativa, fonte) <= larguraMax || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = palavra;
      if (linhas.length === maxLinhas) break;
    }
  }
  if (linhas.length < maxLinhas && atual) linhas.push(atual);

  const sobrou = linhas.join(' ').length < titulo.length;
  if (sobrou && linhas.length) {
    let ultima = linhas[maxLinhas - 1] ?? linhas[linhas.length - 1];
    while (ultima.length > 1 && medirTexto(`${ultima}…`, fonte) > larguraMax) {
      ultima = ultima.slice(0, -1).trimEnd();
    }
    linhas[linhas.length - 1] = `${ultima}…`;
  }
  return linhas.slice(0, maxLinhas);
}

/* -------------------------------------------------------------------------- */
/* Montagem das raias                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Agrupa os itens visíveis em raias (área + projeto) e separa a faixa
 * "Independentes": projeto cujas iniciativas são todas independentes continua
 * sendo raia; só o item isolado dentro de projeto com cadeia cai na faixa.
 */
function montarRaias(itens, mostrarArea) {
  const grupos = new Map();
  for (const item of itens) {
    if (!grupos.has(item.chaveRaia)) {
      grupos.set(item.chaveRaia, { chave: item.chaveRaia, projeto: item.project, area: item.area, itens: [] });
    }
    grupos.get(item.chaveRaia).itens.push(item);
  }

  const raias = [];
  const soltos = [];
  for (const grupo of grupos.values()) {
    const todosIndependentes = grupo.itens.every((i) => i.independente);
    if (todosIndependentes) {
      raias.push({ ...grupo, tipo: 'projeto' });
    } else {
      const comCadeia = grupo.itens.filter((i) => !i.independente);
      if (comCadeia.length) raias.push({ ...grupo, itens: comCadeia, tipo: 'projeto' });
      soltos.push(...grupo.itens.filter((i) => i.independente));
    }
  }

  // Ordem base: por área (quando o portal mostra várias) e, dentro dela, as
  // cadeias maiores primeiro — a leitura começa pelo que tem mais história.
  raias.sort((a, b) => {
    if (mostrarArea && a.area !== b.area) return a.area.localeCompare(b.area, 'pt-BR');
    if (b.itens.length !== a.itens.length) return b.itens.length - a.itens.length;
    return a.projeto.localeCompare(b.projeto, 'pt-BR');
  });

  const ordenadas = ordenarRaiasPorDependencia(raias);

  if (soltos.length) {
    soltos.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    ordenadas.push({ chave: 'independentes', projeto: 'Independentes', area: null, itens: soltos, tipo: 'independentes' });
  }
  return ordenadas;
}

/**
 * Reordena as raias para que uma aresta entre projetos desça em vez de subir,
 * e para que raias ligadas fiquem vizinhas — assim a linha não atravessa o
 * rótulo de um projeto que nada tem a ver com aquela cadeia.
 *
 * Raias conectadas formam um bloco (componente), ordenado topologicamente
 * dentro dele; os blocos mantêm a ordem base entre si.
 */
function ordenarRaiasPorDependencia(raias) {
  if (raias.length < 2) return raias;

  const raiaDoItem = new Map();
  raias.forEach((raia, indice) => {
    for (const item of raia.itens) raiaDoItem.set(item.id, indice);
  });

  const depois = raias.map(() => new Set()); // origem -> destinos
  const grau = raias.map(() => 0);
  const vizinhos = raias.map(() => new Set()); // não-direcionado, para os componentes

  raias.forEach((raia, destino) => {
    for (const item of raia.itens) {
      for (const idDep of item.deps) {
        const origem = raiaDoItem.get(idDep);
        if (origem === undefined || origem === destino) continue;
        if (!depois[origem].has(destino)) {
          depois[origem].add(destino);
          grau[destino]++;
        }
        vizinhos[origem].add(destino);
        vizinhos[destino].add(origem);
      }
    }
  });

  // Componentes na ordem base.
  const componenteDe = new Array(raias.length).fill(-1);
  const componentes = [];
  for (let inicio = 0; inicio < raias.length; inicio++) {
    if (componenteDe[inicio] !== -1) continue;
    const atual = [];
    const fila = [inicio];
    componenteDe[inicio] = componentes.length;
    while (fila.length) {
      const no = fila.shift();
      atual.push(no);
      for (const vizinho of vizinhos[no]) {
        if (componenteDe[vizinho] === -1) {
          componenteDe[vizinho] = componentes.length;
          fila.push(vizinho);
        }
      }
    }
    componentes.push(atual.sort((a, b) => a - b));
  }

  // Kahn dentro de cada componente, desempatando pela ordem base.
  const saida = [];
  for (const componente of componentes) {
    const restante = new Set(componente);
    const grauLocal = new Map(componente.map((i) => [i, 0]));
    for (const origem of componente) {
      for (const destino of depois[origem]) {
        if (restante.has(destino)) grauLocal.set(destino, grauLocal.get(destino) + 1);
      }
    }

    const prontos = componente.filter((i) => grauLocal.get(i) === 0);
    while (prontos.length) {
      prontos.sort((a, b) => a - b);
      const atual = prontos.shift();
      restante.delete(atual);
      saida.push(raias[atual]);
      for (const destino of depois[atual]) {
        if (!restante.has(destino)) continue;
        grauLocal.set(destino, grauLocal.get(destino) - 1);
        if (grauLocal.get(destino) === 0) prontos.push(destino);
      }
    }
    // Sobrou algo (ciclo entre raias): entra na ordem base, sem travar o render.
    for (const indice of [...restante].sort((a, b) => a - b)) saida.push(raias[indice]);
  }

  return saida;
}

/**
 * Nível topológico dentro da raia: caminho mais longo pelas dependências do
 * mesmo grupo. Níveis sem nenhum item visível são compactados, para o filtro
 * não deixar coluna vazia no meio da cadeia.
 */
function calcularNiveis(itensDaRaia) {
  const visiveis = new Set(itensDaRaia.map((i) => i.id));
  const cache = new Map();

  const nivelDe = (item) => {
    if (cache.has(item.id)) return cache.get(item.id);
    cache.set(item.id, 0); // guarda contra recursão em dado inesperado
    const paisVisiveis = item.deps.filter((d) => visiveis.has(d));
    let nivel = 0;
    for (const idPai of paisVisiveis) {
      const pai = itensDaRaia.find((x) => x.id === idPai);
      if (pai) nivel = Math.max(nivel, nivelDe(pai) + 1);
    }
    cache.set(item.id, nivel);
    return nivel;
  };

  for (const item of itensDaRaia) nivelDe(item);

  const usados = [...new Set([...cache.values()])].sort((a, b) => a - b);
  const compacto = new Map(usados.map((n, indice) => [n, indice]));
  const porNivel = usados.map(() => []);
  for (const item of itensDaRaia) {
    const nivel = compacto.get(cache.get(item.id));
    porNivel[nivel].push(item);
  }

  // Ordem dentro da coluna: média da posição dos pais (reduz cruzamento de arestas).
  const posicao = new Map();
  porNivel.forEach((coluna, indiceNivel) => {
    if (indiceNivel > 0) {
      coluna.sort((a, b) => {
        const media = (item) => {
          const pais = item.deps.filter((d) => posicao.has(d)).map((d) => posicao.get(d));
          return pais.length ? pais.reduce((s, v) => s + v, 0) / pais.length : Number.MAX_SAFE_INTEGER;
        };
        return media(a) - media(b) || a.id - b.id;
      });
    } else {
      coluna.sort((a, b) => a.id - b.id);
    }
    coluna.forEach((item, indice) => posicao.set(item.id, indice));
  });

  return porNivel;
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Calcula posições absolutas de todos os nós e os metadados das raias.
 * Devolve { modo, largura, altura, nos: Map<id, caixa>, raias: [...] }.
 */
function calcularLayout(raias, larguraUtil) {
  const vertical = larguraUtil < M.limiteVertical;
  const nos = new Map();
  const raiasLayout = [];

  const larguraNo = vertical
    ? Math.max(220, larguraUtil - M.padding * 2 - M.verticalCalha)
    : M.noLargura;
  const alturaNo = vertical ? M.verticalAltura : M.noAltura;

  const colunasPorLinha = vertical
    ? 1
    : Math.max(1, Math.floor((larguraUtil - M.padding * 2 + M.gapX) / (larguraNo + M.gapX)));

  let y = M.padding;
  let larguraMax = 0;

  // Em coluna única o cabeçalho é mais alto: a barra segmentada ganha uma
  // linha só para ela, em vez de espremer um segmento por iniciativa num canto.
  const alturaCabecalho = vertical ? M.raiaCabecalhoVertical : M.raiaCabecalho;

  for (const raia of raias) {
    const topoRaia = y;
    y += alturaCabecalho;

    const independentes = raia.tipo === 'independentes';
    // A faixa "Independentes" não tem cadeia: vira uma grade simples.
    const colunas = independentes
      ? raia.itens.map((item) => [item])
      : calcularNiveis(raia.itens);

    if (vertical) {
      // Empilhamento: ordem topológica achatada, um card por linha.
      const ordenados = colunas.flat();
      ordenados.forEach((item, indice) => {
        nos.set(item.id, {
          item,
          x: M.padding + M.verticalCalha,
          y: y + indice * (alturaNo + M.verticalGap),
          largura: larguraNo,
          altura: alturaNo,
          linha: indice,
          coluna: 0,
          sentido: 1,
        });
      });
      y += ordenados.length * (alturaNo + M.verticalGap) - M.verticalGap;
      larguraMax = Math.max(larguraMax, M.padding + M.verticalCalha + larguraNo + M.padding);
    } else {
      // Serpentina: as colunas são empacotadas em linhas que alternam o sentido.
      const linhas = [];
      for (let inicio = 0; inicio < colunas.length; inicio += colunasPorLinha) {
        linhas.push(colunas.slice(inicio, inicio + colunasPorLinha));
      }

      linhas.forEach((colunasDaLinha, indiceLinha) => {
        const sentido = indiceLinha % 2 === 0 ? 1 : -1;
        const alturaLinha = Math.max(
          ...colunasDaLinha.map((c) => c.length * (alturaNo + M.gapY) - M.gapY),
        );

        colunasDaLinha.forEach((coluna, indiceColuna) => {
          // A linha invertida se alinha pela capacidade da faixa, não pelo que
          // sobrou nela: é isso que faz a serpentina continuar de onde a linha
          // de cima parou, em vez de recomeçar na margem esquerda.
          const posicaoVisual = sentido === 1 ? indiceColuna : colunasPorLinha - 1 - indiceColuna;
          const x = M.padding + posicaoVisual * (larguraNo + M.gapX);
          const alturaColuna = coluna.length * (alturaNo + M.gapY) - M.gapY;
          const topoColuna = y + (alturaLinha - alturaColuna) / 2;

          coluna.forEach((item, indiceNaColuna) => {
            nos.set(item.id, {
              item,
              x,
              y: topoColuna + indiceNaColuna * (alturaNo + M.gapY),
              largura: larguraNo,
              altura: alturaNo,
              linha: indiceLinha,
              coluna: indiceColuna,
              sentido,
            });
          });
          larguraMax = Math.max(larguraMax, x + larguraNo + M.padding);
        });

        y += alturaLinha + (indiceLinha < linhas.length - 1 ? M.gapY * 2.5 : 0);
      });
    }

    raiasLayout.push({
      ...raia,
      topo: topoRaia,
      base: y,
      altura: y - topoRaia,
    });
    y += M.raiaEspaco;
  }

  return {
    modo: vertical ? 'vertical' : colunasPorLinha >= 2 ? 'horizontal' : 'estreito',
    vertical,
    alturaCabecalho,
    largura: Math.max(larguraUtil, larguraMax),
    altura: Math.max(y, 120),
    nos,
    raias: raiasLayout,
    colunasPorLinha,
    larguraNo,
  };
}

/* -------------------------------------------------------------------------- */
/* Arestas                                                                     */
/* -------------------------------------------------------------------------- */

/** Caminho de uma aresta entre dois nós já posicionados. */
function caminhoAresta(origem, destino, vertical) {
  if (vertical) {
    const xCalha = origem.x - M.verticalCalha / 2;
    const yOrigem = origem.y + origem.altura;
    const yDestino = destino.y;
    const adjacente = destino.linha - origem.linha === 1;
    if (adjacente) {
      const meio = origem.x + origem.largura / 2;
      return `M ${meio} ${yOrigem} L ${meio} ${yDestino}`;
    }
    // Dependência distante: curva pela calha à esquerda da pilha.
    return [
      `M ${origem.x} ${origem.y + origem.altura / 2}`,
      `C ${xCalha} ${origem.y + origem.altura / 2} ${xCalha} ${yOrigem} ${xCalha} ${yOrigem + 8}`,
      `L ${xCalha} ${destino.y + destino.altura / 2 - 8}`,
      `C ${xCalha} ${destino.y + destino.altura / 2} ${xCalha} ${destino.y + destino.altura / 2} ${destino.x} ${destino.y + destino.altura / 2}`,
    ].join(' ');
  }

  const mesmaLinha = origem.linha === destino.linha;
  const saidaX = origem.sentido === 1 ? origem.x + origem.largura : origem.x;
  const entradaX = destino.sentido === 1 ? destino.x : destino.x + destino.largura;
  const saidaY = origem.y + origem.altura / 2;
  const entradaY = destino.y + destino.altura / 2;

  if (mesmaLinha) {
    const curva = Math.max(24, Math.abs(entradaX - saidaX) / 2);
    const direcao = origem.sentido;
    return `M ${saidaX} ${saidaY} C ${saidaX + curva * direcao} ${saidaY} ${entradaX - curva * direcao} ${entradaY} ${entradaX} ${entradaY}`;
  }

  // Conector de continuidade: sai pelo fim da linha, contorna e entra no início da linha seguinte.
  const margem = 26;
  const foraX = origem.sentido === 1 ? saidaX + margem : saidaX - margem;
  const entraForaX = destino.sentido === 1 ? entradaX - margem : entradaX + margem;
  const meioY = (saidaY + entradaY) / 2;
  return [
    `M ${saidaX} ${saidaY}`,
    `C ${foraX} ${saidaY} ${foraX} ${meioY} ${foraX} ${meioY}`,
    `L ${entraForaX} ${meioY}`,
    `C ${entraForaX} ${entradaY} ${entraForaX} ${entradaY} ${entradaX} ${entradaY}`,
  ].join(' ');
}

/* -------------------------------------------------------------------------- */
/* Desenho dos nós                                                             */
/* -------------------------------------------------------------------------- */

const FONTE_TITULO = '500 13px Poppins, "Segoe UI", system-ui, sans-serif';

function desenharNo(caixa, { aoAbrir }) {
  const { item, largura, altura } = caixa;
  // A posição vai por CSS transform (não pelo atributo) para que o nó possa
  // deslizar até o novo lugar quando o filtro reordena a árvore.
  const grupo = el('g', {
    class: `no no--${FASE_CLASSE[item.fase]}`,
    tabindex: '0',
    role: 'button',
    'data-id': String(item.id),
    'aria-label': `${item.title}. ${item.status}.${item.bloqueada ? ' Bloqueada.' : ''}${item.atrasada ? ' Atrasada.' : ''}`,
  });
  grupo.style.transform = `translate(${caixa.x}px, ${caixa.y}px)`;
  if (item.bloqueada) grupo.classList.add('no--bloqueada');
  if (item.atrasada) grupo.classList.add('no--atrasada');

  const dica = [item.title, item.status];
  if (item.bloqueada) dica.push('bloqueada por dependência');
  if (item.atrasada) dica.push(`atrasada há ${plural(item.diasAtraso, 'dia', 'dias')}`);
  grupo.appendChild(texto(el('title'), dica.join(' — ')));

  grupo.appendChild(el('rect', { class: 'no__corpo', width: largura, height: altura, rx: 8 }));

  // O card entregue tem o check no canto: o título precisa parar antes dele.
  const larguraTexto = largura - 24 - (item.fase === FASE.ENTREGUE ? 28 : 0);
  const linhas = quebrarTitulo(item.title, larguraTexto, FONTE_TITULO);
  const titulo = el('text', { class: 'no__titulo', x: 12, y: 22 });
  linhas.forEach((linha, indice) => {
    titulo.appendChild(texto(el('tspan', { x: 12, dy: indice === 0 ? 0 : 16 }), linha));
  });
  grupo.appendChild(titulo);

  const baseInferior = altura - 14;
  const temProgresso = item.progress !== null;
  grupo.appendChild(
    texto(el('text', { class: 'no__status', x: 12, y: temProgresso ? baseInferior - 12 : baseInferior }), item.status),
  );

  if (temProgresso) {
    const larguraBarra = largura - 24;
    grupo.appendChild(el('rect', { class: 'no__trilha', x: 12, y: baseInferior - 4, width: larguraBarra, height: 4, rx: 2 }));
    const preenchida = el('rect', {
      class: 'no__progresso',
      x: 12, y: baseInferior - 4, width: larguraBarra, height: 4, rx: 2,
      'data-valor': item.progress,
    });
    // A barra cresce na entrada: começa vazia e o CSS anima a escala horizontal.
    preenchida.style.transformOrigin = '12px 0';
    preenchida.style.setProperty('--valor', String(item.progress / 100));
    grupo.appendChild(preenchida);

    grupo.appendChild(
      texto(el('text', { class: 'no__percentual', x: largura - 12, y: baseInferior - 12 }), `${item.progress}%`),
    );
  }

  if (item.fase === FASE.ENTREGUE) {
    const check = el('path', {
      class: 'no__check',
      d: 'M0 4.2 L3.2 7.4 L9 1.2',
      transform: `translate(${largura - 24}, 12)`,
    });
    grupo.appendChild(check);
  }

  if (item.bloqueada || item.atrasada) {
    const marcadores = el('g', { class: 'no__marcadores', transform: `translate(${largura - 12}, ${altura - 12})` });
    if (item.bloqueada) {
      marcadores.appendChild(el('circle', { class: 'marcador marcador--bloqueio', cx: 0, cy: 0, r: 4 }));
    }
    if (item.atrasada) {
      marcadores.appendChild(el('circle', { class: 'marcador marcador--atraso', cx: item.bloqueada ? -12 : 0, cy: 0, r: 4 }));
    }
    grupo.appendChild(marcadores);
  }

  grupo.addEventListener('click', () => aoAbrir(item.id));
  grupo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      aoAbrir(item.id);
    }
  });

  return grupo;
}

/** Cabeçalho da raia: rótulo clicável, contagem e barra segmentada por fase. */
function desenharCabecalhoRaia(raia, largura, { aoAbrirProjeto, mostrarArea, vertical }) {
  const grupo = el('g', { class: 'raia', transform: `translate(0, ${raia.topo})` });
  const independentes = raia.tipo === 'independentes';

  const rotulo = el('text', { class: 'raia__rotulo', x: M.padding, y: 18 });
  if (!independentes) {
    rotulo.setAttribute('tabindex', '0');
    rotulo.setAttribute('role', 'button');
    rotulo.classList.add('raia__rotulo--clicavel');
    rotulo.addEventListener('click', () => aoAbrirProjeto(raia));
    rotulo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        aoAbrirProjeto(raia);
      }
    });
  }
  texto(rotulo, raia.projeto);
  grupo.appendChild(rotulo);

  const detalhe = [];
  if (mostrarArea && raia.area) detalhe.push(raia.area);
  detalhe.push(plural(raia.itens.length, 'iniciativa', 'iniciativas'));
  grupo.appendChild(texto(el('text', { class: 'raia__meta', x: M.padding, y: 36 }), detalhe.join(' · ')));

  // Barra segmentada: um segmento por iniciativa, cor pela fase.
  // Em coluna única ela ocupa a linha inteira; nas demais fica à direita do rótulo.
  const larguraBarra = vertical
    ? largura - M.padding * 2
    : Math.min(240, Math.max(96, largura - M.padding * 2 - 240));
  const inicioBarra = M.padding + (vertical ? 0 : largura - M.padding * 2 - larguraBarra);
  const topoBarra = vertical ? 50 : 26;

  if (larguraBarra > 60) {
    const segmentos = el('g', { class: 'raia__barra', transform: `translate(${inicioBarra}, ${topoBarra})` });
    const vao = 2;
    const larguraSegmento = (larguraBarra - vao * (raia.itens.length - 1)) / raia.itens.length;
    raia.itens.forEach((item, indice) => {
      segmentos.appendChild(
        el('rect', {
          class: `raia__segmento raia__segmento--${FASE_CLASSE[item.fase]}`,
          x: indice * (larguraSegmento + vao),
          y: 0,
          width: Math.max(2, larguraSegmento),
          height: 5,
          rx: 2.5,
        }),
      );
    });
    grupo.appendChild(segmentos);
  }

  const alturaRegua = vertical ? 66 : 44;
  grupo.appendChild(el('line', {
    class: 'raia__regua', x1: M.padding, y1: alturaRegua, x2: largura - M.padding, y2: alturaRegua,
  }));

  return grupo;
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                  */
/* -------------------------------------------------------------------------- */

export function criarArvore({ container, dataset, aoAbrirDetalhe, aoAbrirProjeto }) {
  let itensVisiveis = [];
  let mostrarArea = false;
  let layout = null;
  let escala = 1;
  let svg = null;
  let idDestacado = null;

  const palco = document.createElement('div');
  palco.className = 'arvore__palco';
  container.appendChild(palco);

  /* ---- destaque de cadeia ------------------------------------------------ */

  function aplicarDestaque(id) {
    if (!svg) return;
    idDestacado = id;
    const nos = svg.querySelectorAll('.no');
    const arestas = svg.querySelectorAll('.aresta');

    if (id === null) {
      svg.classList.remove('arvore--destacando');
      nos.forEach((n) => n.classList.remove('no--ativo', 'no--acima', 'no--abaixo'));
      arestas.forEach((a) => a.classList.remove('aresta--acesa'));
      return;
    }

    const acima = dataset.ancestrais(id);
    const abaixo = dataset.descendentes(id);
    svg.classList.add('arvore--destacando');

    nos.forEach((no) => {
      const idNo = Number(no.dataset.id);
      no.classList.toggle('no--ativo', idNo === id);
      no.classList.toggle('no--acima', acima.has(idNo));
      no.classList.toggle('no--abaixo', abaixo.has(idNo));
    });

    arestas.forEach((aresta) => {
      const de = Number(aresta.dataset.de);
      const para = Number(aresta.dataset.para);
      const naCadeia =
        (de === id || acima.has(de) || abaixo.has(de)) &&
        (para === id || acima.has(para) || abaixo.has(para));
      aresta.classList.toggle('aresta--acesa', naCadeia);
    });
  }

  /* ---- zoom e arrasto ---------------------------------------------------- */

  function aplicarEscala(nova, ancora) {
    const anterior = escala;
    escala = Math.min(M.escalaMax, Math.max(M.escalaMin, Number(nova.toFixed(2))));
    if (!svg || escala === anterior) return;

    const razao = escala / anterior;
    const centroX = ancora ? ancora.x : container.clientWidth / 2;
    const centroY = ancora ? ancora.y : container.clientHeight / 2;
    const alvoX = (container.scrollLeft + centroX) * razao - centroX;
    const alvoY = (container.scrollTop + centroY) * razao - centroY;

    svg.setAttribute('width', layout.largura * escala);
    svg.setAttribute('height', layout.altura * escala);
    container.scrollLeft = alvoX;
    container.scrollTop = alvoY;
    atualizarBotoesZoom();
  }

  function atualizarBotoesZoom() {
    const painel = container.parentElement?.querySelector('.arvore__controles');
    if (!painel) return;
    painel.querySelector('[data-acao="mais"]').disabled = escala >= M.escalaMax;
    painel.querySelector('[data-acao="menos"]').disabled = escala <= M.escalaMin;
    const rotulo = painel.querySelector('.arvore__zoom-valor');
    if (rotulo) rotulo.textContent = `${Math.round(escala * 100)}%`;
  }

  // Roda só com Ctrl: sem isso, a página do SharePoint deixaria de rolar.
  container.addEventListener('wheel', (evento) => {
    if (!evento.ctrlKey) return;
    evento.preventDefault();
    const retangulo = container.getBoundingClientRect();
    aplicarEscala(escala + (evento.deltaY < 0 ? M.passoZoom : -M.passoZoom), {
      x: evento.clientX - retangulo.left,
      y: evento.clientY - retangulo.top,
    });
  }, { passive: false });

  const ponteiros = new Map();
  let distanciaInicial = 0;
  let escalaInicial = 1;
  let arrasto = null;

  container.addEventListener('pointerdown', (evento) => {
    if (evento.target.closest('.no, .raia__rotulo--clicavel')) return;
    ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      distanciaInicial = Math.hypot(a.x - b.x, a.y - b.y);
      escalaInicial = escala;
      arrasto = null;
    } else if (evento.pointerType === 'mouse') {
      arrasto = {
        x: evento.clientX, y: evento.clientY,
        scrollX: container.scrollLeft, scrollY: container.scrollTop,
      };
      container.classList.add('arvore--arrastando');
      container.setPointerCapture(evento.pointerId);
    }
  });

  container.addEventListener('pointermove', (evento) => {
    if (ponteiros.has(evento.pointerId)) {
      ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
    }

    if (ponteiros.size === 2 && distanciaInicial > 0) {
      const [a, b] = [...ponteiros.values()];
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      const retangulo = container.getBoundingClientRect();
      aplicarEscala(escalaInicial * (distancia / distanciaInicial), {
        x: (a.x + b.x) / 2 - retangulo.left,
        y: (a.y + b.y) / 2 - retangulo.top,
      });
      return;
    }

    if (arrasto) {
      container.scrollLeft = arrasto.scrollX - (evento.clientX - arrasto.x);
      container.scrollTop = arrasto.scrollY - (evento.clientY - arrasto.y);
    }
  });

  const encerrarPonteiro = (evento) => {
    ponteiros.delete(evento.pointerId);
    if (ponteiros.size < 2) distanciaInicial = 0;
    if (arrasto) {
      arrasto = null;
      container.classList.remove('arvore--arrastando');
    }
  };
  container.addEventListener('pointerup', encerrarPonteiro);
  container.addEventListener('pointercancel', encerrarPonteiro);
  container.addEventListener('pointerleave', encerrarPonteiro);

  /* ---- render ------------------------------------------------------------ */

  // Nós vivos entre renders: é o que permite o card deslizar até a nova
  // posição quando um filtro reordena a árvore, em vez de piscar.
  let elementosNo = new Map();
  let assinatura = '';
  let camadaRaias = null;
  let camadaArestas = null;
  let camadaNos = null;

  function criarNo(caixa) {
    const no = desenharNo(caixa, { aoAbrir: aoAbrirDetalhe });
    no.addEventListener('pointerenter', () => aplicarDestaque(caixa.item.id));
    no.addEventListener('pointerleave', () => aplicarDestaque(null));
    no.addEventListener('focus', () => aplicarDestaque(caixa.item.id));
    no.addEventListener('blur', () => aplicarDestaque(null));
    return no;
  }

  function desenharRaias() {
    camadaRaias.textContent = '';
    for (const raia of layout.raias) {
      camadaRaias.appendChild(
        desenharCabecalhoRaia(raia, layout.largura, { aoAbrirProjeto, mostrarArea, vertical: layout.vertical }),
      );
    }
  }

  function desenharArestas() {
    camadaArestas.textContent = '';
    // Só entre nós visíveis. Uma aresta que cruza raia (19 -> 15) sai igual às
    // outras, porque as posições já são absolutas.
    for (const [id, caixa] of layout.nos) {
      for (const idDep of caixa.item.deps) {
        const origem = layout.nos.get(idDep);
        if (!origem) continue;
        const cruzaRaia = origem.item.chaveRaia !== caixa.item.chaveRaia;
        camadaArestas.appendChild(el('path', {
          class: `aresta${cruzaRaia ? ' aresta--entre-raias' : ''}${caixa.item.fase === FASE.EXECUCAO ? ' aresta--fluxo' : ''}`,
          d: caminhoAresta(origem, caixa, layout.vertical),
          'data-de': String(idDep),
          'data-para': String(id),
        }));
      }
    }
  }

  function render(itens, opcoes = {}) {
    itensVisiveis = itens;
    mostrarArea = Boolean(opcoes.mostrarArea);

    const larguraUtil = Math.max(320, container.clientWidth);
    const raias = montarRaias(itensVisiveis, mostrarArea);
    layout = calcularLayout(raias, larguraUtil);

    if (!itensVisiveis.length) {
      palco.textContent = '';
      elementosNo = new Map();
      assinatura = '';
      svg = null;
      layout = null;
      return;
    }

    // Mudou o gabarito (modo ou largura do card)? O texto quebra diferente,
    // então vale redesenhar do zero em vez de reposicionar.
    const novaAssinatura = `${layout.modo}|${layout.larguraNo}`;
    if (!svg || novaAssinatura !== assinatura) {
      palco.textContent = '';
      elementosNo = new Map();
      assinatura = novaAssinatura;

      svg = el('svg', {
        class: `arvore arvore--${layout.modo}`,
        role: 'group',
        'aria-label': 'Árvore de dependências das iniciativas',
      });
      camadaRaias = el('g', { class: 'camada camada--raias' });
      camadaArestas = el('g', { class: 'camada camada--arestas' });
      camadaNos = el('g', { class: 'camada camada--nos' });
      svg.append(camadaRaias, camadaArestas, camadaNos);
      palco.appendChild(svg);
    }

    svg.setAttribute('viewBox', `0 0 ${layout.largura} ${layout.altura}`);
    svg.setAttribute('width', layout.largura * escala);
    svg.setAttribute('height', layout.altura * escala);

    desenharRaias();
    desenharArestas();

    // Nós que saíram do filtro somem; os que ficaram deslizam; os novos entram.
    for (const [id, elemento] of elementosNo) {
      if (!layout.nos.has(id)) {
        elemento.remove();
        elementosNo.delete(id);
      }
    }

    let indice = 0;
    for (const [id, caixa] of layout.nos) {
      let no = elementosNo.get(id);
      if (no) {
        no.style.transform = `translate(${caixa.x}px, ${caixa.y}px)`;
      } else {
        no = criarNo(caixa);
        no.style.setProperty('--indice', String(indice));
        elementosNo.set(id, no);
        camadaNos.appendChild(no);
      }
      indice++;
    }

    atualizarBotoesZoom();
    if (idDestacado !== null && layout.nos.has(idDestacado)) aplicarDestaque(idDestacado);
  }

  /* ---- API --------------------------------------------------------------- */

  function centralizar() {
    escala = 1;
    if (svg && layout) {
      svg.setAttribute('width', layout.largura);
      svg.setAttribute('height', layout.altura);
    }
    container.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    atualizarBotoesZoom();
  }

  function focarNo(id, { rolar = true } = {}) {
    if (!layout || !layout.nos.has(id)) return false;
    const caixa = layout.nos.get(id);
    aplicarDestaque(id);
    if (rolar) {
      const alvoY = caixa.y * escala - container.clientHeight / 2 + caixa.altura / 2;
      const alvoX = caixa.x * escala - container.clientWidth / 2 + caixa.largura / 2;
      container.scrollTo({
        top: Math.max(0, alvoY),
        left: Math.max(0, alvoX),
        behavior: 'smooth',
      });
    }
    return true;
  }

  function focarElementoDoNo(id) {
    const alvo = svg?.querySelector(`.no[data-id="${CSS.escape(String(id))}"]`);
    if (alvo) alvo.focus({ preventScroll: true });
  }

  return {
    render,
    destacar: aplicarDestaque,
    focarNo,
    focarElementoDoNo,
    centralizar,
    zoomMais: () => aplicarEscala(escala + M.passoZoom),
    zoomMenos: () => aplicarEscala(escala - M.passoZoom),
    get escala() { return escala; },
    get layout() { return layout; },
  };
}

export const METRICAS = M;
export { montarRaias, calcularLayout, calcularNiveis, quebrarTitulo, criarSlug };
