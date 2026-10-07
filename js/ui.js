/**
 * Peças de tela reaproveitadas: criar elementos, avisos, janelas,
 * confirmações e leitura de arquivos.
 */
import { esc } from './lib/texto.js';

/** h('div', { class: 'x', onclick: fn }, 'texto', filho…) */
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.substring(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  filhos.flat().forEach((f) => {
    if (f === null || f === undefined || f === false) return;
    el.appendChild(f instanceof Node ? f : document.createTextNode(String(f)));
  });
  return el;
}

// ---------------- AVISOS RÁPIDOS (como o toast da planilha) ----------------
export function toast(mensagem, titulo = '', tipo = 'ok', segundos = 5) {
  let area = document.getElementById('toasts');
  if (!area) {
    area = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.appendChild(area);
  }
  const t = h('div', { class: 'toast ' + tipo },
    titulo ? h('strong', null, titulo) : null,
    h('span', null, mensagem));
  area.appendChild(t);
  setTimeout(() => { t.classList.add('saindo'); setTimeout(() => t.remove(), 300); }, segundos * 1000);
}

// ---------------- JANELA (modal) ----------------
export function modal({ titulo, conteudo, botoes = [], largura = 520, aoFechar } = {}) {
  const fundo = h('div', { class: 'modal-fundo' });
  const corpo = h('div', { class: 'modal-corpo' }, conteudo);
  const rodape = h('div', { class: 'modal-rodape' });
  const caixa = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: { maxWidth: largura + 'px' } },
    h('div', { class: 'modal-topo' },
      h('h2', null, titulo || ''),
      h('button', { class: 'modal-x', type: 'button', 'aria-label': 'Fechar', onclick: () => fechar() }, '×')),
    corpo, rodape);
  fundo.appendChild(caixa);

  function fechar(valor) {
    fundo.remove();
    document.removeEventListener('keydown', aoTecla);
    if (aoFechar) aoFechar(valor);
  }
  function aoTecla(e) { if (e.key === 'Escape') fechar(); }

  function definirBotoes(lista) {
    rodape.innerHTML = '';
    lista.forEach((b) => rodape.appendChild(h('button', {
      type: 'button', class: 'btn ' + (b.classe || ''), onclick: () => b.acao ? b.acao(fechar) : fechar()
    }, b.texto)));
    rodape.style.display = lista.length ? '' : 'none';
  }
  definirBotoes(botoes);

  document.addEventListener('keydown', aoTecla);
  document.body.appendChild(fundo);
  const foco = caixa.querySelector('input, select, textarea, .btn.principal');
  if (foco) setTimeout(() => foco.focus(), 30);
  return { fechar, corpo, definirBotoes, el: caixa };
}

/** Pergunta Sim/Não. Devolve uma Promise<boolean>. */
export function confirmar(titulo, mensagem, { sim = 'Sim', nao = 'Não', perigo = false } = {}) {
  return new Promise((resolver) => {
    let respondeu = false;
    modal({
      titulo,
      conteudo: typeof mensagem === 'string' ? h('div', { class: 'texto-modal', html: mensagem }) : mensagem,
      botoes: [
        { texto: nao, acao: (f) => { respondeu = true; f(); resolver(false); } },
        { texto: sim, classe: perigo ? 'perigo' : 'principal', acao: (f) => { respondeu = true; f(); resolver(true); } }
      ],
      aoFechar: () => { if (!respondeu) resolver(false); }
    });
  });
}

/** Aviso com um botão OK. */
export function alerta(titulo, mensagem) {
  return new Promise((resolver) => {
    modal({
      titulo,
      conteudo: typeof mensagem === 'string' ? h('div', { class: 'texto-modal', html: mensagem }) : mensagem,
      botoes: [{ texto: 'OK', classe: 'principal' }],
      aoFechar: () => resolver()
    });
  });
}

/** Lista em HTML (texto escapado) */
export function listaHtml(itens) {
  return '<ul>' + itens.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>';
}

/** Coloca o botão em "carregando…" enquanto a tarefa roda. */
export async function comCarregando(botao, texto, tarefa) {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<span class="spinner"></span>' + esc(texto);
  try {
    return await tarefa();
  } finally {
    botao.disabled = false;
    botao.innerHTML = original;
  }
}

export function spinner(texto) {
  return h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), texto || 'Carregando…');
}

// ---------------- ARQUIVOS ----------------
export function lerArquivoBuffer(arquivo) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => falha(new Error('Não consegui ler o arquivo no computador.'));
    r.readAsArrayBuffer(arquivo);
  });
}

export function lerArquivoBase64(arquivo) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => falha(new Error('Não consegui ler o arquivo no computador.'));
    r.readAsDataURL(arquivo);
  });
}

/** Área "escolha ou arraste o PDF aqui". Chama aoEscolher(arquivo). */
export function zonaArquivo({ aceitar = 'application/pdf', texto = 'Escolha o PDF ou arraste para cá', aoEscolher }) {
  const nome = h('div', { class: 'zona-nome' });
  const input = h('input', { type: 'file', accept: aceitar });
  const zona = h('label', { class: 'zona-arquivo' },
    h('span', { class: 'zona-icone' }, '📄'),
    h('span', null, texto),
    input, nome);
  const escolher = (arquivo) => {
    if (!arquivo) return;
    zona.classList.add('tem-arquivo');
    nome.textContent = arquivo.name;
    aoEscolher(arquivo);
  };
  input.addEventListener('change', () => escolher(input.files[0]));
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    zona.classList.remove('arrastando');
    escolher(e.dataTransfer.files[0]);
  });
  zona.limpar = () => { input.value = ''; nome.textContent = ''; zona.classList.remove('tem-arquivo'); };
  return zona;
}

/** Baixa o PDF (bytes) com o nome certo, ex.: NOME_PROCEDIMENTO_DATA.pdf */
export function baixarPdf(bytes, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = h('a', { href: url, download: /\.pdf$/i.test(nome) ? nome : nome + '.pdf', style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

/**
 * Abre numa aba nova o PDF guardado na nuvem (o endereço termina com o nome
 * do arquivo, então "Salvar" no navegador já sugere o nome certo).
 * pegarLink: função async que devolve o link; se falhar, abre os bytes.
 */
export async function abrirPdfGuardado(pegarLink, bytes) {
  const janela = window.open('', '_blank');      // abre já no clique, para o navegador não bloquear
  if (!janela) { alerta('Janela bloqueada', 'O navegador bloqueou a nova aba. Permita janelas (pop-ups) para este site.'); return; }
  try {
    const link = pegarLink ? await pegarLink() : '';
    if (link) { janela.location.href = link; return; }
  } catch (e) { /* abre os bytes abaixo */ }
  if (!bytes) { janela.close(); alerta('Não abriu', 'Não consegui abrir o PDF. Tente de novo.'); return; }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  janela.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}

/** Abre PDF (bytes) numa aba nova para ver/imprimir. */
export function abrirPdf(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}

/** Atraso para buscas enquanto digita */
export function atrasar(fn, ms = 350) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
