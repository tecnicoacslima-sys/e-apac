/** Ajudantes de texto e data usados em todo o sistema. */

/** Maiúsculas, sem acento, espaços simples (normalizarBusca_ do Apps Script). */
export function normalizarBusca(t) {
  return String(t || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** normalizarTexto do Code_SIGTAP.gs */
export function normalizarTexto(s) {
  return String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Nome pronto para comparar por PALAVRAS: sem acento, sem pontuação,
 * espaços simples e um espaço em cada ponta (" EDA COM BIOPSIA ").
 */
export function nomeParaComparar(s) {
  return ' ' + normalizarTexto(s).replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
}

/** Código SIGTAP sempre com 10 dígitos (o zero da frente volta). */
export function codigoSigtap10(valor) {
  const dig = String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '');
  return dig && dig.length < 10 ? ('0000000000' + dig).slice(-10) : dig;
}

/** "0209010037" → "02.09.01.003-7" (só para mostrar) */
export function formatarCodigoSigtap(codigo) {
  const c = codigoSigtap10(codigo);
  return /^\d{10}$/.test(c) ? c.replace(/^(\d{2})(\d{2})(\d{2})(\d{3})(\d)$/, '$1.$2.$3.$4-$5') : c;
}

/** Nome seguro para arquivo: sem acento, só letras, números, _ e - */
export function limparNomeArquivo(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '');
}

const FUSO = 'America/Cuiaba';

/** Partes da data no horário de Cuiabá: { ano, mes, dia, hora, min, seg } (texto com 2 dígitos) */
export function partesData(data = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(data);
  const v = (t) => p.find((x) => x.type === t).value;
  return { ano: v('year'), mes: v('month'), dia: v('day'), hora: v('hour'), min: v('minute'), seg: v('second') };
}

/** Hoje em "dd/mm/aaaa" (Cuiabá) */
export function hojeBR(data = new Date()) {
  const p = partesData(data);
  return p.dia + '/' + p.mes + '/' + p.ano;
}

/** "dd/mm/aaaa HH:MM" (Cuiabá) */
export function dataHoraBR(data = new Date()) {
  const p = partesData(new Date(data));
  return p.dia + '/' + p.mes + '/' + p.ano + ' ' + p.hora + ':' + p.min;
}

/** "2026-10-31" → "31/10/2026"; outros formatos voltam como vieram */
export function isoParaBR(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}

/** "31/10/2026" → "2026-10-31"; inválida → null */
export function brParaISO(br) {
  const m = String(br || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10), mes = parseInt(m[2], 10), a = parseInt(m[3], 10);
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return a + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** Máscara de data enquanto digita: "31102025" → "31/10/2025" */
export function mascararData(valor) {
  const d = soDig(valor).substring(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return d.substring(0, 2) + '/' + d.substring(2);
  return d.substring(0, 2) + '/' + d.substring(2, 4) + '/' + d.substring(4);
}

function soDig(v) { return String(v || '').replace(/\D/g, ''); }

/** 12345.6 → "12.345,6" (padrão brasileiro) */
export function fmtNum(n, casas = 0) {
  const partes = (Number(n) || 0).toFixed(casas).split('.');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return partes.join(',');
}

/** "2026-09" → "Setembro/2026" */
const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export function rotuloMes(mes) {
  const m = Number(String(mes).substring(5, 7));
  return (NOMES_MESES[m - 1] || mes) + '/' + String(mes).substring(0, 4);
}

/** Escapa texto para colocar dentro de HTML */
export function esc(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
