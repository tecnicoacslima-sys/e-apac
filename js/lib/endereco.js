/**
 * CEP → endereço (BrasilAPI) e código IBGE do município (API do IBGE).
 * Mesmo que preencherEnderecoPorCEP do Código.gs, direto do navegador.
 */

const cacheIbge = {};

function semAcento(s) {
  return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Devolve { logradouro, bairro, municipio, uf, cod_ibge } ou null se o CEP não existir. */
export async function buscarCep(cep, fetchFn = fetch) {
  const dig = String(cep || '').replace(/\D/g, '');
  if (dig.length !== 8) return null;

  const res = await fetchFn('https://brasilapi.com.br/api/cep/v1/' + dig);
  if (!res.ok) return null;
  const data = await res.json();

  const r = {
    logradouro: (data.street || '').toUpperCase(),
    bairro: (data.neighborhood || '').toUpperCase(),
    municipio: (data.city || '').toUpperCase(),
    uf: (data.state || '').toUpperCase(),
    cod_ibge: ''
  };

  if (r.municipio && r.uf) {
    try {
      if (!cacheIbge[r.uf]) {
        const resIbge = await fetchFn('https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + r.uf + '/municipios');
        cacheIbge[r.uf] = resIbge.ok ? await resIbge.json() : [];
      }
      const alvo = semAcento(r.municipio);
      const m = cacheIbge[r.uf].find((x) => semAcento(x.nome) === alvo);
      if (m) r.cod_ibge = String(m.id);
    } catch (e) {
      console.warn('IBGE:', e);
    }
  }
  return r;
}
