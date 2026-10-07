// normalize.js — converte os JSON brutos do TSE ("-u.json") num modelo enxuto e estável.
// Módulo puro: usado no navegador (dados ao vivo) e no Node (snapshots do GitHub Actions).

const n = v => (v == null || v === '' ? 0 : Number(String(v).replace(',', '.')) || 0);

/** Cargos do TSE (código → metadados). */
export const CARGOS = {
    1: { cd: 1, nome: 'Presidente', curto: 'Presidente', tipo: 'maj', ele: 'federal' },
    3: { cd: 3, nome: 'Governador', curto: 'Governador', tipo: 'maj', ele: 'estadual' },
    5: { cd: 5, nome: 'Senador', curto: 'Senado', tipo: 'maj', ele: 'estadual' },
    6: { cd: 6, nome: 'Deputado Federal', curto: 'Dep. Federal', tipo: 'prop', ele: 'estadual' },
    7: { cd: 7, nome: 'Deputado Estadual', curto: 'Dep. Estadual', tipo: 'prop', ele: 'estadual' },
    8: { cd: 8, nome: 'Deputado Distrital', curto: 'Dep. Distrital', tipo: 'prop', ele: 'estadual' },
};

/** Normaliza um arquivo "-u.json" do TSE. */
export function normalizeResult(raw) {
    if (!raw || !raw.carg) return null;
    const c = raw.carg[0] || {};
    const candidatos = [], partidos = [];
    for (const agr of c.agr || []) {
        for (const p of agr.par || []) {
            const part = { sg: p.sg, nm: p.nm, num: p.n, votos: n(p.tvtn), legenda: n(p.tvtl), fed: p.nfed || '', coligacao: agr.com || p.sg, eleitos: 0 };
            for (const x of p.cand || []) {
                const eleito = x.e === 's' && /eleito/i.test(x.st || '');
                if (eleito) part.eleitos++;
                candidatos.push({
                    n: x.n, nm: x.nmu || x.nm, nc: x.nm, sq: x.sqcand, p: p.sg, cl: agr.com || p.sg,
                    v: n(x.vap), pv: n(x.pvapn || x.pvap), st: x.st || '', e: x.e === 's', eleito,
                    seg: /2º turno/i.test(x.st || ''), dvt: x.dvt || '',
                    vs: (x.vs || []).map(v => v.nmu || v.nm),
                });
            }
            partidos.push(part);
        }
    }
    candidatos.sort((a, b) => b.v - a.v);
    partidos.sort((a, b) => b.eleitos - a.eleitos || b.votos - a.votos);
    const s = raw.s || {}, e = raw.e || {}, v = raw.v || {};
    return {
        ele: raw.ele, turno: Number(raw.t), abr: raw.cdabr, tpabr: raw.tpabr,
        atualizado: `${raw.dg} ${raw.hg}`, totalizado: raw.tf === 's' || n(s.pstn) >= 100,
        cargo: Number(c.cd), cargoNome: c.nmn, vagas: Number(c.nv || 1), qe: n(c.qe),
        secoes: { total: n(s.ts), totalizadas: n(s.st), pct: n(s.pstn) },
        eleitorado: n(e.te), comparecimento: n(e.c), pComparecimento: n(e.pcn), abstencao: n(e.a), pAbstencao: n(e.pan),
        validos: n(v.vv), brancos: n(v.vb), pBrancos: n(v.pvbn), nulos: n(v.tvn), pNulos: n(v.ptvnn),
        legenda: n(v.vl), nominais: n(v.vnom), anulados: n(v.vansj),
        candidatos, partidos,
    };
}

/** Normaliza o arquivo de abrangência ("-ab.json"): totais de comparecimento por UF ou município. */
export function normalizeAbrangencia(raw) {
    const out = {};
    for (const a of raw?.abr || []) {
        const s = a.s || {}, e = a.e || {};
        out[a.cdabr] = { pct: n(s.pstn), te: n(e.te), c: n(e.c), pc: n(e.pcn), a: n(e.a) };
    }
    return out;
}

/** Versão mínima para mapas (snapshot por município): votos por número de candidato. */
export function compactForMap(r) {
    if (!r) return null;
    return {
        pct: r.secoes.pct, vv: r.validos, c: r.comparecimento, te: r.eleitorado, vb: r.brancos, vn: r.nulos,
        v: Object.fromEntries(r.candidatos.filter(c => c.v > 0).slice(0, 12).map(c => [c.n, c.v])),
    };
}
