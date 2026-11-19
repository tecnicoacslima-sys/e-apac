/**
 * 📋 PRONTUÁRIO DAS APACs — tudo de um paciente num lugar só.
 *  • Busca o paciente pelo nome ou Cartão SUS (só quem já tem APAC gerada).
 *  • Mostra todas as APACs dele, das mais novas para as mais antigas,
 *    com a situação atual (o último evento) e o botão para abrir o PDF.
 *  • Cada APAC tem a sua linha do tempo: enviada ao Controle e Avaliação,
 *    devolvida (com o motivo), corrigida, desmembrada etc.
 *  • "Desmembrada" e "Correção de código" podem ficar ligadas a outras APACs
 *    do mesmo paciente; a APAC ligada mostra de onde ela veio.
 *  • Endereço direto de um paciente: #/prontuario/<CNS>
 */
import * as dados from '../dados.js';
import { h, toast, confirmar, modal, comCarregando, atrasar, spinner } from '../ui.js';
import { esc, isoParaBR, brParaISO, mascararData, dataHoraBR, hojeBR, formatarCodigoSigtap } from '../lib/texto.js';
import { carregarDadosSalvos } from './apac.js';

/** Os tipos de evento (a chave é o que fica gravado no banco). */
export const TIPOS_EVENTO = [
  { chave: 'enviada',         icone: '📤', rotulo: 'Enviada ao Controle e Avaliação', cor: 'azul' },
  { chave: 'devolvida',       icone: '↩️', rotulo: 'Devolvida',                       cor: 'laranja' },
  { chave: 'reenviada',       icone: '🔁', rotulo: 'Corrigida / reenviada',           cor: 'azul' },
  { chave: 'correcao_codigo', icone: '🔢', rotulo: 'Correção de código',              cor: 'roxo',  liga: true },
  { chave: 'desmembrada',     icone: '✂️', rotulo: 'Desmembrada',                     cor: 'roxo',  liga: true },
  { chave: 'espelho',         icone: '🪞', rotulo: 'Espelho anexado',                 cor: 'cinza' },
  { chave: 'autorizada',      icone: '✅', rotulo: 'Autorizada',                      cor: 'verde' },
  { chave: 'negada',          icone: '⛔', rotulo: 'Negada',                          cor: 'vermelho' },
  { chave: 'observacao',      icone: '📝', rotulo: 'Observação',                      cor: 'cinza' }
];
const TIPO = Object.fromEntries(TIPOS_EVENTO.map((t) => [t.chave, t]));

/** Situação de uma APAC: o último evento que não seja "observação" (ou cancelada / sem registro). */
export function situacaoDaApac(apac, eventos) {
  if (apac.cancelada_em) return { icone: '🚫', rotulo: 'Cancelada', cor: 'vermelho', data: String(apac.cancelada_em).substring(0, 10) };
  const validos = (eventos || []).filter((e) => e.tipo !== 'observacao');
  if (!validos.length) return { icone: '🕓', rotulo: 'Sem registro', cor: 'cinza', data: '' };
  const ult = validos[validos.length - 1];
  const t = TIPO[ult.tipo] || TIPO.observacao;
  return { icone: t.icone, rotulo: t.rotulo, cor: t.cor, data: ult.data };
}

/** Selo colorido da situação (usado aqui e na lista "APACs geradas"). */
export function seloSituacao(s) {
  return h('span', { class: 'selo-situacao cor-' + s.cor }, s.icone + ' ' + s.rotulo + (s.data ? ' · ' + isoParaBR(s.data) : ''));
}

let area = null;

export async function montar(el) {
  area = el;
  const m = location.hash.match(/^#\/prontuario\/(\d{15})/);
  if (m) await abrirPaciente(m[1]);
  else montarBusca();
}

// ============================================================
// BUSCA
// ============================================================
function montarBusca(termoInicial = '') {
  area.innerHTML = '';
  const busca = h('input', { type: 'search', placeholder: 'Nome do paciente ou Cartão SUS', value: termoInicial, style: { minWidth: '300px' } });
  const resultado = h('div');
  const procurar = async () => {
    const t = busca.value.trim();
    if (t.length < 3) {
      resultado.innerHTML = '';
      resultado.appendChild(h('p', { class: 'mudo' }, 'Digite pelo menos 3 letras do nome ou números do Cartão SUS.'));
      return;
    }
    resultado.innerHTML = '';
    resultado.appendChild(spinner('Procurando…'));
    try {
      const lista = await dados.pacientesComApac(t);
      resultado.innerHTML = '';
      if (!lista.length) { resultado.appendChild(h('div', { class: 'vazio-tabela' }, 'Nenhum paciente com APAC gerada encontrado.')); return; }
      const corpo = h('tbody');
      lista.forEach((p) => corpo.appendChild(h('tr', { style: { cursor: 'pointer' }, onclick: () => { location.hash = '#/prontuario/' + p.cns; } },
        h('td', null, h('strong', null, p.nome)),
        h('td', null, p.cns),
        h('td', { class: 'centro' }, String(p.total)),
        h('td', null, dataHoraBR(p.ultima)))));
      resultado.append(
        h('p', { class: 'mudo pequeno' }, lista.length + ' paciente(s). Clique para abrir o prontuário.'),
        h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
          h('thead', null, h('tr', null, h('th', null, 'Paciente'), h('th', null, 'Cartão SUS'), h('th', { class: 'centro' }, 'APACs'), h('th', null, 'Última gerada'))),
          corpo)));
    } catch (e) {
      resultado.innerHTML = '';
      resultado.appendChild(h('div', { class: 'msg erro' }, '❌ ' + e.message));
    }
  };
  busca.addEventListener('input', atrasar(procurar, 400));

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null, h('h1', null, '📋 Prontuário das APACs'),
      h('p', null, 'Todos os encaminhamentos do paciente e o histórico de cada laudo: envios, devoluções, correções e desmembramentos.'))),
    h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
      h('div', { class: 'filtros' }, h('div', { class: 'campo' }, h('label', null, 'Procurar paciente'), busca)),
      resultado)));
  busca.focus();
  if (termoInicial) procurar();
}

// ============================================================
// PRONTUÁRIO DE UM PACIENTE
// ============================================================
async function abrirPaciente(cns) {
  area.innerHTML = '';
  area.appendChild(spinner('Abrindo o prontuário…'));
  let apacs, eventos;
  try {
    apacs = await dados.apacsDoPaciente(cns);
    eventos = apacs.length ? await dados.eventosDasApacs(apacs.map((a) => a.id)) : [];
  } catch (e) {
    area.innerHTML = '';
    area.appendChild(h('div', { class: 'msg erro' }, '❌ ' + e.message));
    return;
  }
  desenharPaciente(cns, apacs, eventos);
}

function desenharPaciente(cns, apacs, eventos) {
  area.innerHTML = '';
  const voltar = h('button', { class: 'btn', onclick: () => { location.hash = '#/prontuario'; } }, '← Procurar outro paciente');
  if (!apacs.length) {
    area.append(voltar, h('div', { class: 'msg aviso', style: { marginTop: '12px' } }, 'Nenhuma APAC gerada para o Cartão SUS ' + cns + '.'));
    return;
  }
  const nome = apacs[0].paciente_nome;
  const porApac = new Map(apacs.map((a) => [a.id, []]));
  eventos.forEach((e) => { if (porApac.has(e.apac_id)) porApac.get(e.apac_id).push(e); });
  // ligações ao contrário: "esta APAC veio do desmembramento de…"
  const origem = new Map();
  eventos.forEach((e) => (e.apacs_relacionadas || []).forEach((id) => {
    if (!origem.has(id)) origem.set(id, []);
    origem.get(id).push(e);
  }));
  const recarregar = () => abrirPaciente(cns);
  const ativas = apacs.filter((a) => !a.cancelada_em).length;

  area.append(
    h('div', { class: 'titulo-tela' },
      h('div', null, h('h1', null, '📋 ' + nome),
        h('p', null, 'Cartão SUS ' + cns + ' · ' + apacs.length + ' APAC(s)' + (ativas !== apacs.length ? ' (' + (apacs.length - ativas) + ' cancelada(s))' : ''))),
      voltar),
    ...apacs.map((a) => cartaoApac(a, porApac.get(a.id), origem.get(a.id) || [], apacs, recarregar)));
}

function nomeCurto(a) {
  return (a.proc_codigo ? formatarCodigoSigtap(a.proc_codigo) + ' · ' : '') + (a.proc_nome || 'Procedimento sem nome');
}

function cartaoApac(a, eventos, veioDe, todas, recarregar) {
  const sit = situacaoDaApac(a, eventos);
  const d = a.dados || {};
  const linhaTempo = h('ol', { class: 'linha-tempo' });

  // 1º item fixo: quando foi gerada
  linhaTempo.appendChild(itemTempo({ icone: '🖨️', cor: 'cinza', data: dataHoraBR(a.criado_em), titulo: 'APAC gerada no sistema' }));
  // de onde ela veio (desmembramento / correção feitos em outra APAC)
  veioDe.forEach((e) => {
    const outra = todas.find((x) => x.id === e.apac_id);
    linhaTempo.appendChild(itemTempo({
      icone: '🔗', cor: 'roxo', data: isoParaBR(e.data),
      titulo: (e.tipo === 'desmembrada' ? 'Originada do desmembramento de ' : 'Originada da correção de código de ') + (outra ? nomeCurto(outra) : 'outra APAC'),
      acoes: outra ? [h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); irPara(outra.id); } }, 'ver APAC de origem')] : []
    }));
  });
  eventos.forEach((e) => {
    const t = TIPO[e.tipo] || TIPO.observacao;
    const ligadas = (e.apacs_relacionadas || []).map((id) => todas.find((x) => x.id === id)).filter(Boolean);
    linhaTempo.appendChild(itemTempo({
      icone: t.icone, cor: t.cor, data: isoParaBR(e.data), titulo: t.rotulo, texto: e.descricao,
      ligadas: ligadas.map((x) => h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); irPara(x.id); } }, '→ ' + nomeCurto(x))),
      rodape: 'Registrado' + (e.criado_por_nome ? ' por ' + e.criado_por_nome : '') + ' em ' + dataHoraBR(e.criado_em),
      acoes: [
        e.anexo_path
          ? h('button', { class: 'btn link pequeno', title: 'Abrir a folha digitalizada', onclick: async () => {
              try { window.open(await dados.linkTemporario('apacs', e.anexo_path, 600), '_blank'); }
              catch (err) { toast(err.message, '❌ Erro', 'erro'); }
            } }, '📄 ver comprovante')
          : h('button', { class: 'btn link pequeno', title: 'Anexar a folha digitalizada (PDF ou foto)', onclick: () => anexarDepois(e, t, recarregar) }, '📎 anexar comprovante'),
        h('button', { class: 'btn link pequeno perigo-texto', title: 'Apagar este registro (lançado errado)', onclick: async () => {
        if (!await confirmar('Apagar registro', 'Apagar o registro <b>' + esc(t.rotulo) + '</b> de ' + esc(isoParaBR(e.data)) + '?' +
          (e.anexo_path ? '<br>O comprovante anexado também será apagado.' : ''), { sim: 'Apagar', perigo: true })) return;
        try {
          await dados.excluirEventoApac(e.id);
          if (e.anexo_path) await dados.removerArquivo('apacs', e.anexo_path);
          toast('Registro apagado.', '🗑️ Pronto'); recarregar();
        }
        catch (err) { toast(err.message, '❌ Erro', 'erro'); }
      } }, '🗑️ apagar')]
    }));
  });
  if (a.cancelada_em) {
    linhaTempo.appendChild(itemTempo({ icone: '🚫', cor: 'vermelho', data: dataHoraBR(a.cancelada_em),
      titulo: 'APAC cancelada' + (a.cancelada_por ? ' por ' + a.cancelada_por : ''), texto: a.cancelada_motivo }));
  }

  return h('div', { class: 'card cartao-prontuario' + (a.cancelada_em ? ' apac-cancelada' : ''), id: 'apac-' + a.id },
    h('div', { class: 'card-conteudo' },
      h('div', { class: 'prontuario-topo' },
        h('div', null,
          h('div', { class: 'prontuario-proc' }, nomeCurto(a)),
          h('div', { class: 'mudo pequeno' },
            'Gerada em ' + dataHoraBR(a.criado_em) + (d.cid_principal ? ' · CID ' + d.cid_principal : ''))),
        seloSituacao(sit)),
      linhaTempo,
      h('div', { class: 'botoes', style: { marginTop: '10px' } },
        !a.cancelada_em ? h('button', { class: 'btn principal pequeno', onclick: () => registrarEvento(a, todas, recarregar) }, '➕ Registrar evento') : null,
        a.pdf_path ? h('button', { class: 'btn pequeno', onclick: async () => {
          try { window.open(await dados.linkTemporario('apacs', a.pdf_path, 600), '_blank'); }
          catch (e) { toast(e.message, '❌ Erro', 'erro'); }
        } }, '🖨️ Abrir PDF') : null,
        h('button', { class: 'btn pequeno', onclick: async () => {
          if (!await confirmar('Carregar no formulário', 'O formulário atual será substituído pelos dados desta APAC. Continuar?')) return;
          await carregarDadosSalvos(a.dados);
          location.hash = '#/apac';
        } }, '↩️ Carregar no formulário'))));
}

function itemTempo({ icone, cor, data, titulo, texto, ligadas, rodape, acoes }) {
  return h('li', { class: 'cor-' + cor },
    h('span', { class: 'lt-icone' }, icone),
    h('div', { class: 'lt-corpo' },
      h('div', null, h('b', null, data), ' — ', titulo),
      texto ? h('div', { class: 'lt-texto' }, texto) : null,
      ligadas && ligadas.length ? h('div', { class: 'lt-ligadas' }, ...ligadas) : null,
      (rodape || (acoes && acoes.length)) ? h('div', { class: 'lt-rodape' }, rodape || '', ...(acoes || [])) : null));
}

function irPara(id) {
  const el = document.getElementById('apac-' + id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('piscar');
  setTimeout(() => el.classList.remove('piscar'), 1600);
}

// ============================================================
// ➕ REGISTRAR EVENTO
// ============================================================
function registrarEvento(a, todas, aoSalvar) {
  const data = h('input', { type: 'text', value: hojeBR(), maxlength: 10, inputmode: 'numeric', style: { width: '130px' } });
  data.addEventListener('input', () => { data.value = mascararData(data.value); });
  const tipo = h('select', null, ...TIPOS_EVENTO.map((t) => h('option', { value: t.chave }, t.icone + ' ' + t.rotulo)));
  const descricao = h('textarea', { rows: 4, maxlength: 1000, style: { width: '100%' },
    placeholder: 'Ex.: devolvida pelo Controle e Avaliação — desmembrar tomografia de abdômen total em 2 encaminhamentos: abdômen superior + abdômen total.' });

  const anexo = campoAnexo();
  const outras = todas.filter((x) => x.id !== a.id && !x.cancelada_em);
  const marcas = outras.map((x) => ({ id: x.id, caixa: h('input', { type: 'checkbox' }) }));
  const blocoLigar = h('div', { style: { marginTop: '10px' } },
    h('div', { class: 'rotulo-ligar' }, 'APACs ligadas a este evento (as novas, já geradas)'),
    outras.length
      ? h('div', { class: 'lista-ligar' }, ...outras.map((x, i) => h('label', { class: 'linha-ligar' },
          marcas[i].caixa, ' ', nomeCurto(x), h('span', { class: 'mudo pequeno' }, ' · gerada em ' + dataHoraBR(x.criado_em)))))
      : h('div', { class: 'msg info pequeno' }, 'Este paciente ainda não tem outra APAC gerada. Gere as novas APACs e depois registre o desmembramento (ou registre agora sem ligar).'));
  const mostrarLigar = () => { blocoLigar.style.display = TIPO[tipo.value].liga ? '' : 'none'; };
  tipo.addEventListener('change', mostrarLigar);
  mostrarLigar();

  const janela = modal({
    titulo: '➕ Registrar evento',
    largura: 620,
    conteudo: h('div', null,
      h('p', { style: { marginTop: 0 } }, h('b', null, a.paciente_nome), h('div', { class: 'pequeno mudo' }, nomeCurto(a))),
      h('div', { class: 'filtros' },
        h('div', { class: 'campo' }, h('label', null, 'Data'), data),
        h('div', { class: 'campo', style: { flex: '1' } }, h('label', null, 'O que aconteceu'), tipo)),
      h('div', { class: 'campo', style: { marginTop: '10px' } }, h('label', null, 'Motivo / descrição'), descricao),
      anexo.el,
      blocoLigar),
    botoes: [
      { texto: 'Cancelar' },
      { texto: 'Salvar', classe: 'principal', acao: async (fechar) => {
        const iso = brParaISO(data.value);
        if (!iso) { toast('Data inválida (use dd/mm/aaaa).', 'Atenção', 'aviso'); data.focus(); return; }
        const t = TIPO[tipo.value];
        const ligadas = t.liga ? marcas.filter((m) => m.caixa.checked).map((m) => m.id) : [];
        if ((t.chave === 'devolvida' || t.chave === 'negada') && descricao.value.trim().length < 3) {
          toast('Escreva o motivo da ' + (t.chave === 'devolvida' ? 'devolução' : 'negativa') + '.', 'Atenção', 'aviso'); descricao.focus(); return;
        }
        const botao = janela.el.querySelector('.modal-rodape .principal');
        // prepara o comprovante antes de gravar: se o arquivo tiver problema, nada é gravado
        let bytesAnexo = null;
        try { bytesAnexo = await anexo.obterBytes(); }
        catch (e) { toast(e.message, '📎 Comprovante', 'aviso', 8); return; }
        let semAnexo = '';
        try {
          await comCarregando(botao, 'Salvando…', async () => {
            const reg = await dados.registrarEventoApac({
              apac_id: a.id, data: iso, tipo: t.chave, descricao: descricao.value.trim(), apacs_relacionadas: ligadas
            });
            if (bytesAnexo) {
              try { await dados.anexarComprovanteEvento(reg.id, bytesAnexo); }
              catch (e) { semAnexo = e.message; }
            }
          });
          fechar();
          if (semAnexo) toast('O evento foi gravado, mas o comprovante não subiu (' + semAnexo + '). Use "📎 anexar comprovante" na linha do tempo.', '⚠️ Atenção', 'aviso', 10);
          else toast(t.rotulo + ' · ' + data.value + (bytesAnexo ? ' · com comprovante' : ''), '✅ Registrado');
          aoSalvar();
        } catch (e) { toast(e.message, '❌ Não salvou', 'erro'); }
      } }
    ]
  });
  setTimeout(() => tipo.focus(), 50);
}

// ============================================================
// 📎 COMPROVANTE (folha da devolução digitalizada)
// ============================================================
const LIMITE_ANEXO = 9.5 * 1048576; // o depósito aceita até 10 MB

/** "3" · "3-4" · "1, 3, 5-6" → índices (começando em 0). Vazio → todas. */
function lerPaginas(texto, total) {
  const t = String(texto || '').trim();
  if (!t) return [...Array(total).keys()];
  const lista = [];
  for (const parte of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error('Páginas: use números como 3, 3-4 ou 1,3.');
    const ini = parseInt(m[1], 10), fim = parseInt(m[2] || m[1], 10);
    if (ini < 1 || fim > total || ini > fim) throw new Error('Páginas: o PDF tem ' + total + ' página(s).');
    for (let i = ini; i <= fim; i++) lista.push(i - 1);
  }
  return lista;
}

/** Foto (JPG/PNG) → JPEG reduzido (até 2200 px no lado maior). */
async function fotoReduzida(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não consegui abrir a imagem.')); i.src = url; });
    const esc = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * esc); c.height = Math.round(img.naturalHeight * esc);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}

/** Arquivo escolhido → PDF pronto para guardar (só as páginas pedidas, ou a foto numa folha A4). */
async function arquivoParaPdf(arquivo, paginasTexto) {
  const { PDFDocument } = window.PDFLib;
  const ehPdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name);
  let bytes;
  if (ehPdf) {
    const orig = await PDFDocument.load(await arquivo.arrayBuffer(), { ignoreEncryption: true });
    const idx = lerPaginas(paginasTexto, orig.getPageCount());
    if (idx.length === orig.getPageCount()) bytes = new Uint8Array(await arquivo.arrayBuffer());
    else {
      const novo = await PDFDocument.create();
      (await novo.copyPages(orig, idx)).forEach((p) => novo.addPage(p));
      bytes = await novo.save();
    }
  } else if (/^image\/(jpeg|png)$/.test(arquivo.type) || /\.(jpe?g|png)$/i.test(arquivo.name)) {
    const foto = await fotoReduzida(arquivo);
    const doc = await PDFDocument.create();
    const deitada = foto.w > foto.h;
    const [W, H] = deitada ? [842, 595] : [595, 842];
    const pag = doc.addPage([W, H]);
    const img = await doc.embedJpg(foto.bytes);
    const k = Math.min((W - 40) / foto.w, (H - 40) / foto.h);
    pag.drawImage(img, { x: (W - foto.w * k) / 2, y: (H - foto.h * k) / 2, width: foto.w * k, height: foto.h * k });
    bytes = await doc.save();
  } else throw new Error('Use um PDF ou uma foto (JPG/PNG).');
  if (bytes.length > LIMITE_ANEXO) throw new Error('O comprovante ficou com ' + (bytes.length / 1048576).toFixed(1) + ' MB (máximo 9,5 MB). Escolha só a página da devolução.');
  return bytes;
}

/** Campo "📎 Comprovante": arquivo + páginas (aparece quando o PDF tem mais de uma). */
function campoAnexo() {
  const arquivo = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png' });
  const paginas = h('input', { type: 'text', placeholder: 'ex.: 3 ou 3-4', style: { width: '130px' } });
  const info = h('span', { class: 'mudo pequeno' });
  const blocoPaginas = h('div', { class: 'campo', style: { display: 'none' } }, h('label', null, 'Páginas do PDF'), paginas);
  arquivo.addEventListener('change', async () => {
    info.textContent = '';
    blocoPaginas.style.display = 'none';
    paginas.value = '';
    const f = arquivo.files[0];
    if (!f || !(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return;
    try {
      const doc = await window.PDFLib.PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      const n = doc.getPageCount();
      if (n > 1) {
        blocoPaginas.style.display = '';
        info.textContent = 'Este PDF tem ' + n + ' páginas — informe só a(s) da devolução (vazio = todas).';
        paginas.focus();
      }
    } catch (e) { info.textContent = 'Não consegui ler este PDF.'; }
  });
  const el = h('div', { style: { marginTop: '10px' } },
    h('div', { class: 'filtros', style: { alignItems: 'flex-end' } },
      h('div', { class: 'campo', style: { flex: '1' } }, h('label', null, '📎 Comprovante (opcional) — folha digitalizada, PDF ou foto'), arquivo),
      blocoPaginas),
    info);
  return {
    el,
    obterBytes: async () => (arquivo.files[0] ? arquivoParaPdf(arquivo.files[0], paginas.value) : null)
  };
}

/** Anexar a folha num evento que já foi registrado. */
function anexarDepois(e, t, recarregar) {
  const anexo = campoAnexo();
  const janela = modal({
    titulo: '📎 Anexar comprovante',
    largura: 560,
    conteudo: h('div', null,
      h('p', { style: { marginTop: 0 } }, h('b', null, t.icone + ' ' + t.rotulo), ' · ' + isoParaBR(e.data)),
      anexo.el),
    botoes: [
      { texto: 'Cancelar' },
      { texto: 'Anexar', classe: 'principal', acao: async (fechar) => {
        let bytes;
        try { bytes = await anexo.obterBytes(); } catch (err) { toast(err.message, '📎 Comprovante', 'aviso', 8); return; }
        if (!bytes) { toast('Escolha o arquivo (PDF ou foto).', '📎 Comprovante', 'aviso'); return; }
        const botao = janela.el.querySelector('.modal-rodape .principal');
        try {
          await comCarregando(botao, 'Enviando…', () => dados.anexarComprovanteEvento(e.id, bytes));
          fechar();
          toast('Comprovante anexado.', '📎 Pronto');
          recarregar();
        } catch (err) { toast(err.message, '❌ Não anexou', 'erro'); }
      } }
    ]
  });
}
