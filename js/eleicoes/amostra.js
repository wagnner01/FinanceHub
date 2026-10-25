// amostra.js — estimativa do 2º turno a partir de uma amostra fixa de Boletins de Urna.
// Módulo puro (sem DOM): roda no GitHub Actions e pode ser usado pelo painel.
//
// Método (estimador de variação, "swing"):
//  1. Para cada seção da amostra com BU nos dois turnos: parcela de Lula no 2 a 2 em cada turno
//     s = Lula / (Lula + Flávio) e a variação d = s₂ − s₁.
//  2. Por UF: variação média ponderada pelos votos do 2º turno. A parcial chega fora de ordem
//     (capitais e Sudeste primeiro); comparar a mesma seção com ela mesma neutraliza a maior parte
//     desse viés, que é de nível (onde se vota) e não de variação.
//  3. UF sem seções suficientes usa a variação nacional da amostra (só seções do Brasil, se houver;
//     o exterior é outro eleitorado), com incerteza maior e correlacionada entre essas UFs.
//  4. Estimativa da UF = parcela oficial do 1º turno no 2 a 2 + variação; peso = votos válidos
//     do 1º turno × (válidos 2T / válidos 1T observados na amostra).
//  5. Incerteza: erro-padrão amostral por UF (agrupado por seção) + termo sistemático que
//     encolhe com a cobertura (seções que chegam cedo não são aleatórias).

export const LULA = '13', FLAVIO = '22';
const MIN_SECOES_UF = 5;

const dois = s => (s.v[LULA] || 0) + (s.v[FLAVIO] || 0);
const validos = s => Object.values(s.v).reduce((a, b) => a + b, 0);
const parcela = s => { const t = dois(s); return t ? (s.v[LULA] || 0) / t : null; };

/** Φ — CDF da normal padrão. */
function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
}

/** Média ponderada e erro-padrão (estimador de razão, seção como unidade). */
function mediaPonderada(xs) {
    const sw = xs.reduce((a, x) => a + x.w, 0);
    if (!sw) return null;
    const m = xs.reduce((a, x) => a + x.w * x.d, 0) / sw;
    const n = xs.length;
    const v = n > 1 ? xs.reduce((a, x) => a + (x.w * (x.d - m)) ** 2, 0) / sw ** 2 * n / (n - 1) : Infinity;
    return { m, se: Math.sqrt(v), n, sw };
}

/**
 * @param base  { uf: { lula, flavio, validos } } — resultado oficial do 1º turno por UF (inclui 'zz')
 * @param pares { uf: [{ t1, t2 }] } — BUs compactos ({ v: {numero: votos} }) da mesma seção nos dois turnos
 * @param amostrados { uf: nº de seções na amostra } — para a cobertura
 */
export function estimar(base, pares, amostrados = {}) {
    const porUf = {};
    const todos = [], doBrasil = [];
    let somaV1 = 0, somaV2 = 0;
    for (const [uf, ps] of Object.entries(pares)) {
        const xs = [];
        let v1 = 0, v2 = 0;
        for (const { t1, t2 } of ps) {
            const s1 = parcela(t1), s2 = parcela(t2);
            if (s1 == null || s2 == null) continue;
            xs.push({ d: s2 - s1, w: dois(t2) });
            v1 += validos(t1); v2 += validos(t2);
        }
        porUf[uf] = { xs, v1, v2 };
        todos.push(...xs); somaV1 += v1; somaV2 += v2;
        if (uf !== 'zz') doBrasil.push(...xs);
    }
    const nacional = mediaPonderada(doBrasil.length >= MIN_SECOES_UF ? doBrasil : todos);
    if (!nacional) return null;
    const razaoNac = somaV1 ? somaV2 / somaV1 : 1;
    // Dispersão entre UFs: incerteza de quem ainda não tem dados próprios
    const ufsComDados = Object.values(porUf).map(u => mediaPonderada(u.xs)).filter(r => r && r.n >= MIN_SECOES_UF);
    const dispersao = ufsComDados.length > 2
        ? Math.sqrt(ufsComDados.reduce((a, r) => a + (r.m - nacional.m) ** 2, 0) / (ufsComDados.length - 1))
        : 0.03;

    let totV = 0, totL = 0, secoesPar = 0, secoesAmostra = 0;
    const ufs = {};
    for (const [uf, b] of Object.entries(base)) {
        const u = porUf[uf] || { xs: [], v1: 0, v2: 0 };
        const r = mediaPonderada(u.xs);
        const proprio = r && r.n >= MIN_SECOES_UF;
        const swing = proprio ? r.m : nacional.m;
        const se = proprio ? r.se : Math.hypot(nacional.se, dispersao);
        const razao = proprio && u.v1 ? u.v2 / u.v1 : razaoNac;
        const s1 = b.lula / (b.lula + b.flavio);
        const lula = Math.min(1, Math.max(0, s1 + swing));
        const votos = b.validos * razao;
        ufs[uf] = { s1: 100 * s1, swing: 100 * swing, se: 100 * se, lula: 100 * lula, votos: Math.round(votos), secoes: u.xs.length, amostra: amostrados[uf] || 0, proprio: !!proprio };
        totV += votos; totL += votos * lula;
        secoesPar += u.xs.length; secoesAmostra += amostrados[uf] || 0;
    }
    // Erro amostral independente nas UFs com dados próprios; nas demais é o mesmo erro (a variação
    // nacional) repetido, então soma linearmente antes de elevar ao quadrado.
    let varIndep = 0, corr = 0;
    for (const u of Object.values(ufs)) {
        const e = u.votos / totV * u.se / 100;
        if (u.proprio) varIndep += e ** 2; else corr += e;
    }
    const var_ = varIndep + corr ** 2;
    const lula = totL / totV;
    const cobertura = secoesAmostra ? secoesPar / secoesAmostra : 0;
    const sistematico = Math.max(0.003, 0.01 * (1 - cobertura)); // 1 pp com amostra vazia, piso de 0,3 pp
    const sigma = Math.sqrt(var_ + sistematico ** 2);
    return {
        lula: 100 * lula, flavio: 100 * (1 - lula), sigma: 100 * sigma,
        intervalo: [100 * (lula - 1.645 * sigma), 100 * (lula + 1.645 * sigma)], // 90%
        probLula: normCdf((lula - 0.5) / sigma),
        swingNacional: 100 * nacional.m, secoes: secoesPar, amostra: secoesAmostra, cobertura: 100 * cobertura,
        validos2T: Math.round(totV), ufs,
    };
}

/** Calibração: a amostra reproduz o 1º turno oficial? (parcela de Lula no 2 a 2, por UF e nacional) */
export function calibrar(base, amostraT1) {
    const ufs = {};
    let totV = 0, totS = 0, totOf = 0;
    for (const [uf, b] of Object.entries(base)) {
        const ss = (amostraT1[uf] || []).filter(s => dois(s));
        if (!ss.length) continue;
        const l = ss.reduce((a, s) => a + (s.v[LULA] || 0), 0), t = ss.reduce((a, s) => a + dois(s), 0);
        const oficial = b.lula / (b.lula + b.flavio);
        ufs[uf] = { amostra: 100 * l / t, oficial: 100 * oficial, erro: 100 * (l / t - oficial), secoes: ss.length };
        totV += b.lula + b.flavio; totS += (b.lula + b.flavio) * l / t; totOf += b.lula;
    }
    const erros = Object.values(ufs).map(u => u.erro);
    return {
        nacional: { amostra: 100 * totS / totV, oficial: 100 * totOf / totV },
        erroMedioUf: erros.reduce((a, e) => a + Math.abs(e), 0) / (erros.length || 1),
        ufs,
    };
}
