/**
 * TODA a conversa com o Supabase fica aqui (banco, arquivos, login e IA).
 * As telas só chamam estas funções.
 */

const cfg = window.APAC_CONFIG || {};

export const configurado = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
  !/COLE_AQUI/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));

export const sb = configurado
  ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

/** Quem está usando (preenchido pelo app.js ao entrar). */
export const sessao = { perfil: null, unidade: null };

// ---------------- ERROS EM PORTUGUÊS ----------------
export function traduzirErro(erro) {
  const msg = String((erro && (erro.message || erro.error_description || erro.msg)) || erro || '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Este e-mail ainda não foi confirmado. Abra o convite que chegou no seu e-mail.';
  if (/row-level security|permission denied|42501/i.test(msg)) return 'Sem permissão para isso. Confira se você está na unidade certa.';
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if (/duplicate key/i.test(msg)) return 'Esse registro já existe.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return msg || 'Erro desconhecido.';
}

function ok(res) {
  if (res.error) throw new Error(traduzirErro(res.error));
  return res.data;
}

/** Busca TODAS as linhas (o Supabase entrega no máximo 1.000 por vez). */
async function todas(montarConsulta, lote = 1000) {
  const lista = [];
  for (let inicio = 0; ; inicio += lote) {
    const parte = ok(await montarConsulta().range(inicio, inicio + lote - 1));
    lista.push(...parte);
    if (parte.length < lote) break;
  }
  return lista;
}

// ---------------- LOGIN ----------------
export async function entrar(email, senha) {
  ok(await sb.auth.signInWithPassword({ email: email.trim(), password: senha }));
}
export async function sair() { await sb.auth.signOut(); }
export async function esqueciSenha(email) {
  ok(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname }));
}
export async function definirSenha(senha) { ok(await sb.auth.updateUser({ password: senha })); }
export async function sessaoAtual() { return (await sb.auth.getSession()).data.session; }

export async function carregarPerfil() {
  const p = ok(await sb.rpc('meu_perfil'));
  sessao.perfil = p;
  sessao.unidade = p ? p.unidade : null;
  return p;
}
export const souAdmin = () => sessao.perfil && sessao.perfil.papel === 'admin';

// ---------------- PACIENTES ----------------
export async function pacientePorCns(cns) {
  const r = ok(await sb.from('pacientes').select('*').eq('cns', cns).order('atualizado_em', { ascending: false }).limit(1));
  return r[0] || null;
}
export async function pacienteExistente(cns, cpf) {
  const filtros = [];
  if (cns) filtros.push('cns.eq.' + cns);
  if (cpf) filtros.push('cpf.eq.' + cpf);
  if (!filtros.length) return null;
  const r = ok(await sb.from('pacientes').select('*').or(filtros.join(',')).limit(1));
  return r[0] || null;
}
export async function pacientePorId(id) {
  return ok(await sb.from('pacientes').select('*').eq('id', id).single());
}
export async function buscarPacientes(termo) {
  return ok(await sb.rpc('buscar_pacientes', { p_termo: termo }));
}
export async function listarPacientes(termo, pagina = 0, porPagina = 50) {
  let q = sb.from('pacientes').select('id, cns, nome, nascimento, cpf, telefone', { count: 'exact' });
  const t = String(termo || '').trim();
  if (t) {
    const dig = t.replace(/\D/g, '');
    if (dig.length >= 5 && dig.length === t.replace(/[\s.\-]/g, '').length) q = q.or('cns.like.*' + dig + '*,cpf.like.*' + dig + '*');
    else {
      const norm = t.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[%,()]/g, ' ').trim();
      norm.split(/\s+/).forEach((w) => { q = q.ilike('nome_busca', '%' + w + '%'); });
    }
  }
  const res = await q.order('nome').range(pagina * porPagina, pagina * porPagina + porPagina - 1);
  return { lista: ok(res), total: res.count || 0 };
}
export async function salvarPaciente(p) {
  const campos = { ...p };
  delete campos.id; delete campos.nome_busca; delete campos.criado_em; delete campos.atualizado_em; delete campos.unidade_id;
  if (p.id) return ok(await sb.from('pacientes').update(campos).eq('id', p.id).select().single());
  return ok(await sb.from('pacientes').insert(campos).select().single());
}
export async function excluirPaciente(id) { ok(await sb.from('pacientes').delete().eq('id', id)); }

// ---------------- CADASTROS (CNES, profissionais, referência) ----------------
export async function listarEstabelecimentos() {
  return todas(() => sb.from('estabelecimentos').select('*').order('nome'));
}
export async function listarProfissionais() {
  return todas(() => sb.from('profissionais').select('*').order('numero'));
}
export async function listarReferencia() {
  return todas(() => sb.from('referencia_sigtap').select('*').order('procedimento'));
}
export async function cadastrarProfissional(nome, documento, tipo) {
  return ok(await sb.rpc('cadastrar_profissional', { p_nome: nome, p_documento: documento, p_tipo: tipo }));
}
/** Salva uma linha de cadastro (tabela = estabelecimentos | profissionais | referencia_sigtap) */
export async function salvarCadastro(tabela, linha) {
  const campos = { ...linha };
  delete campos.id; delete campos.unidade_id; delete campos.criado_em;
  if (linha.id) return ok(await sb.from(tabela).update(campos).eq('id', linha.id).select().single());
  return ok(await sb.from(tabela).insert(campos).select().single());
}
export async function excluirCadastro(tabela, id) { ok(await sb.from(tabela).delete().eq('id', id)); }

// ---------------- SIGTAP ----------------
export async function buscarSigtap(termo, limite = 60) {
  return ok(await sb.rpc('buscar_sigtap', { p_termo: termo, p_limite: limite }));
}
/** { mapa: Map(codigo → {nome, habilitacoes}), competencia } da tabela mais recente, só dos códigos pedidos */
export async function sigtapPorCodigos(codigos) {
  const comp = ok(await sb.from('sigtap_procedimentos').select('competencia').order('competencia', { ascending: false }).limit(1));
  if (!comp.length) return { mapa: null, competencia: '' };
  const competencia = comp[0].competencia;
  const mapa = new Map();
  const lista = codigos.filter(Boolean);
  if (lista.length) {
    const linhas = ok(await sb.from('sigtap_procedimentos').select('codigo, nome, habilitacoes')
      .eq('competencia', competencia).in('codigo', lista));
    linhas.forEach((l) => mapa.set(l.codigo, { nome: l.nome, habilitacoes: l.habilitacoes }));
  }
  // .has() da regra antiga precisa saber se o código existe na tabela inteira:
  // aqui o mapa só tem os códigos pedidos, que são exatamente os que a regra consulta.
  return { mapa, competencia };
}
export async function infoSigtap() {
  const comp = ok(await sb.from('sigtap_procedimentos').select('competencia').order('competencia', { ascending: false }).limit(1));
  if (!comp.length) return { competencia: '', total: 0 };
  const res = await sb.from('sigtap_procedimentos').select('codigo', { count: 'exact', head: true }).eq('competencia', comp[0].competencia);
  return { competencia: comp[0].competencia, total: res.count || 0 };
}

// ---------------- RASCUNHO (o formulário em andamento) ----------------
export async function carregarRascunho() {
  const r = ok(await sb.from('rascunhos').select('dados').eq('user_id', sessao.perfil.user_id).maybeSingle());
  return r ? r.dados : null;
}
export async function salvarRascunho(dados) {
  ok(await sb.from('rascunhos').upsert({
    user_id: sessao.perfil.user_id, unidade_id: sessao.unidade.id, dados, atualizado_em: new Date().toISOString()
  }));
}

// ---------------- APACs E ARQUIVOS ----------------
export async function enviarArquivo(bucket, caminho, bytes, tipo = 'application/pdf') {
  const res = await sb.storage.from(bucket).upload(caminho, new Blob([bytes], { type: tipo }), { contentType: tipo, upsert: false });
  if (res.error) {
    const e = new Error(traduzirErro(res.error));
    e.jaExiste = /exists|Duplicate/i.test(res.error.message || '') || res.error.statusCode === '409';
    throw e;
  }
  return res.data.path;
}
export async function substituirArquivo(bucket, caminho, bytes, tipo) {
  ok(await sb.storage.from(bucket).upload(caminho, new Blob([bytes], { type: tipo }), { contentType: tipo, upsert: true }));
  return caminho;
}
export async function linkTemporario(bucket, caminho, segundos = 600) {
  return ok(await sb.storage.from(bucket).createSignedUrl(caminho, segundos)).signedUrl;
}
export async function baixarArquivo(bucket, caminho) {
  return ok(await sb.storage.from(bucket).download(caminho));
}
export async function registrarApac(linha) {
  return ok(await sb.from('apacs').insert(linha).select('id').single());
}
export async function listarApacs(limite = 100) {
  return ok(await sb.from('apacs')
    .select('id, criado_em, paciente_nome, paciente_cns, proc_codigo, proc_nome, pdf_path, dados')
    .order('criado_em', { ascending: false }).limit(limite));
}

// ---------------- PROTOCOLO ----------------
export async function salvarProtocolo(p, forcar = false) {
  return ok(await sb.rpc('salvar_protocolo', { p, p_forcar: forcar }));
}
export async function listarProtocolo({ de, ate, texto } = {}) {
  return todas(() => {
    let q = sb.from('protocolo').select('*');
    if (de) q = q.gte('criado_em', de + 'T00:00:00-04:00');
    if (ate) q = q.lte('criado_em', ate + 'T23:59:59-04:00');
    const t = String(texto || '').trim().replace(/[%,()]/g, ' ');
    if (t) q = q.or('nome_paciente.ilike.*' + t + '*,procedimento.ilike.*' + t + '*,codigo.ilike.*' + t + '*');
    return q.order('criado_em', { ascending: false });
  });
}
export async function atualizarProtocolo(id, campos) {
  ok(await sb.from('protocolo').update(campos).eq('id', id));
}
export async function excluirProtocolo(id) { ok(await sb.from('protocolo').delete().eq('id', id)); }

// ---------------- IA ----------------
/**
 * Chama a IA pela função "ia" do Supabase (a chave fica no servidor).
 * opcoes = { funcao, system, content, maxTokens } → { texto, entrada, saida, modelo, parou }
 */
export async function chamarIA(opcoes) {
  const { data, error } = await sb.functions.invoke('ia', { body: opcoes });
  if (error) {
    let detalhe = '';
    try { detalhe = (await error.context.json()).erro || ''; } catch (e) { /* sem corpo */ }
    throw new Error(detalhe || 'O servidor de IA não respondeu. Tente de novo em instantes.');
  }
  if (!data || !data.ok) throw new Error((data && data.erro) || 'O servidor de IA recusou o pedido.');
  return data;
}

/** Transforma a resposta da IA em objeto (aceita cercas de markdown ou texto ao redor). */
export function interpretarJsonIA(texto) {
  const limpo = String(texto || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(limpo); } catch (e) { /* tenta o recorte abaixo */ }
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini !== -1 && fim > ini) {
    try { return JSON.parse(limpo.substring(ini, fim + 1)); } catch (e2) { /* erro abaixo */ }
  }
  throw new Error('A resposta da IA não veio em JSON válido. Tente novamente.');
}

export async function consumoMes(mes) {
  return ok(await sb.rpc('consumo_mes', { p_mes: mes || null }));
}

// ---------------- UNIDADE ----------------
export async function atualizarMinhaUnidade({ nome, municipio, uf, email_secretaria, logo_path }) {
  ok(await sb.rpc('atualizar_minha_unidade', {
    p_nome: nome, p_municipio: municipio, p_uf: uf,
    p_email_secretaria: email_secretaria ?? null, p_logo_path: logo_path ?? null
  }));
}

// ---------------- ADMIN ----------------
export async function listarUnidades() {
  return ok(await sb.from('unidades').select('*').order('nome'));
}
export async function criarUnidade({ nome, municipio, uf, limite, copiarDe }) {
  return ok(await sb.rpc('criar_unidade', {
    p_nome: nome, p_municipio: municipio, p_uf: uf,
    p_limite: limite || null, p_copiar_de: copiarDe || null
  }));
}
export async function atualizarUnidade(id, campos) { ok(await sb.from('unidades').update(campos).eq('id', id)); }
export async function gerarCodigoLegado(id) { return ok(await sb.rpc('gerar_codigo_legado', { p_unidade: id })); }
export async function listarPerfis() { return ok(await sb.from('perfis').select('*').order('email')); }
export async function atualizarPerfil(userId, campos) { ok(await sb.from('perfis').update(campos).eq('user_id', userId)); }
export async function convidarUsuario(dadosConvite) {
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body: dadosConvite });
  if (error) throw new Error('Não consegui falar com o servidor: ' + traduzirErro(error));
  if (!data.ok) throw new Error(data.erro);
  return data.msg;
}
export async function resumoConsumo() {
  return ok(await sb.from('resumo_consumo').select('*').order('mes', { ascending: false }).order('unidade'));
}
export async function lerPrecos() {
  return ok(await sb.from('precos').select('*').eq('id', 1).maybeSingle());
}
export async function salvarPrecos(campos) {
  ok(await sb.from('precos').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', 1));
}

// ---------------- IMPORTAÇÃO ----------------
export async function inserirEmLotes(tabela, linhas, { lote = 500, aoAvancar, upsert } = {}) {
  let feitos = 0;
  for (let i = 0; i < linhas.length; i += lote) {
    const parte = linhas.slice(i, i + lote);
    const q = upsert
      ? sb.from(tabela).upsert(parte, { onConflict: upsert, ignoreDuplicates: true, defaultToNull: false })
      : sb.from(tabela).insert(parte, { defaultToNull: false });   // coluna que falta numa linha usa o valor padrão do banco
    ok(await q);
    feitos += parte.length;
    if (aoAvancar) aoAvancar(feitos, linhas.length);
  }
  return feitos;
}
export async function lerTodas(tabela, colunas) {
  return todas(() => sb.from(tabela).select(colunas));
}

// ---------------- 💾 CÓPIA DE SEGURANÇA ----------------
/** Tabelas da unidade que entram na cópia (rótulo = nome da aba no Excel) */
export const TABELAS_COPIA = [
  { tabela: 'pacientes',         rotulo: 'Pacientes' },
  { tabela: 'protocolo',         rotulo: 'Protocolo' },
  { tabela: 'apacs',             rotulo: 'APACs geradas' },
  { tabela: 'conferencias',      rotulo: 'Conferências' },
  { tabela: 'profissionais',     rotulo: 'Profissionais' },
  { tabela: 'estabelecimentos',  rotulo: 'Estabelecimentos' },
  { tabela: 'referencia_sigtap', rotulo: 'Referência SIGTAP' },
  { tabela: 'sugestoes_sigtap',  rotulo: 'Sugestões SIGTAP' },
  { tabela: 'uso_ia',            rotulo: 'Consumo IA' }
];

/** Lê todas as linhas de cada tabela, só da unidade de quem está logado. */
export async function lerCopiaDeSeguranca(aoProgredir) {
  const uid = sessao.unidade.id;
  const resultado = [];
  for (const t of TABELAS_COPIA) {
    if (aoProgredir) aoProgredir(t.rotulo);
    try {
      const linhas = await todas(() => sb.from(t.tabela).select('*').eq('unidade_id', uid).order('id'));
      resultado.push({ ...t, linhas });
    } catch (e) {
      resultado.push({ ...t, linhas: [], erro: e.message });
    }
  }
  return resultado;
}

