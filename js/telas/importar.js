/**
 * 📥 IMPORTAR PLANILHA ANTIGA — lê o .xlsx no próprio navegador
 * (nada sobe para lugar nenhum além do seu Supabase) e manda os dados
 * para as tabelas novas. Pode rodar de novo: o que já existe é pulado.
 *
 * Como baixar a planilha: Google Planilhas ▸ Arquivo ▸ Fazer download ▸ Microsoft Excel (.xlsx)
 */
import * as dados from '../dados.js';
import { h, zonaArquivo, lerArquivoBuffer, toast } from '../ui.js';
import { esc, fmtNum } from '../lib/texto.js';
import * as conv from '../lib/importacao.js';

let xlsxPromessa = null;
function carregarXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromessa) {
    xlsxPromessa = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = new URL('../../vendor/xlsx.full.min.js', import.meta.url).href;
      s.onload = () => ok(window.XLSX);
      s.onerror = () => falha(new Error('Não consegui carregar o leitor de planilhas.'));
      document.head.appendChild(s);
    });
  }
  return xlsxPromessa;
}

export async function montar(area) {
  const etapas = h('div');
  const log = h('div', { class: 'pequeno', style: { maxHeight: '320px', overflow: 'auto', marginTop: '10px' } });
  const zona = zonaArquivo({ aceitar: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    texto: 'Escolha a planilha (.xlsx) ou arraste para cá', aoEscolher: (a) => analisar(a, etapas, log) });

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null, h('h1', null, '📥 Importar planilha antiga'),
      h('p', null, 'No Google Planilhas: Arquivo ▸ Fazer download ▸ Microsoft Excel (.xlsx). Depois escolha o arquivo aqui.'))),
    h('div', { class: 'card' }, h('div', { class: 'card-conteudo' },
      h('div', { class: 'msg info' },
        'Os dados vão para a unidade ', h('b', null, dados.sessao.unidade.nome), '. ',
        'Pode importar de novo sem medo: o que já existe (mesmo Cartão SUS/CPF, mesmo nome, mesmo CNES…) é pulado.'),
      zona, etapas, log)));
}

const TIPOS = [
  // aba(s) · rótulo · só admin · marcado por padrão
  { id: 'cnes', abas: ['CNES_UBS'], rotulo: 'CNES (CNES_UBS)', padrao: true },
  { id: 'prof', abas: ['MEDICO_SUS'], rotulo: 'Profissionais (MEDICO_SUS)', padrao: true },
  { id: 'ref', abas: ['Referencia_SIGTAP'], rotulo: 'Referência SIGTAP', padrao: true },
  { id: 'pac', abas: ['PACIENTES'], rotulo: 'Pacientes', padrao: true },
  { id: 'check', abas: ['CHECK_LIST'], rotulo: 'Check-list / Protocolo (CHECK_LIST)', padrao: true },
  { id: 'conf', abas: ['CONFERENCIAS'], rotulo: 'Conferências de espelhos', padrao: true },
  { id: 'sigtap', abas: [/^SIGTAP_\d{6}$/], rotulo: 'Tabela SIGTAP oficial (vale para todas as unidades)', admin: true, padrao: true },
  { id: 'usoger', abas: ['USO_IA'], rotulo: 'Uso da IA desta planilha (USO_IA) — só se ela usava chave própria; se usava o servidor, o PAINEL já tem esse histórico', admin: true, padrao: false },
  { id: 'clientes', abas: ['CLIENTES'], rotulo: 'Unidades do painel (CLIENTES: ativo, limite e código antigo)', admin: true, padrao: true },
  { id: 'uso', abas: ['USO'], rotulo: 'Histórico de consumo (USO)', admin: true, padrao: true },
  { id: 'precos', abas: ['PRECOS'], rotulo: 'Preços, margem e câmbio (PRECOS)', admin: true, padrao: true }
];

async function analisar(arquivo, etapas, log) {
  etapas.innerHTML = '<div class="carregando"><span class="spinner"></span>Lendo a planilha…</div>';
  log.innerHTML = '';
  try {
    const XLSX = await carregarXlsx();
    const wb = XLSX.read(await lerArquivoBuffer(arquivo), { type: 'array', cellDates: false });
    const abas = {};
    wb.SheetNames.forEach((n) => { abas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });

    const achar = (padroes) => wb.SheetNames.find((n) => padroes.some((p) => p instanceof RegExp ? p.test(n) : p === n));
    const opcoes = [];
    TIPOS.forEach((t) => {
      const aba = achar(t.abas);
      if (!aba) return;
      if (t.admin && !dados.souAdmin()) return;
      const n = Math.max(0, abas[aba].slice(1).filter((l) => l.some((c) => String(c).trim() !== '')).length);
      const caixa = h('input', { type: 'checkbox', checked: t.padrao && n > 0, disabled: n === 0 });
      opcoes.push({ ...t, aba, caixa, n });
    });

    etapas.innerHTML = '';
    if (!opcoes.length) {
      etapas.appendChild(h('div', { class: 'msg aviso' }, 'Não encontrei nenhuma aba conhecida nesta planilha.'));
      return;
    }
    const botao = h('button', { class: 'btn principal', style: { marginTop: '10px' } }, '📥 Importar o que está marcado');
    etapas.append(
      h('div', { class: 'secao-titulo' }, 'Encontrei nesta planilha'),
      ...opcoes.map((o) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0' } },
        o.caixa, h('span', null, o.rotulo, ' — ', h('b', null, fmtNum(o.n)), ' linha(s)', h('span', { class: 'mudo' }, ' (aba ' + o.aba + ')')))),
      botao);

    botao.addEventListener('click', async () => {
      botao.disabled = true;
      botao.innerHTML = '<span class="spinner"></span>Importando… não feche esta página';
      log.innerHTML = '';
      const escolhidas = opcoes.filter((o) => o.caixa.checked);
      for (const o of escolhidas) {
        try {
          const msg = await importar(o.id, abas[o.aba], o.aba, (t) => anotar(log, '⏳ ' + o.rotulo + ': ' + t, 'info', o.id));
          anotar(log, '✅ ' + o.rotulo + ': ' + msg, 'ok', o.id);
        } catch (e) {
          anotar(log, '❌ ' + o.rotulo + ': ' + e.message, 'erro', o.id);
        }
      }
      botao.disabled = false;
      botao.textContent = '📥 Importar de novo';
      toast('Importação concluída. Confira o resumo.', '📥 Importar');
    });
  } catch (e) {
    etapas.innerHTML = '<div class="msg erro">❌ ' + esc(e.message) + '</div>';
  }
}

function anotar(log, texto, tipo, id) {
  let el = log.querySelector('[data-id="' + id + '"]');
  if (!el) { el = h('div', { 'data-id': id }); log.appendChild(el); }
  el.className = 'msg ' + tipo;
  el.textContent = texto;
}

const resumo = (novos, total) => fmtNum(novos) + ' novo(s) de ' + fmtNum(total) + ' na planilha' + (total > novos ? ' (o resto já existia)' : '');

async function importar(id, linhas, nomeAba, progresso) {
  const u = dados.sessao.unidade;
  const avancar = (feitos, total) => progresso(fmtNum(feitos) + ' de ' + fmtNum(total));
  const totalPlanilha = Math.max(0, linhas.length - 1);

  switch (id) {
    case 'cnes': {
      const novos = conv.converterEstabelecimentos(linhas, await dados.listarEstabelecimentos());
      await dados.inserirEmLotes('estabelecimentos', novos.map((x) => ({ ...x, unidade_id: u.id })), { aoAvancar: avancar });
      return resumo(novos.length, conv.converterEstabelecimentos(linhas).length);
    }
    case 'prof': {
      const existentes = await dados.listarProfissionais();
      const novos = conv.converterProfissionais(linhas, existentes);
      await dados.inserirEmLotes('profissionais', novos.map((x) => ({ ...x, unidade_id: u.id })), { aoAvancar: avancar });
      return resumo(novos.length, conv.converterProfissionais(linhas).length);
    }
    case 'ref': {
      const novos = conv.converterReferencia(linhas, await dados.listarReferencia());
      await dados.inserirEmLotes('referencia_sigtap', novos.map((x) => ({ ...x, unidade_id: u.id })), { aoAvancar: avancar });
      return resumo(novos.length, conv.converterReferencia(linhas).length);
    }
    case 'pac': {
      progresso('conferindo quem já está cadastrado…');
      const existentes = await dados.lerTodas('pacientes', 'cns, cpf');
      const cnsJa = new Set(existentes.map((p) => p.cns).filter(Boolean));
      const cpfJa = new Set(existentes.map((p) => p.cpf).filter(Boolean));
      const todos = conv.converterPacientes(linhas);
      const novos = todos.filter((p) => {
        if ((p.cns && cnsJa.has(p.cns)) || (p.cpf && cpfJa.has(p.cpf))) return false;
        if (p.cns) cnsJa.add(p.cns);
        if (p.cpf) cpfJa.add(p.cpf);
        return true;
      });
      await dados.inserirEmLotes('pacientes', novos.map((x) => ({ ...x, unidade_id: u.id })), { aoAvancar: avancar });
      return resumo(novos.length, todos.length);
    }
    case 'check': {
      const existentes = await dados.lerTodas('protocolo', 'nome_paciente, procedimento, codigo, data_solicitacao');
      const novos = conv.converterChecklist(linhas, existentes);
      await dados.inserirEmLotes('protocolo', novos.map((x) => ({ ...x, unidade_id: u.id })), { aoAvancar: avancar });
      return resumo(novos.length, conv.converterChecklist(linhas).length);
    }
    case 'conf': {
      const existentes = await dados.lerTodas('conferencias', 'criado_em, paciente');
      const ja = new Set(existentes.map((c) => new Date(c.criado_em).getTime() + '|' + c.paciente));
      const todas = conv.converterConferencias(linhas);
      const novas = todas.filter((c) => !ja.has(new Date(c.criado_em).getTime() + '|' + c.paciente));
      await dados.inserirEmLotes('conferencias', novas.map((x) => ({ ...x, unidade_id: u.id })), { lote: 200, aoAvancar: avancar });
      return resumo(novas.length, todas.length);
    }
    case 'sigtap': {
      const lista = conv.converterSigtap(linhas, nomeAba);
      if (lista.length < 3000) throw new Error('A aba trouxe só ' + lista.length + ' procedimentos (o normal é mais de 4.000). Pode estar incompleta.');
      await dados.inserirEmLotes('sigtap_procedimentos', lista, { lote: 1000, aoAvancar: avancar, upsert: 'competencia,codigo' });
      return fmtNum(lista.length) + ' procedimentos da competência ' + lista[0].competencia + ' (os que já existiam foram mantidos)';
    }
    case 'usoger':
    case 'uso': {
      progresso('conferindo o que já foi importado…');
      const existentes = await dados.lerTodas('uso_ia', 'criado_em, unidade_nome, funcao, tokens_entrada, tokens_saida');
      const ja = new Set(existentes.map(conv.chaveUso));
      const unidades = await dados.listarUnidades();
      const porNome = new Map(unidades.map((x) => [x.nome.toUpperCase(), x]));
      const todos = id === 'uso' ? conv.converterUsoPainel(linhas, porNome) : conv.converterUsoGeradora(linhas, u);
      const novos = todos.filter((x) => !ja.has(conv.chaveUso(x)));
      await dados.inserirEmLotes('uso_ia', novos, { aoAvancar: avancar });
      const semUnidade = new Set(novos.filter((x) => !x.unidade_id).map((x) => x.unidade_nome));
      return resumo(novos.length, todos.length) +
        (semUnidade.size ? '. Sem unidade correspondente no sistema (fica só pelo nome): ' + [...semUnidade].join(', ') : '');
    }
    case 'clientes': {
      const clientes = conv.converterClientes(linhas);
      const unidades = await dados.listarUnidades();
      let criadas = 0, atualizadas = 0;
      for (const c of clientes) {
        let un = unidades.find((x) => x.nome.toUpperCase() === c.nome.toUpperCase());
        if (!un) {
          const novoId = await dados.criarUnidade({ nome: c.nome, municipio: u.municipio, uf: u.uf });
          un = { id: novoId };
          criadas++;
        } else atualizadas++;
        await dados.atualizarUnidade(un.id, { ativo: c.ativo, limite_mensal_tokens: c.limite_mensal_tokens,
          codigo_hash: c.codigo_hash, observacoes: c.observacoes });
      }
      return criadas + ' unidade(s) criada(s) e ' + atualizadas + ' atualizada(s). Os códigos APAC-… antigos continuam valendo para as planilhas.';
    }
    case 'precos': {
      const p = conv.converterPrecos(linhas);
      await dados.salvarPrecos(p);
      return 'entrada US$ ' + p.preco_entrada + ' · saída US$ ' + p.preco_saida + ' · margem ' + Math.round(p.margem * 100) + '% · câmbio R$ ' + p.cambio;
    }
    default:
      return 'nada a fazer (' + totalPlanilha + ')';
  }
}
