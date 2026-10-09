/**
 * 🧾 FATURA DE CONSUMO DE IA — cálculos (sem desenho).
 * Antes: botão "Gerar fatura" da planilha PAINEL_CONSUMO_IA.
 *
 * valor (R$) = (tokens_entrada × preço_entrada + tokens_saída × preço_saída) / 1.000.000
 *              × (1 + margem) × câmbio
 * Só entram as chamadas com status OK (as mesmas do resumo do Admin).
 */

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function valorReais(entrada, saida, precos) {
  const p = precos || {};
  const usd = ((Number(entrada) || 0) * (Number(p.preco_entrada) || 0) + (Number(saida) || 0) * (Number(p.preco_saida) || 0)) / 1e6;
  return usd * (1 + (Number(p.margem) || 0)) * (Number(p.cambio) || 0);
}

/** "2026-10" → { ano, mes, rotulo: "Outubro/2026", curto: "Out/26", inicio: "01/10/2026", fim: "31/10/2026" } */
export function infoMes(mes) {
  const ano = Number(String(mes).slice(0, 4));
  const m = Number(String(mes).slice(5, 7));
  const ultimo = new Date(ano, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { ano, mes: m, rotulo: MESES[m - 1] + '/' + ano, curto: MESES_CURTOS[m - 1] + '/' + String(ano).slice(2),
           inicio: '01/' + mm + '/' + ano, fim: ultimo + '/' + mm + '/' + ano };
}

/** Os n meses que terminam em `mes` (inclusive): ["2026-05", …, "2026-10"] */
export function mesesAte(mes, n = 6) {
  const ano = Number(String(mes).slice(0, 4));
  const m = Number(String(mes).slice(5, 7));
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ano, m - 1 - i, 1);
    lista.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return lista;
}

/** Dia da chamada no horário de Cuiabá: "07/10/2026" */
export function diaCuiaba(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Cuiaba', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Nº da fatura: 202610-ESF_FLOR_DO_CERRADO */
export function numeroFatura(mes, unidade) {
  const u = String(unidade || 'UNIDADE').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return String(mes).replace('-', '') + '-' + u;
}

/** Nome do arquivo: Fatura_IA_2026-10_ESF_FLOR_DO_CERRADO.pdf */
export function nomeArquivoFatura(mes, unidade) {
  return 'Fatura_IA_' + mes + '_' + numeroFatura(mes, unidade).split('-').slice(1).join('-') + '.pdf';
}

/**
 * linhas: registros de uso_ia do mês e da unidade (com criado_em, funcao, tokens_entrada, tokens_saida, status)
 * historico: [{ mes, valor_reais }] da unidade (do resumo do Admin)
 */
export function montarFatura({ mes, unidade, linhas, precos, historico = [], emissao = new Date(), diasVencimento = 10 }) {
  const ok = (linhas || []).filter((l) => !l.status || l.status === 'OK');
  const soma = (lista, k) => lista.reduce((s, l) => s + (Number(l[k]) || 0), 0);

  const porServico = new Map();
  const porDia = new Map();
  ok.forEach((l) => {
    const f = String(l.funcao || 'GERAL').toUpperCase();
    const s = porServico.get(f) || { servico: f, chamadas: 0, entrada: 0, saida: 0 };
    s.chamadas++; s.entrada += Number(l.tokens_entrada) || 0; s.saida += Number(l.tokens_saida) || 0;
    porServico.set(f, s);
    const d = diaCuiaba(l.criado_em);
    const x = porDia.get(d) || { dia: d, chamadas: 0, entrada: 0, saida: 0 };
    x.chamadas++; x.entrada += Number(l.tokens_entrada) || 0; x.saida += Number(l.tokens_saida) || 0;
    porDia.set(d, x);
  });
  const comValor = (o) => ({ ...o, tokens: o.entrada + o.saida, valor: valorReais(o.entrada, o.saida, precos) });
  const ordemDia = (d) => d.split('/').reverse().join('');

  const entrada = soma(ok, 'tokens_entrada');
  const saida = soma(ok, 'tokens_saida');
  const total = valorReais(entrada, saida, precos);
  const vencimento = new Date(emissao.getTime() + diasVencimento * 86400000);
  const mapaHist = new Map((historico || []).map((h) => [h.mes, Number(h.valor_reais) || 0]));
  mapaHist.set(mes, total);

  return {
    numero: numeroFatura(mes, unidade),
    mes, mesInfo: infoMes(mes), unidade,
    emissao, vencimento,
    chamadas: ok.length, entrada, saida, tokens: entrada + saida, total,
    servicos: [...porServico.values()].map(comValor).sort((a, b) => b.valor - a.valor),
    dias: [...porDia.values()].map(comValor).sort((a, b) => ordemDia(a.dia).localeCompare(ordemDia(b.dia))),
    historico: mesesAte(mes, 6).map((m) => ({ mes: m, curto: infoMes(m).curto, valor: mapaHist.get(m) || 0, atual: m === mes })),
    cambio: Number((precos || {}).cambio) || 0
  };
}
