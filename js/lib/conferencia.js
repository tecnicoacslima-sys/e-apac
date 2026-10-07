/**
 * CONFERÊNCIA DE ESPELHOS — regras puras (sem tela e sem Supabase),
 * portadas do Conferencia.gs. Dá para testar no Node.
 *
 * Compara, campo a campo, o espelho SUS/CADSUS, a ficha CELK, o documento
 * de identidade e o comprovante de endereço do MESMO paciente.
 */
import { partesData, limparNomeArquivo } from './texto.js';

export const CONF = {
  MAX_TOKENS: 2500,
  LIMITE_MB: 22,          // a IA aceita ~32 MB por pedido; o base64 aumenta ~33%
  MAX_ARQUIVOS_FONTE: 3   // ex.: RG frente + verso
};

export const CONF_CAMPOS = [
  'Nome Completo', 'Data de Nascimento', 'CNS', 'CPF', 'Nome da Mãe', 'Nome do Pai',
  'Sexo', 'Raça/Cor', 'CEP', 'Bairro', 'Logradouro', 'Número', 'Telefone',
  'Município de Nascimento', 'País de Origem'
];

export const CONF_FONTES = [
  { chave: 'sus',                  label: 'SUS / CADSUS',            curto: 'SUS / CADSUS',    obrigatoria: false },
  { chave: 'celk',                 label: 'CELK',                    curto: 'CELK',            obrigatoria: false },
  { chave: 'doc_identidade',       label: 'Documento de Identidade', curto: 'Doc. Identidade', obrigatoria: false },
  { chave: 'comprovante_endereco', label: 'Comprovante de Endereço', curto: 'Comp. Endereço',  obrigatoria: false }
];

export const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Tipo do arquivo pelo nome quando o navegador não informa. */
export function tipoDoArquivo(arquivo) {
  const t = String(arquivo && arquivo.type || '').toLowerCase();
  if (t) return t === 'image/jpg' ? 'image/jpeg' : t;
  const n = String(arquivo && arquivo.name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  return '';
}

/**
 * Confere a escolha antes de mandar para a IA.
 * selecao = { sus: [File…], celk: [File…], … } → '' se está tudo certo, ou o motivo.
 */
export function validarSelecao(selecao) {
  const presentes = CONF_FONTES.filter((f) => (selecao[f.chave] || []).length);
  if (presentes.length < 2) return 'Escolha os arquivos de pelo menos 2 documentos para comparar.';

  const vistos = new Map();
  let total = 0;
  for (const f of presentes) {
    const lista = selecao[f.chave];
    if (lista.length > CONF.MAX_ARQUIVOS_FONTE) {
      return 'Em "' + f.label + '" cabem no máximo ' + CONF.MAX_ARQUIVOS_FONTE + ' arquivos.';
    }
    for (const a of lista) {
      if (TIPOS_ACEITOS.indexOf(tipoDoArquivo(a)) === -1) {
        return '"' + a.name + '" não é PDF nem foto (JPG/PNG).';
      }
      const chave = a.name + '|' + a.size;
      if (vistos.has(chave) && vistos.get(chave) !== f.chave) {
        return 'O arquivo "' + a.name + '" foi escolhido em mais de um documento.';
      }
      vistos.set(chave, f.chave);
      total += a.size || 0;
    }
  }
  if (total > CONF.LIMITE_MB * 1024 * 1024) {
    return 'Os arquivos somam ' + (total / 1048576).toFixed(1).replace('.', ',') + ' MB; o limite é ' +
      CONF.LIMITE_MB + ' MB. Use PDFs menores (ex.: reduza a resolução das fotos).';
  }
  return '';
}

/** O system prompt da IA (montarPromptConferencia_). unidade = { nome, municipio, uf } */
export function montarPromptConferencia(fontesPresentes, unidade = {}) {
  const local = unidade.municipio ? unidade.municipio + (unidade.uf ? '-' + unidade.uf : '') : '';
  const listaFontes = fontesPresentes.map((f) => f.label).join(', ');
  const camposTexto = CONF_CAMPOS.map((c, i) => (i + 1) + '. ' + c).join(', ');

  return 'Você é um especialista em conferência de cadastros de pacientes do SUS, trabalhando para uma unidade de saúde no Brasil (' +
    (unidade.nome || 'unidade de saúde') + (local ? ', ' + local : '') + ').\n\n' +
    'Você receberá entre 2 e 4 documentos (PDF ou foto) referentes ao MESMO paciente, podendo ser: espelho do SUS/CADSUS, ficha do sistema CELK, documento de identidade (RG, CNH ou CNH Digital) e comprovante de endereço. Nem todos os documentos estarão necessariamente presentes. Um mesmo documento pode vir em mais de um arquivo (ex.: frente e verso do RG).\n\n' +
    'Documentos fornecidos nesta análise: ' + listaFontes + '.\n\n' +
    'Extraia e compare estes campos entre TODOS os documentos fornecidos: ' + camposTexto + '.\n\n' +
    'Regras:\n' +
    '- Compare cada documento contra os demais por campo. Nem todo campo existe em todo documento (ex: CNS só em SUS/CELK).\n' +
    '- Ignore diferenças triviais de formatação (pontos, traços, maiúsculas, espaços).\n' +
    '- Campo ausente em um documento = valor null para essa fonte, NÃO é divergência, é "não verificável".\n' +
    '- Atenção especial quando dois documentos concordam mas um terceiro diverge - reportar com destaque.\n' +
    '- No comprovante de endereço, o titular pode ser outra pessoa (familiar): compare só os campos de endereço (CEP, Bairro, Logradouro, Número) e diga na observação se o titular é outra pessoa.\n' +
    '- Espelho SUS/CADSUS — NÃO são erros (marque "ok" se o resto confere):\n' +
    '  • Números com barra depois do nome do logradouro (ex.: "RUA DOS FLAMBOYANTS 1/99998", "AV BRASIL 2/1998"): é a faixa de numeração do CEP que o CADSUS traz sozinho (lado ímpar/par da rua). Ignore essa faixa e compare só o nome do logradouro e o CEP.\n' +
    '  • Bairro abreviado ou cortado no espelho impresso (ex.: "RESIDENCIAL DAS", "RESID DAS PALMEIRAS", "RES DAS PALMEIRAS", "JD PRIMAVERA"): é limite de espaço do layout do espelho. Se o começo bate com o bairro dos outros documentos, é "ok".\n' +
    '  • Nesses dois casos não escreva observação e não cite o assunto no resumo.\n' +
    '- Observação: APENAS quando status for "divergente" ou "atencao". Máximo 1 frase curta e direta (até ~20 palavras), indicando só quais fontes divergem e a ação sugerida. NÃO escreva observação para campos "ok".\n\n' +
    'Responda SOMENTE com JSON válido, sem texto antes ou depois, sem markdown:\n' +
    '{\n' +
    '  "paciente": "nome completo ou null",\n' +
    '  "cns": "CNS ou null",\n' +
    '  "campos": [\n' +
    '    {\n' +
    '      "campo": "nome do campo",\n' +
    '      "sus": "valor ou null",\n' +
    '      "celk": "valor ou null",\n' +
    '      "doc_identidade": "valor ou null",\n' +
    '      "comprovante_endereco": "valor ou null",\n' +
    '      "status": "ok | divergente | atencao",\n' +
    '      "observacao": "frase curta ou null (null se status=ok)"\n' +
    '    }\n' +
    '  ],\n' +
    '  "resumo": "resumo geral em até 2 frases curtas das divergências mais importantes"\n' +
    '}\n\n' +
    'Status: "ok" = todos os documentos com o campo concordam. "divergente" = pelo menos dois documentos com o campo têm valores claramente diferentes. "atencao" = campo ausente em parte dos documentos, ou diferença pequena (abreviação, grafia) que merece checagem.';
}

/**
 * Monta o "content" do pedido à IA.
 * partes = [{ chave, label, tipo: 'application/pdf'|'image/jpeg'…, base64, ordem, total }]
 */
export function montarConteudoIA(partes) {
  const conteudo = [];
  partes.forEach((p) => {
    const titulo = p.total > 1 ? p.label + ' (arquivo ' + p.ordem + ' de ' + p.total + ')' : p.label;
    if (p.tipo === 'application/pdf') {
      conteudo.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 }, title: titulo });
    } else {
      conteudo.push({ type: 'text', text: 'A imagem a seguir é: ' + titulo + '.' });
      conteudo.push({ type: 'image', source: { type: 'base64', media_type: p.tipo, data: p.base64 } });
    }
  });
  conteudo.push({ type: 'text', text: 'Compare os campos dos documentos fornecidos conforme instruído no system prompt.' });
  return conteudo;
}

/** "null", "", "—" viram null; o resto vira texto limpo. */
function valor(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\s+/g, ' ').trim();
  if (!t || /^(null|nulo|n\/a|-|—|não consta|nao consta)$/i.test(t)) return null;
  return t;
}

export function normalizarStatus(s) {
  const t = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t === 'ok' || /conforme/.test(t)) return 'ok';
  if (/diverg/.test(t)) return 'divergente';
  return 'atencao';
}

/** Deixa a resposta da IA num formato confiável. Lança erro se não veio a lista de campos. */
export function normalizarResultado(obj, fontesPresentes) {
  if (!obj || !Array.isArray(obj.campos) || !obj.campos.length) {
    throw new Error('A IA não devolveu a lista de campos. Tente de novo.');
  }
  const presentes = new Set((fontesPresentes || CONF_FONTES).map((f) => f.chave));
  const campos = obj.campos.map((c) => {
    const item = { campo: valor(c && c.campo) || '—' };
    CONF_FONTES.forEach((f) => { item[f.chave] = presentes.has(f.chave) ? valor(c[f.chave]) : null; });
    item.status = normalizarStatus(c.status);
    item.observacao = item.status === 'ok' ? null : valor(c.observacao);
    return item;
  });
  const ajustados = ajustarRegrasSus(campos);
  let resumo = valor(obj.resumo) || '';
  if (ajustados && campos.every((c) => c.status === 'ok')) resumo = 'Todos os campos conferem entre os documentos.';
  return {
    paciente: (valor(obj.paciente) || '').toUpperCase(),
    cns: String(valor(obj.cns) || '').replace(/\D/g, ''),
    campos,
    resumo
  };
}

// ------------------------------------------------------------
// REGRAS DO ESPELHO SUS (rede de segurança, caso a IA ainda marque)
// ------------------------------------------------------------
/** Maiúsculas, sem acento, sem pontuação, espaços simples */
function simplificar(t) {
  return String(t || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** "RUA DOS FLAMBOYANTS 1/99998" → "RUA DOS FLAMBOYANTS" (faixa de numeração do CEP no CADSUS) */
export function tirarFaixaCep(logradouro) {
  return String(logradouro || '').replace(/[\s,-]*\d+\s*\/\s*\d+\s*$/, '').trim();
}

/** "JD" abrevia "JARDIM": mesma 1ª letra e as letras aparecem na ordem (RES, RESID, PQ, VL…) */
function abreviaPalavra(curta, longa) {
  if (!curta || !longa || curta[0] !== longa[0]) return false;
  if (longa.startsWith(curta)) return true;
  if (/\d/.test(curta) || /\d/.test(longa)) return false;
  let j = 0;
  for (const ch of longa) { if (ch === curta[j]) j++; if (j === curta.length) return true; }
  return false;
}

/**
 * O texto do SUS é o dos outros documentos abreviado e/ou cortado no fim?
 * "RESIDENCIAL DAS" / "RESID DAS PALMEIRAS" / "RES DAS PALMEIRAS" ≈ "RESIDENCIAL DAS PALMEIRAS"
 */
export function abreviadoOuCortado(sus, outro) {
  const a = simplificar(sus).split(' ').filter(Boolean);
  const b = simplificar(outro).split(' ').filter(Boolean);
  if (!a.length || a.length > b.length) return false;
  return a.every((p, i) => p === b[i] || abreviaPalavra(p, b[i]));
}

/** Os outros documentos (fora o SUS) concordam entre si? Devolve o valor, ou null. */
function valorDosOutros(c) {
  const outros = CONF_FONTES.filter((f) => f.chave !== 'sus').map((f) => c[f.chave]).filter(Boolean);
  if (!outros.length) return null;
  const base = simplificar(outros[0]);
  return outros.every((v) => simplificar(v) === base) ? outros[0] : null;
}

/**
 * Faixa do CEP no logradouro e bairro abreviado/cortado no espelho SUS não são erros.
 * Muda o campo para "ok" quando só sobra essa diferença. Devolve true se mudou algo.
 */
export function ajustarRegrasSus(campos) {
  const achar = (nome) => campos.find((c) => simplificar(c.campo) === nome);
  const cep = achar('CEP');
  const cepOk = !cep || cep.status === 'ok';
  let mudou = false;
  const conformar = (c) => { c.status = 'ok'; c.observacao = null; mudou = true; };

  const log = achar('LOGRADOURO');
  if (log && log.status !== 'ok' && log.sus && cepOk) {
    const outros = valorDosOutros(log);
    const susLimpo = tirarFaixaCep(log.sus);
    if (outros && (simplificar(susLimpo) === simplificar(outros) || abreviadoOuCortado(susLimpo, outros))) conformar(log);
  }

  const bairro = achar('BAIRRO');
  if (bairro && bairro.status !== 'ok' && bairro.sus) {
    const outros = valorDosOutros(bairro);
    if (outros && abreviadoOuCortado(bairro.sus, outros)) conformar(bairro);
  }
  return mudou;
}

export function contarStatus(campos) {
  const n = { ok: 0, divergente: 0, atencao: 0, total: (campos || []).length };
  (campos || []).forEach((c) => { n[normalizarStatus(c.status)]++; });
  return n;
}

export const ROTULO_STATUS = { ok: '✅ Conforme', divergente: '❌ Divergente', atencao: '⚠️ Atenção' };
export const TEXTO_STATUS = { ok: 'Conforme', divergente: 'Divergente', atencao: 'Atenção' };

/** Fontes que aparecem numa conferência já gravada (para as antigas, importadas). */
export function fontesDaConferencia(conf) {
  const marcadas = Array.isArray(conf.fontes) && conf.fontes.length ? conf.fontes
    : CONF_FONTES.filter((f) => (conf.campos || []).some((c) => c[f.chave])).map((f) => f.chave);
  return CONF_FONTES.filter((f) => marcadas.indexOf(f.chave) !== -1);
}

/** relatorios/<unidade>/2026/10/2026-10-07_NOME_DO_PACIENTE.pdf (com _HHMM se pedir) */
export function caminhoRelatorio(unidadeId, paciente, data = new Date(), comHora = false) {
  const p = partesData(data);
  const nome = limparNomeArquivo(String(paciente || '').toUpperCase()).replace(/_+/g, '_').substring(0, 50) || 'PACIENTE';
  return unidadeId + '/' + p.ano + '/' + p.mes + '/' + p.ano + '-' + p.mes + '-' + p.dia + '_' + nome +
    (comHora ? '_' + p.hora + p.min + p.seg : '') + '.pdf';
}
