/**
 * Painel de detalhe do roadmap: a etapa aberta ou o resumo do projeto.
 *
 * Abre ancorado no topo da raia do que foi clicado e ocupa a largura do quadro
 * (quadro.js cuida da posição e de fazer o palco crescer). Fica sobre o quadro
 * sem bloqueá-lo — passar o mouse numa dependência listada aqui acende a etapa
 * lá atrás. Navegar para uma dependência empilha o painel atual, e "voltar"
 * desempilha.
 *
 * Duas colunas no corpo: à esquerda o que se lê (próximo passo, descrição,
 * objetivo, comentário), à direita a cadeia de dependências. Os dados de
 * cadastro (pessoas, datas, tecnologias, ganhos) vão numa faixa única no fim.
 *
 * Regra que atravessa tudo: seção sem dado some inteira — nunca aparece rótulo
 * seguido de traço. Todo texto entra por textContent.
 */

import { FASE, formatarData } from './data.js';
import { criar, linkExterno, plural } from './ui.js';
import { iconeFase, classeFase } from './quadro.js';
import { urlTeams } from './shell.js';

const NIVEL = { 'Baixa': 1, 'Média': 2, 'Alta': 3 };

/** Só aceita link de entrega http(s): o resto não vira botão. */
function linkSeguro(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function criarDetalhe({ raiz, dataset, site, aoAbrirItem, aoAbrirProjeto, aoFechar, aoDestacar }) {
  const corpo = raiz.querySelector('[data-det="corpo"]');
  const rodape = raiz.querySelector('[data-det="rodape"]');

  let historico = [];
  let atual = null; // { tipo: 'item', id } | { tipo: 'projeto', chave, itens }

  /* ---- peças -------------------------------------------------------------- */

  const rotulo = (texto) => criar('span', 'det__rotulo', texto);

  /** Bloco de texto com rótulo em monoespaçada (descrição, objetivo…). */
  function bloco(titulo, texto, classe) {
    const d = criar('div', classe || null);
    d.append(rotulo(titulo), criar('p', 'det__texto', texto));
    return d;
  }

  function botaoFechar() {
    const b = criar('button', 'det__fechar', '×');
    b.type = 'button';
    b.title = 'Fechar (Esc)';
    b.setAttribute('aria-label', 'Fechar painel');
    b.addEventListener('click', () => aoFechar());
    return b;
  }

  /** "← voltar para…" só aparece quando se navegou por uma dependência. */
  function botaoVoltar() {
    const anterior = historico[historico.length - 1];
    if (!anterior) return null;
    const titulo = anterior.tipo === 'item' ? dataset.porId.get(anterior.id)?.title : 'resumo do projeto';
    const b = criar('button', 'det__voltar', `← ${titulo ?? 'voltar'}`);
    b.type = 'button';
    b.addEventListener('click', () => {
      const alvo = historico.pop();
      if (!alvo) return;
      if (alvo.tipo === 'item') aoAbrirItem(alvo.id, { voltando: true });
      else aoAbrirProjeto(alvo.chave, { voltando: true });
    });
    return b;
  }

  /** Linha de etapa relacionada: abre a etapa e acende-a no quadro ao passar. */
  function relacionado(alvo, tracejado) {
    const b = criar('button', `det__rel${tracejado ? ' det__rel--depois' : ''}`);
    b.type = 'button';
    b.append(
      iconeFase(alvo.fase),
      criar('span', 'det__rel-titulo', alvo.title),
      criar('span', `det__rel-status det__rel-status--${classeFase(alvo.fase)}`, alvo.status),
    );
    b.addEventListener('click', () => {
      if (atual) historico.push(atual);
      aoAbrirItem(alvo.id, { navegando: true });
    });
    b.addEventListener('pointerenter', () => aoDestacar(alvo.id));
    b.addEventListener('pointerleave', () => aoDestacar(null));
    b.addEventListener('focus', () => aoDestacar(alvo.id));
    b.addEventListener('blur', () => aoDestacar(null));
    return b;
  }

  /** Grupo de relacionadas com o contador à direita do rótulo. */
  function grupoRelacionadas(titulo, info, itens, { tracejado = false, alerta = false } = {}) {
    const d = criar('div', 'det__grupo');
    const cab = criar('div', 'det__grupo-cab');
    cab.append(rotulo(titulo), criar('span', alerta ? 'det__grupo-info det__grupo-info--alerta' : 'det__grupo-info', info));
    const lista = criar('div', 'det__rels');
    itens.forEach((i) => lista.appendChild(relacionado(i, tracejado)));
    d.append(cab, lista);
    return d;
  }

  /**
   * Faixa única de fatos no rodapé do corpo: pessoas, datas, tecnologias e
   * ganhos lado a lado, em vez de um bloco por assunto.
   */
  function faixaFatos(fatos) {
    if (!fatos.length) return null;
    const dl = criar('dl', 'det__fatos');
    fatos.forEach(({ k, v, escala }) => {
      const cel = criar('div');
      const valor = criar('dd', 'det__fato-valor');
      valor.appendChild(criar('span', null, v));
      if (escala) {
        const barras = criar('span', 'det__escala');
        barras.setAttribute('aria-hidden', 'true');
        [1, 2, 3].forEach((n) => barras.appendChild(criar('span', n <= escala ? 'cheio' : null)));
        valor.appendChild(barras);
      }
      cel.append(criar('dt', 'det__rotulo', k), valor);
      dl.appendChild(cel);
    });
    return dl;
  }

  function abrirPainel() {
    const estavaAberto = raiz.classList.contains('aberto');
    raiz.hidden = false;
    // Um quadro de folga para a transição de entrada partir do estado inicial.
    requestAnimationFrame(() => raiz.classList.add('aberto'));
    corpo.scrollTop = 0;
    if (!estavaAberto) raiz.querySelector('.det__fechar')?.focus({ preventScroll: true });
  }

  /* ---- detalhe da etapa ------------------------------------------------------ */

  function mostrarItem(id, { voltando = false, navegando = false } = {}) {
    const it = dataset.porId.get(id);
    if (!it) return false;
    if (!voltando && !navegando) historico = [];
    atual = { tipo: 'item', id };
    corpo.textContent = '';
    rodape.textContent = '';
    raiz.setAttribute('aria-label', `Detalhe: ${it.title}`);

    /* Cabeçalho: identificação à esquerda, progresso e fechar à direita. */
    const topo = criar('header', 'det__topo');
    const ident = criar('div', 'det__ident');
    const volta = botaoVoltar();
    if (volta) ident.appendChild(volta);
    ident.append(criar('p', 'det__kicker', `${it.project} · ${it.area}`), criar('h2', 'det__titulo', it.title));

    const selos = criar('div', 'det__selos');
    selos.appendChild(criar('span', `det__selo det__selo--${classeFase(it.fase)}`, it.status));
    if (it.bloqueada) selos.appendChild(criar('span', 'det__selo', 'bloqueada'));
    if (it.atrasada) selos.appendChild(criar('span', 'det__selo det__selo--alerta', `atrasada há ${it.diasAtraso} ${plural(it.diasAtraso, 'dia', 'dias')}`));
    if (it.semAtualizacao) selos.appendChild(criar('span', 'det__selo det__selo--leve', `sem atualização há ${it.diasSemAtualizacao} ${plural(it.diasSemAtualizacao, 'dia', 'dias')}`));
    if (it.priority) selos.appendChild(criar('span', 'det__selo det__selo--leve', `prioridade ${it.priority.toLowerCase()}`));
    ident.appendChild(selos);

    const lado = criar('div', 'det__lado');
    if (it.progress !== null) {
      const p = criar('div', `det__progresso det__progresso--${classeFase(it.fase)}`);
      const linha = criar('div', 'det__progresso-topo');
      linha.append(rotulo('Progresso'), criar('span', 'numero det__pct', `${it.progress}%`));
      const trilho = criar('div', 'det__trilho');
      const barra = criar('div', 'det__barra');
      barra.style.width = `${it.progress}%`;
      trilho.appendChild(barra);
      p.append(linha, trilho);
      lado.appendChild(p);
    }
    lado.appendChild(botaoFechar());
    topo.append(ident, lado);
    corpo.appendChild(topo);

    /* Corpo em duas colunas: leitura à esquerda, cadeia à direita. */
    const colunas = criar('div', 'det__colunas');
    const esq = criar('div', 'det__coluna');
    if (it.nextStep) {
      const caixa = criar('div', 'det__proximo');
      caixa.append(criar('span', 'det__rotulo det__rotulo--acento', 'Próximo passo'), criar('p', null, it.nextStep));
      esq.appendChild(caixa);
    }
    if (it.description) esq.appendChild(bloco('Descrição', it.description));
    if (it.objective) esq.appendChild(bloco('Objetivo', it.objective));
    if (it.statusComment) esq.appendChild(bloco('Comentário de status', it.statusComment, 'det__comentario'));

    const dir = criar('div', 'det__coluna');
    const antes = it.deps.map((d) => dataset.porId.get(d)).filter(Boolean);
    const depois = it.dependentes.map((d) => dataset.porId.get(d)).filter(Boolean);
    if (antes.length) {
      const concluidas = antes.filter((a) => a.status === 'Implantada').length;
      const info = it.bloqueada
        ? `${it.depsPendentes.length} ${plural(it.depsPendentes.length, 'pendente', 'pendentes')}`
        : `${concluidas} de ${antes.length} ${plural(antes.length, 'concluída', 'concluídas')}`;
      dir.appendChild(grupoRelacionadas('Precisa acontecer antes', info, antes, { alerta: it.bloqueada }));
    }
    if (depois.length) {
      dir.appendChild(grupoRelacionadas('Libera depois', `${depois.length} ${plural(depois.length, 'etapa', 'etapas')}`, depois, { tracejado: true }));
    }
    if (!antes.length && !depois.length) {
      dir.appendChild(criar('p', 'det__sem-relacao', 'Etapa independente: não depende de outras e não bloqueia nenhuma.'));
    }

    colunas.append(esq, dir);
    corpo.appendChild(colunas);

    /* Faixa de fatos: cadastro da etapa, tudo na mesma grade. */
    const fatos = [];
    [['Key user', it.keyUser], ['Solicitante', it.requester], ['Responsável digital', it.digitalOwner]]
      .forEach(([k, v]) => { if (v) fatos.push({ k, v }); });
    if (it.complexity) fatos.push({ k: 'Complexidade', v: it.complexity, escala: NIVEL[it.complexity] });
    [['Solicitada', it.requestedDate], ['Início', it.startDate], ['Prazo', it.dueDate], ['Conclusão', it.doneDate]]
      .forEach(([k, v]) => { if (v) fatos.push({ k, v: formatarData(v) }); });
    if (it.technologies.length) fatos.push({ k: 'Tecnologias', v: it.technologies.join(', ') });
    if (it.gainTypes.length) fatos.push({ k: 'Ganhos', v: it.gainTypes.join(', ') });
    const faixa = faixaFatos(fatos);
    if (faixa) corpo.appendChild(faixa);

    /* Rodapé fixo: dica do Esc à esquerda, ações à direita. */
    rodape.appendChild(criar('span', 'det__dica', 'Esc para fechar'));
    const acoes = criar('div', 'det__acoes');
    const mensagem = (site?.teams?.initiativeMessage ?? 'Sobre a iniciativa "{titulo}"').replace('{titulo}', it.title);
    const teams = linkExterno(urlTeams(site, mensagem), 'botao botao--contorno');
    teams.textContent = site?.teams?.initiativeLabel ?? 'Falar sobre esta iniciativa';
    acoes.appendChild(teams);
    if (it.deliveryUrl && linkSeguro(it.deliveryUrl)) {
      const entrega = linkExterno(it.deliveryUrl, 'botao botao--primario');
      entrega.textContent = 'Abrir entrega ↗';
      acoes.appendChild(entrega);
    }
    rodape.appendChild(acoes);
    rodape.hidden = false;

    abrirPainel();
    return true;
  }

  /* ---- resumo do projeto ------------------------------------------------------ */

  function mostrarProjeto(chave, itens, { voltando = false } = {}) {
    if (!itens?.length) return false;
    if (!voltando) historico = [];
    atual = { tipo: 'projeto', chave, itens };
    corpo.textContent = '';
    rodape.textContent = '';
    rodape.hidden = true;

    const ref = itens[0];
    const independentes = chave === 'independentes';
    const titulo = independentes ? 'Independentes' : ref.project;
    raiz.setAttribute('aria-label', `Resumo: ${titulo}`);

    const topo = criar('header', 'det__topo');
    const ident = criar('div', 'det__ident');
    const volta = botaoVoltar();
    if (volta) ident.appendChild(volta);
    if (!independentes) ident.appendChild(criar('p', 'det__kicker', ref.area));
    ident.append(criar('h2', 'det__titulo', titulo), criar('p', 'det__contagem', `${itens.length} ${plural(itens.length, 'iniciativa', 'iniciativas')}`));
    const lado = criar('div', 'det__lado');
    lado.appendChild(botaoFechar());
    topo.append(ident, lado);
    corpo.appendChild(topo);

    const colunas = criar('div', 'det__colunas det__colunas--projeto');

    /* Esquerda: barra de fases, contagem por fase e o que pede atenção. */
    const esq = criar('div', 'det__coluna');
    const segs = criar('div', 'det__segmentos');
    segs.setAttribute('aria-hidden', 'true');
    itens.forEach((i) => segs.appendChild(criar('span', `seg seg--${classeFase(i.fase)}`)));
    esq.appendChild(segs);

    const porFase = new Map();
    itens.forEach((i) => porFase.set(i.fase, (porFase.get(i.fase) || 0) + 1));
    const situacao = criar('dl', 'det__situacao');
    for (const [fase, n] of porFase) {
      const cel = criar('div', fase === FASE.EXECUCAO ? 'execucao' : null);
      cel.append(criar('dd', 'numero', n), criar('dt', null, fase));
      situacao.appendChild(cel);
    }
    esq.appendChild(situacao);

    const atrasadas = itens.filter((i) => i.atrasada).length;
    const travadas = itens.filter((i) => i.bloqueada).length;
    const alertas = [];
    if (atrasadas) alertas.push(`${atrasadas} ${plural(atrasadas, 'iniciativa atrasada', 'iniciativas atrasadas')}`);
    if (travadas) alertas.push(`${travadas} ${plural(travadas, 'iniciativa travada', 'iniciativas travadas')} por dependência`);
    if (alertas.length) esq.appendChild(criar('p', 'det__atencao', alertas.join(' · ')));

    /* Direita: as iniciativas da raia, em duas colunas. */
    const dir = criar('div', 'det__coluna');
    const grupo = criar('div', 'det__grupo');
    const lista = criar('div', 'det__rels det__rels--duplo');
    itens.forEach((i) => lista.appendChild(relacionado(i, false)));
    grupo.append(rotulo('Iniciativas'), lista);
    dir.appendChild(grupo);

    colunas.append(esq, dir);
    corpo.appendChild(colunas);

    const fatos = [];
    for (const [k, valores] of [
      ['Tecnologias', [...new Set(itens.flatMap((i) => i.technologies))]],
      ['Tipos de ganho', [...new Set(itens.flatMap((i) => i.gainTypes))]],
      ['Key users', [...new Set(itens.map((i) => i.keyUser).filter(Boolean))]],
    ]) {
      if (valores.length) fatos.push({ k, v: valores.join(', ') });
    }
    const faixa = faixaFatos(fatos);
    if (faixa) corpo.appendChild(faixa);

    abrirPainel();
    return true;
  }

  function esconder() {
    historico = [];
    atual = null;
    raiz.classList.remove('aberto');
    window.setTimeout(() => { if (!raiz.classList.contains('aberto')) raiz.hidden = true; }, 420);
  }

  return {
    mostrarItem,
    mostrarProjeto,
    esconder,
    get aberto() { return raiz.classList.contains('aberto'); },
    get atual() { return atual; },
  };
}
