/**
 * 📎 JUNTAR PDFs (Ferramentas ▸ Juntar PDFs)
 *
 * Junta vários PDFs e fotos num PDF único, na ordem escolhida.
 * Tudo acontece no navegador: nenhum arquivo sai do computador,
 * não gasta IA e não ocupa espaço no Supabase.
 */
import { h, toast, alerta, comCarregando, lerArquivoBuffer, baixarPdf } from '../ui.js';
import { esc } from '../lib/texto.js';
import { juntarPdfs, tipoParaJuntar } from '../lib/juntar-pdf.js';

const LIMITE_MB = 80;

const ESTILO = `
.jp-zona { display: block; margin-top: 12px; border: 2px dashed #C9D3DE; border-radius: 8px; padding: 22px; text-align: center; background: #FAFBFC; cursor: pointer; }
.jp-zona.arrastando { border-color: var(--secundaria); background: var(--busca-fundo); }
.jp-zona input { display: none; }
.jp-lista { list-style: none; margin: 12px 0 0; padding: 0; }
.jp-lista li { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid #E3EBE9; border-radius: 6px; margin-bottom: 6px; background: #fff; }
.jp-lista .num { font-weight: 700; color: var(--primaria); min-width: 22px; }
.jp-lista .nome { flex: 1; overflow-wrap: anywhere; }
.jp-lista .tam { color: var(--suave); font-size: 12px; white-space: nowrap; }
.jp-lista button { border: 1px solid #C9D3DE; background: #fff; border-radius: 5px; cursor: pointer; padding: 2px 8px; font-size: 14px; }
.jp-lista button.tirar { color: var(--vermelho); }
`;

// ------------------------------------------------------------
// Ajudante usado também pela Conferência: arquivos → itens para juntar
// ------------------------------------------------------------

/** Foto grande do celular → JPEG menor (mantém legível e o PDF leve). */
async function fotoMenor(arquivo, tipo) {
  try {
    const img = await createImageBitmap(arquivo);
    const maior = Math.max(img.width, img.height);
    if (maior <= 2200 && tipo === 'image/jpeg') throw new Error('já pequena');
    const escala = Math.min(1, 2200 / maior);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    return { tipo: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) };
  } catch (e) {
    return { tipo, bytes: new Uint8Array(await lerArquivoBuffer(arquivo)) };
  }
}

export async function arquivosParaItens(arquivos) {
  const itens = [];
  for (const a of arquivos) {
    const tipo = tipoParaJuntar(a);
    if (!tipo) throw new Error('"' + a.name + '" não é PDF, JPG ou PNG.');
    if (tipo === 'application/pdf') itens.push({ nome: a.name, tipo, bytes: new Uint8Array(await lerArquivoBuffer(a)) });
    else itens.push({ nome: a.name, ...(await fotoMenor(a, tipo)) });
  }
  return itens;
}

// ------------------------------------------------------------
// TELA
// ------------------------------------------------------------
let arquivos = [];

export async function montar(area) {
  if (!document.getElementById('estilo-juntar')) document.head.appendChild(h('style', { id: 'estilo-juntar' }, ESTILO));
  arquivos = [];

  const lista = h('ul', { class: 'jp-lista' });
  const nome = h('input', { placeholder: 'ex.: MARIA_DA_SILVA_DOCUMENTOS', style: { width: '100%', maxWidth: '420px' } });
  const input = h('input', { type: 'file', multiple: true, accept: 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png' });
  const zona = h('label', { class: 'jp-zona' },
    h('div', { style: { fontSize: '28px' } }, '📄'),
    h('div', null, h('b', null, 'Escolha os arquivos'), ' ou arraste para cá'),
    h('div', { class: 'pequeno mudo' }, 'PDF, JPG ou PNG · pode escolher vários de uma vez'),
    input);

  const tamanho = (b) => b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const mover = (i, d) => { const j = i + d; if (j < 0 || j >= arquivos.length) return; [arquivos[i], arquivos[j]] = [arquivos[j], arquivos[i]]; desenhar(); };
  const desenhar = () => {
    lista.innerHTML = '';
    arquivos.forEach((a, i) => lista.appendChild(h('li', null,
      h('span', { class: 'num' }, (i + 1) + '.'),
      h('span', { class: 'nome' }, a.name),
      h('span', { class: 'tam' }, tamanho(a.size)),
      h('button', { type: 'button', title: 'Subir', onclick: () => mover(i, -1) }, '↑'),
      h('button', { type: 'button', title: 'Descer', onclick: () => mover(i, 1) }, '↓'),
      h('button', { type: 'button', class: 'tirar', title: 'Tirar da lista', onclick: () => { arquivos.splice(i, 1); desenhar(); } }, '×'))));
    if (!arquivos.length) lista.appendChild(h('p', { class: 'mudo pequeno' }, 'Nenhum arquivo escolhido ainda.'));
  };
  const adicionar = (novos) => {
    const ok = [];
    Array.from(novos || []).forEach((a) => {
      if (tipoParaJuntar(a)) ok.push(a); else toast('"' + a.name + '" não é PDF, JPG ou PNG.', 'Arquivo ignorado', 'aviso');
    });
    arquivos = arquivos.concat(ok);
    desenhar();
  };
  input.addEventListener('change', () => { adicionar(input.files); input.value = ''; });
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('arrastando'); adicionar(e.dataTransfer.files); });

  const montarBytes = async () => {
    if (!arquivos.length) throw new Error('Escolha pelo menos um arquivo.');
    const total = arquivos.reduce((s, a) => s + a.size, 0);
    if (total > LIMITE_MB * 1024 * 1024) throw new Error('O total dos arquivos passa de ' + LIMITE_MB + ' MB.');
    return await juntarPdfs(window.PDFLib, await arquivosParaItens(arquivos), { titulo: nome.value || 'Documentos' });
  };
  const baixar = async (botao) => {
    try {
      await comCarregando(botao, 'Juntando…', async () => baixarPdf(await montarBytes(), nomeArquivo()));
    } catch (e) { alerta('Não consegui juntar', esc(e.message)); }
  };
  const abrir = async (botao) => {
    if (!arquivos.length) { alerta('Falta algo', 'Escolha pelo menos um arquivo.'); return; }
    const janela = window.open('', '_blank');   // abre já no clique (senão o navegador bloqueia)
    if (!janela) { alerta('Janela bloqueada', 'O navegador bloqueou a nova aba. Permita janelas (pop-ups) para este site.'); return; }
    try {
      await comCarregando(botao, 'Juntando…', async () => {
        const url = URL.createObjectURL(new Blob([await montarBytes()], { type: 'application/pdf' }));
        janela.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
      });
    } catch (e) { janela.close(); alerta('Não consegui juntar', esc(e.message)); }
  };
  const nomeArquivo = () => {
    const n = String(nome.value || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\.pdf$/i, '');
    return (n || 'documentos_juntos') + '.pdf';
  };

  desenhar();
  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '📎 Juntar PDFs'),
      h('p', { class: 'mudo' }, 'Junta vários PDFs e fotos num arquivo só, na ordem da lista.'))),
    h('section', { class: 'card' },
      h('h2', null, 'Arquivos'),
      h('div', { class: 'card-conteudo' },
        h('div', { class: 'msg info', style: { marginTop: '0' } },
          '🔒 Tudo é feito aqui no seu computador: os documentos não são enviados para nenhum site e não gastam IA.'),
        zona, lista,
        h('div', { class: 'campo', style: { marginTop: '12px' } }, h('label', null, 'Nome do arquivo (opcional)'), nome),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
          h('button', { type: 'button', class: 'btn principal', onclick: (e) => baixar(e.currentTarget) }, '⬇️ Juntar e baixar PDF'),
          h('button', { type: 'button', class: 'btn', onclick: (e) => abrir(e.currentTarget) }, '🖨️ Juntar e abrir'),
          h('button', { type: 'button', class: 'btn', onclick: () => { arquivos = []; nome.value = ''; desenhar(); } }, 'Limpar lista')))));
}

export function desmontar() { arquivos = []; }
