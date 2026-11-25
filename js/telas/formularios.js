/**
 * 🗂️ FORMULÁRIOS PRÉ-PREENCHIDOS (Ferramentas ▸ Formulários pré-preenchidos)
 *
 * Escolhe o paciente (do cadastro ou digitado), marca os formulários da
 * Secretaria e baixa um PDF só, com a identificação já escrita por cima do
 * modelo oficial: bariátrica (Anexos I, II e III), eletroneuromiografia,
 * PTS e laudo de AIH. A parte clínica fica em branco para o profissional.
 *
 * #/formularios/<chave> já abre com aquele formulário marcado.
 * Nada é gravado no banco e não gasta IA.
 */
import * as dados from '../dados.js';
import { h, toast, alerta, comCarregando, atrasar, baixarPdf, abrirPdf } from '../ui.js';
import { esc, isoParaBR, mascararData } from '../lib/texto.js';
import { soDigitos, motivoCNSInvalido, validarCPF } from '../lib/validacao.js';
import { buscarCep } from '../lib/endereco.js';
import { FORMULARIOS, gerarFormularios, nomeArquivoFormularios, calcularImc, idadeEmAnos } from '../lib/formularios-sms.js';

const PASTA_MODELOS = new URL('../../protocolos/sms/', import.meta.url);

const ESTILO = `
.form-grade { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(280px, 380px); gap: 16px; align-items: start; }
.form-linha { display: grid; gap: 8px; }
.form-linha.c2 { grid-template-columns: 1fr 1fr; }
.form-linha.c3 { grid-template-columns: 1fr 1fr 1fr; }
.form-linha.c4 { grid-template-columns: 2fr 1fr 1fr 1fr; }
.form-busca-res { display: flex; flex-direction: column; gap: 4px; margin: -4px 0 10px; }
.form-busca-res button { text-align: left; border: 1px solid var(--borda-card); background: #fff; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.form-busca-res button:hover { border-color: var(--primaria); background: var(--busca-fundo); }
.form-busca-res button span { display: block; font-size: 12px; color: var(--rotulo); }
.form-lista label { display: flex; gap: 8px; align-items: flex-start; padding: 7px 4px; border-bottom: 1px solid var(--borda-card); cursor: pointer; font-size: 14px; }
.form-lista label:last-child { border-bottom: 0; }
.form-lista input { margin-top: 3px; flex: none; }
.form-lista small { display: block; color: var(--rotulo); font-size: 12px; }
.form-imc { font-size: 13px; margin: -4px 0 8px; color: var(--rotulo); }
.form-aviso { font-size: 11.5px; color: var(--erro); margin: -6px 0 8px; }
.form-botoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.form-botoes .principal { flex: 1; }
@media (max-width: 900px) { .form-grade { grid-template-columns: 1fr; } .form-linha.c4, .form-linha.c3 { grid-template-columns: 1fr 1fr; } }
`;

const DESCRICOES = {
  bariatrica1: 'Médico. Critérios de inclusão e exclusão. Preenche também estabelecimento, CNES e IMC.',
  bariatrica2: 'Nutricionista. Preenche também peso, altura e IMC do exame físico.',
  bariatrica3: 'Psicólogo. Pede o nome da mãe e do pai.',
  enmg: 'Obrigatório junto com o pedido de ENMG. O verso (mapa do corpo) vai em branco para o médico.',
  pts: 'Só a parte 1 (identificação).',
  aih: 'Estabelecimento solicitante, CNES e identificação do paciente. A justificativa é do médico.'
};

export async function montar(area) {
  if (!document.getElementById('estilo-formularios')) document.head.appendChild(h('style', { id: 'estilo-formularios' }, ESTILO));
  const u = dados.sessao.unidade || {};
  const m = location.hash.match(/^#\/formularios\/([a-z0-9]+)/);
  const marcadoDoEndereco = m ? m[1] : '';

  const entrada = (props) => h('input', Object.assign({ type: 'text', autocomplete: 'off' }, props));
  const bloco = (rotulo, el) => h('div', { class: 'campo' }, h('label', null, rotulo), el);

  const f = {
    nome: entrada({ class: 'maiusc' }),
    nascimento: entrada({ inputmode: 'numeric', maxlength: 10, placeholder: 'dd/mm/aaaa' }),
    sexo: h('select', null, h('option', { value: '' }, '—'), h('option', { value: 'F' }, 'Feminino'), h('option', { value: 'M' }, 'Masculino')),
    cns: entrada({ inputmode: 'numeric', maxlength: 15 }),
    cpf: entrada({ inputmode: 'numeric', maxlength: 11 }),
    rg: entrada({ class: 'maiusc' }),
    prontuario: entrada({}),
    mae: entrada({ class: 'maiusc' }),
    pai: entrada({ class: 'maiusc', placeholder: 'só o Anexo III da bariátrica pede' }),
    telefone: entrada({ inputmode: 'numeric', maxlength: 11, placeholder: 'DDD + número' }),
    cep: entrada({ inputmode: 'numeric', maxlength: 8 }),
    logradouro: entrada({ class: 'maiusc' }),
    numero: entrada({}),
    complemento: entrada({ class: 'maiusc' }),
    bairro: entrada({ class: 'maiusc' }),
    municipio: entrada({ class: 'maiusc', value: (u.municipio || '').toUpperCase() }),
    uf: entrada({ class: 'maiusc', maxlength: 2, value: (u.uf || '').toUpperCase() }),
    ibge: entrada({ inputmode: 'numeric', maxlength: 7 }),
    estab: h('select'),
    estab_nome: entrada({ class: 'maiusc' }),
    estab_cnes: entrada({ inputmode: 'numeric', maxlength: 7 }),
    peso: entrada({ inputmode: 'decimal', placeholder: 'ex.: 118,5' }),
    altura: entrada({ inputmode: 'decimal', placeholder: 'ex.: 1,62' })
  };
  f.nascimento.addEventListener('input', () => { f.nascimento.value = mascararData(f.nascimento.value); mostrarIdade(); });
  ['cns', 'cpf', 'telefone', 'cep', 'ibge', 'estab_cnes'].forEach((k) => f[k].addEventListener('input', () => { f[k].value = soDigitos(f[k].value); }));

  const avisoDoc = h('div', { class: 'form-aviso' });
  const conferirDocs = () => {
    const avisos = [];
    const cns = soDigitos(f.cns.value);
    if (cns && motivoCNSInvalido(cns)) avisos.push('Cartão SUS ' + motivoCNSInvalido(cns) + '.');
    const cpf = soDigitos(f.cpf.value);
    if (cpf && (cpf.length !== 11 || !validarCPF(cpf))) avisos.push('CPF com dígito errado.');
    avisoDoc.textContent = avisos.join(' ');
  };
  f.cns.addEventListener('change', conferirDocs);
  f.cpf.addEventListener('change', conferirDocs);

  const idadeTxt = h('span', { class: 'mudo pequeno' });
  function mostrarIdade() {
    const i = idadeEmAnos(f.nascimento.value);
    idadeTxt.textContent = i ? ' · ' + i + ' anos' : '';
  }

  const imcTxt = h('div', { class: 'form-imc' }, 'Peso e altura são opcionais (só os formulários de bariátrica usam).');
  const mostrarImc = () => {
    const imc = calcularImc(f.peso.value, f.altura.value);
    imcTxt.innerHTML = imc ? 'IMC: <b>' + esc(imc) + ' kg/m²</b>' : 'Peso e altura são opcionais (só os formulários de bariátrica usam).';
  };
  f.peso.addEventListener('input', mostrarImc);
  f.altura.addEventListener('input', mostrarImc);

  // ---------- CEP → endereço ----------
  const statusCep = h('div', { class: 'mudo pequeno', style: { margin: '-6px 0 8px' } });
  async function preencherCep(sobrescrever) {
    const cep = soDigitos(f.cep.value);
    if (cep.length !== 8) return;
    statusCep.textContent = 'Buscando o CEP…';
    try {
      const r = await buscarCep(cep);
      if (!r) { statusCep.textContent = 'CEP não encontrado: preencha o endereço à mão.'; return; }
      const por = (k, v) => { if (v && (sobrescrever || !f[k].value.trim())) f[k].value = v; };
      por('logradouro', r.logradouro); por('bairro', r.bairro); por('municipio', r.municipio); por('uf', r.uf); por('ibge', r.cod_ibge);
      statusCep.textContent = '';
    } catch (e) {
      statusCep.textContent = 'Não consegui buscar o CEP agora: preencha o endereço à mão.';
    }
  }
  f.cep.addEventListener('change', () => preencherCep(true));

  // ---------- estabelecimento ----------
  const OUTRO = '__outro';
  let estabelecimentos = [];
  const usarEstab = () => {
    const e = estabelecimentos.find((x) => String(x.id) === f.estab.value);
    if (e) { f.estab_nome.value = String(e.nome || '').toUpperCase(); f.estab_cnes.value = e.cnes || ''; }
    blocoEstabManual.style.display = f.estab.value === OUTRO ? '' : 'none';
  };
  f.estab.addEventListener('change', usarEstab);
  const blocoEstabManual = h('div', { class: 'form-linha c2', style: { display: 'none' } },
    bloco('Nome do estabelecimento', f.estab_nome), bloco('CNES', f.estab_cnes));
  dados.listarEstabelecimentos().then((lista) => {
    estabelecimentos = (lista || []).slice().sort((a, b) => (b.padrao ? 1 : 0) - (a.padrao ? 1 : 0));
    f.estab.innerHTML = '';
    estabelecimentos.forEach((e) => f.estab.appendChild(h('option', { value: String(e.id) }, (e.padrao ? '⭐ ' : '') + e.nome + ' · CNES ' + e.cnes)));
    f.estab.appendChild(h('option', { value: OUTRO }, 'Outro (digitar)…'));
    if (!estabelecimentos.length) { f.estab.value = OUTRO; f.estab_nome.value = (u.nome || '').toUpperCase(); }
    usarEstab();
  }).catch(() => {
    f.estab.appendChild(h('option', { value: OUTRO }, 'Digitar…'));
    f.estab.value = OUTRO; f.estab_nome.value = (u.nome || '').toUpperCase(); usarEstab();
  });

  // ---------- busca de paciente ----------
  const resultados = h('div', { class: 'form-busca-res' });
  const campoBusca = h('input', { type: 'search', placeholder: 'Nome, Cartão SUS ou CPF do paciente', autocomplete: 'off' });
  const buscar = atrasar(async (termo) => {
    resultados.innerHTML = '';
    if (String(termo || '').trim().length < 3) return;
    try {
      const r = await dados.buscarPacientes(termo);
      resultados.innerHTML = '';
      if (!r.lista.length) { resultados.appendChild(h('div', { class: 'mudo pequeno' }, 'Nenhum paciente encontrado. Pode digitar os dados abaixo.')); return; }
      r.lista.forEach((p) => resultados.appendChild(h('button', { type: 'button', onclick: async () => {
        try {
          carregarPaciente(await dados.pacientePorId(p.id));
          resultados.innerHTML = '';
          campoBusca.value = '';
        } catch (e) { toast(e.message, 'Erro', 'erro'); }
      } }, h('strong', null, p.nome), h('span', null, (p.nasc ? 'Nasc. ' + p.nasc + ' · ' : '') + 'CNS ' + (p.cns || '—')))));
    } catch (e) {
      resultados.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>';
    }
  });
  campoBusca.addEventListener('input', () => buscar(campoBusca.value));

  function carregarPaciente(p) {
    f.nome.value = String(p.nome || '').toUpperCase();
    f.nascimento.value = p.nascimento ? isoParaBR(p.nascimento) : '';
    const sx = String(p.sexo || '').toUpperCase();
    f.sexo.value = sx.startsWith('F') ? 'F' : sx.startsWith('M') ? 'M' : '';
    f.cns.value = soDigitos(p.cns); f.cpf.value = soDigitos(p.cpf);
    f.mae.value = String(p.nome_mae || '').toUpperCase();
    f.telefone.value = soDigitos(p.telefone);
    f.prontuario.value = p.prontuario || '';
    f.numero.value = p.numero || ''; f.complemento.value = String(p.complemento || '').toUpperCase();
    f.rg.value = ''; f.pai.value = '';
    ['logradouro', 'bairro', 'ibge'].forEach((k) => { f[k].value = ''; });
    f.cep.value = soDigitos(p.cep);
    mostrarIdade(); conferirDocs();
    toast(p.nome, '✅ Paciente carregado', 'ok', 3);
    if (f.cep.value.length === 8) preencherCep(true);
  }

  // ---------- formulários ----------
  const marcas = {};
  const lista = h('div', { class: 'form-lista' }, ...FORMULARIOS.map((fo) => {
    marcas[fo.chave] = h('input', { type: 'checkbox', defaultChecked: fo.chave === marcadoDoEndereco });
    return h('label', null, marcas[fo.chave], h('span', null, fo.rotulo, h('small', null, DESCRICOES[fo.chave] || '')));
  }));
  const marcarGrupo = (prefixo, valor) => FORMULARIOS.forEach((fo) => { if (fo.chave.startsWith(prefixo)) marcas[fo.chave].checked = valor; });

  const valores = () => ({
    nome: f.nome.value, nascimento: f.nascimento.value, sexo: f.sexo.value, cns: f.cns.value, cpf: f.cpf.value, rg: f.rg.value,
    prontuario: f.prontuario.value, mae: f.mae.value, pai: f.pai.value, telefone: f.telefone.value, cep: f.cep.value,
    logradouro: f.logradouro.value, numero: f.numero.value, complemento: f.complemento.value, bairro: f.bairro.value,
    municipio: f.municipio.value, uf: f.uf.value, ibge: f.ibge.value,
    estab_nome: f.estab_nome.value, estab_cnes: f.estab_cnes.value, unidade: f.estab_nome.value || u.nome,
    peso: f.peso.value, altura: f.altura.value
  });

  async function gerar(botao, acao) {
    const escolhidos = FORMULARIOS.filter((fo) => marcas[fo.chave].checked).map((fo) => fo.chave);
    if (!escolhidos.length) { toast('Marque pelo menos um formulário.', 'Atenção', 'aviso'); return; }
    if (!f.nome.value.trim()) { toast('Escolha o paciente ou digite o nome.', 'Atenção', 'aviso'); return; }
    if (f.nascimento.value && !/^\d{2}\/\d{2}\/\d{4}$/.test(f.nascimento.value)) { toast('Data de nascimento no formato dd/mm/aaaa.', 'Atenção', 'aviso'); return; }
    await comCarregando(botao, 'Gerando…', async () => {
      try {
        const bytes = await gerarFormularios(escolhidos, valores(), async (arquivo) => {
          const r = await fetch(new URL(arquivo, PASTA_MODELOS).href);
          if (!r.ok) throw new Error('Não encontrei o modelo ' + arquivo + ' (' + r.status + ').');
          return r.arrayBuffer();
        });
        if (acao === 'abrir') abrirPdf(bytes);
        else baixarPdf(bytes, nomeArquivoFormularios(escolhidos, f.nome.value));
      } catch (e) {
        alerta('Não consegui gerar', esc(e.message));
      }
    });
  }
  const botaoBaixar = h('button', { type: 'button', class: 'btn principal' }, '⬇️ Baixar PDF');
  botaoBaixar.addEventListener('click', () => gerar(botaoBaixar, 'baixar'));
  const botaoAbrir = h('button', { type: 'button', class: 'btn' }, '🖨️ Abrir para imprimir');
  botaoAbrir.addEventListener('click', () => gerar(botaoAbrir, 'abrir'));

  const limpar = h('button', { type: 'button', class: 'btn', onclick: () => {
    Object.entries(f).forEach(([k, el]) => { if (el.tagName === 'INPUT' && !['municipio', 'uf', 'estab_nome', 'estab_cnes'].includes(k)) el.value = ''; });
    f.sexo.value = ''; mostrarIdade(); mostrarImc(); conferirDocs(); campoBusca.focus();
  } }, '✨ Limpar');

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '🗂️ Formulários pré-preenchidos'),
      h('p', null, 'Os formulários da Secretaria de Saúde de Nova Mutum com a identificação do paciente já preenchida. A parte clínica fica em branco para o profissional.'))),
    h('div', { class: 'form-grade' },
      h('section', { class: 'card' }, h('h2', null, '1. Paciente'), h('div', { class: 'card-conteudo' },
        bloco('Buscar no cadastro', campoBusca), resultados,
        bloco('Nome completo', f.nome),
        h('div', { class: 'form-linha c3' },
          h('div', { class: 'campo' }, h('label', null, 'Nascimento', idadeTxt), f.nascimento),
          bloco('Sexo', f.sexo), bloco('Nº prontuário', f.prontuario)),
        h('div', { class: 'form-linha c3' }, bloco('Cartão SUS', f.cns), bloco('CPF', f.cpf), bloco('RG', f.rg)),
        avisoDoc,
        bloco('Nome da mãe', f.mae),
        h('div', { class: 'form-linha c2' }, bloco('Nome do pai', f.pai), bloco('Telefone', f.telefone)),
        h('div', { class: 'form-linha c4' }, bloco('CEP', f.cep), bloco('Número', f.numero), bloco('Complemento', f.complemento), bloco('Cód. IBGE', f.ibge)),
        statusCep,
        h('div', { class: 'form-linha c2' }, bloco('Rua', f.logradouro), bloco('Bairro', f.bairro)),
        h('div', { class: 'form-linha c2' }, bloco('Município', f.municipio), bloco('UF', f.uf)),
        h('div', { class: 'form-linha c2' }, bloco('Peso (kg)', f.peso), bloco('Altura (m)', f.altura)),
        imcTxt)),
      h('div', null,
        h('section', { class: 'card' }, h('h2', null, '2. Estabelecimento'), h('div', { class: 'card-conteudo' },
          bloco('Estabelecimento solicitante', f.estab), blocoEstabManual)),
        h('section', { class: 'card' }, h('h2', null, '3. Formulários'), h('div', { class: 'card-conteudo' },
          h('div', { class: 'botoes', style: { marginBottom: '6px' } },
            h('button', { type: 'button', class: 'btn pequeno', onclick: () => marcarGrupo('bariatrica', true) }, 'Marcar os 3 da bariátrica'),
            h('button', { type: 'button', class: 'btn pequeno', onclick: () => marcarGrupo('', false) }, 'Desmarcar todos')),
          lista,
          h('div', { class: 'form-botoes' }, botaoBaixar, botaoAbrir, limpar),
          h('p', { class: 'pequeno mudo', style: { marginBottom: 0 } },
            '🔒 Feito no seu computador: os dados não são gravados e não gastam IA. Confira o PDF antes de imprimir.'))))));
  campoBusca.focus();
}
