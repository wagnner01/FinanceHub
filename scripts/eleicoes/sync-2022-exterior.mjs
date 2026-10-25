#!/usr/bin/env node
// sync-2022-exterior.mjs — Presidente 2022 (1º e 2º turno) no exterior, por cidade, a partir dos
// dados abertos do TSE (votação por seção, UF "ZZ"), para comparar com 2026. Roda uma vez.
// O workflow baixa e descompacta o .zip; este script lê o CSV (latin1, ";").
// Uso: node scripts/eleicoes/sync-2022-exterior.mjs <pasta-com-o-csv>
// Saída: data/eleicoes/2022/exterior.json  { t1: { total: { v, secoes }, cidades: { NOME: { v, secoes } } }, t2: {...} }
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';

const OUT = 'data/eleicoes/2022/exterior.json';
const PRESIDENTE = '1';
const dir = process.argv[2];

try { await readFile(OUT); console.log('2022 exterior: já existe'); process.exit(0); } catch { /* gerar */ }
if (!dir) { console.log('2022 exterior: sem pasta do CSV'); process.exit(0); }

const arqs = (await readdir(dir)).filter(f => /\.csv$/i.test(f));
if (!arqs.length) { console.log('2022 exterior: CSV não encontrado em', dir); process.exit(0); }
const texto = new TextDecoder('latin1').decode(await readFile(`${dir}/${arqs[0]}`));
const linhas = texto.split(/\r?\n/).filter(Boolean);
const campos = l => l.split(';').map(c => c.replace(/^"|"$/g, ''));
const cab = campos(linhas[0]);
const col = n => cab.indexOf(n);
const [iT, iC, iM, iZ, iS, iV, iQ] = ['NR_TURNO', 'CD_CARGO', 'NM_MUNICIPIO', 'NR_ZONA', 'NR_SECAO', 'NR_VOTAVEL', 'QT_VOTOS'].map(col);
if ([iT, iC, iM, iV, iQ].some(i => i < 0)) { console.log('2022 exterior: colunas inesperadas', cab.join(',')); process.exit(0); }

const res = {};
for (let k = 1; k < linhas.length; k++) {
    const c = campos(linhas[k]);
    if (c[iC] !== PRESIDENTE) continue;
    const t = `t${c[iT]}`, nm = c[iM].toUpperCase(), n = c[iV], q = Number(c[iQ]) || 0;
    const r = res[t] ??= { total: { v: {}, secoes: new Set() }, cidades: {} };
    const cid = r.cidades[nm] ??= { v: {}, secoes: new Set() };
    const sec = `${c[iZ]}/${c[iS]}`;
    for (const alvo of [r.total, cid]) { alvo.v[n] = (alvo.v[n] || 0) + q; alvo.secoes.add(`${nm}/${sec}`); }
}
for (const r of Object.values(res)) for (const o of [r.total, ...Object.values(r.cidades)]) o.secoes = o.secoes.size;
for (const [t, r] of Object.entries(res)) {
    const v = r.total.v, vv = (v['13'] || 0) + (v['22'] || 0);
    console.log(`2022 exterior ${t}: Lula ${v['13']} × Bolsonaro ${v['22']} (${(100 * v['13'] / vv).toFixed(2)}% no 2 a 2), ${Object.keys(r.cidades).length} cidades`);
}
await mkdir('data/eleicoes/2022', { recursive: true });
await writeFile(OUT, JSON.stringify(res));
