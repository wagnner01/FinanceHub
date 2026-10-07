// parse-pesquisas.mjs — converte o wikitext das páginas de pesquisas em JSON estruturado.
import { clean, parseTables, section, num, parseDates, normInstituto, splitTop } from './wikitext.mjs';

function yearFromHeading(sectionText, offset) {
    const before = sectionText.slice(0, offset);
    const hs = [...before.matchAll(/^====\s*(\d{4})\s*====/gm)];
    return hs.length ? Number(hs[hs.length - 1][1]) : null;
}

/** Agregadores (primeira tabela da subseção "Agregação de pesquisas"). */
function parseAgregadores(sec, cols) {
    const agg = section(sec, 'Agregação de pesquisas', 4);
    const t = parseTables(agg)[0];
    if (!t) return [];
    return t.rows.map(r => {
        const c = r.cells.map(clean);
        const d = parseDates(c[1], 2026);
        const vals = r.cells.slice(2).map(num);
        return { agregador: c[0], data: d?.fim || null, ...cols(vals) };
    }).filter(a => a.agregador && a.data);
}

/** 2026: Lula × Flávio Bolsonaro. Colunas: instituto | datas | amostra | margem | Lula | Flávio | indecisos | vantagem */
export function parse2026(wikitext) {
    const sec = section(wikitext, 'Lula e Flávio Bolsonaro', 3);
    if (!sec) throw new Error('Seção "Lula e Flávio Bolsonaro" não encontrada');
    const polls = [], eventos = [];
    const tables = parseTables(sec).filter(t => t.start > sec.indexOf('==== 20'));
    for (const t of tables) {
        const year = yearFromHeading(sec, t.start) || 2026;
        for (const r of t.rows) {
            const c = r.cells;
            if (r.colspan) {
                const d = parseDates(c[0], year);
                const txt = clean(c[c.length - 1]);
                if (d && txt) eventos.push({ data: d.fim, texto: txt });
                continue;
            }
            if (c.length < 6) continue;
            const datas = parseDates(c[1], year);
            const lula = num(c[4]), flavio = num(c[5]);
            if (!datas || lula == null || flavio == null || lula + flavio > 101 || lula < 10 || flavio < 10) continue;
            polls.push({
                instituto: normInstituto(c[0]), contratante: clean(c[0]),
                inicio: datas.inicio, fim: datas.fim,
                amostra: num(c[2]), margem: num(c[3]),
                lula, flavio, outros: num(c[6]),
                validos: { lula: +(100 * lula / (lula + flavio)).toFixed(2), flavio: +(100 * flavio / (lula + flavio)).toFixed(2) },
            });
        }
    }
    const agregadores = parseAgregadores(sec, v => ({ lula: v[1], flavio: v[2], outros: v[3] }));
    return { polls: dedupe(polls), eventos, agregadores };
}

/** 2022: Bolsonaro × Lula. Valores no template {{Pesquisa eleitoral|cor|cor|Bolsonaro|Lula|outros}}. */
export function parse2022(wikitext) {
    const sec = section(wikitext, 'Bolsonaro x Lula', 3);
    if (!sec) throw new Error('Seção "Bolsonaro x Lula" não encontrada');
    const polls = [];
    const tables = parseTables(sec);
    for (const t of tables.slice(1)) {
        for (const r of t.rows) {
            const c = r.cells;
            const tpl = c.find(x => /\{\{\s*Pesquisa eleitoral/i.test(x));
            if (!tpl || c.length < 3) continue;
            const inner = tpl.replace(/^[\s\S]*?\{\{\s*Pesquisa eleitoral\s*/i, '').replace(/\}\}\s*$/, '');
            const args = splitTop(inner, '|').slice(1).map(a => a.trim());
            const nums = args.filter(a => /^[\d.,]+$/.test(a)).map(num);
            if (nums.length < 2) continue;
            const [bolsonaro, lula, outros] = nums.length >= 3 ? nums.slice(-3) : [...nums, null];
            const datas = parseDates(c[1], 2022);
            if (!datas || lula + bolsonaro > 101) continue;
            polls.push({
                instituto: normInstituto(c[0]), contratante: clean(c[0]),
                inicio: datas.inicio, fim: datas.fim, amostra: num(c[2]),
                lula, bolsonaro, outros,
                validos: { lula: +(100 * lula / (lula + bolsonaro)).toFixed(2), bolsonaro: +(100 * bolsonaro / (lula + bolsonaro)).toFixed(2) },
            });
        }
    }
    const agregadores = parseAgregadores(sec, v => ({ bolsonaro: v[0], lula: v[1], outros: v[2] }));
    return { polls: dedupe(polls), agregadores };
}

function dedupe(polls) {
    const seen = new Set();
    return polls.filter(p => {
        const k = [p.instituto, p.inicio, p.fim, p.lula, p.flavio ?? p.bolsonaro].join('|');
        if (seen.has(k)) return false;
        seen.add(k); return true;
    }).sort((a, b) => b.fim.localeCompare(a.fim));
}
