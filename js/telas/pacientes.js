/**
 * PACIENTES (antes: aba PACIENTES) — buscar, corrigir, cadastrar e excluir.
 */
import * as dados from '../dados.js';
import { h, modal, confirmar, toast, atrasar, comCarregando } from '../ui.js';
import { esc, isoParaBR, brParaISO, mascararData } from '../lib/texto.js';
import { motivoCNSInvalido, validarCPF, soDigitos } from '../lib/validacao.js';

let pagina = 0;
let termo = '';
let corpoTabela, infoTotal, botoesPagina;

export async function montar(area) {
  pagina = 0; termo = '';
  const busca = h('input', { type: 'search', placeholder: 'Nome, Cartão SUS ou CPF', style: { minWidth: '280px' } });
  const recarregar = atrasar(() => { pagina = 0; termo = busca.value; carregar(); });
  busca.addEventListener('input', recarregar);

  corpoTabela = h('tbody');
  infoTotal = h('span', { class: 'mudo pequeno' });
  botoesPagina = h('div', { class: 'botoes' });

  area.append(
    h('div', { class: 'titulo-tela' },
      h('div', null, h('h1', null, '👤 Pacientes'), h('p', null, 'Cadastro de pacientes da unidade. Clique numa linha para corrigir.')),
      h('button', { class: 'btn principal', onclick: () => editar(null) }, '➕ Novo paciente')),
    h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
      h('div', { class: 'filtros' }, h('div', { class: 'campo' }, h('label', null, 'Buscar'), busca), infoTotal),
      h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, h('th', null, 'Nome'), h('th', null, 'Cartão SUS'), h('th', null, 'Nascimento'),
          h('th', null, 'CPF'), h('th', null, 'Telefone'))),
        corpoTabela)),
      h('div', { style: { marginTop: '10px' } }, botoesPagina))));
  busca.focus();
  await carregar();
}

async function carregar() {
  corpoTabela.innerHTML = '<tr><td colspan="5"><div class="carregando"><span class="spinner"></span>Carregando…</div></td></tr>';
  try {
    const r = await dados.listarPacientes(termo, pagina, 50);
    corpoTabela.innerHTML = '';
    if (!r.lista.length) corpoTabela.innerHTML = '<tr><td colspan="5" class="vazio-tabela">Nenhum paciente encontrado.</td></tr>';
    r.lista.forEach((p) => {
      const cnsRuim = p.cns && motivoCNSInvalido(p.cns);
      corpoTabela.appendChild(h('tr', { style: { cursor: 'pointer' }, onclick: () => editar(p.id) },
        h('td', null, h('strong', null, p.nome)),
        h('td', { title: cnsRuim || '' }, (p.cns || '—') + (cnsRuim ? ' ⚠️' : '')),
        h('td', null, isoParaBR(p.nascimento)),
        h('td', null, p.cpf || ''),
        h('td', null, p.telefone || '')));
    });
    infoTotal.textContent = r.total.toLocaleString('pt-BR') + ' paciente(s)';
    botoesPagina.innerHTML = '';
    const paginas = Math.ceil(r.total / 50);
    if (paginas > 1) {
      botoesPagina.append(
        h('button', { class: 'btn pequeno', disabled: pagina === 0, onclick: () => { pagina--; carregar(); } }, '← Anterior'),
        h('span', { class: 'mudo pequeno' }, 'Página ' + (pagina + 1) + ' de ' + paginas),
        h('button', { class: 'btn pequeno', disabled: pagina >= paginas - 1, onclick: () => { pagina++; carregar(); } }, 'Próxima →'));
    }
  } catch (e) {
    corpoTabela.innerHTML = '<tr><td colspan="5"><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
  }
}

const CAMPOS = [
  { k: 'nome', rot: 'Nome completo', largo: true },
  { k: 'cns', rot: 'Cartão SUS (CNS)', num: 15 },
  { k: 'cpf', rot: 'CPF', num: 11 },
  { k: 'nascimento', rot: 'Data de nascimento', data: true },
  { k: 'sexo', rot: 'Sexo', lista: ['', 'Masculino', 'Feminino'] },
  { k: 'nome_mae', rot: 'Nome da mãe', largo: true },
  { k: 'telefone', rot: 'Telefone (com DDD)', num: 11 },
  { k: 'cep', rot: 'CEP', num: 8 },
  { k: 'numero', rot: 'Número' },
  { k: 'complemento', rot: 'Complemento' },
  { k: 'prontuario', rot: 'Nº prontuário' }
];

async function editar(id) {
  let p = { nome: '', cns: '', cpf: '', nascimento: null, sexo: '', nome_mae: '', telefone: '', cep: '', numero: '', complemento: '', prontuario: '' };
  if (id) p = await dados.pacientePorId(id);

  const ent = {};
  const status = h('div');
  const grade = h('div', { class: 'form-simples' }, ...CAMPOS.map((c) => {
    let el;
    const valor = c.data ? isoParaBR(p[c.k]) : (p[c.k] || '');
    if (c.lista) el = h('select', null, ...c.lista.map((o) => h('option', { value: o, selected: o === valor }, o || '—')));
    else el = h('input', { type: 'text', value: valor, maxlength: c.data ? 10 : (c.num || null), inputmode: c.num || c.data ? 'numeric' : null });
    if (c.data) el.addEventListener('input', () => { el.value = mascararData(el.value); });
    if (c.num) el.addEventListener('input', () => { el.value = soDigitos(el.value).substring(0, c.num); });
    ent[c.k] = el;
    return h('div', { class: 'campo', style: c.largo ? { gridColumn: '1 / -1' } : null }, h('label', null, c.rot), el);
  }));

  const janela = modal({
    titulo: id ? '✏️ Corrigir paciente' : '➕ Novo paciente',
    largura: 640,
    conteudo: h('div', null, grade, status),
    botoes: [
      ...(id ? [{ texto: '🗑️ Excluir', classe: 'perigo', acao: async (fechar) => {
        if (!await confirmar('Excluir paciente', 'Excluir <b>' + esc(p.nome) + '</b> do cadastro? Isso não pode ser desfeito.', { sim: 'Excluir', perigo: true })) return;
        try { await dados.excluirPaciente(id); fechar(); toast(p.nome, '🗑️ Excluído'); carregar(); }
        catch (e) { status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; }
      } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Salvar', classe: 'principal', acao: async (fechar) => {
        const novo = { id };
        CAMPOS.forEach((c) => { novo[c.k] = ent[c.k].value.trim(); });
        const avisos = [];
        if (!novo.nome) { status.innerHTML = '<div class="msg erro">Digite o nome.</div>'; return; }
        if (novo.nascimento) {
          const iso = brParaISO(novo.nascimento);
          if (!iso) { status.innerHTML = '<div class="msg erro">Data de nascimento inválida (use dd/mm/aaaa).</div>'; return; }
          novo.nascimento = iso;
        } else novo.nascimento = null;
        if (novo.cns && motivoCNSInvalido(novo.cns)) avisos.push('Cartão SUS ' + motivoCNSInvalido(novo.cns));
        if (novo.cpf && !validarCPF(novo.cpf)) avisos.push('CPF com dígito errado');
        if (avisos.length && !await confirmar('⚠️ Conferir', 'Atenção: ' + esc(avisos.join(' · ')) + '.<br>Salvar mesmo assim?', { sim: 'Salvar mesmo assim' })) return;
        const botao = janela.el.querySelector('.modal-rodape .principal');
        await comCarregando(botao, 'Salvando…', async () => {
          try { await dados.salvarPaciente(novo); fechar(); toast(novo.nome.toUpperCase(), '✅ Paciente salvo'); carregar(); }
          catch (e) { status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; }
        });
      } }
    ]
  });
}
