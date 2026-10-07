/**
 * RELATÓRIO DA CONFERÊNCIA em PDF (A4 em pé), no mesmo layout do
 * relatório antigo do Google Drive. Feito no navegador com pdf-lib.
 *
 * Uso: const bytes = await gerarPdfConferencia(window.PDFLib, conferencia, {
 *        unidade: { nome, municipio, uf }, emitidoEm: Date, brasao: { bytes, tipo } });
 * conferencia = { paciente, cns, campos, resumo, fontes: ['sus','celk',…] }
 */
import { textoSeguro } from './pdf-apac.js';
import { CONF_FONTES, contarStatus, normalizarStatus, TEXTO_STATUS, fontesDaConferencia } from './conferencia.js';
import { dataHoraBR, hojeBR } from './texto.js';

const LARG = 595.28;
const ALT = 841.89;
const M = 34;                    // margens
const X1 = LARG - M;
const LARGURA = X1 - M;

/** Quebra o texto em linhas que caibam na largura (quebra palavras longas também). */
export function quebrarLinhas(texto, fonte, tamanho, largura) {
  const t = textoSeguro(texto);
  if (!t) return [''];
  const cabe = (s) => fonte.widthOfTextAtSize(s, tamanho) <= largura;
  const linhas = [];
  let atual = '';
  t.split(' ').forEach((palavra) => {
    let p = palavra;
    while (!cabe(p)) {               // palavra maior que a coluna: corta no meio
      let i = p.length - 1;
      while (i > 1 && !cabe(p.substring(0, i))) i--;
      if (atual) { linhas.push(atual); atual = ''; }
      linhas.push(p.substring(0, i));
      p = p.substring(i);
    }
    const tentativa = atual ? atual + ' ' + p : p;
    if (cabe(tentativa)) atual = tentativa;
    else { linhas.push(atual); atual = p; }
  });
  if (atual) linhas.push(atual);
  return linhas;
}

export async function gerarPdfConferencia(PDFLib, conf, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const u = opts.unidade || {};
  const emitido = opts.emitidoEm ? new Date(opts.emitidoEm) : new Date();

  const doc = await PDFDocument.create();
  doc.setTitle('Conferência - ' + textoSeguro(conf.paciente || ''));
  doc.setProducer('Geradora de APAC na nuvem');
  doc.setCreator('apacdigital.com.br');
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const italico = await doc.embedFont(StandardFonts.HelveticaOblique);

  const PRETO = rgb(0.1, 0.1, 0.1);
  const CINZA = rgb(0.33, 0.33, 0.33);
  const CINZA_CLARO = rgb(0.87, 0.87, 0.87);
  const COR_STATUS = { ok: rgb(0.1, 0.45, 0.2), divergente: rgb(0.72, 0.11, 0.11), atencao: rgb(0.6, 0.4, 0) };
  const FUNDO_STATUS = { divergente: rgb(0.984, 0.89, 0.89), atencao: rgb(0.992, 0.953, 0.855) };

  let brasao = null;
  if (opts.brasao && opts.brasao.bytes) {
    try {
      brasao = /png/i.test(opts.brasao.tipo || '') ? await doc.embedPng(opts.brasao.bytes) : await doc.embedJpg(opts.brasao.bytes);
    } catch (e) {
      try { brasao = await doc.embedPng(opts.brasao.bytes); } catch (e2) { brasao = null; }
    }
  }

  let page;
  let y;
  const novaPagina = () => { page = doc.addPage([LARG, ALT]); y = ALT - M; };
  const escrever = (t, x, yy, { fonte = normal, tam = 9, cor = PRETO } = {}) =>
    page.drawText(textoSeguro(t), { x, y: yy, size: tam, font: fonte, color: cor });
  const centralizar = (t, yy, op = {}) => {
    const fonte = op.fonte || normal;
    const tam = op.tam || 9;
    const w = fonte.widthOfTextAtSize(textoSeguro(t), tam);
    escrever(t, (LARG - w) / 2, yy, op);
  };
  /** Parágrafo com quebra de linha; devolve a altura usada */
  const paragrafo = (t, x, largura, { fonte = normal, tam = 8.5, cor = PRETO, entre = 11 } = {}) => {
    const linhas = quebrarLinhas(t, fonte, tam, largura);
    linhas.forEach((l) => { escrever(l, x, y, { fonte, tam, cor }); y -= entre; });
  };

  // ---------------- CABEÇALHO ----------------
  novaPagina();
  const municipio = String(u.municipio || '').toUpperCase();
  const uf = String(u.uf || '').toUpperCase();
  const titulo = municipio ? 'PREFEITURA MUNICIPAL DE ' + municipio + (uf ? ' - ' + uf : '') : 'PREFEITURA MUNICIPAL';
  const ALT_CAB = 58;
  if (brasao) {
    const esc = Math.min(54 / brasao.height, 70 / brasao.width);
    const w = brasao.width * esc, hh = brasao.height * esc;
    page.drawImage(brasao, { x: M, y: y - ALT_CAB + (ALT_CAB - hh) / 2, width: w, height: hh });
  }
  centralizar(titulo, y - 18, { fonte: negrito, tam: 12.5 });
  centralizar('SECRETARIA MUNICIPAL DE SAÚDE — CONFERÊNCIA DE CADASTRO APAC', y - 34, { tam: 10, cor: CINZA });
  y -= ALT_CAB + 4;
  page.drawLine({ start: { x: M, y }, end: { x: X1, y }, thickness: 1.6, color: PRETO });
  y -= 16;

  // ---------------- DADOS DO PACIENTE ----------------
  const info = (rot, val, x, larg, forte) => {
    escrever(rot, x, y, { tam: 9, cor: CINZA });
    const wr = normal.widthOfTextAtSize(rot, 9) + 5;
    const linhas = quebrarLinhas(val || '—', forte ? negrito : normal, 9, larg - wr);
    escrever(linhas[0], x + wr, y, { tam: 9, fonte: forte ? negrito : normal });
  };
  info('Paciente:', conf.paciente, M, 330, true);
  info('CNS:', conf.cns, M + 340, LARGURA - 340);
  y -= 14;
  info('Unidade:', String(u.nome || '').toUpperCase(), M, 330);
  info('Emitido em:', dataHoraBR(emitido).replace(' ', ' às '), M + 340, LARGURA - 340);
  y -= 16;

  // ---------------- RESUMO ----------------
  const campos = conf.campos || [];
  const n = contarStatus(campos);
  const presentes = fontesDaConferencia(conf);
  const ausentes = CONF_FONTES.filter((f) => presentes.indexOf(f) === -1);

  const linhasResumo = [];
  linhasResumo.push({ t: 'Conformes: ' + n.ok + '  |  Divergentes: ' + n.divergente + '  |  Atenção: ' + n.atencao +
    '  |  Total de campos: ' + n.total, fonte: negrito });
  linhasResumo.push({ t: 'Fontes confrontadas: ' + (presentes.map((f) => f.label).join(', ') || 'nenhuma') });
  if (ausentes.length) {
    linhasResumo.push({ t: 'Fontes não anexadas (não verificáveis nesta conferência): ' + ausentes.map((f) => f.label).join(', '),
      fonte: italico, cor: rgb(0.64, 0.2, 0.2) });
  }
  if (conf.resumo) linhasResumo.push({ t: 'Resumo: ' + conf.resumo, sep: true });

  const larguraTxt = LARGURA - 20;
  const quebradas = linhasResumo.map((l) => ({ ...l, linhas: quebrarLinhas(l.t, l.fonte || normal, 8.5, larguraTxt) }));
  const altCaixa = quebradas.reduce((s, l) => s + l.linhas.length * 11 + (l.sep ? 4 : 0), 0) + 10;
  page.drawRectangle({ x: M, y: y - altCaixa + 9, width: LARGURA, height: altCaixa,
    color: rgb(0.957, 0.957, 0.957), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.8 });
  y -= 4;
  quebradas.forEach((l) => {
    if (l.sep) y -= 4;
    l.linhas.forEach((t) => { escrever(t, M + 10, y, { fonte: l.fonte || normal, tam: 8.5, cor: l.cor || PRETO }); y -= 11; });
  });
  y -= 14;

  // ---------------- LEGENDA ----------------
  paragrafo('Conforme = igual entre as fontes disponíveis  |  Divergente = divergência confirmada  |  ' +
    'Atenção = campo ausente em parte das fontes ou diferença pequena  |  — = não constava no documento',
    M, LARGURA, { tam: 7.5, cor: CINZA, entre: 9.5 });
  y -= 6;

  // ---------------- TABELA ----------------
  const COLS = [
    { rot: 'Campo', w: 82 },
    ...CONF_FONTES.map((f) => ({ rot: f.curto, chave: f.chave, w: 0 })),
    { rot: 'Status', w: 58 }
  ];
  const livre = (LARGURA - 82 - 58) / CONF_FONTES.length;
  COLS.forEach((c) => { if (!c.w) c.w = livre; });
  const PAD = 4;
  const TAM = 8;
  const ENTRE = 10;

  const cabecalhoTabela = () => {
    const hCab = 18;
    page.drawRectangle({ x: M, y: y - hCab + 6, width: LARGURA, height: hCab, color: rgb(0.2, 0.2, 0.2) });
    let x = M;
    COLS.forEach((c) => {
      escrever(c.rot, x + PAD, y - 6, { fonte: negrito, tam: 8, cor: rgb(1, 1, 1) });
      x += c.w;
    });
    y -= hCab;
  };
  const caber = (altura) => {
    if (y - altura < M + 20) { novaPagina(); cabecalhoTabela(); }
  };

  cabecalhoTabela();
  campos.forEach((item) => {
    const st = normalizarStatus(item.status);
    const celulas = COLS.map((c, i) => {
      if (i === 0) return quebrarLinhas(item.campo, negrito, TAM, c.w - 2 * PAD);
      if (i === COLS.length - 1) return [TEXTO_STATUS[st]];
      return quebrarLinhas(item[c.chave] || '—', normal, TAM, c.w - 2 * PAD);
    });
    const nLinhas = Math.max(...celulas.map((l) => l.length));
    const altLinha = nLinhas * ENTRE + 6;
    const obs = item.observacao ? quebrarLinhas('Obs.: ' + item.observacao, italico, 7.8, LARGURA - 2 * PAD) : [];
    const altObs = obs.length ? obs.length * 9.5 + 5 : 0;
    caber(altLinha + altObs);

    if (FUNDO_STATUS[st]) {
      page.drawRectangle({ x: M, y: y - altLinha - altObs + 6, width: LARGURA, height: altLinha + altObs, color: FUNDO_STATUS[st] });
    }
    let x = M;
    celulas.forEach((linhas, i) => {
      const ultima = i === COLS.length - 1;
      linhas.forEach((t, k) => {
        escrever(t, x + PAD, y - 4 - k * ENTRE, {
          tam: TAM,
          fonte: i === 0 || ultima ? negrito : normal,
          cor: ultima ? COR_STATUS[st] : PRETO
        });
      });
      x += COLS[i].w;
    });
    y -= altLinha;
    obs.forEach((t, k) => {
      escrever(t, M + PAD, y - 2 - k * 9.5, { fonte: italico, tam: 7.8, cor: CINZA });
    });
    y -= altObs;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: X1, y: y + 6 }, thickness: 0.6, color: CINZA_CLARO });
  });

  // ---------------- ASSINATURAS E RODAPÉ ----------------
  if (y - 95 < M) novaPagina();
  y -= 55;
  const wAss = LARGURA * 0.42;
  [[M, 'Agente de Saúde'], [X1 - wAss, 'Responsável pela Conferência']].forEach(([x, rot]) => {
    page.drawLine({ start: { x, y }, end: { x: x + wAss, y }, thickness: 0.8, color: PRETO });
    const w = normal.widthOfTextAtSize(rot, 9);
    escrever(rot, x + (wAss - w) / 2, y - 12, { tam: 9 });
  });
  y -= 40;
  const local = municipio ? municipio + (uf ? '/' + uf : '') + ', ' : '';
  const rod = local + hojeBR(emitido);
  escrever(rod, X1 - normal.widthOfTextAtSize(textoSeguro(rod), 9), y, { tam: 9, cor: CINZA });

  // numeração das páginas
  const paginas = doc.getPages();
  if (paginas.length > 1) {
    paginas.forEach((p, i) => {
      const t = 'Página ' + (i + 1) + ' de ' + paginas.length;
      p.drawText(t, { x: X1 - normal.widthOfTextAtSize(t, 7.5), y: 16, size: 7.5, font: normal, color: CINZA });
    });
  }
  return await doc.save();
}
