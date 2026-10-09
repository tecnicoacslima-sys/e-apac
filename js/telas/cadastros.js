/**
 * CADASTROS DA UNIDADE (antes: abas MEDICO_SUS, CNES_UBS e Referencia_SIGTAP).
 * Editar direto na tabela: cada célula grava ao sair dela.
 */
import * as dados from '../dados.js';
import { h, toast, confirmar, modal, alerta, comCarregando } from '../ui.js';
import { esc, codigoSigtap10 } from '../lib/texto.js';
import { motivoDocProfissional, soDigitos } from '../lib/validacao.js';

const TABELAS = {
  profissionais: {
    titulo: '👨‍⚕️ Profissionais (médicos)',
    dica: 'O Nº é o que se digita no campo PROFISSIONAL SOLICITANTE. O documento é o Cartão SUS (15 dígitos) ou o CPF (11).',
    carregar: dados.listarProfissionais,
    colunas: [
      { k: 'numero', rot: 'Nº', larg: '60px', num: true },
      { k: 'nome', rot: 'Nome', larg: '320px', maiusc: true },
      { k: 'documento', rot: 'Cartão SUS ou CPF', larg: '170px', digitos: 15 }
    ],
    novo: (lista) => ({ numero: lista.reduce((m, l) => Math.max(m, l.numero || 0), 0) + 1, nome: '', documento: '' }),
    conferir: (l) => {
      const d = soDigitos(l.documento);
      if (!d) return '';
      return motivoDocProfissional(d.length === 11 ? 'CPF' : 'CNS', d);
    }
  },
  estabelecimentos: {
    titulo: '🏥 Estabelecimentos (CNES)',
    dica: 'CNES com 7 dígitos. O nome aparece sozinho no formulário ao digitar o CNES.',
    carregar: dados.listarEstabelecimentos,
    colunas: [
      { k: 'cnes', rot: 'CNES', larg: '110px', digitos: 7 },
      { k: 'nome', rot: 'Nome do estabelecimento', larg: '420px', maiusc: true }
    ],
    novo: () => ({ cnes: '', nome: '' }),
    antesDeSalvar: (l) => { if (l.cnes) l.cnes = soDigitos(l.cnes).padStart(7, '0'); }
  },
  referencia_sigtap: {
    titulo: '📚 Referência SIGTAP',
    dica: 'Procedimento como aparece nos laudos → código SIGTAP. Usada pelo botão ② para sugerir e conferir o código.',
    carregar: dados.listarReferencia,
    colunas: [
      { k: 'procedimento', rot: 'Procedimento', larg: '260px', maiusc: true },
      { k: 'codigo', rot: 'Código', larg: '110px', digitos: 10 },
      { k: 'cids', rot: 'CIDs observados', larg: '170px', lista: true },
      { k: 'confianca', rot: 'Confiança', larg: '120px' },
      { k: 'nome_oficial', rot: 'Nome oficial SIGTAP', larg: '260px' },
      { k: 'observacao', rot: 'Observação', larg: '200px' }
    ],
    novo: () => ({ procedimento: '', codigo: '', cids: [], confianca: '', nome_oficial: '', observacao: '' }),
    antesDeSalvar: (l) => { if (l.codigo) l.codigo = codigoSigtap10(l.codigo); }
  }
};

export async function montar(area) {
  const conteudo = h('div');
  const abas = h('div', { class: 'abas' });
  const abrir = (qual) => {
    abas.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === qual));
    conteudo.innerHTML = '';
    montarTabela(conteudo, qual);
  };
  Object.entries(TABELAS).forEach(([k, t]) => abas.appendChild(h('button', { 'data-aba': k, onclick: () => abrir(k) }, t.titulo)));
  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null, h('h1', null, '🗂️ Cadastros da unidade'),
      h('p', null, 'Os profissionais e os CNES também são aprendidos sozinhos quando você salva no Protocolo.'))),
    abas, conteudo);
  abrir('profissionais');
}

async function montarTabela(area, chave) {
  const t = TABELAS[chave];
  const corpo = h('tbody');
  const filtro = h('input', { type: 'search', placeholder: 'Filtrar…' });
  let lista = [];

  const desenhar = () => {
    const f = filtro.value.trim().toUpperCase();
    corpo.innerHTML = '';
    const visiveis = lista.filter((l) => !f || t.colunas.some((c) => String(Array.isArray(l[c.k]) ? l[c.k].join(',') : (l[c.k] ?? '')).toUpperCase().includes(f)));
    if (!visiveis.length) corpo.innerHTML = '<tr><td colspan="' + (t.colunas.length + 1) + '" class="vazio-tabela">Nada cadastrado.</td></tr>';
    visiveis.forEach((l) => corpo.appendChild(linha(l)));
  };

  const linha = (l) => {
    const problema = t.conferir ? t.conferir(l) : '';
    const tr = h('tr', { title: problema || '' });
    t.colunas.forEach((c) => {
      const valor = c.lista ? (l[c.k] || []).join(', ') : (l[c.k] ?? '');
      const inp = h('input', { class: 'celula', value: valor, style: { width: c.larg, textTransform: c.maiusc ? 'uppercase' : 'none' },
                               inputmode: c.num || c.digitos ? 'numeric' : null, maxlength: c.digitos || null });
      if (c.digitos || c.num) inp.addEventListener('input', () => { inp.value = soDigitos(inp.value); });
      inp.addEventListener('change', async () => {
        const novo = { ...l };
        let v = inp.value.trim();
        if (c.maiusc) v = v.toUpperCase();
        if (c.num) v = parseInt(v, 10) || null;
        if (c.lista) v = v.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
        novo[c.k] = v;
        if (t.antesDeSalvar) t.antesDeSalvar(novo);
        if (!obrigatoriosOk(chave, novo)) {
          // linha nova ainda incompleta: guarda o que já foi digitado e espera o resto
          if (!l.id) Object.assign(l, novo);
          else { toast('Esse campo não pode ficar vazio.', 'Atenção', 'aviso'); inp.value = valor; }
          return;
        }
        try {
          const salvo = await dados.salvarCadastro(chave, novo);
          Object.assign(l, salvo);
          toast('Salvo.', '', 'ok', 2);
          tr.replaceWith(linha(l));
        } catch (e) {
          toast(e.message, '❌ Erro', 'erro');
          inp.value = valor;
        }
      });
      tr.appendChild(h('td', null, inp));
    });
    tr.appendChild(h('td', { style: { whiteSpace: 'nowrap' } },
      problema ? h('span', { title: problema }, '⚠️ ') : null,
      chave === 'profissionais' && l.id ? h('button', {
        class: 'btn pequeno' + (l.assinatura_path ? ' assinado' : ''),
        title: l.assinatura_path ? 'Carimbo e assinatura cadastrados (clique para ver ou trocar)' : 'Cadastrar carimbo e assinatura',
        onclick: () => abrirAssinatura(l, () => tr.replaceWith(linha(l)))
      }, l.assinatura_path ? '✍️ ✅' : '✍️') : null, ' ',
      l.id ? h('button', { class: 'btn pequeno link', title: 'Excluir', onclick: async () => {
        if (!await confirmar('Excluir', 'Excluir esta linha do cadastro?', { sim: 'Excluir', perigo: true })) return;
        try { await dados.excluirCadastro(chave, l.id); lista = lista.filter((x) => x !== l); desenhar(); }
        catch (e) { toast(e.message, '❌ Erro', 'erro'); }
      } }, '🗑️') : null));
    return tr;
  };

  filtro.addEventListener('input', desenhar);
  area.append(h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
    h('p', { class: 'mudo pequeno', style: { marginTop: 0 } }, t.dica),
    h('div', { class: 'filtros' },
      h('div', { class: 'campo' }, h('label', null, 'Filtrar'), filtro),
      h('button', { class: 'btn principal', onclick: () => abrirNovo() }, '➕ Adicionar')),
    h('div', { class: 'tabela-rolagem', style: { maxHeight: '65vh' } }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, ...t.colunas.map((c) => h('th', null, c.rot)), h('th', null, ''))),
      corpo)))));

  // "Adicionar" cria uma linha em branco no topo; ela só vai para o banco quando os campos obrigatórios forem preenchidos
  function abrirNovo() {
    const l = t.novo(lista);
    lista.unshift(l);
    filtro.value = '';
    desenhar();
    const primeiro = corpo.querySelector('input');
    if (primeiro) primeiro.focus();
  }

  corpo.innerHTML = '<tr><td><div class="carregando"><span class="spinner"></span>Carregando…</div></td></tr>';
  try {
    lista = await t.carregar();
    desenhar();
  } catch (e) {
    corpo.innerHTML = '<tr><td><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
  }
}

function obrigatoriosOk(chave, l) {
  if (chave === 'profissionais') return !!(l.nome && l.numero);
  if (chave === 'estabelecimentos') return /^\d{7}$/.test(l.cnes || '') && !!l.nome;
  if (chave === 'referencia_sigtap') return !!l.procedimento && /^\d{10}$/.test(l.codigo || '');
  return true;
}

// ============================================================
// ✍️ CARIMBO E ASSINATURA DO PROFISSIONAL (para "Gerar com QR Code e assinatura")
// ============================================================

/** Foto/scan → PNG com fundo transparente, sem bordas brancas, até 1000×400 px. */
async function prepararAssinatura(arquivo) {
  const img = await createImageBitmap(arquivo);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const claro = Math.min(px[i], px[i + 1], px[i + 2]);
      if (px[i + 3] < 20 || claro > 225) { px[i + 3] = 0; continue; }       // fundo branco → transparente
      if (claro > 180) px[i + 3] = Math.round(px[i + 3] * (225 - claro) / 45); // borda suave
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('A imagem parece estar em branco.');
  ctx.putImageData(d, 0, 0);
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(c.width - 1, x1 + m); y1 = Math.min(c.height - 1, y1 + m);
  const w = x1 - x0 + 1, a = y1 - y0 + 1;
  const escala = Math.min(1, 1000 / w, 400 / a);
  const out = document.createElement('canvas');
  out.width = Math.round(w * escala); out.height = Math.round(a * escala);
  out.getContext('2d').drawImage(c, x0, y0, w, a, 0, 0, out.width, out.height);
  const blob = await new Promise((ok) => out.toBlob(ok, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), url: out.toDataURL('image/png') };
}

async function abrirAssinatura(prof, aoMudar) {
  const u = dados.sessao.unidade;
  const quem = (dados.sessao.perfil && (dados.sessao.perfil.nome || dados.sessao.perfil.email)) || '';
  let nova = null;
  const previa = h('div', { class: 'assinatura-previa' }, h('span', { class: 'mudo pequeno' }, 'Carregando…'));
  const mostrar = (url, legenda) => {
    previa.innerHTML = '';
    previa.append(url ? h('img', { src: url, alt: 'Carimbo e assinatura' }) : h('span', { class: 'mudo pequeno' }, 'Nenhuma imagem cadastrada.'),
      legenda ? h('div', { class: 'pequeno mudo' }, legenda) : '');
  };
  if (prof.assinatura_path) {
    dados.linkTemporario('logos', prof.assinatura_path, 300)
      .then((url) => mostrar(url, prof.assinatura_autorizada_em
        ? 'Autorizado em ' + new Date(prof.assinatura_autorizada_em).toLocaleDateString('pt-BR') + (prof.assinatura_autorizada_por ? ' por ' + prof.assinatura_autorizada_por : '')
        : ''))
      .catch(() => mostrar('', ''));
  } else mostrar('', '');

  const arquivo = h('input', { type: 'file', accept: 'image/png,image/jpeg' });
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('A imagem passa de 8 MB.', 'Atenção', 'aviso'); return; }
    try {
      nova = await prepararAssinatura(f);
      mostrar(nova.url, 'Nova imagem (fundo branco removido). Clique em Salvar.');
    } catch (e) { nova = null; toast(e.message, '❌ Imagem', 'erro'); }
  });
  const autorizo = h('input', { type: 'checkbox' });

  const janela = modal({
    titulo: '✍️ Carimbo e assinatura · ' + prof.nome,
    largura: 600,
    conteudo: h('div', null,
      h('p', { style: { marginTop: 0 } }, 'Usados no botão ', h('b', null, '🔳 ✍️ Gerar com QR Code e assinatura'),
        ', no campo "Assinatura e carimbo" do profissional solicitante.'),
      previa,
      h('div', { class: 'campo', style: { marginTop: '10px' } },
        h('label', null, 'Escolher imagem (PNG ou JPG)'), arquivo,
        h('div', { class: 'pequeno mudo' }, 'Dica: carimbe e assine numa folha branca, fotografe de perto, bem reto e com boa luz (ou escaneie). O fundo branco é removido sozinho.')),
      h('label', { class: 'assinatura-autorizo' }, autorizo,
        h('span', null, 'Confirmo que ', h('b', null, prof.nome), ' autorizou o uso desta imagem de carimbo e assinatura nas APACs geradas por esta unidade.')),
      h('div', { class: 'msg aviso pequeno' }, 'A imagem não substitui a assinatura digital com certificado (ICP-Brasil). Use apenas com a autorização do profissional e conforme as regras da regulação do seu município.')),
    botoes: [
      { texto: 'Cancelar' },
      ...(prof.assinatura_path ? [{ texto: '🗑️ Remover', acao: async (fechar) => {
        if (!await confirmar('Remover', 'Remover o carimbo e a assinatura de ' + esc(prof.nome) + '?', { sim: 'Remover', perigo: true })) return;
        try {
          const antigo = prof.assinatura_path;
          const salvo = await dados.salvarCadastro('profissionais', { id: prof.id, assinatura_path: null, assinatura_autorizada_em: null, assinatura_autorizada_por: null });
          Object.assign(prof, salvo);
          dados.sb.storage.from('logos').remove([antigo]).catch(() => {});
          toast('Carimbo e assinatura removidos.', '✍️ ' + prof.nome);
          fechar(); aoMudar();
        } catch (e) { alerta('Não removeu', esc(e.message)); }
      } }] : []),
      { texto: '💾 Salvar', classe: 'principal', acao: async (fechar) => {
        if (!nova) { toast('Escolha a imagem do carimbo e assinatura.', 'Atenção', 'aviso'); return; }
        if (!autorizo.checked) { toast('Marque a confirmação de que o profissional autorizou.', 'Atenção', 'aviso'); return; }
        const botao = janela.el.querySelector('.modal-rodape .principal');
        try {
          await comCarregando(botao, 'Salvando…', async () => {
            const antigo = prof.assinatura_path;
            const caminho = u.id + '/assinaturas/prof_' + prof.id + '_' + Date.now() + '.png';
            await dados.substituirArquivo('logos', caminho, nova.bytes, 'image/png');
            const salvo = await dados.salvarCadastro('profissionais', { id: prof.id, assinatura_path: caminho,
              assinatura_autorizada_em: new Date().toISOString(), assinatura_autorizada_por: quem });
            Object.assign(prof, salvo);
            if (antigo && antigo !== caminho) dados.sb.storage.from('logos').remove([antigo]).catch(() => {});
          });
          toast('Carimbo e assinatura salvos.', '✍️ ' + prof.nome);
          fechar(); aoMudar();
        } catch (e) { alerta('Não salvou', esc(e.message)); }
      } }
    ]
  });
}
