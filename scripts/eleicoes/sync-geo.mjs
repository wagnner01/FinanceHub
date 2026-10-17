#!/usr/bin/env node
// sync-geo.mjs — baixa as malhas municipais do IBGE por UF para data/geo/ (fallback offline do mapa).
// Coordenadas arredondadas a 4 casas (~11 m) para reduzir o tamanho.
import { mkdir, writeFile, access } from 'node:fs/promises';

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const URL = uf => `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${uf}?formato=application/vnd.geo%2Bjson&qualidade=intermediaria&intrarregiao=municipio`;
const round = c => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e4) / 1e4, Math.round(c[1] * 1e4) / 1e4] : c.map(round));

await mkdir('data/geo', { recursive: true });
for (const uf of UFS) {
    const out = `data/geo/${uf.toLowerCase()}-mun.json`;
    try { await access(out); continue; } catch { /* baixar */ }
    const r = await fetch(URL(uf));
    if (!r.ok) { console.warn(uf, 'HTTP', r.status); continue; }
    const g = await r.json();
    for (const f of g.features) f.geometry.coordinates = round(f.geometry.coordinates);
    await writeFile(out, JSON.stringify(g));
    console.log(uf, g.features.length, 'municípios');
}
