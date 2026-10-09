/**
 * Métricas derivadas das iniciativas — fonte única dos números que aparecem
 * no Início, em Roadmaps e em Indicadores, para as três páginas nunca
 * discordarem entre si.
 *
 * Tudo aqui recebe os itens já normalizados por data.js (criarDataset) e
 * devolve objetos simples. Nada toca no DOM e nada é estimado: campo vazio
 * fica de fora da conta e é contado à parte quando importa.
 */

import { FASE } from './data.js';

/** Ordem canônica dos status e o token de cor de cada um (tokens.css). */
export const STATUS_ORDEM = ['Implantada', 'Em desenvolvimento', 'Dependente', 'Backlog', 'Ideia'];

const COR_STATUS = {
  'Implantada': 'var(--st-implantada)',
  'Em desenvolvimento': 'var(--st-desenvolvimento)',
  'Dependente': 'var(--st-dependente)',
  'Backlog': 'var(--st-backlog)',
  'Ideia': 'var(--st-ideia)',
};

const ROTULO_STATUS_PLURAL = {
  'Implantada': 'Implantadas',
  'Em desenvolvimento': 'Em desenvolvimento',
  'Dependente': 'Dependentes',
  'Backlog': 'Backlog',
  'Ideia': 'Ideia',
};

export const corStatus = (status) => COR_STATUS[status] || 'var(--st-outro)';
export const rotuloStatus = (status) => ROTULO_STATUS_PLURAL[status] || status;

/* -------------------------------------------------------------------------- */
/* Meses                                                                      */
/* -------------------------------------------------------------------------- */

/** 'YYYY-MM' de uma data ISO, ou null. */
export function mesDe(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null;
}

export function mesAtual(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Lista contínua de meses entre dois limites, inclusive. */
export function intervaloMeses(de, ate) {
  const saida = [];
  for (let m = de; m <= ate; m = somarMeses(m, 1)) saida.push(m);
  return saida;
}

const FMT_MES = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const FMT_MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

/** '2026-09' -> 'Set'. */
export function nomeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const nome = FMT_MES.format(new Date(a, m - 1, 1)).replace('.', '');
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** '2026-09' -> 'setembro'. */
export function nomeMesLongo(mes) {
  const [a, m] = mes.split('-').map(Number);
  return FMT_MES_LONGO.format(new Date(a, m - 1, 1));
}

/* -------------------------------------------------------------------------- */
/* Portfólio                                                                  */
/* -------------------------------------------------------------------------- */

/** Contagem por status, na ordem canônica; status fora da lista vai ao fim. */
export function contarPorStatus(itens) {
  const mapa = new Map(STATUS_ORDEM.map((s) => [s, 0]));
  for (const item of itens) mapa.set(item.status, (mapa.get(item.status) || 0) + 1);
  return mapa;
}

export function projetosDistintos(itens) {
  return new Set(itens.map((i) => i.project).filter((p) => p && p !== 'Sem projeto')).size;
}

/** Áreas reais (exclui "Sem área"). */
export function areasDistintas(itens) {
  return new Set(itens.map((i) => i.area).filter((a) => a && a !== 'Sem área')).size;
}

export function progressoMedio(itens) {
  if (!itens.length) return 0;
  return Math.round(itens.reduce((s, i) => s + (i.progress || 0), 0) / itens.length);
}

/** Implantadas com conclusão (doneDate) no mês informado. */
export function implantadasNoMes(itens, mes) {
  return itens.filter((i) => i.status === 'Implantada' && mesDe(i.doneDate) === mes).length;
}

/**
 * Resumo por área: volume, avanço médio, atrasos, status e projetos.
 * Áreas ordenadas por volume; "Sem área" sempre por último.
 */
export function resumoPorArea(itens) {
  const grupos = new Map();
  for (const item of itens) {
    if (!grupos.has(item.area)) grupos.set(item.area, []);
    grupos.get(item.area).push(item);
  }
  const lista = [...grupos.entries()].map(([area, doArea]) => {
    const projetos = new Map();
    doArea.forEach((i) => projetos.set(i.project, (projetos.get(i.project) || 0) + 1));
    return {
      area,
      slug: doArea[0].slugArea,
      semArea: area === 'Sem área',
      n: doArea.length,
      media: progressoMedio(doArea),
      atrasadas: doArea.filter((i) => i.atrasada).length,
      status: contarPorStatus(doArea),
      projetos: [...projetos.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
        .map(([p]) => p)
        .filter((p) => p !== 'Sem projeto'),
      itens: doArea,
    };
  });
  return lista.sort((a, b) => (a.semArea - b.semArea) || b.n - a.n || a.area.localeCompare(b.area, 'pt-BR'));
}

/**
 * Pares de áreas que compartilham pelo menos um projeto (mesmo nome de
 * projeto em áreas diferentes) — as arestas extras do "Pulso das áreas".
 */
export function areasComProjetoEmComum(itens) {
  const areasDoProjeto = new Map();
  for (const item of itens) {
    if (item.area === 'Sem área' || item.project === 'Sem projeto') continue;
    if (!areasDoProjeto.has(item.project)) areasDoProjeto.set(item.project, new Set());
    areasDoProjeto.get(item.project).add(item.area);
  }
  const pares = new Set();
  for (const areas of areasDoProjeto.values()) {
    const l = [...areas].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) pares.add(`${l[i]}|${l[j]}`);
  }
  return [...pares].map((p) => p.split('|'));
}

/* -------------------------------------------------------------------------- */
/* Séries no tempo                                                            */
/* -------------------------------------------------------------------------- */

/** Conta registros por mês de um campo de data. */
export function porMes(itens, campo) {
  const mapa = {};
  for (const item of itens) {
    const m = mesDe(item[campo]);
    if (m) mapa[m] = (mapa[m] || 0) + 1;
  }
  return mapa;
}

/**
 * Implantadas acumuladas por mês de conclusão (doneDate), nos últimos `n`
 * meses até o último com entrega. Implantada sem doneDate fica de fora e é
 * informada em `semData`.
 */
export function implantadasAcumuladas(itens, n = 6) {
  const implantadas = itens.filter((i) => i.status === 'Implantada');
  const mapa = porMes(implantadas, 'doneDate');
  const meses = Object.keys(mapa).sort();
  const semData = implantadas.filter((i) => !i.doneDate).length;
  if (!meses.length) return { pontos: [], semData };

  const ultimo = meses[meses.length - 1];
  const inicio = [meses[0], somarMeses(ultimo, -(n - 1))].sort()[1];
  let acumulado = meses.filter((m) => m < inicio).reduce((s, m) => s + mapa[m], 0);
  const pontos = intervaloMeses(inicio, ultimo).map((m) => {
    acumulado += mapa[m] || 0;
    return { mes: m, rotulo: nomeMes(m), valor: acumulado };
  });
  return { pontos, semData };
}

const CAMPOS_MOVIMENTO = ['requestedDate', 'startDate', 'doneDate', 'updatedAt'];

/**
 * Ritmo por área: quantas etapas se movimentaram em cada mês. Uma etapa conta
 * uma vez por mês se qualquer uma das datas reais (solicitação, início,
 * conclusão, atualização) cair nele. O prazo fica de fora: é compromisso
 * futuro, não movimento. Janela de `n` meses até o último com movimento.
 */
export function ritmoPorArea(itens, n = 6, agora = new Date()) {
  const porArea = new Map();
  const limite = mesAtual(agora);
  let ultimo = null;
  for (const item of itens) {
    // Data futura (início planejado) ainda não é movimento.
    const meses = new Set(CAMPOS_MOVIMENTO.map((c) => mesDe(item[c])).filter((m) => m && m <= limite));
    if (!porArea.has(item.area)) porArea.set(item.area, {});
    const contagem = porArea.get(item.area);
    for (const m of meses) {
      contagem[m] = (contagem[m] || 0) + 1;
      if (!ultimo || m > ultimo) ultimo = m;
    }
  }
  if (!ultimo) return { meses: [], linhas: [], maximo: 0 };

  const meses = intervaloMeses(somarMeses(ultimo, -(n - 1)), ultimo);
  const linhas = [...porArea.entries()]
    .map(([area, contagem]) => ({ area, valores: meses.map((m) => contagem[m] || 0) }))
    .map((l) => ({ ...l, total: l.valores.reduce((s, v) => s + v, 0) }))
    .filter((l) => l.total > 0)
    .sort((a, b) => (a.area === 'Sem área') - (b.area === 'Sem área') || b.total - a.total || a.area.localeCompare(b.area, 'pt-BR'));
  const maximo = Math.max(0, ...linhas.flatMap((l) => l.valores));
  return { meses, linhas, maximo };
}

/** Degrau da escala de calor (0 = vazio, 1..6) para `n` dentro de `maximo`. */
export function nivelCalor(n, maximo) {
  if (!n || !maximo) return 0;
  return Math.min(6, Math.max(1, Math.ceil((n / maximo) * 6)));
}

export const corCalor = (nivel) => `var(--calor-${nivel})`;

/* -------------------------------------------------------------------------- */
/* Prioridade, valor e leituras                                               */
/* -------------------------------------------------------------------------- */

export const PRIORIDADES = ['Alta', 'Média', 'Baixa'];
export const COMPLEXIDADES = ['Baixa', 'Média', 'Alta'];

/**
 * Cruzamento prioridade × complexidade. Cada célula traz o total e a
 * contagem por status. Item sem prioridade ou complexidade fica fora e é
 * contado em `semClassificacao`.
 */
export function matrizPrioridade(itens) {
  const celulas = [];
  for (const p of PRIORIDADES) {
    for (const c of COMPLEXIDADES) {
      const doGrupo = itens.filter((i) => i.priority === p && i.complexity === c);
      celulas.push({ prioridade: p, complexidade: c, n: doGrupo.length, status: contarPorStatus(doGrupo) });
    }
  }
  const semClassificacao = itens.filter((i) => !PRIORIDADES.includes(i.priority) || !COMPLEXIDADES.includes(i.complexity)).length;
  return { celulas, semClassificacao };
}

/** Tipos de ganho, do mais citado ao menos citado: [[rótulo, n], …]. */
export function rankingGanhos(itens) {
  const mapa = new Map();
  for (const item of itens) for (const g of item.gainTypes) mapa.set(g, (mapa.get(g) || 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}

/** Tecnologias, cada uma contada uma vez por iniciativa: [[rótulo, n], …]. */
export function rankingTecnologias(itens) {
  const mapa = new Map();
  for (const item of itens) for (const t of new Set(item.technologies)) mapa.set(t, (mapa.get(t) || 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}

/** As "principais leituras": dependências, etapas paradas e vetor de valor. */
export function leituras(itens) {
  const ganhos = rankingGanhos(itens);
  return {
    dependem: itens.filter((i) => i.deps.length > 0).length,
    semProgresso: itens.filter((i) => i.progress === 0).length,
    ganhoPrincipal: ganhos[0] ? { rotulo: ganhos[0][0], n: ganhos[0][1] } : null,
    ganhos,
  };
}

/** Fases do roadmap, na ordem de leitura (reexportadas para quem só usa métricas). */
export { FASE };

/* -------------------------------------------------------------------------- */
/* Indicadores (Observatório)                                                 */
/* -------------------------------------------------------------------------- */

/** Mês anterior a 'YYYY-MM'. */
export const mesAnterior = (mes) => somarMeses(mes, -1);

/**
 * Contagem no mês corrente contra o anterior, por um campo de data real.
 * Sem base no mês anterior não há variação: devolve null (nunca "+∞%").
 */
export function variacaoPorCampo(itens, campo, mes) {
  const anterior = mesAnterior(mes);
  let atual = 0;
  let antes = 0;
  for (const item of itens) {
    const m = mesDe(item[campo]);
    if (m === mes) atual += 1;
    else if (m === anterior) antes += 1;
  }
  return antes ? { pct: Math.round(((atual - antes) / antes) * 100), atual, anterior: antes } : null;
}

/** Projeto entra no mês da primeira solicitação entre as suas etapas. */
export function variacaoProjetos(itens, mes) {
  const primeiro = new Map();
  for (const item of itens) {
    const m = mesDe(item.requestedDate);
    if (!m || item.project === 'Sem projeto') continue;
    if (!primeiro.has(item.project) || m < primeiro.get(item.project)) primeiro.set(item.project, m);
  }
  const anterior = mesAnterior(mes);
  let atual = 0;
  let antes = 0;
  primeiro.forEach((m) => { if (m === mes) atual += 1; else if (m === anterior) antes += 1; });
  return antes ? { pct: Math.round(((atual - antes) / antes) * 100), atual, anterior: antes } : null;
}

/** Etapas com alguma data real (solicitação, início, conclusão, atualização) no intervalo de meses. */
export function movimentadasEntre(itens, de, ate) {
  return itens.filter((i) => CAMPOS_MOVIMENTO.some((c) => {
    const m = mesDe(i[c]);
    return m && m >= de && m <= ate;
  }));
}

/** Soma acumulada de um mapa mês → n ao longo dos meses informados. */
export function acumular(mapa, meses) {
  let soma = 0;
  return meses.map((m) => (soma += mapa[m] || 0));
}

/**
 * Atividade por mês: cada acontecimento conta pela sua data real — etapas
 * solicitadas, iniciadas e implantadas, e artigos publicados. Trilhas só
 * entram quando o JSON trouxer a data de disponibilização.
 */
export function atividadePorMes(itens, trilhas = [], artigos = []) {
  const saida = {};
  const somar = (mapa, chave) => Object.entries(mapa).forEach(([m, n]) => {
    if (!saida[m]) saida[m] = { total: 0, implantadas: 0, solicitadas: 0, iniciadas: 0, trilhas: 0, artigos: 0 };
    saida[m][chave] += n;
    saida[m].total += n;
  });
  somar(porMes(itens.filter((i) => i.status === 'Implantada'), 'doneDate'), 'implantadas');
  somar(porMes(itens, 'requestedDate'), 'solicitadas');
  somar(porMes(itens, 'startDate'), 'iniciadas');
  somar(porMes(trilhas.filter((t) => t.disponivel === true), 'dataDisponibilizacao'), 'trilhas');
  somar(porMes(artigos, 'data'), 'artigos');
  return saida;
}

/** Contagem por área × status (área vazia vira "Sem área" e vai por último). */
export function areaPorStatus(itens) {
  const mapa = new Map();
  for (const item of itens) {
    if (!mapa.has(item.area)) mapa.set(item.area, { area: item.area, total: 0, status: {} });
    const a = mapa.get(item.area);
    a.total += 1;
    a.status[item.status] = (a.status[item.status] || 0) + 1;
  }
  return [...mapa.values()];
}

export const FAIXAS_PROGRESSO = [
  { rotulo: '0%', ok: (p) => p === 0 },
  { rotulo: '1–25%', ok: (p) => p > 0 && p <= 25 },
  { rotulo: '26–50%', ok: (p) => p > 25 && p <= 50 },
  { rotulo: '51–75%', ok: (p) => p > 50 && p <= 75 },
  { rotulo: '76–99%', ok: (p) => p > 75 && p < 100 },
  { rotulo: '100%', ok: (p) => p >= 100 },
];

/** Iniciativas por faixa de progresso; progresso vazio fica fora e é contado à parte. */
export function distribuicaoProgresso(itens) {
  const contagem = FAIXAS_PROGRESSO.map(() => 0);
  let semValor = 0;
  for (const item of itens) {
    if (item.progress === null) { semValor += 1; continue; }
    const i = FAIXAS_PROGRESSO.findIndex((f) => f.ok(item.progress));
    if (i >= 0) contagem[i] += 1;
  }
  return { contagem, semValor };
}

/**
 * Sankey Áreas → Tecnologias → Status com conservação de totais: cada
 * iniciativa vale 1 e divide esse peso entre as suas tecnologias, então cada
 * coluna soma o total de iniciativas. Áreas e tecnologias além do topo vão
 * para "Outras".
 */
export function fluxoTransformacao(itens, topAreas = 5, topTecs = 5) {
  const tecsDe = (i) => (i.technologies.length ? [...new Set(i.technologies)] : ['Sem tecnologia']);
  const totArea = {};
  const pesoTec = {};
  for (const i of itens) {
    totArea[i.area] = (totArea[i.area] || 0) + 1;
    const ts = tecsDe(i);
    ts.forEach((t) => { pesoTec[t] = (pesoTec[t] || 0) + 1 / ts.length; });
  }
  const ordenar = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const areasTopo = ordenar(totArea).filter(([a]) => a !== 'Sem área').slice(0, topAreas).map(([a]) => a);
  const tecsTopo = ordenar(pesoTec).slice(0, topTecs).map(([t]) => t);
  const grupoArea = (a) => (areasTopo.includes(a) ? a : 'Outras áreas');
  const grupoTec = (t) => (tecsTopo.includes(t) ? t : 'Outras');

  const l1 = new Map();
  const l2 = new Map();
  const vA = {};
  const vT = {};
  const vS = {};
  for (const i of itens) {
    const a = grupoArea(i.area);
    vA[a] = (vA[a] || 0) + 1;
    vS[i.status] = (vS[i.status] || 0) + 1;
    const ts = tecsDe(i);
    const w = 1 / ts.length;
    ts.forEach((t0) => {
      const t = grupoTec(t0);
      vT[t] = (vT[t] || 0) + w;
      l1.set(`${a}→${t}`, (l1.get(`${a}→${t}`) || 0) + w);
      l2.set(`${t}→${i.status}`, (l2.get(`${t}→${i.status}`) || 0) + w);
    });
  }
  return {
    areas: [...areasTopo, 'Outras áreas'].filter((k) => vA[k]).map((k) => ({ k, v: vA[k] })),
    tecs: [...tecsTopo, 'Outras'].filter((k) => vT[k]).map((k) => ({ k, v: vT[k] })),
    status: [...STATUS_ORDEM, ...Object.keys(vS).filter((s) => !STATUS_ORDEM.includes(s))].filter((k) => vS[k]).map((k) => ({ k, v: vS[k] })),
    l1,
    l2,
    agrupou: areasTopo.length < Object.keys(totArea).filter((a) => a !== 'Sem área').length || tecsTopo.length < Object.keys(pesoTec).length,
    semTecnologia: itens.filter((i) => !i.technologies.length).length,
  };
}

/**
 * Caminho suave que não ultrapassa os próprios pontos (para séries no tempo):
 * cúbica monótona (Fritsch–Carlson), então um trecho plano continua plano e a
 * curva nunca desce abaixo de zero entre dois meses.
 */
export function curva(pontos) {
  const n = pontos.length;
  if (!n) return '';
  if (n < 3) return `M${pontos.map((p) => `${p[0]} ${p[1]}`).join('L')}`;
  const dx = [];
  const inc = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pontos[i + 1][0] - pontos[i][0]);
    inc.push(dx[i] ? (pontos[i + 1][1] - pontos[i][1]) / dx[i] : 0);
  }
  const tg = pontos.map((_, i) => {
    if (i === 0) return inc[0];
    if (i === n - 1) return inc[n - 2];
    return inc[i - 1] * inc[i] <= 0 ? 0 : (inc[i - 1] + inc[i]) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (!inc[i]) { tg[i] = 0; tg[i + 1] = 0; continue; }
    const a = tg[i] / inc[i];
    const b = tg[i + 1] / inc[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tg[i] = t * a * inc[i];
      tg[i + 1] = t * b * inc[i];
    }
  }
  const f = (v) => v.toFixed(1);
  let d = `M${f(pontos[0][0])} ${f(pontos[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pontos[i];
    const [x1, y1] = pontos[i + 1];
    const h = dx[i] / 3;
    d += ` C${f(x0 + h)} ${f(y0 + tg[i] * h)} ${f(x1 - h)} ${f(y1 - tg[i + 1] * h)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}
