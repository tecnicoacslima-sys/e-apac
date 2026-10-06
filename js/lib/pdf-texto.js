/**
 * Tira o texto de um PDF no próprio navegador (pdf.js), de graça.
 * Substitui o OCR do Google Drive para PDFs gerados por sistema
 * (como o Espelho CELK). PDF escaneado (só imagem) devolve pouco ou
 * nenhum texto — nesse caso quem chama usa a IA.
 *
 * O texto é remontado linha por linha (agrupando pedaços pela altura
 * na página), para ficar parecido com o que o OCR devolvia: as regras
 * do Espelho procuram "Paciente: ... até o fim da linha".
 */

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

/**
 * Junta os pedaços de texto em linhas.
 * itens: [{ str, x, y, h }] — y cresce para cima (padrão PDF).
 */
export function montarLinhas(itens) {
  const validos = itens.filter((i) => i.str && i.str.trim() !== '');
  validos.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const linhas = [];
  for (const it of validos) {
    const tol = Math.max(2, (it.h || 10) * 0.45);
    let linha = linhas.find((l) => Math.abs(l.y - it.y) <= tol);
    if (!linha) {
      linha = { y: it.y, itens: [] };
      linhas.push(linha);
    }
    linha.itens.push(it);
  }
  linhas.sort((a, b) => b.y - a.y);

  return linhas.map((l) => {
    l.itens.sort((a, b) => a.x - b.x);
    let texto = '';
    let fimAnterior = null;
    for (const it of l.itens) {
      if (fimAnterior !== null) {
        const espaco = it.x - fimAnterior;
        // pedaços colados ficam colados; separados ganham um espaço
        if (espaco > Math.max(1, (it.h || 10) * 0.15) && !texto.endsWith(' ') && !it.str.startsWith(' ')) texto += ' ';
      }
      texto += it.str;
      fimAnterior = it.x + (it.w || 0);
    }
    return texto.replace(/\s+/g, ' ').trim();
  }).join('\n');
}

/**
 * Devolve { texto, paginas, temTexto }.
 * temTexto = false quando o PDF parece ser só imagem.
 */
export async function extrairTextoPdf(arrayBuffer) {
  const pdfjs = await carregarPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), isEvalSupported: false }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    const itens = conteudo.items.map((i) => ({
      str: i.str,
      x: i.transform[4],
      y: i.transform[5],
      w: i.width,
      h: i.height || Math.abs(i.transform[3]) || 10
    }));
    paginas.push(montarLinhas(itens));
  }
  const texto = paginas.join('\n');
  return { texto, paginas: doc.numPages, temTexto: texto.replace(/\s/g, '').length > 40 };
}
