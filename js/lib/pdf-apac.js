/**
 * ③ GERAR APAC EM PDF — desenha o "Laudo para Solicitação/Autorização de
 * Procedimento Ambulatorial" (layout de caixas arredondadas e campos
 * numerados, no estilo dos laudos do G-MUS).
 * Usa pdf-lib (sem servidor): o PDF sai pronto no navegador.
 *
 * Uso: const bytes = await gerarPdfApac(window.PDFLib, dados, {
 *        uf: 'MT',
 *        unidade: { nome, municipio, uf },                 // para o rodapé do QR
 *        qr: { url, modulos },                             // opcional: matrizQr(url)
 *        assinatura: { bytes, tipo: 'image/png' }          // opcional: carimbo + assinatura
 *      });
 * (PDFLib é passado por fora para dar para testar no Node também.)
 */
import { soDigitos } from './validacao.js';
import { dataHoraBR } from './texto.js';

const ESTADOS = {
  AC: 'ACRE', AL: 'ALAGOAS', AP: 'AMAPÁ', AM: 'AMAZONAS', BA: 'BAHIA', CE: 'CEARÁ', DF: 'DISTRITO FEDERAL',
  ES: 'ESPÍRITO SANTO', GO: 'GOIÁS', MA: 'MARANHÃO', MT: 'MATO GROSSO', MS: 'MATO GROSSO DO SUL',
  MG: 'MINAS GERAIS', PA: 'PARÁ', PB: 'PARAÍBA', PR: 'PARANÁ', PE: 'PERNAMBUCO', PI: 'PIAUÍ',
  RJ: 'RIO DE JANEIRO', RN: 'RIO GRANDE DO NORTE', RS: 'RIO GRANDE DO SUL', RO: 'RONDÔNIA', RR: 'RORAIMA',
  SC: 'SANTA CATARINA', SP: 'SÃO PAULO', SE: 'SERGIPE', TO: 'TOCANTINS'
};

// A4 em pontos
const LARG = 595.28;
const ALT  = 841.89;
const X0 = 34;          // margem esquerda do conteúdo
const X1 = 561;         // margem direita do conteúdo

/** A fonte padrão do PDF (WinAnsi) não tem emoji nem alguns símbolos: troca ou tira. */
const EXTRAS_WINANSI = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function textoSeguro(t) {
  return String(t === null || t === undefined ? '' : t)
    .replace(/[‐-‒]/g, '-')
    .split('')
    .filter((c) => c.charCodeAt(0) <= 0xFF || EXTRAS_WINANSI.indexOf(c) !== -1)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 9 dígitos → "9 9999-9999" · 8 dígitos → "9999-9999" (fTelefone_) */
export function formatarTelefone(t) {
  const d = soDigitos(t);
  if (d.length === 9) return d.replace(/^(\d)(\d{4})(\d{4})$/, '$1 $2-$3');
  if (d.length === 8) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  return d;
}

/** 78450314 → "78.450-314" (fCep_) */
export function formatarCep(c) {
  const d = soDigitos(c);
  if (!d) return '';
  return ('00000000' + d).slice(-8).replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3');
}

/** Endereço numa linha só, como o TEXTJOIN da antiga aba APAC */
export function montarEndereco(d) {
  const junta = (sep, ...v) => v.map((x) => String(x || '').trim()).filter(Boolean).join(sep);
  return junta(', ', d.logradouro, d.numero, d.complemento, d.bairro).toUpperCase();
}

/** Dígitos para as 15 caixinhas. CNS: completa com zeros à esquerda (como antes). CPF: 11 dígitos. */
export function digitosDocumento(numero, tipo) {
  const d = soDigitos(numero);
  if (!d) return '';
  if (String(tipo || '').toUpperCase() === 'CPF') return d.substring(0, 11);
  return ('000000000000000' + d).slice(-15);
}

export async function gerarPdfApac(PDFLib, dados, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle('APAC - ' + textoSeguro(dados.nome_paciente || ''));
  doc.setProducer('APAC digital');
  doc.setCreator('apacdigital.com.br');

  const page = doc.addPage([LARG, ALT]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const PRETO = rgb(0, 0, 0);
  const BORDA = rgb(0.28, 0.28, 0.28);
  const BRANCO = rgb(1, 1, 1);
  const CINZA = rgb(0.4, 0.4, 0.4);
  const v = (k) => textoSeguro(dados[k]);
  const V = (k) => textoSeguro(dados[k]).toUpperCase();
  const MM = 72 / 25.4;                 // 1 mm em pontos
  const MARGEM_PAPEL = 6 * MM;          // retângulo reto a 0,6 cm da beirada da folha
  const FOLGA = 1 * MM;                 // 1 mm entre o retângulo reto e a moldura arredondada
  const MOLDURA = 2 * MM;               // 2 mm entre a moldura arredondada e o conteúdo
  const DENTRO = MARGEM_PAPEL + FOLGA + MOLDURA;   // ≈ 9 mm
  const L0 = DENTRO, L1 = LARG - DENTRO; // margens do conteúdo
  const H = 19;                        // altura padrão de um campo
  const PASSO = 26;                    // distância entre linhas de campos

  // y "de cima para baixo" → y do PDF (de baixo para cima)
  const Y = (topo) => ALT - topo;

  /** Caixa de cantos arredondados */
  function caixaRedonda(x1, topo, x2, altura, { r = 3.5, espessura = 0.6, cor = BORDA } = {}) {
    const w = x2 - x1, a = altura;
    const caminho = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${a - r} Q ${w} ${a} ${w - r} ${a} H ${r} Q 0 ${a} 0 ${a - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(caminho, { x: x1, y: Y(topo), borderColor: cor, borderWidth: espessura });
  }

  /** Faixa preta com o título da seção */
  function faixa(topo, texto) {
    page.drawRectangle({ x: L0, y: Y(topo + 12), width: L1 - L0, height: 12, color: PRETO });
    const tam = 8;
    const w = negrito.widthOfTextAtSize(texto, tam);
    page.drawText(texto, { x: (L0 + L1) / 2 - w / 2, y: Y(topo + 9), size: tam, font: negrito, color: BRANCO });
  }

  /** Rótulo "12 - NOME" em cima da linha da caixa (como um fieldset); diminui para caber */
  function legenda(x1, topo, texto, x2) {
    let t = textoSeguro(texto);
    const cabe = (x2 || L1) - x1 - 14;
    let tam = 5.4;
    while (tam > 4.3 && normal.widthOfTextAtSize(t, tam) > cabe) tam -= 0.1;
    while (t.length > 4 && normal.widthOfTextAtSize(t, tam) > cabe) t = t.slice(0, -1);
    const w = normal.widthOfTextAtSize(t, tam);
    page.drawRectangle({ x: x1 + 5, y: Y(topo + 2.2), width: w + 4, height: 4.6, color: BRANCO });
    page.drawText(t, { x: x1 + 7, y: Y(topo + 1.9), size: tam, font: normal, color: PRETO });
  }

  /** Escreve o valor dentro da caixa, diminuindo a letra se não couber. */
  function valor(x1, topo, x2, texto, { altura = H, alinhar = 'left', tam = 8, fonte = normal } = {}) {
    let t = textoSeguro(texto);
    if (!t) return;
    const largura = x2 - x1 - 10;
    let s = tam;
    while (s > 5 && fonte.widthOfTextAtSize(t, s) > largura) s -= 0.25;
    while (t.length > 1 && fonte.widthOfTextAtSize(t, s) > largura) t = t.slice(0, -1);
    const w = fonte.widthOfTextAtSize(t, s);
    const x = alinhar === 'center' ? (x1 + x2) / 2 - w / 2 : (alinhar === 'right' ? x2 - 5 - w : x1 + 5);
    page.drawText(t, { x, y: Y(topo + altura / 2 + s * 0.35 + 1), size: s, font: fonte, color: PRETO });
  }

  function campo(x1, topo, x2, rot, texto, o = {}) {
    caixaRedonda(x1, topo, x2, o.altura || H);
    legenda(x1, topo, rot, x2);
    valor(x1, topo, x2, texto, o);
  }

  /** Quadradinho de marcar com o rótulo antes: "Mas. [X]" */
  function marcar(x, topo, rot, marcado, { rotuloDepois = false } = {}) {
    const tam = 6.8;
    const w = normal.widthOfTextAtSize(rot, tam);
    const xc = rotuloDepois ? x : x + w + 3;
    page.drawRectangle({ x: xc, y: Y(topo + 10.5), width: 9, height: 9, borderColor: BORDA, borderWidth: 0.6 });
    if (marcado) page.drawText('X', { x: xc + 2, y: Y(topo + 9), size: 7.5, font: negrito, color: PRETO });
    page.drawText(rot, { x: rotuloDepois ? xc + 12 : x, y: Y(topo + 8.8), size: tam, font: normal, color: PRETO });
    return (rotuloDepois ? 12 + w : w + 3 + 9) + 9;
  }

  /**
   * Texto longo (Observações): bloco no meio da altura da caixa, sempre
   * alinhado à esquerda. Texto curto ganha letra um pouco maior.
   */
  function paragrafo(x1, topo, x2, altura, texto, tamMin = 7.4, tamMax = 9) {
    const palavras = textoSeguro(texto).split(' ').filter(Boolean);
    if (!palavras.length) return;
    const largura = x2 - x1 - 16;
    const quebrar = (tam) => {
      const linhas = [];
      let atual = [];
      palavras.forEach((p) => {
        const tentativa = atual.concat(p).join(' ');
        if (!atual.length || normal.widthOfTextAtSize(tentativa, tam) <= largura) atual.push(p);
        else { linhas.push(atual); atual = [p]; }
      });
      if (atual.length) linhas.push(atual);
      return linhas;
    };
    const util = altura - 12;                              // espaço sob a legenda
    let tam = tamMax, linhas = quebrar(tam);
    while (tam > tamMin && linhas.length * tam * 1.3 > util) { tam -= 0.2; linhas = quebrar(tam); }
    const passo = tam * 1.3;
    const cabem = Math.max(1, Math.floor(util / passo));
    linhas = linhas.slice(0, cabem);
    const blocoAlt = linhas.length * passo;
    const y0 = topo + 7 + (util - blocoAlt) / 2;            // centraliza na altura
    const xi = x1 + 8;
    linhas.forEach((ws, i) => {
      page.drawText(ws.join(' '), { x: xi, y: Y(y0 + i * passo + tam), size: tam, font: normal, color: PRETO });
    });
  }

  // ---------------- CABEÇALHO ----------------
  const temQr = !!(opts.qr && opts.qr.modulos && opts.qr.modulos.length);
  const QR = 60;
  // antes (margem 28 pt, topo 32) o fim era 805 = (842 − 28) − 9; agora sobra a diferença para as Observações
  const FOLGA_OBS = (ALT - DENTRO - 9) - (805 + (DENTRO + 4 - 32));
  const topoCab = DENTRO + 4;           // o QR sobe 4 pt acima do cabeçalho
  // retângulo reto (0,6 cm da beirada) + moldura arredondada 1 mm para dentro
  page.drawRectangle({ x: MARGEM_PAPEL, y: MARGEM_PAPEL, width: LARG - 2 * MARGEM_PAPEL, height: ALT - 2 * MARGEM_PAPEL,
                       borderColor: PRETO, borderWidth: 0.7 });
  const M2 = MARGEM_PAPEL + FOLGA;
  caixaRedonda(M2, M2, LARG - M2, ALT - 2 * M2, { r: 7, espessura: 0.9, cor: PRETO });
  // logo SUS (desenhado: letras + cruz)
  caixaRedonda(L0, topoCab, L0 + 132, 50, { espessura: 0.8 });
  page.drawText('SUS', { x: L0 + 9, y: Y(topoCab + 33), size: 20, font: negrito, color: PRETO });
  const cx = L0 + 63, cy = topoCab + 25;
  page.drawRectangle({ x: cx - 9, y: Y(cy + 3), width: 18, height: 6, color: PRETO });
  page.drawRectangle({ x: cx - 3, y: Y(cy + 9), width: 6, height: 18, color: PRETO });
  [['Sistema', 18], ['Único de', 25.5], ['Saúde', 33]].forEach(([t, d]) =>
    page.drawText(t, { x: L0 + 79, y: Y(topoCab + d), size: 6.3, font: negrito, color: PRETO }));
  page.drawText('Ministério da Saúde', { x: L0 + 79, y: Y(topoCab + 42), size: 5.6, font: normal, color: PRETO });

  // título
  const tx1 = L0 + 140, tx2 = temQr ? L1 - QR - 8 : L1;
  caixaRedonda(tx1, topoCab, tx2, 50, { espessura: 0.8 });
  const titulo = ['LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE', 'PROCEDIMENTO AMBULATORIAL'];
  titulo.forEach((t, i) => {
    let tam = 11.5;
    while (tam > 8 && negrito.widthOfTextAtSize(t, tam) > tx2 - tx1 - 14) tam -= 0.25;
    const w = negrito.widthOfTextAtSize(t, tam);
    page.drawText(t, { x: (tx1 + tx2) / 2 - w / 2, y: Y(topoCab + 20 + i * 14), size: tam, font: negrito, color: PRETO });
  });
  const estado = ESTADOS[String(opts.uf || '').toUpperCase()];
  if (estado) {
    const t = 'ESTADO DE ' + textoSeguro(estado);
    const w = normal.widthOfTextAtSize(t, 6.5);
    page.drawText(t, { x: (tx1 + tx2) / 2 - w / 2, y: Y(topoCab + 45), size: 6.5, font: normal, color: CINZA });
  }

  // QR Code (opcional)
  if (temQr) {
    const m = opts.qr.modulos;
    const n = m.length;
    const lado = QR / (n + 2);                 // 1 módulo de margem em volta
    const qx = L1 - QR, qtopo = topoCab - 4;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (m[r][c]) page.drawRectangle({ x: qx + (c + 1) * lado, y: Y(qtopo + (r + 2) * lado), width: lado + 0.05, height: lado + 0.05, color: PRETO });
      }
    }
  }

  let t = topoCab + 58;

  // ---------------- 1. ESTABELECIMENTO SOLICITANTE ----------------
  faixa(t, 'IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)');
  t += 20;
  campo(L0, t, 466, '1 - NOME DO ESTABELECIMENTO DE SAÚDE SOLICITANTE', V('estab_solicitante'));
  campo(474, t, L1, '2 - CNES', v('cnes_solicitante'), { alinhar: 'center' });
  t += PASSO;

  // ---------------- 2. PACIENTE ----------------
  faixa(t, 'IDENTIFICAÇÃO DO PACIENTE');
  t += 20;
  campo(L0, t, 466, '3 - NOME DO PACIENTE', V('nome_paciente'), { fonte: negrito, tam: 8.5 });
  campo(474, t, L1, '4 - Nº DO PRONTUÁRIO', v('prontuario'), { alinhar: 'center' });
  t += PASSO;
  campo(L0, t, 156, '5 - CARTÃO NACIONAL DE SAÚDE (CNS)', soDigitos(dados.cns_paciente));
  campo(164, t, 248, '6 - DATA DE NASCIMENTO', v('data_nascimento'), { alinhar: 'center' });
  caixaRedonda(256, t, 352, H);
  legenda(256, t, '7 - SEXO', 352);
  const sexo = V('sexo');
  let mx = 264;
  mx += marcar(mx, t + 4, 'Masc.', sexo === 'MASCULINO');
  marcar(mx, t + 4, 'Fem.', sexo === 'FEMININO');
  const ddd = soDigitos(dados.ddd);
  const tel = formatarTelefone(dados.telefone);
  campo(360, t, L1, '8 - TELEFONE DE CONTATO', tel ? (ddd ? '(' + ddd + ') ' : '') + tel : '');
  t += PASSO;
  campo(L0, t, L1, '9 - NOME DA MÃE OU RESPONSÁVEL', V('nome_mae'));
  t += PASSO;
  campo(L0, t, L1, '10 - ENDEREÇO (RUA, Nº, COMPLEMENTO, BAIRRO)', montarEndereco(dados));
  t += PASSO;
  campo(L0, t, 300, '11 - MUNICÍPIO DE RESIDÊNCIA', V('municipio'));
  campo(308, t, 392, '12 - CÓD. IBGE MUNICÍPIO', v('cod_ibge'), { alinhar: 'center' });
  campo(400, t, 436, '13 - UF', V('uf'), { alinhar: 'center' });
  campo(444, t, L1, '14 - CEP', formatarCep(dados.cep), { alinhar: 'center' });
  t += PASSO;

  // ---------------- 3. PROCEDIMENTO PRINCIPAL ----------------
  faixa(t, 'PROCEDIMENTO SOLICITADO');
  t += 20;
  campo(L0, t, 136, '15 - CÓD. PROC. PRINCIPAL', soDigitos(dados.proc_codigo), { alinhar: 'center', fonte: negrito, tam: 8.5 });
  campo(144, t, 510, '16 - NOME DO PROCEDIMENTO PRINCIPAL', V('proc_nome'), { fonte: negrito });
  campo(518, t, L1, '17 - QTDE', v('proc_qtd'), { alinhar: 'center' });
  t += PASSO;

  // ---------------- 4. SECUNDÁRIOS (só as linhas usadas; no mínimo 1) ----------------
  faixa(t, 'PROCEDIMENTO(S) SECUNDÁRIO(S)');
  t += 20;
  let usados = 1;
  for (let n = 1; n <= 5; n++) {
    if (soDigitos(dados['sec' + n + '_codigo']) || textoSeguro(dados['sec' + n + '_nome'])) usados = n;
  }
  for (let n = 1; n <= usados; n++) {
    const b = 18 + (n - 1) * 3;
    campo(L0, t, 136, b + ' - CÓD. PROC. SECUNDÁRIO', soDigitos(dados['sec' + n + '_codigo']), { alinhar: 'center' });
    campo(144, t, 510, (b + 1) + ' - NOME DO PROCEDIMENTO SECUNDÁRIO', V('sec' + n + '_nome'));
    campo(518, t, L1, (b + 2) + ' - QTDE', v('sec' + n + '_qtd'), { alinhar: 'center' });
    t += PASSO;
  }

  // ---------------- 5. JUSTIFICATIVA ----------------
  faixa(t, 'JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)');
  t += 20;
  campo(L0, t, 330, '33 - DESCRIÇÃO DO DIAGNÓSTICO', V('diag_descricao'));
  campo(338, t, 412, '34 - CID-10 PRINCIPAL', V('cid_principal'), { alinhar: 'center', fonte: negrito, tam: 8.5 });
  campo(420, t, 490, '35 - CID-10 SECUND.', V('cid_secundario'), { alinhar: 'center' });
  campo(498, t, L1, '36 - CID CAUSAS ASSOC.', V('cid_causas'), { alinhar: 'center' });
  t += PASSO;
  // observações: usa o espaço que sobrou dos secundários não usados
  const altObs = 61 + FOLGA_OBS + (5 - usados) * PASSO;
  caixaRedonda(L0, t, L1, altObs);
  legenda(L0, t, '37 - OBSERVAÇÕES / JUSTIFICATIVA', L1);
  paragrafo(L0, t, L1, altObs, V('observacoes'));
  t += altObs + 7;

  // ---------------- 6. SOLICITAÇÃO ----------------
  faixa(t, 'SOLICITAÇÃO');
  t += 20;
  const altAss = PASSO + H;
  campo(L0, t, 300, '38 - NOME DO PROFISSIONAL SOLICITANTE', V('esf_profissional'));
  campo(308, t, 388, '39 - DATA DA SOLICITAÇÃO', v('esf_data'), { alinhar: 'center' });
  caixaRedonda(396, t, L1, altAss);
  legenda(396, t, '42 - ASSINATURA E CARIMBO (Nº REG. CONSELHO)', L1);
  if (opts.assinatura && opts.assinatura.bytes) {
    const img = /png/i.test(opts.assinatura.tipo || '') ? await doc.embedPng(opts.assinatura.bytes) : await doc.embedJpg(opts.assinatura.bytes);
    const cl = L1 - 396 - 10, ca = altAss - 9;
    const esc = Math.min(cl / img.width, ca / img.height);
    const iw = img.width * esc, ih = img.height * esc;
    page.drawImage(img, { x: 396 + (L1 - 396) / 2 - iw / 2, y: Y(t + 5 + ca / 2 + ih / 2), width: iw, height: ih });
  }
  t += PASSO;
  const docEsf = V('esf_doc_tipo') || 'CNS';
  caixaRedonda(L0, t, 114, H);
  legenda(L0, t, '40 - DOCUMENTO', 114);
  let dx = L0 + 8;
  dx += marcar(dx, t + 4, 'CNS', docEsf === 'CNS', { rotuloDepois: true });
  marcar(dx, t + 4, 'CPF', docEsf === 'CPF', { rotuloDepois: true });
  campo(122, t, 388, '41 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE', soDigitos(dados.esf_doc_numero));
  t += PASSO;

  // ---------------- 7. AUTORIZAÇÃO ----------------
  faixa(t, 'AUTORIZAÇÃO');
  t += 20;
  campo(L0, t, 300, '43 - NOME DO PROFISSIONAL AUTORIZADOR', V('aut_profissional'));
  campo(308, t, 388, '44 - CÓD. ÓRGÃO EMISSOR', v('aut_orgao'), { alinhar: 'center' });
  campo(396, t, L1, '49 - Nº DA AUTORIZAÇÃO (APAC)', '', { altura: PASSO + H });
  t += PASSO;
  const docAut = V('aut_doc_tipo');
  caixaRedonda(L0, t, 114, H);
  legenda(L0, t, '45 - DOCUMENTO', 114);
  dx = L0 + 8;
  dx += marcar(dx, t + 4, 'CNS', docAut === 'CNS', { rotuloDepois: true });
  marcar(dx, t + 4, 'CPF', docAut === 'CPF', { rotuloDepois: true });
  campo(122, t, 388, '46 - Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR', soDigitos(dados.aut_doc_numero));
  t += PASSO;
  campo(L0, t, 114, '47 - DATA AUTORIZAÇÃO', '___/___/______', { alinhar: 'center', tam: 7 });
  campo(122, t, 388, '48 - ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)', '');
  campo(396, t, L1, '50 - PERÍODO DE VALIDADE DA APAC', '___/___/______   a   ___/___/______', { alinhar: 'center', tam: 7 });
  t += PASSO;

  // ---------------- 8. EXECUTANTE ----------------
  faixa(t, 'IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)');
  t += 20;
  campo(L0, t, 466, '51 - NOME FANTASIA DO ESTABELECIMENTO DE SAÚDE EXECUTANTE', '');
  campo(474, t, L1, '52 - CNES', '');
  t += H;

  // ---------------- RODAPÉ ----------------
  const centro = (texto, topo, tam, fonte = normal, cor = CINZA) => {
    const tt = textoSeguro(texto);
    let s = tam;
    while (s > 4.5 && fonte.widthOfTextAtSize(tt, s) > L1 - L0) s -= 0.25;
    const w = fonte.widthOfTextAtSize(tt, s);
    page.drawText(tt, { x: (L0 + L1) / 2 - w / 2, y: Y(topo), size: s, font: fonte, color: cor });
  };
  // com QR Code não precisa de link no rodapé (o QR já leva à verificação)
  if (!temQr) centro('apacdigital.com.br  ·  gerado em ' + dataHoraBR(opts.agora || new Date()), t + 7, 5.8);

  return doc.save();
}
