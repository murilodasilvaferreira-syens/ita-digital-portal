/**
 * Layout do roadmap de dependências — só geometria, sem DOM.
 *
 * Três modos, escolhidos pela largura útil:
 *   horizontal  — a raia inteira cabe numa linha, da esquerda para a direita
 *   serpentina  — a cadeia quebra em zigue-zague e continua de onde parou
 *   vertical    — abaixo de ~600px, um card de largura total por linha
 *
 * Todo nó tem posição absoluta no quadro (as raias são faixas empilhadas), por
 * isso uma dependência entre projetos é desenhada como qualquer outra aresta.
 */

/* Métricas do quadro. Fonte única: o CSS não alcança o posicionamento
   absoluto dos cards, então estes números moram aqui e não em tokens.css. */
export const M = {
  noLargura: 214,
  noAltura: 112,
  gapX: 54,
  gapY: 16,
  raiaCabecalho: 74,
  raiaCabecalhoVertical: 92,
  raiaRodape: 20,
  raiaEspaco: 34,
  padding: 28,
  verticalAltura: 104,
  verticalGap: 30,
  verticalCalha: 22,
  verticalPadding: 14,
  limiteVertical: 600,
  escalaMin: 0.5,
  escalaMax: 2.2,
  passoZoom: 0.2,
};

/** Folga entre a ponta da aresta e a borda do card, para a seta aparecer. */
const RECUO = 7;

/* -------------------------------------------------------------------------- */
/* Raias                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Agrupa os itens visíveis em raias (área + projeto) e separa a faixa
 * "Independentes": projeto cujas iniciativas são todas independentes continua
 * sendo raia; só o item isolado dentro de projeto com cadeia cai na faixa.
 */
export function montarRaias(itens, mostrarArea) {
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
    if (grupo.itens.every((i) => i.independente)) {
      raias.push({ ...grupo, tipo: 'projeto' });
    } else {
      const comCadeia = grupo.itens.filter((i) => !i.independente);
      if (comCadeia.length) raias.push({ ...grupo, itens: comCadeia, tipo: 'projeto' });
      soltos.push(...grupo.itens.filter((i) => i.independente));
    }
  }

  // Ordem base: por área (quando a visão mostra várias) e, dentro dela, as
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
 * rótulo de um projeto que nada tem a ver com aquela cadeia. Raias conectadas
 * formam um bloco, ordenado topologicamente; os blocos mantêm a ordem base.
 */
function ordenarRaiasPorDependencia(raias) {
  if (raias.length < 2) return raias;

  const raiaDoItem = new Map();
  raias.forEach((raia, indice) => raia.itens.forEach((item) => raiaDoItem.set(item.id, indice)));

  const depois = raias.map(() => new Set());
  const vizinhos = raias.map(() => new Set());
  raias.forEach((raia, destino) => {
    for (const item of raia.itens) {
      for (const idDep of item.deps) {
        const origem = raiaDoItem.get(idDep);
        if (origem === undefined || origem === destino) continue;
        depois[origem].add(destino);
        vizinhos[origem].add(destino);
        vizinhos[destino].add(origem);
      }
    }
  });

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
      for (const v of vizinhos[no]) {
        if (componenteDe[v] === -1) {
          componenteDe[v] = componentes.length;
          fila.push(v);
        }
      }
    }
    componentes.push(atual.sort((a, b) => a - b));
  }

  // Kahn dentro de cada componente, desempatando pela ordem base.
  const saida = [];
  for (const componente of componentes) {
    const restante = new Set(componente);
    const grau = new Map(componente.map((i) => [i, 0]));
    for (const origem of componente) {
      for (const destino of depois[origem]) if (restante.has(destino)) grau.set(destino, grau.get(destino) + 1);
    }
    const prontos = componente.filter((i) => grau.get(i) === 0);
    while (prontos.length) {
      prontos.sort((a, b) => a - b);
      const atual = prontos.shift();
      restante.delete(atual);
      saida.push(raias[atual]);
      for (const destino of depois[atual]) {
        if (!restante.has(destino)) continue;
        grau.set(destino, grau.get(destino) - 1);
        if (grau.get(destino) === 0) prontos.push(destino);
      }
    }
    // Sobrou algo (ciclo entre raias): entra na ordem base, sem travar o render.
    for (const i of [...restante].sort((a, b) => a - b)) saida.push(raias[i]);
  }
  return saida;
}

/**
 * Nível dentro da raia: caminho mais longo pelas dependências do mesmo grupo.
 * Níveis sem item visível são compactados, para o filtro não deixar coluna
 * vazia no meio da cadeia. Dentro da coluna, a ordem segue a média da posição
 * dos pais — o que reduz cruzamento de arestas.
 */
export function calcularNiveis(itensDaRaia) {
  const porId = new Map(itensDaRaia.map((i) => [i.id, i]));
  const cache = new Map();

  const nivelDe = (item) => {
    if (cache.has(item.id)) return cache.get(item.id);
    cache.set(item.id, 0); // guarda contra recursão em dado inesperado
    let nivel = 0;
    for (const idPai of item.deps) {
      const pai = porId.get(idPai);
      if (pai) nivel = Math.max(nivel, nivelDe(pai) + 1);
    }
    cache.set(item.id, nivel);
    return nivel;
  };
  itensDaRaia.forEach(nivelDe);

  const usados = [...new Set(cache.values())].sort((a, b) => a - b);
  const compacto = new Map(usados.map((n, i) => [n, i]));
  const porNivel = usados.map(() => []);
  for (const item of itensDaRaia) porNivel[compacto.get(cache.get(item.id))].push(item);

  const posicao = new Map();
  porNivel.forEach((coluna, k) => {
    if (k > 0) {
      const media = (item) => {
        const pais = item.deps.filter((d) => posicao.has(d)).map((d) => posicao.get(d));
        return pais.length ? pais.reduce((s, v) => s + v, 0) / pais.length : Number.MAX_SAFE_INTEGER;
      };
      coluna.sort((a, b) => media(a) - media(b) || a.id - b.id);
    } else {
      coluna.sort((a, b) => a.id - b.id);
    }
    coluna.forEach((item, i) => posicao.set(item.id, i));
  });
  return porNivel;
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Posições absolutas de todos os nós e a geometria das raias.
 * Devolve { modo, vertical, largura, altura, nos: Map<id, caixa>, raias }.
 */
export function calcularLayout(raias, larguraUtil) {
  const vertical = larguraUtil < M.limiteVertical;
  const pad = vertical ? M.verticalPadding : M.padding;
  const larguraNo = vertical ? Math.max(200, larguraUtil - pad * 2 - M.verticalCalha) : M.noLargura;
  const alturaNo = vertical ? M.verticalAltura : M.noAltura;
  const cabecalho = vertical ? M.raiaCabecalhoVertical : M.raiaCabecalho;
  const porLinha = vertical ? 1 : Math.max(1, Math.floor((larguraUtil - pad * 2 + M.gapX) / (larguraNo + M.gapX)));

  const nos = new Map();
  const saida = [];
  let y = 0;
  let larguraMax = 0;

  for (const raia of raias) {
    const topo = y;
    y += cabecalho;
    const colunas = raia.tipo === 'independentes' ? raia.itens.map((i) => [i]) : calcularNiveis(raia.itens);

    if (vertical) {
      // Empilhamento: ordem topológica achatada, um card por linha.
      const ordenados = colunas.flat();
      ordenados.forEach((item, i) => {
        nos.set(item.id, {
          item, x: pad + M.verticalCalha, y: y + i * (alturaNo + M.verticalGap),
          largura: larguraNo, altura: alturaNo, linha: i, coluna: 0, sentido: 1,
        });
      });
      y += ordenados.length * (alturaNo + M.verticalGap) - M.verticalGap;
      larguraMax = Math.max(larguraMax, pad + M.verticalCalha + larguraNo + pad);
    } else {
      // Serpentina: colunas empacotadas em linhas que alternam o sentido.
      const linhas = [];
      for (let i = 0; i < colunas.length; i += porLinha) linhas.push(colunas.slice(i, i + porLinha));

      linhas.forEach((cols, li) => {
        const sentido = li % 2 === 0 ? 1 : -1;
        const alturaLinha = Math.max(...cols.map((c) => c.length * (alturaNo + M.gapY) - M.gapY));
        cols.forEach((coluna, ci) => {
          // A linha invertida se alinha pela capacidade da faixa, não pelo que
          // sobrou nela: é isso que faz a serpentina continuar de onde parou.
          const visual = sentido === 1 ? ci : porLinha - 1 - ci;
          const x = pad + visual * (larguraNo + M.gapX);
          const alturaColuna = coluna.length * (alturaNo + M.gapY) - M.gapY;
          const topoColuna = y + (alturaLinha - alturaColuna) / 2;
          coluna.forEach((item, k) => {
            nos.set(item.id, {
              item, x, y: topoColuna + k * (alturaNo + M.gapY),
              largura: larguraNo, altura: alturaNo, linha: li, coluna: ci, sentido,
            });
          });
          larguraMax = Math.max(larguraMax, x + larguraNo + pad);
        });
        y += alturaLinha + (li < linhas.length - 1 ? M.gapY * 2.5 : 0);
      });
    }

    y += M.raiaRodape;
    saida.push({ ...raia, topo, base: y });
    y += M.raiaEspaco;
  }

  return {
    modo: vertical ? 'vertical' : porLinha >= 2 ? 'horizontal' : 'estreito',
    vertical,
    larguraNo,
    largura: Math.max(larguraUtil, larguraMax),
    altura: Math.max(y - M.raiaEspaco, 200),
    nos,
    raias: saida,
  };
}

/* -------------------------------------------------------------------------- */
/* Arestas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Aresta entre raias diferentes: desce por um corredor. Como as colunas formam
 * uma grade regular, o vão entre duas colunas está livre de cards em toda a
 * altura — descer por ali garante que a curva não fique escondida atrás de um
 * card. Entra pela lateral do destino, nunca pelo topo.
 */
function caminhoEntreRaias(origem, destino) {
  const desce = destino.y > origem.y;
  const ox = origem.x + origem.largura / 2;
  const oy = desce ? origem.y + origem.altura : origem.y;
  const pelaDireita = destino.x <= M.padding + 1;
  const corredor = pelaDireita ? destino.x + destino.largura + M.gapX / 2 : destino.x - M.gapX / 2;
  const ex = pelaDireita ? destino.x + destino.largura + RECUO : destino.x - RECUO;
  const ey = destino.y + destino.altura / 2;
  const s = desce ? 1 : -1;
  const saida = oy + 18 * s;
  return `M ${ox} ${oy} C ${ox} ${saida} ${corredor} ${saida} ${corredor} ${saida + 10 * s} L ${corredor} ${ey - 14 * s} C ${corredor} ${ey} ${corredor} ${ey} ${ex} ${ey}`;
}

/**
 * Caminho de uma aresta entre dois nós já posicionados. `larguraDesenho`
 * limita o cotovelo do conector de continuidade: nas colunas das pontas ele
 * cairia fora do quadro e a curva seria cortada.
 */
export function caminhoAresta(origem, destino, vertical, larguraDesenho = Infinity) {
  if (vertical) {
    const calha = origem.x - M.verticalCalha / 2;
    const yo = origem.y + origem.altura;
    if (destino.linha - origem.linha === 1 && origem.item.chaveRaia === destino.item.chaveRaia) {
      const meio = origem.x + origem.largura / 2;
      return `M ${meio} ${yo} L ${meio} ${destino.y - RECUO}`;
    }
    // Dependência distante: curva pela calha à esquerda da pilha.
    const om = origem.y + origem.altura / 2;
    const dm = destino.y + destino.altura / 2;
    const s = dm > om ? 1 : -1;
    return `M ${origem.x} ${om} C ${calha} ${om} ${calha} ${om + 8 * s} ${calha} ${om + 16 * s} L ${calha} ${dm - 8 * s} C ${calha} ${dm} ${calha} ${dm} ${destino.x - RECUO} ${dm}`;
  }

  if (origem.item.chaveRaia !== destino.item.chaveRaia) return caminhoEntreRaias(origem, destino);

  const sx = origem.sentido === 1 ? origem.x + origem.largura : origem.x;
  const ex = (destino.sentido === 1 ? destino.x : destino.x + destino.largura) - RECUO * destino.sentido;
  const sy = origem.y + origem.altura / 2;
  const ey = destino.y + destino.altura / 2;

  if (origem.linha === destino.linha) {
    const curva = Math.max(24, Math.abs(ex - sx) / 2);
    const k = origem.sentido;
    return `M ${sx} ${sy} C ${sx + curva * k} ${sy} ${ex - curva * k} ${ey} ${ex} ${ey}`;
  }

  // Conector de continuidade: sai pelo fim da linha, contorna e entra na seguinte.
  const margem = 22;
  const naFaixa = (x) => Math.min(Math.max(x, RECUO), larguraDesenho - RECUO);
  const fx = naFaixa(origem.sentido === 1 ? sx + margem : sx - margem);
  const efx = naFaixa(destino.sentido === 1 ? ex - margem : ex + margem);
  const my = (sy + ey) / 2;
  return `M ${sx} ${sy} C ${fx} ${sy} ${fx} ${my} ${fx} ${my} L ${efx} ${my} C ${efx} ${ey} ${efx} ${ey} ${ex} ${ey}`;
}
