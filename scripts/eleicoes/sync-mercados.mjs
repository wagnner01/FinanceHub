#!/usr/bin/env node
// sync-mercados.mjs — lê as probabilidades do Polymarket (API pública Gamma) para o 2º turno
// e atualiza data/score/sinais.json. Falhas não interrompem a coleta: o valor anterior permanece.
import { readFile, writeFile } from 'node:fs/promises';

const FILE = 'data/score/sinais.json';
const s = JSON.parse(await readFile(FILE, 'utf8'));
const pct = m => { try { return Number(JSON.parse(m.outcomePrices)[0]) * 100; } catch { return null; } };

async function buscar() {
    const urls = [
        'https://gamma-api.polymarket.com/public-search?q=Brazil%20presidential%20election&limit_per_type=20',
        'https://gamma-api.polymarket.com/events?closed=false&limit=100&tag_slug=brazil',
    ];
    for (const u of urls) {
        try {
            const r = await fetch(u, { headers: { 'User-Agent': 'FinanceHub/1.0' } });
            if (!r.ok) { console.warn(u, r.status); continue; }
            const j = await r.json();
            const events = Array.isArray(j) ? j : j.events || [];
            for (const e of events) {
                if (!/brazil/i.test(e.title || '') || !/presiden/i.test(e.title || '') || e.closed) continue;
                let fl = null, lu = null;
                for (const m of e.markets || []) {
                    const nome = `${m.groupItemTitle || ''} ${m.question || ''}`;
                    if (/fl[aá]vio/i.test(nome)) fl = pct(m);
                    else if (/lula/i.test(nome)) lu = pct(m);
                }
                if (fl != null && lu != null) return { evento: e.title, slug: e.slug, flavio: fl, lula: lu, volumeUSD: Number(e.volume) || null };
            }
        } catch (err) { console.warn(u, err.message); }
    }
    return null;
}

const r = await buscar();
if (!r) { console.log('Polymarket: mercado não encontrado; mantendo valor anterior'); process.exit(0); }
const soma = r.flavio + r.lula;
s.mercados.polymarket = {
    flavio: +(100 * r.flavio / soma).toFixed(1), lula: +(100 * r.lula / soma).toFixed(1), volumeUSD: r.volumeUSD,
    data: new Date().toISOString().slice(0, 10), fonte: `https://polymarket.com/event/${r.slug}`, automatico: true,
};
await writeFile(FILE, JSON.stringify(s, null, 1));
console.log('Polymarket atualizado:', r.evento, s.mercados.polymarket);
