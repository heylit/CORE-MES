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
import type { KmHataliBekleyenCevabi, KmHataliKararCevabi, KmHataliKararGovdesi, KmTedarikciDurumu, KmTedarikciFirmalariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KmEmirKaynagi, KmEmirKaynaklariCevabi, KmEslesmeSayimiCevabi, KmParcaKaynaklariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
import type { Siparis } from '#paylasilan/sozlesme/siparisler.ts';
import type { KmDegisiklikCevabi, KmOlcuAletleriCevabi, KmDosyaCevabi, KmGecmisCevabi, KmIlkParcaBekleyenCevabi, KmGeriYukleCevabi, KmKarantinaPartileriCevabi, KmKimlikCevabi, KmOnaylaCevabi, KmOnaylaGovdesi, KmOzetCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { numaraAl } from '../ayarlar/disari.ts';
import { denetimSatiri, dosyaTutamagi } from '../dosya/disari.ts';
import { aletlerVeKayitlari } from '../kalibrasyon/disari.ts';
import { kisiAdlari, kisiBayrakliMi, kisileriListele } from '../kisiler/disari.ts';
import { malzemeAra, malzemeNoKoddan, malzemeOzetleri } from '../malzemeler/disari.ts';
import { firmaOzeti, tumFirmalar } from '../musteri-tedarikci/disari.ts';
import { siparisSatirlari } from '../satin-alma/disari.ts';
import { siparisAyrintisi, siparisinSatirOzetleri, siparisListesi } from '../siparisler/disari.ts';
import { hareketPartileri, karantinadanBirak, karantinaDisiKonumlar, partiGirisZamanlari, partiKaliteDurumuYap, partileriBul, partilerinRedBakiyeleri, partilerinRedGirisleri } from '../stok/disari.ts';
import {
  acikEmirler, adimKararSayaclari, emirIdleri, emirNolari, hataliKarariVer, hataliKayitlari, isEmriOzeti, kararliSayimiSonuclandir, uretimEmriOzeti,
} from '../uretim-emirleri/disari.ts';
import {
  CIHAZ_KOLEKSIYONU, GECERSIZ_CIHAZ_ALANI, ILETILER, KM_DOSYA_SINIRI, KM_MODULU, ONAY_ALANI_HATASI, UYGUNSUZLUK_KAPALI, UYGUNSUZLUK_KOLEKSIYONU, geriYuklenecekler, ilkParcaBekleyenleri, izReddi,
  onayAlaniVarMi, onayDegeriGecerliMi, onayDegisiklikleri, onayiGeriAlinmis, onayliFormMu, onayliFormReddi, pinsiz, sunucuOnayi,
  OLCU_ALETI_KAYIT_ADEDI, TEDARIKCI_ASKIDA, TEDARIKCI_KOLEKSIYONU, cihazGecerliMi, kalibrasyonAletKimligi, kalibrasyonCihazi, olcuAletleriListesi, emirCihazlari, kapanmisKayitMi, kaliteSatirlari, redToplami, serbestBirakanNcrMi, serbestBirakmaIstegi, serbestBirakmaPlani, serbestBirakmaSonucu, kalibrasyonHazirligi, arsivDegisiyor, kaynakKoleksiyonuMu, onaylaSilinirMi, karantinaIstegi, yalnizArsivDegisiyor, yeniOlcumCihazlari, yoneticiKoleksiyonuMu,
} from './kurallar.ts';
import { TEDARIKCI_FIRMA_ALANI, tedarikciFirmaKimligi, tedarikciFirmalari, tedarikciFirmasiMi, tedarikciOnayDurumlari as onayDurumlari } from './kurallar.ts';
import { hataliNcrGovdesi } from './kurallar.ts';
import { DOF_KOLEKSIYONU, dofDurumu, dofGovdesi, dofIstegiReddi, dofKimligi } from './kurallar.ts';
import type { DofAcIstegi, DofDurumu, DofKaynagi, KalibrasyonHazirligi } from './kurallar.ts';
import { AQL_DURDURULDU, LOT_KOLEKSIYONU, lotAnahtari, lotGovdesi, lotIstegiReddi, lotKarari, lotKimligi, lotSikiligi, muayenePlani, siradakiLotNo, varsayilanAqlAyari } from './kurallar.ts';
import type { AqlSiddeti, LotKarariIstegi, MuayeneAqlAyari, MuayenePlani } from './kurallar.ts';
import {
  EMIR_KOLEKSIYONU, EMIR_TIPI, PARCA_KOLEKSIYONU, satinAlmaKaynagi, PARCA_TURLERI, emirBaglari, emirKaynakSirasi, emirKimligi, eskiEmirNo, eskiEmirTipi, parcaKartiMalzemeNo, parcaKartiNo, sayiMetni,
} from './kurallar.ts';
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

// 236 a: istenen firmaların Kalite Merkezi onay durumu (kurallar.ts tedarikciOnayDurumlari). Kaydı olmayan firma haritada yoktur.
export async function tedarikciOnayDurumlari(db: Db, firmaIdler: readonly number[]): Promise<Map<number, KmTedarikciDurumu>> {
  const istenen = new Set(firmaIdler);
  if (istenen.size === 0) return new Map();
  const firmalar = (await tumFirmalar(db)).filter((f) => istenen.has(f.id));
  return onayDurumlari(await sorgular.tedarikciKayitlari(db, TEDARIKCI_KOLEKSIYONU), firmalar);
}

export async function tedarikciFirmaSecenekleri(db: Db): Promise<KmTedarikciFirmalariCevabi['firmalar']> {
  return tedarikciFirmalari(await tumFirmalar(db));
}

// 236 a: tedarikçi kaydının firması değiştiyse firma Müşteri-Tedarikçi'de aktif tedarikçi olmalıdır. Değişmeyen bağ (firma sonradan
// pasifleşse de) kaydın öteki alanlarının yazılmasını engellemez.
async function tedarikciFirmasiniDenetle(db: Db, koleksiyon: string, onceki: Govde | null, govde: Govde): Promise<void> {
  if (koleksiyon !== TEDARIKCI_KOLEKSIYONU) return;
  const yeni = tedarikciFirmaKimligi(govde);
  if (yeni === 'gecersiz') throw dogrulama(ILETILER.tedarikciFirmasi, TEDARIKCI_FIRMA_ALANI);
  if (yeni === null || yeni === tedarikciFirmaKimligi(onceki)) return;
  const f = await firmaOzeti(db, yeni);
  if (f === null || !tedarikciFirmasiMi(f)) throw dogrulama(ILETILER.tedarikciFirmasi, TEDARIKCI_FIRMA_ALANI);
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
  if (kaynakKoleksiyonuMu(koleksiyon) && !islemVarMi(kullanici, 'kalite-merkezi.onayla')) throw yetkiYok(ILETILER.kaynakOnay);
  govde = pinsiz(koleksiyon, govde);
  await sorgular.yazmaKilidi(db);
  const onceki = await sorgular.kayitGovdesi(db, koleksiyon, kimlik);
  const ret = izReddi(koleksiyon, 'yaz', onceki !== null);
  if (ret !== null) throw cakisma(ILETILER[ret]);
  if (arsivDegisiyor(onceki, govde) && !(await kisiBayrakliMi(db, kullanici.id))) throw yetkiYok(ILETILER.arsivYonetici);
  // 228 a: arşivleme kilitli içeriği değiştirmez.
  const kilitliArsiv = (onayliFormMu(koleksiyon, onceki) || kapanmisKayitMi(koleksiyon, onceki)) && yalnizArsivDegisiyor(onceki, govde);
  if (!kilitliArsiv && onayliFormReddi(koleksiyon, onceki, govde)) throw cakisma(ILETILER.onayliForm);
  if (!kilitliArsiv && kapanmisKayitMi(koleksiyon, onceki)) throw cakisma(ILETILER.kapanmisKayit);
  const degisen = onayDegisiklikleri(koleksiyon, onceki, govde);
  if (!onay && degisen.length > 0) {
    throw new UygulamaHatasi('YETKI_YOK', ILETILER.onayUcu, { alan: ONAY_ALANI_HATASI, ayrinti: { alanlar: degisen } });
  }
  if (onay && degisen.length > 0) govde = sunucuOnayi(koleksiyon, onceki, govde, onayKisisi(kullanici));
  await olcumCihazlariniDenetle(db, koleksiyon, onceki, govde);
  await tedarikciFirmasiniDenetle(db, koleksiyon, onceki, govde);
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
  // 229 a: silme yöneticinindir (kullanıcı ve ayar kayıtları dahil); 260 a: belge, bayrak ve şablon onay işlemiyle de silinir.
  const onaylaSiler = onaylaSilinirMi(koleksiyon) && islemVarMi(kullanici, 'kalite-merkezi.onayla');
  if (!onaylaSiler && !(await kisiBayrakliMi(db, kullanici.id))) throw yetkiYok(ILETILER.silmeYonetici);
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
// 744 a: karar adımındır; isEmriId verilince yalnız o adımın karar bekleyeni kapanır ve karar o adıma yazılır. Verilmezse (iş emirsiz
// emir) emrin bütün bekleyeni kapanır, karar hiçbir adıma sayılmaz. Başka emrin iş emri reddedilir.
export async function ilkParcaKarari(
  db: Db, kisiId: number, uretimEmriId: number, karar: KaliteKarari, isEmriId: number | null = null,
): Promise<{ adet: number }> {
  if (isEmriId !== null && (await isEmriOzeti(db, isEmriId))?.uretimEmriId !== uretimEmriId) throw dogrulama(ILETILER.ilkParcaAdimi, 'isEmriId');
  const { adet } = await kararliSayimiSonuclandir(db, kisiId, uretimEmriId, karar, isEmriId);
  await sorgular.ilkParcaKarariYaz(db, uretimEmriId, karar, adet, kisiId, isEmriId);
  return { adet };
}

// 1034, 1038 a: hatalı parçanın kalite kararı ve uygunsuzluk kaydı aynı işlemde. Karar üretim emrine döner (kalite adımı kapanır,
// rework planlamayı bekler, hurda ve red kolu kapatır); NCR onay yoluyla yazılır (MRB kararı onay alanıdır, 195 a).
export async function hataliKarari(db: Db, kullanici: Kullanici, kayitId: number, g: KmHataliKararGovdesi): Promise<KmHataliKararCevabi> {
  const sonuc = await hataliKarariVer(db, kullanici, kayitId, { karar: g.karar, not: g.not ?? null, ncrKimlik: g.ncrKimlik });
  const ncr = hataliNcrGovdesi(sonuc.kayit, { karar: g.karar, ncrNo: g.ncrNo, ciddiyet: g.ciddiyet, not: g.not ?? null }, kullanici.ad, tesisGunu(Date.now()));
  await onayla(db, kullanici, UYGUNSUZLUK_KOLEKSIYONU, g.ncrKimlik, ncr, null);
  return sonuc;
}

export async function hataliBekleyenListesi(db: Db): Promise<KmHataliBekleyenCevabi> {
  return { kayitlar: await hataliKayitlari(db, { acik: true, emirId: null }) };
}

export async function ilkParcaBekleyenListesi(db: Db): Promise<KmIlkParcaBekleyenCevabi> {
  const emirler = await acikEmirler(db);
  return { emirler: ilkParcaBekleyenleri(emirler, await adimKararSayaclari(db, emirler.map((e) => e.id))) };
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

// 744 a: Arkon'un kapısı adımın son kararını okur; kararsız adım haritada yoktur.
export async function adimIlkParcaKararlari(
  db: Db, isEmriIdler: readonly number[],
): Promise<Map<number, { karar: KaliteKarari; zaman: string; kisiId: number | null }>> {
  if (isEmriIdler.length === 0) return new Map();
  return new Map((await sorgular.adimIlkParcaSonKararlari(db, [...new Set(isEmriIdler)])).map(({ isEmriId, ...k }) => [isEmriId, k]));
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

// 564 2 a, 4 a: kalite istasyonunun lot planı. Ayar verilmezse (Hazırlık değiştirmediyse) uygulamanın varsayılan AQL ayarı; sıkılık
// aynı parçanın iç üretim lotlarından. Durdurulmuş sıkılıkta plan yoktur. Yetki denetlemez.
export type MuayenePlaniSonucu = { plan: MuayenePlani } | { durduruldu: true } | { gecersiz: true };
export async function muayenePlaniOner(db: Db, g: { parcaNo: string; N: number; ayar: MuayeneAqlAyari | null }): Promise<MuayenePlaniSonucu> {
  const ayar = g.ayar ?? varsayilanAqlAyari(await sorgular.kayitGovdesi(db, 'settings', 'genel'));
  const lotlar = (await sorgular.koleksiyonKayitlari(db, LOT_KOLEKSIYONU)).map((l) => l.govde);
  const siddet = lotSikiligi(lotlar, lotAnahtari(g.parcaNo, ''));
  if (siddet === AQL_DURDURULDU) return { durduruldu: true };
  const plan = muayenePlani(g.N, ayar, siddet as AqlSiddeti);
  return plan === null ? { gecersiz: true } : { plan };
}

// 564 6 a: istasyonun lot kararı lot kabul kaydı olur. Plan sunucuda yeniden hesaplanır, karar planla bulunandan çıkar (istemcinin
// kararı sayılmaz). Aynı kaynak anahtarı ikinci kaydı açmaz, var olan döner. Kayıt genel yazmanın kurallarından geçer; muayeneci
// yazan kişidir. Stoktaki parçanın serbest ya da red olması stoğun işidir (çağıran aynı işlemde yapar). Yetkiyi çağıranın ucu denetler.
export async function lotKarariYaz(
  db: Db, kullanici: Kullanici, istek: LotKarariIstegi,
): Promise<{ kimlik: string; no: string; karar: 'Kabul' | 'Ret'; plan: MuayenePlani; yeni: boolean }> {
  const ret = lotIstegiReddi(istek);
  if (ret !== null) throw dogrulama(ILETILER[ret]);
  const kimlik = lotKimligi(istek.kaynak, istek.kaynakAnahtari);
  await sorgular.yazmaKilidi(db);
  const sonuc = await muayenePlaniOner(db, { parcaNo: istek.parcaNo, N: istek.N, ayar: istek.ayar });
  if ('durduruldu' in sonuc) throw cakisma(ILETILER.lotDurduruldu);
  if ('gecersiz' in sonuc) throw dogrulama(ILETILER.lotBuyuklugu);
  const onceki = await sorgular.kayitGovdesi(db, LOT_KOLEKSIYONU, kimlik);
  if (onceki !== null) {
    const karar = onceki['karar'] === 'Ret' ? 'Ret' : 'Kabul';
    return { kimlik, no: typeof onceki['no'] === 'string' ? onceki['no'] : kimlik, karar, plan: sonuc.plan, yeni: false };
  }
  const karar = lotKarari(sonuc.plan, istek.bulunan)!;
  const gun = tesisGunu(Date.now());
  const lotlar = (await sorgular.koleksiyonKayitlari(db, LOT_KOLEKSIYONU)).map((l) => l.govde);
  const no = siradakiLotNo(lotlar, Number(gun.slice(0, 4)));
  const emirNo = (await emirNolari(db, [istek.uretimEmriId])).get(istek.uretimEmriId) ?? null;
  const govde = lotGovdesi(istek, { no, gun, emirNo, muayeneci: kullanici.ad, plan: sonuc.plan, karar });
  await kayitYaz(db, kullanici, LOT_KOLEKSIYONU, kimlik, govde, null, false);
  return { kimlik, no, karar, plan: sonuc.plan, yeni: true };
}

/* ---------------- iş emri, sipariş ve parça kaynakları (592 B1 c, B2 a, B3 c; 594 a) ---------------- */

// Sorgular tek bağlantıda sırayla koşar (işlem içinde Promise.all yok).
async function parcaAdlari(db: Db, malzemeNolar: readonly (number | null)[]): Promise<Map<number, { kod: string; ad: string | null }>> {
  const idler = [...new Set(malzemeNolar.filter((n): n is number => n !== null))];
  return new Map([...(await malzemeOzetleri(db, idler))].map(([id, m]) => [id, { kod: m.kod, ad: m.ad }]));
}

// Müşteri siparişinde parça tek kalemli siparişte kalemin kartıdır; çok kalemlide boş (hangi kalem olduğu kayıtta yok).
async function musteriKaynagi(db: Db, s: Pick<Siparis, 'id' | 'no' | 'durum' | 'termin' | 'firmaId' | 'firmaAd'>): Promise<KmEmirKaynagi> {
  const kalemler = await siparisinSatirOzetleri(db, s.id);
  const tek = kalemler.length === 1 ? kalemler[0] : undefined;
  const p = tek ? (await parcaAdlari(db, [tek.malzemeNo])).get(tek.malzemeNo) : undefined;
  return {
    kimlik: emirKimligi('ms', s.id), no: s.no, tip: EMIR_TIPI.ms, acik: s.durum === 'onayli', parcaNo: p?.kod ?? null, parcaAdi: p?.ad ?? null,
    miktar: tek ? sayiMetni(tek.miktar) : null, termin: s.termin, firmaId: s.firmaId, firmaAd: s.firmaAd,
  };
}

async function musteriSiparisleri(db: Db, g: { ara?: string; durum?: 'onayli' }): Promise<Siparis[]> {
  const hepsi: Siparis[] = [];
  for (let sayfa = 1; ; sayfa++) {
    const r = await siparisListesi(db, siparisListesiSorgusu.parse({ ...g, sayfa, sayfaBoyu: 200 }));
    hepsi.push(...r.satirlar);
    if (r.satirlar.length < r.sayfaBoyu) return hepsi;
  }
}

async function musteriSiparisiNodan(db: Db, no: string): Promise<Siparis | null> {
  return (await musteriSiparisleri(db, { ara: no })).find((x) => x.no === no) ?? null;
}

async function uretimKaynagi(db: Db, id: number): Promise<KmEmirKaynagi | null> {
  const e = await uretimEmriOzeti(db, id);
  if (e === null) return null;
  const p = e.malzemeNo === null ? undefined : (await parcaAdlari(db, [e.malzemeNo])).get(e.malzemeNo);
  return {
    kimlik: emirKimligi('ue', e.id), no: e.emirNo, tip: EMIR_TIPI.ue, acik: (ACIK_EMIR_DURUMLARI as readonly string[]).includes(e.durum),
    parcaNo: p?.kod ?? null, parcaAdi: p?.ad ?? null, miktar: e.adet, termin: e.teslim, firmaId: null, firmaAd: null,
  };
}

// Açık iş emirleri, açık satın alma sipariş satırları ve onaylı müşteri siparişleri; Kalite Merkezi kayıtlarının bağlı olduğu
// kapanmışlar da (belgenin kaynak kimliği, kaydın numarası). Kapanmış satın alma siparişi numarayla bulunamaz (yalnız kimlikle).
export async function emirKaynaklari(db: Db): Promise<KmEmirKaynaklariCevabi> {
  const liste = new Map<string, KmEmirKaynagi>();
  const ekle = (k: KmEmirKaynagi | null) => { if (k !== null && !liste.has(k.kimlik)) liste.set(k.kimlik, k); };
  for (const e of await acikEmirler(db)) {
    ekle({
      kimlik: emirKimligi('ue', e.id), no: e.emirNo, tip: EMIR_TIPI.ue, acik: true, parcaNo: e.parcaNo || null, parcaAdi: e.parcaAd || null,
      miktar: e.adet, termin: null, firmaId: null, firmaAd: null,
    });
  }
  const acikSatinAlma = await siparisSatirlari(db);
  const saParcalar = await parcaAdlari(db, acikSatinAlma.map((r) => r.malzemeNo));
  for (const r of acikSatinAlma) ekle(satinAlmaKaynagi(r, true, saParcalar));
  for (const s of await musteriSiparisleri(db, { durum: 'onayli' })) ekle(await musteriKaynagi(db, s));

  const bag = emirBaglari(await sorgular.koleksiyonlarinKayitlari(db, ['belge', 'lot', 'insp', 'ncr']));
  for (const id of bag.kimlikler.get('ue') ?? []) if (!liste.has(emirKimligi('ue', id))) ekle(await uretimKaynagi(db, id));
  const saEksik = (bag.kimlikler.get('sa') ?? []).filter((id) => !liste.has(emirKimligi('sa', id)));
  const saBagli = await siparisSatirlari(db, saEksik);
  const saBagliParcalar = await parcaAdlari(db, saBagli.map((r) => r.malzemeNo));
  for (const r of saBagli) ekle(satinAlmaKaynagi(r, false, saBagliParcalar));
  for (const id of bag.kimlikler.get('ms') ?? []) {
    if (liste.has(emirKimligi('ms', id))) continue;
    try {
      ekle(await musteriKaynagi(db, await siparisAyrintisi(db, id)));
    } catch (e) {
      if (!(e instanceof UygulamaHatasi && e.kod === 'BULUNAMADI')) throw e;
    }
  }
  const bilinen = new Set([...liste.values()].map((k) => k.no));
  const aranan = bag.numaralar.filter((no) => !bilinen.has(no));
  const ueIdleri = await emirIdleri(db, aranan);
  for (const id of ueIdleri.values()) ekle(await uretimKaynagi(db, id));
  for (const no of aranan.filter((n) => !ueIdleri.has(n))) {
    const s = await musteriSiparisiNodan(db, no);
    if (s !== null) ekle(await musteriKaynagi(db, s));
  }
  return { emirler: emirKaynakSirasi([...liste.values()]) };
}

export async function parcaKaynaklari(db: Db, g: { ara?: string; idler?: string }): Promise<KmParcaKaynaklariCevabi> {
  if (g.idler !== undefined) {
    const ozet = await malzemeOzetleri(db, g.idler.split(',').map(Number));
    return { parcalar: [...ozet.values()].map((m) => ({ malzemeNo: m.id, kod: m.kod, ad: m.ad, aktif: m.onayDurumu === 'aktif' })) };
  }
  const r = await malzemeAra(db, { metin: g.ara ?? null, turler: PARCA_TURLERI, yalnizAktif: true, sayfa: 1, sayfaBoyu: 50 });
  return { parcalar: r.satirlar.map((m) => ({ malzemeNo: m.id, kod: m.kod, ad: m.ad, aktif: m.onayDurumu === 'aktif' })) };
}

// 592 B3 c: eski iş emri kaydı numarası sahibinde bulunuyorsa eşleşir; eski parça kartı malzeme kimliği ya da stok koduyla.
export async function eslesmeSayimi(db: Db): Promise<KmEslesmeSayimiCevabi> {
  const emirler = await sorgular.koleksiyonKayitlari(db, EMIR_KOLEKSIYONU);
  const nolar = [...new Set(emirler.map((e) => eskiEmirNo(e.govde)).filter((n): n is string => n !== null))];
  const ueIdleri = await emirIdleri(db, nolar);
  const saNolari = new Set((await siparisSatirlari(db)).map((r) => r.siparisNo));
  const bulunan = new Set<string>();
  for (const no of nolar) if (ueIdleri.has(no) || saNolari.has(no) || (await musteriSiparisiNodan(db, no)) !== null) bulunan.add(no);
  const emirEslesmeyen = emirler.filter((e) => { const no = eskiEmirNo(e.govde); return no === null || !bulunan.has(no); });

  const parcalar = await sorgular.koleksiyonKayitlari(db, PARCA_KOLEKSIYONU);
  const kartlar = await malzemeOzetleri(db, parcalar.map((p) => parcaKartiMalzemeNo(p.govde)).filter((n): n is number => n !== null));
  const parcaEslesmeyen: typeof parcalar = [];
  for (const p of parcalar) {
    const no = parcaKartiMalzemeNo(p.govde);
    const kod = parcaKartiNo(p.govde);
    const var_ = no !== null ? kartlar.has(no) : kod !== null && (await malzemeNoKoddan(db, kod)) !== null;
    if (!var_) parcaEslesmeyen.push(p);
  }
  return {
    emir: {
      eslesen: emirler.length - emirEslesmeyen.length,
      eslesmeyenler: emirEslesmeyen.map((e) => ({ kimlik: e.kimlik, no: eskiEmirNo(e.govde), tip: eskiEmirTipi(e.govde) })),
    },
    parca: {
      eslesen: parcalar.length - parcaEslesmeyen.length,
      eslesmeyenler: parcaEslesmeyen.map((p) => ({ kimlik: p.kimlik, parcaNo: parcaKartiNo(p.govde) })),
    },
  };
}
