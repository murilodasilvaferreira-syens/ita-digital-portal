/**
 * Painel lateral do roadmap: detalhe da etapa ou resumo do projeto.
 *
 * Fica sobre o quadro sem bloqueá-lo — passar o mouse numa dependência listada
 * aqui acende a etapa no quadro. Navegar para uma dependência empilha o painel
 * atual, e "voltar" desempilha.
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

export function criarGaveta({ raiz, dataset, site, aoAbrirItem, aoAbrirProjeto, aoFechar, aoDestacar }) {
  const voltar = raiz.querySelector('[data-gaveta="voltar"]');
  const fechar = raiz.querySelector('[data-gaveta="fechar"]');
  const corpo = raiz.querySelector('[data-gaveta="corpo"]');
  const rodape = raiz.querySelector('[data-gaveta="rodape"]');

  let historico = [];
  let atual = null; // { tipo: 'item', id } | { tipo: 'projeto', chave, itens }

  fechar.addEventListener('click', () => aoFechar());
  voltar.addEventListener('click', () => {
    const anterior = historico.pop();
    if (!anterior) return;
    if (anterior.tipo === 'item') aoAbrirItem(anterior.id, { voltando: true });
    else aoAbrirProjeto(anterior.chave, { voltando: true });
  });

  /* ---- peças -------------------------------------------------------------- */

  const rotulo = (texto) => criar('h3', 'gaveta__rotulo', texto);

  function secao(titulo, ...filhos) {
    const s = criar('section', 'gaveta__secao');
    if (titulo) s.appendChild(rotulo(titulo));
    filhos.filter(Boolean).forEach((f) => s.appendChild(f));
    return s;
  }

  function chips(titulo, valores, classe = 'gaveta__chip') {
    if (!valores?.length) return null;
    const lista = criar('ul', 'gaveta__chips');
    valores.forEach((v) => lista.appendChild(criar('li', classe, v)));
    return secao(titulo, lista);
  }

  /** Item relacionado clicável: abre a etapa e acende-a no quadro ao passar. */
  function relacionado(alvo, tracejado) {
    const b = criar('button', `gaveta__rel${tracejado ? ' gaveta__rel--depois' : ''}`);
    b.type = 'button';
    b.append(iconeFase(alvo.fase), criar('span', 'gaveta__rel-titulo', alvo.title), criar('span', `gaveta__rel-status gaveta__rel-status--${classeFase(alvo.fase)}`, alvo.status));
    b.addEventListener('click', () => {
      empilhar();
      aoAbrirItem(alvo.id, { navegando: true });
    });
    b.addEventListener('pointerenter', () => aoDestacar(alvo.id));
    b.addEventListener('pointerleave', () => aoDestacar(null));
    b.addEventListener('focus', () => aoDestacar(alvo.id));
    b.addEventListener('blur', () => aoDestacar(null));
    return b;
  }

  function empilhar() {
    if (atual) historico.push(atual);
  }

  function atualizarVoltar() {
    const topo = historico[historico.length - 1];
    voltar.hidden = !topo;
    if (!topo) return;
    const titulo = topo.tipo === 'item' ? dataset.porId.get(topo.id)?.title : 'resumo do projeto';
    voltar.textContent = `← ${titulo ?? 'voltar'}`;
  }

  function abrirPainel() {
    const estavaAberto = raiz.classList.contains('aberta');
    raiz.hidden = false;
    // Um quadro de folga para a transição de entrada partir de fora da tela.
    requestAnimationFrame(() => raiz.classList.add('aberta'));
    corpo.scrollTop = 0;
    atualizarVoltar();
    if (!estavaAberto) fechar.focus({ preventScroll: true });
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

    corpo.appendChild(criar('p', 'gaveta__kicker', `${it.project} · ${it.area}`));
    corpo.appendChild(criar('h2', 'gaveta__titulo', it.title));

    const selos = criar('div', 'gaveta__selos');
    selos.appendChild(criar('span', `gaveta__selo gaveta__selo--${classeFase(it.fase)}`, it.status));
    if (it.bloqueada) selos.appendChild(criar('span', 'gaveta__selo', 'bloqueada'));
    if (it.atrasada) selos.appendChild(criar('span', 'gaveta__selo gaveta__selo--alerta', `atrasada há ${it.diasAtraso} ${plural(it.diasAtraso, 'dia', 'dias')}`));
    if (it.semAtualizacao) selos.appendChild(criar('span', 'gaveta__selo gaveta__selo--leve', `sem atualização há ${it.diasSemAtualizacao} ${plural(it.diasSemAtualizacao, 'dia', 'dias')}`));
    if (it.priority) selos.appendChild(criar('span', 'gaveta__selo gaveta__selo--leve', `prioridade ${it.priority.toLowerCase()}`));
    corpo.appendChild(selos);

    if (it.progress !== null) {
      const p = criar('div', `gaveta__progresso gaveta__progresso--${classeFase(it.fase)}`);
      const trilho = criar('div', 'gaveta__trilho');
      const barra = criar('div', 'gaveta__barra');
      barra.style.width = `${it.progress}%`;
      trilho.appendChild(barra);
      const lado = criar('div', 'gaveta__progresso-lado');
      lado.append(trilho, criar('span', 'gaveta__rotulo-mini', 'Progresso'));
      p.append(criar('span', 'numero gaveta__pct', `${it.progress}%`), lado);
      corpo.appendChild(p);
    }

    if (it.nextStep) {
      const caixa = criar('div', 'gaveta__proximo');
      caixa.append(criar('span', 'gaveta__rotulo-mini gaveta__rotulo-mini--acento', 'Próximo passo'), criar('p', null, it.nextStep));
      corpo.appendChild(caixa);
    }
    if (it.statusComment) {
      const c = criar('div', 'gaveta__comentario');
      c.append(criar('span', 'gaveta__rotulo-mini', 'Comentário de status'), criar('p', null, it.statusComment));
      corpo.appendChild(c);
    }

    // Cadeia: o que precisa acontecer antes, esta etapa, o que ela libera.
    const antes = it.deps.map((d) => dataset.porId.get(d)).filter(Boolean);
    const depois = it.dependentes.map((d) => dataset.porId.get(d)).filter(Boolean);
    if (antes.length || depois.length) {
      const cadeia = criar('div', 'gaveta__cadeia');
      if (antes.length) {
        const concluidas = antes.filter((a) => a.status === 'Implantada').length;
        const cab = criar('div', 'gaveta__cadeia-cab');
        cab.append(
          criar('span', null, 'Precisa acontecer antes'),
          criar('span', it.bloqueada ? 'gaveta__cadeia-info--alerta' : null,
            it.bloqueada ? `${it.depsPendentes.length} ${plural(it.depsPendentes.length, 'pendente', 'pendentes')}` : `${concluidas} de ${antes.length} ${plural(antes.length, 'concluída', 'concluídas')}`),
        );
        const lista = criar('div', 'gaveta__rels');
        antes.forEach((a) => lista.appendChild(relacionado(a, false)));
        cadeia.append(cab, lista);
      }
      const esta = criar('div', `gaveta__esta${antes.length ? '' : ' gaveta__esta--topo'}${depois.length ? '' : ' gaveta__esta--fim'}`);
      esta.append(criar('span', 'gaveta__esta-fio'), criar('span', 'gaveta__esta-selo', 'Esta etapa'));
      cadeia.appendChild(esta);
      if (depois.length) {
        const cab = criar('div', 'gaveta__cadeia-cab');
        cab.append(criar('span', null, 'Libera depois'), criar('span', null, `${depois.length} ${plural(depois.length, 'etapa', 'etapas')}`));
        const lista = criar('div', 'gaveta__rels');
        depois.forEach((d) => lista.appendChild(relacionado(d, true)));
        cadeia.append(cab, lista);
      }
      corpo.appendChild(cadeia);
    }

    if (it.description) corpo.appendChild(secao('Descrição', criar('p', 'gaveta__texto', it.description)));
    if (it.objective) corpo.appendChild(secao('Objetivo', criar('p', 'gaveta__texto', it.objective)));

    const pessoas = [['Key user', it.keyUser], ['Solicitante', it.requester], ['Responsável digital', it.digitalOwner], ['Complexidade', it.complexity]]
      .filter(([, v]) => v);
    if (pessoas.length) {
      const grade = criar('dl', 'gaveta__pessoas');
      pessoas.forEach(([k, v]) => {
        const cel = criar('div');
        const valor = criar('dd', null, v);
        if (k === 'Complexidade' && NIVEL[v]) {
          const escala = criar('span', 'gaveta__escala');
          escala.setAttribute('aria-hidden', 'true');
          [1, 2, 3].forEach((n) => escala.appendChild(criar('span', n <= NIVEL[v] ? 'cheio' : null)));
          valor.appendChild(escala);
        }
        cel.append(criar('dt', null, k), valor);
        grade.appendChild(cel);
      });
      corpo.appendChild(grade);
    }

    const ganhos = chips('Tipos de ganho', it.gainTypes, 'gaveta__chip gaveta__chip--acento');
    if (ganhos) corpo.appendChild(ganhos);
    const techs = chips('Tecnologias', it.technologies);
    if (techs) corpo.appendChild(techs);

    const marcos = [['Solicitada', it.requestedDate], ['Início', it.startDate], ['Prazo', it.dueDate], ['Conclusão', it.doneDate]].filter(([, v]) => v);
    if (marcos.length) {
      const linha = criar('ol', 'gaveta__datas');
      linha.style.setProperty('--n', String(marcos.length));
      marcos.forEach(([k, v]) => {
        const alerta = k === 'Prazo' && it.atrasada;
        const li = criar('li', alerta ? 'alerta' : k === 'Conclusão' ? 'feito' : null);
        li.append(criar('span', 'gaveta__marco'), criar('span', 'gaveta__rotulo-mini', k), criar('span', 'gaveta__data', formatarData(v)));
        linha.appendChild(li);
      });
      corpo.appendChild(secao('Datas', linha));
    }

    if (it.deliveryUrl && linkSeguro(it.deliveryUrl)) {
      const entrega = linkExterno(it.deliveryUrl, 'botao botao--primario');
      entrega.textContent = 'Abrir entrega ↗';
      rodape.appendChild(entrega);
    }
    const mensagem = (site?.teams?.initiativeMessage ?? 'Sobre a iniciativa "{titulo}"').replace('{titulo}', it.title);
    const teams = linkExterno(urlTeams(site, mensagem), 'botao botao--contorno');
    teams.textContent = site?.teams?.initiativeLabel ?? 'Falar sobre esta iniciativa';
    rodape.appendChild(teams);
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
    if (!independentes) corpo.appendChild(criar('p', 'gaveta__kicker', ref.area));
    corpo.appendChild(criar('h2', 'gaveta__titulo', titulo));
    corpo.appendChild(criar('p', 'gaveta__contagem', `${itens.length} ${plural(itens.length, 'iniciativa', 'iniciativas')}`));

    const segs = criar('div', 'gaveta__segmentos');
    segs.setAttribute('aria-hidden', 'true');
    itens.forEach((i) => segs.appendChild(criar('span', `seg seg--${classeFase(i.fase)}`)));
    corpo.appendChild(segs);

    const porFase = new Map();
    itens.forEach((i) => porFase.set(i.fase, (porFase.get(i.fase) || 0) + 1));
    const situacao = criar('dl', 'gaveta__situacao');
    for (const [fase, n] of porFase) {
      const cel = criar('div', fase === FASE.EXECUCAO ? 'execucao' : null);
      cel.append(criar('dd', 'numero', n), criar('dt', null, fase));
      situacao.appendChild(cel);
    }
    corpo.appendChild(situacao);

    const atrasadas = itens.filter((i) => i.atrasada).length;
    const travadas = itens.filter((i) => i.bloqueada).length;
    const alertas = [];
    if (atrasadas) alertas.push(`${atrasadas} ${plural(atrasadas, 'iniciativa atrasada', 'iniciativas atrasadas')}`);
    if (travadas) alertas.push(`${travadas} ${plural(travadas, 'iniciativa travada', 'iniciativas travadas')} por dependência`);
    if (alertas.length) corpo.appendChild(criar('p', 'gaveta__atencao', alertas.join(' · ')));

    const lista = criar('div', 'gaveta__rels');
    itens.forEach((i) => lista.appendChild(relacionado(i, false)));
    corpo.appendChild(secao('Iniciativas', lista));

    for (const [t, valores] of [
      ['Tecnologias', [...new Set(itens.flatMap((i) => i.technologies))]],
      ['Tipos de ganho', [...new Set(itens.flatMap((i) => i.gainTypes))]],
      ['Key users', [...new Set(itens.map((i) => i.keyUser).filter(Boolean))]],
    ]) {
      const bloco = chips(t, valores);
      if (bloco) corpo.appendChild(bloco);
    }

    abrirPainel();
    return true;
  }

  function esconder() {
    historico = [];
    atual = null;
    raiz.classList.remove('aberta');
    window.setTimeout(() => { if (!raiz.classList.contains('aberta')) raiz.hidden = true; }, 460);
  }

  return {
    mostrarItem,
    mostrarProjeto,
    esconder,
    get aberta() { return raiz.classList.contains('aberta'); },
    get atual() { return atual; },
  };
}
