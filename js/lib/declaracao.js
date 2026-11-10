/**
 * 📝 DECLARAÇÃO DE CIÊNCIA (APAC) — regras puras (sem tela e sem Supabase).
 *
 * Paciente com o nome (ou o nome da mãe) diferente entre os documentos
 * (RG/certidão × CPF/Cartão SUS, ou × cadastro do CELK) assina que sabe
 * que precisa regularizar, e que a declaração vale só para este encaminhamento.
 *
 * Também lê o resultado da Conferência de espelhos e sugere o preenchimento
 * quando "Nome Completo" ou "Nome da Mãe" não conferem.
 */
import { esc, normalizarTexto } from './texto.js';
import { normalizarStatus } from './conferencia.js';

// ------------------------------------------------------------
// Cabeçalho
// ------------------------------------------------------------
const ESTADOS = {
  AC: 'ACRE', AL: 'ALAGOAS', AP: 'AMAPÁ', AM: 'AMAZONAS', BA: 'BAHIA', CE: 'CEARÁ', DF: 'DISTRITO FEDERAL',
  ES: 'ESPÍRITO SANTO', GO: 'GOIÁS', MA: 'MARANHÃO', MT: 'MATO GROSSO', MS: 'MATO GROSSO DO SUL',
  MG: 'MINAS GERAIS', PA: 'PARÁ', PB: 'PARAÍBA', PR: 'PARANÁ', PE: 'PERNAMBUCO', PI: 'PIAUÍ',
  RJ: 'RIO DE JANEIRO', RN: 'RIO GRANDE DO NORTE', RS: 'RIO GRANDE DO SUL', RO: 'RONDÔNIA', RR: 'RORAIMA',
  SC: 'SANTA CATARINA', SP: 'SÃO PAULO', SE: 'SERGIPE', TO: 'TOCANTINS'
};
export const nomeEstado = (uf) => ESTADOS[String(uf || '').toUpperCase()] || '';

/** CNPJ conhecido da prefeitura (o usuário pode trocar; fica salvo no navegador). */
export function cnpjPadrao(municipio, uf) {
  const m = normalizarTexto(municipio);
  if (m === 'NOVA MUTUM' && String(uf || 'MT').toUpperCase() === 'MT') return '24.772.162/0001-06';
  return '';
}

/** Brasão guardado no site para o município (quando a unidade ainda não enviou o seu). */
export function brasaoPadrao(municipio) {
  return normalizarTexto(municipio) === 'NOVA MUTUM' ? 'img/brasoes/nova-mutum.png' : '';
}

// ------------------------------------------------------------
// Datas e CPF
// ------------------------------------------------------------
export function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
export function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return d + '/' + m + '/' + a;
}
export function dataExtenso(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  const sem = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const mes = d.toLocaleDateString('pt-BR', { month: 'long' });
  return sem + ', ' + d.getDate() + ' de ' + mes + ' de ' + d.getFullYear();
}
export function mascaraCPF(v) {
  v = String(v || '').replace(/\D/g, '').slice(0, 11);
  return v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

// ------------------------------------------------------------
// Texto da declaração
// ------------------------------------------------------------
/**
 * Onde está o nome que diverge da certidão/RG:
 *   cpf  → "no CPF" (Receita Federal / Cartão SUS)
 *   celk → "no cadastro do CELK"
 */
export const FONTES_B = {
  cpf: { rotulo: 'CPF / Cartão SUS', texto: 'CPF' },
  celk: { rotulo: 'Cadastro do CELK', texto: 'cadastro do sistema de saúde municipal (CELK)' }
};

const up = (s) => String(s || '').trim().toUpperCase();
const campo = (v, rotulo) => v ? esc(v) : '<span class="falta">[' + esc(rotulo) + ']</span>';

/**
 * d = { unidade, municipio, uf, menor, sexo, nome, rg, cpf, parentesco, paciente, faixa, sexoPac,
 *       tipo ('nome'|'mae'), fonteB ('cpf'|'celk'), nomeCert, nomeB, local ('receita'|'cartorio'),
 *       cartorio, proc, dataEnc, dataDecl, nomeAssin }
 * Devolve { p1, p2, data, assinatura, titulo } — p1/p2/assinatura em HTML.
 */
export function montarDeclaracao(d) {
  const menor = !!d.menor;
  const fem = d.sexo === 'F';
  const tipo = d.tipo === 'mae' ? 'mae' : 'nome';
  const adol = d.faixa === 'adolescente';
  const pacFem = d.sexoPac === 'F';
  const fonteB = FONTES_B[d.fonteB] ? d.fonteB : 'cpf';
  const nome = up(d.nome), rg = up(d.rg), cpf = String(d.cpf || '').trim();
  const paciente = up(d.paciente), parentesco = String(d.parentesco || '').trim().toLowerCase();
  const nB = up(d.nomeB), nCert = up(d.nomeCert), proc = up(d.proc);
  const artPac = adol ? (pacFem ? 'da adolescente' : 'do adolescente') : 'da criança';

  let alvo, alvoCurto, docs;
  const ondeB = FONTES_B[fonteB].texto;
  if (!menor) {
    alvo = tipo === 'mae' ? 'no nome da minha mãe' : 'no meu nome';
    alvoCurto = tipo === 'mae' ? 'do nome da minha mãe' : 'do meu nome';
    docs = 'que no meu RG/certidão de nascimento consta como ' + campo(nCert, 'nome no RG/certidão') +
      ' e no meu ' + ondeB + ' consta como ' + campo(nB, 'nome no ' + FONTES_B[fonteB].rotulo);
  } else {
    alvo = tipo === 'mae' ? 'no nome da mãe ' + artPac : 'no nome ' + artPac;
    alvoCurto = tipo === 'mae' ? 'do nome da mãe ' + artPac : 'do nome ' + artPac;
    docs = 'que na certidão de nascimento consta como ' + campo(nCert, 'nome na certidão') +
      ' e no ' + ondeB + ' consta como ' + campo(nB, 'nome no ' + FONTES_B[fonteB].rotulo);
  }

  const munido = fem ? 'munida' : 'munido';
  const municipio = String(d.municipio || '').trim();
  const local = municipio ? municipio + (d.uf ? ' – ' + up(d.uf) : '') : '';
  let destino;
  if (d.local === 'cartorio') {
    destino = 'ao ' + campo(up(d.cartorio), 'nome do cartório') + ', ' + munido +
      ' de documento oficial com foto' + (menor ? '' : ', CPF') + ' e comprovante de residência' +
      (menor ? ', além da certidão de nascimento e do CPF ' + artPac : '');
  } else {
    destino = 'ao Ponto de Atendimento Virtual da Receita Federal' +
      (local ? ', junto ao Setor de Tributação da Prefeitura de ' + esc(local) : '') + ', ' + munido +
      ' de documento oficial com foto, título de eleitor, certidão de nascimento ou casamento' + (tipo === 'mae' ? ' atualizada' : '') +
      ' e comprovante de residência' + (menor ? ', além da certidão de nascimento ' + artPac : '');
  }

  let p1 = 'EU, ' + campo(nome, 'nome completo') + ', ' + (fem ? 'portadora' : 'portador') +
    ' do RG/CNH nº ' + campo(rg, 'RG') + ' e do CPF nº ' + campo(cpf, 'CPF') + ', ';
  if (menor) p1 += (parentesco ? esc(parentesco) + ' e ' : '') + 'responsável legal de ' + campo(paciente, 'nome do paciente') + ', ';
  p1 += 'declaro estar ciente de que preciso comparecer ' + destino + ', para regularizar a divergência ' + alvo + ', ' + docs + '.';

  const p2 = 'Declaro ainda estar ciente de que esta declaração tem validade apenas para este encaminhamento de APAC – ' +
    campo(proc, 'procedimento') + ', emitido em ' + campo(dataCurta(d.dataEnc), 'data do encaminhamento') +
    ' –, e de que a não regularização ' + alvoCurto + ' impede o prosseguimento de outros encaminhamentos para a lista de espera/agendamento pelo SUS.';

  return {
    p1, p2,
    data: (municipio ? municipio + (d.uf ? ' – ' + up(d.uf) : '') + ', ' : '') + dataExtenso(d.dataDecl) + '.',
    assinatura: d.nomeAssin === false ? '' : esc(nome) + (menor ? '<br>Responsável legal' : ''),
    titulo: 'Declaração de Ciência – ' + ((menor ? paciente || nome : nome) || 'APAC')
  };
}

// ------------------------------------------------------------
// Sugestão a partir da Conferência de espelhos
// ------------------------------------------------------------
const vazio = (v) => v === null || v === undefined || /^\s*(null|—|-)?\s*$/i.test(String(v));
const val = (v) => vazio(v) ? '' : String(v).trim().toUpperCase();
/** Compara nomes ignorando acento, pontuação e espaços. */
const igual = (a, b) => normalizarTexto(a).replace(/[^A-Z0-9]+/g, '') === normalizarTexto(b).replace(/[^A-Z0-9]+/g, '');

function acharCampo(conf, nome) {
  const alvo = normalizarTexto(nome);
  return (conf.campos || []).find((c) => normalizarTexto(c.campo) === alvo) || null;
}

/** "26/03/2025" ou "2025-03-26" → ISO, senão ''. */
function dataParaISO(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}
export function idadeEmAnos(iso, hoje = new Date()) {
  if (!iso) return null;
  const n = new Date(iso + 'T12:00:00');
  if (isNaN(n)) return null;
  let anos = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) anos--;
  return anos;
}

/**
 * Qual divergência de nome existe nesta campo da conferência?
 * Prioridade: certidão/RG × SUS (CPF) → certidão/RG × CELK → SUS × CELK (sem documento).
 */
function divergenciaDoCampo(c) {
  if (!c) return null;
  const doc = val(c.doc_identidade), sus = val(c.sus), celk = val(c.celk);
  const diverge = normalizarStatus(c.status) !== 'ok';
  if (doc && sus && !igual(doc, sus)) return { nomeCert: doc, nomeB: sus, fonteB: 'cpf', local: 'receita' };
  if (doc && celk && !igual(doc, celk)) return { nomeCert: doc, nomeB: celk, fonteB: 'celk', local: 'cartorio' };
  if (!doc && sus && celk && !igual(sus, celk)) return { nomeCert: '', nomeB: sus, fonteB: 'cpf', local: 'receita' };
  if (diverge && (doc || sus)) return { nomeCert: doc, nomeB: sus || celk, fonteB: sus ? 'cpf' : 'celk', local: 'receita' };
  return null;
}

/**
 * Lê uma conferência ({ paciente, campos: [...] }) e devolve o preenchimento
 * sugerido da declaração, ou null se o nome e o nome da mãe conferem.
 */
export function sugestaoDaConferencia(conf, hoje = new Date()) {
  if (!conf || !Array.isArray(conf.campos)) return null;
  const cNome = acharCampo(conf, 'Nome Completo');
  const cMae = acharCampo(conf, 'Nome da Mãe');
  let tipo = 'nome';
  let div = divergenciaDoCampo(cNome);
  if (!div) { div = divergenciaDoCampo(cMae); tipo = 'mae'; }
  if (!div) return null;

  const primeiro = (c, ...chaves) => {
    if (!c) return '';
    for (const k of chaves) if (val(c[k])) return val(c[k]);
    return '';
  };
  const cNasc = acharCampo(conf, 'Data de Nascimento');
  const nascISO = dataParaISO(primeiro(cNasc, 'doc_identidade', 'sus', 'celk'));
  const idade = idadeEmAnos(nascISO, hoje);
  const sexoTxt = primeiro(acharCampo(conf, 'Sexo'), 'doc_identidade', 'sus', 'celk');
  const sexo = /^F/.test(sexoTxt) ? 'F' : (/^M/.test(sexoTxt) ? 'M' : '');
  const cpf = primeiro(acharCampo(conf, 'CPF'), 'doc_identidade', 'sus', 'celk');
  const nomePaciente = val(conf.paciente) || primeiro(cNome, 'doc_identidade', 'sus', 'celk');
  const nomeMae = primeiro(cMae, 'doc_identidade', 'sus', 'celk');
  const menor = idade !== null && idade < 18;

  const s = {
    tipo, ...div, menor,
    observacao: (tipo === 'mae' ? cMae : cNome).observacao || '',
    origem: nomePaciente
  };
  if (menor) {
    Object.assign(s, {
      paciente: nomePaciente, faixa: idade < 12 ? 'crianca' : 'adolescente', sexoPac: sexo || 'F',
      // quem assina costuma ser a mãe; o administrativo confere e troca se for outra pessoa
      nome: nomeMae, parentesco: nomeMae ? 'mãe' : '', sexo: 'F', cpf: '', rg: ''
    });
  } else {
    Object.assign(s, { nome: nomePaciente, cpf: cpf ? mascaraCPF(cpf) : '', sexo: sexo || 'M', rg: '' });
  }
  return s;
}

// ------------------------------------------------------------
// Passa a sugestão da Conferência para a tela da Declaração
// ------------------------------------------------------------
let preenchimentoPendente = null;
export function guardarPreenchimento(s) { preenchimentoPendente = s; }
export function pegarPreenchimento() { const s = preenchimentoPendente; preenchimentoPendente = null; return s; }
