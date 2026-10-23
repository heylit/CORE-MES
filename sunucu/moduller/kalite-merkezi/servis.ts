import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { Durum as AletDurumu } from '#paylasilan/sozlesme/kalibrasyon.ts';
import type { KaliteKarari } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { KM_GECMIS_SINIRI } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KmDegisiklikCevabi, KmOlcuAletleriCevabi, KmDosyaCevabi, KmGecmisCevabi, KmIlkParcaBekleyenCevabi, KmGeriYukleCevabi, KmKarantinaPartileriCevabi, KmKimlikCevabi, KmOnaylaCevabi, KmOnaylaGovdesi, KmOzetCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { numaraAl } from '../ayarlar/disari.ts';
import { denetimSatiri, dosyaTutamagi } from '../dosya/disari.ts';
import { aletlerVeKayitlari } from '../kalibrasyon/disari.ts';
import { kisiAdlari, kisiBayrakliMi, kisileriListele } from '../kisiler/disari.ts';
import { hareketPartileri, karantinadanBirak, karantinaDisiKonumlar, partiGirisZamanlari, partiKaliteDurumuYap, partileriBul, partilerinRedBakiyeleri, partilerinRedGirisleri } from '../stok/disari.ts';
import { acikEmirler, emirIdleri, emirNolari, kararSayaclari, kararliSayimiSonuclandir } from '../uretim-emirleri/disari.ts';
import {
  CIHAZ_KOLEKSIYONU, GECERSIZ_CIHAZ_ALANI, ILETILER, KM_DOSYA_SINIRI, KM_MODULU, ONAY_ALANI_HATASI, UYGUNSUZLUK_KAPALI, UYGUNSUZLUK_KOLEKSIYONU, geriYuklenecekler, ilkParcaBekleyenleri, izReddi,
  onayAlaniVarMi, onayDegeriGecerliMi, onayDegisiklikleri, onayiGeriAlinmis, onayliFormMu, onayliFormReddi, pinsiz, sunucuOnayi,
  OLCU_ALETI_KAYIT_ADEDI, TEDARIKCI_ASKIDA, TEDARIKCI_KOLEKSIYONU, cihazGecerliMi, kalibrasyonAletKimligi, kalibrasyonCihazi, olcuAletleriListesi, emirCihazlari, kapanmisKayitMi, kaliteSatirlari, redToplami, serbestBirakanNcrMi, serbestBirakmaIstegi, serbestBirakmaPlani, serbestBirakmaSonucu, kalibrasyonHazirligi, karantinaIstegi, yalnizArsivDegisiyor, yeniOlcumCihazlari, yoneticiKoleksiyonuMu,
} from './kurallar.ts';
import { DOF_KOLEKSIYONU, dofDurumu, dofGovdesi, dofIstegiReddi, dofKimligi } from './kurallar.ts';
import type { DofAcIstegi, DofDurumu, DofKaynagi, KalibrasyonHazirligi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const dosyaTutamak = dosyaTutamagi(KM_MODULU);

type DenetimEki = (satirlar: readonly DenetimSecimi[]) => void;
type Govde = Record<string, unknown>;
type SerbestMiktarlar = NonNullable<KmOnaylaGovdesi['serbestMiktarlar']>;

export async function degisiklikler(db: Db, sonra: number): Promise<KmDegisiklikCevabi> {
  const satirlar = await sorgular.degisiklikler(db, sonra);
  const surum = satirlar.length === 0 ? Math.max(sonra, await sorgular.sonSurum(db)) : satirlar[satirlar.length - 1]!.surum;
  return { surum, degisiklikler: satirlar };
}

// Uygulamanın girişi TMI oturumudur: kişi ve yönetici olup olmadığı. Rol verilecek kişilerin listesi yalnız yöneticiye gider
// (uygulamada kullanıcı ve rol kaydını yalnız o yazar).
export async function kimlik(db: Db, kullanici: Kullanici): Promise<KmKimlikCevabi> {
  const yonetici = await kisiBayrakliMi(db, kullanici.id);
  const kisiler = yonetici ? (await kisileriListele(db)).filter((k) => k.aktif).map(({ id, ad }) => ({ id, ad })) : [];
  return { kisi: { id: kullanici.id, ad: kullanici.ad }, yonetici, kisiler, onaylayabilir: islemVarMi(kullanici, 'kalite-merkezi.onayla') };
}

async function yoneticiKoleksiyonunuDenetle(db: Db, kullanici: Kullanici, koleksiyon: string): Promise<void> {
  if (yoneticiKoleksiyonuMu(koleksiyon) && !(await kisiBayrakliMi(db, kullanici.id))) throw yetkiYok(ILETILER.yalnizYonetici);
}

export async function ozet(db: Db): Promise<KmOzetCevabi> {
  return { acikUygunsuzluk: await sorgular.acikKayitSayisi(db, UYGUNSUZLUK_KOLEKSIYONU, UYGUNSUZLUK_KAPALI) };
}

export function kaliteAskisindakiTedarikciler(db: Db): Promise<{ kimlik: string; kod: string | null; ad: string }[]> {
  return sorgular.onayiOlanlar(db, TEDARIKCI_KOLEKSIYONU, TEDARIKCI_ASKIDA);
}

// Beklenen sürüm null ise kayıt yok sayılır: dolu kayıt varsa 409. Sayıysa dolu kaydın sürümü o olmalıdır; arada yazılmış ya
// da silinmişse 409, hiç olmayan kayıtsa 404. Kilit yazanları sıraya dizdiği için denetim ile yazma arasında başkası giremez.
// Genel yazma onay ve kapanış alanlarını değiştiremez; reddin alanı köprüye onay ucunu gösterir.
export async function yaz(
  db: Db, kullanici: Kullanici, koleksiyon: string, kimlik: string, govde: Govde, beklenen: number | null,
): Promise<{ surum: number }> {
  return kayitYaz(db, kullanici, koleksiyon, kimlik, govde, beklenen, false);
}

// Onay ucu: kayıt yazmanın onay ve kapanış alanlarını da değiştirebilen biçimi. Kaydın içeriğini de yazdığı için kayıt yazma
// işlemini de ister. Form onayının kişisi ve günü sunucudan gelir.
// Kapanan NCR karantinadaki partiyi serbest bırakıyorsa ve partinin karantinadan önceki konumu bilinmiyorsa hedef konum burada gelir.
export async function onayla(
  db: Db, kullanici: Kullanici, koleksiyon: string, kimlik: string, govde: Govde, beklenen: number | null, karantinaHedefKonumId?: number | null,
  serbestMiktarlar?: SerbestMiktarlar,
): Promise<KmOnaylaCevabi> {
  if (!islemVarMi(kullanici, 'kalite-merkezi.yaz')) throw yetkiYok();
  if (!onayAlaniVarMi(koleksiyon)) throw dogrulama(ILETILER.onayDegeri, 'koleksiyon');
  if (!onayDegeriGecerliMi(koleksiyon, govde)) throw dogrulama(ILETILER.onayDegeri, 'govde');
  return kayitYaz(db, kullanici, koleksiyon, kimlik, govde, beklenen, true, karantinaHedefKonumId ?? null, serbestMiktarlar ?? []);
}

const onayKisisi = (kullanici: Kullanici): { ad: string; gun: string; saat: string } => {
  const an = Date.now();
  return { ad: kullanici.ad, gun: tesisGunu(an), saat: tesisSaati(an) };
};

// Onaylı formun onayını geri alır: form taslağa döner, geri alan ve saati sunucudan yazılır. Beklenen sürüm kuralı yazmayla aynıdır.
export async function onayGeriAl(db: Db, kullanici: Kullanici, kimlik: string, beklenen: number): Promise<{ surum: number }> {
  await sorgular.yazmaKilidi(db);
  const onceki = await sorgular.kayitGovdesi(db, 'frm', kimlik);
  if (onceki === null) throw bulunamadi(ILETILER.formYok);
  if (!onayliFormMu('frm', onceki)) throw cakisma(ILETILER.onayliDegil);
  const govde = sunucuOnayi('frm', onceki, onayiGeriAlinmis(onceki, new Date().toISOString()), onayKisisi(kullanici));
  const surum = await surumluGuncelle({
    guncelle: () => sorgular.surumluYaz(db, 'frm', kimlik, govde, kullanici.id, beklenen),
    varMi: () => sorgular.satirVarMi(db, 'frm', kimlik),
  });
  return { surum };
}

// KM-K85, KM-K88: yeni ölçümün cihazı bugün kalibrasyon modülünde geçerli olmalıdır; geçersiz cihazlar ayrıntıda döner.
async function olcumCihazlariniDenetle(db: Db, koleksiyon: string, onceki: Govde | null, govde: Govde): Promise<void> {
  const ids = yeniOlcumCihazlari(koleksiyon, onceki, govde);
  if (ids.length === 0) return;
  const aletler = await aletlerVeKayitlari(db, 0);
  const durumlar = aletDurumlari(aletler);
  const gecersiz: string[] = [];
  for (const id of ids) {
    if (!cihazGecerliMi(await cihazKaydi(db, id, aletler), durumlar)) gecersiz.push(id);
  }
  if (gecersiz.length > 0) throw dogrulama(ILETILER.gecersizCihaz, GECERSIZ_CIHAZ_ALANI, { cihazlar: gecersiz });
}

const aletDurumlari = (aletler: readonly { no: string; durum: AletDurumu }[]): Map<string, AletDurumu> => new Map(aletler.map((a) => [a.no, a.durum]));

// 329 a: `kal-<alet>` kimlikli cihazın kaydı yoktur, Kalibrasyondaki aletten kurulur; öteki kimlikler uygulamanın eski `dev` kaydıdır.
async function cihazKaydi(db: Db, kimlik: string, aletler: readonly { id: number; no: string }[]): Promise<Govde | null> {
  const aletId = kalibrasyonAletKimligi(kimlik);
  return aletId === null ? sorgular.kayitGovdesi(db, CIHAZ_KOLEKSIYONU, kimlik) : kalibrasyonCihazi(aletler, aletId);
}

// 329 a: uygulamanın cihaz listesi. Ölçü aletlerinin tek kaynağı Kalibrasyondur; eski `dev` kayıtları silinmez (kimlikleri ölçümlerde durur).
export async function olcuAletleri(db: Db): Promise<KmOlcuAletleriCevabi> {
  const aletler = await aletlerVeKayitlari(db, OLCU_ALETI_KAYIT_ADEDI);
  return { cihazlar: olcuAletleriListesi(aletler, await sorgular.koleksiyonKayitlari(db, CIHAZ_KOLEKSIYONU)) };
}

// KM-K88: emir başına kalibrasyon hazırlığı; istenen her emir haritada olur, bilinmeyen emir cihazsız sayılır.
export async function kalibrasyonHazirlikDurumlari(db: Db, emirIdler: readonly number[]): Promise<Map<number, KalibrasyonHazirligi>> {
  const tekil = [...new Set(emirIdler)];
  if (tekil.length === 0) return new Map();
  const nolar = await emirNolari(db, tekil);
  const muayeneler = await sorgular.emirMuayeneleri(db, [...new Set(nolar.values())]);
  const emirBasina = new Map<number, string[]>(tekil.map((id) => {
    const no = nolar.get(id);
    return [id, no === undefined ? [] : emirCihazlari(muayeneler.filter((m) => m.emirNo === no).map((m) => m.govde))];
  }));
  const tumCihazlar = [...new Set([...emirBasina.values()].flat())];
  const cihazlar = new Map((await sorgular.kayitGovdeleri(db, CIHAZ_KOLEKSIYONU, tumCihazlar.filter((id) => kalibrasyonAletKimligi(id) === null))).map((c) => [c.kimlik, c.govde]));
  const aletler = tumCihazlar.length === 0 ? [] : await aletlerVeKayitlari(db, 0);
  for (const id of tumCihazlar) {
    const aletId = kalibrasyonAletKimligi(id);
    const cihaz = aletId === null ? null : kalibrasyonCihazi(aletler, aletId);
    if (cihaz !== null) cihazlar.set(id, cihaz);
  }
  const durumlar = aletDurumlari(aletler);
  return new Map([...emirBasina].map(([id, ids]) => [id, kalibrasyonHazirligi(ids, cihazlar, durumlar)]));
}

async function kayitYaz(
  db: Db, kullanici: Kullanici, koleksiyon: string, kimlik: string, govde: Govde, beklenen: number | null, onay: boolean,
  karantinaHedefKonumId: number | null = null, serbestMiktarlar: SerbestMiktarlar = [],
): Promise<KmOnaylaCevabi> {
  await yoneticiKoleksiyonunuDenetle(db, kullanici, koleksiyon);
  govde = pinsiz(koleksiyon, govde);
  await sorgular.yazmaKilidi(db);
  const onceki = await sorgular.kayitGovdesi(db, koleksiyon, kimlik);
  const ret = izReddi(koleksiyon, 'yaz', onceki !== null);
  if (ret !== null) throw cakisma(ILETILER[ret]);
  // 228 a: arşivleme kilitli içeriği değiştirmez; kilidin yerine yönetici denetlenir.
  const kilitliArsiv = (onayliFormMu(koleksiyon, onceki) || kapanmisKayitMi(koleksiyon, onceki)) && yalnizArsivDegisiyor(onceki, govde);
  if (kilitliArsiv && !(await kisiBayrakliMi(db, kullanici.id))) throw yetkiYok(ILETILER.arsivYonetici);
  if (!kilitliArsiv && onayliFormReddi(koleksiyon, onceki, govde)) throw cakisma(ILETILER.onayliForm);
  if (!kilitliArsiv && kapanmisKayitMi(koleksiyon, onceki)) throw cakisma(ILETILER.kapanmisKayit);
  const degisen = onayDegisiklikleri(koleksiyon, onceki, govde);
  if (!onay && degisen.length > 0) {
    throw new UygulamaHatasi('YETKI_YOK', ILETILER.onayUcu, { alan: ONAY_ALANI_HATASI, ayrinti: { alanlar: degisen } });
  }
  if (onay && degisen.length > 0) govde = sunucuOnayi(koleksiyon, onceki, govde, onayKisisi(kullanici));
  await olcumCihazlariniDenetle(db, koleksiyon, onceki, govde);
  let surum: number;
  if (beklenen === null) {
    const yeni = await sorgular.yeniYaz(db, koleksiyon, kimlik, govde, kullanici.id);
    if (yeni === null) throw eskiSurum();
    surum = yeni;
  } else {
    const yazilan = govde;
    surum = await surumluGuncelle({
      guncelle: () => sorgular.surumluYaz(db, koleksiyon, kimlik, yazilan, kullanici.id, beklenen),
      varMi: () => sorgular.satirVarMi(db, koleksiyon, kimlik),
    });
  }
  const istek = karantinaIstegi(koleksiyon, onceki, govde);
  if (istek !== null) await karantinayaAl(db, kullanici.id, kimlik, govde, istek);
  if (!serbestBirakmaIstegi(koleksiyon, onceki, govde)) return { surum };
  const uyari = await karantinadanSerbestBirak(db, kullanici.id, kimlik, govde, karantinaHedefKonumId, serbestMiktarlar);
  return uyari === null ? { surum } : { surum, uyari };
}


// NCR'nin lotu ya da emrinin stoktaki partileri. Bulunamayan emir numarası yok sayılır (lot varsa lotla aranır).
async function ncrPartileri(db: Db, anahtar: { lotNo: string | null; emirNo: string | null }): Promise<{ partiler: number[]; uretimEmriId: number | null }> {
  const uretimEmriId = anahtar.emirNo === null ? undefined : (await emirIdleri(db, [anahtar.emirNo])).get(anahtar.emirNo);
  const lotNo = anahtar.lotNo ?? undefined;
  if (uretimEmriId === undefined && lotNo === undefined) return { partiler: [], uretimEmriId: null };
  return { partiler: await partileriBul(db, { lotNo, uretimEmriId }), uretimEmriId: uretimEmriId ?? null };
}

const ncrNo = (kimlik: string, govde: Govde): string => (typeof govde.no === 'string' && govde.no.trim() !== '' ? govde.no.trim() : kimlik);

// 229 a: açık NCR'nin lotu ya da emri stokta partiye uyarsa partinin bütün bakiyesi red olur, parça yerinde kalır (135); her
// hareket defterde NCR'ye bağlanır. Hiç parti uymazsa stok değişmez.
async function karantinayaAl(
  db: Db, kisiId: number, kimlik: string, govde: Govde, istek: { lotNo: string | null; emirNo: string | null },
): Promise<void> {
  const { partiler, uretimEmriId } = await ncrPartileri(db, istek);
  for (const partiId of partiler) {
    const degisen = await partiKaliteDurumuYap(db, kisiId, { partiId, hedef: 'red', aciklama: `Uygunsuzluk ${ncrNo(kimlik, govde)} karantinası`, uretimEmriId });
    for (const d of degisen) await sorgular.karantinaYaz(db, kimlik, d.hareketId, kisiId);
  }
}

// KM-K90: kapanan NCR'nin partileri (defterindekiler ile lotunun ya da emrinin partileri) serbest olur. Partinin bugünkü redini
// oluşturan her giriş bırakılabilir bir NCR'nin defterinde olmalıdır: ilk parça reddi gibi NCR dışı red ya da başka açık NCR'nin
// lotuna veya emrine uyma partiyi tutar, nedeni kapanışın uyarısında tek satır döner. Karantina konumundaki bakiye önce karantinadan
// çıkar (hedef verilmezse önceki konumuna; o bilinmiyorsa stok reddeder ve kapanış da yazılmaz), sonra kalite serbest yazılır.
async function karantinadanSerbestBirak(
  db: Db, kisiId: number, kimlik: string, govde: Govde, hedefKonumId: number | null, serbestMiktarlar: SerbestMiktarlar,
): Promise<string | null> {
  const { partiler, kalanlar } = await birakilacakPartiler(db, kimlik, govde);
  const miktarlar = new Map(serbestMiktarlar.map((m) => [m.partiId, m.miktar]));
  if ([...miktarlar.keys()].some((p) => !partiler.includes(p))) throw dogrulama(ILETILER.serbestMiktarParti, 'serbestMiktarlar');
  const aciklama = `Uygunsuzluk ${ncrNo(kimlik, govde)} MRB kararı: ${metinAlani(govde.mrb) ?? ''}`;
  const redler = miktarlar.size === 0 ? new Map() : await partilerinRedBakiyeleri(db, [...miktarlar.keys()]);
  for (const partiId of partiler) {
    const miktar = miktarlar.get(partiId);
    if (miktar === undefined) {
      await karantinadanBirak(db, kisiId, { partiId, hedefKonumId, aciklama });
      await partiKaliteDurumuYap(db, kisiId, { partiId, hedef: 'serbest', aciklama });
      continue;
    }
    // 320 a: yalnız verilen miktar serbest olur; önce karantina konumundan çıkar, kalanı yerinde duran redden çevrilir.
    const plan = serbestBirakmaPlani(redler.get(partiId) ?? [], miktar);
    if ('ret' in plan) throw dogrulama(ILETILER[plan.ret], 'serbestMiktarlar');
    const tasinan = plan.karantinadan === null ? [] : await karantinadanBirak(db, kisiId, { partiId, hedefKonumId, aciklama, miktar: plan.karantinadan, kaliteDurumu: 'red' });
    await partiKaliteDurumuYap(db, kisiId, { partiId, hedef: 'serbest', aciklama, satirlar: kaliteSatirlari(tasinan, plan.yerinde) });
  }
  return kalanlar.size === 0 ? null : [...kalanlar].join(' ');
}

// KM-K90: kapanan NCR'nin bırakabileceği partiler; bırakılamayanların nedeni (NCR dışı red, başka açık NCR) tek satırlık uyarıdır.
async function birakilacakPartiler(db: Db, kimlik: string, govde: Govde): Promise<{ partiler: number[]; kalanlar: Set<string> }> {
  const defter = await sorgular.karantinaDefteri(db);
  const kendi = new Set((await hareketPartileri(db, defter.filter((d) => d.ncrKimlik === kimlik).map((d) => d.hareketId))).values());
  const anahtar = { lotNo: metinAlani(govde.lot), emirNo: metinAlani(govde.emir) };
  const adaylar = [...new Set([...kendi, ...(await ncrPartileri(db, anahtar)).partiler])].sort((x, y) => x - y);
  const kalanlar = new Set<string>();
  if (adaylar.length === 0) return { partiler: [], kalanlar };
  const birakilabilen = new Set(defter.filter((d) => serbestBirakanNcrMi(d.ncrKimlik, d.govde, kimlik)).map((d) => d.hareketId));
  const tutulan = new Set<number>();
  for (const a of await sorgular.acikNcrAnahtarlari(db, kimlik, UYGUNSUZLUK_KAPALI)) {
    for (const p of (await ncrPartileri(db, a)).partiler) tutulan.add(p);
  }
  const redGirisleri = await partilerinRedGirisleri(db, adaylar);
  const partiler: number[] = [];
  for (const partiId of adaylar) {
    const sonuc = serbestBirakmaSonucu(redGirisleri.get(partiId) ?? [], birakilabilen, tutulan.has(partiId));
    if (sonuc === 'acikNcr') kalanlar.add(ILETILER.karantinadaAcikNcr);
    if (sonuc === 'ncrDisiRed') kalanlar.add(ILETILER.karantinadaNcrDisiRed);
    if (sonuc === 'birak') partiler.push(partiId);
  }
  return { partiler, kalanlar };
}

// 320 a: kapanış penceresinin parti listesi; kayıtlı NCR'nin bugün bırakabileceği partiler ve kullanılabilir red miktarları.
export async function karantinaPartileri(db: Db, kimlik: string): Promise<KmKarantinaPartileriCevabi> {
  const govde = await sorgular.kayitGovdesi(db, UYGUNSUZLUK_KOLEKSIYONU, kimlik);
  if (govde === null) return { partiler: [] };
  const { partiler } = await birakilacakPartiler(db, kimlik, govde);
  const redler = await partilerinRedBakiyeleri(db, partiler);
  const girisler = await partiGirisZamanlari(db, partiler);
  return {
    partiler: partiler.map((partiId) => ({ partiId, lotNo: girisler.get(partiId)?.lotNo ?? null, redMiktar: redToplami(redler.get(partiId) ?? []) })),
  };
}

const metinAlani = (d: unknown): string | null => (typeof d === 'string' && d.trim() !== '' ? d.trim() : null);

// Beklenen sürüm null ise silinecek kayıt yok sayılır: kayıt doluysa (başkası arada açtıysa) 409, değilse akış değişmez.
export async function sil(
  db: Db, kullanici: Kullanici, koleksiyon: string, kimlik: string, beklenen: number | null,
): Promise<{ surum: number }> {
  const ret = izReddi(koleksiyon, 'sil', false);
  if (ret !== null) throw yetkiYok(ILETILER[ret]);
  await yoneticiKoleksiyonunuDenetle(db, kullanici, koleksiyon);
  await sorgular.yazmaKilidi(db);
  const onceki = await sorgular.kayitGovdesi(db, koleksiyon, kimlik);
  if (onayliFormReddi(koleksiyon, onceki, null)) throw cakisma(ILETILER.onayliForm);
  if (kapanmisKayitMi(koleksiyon, onceki)) throw cakisma(ILETILER.kapanmisKayit);
  if (beklenen === null) {
    if (await sorgular.doluMu(db, koleksiyon, kimlik)) throw eskiSurum();
    return { surum: await sorgular.sonSurum(db) };
  }
  const surum = await surumluGuncelle({
    guncelle: () => sorgular.sil(db, koleksiyon, kimlik, kullanici.id, beklenen),
    varMi: () => sorgular.satirVarMi(db, koleksiyon, kimlik),
  });
  return { surum };
}

// Yedek parça parça gelir; her parça yazılır, yedekte olmayan kayıtlar yalnız son parçada silinir: başlangıç sürümünden sonra
// yazılmamış (yedekte olmayan ya da o arada başkasının yazmadığı) iz dışı kayıtlar. Yedekteki iz kayıtları alınmaz.
export async function geriYukle(
  db: Db, kullanici: Kullanici, baslangic: number | null, son: boolean,
  belgeler: readonly { koleksiyon: string; kimlik: string; govde: Govde }[],
): Promise<KmGeriYukleCevabi> {
  await sorgular.yazmaKilidi(db);
  const taban = baslangic ?? await sorgular.sonSurum(db);
  for (const b of geriYuklenecekler(belgeler)) await sorgular.yaz(db, b.koleksiyon, b.kimlik, pinsiz(b.koleksiyon, b.govde), kullanici.id);
  if (son) await sorgular.izDisiniSil(db, kullanici.id, taban);
  return { surum: await sorgular.sonSurum(db), baslangic: taban };
}

// Uygulamanın dosya kimliği tek dosyaya bağlıdır: aynı kimlikle yeniden yükleme eski bağı kaldırır.
export async function dosyaBagi(
  db: Db, kullanici: Kullanici, kimlik: string, ozet: string, ad: string, denetimEki: DenetimEki,
): Promise<KmDosyaCevabi> {
  const kaldirilan = await dosyaTutamak.bagKaldir(db, kimlik, null);
  const bag = await dosyaTutamak.dosyaBagla(db, kullanici, { ozet, kayit: kimlik, ad, belgeTuru: null }, KM_DOSYA_SINIRI);
  denetimEki([...kaldirilan.map((d) => denetimSatiri('kaldir', d)), denetimSatiri('bagla', bag)]);
  return { kimlik, ozet: bag.ozet, boyut: bag.boyut, tur: bag.tur };
}

export async function dosyaOku(db: Db, kimlik: string): Promise<IkiliCevap> {
  const [bag] = await dosyaTutamak.bagliDosyalar(db, kimlik);
  const akis = bag === undefined ? null : await dosyaTutamak.dosyaAkisi(db, kimlik, bag.ozet);
  if (akis === null) throw bulunamadi(ILETILER.dosyaYok);
  return akis;
}

export async function dosyaSil(db: Db, kimlik: string, denetimEki: DenetimEki): Promise<{ tamam: true }> {
  const kaldirilan = await dosyaTutamak.bagKaldir(db, kimlik, null);
  denetimEki(kaldirilan.map((d) => denetimSatiri('kaldir', d)));
  return { tamam: true };
}

// İlk parça (FAI) kararı Kalite Merkezi'nden çıkar (229 a): emrin karar bekleyen sayımı onayda sağlama, retde redde geçer; stok
// aynı işlemde üretim emirlerinin kalite olayıyla partinin karar bekleyen bakiyesini serbest ya da red yapar. Kalite yetkisini
// ve emrin kapsamını çağıran denetler (Arkon numune kararı).
export async function ilkParcaKarari(db: Db, kisiId: number, uretimEmriId: number, karar: KaliteKarari): Promise<{ adet: number }> {
  const { adet } = await kararliSayimiSonuclandir(db, kisiId, uretimEmriId, karar);
  await sorgular.ilkParcaKarariYaz(db, uretimEmriId, karar, adet, kisiId);
  return { adet };
}

export async function ilkParcaBekleyenListesi(db: Db): Promise<KmIlkParcaBekleyenCevabi> {
  const emirler = await acikEmirler(db);
  return { emirler: ilkParcaBekleyenleri(emirler, await kararSayaclari(db, emirler.map((e) => e.id))) };
}

export async function kayitGecmisi(db: Db, koleksiyon: string, kimlik: string): Promise<KmGecmisCevabi> {
  const satirlar = await sorgular.kayitGecmisi(db, koleksiyon, kimlik, KM_GECMIS_SINIRI);
  const adlar = await kisiAdlari(db, satirlar.flatMap((s) => (s.degistirenId === null ? [s.yazanId] : [s.yazanId, s.degistirenId])));
  return {
    surumler: satirlar.map((s) => ({
      surum: s.surum, yazan: adlar.get(s.yazanId) ?? null, yazildi: s.yazildi,
      degistiren: s.degistirenId === null ? null : (adlar.get(s.degistirenId) ?? null), degisti: s.degisti, govde: s.govde,
    })),
  };
}

export async function ilkParcaKararlari(
  db: Db, uretimEmriIdler: readonly number[],
): Promise<Map<number, { karar: KaliteKarari; zaman: string; kisiId: number | null }>> {
  if (uretimEmriIdler.length === 0) return new Map();
  return new Map((await sorgular.ilkParcaSonKararlari(db, [...new Set(uretimEmriIdler)])).map(({ uretimEmriId, ...k }) => [uretimEmriId, k]));
}

// Serbest bırakılacak konum seçimi (önceki konum bilinmediğinde): karantina, hurda, fason ve yolda dışındaki aktif konumlar.
export async function karantinaHedefKonumlari(db: Db): Promise<{ id: number; kod: string; ad: string | null }[]> {
  return (await karantinaDisiKonumlar(db)).map((k) => ({ id: k.id, kod: k.kod, ad: k.ad }));
}

// T4 (155 a): başka modülün bulgusundan DÖF açar; aynı kaynak anahtarı ikinci kez gelirse var olan DÖF döner (yeni false). Kayıt
// genel yazmanın bütün kurallarından geçer (sürüm, geçmiş, kilit); numara Sistem Ayarları'ndaki kalıptan, dolu numara atlanır.
// Çağıranın işleminde yazar; açan kişi kayıtta yazan olur. Yetkiyi çağıranın ucu denetler.
export async function dofAc(
  db: Db, kullanici: Kullanici, istek: DofAcIstegi,
): Promise<{ kimlik: string; no: string; durum: DofDurumu['durum']; yeni: boolean }> {
  const ret = dofIstegiReddi(istek);
  if (ret !== null) throw dogrulama(ILETILER[ret]);
  const kimlik = dofKimligi(istek.kaynak, istek.kaynakAnahtari);
  await sorgular.yazmaKilidi(db);
  const onceki = await sorgular.kayitGovdesi(db, DOF_KOLEKSIYONU, kimlik);
  if (onceki !== null) {
    const d = dofDurumu(kimlik, onceki);
    return { kimlik, no: d.no, durum: d.durum, yeni: false };
  }
  const no = await numaraAl(db, 'kalite-merkezi.dof-no', { varMi: (n) => sorgular.noVarMi(db, DOF_KOLEKSIYONU, n) });
  await kayitYaz(db, kullanici, DOF_KOLEKSIYONU, kimlik, dofGovdesi(istek, no, tesisGunu(Date.now())), null, false);
  return { kimlik, no, durum: 'Açık', yeni: true };
}

// Kaynak anahtarı başına DÖF'ün durumu; DÖF'ü açılmamış ya da silinmiş anahtar haritada yoktur. Yetki denetlemez.
export async function dofDurumlari(db: Db, kaynak: DofKaynagi, anahtarlar: readonly string[]): Promise<Map<string, DofDurumu>> {
  const kimlikler = new Map(anahtarlar.map((a) => [dofKimligi(kaynak, a), a]));
  const satirlar = await sorgular.doluKayitlar(db, DOF_KOLEKSIYONU, [...kimlikler.keys()]);
  return new Map(satirlar.flatMap((s) => {
    const anahtar = kimlikler.get(s.kimlik);
    return anahtar === undefined ? [] : [[anahtar, dofDurumu(s.kimlik, s.govde)] as const];
  }));
}
