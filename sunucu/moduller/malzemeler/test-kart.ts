import { createHash } from 'node:crypto';

type Nesne = Record<string, unknown>;
const nesne = (v: unknown): Nesne => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Nesne) : {});

// Yalnız testler için: sunucunun sihirbaz kuralları (B11, 157 a) kartta türün zorunlu alanlarını ister. Testin kendi verdiği alan korunur.
// Hammaddenin boyu tohumdan (yoksa kart kimliğinden) türer: sunucunun kurduğu benzersiz anahtar her kartta ayrı, aynı tohumda aynı olur.
export const tohumOlcusu = (tohum: string): number => 1000 + (createHash('sha256').update(tohum).digest().readUInt32BE(0) % 1_000_000);

const G_ZORUNLU: Readonly<Record<string, (kimlik: string) => Nesne>> = {
  yarimamul: (k) => ({ ad: `Deneme parça ${k}`, tip: 'Torna parçası' }),
  mamul: (k) => ({ ad: `Deneme ürün ${k}` }),
  ticari_mal: (k) => ({ ad: `Deneme ticari mal ${k}` }),
  sarf: (k) => ({ kat: 'genel', tur: `Deneme ${k}` }),
  demirbas: (k) => ({ kat: 'diger', ad: `Deneme demirbaş ${k}`, alis: '2026-01-01' }),
  // Yön ayrı kuralın konusudur (MH1): testin kendi verdiği yön kalır, eksikse doldurulmaz.
  hizmet: () => ({ kat: 'fason', cesit: 'Talaşlı imalat' }),
};

export function tamKart<T extends Nesne>(kayit: T, tohum?: string): T {
  const kimlik = String(kayit['id'] ?? '');
  const tur = typeof kayit['tur'] === 'string' && kayit['tur'] !== '' ? kayit['tur'] : 'hammadde';
  if (tur === 'hammadde') {
    const olcu = 'form' in kayit ? {} : { form: 'cubuk', dims: { d: 20, l: tohumOlcusu(tohum ?? kimlik) } };
    return { fam: 'metal', grade: 'S235', ...olcu, ...kayit };
  }
  const ek = G_ZORUNLU[tur];
  if (!ek) return kayit;
  const g = { ...ek(tohum ?? kimlik), ...nesne(kayit['g']) };
  if (tur === 'sarf' && g['kat'] === 'kaynak' && g['sinif'] === undefined) g['sinif'] = 'Deneme sınıf';
  return { ...kayit, g };
}

// Kart kaydet gövdesi: kart ve bekleyen talebin önerdiği kart tamamlanır. Tohum ekranın anahtarıdır (yoksa kimlik): aynı anahtarlı
// gönderen iki test kartı sunucuda da aynı malzeme olur.
export function tamGovde(url: string, govde: unknown): unknown {
  if (!/^(\/api)?\/malzeme-katalogu-kartlari\/[^/]+\/kaydet$/.test(url) || typeof govde !== 'object' || govde === null) return govde;
  const g = govde as Nesne;
  const kayit = nesne(g['kayit']);
  if (!('kayit' in g) || Object.keys(kayit).length === 0) return govde;
  const anahtar = nesne(g['ozet'])['benzersiz_anahtar'];
  const tohum = typeof anahtar === 'string' && anahtar.trim() !== '' ? anahtar.trim() : String(kayit['id'] ?? '');
  const tam = tamKart(kayit, tohum);
  const talep = nesne(tam['talep']);
  if (Object.keys(nesne(talep['yeni'])).length) tam['talep'] = { ...talep, yeni: tamKart({ id: kayit['id'], ...nesne(talep['yeni']) }, tohum) };
  return { ...g, kayit: tam };
}
