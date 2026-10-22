/**
 * 📘 PROTOCOLOS DE REGULAÇÃO — busca nos critérios de encaminhamento
 *  • Protocolo de Regulação do Estado de Mato Grosso (SES-MT, 2011)
 *  • Protocolo de Regulação de Nova Mutum (Secretaria Municipal de Saúde, set/2025)
 * Digite o procedimento, a especialidade, a doença ou o código SIGTAP:
 * aparecem só os trechos certos, com os exames e dados que precisam ir junto.
 * Funciona como tela própria (#/regulacao) e como janela dentro da tela APAC.
 * A base vem de dados/protocolos-regulacao.json (gerada a partir dos PDFs).
 */
import { h, modal, toast, atrasar } from '../ui.js';
import { esc } from '../lib/texto.js';

const ENDERECO_BASE = new URL('../../dados/protocolos-regulacao.json', import.meta.url);
const ENDERECO_RAIZ = new URL('../../', import.meta.url);
const FONTES = { mutum: 'Nova Mutum', estado: 'Estado de MT' };
const LIMITE = 60;

// palavras que não ajudam a achar (aparecem no nome do procedimento do SIGTAP)
const PALAVRAS_VAZIAS = new Set(('a o as os e de da do das dos em no na nos nas para por com sem ou um uma ao aos ' +
  'consulta consultas medica medico medicos atencao especializada especialista encaminhamento exame exames ' +
  'procedimento procedimentos avaliacao').split(' '));

let base = null;          // { fontes, itens }
let carregando = null;

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function carregarBase() {
  if (base) return base;
  if (!carregando) {
    carregando = fetch(ENDERECO_BASE.href).then((r) => {
      if (!r.ok) throw new Error('Não encontrei a base dos protocolos (' + r.status + ').');
      return r.json();
    }).then((b) => {
      b.itens.forEach((it) => {
        it._titulo = semAcento(it.titulo);
        it._espec = semAcento(it.especialidade + ' ' + it.grupo);
        it._texto = semAcento(it.texto);
        it._digitos = (it.codigos || []).join(' ') + ' ' + it.texto.replace(/[^\d\n ]/g, '');
      });
      base = b;
      return b;
    }).catch((e) => { carregando = null; throw e; });
  }
  return carregando;
}

/** "cardiologia" também acha "cardiologista"; "ortopedia" acha "ortopedista". */
function raiz(p) { return p.length >= 7 ? p.slice(0, p.length - 3) : (p.length >= 6 ? p.slice(0, p.length - 2) : p); }

function palavrasDaBusca(termo) {
  return semAcento(termo).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((p) => p && (p.length > 1 || /\d/.test(p)) && !PALAVRAS_VAZIAS.has(p));
}

/** Procura na base. Devolve { itens, parcial } — parcial = nenhum item tinha todas as palavras. */
function procurar(termo, { fonte = '', especialidade = '' } = {}) {
  const itens = base.itens.filter((it) => (!fonte || it.fonte === fonte) && (!especialidade || it.especialidade === especialidade));
  const digitos = String(termo || '').replace(/\D/g, '');
  const palavras = palavrasDaBusca(String(termo || '').replace(/[\d.\-]{6,}/g, ' '));

  if (!palavras.length && digitos.length < 6) {
    return { itens: itens.slice(0).sort(ordemNatural), parcial: false };
  }

  const pontuar = (it, exigirTodas) => {
    let pontos = 0, achadas = 0;
    if (digitos.length >= 6) {
      if ((it.codigos || []).some((c) => c.startsWith(digitos))) pontos += 60;
      else if (it._digitos.includes(digitos)) pontos += 25;
      else if (!palavras.length) return 0;
    }
    for (const p of palavras) {
      const r = raiz(p);
      let pp = 0;
      if (it._titulo.includes(p)) pp = 12;
      else if (it._titulo.includes(r)) pp = 9;
      else if (it._espec.includes(p) || it._espec.includes(r)) pp = 10;
      else if (it._texto.includes(p)) pp = 2 + Math.min(3, it._texto.split(p).length - 2);
      else if (r !== p && it._texto.includes(r)) pp = 1.5;
      if (pp) achadas++;
      else if (exigirTodas) return 0;
      pontos += pp;
    }
    if (!achadas && digitos.length < 6) return 0;
    // um pouco à frente: o protocolo do município e os exames (quem pede APAC usa mais)
    if (it.fonte === 'mutum') pontos += 0.5;
    return pontos;
  };

  let achados = itens.map((it) => [it, pontuar(it, true)]).filter((x) => x[1] > 0);
  let parcial = false;
  if (!achados.length && palavras.length > 1) {
    achados = itens.map((it) => [it, pontuar(it, false)]).filter((x) => x[1] > 0);
    parcial = achados.length > 0;
  }
  achados.sort((a, b) => b[1] - a[1] || ordemNatural(a[0], b[0]));
  return { itens: achados.map((x) => x[0]), parcial };
}

function ordemNatural(a, b) {
  return (a.fonte === b.fonte ? 0 : a.fonte === 'mutum' ? -1 : 1) || a.id - b.id;
}

// ------------------------------------------------------------
// DESENHO
// ------------------------------------------------------------
const ROTULOS = /^(\d+\s*[-.)]?\s*)?(Encaminhar[^:–-]*|Dados que devem[^:]*|Exames? complementares?[^–:-]*|Exame f[ií]sico|Hist[oó]ria[^–:-]*|Prioridade[^–:-]*|Crit[eé]rios?[^–:-]*|Contra[- ]refer[eê]ncia|Conta refer[eê]ncia|Indica[cç][oõ]es|Profissionais que podem solicitar|Obs\.?|OBS\.?|Observa[cç][oõ]es|Justificativas?[^–:-]*|Contraindica[cç][oõ]es)\s*([:–-])/i;
const DESTAQUE_EXAMES = /(Exames? complementares?|Dados que devem|exames? necess[aá]rios?|Profissionais que podem solicitar)/i;

function marcarPalavras(html, palavras) {
  if (!palavras.length) return html;
  // marca as palavras sem acento comparando letra a letra (o texto original tem acento)
  const plano = semAcento(html);
  const trechos = [];
  palavras.forEach((p) => {
    for (const alvo of new Set([p, raiz(p)])) {
      if (alvo.length < 3) continue;
      let i = plano.indexOf(alvo);
      while (i >= 0) {
        // não marca dentro de tags html
        const antes = plano.lastIndexOf('<', i), fecha = plano.lastIndexOf('>', i);
        if (antes <= fecha) trechos.push([i, i + alvo.length]);
        i = plano.indexOf(alvo, i + alvo.length);
      }
    }
  });
  if (!trechos.length) return html;
  trechos.sort((a, b) => a[0] - b[0]);
  const juntos = [];
  trechos.forEach((t) => { const u = juntos[juntos.length - 1]; if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1]); else juntos.push([...t]); });
  let out = '', pos = 0;
  juntos.forEach(([a, b]) => { out += html.slice(pos, a) + '<mark>' + html.slice(a, b) + '</mark>'; pos = b; });
  return out + html.slice(pos);
}

function textoEmHtml(texto, palavras) {
  const linhas = texto.split('\n');
  let html = '';
  let lista = false;
  linhas.forEach((l) => {
    if (l.startsWith('• ')) {
      if (!lista) { html += '<ul>'; lista = true; }
      html += '<li>' + esc(l.slice(2)) + '</li>';
      return;
    }
    if (lista) { html += '</ul>'; lista = false; }
    const m = l.match(ROTULOS);
    if (m && m[0].length <= 70 && !(/^(\d+\s*[-.)]?\s*)?Encaminhar/i.test(m[0]) && m[3] !== ':')) {
      const rotulo = l.slice(0, m[0].length);
      const resto = l.slice(m[0].length);
      const classe = DESTAQUE_EXAMES.test(rotulo) ? ' class="reg-exames"' : '';
      html += '<p' + classe + '><b>' + esc(rotulo) + '</b>' + esc(resto) + '</p>';
    } else {
      html += '<p>' + esc(l) + '</p>';
    }
  });
  if (lista) html += '</ul>';
  return marcarPalavras(html, palavras);
}

function linkPdf(it) {
  const f = base.fontes[it.fonte];
  return new URL(f.pdf, ENDERECO_RAIZ).href + '#page=' + it.pagina;
}

function cartao(it, palavras, aberto) {
  const corpo = h('div', { class: 'reg-texto', html: textoEmHtml(it.texto, palavras) });
  const det = h('details', { class: 'reg-item reg-' + it.fonte, open: aberto || null },
    h('summary', null,
      h('span', { class: 'reg-fonte' }, FONTES[it.fonte]),
      h('span', { class: 'reg-titulo', html: marcarPalavras(esc(it.titulo), palavras) }),
      h('span', { class: 'reg-onde' }, it.especialidade + (it.grupo && it.grupo !== it.especialidade ? ' · ' + it.grupo : '') + ' · pág. ' + it.pagina)),
    corpo,
    h('div', { class: 'botoes reg-acoes' },
      h('a', { class: 'btn pequeno', href: linkPdf(it), target: '_blank', rel: 'noopener' }, '📄 Abrir no PDF (pág. ' + it.pagina + ')'),
      h('button', { type: 'button', class: 'btn pequeno', onclick: async () => {
        const txt = it.titulo + ' — ' + FONTES[it.fonte] + ' (' + it.especialidade + ', pág. ' + it.pagina + ')\n\n' + it.texto;
        try { await navigator.clipboard.writeText(txt); toast('Texto copiado.', '📋 Copiado', 'ok', 3); }
        catch (e) { toast('Não consegui copiar. Selecione o texto e copie.', 'Atenção', 'aviso'); }
      } }, '📋 Copiar texto')));
  return det;
}

function estilos() {
  if (document.getElementById('estilo-regulacao')) return;
  document.head.appendChild(h('style', { id: 'estilo-regulacao' }, `
.reg-filtros { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0 6px; }
.reg-filtros select { padding: 6px 8px; border: 1px solid var(--entrada-borda); border-radius: 6px; background: #fff; max-width: 100%; }
.reg-fontes { display: inline-flex; border: 1px solid var(--entrada-borda); border-radius: 18px; overflow: hidden; }
.reg-fontes button { border: 0; background: #fff; padding: 6px 12px; cursor: pointer; font-weight: 600; color: var(--rotulo); }
.reg-fontes button.ativa { background: var(--primaria); color: #fff; }
.reg-info { font-size: 12px; color: var(--rotulo); margin: 4px 0 8px; }
.reg-lista { display: flex; flex-direction: column; gap: 8px; }
.reg-item { background: #fff; border: 1px solid var(--borda-card); border-left: 4px solid var(--primaria); border-radius: 8px; }
.reg-item.reg-estado { border-left-color: var(--azul); }
.reg-item > summary { list-style: none; cursor: pointer; padding: 10px 12px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.reg-item > summary::-webkit-details-marker { display: none; }
.reg-item > summary::before { content: '▸'; color: var(--suave); width: 10px; }
.reg-item[open] > summary::before { content: '▾'; }
.reg-item[open] > summary { border-bottom: 1px solid var(--borda-card); background: var(--auto-fundo); border-radius: 8px 8px 0 0; }
.reg-fonte { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 10px; background: var(--ok-fundo); color: var(--ok); white-space: nowrap; }
.reg-estado .reg-fonte { background: #E6EFF8; color: #1F5A8F; }
.reg-titulo { font-weight: 700; font-size: 14.5px; flex: 1 1 260px; }
.reg-onde { font-size: 12px; color: var(--rotulo); width: 100%; padding-left: 14px; }
.reg-texto { padding: 6px 14px 2px 18px; font-size: 13.5px; line-height: 1.5; }
.reg-texto p { margin: 6px 0; }
.reg-texto ul { margin: 4px 0 8px; padding-left: 20px; }
.reg-texto li { margin: 2px 0; }
.reg-texto .reg-exames { background: var(--aviso-fundo); border: 1px solid var(--aviso-borda); border-radius: 6px; padding: 6px 9px; }
.reg-texto mark { background: #FFE58A; color: inherit; padding: 0 1px; border-radius: 2px; }
.reg-titulo mark { background: #FFE58A; color: inherit; }
.reg-acoes { padding: 6px 14px 12px 18px; }
.reg-especialidades { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.reg-especialidades button { border: 1px solid var(--borda-card); background: #fff; border-radius: 16px; padding: 5px 11px; cursor: pointer; font-size: 13px; }
.reg-especialidades button:hover { border-color: var(--primaria); background: var(--busca-fundo); }
.reg-especialidades small { color: var(--suave); }
`));
}

/**
 * Monta a busca. termoInicial = texto que já vem na caixa (ex.: o procedimento do formulário).
 */
function montarBusca({ termoInicial = '', dentroDeJanela = false } = {}) {
  estilos();
  const campo = h('input', { type: 'search', value: termoInicial, autocomplete: 'off',
    placeholder: 'Procedimento, especialidade, doença ou código SIGTAP (ex.: colonoscopia, cardiologia, dor lombar)',
    style: { width: '100%', padding: '10px 12px', border: '2px solid var(--primaria)', borderRadius: '6px', fontSize: '15px' } });
  let fonte = '';
  const botoesFonte = h('div', { class: 'reg-fontes', role: 'group', 'aria-label': 'Qual protocolo' });
  [['', 'Os dois'], ['mutum', 'Nova Mutum'], ['estado', 'Estado de MT']].forEach(([v, rot]) => {
    botoesFonte.appendChild(h('button', { type: 'button', class: v === '' ? 'ativa' : '', onclick: (e) => {
      fonte = v;
      botoesFonte.querySelectorAll('button').forEach((b) => b.classList.toggle('ativa', b === e.currentTarget));
      montarEspecialidades();
      desenhar();
    } }, rot));
  });
  const especSel = h('select', { 'aria-label': 'Especialidade' });
  especSel.addEventListener('change', () => desenhar());
  const info = h('div', { class: 'reg-info' }, 'Carregando os protocolos…');
  const lista = h('div', { class: 'reg-lista', style: dentroDeJanela ? { maxHeight: '58vh', overflow: 'auto', paddingRight: '4px' } : {} });

  function montarEspecialidades() {
    if (!base) return;
    const atual = especSel.value;
    const contagem = new Map();
    base.itens.forEach((it) => { if (!fonte || it.fonte === fonte) contagem.set(it.especialidade, (contagem.get(it.especialidade) || 0) + 1); });
    const nomes = [...contagem.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    especSel.innerHTML = '';
    especSel.appendChild(h('option', { value: '' }, 'Todas as especialidades'));
    nomes.forEach((n) => especSel.appendChild(h('option', { value: n }, n + ' (' + contagem.get(n) + ')')));
    especSel.value = nomes.includes(atual) ? atual : '';
  }

  function desenhar() {
    if (!base) return;
    const termo = campo.value.trim();
    const especialidade = especSel.value;
    lista.innerHTML = '';
    if (!termo && !especialidade) {
      info.textContent = 'Digite o que procura ou escolha uma especialidade:';
      const grade = h('div', { class: 'reg-especialidades' });
      const contagem = new Map();
      base.itens.forEach((it) => { if ((!fonte || it.fonte === fonte) && it.grupo === 'Consulta especializada') contagem.set(it.especialidade, (contagem.get(it.especialidade) || 0) + 1); });
      [...contagem.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((n) =>
        grade.appendChild(h('button', { type: 'button', onclick: () => { especSel.value = n; desenhar(); } }, n + ' ', h('small', null, contagem.get(n)))));
      ['Exames', 'Orientações gerais', 'Anexos'].forEach((n) => {
        if (base.itens.some((it) => it.especialidade === n && (!fonte || it.fonte === fonte))) {
          grade.appendChild(h('button', { type: 'button', style: { fontWeight: '700' }, onclick: () => { especSel.value = n; desenhar(); } },
            (n === 'Exames' ? '🩻 ' : n === 'Anexos' ? '📎 ' : 'ℹ️ ') + n));
        }
      });
      lista.appendChild(grade);
      return;
    }
    const { itens, parcial } = procurar(termo, { fonte, especialidade });
    const palavras = palavrasDaBusca(termo);
    if (!itens.length) {
      info.textContent = '';
      lista.appendChild(h('div', { class: 'msg aviso' }, 'Nada encontrado. Tente outra palavra (ex.: o nome da doença ou do exame) ou troque o filtro.'));
      return;
    }
    const mostrar = itens.slice(0, LIMITE);
    info.textContent = (parcial ? '⚠️ Nenhum trecho tem todas as palavras. Mostrando os mais parecidos. ' : '') +
      itens.length + ' trecho(s)' + (itens.length > LIMITE ? ', mostrando os ' + LIMITE + ' primeiros' : '') +
      '. Clique para abrir. O fundo amarelo marca os exames e dados que devem ir junto.';
    mostrar.forEach((it, n) => lista.appendChild(cartao(it, palavras, n === 0 && !!termo && mostrar.length <= 8)));
  }

  const desenharDepois = atrasar(desenhar, 200);
  campo.addEventListener('input', desenharDepois);

  carregarBase().then(() => {
    montarEspecialidades();
    desenhar();
  }).catch((e) => { info.innerHTML = '<div class="msg erro">' + esc(e.message) + '</div>'; });

  setTimeout(() => { campo.focus(); if (termoInicial) campo.select(); }, 60);

  return h('div', null,
    campo,
    h('div', { class: 'reg-filtros' }, botoesFonte, especSel),
    info, lista);
}

/** Termo de busca a partir do procedimento do formulário APAC (código e nome). */
export function termoDoProcedimento(codigo, nome) {
  const n = String(nome || '').replace(/\(.*?\)/g, ' ').trim();
  const palavras = palavrasDaBusca(n);
  return palavras.length ? n : String(codigo || '').replace(/\D/g, '');
}

/** Janela de busca (usada pela tela APAC). */
export function abrirBuscaRegulacao({ termo = '' } = {}) {
  const janela = modal({ titulo: '📘 Critérios de regulação', largura: 860, conteudo: h('div'), botoes: [{ texto: 'Fechar' }] });
  janela.corpo.innerHTML = '';
  janela.corpo.appendChild(montarBusca({ termoInicial: termo, dentroDeJanela: true }));
}

export async function montar(area) {
  area.append(
    h('div', { class: 'titulo-tela' },
      h('div', null, h('h1', null, '📘 Protocolos de regulação'),
        h('p', null, 'Critérios de encaminhamento e exames exigidos: Protocolo de Nova Mutum (set/2025) e Protocolo do Estado de Mato Grosso (SES-MT, 2011).'))),
    h('div', { class: 'card' }, h('div', { class: 'card-conteudo' }, montarBusca())));
}

// para os testes automáticos
export const _teste = { carregarBase, procurar: (t, o) => procurar(t, o || {}), palavrasDaBusca };
