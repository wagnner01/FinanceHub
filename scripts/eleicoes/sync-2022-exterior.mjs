#!/usr/bin/env node
// sync-2022-exterior.mjs — resultado de Presidente 2022 (1º e 2º turno) no exterior, total e por
// cidade, para comparar com 2026. Roda uma vez (pula se o arquivo já existe).
// Saída: data/eleicoes/2022/exterior.json  { t1: { total, cidades: { nome: { v } } }, t2: {...} }
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const OUT = 'data/eleicoes/2022/exterior.json';
const BASE = 'https://resultados.tse.jus.br/oficial/ele2022';
const ELE = { t1: '544', t2: '545' };
const UA = { 'User-Agent': 'FinanceHub-eleicoes-sync/1.0 (+github actions)' };
const p6 = s => String(s).padStart(6, '0');

try { await readFile(OUT); console.log('2022 exterior: já existe'); process.exit(0); } catch { /* baixar */ }
// Teto de tempo: não pode atrasar a coleta da noite
setTimeout(() => { console.log('2022 exterior: tempo esgotado'); process.exit(0); }, 180000).unref();

async function getJSON(url) {
    for (let i = 0; i < 2; i++) {
        try {
            const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
            if (r.status === 404 || r.status === 403) return null;
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) { console.warn('falhou', url, e.message); await new Promise(res => setTimeout(res, 1000)); }
    }
    return null;
}
async function pool(items, size, fn) {
    const q = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (q.length) await fn(q.shift()); }));
}

// Extrai { número: votos } de qualquer formato de arquivo de resultado do TSE (2022 usa "vap")
function votos(raw) {
    const out = {};
    const walk = o => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (!o || typeof o !== 'object') return;
        if (o.n != null && (o.vap != null || o.v != null) && /^\d{2}$/.test(String(o.n))) {
            out[String(o.n)] = Number(String(o.vap ?? o.v).replace(/\D/g, '')) || 0;
            return;
        }
        Object.values(o).forEach(walk);
    };
    walk(raw);
    return Object.keys(out).length ? out : null;
}

const res = {};
for (const [t, ele] of Object.entries(ELE)) {
    const e6 = p6(ele);
    const urls = [
        `${BASE}/${ele}/dados-simplificados/zz/zz-c0001-e${e6}-r.json`,
        `${BASE}/${ele}/dados/zz/zz-c0001-e${e6}-v.json`,
        `${BASE}/${ele}/dados/zz/zz-c0001-e${e6}-u.json`,
    ];
    let total = null;
    for (const u of urls) { const raw = await getJSON(u); total = votos(raw); if (total) { console.log(t, 'total via', u); break; } }
    const cm = await getJSON(`${BASE}/${ele}/config/mun-e${e6}-cm.json`);
    const cidades = {};
    const lista = cm?.abr?.find(a => a.cd?.toLowerCase() === 'zz')?.mu || [];
    await pool(lista, 12, async m => {
        for (const suf of ['v', 'u']) {
            const raw = await getJSON(`${BASE}/${ele}/dados/zz/zz${m.cd}-c0001-e${e6}-${suf}.json`);
            const v = votos(raw);
            if (v) { cidades[m.nm] = { cd: m.cd, v }; return; }
        }
    });
    console.log(t, 'total', JSON.stringify(total), 'cidades', Object.keys(cidades).length, 'de', lista.length);
    res[t] = { total, cidades };
}
if (!res.t1.total && !res.t2.total) { console.log('2022 exterior: não encontrado'); process.exit(0); }
await mkdir('data/eleicoes/2022', { recursive: true });
await writeFile(OUT, JSON.stringify(res));
