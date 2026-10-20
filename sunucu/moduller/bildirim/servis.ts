import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import {
  BILDIRIM_TUR_ANAHTARLARI, BILDIRIM_TURLERI, type Bildirim, type BildirimListeDurumu, type BildirimSayacCevabi,
  type BildirimTercihDegistirGovdesi, type BildirimTercihleriCevabi, type BildirimTuru, type TumunuOkunduCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import { kisilerinIslemleri } from '../kisiler/disari.ts';
import { ACIK_KANALLAR, alicilariSec, epostaSecilebilir, kaynakModulu, metniHazirla, tekilAnahtar, yolTureUyar } from './kurallar.ts';
import * as s from './sorgular.ts';

const BULUNAMADI = 'Bildirim bulunamadı.';

export interface BildirimOlayi {
  tur: BildirimTuru;
  baslik: string;
  metin?: string | null;
  // Bildirime basınca açılacak uygulama içi adres.
  yol?: `/${string}` | null;
  // Kaynak kaydın kimliği (talep no gibi): okunmamışken aynı olay yinelenirse yeni satır açılmaz.
  kaynakKimlik?: string | null;
  // Olay türünün işlem sahiplerine ek olarak alacak kişiler (kayda bağlı kişi).
  kisiler?: readonly number[];
  // Olayı tetikleyen kişi: kendi eylemi için bildirim almaz.
  haric?: number | null;
}

// Çağıranın transaction'ında yazar (ADR 0006): olayı doğuran yazma geri alınırsa bildirim de kalmaz. Yazılan alıcı sayısını döner.
export async function bildirimGonder(db: Db, olay: BildirimOlayi): Promise<number> {
  const tanim = BILDIRIM_TURLERI[olay.tur];
  if (olay.yol !== undefined && olay.yol !== null && !kayitYoluMu(olay.yol)) throw new Error(`Bildirim yolu geçersiz: ${olay.yol}`);
  if (!yolTureUyar(olay.tur, olay.yol)) throw new Error(`Bildirim yolu türün ekranında değil: ${olay.tur} ${olay.yol}`);
  const { baslik, metin } = metniHazirla(olay.baslik, olay.metin);
  const alicilar = alicilariSec(olay.tur, await kisilerinIslemleri(db), { kisiler: olay.kisiler, haric: olay.haric });
  const anahtar = tekilAnahtar(olay.tur, olay.kaynakKimlik);
  for (const kisiId of alicilar) {
    await s.bildirimYaz(db, {
      kisiId, tur: olay.tur, onem: tanim.onem, baslik, metin, yol: olay.yol ?? null, kaynakModul: kaynakModulu(olay.tur), tekilAnahtar: anahtar,
    });
  }
  return alicilar.length;
}

export function bildirimListesi(
  db: Db, kullanici: Kullanici, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; durum: BildirimListeDurumu },
): Promise<SayfaliListe<Bildirim>> {
  return sayfaliListe(sorgu, {
    say: () => s.kisininBildirimSayisi(db, kullanici.id, sorgu.durum),
    satirlar: (dilim) => s.kisininBildirimleri(db, kullanici.id, sorgu.durum, dilim),
  });
}

export function bildirimSayaci(db: Db, kullanici: Kullanici): Promise<BildirimSayacCevabi> {
  return s.kisininSayaci(db, kullanici.id);
}

export async function okundu(db: Db, kullanici: Kullanici, id: number): Promise<Bildirim> {
  const b = await s.okunduIsaretle(db, kullanici.id, id);
  if (b === null) throw bulunamadi(BULUNAMADI);
  return b;
}

export async function tumunuOkundu(db: Db, kullanici: Kullanici): Promise<TumunuOkunduCevabi> {
  return { isaretlenen: await s.tumunuOkunduIsaretle(db, kullanici.id) };
}

export async function arsivle(db: Db, kullanici: Kullanici, id: number): Promise<Bildirim> {
  const b = await s.arsivle(db, kullanici.id, id);
  if (b === null) throw bulunamadi(BULUNAMADI);
  return b;
}

// Kişi yalnız alabileceği olayları görür (olay türünün işlemlerinden birini taşıyorsa); seçmediği olayda varsayılan geçer.
export async function tercihler(db: Db, kullanici: Kullanici): Promise<BildirimTercihleriCevabi> {
  const kayitli = new Map((await s.kisininTercihleri(db, kullanici.id)).map((t) => [t.tur, t]));
  const eposta = epostaSecilebilir(kullanici.islemler);
  const satirlar = BILDIRIM_TUR_ANAHTARLARI
    .filter((tur) => BILDIRIM_TURLERI[tur].alanIslemler.some((i) => kullanici.islemler.includes(i)))
    .map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const k = kayitli.get(tur);
      return {
        tur, baslik: t.baslik, onem: t.onem, kaynakModul: kaynakModulu(tur),
        mesaj: k?.mesaj ?? t.varsayilan.mesaj,
        eposta: eposta ? (k?.eposta ?? t.varsayilan.eposta) : null,
        varsayilan: k === undefined,
      };
    });
  return { kanallar: { ...ACIK_KANALLAR }, epostaSecilebilir: eposta, satirlar };
}

// E-posta seçemeyen kişinin e-posta tercihi kapalı saklanır: gövdedeki değer yok sayılır.
export async function tercihDegistir(db: Db, kullanici: Kullanici, govde: BildirimTercihDegistirGovdesi): Promise<BildirimTercihleriCevabi> {
  const eposta = epostaSecilebilir(kullanici.islemler) && govde.eposta;
  await s.tercihYaz(db, kullanici.id, { tur: govde.tur, mesaj: govde.mesaj, eposta });
  return tercihler(db, kullanici);
}
