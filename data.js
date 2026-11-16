/* Third Hand Fab & Welding — reference content and starting records.
   Records below were copied from the live app pull of Nov 14, 2026. Photos were not transferred. */
var TH = {}; window.TH = TH;

TH.SEED = {
  version: 1,
  settings: {
    shopName: 'T-County Trailers', phone: '', email: '',
    address: '', website: 't-county-trailers.com',
    tagline: 'Welding & Restoration', accent: '#19728d', logoSize: 'Large', logoPhoto: null,
    taxRate: 9.25, laborRate: 75, ein: '', sosControl: '', countyLicense: '', nhtsaMid: '', wmi: '', wmiSuffix: '', plantCode: '', plantCity: '', part565Id: '', keyContacts: '', county: '', lastBackup: null
  },
  customers: [],
  estimates: [],
  costs: [
    { id: 'k-gate', job: 'Gate repair', customerId: '', materials: 50, labor: 225, overhead: 40, markup: 20, notes: '', created: '2026-11-14' }
  ],
  materials: [],
  inventory: [
    { id: 'i-argon', name: '75/25 argon-CO₂ mix', category: 'Welding', onHand: 0.5, unit: 'bottle', full: 3, reorderAt: 1, notes: '', usage: [] },
    { id: 'i-wire', name: 'ER70S-6 welding wire', category: 'Welding', onHand: 33, unit: 'lb (33 lb spool)', full: 15, reorderAt: 1, notes: '', usage: [] }
  ],
  receipts: [
    { id: 'r-hf', vendor: 'Harbor Freight', amount: 11.80, date: '2026-10-31', category: 'Materials', note: 'Shop tools', photo: null, placeholderPhoto: true }
  ],
  mileage: [], leads: [], notes: [], vins: [], sales: [],
  worksheets: {},
  suppliers: [
    { id: 's-husky', name: 'Husky Trailer Parts', category: 'Parcel-size trailer parts', website: 'huskytrailerstx.com',
      contact: '', phone: '', email: '', address: '', account: '', terms: 'Discount Partner',
      status: 'Discount Partner APPROVED Sep 29, 2026',
      notes: '10% off first $500+ qualifying order, discount grows with order volume, free FedEx on most orders. Linking the Husky logo on the website/social earns bigger discounts. Log out and back in to see discounted pricing. Never buy generic/no-name safety-critical parts (no US warranty or traceability).',
      added: '' },
    { id: 's-dexter', name: 'Dexter Axle — INDEX Wholesale', category: 'Genuine axles', website: '',
      contact: 'Sikeston, MO Branch 6', phone: '(573) 472-3839', email: '', address: '', account: '', terms: '',
      status: 'Application submitted Sep 29, 2026 — waiting on rep follow-up',
      notes: 'Application answered "Do you stock parts?" = No (to be corrected). Card gained the general email Nov 10. Axles only — cheapest quality route for running gear.',
      added: '' },
    { id: 's-sww', name: 'Southwest Wheel', category: 'Brake drums & trailer parts', website: 'trailerpart.com',
      contact: '', phone: '', email: 'sales@southwestwheel.com', address: '', account: '', terms: '',
      status: 'On the mailing list for deals',
      notes: 'Buy here: brake drums, hubs, running-gear parts. Compare against Husky/Dexter pricing before ordering — cheapest quality part wins, not cheapest part.',
      added: '' },
    { id: 's-tsc', name: 'Tractor Supply Co.', category: 'Drainage & farm supply', website: '',
      contact: '', phone: '', email: '', address: '', account: '', terms: '', status: '',
      notes: 'Driveway culvert, shop & farm supplies. 30-ft culvert run quoted $930.57 ship-to-store (Rolodex figure, October).',
      added: '' },
    { id: 's-tpo', name: 'Trailer Parts Outlet', category: 'Axle kits / running gear', website: 'thetrailerpartsoutlet.com',
      contact: '', phone: '(936) 349-6507', email: 'customerservice@thetrailerpartsoutlet.com',
      address: '2209 Interstate 45 North, Madisonville, TX 77864', account: '', terms: '', status: '',
      notes: 'Sells TK axle kits 3.5K–15K, bulk/wholesale options. TK Service Kit ASK-35EB545 $194.99/axle.',
      added: '2026-11-10' },
    { id: 's-libra', name: 'Libra Trailer Parts', category: 'Brake kits / trailer parts (Memphis warehouse)', website: 'libratrailerparts.com',
      contact: 'Weekdays 8–4', phone: '(901) 797-8600', email: 'sales@libraresources.com',
      address: '5837 Distribution Dr, Memphis, TN 38141', account: '', terms: '', status: '',
      notes: 'Brake kit notes: same 3,500-lb kit $194.49 per 2-pack → $388.98 for four on their own site. eBay seller libra-trailer-parts, 99.9% feedback, Top Rated Seller. No wholesale/dealer program published — ask about warehouse pickup + bulk pricing.',
      added: '2026-11-12' }
  ]
};

/* Stock pull-down: Trailer bearings group. Race (cup) numbers: L68110 is from the owner's own spec;
   the others are the standard matching cups — verify against the box before relying on them. */
TH.BEARINGS = [
  { num: 'L68149', label: 'L68149, 1-3/8", race L68110', use: 'Inner — 3,500-lb (#84 spindle)' },
  { num: 'L44649', label: 'L44649, 1-1/16", race L44610', use: 'Outer — 3,500-lb (#84 spindle)' },
  { num: '25580', label: '25580, 1-3/4", race 25520', use: 'Inner — 5,200 / 6,000 / 7,000-lb' },
  { num: 'LM67048', label: 'LM67048, 1-1/4", race LM67010', use: 'Outer — 5,200-lb' },
  { num: '15123', label: '15123, 1-1/4", race 15245', use: 'Outer — 6,000-lb' },
  { num: '14125A', label: '14125A, 1-1/4", race 14276', use: 'Outer — 7,000-lb' },
  { num: '10-19', label: '10-19 seal, 1.719" journal', use: 'Grease seal — 3,500-lb' },
  { num: '10-36', label: '10-36 seal, 2.25"', use: 'Grease seal — 5,200 / 6,000 / 7,000-lb' }
];
/* Stock targets live ONLY in the app (never on the posters). One wheel kit = inner + outer + seal. */
TH.KIT_TARGETS = [
  { axle: '3,500-lb', target: 12, inner: 'L68149', outer: 'L44649', seal: '10-19' },
  { axle: '5,200-lb', target: 6, inner: '25580', outer: 'LM67048', seal: '10-36' },
  { axle: '6,000-lb', target: 6, inner: '25580', outer: '15123', seal: '10-36' },
  { axle: '7,000-lb', target: 4, inner: '25580', outer: '14125A', seal: '10-36', note: 'one tandem trailer' }
];

/* Seven-model lineup (locked Oct 16, 2026). vin: Scheme B presets (null = not recorded, pick in builder). */
TH.MODELS = [
  { id: 'u14', name: "14' Single-Axle Utility", deck: "14' + 2' dovetail", gvwr: 3500, notes: 'Single 3,500-lb axle · brakes on all axles', vin: { body: 'U', hitch: 'B', len: '14', axles: '1' } },
  { id: 'u18', name: "18' Tandem Utility", deck: "18' + 2' dovetail", gvwr: 7000, notes: 'Tandem · brakes on all axles', vin: { body: 'U', hitch: 'B', len: '18', axles: '2' } },
  { id: 'c18', name: "18' Tandem Car Hauler", deck: "18' + 2' dovetail", gvwr: 9990, notes: 'Tandem · brakes on all axles · tire placard built Nov 14', vin: { body: 'C', hitch: 'B', len: '18', axles: '2' } },
  { id: 'e20', name: "20' Heavy Equipment", deck: "20' + 2' dovetail", gvwr: 14000, notes: 'Tandem 7,000-lb axles · brakes on all axles · over 10k: cert label only, no yellow placard', vin: { body: 'E', hitch: 'B', len: '20', axles: '2' } },
  { id: 't14', name: "14' Side-by-Side Toy Hauler", deck: "14' + 2' dovetail", gvwr: 6000, notes: 'Single 6,000-lb axle · brakes on all axles', vin: { body: 'T', hitch: 'B', len: '14', axles: '1' } },
  { id: 's16', name: "16' Small Car Hauler", deck: "16' — no dovetail", gvwr: 7000, notes: 'Tandem · no dovetail · brakes on all axles', vin: { body: 'S', hitch: 'B', len: '16', axles: '2' } },
  { id: 'g20', name: "20' Gooseneck Lowboy", deck: "20' + 2' dovetail", gvwr: 12000, notes: 'Gooseneck · brakes on all axles · over 10k: cert label only, no yellow placard', vin: { body: '', hitch: 'G', len: '20', axles: '' } }
];
TH.WS_LINES = ['Steel & framing', 'Decking', 'Paint & finish', 'Axle(s)', 'Tires & wheels', 'Coupler', 'Jack', 'Lights & wiring', 'Brakes', 'Hardware & fasteners', 'Other'];

TH.BODY = { U: 'Utility', C: 'Car hauler', E: 'Equipment', T: 'Toy hauler', S: 'Small car hauler' };
TH.HITCH = { B: 'Bumper pull', G: 'Gooseneck' };
/* 49 CFR 565.15 model-year codes (30-year cycle, no I O Q U Z 0). 2027 = V. Built as a table so it never runs out. */
TH.YEAR = (() => { const c = 'ABCDEFGHJKLMNPRSTVWXY123456789', t = {}; for (let y = 2027; y <= 2056; y++) t[c[(y - 2010) % 30]] = String(y); return t; })();
TH.FIRST_OFFER_DATE = '2026-12-19'; // 60-day clock from the Oct 20, 2026 Part 565 filing
TH.MODELS.find(m => m.id === 'c18').preset = { tireSize: 'ST225/75R15', psi: 65, placardNote: 'Production placard built Nov 14: 5"×3", ST225/75R15, 65 PSI, cargo 7,790 lb' };
/* Parts prices (Nov 15, 2026) from the supplier lineup: material only, no freight. Loaded once into blank
   Cost Worksheet lines by migrate(); never overwrites anything typed. Bump version to load a new set. */
TH.PARTS_PRICES = { version: '2026-11-15', prices: {
    u14: { 'Axle(s)': 572.98, 'Tires & wheels': 333.80, 'Coupler': 53.27, 'Jack': 37.58, 'Lights & wiring': 133.99, 'Other': 358.95 },
    u18: { 'Axle(s)': 1128.45, 'Tires & wheels': 667.60, 'Coupler': 61.86, 'Jack': 32.28, 'Lights & wiring': 133.99, 'Other': 369.94 },
    c18: { 'Axle(s)': 1374.09, 'Tires & wheels': 725.80, 'Coupler': 61.86, 'Jack': 69.16, 'Lights & wiring': 133.99, 'Other': 463.90 },
    e20: { 'Axle(s)': 1767.49, 'Tires & wheels': 819.24, 'Coupler': 93.29, 'Jack': 69.16, 'Lights & wiring': 197.99, 'Other': 523.90 },
    t14: { 'Axle(s)': 313.92, 'Tires & wheels': 417.46, 'Coupler': 61.86, 'Jack': 32.28, 'Lights & wiring': 133.99, 'Other': 392.67 },
    s16: { 'Axle(s)': 1128.45, 'Tires & wheels': 667.60, 'Coupler': 61.86, 'Jack': 32.28, 'Lights & wiring': 133.99, 'Other': 416.92 },
    g20: { 'Axle(s)': 965.67, 'Tires & wheels': 834.92, 'Coupler': 150.24, 'Jack': 362.02, 'Lights & wiring': 197.99, 'Other': 523.90 }
} };
/* Complete axle kits (Nov 15, 2026) from Trailer Parts Outlet (thetrailerpartsoutlet.com), shipping extra. Applied once by
   migrate() after PARTS_PRICES: whole kit price goes on 'Axle(s)' and the lines the kit replaces are blanked. A model is
   skipped entirely if any of those lines was changed from the baseline, so typed values are never touched. */
TH.KIT_PRICES = { version: '2026-11-15-kits', models: {
    t14: { price: 957.99, sku: '06SLDSMCKTTK9580655', name: '6000 lb TK Single Axle Trailer Parts Kit, Complete Original Series', axles: 1 },
    u18: { price: 1564.99, sku: '35DHDSMCKTTK6146545', name: '3500 lb Heavy Duty Tandem Axle TK Trailer kit, 7K capacity, Upgrade to Complete', axles: 2 },
    s16: { price: 1564.99, sku: '35DHDSMCKTTK6146545', name: '3500 lb Heavy Duty Tandem Axle TK Trailer kit, 7K capacity, Upgrade to Complete', axles: 2 }
}, lines: ['Axle(s)', 'Tires & wheels', 'Coupler', 'Jack', 'Lights & wiring', 'Other'] };
/* Husky tandem axle kit (Nov 15, 2026) from Husky Trailer Parts (huskytrailerstx.com): $619.99 list, 10% account-holder
   discount = $557.99. Axles, 10" electric brakes on both axles, springs, hangers, hardware (89" hub face, 5 on 4-1/2").
   Applied once by migrate() after KIT_PRICES: kit price on 'Axle(s)', the other lines back to the PARTS_PRICES baseline.
   A model is skipped unless its lines are still exactly what the kit load wrote or the untouched baseline. */
TH.HUSKY_PRICES = { version: '2026-11-15-husky', models: {
    u18: { price: 557.99, list: 619.99, sku: 'HT2B-35-89-545-E', name: 'Tandem Trailer Straight Axle Kit – 3,500 lbs – Two Axle Brake' },
    s16: { price: 557.99, list: 619.99, sku: 'HT2B-35-89-545-E', name: 'Tandem Trailer Straight Axle Kit – 3,500 lbs – Two Axle Brake' }
}, lines: ['Axle(s)', 'Tires & wheels', 'Coupler', 'Jack', 'Lights & wiring', 'Other'] };
/* Best prices (Nov 15, 2026) from the price hunt (best-prices-2026-11-15.csv): lowest verified running-gear prices,
   Husky with the 10% account discount, shipping/freight NOT included. Brakes are in each axle kit (Brakes line stays blank).
   'Other' = fenders + safety chains + breakaway kit + D-rings (same grouping as the baseline). Steel, decking, paint untouched.
   Applied once by migrate(): a line is replaced only if it is blank or still exactly what an earlier load wrote. */
TH.BEST_PRICES = { version: '2026-11-15-best', models: {
    u14: { lines: { 'Axle(s)': 329.00, 'Tires & wheels': 179.98, 'Coupler': 26.99, 'Jack': 31.67, 'Lights & wiring': 60.99, 'Other': 214.54 },
      vendors: 'Road Force axle kit (3,500 lb, electric brake); Husky tires/wheels, coupler, jack, breakaway; Hwy 96 lights and 9x32 fenders; TPO chains; Southwest Wheel D-rings',
      caveats: ['Husky 2K jack foot plate sold separately'] },
    u18: { lines: { 'Axle(s)': 557.99, 'Tires & wheels': 359.96, 'Coupler': 39.59, 'Jack': 32.28, 'Lights & wiring': 60.99, 'Other': 275.53 },
      vendors: 'Husky tandem 3,500 lb kit (brakes both axles), tires/wheels, coupler, breakaway; Southwest Wheel jack, fenders, D-rings; Hwy 96 lights; TPO chains',
      caveats: [] },
    c18: { lines: { 'Axle(s)': 777.59, 'Tires & wheels': 463.99, 'Coupler': 39.59, 'Jack': 58.99, 'Lights & wiring': 60.99, 'Other': 378.49 },
      vendors: 'Husky tandem 6,000 lb kit (12" brakes both axles), coupler, breakaway; TPO tires/wheels, drop-leg jack, chains; Hwy 96 lights; Southwest Wheel fenders, D-rings',
      caveats: [] },
    e20: { lines: { 'Axle(s)': 782.99, 'Tires & wheels': 617.99, 'Coupler': 39.59, 'Jack': 58.99, 'Lights & wiring': 60.99, 'Other': 438.49 },
      vendors: 'Husky tandem 7,000 lb kit (brakes both axles), coupler, breakaway; TPO tires/wheels, drop-leg jack, chains; Hwy 96 lights; Southwest Wheel fenders, D-rings',
      caveats: ['Coupler 14,000 lb = GVWR exactly, no margin', 'Conspicuity tape needed, not priced'] },
    t14: { lines: { 'Axle(s)': 425.00, 'Tires & wheels': 319.98, 'Coupler': 39.59, 'Jack': 32.28, 'Lights & wiring': 60.99, 'Other': 298.26 },
      vendors: 'Road Force 6,000 lb brake-axle kit; TPO tires/wheels, chains; Husky coupler, breakaway; Southwest Wheel jack, fenders, D-rings; Hwy 96 lights',
      caveats: ['Check fender fit (14-16" square pair priced; 9x32 would save about $29.74)'] },
    s16: { lines: { 'Axle(s)': 557.99, 'Tires & wheels': 359.96, 'Coupler': 39.59, 'Jack': 32.28, 'Lights & wiring': 60.99, 'Other': 322.51 },
      vendors: 'Husky tandem 3,500 lb kit (brakes both axles), tires/wheels, coupler, breakaway; Southwest Wheel jack, fenders, D-rings; Hwy 96 lights; TPO chains',
      caveats: [] },
    g20: { lines: { 'Axle(s)': 777.59, 'Tires & wheels': 617.99, 'Coupler': 143.99, 'Jack': 269.08, 'Lights & wiring': 60.99, 'Other': 438.49 },
      vendors: 'Husky tandem 6,000 lb kit (12" brakes both axles), gooseneck coupler, 12K jacks, breakaway; TPO tires/wheels, chains; Hwy 96 lights; Southwest Wheel fenders, D-rings',
      caveats: ['Springs rated 5,900 lb per axle; check against 12,000 GVWR (slipper option $845.99)', 'Conspicuity tape needed, not priced'] }
}, lines: ['Axle(s)', 'Tires & wheels', 'Coupler', 'Jack', 'Lights & wiring', 'Other'] };
