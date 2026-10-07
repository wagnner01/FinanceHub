// modelo.js — agregação de pesquisas, comparação com 2022 e projeção do 2º turno.
// Módulo puro (sem DOM): roda no navegador e no Node (projeção diária do GitHub Actions).
//
// Metodologia (resumo, exibido também na aba Pesquisas):
//  1. Cada pesquisa é convertida em votos válidos: Lula / (Lula + Flávio).
//  2. Consolidado do dia D = média ponderada das pesquisas com campo encerrado em [D-21, D]:
//       peso = √(amostra/1000, limitada a 5000) × 0,5^(idade/7 dias) × (1 se é a última do instituto, 0,35 se não)
//     → pesquisas recentes e grandes pesam mais; nenhum instituto domina por publicar mais.
//  3. Viés histórico ("house effect"): erro da última pesquisa de cada instituto em 2022
//     contra o resultado oficial (Lula 50,90%). O cenário "ajustado" desconta metade desse erro.
//  4. Projeção para o dia da eleição: consolidado atual + tendência dos últimos 14 dias (amortecida 50%).
//     Incerteza σ = √(erro histórico² + (0,15 × dias restantes)²), com erro histórico = RMS dos
//     institutos em 2022. Probabilidade = Φ((projeção − 50) / σ).

export const RESULTADO_2022 = { lula: 50.90, bolsonaro: 49.10, t1: { lula: 48.43, bolsonaro: 43.20 } };
export const ELEICAO_2022 = '2022-10-30';
export const PRIMEIRO_TURNO_2022 = '2022-10-02';
export const ELEICAO_2026 = '2026-10-25';
export const PRIMEIRO_TURNO_2026 = '2026-10-04';

const DAY = 86400000;
export const toDate = iso => new Date(iso + 'T12:00:00Z');
export const isoOf = d => new Date(d).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
export const addDays = (iso, n) => isoOf(toDate(iso).getTime() + n * DAY);

/** Lula em votos válidos (%) para uma pesquisa 2026 ou 2022. */
export const lulaValidos = p => 100 * p.lula / (p.lula + (p.flavio ?? p.bolsonaro));

/** Φ — CDF da normal padrão (aproximação de Abramowitz-Stegun). */
export function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
}

/** Peso de uma pesquisa no consolidado do dia `dia`. */
function peso(p, dia, ultimaDoInstituto) {
    const idade = Math.max(0, daysBetween(p.fim, dia));
    const n = Math.min(p.amostra || 1000, 5000);
    return Math.sqrt(n / 1000) * Math.pow(0.5, idade / 7) * (ultimaDoInstituto ? 1 : 0.35);
}

/**
 * Consolidado ponderado no dia `dia`.
 * @param polls pesquisas (2026 ou 2022)
 * @param ajuste mapa instituto → viés (pp em válidos de Lula) para descontar (opcional)
 */
export function consolidado(polls, dia, { janela = 21, ajuste = null, fator = 0.5 } = {}) {
    const elegiveis = polls.filter(p => p.fim <= dia && daysBetween(p.fim, dia) <= janela);
    if (!elegiveis.length) return null;
    const ultima = {};
    for (const p of elegiveis) if (!ultima[p.instituto] || p.fim > ultima[p.instituto].fim) ultima[p.instituto] = p;
    let sw = 0, sl = 0, slTot = 0, soTot = 0, sOut = 0;
    for (const p of elegiveis) {
        const w = peso(p, dia, ultima[p.instituto] === p);
        let lv = lulaValidos(p);
        if (ajuste && ajuste[p.instituto] != null) lv -= fator * ajuste[p.instituto];
        sw += w; sl += w * lv;
        slTot += w * p.lula; soTot += w * (p.flavio ?? p.bolsonaro); sOut += w * (p.outros ?? Math.max(0, 100 - p.lula - (p.flavio ?? p.bolsonaro)));
    }
    const lula = sl / sw;
    return {
        dia, lula, adversario: 100 - lula, n: elegiveis.length, institutos: Object.keys(ultima).length,
        totais: { lula: slTot / sw, adversario: soTot / sw, outros: sOut / sw },
    };
}

/** Série diária do consolidado entre `inicio` e `fim`. */
export function serie(polls, inicio, fim, opts) {
    const out = [];
    for (let d = inicio; d <= fim; d = addDays(d, 1)) {
        const c = consolidado(polls, d, opts);
        if (c) out.push(c);
    }
    return out;
}

/** Erro de cada instituto em 2022: última pesquisa (válidos de Lula) − resultado oficial. */
export function vies2022(polls2022, resultado = RESULTADO_2022.lula) {
    const ultima = {};
    for (const p of polls2022) {
        if (p.fim < PRIMEIRO_TURNO_2022 || p.fim > ELEICAO_2022) continue;
        if (!ultima[p.instituto] || p.fim > ultima[p.instituto].fim) ultima[p.instituto] = p;
    }
    const out = {};
    for (const [inst, p] of Object.entries(ultima)) out[inst] = { erro: lulaValidos(p) - resultado, pesquisa: p };
    return out;
}

/** RMS do erro dos institutos em 2022 — usado como incerteza mínima da projeção. */
export function erroHistorico(vies) {
    const e = Object.values(vies).map(v => v.erro);
    if (!e.length) return 2.5;
    return Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);
}

/** Pesquisa de 2022 do mesmo instituto no mesmo momento (dias antes da eleição), ±tolerância. */
export function mesmoMomento2022(p2026, polls2022, tolerancia = 6) {
    const d26 = daysBetween(p2026.fim, ELEICAO_2026);
    let best = null, bestDiff = Infinity;
    for (const q of polls2022) {
        if (q.instituto !== p2026.instituto) continue;
        const diff = Math.abs(daysBetween(q.fim, ELEICAO_2022) - d26);
        if (diff < bestDiff) { best = q; bestDiff = diff; }
    }
    return best && bestDiff <= tolerancia ? { pesquisa: best, diasAntes: daysBetween(best.fim, ELEICAO_2022), diff: bestDiff } : null;
}

/** Projeção para o dia da eleição a partir da série consolidada. */
export function projetar(serieDiaria, hoje, { eleicao = ELEICAO_2026, erroBase = 2.5 } = {}) {
    if (!serieDiaria.length) return null;
    const atual = serieDiaria[serieDiaria.length - 1];
    const recentes = serieDiaria.filter(s => daysBetween(s.dia, atual.dia) <= 14);
    // Regressão linear simples (lula ~ dia)
    let slope = 0;
    if (recentes.length >= 5) {
        const xs = recentes.map(s => daysBetween(recentes[0].dia, s.dia)), ys = recentes.map(s => s.lula);
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
        const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
        const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        slope = den ? num / den : 0;
    }
    const restantes = Math.max(0, daysBetween(hoje, eleicao));
    const deriva = Math.max(-3, Math.min(3, slope * restantes * 0.5));
    const lula = atual.lula + deriva;
    const sigma = Math.sqrt(erroBase ** 2 + (0.15 * restantes) ** 2);
    return {
        lula, adversario: 100 - lula, sigma, restantes, tendenciaDia: slope,
        intervalo: [lula - 1.645 * sigma, lula + 1.645 * sigma], // 90%
        probLula: normCdf((lula - 50) / sigma),
    };
}

/**
 * Cenário "transferência igual a 2022": aplica a mesma taxa de captura dos votos
 * não-finalistas do 1º turno que cada lado obteve em 2022.
 */
export function cenarioTransferencia(t1_2026) {
    const sobra22 = 100 - RESULTADO_2022.t1.lula - RESULTADO_2022.t1.bolsonaro;
    const capLula = (RESULTADO_2022.lula - RESULTADO_2022.t1.lula) / sobra22;
    const sobra26 = 100 - t1_2026.lula - t1_2026.flavio;
    const lula = t1_2026.lula + capLula * sobra26;
    return { lula, flavio: 100 - lula, capLula, capAdversario: 1 - capLula, sobra26 };
}

/** Pacote completo usado pela aba e pelo job diário. */
export function analisar(d26, d22, hoje, t1_2026 = { lula: 45.16, flavio: 47.03 }) {
    const polls = d26.polls;
    const vies = vies2022(d22.polls);
    const erroBase = erroHistorico(vies);
    const ajuste = Object.fromEntries(Object.entries(vies).map(([k, v]) => [k, v.erro]));
    const inicio = polls.length ? polls.map(p => p.fim).sort()[0] : hoje;
    const s = serie(polls, inicio, hoje);
    const sAj = serie(polls, inicio, hoje, { ajuste });
    const proj = projetar(s, hoje, { erroBase });
    const projAj = projetar(sAj, hoje, { erroBase });
    // 2022 alinhado pelo nº de dias até a eleição
    const s22 = serie(d22.polls, '2022-08-01', ELEICAO_2022).map(c => ({ ...c, diasAntes: daysBetween(c.dia, ELEICAO_2022) }));
    return { serie: s, serieAjustada: sAj, projecao: proj, projecaoAjustada: projAj, vies, erroBase, serie2022: s22, transferencia: cenarioTransferencia(t1_2026) };
}
