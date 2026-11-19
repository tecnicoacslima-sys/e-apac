/**
 * 💓 JUNTAR ECG (Ferramentas ▸ Juntar ECG)
 *
 * O eletrocardiograma vem numa tira de ~10 × 50 cm, que não cabe no scanner.
 * Digitaliza-se pelo vidro em duas partes; aqui as duas partes são cortadas
 * (tira a borda branca), postas lado a lado e salvas numa folha A4 só.
 *
 * No alto da folha sai uma linha com Paciente / Nasc. / Data do exame, e
 * esses dados formam o nome do arquivo (ECG_19-08-81_Maria_Silva_17-10-2026).
 * Dá para escolher uma pasta do computador (Chrome/Edge) — o site lembra dela
 * e salva lá direto, sem sobrescrever arquivos com o mesmo nome.
 *
 * Tudo no navegador (pdf.js para ler, pdf-lib para gravar): nada sai do
 * computador e não gasta IA.
 */
import { h, alerta } from '../ui.js';
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
.ecg-duas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ecg-dica { font-size: 11.5px; color: var(--rotulo); margin: -4px 0 8px; }
.ecg-pasta { background: #F7F9FA; border: 1px solid #E3EBE9; border-radius: 6px; padding: 8px 10px; margin: 6px 0 10px; font-size: 13px; }
.ecg-pasta b { color: var(--primaria); word-break: break-all; }
.ecg-aviso { white-space: pre-line; word-break: break-all; }
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
  const ehPapel = (i) => { const r = d[i], g = d[i + 1], b = d[i + 2]; return (r - g) > 12 || Math.max(r, g, b) < 150; };
  const cols = new Float32Array(w), linhas = new Float32Array(hgt);
  for (let y = 0; y < hgt; y += passo) for (let x = 0; x < w; x += passo) if (ehPapel((y * w + x) * 4)) cols[x]++;
  for (let x = 0; x < w; x += passo) cols[x] /= (hgt / passo);
  const fx = maiorTrecho(cols, w, passo, 0.05);
  if (!fx) return { x: 0, y: 0, w, h: hgt };
  for (let y = 0; y < hgt; y += passo) for (let x = fx[0]; x <= fx[1]; x += passo) if (ehPapel((y * w + x) * 4)) linhas[y]++;
  const larg = (fx[1] - fx[0]) / passo + 1;
  for (let y = 0; y < hgt; y += passo) linhas[y] /= larg;
  const fy = maiorTrecho(linhas, hgt, passo, 0.05);
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

/** Folha A4 (em pé): linha do paciente no alto e as partes lado a lado, na mesma altura. */
function montarFolha(partes, autoCorte, paciente) {
  const prontas = partes.map((p) => prepararParte(p, autoCorte));
  const pxmm = DPI_FOLHA / 25.4;
  const W = Math.round(A4.w * pxmm), H = Math.round(A4.h * pxmm);
  const folha = document.createElement('canvas');
  folha.width = W; folha.height = H;
  const ctx = folha.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const margem = A4.margem * pxmm, espaco = A4.espaco * pxmm;
  const faixa = CAB.alturaMm * pxmm;
  const areaW = W - 2 * margem, areaH = H - 2 * margem - faixa;
  const alturaRef = Math.max(...prontas.map((c) => c.height));
  const largs = prontas.map((c) => c.width * alturaRef / c.height);
  const soma = largs.reduce((a, b) => a + b, 0);
  const escala = Math.min((areaW - espaco * (prontas.length - 1)) / soma, areaH / alturaRef);
  const alt = alturaRef * escala;
  const totalW = soma * escala + espaco * (prontas.length - 1);
  let x = margem + (areaW - totalW) / 2;
  const y = margem + faixa + (areaH - alt) / 2;
  desenharCabecalho(ctx, margem, y - faixa, W - 2 * margem, pxmm, paciente); // logo acima do ECG
  ctx.imageSmoothingQuality = 'high';
  prontas.forEach((c, i) => { const lw = largs[i] * escala; ctx.drawImage(c, x, y, lw, alt); x += lw + espaco; });
  return folha;
}

// ------------------------------------------------------------
// Dados do paciente (linha no alto da folha + nome do arquivo)
// ------------------------------------------------------------
const CAB = { alturaMm: 11, fonteMm: 3.6 };

/** '1981-08-19' -> '19/08/1981' (ou '19/08/81') */
function dataBR(iso, anoCurto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return m[3] + '/' + m[2] + '/' + (anoCurto ? m[1].slice(2) : m[1]);
}

function desenharCabecalho(ctx, x0, y0, largura, pxmm, pac) {
  const itens = [
    ['Paciente:', String(pac.nome || '').trim().replace(/\s+/g, ' ').toUpperCase(), 0.58],
    ['Nasc.:', dataBR(pac.nasc), 0.18],
    ['Data do exame:', dataBR(pac.exame), 0.24],
  ];
  const base = y0 + (CAB.alturaMm - 3.5) * pxmm; // linha de base do texto
  const fonte = CAB.fonteMm * pxmm;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 0.25 * pxmm);
  ctx.textBaseline = 'alphabetic';
  let x = x0;
  itens.forEach(([rotulo, valor, frac], i) => {
    const larg = largura * frac - (i < itens.length - 1 ? 3 * pxmm : 0);
    ctx.font = '700 ' + fonte + 'px Arial, sans-serif';
    const lr = ctx.measureText(rotulo + ' ').width;
    ctx.fillText(rotulo, x, base);
    // valor: diminui a letra se o nome for muito comprido
    let f = fonte;
    ctx.font = '400 ' + f + 'px Arial, sans-serif';
    while (valor && ctx.measureText(valor).width > larg - lr - 1 * pxmm && f > fonte * 0.55) {
      f -= 0.5; ctx.font = '400 ' + f + 'px Arial, sans-serif';
    }
    if (valor) ctx.fillText(valor, x + lr, base - 0.4 * pxmm);
    // sublinhado (dá para completar à mão se ficar em branco)
    ctx.beginPath();
    ctx.moveTo(x + lr, base + 0.9 * pxmm); ctx.lineTo(x + larg, base + 0.9 * pxmm);
    ctx.stroke();
    x += largura * frac;
  });
  ctx.restore();
}

/** ECG_19-08-81_Maria_Silva_17-10-2026 (primeiro e último nome, sem acento) */
function nomeAutomatico(pac) {
  const sem = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ');
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  const palavras = sem(String(pac.nome || '')).trim().split(/\s+/).filter(Boolean);
  const nome = palavras.length > 1 ? [palavras[0], palavras[palavras.length - 1]] : palavras;
  const nasc = dataBR(pac.nasc, true).replace(/\//g, '-');
  const exame = dataBR(pac.exame).replace(/\//g, '-');
  return ['ECG', nasc, ...nome.map(cap), exame].filter(Boolean).join('_');
}

// ------------------------------------------------------------
// Pasta de salvamento (escolhida uma vez, lembrada pelo navegador)
// ------------------------------------------------------------
const TEM_PASTA = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function bancoCfg() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open('juntarEcg', 1);
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
/** Não sobrescreve: acrescenta (2), (3)… */
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
let pasta = null;

export async function montar(area) {
  if (!document.getElementById('estilo-ecg')) document.head.appendChild(h('style', { id: 'estilo-ecg' }, ESTILO));
  partes = [];
  folhaAtual = null;

  const input = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png' });
  const status = h('div', { class: 'pequeno mudo', style: { marginTop: '6px' } });
  const zona = h('label', { class: 'ecg-zona' },
    h('div', { style: { fontSize: '28px' } }, '💓'),
    h('div', null, h('b', null, 'Escolha o PDF digitalizado'), ' ou arraste para cá'),
    h('div', { class: 'pequeno mudo' }, 'PDF com as 2 partes, ou 2 fotos/imagens (JPG/PNG)'),
    input);
  const listaPartes = h('div', null, h('p', { class: 'pequeno mudo' }, 'Nenhum arquivo escolhido ainda.'));
  const autoCorte = h('input', { type: 'checkbox', checked: true });

  // dados do paciente
  const pacNome = h('input', { type: 'text', maxlength: '90', placeholder: 'ex.: Maria Aparecida da Silva' });
  const pacNasc = h('input', { type: 'date', min: '1900-01-01', max: '2099-12-31' });
  const pacExame = h('input', { type: 'date', min: '2000-01-01', max: '2099-12-31' });
  const paciente = () => ({ nome: pacNome.value, nasc: pacNasc.value, exame: pacExame.value });

  // salvar
  const nome = h('input', { type: 'text', placeholder: 'ex.: ECG_19-08-81_Maria_Silva_17-10-2026', style: { width: '100%' } });
  let nomeEditadoAMao = false;
  const pastaNome = h('b', null, 'pasta Downloads do navegador');
  const botaoPasta = h('button', { type: 'button', class: 'btn pequeno' }, '📁 Escolher pasta');
  const botaoEsquecer = h('button', { type: 'button', class: 'btn link pequeno', style: { display: 'none' } }, 'voltar para Downloads');
  const avisoSalvar = h('div', { class: 'msg ecg-aviso', style: { display: 'none' } });
  const previa = h('div', { class: 'ecg-previa' }, h('div', { class: 'vazio' }, 'A prévia da folha aparece aqui.'));
  const botaoPdf = h('button', { type: 'button', class: 'btn principal', disabled: true }, '⬇️ Baixar PDF (A4)');
  const botaoJpg = h('button', { type: 'button', class: 'btn', disabled: true }, '⬇️ Baixar JPG');
  const botaoInverter = h('button', { type: 'button', class: 'btn', disabled: true }, '⇄ Inverter ordem');

  const atualizarNomeArquivo = () => { if (!nomeEditadoAMao) nome.value = nomeAutomatico(paciente()); };
  const nomeBase = () => String(nome.value || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\.(pdf|jpe?g)$/i, '') || 'ECG';
  const limparAviso = () => { avisoSalvar.style.display = 'none'; };
  const aviso = (tipo, texto) => { avisoSalvar.className = 'msg ecg-aviso ' + tipo; avisoSalvar.textContent = texto; avisoSalvar.style.display = ''; };
  const limparPaciente = () => {
    limparAviso();
    pacNome.value = ''; pacNasc.value = ''; pacExame.value = '';
    nomeEditadoAMao = false;
    atualizarNomeArquivo();
  };

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
      const x = await window.showDirectoryPicker({ id: 'ecg', mode: 'readwrite' });
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

  let salvando = false;
  const travar = (sim) => {
    salvando = sim;
    botaoPdf.disabled = sim; botaoJpg.disabled = sim;
    botaoPdf.textContent = sim ? 'Salvando…' : '⬇️ Baixar PDF (A4)';
  };
  const salvar = async (blob, ext) => {
    const base = nomeBase();
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (pasta) {
      try {
        let perm = await pasta.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') perm = await pasta.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const n = await nomeLivre(pasta, base, ext);
          const w = await (await pasta.getFileHandle(n, { create: true })).createWritable();
          await w.write(blob); await w.close();
          aviso('ok', '✔ Salvo às ' + hora + ' em ' + pasta.name + ':\n' + n);
          return;
        }
        aviso('aviso', 'Sem permissão para a pasta ' + pasta.name + '. O arquivo foi para Downloads.');
      } catch (e) {
        console.error(e);
        aviso('aviso', 'Não consegui salvar em ' + pasta.name + ' (' + e.message + '). O arquivo foi para Downloads.');
      }
    } else {
      aviso('ok', '✔ Baixado às ' + hora + ' na pasta Downloads:\n' + base + ext);
    }
    baixarBlob(blob, base + ext);
  };

  const redesenharFolha = () => {
    folhaAtual = montarFolha(partes, autoCorte.checked, paciente());
    previa.innerHTML = '';
    previa.appendChild(folhaAtual);
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
    redesenharFolha();
    [botaoPdf, botaoJpg, botaoInverter].forEach((b) => { b.disabled = false; });
  };

  const carregar = async (arquivos) => {
    const lista = Array.from(arquivos || []);
    if (!lista.length) return;
    status.innerHTML = '<span class="spinner"></span>Lendo o arquivo…';
    try {
      const telas = await lerArquivos(lista);
      if (!telas.length) throw new Error('Nenhuma página ou imagem encontrada.');
      // ao trocar de ECG, apaga os dados do paciente anterior (evita salvar com o nome errado)
      if (partes.length) limparPaciente();
      // mesma ordem do modelo montado à mão: 2ª parte à esquerda, 1ª à direita
      partes = telas.map((c) => ({ original: c, rot: 0, corte: null })).reverse();
      atualizarNomeArquivo();
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

  let tempoRedesenho = null;
  [pacNome, pacNasc, pacExame].forEach((el) => el.addEventListener('input', () => {
    atualizarNomeArquivo(); limparAviso();
    if (!partes.length) return;
    clearTimeout(tempoRedesenho);
    tempoRedesenho = setTimeout(redesenharFolha, 250);
  }));
  nome.addEventListener('input', () => { nomeEditadoAMao = nome.value.trim() !== ''; });

  botaoJpg.addEventListener('click', async () => {
    if (!folhaAtual || salvando) return;
    travar(true); aviso('info', 'Salvando…');
    try { await salvar(await paraBlob(folhaAtual), '.jpg'); }
    catch (e) { console.error(e); aviso('erro', 'Erro ao salvar o JPG: ' + e.message); }
    finally { travar(false); }
  });
  botaoPdf.addEventListener('click', async () => {
    if (!folhaAtual || salvando) return;
    travar(true); aviso('info', 'Salvando…');
    try {
      const bytes = await folhaParaPdf(folhaAtual, nomeBase());
      await salvar(new Blob([bytes], { type: 'application/pdf' }), '.pdf');
    } catch (e) { console.error(e); aviso('erro', 'Erro ao montar o PDF: ' + e.message); }
    finally { travar(false); }
  });

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '💓 Juntar ECG'),
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
        h('section', { class: 'card' }, h('h2', null, '3. Dados do paciente'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'campo' }, h('label', null, 'Nome completo'), pacNome),
            h('div', { class: 'ecg-duas' },
              h('div', { class: 'campo' }, h('label', null, 'Data de nascimento'), pacNasc),
              h('div', { class: 'campo' }, h('label', null, 'Data do exame'), pacExame)),
            h('div', { class: 'ecg-dica' }, 'Esses dados saem numa linha no alto da folha e formam o nome do arquivo.'))),
        h('section', { class: 'card' }, h('h2', null, '4. Salvar'),
          h('div', { class: 'card-conteudo' },
            h('div', { class: 'campo', style: { marginBottom: '4px' } }, h('label', null, 'Nome do arquivo'), nome),
            h('div', { class: 'ecg-dica', style: { marginTop: '0' } }, 'Preenchido sozinho com os dados do paciente. Se você editar à mão, ele para de mudar.'),
            h('div', { class: 'ecg-pasta' }, 'Salvar em: ', pastaNome,
              h('div', { class: 'botoes', style: { marginTop: '6px' } }, botaoPasta, botaoEsquecer)),
            h('div', { class: 'botoes' }, botaoPdf, botaoJpg),
            avisoSalvar))),
      previa));
}

export function desmontar() { partes = []; folhaAtual = null; }
