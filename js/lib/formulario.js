/**
 * O FORMULÁRIO DA APAC (antes: aba DADOS).
 * SECOES é a mesma estrutura do Layout_DADOS.gs: cada campo tem a
 * mesma "chave" (cns_paciente, proc_codigo…), a posição na grade de
 * 12 colunas (u = coluna inicial, s = quantas ocupa) e o tipo:
 *   busca → 🔎 digite e tecle Enter   ·   auto → ⚙ preenchido sozinho   ·   texto → livre
 */
import { codigoSigtap10, hojeBR, isoParaBR, limparNomeArquivo } from './texto.js';
import { motivoCNSInvalido, motivoDocProfissional, soDigitos } from './validacao.js';

export const SECOES = [
  {
    titulo: '🏥 Estabelecimento solicitante',
    linhas: [[
      { chave: 'cnes_solicitante',  rotulo: 'CNES',                    u: 1, s: 3, tipo: 'busca', num: true, max: 7 },
      { chave: 'estab_solicitante', rotulo: 'Nome do estabelecimento', u: 4, s: 9, tipo: 'auto' }
    ]]
  },
  {
    titulo: '👤 Paciente',
    linhas: [
      [
        { chave: 'cns_paciente',    rotulo: 'Cartão SUS (CNS)',   u: 1,  s: 3, tipo: 'busca', num: true, max: 15 },
        { chave: 'data_nascimento', rotulo: 'Data de nascimento', u: 4,  s: 2, tipo: 'auto', data: true },
        { chave: 'sexo',            rotulo: 'Sexo',               u: 6,  s: 2, tipo: 'auto', lista: ['', 'MASCULINO', 'FEMININO'] },
        { chave: 'prontuario',      rotulo: 'Nº prontuário',      u: 8,  s: 2, tipo: 'auto' },
        { chave: 'ddd',             rotulo: 'DDD',                u: 10, s: 1, tipo: 'auto', num: true, max: 2 },
        { chave: 'telefone',        rotulo: 'Telefone',           u: 11, s: 2, tipo: 'auto', num: true, max: 9 }
      ],
      [{ chave: 'nome_paciente', rotulo: 'Nome do paciente', u: 1, s: 12, tipo: 'auto', maiusc: true }],
      [{ chave: 'nome_mae', rotulo: 'Nome da mãe ou responsável', u: 1, s: 12, tipo: 'auto', maiusc: true }]
    ]
  },
  {
    titulo: '📍 Endereço',
    linhas: [
      [
        { chave: 'cep',         rotulo: 'CEP',         u: 1,  s: 2, tipo: 'busca', num: true, max: 8 },
        { chave: 'logradouro',  rotulo: 'Logradouro',  u: 3,  s: 7, tipo: 'auto', maiusc: true },
        { chave: 'numero',      rotulo: 'Número',      u: 10, s: 1, tipo: 'auto' },
        { chave: 'complemento', rotulo: 'Complemento', u: 11, s: 2, tipo: 'auto', maiusc: true }
      ],
      [
        { chave: 'bairro',    rotulo: 'Bairro',                  u: 1,  s: 4, tipo: 'auto', maiusc: true },
        { chave: 'municipio', rotulo: 'Município de residência', u: 5,  s: 5, tipo: 'auto', maiusc: true },
        { chave: 'cod_ibge',  rotulo: 'Cód. IBGE',               u: 10, s: 2, tipo: 'auto', num: true, max: 7 },
        { chave: 'uf',        rotulo: 'UF',                      u: 12, s: 1, tipo: 'auto', maiusc: true, max: 2 }
      ]
    ]
  },
  {
    titulo: '🩺 Procedimento principal',
    linhas: [[
      { chave: 'proc_codigo', rotulo: 'Código SIGTAP',        u: 1,  s: 3, tipo: 'texto', num: true, max: 10 },
      { chave: 'proc_nome',   rotulo: 'Nome do procedimento', u: 4,  s: 8, tipo: 'texto', maiusc: true },
      { chave: 'proc_qtd',    rotulo: 'Qtd.',                 u: 12, s: 1, tipo: 'texto', num: true, max: 3 }
    ]]
  },
  {
    titulo: '➕ Procedimentos secundários · opcional',
    tabela: {
      linhas: 5,
      prefixo: 'sec',
      colunas: [
        { sufixo: 'codigo', rotulo: 'Código SIGTAP',        u: 1,  s: 3, num: true, max: 10 },
        { sufixo: 'nome',   rotulo: 'Nome do procedimento', u: 4,  s: 8, maiusc: true },
        { sufixo: 'qtd',    rotulo: 'Qtd.',                 u: 12, s: 1, num: true, max: 3 }
      ]
    }
  },
  {
    titulo: '📝 Justificativa',
    linhas: [
      [
        { chave: 'diag_descricao', rotulo: 'Descrição do diagnóstico', u: 1,  s: 6, tipo: 'texto', maiusc: true },
        { chave: 'cid_principal',  rotulo: 'CID-10 principal',         u: 7,  s: 2, tipo: 'texto', maiusc: true, max: 6 },
        { chave: 'cid_secundario', rotulo: 'CID-10 secundário',        u: 9,  s: 2, tipo: 'texto', maiusc: true, max: 6 },
        { chave: 'cid_causas',     rotulo: 'CID-10 causas assoc.',     u: 11, s: 2, tipo: 'texto', maiusc: true, max: 6 }
      ],
      [{ chave: 'observacoes', rotulo: 'Observações', u: 1, s: 12, tipo: 'texto', maiusc: true, area: true }]
    ]
  },
  {
    titulo: '✍️ Solicitação na ESF',
    linhas: [[
      { chave: 'esf_profissional', rotulo: 'Profissional solicitante (digite o Nº ou o nome)', u: 1, s: 6, tipo: 'busca', maiusc: true },
      { chave: 'esf_data',         rotulo: 'Data da solicitação', u: 7,  s: 2, tipo: 'texto', data: true },
      { chave: 'esf_doc_tipo',     rotulo: 'Doc.',                u: 9,  s: 1, tipo: 'texto', lista: ['CNS', 'CPF'] },
      { chave: 'esf_doc_numero',   rotulo: 'Nº do documento',     u: 10, s: 3, tipo: 'auto', num: true, max: 15 }
    ]]
  },
  {
    titulo: '🏨 Solicitação da APAC externa',
    linhas: [[
      { chave: 'ext_profissional',    rotulo: 'Profissional solicitante',    u: 1, s: 6, tipo: 'texto', maiusc: true },
      { chave: 'ext_estabelecimento', rotulo: 'Estabelecimento solicitante', u: 7, s: 6, tipo: 'texto', maiusc: true }
    ]]
  },
  {
    titulo: '✅ Autorização · quando houver',
    linhas: [[
      { chave: 'aut_profissional', rotulo: 'Profissional autorizador', u: 1,  s: 6, tipo: 'texto', maiusc: true },
      { chave: 'aut_orgao',        rotulo: 'Cód. órgão emissor',       u: 7,  s: 2, tipo: 'texto' },
      { chave: 'aut_doc_tipo',     rotulo: 'Doc.',                     u: 9,  s: 1, tipo: 'texto', lista: ['', 'CNS', 'CPF'] },
      { chave: 'aut_doc_numero',   rotulo: 'Nº do documento',          u: 10, s: 3, tipo: 'texto', num: true, max: 15 }
    ]]
  }
];

/** Lista plana de todos os campos (com as linhas da tabela de secundários expandidas). */
export function todosCampos() {
  const lista = [];
  SECOES.forEach((sec) => {
    if (sec.tabela) {
      for (let n = 1; n <= sec.tabela.linhas; n++) {
        sec.tabela.colunas.forEach((c) => lista.push({ ...c, chave: sec.tabela.prefixo + n + '_' + c.sufixo, tipo: 'texto' }));
      }
    } else {
      sec.linhas.forEach((linha) => linha.forEach((c) => lista.push(c)));
    }
  });
  return lista;
}

export const CHAVES = todosCampos().map((c) => c.chave).concat(['data_recebimento']);

/** Formulário em branco (⑤ Limpar): tipo de documento = CNS, recebido hoje. */
export function formularioVazio() {
  const d = {};
  CHAVES.forEach((k) => { d[k] = ''; });
  d.esf_doc_tipo = 'CNS';
  d.data_recebimento = hojeBR();
  return d;
}

// Textos que parecem preenchidos, mas na prática são "vazio"
const PLACEHOLDERS_VAZIOS = ['SELECIONE', 'DIGITE O NOME AQUI'];

export function textoPreenchido(dados, campo) {
  const v = String(dados[campo] === null || dados[campo] === undefined ? '' : dados[campo]).trim();
  if (!v) return '';
  return PLACEHOLDERS_VAZIOS.indexOf(v.toUpperCase()) !== -1 ? '' : v;
}

/**
 * Campos que não podem ir em branco (ou errados) na APAC.
 * Mesma lista do camposObrigatoriosFaltando_ do Código.gs.
 */
export function camposObrigatoriosFaltando(dados) {
  const falta = [];
  const tp = (c) => textoPreenchido(dados, c);
  const temNumero = (v) => /[1-9]/.test(soDigitos(v));
  const qtdOk = (c) => parseInt(tp(c), 10) > 0;

  if (!tp('estab_solicitante')) falta.push('Equipe (nome do estabelecimento)');
  if (!temNumero(tp('cnes_solicitante'))) falta.push('CNES');

  const cnsPac = soDigitos(tp('cns_paciente'));
  if (!cnsPac) {
    falta.push('Cartão SUS do paciente');
  } else {
    const motivoPac = motivoCNSInvalido(cnsPac);
    if (motivoPac) falta.push('Cartão SUS do paciente com erro (' + motivoPac + ')');
  }

  if (!tp('proc_codigo')) falta.push('Procedimento: código SIGTAP');
  if (!tp('proc_nome'))   falta.push('Procedimento: nome');
  if (!qtdOk('proc_qtd')) falta.push('Quantidade do procedimento');

  if (!tp('cid_principal')) falta.push('CID-10 principal');
  if (!tp('esf_profissional')) falta.push('Médico (profissional solicitante)');

  const docTipo   = tp('esf_doc_tipo').toUpperCase();
  const docNumero = soDigitos(tp('esf_doc_numero'));
  if (!temNumero(docNumero)) {
    falta.push(docTipo === 'CPF' ? 'CPF do médico' : 'Cartão SUS do médico');
  } else {
    const motivoMed = motivoDocProfissional(docTipo, docNumero);
    if (motivoMed) falta.push('Documento do médico com erro (' + motivoMed + ')');
  }

  for (let i = 1; i <= 5; i++) {
    const temProc = tp('sec' + i + '_codigo') || tp('sec' + i + '_nome');
    if (temProc && !qtdOk('sec' + i + '_qtd')) falta.push('Quantidade do procedimento secundário ' + i);
  }
  return falta;
}

/**
 * "Impressão digital" do formulário: todos os campos (menos a data de
 * recebimento). Basta UM campo diferente (ex.: OD-01/03 → OD-02/03)
 * para mudar. Usada para avisar "este mesmo formulário já foi salvo".
 */
export async function assinaturaFormulario(dados) {
  const partes = CHAVES
    .filter((k) => k !== 'data_recebimento')
    .map((k) => k + '=' + String(dados[k] === null || dados[k] === undefined ? '' : dados[k])
      .replace(/\s+/g, ' ').trim().toUpperCase());
  partes.sort();
  const bytes = new TextEncoder().encode(partes.join('|'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let bin = '';
  new Uint8Array(digest).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/**
 * Carrega um paciente (linha da tabela pacientes) no formulário.
 * Mesmo que preencherPaciente_: separa DDD do telefone e devolve o CEP
 * para quem chamou buscar o endereço.
 */
export function aplicarPaciente(dados, p) {
  dados.cns_paciente    = soDigitos(p.cns);
  dados.nome_paciente   = String(p.nome || '').toUpperCase().trim();
  dados.prontuario      = p.prontuario || '';
  dados.data_nascimento = p.nascimento ? isoParaBR(p.nascimento) : '';
  const sexo = String(p.sexo || '').trim().toUpperCase();
  dados.sexo = (sexo === 'MASCULINO' || sexo === 'FEMININO') ? sexo : '';
  dados.nome_mae = String(p.nome_mae || '').toUpperCase();

  const tel = soDigitos(p.telefone);
  if (tel.length >= 10) {
    dados.ddd = tel.substring(0, 2);
    dados.telefone = tel.substring(2);
  } else {
    dados.ddd = '';
    dados.telefone = tel;
  }

  const cep = soDigitos(p.cep);
  dados.cep = cep ? cep.padStart(8, '0') : '';
  dados.numero = p.numero || '';
  dados.complemento = String(p.complemento || '').toUpperCase();
  return dados.cep;
}

/** ② "Preencher formulário" — mesmo que preencherGeradora do Code_SIGTAP.gs */
export function aplicarSugestao(dados, s) {
  if (s.codigo) dados.proc_codigo = codigoSigtap10(s.codigo);
  if (s.nomeProcedimento) dados.proc_nome = s.nomeProcedimento.toUpperCase();
  // Quantidade padrão 1, só se ainda estiver em branco
  if ((s.codigo || s.nomeProcedimento) && !String(dados.proc_qtd || '').trim()) dados.proc_qtd = '1';
  if (s.cid) dados.cid_principal = s.cid.toUpperCase();
  if (s.descricaoDiagnostico) dados.diag_descricao = s.descricaoDiagnostico.toUpperCase();
  if (s.observacoes) dados.observacoes = s.observacoes.toUpperCase();
  if (s.dataSolicitacao) dados.esf_data = s.dataSolicitacao;
  if (s.medicoSolicitante) dados.ext_profissional = s.medicoSolicitante.toUpperCase();
  if (s.estabelecimentoSolicitante && s.estabelecimentoSolicitante.trim() !== '')
    dados.ext_estabelecimento = s.estabelecimentoSolicitante.toUpperCase();
  return dados;
}

/** NOME_DO_PACIENTE_PROCEDIMENTO_31-10-2025 (mesmo padrão de antes) */
export function nomeArquivoApac(dados) {
  const nome = String(dados.nome_paciente || '').toUpperCase();
  const esp  = String(dados.proc_nome || '').toUpperCase();
  const data = String(dados.esf_data || '').replace(/\//g, '-');
  return limparNomeArquivo((nome + '_' + esp + '_' + data).replace(/\s+/g, '_')).replace(/_+/g, '_').substring(0, 150) || 'APAC';
}
