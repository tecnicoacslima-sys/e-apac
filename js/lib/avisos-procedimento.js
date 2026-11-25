/**
 * Avisos por código SIGTAP: regras dos fluxos da Secretaria de Nova Mutum
 * que evitam APAC devolvida. Usado pela tela APAC (ao escolher o código e
 * antes de gerar o PDF). Para pôr mais um aviso, acrescente uma linha em AVISOS.
 *   tipo 'bloqueio' → pergunta antes de gerar a APAC
 *   tipo 'lembrete' → só avisa
 */
const AVISOS = {
  '0204030188': {
    tipo: 'bloqueio',
    titulo: '⚠️ Mamografia de rastreamento não vai por APAC',
    html: '<b>02.04.03.018-8 – Mamografia bilateral para rastreamento</b> é pedida em formulário específico + ficha SISCAN ' +
      '(médico ou enfermeiro) e entregue no Setor de Controle, Avaliação e Auditoria. É agendada pela Carreta do Amor ' +
      '(prioridade: mulheres de 50 a 69 anos, a cada 2 anos).<br><br>' +
      'Só a <b>02.04.03.003-0 – Mamografia</b> (diagnóstica: alto risco, mama alterada ao exame, estadiamento, ' +
      'acompanhamento de câncer operado) vai por APAC.'
  },
  '0204030030': {
    tipo: 'lembrete',
    titulo: 'Mamografia diagnóstica',
    html: 'Vai por APAC (pedido do médico) + formulário específico + ficha SISCAN. ' +
      'Precisa de história clínica, exame físico, hipótese diagnóstica e CID-10.'
  }
};

/** Devolve { tipo, titulo, html } para o código (10 dígitos, com ou sem pontos) ou null. */
export function avisoDoProcedimento(codigo) {
  const c = String(codigo || '').replace(/\D/g, '');
  return AVISOS[c] || null;
}

/** Texto sem HTML (para o aviso rápido). */
export function textoDoAviso(aviso) {
  return String(aviso.html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
