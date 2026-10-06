/**
 * ① ESPELHO CELK — interpretação do texto do PDF.
 * interpretarTextoEspelho é cópia fiel do interpretarTextoEspelho_ do
 * Código.gs (as mesmas regras que já funcionavam com o OCR do Drive).
 * Agora o texto vem do próprio PDF (pdf-texto.js), e, se faltar nome
 * ou Cartão SUS, a IA lê o PDF (ver PROMPT_ESPELHO).
 */
import { validarCNS, validarCPF, motivoCNSInvalido } from './validacao.js';

/**
 * Layouts já tratados:
 *   • rótulo antigo "N°:" e rótulo novo "N." (CELK v3.1.34x)
 *   • CNS antes ou depois da palavra "CNS"
 *   • telefone com ou sem hífen · CEP com ou sem pontos e traço
 */
export function interpretarTextoEspelho(bodyText) {
  const textoCorrido = bodyText.replace(/[\r\n]+/g, ' ');

  let prontuario = '';
  const matchPront = bodyText.match(/C[oó]digo:\s*(\d+)/i)
                  || bodyText.match(/(\d+)\s+Paciente:/i);
  if (matchPront) prontuario = matchPront[1];

  let nome = '';
  const matchNome = bodyText.match(/Paciente:\s*([^\n\r]+)/i);
  if (matchNome) {
    nome = matchNome[1].trim();
    nome = nome.split(/Situaç[aã]o:/i)[0].split(/Dados Pessoais/i)[0].trim().toUpperCase();
  }

  let sexo = '';
  const matchSexo = bodyText.match(/Sexo:\s*(Masculino|Feminino)/i);
  if (matchSexo) {
    const s = matchSexo[1].trim();
    sexo = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  let nascimento = '';
  const matchData = bodyText.match(/Data de Nasc\.:?\s*(\d{2}\/\d{2}\/\d{4})/i)
                 || bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (matchData) nascimento = matchData[1];

  let mae = '';
  const matchMae = bodyText.match(/Nome da M[ãa]e:\s*([^\n\r]+)/i);
  if (matchMae) mae = matchMae[1].trim().toUpperCase();

  let telefone = '';
  const matchTel = bodyText.match(/Telefone:\s*(\(\d{2}\)\s*\d{4,5}-?\d{4})/i);
  if (matchTel) telefone = matchTel[1].trim();

  let cep = '';
  const matchCep = bodyText.match(/CEP:\s*(\d{2}\.?\d{3}\s*-?\s*\d{3})/i)
                || bodyText.match(/CEP:\s*(\d+[-]?\d*)/i);
  if (matchCep) cep = matchCep[1].replace(/\D/g, '').substring(0, 8);

  // NÚMERO DO ENDEREÇO — o CELK passou a usar "N." em vez de "N°:".
  // Como "N." também aparece no bloco do CNS, remove primeiro o trecho
  // do CNS e só então procura "N." no que sobrou.
  let numCasa = '';
  let matchNum = bodyText.match(/N[°º]:\s*(\d+)\s+(?:Bairro|CEP|UF)/i)
              || bodyText.match(/Bairro:.*?N[°º]:\s*(\d+)/is)
              || bodyText.match(/N[°º]:\s*(\d+)/i);
  if (!matchNum) {
    const textoSemCns = bodyText.replace(/N[°º.]\s*(?:\d[.\s]?){15}\s*D?/i, '');
    matchNum = textoSemCns.match(/N\.\s*(\d{1,6})\b/);
  }
  if (matchNum) numCasa = matchNum[1].trim();

  let complemento = '';
  const matchComp = bodyText.match(/Complemento:\s*([^\n\r]+)/i);
  if (matchComp) {
    complemento = matchComp[1].split(/Bairro:/i)[0].split(/Cidade:/i)[0].split(/N[°º]:/i)[0].trim();
  }

  let cpf = '';
  const matchCpf = bodyText.match(/CPF\s+N[uú]mero:\s*([\d.-]+)/i)
                || bodyText.match(/N[uú]mero:\s*(\d{3}\.\d{3}\.\d{3}-\d{2})/i);
  if (matchCpf) cpf = matchCpf[1].trim();

  // CNS — todos os "N." + número com exatamente 15 dígitos; fica com o
  // primeiro que passa no dígito verificador (ou o primeiro, se nenhum passar).
  let cns = '';
  const candidatos = [];
  const reCns = /N[°º.]\s*((?:\d[.\s]?){15})/g;
  let m;
  while ((m = reCns.exec(textoCorrido)) !== null) {
    const dig = m[1].replace(/[^\d]/g, '');
    if (dig.length === 15) candidatos.push(dig);
  }
  if (candidatos.length) {
    cns = candidatos.filter(validarCNS)[0] || candidatos[0];
  }
  if (!cns) {
    const matchCnsAntigo = textoCorrido.match(/CNS\s+N[°º°o]?\s*([\d.]+)/i)
                        || textoCorrido.match(/CNS.*?N[°º°o\.]\s*([\d.]+)/i)
                        || textoCorrido.match(/N[°º]\s*(7\d[\d.]{10,})/i);
    if (matchCnsAntigo) cns = matchCnsAntigo[1].replace(/[^\d]/g, '').trim();
  }

  return {
    cns, nome, nascimento, sexo, mae,
    telefone, cep, numCasa, complemento,
    cpf, prontuario
  };
}

export function nomeValido(nome) {
  return !!nome && nome.indexOf('CÓDIGO') === -1;
}

/** Campos importantes que não vieram, ou vieram com erro (alarme de mudança de layout). */
export function camposFaltantes(d) {
  const falta = [];
  if (!d.cns) {
    falta.push('Cartão SUS (CNS)');
  } else if (!validarCNS(d.cns)) {
    falta.push('Cartão SUS válido (o número lido, ' + d.cns + ', ' + motivoCNSInvalido(d.cns) + ')');
  }
  if (d.cpf && !validarCPF(d.cpf)) {
    falta.push('CPF válido (o número lido, ' + d.cpf + ', tem dígito errado)');
  }
  if (!d.nascimento) falta.push('Data de nascimento');
  if (!d.sexo)       falta.push('Sexo');
  if (!d.mae)        falta.push('Nome da mãe');
  if (!d.telefone)   falta.push('Telefone');
  if (!d.cep)        falta.push('CEP');
  if (!d.numCasa)    falta.push('Nº do endereço');
  return falta;
}

/** O texto tirado do PDF deu para ler? (senão, chama a IA) */
export function leituraSuficiente(d) {
  return nomeValido(d.nome) && !!d.cns;
}

/** Pedido à IA quando o PDF é imagem (escaneado) ou o texto não deu. */
export const PROMPT_ESPELHO =
  'Você lê o "Espelho" de cadastro de paciente do sistema CELK Saúde (SUS). ' +
  'Responda SOMENTE com JSON válido, sem texto antes ou depois, sem markdown:\n' +
  '{\n' +
  '  "cns": "Cartão Nacional de Saúde, 15 dígitos, só números, ou \\"\\"",\n' +
  '  "nome": "nome completo do paciente em MAIÚSCULAS",\n' +
  '  "nascimento": "DD/MM/AAAA ou \\"\\"",\n' +
  '  "sexo": "Masculino | Feminino | \\"\\"",\n' +
  '  "mae": "nome da mãe em MAIÚSCULAS ou \\"\\"",\n' +
  '  "telefone": "(DD) número, ou \\"\\"",\n' +
  '  "cep": "8 dígitos ou \\"\\"",\n' +
  '  "numCasa": "número do endereço ou \\"\\"",\n' +
  '  "complemento": "complemento do endereço ou \\"\\"",\n' +
  '  "cpf": "CPF com pontos e traço, ou \\"\\"",\n' +
  '  "prontuario": "código/prontuário do paciente no CELK ou \\"\\""\n' +
  '}\n' +
  'NUNCA invente dados. Atenção a 0/O, 1/I, 5/S, 8/B nos números.';

/** Junta o que a IA devolveu no mesmo formato de interpretarTextoEspelho. */
export function normalizarEspelhoIA(j) {
  const t = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const sexo = t(j.sexo);
  return {
    cns: t(j.cns).replace(/\D/g, ''),
    nome: t(j.nome).toUpperCase(),
    nascimento: t(j.nascimento),
    sexo: /^m/i.test(sexo) ? 'Masculino' : (/^f/i.test(sexo) ? 'Feminino' : ''),
    mae: t(j.mae).toUpperCase(),
    telefone: t(j.telefone),
    cep: t(j.cep).replace(/\D/g, '').substring(0, 8),
    numCasa: t(j.numCasa),
    complemento: t(j.complemento),
    cpf: t(j.cpf),
    prontuario: t(j.prontuario)
  };
}
