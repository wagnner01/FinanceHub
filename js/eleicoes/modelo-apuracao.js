// modelo-apuracao.js — projeção do resultado final durante a apuração, por município.
// Módulo puro (sem DOM): roda no GitHub Actions e pode ser usado pelo painel.
//
// Método (mesma família do modelo de Rodrigo Mahlmeister / reconstrução aberta em
// github.com/oxeeraassim/apuracao), com base no 1º turno de 2026:
//  1. Município já com seções apuradas: desvio ("swing") em log-odds entre a parcela de Lula no
//     2 a 2 do 2º turno (parcial) e a do 1º turno (final) no mesmo município. Comparar o município
//     com ele mesmo elimina o viés de composição (Sul/capitais chegando antes do Nordeste).
//  2. Encolhimento hierárquico: swing da UF puxado para o da região, e o da região para o nacional,
//     com força proporcional aos votos já apurados. Cedo o modelo é quase nacional; depois, estadual.
//  3. Projeção: parte apurada é contada como está; o que falta em cada município recebe a parcela
//     do 1º turno + swing (do próprio município, encolhido para o da UF).
//  4. Incerteza: bootstrap dos municípios apurados dentro de cada UF + termo que encolhe com o
//     que falta apurar.

export const LULA = '13', FLAVIO = '22';
export const REGIAO = {
    ac: 'N', am: 'N', ap: 'N', pa: 'N', ro: 'N', rr: 'N', to: 'N',
    al: 'NE', ba: 'NE', ce: 'NE', ma: 'NE', pb: 'NE', pe: 'NE', pi: 'NE', rn: 'NE', se: 'NE',
    df: 'CO', go: 'CO', ms: 'CO', mt: 'CO',
    es: 'SE', mg: 'SE', rj: 'SE', sp: 'SE',
    pr: 'S', rs: 'S', sc: 'S',
    zz: 'EX',
};
const K_REGIAO = 400000;  // votos: força do nacional sobre a região
const K_UF = 150000;      // votos: força da região sobre a UF
const K_MUN = 3000;       // votos: força da UF sobre o município
const logit = p => Math.log(p / (1 - p));
const inv = x => 1 / (1 + Math.exp(-x));
const clampP = p => Math.min(0.995, Math.max(0.005, p));

function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
}

/** Linhas por município: { uf, l1, f1, l2, f2, pct } a partir dos snapshots compactos ({ v, pct }). */
export function linhas(base1, parcial2) {
    const out = [];
    for (const [uf, muns] of Object.entries(base1)) {
        for (const [cd, b] of Object.entries(muns)) {
            const l1 = b.v?.[LULA] || 0, f1 = b.v?.[FLAVIO] || 0;
            if (!(l1 + f1)) continue;
            const p = parcial2[uf]?.[cd];
            out.push({ uf, cd, l1, f1, l2: p?.v?.[LULA] || 0, f2: p?.v?.[FLAVIO] || 0, pct: p?.pct || 0 });
        }
    }
    return out;
}

function swingMedio(rs) {
    let w = 0, s = 0;
    for (const r of rs) { w += r.w; s += r.w * r.d; }
    return { w, d: w ? s / w : 0 };
}

/** Projeção para um conjunto de linhas (uma reamostragem, no bootstrap). */
function projetar(rows) {
    const ap = rows.filter(r => r.pct > 0 && r.l2 + r.f2 > 0);
    for (const r of ap) { r.w = r.l2 + r.f2; r.d = logit(clampP(r.l2 / r.w)) - logit(clampP(r.l1 / (r.l1 + r.f1))); }
    const nac = swingMedio(ap.filter(r => r.uf !== 'zz'));
    const porReg = {}, porUf = {};
    for (const r of ap) { (porReg[REGIAO[r.uf]] ??= []).push(r); (porUf[r.uf] ??= []).push(r); }
    const reg = {};
    for (const [k, rs] of Object.entries(porReg)) { const m = swingMedio(rs); reg[k] = (m.w * m.d + K_REGIAO * nac.d) / (m.w + K_REGIAO); }
    const ufSwing = {};
    const ufs = new Set(rows.map(r => r.uf));
    for (const uf of ufs) {
        const m = swingMedio(porUf[uf] || []);
        const pai = reg[REGIAO[uf]] ?? nac.d;
        ufSwing[uf] = (m.w * m.d + K_UF * pai) / (m.w + K_UF);
    }
    // Comparecimento relativo (2T apurado ÷ 1T esperado na parte apurada), por UF com fallback nacional
    const razao = {};
    let nN = 0, dN = 0;
    for (const uf of ufs) {
        let n = 0, d = 0;
        for (const r of porUf[uf] || []) { n += r.w; d += (r.l1 + r.f1) * r.pct / 100; }
        razao[uf] = { n, d }; if (uf !== 'zz') { nN += n; dN += d; }
    }
    const rNac = dN ? nN / dN : 1;
    let L = 0, T = 0, apurado = 0;
    const porUfOut = {};
    for (const r of rows) {
        const rz = razao[r.uf];
        const ratio = rz.d > 50000 ? rz.n / rz.d : rNac;
        const resta = (r.l1 + r.f1) * (1 - r.pct / 100) * ratio;
        const own = r.w ? (r.w * r.d + K_MUN * ufSwing[r.uf]) / (r.w + K_MUN) : ufSwing[r.uf];
        const s = inv(logit(clampP(r.l1 / (r.l1 + r.f1))) + own);
        const l = r.l2 + resta * s, t = r.l2 + r.f2 + resta;
        L += l; T += t; apurado += r.l2 + r.f2;
        const u = porUfOut[r.uf] ??= { l: 0, t: 0, ap: 0 };
        u.l += l; u.t += t; u.ap += r.l2 + r.f2;
    }
    return { lula: L / T, total: T, apurado, swingNacional: nac.d, ufSwing, porUf: porUfOut };
}

/**
 * @param base1    { uf: { cdMun: { v } } } — 1º turno final por município (inclui 'zz')
 * @param parcial2 { uf: { cdMun: { v, pct } } } — 2º turno parcial por município
 */
export function projetarApuracao(base1, parcial2, { reamostras = 200, semente = 7 } = {}) {
    const rows = linhas(base1, parcial2);
    const central = projetar(rows.map(r => ({ ...r })));
    if (!central.apurado) return null;
    // Bootstrap: reamostra os municípios apurados dentro de cada UF
    let seed = semente;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const porUf = {};
    for (const r of rows) (porUf[r.uf] ??= { ap: [], resto: [] })[r.pct > 0 && r.l2 + r.f2 > 0 ? 'ap' : 'resto'].push(r);
    const sims = [];
    for (let i = 0; i < reamostras; i++) {
        const amostra = [];
        for (const { ap, resto } of Object.values(porUf)) {
            // Os municípios sorteados emprestam seu swing; o eleitorado de cada município é mantido
            for (const r of ap) { const o = ap[Math.floor(rnd() * ap.length)]; amostra.push({ ...r, l2: r.l2, f2: r.f2, _d: o }); }
            for (const r of resto) amostra.push({ ...r });
        }
        // Substitui a parcial pelo swing do sorteado aplicado ao 1º turno do próprio município
        for (const r of amostra) if (r._d) {
            const o = r._d, w = r.l2 + r.f2;
            const d = logit(clampP(o.l2 / (o.l2 + o.f2))) - logit(clampP(o.l1 / (o.l1 + o.f1)));
            const s = inv(logit(clampP(r.l1 / (r.l1 + r.f1))) + d);
            r.l2 = w * s; r.f2 = w * (1 - s);
        }
        sims.push(projetar(amostra).lula);
    }
    const m = sims.reduce((a, b) => a + b, 0) / sims.length;
    const sdBoot = Math.sqrt(sims.reduce((a, b) => a + (b - m) ** 2, 0) / (sims.length - 1));
    const falta = 1 - central.apurado / central.total;
    const sigma = Math.sqrt(sdBoot ** 2 + (0.008 * falta) ** 2 + 0.001 ** 2);
    const parcialL = rows.reduce((a, r) => a + r.l2, 0), parcialT = rows.reduce((a, r) => a + r.l2 + r.f2, 0);
    return {
        lula: 100 * central.lula, flavio: 100 * (1 - central.lula), sigma: 100 * sigma,
        intervalo: [100 * (central.lula - 1.645 * sigma), 100 * (central.lula + 1.645 * sigma)],
        probLula: normCdf((central.lula - 0.5) / sigma),
        apuradoPct: 100 * (1 - falta), parcialLula: parcialT ? 100 * parcialL / parcialT : null,
        swingNacionalLogit: central.swingNacional,
        ufs: Object.fromEntries(Object.entries(central.porUf).map(([uf, u]) => [uf, {
            lula: 100 * u.l / u.t, apuradoPct: 100 * u.ap / u.t, swingLogit: central.ufSwing[uf],
        }])),
    };
}
