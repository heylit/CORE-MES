import { eskiSurumMu } from '#paylasilan/hata.ts';
import { ROTA_KOMUTLARI } from './rota-komutlari.ts';
import type { RotaKomutu } from './rota-komutlari.ts';
import { EMIR_KOMUTLARI } from './emir-komutlari.ts';
import { BOS_ANLIK, KAYNAK_KOMUTLARI, KAYNAK_OKUMALARI, koleksiyonKur, komutIstegi, takvimEki } from './kaynak-komutlari.ts';
import { planSenaryoKomutlari } from './plan-senaryo-komutlari.ts';
import type { PlanSenaryoKomutu } from './plan-senaryo-komutlari.ts';
import { PLAN_STOK_KOMUTLARI } from './plan-stok-komutlari.ts';
import { STATU_KOMUTLARI } from './statu-komutlari.ts';
import { highsYukle } from './highs.ts';
import type { TakvimEki, KaynakAnlik, KaynakKoleksiyonu, KomutTanimi } from './kaynak-komutlari.ts';
import type { DurumCevabi, KapasiteCevabi, SilCevabi, YazCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { BedelAyari, MotorUyarilariCevabi, MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';

// Çerçevedeki köprünün istekleri (kanal "recete-rota") TMI uçlarına çevrilir. Kural ve yetki sunucudadır; burası yalnız taşır ve
// yalnız bilinen istek türlerini geçirir.
export type KopruIsleyici = (tip: string, veri: unknown) => Promise<unknown>;
// eskiSurum: kayıt okunduktan sonra başkası değiştirdi (sahibinin 409'u); çerçeve bunu öteki çakışmalardan ayırıp uyarır. alan: sahibinin
// reddettiği gövde alanı (ör. adimlar.2.islemSuresiDk); çerçeve sorunlu adımı ekrandaki numarasıyla söyler.
export interface KopruHatasi { hata: string; durum: number; eskiSurum?: true; alan?: string }

type EkranYerlesimi = MotorYerlesimiCevabi['ekranYerlesimi'];
type Nesne = Record<string, unknown>;
const tamSayi = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) < 1e10;
function fasonTahminSorgusu(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0 || v.length > 100) throw new Error('Geçersiz tahmin sorgusu.');
  return v.map((q: unknown) => {
    const o = q !== null && typeof q === 'object' ? q as Record<string, unknown> : {};
    const adet = o['adet'];
    if (!tamSayi(o['malzemeNo']) || !tamSayi(o['operasyonTipiId']) || !tamSayi(o['firmaId']) || typeof adet !== 'number' || !(adet >= 1e-6 && adet < 1e9)) {
      throw new Error('Geçersiz tahmin sorgusu.');
    }
    return `${String(o['malzemeNo'])}-${String(o['operasyonTipiId'])}-${String(o['firmaId'])}-${String(Math.round(adet * 1e6) / 1e6)}`;
  }).join(',');
}
const nesne = (v: unknown): Nesne => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Nesne : {});
const metin = (v: unknown, alan: string): string => {
  if (typeof v !== 'string' || v === '') throw new Error(`Geçersiz ${alan}.`);
  return v;
};
const surum = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

// İzinli komutlar (kart #1104, #1106): prototipin eylem adı -> sahibi modülün VAR OLAN ucu. Tabloda olmayan komut çerçeveye hata döner.
// Gövde yalnız listelenen alanlarla kurulur; kural, yetki ve sürüm denetimi sahibi modüldedir (uç reddederse hata çerçeveye taşınır).
// Kaynak komutları `kaynak-komutlari.ts` dosyasındadır (KAYNAK_KOMUTLARI): tablo zod taşımaz; `paylasilan` sözleşmesi zod taşıdığı için
// istemciye değer olarak giremez. Sunucu testi aynı tabloyla sahibin ucunu dener. Sekmeler bağlandıkça komutlar buraya eklenir.
interface HazirKomut { yol: string; govde: Nesne; tekrarKorumali?: boolean }
// Sahibin kaydını okuyup ya da kartı kuran komutlar (kart #1105): gövdeyi köprü hazırlar. Öteki komutlar KomutTanimi tablosudur.
// baglam: köprünün son okuduğu durumun maliyet dilimi (sürüm buradan gelir; çerçeveye sürüm sorulmaz). null: dilim okunmadı ya da yetki yok.
export interface KomutBaglami { maliyet: DurumCevabi['maliyet'] }
export interface OzelKomut { hazirla: (girdi: Nesne, baglam: KomutBaglami) => HazirKomut | Promise<HazirKomut> }
const suz = (girdi: Nesne, alanlar: readonly string[]): Nesne => {
  const govde: Nesne = {};
  for (const alan of alanlar) if (Object.hasOwn(girdi, alan)) govde[alan] = girdi[alan];
  return govde;
};
const OPERASYON_ALANLARI = ['kod', 'ad', 'grup', 'aktif', 'kisaltma', 'varsayilanAyarDk', 'varsayilanBirimDk', 'varsayilanIstasyonId'] as const;
const pozitifTamSayi = (v: unknown, alan: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new Error(`Geçersiz ${alan}.`);
  return v;
};

// Birim maliyet yazma (kart #1187): yalnız bu üç tür, yalnız TRY. Anahtar kalemin sayı kimliğidir; sürüm köprünün son okuduğu satırdandır
// (satır yoksa ilk giriş: null). Yetkiyi (finans.yonet) sunucu verir; köprü yazma yetkisini ayrıca varsaymaz.
const MALIYET_TURLERI = ['malzeme', 'istasyon', 'kisi'] as const;
const AZAMI_MALIYET = 1_000_000_000;
export function maliyetIstegi(girdi: Nesne, baglam: KomutBaglami): HazirKomut {
  const tur = MALIYET_TURLERI.find((t) => t === girdi['tur']);
  if (tur === undefined) throw new Error('Geçersiz maliyet türü.');
  const ham = girdi['anahtar'];
  const anahtar = pozitifTamSayi(typeof ham === 'string' && /^[1-9]\d{0,9}$/.test(ham) ? Number(ham) : ham, 'anahtar');
  const tutar = girdi['birimMaliyet'];
  if (typeof tutar !== 'number' || !Number.isFinite(tutar) || tutar < 0 || tutar > AZAMI_MALIYET) throw new Error('Geçersiz birim maliyet.');
  if (baglam.maliyet === null) throw new Error('Geçersiz kayıt: maliyetler okunmadı; ekranı yenileyip yeniden deneyin.');
  const mevcut = baglam.maliyet[tur][String(anahtar)];
  return { yol: `/finans/maliyetler/${tur}/yaz`, govde: { anahtar, birimMaliyet: tutar, paraBirimi: 'TRY', surum: mevcut?.surum ?? null } };
}

interface OperasyonTipiSatiri {
  id: number; kod: string; ad: string; grup: string; aktif: boolean; kisaltma: string | null;
  varsayilanAyarDk: string | null; varsayilanBirimDk: string | null; varsayilanIstasyonId: number | null; surum: number;
}

export const IZINLI_KOMUTLAR: Readonly<Record<string, KomutTanimi | OzelKomut | RotaKomutu | PlanSenaryoKomutu>> = {
  // İstasyonlar: operasyon tipi ekleme (POST /operasyon-tipleri).
  'operasyon-tipi-ekle': { yol: '/operasyon-tipleri', alanlar: OPERASYON_ALANLARI },
  // İstasyonlar: operasyon tipi düzenleme (POST /operasyon-tipleri/:id/guncelle). Sahibi ad, grup ve aktif alanlarını ister ve gönderilmeyen
  // aktif alanını "aktif" sayar; durum cevabı bunları ve sürümü taşımadığı için kayıt yazmadan hemen önce sahibinin listesinden okunur,
  // çerçevenin değiştirdiği alanlar üstüne konur (pasif tip yeniden etkinleşmez). Listede olmayan tip 404 gibi reddedilir.
  'operasyon-tipi-duzenle': {
    hazirla: async (girdi: Nesne) => {
      const id = pozitifTamSayi(girdi['id'], 'operasyon tipi');
      const liste = await api.get<{ operasyonTipleri: OperasyonTipiSatiri[] }>('/operasyon-tipleri?pasifler=true');
      const kayit = liste.operasyonTipleri.find((t) => t.id === id);
      if (kayit === undefined) throw new ApiHatasi(404, { kod: 'BULUNAMADI', mesaj: 'Operasyon tipi bulunamadı.' });
      const mevcut = { ad: kayit.ad, grup: kayit.grup, aktif: kayit.aktif, kisaltma: kayit.kisaltma, varsayilanAyarDk: kayit.varsayilanAyarDk,
        varsayilanBirimDk: kayit.varsayilanBirimDk, varsayilanIstasyonId: kayit.varsayilanIstasyonId };
      return { yol: `/operasyon-tipleri/${String(id)}/guncelle`, govde: { ...mevcut, ...suz(girdi, OPERASYON_ALANLARI), surum: kayit.surum } };
    },
  },
  // Stok: statü atlatma (kart #1169, POST /stok/statu-degistir, `stok.statu-degistir`). Statü kimlikleri `recete_rota_statu.id`, null serbest
  // stoktur; konum ve parti çerçevenin seçtiği bakiye satırından gelir. Kural (yeterli bakiye, statü malzemenin mi) stoktadır.
  'statu-degistir': {
    yol: '/stok/statu-degistir', alanlar: ['malzemeId', 'konumId', 'partiId', 'kaynakStatuId', 'hedefStatuId', 'miktar', 'aciklama'], tekrarKorumali: true,
  },
  // Finans: birim maliyetler (kart #1187, POST /finans/maliyetler/:tur/yaz, `finans.yonet`).
  'maliyet-yaz': { hazirla: (girdi: Nesne, baglam: KomutBaglami) => maliyetIstegi(girdi, baglam) },
  ...KAYNAK_KOMUTLARI,
  ...PLAN_STOK_KOMUTLARI,
  // Plan stüdyosu: senaryo plan modülünün taslağıdır (`plan-senaryo-komutlari.ts`).
  ...planSenaryoKomutlari((yol) => api.get(yol)),
  // Rota (kart #1184): revizyon açma, kaydetme ve onay akışı rota modülünün uçlarına gider.
  ...ROTA_KOMUTLARI,
  // Emirler (kart #1185): emir aç, serbest bırak, iptal, parti bölme ve birleştirme (`emir-komutlari.ts`).
  ...EMIR_KOMUTLARI,
  // Elle tanımlanan statü: Reçete ve Rota'nın kendi tablosu (`statu-komutlari.ts`).
  ...STATU_KOMUTLARI,
};
const komutTanimi = (ad: string): KomutTanimi | OzelKomut | RotaKomutu | PlanSenaryoKomutu => {
  const tanim = Object.hasOwn(IZINLI_KOMUTLAR, ad) ? IZINLI_KOMUTLAR[ad] : undefined;
  if (tanim === undefined) throw new Error(`Bilinmeyen komut: ${ad}`);
  return tanim;
};

// Cihaza özel anahtarlar kabuğun tarayıcı deposunda bu önekle durur (çerçeve opak kökende, kendi deposu yok).
export const CIHAZ_ONEKI = 'tmi.recete-rota.';
// Tercih kaydıdır (istasyon seçimi, menü daraltma); büyük değer kabul edilmez.
const AZAMI_CIHAZ_DEGERI = 10_000;

const tarayiciDeposu = (): Storage | null => {
  try { return window.localStorage; } catch { return null; }
};

export function cihazDegerleriOku(anahtarlar: readonly string[]): Record<string, string> {
  const depo = tarayiciDeposu();
  const sonuc: Record<string, string> = {};
  for (const anahtar of anahtarlar) {
    try {
      const deger = depo?.getItem(CIHAZ_ONEKI + anahtar) ?? null;
      if (deger !== null) sonuc[anahtar] = deger;
    } catch { /* depo kapalıysa prototip varsayılanla açılır */ }
  }
  return sonuc;
}

// Çerçevenin ihtiyaç duyduğu, kayıt sürümü olmayan ek alanlar (sürümün kendisi çerçeveye verilmez, köprüde kalır). null: sahibinin
// okuma yetkisi yok. Makine notu makine durumunun açıklamasıdır; görev kişi kaydındadır.
export interface KaynakEki {
  makineNotu: Record<string, string | null> | null;
  kisiGorevi: Record<string, string | null> | null;
  // İstasyonlar sahibinin türü ve seçilen kapasite kaynağı (seçilmemişse null; çerçeve türden türetir).
  istasyonTipi: Record<string, string | null> | null;
  kapasiteKaynagi: Record<string, string | null> | null;
  // Vardiya modülünün iş merkezi haftası ve kişi vardiyası; okunamadıysa null.
  takvim: TakvimEki | null;
  // Plan kapasitesi (kart #1324): onaylı izin, planlı fazla mesai ve atama payı; okunamadıysa null (prototip vardiyayla hesaplar).
  kapasite: KapasiteCevabi | null;
}

// Sahibinin kendi okuma uçları (KAYNAK_OKUMALARI): sürüm ve tam kayıt buradan gelir. Biri okunamazsa (yetki yok) o koleksiyon null kalır;
// o türün güncellemesi "okunmadı" diye reddedilir, öteki türler etkilenmez.
// Vardiya takvimi aynı okumadan çıkar (vardiyalar koleksiyonu da /vardiya-takvimi'dir): uç bir kez okunur.
async function anlikOku(): Promise<{ anlik: KaynakAnlik; takvim: TakvimEki | null }> {
  const ham = await Promise.all(KAYNAK_OKUMALARI.map((o) => api.get<unknown>(o.yol).catch(() => null)));
  const anlik: Record<string, KaynakKoleksiyonu | null> = { ...BOS_ANLIK };
  KAYNAK_OKUMALARI.forEach((o, i) => {
    try { anlik[o.koleksiyon] = ham[i] === null ? null : koleksiyonKur(ham[i], o.alan, o.anahtar); } catch { anlik[o.koleksiyon] = null; }
  });
  const takvimHam = ham[KAYNAK_OKUMALARI.findIndex((o) => o.yol === '/vardiya-takvimi')] ?? null;
  return { anlik: anlik as unknown as KaynakAnlik, takvim: takvimHam === null ? null : takvimEki(takvimHam) };
}

async function kapasiteOku(): Promise<KapasiteCevabi | null> {
  try { return await api.get<KapasiteCevabi>('/recete-rota/kapasite'); } catch { return null; }
}

const alanHaritasi = (k: KaynakKoleksiyonu | null, alan: string): Record<string, string | null> | null => {
  if (k === null) return null;
  const sonuc: Record<string, string | null> = {};
  for (const [id, kayit] of k) { const d = kayit[alan]; sonuc[String(id)] = typeof d === 'string' ? d : null; }
  return sonuc;
};
const ekOzeti = (anlik: KaynakAnlik, takvim: TakvimEki | null, kapasite: KapasiteCevabi | null): KaynakEki => ({
  takvim,
  kapasite,
  makineNotu: alanHaritasi(anlik.makineDurumlari, 'aciklama'),
  kisiGorevi: alanHaritasi(anlik.kisiler, 'gorev'),
  istasyonTipi: alanHaritasi(anlik.istasyonlar, 'tip'),
  kapasiteKaynagi: alanHaritasi(anlik.istasyonlar, 'kapasiteKaynagi'),
});

// Stok sekmesinin okuması (kart #1169): statü tanımları Reçete ve Rota'dan, statü kırılımı ve bakiye satırları stoktan. Çerçeve yalnız
// gösterdiği kartların kimliklerini verir. Okuma yetkisi olmayan dilim null'dır (sıfır uydurulmaz); bir kartın okunamaması ötekileri
// etkilemez.
export interface StokStatusu { id: number; malzemeNo: string; kaynakAdim: string; ad: string }
export interface StokBakiyesi { konumId: number; konumKod: string; partiId: number | null; partiEtiketi: string | null; statuId: number | null; miktar: string }
export interface StokMalzemesi { kirilim: Array<{ statuId: number | null; miktar: string }>; bakiyeler: StokBakiyesi[] }
export interface StokOkumasi { statuler: StokStatusu[] | null; malzemeler: Record<string, StokMalzemesi | null> | null }
const AZAMI_STOK_KARTI = 200;

async function stokOku(girdi: Nesne): Promise<StokOkumasi> {
  const kimlikler = girdi['malzemeIdler'];
  if (!Array.isArray(kimlikler) || kimlikler.length > AZAMI_STOK_KARTI) throw new Error('Geçersiz malzeme listesi.');
  const idler = [...new Set(kimlikler.map((k) => pozitifTamSayi(k, 'malzeme')))];
  const statuler = await api.get<{ statuler: StokStatusu[] }>('/recete-rota/statuler')
    .then((c) => c.statuler.map((x) => ({ id: x.id, malzemeNo: x.malzemeNo, kaynakAdim: x.kaynakAdim, ad: x.ad })), () => null);
  let yetkiYok = false;
  const okunan = await Promise.all(idler.map(async (id) => {
    try {
      const c = await api.get<{ statuKirilimi: StokMalzemesi['kirilim']; bakiyeler: StokBakiyesi[] }>(`/stok/malzemeler/${String(id)}`);
      return {
        kirilim: c.statuKirilimi.map((k) => ({ statuId: k.statuId, miktar: k.miktar })),
        bakiyeler: c.bakiyeler.map((b) => ({ konumId: b.konumId, konumKod: b.konumKod, partiId: b.partiId, partiEtiketi: b.partiEtiketi, statuId: b.statuId, miktar: b.miktar })),
      };
    } catch (h) {
      if (h instanceof ApiHatasi && h.durum === 403) yetkiYok = true;
      return null;
    }
  }));
  if (yetkiYok) return { statuler, malzemeler: null };
  const malzemeler: Record<string, StokMalzemesi | null> = {};
  idler.forEach((id, i) => { malzemeler[String(id)] = okunan[i] ?? null; });
  return { statuler, malzemeler };
}

// Emir açılışında seçilen proje ve sipariş satırı (224). satır null: proje tek satırlıdır ya da satır seçilmedi; sunucu bağlar.
export interface EmirSecimi { projeId: number; siparisSatiriId: number | null }
export type EmirSecimiSor = (secenekler: AcilisSecenekleri) => Promise<EmirSecimi | null>;

// Prototip emir açarken proje sormaz (yalnız 220 a değişir): köprü komutu göndermeden önce seçenekleri okur, proje gereken türde
// seçimi pencereye sorar ve gövdeye ekler. Proje gerekmeyen türde (stok, numune) gövde olduğu gibi gider.
async function emirAcilisi(girdi: Nesne, sor: EmirSecimiSor | undefined): Promise<Nesne> {
  const malzemeNo = Number(girdi['itemId']);
  if (!tamSayi(malzemeNo)) throw new Error('Geçersiz ürün.');
  const tur = typeof girdi['tur'] === 'string' && girdi['tur'] !== '' ? `&emirTuru=${encodeURIComponent(girdi['tur'])}` : '';
  const secenekler = await api.get<AcilisSecenekleri>(`/adimli-emirler/acilis-secenekleri?malzemeNo=${String(malzemeNo)}${tur}`);
  if (!secenekler.projeZorunlu) return girdi;
  if (secenekler.projeler.length === 0) {
    throw new ApiHatasi(422, { kod: 'GECERSIZ', mesaj: 'Bu ürün için açık proje yok; üretim emri bir projeyle açılır.' });
  }
  const secim = sor === undefined ? null : await sor(secenekler);
  if (secim === null) throw new ApiHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Proje seçilmedi; emir açılmadı.' });
  return { ...girdi, projeId: secim.projeId, ...(secim.siparisSatiriId === null ? {} : { siparisSatiriId: secim.siparisSatiriId }) };
}

// Acil sipariş denemesi canlıda taslak sipariş olur (286 b): her deneme için müşteri seçilir. Prototip müşteri sormaz; köprü canlıya
// alma komutundan önce taslağın denemelerini okur, acil deneme varsa seçimi pencereye sorar ve gövdeye ekler.
export interface AcilDeneme { degisiklikId: number; ozet: string }
export interface AcilMusteri { degisiklikId: number; firmaId: number }
export type AcilMusteriSor = (denemeler: AcilDeneme[]) => Promise<AcilMusteri[] | null>;
const CANLIYA_ALMA_KOMUTLARI: ReadonlySet<string> = new Set(['plan-senaryo-canliya-al', 'plan-canliya-al']);

async function acilMusteriler(girdi: Nesne, sor: AcilMusteriSor | undefined): Promise<AcilMusteri[]> {
  const taslak = girdi['taslak'];
  if (!tamSayi(taslak)) return [];
  // Denemeler okunamazsa sorulmaz: acil deneme varsa plan modülü müşterisiz canlıya almayı kendisi reddeder.
  const c = await api.get<{ senaryolar: { id: number; degisiklikler: { id: number; tur: string; ozet: string }[] }[] }>('/plan/senaryolar').catch(() => null);
  const denemeler = (c?.senaryolar.find((x) => x.id === taslak)?.degisiklikler ?? [])
    .filter((d) => d.tur === 'acil_emir').map((d) => ({ degisiklikId: d.id, ozet: d.ozet }));
  if (denemeler.length === 0) return [];
  const secim = sor === undefined ? null : await sor(denemeler);
  if (secim === null) throw new ApiHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Acil sipariş için müşteri seçilmedi; taslak canlıya alınmadı.' });
  return secim;
}

// kartTaslakAcabilir: oturumda `rota.yaz` var. Yoksa ekran açılışı rotaya yazma denemez (sunucu zaten reddeder; uçtan uca deneme Y4).
// bedelAyariYazabilir: oturumda `plan.bedel-ayari` var; çerçeve öncelik ayarlarını yalnız o zaman düzenlenebilir çizer (yetkiyi sunucu verir).
// emirSecimi: emir açılışında proje (ve gerekirse sipariş satırı) seçimi; verilmezse proje gereken emir açılmaz.
// acilMusteriSecimi: acil sipariş denemesi olan taslağın canlıya alınmasında müşteri seçimi; verilmezse böyle taslak canlıya alınmaz.
// planVerisi: her durum okumasında istasyon, makine ya da iş merkezi listesi okunamadıysa (sahibinin okuma yetkisi yok) true; kabuk
// plan sekmelerinde eksik veriyle çizilen planı göstermez (304 a).
// motorDurumu: motor yerleşimi okunamaz olunca true, yeniden okununca false (yalnız değişince). Okunamazken ekran kendi sırasıyla
// çizer (öncelik teslimden önce) ve sunucunun sırasından ayrılabilir; kabuk bunu kullanıcıya söyler.
// motorUyarilari: motorun uygulayamadığı kısıtlar (307 a), her okunan yerleşimde; liste değişince çağrılır. Okunamayan yerleşimde dokunulmaz.
// highsVerilir: açık çerçeve HiGHS alabilir mi (yalnız planlama çerçevesi, 361 b); verilmezse istek reddedilir.
// yerlesimCizilmez: açık çerçeve motorun yerleşimini çizmez (planlama çerçevesi): yerleşim hiç istenmez, çünkü sunucu onu her okumada
// bütün planı yeniden hesaplayarak kurar; yalnız uyarılar motorsuz okunur. Yerleşim okunmadığı için motorDurumu çağrılmaz.
export function kopruKur(
  cihazAnahtarlari: readonly string[] = [],
  secenek: {
    kartTaslakAcabilir?: boolean; bedelAyariYazabilir?: boolean; emirSecimi?: EmirSecimiSor; acilMusteriSecimi?: AcilMusteriSor; planVerisi?: (okunamadi: boolean) => void; motorDurumu?: (okunamadi: boolean) => void;
    motorUyarilari?: (uyarilar: readonly string[]) => void; highsVerilir?: () => boolean; yerlesimCizilmez?: () => boolean;
  } = {},
): KopruIsleyici {
  // Çerçeve kayıtları okuduğu andaki sürümler: güncelleme bu sürümle gider, başkası arada yazdıysa sahibi 409 döner. Her başarılı
  // komuttan ve her okumadan sonra yenilenir. Kaynak komutları ve okumaları sırayla koşar (iki hızlı değişiklik birbirinin sürümünü
  // eskitmesin).
  let anlik: KaynakAnlik = BOS_ANLIK;
  let sira: Promise<void> = Promise.resolve();
  const sirala = <T,>(is: () => Promise<T>): Promise<T> => {
    const sonuc = sira.then(is);
    sira = sonuc.then(() => undefined, () => undefined);
    return sonuc;
  };
  let maliyetAnlik: DurumCevabi['maliyet'] = null;
  // Plan ekranı işleri plan motorunun yerleşimiyle çizer (220 a, planRun opts.yerlesim). Uç okunamazsa (yetki, ağ) ekran kendi hesabını yapar.
  let motorOkunamadi = false;
  const motorDurumu = (okunamadi: boolean): void => {
    if (okunamadi === motorOkunamadi) return;
    motorOkunamadi = okunamadi;
    secenek.motorDurumu?.(okunamadi);
  };
  let uyariImzasi = '[]';
  const motorUyarilari = (uyarilar: readonly string[]): void => {
    const imza = JSON.stringify(uyarilar);
    if (imza === uyariImzasi) return;
    uyariImzasi = imza;
    secenek.motorUyarilari?.(uyarilar);
  };
  const motorYerlesimiOku = (): Promise<EkranYerlesimi | null> =>
    api.get<MotorYerlesimiCevabi>('/plan/motor-yerlesimi').then(
      (c) => { motorDurumu(false); motorUyarilari(c.uyarilar); return c.ekranYerlesimi ?? null; },
      () => { motorDurumu(true); return null; },
    );
  // Okunamazsa uyarı listesine dokunulmaz (yerleşimdeki gibi).
  const yalnizUyariOku = (): Promise<null> =>
    api.get<MotorUyarilariCevabi>('/plan/motor-uyarilari').then((c) => { motorUyarilari(c.uyarilar); return null; }, () => null);
  const durumOku = (): Promise<DurumCevabi & { planYerlesim: EkranYerlesimi | null }> =>
    Promise.all([api.get<DurumCevabi>('/recete-rota/durum'), secenek.yerlesimCizilmez?.() === true ? yalnizUyariOku() : motorYerlesimiOku()])
      .then(([d, planYerlesim]) => {
        maliyetAnlik = d.maliyet;
        secenek.planVerisi?.(d.stations === null || d.machines === null || d.wcs === null);
        return { ...d, planYerlesim };
      });
  // Malzemeler'de yeni onaylanan kartın ilk rota taslağı ekran açılırken açılır (#688), dakikalık tarama beklenmez. Ekranın ilk
  // okumasında bir kez, yalnız rota yazabilene denenir; açılamazsa durum yine okunur (tarama sonra açar).
  let kartTaslaklari: Promise<unknown> | null = secenek.kartTaslakAcabilir === true ? null : Promise.resolve(null);
  const ilkDurumOku = (): Promise<DurumCevabi> =>
    (kartTaslaklari ??= api.post<unknown>('/rota/karttan-taslaklar').catch(() => null)).then(durumOku);

  return async (tip, veri) => {
    const v = nesne(veri);
    switch (tip) {
      case 'cihaz-yaz': {
        const anahtar = metin(v['anahtar'], 'anahtar');
        if (!cihazAnahtarlari.includes(anahtar)) throw new Error('Geçersiz anahtar.');
        const deger = v['deger'];
        if (deger !== null && (typeof deger !== 'string' || deger.length > AZAMI_CIHAZ_DEGERI)) throw new Error('Geçersiz değer.');
        try {
          if (deger === null) tarayiciDeposu()?.removeItem(CIHAZ_ONEKI + anahtar);
          else tarayiciDeposu()?.setItem(CIHAZ_ONEKI + anahtar, deger);
        } catch { /* depo kapalı ya da dolu: tercih bu sekmede kalır */ }
        return { yazildi: true };
      }
      case 'kayit-yaz':
        return api.post<YazCevabi>('/recete-rota/kayitlar/yaz', {
          anahtar: metin(v['anahtar'], 'anahtar'),
          bicim: v['bicim'] === 'metin' ? 'metin' : 'json',
          deger: v['deger'] ?? null,
          beklenenSurum: surum(v['beklenenSurum']),
        });
      case 'kayit-sil': {
        const beklenen = surum(v['beklenenSurum']);
        if (beklenen === null) throw new Error('Geçersiz sürüm.');
        return api.post<SilCevabi>('/recete-rota/kayitlar/sil', { anahtar: metin(v['anahtar'], 'anahtar'), beklenenSurum: beklenen });
      }
      case 'durum-oku':
        return ilkDurumOku();
      case 'stok-oku':
        return stokOku(v);
      // Canlı plan sürümü (hafif): ekran kısa aralıkla sorar, başkası canlıya aldıysa uyarır.
      case 'plan-surum':
        return api.get<unknown>('/plan/surum');
      // Plan öncelik ayarları (taban bedel, oranlar, eşikler): plan sayfasını gören herkes okur.
      case 'bedel-ayari-oku':
        return { ayar: await api.get<BedelAyari>('/plan/bedel-ayari'), yazabilir: secenek.bedelAyariYazabilir === true };
      // Termini girilmemiş fason adımın süre tahmini (satın almanın geçmiş teslimatı); cevap sorgularla aynı sırada gün ya da null.
      // HiGHS betiği ve wasm ikilisi (361 b): uç değil, uygulamanın kendi dosyası; yalnız planlama çerçevesine.
      case 'highs-oku':
        if (secenek.highsVerilir?.() !== true) throw new Error('Geçersiz istek: HiGHS bu çerçevede açık değil.');
        return highsYukle();
      // Süreler bölümü (169 c): revizyonun teorik süresi, plan için etkin süresi ve tür başına bekleyen ölçümü; makine verilirse o makinenin
      // görünümü. Sahibi rota modülüdür; ekran adımı OP numarasıyla eşler.
      case 'sure-oku': {
        if (!tamSayi(v['revizyonId'])) throw new Error('Geçersiz revizyon.');
        const makine = v['makineId'];
        if (makine !== null && makine !== undefined && !tamSayi(makine)) throw new Error('Geçersiz makine.');
        return api.get<SurelerCevabi>(`/rota/revizyonlar/${String(v['revizyonId'])}/sureler${tamSayi(makine) ? `?makineId=${String(makine)}` : ''}`);
      }
      case 'fason-tahmin':
        return api.get<unknown>(`/recete-rota/fason-tahminleri?s=${fasonTahminSorgusu(v['sorgular'])}`);
      // Bağlı durum ve sürümler: sürümler durumdan ÖNCE okunur; arada biri yazarsa sürüm eski, durum yeni kalır ve güncelleme
      // güvenli tarafta (409) reddedilir; tersi sırada ekranın görmediği değişikliğin üstüne yazılırdı.
      case 'kaynak-oku':
        return sirala(async () => {
          const [okunan, kapasite] = await Promise.all([anlikOku(), kapasiteOku()]);
          anlik = okunan.anlik;
          return { durum: await durumOku(), ek: ekOzeti(anlik, okunan.takvim, kapasite) };
        });
      case 'komut': {
        const ad = metin(v['ad'], 'komut adı');
        const tanim = komutTanimi(ad);
        // Seçim penceresi sıranın dışında beklenir: kullanıcı düşünürken öteki komutlar ve okumalar durmaz.
        const girdi = ad === 'emir-ac' ? await emirAcilisi(nesne(v['govde']), secenek.emirSecimi) : nesne(v['govde']);
        const musteriler = CANLIYA_ALMA_KOMUTLARI.has(ad) ? await acilMusteriler(girdi, secenek.acilMusteriSecimi) : [];
        return sirala(async () => {
          const hazir = 'hazirla' in tanim ? { tekrarKorumali: false, ...(await tanim.hazirla(girdi, { maliyet: maliyetAnlik })) } : komutIstegi(tanim, girdi, anlik);
          const istek = musteriler.length === 0 ? hazir : { ...hazir, govde: { ...hazir.govde, acilMusteriler: musteriler } };
          const sonuc = istek.tekrarKorumali
            ? await tekrarKorumaliGonder((d) => api.post<unknown>(istek.yol, istek.govde, d))
            : await api.post<unknown>(istek.yol, istek.govde);
          // Rota komutları sık koşar ve kaynak sürümlerine dokunmaz: yalnız bağlı durum yeniden okunur.
          if ('hafif' in tanim) return { sonuc, durum: await durumOku().catch(() => null), ek: null };
          // Komut uygulandı; durum okunamazsa komut başarısız sayılmaz (çerçeve `kaynakOku()` ile yeniden ister). Sürümler önce okunur.
          const [okunan, kapasite] = await Promise.all([anlikOku(), kapasiteOku()]);
          anlik = okunan.anlik;
          const durum = await durumOku().catch(() => null);
          return { sonuc, durum, ek: ekOzeti(anlik, okunan.takvim, kapasite) };
        });
      }
      default:
        throw new Error(`Bilinmeyen istek: ${tip}`);
    }
  };
}

// Sunucu iletisi ve durum kodu çerçeveye taşınır (köprü çatışmayı ve büyük kaydı durum koduyla ayırır); ağ hatasının tarayıcı
// metni gösterilmez.
export function kopruHatasi(hata: unknown): KopruHatasi {
  if (hata instanceof ApiHatasi) {
    const alan = hata.govde.alan;
    return {
      hata: hata.sunucuIletisi ?? 'İşlem yapılamadı.', durum: hata.durum, ...(eskiSurumMu(hata.govde) ? { eskiSurum: true as const } : {}),
      ...(typeof alan === 'string' && alan !== '' ? { alan } : {}),
    };
  }
  if (hata instanceof Error && /^(Geçersiz|Bilinmeyen)/.test(hata.message)) return { hata: hata.message, durum: 400 };
  return { hata: 'Sunucuya ulaşılamadı. Bağlantıyı denetleyip yeniden deneyin.', durum: 0 };
}
