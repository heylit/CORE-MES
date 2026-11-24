import { hataOzeti, isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import type { IsBekliyor, IsTanimi } from '#cekirdek/zamanlayici.ts';
import type { Veritabani } from '#cekirdek/db.ts';
import type { AyarAnahtari } from '#paylasilan/ayarlar.ts';
import { okumaSikligiMi, turBaslasinMi, turBitti, yeniSiklikDurumu, type SiklikDurumu } from '#paylasilan/okuma-sikligi.ts';
import { GUNLUK_ILETI_EN_COK, GUNLUK_SAKLAMA_GUN, gunlukIletisi } from '#paylasilan/sozlesme/entegrasyon.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import * as s from './sorgular.ts';
import { ortamIstemcisi } from './baglanti.ts';
import { IS_ARALIKLARI_MS, KALITE_AMBAR_KAYNAKLARI, MAKINE_OKUMA_ARALIGI_MS, SIK_TAMAM_ARALIGI_MS, gunlukSatiri, isinAkisi, kapiSonucu } from './kurallar.ts';
import type { KaliteAmbarKaynagi, OkumaKaynagi } from './kurallar.ts';
import {
  BEKLEME_NEDENLERI, ilerlemeTuru, makineTuru, yeniMakineBellegi, gonderimTuru, kaliteAmbarTuru, listeTuru, okumaTuru, tanimTuru, yeniBekleyenBellegi,
  yeniOkumaBellegi,
} from './servis.ts';
import { hesapTuru } from './servis.ts';
import type { TurOrtami } from './servis.ts';

// İşler her zaman koşar; istek ancak "SmartES bağlantısı" ayarı açık ve TMIV2_SMARTES_ADRESI varken çıkar (karar 3b: okuma ve yazma birlikte).
// Kalite/ambar okuması ve tanım gönderimi ayrıca kendi anahtarlarıyla (varsayılan kapalı) açılır.
const ortam: TurOrtami = {
  istemci: ortamIstemcisi, saat: () => new Date(), okumalar: yeniOkumaBellegi(), bekleyenler: yeniBekleyenBellegi(), niyetler: new Set<string>(),
};

const makineBellegi = yeniMakineBellegi();

const bekliyorMu = (r: { tur: string }) =>
  r.tur === 'kapali' || r.tur === 'ortam-degiskeni-yok' || r.tur === 'akis-kapali' ? isBekliyor(BEKLEME_NEDENLERI[r.tur]) : undefined;

// 3445: akış günlüğü. Yazılamayan satır turu düşürmez; eski satırlar saatte bir silinir. Sık okunan akışın başarılı satırı seyreltilir.
let sonTemizlik = 0;
const sonTamam = new Map<string, number>();
export async function gunlugeYaz(vt: Pick<Veritabani, 'tx'>, k: s.GunlukKaydi, saat: () => Date = () => new Date()): Promise<void> {
  const simdi = saat();
  try {
    await vt.tx(async (db) => {
      await s.gunlukYaz(db, { ...k, ileti: gunlukIletisi(k.ileti, GUNLUK_ILETI_EN_COK) }, simdi);
      if (simdi.getTime() - sonTemizlik >= 3_600_000) {
        sonTemizlik = simdi.getTime();
        await s.gunlukTemizle(db, new Date(simdi.getTime() - GUNLUK_SAKLAMA_GUN * 24 * 3_600_000));
      }
    });
  } catch {
    // Günlük yazılamadıysa tur yine sayılır.
  }
}

// 3445: sıklık kapısı (süreç belleği), iş adına göre. İş dakikada bir döner; istek ancak sıklık dolunca ya da "Şimdi oku" ile çıkar.
const kapilar = new Map<string, SiklikDurumu>();
export const kapiDurumu = (isAdi: string): SiklikDurumu => kapilar.get(isAdi) ?? yeniSiklikDurumu();
export function simdiOkuIste(isAdlari: readonly string[]): void {
  for (const ad of isAdlari) kapilar.set(ad, { ...kapiDurumu(ad), istendi: true });
}
export function kapilariSifirla(): void {
  kapilar.clear();
  sonTamam.clear();
}

export async function kapiliTur<T extends { tur: string }>(
  vt: Veritabani, ad: string, tur: (zorla: boolean) => Promise<T>, saat: () => Date = () => new Date(),
): Promise<IsBekliyor | undefined> {
  const a = isinAkisi(ad);
  let d: SiklikDurumu | null = null;
  if (a?.siklikAyari !== undefined) {
    const anahtar = a.siklikAyari;
    const deger: unknown = await vt.tx((db) => sistemAyariOku(db, anahtar as AyarAnahtari));
    const acilan = turBaslasinMi(kapiDurumu(ad), typeof deger === 'string' && okumaSikligiMi(deger) ? deger : '15dk', saat());
    if (acilan === null) return undefined;
    d = acilan;
    kapilar.set(ad, d);
  }
  let r: T;
  try {
    r = await tur(d?.zorlaAni !== null && d?.zorlaAni !== undefined);
  } catch (e) {
    if (d) kapilar.set(ad, turBitti(d, { kayitGeldi: false }, 1, saat()));
    if (a) await gunlugeYaz(vt, { akis: a.anahtar, yon: a.yon, sonuc: 'hata', sayi: null, ileti: hataOzeti(e) }, saat);
    throw e;
  }
  if (d) kapilar.set(ad, turBitti(d, kapiSonucu(r), 1, saat()));
  const satir = a ? gunlukSatiri(a, r as Parameters<typeof gunlukSatiri>[1]) : null;
  if (a && satir !== null) {
    const simdi = saat().getTime();
    const sik = a.anahtar === 'makine' || a.anahtar === 'ilerleme';
    if (!(sik && satir.sonuc === 'tamam' && simdi - (sonTamam.get(ad) ?? 0) < SIK_TAMAM_ARALIGI_MS)) {
      if (sik && satir.sonuc === 'tamam') sonTamam.set(ad, simdi);
      await gunlugeYaz(vt, { akis: a.anahtar, yon: a.yon, ...satir }, saat);
    }
  }
  return bekliyorMu(r);
}

// Okumalar dakikada bir döner; sıklık kapısı istek zamanını seçer (varsayılanlar bugünkü aralıklardır). Gönderimler kendi aralığındadır.
const OKUMA_TIKI_MS = 60_000;
const kapili = (ad: string, aralikMs: number, tur: (vt: Veritabani, zorla: boolean) => Promise<{ tur: string }>): IsTanimi =>
  isTanimi({ ad, aralikMs, txDisi: (vt) => kapiliTur(vt, ad, (z) => tur(vt, z)) });

const okumaIsi = (kaynak: OkumaKaynagi) => kapili(`smartes-okuma-${kaynak}`, OKUMA_TIKI_MS, (vt) => okumaTuru(vt, kaynak, ortam));

// Üç kaynak ayrı işlerde, aynı anahtar ve sıklıkla okunur; biri düşse ötekiler okunur.
const kaliteAmbarIsi = (kaynak: KaliteAmbarKaynagi) => kapili(`smartes-okuma-${kaynak}`, OKUMA_TIKI_MS, (vt) => kaliteAmbarTuru(vt, kaynak, ortam));

export const isler = [
  okumaIsi('is-emri-durumu'),
  okumaIsi('durus'),
  okumaIsi('alarm'),
  kapili('smartes-is-emri-gonderimi', IS_ARALIKLARI_MS.gonderim, (vt) => gonderimTuru(vt, ortam)),
  ...KALITE_AMBAR_KAYNAKLARI.map(kaliteAmbarIsi),
  // Canlı makine panosu kendi anahtarıyla (varsayılan kapalı); iş emri ilerlemesi aynı anahtarla. Sıklıkları ayrı ayardadır.
  kapili('smartes-makine-okumasi', MAKINE_OKUMA_ARALIGI_MS, (vt) => makineTuru(vt, ortam, makineBellegi)),
  kapili('smartes-ilerleme-okumasi', OKUMA_TIKI_MS, (vt) => ilerlemeTuru(vt, ortam)),
  // Tanım listeleri ve SmartES hesapları: iç aralıkları (günde bir, saatte bir) korunur; "Şimdi oku" onları beklemez.
  kapili('smartes-liste-okumasi', OKUMA_TIKI_MS, (vt, z) => listeTuru(vt, ortam, { zorla: z })),
  kapili('smartes-hesap-okumasi', OKUMA_TIKI_MS, (vt, z) => hesapTuru(vt, ortam, { zorla: z })),
  kapili('smartes-tanim-gonderimi', IS_ARALIKLARI_MS.tanim, (vt) => tanimTuru(vt, ortam)),
];
