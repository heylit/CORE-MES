import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, kapsamDisi, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type {
  CanliYerlesimCevabi, HizliDeneme, KarsilastirmaCevabi, MotorYerlesimiCevabi, KuyrukYazCevabi, KuyrukYazGovdesi, OnizlemeCevabi, PlanAyari, PlanCanliOzeti, PlanCevabi, PlanKaynagi, BedelAyari, BedelAyariGovdesi, PlanSurumCevabi, SenaryolarCevabi, SiparisBandiCevabi, SiparisCarpaniCevabi, TaslakGirdisi,
} from '#paylasilan/sozlesme/plan.ts';
import { KURAL_ADI, PLAN_KURALLARI } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi, tesisGunu, tesisSaati } from '#paylasilan/zaman.ts';
import {
  aktifIstasyonlar, isMerkezleri, istasyondakiMakineler, istasyonKisileri, istasyonlar as istasyonListesi, istasyonYetkinlikleri, kisininIzinliIsMerkezleri, makineDurumlari, makineDurumuYaz, makineGetir, makineler as makineListesi, operasyonTipleri, planAyarlari,
} from '../istasyonlar/disari.ts';
import type { Makine } from '../istasyonlar/disari.ts';
import { kisiAdlari, kisileriListele } from '../kisiler/disari.ts';
import { malzemeOzeti, malzemeOzetleri } from '../malzemeler/disari.ts';
import { firmaAra } from '../musteri-tedarikci/disari.ts';
import { siparisinProjeleri, siparistenProjeAc } from '../projeler/disari.ts';
import { acikRevizyonSayisi, emreKopyala, girdisiEksikRevizyonlar, revizyonGetir } from '../rota/disari.ts';
import { fasonSuresiTahminleri } from '../satin-alma/disari.ts';
import { siparisAyrintisi, siparisKilitliAyrinti, siparisSatiriOzetleri, taslakSiparisAc } from '../siparisler/disari.ts';
import { dusukStokSayisi } from '../stok/disari.ts';
import { FASON_VARSAYILAN_GUN, emirOnceligiYaz, isEmriKaynagiYaz, isEmriVarliklari, planlanacakIsEmirleri } from '../uretim-emirleri/disari.ts';
import { calismaTakvimleri, gunYaz, isMerkeziKisiPaylari, takvimGunleri } from '../vardiya/disari.ts';
import type { PlanIsEmri } from '../uretim-emirleri/disari.ts';
import {
  araliktanCikar, arkaArkaya, bantSinirlari, bedelCarpani, emirTutari, katkiPaylari, calisilanParcalar, elleCarpanSiniri, gecikmeBedeli, oncelikSiniflari, ayniKaynak, cakisirMi, dondurulacaklar, enErkenBaslangic, enErkenBitis, gostergeler, isSuresi, calismaBitisi,
  kaynakAnahtari, kesisimDk, karsilastir as kurallariKarsilastir, motorUyarilari, oner as motor, personelYuku, planMaliyeti, sinirliGunSayisi, tlIyilestir, tlKosuSiniri, uyarilar, uzayanBosluk, verimliSure, yukYuzdesi,
} from './kurallar.ts';
import type { PersonelKisiti, PersonelMerkezi } from './kurallar.ts';
import type { Aralik, BedelSatiri, Kaynak, Kural, MotorIsi, MusteriSinifi, Sabit, Takvim, Yerlesim } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { BolmeParcasi, DegisiklikSatiri, Hedef, ParcaSatiri, YerlesimSatiri } from './sorgular.ts';

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
type Is = Omit<PlanIsEmri, 'durum'> & { durum: 'planli' | 'basladi' | 'bitti' | 'iptal'; taslakEmir: boolean; urunKodu: string; urunAdi: string; rotaKaynaklari: Kaynak[]; sureDk: number | null; ayarDk: number | null; devirDk: number | null; devirAyarDk: number | null; devirSonDk: number | null };
interface Baglam {
  simdi: number;
  // Bugünün başı (UTC), simdi'ye göre dakika: günler ve matris buradan sayılır.
  gun0: number;
  hedef: Hedef;
  ayar: PlanAyari;
  isler: Map<number, Is>;
  // #1372: girensiz adımlı rotadan açılmış emir yerleşmez; emir no -> neden.
  rotaEksik: Map<string, string>;
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
  // Siparişin geçerli elle çarpanı (195 a); kaydı olmayan sipariş yok.
  carpanlar: Map<number, number>;
  // Siparişin müşteri sınıfı (265 a), sipariş kimliğiyle; sınıfı boş müşterinin siparişi yok.
  siniflar: Map<number, MusteriSinifi>;
  // Bedel ayarı (209 a) taslakta da canlı plan ayarından okunur: senaryo bedeli değiştirmez.
  bedelAyari: BedelAyari;
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
const gunSonu = (gun: string): number => tesisGunBasi(gunEkle(gun, 1)) - 1000;
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

// Akışlı devir (PL-02): ardıl, öncülün devir adedini üretmesini (öncülün ayarı ve birim süresi) bekler; son devir partisini kendi birim
// süresiyle öncülün bitişinden sonra işler. Öncül emirdeki önceki açık iç adımdır; açık öncülü olmayan (bitmiş) adımda devir yoktur.
function devirleriKur(isler: Map<number, Is>): void {
  const sayi = (x: string | null) => (x === null ? null : Number(x));
  for (const i of isler.values()) {
    if (i.bagimlilik !== 'akisli' || i.devirAdedi === null) continue;
    const o = [...isler.values()].filter((x) => x.uretimEmriId === i.uretimEmriId && x.sira < i.sira).sort((x, y) => y.sira - x.sira)[0];
    const ob = o ? sayi(o.birimSureDk) : null;
    const b = sayi(i.birimSureDk);
    i.devirDk = o && ob !== null ? (sayi(o.ayarSuresiDk) ?? 0) + Math.min(i.devirAdedi, o.adimAdedi ?? o.adet) * ob : null;
    i.devirAyarDk = o && ob !== null ? sayi(o.ayarSuresiDk) : null;
    i.devirSonDk = b === null ? null : Math.min(i.devirAdedi, i.adimAdedi ?? i.adet) * b;
  }
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
  for (const [n, { a, fasonBekleGun }] of icAdimlar(r.adimlar).entries()) {
    sonuc.push(await isKur(db, {
      fasonBekleGun,
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
// 227 a: üretim emrinin plan malzeme maliyeti (Proje maliyet) katkıdan düşülür; kayıtsızken katkı payı bilinmez.
export type MalzemeMaliyetiCozucusu = (db: Db, uretimEmriIdleri: readonly number[]) => Promise<Map<number, number | null>>;
let malzemeMaliyeti: MalzemeMaliyetiCozucusu | null = null;
export function malzemeMaliyetiCozucusuKaydet(cozucu: MalzemeMaliyetiCozucusu | null): void { malzemeMaliyeti = cozucu; }

// 225: emrin bedel satırı, satırın tutarı yerine emrin payıyla (birim fiyat × emrin adedi).
function emirSatiri(b: Pick<Baglam, 'siparisSatirlari'>, i: Pick<Is, 'siparisSatiriId' | 'adet'>) {
  const satir = i.siparisSatiriId == null ? null : b.siparisSatirlari.get(i.siparisSatiriId) ?? null;
  return satir && { ...satir, tutar: emirTutari(satir, i.adet) };
}

// Emrin bedel çarpanı (denetim #21): müşteri sınıfı × (siparişin elle çarpanı, yoksa emrin öncelik çarpanı), çarpanlar bedel ayarından.
function emirCarpani(b: Pick<Baglam, 'carpanlar' | 'siniflar' | 'bedelAyari'>, i: Pick<Is, 'oncelik'>, satir: { siparisId: number } | null): number {
  const elle = satir ? b.carpanlar.get(satir.siparisId) ?? null : null;
  return bedelCarpani(i.oncelik, elle, satir ? b.siniflar.get(satir.siparisId) ?? null : null, b.bedelAyari);
}

// 265 a: müşteri sınıfı müşteri kartındadır (musteri-tedarikci); okuyucusu kablolama.ts'te bağlanır. Bağlı değilken müşteriler sınıfsızdır (1,0).
export type MusteriSinifiCozucusu = (db: Db, firmaIdleri: readonly number[]) => Promise<Map<number, MusteriSinifi | null>>;
let musteriSinifi: MusteriSinifiCozucusu | null = null;
export function musteriSinifiCozucusuKaydet(cozucu: MusteriSinifiCozucusu | null): void { musteriSinifi = cozucu; }
async function siparisSiniflari(db: Db, satirlar: readonly { siparisId: number; firmaId: number }[]): Promise<Map<number, MusteriSinifi>> {
  if (!musteriSinifi || satirlar.length === 0) return new Map();
  const siniflar = await musteriSinifi(db, [...new Set(satirlar.map((x) => x.firmaId))]);
  return new Map(satirlar.flatMap((x) => { const c = siniflar.get(x.firmaId); return c ? [[x.siparisId, c] as const] : []; }));
}

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
  const carpanlar = await s.gecerliCarpanlar(db, [...siparisSatirlari.values()].map((x) => x.siparisId));
  const siniflar = await siparisSiniflari(db, [...siparisSatirlari.values()]);
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
    simdi, gun0, hedef, ayar, isler, rotaEksik, kaynaklar, defter, kapaliGunler: [], siparisSatirlari, carpanlar, siniflar, bedelAyari: await s.bedelAyariOku(db), yetkinlik: await yetkinlikOku(db), yersiz: await s.yersizBolmeler(db, hedef), istasyonMakineleri,
    ...await vardiyaOku(db, simdi, kaynaklar),
    izinli: kullanici ? await kisininIzinliIsMerkezleri(db, kullanici.id) : [],
    fiyatGorur: kullanici !== null && islemVarMi(kullanici, 'siparisler.fiyat-oku'), katkilar: new Map(), gercek: gerceklesenler(simdi, acik), fiili: fiiliKaynaklar(acik),
  };
  if (tahminiMaliyet && malzemeMaliyeti) {
    const emirler = new Map<number, BedelSatiri>();
    for (const i of isler.values()) { const satir = emirSatiri(b, i); if (satir && !emirler.has(i.uretimEmriId)) emirler.set(i.uretimEmriId, satir); }
    const bagli = [...isler.values()].filter((i) => emirler.has(i.uretimEmriId));
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
  return b;
}

const fiiliKaynaklar = (acik: readonly PlanIsEmri[]): Baglam['fiili'] => new Map(acik.flatMap((i) =>
  (i.adimDurumu === 'calisiyor' && i.fiiliMakineId !== undefined ? [[i.id, { tur: 'makine', id: i.fiiliMakineId } as Kaynak] as const] : [])));

function gerceklesenler(simdi: number, acik: readonly PlanIsEmri[]): Baglam['gercek'] {
  const h: Baglam['gercek'] = new Map();
  for (const i of acik) {
    if (i.durum !== 'basladi' || i.adimDurumu !== 'calisiyor' || i.islenenAdet === undefined) continue;
    const ayarDk = i.islenenAdet > 0 || i.ayarSuresiDk === null ? 0 : Number(i.ayarSuresiDk);
    const kalanDk = isSuresi(ayarDk, i.birimSureDk === null ? null : Number(i.birimSureDk), Math.max((i.adimAdedi ?? i.adet) - i.islenenAdet, 0));
    if (kalanDk === null) continue;
    const an = (t: string | null | undefined) => (t ? dk({ simdi }, new Date(t)) : null);
    h.set(i.id, { baslangic: an(i.adimBaslama), cikis: an(i.sonSayimAni ?? i.adimBaslama), kalanDk, ayarDk });
  }
  return h;
}

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
  const g = b.gercek.get(y.isEmriId);
  if (g === undefined) return null;
  const cikis = g.cikis ?? 0;
  const kaynak = kaynakOf(b, y);
  const kalan = verimliSure(g.kalanDk, g.ayarDk, verimi(b)(kaynak));
  return { baslangic: Math.min(g.baslangic ?? dk(b, y.baslangic), 0), bitis: calismaBitisi(takvim(b)(kaynak), cikis, kalan) ?? cikis + kalan };
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

// Emirdeki önceki iç adımın yerine göre en erken başlangıç (öncülün takvimi ve verimiyle) ve akışlı işin en erken bitişi (kendi kaynağının
// takvimi ve verimiyle); öncülün yeri yoksa sınır yok.
function onculSinirlari(b: Baglam, isEmriId: number, yerler: readonly Yer[], kaynak: Kaynak): { enErken: number | null; enErkenBitis: number | null } {
  const is = b.isler.get(isEmriId);
  const oncul = is ? [...b.isler.values()].filter((x) => x.uretimEmriId === is.uretimEmriId && x.sira < is.sira).sort((x, y) => y.sira - x.sira)[0] : undefined;
  const oy = oncul ? yerler.find((y) => y.isEmriId === oncul.id) ?? null : null;
  if (!is || !oy) return { enErken: null, enErkenBitis: null };
  const t = takvim(b);
  const bitis = enErkenBitis(is, oy, t(kaynak), verimi(b)(kaynak));
  return {
    enErken: enErkenBaslangic(is, oy, Number.NEGATIVE_INFINITY, t(oy.kaynak), verimi(b)(oy.kaynak)),
    enErkenBitis: bitis === Number.NEGATIVE_INFINITY ? null : bitis,
  };
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

// 6c: emrin satırı ve çarpanı, öncelik bedeliyle aynı kaynaktan (196 a, 195 a). Katkı payı bilinmeyen satırda kâr riski işlemez.
function planinMaliyeti(b: Baglam, emirler: readonly { id: number; teslimDk: number | null; bit: number | null }[]): number | null {
  return b.fiyatGorur ? tlToplami(b, emirler) : null;
}

function tlToplami(b: Baglam, emirler: readonly { id: number; teslimDk: number | null; bit: number | null }[]): number {
  const ilkIs = new Map<number, Is>();
  for (const i of b.isler.values()) if (!ilkIs.has(i.uretimEmriId)) ilkIs.set(i.uretimEmriId, i);
  return planMaliyeti(emirler.map((e) => {
    const i = ilkIs.get(e.id);
    const satir = i ? emirSatiri(b, i) : null;
    // 284 a: ceza ve vade müşteriyle anlaşılan terminden işler (satırın, yoksa siparişin); emrin teslimi yalnız sıralamadadır.
    return {
      bitDk: e.bit, teslimDk: satir ? teslimDk(b, satir.termin) : e.teslimDk, satir: satir && { ...satir, katkiPayi: b.katkilar.get(e.id) ?? null },
      carpan: i ? emirCarpani(b, i, satir) : bedelCarpani(null, null, null, b.bedelAyari),
    };
  }), { tabanSaat: b.bedelAyari.tabanBedelSaat, finansmanOraniGun: b.bedelAyari.finansmanOraniGun, karRiskiOraniGun: b.bedelAyari.karRiskiOraniGun });
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
  // İlk sistem: personel kısıtı kapalıyken sınırlı gün sayılmaz (0); kişi verisi olan iş merkezi yoksa bilinmez (null).
  return { ...g, personelGun: personel.length === 0 ? null : b.ayar.personelKisiti ? sinirliGunSayisi(personel) : 0 };
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
    neden: i.sureDk === null ? 'Süre bilinmiyor.' : i.kaynak === null && i.rotaKaynaklari.length === 0 ? 'Makine ya da kişi atanmamış.'
      : b.yersiz.has(i.id) ? 'Bölünmüş; parçalar yerleşmedi, bölme duruyor.' : 'Yerleştirilmedi.',
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
    ...(takvimsiz > 0 ? [`${takvimsiz} makine ya da kişinin vardiya takvimi yok; sürekli çalışır sayıldı.`] : []),
    ...yerlesimler.flatMap((y) => y.uyarilar.map((u) => `${y.emirNo} OP ${y.opNo}: ${u}`)),
    ...yerlesmemis.map((y) => `${y.emirNo} OP ${y.opNo}: yerleşmedi; ${y.neden.toLocaleLowerCase('tr-TR')}`),
    ...[...b.rotaEksik].map(([emirNo, neden]) => `${emirNo}: plana alınmadı. ${neden}.`),
  ];
  return { yerler, yerlesimler, yerlesmemis, emirler: emirSatirlari, istasyonYuku, personelYuku: personelVerisi(b, yerler), uyarilar: uyari };
}

async function planOku(db: Db, k: Kullanici | null, b: Baglam, taslakAcildi = false): Promise<PlanCevabi> {
  const satirlar = await s.yerlesimler(db, b.hedef);
  const c = cevapKur(b, satirlar);
  const dusen = await elleSiraDusenleri(db, b, satirlar);
  return {
    surum: await s.planSurumu(db), simdi: new Date(b.simdi).toISOString(), ayar: b.ayar, taslak: await taslakOzeti(db, b, k), taslakAcildi,
    gunler: Array.from({ length: UFUK_GUN }, (_, i) => gunTarihi(b, i)),
    kaynaklar: [...b.kaynaklar.values()].filter((x) => x.aktif && izinliMi(b, x)).map(({ isMerkeziId, ...x }) => { void isMerkeziId; return x; }),
    yerlesimler: c.yerlesimler, yerlesmemis: c.yerlesmemis, emirler: c.emirler, istasyonYuku: c.istasyonYuku, personelYuku: c.personelYuku,
    gostergeler: gosterge(b, c.yerler), uyarilar: [...c.uyarilar, ...dusen.map(elleSiraMetni)], elleSiraDusenler: dusen,
  };
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

// Bedel ayarı (209 a): plan sayfasını gören herkes okur; değiştirmek plan.bedel-ayari ister (210 a).
export const bedelAyari = (db: Db): Promise<BedelAyari> => s.bedelAyariOku(db);
export async function bedelAyariYaz(db: Db, kullanici: Kullanici, a: BedelAyariGovdesi): Promise<BedelAyari> {
  await s.bedelAyariYaz(db, a, kullanici.id);
  return s.bedelAyariOku(db);
}

// Elle çarpan (195 a): siparişin çarpan geçmişi, yeniden eskiye; geçerli çarpan ilkidir.
export async function siparisCarpani(db: Db, siparisId: number): Promise<SiparisCarpaniCevabi> {
  const gecmis = await s.carpanGecmisi(db, siparisId);
  const adlar = await kisiAdlari(db, gecmis.map((x) => x.kisiId));
  const satirlar = gecmis.map((x) => ({ ...x, carpan: Number(x.carpan), kisiAdi: adlar.get(x.kisiId) ?? null }));
  return { siparisId, gecerli: satirlar[0] ?? null, gecmis: satirlar };
}

// Gerekçe zorunlu, kayıt yalnız eklenir. Sipariş yoksa 404; satırı yazma bitene kadar kilitlidir. 2'nin üstü siparisler.onayla ister.
export async function siparisCarpaniYaz(db: Db, kullanici: Kullanici, siparisId: number, g: { carpan: number; gerekce: string }): Promise<SiparisCarpaniCevabi> {
  const genis = islemVarMi(kullanici, 'siparisler.onayla');
  if (!genis && !islemVarMi(kullanici, 'plan.yaz')) throw yetkiYok();
  if (g.carpan > elleCarpanSiniri(genis)) throw yetkiYok(`Çarpanı en çok ${elleCarpanSiniri(genis)} verebilirsiniz; üstü müdür onayıyla girer.`);
  await siparisKilitliAyrinti(db, siparisId);
  await s.carpanEkle(db, siparisId, g.carpan, g.gerekce, kullanici.id);
  return siparisCarpani(db, siparisId);
}

// Açık plan ekranlarının "plan değişti" uyarısı için hafif okuma: canlı plan sürümü ve son canlıya alma.
export async function canliSurum(db: Db): Promise<PlanSurumCevabi> {
  const son = await s.sonCanliyaAlma(db);
  const ad = son ? (await kisiAdlari(db, [son.kisiId])).get(son.kisiId) ?? null : null;
  return { planSurumu: await s.planSurumu(db), sonCanliyaAlma: son ? { zaman: son.zaman, kisi: ad } : null };
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
    if (x.durum !== 'acik') throw cakisma('Taslak kapanmış; yalnız açık taslak değişir.');
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
    await taslakYeri(db, b, id, isEmriId);
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
  if (g.kuyruklar.some((q) => q.isler.some((i) => i.dondurulmus)) && !islemVarMi(k, 'plan.kilitle')) throw yetkiYok('Dondurmak plan kilitleme yetkisi ister.');
  if (new Set(g.kuyruklar.map((q) => kaynakAnahtari(q.kaynak))).size !== g.kuyruklar.length) throw dogrulama('Bir kaynak yalnız bir kez yazılır.', 'kuyruklar');
  await planSurumuDenetle(db, g.planSurumu);
  let taslak: TaslakGirdisi = g.taslak ?? null;
  let yazilan = 0;
  let atlanan = 0;
  if (g.kuyruklar.length > 0) {
    const p = await taslagaYaz(db, k, taslak, async (b, id) => {
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
      const tur = (onceki: ReadonlyMap<number, Aralik & { kaynak: Kaynak }>) => {
        const yeniYer = new Map<number, Aralik & { kaynak: Kaynak }>();
        const yerlesenParca = new Map<number, number>();
        const tamam = (id: number) => yeniYer.has(id) && (yerlesenParca.get(id) ?? 0) === (parcaNolari.get(id)?.length ?? 0);
        // Akışlı adım ilk devir partisiyle başlar ve öncülünden önce bitemez: gerekirse kuyruğun kaynağında bu bitişe kadar uzar.
        const onculSiniri = (is: Is, kaynak: Kaynak): { enErken: number; bitisSiniri: number } => {
          const once = [...b.isler.values()].filter((x) => x.uretimEmriId === is.uretimEmriId && x.sira < is.sira).sort((x, y) => y.sira - x.sira)[0];
          const eski = once ? hepsi.find((y) => y.isEmriId === once.id) : undefined;
          const o = once ? (tamam(once.id) ? yeniYer.get(once.id) : undefined) ?? onceki.get(once.id) ?? yeniYer.get(once.id)
            ?? (eski ? { baslangic: dk(b, eski.baslangic), bitis: dk(b, eski.bitis), kaynak: eski.kaynak } : null) : null;
          const fason = is.bagimlilik === 'bagimsiz' ? 0 : (is.fasonBekleGun ?? 0) * GUN_DK;
          if (fason > 0) return { enErken: Math.max(0, o?.bitis ?? 0) + fason, bitisSiniri: Number.NEGATIVE_INFINITY };
          const t = takvim(b);
          const bas = enErkenBaslangic(is, o, Number.NEGATIVE_INFINITY, o ? t(o.kaynak) : null, o ? verimi(b)(o.kaynak) : 1);
          return { enErken: bas, bitisSiniri: enErkenBitis(is, o, t(kaynak), verimi(b)(kaynak)) ?? Number.NEGATIVE_INFINITY };
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
      // 276 a: ekranın sırası yalnız elle işaretli işte kalır; gerisini motor dizer, canlıya giden taslak ekranın çizdiği motor planıdır.
      const motordan = await onerUygula(db, await baglamKur(db, k, id), id);
      return { tur: 'sirala', ozet: `Reçete ve Rota kuyrukları yazıldı (${g.kuyruklar.length} kaynak, ${yazilan} iş)`, isEmriIdleri: [...new Set([...idler, ...motordan])] };
    });
    taslak = { id: p.taslak!.id, surum: p.taslak!.surum };
  }
  if (taslak === null) throw dogrulama('Yazılacak kuyruk yok.', 'kuyruklar');
  return { taslak: taslak.id, canli: false, yazilan, atlanan };
}

// Parti kolu (B7): kolun bölünme adımı üstün önceki adımını, üstün birleşme adımı kolun son adımını bekler. Kol birleşme adımını taşımaz.
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
// 196 a: motor emrin elle önceliğini değil, gecikme bedelinden çıkan sınıfı sıralar; bedel emir başına bir kez, plandaki bütün emirlerle.
function emirBedelleri(b: Baglam): Map<number, number> {
  const bedel = new Map<number, number>();
  for (const i of b.isler.values()) {
    if (bedel.has(i.uretimEmriId)) continue;
    const satir = emirSatiri(b, i);
    bedel.set(i.uretimEmriId, gecikmeBedeli(satir, null, emirCarpani(b, i, satir), b.bedelAyari.tabanBedelSaat));
  }
  return bedel;
}
const sinifEsigi = (b: Baglam) => ({ yuksek: b.bedelAyari.yuksekEsigi, dusuk: b.bedelAyari.dusukEsigi });
const emirSiniflari = (b: Baglam): Map<number, 1 | 2 | 3> => oncelikSiniflari(emirBedelleri(b), sinifEsigi(b));

// 306 a: siparişin plandaki emirlerinin bedeli ve bandı; bant sınırları bütün plan emirleriyle. Planda emri yoksa bant null. Sipariş
// yoksa 404.
export async function siparisBandi(db: Db, k: Kullanici, siparisId: number): Promise<SiparisBandiCevabi> {
  await siparisAyrintisi(db, siparisId);
  const b = await baglamKur(db, k, null);
  const bedel = emirBedelleri(b);
  const sinif = oncelikSiniflari(bedel, sinifEsigi(b));
  const emirler = new Map<number, string>();
  for (const i of b.isler.values()) if (i.siparisSatiriId != null && b.siparisSatirlari.get(i.siparisSatiriId)?.siparisId === siparisId) emirler.set(i.uretimEmriId, i.emirNo);
  if (emirler.size === 0) return { siparisId, bant: null };
  const s = bantSinirlari(bedel, sinifEsigi(b));
  const ad = { 1: 'yuksek', 2: 'normal', 3: 'dusuk' } as const;
  return {
    siparisId,
    bant: {
      yuksekSiniri: s.yuksek, dusukSiniri: s.dusuk,
      emirler: [...emirler].sort(([x], [y]) => x - y).map(([id, emirNo]) => ({ uretimEmriId: id, emirNo, bedel: bedel.get(id)!, sinif: ad[sinif.get(id)!] })),
    },
  };
}

function motorGirdisi(b: Baglam, satirListesi: readonly YerlesimSatiri[]) {
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
    if (y.kilitli || y.dondurulmus || is.durum !== 'planli' || is.sureDk === null || !izinliMi(b, k) || parcaKaynagiDisarida || (k !== null && !k.aktif && is.durum !== 'planli')) {
      for (const x of isgal([y])) sabitler.push({ ...x, uretimEmriId: is.uretimEmriId, sira: is.sira });
    } else {
      serbest.add(y.isEmriId);
      const sp = satirlar.get(y.isEmriId)?.parcalar ?? [];
      if (sp.length) parcalar.set(y.isEmriId, uzlasikParcalar(is, sp).map((p) => ({ no: p.no, sureDk: parcaSuresi(is, p.adet), kaynak: p.elleKaynak && tutulur(p.kaynak) ? p.kaynak : null })));
    }
  }
  const sabitIdler = new Set(sabitler.map((x) => x.isEmriId));
  const uygun = (kk: Kaynak) => { const v = b.kaynaklar.get(kaynakAnahtari(kk)); return !!v && v.aktif && izinliMi(b, v); };
  const bagli = partiBaglari([...b.isler.values()]);
  const sinif = emirSiniflari(b);
  const isler: MotorIsi[] = [...b.isler.values()].filter((i) => i.durum === 'planli' && !sabitIdler.has(i.id)).map((i) => ({
    bagli: bagli.get(i.id) ?? [], id: i.id, uretimEmriId: i.uretimEmriId, sira: i.sira, teslimDk: teslimDk(b, i.teslim), sureDk: i.sureDk, ayarDk: i.ayarDk,
    ...(elleKaynak.has(i.id) ? { kaynak: elleKaynak.get(i.id)!, adaylar: [] } : { kaynak: i.kaynak && uygun(i.kaynak) ? i.kaynak : null, adaylar: i.rotaKaynaklari.filter(uygun) }), bagimlilik: i.bagimlilik, devirDk: i.devirDk, devirAyarDk: i.devirAyarDk,
    devirSonDk: i.devirSonDk, oncelik: sinif.get(i.uretimEmriId) ?? null, acilmaDk: dk(b, new Date(i.acilma)), emirBaslangicDk: i.baslangic ? (tesisGunBasi(i.baslangic) - b.simdi) / DK : null, elleSira: elle.get(i.id) ?? null,
    fasonBekleDk: (i.fasonBekleGun ?? 0) * GUN_DK,
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

const motorAyari = (a: PlanAyari, kural?: Kural) => ({ kural: kural ?? a.kural, yon: a.yon, tamponDk: a.tamponGun * GUN_DK });

// 282 a: kısıt açıkken motor, kişi verisi olan iş merkezinin kişi-dakikası dolan gününe yeni iş koymaz; kapasite personel matrisiyle aynıdır.
function personelKisiti(b: Baglam): PersonelKisiti | undefined {
  if (!b.ayar.personelKisiti) return undefined;
  const kapasite = new Map(personelVerisi(b, []).map((p) => [p.isMerkeziId, p.kapasite] as const));
  const merkezi = (k: Kaynak) => {
    const v = b.kaynaklar.get(kaynakAnahtari(k));
    return v?.istasyon && v.isMerkeziId !== null && kapasite.has(v.isMerkeziId) ? { id: v.isMerkeziId, operator: b.operator.get(v.istasyon.id) ?? 1 } : null;
  };
  return { gun0: b.gun0, merkezi, kapasite };
}

// TL amacı (denetim #21, 203 a): emrin bitişi, planlanacak bütün işleri yerleştiyse en geç bitişidir; yerleşmeyen işi olan emir toplama
// girmez, yerleşmeyen iş başına büyük ceza alır: arama işi plandan düşürerek ucuzlamasın.
const YERLESMEYEN_CEZASI = 1e12;
function planTl(b: Baglam, yerler: readonly Yerlesim[], yerlesmeyen: number): number {
  const bit = new Map<number, number>();
  const yerlesen = new Map<number, Set<number>>();
  for (const y of yerler) {
    const i = b.isler.get(y.isEmriId);
    if (!i || !planlanacak(i)) continue;
    bit.set(i.uretimEmriId, Math.max(bit.get(i.uretimEmriId) ?? Number.NEGATIVE_INFINITY, y.bitis));
    yerlesen.set(i.uretimEmriId, (yerlesen.get(i.uretimEmriId) ?? new Set()).add(y.isEmriId));
  }
  const emirler = new Map<number, { id: number; teslimDk: number | null; isSayisi: number }>();
  for (const i of b.isler.values()) {
    if (!planlanacak(i)) continue;
    const e = emirler.get(i.uretimEmriId) ?? { id: i.uretimEmriId, teslimDk: teslimDk(b, i.teslim), isSayisi: 0 };
    e.isSayisi += 1;
    emirler.set(i.uretimEmriId, e);
  }
  return tlToplami(b, [...emirler.values()].map((e) => ({ ...e, bit: yerlesen.get(e.id)?.size === e.isSayisi ? bit.get(e.id)! : null })))
    + YERLESMEYEN_CEZASI * yerlesmeyen;
}

// Motorun tek koşusu: ekran, öneri, karşılaştırma ve önizleme aynı planı görür. 'oncelik' kuralında plan TL toplamıyla iyileşir.
function motorKos(b: Baglam, isler: readonly MotorIsi[], sabitler: readonly Sabit[], kural: Kural = b.ayar.kural) {
  const ayar = { ...motorAyari(b.ayar, kural), personel: personelKisiti(b) };
  const kos = (sira?: ReadonlyMap<number, number>) => motor(isler, sabitler, 0, sira ? { ...ayar, sira } : ayar, takvim(b), verimi(b));
  if (kural !== 'oncelik') return kos();
  const elle = new Set(isler.filter((i) => i.elleSira != null).map((i) => i.uretimEmriId));
  const sabitYer = sabitYerleri(sabitler);
  return tlIyilestir(kos, (r) => planTl(b, [...sabitYer, ...r.yerlesimler], r.yerlesmeyen.length), (id) => b.isler.get(id)?.uretimEmriId ?? id, elle,
    tlKosuSiniri(isler.length));
}

async function onerUygula(db: Db, b: Baglam, id: number): Promise<number[]> {
  const satirlar = await s.yerlesimler(db, id);
  const { sabitler, serbest, isler } = motorGirdisi(b, satirlar);
  const sonuc = motorKos(b, isler, sabitler);
  // Elle sıra istasyonuyla birlikte kalır: istasyonu değişmiş adımın elle sırası motorda sayılmaz, uyarısı planlamacı yeniden sıralayana dek görünür.
  // Bölünmüş işin parçaları adetini, elle sırasını ve elle kaynağını korur.
  const eski = new Map(satirlar.map((y) => [y.isEmriId, y]));
  await s.yerlesimleriSil(db, id, [...serbest]);
  for (const y of sonuc.yerlesimler) {
    const e = eski.get(y.isEmriId);
    const ep = new Map<number, Omit<ParcaSatiri, 'kaynak' | 'baslangic' | 'bitis'>>([
      ...(b.yersiz.get(y.isEmriId) ?? []).map((p) => [p.no, { ...p, elleSira: null, elleIstasyonId: null, elleKaynak: false }] as const),
      ...(e?.parcalar ?? []).map((p) => [p.no, p] as const),
    ]);
    await s.yerlesimYaz(db, id, {
      isEmriId: y.isEmriId, kaynak: y.kaynak, baslangic: tarih(b, y.baslangic), bitis: tarih(b, y.bitis), kilitli: false, dondurulmus: false,
      elleSira: e?.elleSira ?? null, elleIstasyonId: e?.elleIstasyonId ?? null, elleKaynak: e?.elleKaynak ?? false,
      ...(y.parcalar ? { parcalar: y.parcalar.map((p) => ({ ...ep.get(p.no)!, kaynak: p.kaynak, baslangic: tarih(b, p.baslangic), bitis: tarih(b, p.bitis) })) } : {}),
    });
  }
  return [...new Set([...serbest, ...sonuc.yerlesimler.map((y) => y.isEmriId)])];
}

export function oner(db: Db, k: Kullanici, t: TaslakGirdisi) {
  return taslagaYaz(db, k, t, async (b, id) => {
    const idler = await onerUygula(db, b, id);
    return { tur: 'oner', ozet: `Motor önerdi (${KURAL_ADI[b.ayar.kural]}, ${idler.length} iş)`, isEmriIdleri: idler };
  }, false);
}

// Seçenekleri karşılaştır: her sıralama kuralıyla motor yazmadan çalıştırılır; bugünkü (canlı ya da taslak) yerleşime göre.
export async function karsilastir(db: Db, k: Kullanici, taslak?: number): Promise<KarsilastirmaCevabi> {
  const hedef = taslak ?? null;
  await hedefDenetle(db, hedef);
  const b = await baglamKur(db, k, hedef);
  const satirlar = await s.yerlesimler(db, hedef);
  const yerler = satirlar.map((y) => yerOf(b, y));
  const { sabitler, isler } = motorGirdisi(b, satirlar);
  const simdiki = new Map(yerler.map((y) => [y.isEmriId, y.baslangic]));
  const r = kurallariKarsilastir(PLAN_KURALLARI, (kural) => motorKos(b, isler, sabitler, kural), simdiki,
    (x) => b.isler.get(x)?.uretimEmriId ?? x, (ys) => {
      const g = gosterge(b, [...sabitler, ...ys]);
      return { geciken: g.geciken, darbogaz: g.darbogaz?.ad ?? null, maliyetTl: g.maliyetTl };
    });
  return { secenekler: r.map((x) => ({ ...x, sonBitis: x.sonBitisDk === null ? null : tarih(b, x.sonBitisDk).toISOString() })) };
}

// 220 a: motorun yerleşimi yazılmadan döner; ekran (Reçete ve Rota > Plan) kendi hesabı yerine bunu çizer. Sabitler yerinde kalır.
export async function motorYerlesimi(db: Db, k: Kullanici, taslak?: number): Promise<MotorYerlesimiCevabi> {
  const hedef = taslak ?? null;
  await hedefDenetle(db, hedef);
  const b = await baglamKur(db, k, hedef);
  const { sabitler, isler } = motorGirdisi(b, await s.yerlesimler(db, hedef));
  const sonuc = motorKos(b, isler, sabitler);
  const kimlik = (id: number) => { const i = b.isler.get(id)!; return { isEmriId: id, uretimEmriId: i.uretimEmriId, emirNo: i.emirNo, opNo: i.opNo }; };
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
  return {
    uyarilar: motorUyarilari({ personelKisiti: b.ayar.personelKisiti, personelMerkeziSayisi: personelVerisi(b, []).length }),
    ekranYerlesimi: ekran,
    hesaplanma: new Date(b.simdi).toISOString(),
    ayar: { kural: b.ayar.kural, yon: b.ayar.yon, tamponGun: b.ayar.tamponGun },
    yerlesimler: [
      ...sabitler.filter((x) => b.isler.has(x.isEmriId)).map((x) => ({
        ...kimlik(x.isEmriId), kaynak: x.kaynak, kaynakAdi: kaynakAdi(x.kaynak), baslangic: iso(x.baslangic), bitis: iso(x.bitis), sabit: true,
      })),
      ...sonuc.yerlesimler.map((y) => ({
        ...kimlik(y.isEmriId), kaynak: y.kaynak, kaynakAdi: kaynakAdi(y.kaynak), baslangic: iso(y.baslangic), bitis: iso(y.bitis), sabit: false,
        ...(y.parcalar ? { parcalar: y.parcalar.map((p) => ({ no: p.no, kaynak: p.kaynak, baslangic: iso(p.baslangic), bitis: iso(p.bitis) })) } : {}),
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
  const kos = () => {
    const { sabitler, isler } = motorGirdisi(b, mevcut);
    const m = motorKos(b, isler, sabitler);
    const satirlar: YerlesimSatiri[] = [...sabitYerleri(sabitler), ...m.yerlesimler].map((y) => ({
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
  const once = kos();
  const rotalar: RotaOnbellek = new Map([[r.id, r]]);
  const urunler = new Map<number, { kod: string; ad: string }>();
  for (const [n, { a, fasonBekleGun }] of icAdimlar(r.adimlar).entries()) {
    const i = await isKur(db, {
      fasonBekleGun, id: ONIZLEME_EMRI - n, uretimEmriId: ONIZLEME_EMRI, emirNo: 'Yeni emir', malzemeNo: r.malzemeId, adet: g.adet, teslim: g.teslim,
      oncelik: g.oncelik, acilma: new Date(b.simdi).toISOString(), baslangic: g.baslangic, kaynakRotaRevizyonId: r.id, sira: a.sira, opNo: a.opNo, ad: a.ad, kaynak: isEmriKaynagi(a.kaynak),
      ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk, bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, durum: 'planli',
    }, rotalar, urunler, b.istasyonMakineleri);
    b.isler.set(i.id, i);
  }
  devirleriKur(b.isler);
  const sonra = kos();
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

async function acikTaslak(db: Db, k: Kullanici, id: number, surum: number, sahipOlmali = true) {
  const x = await s.senaryo(db, id, true);
  if (!x) throw bulunamadi('Senaryo bulunamadı.');
  if (x.durum !== 'acik') throw cakisma('Senaryo kapanmış; yalnız açık senaryo değişir.');
  if (sahipOlmali && x.acanKisiId !== k.id) throw yetkiYok(BASKASININ_TASLAGI);
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
  const adlar = await kisiAdlari(db, liste.map((x) => x.acanKisiId));
  const defter = await s.degisiklikler(db, liste.map((x) => x.id));
  const sonuc: SenaryolarCevabi['senaryolar'] = [];
  for (const x of liste) {
    const kendi = defter.filter((d) => d.senaryoId === x.id);
    let gostergeler: SenaryolarCevabi['senaryolar'][number]['gostergeler'] = null;
    let etki: SenaryolarCevabi['senaryolar'][number]['etki'] = null;
    if (x.durum === 'acik') {
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
    sonuc.push({
      id: x.id, ad: x.ad, aciklama: x.aciklama, durum: x.durum, acan: adlar.get(x.acanKisiId) ?? null, benim: x.acanKisiId === k.id, acilma: x.acilma,
      surum: x.surum, tabanPlanSurumu: x.tabanPlanSurumu, canliDegisti: x.durum === 'acik' && x.tabanPlanSurumu !== surum, gostergeler,
      degisiklikler: kendi.map((d) => ({ id: d.id, tur: d.tur, ozet: d.ozet, yazma: d.yazma })), etki,
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
  if (x.durum !== 'acik') throw cakisma('Yalnız açık senaryo çoğaltılır.');
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
  if (d.tur === 'acil_emir') {
    const sanal = (await s.yerlesimler(db, id)).filter((y) => y.isEmriId < 0 && Math.floor(-y.isEmriId / 1000) === d.id).map((y) => y.isEmriId);
    await s.yerlesimleriSil(db, id, sanal);
  }
  if (d.isEmriIdleri.length > 0) await s.canlidanAl(db, id, d.isEmriIdleri.filter((x) => x > 0));
  await s.degisiklikSil(db, id, [d.id]);
  await s.senaryoSurumArtir(db, id);
  return senaryolar(db, k);
}

export async function degisiklikleriAt(db: Db, k: Kullanici, id: number, surum: number) {
  await acikTaslak(db, k, id, surum);
  await s.senaryoSifirla(db, id);
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
  await s.degisiklikEkle(db, id, { tur: 'oner', ozet: `Motor önerdi (${KURAL_ADI[yeni.ayar.kural]}, ${idler.length} iş)`, isEmriIdleri: idler.filter((x) => x > 0) }, k.id);
  await s.senaryoSurumArtir(db, id);
  return senaryolar(db, k);
}

// Canlıya alma (P4, P6, ST-02..ST-04): iki adımlı ve yetkili. Taslağın yerleşimleri ve ayarı canlıya yazılır; başlamış ve bitmiş işler
// canlıdaki hâliyle kalır; yerleşimin makine ya da kişisi iş emrine yazılır (P3). Sahibi bağlanmamış denemeler varsa alınmaz.
export async function canliyaAl(db: Db, k: Kullanici, id: number, g: { surum: number; cakismalariKabul: boolean; acilMusteriler?: readonly { degisiklikId: number; firmaId: number }[] }) {
  const x = await acikTaslak(db, k, id, g.surum, false);
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
  const taslak = await s.yerlesimler(db, id);
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
  // Yersiz bölme de canlıya geçer (taslakta ya da canlıda yalnız bölmesi olan iş).
  const yersizler = [...b.yersiz.keys(), ...(await s.yersizBolmeler(db, null)).keys()];
  const idler = [...new Set([...canli.map((y) => y.isEmriId), ...taslak.map((y) => y.isEmriId), ...yersizler])].filter(degisebilir);
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
  await s.planSurumuArtir(db);
  await s.senaryoKapat(db, id, 'canliya_alindi', k.id);
  return senaryolar(db, k);
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
