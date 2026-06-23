// Central balance knobs. Kept in one place so the game can be tuned without
// hunting through the simulation. All values are per-tick unless noted.
// A "tick" is one simulation step; the UI runs ticks at a speed the player sets.

export const TICK = {
  MS_PER_TICK: 500, // wall-clock at 1x speed
  SPEEDS: [0, 1, 2, 4], // 0 = paused
};

export const WORLD = {
  // How readily infection jumps along a link, by link kind.
  LINK_WEIGHT: { land: 1.0, sea: 0.55, air: 0.8 },
  // Base fraction of a city's susceptible pool newly infected per tick at
  // infectivity 1.0 with a single seeded case (logistic growth coefficient).
  BASE_GROWTH: 0.16,
  // Minimum infected fraction in a city before it can export to neighbours.
  EXPORT_THRESHOLD: 0.0008,
  // Scales how much infected population a link carries per tick.
  EXPORT_RATE: 0.018,
};

export const DISEASE = {
  // Evolution currency ("DNA") earned per tick passively + per newly infected.
  DNA_PER_TICK: 0.1,
  DNA_PER_MILLION_INFECTED: 0.5,
  DNA_PER_MILLION_KILLED: 0.35,
  // Bubble pickups (Plague-Inc style) — DNA orbs that spawn over infected
  // cities and decay if not collected. Handled in sim as claimable rewards.
  BUBBLE_VALUE: 3,
  BUBBLE_SPAWN_CHANCE: 0.05,
  BUBBLE_TTL_TICKS: 14,
};

export const CURE = {
  // Global cure research accrues as severity/attention rises. When it hits
  // 100 for a given disease, that disease begins to be eradicated worldwide.
  // Eliminated players (the Cure faction) pour points in to accelerate it.
  BASE_RATE: 0.16, // passive research per tick once attention triggered
  ATTENTION_PER_SEVERITY: 2.2,
  ATTENTION_PER_DEATH_MILLION: 0.08,
  RICH_CITY_BONUS: 1.8, // wealthy cities research faster
  // Cure faction actions
  ACTION_COST: {
    fund_research: 4, // big push to cure progress
    lockdown: 3, // temporarily cut a city's links
    vaccinate: 5, // protect a city's susceptibles
  },
  FUND_RESEARCH_AMOUNT: 9,
  LOCKDOWN_TICKS: 16,
  VACCINATE_FRACTION: 0.35,
};

export const CLIMATE = ['temperate', 'hot', 'cold', 'arid', 'humid'];
export const WEALTH = ['poor', 'developing', 'rich'];

// How a city's wealth modifies detection speed and healthcare (death dampening).
export const WEALTH_MOD = {
  poor: { research: 0.6, healthcare: 0.7 },
  developing: { research: 1.0, healthcare: 1.0 },
  rich: { research: 1.8, healthcare: 1.4 },
};

export const SCORE = {
  PER_INFECTED_MILLION: 10,
  PER_KILLED_MILLION: 25,
  PER_CITY_DOMINATED: 50, // city where you hold majority of infections
  SURVIVAL_BONUS: 500, // last disease standing
};

export const LIMITS = {
  MIN_PLAYERS: 1,
  MAX_PLAYERS: 6,
  USERNAME_MAX: 16,
  DISEASE_NAME_MAX: 22,
};
