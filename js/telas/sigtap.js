/**
 * 🔍 BUSCAR PROCEDIMENTO SIGTAP — por código ou por palavras,
 * sempre na tabela (competência) mais recente.
 * Funciona como tela própria e como janela dentro da tela APAC
 * (com os botões "Usar como principal / secundário").
 */
import * as dados from '../dados.js';
import { h, modal, atrasar, toast } from '../ui.js';
import { esc, formatarCodigoSigtap } from '../lib/texto.js';

function montarBusca({ aoEscolher, fechar } = {}) {
  const info = h('div', { class: 'mudo pequeno', style: { marginBottom: '8px' } }, 'Carregando a tabela…');
  const lista = h('div', { class: 'resultados', style: { maxHeight: aoEscolher ? '55vh' : 'none' } });
  const campo = h('input', { type: 'search', placeholder: 'Ex.: colonoscopia, 0209010029, ultrassom abdomen…',
    style: { width: '100%', padding: '9px 11px', border: '2px solid var(--primaria)', borderRadius: '6px', fontSize: '14px' } });

  dados.infoSigtap().then((i) => {
    info.textContent = i.competencia
      ? 'Tabela SIGTAP em uso: competência ' + i.competencia.substring(4) + '/' + i.competencia.substring(0, 4) + ' · ' + i.total.toLocaleString('pt-BR') + ' procedimentos'
      : '⚠️ Nenhuma tabela SIGTAP carregada ainda (Ferramentas ▸ Atualizar tabela SIGTAP).';
  }).catch((e) => { info.textContent = e.message; });

  const buscar = atrasar(async (termo) => {
    if (termo.trim().length < 2) { lista.innerHTML = ''; return; }
    lista.innerHTML = '<div class="carregando pequeno"><span class="spinner"></span>Buscando…</div>';
    try {
      const r = await dados.buscarSigtap(termo, 80);
      lista.innerHTML = '';
      if (!r.length) { lista.appendChild(h('div', { class: 'mudo' }, 'Nenhum procedimento encontrado.')); return; }
      r.forEach((item) => {
        const botoes = aoEscolher ? h('div', { class: 'botoes', style: { marginTop: '6px' } },
          h('button', { type: 'button', class: 'btn pequeno principal', onclick: () => { aoEscolher(item, 'principal'); if (fechar) fechar(); } }, 'Usar como principal'),
          h('button', { type: 'button', class: 'btn pequeno', onclick: () => { aoEscolher(item, 'secundario'); if (fechar) fechar(); } }, 'Usar como secundário'))
          : h('div', { class: 'botoes', style: { marginTop: '6px' } },
              h('button', { type: 'button', class: 'btn pequeno', onclick: async () => {
                try { await navigator.clipboard.writeText(item.codigo); toast(item.codigo, '📋 Código copiado', 'ok', 3); }
                catch (e) { toast('Não consegui copiar. Selecione o código e copie.', 'Atenção', 'aviso'); }
              } }, '📋 Copiar código'));
        lista.appendChild(h('div', { class: 'resultado', style: { cursor: 'default' } },
          h('strong', { html: '<span style="font-family:monospace">' + esc(formatarCodigoSigtap(item.codigo)) + '</span> · ' + esc(item.nome) }),
          item.habilitacoes ? h('span', null, 'Habilitações: ' + item.habilitacoes) : null,
          botoes));
      });
      if (r.length >= 80) lista.appendChild(h('div', { class: 'mudo pequeno' }, 'Mostrando os 80 primeiros. Digite mais palavras para filtrar.'));
    } catch (e) {
      lista.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  });
  campo.addEventListener('input', () => buscar(campo.value));
  setTimeout(() => campo.focus(), 50);
  return h('div', null, info, campo, lista);
}

/** Janela de busca (usada pela tela APAC). aoEscolher(item, 'principal' | 'secundario') */
export function abrirBuscaSigtap({ aoEscolher } = {}) {
  const janela = modal({ titulo: '🔍 Buscar procedimento SIGTAP', largura: 640, conteudo: h('div'), botoes: [{ texto: 'Fechar' }] });
  janela.corpo.innerHTML = '';
  janela.corpo.appendChild(montarBusca({ aoEscolher, fechar: janela.fechar }));
}

export async function montar(area) {
  area.append(
    h('div', { class: 'titulo-tela' },
      h('div', null, h('h1', null, '🔍 Procedimentos SIGTAP'),
        h('p', null, 'Busque pelo código ou por palavras do nome (sem se preocupar com acento).')),
      dados.souAdmin() ? h('button', { type: 'button', class: 'btn', onclick: async () => {
        const { abrirAtualizarSigtap } = await import('./atualizar-sigtap.js');
        abrirAtualizarSigtap({ aoTerminar: () => { area.innerHTML = ''; montar(area); } });
      } }, '📥 Atualizar tabela (.zip)') : null),
    h('div', { class: 'card' }, h('div', { class: 'card-conteudo' }, montarBusca())));
}
