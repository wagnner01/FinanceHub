// Sonda temporária 2: estrutura dos arquivos TSE 2026.
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
    if (r.ok && name) await writeFile(`${OUT}/${name}`, buf.subarray(0, 4_000_000));
    return r.ok ? buf : null;
  } catch (e) { log.push({ url, error: String(e) }); return null; }
}
const T = 'https://resultados.tse.jus.br/oficial/ele2026';
const F = '6257', E = '6259';
const p6 = s => s.padStart(6, '0');
for (const [ele, cargos] of [[F, ['0001']], [E, ['0003', '0005', '0006', '0007', '0008']]]) {
  const ee = p6(ele);
  await get(`${T}/${ele}/config/mun-e${ee}-cm.json`, `mun-e${ee}-cm.json`);
  for (const c of cargos) {
    for (const abr of ['br', 'sp', 'df', 'ac']) {
      await get(`${T}/${ele}/dados-simplificados/${abr}/${abr}-c${c}-e${ee}-r.json`, `s-${abr}-c${c}-e${ele}-r.json`);
      await get(`${T}/${ele}/dados/${abr}/${abr}-c${c}-e${ee}-v.json`, `d-${abr}-c${c}-e${ele}-v.json`);
      await get(`${T}/${ele}/dados/${abr}/${abr}-c${c}-e${ee}-u.json`, `d-${abr}-c${c}-e${ele}-u.json`);
    }
    // município: Rio Branco/AC = 01392 ; São Paulo = 71072
    for (const [uf, mu] of [['ac', '01392'], ['sp', '71072']]) {
      await get(`${T}/${ele}/dados-simplificados/${uf}/${uf}${mu}-c${c}-e${ee}-r.json`, `s-${uf}${mu}-c${c}-e${ele}-r.json`);
      await get(`${T}/${ele}/dados/${uf}/${uf}${mu}-c${c}-e${ee}-v.json`, `d-${uf}${mu}-c${c}-e${ele}-v.json`);
      await get(`${T}/${ele}/dados/${uf}/${uf}${mu}-c${c}-e${ee}-u.json`, `d-${uf}${mu}-c${c}-e${ele}-u.json`);
    }
  }
  for (const uf of ['br', 'sp', 'ac']) {
    await get(`${T}/${ele}/dados/${uf}/${uf}-e${ee}-ab.json`, `ab-${uf}-e${ele}.json`);
    await get(`${T}/${ele}/dados/${uf}/${uf}-e${ee}-u.json`, `u-${uf}-e${ele}.json`);
    await get(`${T}/${ele}/dados/${uf}/${uf}-e${ee}-i.json`, `i-${uf}-e${ele}.json`);
    await get(`${T}/${ele}/dados/${uf}/${uf}-p003220-cs.json`, `cs2-${uf}-e${ele}.json`);
  }
}
// arquivo-urna
const csb = await get(`${T}/arquivo-urna/3220/config/ac/ac-p003220-cs.json`, 'au-ac-cs.json');
if (csb) {
  const cs = JSON.parse(csb);
  const s = JSON.stringify(cs);
  console.log(s.slice(0, 1500));
  const ab = (cs.abr || [])[0];
  const mu = ab?.mu?.[0]; const zon = mu?.zon?.[0]; const sec = zon?.sec?.[0];
  if (sec) {
    const base = `${T}/arquivo-urna/3220/dados/ac/${mu.cd}/${zon.cd}/${sec.ns}`;
    const auxb = await get(`${base}/p003220-ac-m${mu.cd}-z${zon.cd}-s${sec.ns}-aux.json`, 'au-aux.json');
    if (auxb) {
      const aux = JSON.parse(auxb);
      console.log(JSON.stringify(aux));
      for (const h of aux.hashes || []) for (const n of h.nmarq || []) await get(`${base}/${h.hash}/${n}`, 'au-file-' + n);
    }
  }
}
await get(`${T}/${F}/fotos/sp/`, null);
await writeFile(`${OUT}/_log.json`, JSON.stringify(log, null, 1));
