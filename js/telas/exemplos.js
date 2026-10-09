/**
 * 📂 ARQUIVOS DE EXEMPLO (só aparece para a unidade TESTE e para o administrador)
 *
 * Mostra os PDFs fictícios do bucket público "demonstracao" no Supabase,
 * para quem está conhecendo o sistema baixar e testar a Conferência de
 * espelhos e a leitura do laudo da APAC sem usar dado de paciente real.
 *
 * Para trocar ou acrescentar arquivos: suba no bucket "demonstracao"
 * e ajuste a lista PACIENTES abaixo (o caminho tem que ser igual ao do bucket).
 */
import * as dados from '../dados.js';
import { h } from '../ui.js';

const BUCKET = 'demonstracao';

const DOCUMENTOS = [
  { arquivo: '1_Espelho_SUS',            rotulo: 'Espelho SUS / CADSUS',     icone: '🪪' },
  { arquivo: '2_Espelho_CELK',           rotulo: 'Espelho CELK',             icone: '🗂️' },
  { arquivo: '3_Documento',              rotulo: 'Documento de identidade',  icone: '🆔' },
  { arquivo: '4_Comprovante_Residencia', rotulo: 'Comprovante de residência', icone: '🏠' },
  { arquivo: '5_APAC',                   rotulo: 'Laudo da APAC',            icone: '📄' }
];

const PACIENTES = [
  {
    pasta: 'Paciente_A_conforme',
    nome: 'Maria Exemplo da Silva',
    resumo: 'Todos os documentos batem entre si.',
    esperado: 'O relatório da Conferência deve sair todo CONFORME.',
    classe: 'ok'
  },
  {
    pasta: 'Paciente_B_pendencia_CEP',
    nome: 'João Teste Pereira',
    resumo: 'O CEP do comprovante de residência (78451-210) é diferente do CEP dos espelhos (78451-120).',
    esperado: 'O relatório da Conferência deve apontar a divergência no CEP.',
    classe: 'aviso'
  }
];

/** Link público para baixar o arquivo (o bucket é público e só tem dados fictícios). */
function linkDownload(caminho) {
  const nome = caminho.split('/').pop();
  return dados.sb.storage.from(BUCKET).getPublicUrl(caminho, { download: nome }).data.publicUrl;
}

function cartaoPaciente(p) {
  const linhas = DOCUMENTOS.map((d) => {
    const caminho = p.pasta + '/' + d.arquivo + '_' + p.pasta + '.pdf';
    return h('li', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: '1px solid #E3EBE9' } },
      h('span', null, d.icone + ' ' + d.rotulo),
      h('a', { class: 'btn pequeno', href: linkDownload(caminho), download: '' }, '⬇️ Baixar'));
  });
  return h('section', { class: 'card' },
    h('h2', null, (p.classe === 'ok' ? '✅ ' : '⚠️ ') + p.nome),
    h('div', { class: 'card-conteudo' },
      h('p', { style: { margin: '0 0 6px' } }, p.resumo),
      h('div', { class: 'msg ' + p.classe }, p.esperado),
      h('ul', { style: { listStyle: 'none', margin: '8px 0 0', padding: 0 } }, ...linhas)));
}

function cartaoComoUsar() {
  return h('section', { class: 'card' },
    h('h2', null, '🧭 Como fazer o teste'),
    h('div', { class: 'card-conteudo' },
      h('ol', { style: { margin: 0, paddingLeft: '18px', lineHeight: 1.7 } },
        h('li', null, 'Baixe os 5 arquivos de um dos pacientes ao lado.'),
        h('li', null, 'Abra a tela ', h('a', { href: '#/conferencia' }, 'Conferência'),
          ' e coloque o Espelho SUS, o Espelho CELK, o Documento e o Comprovante, cada um no seu lugar.'),
        h('li', null, 'Mande comparar e abra o relatório em PDF para ver o resultado.'),
        h('li', null, 'Na tela ', h('a', { href: '#/apac' }, 'APAC'),
          ', use o arquivo "Laudo da APAC" para ver a leitura do laudo e a conferência do código.')),
      h('div', { class: 'msg info' },
        'Todos estes documentos são fictícios: nomes, CNS, CPF e endereços foram inventados ',
        'e cada página tem a marca "DEMONSTRAÇÃO – DADOS FICTÍCIOS". Use só para treinamento.')));
}

export async function montar(area) {
  area.append(
    h('div', { class: 'titulo-tela' },
      h('div', null,
        h('h1', null, '📂 Arquivos de exemplo'),
        h('p', null, 'Documentos fictícios para conhecer o APAC digital na prática.'))),
    h('div', { class: 'grade-cards' },
      cartaoComoUsar(), ...PACIENTES.map(cartaoPaciente)));
}
