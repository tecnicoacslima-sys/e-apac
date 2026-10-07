/**
 * FERRAMENTAS (antes: menu 📋 APAC ▸ 🔧 Ferramentas)
 *   📊 Consumo da IA · 🔌 Testar acesso à IA · 🪪 Conferir Cartões SUS
 *   ✏️ Dados da unidade (+ brasão) · 📥 Importar planilha antiga
 *   📥 Atualizar tabela SIGTAP (.zip) — só o administrador
 */
import * as dados from '../dados.js';
import { h, toast, comCarregando, listaHtml, alerta } from '../ui.js';
import { esc, fmtNum, rotuloMes, partesData } from '../lib/texto.js';
import { motivoCNSInvalido, validarCPF, soDigitos } from '../lib/validacao.js';
import { atualizarSubtitulo } from '../app.js';
import { abrirAtualizarSigtap } from './atualizar-sigtap.js';
import { rotuloCompetencia } from '../lib/sigtap-zip.js';

export async function montar(area) {
  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null, h('h1', null, '🔧 Ferramentas'))),
    h('div', { class: 'grade-cards' },
      cartaoConsumo(), cartaoUnidade(), cartaoCartoes(), cartaoTesteIA(),
      dados.souAdmin() ? cartaoSigtap() : null, cartaoImportar()));
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

// ---------------- 📥 ATUALIZAR SIGTAP (só admin) ----------------
function cartaoSigtap() {
  const info = h('p', { class: 'pequeno', style: { marginTop: 0 } }, 'Carregando…');
  const carregar = () => dados.infoSigtap().then((i) => {
    info.innerHTML = i.competencia
      ? 'Em uso: competência <b>' + esc(rotuloCompetencia(i.competencia)) + '</b> · ' + esc(fmtNum(i.total)) + ' procedimentos'
      : '⚠️ Nenhuma tabela SIGTAP carregada ainda.';
  }).catch((e) => { info.textContent = e.message; });
  carregar();
  return h('section', { class: 'card' }, h('h2', null, '📥 Atualizar tabela SIGTAP (.zip)'),
    h('div', { class: 'card-conteudo' },
      h('p', { class: 'mudo pequeno', style: { marginTop: 0 } },
        'Monta a tabela oficial a partir do .zip da Tabela Unificada do DATASUS. Vale para todas as unidades. Não usa IA.'),
      info,
      h('button', { type: 'button', class: 'btn principal', onclick: () => abrirAtualizarSigtap({ aoTerminar: carregar }) },
        '📥 Atualizar pelo .zip')));
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
