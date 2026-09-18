/**
 * Camada de dados do portal.
 *
 * Responsabilidades: carregar os três JSON (dados + duas configurações),
 * sanear o que vem da Microsoft List e derivar os campos que a interface usa.
 * Nada aqui toca no DOM da página — só produz objetos.
 *
 * `data/initiatives.json` é escrito exclusivamente pelo fluxo do Power Automate.
 * Este módulo só lê.
 */

const URL_DADOS = 'data/initiatives.json';
const URL_AREAS = 'config/areas.json';
const URL_SITE = 'config/site.json';

export const FASE = {
  PLANEJAMENTO: 'Planejamento',
  EXECUCAO: 'Execução',
  ENTREGUE: 'Entregue',
  INTERROMPIDA: 'Interrompida',
};

/** Status da lista -> fase derivada. Status desconhecido cai em Planejamento. */
const FASE_POR_STATUS = {
  'Ideia': FASE.PLANEJAMENTO,
  'Em análise': FASE.PLANEJAMENTO,
  'Aprovada': FASE.PLANEJAMENTO,
  'Backlog': FASE.PLANEJAMENTO,
  'Em desenvolvimento': FASE.EXECUCAO,
  'Em testes': FASE.EXECUCAO,
  'Implantada': FASE.ENTREGUE,
  'Em pausa': FASE.INTERROMPIDA,
  'Cancelada': FASE.INTERROMPIDA,
};

export const FASES_ORDEM = [FASE.EXECUCAO, FASE.PLANEJAMENTO, FASE.ENTREGUE, FASE.INTERROMPIDA];

export const PESO_PRIORIDADE = { 'Alta': 0, 'Média': 1, 'Baixa': 2 };

const STATUS_CONCLUIDO = 'Implantada';
const STATUS_CANCELADO = 'Cancelada';

/* -------------------------------------------------------------------------- */
/* Saneamento                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Devolve texto limpo ou null.
 * As colunas da lista já foram corrigidas, mas a proteção fica: se algum dia
 * voltar HTML (colunas rich text do SharePoint fazem isso), o que sai daqui é
 * texto puro. Usa DOMParser no navegador e um fallback sem DOM em Node,
 * para o mesmo módulo rodar nos testes headless.
 */
export function limparTexto(valor) {
  if (valor === null || valor === undefined) return null;
  let texto = String(valor);
  if (!texto) return null;

  if (/[<&]/.test(texto)) {
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(texto, 'text/html');
      texto = doc.body ? doc.body.textContent || '' : '';
    } else {
      texto = texto
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
    }
  }

  texto = texto.replace(/\s+/g, ' ').trim();
  return texto === '' ? null : texto;
}

/** Lista de objetos {Id, Value} -> lista de strings limpas, sem vazios nem repetidos. */
function listaDeValores(bruta) {
  if (!Array.isArray(bruta)) return [];
  const vistos = new Set();
  const saida = [];
  for (const item of bruta) {
    const valor = limparTexto(item && typeof item === 'object' ? item.Value : item);
    if (valor && !vistos.has(valor)) {
      vistos.add(valor);
      saida.push(valor);
    }
  }
  return saida;
}

/** Lista de objetos {Id, Value} -> lista de ids inteiros, sem repetidos. */
function listaDeIds(bruta) {
  if (!Array.isArray(bruta)) return [];
  const vistos = new Set();
  for (const item of bruta) {
    const cru = item && typeof item === 'object' ? item.Id : item;
    const id = Number(cru);
    if (Number.isInteger(id)) vistos.add(id);
  }
  return [...vistos];
}

/** Data 'YYYY-MM-DD' válida, ou null. Evita Date para não escorregar de fuso. */
function limparData(valor) {
  const texto = limparTexto(valor);
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  const mm = Number(mes);
  const dd = Number(dia);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

function limparProgresso(valor, status) {
  if (status === STATUS_CONCLUIDO) return 100;
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === '' || Number.isNaN(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function criarSlug(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sem-valor';
}

/** Minúsculas sem acento, para a busca não depender de digitação exata. */
export function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Datas                                                                       */
/* -------------------------------------------------------------------------- */

/** Hoje no fuso local, como 'YYYY-MM-DD' — comparável direto com os campos da lista. */
export function hojeISO(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

function paraDataLocal(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export function diasEntre(isoInicio, isoFim) {
  const a = paraDataLocal(isoInicio);
  const b = paraDataLocal(isoFim);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const FMT_DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** '2026-08-31' -> '31 de ago. de 2026'. Devolve null para entrada inválida. */
export function formatarData(iso) {
  const data = paraDataLocal(limparData(iso));
  return data ? FMT_DATA.format(data) : null;
}

/** ISO completo -> '16 de setembro de 2026 às 18:28'. */
export function formatarDataHora(iso) {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  return FMT_DATA_HORA.format(data).replace(', ', ' às ');
}

export function plural(n, singular, formaPlural) {
  return `${n} ${n === 1 ? singular : formaPlural}`;
}

/* -------------------------------------------------------------------------- */
/* Normalização e derivações                                                   */
/* -------------------------------------------------------------------------- */

function normalizarIniciativa(bruta) {
  const id = Number(bruta && bruta.id);
  if (!Number.isInteger(id)) return null;

  const status = limparTexto(bruta.status) || 'Ideia';
  const fase = FASE_POR_STATUS[status] || FASE.PLANEJAMENTO;

  return {
    id,
    title: limparTexto(bruta.title) || `Iniciativa ${id}`,
    area: limparTexto(bruta.area) || 'Sem área',
    project: limparTexto(bruta.project) || 'Sem projeto',
    description: limparTexto(bruta.description),
    objective: limparTexto(bruta.objective),
    requester: limparTexto(bruta.requester),
    keyUser: limparTexto(bruta.keyUser),
    digitalOwner: limparTexto(bruta.digitalOwner),
    priority: limparTexto(bruta.priority),
    complexity: limparTexto(bruta.complexity),
    gainTypes: listaDeValores(bruta.gainTypes),
    technologies: listaDeValores(bruta.technologies),
    status,
    fase,
    progress: limparProgresso(bruta.progress, status),
    nextStep: limparTexto(bruta.nextStep),
    statusComment: limparTexto(bruta.statusComment),
    deliveryUrl: limparTexto(bruta.deliveryUrl),
    dependsOn: listaDeIds(bruta.dependsOn),
    updatedAt: limparTexto(bruta.updatedAt),
    requestedDate: limparData(bruta.requestedDate),
    startDate: limparData(bruta.startDate),
    dueDate: limparData(bruta.dueDate),
    // doneDate só vale se a iniciativa foi realmente implantada.
    doneDate: status === STATUS_CONCLUIDO ? limparData(bruta.doneDate) : null,
  };
}

/**
 * Sanea o grafo: descarta auto-dependência, dependência para id inexistente e
 * arestas que fechariam ciclo (o layout por nível trava com ciclo).
 * Devolve o mapa id -> ids de dependência e o relatório do que foi descartado.
 */
function sanearGrafo(itens) {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const deps = new Map();
  const descartes = { auto: [], inexistente: [], ciclo: [] };

  for (const item of itens) {
    const validas = [];
    for (const idDep of item.dependsOn) {
      if (idDep === item.id) descartes.auto.push([item.id, idDep]);
      else if (!porId.has(idDep)) descartes.inexistente.push([item.id, idDep]);
      else validas.push(idDep);
    }
    deps.set(item.id, validas);
  }

  // DFS tricolor: aresta apontando para nó cinza (ainda na pilha) fecha ciclo.
  const BRANCO = 0;
  const CINZA = 1;
  const PRETO = 2;
  const cor = new Map(itens.map((i) => [i.id, BRANCO]));
  const visitar = (id) => {
    cor.set(id, CINZA);
    const mantidas = [];
    for (const idDep of deps.get(id)) {
      const c = cor.get(idDep);
      if (c === CINZA) {
        descartes.ciclo.push([id, idDep]);
        continue;
      }
      if (c === BRANCO) visitar(idDep);
      mantidas.push(idDep);
    }
    deps.set(id, mantidas);
    cor.set(id, PRETO);
  };
  for (const item of itens) if (cor.get(item.id) === BRANCO) visitar(item.id);

  return { deps, descartes };
}

function avisarDescartes(descartes) {
  const partes = [];
  if (descartes.auto.length) partes.push(`${descartes.auto.length} auto-dependência(s)`);
  if (descartes.inexistente.length) partes.push(`${descartes.inexistente.length} para id inexistente`);
  if (descartes.ciclo.length) partes.push(`${descartes.ciclo.length} que fechavam ciclo`);
  if (partes.length) {
    console.warn(`[dados] Dependências ignoradas: ${partes.join(', ')}.`, descartes);
  }
}

/**
 * Monta o dataset: itens derivados + índices do grafo.
 * `hoje` e `agora` são injetáveis para o teste headless ser determinístico.
 */
export function criarDataset(brutas, opcoes = {}) {
  const diasLimite = opcoes.staleDays ?? 30;
  const hoje = opcoes.hoje ?? hojeISO();
  const agora = opcoes.agora ? new Date(opcoes.agora) : new Date();

  const itens = (Array.isArray(brutas) ? brutas : [])
    .map(normalizarIniciativa)
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);

  const { deps, descartes } = sanearGrafo(itens);
  avisarDescartes(descartes);

  const porId = new Map(itens.map((i) => [i.id, i]));
  const dependentes = new Map(itens.map((i) => [i.id, []]));
  for (const [id, lista] of deps) {
    for (const idDep of lista) dependentes.get(idDep).push(id);
  }

  for (const item of itens) {
    const minhasDeps = deps.get(item.id);
    item.deps = minhasDeps;
    item.dependentes = dependentes.get(item.id);

    const pendentes = minhasDeps.filter((d) => porId.get(d).status !== STATUS_CONCLUIDO);
    item.depsPendentes = pendentes;
    item.bloqueada = pendentes.length > 0;
    item.prontaParaIniciar = item.fase === FASE.PLANEJAMENTO && !item.bloqueada;

    const venceu = item.dueDate !== null && item.dueDate < hoje;
    item.atrasada = venceu && item.status !== STATUS_CONCLUIDO && item.status !== STATUS_CANCELADO;
    item.diasAtraso = item.atrasada ? diasEntre(item.dueDate, hoje) : null;

    let diasSemMexer = null;
    if (item.updatedAt) {
      const quando = new Date(item.updatedAt);
      if (!Number.isNaN(quando.getTime())) {
        diasSemMexer = Math.floor((agora - quando) / 86400000);
      }
    }
    item.diasSemAtualizacao = diasSemMexer;
    item.semAtualizacao =
      diasSemMexer !== null && diasSemMexer > diasLimite && item.fase !== FASE.ENTREGUE;

    item.slugArea = criarSlug(item.area);
    item.slugProjeto = criarSlug(item.project);
    // Raia = área + projeto: "Capacitação em Analytics Industrial" existe em três áreas.
    item.chaveRaia = `${item.slugArea}::${item.slugProjeto}`;
    item.independente = minhasDeps.length === 0 && item.dependentes.length === 0;

    item.textoBusca = normalizarBusca(
      [
        item.title, item.project, item.area, item.description, item.objective,
        item.status, item.priority, item.nextStep, item.statusComment,
        item.keyUser, item.requester, item.digitalOwner,
        item.technologies.join(' '), item.gainTypes.join(' '),
      ].filter(Boolean).join(' '),
    );
  }

  const memoAcima = new Map();
  const memoAbaixo = new Map();
  const percorrer = (idInicial, mapa, memo) => {
    if (memo.has(idInicial)) return memo.get(idInicial);
    const alcancados = new Set();
    const fila = [...(mapa.get(idInicial) || [])];
    while (fila.length) {
      const atual = fila.pop();
      if (alcancados.has(atual)) continue;
      alcancados.add(atual);
      for (const proximo of mapa.get(atual) || []) fila.push(proximo);
    }
    memo.set(idInicial, alcancados);
    return alcancados;
  };

  const atualizadoEm = itens.reduce(
    (maior, i) => (i.updatedAt && (!maior || i.updatedAt > maior) ? i.updatedAt : maior),
    null,
  );

  return {
    itens,
    porId,
    deps,
    dependentes,
    descartes,
    atualizadoEm,
    hoje,
    /** Tudo de que `id` depende, direta ou indiretamente. */
    ancestrais: (id) => percorrer(id, deps, memoAcima),
    /** Tudo que `id` destrava, direta ou indiretamente. */
    descendentes: (id) => percorrer(id, dependentes, memoAbaixo),
  };
}

/* -------------------------------------------------------------------------- */
/* Carga                                                                       */
/* -------------------------------------------------------------------------- */

async function buscarJson(url) {
  // no-store: o CDN do GitHub Pages cacheia, e o Power Automate reescreve de hora em hora.
  const resposta = await fetch(url, { cache: 'no-store' });
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url} (HTTP ${resposta.status})`);
  return resposta.json();
}

/**
 * Carrega dados + configurações em paralelo e devolve tudo o que o app precisa.
 * Lança com mensagem legível se algum arquivo faltar.
 */
export async function carregarPortal(opcoes = {}) {
  const [dados, areasCfg, site] = await Promise.all([
    buscarJson(URL_DADOS),
    buscarJson(URL_AREAS),
    buscarJson(URL_SITE),
  ]);

  const areas = (areasCfg.areas || []).map((a) => ({
    slug: criarSlug(a.slug),
    name: limparTexto(a.name) || a.slug,
    description: limparTexto(a.description),
  }));

  const dataset = criarDataset(dados.initiatives, {
    staleDays: site.staleDays ?? 30,
    ...opcoes,
  });

  return { dataset, areas, site, schemaVersion: dados.schemaVersion ?? null };
}
