// Sonda temporária: descobre a estrutura real dos endpoints do TSE/Wikipedia/IBGE.
import { writeFile, mkdir } from 'node:fs/promises';
const OUT = 'probe';
await mkdir(OUT, { recursive: true });
const log = [];
async function get(url, name, { save = true, maxSave = 3_000_000 } = {}) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'FinanceHub-probe/1.0 (github action)', Origin: 'https://example.github.io' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const h = Object.fromEntries([...r.headers].filter(([k]) => /access-control|content-type|last-modified|cache|etag/i.test(k)));
    log.push({ url, status: r.status, bytes: buf.length, headers: h });
    console.log(r.status, buf.length, url, JSON.stringify(h));
    if (save && r.ok && name) await writeFile(`${OUT}/${name}`, buf.length > maxSave ? buf.subarray(0, maxSave) : buf);
    return r.ok ? buf : null;
  } catch (e) { log.push({ url, error: String(e) }); console.log('ERR', url, e.message); return null; }
}
const T = 'https://resultados.tse.jus.br/oficial';
const cfgBuf = await get(`${T}/comum/config/ele-c.json`, 'ele-c.json');
let elections = [];
if (cfgBuf) {
  const cfg = JSON.parse(cfgBuf);
  const ciclo = (cfg.c ? [cfg] : cfg.ciclos || []).concat(cfg.c || []);
  console.log(JSON.stringify(cfg).slice(0, 3000));
  const s = JSON.stringify(cfg);
  elections = [...new Set([...s.matchAll(/"cd":"?(\d{3,6})"?/g)].map(m => m[1]))];
}
console.log('elections', elections);
const cycles = ['ele2026', 'ele2022'];
for (const cyc of cycles) {
  for (const e of elections.slice(0, 20)) {
    const ee = e.padStart(6, '0');
    for (const c of ['0001', '0003', '0005', '0006', '0007']) {
      for (const abr of ['br', 'sp']) {
        await get(`${T}/${cyc}/${Number(e)}/dados-simplificados/${abr}/${abr}-c${c}-e${ee}-r.json`, `${cyc}-${e}-${abr}-c${c}-r.json`);
      }
    }
    await get(`${T}/${cyc}/${Number(e)}/config/mun-e${ee}-cm.json`, `${cyc}-${e}-mun-cm.json`);
    await get(`${T}/${cyc}/${Number(e)}/dados/sp/sp71072-c0001-e${ee}-v.json`, `${cyc}-${e}-sp71072-c0001-v.json`);
    await get(`${T}/${cyc}/${Number(e)}/dados/sp/sp71072-c0001-e${ee}-u.json`, `${cyc}-${e}-sp71072-c0001-u.json`);
    await get(`${T}/${cyc}/${Number(e)}/dados-simplificados/sp/sp71072-c0001-e${ee}-r.json`, `${cyc}-${e}-sp71072-c0001-r.json`);
    await get(`${T}/${cyc}/${Number(e)}/dados/sp/sp-c0001-e${ee}-v.json`, `${cyc}-${e}-sp-c0001-v.json`);
  }
}
// arquivo-urna (seções)
for (const cyc of cycles) for (const p of ['406', '407', '527', '528', '529', '530', '600', '601', '602', '603']) {
  const pp = p.padStart(6, '0');
  await get(`${T}/${cyc}/arquivo-urna/${p}/config/ac/ac-p${pp}-cs.json`, `${cyc}-au-${p}-ac-cs.json`);
}
// Wikipedia wikitext
const W = (lang, page) => `https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&formatversion=2&page=${encodeURIComponent(page)}`;
await get(W('pt', 'Pesquisas de opinião para a eleição presidencial no Brasil em 2026'), 'wiki-pt-pesquisas-2026.json');
await get(W('en', 'Opinion polling for the 2026 Brazilian presidential election'), 'wiki-en-polls-2026.json');
await get(W('pt', 'Pesquisas de opinião para a eleição presidencial no Brasil em 2022'), 'wiki-pt-pesquisas-2022.json');
await get(W('en', 'Opinion polling for the 2022 Brazilian presidential election'), 'wiki-en-polls-2022.json');
await get(W('pt', 'Eleição presidencial no Brasil em 2026'), 'wiki-pt-eleicao-2026.json');
await get(W('en', '2026 Brazilian general election'), 'wiki-en-general-2026.json');
// IBGE malhas
await get('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF', 'ibge-br-uf.json');
await get('https://servicodados.ibge.gov.br/api/v3/malhas/estados/AC?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio', 'ibge-ac-mun.json');
await get('https://servicodados.ibge.gov.br/api/v1/localidades/estados/AC/municipios', 'ibge-ac-mun-names.json');
await writeFile(`${OUT}/_log.json`, JSON.stringify(log, null, 1));
