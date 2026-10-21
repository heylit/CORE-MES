import { createHash } from 'node:crypto';
import { KATALOG_ONAY_DURUMLARI, KATALOG_TURLERI, LOGO_KART_TURLERI } from '#paylasilan/sozlesme/malzemeler.ts';
import type { HizmetYonu, KatalogKartDurumu, KatalogOnayDurumu, KatalogTuru, LogoEksik } from '#paylasilan/sozlesme/malzemeler.ts';

/* ---------------- Malzeme Kataloğu (prototip) kartları: MKK-1..MKK-15 ---------------- */

type Nesne = Record<string, unknown>;
const nesneMi = (d: unknown): d is Nesne => d !== null && typeof d === 'object' && !Array.isArray(d);

// MKK-1: yeni kartın stok kodu önekini ekran verir ("HM-PAS-00012" → "HM-PAS-"); sırayı sunucu verir, gelen sayı yok sayılır.
// Kabul edilen önek yalnız ekranın standart kod yapısıdır (`katalog.html` `kodOnek`, `KOD_DESEN`): TÜR-GRUP(3 harf ya da rakam)-. Serbest önek reddedilir.
// Logo sınırı: yeni verilen stok kodu en çok 24 karakter. Eski kayıtlardaki uzun kod okunur, yalnız yeni kod ve kod değişimi sınırlanır.
// Sınır önek kabulünde uygulanır: önek, en büyük sıra numarasıyla (`int`, 10 hane) bile sınırı aşmamalı; sıra aşamasında ayrı denetim gerekmez.
export const STOK_KODU_EN_COK = 24;
const EN_BUYUK_SIRA = 2_147_483_647;

// MKK-2: veritabanının ürettiği stok kodunun biçimi; 99999'dan sonra hane sayısı artar, kesilmez.
export const katalogStokKodu = (onek: string, sira: number): string =>
  `${onek}${sira < 100_000 ? String(sira).padStart(5, '0') : String(sira)}`;

export const katalogStokKoduSigarMi = (onek: string, sira: number, enCok = STOK_KODU_EN_COK): boolean => katalogStokKodu(onek, sira).length <= enCok;

const KOD_ONEKI_DESENI = /^((?:HM|YM|MM|SF|DB|HZ|TM)-[A-Z0-9]{3}-)\d+$/;
export function katalogKodOneki(stokKodu: string | null, enCok = STOK_KODU_EN_COK): string | null {
  const onek = KOD_ONEKI_DESENI.exec((stokKodu ?? '').trim().toUpperCase())?.[1] ?? null;
  return onek !== null && katalogStokKoduSigarMi(onek, EN_BUYUK_SIRA, enCok) ? onek : null;
}

// Kart #652: firma kodlu türlerde kod FİRMA-TÜR-sıra (ABC-MM-00001, ABC-YM-00001); firma kodu genel ayardadır (`genel.firmaKodu`),
// boşsa bütün türler tür-grup-sıra yapısında kalır. Sıra önek başınadır: her tür kendi sayacını alır.
// Hangi türlerin firma kodlu olduğu da genel ayardadır (`genel.firmaKoduTurleri`); ayar yoksa mamul ve yarı mamul.
// Tür kısaltması firma kodu olamaz: "HM-MM-00001" hammadde kodu gibi okunur.
const FIRMA_KODU_DESENI = /^[A-Z0-9]{2,5}$/;
const TUR_KISALTMALARI = ['HM', 'YM', 'MM', 'SF', 'DB', 'HZ', 'TM'];
export function katalogFirmaKoduGecerliMi(deger: unknown): boolean {
  if (deger === undefined || deger === null || deger === '') return true;
  return typeof deger === 'string' && FIRMA_KODU_DESENI.test(deger) && !TUR_KISALTMALARI.includes(deger);
}
// Genel ayardaki firma kodu; boş ya da kurala uymayan değer yok sayılır.
export function katalogFirmaKodu(genel: Record<string, unknown> | null): string | null {
  const firma = genel?.['firmaKodu'];
  return typeof firma === 'string' && firma !== '' && katalogFirmaKoduGecerliMi(firma) ? firma : null;
}
const FIRMA_KODLU_VARSAYILAN: readonly string[] = ['mamul', 'yarimamul'];
export function katalogFirmaKoduTurleriGecerliMi(deger: unknown): boolean {
  if (deger === undefined || deger === null) return true;
  return Array.isArray(deger) && new Set(deger).size === deger.length
    && deger.every((t) => typeof t === 'string' && (KATALOG_TURLERI as readonly string[]).includes(t));
}
export function katalogFirmaKodluTurler(genel: Record<string, unknown> | null): readonly string[] {
  const l = genel?.['firmaKoduTurleri'];
  return Array.isArray(l) && katalogFirmaKoduTurleriGecerliMi(l) ? (l as string[]) : FIRMA_KODLU_VARSAYILAN;
}
export function katalogFirmaOneki(genel: Record<string, unknown> | null, tur: string): string | null {
  const turKodu = TUR_ONEKI[tur];
  const firma = katalogFirmaKodu(genel);
  return turKodu === undefined || firma === null || !katalogFirmaKodluTurler(genel).includes(tur) ? null : `${firma}-${turKodu}-`;
}

export interface KatalogGecisi {
  onceki: KatalogKartDurumu | null;
  yeni: KatalogKartDurumu;
  islemler: readonly string[];
  kisiId: number;
  acanKisiId: number | null;
  gonderenKisiId: number | null;
  dortGozAcik: boolean;
  onayAkisiAcik: boolean;
  // Kayıtlı kartın içeriği, benzersiz anahtarı ya da gerekçesi bu yazmayla değişiyor mu (`katalogIcerigiDegistiMi`).
  icerikDegisti: boolean;
  // Aynısı, `onay` alt nesnesi sayılmadan: onay adımı yalnız onayı değiştirir.
  onaysizIcerikDegisti: boolean;
}

// MKK-3..MKK-5, MKK-12..MKK-14: kartın onay durumunun değişmesi. Uç yazma yetkisiyle açılır; onay gerektiren geçişi burası ayırır.
export function katalogGecisiDenetle(g: KatalogGecisi): { kod: 'YETKI_YOK' | 'GECERSIZ'; mesaj: string } | null {
  const onaylar = g.islemler.includes('malzemeler.onayla');
  if (g.onceki === 'iptal') return { kod: 'GECERSIZ', mesaj: 'İptal edilen kart değiştirilemez.' };
  // MKK-5: yeni kart onay yolundan geçmeden pasif açılmaz.
  if (g.onceki === null && g.yeni === 'pasif') return { kod: 'GECERSIZ', mesaj: 'Yeni kart pasif olarak açılamaz.' };
  // MKK-12: aktif ya da onaydaki kartı taslağa çekmek (reddetmek, geri çekmek) ve aktif kartı onaya düşürmek onay yetkilisinin işidir;
  // yoksa kullanımdaki kart düşürülüp iptal edilebilir. Ekran aktif kartı kendi başına onaya düşürmez (değişiklik talebi yazar).
  if (g.yeni === 'taslak' && (g.onceki === 'aktif' || g.onceki === 'onayda') && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Aktif ya da onaydaki kartı taslağa çekmek için onay yetkisi gerekir.' };
  }
  if (g.onceki === 'aktif' && g.yeni === 'onayda' && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Aktif kartı onaya düşürmek için onay yetkisi gerekir; değişikliği talep olarak gönder.' };
  }
  // MKK-13: onay akışı açıkken aktif kartın içeriği onaysız değişmez; değişiklik talep olarak bekler.
  if (g.onayAkisiAcik && g.onceki === 'aktif' && g.yeni === 'aktif' && g.icerikDegisti && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Aktif kartın içeriğini değiştirmek için onay yetkisi gerekir; değişikliği talep olarak gönder.' };
  }
  // MKK-13: pasif kartın içeriği de onay yetkisi olmadan değişmez.
  if (g.onceki === 'pasif' && g.yeni === 'pasif' && g.icerikDegisti && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Pasif kartın içeriğini değiştirmek için onay yetkisi gerekir.' };
  }
  if (g.yeni === 'aktif' && g.onceki !== 'aktif') {
    // MKK-3: onay akışı açıkken kart ancak onay yetkisiyle aktif olur.
    if (g.onayAkisiAcik && !onaylar) return { kod: 'YETKI_YOK', mesaj: 'Kartı aktif yapmak için onay yetkisi gerekir.' };
    // MKK-4: onay akışı açıkken aktife yalnız onaydan geçilir; adım atlanamaz.
    if (g.onayAkisiAcik && g.onceki !== 'onayda') return { kod: 'GECERSIZ', mesaj: 'Kart önce onaya gönderilmeli.' };
    // MKK-4: dört göz açıkken onaya gönderen ve kartı açan kişi onaylayamaz.
    if (g.onayAkisiAcik && g.dortGozAcik && (g.gonderenKisiId === g.kisiId || g.acanKisiId === g.kisiId)) {
      return { kod: 'YETKI_YOK', mesaj: 'Kendi açtığın ya da onaya gönderdiğin kartı onaylayamazsın.' };
    }
    // MKK-4: dört göz açıkken onaylayan, gönderilen içeriği değiştirip onaylayamaz (onay adımı yalnız onayı değiştirir).
    if (g.onayAkisiAcik && g.dortGozAcik && g.onaysizIcerikDegisti) {
      return { kod: 'YETKI_YOK', mesaj: 'Onay sırasında kartın içeriği değiştirilemez; değiştirirsen kart sana ait olur, başkası onaylamalı.' };
    }
  }
  // MKK-5: pasife alma ve pasiften çıkarma onay yetkisi ister.
  if ((g.yeni === 'pasif') !== (g.onceki === 'pasif') && g.onceki !== null && !onaylar) {
    return { kod: 'YETKI_YOK', mesaj: 'Kartı pasife almak ya da yeniden açmak için onay yetkisi gerekir.' };
  }
  return null;
}

// Kart içeriğinin onaysız değişmesi sayılmayan alanlar: ekranın bekleyen değişiklik talebi, geçmiş kaydı ve zaman damgası.
// Talep kartı değiştirmez; onaycı uygulayana kadar kartın içeriği (onay durumu dahil) aynı kalır.
const ICERIK_DISI_ALANLAR = ['talep', 'rev', 'updatedAt'];

function kararliMetin(d: unknown): string {
  if (Array.isArray(d)) return `[${d.map(kararliMetin).join(',')}]`;
  if (d !== null && typeof d === 'object') {
    return `{${Object.entries(d as Nesne).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${kararliMetin(v)}`).join(',')}}`;
  }
  return JSON.stringify(d);
}

// Stok kodunu veritabanı verir (`com.kod` her yazmada ona çekilir); içerik karşılaştırması kodu aynı sayar.
function katalogIcerigi(kayit: Nesne, stokKodu: string, onayDahil: boolean): string {
  const haric = onayDahil ? ICERIK_DISI_ALANLAR : [...ICERIK_DISI_ALANLAR, 'onay'];
  const ic = Object.fromEntries(Object.entries(kayit).filter(([k]) => !haric.includes(k)));
  if (nesneMi(ic['com'])) ic['com'] = { ...ic['com'], kod: stokKodu };
  return kararliMetin(ic);
}

export interface KatalogIcerigi { kayit: Nesne; benzersizAnahtar: string | null; mukerrerGerekcesi: string | null }

export function katalogIcerigiDegistiMi(kayitli: KatalogIcerigi & { stokKodu: string }, gelen: KatalogIcerigi, onayDahil = true): boolean {
  return (kayitli.benzersizAnahtar ?? null) !== (gelen.benzersizAnahtar ?? null)
    || (kayitli.mukerrerGerekcesi ?? null) !== (gelen.mukerrerGerekcesi ?? null)
    || katalogIcerigi(kayitli.kayit, kayitli.stokKodu, onayDahil) !== katalogIcerigi(gelen.kayit, kayitli.stokKodu, onayDahil);
}

export interface KatalogKaydiAlanlari { tur: KatalogTuru; onayDurumu: KatalogOnayDurumu; stokKodu: string | null; hizmetYonu: HizmetYonu | null }
export interface KatalogOzetAlanlari { tur?: string | undefined; onay_durumu?: string | undefined; stok_kodu?: string | null | undefined }

const katalogTuruMu = (d: unknown): d is KatalogTuru => KATALOG_TURLERI.some((t) => t === d);
const katalogOnayDurumuMu = (d: unknown): d is KatalogOnayDurumu => KATALOG_ONAY_DURUMLARI.some((t) => t === d);

// MKK-14: sütuna yazılan tür, onay durumu ve yeni kodun öneki kartın kendisinden okunur; ekran kartı kayıttan çizer, istemcinin özeti değil.
// Ekran gibi: `tur` boşsa hammadde; `onay` yoksa ekran kartı aktif sayar, bu yüzden onay durumu zorunludur. Özet bu alanları taşırsa kartla aynı olmalı.
export function katalogKaydiAlanlari(kayit: Nesne, ozet: KatalogOzetAlanlari): KatalogKaydiAlanlari | { alan: string; mesaj: string } {
  const tur = kayit['tur'] === undefined || kayit['tur'] === null || kayit['tur'] === '' ? 'hammadde' : kayit['tur'];
  if (!katalogTuruMu(tur)) return { alan: 'kayit.tur', mesaj: 'Kartın türü geçerli bir malzeme türü olmalı.' };
  const onayDurumu = nesneMi(kayit['onay']) ? kayit['onay']['durum'] : undefined;
  if (!katalogOnayDurumuMu(onayDurumu)) return { alan: 'kayit.onay.durum', mesaj: 'Kartın onay durumu taslak, onayda, aktif ya da pasif olmalı.' };
  const com = kayit['com'];
  const kod = nesneMi(com) && typeof com['kod'] === 'string' && com['kod'].trim() !== '' ? com['kod'].trim() : null;
  if (ozet.tur !== undefined && ozet.tur !== tur) return { alan: 'kayit.tur', mesaj: 'Kartın türü özetle tutarlı olmalı.' };
  if (ozet.onay_durumu !== undefined && ozet.onay_durumu !== onayDurumu) return { alan: 'kayit.onay.durum', mesaj: 'Kartın onay durumu özetle tutarlı olmalı.' };
  if (ozet.stok_kodu !== undefined && ozet.stok_kodu !== null && ozet.stok_kodu !== kod) return { alan: 'kayit.com.kod', mesaj: 'Kartın stok kodu özetle tutarlı olmalı.' };
  const hizmetYonu = tur === 'hizmet' ? kartHizmetYonu(kayit) : null;
  if (tur === 'hizmet' && hizmetYonu === null) return { alan: 'kayit.g.yon', mesaj: 'Hizmet kartının yönü alınan ya da verilen olmalı.' };
  return { tur, onayDurumu, stokKodu: kod, hizmetYonu };
}

// 208 a: ağırlık ve adlar yalnız hammaddede anlamlıdır; başka türde silinir. Hammaddede özet üçünden birini taşımıyorsa kayıtlı değer
// korunur (null döner): ağırlığı hesaplamayan eski istemci kaydı onu silmesin. Boş ad yazılmaz.
export interface KatalogAgirlikAlanlari { birimAgirlikKg: number | null; kaliteAdi: string | null; formAdi: string | null }
export interface KatalogAgirlikOzeti { birim_agirlik_kg?: number | null | undefined; kalite_adi?: string | null | undefined; form_adi?: string | null | undefined }

export function katalogAgirlikAlanlari(tur: KatalogTuru, ozet: KatalogAgirlikOzeti): KatalogAgirlikAlanlari | null {
  if (tur !== 'hammadde') return { birimAgirlikKg: null, kaliteAdi: null, formAdi: null };
  if (ozet.birim_agirlik_kg === undefined && ozet.kalite_adi === undefined && ozet.form_adi === undefined) return null;
  const ad = (d: string | null | undefined): string | null => d?.trim() || null;
  return { birimAgirlikKg: ozet.birim_agirlik_kg ?? null, kaliteAdi: ad(ozet.kalite_adi), formAdi: ad(ozet.form_adi) };
}

// 334 a: Açıklama 1, 2, 3 ekranın kuralıyla kurulur, sunucu yalnız saklar. Üçü de gelmezse null (kayıtlı değerler korunur); boş metin null.
export type KatalogAciklamalari = [string | null, string | null, string | null];
export interface KatalogAciklamaOzeti { aciklama_1?: string | null | undefined; aciklama_2?: string | null | undefined; aciklama_3?: string | null | undefined }

export function katalogAciklamalari(ozet: KatalogAciklamaOzeti): KatalogAciklamalari | null {
  if (ozet.aciklama_1 === undefined && ozet.aciklama_2 === undefined && ozet.aciklama_3 === undefined) return null;
  const metin = (d: string | null | undefined): string | null => d?.trim() || null;
  return [metin(ozet.aciklama_1), metin(ozet.aciklama_2), metin(ozet.aciklama_3)];
}

// 214 a: talaş = kütük ağırlığı - net parça ağırlığı. Net ağırlık parçanın kendisidir; mamul ve yarı mamul kartında elle girilen
// "Net ağırlık" alanından (`g.net`) okunur. Ekranın reçete toplamına düşen yedeği kütük ağırlığı olduğundan alınmaz.
export function katalogNetAgirlikKg(tur: KatalogTuru, kayit: Nesne): number | null {
  if (tur !== 'mamul' && tur !== 'yarimamul') return null;
  const g = kayit['g'];
  const ham = nesneMi(g) ? g['net'] : undefined;
  const sayi = typeof ham === 'number' ? ham : typeof ham === 'string' && ham.trim() !== '' ? Number(ham.trim().replace(/\s/g, '').replace(',', '.')) : Number.NaN;
  const yuvarlak = Number.isFinite(sayi) && sayi < 1e9 ? Math.round(sayi * 1e4) / 1e4 : 0;
  return yuvarlak > 0 ? yuvarlak : null;
}

// MH5 a: ekran yönü seçim metniyle yazar (`kayit.g.yon`: "Alınan" / "Verilen"); sütun değeri ASCII'dir. Başka değer yön değildir.
const HIZMET_YONU_METNI: Record<string, HizmetYonu> = { 'Alınan': 'alinan', 'Verilen': 'verilen', alinan: 'alinan', verilen: 'verilen' };
export function kartHizmetYonu(kayit: Nesne): HizmetYonu | null {
  const g = kayit['g'];
  if (!nesneMi(g) || typeof g['yon'] !== 'string') return null;
  return HIZMET_YONU_METNI[g['yon'].trim()] ?? null;
}

// Madde 6: hizmet reçete bileşeni ve operasyon sarfı olamaz. Kartın reçetesinde (`bom[].ref`) ve operasyon sarflarında (`ops[].sarf[].ref`)
// başvurduğu kart kimlikleri; serbest satır (ref yok) sayılmaz.
export function kartBilesenKimlikleri(kayit: Nesne): string[] {
  const refler = (l: unknown): string[] => (Array.isArray(l) ? l.filter(nesneMi).map((r) => r['ref']).filter((r): r is string => typeof r === 'string' && r !== '') : []);
  const ops = Array.isArray(kayit['ops']) ? kayit['ops'].filter(nesneMi) : [];
  return [...new Set([...refler(kayit['bom']), ...ops.flatMap((o) => refler(o['sarf']))])];
}

// Kart #688: kartın Operasyonlar adımı (`ops[]`) rotaya taslak olarak aktarılır. Kodu boş satır alınmaz; ad yoksa null (kod uydurulmaz).
// Numara ekranın kuralıyla verilir (`katalog.html` `opNoDuzenle`, `opSirala`): numarası olmayan satır kendinden öncekinin 10 fazlasını alır,
// sonra numaraya göre sıralanır (eşitler kart sırasını korur). Rota adım numarası tekil ve artan olmalı: eşit numara bir öncekinin 1 fazlasını alır.
export interface KartOperasyonu { no: number; kod: string; ad: string | null }
export function kartOperasyonlari(kayit: Nesne): KartOperasyonu[] {
  const ops = Array.isArray(kayit['ops']) ? kayit['ops'].filter(nesneMi) : [];
  let son = 0;
  const satirlar = ops.map((o) => {
    const n = typeof o['no'] === 'number' && Number.isInteger(o['no']) && o['no'] > 0 ? o['no'] : son + 10;
    son = n;
    const kod = typeof o['kod'] === 'string' ? o['kod'].trim() : '';
    const ad = typeof o['ad'] === 'string' && o['ad'].trim() !== '' ? o['ad'].trim() : null;
    return { no: n, kod, ad };
  }).filter((o) => o.kod !== '');
  let onceki = 0;
  return satirlar.map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.no - b.s.no || a.i - b.i)
    .map(({ s }) => {
      onceki = s.no > onceki ? s.no : onceki + 1;
      return { ...s, no: onceki };
    });
}

// 233 a: rotası olan kartın operasyonları ve reçetesi Reçete ve Rota'da düzenlenir, kart yalnız gösterir. Ekran Operasyonlar adımını
// her çizişte yeniden numaralar; numara kartOperasyonlari kuralıyla verilip sıralanır, böylece yalnız satır içeriği ya da sırası değişince
// değişmiş sayılır. Bekleyen değişiklik talebinin önerdiği kart da aynı denetimden geçer.
function rotaIcerigi(kayit: Nesne): string {
  const ops = Array.isArray(kayit['ops']) ? kayit['ops'].filter(nesneMi) : [];
  let son = 0;
  const numarali = ops.map((o, i) => {
    const n = typeof o['no'] === 'number' && Number.isInteger(o['no']) && o['no'] > 0 ? o['no'] : son + 10;
    son = n;
    return { o: { ...o, no: n }, i };
  }).sort((a, b) => a.o.no - b.o.no || a.i - b.i).map((x) => x.o);
  return kararliMetin({ ops: numarali, bom: Array.isArray(kayit['bom']) ? kayit['bom'] : [] });
}
export function kartRotaIcerigiDegistiMi(kayitli: Nesne, gelen: Nesne): boolean {
  const eski = rotaIcerigi(kayitli);
  const talep = gelen['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? [gelen, talep['yeni']] : [gelen];
  return yeni.some((k) => rotaIcerigi(k) !== eski);
}
export const ROTALI_KART_ILETISI = 'Bu kartın rotası var; operasyon ve reçete Reçete ve Rota\'da düzenlenir.';

// UYUM-BORCU madde 4: hammaddenin ölçüsü ekranın kuralıyla (`katalog.html` `FORMS`, `dimVals`, `dimsErr`) sunucuda da denetlenir; doğrudan API kaydı da aynı sınırı tutar.
// Yalnız tutarlılık: form ya da ölçü geldiyse form bilinmeli, formun her ölçüsü sıfırdan büyük sayı olmalı, form kendi sınırını tutmalı. Ailenin, kalitenin ve ölçünün
// hiç gelmemesi sunucuda denetlenmez (ekrandan gevşek; açık borç). Kayıtlı kartta yalnız form ya da ölçü değişince bakılır: eski kayıt düzenlemeye kilitlenmez.
type OlcuSiniri = (o: Record<string, number>) => string | null;
const HAMMADDE_FORMLARI: Readonly<Record<string, { olculer: readonly string[]; sinir?: OlcuSiniri }>> = {
  levha: { olculer: ['t', 'w', 'l'] },
  cubuk: { olculer: ['d', 'l'] },
  altigen: { olculer: ['s', 'l'] },
  lama: { olculer: ['a', 'b', 'l'] },
  boru: { olculer: ['D', 't', 'l'], sinir: (o) => (2 * o['t']! < o['D']! ? null : 'Et kalınlığı dış çapın yarısından küçük olmalı.') },
  kutu: { olculer: ['a', 'b', 't', 'l'], sinir: (o) => (2 * o['t']! < o['a']! && 2 * o['t']! < o['b']! ? null : 'Et kalınlığı kenarların yarısından küçük olmalı.') },
  kosebent: { olculer: ['a', 'b', 't', 'l'], sinir: (o) => (o['t']! < o['a']! && o['t']! < o['b']! ? null : 'Et kalınlığı kol boyundan küçük olmalı.') },
  tel: { olculer: ['d', 'L'] },
  kord: { olculer: ['d', 'L'] },
  rulo: { olculer: ['t', 'w', 'L'] },
  blok: { olculer: ['a', 'b', 'h'] },
  disk: { olculer: ['d', 't'] },
  oring: { olculer: ['d1', 'd2'] },
  granul: { olculer: ['kg'] },
  kumas: { olculer: ['g', 'w', 'L'] },
};
const hammaddeMi = (kayit: Nesne): boolean => kayit['tur'] === undefined || kayit['tur'] === null || kayit['tur'] === '' || kayit['tur'] === 'hammadde';
const olcuBilgisi = (kayit: Nesne): string => kararliMetin({ form: kayit['form'] ?? null, dims: kayit['dims'] ?? null });
function olcuHatasi(kayit: Nesne): string | null {
  const form = kayit['form'];
  const dims = kayit['dims'];
  const formVar = typeof form === 'string' && form !== '';
  const olcuVar = nesneMi(dims) && Object.keys(dims).length > 0;
  if (!formVar && !olcuVar) return null;
  const tanim = formVar && Object.hasOwn(HAMMADDE_FORMLARI, form) ? HAMMADDE_FORMLARI[form] : undefined;
  if (!tanim) return 'Bir form seç.';
  const o: Record<string, number> = {};
  for (const k of tanim.olculer) {
    const v = nesneMi(dims) ? dims[k] : undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 'Tüm ölçüleri sıfırdan büyük girmelisin.';
    o[k] = v;
  }
  return tanim.sinir ? tanim.sinir(o) : null;
}
export function hammaddeOlcuHatasi(kayitli: Nesne | null, gelen: Nesne): string | null {
  const talep = gelen['talep'];
  const adaylar = nesneMi(talep) && nesneMi(talep['yeni']) ? [gelen, talep['yeni']] : [gelen];
  for (const k of adaylar) {
    if (!hammaddeMi(k)) continue;
    if (kayitli && olcuBilgisi(kayitli) === olcuBilgisi(k)) continue;
    const hata = olcuHatasi(k);
    if (hata) return hata;
  }
  return null;
}

// Kart #466: tedarikçi Müşteriler ve Tedarikçiler modülündeki firmanın kimliğiyle yazılır (`com.tedId`); yoksa eski serbest metin kalır.
// Dönüş: kimlik yok (null), geçerli kimlik ya da biçim hatası.
export function kartTedarikciKimligi(com: Nesne): number | null | 'gecersiz' {
  const id = com['tedId'];
  if (id === undefined || id === null || id === '') return null;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : 'gecersiz';
}

// Kartın kendisi ve bekleyen değişiklik talebinin önerdiği kart: ikisinin tedarikçi bağı da aynı denetimden geçer
// (talep, onaylanınca karta yazılır; geçersiz bağ onaylayana hiç gitmemeli).
export function kartTedarikciKimlikleri(kayit: Nesne): (number | 'gecersiz')[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  return [kayit['com'], yeni?.['com']].filter(nesneMi).map(kartTedarikciKimligi).filter((k): k is number | 'gecersiz' => k !== null);
}
// 312 b: kartın kendi tedarikçi bağı (talebin önerdiği değil) yabancı anahtarlı sütuna yazılır; bağ yoksa boş.
export function kartTedarikciFirmaId(kayit: Nesne): number | null {
  const com = kayit['com'];
  const id = nesneMi(com) ? kartTedarikciKimligi(com) : null;
  return typeof id === 'number' ? id : null;
}
export function tedarikciDegistiMi(kayitliKayit: Nesne | null, tedId: number): boolean {
  const com = kayitliKayit?.['com'];
  return !nesneMi(com) || kartTedarikciKimligi(com) !== tedId;
}
// Malzeme denetimi 1/5 (kullanıcı kararı "Reddedilsin"): kategori yalnız sarf, demirbaş ve hizmette, `g.kat` dolu metin ise vardır (özet sorgusunun
// `KATALOG_KATEGORI` ifadesiyle aynı). Kart ve bekleyen talebin önerdiği kart aynı denetimden geçer.
const KATEGORILI_TURLER = new Set(['sarf', 'demirbas', 'hizmet']);
function kartKategorisi(kayit: Nesne, tur: string): string | null {
  const g = kayit['g'];
  const kat = nesneMi(g) && typeof g['kat'] === 'string' ? g['kat'].trim() : '';
  return KATEGORILI_TURLER.has(tur) && kat !== '' ? kat : null;
}
// Denetlenecek kategoriler: kayıtlı kartta aynı türle duran kategori yeniden sorulmaz (mevcut kartlara dokunulmaz).
// Gerekçeli mükerrer kart anahtar çakışmasını atlar; tek harflik gerekçe denetimi boşa çıkarırdı (kullanıcı kararı 16.10.2026: en az 10 karakter).
export const MUKERRER_GEREKCE_EN_AZ = 10;
export const MUKERRER_GEREKCE_ILETISI = `Mükerrer kart gerekçesi en az ${MUKERRER_GEREKCE_EN_AZ} karakter olmalı; aynı malzemenin neden ayrı kartı gerektiğini yazın.`;
// Kayıtlı gerekçe değişmedikçe sorulmaz: kuraldan önce kısa gerekçeyle kaydolmuş kart yeniden kaydedilir.
export function mukerrerGerekcesiKisaMi(gerekce: string | null, kayitli: string | null): boolean {
  return gerekce !== null && gerekce !== kayitli && Array.from(gerekce.trim()).length < MUKERRER_GEREKCE_EN_AZ;
}

export function denetlenecekKategoriler(kayit: Nesne, tur: string, kayitli: { kayit: Nesne; tur: string } | null): string[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  const onceki = kayitli && kayitli.tur === tur ? kartKategorisi(kayitli.kayit, tur) : null;
  const katlar = [kartKategorisi(kayit, tur), yeni ? kartKategorisi(yeni, tur) : null].filter((k): k is string => k !== null && k !== onceki);
  return [...new Set(katlar)];
}
// MKK-1: önekin tür kısmı kartın türüyle aynı olmalı (prototipin `KOD_TUR` tablosu).
const TUR_ONEKI: Record<string, string> = { hammadde: 'HM', yarimamul: 'YM', mamul: 'MM', sarf: 'SF', demirbas: 'DB', hizmet: 'HZ', ticari_mal: 'TM' };
export function katalogOnekiTureUyarMi(onek: string, tur: string): boolean {
  const beklenen = TUR_ONEKI[tur];
  return beklenen !== undefined && onek.split('-')[0] === beklenen;
}

// MKK-2b: tür ve stok kodu yalnız hiç aktif olmamış taslakta değişir; onayda, aktif, pasif, iptal durumunda ve bir kez aktif olmuş kartta
// (taslağa çekilse de) kilitlidir.
export const katalogKodDegisebilirMi = (durum: KatalogKartDurumu, aktifOlmus: boolean): boolean => durum === 'taslak' && !aktifOlmus;

// Kural 1a (kullanıcı kartı 17.10.2026): hiç aktif olmamış taslakta ekran grup, çeşit ya da kategori değişince yeni önekli kod gösterir;
// sunucu o öneki alır. Geçersiz ya da türe ters önek kodu değiştirmez (kayıtlı kod kalır, kayıt reddedilmez). Tür değişimi ayrı yoldur.
export function katalogYeniOnek(
  k: { durum: KatalogKartDurumu; aktifOlmus: boolean; kayitliOnek: string; tur: string; gelenKod: string | null },
): string | null {
  if (!katalogKodDegisebilirMi(k.durum, k.aktifOlmus)) return null;
  const onek = katalogKodOneki(k.gelenKod);
  return onek !== null && onek !== k.kayitliOnek && katalogOnekiTureUyarMi(onek, k.tur) ? onek : null;
}

// MKK-10: ekran hammadde ve sarf kartı için her zaman anahtar üretir; yarı mamul, mamul ve demirbaşta resim, müşteri ya da
// seri girilmemişse üretemez (null kabul).
export const katalogAnahtarZorunluMu = (tur: string): boolean => tur === 'hammadde' || tur === 'sarf';

// MKK-16: çakışma alanları tür ayarındadır (`malzeme` ayarı `kurallar[tür].cakisma`, kullanıcı kartı "Uyarı ve engel" 15.10.2026).
// Liste varsa benzersiz anahtarı sunucu o alanlardan kurar; alanlardan biri boşsa kartın anahtarı yoktur (denetlenmez).
// Liste yoksa ekranın türe göre kurduğu varsayılan anahtar geçerlidir. Değerler ekranla aynı biçimde karşılaştırılır: harf, boşluk, noktalama yok sayılır.
const CAKISMA_ALAN_DESENI = /^[A-Za-z0-9_]{1,40}$/;
export function katalogCakismaListesiGecerliMi(deger: unknown): boolean {
  if (deger === undefined || deger === null) return true;
  return Array.isArray(deger) && deger.length <= 40 && deger.every((k) => typeof k === 'string' && CAKISMA_ALAN_DESENI.test(k));
}
// Ayardaki kurallar nesnesi: tür başına çakışma listesi geçerli mi (öteki kurallar ekranındır, sunucu saklar).
export function katalogKurallariGecerliMi(kurallar: unknown): boolean {
  if (kurallar === undefined || kurallar === null) return true;
  if (!nesneMi(kurallar)) return false;
  return Object.values(kurallar).every((k) => k === null || (nesneMi(k) && katalogCakismaListesiGecerliMi(k['cakisma'])));
}
export function katalogCakismaAlanlari(malzemeAyari: Record<string, unknown> | null, tur: string): string[] | null {
  const kurallar = malzemeAyari?.['kurallar'];
  const kural = nesneMi(kurallar) ? kurallar[tur] : undefined;
  const liste = nesneMi(kural) ? kural['cakisma'] : undefined;
  if (!Array.isArray(liste) || !liste.length || !katalogCakismaListesiGecerliMi(liste)) return null;
  return [...new Set(liste as string[])].sort();
}
const cakismaNormu = (s: string): string => s.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]/g, '');
const metin = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
function cakismaDegeri(kayit: Nesne, alan: string): string {
  const com = nesneMi(kayit['com']) ? kayit['com'] : {};
  if (alan === '_ad') return metin(com['ad']);
  if (alan === '_ac') return [1, 2, 3].map((i) => metin(com[`ac${i}`])).join('|');
  const g = nesneMi(kayit['g']) ? kayit['g'] : {};
  const v = g[alan];
  return Array.isArray(v) ? v.map(metin).sort().join(',') : metin(v);
}
export function katalogKuralAnahtari(tur: string, alanlar: readonly string[], kayit: Nesne): string | null {
  const parcalar = alanlar.map((k) => [k, cakismaNormu(cakismaDegeri(kayit, k))] as const);
  if (parcalar.some(([, v]) => v === '')) return null;
  return `K|${tur}|${parcalar.map(([k, v]) => `${k}=${v}`).join('|')}`;
}
// Ayar değişince türün kartlarının yeni anahtarı: liste varsa ondan, yoksa kartın varsayılan anahtarı.
export function katalogYeniAnahtar(tur: string, alanlar: readonly string[] | null, kart: { kayit: Nesne; varsayilanAnahtar: string | null }): string | null {
  return alanlar ? katalogKuralAnahtari(tur, alanlar, kart.kayit) : kart.varsayilanAnahtar;
}
// Yeniden hesaplanan anahtarlar etkin kartlar arasında çakışıyor mu (gerekçeli mükerrer kart sayılmaz; veritabanının tekil dizini de böyledir).
export function katalogAnahtarCakismalari(kartlar: readonly { stokKodu: string; anahtar: string | null; etkin: boolean; gerekceli: boolean }[]): string[][] {
  const gruplar = new Map<string, string[]>();
  for (const k of kartlar) {
    if (!k.anahtar || !k.etkin || k.gerekceli) continue;
    gruplar.set(k.anahtar, [...(gruplar.get(k.anahtar) ?? []), k.stokKodu]);
  }
  return [...gruplar.values()].filter((g) => g.length > 1);
}

/* ---- MKK-15: onay damgaları, değişiklik talebi ve geçmiş kaydı ---- */

export interface KatalogKim { by: number; byAd: string; t: number }

const GECIS_ALANI: Partial<Record<KatalogKartDurumu, string>> = { aktif: 'onay', onayda: 'talep', taslak: 'red', pasif: 'pasif' };
const DAMGA_ALANLARI = ['onay', 'talep', 'red', 'pasif'];

// "Kim onayladı, gönderdi, reddetti, pasife aldı" bilgisini ekran `kayit.onay.{onay,talep,red,pasif}.{by,byAd,t}`'den okur; ilgili
// geçişte sunucu yazar (neden gibi öteki alanlar istemcinin kalır), geçiş olmayan yazmada kayıtlı değer korunur.
export function katalogOnayiBas(g: {
  kayit: Nesne; kayitli: Nesne | null; onceki: KatalogKartDurumu | null; yeni: KatalogKartDurumu; gonderildi: boolean; talepOnaylandi: boolean; kim: KatalogKim;
}): Nesne {
  const gelen = nesneMi(g.kayit['onay']) ? g.kayit['onay'] : {};
  const eski = g.kayitli !== null && nesneMi(g.kayitli['onay']) ? g.kayitli['onay'] : {};
  const damgali = new Set<string>();
  const alan = GECIS_ALANI[g.yeni];
  if (alan && (g.yeni !== g.onceki || g.gonderildi)) damgali.add(alan);
  if (g.talepOnaylandi) damgali.add('onay');
  const onay: Nesne = { ...gelen };
  for (const a of DAMGA_ALANLARI) {
    if (damgali.has(a)) onay[a] = { ...(nesneMi(gelen[a]) ? gelen[a] : {}), by: g.kim.by, byAd: g.kim.byAd, t: g.kim.t };
    else if (eski[a] !== undefined) onay[a] = eski[a];
    else delete onay[a];
  }
  return { ...g.kayit, onay };
}

// `by`, `byAd`, `t`, `farklar` ve `farkOzeti` talebin sunucu basılı alanlarıdır; talebin içeriği (önerilen kart) bunlarsız karşılaştırılır.
const TALEP_SUNUCU_ALANLARI = ['by', 'byAd', 't', 'farklar', 'farkOzeti'];
const talepGovdesi = (t: Nesne): string => kararliMetin(Object.fromEntries(Object.entries(t).filter(([k]) => !TALEP_SUNUCU_ALANLARI.includes(k))));

/* ---- MKK-16 Değişiklik talebinin farkı (kart #226): ekranın `diffItems` farkı biçimlenmiş metindir ve ekranın tanım tablolarına bağlıdır;
   sunucu kendi farkını ham alan yoluyla yazar, ekran saklanan `talep.farklar`ı olduğu gibi gösterir (`talepPanelHTML`, en çok 30 satır). ---- */

// Talebin karşılaştırmasında sayılmayan kart alanları: talep, geçmiş ve damga içerik değildir; `birlesen`, `mukerrerOnay`, `yerine` ekranın
// talebe koymadığı, uygulamada kayıtlıdan taşıdığı alanlardır; stok kodunu veritabanı verir.
const FARK_DISI_ALANLAR = ['talep', 'rev', 'updatedAt', 'onay', 'birlesen', 'mukerrerOnay', 'yerine'];
export const FARK_EN_COK_SATIR = 30;

export interface KatalogFarki { f: string; a: string; b: string }

interface Yaprak { ad: string; karsilastir: string; goster: string }

// Yol dizi olarak anahtarlanır: `"com.ad"` üst anahtarı ile `com: { ad }` yaprağı aynı metne düşüp birbirini ezmesin (kart #226 denetimi).
// Gösterimde nokta içeren parça köşeli ayraçla yazılır, iki yol aynı adla görünmez.
function yapraklariTopla(d: unknown, yol: string[], cikti: Map<string, Yaprak>): void {
  if (nesneMi(d) && (Object.keys(d).length > 0 || yol.length === 0)) {
    for (const [k, v] of Object.entries(d)) if (v !== undefined) yapraklariTopla(v, [...yol, k], cikti);
    return;
  }
  const ad = yol.map((p) => (p.includes('.') || p.startsWith('[') ? `[${p}]` : p)).join('.');
  cikti.set(JSON.stringify(yol), { ad, karsilastir: kararliMetin(d), goster: typeof d === 'string' ? d : kararliMetin(d) });
}

function kartYapraklari(kayit: Nesne): Map<string, Yaprak> {
  const ic = Object.fromEntries(Object.entries(kayit).filter(([k]) => !FARK_DISI_ALANLAR.includes(k)));
  const cikti = new Map<string, Yaprak>();
  yapraklariTopla(ic, [], cikti);
  cikti.delete(JSON.stringify(['com', 'kod']));
  return cikti;
}

// Kesilmemiş farkın tamamı; 30 satır sınırında yalnız adıyla anılan alanların değeri de buradadır.
function tamFark(taban: Nesne, oneri: Nesne): KatalogFarki[] {
  const a = kartYapraklari(taban);
  const b = kartYapraklari(oneri);
  const ad = (y: string): string => (a.get(y) ?? b.get(y))!.ad;
  const yollar = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => (ad(x) < ad(y) ? -1 : ad(x) > ad(y) ? 1 : x < y ? -1 : x > y ? 1 : 0));
  return yollar.filter((y) => a.get(y)?.karsilastir !== b.get(y)?.karsilastir)
    .map((y) => ({ f: ad(y), a: a.get(y)?.goster ?? '—', b: b.get(y)?.goster ?? '—' }));
}

// Bayat talep denetimi kesilmiş farka değil bunun özetine bakar: taşan alanın tabanı değişse de görülür.
const farkOzeti = (taban: Nesne, oneri: Nesne): string => createHash('sha256').update(kararliMetin(tamFark(taban, oneri))).digest('hex');

// Eski kartla önerilen kart arasındaki gerçek fark, alan yolu sırasıyla; ekran en çok 30 satır gösterdiği için fazlası son satırda adı, eski ve yeni
// değeriyle (`alan: değer; ...`) toplanır: onaycı hiçbir değişikliği değerini görmeden onaylamaz.
export function katalogFarki(taban: Nesne, oneri: Nesne): KatalogFarki[] {
  const fark = tamFark(taban, oneri);
  if (fark.length <= FARK_EN_COK_SATIR) return fark;
  const tasan = fark.slice(FARK_EN_COK_SATIR - 1);
  const topla = (deger: (x: KatalogFarki) => string): string => tasan.map((x) => `${x.f}: ${deger(x)}`).join('; ');
  return [...fark.slice(0, FARK_EN_COK_SATIR - 1), { f: `Diğer ${tasan.length} alan`, a: topla((x) => x.a), b: topla((x) => x.b) }];
}

// Ekran talepsiz kartta alanı hiç koymaz ya da `null` bırakır; ikisi de "talep yok"tur.
export const katalogTalepYokMu = (kayit: Nesne): boolean => kayit['talep'] === undefined || kayit['talep'] === null;
export const katalogTalepBicimiGecerliMi = (kayit: Nesne): boolean => katalogTalepYokMu(kayit) || (nesneMi(kayit['talep']) && nesneMi(kayit['talep']['yeni']));

// Bekleyen değişiklik talebini yazan kişiyi ve zamanı sunucu basar; değişmemiş talebin kayıtlı damgası ve farkı korunur.
// Yeni ya da değişen talepte fark istemcinin gönderdiğinden bağımsız olarak sunucuda hesaplanır: önerilen kart ile bu yazmadan sonraki kart.
export function katalogTalebiBas(kayit: Nesne, kayitli: Nesne | null, kim: KatalogKim): Nesne {
  const t = kayit['talep'];
  if (!nesneMi(t)) return kayit;
  const eski = kayitli?.['talep'];
  if (nesneMi(eski) && talepGovdesi(eski) === talepGovdesi(t)) {
    const { farklar: _istemci, farkOzeti: _istemciOzeti, ...govde } = t;
    return { ...kayit, talep: {
      ...govde, ...(eski['farklar'] === undefined ? {} : { farklar: eski['farklar'] }), ...(eski['farkOzeti'] === undefined ? {} : { farkOzeti: eski['farkOzeti'] }),
      by: eski['by'], byAd: eski['byAd'], t: eski['t'],
    } };
  }
  const yeni = nesneMi(t['yeni']) ? t['yeni'] : {};
  return { ...kayit, talep: { ...t, farklar: katalogFarki(kayit, yeni), farkOzeti: farkOzeti(kayit, yeni), by: kim.by, byAd: kim.byAd, t: kim.t } };
}

// Talep uygulanırken (aktif kart talepsiz ve içerik değişmiş yazılıyor): uygulanan içerik talepteki önerilenle aynı olmalı, talep açıldığı günkü
// karta göre hâlâ geçerli olmalı (kayıtlı kartın bugünkü farkı, açılışta yazılan farkla aynı).
export function katalogTalepUygulamaDenetle(kayitli: Nesne, gelen: Nesne): { kod: 'GECERSIZ' | 'CAKISMA'; mesaj: string } | null {
  const talep = kayitli['talep'];
  const yeni = nesneMi(talep) ? talep['yeni'] : undefined;
  if (!nesneMi(talep) || !nesneMi(yeni)) return { kod: 'GECERSIZ', mesaj: 'Bekleyen talebin önerilen içeriği yok; talebi reddet.' };
  if (katalogFarki(gelen, yeni).length > 0 || gelen['mukerrerOnay'] !== undefined || gelen['yerine'] !== undefined
    || kararliMetin(gelen['birlesen']) !== kararliMetin(kayitli['birlesen'])) {
    return { kod: 'GECERSIZ', mesaj: 'Uygulanan içerik talepte önerilenle aynı olmalı.' };
  }
  if (farkOzeti(kayitli, yeni) !== talep['farkOzeti']) {
    return { kod: 'CAKISMA', mesaj: 'Talep açıldıktan sonra kart değişti; talebi reddet ve değişikliği yeniden talep et.' };
  }
  // Onaycının ekranda gördüğü kayıtlı farktır; taşan alanları yalnız adıyla anan eski biçimli talep değer göstermeden onaylatmasın.
  if (kararliMetin(talep['farklar']) !== kararliMetin(katalogFarki(kayitli, yeni))) {
    return { kod: 'CAKISMA', mesaj: 'Talepte görünen fark güncel değil; talebi reddet ve değişikliği yeniden talep et.' };
  }
  return null;
}

// Var olan talebi yalnız sahibi ya da onay yetkilisi değiştirir ya da kaldırır.
export function katalogTalepDenetle(kayitli: Nesne | null, gelen: Nesne, kisiId: number, onaylar: boolean): string | null {
  const eskiTalep = kayitli?.['talep'];
  if (nesneMi(eskiTalep) && !onaylar && eskiTalep['by'] !== kisiId) {
    const t = gelen['talep'];
    if (!nesneMi(t) || talepGovdesi(t) !== talepGovdesi(eskiTalep)) return 'Bekleyen değişiklik talebini yalnız sahibi ya da onay yetkilisi değiştirir.';
  }
  return null;
}

// Değişiklik geçmişi (`rev`): ekran her kaydetmede (`withRev`, `onayUygula`, `talepOlustur`, `talepUygula`) sona TEK kayıt ekler ve
// son 30'u tutar. Kayıtlı kayıtlar korunur (istemcideki kopyada sunucunun bastığı `by`, `byAd`, `t` farklı olabilir, o alanlar
// karşılaştırılmaz); eklenen kaydın kimi ve zamanını sunucu basar.
const GECMIS_DAMGASI = ['by', 'byAd', 't'];
const GECMIS_EN_COK = 30;
const gecmisGovdesi = (e: unknown): string =>
  nesneMi(e) ? kararliMetin(Object.fromEntries(Object.entries(e).filter(([k]) => !GECMIS_DAMGASI.includes(k)))) : kararliMetin(e);

function gecmisHesapla(eski: unknown[], gelen: unknown[]): { eklenen: 0 | 1; temel: unknown[] } | null {
  for (const eklenen of [0, 1] as const) {
    const temel = eski.slice(Math.max(0, eski.length + eklenen - GECMIS_EN_COK));
    if (gelen.length === temel.length + eklenen && temel.every((e, i) => gecmisGovdesi(e) === gecmisGovdesi(gelen[i]))) return { eklenen, temel };
  }
  return null;
}

export function katalogGecmisiDenetle(kayitli: Nesne | null, gelen: Nesne): { kod: 'YETKI_YOK' | 'DOGRULAMA'; mesaj: string } | null {
  const eski = kayitli?.['rev'];
  const yeni = gelen['rev'];
  if (Array.isArray(eski)) {
    if (!Array.isArray(yeni) || gecmisHesapla(eski, yeni) === null) {
      return { kod: 'YETKI_YOK', mesaj: 'Değişiklik geçmişi silinemez ya da değiştirilemez; yalnız sona bir kayıt eklenir.' };
    }
    return null;
  }
  if (yeni !== undefined && (!Array.isArray(yeni) || yeni.length > 1)) return { kod: 'DOGRULAMA', mesaj: 'Kartın değişiklik geçmişi en çok bir kayıtla başlar.' };
  return null;
}

export function katalogGecmisiniBas(kayitli: Nesne | null, kayit: Nesne, kim: KatalogKim): Nesne {
  const yeni = kayit['rev'];
  if (!Array.isArray(yeni)) return kayit;
  const eski = Array.isArray(kayitli?.['rev']) ? (kayitli!['rev'] as unknown[]) : [];
  const h = gecmisHesapla(eski, yeni);
  if (h === null) return kayit;
  const son = yeni[yeni.length - 1];
  const eklenen = h.eklenen === 1 ? [{ ...(nesneMi(son) ? son : {}), by: kim.by, byAd: kim.byAd, t: kim.t }] : [];
  return { ...kayit, rev: [...h.temel, ...eklenen] };
}

// Prototipte "Sil" yalnız onay yetkisi olan rollere görünür; yetkisi olmayan yalnız kendi açtığı ve hiç onaylanmamış taslağı iptal eder.
export function katalogIptalYetkiliMi(g: { islemler: readonly string[]; kisiId: number; acanKisiId: number; kayit: Nesne }): boolean {
  if (g.islemler.includes('malzemeler.onayla')) return true;
  const onay = nesneMi(g.kayit['onay']) ? g.kayit['onay'] : {};
  return g.acanKisiId === g.kisiId && !nesneMi(onay['onay']);
}

// MKK-6: yalnız taslak iptal edilir (prototipte "sil"); kart hiç silinmez.
export const katalogIptalEdilirMi = (durum: KatalogKartDurumu): boolean => durum === 'taslak';

// MKK-7: sürüm, okunan sürümle aynı olmalı; değilse başkası yazmıştır.
export const katalogSurumUyarMi = (kayitli: number, gelen: number | null): boolean => gelen === kayitli;

// MKK-8: prototipin rolü TMI işlemlerinden türetilir; prototipin kendi rol ayarı geçersizdir.
// Ekranın 'yonetici' rolü TMI'nin bayraklı yöneticisi değildir: ekran ayar sayfasını bu role bağlar, müdür de buraya düşer.
// Bayrak isteyen tek ayar (onay akışı) serviste ayrıca denetlenir.
export function katalogRolu(islemler: readonly string[]): 'talep' | 'sorumlu' | 'yonetici' | null {
  if (islemler.includes('malzemeler.tanim-yaz') && islemler.includes('malzemeler.onayla')) return 'yonetici';
  if (islemler.includes('malzemeler.onayla')) return 'sorumlu';
  if (islemler.includes('malzemeler.yaz')) return 'talep';
  return null;
}

// MKK-9: onay akışı ayarı prototipin "genel" ayarından okunur; ayar yoksa açıktır.
export const katalogOnayAkisiAcikMi = (genel: Record<string, unknown> | null): boolean => genel?.['onayAkisi'] !== false;

/* ---------------- Logo'ya gönderime hazırlık (kart #232): MKL-1..MKL-5 ----------------
   MKL-1 (ilk aktiflikte "bekliyor"), MKL-5'in "gönderilmiş kart geri dönmez" yarısı ve MKL-3'ün kilidi veritabanı tetikleyicisindedir
   (göç `20261008122500_malzemeler_logo_hazirlik.sql`); burada saf olanlar. */

export interface LogoHazirlikAlanlari {
  tur: string; stokKodu: string | null; ad: string | null; birim: string | null; logoKartTuru: string | null; logoBirimSeti: string | null;
}

// MKL-4: kartın Logo'ya gidebilmesi için eksik olanlar, sabit sırada. Eksik kart aktif olmayı engellemez; "bekliyor" kalır, gönderilmez.
export function logoEksikleri(k: LogoHazirlikAlanlari): LogoEksik[] {
  const dolu = (d: string | null): boolean => d !== null && d.trim() !== '';
  const eksikler: LogoEksik[] = [];
  if (!dolu(k.stokKodu)) eksikler.push('stok_kodu');
  if (!dolu(k.ad)) eksikler.push('ad');
  if (!dolu(k.birim)) eksikler.push('birim');
  // Hizmet tür karşılığına girmez (Logo'da ayrı hizmet kartıdır); eksik sayılmaz.
  if (k.tur !== 'hizmet' && !dolu(k.logoKartTuru)) eksikler.push('tur_karsiligi');
  // Birimi olmayan kartın birim karşılığı da yoktur; iki eksik ayrı görünür.
  if (!dolu(k.logoBirimSeti)) eksikler.push('birim_karsiligi');
  return eksikler;
}

// MKL-3: Logo kaydı olan kartın birimi (`kayit.com.birim`) değişmez. Karşılaştırma veritabanının `#>> '{com,birim}'` okumasıyla aynıdır.
const birimMetni = (kayit: Nesne): string | null => {
  const com = kayit['com'];
  if (!nesneMi(com) || com['birim'] === undefined || com['birim'] === null) return null;
  return typeof com['birim'] === 'string' ? com['birim'] : JSON.stringify(com['birim']);
};
export const logoBirimiDegistiMi = (kayitli: Nesne, yeni: Nesne): boolean => birimMetni(kayitli) !== birimMetni(yeni);

// S4 b (#777): Logo'ya gitmiş kartın adı değişince Logo'daki kart güncellenir. Ad veritabanının okumasıyla aynıdır
// (`kayit.com.ad` dolu metin, kırpılmış; değilse null): yalnız boşluğu değişen ad değişmiş sayılmaz.
const adMetni = (kayit: Nesne): string | null => {
  const com = kayit['com'];
  if (!nesneMi(com) || typeof com['ad'] !== 'string') return null;
  const ad = com['ad'].replace(/^ +| +$/g, '');
  return ad === '' ? null : ad;
};
export const logoAdiDegistiMi = (kayitli: Nesne, yeni: Nesne): boolean => adMetni(kayitli) !== adMetni(yeni);

export type LogoGuncellemeSonucu = { ad: string | null } & ({ tamam: true } | { hata: string });
// Logo'nun güncelleme cevabı; `ad` kuyruktaki ad olduğu gibi döner. Gönderilen ad karttaki güncel addan farklıysa ad bu arada yine değişmiştir: güncelleme bekliyor kalır,
// sonraki tur yeni adı gönderir (null: yazılacak bir şey yok). Boş hata metni reddedilir ('bos-hata').
export function logoGuncellemeSonucuDurumu(sonuc: LogoGuncellemeSonucu, guncelAd: string | null):
  { durum: 'gonderildi' | 'hata'; hata: string | null } | null | 'bos-hata' {
  if ('tamam' in sonuc) return sonuc.ad === guncelAd ? { durum: 'gonderildi', hata: null } : null;
  const hata = logoHataMetni(sonuc.hata);
  if (hata === null) return 'bos-hata';
  return sonuc.ad === guncelAd ? { durum: 'hata', hata } : null;
}

// MKL-5: Logo'nun döndürdüğü hata metni saklanır; boş hata kabul edilmez, uzun metin kesilir (son hata yalnız gösterilir).
export const LOGO_HATA_EN_COK = 2000;
export function logoHataMetni(hata: string): string | null {
  const metin = hata.trim();
  return metin === '' ? null : metin.slice(0, LOGO_HATA_EN_COK);
}

// Durum listesinde eksikli kartlar üstte; sonra hatalı, bekleyen ve gönderilmiş; aynı grupta sayı kimliği sırası.
const DURUM_SIRASI = { hata: 0, bekliyor: 1, gonderildi: 2 } as const;
export function logoDurumSirasi(a: { id: number; durum: keyof typeof DURUM_SIRASI; eksikler: readonly string[] },
  b: { id: number; durum: keyof typeof DURUM_SIRASI; eksikler: readonly string[] }): number {
  const eksikA = a.durum !== 'gonderildi' && a.eksikler.length > 0 ? 0 : 1;
  const eksikB = b.durum !== 'gonderildi' && b.eksikler.length > 0 ? 0 : 1;
  return eksikA - eksikB || DURUM_SIRASI[a.durum] - DURUM_SIRASI[b.durum] || a.id - b.id;
}

const LOGO_TICARI_MAL_KODU = '1';
// LB7 (kart #232): karşılık yalnız Logo'nun kabul ettiği değer. Tür: dört Logo kart türü kodu, demirbaşın karşılığı boş (LB2 a); birim: boşluksuz kod
// (Logo listesinde olup olmadığına Logo modülü gönderimde bakar). Boş değer her zaman geçer. Veritabanı kısıtı `malzeme_logo_karsiligi_izinli` aynısı.
export function logoKarsiligiHatasi(k: { cesit: 'tur' | 'birim'; tmiDegeri: string; logoDegeri: string | null }): string | null {
  if (k.logoDegeri === null) return null;
  if (k.cesit === 'birim') return /^\S+$/.test(k.logoDegeri) ? null : 'Logo birim seti kodu boşluk taşımaz.';
  if (k.tmiDegeri === 'demirbas') return 'Demirbaş şimdilik Logo\'ya gönderilmez; karşılığı boş kalır.';
  // Kart #1218: ticari mal yalnız Logo ticari mal kartına (1) gider; öteki türler ticari mal kodunu alamaz.
  if (k.tmiDegeri === 'ticari_mal') return k.logoDegeri === LOGO_TICARI_MAL_KODU ? null : `Ticari malın Logo kart türü ${LOGO_TICARI_MAL_KODU} (ticari mal) olabilir.`;
  const izinli = LOGO_KART_TURLERI.filter((t) => t.kod !== LOGO_TICARI_MAL_KODU);
  return izinli.some((t) => t.kod === k.logoDegeri)
    ? null
    : `Logo kart türü ${izinli.map((t) => `${t.kod} (${t.ad.toLocaleLowerCase('tr')})`).join(', ')} olabilir.`;
}

/* ---------------- Ölçü birimi ve kategori listesi (kart #163, SH4 a, ML2 b) ---------------- */

// Kartın birimi: `kayit.com.birim` dolu metin ise kırpılmış hali; yoksa null (ekranın varsayılan birimi uydurulmaz).
// Onaya gönderilen ya da aktif yapılan kartın birimi ve ayarda zorunlu işaretli alanları dolu olmalı (kullanıcı kararları
// "İstesin" ve "Denetlensin"); taslak eksikle kaydolur. Ayarın `kurallar[tür].zorunlu` değeri true olan alan kartın `g` nesnesinde
// aranır; ekranın bu kartta göstermediğini bildirdiği alan sayılmaz.
export function katalogOnayEksigi(kayit: Nesne, malzemeAyari: Record<string, unknown> | null, tur: string, uygulanmayan: readonly string[]): { alan: string; mesaj: string } | null {
  if (kartBirimi(kayit) === null) return { alan: 'kayit.com.birim', mesaj: 'Birimi boş kart onaya gönderilemez ve aktif yapılamaz; birimi seçin.' };
  const kurallar = malzemeAyari?.['kurallar'];
  const kural = nesneMi(kurallar) ? kurallar[tur] : undefined;
  const zorunlu = nesneMi(kural) && nesneMi(kural['zorunlu']) ? kural['zorunlu'] : {};
  const g = nesneMi(kayit['g']) ? kayit['g'] : {};
  const bos = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
  const eksik = Object.entries(zorunlu).filter(([k, z]) => z === true && !uygulanmayan.includes(k) && bos(g[k])).map(([k]) => k).sort();
  return eksik.length ? { alan: `kayit.g.${eksik[0]}`, mesaj: `Zorunlu alan boş: ${eksik.join(', ')}. Doldurup yeniden gönderin.` } : null;
}

export function kartBirimi(kayit: Nesne): string | null {
  const com = kayit['com'];
  if (!nesneMi(com) || typeof com['birim'] !== 'string') return null;
  const b = com['birim'].trim();
  return b === '' ? null : b;
}

export const BIRIM_EN_COK = 40;

// 323 b: tedarikçinin biriminden alınan kalem stoka kartın biriminde girer; kart tek alış birimi ve katsayısını tutar
// (1 alış birimi = katsayı kadar stok birimi). İki alan birlikte dolu ya da birlikte boştur; katsayı numeric(18,6) sütununa sığar.
export interface BirimDonusumu { alisBirimi: string; katsayi: string }
const KATSAYI = /^\d{1,12}(\.\d{1,6})?$/;
export function kartBirimDonusumu(kayit: Nesne): BirimDonusumu | null | { mesaj: string; alan: 'alisBirimi' | 'alisKatsayisi' } {
  const com = kayit['com'];
  if (!nesneMi(com)) return null;
  const b = com['alisBirimi'];
  const birim = typeof b === 'string' ? b.trim() : '';
  const k = com['alisKatsayisi'];
  const metin = typeof k === 'number' ? String(k) : typeof k === 'string' ? k.trim().replace(',', '.') : '';
  if (birim === '' && metin === '') return null;
  if (birim === '') return { mesaj: 'Alış katsayısı yazıldıysa alış birimi de seçilir.', alan: 'alisBirimi' };
  if (birim.length > BIRIM_EN_COK) return { mesaj: `Alış birimi en çok ${BIRIM_EN_COK} karakterdir.`, alan: 'alisBirimi' };
  if (birim === kartBirimi(kayit)) return { mesaj: 'Alış birimi stok biriminden farklı olmalı; aynı birimde dönüşüm gerekmez.', alan: 'alisBirimi' };
  if (metin === '') return { mesaj: 'Alış birimi seçildiyse katsayı da yazılır (1 alış birimi kaç stok birimi).', alan: 'alisKatsayisi' };
  if (!KATSAYI.test(metin) || Number(metin) <= 0) {
    return { mesaj: 'Alış katsayısı sıfırdan büyük bir sayı olmalı (en çok 6 ondalık, ör. 50 ya da 1,5).', alan: 'alisKatsayisi' };
  }
  return { alisBirimi: birim, katsayi: metin };
}
// Kart ve bekleyen talebin önerdiği kart aynı denetimden geçer; `onek` hatanın alan yoludur.
export function kartBirimDonusumleri(kayit: Nesne): { onek: string; kayit: Nesne; donusum: ReturnType<typeof kartBirimDonusumu> }[] {
  const talep = kayit['talep'];
  const yeni = nesneMi(talep) && nesneMi(talep['yeni']) ? talep['yeni'] : null;
  return [{ onek: 'kayit.com.', kayit }, ...(yeni ? [{ onek: 'kayit.talep.yeni.com.', kayit: yeni }] : [])]
    .map((x) => ({ ...x, donusum: kartBirimDonusumu(x.kayit) }));
}
const BIRIM_LISTESI = /^birim(\|.+)?$/;

const metinler = (d: unknown): string[] => (Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string').map((x) => x.trim()) : []);

// Prototipin malzeme ayarındaki liste farkından (listeler['birim'], listeler['birim|<tür>'] = { ekle, gizle }) birimlerin seçilebilirliği:
// birim, yerleşik olduğu ya da eklendiği listelerden en az birinde gizli değilse aktiftir. Tablodaki ama hiçbir listede olmayan birim pasiftir.
export function ayarBirimleri(
  deger: Nesne, tablo: readonly { kod: string; yerlesikListeler: readonly string[] }[],
): { kod: string; aktif: boolean }[] | { hata: string } {
  const listeler = nesneMi(deger['listeler']) ? deger['listeler'] : {};
  const uyelik = new Map<string, Set<string>>(tablo.map((b) => [b.kod, new Set(b.yerlesikListeler)]));
  const gizli = new Map<string, Set<string>>();
  for (const [liste, l] of Object.entries(listeler)) {
    if (!BIRIM_LISTESI.test(liste) || !nesneMi(l)) continue;
    for (const kod of metinler(l['ekle'])) {
      if (kod === '' || kod.length > BIRIM_EN_COK) return { hata: `Birim boş olamaz ve en çok ${BIRIM_EN_COK} karakterdir: "${kod}".` };
      if (!uyelik.has(kod)) uyelik.set(kod, new Set());
      uyelik.get(kod)!.add(liste);
    }
    gizli.set(liste, new Set(metinler(l['gizle'])));
  }
  return [...uyelik].map(([kod, l]) => ({ kod, aktif: [...l].some((liste) => !gizli.get(liste)?.has(kod)) }));
}

// Ayardaki eklenmiş kategoriler (kategoriler.<tür> = [{ key, ad, kod }]) ve gizlenenler (gizliKategoriler = ['<tür>|<key>']).
// Yerleşik kategori gizli değilse aktiftir; eklenmiş kategori ayarda durdukça ve gizli değilse aktiftir.
export type KategoriTuru = 'sarf' | 'demirbas' | 'hizmet';
export interface KategoriSatiri { tur: KategoriTuru; kod: string; ad: string; kisaKod: string | null; aktif: boolean }
export function ayarKategorileri(
  deger: Nesne, tablo: readonly { tur: KategoriTuru; kod: string; ad: string; kisaKod: string | null; yerlesik: boolean }[],
): KategoriSatiri[] | { hata: string } {
  const gizli = new Set(metinler(deger['gizliKategoriler']));
  const kategoriler = nesneMi(deger['kategoriler']) ? deger['kategoriler'] : {};
  const sonuc = new Map<string, KategoriSatiri>();
  for (const k of tablo) sonuc.set(`${k.tur}|${k.kod}`, { tur: k.tur, kod: k.kod, ad: k.ad, kisaKod: k.kisaKod, aktif: false });
  const ayarda = new Set<string>();
  for (const tur of ['sarf', 'demirbas'] as const) {
    const l = kategoriler[tur];
    if (!Array.isArray(l)) continue;
    for (const c of l) {
      if (!nesneMi(c)) continue;
      const kod = typeof c['key'] === 'string' ? c['key'].trim() : '';
      const ad = typeof c['ad'] === 'string' ? c['ad'].trim() : '';
      const kisa = typeof c['kod'] === 'string' && c['kod'].trim() !== '' ? c['kod'].trim() : null;
      if (kod === '' || kod.length > 40 || ad === '' || ad.length > 80 || (kisa !== null && kisa.length > 10)) {
        return { hata: `Kategori anahtarı (en çok 40), adı (en çok 80) ve kısa kodu (en çok 10) geçerli olmalı: "${kod || ad}".` };
      }
      const anahtar = `${tur}|${kod}`;
      if (tablo.some((t) => t.yerlesik && `${t.tur}|${t.kod}` === anahtar)) continue;
      ayarda.add(anahtar);
      sonuc.set(anahtar, { tur, kod, ad, kisaKod: kisa, aktif: false });
    }
  }
  for (const k of tablo) if (k.yerlesik) ayarda.add(`${k.tur}|${k.kod}`);
  return [...sonuc].map(([anahtar, k]) => ({ ...k, aktif: ayarda.has(anahtar) && !gizli.has(anahtar) }));
}

/* ---------------- Örnek veri (kart #906) ---------------- */

// Örnek kartların kimliği `ornek-<anahtar>`; stok kodunu sunucu verdiği için (firma kodu ayarına göre de değişir) başka modüller
// örnek kartı bu anahtarla bulur.
export const ORNEK_MALZEME_ANAHTARLARI = ['mil', 'flans', 'burc', 'cubuk', 'levha', 'kesme-yagi', 'isil-islem'] as const;
export type OrnekMalzemeAnahtari = (typeof ORNEK_MALZEME_ANAHTARLARI)[number];
export const ornekKartKimligi = (anahtar: OrnekMalzemeAnahtari): string => `ornek-${anahtar}`;
