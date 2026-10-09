/**
 * 🧾 FATURA DE CONSUMO DE IA em PDF (pdf-lib, no navegador).
 * Mesmo modelo da fatura do antigo PAINEL_CONSUMO_IA, com a marca APAC digital.
 *
 * Uso: const bytes = await gerarPdfFatura(window.PDFLib, montarFatura(...), {
 *        marca: { bytes, tipo: 'image/png' },          // logo (opcional)
 *        emissor: { nome: 'APAC digital', contato: 'email · telefone' }
 *      });
 */
import { textoSeguro } from './pdf-apac.js';

const LARG = 595.28, ALT = 841.89;
const M = 40;                      // margem
const X1 = LARG - M;

const fmt = (n, casas = 0) => {
  const p = (Number(n) || 0).toFixed(casas).split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return p.join(',');
};
const reais = (v) => 'R$ ' + fmt(v, 2);
const dataBR = (d) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba' });
const dataHoraBR = (d) => d.toLocaleString('pt-BR', { timeZone: 'America/Cuiaba', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export async function gerarPdfFatura(PDFLib, f, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle('Fatura de consumo de IA ' + f.numero);
  doc.setProducer('APAC digital');
  doc.setCreator('apacdigital.com.br');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const VERDE = rgb(0.12, 0.36, 0.22);
  const TEXTO = rgb(0.1, 0.13, 0.12);
  const CINZA = rgb(0.42, 0.45, 0.44);
  const CLARO = rgb(0.82, 0.85, 0.84);
  const FUNDO = rgb(0.96, 0.97, 0.96);

  let page = doc.addPage([LARG, ALT]);
  let y = M;                                   // "de cima para baixo"
  const Y = (t) => ALT - t;
  const T = (txt, x, topo, { tam = 9, fonte = normal, cor = TEXTO, alinhar = 'left', larg = 0 } = {}) => {
    let t = textoSeguro(txt);
    if (larg) while (t.length > 1 && fonte.widthOfTextAtSize(t, tam) > larg) t = t.slice(0, -1);
    const w = fonte.widthOfTextAtSize(t, tam);
    const xx = alinhar === 'right' ? x - w : alinhar === 'center' ? x - w / 2 : x;
    page.drawText(t, { x: xx, y: Y(topo), size: tam, font: fonte, color: cor });
  };
  const linha = (x1, topo, x2, cor = CLARO, esp = 0.6) =>
    page.drawLine({ start: { x: x1, y: Y(topo) }, end: { x: x2, y: Y(topo) }, thickness: esp, color: cor });
  const caixa = (x1, topo, x2, alt, { cor = CLARO, fundo } = {}) =>
    page.drawRectangle({ x: x1, y: Y(topo + alt), width: x2 - x1, height: alt, borderColor: cor, borderWidth: 0.7, color: fundo });
  const novaPagina = () => {
    page = doc.addPage([LARG, ALT]);
    y = M;
    T('Fatura ' + f.numero + ' (continuação)', M, y + 8, { tam: 8, cor: CINZA });
    y += 22;
  };
  const garantir = (altura) => { if (y + altura > ALT - 70) novaPagina(); };
  const secao = (titulo) => {
    garantir(40);
    T(titulo, M, y + 9, { tam: 9.5, fonte: negrito, cor: VERDE });
    linha(M, y + 15, X1, VERDE, 1.4);
    y += 26;
  };

  // ---------------- CABEÇALHO ----------------
  const emissor = opts.emissor || {};
  if (opts.marca && opts.marca.bytes) {
    const img = await doc.embedPng(opts.marca.bytes);
    const a = 26, w = Math.min(170, img.width * a / img.height);
    page.drawImage(img, { x: M, y: Y(y + a), width: w, height: w * img.height / img.width });
  } else {
    T(emissor.nome || 'APAC digital', M, y + 18, { tam: 17, fonte: negrito, cor: VERDE });
  }
  if (emissor.contato) T(emissor.contato, M, y + 40, { tam: 7.5, cor: CINZA });

  const bx = X1 - 205;
  caixa(bx, y - 4, X1, 46);
  T('FATURA Nº', X1 - 10, y + 7, { tam: 6.5, cor: CINZA, alinhar: 'right' });
  T(f.numero, X1 - 10, y + 20, { tam: 10.5, fonte: negrito, alinhar: 'right', larg: 190 });
  T('Emissão: ' + dataBR(f.emissao) + '  ·  Vencimento:', X1 - 13 - negrito.widthOfTextAtSize(dataBR(f.vencimento), 7.5), y + 34, { tam: 7.5, cor: CINZA, alinhar: 'right' });
  T(dataBR(f.vencimento), X1 - 10, y + 34, { tam: 7.5, fonte: negrito, alinhar: 'right' });
  y += 66;

  T('FATURA DE CONSUMO  —  SERVIÇO DE INTELIGÊNCIA ARTIFICIAL', M + 8, y + 8, { tam: 9.5, fonte: negrito, cor: CINZA });
  y += 26;

  // cliente · mês · total
  const c1 = M + 2, c2 = M + 180, c3 = M + 345;
  caixa(M, y, c3 - 10, 46);
  page.drawLine({ start: { x: c2 - 8, y: Y(y) }, end: { x: c2 - 8, y: Y(y + 46) }, thickness: 0.6, color: CLARO });
  T('CLIENTE', c1 + 6, y + 12, { tam: 6.5, cor: CINZA });
  T(f.unidade, c1 + 6, y + 26, { tam: 10, fonte: negrito, larg: c2 - c1 - 20 });
  if (opts.clienteLocal) T(opts.clienteLocal, c1 + 6, y + 38, { tam: 7, cor: CINZA, larg: c2 - c1 - 20 });
  T('MÊS DE REFERÊNCIA', c2 + 2, y + 12, { tam: 6.5, cor: CINZA });
  T(f.mesInfo.rotulo, c2 + 2, y + 26, { tam: 10, fonte: negrito });
  T('Período: ' + f.mesInfo.inicio + ' a ' + f.mesInfo.fim, c2 + 2, y + 38, { tam: 7, cor: CINZA });
  T('TOTAL A PAGAR', X1 - 8, y + 12, { tam: 6.5, cor: CINZA, alinhar: 'right' });
  T(reais(f.total), X1 - 8, y + 34, { tam: 19, fonte: negrito, cor: VERDE, alinhar: 'right' });
  y += 64;

  // ---------------- CONSUMO DO MÊS ----------------
  secao('CONSUMO DO MÊS');
  const blocos = [['CHAMADAS', fmt(f.chamadas)], ['TOKENS DE ENTRADA', fmt(f.entrada)], ['TOKENS DE SAÍDA', fmt(f.saida)], ['TOTAL DE TOKENS', fmt(f.tokens)]];
  const bw = (X1 - M) / 4;
  caixa(M, y, X1, 38, { fundo: FUNDO });
  blocos.forEach(([rot, val], i) => {
    const cx = M + bw * i + bw / 2;
    if (i) page.drawLine({ start: { x: M + bw * i, y: Y(y + 6) }, end: { x: M + bw * i, y: Y(y + 32) }, thickness: 0.6, color: CLARO });
    T(rot, cx, y + 13, { tam: 6.5, cor: CINZA, alinhar: 'center' });
    T(val, cx, y + 29, { tam: 12, fonte: negrito, alinhar: 'center' });
  });
  y += 54;

  // ---------------- HISTÓRICO ----------------
  secao('HISTÓRICO DE CONSUMO (R$)');
  const maior = Math.max(...f.historico.map((h) => h.valor), 0.01);
  f.historico.forEach((h) => {
    garantir(16);
    T((h.atual ? '> ' : '') + h.curto, M + 2, y + 9, { tam: 8, fonte: h.atual ? negrito : normal, cor: h.atual ? TEXTO : CINZA });
    const barra = (X1 - M - 170) * (h.valor / maior);
    if (barra > 0.5) page.drawRectangle({ x: M + 60, y: Y(y + 10), width: barra, height: 7, color: h.atual ? VERDE : CLARO });
    T(reais(h.valor), X1 - 2, y + 9, { tam: 8, fonte: h.atual ? negrito : normal, alinhar: 'right' });
    y += 15;
  });
  y += 12;

  // ---------------- TABELAS ----------------
  const tabela = (cols, linhas, total) => {
    const cab = () => {
      garantir(22);
      cols.forEach((c) => T(c.rot, c.alinhar === 'right' ? c.x + c.w : c.alinhar === 'center' ? c.x + c.w / 2 : c.x, y + 9,
        { tam: 6.8, fonte: negrito, cor: VERDE, alinhar: c.alinhar || 'left' }));
      linha(M, y + 15, X1, CLARO, 0.8);
      y += 19;
    };
    cab();
    linhas.forEach((l) => {
      if (y + 16 > ALT - 70) { novaPagina(); cab(); }
      cols.forEach((c) => T(l[c.k], c.alinhar === 'right' ? c.x + c.w : c.alinhar === 'center' ? c.x + c.w / 2 : c.x, y + 10,
        { tam: 8.2, alinhar: c.alinhar || 'left', larg: c.w }));
      linha(M, y + 15, X1, rgb(0.9, 0.92, 0.91), 0.5);
      y += 17;
    });
    if (total) {
      garantir(20);
      linha(M, y + 1, X1, TEXTO, 1);
      cols.forEach((c) => T(total[c.k], c.alinhar === 'right' ? c.x + c.w : c.alinhar === 'center' ? c.x + c.w / 2 : c.x, y + 12,
        { tam: 8.2, fonte: negrito, alinhar: c.alinhar || 'left', larg: c.w }));
      y += 18;
    }
    y += 14;
  };

  secao('CONSUMO POR SERVIÇO');
  tabela([
    { k: 'servico', rot: 'SERVIÇO', x: M + 4, w: 200 },
    { k: 'chamadas', rot: 'CHAMADAS', x: M + 220, w: 80, alinhar: 'center' },
    { k: 'tokens', rot: 'TOKENS', x: M + 320, w: 90, alinhar: 'center' },
    { k: 'valor', rot: 'VALOR', x: X1 - 84, w: 80, alinhar: 'right' }
  ], f.servicos.map((s) => ({ servico: s.servico, chamadas: fmt(s.chamadas), tokens: fmt(s.tokens), valor: reais(s.valor) })));

  secao('DETALHAMENTO POR DIA');
  tabela([
    { k: 'dia', rot: 'DATA', x: M + 4, w: 80 },
    { k: 'chamadas', rot: 'CHAMADAS', x: M + 100, w: 70, alinhar: 'center' },
    { k: 'entrada', rot: 'TOKENS DE ENTRADA', x: M + 190, w: 100, alinhar: 'center' },
    { k: 'saida', rot: 'TOKENS DE SAÍDA', x: M + 310, w: 100, alinhar: 'center' },
    { k: 'valor', rot: 'VALOR', x: X1 - 84, w: 80, alinhar: 'right' }
  ], f.dias.map((d) => ({ dia: d.dia, chamadas: fmt(d.chamadas), entrada: fmt(d.entrada), saida: fmt(d.saida), valor: reais(d.valor) })),
  { dia: 'Total', chamadas: fmt(f.chamadas), entrada: fmt(f.entrada), saida: fmt(f.saida), valor: reais(f.total) });

  // ---------------- COMO É CALCULADO ----------------
  const nota = 'Como o valor é calculado: o serviço de IA é cobrado pela quantidade de tokens processados (pedaços de texto). ' +
    'Tokens de entrada são os documentos e instruções enviados; tokens de saída são o texto gerado pela IA. ' +
    'Os valores em reais usam a cotação do dólar de R$ ' + fmt(f.cambio, 2) + ', vigente na data de emissão (' + dataBR(f.emissao) + '). ' +
    'Só entram na conta as chamadas concluídas com sucesso.';
  const palavras = textoSeguro(nota).split(' ');
  const linhasNota = [];
  let atual = '';
  palavras.forEach((p) => {
    const t = atual ? atual + ' ' + p : p;
    if (normal.widthOfTextAtSize(t, 7.6) > X1 - M - 26) { linhasNota.push(atual); atual = p; } else atual = t;
  });
  if (atual) linhasNota.push(atual);
  const altNota = linhasNota.length * 10.5 + 14;
  garantir(altNota + 10);
  page.drawRectangle({ x: M, y: Y(y + altNota), width: 3, height: altNota, color: VERDE });
  linhasNota.forEach((l, i) => T(l, M + 14, y + 14 + i * 10.5, { tam: 7.6, cor: rgb(0.25, 0.28, 0.27) }));

  // rodapé em todas as páginas
  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    page = pg;
    linha(M, ALT - 52, X1, CLARO, 0.6);
    T('Documento gerado automaticamente pelo APAC digital em ' + dataHoraBR(opts.agora || new Date()) + ' (horário de Cuiabá).' +
      (paginas.length > 1 ? '  ·  Página ' + (i + 1) + ' de ' + paginas.length : ''), LARG / 2, ALT - 40, { tam: 6.8, cor: CINZA, alinhar: 'center' });
  });

  return doc.save();
}
