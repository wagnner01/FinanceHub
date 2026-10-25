#!/usr/bin/env node
// sync-bu-exterior.mjs — soma os Boletins de Urna (BU) de todas as seções do exterior (UF "zz")
// e grava data/eleicoes/<ano>/bu/zz-t<turno>.json, agregado por cidade (o painel agrupa por país
// com data/eleicoes/exterior-paises.json). Auditoria independente da totalização oficial:
// a soma dos BUs tem de bater com o resultado divulgado. Executado pelo GitHub Actions.
//
// Uso: node scripts/eleicoes/sync-bu-exterior.mjs [--ano 2026] [--turno 1|2]  (padrão: turnos disponíveis)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { decodeBU } from '../../js/eleicoes/bu.js';

const args = process.argv.slice(2);
const ANO = args.includes('--ano') ? args[args.indexOf('--ano') + 1] : '2026';
const SO_TURNO = args.includes('--turno') ? args[args.indexOf('--turno') + 1] : null;
const BASE = 'https://resultados.tse.jus.br/oficial';
const CICLO = `ele${ANO}`;
const OUT = `data/eleicoes/${ANO}/bu`;
const UF = 'zz';
const PRESIDENTE = 1;
const p4 = s => String(s).padStart(4, '0');
const p6 = s => String(s).padStart(6, '0');
const UA = { 'User-Agent': 'FinanceHub-eleicoes-sync/1.0 (+github actions)' };

let requests = 0, failures = 0;
async function get(url, tipo = 'json', tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            requests++;
            const r = await fetch(url, { headers: UA });
            if (r.status === 404 || r.status === 403) return null;
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return tipo === 'json' ? await r.json() : new Uint8Array(await r.arrayBuffer());
        } catch (e) {
            if (i === tries - 1) { failures++; console.warn('falhou', url, e.message); return undefined; }
            await new Promise(res => setTimeout(res, 500 * 2 ** i));
        }
    }
}

async function pool(items, size, fn) {
    const q = [...items];
    await Promise.all(Array.from({ length: size }, async () => { while (q.length) await fn(q.shift()); }));
}

// Pleitos do ciclo: 1º turno e 2º turno (o do 2º turno só aparece no ele-c.json quando é criado)
const cfg = await get(`${BASE}/comum/config/ele-c.json`);
const pleitos = {};
for (const p of cfg?.pl || []) {
    if (p.c !== CICLO) continue;
    const fed = p.e.find(e => e.tp === '8');
    if (fed) pleitos[fed.t] = p.cd;
}
pleitos['1'] ??= '3220';
pleitos['2'] ??= '3221';
console.log('pleitos', JSON.stringify(pleitos));

for (const turno of SO_TURNO ? [SO_TURNO] : ['1', '2']) {
    const pleito = pleitos[turno];
    const cs = await get(`${BASE}/${CICLO}/arquivo-urna/${pleito}/config/${UF}/${UF}-p${p6(pleito)}-cs.json`);
    if (!cs) { console.log(`turno ${turno}: sem cadastro de seções (pleito ${pleito})`); continue; }

    const secoes = [];
    for (const m of cs.abr?.[0]?.mu || []) for (const z of m.zon || []) for (const s of z.sec || []) secoes.push({ mun: m.cd, zona: z.cd, secao: s.ns });

    const porMun = {};
    const total = { votos: {}, brancos: 0, nulos: 0, comparecimento: 0, aptos: 0 };
    const cont = { total: secoes.length, comBU: 0, semBU: 0, erro: 0 };
    const status = {};

    await pool(secoes, 24, async ({ mun, zona, secao }) => {
        const m = porMun[mun] ??= { votos: {}, brancos: 0, nulos: 0, comparecimento: 0, aptos: 0, secoes: 0, comBU: 0 };
        m.secoes++;
        const base = `${BASE}/${CICLO}/arquivo-urna/${pleito}/dados/${UF}/${mun}/${p4(zona)}/${p4(secao)}`;
        const aux = await get(`${base}/p${p6(pleito)}-${UF}-m${mun}-z${p4(zona)}-s${p4(secao)}-aux.json`);
        if (aux === undefined) { cont.erro++; return; }
        status[aux?.st || 'Sem arquivo'] = (status[aux?.st || 'Sem arquivo'] || 0) + 1;
        const h = (aux?.hashes || []).find(x => /totaliz/i.test(x.st || '')) || aux?.hashes?.[0];
        const arq = h?.arq?.find(a => a.tp === 'bu');
        if (!arq) { cont.semBU++; return; }
        const bin = await get(`${base}/${h.hash}/${arq.nm}`, 'bin');
        if (!bin) { cont.erro++; return; }
        let bu;
        try { bu = decodeBU(bin); } catch (e) { cont.erro++; console.warn('BU inválido', base, e.message); return; }
        for (const e of bu.eleicoes) for (const c of e.cargos) {
            if (c.cargo !== PRESIDENTE) continue;
            for (const alvo of [m, total]) {
                alvo.comparecimento += c.comparecimento; alvo.aptos += e.aptos;
                for (const v of c.votos) {
                    if (v.tipo === 1) alvo.votos[v.numero] = (alvo.votos[v.numero] || 0) + v.qtd;
                    else if (v.tipo === 2) alvo.brancos += v.qtd;
                    else if (v.tipo === 3 || v.tipo === 4) alvo.nulos += v.qtd; // legenda não existe para presidente
                }
            }
        }
        m.comBU++; cont.comBU++;
    });

    const out = { atualizado: new Date().toISOString(), ano: ANO, turno: Number(turno), pleito, secoes: cont, status, total, porMunicipio: porMun };
    await mkdir(OUT, { recursive: true });
    const path = `${OUT}/${UF}-t${turno}.json`;
    let prev = null;
    try { prev = JSON.parse(await readFile(path, 'utf8')); } catch { /* novo */ }
    // Só regrava se a contagem mudou (evita commit a cada execução só pelo carimbo de hora)
    if (!prev || JSON.stringify({ ...prev, atualizado: 0 }) !== JSON.stringify({ ...out, atualizado: 0 })) await writeFile(path, JSON.stringify(out));
    const vv = Object.values(total.votos).reduce((a, b) => a + b, 0);
    console.log(`turno ${turno}: ${cont.comBU}/${cont.total} BUs somados, ${cont.erro} erros; válidos ${vv}`,
        Object.entries(total.votos).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, q]) => `${n}=${(100 * q / vv).toFixed(2)}%`).join(' '));
}
console.log(`requisições: ${requests}, falhas: ${failures}`);
