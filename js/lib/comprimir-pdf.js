/**
 * 🗜️ COMPRIMIR EXAMES — tudo no navegador (pdf.js + pdf-lib), sem mandar nada para fora.
 *
 * Por que precisa: o CELK não aceita anexo maior que 20 MB, e exames
 * escaneados com muitas folhas passam disso fácil.
 *
 * Como funciona:
 *  1º junta tudo num PDF só (PDFs e fotos, na ordem escolhida);
 *  2º se já ficou dentro do limite, entrega assim mesmo (sem perder qualidade);
 *  3º se passou, "refotografa" cada página numa resolução menor (JPEG) e monta
 *     um PDF novo. Tenta do nível mais bonito para o mais leve, até caber.
 *
 * O texto das páginas vira imagem (não dá mais para selecionar), mas continua
 * legível — é o mesmo que o iLovePDF faz na compressão forte.
 *
 * Uso: const r = await comprimirExames(window.PDFLib, itens, { limiteMB: 19, aoProgredir });
 *      r = { bytes, mbAntes, mbDepois, coube, nivel, paginas }
 */
import { juntarPdfs } from './juntar-pdf.js';

/** Limite do CELK é 20 MB; miramos um pouco abaixo para não ficar no fio. */
export const LIMITE_EXAMES_MB = 19;

/** Do mais bonito para o mais leve. dpi = resolução da página; q = qualidade do JPEG. */
export const NIVEIS = [
  { nome: 'boa',     dpi: 150, q: 0.75 },
  { nome: 'média',   dpi: 120, q: 0.65 },
  { nome: 'leve',    dpi: 100, q: 0.55 },
  { nome: 'mínima',  dpi: 80,  q: 0.50 }
];

const MAIOR_LADO_PX = 2600;   // trava de segurança para páginas enormes (plantas, A3…)

let pdfjsPromessa = null;
async function carregarPdfjs() {
  if (!pdfjsPromessa) {
    const base = new URL('../../vendor/pdfjs/', import.meta.url);
    pdfjsPromessa = import(new URL('pdf.min.mjs', base).href).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', base).href;
      return pdfjs;
    });
  }
  return pdfjsPromessa;
}

export const mb = (n) => n / 1048576;

/** 12.345 → "12,3 MB" */
export function textoMB(bytesOuMb, jaEmMb = false) {
  const v = jaEmMb ? bytesOuMb : mb(bytesOuMb);
  return v.toFixed(1).replace('.', ',') + ' MB';
}

/** Desenha uma página do pdf.js num canvas e devolve os bytes do JPEG + o tamanho da página em pontos. */
async function paginaParaJpeg(pagina, nivel) {
  const base = pagina.getViewport({ scale: 1 });           // 1 = 72 dpi (pontos do PDF)
  let escala = nivel.dpi / 72;
  const maior = Math.max(base.width, base.height) * escala;
  if (maior > MAIOR_LADO_PX) escala *= MAIOR_LADO_PX / maior;
  const vista = pagina.getViewport({ scale: escala });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vista.width));
  canvas.height = Math.max(1, Math.round(vista.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';                                   // JPEG não tem transparência: fundo branco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;

  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', nivel.q));
  canvas.width = 0; canvas.height = 0;                      // libera a memória já
  if (!blob) throw new Error('o navegador não conseguiu gerar a imagem da página');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), largura: base.width, altura: base.height };
}

/** Refaz o PDF inteiro num nível de compressão. */
async function refazerPdf(PDFLib, doc, nivel, aoProgredir, titulo) {
  const saida = await PDFLib.PDFDocument.create();
  for (let n = 1; n <= doc.numPages; n++) {
    if (aoProgredir) aoProgredir('Comprimindo (' + nivel.nome + ')… página ' + n + ' de ' + doc.numPages);
    const pagina = await doc.getPage(n);
    const p = await paginaParaJpeg(pagina, nivel);
    pagina.cleanup();
    const img = await saida.embedJpg(p.jpeg);
    const pag = saida.addPage([p.largura, p.altura]);
    pag.drawImage(img, { x: 0, y: 0, width: p.largura, height: p.altura });
  }
  saida.setTitle(titulo || 'Exames');
  saida.setProducer('APAC digital');
  saida.setCreator('apacdigital.com.br');
  return await saida.save();
}

/**
 * itens: [{ nome, tipo, bytes }] (o mesmo formato do juntarPdfs).
 * opts: { limiteMB, titulo, mbAntes (tamanho original somado), aoProgredir(texto) }
 */
export async function comprimirExames(PDFLib, itens, opts = {}) {
  const limite = (opts.limiteMB || LIMITE_EXAMES_MB) * 1048576;
  const aviso = opts.aoProgredir || null;
  const titulo = opts.titulo || 'Exames';

  if (aviso) aviso('Juntando os exames…');
  const junto = await juntarPdfs(PDFLib, itens, { titulo });
  const mbAntes = opts.mbAntes != null ? opts.mbAntes : mb(itens.reduce((s, i) => s + (i.bytes ? i.bytes.length : 0), 0));

  // já cabe? entrega sem mexer na qualidade
  if (junto.length <= limite) {
    const doc = await PDFLib.PDFDocument.load(junto);
    return { bytes: junto, mbAntes, mbDepois: mb(junto.length), coube: true, nivel: 'original', paginas: doc.getPageCount() };
  }

  const pdfjs = await carregarPdfjs();
  const doc = await pdfjs.getDocument({ data: junto.slice(), isEvalSupported: false }).promise;
  const paginas = doc.numPages;
  let menor = null;
  try {
    for (const nivel of NIVEIS) {
      const bytes = await refazerPdf(PDFLib, doc, nivel, aviso, titulo);
      if (!menor || bytes.length < menor.bytes.length) menor = { bytes, nivel: nivel.nome };
      if (bytes.length <= limite) break;
    }
  } finally {
    doc.destroy();
  }
  return {
    bytes: menor.bytes,
    mbAntes,
    mbDepois: mb(menor.bytes.length),
    coube: menor.bytes.length <= limite,
    nivel: menor.nivel,
    paginas
  };
}

/** Nome do arquivo: exames_BIANCA_ALMEIDA_08-10-2026.pdf */
export function nomePdfExames(nomeSobrenome, data = new Date()) {
  const d = String(data.getDate()).padStart(2, '0') + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + data.getFullYear();
  return 'exames_' + (nomeSobrenome ? nomeSobrenome + '_' : '') + d + '.pdf';
}
