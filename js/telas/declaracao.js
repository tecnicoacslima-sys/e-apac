/**
 * 📝 DECLARAÇÃO DE CIÊNCIA – APAC (Ferramentas ▸ Declaração de ciência)
 *
 * Para paciente com o nome (ou o nome da mãe) diferente entre a certidão/RG
 * e o CPF/Cartão SUS ou o CELK. O formulário fica à esquerda e a folha A4
 * à direita, mudando enquanto se digita. "Imprimir / Salvar PDF" abre a folha
 * numa janela própria, já com o brasão da prefeitura.
 *
 * Pode chegar já preenchida pela Conferência de espelhos (botão
 * "📝 Declaração de ciência" quando o nome ou o nome da mãe divergem).
 * Nada é gravado no banco: só a lista de procedimentos e cartórios usados
 * e o CNPJ ficam lembrados neste navegador.
 */
import * as dados from '../dados.js';
import { h, alerta, confirmar } from '../ui.js';
import { esc } from '../lib/texto.js';
import {
  montarDeclaracao, pegarPreenchimento, hojeISO, mascaraCPF, nomeEstado, cnpjPadrao, brasaoPadrao, FONTES_B
} from '../lib/declaracao.js';
import { validarCPF } from '../lib/validacao.js';

const PROC_PADRAO = ['CONSULTA COM PEDIATRA', 'CONSULTA COM NEUROLOGISTA', 'CONSULTA COM ORTOPEDISTA',
  'CONSULTA COM CARDIOLOGISTA', 'CONSULTA COM OFTALMOLOGISTA', 'CONSULTA COM OTORRINOLARINGOLOGISTA',
  'CONSULTA COM DERMATOLOGISTA', 'CONSULTA COM PSICÓLOGO', 'CONSULTA COM PSIQUIATRA', 'FISIOTERAPIA'];
const CARTORIOS_PADRAO = ['CARTÓRIO DE REGISTRO CIVIL DO 1º OFÍCIO', 'CARTÓRIO DE REGISTRO CIVIL DO 2º OFÍCIO'];
const PARENTESCOS = ['mãe', 'pai', 'avó', 'avô', 'tia', 'tio', 'tutora', 'tutor', 'guardiã', 'guardião', 'madrasta', 'padrasto'];

/** Estilo da folha: o mesmo na prévia e na impressão. */
const ESTILO_FOLHA = `
.decl-folha { width: 210mm; min-height: 297mm; background: #fff; padding: 22mm 26mm 20mm; font-family: Arial, "Liberation Sans", sans-serif; color: #000; box-sizing: border-box; }
.decl-folha .cab { display: flex; align-items: center; gap: 7mm; }
.decl-folha .cab img { width: 18mm; height: auto; }
.decl-folha .cab div { font-size: 9pt; letter-spacing: 1.3px; line-height: 1.45; }
.decl-folha .titulo { text-align: center; font-weight: bold; font-size: 13pt; margin: 26mm 0 20mm; }
.decl-folha .texto p { font-size: 11pt; line-height: 1.55; text-align: justify; text-indent: 12mm; margin: 0 0 9mm; }
.decl-folha .local { text-align: right; font-size: 11pt; margin-top: 18mm; }
.decl-folha .assin { margin: 30mm auto 0; width: 95mm; text-align: center; font-size: 10pt; }
.decl-folha .assin .traco { border-top: 1px solid #000; margin-bottom: 2mm; }
.decl-folha .falta { background: #fff1a8; color: #8a6d00; }
`;

const ESTILO = ESTILO_FOLHA + `
.decl-grade { display: grid; grid-template-columns: minmax(320px, 430px) 1fr; gap: 16px; align-items: start; }
.decl-form fieldset { border: 1px solid var(--borda-card); border-radius: 6px; margin: 0 0 12px; padding: 8px 12px 6px; }
.decl-form legend { font-weight: 700; color: var(--primaria); font-size: 13px; padding: 0 4px; }
.decl-opcoes { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; margin: 2px 0 8px; }
.decl-opcoes label, .campo .decl-opcoes label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; text-transform: none; font-size: 13px; font-weight: 400; color: var(--texto); letter-spacing: 0; margin: 0; white-space: normal; overflow: visible; }
.decl-opcoes input[type=radio], .decl-opcoes input[type=checkbox], .campo .decl-opcoes input { width: auto; min-height: 0; height: auto; padding: 0; margin: 0; flex: none; }
.decl-linha { display: flex; gap: 8px; } .decl-linha > .campo { flex: 1; }
.decl-dica { font-size: 11.5px; color: var(--rotulo); margin: -4px 0 8px; }
.decl-aviso { font-size: 11.5px; color: var(--erro); margin: -6px 0 8px; }
.decl-botoes { position: sticky; bottom: 0; background: var(--card); padding: 10px 0 2px; display: flex; gap: 8px; }
.decl-botoes .principal { flex: 1; }
.decl-previa { background: #8A96A5; border-radius: var(--raio); padding: 16px; overflow: auto; display: flex; justify-content: center; }
.decl-previa .decl-folha { box-shadow: 0 2px 10px rgba(0,0,0,.3); transform-origin: top center; }
.oculto { display: none !important; }
@media (max-width: 1000px) { .decl-grade { grid-template-columns: 1fr; } }
`;

// ------------------------------------------------------------
// Memória do navegador (pode falhar; tudo funciona sem ela)
// ------------------------------------------------------------
function ler(chave, padrao) { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } }
function gravar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem memória */ } }
function lembrar(chave, valor) {
  valor = String(valor || '').trim().toUpperCase();
  if (!valor) return;
  gravar(chave, [valor].concat(ler(chave, []).filter((v) => v !== valor)).slice(0, 30));
}
const listaCom = (chave, base) => [...new Set([...ler(chave, []), ...base])];

// ------------------------------------------------------------
// Brasão: o da unidade (Dados da unidade); senão o do município, se o site tiver
// ------------------------------------------------------------
let brasaoCache = { unidade: null, url: '' };
async function urlBrasao() {
  const u = dados.sessao.unidade || {};
  if (brasaoCache.unidade === u.id) return brasaoCache.url;
  let url = '';
  if (u.logo_path) {
    try {
      const link = await dados.linkTemporario('logos', u.logo_path, 600);
      url = await paraDataUrl(link);
    } catch (e) { url = ''; }
  }
  if (!url && brasaoPadrao(u.municipio)) {
    try { url = await paraDataUrl(new URL('../../' + brasaoPadrao(u.municipio), import.meta.url).href); } catch (e) { url = ''; }
  }
  brasaoCache = { unidade: u.id, url };
  return url;
}
/** A janela de impressão recebe a imagem dentro do HTML (não depende de link que expira). */
async function paraDataUrl(link) {
  const r = await fetch(link);
  if (!r.ok) throw new Error('sem imagem');
  const blob = await r.blob();
  return await new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = falha;
    fr.readAsDataURL(blob);
  });
}

// ------------------------------------------------------------
// TELA
// ------------------------------------------------------------
let estado = null;

export async function montar(area) {
  if (!document.getElementById('estilo-declaracao')) document.head.appendChild(h('style', { id: 'estilo-declaracao' }, ESTILO));
  const u = dados.sessao.unidade || {};
  const chaveCnpj = 'apac.decl.cnpj.' + (u.id || '');
  const veio = pegarPreenchimento();

  // ---------- campos ----------
  const radio = (nome, valor, texto, marcado) =>
    h('label', null, h('input', { type: 'radio', name: nome, value: valor, defaultChecked: !!marcado }), ' ' + texto);
  const lista = (id, itens) => h('datalist', { id }, ...itens.map((v) => h('option', { value: v })));
  const entrada = (props) => h('input', Object.assign({ type: 'text', autocomplete: 'off' }, props));
  const bloco = (rotulo, el, extra) => h('div', { class: 'campo' + (extra ? ' ' + extra : '') }, h('label', null, rotulo), el);

  const f = {
    unidade: entrada({ class: 'maiusc', value: (u.nome || '').toUpperCase() }),
    cnpj: entrada({ value: ler(chaveCnpj, null) ?? cnpjPadrao(u.municipio, u.uf), placeholder: 'ex.: 24.772.162/0001-06' }),
    nome: entrada({ class: 'maiusc' }),
    rg: entrada({ class: 'maiusc' }),
    cpf: entrada({ inputmode: 'numeric', maxlength: 14 }),
    parentesco: entrada({ list: 'decl-parentescos', placeholder: 'ex.: mãe' }),
    paciente: entrada({ class: 'maiusc' }),
    faixa: h('select', null, h('option', { value: 'crianca' }, 'Criança (até 11 anos)'), h('option', { value: 'adolescente' }, 'Adolescente (12 a 17)')),
    nomeB: entrada({ class: 'maiusc' }),
    nomeCert: entrada({ class: 'maiusc' }),
    cartorio: entrada({ class: 'maiusc', list: 'decl-cartorios', value: ler('apac.decl.cartorioAtual', CARTORIOS_PADRAO[1]) }),
    proc: entrada({ class: 'maiusc', list: 'decl-procs', placeholder: 'ex.: CONSULTA COM PEDIATRA' }),
    dataEnc: h('input', { type: 'date', value: hojeISO() }),
    dataDecl: h('input', { type: 'date', value: hojeISO() }),
    nomeAssin: h('input', { type: 'checkbox', defaultChecked: true })
  };
  const avisoCpf = h('div', { class: 'decl-aviso' });
  const legDeclarante = h('legend', null, '3. Dados do paciente (quem assina)');
  const blocoParentesco = bloco('Parentesco com o paciente', f.parentesco, 'oculto');
  const blocoMenor = h('fieldset', { class: 'oculto' }, h('legend', null, '4. Dados da criança / adolescente'),
    bloco('Nome completo do paciente (o nome correto)', f.paciente),
    h('div', { class: 'decl-linha' },
      bloco('Faixa', f.faixa),
      h('div', { class: 'campo' }, h('label', null, 'Sexo do paciente'),
        h('div', { class: 'decl-opcoes' }, radio('d-sexoPac', 'F', 'F', true), radio('d-sexoPac', 'M', 'M')))));
  const rotB = h('label', null, '');
  const rotCert = h('label', null, '');
  const blocoCartorio = bloco('Nome do cartório', f.cartorio, 'oculto');
  const avisoConf = h('div');

  const form = h('form', { class: 'decl-form', autocomplete: 'off', onsubmit: (e) => e.preventDefault() },
    lista('decl-parentescos', PARENTESCOS),
    lista('decl-cartorios', listaCom('apac.decl.cartorios', CARTORIOS_PADRAO)),
    lista('decl-procs', listaCom('apac.decl.procs', PROC_PADRAO)),
    avisoConf,
    h('fieldset', null, h('legend', null, '1. Cabeçalho'),
      bloco('Nome da unidade', f.unidade),
      bloco('CNPJ da prefeitura (fica salvo neste computador)', f.cnpj)),
    h('fieldset', null, h('legend', null, '2. Quem é o paciente?'),
      h('div', { class: 'decl-opcoes' },
        radio('d-idade', 'adulto', 'Maior de idade (assina por si)', true),
        radio('d-idade', 'menor', 'Criança ou adolescente'))),
    h('fieldset', null, legDeclarante,
      bloco('Nome completo', f.nome),
      h('div', { class: 'decl-linha' }, bloco('RG ou CNH nº', f.rg), bloco('CPF nº', f.cpf)),
      avisoCpf,
      h('div', { class: 'campo' }, h('label', null, 'Sexo (para "portador/portadora")'),
        h('div', { class: 'decl-opcoes' }, radio('d-sexo', 'M', 'Masculino', true), radio('d-sexo', 'F', 'Feminino'))),
      blocoParentesco),
    blocoMenor,
    h('fieldset', null, h('legend', null, '5. A divergência'),
      h('div', { class: 'campo' }, h('label', null, 'O que está diferente?'),
        h('div', { class: 'decl-opcoes' }, radio('d-tipo', 'nome', 'Nome do paciente', true), radio('d-tipo', 'mae', 'Nome da mãe'))),
      h('div', { class: 'campo' }, rotCert, f.nomeCert),
      h('div', { class: 'campo' }, h('label', null, 'Comparado com'),
        h('div', { class: 'decl-opcoes' }, radio('d-fonteB', 'cpf', FONTES_B.cpf.rotulo, true), radio('d-fonteB', 'celk', FONTES_B.celk.rotulo))),
      h('div', { class: 'campo' }, rotB, f.nomeB),
      h('div', { class: 'decl-dica' }, 'Digite exatamente como aparece em cada documento, com o erro.'),
      h('div', { class: 'campo' }, h('label', null, 'Onde deve regularizar?'),
        h('div', { class: 'decl-opcoes' },
          radio('d-local', 'receita', 'Receita Federal (o CPF está errado)', true),
          radio('d-local', 'cartorio', 'Cartório (a certidão está errada)'))),
      blocoCartorio),
    h('fieldset', null, h('legend', null, '6. Encaminhamento (APAC)'),
      bloco('Procedimento', f.proc),
      h('div', { class: 'decl-linha' }, bloco('Data do encaminhamento', f.dataEnc), bloco('Data desta declaração', f.dataDecl))),
    h('fieldset', null, h('legend', null, '7. Assinatura'),
      h('div', { class: 'decl-opcoes' }, h('label', null, f.nomeAssin, ' Mostrar o nome abaixo da linha de assinatura'))),
    h('div', { class: 'decl-botoes' },
      h('button', { type: 'button', class: 'btn', onclick: () => limpar() }, 'Limpar'),
      h('button', { type: 'button', class: 'btn principal', onclick: () => imprimir() }, '🖨️ Imprimir / Salvar PDF')));

  // ---------- folha ----------
  const imgBrasao = h('img', { alt: '', class: 'oculto' });
  const out = {
    cab: h('div'), p1: h('p'), p2: h('p'), data: h('div', { class: 'local' }), assin: h('div')
  };
  const folha = h('div', { class: 'decl-folha' },
    h('div', { class: 'cab' }, imgBrasao, out.cab),
    h('div', { class: 'titulo' }, 'DECLARAÇÃO DE CIÊNCIA'),
    h('div', { class: 'texto' }, out.p1, out.p2),
    out.data,
    h('div', { class: 'assin' }, h('div', { class: 'traco' }), out.assin));
  const previa = h('div', { class: 'decl-previa' }, folha);

  area.append(
    h('div', { class: 'titulo-tela' }, h('div', null,
      h('h1', null, '📝 Declaração de ciência – APAC'),
      h('p', { class: 'mudo' }, 'Para paciente com o nome ou o nome da mãe diferente entre os documentos. Preencha à esquerda; a folha muda na hora.'))),
    h('div', { class: 'decl-grade' },
      h('section', { class: 'card' }, h('div', { class: 'card-conteudo' }, form)),
      previa));

  // ---------- leitura do formulário ----------
  const marcado = (nome) => (form.querySelector('input[name="' + nome + '"]:checked') || {}).value;
  const marcar = (nome, valor) => { const r = form.querySelector('input[name="' + nome + '"][value="' + valor + '"]'); if (r) r.checked = true; };
  const valores = () => ({
    municipio: u.municipio, uf: u.uf,
    menor: marcado('d-idade') === 'menor', sexo: marcado('d-sexo'), sexoPac: marcado('d-sexoPac'),
    tipo: marcado('d-tipo'), fonteB: marcado('d-fonteB'), local: marcado('d-local'),
    nome: f.nome.value, rg: f.rg.value, cpf: f.cpf.value, parentesco: f.parentesco.value,
    paciente: f.paciente.value, faixa: f.faixa.value, nomeB: f.nomeB.value, nomeCert: f.nomeCert.value,
    cartorio: f.cartorio.value, proc: f.proc.value, dataEnc: f.dataEnc.value, dataDecl: f.dataDecl.value,
    nomeAssin: f.nomeAssin.checked
  });

  const cabecalhoHtml = () => {
    const estadoNome = nomeEstado(u.uf);
    const cnpj = f.cnpj.value.trim();
    const linha2 = [estadoNome ? 'ESTADO DE ' + estadoNome : '', cnpj ? 'CNPJ: ' + cnpj : ''].filter(Boolean).join(' – ');
    return '<b>PREFEITURA MUNICIPAL DE ' + esc(String(u.municipio || '').toUpperCase()) + (u.uf ? ' – ' + esc(u.uf.toUpperCase()) : '') + '</b><br>' +
      (linha2 ? esc(linha2) + '<br>' : '') + 'SECRETARIA MUNICIPAL DE SAÚDE<br>' +
      '<b>' + (f.unidade.value.trim() ? esc(f.unidade.value.trim().toUpperCase()) : '<span class="falta">[UNIDADE]</span>') + '</b>';
  };

  const atualizar = () => {
    const v = valores();
    blocoMenor.classList.toggle('oculto', !v.menor);
    blocoParentesco.classList.toggle('oculto', !v.menor);
    blocoCartorio.classList.toggle('oculto', v.local !== 'cartorio');
    legDeclarante.textContent = v.menor ? '3. Dados do responsável legal (quem assina)' : '3. Dados do paciente (quem assina)';
    const quem = v.tipo === 'mae' ? 'Nome da mãe' : 'Nome';
    rotCert.textContent = quem + ' como está no RG / certidão de nascimento';
    rotB.textContent = quem + ' como está no ' + FONTES_B[v.fonteB].rotulo;
    const cpfNum = v.cpf.replace(/\D/g, '');
    avisoCpf.textContent = cpfNum.length === 11 && !validarCPF(cpfNum) ? 'Atenção: este CPF parece ter um número errado.' : '';

    const d = montarDeclaracao(v);
    out.cab.innerHTML = cabecalhoHtml();
    out.p1.innerHTML = d.p1;
    out.p2.innerHTML = d.p2;
    out.data.textContent = d.data;
    out.assin.innerHTML = d.assinatura;
    estado.titulo = d.titulo;
  };

  const limpar = () => {
    const manter = { unidade: f.unidade.value, cnpj: f.cnpj.value, cartorio: f.cartorio.value };
    form.reset();
    Object.assign(f.unidade, { value: manter.unidade }); f.cnpj.value = manter.cnpj; f.cartorio.value = manter.cartorio;
    f.dataEnc.value = hojeISO(); f.dataDecl.value = hojeISO();
    avisoConf.innerHTML = '';
    atualizar();
    f.nome.focus();
  };

  const imprimir = async () => {
    if (folha.querySelector('.falta') &&
      !await confirmar('Faltam campos', 'Ainda há campos em amarelo sem preencher. Imprimir assim mesmo?', { sim: 'Imprimir' })) return;
    lembrar('apac.decl.procs', f.proc.value);
    lembrar('apac.decl.cartorios', f.cartorio.value);
    gravar('apac.decl.cartorioAtual', f.cartorio.value.trim().toUpperCase());
    gravar(chaveCnpj, f.cnpj.value.trim());
    const janela = window.open('', '_blank');
    if (!janela) { alerta('Janela bloqueada', 'O navegador bloqueou a janela de impressão. Permita janelas (pop-ups) para este site.'); return; }
    const copia = folha.cloneNode(true);
    copia.querySelectorAll('.falta').forEach((s) => s.classList.remove('falta'));
    const img = copia.querySelector('.cab img');
    if (img && img.classList.contains('oculto')) img.remove();
    janela.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(estado.titulo) + '</title><style>' +
      '@page{size:A4;margin:0}body{margin:0;background:#fff}' + ESTILO_FOLHA + '</style></head><body>' + copia.outerHTML +
      '<script>function imp(){setTimeout(function(){window.print()},250)}' +
      'var i=document.querySelector(".cab img");if(i&&!i.complete){i.onload=imp;i.onerror=imp}else{window.onload=imp}<\/script></body></html>');
    janela.document.close();
  };

  estado = { titulo: '' };
  f.cpf.addEventListener('input', () => { f.cpf.value = mascaraCPF(f.cpf.value); });
  form.addEventListener('input', atualizar);
  form.addEventListener('change', atualizar);

  // ---------- veio da Conferência? ----------
  if (veio) {
    marcar('d-idade', veio.menor ? 'menor' : 'adulto');
    marcar('d-tipo', veio.tipo);
    marcar('d-fonteB', veio.fonteB);
    marcar('d-local', veio.local);
    if (veio.sexo) marcar('d-sexo', veio.sexo);
    if (veio.sexoPac) marcar('d-sexoPac', veio.sexoPac);
    ['nome', 'cpf', 'rg', 'parentesco', 'paciente', 'nomeB', 'nomeCert'].forEach((k) => { if (veio[k]) f[k].value = veio[k]; });
    if (veio.faixa) f.faixa.value = veio.faixa;
    avisoConf.appendChild(h('div', { class: 'msg aviso pequeno', style: { marginTop: 0 } },
      h('b', null, 'Preenchida pela Conferência de espelhos'), veio.origem ? ' (' + veio.origem + ')' : '', '. ',
      veio.observacao ? h('div', null, 'Obs. da conferência: ' + veio.observacao) : null,
      h('div', null, 'Confira qual documento está errado (Receita ou cartório)' +
        (veio.menor ? ', quem assina (sugeri a mãe) e o RG/CPF de quem assina.' : ' e o RG.'))));
  }

  atualizar();
  ajustarEscala(previa, folha);
  urlBrasao().then((url) => {
    if (!url || !imgBrasao.isConnected) return;
    imgBrasao.src = url;
    imgBrasao.classList.remove('oculto');
  });
}

/** A folha A4 diminui para caber na prévia, sem mudar o tamanho de impressão. */
function ajustarEscala(previa, folha) {
  const ajustar = () => {
    if (!previa.isConnected) { window.removeEventListener('resize', ajustar); return; }
    const larg = previa.clientWidth - 32;
    const escala = Math.min(1, larg / folha.offsetWidth);
    folha.style.transform = escala < 1 ? 'scale(' + escala + ')' : '';
    folha.style.marginBottom = escala < 1 ? (-(1 - escala) * folha.offsetHeight) + 'px' : '';
  };
  window.addEventListener('resize', ajustar);
  requestAnimationFrame(ajustar);
}

export function desmontar() { estado = null; }
