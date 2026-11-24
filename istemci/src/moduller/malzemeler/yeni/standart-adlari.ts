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
  'Normalize + temperlenmiş (+NT)': { astm: 'Normalized and tempered', en: '+NT' },
  'Soğuk hadde, tavsız (+C, tam sert)': { astm: 'Full hard', en: '+C' },
  'Islah + soğuk çekilmiş (+QT+C)': { en: '+QT+C' },
  'Islah + kabuk soyulmuş (+QT+SH)': { en: '+QT+SH' },
  'Sertleşebilirlik garantili (+H)': { astm: 'H-band', en: '+H' },
  'Yumuşak tavlı + soğuk çekilmiş (+A+C)': { astm: 'Annealed, cold drawn', en: '+A+C' },
  'Normalize + soğuk çekilmiş (+N+C)': { en: '+N+C' },
  'Küreselleştirme tavlı + soğuk çekilmiş (+AC+C)': { astm: 'Spheroidized, cold drawn', en: '+AC+C' },
  'Patentlenmiş (tel)': { astm: 'Patented' },
  'Vakumda sertleştirilmiş + temperlenmiş': { astm: 'Vacuum hardened and tempered', en: '+QT' },
  'Ön sertleştirilmiş (~40 HRC)': { astm: 'Prehardened ~40 HRC' },
  'Çökelme sertleştirilmiş (H925)': { astm: 'H925' },
  'Çökelme sertleştirilmiş (H950)': { astm: 'H950' },
  'Çökelme sertleştirilmiş (H1000)': { astm: 'H1000' },
  'Çökelme sertleştirilmiş (H1050)': { astm: 'H1050' },
  'Çökelme sertleştirilmiş (H1075)': { astm: 'H1075' },
  'Çökelme sertleştirilmiş (H1100)': { astm: 'H1100' },
  'Çökelme sertleştirilmiş (H1150D)': { astm: 'H1150D' },
  'Çökelme sertleştirilmiş (H1150M)': { astm: 'H1150M' },
  'Çökelme sertleştirilmiş (TH1050)': { astm: 'TH1050' },
  'Çökelme sertleştirilmiş (RH950)': { astm: 'RH950' },
  'Çökelme sertleştirilmiş (CH900)': { astm: 'CH900' },
  'Soğuk sertleştirilmiş (+C1000)': { en: '+C1000' },
  'Soğuk sertleştirilmiş (+C1150)': { en: '+C1150' },
  'Soğuk sertleştirilmiş (+C1300)': { en: '+C1300' },
  '¼ sert (ASTM A666)': { astm: '1/4 hard' },
  '½ sert (ASTM A666)': { astm: '1/2 hard' },
  '¾ sert (ASTM A666)': { astm: '3/4 hard' },
  'Tam sert (ASTM A666)': { astm: 'Full hard' },
  'Islah (+QT650)': { en: '+QT650' },
  'Islah (+QT700)': { en: '+QT700' },
  'Islah (+QT780)': { en: '+QT780' },
  'Islah (+QT800)': { en: '+QT800' },
  'Islah (+QT900)': { en: '+QT900' },
  'Tavlanmış + soğuk çekilmiş (+AT+C)': { astm: 'Annealed, cold drawn', en: '+AT+C' },
  'W (çözeltiye alınmış, kararsız)': { astm: 'W', en: 'W' },
  'TB00 (çözeltiye alınmış)': { astm: 'TB00' },
  'TD04 (çözelti + soğuk işlem)': { astm: 'TD04' },
  'TF00 (yaşlandırılmış)': { astm: 'TF00' },
  'TH04 (soğuk işlem + yaşlandırılmış)': { astm: 'TH04' },
  'M (üretim hâli)': { astm: 'As manufactured', en: 'M' },
  'D (çekilmiş)': { astm: 'As drawn', en: 'D' },
  'O60 (yumuşak tavlı)': { astm: 'O60' },
  'H01 (¼ sert)': { astm: 'H01' },
  'H02 (½ sert)': { astm: 'H02' },
  'H04 (sert)': { astm: 'H04' },
  'H06 (ekstra sert)': { astm: 'H06' },
  'H08 (yay sertliği)': { astm: 'H08' },
  'M30 (sıcak ekstrüzyon)': { astm: 'M30' },
  'TQ50 (su verilmiş + temperlenmiş)': { astm: 'TQ50' },
  'Yeniden kristalleşme tavlı (RA)': { astm: 'Recrystallization annealed' },
  'Soğuk işlenmiş + gerilim giderilmiş (CWSR)': { astm: 'CWSR' },
  'Çözeltiye alınmış (ST)': { astm: 'Solution treated' },
  'Çift tavlı (duplex annealed)': { astm: 'Duplex annealed' },
  'Yumuşak tavlama': { astm: 'Soft annealing', en: '+A' },
  'Tam tavlama': { astm: 'Full annealing' },
  'Küreselleştirme tavlaması': { astm: 'Spheroidize annealing', en: '+AC' },
  'Rekristalizasyon tavlaması': { astm: 'Recrystallization annealing' },
  'Homojenleştirme': { astm: 'Homogenizing' },
  'Vakum sertleştirme': { astm: 'Vacuum hardening' },
  'Martemperleme': { astm: 'Martempering' },
  'Östemperleme': { astm: 'Austempering' },
  'Çözeltiye alma': { astm: 'Solution treatment' },
  'Yaşlandırma (çökelme sertleştirme)': { astm: 'Precipitation hardening' },
  'Alevle sertleştirme': { astm: 'Flame hardening' },
  'Lazerle sertleştirme': { astm: 'Laser hardening' },
  'Karbonitrürleme': { astm: 'Carbonitriding' },
  'Plazma nitrürleme': { astm: 'Plasma nitriding' },
  'Tuz banyosu nitrokarbürleme (QPQ)': { astm: 'Salt bath nitrocarburizing (QPQ)' },
  'Borlama': { astm: 'Boriding' },
  'HIP (sıcak izostatik presleme)': { astm: 'HIP' },
  'Hidrojen gevrekliği giderme': { astm: 'Hydrogen embrittlement relief', en: 'ISO 9588' },
  'Kumlama': { astm: 'Abrasive blasting' },
  'Cam küre kumlama': { astm: 'Glass bead blasting' },
  'Vibrasyonlu yüzey bitirme': { astm: 'Vibratory finishing' },
  'Mekanik polisaj': { astm: 'Mechanical polishing' },
  'Honlama': { astm: 'Honing' },
  'Lepleme': { astm: 'Lapping' },
  'Süperfiniş': { astm: 'Superfinishing' },
  'Çinko fosfat': { astm: 'Zinc phosphate', en: 'ISO 9717' },
  'Mangan fosfat': { astm: 'Manganese phosphate', en: 'ISO 9717' },
  'Kromat dönüşüm kaplama': { astm: 'Chromate conversion MIL-DTL-5541' },
  'Krom(VI) içermeyen pasivasyon': { astm: 'Trivalent passivation' },
  'Eloksal (Tip II, sülfürik)': { astm: 'Anodize Type II', en: 'ISO 7599' },
  'Kromik asit eloksal (Tip I)': { astm: 'Anodize Type I' },
  'Mikro ark oksidasyon (MAO)': { astm: 'PEO / MAO' },
  'Çinko kaplama (elektrolitik)': { astm: 'Zinc plating B633', en: 'ISO 2081' },
  'Sıcak daldırma galvaniz': { astm: 'Hot-dip galvanizing A123', en: 'ISO 1461' },
  'Çinko lamel kaplama': { astm: 'Zinc flake coating', en: 'ISO 10683' },
  'Kadmiyum kaplama': { astm: 'Cadmium plating' },
  'Nikel kaplama (elektrolitik)': { astm: 'Nickel plating' },
  'Dekoratif krom': { astm: 'Decorative chrome' },
  'Bakır kaplama': { astm: 'Copper plating' },
  'Kalay kaplama': { astm: 'Tin plating' },
  'Gümüş kaplama': { astm: 'Silver plating' },
  'Altın kaplama': { astm: 'Gold plating' },
  'DLC kaplama': { astm: 'DLC' },
  'Termal sprey (HVOF / plazma)': { astm: 'Thermal spray' },
  'PTFE kaplama': { astm: 'PTFE coating' },
  'Yaş boya': { astm: 'Wet paint' },
  'Kataforez (KTL)': { astm: 'E-coat (KTL)' },
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

// 3633: yalnız seçili standardın adı görünür ("H1025"); seçili tarafın adı yoksa öteki ad, hiç yoksa değerin kendisi.
export function standartEtiketi(deger: string, adlar: StandartAdlari, tercih: Standart): string {
  const a = adlar[deger];
  if (!a) return deger;
  const birinci = tercih === 'astm' ? a.astm : a.en;
  const ikinci = tercih === 'astm' ? a.en : a.astm;
  return birinci ?? ikinci ?? deger;
}

// Seçim listesinde iki değer aynı adı alırsa (ör. iki değerin EN adı aynı) çip ayırt edilsin diye değerin kendisi eklenir.
export function secenekEtiketleri(degerler: readonly string[], adlar: StandartAdlari, tercih: Standart): Map<string, string> {
  const ham = degerler.map((v) => [v, standartEtiketi(v, adlar, tercih)] as const);
  const sayim = new Map<string, number>();
  for (const [, e] of ham) sayim.set(e, (sayim.get(e) ?? 0) + 1);
  return new Map(ham.map(([v, e]) => [v, (sayim.get(e) ?? 0) > 1 && e !== v ? `${e} - ${v}` : e]));
}

// 3633: eşdeğer anahtarı ve norm adı hangi standart ailesine ait: ASTM tarafı (ASTM, AMS, SAE, AISI, UNS, AA, MIL) ya da EN tarafı (EN, W.Nr).
// İki tarafa da girmeyen (ISO, DIN, JIS, GB, ticari adlar) tarafsızdır; seçili standart ne olursa olsun yerinde kalır.
export function standartTarafi(ad: string): Standart | null {
  if (/^(ASTM|AMS|SAE|MIL|AISI|UNS|AA\b|Döküm)/.test(ad)) return 'astm';
  if (/^(EN\b|W\.Nr)/.test(ad)) return 'en';
  return null;
}
const TARAF_SIRASI = (t: Standart | null, tercih: Standart): number => (t === tercih ? 0 : t === null ? 1 : 2);
// Seçili standardın tarafı önce, tarafsızlar sonra, öteki taraf en sonda; kendi içinde özgün sıra korunur. Hiçbir değer düşmez.
export function tarafSirala<T>(liste: readonly T[], tercih: Standart, ad: (x: T) => string): T[] {
  return liste.map((x, i) => [x, i] as const)
    .sort((a, b) => TARAF_SIRASI(standartTarafi(ad(a[0])), tercih) - TARAF_SIRASI(standartTarafi(ad(b[0])), tercih) || a[1] - b[1])
    .map(([x]) => x);
}
// Kalitenin ana normu: kart ASTM seçtiyse ve kalitenin norm listesinde ASTM tarafı varsa o, EN seçtiyse EN tarafı; yoksa kalitenin ana normu.
export function anaNorm(g: { readonly std?: string; readonly stds?: readonly string[] }, tercih: Standart): string {
  return (g.stds ?? []).find((x) => standartTarafi(x) === tercih) ?? g.std ?? '';
}
export function esdegerSirala(eq: Readonly<Record<string, string>> | undefined, tercih: Standart): Record<string, string> {
  return Object.fromEntries(tarafSirala(Object.entries(eq ?? {}), tercih, ([k]) => k));
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
