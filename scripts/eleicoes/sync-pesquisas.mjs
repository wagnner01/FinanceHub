#!/usr/bin/env node
// sync-pesquisas.mjs — coleta diariamente as pesquisas de 2º turno para presidente
// (registradas e compiladas na Wikipedia) e grava em data/pesquisas/.
//
// Uso: node scripts/eleicoes/sync-pesquisas.mjs [--arquivo wikitext.json] [--so-2022]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { parse2026, parse2022 } from './parse-pesquisas.mjs';
import { analisar } from '../../js/eleicoes/modelo.js';

const OUT = 'data/pesquisas';
const API = page => `https://pt.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext|revid&formatversion=2&page=${encodeURIComponent(page)}`;
const PAGINA_2026 = 'Pesquisas de opinião para a eleição presidencial no Brasil em 2026';
const PAGINA_2022 = 'Pesquisas de opinião para a eleição presidencial no Brasil em 2022';

async function wikitext(page, local) {
    if (local) return JSON.parse(await readFile(local, 'utf8')).parse;
    const r = await fetch(API(page), { headers: { 'User-Agent': 'FinanceHub-pesquisas/1.0 (github.com/wagnner01/FinanceHub)' } });
    if (!r.ok) throw new Error(`Wikipedia HTTP ${r.status}`);
    return (await r.json()).parse;
}

async function writeIfChanged(path, data, keyFields) {
    let prev = null;
    try { prev = JSON.parse(await readFile(path, 'utf8')); } catch { /* novo */ }
    const same = prev && JSON.stringify(keyFields(prev)) === JSON.stringify(keyFields(data));
    if (same) { console.log(path, 'sem mudanças'); return false; }
    await writeFile(path, JSON.stringify(data, null, 1));
    console.log(path, 'atualizado');
    return true;
}

const args = process.argv.slice(2);
const arg = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
await mkdir(OUT, { recursive: true });

if (!args.includes('--so-2022')) {
    const p = await wikitext(PAGINA_2026, arg('--arquivo'));
    const d = parse2026(p.wikitext);
    if (d.polls.length < 20) throw new Error(`Poucas pesquisas encontradas (${d.polls.length}) — estrutura da página mudou?`);
    // Mantém pesquisas já conhecidas que eventualmente sumam da página (edições de terceiros)
    let prev = null;
    try { prev = JSON.parse(await readFile(`${OUT}/presidente-2t-2026.json`, 'utf8')); } catch { /* novo */ }
    const key = x => [x.instituto, x.inicio, x.fim, x.lula, x.flavio].join('|');
    const seen = new Set(d.polls.map(key));
    for (const old of prev?.polls || []) if (!seen.has(key(old))) d.polls.push({ ...old, removidaDaFonte: true });
    d.polls.sort((a, b) => b.fim.localeCompare(a.fim));
    const data = {
        disputa: 'Lula (PT) × Flávio Bolsonaro (PL)', eleicao: '2026-10-25', primeiroTurno: '2026-10-04',
        fonte: `https://pt.wikipedia.org/wiki/${encodeURIComponent(PAGINA_2026.replace(/ /g, '_'))}`, revisao: p.revid,
        coletadoEm: new Date().toISOString(), ...d,
    };
    await writeIfChanged(`${OUT}/presidente-2t-2026.json`, data, x => [x.polls, x.agregadores, x.eventos]);
}

if (args.includes('--so-2022') || args.includes('--com-2022')) {
    const p = await wikitext(PAGINA_2022, arg('--arquivo-2022'));
    const d = parse2022(p.wikitext);
    const data = {
        disputa: 'Lula (PT) × Jair Bolsonaro (PL)', eleicao: '2022-10-30', primeiroTurno: '2022-10-02',
        fonte: `https://pt.wikipedia.org/wiki/${encodeURIComponent(PAGINA_2022.replace(/ /g, '_'))}`, revisao: p.revid,
        coletadoEm: new Date().toISOString(),
        resultado: {
            // Resultado oficial TSE — 2º turno de 30/10/2022 (votos válidos)
            segundoTurno: { lula: 50.90, bolsonaro: 49.10, votosLula: 60345999, votosBolsonaro: 58206354 },
            primeiroTurno: { lula: 48.43, bolsonaro: 43.20 },
        },
        ...d,
    };
    await writeIfChanged(`${OUT}/presidente-2t-2022.json`, data, x => [x.polls, x.agregadores]);
}

// Histórico diário da projeção (permite auditar o modelo depois da eleição)
try {
    const d26 = JSON.parse(await readFile(`${OUT}/presidente-2t-2026.json`, 'utf8'));
    const d22 = JSON.parse(await readFile(`${OUT}/presidente-2t-2022.json`, 'utf8'));
    const hoje = new Date().toISOString().slice(0, 10);
    const a = analisar(d26, d22, hoje > d26.eleicao ? d26.eleicao : hoje);
    let hist = [];
    try { hist = JSON.parse(await readFile(`${OUT}/projecoes.json`, 'utf8')); } catch { /* novo */ }
    const r = x => Math.round(x * 100) / 100;
    const entry = {
        dia: hoje, consolidadoLula: r(a.serie.at(-1)?.lula), projecaoLula: r(a.projecao.lula),
        intervalo90: a.projecao.intervalo.map(r), probLula: r(a.projecao.probLula * 100),
        projecaoAjustadaLula: r(a.projecaoAjustada.lula), pesquisas: a.serie.at(-1)?.n,
    };
    hist = hist.filter(h => h.dia !== hoje).concat(entry).sort((x, y) => x.dia.localeCompare(y.dia));
    await writeFile(`${OUT}/projecoes.json`, JSON.stringify(hist, null, 1));
    console.log('projeção do dia', entry);
} catch (e) { console.warn('projeção não calculada:', e.message); }
