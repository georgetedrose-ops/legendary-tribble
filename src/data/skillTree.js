// Evolution skill tree. Spend DNA to buy nodes; each node adds to your disease
// stats via additive `effects` (dotted keys address nested stats, e.g.
// "vectors.air"). `req` lists prerequisite node ids. Branches give the tree its
// shape: TRANSMISSION (spread), SYMPTOMS (lethality + DNA income, but raise
// attention), RESILIENCE (survive climates and resist the cure).
//
// Tier roughly tracks cost/power and drives the visual layout (column = branch,
// row = tier).

export const SKILL_NODES = [
  // ── TRANSMISSION ──
  { id: 't_air1', branch: 'transmission', tier: 1, name: 'Air Transmission 1', cost: 7, req: [], effects: { 'vectors.air': 0.12 }, desc: 'Spreads further by air travel between hub cities.' },
  { id: 't_water1', branch: 'transmission', tier: 1, name: 'Water Transmission 1', cost: 7, req: [], effects: { 'vectors.water': 0.12 }, desc: 'Spreads through water supplies and sea routes.' },
  { id: 't_air2', branch: 'transmission', tier: 2, name: 'Air Transmission 2', cost: 14, req: ['t_air1'], effects: { 'vectors.air': 0.18, infectivity: 0.04 }, desc: 'Aerosol particles linger; air corridors light up.' },
  { id: 't_water2', branch: 'transmission', tier: 2, name: 'Water Transmission 2', cost: 14, req: ['t_water1'], effects: { 'vectors.water': 0.18, infectivity: 0.04 }, desc: 'Survives water treatment; coastal cities fall fast.' },
  { id: 't_animal', branch: 'transmission', tier: 2, name: 'Zoonosis', cost: 12, req: [], effects: { 'vectors.animal': 0.25 }, desc: 'Livestock and wildlife carry it across borders.' },
  { id: 't_inf1', branch: 'transmission', tier: 3, name: 'Virulence', cost: 20, req: ['t_air2', 't_water2'], effects: { infectivity: 0.15 }, desc: 'Raw infectivity surges everywhere.' },
  { id: 't_extreme', branch: 'transmission', tier: 4, name: 'Extreme Bioaerosol', cost: 34, req: ['t_inf1'], effects: { infectivity: 0.2, 'vectors.air': 0.2 }, desc: 'Near-unstoppable airborne spread.' },

  // ── SYMPTOMS ──
  { id: 's_cough', branch: 'symptoms', tier: 1, name: 'Coughing', cost: 6, req: [], effects: { infectivity: 0.06, severity: 0.04 }, desc: 'Boosts local spread; mild attention.' },
  { id: 's_nausea', branch: 'symptoms', tier: 1, name: 'Nausea', cost: 6, req: [], effects: { lethality: 0.04, severity: 0.03 }, desc: 'A small, steady toll.' },
  { id: 's_fever', branch: 'symptoms', tier: 2, name: 'Fever', cost: 12, req: ['s_cough'], effects: { lethality: 0.06, severity: 0.08, 'resist.cold': 0.05 }, desc: 'Heats the host — deadlier, but noticed.' },
  { id: 's_dysentery', branch: 'symptoms', tier: 2, name: 'Dysentery', cost: 12, req: ['s_nausea'], effects: { lethality: 0.1, severity: 0.07 }, desc: 'Lethal in cities with weak healthcare.' },
  { id: 's_organ', branch: 'symptoms', tier: 3, name: 'Organ Failure', cost: 22, req: ['s_fever', 's_dysentery'], effects: { lethality: 0.16, severity: 0.12 }, desc: 'High body count — and high alarm.' },
  { id: 's_hemo', branch: 'symptoms', tier: 4, name: 'Haemorrhagic Shock', cost: 36, req: ['s_organ'], effects: { lethality: 0.28, severity: 0.2 }, desc: 'Catastrophic lethality. The world will fight back hard.' },
  { id: 's_insomnia', branch: 'symptoms', tier: 3, name: 'Total Insomnia', cost: 18, req: ['s_fever'], effects: { lethality: 0.12, 'resist.drug': 0.1 }, desc: 'Lethal and harder to treat.' },

  // ── RESILIENCE ──
  { id: 'r_heat1', branch: 'resilience', tier: 1, name: 'Heat Resistance 1', cost: 7, req: [], effects: { 'resist.heat': 0.2 }, desc: 'Thrives in hot and arid capitals.' },
  { id: 'r_cold1', branch: 'resilience', tier: 1, name: 'Cold Resistance 1', cost: 7, req: [], effects: { 'resist.cold': 0.2 }, desc: 'Thrives in cold capitals.' },
  { id: 'r_heat2', branch: 'resilience', tier: 2, name: 'Heat Resistance 2', cost: 13, req: ['r_heat1'], effects: { 'resist.heat': 0.25 }, desc: 'Total tolerance to heat.' },
  { id: 'r_cold2', branch: 'resilience', tier: 2, name: 'Cold Resistance 2', cost: 13, req: ['r_cold1'], effects: { 'resist.cold': 0.25 }, desc: 'Total tolerance to cold.' },
  { id: 'r_drug1', branch: 'resilience', tier: 2, name: 'Drug Resistance 1', cost: 15, req: [], effects: { 'resist.drug': 0.2 }, desc: 'Slows cure research against you.' },
  { id: 'r_drug2', branch: 'resilience', tier: 3, name: 'Drug Resistance 2', cost: 26, req: ['r_drug1'], effects: { 'resist.drug': 0.3 }, desc: 'The cure crawls.' },
  { id: 'r_genex', branch: 'resilience', tier: 4, name: 'Genetic Hardening', cost: 32, req: ['r_heat2', 'r_cold2'], effects: { 'resist.heat': 0.2, 'resist.cold': 0.2, 'resist.drug': 0.15 }, desc: 'Resilient everywhere, against everything.' },
];

export function getNode(id) {
  return SKILL_NODES.find((n) => n.id === id);
}

// Returns true if every prerequisite of `nodeId` is already owned.
export function prereqsMet(nodeId, owned) {
  const node = getNode(nodeId);
  if (!node) return false;
  return node.req.every((r) => owned.includes(r));
}
