import type { Db } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { OKUMA_SIKLIKLARI, okumaSikligiMi, sonrakiTur, type OkumaSikligi } from '#paylasilan/okuma-sikligi.ts';
import { ayarTanimi, type AyarAnahtari } from '#paylasilan/ayarlar.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { GUNLUK_SAYFA_BOYU, type EntegrasyonAkisi, type EntegrasyonGunlukCevabi, type EntegrasyonGunlukSatiri, type EntegrasyonKomutCevabi, type EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { ortamKoprusu } from './baglanti.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { YONETIM_AKISLARI, yonetimAkisi, type YonetimAkisi } from './kurallar.ts';
import { gunlugeYaz, kapiDurumu, simdiOkuIste, siraliOturumDene, siraliYardimciSurumu } from './isler.ts';
import type { TxAcan } from './servis.ts';
import * as s from './sorgular.ts';
import { yardimciSurumu } from './yardimci-surumu.ts';

// 3445 a: Logo yönetim sayfası. Okuma sayfa işlemiyle; ayar, "Şimdi oku" ve test ayarlar.yaz ister. Adres ve anahtar ekrana gelmez.

const ayarOku = async (db: Db, anahtar: string): Promise<unknown> => sistemAyariOku(db, anahtar as AyarAnahtari);

function siklikSecenekleri(anahtar: string): OkumaSikligi[] {
  const t = ayarTanimi(anahtar as AyarAnahtari);
  if (t.tur !== 'secim') return [];
  return OKUMA_SIKLIKLARI.filter((x) => t.secenekler.some((sec) => sec.deger === x));
}

const gunlukAdi = (akis: string): string => (akis === 'baglanti' ? 'Bağlantı testi' : akis === 'dis-duzeltme' ? 'Sipariş düzeltme' : (yonetimAkisi(akis)?.ad ?? akis));
const gunlukSatiri = (g: s.GunlukSatiri): EntegrasyonGunlukSatiri => ({ ...g, akisAdi: gunlukAdi(g.akis) });

async function akisOzeti(db: Db, a: YonetimAkisi, baglantiAcik: boolean, sonlar: Map<string, s.GunlukSatiri>, bekleyen: Map<string, number>): Promise<EntegrasyonAkisi> {
  // Akışın kendi anahtarı; anahtarı olmayan akış ana bağlantıyla açılır.
  const acik = a.acikAyari === null ? baglantiAcik : (await ayarOku(db, a.acikAyari)) === true;
  let siklik: OkumaSikligi | null = null;
  let okunuyor = false;
  let sonraki: string | null = null;
  if (a.siklikAyari !== undefined) {
    const d = await ayarOku(db, a.siklikAyari);
    siklik = typeof d === 'string' && okumaSikligiMi(d) ? d : null;
    const k = kapiDurumu(a.anahtar);
    okunuyor = k.pencere || k.istendi;
    const z = siklik === null ? null : sonrakiTur(k, siklik);
    sonraki = z === null ? null : z.toISOString();
  } else if (a.sayfali !== undefined) {
    siklik = 'elle';
    const i = await s.okumaImleci(db, a.sayfali);
    okunuyor = i !== null && (i.sonRef > 0 || i.turIstendi);
  }
  const son = sonlar.get(a.anahtar);
  const say = a.belgeTurleri?.reduce((t, b) => t + (bekleyen.get(b) ?? 0), 0);
  return {
    anahtar: a.anahtar, ad: a.ad, ne: a.ne, yon: a.yon, acikAyari: a.acikAyari, acik,
    siklikAyari: a.siklikAyari ?? null, siklik,
    siklikSecenekleri: a.siklikAyari !== undefined ? siklikSecenekleri(a.siklikAyari) : a.sayfali !== undefined ? ['elle'] : [],
    simdiOkunabilir: a.yon === 'okuma' && acik && baglantiAcik,
    okunuyor, sonrakiTur: sonraki,
    son: son === undefined ? null : { zaman: son.zaman, sonuc: son.sonuc, ileti: son.ileti },
    bekleyen: say === undefined ? null : say,
  };
}

export async function yonetimOzeti(db: Db, simdi: Date, kopru: KopruIstemcisi | null = ortamKoprusu): Promise<EntegrasyonYonetimiCevabi> {
  const baglantiAcik = (await sistemAyariOku(db, 'logo.baglanti')) === true;
  const sonlar = new Map((await s.gunlukSonlari(db)).map((g) => [g.akis, g]));
  const bekleyen = new Map((await s.bekleyenGidenler(db)).map((b) => [b.belgeTuru, b.sayi]));
  const akislar: EntegrasyonAkisi[] = [];
  for (const a of YONETIM_AKISLARI) akislar.push(await akisOzeti(db, a, baglantiAcik, sonlar, bekleyen));
  const surum = yardimciSurumu();
  return {
    baglanti: {
      anaAyar: 'logo.baglanti', acik: baglantiAcik, tanimli: kopru !== null, karsiUc: 'Logo yardımcısı (aynı bilgisayar, 127.0.0.1)',
      sonTest: surum === null ? null : { zaman: surum.sonBakis, sonuc: surum.durum === 'bilinmiyor' ? 'hata' : 'tamam', ileti: surum.ileti },
    },
    akislar,
    gunluk: (await s.gunlukOku(db, { akis: null, yalnizHata: false, once: null, sinir: 20 })).map(gunlukSatiri),
    bugunHata: await s.gunlukHataSayisi(db, new Date(tesisGunBasi(tesisGunu(simdi)))),
  };
}

export async function gunlukListesi(db: Db, o: { akis?: string; yalnizHata?: 'evet' | 'hayir'; once?: number }): Promise<EntegrasyonGunlukCevabi> {
  const satirlar = await s.gunlukOku(db, { akis: o.akis ?? null, yalnizHata: o.yalnizHata === 'evet', once: o.once ?? null, sinir: GUNLUK_SAYFA_BOYU + 1 });
  return { satirlar: satirlar.slice(0, GUNLUK_SAYFA_BOYU).map(gunlukSatiri), dahaVar: satirlar.length > GUNLUK_SAYFA_BOYU };
}

const KAPALI = 'Logo bağlantısı kapalı; önce bağlantıyı açın.';
const TANIMSIZ = 'Logo yardımcısının adresi sunucuda tanımlı değil; kurulum/logo-yardimcisi.md.';

// "Şimdi oku": bağlantı ya da akış kapalıyken 409 (Risk K8). Sıklıklı okuma bir sonraki iş turunda (en çok bir dakika) başlar;
// sayfalı okuma tam turu yeniden başlatır (tur sürüyorsa yeni istek yalnız işaretlenir, kuyruk büyümez).
export async function simdiOku(db: Db, anahtar: string, kopru: KopruIstemcisi | null = ortamKoprusu): Promise<EntegrasyonKomutCevabi> {
  const a = yonetimAkisi(anahtar);
  if (a === undefined || a.yon !== 'okuma') throw gecersiz('Bu akış okunamaz.');
  if ((await sistemAyariOku(db, 'logo.baglanti')) !== true) throw cakisma(KAPALI);
  if (kopru === null) throw cakisma(TANIMSIZ);
  if (a.acikAyari !== null && (await ayarOku(db, a.acikAyari)) !== true) throw cakisma(`${a.ad} okuması kapalı; önce açın.`);
  if (a.sayfali !== undefined) {
    await s.acilistaTurIste(db, a.sayfali);
    return { sonuc: 'tamam', ileti: `${a.ad} baştan okunacak.` };
  }
  simdiOkuIste(a.anahtar);
  return { sonuc: 'tamam', ileti: `${a.ad} bir dakika içinde okunacak.` };
}

// Bağlantı testi: yardımcının sürüm ucu (yalnız GET), öteki isteklerle aynı sıradan. Bağlantı kapalıyken 409.
export async function baglantiTesti(vt: TxAcan, kopru: KopruIstemcisi | null = ortamKoprusu, saat: () => Date = () => new Date()): Promise<EntegrasyonKomutCevabi> {
  const acik = await vt.tx(async (db) => (await sistemAyariOku(db, 'logo.baglanti')) === true);
  if (!acik) throw cakisma(KAPALI);
  if (kopru === null) throw cakisma(TANIMSIZ);
  const r = await siraliYardimciSurumu(kopru);
  // 3698: iki adım ayrı yazılır. Yardımcıya ulaşılamadıysa oturum denenmez; eski yardımcıda (404) oturum denenemedi diye yazılır ve sonucu bozmaz.
  const yardimciTamam = r.durum !== 'bilinmiyor';
  const o = yardimciTamam ? await siraliOturumDene(kopru) : null;
  const sonuc = !yardimciTamam || o?.durum === 'kapali' ? 'hata' : 'tamam';
  const ileti = `Yardımcı: ${r.ileti} Logo oturumu: ${o === null ? 'denenmedi (yardımcıya ulaşılamadı).' : o.ileti}`;
  await gunlugeYaz(vt, { akis: 'baglanti', yon: 'baglanti', sonuc, sayi: null, ileti }, saat);
  return { sonuc, ileti };
}
