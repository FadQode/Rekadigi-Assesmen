import { createHash } from 'node:crypto';
import { pool } from '../pool.ts';

const SEED = 0x5eed2026;

/** Deterministic PRNG so every run produces identical data. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function chance(probability: number): boolean {
  return rng() < probability;
}

/** Stable UUID-shaped identifier derived from a string. */
function uuidFromSeed(input: string): string {
  const hex = createHash('sha1').update(input).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function roundTo100(value: number): number {
  return Math.round(value / 100) * 100;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface CategoryDef {
  slug: string;
  name: string;
  parent: string | null;
}

const CATEGORY_DEFS: CategoryDef[] = [
  { slug: 'vehicles', name: 'Vehicles', parent: null },
  { slug: 'cars', name: 'Cars', parent: 'vehicles' },
  { slug: 'motorcycles', name: 'Motorcycles', parent: 'vehicles' },
  { slug: 'suv', name: 'SUV', parent: 'cars' },
  { slug: 'sedan', name: 'Sedan', parent: 'cars' },
  { slug: 'hatchback', name: 'Hatchback', parent: 'cars' },
  { slug: 'sport', name: 'Sport', parent: 'motorcycles' },
  { slug: 'scooter', name: 'Scooter', parent: 'motorcycles' },
];

interface SeedCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  depth: number;
}

function buildCategories(): SeedCategory[] {
  const pathBySlug = new Map<string, string>();
  const depthBySlug = new Map<string, number>();

  return CATEGORY_DEFS.map((def) => {
    const id = uuidFromSeed(`category:${def.slug}`);
    const parentId = def.parent ? uuidFromSeed(`category:${def.parent}`) : null;
    const parentPath = def.parent ? pathBySlug.get(def.parent) : undefined;
    const path = parentPath ? `${parentPath}/${def.slug}` : `/${def.slug}`;
    const depth = def.parent ? depthBySlug.get(def.parent)! + 1 : 0;
    pathBySlug.set(def.slug, path);
    depthBySlug.set(def.slug, depth);
    return { id, parentId, name: def.name, slug: def.slug, path, depth };
  });
}

// ---------------------------------------------------------------------------
// Filter attributes
// ---------------------------------------------------------------------------

type FilterType = 'enum' | 'range' | 'boolean';

interface FilterOption {
  value: string;
  label: string;
}

interface SeedFilter {
  slug: string;
  name: string;
  type: FilterType;
  options: FilterOption[];
}

const FILTERS: Record<string, SeedFilter[]> = {
  suv: [
    { slug: 'fuel_type', name: 'Fuel Type', type: 'enum', options: [
      { value: 'petrol', label: 'Petrol' },
      { value: 'diesel', label: 'Diesel' },
      { value: 'hybrid', label: 'Hybrid' },
      { value: 'electric', label: 'Electric' },
    ]},
    { slug: 'transmission', name: 'Transmission', type: 'enum', options: [
      { value: 'automatic', label: 'Automatic' },
      { value: 'manual', label: 'Manual' },
      { value: 'cvt', label: 'CVT' },
    ]},
    { slug: 'drivetrain', name: 'Drivetrain', type: 'enum', options: [
      { value: '2wd', label: '2WD' },
      { value: 'awd', label: 'AWD' },
      { value: '4wd', label: '4WD' },
    ]},
    { slug: 'price', name: 'Price', type: 'range', options: [] },
    { slug: 'mileage', name: 'Mileage', type: 'range', options: [] },
    { slug: 'year', name: 'Year', type: 'range', options: [] },
    { slug: 'warranty', name: 'Has Warranty', type: 'boolean', options: [] },
    { slug: 'accident_free', name: 'Accident Free', type: 'boolean', options: [] },
  ],
  sedan: [
    { slug: 'fuel_type', name: 'Fuel Type', type: 'enum', options: [
      { value: 'petrol', label: 'Petrol' },
      { value: 'diesel', label: 'Diesel' },
      { value: 'hybrid', label: 'Hybrid' },
      { value: 'electric', label: 'Electric' },
    ]},
    { slug: 'transmission', name: 'Transmission', type: 'enum', options: [
      { value: 'automatic', label: 'Automatic' },
      { value: 'manual', label: 'Manual' },
      { value: 'cvt', label: 'CVT' },
    ]},
    { slug: 'body_style', name: 'Body Style', type: 'enum', options: [
      { value: 'compact', label: 'Compact' },
      { value: 'mid_size', label: 'Mid-size' },
      { value: 'full_size', label: 'Full-size' },
    ]},
    { slug: 'price', name: 'Price', type: 'range', options: [] },
    { slug: 'mileage', name: 'Mileage', type: 'range', options: [] },
    { slug: 'year', name: 'Year', type: 'range', options: [] },
    { slug: 'sunroof', name: 'Sunroof', type: 'boolean', options: [] },
    { slug: 'leather_seats', name: 'Leather Seats', type: 'boolean', options: [] },
  ],
  hatchback: [
    { slug: 'fuel_type', name: 'Fuel Type', type: 'enum', options: [
      { value: 'petrol', label: 'Petrol' },
      { value: 'diesel', label: 'Diesel' },
      { value: 'electric', label: 'Electric' },
    ]},
    { slug: 'transmission', name: 'Transmission', type: 'enum', options: [
      { value: 'manual', label: 'Manual' },
      { value: 'automatic', label: 'Automatic' },
    ]},
    { slug: 'doors', name: 'Doors', type: 'enum', options: [
      { value: '3-door', label: '3-door' },
      { value: '5-door', label: '5-door' },
    ]},
    { slug: 'price', name: 'Price', type: 'range', options: [] },
    { slug: 'mileage', name: 'Mileage', type: 'range', options: [] },
    { slug: 'year', name: 'Year', type: 'range', options: [] },
    { slug: 'bluetooth', name: 'Bluetooth', type: 'boolean', options: [] },
  ],
  sport: [
    { slug: 'engine_cc', name: 'Engine Capacity', type: 'range', options: [] },
    { slug: 'top_speed', name: 'Top Speed', type: 'range', options: [] },
    { slug: 'price', name: 'Price', type: 'range', options: [] },
    { slug: 'mileage', name: 'Mileage', type: 'range', options: [] },
    { slug: 'year', name: 'Year', type: 'range', options: [] },
    { slug: 'abs', name: 'ABS', type: 'boolean', options: [] },
    { slug: 'quick_shifter', name: 'Quick Shifter', type: 'boolean', options: [] },
  ],
  scooter: [
    { slug: 'engine_cc', name: 'Engine Capacity', type: 'range', options: [] },
    { slug: 'price', name: 'Price', type: 'range', options: [] },
    { slug: 'mileage', name: 'Mileage', type: 'range', options: [] },
    { slug: 'year', name: 'Year', type: 'range', options: [] },
    { slug: 'electric', name: 'Electric', type: 'boolean', options: [] },
    { slug: 'under_seat_storage', name: 'Under-seat Storage', type: 'boolean', options: [] },
  ],
};

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

const COLORS = [
  'Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green',
  'Yellow', 'Orange', 'Brown', 'Beige', 'Maroon',
] as const;

const CITIES = [
  'Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Yogyakarta',
  'Makassar', 'Palembang', 'Denpasar', 'Tangerang', 'Bekasi', 'Depok',
] as const;

interface CatalogEntry {
  make: string;
  model: string;
}

interface ListingSpec {
  slug: string;
  count: number;
  catalog: CatalogEntry[];
  fuelTypes: string[];
  transmissions: string[];
  minYear: number;
  maxYear: number;
  minPrice: number;
  maxPrice: number;
  minMileage: number;
  maxMileage: number;
  attributes: () => Record<string, unknown>;
}

const LISTING_SPECS: ListingSpec[] = [
  {
    slug: 'suv',
    count: 250,
    catalog: [
      { make: 'Toyota', model: 'RAV4' }, { make: 'Toyota', model: 'Fortuner' },
      { make: 'Toyota', model: 'Land Cruiser' }, { make: 'Honda', model: 'CR-V' },
      { make: 'Honda', model: 'HR-V' }, { make: 'Ford', model: 'Everest' },
      { make: 'Ford', model: 'Explorer' }, { make: 'Hyundai', model: 'Tucson' },
      { make: 'Hyundai', model: 'Santa Fe' }, { make: 'Kia', model: 'Sportage' },
      { make: 'Kia', model: 'Sorento' }, { make: 'BMW', model: 'X3' },
      { make: 'BMW', model: 'X5' }, { make: 'Mercedes-Benz', model: 'GLC' },
      { make: 'Mercedes-Benz', model: 'GLE' }, { make: 'Audi', model: 'Q5' },
      { make: 'Audi', model: 'Q7' }, { make: 'Mitsubishi', model: 'Pajero Sport' },
      { make: 'Mazda', model: 'CX-5' }, { make: 'Mazda', model: 'CX-9' },
    ],
    fuelTypes: ['Petrol', 'Diesel', 'Hybrid', 'Electric'],
    transmissions: ['Automatic', 'Manual', 'CVT'],
    minYear: 2008, maxYear: 2025,
    minPrice: 15000, maxPrice: 80000,
    minMileage: 5000, maxMileage: 150000,
    attributes: () => ({
      drivetrain: pick(['2WD', 'AWD', '4WD'] as const),
      warranty: chance(0.7),
      accident_free: chance(0.85),
    }),
  },
  {
    slug: 'sedan',
    count: 250,
    catalog: [
      { make: 'Toyota', model: 'Camry' }, { make: 'Toyota', model: 'Corolla' },
      { make: 'Toyota', model: 'Vios' }, { make: 'Honda', model: 'Accord' },
      { make: 'Honda', model: 'Civic' }, { make: 'Honda', model: 'City' },
      { make: 'BMW', model: '3 Series' }, { make: 'BMW', model: '5 Series' },
      { make: 'Mercedes-Benz', model: 'C-Class' }, { make: 'Mercedes-Benz', model: 'E-Class' },
      { make: 'Audi', model: 'A4' }, { make: 'Audi', model: 'A6' },
      { make: 'Hyundai', model: 'Elantra' }, { make: 'Hyundai', model: 'Sonata' },
      { make: 'Kia', model: 'K5' }, { make: 'Kia', model: 'Cerato' },
      { make: 'Mazda', model: '3' }, { make: 'Mazda', model: '6' },
      { make: 'Nissan', model: 'Altima' }, { make: 'Volkswagen', model: 'Passat' },
    ],
    fuelTypes: ['Petrol', 'Diesel', 'Hybrid', 'Electric'],
    transmissions: ['Automatic', 'Manual', 'CVT'],
    minYear: 2008, maxYear: 2025,
    minPrice: 10000, maxPrice: 60000,
    minMileage: 5000, maxMileage: 160000,
    attributes: () => ({
      body_style: pick(['compact', 'mid_size', 'full_size'] as const),
      sunroof: chance(0.4),
      leather_seats: chance(0.5),
    }),
  },
  {
    slug: 'hatchback',
    count: 150,
    catalog: [
      { make: 'Toyota', model: 'Yaris' }, { make: 'Toyota', model: 'Agya' },
      { make: 'Honda', model: 'Jazz' }, { make: 'Honda', model: 'Brio' },
      { make: 'Suzuki', model: 'Swift' }, { make: 'Ford', model: 'Fiesta' },
      { make: 'Ford', model: 'Focus' }, { make: 'Hyundai', model: 'i20' },
      { make: 'Hyundai', model: 'i30' }, { make: 'Kia', model: 'Rio' },
      { make: 'Kia', model: 'Picanto' }, { make: 'Mazda', model: '2' },
      { make: 'Volkswagen', model: 'Golf' }, { make: 'Volkswagen', model: 'Polo' },
      { make: 'Nissan', model: 'March' }, { make: 'Mini', model: 'Cooper' },
    ],
    fuelTypes: ['Petrol', 'Diesel', 'Electric'],
    transmissions: ['Manual', 'Automatic'],
    minYear: 2008, maxYear: 2025,
    minPrice: 6000, maxPrice: 30000,
    minMileage: 5000, maxMileage: 160000,
    attributes: () => ({
      doors: pick(['3-door', '5-door'] as const),
      bluetooth: chance(0.75),
    }),
  },
  {
    slug: 'sport',
    count: 200,
    catalog: [
      { make: 'Yamaha', model: 'YZF-R1' }, { make: 'Yamaha', model: 'YZF-R6' },
      { make: 'Yamaha', model: 'MT-07' }, { make: 'Yamaha', model: 'MT-09' },
      { make: 'Kawasaki', model: 'Ninja ZX-6R' }, { make: 'Kawasaki', model: 'Ninja ZX-10R' },
      { make: 'Kawasaki', model: 'Ninja 650' }, { make: 'Honda', model: 'CBR600RR' },
      { make: 'Honda', model: 'CBR1000RR' }, { make: 'Honda', model: 'CBR650R' },
      { make: 'Suzuki', model: 'GSX-R750' }, { make: 'Suzuki', model: 'GSX-R1000' },
      { make: 'Ducati', model: 'Panigale V2' }, { make: 'Ducati', model: 'Panigale V4' },
      { make: 'Ducati', model: 'Monster' }, { make: 'BMW', model: 'S 1000 RR' },
    ],
    fuelTypes: ['Petrol'],
    transmissions: ['Manual'],
    minYear: 2010, maxYear: 2025,
    minPrice: 8000, maxPrice: 35000,
    minMileage: 1000, maxMileage: 60000,
    attributes: () => ({
      engine_cc: pick([600, 650, 750, 1000, 1100] as const),
      top_speed: randInt(220, 320),
      abs: chance(0.9),
      quick_shifter: chance(0.5),
    }),
  },
  {
    slug: 'scooter',
    count: 150,
    catalog: [
      { make: 'Honda', model: 'PCX' }, { make: 'Honda', model: 'ADV150' },
      { make: 'Honda', model: 'Vario' }, { make: 'Honda', model: 'Beat' },
      { make: 'Yamaha', model: 'NMAX' }, { make: 'Yamaha', model: 'Mio' },
      { make: 'Yamaha', model: 'XMAX' }, { make: 'Vespa', model: 'Primavera' },
      { make: 'Vespa', model: 'Sprint' }, { make: 'Vespa', model: 'GTS' },
      { make: 'Suzuki', model: 'Address' }, { make: 'Suzuki', model: 'Nex' },
      { make: 'SYM', model: 'Jet X' }, { make: 'Piaggio', model: 'Liberty' },
    ],
    fuelTypes: ['Petrol', 'Electric'],
    transmissions: ['Automatic'],
    minYear: 2012, maxYear: 2025,
    minPrice: 1500, maxPrice: 7000,
    minMileage: 500, maxMileage: 50000,
    attributes: () => ({
      engine_cc: pick([110, 125, 150, 155, 300] as const),
      electric: chance(0.25),
      under_seat_storage: chance(0.8),
    }),
  },
];

function pickStatus(): string {
  const roll = rng();
  if (roll < 0.85) return 'available';
  if (roll < 0.95) return 'sold';
  if (roll < 0.98) return 'pending';
  return 'removed';
}

// ---------------------------------------------------------------------------
// SQL building
// ---------------------------------------------------------------------------

interface Column {
  name: string;
  cast?: string;
}

function buildInsert(table: string, columns: Column[], rows: unknown[][]): { text: string; values: unknown[] } {
  const columnList = columns.map((c) => c.name).join(', ');
  const placeholders = rows
    .map((_, rowIndex) => {
      const offset = rowIndex * columns.length;
      const params = columns
        .map((c, colIndex) => `$${offset + colIndex + 1}${c.cast ? `::${c.cast}` : ''}`)
        .join(', ');
      return `(${params})`;
    })
    .join(',\n');
  return { text: `INSERT INTO ${table} (${columnList}) VALUES\n${placeholders}`, values: rows.flat() };
}

// ---------------------------------------------------------------------------
// Seed flow
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const categories = buildCategories();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const categoryRows = categories.map((c) => [c.id, c.parentId, c.name, c.slug, c.path, c.depth]);
  const categorySql = buildInsert(
    'categories',
    [
      { name: 'id' },
      { name: 'parent_id' },
      { name: 'name' },
      { name: 'slug' },
      { name: 'path' },
      { name: 'depth' },
    ],
    categoryRows,
  );
  categorySql.text +=
    '\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, parent_id = EXCLUDED.parent_id, path = EXCLUDED.path, depth = EXCLUDED.depth';

  const filterRows: unknown[][] = [];
  for (const [categorySlug, filters] of Object.entries(FILTERS)) {
    const category = categoryBySlug.get(categorySlug);
    if (!category) continue;
    for (const filter of filters) {
      filterRows.push([
        uuidFromSeed(`filter:${categorySlug}:${filter.slug}`),
        category.id,
        filter.name,
        filter.slug,
        filter.type,
        JSON.stringify(filter.options),
      ]);
    }
  }
  const filterSql = buildInsert(
    'filter_attributes',
    [
      { name: 'id' },
      { name: 'category_id' },
      { name: 'name' },
      { name: 'slug' },
      { name: 'type' },
      { name: 'options', cast: 'jsonb' },
    ],
    filterRows,
  );
  filterSql.text +=
    '\nON CONFLICT (category_id, slug) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, options = EXCLUDED.options';

  const listingColumns: Column[] = [
    { name: 'id' },
    { name: 'category_id' },
    { name: 'title' },
    { name: 'description' },
    { name: 'make' },
    { name: 'model' },
    { name: 'year' },
    { name: 'mileage' },
    { name: 'price' },
    { name: 'condition' },
    { name: 'transmission' },
    { name: 'fuel_type' },
    { name: 'color' },
    { name: 'city' },
    { name: 'status' },
    { name: 'images', cast: 'jsonb' },
    { name: 'attributes', cast: 'jsonb' },
  ];

  const listingRows: unknown[][] = [];
  let listingIndex = 0;

  for (const spec of LISTING_SPECS) {
    const category = categoryBySlug.get(spec.slug)!;
    for (let i = 0; i < spec.count; i++) {
      const id = uuidFromSeed(`listing:${listingIndex}`);
      const entry = pick(spec.catalog);
      const year = randInt(spec.minYear, spec.maxYear);
      const isNew = chance(0.08);
      const condition = isNew ? 'New' : chance(0.15) ? 'Certified' : 'Used';
      const mileage = isNew ? randInt(0, 500) : randInt(spec.minMileage, spec.maxMileage);
      const price = roundTo100(randInt(spec.minPrice, spec.maxPrice));
      const transmission = pick(spec.transmissions);
      const fuelType = pick(spec.fuelTypes);
      const color = pick(COLORS);
      const city = pick(CITIES);
      const status = pickStatus();

      const title = `${year} ${entry.make} ${entry.model}`;
      const description =
        `${condition} ${year} ${entry.make} ${entry.model} in ${color}, ` +
        `${mileage.toLocaleString('en-US')} km, ${transmission}, ${fuelType}. ` +
        `Well maintained with full service history and clean documents.`;

      const imageCount = randInt(1, 4);
      const images = Array.from(
        { length: imageCount },
        (_, n) => `https://cdn.rekadigi.example/${id}/${n + 1}.jpg`,
      );

      const attributes = spec.attributes();

      listingRows.push([
        id,
        category.id,
        title,
        description,
        entry.make,
        entry.model,
        year,
        mileage,
        price,
        condition,
        transmission,
        fuelType,
        color,
        city,
        status,
        JSON.stringify(images),
        JSON.stringify(attributes),
      ]);
      listingIndex++;
    }
  }

  const listingSql = buildInsert('listings', listingColumns, listingRows);
  listingSql.text += '\nON CONFLICT (id) DO NOTHING';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(categorySql.text, categorySql.values);
    await client.query(filterSql.text, filterSql.values);
    await client.query(listingSql.text, listingSql.values);
    await client.query(
      `UPDATE listings
       SET search_vector = to_tsvector('english',
         title || ' ' || COALESCE(description, '') || ' ' || make || ' ' || model ||
         ' ' || COALESCE(color, '') || ' ' || city)
       WHERE search_vector IS NULL`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const totalFilters = Object.values(FILTERS).reduce((sum, filters) => sum + filters.length, 0);
  console.log(
    `Seeded ${categories.length} categories, ${totalFilters} filter attributes, ${listingRows.length} listings`,
  );
}

try {
  await seed();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
