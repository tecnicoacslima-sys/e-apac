/**
 * 🔄 AVISO DE VERSÃO NOVA
 * A cada atualização do site vai junto um versao.json novo. Enquanto o sistema
 * está aberto, ele confere esse arquivo de 5 em 5 minutos (e ao voltar para a aba).
 * Se mudou, aparece a faixa "Há uma versão nova — Atualizar agora".
 * Ao atualizar, busca de novo todos os arquivos do site (sem usar a memória do
 * navegador) e recarrega a página — por isso não precisa mais do Ctrl+Shift+R.
 */
import { h } from '../ui.js';

const ENDERECO = new URL('../../versao.json', import.meta.url);
let carregada = null;
let faixa = null;

async function lerVersao() {
  const r = await fetch(ENDERECO.href + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return null;
  return r.json();
}

/** Busca de novo cada arquivo do site, para o navegador guardar a versão nova. */
async function renovarArquivos(info) {
  const base = new URL('./', ENDERECO);
  const urls = new Set((info && info.arquivos || []).map((a) => new URL(a, base).href));
  performance.getEntriesByType('resource').forEach((e) => {
    if (e.name.startsWith(location.origin) && /\.(m?js|css)(\?|$)/.test(e.name)) urls.add(e.name.split('#')[0]);
  });
  urls.add(new URL('index.html', base).href);
  await Promise.all([...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
}

async function atualizarAgora(botao) {
  if (botao) { botao.disabled = true; botao.textContent = 'Atualizando…'; }
  try { await renovarArquivos(await lerVersao()); } catch (e) { /* recarrega mesmo assim */ }
  location.reload();
}

function mostrarFaixa() {
  if (faixa) return;
  const botao = h('button', { type: 'button', class: 'faixa-versao-botao', onclick: (e) => atualizarAgora(e.currentTarget) }, 'Atualizar agora');
  faixa = h('div', { class: 'faixa-versao', role: 'status' },
    h('span', null, '🔄 Há uma versão nova do APAC digital.'),
    h('span', { class: 'faixa-versao-dica' }, 'O formulário da APAC fica guardado.'),
    botao,
    h('button', { type: 'button', class: 'faixa-versao-fechar', title: 'Depois', onclick: () => { faixa.remove(); faixa = null; } }, '×'));
  document.body.appendChild(faixa);
}

export async function conferirVersao() {
  try {
    const info = await lerVersao();
    const v = info && info.versao;
    if (!v) return false;
    if (!carregada) { carregada = v; return false; }
    if (v !== carregada) { mostrarFaixa(); return true; }
  } catch (e) { /* sem internet: tenta depois */ }
  return false;
}

export function vigiarVersao(minutos = 5) {
  conferirVersao();
  setInterval(conferirVersao, minutos * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferirVersao(); });
  window.__conferirVersao = conferirVersao;   // usado pelo teste automático
}
