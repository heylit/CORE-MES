// 2117: durum ve işlem değerlerinin ASTM ve EN adları. Kart seçilen değeri olduğu gibi saklar; eşli adlar yalnız gösterim ve aramadır.
// Taban tablo aşağıda; yönetici Ayarlar'dan ekler ve düzeltir (malzeme ayarı `standartAdlari`, tabanın üstüne yazar).

export type Standart = 'astm' | 'en';
export interface StandartAdi { astm?: string; en?: string }
export type StandartAdlari = Readonly<Record<string, StandartAdi>>;

// Taban tablo (2117-2, kullanıcı isteği 05.11): değer anahtardır, kart değeri değişmez. EN sütunu EN 10027-1 durum simgesi (çelik),
// EN 515 temperi (alüminyum), EN 1173 R sınıfı (bakır), EN 10088-3 +P koşulu (17-4PH) ya da ISO işlem standardıdır; ASTM sütunu ASTM
// belgelerindeki koşul adı ya da kodudur. Karşılığı olmayan taraf boştur (ör. H900'ün EN 10088-3'te karşılığı yok). Yönetici Ayarlar'dan düzeltir.
export const TABAN_STANDART_ADLARI: StandartAdlari = {
  'Sıcak hadde (+AR)': { astm: 'As-rolled', en: '+AR' },
  'Normalize hadde (+N)': { en: '+N normalized rolled' },
  'Normalize (+N)': { astm: 'Normalized', en: '+N' },
  'Termomekanik hadde (+M)': { astm: 'TMCP', en: '+M' },
  'Su verilmiş + temperlenmiş (+QT)': { astm: 'Quenched and tempered', en: '+QT' },
  'Gerilim giderilmiş': { astm: 'Stress relieved', en: '+SR' },
  'Soğuk hadde + tavlı (+A)': { astm: 'Cold rolled, annealed', en: '+A' },
  'Skin-pass': { astm: 'Temper rolled' },
  'Sıcak hadde': { astm: 'Hot rolled' },
  'Sıcak hadde + asitlenmiş': { astm: 'Hot rolled, pickled' },
  'Yumuşak tavlı (+A)': { astm: 'Annealed', en: '+A' },
  'Islah (+QT)': { astm: 'Quenched and tempered', en: '+QT' },
  'Soğuk çekilmiş (+C)': { astm: 'Cold drawn', en: '+C' },
  'Ferrit-perlit tavlı (+FP)': { en: '+FP' },
  'Soğuk kesme işlemli (+S)': { en: '+S' },
  'Küreselleştirme tavlı (+AC)': { astm: 'Spheroidize annealed', en: '+AC' },
  'Sertleştirilmiş + temperlenmiş': { astm: 'Hardened and tempered', en: '+QT' },
  'Soğuk hadde': { astm: 'Cold rolled' },
  'Soğuk çekme': { astm: 'Cold drawn', en: '+C' },
  'Ön sertleştirilmiş (~30 HRC)': { astm: 'Prehardened' },
  'ESR (elektro cüruf ergitme)': { astm: 'ESR' },
  'Nitrürlenmiş': { astm: 'Nitrided' },
  'Çözeltiye alınmış (+AT)': { astm: 'Solution annealed', en: '+AT' },
  'Tavlanmış (+A)': { astm: 'Annealed', en: '+A' },
  'Soğuk sertleştirilmiş (+C700)': { en: '+C700' },
  'Soğuk sertleştirilmiş (+C850)': { en: '+C850' },
  'Islah (+QT, martensitik)': { astm: 'Hardened and tempered', en: '+QT' },
  'Çökelme sertleştirilmiş (H900)': { astm: 'H900' },
  'Çökelme sertleştirilmiş (H1025)': { astm: 'H1025', en: '+P1070' },
  'Çökelme sertleştirilmiş (H1150)': { astm: 'H1150', en: '+P930' },
  'Soğuk çekilmiş': { astm: 'Cold drawn', en: '+C' },
  'Yaşlandırılmış (maraging)': { astm: 'Aged' },
  'F (üretim hâli)': { astm: 'F', en: 'F' },
  'O (tavlı)': { astm: 'O', en: 'O' },
  'F (döküm hâli)': { astm: 'F', en: 'F' },
  'H111': { astm: 'H111', en: 'H111' },
  'H112': { astm: 'H112', en: 'H112' },
  'H12': { astm: 'H12', en: 'H12' },
  'H14': { astm: 'H14', en: 'H14' },
  'H16': { astm: 'H16', en: 'H16' },
  'H18': { astm: 'H18', en: 'H18' },
  'H22': { astm: 'H22', en: 'H22' },
  'H24': { astm: 'H24', en: 'H24' },
  'H32': { astm: 'H32', en: 'H32' },
  'H34': { astm: 'H34', en: 'H34' },
  'H116': { astm: 'H116', en: 'H116' },
  'H321': { astm: 'H321', en: 'H321' },
  'H131': { astm: 'H131' },
  'T3': { astm: 'T3', en: 'T3' },
  'T351': { astm: 'T351', en: 'T351' },
  'T4': { astm: 'T4', en: 'T4' },
  'T5': { astm: 'T5', en: 'T5' },
  'T6': { astm: 'T6', en: 'T6' },
  'T651': { astm: 'T651', en: 'T651' },
  'T6511': { astm: 'T6511', en: 'T6511' },
  'T64': { astm: 'T64', en: 'T64' },
  'T66': { en: 'T66' },
  'T73': { astm: 'T73', en: 'T73' },
  'T7351': { astm: 'T7351', en: 'T7351' },
  'T7451': { astm: 'T7451', en: 'T7451' },
  'T87': { astm: 'T87' },
  'R200 (yumuşak)': { en: 'R200' },
  'R220': { en: 'R220' },
  'R240 (yarı sert)': { en: 'R240' },
  'R290 (sert)': { en: 'R290' },
  'R360': { en: 'R360' },
  'R430': { en: 'R430' },
  'R500': { en: 'R500' },
  'Tavlanmış': { astm: 'Annealed' },
  'Çözeltiye alınmış': { astm: 'Solution treated' },
  'Çözeltiye alınmış + yaşlandırılmış': { astm: 'Solution treated and aged' },
  'Döküm hâli': { astm: 'As cast' },
  'Ekstrüzyon': { astm: 'As extruded' },
  'Mill annealed': { astm: 'Mill annealed' },
  'Beta tavlı': { astm: 'Beta annealed' },
  'Çözeltiye alınmış + yaşlandırılmış (STA)': { astm: 'STA' },
  'HIP': { astm: 'HIP' },
  'Ferritik tavlı': { astm: 'Ferritic annealed' },
  'Normalize': { astm: 'Normalized' },
  'Östemperlenmiş (ADI)': { astm: 'ADI', en: 'ADI' },
  'Sinterlenmiş': { astm: 'As sintered' },
  'Sinterlenmiş + vakum tavlı': { astm: 'Sintered, vacuum annealed' },
  'Soğuk deforme (swaged)': { astm: 'Swaged' },
  'Gerilim giderme': { astm: 'Stress relieving' },
  'Normalizasyon': { astm: 'Normalizing', en: '+N' },
  'Islah': { astm: 'Quench and temper', en: '+QT' },
  'İndüksiyon sertleştirme': { astm: 'Induction hardening' },
  'Sementasyon': { astm: 'Carburizing' },
  'Nitrasyon': { astm: 'Nitriding' },
  'Nitrokarbürleme': { astm: 'Nitrocarburizing' },
  'Kriyojenik işlem': { astm: 'Cryogenic treatment' },
  'Bilyalı dövme (shot peening)': { astm: 'Shot peening' },
  'Pasivasyon': { astm: 'Passivation A967' },
  'Elektropolisaj': { astm: 'Electropolishing B912' },
  'Asitleme': { astm: 'Pickling' },
  'Fosfatlama': { astm: 'Phosphating', en: 'ISO 9717' },
  'Siyah oksit (karartma)': { astm: 'Black oxide' },
  'Sert krom': { astm: 'Hard chrome', en: 'ISO 6158' },
  'Kimyasal nikel': { astm: 'Electroless nickel B733', en: 'ISO 4527' },
  'Çinko-nikel kaplama': { astm: 'Zinc-nickel B841' },
  'PVD / CVD kaplama': { astm: 'PVD / CVD' },
  'Toz boya': { astm: 'Powder coating' },
  'Sert eloksal': { astm: 'Hard anodizing', en: 'ISO 10074' },
};

const AD_SINIRI = 40;

// 2117-1 b: standart kartın kaydındadır (`kayit.standart`); alanı olmayan eski kartta ASTM önce gelir.
export const kartStandardi = (x: { readonly [k: string]: unknown }): Standart => (x['standart'] === 'en' ? 'en' : 'astm');

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
