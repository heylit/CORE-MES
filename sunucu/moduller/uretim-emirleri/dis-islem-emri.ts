// Dış işlem emri (DIE, 2428): her dış işlemin tek belgesi. Emre bağlı belge plandaki fason adımda kendiliğinden açılır (göç tetikleyicisi);
// stoktaki partinin belgesi Fason talebinden ya da stoktan elle açılır. Sahibi bu modüldür (2428-2 a); satın alma ve stok disari.ts ile çağırır.
import type { Db } from '#cekirdek/db.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { DisIslemEmri, DisIslemEmriDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { operasyonTipleri } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  DIE_ADIM_FASON_DEGIL, DIE_ADIMIN_VAR, DIE_YOK, type DieHareketDurumu, dieDonusIhlali, dieDurumu, dieGidisIhlali, dieIptalIhlali,
  diePartiGirdisiIhlali, dieTamamIhlali,
} from './dis-islem-emri-kurallar.ts';
import { adimaGiren, dalBasiAdedi, gkkHesabi } from './is-emri-servis.ts';
import { isEmirleriGetir } from './sorgular.ts';
import * as s from './sorgular/dis-islem-emri/sorgular.ts';

const ADIM_YOK = 'İş emri bulunamadı.';
const KISITLAR = {
  uretim_emirleri_dis_islem_emri_is_emri_tekil: DIE_ADIMIN_VAR,
  uretim_emirleri_dis_islem_emri_malzeme: { ileti: 'Parça kartı bulunamadı.', alan: 'malzemeNo' },
  uretim_emirleri_dis_islem_emri_hizmet: { ileti: 'Hizmet kartı bulunamadı.', alan: 'hizmetNo' },
  uretim_emirleri_dis_islem_emri_operasyon_tipi: { ileti: 'Operasyon tipi bulunamadı.', alan: 'operasyonTipiId' },
  uretim_emirleri_dis_islem_emri_firma: { ileti: 'Fason firma bulunamadı.', alan: 'firmaId' },
  uretim_emirleri_dis_islem_emri_adet: { ileti: 'Adet sıfırdan büyük olmalı.', alan: 'adet' },
  uretim_emirleri_dis_islem_emri_aciklama: { ileti: 'Açıklama boş olamaz, en çok 500 karakterdir.', alan: 'aciklama' },
  uretim_emirleri_dis_islem_emri_termin_sirasi: { ileti: 'Termin planlanan gidişten önce olamaz.', alan: 'termin' },
} as const;

interface EmirHesabi { hedef: number | null; firmadaHatali: number }
const durumu = (d: s.DieSatiri, h: EmirHesabi | undefined): DisIslemEmriDurumu => dieDurumu({
  emreBagli: d.isEmriId !== null, isEmriDurumu: d.isEmriDurumu, emirDurumu: d.emirDurumu, adimFason: d.adimFirmaId !== null,
  tamamlandi: d.tamamlanmaZamani !== null, iptal: d.iptalZamani !== null, gonderilen: d.gonderilen, donen: d.donen, hurda: d.hurda,
  firmadaHatali: h?.firmadaHatali ?? 0, hedef: d.isEmriId === null ? d.adet : (h?.hedef ?? null),
});

// Emre bağlı açık belgelerin hedefi (adıma giren, ilk adımda emir adedi) ve GKK'da firmada hatalı sayılanı: iş emrinin gidiş ve tamamlama
// kuralının girdileriyle aynı (fasonBaglami). Kapanmış belgede durum iş emrinden türediği için hesaplanmaz.
async function emirHesaplari(db: Db, satirlar: readonly s.DieSatiri[]): Promise<Map<number, EmirHesabi>> {
  const sonuc = new Map<number, EmirHesabi>();
  const acik = satirlar.filter((d) => d.isEmriId !== null && d.uretimEmriId !== null && d.isEmriDurumu !== 'tamam'
    && d.emirDurumu !== 'iptal' && d.emirDurumu !== 'bitti' && d.adimFirmaId !== null);
  const emirler = [...new Set(acik.map((d) => d.uretimEmriId!))];
  const hepsi = await isEmirleriGetir(db, emirler);
  for (const d of acik) {
    const emrin = hepsi.filter((i) => i.uretimEmriId === d.uretimEmriId);
    const isEmri = emrin.find((i) => i.id === d.isEmriId);
    if (isEmri === undefined) continue;
    const gkk = emrin.filter((i) => i.sira > isEmri.sira).sort((a, b) => a.sira - b.sira)[0];
    sonuc.set(d.id, {
      hedef: (await adimaGiren(db, d.uretimEmriId!, emrin, isEmri)) ?? dalBasiAdedi(d.emirAdedi ?? 0, isEmri),
      firmadaHatali: gkk === undefined ? 0 : (await gkkHesabi(db, emrin, gkk))?.firmadaHatali ?? 0,
    });
  }
  return sonuc;
}

const hareketDurumu = (d: s.DieSatiri): DieHareketDurumu => ({
  emreBagli: d.isEmriId !== null, kapali: d.tamamlanmaZamani !== null || d.iptalZamani !== null, adet: d.adet,
  gonderilen: d.gonderilen, donen: d.donen, hurda: d.hurda,
});

async function zenginlestir(db: Db, satirlar: readonly s.DieSatiri[]): Promise<DisIslemEmri[]> {
  if (satirlar.length === 0) return [];
  const hareketler = await s.dieHareketleriGetir(db, satirlar.map((d) => d.id));
  const hesap = await emirHesaplari(db, satirlar);
  const malzemeNolari = satirlar.flatMap((d) => [d.malzemeNo ?? d.emirMalzemeNo, d.hizmetNo]).filter((x): x is number => x !== null);
  const kisiIdleri = [...satirlar.map((d) => d.olusturanKisiId), ...hareketler.map((h) => h.kisiId)].filter((x): x is number => x !== null);
  const malzemeler = await malzemeOzetleri(db, malzemeNolari);
  const kisiler = await kisiAdlari(db, kisiIdleri);
  const tipler = await operasyonTipleri(db, { pasiflerDahil: true });
  const tip = new Map(tipler.map((t) => [t.id, t]));
  const kart = (no: number | null) => {
    const m = no === null ? undefined : malzemeler.get(no);
    return m === undefined ? null : { no: m.id, kod: m.kod, ad: m.ad ?? m.kod };
  };
  return satirlar.map((d) => {
    const tipId = d.operasyonTipiId ?? d.adimOperasyonTipiId;
    const t = tipId === null ? undefined : tip.get(tipId);
    const emre = d.isEmriId !== null && d.uretimEmriId !== null && d.emirNo !== null && d.opNo !== null;
    return {
      id: d.id, no: d.no, durum: durumu(d, hesap.get(d.id)), acilis: d.acilis,
      kaynak: emre
        ? { tur: 'emir' as const, uretimEmriId: d.uretimEmriId!, emirNo: d.emirNo!, isEmriId: d.isEmriId!, opNo: d.opNo!, adim: d.adim }
        : { tur: 'parti' as const, partiId: d.partiId!, konumId: d.konumId },
      malzeme: kart(d.malzemeNo ?? d.emirMalzemeNo), hizmet: kart(d.hizmetNo),
      operasyonTipi: t === undefined ? null : { id: t.id, kod: t.kod, ad: t.ad },
      firmaId: d.firmaId ?? d.adimFirmaId, adet: d.adet ?? d.emirAdedi,
      planlananGidis: d.planlananGidis, termin: d.termin ?? d.adimTermini, aciklama: d.aciklama,
      gonderilen: d.gonderilen, donen: d.donen, hurda: d.hurda,
      olusturan: d.olusturanKisiId === null ? null : { id: d.olusturanKisiId, ad: kisiler.get(d.olusturanKisiId) ?? `#${d.olusturanKisiId}` },
      olusturmaZamani: d.olusturmaZamani, surum: d.surum,
      hareketler: hareketler.filter((h) => h.dieId === d.id).map((h) => ({
        id: h.id, yon: h.yon, adet: h.adet, hurda: h.hurda, kisi: { id: h.kisiId, ad: kisiler.get(h.kisiId) ?? `#${h.kisiId}` }, zaman: h.zaman,
      })),
    };
  });
}

export async function dieOku(db: Db, id: number): Promise<DisIslemEmri> {
  const d = await s.dieGetir(db, id);
  if (d === null) throw bulunamadi(DIE_YOK);
  return (await zenginlestir(db, [d]))[0]!;
}

// Satın almanın Dış operasyonlar listesi: açık belgeler; hepsi verilirse kapananlar da (en yeni önce). Yetki denetlemez, çağıran korur.
export async function dieListesi(db: Db, g: { hepsi?: boolean; sinir?: number } = {}): Promise<DisIslemEmri[]> {
  return zenginlestir(db, await s.dieListesiGetir(db, { hepsi: g.hepsi ?? false, sinir: Math.min(g.sinir ?? 500, 2000) }));
}

export type DieAcGirdisi =
  | { kaynak: 'emir'; isEmriId: number; aciklama: string | null }
  | {
    kaynak: 'parti'; malzemeNo: number; partiId: number; konumId: number | null; operasyonTipiId: number | null; hizmetNo: number | null;
    adet: number; firmaId: number | null; planlananGidis: string | null; termin: string | null; aciklama: string | null;
  };

// UE-DIE-1: emre bağlı belge adımla 1:1'dir. Elle açmada belgesi olan adım reddedilir; talepten açmada (varsaVer) var olan belge döner,
// ikincisi açılmaz (Mimar ek koşulu). Parti belgesinde parti ve konumun stokta varlığını çağıran (stok ya da satın alma) denetler.
// Yetki denetlemez: elle açma ucu 'uretim-emirleri.fason' ister, talep yolu satın almanın talep ucundadır.
export async function dieAc(db: Db, kisiId: number, g: DieAcGirdisi, secenek: { acilis: 'elle' | 'talep'; varsaVer?: boolean }): Promise<{ id: number; yeni: boolean }> {
  if (g.kaynak === 'emir') {
    const adim = await s.isEmriFasonBilgisi(db, g.isEmriId);
    if (adim === null) throw bulunamadi(ADIM_YOK);
    if (adim.fasonFirmaId === null) throw cakisma(DIE_ADIM_FASON_DEGIL);
    const var_ = await s.dieIsEmrindenGetir(db, g.isEmriId);
    if (var_ !== null) {
      if (secenek.varsaVer === true) return { id: var_.id, yeni: false };
      throw cakisma(`${DIE_ADIMIN_VAR} (${var_.no})`);
    }
    const id = await kisitKorumali(KISITLAR, () => s.dieEkle(db, {
      isEmriId: g.isEmriId, malzemeNo: null, partiId: null, konumId: null, operasyonTipiId: null, hizmetNo: null, firmaId: null, adet: null,
      planlananGidis: null, termin: null, aciklama: g.aciklama, acilis: secenek.acilis, kisiId,
    }));
    return { id, yeni: true };
  }
  const ihlal = diePartiGirdisiIhlali(g);
  if (ihlal !== null) throw dogrulama(ihlal.ileti, ihlal.alan);
  const id = await kisitKorumali(KISITLAR, () => s.dieEkle(db, {
    isEmriId: null, malzemeNo: g.malzemeNo, partiId: g.partiId, konumId: g.konumId, operasyonTipiId: g.operasyonTipiId, hizmetNo: g.hizmetNo,
    firmaId: g.firmaId, adet: g.adet, planlananGidis: g.planlananGidis, termin: g.termin, aciklama: g.aciklama, acilis: secenek.acilis, kisiId,
  }));
  return { id, yeni: true };
}

async function kilitliDie(db: Db, id: number): Promise<s.DieSatiri> {
  if (!(await s.dieKilitle(db, id))) throw bulunamadi(DIE_YOK);
  const d = await s.dieGetir(db, id);
  if (d === null) throw bulunamadi(DIE_YOK);
  return d;
}

// UE-DIE-4: partideki belgenin gidişi stok çıkışıyla aynı transaction'da yazılır (stok, p3); yetki çağıranın ucunda.
export async function dieGidisYaz(db: Db, kisiId: number, g: { dieId: number; adet: number }): Promise<{ hareketId: number }> {
  const d = await kilitliDie(db, g.dieId);
  const ihlal = dieGidisIhlali(hareketDurumu(d), g.adet);
  if (ihlal !== null) throw cakisma(ihlal);
  const h = await s.dieHareketiEkle(db, { dieId: d.id, yon: 'gidis', adet: g.adet, hurda: null, kisiId });
  return { hareketId: h!.id };
}

// Dönüş mal kabulden girer (stok, p3), iş emrindeki fason dönüşüyle aynı kural: dönen + hurda gönderileni aşmaz.
export async function dieDonusuYaz(db: Db, kisiId: number, g: { dieId: number; saglam: number; hurda: number }): Promise<{ hareketId: number }> {
  const d = await kilitliDie(db, g.dieId);
  const ihlal = dieDonusIhlali(hareketDurumu(d), g.saglam, g.hurda);
  if (ihlal !== null) throw cakisma(ihlal);
  const h = await s.dieHareketiEkle(db, { dieId: d.id, yon: 'donus', adet: g.saglam, hurda: g.hurda, kisiId });
  return { hareketId: h!.id };
}

// Tamamlama: dışarıda parça kalmayınca. Sağlam adedin partiye geri girişi stoğun aynı transaction'daki işidir (p3).
export async function dieTamamla(db: Db, kisiId: number, id: number): Promise<{ saglam: number }> {
  const d = await kilitliDie(db, id);
  const ihlal = dieTamamIhlali(hareketDurumu(d));
  if (ihlal !== null) throw cakisma(ihlal);
  await s.dieTamamla(db, id, kisiId);
  return { saglam: d.donen };
}

// UE-DIE-5: gidişi olmayan parti belgesi iptal edilir; emre bağlı belge adımla kapanır.
export async function dieIptal(db: Db, kisiId: number, id: number, surum: number): Promise<void> {
  const d = await kilitliDie(db, id);
  const ihlal = dieIptalIhlali(hareketDurumu(d));
  if (ihlal !== null) throw cakisma(ihlal);
  if (d.surum !== surum) throw eskiSurum();
  await s.dieIptal(db, id, kisiId, surum);
}
