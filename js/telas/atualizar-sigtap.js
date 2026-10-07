/**
 * 📥 ATUALIZAR TABELA SIGTAP (.zip) — janela usada em Ferramentas e na tela SIGTAP.
 * Só o administrador vê (a tabela oficial vale para todas as unidades).
 *
 * 1. escolhe o "TabelaUnificada_AAAAMM_v….zip" (sem descompactar);
 * 2. o navegador abre o zip e monta a tabela (nada é gravado ainda);
 * 3. mostra o resumo: competência, novos, que saíram, Referência fora da tabela;
 * 4. "Gravar" manda para o banco; se der erro no meio, desfaz.
 * Não usa IA: não gasta tokens.
 */
import * as dados from '../dados.js';
import { h, modal, zonaArquivo, lerArquivoBuffer, toast } from '../ui.js';
import { esc, fmtNum } from '../lib/texto.js';
import { lerTextosDoZip } from '../lib/unzip.js';
import {
  SIGTAP_IMPORT, ARQUIVOS_DO_ZIP, montarLinhasSigtap, conferirTabelaNova, compararTabelas, rotuloCompetencia
} from '../lib/sigtap-zip.js';

const LOTE = 1000;

/** Abre a janela. aoTerminar() é chamado depois de gravar. */
export function abrirAtualizarSigtap({ aoTerminar } = {}) {
  const atual = h('div', { class: 'msg info', style: { marginTop: 0 } }, 'Carregando a tabela em uso…');
  const status = h('div');
  let info = { competencia: '', total: 0 };

  dados.infoSigtap().then((i) => {
    info = i;
    atual.innerHTML = i.competencia
      ? 'Tabela em uso agora: competência <b>' + esc(rotuloCompetencia(i.competencia)) + '</b> (' + esc(fmtNum(i.total)) + ' procedimentos)'
      : 'Nenhuma tabela SIGTAP carregada ainda.';
  }).catch((e) => { atual.className = 'msg erro'; atual.textContent = e.message; });

  const zona = zonaArquivo({
    aceitar: '.zip,application/zip,application/x-zip-compressed',
    texto: 'Escolha o arquivo .zip ou arraste para cá',
    aoEscolher: (arq) => preparar(arq)
  });

  const janela = modal({
    titulo: '📥 Atualizar tabela SIGTAP',
    largura: 640,
    conteudo: h('div', null,
      atual,
      h('ol', { style: { margin: '0 0 12px 18px', padding: 0, lineHeight: '1.6' } },
        h('li', null, 'Baixe o arquivo ', h('b', null, 'TabelaUnificada_AAAAMM_v….zip'), ' da competência desejada: ',
          h('a', { href: SIGTAP_IMPORT.SITE_ESPELHO, target: '_blank', rel: 'noopener' }, '🌐 abrir o site para baixar'),
          h('span', { class: 'pequeno mudo' }, ' (ou o ',
            h('a', { href: SIGTAP_IMPORT.SITE_OFICIAL, target: '_blank', rel: 'noopener' }, 'site oficial do SIGTAP'), ', quando estiver no ar)')),
        h('li', null, h('b', null, 'Não descompacte.'), ' Escolha o .zip abaixo. O sistema confere tudo antes de gravar.'),
        h('li', null, 'Confira o resumo e clique em ', h('b', null, 'Gravar'), '.')),
      zona,
      status),
    botoes: [{ texto: 'Fechar' }]
  });

  async function preparar(arquivo) {
    status.innerHTML = '';
    janela.definirBotoes([{ texto: 'Fechar' }]);
    if (!/\.zip$/i.test(arquivo.name)) {
      status.appendChild(h('div', { class: 'msg erro' }, '❌ Escolha o arquivo .zip (sem descompactar).'));
      return;
    }
    status.appendChild(h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Abrindo o .zip e montando a tabela…'));
    try {
      const buffer = await lerArquivoBuffer(arquivo);
      let textos;
      try {
        textos = await lerTextosDoZip(buffer, ARQUIVOS_DO_ZIP);
      } catch (e) {
        throw new Error('Não consegui abrir o arquivo. Ele precisa ser o .zip da Tabela Unificada do SIGTAP ' +
          '(TabelaUnificada_AAAAMM_v….zip), sem descompactar. Detalhe: ' + e.message);
      }
      if (!textos[SIGTAP_IMPORT.ARQ_PROC]) {
        throw new Error('O .zip não tem o arquivo ' + SIGTAP_IMPORT.ARQ_PROC + '. Confira se é a Tabela Unificada do SIGTAP.');
      }
      const r = montarLinhasSigtap(textos[SIGTAP_IMPORT.ARQ_PROC], textos[SIGTAP_IMPORT.LAY_PROC],
        textos[SIGTAP_IMPORT.ARQ_HAB], textos[SIGTAP_IMPORT.LAY_HAB]);
      const motivo = conferirTabelaNova(r, info.competencia);
      if (motivo) throw new Error(motivo);

      const mesma = r.competencia === info.competencia;
      const codigosAntes = info.competencia && !mesma ? await codigosDaCompetencia(info.competencia) : null;
      let referencia = [];
      try { referencia = await dados.listarReferencia(); } catch (e) { referencia = []; }
      const cmp = compararTabelas(r, codigosAntes, referencia);
      mostrarResumo(r, mesma, cmp);
    } catch (e) {
      status.innerHTML = '';
      status.appendChild(h('div', { class: 'msg erro' }, '❌ ' + e.message));
    }
  }

  function mostrarResumo(r, mesma, cmp) {
    const apagar = h('input', { type: 'checkbox', checked: true });
    status.innerHTML = '';
    // (append do navegador escreve "null" para itens vazios: por isso o filter)
    status.append(...[
      h('div', { class: 'msg ok' },
        h('div', null, '📦 Competência ', h('b', null, rotuloCompetencia(r.competencia)), ' · ', h('b', null, fmtNum(r.linhas.length)), ' procedimentos'),
        mesma ? h('div', null, 'É a mesma competência que já está em uso: ela será ', h('b', null, 'substituída'), ' (nomes e habilitações atualizados).') : null,
        !mesma && info.competencia ? h('div', null, 'Substitui a ', rotuloCompetencia(info.competencia), ': ',
          h('b', null, fmtNum(cmp.novos.length)), ' procedimento(s) novo(s) e ', h('b', null, fmtNum(cmp.sairam.length)), ' que saíram.') : null,
        cmp.novos.length ? h('details', { style: { marginTop: '6px' } }, h('summary', null, 'Ver os novos'),
          h('ul', { style: { margin: '4px 0 0 16px', padding: 0, maxHeight: '160px', overflow: 'auto' } },
            ...cmp.novos.slice(0, 200).map((t) => h('li', null, t)))) : null,
        cmp.sairam.length ? h('details', { style: { marginTop: '6px' } }, h('summary', null, 'Ver os que saíram'),
          h('ul', { style: { margin: '4px 0 0 16px', padding: 0, maxHeight: '160px', overflow: 'auto' } },
            ...cmp.sairam.slice(0, 200).map((t) => h('li', null, t)))) : null),
      cmp.refFora.length ? h('div', { class: 'msg aviso' },
        h('b', null, '⚠️ ' + cmp.refFora.length + ' código(s) da sua Referência SIGTAP não existem nesta tabela:'),
        h('ul', { style: { margin: '4px 0 0 16px', padding: 0 } }, ...cmp.refFora.slice(0, 30).map((t) => h('li', null, t))),
        h('div', { class: 'pequeno' }, 'Depois de gravar, corrija esses códigos em Cadastros ▸ Referência SIGTAP.')) : null,
      !mesma && info.competencia ? h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '10px 0 0', cursor: 'pointer' } },
        apagar,
        h('span', null, 'Apagar a(s) tabela(s) antiga(s) depois de gravar a nova',
          h('br'), h('small', { class: 'mudo' }, 'O sistema passa a usar sozinho a competência mais recente.'))) : null
    ].filter(Boolean));

    janela.definirBotoes([
      { texto: 'Cancelar' },
      { texto: '💾 Gravar competência ' + rotuloCompetencia(r.competencia), classe: 'principal',
        acao: () => gravar(r, mesma, !mesma && apagar.checked) }
    ]);
  }

  async function gravar(r, mesma, apagarAntigas) {
    janela.definirBotoes([]);
    const progresso = h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Gravando… 0%');
    status.appendChild(progresso);
    const avancar = (n) => {
      progresso.lastChild.textContent = 'Gravando… ' + Math.round(n / r.linhas.length * 100) + '% (' + fmtNum(n) + ' de ' + fmtNum(r.linhas.length) + ')';
    };
    try {
      for (let i = 0; i < r.linhas.length; i += LOTE) {
        const parte = r.linhas.slice(i, i + LOTE);
        const { error } = await dados.sb.from('sigtap_procedimentos').upsert(parte, { onConflict: 'competencia,codigo' });
        if (error) throw new Error(dados.traduzirErro(error));
        avancar(Math.min(i + LOTE, r.linhas.length));
      }
    } catch (e) {
      // competência nova pela metade: tira do banco para o sistema não usar uma tabela incompleta
      if (!mesma) await dados.sb.from('sigtap_procedimentos').delete().eq('competencia', r.competencia);
      progresso.remove();
      status.appendChild(h('div', { class: 'msg erro' }, '❌ Não consegui gravar: ' + e.message +
        (mesma ? '' : ' Nada foi alterado; a tabela anterior continua em uso.')));
      janela.definirBotoes([{ texto: 'Fechar' }]);
      return;
    }

    let apagadas = '';
    if (apagarAntigas) {
      const { error } = await dados.sb.from('sigtap_procedimentos').delete().lt('competencia', r.competencia);
      apagadas = error ? ' (não consegui apagar a tabela antiga: ' + dados.traduzirErro(error) + ')' : ' A tabela antiga foi apagada.';
    }
    progresso.remove();
    status.innerHTML = '';
    status.appendChild(h('div', { class: 'msg ok' },
      '✅ Tabela SIGTAP ', h('b', null, rotuloCompetencia(r.competencia)), ' gravada: ', fmtNum(r.linhas.length),
      ' procedimentos. O sistema já está usando esta competência.' + apagadas));
    janela.definirBotoes([{ texto: 'Fechar', classe: 'principal' }]);
    toast('Competência ' + rotuloCompetencia(r.competencia) + ' em uso.', '✅ SIGTAP atualizado');
    if (aoTerminar) aoTerminar();
  }
}

/** Todos os códigos de uma competência (de 1000 em 1000). */
async function codigosDaCompetencia(competencia) {
  const set = new Set();
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await dados.sb.from('sigtap_procedimentos').select('codigo')
      .eq('competencia', competencia).order('codigo').range(inicio, inicio + 999);
    if (error) throw new Error(dados.traduzirErro(error));
    data.forEach((l) => set.add(l.codigo));
    if (data.length < 1000) break;
  }
  return set;
}
