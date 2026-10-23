// CNC kurulum kayıt deposunun saf kuralları.

// Yazma yalnız kayıt istemcinin bildiği sürümdeyse olur; null "kayıt hiç yok" demektir. Ortak kayıtta başkasının yazdığının
// üstüne yazılmaz.
export function surumUyarMi(mevcut: number | null, beklenen: number | null): boolean {
  return mevcut === beklenen;
}

// Metin biçimli değer dizedir; json biçiminde her JSON değeri geçer.
export function degerBicimeUyarMi(bicim: 'json' | 'metin', deger: unknown): boolean {
  return bicim === 'json' || typeof deger === 'string';
}

// PostgreSQL jsonb dizede U+0000 kabul etmez; bu değer sunucu hatası yerine doğrulama hatasıyla döner.
export function nulKarakteriVarMi(deger: unknown): boolean {
  return JSON.stringify(deger).includes('\\u0000');
}

// Değerin JSON metni UTF-8 bayt olarak bu sınırı aşamaz: köprü de 1 MB üstünü göndermez; uca doğrudan gelen büyük değer
// tabloyu şişirmesin (sızma testi B3).
export const DEGER_AZAMI_BAYT = 1_000_000;
export function degerCokBuyukMu(deger: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(deger)).length > DEGER_AZAMI_BAYT;
}

type Nesne = Record<string, unknown>;
const nesneMi = (d: unknown): d is Nesne => typeof d === 'object' && d !== null && !Array.isArray(d);

// Hazırlık onayı (yazma işlemi olmayan onaylayıcı): kayıtlı durumun yalnız hazırlık onay alanları (adım onayları, son onay,
// kalınan adım) gelen durumdan alınır; öteki her alan kayıtlı haliyle kalır. Biçime uymayan onay alanı null döner.
const HAZIRLIK_ONAY_ALANLARI = ['done', 'fin', 'at'] as const;

export function hazirlikOnaylariniBindir(kayitli: unknown, gelen: unknown): Nesne | null {
  if (!nesneMi(kayitli) || !nesneMi(gelen)) return null;
  const gelenHazirlik = gelen['prep'];
  if (!nesneMi(gelenHazirlik)) return null;
  const { done, fin, at } = gelenHazirlik;
  if (done !== undefined && !nesneMi(done)) return null;
  if (fin !== undefined && fin !== null && !nesneMi(fin)) return null;
  if (at !== undefined && typeof at !== 'number') return null;
  const hazirlik: Nesne = nesneMi(kayitli['prep']) ? { ...kayitli['prep'] } : {};
  for (const alan of HAZIRLIK_ONAY_ALANLARI) if (gelenHazirlik[alan] !== undefined) hazirlik[alan] = gelenHazirlik[alan];
  return { ...kayitli, prep: hazirlik };
}

export interface HazirlikOlayi { adim: string; olay: 'onay' | 'geri' | 'tamam'; imza: string | null }

// Son onay adımı prototipte ayrı alandadır (prep.fin); defterde bu adla durur.
export const SON_ONAY_ADIMI = 'final';
// Prototipte adım sayısı tezgâhın takım sayısıyla sınırlıdır (en çok 120 cep); fazlası bozuk ya da kötü niyetli gövdedir.
export const AZAMI_OLAY = 200;
const AZAMI_ADIM = 80;
const AZAMI_IMZA = 2000;

const hazirlikOf = (durum: unknown): Nesne => (nesneMi(durum) && nesneMi(durum['prep']) ? durum['prep'] : {});
const imzaMetni = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? '').slice(0, AZAMI_IMZA);
const sonImza = (h: Nesne): string | null => (nesneMi(h['fin']) ? imzaMetni(h['fin']['sig'] ?? '') : null);

// jsonb nesne anahtarlarını yeniden sıralar: karşılaştırma anahtar sırasından bağımsızdır. Değeri boş (null, false) adım onaysız sayılır.
const sirali = (d: unknown): unknown => (Array.isArray(d) ? d.map(sirali)
  : nesneMi(d) ? Object.fromEntries(Object.keys(d).sort().map((k) => [k, sirali(d[k])])) : d);
const onayIzi = (durum: unknown): string => {
  const h = hazirlikOf(durum);
  const done = Object.entries(nesneMi(h['done']) ? h['done'] : {}).filter(([, v]) => v !== null && v !== undefined && v !== false);
  return JSON.stringify(sirali({ done: Object.fromEntries(done), fin: nesneMi(h['fin']) ? h['fin'] : null }));
};

// Adım onayları ve son onay yalnız hazırlık onay ucundan değişir (kart #1583): genel yazma ucu kişiyi onaylayan diye deftere
// yazardı. Kalınan adım (at) gezintidir, onay değildir.
export function hazirlikOnaylariDegistiMi(onceki: unknown, yeni: unknown): boolean {
  return onayIzi(onceki) !== onayIzi(yeni);
}

export function onayVarMi(durum: unknown): boolean {
  return onayIzi(durum) !== onayIzi(null);
}

// Onay ucuna gelen gövde hiçbir hazırlık onay alanını değiştirmiyorsa kayıt yeniden yazılmaz.
export function hazirlikAyniMi(onceki: unknown, yeni: unknown): boolean {
  return !hazirlikOnaylariDegistiMi(onceki, yeni) && hazirlikOf(onceki)['at'] === hazirlikOf(yeni)['at'];
}

// Önceki ve yeni durumun hazırlık onaylarını karşılaştırır: yeni ya da imzası değişen onay "onay", kalkan onay "geri", son
// onay "tamam" olur. Adım adı sınırı aşan onay deftere girmez (prototip böyle ad üretmez).
export function hazirlikOlaylari(onceki: unknown, yeni: unknown): HazirlikOlayi[] {
  const a = hazirlikOf(onceki), b = hazirlikOf(yeni);
  const eskiOnay = nesneMi(a['done']) ? a['done'] : {}, yeniOnay = nesneMi(b['done']) ? b['done'] : {};
  const olaylar: HazirlikOlayi[] = [];
  for (const [adim, imza] of Object.entries(yeniOnay)) {
    if (adim.length === 0 || adim.length > AZAMI_ADIM || imza === null || imza === undefined || imza === false) continue;
    if (eskiOnay[adim] !== imza) olaylar.push({ adim, olay: 'onay', imza: imzaMetni(imza) });
  }
  for (const adim of Object.keys(eskiOnay)) {
    if (adim.length === 0 || adim.length > AZAMI_ADIM) continue;
    const kalan = yeniOnay[adim];
    if (kalan === undefined || kalan === null || kalan === false) olaylar.push({ adim, olay: 'geri', imza: null });
  }
  const eskiSon = sonImza(a), yeniSon = sonImza(b);
  if (yeniSon !== null && yeniSon !== eskiSon) olaylar.push({ adim: SON_ONAY_ADIMI, olay: 'tamam', imza: yeniSon });
  if (yeniSon === null && eskiSon !== null) olaylar.push({ adim: SON_ONAY_ADIMI, olay: 'geri', imza: null });
  return olaylar;
}

// Hazırlık sırası: prototip son onayı bütün adımlar onaylanmadan vermez (`prConfirm`). Son onayın imzası adım imzalarının
// sırayla birleşimidir (`prAllSig`): tezgâh, program, bağlama, çene, malzeme, sıfırlama, takımlar, soğutma, ölçüm, sarf ve
// parti adedi; her adımın onayı da o adımın imzasıdır. Takım adımlarını program belirler, sunucu programı okumaz: takım
// kesimi magazin onayına ya da takım onaylarının (T<n>) bir dizilişine eşit olmalıdır. Program, ham ölçü ve takım uygunluğu
// denetimleri (`prChecks`) ekranda kalır.
const SIRA_ONCE = ['machine', 'prog', 'fixture', 'jaw', 'material', 'zero'] as const;
const SIRA_SONRA = ['cool', 'gauges', 'cons'] as const;
const TAKIM_ADIMI = /^T\d+$/;
// Takım imzaları takım numarasını taşır, dizilişi tek anlamlıdır; sınır yalnız bozuk gövdeye karşıdır.
const AZAMI_DENEME = 10_000;

function takimDizilisiMi(kesim: string, imzalar: readonly string[]): boolean {
  let deneme = 0;
  const dene = (konum: number, kullanilan: ReadonlySet<number>): boolean => {
    for (const [i, imza] of imzalar.entries()) {
      if (kullanilan.has(i) || imza === '' || !kesim.startsWith(imza, konum)) continue;
      deneme += 1;
      if (deneme > AZAMI_DENEME) return false;
      const son = konum + imza.length;
      if (son === kesim.length) return true;
      if (kesim[son] === '#' && dene(son + 1, new Set([...kullanilan, i]))) return true;
    }
    return false;
  };
  return dene(0, new Set());
}

export function sonOnayAdimlariTamamMi(durum: unknown): boolean {
  const h = hazirlikOf(durum);
  const imza = nesneMi(h['fin']) ? h['fin']['sig'] : undefined;
  const done = nesneMi(h['done']) ? h['done'] : {};
  if (typeof imza !== 'string') return false;
  const onay = (adim: string): string | null => (typeof done[adim] === 'string' && done[adim] !== '' ? done[adim] : null);
  const once = SIRA_ONCE.map(onay), sonra = SIRA_SONRA.map(onay);
  if (once.includes(null) || sonra.includes(null)) return false;
  const adet = imza.lastIndexOf('#');
  if (adet < 0 || adet === imza.length - 1) return false;
  const govde = imza.slice(0, adet), bas = `${once.join('#')}#`, kuyruk = `#${sonra.join('#')}`;
  if (govde.length < bas.length + kuyruk.length || !govde.startsWith(bas) || !govde.endsWith(kuyruk)) return false;
  const takimlar = govde.slice(bas.length, govde.length - kuyruk.length);
  const magazin = onay('mag');
  if (magazin !== null && takimlar === magazin) return true;
  const takimImzalari = Object.keys(done).filter((a) => TAKIM_ADIMI.test(a)).map(onay).filter((i): i is string => i !== null);
  return takimDizilisiMi(takimlar, takimImzalari);
}

// Kural yalnız yeni verilen ya da imzası değişen son onaya uygulanır: kayıtlı son onay ve onayın geri alınması geçer.
export function sonOnaySiraDisiMi(onceki: unknown, yeni: unknown): boolean {
  const yeniSon = sonImza(hazirlikOf(yeni));
  return yeniSon !== null && yeniSon !== sonImza(hazirlikOf(onceki)) && !sonOnayAdimlariTamamMi(yeni);
}

// Üretim emri başına tutulan alanlar (kullanıcı kararı 17.10.2026, "Seçimler emre"): seçimler, parça bilgisi ve hazırlık
// onayları. Tezgâh ve malzeme tanımları, kütüphane, stok ve takım ömrü atölyede ortaktır, emirle değişmez.
export const EMIR_ALANLARI = ['machine', 'material', 'coolant', 'byType', 'wcs', 'tools', 'gauges', 'cons', 'meta', 'prep'] as const;
// "Kurulum tamam" seçimleri kapsar; hazırlık onayları kendi defter adımlarındadır.
const KURULUM_ALANLARI = EMIR_ALANLARI.filter((a) => a !== 'prep');
// "Kurulum tamam" defterde bu adla durur (hazırlık adımlarıyla karışmaz: prototip bu adı üretmez).
export const KURULUM_ADIMI = 'kurulum';

const sec = (d: Nesne, alanlar: readonly string[]): Nesne => Object.fromEntries(alanlar.filter((a) => d[a] !== undefined).map((a) => [a, d[a]]));
const disla = (d: Nesne, alanlar: readonly string[]): Nesne => Object.fromEntries(Object.entries(d).filter(([a]) => !alanlar.includes(a)));

export interface EmirAnligi { durum: Nesne; secim: unknown }

// Emirden çıkarken saklanan: durumun emir alanları ve "seçildi" işaretleri.
export function emirAnligi(durum: unknown, secim: unknown): EmirAnligi {
  return { durum: sec(nesneMi(durum) ? durum : {}, EMIR_ALANLARI), secim: secim ?? null };
}

// Emre geçince prototipin durumu: ortak alanlar kalır, emir alanları emrin saklanan anlığından gelir. Anlığı olmayan emirde
// seçim baştan başlar (emir alanları kalkar, prototip varsayılanlarını koyar; Parça No emirden). Hiç emir seçilmemişken
// yapılan seçimler ilk seçilen emre geçer; onaylar geçmez (defterde emirsiz verildiler).
export function emirDurumu(
  mevcut: unknown, secim: unknown, hedef: unknown, oncekiEmirVar: boolean, parcaNo: string,
): { durum: Nesne; secim: unknown } {
  const d = nesneMi(mevcut) ? mevcut : {};
  if (nesneMi(hedef) && nesneMi(hedef['durum'])) {
    return { durum: { ...disla(d, EMIR_ALANLARI), ...sec(hedef['durum'], EMIR_ALANLARI) }, secim: hedef['secim'] ?? null };
  }
  if (oncekiEmirVar) return { durum: { ...disla(d, EMIR_ALANLARI), meta: { part: parcaNo } }, secim: null };
  const meta = nesneMi(d['meta']) ? d['meta'] : {};
  const hazirlik = nesneMi(d['prep']) ? { ...d['prep'], done: {}, fin: null } : undefined;
  return { durum: { ...d, meta: { ...meta, part: parcaNo }, ...(hazirlik === undefined ? {} : { prep: hazirlik }) }, secim: secim ?? null };
}

// "Kurulum tamam" izi: emrin seçimleri, anahtar sırasından bağımsız. İz değişince tamam kaydı eskir.
export function kurulumIzi(durum: unknown): string {
  return JSON.stringify(sirali(sec(nesneMi(durum) ? durum : {}, KURULUM_ALANLARI)));
}

// ---- Takım ömrü (295 a). Cebin yükü kurulum tamamlanınca prototip durumundan çıkar: seçili tezgâhın magazini (`tools`) ve
// G-Kod simülasyonunun takım başına parça süresi (`gsim.perTool`, istasyon numarası 1'den başlar). Simülasyon başka tezgâhın
// programıysa süre bilinmez; takım yine yüklenir, yalnız adet sayılır.

export interface TakimYuku { cep: number; takimKimligi: string; takimAd: string; parcaBasiDk: number | null }

const BOS_CEPLER = new Set(['empty', 'probe']);
const AZAMI_CEP = 999;

export function kurulumYukleri(durum: unknown): TakimYuku[] {
  if (!nesneMi(durum) || !nesneMi(durum['tools'])) return [];
  const tezgah = durum['machine'];
  const magazin = typeof tezgah === 'string' ? durum['tools'][tezgah] : undefined;
  if (!Array.isArray(magazin)) return [];
  const sim = nesneMi(durum['gsim']) && durum['gsim']['machine'] === tezgah && nesneMi(durum['gsim']['perTool']) ? durum['gsim']['perTool'] : {};
  const yukler: TakimYuku[] = [];
  magazin.slice(0, AZAMI_CEP + 1).forEach((kimlik, cep) => {
    if (typeof kimlik !== 'string' || kimlik === '' || BOS_CEPLER.has(kimlik)) return;
    const s = sim[String(cep + 1)];
    const sure = nesneMi(s) && s['id'] === kimlik && typeof s['t'] === 'number' && Number.isFinite(s['t']) && s['t'] >= 0 ? s['t'] : null;
    const ad = nesneMi(s) && s['id'] === kimlik && typeof s['name'] === 'string' ? s['name'] : kimlik;
    yukler.push({ cep, takimKimligi: kimlik.slice(0, 200), takimAd: ad.slice(0, 200), parcaBasiDk: sure });
  });
  return yukler;
}

// Bir sayım farkının cep başına kullanımı: sağlam ve hurda parça takımı aynı tüketir; eksi fark geri alır.
export function sayimKullanimi(yuk: Pick<TakimYuku, 'parcaBasiDk'>, fark: number): { dk: number; adet: number } {
  return { dk: yuk.parcaBasiDk === null ? 0 : yuk.parcaBasiDk * fark, adet: fark };
}

// Takım değişimi kullanımı sıfırlar; düzeltme kullanımı farkla değiştirir, sıfırın altına indirmez (defter yalnız eklenir, fark
// yazılır). Cepte o takım yüklü değilse olay yazılmaz: ömür yalnız yüklü takımda tutulur. Aynı cebe sıradaki olaylar öncekinin
// üstüne kurulur. Fark binde bire yuvarlanır: kayan nokta kalıntısı deftere birikmez.
export type TakimOlayi =
  | { tur: 'degisim'; cep: number; takimKimligi: string }
  | { tur: 'duzeltme'; cep: number; takimKimligi: string; farkDk: number; farkAdet: number };

const bindeYuvarla = (n: number): number => Math.round(n * 1000) / 1000;

export function takimOlayiSatirlari(
  olaylar: readonly TakimOlayi[],
  yukler: readonly Pick<TakimYuku, 'cep' | 'takimKimligi'>[],
  kullanimlar: readonly { cep: number; dk: number; adet: number }[],
): { cep: number; takimKimligi: string; tur: 'degisim' | 'duzeltme'; dk: number; adet: number }[] {
  const yuklu = new Map(yukler.map((y) => [y.cep, y.takimKimligi]));
  const kullanim = new Map(kullanimlar.map((k) => [k.cep, { dk: k.dk, adet: k.adet }]));
  const satirlar: { cep: number; takimKimligi: string; tur: 'degisim' | 'duzeltme'; dk: number; adet: number }[] = [];
  for (const o of olaylar) {
    if (yuklu.get(o.cep) !== o.takimKimligi) continue;
    const simdi = kullanim.get(o.cep) ?? { dk: 0, adet: 0 };
    if (o.tur === 'degisim') {
      satirlar.push({ cep: o.cep, takimKimligi: o.takimKimligi, tur: 'degisim', dk: 0, adet: 0 });
      kullanim.set(o.cep, { dk: 0, adet: 0 });
      continue;
    }
    const dk = bindeYuvarla(Math.max(o.farkDk, -simdi.dk)), adet = bindeYuvarla(Math.max(o.farkAdet, -simdi.adet));
    if (dk === 0 && adet === 0) continue;
    satirlar.push({ cep: o.cep, takimKimligi: o.takimKimligi, tur: 'duzeltme', dk, adet });
    kullanim.set(o.cep, { dk: simdi.dk + dk, adet: simdi.adet + adet });
  }
  return satirlar;
}

export type TakimDurumu = 'ok' | 'warn' | 'crit' | 'over';

// Eşikler prototipin Takım Ömrü kartıyla aynıdır: kalan payı %50 altı uyarı, %20 altı kritik, sıfır ve altı doldu.
// Hedef yoksa durum bilinmez (null), sıfır uydurulmaz.
export function takimDurumu(kullanim: { dk: number; adet: number }, hedef: { omurDk: number | null; omurAdet: number | null }):
  { kalanPay: number; durum: TakimDurumu } | null {
  const pay = hedef.omurDk !== null ? (hedef.omurDk - kullanim.dk) / hedef.omurDk
    : hedef.omurAdet !== null ? (hedef.omurAdet - kullanim.adet) / hedef.omurAdet : null;
  if (pay === null) return null;
  const durum: TakimDurumu = pay <= 0 ? 'over' : pay < 0.2 ? 'crit' : pay < 0.5 ? 'warn' : 'ok';
  return { kalanPay: Math.max(0, Math.min(1, pay)), durum };
}

// Okurken prototipin Takım Ömrü kayıtları (`wear[tezgâh][cep]`) sunucu sayacıyla değiştirilir (301 a): kullanım yalnız üretim
// sayımından gelir. Cepte artık başka takım varsa sayaç bindirilmez; kaydın öteki alanları (takılma, kenar, bileme) korunur.
export function asinmaBindir(durum: unknown, sayaclar: readonly { cep: number; takimKimligi: string; kullanilanDk: number; kullanilanAdet: number }[]): unknown {
  if (!nesneMi(durum) || sayaclar.length === 0) return durum;
  const tezgah = durum['machine'];
  const magazin = typeof tezgah === 'string' && nesneMi(durum['tools']) ? durum['tools'][tezgah] : undefined;
  if (typeof tezgah !== 'string' || !Array.isArray(magazin)) return durum;
  const asinma: Nesne = nesneMi(durum['wear']) ? { ...durum['wear'] } : {};
  const kayitlar: Nesne = nesneMi(asinma[tezgah]) ? { ...asinma[tezgah] } : {};
  for (const s of sayaclar) {
    if (magazin[s.cep] !== s.takimKimligi) continue;
    const onceki = kayitlar[String(s.cep)];
    const ayni = nesneMi(onceki) && onceki['id'] === s.takimKimligi ? onceki : { since: null };
    kayitlar[String(s.cep)] = { ...ayni, id: s.takimKimligi, used: s.kullanilanDk, parts: s.kullanilanAdet };
  }
  asinma[tezgah] = kayitlar;
  return { ...durum, wear: asinma };
}

// Takım stoğu (153 a, 163 b): stok kartına bağlı kalemin adedi okurken stoğun kullanılabilir miktarıdır; kalemin kritik seviyesi
// ve yeri prototipte kalır, örnek işareti düşer. Stoğu hiç olmayan kart için adet null'dır (prototip "stok girilmemiş" der, sıfır
// uydurulmaz). `tmiStok` köprüye kalemin bağlı olduğunu söyler.
export interface StokKalemi { kimlik: string; malzemeId: number; kod: string; ad: string | null; miktar: string | null }
export function stokBindir(durum: unknown, kalemler: readonly StokKalemi[]): unknown {
  if (!nesneMi(durum) || kalemler.length === 0) return durum;
  const envanter: Nesne = nesneMi(durum['inv']) ? { ...durum['inv'] } : {};
  for (const k of kalemler) {
    const kayitli = envanter[k.kimlik];
    const onceki: Nesne = nesneMi(kayitli) ? { ...kayitli } : { min: 0, loc: '' };
    delete onceki['demo'];
    const miktar = k.miktar === null ? null : Number(k.miktar);
    envanter[k.kimlik] = { ...onceki, qty: miktar !== null && Number.isFinite(miktar) ? miktar : null, tmiStok: { malzemeId: k.malzemeId, kod: k.kod, ad: k.ad } };
  }
  return { ...durum, inv: envanter };
}

// 311 a: elle üretim kaydı (`wearLog`a yeni satır) üretim emrine gitmez; adet yalnız Üretim Terminali'nden girilir. Satır
// zamanıyla (`ts`) tanınır; geri alma (satır düşmesi) ve eski satırlar geçer.
export function elleUretimKaydiVarMi(onceki: unknown, yeni: unknown): boolean {
  const satirlar = (d: unknown): unknown[] => (nesneMi(d) && Array.isArray(d['wearLog']) ? d['wearLog'] : []);
  const zaman = (s: unknown): unknown => (nesneMi(s) ? s['ts'] : undefined);
  const eski = new Set(satirlar(onceki).map(zaman));
  return satirlar(yeni).some((s) => !eski.has(zaman(s)));
}
