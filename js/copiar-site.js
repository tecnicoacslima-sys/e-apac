/**
 * COPIAR AS TELAS DO SITE PARA O PROGRAMA
 * ------------------------------------------------------------
 * O APAC digital desktop usa as MESMAS telas do site apacdigital.com.br.
 * Este script:
 *   1. baixa (ou atualiza) o site do GitHub na pasta ao lado: C:\Projetos\e-apac
 *   2. copia as telas para a pasta "app" deste projeto
 *   3. troca só o que é diferente no computador (pasta "desktop"):
 *        desktop/index.html     → app/index.html   (sem Supabase)
 *        desktop/dados-local.js → app/js/dados.js  (dados no computador)
 *        desktop/entrada.js     → app/js/entrada.js (senha da unidade antes de abrir)
 *
 * Roda sozinho a cada "npm start". Para rodar só ele: npm run copiar-site
 * Sem internet: usa a cópia do site que já estiver em C:\Projetos\e-apac.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const SITE = process.env.SITE_APAC || path.join(RAIZ, '..', 'e-apac');
const DESTINO = path.join(RAIZ, 'app');
const TROCAS = path.join(RAIZ, 'desktop');
const REPOSITORIO = 'https://github.com/tecnicoacslima-sys/e-apac.git';

// Do site, NÃO vem para o programa:
const IGNORAR = new Set([
  '.git', '.github', 'CNAME',
  'config.js',              // endereço do Supabase
  'v',                      // página pública do QR de verificação
  'index.html',             // trocado por desktop/index.html
  path.join('vendor', 'supabase.js'),
  path.join('js', 'dados.js')   // trocado por desktop/dados-local.js
]);

function rodar(comando, pasta) {
  execSync(comando, { cwd: pasta, stdio: 'inherit' });
}

function baixarOuAtualizarSite() {
  if (!fs.existsSync(SITE)) {
    console.log('📥 Baixando o site do GitHub para ' + SITE + ' …');
    rodar('git clone --depth 1 ' + REPOSITORIO + ' "' + SITE + '"', path.dirname(SITE));
    return;
  }
  try {
    console.log('🔄 Atualizando o site em ' + SITE + ' …');
    rodar('git pull --ff-only', SITE);
  } catch (e) {
    console.log('⚠️  Não consegui atualizar (sem internet?). Uso a cópia que já existe.');
  }
}

function copiarPasta(origem, destino, relativo = '') {
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem)) {
    const rel = path.join(relativo, nome);
    if (IGNORAR.has(rel)) continue;
    const de = path.join(origem, nome);
    const para = path.join(destino, nome);
    if (fs.statSync(de).isDirectory()) copiarPasta(de, para, rel);
    else fs.copyFileSync(de, para);
  }
}

function principal() {
  baixarOuAtualizarSite();
  if (!fs.existsSync(path.join(SITE, 'js', 'app.js'))) {
    console.error('❌ Não achei o site em ' + SITE + ' (falta js/app.js).');
    process.exit(1);
  }

  fs.rmSync(DESTINO, { recursive: true, force: true });
  copiarPasta(SITE, DESTINO);

  // o que muda no computador
  fs.copyFileSync(path.join(TROCAS, 'index.html'), path.join(DESTINO, 'index.html'));
  fs.copyFileSync(path.join(TROCAS, 'dados-local.js'), path.join(DESTINO, 'js', 'dados.js'));
  fs.copyFileSync(path.join(TROCAS, 'entrada.js'), path.join(DESTINO, 'js', 'entrada.js'));

  let versao = '';
  try { versao = execSync('git rev-parse --short HEAD', { cwd: SITE }).toString().trim(); } catch (e) { /* sem git */ }
  fs.writeFileSync(path.join(DESTINO, 'ORIGEM.txt'),
    'Telas copiadas do site em ' + new Date().toLocaleString('pt-BR') + (versao ? ' (versão ' + versao + ')' : '') + '\n');

  console.log('✅ Telas copiadas para a pasta app' + (versao ? ' (site versão ' + versao + ')' : '') + '.');
}

principal();
