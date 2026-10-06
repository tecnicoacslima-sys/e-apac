/**
 * ③ GERAR APAC EM PDF — desenha o "Laudo para Solicitação/Autorização de
 * Procedimento Ambulatorial" no mesmo layout da antiga aba APAC.
 * Usa pdf-lib (sem servidor): o PDF sai pronto no navegador.
 *
 * Uso: const bytes = await gerarPdfApac(window.PDFLib, dados, { uf: 'MT' });
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
  return junta(' ', junta(', ', d.logradouro, d.numero), junta(', ', d.complemento, d.bairro)).toUpperCase();
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
  doc.setProducer('Geradora de APAC na nuvem');
  doc.setCreator('antonioresolve.com.br');

  const page = doc.addPage([LARG, ALT]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const PRETO = rgb(0, 0, 0);
  const CINZA = rgb(0.45, 0.45, 0.45);
  const v = (k) => textoSeguro(dados[k]);
  const V = (k) => textoSeguro(dados[k]).toUpperCase();

  // y "de cima para baixo" → y do PDF (de baixo para cima)
  const Y = (topo) => ALT - topo;

  function caixa(x1, topo, x2, altura, espessura = 0.7) {
    page.drawRectangle({ x: x1, y: Y(topo + altura), width: x2 - x1, height: altura,
                         borderColor: PRETO, borderWidth: espessura });
  }

  function faixa(topo, texto) {
    page.drawRectangle({ x: X0, y: Y(topo + 13), width: X1 - X0, height: 13, color: PRETO });
    const tam = 8.5;
    const w = negrito.widthOfTextAtSize(texto, tam);
    page.drawText(texto, { x: (X0 + X1) / 2 - w / 2, y: Y(topo + 10), size: tam, font: negrito, color: rgb(1, 1, 1) });
  }

  function rotulo(x, topo, texto) {
    page.drawText(texto, { x: x + 1, y: Y(topo), size: 5.6, font: normal, color: PRETO });
  }

  /** Escreve o valor dentro da caixa, diminuindo a letra se não couber. */
  function valor(x1, topo, x2, texto, { altura = 16, alinhar = 'left', tam = 8.5, fonte = normal } = {}) {
    let t = textoSeguro(texto);
    if (!t) return;
    const largura = x2 - x1 - 6;
    let s = tam;
    while (s > 5 && fonte.widthOfTextAtSize(t, s) > largura) s -= 0.25;
    while (t.length > 1 && fonte.widthOfTextAtSize(t, s) > largura) t = t.slice(0, -1);
    const w = fonte.widthOfTextAtSize(t, s);
    const x = alinhar === 'center' ? (x1 + x2) / 2 - w / 2 : (alinhar === 'right' ? x2 - 3 - w : x1 + 3);
    page.drawText(t, { x, y: Y(topo + altura / 2 + s * 0.35), size: s, font: fonte, color: PRETO });
  }

  function campo(x1, topo, x2, rot, texto, o = {}) {
    rotulo(x1, topo - 2, rot);
    caixa(x1, topo, x2, o.altura || 16);
    valor(x1, topo, x2, texto, o);
  }

  /** 15 caixinhas de dígitos (CNS / documento) */
  function caixinhas(x1, topo, x2, digitos, n = 15) {
    const w = (x2 - x1) / n;
    for (let i = 0; i < n; i++) {
      caixa(x1 + i * w, topo, x1 + (i + 1) * w, 16, 0.6);
      const c = digitos.charAt(i);
      if (c) {
        const cw = negrito.widthOfTextAtSize(c, 9);
        page.drawText(c, { x: x1 + i * w + w / 2 - cw / 2, y: Y(topo + 11.5), size: 9, font: negrito, color: PRETO });
      }
    }
  }

  function marcar(x, topo, rot, marcado) {
    caixa(x, topo + 3, x + 10, 10, 0.7);
    if (marcado) page.drawText('X', { x: x + 2.4, y: Y(topo + 11.3), size: 8.5, font: negrito, color: PRETO });
    page.drawText(rot, { x: x + 13, y: Y(topo + 11), size: 6.5, font: normal, color: PRETO });
  }

  /** Texto longo em várias linhas (Observações) */
  function paragrafo(x1, topo, x2, altura, texto, tam = 7.5) {
    const palavras = textoSeguro(texto).split(' ').filter(Boolean);
    const largura = x2 - x1 - 8;
    const linhas = [];
    let atual = '';
    palavras.forEach((p) => {
      const tentativa = atual ? atual + ' ' + p : p;
      if (normal.widthOfTextAtSize(tentativa, tam) <= largura) atual = tentativa;
      else { if (atual) linhas.push(atual); atual = p; }
    });
    if (atual) linhas.push(atual);
    const cabem = Math.floor((altura - 4) / (tam + 1.6));
    linhas.slice(0, cabem).forEach((l, i) => {
      page.drawText(l, { x: x1 + 4, y: Y(topo + 4 + tam + i * (tam + 1.6)), size: tam, font: normal, color: PRETO });
    });
  }

  // ---------------- MOLDURA E CABEÇALHO ----------------
  page.drawRectangle({ x: 26, y: Y(774), width: LARG - 52, height: 774 - 30, borderColor: PRETO, borderWidth: 1 });

  caixa(X0, 38, X0 + 150, 48, 0.8);
  page.drawText('SUS', { x: X0 + 8, y: Y(70), size: 24, font: negrito, color: PRETO });
  page.drawText('Ministério', { x: X0 + 64, y: Y(57), size: 7.5, font: normal, color: PRETO });
  page.drawText('da Saúde', { x: X0 + 64, y: Y(66), size: 7.5, font: normal, color: PRETO });
  const estado = ESTADOS[String(opts.uf || '').toUpperCase()];
  if (estado) {
    page.drawText('ESTADO DE', { x: X0 + 64, y: Y(76), size: 6, font: negrito, color: PRETO });
    page.drawText(textoSeguro(estado), { x: X0 + 64, y: Y(83), size: 6, font: negrito, color: PRETO });
  }

  caixa(X0 + 160, 38, X1, 48, 0.8);
  [['LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO DE', 58], ['PROCEDIMENTO AMBULATORIAL', 72]].forEach(([t, topo]) => {
    const w = normal.widthOfTextAtSize(t, 11);
    page.drawText(t, { x: (X0 + 160 + X1) / 2 - w / 2, y: Y(topo), size: 11, font: normal, color: PRETO });
  });

  // ---------------- ESTABELECIMENTO SOLICITANTE ----------------
  faixa(92, 'IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (SOLICITANTE)');
  campo(X0, 113, 432, 'NOME DO ESTABELECIMENTO SOLICITANTE', V('estab_solicitante'));
  campo(440, 113, X1, 'CNES', v('cnes_solicitante'), { alinhar: 'center', tam: 10 });

  // ---------------- PACIENTE ----------------
  faixa(134, 'IDENTIFICAÇÃO DO PACIENTE');
  campo(X0, 155, 432, 'NOME DO PACIENTE', V('nome_paciente'), { tam: 9.5, fonte: negrito });
  campo(440, 155, X1, 'Nº DO PRONTUÁRIO', v('prontuario'), { alinhar: 'center' });

  rotulo(X0, 178, 'CARTÃO NACIONAL DE SAÚDE (CNS)');
  caixinhas(X0, 180, X0 + 255, digitosDocumento(dados.cns_paciente, 'CNS'));
  campo(300, 180, 390, 'DATA DE NASCIMENTO', v('data_nascimento'), { alinhar: 'center' });
  rotulo(420, 178, 'SEXO');
  const sexo = V('sexo');
  marcar(420, 180, 'MASC.', sexo === 'MASCULINO');
  marcar(480, 180, 'FEM.', sexo === 'FEMININO');

  campo(X0, 205, 378, 'NOME DA MÃE OU RESPONSÁVEL', V('nome_mae'));
  campo(385, 205, 413, 'DDD', soDigitos(dados.ddd) ? '(' + soDigitos(dados.ddd) + ')' : '', { alinhar: 'center' });
  campo(420, 205, X1, 'TELEFONE DE CONTATO', formatarTelefone(dados.telefone), { alinhar: 'center' });

  campo(X0, 230, X1, 'ENDEREÇO (RUA, Nº, COMPLEMENTO, BAIRRO)', montarEndereco(dados));

  campo(X0, 255, 322, 'MUNICÍPIO DE RESIDÊNCIA', V('municipio'));
  campo(330, 255, 402, 'CÓD. IBGE DO MUNICÍPIO', v('cod_ibge'), { alinhar: 'center' });
  campo(410, 255, 442, 'UF', V('uf'), { alinhar: 'center' });
  campo(450, 255, X1, 'CEP', formatarCep(dados.cep), { alinhar: 'center' });

  // ---------------- PROCEDIMENTO PRINCIPAL ----------------
  faixa(277, 'PROCEDIMENTO SOLICITADO');
  campo(X0, 298, 132, 'CÓD. PROC. PRINCIPAL', soDigitos(dados.proc_codigo), { alinhar: 'center', tam: 9.5, fonte: negrito });
  campo(140, 298, 492, 'NOME DO PROCEDIMENTO PRINCIPAL', V('proc_nome'), { fonte: negrito });
  campo(500, 298, X1, 'QUANTIDADE', v('proc_qtd'), { alinhar: 'center', tam: 10 });

  // ---------------- SECUNDÁRIOS ----------------
  faixa(320, 'PROCEDIMENTO(S) SECUNDÁRIO(S)');
  for (let i = 0; i < 5; i++) {
    const topo = 341 + i * 23;
    const n = i + 1;
    campo(X0, topo, 132, 'CÓD. PROC. SECUNDÁRIO', soDigitos(dados['sec' + n + '_codigo']), { alinhar: 'center' });
    campo(140, topo, 492, 'NOME DO PROCEDIMENTO SECUNDÁRIO', V('sec' + n + '_nome'));
    campo(500, topo, X1, 'QUANTIDADE', v('sec' + n + '_qtd'), { alinhar: 'center' });
  }

  // ---------------- JUSTIFICATIVA ----------------
  faixa(455, 'JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)');
  campo(X0, 476, 322, 'DESCRIÇÃO DO DIAGNÓSTICO', V('diag_descricao'));
  campo(330, 476, 398, 'CID-10 PRINCIPAL', V('cid_principal'), { alinhar: 'center', tam: 9.5, fonte: negrito });
  campo(405, 476, 473, 'CID-10 SECUNDÁRIO', V('cid_secundario'), { alinhar: 'center' });
  campo(480, 476, X1, 'CID-10 CAUSAS ASSOCIADAS', V('cid_causas'), { alinhar: 'center' });
  rotulo(X0, 498, 'OBSERVAÇÕES');
  caixa(X0, 500, X1, 46);
  paragrafo(X0, 500, X1, 46, V('observacoes'));

  // ---------------- SOLICITAÇÃO ----------------
  faixa(552, 'SOLICITAÇÃO');
  campo(X0, 573, 262, 'NOME DO PROFISSIONAL SOLICITANTE', V('esf_profissional'));
  campo(270, 573, 352, 'DATA DA SOLICITAÇÃO', v('esf_data'), { alinhar: 'center' });
  rotulo(360, 571, 'ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)');
  caixa(360, 573, X1, 42);
  rotulo(X0, 597, 'DOCUMENTO');
  const docEsf = V('esf_doc_tipo') || 'CNS';
  marcar(X0, 599, 'CNS', docEsf === 'CNS');
  marcar(X0 + 45, 599, 'CPF', docEsf === 'CPF');
  rotulo(130, 597, 'Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL SOLICITANTE');
  caixinhas(130, 599, 352, digitosDocumento(dados.esf_doc_numero, docEsf));

  // ---------------- AUTORIZAÇÃO ----------------
  faixa(621, 'AUTORIZAÇÃO');
  campo(X0, 642, 262, 'NOME DO PROFISSIONAL AUTORIZADOR', V('aut_profissional'));
  campo(270, 642, 352, 'CÓD. ÓRGÃO EMISSOR', v('aut_orgao'), { alinhar: 'center' });
  rotulo(360, 640, 'Nº DA AUTORIZAÇÃO (APAC)');
  caixa(360, 642, X1, 40);
  rotulo(X0, 664, 'DOCUMENTO');
  const docAut = V('aut_doc_tipo');
  marcar(X0, 666, 'CNS', docAut === 'CNS');
  marcar(X0 + 45, 666, 'CPF', docAut === 'CPF');
  rotulo(130, 664, 'Nº DOCUMENTO (CNS/CPF) DO PROFISSIONAL AUTORIZADOR');
  caixinhas(130, 666, 352, digitosDocumento(dados.aut_doc_numero, docAut));
  campo(X0, 703, 102, 'DATA DA AUTORIZAÇÃO', '');
  campo(110, 703, 352, 'ASSINATURA E CARIMBO (Nº DO REGISTRO DO CONSELHO)', '');
  rotulo(360, 701, 'PERÍODO DE VALIDADE DA APAC');
  caixa(360, 703, 452, 16);
  page.drawText('a', { x: 462, y: Y(714), size: 8, font: normal, color: PRETO });
  caixa(472, 703, X1, 16);

  // ---------------- EXECUTANTE ----------------
  faixa(725, 'IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE (EXECUTANTE)');
  campo(X0, 746, 432, 'NOME DO ESTABELECIMENTO EXECUTANTE', '');
  campo(440, 746, X1, 'CNES', '');

  // rodapé
  page.drawText('antonioresolve.com.br  ·  gerado em ' + dataHoraBR(opts.agora || new Date()),
    { x: 28, y: Y(786), size: 6, font: normal, color: CINZA });

  return doc.save();
}
