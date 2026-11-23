/**
 * 🪪 DOCUMENTOS EM PDF (Ferramentas ▸ Documentos em PDF)
 *
 * O paciente manda pelo chat a foto do RG/CNH (frente e verso) ou da fatura de
 * água/energia (comprovante de endereço). Aqui a foto é colada com Ctrl+V,
 * endireitada (girar), cortada se precisar e salva numa folha A4 em pé:
 *   • RG / CNH / CPF: 2 imagens por folha (frente em cima, verso embaixo)
 *   • Comprovante de endereço: 1 imagem por folha, ocupando a página
 *
 * O nome do arquivo sai sozinho (RG_Maria_Silva) e dá para escolher uma pasta
 * do computador (Chrome/Edge), como no Juntar ECG.
 *
 * Tudo no navegador (pdf.js para ler PDF, pdf-lib para gravar): as fotos não
 * saem do computador e não gasta IA.
 */
import { h, alerta, modal } from '../ui.js';
import { esc } from '../lib/texto.js';

const A4 = { w: 210, h: 297, margem: 10, espaco: 6 }; // mm
const PT_POR_MM = 72 / 25.4;
const MAX_PX = 2000;      // maior lado de cada imagem no PDF (arquivo leve e nítido)
const QUALIDADE = 0.88;   // JPEG
const ESCALA_PDF = 2.5;   // ao ler um PDF recebido

const TIPOS = {
  rg:     { rotulo: 'RG (frente e verso)',        prefixo: 'RG',          porFolha: 2, tamanho: 70 },
  cnh:    { rotulo: 'CNH (frente e verso)',       prefixo: 'CNH',         porFolha: 2, tamanho: 70 },
  cpf:    { rotulo: 'CPF / Cartão SUS',           prefixo: 'CPF',         porFolha: 2, tamanho: 50 },
  comp:   { rotulo: 'Comprovante de endereço',    prefixo: 'COMPROVANTE', porFolha: 1, tamanho: 100 },
  outro:  { rotulo: 'Outro documento',            prefixo: 'DOCUMENTO',   porFolha: 2, tamanho: 100 }
};

const ESTILO = `
.doc-grade { display: grid; grid-template-columns: minmax(300px, 390px) 1fr; gap: 16px; align-items: start; }
.doc-zona { display: block; border: 2px dashed #C9D3DE; border-radius: 8px; padding: 20px 10px; text-align: center; background: #FAFBFC; cursor: pointer; outline: none; }
.doc-zona:focus { border-color: var(--secundaria); }
.doc-zona.arrastando { border-color: var(--secundaria); background: var(--busca-fundo); }
.doc-zona input { display: none; }
.doc-zona .atalho { display: inline-block; border: 1px solid #C9D3DE; border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; font-family: monospace; background: #fff; }
.doc-item { display: flex; gap: 10px; align-items: center; border: 1px solid #E3EBE9; border-radius: 6px; padding: 8px; margin-bottom: 8px; background: #fff; }
.doc-item canvas { width: 58px; height: 58px; object-fit: contain; border: 1px solid #ddd; background: #fff; }
.doc-item .info { flex: 1; font-size: 13px; min-width: 0; }
.doc-item .info b { display: block; color: var(--primaria); margin-bottom: 4px; }
.doc-item .acoes { display: flex; flex-wrap: wrap; gap: 4px; }
.doc-item .acoes button { min-width: 32px; padding: 3px 7px; }
.doc-previa { background: #8A96A5; border-radius: var(--raio); padding: 16px; display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; align-items: flex-start; min-height: 60vh; }
.doc-previa canvas { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.35); width: 360px; max-width: 100%; height: auto; }
.doc-previa .vazio { color: #F4F7F5; margin-top: 40px; text-align: center; line-height: 1.6; }
.doc-duas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.doc-dica { font-size: 11.5px; color: var(--rotulo); margin: -4px 0 8px; }
.doc-pasta { background: #F7F9FA; border: 1px solid #E3EBE9; border-radius: 6px; padding: 8px 10px; margin: 6px 0 10px; font-size: 13px; }
.doc-pasta b { color: var(--primaria); word-break: break-all; }
.doc-aviso { white-space: pre-line; word-break: break-all; }
.doc-corte { display: flex; justify-content: center; }
.doc-corte canvas { cursor: crosshair; touch-action: none; max-width: 100%; background: #fff; }
@media (max-width: 900px) { .doc-grade { grid-template-columns: 1fr; } }
`;

// ------------------------------------------------------------
// Leitura: imagens (foto do chat) e PDF (se mandarem em PDF)
// ------------------------------------------------------------
let pdfjsPromessa = null;
function carregarPdfjs() {
  if (!pdfjsPromessa) {
    const base = new URL('../../vendor/pdfjs/', import.meta.url);
    pdfjsPromessa = import(new URL('pdf.min.mjs', base).href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      return pdfjs;
    });
  }
  return pdfjsPromessa;
}

async function lerArquivo(f) {
  const nome = String(f.name || '').toLowerCase();
  if (f.type === 'application/pdf' || nome.endsWith('.pdf')) {
    const pdfjs = await carregarPdfjs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
    const telas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pag = await pdf.getPage(i);
      const vp = pag.getViewport({ scale: ESCALA_PDF });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pag.render({ canvasContext: ctx, viewport: vp }).promise;
      telas.push(c);
    }
    return telas;
  }
  if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/.test(nome)) {
    const img = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(f));
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return [c];
  }
  throw new Error('"' + (f.name || 'arquivo') + '" não é imagem nem PDF.');
}

// ------------------------------------------------------------
// Imagem: girar, cortar, reduzir, preto e branco
// ------------------------------------------------------------
function girada(it) {
  const src = it.original;
  const deitada = it.rot === 90 || it.rot === 270;
  const c = document.createElement('canvas');
  c.width = deitada ? src.height : src.width;
  c.height = deitada ? src.width : src.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(it.rot * Math.PI / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Canvas final da imagem (já girada, cortada e reduzida). Guardado em it.pronta. */
function preparar(it, cinza) {
  const g = girada(it);
  let sx = 0, sy = 0, sw = g.width, sh = g.height;
  if (it.corte) {
    sx = Math.round(it.corte.x * g.width); sy = Math.round(it.corte.y * g.height);
    sw = Math.max(1, Math.round(it.corte.w * g.width)); sh = Math.max(1, Math.round(it.corte.h * g.height));
  }
  const escala = Math.min(1, MAX_PX / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * escala)); c.height = Math.max(1, Math.round(sh * escala));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (cinza) ctx.filter = 'grayscale(1)';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(g, sx, sy, sw, sh, 0, 0, c.width, c.height);
  it.pronta = c;
  it.sujo = false;
  return c;
}

/** Girar mantendo o corte no mesmo pedaço da imagem */
function girar(it, sentido) {
  if (it.corte) {
    const k = it.corte;
    it.corte = sentido > 0
      ? { x: 1 - k.y - k.h, y: k.x, w: k.h, h: k.w }
      : { x: k.y, y: 1 - k.x - k.w, w: k.h, h: k.w };
  }
  it.rot = (it.rot + sentido + 360) % 360;
  it.sujo = true;
}

// ------------------------------------------------------------
// Montagem das folhas (mm): mesma conta para a prévia e para o PDF
// ------------------------------------------------------------
function posicoes(itens, porFolha, tamanhoPct) {
  const areaW = A4.w - 2 * A4.margem;
  const areaH = A4.h - 2 * A4.margem;
  const slotH = porFolha === 2 ? (areaH - A4.espaco) / 2 : areaH;
  const maxW = areaW * tamanhoPct / 100;
  const folhas = [];
  itens.forEach((it, i) => {
    const s = i % porFolha;
    if (s === 0) folhas.push([]);
    const c = it.pronta;
    const r = Math.min(maxW / c.width, slotH / c.height);
    const w = c.width * r, hh = c.height * r;
    const topo = A4.margem + s * (slotH + A4.espaco);
    folhas[folhas.length - 1].push({ it, x: (A4.w - w) / 2, y: topo + (slotH - hh) / 2, w, h: hh });
  });
  return folhas;
}

function desenharPrevia(folha) {
  const pxmm = 3; // só para a tela
  const c = document.createElement('canvas');
  c.width = Math.round(A4.w * pxmm); c.height = Math.round(A4.h * pxmm);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  folha.forEach((p) => ctx.drawImage(p.it.pronta, p.x * pxmm, p.y * pxmm, p.w * pxmm, p.h * pxmm));
  return c;
}

const paraJpg = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE));

async function montarPdf(folhas, titulo) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(titulo || 'Documento');
  doc.setProducer('APAC digital');
  const W = A4.w * PT_POR_MM, H = A4.h * PT_POR_MM;
  for (const folha of folhas) {
    const pag = doc.addPage([W, H]);
    for (const p of folha) {
      const jpg = await doc.embedJpg(new Uint8Array(await (await paraJpg(p.it.pronta)).arrayBuffer()));
      // o PDF conta de baixo para cima
      pag.drawImage(jpg, { x: p.x * PT_POR_MM, y: H - (p.y + p.h) * PT_POR_MM, width: p.w * PT_POR_MM, height: p.h * PT_POR_MM });
    }
  }
  return doc.save();
}

// ------------------------------------------------------------
// Nome do arquivo: RG_Maria_Silva (primeiro e último nome, sem acento)
// ------------------------------------------------------------
function nomeAutomatico(tipo, nomePaciente) {
  const sem = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ');
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  const palavras = sem(String(nomePaciente || '')).trim().split(/\s+/).filter(Boolean);
  const nome = palavras.length > 1 ? [palavras[0], palavras[palavras.length - 1]] : palavras;
  return [TIPOS[tipo].prefixo, ...nome.map(cap)].join('_');
}

// ------------------------------------------------------------
// Pasta de salvamento (escolhida uma vez, lembrada pelo navegador)
// ------------------------------------------------------------
const TEM_PASTA = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function bancoCfg() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('documentosPdf', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('cfg');
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
}
async function cfg(chave, valor) {
  const db = await bancoCfg();
  return new Promise((ok, erro) => {
    const tx = db.transaction('cfg', valor === undefined ? 'readonly' : 'readwrite');
    const st = tx.objectStore('cfg');
    const r = valor === undefined ? st.get(chave) : (valor === null ? st.delete(chave) : st.put(valor, chave));
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  });
}
async function nomeLivre(dir, base, ext) {
  for (let n = 1; n < 100; n++) {
    const nome = base + (n > 1 ? ' (' + n + ')' : '') + ext;
    try { await dir.getFileHandle(nome); } catch (e) { if (e.name === 'NotFoundError') return nome; throw e; }
  }
  throw new Error('nomes esgotados');
}
function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome, style: { display: 'none' } });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

// ------------------------------------------------------------
// Janela de corte
// ------------------------------------------------------------
function abrirCorte(it, aoTerminar) {
  const g = girada(it);
  const maxL = Math.min(760, window.innerWidth * 0.82), maxA = window.innerHeight * 0.6;
  const escala = Math.min(1, maxL / g.width, maxA / g.height);
  const cv = h('canvas', { width: Math.round(g.width * escala), height: Math.round(g.height * escala) });
  const base = document.createElement('canvas');
  base.width = cv.width; base.height = cv.height;
  base.getContext('2d').drawImage(g, 0, 0, cv.width, cv.height);
  const ctx = cv.getContext('2d');
  let sel = it.corte ? { x: it.corte.x * cv.width, y: it.corte.y * cv.height, w: it.corte.w * cv.width, h: it.corte.h * cv.height } : null;
  let ini = null;

  const desenhar = () => {
    ctx.drawImage(base, 0, 0);
    if (sel && sel.w > 2 && sel.h > 2) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(base, sel.x, sel.y, sel.w, sel.h, sel.x, sel.y, sel.w, sel.h);
      ctx.strokeStyle = '#00C853'; ctx.lineWidth = 2; ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    }
  };
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * cv.width / r.width)),
      y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * cv.height / r.height))
    };
  };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ini = pos(e); sel = { x: ini.x, y: ini.y, w: 0, h: 0 }; });
  cv.addEventListener('pointermove', (e) => {
    if (!ini) return;
    const p = pos(e);
    sel = { x: Math.min(ini.x, p.x), y: Math.min(ini.y, p.y), w: Math.abs(p.x - ini.x), h: Math.abs(p.y - ini.y) };
    desenhar();
  });
  cv.addEventListener('pointerup', () => { ini = null; });
  desenhar();

  modal({
    titulo: '✂️ Cortar imagem',
    largura: Math.max(420, cv.width + 40),
    conteudo: h('div', null,
      h('p', { class: 'pequeno mudo', style: { marginTop: 0 } }, 'Clique e arraste sobre a imagem para marcar a parte que fica.'),
      h('div', { class: 'doc-corte' }, cv)),
    botoes: [
      { texto: 'Cancelar' },
      { texto: 'Tirar o corte', acao: (f) => { it.corte = null; it.sujo = true; f(); aoTerminar(); } },
      { texto: '✔ Aplicar corte', classe: 'principal', acao: (f) => {
        if (sel && sel.w > 10 && sel.h > 10) {
          it.corte = { x: sel.x / cv.width, y: sel.y / cv.height, w: sel.w / cv.width, h: sel.h / cv.height };
          it.sujo = true;
        }
        f(); aoTerminar();
      } }
    ]
  });
}

// ------------------------------------------------------------
// TELA
// ------------------------------------------------------------
let itens = [];
let pasta = null;
let aoColar = null;

export async function montar(area) {
  if (!document.getElementById('estilo-documentos')) document.head.appendChild(h('style', { id: 'estilo-documentos' }, ESTILO));
  itens = [];

  // 1. imagens
  const input = h('input', { type: 'file', multiple: true, accept: 'image/*,application/pdf,.pdf' });
  const status = h('div', { class: 'pequeno mudo', style: { marginTop: '6px' } });
  const zona = h('label', { class: 'doc-zona', tabindex: '0' },
    h('div', { style: { fontSize: '28px' } }, '🪪'),
    h('div', null, 'Copie a foto no chat e aperte ', h('span', { class: 'atalho' }, 'Ctrl'), ' + ', h('span', { class: 'atalho' }, 'V'), ' nesta página'),
    h('div', { class: 'pequeno mudo', style: { marginTop: '4px' } }, 'ou arraste as fotos para cá, ou clique para escolher (imagem ou PDF)'),
    input);
  const lista = h('div', null);

  // 2. tipo e ajustes
  const tipo = h('select', null, ...Object.entries(TIPOS).map(([k, t]) => h('option', { value: k }, t.rotulo)));
  const porFolha = h('select', null,
    h('option', { value: '2' }, '2 por folha (frente em cima, verso embaixo)'),
    h('option', { value: '1' }, '1 por folha (ocupa a página)'));
  const tamanho = h('select', null,
    h('option', { value: '100' }, 'Grande: ocupa todo o espaço'),
    h('option', { value: '70' }, 'Médio: cerca de 13 cm de largura'),
    h('option', { value: '50' }, 'Pequeno: cerca de 9,5 cm (tamanho real do RG)'));
  const cinza = h('input', { type: 'checkbox' });

  // 3. salvar
  const pacNome = h('input', { type: 'text', maxlength: '90', placeholder: 'ex.: Maria Aparecida da Silva' });
  const nome = h('input', { type: 'text', placeholder: 'ex.: RG_Maria_Silva', style: { width: '100%' } });
  let nomeEditadoAMao = false;
  const pastaNome = h('b', null, 'pasta Downloads do navegador');
  const botaoPasta = h('button', { type: 'button', class: 'btn pequeno' }, '📁 Escolher pasta');
  const botaoEsquecer = h('button', { type: 'button', class: 'btn link pequeno', style: { display: 'none' } }, 'voltar para Downloads');
  const avisoSalvar = h('div', { class: 'msg doc-aviso', style: { display: 'none' } });
  const botaoPdf = h('button', { type: 'button', class: 'btn principal', disabled: true }, '⬇️ Baixar PDF (A4)');
  const botaoLimpar = h('button', { type: 'button', class: 'btn', disabled: true }, '🧹 Novo paciente');
  const previa = h('div', { class: 'doc-previa' });

  const aplicarTipo = () => {
    const t = TIPOS[tipo.value];
    porFolha.value = String(t.porFolha);
    tamanho.value = String(t.tamanho);
  };
  aplicarTipo();

  const atualizarNomeArquivo = () => { if (!nomeEditadoAMao) nome.value = nomeAutomatico(tipo.value, pacNome.value); };
  const nomeBase = () => String(nome.value || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\.pdf$/i, '') || TIPOS[tipo.value].prefixo;
  const limparAviso = () => { avisoSalvar.style.display = 'none'; };
  const aviso = (cls, texto) => { avisoSalvar.className = 'msg doc-aviso ' + cls; avisoSalvar.textContent = texto; avisoSalvar.style.display = ''; };
  atualizarNomeArquivo();

  // pasta
  const mostrarPasta = () => {
    pastaNome.textContent = pasta ? pasta.name : 'pasta Downloads do navegador';
    botaoEsquecer.style.display = pasta ? '' : 'none';
  };
  if (!TEM_PASTA) {
    botaoPasta.disabled = true;
    botaoPasta.title = 'Este navegador não permite escolher a pasta. Use o Chrome ou o Edge.';
  } else {
    cfg('pasta').then((x) => { pasta = x || null; mostrarPasta(); }).catch(() => {});
  }
  botaoPasta.addEventListener('click', async () => {
    try {
      const x = await window.showDirectoryPicker({ id: 'documentos', mode: 'readwrite' });
      pasta = x; await cfg('pasta', x); mostrarPasta();
      aviso('info', 'Pasta escolhida: ' + x.name + '. Os próximos arquivos serão salvos lá.');
    } catch (e) {
      if (e.name !== 'AbortError') aviso('erro', 'Não foi possível usar essa pasta: ' + e.message);
    }
  });
  botaoEsquecer.addEventListener('click', async () => {
    pasta = null; await cfg('pasta', null).catch(() => {}); mostrarPasta();
    aviso('info', 'Os arquivos voltarão a ir para a pasta Downloads.');
  });

  /**
   * Pede a permissão da pasta LOGO NO CLIQUE, antes de montar o PDF.
   * O Chrome só mostra o pedido enquanto o clique é "recente"; se o PDF
   * demorar, ele recusa e o arquivo acabava indo para Downloads.
   */
  const liberarPasta = async () => {
    if (!pasta) return { ok: false };
    try {
      let perm = await pasta.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await pasta.requestPermission({ mode: 'readwrite' });
      return perm === 'granted' ? { ok: true } : { ok: false, motivo: 'permissão negada' };
    } catch (e) {
      console.error(e);
      return { ok: false, motivo: e.message || e.name };
    }
  };

  const salvar = async (blob, ext, liberacao) => {
    const base = nomeBase();
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (pasta) {
      try {
        if (liberacao.ok) {
          const n = await nomeLivre(pasta, base, ext);
          const w = await (await pasta.getFileHandle(n, { create: true })).createWritable();
          await w.write(blob); await w.close();
          aviso('ok', '✔ Salvo às ' + hora + ' em ' + pasta.name + ':\n' + n);
          return;
        }
        aviso('aviso', 'Sem permissão para a pasta ' + pasta.name + ' (' + liberacao.motivo + '). O arquivo foi para Downloads.\n' +
          'Na próxima vez, quando o Chrome perguntar, clique em "Permitir" (ou "Permitir em todas as visitas").');
      } catch (e) {
        console.error(e);
        aviso('aviso', 'Não consegui salvar em ' + pasta.name + ' (' + (e.message || e.name) + '). O arquivo foi para Downloads.');
      }
    } else {
      aviso('ok', '✔ Baixado às ' + hora + ' na pasta Downloads:\n' + base + ext);
    }
    baixarBlob(blob, base + ext);
  };

  // desenho da lista e da prévia
  const rotulo = (i) => {
    if (porFolha.value === '2') return 'Folha ' + (Math.floor(i / 2) + 1) + ': ' + (i % 2 === 0 ? 'em cima (frente)' : 'embaixo (verso)');
    return 'Folha ' + (i + 1);
  };

  const desenhar = () => {
    itens.forEach((it) => { if (it.sujo) preparar(it, cinza.checked); });

    lista.innerHTML = '';
    if (!itens.length) lista.appendChild(h('p', { class: 'pequeno mudo' }, 'Nenhuma imagem ainda.'));
    itens.forEach((it, i) => {
      const t = h('canvas', { width: 116, height: 116 });
      const tc = t.getContext('2d');
      const r = Math.min(116 / it.pronta.width, 116 / it.pronta.height);
      const w = it.pronta.width * r, hh = it.pronta.height * r;
      tc.fillStyle = '#fff'; tc.fillRect(0, 0, 116, 116);
      tc.drawImage(it.pronta, (116 - w) / 2, (116 - hh) / 2, w, hh);
      const b = (texto, titulo, acao) => h('button', { type: 'button', class: 'btn pequeno', title: titulo, onclick: acao }, texto);
      lista.appendChild(h('div', { class: 'doc-item' }, t,
        h('div', { class: 'info' },
          h('b', null, rotulo(i)),
          h('div', { class: 'acoes' },
            b('↺', 'Girar para a esquerda', () => { girar(it, -90); desenhar(); }),
            b('↻', 'Girar para a direita', () => { girar(it, 90); desenhar(); }),
            b('✂️', 'Cortar', () => abrirCorte(it, desenhar)),
            b('▲', 'Subir', () => { if (i > 0) { [itens[i - 1], itens[i]] = [itens[i], itens[i - 1]]; desenhar(); } }),
            b('▼', 'Descer', () => { if (i < itens.length - 1) { [itens[i + 1], itens[i]] = [itens[i], itens[i + 1]]; desenhar(); } }),
            b('✕', 'Remover', () => { itens.splice(i, 1); desenhar(); })))));
    });

    previa.innerHTML = '';
    if (!itens.length) {
      previa.appendChild(h('div', { class: 'vazio' }, 'A prévia da folha A4 aparece aqui.', h('br'),
        'Copie a foto no chat e aperte Ctrl + V.'));
    } else {
      posicoes(itens, Number(porFolha.value), Number(tamanho.value)).forEach((f) => previa.appendChild(desenharPrevia(f)));
    }
    botaoPdf.disabled = !itens.length;
    botaoLimpar.disabled = !itens.length;
  };

  const carregar = async (arquivos) => {
    const lista = Array.from(arquivos || []);
    if (!lista.length) return;
    status.innerHTML = '<span class="spinner"></span>Lendo…';
    try {
      for (const f of lista) {
        const telas = await lerArquivo(f);
        telas.forEach((c) => itens.push({ original: c, rot: 0, corte: null, sujo: true }));
      }
      status.textContent = '';
      limparAviso();
      desenhar();
    } catch (e) {
      console.error(e);
      status.innerHTML = '';
      alerta('Não consegui ler', esc(e.message));
    }
  };

  // colar (Ctrl+V) em qualquer lugar da tela
  aoColar = (e) => {
    const dados = e.clipboardData && e.clipboardData.items;
    if (!dados) return;
    const arquivos = [];
    for (const item of dados) if (item.kind === 'file' && /^image\//.test(item.type)) arquivos.push(item.getAsFile());
    if (!arquivos.length) return; // texto: deixa colar normalmente nos campos
    e.preventDefault();
    carregar(arquivos);
  };
  document.addEventListener('paste', aoColar);

  input.addEventListener('change', () => { carregar(input.files); input.value = ''; });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('arrastando'); carregar(e.dataTransfer.files); });

  tipo.addEventListener('change', () => { aplicarTipo(); atualizarNomeArquivo(); limparAviso(); desenhar(); });
  porFolha.addEventListener('change', desenhar);
  tamanho.addEventListener('change', desenhar);
  cinza.addEventListener('change', () => { itens.forEach((it) => { it.sujo = true; }); desenhar(); });
  pacNome.addEventListener('input', () => { atualizarNomeArquivo(); limparAviso(); });
  nome.addEventListener('input', () => { nomeEditadoAMao = nome.value.trim() !== ''; });

  botaoLimpar.addEventListener('click', () => {
    itens = [];
    pacNome.value = ''; nomeEditadoAMao = false; atualizarNomeArquivo();
    limparAviso(); desenhar();
  });

  let salvando = false;
  botaoPdf.addEventListener('click', async () => {
    if (!itens.length || salvando) return;
    salvando = true; botaoPdf.disabled = true; botaoPdf.textContent = 'Salvando…';
    const liberacao = await liberarPasta(); // primeiro a permissão, enquanto o clique vale
    aviso('info', 'Salvando…');
    try {
      const folhas = posicoes(itens, Number(porFolha.value), Number(tamanho.value));
      const bytes = await montarPdf(folhas, nomeBase());
      await salvar(new Blob([bytes], { type: 'application/pdf' }), '.pdf', liberacao);
    } catch (e) {
      console.error(e);
      aviso('erro', 'Erro ao montar o PDF: ' + e.message);
    } finally {
      salvando = false; botaoPdf.disabled = !itens.length; botaoPdf.textContent = '⬇️ Baixar PDF (A4)';
    }
  });

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '🪪 Documentos em PDF'),
      h('p', { class: 'mudo' }, 'Foto do RG, CNH ou comprovante de endereço recebida no chat → folha A4 em pé, pronta para anexar.'))),
    h('div', { class: 'doc-grade' },
      h('div', null,
        h('section', { class: 'card' }, h('h2', null, '1. Imagens'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'msg info pequeno', style: { marginTop: 0 } },
              '🔒 Feito no seu computador: as fotos não são enviadas para nenhum site e não gastam IA.'),
            zona, status,
            h('div', { style: { marginTop: '10px' } }, lista),
            h('div', { class: 'doc-dica', style: { marginTop: '4px' } }, 'Use ↺ ↻ para endireitar a foto e ✂️ para tirar a mesa ou o fundo.'))),
        h('section', { class: 'card' }, h('h2', null, '2. Montagem'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'campo' }, h('label', null, 'Tipo de documento'), tipo),
            h('div', { class: 'campo' }, h('label', null, 'Imagens por folha'), porFolha),
            h('div', { class: 'campo' }, h('label', null, 'Tamanho da imagem'), tamanho),
            h('label', { class: 'pequeno', style: { display: 'block' } }, cinza, ' Preto e branco (PDF mais leve, economiza tinta)'))),
        h('section', { class: 'card' }, h('h2', null, '3. Salvar'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'campo' }, h('label', null, 'Nome do paciente'), pacNome),
            h('div', { class: 'campo', style: { marginBottom: '4px' } }, h('label', null, 'Nome do arquivo'), nome),
            h('div', { class: 'doc-dica', style: { marginTop: '0' } }, 'Preenchido sozinho (tipo + primeiro e último nome). Se você editar à mão, ele para de mudar.'),
            h('div', { class: 'doc-pasta' }, 'Salvar em: ', pastaNome,
              h('div', { class: 'botoes', style: { marginTop: '6px' } }, botaoPasta, botaoEsquecer)),
            h('div', { class: 'botoes' }, botaoPdf, botaoLimpar),
            avisoSalvar))),
      previa));

  desenhar();
}

export function desmontar() {
  if (aoColar) document.removeEventListener('paste', aoColar);
  aoColar = null;
  itens = [];
}
