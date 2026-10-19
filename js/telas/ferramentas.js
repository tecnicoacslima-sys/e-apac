/**
 * FERRAMENTAS — abre UMA ferramenta por vez.
 *   #/ferramentas            → lista de ferramentas (cartões pequenos para escolher)
 *   #/ferramentas/<chave>    → só aquela ferramenta (o topo tem o menu em cascata)
 * A lista (rótulos, ícones, quem vê) fica em app.js ▸ SUB_FERRAMENTAS.
 *
 * Ferramentas:
 *   📊 Consumo da IA · 🔌 Testar acesso à IA · 🪪 Conferir Cartões SUS
 *   ✏️ Dados da unidade (+ brasão) · 📥 Importar planilha antiga
 *   📎 Juntar PDFs · 💾 Cópia de segurança · 📥 Atualizar tabela SIGTAP (.zip) — só o administrador (e o computador)
 *   Só no programa de computador: 🔑 Trocar a senha · 🗂️ Pasta dos dados · modo híbrido (dentro de 🔌 Acesso à IA)
 */
import * as dados from '../dados.js';
import { h, toast, comCarregando, listaHtml, alerta, confirmar } from '../ui.js';
import { esc, fmtNum, rotuloMes, partesData } from '../lib/texto.js';
import { motivoCNSInvalido, validarCPF, soDigitos } from '../lib/validacao.js';
import { atualizarSubtitulo, ferramentasVisiveis } from '../app.js';
import { abrirAtualizarSigtap } from './atualizar-sigtap.js';
import { rotuloCompetencia } from '../lib/sigtap-zip.js';
import { listarTabelasRepo } from '../lib/sigtap-repo.js';
import { montarPlanilhaCopia, nomeArquivoCopia } from '../lib/copia.js';

const CARTOES = {
  copia: () => cartaoCopia(),
  consumo: () => cartaoConsumo(),
  juntar: () => cartaoJuntar(),
  unidade: () => cartaoUnidade(),
  cartoes: () => cartaoCartoes(),
  'teste-ia': () => cartaoTesteIA(),
  sigtap: () => cartaoSigtap(),
  importar: () => cartaoImportar(),
  senha: () => cartaoSenha(),        // só no programa de computador
  pasta: () => cartaoPastaDados()    // só no programa de computador
};

const ESTILO = `
.ferr-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.ferr-item { display: flex; gap: 12px; align-items: flex-start; padding: 14px; background: var(--card); border: 1px solid var(--borda-card);
  border-radius: var(--raio); box-shadow: var(--sombra); text-decoration: none; color: var(--texto); transition: border-color .15s, transform .15s; }
.ferr-item:hover, .ferr-item:focus { border-color: var(--verde); transform: translateY(-1px); outline: none; }
.ferr-item .ico { font-size: 24px; line-height: 1; }
.ferr-item b { display: block; color: var(--primaria); margin-bottom: 3px; }
.ferr-item span.desc { font-size: 12.5px; color: var(--rotulo); }
.ferr-aberta { max-width: 760px; }
.ferr-voltar { display: inline-block; margin-bottom: 10px; font-size: 13px; font-weight: 600; text-decoration: none; }
`;

export async function montar(area) {
  if (!document.getElementById('estilo-ferramentas')) document.head.appendChild(h('style', { id: 'estilo-ferramentas' }, ESTILO));
  const lista = ferramentasVisiveis();
  const m = location.hash.match(/^#\/ferramentas\/([a-z-]+)/);
  const escolhida = m && lista.find((f) => f.chave === m[1]);

  if (!escolhida) {
    area.append(
      h('div', { class: 'titulo-tela' }, h('div', null,
        h('h1', null, '🔧 Ferramentas'),
        h('p', { class: 'mudo' }, 'Escolha a ferramenta.'))),
      h('div', { class: 'ferr-lista' }, ...lista.map((f) =>
        h('a', { class: 'ferr-item', href: '#/ferramentas/' + f.chave },
          h('span', { class: 'ico' }, f.icone),
          h('span', null, h('b', null, f.rotulo), h('span', { class: 'desc' }, f.desc))))));
    return;
  }

  area.append(
    h('a', { class: 'ferr-voltar', href: '#/ferramentas' }, '← Todas as ferramentas'),
    h('div', { class: 'ferr-aberta' }, CARTOES[escolhida.chave]()));
}

// ---------------- 📊 CONSUMO DA IA ----------------
function cartaoConsumo() {
  const p = partesData();
  const mes = h('input', { type: 'month', value: p.ano + '-' + p.mes });
  const saida = h('div');
  const carregar = async () => {
    saida.innerHTML = '<div class="carregando"><span class="spinner"></span>Carregando…</div>';
    try {
      const c = await dados.consumoMes(mes.value);
      const total = Number(c.entrada) + Number(c.saida);
      saida.innerHTML = '';
      if (!c.chamadas) { saida.appendChild(h('p', { class: 'mudo' }, 'Nenhuma chamada em ' + rotuloMes(c.mes) + '.')); }
      else {
        saida.appendChild(h('table', { class: 'tabela' },
          h('thead', null, h('tr', null, h('th', null, 'Função'), h('th', { class: 'num' }, 'Chamadas'), h('th', { class: 'num' }, 'Entrada'), h('th', { class: 'num' }, 'Saída'))),
          h('tbody', null, ...c.funcoes.map((f) => h('tr', null, h('td', null, f.funcao), h('td', { class: 'num' }, fmtNum(f.chamadas)),
            h('td', { class: 'num' }, fmtNum(f.entrada)), h('td', { class: 'num' }, fmtNum(f.saida)))),
            h('tr', null, h('td', null, h('b', null, 'Total')), h('td', { class: 'num' }, h('b', null, fmtNum(c.chamadas))),
              h('td', { class: 'num' }, h('b', null, fmtNum(c.entrada))), h('td', { class: 'num' }, h('b', null, fmtNum(c.saida)))))));
      }
      if (c.limite) {
        const pct = Math.min(100, total / c.limite * 100);
        saida.appendChild(h('div', { style: { marginTop: '10px' } },
          h('div', { class: 'pequeno' }, 'Limite mensal: ', h('b', null, fmtNum(total)), ' de ' + fmtNum(c.limite) + ' tokens (' + fmtNum(pct, 1) + '%)'),
          h('div', { style: { height: '8px', background: '#E3EBE9', borderRadius: '4px', marginTop: '4px' } },
            h('div', { style: { width: pct + '%', height: '100%', borderRadius: '4px', background: pct >= 90 ? 'var(--vermelho)' : 'var(--verde)' } }))));
      }
    } catch (e) {
      saida.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  };
  mes.addEventListener('change', carregar);
  carregar();
  return h('section', { class: 'card' }, h('h2', null, '📊 Consumo da IA'),
    h('div', { class: 'card-conteudo' }, h('div', { class: 'campo' }, h('label', null, 'Mês'), mes), saida));
}

// ---------------- 💾 CÓPIA DE SEGURANÇA ----------------
const CHAVE_ULTIMA_COPIA = 'apac.ultimaCopia';
let xlsxPromessa = null;
function carregarXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromessa) {
    xlsxPromessa = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = new URL('../../vendor/xlsx.full.min.js', import.meta.url).href;
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { xlsxPromessa = null; falha(new Error('Não consegui carregar o gerador de planilhas.')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromessa;
}
function lerUltimaCopia() {
  try { return JSON.parse(localStorage.getItem(CHAVE_ULTIMA_COPIA) || 'null'); } catch (e) { return null; }
}

function cartaoCopia() {
  const u = dados.sessao.unidade;
  const situacao = h('div');
  const desenharSituacao = () => {
    const ult = lerUltimaCopia();
    const minha = ult && ult[u.id];
    situacao.innerHTML = '';
    if (!minha) {
      situacao.appendChild(h('div', { class: 'msg aviso pequeno' }, '⚠️ Nenhuma cópia baixada neste computador ainda.'));
      return;
    }
    const dias = Math.floor((Date.now() - new Date(minha).getTime()) / 86400000);
    const quando = new Date(minha).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    situacao.appendChild(h('div', { class: 'msg ' + (dias >= 7 ? 'aviso' : 'ok') + ' pequeno' },
      (dias >= 7 ? '⚠️ ' : '✅ ') + 'Última cópia neste computador: ' + quando + (dias >= 1 ? ' (há ' + dias + ' dia' + (dias > 1 ? 's' : '') + ')' : '') + '.'));
  };
  desenharSituacao();
  const botao = h('button', { class: 'btn principal' }, '💾 Baixar cópia de tudo (Excel)');
  botao.addEventListener('click', () => comCarregando(botao, 'Preparando…', async () => {
    try {
      const [XLSX, tabelas] = await Promise.all([carregarXlsx(), dados.lerCopiaDeSeguranca((r) => { botao.lastChild && (botao.lastChild.textContent = 'Lendo ' + r + '…'); })]);
      const agora = new Date();
      const p = dados.sessao.perfil || {};
      const wb = montarPlanilhaCopia(XLSX, tabelas, {
        unidade: [u.nome, [u.municipio, u.uf].filter(Boolean).join('/')].filter(Boolean).join(' — '),
        geradaEm: agora.toLocaleString('pt-BR'), por: p.nome || p.email || ''
      });
      XLSX.writeFile(wb, nomeArquivoCopia(u.nome, agora));
      try {
        const ult = lerUltimaCopia() || {};
        ult[u.id] = agora.toISOString();
        localStorage.setItem(CHAVE_ULTIMA_COPIA, JSON.stringify(ult));
      } catch (e) { /* sem memória do navegador: tudo bem */ }
      desenharSituacao();
      const total = tabelas.reduce((s2, t) => s2 + t.linhas.length, 0);
      const falhas = tabelas.filter((t) => t.erro);
      toast(fmtNum(total) + ' linhas em ' + tabelas.length + ' abas.' + (falhas.length ? ' Atenção: ' + falhas.length + ' aba(s) não puderam ser lidas.' : ''), '💾 Cópia baixada', falhas.length ? 'aviso' : 'ok');
    } catch (e) {
      alerta('Não consegui fazer a cópia', esc(e.message));
    }
  }));
  return h('section', { class: 'card' }, h('h2', null, '💾 Cópia de segurança'),
    h('div', { class: 'card-conteudo' },
      h('p', { style: { marginTop: '0' } }, 'Baixa todos os dados da unidade (pacientes, protocolo, APACs, conferências e cadastros) numa planilha Excel, uma aba para cada.'),
      h('p', { class: 'pequeno mudo' }, 'Faça uma vez por semana e guarde no Google Drive. O arquivo tem dados de pacientes: não envie para ninguém.'),
      situacao,
      botao));
}

// ---------------- 📎 JUNTAR PDFs ----------------
function cartaoJuntar() {
  return h('section', { class: 'card' }, h('h2', null, '📎 Juntar PDFs'),
    h('div', { class: 'card-conteudo' },
      h('p', { style: { marginTop: '0' } }, 'Junta vários PDFs e fotos (JPG/PNG) num arquivo só — ex.: espelho SUS + CELK + documento + comprovante de residência.'),
      h('p', { class: 'pequeno mudo' }, '🔒 Feito no seu computador: nada é enviado para sites de fora e não gasta IA.'),
      h('a', { class: 'btn principal', href: '#/juntar' }, '📎 Abrir Juntar PDFs')));
}

// ---------------- ✏️ DADOS DA UNIDADE ----------------
function cartaoUnidade() {
  const u = dados.sessao.unidade;
  const nome = h('input', { value: u.nome });
  const municipio = h('input', { value: u.municipio });
  const uf = h('input', { value: u.uf, maxlength: 2, style: { textTransform: 'uppercase' } });
  const email = h('input', { value: u.email_secretaria || '', placeholder: 'ex.: admsaude@municipio.mt.gov.br' });
  const logo = h('input', { type: 'file', accept: 'image/png,image/jpeg' });
  const previa = h('div', { class: 'pequeno mudo' }, u.logo_path ? 'Brasão já enviado.' : 'Nenhum brasão enviado.');
  const status = h('div');
  const botao = h('button', { class: 'btn principal' }, 'Salvar');

  botao.addEventListener('click', () => comCarregando(botao, 'Salvando…', async () => {
    status.innerHTML = '';
    try {
      let logoPath = null;
      const arq = logo.files[0];
      if (arq) {
        if (arq.size > 2 * 1024 * 1024) throw new Error('A imagem do brasão passa de 2 MB.');
        const ext = /png$/i.test(arq.type) ? 'png' : 'jpg';
        logoPath = u.id + '/brasao.' + ext;
        await dados.substituirArquivo('logos', logoPath, await arq.arrayBuffer(), arq.type);
      }
      await dados.atualizarMinhaUnidade({ nome: nome.value, municipio: municipio.value, uf: uf.value.toUpperCase(),
        email_secretaria: email.value, logo_path: logoPath });
      await dados.carregarPerfil();
      atualizarSubtitulo();
      if (logoPath) previa.textContent = 'Brasão enviado.';
      status.innerHTML = '<div class="msg ok">✅ Dados da unidade salvos.</div>';
    } catch (e) {
      status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  }));

  return h('section', { class: 'card' }, h('h2', null, '✏️ Dados da unidade'),
    h('div', { class: 'card-conteudo' },
      h('div', { class: 'campo' }, h('label', null, 'Nome da unidade'), nome),
      h('div', { class: 'form-simples', style: { gridTemplateColumns: '1fr 80px' } },
        h('div', { class: 'campo' }, h('label', null, 'Município'), municipio),
        h('div', { class: 'campo' }, h('label', null, 'UF'), uf)),
      h('div', { class: 'campo' }, h('label', null, 'E-mail da Secretaria (cabeçalho do Protocolo)'), email),
      h('div', { class: 'campo' }, h('label', null, 'Brasão da prefeitura (PNG ou JPG, para o Protocolo)'), logo, previa),
      status, botao));
}

// ---------------- 🪪 CONFERIR CARTÕES SUS ----------------
function cartaoCartoes() {
  const saida = h('div');
  const botao = h('button', { class: 'btn' }, '🪪 Conferir agora');
  botao.addEventListener('click', () => comCarregando(botao, 'Conferindo…', async () => {
    try {
      const [prof, pac] = await Promise.all([dados.listarProfissionais(), dados.lerTodas('pacientes', 'nome, cns, cpf')]);
      const problemas = [];
      prof.forEach((l) => {
        const doc = soDigitos(l.documento);
        if (doc.length === 11) {
          if (!validarCPF(doc)) problemas.push('Profissional Nº ' + l.numero + ' · ' + l.nome + ' · CPF ' + doc + ' com dígito errado');
          return;
        }
        const m = motivoCNSInvalido(doc);
        if (m) problemas.push('Profissional Nº ' + l.numero + ' · ' + l.nome + ' · CNS ' + (doc || '—') + ' ' + m);
      });
      pac.forEach((l) => {
        const m = motivoCNSInvalido(l.cns);
        if (m) problemas.push('Paciente · ' + l.nome + ' · CNS ' + (l.cns || '—') + ' ' + m);
        if (l.cpf && !validarCPF(l.cpf)) problemas.push('Paciente · ' + l.nome + ' · CPF ' + l.cpf + ' com dígito errado');
      });
      const resumo = 'Conferidos: ' + prof.length + ' profissional(is) e ' + pac.length + ' paciente(s).';
      saida.innerHTML = problemas.length
        ? '<div class="msg aviso"><b>' + problemas.length + ' problema(s)</b>' + listaHtml(problemas.slice(0, 200)) +
          (problemas.length > 200 ? '… e mais ' + (problemas.length - 200) + '.' : '') + '<br>' + esc(resumo) +
          '<br>Corrija em Pacientes ou em Cadastros ▸ Profissionais.</div>'
        : '<div class="msg ok">✅ Nenhum problema encontrado. ' + esc(resumo) + '</div>';
    } catch (e) {
      saida.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  }));
  return h('section', { class: 'card' }, h('h2', null, '🪪 Conferir Cartões SUS cadastrados'),
    h('div', { class: 'card-conteudo' },
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } }, 'Confere o dígito verificador do CNS e do CPF de todos os profissionais e pacientes. Não altera nada.'),
      botao, saida));
}

// ---------------- 🔌 TESTAR IA ----------------
function cartaoTesteIA() {
  if (dados.desktop) return cartaoModoHibrido();
  const saida = h('div');
  const botao = h('button', { class: 'btn' }, '🔌 Testar acesso à IA');
  botao.addEventListener('click', () => comCarregando(botao, 'Testando…', async () => {
    try {
      const r = await dados.chamarIA({ funcao: 'TESTE', system: 'Responda apenas com a palavra OK.',
        content: [{ type: 'text', text: 'Teste de conexão.' }], maxTokens: 10 });
      saida.innerHTML = '<div class="msg ok">✅ Acesso à IA funcionando.<br>Modelo: ' + esc(r.modelo) + '<br>Resposta: ' + esc(r.texto) +
        '<br>Tokens: ' + r.entrada + ' entrada · ' + r.saida + ' saída.</div>';
    } catch (e) {
      saida.innerHTML = '<div class="msg erro">❌ ' + esc(e.message) + '</div>';
    }
  }));
  return h('section', { class: 'card' }, h('h2', null, '🔌 Acesso à IA'),
    h('div', { class: 'card-conteudo' },
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } }, 'Faz uma chamada mínima (gasta pouquíssimos tokens) para conferir se a IA responde.'),
      botao, saida));
}

// ---------------- 🔌 MODO HÍBRIDO (só no computador) ----------------
/**
 * O programa nasce offline. Com o código APAC-… (gerado no Admin do site para a
 * unidade), liga a IA: os botões de IA passam a mandar o PDF, pela internet, ao
 * servidor do APAC digital. Sem código ou sem internet, tudo segue digitado.
 */
function cartaoModoHibrido() {
  const corpo = h('div', { class: 'card-conteudo' }, h('div', { class: 'carregando' }, h('span', { class: 'spinner' }), 'Carregando…'));
  const aviso = () => h('div', { class: 'msg aviso pequeno' },
    h('b', null, 'Privacidade (LGPD): '),
    'com o modo híbrido ligado, ao clicar num botão de IA (ler laudo, espelho CELK, relatório G-MUS ou Conferência), ' +
    'o arquivo escolhido é enviado pela internet ao servidor do APAC digital, que pede a leitura ao serviço de IA. ' +
    'Nada é enviado sem esse clique. O servidor registra só a quantidade usada, nunca o conteúdo. ' +
    'O resto do programa (pacientes, protocolo, APACs) continua só neste computador.');

  const desenhar = async () => {
    let e;
    try { e = await dados.estadoIA(); } catch (erro) { corpo.innerHTML = ''; corpo.appendChild(h('div', { class: 'msg erro' }, erro.message)); return; }
    corpo.innerHTML = '';

    if (e.ligado) {
      const saida = h('div');
      const testar = h('button', { type: 'button', class: 'btn' }, '🔌 Testar acesso');
      testar.addEventListener('click', () => comCarregando(testar, 'Testando…', async () => {
        try {
          const r = await dados.chamarIA({ funcao: 'TESTE', system: 'Responda apenas com a palavra OK.',
            content: [{ type: 'text', text: 'Teste de conexão.' }], maxTokens: 10 });
          saida.innerHTML = '<div class="msg ok">✅ A IA está respondendo. Modelo: ' + esc(r.modelo) + '.</div>';
        } catch (erro) {
          saida.innerHTML = '<div class="msg erro">❌ ' + esc(erro.message) + '</div>';
        }
      }));
      const desligar = h('button', { type: 'button', class: 'btn' }, '⚪ Desligar o modo híbrido');
      desligar.addEventListener('click', async () => {
        const ok = await confirmar('Desligar o modo híbrido?',
          'Os botões de IA param de funcionar neste computador e tudo volta a ser digitado. ' +
          'Para ligar de novo, será preciso colar o código outra vez.', { sim: 'Desligar' });
        if (!ok) return;
        try { await dados.desativarIA(); toast('A IA foi desligada neste computador.', '⚪ Modo offline'); desenhar(); }
        catch (erro) { toast(erro.message, '❌', 'erro'); }
      });
      corpo.append(
        h('div', { class: 'msg ok' }, '✅ ', h('b', null, 'Modo híbrido ligado.'), ' Código terminando em ', h('code', null, '…' + e.final), '.'),
        h('p', { class: 'mudo pequeno' }, 'Precisa de internet só na hora de usar um botão de IA. Sem internet, preencha digitando, como no modo offline.'),
        aviso(),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0 4px' } }, testar, desligar),
        saida);
      return;
    }

    const campo = h('input', { placeholder: 'APAC-…', autocomplete: 'off', spellcheck: false,
      style: { fontFamily: 'monospace', letterSpacing: '.5px' } });
    const status = h('div');
    const ligar = h('button', { type: 'button', class: 'btn principal' }, '🔌 Ligar o modo híbrido');
    ligar.addEventListener('click', () => comCarregando(ligar, 'Conferindo o código…', async () => {
      status.innerHTML = '';
      try {
        await dados.ativarIA(campo.value);
        toast('A IA está ligada neste computador.', '✅ Modo híbrido');
        desenhar();
      } catch (erro) {
        status.innerHTML = '<div class="msg erro">❌ ' + esc(erro.message) + '</div>';
      }
    }));
    corpo.append(...[
      h('div', { class: 'msg info' }, '⚪ ', h('b', null, 'Modo offline.'), ' A IA está desligada neste computador; tudo funciona digitando.'),
      e.precisaColar ? h('div', { class: 'msg aviso pequeno' },
        'Havia um código guardado, mas ele não vale neste computador (a pasta dos dados veio de outro computador?). Cole o código de novo.') : null,
      h('p', { class: 'pequeno' }, 'Para usar os botões de IA (ler laudo, espelho CELK, G-MUS e Conferência), cole o código de acesso da unidade. ' +
        'Peça o código ao responsável pelo APAC digital. O programa confere o código na hora, por isso precisa de internet neste momento.'),
      aviso(),
      h('div', { class: 'campo', style: { marginTop: '12px' } }, h('label', null, 'Código de acesso à IA'), campo),
      ligar, status].filter(Boolean));
  };

  desenhar();
  return h('section', { class: 'card' }, h('h2', null, '🔌 Acesso à IA (modo híbrido)'), corpo);
}

// ---------------- 📥 ATUALIZAR SIGTAP (só admin) ----------------
function cartaoSigtap() {
  const info = h('p', { class: 'pequeno', style: { marginTop: 0 } }, 'Carregando…');
  const naInternet = h('p', { class: 'pequeno mudo', style: { marginTop: 0 } }, '🌐 Procurando a mais recente na internet…');
  const carregar = () => dados.infoSigtap().then((i) => {
    info.innerHTML = i.competencia
      ? 'Em uso: competência <b>' + esc(rotuloCompetencia(i.competencia)) + '</b> · ' + esc(fmtNum(i.total)) + ' procedimentos'
      : '⚠️ Nenhuma tabela SIGTAP carregada ainda.';
    return listarTabelasRepo().then((repo) => {
      const nova = repo.arquivos[0].competencia;
      naInternet.className = 'pequeno';
      naInternet.innerHTML = !i.competencia || nova > i.competencia
        ? '🆕 Na internet já existe a competência <b>' + esc(rotuloCompetencia(nova)) + '</b>. Clique em Atualizar para baixar.'
        : '✅ É a mais recente disponível na internet.';
    }).catch(() => { naInternet.textContent = '🌐 Sem acesso à internet agora: dá para atualizar pelo .zip.'; });
  }).catch((e) => { info.textContent = e.message; });
  carregar();
  return h('section', { class: 'card' }, h('h2', null, '📥 Atualizar tabela SIGTAP'),
    h('div', { class: 'card-conteudo' },
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } },
        'Monta a tabela oficial a partir do .zip da Tabela Unificada do DATASUS, baixado sozinho pela internet ou escolhido à mão. ' +
        (dados.desktop ? 'Vale para este computador; atualize a cada 60–90 dias.' : 'Vale para todas as unidades.') + ' Não usa IA.'),
      info, naInternet,
      h('button', { type: 'button', class: 'btn principal', onclick: () => abrirAtualizarSigtap({ aoTerminar: carregar }) },
        '📥 Atualizar tabela')));
}

// ---------------- 🔑 TROCAR A SENHA (só no computador) ----------------
function cartaoSenha() {
  const atual = h('input', { type: 'password', autocomplete: 'current-password' });
  const nova = h('input', { type: 'password', autocomplete: 'new-password' });
  const repete = h('input', { type: 'password', autocomplete: 'new-password' });
  const status = h('div');
  const botao = h('button', { type: 'button', class: 'btn principal' }, '🔑 Trocar a senha');
  botao.addEventListener('click', () => comCarregando(botao, 'Trocando…', async () => {
    status.innerHTML = '';
    try {
      if (nova.value !== repete.value) throw new Error('As duas senhas novas não são iguais.');
      await dados.trocarSenha(atual.value, nova.value);
      atual.value = nova.value = repete.value = '';
      status.innerHTML = '<div class="msg ok">Senha trocada. Use a senha nova na próxima vez que abrir o programa.</div>';
    } catch (e) {
      status.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  }));
  return h('section', { class: 'card' }, h('h2', null, '🔑 Trocar a senha da unidade'),
    h('div', { class: 'card-conteudo' },
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } }, 'A senha é da unidade: quem cobrir férias usa a mesma. Pelo menos 6 caracteres. O código de recuperação continua o mesmo.'),
      h('div', { class: 'campo' }, h('label', null, 'Senha atual'), atual),
      h('div', { class: 'campo' }, h('label', null, 'Senha nova'), nova),
      h('div', { class: 'campo' }, h('label', null, 'Repita a senha nova'), repete),
      botao, status));
}

// ---------------- 🗂️ PASTA DOS DADOS (só no computador) ----------------
function cartaoPastaDados() {
  const onde = h('code', { style: { display: 'block', padding: '8px', background: '#F4F7F5', borderRadius: '6px', overflowWrap: 'anywhere', margin: '6px 0 10px' } }, 'Carregando…');
  dados.infoComputador().then((i) => { onde.textContent = i.pastaDados; }).catch((e) => { onde.textContent = e.message; });
  return h('section', { class: 'card' }, h('h2', null, '🗂️ Pasta dos dados'),
    h('div', { class: 'card-conteudo' },
      h('p', { style: { marginTop: 0 } }, 'Tudo o que este programa guarda fica nesta pasta, só neste computador:'),
      onde,
      h('ul', { class: 'pequeno', style: { margin: '0 0 12px 18px', padding: 0 } },
        h('li', null, h('b', null, 'apac.sqlite'), ' — o banco (pacientes, protocolo, APACs, conferências, cadastros, SIGTAP)'),
        h('li', null, h('b', null, 'arquivos'), ' — os PDFs das APACs e dos relatórios, logo e assinaturas'),
        h('li', null, h('b', null, 'copias'), ' — uma cópia do banco por dia (as 15 mais recentes), feita ao abrir o programa')),
      h('div', { class: 'msg aviso pequeno' }, 'Para levar para outro computador ou guardar fora: feche o programa e copie a pasta inteira (pendrive, Drive…). Ela tem dados de pacientes: guarde com cuidado.'),
      h('button', { type: 'button', class: 'btn principal', style: { marginTop: '10px' }, onclick: () => dados.abrirPastaDados() }, '📂 Abrir a pasta')));
}

// ---------------- 📥 IMPORTAR ----------------
function cartaoImportar() {
  return h('section', { class: 'card' }, h('h2', null, '📥 Importar planilha antiga'),
    h('div', { class: 'card-conteudo' },
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } },
        'Traz pacientes, profissionais, CNES, Referência SIGTAP, Check-list e Conferências da planilha GERADORA (.xlsx). ' +
        'O admin também importa a tabela SIGTAP e o PAINEL_CONSUMO_IA.'),
      h('a', { class: 'btn principal', href: '#/importar' }, 'Abrir o importador')));
}
