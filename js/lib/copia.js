/**
 * 💾 CÓPIA DE SEGURANÇA — transforma as tabelas da unidade em planilha Excel
 * (uma aba por tabela + aba "Leia-me"). Funciona com a biblioteca XLSX (SheetJS).
 */

const LIMITE_CELULA = 32000;   // o Excel aceita até 32.767 letras por célula

/** Valor de uma célula: objetos/listas viram texto JSON; datas ficam como texto. */
export function valorCelula(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const t = JSON.stringify(v);
    return t.length > LIMITE_CELULA ? t.slice(0, LIMITE_CELULA) + '…[cortado]' : t;
  }
  if (typeof v === 'string' && v.length > LIMITE_CELULA) return v.slice(0, LIMITE_CELULA) + '…[cortado]';
  return v;
}

/** Linhas (objetos) → matriz com cabeçalho; junta as colunas de todas as linhas. */
export function matrizDaTabela(linhas) {
  const colunas = [];
  linhas.forEach((l) => Object.keys(l).forEach((k) => { if (!colunas.includes(k)) colunas.push(k); }));
  return [colunas, ...linhas.map((l) => colunas.map((c) => valorCelula(l[c])))];
}

/** Nome do arquivo: APAC_digital_copia_ESF_FLOR_DO_CERRADO_2026-10-08.xlsx */
export function nomeArquivoCopia(unidade, data = new Date()) {
  const d = data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
  const u = String(unidade || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return 'APAC_digital_copia_' + (u ? u + '_' : '') + d + '.xlsx';
}

/** Monta a pasta de trabalho (workbook). tabelas = [{ rotulo, linhas, erro? }] */
export function montarPlanilhaCopia(XLSX, tabelas, info) {
  const wb = XLSX.utils.book_new();
  const leia = [
    ['APAC digital — cópia de segurança'],
    [],
    ['Unidade', info.unidade || ''],
    ['Gerada em', info.geradaEm || ''],
    ['Por', info.por || ''],
    [],
    ['Aba', 'Linhas', 'Observação'],
    ...tabelas.map((t) => [t.rotulo, t.linhas.length, t.erro ? 'Não foi possível ler: ' + t.erro : '']),
    [],
    ['Guarde este arquivo em lugar seguro (ex.: Google Drive). Ele contém dados de pacientes.'],
    ['Os PDFs (APACs e relatórios) não vão nesta planilha: eles podem ser gerados de novo a partir destes dados.']
  ];
  const abaLeia = XLSX.utils.aoa_to_sheet(leia);
  abaLeia['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, abaLeia, 'Leia-me');
  tabelas.forEach((t) => {
    const aba = XLSX.utils.aoa_to_sheet(t.linhas.length ? matrizDaTabela(t.linhas) : [['(vazia)']]);
    XLSX.utils.book_append_sheet(wb, aba, t.rotulo.slice(0, 31));
  });
  return wb;
}
