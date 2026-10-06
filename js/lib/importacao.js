/**
 * IMPORTAÇÃO DAS PLANILHAS ANTIGAS — transforma as linhas das abas
 * (já lidas pelo SheetJS como listas) nas linhas das tabelas novas.
 * Funções "puras": não falam com o banco (dá para testar no Node).
 */
import { brParaISO, codigoSigtap10 } from './texto.js';
import { soDigitos } from './validacao.js';

// ---------------- CÉLULAS ----------------

/** Número de série do Excel/Sheets → Date com o "relógio da parede" em UTC */
export function serialParaData(n) {
  return new Date(Math.round((Number(n) - 25569) * 86400000));
}

/** Texto da célula (números grandes sem notação científica, sem ".0") */
export function texto(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, ' ').trim();
}

const dois = (n) => String(n).padStart(2, '0');

/** Célula de data → "aaaa-mm-dd" ou null */
export function celulaData(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = serialParaData(v);
    return d.getUTCFullYear() + '-' + dois(d.getUTCMonth() + 1) + '-' + dois(d.getUTCDate());
  }
  if (v instanceof Date) return v.getFullYear() + '-' + dois(v.getMonth() + 1) + '-' + dois(v.getDate());
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const br = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  return br ? brParaISO(br[1]) : null;
}

/** Célula de data e hora (horário de Cuiabá) → ISO com -04:00, ou null */
export function celulaDataHora(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = serialParaData(v);
    return d.getUTCFullYear() + '-' + dois(d.getUTCMonth() + 1) + '-' + dois(d.getUTCDate()) + 'T' +
      dois(d.getUTCHours()) + ':' + dois(d.getUTCMinutes()) + ':' + dois(d.getUTCSeconds()) + '-04:00';
  }
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return m[3] + '-' + dois(m[2]) + '-' + dois(m[1]) + 'T' + dois(m[4] || 12) + ':' + (m[5] || '00') + ':' + (m[6] || '00') + '-04:00';
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] || '12') + ':' + (m[5] || '00') + ':' + (m[6] || '00') + '-04:00';
  return null;
}

/** "2026-09" a partir de texto ou de data */
export function celulaMes(v) {
  if (typeof v === 'number') {
    const d = serialParaData(v);
    return d.getUTCFullYear() + '-' + dois(d.getUTCMonth() + 1);
  }
  const s = texto(v);
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? m[1] + '-' + m[2] : '';
}

const linhasComDados = (linhas) => linhas.slice(1).filter((l) => l.some((c) => texto(c) !== ''));

// ---------------- GERADORA ----------------

/** Aba PACIENTES (CNS · Nome · Nasc · Sexo · Mãe · Telefone · CEP · Nº · Compl · CPF · Prontuário) */
export function converterPacientes(linhas) {
  return linhasComDados(linhas).map((l) => {
    const sexo = texto(l[3]).toUpperCase();
    return {
      cns: soDigitos(texto(l[0])),
      nome: texto(l[1]).toUpperCase(),
      nascimento: celulaData(l[2]),
      sexo: sexo.startsWith('M') ? 'Masculino' : (sexo.startsWith('F') ? 'Feminino' : ''),
      nome_mae: texto(l[4]).toUpperCase(),
      telefone: soDigitos(texto(l[5])),
      cep: soDigitos(texto(l[6])),
      numero: texto(l[7]),
      complemento: texto(l[8]),
      cpf: soDigitos(texto(l[9])),
      prontuario: texto(l[10])
    };
  }).filter((p) => p.nome && p.nome.indexOf('CÓDIGO') === -1);
}

/** Aba MEDICO_SUS (MÉDICO · SUS · Nº). Nº que falta ou repete ganha o próximo livre. */
export function converterProfissionais(linhas, existentes = []) {
  const nomes = new Set(existentes.map((p) => p.nome.toUpperCase().trim()));
  const numeros = new Set(existentes.map((p) => p.numero));
  let proximo = Math.max(0, ...existentes.map((p) => p.numero || 0));
  const lista = [];
  linhasComDados(linhas).forEach((l) => {
    const nome = texto(l[0]).toUpperCase();
    if (!nome || nome === 'SELECIONE' || nomes.has(nome)) return;
    let num = parseInt(texto(l[2]), 10);
    if (!num || numeros.has(num)) num = 0;
    lista.push({ nome, documento: soDigitos(texto(l[1])), numero: num });
    nomes.add(nome);
    if (num) { numeros.add(num); proximo = Math.max(proximo, num); }
  });
  lista.forEach((p) => { if (!p.numero) { proximo++; p.numero = proximo; numeros.add(proximo); } });
  return lista;
}

/** Aba CNES_UBS (CNES · nome) */
export function converterEstabelecimentos(linhas, existentes = []) {
  const vistos = new Set(existentes.map((e) => e.cnes));
  const lista = [];
  linhasComDados(linhas).forEach((l) => {
    const cnes = soDigitos(texto(l[0])).padStart(7, '0');
    const nome = texto(l[1]).toUpperCase();
    if (!/^\d{7}$/.test(cnes) || /^0+$/.test(cnes) || !nome || nome === 'SELECIONE' || vistos.has(cnes)) return;
    vistos.add(cnes);
    lista.push({ cnes, nome });
  });
  return lista;
}

/** Aba Referencia_SIGTAP (Procedimento · Código · CIDs · Confiança · Nome oficial · Observação) */
export function converterReferencia(linhas, existentes = []) {
  const chave = (p, c) => p.toUpperCase().trim() + '|' + c;
  const vistos = new Set(existentes.map((r) => chave(r.procedimento, r.codigo)));
  const lista = [];
  linhasComDados(linhas).forEach((l) => {
    const procedimento = texto(l[0]);
    const codigo = codigoSigtap10(texto(l[1]));
    if (!procedimento || !/^\d{10}$/.test(codigo) || vistos.has(chave(procedimento, codigo))) return;
    vistos.add(chave(procedimento, codigo));
    lista.push({
      procedimento, codigo,
      cids: texto(l[2]).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
      confianca: texto(l[3]), nome_oficial: texto(l[4]), observacao: texto(l[5])
    });
  });
  return lista;
}

/** Aba CHECK_LIST (NOME · SEXO · PROCEDIMENTO · CID · CÓDIGO · MÉDICO · SOLIC · RECEB · PÁGINA · OBS) */
export function converterChecklist(linhas, existentes = []) {
  const chave = (n, p, c, s) => [n, p, c, s || ''].map((x) => String(x || '').toUpperCase().trim()).join('|');
  const vistos = new Set(existentes.map((r) => chave(r.nome_paciente, r.procedimento, r.codigo, r.data_solicitacao)));
  const lista = [];
  linhasComDados(linhas).forEach((l) => {
    const r = {
      nome_paciente: texto(l[0]).toUpperCase(),
      sexo: ['M', 'F'].includes(texto(l[1]).toUpperCase()) ? texto(l[1]).toUpperCase() : '',
      procedimento: texto(l[2]),
      cid: texto(l[3]).toUpperCase(),
      codigo: codigoSigtap10(texto(l[4]).replace(/^'/, '')),
      medico_solicitante: texto(l[5]).toUpperCase(),
      data_solicitacao: celulaData(l[6]),
      data_recebimento: celulaData(l[7]),
      pagina: texto(l[8]),
      obs: texto(l[9])
    };
    if (!r.nome_paciente) return;
    const k = chave(r.nome_paciente, r.procedimento, r.codigo, r.data_solicitacao);
    if (vistos.has(k)) return;
    vistos.add(k);
    // sem a data/hora do salvamento original: usa o dia do recebimento (meio-dia), para os filtros por período
    // (toda linha precisa ter criado_em: num envio em lote, coluna faltando vira vazio)
    const dia = r.data_recebimento || r.data_solicitacao;
    r.criado_em = dia ? dia + 'T12:00:00-04:00' : new Date().toISOString();
    lista.push(r);
  });
  return lista;
}

/** Aba CONFERENCIAS (uma linha por campo) → uma conferência por (data/hora, paciente, CNS) */
export function converterConferencias(linhas) {
  const status = (s) => /conforme/i.test(s) ? 'ok' : (/divergente/i.test(s) ? 'divergente' : 'atencao');
  const grupos = new Map();
  linhasComDados(linhas).forEach((l) => {
    const k = texto(l[0]) + '|' + texto(l[1]) + '|' + texto(l[2]);
    if (!grupos.has(k)) {
      grupos.set(k, { criado_em: celulaDataHora(l[0]), paciente: texto(l[1]), cns: soDigitos(texto(l[2])), campos: [], link: texto(l[10]) });
    }
    grupos.get(k).campos.push({
      campo: texto(l[3]), sus: texto(l[4]) || null, celk: texto(l[5]) || null,
      doc_identidade: texto(l[6]) || null, comprovante_endereco: texto(l[7]) || null,
      status: status(texto(l[8])), observacao: texto(l[9]) || null
    });
  });
  return [...grupos.values()].map((g) => {
    const fontes = ['sus', 'celk', 'doc_identidade', 'comprovante_endereco'].filter((f) => g.campos.some((c) => c[f]));
    const r = { paciente: g.paciente, cns: g.cns, campos: g.campos, fontes,
                resumo: g.link ? 'Importada da planilha. Relatório antigo (Google Drive): ' + g.link : 'Importada da planilha.' };
    r.criado_em = g.criado_em || new Date().toISOString();
    return r;
  });
}

/** Aba SIGTAP_AAAAMM (CO_PROCEDIMENTO · NO_PROCEDIMENTO · HABILITACOES · COMPETENCIA) */
export function converterSigtap(linhas, nomeAba) {
  const compAba = (String(nomeAba).match(/(\d{6})$/) || [])[1] || '';
  const vistos = new Set();
  const lista = [];
  linhasComDados(linhas).forEach((l) => {
    const codigo = codigoSigtap10(texto(l[0]));
    const nome = texto(l[1]);
    const competencia = /^\d{6}$/.test(texto(l[3])) ? texto(l[3]) : compAba;
    if (!/^\d{10}$/.test(codigo) || !nome || !/^\d{6}$/.test(competencia) || vistos.has(codigo)) return;
    vistos.add(codigo);
    lista.push({ competencia, codigo, nome, habilitacoes: texto(l[2]) });
  });
  return lista;
}

/** Aba USO_IA da Geradora (Data/Hora · Função · Modelo · Entrada · Saída) */
export function converterUsoGeradora(linhas, unidade) {
  return linhasComDados(linhas).map((l) => {
    const criado = celulaDataHora(l[0]);
    return {
      criado_em: criado, mes: criado ? criado.substring(0, 7) : '',
      unidade_id: unidade.id, unidade_nome: unidade.nome, origem: 'planilha',
      funcao: texto(l[1]) || 'GERAL', modelo: texto(l[2]),
      tokens_entrada: parseInt(texto(l[3]), 10) || 0, tokens_saida: parseInt(texto(l[4]), 10) || 0,
      status: 'OK', detalhe: 'importado da aba USO_IA'
    };
  }).filter((u) => u.criado_em);
}

// ---------------- PAINEL_CONSUMO_IA ----------------

/** Aba CLIENTES (Unidade · Hash · Ativo · Limite · Mês · Tokens · Criado em · Obs.) */
export function converterClientes(linhas) {
  return linhasComDados(linhas).map((l) => ({
    nome: texto(l[0]),
    codigo_hash: /^[0-9a-f]{64}$/i.test(texto(l[1])) ? texto(l[1]).toLowerCase() : null,
    ativo: l[2] === true || /^(sim|true|1|verdadeiro)$/i.test(texto(l[2])),
    limite_mensal_tokens: parseInt(soDigitos(texto(l[3])), 10) || null,
    observacoes: texto(l[7])
  })).filter((c) => c.nome);
}

/** Aba USO do painel (Data/Hora · Unidade · Função · Modelo · Entrada · Saída · Status · Mês · Detalhe) */
export function converterUsoPainel(linhas, unidadesPorNome) {
  return linhasComDados(linhas).map((l) => {
    const criado = celulaDataHora(l[0]);
    const nome = texto(l[1]);
    const u = unidadesPorNome.get(nome.toUpperCase());
    return {
      criado_em: criado,
      mes: celulaMes(l[7]) || (criado ? criado.substring(0, 7) : ''),
      unidade_id: u ? u.id : null, unidade_nome: nome, origem: 'planilha',
      funcao: texto(l[2]) || 'GERAL', modelo: texto(l[3]),
      tokens_entrada: parseInt(texto(l[4]), 10) || 0, tokens_saida: parseInt(texto(l[5]), 10) || 0,
      status: texto(l[6]) || 'OK', detalhe: texto(l[8]).substring(0, 200)
    };
  }).filter((u) => u.criado_em && u.mes);
}

/** Chave para não importar a mesma chamada duas vezes */
export function chaveUso(u) {
  const t = new Date(u.criado_em).getTime();
  return [Math.round(t / 1000), String(u.unidade_nome || '').toUpperCase(), u.funcao, u.tokens_entrada, u.tokens_saida].join('|');
}

/** Aba PRECOS (B2 entrada · B3 saída · B4 margem · B5 câmbio) */
export function converterPrecos(linhas) {
  const n = (x) => typeof x === 'number' ? x : (Number(String(x || '').replace(',', '.')) || 0);
  let margem = n((linhas[3] || [])[1]);
  if (margem > 1) margem = margem / 100;
  return {
    preco_entrada: n((linhas[1] || [])[1]),
    preco_saida: n((linhas[2] || [])[1]),
    margem,
    cambio: n((linhas[4] || [])[1])
  };
}
