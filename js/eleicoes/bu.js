// bu.js — decodificador do Boletim de Urna (arquivo "-bu.dat", ASN.1 BER do TSE).
// O arquivo é um EntidadeEnvelopeGenerico cujo último campo (OCTET STRING) contém o
// EntidadeBoletimUrna. Navegamos pela estrutura de forma tolerante (posicional),
// para não depender de pequenas mudanças de versão do esquema.

function readTLV(buf, off) {
    const t0 = buf[off]; let p = off + 1; let tag = t0 & 0x1f;
    if (tag === 0x1f) { tag = 0; while (buf[p] & 0x80) tag = (tag << 7) | (buf[p++] & 0x7f); tag = (tag << 7) | buf[p++]; }
    let len = buf[p++];
    if (len & 0x80) { const k = len & 0x7f; len = 0; for (let i = 0; i < k; i++) len = len * 256 + buf[p++]; }
    return { cls: t0 >> 6, cons: !!(t0 & 0x20), tag, start: p, end: p + len, len };
}

function tree(buf, off = 0, end = buf.length) {
    const out = [];
    while (off < end) {
        const t = readTLV(buf, off);
        if (t.end > end || t.len < 0) break;
        const node = { cls: t.cls, tag: t.tag, cons: t.cons };
        if (t.cons) node.kids = tree(buf, t.start, t.end);
        else node.bytes = buf.subarray(t.start, t.end);
        out.push(node);
        off = t.end;
    }
    return out;
}

const int = node => { let x = 0; for (const b of node?.bytes || []) x = x * 256 + b; return x; };
const isSeq = node => node && node.cons && node.cls === 0 && node.tag === 16;
const isInt = node => node && !node.cons && node.cls === 0 && (node.tag === 2 || node.tag === 10);

/** Decodifica um ArrayBuffer/Uint8Array de "-bu.dat". */
export function decodeBU(input) {
    let buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    let root = tree(buf)[0];
    // Envelope genérico → conteúdo (OCTET STRING contendo outro SEQUENCE)
    const last = root?.kids?.[root.kids.length - 1];
    if (last && !last.cons && last.tag === 4 && last.bytes[0] === 0x30) root = tree(last.bytes)[0];
    if (!isSeq(root)) throw new Error('Boletim de urna inválido');

    // Identificação da seção: SEQUENCE { SEQUENCE { municipio, zona }, local, secao }
    let ident = null;
    for (const k of root.kids) {
        if (isSeq(k) && isSeq(k.kids?.[0]) && k.kids[0].kids?.length === 2 && k.kids.length === 3 && isInt(k.kids[1])) {
            ident = { municipio: int(k.kids[0].kids[0]), zona: int(k.kids[0].kids[1]), local: int(k.kids[1]), secao: int(k.kids[2]) };
            break;
        }
    }

    // Resultados: SEQUENCE OF { idEleicao, aptos, ..., SEQUENCE OF ResultadoVotacao }
    const eleicoes = [];
    const resSeq = root.kids.find(k => isSeq(k) && k.kids?.length && k.kids.every(e => isSeq(e) && isInt(e.kids?.[0]) && e.kids.some(isSeq)));
    for (const e of resSeq?.kids || []) {
        const nums = e.kids.filter(isInt).map(int);
        const rvs = e.kids.find(isSeq)?.kids || [];
        const cargos = [];
        for (const rv of rvs) {
            if (!isSeq(rv)) continue;
            const comparecimento = int(rv.kids.filter(isInt)[1]);
            const totais = rv.kids.find(isSeq)?.kids || [];
            for (const tc of totais) {
                const [codigo, , votaveis] = [tc.kids[0], tc.kids[1], tc.kids.find(isSeq)];
                const cargo = codigo.cons ? int(codigo.kids[0]) : int(codigo);
                const votos = [];
                for (const vv of votaveis?.kids || []) {
                    const tipo = int(vv.kids[0]);
                    const qtd = int(vv.kids[1]);
                    const idv = vv.kids.find(k => k.cons && k.cls === 2);
                    votos.push({ tipo, qtd, partido: idv ? int(idv.kids[0]) : null, numero: idv ? int(idv.kids[1]) : null });
                }
                cargos.push({ cargo, comparecimento, votos });
            }
        }
        eleicoes.push({ id: nums[0], aptos: nums[1], cargos });
    }
    return { ...ident, eleicoes };
}

/** Tipos de voto (TipoVoto no esquema do TSE). */
export const TIPO_VOTO = { 1: 'nominal', 2: 'branco', 3: 'nulo', 4: 'legenda', 5: 'cargoSemCandidato' };
