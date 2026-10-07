// wikitext.mjs — utilitários para extrair tabelas de pesquisas do wikitext da Wikipedia.

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

/** Remove refs, comentários e templates de formatação, devolvendo texto plano. */
export function clean(raw) {
    let s = String(raw);
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
    s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
    s = s.replace(/\{\{\s*(?:fmtn|formatnum|nts|small|nowrap)\s*\|([^{}|]*)(?:\|[^{}]*)?\}\}/gi, '$1');
    s = s.replace(/\{\{\s*(?:N\/A|n\/a|NA)\s*\}\}/g, '');
    s = s.replace(/\{\{\s*left\s*\}\}/gi, '');
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
    s = s.replace(/\[https?:\/\/\S+\s*([^\]]*)\]/g, '$1');
    s = s.replace(/'''?/g, '');
    return s.replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Divide uma string pelo separador, ignorando ocorrências dentro de {{ }} e [[ ]]. */
export function splitTop(s, sep) {
    const out = []; let depth = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
        const two = s.slice(i, i + 2);
        if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
        if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
        if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
        cur += s[i];
    }
    out.push(cur);
    return out;
}

/** Remove o prefixo de atributos (style=...|) de uma célula. */
function stripAttrs(cell) {
    const parts = splitTop(cell, '|');
    if (parts.length > 1 && /^\s*(style|class|colspan|rowspan|align|bgcolor|width|data-sort-value)\s*=/i.test(parts[0])) return parts.slice(1).join('|');
    return cell;
}

/** Converte uma tabela wikitext em linhas: [{ cells: [raw...], colspan: bool }] (ignora cabeçalhos). */
export function parseTables(text) {
    const tables = [];
    const re = /\{\|[\s\S]*?\n\|\}/g;
    let m;
    while ((m = re.exec(text))) {
        const body = m[0];
        const rows = [];
        for (const chunk of body.split(/\n\|-[^\n]*/).slice(1)) {
            const lines = chunk.split('\n').filter(l => l.trim());
            if (!lines.length || lines.every(l => l.startsWith('!'))) continue;
            const cells = []; let colspan = false; let joined = [];
            // Reagrupa linhas de continuação (sem | inicial) na célula anterior
            for (const l of lines) {
                if (l.startsWith('|}')) continue;
                if (l.startsWith('|') || l.startsWith('!')) joined.push(l.slice(1)); else if (joined.length) joined[joined.length - 1] += ' ' + l;
            }
            for (const j of joined) for (const c of splitTop(j, '||')) {
                if (/colspan/i.test(c.split('|')[0] || '')) colspan = true;
                cells.push(stripAttrs(c));
            }
            rows.push({ cells, colspan });
        }
        tables.push({ start: m.index, rows });
    }
    return tables;
}

/** Recorta o texto de uma seção (pelo título) até o próximo título de nível igual ou superior. */
export function section(text, title, level) {
    const eq = '='.repeat(level);
    const re = new RegExp(`^${eq}\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*${eq}\\s*$`, 'm');
    const m = re.exec(text);
    if (!m) return '';
    const rest = text.slice(m.index + m[0].length);
    const next = new RegExp(`^={2,${level}}[^=]`, 'm').exec(rest);
    return next ? rest.slice(0, next.index) : rest;
}

/** Número em formato brasileiro ("45,2%", "4 006", "2.000") → Number | null. */
export function num(s) {
    if (s == null) return null;
    let t = clean(s).replace(/[%±+\s]/g, '');
    if (!t || !/\d/.test(t)) return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : null;
}

/** Interpreta "28 Set – 1 Out", "3 Out", "28 Jan - 02 Fev", "30–5 Out 2020" → { inicio, fim } ISO. */
export function parseDates(raw, fallbackYear) {
    const s = clean(raw).toLowerCase().replace(/[–—]/g, '-');
    const tokens = [...s.matchAll(/(\d{1,2})\s*(?:de\s*)?([a-zç]{3})?[a-zç]*\.?\s*(\d{4})?/g)].filter(t => t[1]);
    if (!tokens.length) return null;
    const last = tokens[tokens.length - 1];
    const year = Number(last[3] || tokens.find(t => t[3])?.[3] || fallbackYear);
    const endMonth = MESES[last[2]];
    if (!endMonth) return null;
    const fim = new Date(Date.UTC(year, endMonth - 1, Number(last[1])));
    let inicio = fim;
    if (tokens.length > 1) {
        const f = tokens[0];
        let mo = MESES[f[2]] || endMonth;
        let y = Number(f[3] || year);
        if (!MESES[f[2]] && Number(f[1]) > Number(last[1])) mo -= 1;
        if (mo > endMonth && !f[3]) y -= 1;
        if (mo < 1) { mo = 12; y -= 1; }
        inicio = new Date(Date.UTC(y, mo - 1, Number(f[1])));
    }
    const iso = d => d.toISOString().slice(0, 10);
    return { inicio: iso(inicio), fim: iso(fim) };
}

/** Normaliza o nome do instituto para permitir comparar 2022 × 2026. */
export function normInstituto(name) {
    const n = clean(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const map = [
        [/datafolha/, 'Datafolha'], [/quaest/, 'Quaest'], [/atlas/, 'AtlasIntel'], [/ipec/, 'Ipec'],
        [/poderdata/, 'PoderData'], [/parana pesquisas/, 'Paraná Pesquisas'], [/mda/, 'MDA'], [/ipespe/, 'Ipespe'],
        [/ideia/, 'Ideia'], [/futura/, 'Futura'], [/gerp/, 'Gerp'], [/vox/, 'Vox'], [/real time big data/, 'Real Time Big Data'],
        [/brasmarket/, 'Brasmarket'], [/verita/, 'Veritá'], [/modalmais/, 'Futura'], [/ibope/, 'Ipec'], [/fsb/, 'FSB'],
        [/paraná|parana/, 'Paraná Pesquisas'], [/palver/, 'Palver'], [/ifp/, 'IFP'], [/nexus/, 'Nexus'], [/gualimp/, 'Gualimp'],
        [/ipsos/, 'Ipsos-Ipec'], [/datatempo/, 'DataTempo'], [/abc ?dados/, 'ABC Dados'], [/badra/, 'Badra'], [/aya/, 'PoderData'], [/indexa/, 'Indexa'], [/alfa/, 'Alfa Inteligência'], [/vetor/, 'Vetor'], [/nexus/, 'Nexus'],
    ];
    for (const [re, v] of map) if (re.test(n)) return v;
    return clean(name).replace(/\s+/g, ' ');
}
