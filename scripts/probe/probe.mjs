// Sonda temporária 3: boletins de urna (bu.dat), fotos e padrões de arquivos por zona.
import { writeFile, mkdir } from 'node:fs/promises';
const OUT = 'probe';
await mkdir(OUT, { recursive: true });
const log = [];
async function get(url, name) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'FinanceHub-probe/1.0', Origin: 'https://example.github.io' } });
    const buf = Buffer.from(await r.arrayBuffer());
    log.push({ url, status: r.status, bytes: buf.length, acao: r.headers.get('access-control-allow-origin'), ct: r.headers.get('content-type') });
    console.log(r.status, buf.length, url);
    if (r.ok && name) await writeFile(`${OUT}/${name}`, buf);
    return r.ok ? buf : null;
  } catch (e) { log.push({ url, error: String(e) }); return null; }
}
const T = 'https://resultados.tse.jus.br/oficial/ele2026';
for (const uf of ['ac', 'df']) {
  const cs = JSON.parse(await get(`${T}/arquivo-urna/3220/config/${uf}/${uf}-p003220-cs.json`, `cs-${uf}.json`));
  const mu = cs.abr[0].mu[0]; const zon = mu.zon[0];
  for (const sec of zon.sec.slice(0, 2)) {
    const base = `${T}/arquivo-urna/3220/dados/${uf}/${mu.cd}/${zon.cd}/${sec.ns}`;
    const aux = JSON.parse(await get(`${base}/p003220-${uf}-m${mu.cd}-z${zon.cd}-s${sec.ns}-aux.json`, `aux-${uf}-${sec.ns}.json`));
    for (const h of aux.hashes) for (const a of h.arq) if (a.tp === 'bu') await get(`${base}/${h.hash}/${a.nm}`, a.nm);
  }
  // padrões por zona / municipais agregados
  for (const p of [`${uf}${mu.cd}z${zon.cd}-c0001-e006257-u.json`, `${uf}${mu.cd}-z${zon.cd}-c0001-e006257-u.json`, `${uf}z${zon.cd}-c0001-e006257-u.json`, `${uf}-c0001-e006257-m.json`, `${uf}-c0001-e006257-mu.json`, `${uf}-c0001-e006257-r.json`, `${uf}-c0001-e006257-v.json`]) await get(`${T}/6257/dados/${uf}/${p}`, null);
}
for (const p of ['br/280002551544.jpeg', 'br/280002551544.jpg', 'br/280002542548.jpeg']) await get(`${T}/6257/fotos/${p}`, null);
await get(`${T}/6258/config/mun-e006258-cm.json`, null);
await get(`${T}/6258/dados/br/br-c0001-e006258-u.json`, null);
await get(`https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`, 'ele-c.json');
// tempo para baixar todos os municípios de um UF médio (PB) — presidente
const t0 = Date.now();
const cm = JSON.parse(await get(`${T}/6257/config/mun-e006257-cm.json`, null));
const pb = cm.abr.find(a => a.cd === 'pb').mu;
let ok = 0;
const q = [...pb];
await Promise.all(Array.from({ length: 16 }, async () => { while (q.length) { const m = q.shift(); const r = await fetch(`${T}/6257/dados/pb/pb${m.cd}-c0001-e006257-u.json`); if (r.ok) { await r.arrayBuffer(); ok++; } } }));
console.log('PB', pb.length, 'ok', ok, 'ms', Date.now() - t0);
log.push({ pb: pb.length, ok, ms: Date.now() - t0 });
await writeFile(`${OUT}/_log.json`, JSON.stringify(log, null, 1));
