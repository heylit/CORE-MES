import type { Db } from '#cekirdek/db.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import type { KopruIstemcisi, ProjeKurulumu } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS, geriCekilmeMs, kopruBeklemesi, kartEylemi, kirp, KUYRUK_SINIRI, PROJE_AYARI, projeGovdesi } from './kurallar.ts';
import type { GidenSonucu, GonderilecekProje, KopruSonucu } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { GidenSatiri } from './sorgular.ts';
import type { SurecBellegi, TurSonucu, TxAcan } from './servis.ts';
import { durduMu } from './kurallar.ts';
import type { LogoProjeDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { projeGetir } from '../projeler/disari.ts';

// 3315 c: aktif CORE projesi Logo'da aynı kodla açılır. Kalkan kart gönderimiyle aynıdır: önce niyet ayrı turda kalıcı yazılır, sonraki turda
// "var mı" okunur (varsa bağlanır), yoksa açılır. Sonuç yalnız giden kutusundadır; proje kartı durumu buradan okur (projelerin şeması değişmez).

// Yardımcıda proje kartı açık değilken (ölçüm yok ya da eski sürüm) her turda sorulmaz.
export const PROJE_KURULUM_BEKLEME_MS = 10 * 60_000;

export interface ProjeKaynagi {
  // Aktif projeler (projeler modülünün disari.ts'i); Logo'ya gitmiş olanları bu modül düşer.
  aktifProjeler(db: Db): Promise<GonderilecekProje[]>;
}

export interface ProjeTurOrtami {
  kopru: KopruIstemcisi | null;
  bellek: SurecBellegi;
  saat: () => Date;
  kaynak: ProjeKaynagi;
  // Yardımcının son "kurulum bekliyor" cevabı; dolu iken PROJE_KURULUM_BEKLEME_MS dolmadan istek atılmaz.
  kurulum: { son: Date | null; ileti: string | null };
}

type Yazici = (db: Db) => Promise<TurSonucu>;

async function denemeYaz(
  db: Db, o: ProjeTurOrtami, p: GonderilecekProje, g: GidenSatiri | null, sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number,
): Promise<TurSonucu> {
  const zaman = o.saat();
  await s.denemeYaz(db, 'proje', p.id, {
    zaman, sonuc, hata: kirp(hata), logoKayitNo: null, niyetZamani: niyet,
    sonrakiDeneme: new Date(zaman.getTime() + (bekleme ?? geriCekilmeMs((g?.ardisikHata ?? 0) + 1))), basarili: false,
  });
  return { tur: 'proje', no: p.id, sonuc };
}

async function basariYaz(db: Db, o: ProjeTurOrtami, p: GonderilecekProje, sonuc: 'gonderildi' | 'zaten-vardi', ref: number): Promise<TurSonucu> {
  await s.denemeYaz(db, 'proje', p.id, {
    zaman: o.saat(), sonuc, hata: null, logoKayitNo: String(ref), niyetZamani: null, sonrakiDeneme: null, basarili: true,
  });
  return { tur: 'proje', no: p.id, sonuc };
}

const kurulumMu = (r: KopruSonucu | ProjeKurulumu): r is ProjeKurulumu => r.tur === 'kurulum-bekliyor';

function kurulumBekliyor(o: ProjeTurOrtami, ileti: string): Yazici {
  o.kurulum.son = o.saat();
  o.kurulum.ileti = ileti;
  return () => Promise.resolve({ tur: 'proje-kurulum-bekliyor', ileti });
}

// Köprü adımı transaction dışında; dönen iş sonucu ikinci transaction'da yazar.
async function gonder(o: ProjeTurOrtami, kopru: KopruIstemcisi, p: GonderilecekProje, g: GidenSatiri | null, govde: { code: string; name: string }): Promise<Yazici> {
  const varMi = await kopru.projeVarMi(govde.code);
  if (kurulumMu(varMi)) return kurulumBekliyor(o, varMi.ileti);
  // Okuma proje açmaz: niyet olduğu gibi kalır.
  if (varMi.tur !== 'basarili') return (db) => denemeYaz(db, o, p, g, varMi.tur, `"Var mı" okuması: ${varMi.ileti}`, undefined, kopruBeklemesi(varMi));
  o.kurulum.son = null;
  // Logo'da aynı kodlu proje varsa bağlanır (eşleme tablosu yok; KURGU varsayımı).
  if (varMi.logicalRef !== null) { const ref = varMi.logicalRef; return (db) => basariYaz(db, o, p, 'zaten-vardi', ref); }
  o.bellek.acmaIstekleri.set(p.id, o.saat());
  const ekle = await kopru.projeEkle(govde);
  if (kurulumMu(ekle)) { o.bellek.acmaIstekleri.delete(p.id); return kurulumBekliyor(o, ekle.ileti); }
  if (ekle.tur === 'basarili') {
    if (ekle.logicalRef !== null) { const ref = ekle.logicalRef; return (db) => basariYaz(db, o, p, 'gonderildi', ref); }
    return (db) => denemeYaz(db, o, p, g, 'belirsiz', 'Köprü başarı dedi ama kayıt numarası vermedi; sonraki denemede "var mı" okunacak.', o.saat(), BELIRSIZ_BEKLEME_MS);
  }
  if (ekle.tur === 'belirsiz') return (db) => denemeYaz(db, o, p, g, 'belirsiz', ekle.ileti, o.saat(), BELIRSIZ_BEKLEME_MS);
  o.bellek.acmaIstekleri.delete(p.id);
  return (db) => denemeYaz(db, o, p, g, ekle.tur, ekle.ileti, null, kopruBeklemesi(ekle));
}

async function hazirla(db: Db, o: ProjeTurOrtami): Promise<TurSonucu | (() => Promise<Yazici>)> {
  if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
  if (!(await sistemAyariOku(db, PROJE_AYARI))) return { tur: 'proje-kapali' };
  if (o.kopru === null) return { tur: 'ortam-degiskeni-yok' };
  const kopru = o.kopru;
  const simdi = o.saat();
  if (o.kurulum.son !== null && simdi.getTime() - o.kurulum.son.getTime() < PROJE_KURULUM_BEKLEME_MS) {
    return { tur: 'proje-kurulum-bekliyor', ileti: o.kurulum.ileti ?? '' };
  }
  const logoda = new Set((await s.logodakiProjeler(db)).map((x) => x.belgeNo));
  const kuyruk = (await o.kaynak.aktifProjeler(db)).filter((p) => !logoda.has(p.id)).slice(0, KUYRUK_SINIRI);
  if (kuyruk.length === 0) return { tur: 'bos' };
  const satirlar = new Map<number, GidenSatiri>();
  for (const g of await s.gidenSatirlari(db, 'proje', kuyruk.map((p) => p.id))) satirlar.set(g.belgeNo, g);
  for (const p of kuyruk) {
    const g = satirlar.get(p.id) ?? null;
    const taze = g?.niyetZamani != null && o.bellek.niyetler.get(p.id) === g.niyetZamani.getTime();
    const eylem = kartEylemi(g, simdi, taze, o.bellek.acmaIstekleri.get(p.id) ?? null);
    if (eylem === 'bekle') continue;
    const r = projeGovdesi(p);
    if ('hata' in r) return denemeYaz(db, o, p, g, 'reddedildi', r.hata, undefined);
    if (eylem === 'niyet-yaz') {
      await s.niyetYaz(db, 'proje', p.id, simdi);
      o.bellek.niyetler.set(p.id, simdi.getTime());
      return { tur: 'proje-niyet', no: p.id };
    }
    o.bellek.niyetler.delete(p.id);
    return () => gonder(o, kopru, p, g, r.govde);
  }
  return { tur: 'bos' };
}

// Tur iki kısa transaction'dır; köprü cevabı aralarında, transaction dışında beklenir. Turda en çok bir proje.
export async function projeTuru(vt: TxAcan, o: ProjeTurOrtami): Promise<TurSonucu> {
  const adim = await vt.tx((db) => hazirla(db, o));
  if (typeof adim !== 'function') return adim;
  const yaz = await adim();
  return vt.tx(yaz);
}

// 3315 madde 7: proje kartı kaydedilince duran (Logo'nun reddettiği) proje yeniden sıraya girer; "Yeniden gönder" gerekmez.
export async function projeDegisti(db: Db, projeId: number, simdi: Date): Promise<void> {
  await s.duraniYenidenAc(db, 'proje', projeId, simdi);
}

// 3315 madde 10 (cevap 3315 a): kapalıyken belgeler proje kodu olmadan gider.
export const PROJE_GONDERILMEZ = 'Proje Logo\'ya gönderilmiyor (Sistem Ayarları\'nda kapalı); belgeler proje kodu olmadan gider.';
export const PROJE_AKTIF_DEGIL = 'Yalnız aktif proje Logo\'ya açılır.';
export const PROJE_SIRADA = 'İlk turda Logo\'ya açılır.';
export const PROJE_DURDU_EKI = 'Proje kartını düzeltip kaydedin; yeniden gider.';

// Proje kartının "Logo" satırı; yalnız okur. Proje yoksa null.
export async function projeLogoDurumu(db: Db, projeId: number): Promise<LogoProjeDurumuCevabi | null> {
  const p = await projeGetir(db, projeId);
  if (p === null) return null;
  if ((await s.logodakiProjeler(db, [projeId])).length > 0) return { durum: 'logoda', logoKodu: p.kod, metin: null };
  if ((await sistemAyariOku(db, 'logo.baglanti')) !== true || (await sistemAyariOku(db, PROJE_AYARI)) !== true) {
    return { durum: 'gonderilmez', logoKodu: null, metin: PROJE_GONDERILMEZ };
  }
  if (p.durum !== 'aktif') return { durum: 'gonderilmez', logoKodu: null, metin: PROJE_AKTIF_DEGIL };
  const g = await s.gidenSatiri(db, 'proje', projeId);
  if (g === null || g.sonSonuc === null) return { durum: 'sirada', logoKodu: null, metin: PROJE_SIRADA };
  if (durduMu(g)) return { durum: 'durdu', logoKodu: null, metin: kirp(`${g.sonHata ?? 'Logo reddetti.'} ${PROJE_DURDU_EKI}`) };
  return { durum: 'yeniden-denenecek', logoKodu: null, metin: kirp(`${g.sonHata ?? 'Gönderilemedi.'} Kendiliğinden yeniden denenir.`) };
}
