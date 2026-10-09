/**
 * 🔳 QR CODE — gera a matriz de quadradinhos (true = preto) para desenhar no PDF.
 * Biblioteca: qrcode-generator (MIT, Kazuhiko Arase), guardada em vendor/.
 */
import qrcode from '../../vendor/qrcode.mjs';

/** texto → matriz de booleanos. Correção "M" (aguenta ~15% de sujeira/dobra no papel). */
export function matrizQr(texto, correcao = 'M') {
  const q = qrcode(0, correcao);
  q.addData(String(texto), 'Byte');
  q.make();
  const n = q.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) {
    const linha = [];
    for (let c = 0; c < n; c++) linha.push(q.isDark(r, c));
    m.push(linha);
  }
  return m;
}

/** Código secreto para o QR: 22 letras/números aleatórios (~131 bits, impossível de adivinhar). */
export function novoCodigoVerificacao(tamanho = 22) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(tamanho * 2);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < bytes.length && s.length < tamanho; i++) {
    if (bytes[i] < 248) s += alfabeto[bytes[i] % 62];   // 248 = 4×62: sem viés
  }
  while (s.length < tamanho) s += novoCodigoVerificacao(tamanho - s.length);
  return s;
}

/** Endereço que vai dentro do QR. base = endereço do site (ex.: https://apacdigital.com.br/) */
export function urlVerificacao(base, codigo) {
  return String(base).replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'v/?c=' + encodeURIComponent(codigo);
}
