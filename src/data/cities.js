// Major world capitals as points of interest. Coordinates are real (lat/lon)
// and projected to screen space with a simple equirectangular projection at
// render time, so the layout reads like a world map. Population is in millions
// (metro-area scale, rounded for game balance, not census-accurate).
//
// Links form a Risk-style graph: `land` (neighbouring regions), `sea` (coastal
// hops), `air` (hub-to-hub flights). Link kind affects how readily a disease
// travels along it. Links are declared once (a -> b) and made bidirectional
// automatically by buildWorld().

export const CITIES = [
  // ── North America ──
  { id: 'was', name: 'Washington', country: 'USA', lat: 38.9, lon: -77.0, pop: 6.3, climate: 'temperate', wealth: 'rich' },
  { id: 'mex', name: 'Mexico City', country: 'Mexico', lat: 19.4, lon: -99.1, pop: 21.8, climate: 'arid', wealth: 'developing' },
  { id: 'ott', name: 'Ottawa', country: 'Canada', lat: 45.4, lon: -75.7, pop: 1.4, climate: 'cold', wealth: 'rich' },
  // ── South America ──
  { id: 'bra', name: 'Brasília', country: 'Brazil', lat: -15.8, lon: -47.9, pop: 4.6, climate: 'humid', wealth: 'developing' },
  { id: 'bue', name: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.4, pop: 15.2, climate: 'temperate', wealth: 'developing' },
  { id: 'lim', name: 'Lima', country: 'Peru', lat: -12.0, lon: -77.0, pop: 11.0, climate: 'arid', wealth: 'developing' },
  { id: 'bog', name: 'Bogotá', country: 'Colombia', lat: 4.7, lon: -74.1, pop: 11.3, climate: 'humid', wealth: 'developing' },
  // ── Europe ──
  { id: 'lon', name: 'London', country: 'UK', lat: 51.5, lon: -0.13, pop: 9.5, climate: 'temperate', wealth: 'rich' },
  { id: 'par', name: 'Paris', country: 'France', lat: 48.9, lon: 2.35, pop: 11.1, climate: 'temperate', wealth: 'rich' },
  { id: 'ber', name: 'Berlin', country: 'Germany', lat: 52.5, lon: 13.4, pop: 6.1, climate: 'cold', wealth: 'rich' },
  { id: 'mad', name: 'Madrid', country: 'Spain', lat: 40.4, lon: -3.7, pop: 6.7, climate: 'arid', wealth: 'rich' },
  { id: 'rom', name: 'Rome', country: 'Italy', lat: 41.9, lon: 12.5, pop: 4.3, climate: 'temperate', wealth: 'rich' },
  { id: 'mos', name: 'Moscow', country: 'Russia', lat: 55.8, lon: 37.6, pop: 12.6, climate: 'cold', wealth: 'developing' },
  { id: 'ist', name: 'Istanbul', country: 'Türkiye', lat: 41.0, lon: 28.9, pop: 15.5, climate: 'temperate', wealth: 'developing' },
  // ── Africa ──
  { id: 'cai', name: 'Cairo', country: 'Egypt', lat: 30.0, lon: 31.2, pop: 21.3, climate: 'arid', wealth: 'developing' },
  { id: 'lag', name: 'Lagos', country: 'Nigeria', lat: 6.5, lon: 3.4, pop: 15.4, climate: 'humid', wealth: 'poor' },
  { id: 'nai', name: 'Nairobi', country: 'Kenya', lat: -1.3, lon: 36.8, pop: 5.1, climate: 'hot', wealth: 'poor' },
  { id: 'cpt', name: 'Cape Town', country: 'South Africa', lat: -33.9, lon: 18.4, pop: 4.7, climate: 'temperate', wealth: 'developing' },
  { id: 'add', name: 'Addis Ababa', country: 'Ethiopia', lat: 9.0, lon: 38.7, pop: 5.2, climate: 'hot', wealth: 'poor' },
  // ── Middle East / Central Asia ──
  { id: 'riy', name: 'Riyadh', country: 'Saudi Arabia', lat: 24.7, lon: 46.7, pop: 7.7, climate: 'arid', wealth: 'rich' },
  { id: 'teh', name: 'Tehran', country: 'Iran', lat: 35.7, lon: 51.4, pop: 9.5, climate: 'arid', wealth: 'developing' },
  // ── South & East Asia ──
  { id: 'del', name: 'New Delhi', country: 'India', lat: 28.6, lon: 77.2, pop: 32.0, climate: 'hot', wealth: 'developing' },
  { id: 'isb', name: 'Islamabad', country: 'Pakistan', lat: 33.7, lon: 73.1, pop: 3.5, climate: 'arid', wealth: 'poor' },
  { id: 'bej', name: 'Beijing', country: 'China', lat: 39.9, lon: 116.4, pop: 21.5, climate: 'cold', wealth: 'developing' },
  { id: 'tok', name: 'Tokyo', country: 'Japan', lat: 35.7, lon: 139.7, pop: 37.4, climate: 'temperate', wealth: 'rich' },
  { id: 'sel', name: 'Seoul', country: 'South Korea', lat: 37.6, lon: 127.0, pop: 25.0, climate: 'temperate', wealth: 'rich' },
  { id: 'bkk', name: 'Bangkok', country: 'Thailand', lat: 13.8, lon: 100.5, pop: 10.7, climate: 'humid', wealth: 'developing' },
  { id: 'jak', name: 'Jakarta', country: 'Indonesia', lat: -6.2, lon: 106.8, pop: 10.6, climate: 'humid', wealth: 'developing' },
  // ── Oceania ──
  { id: 'can', name: 'Canberra', country: 'Australia', lat: -35.3, lon: 149.1, pop: 0.45, climate: 'temperate', wealth: 'rich' },
  { id: 'syd', name: 'Sydney', country: 'Australia', lat: -33.9, lon: 151.2, pop: 5.3, climate: 'temperate', wealth: 'rich' },
  { id: 'wlg', name: 'Wellington', country: 'New Zealand', lat: -41.3, lon: 174.8, pop: 0.42, climate: 'temperate', wealth: 'rich' },
];

// Directed declarations; buildWorld() symmetrises them.
export const LINKS = [
  // North America internal + bridges
  ['was', 'ott', 'land'], ['was', 'mex', 'land'], ['was', 'lon', 'air'],
  ['was', 'tok', 'air'], ['ott', 'lon', 'air'], ['mex', 'bog', 'sea'],
  ['mex', 'lim', 'sea'], ['mex', 'mad', 'air'],
  // South America
  ['bog', 'lim', 'land'], ['bog', 'bra', 'land'], ['lim', 'bue', 'land'],
  ['bra', 'bue', 'land'], ['bra', 'lag', 'sea'], ['bue', 'cpt', 'sea'],
  ['bra', 'mad', 'air'],
  // Europe
  ['lon', 'par', 'land'], ['par', 'ber', 'land'], ['par', 'mad', 'land'],
  ['par', 'rom', 'land'], ['ber', 'mos', 'land'], ['rom', 'ist', 'sea'],
  ['mad', 'rom', 'sea'], ['ber', 'ist', 'land'], ['lon', 'ber', 'air'],
  ['mos', 'ist', 'land'],
  // Europe <-> Africa / ME
  ['rom', 'cai', 'sea'], ['mad', 'lag', 'air'], ['ist', 'cai', 'sea'],
  ['ist', 'teh', 'land'], ['mos', 'teh', 'air'],
  // Africa
  ['cai', 'add', 'land'], ['cai', 'lag', 'land'], ['add', 'nai', 'land'],
  ['lag', 'nai', 'land'], ['nai', 'cpt', 'land'], ['add', 'riy', 'sea'],
  // Middle East / Central Asia
  ['riy', 'teh', 'land'], ['riy', 'cai', 'sea'], ['teh', 'isb', 'land'],
  ['teh', 'del', 'air'], ['riy', 'del', 'air'],
  // South & East Asia
  ['isb', 'del', 'land'], ['del', 'bej', 'air'], ['del', 'bkk', 'land'],
  ['bej', 'sel', 'land'], ['sel', 'tok', 'sea'], ['bej', 'tok', 'sea'],
  ['bkk', 'jak', 'sea'], ['bkk', 'bej', 'land'], ['jak', 'syd', 'sea'],
  ['del', 'jak', 'air'],
  // Oceania
  ['syd', 'can', 'land'], ['syd', 'wlg', 'sea'], ['syd', 'tok', 'air'],
  ['syd', 'lim', 'air'],
];
