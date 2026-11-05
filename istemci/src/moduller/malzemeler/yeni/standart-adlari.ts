// 2117: durum ve işlem değerlerinin ASTM ve EN adları. Kart seçilen değeri olduğu gibi saklar; eşli adlar yalnız gösterim ve aramadır.
// Taban tablo kullanıcının onayladığı listeyle dolar (2117-2); yönetici Ayarlar'dan ekler ve düzeltir (malzeme ayarı `standartAdlari`).

export type Standart = 'astm' | 'en';
export interface StandartAdi { astm?: string; en?: string }
export type StandartAdlari = Readonly<Record<string, StandartAdi>>;

// Eşleşme uydurulmaz: kullanıcının listesi gelene kadar boştur.
export const TABAN_STANDART_ADLARI: StandartAdlari = {};

const AD_SINIRI = 40;

function temizAd(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  const s = x.trim();
  return s && s.length <= AD_SINIRI ? s : undefined;
}

// Ayarda kayıtlı eşleşmeler; bozuk satır atlanır, boş ad yok sayılır. Ayar tabanın üstüne yazar.
export function ayardakiStandartAdlari(ayar: { [k: string]: unknown } | null | undefined): Record<string, StandartAdi> {
  const ham = ayar?.['standartAdlari'];
  const out: Record<string, StandartAdi> = {};
  if (!ham || typeof ham !== 'object' || Array.isArray(ham)) return out;
  for (const [deger, v] of Object.entries(ham as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const astm = temizAd((v as StandartAdi).astm);
    const en = temizAd((v as StandartAdi).en);
    if (astm || en) out[deger] = { ...(astm ? { astm } : {}), ...(en ? { en } : {}) };
  }
  return out;
}

export function standartAdlari(ayar: { [k: string]: unknown } | null | undefined): StandartAdlari {
  return { ...TABAN_STANDART_ADLARI, ...ayardakiStandartAdlari(ayar) };
}

// Seçili standardın adı önce, diğeri parantez içinde: "H1025 (P1070)". Tek ad varsa o; hiç yoksa değerin kendisi.
export function standartEtiketi(deger: string, adlar: StandartAdlari, tercih: Standart): string {
  const a = adlar[deger];
  if (!a) return deger;
  const birinci = tercih === 'astm' ? a.astm : a.en;
  const ikinci = tercih === 'astm' ? a.en : a.astm;
  if (birinci && ikinci) return birinci === ikinci ? birinci : `${birinci} (${ikinci})`;
  return birinci ?? ikinci ?? deger;
}

const kucuk = (s: string) => s.toLocaleLowerCase('tr');

// Değer, ASTM ve EN adlarının hepsinde arar.
export function standartlaEslesir(deger: string, adlar: StandartAdlari, aranan: string): boolean {
  const q = kucuk(aranan.trim());
  if (!q) return true;
  const a = adlar[deger];
  return [deger, a?.astm, a?.en].some((s) => s !== undefined && kucuk(s).includes(q));
}

// Katalog araması için: kartın değerlerinin eşli adları (değerin kendisi aranan alanlarda zaten var ya da yok; ikisi de eklenir).
export function aramaMetinleri(degerler: readonly unknown[], adlar: StandartAdlari): string[] {
  const out: string[] = [];
  for (const d of degerler) {
    if (typeof d !== 'string' || !d) continue;
    out.push(d);
    const a = adlar[d];
    if (a?.astm) out.push(a.astm);
    if (a?.en) out.push(a.en);
  }
  return out;
}

// Hızlı arama çekirdeği değerin parantezdeki kodunu ya da adını tanır; yazılan eşli ad (ör. P1070) bu koda çevrilir.
// Birden çok değere çıkan ad belirsizdir, çevrilmez.
export function esliAdlariCoz(metin: string, adlar: StandartAdlari): string {
  const hedef = new Map<string, string | null>();
  for (const [deger, a] of Object.entries(adlar)) {
    const kod = /\(([^)]+)\)/.exec(deger)?.[1]?.trim() ?? deger;
    for (const ad of [a.astm, a.en]) {
      if (!ad || /\s/.test(ad)) continue;
      const k = kucuk(ad);
      if (kucuk(kod) === k) continue;
      const onceki = hedef.get(k);
      hedef.set(k, onceki === undefined || onceki === kod ? kod : null);
    }
  }
  if (!hedef.size) return metin;
  return metin.split(/(\s+)/).map((p) => {
    const kod = hedef.get(kucuk(p).replace(/^\+/, ''));
    return kod ? kod : p;
  }).join('');
}

// Ayardaki eşleşmeyi yazar; iki ad da boşsa satır silinir. Yeni nesne döner.
export function standartAdiYaz<T extends { [k: string]: unknown }>(ayar: T, deger: string, ad: StandartAdi): T {
  const mevcut = ayardakiStandartAdlari(ayar);
  const astm = temizAd(ad.astm);
  const en = temizAd(ad.en);
  if (astm || en) mevcut[deger] = { ...(astm ? { astm } : {}), ...(en ? { en } : {}) };
  else delete mevcut[deger];
  return { ...ayar, standartAdlari: mevcut };
}

export { AD_SINIRI as STANDART_AD_SINIRI };
