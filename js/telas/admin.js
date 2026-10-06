/**
 * ADMIN (só você) — antes: planilha PAINEL_CONSUMO_IA.
 *   Unidades (ativo, limite, código para planilha antiga)
 *   Usuários (convidar, ligar à unidade, papel)
 *   Consumo por mês e unidade + preços / margem / câmbio
 * As faturas em PDF chegam na etapa 3.
 */
import * as dados from '../dados.js';
import { h, toast, modal, confirmar, comCarregando } from '../ui.js';
import { esc, fmtNum, rotuloMes, partesData } from '../lib/texto.js';

export async function montar(area) {
  const conteudo = h('div');
  const abas = h('div', { class: 'abas' });
  const abrir = (qual) => {
    abas.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === qual));
    conteudo.innerHTML = '';
    ({ unidades: abaUnidades, usuarios: abaUsuarios, consumo: abaConsumo })[qual](conteudo);
  };
  [['unidades', '🏥 Unidades'], ['usuarios', '👥 Usuários'], ['consumo', '📊 Consumo e preços']]
    .forEach(([k, r]) => abas.appendChild(h('button', { 'data-aba': k, onclick: () => abrir(k) }, r)));
  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null, h('h1', null, '🛡️ Administração'),
      h('p', null, 'Você vê e mexe nas unidades, usuários e consumo. Pacientes de outras unidades continuam invisíveis para você (LGPD).'))),
    abas, conteudo);
  abrir('unidades');
}

// ============================================================
// UNIDADES
// ============================================================
async function abaUnidades(area) {
  const corpo = h('tbody');
  const p = partesData();
  const mesAtual = p.ano + '-' + p.mes;

  const carregar = async () => {
    corpo.innerHTML = '<tr><td colspan="6"><div class="carregando"><span class="spinner"></span>Carregando…</div></td></tr>';
    try {
      const [unidades, resumo] = await Promise.all([dados.listarUnidades(), dados.resumoConsumo()]);
      const tokensMes = new Map(resumo.filter((r) => r.mes === mesAtual)
        .map((r) => [r.unidade_id, Number(r.tokens_entrada) + Number(r.tokens_saida)]));
      corpo.innerHTML = '';
      unidades.forEach((u) => {
        const usado = tokensMes.get(u.id) || 0;
        const limite = h('input', { class: 'celula', value: u.limite_mensal_tokens || '', placeholder: 'sem limite', style: { width: '120px' }, inputmode: 'numeric' });
        limite.addEventListener('change', async () => {
          const v = parseInt(limite.value.replace(/\D/g, ''), 10) || null;
          try { await dados.atualizarUnidade(u.id, { limite_mensal_tokens: v }); toast('Limite salvo.', u.nome, 'ok', 3); }
          catch (e) { toast(e.message, '❌', 'erro'); }
        });
        const ativo = h('input', { type: 'checkbox', checked: u.ativo, onchange: async (e) => {
          try { await dados.atualizarUnidade(u.id, { ativo: e.target.checked }); toast(e.target.checked ? 'IA ligada.' : 'IA desligada.', u.nome, 'ok', 3); }
          catch (err) { toast(err.message, '❌', 'erro'); e.target.checked = !e.target.checked; }
        } });
        corpo.appendChild(h('tr', null,
          h('td', null, h('strong', null, u.nome), h('div', { class: 'mudo pequeno' }, [u.municipio, u.uf].filter(Boolean).join('/'))),
          h('td', { class: 'centro' }, ativo),
          h('td', null, limite),
          h('td', { class: 'num' }, fmtNum(usado)),
          h('td', null, u.codigo_hash ? '✔ tem código' : h('span', { class: 'mudo' }, '—')),
          h('td', { class: 'direita' }, h('button', { class: 'btn pequeno', onclick: () => gerarCodigo(u) }, '🔑 Código p/ planilha antiga'))));
      });
    } catch (e) {
      corpo.innerHTML = '<tr><td colspan="6"><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
    }
  };

  area.append(h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
    h('div', { class: 'botoes', style: { marginBottom: '10px' } },
      h('button', { class: 'btn principal', onclick: () => novaUnidade(carregar) }, '➕ Nova unidade')),
    h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, h('th', null, 'Unidade'), h('th', { class: 'centro' }, 'IA ligada'),
        h('th', null, 'Limite mensal (tokens)'), h('th', { class: 'num' }, 'Usado no mês'), h('th', null, 'Planilha antiga'), h('th', null, ''))),
      corpo)),
    h('p', { class: 'mudo pequeno' }, 'Referência: uma Conferência de Espelhos com 4 documentos usa cerca de 14 mil tokens.'))));
  carregar();
}

async function novaUnidade(aoCriar) {
  const unidades = await dados.listarUnidades();
  const nome = h('input');
  const municipio = h('input', { value: dados.sessao.unidade.municipio });
  const uf = h('input', { value: dados.sessao.unidade.uf, maxlength: 2, style: { textTransform: 'uppercase' } });
  const limite = h('input', { placeholder: 'em branco = sem limite', inputmode: 'numeric' });
  const copiar = h('select', null, h('option', { value: '' }, '— não copiar —'),
    ...unidades.map((u) => h('option', { value: u.id, selected: u.id === dados.sessao.unidade.id }, u.nome)));
  const status = h('div');
  const janela = modal({
    titulo: '➕ Nova unidade',
    conteudo: h('div', null,
      h('div', { class: 'campo' }, h('label', null, 'Nome da unidade'), nome),
      h('div', { class: 'form-simples', style: { gridTemplateColumns: '1fr 80px' } },
        h('div', { class: 'campo' }, h('label', null, 'Município'), municipio),
        h('div', { class: 'campo' }, h('label', null, 'UF'), uf)),
      h('div', { class: 'campo' }, h('label', null, 'Limite mensal de tokens'), limite),
      h('div', { class: 'campo' }, h('label', null, 'Copiar CNES, profissionais e Referência SIGTAP de'), copiar),
      status),
    botoes: [{ texto: 'Cancelar' }, { texto: 'Criar', classe: 'principal', acao: async (fechar) => {
      const btn = janela.el.querySelector('.modal-rodape .principal');
      await comCarregando(btn, 'Criando…', async () => {
        try {
          await dados.criarUnidade({ nome: nome.value.trim(), municipio: municipio.value.trim(), uf: uf.value.trim().toUpperCase(),
            limite: parseInt(limite.value.replace(/\D/g, ''), 10) || null, copiarDe: copiar.value || null });
          fechar(); toast(nome.value, '✅ Unidade criada'); aoCriar();
        } catch (e) { status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; }
      });
    } }]
  });
}

async function gerarCodigo(u) {
  const ok = await confirmar('🔑 Código para planilha antiga',
    'Gerar um código novo para <b>' + esc(u.nome) + '</b>?<br><br>Ele serve só para planilhas antigas que ainda chamam o servidor de IA. ' +
    (u.codigo_hash ? '<b>O código anterior para de valer na hora.</b>' : ''), { sim: 'Gerar código' });
  if (!ok) return;
  try {
    const codigo = await dados.gerarCodigoLegado(u.id);
    const url = (window.APAC_CONFIG.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/ia';
    const campo = (v) => h('input', { value: v, readonly: true, style: { width: '100%', fontFamily: 'monospace', padding: '7px' }, onclick: (e) => e.target.select() });
    modal({
      titulo: '🔑 ' + u.nome,
      conteudo: h('div', null,
        h('div', { class: 'campo' }, h('label', null, 'Código de acesso'), campo(codigo)),
        h('div', { class: 'campo' }, h('label', null, 'Endereço do servidor (na planilha, no lugar do /exec)'), campo(url)),
        h('div', { class: 'msg aviso' }, '⚠️ Copie e guarde o código agora. Ele não é gravado e não aparece de novo.')),
      botoes: [{ texto: 'Fechar', classe: 'principal' }]
    });
  } catch (e) {
    toast(e.message, '❌', 'erro');
  }
}

// ============================================================
// USUÁRIOS
// ============================================================
async function abaUsuarios(area) {
  const corpo = h('tbody');
  let unidades = [];

  const carregar = async () => {
    corpo.innerHTML = '<tr><td colspan="4"><div class="carregando"><span class="spinner"></span>Carregando…</div></td></tr>';
    try {
      const [perfis, us] = await Promise.all([dados.listarPerfis(), dados.listarUnidades()]);
      unidades = us;
      corpo.innerHTML = '';
      perfis.forEach((p) => {
        const eu = p.user_id === dados.sessao.perfil.user_id;
        const selUn = h('select', { disabled: eu },
          h('option', { value: '' }, '— sem unidade —'),
          ...unidades.map((u) => h('option', { value: u.id, selected: u.id === p.unidade_id }, u.nome)));
        const selPapel = h('select', { disabled: eu },
          h('option', { value: 'usuario', selected: p.papel === 'usuario' }, 'Usuário'),
          h('option', { value: 'admin', selected: p.papel === 'admin' }, 'Administrador'));
        const salvar = async (campos) => {
          try { await dados.atualizarPerfil(p.user_id, campos); toast('Salvo.', p.email, 'ok', 3); }
          catch (e) { toast(e.message, '❌', 'erro'); }
        };
        selUn.addEventListener('change', () => salvar({ unidade_id: selUn.value || null }));
        selPapel.addEventListener('change', () => salvar({ papel: selPapel.value }));
        corpo.appendChild(h('tr', null,
          h('td', null, h('strong', null, p.email), p.nome ? h('div', { class: 'mudo pequeno' }, p.nome) : null),
          h('td', null, selUn), h('td', null, selPapel),
          h('td', { class: 'mudo pequeno' }, eu ? '(você)' : '')));
      });
    } catch (e) {
      corpo.innerHTML = '<tr><td colspan="4"><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
    }
  };

  const convidar = () => {
    const email = h('input', { type: 'email' });
    const nome = h('input');
    const un = h('select', null, ...unidades.map((u) => h('option', { value: u.id }, u.nome)));
    const papel = h('select', null, h('option', { value: 'usuario' }, 'Usuário'), h('option', { value: 'admin' }, 'Administrador'));
    const status = h('div');
    const janela = modal({
      titulo: '✉️ Convidar usuário',
      conteudo: h('div', null,
        h('div', { class: 'campo' }, h('label', null, 'E-mail'), email),
        h('div', { class: 'campo' }, h('label', null, 'Nome'), nome),
        h('div', { class: 'campo' }, h('label', null, 'Unidade'), un),
        h('div', { class: 'campo' }, h('label', null, 'Papel'), papel),
        h('p', { class: 'mudo pequeno' }, 'A pessoa recebe um e-mail com um link para criar a senha.'),
        status),
      botoes: [{ texto: 'Cancelar' }, { texto: 'Enviar convite', classe: 'principal', acao: async (fechar) => {
        const btn = janela.el.querySelector('.modal-rodape .principal');
        await comCarregando(btn, 'Enviando…', async () => {
          try {
            const msg = await dados.convidarUsuario({ email: email.value, nome: nome.value, unidade_id: un.value, papel: papel.value });
            fechar(); toast(msg, '✅ Convite'); carregar();
          } catch (e) { status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; }
        });
      } }]
    });
  };

  area.append(h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
    h('div', { class: 'botoes', style: { marginBottom: '10px' } }, h('button', { class: 'btn principal', onclick: convidar }, '✉️ Convidar usuário')),
    h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
      h('thead', null, h('tr', null, h('th', null, 'E-mail'), h('th', null, 'Unidade'), h('th', null, 'Papel'), h('th', null, ''))),
      corpo)))));
  carregar();
}

// ============================================================
// CONSUMO E PREÇOS
// ============================================================
async function abaConsumo(area) {
  const corpo = h('tbody');
  const precosBox = h('div');
  area.append(h('div', { class: 'grade-cards', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' } },
    h('section', { class: 'card' }, h('h2', null, '📊 Consumo por mês e unidade (só chamadas OK)'),
      h('div', { class: 'card-conteudo' }, h('div', { class: 'tabela-rolagem', style: { maxHeight: '60vh' } }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, h('th', null, 'Mês'), h('th', null, 'Unidade'), h('th', { class: 'num' }, 'Chamadas'),
          h('th', { class: 'num' }, 'Entrada'), h('th', { class: 'num' }, 'Saída'), h('th', { class: 'num' }, 'Custo US$'),
          h('th', { class: 'num' }, 'c/ margem US$'), h('th', { class: 'num' }, 'Valor R$'))),
        corpo)))),
    h('section', { class: 'card' }, h('h2', null, '💲 Preços, margem e câmbio'), h('div', { class: 'card-conteudo' }, precosBox))));

  const carregar = async () => {
    try {
      const r = await dados.resumoConsumo();
      corpo.innerHTML = '';
      if (!r.length) corpo.innerHTML = '<tr><td colspan="8" class="vazio-tabela">Nenhum uso registrado.</td></tr>';
      r.forEach((x) => corpo.appendChild(h('tr', null,
        h('td', null, rotuloMes(x.mes)), h('td', null, x.unidade), h('td', { class: 'num' }, fmtNum(x.chamadas)),
        h('td', { class: 'num' }, fmtNum(x.tokens_entrada)), h('td', { class: 'num' }, fmtNum(x.tokens_saida)),
        h('td', { class: 'num' }, fmtNum(x.custo_usd, 4)), h('td', { class: 'num' }, fmtNum(x.com_margem_usd, 4)),
        h('td', { class: 'num' }, h('b', null, 'R$ ' + fmtNum(x.valor_reais, 2))))));
    } catch (e) {
      corpo.innerHTML = '<tr><td colspan="8"><div class="msg erro">' + esc(e.message) + '</div></td></tr>';
    }
  };

  const p = (await dados.lerPrecos()) || {};
  const campo = (rot, k, v) => {
    const el = h('input', { value: v ?? '', inputmode: 'decimal' });
    el.dataset.k = k;
    return h('div', { class: 'campo' }, h('label', null, rot), el);
  };
  const form = h('div', null,
    campo('Preço da entrada (US$ por milhão de tokens)', 'preco_entrada', p.preco_entrada),
    campo('Preço da saída (US$ por milhão de tokens)', 'preco_saida', p.preco_saida),
    campo('Sua margem (%)', 'margem', p.margem !== undefined ? Number(p.margem) * 100 : ''),
    campo('Câmbio (R$ por US$)', 'cambio', p.cambio));
  const status = h('div');
  const salvar = h('button', { class: 'btn principal' }, 'Salvar preços');
  salvar.addEventListener('click', async () => {
    const n = (k) => Number(String(form.querySelector('[data-k="' + k + '"]').value).replace(',', '.')) || 0;
    try {
      await dados.salvarPrecos({ preco_entrada: n('preco_entrada'), preco_saida: n('preco_saida'), margem: n('margem') / 100, cambio: n('cambio') });
      status.innerHTML = '<div class="msg ok">✅ Preços salvos.</div>';
      carregar();
    } catch (e) { status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; }
  });
  precosBox.append(form, h('p', { class: 'mudo pequeno' }, 'Use os preços do modelo em uso, da tabela de preços da Anthropic.'), status, salvar);
  carregar();
}
