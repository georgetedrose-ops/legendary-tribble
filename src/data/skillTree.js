// Evolution skill tree. Spend DNA to buy nodes; each node adds to your disease
// stats via additive `effects` (dotted keys address nested stats, e.g.
// "vectors.air"). `req` lists AND-prerequisite node ids (ALL must be owned).
// `exclusiveWith` lists ids that become permanently locked once this node is
// bought (and vice-versa) — used for "commit to a strategy" forks.
//
// FOUR branches give the tree its shape:
//   TRANSMISSION — spread, vectors, raw infectivity (win by speed/coverage)
//   SYMPTOMS     — lethality + severity, big DNA from kills, but raises the
//                  world's attention so the cure comes faster
//   RESILIENCE   — climate resistance + drug resistance / cure-slowing
//                  (win by surviving long and starving the cure)
//   MUTATION     — economy + utility: DNA income, flexibility, and the spicier
//                  capstones (win by out-tempoing everyone)
//
// Tier (1..5) tracks cost/power and drives the visual layout (column = branch,
// row = tier). You can NEVER afford the whole tree in one match — commit.

export const SKILL_NODES = [
  // ──────────────────────────── TRANSMISSION ────────────────────────────
  // Roots
  { id: 't_air1', branch: 'transmission', tier: 1, name: 'Air Transmission 1', cost: 7, req: [], effects: { 'vectors.air': 0.12 }, desc: 'Coughs and sneezes carry it between hub cities.' },
  { id: 't_water1', branch: 'transmission', tier: 1, name: 'Water Transmission 1', cost: 7, req: [], effects: { 'vectors.water': 0.12 }, desc: 'Seeps into water supplies and sea routes.' },
  { id: 't_animal1', branch: 'transmission', tier: 1, name: 'Zoonosis', cost: 6, req: [], effects: { 'vectors.animal': 0.14 }, desc: 'Rats, birds and livestock ferry it across borders.' },
  // Tier 2
  { id: 't_air2', branch: 'transmission', tier: 2, name: 'Air Transmission 2', cost: 14, req: ['t_air1'], effects: { 'vectors.air': 0.18, infectivity: 0.04 }, desc: 'Aerosols linger in the air long after the host leaves.' },
  { id: 't_water2', branch: 'transmission', tier: 2, name: 'Water Transmission 2', cost: 14, req: ['t_water1'], effects: { 'vectors.water': 0.18, infectivity: 0.04 }, desc: 'Survives chlorination; coastal cities fall fast.' },
  { id: 't_animal2', branch: 'transmission', tier: 2, name: 'Livestock Reservoir', cost: 13, req: ['t_animal1'], effects: { 'vectors.animal': 0.2, infectivity: 0.03 }, desc: 'Herds become a permanent reservoir you cannot cure out.' },
  { id: 't_dense', branch: 'transmission', tier: 2, name: 'Crowd Density', cost: 11, req: [], effects: { infectivity: 0.08 }, desc: 'Exploits packed transit, markets and megacities.' },
  // Tier 3
  { id: 't_inf1', branch: 'transmission', tier: 3, name: 'Virulence', cost: 20, req: ['t_dense'], effects: { infectivity: 0.15 }, desc: 'Raw transmissibility surges everywhere at once.' },
  { id: 't_humidair', branch: 'transmission', tier: 3, name: 'Humid Adaptation', cost: 19, req: ['t_air2'], effects: { 'vectors.air': 0.15, 'resist.heat': 0.1 }, desc: 'Tropical humidity becomes a launchpad, not a barrier.' },
  { id: 't_brackish', branch: 'transmission', tier: 3, name: 'Brackish Tolerance', cost: 19, req: ['t_water2'], effects: { 'vectors.water': 0.15, 'resist.cold': 0.1 }, desc: 'Thrives from estuaries to frozen rivers.' },
  // Tier 4 — MUTUALLY EXCLUSIVE specialist fork (air vs water)
  { id: 't_airspec', branch: 'transmission', tier: 4, name: 'Airborne Specialist', cost: 38, req: ['t_humidair', 't_inf1'], exclusiveWith: ['t_waterspec'], effects: { 'vectors.air': 0.25, infectivity: 0.1 }, desc: 'All-in on the wind. Locks out the waterborne path.' },
  { id: 't_waterspec', branch: 'transmission', tier: 4, name: 'Waterborne Specialist', cost: 38, req: ['t_brackish', 't_inf1'], exclusiveWith: ['t_airspec'], effects: { 'vectors.water': 0.25, infectivity: 0.1 }, desc: 'All-in on the tides. Locks out the airborne path.' },
  // Tier 5 — capstones (one per specialist line)
  { id: 't_aerosol', branch: 'transmission', tier: 5, name: 'Extreme Bioaerosol', cost: 58, req: ['t_airspec'], special: ['aerosol'], effects: { 'vectors.air': 0.2, infectivity: 0.12 }, desc: 'CAPSTONE: keeps spreading along air links even through locked-down cities.' },
  { id: 't_pandemic', branch: 'transmission', tier: 5, name: 'Pandemic Vector', cost: 52, req: ['t_waterspec'], effects: { 'vectors.water': 0.18, 'vectors.animal': 0.18, infectivity: 0.14 }, desc: 'CAPSTONE: every route carries it; near-total global coverage.' },

  // ───────────────────────────── SYMPTOMS ──────────────────────────────
  // Roots
  { id: 's_cough', branch: 'symptoms', tier: 1, name: 'Coughing', cost: 6, req: [], effects: { infectivity: 0.06, severity: 0.04 }, desc: 'Boosts local spread; only mild attention.' },
  { id: 's_nausea', branch: 'symptoms', tier: 1, name: 'Nausea', cost: 6, req: [], effects: { lethality: 0.04, severity: 0.03 }, desc: 'A small, steady toll that flies under the radar.' },
  { id: 's_rash', branch: 'symptoms', tier: 1, name: 'Skin Lesions', cost: 7, req: [], effects: { severity: 0.06, infectivity: 0.03 }, desc: 'Visible and contagious — but visible.' },
  // Tier 2
  { id: 's_fever', branch: 'symptoms', tier: 2, name: 'Fever', cost: 12, req: ['s_cough'], effects: { lethality: 0.06, severity: 0.08, 'resist.cold': 0.05 }, desc: 'Heats the host: deadlier, and noticed.' },
  { id: 's_dysentery', branch: 'symptoms', tier: 2, name: 'Dysentery', cost: 12, req: ['s_nausea'], effects: { lethality: 0.1, severity: 0.07 }, desc: 'Lethal where healthcare is weak.' },
  { id: 's_pustules', branch: 'symptoms', tier: 2, name: 'Pustular Sores', cost: 13, req: ['s_rash'], effects: { severity: 0.1, lethality: 0.04 }, desc: 'Gruesome and unmistakable; panic spreads.' },
  // Tier 3
  { id: 's_organ', branch: 'symptoms', tier: 3, name: 'Organ Failure', cost: 22, req: ['s_fever', 's_dysentery'], effects: { lethality: 0.16, severity: 0.12 }, desc: 'High body count — and high alarm.' },
  { id: 's_insomnia', branch: 'symptoms', tier: 3, name: 'Total Insomnia', cost: 18, req: ['s_fever'], exclusiveWith: ['s_seizure'], effects: { lethality: 0.12, 'resist.drug': 0.1 }, desc: 'Lethal but creeping and treatment-resistant. Excludes the overt Seizure path.' },
  { id: 's_seizure', branch: 'symptoms', tier: 3, name: 'Neural Seizures', cost: 20, req: ['s_pustules'], exclusiveWith: ['s_insomnia'], effects: { lethality: 0.14, severity: 0.1 }, desc: 'Overt and violent; ICUs overwhelmed. Excludes the creeping Insomnia path.' },
  // Tier 4 — MUTUALLY EXCLUSIVE fork (go loud & lethal vs go quiet)
  { id: 's_necrosis', branch: 'symptoms', tier: 4, name: 'Necrosis', cost: 42, req: ['s_organ'], exclusiveWith: ['s_latency'], special: ['necrosis'], effects: { lethality: 0.22, severity: 0.16 }, desc: 'CAPSTONE: flesh rots; +60% DNA from every kill. Excludes the stealth path.' },
  { id: 's_latency', branch: 'symptoms', tier: 4, name: 'Long Latency', cost: 40, req: ['s_insomnia'], exclusiveWith: ['s_necrosis'], special: ['asymptomatic'], effects: { lethality: 0.06, 'resist.drug': 0.12 }, desc: 'CAPSTONE: hides for weeks; -50% world attention. Excludes the lethal path.' },
  // Tier 5 — capstones gated behind the fork
  { id: 's_hemo', branch: 'symptoms', tier: 5, name: 'Haemorrhagic Shock', cost: 60, req: ['s_necrosis'], effects: { lethality: 0.3, severity: 0.22 }, desc: 'CAPSTONE: catastrophic lethality. The world will throw everything at the cure.' },
  { id: 's_priondeath', branch: 'symptoms', tier: 5, name: 'Silent Prion', cost: 56, req: ['s_latency'], effects: { lethality: 0.2, 'resist.drug': 0.15 }, desc: 'CAPSTONE: kills slowly, untreatably, and without raising the alarm.' },

  // ──────────────────────────── RESILIENCE ─────────────────────────────
  // Roots
  { id: 'r_heat1', branch: 'resilience', tier: 1, name: 'Heat Resistance 1', cost: 7, req: [], effects: { 'resist.heat': 0.2 }, desc: 'Endures hot, arid capitals.' },
  { id: 'r_cold1', branch: 'resilience', tier: 1, name: 'Cold Resistance 1', cost: 7, req: [], effects: { 'resist.cold': 0.2 }, desc: 'Endures frozen capitals.' },
  { id: 'r_drug1', branch: 'resilience', tier: 1, name: 'Drug Resistance 1', cost: 9, req: [], effects: { 'resist.drug': 0.18 }, desc: 'Slows the first cure attempts against you.' },
  // Tier 2
  { id: 'r_heat2', branch: 'resilience', tier: 2, name: 'Heat Resistance 2', cost: 13, req: ['r_heat1'], effects: { 'resist.heat': 0.25 }, desc: 'Full tolerance to scorching climates.' },
  { id: 'r_cold2', branch: 'resilience', tier: 2, name: 'Cold Resistance 2', cost: 13, req: ['r_cold1'], effects: { 'resist.cold': 0.25 }, desc: 'Full tolerance to polar climates.' },
  { id: 'r_drug2', branch: 'resilience', tier: 2, name: 'Drug Resistance 2', cost: 16, req: ['r_drug1'], effects: { 'resist.drug': 0.22 }, desc: 'The cure programme stalls and loses funding.' },
  { id: 'r_spore', branch: 'resilience', tier: 2, name: 'Spore Coat', cost: 14, req: [], effects: { 'resist.heat': 0.1, 'resist.cold': 0.1 }, desc: 'A hardy shell shrugs off the elements.' },
  // Tier 3
  { id: 'r_climate', branch: 'resilience', tier: 3, name: 'Climate Adaptation', cost: 24, req: ['r_heat2', 'r_cold2'], effects: { 'resist.heat': 0.18, 'resist.cold': 0.18 }, desc: 'Comfortable from desert to tundra.' },
  { id: 'r_drug3', branch: 'resilience', tier: 3, name: 'Drug Resistance 3', cost: 26, req: ['r_drug2'], effects: { 'resist.drug': 0.28 }, desc: 'Cure research crawls to a near halt.' },
  { id: 'r_gene', branch: 'resilience', tier: 3, name: 'Genetic Hardening', cost: 22, req: ['r_spore'], effects: { 'resist.heat': 0.12, 'resist.cold': 0.12, 'resist.drug': 0.1 }, desc: 'Tough everywhere, against everything.' },
  // Tier 4 — MUTUALLY EXCLUSIVE fork (beat the climate vs beat the cure)
  { id: 'r_extremo', branch: 'resilience', tier: 4, name: 'Extremophile', cost: 44, req: ['r_climate'], exclusiveWith: ['r_lockcure'], special: ['extremophile'], effects: { 'resist.heat': 0.15, 'resist.cold': 0.15 }, desc: 'CAPSTONE: removes ALL climate penalties. Excludes the cure-lock path.' },
  { id: 'r_lockcure', branch: 'resilience', tier: 4, name: 'Cure Saboteur', cost: 44, req: ['r_drug3'], exclusiveWith: ['r_extremo'], special: ['drug_immunity'], effects: { 'resist.drug': 0.2 }, desc: 'CAPSTONE: cure research is 60% slower. Excludes the climate path.' },
  // Tier 5 — capstone (cross-gated to reward deep resilience investment)
  { id: 'r_immortal', branch: 'resilience', tier: 5, name: 'Endless Strain', cost: 50, req: ['r_gene', 'r_drug3'], effects: { 'resist.drug': 0.25, 'resist.heat': 0.12, 'resist.cold': 0.12 }, desc: 'CAPSTONE: outlasts every quarantine and clinical trial ever filed.' },

  // ───────────────────────────── MUTATION ──────────────────────────────
  // Roots — economy
  { id: 'm_repl1', branch: 'mutation', tier: 1, name: 'Replication 1', cost: 8, req: [], effects: { infectivity: 0.04 }, desc: 'Faster replication trickles in extra DNA.' },
  { id: 'm_thrift', branch: 'mutation', tier: 1, name: 'Genetic Thrift', cost: 6, req: [], effects: {}, desc: 'Lean genome: a small but reliable DNA economy boon.' },
  { id: 'm_drift', branch: 'mutation', tier: 1, name: 'Genetic Drift', cost: 7, req: [], effects: { severity: 0.03, infectivity: 0.03 }, desc: 'Random mutations occasionally pay off.' },
  // Tier 2
  { id: 'm_repl2', branch: 'mutation', tier: 2, name: 'Replication 2', cost: 15, req: ['m_repl1'], effects: { infectivity: 0.06 }, desc: 'Replication outpaces the host immune response.' },
  { id: 'm_harvest', branch: 'mutation', tier: 2, name: 'Bubble Harvest', cost: 14, req: ['m_thrift'], effects: {}, desc: 'Squeeze more DNA from each infected city.' },
  { id: 'm_chameleon', branch: 'mutation', tier: 2, name: 'Antigen Shift', cost: 16, req: ['m_drift'], effects: { 'resist.drug': 0.1, infectivity: 0.03 }, desc: 'Shifting surface proteins confuse detection.' },
  // Tier 3
  { id: 'm_meta1', branch: 'mutation', tier: 3, name: 'Metabolic Boost', cost: 24, req: ['m_repl2', 'm_harvest'], effects: { infectivity: 0.05 }, desc: 'A roaring metabolism floods you with DNA.' },
  { id: 'm_stealth', branch: 'mutation', tier: 3, name: 'Immune Camouflage', cost: 23, req: ['m_chameleon'], effects: { 'resist.drug': 0.15 }, desc: 'The body barely notices it is sick.' },
  { id: 'm_gamble', branch: 'mutation', tier: 3, name: 'Hypermutation', cost: 21, req: ['m_drift'], effects: { infectivity: 0.08, severity: 0.06, lethality: 0.04 }, desc: 'A volatile all-stats gamble.' },
  // Tier 4 — MUTUALLY EXCLUSIVE fork (economy engine vs stealth engine)
  { id: 'm_metabolism', branch: 'mutation', tier: 4, name: 'Fast Metabolism', cost: 46, req: ['m_meta1'], exclusiveWith: ['m_quiet'], special: ['fast_metabolism'], effects: { infectivity: 0.08 }, desc: 'CAPSTONE: +120% passive DNA income. Excludes the stealth engine.' },
  { id: 'm_quiet', branch: 'mutation', tier: 4, name: 'Silent Carrier', cost: 44, req: ['m_stealth'], exclusiveWith: ['m_metabolism'], special: ['asymptomatic'], effects: { 'resist.drug': 0.12 }, desc: 'CAPSTONE: -50% world attention. Excludes the economy engine.' },
  // Tier 5 — capstones gated behind the fork; the necrosis-economy capstone is
  // mutually exclusive with the stealth-economy capstone (commit to a payoff).
  { id: 'm_apex', branch: 'mutation', tier: 5, name: 'Apex Pathogen', cost: 62, req: ['m_metabolism', 'm_gamble'], exclusiveWith: ['m_ghost'], special: ['necrosis'], effects: { infectivity: 0.1, lethality: 0.08 }, desc: 'CAPSTONE: roaring economy AND +60% DNA from kills. Excludes the Ghost path.' },
  { id: 'm_ghost', branch: 'mutation', tier: 5, name: 'Ghost Strain', cost: 55, req: ['m_quiet'], exclusiveWith: ['m_apex'], special: ['drug_immunity'], effects: { 'resist.drug': 0.18, infectivity: 0.06 }, desc: 'CAPSTONE: undetectable and uncurable; cure research 60% slower. Excludes the Apex path.' },
];

export const BRANCHES = [
  { id: 'transmission', name: 'Transmission', icon: '🦠' },
  { id: 'symptoms', name: 'Symptoms', icon: '☠' },
  { id: 'resilience', name: 'Resilience', icon: '🛡' },
  { id: 'mutation', name: 'Mutation', icon: '🧬' },
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

// Returns true if this node is locked out by an exclusivity conflict: either it
// lists an owned node in its own exclusiveWith, or some owned node lists this id
// in its exclusiveWith. (Symmetric regardless of which side declared the fork.)
export function nodeExclusivityLocked(id, owned) {
  const node = getNode(id);
  if (!node) return false;
  if ((node.exclusiveWith || []).some((x) => owned.includes(x))) return true;
  return owned.some((ownedId) => {
    const o = getNode(ownedId);
    return o && (o.exclusiveWith || []).includes(id);
  });
}
