/**
 * Acesso ao conteúdo editorial: artigos (content/noticias) e trilhas
 * (data/academia). Compartilhado por Início, Notícias, Academia e Indicadores
 * para todos lerem, ordenarem e calcularem do mesmo jeito.
 */

import { buscarJSON, normalizar } from './ui.js';

const PALAVRAS_POR_MINUTO = 200;
const corpos = new Map();

/** Índice de artigos válidos, do mais recente ao mais antigo. */
export async function carregarArtigos() {
  const indice = await buscarJSON('content/noticias/index.json');
  return (Array.isArray(indice?.artigos) ? indice.artigos : [])
    .filter((a) => a && a.slug && a.titulo)
    .map((a) => ({
      ...a,
      textoBusca: normalizar([a.titulo, a.resumo, a.categoria, a.autor].filter(Boolean).join(' ')),
    }))
    .sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));
}

/** Corpo em Markdown de um artigo, lido uma vez. */
export function carregarCorpo(slug) {
  if (!corpos.has(slug)) {
    const promessa = fetch(`content/noticias/${encodeURIComponent(slug)}.md`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
    corpos.set(slug, promessa);
    promessa.catch(() => corpos.delete(slug));
  }
  return corpos.get(slug);
}

/** Tempo de leitura a partir do texto — nunca de um campo digitado à mão. */
export function minutosDeLeitura(markdown) {
  const palavras = String(markdown ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / PALAVRAS_POR_MINUTO));
}

/** Minutos de leitura de um artigo, ou null se o corpo não carregar. */
export async function minutosDoArtigo(slug) {
  try {
    return minutosDeLeitura(await carregarCorpo(slug));
  } catch {
    return null;
  }
}

/** Escolhe a manchete: a marcada como destaque; sem nenhuma, a mais recente. */
export function escolherManchete(artigos) {
  return artigos.find((a) => a.destaque === true) || artigos[0] || null;
}

/** Trilhas e perfis da Academia. */
export async function carregarTrilhas() {
  const dados = await buscarJSON('data/academia/trilhas.json');
  return {
    trilhas: Array.isArray(dados?.trilhas) ? dados.trilhas.filter((t) => t && t.id && t.nome) : [],
    perfis: Array.isArray(dados?.perfis) ? dados.perfis : [],
  };
}

const FMT_DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const FMT_DIA_MES_ANO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function dataLocal(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** '2026-09-21' -> '21 set 2026' (sem pontos e sem "de"). */
export function dataCurta(iso, { ano = true } = {}) {
  const d = dataLocal(iso);
  if (!d) return '';
  return (ano ? FMT_DIA_MES_ANO : FMT_DIA_MES).format(d).replace(/\./g, '').replace(/ de /g, ' ');
}

/** Dias corridos desde a data até hoje. */
export function diasDesde(iso, agora = new Date()) {
  const d = dataLocal(iso);
  if (!d) return null;
  return Math.floor((agora - d) / 86400000);
}
