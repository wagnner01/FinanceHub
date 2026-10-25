#!/usr/bin/env node
// sync-2022-curva.mjs — reconstrói a apuração do 2º turno de 2022 minuto a minuto e testa o modelo
// de projeção (js/eleicoes/modelo-apuracao.js) com dados reais.
//  • Boletins de urna de 2022 (dados abertos do TSE, "bweb_2t_<UF>"): votos de Presidente por seção e
//    DT_BU_RECEBIDO (hora em que o BU chegou ao TSE) → ordem real de chegada.
//  • Base do modelo: 1º turno de 2022 por município (votacao_candidato_munzona_2022).
// Saída: data/eleicoes/2022/curva-2t.json  { pontos: [{ hora, secoesPct, votosPct, parcial, modelo }], final, ... }
// Uso: node scripts/eleicoes/sync-2022-curva.mjs   (requer curl e unzip; roda no GitHub Actions)
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { projetarApuracao } from '../../js/eleicoes/modelo-apuracao.js';

const OUT = 'data/eleicoes/2022/curva-2t.json';
const CKAN = 'https://dadosabertos.tse.jus.br/api/3/action';
const ODS = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const UFS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mt', 'ms', 'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'sp', 'se', 'to', 'zz'];
const TMP = '/tmp/curva2022';

try { await readFile(OUT); console.log('curva 2022: já existe'); process.exit(0); } catch { /* gerar */ }
await mkdir(TMP, { recursive: true });

const baixar = (url, dest) => execFileSync('curl', ['-sSfL', '--retry', '3', '--max-time', '900', '-o', dest, url], { stdio: 'inherit' });

/** Lê as linhas de um CSV dentro de um .zip (latin1, ";"), chamando fn(campos, cabeçalho). */
async function lerZip(zip, padrao, fn) {
    const p = spawn('bash', ['-c', `unzip -p '${zip}' ${padrao}`]);
    p.stdout.setEncoding('latin1');
    const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
    let cab = null;
    for await (const l of rl) {
        const c = l.split(';').map(x => x.replace(/^"|"$/g, ''));
        if (!cab) { cab = Object.fromEntries(c.map((n, i) => [n, i])); continue; }
        if (c.length < 5 || c[0] === 'DT_GERACAO') continue; // cabeçalho repetido de outro CSV
        fn(c, cab);
    }
}

// 1) Recursos dos boletins de urna de 2022 (descoberta pelo catálogo; nomes de arquivo têm carimbo de hora)
async function recursos() {
    const urls = new Set();
    for (const q of ['boletim de urna 2022', 'resultados 2022 boletim de urna']) {
        try {
            const r = await fetch(`${CKAN}/package_search?q=${encodeURIComponent(q)}&rows=50`, { signal: AbortSignal.timeout(30000) });
            const j = await r.json();
            for (const p of j.result?.results || []) for (const res of p.resources || []) if (/bweb_2t_/i.test(res.url || '')) urls.add(res.url);
        } catch (e) { console.warn('catálogo', q, e.message); }
    }
    return [...urls];
}
const urls = await recursos();
console.log('BUs 2º turno 2022 encontrados:', urls.length, urls.slice(0, 3).join(' '));
if (!urls.length) { console.log('curva 2022: boletins não encontrados no catálogo'); process.exit(0); }

// 2) Base: 1º turno 2022 por município
const munzona = `${TMP}/munzona.zip`;
baixar(`${ODS}/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip`, munzona);
const base1 = {};
await lerZip(munzona, "'*BRASIL*.csv'", (c, h) => {
    if (c[h.CD_CARGO] !== '1') return;
    const n = c[h.NR_CANDIDATO] ?? c[h.NR_VOTAVEL];
    if (n !== '13' && n !== '22') return;
    if (c[h.NR_TURNO] !== '1') return;
    const alvo = base1;
    const uf = c[h.SG_UF].toLowerCase(), cd = c[h.CD_MUNICIPIO];
    const q = Number(c[h.QT_VOTOS_NOMINAIS_VALIDOS] ?? c[h.QT_VOTOS_NOMINAIS] ?? c[h.QT_VOTOS]) || 0;
    const m = ((alvo[uf] ??= {})[cd] ??= { v: {} });
    m.v[n] = (m.v[n] || 0) + q;
});
await rm(munzona);
console.log('base 1º turno 2022:', Object.values(base1).reduce((a, m) => a + Object.keys(m).length, 0), 'municípios');

// 3) Boletins do 2º turno: votos de Presidente e hora de recebimento por seção
const secoes = new Map(); // chave → { uf, mun, t, l, f }
for (const url of urls) {
    const zip = `${TMP}/bweb.zip`;
    try { baixar(url, zip); } catch { console.warn('falhou', url); continue; }
    let n = 0;
    await lerZip(zip, "'*.csv'", (c, h) => {
        if (n++ === 0 && !('DT_BU_RECEBIDO' in h)) console.log('colunas', Object.keys(h).join(','));
        if (!/presidente/i.test(c[h.DS_CARGO_PERGUNTA] || '')) return;
        const uf = c[h.SG_UF].toLowerCase(), mun = c[h.CD_MUNICIPIO];
        const k = `${uf}/${mun}/${c[h.NR_ZONA]}/${c[h.NR_SECAO]}`;
        const s = secoes.get(k) || { uf, mun, t: c[h.DT_BU_RECEBIDO], l: 0, f: 0 };
        const nv = c[h.NR_VOTAVEL], q = Number(c[h.QT_VOTOS]) || 0;
        if (nv === '13') s.l += q; else if (nv === '22') s.f += q;
        secoes.set(k, s);
    });
    await rm(zip);
    console.log(url.split('/').pop(), '→ seções acumuladas', secoes.size);
}

// 4) Ordem de chegada e pontos de controle
const hora = t => { const m = /(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(t || ''); return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00` : null; };
const lista = [...secoes.values()].map(s => ({ ...s, ts: hora(s.t) })).filter(s => s.ts).sort((a, b) => a.ts < b.ts ? -1 : 1);
const totalSec = lista.length;
const totalVotos = lista.reduce((a, s) => a + s.l + s.f, 0);
const totalSecMun = {};
for (const s of lista) totalSecMun[`${s.uf}/${s.mun}`] = (totalSecMun[`${s.uf}/${s.mun}`] || 0) + 1;
const alvos = [0.5, 1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 67, 70, 80, 90, 95, 99, 100];
const pontos = [];
const parcial = {}, contSec = {};
let L = 0, F = 0, i = 0;
for (const alvo of alvos) {
    while (i < lista.length && 100 * (i + 1) / totalSec <= alvo) {
        const s = lista[i++];
        const m = ((parcial[s.uf] ??= {})[s.mun] ??= { v: { 13: 0, 22: 0 }, pct: 0 });
        m.v[13] += s.l; m.v[22] += s.f; L += s.l; F += s.f;
        const k = `${s.uf}/${s.mun}`; contSec[k] = (contSec[k] || 0) + 1;
        m.pct = 100 * contSec[k] / totalSecMun[k];
    }
    const ult = lista[i - 1];
    const e = projetarApuracao(base1, parcial, { reamostras: 80 });
    pontos.push({
        hora: ult?.ts, secoesPct: +(100 * i / totalSec).toFixed(2), votosPct: +(100 * (L + F) / totalVotos).toFixed(2),
        parcial: +(100 * L / (L + F)).toFixed(3),
        modelo: e && { lula: +e.lula.toFixed(3), sigma: +e.sigma.toFixed(3), probLula: +e.probLula.toFixed(4) },
    });
    console.log(`${ult?.ts?.slice(11, 16)} ${(100 * i / totalSec).toFixed(1)}% seções | parcial Lula ${(100 * L / (L + F)).toFixed(2)} | modelo ${e?.lula.toFixed(2)} ± ${(1.645 * e?.sigma).toFixed(2)}`);
}
// Também por horário (a cada 10 min das 17h às 20h): % apurado e parcial
const porHora = [];
{
    let a = 0, l = 0, f = 0;
    for (let min = 0; min <= 180; min += 10) {
        const lim = new Date(Date.parse('2022-10-30T17:00:00-03:00') + min * 60000).toISOString();
        while (a < lista.length && Date.parse(lista[a].ts) <= Date.parse(lim)) { l += lista[a].l; f += lista[a].f; a++; }
        porHora.push({ hora: `${String(17 + Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, secoesPct: +(100 * a / totalSec).toFixed(2), parcial: l + f ? +(100 * l / (l + f)).toFixed(3) : null });
    }
}
const out = {
    fonte: 'TSE, dados abertos: boletins de urna do 2º turno de 2022 (DT_BU_RECEBIDO) e votação por município/zona',
    nota: 'Hora de recebimento do BU no TSE (a divulgação ocorre minutos depois). Modelo: base 1º turno 2022 por município.',
    final: { lula: +(100 * L / (L + F)).toFixed(3), secoes: totalSec },
    pontos, porHora,
};
await mkdir('data/eleicoes/2022', { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log('final 2022 (BUs):', out.final);
