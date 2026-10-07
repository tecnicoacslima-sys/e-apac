/**
 * TELA APAC — o formulário (antiga aba DADOS) + o painel ① a ⑤.
 * As buscas automáticas que eram do gatilho onEdit acontecem quando
 * você sai do campo ou tecla Enter.
 */
import * as dados from '../dados.js';
import { h, toast, modal, confirmar, alerta, listaHtml, comCarregando, zonaArquivo,
         lerArquivoBuffer, lerArquivoBase64, abrirPdf, atrasar } from '../ui.js';
import { SECOES, CHAVES, formularioVazio, camposObrigatoriosFaltando, assinaturaFormulario,
         aplicarPaciente, aplicarSugestao, nomeArquivoApac } from '../lib/formulario.js';
import { soDigitos, motivoCNSInvalido, motivoDocProfissional } from '../lib/validacao.js';
import { esc, mascararData, brParaISO, partesData, codigoSigtap10 } from '../lib/texto.js';
import { buscarCep } from '../lib/endereco.js';
import { extrairTextoPdf } from '../lib/pdf-texto.js';
import { interpretarTextoEspelho, leituraSuficiente, nomeValido, camposFaltantes,
         PROMPT_ESPELHO, normalizarEspelhoIA } from '../lib/espelho-celk.js';
import { PROMPT_LAUDO, buscarProcedimento, compararComReferencia, sugestaoParaFormulario } from '../lib/sigtap.js';
import { gerarPdfApac } from '../lib/pdf-apac.js';
import { abrirBuscaSigtap } from './sigtap.js';

const LIMITE_PDF_MB = 22;   // a IA aceita ~32 MB por pedido; o base64 aumenta ~33%

let form = {};                 // valores do formulário (chave → texto)
let entradas = {};             // chave → elemento <input>/<select>/<textarea>
let cadastros = { estabelecimentos: [], profissionais: [] };
let referenciaCache = null;
let painelResumo = null;
let salvarDepois = null;

// ============================================================
// MONTAGEM
// ============================================================
export async function montar(area) {
  area.appendChild(h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Abrindo o formulário…'));

  const [rascunho, est, prof] = await Promise.all([
    dados.carregarRascunho().catch(() => null),
    dados.listarEstabelecimentos(),
    dados.listarProfissionais()
  ]);
  cadastros = { estabelecimentos: est, profissionais: prof };
  form = Object.assign(formularioVazio(), rascunho || {});
  form.data_recebimento = formularioVazio().data_recebimento;   // sempre hoje (era =TODAY())
  referenciaCache = null;

  salvarDepois = atrasar(() => {
    dados.salvarRascunho(form).catch((e) => console.warn('Rascunho:', e.message));
  }, 1200);

  area.innerHTML = '';
  area.appendChild(h('div', { class: 'apac-layout' }, montarFormulario(), montarPainel()));
  preencherEntradas();
  atualizarResumo();
}

export function desmontar() {
  // grava o que estiver pendente antes de sair da tela
  if (Object.keys(form).length) dados.salvarRascunho(form).catch(() => {});
}

// ============================================================
// FORMULÁRIO
// ============================================================
function montarFormulario() {
  entradas = {};
  const coluna = h('div', { class: 'apac-form' });
  coluna.appendChild(h('div', { class: 'legenda' },
    h('span', null, '🔎 Busca: digite e tecle Enter'),
    h('span', null, '⚙ Preenchido automaticamente (pode corrigir)'),
    h('span', null, 'Campos brancos: digitação livre'),
    h('span', null, 'Recebido em: ', h('b', null, form.data_recebimento))));

  SECOES.forEach((secao) => {
    const grade = h('div', { class: 'grade' });
    if (secao.tabela) {
      for (let n = 1; n <= secao.tabela.linhas; n++) {
        secao.tabela.colunas.forEach((c) => {
          grade.appendChild(montarCampo({ ...c, chave: secao.tabela.prefixo + n + '_' + c.sufixo, tipo: 'texto',
                                          rotulo: n === 1 ? c.rotulo : '' }, n > 1));
        });
      }
    } else {
      secao.linhas.forEach((linha) => linha.forEach((c) => grade.appendChild(montarCampo(c))));
    }
    coluna.appendChild(h('section', { class: 'card' },
      h('h2', null, secao.titulo),
      h('div', { class: 'card-conteudo' }, grade)));
  });
  return coluna;
}

function montarCampo(c, semRotulo) {
  const icone = c.tipo === 'busca' ? '🔎 ' : (c.tipo === 'auto' ? '⚙ ' : '');
  const id = 'campo-' + c.chave;
  let el;
  if (c.lista) {
    el = h('select', { id }, ...c.lista.map((o) => h('option', { value: o }, o || '—')));
  } else if (c.area) {
    el = h('textarea', { id, rows: 3, class: c.maiusc ? 'maiusc' : '' });
  } else {
    el = h('input', {
      id, type: 'text', autocomplete: 'off', spellcheck: 'false',
      inputmode: c.num || c.data ? 'numeric' : null,
      maxlength: c.data ? 10 : (c.max || null),
      placeholder: c.data ? 'dd/mm/aaaa' : null,
      class: [c.maiusc ? 'maiusc' : '', c.num ? 'num' : ''].join(' ').trim()
    });
    if (c.chave === 'esf_profissional') el.setAttribute('list', 'lista-profissionais');
  }
  el.dataset.chave = c.chave;
  entradas[c.chave] = el;

  el.addEventListener('input', () => {
    if (c.data) el.value = mascararData(el.value);
    else if (c.num) el.value = soDigitos(el.value).substring(0, c.max || 99);
    form[c.chave] = el.value;
    atualizarResumo();
    salvarDepois();
  });
  el.addEventListener('change', () => {
    if (c.maiusc) { el.value = el.value.toUpperCase(); form[c.chave] = el.value; }
    aoMudarCampo(c.chave, el.value);
    salvarDepois();
  });
  // Enter = vai para o próximo campo (como na planilha); nos campos 🔎 dispara a busca
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') {
      e.preventDefault();
      el.blur();
      const todos = Object.values(entradas);
      const prox = todos[todos.indexOf(el) + 1];
      if (prox && document.activeElement !== prox && !document.querySelector('.modal-fundo')) prox.focus();
    }
  });

  const wrap = h('div', {
    class: 'campo ' + (c.tipo || 'texto') + (c.s <= 2 ? ' curto' : ''),
    style: { gridColumn: c.u + ' / span ' + c.s }
  }, semRotulo ? null : h('label', { for: id }, icone + c.rotulo), el);
  if (c.chave === 'esf_profissional') {
    wrap.appendChild(h('datalist', { id: 'lista-profissionais' }));
  }
  return wrap;
}

function preencherEntradas() {
  Object.entries(entradas).forEach(([k, el]) => {
    const v = form[k] === null || form[k] === undefined ? '' : String(form[k]);
    if (el.tagName === 'SELECT' && v && ![...el.options].some((o) => o.value === v)) {
      el.appendChild(h('option', { value: v }, v));
    }
    el.value = v;
  });
  atualizarListaProfissionais();
}

function atualizarListaProfissionais() {
  const dl = document.getElementById('lista-profissionais');
  if (!dl) return;
  dl.innerHTML = '';
  cadastros.profissionais.forEach((p) => dl.appendChild(h('option', { value: p.nome }, 'Nº ' + p.numero)));
}

function gravar(chave, valor) {
  form[chave] = valor === null || valor === undefined ? '' : String(valor);
  if (entradas[chave]) entradas[chave].value = form[chave];
}

function focar(chave) {
  const el = entradas[chave];
  if (el) setTimeout(() => { el.focus(); if (el.select) el.select(); }, 60);
}

/** Antigo onEditAPAC: o que acontece ao mudar cada campo de busca. */
function aoMudarCampo(chave, valor) {
  const v = String(valor || '').trim();
  if (chave === 'cnes_solicitante') aoEditarCnes(v);
  else if (chave === 'esf_profissional') aoEditarProfissional(v);
  else if (chave === 'esf_doc_numero') aoEditarDocProfissional(v);
  else if (chave === 'cns_paciente') aoEditarCnsPaciente(v);
  else if (chave === 'cep') aoEditarCep(v);
}

// 1. CNES → nome da UBS
function aoEditarCnes(valor) {
  const cnes = soDigitos(valor);
  if (!cnes || /^0+$/.test(cnes)) return;
  const achou = cadastros.estabelecimentos.find((e) => e.cnes === cnes.padStart(7, '0'));
  if (achou) {
    gravar('estab_solicitante', achou.nome);
    toast(achou.nome, '🏢 Estabelecimento encontrado', 'ok', 4);
    salvarDepois();
    return;
  }
  gravar('estab_solicitante', '');
  alerta('⚠️ UBS não cadastrada',
    'Digite o nome no campo <b>NOME DO ESTABELECIMENTO</b>.<br>Ao salvar no Protocolo, o sistema aprende esse CNES.')
    .then(() => focar('estab_solicitante'));
}

// 2. Profissional → aceita Nº ou NOME
function aoEditarProfissional(valor) {
  const entrada = valor.toUpperCase();
  if (!entrada || entrada === 'SELECIONE') return;

  if (/^\d+$/.test(entrada)) {
    const num = parseInt(entrada, 10);
    const p = cadastros.profissionais.find((x) => x.numero === num);
    if (p) {
      gravar('esf_profissional', p.nome);
      gravar('esf_doc_tipo', soDigitos(p.documento).length === 11 ? 'CPF' : 'CNS');
      gravar('esf_doc_numero', p.documento);
      toast('Nº ' + num + ' → ' + p.nome, '👨‍⚕️ Profissional encontrado', 'ok', 4);
      salvarDepois();
      return;
    }
    gravar('esf_profissional', '');
    alerta('⚠️ Nº não cadastrado',
      'O Nº ' + num + ' não está cadastrado.<br><br>Confira o número ou digite o <b>NOME</b> do profissional.<br>' +
      'Se for profissional novo, digite o nome e depois o Cartão SUS no campo <b>Nº DO DOCUMENTO</b>.')
      .then(() => focar('esf_profissional'));
    return;
  }

  const p = cadastros.profissionais.find((x) => x.nome.toUpperCase().trim() === entrada);
  if (p) {
    gravar('esf_doc_tipo', soDigitos(p.documento).length === 11 ? 'CPF' : 'CNS');
    gravar('esf_doc_numero', p.documento);
    toast(entrada, '👨‍⚕️ Profissional encontrado', 'ok', 4);
    salvarDepois();
    return;
  }
  gravar('esf_doc_numero', '');
  alerta('⚠️ Profissional novo!',
    'Digite o Cartão SUS dele no campo <b>Nº DO DOCUMENTO</b>. O cadastro é feito automaticamente.')
    .then(() => focar('esf_doc_numero'));
}

// 3. Documento do profissional → confere e cadastra
async function aoEditarDocProfissional(valor) {
  const doc = soDigitos(valor);
  if (!doc || /^0+$/.test(doc)) return;
  const motivo = motivoDocProfissional(form.esf_doc_tipo, doc);
  if (motivo) {
    await alerta('⚠️ Documento do profissional com erro',
      'Não confere: ' + esc(motivo) + '.<br><br>Confira o número no CNES ou no CADSUS e digite de novo.<br>' +
      'Enquanto estiver errado, o profissional <b>NÃO</b> é cadastrado.');
    focar('esf_doc_numero');
    return;
  }
  const nome = String(form.esf_profissional || '').toUpperCase().trim();
  if (!nome || nome === 'SELECIONE') return;
  try {
    const novoNum = await dados.cadastrarProfissional(nome, doc, form.esf_doc_tipo);
    if (novoNum) {
      cadastros.profissionais = await dados.listarProfissionais();
      atualizarListaProfissionais();
      alerta('✅ Profissional cadastrado', 'Profissional <b>' + esc(nome) + '</b> cadastrado com sucesso!<br>Nº atribuído: <b>' + novoNum + '</b>');
    }
  } catch (e) {
    alerta('❌ Erro', esc(e.message));
  }
}

// 4. Cartão SUS do paciente → confere e carrega
async function aoEditarCnsPaciente(valor) {
  const cartao = soDigitos(valor);
  if (!cartao) return;
  const motivo = motivoCNSInvalido(cartao);
  let p;
  try {
    p = await dados.pacientePorCns(cartao);
  } catch (e) {
    toast(e.message, '❌ Erro', 'erro');
    return;
  }

  if (!motivo) {
    if (p) {
      carregarPacienteNoForm(p);
      toast(p.nome, '✅ Paciente carregado', 'ok', 4);
    } else {
      alerta('⚠️ Paciente não encontrado',
        'Este Cartão SUS não está no cadastro de pacientes.<br><br>Use <b>① Selecionar Espelho CELK</b> para cadastrar, ou preencha os dados à mão.');
    }
    return;
  }
  if (p) {
    carregarPacienteNoForm(p);
    alerta('⚠️ Cartão SUS com erro',
      'Paciente carregado, mas o Cartão SUS dele está com erro:<br><b>' + esc(p.nome) + '</b><br>CNS ' + cartao + ': ' + esc(motivo) +
      '.<br><br>Confira no CADSUS e corrija aqui no formulário e na tela Pacientes.');
    return;
  }
  await alerta('⚠️ Cartão SUS inválido', 'O número ' + cartao + ' ' + esc(motivo) + '.<br><br>Confira o número e digite de novo.');
  focar('cns_paciente');
}

// 5. CEP → endereço
async function aoEditarCep(valor) {
  const cep = soDigitos(valor);
  if (cep.length !== 8) return;
  await preencherEndereco(cep);
}

async function preencherEndereco(cep) {
  try {
    const r = await buscarCep(cep);
    if (!r) { toast('CEP ' + cep + ' não encontrado. Preencha o endereço à mão.', 'CEP', 'aviso'); return; }
    gravar('logradouro', r.logradouro);
    gravar('bairro', r.bairro);
    gravar('municipio', r.municipio);
    gravar('uf', r.uf);
    if (r.cod_ibge) gravar('cod_ibge', r.cod_ibge);
    salvarDepois();
  } catch (e) {
    console.warn('CEP:', e);
    toast('Não consegui buscar o CEP agora. Preencha o endereço à mão.', 'CEP', 'aviso');
  }
}

function carregarPacienteNoForm(p) {
  const cep = aplicarPaciente(form, p);
  preencherEntradas();
  atualizarResumo();
  salvarDepois();
  if (cep) preencherEndereco(cep);
}

// ============================================================
// PAINEL LATERAL
// ============================================================
function montarPainel() {
  painelResumo = h('div', { class: 'resumo' });

  const resultados = h('div', { class: 'resultados' });
  const buscar = atrasar(async (termo) => {
    if (termo.trim().length < 3) { resultados.innerHTML = ''; return; }
    resultados.innerHTML = '<div class="carregando pequeno"><span class="spinner"></span>Buscando…</div>';
    try {
      const r = await dados.buscarPacientes(termo);
      resultados.innerHTML = '';
      if (!r.lista.length) { resultados.appendChild(h('div', { class: 'mudo pequeno' }, 'Nenhum paciente encontrado.')); return; }
      r.lista.forEach((p) => resultados.appendChild(h('button', {
        type: 'button', class: 'resultado', onclick: async () => {
          const completo = await dados.pacientePorId(p.id);
          carregarPacienteNoForm(completo);
          resultados.innerHTML = '';
          campoBusca.value = '';
          toast(completo.nome, '✅ Paciente carregado', 'ok', 4);
        }
      }, h('strong', null, p.nome), h('span', null, (p.nasc ? 'Nasc. ' + p.nasc + ' · ' : '') + 'CNS ' + (p.cns || '—')))));
      if (r.total > r.lista.length) resultados.appendChild(h('div', { class: 'mudo pequeno' }, 'Mostrando 15 de ' + r.total + '. Digite mais para filtrar.'));
    } catch (e) {
      resultados.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  });
  const campoBusca = h('input', { type: 'search', placeholder: 'Nome, Cartão SUS ou CPF', oninput: (e) => buscar(e.target.value) });

  const botao = (cor, num, titulo, sub, acao) => h('button', { type: 'button', class: 'acao ' + cor, onclick: (e) => acao(e.currentTarget) },
    h('span', { class: 'num' }, num), h('span', null, titulo, h('small', null, sub)));

  return h('aside', { class: 'painel' },
    h('section', { class: 'card' },
      h('h2', null, '📋 APAC Externa'),
      h('div', { class: 'card-conteudo' },
        painelResumo,
        h('hr', { class: 'divisor' }),
        h('div', { class: 'busca-paciente' },
          h('label', { class: 'pequeno mudo' }, '🔎 Buscar paciente já cadastrado'),
          campoBusca, resultados),
        h('hr', { class: 'divisor' }),
        botao('laranja', '1', 'Selecionar Espelho CELK', 'Cadastra o paciente a partir do PDF', passo1Espelho),
        botao('azul', '2', 'Buscar dados da APAC', 'Lê o laudo com IA e confere o código', passo2BuscarDados),
        botao('verde', '3', 'Gerar APAC em PDF', 'Confere os campos e gera o laudo', passo3GerarPdf),
        botao('roxo', '4', 'Salvar no Protocolo', 'Grava no Check-list / Protocolo', passo4Salvar),
        botao('vermelho', '5', 'Limpar formulário', 'Pronto para o próximo paciente', passo5Limpar),
        h('hr', { class: 'divisor' }),
        h('button', { type: 'button', class: 'btn', style: { width: '100%' }, onclick: () => abrirBuscaSigtap({ aoEscolher: usarProcedimento }) },
          '🔍 Buscar procedimento SIGTAP'),
        h('button', { type: 'button', class: 'btn', style: { width: '100%', marginTop: '8px' },
          title: 'Compara SUS, CELK, documento e comprovante de residência', onclick: () => { location.hash = '#/conferencia'; } },
          '🧾 Conferir espelhos'))));
}

function atualizarResumo() {
  if (!painelResumo) return;
  const linha = (rot, val) => h('div', { class: 'linha' }, h('span', null, rot),
    val ? h('span', null, val) : h('span', { class: 'vazio' }, '—'));
  painelResumo.innerHTML = '';
  painelResumo.append(
    linha('Paciente', form.nome_paciente),
    linha('Cartão SUS', form.cns_paciente),
    linha('Procedimento', form.proc_nome),
    linha('Solicitação', form.esf_data));
}

/** Escolhido na busca SIGTAP → vai para o principal ou para o primeiro secundário livre */
function usarProcedimento(item, onde) {
  if (onde === 'principal') {
    gravar('proc_codigo', item.codigo);
    gravar('proc_nome', item.nome.toUpperCase());
    if (!String(form.proc_qtd || '').trim()) gravar('proc_qtd', '1');
  } else {
    let n = 1;
    while (n <= 5 && (form['sec' + n + '_codigo'] || form['sec' + n + '_nome'])) n++;
    if (n > 5) { toast('Os 5 procedimentos secundários já estão preenchidos.', 'SIGTAP', 'aviso'); return; }
    gravar('sec' + n + '_codigo', item.codigo);
    gravar('sec' + n + '_nome', item.nome.toUpperCase());
    gravar('sec' + n + '_qtd', '1');
  }
  atualizarResumo();
  salvarDepois();
  toast(item.codigo + ' · ' + item.nome, onde === 'principal' ? 'Procedimento principal' : 'Procedimento secundário');
}

// ============================================================
// ① SELECIONAR ESPELHO CELK
// ============================================================
function passo1Espelho() {
  let arquivo = null;
  const status = h('div');
  const zona = zonaArquivo({ texto: 'Escolha o PDF do Espelho CELK ou arraste para cá', aoEscolher: (a) => { arquivo = a; status.innerHTML = ''; } });
  const janela = modal({
    titulo: '① Selecionar Espelho CELK',
    conteudo: h('div', null,
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } },
        'O sistema lê o texto do PDF e cadastra o paciente. Se o PDF for uma imagem escaneada, a IA faz a leitura.'),
      zona, status),
    botoes: [
      { texto: 'Fechar' },
      { texto: 'Ler e cadastrar', classe: 'laranja', acao: async () => {
          if (!arquivo) { status.innerHTML = '<div class="msg aviso">Escolha o PDF primeiro.</div>'; return; }
          const btn = janela.el.querySelector('.modal-rodape .laranja');
          await comCarregando(btn, 'Lendo…', () => processarEspelho(arquivo, status, janela));
        } }
    ]
  });
}

async function processarEspelho(arquivo, status, janela) {
  try {
    if (!/pdf$/i.test(arquivo.type) && !/\.pdf$/i.test(arquivo.name)) throw new Error('Escolha um arquivo PDF.');
    const buffer = await lerArquivoBuffer(arquivo);

    // 1) texto do PDF (de graça)
    let d = null;
    let viaIA = false;
    try {
      const t = await extrairTextoPdf(buffer);
      if (t.temTexto) d = interpretarTextoEspelho(t.texto);
    } catch (e) {
      console.warn('pdf.js:', e);
    }

    // 2) se não deu, a IA lê o PDF
    if (!d || !leituraSuficiente(d)) {
      status.innerHTML = '<div class="msg info"><span class="spinner"></span>O texto do PDF não bastou. Lendo com IA…</div>';
      const base64 = await lerArquivoBase64(arquivo);
      const r = await dados.chamarIA({
        funcao: 'ESPELHO', system: PROMPT_ESPELHO, maxTokens: 800,
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: 'Espelho CELK' },
          { type: 'text', text: 'Extraia os dados do paciente conforme instruído.' }
        ]
      });
      d = normalizarEspelhoIA(dados.interpretarJsonIA(r.texto));
      viaIA = true;
    }

    if (!nomeValido(d.nome)) throw new Error('Não foi possível identificar o paciente no Espelho CELK.');

    // 3) já está cadastrado? (CNS ou CPF)
    const existente = await dados.pacienteExistente(soDigitos(d.cns), soDigitos(d.cpf));
    if (existente) {
      carregarPacienteNoForm(existente);
      status.innerHTML = '<div class="msg ok">ℹ️ <b>' + esc(existente.nome) + '</b> já estava cadastrado. Os dados foram carregados no formulário.</div>';
      janela.definirBotoes([{ texto: 'OK', classe: 'principal' }]);
      return;
    }

    // 4) cadastra
    const novo = await dados.salvarPaciente({
      cns: d.cns, nome: d.nome, nascimento: brParaISO(d.nascimento), sexo: d.sexo,
      nome_mae: d.mae, telefone: d.telefone, cep: d.cep, numero: d.numCasa,
      complemento: d.complemento, cpf: d.cpf, prontuario: d.prontuario
    });
    if (d.cns) gravar('cns_paciente', soDigitos(d.cns));
    salvarDepois();

    const avisos = camposFaltantes(d);
    status.innerHTML =
      '<div class="msg ok">✅ <b>' + esc(novo.nome) + '</b> cadastrado' + (viaIA ? ' (leitura feita pela IA)' : '') + '.</div>' +
      (avisos.length ? '<div class="msg aviso">⚠️ Confira no CELK — não encontrei ou veio com erro:' + listaHtml(avisos) + '</div>' : '') +
      '<p>Carregar os dados no formulário agora?</p>';
    janela.definirBotoes([
      { texto: 'Não' },
      { texto: '✅ Sim, carregar', classe: 'principal', acao: (fechar) => { carregarPacienteNoForm(novo); fechar(); toast(novo.nome, '✅ Paciente carregado'); } }
    ]);
  } catch (e) {
    status.innerHTML = '<div class="msg erro">❌ ' + esc(e.message) + '</div>';
  }
}

// ============================================================
// ② BUSCAR DADOS DA APAC (laudo → IA → confere código)
// ============================================================
function passo2BuscarDados() {
  let arquivo = null;
  const status = h('div');
  const resultado = h('div');
  const zona = zonaArquivo({ texto: 'Escolha o PDF do laudo da APAC externa', aoEscolher: (a) => { arquivo = a; status.innerHTML = ''; } });

  const janela = modal({
    titulo: '② Buscar dados da APAC',
    largura: 600,
    conteudo: h('div', null, zona, status, resultado),
    botoes: [
      { texto: 'Fechar' },
      { texto: 'Ler laudo e conferir código', classe: 'principal', acao: async () => {
          if (!arquivo) { status.innerHTML = '<div class="msg aviso">Escolha o PDF do laudo primeiro.</div>'; return; }
          const btn = janela.el.querySelector('.modal-rodape .principal');
          await comCarregando(btn, 'Lendo o laudo com IA…', () => lerLaudo(arquivo, status, resultado, zona, janela));
        } }
    ]
  });
}

async function lerLaudo(arquivo, status, resultado, zona, janela) {
  status.innerHTML = '';
  try {
    if (arquivo.size > LIMITE_PDF_MB * 1024 * 1024) {
      throw new Error('O PDF tem ' + (arquivo.size / 1048576).toFixed(1) + ' MB; o limite é ' + LIMITE_PDF_MB + ' MB.');
    }
    const base64 = await lerArquivoBase64(arquivo);
    const r = await dados.chamarIA({
      funcao: 'SIGTAP', system: PROMPT_LAUDO, maxTokens: 1200,
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: 'Laudo APAC' },
        { type: 'text', text: 'Extraia os dados do laudo conforme instruído.' }
      ]
    });
    if (r.parou === 'max_tokens') throw new Error('A resposta da IA foi cortada (laudo com texto muito longo). Tente novamente.');
    const extraido = dados.interpretarJsonIA(r.texto);

    if (!referenciaCache) {
      referenciaCache = (await dados.listarReferencia()).map((l) => ({
        procedimento: l.procedimento, codigo: codigoSigtap10(l.codigo), cids: l.cids || [], confianca: l.confianca
      }));
    }
    const busca = buscarProcedimento(extraido.procedimento, referenciaCache);
    const codigos = [extraido.codigo_no_laudo ? codigoSigtap10(extraido.codigo_no_laudo) : null, busca.match && busca.match.codigo];
    const oficial = await dados.sigtapPorCodigos(codigos);
    const comp = compararComReferencia(extraido, referenciaCache, oficial.mapa, oficial.competencia);
    mostrarResultadoLaudo(comp, resultado, janela, zona);
  } catch (e) {
    status.innerHTML = '<div class="msg erro">❌ ' + esc(e.message) + '</div>';
  }
}

function mostrarResultadoLaudo(r, resultado, janela, zona) {
  zona.style.display = 'none';
  const badges = {
    ok:             ['✅ Código confere', 'ok'],
    divergente:     ['❌ Código divergente', 'div'],
    codigo_ausente: ['⚠️ Código ausente — sugestão abaixo', 'atencao'],
    nao_catalogado: ['⚪ Procedimento não catalogado', 'nc']
  };
  const [textoBadge, cls] = badges[r.status] || ['⚠️ Verificar', 'atencao'];
  const linha = (rot, val) => h('div', { class: 'campo-linha' }, h('span', null, rot), h('span', null, val || '—'));

  const s = sugestaoParaFormulario(r);
  const ent = {};
  const campoEd = (chave, rot, valor, extra = {}) => {
    ent[chave] = h('input', { type: 'text', value: valor || '', ...extra });
    return h('div', { class: 'campo' }, h('label', null, rot), ent[chave]);
  };

  resultado.innerHTML = '';
  // (append do navegador escreve "null" para itens vazios: por isso o filter)
  resultado.append(...[
    h('span', { class: 'badge ' + cls }, textoBadge),
    h('div', { class: 'secao-titulo' }, 'Dados do laudo'),
    linha('Paciente', r.paciente),
    linha('Procedimento (laudo)', r.procedimento_laudo),
    linha('Código no laudo', r.codigo_laudo || '— (ausente no laudo)'),
    r.nome_oficial_sigtap ? linha('Nome oficial SIGTAP', r.nome_oficial_sigtap) : null,
    linha('CID do laudo', r.cid_laudo),
    linha('Médico solicitante', r.medico_solicitante),
    linha('Estabelecimento', r.estabelecimento_solicitante),
    h('div', { class: 'secao-titulo' }, 'Referência local'),
    linha('Código de referência', r.codigo_referencia || '— (não catalogado)'),
    linha('Confiança do registro', r.confianca_referencia),
    h('div', { class: 'msg info' }, r.mensagem || '')
  ].filter(Boolean));

  if (s.codigo || s.cid) {
    resultado.appendChild(h('div', { class: 'bloco-editar' },
      h('div', { class: 'titulo' }, '✏️ Confirme os dados antes de preencher o formulário'),
      h('div', { class: 'form-simples' },
        campoEd('codigo', 'Código do procedimento', s.codigo, { maxlength: 10, inputmode: 'numeric' }),
        campoEd('nomeProcedimento', 'Nome do procedimento', s.nomeProcedimento),
        campoEd('cid', 'CID-10 principal', s.cid, { maxlength: 10 }),
        campoEd('dataSolicitacao', 'Data da solicitação (dd/mm/aaaa)', s.dataSolicitacao, { maxlength: 10 })),
      campoEd('descricaoDiagnostico', 'Descrição do diagnóstico', s.descricaoDiagnostico),
      campoEd('observacoes', 'Observações', s.observacoes),
      campoEd('medicoSolicitante', 'Profissional solicitante da APAC externa', s.medicoSolicitante),
      campoEd('estabelecimentoSolicitante', 'Estabelecimento solicitante da APAC externa (deixe em branco se não houver)', s.estabelecimentoSolicitante)));
  }

  const preencher = (fechar) => {
    const v = {};
    Object.keys(ent).forEach((k) => { v[k] = ent[k].value.trim(); });
    if (!v.codigo && !v.cid) { toast('Preencha ao menos o código ou o CID.', 'Atenção', 'aviso'); return; }
    aplicarSugestao(form, v);
    preencherEntradas();
    atualizarResumo();
    salvarDepois();
    fechar();
    toast('Confira as seções Procedimento, Justificativa e Solicitação da APAC externa.', '✅ Formulário preenchido');
  };

  const botoes = [
    { texto: 'Ler outro laudo', acao: (fechar) => { fechar(); passo2BuscarDados(); } }
  ];
  if (s.codigo || s.cid) {
    botoes.push({
      texto: (r.status === 'divergente' || r.status === 'nao_catalogado') ? '⚠️ Preencher formulário (revisar código antes)' : '🖊️ Preencher formulário',
      classe: 'laranja', acao: preencher
    });
  }
  janela.definirBotoes(botoes);
}

// ============================================================
// ③ GERAR APAC EM PDF
// ============================================================
async function passo3GerarPdf(botao) {
  const faltando = camposObrigatoriosFaltando(form);
  if (faltando.length) {
    const seguir = await confirmar('⚠️ Campos em branco ou com erro',
      'Estes campos da APAC estão vazios, incompletos ou com erro:' + listaHtml(faltando) + '<br>O PDF sairá assim. Gerar mesmo assim?',
      { sim: 'Sim, gerar mesmo assim', nao: 'Não, vou preencher' });
    if (!seguir) return;
  }
  if (!String(form.nome_paciente || '').trim()) {
    alerta('❌ Falta o paciente', 'Carregue um paciente antes de gerar a APAC.');
    return;
  }

  await comCarregando(botao, 'Gerando…', async () => {
    const u = dados.sessao.unidade;
    const bytes = await gerarPdfApac(window.PDFLib, form, { uf: u.uf });
    const nome = nomeArquivoApac(form);
    const p = partesData();
    let caminho = u.id + '/' + p.ano + '/' + p.mes + '/' + nome + '.pdf';
    let aviso = '';

    try {
      try {
        await dados.enviarArquivo('apacs', caminho, bytes);
      } catch (e) {
        if (!e.jaExiste) throw e;
        caminho = u.id + '/' + p.ano + '/' + p.mes + '/' + nome + '_' + p.hora + p.min + p.seg + '.pdf';
        await dados.enviarArquivo('apacs', caminho, bytes);
      }
      const reg = await dados.registrarApac({
        dados: form, paciente_nome: form.nome_paciente || '', paciente_cns: soDigitos(form.cns_paciente),
        proc_codigo: soDigitos(form.proc_codigo), proc_nome: form.proc_nome || '', pdf_path: caminho,
        assinatura: await assinaturaFormulario(form)
      });
      form._apac_id = reg.id;
      salvarDepois();
    } catch (e) {
      aviso = 'O PDF foi gerado, mas não consegui guardar uma cópia na nuvem (' + e.message + '). Imprima ou salve agora.';
    }

    modal({
      titulo: '✅ APAC gerada',
      conteudo: h('div', { style: { textAlign: 'center' } },
        h('p', null, h('b', null, nome + '.pdf')),
        aviso ? h('div', { class: 'msg aviso' }, aviso) : h('p', { class: 'mudo pequeno' }, 'Uma cópia ficou guardada em Protocolo ▸ APACs geradas.')),
      botoes: [
        { texto: 'Fechar' },
        { texto: '🖨️ Abrir / Imprimir PDF', classe: 'principal', acao: (fechar) => { abrirPdf(bytes); fechar(); } }
      ]
    });
  });
}

// ============================================================
// ④ SALVAR NO PROTOCOLO
// ============================================================
async function passo4Salvar(botao) {
  if (!soDigitos(form.cns_paciente)) {
    alerta('❌ Falta o Cartão SUS', 'Informe o Cartão SUS do paciente antes de salvar.');
    return;
  }
  await comCarregando(botao, 'Salvando…', async () => {
    try {
      const p = { ...form, assinatura: await assinaturaFormulario(form), apac_id: form._apac_id || '' };
      let r = await dados.salvarProtocolo(p, false);
      if (r.duplicado) {
        const deNovo = await confirmar('⚠️ Já foi salvo', esc(r.msg) + '<br><br>Salvar de novo mesmo assim?',
          { sim: 'Sim, salvar de novo', nao: 'Não' });
        if (!deNovo) { toast('Nada foi gravado.', 'ℹ️ Protocolo', 'aviso', 4); return; }
        r = await dados.salvarProtocolo(p, true);
      }
      toast(r.msg, '✅ Processo salvo');
      // o banco pode ter aprendido CNES e profissional novos
      const [est, prof] = await Promise.all([dados.listarEstabelecimentos(), dados.listarProfissionais()]);
      cadastros = { estabelecimentos: est, profissionais: prof };
      atualizarListaProfissionais();
    } catch (e) {
      alerta('❌ Erro ao salvar', esc(e.message));
    }
  });
}

// ============================================================
// ⑤ LIMPAR FORMULÁRIO
// ============================================================
function passo5Limpar() {
  form = formularioVazio();
  preencherEntradas();
  atualizarResumo();
  dados.salvarRascunho(form).catch(() => {});
  focar('cns_paciente');
  toast('Pronto para o próximo paciente!', '✨ Formulário limpo', 'ok', 4);
}

// usado pela tela Protocolo ▸ APACs geradas ("Carregar no formulário")
export function carregarDadosSalvos(d) {
  form = Object.assign(formularioVazio(), d || {});
  return dados.salvarRascunho(form);
}

// para os testes automáticos
export const _teste = { get form() { return form; }, CHAVES };
