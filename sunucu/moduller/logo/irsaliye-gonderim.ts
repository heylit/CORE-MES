import type { Db } from '#cekirdek/db.ts';
import { kayitNoktasi } from '#cekirdek/db.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { IRSALIYE_ARAMA_TURU, IRSALIYE_GIDEN_TURLERI } from './irsaliye-etiket-esleme.ts';
import type { IrsaliyeGidenTuru } from './irsaliye-etiket-esleme.ts';
import { yazmaKapisi } from './irsaliye-yazma-kapisi.ts';
import type { IrsaliyeTuru } from './irsaliye-yazma-kapisi.ts';
import { irsaliyeGovdesi, irsaliyeKalkani } from './irsaliye-yazma-kurallari.ts';
import type { KabulBelgesi } from './irsaliye-yazma-kurallari.ts';
import { satisIrsaliyeGovdesi } from './satis-irsaliye-govdesi.ts';
import type { SevkBelgesi } from './satis-irsaliye-kurallari.ts';
import { kimlikSuz } from './kimlik-suz.ts';
import { BELGE_ARAMA_SONUC_SINIRI, BELIRSIZ_BEKLEME_MS, denemeZamaniMi, geriCekilmeMs, kirp, SONUCU_BILINMIYOR } from './kurallar.ts';
import type { GidenSonucu } from './kurallar.ts';
import { BELGE_ARAMA_GUN, basarisizAcma, kalkanEylemi, turuKos } from './servis.ts';
import type { Bildir, KopruAdimi, LogoAyarAnahtari, TurOrtami, TurSonucu, TxAcan, Yazici } from './servis.ts';
import * as s from './sorgular.ts';

// Mal kabul (3665) ve sevk (3684) irsaliyesinin gönderim turu. KAPALI: ayar, ölçüm kapısı ve köprü değişkenleri birlikte açılmadan tek istek çıkmaz.
// Kapı her turda yeniden denetlenir (Risk N1): ayar açık kalsa da ölçüm durumu geri alınırsa gönderim durur. Henüz hiçbir iş bu turu çağırmaz;
// kaynak bağı (mal kabul ve sevkiyatın disari.ts işlevleri) ve iş kaydı ekran dilimiyle gelir.
export type GidecekIrsaliye =
  | { tur: 'satin-alma-irsaliyesi'; id: number; belge: KabulBelgesi }
  | { tur: 'satis-irsaliyesi' | 'konsinye-irsaliyesi'; id: number; belge: SevkBelgesi };

export interface IrsaliyeKaynagi {
  // Yalnız verilen türlerin gidecekleri; kaynak stok ve sipariş kalanını okuyup belgeyi hazırlar (Risk N3, N4: açılış öncesi açık).
  // atla: bu turda gidemeyecek (Logo'ya gitmiş, durmuş, beklemede) satırlar; kaynak bunları saymadan en çok sinir kadar yeni belge döner.
  gidecekler(db: Db, a: { turler: readonly IrsaliyeGidenTuru[]; sinir: number; atla: readonly { tur: IrsaliyeGidenTuru; id: number }[] }): Promise<GidecekIrsaliye[]>;
  sonuc(db: Db, tur: IrsaliyeGidenTuru, id: number, sonuc: { kayitNo: string } | { hata: string }): Promise<void>;
  // Verilen kimliklerden kaynakta hâlâ var olanlar; olmayanın Logo'ya gitmemiş giden kutusu satırı silinir (tablo yabancı anahtar taşıyamaz: tür başına kaynak tablo ayrı).
  varOlanlar(db: Db, tur: IrsaliyeGidenTuru, idler: readonly number[]): Promise<ReadonlySet<number>>;
}
export interface IrsaliyeTurOrtami extends TurOrtami {
  kaynak: IrsaliyeKaynagi;
}

const AYAR: Readonly<Record<IrsaliyeGidenTuru, LogoAyarAnahtari>> = Object.freeze({
  'satin-alma-irsaliyesi': 'logo.satin-alma-irsaliyesi', 'satis-irsaliyesi': 'logo.sevk-irsaliyesi', 'konsinye-irsaliyesi': 'logo.sevk-irsaliyesi',
});
const KAPI_TURU: Readonly<Record<IrsaliyeGidenTuru, IrsaliyeTuru>> = Object.freeze({
  'satin-alma-irsaliyesi': 'satin_alma', 'satis-irsaliyesi': 'satis', 'konsinye-irsaliyesi': 'konsinye',
});
const SATIS_TURU: Readonly<Record<'satis-irsaliyesi' | 'konsinye-irsaliyesi', SevkBelgesi['tur']>> = Object.freeze({
  'satis-irsaliyesi': 'toptan', 'konsinye-irsaliyesi': 'konsinye',
});
const KUYRUK_SINIRI = 20;
const ATLANACAK_SINIRI = 500;

// Açılabilen türler: ayarı açık VE ölçüm kapısı açık.
export async function acikIrsaliyeTurleri(db: Db): Promise<IrsaliyeGidenTuru[]> {
  const acik: IrsaliyeGidenTuru[] = [];
  for (const t of IRSALIYE_GIDEN_TURLERI) {
    if (yazmaKapisi(KAPI_TURU[t]).acik && (await sistemAyariOku(db, AYAR[t]))) acik.push(t);
  }
  return acik;
}

const YETIM_SINIRI = 50;
// Kaynağı silinmiş, Logo'ya hiç gitmemiş satırlar kutudan düşer; Logo'da kaydı ya da niyeti olan satıra dokunulmaz.
async function yetimleriTemizle(db: Db, kaynak: IrsaliyeKaynagi): Promise<void> {
  const adaylar = await s.irsaliyeYetimAdaylari(db, YETIM_SINIRI);
  for (const tur of IRSALIYE_GIDEN_TURLERI) {
    const idler = adaylar.filter((a) => a.belgeTuru === tur).map((a) => a.belgeNo);
    if (idler.length === 0) continue;
    const var_ = await kaynak.varOlanlar(db, tur, idler);
    for (const id of idler) if (!var_.has(id)) await s.irsaliyeYetimSil(db, tur, id);
  }
}

export function irsaliyeGovdesiHazirla(g: GidecekIrsaliye): { govde: Record<string, unknown> } | { hata: string } {
  if (g.tur === 'satin-alma-irsaliyesi') return irsaliyeGovdesi(g.belge);
  if (g.belge.tur !== SATIS_TURU[g.tur]) return { hata: 'Sevk türü giden kutusu türüyle uyuşmuyor.' };
  return satisIrsaliyeGovdesi(g.belge);
}

export function irsaliyeTuru(vt: TxAcan, o: IrsaliyeTurOrtami): Promise<TurSonucu> {
  return turuKos(vt, (db) => irsaliyeHazirla(db, o));
}

async function irsaliyeHazirla(db: Db, o: IrsaliyeTurOrtami): Promise<TurSonucu | KopruAdimi> {
  if (!(await sistemAyariOku(db, 'logo.baglanti'))) return { tur: 'kapali' };
  const turler = await acikIrsaliyeTurleri(db);
  if (turler.length === 0) return { tur: 'irsaliye-yazma-kapali' };
  const kopru = o.kopru;
  if (kopru === null) return { tur: 'ortam-degiskeni-yok' };
  await yetimleriTemizle(db, o.kaynak);
  const atla = await s.irsaliyeAtlanacaklar(db, o.saat(), ATLANACAK_SINIRI);
  for (const k of await o.kaynak.gidecekler(db, { turler, sinir: KUYRUK_SINIRI, atla })) {
    if (!turler.includes(k.tur)) continue;
    const g = await s.gidenSatiri(db, k.tur, k.id);
    if (g?.logoKayitNo != null) continue;
    if (!denemeZamaniMi(g, o.saat())) continue;
    const { anahtar, taze, eylem } = await kalkanEylemi(o, k.tur, k.id, g);
    if (eylem === 'bekle') continue;
    const bildir: Bildir<{ kayitNo: string } | { hata: string }> = (yazDb, x) => o.kaynak.sonuc(yazDb, k.tur, k.id, x);
    const basarisiz = (sonuc: GidenSonucu, hata: string, niyet: Date | null | undefined, bekleme?: number): Yazici<TurSonucu> =>
      async (yazDb) => ({ tur: 'irsaliye', no: k.id, belge: k.tur, sonuc: await basarisizAcma(yazDb, o, k.tur, k.id, g, bildir, sonuc, kirp(kimlikSuz(hata)), niyet, bekleme) });
    const r = irsaliyeGovdesiHazirla(k);
    if ('hata' in r) return basarisiz('reddedildi', r.hata, undefined)(db);
    if (eylem === 'gonder' && !taze) return basarisiz('reddedildi', SONUCU_BILINMIYOR, undefined)(db);
    if (eylem === 'niyet-yaz') {
      const niyet = o.saat();
      await s.niyetYaz(db, k.tur, k.id, niyet);
      o.bellek.niyetler.set(anahtar, niyet.getTime());
      return { tur: 'irsaliye-niyet', no: k.id, belge: k.tur };
    }
    o.bellek.niyetler.delete(anahtar);
    const kalkanBelgesi = { no: k.belge.no, irsaliyeNo: k.tur === 'satin-alma-irsaliyesi' ? (k.belge as KabulBelgesi).irsaliyeNo ?? '' : k.belge.no, cariKodu: k.belge.cariKodu ?? '' };
    return async (): Promise<Yazici<TurSonucu>> => {
      // Çift kayıt kalkanı: göndermeden hemen önce Logo'da aynı fiş (NOTES1 tam sözcük, fiş no, cari + belge no) aranır.
      const ara = await kopru.belgeAra(IRSALIYE_ARAMA_TURU[k.tur], k.belge.no, BELGE_ARAMA_GUN);
      if (ara.tur !== 'basarili') return basarisiz('ulasilamadi', `Logo'da aynı irsaliye var mı bakılamadı: ${ara.ileti}`, undefined);
      const karar = irsaliyeKalkani(kalkanBelgesi, ara.veri, ara.veri.length >= BELGE_ARAMA_SONUC_SINIRI);
      if (karar.karar === 'yapilamadi') return basarisiz('reddedildi', karar.ileti, undefined);
      if (karar.karar === 'esle') return kayitYaz(o, k, g, String(karar.logoKayitNo), 'zaten-vardi', bildir);
      o.bellek.acmaIstekleri.set(anahtar, o.saat());
      const ekle = await kopru.irsaliyeEkle(k.tur, r.govde);
      if (ekle.tur === 'basarili') {
        if (ekle.logicalRef === null) return basarisiz('belirsiz', "Köprü başarı dedi ama irsaliye kayıt numarası vermedi; Logo'da kontrol edin.", o.saat(), BELIRSIZ_BEKLEME_MS);
        o.bellek.acmaIstekleri.delete(anahtar);
        return kayitYaz(o, k, g, String(ekle.logicalRef), 'gonderildi', bildir);
      }
      if (ekle.tur === 'belirsiz') return basarisiz('belirsiz', ekle.ileti, o.saat(), BELIRSIZ_BEKLEME_MS);
      o.bellek.acmaIstekleri.delete(anahtar);
      return basarisiz(ekle.tur, ekle.ileti, null);
    };
  }
  return { tur: 'bos' };
}

function kayitYaz(
  o: IrsaliyeTurOrtami, k: GidecekIrsaliye, g: s.GidenSatiri | null, kayitNo: string, sonuc: 'gonderildi' | 'zaten-vardi', bildir: Bildir<{ kayitNo: string } | { hata: string }>,
): Yazici<TurSonucu> {
  return async (yazDb) => {
    const b = await kayitNoktasi(yazDb, () => bildir(yazDb, { kayitNo }));
    const simdi = o.saat();
    // İrsaliye Logo'da açıldı ama CORE kaydı almadı: niyet korunur, ikinci kez kendiliğinden gitmez.
    if (!b.tamam) {
      await s.denemeYaz(yazDb, k.tur, k.id, {
        zaman: simdi, sonuc: 'yazilamadi', hata: kirp(kimlikSuz(`Logo irsaliye kaydı ${kayitNo}. CORE kaydı yazılamadı; Logo'da kontrol edin.`)), logoKayitNo: null, niyetZamani: undefined,
        sonrakiDeneme: new Date(simdi.getTime() + geriCekilmeMs((g?.ardisikHata ?? 0) + 1)), basarili: false,
      });
      return { tur: 'irsaliye', no: k.id, belge: k.tur, sonuc: 'yazilamadi' };
    }
    await s.denemeYaz(yazDb, k.tur, k.id, { zaman: simdi, sonuc, hata: null, logoKayitNo: kayitNo, niyetZamani: null, sonrakiDeneme: null, basarili: true });
    return { tur: 'irsaliye', no: k.id, belge: k.tur, sonuc };
  };
}
