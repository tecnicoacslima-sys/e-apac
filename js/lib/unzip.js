/**
 * Abre um .zip no navegador SEM biblioteca extra: lê o índice do zip e
 * descompacta só os arquivos pedidos com o DecompressionStream do próprio
 * navegador (Chrome, Edge e Firefox atuais). Funciona também no Node 18+.
 */

const ASSINATURA_FIM = 0x06054b50;      // "fim do índice"
const ASSINATURA_INDICE = 0x02014b50;   // entrada do índice
const ASSINATURA_LOCAL = 0x04034b50;    // cabeçalho de cada arquivo

/** Lista os arquivos do zip: [{ nome, metodo, tamanho, compactado, inicio }] */
export function listarZip(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // o registro "fim do índice" fica nos últimos 22 bytes (+ comentário de até 64 KB)
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === ASSINATURA_FIM) { fim = i; break; }
  }
  if (fim < 0) throw new Error('O arquivo não é um .zip válido.');

  const total = dv.getUint16(fim + 10, true);
  let pos = dv.getUint32(fim + 16, true);
  if (pos === 0xFFFFFFFF) throw new Error('Este .zip usa um formato (ZIP64) que o sistema não lê. Baixe de novo o pacote original.');

  const lista = [];
  const decUtf8 = new TextDecoder('utf-8');
  const decLatin = new TextDecoder('latin1');
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(pos, true) !== ASSINATURA_INDICE) throw new Error('O .zip está corrompido (índice ilegível).');
    const flags = dv.getUint16(pos + 8, true);
    const metodo = dv.getUint16(pos + 10, true);
    const compactado = dv.getUint32(pos + 20, true);
    const tamanho = dv.getUint32(pos + 24, true);
    const lenNome = dv.getUint16(pos + 28, true);
    const lenExtra = dv.getUint16(pos + 30, true);
    const lenComent = dv.getUint16(pos + 32, true);
    const inicio = dv.getUint32(pos + 42, true);
    const nomeBytes = bytes.subarray(pos + 46, pos + 46 + lenNome);
    const nome = (flags & 0x800 ? decUtf8 : decLatin).decode(nomeBytes);
    lista.push({ nome, metodo, tamanho, compactado, inicio });
    pos += 46 + lenNome + lenExtra + lenComent;
  }
  return lista;
}

/** Bytes descompactados de uma entrada (vinda de listarZip). */
export async function extrairZip(buffer, entrada) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entrada.inicio;
  if (dv.getUint32(p, true) !== ASSINATURA_LOCAL) throw new Error('O .zip está corrompido (' + entrada.nome + ').');
  const dados = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const comp = bytes.subarray(dados, dados + entrada.compactado);

  if (entrada.metodo === 0) return comp.slice();
  if (entrada.metodo !== 8) throw new Error('O arquivo ' + entrada.nome + ' usa uma compactação que o sistema não lê.');
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador é antigo e não abre .zip. Use o Chrome ou o Edge atualizado.');
  }
  const fluxo = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/**
 * Lê só alguns arquivos de texto do zip, pelo nome (sem pasta, sem diferença
 * de maiúsculas). Devolve { nome: texto } (ou '' se o arquivo não existe).
 */
export async function lerTextosDoZip(buffer, nomes, codificacao = 'latin1') {
  const entradas = listarZip(buffer);
  const dec = new TextDecoder(codificacao);
  const saida = {};
  for (const nome of nomes) {
    const e = entradas.find((x) => x.nome.split('/').pop().toLowerCase() === nome.toLowerCase());
    saida[nome] = e ? dec.decode(await extrairZip(buffer, e)) : '';
  }
  return saida;
}
