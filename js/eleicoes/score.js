// score.js — índice composto de chance de vitória no 2º turno (Lula × Flávio).
// Cada sinal vira uma probabilidade de vitória de Flávio; as probabilidades são combinadas
// pela média ponderada dos log-odds (forma padrão de juntar previsões independentes).
// Pesos refletem o poder preditivo histórico de cada tipo de sinal, não preferência.
import { normCdf } from './modelo.js';

const logit = p => Math.log(p / (1 - p));
const inv = x => 1 / (1 + Math.exp(-x));
const clamp = p => Math.min(0.97, Math.max(0.03, p));

export const PESOS = { pesquisas: 0.40, mercados: 0.20, estrutura: 0.20, opiniao: 0.10, momentum: 0.05, digital: 0.05 };

/**
 * @param analise resultado de modelo.analisar()
 * @param s       data/score/sinais.json
 * @returns { flavio, lula, componentes: [...] } — probabilidades em %
 */
export function calcularScore(analise, s) {
    const comp = [];

    // 1. Pesquisas: probabilidade do modelo de agregação (já inclui erro histórico de 2022)
    const pPesq = 1 - analise.projecao.probLula;
    comp.push({ id: 'pesquisas', nome: 'Pesquisas (agregador)', p: pPesq,
        leitura: `Projeção Flávio ${(100 - analise.projecao.lula).toFixed(1)}% dos válidos, σ ${analise.projecao.sigma.toFixed(1)} pp` });

    // 2. Mercados de previsão: média Polymarket/Kalshi ponderada por liquidez (Polymarket 2×)
    const m = s.mercados;
    const pMerc = ((m.polymarket?.flavio ?? 50) * 2 + (m.kalshi?.flavio ?? m.polymarket?.flavio ?? 50)) / 3 / 100;
    comp.push({ id: 'mercados', nome: 'Mercados de previsão', p: pMerc,
        leitura: `Polymarket ${m.polymarket?.flavio}% · Kalshi ${m.kalshi?.flavio}% Flávio` });

    // 3. Estrutura: 1º turno + transferência observada em 2022 + palanques estaduais
    const t = analise.transferencia;
    const g = s.estrutura.governadoresApoio;
    const bonusPalanque = 0.4 * (g.flavio - g.lula) / (g.flavio + g.lula); // até ±0,4 pp
    const pEstr = normCdf((t.flavio + bonusPalanque - 50) / 3.0);
    comp.push({ id: 'estrutura', nome: 'Estrutura (1º turno, transferência, palanques)', p: pEstr,
        leitura: `Transferência de 2022 → Flávio ${t.flavio.toFixed(1)}%; governadores ${g.flavio}×${g.lula}` });

    // 4. Opinião: aprovação do governo (referendo do incumbente) e rejeição relativa
    const ap = s.opiniao.aprovacaoGoverno;
    const rej = s.opiniao.rejeicao;
    const difRej = rej.reduce((a, r) => a + (r.lula - r.flavio), 0) / rej.length; // >0 = Lula mais rejeitado
    const saldoAprov = ap.aprova - ap.desaprova; // <0 desfavorece o incumbente
    const pOpin = normCdf((difRej * 0.5 - saldoAprov * 0.25) / 3);
    comp.push({ id: 'opiniao', nome: 'Aprovação e rejeição', p: pOpin,
        leitura: `Governo ${ap.aprova}% aprova × ${ap.desaprova}% desaprova; rejeição Lula−Flávio ${difRej >= 0 ? '+' : ''}${difRej.toFixed(1)} pp` });

    // 5. Momentum: tendência do agregador nos últimos 14 dias + saldo de fatos recentes
    const tend = analise.projecao.tendenciaDia * 7; // pp/semana para Lula
    const fatos = s.fatos.reduce((a, f) => a + (f.lado === 'flavio' ? 1 : -1) * (f.peso || 1), 0);
    const pMom = normCdf((-tend * 1.5 + fatos * 0.3) / 1.5);
    comp.push({ id: 'momentum', nome: 'Momento e fatos da campanha', p: pMom,
        leitura: `Tendência Lula ${tend >= 0 ? '+' : ''}${tend.toFixed(2)} pp/semana; saldo de fatos ${fatos >= 0 ? '+' : ''}${fatos} p/ Flávio` });

    // 6. Digital: popularidade digital (Quaest IPD). Sinal fraco e ruidoso → efeito pequeno.
    const ipd = s.digital.quaestIPD;
    const pDig = normCdf(((ipd.flavio - ipd.lula) / 10) / 1.5);
    comp.push({ id: 'digital', nome: 'Engajamento digital', p: pDig,
        leitura: `IPD Quaest Lula ${ipd.lula} × Flávio ${ipd.flavio}; Bites ${s.digital.bites.lulaInteracoesMi}M × ${s.digital.bites.flavioInteracoesMi}M interações` });

    let L = 0;
    for (const c of comp) { c.p = clamp(c.p); c.peso = PESOS[c.id]; c.contrib = c.peso * logit(c.p); L += c.contrib; }
    const flavio = inv(L);
    // Sensibilidade: o índice sem mercados (para quem desconfia de apostas)
    const semMerc = inv(comp.filter(c => c.id !== 'mercados').reduce((a, c) => a + c.peso * logit(c.p), 0) / (1 - PESOS.mercados));
    return { flavio: 100 * flavio, lula: 100 * (1 - flavio), semMercados: 100 * semMerc, componentes: comp };
}
