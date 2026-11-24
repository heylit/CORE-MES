import type { Nesne } from './tipler.ts';

// Sunucunun talep farkı (sunucu/moduller/malzemeler/kurallar.ts `kartYapraklari`) ile aynı kural: talep, geçmiş ve damgalar içerik
// değildir, stok kodunu veritabanı verir; türetilen alanlar aşağıda ayrılır; kalan her alan (kartın bütün yaprakları) değişiklik sayılır. Föy satırlarına bağlı olmadığı
// için kartta yeni bir alan açılınca ayrıca eklenmesi gerekmez.
const FARK_DISI_ALANLAR = ['talep', 'rev', 'updatedAt', 'onay', 'birlesen', 'mukerrerOnay', 'yerine'];

// Kayıtta ekranın türettiği alanlar (kodlariSabitle, finalAd): kullanıcı onları başka bir alandan değiştirir, o alan sayılır. Elle yazılan
// açıklama, kod ve ad föy farkında (`diffItems`), standart ayrı denetimde (sihirbaz/kaydet.ts) görülür.
const TUREV_ALANLAR = ['acManual', 'kodManual', 'adManual', 'standart'];
const TUREV_TICARI = ['kod', 'ad', 'tkod', 'ac1', 'ac2', 'ac3'];

const nesneMi = (v: unknown): v is Nesne => typeof v === 'object' && v !== null && !Array.isArray(v);

function kararli(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(kararli).join(',')}]`;
  if (nesneMi(v)) {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${kararli(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

function icerik(kart: Nesne): Nesne {
  const ic = Object.fromEntries(Object.entries(kart).filter(([k]) => !FARK_DISI_ALANLAR.includes(k) && !TUREV_ALANLAR.includes(k)));
  if (nesneMi(ic['com'])) {
    ic['com'] = Object.fromEntries(Object.entries(ic['com']).filter(([k]) => !TUREV_TICARI.includes(k)));
  }
  return ic;
}

export function kartIcerigiDegistiMi(onceki: Nesne, yeni: Nesne): boolean {
  return kararli(icerik(onceki)) !== kararli(icerik(yeni));
}
