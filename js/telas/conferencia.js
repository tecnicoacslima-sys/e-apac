/**
 * 🧾 CONFERÊNCIA DE ESPELHOS (antes: menu 📋 APAC ▸ 🧾 Conferir espelhos)
 *
 * Compara, campo a campo, SUS/CADSUS · CELK · Documento de Identidade ·
 * Comprovante de Endereço do MESMO paciente, com IA. Gera o relatório em
 * PDF (guardado no Storage, pasta "relatorios") e grava na tabela conferencias.
 *
 * Diferença para a planilha: os arquivos vêm do computador (não de uma pasta
 * do Drive) e aceitam PDF ou foto (JPG/PNG), até 3 arquivos por documento
 * (ex.: RG frente e verso).
 *
 * 🗜️ Caixa EXAMES (separada da conferência): junta e comprime os exames num
 * PDF próprio (exames_NOME_DATA.pdf), abaixo do limite de 20 MB do CELK.
 * Não entra na comparação com IA nem no PDF de espelhos+docs+res.
 */
import * as dados from '../dados.js';
import { h, toast, modal, alerta, comCarregando, lerArquivoBase64, atrasar, abrirPdfGuardado, baixarPdf } from '../ui.js';
import { esc, dataHoraBR } from '../lib/texto.js';
import {
  CONF, CONF_FONTES, TIPOS_ACEITOS, tipoDoArquivo, validarSelecao, montarPromptConferencia,
  montarConteudoIA, normalizarResultado, contarStatus, normalizarStatus, ROTULO_STATUS,
  fontesDaConferencia, caminhoRelatorio
} from '../lib/conferencia.js';
import { gerarPdfConferencia } from '../lib/pdf-conferencia.js';
import { juntarPdfs, nomePdfUnico, nomeSobrenome, tipoParaJuntar } from '../lib/juntar-pdf.js';
import { comprimirExames, LIMITE_EXAMES_MB, textoMB, nomePdfExames } from '../lib/comprimir-pdf.js';
import { arquivosParaItens } from './juntar-pdf.js';

let selecao = {};
let zonas = {};
let selecaoExames = [];     // exames: separados da conferência (não vão para a IA)
let desenharExames = null;
let areaResultado = null;
let areaHistorico = null;
let campoBusca = null;
let ultimoPaciente = '';   // nome do paciente da última comparação (para o nome do PDF único)

const ESTILO = `
.conf-fontes { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.conf-fonte { border: 2px dashed #C9D3DE; border-radius: 8px; padding: 12px; background: #FAFBFC; display: flex; flex-direction: column; gap: 6px; min-height: 130px; }
.conf-fonte.tem { border-style: solid; border-color: var(--verde); background: #F0F7F2; }
.conf-fonte.arrastando { border-color: var(--secundaria); background: var(--busca-fundo); }
.conf-fonte .tit { font-weight: 700; color: var(--primaria); }
.conf-fonte .opc { font-weight: 400; color: var(--suave); font-size: 12px; }
.conf-fonte ul { list-style: none; margin: 0; padding: 0; font-size: 12.5px; }
.conf-fonte li { display: flex; justify-content: space-between; gap: 6px; padding: 3px 0; border-bottom: 1px solid #E3EBE9; }
.conf-fonte li span { overflow-wrap: anywhere; font-weight: 600; color: var(--verde); }
.conf-fonte li button { border: 0; background: none; cursor: pointer; color: var(--vermelho); font-size: 15px; line-height: 1; }
.conf-fonte label.escolher { margin-top: auto; text-align: center; cursor: pointer; border: 1px solid #BFD6EE; border-radius: 6px; padding: 7px; background: #fff; color: var(--primaria); font-weight: 600; font-size: 13px; }
.conf-fonte label.escolher input { display: none; }
.conf-fonte.exames { border-color: #B9C7E6; background: #F7F9FD; }
.conf-fonte.exames.tem { border-color: var(--secundaria); background: #EEF3FB; }
.conf-fonte.exames li span { color: var(--primaria); }
.conf-fonte .tam { color: var(--suave); font-weight: 400; font-size: 11.5px; white-space: nowrap; }
.conf-fonte .total { font-size: 12px; color: var(--suave); }
.conf-fonte .acoes-exames { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
.conf-fonte .acoes-exames label.escolher { margin-top: 0; }
.conf-fonte .acoes-exames button { font-size: 13px; padding: 7px; }
.conf-tabela td { vertical-align: top !important; font-size: 12.5px; }
.conf-tabela tr.div td { background: #FBE3E3; }
.conf-tabela tr.atencao td { background: #FDF3DA; }
.conf-tabela tr.obs td { font-style: italic; color: #444; padding-top: 0; font-size: 12px; }
.conf-tabela td.vazio-celula { color: #999; }
.conf-busca { width: 100%; max-width: 340px; padding: 8px 10px; border: 1px solid #C9D3DE; border-radius: 6px; font: inherit; }
.conf-contadores { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 10px; }
`;

export async function montar(area) {
  if (!document.getElementById('estilo-conferencia')) {
    document.head.appendChild(h('style', { id: 'estilo-conferencia' }, ESTILO));
  }
  selecao = {};
  zonas = {};
  selecaoExames = [];
  CONF_FONTES.forEach((f) => { selecao[f.chave] = []; });

  const botaoComparar = h('button', { type: 'button', class: 'btn principal', onclick: (e) => comparar(e.currentTarget) },
    '🧾 Comparar e gerar relatório');
  areaResultado = h('div');
  areaHistorico = h('div');
  campoBusca = h('input', { type: 'search', class: 'conf-busca', placeholder: 'Buscar por nome ou CNS…' });
  campoBusca.addEventListener('input', atrasar(() => carregarHistorico(), 400));

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '🧾 Conferência de espelhos'),
      h('p', { class: 'mudo' }, 'Compara SUS/CADSUS, CELK, documento de identidade e comprovante de residência do mesmo paciente.'))),
    h('section', { class: 'card' },
      h('h2', null, 'Nova conferência'),
      h('div', { class: 'card-conteudo' },
        h('p', { class: 'pequeno mudo', style: { marginTop: '0' } },
          'Escolha os arquivos de pelo menos 2 documentos. Aceita PDF ou foto (JPG/PNG); até ' + CONF.MAX_ARQUIVOS_FONTE +
          ' arquivos por documento (ex.: RG frente e verso). Limite total: ' + CONF.LIMITE_MB + ' MB.'),
        h('div', { class: 'conf-fontes' }, ...CONF_FONTES.map(caixaFonte), caixaExames()),
        h('div', { class: 'botoes', style: { marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          botaoComparar,
          h('button', { type: 'button', class: 'btn', title: 'SUS → CELK → documento → comprovante, num PDF só (não usa IA)',
            onclick: (e) => juntarDocumentos(e.currentTarget, ultimoPaciente) }, '📎 Juntar em PDF único'),
          h('button', { type: 'button', class: 'btn', onclick: limparSelecao }, 'Limpar escolha')),
        areaResultado)),
    h('section', { class: 'card' },
      h('h2', null, 'Conferências anteriores'),
      h('div', { class: 'card-conteudo' },
        h('div', { class: 'filtros', style: { marginBottom: '10px' } }, campoBusca),
        areaHistorico)));

  await carregarHistorico();
}

// ============================================================
// ESCOLHA DOS ARQUIVOS
// ============================================================
function caixaFonte(f) {
  const lista = h('ul');
  const input = h('input', { type: 'file', multiple: true, accept: TIPOS_ACEITOS.join(',') + ',.pdf,.jpg,.jpeg,.png' });
  const caixa = h('div', { class: 'conf-fonte', 'data-fonte': f.chave },
    h('div', { class: 'tit' }, f.label, ' ',
      h('span', { class: 'opc' }, f.chave === 'sus' || f.chave === 'celk' ? '(espelho)' : '(opcional)')),
    lista,
    h('label', { class: 'escolher' }, '📄 Escolher arquivo', input));

  const adicionar = (arquivos) => {
    const novos = Array.from(arquivos || []);
    if (!novos.length) return;
    selecao[f.chave] = selecao[f.chave].concat(novos).slice(0, CONF.MAX_ARQUIVOS_FONTE);
    ultimoPaciente = '';
    if (selecao[f.chave].length < novos.length) toast('Cabem até ' + CONF.MAX_ARQUIVOS_FONTE + ' arquivos por documento.', f.label, 'aviso');
    desenhar();
  };
  const desenhar = () => {
    lista.innerHTML = '';
    selecao[f.chave].forEach((a, i) => lista.appendChild(h('li', null,
      h('span', null, a.name),
      h('button', { type: 'button', title: 'Tirar este arquivo', onclick: () => { selecao[f.chave].splice(i, 1); ultimoPaciente = ''; desenhar(); } }, '×'))));
    caixa.classList.toggle('tem', selecao[f.chave].length > 0);
  };
  input.addEventListener('change', () => { adicionar(input.files); input.value = ''; });
  caixa.addEventListener('dragover', (e) => { e.preventDefault(); caixa.classList.add('arrastando'); });
  caixa.addEventListener('dragleave', () => caixa.classList.remove('arrastando'));
  caixa.addEventListener('drop', (e) => { e.preventDefault(); caixa.classList.remove('arrastando'); adicionar(e.dataTransfer.files); });
  zonas[f.chave] = { desenhar };
  return caixa;
}

function limparSelecao() {
  ultimoPaciente = '';
  CONF_FONTES.forEach((f) => { selecao[f.chave] = []; zonas[f.chave].desenhar(); });
  selecaoExames = [];
  if (desenharExames) desenharExames();
  areaResultado.innerHTML = '';
}

// ============================================================
// 🗜️ CAIXA EXAMES — junta + comprime num PDF separado (sem IA, no navegador)
// ============================================================
function caixaExames() {
  const lista = h('ul');
  const total = h('div', { class: 'total' });
  const input = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png' });
  const botao = h('button', { type: 'button', class: 'btn', title: 'Junta os exames num PDF separado, abaixo de 20 MB (limite do CELK)',
    onclick: (e) => comprimirESalvar(e.currentTarget, ultimoPaciente) }, '🗜️ Comprimir');
  const caixa = h('div', { class: 'conf-fonte exames' },
    h('div', { class: 'tit' }, 'Exames ', h('span', { class: 'opc' }, '(PDF separado)')),
    lista, total,
    h('div', { class: 'acoes-exames' }, h('label', { class: 'escolher' }, '📄 Escolher', input), botao));

  const adicionar = (arquivos) => {
    const novos = Array.from(arquivos || []);
    const ruins = novos.filter((a) => !tipoParaJuntar(a));
    if (ruins.length) toast('"' + ruins[0].name + '" não é PDF, JPG ou PNG.', 'Exames', 'aviso');
    selecaoExames = selecaoExames.concat(novos.filter((a) => tipoParaJuntar(a)));
    desenhar();
  };
  const desenhar = () => {
    lista.innerHTML = '';
    selecaoExames.forEach((a, i) => lista.appendChild(h('li', null,
      h('span', null, a.name, ' ', h('span', { class: 'tam' }, textoMB(a.size || 0))),
      h('button', { type: 'button', title: 'Tirar este arquivo', onclick: () => { selecaoExames.splice(i, 1); desenhar(); } }, '×'))));
    const soma = selecaoExames.reduce((s, a) => s + (a.size || 0), 0);
    total.textContent = selecaoExames.length
      ? selecaoExames.length + ' arquivo(s) · ' + textoMB(soma) + (soma > LIMITE_EXAMES_MB * 1048576 ? ' — vai precisar comprimir' : '')
      : 'Vários arquivos? A ordem de escolha é a ordem no PDF.';
    caixa.classList.toggle('tem', selecaoExames.length > 0);
  };
  input.addEventListener('change', () => { adicionar(input.files); input.value = ''; });
  caixa.addEventListener('dragover', (e) => { e.preventDefault(); caixa.classList.add('arrastando'); });
  caixa.addEventListener('dragleave', () => caixa.classList.remove('arrastando'));
  caixa.addEventListener('drop', (e) => { e.preventDefault(); caixa.classList.remove('arrastando'); adicionar(e.dataTransfer.files); });
  desenharExames = desenhar;
  desenhar();
  return caixa;
}

async function comprimirESalvar(botao, paciente) {
  if (!selecaoExames.length) {
    alerta('Falta algo', 'Escolha os arquivos dos exames na caixa "Exames".');
    return;
  }
  if (!paciente) {
    perguntarNome((nome) => comprimirESalvar(botao, nome), {
      textoBotao: '🗜️ Comprimir e baixar',
      previa: (nome) => nomePdfExames(nomeSobrenome(nome))
    });
    return;
  }
  try {
    const r = await comCarregando(botao, 'Preparando…', async () => {
      const progresso = (texto) => { botao.innerHTML = '<span class="spinner"></span>' + esc(texto); };
      const itens = await arquivosParaItens(selecaoExames);
      const mbAntes = selecaoExames.reduce((s, a) => s + (a.size || 0), 0) / 1048576;
      return comprimirExames(window.PDFLib, itens, {
        limiteMB: LIMITE_EXAMES_MB, mbAntes, aoProgredir: progresso,
        titulo: String(paciente).trim() ? String(paciente).trim() + ' — exames' : 'Exames'
      });
    });
    baixarPdf(r.bytes, nomePdfExames(nomeSobrenome(paciente)));
    const resumo = 'Antes: ' + textoMB(r.mbAntes, true) + ' → depois: ' + textoMB(r.mbDepois, true) + ' (' + r.paginas + ' página(s)).';
    if (r.coube) {
      toast(resumo + (r.nivel === 'original' ? ' Já cabia, não precisou comprimir.' : ' Qualidade: ' + r.nivel + '.'), '🗜️ Exames salvos');
    } else {
      alerta('Ficou acima de 20 MB',
        esc(resumo) + '<br><br>Mesmo na compressão mais forte o arquivo passou do limite do CELK. ' +
        'Salvei a versão mais leve, mas divida os exames em duas partes (ex.: metade em cada) e comprima de novo.');
    }
  } catch (e) {
    console.error(e);
    alerta('Não consegui comprimir', esc(e.message) + '<br><br>Se for PDF com senha, abra e salve sem senha antes.');
  }
}

/** Foto grande → JPEG menor (a IA lê bem até ~1600 px). Devolve base64. */
async function fotoParaBase64(arquivo) {
  try {
    const img = await createImageBitmap(arquivo);
    const maior = Math.max(img.width, img.height);
    const escala = Math.min(1, 1800 / maior);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.85);
    return { tipo: 'image/jpeg', base64: url.split(',')[1] };
  } catch (e) {
    return { tipo: tipoDoArquivo(arquivo), base64: await lerArquivoBase64(arquivo) };
  }
}

// ============================================================
// COMPARAR
// ============================================================
async function comparar(botao) {
  const motivo = validarSelecao(selecao);
  if (motivo) { alerta('Falta algo', esc(motivo)); return; }
  areaResultado.innerHTML = '';

  try {
    await comCarregando(botao, 'Comparando com IA… (pode levar até 1 minuto)', async () => {
      const presentes = CONF_FONTES.filter((f) => selecao[f.chave].length);
      const partes = [];
      for (const f of presentes) {
        const lista = selecao[f.chave];
        for (let i = 0; i < lista.length; i++) {
          const a = lista[i];
          const tipo = tipoDoArquivo(a);
          const conteudo = tipo === 'application/pdf'
            ? { tipo, base64: await lerArquivoBase64(a) }
            : await fotoParaBase64(a);
          partes.push({ chave: f.chave, label: f.label, ordem: i + 1, total: lista.length, ...conteudo });
        }
      }

      const r = await dados.chamarIA({
        funcao: 'CONFERENCIA',
        system: montarPromptConferencia(presentes, dados.sessao.unidade),
        maxTokens: CONF.MAX_TOKENS,
        content: montarConteudoIA(partes)
      });
      if (r.parou === 'max_tokens') throw new Error('A resposta da IA foi cortada por ficar longa demais. Tente de novo.');
      const resultado = normalizarResultado(dados.interpretarJsonIA(r.texto), presentes);
      const conf = { ...resultado, fontes: presentes.map((f) => f.chave) };

      // relatório em PDF → Storage
      const agora = new Date();
      const bytes = await gerarPdfConferencia(window.PDFLib, conf, await opcoesPdf(agora));
      const u = dados.sessao.unidade;
      let caminho = caminhoRelatorio(u.id, conf.paciente, agora);
      try {
        await dados.enviarArquivo('relatorios', caminho, bytes);
      } catch (e) {
        if (!e.jaExiste) throw e;
        caminho = caminhoRelatorio(u.id, conf.paciente, agora, true);
        await dados.enviarArquivo('relatorios', caminho, bytes);
      }

      // registro
      const linha = { paciente: conf.paciente, cns: conf.cns, fontes: conf.fontes, campos: conf.campos,
                      resumo: conf.resumo, relatorio_path: caminho };
      const salvo = await dados.registrarConferencia(linha);

      mostrarResultado({ ...linha, ...salvo }, bytes);
      toast('Conferência concluída para ' + (conf.paciente || 'o paciente') + '.', '✅ Pronto');
    });
  } catch (e) {
    console.error(e);
    areaResultado.innerHTML = '';
    areaResultado.appendChild(h('div', { class: 'msg erro', style: { marginTop: '12px' } }, '❌ ' + e.message));
    return;
  }
  carregarHistorico();
}

/** Dados da unidade + logo do APAC digital para o PDF (sem brasão da prefeitura) */
async function opcoesPdf(emitidoEm) {
  const u = dados.sessao.unidade;
  const op = { unidade: { nome: u.nome, municipio: u.municipio, uf: u.uf }, emitidoEm };
  try {
    const r = await fetch('img/logo-relatorio.png');
    if (r.ok) op.marca = { bytes: new Uint8Array(await r.arrayBuffer()), tipo: 'image/png' };
  } catch (e) { /* sem logo */ }
  return op;
}

// ============================================================
// 📎 JUNTAR EM PDF ÚNICO (sem IA, feito no navegador)
// Só os documentos (o relatório NÃO entra), sempre nesta ordem:
// 1º espelho SUS · 2º espelho CELK · 3º documento · 4º comprovante de endereço
// ============================================================
async function juntarDocumentos(botao, paciente) {
  const arquivos = CONF_FONTES.flatMap((f) => selecao[f.chave]);
  if (!arquivos.length) {
    alerta('Falta algo', 'Escolha os arquivos nas caixas acima (SUS, CELK, documento, comprovante de endereço).');
    return;
  }
  if (!paciente) { perguntarNome((nome) => juntarDocumentos(botao, nome)); return; }
  try {
    await comCarregando(botao, 'Juntando…', async () => {
      const itens = await arquivosParaItens(arquivos);
      const bytes = await juntarPdfs(window.PDFLib, itens, { titulo: paciente + ' — espelhos + documentos + residência' });
      baixarPdf(bytes, nomePdfUnico(paciente));
      toast(itens.length + ' arquivo(s) juntados: SUS → CELK → documento → comprovante.', '📎 Pronto');
    });
  } catch (e) {
    alerta('Não consegui juntar', esc(e.message));
  }
}

/**
 * Sem comparação ainda: pergunta o nome do paciente para dar nome ao arquivo.
 * aoConfirmar(nome) segue com o trabalho; op = { textoBotao, previa(nome) }.
 */
function perguntarNome(aoConfirmar, op = {}) {
  const campo = h('input', { placeholder: 'ex.: Bianca Almeida', style: { width: '100%' } });
  const previa = h('div', { class: 'pequeno mudo', style: { marginTop: '6px' } });
  const nomeArquivo = op.previa || ((nome) => nomePdfUnico(nome));
  const atualizar = () => { previa.textContent = 'Arquivo: ' + nomeArquivo(campo.value || ''); };
  campo.addEventListener('input', atualizar);
  atualizar();
  const seguir = (fechar) => {
    const nome = String(campo.value || '').trim();
    fechar();
    aoConfirmar(nome || ' ');
  };
  const m = modal({
    titulo: '📎 Nome do paciente',
    conteudo: h('div', null,
      h('p', { style: { marginTop: '0' } }, 'Digite o nome e o sobrenome do paciente para dar nome ao arquivo (pode deixar em branco).'),
      campo, previa),
    botoes: [
      { texto: op.textoBotao || '📎 Juntar e baixar', classe: 'principal', acao: seguir },
      { texto: 'Cancelar' }
    ]
  });
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') seguir(m.fechar); });
}

// ============================================================
// RESULTADO NA TELA
// ============================================================
function contadores(campos) {
  const n = contarStatus(campos);
  return h('div', { class: 'conf-contadores' },
    h('span', { class: 'badge ok' }, '✅ Conformes: ' + n.ok),
    h('span', { class: 'badge div' }, '❌ Divergentes: ' + n.divergente),
    h('span', { class: 'badge atencao' }, '⚠️ Atenção: ' + n.atencao),
    h('span', { class: 'badge nc' }, 'Total: ' + n.total));
}

function tabelaCampos(conf) {
  const fontes = fontesDaConferencia(conf);
  const corpo = h('tbody');
  (conf.campos || []).forEach((c) => {
    const st = normalizarStatus(c.status);
    const classe = st === 'divergente' ? 'div' : (st === 'atencao' ? 'atencao' : '');
    corpo.appendChild(h('tr', { class: classe },
      h('td', null, h('b', null, c.campo)),
      ...fontes.map((f) => c[f.chave] ? h('td', null, c[f.chave]) : h('td', { class: 'vazio-celula' }, '—')),
      h('td', { style: { whiteSpace: 'nowrap' } }, ROTULO_STATUS[st])));
    if (c.observacao) {
      corpo.appendChild(h('tr', { class: classe + ' obs' },
        h('td', { colspan: String(fontes.length + 2) }, 'Obs.: ' + c.observacao)));
    }
  });
  return h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela conf-tabela' },
    h('thead', null, h('tr', null, h('th', null, 'Campo'), ...fontes.map((f) => h('th', null, f.curto)), h('th', null, 'Status'))),
    corpo));
}

function mostrarResultado(conf, bytes) {
  ultimoPaciente = conf.paciente || '';
  areaResultado.innerHTML = '';
  const n = contarStatus(conf.campos);
  const tipoMsg = n.divergente ? 'erro' : (n.atencao ? 'aviso' : 'ok');
  areaResultado.append(
    h('hr', { class: 'divisor' }),
    h('div', { class: 'msg ' + tipoMsg },
      h('b', null, conf.paciente || 'Paciente'), conf.cns ? ' · CNS ' + conf.cns : '',
      conf.resumo ? h('div', { style: { marginTop: '4px' } }, conf.resumo) : null),
    contadores(conf.campos),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } },
      h('button', { type: 'button', class: 'btn principal',
        onclick: () => abrirPdfGuardado(() => dados.linkTemporario('relatorios', conf.relatorio_path, 600), bytes) }, '🖨️ Abrir relatório em PDF'),
      h('button', { type: 'button', class: 'btn', onclick: () => baixarPdf(bytes, nomeRelatorio(conf)) }, '⬇️ Baixar PDF'),
      h('button', { type: 'button', class: 'btn', title: 'SUS → CELK → documento → comprovante, num PDF só (sem o relatório)',
        onclick: (e) => juntarDocumentos(e.currentTarget, conf.paciente) }, '📎 Juntar documentos em PDF único'),
      h('button', { type: 'button', class: 'btn', onclick: limparSelecao }, '➕ Nova conferência')),
    tabelaCampos(conf));
}

/** Nome do arquivo do relatório: 2026-10-07_NOME_DO_PACIENTE.pdf */
function nomeRelatorio(c) {
  return c.relatorio_path ? c.relatorio_path.split('/').pop() : caminhoRelatorio('x', c.paciente, c.criado_em ? new Date(c.criado_em) : new Date()).split('/').pop();
}

// ============================================================
// HISTÓRICO
// ============================================================
async function carregarHistorico() {
  if (!areaHistorico) return;
  areaHistorico.innerHTML = '<div class="carregando"><span class="spinner"></span>Carregando…</div>';
  try {
    desenharHistorico(await dados.listarConferencias(campoBusca && campoBusca.value));
  } catch (e) {
    areaHistorico.innerHTML = '';
    areaHistorico.appendChild(h('div', { class: 'msg erro' }, '❌ ' + e.message));
  }
}

function desenharHistorico(lista) {
  areaHistorico.innerHTML = '';
  if (!lista.length) {
    areaHistorico.appendChild(h('p', { class: 'mudo' }, 'Nenhuma conferência encontrada.'));
    return;
  }
  const corpo = h('tbody');
  lista.forEach((c) => {
    const n = contarStatus(c.campos);
    corpo.appendChild(h('tr', null,
      h('td', { style: { whiteSpace: 'nowrap' } }, dataHoraBR(c.criado_em)),
      h('td', null, h('b', null, c.paciente || '—'), c.cns ? h('div', { class: 'pequeno mudo' }, 'CNS ' + c.cns) : null),
      h('td', null, fontesDaConferencia(c).map((f) => f.curto).join(' · ')),
      h('td', { style: { whiteSpace: 'nowrap' } },
        n.divergente ? h('span', { class: 'badge div', style: { marginRight: '4px' } }, '❌ ' + n.divergente) : null,
        n.atencao ? h('span', { class: 'badge atencao', style: { marginRight: '4px' } }, '⚠️ ' + n.atencao) : null,
        h('span', { class: 'badge ok' }, '✅ ' + n.ok)),
      h('td', { style: { whiteSpace: 'nowrap' } },
        h('button', { type: 'button', class: 'btn pequeno', title: 'Ver os campos', onclick: () => verConferencia(c) }, '👁️ Ver'), ' ',
        h('button', { type: 'button', class: 'btn pequeno', title: 'Abrir o relatório em PDF',
          onclick: (e) => abrirRelatorio(c, e.currentTarget) }, '🖨️ PDF'))));
  });
  areaHistorico.appendChild(h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
    h('thead', null, h('tr', null, h('th', null, 'Data'), h('th', null, 'Paciente'), h('th', null, 'Documentos'),
      h('th', null, 'Resultado'), h('th', null, ''))),
    corpo)));
  if (lista.length >= 100) areaHistorico.appendChild(h('p', { class: 'pequeno mudo' }, 'Mostrando as 100 mais recentes. Use a busca para achar as antigas.'));
}

function verConferencia(c) {
  modal({
    titulo: '🧾 ' + (c.paciente || 'Conferência') + ' · ' + dataHoraBR(c.criado_em),
    largura: 1000,
    conteudo: h('div', null,
      c.cns ? h('p', { style: { marginTop: '0' } }, 'CNS: ', h('b', null, c.cns)) : null,
      c.resumo ? h('div', { class: 'msg info' }, c.resumo) : null,
      contadores(c.campos),
      tabelaCampos(c)),
    botoes: [
      { texto: '🖨️ Abrir relatório em PDF', classe: 'principal', acao: () => abrirRelatorio(c) },
      { texto: 'Fechar' }
    ]
  });
}

/** Abre o PDF guardado; as antigas (importadas da planilha) têm o PDF refeito na hora. */
async function abrirRelatorio(c, botao) {
  const tarefa = async () => {
    if (c.relatorio_path) {
      await abrirPdfGuardado(() => dados.linkTemporario('relatorios', c.relatorio_path, 600), null);
      return;
    }
    // antiga (importada da planilha): refaz o PDF na hora (a aba abre já no clique)
    const importada = /^Importada da planilha/.test(c.resumo || '');
    const conf = { ...c, resumo: importada ? '' : c.resumo };
    await abrirPdfGuardado(async () => {
      const bytes = await gerarPdfConferencia(window.PDFLib, conf, await opcoesPdf(c.criado_em));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
      return url;
    }, null);
  };
  try {
    if (botao) await comCarregando(botao, 'Abrindo…', tarefa);
    else await tarefa();
  } catch (e) {
    alerta('Não abriu', esc(e.message));
  }
}

export function desmontar() {
  desenharExames = null;
  areaResultado = null;
  areaHistorico = null;
}
