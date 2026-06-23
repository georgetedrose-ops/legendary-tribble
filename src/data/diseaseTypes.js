// Starting disease archetypes. Each sets base stats and a passive trait that
// shapes a distinct playstyle. Stats are 0..1 multipliers fed into the sim.
//
//  infectivity – how fast it spreads within and between cities
//  severity    – visibility; raises world attention & cure research
//  lethality   – how fast infected die (too high too early = you burn out)
//  vectors     – bonus transmission via air(travel)/water/animal
//  resist      – survival in heat/cold environments & against the drug/cure

export const DISEASE_TYPES = [
  {
    id: 'bacteria',
    name: 'Bacteria',
    blurb: 'Hardy all-rounder. Resilient across climates — a forgiving place to start.',
    color: '#7cce6f',
    base: {
      infectivity: 0.42, severity: 0.18, lethality: 0.12,
      vectors: { air: 0.1, water: 0.2, animal: 0.1 },
      resist: { heat: 0.3, cold: 0.3, drug: 0.1 },
    },
    trait: { id: 'hardened', name: 'Hardened Shell', desc: 'Climate penalties reduced by 40%.' },
  },
  {
    id: 'virus',
    name: 'Virus',
    blurb: 'Mutates on its own — fast and unpredictable, but harder to control.',
    color: '#e0566b',
    base: {
      infectivity: 0.55, severity: 0.22, lethality: 0.14,
      vectors: { air: 0.25, water: 0.1, animal: 0.15 },
      resist: { heat: 0.1, cold: 0.1, drug: 0.05 },
    },
    trait: { id: 'mutator', name: 'Rapid Mutation', desc: 'Randomly gains small free stat boosts over time.' },
  },
  {
    id: 'parasite',
    name: 'Parasite',
    blurb: 'Stays hidden. Low visibility keeps the cure asleep while you spread.',
    color: '#d8a23a',
    base: {
      infectivity: 0.4, severity: 0.08, lethality: 0.1,
      vectors: { air: 0.05, water: 0.2, animal: 0.3 },
      resist: { heat: 0.2, cold: 0.1, drug: 0.15 },
    },
    trait: { id: 'stealth', name: 'Symbiosis', desc: 'Generates 30% less world attention.' },
  },
  {
    id: 'prion',
    name: 'Prion',
    blurb: 'Slow, near-invisible, and almost impossible to cure once entrenched.',
    color: '#9b8cf0',
    base: {
      infectivity: 0.3, severity: 0.06, lethality: 0.16,
      vectors: { air: 0.0, water: 0.1, animal: 0.2 },
      resist: { heat: 0.25, cold: 0.25, drug: 0.4 },
    },
    trait: { id: 'neural', name: 'Neural Atrophy', desc: 'Cure research against you is 35% slower.' },
  },
  {
    id: 'nano',
    name: 'Nanovirus',
    blurb: 'Engineered to spread everywhere instantly — but the world notices fast.',
    color: '#3fcad4',
    base: {
      infectivity: 0.6, severity: 0.3, lethality: 0.18,
      vectors: { air: 0.2, water: 0.2, animal: 0.2 },
      resist: { heat: 0.2, cold: 0.2, drug: 0.2 },
    },
    trait: { id: 'broadcast', name: 'Self-Replicating', desc: 'Ignores the cross-border export threshold.' },
  },
  {
    id: 'bioweapon',
    name: 'Bioweapon',
    blurb: 'Brutally lethal and ever-escalating. High risk, high body count.',
    color: '#c0c4cc',
    base: {
      infectivity: 0.5, severity: 0.4, lethality: 0.4,
      vectors: { air: 0.15, water: 0.15, animal: 0.15 },
      resist: { heat: 0.15, cold: 0.15, drug: 0.15 },
    },
    trait: { id: 'escalation', name: 'Escalation', desc: 'Lethality slowly climbs on its own.' },
  },
];

export function getDiseaseType(id) {
  return DISEASE_TYPES.find((d) => d.id === id) || DISEASE_TYPES[0];
}
