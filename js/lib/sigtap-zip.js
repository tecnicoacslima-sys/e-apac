/**
 * 📥 ATUALIZAR TABELA SIGTAP PELO .ZIP — regras puras (porta do AtualizarSIGTAP.gs).
 *
 * O pacote "TabelaUnificada_AAAAMM_v….zip" do DATASUS traz arquivos de texto
 * com colunas de largura fixa. As posições vêm dos *_layout.txt do próprio
 * pacote ("Coluna,Tamanho,Inicio,Fim,Tipo"); sem eles, usa as posições padrão.
 * Não usa IA: não gasta tokens.
 */
import { codigoSigtap10 } from './texto.js';

export const SIGTAP_IMPORT = {
  MIN_PROCS: 3000,       // abaixo disso, o arquivo provavelmente está incompleto
  ARQ_PROC: 'tb_procedimento.txt',
  LAY_PROC: 'tb_procedimento_layout.txt',
  ARQ_HAB: 'rl_procedimento_habilitacao.txt',
  LAY_HAB: 'rl_procedimento_habilitacao_layout.txt',
  PADRAO_PROC: { CO_PROCEDIMENTO: [1, 10], NO_PROCEDIMENTO: [11, 260], DT_COMPETENCIA: [331, 336] },
  PADRAO_HAB: { CO_PROCEDIMENTO: [1, 10], CO_HABILITACAO: [11, 14] },
  SITE_ESPELHO: 'https://sigtap.vps8027.panel.icontainer.run/downloads',
  SITE_OFICIAL: 'http://sigtap.datasus.gov.br/tabela-unificada/app/download.jsp'
};

export const ARQUIVOS_DO_ZIP = [SIGTAP_IMPORT.ARQ_PROC, SIGTAP_IMPORT.LAY_PROC, SIGTAP_IMPORT.ARQ_HAB, SIGTAP_IMPORT.LAY_HAB];

/** "Coluna,Tamanho,Inicio,Fim,Tipo" → { NOME_COLUNA: [inicio, fim] } (completa com o padrão) */
export function lerLayoutSigtap(textoLayout, padrao) {
  const mapa = {};
  String(textoLayout || '').split(/\r?\n/).slice(1).forEach((l) => {
    const p = l.split(',');
    if (p.length >= 4 && /^\d+$/.test(p[2].trim()) && /^\d+$/.test(p[3].trim())) {
      mapa[p[0].trim().toUpperCase()] = [parseInt(p[2], 10), parseInt(p[3], 10)];
    }
  });
  Object.keys(padrao).forEach((k) => { if (!mapa[k]) mapa[k] = padrao[k]; });
  return mapa;
}

const cortar = (linha, pos) => linha.substring(pos[0] - 1, pos[1]).trim();

/**
 * Monta a tabela a partir dos textos do pacote.
 * → { competencia: 'AAAAMM', linhas: [{ competencia, codigo, nome, habilitacoes }] } (ordenadas por código)
 */
export function montarLinhasSigtap(txtProc, txtLayProc, txtHab, txtLayHab) {
  const lp = lerLayoutSigtap(txtLayProc, SIGTAP_IMPORT.PADRAO_PROC);
  const lh = lerLayoutSigtap(txtLayHab, SIGTAP_IMPORT.PADRAO_HAB);

  const hab = new Map();
  String(txtHab || '').split(/\r?\n/).forEach((l) => {
    if (!l.trim()) return;
    const co = cortar(l, lh.CO_PROCEDIMENTO);
    const h = cortar(l, lh.CO_HABILITACAO);
    if (!co || !h) return;
    if (!hab.has(co)) hab.set(co, new Set());
    hab.get(co).add(h);
  });

  const competencias = new Set();
  const vistos = new Set();
  const linhas = [];
  String(txtProc || '').split(/\r?\n/).forEach((l) => {
    if (!l.trim()) return;
    const codigo = cortar(l, lp.CO_PROCEDIMENTO);
    const nome = cortar(l, lp.NO_PROCEDIMENTO).replace(/\s+/g, ' ');
    const comp = cortar(l, lp.DT_COMPETENCIA);
    if (!/^\d{10}$/.test(codigo) || !nome || vistos.has(codigo)) return;
    vistos.add(codigo);
    if (/^\d{6}$/.test(comp)) competencias.add(comp);
    linhas.push({ codigo, nome, habilitacoes: [...(hab.get(codigo) || [])].sort().join(', '), comp });
  });

  const lista = [...competencias];
  if (lista.length !== 1) {
    throw new Error('O arquivo traz ' + (lista.length ? 'mais de uma competência (' + lista.join(', ') + ')' : 'nenhuma competência') +
      '. Confira se é a Tabela Unificada do SIGTAP.');
  }
  const competencia = lista[0];
  linhas.sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  return { competencia, linhas: linhas.map((l) => ({ competencia, codigo: l.codigo, nome: l.nome, habilitacoes: l.habilitacoes })) };
}

/** Confere o resultado e devolve '' ou o motivo para recusar. */
export function conferirTabelaNova(r, competenciaAtual) {
  if (r.linhas.length < SIGTAP_IMPORT.MIN_PROCS) {
    return 'O arquivo trouxe só ' + r.linhas.length + ' procedimentos (o normal é mais de 5.000). Ele pode estar incompleto. Baixe de novo.';
  }
  if (competenciaAtual && r.competencia < competenciaAtual) {
    return 'Este arquivo é da competência ' + rotuloCompetencia(r.competencia) + ', mais antiga que a que já está em uso (' +
      rotuloCompetencia(competenciaAtual) + '). Baixe a competência mais recente.';
  }
  return '';
}

/**
 * Compara com a tabela anterior e com a Referência SIGTAP da unidade.
 * codigosAntes: Set dos códigos da competência em uso (ou null se é a mesma/nenhuma).
 * referencia: [{ procedimento, codigo }]
 */
export function compararTabelas(r, codigosAntes, referencia) {
  const novosCodigos = new Set(r.linhas.map((l) => l.codigo));
  let novos = [];
  let sairam = [];
  if (codigosAntes) {
    novos = r.linhas.filter((l) => !codigosAntes.has(l.codigo)).map((l) => l.codigo + ' ' + l.nome);
    sairam = [...codigosAntes].filter((c) => c && !novosCodigos.has(c)).sort();
  }
  const refFora = (referencia || [])
    .filter((x) => x.codigo && !novosCodigos.has(codigoSigtap10(x.codigo)))
    .map((x) => String(x.procedimento || '').trim() + ' · ' + codigoSigtap10(x.codigo));
  return { novos, sairam, refFora };
}

/** "202609" → "09/2026" */
export function rotuloCompetencia(c) {
  return /^\d{6}$/.test(String(c || '')) ? c.substring(4, 6) + '/' + c.substring(0, 4) : String(c || '');
}
