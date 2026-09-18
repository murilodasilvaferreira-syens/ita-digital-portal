/**
 * Painéis do portal: gestão (três listas acionáveis) e detalhe da iniciativa.
 *
 * Regra que atravessa os dois: seção sem conteúdo é omitida por inteiro.
 * Nunca aparece rótulo com traço, nem contador vazio.
 *
 * Todo texto entra por textContent.
 */

import { FASE, PESO_PRIORIDADE, formatarData, plural } from './data.js';

const LIMITE_LISTA = 5;

/** 'Execução' -> 'execucao', para compor nomes de classe. */
const criarClasseFase = (fase) => String(fase).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* -------------------------------------------------------------------------- */
/* Helpers de DOM                                                              */
/* -------------------------------------------------------------------------- */

function criar(tag, classe, conteudo) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (conteudo !== undefined && conteudo !== null) node.textContent = String(conteudo);
  return node;
}

function linkExterno(href, rotulo, classe) {
  const a = criar('a', classe, rotulo);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** URL de chat do Teams com mensagem pronta. */
export function urlTeams(site, mensagem) {
  const email = site?.teams?.email ?? '';
  const texto = mensagem ?? site?.teams?.message ?? '';
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}&message=${encodeURIComponent(texto)}`;
}

/* -------------------------------------------------------------------------- */
/* Ordenações                                                                  */
/* -------------------------------------------------------------------------- */

const prioridadeDe = (item) => PESO_PRIORIDADE[item.priority] ?? 3;

/** Data ausente vai para o fim, nunca para o começo. */
function porData(campo) {
  return (a, b) => {
    const va = a[campo];
    const vb = b[campo];
    if (va === vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    return va < vb ? -1 : 1;
  };
}

function ordenarAtrasadas(itens) {
  return itens
    .filter((i) => i.atrasada)
    .sort((a, b) => porData('dueDate')(a, b) || prioridadeDe(a) - prioridadeDe(b));
}

/**
 * Próximas: primeiro o que já está em execução (mesmo travado, com selo —
 * o gestor não pode perder de vista o que começou), depois o que está pronto
 * para começar. Nada com dependência pendente entra pela porta das "prontas".
 */
function ordenarProximas(itens) {
  const execucao = itens
    .filter((i) => i.fase === FASE.EXECUCAO)
    .sort((a, b) => porData('dueDate')(a, b) || prioridadeDe(a) - prioridadeDe(b) || a.id - b.id);

  const prontas = itens
    .filter((i) => i.prontaParaIniciar)
    .sort((a, b) => prioridadeDe(a) - prioridadeDe(b) || porData('dueDate')(a, b) || porData('requestedDate')(a, b) || a.id - b.id);

  return [...execucao, ...prontas];
}

/** Aguardando: travadas que ainda não começaram. */
function ordenarAguardando(itens) {
  return itens
    .filter((i) => i.bloqueada && i.fase !== FASE.EXECUCAO && i.fase !== FASE.ENTREGUE)
    .sort((a, b) => prioridadeDe(a) - prioridadeDe(b) || porData('dueDate')(a, b) || a.id - b.id);
}

/* -------------------------------------------------------------------------- */
/* Painel de gestão                                                            */
/* -------------------------------------------------------------------------- */

export function criarPainelGestao({ container, dataset, aoAbrir, aoDestacar }) {
  const expandidos = new Set();

  function montarItem(item, extras) {
    const botao = criar('button', 'gestao__item');
    botao.type = 'button';
    botao.dataset.id = String(item.id);

    const topo = criar('span', 'gestao__linha');
    topo.appendChild(criar('span', 'gestao__titulo', item.title));
    if (item.priority) {
      topo.appendChild(criar('span', `selo selo--prioridade selo--${criarClasseFase(item.priority)}`, item.priority));
    }
    botao.appendChild(topo);

    const meta = criar('span', 'gestao__meta');
    meta.appendChild(criar('span', 'gestao__projeto', item.project));
    meta.appendChild(criar('span', 'gestao__status', item.status));
    if (item.bloqueada && item.fase === FASE.EXECUCAO) {
      meta.appendChild(criar('span', 'selo selo--bloqueio', 'bloqueada'));
    }
    botao.appendChild(meta);

    for (const extra of extras) {
      if (extra) botao.appendChild(extra);
    }

    botao.addEventListener('click', () => aoAbrir(item.id));
    botao.addEventListener('pointerenter', () => aoDestacar(item.id));
    botao.addEventListener('pointerleave', () => aoDestacar(null));
    botao.addEventListener('focus', () => aoDestacar(item.id));
    botao.addEventListener('blur', () => aoDestacar(null));
    return botao;
  }

  function extraAtraso(item) {
    const linha = criar('span', 'gestao__extra gestao__extra--alerta');
    linha.appendChild(criar('span', null, `Venceu em ${formatarData(item.dueDate)} · ${plural(item.diasAtraso, 'dia', 'dias')} de atraso`));
    return linha;
  }

  function extraProxima(item) {
    const partes = [];
    if (item.fase === FASE.EXECUCAO && item.dueDate) partes.push(`Prazo ${formatarData(item.dueDate)}`);
    if (item.progress !== null && item.fase === FASE.EXECUCAO) partes.push(`${item.progress}% concluído`);
    if (item.prontaParaIniciar && item.deps.length) partes.push('Dependências concluídas');
    if (!partes.length && !item.nextStep) return null;

    const bloco = criar('span', 'gestao__extra');
    if (partes.length) bloco.appendChild(criar('span', 'gestao__info', partes.join(' · ')));
    // nextStep só aparece quando existe: hoje só dois itens têm.
    if (item.nextStep) bloco.appendChild(criar('span', 'gestao__passo', item.nextStep));
    return bloco;
  }

  function extraBloqueio(item) {
    const bloco = criar('span', 'gestao__extra');
    for (const idDep of item.depsPendentes) {
      const dep = dataset.porId.get(idDep);
      if (!dep) continue;
      const linha = criar('span', 'gestao__dependencia');
      linha.appendChild(criar('span', 'gestao__dependencia-titulo', dep.title));
      linha.appendChild(criar('span', 'gestao__dependencia-status', dep.status));
      bloco.appendChild(linha);
    }
    return bloco.childElementCount ? bloco : null;
  }

  function montarBloco({ chave, titulo, itens, vazio, extras }) {
    const secao = criar('section', 'gestao__bloco');
    secao.dataset.bloco = chave;
    const cabecalho = criar('header', 'gestao__cabecalho');
    cabecalho.appendChild(criar('h3', 'gestao__nome', titulo));
    if (itens.length) cabecalho.appendChild(criar('span', 'gestao__contagem', itens.length));
    secao.appendChild(cabecalho);

    if (!itens.length) {
      secao.appendChild(criar('p', 'gestao__vazio', vazio));
      return secao;
    }

    const expandido = expandidos.has(chave);
    const visiveis = expandido ? itens : itens.slice(0, LIMITE_LISTA);
    const lista = criar('div', 'gestao__lista');
    visiveis.forEach((item, indice) => {
      const node = montarItem(item, extras(item));
      node.style.setProperty('--indice', String(indice));
      lista.appendChild(node);
    });
    secao.appendChild(lista);

    if (itens.length > LIMITE_LISTA) {
      const alternar = criar('button', 'gestao__mais', expandido ? 'ver menos' : `ver todas (${itens.length})`);
      alternar.type = 'button';
      alternar.addEventListener('click', () => {
        if (expandido) expandidos.delete(chave);
        else expandidos.add(chave);
        render(ultimosItens);
        // O render recria o painel inteiro e o botão clicado deixa de existir:
        // sem devolver o foco, quem usa teclado cai no <body> e recomeça a
        // tabulação do topo da página.
        container.querySelector(`[data-bloco="${chave}"] .gestao__mais`)?.focus();
      });
      secao.appendChild(alternar);
    }

    return secao;
  }

  let ultimosItens = [];

  function render(itens) {
    ultimosItens = itens;
    container.textContent = '';

    const blocos = [
      {
        chave: 'atrasadas',
        titulo: 'Atrasadas',
        itens: ordenarAtrasadas(itens),
        vazio: 'Nada atrasado por aqui.',
        extras: (item) => [extraAtraso(item)],
      },
      {
        chave: 'proximas',
        titulo: 'Próximas',
        itens: ordenarProximas(itens),
        vazio: 'Nada em execução nem pronto para começar.',
        extras: (item) => [extraProxima(item)],
      },
      {
        chave: 'aguardando',
        titulo: 'Aguardando',
        itens: ordenarAguardando(itens),
        vazio: 'Nenhuma iniciativa travada por dependência.',
        extras: (item) => [extraBloqueio(item)],
      },
    ];

    for (const bloco of blocos) container.appendChild(montarBloco(bloco));
  }

  return { render };
}

/* -------------------------------------------------------------------------- */
/* Painel de detalhe                                                           */
/* -------------------------------------------------------------------------- */

export function criarPainelDetalhe({ dialog, dataset, site, aoNavegar, aoFechar }) {
  const corpo = criar('div', 'detalhe__corpo');

  const fechar = criar('button', 'detalhe__fechar');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar detalhe');
  fechar.textContent = '×';
  fechar.addEventListener('click', () => dialog.close());

  dialog.append(fechar, corpo);

  // Clique no backdrop (fora do conteúdo) fecha.
  dialog.addEventListener('click', (evento) => {
    if (evento.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => aoFechar());

  function secao(titulo) {
    const node = criar('section', 'detalhe__secao');
    if (titulo) node.appendChild(criar('h3', 'detalhe__rotulo', titulo));
    return node;
  }

  /** Só cria o parágrafo se houver texto — é isso que evita rótulo órfão. */
  function paragrafo(titulo, valor) {
    if (!valor) return null;
    const node = secao(titulo);
    node.appendChild(criar('p', 'detalhe__texto', valor));
    return node;
  }

  function listaDeChips(titulo, valores) {
    if (!valores || !valores.length) return null;
    const node = secao(titulo);
    const lista = criar('div', 'detalhe__chips');
    for (const valor of valores) lista.appendChild(criar('span', 'chip', valor));
    node.appendChild(lista);
    return node;
  }

  function pessoas(item) {
    const campos = [
      ['Key user', item.keyUser],
      ['Solicitante', item.requester],
      ['Responsável digital', item.digitalOwner],
      ['Complexidade', item.complexity],
    ].filter(([, valor]) => Boolean(valor));
    if (!campos.length) return null;

    const node = secao(null);
    const grade = criar('dl', 'detalhe__grade');
    for (const [rotulo, valor] of campos) {
      grade.appendChild(criar('dt', 'detalhe__chave', rotulo));
      grade.appendChild(criar('dd', 'detalhe__valor', valor));
    }
    node.appendChild(grade);
    return node;
  }

  function dependencias(item) {
    const de = item.deps.map((id) => dataset.porId.get(id)).filter(Boolean);
    const destrava = item.dependentes.map((id) => dataset.porId.get(id)).filter(Boolean);
    if (!de.length && !destrava.length) return null;

    const node = secao(null);
    for (const [titulo, lista] of [['Depende de', de], ['Destrava', destrava]]) {
      if (!lista.length) continue;
      node.appendChild(criar('h3', 'detalhe__rotulo', titulo));
      const container = criar('div', 'detalhe__deps');
      for (const alvo of lista) {
        const botao = criar('button', 'detalhe__dep');
        botao.type = 'button';
        botao.appendChild(criar('span', 'detalhe__dep-titulo', alvo.title));
        botao.appendChild(criar('span', `detalhe__dep-status detalhe__dep-status--${alvo.fase === FASE.ENTREGUE ? 'ok' : 'pendente'}`, alvo.status));
        botao.addEventListener('click', () => aoNavegar(alvo.id));
        container.appendChild(botao);
      }
      node.appendChild(container);
    }
    return node;
  }

  function datas(item) {
    const campos = [
      ['Solicitada', item.requestedDate],
      ['Início', item.startDate],
      ['Prazo', item.dueDate],
      ['Conclusão', item.doneDate],
    ].filter(([, valor]) => Boolean(valor));
    if (!campos.length) return null;

    const node = secao('Datas');
    const linha = criar('div', 'detalhe__datas');
    for (const [rotulo, valor] of campos) {
      const marco = criar('div', 'detalhe__marco');
      marco.appendChild(criar('span', 'detalhe__marco-rotulo', rotulo));
      marco.appendChild(criar('span', 'detalhe__marco-valor', formatarData(valor)));
      if (rotulo === 'Prazo' && item.atrasada) marco.classList.add('detalhe__marco--alerta');
      linha.appendChild(marco);
    }
    node.appendChild(linha);
    return node;
  }

  function acoes(item) {
    const node = criar('div', 'detalhe__acoes');
    if (item.deliveryUrl) {
      node.appendChild(linkExterno(item.deliveryUrl, 'Abrir entrega', 'botao botao--primario'));
    }
    const mensagem = (site?.teams?.initiativeMessage ?? 'Sobre a iniciativa "{titulo}"').replace('{titulo}', item.title);
    node.appendChild(
      linkExterno(urlTeams(site, mensagem), site?.teams?.initiativeLabel ?? 'Falar sobre esta iniciativa', 'botao botao--secundario'),
    );
    return node;
  }

  /**
   * Resumo do projeto: o mesmo painel, com a leitura da raia inteira.
   * Chamado pelo clique no rótulo da raia.
   */
  function abrirProjeto(chaveRaia, itensDoProjeto) {
    const itens = itensDoProjeto.filter(Boolean);
    if (!itens.length) return false;

    corpo.textContent = '';
    const referencia = itens[0];
    const independentes = chaveRaia === 'independentes';

    const cabecalho = criar('header', 'detalhe__cabecalho');
    if (!independentes) cabecalho.appendChild(criar('p', 'detalhe__projeto', referencia.area));
    cabecalho.appendChild(criar('h2', 'detalhe__titulo', independentes ? 'Independentes' : referencia.project));
    cabecalho.appendChild(criar('p', 'detalhe__texto', plural(itens.length, 'iniciativa', 'iniciativas')));

    // Barra segmentada, um segmento por iniciativa — a mesma leitura da raia.
    const barra = criar('div', 'detalhe__segmentos');
    for (const item of itens) {
      const segmento = criar('span', `detalhe__segmento detalhe__segmento--${criarClasseFase(item.fase)}`);
      segmento.title = `${item.title} — ${item.status}`;
      barra.appendChild(segmento);
    }
    cabecalho.appendChild(barra);
    corpo.appendChild(cabecalho);

    // Contagem por fase: só as fases presentes entram.
    const porFase = new Map();
    for (const item of itens) porFase.set(item.fase, (porFase.get(item.fase) ?? 0) + 1);
    if (porFase.size) {
      const node = secao('Situação');
      const grade = criar('dl', 'detalhe__grade');
      for (const [fase, quantidade] of porFase) {
        grade.appendChild(criar('dt', 'detalhe__chave', fase));
        grade.appendChild(criar('dd', 'detalhe__valor', String(quantidade)));
      }
      node.appendChild(grade);
      corpo.appendChild(node);
    }

    const alertas = [];
    const atrasadas = itens.filter((i) => i.atrasada).length;
    const travadas = itens.filter((i) => i.bloqueada).length;
    if (atrasadas) alertas.push(`${plural(atrasadas, 'iniciativa atrasada', 'iniciativas atrasadas')}`);
    if (travadas) alertas.push(`${plural(travadas, 'iniciativa travada', 'iniciativas travadas')} por dependência`);
    if (alertas.length) {
      const node = secao('Atenção');
      node.appendChild(criar('p', 'detalhe__texto', alertas.join(' · ')));
      corpo.appendChild(node);
    }

    // Iniciativas do projeto, na ordem da árvore, clicáveis.
    const lista = secao('Iniciativas');
    const container = criar('div', 'detalhe__deps');
    for (const item of itens) {
      const botao = criar('button', 'detalhe__dep');
      botao.type = 'button';
      botao.appendChild(criar('span', 'detalhe__dep-titulo', item.title));
      botao.appendChild(criar('span', `detalhe__dep-status detalhe__dep-status--${item.fase === FASE.ENTREGUE ? 'ok' : 'pendente'}`, item.status));
      botao.addEventListener('click', () => aoNavegar(item.id));
      container.appendChild(botao);
    }
    lista.appendChild(container);
    corpo.appendChild(lista);

    const tecnologias = [...new Set(itens.flatMap((i) => i.technologies))];
    const ganhos = [...new Set(itens.flatMap((i) => i.gainTypes))];
    const pessoasChave = [...new Set(itens.map((i) => i.keyUser).filter(Boolean))];
    for (const node of [
      listaDeChips('Tecnologias', tecnologias),
      listaDeChips('Tipos de ganho', ganhos),
      listaDeChips('Key users', pessoasChave),
    ]) {
      if (node) corpo.appendChild(node);
    }

    if (!dialog.open) dialog.showModal();
    corpo.scrollTop = 0;
    return true;
  }

  function abrir(id) {
    const item = dataset.porId.get(id);
    if (!item) return false;

    corpo.textContent = '';

    // 1. Cabeçalho: título, projeto, status, progresso.
    const cabecalho = criar('header', 'detalhe__cabecalho');
    cabecalho.appendChild(criar('p', 'detalhe__projeto', `${item.project} · ${item.area}`));
    cabecalho.appendChild(criar('h2', 'detalhe__titulo', item.title));

    const selos = criar('div', 'detalhe__selos');
    selos.appendChild(criar('span', `selo selo--fase selo--${criarClasseFase(item.fase)}`, item.status));
    if (item.bloqueada) selos.appendChild(criar('span', 'selo selo--bloqueio', 'bloqueada'));
    if (item.atrasada) selos.appendChild(criar('span', 'selo selo--atraso', `atrasada há ${plural(item.diasAtraso, 'dia', 'dias')}`));
    if (item.semAtualizacao) selos.appendChild(criar('span', 'selo selo--parada', `sem atualização há ${plural(item.diasSemAtualizacao, 'dia', 'dias')}`));
    if (item.priority) selos.appendChild(criar('span', 'selo selo--prioridade', `prioridade ${item.priority.toLowerCase()}`));
    cabecalho.appendChild(selos);

    if (item.progress !== null) {
      const progresso = criar('div', 'detalhe__progresso');
      const trilha = criar('div', 'detalhe__trilha');
      const barra = criar('div', 'detalhe__barra');
      barra.style.setProperty('--valor', `${item.progress}%`);
      trilha.appendChild(barra);
      progresso.append(trilha, criar('span', 'detalhe__percentual', `${item.progress}%`));
      cabecalho.appendChild(progresso);
    }
    corpo.appendChild(cabecalho);

    // 2 a 7: cada seção some inteira quando não há dado.
    const secoes = [
      paragrafo('Próximo passo', item.nextStep),
      paragrafo('Comentário de status', item.statusComment),
      paragrafo('Descrição', item.description),
      paragrafo('Objetivo', item.objective),
      dependencias(item),
      pessoas(item),
      listaDeChips('Tipos de ganho', item.gainTypes),
      listaDeChips('Tecnologias', item.technologies),
      datas(item),
    ].filter(Boolean);

    for (const node of secoes) corpo.appendChild(node);
    corpo.appendChild(acoes(item));

    if (!dialog.open) dialog.showModal();
    corpo.scrollTop = 0;
    return true;
  }

  return {
    abrir,
    abrirProjeto,
    fechar: () => dialog.open && dialog.close(),
    get aberto() { return dialog.open; },
  };
}

export { ordenarAtrasadas, ordenarProximas, ordenarAguardando, LIMITE_LISTA };
