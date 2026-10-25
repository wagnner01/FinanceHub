#!/usr/bin/env node
// sync-bu-amostra.mjs — amostra nacional de Boletins de Urna para estimar o 2º turno antes da
// totalização. Sorteia (uma vez, de forma reprodutível) seções estratificadas por UF, baixa o BU
// do 1º e do 2º turno de cada uma e grava data/eleicoes/<ano>/bu/amostra.json com a estimativa
// (js/eleicoes/amostra.js). O exterior entra com todas as seções (data/eleicoes/<ano>/bu/zz-t*.json).
//
// Uso: node scripts/eleicoes/sync-bu-amostra.mjs [--ano 2026] [--tamanho 2500]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { decodeBU } from '../../js/eleicoes/bu.js';
import { estimar, calibrar, LULA, FLAVIO } from '../../js/eleicoes/amostra.js';

const args = process.argv.slice(2);
const ANO = args.includes('--ano') ? args[args.indexOf('--ano') + 1] : '2026';
const TAMANHO = args.includes('--tamanho') ? Number(args[args.indexOf('--tamanho') + 1]) : 2500;
const MIN_UF = 40;
const BASE = 'https://resultados.tse.jus.br/oficial';
const CICLO = `ele${ANO}`;
const DIR = `data/eleicoes/${ANO}`;
const OUT = `${DIR}/bu/amostra.json`;
const UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to'];
const PRESIDENTE = 1;
const p4 = s => String(s).padStart(4, '0');
const p6 = s => String(s).padStart(6, '0');
const UA = { 'User-Agent': 'FinanceHub-eleicoes-sync/1.0 (+github actions)' };

let requests = 0, failures = 0;
const motivos = {};
async function get(url, tipo = 'json', tries = 5) {
    for (let i = 0; i < tries; i++) {
        try {
            requests++;
            const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
            if (r.status === 404 || r.status === 403) return null;
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return tipo === 'json' ? await r.json() : new Uint8Array(await r.arrayBuffer());
        } catch (e) {
            if (i === tries - 1) { failures++; motivos[e.message] = (motivos[e.message] || 0) + 1; return undefined; }
            await new Promise(res => setTimeout(res, 1000 * 2 ** i + Math.random() * 500));
        }
    }
}

async function pool(items, size, fn) {
    const q = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (q.length) await fn(q.shift()); }));
}

const readJSON = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };

// Hash FNV-1a: sorteio reprodutível (a mesma seção sempre cai na mesma posição)
function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

const cfg = await get(`${BASE}/comum/config/ele-c.json`);
const pleitos = {};
for (const p of cfg?.pl || []) if (p.c === CICLO) { const fed = p.e.find(e => e.tp === '8'); if (fed) pleitos[fed.t] = p.cd; }
pleitos['1'] ??= '3220';
pleitos['2'] ??= '3221';

const prev = await readJSON(OUT);

// 1) Amostra: sorteada uma vez a partir do cadastro de seções do 1º turno e reaproveitada depois
let secoes = prev?.amostra;
if (!secoes) {
    const cadastro = {};
    await pool(UFS, 4, async uf => {
        const cs = await get(`${BASE}/${CICLO}/arquivo-urna/${pleitos['1']}/config/${uf}/${uf}-p${p6(pleitos['1'])}-cs.json`);
        if (!cs) throw new Error(`sem cadastro de seções: ${uf}`);
        const ks = [];
        for (const m of cs.abr?.[0]?.mu || []) for (const z of m.zon || []) for (const s of z.sec || []) ks.push(`${m.cd}/${z.cd}/${s.ns}`);
        cadastro[uf] = ks;
    });
    const N = Object.values(cadastro).reduce((a, k) => a + k.length, 0);
    secoes = {};
    for (const uf of UFS) {
        const n = Math.max(MIN_UF, Math.round(TAMANHO * cadastro[uf].length / N));
        secoes[uf] = cadastro[uf].map(k => [fnv(`${uf}/${k}`), k]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
    }
    console.log('amostra sorteada:', Object.values(secoes).reduce((a, k) => a + k.length, 0), 'seções de', N);
}

// 2) BUs (1º turno uma vez; 2º turno até chegar). BU publicado não muda: guardado por seção.
const bus = { t1: { ...(prev?.bus?.t1 || {}) }, t2: { ...(prev?.bus?.t2 || {}) } };
const status = { t1: {}, t2: {} };
const jobs = [];
for (const [uf, ks] of Object.entries(secoes)) for (const k of ks) for (const t of ['1', '2']) if (!bus[`t${t}`][`${uf}/${k}`]) jobs.push({ uf, k, t });

await pool(jobs, 8, async ({ uf, k, t }) => {
    const [mun, zona, secao] = k.split('/');
    const pleito = pleitos[t];
    const base = `${BASE}/${CICLO}/arquivo-urna/${pleito}/dados/${uf}/${mun}/${p4(zona)}/${p4(secao)}`;
    const aux = await get(`${base}/p${p6(pleito)}-${uf}-m${mun}-z${p4(zona)}-s${p4(secao)}-aux.json`);
    const st = aux === undefined ? 'erro' : aux?.st || 'Sem arquivo';
    status[`t${t}`][st] = (status[`t${t}`][st] || 0) + 1;
    const h = (aux?.hashes || []).find(x => /totaliz/i.test(x.st || '')) || aux?.hashes?.[0];
    const arq = h?.arq?.find(a => a.tp === 'bu');
    if (!arq) return;
    const bin = await get(`${base}/${h.hash}/${arq.nm}`, 'bin');
    if (!bin) return;
    let bu;
    try { bu = decodeBU(bin); } catch (e) { console.warn('BU inválido', base, e.message); return; }
    const s = { v: {}, b: 0, n: 0, c: 0, a: 0 };
    let achou = false;
    for (const e of bu.eleicoes) for (const c of e.cargos) {
        if (c.cargo !== PRESIDENTE) continue;
        achou = true;
        s.c += c.comparecimento; s.a += e.aptos;
        for (const v of c.votos) {
            if (v.tipo === 1) s.v[v.numero] = (s.v[v.numero] || 0) + v.qtd;
            else if (v.tipo === 2) s.b += v.qtd;
            else if (v.tipo === 3 || v.tipo === 4) s.n += v.qtd;
        }
    }
    if (achou) bus[`t${t}`][`${uf}/${k}`] = s;
});

// 3) Estimativa
const base = {};
for (const uf of [...UFS, 'zz']) {
    const r = await readJSON(`${DIR}/6257/${uf}-c1.json`);
    if (!r) continue;
    const v = n => r.candidatos.find(c => c.n === n)?.v || 0;
    base[uf] = { lula: v(LULA), flavio: v(FLAVIO), validos: r.validos };
}
const pares = {}, amostraT1 = {}, amostrados = {};
for (const [uf, ks] of Object.entries(secoes)) {
    amostrados[uf] = ks.length;
    pares[uf] = []; amostraT1[uf] = [];
    for (const k of ks) {
        const a = bus.t1[`${uf}/${k}`], b = bus.t2[`${uf}/${k}`];
        if (a) amostraT1[uf].push(a);
        if (a && b) pares[uf].push({ t1: a, t2: b });
    }
}
// Exterior: censo de todas as seções (somador do exterior)
const zz1 = await readJSON(`${DIR}/bu/zz-t1.json`), zz2 = await readJSON(`${DIR}/bu/zz-t2.json`);
if (zz1?.bus) {
    const ks = Object.keys(zz1.bus);
    amostrados.zz = ks.length;
    pares.zz = ks.filter(k => zz2?.bus?.[k]).map(k => ({ t1: zz1.bus[k], t2: zz2.bus[k] }));
    amostraT1.zz = ks.map(k => zz1.bus[k]);
}

const estimativa = estimar(base, pares, amostrados);
const calibracao = calibrar(base, amostraT1);
const cont = {
    amostra: Object.values(secoes).reduce((a, k) => a + k.length, 0),
    comT1: Object.keys(bus.t1).length, comT2: Object.keys(bus.t2).length,
};
const out = { atualizado: new Date().toISOString(), ano: ANO, pleitos, secoes: cont, status, estimativa, calibracao, amostra: secoes, bus };
await mkdir(`${DIR}/bu`, { recursive: true });
if (!prev || JSON.stringify({ ...prev, atualizado: 0, status: 0 }) !== JSON.stringify({ ...out, atualizado: 0, status: 0 })) await writeFile(OUT, JSON.stringify(out));

console.log(`amostra ${cont.amostra} seções | BU 1T ${cont.comT1} | BU 2T ${cont.comT2}`);
console.log(`calibração 1T: amostra ${calibracao.nacional.amostra.toFixed(2)}% × oficial ${calibracao.nacional.oficial.toFixed(2)}% (Lula no 2 a 2), erro médio por UF ${calibracao.erroMedioUf.toFixed(2)} pp`);
if (estimativa) console.log(`estimativa 2T: Lula ${estimativa.lula.toFixed(2)}% ± ${(1.645 * estimativa.sigma).toFixed(2)} (90%), P(Lula) ${(100 * estimativa.probLula).toFixed(0)}%, variação ${estimativa.swingNacional.toFixed(2)} pp, ${estimativa.secoes} seções`);
else console.log('estimativa 2T: sem BUs do 2º turno na amostra ainda');
console.log(`requisições: ${requests}, falhas: ${failures}`, JSON.stringify(motivos), JSON.stringify(status));
