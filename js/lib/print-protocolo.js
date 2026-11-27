/**
 * 📸 PRINT DO PROTOCOLO — recorta o trecho direto do PDF oficial
 *
 * Em vez de copiar o texto (ou usar o Win+Shift+S), gera uma imagem da
 * página real do protocolo, só com a parte do trecho escolhido:
 *   • cabeçalho da página (logo/prefeitura e nº da página), quando existir;
 *   • o trecho, do título até o começo do trecho seguinte
 *     (se o trecho continua na página seguinte, junta as duas partes);
 *   • uma linha embaixo com a fonte (nome do protocolo, órgão, ano e página).
 *
 * Como acha o trecho: lê o texto da página com o pdf.js, procura a linha do
 * título (ou o começo do texto do trecho) e faz o mesmo com os trechos
 * vizinhos para saber onde ele termina. Cabeçalho e rodapé são as linhas que
 * se repetem no mesmo lugar nas páginas vizinhas.
 * Se não achar (fluxograma em imagem, por exemplo), usa a página inteira.
 *
 * Tudo no navegador, nada sai do computador.
 */

const ESCALA = 2;              // 2 px por ponto do PDF: nítido para imprimir e colar
const MAX_PAGINAS = 3;         // um trecho raramente passa de 2 páginas

let pdfjsPromessa = null;
const documentos = new Map();  // url -> Promise<doc>
const paginas = new Map();     // url#n -> Promise<{ linhas, largura, altura }>
const estruturas = new Map();  // url#n -> Promise<{ cab, corpo, rod, largura, altura }>

async function carregarPdfjs() {
  if (!pdfjsPromessa) {
    const base = new URL('../../vendor/pdfjs/', import.meta.url);
    pdfjsPromessa = import(new URL('pdf.min.mjs', base).href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      return pdfjs;
    }).catch((e) => { pdfjsPromessa = null; throw e; });
  }
  return pdfjsPromessa;
}

function abrirDocumento(url) {
  if (!documentos.has(url)) {
    const p = carregarPdfjs()
      .then((pdfjs) => pdfjs.getDocument({ url, isEvalSupported: false }).promise)
      .catch((e) => { documentos.delete(url); throw e; });
    documentos.set(url, p);
  }
  return documentos.get(url);
}

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Para comparar cabeçalho/rodapé entre páginas: o nº da página muda, o resto não. */
function chave(s) { return semAcento(s).replace(/\d+/g, '#'); }

/**
 * Linhas de texto da página, em pixels da imagem (ESCALA), de cima para baixo.
 * Cada linha: { topo, base, texto }
 */
function lerPagina(url, n) {
  const k = url + '#' + n;
  if (!paginas.has(k)) {
    const p = abrirDocumento(url).then(async (doc) => {
      if (n < 1 || n > doc.numPages) return null;
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: ESCALA });
      const conteudo = await pagina.getTextContent();
      const pedacos = [];
      conteudo.items.forEach((i) => {
        if (!i.str || !i.str.trim()) return;
        const alt = (i.height || Math.abs(i.transform[3]) || 10) * ESCALA;
        const [x, y] = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
        pedacos.push({ x, y, alt, str: i.str });
      });
      pedacos.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      const linhas = [];
      pedacos.forEach((pd) => {
        const tol = Math.max(2 * ESCALA, pd.alt * 0.45);
        let l = linhas.find((x) => Math.abs(x.y - pd.y) <= tol);
        if (!l) { l = { y: pd.y, alt: 0, pedacos: [] }; linhas.push(l); }
        l.pedacos.push(pd);
        l.alt = Math.max(l.alt, pd.alt);
      });
      linhas.sort((a, b) => a.y - b.y);
      return {
        largura: vp.width,
        altura: vp.height,
        linhas: linhas.map((l) => ({
          topo: l.y - l.alt * 0.95,
          base: l.y + l.alt * 0.3,
          texto: l.pedacos.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim()
        }))
      };
    }).catch((e) => { paginas.delete(k); throw e; });
    paginas.set(k, p);
  }
  return paginas.get(k);
}

/** Separa cabeçalho, corpo e rodapé (o que se repete nas duas páginas vizinhas). */
function estruturaPagina(url, n) {
  const k = url + '#' + n;
  if (!estruturas.has(k)) {
    const p = (async () => {
      const pag = await lerPagina(url, n);
      if (!pag) return null;
      const vizinhas = (await Promise.all([lerPagina(url, n - 1), lerPagina(url, n + 1)]))
        .filter(Boolean)
        .map((v) => v.linhas.map((l) => ({ k: chave(l.texto), topo: l.topo })));
      const tol = 3 * ESCALA;
      const repete = (l) => {
        const kk = chave(l.texto);
        if (!kk.replace(/#/g, '').trim()) return true;          // só número de página / símbolo
        if (!vizinhas.length) return false;
        return vizinhas.every((v) => v.some((x) => x.k === kk && Math.abs(x.topo - l.topo) <= tol));
      };
      const ls = pag.linhas;
      let i = 0;
      while (i < ls.length && ls[i].topo < pag.altura * 0.2 && repete(ls[i])) i++;
      let j = ls.length;
      while (j > i && ls[j - 1].topo > pag.altura * 0.8 && repete(ls[j - 1])) j--;
      return { cab: ls.slice(0, i), corpo: ls.slice(i, j), rod: ls.slice(j), largura: pag.largura, altura: pag.altura };
    })().catch((e) => { estruturas.delete(k); throw e; });
    estruturas.set(k, p);
  }
  return estruturas.get(k);
}

/** O que procurar na página para achar o começo do trecho. */
function alvos(item) {
  const lista = [];
  [item.titulo, String(item.titulo || '').split(/ · |\(|\/| - | – | — |:/)[0]].forEach((t) => {
    const s = semAcento(t).slice(0, 40);
    if (s.length >= 3 && !lista.some((x) => x.s === s)) lista.push({ s, titulo: true });
  });
  String(item.texto || '').split('\n').slice(0, 4).forEach((l) => {
    const s = semAcento(l).slice(0, 32);
    if (s.length >= 12) lista.push({ s, titulo: false });
  });
  return lista;
}

/** Começo do texto do trecho (para conferir que o título achado é o de verdade). */
function comecoDoTexto(item) {
  for (const l of String(item.texto || '').split('\n')) {
    const s = semAcento(l).slice(0, 22);
    if (s.length >= 10) return s;
  }
  return '';
}

/** Onde o trecho começa: { pagina, topo } ou null. Procura na página dele e nas vizinhas. */
async function localizar(url, item) {
  const procurados = alvos(item);
  const conferir = comecoDoTexto(item);
  for (const n of [item.pagina, item.pagina + 1, item.pagina - 1]) {
    const est = await estruturaPagina(url, n);
    if (!est) continue;
    const ls = est.corpo;
    // o texto do trecho vem logo abaixo do título? (o nome também aparece em
    // listas/índices no começo do capítulo — esse não é o título de verdade)
    const confirma = (i) => {
      if (!conferir) return true;
      const abaixo = ls.slice(i, i + 6).map((l) => semAcento(l.texto)).join(' ');
      return abaixo.includes(conferir);
    };
    for (const alvo of procurados) {
      let primeiro = null;
      // 1ª volta: a linha inteira contém o alvo; 2ª: o alvo começa nesta linha e
      // termina na seguinte (título quebrado em duas linhas)
      for (const juntar of [false, true]) {
        for (let i = 0; i < ls.length; i++) {
          const s = semAcento(ls[i].texto);
          let ok;
          if (!juntar) ok = s.includes(alvo.s);
          else {
            const s2 = s + ' ' + (ls[i + 1] ? semAcento(ls[i + 1].texto) : '');
            const pos = s2.indexOf(alvo.s);
            ok = pos >= 0 && pos < s.length && pos + alvo.s.length > s.length;
          }
          if (!ok) continue;
          if (alvo.titulo && s.length > alvo.s.length + 40) continue;   // a palavra estava no meio de um parágrafo
          const achado = { pagina: n, topo: ls[i].topo, poucoTexto: ls.length <= 3 };
          if (!alvo.titulo || confirma(i)) return achado;
          if (!primeiro) primeiro = achado;
        }
      }
      if (primeiro) return primeiro;
    }
  }
  return null;
}

function depois(a, b) {      // a vem depois de b?
  return a.pagina > b.pagina || (a.pagina === b.pagina && a.topo > b.topo + 2 * ESCALA);
}

async function desenharPagina(url, n) {
  const doc = await abrirDocumento(url);
  const pagina = await doc.getPage(n);
  const vp = pagina.getViewport({ scale: ESCALA });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width);
  c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}

/**
 * Gera o print do trecho.
 *  item: o trecho (da base protocolos-regulacao.json)
 *  vizinhos: os outros trechos do MESMO PDF (para saber onde este termina)
 *  url: endereço do PDF (sem #page)
 *  legenda: função (páginas) => texto da linha de fonte embaixo da imagem
 * Devolve { canvas, achou, paginas: [n...], cortado }
 */
export async function gerarPrintProtocolo({ item, vizinhos, url, legenda }) {
  const pad = 6 * ESCALA;
  const padTopo = 12 * ESCALA;     // pega a borda/faixa colorida em volta do título
  let inicio = await localizar(url, item);
  if (inicio && inicio.poucoTexto) inicio = null;   // fluxograma/anexo em imagem: página inteira

  // partes = [{ pagina, de, ate }] em pixels da página
  const partes = [];
  let cortado = false;
  let cabecalho = null;

  if (!inicio) {
    const est = await estruturaPagina(url, item.pagina);
    if (!est) throw new Error('Página ' + item.pagina + ' não existe no PDF.');
    partes.push({ pagina: item.pagina, de: 0, ate: est.altura, inteira: true });
  } else {
    // onde começa o próximo trecho
    const perto = vizinhos.filter((v) => v !== item && v.pagina >= inicio.pagina - 1 && v.pagina <= inicio.pagina + MAX_PAGINAS);
    let proximo = null;
    for (const v of perto) {
      const pos = await localizar(url, v);
      if (pos && depois(pos, inicio) && (!proximo || depois(proximo, pos))) proximo = pos;
    }
    let ultima = proximo ? proximo.pagina : inicio.pagina;
    if (ultima > inicio.pagina + MAX_PAGINAS - 1) { ultima = inicio.pagina + MAX_PAGINAS - 1; cortado = true; }

    for (let n = inicio.pagina; n <= ultima; n++) {
      const est = await estruturaPagina(url, n);
      if (!est || !est.corpo.length) continue;
      const topoCorpo = est.corpo[0].topo;
      const fimCorpo = est.corpo[est.corpo.length - 1].base;
      const de = n === inicio.pagina ? inicio.topo : topoCorpo;
      const ate = (proximo && n === proximo.pagina) ? proximo.topo : fimCorpo;
      if (ate - de < 8 * ESCALA) continue;                  // o próximo trecho começa no topo da página
      partes.push({ pagina: n, de: Math.max(0, de - padTopo), ate: Math.min(est.altura, ate + (ate === fimCorpo ? pad : -padTopo)) });
    }
    if (!partes.length) {
      const est = await estruturaPagina(url, inicio.pagina);
      partes.push({ pagina: inicio.pagina, de: 0, ate: est.altura });
    }

    // cabeçalho da primeira página (prefeitura / nº da página), se o protocolo tiver
    const est1 = await estruturaPagina(url, partes[0].pagina);
    if (est1 && est1.cab.length && partes[0].de > 0) {
      const topoCab = Math.min(...est1.cab.map((l) => l.topo));
      const fimCab = Math.max(...est1.cab.map((l) => l.base));
      const limite = est1.corpo.length ? est1.corpo[0].topo - 2 * ESCALA : fimCab + pad;
      cabecalho = { pagina: partes[0].pagina, de: Math.max(0, topoCab - 18 * ESCALA), ate: Math.min(limite, fimCab + 8 * ESCALA) };
      if (cabecalho.ate >= partes[0].de) cabecalho = null;  // o trecho já começa colado no cabeçalho
      else if (partes[0].de - cabecalho.ate < 20 * ESCALA) { partes[0].de = cabecalho.de; cabecalho = null; }
    }
  }

  // desenha as páginas e monta a imagem final
  const imagens = new Map();
  for (const p of [cabecalho, ...partes].filter(Boolean)) {
    if (!imagens.has(p.pagina)) imagens.set(p.pagina, await desenharPagina(url, p.pagina));
  }
  const largura = imagens.get(partes[0].pagina).width;
  const blocos = [cabecalho, ...partes].filter(Boolean);
  const separador = 10 * ESCALA;
  const alturaLegenda = legenda ? 26 * ESCALA : 0;
  const altura = blocos.reduce((s, b) => s + (b.ate - b.de), 0) + separador * (blocos.length - 1) + alturaLegenda;

  const final = document.createElement('canvas');
  final.width = largura;
  final.height = Math.ceil(altura);
  const ctx = final.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, final.width, final.height);

  let y = 0;
  blocos.forEach((b, i) => {
    const alt = b.ate - b.de;
    ctx.drawImage(imagens.get(b.pagina), 0, b.de, largura, alt, 0, y, largura, alt);
    y += alt;
    if (i < blocos.length - 1) {
      // linha tracejada: indica que um pedaço da página foi omitido / mudou de página
      ctx.save();
      ctx.strokeStyle = '#B8B8B8';
      ctx.setLineDash([6 * ESCALA, 4 * ESCALA]);
      ctx.lineWidth = ESCALA;
      ctx.beginPath();
      ctx.moveTo(40 * ESCALA, y + separador / 2);
      ctx.lineTo(largura - 40 * ESCALA, y + separador / 2);
      ctx.stroke();
      ctx.restore();
      y += separador;
    }
  });

  const paginasUsadas = [...new Set(partes.map((p) => p.pagina))];
  if (legenda) {
    const textoLegenda = legenda(paginasUsadas);
    ctx.fillStyle = '#F2F2F2';
    ctx.fillRect(0, y, largura, alturaLegenda);
    ctx.fillStyle = '#444';
    ctx.font = (9 * ESCALA) + 'px Arial, Helvetica, sans-serif';
    ctx.textBaseline = 'middle';
    let txt = textoLegenda;
    while (ctx.measureText(txt).width > largura - 30 * ESCALA && txt.length > 10) txt = txt.slice(0, -2);
    if (txt !== textoLegenda) txt = txt.slice(0, -1) + '…';
    ctx.fillText(txt, 15 * ESCALA, y + alturaLegenda / 2);
  }

  return { canvas: final, achou: !!inicio, paginaInteira: !!partes[0].inteira, paginas: paginasUsadas, cortado };
}

/** canvas -> Blob PNG */
export function canvasParaPng(canvas) {
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Não consegui gerar a imagem.'))), 'image/png'));
}

/** Imagem -> PDF de uma página do tamanho do recorte (mesma escala do protocolo). */
export async function pngParaPdf(PDFLib, blob, largura, altura) {
  const { PDFDocument } = PDFLib;
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
  const w = largura / ESCALA, hh = altura / ESCALA;
  const pagina = pdf.addPage([w, hh]);
  pagina.drawImage(png, { x: 0, y: 0, width: w, height: hh });
  return pdf.save();
}
