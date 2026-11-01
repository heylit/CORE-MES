import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, kapsamDisi, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type {
  DortSaatAyrintisi,
  CanliYerlesimCevabi, CanliyaAlCevabi, CanliyaAlmaGecmisiCevabi, HizliDeneme, MotorFarki, MotorUyarilariCevabi, MotorYerlesimiCevabi, KuyrukYazCevabi, KuyrukYazGovdesi, OnizlemeCevabi, PlanAyari, PlanCanliOzeti, PlanCevabi, PlanKaynagi, BedelAyari, BedelAyariGovdesi, PlanSurumCevabi, SenaryolarCevabi, SiparisCarpaniCevabi, TaslakGirdisi,
  EkMesaiGovdesi, GeriGonderGovdesi, MotorKuraliGovdesi, OnayaGonderGovdesi, PlanEkMesai, PlanOnayKomutu,
} from '#paylasilan/sozlesme/plan.ts';
import { DORT_SAAT_RED_NEDENI, PLAN_KURALLARI, PLAN_ONAY_KOMUTLARI, SONRADAN_BASLAYAN, type SonradanBaslayanAyrintisi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi, tesisGunu, tesisSaati } from '#paylasilan/zaman.ts';
import {
  aktifIstasyonlar, isMerkezleri, istasyondakiMakineler, istasyonKisileri, istasyonlar as istasyonListesi, istasyonYetkinlikleri, kisininIzinliIsMerkezleri, makineDurumlari, makineDurumuYaz, makineGetir, makineler as makineListesi, operasyonTipleri, planAyarlari,
} from '../istasyonlar/disari.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { gunlukFaizGetir, kurlar } from '../finans/disari.ts';
import type { Makine } from '../istasyonlar/disari.ts';
import { kisiAdlari, kisileriListele } from '../kisiler/disari.ts';
import { malzemeOzeti, malzemeOzetleri } from '../malzemeler/disari.ts';
import { firmaAra } from '../musteri-tedarikci/disari.ts';
import { siparisinProjeleri, siparistenProjeAc } from '../projeler/disari.ts';
import { acikRevizyonSayisi, emreKopyala, girdisiEksikRevizyonlar, revizyonGetir, yururluktekiRevizyonIdleri } from '../rota/disari.ts';
import { fasonSuresiTahminleri } from '../satin-alma/disari.ts';
import { siparisKilitliAyrinti, siparisSatiriOzetleri, taslakSiparisAc } from '../siparisler/disari.ts';
import { dusukStokSayisi } from '../stok/disari.ts';
import { FASON_VARSAYILAN_GUN, adimOnculleri, emirlerinIsEmriIdleri, emirOnceligiYaz, isEmriKaynagiYaz, isEmriVarliklari, planlanacakIsEmirleri } from '../uretim-emirleri/disari.ts';
import { basladigiGunTakvimleri, calismaTakvimleri, gunYaz, isMerkeziKisiPaylari, takvimGunleri, vardiyaTanimlari } from '../vardiya/disari.ts';
import type { BasladigiGun } from '../vardiya/disari.ts';
import type { PlanIsEmri } from '../uretim-emirleri/disari.ts';
import {
  araliktanCikar, arkaArkaya, dortSaatGerekcesi, dortSaatIhlalleri, korunanIsler, kilitCakisani, emirTutari, katkiPaylari, calisilanParcalar, oncelikCarpani, oncelikSinifi, ayniKaynak, cakisirMi, dondurulacaklar, enErkenBaslangic, enErkenBitis, gostergeler, isSuresi, calismaBitisi,
  adetPayi, araliklaraEkle, ayarVeGecikme, bolmeAdetleri, EK_MESAI_HAFTA_SAAT, ekMesaiButcesi, vardiyaSaati, kapasiteBollugu, kapasiteKesri, kaynakAnahtari, kesisimDk, motorUyarilari, onayGecisiReddi, onayGecisleri, personelYuku, planMaliyeti, sinirliGunSayisi, terminDakikasi, uyarilar, uzayanBosluk, verimliSure, yukYuzdesi,
} from './kurallar.ts';
import type { OnayBaglami, PersonelMerkezi } from './kurallar.ts';
import type { Aralik, BedelSatiri, DortSaatNedeni, Kaynak, MotorIsi, MotorOnculu, PlanYeri, Sabit, Takvim, Yerlesim } from './kurallar.ts';
import { eksikStokDenetle } from './eksik-stok.ts';
import { planIhtiyaclariniBildir } from './plan-ihtiyaci.ts';
import { taslagiGuncelSurumeBagla, taslakKuraliYaz } from './motor-ayari.ts';
import * as s from './sorgular.ts';
import { degisimler, emirBitisleri } from './olcum-kurallar.ts';
import type { BolmeParcasi, DegisiklikSatiri, Hedef, ParcaSatiri, YerlesimSatiri } from './sorgular.ts';
import type { PlanBenzetimi } from './plan-girdisi.ts';

const DK = 60_000;
const GUN_DK = 24 * 60;
// Göstergelerin ve matrisin ufku: iki hafta.
const UFUK_GUN = 14;
const UFUK_DK = UFUK_GUN * GUN_DK;
// Motorun takvim ufku (vardiya en çok 366 gün okur).
const TAKVIM_GUN = 365;
// Başka modülün verisini değiştiren denemeler: taslakta benzetilir, canlıya sahibin komutuyla yazılır (bağlanınca).
const BENZETIM = new Set(['oncelik', 'teslim', 'acil_emir', 'makine_ariza', 'gun_kapat']);
// Canlıya alınınca sahibinin komutuyla yazılır: kapalı gün vardiya takvimine, acil sipariş taslak sipariş (286 b), öncelik emre,
// arıza makine durumuna (281 a). Teslim denemesinin sahibi komutunu vermedi.
const CANLIYA_GECEN = new Set(['gun_kapat', 'acil_emir', 'oncelik', 'makine_ariza']);
const BENZETIM_SAHIBI: Record<string, string> = {
  oncelik: 'üretim emirleri', teslim: 'üretim emirleri', acil_emir: 'üretim emirleri', makine_ariza: 'istasyonlar (makine durumu)', gun_kapat: 'vardiya (takvim)',
};

// Emir önceliği ve başlangıcı uretim-emirleri'nin sonraki sürümüyle gelir (#417); gelene kadar boş.
// verim: makinenin istasyonunun plan ayarı (1 = %100); süre verime bölünür. Kişide 1.
interface KaynakBilgisi extends PlanKaynagi { isMerkeziId: number | null; verim: number }
// Taslak emir (ayar "taslak emirleri de planla") planda planlı iş gibi yerleşir; uyarıyla ayrılır.
type Is = Omit<PlanIsEmri, 'durum'> & { durum: 'planli' | 'basladi' | 'bitti' | 'iptal'; taslakEmir: boolean; urunKodu: string; urunAdi: string; rotaKaynaklari: Kaynak[]; sureDk: number | null; ayarDk: number | null; devirDk: number | null; devirAyarDk: number | null; devirSonDk: number | null; motorOnculleri?: MotorOnculu[] };
interface Baglam {
  simdi: number;
  // Bugünün başı (UTC), simdi'ye göre dakika: günler ve matris buradan sayılır.
  gun0: number;
  hedef: Hedef;
  ayar: PlanAyari;
  isler: Map<number, Is>;
  // #1372: girensiz adımlı rotadan açılmış emir yerleşmez; emir no -> neden.
  rotaEksik: Map<string, string>;
  // 983 b: sunucu motoru emri ürünün yürürlükteki rotasıyla dizer. Eski revizyondan açılmış emir -> yürürlükteki rotanın OP numaraları.
  eskiRota: Map<number, ReadonlySet<number>>;
  kaynaklar: Map<string, KaynakBilgisi>;
  izinli: number[];
  kapaliGunler: number[];
  // 196 a: emrin sipariş satırının gecikme bedeli verisi (tutar, para birimi, ceza oranı); satırsız emir yok.
  siparisSatirlari: Map<number, BedelSatiri & { siparisId: number; cezaTavaniOrani: string | null; miktar: string; termin: string }>;
  // 180: planın TL toplamını yalnız fiyatı görebilen görür.
  fiyatGorur: boolean;
  // Emrin katkı payı (kâr riskinin tabanı, 227 a), üretim emri kimliğiyle; çözücüler kayıtsızken boş. Fiyatı görmeyen kişide de okunur:
  // TL amacı (denetim #21) motorun sırasını değiştirir, plan bakanın yetkisine göre değişmemeli; tutarı yalnız fiyatı gören görür.
  katkilar: Map<number, string | null>;
  // Bedel ayarı (209 a) taslakta da canlı plan ayarından okunur: senaryo bedeli değiştirmez.
  bedelAyari: BedelAyari;
  // 1383 a: finansın bugünkü TRY faizinin günlük yüzdesi; yoksa null ve bedel ayarındaki elle oran kullanılır.
  finansmanOraniGun: number | null;
  // 1397 a: plan gününün kurları (para birimi -> 1 birimin TL karşılığı); TRY her zaman 1. Kuru olmayan para birimi yoktur.
  kurlar: Map<string, number>;
  defter: DegisiklikSatiri[];
  // Vardiya takvimi (PL-03, PL-04), anahtar 'tur:id' (makine, kişi, iş merkezi); null: takvim yok, sürekli çalışır sayılır.
  takvimler: Map<string, Aralik[] | null>;
  // Takvimi null olan kaynağın vardiya modülündeki kapalı ve tatil günleri: sürekli çalışmadan yine düşülür.
  takvimsizKapali: Map<string, Aralik[]>;
  // PL-09: iş merkezinin adı ve istasyon ataması olan aktif kişileri, payıyla (o merkezdeki atama yüzdeleri toplamı / 100);
  // istasyonun operatör ihtiyacı (satırı yoksa 1).
  merkezler: Map<number, { kod: string; ad: string; kisiler: { kisiId: number; pay: number }[] }>;
  operator: Map<number, number>;
  // S3: kişinin yetkin olduğu istasyonlar; yetkinliği tanımlanmamış kişi haritada yoktur.
  yetkinlik: Map<number, Set<number>>;
  // Motorun yerleştiremediği bölünmüş işlerin parçaları (no, adet): bölme kalır, iş yerleşmemiş görünür.
  yersiz: Map<number, BolmeParcasi[]>;
  // İstasyonun aktif makineleri (kod sırasıyla): rota adımının istasyonu bunlara açılır; okunmamış istasyon sorulunca okunur.
  istasyonMakineleri: IstasyonMakineleri;
  // Denetim #23: çalışan adımın gerçekleşeni, iş emri kimliğiyle (dakikalar simdi'ye göre): başladığı an, kalan sürenin sayıldığı an (son
  // sayım, yoksa başlama) ve kalan adedin süresi (parça sayılmışsa ayar bitmiştir, düşülür). Yer okunurken saklı aralığın yerine geçer.
  gercek: Map<number, { baslangic: number | null; cikis: number | null; kalanDk: number; ayarDk: number }>;
  // 393 d: çalışan adımın terminalde çalıştığı makine (açık kullanım), iş emri kimliğiyle. Yer okunurken saklı kaynağın yerine geçer.
  fiili: Map<number, Kaynak>;
}
type IstasyonMakineleri = Map<number, Kaynak[]>;

const dk = (b: Pick<Baglam, 'simdi'>, t: Date): number => (t.getTime() - b.simdi) / DK;
const tarih = (b: Baglam, d: number): Date => new Date(b.simdi + d * DK);
const gunTarihi = (b: Baglam, i: number): string => tesisGunu(tarih(b, b.gun0 + i * GUN_DK));
// Teslim günü tesiste biter; UTC gün sonu İstanbul'da ertesi gün 02:59'dur.
// 1401 a: termin anı günün TERMIN_SAATI'dir (motorla aynı tanım).
const gunSonu = (gun: string): number => tesisGunBasi(gun) + terminDakikasi() * DK;
const teslimDk = (b: Pick<Baglam, 'simdi'>, teslim: string | null): number | null => (teslim ? (gunSonu(teslim) - b.simdi) / DK : null);

// Kaynaklar istasyonlar ve kişiler modüllerinin verisidir; kişinin istasyonu istasyonlar'dan. Pasif istasyondaki, arızalı ya da bakımdaki
// makine plana iş almaz. Plan ayarı satırı olmayan istasyonun verimi %100'dür.
async function kaynaklariOku(db: Db, istasyonMakineleri: IstasyonMakineleri): Promise<Map<string, KaynakBilgisi>> {
  const aktif = new Set((await aktifIstasyonlar(db)).map((i) => i.id));
  const ist = await istasyonListesi(db, { pasiflerDahil: true });
  const verim = new Map((await planAyarlari(db)).map((a) => [a.istasyonId, Number(a.verimYuzde) / 100]));
  const durmus = new Set((await makineDurumlari(db)).filter((d) => d.durum !== 'calisir').map((d) => d.makineId));
  const harita = new Map<string, KaynakBilgisi>();
  // Bütün makineler tek okumada, koda göre (istasyon başına okumayla aynı sıra).
  const istasyonunMakineleri = new Map<number, Makine[]>();
  for (const m of await makineListesi(db, { pasiflerDahil: true })) {
    if (m.istasyonId !== null) istasyonunMakineleri.set(m.istasyonId, [...(istasyonunMakineleri.get(m.istasyonId) ?? []), m]);
  }
  for (const i of ist) {
    const makineler = istasyonunMakineleri.get(i.id) ?? [];
    istasyonMakineleri.set(i.id, makineler.filter((m) => m.aktif).map((m) => ({ tur: 'makine', id: m.id })));
    for (const m of makineler) {
      harita.set(`makine:${m.id}`, { tur: 'makine', id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif && aktif.has(i.id) && !durmus.has(m.id),
        istasyon: { id: i.id, kod: i.kod, ad: i.ad }, isMerkeziId: i.isMerkeziId, verim: verim.get(i.id) ?? 1 });
    }
  }
  const kisiIst = new Map((await istasyonKisileri(db)).map((x) => [x.kisiId, x.istasyonId]));
  for (const k of await kisileriListele(db)) {
    const i = ist.find((x) => x.id === kisiIst.get(k.id));
    harita.set(`kisi:${k.id}`, { tur: 'kisi', id: k.id, kod: null, ad: k.ad, aktif: k.aktif && (!i || aktif.has(i.id)),
      istasyon: i ? { id: i.id, kod: i.kod, ad: i.ad } : null, isMerkeziId: i?.isMerkeziId ?? null, verim: 1 });
  }
  return harita;
}

const gunEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_DK * DK).toISOString().slice(0, 10);

// Vardiya takvimi tek okumada. Takvimi null olan (iş merkezine bağlanamayan) ya da ufukta hiç çalışma dakikası olmayan (vardiya
// tanımlanmamış) kaynak sürekli çalışır sayılır ve plan uyarısı alır; tanımsızda tatil ve kapalı günler yine çalışma vermez, yoksa tek tatil
// günü bütün ufku boşaltırdı.
async function vardiyaOku(db: Db, simdi: number, kaynaklar: Map<string, KaynakBilgisi>) {
  const merkezIdleri = [...new Set([...kaynaklar.values()].flatMap((k) => (k.isMerkeziId === null ? [] : [k.isMerkeziId])))];
  const istekler = [...[...kaynaklar.values()].map((k) => ({ tur: k.tur, id: k.id })), ...merkezIdleri.map((id) => ({ tur: 'is-merkezi' as const, id }))];
  const baslangic = tesisGunu(simdi);
  const okunan = await calismaTakvimleri(db, istekler, { baslangic, bitis: gunEkle(baslangic, TAKVIM_GUN) });
  const takvimler = new Map<string, Aralik[] | null>();
  const takvimsizKapali = new Map<string, Aralik[]>();
  const dakikasi = (iso: string) => (Date.parse(iso) - simdi) / DK;
  for (const [anahtar, t] of okunan) {
    const tanimsiz = t === null || t.gunler.every((g) => g.dakika === 0);
    takvimler.set(anahtar, tanimsiz ? null : t.araliklar.map((a) => ({ baslangic: dakikasi(a.baslangic), bitis: dakikasi(a.bitis) })));
    const kapali = tanimsiz && t ? t.gunler.filter((g) => g.kapali !== null).map((g) => ({ baslangic: (tesisGunBasi(g.tarih) - simdi) / DK, bitis: (tesisGunBasi(g.tarih) - simdi) / DK + GUN_DK })) : [];
    if (kapali.length > 0) takvimsizKapali.set(anahtar, kapali);
  }
  const kisiler = await merkezPersoneli(db, kaynaklar);
  const merkezler = new Map((await isMerkezleri(db, { pasiflerDahil: true })).filter((m) => merkezIdleri.includes(m.id))
    .map((m) => [m.id, { kod: m.kod, ad: m.ad, kisiler: [...(kisiler.get(m.id) ?? new Map())].map(([kisiId, sent]) => ({ kisiId, pay: sent / 10000 })) }]));
  const operator = new Map((await planAyarlari(db)).map((a) => [a.istasyonId, Number(a.operatorIhtiyaci)]));
  return { takvimler, takvimsizKapali, merkezler, operator };
}

// 512 1 a: kabul edilmiş ek vardiya makinenin takvimine eklenir (gün başı + vardiya başlangıcı, vardiya süresince). Takvimi tanımsız
// (sürekli çalışan) makineye eklenmez; kişi takvimi değişmez.
async function ekMesaiTakvimde<T extends { takvimler: Map<string, Aralik[] | null> }>(db: Db, hedef: Hedef, simdi: number, v: T): Promise<T> {
  const satirlar = await s.ekMesailer(db, hedef);
  if (satirlar.length === 0) return v;
  const vardiyalar = new Map((await vardiyaTanimlari(db)).map((x) => [x.id, x]));
  const ek = new Map<string, Aralik[]>();
  for (const x of satirlar) {
    const vr = vardiyalar.get(x.vardiyaId);
    if (!vr) continue;
    const bas = (tesisGunBasi(x.gun) - simdi) / DK + Number(vr.baslangic.slice(0, 2)) * 60 + Number(vr.baslangic.slice(3, 5));
    const a = `makine:${String(x.makineId)}`;
    ek.set(a, [...(ek.get(a) ?? []), { baslangic: bas, bitis: bas + x.saat * 60 }]);
  }
  const takvimler = new Map(v.takvimler);
  for (const [a, l] of ek) { const t = takvimler.get(a); if (t) takvimler.set(a, araliklaraEkle(t, l)); }
  return { ...v, takvimler };
}

// Kişi kart #1324 kararıyla atama yüzdesi kadar sayılır: iki iş merkezine %50 atanan kişi ikisinde yarımdır. Paylar vardiya modülünün tek
// tanımından gelir (istasyon, makine ve ekip ataması); pasif kişi ve pasif istasyon sayılmaz.
async function merkezPersoneli(db: Db, kaynaklar: Map<string, KaynakBilgisi>): Promise<Map<number, Map<number, number>>> {
  const sonuc = new Map<number, Map<number, number>>();
  for (const [m, l] of await isMerkeziKisiPaylari(db)) {
    const aktif = new Map([...l].filter(([kisiId]) => kaynaklar.get(`kisi:${kisiId}`)?.aktif === true));
    if (aktif.size > 0) sonuc.set(m, aktif);
  }
  return sonuc;
}

async function yetkinlikOku(db: Db): Promise<Map<number, Set<number>>> {
  const h = new Map<number, Set<number>>();
  for (const y of await istasyonYetkinlikleri(db)) h.set(y.kisiId, (h.get(y.kisiId) ?? new Set()).add(y.istasyonId));
  return h;
}

const verimi = (b: Baglam) => (k: Kaynak): number => b.kaynaklar.get(kaynakAnahtari(k))?.verim ?? 1;

async function kaynakBilgisi(db: Db, b: Baglam, k: Kaynak): Promise<KaynakBilgisi | null> {
  const v = b.kaynaklar.get(kaynakAnahtari(k));
  if (v) return v;
  if (k.tur === 'makine') {
    const m = await makineGetir(db, k.id);
    if (m) return { tur: 'makine', id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif, istasyon: null, isMerkeziId: null, verim: 1 };
  }
  return null;
}

// "Başladı" iş emrinin (adımın) durumudur: emrin bir adımı çalışınca bekleyen adımları hâlâ taşınır ve sıralanır. uretim-emirleri durumu emir
// düzeyinde verir; adımın kendi durumu satırdadır.
const adimDurumuyla = (i: PlanIsEmri): PlanIsEmri => (i.durum !== 'basladi' || i.adimDurumu === 'calisiyor' ? i : { ...i, durum: 'planli' });

type RotaOnbellek = Map<number, Awaited<ReturnType<typeof revizyonGetir>>>;
type RotaKaynagi = NonNullable<Awaited<ReturnType<typeof revizyonGetir>>>['adimlar'][number]['adaylar'][number]['kaynak'];

// İstasyona bağlı adımda makineyi planlayıcı seçer: istasyon, aktif makinelerinin her birine açılır (#1184).
async function planKaynaklari(db: Db, kaynaklar: readonly RotaKaynagi[], istasyonMakineleri: IstasyonMakineleri): Promise<Kaynak[]> {
  const sonuc: Kaynak[] = [];
  for (const k of kaynaklar) {
    if (k.tur !== 'istasyon') { sonuc.push({ tur: k.tur, id: k.id }); continue; }
    if (!istasyonMakineleri.has(k.id)) istasyonMakineleri.set(k.id, (await istasyondakiMakineler(db, k.id)).map((m) => ({ tur: 'makine', id: m.id })));
    sonuc.push(...istasyonMakineleri.get(k.id)!);
  }
  return sonuc;
}
const isEmriKaynagi = (k: RotaKaynagi | null): PlanIsEmri['kaynak'] => (k === null || k.tur === 'istasyon' ? null : { tur: k.tur, id: k.id });
async function isKur(
  db: Db, i: PlanIsEmri, rotalar: RotaOnbellek, urunler: Map<number, { kod: string; ad: string }>, istasyonMakineleri: IstasyonMakineleri,
): Promise<Is> {
  if (!rotalar.has(i.kaynakRotaRevizyonId)) rotalar.set(i.kaynakRotaRevizyonId, await revizyonGetir(db, i.kaynakRotaRevizyonId));
  if (!urunler.has(i.malzemeNo)) { const o = await malzemeOzeti(db, i.malzemeNo); urunler.set(i.malzemeNo, { kod: o?.kod ?? '?', ad: o?.ad ?? o?.kod ?? '?' }); }
  const adim = rotalar.get(i.kaynakRotaRevizyonId)?.adimlar.find((a) => a.opNo === i.opNo);
  const ayar = i.ayarSuresiDk === null ? null : Number(i.ayarSuresiDk);
  const birim = i.birimSureDk === null ? null : Number(i.birimSureDk);
  return {
    ...i, durum: i.durum === 'taslak' ? 'planli' : i.durum, taslakEmir: i.durum === 'taslak', urunKodu: urunler.get(i.malzemeNo)!.kod, urunAdi: urunler.get(i.malzemeNo)!.ad,
    rotaKaynaklari: adim ? await planKaynaklari(db, [...(adim.kaynak ? [adim.kaynak] : []), ...adim.adaylar.map((x) => x.kaynak)], istasyonMakineleri) : [],
    sureDk: isSuresi(ayar, birim, i.adimAdedi ?? i.adet), ayarDk: ayar, devirDk: null, devirAyarDk: null, devirSonDk: null,
  };
}

// 1248 a: işin emir içi öncülleri. uretim-emirleri gerçek emirde listeyi çözülmüş verir; planın kendi denediği emirde liste yoktur, aynı
// ortak işlevle (adimOnculleri) kurulur. Listede olup açık işlerde olmayan (bitmiş) öncül beklenmez.
type IcOncul = { is: Is; tur: 'bekleyen' | 'akisli'; devirAdedi: number | null };
function icOnculler(isler: ReadonlyMap<number, Is>, i: Is): IcOncul[] {
  if (i.onculler) return i.onculler.flatMap((o) => { const x = isler.get(o.isEmriId); return x ? [{ is: x, tur: o.tur, devirAdedi: o.devirAdedi }] : []; });
  const adimlar = [...isler.values()].filter((x) => x.uretimEmriId === i.uretimEmriId).map((x) => ({ id: x.id, sira: x.sira, bagimlilik: x.bagimlilik, devirAdedi: x.devirAdedi }));
  return adimOnculleri(adimlar, adimlar.find((x) => x.id === i.id)!).map(({ adim, tur, devirAdedi }) => ({ is: isler.get(adim.id)!, tur, devirAdedi }));
}
// Sınır hesabı için iş, tek öncülüyle görülür: türü öncülün türü, devri o öncülünki (enErkenBaslangic, enErkenBitis).
function onculeGore(is: Is, o: IcOncul): Is {
  const m = is.motorOnculleri?.find((x) => x.id === o.is.id);
  return { ...is, bagimlilik: o.tur, ...(m && o.tur === 'akisli' ? { devirDk: m.devirDk ?? null, devirAyarDk: m.devirAyarDk ?? null } : {}) };
}

// Akışlı devir (PL-02): ardıl, öncülün devir adedini üretmesini (öncülün ayarı ve birim süresi) bekler; son devir partisini kendi birim
// süresiyle öncülün bitişinden sonra işler. Açık öncülü olmayan (bitmiş) adımda devir yoktur. 1248 a: devir öncül başınadır
// (motorOnculleri); işin devirDk'sı ilk akışlı öncülünkidir, son parti en büyük devir adedidir.
function devirleriKur(isler: Map<number, Is>): void {
  const sayi = (x: string | null) => (x === null ? null : Number(x));
  for (const i of isler.values()) {
    const devir = (o: IcOncul): Pick<MotorOnculu, 'devirDk' | 'devirAyarDk'> => {
      const ob = sayi(o.is.birimSureDk);
      return o.devirAdedi === null || ob === null ? { devirDk: null, devirAyarDk: null }
        : { devirDk: (sayi(o.is.ayarSuresiDk) ?? 0) + Math.min(o.devirAdedi, o.is.adimAdedi ?? o.is.adet) * ob, devirAyarDk: sayi(o.is.ayarSuresiDk) };
    };
    const l = icOnculler(isler, i);
    i.motorOnculleri = l.map((o) => ({ id: o.is.id, tur: o.tur, ...(o.tur === 'akisli' ? devir(o) : {}) }));
    const akisli = l.filter((o) => o.tur === 'akisli' && o.devirAdedi !== null);
    if (akisli.length === 0) continue;
    const b = sayi(i.birimSureDk);
    Object.assign(i, devir(akisli[0]!));
    i.devirSonDk = b === null ? null : Math.min(Math.max(...akisli.map((o) => o.devirAdedi!)), i.adimAdedi ?? i.adet) * b;
  }
}

// 1248 a: planın denediği emirde öncül listesi rotadandır (op numarasından iş kimliğine). Fason adım iş olmadığından listede onun
// yerine fason adımın öncülleri geçer. Tek hatlı rotada (liste null) ortak eski kural uygulanır.
function denemeOnculleri(adimlar: readonly RotaAdimi[], icler: readonly { a: RotaAdimi }[], id: (n: number) => number): PlanIsEmri['onculler'][] {
  const no = new Map(icler.map(({ a }, n) => [a.opNo, id(n)]));
  const adim = new Map(adimlar.map((a) => [a.opNo, a]));
  const coz = (l: NonNullable<RotaAdimi['onculler']>, gorulen: Set<number>): NonNullable<PlanIsEmri['onculler']> => l.flatMap((o) => {
    const x = no.get(o.opNo);
    if (x !== undefined) return [{ isEmriId: x, tur: o.tur, devirAdedi: o.devirAdedi }];
    const f = adim.get(o.opNo);
    if (!f?.onculler || gorulen.has(o.opNo)) return [];
    return coz(f.onculler, new Set([...gorulen, o.opNo]));
  });
  return icler.map(({ a }) => (a.onculler === null ? null : coz(a.onculler, new Set())));
}

// Rotanın iç adımları; fason adım iş olmaz, termini sonraki iç adımın beklemesine eklenir (termini girilmemiş fason FASON_VARSAYILAN_GUN).
type RotaAdimi = NonNullable<Awaited<ReturnType<typeof revizyonGetir>>>['adimlar'][number];
function icAdimlar(adimlar: readonly RotaAdimi[]): { a: RotaAdimi; fasonBekleGun: number }[] {
  let gun = 0;
  return [...adimlar].sort((x, y) => x.sira - y.sira).flatMap((a) => {
    if (a.fason !== null) { gun += a.fason.terminGun ?? FASON_VARSAYILAN_GUN; return []; }
    const fasonBekleGun = gun;
    gun = 0;
    return [{ a, fasonBekleGun }];
  });
}

// Deneme emri (Hızlı dene: acil sipariş): yürürlükteki rotadan, eksi kimlikli iş emirleriyle; canlıya geçmez.
async function denemeIsleri(
  db: Db, d: DegisiklikSatiri, rotalar: RotaOnbellek, urunler: Map<number, { kod: string; ad: string }>, istasyonMakineleri: IstasyonMakineleri,
): Promise<Is[]> {
  const v = d.veri as { malzemeNo: number; adet: number; teslim: string; revizyonId: number } | null;
  if (!v) return [];
  const r = rotalar.get(v.revizyonId) ?? await revizyonGetir(db, v.revizyonId);
  rotalar.set(v.revizyonId, r);
  if (!r) return [];
  const sonuc: Is[] = [];
  const icler = icAdimlar(r.adimlar);
  const onculler = denemeOnculleri(r.adimlar, icler, (n) => -(d.id * 1000 + n + 1));
  for (const [n, { a, fasonBekleGun }] of icler.entries()) {
    sonuc.push(await isKur(db, {
      fasonBekleGun, onculler: onculler[n] ?? null,
      id: -(d.id * 1000 + n + 1), uretimEmriId: -d.id, emirNo: `DENEME-${d.id}`, malzemeNo: v.malzemeNo, adet: v.adet, teslim: v.teslim,
      kaynakRotaRevizyonId: v.revizyonId, sira: a.sira, opNo: a.opNo, ad: a.ad, kaynak: isEmriKaynagi(a.kaynak), ayarSuresiDk: a.ayarSuresiDk,
      birimSureDk: a.birimSureDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, durum: 'planli', oncelik: 1, acilma: new Date().toISOString(), baslangic: null,
    }, rotalar, urunler, istasyonMakineleri));
  }
  return sonuc;
}

// 393 d: uretim-emirleri başka makinede başlatmayı denetlerken canlı ayrımları buradan alır (kablolama.ts). Durum ve emir süzmesi onundur.
export const canliMakineAyrimlari = async (db: Db, makineIdleri: readonly number[], ufukDk: number) =>
  (await s.canliMakineAyrimlari(db, makineIdleri, ufukDk)).map((x) => ({ ...x, baslangic: x.baslangic.toISOString() }));

// Proje maliyet plana bağlıdır (canlı sıra): iş emrinin tahmini maliyetini plan ithal edemez, kablolama.ts çözücü olarak verir.
// Kayıtsızken (araç, test) katkı payı bilinmez, kâr riski işlemez.
export type TahminiMaliyetCozucusu = (db: Db, isEmriIdleri: readonly number[]) => Promise<Map<number, number | null>>;
let tahminiMaliyet: TahminiMaliyetCozucusu | null = null;
export function tahminiMaliyetCozucusuKaydet(cozucu: TahminiMaliyetCozucusu | null): void { tahminiMaliyet = cozucu; }

// ADR 0018: ortak plan motoru Reçete ve Rota'nındır; plan onu ithal etmez, kablolama.ts çözücü olarak verir. Kayıtlıyken asıl plana
// yazan komutlar (kuyruk yaz, canlıya al) saatleri sunucu motorundan, aramasız sabit kipte yazar; kayıtsızken bugünkü yol sürer.
// sabitler motorun etrafına dizdiği yerlerdir (kilitli, dondurulmuş, bölünmüş işin parçası, kuyrukta olmayan iş); çalışan adım
// calisanlar'dadır. Girdinin geri kalanını (rota, takvim, personel) çözücü kendisi kurar.
export interface PlanMotoruIstegi extends PlanBenzetimi {
  kip: 'sabit' | 'yeni'; simdi: Date; kuyruklar: { makineId: number; anahtarlar: string[] }[];
  sabitler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[]; calisanlar: CalisanAdim[]; taslakId: number | null;
  // 512 1 a: taslağın kabul edilmiş ek vardiyaları (gün takvim günü); verilirse motorun kapasitesi bunlardır, çalışmanınki değil.
  ekMesai?: { makineId: number; gun: string; vardiyaId: number }[];
  // 690 b: emirler arası öncül (parti kolu, B7); motor öncülü yalnız rotadan, emrin içinde kurar.
  baglar?: { anahtar: string; oncul: string }[];
  // 686 a: rotada olmayan ek adım; öncül ve ardıl emrin içindeki komşu adımların anahtarı, süreler dakika.
  ekAdimlar?: { anahtar: string; ad: string; oncul: string | null; ardil: string | null; ayarDk: number; birimDk: number; adet: number }[];
  // 1202: kuyruk işinin önündeki bitmemiş fasonun kalan süresi (gün); motor rota ve emir fasonunu kendisi bilir, ek adımın fasonunu bilmez.
  fasonBekleme?: { anahtar: string; gun: number }[];
}
// vardiyasiz (168 b): vardiyası tanımsız tezgâhtaki kuyruk işleri; malzemeBekleyen (525 4 a, 763): katı malzeme kipinde malzemesi ufukta
// karşılanmayan siparişin işleri. İkisi de hata değildir, yerleşmemiş kalır. yerlesmeyen (981 a-1) de komutu durdurmaz; nedenler anahtara
// göre nedenidir (örnek: öncülü yerleşmedi).
export type PlanMotoruCozucusu = (db: Db, istek: PlanMotoruIstegi) =>
  Promise<{ yerlesimler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[]; yerlesmeyen: string[]; vardiyasiz?: string[]; malzemeBekleyen?: string[]; nedenler?: Record<string, string> }>;
let planMotoru: PlanMotoruCozucusu | null = null;
export function planMotoruCozucusuKaydet(cozucu: PlanMotoruCozucusu | null): void { planMotoru = cozucu; }
// 227 a: üretim emrinin plan malzeme maliyeti (Proje maliyet) katkıdan düşülür; kayıtsızken katkı payı bilinmez.
export type MalzemeMaliyetiCozucusu = (db: Db, uretimEmriIdleri: readonly number[]) => Promise<Map<number, number | null>>;
let malzemeMaliyeti: MalzemeMaliyetiCozucusu | null = null;
export function malzemeMaliyetiCozucusuKaydet(cozucu: MalzemeMaliyetiCozucusu | null): void { malzemeMaliyeti = cozucu; }

// 225: emrin bedel satırı, satırın tutarı yerine emrin payıyla (birim fiyat × emrin adedi).
// 1397 a: satırın plan günündeki kuru da taşınır; kuru olmayan döviz satırda null (bedeli bilinmez).
function emirSatiri(b: Pick<Baglam, 'siparisSatirlari' | 'kurlar'>, i: Pick<Is, 'siparisSatiriId' | 'adet'>) {
  const satir = i.siparisSatiriId == null ? null : b.siparisSatirlari.get(i.siparisSatiriId) ?? null;
  return satir && { ...satir, tutar: emirTutari(satir, i.adet), kur: b.kurlar.get(satir.paraBirimi) ?? null };
}

// 815 (699/3 a): plana yalnız emrin önceliği girer; gecikme bedelinin çarpanı da emrin öncelik çarpanıdır. Siparişin elle çarpanı ve
// müşteri sınıfı girmez.
const emirCarpani = (b: Pick<Baglam, 'bedelAyari'>, i: Pick<Is, 'oncelik'> | null): number => oncelikCarpani(i?.oncelik ?? null, b.bedelAyari);

async function baglamKur(db: Db, kullanici: Kullanici | null, hedef: Hedef): Promise<Baglam> {
  const simdi = Date.now();
  const gun0 = (tesisGunBasi(tesisGunu(simdi)) - simdi) / DK;
  const defter = hedef === null ? [] : await s.degisiklikler(db, [hedef]);
  const isler: Baglam['isler'] = new Map();
  const rotalar: RotaOnbellek = new Map();
  const urunler = new Map<number, { kod: string; ad: string }>();
  const ayar = await s.ayarOku(db, hedef);
  // Termini girilmemiş fason adım: satın almanın geçmiş teslim tahmini, yoksa FASON_VARSAYILAN_GUN (CA-2).
  const acik = await planlanacakIsEmirleri(db, { taslakDahil: ayar.taslakEmirler, fasonTahmini: (q) => fasonSuresiTahminleri(db, q) });
  const eksikRevizyon = await girdisiEksikRevizyonlar(db, acik.map((i) => i.kaynakRotaRevizyonId));
  const siparisSatirlari = await siparisSatiriOzetleri(db, acik.flatMap((i) => (i.siparisSatiriId == null ? [] : [i.siparisSatiriId])));
  // Kaynaklar ve ürün adları işlerden önce tek turda okunur: iş başına okuma olmasın.
  const istasyonMakineleri: IstasyonMakineleri = new Map();
  const kaynaklar = await kaynaklariOku(db, istasyonMakineleri);
  const ozetler = await malzemeOzetleri(db, acik.map((i) => i.malzemeNo));
  for (const no of new Set(acik.map((i) => i.malzemeNo))) { const o = ozetler.get(no); urunler.set(no, { kod: o?.kod ?? '?', ad: o?.ad ?? o?.kod ?? '?' }); }
  const rotaEksik = new Map<string, string>();
  for (const i of acik) {
    const neden = eksikRevizyon.get(i.kaynakRotaRevizyonId);
    if (neden) rotaEksik.set(i.emirNo, neden);
    else isler.set(i.id, await isKur(db, adimDurumuyla(i), rotalar, urunler, istasyonMakineleri));
  }
  const b: Baglam = {
    simdi, gun0, hedef, ayar, isler, rotaEksik, eskiRota: new Map(), kaynaklar, defter, kapaliGunler: [], siparisSatirlari, bedelAyari: await s.bedelAyariOku(db, hedef), finansmanOraniGun: await planFinansmanOrani(db, tesisGunu(simdi)), kurlar: await planKurlari(db, tesisGunu(simdi)), yetkinlik: await yetkinlikOku(db), yersiz: await s.yersizBolmeler(db, hedef), istasyonMakineleri,
    ...await ekMesaiTakvimde(db, hedef, simdi, await vardiyaOku(db, simdi, kaynaklar)),
    izinli: kullanici ? await kisininIzinliIsMerkezleri(db, kullanici.id) : [],
    fiyatGorur: kullanici !== null && islemVarMi(kullanici, 'siparisler.fiyat-oku'), katkilar: new Map(), gercek: gerceklesenler(simdi, acik), fiili: fiiliKaynaklar(acik),
  };
  if (tahminiMaliyet && malzemeMaliyeti) {
    const emirler = new Map<number, BedelSatiri & { kur: number | null }>();
    for (const i of isler.values()) { const satir = emirSatiri(b, i); if (satir && !emirler.has(i.uretimEmriId)) emirler.set(i.uretimEmriId, satir); }
    // 1379 a: katkı emrin bütün iş emrinin maliyetiyle hesaplanır (bitmiş ve fason dahil); yalnız plandaki kalan iş düşülürse yarı bitmiş
    // emir tam tutarına karşı kalan maliyetle kârlı görünür.
    const bagli = [...await emirlerinIsEmriIdleri(db, [...emirler.keys()])].flatMap(([uretimEmriId, idler]) => idler.map((id) => ({ id, uretimEmriId })));
    b.katkilar = katkiPaylari(emirler, bagli, await tahminiMaliyet(db, bagli.map((i) => i.id)), await malzemeMaliyeti(db, [...emirler.keys()]));
  }
  // Taslaktaki denemeler (P6): sahibi modülün verisi değişmeden plan girdisine uygulanır.
  for (const d of defter.filter((x) => BENZETIM.has(x.tur))) {
    const v = (d.veri ?? {}) as Record<string, unknown>;
    if (d.tur === 'oncelik' || d.tur === 'teslim') {
      for (const i of isler.values()) {
        if (i.uretimEmriId !== v.emirId) continue;
        if (d.tur === 'oncelik') i.oncelik = Number(v.oncelik);
        else i.teslim = String(v.teslim);
      }
    }
    if (d.tur === 'makine_ariza') { const k = kaynaklar.get(`makine:${String(v.makineId)}`); if (k) kaynaklar.set(`makine:${k.id}`, { ...k, aktif: false }); }
    if (d.tur === 'gun_kapat') { const g = Math.round(((tesisGunBasi(String(v.tarih)) - simdi) / DK - gun0) / GUN_DK); if (g >= 0) b.kapaliGunler.push(g); }
    if (d.tur === 'acil_emir') for (const i of await denemeIsleri(db, d, rotalar, urunler, istasyonMakineleri)) isler.set(i.id, i);
  }
  devirleriKur(isler);
  b.eskiRota = await eskiRotaliEmirler(db, isler, rotalar);
  return b;
}

async function eskiRotaliEmirler(db: Db, isler: Baglam['isler'], rotalar: RotaOnbellek): Promise<Baglam['eskiRota']> {
  const h: Baglam['eskiRota'] = new Map();
  if (planMotoru === null) return h;
  const yururlukte = await yururluktekiRevizyonIdleri(db, [...new Set([...isler.values()].map((i) => i.malzemeNo))]);
  for (const i of isler.values()) {
    const r = yururlukte.get(i.malzemeNo);
    if (r === undefined || r === i.kaynakRotaRevizyonId || h.has(i.uretimEmriId)) continue;
    if (!rotalar.has(r)) rotalar.set(r, await revizyonGetir(db, r));
    h.set(i.uretimEmriId, new Set((rotalar.get(r)?.adimlar ?? []).map((a) => a.opNo)));
  }
  return h;
}

const fiiliKaynaklar = (acik: readonly PlanIsEmri[]): Baglam['fiili'] => new Map(acik.flatMap((i) =>
  (i.adimDurumu === 'calisiyor' && i.fiiliMakineId !== undefined ? [[i.id, { tur: 'makine', id: i.fiiliMakineId } as Kaynak] as const] : [])));

// 391 a: çalışan adımın kalanı tek yerde, adetten: parça sayılmadıysa ayar, artı kalan adet x birim süre (dakika, verimsiz). Plan
// ekranı ve ortak motor (calisanAdimlar) bunu kullanır; çalışmayan ya da süresiz adımda null.
function calisanKalani(i: PlanIsEmri): { kalanDk: number; ayarDk: number } | null {
  if (i.durum !== 'basladi' || i.adimDurumu !== 'calisiyor' || i.islenenAdet === undefined) return null;
  const ayarDk = i.islenenAdet > 0 || i.ayarSuresiDk === null ? 0 : Number(i.ayarSuresiDk);
  const kalanDk = isSuresi(ayarDk, i.birimSureDk === null ? null : Number(i.birimSureDk), Math.max((i.adimAdedi ?? i.adet) - i.islenenAdet, 0));
  return kalanDk === null ? null : { kalanDk, ayarDk };
}

function gerceklesenler(simdi: number, acik: readonly PlanIsEmri[]): Baglam['gercek'] {
  const h: Baglam['gercek'] = new Map();
  for (const i of acik) {
    const k = calisanKalani(i);
    if (k === null) continue;
    const an = (t: string | null | undefined) => (t ? dk({ simdi }, new Date(t)) : null);
    h.set(i.id, { baslangic: an(i.adimBaslama), cikis: an(i.sonSayimAni ?? i.adimBaslama), ...k });
  }
  return h;
}

// Reçete ve Rota'nın ortak motoru (ADR 0018, 391 a) çalışan adımın kalanını buradan alır, kendisi hesaplamaz. Anahtar emir no|op no;
// makine terminalin çalıştırdığı (393 d), yoksa planın kaynağı; sayım anı son sayım, sayım yoksa adımın başladığı an. kalanVerimliDk
// makinenin istasyon verimiyle, plan ekranının bitişi kurduğu (gerceklesenAralik) aynı verimliSure'den: verim tek yerde uygulanır.
// Yetki denetlemez; çağıran korur.
export interface CalisanAdim {
  anahtar: string; makineId: number | null; baslangic: string | null; sayimAni: string | null; kalanDk: number; kalanVerimliDk: number;
}
export async function calisanAdimlar(db: Db): Promise<CalisanAdim[]> {
  const iso = (t: string | null | undefined) => (t ? new Date(t).toISOString() : null);
  const acik = await planlanacakIsEmirleri(db);
  if (!acik.some((i) => calisanKalani(i) !== null)) return [];
  const kaynaklar = await kaynaklariOku(db, new Map());
  return acik.flatMap((i) => {
    const k = calisanKalani(i);
    if (k === null) return [];
    const makineId = i.fiiliMakineId ?? (i.kaynak?.tur === 'makine' ? i.kaynak.id : null);
    const verim = makineId === null ? 1 : kaynaklar.get(kaynakAnahtari({ tur: 'makine', id: makineId }))?.verim ?? 1;
    return [{
      anahtar: `${i.emirNo}|${i.opNo}`, makineId, baslangic: iso(i.adimBaslama), sayimAni: iso(i.sonSayimAni ?? i.adimBaslama),
      kalanDk: k.kalanDk, kalanVerimliDk: verimliSure(k.kalanDk, k.ayarDk, verim),
    }];
  });
}

const FARK_MS = 60_000;
type MotorKuyrugu = { makineId: number; isler: { isId: number; onizleme: { baslangic: string; bitis: string } | null }[] };
const anahtarMetni = (a: string) => a.replace('|', ' OP ');
const BAGLI_PARTI = 'Bağlı parti yerleşmedi.';
// Kol zinciri derinliğinden fazla tur gerekmez; sınır motorun sonsuza koşmasını önler.
const KOL_TURU = 8;
// Motor istekte olmayan öncülü bitmiş sayar. Yerleşen iş iki durumda beklemeye alınır (emrinde sonraki yerleşen adımlarla, nedeniyle):
// 1036 a, birleşme adımının kol öncülü planlanacak ama yerleşmedi; 1034, emirdeki önceki adım yerleşmemiş ek adım (rework, tamir, ek:
// süresiz ya da kaynaksız ek adım motora gitmez). Rota adımı öncülü motorun kendi bilgisidir, ona dokunulmaz. Daha önce alınanlar dönmez.
function bekleyenAdimlar(
  b: Baglam, yer: ReadonlyMap<number, unknown>, sabit: ReadonlySet<string>, anahtarOf: (id: number) => string | null, onceki: ReadonlyMap<number, string>,
): Map<number, string> {
  const yeni = new Map<number, string>();
  const hazir = (id: number) => {
    const x = b.isler.get(id);
    return x === undefined || !planlanacak(x) || yer.has(id) || sabit.has(anahtarOf(id) ?? '');
  };
  const emri = new Map<number, Is[]>();
  for (const i of b.isler.values()) if (planlanacak(i)) emri.set(i.uretimEmriId, [...(emri.get(i.uretimEmriId) ?? []), i]);
  for (const l of emri.values()) l.sort((x, y) => x.sira - y.sira);
  // 1248 a: bekleyen işin emirdeki ardılları (öncül listesiyle, dolaylı dahil) da bekler; öteki dallar beklemez.
  const bekle = (is: Is, neden: string) => {
    if (onceki.has(is.id) || yeni.has(is.id)) return;
    yeni.set(is.id, neden);
    const bagli = new Set([is.id]);
    for (const x of emri.get(is.uretimEmriId) ?? []) {
      if (x.sira <= is.sira || !icOnculler(b.isler, x).some((o) => bagli.has(o.is.id))) continue;
      bagli.add(x.id);
      if (yer.has(x.id) && !onceki.has(x.id) && !yeni.has(x.id)) yeni.set(x.id, `Önceki adım (OP ${is.opNo}) yerleşmedi.`);
    }
  };
  const baglar = partiBaglariOf(b);
  for (const l of emri.values()) {
    for (const is of l) {
      if (!yer.has(is.id)) continue;
      const once = icOnculler(b.isler, is).find((o) => (o.is.tur ?? 'rota') !== 'rota' && !hazir(o.is.id));
      if (once !== undefined) bekle(is, `Önceki adım (OP ${once.is.opNo}) yerleşmedi.`);
      else if (!(baglar.get(is.id) ?? []).every(hazir)) bekle(is, BAGLI_PARTI);
    }
  }
  return yeni;
}

// Son söz sunucuda (ADR 0018): kuyruklardaki işler sıraları korunarak sunucu motoruyla yeniden dizilir. Taslağın öteki makine yerleri
// sabittir. Başka makineye konan, yinelenen ya da eksik iş komutu reddeder (plan yazılmaz); vardiyasız, malzeme bekleyen ve motorun
// yerleştiremediği iş (981 a-1) yerlesmez'e düşer, öteki işler yazılır. yerlesmeyen motorun yerleştiremediği işler, nedeniyle.
// Fark yalnız önizlemesi olan işte.
// 1408: 'yeni' kipte (motor yerleşimi, önizleme, hızlı deneme) motor sırayı ve tezgâhı kuraldan kurar; kuyruğun tezgâhı yalnız adaydır,
// makine motorun seçtiğidir. benzetim taslağın denemesidir (sanal emir, öncelik, arıza, kapalı gün).
async function sunucuMotoru(db: Db, b: Baglam, taslakId: number | null, kuyruklar: readonly MotorKuyrugu[], secenek: { kip?: 'sabit' | 'yeni'; benzetim?: PlanBenzetimi; ekSabitler?: PlanMotoruIstegi['sabitler'] } = {}): Promise<{
  yer: Map<number, { baslangic: Date; bitis: Date }>; makine: Map<number, number>; fark: MotorFarki; yerlesmez: Set<number>; malzemeBekleyen: number; yerlesmeyen: { isId: number; neden: string }[];
}> {
  const kip = secenek.kip ?? 'sabit';
  const yer = new Map<number, { baslangic: Date; bitis: Date }>();
  const makine = new Map<number, number>();
  const yerlesmez = new Set<number>();
  const yerlesmeyen: { isId: number; neden: string }[] = [];
  const yeniden = new Map(kuyruklar.flatMap((q) => q.isler.map((i) => [i.isId, q.makineId] as const)));
  if (planMotoru === null || yeniden.size === 0) return { yer, makine, fark: [], yerlesmez, malzemeBekleyen: 0, yerlesmeyen };
  const anahtarOf = (id: number) => { const is = b.isler.get(id); return is ? `${is.emirNo}|${is.opNo}` : null; };
  const idOf = new Map<string, number>();
  for (const id of yeniden.keys()) {
    const a = anahtarOf(id)!;
    if (idOf.has(a)) throw cakisma(`${anahtarMetni(a)} birden çok iş emrine denk geliyor; sunucu motoru dizemez.`);
    idOf.set(a, id);
  }
  const yerlesimler = await s.yerlesimler(db, taslakId);
  // Plan bölünmüş ya da ileriye sıralanmış çalışan işi saklı yerinde tutar (gerceklesenAralik); motora da o yerle sabit gider.
  const sakli = new Set(yerlesimler.filter((y) => !yeniden.has(y.isEmriId) && (bolunmus(y) || dk(b, y.baslangic) > ILERI_SIRA_DK)).map((y) => anahtarOf(y.isEmriId)));
  const calisanlar = (await calisanAdimlar(db)).filter((c) => !sakli.has(c.anahtar));
  const calisan = new Set(calisanlar.map((c) => c.anahtar));
  const sabitler = yerlesimler.flatMap((y) => {
    const a = anahtarOf(y.isEmriId);
    if (yeniden.has(y.isEmriId) || a === null || calisan.has(a)) return [];
    return (bolunmus(y) ? y.parcalar! : [y]).flatMap((p) => (p.kaynak.tur === 'makine'
      ? [{ anahtar: a, makineId: p.kaynak.id, baslangic: p.baslangic.toISOString(), bitis: p.bitis.toISOString() }] : []));
  });
  // 690 b: parti kolu bağı motora öncül olarak gider.
  const isler = [...b.isler.values()];
  const baglar = [...partiBaglari(isler)].flatMap(([id, onculler]) => onculler.flatMap((o) => {
    const a = anahtarOf(id), oncul = anahtarOf(o);
    return a === null || oncul === null ? [] : [{ anahtar: a, oncul }];
  }));
  const ekAdimlar = ekAdimlari(b, [...yeniden.keys()], anahtarOf);
  // 1202: fason dönüşünü bekleyen adım (bağımsız değilse; motorsuz yoldaki enErken gibi).
  const fasonBekleme = [...yeniden.keys()].flatMap((id) => {
    const i = b.isler.get(id)!;
    return i.bagimlilik !== 'bagimsiz' && (i.fasonBekleGun ?? 0) > 0 ? [{ id, anahtar: anahtarOf(id)!, gun: i.fasonBekleGun! }] : [];
  });
  let malzemeBekleyen = 0;
  const ekMesai = (await s.ekMesailer(db, taslakId)).map(({ makineId, gun, vardiyaId }) => ({ makineId, gun, vardiyaId }));
  // 1036 a, 1034: yerleşmeyen kol ya da ek adım öncülünü bekleyen iş (bekleyenAdimlar) bu koşuda yerleşmez; motor onlarsız yeniden koşar.
  const sabitAnahtar = new Set([...sabitler.map((x) => x.anahtar), ...calisan]);
  const bekleyen = new Map<number, string>();
  for (let tur = 0; ; tur += 1) {
    yer.clear(); makine.clear(); yerlesmez.clear(); yerlesmeyen.length = 0;
    const sonuc = await planMotoru(db, {
      ...secenek.benzetim, kip, simdi: new Date(b.simdi), sabitler: [...sabitler, ...secenek.ekSabitler ?? []], calisanlar, taslakId, ...(baglar.length > 0 ? { baglar } : {}), ...(ekAdimlar.length > 0 ? { ekAdimlar } : {}),
      ...(fasonBekleme.length > 0 ? { fasonBekleme: fasonBekleme.filter((x) => !bekleyen.has(x.id)).map(({ anahtar, gun }) => ({ anahtar, gun })) } : {}),
      ekMesai,
      kuyruklar: kuyruklar.map((q) => ({ ...q, isler: q.isler.filter((i) => !bekleyen.has(i.isId)) })).filter((q) => q.isler.length > 0)
        .map((q) => ({ makineId: q.makineId, anahtarlar: q.isler.map((i) => anahtarOf(i.isId)!) })),
    });
    for (const [id, neden] of bekleyen) { yerlesmez.add(id); yerlesmeyen.push({ isId: id, neden }); }
    // 981 a-1: yerleşemeyen iş (öncülü yerleşmeyen ardılı dahil) nedeniyle yerleşmemiş kalır; öteki işler yazılır.
    for (const a of sonuc.yerlesmeyen) {
      const id = idOf.get(a);
      if (id === undefined || yerlesmez.has(id)) continue;
      yerlesmez.add(id);
      yerlesmeyen.push({ isId: id, neden: sonuc.nedenler?.[a] ?? 'Sunucu motoru yerleştiremedi.' });
    }
    // 168 b: vardiyası tanımsız tezgâhın işi komutu durdurmaz; yeri yazılmaz, plan cevabında yerleşmemiş kalır.
    for (const a of sonuc.vardiyasiz ?? []) { const id = idOf.get(a); if (id !== undefined) yerlesmez.add(id); }
    // 763: malzemesi ufukta gelmeyen iş de komutu durdurmaz; yeri yazılmaz, komutun özetinde sayısı söylenir.
    malzemeBekleyen = 0;
    for (const a of sonuc.malzemeBekleyen ?? []) { const id = idOf.get(a); if (id !== undefined && !yerlesmez.has(id)) { yerlesmez.add(id); malzemeBekleyen += 1; } }
    for (const r of sonuc.yerlesimler) {
      const id = idOf.get(r.anahtar);
      const baslangic = new Date(r.baslangic), bitis = new Date(r.bitis);
      if (id === undefined || yer.has(id) || yerlesmez.has(id) || (kip === 'sabit' && yeniden.get(id) !== r.makineId) || !(bitis.getTime() >= baslangic.getTime())) {
        throw cakisma(`Sunucu motoru ${anahtarMetni(r.anahtar)} için istenmeyen yer verdi. Plan yazılmadı.`);
      }
      yer.set(id, { baslangic, bitis });
      makine.set(id, r.makineId);
    }
    const eksik = [...yeniden.keys()].filter((id) => !yer.has(id) && !yerlesmez.has(id));
    if (eksik.length > 0) throw cakisma(`Sunucu motoru şu işleri yerleştirmedi: ${eksik.map((id) => anahtarMetni(anahtarOf(id)!)).join(', ')}. Plan yazılmadı.`);
    const yeni = bekleyenAdimlar(b, yer, sabitAnahtar, anahtarOf, bekleyen);
    if (yeni.size === 0 || tur >= KOL_TURU) break;
    for (const [id, neden] of yeni) bekleyen.set(id, neden);
  }
  const iso = (t: string | Date) => new Date(t).toISOString();
  const fark: MotorFarki = kuyruklar.flatMap((q) => q.isler.flatMap((i) => {
    const y = yer.get(i.isId);
    const o = i.onizleme;
    if (y === undefined || o === null || (Math.abs(Date.parse(o.baslangic) - y.baslangic.getTime()) <= FARK_MS && Math.abs(Date.parse(o.bitis) - y.bitis.getTime()) <= FARK_MS)) return [];
    return [{ anahtar: anahtarOf(i.isId)!, onizleme: { baslangic: iso(o.baslangic), bitis: iso(o.bitis) }, sunucu: { baslangic: iso(y.baslangic), bitis: iso(y.bitis) } }];
  }));
  return { yer, makine, fark, yerlesmez, malzemeBekleyen, yerlesmeyen };
}

// 168 b: sunucu motoru kayıtlıyken vardiyası tanımsız tezgâhın işi yerleşmez (motor sürekli çalışma varsaymaz).
const VARDIYASIZ = 'Tezgâhın vardiyası tanımsız.';
// 983 b: sunucu motoru emri yürürlükteki rotayla dizer; emir eski revizyondan açıldıysa süre ve adımlar emirdekinden farklı olabilir.
const ESKI_ROTA = 'emir eski rota revizyonundan açıldı; plan ürünün yürürlükteki rotasının süreleriyle kuruldu.';
// 981 a-1: sunucu motoru kayıtlıyken öncülü yerleşmeyen adım da yerleşmez (bekler). Sıra: kaynağı kullanımda değil, yürürlükteki
// rotada yok (983 b), önceki adımı yerleşmedi.
function yerlesmemeNedeni(b: Baglam, i: Is, yerlesmis: ReadonlySet<number>): string {
  if (planMotoru === null) return 'Yerleştirilmedi.';
  const k = i.kaynak === null ? undefined : b.kaynaklar.get(kaynakAnahtari(i.kaynak));
  if (k !== undefined && !k.aktif) return `${k.tur === 'makine' ? 'Makinesi' : 'Kişisi'} kullanımda değil.`;
  if (b.eskiRota.get(i.uretimEmriId)?.has(i.opNo) === false) return 'Adım ürünün yürürlükteki rotasında yok; emir eski rota revizyonundan açıldı.';
  const once = icOnculler(b.isler, i).find((o) => planlanacak(o.is) && !yerlesmis.has(o.is.id));
  if (once !== undefined) return `Önceki adım (OP ${once.is.opNo}) yerleşmedi.`;
  if ((partiBaglariOf(b).get(i.id) ?? []).some((o) => { const x = b.isler.get(o); return x !== undefined && planlanacak(x) && !yerlesmis.has(o); })) return BAGLI_PARTI;
  return 'Yerleştirilmedi.';
}
// 686 a: rotada olmayan ek adım (rework, tamir, ek) emrin kendi adımıdır; motor onu rotadan tanımaz, süresi ve emrin içindeki komşuları
// istekle gider. Süre metni okunamazsa sıfır değil null'dır: o adım gönderilmez, motor yerleştiremez ve komut reddedilir.
function ekAdimlari(b: Baglam, idler: readonly number[], anahtarOf: (id: number) => string | null): NonNullable<PlanMotoruIstegi['ekAdimlar']> {
  const sayi = (x: string | null) => (x === null || x.trim() === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  const emri = (e: number) => [...b.isler.values()].filter((x) => x.uretimEmriId === e).sort((x, y) => x.sira - y.sira);
  return idler.map((id) => b.isler.get(id)!).filter((i) => (i.tur ?? 'rota') !== 'rota').sort((x, y) => x.uretimEmriId - y.uretimEmriId || x.sira - y.sira)
    .flatMap((i) => {
      const ayarDk = sayi(i.ayarSuresiDk), birimDk = sayi(i.birimSureDk);
      if (ayarDk === null || birimDk === null) return [];
      // 1248 a: komşular öncül listesinden: en yakın (son) öncülü ve onu ilk bekleyen adım.
      const l = emri(i.uretimEmriId);
      const komsu = (x: Is | undefined) => (x === undefined ? null : anahtarOf(x.id));
      const ardil = l.find((x) => x.sira > i.sira && icOnculler(b.isler, x).some((o) => o.is.id === i.id));
      return [{ anahtar: anahtarOf(i.id)!, ad: i.ad, oncul: komsu(icOnculler(b.isler, i).at(-1)?.is), ardil: komsu(ardil), ayarDk, birimDk, adet: i.adimAdedi ?? i.adet }];
    });
}
const vardiyasizTezgahta = (b: Baglam, i: Is): boolean =>
  planMotoru !== null && i.kaynak?.tur === 'makine' && (b.takvimler.get(kaynakAnahtari(i.kaynak)) ?? null) === null;

// Takvim (PL-04): kaynağın vardiya takvimi; takvimi olmayan sürekli çalışır. Taslakta kapatılan gün (stüdyo denemesi) çalışma vermez.
function anahtarTakvimi(b: Baglam): (anahtar: string) => Takvim {
  const kapali = b.kapaliGunler.map((g) => ({ baslangic: b.gun0 + g * GUN_DK, bitis: b.gun0 + (g + 1) * GUN_DK }));
  // Vardiyadan okunan aralıkla aynı ufuk (bugün dahil TAKVIM_GUN + 1 gün).
  const surekli = [{ baslangic: b.gun0, bitis: b.gun0 + (TAKVIM_GUN + 1) * GUN_DK }];
  const bellek = new Map<string, Takvim>();
  return (anahtar) => {
    if (!bellek.has(anahtar)) {
      const t = b.takvimler.get(anahtar) ?? null;
      const cikan = [...kapali, ...(b.takvimsizKapali.get(anahtar) ?? [])];
      bellek.set(anahtar, cikan.length === 0 ? t : araliktanCikar(t ?? surekli, cikan));
    }
    return bellek.get(anahtar)!;
  };
}
const takvim = (b: Baglam): ((k: Kaynak) => Takvim) => { const t = anahtarTakvimi(b); return (k) => t(kaynakAnahtari(k)); };
const gunDakikalari = (b: Baglam, t: Takvim): number[] =>
  Array.from({ length: UFUK_GUN }, (_, g) => Math.round(kesisimDk(t, b.gun0 + g * GUN_DK, b.gun0 + (g + 1) * GUN_DK)));

// İstasyon x gün dolu dakika (matris ve PL-09).
function istasyonGunYuku(b: Baglam, yerler: readonly Yer[]): Map<number, number[]> {
  const yuk = new Map<number, number[]>();
  const t = takvim(b);
  for (const y of isgal(yerler)) {
    const i = b.kaynaklar.get(kaynakAnahtari(y.kaynak))?.istasyon?.id;
    if (i === undefined) continue;
    const l = yuk.get(i) ?? Array<number>(UFUK_GUN).fill(0);
    const parcalar = calisilanParcalar(t(y.kaynak), y);
    for (let g = 0; g < UFUK_GUN; g += 1) l[g]! += kesisimDk(parcalar, b.gun0 + g * GUN_DK, b.gun0 + (g + 1) * GUN_DK);
    yuk.set(i, l);
  }
  return yuk;
}

// PL-09: istasyon ataması olan kişisi bulunan iş merkezlerinin kişi-dakika ihtiyacı ve kapasitesi; kişisi olmayan merkezde veri yok sayılır.
// Kapasite kişi takvimlerinin toplamıdır: onaylı izin günü 0, planlı fazla mesai eklenmiş (vardiya). Takvimi okunamayan kişi iş merkezinin
// takvimiyle sayılır.
function personelVerisi(b: Baglam, yerler: readonly Yer[]) {
  const yuk = istasyonGunYuku(b, yerler);
  const istasyonMerkezi = new Map<number, number>();
  for (const k of b.kaynaklar.values()) if (k.istasyon && k.isMerkeziId !== null) istasyonMerkezi.set(k.istasyon.id, k.isMerkeziId);
  const t = anahtarTakvimi(b);
  const kisiDakikasi = (kisiId: number, merkezId: number) =>
    gunDakikalari(b, t((b.takvimler.get(`kisi:${kisiId}`) ?? null) === null ? `is-merkezi:${merkezId}` : `kisi:${kisiId}`));
  const girdi: PersonelMerkezi[] = [...b.merkezler].filter(([id, m]) => m.kisiler.length > 0 && (b.izinli.length === 0 || b.izinli.includes(id))).map(([id, m]) => ({
    isMerkeziId: id, gunSayisi: UFUK_GUN, kisiler: m.kisiler.map((k) => ({ calismaDk: kisiDakikasi(k.kisiId, id), pay: k.pay })),
    istasyonlar: [...istasyonMerkezi].filter(([, mid]) => mid === id).map(([iid]) => ({ yuk: yuk.get(iid) ?? [], operator: b.operator.get(iid) ?? 1 })),
  }));
  return personelYuku(girdi).map((p) => ({ ...p, kod: b.merkezler.get(p.isMerkeziId)!.kod, ad: b.merkezler.get(p.isMerkeziId)!.ad }));
}

// Kapsam: iş merkezi kısıtlı kullanıcı yalnız izinli iş merkezlerindeki istasyonların kaynaklarını görür ve yazar; istasyonsuz kişi
// yalnız kısıtsız kullanıcıya açıktır (VARSAYIM; istasyon-kişi bağı gelince netleşir).
const izinliMi = (b: Baglam, k: KaynakBilgisi | null): boolean =>
  b.izinli.length === 0 || (k !== null && k.isMerkeziId !== null && b.izinli.includes(k.isMerkeziId));

// Bölünmüş işin yeri zarftır; kaynağı dolduran parçalarıdır (isgal).
type Yer = Aralik & { isEmriId: number; kaynak: Kaynak; parcalar?: (Aralik & { no: number; kaynak: Kaynak })[] };
// Çalışan iş planlanan makinede değil, terminalin çalıştırdığı makinededir (393 d); bölünmüş iş saklı parçalarıyla kalır.
const kaynakOf = (b: Pick<Baglam, 'simdi'> | Baglam, y: YerlesimSatiri): Kaynak =>
  ('fiili' in b && !y.parcalar?.length ? b.fiili.get(y.isEmriId) : undefined) ?? y.kaynak;
const yerOf = (b: Pick<Baglam, 'simdi'> | Baglam, y: YerlesimSatiri): Yer & { kilitli: boolean; dondurulmus: boolean; elleSira: number | null; elleIstasyonId: number | null; elleKaynak: boolean } => ({
  isEmriId: y.isEmriId, kaynak: kaynakOf(b, y), ...(gerceklesenAralik(b, y) ?? { baslangic: dk(b, y.baslangic), bitis: dk(b, y.bitis) }), kilitli: y.kilitli, dondurulmus: y.dondurulmus, elleSira: y.elleSira,
  elleIstasyonId: y.elleIstasyonId ?? null, elleKaynak: y.elleKaynak ?? false,
  ...(y.parcalar?.length ? { parcalar: y.parcalar.map((p) => ({ no: p.no, kaynak: p.kaynak, baslangic: dk(b, p.baslangic), bitis: dk(b, p.bitis) })) } : {}),
});
// Kalan süre son sayımdan sayılır, şimdiden değil: aynı veriyle her okuma aynı planı verir. Bölünmüş çalışan iş saklı parçalarıyla kalır
// (parça başına gerçekleşen yok); planlamacının ileriye sıraladığı çalışan iş (A4) saklı yerinde kalır.
function gerceklesenAralik(b: Pick<Baglam, 'simdi'> | Baglam, y: YerlesimSatiri): Aralik | null {
  if (!('gercek' in b) || y.parcalar?.length || dk(b, y.baslangic) > ILERI_SIRA_DK) return null;
  return calisanAraligi(b, y.isEmriId, kaynakOf(b, y), dk(b, y.baslangic));
}
// Çalışan işin şimdiye uzanan yeri: başladığı an (yoksa yedek başlangıç), bitişi son sayımdan kalan verimli süre kadar sonra, kaynağın takvimiyle.
function calisanAraligi(b: Baglam, isEmriId: number, kaynak: Kaynak, yedekBaslangic: number): Aralik | null {
  const g = b.gercek.get(isEmriId);
  if (g === undefined) return null;
  const cikis = g.cikis ?? 0;
  const kalan = verimliSure(g.kalanDk, g.ayarDk, verimi(b)(kaynak));
  return { baslangic: Math.min(g.baslangic ?? yedekBaslangic, 0), bitis: calismaBitisi(takvim(b)(kaynak), cikis, kalan) ?? cikis + kalan };
}
// Motor çalışan işi şimdiye koyar; bundan ileride başlayan çalışan iş elle arkaya sıralanmıştır.
const ILERI_SIRA_DK = 1;
const cevapAraligi = (b: Baglam, y: YerlesimSatiri): { baslangic: string; bitis: string } => {
  const a = gerceklesenAralik(b, y);
  if (a === null) return { baslangic: y.baslangic.toISOString(), bitis: y.bitis.toISOString() };
  return { baslangic: tarih(b, a.baslangic).toISOString(), bitis: tarih(b, a.bitis).toISOString() };
};
// Kaynak doluluğu: bölünmüş iş her parçasıyla kendi kaynağında, bölünmemiş iş kendi yeriyle.
const isgal = (yerler: readonly Yer[]): Yer[] =>
  yerler.flatMap((y) => (y.parcalar?.length ? y.parcalar.map((p) => ({ isEmriId: y.isEmriId, kaynak: p.kaynak, baslangic: p.baslangic, bitis: p.bitis })) : [y]));
const bolunmus = (y: Pick<YerlesimSatiri, 'parcalar'> | undefined): boolean => (y?.parcalar?.length ?? 0) > 0;
const BOLUNMUS_ISI = 'Bölünmüş iş parça parça yazılır (Reçete ve Rota plan ekranı); burada önce parçaları birleştir.';
const parcaSuresi = (is: Is, adet: number): number | null =>
  isSuresi(is.ayarSuresiDk === null ? null : Number(is.ayarSuresiDk), is.birimSureDk === null ? null : Number(is.birimSureDk), adet);
// Bölme yazıldıktan sonra önceki adım hurdayla bitince adım adedi düşer; parçaların yazılı adetleri değişmez, süreleri adım adedine oranla
// hesaplanır (40'tan 39 sağlam: her parça 39/40). Adet yalnız azalır ya da aynı kalır (ek adet bölmeyi geçersiz kılmaz).
function uzlasikParcalar<P extends { adet: number }>(is: Is, parcalar: readonly P[]): P[] {
  const toplam = parcalar.reduce((t, p) => t + p.adet, 0);
  const adim = is.adimAdedi ?? is.adet;
  return toplam > 0 && adim < toplam ? parcalar.map((p) => ({ ...p, adet: (p.adet * adim) / toplam })) : [...parcalar];
}
const parcaIso = (p: ParcaSatiri) => ({ no: p.no, adet: p.adet, kaynak: p.kaynak, baslangic: p.baslangic.toISOString(), bitis: p.bitis.toISOString(), elleKaynak: p.elleKaynak });

// Emir içi öncüllerin (1248 a, 1245 a: listedeki her öncül kendi türü ve deviriyle) yerine göre en erken başlangıç (öncülün takvimi ve
// verimiyle) ve akışlı işin en erken bitişi (kendi kaynağının takvimi ve verimiyle); yeri olan öncül yoksa sınır yok.
function onculSinirlari(b: Baglam, isEmriId: number, yerler: readonly Yer[], kaynak: Kaynak): { enErken: number | null; enErkenBitis: number | null } {
  const is = b.isler.get(isEmriId);
  if (!is) return { enErken: null, enErkenBitis: null };
  const t = takvim(b);
  let enErken: number | null = null;
  let bitis: number | null = null;
  for (const o of icOnculler(b.isler, is)) {
    const oy = yerler.find((y) => y.isEmriId === o.is.id);
    if (!oy) continue;
    const x = onculeGore(is, o);
    const bas = enErkenBaslangic(x, oy, Number.NEGATIVE_INFINITY, t(oy.kaynak), verimi(b)(oy.kaynak));
    const son = enErkenBitis(x, oy, t(kaynak), verimi(b)(kaynak));
    enErken = Math.max(enErken ?? bas, bas);
    if (son !== null && son !== Number.NEGATIVE_INFINITY) bitis = Math.max(bitis ?? son, son);
  }
  return { enErken, enErkenBitis: bitis };
}

// 308 b: planlanacak adım, emirdeki önceki adımın izin verdiği en erken andan önce başlayamaz. Verilen emirlerin bütün yerleşik
// planlı adımlarına bakılır (taşınan adım sonrakini de aykırı bırakabilir); ilk aykırı adımın metni döner.
function siraIhlali(b: Baglam, yerler: readonly Yer[], uretimEmriIdleri: ReadonlySet<number>): string | null {
  for (const y of yerler) {
    const is = b.isler.get(y.isEmriId);
    if (!is || is.durum !== 'planli' || !uretimEmriIdleri.has(is.uretimEmriId)) continue;
    const { enErken } = onculSinirlari(b, y.isEmriId, yerler, y.kaynak);
    if (enErken !== null && y.baslangic < enErken - 0.01) return `${is.emirNo} OP ${is.opNo} önceki adımı bitmeden başlıyor (sıraya aykırı).`;
  }
  return null;
}

const siraDenetle = (b: Baglam, yerler: readonly Yer[], isEmriId: number): void => {
  const e = b.isler.get(isEmriId)?.uretimEmriId;
  const ihlal = e === undefined ? null : siraIhlali(b, yerler, new Set([e]));
  if (ihlal !== null) throw cakisma(`${ihlal} Önceki adımın bitişinden sonraya yerleştir.`);
};

function uyariListesi(b: Baglam, y: Yer, yerler: readonly Yer[]): string[] {
  const is = b.isler.get(y.isEmriId);
  if (!is) return [];
  const u = uyarilar(y, { teslimDk: teslimDk(b, is.teslim), ...onculSinirlari(b, y.isEmriId, yerler, y.kaynak), rotaKaynaklari: is.rotaKaynaklari });
  const k = b.kaynaklar.get(kaynakAnahtari(y.kaynak));
  if (k && !k.aktif) u.push(`${k.kod ?? k.ad} kullanımda değil (arıza ya da pasif).`);
  // S3: adımın istasyonu rotadaki makinenin istasyonudur; makinesiz adımda denetim yok.
  const yetkin = y.kaynak.tur === 'kisi' ? b.yetkinlik.get(y.kaynak.id) : undefined;
  const adimIstasyonu = is.rotaKaynaklari.map((x) => b.kaynaklar.get(kaynakAnahtari(x))).find((x) => x?.tur === 'makine')?.istasyon ?? null;
  if (yetkin && adimIstasyonu && !yetkin.has(adimIstasyonu.id)) u.push('Kişinin bu istasyonda yetkinliği yok.');
  if (is.taslakEmir) u.push('Taslak emir: plana alınınca kesinleşir.');
  return u;
}

const planlanacak = (i: Is) => i.durum === 'planli' || i.durum === 'basladi';
// 1034: hatalı parçanın kolundaki kalite kararı adımı ve planlamanın doldurmadığı rework adımı süresiz ve kaynaksızdır; plan onları dizmez.
function ekAdimNedeni(i: Is): string | null {
  if (i.kaynak !== null || i.rotaKaynaklari.length > 0) return null;
  if (i.tur === 'rework') return 'Rework adımı: planlama kaynak ve süre seçmedi.';
  if (i.tur === 'ek') return 'Süresiz ve kaynaksız ek adım plana girmez (hatalı parçada kalite kararı; karar verilince kapanır).';
  return null;
}

// 6c: emrin satırı ve çarpanı, öncelik bedeliyle aynı kaynaktan (196 a, 195 a). Katkı payı bilinmeyen satırda kâr riski işlemez.
function planinMaliyeti(b: Baglam, emirler: readonly { id: number; teslimDk: number | null; bit: number | null }[]): { tl: number; bilinmeyen: number } | null {
  return b.fiyatGorur ? tlToplami(b, emirler) : null;
}

function tlToplami(b: Baglam, emirler: readonly { id: number; teslimDk: number | null; bit: number | null }[]): { tl: number; bilinmeyen: number } {
  const ilkIs = new Map<number, Is>();
  for (const i of b.isler.values()) if (!ilkIs.has(i.uretimEmriId)) ilkIs.set(i.uretimEmriId, i);
  return planMaliyeti(emirler.map((e) => {
    const i = ilkIs.get(e.id);
    const satir = i ? emirSatiri(b, i) : null;
    const ham = i?.siparisSatiriId == null ? null : b.siparisSatirlari.get(i.siparisSatiriId) ?? null;
    // 284 a: ceza ve vade müşteriyle anlaşılan terminden işler (satırın, yoksa siparişin); emrin teslimi yalnız sıralamadadır.
    return {
      bitDk: e.bit, teslimDk: satir ? teslimDk(b, satir.termin) : e.teslimDk, satir: satir && { ...satir, katkiPayi: b.katkilar.get(e.id) ?? null },
      carpan: emirCarpani(b, i ?? null), pay: i ? adetPayi(ham, i.adet) : 1,
    };
  // 1448 a: finansman oranı yalnız finansın tek oranıdır; finansta yoksa finansman bedele girmez (elle orana düşülmez).
  }), { tabanSaat: b.bedelAyari.tabanBedelSaat, finansmanOraniGun: b.finansmanOraniGun, karRiskiOraniGun: b.bedelAyari.karRiskiOraniGun });
}

function gosterge(b: Baglam, yerler: readonly Yer[]) {
  const emirler = new Map<number, { id: number; teslimDk: number | null; isSayisi: number }>();
  for (const i of b.isler.values()) {
    if (!planlanacak(i)) continue;
    const e = emirler.get(i.uretimEmriId) ?? { id: i.uretimEmriId, teslimDk: teslimDk(b, i.teslim), isSayisi: 0 };
    e.isSayisi += 1;
    emirler.set(i.uretimEmriId, e);
  }
  // Doluluğun paydası istasyonun aktif kaynaklarının ufuktaki çalışma dakikasıdır (PL-04).
  const t = anahtarTakvimi(b);
  const kaynakSayisi = new Map<number, number>();
  const istasyonKapasitesi = new Map<number, number>();
  for (const k of b.kaynaklar.values()) {
    if (!k.aktif || !k.istasyon) continue;
    kaynakSayisi.set(k.istasyon.id, (kaynakSayisi.get(k.istasyon.id) ?? 0) + 1);
    istasyonKapasitesi.set(k.istasyon.id, (istasyonKapasitesi.get(k.istasyon.id) ?? 0) + kesisimDk(t(kaynakAnahtari(k)), 0, UFUK_DK));
  }
  const g = gostergeler(isgal(yerler.filter((y) => b.isler.has(y.isEmriId))).map((y) => {
    const k = b.kaynaklar.get(kaynakAnahtari(y.kaynak));
    return { ...y, uretimEmriId: b.isler.get(y.isEmriId)!.uretimEmriId, anahtar: kaynakAnahtari(y.kaynak), ad: k?.ad ?? '?', istasyon: k?.istasyon ?? null };
  }), [...emirler.values()], UFUK_DK, (id) => kaynakSayisi.get(id) ?? 1, { takvim: (a) => t(a), istasyon: (id) => istasyonKapasitesi.get(id) ?? 0 }, (l) => planinMaliyeti(b, l));
  const personel = personelVerisi(b, yerler);
  // 507 1 a: ayar saati ve öncelik ağırlıklı gecikme, ağırlığın adet payı fiyat göstergesindekiyle aynı satırdan (adetPayi).
  const ilkIs = new Map<number, Is>();
  for (const i of b.isler.values()) if (planlanacak(i) && !ilkIs.has(i.uretimEmriId)) ilkIs.set(i.uretimEmriId, i);
  const ek = ayarVeGecikme(isgal(yerler.filter((y) => b.isler.has(y.isEmriId))).map((y) => {
    const i = b.isler.get(y.isEmriId)!;
    return { ...y, uretimEmriId: i.uretimEmriId, ayarDk: i.durum === 'planli' || (i.islenenAdet ?? 0) === 0 ? i.ayarDk : 0 };
  }), [...emirler.values()].map((e) => {
    const i = ilkIs.get(e.id)!;
    const satir = i.siparisSatiriId == null ? null : b.siparisSatirlari.get(i.siparisSatiriId) ?? null;
    return { ...e, oncelik: oncelikSinifi(i.oncelik), pay: adetPayi(satir, i.adet) };
  }));
  // İlk sistem: personel kısıtı kapalıyken sınırlı gün sayılmaz (0); kişi verisi olan iş merkezi yoksa bilinmez (null).
  return { ...g, ...ek, personelGun: personel.length === 0 ? null : b.ayar.personelKisiti ? sinirliGunSayisi(personel) : 0 };
}

// Adet, süre gibi adımın işleyeceği adettir: önceki adımın hurdası düşülür, kolla paylaşılan adımda kol eklenir (H5).
const isOzeti = (i: Is) => ({
  isEmriId: i.id, uretimEmriId: i.uretimEmriId, emirNo: i.emirNo, urunKodu: i.urunKodu, urunAdi: i.urunAdi, opNo: i.opNo, ad: i.ad,
  adet: i.adimAdedi ?? i.adet, teslim: i.teslim, durum: i.durum, ustEmirId: i.ustEmirId ?? null, tur: i.tur ?? 'rota',
});

async function taslakOzeti(db: Db, b: Baglam, k: Kullanici | null) {
  if (b.hedef === null) return null;
  const x = await s.senaryo(db, b.hedef);
  if (!x) return null;
  return {
    id: x.id, ad: x.ad, surum: x.surum, tabanPlanSurumu: x.tabanPlanSurumu, canliDegisti: x.tabanPlanSurumu !== await s.planSurumu(db),
    degisiklikSayisi: b.defter.length, benim: k !== null && x.acanKisiId === k.id,
  };
}

/* ---------------- okuma ---------------- */

function cevapKur(b: Baglam, satirlar: readonly YerlesimSatiri[]) {
  const ilgili = satirlar.filter((y) => b.isler.has(y.isEmriId));
  const yerler = ilgili.map((y) => yerOf(b, y));
  const gorunur = ilgili.filter((y) => izinliMi(b, b.kaynaklar.get(kaynakAnahtari(kaynakOf(b, y))) ?? null));
  const yerlesmis = new Set(ilgili.map((y) => y.isEmriId));
  const yerlesimler = gorunur.map((y) => ({
    ...isOzeti(b.isler.get(y.isEmriId)!), kaynak: kaynakOf(b, y), ...cevapAraligi(b, y),
    kilitli: y.kilitli, dondurulmus: y.dondurulmus, elleSira: istasyonDegisti(b, y) ? null : y.elleSira, elleKaynak: y.elleKaynak ?? false, uyarilar: uyariListesi(b, yerOf(b, y), yerler),
    ...(bolunmus(y) ? { parcalar: y.parcalar!.map(parcaIso) } : {}),
  }));
  const yerlesmemis = [...b.isler.values()].filter((i) => !yerlesmis.has(i.id) && planlanacak(i)).map((i) => ({
    ...isOzeti(i), kaynak: i.kaynak,
    neden: i.sureDk === null ? ekAdimNedeni(i) ?? 'Süre bilinmiyor.' : i.kaynak === null && i.rotaKaynaklari.length === 0 ? 'Makine ya da kişi atanmamış.'
      : b.yersiz.has(i.id) ? 'Bölünmüş; parçalar yerleşmedi, bölme duruyor.' : vardiyasizTezgahta(b, i) ? VARDIYASIZ
      : yerlesmemeNedeni(b, i, yerlesmis),
    ...(b.yersiz.has(i.id) ? { bolme: b.yersiz.get(i.id)! } : {}),
  }));
  // Emir satırları (zaman çizelgesi): ilk işin başlangıcı, son işin bitişi, teslime kalan tampon; yerleşmemiş işi olan emir engellidir.
  const emirler = new Map<number, Is[]>();
  for (const i of b.isler.values()) if (planlanacak(i)) emirler.set(i.uretimEmriId, [...(emirler.get(i.uretimEmriId) ?? []), i]);
  const emirSatirlari = [...emirler].map(([id, l]) => {
    const y = yerler.filter((x) => l.some((i) => i.id === x.isEmriId));
    const ilk = l[0]!;
    const engelli = y.length < l.length;
    const bit = !engelli && y.length ? Math.max(...y.map((x) => x.bitis)) : null;
    const t = teslimDk(b, ilk.teslim);
    return {
      uretimEmriId: id, emirNo: ilk.emirNo, urunKodu: ilk.urunKodu, urunAdi: ilk.urunAdi, adet: ilk.adet, teslim: ilk.teslim, oncelik: ilk.oncelik,
      ustEmirId: ilk.ustEmirId ?? null,
      baslangic: y.length ? tarih(b, Math.min(...y.map((x) => x.baslangic))).toISOString() : null, bitis: bit === null ? null : tarih(b, bit).toISOString(),
      tamponGun: t === null || bit === null ? null : Math.round(((t - bit) / GUN_DK) * 10) / 10, engelli, isSayisi: l.length, yerlesen: y.length,
    };
  }).sort((x, y) => (x.baslangic ?? '9').localeCompare(y.baslangic ?? '9'));
  // Matris: istasyon x gün dolu dakika ve kapasite (aktif kaynak x açık gün).
  // Matris: istasyon x gün dolu dakika ve kapasite (aktif kaynakların o günkü vardiya dakikası; takvimi olmayan kaynak tam gün).
  const istasyonlar = new Map<number, { istasyonId: number; kod: string; ad: string; kaynaklar: Kaynak[] }>();
  for (const k of b.kaynaklar.values()) {
    if (!k.istasyon || !izinliMi(b, k)) continue;
    const x = istasyonlar.get(k.istasyon.id) ?? { istasyonId: k.istasyon.id, kod: k.istasyon.kod, ad: k.istasyon.ad, kaynaklar: [] };
    if (k.aktif) x.kaynaklar.push({ tur: k.tur, id: k.id });
    istasyonlar.set(k.istasyon.id, x);
  }
  const gunYuku = istasyonGunYuku(b, yerler);
  const kt = takvim(b);
  const istasyonYuku = [...istasyonlar.values()].map((x) => {
    const kap = Array<number>(UFUK_GUN).fill(0);
    for (const k of x.kaynaklar) gunDakikalari(b, kt(k)).forEach((d, g) => { kap[g]! += d; });
    return { istasyonId: x.istasyonId, kod: x.kod, ad: x.ad, dolu: (gunYuku.get(x.istasyonId) ?? Array<number>(UFUK_GUN).fill(0)).map((d) => Math.round(d)), kapasite: kap };
  }).filter((x) => x.kapasite.some((c) => c > 0) || x.dolu.some((d) => d > 0));
  const takvimsiz = [...b.kaynaklar.values()].filter((k) => k.aktif && izinliMi(b, k) && (b.takvimler.get(kaynakAnahtari(k)) ?? null) === null).length;
  const uyari = [
    ...(takvimsiz > 0 ? [planMotoru === null ? `${takvimsiz} makine ya da kişinin vardiya takvimi yok; sürekli çalışır sayıldı.`
      : `${takvimsiz} makine ya da kişinin vardiya takvimi yok; işleri yerleşmedi.`] : []),
    ...yerlesimler.flatMap((y) => y.uyarilar.map((u) => `${y.emirNo} OP ${y.opNo}: ${u}`)),
    ...yerlesmemis.map((y) => `${y.emirNo} OP ${y.opNo}: yerleşmedi; ${y.neden.toLocaleLowerCase('tr-TR')}`),
    ...[...b.rotaEksik].map(([emirNo, neden]) => `${emirNo}: plana alınmadı. ${neden}.`),
    ...emirSatirlari.filter((e) => b.eskiRota.has(e.uretimEmriId)).map((e) => `${e.emirNo}: ${ESKI_ROTA}`),
  ];
  return { yerler, yerlesimler, yerlesmemis, emirler: emirSatirlari, istasyonYuku, personelYuku: personelVerisi(b, yerler), uyarilar: uyari };
}

async function planOku(db: Db, k: Kullanici | null, b: Baglam, taslakAcildi = false): Promise<PlanCevabi> {
  const satirlar = await s.yerlesimler(db, b.hedef);
  const c = cevapKur(b, satirlar);
  const dusen = await elleSiraDusenleri(db, b, satirlar);
  const dortSaat = b.hedef === null ? [] : dortSaatIhlalleri(await canliPlanYerleri(db, b), planYerleri(b, satirlar), planliMi(b), calisirMi(b))
    .map((i) => `${dortSaatMetni(b, i)}; canlıya alırken gerekçe ister.`);
  return {
    surum: await s.planSurumu(db), simdi: new Date(b.simdi).toISOString(), ayar: b.ayar, taslak: await taslakOzeti(db, b, k), taslakAcildi,
    gunler: Array.from({ length: UFUK_GUN }, (_, i) => gunTarihi(b, i)),
    kaynaklar: [...b.kaynaklar.values()].filter((x) => x.aktif && izinliMi(b, x)).map(({ isMerkeziId, ...x }) => { void isMerkeziId; return x; }),
    yerlesimler: c.yerlesimler, yerlesmemis: c.yerlesmemis, emirler: c.emirler, istasyonYuku: c.istasyonYuku, personelYuku: c.personelYuku,
    gostergeler: gosterge(b, c.yerler), uyarilar: [...dortSaat, ...c.uyarilar, ...dusen.map(elleSiraMetni)], elleSiraDusenler: dusen,
    ekMesai: await ekMesaiOku(db, b.hedef),
  };
}

// 507 2 a: hedefin ek vardiyaları ve haftalık bütçesi; sınır plan ayarında boşsa eski motorun varsayılanı.
async function ekMesaiOku(db: Db, hedef: Hedef): Promise<PlanEkMesai> {
  const satirlar = await s.ekMesailer(db, hedef);
  return { satirlar, ...ekMesaiButcesi(satirlar, (await s.ekMesaiSiniri(db)) ?? EK_MESAI_HAFTA_SAAT) };
}

// Elle sıra (kullanıcı kararı 16.10.2026): verildiği andaki rota istasyonunda kalan adımda korunur (yalnız makine değişebilir); istasyon
// değişince, adım fasona alınınca ya da rotadan kalkınca düşer. İstasyonu bilinmeyen eski elle sıra düşmez.
const rotaIstasyonu = (b: Baglam, is: Is): number | null =>
  is.rotaKaynaklari.map((k) => b.kaynaklar.get(kaynakAnahtari(k))?.istasyon?.id).find((x) => x !== undefined) ?? null;
function istasyonAdi(b: Baglam, id: number | null): string | null {
  if (id === null) return null;
  const i = [...b.kaynaklar.values()].find((k) => k.istasyon?.id === id)?.istasyon;
  return i ? (i.kod ?? i.ad) : `#${id}`;
}
function istasyonDegisti(b: Baglam, y: Pick<YerlesimSatiri, 'isEmriId' | 'elleSira' | 'elleIstasyonId'>): { eski: number; yeni: number } | null {
  const is = b.isler.get(y.isEmriId);
  const eski = y.elleIstasyonId ?? null;
  if (y.elleSira === null || eski === null || !is) return null;
  const yeni = rotaIstasyonu(b, is);
  return yeni !== null && yeni !== eski ? { eski, yeni } : null;
}
type ElleSiraDusen = NonNullable<PlanCevabi['elleSiraDusenler']>[number];
async function elleSiraDusenleri(db: Db, b: Baglam, satirlar: readonly YerlesimSatiri[]): Promise<ElleSiraDusen[]> {
  const elle = satirlar.filter((y) => y.elleSira !== null && (y.elleIstasyonId ?? null) !== null && y.isEmriId > 0);
  const sonuc: ElleSiraDusen[] = [];
  for (const y of elle) {
    const d = istasyonDegisti(b, y);
    const is = b.isler.get(y.isEmriId);
    if (d && is) sonuc.push({ isEmriId: y.isEmriId, emirNo: is.emirNo, opNo: is.opNo, neden: 'istasyon', eskiIstasyon: istasyonAdi(b, d.eski), yeniIstasyon: istasyonAdi(b, d.yeni) });
  }
  const yok = elle.filter((y) => !b.isler.has(y.isEmriId));
  if (yok.length === 0) return sonuc;
  const varlik = new Map((await isEmriVarliklari(db, yok.map((y) => y.isEmriId))).map((v) => [v.id, v]));
  for (const y of yok) {
    const v = varlik.get(y.isEmriId);
    if (v && !v.fason) continue;
    sonuc.push({
      isEmriId: y.isEmriId, emirNo: v?.emirNo ?? null, opNo: v?.opNo ?? null, neden: v ? 'fason' : 'rotadan-kalkti',
      eskiIstasyon: istasyonAdi(b, y.elleIstasyonId ?? null), yeniIstasyon: null,
    });
  }
  return sonuc;
}
const elleSiraMetni = (d: ElleSiraDusen): string => (d.neden === 'rotadan-kalkti'
  ? `Elle sıra düştü: ${d.eskiIstasyon ?? ''} kuyruğundaki bir adım rotadan kalktı.`
  : `Elle sıra düştü: ${d.emirNo} OP ${d.opNo}, ${d.neden === 'istasyon' ? `istasyon ${d.eskiIstasyon} -> ${d.yeniIstasyon}` : `${d.eskiIstasyon} -> fason`}.`);

// Taslak okumasında taslak bulunmalı; başkasının taslağı da okunur (stüdyo karşılaştırması), yazılmaz.
async function hedefDenetle(db: Db, hedef: Hedef): Promise<void> {
  if (hedef !== null && !(await s.senaryo(db, hedef))) throw bulunamadi('Taslak bulunamadı.');
}

export async function plan(db: Db, k: Kullanici, taslak?: number): Promise<PlanCevabi> {
  const hedef = taslak ?? null;
  await hedefDenetle(db, hedef);
  return planOku(db, k, await baglamKur(db, k, hedef));
}

// A4: başka ekranın (Arkon Planlama) iş sırası canlı plandan gelir. Yerleşmemiş iş emri listede yoktur; sırayı çağıran kurar.
export async function canliSira(db: Db, isEmriIdleri: readonly number[]): Promise<{ planSurumu: number; yerlesimler: YerlesimSatiri[] }> {
  return { planSurumu: await s.planSurumu(db), yerlesimler: isEmriIdleri.length ? await s.canliYerlesimleri(db, isEmriIdleri) : [] };
}

// 507 3 a: taslağın yerleşimleri, Reçete ve Rota çalışmaya yazar. Bölünmüş işte zarf (ilk parçanın kaynağı, ilk başlangıç, son bitiş).
// Yetki denetlemez; çağıran (disari) korur.
export async function taslakYerlesimleri(db: Db, id: number) {
  const x = await s.senaryo(db, id);
  if (!x) throw bulunamadi('Taslak bulunamadı.');
  const y = await s.yerlesimler(db, id);
  return {
    id: x.id, surum: x.surum, durum: x.durum,
    yerlesimler: y.map((r) => ({ isEmriId: r.isEmriId, kaynak: r.kaynak, baslangic: r.baslangic.toISOString(), bitis: r.bitis.toISOString(), kilitli: r.kilitli })),
  };
}

// Canlı planda olmayan ama açık bir taslakta yerleşmiş iş emirleri (taslak canlıya alınınca canlıya geçer).
export async function taslaktakiler(db: Db, isEmriIdleri: readonly number[]): Promise<Set<number>> {
  return new Set(isEmriIdleri.length ? await s.taslaktakiIsEmirleri(db, isEmriIdleri) : []);
}

export async function canliYerlesim(db: Db, isEmriIdleri: readonly number[]): Promise<CanliYerlesimCevabi> {
  const { planSurumu, yerlesimler } = await canliSira(db, isEmriIdleri);
  return {
    planSurumu, yerlesimler: yerlesimler.map(({ parcalar, ...y }) => ({
      ...y, baslangic: y.baslangic.toISOString(), bitis: y.bitis.toISOString(), ...(parcalar?.length ? { parcalar: parcalar.map(parcaIso) } : {}),
    })),
  };
}

// Reçete ve Rota'nın plan şeridi: canlı plandaki makine kuyrukları (başlangıç sırasıyla) ve son canlıya alma. Yetki denetlemez; plan
// okuması oturumla açıktır, çağıran korur.
export async function canliOzeti(db: Db): Promise<PlanCanliOzeti> {
  const planlanacakIsler = await planlanacakIsEmirleri(db, { taslakDahil: true });
  const anahtar = new Map(planlanacakIsler.map((i) => [i.id, `${i.emirNo}|${i.opNo}`]));
  const kuyruklar = new Map<number, PlanCanliOzeti['kuyruklar'][number]['isler']>();
  const satirlar = anahtar.size ? await s.canliYerlesimleri(db, [...anahtar.keys()]) : [];
  // Elle sıranın düşüp düşmediği rota istasyonuna bakar; bağlam pahalı, yalnız istasyonu kayıtlı elle sıra varsa kurulur.
  const b = satirlar.some((y) => y.elleSira !== null && (y.elleIstasyonId ?? null) !== null) ? await baglamKur(db, null, null) : null;
  const fiili = fiiliKaynaklar(planlanacakIsler);
  // Bölünmüş işin her parçası kendi makinesinin kuyruğunda ayrı iştir; elle sıra ve elle kaynak parçanındır. Çalışan iş, plan ekranındaki
  // gibi (kaynakOf), terminalin çalıştırdığı makinededir.
  type KuyrukParcasi = { y: YerlesimSatiri; p: ParcaSatiri | null; kaynak: Kaynak; baslangic: Date; bitis: Date; elleSira: number | null; elleKaynak: boolean };
  const sirali = satirlar.flatMap((y): KuyrukParcasi[] => (bolunmus(y)
    ? y.parcalar!.map((p) => ({ y, p, kaynak: p.kaynak, baslangic: p.baslangic, bitis: p.bitis, elleSira: p.elleSira, elleKaynak: p.elleKaynak }))
    : [{ y, p: null, kaynak: fiili.get(y.isEmriId) ?? y.kaynak, baslangic: y.baslangic, bitis: y.bitis, elleSira: y.elleSira, elleKaynak: y.elleKaynak ?? false }]))
    .sort((x, z) => x.baslangic.getTime() - z.baslangic.getTime() || x.y.isEmriId - z.y.isEmriId);
  for (const x of sirali) {
    if (x.kaynak.tur !== 'makine') continue;
    const elle = x.elleSira !== null && !(b && istasyonDegisti(b, x.y));
    kuyruklar.set(x.kaynak.id, [...(kuyruklar.get(x.kaynak.id) ?? []), {
      anahtar: anahtar.get(x.y.isEmriId)!, dondurulmus: x.y.dondurulmus, sabit: x.y.kilitli || x.y.dondurulmus, elle, elleKaynak: x.elleKaynak,
      baslangic: x.baslangic.toISOString(), bitis: x.bitis.toISOString(), ...(x.p ? { parca: { no: x.p.no, adet: x.p.adet } } : {}),
    }]);
  }
  const son = await s.sonCanliyaAlma(db);
  const ad = son ? (await kisiAdlari(db, [son.kisiId])).get(son.kisiId) ?? null : null;
  return {
    planSurumu: await s.planSurumu(db),
    sonCanliyaAlma: son ? { zaman: son.zaman, kisi: ad } : null,
    kuyruklar: [...kuyruklar].map(([makineId, isler]) => ({ makineId, isler })),
    planlanacak: [...new Set(anahtar.values())],
    // Elle bölmede parça adetlerinin toplamı adımın adedidir (önceki adımın hurdası düşülmüş); ekran parçaları bununla böler.
    adetler: Object.fromEntries(planlanacakIsler.map((i) => [`${i.emirNo}|${i.opNo}`, i.adimAdedi ?? i.adet])),
    yersizBolmeler: [...await s.yersizBolmeler(db, null)].filter(([id]) => anahtar.has(id)).map(([id, parcalar]) => ({ anahtar: anahtar.get(id)!, parcalar })),
  };
}

// Bedel ayarı (209 a): plan sayfasını gören herkes okur; değiştirmek plan.bedel-ayari ister (210 a). Taslak verilirse taslağınki (148 a).
// 1383 a: planın finansman oranı finansın o günkü TRY faizidir (günlük yüzde, aylık x 12 / 365); finansta yoksa null.
export async function planFinansmanOrani(db: Db, gun: string): Promise<number | null> {
  return (await gunlukFaizGetir(db, 'TRY', gun))?.gunlukYuzde ?? null;
}
// 1397 a: plan gününün geçerli kurları (finans); kuru girilmemiş para birimi haritada yoktur.
async function planKurlari(db: Db, gun: string): Promise<Map<string, number>> {
  return new Map([...await kurlar(db, gun)].map(([pb, k]) => [pb, Number(k.kur)]));
}

// 1448 a: bedel ayarındaki finansman oranı salt okunurdur; değer finansın bugünkü tek oranıdır (1383 a), ayar satırındaki elle değer okunmaz.
export async function bedelAyari(db: Db, taslak?: number): Promise<BedelAyari> {
  await hedefDenetle(db, taslak ?? null);
  return { ...await s.bedelAyariOku(db, taslak ?? null), finansmanOraniGun: await planFinansmanOrani(db, tesisGunu(Date.now())) };
}
// 148 a: bütün siparişlerin sırasını değiştirdiği için canlıya doğrudan yazılmaz; taslağa gider, onayla canlıya geçer. Defter değer
// taşımaz (bedel ticari bilgidir, 237 a), yalnız değişen alanları.
// 1448 a: gövdedeki finansman oranı yazılmaz (salt okunur; eski ekran gönderebilir).
export function bedelAyariYaz(db: Db, k: Kullanici, t: TaslakGirdisi, govde: BedelAyariGovdesi) {
  const a: BedelAyariGovdesi = { ...govde };
  delete a.finansmanOraniGun;
  return taslagaYaz(db, k, t, async (b, id) => {
    await s.bedelTaslagaYaz(db, id, a);
    const fark = (Object.keys(a) as (keyof BedelAyariGovdesi)[]).filter((x) => a[x] !== undefined && a[x] !== b.bedelAyari[x]);
    return { tur: 'bedel_ayari', ozet: `Bedel ayarı: ${fark.length ? fark.join(', ') : 'değişiklik yok'}`, isEmriIdleri: [] };
  });
}

// 774 a: taslak açıldığı andaki motor ayarı sürümünde kalır; planlamacı isterse güncel sürüme geçirir. Defter kaydı düşmez (defterin
// tür listesi dolu tabloda kısıttır); sürüm artar, açık ekran yenilenir. Zaten güncel sürümdeyse hiçbir şey yazılmaz.
export async function motorAyariGuncelle(db: Db, k: Kullanici, id: number, surum: number): Promise<PlanCevabi> {
  await acikTaslak(db, k, id, surum);
  if (await taslagiGuncelSurumeBagla(db, k, id)) await s.senaryoSurumArtir(db, id);
  return planOku(db, k, await baglamKur(db, k, id));
}

// 776 b, 830 a: Planlama atölyesinde taslağa özel sıralama kuralı; boş, motor ayarı sürümündeki kurala döner. Kural değişmediyse sürüm artmaz.
export async function motorKuraliYaz(db: Db, k: Kullanici, id: number, g: MotorKuraliGovdesi): Promise<PlanCevabi> {
  await acikTaslak(db, k, id, g.surum);
  if (await taslakKuraliYaz(db, k, id, g.kural)) await s.senaryoSurumArtir(db, id);
  return planOku(db, k, await baglamKur(db, k, id));
}

// Elle çarpan (195 a): siparişin çarpan geçmişi, yeniden eskiye; geçerli çarpan ilkidir. 815: çarpan artık verilmez ve plana girmez,
// eski kayıtlar yalnız okunur.
export async function siparisCarpani(db: Db, siparisId: number): Promise<SiparisCarpaniCevabi> {
  const gecmis = await s.carpanGecmisi(db, siparisId);
  const adlar = await kisiAdlari(db, gecmis.map((x) => x.kisiId));
  const satirlar = gecmis.map((x) => ({ ...x, carpan: Number(x.carpan), kisiAdi: adlar.get(x.kisiId) ?? null }));
  return { siparisId, gecerli: satirlar[0] ?? null, gecmis: satirlar };
}

// Açık plan ekranlarının "plan değişti" uyarısı için hafif okuma: canlı plan sürümü ve son canlıya alma.
export async function canliSurum(db: Db): Promise<PlanSurumCevabi> {
  const son = await s.sonCanliyaAlma(db);
  const ad = son ? (await kisiAdlari(db, [son.kisiId])).get(son.kisiId) ?? null : null;
  return { planSurumu: await s.planSurumu(db), sonCanliyaAlma: son ? { zaman: son.zaman, kisi: ad } : null };
}

// 510 a: "Plan değişikliği" kutusu; kişi başına sayı çoktan aza, eşitte ada göre.
export async function canliyaAlmaGecmisi(db: Db): Promise<CanliyaAlmaGecmisiCevabi> {
  const { tabanZamani, satirlar } = await s.canliyaAlmalar(db);
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((x) => x.kisiId))]);
  const sayi = new Map<number, number>();
  for (const x of satirlar) sayi.set(x.kisiId, (sayi.get(x.kisiId) ?? 0) + 1);
  const kisiler = [...sayi].map(([id, n]) => ({ kisi: adlar.get(id) ?? null, sayi: n }))
    .sort((a, b) => b.sayi - a.sayi || (a.kisi ?? '').localeCompare(b.kisi ?? '', 'tr'));
  return {
    tabanZamani, toplam: satirlar.length, kisiler,
    son: satirlar.slice(0, 20).map((x) => ({ senaryoId: x.senaryoId, ad: x.ad, kisi: adlar.get(x.kisiId) ?? null, zaman: x.zaman })),
  };
}

/* ---------------- yazma: hepsi taslağa (P6) ---------------- */

// Ekran okuduğu canlı plan sürümünü gönderdiyse plan arada canlıya alınmamış olmalı; kilit, aynı anda canlıya almayı yazma bitene kadar bekletir.
async function planSurumuDenetle(db: Db, okunan: number | undefined): Promise<void> {
  if (okunan !== undefined && await s.planSurumu(db, true) !== okunan) throw eskiSurum();
}

interface Kayit { tur: string; ozet: string; isEmriIdleri: readonly number[]; veri?: unknown }

// Taslak verilmezse kullanıcıya yeni taslak açılır ve değişiklik ona yazılır; verilirse açık, kullanıcının ve okunan sürümde olmalı.
// Yalnız yerleşim yazan işlem (baglamDegisir false) cevabı aynı bağlamla kurar; bağlamdan yalnız defter ve bölme parçaları değişir, onlar
// yeniden okunur. Ayar ya da deneme yazan işlemde bağlam baştan kurulur.
const BASKASININ_TASLAGI = 'Bu senaryo başka bir planlamacının taslağı.';

// 248 a: korunan iş canlı plandaki yerinden, durumu bağlamdan okunur; karşılaştırılan hedefin (taslak ya da canlıya alınacak plan) yerleri.
const planYerleri = (b: Baglam, l: readonly YerlesimSatiri[]): PlanYeri[] => l.map((y) => ({ isEmriId: y.isEmriId, kaynak: y.kaynak, baslangic: dk(b, y.baslangic) }));
const planliMi = (b: Baglam) => (isEmriId: number) => b.isler.get(isEmriId)?.durum === 'planli';
// 990 a, 991 a: makinenin gerçek durumu ve taslaktaki arıza denemesi bağlamdaki kaynağı kapatır; kapalı kaynaktaki işin koruması kalkar.
const calisirMi = (b: Baglam) => (k: Kaynak) => b.kaynaklar.get(kaynakAnahtari(k))?.aktif !== false;
const canliPlanYerleri = async (db: Db, b: Baglam) => planYerleri(b, await s.yerlesimler(db, null));
const DORT_SAAT_METNI: Record<DortSaatNedeni, string> = {
  kaldirildi: 'plandan kaldırılamaz', kaynak: 'başka makine ya da kişiye alınamaz', 'onune-is': 'önüne iş konamaz',
};
// 1002 a: taslak yazımı reddetmez, uyarır; ret ve gerekçe canlıya almadadır (990 a). Ayrıntı ekrana neden kodunu verir.
const dortSaatMetni = (b: Baglam, i: { isEmriId: number; neden: DortSaatNedeni }) => `${isMetni(b, i.isEmriId)} 4 saatten kısa sürede başlayacak; ${DORT_SAAT_METNI[i.neden]}`;
const dortSaatReddi = (b: Baglam, i: { isEmriId: number; neden: DortSaatNedeni }) =>
  cakisma(`${dortSaatMetni(b, i)}. Zorunluysa gerekçe yazarak canlıya alın.`, { neden: DORT_SAAT_RED_NEDENI, gerekceIle: true } satisfies DortSaatAyrintisi);
const ONAYDA = 'Taslak onayda; değiştirmek için önce onaydan çek.';

async function taslagaYaz(
  db: Db, k: Kullanici, t: TaslakGirdisi, islem: (b: Baglam, id: number) => Promise<Kayit>, baglamDegisir = true,
): Promise<PlanCevabi> {
  let id: number;
  let acildi = false;
  if (t === null) {
    id = await s.senaryoAc(db, `${k.ad} taslağı ${tesisSaati(Date.now())}`, null, k.id);
    acildi = true;
  } else {
    const x = await s.senaryo(db, t.id, true);
    if (!x) throw bulunamadi('Taslak bulunamadı.');
    if (x.durum !== 'acik') throw cakisma(x.durum === 'onayda' ? ONAYDA : 'Taslak kapanmış; yalnız açık taslak değişir.');
    if (x.acanKisiId !== k.id) throw yetkiYok(BASKASININ_TASLAGI);
    if (x.surum !== t.surum) throw eskiSurum();
    id = x.id;
  }
  const b = await baglamKur(db, k, id);
  const kayit = await islem(b, id);
  await s.degisiklikEkle(db, id, kayit, k.id);
  await s.senaryoSurumArtir(db, id);
  const sonra = baglamDegisir ? await baglamKur(db, k, id) : { ...b, defter: await s.degisiklikler(db, [id]), yersiz: await s.yersizBolmeler(db, id) };
  return planOku(db, k, sonra, acildi);
}

// 507 2 a: ek vardiya kullanımdaki vardiyadır, makine kişinin kapsamındadır; saat vardiyanın süresidir (molalar düşülmez).
async function ekMesaiSatirlari(db: Db, b: Baglam, l: readonly { makineId: number; gun: string; vardiyaId: number }[]) {
  const vardiyalar = new Map((await vardiyaTanimlari(db)).map((v) => [v.id, v]));
  const gecerli: s.EkMesaiSatiri[] = [];
  const hatali: string[] = [];
  for (const x of l) {
    const v = vardiyalar.get(x.vardiyaId);
    const m = await kaynakBilgisi(db, b, { tur: 'makine', id: x.makineId });
    if (!v || !v.aktif) hatali.push(`${x.gun}: vardiya ${String(x.vardiyaId)} kullanımda değil`);
    else if (!m || !m.aktif || !izinliMi(b, m)) hatali.push(`${x.gun}: makine ${String(x.makineId)} yok ya da kapsam dışı`);
    else gecerli.push({ ...x, saat: vardiyaSaati(v.baslangic, v.bitis) });
  }
  return { gecerli, hatali };
}
// 512 2 a: defter kaydı düşer; kaydı kaldırmak ve "değişiklikleri at" canlının ek vardiyalarına döndürür.
// Liste değişmediyse (aynı satırlar) yazılmaz, defter kaydı düşmez.
async function ekMesaiTaslagaYaz(db: Db, k: Kullanici, id: number, l: readonly s.EkMesaiSatiri[]): Promise<void> {
  const anahtar = (x: s.EkMesaiSatiri) => `${String(x.makineId)}|${x.gun}|${String(x.vardiyaId)}|${String(x.saat)}`;
  const once = new Set((await s.ekMesailer(db, id)).map(anahtar));
  if (once.size === l.length && l.every((x) => once.has(anahtar(x)))) return;
  await s.ekMesaiYaz(db, id, l);
  await s.degisiklikEkle(db, id, ekMesaiKaydi(l), k.id);
}
const ekMesaiKaydi = (l: readonly s.EkMesaiSatiri[]) => ({
  tur: 'ek_mesai', ozet: `Ek mesai: ${String(l.length)} vardiya, ${String(Math.round(l.reduce((t, x) => t + x.saat, 0) * 10) / 10)} saat`, isEmriIdleri: [],
});
export async function ekMesaiYaz(db: Db, k: Kullanici, id: number, g: EkMesaiGovdesi): Promise<PlanCevabi> {
  await acikTaslak(db, k, id, g.surum);
  const { gecerli, hatali } = await ekMesaiSatirlari(db, await baglamKur(db, k, id), g.satirlar);
  if (hatali.length > 0) throw dogrulama(`Ek vardiya yazılamadı: ${hatali.slice(0, 5).join('; ')}.`, 'satirlar');
  await ekMesaiTaslagaYaz(db, k, id, gecerli);
  await s.senaryoSurumArtir(db, id);
  return planOku(db, k, await baglamKur(db, k, id));
}

// Kaynak denetimi (P5 ret): var ve kullanımda, kullanıcının kapsamında.
async function kaynakDenetle(db: Db, b: Baglam, k: Kaynak): Promise<KaynakBilgisi> {
  const v = await kaynakBilgisi(db, b, k);
  if (!v) throw dogrulama('Makine ya da kişi bulunamadı.', 'kaynak');
  if (!izinliMi(b, v)) throw kapsamDisi();
  if (!v.aktif) throw gecersiz(`${v.kod ?? v.ad} kullanımda değil; yerleştirilemez.`);
  return v;
}

// Elle yerleştirme ve taşıma şimdiden önceye konamaz (H1); başlamış iş zaten taşınmaz. Saat farkına bir dakika pay.
function gecmisDenetle(b: Baglam, baslangic: string): void {
  if (dk(b, new Date(baslangic)) < -1) throw dogrulama('Başlangıç geçmişte olamaz; şimdiden sonraki bir zaman seç.', 'baslangic');
}

function isDenetle(b: Baglam, isEmriId: number): Is {
  const is = b.isler.get(isEmriId);
  if (!is) throw bulunamadi('İş emri bulunamadı.');
  if (is.durum !== 'planli') throw cakisma('Başlamış ya da bitmiş iş emri taşınamaz.');
  return is;
}

// Planda olmayan işin (fasona alınan, emri iptal ya da bitmiş adım) eski satırı kaynağı tutmaz; plan onu göstermez, motor da atlar (H2).
const plandakiler = (b: Baglam, yerler: readonly Yer[]): Yer[] => yerler.filter((y) => b.isler.has(y.isEmriId));

// Çakışma (P5 ret, PL-01): aynı makine ya da kişide üst üste binen yerleşim.
function cakismaDenetle(b: Baglam, yerler: readonly Yer[], y: Yer, haric: readonly number[] = []): void {
  const c = isgal(plandakiler(b, yerler)).find((x) => !haric.includes(x.isEmriId) && x.isEmriId !== y.isEmriId && ayniKaynak(x.kaynak, y.kaynak) && cakisirMi(x, y));
  if (c) throw cakisma('Bu makine ya da kişide aynı zamana yerleşmiş başka iş var.');
}

const kaynakMetni = (b: Baglam, k: Kaynak) => { const v = b.kaynaklar.get(kaynakAnahtari(k)); return v ? (v.kod ?? v.ad) : `${k.tur} ${k.id}`; };
const zamanMetni = (b: Baglam, d: number) => tesisSaati(tarih(b, d));
const isMetni = (b: Baglam, id: number) => { const i = b.isler.get(id); return i ? `${i.emirNo} OP ${i.opNo}` : `İş emri ${id}`; };

// Yerleşimin kendi kaynağının takviminde tükettiği çalışma dakikası; takvim dışına düşmüş eski yerleşimde duvar saati süresi.
function calismaDakikasi(b: Baglam, y: YerlesimSatiri): number {
  const [a, z] = [dk(b, y.baslangic), dk(b, y.bitis)];
  return kesisimDk(takvim(b)(y.kaynak), a, z) || z - a;
}

async function taslakYeri(db: Db, b: Baglam, id: number, isEmriId: number) {
  const y = (await s.yerlesimler(db, id)).find((x) => x.isEmriId === isEmriId);
  if (!y) throw bulunamadi('Bu iş emri taslakta yerleşmemiş.');
  for (const k of [y.kaynak, ...(y.parcalar ?? []).map((p) => p.kaynak)]) if (!izinliMi(b, b.kaynaklar.get(kaynakAnahtari(k)) ?? null)) throw kapsamDisi();
  return y;
}

export async function yerlestir(db: Db, k: Kullanici, g: { taslak: TaslakGirdisi; isEmriId: number; kaynak: Kaynak; baslangic: string; sureDk?: number | undefined; planSurumu?: number | undefined }) {
  await planSurumuDenetle(db, g.planSurumu);
  return taslagaYaz(db, k, g.taslak, async (b, id) => {
    const is = isDenetle(b, g.isEmriId);
    gecmisDenetle(b, g.baslangic);
    await kaynakDenetle(db, b, g.kaynak);
    // Elle girilen süre olduğu gibi; rotadan gelen süre hedef kaynağın verimiyle.
    const sure = is.sureDk !== null ? verimliSure(is.sureDk, is.ayarDk, verimi(b)(g.kaynak)) : g.sureDk ?? null;
    if (sure === null) throw gecersiz('Süre bilinmiyor; süreyi girerek yerleştir.');
    const yerler = (await s.yerlesimler(db, id)).map((y) => yerOf(b, y));
    if (yerler.some((y) => y.isEmriId === g.isEmriId)) throw cakisma('İş emri zaten yerleşmiş; taşı.');
    const yer = arkaArkaya([sure], dk(b, new Date(g.baslangic)), takvim(b)(g.kaynak))?.[0];
    if (!yer) throw cakisma(`${kaynakMetni(b, g.kaynak)} için planlama ufkunda çalışma zamanı yok.`);
    const bas = yer.baslangic;
    const y = { isEmriId: g.isEmriId, kaynak: g.kaynak, ...yer };
    cakismaDenetle(b, yerler, y);
    siraDenetle(b, [...yerler, y], g.isEmriId);
    await s.yerlesimYaz(db, id, { ...y, baslangic: tarih(b, y.baslangic), bitis: tarih(b, y.bitis), kilitli: false, dondurulmus: false, elleSira: null });
    return { tur: 'yerlestir', ozet: `${isMetni(b, g.isEmriId)} ${kaynakMetni(b, g.kaynak)} @ ${zamanMetni(b, bas)}`, isEmriIdleri: [g.isEmriId] };
  });
}

export async function tasi(db: Db, k: Kullanici, isEmriId: number, g: { taslak: TaslakGirdisi; kaynak: Kaynak; baslangic: string; planSurumu?: number | undefined }) {
  await planSurumuDenetle(db, g.planSurumu);
  return taslagaYaz(db, k, g.taslak, async (b, id) => {
    const is = isDenetle(b, isEmriId);
    const y = await taslakYeri(db, b, id, isEmriId);
    if (bolunmus(y)) throw cakisma(BOLUNMUS_ISI);
    if (y.kilitli) throw cakisma('Kilitli yerleşim taşınamaz; önce kilidi aç.');
    if (y.dondurulmus) throw cakisma('Bu iş dondurulmuş bölgede; önce dondurmasını kaldır.');
    gecmisDenetle(b, g.baslangic);
    await kaynakDenetle(db, b, g.kaynak);
    // Rotadan gelen süre yeni kaynağın verimiyle; elle girilmiş süre eski yerindeki çalışma dakikasıyla taşınır.
    const sure = is.sureDk !== null ? verimliSure(is.sureDk, is.ayarDk, verimi(b)(g.kaynak)) : calismaDakikasi(b, y);
    const yer = arkaArkaya([sure], dk(b, new Date(g.baslangic)), takvim(b)(g.kaynak))?.[0];
    if (!yer) throw cakisma(`${kaynakMetni(b, g.kaynak)} için planlama ufkunda çalışma zamanı yok.`);
    const bas = yer.baslangic;
    const yeni = { isEmriId, kaynak: g.kaynak, ...yer };
    const yerler = (await s.yerlesimler(db, id)).map((x) => yerOf(b, x));
    cakismaDenetle(b, yerler, yeni);
    siraDenetle(b, [...yerler.filter((x) => x.isEmriId !== isEmriId), yeni], isEmriId);
    await s.yerlesimYaz(db, id, { ...y, kaynak: g.kaynak, baslangic: tarih(b, yeni.baslangic), bitis: tarih(b, yeni.bitis) });
    return { tur: 'tasi', ozet: `${isMetni(b, isEmriId)} ${kaynakMetni(b, g.kaynak)} @ ${zamanMetni(b, bas)}`, isEmriIdleri: [isEmriId] };
  });
}

export function kaldir(db: Db, k: Kullanici, isEmriId: number, t: TaslakGirdisi) {
  return taslagaYaz(db, k, t, async (b, id) => {
    isDenetle(b, isEmriId);
    const y = await taslakYeri(db, b, id, isEmriId);
    if (y.kilitli || y.dondurulmus) throw cakisma('Kilitli ya da dondurulmuş yerleşim kaldırılamaz; önce kilidi ya da dondurmayı kaldır.');
    await s.yerlesimleriSil(db, id, [isEmriId]);
    return { tur: 'kaldir', ozet: `${isMetni(b, isEmriId)} plandan kaldırıldı`, isEmriIdleri: [isEmriId] };
  });
}

export function kilit(db: Db, k: Kullanici, isEmriId: number, t: TaslakGirdisi, kilitli: boolean) {
  return taslagaYaz(db, k, t, async (b, id) => {
    const y = await taslakYeri(db, b, id, isEmriId);
    if (kilitli && !y.kilitli) {
      const araliklar = (x: YerlesimSatiri) => (x.parcalar?.length ? x.parcalar : [x]).map((p) => ({ kaynak: p.kaynak, baslangic: p.baslangic.getTime(), bitis: p.bitis.getTime() }));
      const diger = (await s.yerlesimler(db, id)).filter((x) => x.kilitli && x.isEmriId !== isEmriId).map((x) => ({ isEmriId: x.isEmriId, araliklar: araliklar(x) }));
      const engel = kilitCakisani(araliklar(y), diger);
      if (engel !== null) throw cakisma(`${isMetni(b, engel)} aynı kaynakta bu saatlerde kilitli; önce birinin yerini değiştirin ya da kilidini açın.`);
    }
    await s.isaretYaz(db, id, [isEmriId], { kilitli });
    return { tur: kilitli ? 'kilitle' : 'kilidi_ac', ozet: `${isMetni(b, isEmriId)} ${kilitli ? 'kilitlendi' : 'kilidi açıldı'}`, isEmriIdleri: [isEmriId] };
  });
}

export function dondurmayiKaldir(db: Db, k: Kullanici, isEmriId: number | null, t: TaslakGirdisi) {
  return taslagaYaz(db, k, t, async (b, id) => {
    const hepsi = (await s.yerlesimler(db, id)).filter((y) => y.dondurulmus && (isEmriId === null || y.isEmriId === isEmriId));
    if (isEmriId !== null && hepsi.length === 0) throw cakisma('Bu iş dondurulmuş değil.');
    const idler = hepsi.map((y) => y.isEmriId);
    await s.isaretYaz(db, id, idler, { dondurulmus: false });
    return { tur: 'dondurmayi_kaldir', ozet: isEmriId === null ? `Dondurma kaldırıldı (${idler.length} iş)` : `${isMetni(b, isEmriId)} dondurması kaldırıldı`, isEmriIdleri: idler };
  });
}

// Dondur: şimdiden plan ayarındaki gün sayısı kadar içinde başlayan, başlamamış işler sabitlenir (prototip "dondurulmuş bölge").
export function dondur(db: Db, k: Kullanici, t: TaslakGirdisi) {
  return taslagaYaz(db, k, t, async (b, id) => {
    if (b.ayar.dondurmaGun === 0) throw gecersiz('Önce dondurulmuş bölge gün sayısını gir.');
    const yerler = (await s.yerlesimler(db, id)).filter((y) => !y.dondurulmus && izinliMi(b, b.kaynaklar.get(kaynakAnahtari(y.kaynak)) ?? null));
    const idler = dondurulacaklar(yerler.map((y) => yerOf(b, y)), b.ayar.dondurmaGun, 0, (x) => b.isler.get(x)?.durum === 'planli').map((y) => y.isEmriId);
    await s.isaretYaz(db, id, idler, { dondurulmus: true });
    return { tur: 'dondur', ozet: `Önümüzdeki ${b.ayar.dondurmaGun} gün donduruldu (${idler.length} iş)`, isEmriIdleri: idler };
  });
}

export function elleSiralariSil(db: Db, k: Kullanici, t: TaslakGirdisi) {
  return taslagaYaz(db, k, t, async (_b, id) => {
    const idler = (await s.yerlesimler(db, id)).filter((y) => y.elleSira !== null).map((y) => y.isEmriId);
    await s.elleSiraSil(db, id);
    return { tur: 'elle_sira_sil', ozet: `Elle sıralar silindi (${idler.length} iş)`, isEmriIdleri: idler };
  });
}

export function ayarYaz(db: Db, k: Kullanici, t: TaslakGirdisi, ayar: PlanAyari) {
  return taslagaYaz(db, k, t, async (b, id) => {
    await s.ayarYaz(db, id, ayar);
    const fark = (Object.keys(ayar) as (keyof PlanAyari)[]).filter((x) => ayar[x] !== b.ayar[x]);
    return { tur: 'ayar', ozet: `Plan ayarı: ${fark.length ? fark.join(', ') : 'değişiklik yok'}`, isEmriIdleri: [] };
  });
}

// Kuyruk sırası: verilen işler aynı kaynakta, ilk başlangıçtan arka arkaya dizilir ve elle sıra alır (KY-03). Kilitli ve dondurulmuş iş
// taşınmaz; makinede çalışan iş taşınabilir, önüne iş konunca operatör onu duraklatıp öndekine geçer (A4, kullanıcı kararı "3b").
export function sirala(db: Db, k: Kullanici, g: { taslak: TaslakGirdisi; kaynak: Kaynak; isEmriIdleri: number[] }) {
  return taslagaYaz(db, k, g.taslak, async (b, id) => {
    await kaynakDenetle(db, b, g.kaynak);
    const hepsi = await s.yerlesimler(db, id);
    const secili = g.isEmriIdleri.map((x) => hepsi.find((y) => y.isEmriId === x));
    if (secili.some((y) => !y || !ayniKaynak(y.kaynak, g.kaynak))) throw dogrulama('İşler bu makine ya da kişinin kuyruğunda değil.', 'isEmriIdleri');
    for (const y of secili) {
      const is = b.isler.get(y!.isEmriId);
      if (!is) throw bulunamadi('İş emri bulunamadı.');
      if (is.durum !== 'planli' && is.durum !== 'basladi') throw cakisma('Bitmiş ya da iptal iş emri yeniden sıralanamaz.');
      if (y!.kilitli || y!.dondurulmus) throw cakisma('Kilitli ya da dondurulmuş iş yeniden sıralanamaz.');
      if (bolunmus(y)) throw cakisma(BOLUNMUS_ISI);
    }
    const ilk = Math.min(...secili.map((y) => dk(b, y!.baslangic)));
    const araliklar = arkaArkaya(secili.map((y) => calismaDakikasi(b, y!)), ilk, takvim(b)(g.kaynak));
    if (!araliklar) throw cakisma(`${kaynakMetni(b, g.kaynak)} için planlama ufkunda çalışma zamanı yok.`);
    const yerler = hepsi.map((y) => yerOf(b, y));
    for (const [i, y] of secili.entries()) cakismaDenetle(b, yerler, { isEmriId: y!.isEmriId, kaynak: g.kaynak, ...araliklar[i]! }, g.isEmriIdleri);
    for (const [i, y] of secili.entries()) {
      await s.yerlesimYaz(db, id, {
        ...y!, baslangic: tarih(b, araliklar[i]!.baslangic), bitis: tarih(b, araliklar[i]!.bitis), elleSira: i + 1, elleIstasyonId: rotaIstasyonu(b, b.isler.get(y!.isEmriId)!),
      });
    }
    return { tur: 'sirala', ozet: `${kaynakMetni(b, g.kaynak)} kuyruğu elle sıralandı (${secili.length} iş)`, isEmriIdleri: g.isEmriIdleri };
  });
}

// A4: Arkon Planlama'daki sıralama da taslağa gider (P6; kullanıcı kararı "b"): kişinin bugünkü canlıdan açtığı son açık taslağı, yoksa yenisi açılır.
// Kanban ve Arkon aynı sırayı müdür canlıya alınca gösterir. Arkon'un okuduğu canlı plan sonradan değiştiyse sıra yazılmaz.
export async function kuyruguSirala(db: Db, k: Kullanici, g: { kaynak: Kaynak; isEmriIdleri: readonly number[]; planSurumu: number }) {
  if (!islemVarMi(k, 'plan.yaz')) throw yetkiYok('İş sırasını değiştirmek plan yazma yetkisi ister.');
  if (g.isEmriIdleri.length === 0 || new Set(g.isEmriIdleri).size !== g.isEmriIdleri.length) {
    throw dogrulama('Sıralanacak işler boş ya da yinelenmiş.', 'isEmriIdleri');
  }
  if (await s.planSurumu(db) !== g.planSurumu) throw eskiSurum();
  const acik = await s.acikTaslagi(db, k.id);
  const p = await sirala(db, k, { taslak: acik ? { id: acik.id, surum: acik.surum } : null, kaynak: g.kaynak, isEmriIdleri: [...g.isEmriIdleri] });
  return { taslakId: p.taslak!.id, taslakAcildi: p.taslakAcildi };
}

// Plan sırasına dön (prototip qReset): bir makine ya da kişinin kuyruğundaki elle sıra kalkar; sonraki öneride sıralama kurala döner.
export function planSirasinaDon(db: Db, k: Kullanici, g: { taslak: TaslakGirdisi; kaynak: Kaynak }) {
  return taslagaYaz(db, k, g.taslak, async (b, id) => {
    await kaynakDenetle(db, b, g.kaynak);
    const idler = (await s.yerlesimler(db, id)).filter((y) => y.elleSira !== null && ayniKaynak(y.kaynak, g.kaynak)).map((y) => y.isEmriId);
    if (idler.length === 0) throw cakisma('Bu kuyrukta elle sıra yok.');
    await s.elleSiraSil(db, id, idler);
    return { tur: 'elle_sira_sil', ozet: `${kaynakMetni(b, g.kaynak)} plan sırasına döndü (${idler.length} iş)`, isEmriIdleri: idler };
  });
}

// Reçete ve Rota motoru (kart #1186): tarayıcıda hesaplanan kuyruk sırası ve atama taslağa yazılır; canlıya alma taslağın kendi komutudur. Elle sıra ve
// elle makine istemcinin, gerisi ve saat plan modülünündür (276 a: yazımdan sonra motor önerir). Önce yazım: her kuyruk `baslangic`ten sonraki ilk çalışma anından, kaynağın verimi ve takvimiyle, kuyruktaki sabit (kilitli ya
// da dondurulmuş) işlerin etrafından arka arkaya dizilir. Başlamış iş ve sabit iş yerinde kalır (atlanır); plan modülünün durumu geçerlidir.
export async function kuyruklariYaz(db: Db, k: Kullanici, g: KuyrukYazGovdesi): Promise<KuyrukYazCevabi> {
  return (await kuyruklariYazIc(db, k, g, false)).cevap;
}
// 512 1 a: kabul edilen ek vardiya kuyruklardan önce yazılır, kuyruklar onun kapasitesiyle dizilir. Uçta yazılamayan satır reddedilir;
// çalışmadan gelen (503 a, gevsek) atlanır: çalışma sunucuda olmayan makine ya da vardiya taşıyabilir.
export async function kuyruklariYazIc(db: Db, k: Kullanici, g: KuyrukYazGovdesi, gevsek: boolean): Promise<{ cevap: KuyrukYazCevabi; ekMesai: { yazilan: number; atlanan: number } }> {
  const ekMesai = { yazilan: 0, atlanan: 0 };
  if (g.kuyruklar.some((q) => q.isler.some((i) => i.dondurulmus)) && !islemVarMi(k, 'plan.kilitle')) throw yetkiYok('Dondurmak plan kilitleme yetkisi ister.');
  if (new Set(g.kuyruklar.map((q) => kaynakAnahtari(q.kaynak))).size !== g.kuyruklar.length) throw dogrulama('Bir kaynak yalnız bir kez yazılır.', 'kuyruklar');
  await planSurumuDenetle(db, g.planSurumu);
  let taslak: TaslakGirdisi = g.taslak ?? null;
  let yazilan = 0;
  let atlanan = 0;
  let motorFarki: MotorFarki | undefined;
  let yerlesmeyen: KuyrukYazCevabi['yerlesmeyen'];
  if (g.kuyruklar.length > 0) {
    const p = await taslagaYaz(db, k, taslak, async (b0, id) => {
      let b = b0;
      if (g.ekMesai !== undefined) {
        const { gecerli, hatali } = await ekMesaiSatirlari(db, b0, g.ekMesai);
        if (hatali.length > 0 && !gevsek) throw dogrulama(`Ek vardiya yazılamadı: ${hatali.slice(0, 5).join('; ')}.`, 'ekMesai');
        await ekMesaiTaslagaYaz(db, k, id, gecerli);
        Object.assign(ekMesai, { yazilan: gecerli.length, atlanan: hatali.length });
        b = await baglamKur(db, k, id);
      }
      const hepsi = await s.yerlesimler(db, id);
      const yerler = hepsi.map((y) => yerOf(b, y));
      const bul = new Map<string, Is[]>();
      for (const i of b.isler.values()) bul.set(`${i.emirNo}|${i.opNo}`, [...(bul.get(`${i.emirNo}|${i.opNo}`) ?? []), i]);
      const goruldu = new Set<string>();
      const kuyruklar = g.kuyruklar.map((q) => ({
        q,
        isler: q.isler.map((x, sira) => {
          const adaylar = bul.get(`${x.emirNo}|${x.opNo}`) ?? [];
          if (adaylar.length !== 1) throw dogrulama(adaylar.length === 0 ? `${x.emirNo} OP ${x.opNo} planlanacak iş emri değil.` : `${x.emirNo} OP ${x.opNo} birden çok iş emrine denk geliyor.`, 'kuyruklar');
          const is = adaylar[0]!;
          const anahtar = `${is.id}:${x.parca?.no ?? 0}`;
          if (goruldu.has(anahtar)) throw dogrulama(`${x.emirNo} OP ${x.opNo}${x.parca ? ` parça ${x.parca.no}` : ''} yinelenmiş.`, 'kuyruklar');
          goruldu.add(anahtar);
          return { is, x, sira: sira + 1, mevcut: hepsi.find((y) => y.isEmriId === is.id) };
        }),
      }));
      // Elle bölme (kart #1572): bölünen işin bütün parçaları bu yazımda gelir, numaraları 1..n, adetleri toplamı adım adedidir; parçasız
      // gelen iş birleşir.
      const parcaNolari = new Map<number, { no: number; adet: number }[]>();
      for (const { x, is } of kuyruklar.flatMap((k) => k.isler)) {
        if (goruldu.has(`${is.id}:0`) && x.parca) throw dogrulama(`${isMetni(b, is.id)} hem bölünmüş hem bütün yazılamaz.`, 'kuyruklar');
        if (x.parca) parcaNolari.set(is.id, [...(parcaNolari.get(is.id) ?? []), x.parca]);
      }
      for (const [isId, l] of parcaNolari) {
        const is = b.isler.get(isId)!;
        const adet = is.adimAdedi ?? is.adet;
        if (l.length < 2 || l.some((p) => p.no > l.length)) throw dogrulama(`${isMetni(b, isId)} parçaları 1'den başlayıp sırayla numaralanır ve en az iki parçadır.`, 'kuyruklar');
        if (l.reduce((t, p) => t + p.adet, 0) !== adet) throw dogrulama(`${isMetni(b, isId)} parça adetlerinin toplamı ${adet} olmalı.`, 'kuyruklar');
      }
      const sabitMi = (y: YerlesimSatiri | undefined) => y !== undefined && (y.kilitli || y.dondurulmus);
      const tasinacak = new Set(kuyruklar.flatMap(({ isler }) => isler.filter((i) => i.is.durum === 'planli' && !sabitMi(i.mevcut)).map((i) => i.is.id)));
      const idler: number[] = [];
      // Rota sırası (motorla aynı, PL-02): adım emirdeki önceki iç adıma göre başlar; bekleyen bitişini, akışlı devrini bekler, bağımsız beklemez.
      // CA-2 (kullanıcı kararı): fason dönüşünü bekleyen adım önceki iç adımın bitişinden fason süresi kadar sonra başlar.
      // Önceki iç adım bu yazımda yerleştiyse o yer, yoksa plandaki yeri; hiç yeri yoksa (başlamış ya da bitmiş) şimdiden sayılır. Bölünmüş
      // öncülün parçaları sonraki adımdan sonraki kuyruklarda olabilir: tur, zarflar değişmeyene dek önceki turun zarflarıyla yinelenir
      // (sınırlar yalnız büyür).
      for (const { q } of kuyruklar) await kaynakDenetle(db, b, q.kaynak);
      for (const { q, isler } of kuyruklar) {
        for (const i of isler) {
          if (tasinacak.has(i.is.id) || !sabitMi(i.mevcut)) continue;
          const mevcutKaynak = i.x.parca ? i.mevcut!.parcalar?.find((p) => p.no === i.x.parca!.no)?.kaynak : i.mevcut!.kaynak;
          if (!mevcutKaynak || !ayniKaynak(mevcutKaynak, q.kaynak)) throw cakisma(`${isMetni(b, i.is.id)} kilitli ya da dondurulmuş ve başka kaynakta; önce kilidi ya da dondurmayı kaldır.`);
        }
      }
      // ADR 0018: sunucu motoru kayıtlıyken saatler ondandır ve Motor A önermez. Parça ve kişi kaynağı motorun cevabında yok: o istek
      // bugünkü yoldan gider (UYUM-BORCU).
      if (planMotoru !== null && parcaNolari.size === 0 && g.kuyruklar.every((q) => q.kaynak.tur === 'makine')) {
        atlanan += kuyruklar.reduce((t, k) => t + k.isler.filter((i) => !tasinacak.has(i.is.id)).length, 0);
        // 276 a: makinesi elle seçilmeyen iş rotasında olmayan makinenin kuyruğundaysa rotadaki makinenin kuyruğunun sonuna döner; elle
        // seçilen makine (rota dışı da olsa) kalır.
        const makinesi = (q: KuyrukYazGovdesi['kuyruklar'][number], i: (typeof kuyruklar)[number]['isler'][number]): number => {
          const rota = i.is.rotaKaynaklari;
          if (i.x.elleKaynak || rota.length === 0 || rota.some((k) => ayniKaynak(k, q.kaynak))) return q.kaynak.id;
          return rota.find((k) => k.tur === 'makine')?.id ?? q.kaynak.id;
        };
        const motorKuyrugu = new Map<number, { i: (typeof kuyruklar)[number]['isler'][number]; makineId: number }[]>(kuyruklar.map(({ q }) => [q.kaynak.id, []]));
        for (const { q, isler } of kuyruklar) {
          for (const i of isler.filter((x) => tasinacak.has(x.is.id))) {
            const makineId = makinesi(q, i);
            motorKuyrugu.set(makineId, [...(motorKuyrugu.get(makineId) ?? []), { i, makineId }]);
          }
        }
        for (const makineId of motorKuyrugu.keys()) if (!kuyruklar.some(({ q }) => q.kaynak.id === makineId)) await kaynakDenetle(db, b, { tur: 'makine', id: makineId });
        const m = await sunucuMotoru(db, b, id, [...motorKuyrugu].map(([makineId, l]) => ({
          makineId, isler: l.map(({ i }) => ({ isId: i.is.id, onizleme: i.x.onizleme ?? null })),
        })));
        // 168 b, 763: vardiyasız tezgâhtaki ya da malzeme bekleyen işin taslaktaki eski yeri kalkar; iş yerleşmemiş görünür.
        if (m.yerlesmez.size > 0) await s.yerlesimleriSil(db, id, [...m.yerlesmez]);
        for (const [makineId, l] of motorKuyrugu) {
          for (const { i } of l) {
            const y = m.yer.get(i.is.id);
            if (y === undefined) continue;
            yazilan += 1;
            await s.yerlesimYaz(db, id, {
              isEmriId: i.is.id, kaynak: { tur: 'makine', id: makineId }, ...y, kilitli: false, dondurulmus: i.x.dondurulmus, elleSira: i.x.elle ? i.sira : null,
              elleIstasyonId: rotaIstasyonu(b, i.is), elleKaynak: i.x.elleKaynak,
            });
            idler.push(i.is.id);
          }
        }
        motorFarki = m.fark;
        yerlesmeyen = m.yerlesmeyen.map((x) => { const i = b.isler.get(x.isId)!; return { emirNo: i.emirNo, opNo: i.opNo, neden: x.neden }; });
        const bekleyen = m.malzemeBekleyen > 0 ? `; ${m.malzemeBekleyen} iş malzemesi ufukta karşılanmadığı için yerleşmedi` : '';
        const yersiz = m.yerlesmeyen.length > 0 ? `; ${m.yerlesmeyen.length} iş yerleşmedi` : '';
        return { tur: 'sirala', ozet: `Reçete ve Rota kuyrukları sunucu motoruyla yazıldı (${g.kuyruklar.length} kaynak, ${yazilan} iş${bekleyen}${yersiz})`, isEmriIdleri: idler };
      }
      const tur = (onceki: ReadonlyMap<number, Aralik & { kaynak: Kaynak }>) => {
        const yeniYer = new Map<number, Aralik & { kaynak: Kaynak }>();
        const yerlesenParca = new Map<number, number>();
        const tamam = (id: number) => yeniYer.has(id) && (yerlesenParca.get(id) ?? 0) === (parcaNolari.get(id)?.length ?? 0);
        // Akışlı adım ilk devir partisiyle başlar ve öncülünden önce bitemez: gerekirse kuyruğun kaynağında bu bitişe kadar uzar.
        // 1248 a: her emir içi öncül kendi türü ve deviriyle; en geç sınır geçerlidir.
        const onculSiniri = (is: Is, kaynak: Kaynak): { enErken: number; bitisSiniri: number } => {
          const yeri = (id: number) => {
            const eski = hepsi.find((y) => y.isEmriId === id);
            return (tamam(id) ? yeniYer.get(id) : undefined) ?? onceki.get(id) ?? yeniYer.get(id)
              ?? (eski ? { baslangic: dk(b, eski.baslangic), bitis: dk(b, eski.bitis), kaynak: eski.kaynak } : null);
          };
          const l = icOnculler(b.isler, is).flatMap((o) => {
            const a = yeri(o.is.id);
            return a ? [{ a, x: onculeGore(is, o) }] : [];
          });
          const fason = icOnculler(b.isler, is).length === 0 ? 0 : (is.fasonBekleGun ?? 0) * GUN_DK;
          if (fason > 0) return { enErken: Math.max(0, ...l.map(({ a }) => a.bitis)) + fason, bitisSiniri: Number.NEGATIVE_INFINITY };
          const t = takvim(b);
          let enErken = Number.NEGATIVE_INFINITY;
          let bitisSiniri = Number.NEGATIVE_INFINITY;
          for (const { a, x } of l) {
            enErken = Math.max(enErken, enErkenBaslangic(x, a, Number.NEGATIVE_INFINITY, t(a.kaynak), verimi(b)(a.kaynak)));
            bitisSiniri = Math.max(bitisSiniri, enErkenBitis(x, a, t(kaynak), verimi(b)(kaynak)) ?? Number.NEGATIVE_INFINITY);
          }
          return { enErken, bitisSiniri };
        };
        const yerlesen: { i: (typeof kuyruklar)[number]['isler'][number]; q: (typeof kuyruklar)[number]['q']; yer: Aralik }[] = [];
        for (const { q, isler } of kuyruklar) {
          const dolu: Aralik[] = isgal(plandakiler(b, yerler)).filter((y) => ayniKaynak(y.kaynak, q.kaynak) && !tasinacak.has(y.isEmriId));
          let enErken = dk(b, new Date(q.baslangic));
          for (const i of isler) {
            if (!tasinacak.has(i.is.id)) continue;
            const sure = i.x.parca
              ? (() => { const d = parcaSuresi(i.is, i.x.parca.adet); return d === null ? null : verimliSure(d, i.is.ayarDk, verimi(b)(q.kaynak)); })()
              : i.is.sureDk !== null ? verimliSure(i.is.sureDk, i.is.ayarDk, verimi(b)(q.kaynak)) : i.mevcut && !bolunmus(i.mevcut) ? dk(b, i.mevcut.bitis) - dk(b, i.mevcut.baslangic) : null;
            if (sure === null) throw gecersiz(`${isMetni(b, i.is.id)} süresi bilinmiyor; rotada süreyi gir.`);
            // Parça öncülün son parçalarını işlemeyebilir: bitiş sınırı bölünmemiş işe konur.
            const sinir = onculSiniri(i.is, q.kaynak);
            const yer = uzayanBosluk(dolu, takvim(b)(q.kaynak), Math.max(enErken, sinir.enErken), sure, i.x.parca ? Number.NEGATIVE_INFINITY : sinir.bitisSiniri);
            if (yer === null) throw cakisma(`${kaynakMetni(b, q.kaynak)} için planlama ufkunda ${isMetni(b, i.is.id)} sığmıyor.`);
            dolu.push(yer);
            const o = yeniYer.get(i.is.id);
            yeniYer.set(i.is.id, o ? { ...o, baslangic: Math.min(o.baslangic, yer.baslangic), bitis: Math.max(o.bitis, yer.bitis) } : { ...yer, kaynak: q.kaynak });
            if (i.x.parca) yerlesenParca.set(i.is.id, (yerlesenParca.get(i.is.id) ?? 0) + 1);
            enErken = yer.bitis;
            yerlesen.push({ i, q, yer });
          }
        }
        return { yeniYer, yerlesen };
      };
      let sonuc = tur(new Map());
      for (let n = 0; n < 10 && parcaNolari.size > 0; n += 1) {
        const yeni = tur(sonuc.yeniYer);
        const ayni = [...yeni.yeniYer].every(([id, a]) => sonuc.yeniYer.get(id)?.bitis === a.bitis && sonuc.yeniYer.get(id)?.baslangic === a.baslangic);
        sonuc = yeni;
        if (ayni) break;
      }
      atlanan += kuyruklar.reduce((t, k) => t + k.isler.filter((i) => !tasinacak.has(i.is.id)).length, 0);
      const parcaYerleri = new Map<number, ParcaSatiri[]>();
      for (const { i, q, yer } of sonuc.yerlesen) {
        yazilan += 1;
        if (i.x.parca) {
          parcaYerleri.set(i.is.id, [...(parcaYerleri.get(i.is.id) ?? []), {
            no: i.x.parca.no, adet: i.x.parca.adet, kaynak: q.kaynak, baslangic: tarih(b, yer.baslangic), bitis: tarih(b, yer.bitis),
            elleSira: i.x.elle ? i.sira : null, elleIstasyonId: rotaIstasyonu(b, i.is), elleKaynak: i.x.elleKaynak,
          }]);
          continue;
        }
        await s.yerlesimYaz(db, id, {
          isEmriId: i.is.id, kaynak: q.kaynak, baslangic: tarih(b, yer.baslangic), bitis: tarih(b, yer.bitis), kilitli: false, dondurulmus: i.x.dondurulmus, elleSira: i.x.elle ? i.sira : null, elleIstasyonId: rotaIstasyonu(b, i.is), elleKaynak: i.x.elleKaynak,
        });
        idler.push(i.is.id);
      }
      // Bölünmüş işin ana satırı zarftır: ilk parçanın kaynağı, ilk başlangıç, son bitiş; iş düzeyinde elle sıra parçaların en küçüğü.
      for (const [isId, l] of parcaYerleri) {
        const parcalar = [...l].sort((x, y) => x.no - y.no);
        const elleler = parcalar.flatMap((p) => (p.elleSira === null ? [] : [p.elleSira]));
        await s.yerlesimYaz(db, id, {
          isEmriId: isId, kaynak: parcalar[0]!.kaynak, baslangic: new Date(Math.min(...parcalar.map((p) => p.baslangic.getTime()))),
          bitis: new Date(Math.max(...parcalar.map((p) => p.bitis.getTime()))), kilitli: false,
          dondurulmus: kuyruklar.some((k) => k.isler.some((i) => i.is.id === isId && i.x.dondurulmus)),
          elleSira: elleler.length ? Math.min(...elleler) : null, elleIstasyonId: rotaIstasyonu(b, b.isler.get(isId)!), elleKaynak: false, parcalar,
        });
        idler.push(isId);
      }
      // 1408 (1409 a): bölünmüş iş ve kişi kuyruğu ekranın sırasıyla, motorsuz yazıldı. Makine kuyruğundaki öteki işler onların etrafında
      // sunucu motoruyla, yalnız makine kuyruklu istekteki gibi ekranın sırası korunarak yeniden dizilir.
      const motorKuyrugu = kuyruklar.filter(({ q }) => q.kaynak.tur === 'makine').map(({ q, isler }) => ({
        makineId: q.kaynak.id, isler: isler.filter((i) => tasinacak.has(i.is.id) && !i.x.parca).map((i) => ({ isId: i.is.id, onizleme: i.x.onizleme ?? null })),
      })).filter((q) => q.isler.length > 0);
      if (planMotoru !== null && motorKuyrugu.length > 0) {
        const m = await sunucuMotoru(db, await baglamKur(db, k, id), id, motorKuyrugu);
        if (m.yerlesmez.size > 0) await s.yerlesimleriSil(db, id, [...m.yerlesmez]);
        const yazili = new Map((await s.yerlesimler(db, id)).map((y) => [y.isEmriId, y]));
        for (const [isId, y] of m.yer) await s.yerlesimYaz(db, id, { ...yazili.get(isId)!, baslangic: y.baslangic, bitis: y.bitis });
        motorFarki = m.fark;
        yerlesmeyen = m.yerlesmeyen.map((x) => { const i = b.isler.get(x.isId)!; return { emirNo: i.emirNo, opNo: i.opNo, neden: x.neden }; });
      }
      return { tur: 'sirala', ozet: `Reçete ve Rota kuyrukları yazıldı (${g.kuyruklar.length} kaynak, ${yazilan} iş)`, isEmriIdleri: [...new Set(idler)] };
    });
    taslak = { id: p.taslak!.id, surum: p.taslak!.surum };
  }
  if (taslak === null) throw dogrulama('Yazılacak kuyruk yok.', 'kuyruklar');
  return { cevap: { taslak: taslak.id, canli: false, yazilan, atlanan, ...(motorFarki === undefined ? {} : { motorFarki }), ...(yerlesmeyen?.length ? { yerlesmeyen } : {}) }, ekMesai };
}

// Parti kolu (B7): kolun bölünme adımı üstün önceki adımını, üstün birleşme adımı kolun son adımını bekler. Kol birleşme adımını taşımaz.
const baglarBellegi = new WeakMap<Baglam, Map<number, number[]>>();
const partiBaglariOf = (b: Baglam): Map<number, number[]> => {
  if (!baglarBellegi.has(b)) baglarBellegi.set(b, partiBaglari([...b.isler.values()]));
  return baglarBellegi.get(b)!;
};
function partiBaglari(isler: readonly Is[]): Map<number, number[]> {
  const bagli = new Map<number, number[]>();
  const ekle = (id: number, oncul: Is | undefined) => { if (oncul) bagli.set(id, [...(bagli.get(id) ?? []), oncul.id]); };
  const emri = (id: number) => isler.filter((i) => i.uretimEmriId === id).sort((a, b) => a.sira - b.sira);
  for (const kol of new Set(isler.filter((i) => i.ustEmirId != null).map((i) => i.uretimEmriId))) {
    const k = emri(kol);
    const ust = emri(k[0]!.ustEmirId!);
    // Kolun sırası ek adımla yeniden numaralanır; üstün sırası değişmez. Üstün önceki adımı bitmeden kolun ilk adımı başlamadığından
    // o adım listede varsa kolun listedeki ilk adımı da başlamamıştır.
    const bolunme = k[0]!.bolunmeSira ?? 0;
    ekle(k[0]!.id, ust.filter((i) => i.sira < bolunme).at(-1));
    const birlesme = ust.find((i) => (i.tur ?? 'rota') === 'rota' && i.opNo === k[0]!.birlesmeOpNo);
    if (birlesme) ekle(birlesme.id, k.at(-1));
  }
  return bagli;
}

// Motor girdisi: sabitler (kilitli, dondurulmuş, başlamış, bitmiş ya da kullanıcının kapsamı dışındaki kaynakta) yerinde kalır. Rotada
// süresi olmayan, süresi elle girilerek yerleştirilmiş iş de yerinde kalır: motor süresini bilmez, öneride plandan düşerdi.
// 815 (699/3 a): motor emrin kendi önceliğinin sınıfını sıralar (oncelikSinifi); bedel bandı sıraya girmez.
function motorGirdisi(b: Baglam, satirListesi: readonly YerlesimSatiri[], korunan: ReadonlySet<number> = new Set()) {
  const yerler = satirListesi.map((y) => yerOf(b, y));
  const satirlar = new Map(satirListesi.map((y) => [y.isEmriId, y]));
  const sabitler: Sabit[] = [];
  const serbest = new Set<number>();
  const elle = new Map<number, number>();
  const elleKaynak = new Map<number, Kaynak>();
  const parcalar = new Map<number, NonNullable<MotorIsi['parcalar']>>();
  for (const y of yerler) {
    const is = b.isler.get(y.isEmriId);
    if (!is) continue;
    const k = b.kaynaklar.get(kaynakAnahtari(y.kaynak)) ?? null;
    if (y.elleSira !== null && !istasyonDegisti(b, y)) elle.set(y.isEmriId, y.elleSira);
    // Elle seçilen makine tutulur; rota dışındaysa uyarıyla (308 b). Adımın rota istasyonu sonradan değişince ya da makine kapanınca motor
    // yeniden seçer.
    const tutulur = (kk: Kaynak) => { const v = b.kaynaklar.get(kaynakAnahtari(kk)); return !!v?.aktif && izinliMi(b, v) && istasyonDegisti(b, y) === null; };
    if (y.elleKaynak && tutulur(y.kaynak)) elleKaynak.set(y.isEmriId, y.kaynak);
    const parcaKaynagiDisarida = (y.parcalar ?? []).some((p) => !izinliMi(b, b.kaynaklar.get(kaynakAnahtari(p.kaynak)) ?? null));
    if (y.kilitli || y.dondurulmus || korunan.has(y.isEmriId) || is.durum !== 'planli' || is.sureDk === null || !izinliMi(b, k) || parcaKaynagiDisarida || (k !== null && !k.aktif && is.durum !== 'planli')) {
      for (const x of isgal([y])) sabitler.push({ ...x, uretimEmriId: is.uretimEmriId, sira: is.sira });
    } else {
      serbest.add(y.isEmriId);
      const sp = satirlar.get(y.isEmriId)?.parcalar ?? [];
      if (sp.length) parcalar.set(y.isEmriId, uzlasikParcalar(is, sp).map((p) => ({ no: p.no, sureDk: parcaSuresi(is, p.adet), kaynak: p.elleKaynak && tutulur(p.kaynak) ? p.kaynak : null })));
    }
  }
  // 482 a: plan satırı olmayan çalışan iş de sabittir (terminalin makinesinde, gerçekleşen süresiyle): motor onu görmezse ardılı (fason
  // beklemesi dahil) şimdiden başlar ve makine boş sayılır.
  for (const [id, g] of b.gercek) {
    const is = b.isler.get(id);
    const kaynak = b.fiili.get(id) ?? is?.kaynak ?? null;
    if (!is || satirlar.has(id) || kaynak === null || !izinliMi(b, b.kaynaklar.get(kaynakAnahtari(kaynak)) ?? null)) continue;
    const a = calisanAraligi(b, id, kaynak, g.baslangic ?? 0);
    if (a) sabitler.push({ isEmriId: id, kaynak, ...a, uretimEmriId: is.uretimEmriId, sira: is.sira });
  }
  const sabitIdler = new Set(sabitler.map((x) => x.isEmriId));
  const uygun = (kk: Kaynak) => { const v = b.kaynaklar.get(kaynakAnahtari(kk)); return !!v && v.aktif && izinliMi(b, v); };
  const bagli = partiBaglari([...b.isler.values()]);
  const isler: MotorIsi[] = [...b.isler.values()].filter((i) => i.durum === 'planli' && !sabitIdler.has(i.id)).map((i) => ({
    bagli: bagli.get(i.id) ?? [], id: i.id, uretimEmriId: i.uretimEmriId, sira: i.sira, teslimDk: teslimDk(b, i.teslim), sureDk: i.sureDk, ayarDk: i.ayarDk,
    ...(elleKaynak.has(i.id) ? { kaynak: elleKaynak.get(i.id)!, adaylar: [] } : { kaynak: i.kaynak && uygun(i.kaynak) ? i.kaynak : null, adaylar: i.rotaKaynaklari.filter(uygun) }), bagimlilik: i.bagimlilik, devirDk: i.devirDk, devirAyarDk: i.devirAyarDk,
    devirSonDk: i.devirSonDk, oncelik: oncelikSinifi(i.oncelik), acilmaDk: dk(b, new Date(i.acilma)), emirBaslangicDk: i.baslangic ? (tesisGunBasi(i.baslangic) - b.simdi) / DK : null, elleSira: elle.get(i.id) ?? null,
    fasonBekleDk: (i.fasonBekleGun ?? 0) * GUN_DK, ...(i.motorOnculleri ? { onculler: i.motorOnculleri } : {}),
    ...(parcalar.has(i.id) ? { parcalar: parcalar.get(i.id)! }
      : b.yersiz.has(i.id) ? { parcalar: uzlasikParcalar(i, b.yersiz.get(i.id)!).map((p) => ({ no: p.no, sureDk: parcaSuresi(i, p.adet), kaynak: null })) } : {}),
  }));
  return { sabitler, serbest, isler };
}

// Parça başına sabitler iş başına yere toplanır (bölünmüş sabitte zarf ve parçalar).
function sabitYerleri(sabitler: readonly Sabit[]): Yerlesim[] {
  const h = new Map<number, Sabit[]>();
  for (const x of sabitler) h.set(x.isEmriId, [...(h.get(x.isEmriId) ?? []), x]);
  return [...h.values()].map((l) => (l.length === 1 ? l[0]! : {
    isEmriId: l[0]!.isEmriId, kaynak: l[0]!.kaynak, baslangic: Math.min(...l.map((x) => x.baslangic)), bitis: Math.max(...l.map((x) => x.bitis)),
    parcalar: l.map((x, n) => ({ no: n + 1, kaynak: x.kaynak, baslangic: x.baslangic, bitis: x.bitis })),
  }));
}

// 1408 (ADR 0018, 1381 a): motor önerisi sunucu motorunun 'yeni' kipindendir; eski TypeScript motoru kalktı. Sabit ve serbest ayrımı
// motorGirdisi'nindir. Motor bölünmüş işi ve kişiye yerleşen işi dizmez, elle sırayı bilmez (1409 a): bu işlerin yeri varsa yerinde kalır
// (motora sabit gider; cevapta yerinde'dir, parçalarıyla), yoksa yerleşmez. Sıranın kuralı ve ağırlıkları motor ayarındandır (plan ayarının kuralı motora girmez).
const MOTORSUZ_IS = 'Bölünmüş ya da kişiye yerleşen iş motorla dizilmez; kuyruğunu elle yazın.';
const MALZEME_BEKLER = 'Malzemesi planlama ufkunda karşılanmıyor.';
async function motorOner(db: Db, b: Baglam, satirlar: readonly YerlesimSatiri[], korunanYerler: readonly PlanYeri[] = []) {
  const { sabitler, isler } = motorGirdisi(b, satirlar, new Set(korunanYerler.map((p) => p.isEmriId)));
  const yerli = new Map(satirlar.map((y) => [y.isEmriId, y]));
  const yerlesmeyen: { isEmriId: number; neden: string }[] = [];
  const yerinde: Yerlesim[] = [];
  const kuyruk = new Map<number, MotorKuyrugu['isler']>();
  for (const i of isler) {
    const y = yerli.get(i.id);
    const makinesi = (k: Kaynak | null | undefined) => (k?.tur === 'makine' && (i.adaylar.length === 0 || i.adaylar.some((a) => ayniKaynak(a, k))) ? k.id : null);
    const makineId = makinesi(i.kaynak) ?? makinesi(y?.kaynak) ?? i.adaylar.find((a) => a.tur === 'makine')?.id ?? null;
    if (i.parcalar?.length || i.elleSira != null || makineId === null) {
      if (y) { const { isEmriId, kaynak, baslangic, bitis, parcalar } = yerOf(b, y); yerinde.push({ isEmriId, kaynak, baslangic, bitis, ...(parcalar ? { parcalar } : {}) }); } else yerlesmeyen.push({ isEmriId: i.id, neden: MOTORSUZ_IS });
      continue;
    }
    kuyruk.set(makineId, [...(kuyruk.get(makineId) ?? []), { isId: i.id, onizleme: null }]);
  }
  if (planMotoru === null && kuyruk.size > 0) throw cakisma('Plan motoru kayıtlı değil; plan önerilemez.');
  const m = await sunucuMotoru(db, b, b.hedef, [...kuyruk].map(([makineId, l]) => ({ makineId, isler: l })), {
    kip: 'yeni', benzetim: benzetimi(b), ekSabitler: dortSaatKapamalari(b, yerli, korunanYerler),
  });
  const nedeni = new Map(m.yerlesmeyen.map((x) => [x.isId, x.neden]));
  const yerlesimler: Yerlesim[] = [...m.yer].map(([id, y]) => ({ isEmriId: id, kaynak: { tur: 'makine', id: m.makine.get(id)! }, baslangic: dk(b, y.baslangic), bitis: dk(b, y.bitis) }));
  for (const id of m.yerlesmez) {
    const k = b.isler.get(id)?.kaynak;
    const takvimsiz = k?.tur === 'makine' && (b.takvimler.get(kaynakAnahtari(k)) ?? null) === null;
    yerlesmeyen.push({ isEmriId: id, neden: nedeni.get(id) ?? (takvimsiz ? VARDIYASIZ : MALZEME_BEKLER) });
  }
  return { sabitler, yerinde, yerlesimler, yerlesmeyen, yeniden: [...kuyruk.values()].flatMap((l) => l.map((x) => x.isId)) };
}

// 248 a: korunan işin önüne iş konmaz. Motor sabit işin önündeki boşluğu doldurduğu için makine şimdiden korunan işlerin başına dek
// (aradaki boşluklar dahil) kapalı verilir; korunan iş kendi yerinde sabittir.
function dortSaatKapamalari(b: Baglam, yerli: ReadonlyMap<number, YerlesimSatiri>, korunan: readonly PlanYeri[]): PlanMotoruIstegi['sabitler'] {
  const makineleri = new Map<number, PlanYeri[]>();
  for (const p of korunan) if (p.kaynak.tur === 'makine') makineleri.set(p.kaynak.id, [...(makineleri.get(p.kaynak.id) ?? []), p]);
  return [...makineleri].flatMap(([makineId, l]) => {
    const kapama: PlanMotoruIstegi['sabitler'] = [];
    let imlec = 0;
    for (const p of [...l].sort((x, y) => x.baslangic - y.baslangic)) {
      if (p.baslangic > imlec) kapama.push({ anahtar: `dort-saat|${String(p.isEmriId)}`, makineId, baslangic: tarih(b, imlec).toISOString(), bitis: tarih(b, p.baslangic).toISOString() });
      const y = yerli.get(p.isEmriId);
      imlec = Math.max(imlec, p.baslangic, y ? dk(b, y.bitis) : p.baslangic);
    }
    return kapama;
  });
}

// Taslağın denemeleri (P6) sunucu motorunun girdisine: baglamKur onları Baglam'a uyguladı, motor girdisini kendisi kurduğu için ayrıca verilir.
// Sanal emir (acil sipariş denemesi, önizlenen emir) eksi kimlikli emirdir; motor onu ürünün yürürlükteki rotasıyla dizer.
function benzetimi(b: Baglam): PlanBenzetimi {
  const emirNo = (id: unknown) => [...b.isler.values()].find((i) => i.uretimEmriId === Number(id))?.emirNo;
  const emirDegisiklikleri: NonNullable<PlanBenzetimi['emirDegisiklikleri']> = [];
  const kapaliMakineler: number[] = [];
  const kapaliGunler: string[] = [];
  for (const d of b.defter.filter((x) => BENZETIM.has(x.tur))) {
    const v = (d.veri ?? {}) as Record<string, unknown>;
    const no = emirNo(v['emirId']);
    if (d.tur === 'oncelik' && no !== undefined) emirDegisiklikleri.push({ emirNo: no, oncelik: Number(v['oncelik']) });
    if (d.tur === 'teslim' && no !== undefined) emirDegisiklikleri.push({ emirNo: no, teslim: String(v['teslim']) });
    if (d.tur === 'makine_ariza') kapaliMakineler.push(Number(v['makineId']));
    if (d.tur === 'gun_kapat') kapaliGunler.push(String(v['tarih']));
  }
  const sanal = new Map<number, Is>();
  for (const i of b.isler.values()) if (i.uretimEmriId < 0 && !sanal.has(i.uretimEmriId)) sanal.set(i.uretimEmriId, i);
  const sanalEmirler = [...sanal.values()].map((i) => ({ no: i.emirNo, malzemeId: i.malzemeNo, adet: i.adet, baslangic: i.baslangic, teslim: i.teslim, oncelik: i.oncelik }));
  return {
    ...(sanalEmirler.length > 0 ? { sanalEmirler } : {}), ...(emirDegisiklikleri.length > 0 ? { emirDegisiklikleri } : {}),
    ...(kapaliMakineler.length > 0 ? { kapaliMakineler } : {}), ...(kapaliGunler.length > 0 ? { kapaliGunler } : {}),
  };
}

// 248 a: 4 saat içindeki korunan işler motor önerisinde sabittir; motor onları yerinden oynatıp öneriyi reddettirmez.
async function onerUygula(db: Db, b: Baglam, id: number): Promise<number[]> {
  const satirlar = await s.yerlesimler(db, id);
  const korunan = korunanIsler(await canliPlanYerleri(db, b), planliMi(b), calisirMi(b));
  const sonuc = await motorOner(db, b, satirlar, korunan);
  // Elle sıra istasyonuyla birlikte kalır: istasyonu değişmiş adımın elle sırası motorda sayılmaz, uyarısı planlamacı yeniden sıralayana dek görünür.
  const eski = new Map(satirlar.map((y) => [y.isEmriId, y]));
  await s.yerlesimleriSil(db, id, sonuc.yeniden);
  for (const y of sonuc.yerlesimler) {
    const e = eski.get(y.isEmriId);
    await s.yerlesimYaz(db, id, {
      isEmriId: y.isEmriId, kaynak: y.kaynak, baslangic: tarih(b, y.baslangic), bitis: tarih(b, y.bitis), kilitli: false, dondurulmus: false,
      elleSira: e?.elleSira ?? null, elleIstasyonId: e?.elleIstasyonId ?? null, elleKaynak: e?.elleKaynak ?? false,
    });
  }
  return [...new Set([...sonuc.yeniden, ...sonuc.yerlesimler.map((y) => y.isEmriId)])];
}

// motorYerlesimi'nin uyarıları, motor koşulmadan: bütün işleri okuyup planı yeniden hesaplamak açılışı bekletiyordu. Personel sayısı
// personelVerisi ile aynı süzgeçten (kaynağı olan iş merkezi, aktif kişi payı, kullanıcının izinli iş merkezleri); kısıt kapalıysa başka okuma yok.
export async function motorUyarilariOku(db: Db, k: Kullanici, taslak?: number): Promise<MotorUyarilariCevabi> {
  const hedef = taslak ?? null;
  await hedefDenetle(db, hedef);
  const ayar = await s.ayarOku(db, hedef);
  if (!ayar.personelKisiti) return { uyarilar: motorUyarilari({ personelKisiti: false, personelMerkeziSayisi: 0 }) };
  const kaynaklar = await kaynaklariOku(db, new Map());
  const merkezIdleri = new Set([...kaynaklar.values()].flatMap((x) => (x.isMerkeziId === null ? [] : [x.isMerkeziId])));
  const izinli = await kisininIzinliIsMerkezleri(db, k.id);
  const personelli = [...(await merkezPersoneli(db, kaynaklar)).keys()].filter((id) => merkezIdleri.has(id) && (izinli.length === 0 || izinli.includes(id)));
  return { uyarilar: motorUyarilari({ personelKisiti: true, personelMerkeziSayisi: personelli.length }) };
}

// 481 a: emrin teslime kalan bolluğu vardiya kapasitesi günüyle (kapasiteKesri); ekran tamponu bundan gösterir, eşikleri kendisinde kalır.
// Adımın kaynağının o gün başlayan vardiyaları dünden en geç bitişin gününe kadar tek okumada; takvimsiz kaynakta duvar saati. Yerleşmemiş
// işi olan (engelli) ya da teslimsiz emirde null.
async function emirBolluklari(db: Db, b: Baglam, adimlar: readonly { isEmriId: number; kaynak: Kaynak; bitis: number }[], bolmeYazilamaz: ReadonlySet<number>) {
  const gunNo = (gun: string) => Math.round(Date.parse(`${gun}T00:00:00Z`) / (GUN_DK * DK));
  const bugun = tesisGunu(b.simdi);
  const takvimli = new Map<string, Kaynak>();
  for (const a of adimlar) if ((b.takvimler.get(kaynakAnahtari(a.kaynak)) ?? null) !== null) takvimli.set(kaynakAnahtari(a.kaynak), a.kaynak);
  const sonGun = [bugun, ...adimlar.map((a) => tesisGunu(tarih(b, a.bitis)))].sort().at(-1)!;
  const okunan = takvimli.size === 0 ? new Map<string, Map<string, BasladigiGun> | null>()
    : await basladigiGunTakvimleri(db, [...takvimli.values()], { baslangic: gunEkle(bugun, -1), bitis: sonGun });
  const dakikasi = (iso: string) => (Date.parse(iso) - b.simdi) / DK;
  const gunleri = new Map([...okunan].map(([anahtar, m]) => [anahtar, m === null ? null : new Map([...m].map(([gun, x]) => [
    gunNo(gun), x.araliklar.map((a) => ({ baslangic: dakikasi(a.baslangic), bitis: dakikasi(a.bitis) })),
  ]))]));
  const kesirler = new Map<number, number[]>();
  for (const a of adimlar) {
    const i = b.isler.get(a.isEmriId);
    if (!i) continue;
    const gun = tesisGunu(tarih(b, a.bitis));
    const g = gunleri.get(kaynakAnahtari(a.kaynak)) ?? null;
    const k = kapasiteKesri(g === null ? null : (n) => g.get(n), gunNo(gun), (tesisGunBasi(gun) - b.simdi) / DK, a.bitis);
    kesirler.set(i.uretimEmriId, [...(kesirler.get(i.uretimEmriId) ?? []), k]);
  }
  const emirler = new Map<number, Is[]>();
  for (const i of b.isler.values()) if (planlanacak(i)) emirler.set(i.uretimEmriId, [...(emirler.get(i.uretimEmriId) ?? []), i]);
  const yerlesen = new Set(adimlar.map((a) => a.isEmriId));
  // 493 2 a: emir açıldıktan sonra ürünün yürürlükteki rotası değişmişse emir açıldığı rotada kalmıştır.
  const yururlukte = await yururluktekiRevizyonIdleri(db, [...new Set([...emirler.values()].map((l) => l[0]!.malzemeNo))]);
  return [...emirler].map(([id, l]) => {
    const ilk = l[0]!;
    const engelli = l.some((i) => !yerlesen.has(i.id));
    const bit = engelli ? null : Math.max(...adimlar.filter((a) => l.some((i) => i.id === a.isEmriId)).map((a) => a.bitis));
    return {
      uretimEmriId: id, emirNo: ilk.emirNo, teslim: ilk.teslim, bitis: bit === null || !Number.isFinite(bit) ? null : tarih(b, bit).toISOString(),
      bollukGun: engelli ? null : kapasiteBollugu(ilk.teslim === null ? null : gunNo(ilk.teslim), kesirler.get(id) ?? []),
      rotaEski: (yururlukte.get(ilk.malzemeNo) ?? ilk.kaynakRotaRevizyonId) !== ilk.kaynakRotaRevizyonId,
      bolmeYazilamaz: l.filter((i) => bolmeYazilamaz.has(i.id)).map((i) => i.opNo),
    };
  });
}

// 220 a: motorun yerleşimi yazılmadan döner; ekran (Reçete ve Rota > Plan) kendi hesabı yerine bunu çizer. Sabitler yerinde kalır.
export async function motorYerlesimi(db: Db, k: Kullanici, taslak?: number): Promise<MotorYerlesimiCevabi> {
  const hedef = taslak ?? null;
  await hedefDenetle(db, hedef);
  const b = await baglamKur(db, k, hedef);
  const satirlar = await s.yerlesimler(db, hedef);
  const oneri = await motorOner(db, b, satirlar);
  const { sabitler } = oneri;
  const sonuc = { ...oneri, yerlesimler: [...oneri.yerinde, ...oneri.yerlesimler] };
  const kimlik = (id: number) => { const i = b.isler.get(id)!; return { isEmriId: id, uretimEmriId: i.uretimEmriId, emirNo: i.emirNo, opNo: i.opNo }; };
  // 493 1 a: parçanın canlıya yazılacak adedi, hedefteki kayıtlı bölmeden (yerleşmiş ya da yersiz); yazılamayan bölmede adet null.
  const kayitliBolme = new Map<number, readonly { no: number; adet: number }[]>([...b.yersiz, ...satirlar.flatMap((y) => (y.parcalar?.length ? [[y.isEmriId, y.parcalar] as const] : []))]);
  const parcaAdetleri = new Map<number, Map<number, number> | null>();
  for (const y of sonuc.yerlesimler) {
    const i = b.isler.get(y.isEmriId);
    const kayit = [...(kayitliBolme.get(y.isEmriId) ?? [])].sort((p, q) => p.no - q.no);
    if (!i || !y.parcalar?.length || kayit.length !== y.parcalar.length) continue;
    const adet = bolmeAdetleri(kayit.map((p) => p.adet), i.adimAdedi ?? i.adet);
    parcaAdetleri.set(y.isEmriId, adet === null ? null : new Map(kayit.map((p, n) => [p.no, adet[n]!])));
  }
  const bolmeYazilamaz = new Set([...parcaAdetleri].filter(([, m]) => m === null).map(([id]) => id));
  const kaynakAdi = (x: Kaynak) => b.kaynaklar.get(kaynakAnahtari(x))?.ad ?? null;
  const iso = (d: number) => tarih(b, d).toISOString();
  const ekran: Record<string, { makineId: number | null; baslangic: string }[]> = {};
  const ekranaYaz = (anahtar: string, x: Kaynak, bas: number) => { (ekran[anahtar] ??= []).push({ makineId: x.tur === 'makine' ? x.id : null, baslangic: iso(bas) }); };
  for (const y of [...sabitler.filter((x) => b.isler.has(x.isEmriId)), ...sonuc.yerlesimler]) {
    const i = b.isler.get(y.isEmriId)!;
    const anahtar = `${i.emirNo}|${String(i.opNo)}`;
    const parcalar = 'parcalar' in y ? y.parcalar : undefined;
    if (parcalar?.length) for (const p of parcalar) ekranaYaz(`${anahtar}~${String(p.no)}`, p.kaynak, p.baslangic);
    else ekranaYaz(anahtar, y.kaynak, y.baslangic);
  }
  const adimlar = [...sabitler.filter((x) => b.isler.has(x.isEmriId)), ...sonuc.yerlesimler]
    .flatMap((y) => ('parcalar' in y && y.parcalar?.length ? y.parcalar.map((p) => ({ isEmriId: y.isEmriId, kaynak: p.kaynak, bitis: p.bitis })) : [y]));
  return {
    uyarilar: motorUyarilari({ personelKisiti: b.ayar.personelKisiti, personelMerkeziSayisi: personelVerisi(b, []).length }),
    ekranYerlesimi: ekran,
    emirler: await emirBolluklari(db, b, adimlar, bolmeYazilamaz),
    hesaplanma: new Date(b.simdi).toISOString(),
    ayar: { kural: b.ayar.kural, yon: b.ayar.yon, tamponGun: b.ayar.tamponGun },
    yerlesimler: [
      ...sabitler.filter((x) => b.isler.has(x.isEmriId)).map((x) => ({
        ...kimlik(x.isEmriId), kaynak: x.kaynak, kaynakAdi: kaynakAdi(x.kaynak), baslangic: iso(x.baslangic), bitis: iso(x.bitis), sabit: true,
      })),
      ...sonuc.yerlesimler.map((y) => ({
        ...kimlik(y.isEmriId), kaynak: y.kaynak, kaynakAdi: kaynakAdi(y.kaynak), baslangic: iso(y.baslangic), bitis: iso(y.bitis), sabit: false,
        ...(y.parcalar ? { parcalar: y.parcalar.map((p) => ({ no: p.no, kaynak: p.kaynak, baslangic: iso(p.baslangic), bitis: iso(p.bitis), adet: parcaAdetleri.get(y.isEmriId)?.get(p.no) ?? null })) } : {}),
      })),
    ],
    yerlesmeyen: sonuc.yerlesmeyen.filter((x) => b.isler.has(x.isEmriId)).map((x) => ({ ...kimlik(x.isEmriId), neden: x.neden })),
  };
}

/* ---------------- emir önizlemesi (prototip previewNewOrder) ---------------- */

// Önizlenen emrin iş emirleri gerçek ve deneme kimlikleriyle çakışmasın diye çok küçük eksi kimlik alır.
const ONIZLEME_EMRI = -2_000_000_000;

// Önce ve sonra aynı sabitlerle motor çalıştırılır; fark yalnız yeni emirden gelir. Hiçbir şey yazılmaz.
export async function onizle(db: Db, k: Kullanici, g: {
  taslak: number | null; revizyonId: number; adet: number; oncelik: number; baslangic: string | null; teslim: string | null;
}): Promise<OnizlemeCevabi> {
  await hedefDenetle(db, g.taslak);
  const b = await baglamKur(db, k, g.taslak);
  const r = await revizyonGetir(db, g.revizyonId);
  if (!r || r.durum !== 'yururlukte') throw gecersiz('Yalnız yürürlükteki rota önizlenir.');
  const mevcut = await s.yerlesimler(db, g.taslak);
  const kos = async () => {
    const m = await motorOner(db, b, mevcut);
    const satirlar: YerlesimSatiri[] = [...sabitYerleri(m.sabitler), ...m.yerinde, ...m.yerlesimler].map((y) => ({
      isEmriId: y.isEmriId, kaynak: y.kaynak, baslangic: tarih(b, y.baslangic), bitis: tarih(b, y.bitis), kilitli: false, dondurulmus: false, elleSira: null,
      ...(y.parcalar ? { parcalar: y.parcalar.map((p) => ({ no: p.no, adet: 1, kaynak: p.kaynak, baslangic: tarih(b, p.baslangic), bitis: tarih(b, p.bitis), elleSira: null, elleIstasyonId: null, elleKaynak: false })) } : {}),
    }));
    const c = cevapKur(b, satirlar);
    const gs = gosterge(b, c.yerler);
    const son = c.yerler.length ? Math.max(...c.yerler.map((y) => y.bitis)) : null;
    return {
      c, ozet: {
        zamanindaYuzde: gs.zamanindaYuzde, geciken: gs.geciken, ortAtolyeGun: gs.ortAtolyeGun, sonBitis: son === null ? null : tarih(b, son).toISOString(),
        darbogaz: gs.darbogaz ? { ad: gs.darbogaz.ad, dolulukYuzde: gs.darbogaz.dolulukYuzde } : null,
      },
    };
  };
  const once = await kos();
  const rotalar: RotaOnbellek = new Map([[r.id, r]]);
  const urunler = new Map<number, { kod: string; ad: string }>();
  const icler = icAdimlar(r.adimlar);
  const onculler = denemeOnculleri(r.adimlar, icler, (n) => ONIZLEME_EMRI - n);
  for (const [n, { a, fasonBekleGun }] of icler.entries()) {
    const i = await isKur(db, {
      fasonBekleGun, onculler: onculler[n] ?? null, id: ONIZLEME_EMRI - n, uretimEmriId: ONIZLEME_EMRI, emirNo: 'Yeni emir', malzemeNo: r.malzemeId, adet: g.adet, teslim: g.teslim,
      oncelik: g.oncelik, acilma: new Date(b.simdi).toISOString(), baslangic: g.baslangic, kaynakRotaRevizyonId: r.id, sira: a.sira, opNo: a.opNo, ad: a.ad, kaynak: isEmriKaynagi(a.kaynak),
      ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, durum: 'planli',
    }, rotalar, urunler, b.istasyonMakineleri);
    b.isler.set(i.id, i);
  }
  devirleriKur(b.isler);
  const sonra = await kos();
  const odak = sonra.c.emirler.find((e) => e.uretimEmriId === ONIZLEME_EMRI);
  const onerilen = odak?.bitis
    ? tesisGunu(Date.parse(odak.bitis) + Math.ceil(b.ayar.tamponGun) * GUN_DK * DK) : null;
  const onceEmir = new Map(once.c.emirler.map((e) => [e.uretimEmriId, e]));
  const gec = (bitis: string | null, teslim: string | null) => bitis !== null && teslim !== null && Date.parse(bitis) > gunSonu(teslim);
  const etkilenen = sonra.c.emirler.flatMap((e) => {
    const o = onceEmir.get(e.uretimEmriId);
    const yeni = e.uretimEmriId === ONIZLEME_EMRI;
    const fark = Math.abs(Date.parse(e.bitis ?? '') - Date.parse(o?.bitis ?? '')) >= 0.01 * GUN_DK * DK || (e.bitis === null) !== ((o?.bitis ?? null) === null);
    if (!yeni && !fark && gec(e.bitis, e.teslim) === gec(o?.bitis ?? null, e.teslim)) return [];
    return [{ emirNo: e.emirNo, once: o?.bitis ?? null, sonra: e.bitis, teslim: e.teslim, gecikiyor: gec(e.bitis, e.teslim), yeni }];
  }).slice(0, 12);
  const onceYuk = new Map(once.c.istasyonYuku.map((i) => [i.istasyonId, yukYuzdesi(i.dolu, i.kapasite)]));
  const fark = (i: { onceYuzde: number | null; sonraYuzde: number | null }) => Math.abs((i.sonraYuzde ?? 0) - (i.onceYuzde ?? 0));
  const yuk = sonra.c.istasyonYuku.map((i) => ({ ad: `${i.kod} ${i.ad}`, onceYuzde: onceYuk.get(i.istasyonId) ?? null, sonraYuzde: yukYuzdesi(i.dolu, i.kapasite) }))
    .filter((i) => i.sonraYuzde !== i.onceYuzde).sort((x, y) => fark(y) - fark(x)).slice(0, 6);
  const eski = new Set(once.c.uyarilar);
  return {
    odak: {
      baslangic: odak?.baslangic ?? null, bitis: odak?.bitis ?? null, teslim: g.teslim, onerilenTeslim: onerilen,
      isSayisi: odak?.isSayisi ?? 0, yerlesen: odak?.yerlesen ?? 0,
    },
    once: once.ozet, sonra: sonra.ozet, etkilenenEmirler: etkilenen, istasyonYuku: yuk, yeniUyarilar: sonra.c.uyarilar.filter((u) => !eski.has(u)).slice(0, 12),
  };
}

/* ---------------- stüdyo (P4, P6) ---------------- */

async function acikTaslak(db: Db, k: Kullanici, id: number, surum: number) {
  const x = await s.senaryo(db, id, true);
  if (!x) throw bulunamadi('Senaryo bulunamadı.');
  if (x.durum !== 'acik') throw cakisma(x.durum === 'onayda' ? ONAYDA : 'Senaryo kapanmış; yalnız açık senaryo değişir.');
  if (x.acanKisiId !== k.id) throw yetkiYok(BASKASININ_TASLAGI);
  if (x.surum !== surum) throw eskiSurum();
  return x;
}

const zamanFarki = (a: string | null, c: string | null) => (a ?? '') !== (c ?? '');

export async function senaryolar(db: Db, k: Kullanici): Promise<SenaryolarCevabi> {
  const canliB = await baglamKur(db, k, null);
  const canliSatir = await s.yerlesimler(db, null);
  const canli = cevapKur(canliB, canliSatir);
  const surum = await s.planSurumu(db);
  const liste = await s.senaryolar(db);
  const onaylar = new Map((await s.sonOnaylar(db, liste.map((x) => x.id))).map((o) => [o.senaryoId, o]));
  const adlar = await kisiAdlari(db, [...liste.map((x) => x.acanKisiId), ...[...onaylar.values()].flatMap((o) => [o.gonderenKisiId, ...(o.geriGonderenKisiId === null ? [] : [o.geriGonderenKisiId])])]);
  const defter = await s.degisiklikler(db, liste.map((x) => x.id));
  const dortGozAcik = await sistemAyariOku(db, 'plan.dort-goz');
  const sonuc: SenaryolarCevabi['senaryolar'] = [];
  for (const x of liste) {
    const kendi = defter.filter((d) => d.senaryoId === x.id);
    let gostergeler: SenaryolarCevabi['senaryolar'][number]['gostergeler'] = null;
    let etki: SenaryolarCevabi['senaryolar'][number]['etki'] = null;
    const acikMi = x.durum === 'acik' || x.durum === 'onayda';
    if (acikMi) {
      const b = await baglamKur(db, k, x.id);
      const c = cevapKur(b, await s.yerlesimler(db, x.id));
      gostergeler = gosterge(b, c.yerler);
      const canliEmir = new Map(canli.emirler.map((e) => [e.uretimEmriId, e]));
      const canliYuk = new Map(canli.istasyonYuku.map((i) => [i.istasyonId, i]));
      const yuzde = (i: { dolu: number[]; kapasite: number[] }) => yukYuzdesi(i.dolu, i.kapasite);
      const eski = new Set(canli.uyarilar);
      etki = {
        tarihiDegisenEmirler: c.emirler.filter((e) => zamanFarki(canliEmir.get(e.uretimEmriId)?.bitis ?? null, e.bitis))
          .map((e) => ({ emirNo: e.emirNo, canli: canliEmir.get(e.uretimEmriId)?.bitis ?? null, senaryo: e.bitis })).slice(0, 12),
        yukuDegisenIstasyonlar: c.istasyonYuku.map((i) => ({ ad: `${i.kod} ${i.ad}`, canliYuzde: canliYuk.has(i.istasyonId) ? yuzde(canliYuk.get(i.istasyonId)!) : null, senaryoYuzde: yuzde(i) }))
          .filter((i) => i.canliYuzde !== i.senaryoYuzde).slice(0, 12),
        yeniUyarilar: c.uyarilar.filter((u) => !eski.has(u)).slice(0, 12),
      };
    }
    const o = onaylar.get(x.id);
    sonuc.push({
      id: x.id, ad: x.ad, aciklama: x.aciklama, durum: x.durum, acan: adlar.get(x.acanKisiId) ?? null, benim: x.acanKisiId === k.id, acilma: x.acilma,
      surum: x.surum, tabanPlanSurumu: x.tabanPlanSurumu, canliDegisti: acikMi && x.tabanPlanSurumu !== surum, gostergeler,
      degisiklikler: kendi.map((d) => ({ id: d.id, tur: d.tur, ozet: d.ozet, yazma: d.yazma })), etki,
      onay: o ? {
        gonderen: adlar.get(o.gonderenKisiId) ?? null, gonderme: o.gonderme, not: o.not,
        geriGonderen: o.geriGonderenKisiId === null ? null : adlar.get(o.geriGonderenKisiId) ?? null, geriGonderme: o.geriGonderme, geriNeden: o.geriNeden,
      } : null,
      yapabilir: onayGecisleri(onayBaglami(k, x, o?.gonderenKisiId ?? null, dortGozAcik)),
      bekleyenler: kendi.filter((d) => BENZETIM.has(d.tur) && !CANLIYA_GECEN.has(d.tur)).map((d) => `${d.ozet} (${BENZETIM_SAHIBI[d.tur]} bağlanınca canlıya alınır)`),
    });
  }
  return { canli: gosterge(canliB, canli.yerler), canliSurum: surum, senaryolar: sonuc };
}

export async function senaryoAc(db: Db, k: Kullanici, g: { ad: string; aciklama?: string | null | undefined }) {
  await s.senaryoAc(db, g.ad, g.aciklama ?? null, k.id);
  return senaryolar(db, k);
}

export async function senaryoCogalt(db: Db, k: Kullanici, id: number) {
  const x = await s.senaryo(db, id);
  if (!x) throw bulunamadi('Senaryo bulunamadı.');
  if (x.durum !== 'acik' && x.durum !== 'onayda') throw cakisma('Yalnız açık ya da onaydaki senaryo çoğaltılır.');
  await s.senaryoCogalt(db, id, `${x.ad} (kopya)`.slice(0, 80), k.id);
  return senaryolar(db, k);
}

export async function senaryoBilgi(db: Db, k: Kullanici, id: number, g: { ad: string; aciklama?: string | null | undefined; surum: number }) {
  await acikTaslak(db, k, id, g.surum);
  await s.senaryoBilgiYaz(db, id, g.ad, g.aciklama ?? null);
  return senaryolar(db, k);
}

// Tek değişikliği kaldırma: o değişikliğin iş emirleri canlıdaki hâline döner; ayar değişikliği canlı ayara; deneme kaydı düşer.
export async function degisiklikKaldir(db: Db, k: Kullanici, id: number, degisiklikId: number, surum: number) {
  await acikTaslak(db, k, id, surum);
  const d = (await s.degisiklikler(db, [id])).find((x) => x.id === degisiklikId);
  if (!d) throw bulunamadi('Değişiklik bulunamadı.');
  if (d.tur === 'ayar') await s.ayariCanlidanAl(db, id);
  // Bedel ve çarpan değişikliği kalkınca taslak canlınınkine döner (ayar gibi: türün bütün değişiklikleri birlikte).
  if (d.tur === 'bedel_ayari') await s.bedelTaslaktanSil(db, id);
  if (d.tur === 'ek_mesai') await s.ekMesaiCanlidanAl(db, id);
  if (d.tur === 'siparis_carpani') await s.carpanTaslaktanSil(db, id, Number((d.veri as { siparisId: number }).siparisId));
  if (d.tur === 'acil_emir') {
    const sanal = (await s.yerlesimler(db, id)).filter((y) => y.isEmriId < 0 && Math.floor(-y.isEmriId / 1000) === d.id).map((y) => y.isEmriId);
    await s.yerlesimleriSil(db, id, sanal);
  }
  if (d.isEmriIdleri.length > 0) await s.canlidanAl(db, id, d.isEmriIdleri.filter((x) => x > 0));
  await s.degisiklikKaldir(db, id, [d.id], k.id);
  await s.senaryoSurumArtir(db, id);
  return senaryolar(db, k);
}

export async function degisiklikleriAt(db: Db, k: Kullanici, id: number, surum: number) {
  await acikTaslak(db, k, id, surum);
  await s.senaryoSifirla(db, id, k.id);
  return senaryolar(db, k);
}

// Yeniden temellendirme: defterde olmayan iş emirleri canlıdan yeniden kopyalanır, taban canlının bugünkü sürümü olur.
export async function canlidakileriAl(db: Db, k: Kullanici, id: number, surum: number) {
  await acikTaslak(db, k, id, surum);
  const dokunulan = new Set((await s.degisiklikler(db, [id])).flatMap((d) => d.isEmriIdleri));
  const tum = new Set([...(await s.yerlesimler(db, null)).map((y) => y.isEmriId), ...(await s.yerlesimler(db, id)).map((y) => y.isEmriId)]);
  await s.canlidanAl(db, id, [...tum].filter((x) => x > 0 && !dokunulan.has(x)));
  await s.tabanYenile(db, id);
  return senaryolar(db, k);
}

// Hızlı dene ("ya şöyle olursa"): canlı planın durumundan somut bir deneme üretilir, taslakta benzetilir ve motor yeniden önerir.
export async function hizliDene(db: Db, k: Kullanici, id: number, g: { tur: HizliDeneme; surum: number }) {
  await acikTaslak(db, k, id, g.surum);
  const b = await baglamKur(db, k, id);
  const c = cevapKur(b, await s.yerlesimler(db, id));
  let d: Kayit | null = null;
  const gunSonra = (n: number) => gunTarihi(b, n);
  if (g.tur === 'acil') {
    const e = [...b.isler.values()].find((i) => i.id > 0);
    if (e) {
      d = { tur: 'acil_emir', ozet: `Acil sipariş: ${e.urunKodu} ${e.urunAdi}, 100 adet, teslim ${gunSonra(4)}`, isEmriIdleri: [],
        veri: { malzemeNo: e.malzemeNo, adet: 100, teslim: gunSonra(4), revizyonId: e.kaynakRotaRevizyonId } };
    }
  } else if (g.tur === 'ariza') {
    const dar = gosterge(b, c.yerler).darbogaz;
    const m = dar ? [...b.kaynaklar.values()].find((x) => x.tur === 'makine' && x.aktif && x.istasyon?.id === dar.istasyonId) : undefined;
    if (m) {
      const etkilenen = c.yerler.filter((y) => y.kaynak.tur === 'makine' && y.kaynak.id === m.id).map((y) => y.isEmriId);
      d = { tur: 'makine_ariza', ozet: `Darboğaz makinesi ${m.kod ?? m.ad} arızalı`, isEmriIdleri: etkilenen, veri: { makineId: m.id } };
    }
  } else if (g.tur === 'gun') {
    const gun = Array.from({ length: UFUK_GUN - 1 }, (_, i) => i + 1).find((i) => c.istasyonYuku.some((x) => (x.dolu[i] ?? 0) > 0)) ?? 1;
    const a = b.gun0 + gun * GUN_DK;
    const etkilenen = c.yerler.filter((y) => y.bitis > a && y.baslangic < a + GUN_DK).map((y) => y.isEmriId);
    d = { tur: 'gun_kapat', ozet: `${gunSonra(gun)} kapalı gün`, isEmriIdleri: etkilenen, veri: { tarih: gunSonra(gun) } };
  } else {
    const e = c.emirler.filter((x) => x.uretimEmriId > 0 && (b.isler.get([...b.isler.values()].find((i) => i.uretimEmriId === x.uretimEmriId)?.id ?? 0)?.oncelik ?? 3) > 1)
      .sort((x, y) => (x.tamponGun ?? 1e9) - (y.tamponGun ?? 1e9))[0];
    if (e) d = { tur: 'oncelik', ozet: `${e.emirNo} acile çekildi`, isEmriIdleri: [], veri: { emirId: e.uretimEmriId, oncelik: 1 } };
  }
  if (!d) throw dogrulama('Bu deneme için uygun kayıt yok (emir, darboğaz makinesi ya da çalışma günü).', 'tur');
  // Deneme etkilediği işleri motor yeniden yerleştirsin diye onların kilitsiz yerleşimi kalkar; sonra motor önerir.
  const serbest = (await s.yerlesimler(db, id)).filter((y) => d.isEmriIdleri.includes(y.isEmriId) && !y.kilitli && !y.dondurulmus).map((y) => y.isEmriId);
  await s.yerlesimleriSil(db, id, serbest);
  await s.degisiklikEkle(db, id, d, k.id);
  const yeni = await baglamKur(db, k, id);
  const idler = await onerUygula(db, yeni, id);
  await s.degisiklikEkle(db, id, { tur: 'oner', ozet: `Motor önerdi (${idler.length} iş)`, isEmriIdleri: idler.filter((x) => x > 0) }, k.id);
  await s.senaryoSurumArtir(db, id);
  return senaryolar(db, k);
}

// Canlıya alma (P4, P6, ST-02..ST-04): iki adımlı ve yetkili. Taslağın yerleşimleri ve ayarı canlıya yazılır; başlamış ve bitmiş işler
// canlıdaki hâliyle kalır; yerleşimin makine ya da kişisi iş emrine yazılır (P3). Sahibi bağlanmamış denemeler varsa alınmaz.
export async function canliyaAl(db: Db, k: Kullanici, id: number, g: { surum: number; cakismalariKabul: boolean; acilMusteriler?: readonly { degisiklikId: number; firmaId: number }[]; baslayanlar?: 'sabitle'; dortSaatGerekcesi?: string | null }): Promise<CanliyaAlCevabi> {
  // Kilit sırası: önce plan sürümü, sonra taslak (502 a). Eşzamanlı ikinci canlıya alma birincinin bitmesini bekler; birinci onun taslağını
  // kardeş olarak kapattıysa ikinci anlamlı 409 alır. Ters sıra kilitlenme ya da zamanlamaya bağlı sonuç verirdi.
  await s.planSurumu(db, true);
  const once = await s.senaryo(db, id, true);
  if (once?.durum === 'vazgecildi' && once.tabanPlanSurumu !== await s.planSurumu(db)) {
    throw cakisma('Bu taslak, aynı canlı plandan açılmış başka bir taslak canlıya alındığı için kapandı; canlı planla yeni taslak açın.');
  }
  const { x, dortGozsuz } = await onayGecisi(db, k, id, g.surum, 'canliya-al');
  const defter = await s.degisiklikler(db, [id]);
  const bekleyen = defter.filter((d) => BENZETIM.has(d.tur) && !CANLIYA_GECEN.has(d.tur));
  const kapanan = defter.filter((d) => d.tur === 'gun_kapat');
  // Kapalı gün bütün tesisin takvimidir: canlıya alan vardiya yazma yetkisini de taşır (yetki genişlemez).
  if (kapanan.length > 0 && !islemVarMi(k, 'vardiya.yaz')) throw yetkiYok('Taslakta kapalı gün denemesi var; canlıya almak vardiya yazma yetkisi de ister. Denemeyi kaldır ya da yetkili kişiye bırak.');
  // Acil sipariş canlıda taslak sipariş olur (286 b): canlıya alan sipariş yazma yetkisini de taşır, her deneme için müşteri seçer.
  const aciller = defter.filter((d) => d.tur === 'acil_emir');
  if (aciller.length > 0 && !islemVarMi(k, 'siparisler.yaz')) throw yetkiYok('Taslakta acil sipariş denemesi var; canlıya almak sipariş yazma yetkisi de ister. Denemeyi kaldır ya da yetkili kişiye bırak.');
  const musteri = new Map((g.acilMusteriler ?? []).map((m) => [m.degisiklikId, m.firmaId]));
  const musterisiz = aciller.filter((d) => !musteri.has(d.id));
  if (musterisiz.length > 0) throw dogrulama(`Acil sipariş denemesi için müşteri seçilmeli: ${musterisiz.map((d) => d.ozet).join('; ')}.`, 'acilMusteriler');
  if (bekleyen.length > 0) {
    throw gecersiz(`Bu taslakta sahibi modül bağlanınca canlıya alınabilecek ${bekleyen.length} deneme var (${bekleyen.map((d) => d.ozet).join('; ')}); önce onları kaldır.`);
  }
  const surum = await s.planSurumu(db, true);
  if (surum !== x.tabanPlanSurumu && !g.cakismalariKabul) throw cakisma('Senaryo açıldıktan sonra canlı plan değişti; onaylayarak canlıya al.');
  const b = await baglamKur(db, k, id);
  const canli = await s.yerlesimler(db, null);
  let taslak = await s.yerlesimler(db, id);
  // 984 a: taslak açıldıktan sonra başlayan işle aynı makinede çakışan taslak işi varsa taslak onu bilmeden dizilmiştir. Planlamacı isterse
  // çalışan iş şimdiye sabitlenir ve o makinelerin taslak kuyruğu yeniden dizilir; istemezse canlıya alınmaz.
  const baslayan = once ? sonradanBaslayanlar(b, once.acilma, canli, taslak) : [];
  if (baslayan.length > 0) {
    if (g.baslayanlar !== 'sabitle') {
      const isler = baslayan.map((x) => { const i = b.isler.get(x.isId)!; return { emirNo: i.emirNo, opNo: i.opNo }; });
      throw cakisma(`Taslak açıldıktan sonra başlayan iş var (${isler.map((x) => `${x.emirNo} OP ${x.opNo}`).join(', ')}); taslakta o makinede onunla çakışan iş var. Çalışan işi şimdiye sabitleyip kalan işleri yeniden dizerek canlıya alın.`,
        { neden: SONRADAN_BASLAYAN, isler } satisfies SonradanBaslayanAyrintisi);
    }
    await baslayanlariSabitle(db, k, b, id, baslayan, taslak);
    taslak = await s.yerlesimler(db, id);
  }
  // Çalışan iş yalnız aynı kaynakta elle sıralanmışsa canlıya geçer (A4); makinesi değişmez, başka yerleşim farkı canlıyı ezmez.
  const canliYeri = new Map(canli.map((c) => [c.isEmriId, c]));
  const siralanmisCalisan = new Set(taslak.filter((y) => {
    const c = canliYeri.get(y.isEmriId);
    return b.isler.get(y.isEmriId)?.durum === 'basladi' && y.elleSira !== null && c !== undefined && ayniKaynak(c.kaynak, y.kaynak)
      && (c.baslangic.getTime() !== y.baslangic.getTime() || c.elleSira !== y.elleSira);
  }).map((y) => y.isEmriId));
  const degisebilir = (isEmriId: number) => b.isler.get(isEmriId)?.durum === 'planli' || siralanmisCalisan.has(isEmriId);
  // Bölünmüş işte her parçanın kaynağı denetlenir.
  const kaynaklari = (y: YerlesimSatiri) => (bolunmus(y) ? y.parcalar!.map((p) => p.kaynak) : [y.kaynak]);
  for (const c of canli) if (degisebilir(c.isEmriId) && kaynaklari(c).some((kk) => !izinliMi(b, b.kaynaklar.get(kaynakAnahtari(kk)) ?? null))) throw kapsamDisi();
  for (const y of taslak) if (degisebilir(y.isEmriId)) for (const kk of kaynaklari(y)) await kaynakDenetle(db, b, kk);
  // 308 b: sıraya aykırı adım canlıya geçmez. Yalnız taslakta yeri değişen adımların emirlerine bakılır: canlıda önceden kalmış aykırılık
  // başka emirlerin canlıya alınmasını durdurmaz.
  const degisen = taslak.filter((y) => {
    const c = canliYeri.get(y.isEmriId);
    return degisebilir(y.isEmriId) && (!c || !ayniKaynak(c.kaynak, y.kaynak) || c.baslangic.getTime() !== y.baslangic.getTime());
  });
  const sira = siraIhlali(b, taslak.map((y) => yerOf(b, y)), new Set(degisen.map((y) => b.isler.get(y.isEmriId)?.uretimEmriId ?? 0)));
  if (sira !== null) throw cakisma(`Taslakta sıraya aykırı adım var: ${sira} Düzeltmeden canlıya alınmaz.`);
  // 762 b: canlıya alma yeniden dizmez; onaylanan taslağın saatleri aynen yayınlanır. Geçmişte kalan başlangıç terminalde gerçek saatle
  // kaydedilir. 168 b: sunucu motoru kayıtlıyken vardiyası tanımsız tezgâhtaki taslak yeri canlıya geçmez; canlıdaki hâli kalır.
  // Önceden motora giden kuyruk işiyle aynı küme: planlı (ya da sıralanmış çalışan), kilitsiz, dondurulmamış, bölünmemiş makine işi.
  const vardiyasiz = new Set(planMotoru === null ? [] : taslak.filter((y) => y.isEmriId >= 0 && y.kaynak.tur === 'makine'
    && (b.isler.get(y.isEmriId)?.durum === 'planli' || siralanmisCalisan.has(y.isEmriId)) && !y.kilitli && !y.dondurulmus && !bolunmus(y)
    && (b.takvimler.get(kaynakAnahtari(y.kaynak)) ?? null) === null).map((y) => y.isEmriId));
  taslak = taslak.filter((y) => !vardiyasiz.has(y.isEmriId));
  // 772 a: yalnız taslakta yeri değişen gerçek işlere bakılır (308 b gibi); denemeden doğan iş emrinin malzemesi canlıda yoktur.
  await eksikStokDenetle(db, id, degisen.filter((y) => y.isEmriId >= 0 && !vardiyasiz.has(y.isEmriId)).flatMap((y) => {
    const is = b.isler.get(y.isEmriId);
    return is ? [{ uretimEmriId: is.uretimEmriId, emirNo: is.emirNo, opNo: is.opNo }] : [];
  }));
  // Yersiz bölme de canlıya geçer (taslakta ya da canlıda yalnız bölmesi olan iş).
  const yersizler = [...b.yersiz.keys(), ...(await s.yersizBolmeler(db, null)).keys()];
  const idler = [...new Set([...canli.map((y) => y.isEmriId), ...taslak.map((y) => y.isEmriId), ...yersizler])].filter((x) => degisebilir(x) && !vardiyasiz.has(x));
  // 248 a: canlıya geçecek plan, taslağın getirdiği bütün ihlallerle denetlenir (taslak önceden açılmış olsa da).
  const gecen = new Set(idler);
  // 990 a: zorunlu durumda canlıya alan gerekçeyle aşar; aşılan işler ve gerekçe canlıya alma onay kaydına yazılır.
  const dortSaat = dortSaatIhlalleri(planYerleri(b, canli), planYerleri(b, [...canli.filter((y) => !gecen.has(y.isEmriId)), ...taslak.filter((y) => gecen.has(y.isEmriId))]), planliMi(b), calisirMi(b));
  const gerekce = dortSaatGerekcesi(g.dortSaatGerekcesi);
  if (dortSaat.length > 0 && gerekce === null) throw dortSaatReddi(b, dortSaat[0]!);
  const asmaKaydi = dortSaat.length > 0 ? `4 saat kuralı aşıldı (${dortSaat.map((i) => isMetni(b, i.isEmriId)).join(', ')}): ${gerekce!}` : null;
  await s.canliyaYaz(db, id, idler, k.id);
  for (const y of taslak) {
    const is = b.isler.get(y.isEmriId);
    if (is && is.durum === 'planli' && (!is.kaynak || !ayniKaynak(is.kaynak, y.kaynak))) await isEmriKaynagiYaz(db, k, y.isEmriId, y.kaynak);
  }
  // Takvimde zaten olan gün (resmî tatil ya da kapalı) üstüne yazılmaz: gün sonra kaldırılınca tatil de kaybolurdu.
  const varolan = new Set((kapanan.length > 0 ? await takvimGunleri(db) : []).map((g) => g.tarih));
  for (const d of kapanan) {
    const tarih = String((d.veri as { tarih: string }).tarih);
    if (!varolan.has(tarih)) await gunYaz(db, k, { tarih, tur: 'kapali', ad: 'Plan stüdyosu' });
  }
  for (const d of defter.filter((x) => x.tur === 'oncelik')) {
    const v = d.veri as unknown as { emirId: number; oncelik: number };
    await emirOnceligiYaz(db, k, v.emirId, v.oncelik);
  }
  for (const d of defter.filter((x) => x.tur === 'makine_ariza')) {
    const v = d.veri as unknown as { makineId: number };
    await makineDurumuYaz(db, k, v.makineId, { durum: 'ariza', aciklama: `Plan stüdyosu: ${x.ad}`.slice(0, 200) });
  }
  for (const d of aciller) {
    const v = d.veri as unknown as AcilVeri;
    const sp = await taslakSiparisAc(db, k, {
      firmaId: musteri.get(d.id)!, termin: v.teslim, satirlar: [{ malzemeNo: v.malzemeNo, miktar: String(v.adet) }], aciklama: `Plan stüdyosu acil sipariş (${x.ad})`,
    });
    await s.degisiklikVerisiYaz(db, d.id, { ...v, siparisId: sp.id });
  }
  await s.ayariCanliyaYaz(db, id, k.id);
  await s.ekMesaiCanliyaYaz(db, id);
  await s.planSurumuArtir(db);
  // 33 a: taban, yeni canlı sürümle yazılır; tabanı olan adım atlanır.
  await s.tabanYaz(db, id, idler.flatMap((i) => {
    const u = b.isler.get(i)?.uretimEmriId;
    return u === undefined || i < 0 ? [] : [{ isEmriId: i, uretimEmriId: u }];
  }), k.id);
  await olcumYaz(db, b, id, k.id, canli, gecen, vardiyasiz.size);
  await s.onayKaydiEkle(db, id, 'canliya_al', k.id, asmaKaydi, dortGozsuz);
  await s.senaryoKapat(db, id, 'canliya_alindi', k.id);
  await kardesleriKapat(db, k, id, x.tabanPlanSurumu);
  await planIhtiyaclariniBildir(db);
  return senaryolar(db, k);
}

// 1470 a: canlıya almanın ölçümü, yeni canlı plan yazıldıktan sonra aynı işlemde. Önceki canlıyla fark yalnız geçen işlerde sayılır;
// gösterge plan sayfasınınkiyle aynı hesaptır (geciken, zamanında yüzdesi, ağırlıklı gecikme).
async function olcumYaz(db: Db, b: Baglam, senaryoId: number, kisiId: number, eskiCanli: readonly YerlesimSatiri[], gecen: ReadonlySet<number>, vardiyasizIs: number): Promise<void> {
  const olcumYeri = (y: YerlesimSatiri) => { const x = yerOf(b, y); return { isEmriId: x.isEmriId, kaynak: kaynakAnahtari(x.kaynak), baslangic: x.baslangic, bitis: x.bitis }; };
  const yeniCanli = (await s.yerlesimler(db, null)).filter((y) => y.isEmriId > 0);
  const yeni = yeniCanli.map(olcumYeri);
  const isler = [...b.isler.values()].filter((i) => i.id > 0 && planlanacak(i));
  const yerli = new Set(yeni.map((y) => y.isEmriId));
  const g = gosterge(b, yeniCanli.map((y) => yerOf(b, y)));
  const d = degisimler(eskiCanli.filter((y) => y.isEmriId > 0).map(olcumYeri), yeni, gecen);
  const ilkIs = new Map<number, Is>();
  for (const i of isler) if (!ilkIs.has(i.uretimEmriId)) ilkIs.set(i.uretimEmriId, i);
  const gelirsiz = [...ilkIs.values()].filter((i) => (i.siparisSatiriId == null ? null : b.siparisSatirlari.get(i.siparisSatiriId)?.tutar ?? null) === null).length;
  await s.olcumYaz(db, {
    senaryoId, yazanKisiId: kisiId, toplamIs: isler.length, yerlesmeyenIs: isler.filter((i) => !yerli.has(i.id)).length, gecikenEmir: g.geciken,
    zamanindaYuzde: g.zamanindaYuzde, agirlikliGecikmeSaat: g.agirlikliGecikmeSaat, degisenIs: d.degisen, yakinDegisenIs: d.yakinDegisen, yeniIs: d.yeni,
    vardiyasizIs, gelirsizEmir: gelirsiz,
  }, emirBitisleri(isler.map((i) => ({ id: i.id, uretimEmriId: i.uretimEmriId, teslim: i.teslim })), yeni).map((e) => ({
    uretimEmriId: e.uretimEmriId, tahminiBitis: e.bitis === null ? null : new Date(b.simdi + e.bitis * DK), termin: e.termin === null ? null : e.termin.slice(0, 10),
  })));
}

// 984 a: taslağın açılışından sonra terminalde başlayan iş, taslakta yeri ya da kaynağı canlıdan farklı bir iş onun gerçek aralığıyla
// (başlangıçtan kalanının bitişine) aynı makinede çakışıyorsa. Taslak çalışan işi hesaba katmışsa (iş ardına dizilmişse) uyarı yoktur.
function sonradanBaslayanlar(b: Baglam, acilma: string, canli: readonly YerlesimSatiri[], taslak: readonly YerlesimSatiri[]): { isId: number; makineId: number }[] {
  const t0 = Date.parse(acilma);
  const canliYeri = new Map(canli.map((c) => [c.isEmriId, c]));
  const degisti = (y: YerlesimSatiri) => { const c = canliYeri.get(y.isEmriId); return !c || !ayniKaynak(c.kaynak, y.kaynak) || c.baslangic.getTime() !== y.baslangic.getTime(); };
  return [...b.isler.values()].flatMap((i) => {
    const m = b.fiili.get(i.id) ?? i.kaynak;
    if (i.durum !== 'basladi' || !i.adimBaslama || !(Date.parse(i.adimBaslama) > t0) || m === null || m.tur !== 'makine') return [];
    const a = calisanAraligi(b, i.id, m, 0);
    if (a === null) return [];
    const cakisan = taslak.some((y) => y.isEmriId !== i.id && b.isler.get(y.isEmriId)?.durum === 'planli' && ayniKaynak(y.kaynak, m) && degisti(y)
      && dk(b, y.baslangic) < a.bitis && dk(b, y.bitis) > a.baslangic);
    return cakisan ? [{ isId: i.id, makineId: m.id }] : [];
  });
}

// 984 a: çalışan iş taslakta gerçek başlangıcından kalanının bitişine yazılır, makinesinde ilk sıradadır (canlıya geçer, A4); kalanı
// bilinmiyorsa taslaktaki yeri kalkar. Makinelerinin taslaktaki planlı, kilitsiz, dondurulmamış, bölünmemiş işleri taslaktaki sırayla
// sunucu motoruna gider; motor onları çalışan işin kalanından sonra dizer.
async function baslayanlariSabitle(db: Db, k: Kullanici, b: Baglam, id: number, baslayan: readonly { isId: number; makineId: number }[], taslak: readonly YerlesimSatiri[]): Promise<void> {
  if (planMotoru === null) throw gecersiz('Çalışan işi sabitleyip yeniden dizmek sunucu motoruyla yapılır; taslağı planlama ekranında yeniden kurun.');
  const calisan = new Set(baslayan.map((x) => x.isId));
  for (const x of baslayan) {
    const kaynak: Kaynak = { tur: 'makine', id: x.makineId }, a = calisanAraligi(b, x.isId, kaynak, 0);
    const is = b.isler.get(x.isId)!;
    if (a === null) { await s.yerlesimleriSil(db, id, [x.isId]); continue; }
    await s.yerlesimYaz(db, id, {
      isEmriId: x.isId, kaynak, baslangic: tarih(b, a.baslangic), bitis: tarih(b, a.bitis), kilitli: false, dondurulmus: false, elleSira: 1,
      elleIstasyonId: rotaIstasyonu(b, is), elleKaynak: false,
    });
  }
  const kuyruklar = [...new Set(baslayan.map((x) => x.makineId))].map((makineId) => ({
    makineId,
    isler: taslak.filter((y) => !calisan.has(y.isEmriId) && y.kaynak.tur === 'makine' && y.kaynak.id === makineId && b.isler.get(y.isEmriId)?.durum === 'planli'
      && !y.kilitli && !y.dondurulmus && !bolunmus(y)).sort((p, q) => p.baslangic.getTime() - q.baslangic.getTime()).map((y) => ({ isId: y.isEmriId, onizleme: null })),
  }));
  const m = await sunucuMotoru(db, b, id, kuyruklar);
  if (m.yerlesmez.size > 0) await s.yerlesimleriSil(db, id, [...m.yerlesmez]);
  const idler: number[] = [];
  for (const q of kuyruklar) {
    for (const { isId } of q.isler) {
      const y = m.yer.get(isId), eski = taslak.find((x) => x.isEmriId === isId)!;
      if (y === undefined) continue;
      await s.yerlesimYaz(db, id, { ...eski, kaynak: { tur: 'makine', id: q.makineId }, ...y, parcalar: [] });
      idler.push(isId);
    }
  }
  const adlar = baslayan.map((x) => isMetni(b, x.isId)).join(', ');
  await s.degisiklikEkle(db, id, { tur: 'sirala', ozet: `Canlıya alırken çalışan iş şimdiye sabitlendi (${adlar}), makinesinin kuyruğu yeniden dizildi`, isEmriIdleri: idler }, k.id);
}

// 502 a: aynı tabandan açılmış öbür açık ve onaydaki taslaklar canlıya alanın adına kapanır; ekranın kapatma yoluyla aynı kayıtlar:
// onaydaki önce onaydan çekilir (onay kaydı), sonra vazgeçilir. Kalsalardı Arkon'da sıraları onay bekler görünürdü.
async function kardesleriKapat(db: Db, k: Kullanici, id: number, taban: number): Promise<void> {
  for (const t of await s.kardesTaslaklar(db, id, taban)) {
    if (t.durum === 'onayda') {
      await s.senaryoDurumYaz(db, t.id, 'onayda', 'acik');
      await s.onayKaydiEkle(db, t.id, 'onaydan_cek', k.id, null);
    }
    await s.senaryoKapat(db, t.id, 'vazgecildi', k.id);
  }
}

interface AcilVeri { malzemeNo: number; adet: number; teslim: string; revizyonId: number; siparisId?: number; uretimEmriId?: number }

// Stüdyodan açılan taslak sipariş Siparişler'de onaylanınca (kablolama.ts) proje ve emir onaylayanın adına, onayla aynı işlemde açılır (286 b).
// Onaylayan proje ve emir açma yetkisini taşımalıdır (yetki dolaylı yoldan genişlemez); taşımıyorsa hata onayı da geri alır.
export async function acilSiparisOnaylandi(db: Db, olay: { siparisId: number; kullanici: Kullanici }): Promise<void> {
  const d = await s.acilSiparisDenemesi(db, olay.siparisId);
  const v = d?.veri as AcilVeri | undefined;
  if (!d || !v || v.uretimEmriId != null) return;
  if (!islemVarMi(olay.kullanici, 'projeler.yaz') || !islemVarMi(olay.kullanici, 'uretim-emirleri.yaz')) {
    throw yetkiYok('Acil plan siparişi; onaylamak için proje ve üretim emri açma yetkisi gerekir.');
  }
  const sp = await siparisKilitliAyrinti(db, olay.siparisId);
  const satir = sp.satirlar[0];
  if (!satir) return;
  const projeId = (await siparisinProjeleri(db, sp.id))[0]?.id ?? (await siparistenProjeAc(db, olay.kullanici, sp.id, {
    kod: sp.no.toLocaleUpperCase('tr').replace(/[^A-Z0-9._]/g, '_').slice(0, 24), ad: `Acil sipariş ${sp.no}`, baslangic: null, bitis: null,
    aciklama: 'Plan stüdyosundaki acil sipariş denemesinden', butceTutari: null, butceParaBirimi: null,
  })).projeId;
  const e = await emreKopyala(db, olay.kullanici, v.revizyonId, {
    adet: Number(satir.miktar), teslim: satir.termin ?? sp.termin, oncelik: 1, projeId, siparisSatiriId: satir.id,
  });
  await s.degisiklikVerisiYaz(db, d.id, { ...v, uretimEmriId: e.uretimEmriId });
}

// Canlıya alırken acil sipariş denemesinin müşterisi seçilir (287 b).
export async function musteriSecenekleri(db: Db, ara: string) {
  return { firmalar: await firmaAra(db, { metin: ara, sinir: 20, yalnizAktif: true, tur: 'musteri' }) };
}

/* ---------------- onay (146, 147 a, 148 a) ---------------- */

const onayBaglami = (k: Kullanici, x: Pick<s.SenaryoSatiri, 'durum' | 'acanKisiId'>, gonderen: number | null, dortGozAcik: boolean): OnayBaglami => ({
  durum: x.durum, sahipMi: x.acanKisiId === k.id, gonderenMi: x.durum === 'onayda' && gonderen === k.id,
  studyo: islemVarMi(k, 'plan.studyo'), canliyaAlir: islemVarMi(k, 'plan.canliya-al'), dortGozAcik,
});

// PL-ONAY: geçişin kuralı kurallar.ts'tedir; yetki ve kişi reddi 403, durum reddi 409, okunan sürüm eskiyse 409. Senaryo satırı işlem
// bitene kadar kilitlidir. dortGozsuz: dört göz kapalıyken gönderen kendi taslağını onaylıyor (kayıtta işaretlenir).
async function onayGecisi(db: Db, k: Kullanici, id: number, surum: number, komut: PlanOnayKomutu) {
  const x = await s.senaryo(db, id, true);
  if (!x) throw bulunamadi('Senaryo bulunamadı.');
  const gonderen = (await s.sonOnaylar(db, [id]))[0]?.gonderenKisiId ?? null;
  const b = onayBaglami(k, x, gonderen, await sistemAyariOku(db, 'plan.dort-goz'));
  const red = onayGecisiReddi(komut, b);
  const tanim = PLAN_ONAY_KOMUTLARI[komut];
  if (red !== null) throw (tanim.kim === 'sahip' ? b.studyo : b.canliyaAlir) && x.durum !== tanim.durumdan ? cakisma(red) : yetkiYok(red);
  if (x.surum !== surum) throw eskiSurum();
  return { x, dortGozsuz: tanim.kim === 'onaylayan' && !b.dortGozAcik && b.gonderenMi };
}

// Sahip açık taslağını onaya gönderir; taslak donar (plan yazmaları ona yazılmaz). Not isteğe bağlı.
export async function onayaGonder(db: Db, k: Kullanici, id: number, g: OnayaGonderGovdesi) {
  await onayGecisi(db, k, id, g.surum, 'onaya-gonder');
  await s.senaryoDurumYaz(db, id, 'acik', 'onayda');
  await s.onayKaydiEkle(db, id, 'onaya_gonder', k.id, g.not || null);
  return senaryolar(db, k);
}

// Sahip onaydaki taslağını geri çeker; taslak yeniden açık olur.
export async function onaydanCek(db: Db, k: Kullanici, id: number, surum: number) {
  await onayGecisi(db, k, id, surum, 'onaydan-cek');
  await s.senaryoDurumYaz(db, id, 'onayda', 'acik');
  await s.onayKaydiEkle(db, id, 'onaydan_cek', k.id, null);
  return senaryolar(db, k);
}

// Onaylayan onaydaki taslağı nedeniyle sahibine geri gönderir; taslak açık olur, neden sahibine görünür.
export async function geriGonder(db: Db, k: Kullanici, id: number, g: GeriGonderGovdesi) {
  await onayGecisi(db, k, id, g.surum, 'geri-gonder');
  await s.senaryoDurumYaz(db, id, 'onayda', 'acik');
  await s.onayKaydiEkle(db, id, 'geri_gonder', k.id, g.neden);
  return senaryolar(db, k);
}

// "Sil" (stüdyo kartı): senaryo kapanır (vazgeçildi); kayıt silinmez (P4).
export async function vazgec(db: Db, k: Kullanici, id: number, surum: number) {
  await acikTaslak(db, k, id, surum);
  await s.senaryoKapat(db, id, 'vazgecildi', k.id);
  return senaryolar(db, k);
}

// Canlı planda geciken emir sayısı, planın geciken göstergesiyle aynı: gösterge geciken için yalnız planlanacak işlere, emrin teslimine ve
// yerleşimin zamanına bakar. Kaynak, vardiya ve rota okunmaz (menü sayacı plan sayfasında sık yenilenir).
async function canliGecikenSayisi(db: Db): Promise<number> {
  const b = { simdi: Date.now() };
  const ayar = await s.ayarOku(db, null);
  const acik = await planlanacakIsEmirleri(db, { taslakDahil: ayar.taslakEmirler });
  const eksikRevizyon = await girdisiEksikRevizyonlar(db, acik.map((i) => i.kaynakRotaRevizyonId));
  const isler = new Map(acik.filter((i) => !eksikRevizyon.get(i.kaynakRotaRevizyonId)).map((i) => [i.id, i]));
  const emirler = new Map<number, { id: number; teslimDk: number | null; isSayisi: number }>();
  for (const i of isler.values()) {
    const e = emirler.get(i.uretimEmriId) ?? { id: i.uretimEmriId, teslimDk: teslimDk(b, i.teslim), isSayisi: 0 };
    e.isSayisi += 1;
    emirler.set(i.uretimEmriId, e);
  }
  const yerler = (await s.yerlesimler(db, null)).filter((y) => isler.has(y.isEmriId)).map((y) => yerOf(b, y));
  return gostergeler(isgal(yerler).map((y) => ({ ...y, uretimEmriId: isler.get(y.isEmriId)!.uretimEmriId, anahtar: kaynakAnahtari(y.kaynak), ad: '', istasyon: null })),
    [...emirler.values()], UFUK_DK).geciken;
}

// İkinci menünün sayıları (Reçete ve Rota sayfası plan modülünün en üst ekranıdır): rotası açık ürün, canlıda geciken emir, açık
// senaryo, düşük stoklu kart, katalogdaki operasyon. Üretim emirleri ve malzeme kartı sayısı sahipleri verince (UYUM-BORCU); bilinmeyen
// sayı yazılmaz. Yetkisi olmayan maddenin sayısı null: menü `sayfa.rota` ister, stok sayısı ayrıca stok okuma yetkisi.
export async function menuSayaclari(db: Db, k: Kullanici): Promise<Record<string, number | null>> {
  if (!islemVarMi(k, 'sayfa.rota')) return { rotalar: null, plan: null, studyo: null, stok: null, operasyonlar: null };
  const stokGorur = k.islemler.some((i) => i === 'sayfa.stok' || i.startsWith('stok.'));
  const planGorur = islemVarMi(k, 'plan.oku') || islemVarMi(k, 'plan.yaz');
  return {
    rotalar: await acikRevizyonSayisi(db), plan: planGorur ? await canliGecikenSayisi(db) : null, studyo: planGorur ? await s.acikSenaryoSayisi(db) : null,
    stok: stokGorur ? await dusukStokSayisi(db) : null, operasyonlar: (await operasyonTipleri(db)).length,
  };
}
