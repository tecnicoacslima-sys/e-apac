/**
 * 🫀 JUNTAR ECG (Ferramentas ▸ Juntar ECG)
 *
 * O eletrocardiograma vem numa tira de ~10 × 50 cm, que não cabe no scanner.
 * Digitaliza-se pelo vidro em duas partes; aqui as duas partes são cortadas
 * (tira a borda branca), postas lado a lado e salvas numa folha A4 só.
 *
 * Tudo no navegador (pdf.js para ler, pdf-lib para gravar): nada sai do
 * computador e não gasta IA.
 */
import { h, alerta, comCarregando, baixarPdf } from '../ui.js';
import { esc } from '../lib/texto.js';

const ESCALA_PDF = 3;                              // ~216 dpi ao ler o PDF digitalizado
const A4 = { w: 210, h: 297, margem: 5, espaco: 3 }; // mm
const DPI_FOLHA = 216;
const PT_POR_MM = 72 / 25.4;

const ESTILO = `
.ecg-grade { display: grid; grid-template-columns: minmax(300px, 380px) 1fr; gap: 16px; align-items: start; }
.ecg-zona { display: block; border: 2px dashed #C9D3DE; border-radius: 8px; padding: 22px 10px; text-align: center; background: #FAFBFC; cursor: pointer; }
.ecg-zona.arrastando { border-color: var(--secundaria); background: var(--busca-fundo); }
.ecg-zona input { display: none; }
.ecg-parte { display: flex; gap: 10px; align-items: center; border: 1px solid #E3EBE9; border-radius: 6px; padding: 8px; margin-bottom: 8px; background: #fff; }
.ecg-parte canvas { width: 46px; height: auto; border: 1px solid #ccc; background: #fff; }
.ecg-parte .info { flex: 1; font-size: 13px; }
.ecg-parte .info b { display: block; color: var(--primaria); }
.ecg-previa { background: #8A96A5; border-radius: var(--raio); padding: 16px; display: flex; justify-content: center; align-items: flex-start; min-height: 60vh; }
.ecg-previa canvas { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.35); max-width: 100%; max-height: 80vh; }
.ecg-previa .vazio { color: #F4F7F5; margin-top: 40px; text-align: center; }
@media (max-width: 900px) { .ecg-grade { grid-template-columns: 1fr; } }
`;

// ------------------------------------------------------------
// pdf.js (o mesmo que o site já usa)
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

async function lerArquivos(arquivos) {
  const telas = [];
  for (const f of arquivos) {
    const nome = String(f.name || '').toLowerCase();
    if (f.type === 'application/pdf' || nome.endsWith('.pdf')) {
      const pdfjs = await carregarPdfjs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const pag = await pdf.getPage(i);
        const vp = pag.getViewport({ scale: ESCALA_PDF });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await pag.render({ canvasContext: ctx, viewport: vp }).promise;
        telas.push(c);
      }
    } else if (/^image\//.test(f.type) || /\.(jpe?g|png)$/.test(nome)) {
      const img = await createImageBitmap(f);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      telas.push(c);
    } else {
      throw new Error('"' + f.name + '" não é PDF, JPG ou PNG.');
    }
  }
  return telas;
}

// ------------------------------------------------------------
// Corte automático: acha a tira rosada (papel do ECG) e tira a borda branca
// ------------------------------------------------------------
function cortar(canvas) {
  const w = canvas.width, hgt = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hgt).data;
  const passo = 2;
  const ehPapel = (i) => { const r = d[i], g = d[i + 1], b = d[i + 2]; return (r - g) > 18 || Math.max(r, g, b) < 140; };
  const cols = new Float32Array(w), linhas = new Float32Array(hgt);
  for (let y = 0; y < hgt; y += passo) for (let x = 0; x < w; x += passo) if (ehPapel((y * w + x) * 4)) cols[x]++;
  for (let x = 0; x < w; x += passo) cols[x] /= (hgt / passo);
  const fx = maiorTrecho(cols, w, passo, 0.3);
  if (!fx) return { x: 0, y: 0, w, h: hgt };
  for (let y = 0; y < hgt; y += passo) for (let x = fx[0]; x <= fx[1]; x += passo) if (ehPapel((y * w + x) * 4)) linhas[y]++;
  const larg = (fx[1] - fx[0]) / passo + 1;
  for (let y = 0; y < hgt; y += passo) linhas[y] /= larg;
  const fy = maiorTrecho(linhas, hgt, passo, 0.3);
  if (!fy) return { x: 0, y: 0, w, h: hgt };
  return { x: fx[0], y: fy[0], w: fx[1] - fx[0] + 1, h: fy[1] - fy[0] + 1 };
}
function maiorTrecho(perfil, n, passo, limite) {
  const tolerancia = n * 0.02;
  let melhor = null, ini = -1, ult = -1;
  for (let i = 0; i < n; i += passo) {
    if (perfil[i] > limite) {
      if (ini < 0) ini = i;
      else if (i - ult > tolerancia) {
        if (!melhor || ult - ini > melhor[1] - melhor[0]) melhor = [ini, ult];
        ini = i;
      }
      ult = i;
    }
  }
  if (ini >= 0 && (!melhor || ult - ini > melhor[1] - melhor[0])) melhor = [ini, ult];
  return melhor;
}

function prepararParte(p, autoCorte) {
  const src = p.original;
  if (!p.corte) p.corte = cortar(src);
  const r = autoCorte ? p.corte : { x: 0, y: 0, w: src.width, h: src.height };
  const deitado = p.rot === 90 || p.rot === 270;
  const c = document.createElement('canvas');
  c.width = deitado ? r.h : r.w; c.height = deitado ? r.w : r.h;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(p.rot * Math.PI / 180);
  ctx.drawImage(src, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h);
  return c;
}

/** Folha A4 (em pé) com as partes lado a lado, na mesma altura. */
function montarFolha(partes, autoCorte) {
  const prontas = partes.map((p) => prepararParte(p, autoCorte));
  const pxmm = DPI_FOLHA / 25.4;
  const W = Math.round(A4.w * pxmm), H = Math.round(A4.h * pxmm);
  const folha = document.createElement('canvas');
  folha.width = W; folha.height = H;
  const ctx = folha.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const margem = A4.margem * pxmm, espaco = A4.espaco * pxmm;
  const areaW = W - 2 * margem, areaH = H - 2 * margem;
  const alturaRef = Math.max(...prontas.map((c) => c.height));
  const largs = prontas.map((c) => c.width * alturaRef / c.height);
  const soma = largs.reduce((a, b) => a + b, 0);
  const escala = Math.min((areaW - espaco * (prontas.length - 1)) / soma, areaH / alturaRef);
  const alt = alturaRef * escala;
  const totalW = soma * escala + espaco * (prontas.length - 1);
  let x = margem + (areaW - totalW) / 2;
  const y = margem + (areaH - alt) / 2;
  ctx.imageSmoothingQuality = 'high';
  prontas.forEach((c, i) => { const lw = largs[i] * escala; ctx.drawImage(c, x, y, lw, alt); x += lw + espaco; });
  return folha;
}

const paraBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));

async function folhaParaPdf(folha, titulo) {
  const { PDFDocument } = window.PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(titulo || 'ECG');
  doc.setProducer('APAC digital');
  const jpg = await doc.embedJpg(new Uint8Array(await (await paraBlob(folha)).arrayBuffer()));
  const pag = doc.addPage([A4.w * PT_POR_MM, A4.h * PT_POR_MM]);
  pag.drawImage(jpg, { x: 0, y: 0, width: A4.w * PT_POR_MM, height: A4.h * PT_POR_MM });
  return doc.save();
}

// ------------------------------------------------------------
// TELA
// ------------------------------------------------------------
let partes = [];
let folhaAtual = null;

export async function montar(area) {
  if (!document.getElementById('estilo-ecg')) document.head.appendChild(h('style', { id: 'estilo-ecg' }, ESTILO));
  partes = [];
  folhaAtual = null;

  const input = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png' });
  const status = h('div', { class: 'pequeno mudo', style: { marginTop: '6px' } });
  const zona = h('label', { class: 'ecg-zona' },
    h('div', { style: { fontSize: '28px' } }, '🫀'),
    h('div', null, h('b', null, 'Escolha o PDF digitalizado'), ' ou arraste para cá'),
    h('div', { class: 'pequeno mudo' }, 'PDF com as 2 partes, ou 2 fotos/imagens (JPG/PNG)'),
    input);
  const listaPartes = h('div', null, h('p', { class: 'pequeno mudo' }, 'Nenhum arquivo escolhido ainda.'));
  const autoCorte = h('input', { type: 'checkbox', checked: true });
  const nome = h('input', { placeholder: 'ex.: ECG_MARIA_DA_SILVA', style: { width: '100%' } });
  const previa = h('div', { class: 'ecg-previa' }, h('div', { class: 'vazio' }, 'A prévia da folha aparece aqui.'));
  const botaoPdf = h('button', { type: 'button', class: 'btn principal', disabled: true }, '⬇️ Baixar PDF (A4)');
  const botaoJpg = h('button', { type: 'button', class: 'btn', disabled: true }, '⬇️ Baixar JPG');
  const botaoInverter = h('button', { type: 'button', class: 'btn', disabled: true }, '⇄ Inverter ordem');

  const nomeArquivo = (ext) => {
    const n = String(nome.value || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/\.(pdf|jpe?g)$/i, '');
    return (n || 'ECG_' + new Date().toISOString().slice(0, 10)) + ext;
  };

  const desenhar = () => {
    listaPartes.innerHTML = '';
    partes.forEach((p, i) => {
      const mini = prepararParte(p, autoCorte.checked);
      const t = h('canvas', { width: 46, height: Math.max(1, Math.round(46 * mini.height / mini.width)) });
      const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high'; tc.drawImage(mini, 0, 0, t.width, t.height);
      listaPartes.appendChild(h('div', { class: 'ecg-parte' }, t,
        h('div', { class: 'info' }, h('b', null, i === 0 ? 'Esquerda' : (i === partes.length - 1 ? 'Direita' : 'Meio')), 'Giro: ' + p.rot + '°'),
        h('button', { type: 'button', class: 'btn pequeno', onclick: () => { p.rot = (p.rot + 90) % 360; desenhar(); } }, '↻ Girar')));
    });
    folhaAtual = montarFolha(partes, autoCorte.checked);
    previa.innerHTML = '';
    previa.appendChild(folhaAtual);
    [botaoPdf, botaoJpg, botaoInverter].forEach((b) => { b.disabled = false; });
  };

  const carregar = async (arquivos) => {
    const lista = Array.from(arquivos || []);
    if (!lista.length) return;
    status.innerHTML = '<span class="spinner"></span>Lendo o arquivo…';
    try {
      const telas = await lerArquivos(lista);
      if (!telas.length) throw new Error('Nenhuma página ou imagem encontrada.');
      // mesma ordem do modelo montado à mão: 2ª parte à esquerda, 1ª à direita
      partes = telas.map((c) => ({ original: c, rot: 0, corte: null })).reverse();
      if (!nome.value) nome.value = 'ECG_' + new Date().toISOString().slice(0, 10);
      status.textContent = telas.length === 2 ? '✅ Pronto! Confira a prévia ao lado.'
        : '⚠️ Foram encontradas ' + telas.length + ' partes (o esperado são 2). Todas foram postas lado a lado.';
      desenhar();
    } catch (e) {
      console.error(e);
      status.innerHTML = '';
      alerta('Não consegui ler', esc(e.message));
    }
  };

  input.addEventListener('change', () => { carregar(input.files); input.value = ''; });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('arrastando'); carregar(e.dataTransfer.files); });
  autoCorte.addEventListener('change', () => { if (partes.length) desenhar(); });
  botaoInverter.addEventListener('click', () => { partes.reverse(); desenhar(); });
  botaoJpg.addEventListener('click', async () => {
    if (!folhaAtual) return;
    const url = URL.createObjectURL(await paraBlob(folhaAtual));
    const a = h('a', { href: url, download: nomeArquivo('.jpg'), style: { display: 'none' } });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  });
  botaoPdf.addEventListener('click', () => comCarregando(botaoPdf, 'Gerando…', async () => {
    try { baixarPdf(await folhaParaPdf(folhaAtual, nome.value), nomeArquivo('.pdf')); }
    catch (e) { alerta('Não consegui gerar o PDF', esc(e.message)); }
  }));

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '🫀 Juntar ECG'),
      h('p', { class: 'mudo' }, 'Eletro digitalizado pelo vidro em duas partes → uma folha A4 só, com as partes lado a lado.'))),
    h('div', { class: 'ecg-grade' },
      h('div', null,
        h('section', { class: 'card' }, h('h2', null, '1. Arquivo digitalizado'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'msg info pequeno', style: { marginTop: 0 } },
              '🔒 Feito no seu computador: o exame não é enviado para nenhum site e não gasta IA.'),
            zona, status)),
        h('section', { class: 'card' }, h('h2', null, '2. Ajustes'),
          h('div', { class: 'card-conteudo' },
            listaPartes,
            h('div', { class: 'botoes' }, botaoInverter),
            h('label', { class: 'pequeno', style: { display: 'block', marginTop: '10px' } }, autoCorte, ' Cortar as bordas brancas automaticamente'))),
        h('section', { class: 'card' }, h('h2', null, '3. Salvar'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'campo' }, h('label', null, 'Nome do arquivo'), nome),
            h('div', { class: 'botoes' }, botaoPdf, botaoJpg)))),
      previa));
}

export function desmontar() { partes = []; folhaAtual = null; }
