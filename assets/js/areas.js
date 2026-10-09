/**
 * Índice técnico (areas.html): o painel de cada área e o endereço estável
 * para colar no web part de iframe do SharePoint (areas/<slug>/).
 *
 * Usa a mesma camada de dados do roadmap — as contagens daqui são as que o
 * gestor vê ao abrir o painel.
 */

import { carregarPortal, FASES_ORDEM, formatarDataHora, classeFase } from './data.js';
import { montarCasca } from './shell.js';
import { criar, plural } from './ui.js';

const $ = (sel) => document.querySelector(sel);

/** Endereço absoluto do painel da área, para colar no iframe do SharePoint. */
function enderecoDeEmbed(slug) {
  return new URL(`areas/${slug}/`, new URL('.', window.location.href)).href;
}

async function copiar(texto, botao) {
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = 'Copiado';
  } catch {
    // Sem permissão de área de transferência (comum em iframe): seleciona o texto.
    const codigo = botao.previousElementSibling;
    const faixa = document.createRange();
    faixa.selectNodeContents(codigo);
    const selecao = window.getSelection();
    selecao.removeAllRanges();
    selecao.addRange(faixa);
    botao.textContent = 'Selecionado';
  }
  setTimeout(() => { botao.textContent = 'Copiar'; }, 1800);
}

iniciar();

async function iniciar() {
  let portal;
  try {
    [, portal] = await Promise.all([montarCasca({ ativa: 'roadmaps', marca: 'Índice técnico · Transformação Digital Itatiba' }), carregarPortal()]);
  } catch (erro) {
    $('#grade').textContent = `Não foi possível carregar os dados. ${erro.message}`;
    return;
  }
  const { dataset, areas } = portal;

  const quando = formatarDataHora(dataset.atualizadoEm);
  if (quando) {
    $('#atualizacao').textContent = `Dados atualizados em ${quando}`;
    $('#atualizacao').hidden = false;
  }

  const grade = $('#grade');
  areas.forEach((area) => {
    const itens = dataset.itens.filter((i) => i.slugArea === area.slug);
    const card = criar('article', 'vidro tecnico__area');

    const titulo = criar('h2', 'tecnico__nome');
    const link = criar('a', null, area.name);
    link.href = `index.html?area=${encodeURIComponent(area.slug)}`;
    titulo.appendChild(link);
    card.appendChild(titulo);
    if (area.description) card.appendChild(criar('p', 'tecnico__texto', area.description));

    if (!itens.length) {
      card.appendChild(criar('p', 'tecnico__vazio', 'Nenhuma iniciativa cadastrada ainda.'));
    } else {
      const barra = criar('div', 'tecnico__barra');
      barra.setAttribute('aria-hidden', 'true');
      itens.forEach((i) => barra.appendChild(criar('span', `seg seg--${classeFase(i.fase)}`)));
      card.appendChild(barra);

      const numeros = criar('dl', 'tecnico__numeros');
      const linhas = [['Iniciativas', itens.length]];
      FASES_ORDEM.forEach((f) => {
        const n = itens.filter((i) => i.fase === f).length;
        if (n) linhas.push([f, n]);
      });
      const atrasadas = itens.filter((i) => i.atrasada).length;
      if (atrasadas) linhas.push(['Atrasadas', atrasadas]);
      linhas.forEach(([rotulo, valor]) => {
        const par = criar('div', rotulo === 'Atrasadas' ? 'alerta' : null);
        par.append(criar('dt', null, rotulo), criar('dd', null, valor));
        numeros.appendChild(par);
      });
      card.appendChild(numeros);
    }

    const embed = criar('div', 'tecnico__embed');
    const endereco = enderecoDeEmbed(area.slug);
    const botao = criar('button', 'tecnico__copiar', 'Copiar');
    botao.type = 'button';
    botao.setAttribute('aria-label', `Copiar endereço de incorporação de ${area.name}`);
    botao.addEventListener('click', () => copiar(endereco, botao));
    embed.append(criar('span', 'tecnico__rotulo', 'Incorporar'), criar('code', null, endereco), botao);
    card.appendChild(embed);
    grade.appendChild(card);
  });

  // Área da lista que não existe em config/areas.json: aviso visível para corrigir.
  const conhecidas = new Set(areas.map((a) => a.slug));
  const foraDaConfig = [...new Set(dataset.itens.filter((i) => i.area !== 'Sem área' && !conhecidas.has(i.slugArea)).map((i) => i.area))];
  const semArea = dataset.itens.filter((i) => i.area === 'Sem área').length;
  const avisos = [];
  if (foraDaConfig.length) avisos.push(`Áreas na lista que não existem em config/areas.json: ${foraDaConfig.join(', ')}.`);
  if (semArea) avisos.push(`${semArea} ${plural(semArea, 'iniciativa está', 'iniciativas estão')} sem área preenchida na lista — aparecem só na visão de todas as áreas.`);
  if (avisos.length) {
    $('#alerta').textContent = avisos.join(' ');
    $('#alerta').hidden = false;
  }
}
