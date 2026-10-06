/**
 * ② BUSCAR DADOS DA APAC — regras do Code_SIGTAP.gs, sem mudar a lógica.
 *   referencia: [{ procedimento, codigo, cids: [], confianca }]  (tabela referencia_sigtap)
 *   oficial:    Map(codigo → { nome, habilitacoes }) ou null     (tabela sigtap_atual)
 */
import { codigoSigtap10, nomeParaComparar, normalizarTexto } from './texto.js';

export const PROMPT_LAUDO =
  'Você é especialista em laudos APAC do SUS. Extraia exatamente os campos abaixo do PDF recebido.\n' +
  'Responda SOMENTE com JSON válido, sem texto antes ou depois, sem markdown:\n' +
  '{\n' +
  '  "paciente": "nome ou null",\n' +
  '  "procedimento": "nome exato do procedimento principal como consta no laudo",\n' +
  '  "codigo_no_laudo": "código de 10 dígitos ou null se ausente/ilegível",\n' +
  '  "cid": "código CID-10 principal ou null",\n' +
  '  "descricao_diagnostico": "texto do campo Descrição do Diagnóstico ou null",\n' +
  '  "estabelecimento_solicitante": "nome do estabelecimento solicitante ou null",\n' +
  '  "observacoes": "texto completo do campo Observações ou null",\n' +
  '  "data_solicitacao": "data no campo Data da Solicitação no formato DD/MM/AAAA ou null",\n' +
  '  "medico_solicitante": "nome completo do profissional solicitante ou null"\n' +
  '}';

/**
 * Procura o procedimento do laudo na Referência.
 *   1. nome igual (ignorando acento, pontuação e espaços)
 *   2. nome contido no outro, por PALAVRAS INTEIRAS. Entre vários, fica o que
 *      aparece MAIS CEDO no nome do laudo; empatando, o mais completo; empatando
 *      de novo, o ✅ Confirmado.
 */
export function buscarProcedimento(nomeLaudo, tabela) {
  const alvo = nomeParaComparar(nomeLaudo);
  if (alvo.trim() === '') return { match: null, tipo: 'nenhuma' };

  const match = tabela.find((t) => nomeParaComparar(t.procedimento) === alvo);
  if (match) return { match, tipo: 'exata' };

  let melhor = null, melhorNota = null;
  tabela.forEach((t) => {
    const ref = nomeParaComparar(t.procedimento);
    if (ref.trim() === '') return;

    let posicao;
    if (alvo.indexOf(ref) !== -1)      posicao = alvo.indexOf(ref);
    else if (ref.indexOf(alvo) !== -1) posicao = 0;
    else return;

    const nota = [posicao, -Math.min(ref.length, alvo.length), /CONFIRMADO/i.test(t.confianca || '') ? 0 : 1];
    if (!melhorNota || nota[0] < melhorNota[0] ||
        (nota[0] === melhorNota[0] && (nota[1] < melhorNota[1] ||
        (nota[1] === melhorNota[1] && nota[2] < melhorNota[2])))) {
      melhor = t; melhorNota = nota;
    }
  });
  if (melhor) return { match: melhor, tipo: 'parcial' };
  return { match: null, tipo: 'nenhuma' };
}

/** Compara o que a IA leu com a Referência e com a tabela oficial. */
export function compararComReferencia(extraido, tabela, tabelaOfic, competencia) {
  const busca       = buscarProcedimento(extraido.procedimento, tabela);
  const codigoLaudo = extraido.codigo_no_laudo ? codigoSigtap10(extraido.codigo_no_laudo) : null;

  let codigoLaudoExisteOfic    = false;
  let nomeOficialDoCodigoLaudo = null;

  if (codigoLaudo && tabelaOfic) {
    const reg = tabelaOfic.get(codigoLaudo);
    if (reg) { codigoLaudoExisteOfic = true; nomeOficialDoCodigoLaudo = reg.nome; }
  }

  let status, mensagem, codigoSugerido = null, cidStatus = null, avisoCodigoInvalido = null;

  if (codigoLaudo && tabelaOfic && !codigoLaudoExisteOfic)
    avisoCodigoInvalido = '⚠️ O código ' + codigoLaudo +
      ' não existe na Tabela SIGTAP (competência ' + competencia + '). Pode ser erro de digitação.';

  if (!busca.match) {
    status = 'nao_catalogado';
    if (codigoLaudo && codigoLaudoExisteOfic)
      mensagem = 'Procedimento não está na tabela local, mas o código ' + codigoLaudo +
                 ' existe no SIGTAP oficial como: "' + nomeOficialDoCodigoLaudo +
                 '". Considere adicionar à Referência SIGTAP após confirmar.';
    else if (codigoLaudo && tabelaOfic)
      mensagem = 'Procedimento não está na tabela local e o código ' + codigoLaudo +
                 ' não foi encontrado no SIGTAP oficial. Verifique em sigtap.datasus.gov.br.';
    else
      mensagem = 'Procedimento não encontrado na tabela de referência local. Consulte o SIGTAP oficial.';

  } else {
    codigoSugerido  = busca.match.codigo;
    const confLabel = busca.match.confianca || '';
    const prefConf  = confLabel.includes('REVISAR')
      ? '🔴 Este registro está marcado para revisão na tabela local. ' : '';
    const nomeRef   = busca.tipo === 'parcial'
      ? ' (parecido com "' + busca.match.procedimento + '" da tabela local)' : '';

    if (!codigoLaudo) {
      status   = 'codigo_ausente';
      mensagem = prefConf + 'O laudo não trouxe o código. Com base em "' +
        extraido.procedimento + '"' + nomeRef + ', o código sugerido é ' +
        codigoSugerido + '. ' +
        (tabelaOfic && tabelaOfic.has(codigoSugerido) ? 'Confirmado no SIGTAP oficial. ' : '') +
        'Confirme antes de lançar.';

    } else if (codigoLaudo === codigoSugerido) {
      status   = 'ok';
      mensagem = prefConf + 'Código confere. "' + extraido.procedimento + '" = ' + codigoLaudo +
        ', consistente com a referência local' +
        (codigoLaudoExisteOfic ? ' e com a Tabela SIGTAP oficial.' : '.');
      if (avisoCodigoInvalido) mensagem += ' ' + avisoCodigoInvalido;

    } else {
      status   = 'divergente';
      mensagem = prefConf + 'Código do laudo (' + codigoLaudo +
        ') diverge do código de referência (' + codigoSugerido + ') para "' +
        extraido.procedimento + '"' + nomeRef + '. ';
      if (tabelaOfic) {
        const regLaudo = tabelaOfic.get(codigoLaudo);
        const regRef   = tabelaOfic.get(codigoSugerido);
        mensagem += regLaudo
          ? 'O código do laudo corresponde a "' + regLaudo.nome + '" no SIGTAP. '
          : 'O código do laudo NÃO existe no SIGTAP oficial. ';
        if (regRef) mensagem += 'O código de referência corresponde a "' + regRef.nome + '". ';
      }
      mensagem += 'Verifique manualmente antes de lançar.';
    }

    if (extraido.cid && busca.match.cids && busca.match.cids.length > 0) {
      const cidNorm  = normalizarTexto(extraido.cid).replace(/\./g, '');
      const cidsRefN = busca.match.cids.map((c) => normalizarTexto(c).replace(/\./g, ''));
      cidStatus = cidsRefN.some((c) => c === cidNorm || cidNorm.startsWith(c) || c.startsWith(cidNorm))
        ? 'cid_conhecido' : 'cid_novo';
    }
  }

  return {
    paciente:                    extraido.paciente,
    procedimento_laudo:          extraido.procedimento,
    nome_oficial_sigtap:         nomeOficialDoCodigoLaudo,
    codigo_laudo:                codigoLaudo,
    codigo_referencia:           codigoSugerido,
    cid_laudo:                   extraido.cid,
    descricao_diagnostico:       extraido.descricao_diagnostico || null,
    observacoes:                 extraido.observacoes           || null,
    data_solicitacao:            extraido.data_solicitacao      || null,
    medico_solicitante:          extraido.medico_solicitante    || null,
    estabelecimento_solicitante: extraido.estabelecimento_solicitante || null,
    cid_status:                  cidStatus,
    status:                      status,
    mensagem:                    mensagem,
    tipo_correspondencia:        busca.tipo,
    confianca_referencia:        busca.match ? busca.match.confianca : null
  };
}

/**
 * O que vai para o bloco "Confirme os dados" (mesma escolha do DialogoSigtap.html):
 * código de referência quando confere/ausente; senão, o do laudo.
 */
export function sugestaoParaFormulario(r) {
  const codigo = (r.status === 'ok' || r.status === 'codigo_ausente')
    ? (r.codigo_referencia || r.codigo_laudo || '')
    : (r.codigo_laudo || '');
  return {
    codigo,
    nomeProcedimento: r.nome_oficial_sigtap || r.procedimento_laudo || '',
    cid: r.cid_laudo || '',
    descricaoDiagnostico: r.descricao_diagnostico || r.procedimento_laudo || '',
    observacoes: r.observacoes || '',
    dataSolicitacao: r.data_solicitacao || '',
    medicoSolicitante: r.medico_solicitante || '',
    estabelecimentoSolicitante: r.estabelecimento_solicitante || ''
  };
}
