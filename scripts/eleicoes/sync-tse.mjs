#!/usr/bin/env node
// sync-tse.mjs — baixa os resultados oficiais do TSE (Divulgação de Resultados) e grava
// snapshots normalizados em data/eleicoes/<ano>/. Executado pelo GitHub Actions.
//
// Uso: node scripts/eleicoes/sync-tse.mjs [--ano 2026] [--sem-municipios]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { normalizeResult, compactForMap, normalizeAbrangencia } from '../../js/eleicoes/normalize.js';

const args = process.argv.slice(2);
const ANO = args.includes('--ano') ? args[args.indexOf('--ano') + 1] : '2026';
const SEM_MUN = args.includes('--sem-municipios');
const BASE = 'https://resultados.tse.jus.br/oficial';
const OUT = `data/eleicoes/${ANO}`;
const UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to'];
const p6 = s => String(s).padStart(6, '0');

let requests = 0, failures = 0;
async function getJSON(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            requests++;
            const r = await fetch(url, { headers: { 'User-Agent': 'FinanceHub-eleicoes-sync/1.0 (+github actions)' } });
            if (r.status === 404) return null;
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) {
            if (i === tries - 1) { failures++; console.warn('falhou', url, e.message); return null; }
            await new Promise(res => setTimeout(res, 500 * 2 ** i));
        }
    }
}

async function pool(items, size, fn) {
    const q = [...items]; const out = [];
    await Promise.all(Array.from({ length: size }, async () => { while (q.length) { const it = q.shift(); out.push(await fn(it)); } }));
    return out;
}

async function save(path, data) {
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    const body = JSON.stringify(data);
    let prev = null;
    try { prev = await readFile(path, 'utf8'); } catch { /* novo arquivo */ }
    if (prev !== body) await writeFile(path, body);
}

// 1) Configuração: descobre os códigos de eleição/pleito do ciclo
const cfg = await getJSON(`${BASE}/comum/config/ele-c.json`);
if (!cfg) throw new Error('Não foi possível ler ele-c.json do TSE');
const ciclo = `ele${ANO}`;
const pleitos = cfg.pl.filter(p => p.c === ciclo && p.e.some(e => e.tp === '8' || e.tp === '1'));
if (!pleitos.length) throw new Error(`Ciclo ${ciclo} não encontrado`);
const eleicoes = {};
for (const p of pleitos) for (const e of p.e) {
    if (e.tp !== '8' && e.tp !== '1') continue;
    const tipo = e.tp === '8' ? 'federal' : 'estadual';
    eleicoes[tipo] ??= {};
    eleicoes[tipo][`t${e.t}`] = { ele: e.cd, pleito: p.cd, data: p.dt };
    if (e.cdt2 && !eleicoes[tipo].t2) eleicoes[tipo].t2 = { ele: e.cdt2, pleito: null, data: null };
}
console.log('eleições', JSON.stringify(eleicoes));

// 2) Municípios (código TSE ↔ IBGE, zonas)
const cm = await getJSON(`${BASE}/${ciclo}/${eleicoes.federal.t1.ele}/config/mun-e${p6(eleicoes.federal.t1.ele)}-cm.json`);
if (cm) {
    const mun = {};
    for (const a of cm.abr) mun[a.cd] = a.mu.map(m => [m.cd, m.cdi, m.nm, m.z, m.c === 's' ? 1 : 0]);
    await save(`${OUT}/municipios.json`, mun);
}

// 3) Resultados por abrangência (Brasil + UFs), todos os cargos, turnos disponíveis
const disponiveis = {};
for (const [tipo, turnos] of Object.entries(eleicoes)) {
    for (const [turno, info] of Object.entries(turnos)) {
        const ele = info.ele, ee = p6(ele);
        const cargos = tipo === 'federal' ? [1] : [3, 5, 6, 7, 8];
        const abrs = tipo === 'federal' ? ['br', ...UFS, 'zz'] : UFS;
        let any = false;
        const jobs = [];
        for (const c of cargos) for (const abr of abrs) {
            if (c === 8 && abr !== 'df') continue;
            if (c === 7 && abr === 'df') continue;
            if (turno === 't2' && c !== 1 && c !== 3) continue;
            jobs.push({ c, abr });
        }
        await pool(jobs, 12, async ({ c, abr }) => {
            const raw = await getJSON(`${BASE}/${ciclo}/${ele}/dados/${abr}/${abr}-c${String(c).padStart(4, '0')}-e${ee}-u.json`);
            const r = normalizeResult(raw);
            if (r) { any = true; await save(`${OUT}/${ele}/${abr}-c${c}.json`, r); }
        });
        if (any) {
            disponiveis[`${tipo}_${turno}`] = ele;
            for (const abr of tipo === 'federal' ? ['br', ...UFS] : UFS) {
                const ab = await getJSON(`${BASE}/${ciclo}/${ele}/dados/${abr}/${abr}-e${ee}-ab.json`);
                if (ab) await save(`${OUT}/${ele}/${abr}-ab.json`, normalizeAbrangencia(ab));
            }
        }
        // 4) Resultados por município (para o mapa): Presidente, Governador, Senador
        if (any && cm && !SEM_MUN) {
            const mapCargos = tipo === 'federal' ? [1] : (turno === 't2' ? [3] : [3, 5]);
            for (const c of mapCargos) {
                for (const uf of UFS) {
                    const muns = (cm.abr.find(a => a.cd === uf)?.mu || []);
                    const out = {};
                    await pool(muns, 16, async m => {
                        const raw = await getJSON(`${BASE}/${ciclo}/${ele}/dados/${uf}/${uf}${m.cd}-c${String(c).padStart(4, '0')}-e${ee}-u.json`);
                        const r = normalizeResult(raw);
                        if (r) out[m.cd] = compactForMap(r);
                    });
                    if (Object.keys(out).length) await save(`${OUT}/${ele}/mun/${uf}-c${c}.json`, out);
                }
                console.log(`municípios ${tipo} ${turno} cargo ${c} ok`);
            }
        }
    }
}

await save(`${OUT}/config.json`, { ciclo, eleicoes, disponiveis });
console.log(`requisições: ${requests}, falhas: ${failures}`);
if (failures > requests * 0.2) process.exit(1);
