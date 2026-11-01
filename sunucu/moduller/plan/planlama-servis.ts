import type { Db } from '#cekirdek/db.ts';
import { cakisma, cokBuyuk, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type {
  DurumCevabi, KapasiteCevabi, PlanlamaCalismasiCevabi, PlanlamaSilGovdesi, PlanlamaYazGovdesi, SatinAlmaEkiCevabi,
} from '#paylasilan/sozlesme/planlama.ts';
import { KAPASITE_GUNU } from '#paylasilan/sozlesme/planlama.ts';
import type { KayitlarCevabi, SilCevabi, YazCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { isMerkezleri, istasyonlar, makineDurumlari } from '../istasyonlar/disari.ts';
import { kisiGorevi } from '../kisiler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  aktifMalzemeListesi, DURUM_ANAHTARI, degerBicimeUyarMi, degerCokBuyukMu, durumVeEmirler, KAYNAK_OKUMA, nulKarakteriVarMi, receteRotaDurumu, surumUyarMi,
} from '../recete-rota/disari.ts';
import {
  malzemeGelisTarihleri, malzemeKgFiyatlari, ortalamaAlisFiyatlari, tedarikIhtiyaclariniYaz, tedarikTerminleri,
} from '../satin-alma/disari.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { kurlar } from '../finans/disari.ts';
import { siparisSatiriOzetleri } from '../siparisler/disari.ts';
import { planlanacakIsEmirleri, rotadanAdimAdetleri } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri, isMerkeziKisiPaylari, kisiVardiyalari, vardiyaMatrisi } from '../vardiya/disari.ts';
import { hedefMotorAyari } from './motor-ayari.ts';
import { calismayaMotorAyari, type MotorOlcegi } from './motor-ayari-kurallar.ts';
import { planGirdisi, yeniCalisma, type KaynakOkumasi } from './plan-girdisi.ts';
import {
  acikSiparisSatirlari, type AcikSiparisGelisi, ayarCevir, bitisAkisiEkle, calisanAdimlariCevir, gerekenTarihler, planAni, planGunu, planSaati,
} from './planlama-kurallar.ts';
import { satinAlmaCalismasi } from './satin-alma-gorunumu.ts';
import { emirTutari, satirKuru } from './kurallar.ts';
import { calisanAdimlar, canliOzeti, planFinansmanOrani } from './servis.ts';
import * as sorgular from './sorgular.ts';
import { teklifDenemesi, type DenemeSonucu, type TeklifTaslagi } from './teklif-denemesi.ts';

// Planlama sayfası, çalışma kaydı ve sunucu plan motorunun girdisi (658 b): planı plan modülü yapar, Reçete ve Rota yalnız besler (bağlı
// durum, ana kayıt). Akış: yetkiyi uç verir; burada biçim, sürüm ve planlama kaydının ek yazma denetimi.

// Planlama sayfasının ortak çalışma kaydı (S): plan, senaryolar, kilitler, ağırlıklar. Anahtar Reçete ve Rota kaydının önekini taşır
// (sayfanın yerel deposu); kayıt bu modülün tablosundadır.
export const PLANLAMA_ANAHTARI = `${DURUM_ANAHTARI}:planlama`;

const CAKISMA_ILETISI = 'Planlama kaydı siz açtıktan sonra başka bir kişi tarafından değiştirildi; sayfayı yenileyin.';
const BUYUK_ILETISI = 'Planlama kaydı 1 MB sınırını aşıyor ve kaydedilmedi; eski kayıtları silip yeniden deneyin.';
const PLANLAMA_YETKI_ILETISI = 'Planlama çalışmasını değiştirme yetkiniz yok.';
const KAYIT_YETKI_ILETISI = 'Reçete ve Rota kaydını değiştirme yetkiniz yok.';

// Planlama çalışması (tercih, ağırlık, karar, sayfa içi kilit) yalnız plan.yaz ister (287 a, 925 a); öteki anahtarlar (Reçete ve Rota'nın
// ana kaydı, sayfa tercihleri `:planlama-ui4` ...) recete-rota.yaz ister. Uç ikisinden birini ister; hangisinin gerektiği anahtardan belli olur.
export function planlamaYazmaDenetimi(kullanici: Kullanici, anahtar: string): void {
  if (anahtar === PLANLAMA_ANAHTARI) {
    if (!islemVarMi(kullanici, 'plan.yaz')) throw yetkiYok(PLANLAMA_YETKI_ILETISI);
  } else if (!islemVarMi(kullanici, 'recete-rota.yaz')) throw yetkiYok(KAYIT_YETKI_ILETISI);
}

export async function planlamaKayitlari(db: Db): Promise<KayitlarCevabi> {
  return { kayitlar: await sorgular.planlamaKayitlari(db) };
}

export async function planlamaYaz(db: Db, kullanici: Kullanici, g: PlanlamaYazGovdesi): Promise<YazCevabi> {
  planlamaYazmaDenetimi(kullanici, g.anahtar);
  if (!degerBicimeUyarMi(g.bicim, g.deger)) throw dogrulama('Metin biçimli değer dize olmalıdır.', 'deger');
  if (nulKarakteriVarMi(g.deger)) throw dogrulama('Değer boş karakter (U+0000) içeremez.', 'deger');
  if (degerCokBuyukMu(g.deger)) throw cokBuyuk(BUYUK_ILETISI);
  const mevcut = await sorgular.planlamaSurumKilitle(db, g.anahtar);
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  // Bitiş tarihi akışını sunucu yazar (455/2 a); eklenen satırlarla değer yeniden boyut denetiminden geçer.
  const calisma = g.anahtar === PLANLAMA_ANAHTARI && g.bicim === 'json';
  const deger = calisma
    ? bitisAkisiEkle(g.deger, mevcut === null ? null : (await sorgular.planlamaKaydi(db, g.anahtar))?.deger, kullanici.ad, Date.now())
    : g.deger;
  if (deger !== g.deger && degerCokBuyukMu(deger)) throw cokBuyuk(BUYUK_ILETISI);
  const satir = { anahtar: g.anahtar, bicim: g.bicim, deger, kisiId: kullanici.id };
  const kayit = mevcut === null ? await sorgular.planlamaKaydiEkle(db, satir) : await sorgular.planlamaKaydiGuncelle(db, satir);
  // Eşzamanlı ilk yazmada öteki kazandı.
  if (kayit === null) throw cakisma(CAKISMA_ILETISI);
  if (calisma) await gerekenTarihleriBildir(db, deger);
  return { kayit };
}

export async function planlamaSil(db: Db, kullanici: Kullanici, g: PlanlamaSilGovdesi): Promise<SilCevabi> {
  planlamaYazmaDenetimi(kullanici, g.anahtar);
  const mevcut = await sorgular.planlamaSurumKilitle(db, g.anahtar);
  if (mevcut === null) return { silindi: false };
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  return { silindi: await sorgular.planlamaKaydiSil(db, g.anahtar) };
}

// Planlama sayfasının ve Reçete ve Rota ekranının okuduğu birleşik durum: Reçete ve Rota'nın bağlı durumu ve planın alanları (canlı plan
// ayarı, canlı özeti, başlamış adımlar). Yetkiyi uç verir; dilimlerin kapsamı Reçete ve Rota'nınkidir.
export async function planlamaKaynagi(db: Db, kullanici: Kullanici): Promise<DurumCevabi> {
  const { durum, emirKayitlari } = await durumVeEmirler(db, kullanici);
  return {
    ...durum,
    calisanAdimlar: emirKayitlari === null ? null : calisanAdimlariCevir(await calisanAdimlar(db), emirKayitlari, durum.adimAdetleri ?? {}),
    settings: ayarCevir(await sorgular.ayarOku(db, null)),
    planCanli: await canliOzeti(db),
  };
}

const ISTASYON_OKUMA = KAYNAK_OKUMA.istasyon;
const KISI_OKUMA = KAYNAK_OKUMA.kisi;
const yetkiliMi = (k: Kullanici, islemler: readonly Islem[]): boolean => islemler.some((i) => islemVarMi(k, i));

// Açık satın alma siparişinin gelişi (525 1 a): satın almayı okuyan ya da depoda mal kabul eden görür (stoktaki açık sipariş satırlarıyla aynı kapsam).
const ACIK_SIPARIS_OKUMA: readonly Islem[] = ['satin-alma.oku', 'satin-alma.yaz', 'stok.giris'];
// 1280 a, 1329: malzeme fiyatı planın maliyet ekranıyla aynı işlemle görünür (değerlendirmenin TL alanları gibi).
const MALZEME_FIYATI_OKUMA: readonly Islem[] = ['finans.maliyet-oku'];
// 1460 a, 1461 a: siparişin tutarı ve gecikme cezası planın gelirine girer; sipariş fiyatını gören görür (planın bedel satırı gibi).
const SIPARIS_FIYATI_OKUMA: readonly Islem[] = ['siparisler.fiyat-oku'];

// Plan kapasitesi (kart #1324): Vardiya'nın iş merkezi, istasyon ve kişi takvimlerinden prototipin kendi vardiya hesabına eklediği farklar
// tek okumada. Kişi ve payı Vardiya'nın tek tanımıdır (`isMerkeziKisiPaylari`, Plan da bunu okur: aktif kişi; istasyon, makine ve ekip
// ataması); takvimi okunamayan (iş merkezine bağlanamayan) kaynak gelmez. W8: işten ayrıldığı günler (VR-29) izinli gibi 0 gider.
export async function kapasite(db: Db, kullanici: Kullanici, simdi = Date.now()): Promise<KapasiteCevabi> {
  const istasyonOkur = yetkiliMi(kullanici, ISTASYON_OKUMA);
  const kisiOkur = yetkiliMi(kullanici, KISI_OKUMA) && istasyonOkur;
  const baslangic = tesisGunu(simdi);
  const bitis = new Date(Date.parse(`${baslangic}T00:00:00Z`) + (KAPASITE_GUNU - 1) * 86_400_000).toISOString().slice(0, 10);
  const merkezler = istasyonOkur ? await isMerkezleri(db, { pasiflerDahil: false }) : [];
  const istasyonListesi = istasyonOkur ? await istasyonlar(db, { pasiflerDahil: false }) : [];
  const paylar = new Map<number, Map<number, number>>();
  for (const [m, kisiler] of kisiOkur ? await isMerkeziKisiPaylari(db) : []) {
    for (const [kisiId, sent] of kisiler) {
      const l = paylar.get(kisiId) ?? new Map<number, number>();
      l.set(m, sent);
      paylar.set(kisiId, l);
    }
  }
  const takvimler = await calismaTakvimleri(db, [
    ...merkezler.map((m) => ({ tur: 'is-merkezi' as const, id: m.id })),
    ...istasyonListesi.map((i) => ({ tur: 'istasyon' as const, id: i.id })),
    ...[...paylar.keys()].map((id) => ({ tur: 'kisi' as const, id })),
  ], { baslangic, bitis });
  const fazlaMesai = (anahtar: string) =>
    (takvimler.get(anahtar)?.gunler ?? []).flatMap((g) => ((g.fazlaMesaiDakika ?? 0) > 0 ? [{ tarih: g.tarih, dakika: g.fazlaMesaiDakika! }] : []));
  const ayni = (a: { tarih: string; dakika: number }[], b: { tarih: string; dakika: number }[]) =>
    a.length === b.length && a.every((x, i) => x.tarih === b[i]!.tarih && x.dakika === b[i]!.dakika);
  return {
    baslangic,
    isMerkezleri: istasyonOkur ? merkezler.map((m) => ({ id: String(m.id), fazlaMesai: fazlaMesai(`is-merkezi:${m.id}`) })) : null,
    istasyonlar: istasyonOkur
      ? istasyonListesi.flatMap((i) => {
        const kendi = fazlaMesai(`istasyon:${i.id}`);
        return i.isMerkeziId === null || ayni(kendi, fazlaMesai(`is-merkezi:${i.isMerkeziId}`)) ? [] : [{ id: String(i.id), fazlaMesai: kendi }];
      })
      : null,
    kisiler: kisiOkur
      ? [...paylar].flatMap(([kisiId, l]) => {
        const t = takvimler.get(`kisi:${kisiId}`) ?? null;
        if (t === null) return [];
        return [{
          id: String(kisiId),
          izinli: t.gunler.filter((g) => g.izinli === true || g.ayrildi === true).map((g) => g.tarih),
          fazlaMesai: fazlaMesai(`kisi:${kisiId}`),
          paylar: [...l].filter(([, sent]) => sent > 0).map(([m, sent]) => ({ wcId: String(m), pay: sent / 10000 })),
        }];
      })
      : null,
  };
}

// Satış teklifi denemesi (Y4). Planın girdisi çerçevenin açılışındaki gibi kurulur: ortak çalışma kaydı, Reçete ve Rota kaydı ve çağıranın
// yetkisiyle kaynak okuması. Takvim eki (iş merkezi haftası, kişi vardiyası) sunucuda henüz okunamaz (vardiya modülü kişi vardiyalarını dışarı
// vermiyor; BASKA-MODUL-ISTEKLERI.md): çerçevenin okuyamadığı durumdaki gibi null'dır, çalışmanın kayıtlı takvimi kullanılır.
const PLANLAMA_SURUMU = 2;

export async function kaynakOku(db: Db, kullanici: Kullanici): Promise<KaynakOkumasi> {
  const d = await planlamaKaynagi(db, kullanici);
  const makineNotu = yetkiliMi(kullanici, ISTASYON_OKUMA)
    ? Object.fromEntries((await makineDurumlari(db)).map((x) => [String(x.makineId), x.aciklama ?? null])) : null;
  let gorev: Record<string, string | null> | null = null;
  if (yetkiliMi(kullanici, KISI_OKUMA) && d.people !== null) {
    gorev = {};
    for (const k of d.people) gorev[k.id] = await kisiGorevi(db, Number(k.id));
  }
  // 13.4: onaylı izin ve atama payı çerçevedeki gibi kapasite okumasından; motor izinli günü devamsızlık sayar
  const sa = await satinAlmaEkiKur(db, kullanici, d.items);
  // 1329: fiyat alanı birleştirmede hep bulunur (malzemeyi okuyamayanda null): girdi.betik önceki kayıttaki fiyatı taşımaz.
  return {
    durum: d,
    ek: { takvim: null, makineNotu, kisiGorevi: gorev, kapasite: await kapasite(db, kullanici), malzemeFiyatlari: null, ...sa, siparisBedelleri: await siparisBedelleri(db, kullanici) },
  };
}

// 1460 a, 1461 a: emrin geliri sipariş satırındaki payıdır (birim fiyat × emir adedi), plan gününün kuruyla TL; ceza siparişin günlük oranı
// ve tavanı (yüzde). Anahtar motorun sipariş kimliği (emir kimliği). Plana girecek her emir listededir: fiyatı görmeyende ve satırı olmayan
// emirde değerler null'dır, girdi.betik sayfada elle girilmiş değeri taşımaz. Kuru girilmemiş döviz satırda gelir null (bilinmez); ceza oranı
// yine gelir, motor tutarsız cezayı hesaplamaz.
export interface SiparisBedeli { gelir: number | null; cezaOran: number | null; cezaTavan: number | null }
const BEDELSIZ: SiparisBedeli = { gelir: null, cezaOran: null, cezaTavan: null };
async function siparisBedelleri(db: Db, kullanici: Kullanici): Promise<Record<string, SiparisBedeli> | null> {
  if (!yetkiliMi(kullanici, KAYNAK_OKUMA.emir)) return null;
  const emirler = new Map<number, { siparisSatiriId: number | null; adet: number }>();
  for (const i of await planlanacakIsEmirleri(db, { taslakDahil: true })) {
    if (!emirler.has(i.uretimEmriId)) emirler.set(i.uretimEmriId, { siparisSatiriId: i.siparisSatiriId ?? null, adet: i.adet });
  }
  if (!yetkiliMi(kullanici, SIPARIS_FIYATI_OKUMA)) return Object.fromEntries([...emirler.keys()].map((id) => [String(id), BEDELSIZ]));
  const satirlar = await siparisSatiriOzetleri(db, [...emirler.values()].flatMap((e) => (e.siparisSatiriId === null ? [] : [e.siparisSatiriId])));
  const kur = new Map([...await kurlar(db, tesisGunu(Date.now()))].map(([pb, k]) => [pb, Number(k.kur)]));
  const sayi = (x: string | null): number | null => (x == null ? null : Number(x));
  return Object.fromEntries([...emirler].map(([id, e]) => {
    const satir = e.siparisSatiriId === null ? null : satirlar.get(e.siparisSatiriId) ?? null;
    if (satir === null) return [String(id), BEDELSIZ];
    const tutar = sayi(emirTutari(satir, e.adet));
    const k = satirKuru({ paraBirimi: satir.paraBirimi, kur: kur.get(satir.paraBirimi) ?? null });
    return [String(id), { gelir: tutar === null || k === null ? null : tutar * k, cezaOran: sayi(satir.cezaOraniGun), cezaTavan: sayi(satir.cezaTavaniOrani) }];
  }));
}

// 525 1 a, 533 a: planın satın alma eki. Açık sipariş satın almayı okuyana; tedarik termini planlamada her malzeme satırında görünür
// (yazma ucu satın almanın). Çerçeve bunu kaynak okumasıyla birlikte ayrı uçtan alır; sunucunun birleştirmesi kaynakOku'dan.
export async function satinAlmaEki(db: Db, kullanici: Kullanici): Promise<SatinAlmaEkiCevabi> {
  return satinAlmaEkiKur(db, kullanici, await aktifMalzemeListesi(db, kullanici));
}
async function satinAlmaEkiKur(db: Db, kullanici: Kullanici, malzemeler: DurumCevabi['items']): Promise<SatinAlmaEkiCevabi> {
  if (malzemeler === null) return { acikSiparisler: null, tedarikTerminleri: null };
  return {
    acikSiparisler: yetkiliMi(kullanici, ACIK_SIPARIS_OKUMA) ? await acikSiparisGelisleri(db, malzemeler) : null,
    tedarikTerminleri: await malzemeTerminleri(db, malzemeler),
    malzemeFiyatlari: yetkiliMi(kullanici, MALZEME_FIYATI_OKUMA) ? await malzemeFiyatlari(db, malzemeler) : null,
  };
}

// 1280 a, 1329: ham malzemenin Satın Alma fiyatları (girdi.betik plandaki malzemenin birim fiyatına yazar). Alışı da kg fiyatı da olmayan
// malzeme listede yoktur. Ortalama bütün teslimlerindir.
type MalzemeFiyati = NonNullable<SatinAlmaEkiCevabi['malzemeFiyatlari']>[number];
const sayi = (x: string | null): number | null => (x === null ? null : Number(x));
async function malzemeFiyatlari(db: Db, malzemeler: NonNullable<DurumCevabi['items']>): Promise<MalzemeFiyati[]> {
  const ham = malzemeler.filter((m) => m.type === 'ham');
  const nolar = ham.map((m) => m.kayitNo);
  const alis = await ortalamaAlisFiyatlari(db, nolar);
  const kg = await malzemeKgFiyatlari(db, nolar);
  return ham.flatMap((m) => {
    const a = alis.get(m.kayitNo);
    const k = kg.get(m.kayitNo);
    const alisFiyati = sayi(a?.tryBirimFiyat ?? null);
    if (alisFiyati === null && k === undefined) return [];
    return [{
      kod: m.id, alisFiyati, teslimSayisi: a?.teslimSayisi ?? 0,
      kg: k === undefined ? null : {
        kaliteKodu: k.kaliteKodu, form: k.form, gecerlilik: k.gecerlilik, kgFiyati: Number(k.kgFiyati), paraBirimi: k.paraBirimi,
        tlKgFiyati: sayi(k.tryKgFiyati), tlBirimFiyati: sayi(k.tryBirimFiyati),
      },
    }];
  });
}

// 533 a: plan kaydedilince malzemenin olması gereken tarihi Satın Alma'ya aynı transaction'da gider (tam liste: planın artık istemediğinin tarihi
// boşalır). Katalogda olmayan kod (silinmiş kart, sayfanın yerel malzemesi) bildirilmez: Satın Alma bilinmeyen malzemeyi reddeder.
async function gerekenTarihleriBildir(db: Db, calisma: unknown): Promise<void> {
  const l = gerekenTarihler(calisma).flatMap((x) => (/^\d+$/.test(x.kod) ? [{ malzemeNo: Number(x.kod), gerekenTarih: x.gerekenTarih }] : []));
  const kartlar = await malzemeOzetleri(db, l.map((x) => x.malzemeNo));
  await tedarikIhtiyaclariniYaz(db, l.filter((x) => kartlar.has(x.malzemeNo)));
}

// 533 a: ham malzemenin tedarik termini ve sürümü (girdi.betik plandaki malzemeye yazar). Satırı olmayan malzeme listede yoktur.
async function malzemeTerminleri(db: Db, malzemeler: NonNullable<DurumCevabi['items']>): Promise<{ kod: string; termin: string | null; surum: number; aciklama: string }[]> {
  const ham = malzemeler.filter((m) => m.type === 'ham');
  const t = await tedarikTerminleri(db, ham.map((m) => m.kayitNo));
  return ham.flatMap((m) => { const x = t.get(m.kayitNo); return x ? [{ kod: m.id, termin: x.termin, surum: x.surum, aciklama: x.aciklama }] : []; });
}

// 525 1 a: ham malzemenin açık satın alma siparişleri (girdi.betik bunları plana satın alma satırı olarak yazar).
async function acikSiparisGelisleri(db: Db, malzemeler: NonNullable<DurumCevabi['items']>): Promise<AcikSiparisGelisi[]> {
  const ham = malzemeler.filter((m) => m.type === 'ham');
  return acikSiparisSatirlari(ham, await malzemeGelisTarihleri(db, ham.map((m) => m.kayitNo)));
}

// Çerçeve kaydı metin olarak da yazabilir (yerel depo değeri); metin biçimli değer JSON olarak okunur.
const kayitDegeri = (k: { bicim: string; deger?: unknown } | null): unknown => {
  if (k === null || k.deger === undefined) return null;
  if (k.bicim !== 'metin' || typeof k.deger !== 'string') return k.deger;
  try { return JSON.parse(k.deger) as unknown; } catch { return null; }
};

// Planlama çalışmasının kayıtlı hâli (birleştirilmeden); kayıt yoksa null. Veri sağlığı raporu çalışmadaki elle değerleri buradan sayar.
export async function planlamaCalismaKaydi(db: Db): Promise<unknown> {
  return kayitDegeri(await sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI));
}

// ADR 0018: sunucu plan motoru bir kullanıcı adına değil sunucunun içinde okur (Soru 150 a): aynı girdi her kullanıcıda aynı planı verir.
// Okunan veri kimseye dönmez; çözücü yalnız saat verir. Yazma işlemi taşımaz.
const PLAN_MOTORU_OKUYUCUSU: Kullanici = {
  id: 0, ad: 'plan motoru',
  islemler: [...new Set([...Object.values(KAYNAK_OKUMA).flat(), ...ACIK_SIPARIS_OKUMA, ...SIPARIS_FIYATI_OKUMA])],
};
export interface PlanCozumKaynagi { calisma: unknown; kayit: unknown; kaynak: KaynakOkumasi }
// Girdi planlama sayfasınınkiyle aynı yoldan kurulur (takvim eki dahil): iş merkezinin haftalık vardiyası olmadan sunucu başka takvimle çözerdi.
// 1408: planlama sayfası hiç kaydetmemişse (ya da kaydın sürümü eskiyse) çözücü sayfanın ilk açılışında kuracağı boş çalışmayla (657 a)
// bellekte çözer, kayıt yazılmaz: eski motor kalkınca motor yerleşimi, önizleme ve hızlı deneme sayfa kaydı olmadan da çalışır.
export async function planCozumKaynagi(db: Db, simdi: number = Date.now()): Promise<PlanCozumKaynagi> {
  return (await planlamaGirdisi(db, PLAN_MOTORU_OKUYUCUSU, simdi)).girdi!;
}

// Planlama sayfasının açılışı (288 a). Eski çerçeve çalışmayı, Reçete ve Rota kaydını ve kaynak okumasını tarayıcıda girdi.betik ile
// birleştirirdi; aynı betik burada aynı girdiyle koşar, sayfa birleşmiş çalışmayı okur. Kaynak okuması çağıranın yetkisiyledir (çerçevedeki
// gibi: okuyamadığı dilim kayıttaki gibi kalır). Takvim eki çerçevenin okuduğu vardiya takviminden kurulur (o uç yalnız oturum ister).
export async function planlamaCalismasi(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<PlanlamaCalismasiCevabi> {
  const k = await planlamaGirdisi(db, kullanici);
  if (k.girdi === null) return { calisma: null, surum: k.surum };
  const g = planGirdisi({ ...k.girdi, bugun: tesisGunu(simdi) }, simdi);
  if (g === null) return { calisma: null, surum: k.surum };
  // Birleşme kayıtta olmayan planTL'yi düşürebilir; sayfanın gördüğü ve geri yazdığı da aynı amacı taşır (yazıp okuma eşit kalır).
  const fin = await planFinansmanOrani(db, tesisGunu(simdi));
  return { calisma: calismayaMotorAyari(g.S, (await hedefMotorAyari(db, null)).degerler, fin, await motorOlcegi(db)) as PlanlamaCalismasiCevabi['calisma'], surum: k.surum };
}

// 657 a: kayıt yoksa sayfa boş çalışmayı kendisi açar ve düzenlenebilir başlar. Çalışma çerçevenin ilk açılışındaki gibi Reçete ve Rota
// kaydından ve çağıranın kaynak okumasından kurulur, kayıt yazma yolundan geçer (plan.yaz denetimi, sürüm, geçmiş). Kayıt varsa (başkası
// arada açtıysa da) dokunulmaz, var olan döner; böylece iki kişi aynı anda açınca ikinci yazma çakışma vermez.
export async function planlamaCalismasiOlustur(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<PlanlamaCalismasiCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  if ((await sorgular.planlamaSurumKilitle(db, PLANLAMA_ANAHTARI)) === null) {
    const calisma = yeniCalisma(kayitDegeri(await receteRotaDurumu(db)), await kaynakOku(db, kullanici), tesisGunu(simdi));
    const satir = { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: kullanici.id };
    if ((await sorgular.planlamaKaydiEkle(db, satir)) === null) throw cakisma(CAKISMA_ILETISI);
  }
  return planlamaCalismasi(db, kullanici, simdi);
}

// 542 a, 546 a, 549 a: Satın Alma'nın malzeme ve fason planı sayfaları. Çalışma planlama sayfasıyla aynı girdiyle birleşir; kaynak sunucunun
// iç okuyucusuyla okunur (çağıranın yetkisiyle okunsa satın almanın göremediği dilim düşer, hesap planlamadan ayrılırdı) ve giden çalışma
// beyaz listeyle daraltılır (satin-alma-gorunumu.ts). Biten iş canlı emir durumundandır, okunamazsa Reçete ve Rota kaydındaki kopyası.
export async function satinAlmaPlanCalismasi(db: Db, simdi: number = Date.now()): Promise<PlanlamaCalismasiCevabi> {
  const k = await planlamaGirdisi(db, PLAN_MOTORU_OKUYUCUSU);
  if (k.girdi === null) return { calisma: null, surum: k.surum };
  const g = planGirdisi({ ...k.girdi, bugun: tesisGunu(simdi) }, simdi);
  if (g === null) return { calisma: null, surum: k.surum };
  const emirler = (k.girdi.kaynak.durum as { emirler?: unknown } | null)?.emirler ?? k.girdi.kayit;
  return { calisma: satinAlmaCalismasi(g.S, emirler), surum: k.surum };
}

// Planlama sayfasının birleştirilecek girdisi: çalışma kaydı, Reçete ve Rota kaydı ve çağıranın yetkisiyle kaynak okuması (takvim eki
// dahil). Değerlendirme ucu (Soru 357 a) aynı girdiyle hesaplar. Çalışma yoksa (ya da kaydın biçimi eskiyse) girdi null; sürüm kaydınındır.
// Plan amacı kayıttan değil güncel motor ayarından gelir (kart 811, 771 a): sayfa, değerlendirme ve sunucu motoru aynı amaçla hesaplar.
// bosCalismaAni verilirse kayıt yokken girdi null olmaz: çalışma o günün boş çalışmasıdır (yalnız bellekte).
export async function planlamaGirdisi(db: Db, kullanici: Kullanici, bosCalismaAni?: number): Promise<{ surum: number | null; girdi: PlanCozumKaynagi | null }> {
  const satir = await sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI);
  const kayitli = kayitDegeri(satir) as { surum?: unknown; D?: unknown } | null;
  const surum = satir?.surum ?? null;
  const gecerli = kayitli !== null && kayitli.surum === PLANLAMA_SURUMU && !!kayitli.D;
  if (!gecerli && bosCalismaAni === undefined) return { surum, girdi: null };
  const kayit = kayitDegeri(await receteRotaDurumu(db));
  const kaynak = await kaynakOku(db, kullanici);
  const calisma = gecerli ? kayitli : yeniCalisma(kayit, kaynak, tesisGunu(bosCalismaAni!));
  const ek = { ...(kaynak.ek as Record<string, unknown>), takvim: await takvimEki(db) };
  const { degerler } = await hedefMotorAyari(db, null);
  const fin = await planFinansmanOrani(db, tesisGunu(bosCalismaAni ?? Date.now()));
  return { surum, girdi: { calisma: calismayaMotorAyari(calisma, degerler, fin, await motorOlcegi(db)), kayit, kaynak: { durum: kaynak.durum, ek } } };
}

// 1477 a: motorun ufku ve dilimi (sistem ayarı); sayfa, değerlendirme ve sunucu motoru aynı ölçekle hesaplar.
async function motorOlcegi(db: Db): Promise<MotorOlcegi> {
  return { ufukGun: (await sistemAyariOku(db, 'plan.motor-ufuk-gun')) ?? 120, dilimDk: Number(await sistemAyariOku(db, 'plan.motor-dilim-dk')) };
}

// Çerçevenin biçimi (kaynak-komutlari.ts takvimEki): iş merkezi -> haftanın günü (0 pazar ... 6 cumartesi) -> vardiyalar; kişi -> vardiya.
async function takvimEki(db: Db): Promise<{ hafta: Record<string, Record<number, string[]>>; kisiVardiyasi: Record<string, string> }> {
  const hafta: Record<string, Record<number, string[]>> = {};
  for (const m of await vardiyaMatrisi(db)) {
    const merkez = (hafta[String(m.isMerkeziId)] ??= {});
    (merkez[m.gun === 7 ? 0 : m.gun] ??= []).push(String(m.vardiyaId));
  }
  const kisiVardiyasi: Record<string, string> = {};
  for (const k of await kisiVardiyalari(db)) kisiVardiyasi[String(k.kisiId)] = String(k.vardiyaId);
  return { hafta, kisiVardiyasi };
}

export interface TeklifKalemiGirdisi { malzemeNo: number; adet: number }
// Satış taslağı siparişlerin kaydıdır; kilitli yeri adım başına makine ve başlangıç anı. Süresi dolan taslak verilmez ya da süzülür.
export interface SatisTaslagiGirdisi {
  id: string;
  gecerlilik: string;
  kalemler: Array<TeklifKalemiGirdisi & { termin: string; yerlesim: Record<string, { makineId: string; baslangic: string }> }>;
}
export interface TeklifDenemeGirdisi {
  kalemler: TeklifKalemiGirdisi[];
  gecerlilik: string;
  istenenTermin: string | null;
  taslakId: string | null;
  taslaklar: SatisTaslagiGirdisi[];
  // Plan termini için bitişe eklenen gün; verilmezse canlı plan ayarının tamponu (plan modülü).
  tamponGun?: number;
}
export interface TeklifIslemi { adim: string; makineId: string; fason: boolean; baslangic: string; bitis: string; ayarSaat: number; islemeSaat: number; tl: number | null }
export interface TeklifKalemiSonucu {
  malzemeNo: number;
  adet: number;
  tamam: boolean;
  bitis: string | null;
  planTermini: string | null;
  ulasir: boolean | null;
  malzeme: Array<{ kod: string; birim: string; miktar: number; kaynak: string; gelis: string | null }>;
  satinalma: Array<{ kod: string; birim: string; miktar: number; gelis: string; tedarikGun: number | null }>;
  islemler: TeklifIslemi[];
  malzemeTl: number | null;
  eksik: string[];
  // satış taslağı olarak kaydedilirse kilitlenecek yer: adım -> makine ve başlangıç
  yerlesim: Record<string, { makineId: string; baslangic: string }>;
}
export interface TeklifDenemeSonucu {
  kalemler: TeklifKalemiSonucu[];
  kayan: Array<{ siparis: string; emirNo: string | null; once: string; sonra: string; termin: string | null }>;
  taslakYerlesimi: Array<{ taslakId: string; kalem: number; adim: string; makineId: string; baslangic: string }>;
  // Plan şeridi: pencere planın şimdisinden max(termin, geçerlilik) + 2 günün sonuna; termin istenen termin, yoksa kalemlerin en geç plan
  // termini. Pencere kurulamazsa null.
  plan: TeklifPlani | null;
}
export interface TeklifPlani {
  baslangic: string;
  bitis: string;
  kapaliGunler: string[];
  hatlar: Array<{ makineId: string; ad: string; fason: boolean }>;
  bloklar: Array<{
    makineId: string;
    tur: 'siparis' | 'satis-taslagi' | 'teklif';
    is: string;
    emirNo: string | null;
    kalem: number | null;
    adim: string;
    baslangic: string;
    bitis: string;
    gecikir: boolean;
  }>;
}

const fasonMu = (m: string): boolean => m.startsWith('@');

// 1527: teklif kaleminin adım adetleri, motorun ürün rotasıyla aynı sırada (seq): rota motora kaynak okumasından (yoksa kayıttan) gelir.
// Dal adımı bir mamul için çarpan kadar parça işler (1257 a); adet gerçek emirdeki gibi uretim-emirleri'nin kuralından, plan çarpanı
// kendisi uygulamaz. Rotası okunamayan ürünün kalemi alansız gider (motor her adımı kalem adedi sayar).
type RotaAdimKaydi = { seq: number; opNo: number; adetCarpani?: number | null };
type RotaKayitlari = Record<string, { steps?: RotaAdimKaydi[] } | undefined> | null | undefined;
export function teklifAdimAdetleri(kaynak: KaynakOkumasi | null, kayit: unknown): (urun: string, adet: number) => { adimAdetleri?: number[] } {
  const rotalar = (x: unknown): RotaKayitlari => (typeof x === 'object' && x !== null ? (x as { routes?: RotaKayitlari }).routes : null);
  const kaynakta = rotalar(kaynak?.durum), kayitta = rotalar(kayit);
  return (urun, adet) => {
    const adimlar = (kaynakta?.[urun] ?? kayitta?.[urun])?.steps;
    if (!adimlar?.length) return {};
    const sirali = [...adimlar].sort((a, b) => a.seq - b.seq);
    const n = rotadanAdimAdetleri(adet, sirali);
    return { adimAdetleri: sirali.map((a) => n.get(a.opNo) ?? adet) };
  };
}

// Çalışma yoksa null (planlama sayfası hiç açılıp kaydedilmemiş). Süre sınırı aşılırsa hata.
export async function teklifDene(db: Db, kullanici: Kullanici, g: TeklifDenemeGirdisi, simdi: number = Date.now()): Promise<TeklifDenemeSonucu | null> {
  const calisma = kayitDegeri(await sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)) as { surum?: unknown; D?: { meta?: { baslangic?: unknown } } } | null;
  if (calisma === null || calisma.surum !== PLANLAMA_SURUMU || !calisma.D) return null;
  const kayit = kayitDegeri(await receteRotaDurumu(db)) as { orders?: Array<{ id: string; no?: string }> } | null;
  const kaynak = await kaynakOku(db, kullanici);
  const bugun = tesisGunu(simdi);
  const baslangic = typeof calisma.D.meta?.baslangic === 'string' ? calisma.D.meta.baslangic : bugun;
  const saat = (an: string): number => planSaati(baslangic, an);
  const adimlar = teklifAdimAdetleri(kaynak, kayit);
  const taslaklar: TeklifTaslagi[] = g.taslaklar.filter((t) => t.gecerlilik >= bugun).map((t) => ({
    id: t.id,
    kalemler: t.kalemler.map((k, i) => ({
      id: `${t.id}-${String(i + 1)}`, urun: String(k.malzemeNo), adet: k.adet, termin: `${k.termin} 23:00`, ...adimlar(String(k.malzemeNo), k.adet),
    })),
    yerlesim: Object.fromEntries(t.kalemler.flatMap((k, i) => Object.entries(k.yerlesim).map(([adim, y]) => [`${t.id}-${String(i + 1)}.${adim}`, { m: y.makineId, S: saat(y.baslangic) }]))),
  }));
  const r: DenemeSonucu | null = await teklifDenemesi({
    calisma, kayit, kaynak, bugun,
    kalemler: g.kalemler.map((k, i) => ({ id: `TK-${String(i + 1)}`, urun: String(k.malzemeNo), adet: k.adet, ...adimlar(String(k.malzemeNo), k.adet) })),
    termin: g.istenenTermin === null ? null : `${g.istenenTermin} 23:00`,
    taslaklar, haric: g.taslakId, tamponGun: g.tamponGun ?? (await sorgular.ayarOku(db, null)).tamponGun, gecerlilik: g.gecerlilik,
  });
  if (r === null) return null;
  const an = (h: number): string => planAni(r.baslangic, h);
  const makine = (m: string): string => (fasonMu(m) ? m.slice(1) : m);
  const emirNo = new Map((kayit?.orders ?? []).map((o) => [o.id, o.no ?? null]));
  return {
    kalemler: r.kalemler.map((k, i) => ({
      malzemeNo: g.kalemler[i]!.malzemeNo,
      adet: g.kalemler[i]!.adet,
      tamam: k.tamam,
      bitis: k.bitis === null ? null : an(k.bitis),
      planTermini: k.planTerminGun === null ? null : planGunu(r.baslangic, k.planTerminGun),
      ulasir: k.ulasir,
      malzeme: k.malzeme.map((m) => ({ ...m, gelis: m.gelis === null || !Number.isFinite(m.gelis) ? null : an(m.gelis) })),
      satinalma: k.satinalma.map((s) => ({ kod: s.kod, birim: s.birim, miktar: s.miktar, gelis: an(s.gelis), tedarikGun: s.gun })),
      islemler: k.islemler.map((o) => ({ adim: o.adim, makineId: makine(o.m), fason: o.fason, baslangic: an(o.S), bitis: an(o.C), ayarSaat: o.ayarSaat, islemeSaat: o.islemeSaat, tl: o.tl })),
      malzemeTl: k.malzemeTl,
      eksik: k.eksik,
      yerlesim: Object.fromEntries(Object.entries(k.kilit).map(([id, y]) => [id.slice(id.lastIndexOf('.') + 1), { makineId: makine(y.m), baslangic: an(y.S) }])),
    })),
    kayan: r.kayan.map((x) => ({ siparis: x.siparis, emirNo: emirNo.get(x.siparis) ?? null, once: an(x.once), sonra: an(x.sonra), termin: x.termin === null ? null : an(x.termin) })),
    taslakYerlesimi: Object.entries(r.taslakYeri).map(([id, y]) => {
      const nokta = id.lastIndexOf('.'); const kalemId = id.slice(0, nokta); const tire = kalemId.lastIndexOf('-');
      return { taslakId: kalemId.slice(0, tire), kalem: Number(kalemId.slice(tire + 1)), adim: id.slice(nokta + 1), makineId: makine(y.m), baslangic: an(y.S) };
    }),
    plan: r.plan === null ? null : {
      baslangic: an(r.plan.bas),
      bitis: an(r.plan.bit),
      kapaliGunler: r.plan.kapaliGunler,
      hatlar: r.plan.hatlar.map((h) => ({ makineId: makine(h.m), ad: h.ad, fason: h.fason })),
      bloklar: r.plan.bloklar.map((b) => ({
        makineId: makine(b.m), tur: b.tur, is: b.is, emirNo: b.tur === 'siparis' ? emirNo.get(b.is) ?? null : null, kalem: b.kalem,
        adim: b.adim, baslangic: an(b.S), bitis: an(b.C), gecikir: b.gecikir,
      })),
    },
  };
}


// 525 2 b: haftalık ek mesai bütçesinin tek kaynağı planlama çalışmasıdır (Kısıtlar sayfası, param.mesaiHafta). Girilmemişse motorun
// varsayılanı (motor/engine.betik W0.mesaiHafta, 8 saat); 0 sınırsızdır (525 3 a). Hafta, motordaki gibi çalışmanın başlangıç gününden
// 7 günlük dilimdir. Çalışma yoksa ya da başlangıcı okunamazsa null: plan kendi varsayılanını kullanır.
const MOTOR_MESAI_HAFTA = 8;
export async function ekMesaiButcesi(db: Db): Promise<{ saat: number; haftaBasi: string } | null> {
  const x = kayitDegeri(await sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)) as { param?: { mesaiHafta?: unknown }; D?: { meta?: { baslangic?: unknown } } } | null;
  const haftaBasi = x?.D?.meta?.baslangic;
  if (typeof haftaBasi !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(haftaBasi)) return null;
  const b = x?.param?.mesaiHafta;
  // Motorla aynı okuma (girdi.betik stKur): yoksa varsayılan, sayı değilse 0.
  const saat = b === undefined || b === null ? MOTOR_MESAI_HAFTA : Number(b);
  return { saat: Number.isFinite(saat) && saat > 0 ? saat : 0, haftaBasi };
}
