/**
 * "O que pede atenção": as três listas acionáveis abaixo do quadro.
 *
 *   Atrasadas  — prazo vencido e ainda não implantadas, mais antiga primeiro
 *   Próximas   — o que já está em execução (mesmo travado, com aviso: o que
 *                começou não pode sumir da vista) e depois o que está pronto
 *                para começar. Nada com dependência pendente entra como pronta.
 *   Aguardando — travadas por dependência que ainda não começaram
 *
 * Cada lista mostra 5 e expande com "ver todas". Passar o mouse num item acende
 * a cadeia dele no quadro. Todo texto entra por textContent.
 */

import { FASE, PESO_PRIORIDADE, formatarData } from './data.js';
import { criar, plural } from './ui.js';

const LIMITE = 5;
const prioridadeDe = (item) => PESO_PRIORIDADE[item.priority] ?? 3;

/** Data ausente vai para o fim, nunca para o começo. */
const porData = (campo) => (a, b) => {
  const va = a[campo];
  const vb = b[campo];
  if (va === vb) return 0;
  if (!va) return 1;
  if (!vb) return -1;
  return va < vb ? -1 : 1;
};

export function ordenarAtrasadas(itens) {
  return itens.filter((i) => i.atrasada).sort((a, b) => porData('dueDate')(a, b) || prioridadeDe(a) - prioridadeDe(b));
}

export function ordenarProximas(itens) {
  const execucao = itens
    .filter((i) => i.fase === FASE.EXECUCAO)
    .sort((a, b) => porData('dueDate')(a, b) || prioridadeDe(a) - prioridadeDe(b) || a.id - b.id);
  const prontas = itens
    .filter((i) => i.prontaParaIniciar)
    .sort((a, b) => prioridadeDe(a) - prioridadeDe(b) || porData('dueDate')(a, b) || porData('requestedDate')(a, b) || a.id - b.id);
  return [...execucao, ...prontas];
}

export function ordenarAguardando(itens) {
  return itens
    .filter((i) => i.bloqueada && i.fase !== FASE.EXECUCAO && i.fase !== FASE.ENTREGUE)
    .sort((a, b) => prioridadeDe(a) - prioridadeDe(b) || porData('dueDate')(a, b) || a.id - b.id);
}

export function criarAtencao({ container, dataset, aoAbrir, aoDestacar }) {
  const expandidas = new Set();
  let itensAtuais = [];

  function selo(prioridade) {
    const classe = prioridade === 'Alta' ? 'prio prio--alta' : prioridade === 'Média' ? 'prio prio--media' : 'prio';
    return criar('span', classe, prioridade || '—');
  }

  function item(i, extras) {
    const botao = criar('button', 'atencao__item');
    botao.type = 'button';
    const topo = criar('span', 'atencao__linha');
    topo.append(criar('span', 'atencao__titulo', i.title), selo(i.priority));
    const meta = criar('span', 'atencao__meta');
    meta.append(criar('span', null, i.project), criar('span', 'atencao__sep', '·'), criar('span', null, i.status));
    if (i.bloqueada && i.fase === FASE.EXECUCAO) {
      meta.append(criar('span', 'atencao__sep', '·'), criar('span', 'atencao__bloqueio', 'bloqueada'));
    }
    botao.append(topo, meta);
    for (const [texto, classe] of extras) botao.appendChild(criar('span', `atencao__extra${classe ? ` atencao__extra--${classe}` : ''}`, texto));

    botao.addEventListener('click', () => aoAbrir(i.id, botao));
    botao.addEventListener('pointerenter', () => aoDestacar(i.id));
    botao.addEventListener('pointerleave', () => aoDestacar(null));
    botao.addEventListener('focus', () => aoDestacar(i.id));
    botao.addEventListener('blur', () => aoDestacar(null));
    return botao;
  }

  function bloco(chave, titulo, sub, lista, vazio, acento, extras) {
    const card = criar('section', 'vidro atencao__bloco');
    card.setAttribute('aria-label', titulo);
    const cab = criar('div', 'atencao__cabecalho');
    const textos = criar('div');
    textos.append(criar('h3', 'atencao__titulo-bloco', titulo), criar('p', 'atencao__sub', sub));
    const n = criar('span', `numero atencao__n${lista.length ? ` atencao__n--${acento}` : ' atencao__n--zero'}`, lista.length);
    cab.append(textos, n);
    card.appendChild(cab);

    if (!lista.length) {
      card.appendChild(criar('p', 'atencao__vazio', vazio));
      return card;
    }
    const aberta = expandidas.has(chave);
    const ul = criar('ul', 'atencao__lista');
    (aberta ? lista : lista.slice(0, LIMITE)).forEach((i) => {
      const li = criar('li');
      li.appendChild(item(i, extras(i)));
      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (lista.length > LIMITE) {
      const mais = criar('button', 'botao botao--texto atencao__mais', aberta ? 'ver menos' : `ver todas (${lista.length})`);
      mais.type = 'button';
      mais.setAttribute('aria-expanded', String(aberta));
      mais.addEventListener('click', () => {
        if (aberta) expandidas.delete(chave);
        else expandidas.add(chave);
        render(itensAtuais);
        container.querySelector(`[aria-label="${titulo}"] .atencao__mais`)?.focus();
      });
      card.appendChild(mais);
    }
    return card;
  }

  function render(itens) {
    itensAtuais = itens;
    container.textContent = '';
    container.append(
      bloco('atrasadas', 'Atrasadas', 'Prazo vencido e ainda não implantadas', ordenarAtrasadas(itens),
        'Nada atrasado por aqui.', 'alerta',
        (i) => [[`Venceu em ${formatarData(i.dueDate)} · ${i.diasAtraso} ${plural(i.diasAtraso, 'dia', 'dias')} de atraso`, 'alerta']]),
      bloco('proximas', 'Próximas', 'Em execução ou prontas para começar', ordenarProximas(itens),
        'Nada em execução nem pronto para começar.', 'tinta',
        (i) => {
          const partes = [];
          if (i.fase === FASE.EXECUCAO && i.dueDate) partes.push(`Prazo ${formatarData(i.dueDate)}`);
          if (i.fase === FASE.EXECUCAO && i.progress !== null) partes.push(`${i.progress}% concluído`);
          if (i.prontaParaIniciar && i.deps.length) partes.push('Dependências concluídas');
          const extras = [];
          if (partes.length) extras.push([partes.join(' · '), '']);
          if (i.nextStep) extras.push([`→ ${i.nextStep}`, 'acento']);
          return extras;
        }),
      bloco('aguardando', 'Aguardando', 'Travadas por dependência pendente', ordenarAguardando(itens),
        'Nenhuma iniciativa travada por dependência.', 'tinta',
        (i) => i.depsPendentes.map((d) => dataset.porId.get(d)).filter(Boolean).map((d) => [`↳ ${d.title} — ${d.status}`, 'fraco'])),
    );
  }

  return { render };
}
