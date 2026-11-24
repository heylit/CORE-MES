import type { Db } from '#cekirdek/db.ts';
import { cakisma, gecersiz } from '#cekirdek/hata.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import type { LogoTekKayitCevabi } from '#paylasilan/sozlesme/logo.ts';
import { LOGO_TEK_KAYIT_AKISLARI } from '#paylasilan/sozlesme/logo.ts';
import type { KopruIstemcisi } from './kopru.ts';
import type { FaturaKaydi, LogoMalzemeKarti } from './kurallar.ts';
import { yonetimAkisi } from './kurallar.ts';
import type { TxAcan } from './servis.ts';
import * as s from './sorgular.ts';

// 3626: okuma akışında tek kaydı yeniden okuma. Okuma (GET, transaction dışı) kaydı yardımcıdan tek istekle alır ve kişinin süreç belleğinde
// tutar; yazma (POST) bellekten aynaya yazar, köprüye gitmez. Yalnız aynaya yazılır (TMI kartına işlemek sahibin işidir); Logo'da kayıt yoksa
// aynadaki kopya silinmez. Akış ve bağlantı kapalıyken "Şimdi oku" gibi 409.
const KAPALI = 'Logo bağlantısı kapalı; önce bağlantıyı açın.';
const TANIMSIZ = 'Logo yardımcısının adresi sunucuda tanımlı değil; kurulum/logo-yardimcisi.md.';
const BELLEK_OMRU_MS = 2 * 60_000;
// Köprü tek oturumdur: kişi başına dakikada en çok bu kadar tek kayıt okuması.
export const TEK_KAYIT_DAKIKADA = 10;

type Okunan = { tur: 'malzeme-karti'; kart: LogoMalzemeKarti } | { tur: 'fatura'; siparisNo: string; faturalar: FaturaKaydi[] };
const bellek = new Map<string, { zaman: number; okunan: Okunan; kod: string }>();
const istekler = new Map<number, number[]>();
const anahtar = (kisiId: number, akis: string): string => `${String(kisiId)}:${akis}`;
export function tekKayitBelleginiSifirla(): void {
  bellek.clear();
  istekler.clear();
}

const okunamadi = (ileti: string): LogoTekKayitCevabi => ({ sonuc: 'okunamadi', ileti });

async function kapi(db: Db, akis: string): Promise<void> {
  const a = yonetimAkisi(akis);
  if (a === undefined || !(LOGO_TEK_KAYIT_AKISLARI as readonly string[]).includes(akis)) throw gecersiz('Bu akışta tek kayıt okunamaz.');
  if ((await sistemAyariOku(db, 'logo.baglanti')) !== true) throw cakisma(KAPALI);
  if (a.acikAyari !== null && (await sistemAyariOku(db, a.acikAyari as Parameters<typeof sistemAyariOku>[1])) !== true) throw cakisma(`${a.ad} okuması kapalı; önce açın.`);
}

export async function tekKayitOku(
  vt: TxAcan, kopru: KopruIstemcisi | null, kisiId: number, akis: string, kod: string, saat: () => Date = () => new Date(),
): Promise<LogoTekKayitCevabi> {
  await vt.tx((db) => kapi(db, akis));
  if (kopru === null) throw cakisma(TANIMSIZ);
  const simdi = saat().getTime();
  const son = (istekler.get(kisiId) ?? []).filter((z) => simdi - z < 60_000);
  if (son.length >= TEK_KAYIT_DAKIKADA) throw cakisma(`Dakikada en çok ${String(TEK_KAYIT_DAKIKADA)} tek kayıt okunur; biraz bekleyin.`);
  istekler.set(kisiId, [...son, simdi]);
  bellek.delete(anahtar(kisiId, akis));
  const k = kod.trim();
  if (akis === 'malzeme-karti') {
    const r = await kopru.malzemeAra(k);
    if (r.tur !== 'basarili') return okunamadi(`Logo yardımcısına sorulamadı: ${r.ileti}`);
    const hedef = k.toLocaleUpperCase('tr');
    const kart = r.veri.find((x) => x.kod.trim().toLocaleUpperCase('tr') === hedef);
    if (kart === undefined) return { sonuc: 'logoda-yok', ileti: `Logo'da ${k} kodlu kullanımda kart yok; aynadaki kopya silinmedi.` };
    bellek.set(anahtar(kisiId, akis), { zaman: simdi, kod: k, okunan: { tur: 'malzeme-karti', kart } });
    return { sonuc: 'okundu', ileti: `Logo'da bulundu: ${kart.kod}${kart.ad === null ? '' : ` (${kart.ad})`}. Aynaya yazılabilir.` };
  }
  const var_ = await vt.tx((db) => s.faturaSiparisiVarMi(db, k));
  if (!var_) return okunamadi('Bu numaralı sipariş Logo\'ya gitmemiş; yalnız Logo\'ya giden siparişin faturası okunur.');
  const r = await kopru.faturaOku(k);
  if (r.tur === 'reddedildi') return { sonuc: 'logoda-yok', ileti: `Logo'da ${k} numaralı sipariş bulunamadı; aynadaki kopya silinmedi.` };
  if (r.tur !== 'basarili') return okunamadi(`Logo yardımcısına sorulamadı: ${r.ileti}`);
  bellek.set(anahtar(kisiId, akis), { zaman: simdi, kod: k, okunan: { tur: 'fatura', siparisNo: k, faturalar: r.veri } });
  return { sonuc: 'okundu', ileti: `Logo'da bulundu: ${String(r.veri.length)} fatura. Aynaya yazılabilir.` };
}

export async function tekKayitYaz(db: Db, kisiId: number, akis: string, kod: string, simdi: Date): Promise<LogoTekKayitCevabi> {
  await kapi(db, akis);
  const b = bellek.get(anahtar(kisiId, akis));
  bellek.delete(anahtar(kisiId, akis));
  if (b === undefined || simdi.getTime() - b.zaman > BELLEK_OMRU_MS || b.kod !== kod.trim()) return okunamadi('Okuma sonucu eski ya da yok; kaydı yeniden okuyun.');
  let sayi: number;
  let ileti: string;
  if (b.okunan.tur === 'malzeme-karti') {
    const kart = b.okunan.kart;
    const once = await s.malzemeKartiAynada(db, kart.logoKayitNo);
    const alanlar: [string, unknown, unknown][] = once === null ? [] : [
      ['ad', once.ad, kart.ad], ['açıklama 2', once.aciklama2, kart.aciklama2], ['açıklama 3', once.aciklama3, kart.aciklama3],
      ['kart türü', once.kartTuru, kart.kartTuru], ['birim seti', once.birimSeti, kart.birimSeti], ['kullanımda', once.aktif, kart.aktif],
    ];
    const degisen = alanlar.filter(([, a, y]) => a !== y).map(([ad]) => ad);
    await s.malzemeKartlariniYaz(db, [kart], simdi);
    sayi = 1;
    const kimlik = `${kart.kod}${kart.ad === null ? '' : ` (${kart.ad})`}`;
    ileti = `${kimlik}: ${once === null ? 'aynaya yeni eklendi' : degisen.length === 0 ? 'aynada zaten aynıydı, değişmedi' : `güncellendi (${degisen.join(', ')})`}.`;
  } else {
    const once = await s.faturaSayisi(db, b.okunan.siparisNo);
    await s.faturaYaz(db, b.okunan.siparisNo, b.okunan.faturalar, simdi);
    const sonra = await s.faturaSayisi(db, b.okunan.siparisNo);
    sayi = b.okunan.faturalar.length;
    ileti = `${b.okunan.siparisNo}: ${String(sayi)} fatura okundu; aynada ${String(sonra - once)} yeni, ${String(sayi - (sonra - once))} mevcut kayıt güncellendi.`;
  }
  await s.gunlukYaz(db, { akis, yon: 'okuma', sonuc: 'tamam', sayi, ileti: `Tek kayıt: ${b.kod}` }, simdi);
  return { sonuc: 'okundu', ileti };
}
