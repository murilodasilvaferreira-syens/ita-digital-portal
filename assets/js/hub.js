/**
 * Índice de áreas: uma porta de entrada para visualizar cada painel e para
 * copiar o endereço de incorporação da página do SharePoint daquela área.
 *
 * Reaproveita a mesma camada de dados do portal — as contagens aqui são as
 * mesmas que o gestor vê ao abrir o painel.
 */

import { carregarPortal, FASE, FASES_ORDEM, formatarDataHora, plural } from './data.js';

const CLASSE_FASE = {
  [FASE.PLANEJAMENTO]: 'planejamento',
  [FASE.EXECUCAO]: 'execucao',
  [FASE.ENTREGUE]: 'entregue',
  [FASE.INTERROMPIDA]: 'interrompida',
};

function criar(tag, classe, conteudo) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (conteudo !== undefined && conteudo !== null) node.textContent = String(conteudo);
  return node;
}

/** Endereço absoluto do painel da área, para colar no iframe do SharePoint. */
function enderecoDeEmbed(slug) {
  const base = new URL('.', window.location.href);
  return new URL(`areas/${slug}/`, base).href;
}

async function iniciar() {
  const aviso = document.querySelector('#estado-carga');
  const hub = document.querySelector('#hub');

  let portal;
  try {
    portal = await carregarPortal();
  } catch (erro) {
    aviso.textContent = `Não foi possível carregar os dados. ${erro.message}`;
    console.error(erro);
    return;
  }

  const { dataset, areas, site } = portal;

  document.title = `Áreas · ${site.portalTitle} · ${site.plantName}`;
  document.querySelector('#portal-nome').textContent =
    [site.portalTitle, site.plantName].filter(Boolean).join(' · ');

  const atualizacao = formatarDataHora(dataset.atualizadoEm);
  const nodeAtualizacao = document.querySelector('#atualizacao');
  if (atualizacao) nodeAtualizacao.textContent = `Dados atualizados em ${atualizacao}`;
  else nodeAtualizacao.hidden = true;

  const grade = document.querySelector('#hub-grade');

  areas.forEach((area, indice) => {
    const itens = dataset.itens.filter((i) => i.slugArea === area.slug);

    const cartao = criar('article', 'hub__cartao');
    cartao.style.setProperty('--indice', String(indice));

    const link = criar('a', 'hub__link', area.name);
    link.href = `index.html?area=${encodeURIComponent(area.slug)}`;
    const titulo = criar('h2', 'hub__nome');
    titulo.appendChild(link);
    cartao.appendChild(titulo);

    if (area.description) cartao.appendChild(criar('p', 'hub__texto', area.description));

    if (!itens.length) {
      // Área configurada que ainda não tem iniciativa na lista.
      cartao.appendChild(criar('p', 'hub__vazio', 'Nenhuma iniciativa cadastrada ainda.'));
    } else {
      const barra = criar('div', 'hub__barra');
      for (const item of itens) {
        const segmento = criar('span', `hub__segmento hub__segmento--${CLASSE_FASE[item.fase]}`);
        segmento.title = `${item.title} — ${item.status}`;
        barra.appendChild(segmento);
      }
      cartao.appendChild(barra);

      const numeros = criar('dl', 'hub__numeros');
      const linhas = [['Iniciativas', itens.length]];
      for (const fase of FASES_ORDEM) {
        const quantidade = itens.filter((i) => i.fase === fase).length;
        if (quantidade) linhas.push([fase, quantidade]);
      }
      const atrasadas = itens.filter((i) => i.atrasada).length;
      if (atrasadas) linhas.push(['Atrasadas', atrasadas]);

      for (const [rotulo, valor] of linhas) {
        const par = criar('div', 'hub__par');
        par.appendChild(criar('dt', 'hub__rotulo', rotulo));
        par.appendChild(criar('dd', 'hub__valor', valor));
        if (rotulo === 'Atrasadas') par.classList.add('hub__par--alerta');
        numeros.appendChild(par);
      }
      cartao.appendChild(numeros);
    }

    const endereco = criar('p', 'hub__endereco');
    endereco.appendChild(criar('span', 'hub__endereco-rotulo', 'Incorporar:'));
    const codigo = criar('code', 'hub__codigo', enderecoDeEmbed(area.slug));
    endereco.appendChild(codigo);
    cartao.appendChild(endereco);

    grade.appendChild(cartao);
  });

  const semArea = dataset.itens.filter(
    (i) => !areas.some((a) => a.slug === i.slugArea),
  );
  if (semArea.length) {
    // Só aparece se a lista ganhar uma área que ainda não está em config/areas.json.
    const alerta = criar('p', 'hub__alerta');
    alerta.textContent = `${plural(semArea.length, 'iniciativa está', 'iniciativas estão')} numa área que não existe em config/areas.json: ${[...new Set(semArea.map((i) => i.area))].join(', ')}.`;
    grade.after(alerta);
  }

  aviso.hidden = true;
  hub.hidden = false;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
