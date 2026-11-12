import { type Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bagimliKayit, bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kapsamDisiysaReddet, kapsamdaMi, kapsamSuzgeci, kisininKapsami } from '#cekirdek/kapsam.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { type KatalogMalzemeOzeti } from '#paylasilan/sozlesme/malzemeler.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  AcilanKart, KaliteDurumu, HareketCevabi, RezervelerCevabi, SahipsizStatuluCevabi, RezerveEtKomutu, RezerveKaldirKomutu, EmirTamamlamaCevabi, EmirTamamlaKomutu, TeslimAlGovdesi, TeslimCevabi, TeslimGonderGovdesi, TeslimReddetGovdesi,
  IsMalzemeleriCevabi, IsMalzemesiIsteGovdesi, UretimHazirligiCevabi, UretimHazirligiGovdesi,
} from '#paylasilan/sozlesme/stok.ts';
import type { StatulerCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { istasyonGetir, istasyondakiKisiler, kisininIzinliIsMerkezleri } from '../../istasyonlar/disari.ts';
import { bildirimGonder } from '../../bildirim/disari.ts';
import { malzemeOzeti, malzemeOzetleri } from '../../malzemeler/disari.ts';
import {
  adimUretimBilgisi, adimliEmirAyrintisi, baslatmaDenetle, emirDilimi, emirDurumlari, emirMalzemeIhtiyaci, emirOzeti, isEmriOzeti, uretimEmriOzeti, emirDugumleri, emirNolari, kapanisSonuclari,
  aralikAdetleri, adimKararSayaclari, adimUretimBilgileri, emirlerinDugumleri, emirlerinIsEmriIdleri,
} from '../../uretim-emirleri/disari.ts';
import {
  binde, bindenMetin, cikisOnerisi, stoklanirMi, partiSec, ihtiyacToplami, kalanSarf, tamamlamaEngeli, ISTEK_GECIS_KAYNAKLARI, istekGecisEngeli, istekAcilisDurumu, sayimArtisPlani, sayimAzalisPlani,
  istekliTeslimEngeli, istekListeEngeli, teslimAlimMiktariEngeli, istenenFazlaNotu, teslimAlmaEngeli, teslimKapanisEngeli, kaynaklardanAl, uretimAdimPlani, dalliAdimPlani, birikimliMiktar,
  kalanAdimAdedi, tasimaKaynagi, type TasimaKaynagi, gelenOrani, oranliAdet, type GelenOrani, type ReceteGirdisi, type UretimAdimPlani, baslatmaEksikleri, adimKalanIhtiyaci, tasinanMahsubu, adetMiktari, type BaslatmaEksigi,
  rezerveSiniri, enKotuKalite, girdiSec, eksidenUyari, geriCevirmeKaliteleri, teslimBolmesi, elleSarfMahsubu, araCevirmeMahsubu, sarfKapanisEngeli, refakatSayimEngeli, refakatTeslimEngeli, kartOnayiTuru,
  sahipsizStatuluHesapla, refakatEtiketi,
} from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import type { BakiyeHam, IstekHam, TeslimHam } from '../sorgular.ts';
import { adimParcasi } from './dis-akis.ts';
import { uretimGirisi } from './giris.ts';
import { belgeNo, uretimPartisi, korumali, bakiyeDegistir, siraliKilitle, kilitliEksik, eksiUyarisi, hareket, teslimYaz, sktBugun } from './ortak.ts';
import { refakatPartileriCevir, refakatKartlariniBirlestir } from './refakat.ts';
import {
  kalaniAc, depodakiMiktar, kapsamOku, kapsamdakiIstasyonlar, istasyonKonumuBul, yerCoz, istasyonKodlari, teslimOku, istenebilirKart, banaGelen, serbestDenetle, kisiKoduCoz, birakmaItirazSuresi,
} from './teslim.ts';

// ---- Emir tamamlama (EK "Stok ve tamamlama"): bitmiş emrin kalan sarfı ve çıktısı tek işlemde ------------------------------------
interface TamamlamaPlani {
  cevap: EmirTamamlamaCevabi;
  sarflar: { malzemeId: number; konumId: number; partiId: number | null; miktar: string }[];
}
// Yalnız okuma hesabında (sayaç) verilir; yazan komut her zaman taze okur.
export interface TamamlamaOnbellegi {
  bakiye: Map<number, BakiyeHam[]>;
  ozet: Map<number, KatalogMalzemeOzeti>;
}
export async function onbellekliOzetler(db: Db, idler: number[], onbellek?: TamamlamaOnbellegi): Promise<Map<number, KatalogMalzemeOzeti>> {
  if (!onbellek) return malzemeOzetleri(db, idler);
  const eksik = [...new Set(idler)].filter((id) => !onbellek.ozet.has(id));
  if (eksik.length > 0) for (const [id, o] of await malzemeOzetleri(db, eksik)) onbellek.ozet.set(id, o);
  return new Map(idler.flatMap((id) => { const o = onbellek.ozet.get(id); return o === undefined ? [] : [[id, o] as const]; }));
}
async function onbellekliBakiyeler(db: Db, malzemeId: number, onbellek?: TamamlamaOnbellegi): Promise<BakiyeHam[]> {
  if (!onbellek) return sorgular.serbestBakiyeler(db, malzemeId);
  let b = onbellek.bakiye.get(malzemeId);
  if (b === undefined) { b = await sorgular.serbestBakiyeler(db, malzemeId); onbellek.bakiye.set(malzemeId, b); }
  return b;
}
// Açık emrin plana göre kalan ihtiyacı ve en eski girişten karşılanan: yalnız iş kutusu sayacı (eksik malzemeli emir) için bir öngörüdür,
// tüketim yazmaz. Tamamlama fiili tüketimle kapanır (K-1 a, aşağıda).
export async function kalanIhtiyacPlani(
  db: Db, ihtiyac: Map<number, bigint>, verilen: Map<number, bigint>, ozet: Map<number, KatalogMalzemeOzeti>, onbellek?: TamamlamaOnbellegi,
): Promise<Pick<TamamlamaPlani, 'sarflar'> & { bilesenler: EmirTamamlamaCevabi['bilesenler'] }> {
  const sarflar: TamamlamaPlani['sarflar'] = [];
  const bilesenler: EmirTamamlamaCevabi['bilesenler'] = [];
  for (const [malzemeId, brut] of ihtiyac) {
    const o = ozet.get(malzemeId);
    const hizmet = o !== undefined && !stoklanirMi(o.tur);
    const v = verilen.get(malzemeId) ?? 0n;
    const kalan = hizmet ? 0n : kalanSarf(brut, v);
    let mevcut = 0n;
    let alinan = 0n;
    if (kalan > 0n) {
      const b = await onbellekliBakiyeler(db, malzemeId, onbellek);
      const o2 = cikisOnerisi(b.map((x) => ({ bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, partiEtiketi: null, miktar: x.miktar, ilkGiris: x.ilkGiris, sonKullanma: x.sonKullanma })), bindenMetin(kalan), sktBugun());
      mevcut = binde(o2.mevcut);
      for (const a of o2.oneriler) {
        sarflar.push({ malzemeId, konumId: a.konumId, partiId: a.partiId, miktar: a.miktar });
        alinan += binde(a.miktar);
      }
    }
    bilesenler.push({
      malzemeId, malzemeAd: o?.ad ?? o?.kod ?? null, hizmet, brut: bindenMetin(brut), verilen: bindenMetin(v), kalan: bindenMetin(kalan),
      mevcut: bindenMetin(mevcut), eksik: bindenMetin(kalan - alinan),
    });
  }
  return { sarflar, bilesenler };
}
// K-1 a (1385): emrin hammadde tüketimi fiilidir: terminalde düşülen ve hurdanın fire çıkışı (emre verilmiş net sarf). Plandaki fire
// payı tüketim sayılmaz; tamamlama sarf yazmaz, yalnız çıktıyı girer. Brüt plan bilgisi olarak gösterilir, kalan her zaman sıfırdır.
// Böylece tamamlamanın istasyondaki malzemeyi görmeden depodan ikinci kez düşmesi (S-2) de ortadan kalkar.
const SIFIR = bindenMetin(0n);
function bilesenPlani(
  ihtiyac: ReadonlyMap<number, bigint>, verilen: ReadonlyMap<number, bigint>, ozet: ReadonlyMap<number, KatalogMalzemeOzeti>,
): Pick<TamamlamaPlani, 'sarflar'> & { bilesenler: EmirTamamlamaCevabi['bilesenler'] } {
  const bilesenler: EmirTamamlamaCevabi['bilesenler'] = [];
  for (const [malzemeId, brut] of ihtiyac) {
    const o = ozet.get(malzemeId);
    const hizmet = o !== undefined && !stoklanirMi(o.tur);
    bilesenler.push({
      malzemeId, malzemeAd: o?.ad ?? o?.kod ?? null, hizmet, brut: bindenMetin(brut), verilen: bindenMetin(verilen.get(malzemeId) ?? 0n), kalan: SIFIR,
      mevcut: SIFIR, eksik: SIFIR,
    });
  }
  return { sarflar: [], bilesenler };
}
async function tamamlamaPlani(db: Db, emirId: number, ciktiMiktari?: string, onbellek?: TamamlamaOnbellegi): Promise<TamamlamaPlani> {
  const emir = await uretimEmriOzeti(db, emirId);
  if (emir === null) throw bulunamadi('Üretim emri bulunamadı.');
  if (emir.malzemeNo === null) throw gecersiz('Bu emrin ürün kartı yok (eski emir); stokta tamamlanmaz.');
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, emirId)) ?? []).map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut })));
  const verilen = new Map<number, bigint>();
  for (const p of await sorgular.emrinPartileri(db, emirId)) verilen.set(p.malzemeId, (verilen.get(p.malzemeId) ?? 0n) + binde(p.miktar));
  const ozet = await onbellekliOzetler(db, [emir.malzemeNo, ...ihtiyac.keys()], onbellek);
  const { sarflar, bilesenler } = bilesenPlani(ihtiyac, verilen, ozet);
  const girilen = binde(await sorgular.emirUretimGirisi(db, emirId, emir.malzemeNo));
  // Çıktı emrin sağlam adedine göre girer (fire düşülmüş, bitmiş emirde dolu); bitmemiş emirde adet gösterilir, engel zaten vardır.
  const hedef = BigInt(emir.saglamAdet ?? emir.adet) * 1000n;
  const kalanCikti = hedef > girilen ? hedef - girilen : 0n;
  // Sağlam adedi girmiş ve sarfı kalmamış emir tamamlanmıştır (hepsi fire olmuş emirde sağlam 0'dır).
  const tamam = girilen >= hedef && sarflar.length === 0;
  const girecek = tamam ? 0n : ciktiMiktari === undefined ? kalanCikti : binde(ciktiMiktari);
  if (girecek > kalanCikti) throw dogrulama(`Sağlam adet emrin girilmemiş adedini (${bindenMetin(kalanCikti)}) aşamaz.`, 'miktar');
  const engel = tamamlamaEngeli({
    durum: emir.durum, eksikVar: bilesenler.some((b) => binde(b.eksik) > 0n), yapilacakVar: girecek > 0n || sarflar.length > 0,
  });
  const urun = ozet.get(emir.malzemeNo);
  return {
    sarflar,
    cevap: {
      emir: { id: emir.id, emirNo: emir.emirNo, durum: emir.durum, adet: emir.adet, malzemeId: emir.malzemeNo, malzemeAd: urun?.ad ?? urun?.kod ?? null },
      cikti: { girilen: bindenMetin(girilen), kalan: bindenMetin(girecek) }, bilesenler, engel,
    },
  };
}
export async function emirTamamlamaOku(db: Db, emirId: number): Promise<EmirTamamlamaCevabi> {
  return (await tamamlamaPlani(db, emirId)).cevap;
}
// Uç giriş işlemiyle açılır; çıkış işlemi de istenir (yetki K-1 a öncesiyle aynı kalır, genişletilmez). K-1 a: tamamlama sarf yazmaz,
// yalnız sağlam adedin girilmemiş kısmını girer. Hesap emir kilidi alındıktan sonra yeniden yapılır.
export async function emirTamamla(db: Db, k: Kullanici, emirId: number, g: EmirTamamlaKomutu): Promise<HareketCevabi> {
  if (!islemVarMi(k, 'stok.cikis')) throw yetkiYok('Stokta tamamlama için stok çıkış yetkisi de gerekir.');
  await sorgular.emirTamamlamaKilidi(db, emirId);
  const plan = await tamamlamaPlani(db, emirId, g.miktar);
  if (plan.cevap.engel !== null) throw cakisma(plan.cevap.engel, { bilesenler: plan.cevap.bilesenler });
  // DEP-36 kapsamı sarf yazılmasa da korunur: kapsam dışındaki emri tamamlayamaz.
  await sarfEmriDenetle(db, k.id, emirId);
  const hareketIdler: number[] = [];
  if (binde(plan.cevap.cikti.kalan) > 0n) {
    const giris = await uretimGirisi(db, k.id, { uretimEmriId: emirId, malzemeId: plan.cevap.emir.malzemeId, miktar: plan.cevap.cikti.kalan });
    hareketIdler.push(...giris.hareketIdler);
  }
  return { hareketIdler, onayliEksi: false };
}

// Emre yabancı anahtar Aşama 2'de gelir (STK6 b: emir modeli değişiyor); o zamana kadar emrin varlığını sahibi söyler.
export async function emirVarDenetle(db: Db, id: number | null): Promise<void> {
  if (id !== null && (await emirOzeti(db, id)) === null) throw bulunamadi('Üretim emri bulunamadı.');
}
// DEP-36: üretime sarfı yalnız emrin iş merkezi kişinin kapsamındaysa yazar.
export async function sarfEmriDenetle(db: Db, kisiId: number, id: number | null): Promise<void> {
  if (id === null) return;
  const emir = await emirOzeti(db, id);
  if (emir === null) throw bagimliKayit('Üretim emri bulunamadı.');
  const kapanis = sarfKapanisEngeli((await kapanisSonuclari(db, [id])).get(id) != null);
  if (kapanis !== null) throw cakisma(kapanis);
  const istasyon = await istasyonGetir(db, emir.istasyonId);
  kapsamDisiysaReddet(await kisininKapsami(db, kisiId, kisininIzinliIsMerkezleri), istasyon?.isMerkeziId ?? null);
}

// ---- Üretime hazırlık (kart #1289) ------------------------------------------------------------------------------------------------
// Adımın girdileri istasyonda serbest (statüsüz, yoldaki teslime ayrılmamış) miktarla karşılaştırılır; bir adetlik yoksa eksiktir.
async function baslatmaGirdiEksikleri(db: Db, uretimEmriId: number, isEmriId: number, istasyonId: number, adet: number): Promise<BaslatmaEksigi[]> {
  const bilgi = await adimBilgisi(db, isEmriId);
  if (bilgi === null || bilgi.girdiler.length === 0) return [];
  // Hizmet stoklanmaz: istasyona gelmesi beklenmez.
  const kartlar = await malzemeOzetleri(db, [...new Set(bilgi.girdiler.map((g) => g.malzemeNo))]);
  const girdiler = bilgi.girdiler.filter((g) => stoklanirMi(kartlar.get(g.malzemeNo)?.tur ?? ''));
  const konumId = await sorgular.istasyonKonumu(db, istasyonId);
  const istasyonda = new Map<number, bigint>();
  for (const m of new Set(girdiler.map((g) => g.malzemeNo))) {
    const satirlar = konumId === null ? [] : (await sorgular.uretimGirdiKaynaklari(db, m, null, konumId, uretimEmriId)).filter((k) => k.konumId === konumId);
    istasyonda.set(m, satirlar.reduce((t, k) => t + binde(k.serbest), 0n));
  }
  // Çok katmanlı emirde alt düğümün girdisi alt parça başınadır: emrin bütün adedi kök başına adetle çarpılır (1476-C). Dal çarpanı
  // malzemeyi çarpmaz (1333 a): tek katmanlı emirde ve kökte emir adedi.
  const carpan = Number((await emirDugumleri(db, uretimEmriId)).get(bilgi.opNo)?.birimCarpani ?? 1);
  // B-2501-3: istek emrin kalan ihtiyacıdır (kopyanın fire payı eklenir, emre verilmiş sarf düşülür); kopyası okunamayan emirde adet x miktar.
  const ihtiyac = await emirMalzemeIhtiyaci(db, uretimEmriId);
  const verilen = new Map<number, bigint>();
  for (const m of new Set(girdiler.map((g) => g.malzemeNo))) verilen.set(m, binde(await sorgular.emrinNetSarfi(db, uretimEmriId, m)));
  const kalanlar = ihtiyac === null ? undefined : adimKalanIhtiyaci(ihtiyac, bilgi.opNo, verilen);
  return baslatmaEksikleri(girdiler, istasyonda, BigInt(Math.round(adet * carpan * 1000)), kalanlar);
}

// Terminal başlatmadan önce sorar: her eksik girdi için istasyona malzeme isteği bir kez açılır (aynı adım ve malzeme ikinci istek açmaz,
// kapanmış istek yeniden açılmaz). İsteği depo karşılar, istasyon teslim alınca başlatılır.
export async function uretimHazirligi(db: Db, k: Kullanici, g: UretimHazirligiGovdesi): Promise<UretimHazirligiCevabi> {
  const istasyonId = Number(g.istasyonId);
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const emir = await uretimEmriOzeti(db, Number(g.uretimEmriId));
  if (!emir) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (emir.siradakiIsEmriId === null) return { hazir: true, eksikler: [] };
  // Sıradaki adım bu istasyonun değilse (önceki adım bitmedi) o adımın girdisi burada aranmaz, buraya istek açılmaz;
  // başlatmayı sıra kuralı reddeder ve operatör tek ileti görür (622).
  if ((await isEmriOzeti(db, emir.siradakiIsEmriId))?.istasyonId !== istasyonId) return { hazir: true, eksikler: [] };
  const sonuc = await eksikIstekleriAc(db, k.id, emir, emir.siradakiIsEmriId, istasyonId, 'Üretime başlarken istasyonda yok');
  const eksikler = [...sonuc, ...await tasinanEksikleri(db, emir, emir.siradakiIsEmriId, istasyonId)];
  return { hazir: eksikler.length === 0, eksikler };
}
// Önceki adımın parçası (745, 2 b) bu adıma statüsüyle gelir ve sayımda yalnız bu istasyondan düşülür. Hazırlık ve Teslim al onu öteki
// girdiler gibi gösterir; depodan istenmez, bulunduğu istasyondan teslimle alınır. İlk adımda, taşınan stoklanmıyorsa ya da adımın
// kendi girdisiyle aynı kartsa yoktur (o kart girdi satırında zaten görünür).
interface TasinanGirdi { malzemeId: number; statuId: number | null; birAdet: bigint }
// Dallı emirde (1348 a) birleştirme adımına her dalın parçası ayrı gelir; dal başına önceki parça gelmez.
async function tasinanGirdileri(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number,
): Promise<TasinanGirdi[]> {
  const stoklanir = async (m: number) => stoklanirMi((await malzemeOzeti(db, m))?.tur ?? '');
  const dalli = await dalliTasima(db, malzemeNo, bilgi, uretimEmriId);
  if (dalli !== null) {
    const l: TasinanGirdi[] = [];
    for (const p of dalli.gelenler) {
      if (bilgi.girdiler.some((g) => g.malzemeNo === p.malzemeId) || !(await stoklanir(p.malzemeId))) continue;
      l.push({ malzemeId: p.malzemeId, statuId: p.statuId, birAdet: adetMiktari(oranliAdet(1000n, p.oran), p.miktar, p.bolen) });
    }
    return l;
  }
  const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
  if (oncekiOpNo === null || tasinan === null || bilgi.girdiler.some((g) => g.malzemeNo === tasinan.malzemeNo)) return [];
  if (!(await stoklanir(tasinan.malzemeNo))) return [];
  const statuId = adimStatusu === null || (await cikti(oncekiOpNo)) !== null ? null : await adimStatusu(db, { malzemeNo, opNo: oncekiOpNo, uretimEmriId });
  return [{ malzemeId: tasinan.malzemeNo, statuId, birAdet: adetMiktari(1000n, tasinan.miktar, tasinan.bolen) }];
}
async function adimTasinanGirdileri(db: Db, uretimEmriId: number, malzemeNo: number, opNo: number): Promise<TasinanGirdi[]> {
  const isEmriId = (await adimliEmirAyrintisi(db, uretimEmriId)).isEmirleri.find((x) => x.opNo === opNo)?.id;
  const bilgi = isEmriId === undefined ? null : await adimBilgisi(db, isEmriId);
  return bilgi === null ? [] : tasinanGirdileri(db, malzemeNo, bilgi, uretimEmriId);
}
async function istasyondakiSerbest(db: Db, malzemeId: number, statuId: number | null, konumId: number | null, uretimEmriId: number): Promise<bigint> {
  if (konumId === null) return 0n;
  return (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, konumId, uretimEmriId)).filter((x) => x.konumId === konumId).reduce((t, x) => t + binde(x.serbest), 0n);
}
// İstasyonda bir adetlik önceki adım parçası yoksa ve parça başka yerdeyse eksiktir; istek açılmaz (depo karşılamaz), yer gösterilir.
// Önceki adım henüz parça çıkarmadıysa gösterilecek yer yoktur; sıra kuralı başlatmayı zaten bekletir.
async function tasinanEksikleri(
  db: Db, emir: { id: number; malzemeNo: number | null }, isEmriId: number, istasyonId: number,
): Promise<UretimHazirligiCevabi['eksikler']> {
  if (emir.malzemeNo === null) return [];
  const bilgi = await adimBilgisi(db, isEmriId);
  const l: UretimHazirligiCevabi['eksikler'] = [];
  for (const t of bilgi === null ? [] : await tasinanGirdileri(db, emir.malzemeNo, bilgi, emir.id)) {
    const e = await tasinanEksigi(db, emir.id, t, istasyonId);
    if (e !== null) l.push(e);
  }
  return l;
}
async function tasinanEksigi(db: Db, emirId: number, t: TasinanGirdi, istasyonId: number): Promise<UretimHazirligiCevabi['eksikler'][number] | null> {
  const konumId = await sorgular.istasyonKonumu(db, istasyonId);
  const istasyonda = await istasyondakiSerbest(db, t.malzemeId, t.statuId, konumId, emirId);
  if (istasyonda >= t.birAdet) return null;
  const yerler = await girdiYerleri(db, t.malzemeId, konumId, emirId, t.statuId);
  if (yerler.length === 0) return null;
  const kart = await malzemeOzeti(db, t.malzemeId);
  return { malzemeId: t.malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, gereken: bindenMetin(t.birAdet), istasyonda: bindenMetin(istasyonda), yerler, istek: null };
}
// Her eksik girdi için istasyona malzeme isteği bir kez açılır (aynı adım ve malzeme ikinci istek açmaz, kapanmış istek yeniden açılmaz).
async function eksikIstekleriAc(
  db: Db, kisiId: number, emir: { id: number; emirNo: string; adet: number }, isEmriId: number, istasyonId: number, neden: string,
): Promise<UretimHazirligiCevabi['eksikler']> {
  const opNo = (await adimBilgisi(db, isEmriId))?.opNo ?? 0;
  const eksikler = await baslatmaGirdiEksikleri(db, emir.id, isEmriId, istasyonId, emir.adet);
  const kartlar = await malzemeOzetleri(db, eksikler.map((e) => e.malzemeId));
  const istasyonKonumu = await sorgular.istasyonKonumu(db, istasyonId);
  const sonuc: UretimHazirligiCevabi['eksikler'] = [];
  for (const e of eksikler) {
    const yerler = await girdiYerleri(db, e.malzemeId, istasyonKonumu, emir.id);
    const kok = uretimIstekKoku(emir.id, opNo, e.malzemeId);
    const onceki = await sorgular.istekleriKoktan(db, kok);
    let istek = onceki.find((x) => ISTEK_GECIS_KAYNAKLARI.teslim.includes(x.durum)) ?? null;
    // Önceki istek kapandı (teslim, iptal) ama girdi hâlâ eksik: adım bitene kadar yeni istek açılır.
    if (istek === null) {
      const kaynakKimligi = `${kok}${onceki.length + 1}`;
      const miktar = bindenMetin(e.istenecek);
      const yerMetni = yerler.length === 0 ? 'stokta yok' : yerler.slice(0, 3).map((y) => `${y.konum} (${y.miktar})`).join(', ');
      const id = await sorgular.istekAc(db, {
        no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi, malzemeId: e.malzemeId, miktar, istasyonId, uretimEmriId: emir.id,
        aciklama: `${neden} · emir ${emir.emirNo} · OP ${opNo} · bulunduğu yer: ${yerMetni}`.slice(0, 500), kisiId,
        durum: istekAcilisDurumu(await depodakiMiktar(db, e.malzemeId), miktar),
      });
      istek = (id === null ? (await sorgular.istekleriKaynaktan(db, [kaynakKimligi]))[0] : await sorgular.istekBul(db, id)) ?? null;
    }
    const kart = kartlar.get(e.malzemeId);
    sonuc.push({
      malzemeId: e.malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, gereken: bindenMetin(e.gereken), istasyonda: bindenMetin(e.istasyonda), yerler,
      istek: istek === null ? null : { id: istek.id, no: istek.no, durum: istek.durum },
    });
  }
  return sonuc;
}
const uretimIstekKoku = (emirId: number, opNo: number, malzemeId: number): string => `uretim:${emirId}:${opNo}:${malzemeId}:`;
// Girdinin istasyon dışında bulunduğu yerler (depo, üretim çıkışı, öteki istasyonlar), en eskisi önce.
// Aynı konumdaki partiler tek yer olarak toplanır (kart #1418): kişi yeri seçer, partiyi sistem en eskiden alır.
async function girdiYerleri(
  db: Db, malzemeId: number, istasyonKonumu: number | null, uretimEmriId: number, statuId: number | null = null,
): Promise<IsMalzemeleriCevabi['isler'][number]['malzemeler'][number]['yerler']> {
  const toplam = yerToplamlari(await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, istasyonKonumu ?? 0, uretimEmriId, true), istasyonKonumu, uretimEmriId);
  return (await yerleriAdlandir(db, [toplam]))[0]!;
}
type YerToplami = { konumId: number; buEmrin: boolean; m: bigint }[];
function yerToplamlari(kaynaklar: readonly { konumId: number; partiEmriId: number | null; serbest: string }[], istasyonKonumu: number | null, uretimEmriId: number): YerToplami {
  const toplam = new Map<string, { konumId: number; buEmrin: boolean; m: bigint }>();
  for (const x of kaynaklar) {
    if (x.konumId === istasyonKonumu || binde(x.serbest) <= 0n) continue;
    const buEmrin = x.partiEmriId === uretimEmriId;
    const a = `${x.konumId}:${buEmrin}`;
    toplam.set(a, { konumId: x.konumId, buEmrin, m: (toplam.get(a)?.m ?? 0n) + binde(x.serbest) });
  }
  return [...toplam.values()];
}
// Bütün yer listeleri tek konum ve istasyon okumasıyla adlandırılır (1868).
async function yerleriAdlandir(db: Db, listeler: readonly YerToplami[]): Promise<IsMalzemeleriCevabi['isler'][number]['malzemeler'][number]['yerler'][]> {
  const uclar = new Map((await sorgular.teslimUclari(db, [...new Set(listeler.flatMap((l) => l.map((x) => x.konumId)))])).map((u) => [u.konumId, u]));
  const istKodlari = await istasyonKodlari(db, [...uclar.values()].map((u) => u.istasyonId));
  const yerKodu = (konumId: number): string => { const u = uclar.get(konumId); return (u?.istasyonId == null ? undefined : istKodlari.get(u.istasyonId)) ?? u?.kod ?? `#${konumId}`; };
  return listeler.map((l) => l.map(({ konumId, buEmrin, m }) => ({ konum: yerKodu(konumId), miktar: bindenMetin(m), konumId, istasyonId: uclar.get(konumId)?.istasyonId ?? null, buEmrin })));
}
// Teslim al'daki iş malzemeleri (kart #1289): istasyonda bitmemiş her adımın stoklanan girdileri, adım bitene kadar; bulunduğu yer ve
// açık istekle. Kalan adet, çalışan adımda sayılan sağlam düşülerek hesaplanır; çok katmanlı emrin alt düğümünde gereken kök başına adetle
// çarpılır (1555 a, kalanAdimAdedi).
export async function isMalzemeleri(db: Db, k: Kullanici, istasyonId: number): Promise<IsMalzemeleriCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const emirler = (await emirDilimi(db)).filter((e) => e.durum !== 'bitti' && e.durum !== 'iptal' && e.durum !== 'taslak');
  const adimlar = emirler.flatMap((e) => e.isEmirleri.filter((i) => i.istasyonId === ist.id && i.durum !== 'tamam').map((i) => ({ e, i })));
  const kartlar = await malzemeOzetleri(db, [...new Set(adimlar.flatMap(({ i }) => i.bilesenler.map((b) => b.malzemeId)))]);
  const konumId = await sorgular.istasyonKonumu(db, ist.id);
  // 1868: her adımın girdileri, taşınanı, bulunduğu yerler ve istekleri toplu okunur; adım ve girdi başına sorgu yoktur. Taşınanın statüsü ve
  // çıktısı Reçete ve Rota'nın çözücüsündendir (emir başına; yalnız önceki adımı olan adımda).
  const isEmriIdleri = await emirlerinIsEmriIdleri(db, [...new Set(adimlar.map(({ e }) => e.id))]);
  const bilgiler = await adimBilgileri(db, [...isEmriIdleri.values()].flat());
  const bilgiOf = (emirId: number, opNo: number): AdimBilgisi | null => {
    const id = (isEmriIdleri.get(emirId) ?? []).find((x) => bilgiler.get(x)?.opNo === opNo);
    return id === undefined ? null : bilgiler.get(id) ?? null;
  };
  const satirlar: { e: (typeof adimlar)[number]['e']; i: (typeof adimlar)[number]['i']; kalan: bigint; birim: Map<number, bigint>; tasinanlar: TasinanGirdi[] }[] = [];
  for (const { e, i } of adimlar) {
    const kalan = kalanAdimAdedi(e.adet, i.dugum?.birimCarpani ?? null, i.canliAdet ?? 0);
    const birim = new Map<number, bigint>();
    for (const b of i.bilesenler) if (stoklanirMi(kartlar.get(b.malzemeId)?.tur ?? '')) birim.set(b.malzemeId, (birim.get(b.malzemeId) ?? 0n) + adetMiktari(1000n, b.miktar));
    const bilgi = bilgiOf(e.id, i.opNo);
    const tasinanlar = (bilgi === null ? [] : await tasinanGirdileri(db, e.malzemeNo, bilgi, e.id)).filter((t) => !birim.has(t.malzemeId));
    satirlar.push({ e, i, kalan, birim, tasinanlar });
  }
  // Başka emrin partisi bu iş için kullanılamaz (K2): istasyondaki ve yerler emir başına hesaplanır. Aynı anahtar bir kez okunur.
  const anahtarlar = new Map<string, sorgular.GirdiKaynagiAnahtari>();
  for (const { e, birim, tasinanlar } of satirlar) {
    for (const malzemeId of birim.keys()) anahtarlar.set(`${e.id}:${malzemeId}:`, { malzemeId, statuId: null, uretimEmriId: e.id });
    for (const t of tasinanlar) anahtarlar.set(`${e.id}:${t.malzemeId}:${t.statuId ?? ''}`, { malzemeId: t.malzemeId, statuId: t.statuId, uretimEmriId: e.id });
  }
  const kaynaklar = await sorgular.uretimGirdiKaynaklariToplu(db, [...anahtarlar.values()], konumId ?? 0, true);
  const sira = [...anahtarlar.keys()];
  const yerListeleri = await yerleriAdlandir(db, sira.map((a, n) => yerToplamlari(kaynaklar[n]!, konumId, anahtarlar.get(a)!.uretimEmriId!)));
  const istasyonda = new Map(sira.map((a, n) => [a, konumId === null ? 0n : kaynaklar[n]!.filter((x) => x.konumId === konumId).reduce((t, x) => t + binde(x.serbest), 0n)]));
  const yerler = new Map(sira.map((a, n) => [a, yerListeleri[n]!]));
  const istekler = await sorgular.istekleriKoklerden(db, satirlar.flatMap(({ e, i, birim }) => [...birim.keys()].map((m) => uretimIstekKoku(e.id, i.opNo, m))));
  const tasinanKartlar = await malzemeOzetleri(db, satirlar.flatMap((x) => x.tasinanlar.map((t) => t.malzemeId)));
  const isler: IsMalzemeleriCevabi['isler'] = [];
  for (const { e, i, kalan, birim, tasinanlar } of satirlar) {
    const malzemeler: IsMalzemeleriCevabi['isler'][number]['malzemeler'] = [];
    for (const [malzemeId, birAdet] of birim) {
      const anahtar = `${e.id}:${malzemeId}:`;
      const istek = istekler.get(uretimIstekKoku(e.id, i.opNo, malzemeId))?.[0] ?? null;
      const kart = kartlar.get(malzemeId);
      const mevcut = istasyonda.get(anahtar)!;
      malzemeler.push({
        malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, birim: kart?.birim ?? null, birAdet: bindenMetin(birAdet), gereken: bindenMetin(birAdet * kalan), istasyonda: bindenMetin(mevcut),
        eksik: mevcut < birAdet, yerler: yerler.get(anahtar)!, istek: istek === null ? null : { id: istek.id, no: istek.no, durum: istek.durum }, tasinan: false,
      });
    }
    for (const t of tasinanlar) {
      const anahtar = `${e.id}:${t.malzemeId}:${t.statuId ?? ''}`;
      const kart = tasinanKartlar.get(t.malzemeId);
      const mevcut = istasyonda.get(anahtar)!;
      malzemeler.push({
        malzemeId: t.malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, birim: kart?.birim ?? null, birAdet: bindenMetin(t.birAdet), gereken: bindenMetin(t.birAdet * kalan),
        istasyonda: bindenMetin(mevcut), eksik: mevcut < t.birAdet, yerler: yerler.get(anahtar)!, istek: null, tasinan: true,
      });
    }
    if (malzemeler.length > 0) isler.push({ uretimEmriId: e.id, emirNo: e.emirNo, opNo: i.opNo, adimAd: i.ad, calisiyor: i.durum === 'calisiyor', kalanAdet: Number(kalan), malzemeler });
  }
  // Depo isteği "Yolda" gösterirken operatör de aynı isteği yolda görür (Akış A provası 2. tur Y2).
  const acikIstekler = isler.flatMap((x) => x.malzemeler.flatMap((m) => (m.istek === null ? [] : [m.istek])));
  const yolda = new Map((await sorgular.yoldaTeslimleri(db, acikIstekler.map((x) => x.id))).map((t) => [t.istekId, { id: t.id, no: t.no }]));
  for (const x of acikIstekler) x.yoldaTeslim = yolda.get(x.id) ?? null;
  return { isler };
}
// İşin malzemesini iste (kart #1418): depodan eksik miktarla istek; emrin rotasındaki başka istasyondan teslim kaydıyla alma.
export async function isMalzemesiIste(db: Db, k: Kullanici, g: IsMalzemesiIsteGovdesi): Promise<IsMalzemeleriCevabi> {
  const istasyonId = Number(g.istasyonId), uretimEmriId = Number(g.uretimEmriId), malzemeId = Number(g.malzemeId);
  const liste = await isMalzemeleri(db, k, istasyonId);
  const is = liste.isler.find((x) => x.uretimEmriId === uretimEmriId && x.opNo === g.opNo);
  const m = is?.malzemeler.find((x) => x.malzemeId === malzemeId);
  if (!is || !m) throw dogrulama('Bu istasyonda bu işin böyle bir malzemesi yok.', 'malzemeId');
  const eksik = binde(m.gereken) - binde(m.istasyonda);
  if (eksik <= 0n) throw dogrulama('Kalan iş için istasyonda yeterli var.', 'malzemeId');
  const kaynakKonumId = g.kaynakKonumId === null ? null : Number(g.kaynakKonumId);
  const kaynak = kaynakKonumId === null ? null : (await sorgular.teslimUclari(db, [kaynakKonumId]))[0];
  if (kaynakKonumId !== null && !kaynak) throw dogrulama('Kaynak yer bulunamadı.', 'kaynakKonumId');
  const urun = (await uretimEmriOzeti(db, uretimEmriId))?.malzemeNo ?? null;
  const tasinan = urun === null ? undefined : (await adimTasinanGirdileri(db, uretimEmriId, urun, is.opNo)).find((t) => t.malzemeId === malzemeId);
  const tasinanMi = tasinan !== undefined;
  const statuId = tasinanMi ? tasinan.statuId : null;
  if (tasinanMi && (!kaynak || kaynak.istasyonId === null)) throw dogrulama('Önceki adımın parçası depodan istenmez; bulunduğu istasyondan alın.', 'kaynakKonumId');
  if (!kaynak || kaynak.istasyonId === null) {
    const kok = uretimIstekKoku(uretimEmriId, is.opNo, malzemeId);
    const onceki = await sorgular.istekleriKoktan(db, kok);
    if (onceki.some((x) => ISTEK_GECIS_KAYNAKLARI.teslim.includes(x.durum))) throw cakisma('Bu malzeme için açık istek var.');
    const miktar = bindenMetin(eksik);
    const yer = kaynak ? ` · bulunduğu yer: ${kaynak.kod}` : '';
    await sorgular.istekAc(db, {
      no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi: `${kok}${onceki.length + 1}`, malzemeId, miktar, istasyonId, uretimEmriId,
      aciklama: `İş malzemesi · emir ${is.emirNo} · OP ${is.opNo}${yer}`.slice(0, 200), kisiId: k.id, durum: istekAcilisDurumu(await depodakiMiktar(db, malzemeId), miktar),
    });
    return isMalzemeleri(db, k, istasyonId);
  }
  // Başka istasyondan alma yalnız emrin rotasındaki istasyondan ve yalnız bu emrin ya da emirsiz partisinden (K2); alma teslim kaydıdır.
  const rota = await adimliEmirAyrintisi(db, uretimEmriId);
  if (kaynak.istasyonId === istasyonId || !rota.isEmirleri.some((i) => i.istasyon?.id === kaynak.istasyonId)) throw dogrulama('Yalnız bu emrin rotasındaki başka bir istasyondan alınır.', 'kaynakKonumId');
  const hedef = await istasyonKonumuBul(db, istasyonId, 'istasyonId');
  const buEmrin = g.buEmrin ?? null;
  const satirlar = (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, kaynak.konumId, uretimEmriId))
    .filter((x) => x.konumId === kaynak.konumId && (buEmrin === null || (x.partiEmriId === uretimEmriId) === buEmrin));
  const alinacaklar = kaynaklardanAl(satirlar, eksik);
  if (alinacaklar.length === 0) throw dogrulama(`${kaynak.kod} yerinde serbest malzeme yok.`, 'kaynakKonumId');
  const acilanKartlar: AcilanKart[] = [];
  for (const [n, a] of alinacaklar.entries()) {
    const kaynakKimligi = `al:${k.id}:${g.kaynakKimligi}:${n}`;
    if (await sorgular.teslimKaynaktan(db, kaynakKimligi)) continue;
    const miktar = bindenMetin(a.miktar);
    let acilan = null as AcilanKart | null;
    const id = await korumali(async () => {
      await serbestDenetle(db, malzemeId, kaynak.konumId, a.partiId, statuId, miktar, 'alınamaz');
      acilan = await emreKartiSagla(db, k.id, { uretimEmriId, partiId: a.partiId, malzemeId });
      return teslimYaz(db, {
        no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId, miktar, partiId: a.partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak.konumId, hedefKonumId: hedef,
        uretimEmriId, istekId: null, aciklama: `İş malzemesi alındı · emir ${is.emirNo} · OP ${is.opNo}`.slice(0, 200), gonderenKisiId: k.id,
      });
    });
    if (id === null) continue;
    if (acilan) acilanKartlar.push(acilan);
    const t = (await sorgular.teslimBul(db, id, true))!;
    await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  }
  return { ...await isMalzemeleri(db, k, istasyonId), ...(acilanKartlar.length > 0 ? { acilanKartlar } : {}) };
}

// Karar 110 b: adımın girdisi istasyonda bir adetlik yokken iş yine başlar. Eksik, başlatmayla aynı işlemde istasyona açılan malzeme
// isteğiyle iz bırakır (Hazırlık'ta depo karşılar ya da iptal eder); stok burada yazılmaz. Sayım yalnız bulunan stoktan düşer, emrin
// stokta tamamlanması eksik varken durur: stok eksiye inmez.
baslatmaDenetle(async (db, o) => {
  const emir = await uretimEmriOzeti(db, o.uretimEmriId);
  if (!emir) return null;
  const eksikler = await eksikIstekleriAc(db, o.kisiId, emir, o.isEmriId, o.istasyonId, 'Malzeme eksikken üretim başladı');
  if (eksikler.length === 0) return null;
  const adlar = eksikler.map((e) => `${e.kod ?? e.ad ?? `#${e.malzemeId}`}${e.istek === null ? '' : ` (istek ${e.istek.no})`}`);
  return { uyari: `Malzeme eksik: ${adlar.join(', ')}. İş başladı; depo isteği karşılayınca stok düzelir.` };
});

// Kutunun rozet sayısı: bana gelen yoldaki teslimler.
export async function gelenTeslimSayisi(db: Db, k: Kullanici): Promise<number> {
  const kapsam = await kapsamOku(db, k.id);
  const istasyonlar = await kapsamdakiIstasyonlar(db, kapsam);
  const sinirsiz = kapsamSuzgeci(kapsam) === null;
  return (await sorgular.yoldakiGelenler(db, sinirsiz ? null : istasyonlar.map((i) => i.id), islemVarMi(k, 'stok.transfer'))).filter((t) => banaGelen(t, k.id)).length;
}

// Emre giden malzeme kartla gider (615-2 a, 633 b). 2931 a (632 a'nın yerine): pencere sorulmaz; emir ve lotun açık kartı yoksa
// kart açılır (lotsuzda istisna kartı), kâğıt Etiket Merkezi bekleyenlerine düşer. Kart çoğunlukla hazırlıkta lot seçilince açılmıştır.
// Açılan kart döner (yalnız kimlik ve etiket): gönderen kullanıcıya söylenir; var olan kart dönmez.
export async function emreKartiSagla(db: Db, kisiId: number, t: { uretimEmriId: number | null; partiId: number | null; malzemeId: number }): Promise<AcilanKart | null> {
  if (t.uretimEmriId === null) return null;
  const emir = await uretimEmriOzeti(db, t.uretimEmriId);
  const lot = t.partiId === null ? null : await sorgular.partiBul(db, t.partiId);
  const tur = kartOnayiTuru(t, lot, emir?.durum ?? null);
  if (tur === null) return null;
  const acik = tur === 'lot' ? await sorgular.acikRefakatPartisi(db, t.uretimEmriId, t.partiId!) : await sorgular.acikIstisnaKarti(db, t.uretimEmriId, t.malzemeId);
  if (acik) return null;
  const id = tur === 'lot' ? await sorgular.refakatPartisiAc(db, { uretimEmriId: t.uretimEmriId, malzemeId: lot!.malzemeId, partiId: t.partiId!, kisiId })
    : await sorgular.istisnaKartiAc(db, { uretimEmriId: t.uretimEmriId, malzemeId: t.malzemeId, kisiId });
  const kart = id === null ? null : await sorgular.refakatPartisiBul(db, id);
  return kart === null ? null : { id: kart.id, etiket: refakatEtiketi(emir?.emirNo ?? null, kart.uretimEmriId, kart.sira) };
}
// Teslim et: stok yazılmaz, kayıt "yolda" açılır; parça olduğu statü ve partiyle gider. Aynı kaynak kimliği ikinci teslim açmaz.
// bolunenParca: bölünen teslimin ilkinden sonraki parçası; isteğin yoldaki teslimi o bölmenin önceki parçasıdır, yeni teslimi engellemez.
export async function teslimGonder(db: Db, k: Kullanici, g: TeslimGonderGovdesi, bolunenParca = false): Promise<TeslimCevabi> {
  const kaynakKimligi = `kisi:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const malzemeId = Number(g.malzemeId);
  await istenebilirKart(db, malzemeId);
  const kapsam = await kapsamOku(db, k.id);
  const kaynak = await yerCoz(db, k, g.kaynak, 'kaynak', true, kapsam);
  let hedef = await yerCoz(db, k, g.hedef, 'hedef', false, kapsam);
  if (kaynak === hedef) throw dogrulama('Kaynak ve hedef aynı.', 'hedef');
  // Bırakınca teslim (Soru 133): depo rafına yalnız depo bırakır; başkasının depoya bıraktığı mal kabul alanına düşer.
  if (g.birak === true && !islemVarMi(k, 'stok.transfer') && ['raf_gozu', 'depo_zemini'].includes((await sorgular.konumBul(db, hedef))?.tur ?? '')) {
    const kabul = await sorgular.ilkKabulKonumu(db);
    if (kabul === null) throw dogrulama('Mal kabul alanı tanımlı değil; depo rafına yalnız depo bırakır.', 'hedef');
    hedef = kabul;
  }
  // Kişiye teslim: kod yeniden doğrulanır, hedef kişinin bulunduğu istasyon olmalıdır (istemcinin yazdığı kişiye güvenilmez).
  const alici = g.aliciKodu == null ? null : await kisiKoduCoz(db, g.aliciKodu, 'aliciKodu');
  if (g.aliciKodu != null && alici === null) throw dogrulama('Kişi kodu tanınmadı.', 'aliciKodu');
  if (alici?.kisiId === k.id) throw dogrulama('Kendinize teslim edemezsiniz; karşıdakinin kodunu okutun.', 'aliciKodu');
  if (alici && !('istasyonId' in g.hedef && Number(g.hedef.istasyonId) === alici.istasyon.id)) throw dogrulama(`${alici.ad ?? 'Kişi'} şu an ${alici.istasyon.ad} istasyonunda; teslim oraya gider.`, 'hedef');
  // Elden teslim (537 a): alıcının gösterdiği kod onay sayılır; teslim Bıraktım gibi hemen kapanır, alıcı taraf vardiya sonuna kadar itiraz eder.
  const birak = g.birak === true || alici !== null;
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const kalite = g.kaliteDurumu ?? 'serbest';
  // Refakat kartıyla teslim (kart #123): lot ve emir karttan gelir; gövdedeki farklıysa yanlış kart okutulmuştur.
  const refakat = g.refakatPartisiId == null ? null : await sorgular.etkinRefakatPartisiBul(db, Number(g.refakatPartisiId));
  if (g.refakatPartisiId != null) {
    if (!refakat) throw dogrulama('Refakat kartı bulunamadı.', 'refakatPartisiId');
    const engel = refakatTeslimEngeli(refakat, { malzemeId, partiId: g.partiId == null ? g.partiId : Number(g.partiId), uretimEmriId: g.uretimEmriId == null ? g.uretimEmriId : Number(g.uretimEmriId) });
    if (engel) throw dogrulama(engel, 'refakatPartisiId');
  }
  let partiId: number | null;
  if (refakat) partiId = refakat.partiId;
  else if (g.partiId !== undefined) partiId = g.partiId === null ? null : Number(g.partiId);
  else {
    const p = partiSec(await sorgular.konumdakiPartiler(db, malzemeId, kaynak, statuId, kalite), undefined);
    if (p.tur === 'secim-gerekli') {
      // 1229 a: miktar partilere en eskiden bölünür (eksiden çevrilen lotsuz parça lotlu parçayla birlikte gider).
      return bolunmusTeslim(db, k, g, kaynak, statuId, kalite);
    }
    partiId = p.partiId;
  }
  let uretimEmriId = refakat?.uretimEmriId ?? (g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId));
  let aciklama = g.not ?? null;
  const istekId = g.istekId === undefined || g.istekId === null ? null : Number(g.istekId);
  if (istekId !== null) {
    // İstek kilitlenir: aynı isteğe eşzamanlı iki teslim açılmaz (STK-H3).
    const istek = await sorgular.istekBul(db, istekId, true);
    if (!istek) throw dogrulama('Malzeme isteği bulunamadı.', 'istekId');
    const hedefIstasyonId = 'istasyonId' in g.hedef ? Number(g.hedef.istasyonId) : null;
    const engel = istekliTeslimEngeli(istek, { malzemeId, hedefIstasyonId, depoIslemi: islemVarMi(k, 'stok.transfer'), yoldaVar: !bolunenParca && await sorgular.yoldaTeslimVarMi(db, istekId) });
    if (engel) throw dogrulama(engel, 'istekId');
    if (refakat && istek.uretimEmriId !== null && istek.uretimEmriId !== refakat.uretimEmriId) throw dogrulama('Malzeme isteği refakat kartının emrine ait değil.', 'refakatPartisiId');
    const fazla = istenenFazlaNotu(istek.miktar, g.miktar);
    if (fazla) aciklama = (aciklama === null ? fazla : `${aciklama} · ${fazla}`).slice(0, 200);
    uretimEmriId ??= istek.uretimEmriId;
  }
  let acilan = null as AcilanKart | null;
  const id = await korumali(async () => {
    await serbestDenetle(db, malzemeId, kaynak, partiId, statuId, bindenMetin(binde(g.miktar)), 'gönderilemez', kalite);
    // Karar bekleyen ve red parça rezerveye girmez (135); yalnız kullanılabilir stok başkasının ayrılmışını yiyebilir.
    if (uretimEmriId !== null && kalite === 'serbest') await rezerveyiAsmasin(db, malzemeId, statuId, uretimEmriId, binde(g.miktar));
    if (!refakat) acilan = await emreKartiSagla(db, k.id, { uretimEmriId, partiId, malzemeId });
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId, miktar: g.miktar, partiId, statuId, kaliteDurumu: kalite, kaynakKonumId: kaynak, hedefKonumId: hedef,
      uretimEmriId, istekId, aciklama: birak ? (aciklama === null ? birakmaNotu(alici !== null) : `${birakmaNotu(alici !== null)} · ${aciklama}`).slice(0, 200) : aciklama,
      gonderenKisiId: k.id, aliciKisiId: alici?.kisiId ?? null, itirazSonu: birak ? await birakmaItirazSuresi(db, hedef, kaynak) : null,
    });
  });
  if (id === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  if (birak) {
    const t = (await sorgular.teslimBul(db, id, true))!;
    await teslimiKapat(db, k.id, t, bindenMetin(binde(t.miktar)), t.surum, 'miktar');
    const hedefIstasyonId = (await sorgular.teslimUclari(db, [hedef]))[0]?.istasyonId ?? null;
    if (hedefIstasyonId !== null) {
      const fiil = alici === null ? 'bırakıldı' : 'elden teslim edildi';
      await bildirimGonder(db, {
        tur: 'stok.birakildi', baslik: `${t.no}: malzeme ${fiil}`, metin: `${t.miktar} ${fiil} (${t.no}). Yanlışsa vardiya sonuna kadar itiraz edin: Okut > Teslim et.`,
        kisiler: (await istasyondakiKisiler(db, hedefIstasyonId)).map((x) => x.kisiId), haric: k.id, kaynakKimlik: t.no,
      });
    }
    return kartliCevap(await teslimOku(db, id), acilan);
  }
  // Serbest ara alanda alan taraf yoktur: bırakılan teslim bırakıldığı an alınmış sayılır, transfer gönderimle yazılır (kart #1289).
  if ((await sorgular.konumBul(db, hedef))?.tur === 'ara_alan') {
    const t = (await sorgular.teslimBul(db, id, true))!;
    await teslimiKapat(db, k.id, t, bindenMetin(binde(t.miktar)), t.surum, 'miktar');
  }
  return kartliCevap(await teslimOku(db, id), acilan);
}
const kartliCevap = (c: TeslimCevabi, acilan: AcilanKart | null): TeslimCevabi => (acilan === null ? c : { ...c, acilanKartlar: [acilan] });
// Bölünen teslimin her parçası kendi partisiyle ayrı kayıttır; kaynak kimliği parça sırasıyla türetilir, aynı istek ikinci kez gelirse
// ilk parçadan tanınır ve aynı kayıtlar döner.
async function bolunmusTeslim(db: Db, k: Kullanici, g: TeslimGonderGovdesi, kaynak: number, statuId: number | null, kalite: KaliteDurumu): Promise<TeslimCevabi> {
  const parcaKimligi = (i: number) => `${g.kaynakKimligi}:${String(i + 1)}`;
  const teslimler: TeslimCevabi['teslim'][] = [];
  for (let i = 0, t = await sorgular.teslimKaynaktan(db, `kisi:${k.id}:${parcaKimligi(0)}`.slice(0, 120)); t; i += 1, t = await sorgular.teslimKaynaktan(db, `kisi:${k.id}:${parcaKimligi(i)}`.slice(0, 120))) {
    teslimler.push((await teslimOku(db, t.id)).teslim);
  }
  if (teslimler.length > 0) return { teslim: teslimler[0]!, ekTeslimler: teslimler.slice(1) };
  const adaylar = (await sorgular.konumdakiPartiMiktarlari(db, Number(g.malzemeId), kaynak, statuId, kalite)).map((x) => ({ partiId: x.partiId, serbest: binde(x.serbest) }));
  const bolme = teslimBolmesi(adaylar, binde(g.miktar));
  if (bolme === null) {
    const toplam = adaylar.reduce((t, x) => t + (x.serbest > 0n ? x.serbest : 0n), 0n);
    throw dogrulama(`Burada ${bindenMetin(toplam)} var; fazlası gönderilemez.`, 'miktar');
  }
  const acilanKartlar: AcilanKart[] = [];
  for (const [i, p] of bolme.entries()) {
    const c = await teslimGonder(db, k, { ...g, kaynakKimligi: parcaKimligi(i), partiId: p.partiId, miktar: bindenMetin(p.miktar) }, i > 0);
    teslimler.push(c.teslim);
    acilanKartlar.push(...(c.acilanKartlar ?? []));
  }
  return { teslim: teslimler[0]!, ekTeslimler: teslimler.slice(1), ...(acilanKartlar.length > 0 ? { acilanKartlar } : {}) };
}
const birakmaNotu = (elden: boolean): string => (elden ? 'Elden teslim, alıcı kodu okutuldu' : 'Bırakıldı, alan onayı yok');
async function teslimAlaniDenetle(db: Db, k: Kullanici, t: TeslimHam): Promise<void> {
  const hedef = (await sorgular.teslimUclari(db, [t.hedefKonumId]))[0];
  let alan: Parameters<typeof teslimAlmaEngeli>[1];
  if (hedef?.istasyonId != null) {
    const ist = await istasyonGetir(db, hedef.istasyonId);
    alan = { tur: 'istasyon', kapsamda: kapsamdaMi(await kapsamOku(db, k.id), ist?.isMerkeziId ?? null) };
  } else alan = { tur: 'depo', depoIslemi: islemVarMi(k, 'stok.transfer') };
  const engel = teslimAlmaEngeli(t.gonderenKisiId === k.id, alan, t.aliciKisiId !== null && t.aliciKisiId !== k.id);
  if (engel) throw yetkiYok(engel);
}
// Kişiye refakat kartıyla gelen lotu kişi lot etiketiyle değil kartla alır (kullanıcı akışı 14:16): lot okutulursa kart söylenir.
export async function kartaBagliLotuReddet(db: Db, k: Kullanici, partiId: number): Promise<void> {
  for (const t of await sorgular.kartliYoldakiTeslimler(db, partiId)) {
    if (!banaGelen(t, k.id) || !(await teslimAlabilir(db, k, t))) continue;
    const r = await sorgular.acikRefakatPartisi(db, t.uretimEmriId!, partiId);
    const etiket = r === null ? null : (await refakatPartileriCevir(db, [r]))[0]!.etiket;
    throw dogrulama(`Bu malzeme ${etiket ?? 'bir'} refakat kartına bağlı; teslim almak için kartı okutun.`, 'kod');
  }
}
export const teslimAlabilir = (db: Db, k: Kullanici, t: TeslimHam): Promise<boolean> =>
  teslimAlaniDenetle(db, k, t).then(() => true, (h: unknown) => { if (h instanceof UygulamaHatasi) return false; throw h; });
async function yoldakiTeslim(db: Db, id: number): Promise<TeslimHam> {
  const t = await sorgular.teslimBul(db, id, true);
  if (!t) throw bulunamadi('Teslim bulunamadı.');
  const engel = teslimKapanisEngeli(t.durum);
  if (engel) throw cakisma(engel);
  return t;
}
// Teslim al: alınan miktar kaynaktan hedefe transfer olarak yazılır (parti ve statü değişmez); kaynakta yetmezse onay istenir.
export async function teslimAl(db: Db, k: Kullanici, id: number, g: TeslimAlGovdesi): Promise<TeslimCevabi> {
  const t = await yoldakiTeslim(db, id);
  await teslimAlaniDenetle(db, k, t);
  await teslimiKapat(db, k.id, t, bindenMetin(binde(g.alinan)), g.surum, 'alinan');
  return teslimOku(db, id);
}
export async function teslimiKapat(db: Db, kisiId: number, t: TeslimHam, miktar: string, surum: number, alan: string): Promise<void> {
  const id = t.id;
  await korumali(async () => {
    const istek = t.istekId === null ? null : await sorgular.istekBul(db, t.istekId, true);
    const fazla = istek === null ? null : istenenFazlaNotu(istek.miktar, miktar);
    const q = t.kaliteDurumu;
    await siraliKilitle(db, { malzemeId: t.malzemeId, konumId: t.kaynakKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q },
      { malzemeId: t.malzemeId, konumId: t.hedefKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q });
    const b = await sorgular.bakiyeKilitle(db, t.malzemeId, t.kaynakKonumId, t.partiId, t.statuId, q);
    const engel = teslimAlimMiktariEngeli(t.miktar, miktar, b?.miktar ?? '0');
    if (engel !== null) throw dogrulama(alan === 'miktar' ? `Kaynakta yeterli stok yok (mevcut ${bindenMetin(binde(b?.miktar ?? '0'))}).` : engel, alan);
    const hareketId = await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: t.malzemeId, miktar, kisiId, partiId: t.partiId, partiSecimi: t.partiId === null ? null : 'kisi',
      kaynakKonumId: t.kaynakKonumId, hedefKonumId: t.hedefKonumId, onayliEksi: false, uretimEmriId: t.uretimEmriId, kaynakStatuId: t.statuId, hedefStatuId: t.statuId,
      kaynakKaliteDurumu: q, hedefKaliteDurumu: q, aciklama: fazla === null ? `Teslim ${t.no}` : `Teslim ${t.no} · ${fazla}`,
    }));
    await bakiyeDegistir(db, { malzemeId: t.malzemeId, konumId: t.kaynakKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q, fark: -binde(miktar) });
    await bakiyeDegistir(db, { malzemeId: t.malzemeId, konumId: t.hedefKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null });
    await surumluGuncelle({
      guncelle: () => sorgular.teslimKapat(db, id, surum, { durum: 'teslim', alinan: miktar, redNedeni: null, hareketId, kisiId }),
      varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
    });
    if (istek) await istegiTeslimlerleKapat(db, kisiId, istek);
  });
}
// İstek, teslimlerinin sonuncusu kapanınca alınanların toplamıyla kapanır; kalanı yeni istek olur. Tek teslimde bu o teslimin alınanıdır;
// bölünen teslimde (1229 a) parçalar ayrı alınır, yolda parça kaldıkça istek açık kalır. Hiçbir parça alınmadıysa istek açık kalır
// (yeniden gönderilir). İstek bu arada iptal edildiyse teslim yine geçerlidir; istek olduğu gibi kalır.
async function istegiTeslimlerleKapat(db: Db, kisiId: number, istek: IstekHam): Promise<void> {
  const t = await sorgular.istegeTeslimler(db, istek.id);
  if (t.yolda || binde(t.alinan) <= 0n || istekGecisEngeli(istek.durum, 'teslim') !== null) return;
  const karsilanan = bindenMetin(binde(t.alinan));
  await sorgular.istekGecir(db, istek.id, istek.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.teslim, durum: 'teslim', karsilanan, kapatanKisiId: kisiId });
  await kalaniAc(db, istek, karsilanan);
}
// Reddedilen ya da iptal edilen teslim bölünen isteğin son yoldaki parçasıysa istek alınan parçalarla kapanır.
export async function istegiYenidenDene(db: Db, kisiId: number, istekId: number | null): Promise<void> {
  const istek = istekId === null ? null : await sorgular.istekBul(db, istekId, true);
  if (istek) await istegiTeslimlerleKapat(db, kisiId, istek);
}
export async function teslimReddet(db: Db, k: Kullanici, id: number, g: TeslimReddetGovdesi): Promise<TeslimCevabi> {
  const t = await yoldakiTeslim(db, id);
  await teslimAlaniDenetle(db, k, t);
  await surumluGuncelle({
    guncelle: () => sorgular.teslimKapat(db, id, g.surum, { durum: 'red', alinan: null, redNedeni: g.neden, hareketId: null, kisiId: k.id }),
    varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
  });
  await istegiYenidenDene(db, k.id, t.istekId);
  return teslimOku(db, id);
}
export async function teslimIptal(db: Db, k: Kullanici, id: number, g: { surum: number }): Promise<TeslimCevabi> {
  const t = await yoldakiTeslim(db, id);
  if (t.gonderenKisiId !== k.id) throw yetkiYok('Teslimi yalnız gönderen iptal eder.');
  await surumluGuncelle({
    guncelle: () => sorgular.teslimKapat(db, id, g.surum, { durum: 'iptal', alinan: null, redNedeni: null, hareketId: null, kisiId: k.id }),
    varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
  });
  await istegiYenidenDene(db, k.id, t.istekId);
  return teslimOku(db, id);
}

// ---- Üretim sayımının stoğa yansıması (kart #1289) --------------------------------------------------------------------------------
// Sağlam sayım girilince parça istasyonun konumuna girer (STK-U1); teslim edilen sayı kilitlidir (STK-U2). Adımın statüsünü Reçete ve
// Rota çözer: stok onu ithal edemez (o stoğu ithal eder), başlangıçta çözücüsünü kaydeder. Kayıt yokken parça statüsüz girer.
// kaliteDurumu: ilk parça kararı beklenirken sayılan parça stoğa karar bekliyor girer (131 b); hatalı parçanın şartlı kabulü şartlı (1211); yoksa serbest.
export interface UretimSayimiYansimasi {
  uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; fark: string; kaliteDurumu?: KaliteDurumu;
  refakatPartisiId?: number | null;
}
// Sayımın refakat kartı (#126): kart emre ait ve açık olmalı, yoksa sayım reddedilir (ret sayımı geri alır). Kartın lotu ve kartla
// sayılmış partiler önce kullanılır; kartsız sayımda liste boştur ve seçim bugünkü gibidir. Birleşmiş kolun kartı birleştiği karta
// yönlenir; kart kendi emrine yazılmışsa (birleşmeden önceki sayımın geri alınması) yönlenmez.
interface SayimKarti { id: number | null; partiler: readonly number[] }
async function sayimKarti(db: Db, uretimEmriId: number, refakatPartisiId: number | null | undefined): Promise<SayimKarti> {
  if (refakatPartisiId === null || refakatPartisiId === undefined) return { id: null, partiler: [] };
  const kendi = await sorgular.refakatPartisiBul(db, refakatPartisiId);
  const r = kendi !== null && kendi.uretimEmriId === uretimEmriId ? kendi : await sorgular.etkinRefakatPartisiBul(db, refakatPartisiId);
  const engel = refakatSayimEngeli(r, uretimEmriId, r === null ? null : (await uretimEmriOzeti(db, uretimEmriId))?.ustEmirId ?? null);
  if (engel !== null || r === null) throw dogrulama(engel ?? 'Refakat kartı bulunamadı.', 'refakatPartisiId');
  return { id: r.id, partiler: await sorgular.refakatStokPartileri(db, await sorgular.refakatSoyu(db, r.id)) };
}
// Soru 126 b: kartla sayımda malzeme kartın dışından düştüyse (kartın lotu istasyonda bitti) çıktı, malzemenin çoğunu veren partinin
// kartına girer: mal kabul lotuysa emrin o lotla açık kartı, yoksa yeni kart açılır; başka kartın çıktısıysa o kart. Not hareketin
// açıklamasına yazılır (depo yeni kartı basar). Kartsız ya da eşlenemeyen (kartsız emir partisi) malzeme kararı değiştirmez.
// Soru 129: kartsız sayımda kart aynı yolla bulunur (not yazılmaz); lotsuz düşüm (ISTISNA) istisna kartının payıdır.
const ISTISNA = 'istisna' as const;
type SarfPayi = Map<number | null | typeof ISTISNA, bigint>;
async function girisKarti(db: Db, y: UretimYazimi, paylar: ReadonlyMap<number | null | typeof ISTISNA, bigint>, istisnaId: number | null): Promise<{ id: number | null; not: string | null }> {
  const kendi = y.kart !== undefined && y.kart.id !== null ? { id: y.kart.id, partiler: y.kart.partiler } : null;
  const kartlar = new Map<string, bigint>();
  for (const [partiId, miktar] of paylar) {
    let k: string | null;
    if (partiId === ISTISNA) k = istisnaId === null ? null : `k:${istisnaId}`;
    else if (kendi !== null && (partiId === null || kendi.partiler.includes(partiId))) k = `k:${kendi.id}`;
    else k = partiId === null ? null : await partininKarti(db, y.uretimEmriId, partiId);
    k ??= kendi === null ? null : `k:${kendi.id}`;
    if (k !== null) kartlar.set(k, (kartlar.get(k) ?? 0n) + miktar);
  }
  const [secilen] = [...kartlar].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  if (secilen === undefined) return { id: kendi?.id ?? null, not: null };
  if (kendi !== null && secilen[0] === `k:${kendi.id}`) return { id: kendi.id, not: null };
  const [tur, deger] = secilen[0].split(':') as ['k' | 'l', string];
  let id = Number(deger);
  if (tur === 'l') {
    const lot = (await sorgular.partiBul(db, id))!;
    id = (await sorgular.acikRefakatPartisi(db, y.uretimEmriId, lot.id))?.id
      ?? await sorgular.refakatPartisiAc(db, { uretimEmriId: y.uretimEmriId, malzemeId: lot.malzemeId, partiId: lot.id, kisiId: y.kisiId })
      ?? (await sorgular.acikRefakatPartisi(db, y.uretimEmriId, lot.id))!.id;
  }
  if (kendi === null) return { id, not: null };
  const [eski, yeni] = await refakatPartileriCevir(db, [(await sorgular.refakatPartisiBul(db, kendi.id))!, (await sorgular.refakatPartisiBul(db, id))!]);
  if (id === istisnaId) return { id, not: `istisna kartı ${yeni!.etiket} (stokta yok; lot bekliyor)` };
  return { id, not: `yeni kart ${yeni!.etiket}, ${yeni!.lotNo ?? 'lot bekliyor'} (${eski!.etiket} lotu bitti; kartı basın)` };
}
// Kartın dışındaki partinin kartı: mal kabul lotu `l:<parti>` (kart açılabilir), emrin kartlı üretim partisi `k:<kart>`; kartsız parti null.
async function partininKarti(db: Db, uretimEmriId: number, partiId: number): Promise<string | null> {
  const p = await sorgular.partiKaynagi(db, partiId);
  if (p === null) return null;
  if (p.uretimEmriId === null) return `l:${partiId}`;
  if (p.refakatPartisiId === null || p.uretimEmriId !== uretimEmriId) return null;
  const r = await sorgular.refakatPartisiBul(db, p.refakatPartisiId);
  return r !== null && r.durum === 'acik' ? `k:${r.id}` : null;
}
// Sıralı listede kartın partileri öne alınır; kalanların sırası korunur.
// istasyon verilirse kart yalnız istasyonun içinde öne alınır: istasyondaki başka lot depodaki kart lotundan önce gelir, çünkü operatör
// istasyondakini işler (kartın lotu istasyonda bitince Soru 126 b: parça o lotun kartına girer).
export const kartOnce = <T extends { partiId: number | null; konumId?: number }>(l: readonly T[], kart: SayimKarti | undefined, istasyon?: number): T[] => {
  if (kart === undefined || kart.partiler.length === 0) return [...l];
  const sira = (x: T) => (istasyon !== undefined && x.konumId !== istasyon ? 2 : 0) + (kart.partiler.includes(x.partiId ?? 0) ? 0 : 1);
  return [...l].sort((a, b) => sira(a) - sira(b));
};
export type AdimStatusuCozucusu = (db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null }) => Promise<number | null>;
// 1476-C: çok katmanlı emirde alt düğümün adımı emrin ürününün rotasında değil, düğümün malzemesinin rotasında kaynak op numarasıyladır.
// Çözücüye düğümün malzemesi, rotadaki numarası ve emir gider; Reçete ve Rota alt parçanın revizyonunu emrin patlatmasında donmuş olandan
// okur (1558 a). Düğümün son adımının çıktısı düğümün malzemesidir: alt parça stoğa girmeden tüketen adıma akar (1482 a). Kök düğümde ve
// tek katmanlı emirde çağrı olduğu gibi geçer.
const dugumlu = (cozucu: AdimStatusuCozucusu, cikti: boolean): AdimStatusuCozucusu => async (db, g) => {
  const d = g.uretimEmriId == null ? undefined : (await emirDugumleri(db, g.uretimEmriId)).get(g.opNo);
  if (d === undefined || d.dugum === '0') return cozucu(db, g);
  if (cikti && d.dugumSonu) return d.malzemeNo;
  return cozucu(db, { malzemeNo: d.malzemeNo, opNo: d.kaynakOpNo, uretimEmriId: g.uretimEmriId });
};
export let adimStatusu: AdimStatusuCozucusu | null = null;
export function adimStatusuCozucusuKaydet(cozucu: AdimStatusuCozucusu): void { adimStatusu = dugumlu(cozucu, false); }
// Adımın çıktı kartı da Reçete ve Rota'dadır (rotanın "çıkan" kalemi); kayıt yokken her adım çıktısız sayılır.
export let adimCiktisi: AdimStatusuCozucusu | null = null;
export function adimCiktisiCozucusuKaydet(cozucu: AdimStatusuCozucusu): void { adimCiktisi = dugumlu(cozucu, true); }
// Statü adları Reçete ve Rota'nındır; stok depocuya kendi ucundan verir (depocunun reçete-rota okuması yok). Kayıt yokken liste boştur
// (kablolama eksik bağda süreci zaten açmaz).
export type StatuListesiCozucusu = (db: Db) => Promise<StatulerCevabi['statuler']>;
let statuListesiCozucu: StatuListesiCozucusu | null = null;
export function statuListesiCozucusuKaydet(cozucu: StatuListesiCozucusu): void { statuListesiCozucu = cozucu; }
export async function statuler(db: Db): Promise<StatulerCevabi> {
  return { statuler: statuListesiCozucu ? await statuListesiCozucu(db) : [] };
}

// 1532 a (1333 a): dal adımında reçete miktarı mamul başınadır, adım mamul başına çarpan kadar parça işler; her girdi adımın kendi dal
// çarpanını bölen olarak taşır (adetMiktari). Çok katmanlı emirde (1476) alt düğümün bileşeni zaten alt parça başınadır: bölen yalnız
// düğümün kendi dal çarpanıdır (emirdeki çarpan / kök başına adet).
type AdimBilgisi = Omit<NonNullable<Awaited<ReturnType<typeof adimUretimBilgisi>>>, 'girdiler' | 'emirAdimlari'> & {
  girdiler: ReceteGirdisi[];
  emirAdimlari: (Omit<NonNullable<Awaited<ReturnType<typeof adimUretimBilgisi>>>['emirAdimlari'][number], 'girdiler'> & { girdiler: ReceteGirdisi[] })[];
};
export async function adimBilgisi(db: Db, isEmriId: number): Promise<AdimBilgisi | null> {
  const b = await adimUretimBilgisi(db, isEmriId);
  if (b === null) return null;
  return bolenliBilgi(b, await emirDugumleri(db, b.uretimEmriId));
}
// adimBilgisi'nin toplu biçimi (1868): iş emri sayısından bağımsız dört okuma.
async function adimBilgileri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, AdimBilgisi>> {
  const ham = await adimUretimBilgileri(db, isEmriIdleri);
  const dugumler = await emirlerinDugumleri(db, [...new Set([...ham.values()].map((b) => b.uretimEmriId))]);
  return new Map([...ham].map(([id, b]) => [id, bolenliBilgi(b, dugumler.get(b.uretimEmriId) ?? new Map())]));
}
function bolenliBilgi(b: NonNullable<Awaited<ReturnType<typeof adimUretimBilgisi>>>, dugumler: Awaited<ReturnType<typeof emirDugumleri>>): AdimBilgisi {
  const bolenli = (opNo: number, carpan: number | null, girdiler: readonly { malzemeNo: number; miktar: string }[]): ReceteGirdisi[] => {
    const bolen = Math.round((carpan ?? 1) / Number(dugumler.get(opNo)?.birimCarpani ?? 1));
    return girdiler.map((g) => (bolen > 1 ? { ...g, bolen } : { ...g }));
  };
  const emirAdimlari = b.emirAdimlari.map((a) => ({ ...a, girdiler: bolenli(a.opNo, a.adetCarpani, a.girdiler) }));
  const kendi = b.emirAdimlari.find((a) => a.opNo === b.opNo);
  return { ...b, emirAdimlari, girdiler: bolenli(b.opNo, kendi?.adetCarpani ?? null, b.girdiler) };
}
// Taşınan, en yakın çıktılı önceki adımın çıktısıdır (bir adet); çıktılı önceki adım yoksa ilk adımın ilk girdisi. Taşınan yoksa null:
// sayım eski yolla (yalnız ürün girişi) yansır.
// Çıktı emrin revizyonundan çözülür (1214 D-8): yürürlükteki rota sonradan değişse de açık emir statüsüyle aynı rotayı okur.
export async function adimTasinani(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number,
): Promise<{ oncekiOpNo: number | null; tasinan: ReceteGirdisi | null; cikti: (opNo: number) => Promise<number | null> }> {
  const cikti = async (opNo: number) => (adimCiktisi === null ? null : adimCiktisi(db, { malzemeNo, opNo, uretimEmriId }));
  const oncekiOpNo = bilgi.oncekiOpNolari.at(-1) ?? null;
  let oncekiCikti: number | null = null;
  for (const op of [...bilgi.oncekiOpNolari].reverse()) {
    oncekiCikti = await cikti(op);
    if (oncekiCikti !== null) break;
  }
  return { oncekiOpNo, tasinan: oncekiCikti !== null ? { malzemeNo: oncekiCikti, miktar: '1' } : bilgi.tasinan, cikti };
}
// Dallı emirde (1348 a) adımın taşıdığı ve öncüllerinden gelen parçalar; öncül listesi olmayan emirde null (adimTasinani geçerli).
// Gelen parça öncülün çıktısıdır (statüsüz, bir adet) ya da öncülün taşıdığı malzemenin öncül statüsündeki hâli; adedi dal çarpanı oranıyla
// (1360): adımın bir adedine öncülden oran kadar parça gelir.
interface GelenParca { opNo: number; malzemeId: number; statuId: number | null; miktar: string; bolen?: number; oran?: GelenOrani }
// kardesler: kaynak ilk iken aynı hammaddeyi ilk girdi olarak taşıyan öbür dal başları (2549 a, mahsup emir geneli birikimle).
interface DalliTasima { kaynak: TasimaKaynagi; tasinan: ReceteGirdisi | null; gelenler: GelenParca[]; kardesler: { opNo: number; girdi: ReceteGirdisi }[] }
export async function dalliTasima(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number,
): Promise<DalliTasima | null> {
  if (bilgi.onculOpNolari === null) return null;
  const dugumler = await emirDugumleri(db, uretimEmriId);
  const zincir = bilgi.emirAdimlari.map((a) => ({ ...a, dugum: dugumler.get(a.opNo)?.dugum ?? null }));
  const cikti = async (opNo: number) => (adimCiktisi === null ? null : adimCiktisi(db, { malzemeNo, opNo, uretimEmriId }));
  const statu = async (opNo: number) => (adimStatusu === null ? null : adimStatusu(db, { malzemeNo, opNo, uretimEmriId }));
  const tasinanlar = new Map<number, ReceteGirdisi | null>();
  const parca = async (opNo: number): Promise<GelenParca | null> => {
    const c = await cikti(opNo);
    if (c !== null) return { opNo, malzemeId: c, statuId: null, miktar: '1' };
    const t = await tasinanOf(opNo);
    return t === null ? null : { opNo, malzemeId: t.malzemeNo, statuId: await statu(opNo), miktar: t.miktar, ...(t.bolen === undefined ? {} : { bolen: t.bolen }) };
  };
  const tasinanOf = async (opNo: number): Promise<ReceteGirdisi | null> => {
    if (tasinanlar.has(opNo)) return tasinanlar.get(opNo)!;
    const k = tasimaKaynagi(zincir, opNo);
    let t: ReceteGirdisi | null = null;
    if (k?.tur === 'ilk') t = k.girdi;
    else if (k?.tur === 'birlesme') t = { malzemeNo: dugumler.get(opNo)?.malzemeNo ?? malzemeNo, miktar: '1' };
    else if (k?.tur === 'oncul') { const p = await parca(k.opNo); t = p === null ? null : { malzemeNo: p.malzemeId, miktar: p.miktar, ...(p.bolen === undefined ? {} : { bolen: p.bolen }) }; }
    tasinanlar.set(opNo, t);
    return t;
  };
  const kaynak = tasimaKaynagi(zincir, bilgi.opNo);
  if (kaynak === null) return null;
  const oncul = kaynak.tur === 'oncul' ? [kaynak.opNo] : kaynak.tur === 'birlesme' ? kaynak.opNolari : [];
  const adim = zincir.find((a) => a.opNo === bilgi.opNo) ?? {};
  const gelenler = (await Promise.all(oncul.map(parca))).filter((p): p is GelenParca => p !== null)
    .map((p) => ({ ...p, oran: gelenOrani(zincir.find((a) => a.opNo === p.opNo) ?? {}, adim) }));
  const ilkGirdi = kaynak.tur === 'ilk' ? kaynak.girdi : null;
  const kardesler = ilkGirdi === null ? [] : zincir.flatMap((a) => {
    if (a.opNo === bilgi.opNo) return [];
    const k = tasimaKaynagi(zincir, a.opNo);
    return k?.tur === 'ilk' && k.girdi !== null && k.girdi.malzemeNo === ilkGirdi.malzemeNo ? [{ opNo: a.opNo, girdi: k.girdi }] : [];
  });
  return { kaynak, tasinan: await tasinanOf(bilgi.opNo), gelenler, kardesler };
}
export async function adimPlaniKur(
  db: Db, uretimEmriId: number, malzemeNo: number, statuId: number | null, bilgi: AdimBilgisi, adet: bigint, onceki = 0n,
): Promise<UretimAdimPlani | null> {
  const dalli = await dalliTasima(db, malzemeNo, bilgi, uretimEmriId);
  if (dalli !== null) {
    if (dalli.tasinan === null && dalli.gelenler.length === 0) return null;
    const cikti = bilgi.sonAdim || adimCiktisi === null ? null : await adimCiktisi(db, { malzemeNo, opNo: bilgi.opNo, uretimEmriId });
    const tasinan = dalli.tasinan ?? { malzemeNo, miktar: '1' };
    const plan = dalliAdimPlani({
      adet, sonAdim: bilgi.sonAdim, statuId, cikti, girdiler: bilgi.girdiler, tasinan, gelenler: dalli.gelenler, kaynak: dalli.kaynak.tur, onceki,
    });
    // 2522 a, 2549 a: dallı adımda mahsup her taşınan malzemenin emir geneli birikimiyle. Aynı hammadde başka dal başının da ilk girdisiyse
    // onun sayılanı eklenir; birleşmeye aynı malzeme iki daldan gelirse ikisinin birikimi toplanır. İhtiyaç emir geneli olduğundan
    // birikim de öyle olmalı; yoksa paralel dalda mahsup hiç tutmaz ve elle verilen iki kez düşer.
    const oncekiTasinanlar = new Map<number, bigint>();
    const ekle = (m: number, x: bigint) => { oncekiTasinanlar.set(m, (oncekiTasinanlar.get(m) ?? 0n) + x); };
    if (dalli.kaynak.tur === 'ilk') {
      ekle(tasinan.malzemeNo, adetMiktari(onceki, tasinan.miktar, tasinan.bolen));
      const sayilan = await adimlarinSayilani(db, uretimEmriId, dalli.kardesler.map((k) => k.opNo));
      for (const k of dalli.kardesler) ekle(k.girdi.malzemeNo, adetMiktari(sayilan.get(k.opNo) ?? 0n, k.girdi.miktar, k.girdi.bolen));
    }
    for (const p of dalli.gelenler) ekle(p.malzemeId, birikimliMiktar(onceki, 0n, p.miktar, p.bolen, p.oran));
    const devam = dalli.kaynak.tur === 'oncul' && plan.cevirme?.tasinan === true ? dalli.gelenler[0] : undefined;
    const araCevirme = devam === undefined ? {} : { araCevirme: {
      onculOpNo: devam.opNo, miktar: devam.miktar, ...(devam.bolen === undefined ? {} : { bolen: devam.bolen }), oncekiTasinan: birikimliMiktar(onceki, 0n, devam.miktar, devam.bolen, devam.oran),
    } };
    return { ...plan, oncekiTasinanlar, ...araCevirme };
  }
  const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
  if (tasinan === null) return null;
  const plan = uretimAdimPlani({
    adet, ilkAdim: oncekiOpNo === null, sonAdim: bilgi.sonAdim, statuId,
    oncekiStatuId: oncekiOpNo === null || adimStatusu === null ? null : await adimStatusu(db, { malzemeNo, opNo: oncekiOpNo, uretimEmriId }),
    oncekiCiktili: oncekiOpNo !== null && (await cikti(oncekiOpNo)) !== null,
    cikti: bilgi.sonAdim ? null : await cikti(bilgi.opNo), girdiler: bilgi.girdiler, tasinan, onceki,
  });
  return { ...plan, oncekiTasinanlar: new Map([[tasinan.malzemeNo, adetMiktari(onceki, tasinan.miktar, tasinan.bolen)]]) };
}

// 1554 a: adımın bu sayımdan önceki toplam adedi (binde, adetMiktari'nin onceki'si). Sayım satırı olaydan önce aynı işlemde yazılır;
// okunan toplam bu sayımı içerir. Sağlam akışı sağlam, karar bekleyen ve red toplamıdır: kalite kararı karar bekleyenden düşüp sağlam ya da
// redde yazar, toplam değişmez (stok da kararda sarf yazmaz). Hurda akışı adımın net hurdasıdır. Artı farkta önceki toplamdan farkı
// düşülmüş hâl, eksi farkta (geri alma) sayım sonrası toplam; ikisinde de geri alınan aralık önce yazılanla aynıdır.
async function oncekiSayilan(db: Db, uretimEmriId: number, isEmriId: number, akis: 'saglam' | 'hurda', fark: bigint): Promise<bigint> {
  const a = (await aralikAdetleri(db, 'is_emri', [isEmriId], '-infinity', 'infinity')).get(isEmriId);
  let toplam = akis === 'hurda' ? a?.hurda ?? 0 : a?.saglam ?? 0;
  if (akis === 'saglam') {
    const k = (await adimKararSayaclari(db, [uretimEmriId])).get(uretimEmriId)?.find((x) => x.isEmriId === isEmriId);
    toplam += (k?.kararBekliyor ?? 0) + (k?.red ?? 0);
  }
  const sonra = BigInt(toplam) * 1000n;
  const once = fark > 0n ? sonra - fark : sonra;
  return once > 0n ? once : 0n;
}
// 2549 a: emrin verilen adımlarının şimdiye kadar sağlam akışında sayılanı (binde, oncekiSayilan'ın toplamı), op no başına. Yalnız
// kardeş dal başı olan dallı emirde okunur.
async function adimlarinSayilani(db: Db, uretimEmriId: number, opNolari: readonly number[]): Promise<Map<number, bigint>> {
  const sonuc = new Map<number, bigint>();
  if (opNolari.length === 0) return sonuc;
  const idler = (await emirlerinIsEmriIdleri(db, [uretimEmriId])).get(uretimEmriId) ?? [];
  const oplar = new Map<number, number>();
  for (const id of idler) { const o = await isEmriOzeti(db, id); if (o !== null && opNolari.includes(o.opNo)) oplar.set(id, o.opNo); }
  if (oplar.size === 0) return sonuc;
  const adetler = await aralikAdetleri(db, 'is_emri', [...oplar.keys()], '-infinity', 'infinity');
  const kararlar = (await adimKararSayaclari(db, [uretimEmriId])).get(uretimEmriId) ?? [];
  for (const [id, opNo] of oplar) {
    const k = kararlar.find((x) => x.isEmriId === id);
    sonuc.set(opNo, BigInt((adetler.get(id)?.saglam ?? 0) + (k?.kararBekliyor ?? 0) + (k?.red ?? 0)) * 1000n);
  }
  return sonuc;
}

// Döner: sayım cevabına giden uyarı (yoksa null); sayım hiçbir uyarıda durmaz.
export async function uretimSayimiYansit(db: Db, g: UretimSayimiYansimasi): Promise<{ uyari: string | null }> {
  const yok = { uyari: null };
  const fark = binde(g.fark);
  if (fark === 0n) return yok;
  const kart = await sayimKarti(db, g.uretimEmriId, g.refakatPartisiId);
  const kalite: KaliteDurumu = g.kaliteDurumu ?? 'serbest';
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (!emir) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  // Adımsız eski emrin kartı yok; mamul ve yarı mamul dışı kart stoğa üretimle girmez (üretim girişiyle aynı kural).
  if (emir.malzemeNo === null) return yok;
  const malzemeId = emir.malzemeNo;
  const o = await malzemeOzeti(db, malzemeId);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return yok;
  const adim = g.isEmriId === null ? null : await isEmriOzeti(db, g.isEmriId);
  const statuId = adim === null || adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: malzemeId, opNo: adim.opNo, uretimEmriId: g.uretimEmriId });
  const konumId = await istasyonKonumuBul(db, g.istasyonId, 'istasyonId');
  const aciklama = `Üretim sayımı · emir ${emir.emirNo}${adim ? ` · OP ${String(adim.opNo)}` : ''}`;
  const bilgi = g.isEmriId === null ? null : await adimBilgisi(db, g.isEmriId);
  const onceki = g.isEmriId === null ? 0n : await oncekiSayilan(db, g.uretimEmriId, g.isEmriId, 'saglam', fark);
  const plan = bilgi === null ? null : await adimPlaniKur(db, g.uretimEmriId, malzemeId, statuId, bilgi, fark > 0n ? fark : -fark, onceki);
  if (plan !== null) {
    const y: UretimYazimi = { uretimEmriId: g.uretimEmriId, kisiId: g.kisiId, konumId, malzemeId, aciklama, kalite, isEmriId: g.isEmriId, kart, uyarilar: new Set() };
    await korumali(async () => { if (fark > 0n) await uretimAdiminiYaz(db, y, plan); else await uretimAdiminiGeriAl(db, y, plan); });
    return { uyari: y.uyarilar!.size === 0 ? null : [...y.uyarilar!].join(' ') };
  }
  // Girdisiz rotada ara adım ürün girmez: emrin ürünü rotanın sonunda çıkar; yoksa her adımın sayımı mamulü yeniden ekler.
  if (bilgi !== null && !bilgi.sonAdim) return yok;
  await korumali(async () => {
    const bakiyeler = kartOnce(await sorgular.istasyondakiEmirBakiyeleri(db, konumId, malzemeId, g.uretimEmriId), kart);
    if (fark > 0n) {
      const plan = sayimArtisPlani(fark, statuId, bakiyeler, kalite);
      for (const d of plan.donusumler) await statuCevir(db, g.kisiId, { malzemeId, konumId, ...d, aciklama, uretimEmriId: g.uretimEmriId });
      if (plan.giris > 0n) {
        const partiId = await uretimPartisi(db, { malzemeId, uretimEmriId: g.uretimEmriId, refakatPartisiId: kart.id, kisiId: g.kisiId });
        const miktar = bindenMetin(plan.giris);
        await sorgular.hareketYaz(db, hareket({
          tur: 'giris', malzemeId, miktar, kisiId: g.kisiId, partiId, partiSecimi: 'giris', hedefKonumId: konumId, hedefStatuId: statuId,
          hedefKaliteDurumu: kalite, girisKaynagi: 'uretim', uretimEmriId: g.uretimEmriId, aciklama,
        }));
        await bakiyeDegistir(db, { malzemeId, konumId, partiId, statuId, kaliteDurumu: kalite, fark: plan.giris });
      }
      return;
    }
    const plan = sayimAzalisPlani(-fark, statuId, bakiyeler, await sorgular.netStatuDonusumleri(db, konumId, malzemeId, g.uretimEmriId, statuId), kalite);
    if (plan === null) {
      const edilen = await sorgular.konumdanTeslimEdilen(db, konumId, g.uretimEmriId);
      throw dogrulama(`${bindenMetin(binde(edilen))} adet teslim edildi; sayı bunun altına düşürülemez.`, 'saglamAdet');
    }
    for (const d of plan.donusumler) await statuCevir(db, g.kisiId, { malzemeId, konumId, ...d, aciklama, uretimEmriId: g.uretimEmriId });
    for (const x of plan.geriAlinacaklar) await uretimGirisiniDus(db, g.kisiId, { malzemeId, konumId, uretimEmriId: g.uretimEmriId, ...x, aciklama });
  });
  return yok;
}
// ---- Hurdanın girdisi (kart G1) ---------------------------------------------------------------------------------------------------
// Terminalde hurdaya ayrılan parçanın taşınan HM'si (reçetedeki adet miktarı, sağlam sayımdaki gibi yukarı yuvarlı) istasyondaki emrin
// stoğundan FİRE ÇIKIŞI olarak düşer; HM serbestte kalmaz. Seçim (ayrılan statüden fire çıkışı) yalnız hurdaHmDus ve hurdaHmGeriAl'dadır.
// Yetmeyen istasyonda eksiye fire yazılır (iş 558); eksi fark (hurda geri alma) bu hurdanın fire çıkışlarını geri alır.
// Parçanın HM'sinin arandığı statüler: önceki adımdan gelen statü, serbest, adım statüsü (ilk adımda önceki statü yoktur).
export interface HurdaSayimiYansimasi {
  uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; hurdaNedeniId: number; fark: string; refakatPartisiId?: number | null;
}
const HURDA_ACIKLAMASI = 'Hurda sayımı';

export async function hurdaSayimiYansit(db: Db, g: HurdaSayimiYansimasi): Promise<{ uyari: string | null }> {
  const yok = { uyari: null };
  const fark = binde(g.fark);
  if (fark === 0n) return yok;
  // Mamul hurdası üretimden giriş fişinin "Hurda" satırıdır; hareket yazılmasa da fiş değişir.
  await sorgular.emirFisiDegisti(db, g.uretimEmriId, 'uretim_girisi');
  if (g.isEmriId === null) return yok;
  const refakat = await sayimKarti(db, g.uretimEmriId, g.refakatPartisiId);
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return yok;
  const o = await malzemeOzeti(db, emir.malzemeNo);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return yok;
  const bilgi = await adimBilgisi(db, g.isEmriId);
  if (bilgi === null) return yok;
  const statuId = adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: emir.malzemeNo, opNo: bilgi.opNo, uretimEmriId: g.uretimEmriId });
  // Hurdaya giden parçalar: dallı emirde (1348 a) birleştirmede her dalın parçası, öteki adımda taşınan; adımın statüsü yalnız taşınanındır.
  const parcalar: { malzemeId: number; miktar: string; bolen?: number; statuler: (number | null)[]; oran?: GelenOrani }[] = [];
  const dalli = await dalliTasima(db, emir.malzemeNo, bilgi, g.uretimEmriId);
  if (dalli?.kaynak.tur === 'birlesme') {
    for (const p of dalli.gelenler) parcalar.push({ malzemeId: p.malzemeId, miktar: p.miktar, bolen: p.bolen, statuler: [p.statuId, null], oran: p.oran });
  } else if (dalli !== null) {
    const p = dalli.gelenler[0];
    if (dalli.tasinan !== null) parcalar.push({ malzemeId: dalli.tasinan.malzemeNo, miktar: dalli.tasinan.miktar, bolen: dalli.tasinan.bolen, statuler: [p?.statuId ?? null, null, statuId], ...(p ? { oran: p.oran } : {}) });
  } else {
    const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, emir.malzemeNo, bilgi, g.uretimEmriId);
    const oncekiStatuId = oncekiOpNo === null || adimStatusu === null || (await cikti(oncekiOpNo)) !== null
      ? null : await adimStatusu(db, { malzemeNo: emir.malzemeNo, opNo: oncekiOpNo, uretimEmriId: g.uretimEmriId });
    if (tasinan !== null) parcalar.push({ malzemeId: tasinan.malzemeNo, miktar: tasinan.miktar, statuler: [oncekiStatuId, null, statuId] });
  }
  const konumId = await istasyonKonumuBul(db, g.istasyonId, 'istasyonId');
  const uyarilar = new Set<string>();
  const onceki = await oncekiSayilan(db, g.uretimEmriId, g.isEmriId, 'hurda', fark);
  for (const p of parcalar) {
    if (!stoklanirMi((await malzemeOzeti(db, p.malzemeId))?.tur ?? '')) continue;
    const y: UretimYazimi = {
      uretimEmriId: g.uretimEmriId, isEmriId: g.isEmriId, kisiId: g.kisiId, konumId, malzemeId: p.malzemeId, aciklama: `${HURDA_ACIKLAMASI} · emir ${emir.emirNo} · OP ${String(bilgi.opNo)}`,
      kart: refakat, uyarilar,
    };
    const miktar = birikimliMiktar(fark > 0n ? fark : -fark, onceki, p.miktar, p.bolen, p.oran);
    if (miktar === 0n) continue;
    await korumali(async () => {
      if (fark > 0n) await hurdaHmDus(db, y, miktar, [...new Set(p.statuler)]);
      else await hurdaHmGeriAl(db, y, miktar);
    });
  }
  return { uyari: uyarilar.size === 0 ? null : [...uyarilar].join(' ') };
}

async function hurdaHmDus(db: Db, y: UretimYazimi, miktar: bigint, statuAdaylari: readonly (number | null)[]): Promise<void> {
  let kalan = miktar;
  for (const statuId of statuAdaylari) {
    if (kalan <= 0n) break;
    const hak = await kullanilabilirStatu(db, y.malzemeId, statuId, y.uretimEmriId, kalan);
    const kaynaklar = kartOnce((await sorgular.uretimGirdiKaynaklari(db, y.malzemeId, statuId, y.konumId, y.uretimEmriId, false, true)).filter((k) => k.konumId === y.konumId), y.kart);
    for (const a of girdiSec(kaynaklar, kalan, hak)) {
      const anahtar = { malzemeId: y.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId, kaliteDurumu: a.kaliteDurumu };
      await siraliKilitle(db, anahtar);
      const eksik = await kilitliEksik(db, anahtar, a.miktar);
      if (eksik > 0n) y.uyarilar?.add(eksiUyarisi(eksik));
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: y.malzemeId, miktar: bindenMetin(a.miktar), kisiId: y.kisiId, partiId: a.partiId, partiSecimi: a.partiId === null ? null : 'en_eski',
        kaynakKonumId: a.konumId, kaynakStatuId: statuId, kaynakKaliteDurumu: a.kaliteDurumu, onayliEksi: eksik > 0n, cikisNedeni: 'fire', uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: y.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: y.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId, kaliteDurumu: a.kaliteDurumu, fark: -a.miktar });
      await rezerveDegistir(db, { malzemeId: y.malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: -a.miktar });
      kalan -= a.miktar;
    }
  }
  // İş 558: istasyonda yetmeyen hurda payı da sayımı durdurmaz; parçanın geldiği statüde eksiye fire yazılır.
  if (kalan > 0n) await istasyondaEksiDus(db, y, y.malzemeId, statuAdaylari[0] ?? null, kalan, 'fire');
}
async function hurdaHmGeriAl(db: Db, y: UretimYazimi, miktar: bigint): Promise<void> {
  await cikislariGeriAl(db, y, y.malzemeId, await sorgular.geriAlinmamisHurdaCikislari(db, y.uretimEmriId, y.malzemeId, y.konumId, HURDA_ACIKLAMASI), miktar, 'fire');
}

// Operatöre uyarı (kart #1289): sayım bu adımda stoktan malzeme düşemeyecekse nedeni; düşebilecekse null. Adımlı ürün emrinde girdisi
// hiç tanımlı değilse (taşınan da yok) sayım yalnız son adımda ürün girer; tanımlı girdi hiçbir yerde serbest değilse sarf yazılamaz.
// stokYok: yalnız stok eksikliği sorulur (sayımda; girdisiz uyarısı başlatmada bir kez söylenir).
export async function uretimGirdiUyarisi(db: Db, g: { uretimEmriId: number; isEmriId: number | null; istasyonId: number; stokYok?: boolean }): Promise<string | null> {
  const uyarilar = [await girdiStokUyarisi(db, g), await kaliteUyarisi(db, g)].filter((x): x is string => x !== null);
  return uyarilar.length === 0 ? null : uyarilar.join(' ');
}
// 135: red ve karar bekleyen parça üretimde durmaz, operatör her sayımda görür. Adımın parçası (numunedeki gibi) istasyonda red ya da
// karar bekliyorsa söylenir; o parçadan yapılan ürün de aynı durumu alır (138 a).
async function kaliteUyarisi(db: Db, g: { uretimEmriId: number; isEmriId: number | null; istasyonId: number }): Promise<string | null> {
  const konumId = await sorgular.kaliteBekleyenIstasyonKonumu(db, g.istasyonId);
  const parca = konumId === null ? null : await adimParcasi(db, g.uretimEmriId, g.isEmriId, 1n);
  if (konumId === null || parca === null) return null;
  const toplam = await sorgular.konumKaliteToplamlari(db, konumId, parca.malzemeId, parca.statuId);
  const red = toplam.find((x) => x.kaliteDurumu === 'red');
  const bekleyen = toplam.find((x) => x.kaliteDurumu === 'karar_bekliyor');
  const parcalar = [
    ...(red ? [`${bindenMetin(binde(red.miktar))} red`] : []),
    ...(bekleyen ? [`${bindenMetin(binde(bekleyen.miktar))} karar bekleyen`] : []),
  ];
  return parcalar.length === 0 ? null : `Bu istasyonda ${parcalar.join(' ve ')} parça var; bu parçadan yapılan ürün de aynı durumu alır. Kalite kararını bekleyin.`;
}
async function girdiStokUyarisi(db: Db, g: { uretimEmriId: number; isEmriId: number | null; istasyonId: number; stokYok?: boolean }): Promise<string | null> {
  if (g.isEmriId === null) return null;
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const urun = await malzemeOzeti(db, emir.malzemeNo);
  if (!urun || (urun.tur !== 'mamul' && urun.tur !== 'yarimamul')) return null;
  const bilgi = await adimBilgisi(db, g.isEmriId);
  if (bilgi === null) return null;
  if (bilgi.tasinan === null && bilgi.girdiler.length === 0) {
    return g.stokYok === true ? null : `OP ${String(bilgi.opNo)}: rotada girdi tanımlı değil; sayım stoktan malzeme düşmez. Reçete ve Rota'da ilk adıma girdi ekleyin.`;
  }
  const kartlar = await malzemeOzetleri(db, [...new Set(bilgi.girdiler.map((x) => x.malzemeNo))]);
  const konumId = (await sorgular.istasyonKonumu(db, g.istasyonId)) ?? 0;
  const yok: string[] = [];
  const teslimsiz: string[] = [];
  for (const m of new Set(bilgi.girdiler.map((x) => x.malzemeNo))) {
    const kart = kartlar.get(m);
    if (!stoklanirMi(kart?.tur ?? '')) continue;
    const kaynaklar = await sorgular.uretimGirdiKaynaklari(db, m, null, konumId, g.uretimEmriId);
    const ad = kart?.kod ?? kart?.ad ?? `#${String(m)}`;
    if (kaynaklar.every((k) => binde(k.serbest) <= 0n)) yok.push(ad);
    else if (!kaynaklar.some((k) => k.konumId === konumId && binde(k.serbest) > 0n)) teslimsiz.push(ad);
  }
  // 562 2 b: istasyona teslim edilmemiş girdi depodan düşülmez, istasyonda eksiye yazılır; operatör bunu başlatmada ve sayımda görür.
  const uyarilar = [
    ...(await tasinanTeslimUyarisi(db, emir.malzemeNo, bilgi, g.uretimEmriId, konumId)),
    ...(yok.length === 0 ? [] : [`OP ${String(bilgi.opNo)}: girdi stokta yok (${yok.join(', ')}); sayım istasyonda istisna kartıyla eksiye düşer. Malzemeyi istasyona teslim ettirin.`]),
    ...(teslimsiz.length === 0 ? [] : [`OP ${String(bilgi.opNo)}: girdi istasyona teslim edilmedi (${teslimsiz.join(', ')}); sayım depodan düşmez, istasyonda istisna kartıyla eksiye düşer. Malzemeyi teslim alın.`]),
  ];
  return uyarilar.length === 0 ? null : uyarilar.join(' ');
}
// İş 558: önceki adımın parçası K2 ve 562 gereği yalnız bu istasyondan alınır. Teslim edilmemişse sayım
// istasyonda eksiye düşer; operatör başlatmada ve sayımda görür.
async function tasinanTeslimUyarisi(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number, konumId: number,
): Promise<string[]> {
  const dalli = await dalliTasima(db, malzemeNo, bilgi, uretimEmriId);
  let gelenler: GelenParca[] = dalli?.gelenler ?? [];
  if (dalli === null) {
    const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
    if (oncekiOpNo === null || tasinan === null) return [];
    const statuId = adimStatusu === null || (await cikti(oncekiOpNo)) !== null ? null : await adimStatusu(db, { malzemeNo, opNo: oncekiOpNo, uretimEmriId });
    gelenler = [{ opNo: oncekiOpNo, malzemeId: tasinan.malzemeNo, statuId, miktar: tasinan.miktar }];
  }
  const uyarilar: string[] = [];
  for (const p of gelenler) {
    const kart = await malzemeOzeti(db, p.malzemeId);
    if (!stoklanirMi(kart?.tur ?? '')) continue;
    const kaynaklar = await sorgular.uretimGirdiKaynaklari(db, p.malzemeId, p.statuId, konumId, uretimEmriId, false, true);
    if (kaynaklar.some((k) => k.konumId === konumId && binde(k.serbest) > 0n)) continue;
    // Önceki adım henüz parça çıkarmadıysa söylenecek bir şey yoktur: parça başka yerde durmalı, statülüde emre ayrılmış olmalı.
    const baskaYerde = (await sorgular.uretimGirdiKaynaklari(db, p.malzemeId, p.statuId, konumId, uretimEmriId, true, false)).some((k) => binde(k.serbest) > 0n);
    if (!baskaYerde || (p.statuId !== null && ((await acikRezerveler(db, p.malzemeId, p.statuId)).get(uretimEmriId) ?? 0n) <= 0n)) continue;
    uyarilar.push(`OP ${String(bilgi.opNo)}: OP ${String(p.opNo)} parçası (${kart?.kod ?? kart?.ad ?? `#${String(p.malzemeId)}`}) bu istasyona teslim edilmedi; sayım istasyonda eksiye düşer. Parçayı teslim alın.`);
  }
  return uyarilar;
}
// kalite: sayımın kalite durumu; ürün bununla tüketilen girdinin en kötüsünü alır (138 a).
export interface UretimYazimi {
  uretimEmriId: number; kisiId: number; konumId: number; malzemeId: number; aciklama: string; kalite?: KaliteDurumu; isEmriId?: number | null; kart?: SayimKarti;
  // Sayım cevabına giden uyarılar (Soru 129, 126 b): sayım durmaz, operatör ne olduğunu ekranda görür (Dal 11 sayım cevabında gösterir).
  uyarilar?: Set<string>;
}
// İş 558, 562: girdi yalnız bu istasyondan düşülür (kartın partileri önce); depo, kabul (fason dönüşü dahil) ve başka istasyon
// aranmaz. Yetmeyen sayımı durdurmaz, istasyonda eksiye yazılır; malzeme istasyona teslim edilince kapanır.
async function uretimKaynaklariSec(db: Db, y: UretimYazimi, malzemeId: number, statuId: number | null, istenen: bigint, hak: bigint) {
  const adaylar = (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, y.konumId, y.uretimEmriId, false, true))
    .filter((k) => k.konumId === y.konumId);
  return girdiSec(kartOnce(adaylar, y.kart), istenen, hak);
}
// Düşümden sonra istasyonda bu girdiden kalan: düşüm yetmediyse kalan başka emre ayrılı olduğu için alınamamıştır (1214 D-7).
async function istasyondaKalanGirdi(db: Db, y: UretimYazimi, malzemeId: number, statuId: number | null): Promise<bigint> {
  return (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, y.konumId, y.uretimEmriId, false, true))
    .filter((k) => k.konumId === y.konumId).reduce((t, k) => t + (binde(k.serbest) > 0n ? binde(k.serbest) : 0n), 0n);
}
// İş 558: istasyonda bulunmayan önceki adım parçası rotadaki miktarla istasyonda lotsuz onaylı eksi düşülür; parça sonradan istasyona
// teslim edilince statünün toplamı düzelir. İstisna kartı yalnız statüsüz sarfındır (lotsuzDus): lota bağlama statülüyü bilmez.
async function istasyondaEksiDus(db: Db, y: UretimYazimi, malzemeId: number, statuId: number | null, miktar: bigint, cikisNedeni: 'uretime_sarf' | 'fire'): Promise<void> {
  const baskaEmreAyrili = await istasyondaKalanGirdi(db, y, malzemeId, statuId);
  await siraliKilitle(db, { malzemeId, konumId: y.konumId, partiId: null, statuId });
  await sorgular.hareketYaz(db, hareket({
    tur: 'cikis', malzemeId, miktar: bindenMetin(miktar), kisiId: y.kisiId, kaynakKonumId: y.konumId, kaynakStatuId: statuId, onayliEksi: true, kaynakKaliteDurumu: 'serbest',
    cikisNedeni, uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: `${y.aciklama} · istasyonda yok, eksiye düşüldü`.slice(0, 200),
  }));
  await bakiyeDegistir(db, { malzemeId, konumId: y.konumId, partiId: null, statuId, kaliteDurumu: 'serbest', fark: -miktar });
  await rezerveDegistir(db, { malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: -miktar });
  y.uyarilar?.add(eksidenUyari({ ilkAdim: false, eksik: miktar, baskaEmreAyrili, fiil: 'düşüldü' }));
}
// Lotsuz eksi düşüm (Soru 129, 131 a): istasyonda partisiz eksi bakiye kalır; hareket emrin o malzemedeki açık istisna kartına bağlanır
// (yoksa açılır). Eksi kişinin sayımıyla yazıldığı için onaylı eksidir. Döner: istisna kartı.
async function lotsuzDus(db: Db, y: UretimYazimi, malzemeId: number, miktar: bigint): Promise<number> {
  const kartId = (await sorgular.acikIstisnaKarti(db, y.uretimEmriId, malzemeId))?.id
    ?? await sorgular.istisnaKartiAc(db, { uretimEmriId: y.uretimEmriId, malzemeId, kisiId: y.kisiId })
    ?? (await sorgular.acikIstisnaKarti(db, y.uretimEmriId, malzemeId))!.id;
  const etiket = (await refakatPartileriCevir(db, [(await sorgular.refakatPartisiBul(db, kartId))!]))[0]!.etiket;
  await siraliKilitle(db, { malzemeId, konumId: y.konumId, partiId: null });
  const hareketId = await sorgular.hareketYaz(db, hareket({
    tur: 'cikis', malzemeId, miktar: bindenMetin(miktar), kisiId: y.kisiId, kaynakKonumId: y.konumId, onayliEksi: true, kaynakKaliteDurumu: 'serbest',
    cikisNedeni: 'uretime_sarf', uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: `${y.aciklama} · stokta yok, istisna kartı ${etiket}`.slice(0, 200),
  }));
  await bakiyeDegistir(db, { malzemeId, konumId: y.konumId, partiId: null, statuId: null, kaliteDurumu: 'serbest', fark: -miktar });
  await rezerveDegistir(db, { malzemeId, statuId: null, uretimEmriId: y.uretimEmriId, fark: -miktar });
  await sorgular.istisnaDusumuYaz(db, kartId, hareketId);
  y.uyarilar?.add(`Stokta yok; istisna kartı ${etiket} açıldı. Depo kartı lota bağlar.`);
  return kartId;
}

async function elleSarfMahsubuOku(db: Db, uretimEmriId: number, malzemeId: number, istenen: bigint): Promise<bigint> {
  const sarf = await sorgular.emrinStatusuzSarfi(db, uretimEmriId, malzemeId);
  if (binde(sarf.elle) <= 0n) return 0n;
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, uretimEmriId)) ?? []).map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut }))).get(malzemeId) ?? null;
  return elleSarfMahsubu({ istenen, elle: binde(sarf.elle), net: binde(sarf.net), ihtiyac });
}
async function tasinanMahsubuOku(db: Db, uretimEmriId: number, malzemeId: number, istenen: bigint, oncekiler: ReadonlyMap<number, bigint> | undefined): Promise<bigint> {
  const oncekiTasinan = oncekiler?.get(malzemeId);
  if (oncekiTasinan === undefined) return 0n;
  const elle = binde((await sorgular.emrinStatusuzSarfi(db, uretimEmriId, malzemeId)).elle);
  if (elle <= 0n) return 0n;
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, uretimEmriId)) ?? []).map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut }))).get(malzemeId) ?? null;
  return tasinanMahsubu({ istenen, elle, oncekiTasinan, ihtiyac });
}
// 2554: dallı ara adımın çevirmesinde mahsup öncülün çevirmediği kadardır (araCevirmeMahsubu). Öncülün istenen çevirmesi kendi sayılanından,
// gerçekleşen çevirmeler hareketten okunur.
async function araCevirmeMahsubuOku(
  db: Db, uretimEmriId: number, c: { malzemeId: number; kaynakStatuId: number; hedefStatuId: number; miktar: bigint }, a: NonNullable<UretimAdimPlani['araCevirme']>,
): Promise<bigint> {
  const elle = binde((await sorgular.emrinStatusuzSarfi(db, uretimEmriId, c.malzemeId)).elle);
  if (elle <= 0n) return 0n;
  const sayilan = (await adimlarinSayilani(db, uretimEmriId, [a.onculOpNo])).get(a.onculOpNo) ?? 0n;
  const akis = await sorgular.emrinStatuAkisi(db, { uretimEmriId, malzemeId: c.malzemeId, oncekiStatuId: c.kaynakStatuId, statuId: c.hedefStatuId });
  return araCevirmeMahsubu({
    istenen: c.miktar, elle, ustFark: adetMiktari(sayilan, a.miktar, a.bolen) - binde(akis.ust), buFark: a.oncekiTasinan - binde(akis.bu),
  });
}
// 2549 a: taşınan sarfların mahsubu malzeme başına bir kez hesaplanır (sarf sırası). Birleşmeye aynı malzeme iki daldan geliyorsa mahsup,
// çevirmesi elle verilen kadar eksik kalan dala (statüde emre ayrılanı istenenden az olana) önce verilir; kalan sırayla. Böylece hangi dal
// sona sayıldıysa onun statüsü sıfırlanır, öbür statüde eksi ya da artık kalmaz. Tek sarflı malzemede önceki hesapla aynıdır.
async function tasinanSarfMahsuplari(db: Db, uretimEmriId: number, plan: UretimAdimPlani): Promise<Map<number, bigint>> {
  const sonuc = new Map<number, bigint>();
  const gruplar = new Map<number, number[]>();
  plan.sarflar.forEach((s, i) => { if (s.statuId !== null && s.tasinan === true) gruplar.set(s.malzemeId, [...(gruplar.get(s.malzemeId) ?? []), i]); });
  for (const [malzemeId, siralar] of gruplar) {
    const toplam = siralar.reduce((t, i) => t + plan.sarflar[i]!.miktar, 0n);
    let kalan = await tasinanMahsubuOku(db, uretimEmriId, malzemeId, toplam, plan.oncekiTasinanlar);
    if (kalan <= 0n) continue;
    if (siralar.length === 1) { sonuc.set(siralar[0]!, kalan); continue; }
    const eksikler = new Map<number, bigint>();
    for (const i of siralar) {
      const s = plan.sarflar[i]!;
      const ayrilan = (await acikRezerveler(db, malzemeId, s.statuId)).get(uretimEmriId) ?? 0n;
      eksikler.set(i, s.miktar > ayrilan ? s.miktar - ayrilan : 0n);
    }
    const ver = (i: number, ust: bigint) => { const m = ust < kalan ? ust : kalan; if (m > 0n) { sonuc.set(i, (sonuc.get(i) ?? 0n) + m); kalan -= m; } };
    for (const i of siralar) ver(i, eksikler.get(i)!);
    for (const i of siralar) ver(i, plan.sarflar[i]!.miktar - (sonuc.get(i) ?? 0n));
  }
  return sonuc;
}
// Artış: girdiler yalnız istasyondan emre sarf edilir, taşınan malzeme adımın statüsüne istasyonda çevrilir; çıktılı
// ve son adımda çıktı (son adımda emrin ürünü) emir partisiyle istasyona girer. Yetmeyen girdi istasyonda eksiye düşülür (iş 558, 562 2 b).
// Döner: konuma giren son hareket (çıktı girişi ya da statü çevirme); yalnız sarf varsa null.
export async function uretimAdiminiYaz(db: Db, y: UretimYazimi, plan: UretimAdimPlani): Promise<number | null> {
  let giren: number | null = null;
  let kalite: KaliteDurumu = y.kalite ?? 'serbest';
  let istisnaId: number | null = null;
  const sarfPayi: SarfPayi = new Map();
  const cevirmePayi: SarfPayi = new Map();
  const pay = (m: SarfPayi, partiId: number | null | typeof ISTISNA, miktar: bigint) => { m.set(partiId, (m.get(partiId) ?? 0n) + miktar); };
  const tasinanMahsuplari = await tasinanSarfMahsuplari(db, y.uretimEmriId, plan);
  for (const [i, s] of plan.sarflar.entries()) {
    const istenen = s.statuId === null ? s.miktar - await elleSarfMahsubuOku(db, y.uretimEmriId, s.malzemeId, s.miktar)
      : s.tasinan === true ? s.miktar - (tasinanMahsuplari.get(i) ?? 0n) : s.miktar;
    if (istenen <= 0n) continue;
    const hak = await kullanilabilirStatu(db, s.malzemeId, s.statuId, y.uretimEmriId, istenen);
    let dusulen = 0n;
    for (const a of await uretimKaynaklariSec(db, y, s.malzemeId, s.statuId, istenen, hak)) {
      const anahtar = { malzemeId: s.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId: s.statuId, kaliteDurumu: a.kaliteDurumu };
      await siraliKilitle(db, anahtar);
      const eksik = await kilitliEksik(db, anahtar, a.miktar);
      if (eksik > 0n) y.uyarilar?.add(eksiUyarisi(eksik));
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: s.malzemeId, miktar: bindenMetin(a.miktar), kisiId: y.kisiId, partiId: a.partiId, partiSecimi: a.partiId === null ? null : 'en_eski',
        kaynakKonumId: a.konumId, kaynakStatuId: s.statuId, kaynakKaliteDurumu: a.kaliteDurumu, onayliEksi: eksik > 0n, cikisNedeni: 'uretime_sarf', uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null,
        aciklama: y.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: s.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId: s.statuId, kaliteDurumu: a.kaliteDurumu, fark: -a.miktar });
      await rezerveDegistir(db, { malzemeId: s.malzemeId, statuId: s.statuId, uretimEmriId: y.uretimEmriId, fark: -a.miktar });
      kalite = enKotuKalite(kalite, a.kaliteDurumu);
      pay(sarfPayi, a.partiId, a.miktar);
      dusulen += a.miktar;
    }
    // Soru 129, 562 2 b: istasyonda yetmeyen hammadde istisna kartıyla, önceki adımın parçası (558) kartsız eksi düşülür; sayım durmaz.
    if (dusulen < istenen && s.statuId === null) {
      istisnaId = await lotsuzDus(db, y, s.malzemeId, istenen - dusulen);
      pay(sarfPayi, ISTISNA, istenen - dusulen);
    } else if (dusulen < istenen) {
      await istasyondaEksiDus(db, y, s.malzemeId, s.statuId, istenen - dusulen, 'uretime_sarf');
      pay(sarfPayi, null, istenen - dusulen);
    }
  }
  const tam = plan.cevirme;
  const c = tam === null ? null : { ...tam, miktar: tam.miktar - (plan.araCevirme !== undefined && tam.kaynakStatuId !== null && tam.hedefStatuId !== null
    ? await araCevirmeMahsubuOku(db, y.uretimEmriId, { ...tam, kaynakStatuId: tam.kaynakStatuId, hedefStatuId: tam.hedefStatuId }, plan.araCevirme)
    : await tasinanMahsubuOku(db, y.uretimEmriId, tam.malzemeId, tam.miktar, plan.oncekiTasinanlar)) };
  if (c !== null && c.miktar > 0n) {
    const hak = await kullanilabilirStatu(db, c.malzemeId, c.kaynakStatuId, y.uretimEmriId, c.miktar);
    let cevrilen = 0n;
    for (const a of await uretimKaynaklariSec(db, y, c.malzemeId, c.kaynakStatuId, c.miktar, hak)) {
      giren = await statuTasi(db, y.kisiId, {
        malzemeId: c.malzemeId, partiId: a.partiId, kaynakKonumId: a.konumId, hedefKonumId: y.konumId, kaynakStatuId: c.kaynakStatuId, hedefStatuId: c.hedefStatuId,
        kaynakKalite: a.kaliteDurumu, hedefKalite: enKotuKalite(kalite, a.kaliteDurumu), miktar: a.miktar, aciklama: y.aciklama, uretimEmriId: y.uretimEmriId,
      });
      kalite = enKotuKalite(kalite, a.kaliteDurumu);
      pay(cevirmePayi, a.partiId, a.miktar);
      cevrilen += a.miktar;
    }
    // İş 558: istasyonda yetmeyen parça lotsuz eksiden çevrilir (kaynak statü eksiye düşer, adım statüsü artar).
    if (cevrilen < c.miktar) {
      const eksik = c.miktar - cevrilen;
      const baskaEmreAyrili = await istasyondaKalanGirdi(db, y, c.malzemeId, c.kaynakStatuId);
      giren = await statuTasi(db, y.kisiId, {
        malzemeId: c.malzemeId, partiId: null, kaynakKonumId: y.konumId, hedefKonumId: y.konumId, kaynakStatuId: c.kaynakStatuId, hedefStatuId: c.hedefStatuId,
        hedefKalite: kalite, miktar: eksik, aciklama: `${y.aciklama} · istasyonda yok, eksiden çevrildi`.slice(0, 200), uretimEmriId: y.uretimEmriId,
      });
      pay(cevirmePayi, null, eksik);
      y.uyarilar?.add(eksidenUyari({ ilkAdim: c.tasinan !== true, eksik, baskaEmreAyrili, fiil: 'çevrildi' }));
    }
  }
  if (plan.giris !== null) {
    const malzemeId = plan.giris.malzemeId ?? y.malzemeId;
    const hedef = await girisKarti(db, y, cevirmePayi.size > 0 ? cevirmePayi : sarfPayi, istisnaId);
    if (hedef.not !== null && hedef.id !== istisnaId) y.uyarilar?.add(`Parça ${hedef.not.charAt(0).toLocaleUpperCase('tr')}${hedef.not.slice(1)} kartına girdi; yeni kartı ve malzemeyi teslim alın.`);
    const partiId = await uretimPartisi(db, { malzemeId, uretimEmriId: y.uretimEmriId, refakatPartisiId: hedef.id, kisiId: y.kisiId });
    const statuId = plan.giris.statuId ?? null;
    giren = await sorgular.hareketYaz(db, hareket({
      tur: 'giris', malzemeId, miktar: bindenMetin(plan.giris.miktar), kisiId: y.kisiId, partiId, partiSecimi: 'giris', hedefKonumId: y.konumId, hedefStatuId: statuId,
      hedefKaliteDurumu: kalite, girisKaynagi: 'uretim', uretimEmriId: y.uretimEmriId, aciklama: hedef.not === null ? y.aciklama : `${y.aciklama} · ${hedef.not}`.slice(0, 200),
    }));
    await bakiyeDegistir(db, { malzemeId, konumId: y.konumId, partiId, statuId, kaliteDurumu: kalite, fark: plan.giris.miktar });
    // Statüye giren ürün, statüye çevrilen parça gibi emre ayrılır (sonraki adım onu kendi rezervesinden alır).
    if (statuId !== null) await rezerveDegistir(db, { malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: plan.giris.miktar });
  }
  return giren;
}

// Azalış artışın tersidir: önce ürün girişi geri alınır (teslim edilen kilitlidir), sonra statü geri çevrilir (istasyonda kalan kadar),
// en son sarflar en yenisinden geri alınır.
async function uretimAdiminiGeriAl(db: Db, y: UretimYazimi, plan: UretimAdimPlani): Promise<void> {
  if (plan.giris !== null) {
    const malzemeId = plan.giris.malzemeId ?? y.malzemeId;
    const statuId = plan.giris.statuId ?? null;
    const p = sayimAzalisPlani(plan.giris.miktar, statuId, kartOnce(await sorgular.istasyondakiEmirBakiyeleri(db, y.konumId, malzemeId, y.uretimEmriId), y.kart), [], y.kalite);
    if (p === null) {
      const edilen = await sorgular.konumdanTeslimEdilen(db, y.konumId, y.uretimEmriId);
      throw dogrulama(`${bindenMetin(binde(edilen))} adet teslim edildi; sayı bunun altına düşürülemez.`, 'saglamAdet');
    }
    for (const x of p.geriAlinacaklar) await uretimGirisiniDus(db, y.kisiId, { malzemeId, konumId: y.konumId, uretimEmriId: y.uretimEmriId, ...x, aciklama: y.aciklama });
    if (statuId !== null) await rezerveDegistir(db, { malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: -plan.giris.miktar });
  }
  const c = plan.cevirme;
  if (c !== null) {
    const q = y.kalite ?? 'serbest';
    const istasyonda = kartOnce((await sorgular.uretimGirdiKaynaklari(db, c.malzemeId, c.hedefStatuId, y.konumId, y.uretimEmriId, false, true))
      .filter((k) => k.konumId === y.konumId), y.kart).sort((a, b) => Number(b.kaliteDurumu === q) - Number(a.kaliteDurumu === q));
    for (const a of kaynaklardanAl(istasyonda, c.miktar)) {
      // 1214 O-1: parça ileri çevrilmeden önceki kalitesine döner; lotsuz eksiden çevrilen serbest eksiyi kapatır.
      const ileri = await sorgular.emrinStatuCevirmeleri(db, {
        uretimEmriId: y.uretimEmriId, malzemeId: c.malzemeId, konumId: y.konumId, partiId: a.partiId, kaynakStatuId: c.kaynakStatuId, hedefStatuId: c.hedefStatuId, hedefKalite: a.kaliteDurumu,
      });
      const kaliteler = geriCevirmeKaliteleri(ileri.ileri.map((h) => ({ miktar: binde(h.miktar), kaynakKalite: h.kaynakKalite })), binde(ileri.geriCevrilen), a.miktar, a.kaliteDurumu);
      for (const k of kaliteler) {
        await statuTasi(db, y.kisiId, {
          malzemeId: c.malzemeId, partiId: a.partiId, kaynakKonumId: y.konumId, hedefKonumId: y.konumId, kaynakStatuId: c.hedefStatuId, hedefStatuId: c.kaynakStatuId,
          kaynakKalite: a.kaliteDurumu, hedefKalite: k.kalite, miktar: k.miktar, aciklama: y.aciklama, uretimEmriId: y.uretimEmriId,
        });
      }
    }
  }
  for (const s of plan.sarflar) await sarfiGeriAl(db, y, s.malzemeId, s.miktar);
}

// Statüdeki malzeme statüye geçiren emre ayrılır (rezerve). Ayrılan konumdan bağımsızdır; yalnız açık emrinki sayılır: emir kapanınca
// ya da iptal edilince ayrılanı kendiliğinden kalkar.
async function acikRezerveler(db: Db, malzemeId: number, statuId: number | null): Promise<Map<number, bigint>> {
  const satirlar = (await sorgular.rezerveler(db, [malzemeId])).filter((r) => r.statuId === statuId);
  const durumlar = await emirDurumlari(db, satirlar.map((r) => r.uretimEmriId));
  const acik = satirlar.filter((r) => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(r.uretimEmriId) ?? ''));
  return new Map(acik.map((r) => [r.uretimEmriId, binde(r.miktar)]));
}
// Emrin bu statüden (null: serbest stoktan) kullanabileceği: toplamdan başka açık emirlere ayrılan düşülür. Emir verilmezse bütün ayrılan
// düşülür.
async function kullanilabilirStatu(db: Db, malzemeId: number, statuId: number | null, uretimEmriId: number | null, istenen: bigint): Promise<bigint> {
  const toplam = binde(await sorgular.statuToplami(db, malzemeId, statuId));
  let diger = 0n;
  for (const [emir, m] of await acikRezerveler(db, malzemeId, statuId)) if (emir !== uretimEmriId) diger += m;
  return rezerveSiniri(toplam, diger, istenen);
}
// Rezerve, kaldırılmadıkça o emrindir: başka emre kullanım, teslim ya da emirsiz çıkış yalnız ayrılmamış kısımdan olur. Yer değiştiren
// teslim (emirsiz) ayrılanı bozmaz; ayrılan konumdan bağımsızdır.
export async function rezerveyiAsmasin(db: Db, malzemeId: number, statuId: number | null, uretimEmriId: number | null, miktar: bigint): Promise<void> {
  // Denetim #35: aynı malzemenin iki eşzamanlı düşümü ayrılmamış miktarı birlikte okuyup ayrılanı yiyemez; ikinci, ilk işlem bitince okur.
  await sorgular.rezerveKilidi(db, malzemeId);
  // Başka emre ayrılan yoksa sınır stok yeterliliğidir (onaylı eksi düşüm dahil), rezerve değil.
  if (![...(await acikRezerveler(db, malzemeId, statuId))].some(([emir, m]) => emir !== uretimEmriId && m > 0n)) return;
  const kullanilabilir = await kullanilabilirStatu(db, malzemeId, statuId, uretimEmriId, miktar);
  if (kullanilabilir < miktar) {
    const yer = statuId === null ? 'Serbest stokta' : 'Bu statüde';
    throw dogrulama(`${yer} ${uretimEmriId === null ? 'emirlere' : 'başka emirlere'} ayrılmamış ${bindenMetin(kullanilabilir)} var; fazlası rezerveli; rezerveyi Stok Merkezi'nde müdür kaldırır.`, 'miktar');
  }
}
export async function rezerveDegistir(db: Db, d: { malzemeId: number; statuId: number | null; uretimEmriId: number | null | undefined; fark: bigint }): Promise<void> {
  if (d.uretimEmriId === undefined || d.uretimEmriId === null || d.fark === 0n) return;
  const r = { malzemeId: d.malzemeId, statuId: d.statuId, uretimEmriId: d.uretimEmriId, miktar: bindenMetin(d.fark < 0n ? -d.fark : d.fark) };
  if (d.fark > 0n) await sorgular.rezerveArtir(db, r);
  else await sorgular.rezerveAzalt(db, r);
}

// ---- Emir açılışında ve mal kabulde serbest stoktan ayırma (kullanıcı kararı 2026-10-15) ----------------------------------------
// Emrin bekleyeni: girdi ihtiyacından emre ayrılan (her statüde) ve emre net sarf edilen düşülür. Yalnız açılışta "Stoktan rezerve et"
// denen açık emir bekler.
async function emrinBekleyeni(db: Db, uretimEmriId: number, yalniz?: number): Promise<Map<number, bigint>> {
  // Tamamlamadaki ihtiyaçla aynı yuvarlanır; yoksa tam rezerve görünen emir tamamlamada 0,001 eksik çıkar.
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, uretimEmriId)) ?? [])
    .filter((x) => yalniz === undefined || x.malzemeNo === yalniz).map((x) => ({ malzemeId: x.malzemeNo, brut: x.brut })));
  const sonuc = new Map<number, bigint>();
  if (ihtiyac.size === 0) return sonuc;
  const ayrilan = await sorgular.rezerveler(db, [...ihtiyac.keys()]);
  for (const [malzemeId, gereken] of ihtiyac) {
    let kapsanan = binde(await sorgular.emrinNetSarfi(db, uretimEmriId, malzemeId));
    for (const r of ayrilan) if (r.malzemeId === malzemeId && r.uretimEmriId === uretimEmriId) kapsanan += binde(r.miktar);
    if (gereken > kapsanan) sonuc.set(malzemeId, gereken - kapsanan);
  }
  return sonuc;
}
async function serbesttenAyir(db: Db, kisiId: number, uretimEmriId: number, malzemeId: number, istenen: bigint, neden: string): Promise<bigint> {
  await sorgular.rezerveKilidi(db, malzemeId);
  const bos = await kullanilabilirStatu(db, malzemeId, null, null, istenen);
  const miktar = bos < istenen ? bos : istenen;
  if (miktar <= 0n) return 0n;
  await sorgular.rezerveArtir(db, { malzemeId, statuId: null, uretimEmriId, miktar: bindenMetin(miktar) });
  await sorgular.rezerveKaydiYaz(db, { malzemeId, statuId: null, uretimEmriId, tur: 'ayir', miktar: bindenMetin(miktar), neden, kisiId });
  return miktar;
}
async function emreRezerveEt(db: Db, kisiId: number, uretimEmriId: number): Promise<void> {
  // Kilitler malzeme sırasıyla alınır: iki işlem aynı malzemeleri ters sırada kilitleyip birbirini beklemez.
  for (const [malzemeId, bekleyen] of [...await emrinBekleyeni(db, uretimEmriId)].sort(([a], [b]) => a - b)) await serbesttenAyir(db, kisiId, uretimEmriId, malzemeId, bekleyen, 'Emir açılışı');
}
// Bekleyen emirler sırası: önce talepte seçilen emir, sonra öncelik (1 acil), termin (boş en sonda), açılış (kimlik sırası).
export async function bekleyenEmirler(db: Db, malzemeId: number, onde: ReadonlySet<number> = new Set()): Promise<{ uretimEmriId: number; emirNo: string; bekleyen: bigint }[]> {
  const adaylar: { uretimEmriId: number; emirNo: string; bekleyen: bigint; oncelik: number; teslim: string | null }[] = [];
  // Talepte seçilen emir, açılışta rezerve istemese de bu malzemeyi bekler: alım onun için yapıldı.
  for (const id of new Set([...await sorgular.rezerveIsteyenEmirler(db), ...onde])) {
    const e = await uretimEmriOzeti(db, id);
    if (!e || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(e.durum)) continue;
    const bekleyen = (await emrinBekleyeni(db, id, malzemeId)).get(malzemeId);
    if (bekleyen !== undefined) adaylar.push({ uretimEmriId: id, emirNo: e.emirNo, bekleyen, oncelik: e.oncelik, teslim: e.teslim });
  }
  return adaylar.sort((a, b) => Number(onde.has(b.uretimEmriId)) - Number(onde.has(a.uretimEmriId)) || a.oncelik - b.oncelik
    || (a.teslim ?? '9999-12-31').localeCompare(b.teslim ?? '9999-12-31') || a.uretimEmriId - b.uretimEmriId);
}
export async function bekleyenlereDagit(db: Db, kisiId: number, malzemeIdler: readonly number[], onde: ReadonlyMap<number, ReadonlySet<number>> = new Map()): Promise<void> {
  for (const malzemeId of [...new Set(malzemeIdler)].sort((a, b) => a - b)) {
    for (const e of await bekleyenEmirler(db, malzemeId, onde.get(malzemeId))) {
      if ((await serbesttenAyir(db, kisiId, e.uretimEmriId, malzemeId, e.bekleyen, 'Mal kabul')) < e.bekleyen) break;
    }
  }
}
// Emir açıldı olayı (sunucu/kablolama.ts bağlar).
export async function emirAcildiYansit(db: Db, olay: { uretimEmriId: number; kisiId: number; stoktanRezerve: boolean }): Promise<void> {
  // Emrin sarf, üretimden giriş ve fire fişi emirle birlikte boş açılır (294 c).
  await sorgular.emirFisleriniAc(db, olay.uretimEmriId);
  if (!olay.stoktanRezerve) return;
  await sorgular.emirRezerveIstegiYaz(db, olay.uretimEmriId, olay.kisiId);
  await emreRezerveEt(db, olay.kisiId, olay.uretimEmriId);
}


export async function rezerveListesi(db: Db, malzemeId: number): Promise<RezervelerCevabi> {
  const satirlar = await sorgular.rezerveler(db, [malzemeId]);
  const durumlar = await emirDurumlari(db, satirlar.map((r) => r.uretimEmriId));
  const acik = satirlar.filter((r) => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(r.uretimEmriId) ?? ''));
  const nolar = await emirNolari(db, acik.map((r) => r.uretimEmriId));
  return { rezerveler: acik.map((r) => ({ statuId: r.statuId, uretimEmriId: r.uretimEmriId, emirNo: nolar.get(r.uretimEmriId) ?? null, miktar: r.miktar })) };
}

// 2547 a (B-2482-12): statüde durup açık hiçbir emre ayrılmamış stok. Rezervesi kaldırılan ya da emri kapanan statülü malzeme buradadır;
// aynı ürün ve OP'nin herhangi bir emri kullanabilir. Plan bunu emir zincirinde görmez; sahte eksik olmasın diye ayrı okunur.
export async function sahipsizStatuluStoklar(db: Db): Promise<SahipsizStatuluCevabi> {
  const stoklar = await sorgular.statuluStoklar(db);
  if (stoklar.length === 0) return { satirlar: [] };
  const rezerveler = (await sorgular.rezerveler(db, [...new Set(stoklar.map((s) => s.malzemeId))])).flatMap((r) => (r.statuId === null ? [] : [{ ...r, statuId: r.statuId }]));
  const durumlar = await emirDurumlari(db, [...new Set(rezerveler.map((r) => r.uretimEmriId))]);
  const sahipsizler = sahipsizStatuluHesapla(
    stoklar.map((s) => ({ ...s, miktar: binde(s.miktar) })),
    rezerveler.map((r) => ({ malzemeId: r.malzemeId, statuId: r.statuId, miktar: binde(r.miktar), emirDurumu: durumlar.get(r.uretimEmriId) ?? null })),
  );
  const malzemeler = [...new Set(sahipsizler.map((s) => s.malzemeId))];
  const kartlar = await malzemeOzetleri(db, malzemeler);
  const izler = new Map((await sorgular.statuSonHareketleri(db, malzemeler)).map((h) => [`${String(h.malzemeId)}:${String(h.statuId)}`, h]));
  const nolar = await emirNolari(db, [...new Set([...izler.values()].flatMap((h) => (h.kaynakEmirId === null ? [] : [h.kaynakEmirId])))]);
  return {
    satirlar: sahipsizler.map((s) => {
      const iz = izler.get(`${String(s.malzemeId)}:${String(s.statuId)}`);
      const kaynakEmirId = iz?.kaynakEmirId ?? null;
      return {
        malzemeId: s.malzemeId, malzemeKod: kartlar.get(s.malzemeId)?.kod ?? null, malzemeAd: kartlar.get(s.malzemeId)?.ad ?? null, statuId: s.statuId,
        kaliteDurumu: s.kaliteDurumu, miktar: bindenMetin(s.miktar), ayrilan: bindenMetin(s.ayrilan), sahipsiz: bindenMetin(s.sahipsiz), konumlar: s.konumlar,
        kaynakEmirId, kaynakEmirNo: kaynakEmirId === null ? null : nolar.get(kaynakEmirId) ?? null, sonHareket: iz?.sonHareket ?? null,
      };
    }),
  };
}

// Elle ayırma: emir açık olmalı ve statü o emrin rotasındaki bir adımın statüsü olmalı; ayrılan, statüde kimseye ayrılmamış kadar olabilir.
export async function rezerveEt(db: Db, kisiId: number, g: RezerveEtKomutu): Promise<RezervelerCevabi> {
  const malzemeId = Number(g.malzemeId), statuId = Number(g.statuId), uretimEmriId = Number(g.uretimEmriId);
  const miktar = binde(g.miktar);
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (!emir || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) throw dogrulama('Açık üretim emri bulunamadı.', 'uretimEmriId');
  const urun = emir.malzemeNo;
  const oplar = urun === null || adimStatusu === null ? [] : (await adimliEmirAyrintisi(db, uretimEmriId)).isEmirleri.map((i) => i.opNo);
  let rotada = false;
  for (const opNo of oplar) if ((await adimStatusu!(db, { malzemeNo: urun!, opNo, uretimEmriId })) === statuId) { rotada = true; break; }
  if (!rotada) throw dogrulama('Bu statü bu emrin rotasında yok; statü ürün ve OP\'ye aittir.', 'statuId');
  await korumali(async () => {
    await sorgular.rezerveKilidi(db, malzemeId);
    const bos = await kullanilabilirStatu(db, malzemeId, statuId, null, miktar);
    if (bos < miktar) throw dogrulama(`Statüde ayrılmamış ${bindenMetin(bos)} var; daha fazlası ayrılamaz.`, 'miktar');
    await sorgular.rezerveArtir(db, { malzemeId, statuId, uretimEmriId, miktar: bindenMetin(miktar) });
    await sorgular.rezerveKaydiYaz(db, { malzemeId, statuId, uretimEmriId, tur: 'ayir', miktar: bindenMetin(miktar), neden: null, kisiId });
  });
  return rezerveListesi(db, malzemeId);
}

// Kaldırılan malzeme statüsünü korur; aynı ürün + OP'nin başka emri kullanabilir.
export async function rezerveKaldir(db: Db, kisiId: number, g: RezerveKaldirKomutu): Promise<RezervelerCevabi> {
  const malzemeId = Number(g.malzemeId), statuId = g.statuId === null ? null : Number(g.statuId), uretimEmriId = Number(g.uretimEmriId);
  await korumali(async () => {
    await sorgular.rezerveKilidi(db, malzemeId);
    const mevcut = (await acikRezerveler(db, malzemeId, statuId)).get(uretimEmriId) ?? 0n;
    if (mevcut <= 0n) throw bulunamadi('Bu emre ayrılmış malzeme yok.');
    const miktar = g.miktar === undefined ? mevcut : binde(g.miktar);
    if (miktar > mevcut) throw dogrulama(`Bu emre ayrılan ${bindenMetin(mevcut)}; daha fazlası kaldırılamaz.`, 'miktar');
    await sorgular.rezerveAzalt(db, { malzemeId, statuId, uretimEmriId, miktar: bindenMetin(miktar) });
    await sorgular.rezerveKaydiYaz(db, { malzemeId, statuId, uretimEmriId, tur: 'kaldir', miktar: bindenMetin(miktar), neden: g.neden, kisiId });
  });
  return rezerveListesi(db, malzemeId);
}

// Statü değişimi, istenirse konum değişimiyle birlikte (önceki adımın çıktısı başka istasyondan alınır). Emir kimliği hareketi emre
// bağlar: Akış Süresi statüde kalışı emrin hareketlerinden okur (tedarikçi partisi emre ait değildir).
async function statuTasi(db: Db, kisiId: number, d: {
  malzemeId: number; partiId: number | null; kaynakKonumId: number; hedefKonumId: number; kaynakStatuId: number | null; hedefStatuId: number | null;
  kaynakKalite?: KaliteDurumu; hedefKalite?: KaliteDurumu; miktar: bigint; aciklama: string; uretimEmriId?: number;
}): Promise<number> {
  const kq = d.kaynakKalite ?? 'serbest', hq = d.hedefKalite ?? 'serbest';
  const kaynak = { malzemeId: d.malzemeId, konumId: d.kaynakKonumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq };
  await siraliKilitle(db, kaynak, { malzemeId: d.malzemeId, konumId: d.hedefKonumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq });
  const id = await sorgular.hareketYaz(db, hareket({
    tur: 'transfer', malzemeId: d.malzemeId, miktar: bindenMetin(d.miktar), kisiId, partiId: d.partiId, partiSecimi: d.partiId === null ? null : 'kisi',
    kaynakKonumId: d.kaynakKonumId, hedefKonumId: d.hedefKonumId, kaynakStatuId: d.kaynakStatuId, hedefStatuId: d.hedefStatuId,
    kaynakKaliteDurumu: kq, hedefKaliteDurumu: hq, onayliEksi: await kilitliEksik(db, kaynak, d.miktar) > 0n, uretimEmriId: d.uretimEmriId ?? null, aciklama: d.aciklama,
  }));
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.kaynakKonumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq, fark: -d.miktar });
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.hedefKonumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq, fark: d.miktar, ilkGiris: new Date().toISOString() });
  if (d.kaynakStatuId !== d.hedefStatuId) {
    await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.kaynakStatuId, uretimEmriId: d.uretimEmriId, fark: -d.miktar });
    await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.hedefStatuId, uretimEmriId: d.uretimEmriId, fark: d.miktar });
  }
  return id;
}

// Emrin sarfı en yenisinden bütün hareket olarak geri alınır; fazlası aynı yerden yeniden sarf edilir. Geri alınacak sarf yoksa bulunan kadarı.
async function sarfiGeriAl(db: Db, y: UretimYazimi, malzemeId: number, miktar: bigint): Promise<void> {
  await cikislariGeriAl(db, y, malzemeId, await sorgular.geriAlinmamisSarflar(db, y.uretimEmriId, malzemeId), miktar, 'uretime_sarf');
}
async function cikislariGeriAl(
  db: Db, y: UretimYazimi, malzemeId: number, cikislar: { id: number; miktar: string; konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu }[],
  miktar: bigint, cikisNedeni: 'uretime_sarf' | 'fire',
): Promise<void> {
  let kalan = miktar;
  for (const h of cikislar) {
    if (kalan <= 0n) break;
    const m = binde(h.miktar);
    const q = h.kaliteDurumu;
    await siraliKilitle(db, { malzemeId, konumId: h.konumId, partiId: h.partiId, statuId: h.statuId, kaliteDurumu: q });
    await sorgular.hareketYaz(db, hareket({
      tur: 'geri_alma', malzemeId, miktar: h.miktar, kisiId: y.kisiId, partiId: h.partiId, partiSecimi: h.partiId === null ? null : 'kisi',
      hedefKonumId: h.konumId, hedefStatuId: h.statuId, hedefKaliteDurumu: q, uretimEmriId: y.uretimEmriId, geriAlinanId: h.id, aciklama: y.aciklama,
    }));
    await bakiyeDegistir(db, { malzemeId, konumId: h.konumId, partiId: h.partiId, statuId: h.statuId, kaliteDurumu: q, fark: m });
    await rezerveDegistir(db, { malzemeId, statuId: h.statuId, uretimEmriId: y.uretimEmriId, fark: m });
    let kalanCikis: number | null = null;
    const istisna = h.partiId === null && await sorgular.istisnaDusumuMu(db, h.id);
    if (m > kalan) {
      kalanCikis = await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId, miktar: bindenMetin(m - kalan), kisiId: y.kisiId, partiId: h.partiId, partiSecimi: h.partiId === null ? null : 'en_eski',
        kaynakKonumId: h.konumId, kaynakStatuId: h.statuId, kaynakKaliteDurumu: q, cikisNedeni, uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: y.aciklama,
        onayliEksi: istisna,
      }));
      await bakiyeDegistir(db, { malzemeId, konumId: h.konumId, partiId: h.partiId, statuId: h.statuId, kaliteDurumu: q, fark: -(m - kalan) });
      await rezerveDegistir(db, { malzemeId, statuId: h.statuId, uretimEmriId: y.uretimEmriId, fark: -(m - kalan) });
    }
    // Lotsuz düşümün istisna kartı bağı kalan çıkışa geçer; tamamı geri alındıysa bağ düşer.
    if (istisna) await sorgular.istisnaDusumuTasi(db, h.id, kalanCikis);
    kalan -= m;
  }
}

// K5 (kart #1413, kullanıcı kararı "İptal, yolda uyarı"): emir bitince ya da iptal olunca açık malzeme istekleri iptal olur. Hazırlık
// listesindeki istek listeye bırakılır (liste kapanınca düşer). Yoldaki teslim kendiliğinden kapanmaz: uyarı yazılır, alan ya da gönderen karar verir.
async function emirKapandi(db: Db, uretimEmriId: number, kisiId: number, neden: string): Promise<void> {
  for (const r of await sorgular.emrinRezerveleriniSil(db, uretimEmriId)) {
    await sorgular.rezerveKaydiYaz(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId, tur: 'kaldir', miktar: r.miktar, neden, kisiId });
  }
  for (const i of await sorgular.emrinAcikIstekleri(db, uretimEmriId)) {
    if (istekListeEngeli(i) !== null) continue;
    await sorgular.istekGecir(db, i.id, i.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.iptal, durum: 'iptal', karsilanan: null, kapatanKisiId: kisiId });
  }
  await sorgular.emrinYoldakiTeslimlerineYaz(db, uretimEmriId, 'Emir kapandı: teslimi alın ya da iptal edin');
}
export const emirBittiYansit = (db: Db, olay: { uretimEmriId: number; kisiId: number }): Promise<void> => emirKapandi(db, olay.uretimEmriId, olay.kisiId, 'Emir bitti');
export const emirIptalYansit = (db: Db, olay: { uretimEmriId: number; kisiId: number }): Promise<void> => emirKapandi(db, olay.uretimEmriId, olay.kisiId, 'Emir iptal edildi');
// Birleşen partinin ayrılanı üretimin sürdüğü üst emre geçer: malzeme başka emre kaymaz. Kaynağın bekleme isteği ve refakat kartları da hedefe geçer.
export async function emirBirlestiYansit(db: Db, olay: { uretimEmriId: number; hedefEmirId: number; kisiId: number }): Promise<void> {
  await refakatKartlariniBirlestir(db, olay.uretimEmriId, olay.hedefEmirId, olay.kisiId);
  const bekliyordu = (await sorgular.rezerveIsteyenEmirler(db)).includes(olay.uretimEmriId);
  const satirlar = await sorgular.emrinRezerveleriniSil(db, olay.uretimEmriId);
  if (bekliyordu) await sorgular.emirRezerveIstegiYaz(db, olay.hedefEmirId, olay.kisiId);
  if (satirlar.length === 0) return;
  const nolar = await emirNolari(db, [olay.uretimEmriId, olay.hedefEmirId]);
  const neden = `Parti birleşti: ${nolar.get(olay.uretimEmriId) ?? olay.uretimEmriId} -> ${nolar.get(olay.hedefEmirId) ?? olay.hedefEmirId}`;
  for (const r of satirlar) {
    await sorgular.rezerveKaydiYaz(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId: olay.uretimEmriId, tur: 'kaldir', miktar: r.miktar, neden, kisiId: olay.kisiId });
    await sorgular.rezerveArtir(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId: olay.hedefEmirId, miktar: r.miktar });
    await sorgular.rezerveKaydiYaz(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId: olay.hedefEmirId, tur: 'ayir', miktar: r.miktar, neden, kisiId: olay.kisiId });
  }
}


// Aynı konumda statü dönüşümü (statuDegistir'in transaction içi hâli; konum ve miktar çağıranda denetlenmiştir).
async function statuCevir(db: Db, kisiId: number, d: {
  malzemeId: number; konumId: number; partiId: number; kaynakStatuId: number | null; hedefStatuId: number | null; kaynakKalite?: KaliteDurumu; hedefKalite?: KaliteDurumu;
  miktar: bigint; aciklama: string; uretimEmriId: number;
}): Promise<void> {
  const kq = d.kaynakKalite ?? 'serbest', hq = d.hedefKalite ?? 'serbest';
  await siraliKilitle(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq }, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq });
  await sorgular.hareketYaz(db, hareket({
    tur: 'transfer', malzemeId: d.malzemeId, miktar: bindenMetin(d.miktar), kisiId, partiId: d.partiId, partiSecimi: 'kisi', kaynakKonumId: d.konumId, hedefKonumId: d.konumId,
    kaynakStatuId: d.kaynakStatuId, hedefStatuId: d.hedefStatuId, kaynakKaliteDurumu: kq, hedefKaliteDurumu: hq, uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
  }));
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq, fark: -d.miktar });
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq, fark: d.miktar, ilkGiris: new Date().toISOString() });
  await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.kaynakStatuId, uretimEmriId: d.uretimEmriId, fark: -d.miktar });
  await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.hedefStatuId, uretimEmriId: d.uretimEmriId, fark: d.miktar });
}

// Sayım azalışı üretim girişinden düşülür: en son girişler bütün olarak geri alınır, fazlası yeniden girilir. Böylece emrin girilen
// üretimi (tamamlamadaki "girilen") ve hareket defteri tutarlı kalır; çıkış nedeni uydurulmaz.
// Giriş hareketi parti ve statüyle seçilir; düşüş bakiyenin bugünkü kalite durumundan yazılır (kalite kararı girişten sonra değişmiş olabilir).
async function uretimGirisiniDus(db: Db, kisiId: number, d: { malzemeId: number; konumId: number; uretimEmriId: number; partiId: number; statuId: number | null; kaliteDurumu?: KaliteDurumu; miktar: bigint; aciklama: string }): Promise<void> {
  const q = d.kaliteDurumu ?? 'serbest';
  const secilen: { id: number; miktar: string }[] = [];
  let toplam = 0n;
  for (const h of await sorgular.geriAlinmamisUretimGirisleri(db, d.konumId, d.partiId, d.statuId)) {
    if (toplam >= d.miktar) break;
    secilen.push(h);
    toplam += binde(h.miktar);
  }
  if (toplam < d.miktar) throw dogrulama('Bu istasyonda düşülecek üretim girişi yok; sayıyı stok sorumlusu düzeltsin.', 'saglamAdet');
  if (toplam > d.miktar) {
    await sorgular.hareketYaz(db, hareket({
      tur: 'giris', malzemeId: d.malzemeId, miktar: bindenMetin(toplam - d.miktar), kisiId, partiId: d.partiId, partiSecimi: 'giris', hedefKonumId: d.konumId,
      hedefStatuId: d.statuId, hedefKaliteDurumu: q, girisKaynagi: 'uretim', uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
    }));
    await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId, kaliteDurumu: q, fark: toplam - d.miktar });
  }
  for (const h of secilen) {
    await sorgular.hareketYaz(db, hareket({
      tur: 'geri_alma', malzemeId: d.malzemeId, miktar: h.miktar, kisiId, partiId: d.partiId, partiSecimi: 'kisi', kaynakKonumId: d.konumId,
      kaynakStatuId: d.statuId, kaynakKaliteDurumu: q, uretimEmriId: d.uretimEmriId, geriAlinanId: h.id, aciklama: d.aciklama,
    }));
    await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId, kaliteDurumu: q, fark: -binde(h.miktar) });
  }
}

// Emrin bu istasyondan teslim edilen miktarı (yoldaki ve alınan); istasyonun konumu yoksa sıfır değil null: hiç teslim olmamıştır.
export async function istasyondanTeslimEdilen(db: Db, g: { uretimEmriId: number; istasyonId: number }): Promise<string | null> {
  const konumId = await sorgular.istasyonKonumu(db, g.istasyonId);
  return konumId === null ? null : bindenMetin(binde(await sorgular.konumdanTeslimEdilen(db, konumId, g.uretimEmriId)));
}
