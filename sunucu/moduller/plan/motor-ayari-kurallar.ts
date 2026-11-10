import { MOTOR_AYARI_VARSAYILAN, motorAyarlari, type MotorAyarlari } from '#paylasilan/sozlesme/plan.ts';
import type { OgrenilenSure } from './ogrenme-kurallar.ts';

// Plan motoru ayarları (kart 811), saf. Sürüm satırının değerleri jsonb'dir: sonradan eklenen anahtar eski satırda yoktur, o anahtar
// koddaki varsayılanı alır; tanınmayan değer de varsayılana düşer (satır değiştirilemez, düzeltilemez).
export function motorAyariCoz(degerler: Record<string, unknown> | null): MotorAyarlari {
  const sonuc = { ...MOTOR_AYARI_VARSAYILAN };
  if (degerler === null) return sonuc;
  for (const k of Object.keys(MOTOR_AYARI_VARSAYILAN) as (keyof MotorAyarlari)[]) {
    const r = motorAyarlari.shape[k].safeParse(degerler[k]);
    if (r.success) Object.assign(sonuc, { [k]: r.data });
  }
  return sonuc;
}

// Verilen alanlar güncelin üstüne yazılır; değişen yoksa boş (yeni sürüm yazılmaz).
export function motorAyariBirlestir(guncel: MotorAyarlari, g: Partial<MotorAyarlari>): MotorAyarlari | null {
  const yeni = { ...guncel };
  for (const k of Object.keys(guncel) as (keyof MotorAyarlari)[]) if (g[k] !== undefined) Object.assign(yeni, { [k]: g[k] });
  return motorAyariEsit(guncel, yeni) ? null : yeni;
}

export const motorAyariEsit = (a: MotorAyarlari, b: MotorAyarlari): boolean =>
  (Object.keys(a) as (keyof MotorAyarlari)[]).every((k) => a[k] === b[k]);

// Motor ayarı planlama çalışmasının üstüne yazılır (771 a, 776 b): TL amacını kayıttaki D.planTL.amac açar ('tl'; durum.betik ymUygula),
// sıralı ayarda kayıt ne derse desin kapalıdır; sıralama kuralı w.rule'dur (girdi.betik stKur). Girdi birleşmesi D'yi Reçete ve Rota kaydından
// yeniden kurunca planTL düşebilir: amaç w.amac ile de gider, motor onu kayıttakinin önüne koyar (durum.betik ymUygula). Okunan kopya değişir;
// sayfa kaydederse kayıt da bunları taşır, motor yine ayarı okur.
// 1383 a: finansman oranı finansın TRY faizinden gelir (günlük yüzde, finansmanın tek tanımıyla); motor ve planlama sayfası onu
// D.planAgirlik.fin'de okur (durum.betik agAyar). Finansta TRY faizi yoksa (null) çalışma kaydındaki oran kalır; plan bedel ayarının elle
// finansman oranı 1448 a ile salt okunurdur ve buraya gelmez.
// 1477 a: motorun ufku ve dilimi sistem ayarındandır; motor w.ufukGun ve w.dilimDk'yı okur (engine.betik olcekKur;
// girdi birleşmesi D'yi yeniden kurar, w kalır). Verilmezse kayıttaki kalır.
export interface MotorOlcegi { ufukGun: number; dilimDk: number }
// 1714 (1684 b): öğrenme açıksa ürün ve adım başına süre belirsizliği çalışmanın `ogren` alanıyla gider (girdi.betik stKur motora verir);
// kapalıysa alan boştur, motor varsayılan belirsizlikle (w.mcSigma) kurar. Kayıttan okuyan girdi değeri hep açıkça verir (yoksa null):
// sayfa kaydederse kayda geçen eski değer sonraki planda kullanılmaz. Verilmezse (undefined) çalışmadaki değer korunur; taslağın kendi
// ayar sürümüyle ikinci kez uygulanan çözücü girdisi (plan-cozucusu) taze değeri böyle taşır, taslakta öğrenme kapalıysa boşaltır.
// 2523 a: paralel bölme ayarı kayıttaki param.bolmeKip ve param.bolmeMaks'ın üstüne yazılır (girdi.betik stKur okur); sayfanın eski
// kaydındaki değer motoru yönetmez. Sabit kip (plan-cozucusu bolmesiz) bundan sonra uygulanır, orada bölme yine kapalıdır.
// 2601 a: genel gider saat başı tutarı Finans'ın o güne geçerli oranıdır (proje maliyetiyle tek tanım); motor ve sayfa D.planTL.genelGider'i
// okur (durum.betik ymAyar). Finans'ta oran yoksa null (bilinmiyor): elle girilmiş değer kullanılmaz. Verilmezse (undefined) çalışmadaki kalır.
// 2668 a: oran gizliyse genelGider null ve genelGiderGizli true yazılır (motor null'ı 0 sayar; ekran "gizli" gösterir); açık oranda false.
// 2601 a, Güvenlik K1: genel gider her okumada Finans'tan (ya da okuyamayana null) yazıldığı için kayda girmez; sayfa çalışmanın tamamını
// geri yazdığında oran kayıtta kalıp planlama kaydını okuyan herkese gitmesin diye yazmada ve ham kayıt okumasında çıkarılır.
export function genelGiderAlanlariniCikar(calisma: unknown): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const D = (calisma as { D?: unknown }).D;
  if (D === null || typeof D !== 'object') return calisma;
  const planTL = (D as { planTL?: unknown }).planTL;
  if (planTL === null || typeof planTL !== 'object' || !('genelGider' in planTL || 'genelGiderGizli' in planTL)) return calisma;
  const { genelGider: _g, genelGiderGizli: _z, ...kalan } = planTL as Record<string, unknown>;
  return { ...calisma, D: { ...D, planTL: kalan } };
}

// 2728 a: planlama brüt ücret saklamaz (Giderler dolaylı personel kartı, ek mesai planının kişi ücreti). Gelen çalışma brüt taşısa da
// kayda girmez ve planlama kaydını okuyan kimseye dönmez; brütsüz alanlar (ad, SGK oranı, aylık saat) aynen kalır.
export function brutAlanlariniCikar(calisma: unknown): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const D = (calisma as { D?: unknown }).D;
  if (D === null || typeof D !== 'object') return calisma;
  const nesne = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
  const brutsuz = (x: unknown): unknown => { if (!nesne(x) || !('brut' in x)) return x; const { brut: _b, ...kalan } = x; return kalan; };
  const yeni: Record<string, unknown> = { ...(D as Record<string, unknown>) };
  const ms = yeni['maliyetSis'];
  if (nesne(ms) && Array.isArray(ms['dolayli'])) yeni['maliyetSis'] = { ...ms, dolayli: ms['dolayli'].map(brutsuz) };
  const mes = yeni['mesaiSis'];
  if (nesne(mes) && nesne(mes['ucret'])) yeni['mesaiSis'] = { ...mes, ucret: Object.fromEntries(Object.entries(mes['ucret']).map(([k, v]) => [k, brutsuz(v)])) };
  return { ...calisma, D: yeni };
}

// 2742 (Güvenlik Ek): ek mesai saat değeri (D.mesaiSaat) yalnız değerlendirmenin iş parçacığı girdisinde yaşar; istemci gönderse de kayda
// girmez, okuyana dönmez.
export function mesaiSaatiniCikar(calisma: unknown): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const D = (calisma as { D?: unknown }).D;
  if (D === null || typeof D !== 'object' || !('mesaiSaat' in D)) return calisma;
  const { mesaiSaat: _m, ...kalan } = D as Record<string, unknown>;
  return { ...calisma, D: kalan };
}

// 2772 M2 (Güvenlik O2, 2601 a): tezgâhın saat ücreti Finans'ın istasyon saat maliyetidir (girdi.js ucretIzle). Kayda yazılmaz; maliyeti
// gören her açılışta Finans'tan yeniden alır, görmeyenin hesabında boştur.
export function tezgahUcretiniCikar(calisma: unknown): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const D = (calisma as { D?: unknown }).D;
  if (D === null || typeof D !== 'object' || !Array.isArray((D as { tezgahlar?: unknown }).tezgahlar)) return calisma;
  const tezgahlar = (D as { tezgahlar: unknown[] }).tezgahlar;
  const ucretli = (t: unknown): t is Record<string, unknown> => t !== null && typeof t === 'object' && ('ucret' in t || 'ucretIst' in t);
  if (!tezgahlar.some(ucretli)) return calisma;
  return { ...calisma, D: { ...D, tezgahlar: tezgahlar.map((t) => { if (!ucretli(t)) return t; const { ucret: _u, ucretIst: _i, ...kalan } = t; return kalan; }) } };
}

// Planlama kaydına yazılmayan ve ham okumada dönmeyen alanlar tek yerden (2601 a genel gider ve tezgâh ücreti, 2728 a brüt, 2742 mesai saat değeri).
export const saklanmayanAlanlariCikar = (calisma: unknown): unknown =>
  tezgahUcretiniCikar(mesaiSaatiniCikar(brutAlanlariniCikar(genelGiderAlanlariniCikar(calisma))));

// 2747 (Güvenlik): planlama anahtarına yeni yazma yalnız json'dur; eski metin biçimli satır (geçmiş sürüm dahil) JSON metniyse ayrıştırılıp
// aynı süzgeçten geçer ve yine metin olarak döner. JSON olmayan metin yapılı alan taşımaz, olduğu gibi kalır.
export function saklanmayanKayitDegeri(bicim: string, deger: unknown): unknown {
  if (bicim === 'json') return saklanmayanAlanlariCikar(deger);
  if (bicim !== 'metin' || typeof deger !== 'string') return deger;
  let c: unknown;
  try { c = JSON.parse(deger) as unknown; } catch { return deger; }
  const s = saklanmayanAlanlariCikar(c);
  return s === c ? deger : JSON.stringify(s);
}

// 2772 (Güvenlik O1, 2601 a, K3): planın TL toplamı (plan.ozet.tl) motorun maliyet görenin girdisiyle (genel gider, İK ek mesai değeri,
// istasyon maliyeti) kurduğu toplamdır; kayıtta kalır, yalnız finans.maliyet-oku olana döner. Başka alana dokunulmaz.
export function planTlToplaminiCikar(calisma: unknown): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const plan = (calisma as { plan?: unknown }).plan;
  if (plan === null || typeof plan !== 'object') return calisma;
  const ozet = (plan as { ozet?: unknown }).ozet;
  if (ozet === null || typeof ozet !== 'object' || !('tl' in ozet)) return calisma;
  const { tl: _t, ...kalan } = ozet as Record<string, unknown>;
  return { ...calisma, plan: { ...plan, ozet: kalan } };
}
export function maliyetsizKayitDegeri(bicim: string, deger: unknown): unknown {
  const s = saklanmayanKayitDegeri(bicim, deger);
  if (bicim === 'json') return planTlToplaminiCikar(s);
  if (bicim !== 'metin' || typeof s !== 'string') return s;
  let c: unknown;
  try { c = JSON.parse(s) as unknown; } catch { return s; }
  const t = planTlToplaminiCikar(c);
  return t === c ? s : JSON.stringify(t);
}

export function calismayaMotorAyari(
  calisma: unknown, ayar: MotorAyarlari, finansmanOraniGun: number | null = null, olcek: MotorOlcegi | null = null,
  ogren?: Readonly<Record<string, OgrenilenSure>> | null, genelGider?: { saatBasi: number | null; gizli: boolean },
): unknown {
  if (calisma === null || typeof calisma !== 'object') return calisma;
  const c = calisma as { D?: unknown };
  if (c.D === null || typeof c.D !== 'object') return calisma;
  const D = c.D as { planTL?: unknown; planAgirlik?: unknown };
  const planTL = D.planTL !== null && typeof D.planTL === 'object' ? D.planTL : {};
  const agirlik = finansmanOraniGun === null ? {}
    : { planAgirlik: { ...(D.planAgirlik !== null && typeof D.planAgirlik === 'object' ? D.planAgirlik : {}), fin: finansmanOraniGun } };
  const w = (c as { w?: unknown }).w;
  // 2509-1 c: acil iş payı sistem ayarındandır; çalışmanın param.acilPay'i (motor girdi.betik stKur ve sayfa hesapları onu okur) ezilir.
  const param = (c as { param?: unknown }).param;
  const onceki = (c as { ogren?: unknown }).ogren;
  const ogrenilen = ogren !== undefined ? ogren
    : onceki !== null && typeof onceki === 'object' ? onceki as Readonly<Record<string, OgrenilenSure>> : null;
  return {
    ...c, D: { ...D, ...agirlik, planTL: { ...planTL, amac: ayar.amac === 'tl' ? 'tl' : 'sira', ...(genelGider === undefined ? {} : { genelGider: genelGider.gizli ? null : genelGider.saatBasi, genelGiderGizli: genelGider.gizli }) } },
    param: { ...(param !== null && typeof param === 'object' ? param : {}), acilPay: ayar.acilPay, bolmeKip: ayar.bolmeKip, bolmeMaks: ayar.bolmeMaks },
    w: { ...(w !== null && typeof w === 'object' ? w : {}), rule: ayar.kural, amac: ayar.amac, ...(olcek ?? {}) },
    ogren: ayar.ogrenme === 'acik' && ogrenilen !== null ? { ...ogrenilen } : {},
  };
}
