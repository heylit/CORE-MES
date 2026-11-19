import type { Db, Veritabani } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { ayarTanimi, type AyarAnahtari } from '#paylasilan/ayarlar.ts';
import { OKUMA_SIKLIKLARI, okumaSikligiMi, sonrakiTur, type OkumaSikligi } from '#paylasilan/okuma-sikligi.ts';
import { GUNLUK_SAYFA_BOYU, type EntegrasyonAkisi, type EntegrasyonGunlukCevabi, type EntegrasyonGunlukSatiri, type EntegrasyonKomutCevabi, type EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { ortamIstemcisi } from './baglanti.ts';
import type { SmartesIstemcisi } from './istemci.ts';
import { gunlugeYaz, kapiDurumu, simdiOkuIste } from './isler.ts';
import { YONETIM_AKISLARI, yonetimAkisi, type YonetimAkisi } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3445 a: SmartES sayfasının bağlantı ve akış bölümü. Görmek sayfa işlemiyle (görünürlük değişmez, Risk K2); "Şimdi oku" ve
// bağlantı testi ayarlar.yaz ister. Servis adresi ekrana gelmez.

const ayarOku = async (db: Db, anahtar: string): Promise<unknown> => sistemAyariOku(db, anahtar as AyarAnahtari);

function siklikSecenekleri(anahtar: string): OkumaSikligi[] {
  const t = ayarTanimi(anahtar as AyarAnahtari);
  if (t.tur !== 'secim') return [];
  return OKUMA_SIKLIKLARI.filter((x) => t.secenekler.some((sec) => sec.deger === x));
}

const gunlukAdi = (akis: string): string => (akis === 'baglanti' ? 'Bağlantı testi' : (yonetimAkisi(akis)?.ad ?? akis));
const gunlukSatiri = (g: s.GunlukSatiri): EntegrasyonGunlukSatiri => ({ ...g, akisAdi: gunlukAdi(g.akis) });

let sonTest: { zaman: string; sonuc: 'tamam' | 'hata'; ileti: string | null } | null = null;

async function akisOzeti(db: Db, a: YonetimAkisi, baglantiAcik: boolean, sonlar: Map<string, s.GunlukSatiri>): Promise<EntegrasyonAkisi> {
  const acik = a.acikAyari === null ? baglantiAcik : (await ayarOku(db, a.acikAyari)) === true;
  let siklik: OkumaSikligi | null = null;
  let okunuyor = false;
  let sonraki: string | null = null;
  if (a.siklikAyari !== undefined) {
    const d = await ayarOku(db, a.siklikAyari);
    siklik = typeof d === 'string' && okumaSikligiMi(d) ? d : null;
    const ilk = a.isler[0];
    const k = ilk === undefined ? null : kapiDurumu(ilk);
    okunuyor = k !== null && (k.pencere || k.istendi);
    const z = siklik === null || k === null ? null : sonrakiTur(k, siklik);
    sonraki = z === null ? null : z.toISOString();
  }
  const son = sonlar.get(a.anahtar);
  return {
    anahtar: a.anahtar, ad: a.ad, ne: a.ne, yon: a.yon, acikAyari: a.acikAyari, acik,
    siklikAyari: a.siklikAyari ?? null, siklik, siklikSecenekleri: a.siklikAyari === undefined ? [] : siklikSecenekleri(a.siklikAyari),
    simdiOkunabilir: a.yon === 'okuma' && acik && baglantiAcik, okunuyor, sonrakiTur: sonraki,
    son: son === undefined ? null : { zaman: son.zaman, sonuc: son.sonuc, ileti: son.ileti },
    bekleyen: null,
  };
}

export async function yonetimOzeti(db: Db, simdi: Date, istemci: SmartesIstemcisi | null = ortamIstemcisi): Promise<EntegrasyonYonetimiCevabi> {
  const baglantiAcik = (await sistemAyariOku(db, 'smartes.baglanti')) === true;
  const sonlar = new Map((await s.gunlukSonlari(db)).map((g) => [g.akis, g]));
  const akislar: EntegrasyonAkisi[] = [];
  for (const a of YONETIM_AKISLARI) akislar.push(await akisOzeti(db, a, baglantiAcik, sonlar));
  return {
    baglanti: { anaAyar: 'smartes.baglanti', acik: baglantiAcik, tanimli: istemci !== null, karsiUc: 'SmartES servisi (kurum içi)', sonTest },
    akislar,
    gunluk: (await s.gunlukOku(db, { akis: null, yalnizHata: false, once: null, sinir: 20 })).map(gunlukSatiri),
    bugunHata: await s.gunlukHataSayisi(db, new Date(tesisGunBasi(tesisGunu(simdi)))),
  };
}

export async function gunlukListesi(db: Db, o: { akis?: string; yalnizHata?: 'evet' | 'hayir'; once?: number }): Promise<EntegrasyonGunlukCevabi> {
  const satirlar = await s.gunlukOku(db, { akis: o.akis ?? null, yalnizHata: o.yalnizHata === 'evet', once: o.once ?? null, sinir: GUNLUK_SAYFA_BOYU + 1 });
  return { satirlar: satirlar.slice(0, GUNLUK_SAYFA_BOYU).map(gunlukSatiri), dahaVar: satirlar.length > GUNLUK_SAYFA_BOYU };
}

const KAPALI = 'SmartES bağlantısı kapalı; önce bağlantıyı açın.';
const TANIMSIZ = 'SmartES servis adresi sunucuda tanımlı değil; kurulum/smartes.md.';

export async function simdiOku(db: Db, anahtar: string, istemci: SmartesIstemcisi | null = ortamIstemcisi): Promise<EntegrasyonKomutCevabi> {
  const a = yonetimAkisi(anahtar);
  if (a === undefined || a.yon !== 'okuma') throw gecersiz('Bu akış okunamaz.');
  if ((await sistemAyariOku(db, 'smartes.baglanti')) !== true) throw cakisma(KAPALI);
  if (istemci === null) throw cakisma(TANIMSIZ);
  if (a.acikAyari !== null && (await ayarOku(db, a.acikAyari)) !== true) throw cakisma(`${a.ad} okuması kapalı; önce açın.`);
  simdiOkuIste(a.isler);
  return { sonuc: 'tamam', ileti: `${a.ad} bir dakika içinde okunacak.` };
}

// Bağlantı testi: servis tanımı (WSDL) okunur, yalnız GET; hiçbir metot çağrılmaz. Bağlantı kapalıyken 409.
export async function baglantiTesti(vt: Pick<Veritabani, 'tx'>, istemci: SmartesIstemcisi | null = ortamIstemcisi, saat: () => Date = () => new Date()): Promise<EntegrasyonKomutCevabi> {
  const acik = await vt.tx(async (db) => (await sistemAyariOku(db, 'smartes.baglanti')) === true);
  if (!acik) throw cakisma(KAPALI);
  if (istemci === null) throw cakisma(TANIMSIZ);
  const w = await istemci.wsdl();
  const sonuc = w.tur === 'basarili' ? 'tamam' : 'hata';
  const ileti = w.tur === 'basarili' ? `Servis cevap verdi; ${w.deger.metotlar.length} metot.` : `Servise ulaşılamadı (${w.tur}).`;
  sonTest = { zaman: saat().toISOString(), sonuc, ileti };
  await gunlugeYaz(vt, { akis: 'baglanti', yon: 'baglanti', sonuc, sayi: null, ileti }, saat);
  return { sonuc, ileti };
}
