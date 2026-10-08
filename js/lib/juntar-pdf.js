/**
 * 📎 JUNTAR PDFs — tudo no navegador (pdf-lib), sem mandar nada para fora.
 *
 * Junta PDFs e fotos (JPG/PNG) num PDF único, na ordem recebida.
 * Cada foto vira uma página A4 (deitada se a foto for mais larga que alta).
 *
 * Uso: const bytes = await juntarPdfs(window.PDFLib, [
 *        { nome: 'espelho-sus.pdf', tipo: 'application/pdf', bytes },
 *        { nome: 'rg.jpg', tipo: 'image/jpeg', bytes } ]);
 */

export const A4 = { largura: 595.28, altura: 841.89, margem: 24 };

/** Cabe a imagem (l × a) dentro da caixa, sem distorcer. */
export function encaixar(l, a, caixaL, caixaA) {
  const escala = Math.min(caixaL / l, caixaA / a);
  return { largura: l * escala, altura: a * escala };
}

export function tipoParaJuntar(arquivo) {
  const t = String(arquivo.type || '').toLowerCase();
  const n = String(arquivo.name || '').toLowerCase();
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'application/pdf';
  if (t === 'image/png' || n.endsWith('.png')) return 'image/png';
  if (t === 'image/jpeg' || t === 'image/jpg' || /\.jpe?g$/.test(n)) return 'image/jpeg';
  return '';
}

export async function juntarPdfs(PDFLib, itens, opts = {}) {
  const { PDFDocument } = PDFLib;
  if (!itens || !itens.length) throw new Error('Escolha pelo menos um arquivo.');
  const saida = await PDFDocument.create();

  for (const item of itens) {
    try {
      if (item.tipo === 'application/pdf') {
        const doc = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
        const paginas = await saida.copyPages(doc, doc.getPageIndices());
        paginas.forEach((p) => saida.addPage(p));
      } else if (item.tipo === 'image/jpeg' || item.tipo === 'image/png') {
        const img = item.tipo === 'image/png' ? await saida.embedPng(item.bytes) : await saida.embedJpg(item.bytes);
        const deitada = img.width > img.height;
        const L = deitada ? A4.altura : A4.largura;
        const A = deitada ? A4.largura : A4.altura;
        const m = A4.margem;
        const t = encaixar(img.width, img.height, L - 2 * m, A - 2 * m);
        const pag = saida.addPage([L, A]);
        pag.drawImage(img, { x: (L - t.largura) / 2, y: (A - t.altura) / 2, width: t.largura, height: t.altura });
      } else {
        throw new Error('tipo não aceito (use PDF, JPG ou PNG)');
      }
    } catch (e) {
      throw new Error('Não consegui juntar "' + (item.nome || 'arquivo') + '": ' + (e.message || e));
    }
  }

  saida.setTitle(opts.titulo || 'Documentos');
  saida.setProducer('APAC digital');
  saida.setCreator('apacdigital.com.br');
  return await saida.save();
}

/** Nome do arquivo: 2026-10-08_NOME_DO_PACIENTE_DOCUMENTOS.pdf */
export function nomePdfUnico(paciente, data = new Date()) {
  const d = data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
  const nome = String(paciente || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return d + '_' + (nome ? nome + '_' : '') + 'DOCUMENTOS.pdf';
}
