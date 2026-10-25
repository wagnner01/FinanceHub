#!/usr/bin/env node
// sync-projecao.mjs — durante a apuração: baixa o 2º turno de Presidente por município (parcial),
// projeta o resultado final (js/eleicoes/modelo-apuracao.js) e guarda o histórico das duas
// estimativas (modelo por município e amostra de boletins de urna) em data/eleicoes/<ano>/bu/projecao.json.
//
// Uso: node scripts/eleicoes/sync-projecao.mjs [--ano 2026]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { normalizeResult, compactForMap } from '../../js/eleicoes/normalize.js';
import { projetarApuracao, REGIAO } from '../../js/eleicoes/modelo-apuracao.js';

const args = process.argv.slice(2);
const ANO = args.includes('--ano') ? args[args.indexOf('--ano') + 1] : '2026';
const BASE = 'https://resultados.tse.jus.br/oficial';
const CICLO = `ele${ANO}`;
const DIR = `data/eleicoes/${ANO}`;
const UA = { 'User-Agent': 'FinanceHub-eleicoes-sync/1.0 (+github actions)' };
const p6 = s => String(s).padStart(6, '0');

let requests = 0, failures = 0;
async function getJSON(url, tries = 4) {
    for (let i = 0; i < tries; i++) {
        try {
            requests++;
            const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
            if (r.status === 404 || r.status === 403) return null;
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) {
            if (i === tries - 1) { failures++; return undefined; }
            await new Promise(res => setTimeout(res, 800 * 2 ** i + Math.random() * 400));
        }
    }
}
async function pool(items, size, fn) {
    const q = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (q.length) await fn(q.shift()); }));
}
const readJSON = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };

const cfg = await readJSON(`${DIR}/config.json`);
const ele2 = cfg?.eleicoes?.federal?.t2?.ele || '6258';
const ele1 = cfg?.eleicoes?.federal?.t1?.ele || '6257';
const muns = await readJSON(`${DIR}/municipios.json`);
const ufs = Object.keys(REGIAO);

// Base: 1º turno final por município
const base1 = {};
for (const uf of ufs) base1[uf] = (await readJSON(`${DIR}/${ele1}/mun/${uf}-c1.json`)) || {};

// Parcial do 2º turno por município (um arquivo por município; o que falhar reaproveita a anterior)
const prevMun = (await readJSON(`${DIR}/bu/mun-t2.json`))?.mun || {};
const parcial = {};
const jobs = [];
for (const uf of ufs) for (const m of muns?.[uf] || []) jobs.push({ uf, cd: m[0] });
await pool(jobs, 16, async ({ uf, cd }) => {
    const raw = await getJSON(`${BASE}/${CICLO}/${ele2}/dados/${uf}/${uf}${cd}-c0001-e${p6(ele2)}-u.json`);
    const r = raw ? normalizeResult(raw) : null;
    const v = r ? compactForMap(r) : prevMun[uf]?.[cd];
    if (v && v.pct > 0) (parcial[uf] ??= {})[cd] = v;
});

const agora = new Date().toISOString();
const modelo = projetarApuracao(base1, parcial);
const amostra = (await readJSON(`${DIR}/bu/amostra.json`))?.estimativa || null;
const br = normalizeResult(await getJSON(`${BASE}/${CICLO}/${ele2}/dados/br/br-c0001-e${p6(ele2)}-u.json`) || null);
const oficial = br ? {
    secoesPct: br.secoes?.pct, lula: br.candidatos.find(c => c.n === '13')?.pv, flavio: br.candidatos.find(c => c.n === '22')?.pv,
    atualizado: br.atualizado,
} : null;

await mkdir(`${DIR}/bu`, { recursive: true });
await writeFile(`${DIR}/bu/mun-t2.json`, JSON.stringify({ atualizado: agora, mun: parcial }));
const hist = (await readJSON(`${DIR}/bu/projecao.json`))?.historico || [];
const resumo = e => e && { lula: +e.lula.toFixed(3), sigma: +e.sigma.toFixed(3), probLula: +e.probLula.toFixed(4) };
if (modelo || amostra?.secoes) hist.push({
    t: agora, oficial,
    modelo: modelo && { ...resumo(modelo), apuradoPct: +modelo.apuradoPct.toFixed(2) },
    amostra: amostra && { ...resumo(amostra), cobertura: +amostra.cobertura.toFixed(1), secoes: amostra.secoes },
});
await writeFile(`${DIR}/bu/projecao.json`, JSON.stringify({ atualizado: agora, oficial, modelo, amostra, historico: hist }));

const f = x => x == null ? '—' : x.toFixed(2);
console.log(`oficial: ${f(oficial?.secoesPct)}% seções | Lula ${f(oficial?.lula)} × Flávio ${f(oficial?.flavio)}`);
if (modelo) console.log(`modelo por município: Lula ${f(modelo.lula)} ± ${f(1.645 * modelo.sigma)} | P(Lula) ${(100 * modelo.probLula).toFixed(0)}% | apurado ${f(modelo.apuradoPct)}%`);
else console.log('modelo por município: sem parcial do 2º turno ainda');
if (amostra) console.log(`amostra de BUs: Lula ${f(amostra.lula)} ± ${f(1.645 * amostra.sigma)} | cobertura ${f(amostra.cobertura)}%`);
console.log(`requisições: ${requests}, falhas: ${failures}`);
