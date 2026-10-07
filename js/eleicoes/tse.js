// tse.js — acesso aos dados oficiais do TSE no navegador.
// Estratégia: consulta o CDN do TSE ao vivo (CORS liberado) e, se falhar, usa o snapshot
// versionado em data/eleicoes/ (gerado pelo GitHub Actions a cada 6h / 10 min na noite da eleição).
import { normalizeResult, normalizeAbrangencia, compactForMap } from './normalize.js';
import { decodeBU } from './bu.js';

export const ANO = '2026';
export const CICLO = `ele${ANO}`;
const BASE = 'https://resultados.tse.jus.br/oficial';
const SNAP = `data/eleicoes/${ANO}`;
const p4 = c => String(c).padStart(4, '0');
const p6 = c => String(c).padStart(6, '0');

export const UFS = {
    ac: 'Acre', al: 'Alagoas', ap: 'Amapá', am: 'Amazonas', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal',
    es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mt: 'Mato Grosso', ms: 'Mato Grosso do Sul', mg: 'Minas Gerais',
    pa: 'Pará', pb: 'Paraíba', pr: 'Paraná', pe: 'Pernambuco', pi: 'Piauí', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte',
    rs: 'Rio Grande do Sul', ro: 'Rondônia', rr: 'Roraima', sc: 'Santa Catarina', sp: 'São Paulo', se: 'Sergipe', to: 'Tocantins',
};
/** Código IBGE da UF → sigla. */
export const IBGE_UF = { 11: 'ro', 12: 'ac', 13: 'am', 14: 'rr', 15: 'pa', 16: 'ap', 17: 'to', 21: 'ma', 22: 'pi', 23: 'ce', 24: 'rn', 25: 'pb', 26: 'pe', 27: 'al', 28: 'se', 29: 'ba', 31: 'mg', 32: 'es', 33: 'rj', 35: 'sp', 41: 'pr', 42: 'sc', 43: 'rs', 50: 'ms', 51: 'mt', 52: 'go', 53: 'df' };

// Códigos conhecidos do ciclo 2026 (substituídos pelo ele-c.json ao vivo quando disponível)
const FALLBACK_CFG = {
    federal: { t1: { ele: '6257', pleito: '3220' }, t2: { ele: '6258', pleito: null } },
    estadual: { t1: { ele: '6259', pleito: '3220' }, t2: { ele: '6260', pleito: null } },
};

const cache = new Map();
export const status = { fonte: 'tse', erros: 0, ultimaFalha: null };

async function fetchJSON(url, { ttl = 30000, signal } = {}) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    const r = await fetch(url, { signal, cache: 'no-cache' });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    const v = await r.json();
    cache.set(url, { t: Date.now(), v });
    return v;
}

/** Tenta o TSE ao vivo; em erro de rede/5xx cai no snapshot. 404 em ambos → null. */
async function liveOrSnap(liveUrl, snapUrl, transform, opts = {}) {
    try {
        const raw = await fetchJSON(liveUrl, opts);
        status.fonte = 'tse';
        return transform ? transform(raw) : raw;
    } catch (e) {
        if (opts.signal?.aborted) throw e;
        if (!snapUrl) { if (e.status === 404) return null; throw e; }
        try {
            const v = await fetchJSON(snapUrl, { ttl: 60000 });
            status.fonte = 'snapshot'; status.ultimaFalha = new Date();
            return v;
        } catch { if (e.status === 404) return null; throw e; }
    }
}

let cfgPromise = null;
/** Descobre códigos de eleição e pleito (1º/2º turno) do ciclo. */
export function getConfig() {
    cfgPromise ??= (async () => {
        const cfg = structuredClone(FALLBACK_CFG);
        try {
            const raw = await fetchJSON(`${BASE}/comum/config/ele-c.json`, { ttl: 300000 });
            for (const p of raw.pl || []) {
                if (p.c !== CICLO) continue;
                for (const e of p.e) {
                    if (e.tp !== '8' && e.tp !== '1') continue;
                    const tipo = e.tp === '8' ? 'federal' : 'estadual';
                    cfg[tipo][`t${e.t}`] = { ele: e.cd, pleito: p.cd, data: p.dt };
                    if (e.cdt2) cfg[tipo].t2 = { ...cfg[tipo].t2, ele: e.cdt2 };
                }
            }
        } catch {
            try { const s = await fetchJSON(`${SNAP}/config.json`); Object.assign(cfg, s.eleicoes); } catch { /* usa fallback */ }
        }
        return cfg;
    })();
    return cfgPromise;
}

export const tipoDoCargo = cargo => (cargo === 1 ? 'federal' : 'estadual');

async function eleicao(cargo, turno) {
    const cfg = await getConfig();
    return cfg[tipoDoCargo(cargo)][`t${turno}`];
}

/**
 * Resultado normalizado.
 * @param {object} q { cargo, turno, uf ('br'|sigla), mun (cód. TSE), zona }
 */
export async function getResultado({ cargo, turno = 1, uf = 'br', mun = null, zona = null }, opts) {
    const { ele } = await eleicao(cargo, turno);
    const abr = uf === 'br' ? 'br' : uf;
    let file = `${abr}-c${p4(cargo)}-e${p6(ele)}-u.json`;
    if (mun) file = `${abr}${mun}${zona ? `-z${p4(zona)}` : ''}-c${p4(cargo)}-e${p6(ele)}-u.json`;
    const live = `${BASE}/${CICLO}/${ele}/dados/${abr}/${file}`;
    const snap = !mun ? `${SNAP}/${ele}/${abr}-c${cargo}.json` : null;
    return liveOrSnap(live, snap, normalizeResult, opts);
}

/** Totais de comparecimento por UF (uf='br') ou por município (uf=sigla). */
export async function getAbrangencia({ cargo, turno = 1, uf = 'br' }) {
    const { ele } = await eleicao(cargo, turno);
    return liveOrSnap(`${BASE}/${CICLO}/${ele}/dados/${uf}/${uf}-e${p6(ele)}-ab.json`, `${SNAP}/${ele}/${uf}-ab.json`, normalizeAbrangencia);
}

let munPromise = null;
/** Municípios: { uf: [[cdTSE, cdIBGE, nome, zonas[], capital]] } */
export function getMunicipios() {
    munPromise ??= (async () => {
        try { return await fetchJSON(`${SNAP}/municipios.json`, { ttl: Infinity }); } catch { /* ao vivo */ }
        const { ele } = await eleicao(1, 1);
        const cm = await fetchJSON(`${BASE}/${CICLO}/${ele}/config/mun-e${p6(ele)}-cm.json`, { ttl: Infinity });
        const out = {};
        for (const a of cm.abr) out[a.cd] = a.mu.map(m => [m.cd, m.cdi, m.nm, m.z, m.c === 's' ? 1 : 0]);
        return out;
    })();
    return munPromise;
}

/**
 * Resultados por município de uma UF, para o mapa (formato compacto).
 * Usa o snapshot quando a totalização terminou; senão consulta cada município ao vivo.
 */
export async function getMapaMunicipios({ cargo, turno = 1, uf }, onProgress, signal) {
    const { ele } = await eleicao(cargo, turno);
    const ufRes = await getResultado({ cargo, turno, uf }).catch(() => null);
    const snapUrl = `${SNAP}/${ele}/mun/${uf}-c${cargo}.json`;
    if (!ufRes || ufRes.totalizado) {
        try { const s = await fetchJSON(snapUrl, { ttl: 600000 }); onProgress?.(1, 1); return s; } catch { /* ao vivo */ }
    }
    const muns = (await getMunicipios())[uf] || [];
    const out = {}; let done = 0;
    const q = [...muns];
    await Promise.all(Array.from({ length: 12 }, async () => {
        while (q.length && !signal?.aborted) {
            const [cd] = q.shift();
            const r = await getResultado({ cargo, turno, uf, mun: cd }, { signal }).catch(() => null);
            if (r) out[cd] = compactForMap(r);
            onProgress?.(++done, muns.length);
        }
    }));
    return out;
}

/** URL da foto oficial do candidato. */
export async function fotoUrl(cargo, turno, uf, sq) {
    const { ele } = await eleicao(cargo, turno);
    return `${BASE}/${CICLO}/${ele}/fotos/${cargo === 1 ? 'br' : uf}/${sq}.jpeg`;
}

// ───────────── Seções eleitorais (Boletins de Urna) ─────────────

const csCache = new Map();
/** Lista de seções de uma UF: { mun: { zona: [secao...] } } */
export async function getSecoes(uf, turno = 1) {
    const { pleito } = await eleicao(1, turno);
    if (!pleito) return null;
    const key = `${pleito}-${uf}`;
    if (!csCache.has(key)) {
        csCache.set(key, (async () => {
            const cs = await fetchJSON(`${BASE}/${CICLO}/arquivo-urna/${pleito}/config/${uf}/${uf}-p${p6(pleito)}-cs.json`, { ttl: 600000 });
            const out = {};
            for (const m of cs.abr?.[0]?.mu || []) {
                out[m.cd] = {};
                for (const z of m.zon || []) out[m.cd][z.cd] = (z.sec || []).map(s => s.ns);
            }
            return out;
        })().catch(e => { csCache.delete(key); throw e; }));
    }
    return csCache.get(key);
}

/** Baixa e decodifica o Boletim de Urna de uma seção. */
export async function getBoletim({ uf, mun, zona, secao, turno = 1 }, opts = {}) {
    const { pleito } = await eleicao(1, turno);
    const base = `${BASE}/${CICLO}/arquivo-urna/${pleito}/dados/${uf}/${mun}/${p4(zona)}/${p4(secao)}`;
    const aux = await fetchJSON(`${base}/p${p6(pleito)}-${uf}-m${mun}-z${p4(zona)}-s${p4(secao)}-aux.json`, { ttl: 600000, ...opts });
    const h = (aux.hashes || []).find(x => /totaliz/i.test(x.st || '')) || aux.hashes?.[0];
    const arq = h?.arq?.find(a => a.tp === 'bu');
    if (!arq) return { status: aux.st || 'Sem boletim', bu: null };
    const url = `${base}/${h.hash}/${arq.nm}`;
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`BU HTTP ${r.status}`);
    const bu = decodeBU(new Uint8Array(await r.arrayBuffer()));
    return { status: aux.st, recebido: `${h.dr} ${h.hr}`, url, arquivos: h.arq.map(a => ({ ...a, url: `${base}/${h.hash}/${a.nm}` })), bu };
}

/** Converte um BU decodificado em contagens por cargo: { cargo: { votos:{numero:qtd}, brancos, nulos, legenda:{partido:qtd}, comparecimento, aptos } } */
export function contagemDoBoletim(bu) {
    const out = {};
    for (const e of bu?.eleicoes || []) {
        for (const c of e.cargos) {
            const o = out[c.cargo] ??= { votos: {}, legenda: {}, brancos: 0, nulos: 0, comparecimento: c.comparecimento, aptos: e.aptos, eleicao: e.id };
            for (const v of c.votos) {
                if (v.tipo === 1) o.votos[v.numero] = (o.votos[v.numero] || 0) + v.qtd;
                else if (v.tipo === 2) o.brancos += v.qtd;
                else if (v.tipo === 3) o.nulos += v.qtd;
                else if (v.tipo === 4) o.legenda[v.partido] = (o.legenda[v.partido] || 0) + v.qtd;
            }
        }
    }
    return out;
}
