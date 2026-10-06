/**
 * CADASTROS DA UNIDADE (antes: abas MEDICO_SUS, CNES_UBS e Referencia_SIGTAP).
 * Editar direto na tabela: cada célula grava ao sair dela.
 */
import * as dados from '../dados.js';
import { h, toast, confirmar } from '../ui.js';
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
    tr.appendChild(h('td', null,
      problema ? h('span', { title: problema }, '⚠️ ') : null,
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
