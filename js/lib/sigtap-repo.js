/**
 * 🌐 TABELA SIGTAP PELA INTERNET — repositório RenatoKR/SIGTAP (GitHub)
 * ------------------------------------------------------------
 * O repositório copia sozinho, todo dia, os .zip oficiais do FTP do DATASUS
 * (as 6 competências mais recentes). Daqui o sistema:
 *   1. lista as competências disponíveis (API do GitHub; se ela falhar, lê o README);
 *   2. baixa o .zip escolhido (endereço direto do GitHub).
 * Depois disso, o .zip passa pela MESMA conferência e gravação do .zip escolhido à mão.
 *
 * Se o repositório sair do ar ou parar de atualizar, o botão do .zip manual continua valendo.
 * Não usa IA: não gasta tokens.
 */

export const SIGTAP_REPO = {
  DONO: 'RenatoKR',
  NOME: 'SIGTAP',
  RAMO: 'main',
  PASTA: 'tabelas',
  PAGINA: 'https://github.com/RenatoKR/SIGTAP',
  TEMPO_LISTA: 20 * 1000,     // ms
  TEMPO_ZIP: 120 * 1000,      // ms (o .zip tem ~2 MB)
  DIAS_SEM_SINCRONIZAR: 5     // mais que isso sem o robô rodar → avisa
};

const API = 'https://api.github.com/repos/' + SIGTAP_REPO.DONO + '/' + SIGTAP_REPO.NOME;
const RAW = 'https://raw.githubusercontent.com/' + SIGTAP_REPO.DONO + '/' + SIGTAP_REPO.NOME + '/' + SIGTAP_REPO.RAMO + '/';
const PADRAO_NOME = /^TabelaUnificada_(\d{6})_v(\d+)\.zip$/;

/** "TabelaUnificada_202610_v2610151110.zip" → { nome, competencia: '202610', versao: '2610151110' } ou null */
export function lerNomeArquivo(nome) {
  const m = String(nome || '').match(PADRAO_NOME);
  return m ? { nome: m[0], competencia: m[1], versao: m[2] } : null;
}

/** Uma entrada por competência (se houver duas versões, fica a mais nova), da mais recente para a mais antiga. */
export function organizarArquivos(nomes) {
  const porComp = new Map();
  for (const n of nomes || []) {
    const a = lerNomeArquivo(n);
    if (!a) continue;
    const ja = porComp.get(a.competencia);
    if (!ja || a.versao > ja.versao) porComp.set(a.competencia, a);
  }
  return [...porComp.values()].sort((x, y) => (x.competencia < y.competencia ? 1 : -1));
}

/** Plano B: lê os nomes dos arquivos na tabela de downloads do README (não no exemplo de uso). */
export function arquivosDoReadme(texto) {
  const nomes = [];
  String(texto || '').split(/\r?\n/).forEach((linha) => {
    const m = linha.match(/^\|\s*`(TabelaUnificada_\d{6}_v\d+\.zip)`/);
    if (m) nomes.push(m[1]);
  });
  return nomes;
}

/** "Última execução: 2026-10-18 09:24:01 BRT" → Date (ou null) */
export function dataDoReadme(texto) {
  const m = String(texto || '').match(/Última execução:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  return m ? new Date(m[1] + 'T' + m[2] + '-03:00') : null;
}

/** "202610" + hoje → quantos meses a competência está atrás do mês atual (0 = mês atual). */
export function mesesDeAtraso(competencia, hoje = new Date()) {
  if (!/^\d{6}$/.test(String(competencia || ''))) return null;
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(4, 6));
  return (hoje.getFullYear() - ano) * 12 + (hoje.getMonth() + 1 - mes);
}

async function buscar(url, tempo, tipo) {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempo);
  try {
    const r = await fetch(url, { signal: controle.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('resposta ' + r.status);
    return tipo === 'json' ? await r.json() : tipo === 'bytes' ? await r.arrayBuffer() : await r.text();
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * O que o repositório tem agora.
 * → { arquivos: [{ nome, competencia, versao }], sincronizado: Date|null, origem: 'api'|'readme' }
 * Lança erro em português se não der para falar com o GitHub.
 */
export async function listarTabelasRepo() {
  let nomes = null;
  let origem = 'api';
  let sincronizado = null;
  try {
    const lista = await buscar(API + '/contents/' + SIGTAP_REPO.PASTA + '?ref=' + SIGTAP_REPO.RAMO, SIGTAP_REPO.TEMPO_LISTA, 'json');
    nomes = (Array.isArray(lista) ? lista : []).map((x) => x && x.name);
    try {
      const commits = await buscar(API + '/commits?per_page=1&sha=' + SIGTAP_REPO.RAMO, SIGTAP_REPO.TEMPO_LISTA, 'json');
      const d = commits && commits[0] && commits[0].commit && commits[0].commit.committer && commits[0].commit.committer.date;
      sincronizado = d ? new Date(d) : null;
    } catch (e) { /* a data é só informativa */ }
  } catch (e) {
    nomes = null;   // API do GitHub fora ou no limite de consultas: tenta o README
  }

  if (!nomes || !organizarArquivos(nomes).length) {
    origem = 'readme';
    let readme;
    try {
      readme = await buscar(RAW + 'README.md', SIGTAP_REPO.TEMPO_LISTA, 'texto');
    } catch (e) {
      throw new Error('Não consegui falar com o repositório da tabela SIGTAP (sem internet?). ' +
        'Use o botão do .zip, com um arquivo baixado antes.');
    }
    nomes = arquivosDoReadme(readme);
    sincronizado = dataDoReadme(readme);
  }

  const arquivos = organizarArquivos(nomes);
  if (!arquivos.length) {
    throw new Error('O repositório da tabela SIGTAP não mostrou nenhum arquivo agora. Use o botão do .zip.');
  }
  return { arquivos, sincronizado, origem };
}

/** Baixa o .zip (ArrayBuffer). */
export async function baixarTabelaRepo(nome) {
  if (!lerNomeArquivo(nome)) throw new Error('Nome de arquivo inesperado: ' + nome);
  try {
    return await buscar(RAW + SIGTAP_REPO.PASTA + '/' + encodeURIComponent(nome), SIGTAP_REPO.TEMPO_ZIP, 'bytes');
  } catch (e) {
    throw new Error('Não consegui baixar ' + nome + ' do repositório (' + (e.name === 'AbortError' ? 'demorou demais' : e.message) +
      '). Tente de novo ou use o botão do .zip.');
  }
}
