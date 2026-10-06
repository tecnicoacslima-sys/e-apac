/**
 * CONFERÊNCIA DE CARTÃO SUS (CNS) E CPF — cópia fiel do Validacao.gs.
 * Confere o dígito verificador sem gastar nada de IA.
 * (A mesma regra existe no banco: motivo_cns_invalido / cpf_valido.)
 */

/** Só os números de um texto (ex.: "700.6069 8540-2967" → "700606985402967"). */
export function soDigitos(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '');
}

/**
 * Explica por que um CNS é inválido. Devolve '' quando está CERTO.
 * Regra oficial: 15 dígitos; começa com 1 ou 2 (definitivo) ou 7, 8 ou 9
 * (provisório); a soma de cada dígito × pesos 15, 14 … 1 é divisível por 11.
 */
export function motivoCNSInvalido(cns) {
  const s = soDigitos(cns);
  if (!s) return 'está em branco';
  if (s.length !== 15) return 'tem ' + s.length + ' dígitos (o Cartão SUS tem 15)';
  if (!/^[12789]/.test(s)) return 'começa com ' + s.charAt(0) + ' (deve começar com 1, 2, 7, 8 ou 9)';

  let soma = 0;
  for (let i = 0; i < 15; i++) soma += parseInt(s.charAt(i), 10) * (15 - i);
  if (soma % 11 !== 0) return 'o dígito verificador não confere (provavelmente um número trocado)';
  return '';
}

export function validarCNS(cns) {
  return motivoCNSInvalido(cns) === '';
}

/** true se o CPF está certo (11 dígitos e os dois dígitos verificadores conferem). */
export function validarCPF(cpf) {
  const s = soDigitos(cpf);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false;   // 000.000.000-00, 111.111.111-11...

  for (let dv = 9; dv < 11; dv++) {
    let soma = 0;
    for (let i = 0; i < dv; i++) soma += parseInt(s.charAt(i), 10) * ((dv + 1) - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(s.charAt(dv), 10)) return false;
  }
  return true;
}

/** Motivo pelo qual o documento do profissional está errado (CNS ou CPF). '' = certo. */
export function motivoDocProfissional(tipo, numero) {
  const dig = soDigitos(numero);
  if (String(tipo || '').toUpperCase() === 'CPF') {
    return validarCPF(dig) ? '' : 'o CPF ' + dig + ' tem dígito errado';
  }
  const motivo = motivoCNSInvalido(dig);
  return motivo ? 'o Cartão SUS ' + dig + ' ' + motivo : '';
}
