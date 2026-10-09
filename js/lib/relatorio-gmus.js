/**
 * 📋 RELATÓRIO G-MUS → FORMULÁRIO APAC (só 4 campos)
 *
 * Lê a tela "Detalhes do Registro" do G-MUS (impressa em PDF ou foto) e
 * devolve somente:
 *   • Data de Entrada                 → APAC: Data da solicitação   (esf_data)
 *   • Motivo / Observações Gerais     → APAC: Observações           (observacoes)
 *   • Unidade Solicitante             → APAC externa: Estabelecimento solicitante (ext_estabelecimento)
 *   • Profissional Solicitante        → APAC externa: Profissional solicitante    (ext_profissional)
 * + o nome do paciente, só para conferir se o relatório é do paciente carregado.
 *
 * Não mexe em procedimento, código, CID nem nos dados do paciente.
 */

export const PROMPT_GMUS =
  'Você recebe a impressão (PDF ou foto) da tela "Detalhes do Registro" do sistema de regulação G-MUS.\n' +
  'Extraia SOMENTE os campos abaixo e responda APENAS com um JSON, sem texto antes ou depois:\n' +
  '{"paciente":"","data_entrada":"dd/mm/aaaa","observacoes":"","unidade_solicitante":"","profissional_solicitante":""}\n\n' +
  'Regras:\n' +
  '- paciente: o NOME COMPLETO em "Identificação do Usuário".\n' +
  '- data_entrada: a "DATA DE ENTRADA" da seção "Informações da Solicitação técnica", só a data (dd/mm/aaaa). ' +
  'NÃO use "Data do parecer", "Data atendimento/baixa" nem data de nascimento.\n' +
  '- observacoes: o texto COMPLETO do quadro "MOTIVO / OBSERVAÇÕES GERAIS", transcrito fielmente, numa linha só. ' +
  'Não resuma, não corrija a escrita, não acrescente nada.\n' +
  '- unidade_solicitante: o valor de "UNIDADE SOLICITANTE", sem o número entre parênteses do final.\n' +
  '- profissional_solicitante: o valor de "PROFISSIONAL SOLICITANTE", sem o apelido entre parênteses do final.\n' +
  '- Se um campo não existir ou estiver ilegível, deixe "". Nunca invente.';

/** Tira "(14)" ou "(DOMINGOS)" do fim e espaços sobrando; maiúsculas. */
export function semParentesesFinal(t) {
  return String(t || '').replace(/\s+/g, ' ').trim().replace(/(\s*\([^()]*\))+\s*$/, '').trim().toUpperCase();
}

/** "8/11/2023", "08-11-2023" ou "2023-11-08" → "08/11/2023"; inválida → "" */
export function normalizarData(t) {
  const s = String(t || '').trim();
  let d, m, a;
  let x = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (x) { d = +x[1]; m = +x[2]; a = +x[3]; if (a < 100) a += 2000; }
  else if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +x[1]; m = +x[2]; d = +x[3]; }
  else return '';
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + a;
}

/** Resposta da IA (objeto) → os 4 campos limpos + paciente */
export function interpretarRelatorioGmus(j) {
  const o = j || {};
  return {
    paciente: String(o.paciente || '').replace(/\s+/g, ' ').trim().toUpperCase(),
    dataSolicitacao: normalizarData(o.data_entrada),
    observacoes: String(o.observacoes || '').replace(/\s+/g, ' ').trim().toUpperCase(),
    estabelecimentoSolicitante: semParentesesFinal(o.unidade_solicitante),
    medicoSolicitante: semParentesesFinal(o.profissional_solicitante)
  };
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** O relatório é do mesmo paciente do formulário? (tolera acento e nome do meio a mais/a menos) */
export function mesmoPaciente(a, b) {
  const x = semAcento(a), y = semAcento(b);
  if (!x || !y) return true;               // sem como comparar: não bloqueia
  if (x === y) return true;
  const px = x.split(' '), py = y.split(' ');
  if (px[0] !== py[0] || px[px.length - 1] !== py[py.length - 1]) return false;
  const comuns = px.filter((p) => py.includes(p)).length;
  return comuns >= Math.min(px.length, py.length) - 1;
}

/** Aplica só os 4 campos no formulário (não mexe em mais nada). */
export function aplicarRelatorioGmus(form, r) {
  if (r.dataSolicitacao) form.esf_data = r.dataSolicitacao;
  if (r.observacoes) form.observacoes = r.observacoes;
  if (r.estabelecimentoSolicitante) form.ext_estabelecimento = r.estabelecimentoSolicitante;
  if (r.medicoSolicitante) form.ext_profissional = r.medicoSolicitante;
  return form;
}

/** Campos do "procedimento fixo" que podem ser lembrados entre um relatório e outro */
export const CAMPOS_FIXOS = ['proc_codigo', 'proc_nome', 'proc_qtd', 'cid_principal', 'diag_descricao'];
