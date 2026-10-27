import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import type { CagriEkibi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import {
  ALICI_AYARLI_TURLER, BILDIRIM_TUR_ANAHTARLARI, BILDIRIM_TURLERI, CAGRI_EKIP_ADLARI, type Bildirim, type BildirimAliciDegistirGovdesi, type BildirimAlicilariCevabi, type CagriEkiplerimCevabi, type CagriYonlendirmeCevabi, type CagriYonlendirmeDegistirGovdesi, type BildirimListeDurumu, type BildirimSayacCevabi,
  type BildirimTercihDegistirGovdesi, type BildirimTercihleriCevabi, type BildirimTuru, type TumunuOkunduCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import { kisiAdlari, kisiSecenekleri, kisilerinIslemleri, rolSecenekleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import {
  ACIK_KANALLAR, alicilariSec, epostaSecilebilir, kaynakModulu, metniHazirla, olmayanKimlikler, tekilAnahtar, yolTureUyar,
} from './kurallar.ts';
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
// BIL-10: türde alıcı seçimi varsa seçilen rollerdeki etkin girişli kişiler ve seçilen kişiler; seçim yoksa null (işlem kuralı).
async function ayarliAlicilar(db: Db, tur: BildirimTuru): Promise<number[] | null> {
  const ayar = await s.turAyari(db, tur);
  if (ayar === null) return null;
  return [...await rollerdekiKisiler(db, ayar.rolIdleri), ...ayar.kisiIdleri];
}

export async function bildirimGonder(db: Db, olay: BildirimOlayi): Promise<number> {
  const tanim = BILDIRIM_TURLERI[olay.tur];
  if (olay.yol !== undefined && olay.yol !== null && !kayitYoluMu(olay.yol)) throw new Error(`Bildirim yolu geçersiz: ${olay.yol}`);
  if (!yolTureUyar(olay.tur, olay.yol)) throw new Error(`Bildirim yolu türün ekranında değil: ${olay.tur} ${olay.yol}`);
  const { baslik, metin } = metniHazirla(olay.baslik, olay.metin);
  const alicilar = alicilariSec(olay.tur, await kisilerinIslemleri(db), {
    kisiler: olay.kisiler, haric: olay.haric, ayarli: await ayarliAlicilar(db, olay.tur),
  });
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

// Kişi yalnız alabileceği olayları görür: türde alıcı seçimi varsa seçilmişse, yoksa türün işlemlerinden birini taşıyorsa.
// Seçmediği olayda varsayılan geçer.
export async function tercihler(db: Db, kullanici: Kullanici): Promise<BildirimTercihleriCevabi> {
  const kayitli = new Map((await s.kisininTercihleri(db, kullanici.id)).map((t) => [t.tur, t]));
  const eposta = epostaSecilebilir(kullanici.islemler);
  const ayarli = new Map<string, boolean>();
  for (const a of await s.turAyarlari(db)) {
    ayarli.set(a.tur, a.kisiIdleri.includes(kullanici.id) || (await rollerdekiKisiler(db, a.rolIdleri)).includes(kullanici.id));
  }
  const satirlar = BILDIRIM_TUR_ANAHTARLARI
    .filter((tur) => ayarli.get(tur) ?? BILDIRIM_TURLERI[tur].alanIslemler.some((i) => kullanici.islemler.includes(i)))
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

// Ekip çağrısı yönlendirmesi (298 a). Değiştiren kişi ve zaman sunucudan yazılır; ad kisiler modülünden eklenir.
export async function cagriYonlendirmesi(db: Db): Promise<CagriYonlendirmeCevabi> {
  const satirlar = await s.cagriEkipleri(db);
  const adlar = await kisiAdlari(db, satirlar.flatMap((r) => (r.degistirenKisiId === null ? [] : [r.degistirenKisiId])));
  return {
    satirlar: satirlar.map(({ degistirenKisiId, ...r }) => ({
      ...r, ekip: r.ekip as CagriEkibi,
      degistiren: degistirenKisiId === null ? null : { id: degistirenKisiId, ad: adlar.get(degistirenKisiId) ?? null },
    })),
    roller: await rolSecenekleri(db),
  };
}

export async function cagriYonlendirmesiYaz(
  db: Db, kullanici: Kullanici, ekip: CagriEkibi, govde: CagriYonlendirmeDegistirGovdesi,
): Promise<CagriYonlendirmeCevabi> {
  const olmayan = olmayanKimlikler(govde.rolIdleri, (await rolSecenekleri(db)).map((r) => r.id));
  if (olmayan.length > 0) throw dogrulama(`Rol bulunamadı: ${olmayan.join(', ')}`, 'rolIdleri');
  if (!(await s.cagriEkibiYaz(db, ekip, govde.rolIdleri, govde.surum, kullanici.id))) throw eskiSurum();
  return cagriYonlendirmesi(db);
}

// Bildirim alıcıları (760 c, 761 b). Seçilebilir kişi etkin ve girişli olandır: bildirim yalnız onlara yazılır.
async function secilebilirKisiler(db: Db): Promise<{ id: number; ad: string }[]> {
  const girisli = await kisilerinIslemleri(db);
  return (await kisiSecenekleri(db)).filter((k) => girisli.has(k.id)).map(({ id, ad }) => ({ id, ad }));
}

export async function bildirimAlicilari(db: Db): Promise<BildirimAlicilariCevabi> {
  const ayarlar = new Map((await s.turAyarlari(db)).map((a) => [a.tur, a]));
  const adlar = await kisiAdlari(db, [...ayarlar.values()].flatMap((a) => (a.degistirenKisiId === null ? [] : [a.degistirenKisiId])));
  return {
    satirlar: ALICI_AYARLI_TURLER.map((tur) => {
      const t = BILDIRIM_TURLERI[tur];
      const a = ayarlar.get(tur);
      return {
        tur, baslik: t.baslik, onem: t.onem, kaynakModul: kaynakModulu(tur), varsayilanIslemler: [...t.alanIslemler],
        rolIdleri: a?.rolIdleri ?? [], kisiIdleri: a?.kisiIdleri ?? [], surum: a?.surum ?? null,
        degistiren: a === undefined || a.degistirenKisiId === null ? null : { id: a.degistirenKisiId, ad: adlar.get(a.degistirenKisiId) ?? null },
        degistirildi: a?.degistirildi ?? null,
      };
    }),
    roller: await rolSecenekleri(db),
    kisiler: await secilebilirKisiler(db),
  };
}

export async function bildirimAlicilariYaz(
  db: Db, kullanici: Kullanici, tur: BildirimTuru, govde: BildirimAliciDegistirGovdesi,
): Promise<BildirimAlicilariCevabi> {
  const olmayanRol = olmayanKimlikler(govde.rolIdleri, (await rolSecenekleri(db)).map((r) => r.id));
  if (olmayanRol.length > 0) throw dogrulama(`Rol bulunamadı: ${olmayanRol.join(', ')}`, 'rolIdleri');
  const olmayanKisi = olmayanKimlikler(govde.kisiIdleri, (await secilebilirKisiler(db)).map((k) => k.id));
  if (olmayanKisi.length > 0) throw dogrulama(`Kişi bulunamadı ya da girişi yok: ${olmayanKisi.join(', ')}`, 'kisiIdleri');
  if (!(await s.turAyariYaz(db, tur, govde, kullanici.id))) throw eskiSurum();
  return bildirimAlicilari(db);
}

// Kişinin alıcısı olduğu ekipler: çağrı gidecek kişiler ekipCagrisiBildir ile aynı yoldan seçilir, iki kaynak oluşmaz.
export async function cagriEkiplerim(db: Db, kullanici: Kullanici): Promise<CagriEkiplerimCevabi> {
  const ekipler: CagriEkibi[] = [];
  for (const satir of await s.cagriEkipleri(db)) {
    if ((await rollerdekiKisiler(db, satir.rolIdleri)).includes(kullanici.id)) ekipler.push(satir.ekip as CagriEkibi);
  }
  return { ekipler };
}

export interface EkipCagrisi {
  ekip: CagriEkibi;
  // Çağrının açıldığı istasyon ya da makine kodu; ekranda başlıkta görünür.
  yer: string;
  not?: string | null;
  // Çağrının kimliği: okunmamışken aynı çağrı yinelenirse yeni satır açılmaz.
  cagriKimligi: string;
  // Çağrıyı açan kişi: kendi çağrısını almaz.
  haric?: number | null;
}

// BIL-7: çağıranın transaction'ında yazar; alıcı ekibin yönlendirmesindeki rollerden gelir, açan kendi çağrısını almaz. Yazılan alıcı sayısını döner.
export async function ekipCagrisiBildir(db: Db, c: EkipCagrisi): Promise<number> {
  const kisiler = await rollerdekiKisiler(db, await s.cagriEkibiRolleri(db, c.ekip));
  if (kisiler.length === 0) return 0;
  return bildirimGonder(db, {
    tur: 'arkon.ekip-cagrisi', baslik: `${CAGRI_EKIP_ADLARI[c.ekip]} çağrısı: ${c.yer}`, metin: c.not ?? null, yol: null,
    kaynakKimlik: c.cagriKimligi, kisiler, haric: c.haric ?? null,
  });
}
