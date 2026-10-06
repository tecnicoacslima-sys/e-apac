/**
 * PROTOCOLO (antes: abas CHECK_LIST e PROTOCOLO_APAC) e APACs GERADAS.
 *  • Lista o que foi salvo em ④, com PÁGINA, OBS. e RECEB editáveis.
 *  • Imprime o "Protocolo de APAC's externas enviadas ao setor de
 *    Controle, Avaliação e Auditoria SUS" das linhas marcadas.
 *  • Exporta em planilha (CSV).
 *  • APACs geradas: reabre o PDF ou carrega no formulário.
 */
import * as dados from '../dados.js';
import { h, toast, confirmar, alerta } from '../ui.js';
import { esc, isoParaBR, brParaISO, mascararData, dataHoraBR, partesData } from '../lib/texto.js';
import { carregarDadosSalvos } from './apac.js';

let linhas = [];
let marcadas = new Set();
let corpo, contador;

export async function montar(area) {
  const conteudo = h('div');
  const abas = h('div', { class: 'abas' });
  const abrir = (qual) => {
    abas.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === qual));
    conteudo.innerHTML = '';
    if (qual === 'protocolo') montarProtocolo(conteudo); else montarApacs(conteudo);
  };
  abas.append(
    h('button', { 'data-aba': 'protocolo', onclick: () => abrir('protocolo') }, '📑 Protocolo / Check-list'),
    h('button', { 'data-aba': 'apacs', onclick: () => abrir('apacs') }, '📄 APACs geradas'));

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null, h('h1', null, '📑 Protocolo'),
      h('p', null, 'Tudo o que foi salvo pelo botão ④, e os PDFs gerados pelo botão ③.'))),
    abas, conteudo);
  abrir('protocolo');
}

// ============================================================
// PROTOCOLO / CHECK-LIST
// ============================================================
function montarProtocolo(area) {
  const hoje = partesData();
  const ini = new Date(Date.now() - 30 * 86400000);
  const pi = partesData(ini);
  const de = h('input', { type: 'date', value: pi.ano + '-' + pi.mes + '-' + pi.dia });
  const ate = h('input', { type: 'date', value: hoje.ano + '-' + hoje.mes + '-' + hoje.dia });
  const texto = h('input', { type: 'search', placeholder: 'Paciente, procedimento ou código' });
  contador = h('span', { class: 'mudo pequeno' });
  corpo = h('tbody');
  const marcarTodos = h('input', { type: 'checkbox', title: 'Marcar todos', onchange: () => {
    marcadas = marcarTodos.checked ? new Set(linhas.map((l) => l.id)) : new Set();
    corpo.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = marcarTodos.checked; });
    atualizarContador();
  } });

  const carregar = async () => {
    corpo.innerHTML = '<tr><td colspan="12"><div class="carregando"><span class="spinner"></span>Carregando…</div></td></tr>';
    marcadas = new Set();
    marcarTodos.checked = false;
    try {
      linhas = await dados.listarProtocolo({ de: de.value, ate: ate.value, texto: texto.value });
      desenhar();
    } catch (e) {
      corpo.innerHTML = '<tr><td colspan="12"><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
    }
  };
  [de, ate].forEach((el) => el.addEventListener('change', carregar));
  texto.addEventListener('keydown', (e) => { if (e.key === 'Enter') carregar(); });

  area.append(h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
    h('div', { class: 'filtros' },
      h('div', { class: 'campo' }, h('label', null, 'Salvos de'), de),
      h('div', { class: 'campo' }, h('label', null, 'até'), ate),
      h('div', { class: 'campo', style: { flex: '1', minWidth: '200px' } }, h('label', null, 'Procurar'), texto),
      h('button', { class: 'btn', onclick: carregar }, '🔎 Filtrar')),
    h('div', { class: 'botoes', style: { marginBottom: '10px' } },
      h('button', { class: 'btn principal', onclick: imprimirProtocolo }, '🖨️ Imprimir protocolo (linhas marcadas)'),
      h('button', { class: 'btn', onclick: exportarCsv }, '⬇️ Baixar planilha (CSV)'),
      contador),
    h('div', { class: 'tabela-rolagem', style: { maxHeight: '65vh' } }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null,
        h('th', { class: 'centro' }, marcarTodos), h('th', null, 'Nome'), h('th', null, 'Sexo'), h('th', null, 'Procedimento'),
        h('th', null, 'CID'), h('th', null, 'Código'), h('th', null, 'Médico solicitante'), h('th', null, 'Solic.'),
        h('th', null, 'Receb.'), h('th', null, 'Página'), h('th', null, 'Obs.'), h('th', null, ''))),
      corpo)))));
  carregar();
}

function atualizarContador() {
  contador.textContent = linhas.length + ' linha(s) · ' + marcadas.size + ' marcada(s)';
}

function desenhar() {
  corpo.innerHTML = '';
  if (!linhas.length) corpo.innerHTML = '<tr><td colspan="12" class="vazio-tabela">Nada salvo neste período.</td></tr>';
  linhas.forEach((l) => {
    const celula = (campo, valor, larg, ehData) => {
      const inp = h('input', { class: 'celula', value: valor || '', style: { width: larg } });
      if (ehData) inp.addEventListener('input', () => { inp.value = mascararData(inp.value); });
      inp.addEventListener('change', async () => {
        let v = inp.value.trim();
        if (ehData) {
          if (v && !brParaISO(v)) { toast('Data inválida (dd/mm/aaaa).', 'Atenção', 'aviso'); return; }
          v = v ? brParaISO(v) : null;
        }
        try { await dados.atualizarProtocolo(l.id, { [campo]: v }); l[campo] = v; toast('Salvo.', '', 'ok', 2); }
        catch (e) { toast(e.message, '❌ Erro', 'erro'); }
      });
      return inp;
    };
    const marca = h('input', { type: 'checkbox', checked: marcadas.has(l.id), onchange: (e) => {
      if (e.target.checked) marcadas.add(l.id); else marcadas.delete(l.id);
      atualizarContador();
    } });
    corpo.appendChild(h('tr', null,
      h('td', { class: 'centro' }, marca),
      h('td', null, h('strong', null, l.nome_paciente), h('div', { class: 'mudo pequeno' }, 'salvo em ' + dataHoraBR(l.criado_em))),
      h('td', { class: 'centro' }, l.sexo),
      h('td', null, l.procedimento),
      h('td', null, l.cid),
      h('td', null, l.codigo),
      h('td', null, l.medico_solicitante),
      h('td', null, isoParaBR(l.data_solicitacao)),
      h('td', null, celula('data_recebimento', isoParaBR(l.data_recebimento), '92px', true)),
      h('td', null, celula('pagina', l.pagina, '60px')),
      h('td', null, celula('obs', l.obs, '160px')),
      h('td', null, h('button', { class: 'btn pequeno link', title: 'Excluir esta linha', onclick: async () => {
        if (!await confirmar('Excluir linha', 'Excluir <b>' + esc(l.nome_paciente) + '</b> — ' + esc(l.procedimento) + ' do protocolo?', { sim: 'Excluir', perigo: true })) return;
        try { await dados.excluirProtocolo(l.id); linhas = linhas.filter((x) => x.id !== l.id); marcadas.delete(l.id); desenhar(); }
        catch (e) { toast(e.message, '❌ Erro', 'erro'); }
      } }, '🗑️'))));
  });
  atualizarContador();
}

/** Abre uma janela com o protocolo pronto para imprimir (A4 deitado). */
async function imprimirProtocolo() {
  const sel = linhas.filter((l) => marcadas.has(l.id));
  if (!sel.length) { alerta('Nada marcado', 'Marque as linhas que vão no protocolo (ou a caixa do cabeçalho para marcar todas).'); return; }
  const u = dados.sessao.unidade;

  let brasao = '';
  if (u.logo_path) {
    try { brasao = await dados.linkTemporario('logos', u.logo_path, 600); } catch (e) { brasao = ''; }
  }
  const janela = window.open('', '_blank');
  if (!janela) { alerta('Janela bloqueada', 'O navegador bloqueou a janela de impressão. Permita janelas (pop-ups) para este site.'); return; }

  const linhasHtml = sel.map((l) => '<tr>' +
    '<td>' + esc(l.nome_paciente) + '</td><td class="c">' + esc(l.sexo) + '</td><td>' + esc(l.procedimento) + '</td>' +
    '<td class="c">' + esc(l.cid) + '</td><td class="c">' + esc(l.codigo) + '</td><td>' + esc(l.medico_solicitante) + '</td>' +
    '<td class="c">' + esc(isoParaBR(l.data_solicitacao)) + '</td><td class="c">' + esc(isoParaBR(l.data_recebimento)) + '</td></tr>').join('');

  janela.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Protocolo de APACs</title><style>' +
    '@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px;color:#000;margin:0}' +
    '.cab{display:flex;align-items:center;gap:14px;border:1px solid #000;padding:6px 10px;border-bottom:0}' +
    '.cab img{height:56px}.cab div{flex:1;text-align:center;line-height:1.35}.cab b{font-size:11px}' +
    '.tit{border:1px solid #000;text-align:center;font-weight:bold;padding:4px;font-size:10.5px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:4px 5px;vertical-align:middle}' +
    'th{font-size:9.5px;background:#eee}td{font-weight:bold;font-size:9.5px}.c{text-align:center}' +
    'thead{display:table-header-group}tr{page-break-inside:avoid}.rod{margin-top:6px;font-size:8.5px;color:#555}' +
    '</style></head><body>' +
    '<div class="cab">' + (brasao ? '<img src="' + esc(brasao) + '" alt="">' : '') + '<div>' +
    '<b>PREFEITURA MUNICIPAL DE ' + esc((u.municipio || '').toUpperCase()) + '</b><br>SECRETARIA MUNICIPAL DE SAÚDE' +
    (u.email_secretaria ? '<br>Endereço Eletrônico: ' + esc(u.email_secretaria) : '') +
    '<br><b>' + esc((u.nome || '').toUpperCase()) + '</b></div>' + (brasao ? '<div style="flex:0 0 56px"></div>' : '') + '</div>' +
    '<div class="tit">PROTOCOLO DE APAC’S EXTERNAS ENVIADAS AO SETOR DE CONTROLE, AVALIAÇÃO E AUDITORIA SUS</div>' +
    '<table><thead><tr><th>NOME DO PACIENTE</th><th>SEXO</th><th>PROCEDIMENTO SOLICITADO</th><th>CID</th><th>CÓDIGO</th>' +
    '<th>MÉDICO SOLICITANTE</th><th>SOLIC</th><th>RECEB</th></tr></thead><tbody>' + linhasHtml + '</tbody></table>' +
    '<div class="rod">' + sel.length + ' APAC(s) · impresso em ' + esc(dataHoraBR()) + '</div>' +
    '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
  janela.document.close();
}

function exportarCsv() {
  if (!linhas.length) { toast('Nada para exportar.', 'CSV', 'aviso'); return; }
  const cab = ['NOME', 'SEXO', 'PROCEDIMENTO SOLICITADO', 'CID', 'CÓDIGO', 'MEDICO SOLICITANTE', 'SOLIC', 'RECEB', 'PÁGINA', 'OBS.:', 'SALVO EM'];
  const q = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
  const csv = [cab.map(q).join(';')].concat(linhas.map((l) => [
    l.nome_paciente, l.sexo, l.procedimento, l.cid, "'" + l.codigo, l.medico_solicitante,
    isoParaBR(l.data_solicitacao), isoParaBR(l.data_recebimento), l.pagina, l.obs, dataHoraBR(l.criado_em)
  ].map(q).join(';'))).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: 'protocolo_apac.csv' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============================================================
// APACs GERADAS
// ============================================================
async function montarApacs(area) {
  const corpoA = h('tbody', null, h('tr', null, h('td', { colspan: 4 }, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Carregando…'))));
  area.append(h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
    h('p', { class: 'mudo pequeno', style: { marginTop: 0 } }, 'As 100 últimas APACs geradas pelo botão ③.'),
    h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, h('th', null, 'Gerada em'), h('th', null, 'Paciente'), h('th', null, 'Procedimento'), h('th', null, ''))),
      corpoA)))));
  try {
    const lista = await dados.listarApacs(100);
    corpoA.innerHTML = '';
    if (!lista.length) corpoA.innerHTML = '<tr><td colspan="4" class="vazio-tabela">Nenhuma APAC gerada ainda.</td></tr>';
    lista.forEach((a) => corpoA.appendChild(h('tr', null,
      h('td', null, dataHoraBR(a.criado_em)),
      h('td', null, h('strong', null, a.paciente_nome), h('div', { class: 'mudo pequeno' }, 'CNS ' + (a.paciente_cns || '—'))),
      h('td', null, (a.proc_codigo ? a.proc_codigo + ' · ' : '') + a.proc_nome),
      h('td', { class: 'direita' }, h('div', { class: 'botoes', style: { justifyContent: 'flex-end' } },
        a.pdf_path ? h('button', { class: 'btn pequeno', onclick: async () => {
          try { window.open(await dados.linkTemporario('apacs', a.pdf_path, 600), '_blank'); }
          catch (e) { toast(e.message, '❌ Erro', 'erro'); }
        } }, '🖨️ Abrir PDF') : null,
        h('button', { class: 'btn pequeno', onclick: async () => {
          if (!await confirmar('Carregar no formulário', 'O formulário atual será substituído pelos dados desta APAC. Continuar?')) return;
          await carregarDadosSalvos(a.dados);
          location.hash = '#/apac';
        } }, '↩️ Carregar no formulário'))))));
  } catch (e) {
    corpoA.innerHTML = '<tr><td colspan="4"><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
  }
}
