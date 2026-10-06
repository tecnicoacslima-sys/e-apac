/**
 * Abertura do sistema: confere a configuração, faz o login, monta o
 * topo com o menu e troca de tela conforme o endereço (#/apac, #/pacientes…).
 */
import * as dados from './dados.js';
import { h, toast } from './ui.js';
import { esc } from './lib/texto.js';

const TELAS = {
  apac:        { rotulo: 'APAC',        carregar: () => import('./telas/apac.js') },
  pacientes:   { rotulo: 'Pacientes',   carregar: () => import('./telas/pacientes.js') },
  protocolo:   { rotulo: 'Protocolo',   carregar: () => import('./telas/protocolo.js') },
  sigtap:      { rotulo: 'SIGTAP',      carregar: () => import('./telas/sigtap.js') },
  cadastros:   { rotulo: 'Cadastros',   carregar: () => import('./telas/cadastros.js') },
  ferramentas: { rotulo: 'Ferramentas', carregar: () => import('./telas/ferramentas.js') },
  importar:    { rotulo: 'Importar',    carregar: () => import('./telas/importar.js'), escondido: true },
  admin:       { rotulo: 'Admin',       carregar: () => import('./telas/admin.js'), soAdmin: true }
};

const app = document.getElementById('app');
let telaAtual = null;

// ============================================================
// INÍCIO
// ============================================================
async function iniciar() {
  if (!dados.configurado) return mostrarFaltaConfig();

  const hashInicial = window.__hashInicial || '';
  const veioDeConvite = /type=(invite|recovery|signup)/.test(hashInicial);

  dados.sb.auth.onAuthStateChange((evento) => {
    if (evento === 'PASSWORD_RECOVERY') mostrarDefinirSenha('Defina sua nova senha');
    if (evento === 'SIGNED_OUT') mostrarLogin();
  });

  const sessao = await dados.sessaoAtual();
  if (!sessao) return mostrarLogin();
  if (veioDeConvite) return mostrarDefinirSenha('Bem-vindo! Crie sua senha');
  await entrarNoSistema();
}

async function entrarNoSistema() {
  try {
    await dados.carregarPerfil();
  } catch (e) {
    return mostrarErroGeral('Não consegui carregar seu perfil: ' + e.message);
  }
  const p = dados.sessao.perfil;
  if (!p) return mostrarErroGeral('Seu login não tem perfil. Fale com o administrador.');
  if (!dados.sessao.unidade) {
    return mostrarErroGeral('Seu usuário (' + esc(p.email) + ') ainda não está ligado a nenhuma unidade. ' +
      'Peça ao administrador para ligar você à sua unidade na tela Admin.', true);
  }
  montarEstrutura();
  window.addEventListener('hashchange', abrirTelaDoEndereco);
  abrirTelaDoEndereco();
}

// ============================================================
// ESTRUTURA (topo + menu + área da tela)
// ============================================================
function montarEstrutura() {
  const u = dados.sessao.unidade;
  const p = dados.sessao.perfil;
  const menu = h('nav', { class: 'menu', 'aria-label': 'Menu principal' });
  Object.entries(TELAS).forEach(([chave, t]) => {
    if (t.escondido) return;
    if (t.soAdmin && !dados.souAdmin()) return;
    menu.appendChild(h('a', { href: '#/' + chave, 'data-tela': chave }, t.rotulo));
  });

  app.innerHTML = '';
  app.appendChild(h('header', { class: 'topo' },
    h('div', { class: 'marca' },
      h('strong', null, '📋 Geradora de APAC'),
      h('span', { id: 'subtitulo-unidade' }, subtituloUnidade(u))),
    menu,
    h('div', { class: 'usuario' },
      h('span', null, p.nome || p.email),
      h('button', { type: 'button', onclick: async () => { await dados.sair(); } }, 'Sair'))));
  app.appendChild(h('main', { id: 'tela' }));
  app.appendChild(h('footer', { class: 'rodape-site' }, 'antonioresolve.com.br · Geradora de APAC Externa'));
}

export function subtituloUnidade(u) {
  if (!u) return '';
  const local = u.municipio ? u.municipio + (u.uf ? '/' + u.uf : '') : u.uf;
  return local ? u.nome + ' · ' + local : u.nome;
}

/** Usado pela tela Ferramentas depois de mudar os dados da unidade. */
export function atualizarSubtitulo() {
  const el = document.getElementById('subtitulo-unidade');
  if (el) el.textContent = subtituloUnidade(dados.sessao.unidade);
}

async function abrirTelaDoEndereco() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  let chave = m ? m[1] : 'apac';
  if (!TELAS[chave] || (TELAS[chave].soAdmin && !dados.souAdmin())) chave = 'apac';

  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.tela === chave));
  const area = document.getElementById('tela');
  if (!area) return;

  if (telaAtual && telaAtual.desmontar) {
    try { telaAtual.desmontar(); } catch (e) { console.warn(e); }
  }
  area.innerHTML = '<div class="carregando"><span class="spinner"></span>Carregando…</div>';
  try {
    const modulo = await TELAS[chave].carregar();
    area.innerHTML = '';
    telaAtual = modulo;
    await modulo.montar(area);
    document.title = TELAS[chave].rotulo + ' · Geradora de APAC';
  } catch (e) {
    console.error(e);
    area.innerHTML = '';
    area.appendChild(h('div', { class: 'msg erro' }, '❌ ' + e.message));
  }
}

// ============================================================
// LOGIN
// ============================================================
function mostrarLogin() {
  window.removeEventListener('hashchange', abrirTelaDoEndereco);
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'username', required: true });
  const senha = h('input', { type: 'password', id: 'senha', autocomplete: 'current-password', required: true });
  const status = h('div');
  const botao = h('button', { class: 'btn principal', type: 'submit' }, 'Entrar');

  const form = h('form', { class: 'login', onsubmit: async (e) => {
      e.preventDefault();
      status.innerHTML = '';
      botao.disabled = true;
      botao.innerHTML = '<span class="spinner"></span>Entrando…';
      try {
        await dados.entrar(email.value, senha.value);
        await entrarNoSistema();
      } catch (err) {
        status.innerHTML = '<div class="msg erro">' + esc(err.message) + '</div>';
        botao.disabled = false;
        botao.textContent = 'Entrar';
      }
    } },
    h('h1', null, '📋 Geradora de APAC'),
    h('p', { class: 'sub' }, 'Entre com o e-mail e a senha da sua unidade.'),
    h('div', { class: 'campo' }, h('label', { for: 'email' }, 'E-mail'), email),
    h('div', { class: 'campo' }, h('label', { for: 'senha' }, 'Senha'), senha),
    status,
    botao,
    h('button', { class: 'btn link', type: 'button', style: { width: '100%', marginTop: '10px' }, onclick: async () => {
      if (!email.value.trim()) { status.innerHTML = '<div class="msg aviso">Digite seu e-mail acima e clique de novo em "Esqueci minha senha".</div>'; return; }
      try {
        await dados.esqueciSenha(email.value);
        status.innerHTML = '<div class="msg ok">Enviamos um link para ' + esc(email.value) + '. Abra o e-mail e siga o link para criar uma senha nova.</div>';
      } catch (err) {
        status.innerHTML = '<div class="msg erro">' + esc(err.message) + '</div>';
      }
    } }, 'Esqueci minha senha'),
    h('div', { class: 'rodape' }, 'antonioresolve.com.br'));

  app.innerHTML = '';
  app.appendChild(h('div', { class: 'login-fundo' }, form));
  email.focus();
}

function mostrarDefinirSenha(titulo) {
  const s1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6 });
  const s2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 6 });
  const status = h('div');
  const form = h('form', { class: 'login', onsubmit: async (e) => {
      e.preventDefault();
      if (s1.value.length < 6) { status.innerHTML = '<div class="msg erro">A senha precisa ter pelo menos 6 caracteres.</div>'; return; }
      if (s1.value !== s2.value) { status.innerHTML = '<div class="msg erro">As duas senhas não são iguais.</div>'; return; }
      try {
        await dados.definirSenha(s1.value);
        history.replaceState(null, '', location.pathname + '#/apac');
        toast('Senha salva.', '✅ Pronto');
        await entrarNoSistema();
      } catch (err) {
        status.innerHTML = '<div class="msg erro">' + esc(err.message) + '</div>';
      }
    } },
    h('h1', null, titulo),
    h('p', { class: 'sub' }, 'Escolha uma senha com pelo menos 6 caracteres.'),
    h('div', { class: 'campo' }, h('label', null, 'Nova senha'), s1),
    h('div', { class: 'campo' }, h('label', null, 'Repita a senha'), s2),
    status,
    h('button', { class: 'btn principal', type: 'submit' }, 'Salvar senha e entrar'));
  app.innerHTML = '';
  app.appendChild(h('div', { class: 'login-fundo' }, form));
  s1.focus();
}

function mostrarErroGeral(html, comSair) {
  app.innerHTML = '';
  app.appendChild(h('div', { class: 'login-fundo' },
    h('div', { class: 'login' },
      h('h1', null, '📋 Geradora de APAC'),
      h('div', { class: 'msg aviso', html }),
      comSair ? h('button', { class: 'btn', onclick: () => dados.sair() }, 'Sair') : null)));
}

function mostrarFaltaConfig() {
  app.innerHTML = '';
  app.appendChild(h('div', { class: 'login-fundo' },
    h('div', { class: 'login' },
      h('h1', null, '⚙️ Falta um passo'),
      h('div', { class: 'msg info', html:
        'Abra o arquivo <b>config.js</b> (na mesma pasta deste site) e cole o <b>Project URL</b> e a ' +
        '<b>anon key</b> do seu projeto no Supabase.<br><br>Onde achar: Supabase ▸ seu projeto ▸ ' +
        '<b>Project Settings ▸ API</b>.' }))));
}

iniciar().catch((e) => mostrarErroGeral('Erro ao abrir: ' + esc(e.message)));
