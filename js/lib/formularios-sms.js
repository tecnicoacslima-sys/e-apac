/**
 * FORMULÁRIOS PRÉ-PREENCHIDOS — escreve os dados do paciente por cima dos PDFs
 * oficiais (protocolos/sms/*.pdf), sem mudar o modelo: sai igual ao papel da
 * Secretaria, só que com a identificação já preenchida.
 *
 * Posições em pontos (1/72 pol.), medidas no próprio PDF com o canto
 * SUPERIOR esquerdo como origem (y = linha de base do texto).
 *   { x, y, max, tam }  → texto (max = largura máxima; a letra diminui para caber)
 *   { x, y, marca: true } → um "X" (caixinha de sexo)
 *   { x, y, passo, digitos } → um dígito em cada quadradinho (x = centro do 1º)
 *
 * Tudo no navegador, sem IA. Usado por telas/formularios.js.
 */

export const FORMULARIOS = [
  {
    chave: 'bariatrica1', arquivo: 'bariatrica-anexo1-avaliacao-inicial.pdf',
    rotulo: 'Bariátrica — Anexo I: avaliação inicial (médico)', curto: 'BARIATRICA_ANEXO1', tam: 9, imc: true,
    campos: {
      nome: { x: 46, y: 155, max: 430 },
      nasc_dia: { x: 483, y: 156 }, nasc_mes: { x: 505.5, y: 156 }, nasc_ano: { x: 527, y: 156 },
      idade: { x: 46, y: 197, max: 32 },
      sexo_M: { x: 82, y: 191.5, marca: true }, sexo_F: { x: 156.3, y: 191.5, marca: true },
      mae: { x: 130, y: 223, max: 420 },
      cpf: { x: 70, y: 269, max: 195 }, cns: { x: 301, y: 269, max: 140 }, telefone: { x: 448, y: 282, max: 104 },
      endereco: { x: 110, y: 296, max: 218 }, bairro: { x: 383, y: 296, max: 92 }, cep: { x: 508, y: 296, max: 46 },
      estab: { x: 46, y: 400, max: 415 }, cnes: { x: 467, y: 400, max: 85 },
      cidade_uf: { x: 373, y: 416, max: 90 },
      imc: { x: 123, y: 465, max: 55 }, peso: { x: 220, y: 465, max: 80 }, altura: { x: 353, y: 463, max: 50 }
    }
  },
  {
    chave: 'bariatrica2', arquivo: 'bariatrica-anexo2-nutricional.pdf',
    rotulo: 'Bariátrica — Anexo II: avaliação nutricional', curto: 'BARIATRICA_ANEXO2', tam: 9, imc: true,
    campos: {
      nome: { x: 148, y: 134.3, max: 275 },
      nasc_dia: { x: 446, y: 147 }, nasc_mes: { x: 468.5, y: 147 }, nasc_ano: { x: 491, y: 147 },
      idade: { x: 48, y: 190, max: 30 },
      sexo_M: { x: 85.2, y: 181, marca: true }, sexo_F: { x: 85.2, y: 195, marca: true },
      mae: { x: 132, y: 224.5, max: 420 },
      cpf: { x: 72, y: 263.5, max: 150 }, cns: { x: 259, y: 263.5, max: 115 }, telefone: { x: 476, y: 263.5, max: 78 },
      endereco: { x: 112, y: 290.5, max: 185 }, bairro: { x: 352, y: 290.5, max: 105 }, cep: { x: 489, y: 290.5, max: 62 },
      peso: { x: 150, y: 489, max: 120 }, altura: { x: 405, y: 489, max: 90 }, imc: { x: 150, y: 514, max: 120 }
    }
  },
  {
    chave: 'bariatrica3', arquivo: 'bariatrica-anexo3-psicologica.pdf',
    rotulo: 'Bariátrica — Anexo III: avaliação psicológica', curto: 'BARIATRICA_ANEXO3', tam: 9,
    campos: {
      nome: { x: 76, y: 157, max: 360 },
      nasc_dia: { x: 467, y: 147 }, nasc_mes: { x: 491.5, y: 147 }, nasc_ano: { x: 513, y: 147 },
      idade: { x: 76, y: 205, max: 32 },
      sexo_M: { x: 113, y: 193.5, marca: true }, sexo_F: { x: 113, y: 207.6, marca: true },
      mae_pai: { x: 189, y: 237.3, max: 360 },
      cpf: { x: 100, y: 276, max: 175 }, cns: { x: 287, y: 276, max: 155 }, telefone: { x: 407, y: 289.5, max: 145 },
      endereco: { x: 140, y: 303.3, max: 185 }, bairro: { x: 380, y: 303.3, max: 105 }, cep: { x: 516, y: 303.3, max: 38 }
    }
  },
  {
    chave: 'enmg', arquivo: 'formulario-eletroneuromiografia.pdf',
    rotulo: 'Eletroneuromiografia (formulário do Estado)', curto: 'ENMG', tam: 9.5,
    campos: {
      estab: { x: 256, y: 118, max: 266 },
      nome: { x: 120, y: 167, max: 400 },
      sexo_txt: { x: 70, y: 189, max: 40 },
      nasc_dia: { x: 175, y: 189 }, nasc_mes: { x: 204, y: 189 }, nasc_ano: { x: 231, y: 189 },
      idade: { x: 296, y: 189, max: 34 }, telefone: { x: 390, y: 189, max: 130 },
      cns: { x: 100, y: 209, max: 155 }, cpf: { x: 292, y: 209, max: 140 }, rg: { x: 458, y: 209, max: 64 },
      mae: { x: 102, y: 229, max: 420 },
      endereco_completo: { x: 93, y: 248, max: 430 },
      municipio: { x: 100, y: 270, max: 150 }, uf: { x: 278, y: 270, max: 30 }, cep: { x: 352, y: 270, max: 170 }
    }
  },
  {
    chave: 'pts', arquivo: 'projeto-terapeutico-singular.pdf',
    rotulo: 'Projeto Terapêutico Singular (PTS)', curto: 'PTS', tam: 11,
    campos: {
      unidade: { x: 163, y: 196.5, max: 380 },
      nome: { x: 98, y: 211.5, max: 440 },
      nascimento: { x: 176, y: 226.5, max: 120 },
      endereco_completo: { x: 117, y: 241.5, max: 420 },
      telefone: { x: 111, y: 256.5, max: 200 }
    }
  },
  {
    chave: 'aih', arquivo: 'laudo-aih-em-branco.pdf',
    rotulo: 'Laudo de AIH (internação) — só a identificação', curto: 'AIH', tam: 8.5,
    campos: {
      estab: { x: 62, y: 97, max: 400 }, cnes: { x: 477.6, y: 97, passo: 15.1, digitos: 7 },
      nome: { x: 62, y: 162, max: 415 }, prontuario: { x: 487, y: 162, max: 70 },
      cns: { x: 62, y: 186, max: 240 }, nascimento: { x: 318, y: 186, max: 70 },
      sexo_M: { x: 420.3, y: 185.3, marca: true, tam: 8.5 }, sexo_F: { x: 473.2, y: 185.3, marca: true, tam: 8.5 },
      mae: { x: 62, y: 208, max: 350 }, ddd: { x: 425, y: 212.3, max: 22, tam: 7.5 }, fone: { x: 470, y: 212.3, max: 85, tam: 7.5 },
      endereco_completo: { x: 62, y: 252, max: 490 },
      municipio: { x: 62, y: 278, max: 290 }, ibge: { x: 367, y: 278, max: 80 }, uf: { x: 455, y: 278, max: 40 }, cep: { x: 500, y: 278, max: 60 }
    }
  }
];

// ------------------------------------------------------------
// Formatos
// ------------------------------------------------------------
const dig = (v) => String(v || '').replace(/\D/g, '');

export function fmtCpf(v) {
  const d = dig(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : String(v || '').trim();
}
export function fmtCns(v) {
  const d = dig(v);
  return d.length === 15 ? d.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4') : String(v || '').trim();
}
export function fmtCep(v) {
  const d = dig(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : String(v || '').trim();
}
export function fmtTelefone(v) {
  const d = dig(v);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return String(v || '').trim();
}

/** Idade em anos completos na data de hoje (nascimento dd/mm/aaaa). */
export function idadeEmAnos(nascBR, hoje = new Date()) {
  const m = String(nascBR || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [d, me, a] = [+m[1], +m[2], +m[3]];
  let idade = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < me || (hoje.getMonth() + 1 === me && hoje.getDate() < d)) idade--;
  return idade >= 0 && idade < 130 ? String(idade) : '';
}

/** Peso (kg) e altura (m ou cm, com vírgula ou ponto) → IMC com 1 casa, ou ''. */
export function calcularImc(peso, altura) {
  const p = parseFloat(String(peso || '').replace(',', '.'));
  let a = parseFloat(String(altura || '').replace(',', '.'));
  if (!p || !a) return '';
  if (a > 3) a = a / 100;           // digitou em centímetros
  if (a < 0.5 || a > 2.6 || p < 10 || p > 400) return '';
  return (p / (a * a)).toFixed(1).replace('.', ',');
}

/**
 * Monta os valores que vão no papel a partir dos dados digitados na tela.
 * d = { nome, nascimento (dd/mm/aaaa), sexo ('M'|'F'|''), cns, cpf, rg, mae, pai, telefone,
 *       logradouro, numero, complemento, bairro, municipio, uf, ibge, cep, prontuario,
 *       estab_nome, estab_cnes, unidade, peso, altura }
 */
export function valoresDoFormulario(d) {
  const up = (v) => String(v || '').trim().toUpperCase();
  const nasc = String(d.nascimento || '').trim();
  const mNasc = nasc.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const rua = [up(d.logradouro), up(d.numero) ? 'Nº ' + up(d.numero) : '', up(d.complemento)].filter(Boolean).join(', ');
  const tel = dig(d.telefone);
  const imc = calcularImc(d.peso, d.altura);
  const alt = String(d.altura || '').trim();
  return {
    nome: up(d.nome),
    nascimento: nasc,
    nasc_dia: mNasc ? mNasc[1] : '', nasc_mes: mNasc ? mNasc[2] : '', nasc_ano: mNasc ? mNasc[3] : '',
    idade: idadeEmAnos(nasc),
    sexo_M: d.sexo === 'M', sexo_F: d.sexo === 'F',
    sexo_txt: d.sexo === 'M' ? 'MASC.' : d.sexo === 'F' ? 'FEM.' : '',
    mae: up(d.mae),
    mae_pai: [up(d.mae) ? 'MÃE: ' + up(d.mae) : '', up(d.pai) ? 'PAI: ' + up(d.pai) : ''].filter(Boolean).join(' / '),
    cpf: fmtCpf(d.cpf), cns: fmtCns(d.cns), rg: up(d.rg),
    telefone: fmtTelefone(d.telefone),
    ddd: tel.length >= 10 ? tel.slice(0, 2) : '',
    fone: tel.length >= 10 ? fmtTelefone(tel).replace(/^\(\d\d\) /, '') : tel,
    endereco: rua,
    bairro: up(d.bairro),
    endereco_completo: [rua, up(d.bairro)].filter(Boolean).join(' – '),
    municipio: up(d.municipio), uf: up(d.uf), ibge: dig(d.ibge), cep: fmtCep(d.cep),
    cidade_uf: [up(d.municipio), up(d.uf)].filter(Boolean).join('/'),
    prontuario: up(d.prontuario),
    estab: up(d.estab_nome), cnes: dig(d.estab_cnes),
    unidade: up(d.unidade || d.estab_nome),
    peso: String(d.peso || '').trim() ? String(d.peso).trim().replace('.', ',') + ' kg' : '',
    altura: alt ? alt.replace('.', ',') + (parseFloat(alt.replace(',', '.')) > 3 ? ' cm' : ' m') : '',
    imc
  };
}

// Abreviações usadas só quando o texto não cabe com letra legível
const ABREVIACOES = [[/\bRESIDENCIAL\b/g, 'RES.'], [/\bJARDIM\b/g, 'JD.'], [/\bLOTEAMENTO\b/g, 'LOT.'],
  [/\bCONDOMINIO\b|\bCONDOMÍNIO\b/g, 'COND.'], [/\bAVENIDA\b/g, 'AV.'], [/\bTRAVESSA\b/g, 'TV.'], [/\bPARQUE\b/g, 'PQ.'],
  [/\bSETOR\b/g, 'ST.'], [/\bCONJUNTO\b/g, 'CJ.'], [/\bVILA\b/g, 'VL.']];
const TAM_LEGIVEL = 7;

/** Escreve o texto no lugar, diminuindo a letra (e abreviando, se preciso) até caber na largura máxima. */
function escrever(pagina, fonte, texto, pos, tamPadrao) {
  if (!texto) return;
  const PDFLib = window.PDFLib;
  const cor = PDFLib.rgb(0, 0, 0.45);
  const altura = pagina.getHeight();
  let tam = pos.tam || tamPadrao;
  if (pos.digitos) {
    String(texto).slice(0, pos.digitos).split('').forEach((c, i) => {
      const w = fonte.widthOfTextAtSize(c, tam);
      pagina.drawText(c, { x: pos.x + i * pos.passo - w / 2, y: altura - pos.y, size: tam, font: fonte, color: cor });
    });
    return;
  }
  if (pos.max) {
    if (fonte.widthOfTextAtSize(texto, TAM_LEGIVEL) > pos.max) {
      ABREVIACOES.forEach(([re, curto]) => { texto = texto.replace(re, curto); });
    }
    while (tam > 5.5 && fonte.widthOfTextAtSize(texto, tam) > pos.max) tam -= 0.25;
  }
  pagina.drawText(texto, { x: pos.x, y: altura - pos.y, size: tam, font: fonte, color: cor });
}

/** Troca letras que a fonte padrão do PDF não tem (ex.: travessão de outros teclados). */
function textoSeguro(t, fonte) {
  return String(t || '').split('').map((c) => {
    try { fonte.encodeText(c); return c; } catch (e) { return c === '–' || c === '—' ? '-' : '?'; }
  }).join('');
}

/**
 * Gera um PDF só com os formulários escolhidos, na ordem da lista.
 * pegarModelo(arquivo) → Promise<ArrayBuffer> do PDF em branco.
 */
export async function gerarFormularios(chaves, d, pegarModelo) {
  const PDFLib = window.PDFLib;
  const saida = await PDFLib.PDFDocument.create();
  const fonte = await saida.embedFont(PDFLib.StandardFonts.Helvetica);
  const negrito = await saida.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const v = valoresDoFormulario(d);
  for (const chave of chaves) {
    const f = FORMULARIOS.find((x) => x.chave === chave);
    if (!f) continue;
    const modelo = await PDFLib.PDFDocument.load(await pegarModelo(f.arquivo), { ignoreEncryption: true });
    const paginas = await saida.copyPages(modelo, modelo.getPageIndices());
    paginas.forEach((p) => saida.addPage(p));
    const primeira = paginas[0];
    Object.entries(f.campos).forEach(([campo, pos]) => {
      const valor = v[campo];
      if (pos.marca) {
        if (valor) escrever(primeira, negrito, 'X', Object.assign({ tam: 9.5 }, pos), f.tam);
        return;
      }
      escrever(primeira, fonte, textoSeguro(valor, fonte), pos, f.tam);
    });
  }
  saida.setTitle('Formulários — ' + (v.nome || 'paciente'));
  saida.setCreator('APAC digital');
  return await saida.save();
}

/** Nome do arquivo: FORMULARIOS_NOME_DO_PACIENTE_dd-mm-aaaa.pdf (ou o nome do formulário, se for um só). */
export function nomeArquivoFormularios(chaves, nome, hoje = new Date()) {
  const n = String(nome || 'PACIENTE').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, '').trim().replace(/\s+/g, '_') || 'PACIENTE';
  const f = chaves.length === 1 ? (FORMULARIOS.find((x) => x.chave === chaves[0]) || {}).curto || 'FORMULARIO' : 'FORMULARIOS';
  const data = String(hoje.getDate()).padStart(2, '0') + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + hoje.getFullYear();
  return f + '_' + n + '_' + data + '.pdf';
}
