import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { KartsizIzin, KartsizIzinIsteGovdesi, KartsizIzinKararGovdesi } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import { bildirimGonder, bildirimKapat } from '../bildirim/disari.ts';
import type { BaslatmaKarti } from './baslatma-denetimi.ts';
import {
  KARTSIZ_BASLATMA_ISLEMI, KARTSIZ_IZIN_BASKASI, KARTSIZ_IZIN_GEREKCE_BIRDEN, KARTSIZ_IZIN_KARARLI, KARTSIZ_IZIN_KENDI, KARTSIZ_IZIN_YOK, acikEmirIhlali,
  izinliGerekce, kartsizIzinBitisi, kartsizIzinGorunenDurumu, kartsizIzinKullanimIhlali,
} from './kurallar.ts';
import * as s from './sorgular.ts';

// 3771 a: kartı olmayan operatör yetkiliyi çağırır, yetkili telefondan gerekçeyle izin verir; iş terminalde izinle başlar.
// Operatörün yetkisi değişmez: izin tek iş ve tek kişi içindir, bir kez kullanılır; gerekçe ve izni veren başlatma kaydına geçer.
const TUR = 'uretim-emirleri.kartsiz-izin-istendi' as const;
const EMIR_YOK = 'Üretim emri bulunamadı.';
const ADIM_YOK = 'Adım bu emrin değil.';

function cevap(z: s.KartsizIzinSatiri, simdiMs: number): KartsizIzin {
  const durum = kartsizIzinGorunenDurumu(z, simdiMs);
  const bitis = durum === 'sure-doldu' ? null : kartsizIzinBitisi(z);
  return {
    id: z.id, durum, emir: { id: z.uretimEmriId, no: z.emirNo },
    adim: z.isEmriId === null || z.adimSira === null || z.adimAd === null ? null : { id: z.isEmriId, sira: z.adimSira, ad: z.adimAd },
    isteyen: { id: z.isteyenKisiId, ad: z.isteyenAd }, istekAn: z.istekAn,
    kararVeren: z.kararVeren, kararGerekce: z.kararGerekce, kararAn: z.kararAn,
    gecerlilikBitis: bitis === null ? null : new Date(bitis).toISOString(),
  };
}

async function izinVeAn(db: Db, id: number, kilitle: boolean): Promise<{ z: s.KartsizIzinSatiri; an: string }> {
  const z = await s.kartsizIzinGetir(db, id, kilitle);
  if (z === null) throw bulunamadi(KARTSIZ_IZIN_YOK);
  return { z, an: await s.kartsizIzinAni(db) };
}

// Başka kişinin isteği yalnız izin verebilene görünür; öteki kişi için yok sayılır (varlığı da söylenmez).
function gorebilirMi(k: Kullanici, z: s.KartsizIzinSatiri): boolean {
  return z.isteyenKisiId === k.id || islemVarMi(k, KARTSIZ_BASLATMA_ISLEMI);
}

export async function kartsizIzinIste(db: Db, k: Kullanici, emirId: number, g: KartsizIzinIsteGovdesi): Promise<KartsizIzin> {
  const e = await s.ustEmirBul(db, emirId);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const ihlal = acikEmirIhlali(e.durum, e.arsiv);
  if (ihlal !== null) throw cakisma(ihlal);
  const isEmriId = g.isEmriId ?? null;
  if (isEmriId !== null && !(await s.isEmirleriGetir(db, [emirId])).some((i) => i.id === isEmriId)) throw bulunamadi(ADIM_YOK);
  const an = await s.kartsizIzinAni(db);
  await s.bekleyenKartsizIzniIptalEt(db, k.id, emirId, isEmriId);
  // Aynı anda iki çağrıda tekil dizin ikinciyi durdurur: 500 değil, anlaşılır 409.
  const id = await kisitKorumali({ uretim_emirleri_kartsiz_izin_tek_bekleyen: 'Bu iş için cevap bekleyen isteğiniz zaten var.' },
    () => s.kartsizIzinEkle(db, { uretimEmriId: emirId, isEmriId, kisiId: k.id, an }));
  const { z } = await izinVeAn(db, id, false);
  const adim = z.adimAd === null ? '' : ` · Op ${z.adimSira ?? ''} ${z.adimAd}`;
  await bildirimGonder(db, {
    tur: TUR, baslik: `Kartsız başlatma izni istendi: ${z.emirNo}${adim}`, metin: `${z.isteyenAd} refakat kartı olmadan başlatmak istiyor.`,
    yol: `/adim-durumu/kartsiz-izin/${id}`, kaynakKimlik: String(id), haric: k.id,
  });
  return cevap(z, Date.parse(an));
}

export async function kartsizIzinOku(db: Db, k: Kullanici, id: number): Promise<KartsizIzin> {
  const { z, an } = await izinVeAn(db, id, false);
  if (!gorebilirMi(k, z)) throw bulunamadi(KARTSIZ_IZIN_YOK);
  return cevap(z, Date.parse(an));
}

export async function kartsizIzinKarari(db: Db, k: Kullanici, id: number, g: KartsizIzinKararGovdesi): Promise<KartsizIzin> {
  const { z, an } = await izinVeAn(db, id, true);
  if (z.isteyenKisiId === k.id) throw yetkiYok(KARTSIZ_IZIN_KENDI);
  if (kartsizIzinGorunenDurumu(z, Date.parse(an)) !== 'bekliyor') throw cakisma(KARTSIZ_IZIN_KARARLI);
  await s.kartsizIzinKarariYaz(db, id, { durum: g.sonuc, kisiId: k.id, gerekce: g.gerekce.trim(), an });
  await bildirimKapat(db, { tur: TUR, kaynakKimlik: String(id) });
  return kartsizIzinOku(db, k, id);
}

export async function kartsizIzinIptal(db: Db, k: Kullanici, id: number): Promise<KartsizIzin> {
  const { z } = await izinVeAn(db, id, true);
  if (z.isteyenKisiId !== k.id) throw bulunamadi(KARTSIZ_IZIN_YOK);
  if (z.durum === 'bekliyor') {
    await s.kartsizIzniIptalEt(db, id);
    await bildirimKapat(db, { tur: TUR, kaynakKimlik: String(id) });
  }
  return kartsizIzinOku(db, k, id);
}

// Başlatma kartındaki izin, başlatma komutunun transaction'ında kullanılır: başlatma reddedilirse izin de kullanılmamış kalır.
// Süre başlatma kaydının anına göre ölçülür (terminal bağlantısız kaldıysa kayıt anı geçerlidir).
export function izinKartiDenetle(kart: BaslatmaKarti): void {
  if (kart.izinId != null && (kart.refakatPartisiId !== null || kart.gerekce !== null)) throw dogrulama(KARTSIZ_IZIN_GEREKCE_BIRDEN, 'kartsizIzinId');
}
export async function izinliKart(
  db: Db, b: { kisiId: number; uretimEmriId: number; isEmriId: number | null; an: string }, kart: BaslatmaKarti | undefined,
): Promise<BaslatmaKarti | undefined> {
  if (kart?.izinId == null) return kart;
  const z = await s.kartsizIzinGetir(db, kart.izinId, true);
  if (z === null) throw cakisma(KARTSIZ_IZIN_BASKASI);
  const ihlal = kartsizIzinKullanimIhlali(z, { ...b, anMs: Date.parse(b.an) });
  if (ihlal !== null) throw cakisma(ihlal);
  await s.kartsizIzniKullan(db, z.id, b.an);
  return { refakatPartisiId: null, gerekce: izinliGerekce(z.kararGerekce ?? '', z.kararVeren ?? 'yetkili') };
}
