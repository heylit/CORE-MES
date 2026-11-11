import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, gecersiz } from '#cekirdek/hata.ts';
import type { DisDuzeltmeKaydi, DisSiparisCevabi, DisSiparisDuzeltGovdesi } from '#paylasilan/sozlesme/logo.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { coreSiparisiMi } from '../satin-alma/disari.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { disSiparisDuzeltmeGovdesi, siparisIcerikIzi } from './kurallar.ts';
import type { DisSiparisDuzeltmesi } from './kurallar.ts';
import * as s from './sorgular.ts';
import { BEKLEME_NEDENLERI } from './servis.ts';
import type { TurSonucu, TxAcan } from './servis.ts';

// D7: Logo'da CORE MES dışında açılmış satın alma siparişini yerinde düzeltme (kararlar 2986 a, 2987 a; tasarım 2968/D7).
// Okuma kullanıcının isteğiyle anlık gider; düzeltme kuyruğa yazılır, iş gönderimden hemen önce Logo'yu yeniden okur (V3).

const YETKI = 'logo.siparis-duzelt';
export const CORE_SIPARISI_ILETISI = 'Bu fiş CORE MES siparişi; düzeltmesi Satın Alma\'daki siparişin kendi sayfasından yapılır.';
export const DEGISTI_ILETISI = 'Sipariş Logo\'da değişti; yeniden açın.';
const LISTE_SINIRI = 20;

// Logo kuyruğunun ya da satın almanın bildiği CORE MES siparişi düzeltilmez (iki yerden yazma olmaz). Yalnız evet/hayır (G3).
async function coreSiparisi(db: Db, no: string, ref: number): Promise<boolean> {
  return (await coreSiparisiMi(db, no, ref)) || (await s.coreSiparisiLogodaMi(db, no, ref));
}

type Kapali = { durum: 'kapali' | 'ortam-degiskeni-yok'; ileti: string };

async function kapi(vt: TxAcan, kopru: KopruIstemcisi | null): Promise<KopruIstemcisi | Kapali> {
  if ((await vt.tx((db) => sistemAyariOku(db, 'logo.baglanti'))) !== true) return { durum: 'kapali', ileti: BEKLEME_NEDENLERI.kapali };
  return kopru ?? { durum: 'ortam-degiskeni-yok', ileti: BEKLEME_NEDENLERI['ortam-degiskeni-yok'] };
}

// Her okuma deftere yazılır (G1): kim, hangi fiş, sonuç; fiyat yazılmaz. Okuma uç dışından çağrıldığı için defter elle yazılır.
export async function disSiparisOku(vt: TxAcan, kopru: KopruIstemcisi | null, kisiId: number, no: string): Promise<DisSiparisCevabi> {
  const k = await kapi(vt, kopru);
  if ('durum' in k) return { durum: k.durum, ileti: k.ileti, siparis: null, iz: null };
  const fisNo = no.trim();
  const r = await k.siparisIcerigiOku(fisNo);
  const sonuc = r.tur !== 'basarili' ? r.tur : r.veri === null ? 'yok' : 'okundu';
  await vt.tx((db) => denetimYaz(db, {
    kisiId, yontem: 'GET', yol: '/logo/dis-siparis', parametre: { no: fisNo, sonuc }, govde: null, modul: 'logo', yetki: YETKI,
  }));
  if (r.tur !== 'basarili') return { durum: 'hata', ileti: r.ileti, siparis: null, iz: null };
  const siparis = r.veri;
  if (siparis === null) return { durum: 'yok', ileti: 'Logo\'da bu numarayla satın alma siparişi yok.', siparis: null, iz: null };
  if (await vt.tx((db) => coreSiparisi(db, siparis.no, siparis.ref))) throw gecersiz(CORE_SIPARISI_ILETISI);
  return { durum: 'tamam', ileti: null, siparis, iz: siparisIcerikIzi(siparis) };
}

// Komut Logo'yu okumaz (transaction köprüyü beklemesin): istek ve okuma izi kuyruğa yazılır. Kuralın Logo'ya bağlı kısmı (kapalı satır,
// iptal, değişen sipariş) işte denetlenir ve sonuç iş kaydında görünür.
export async function disSiparisDuzelt(db: Db, kisiId: number, g: DisSiparisDuzeltGovdesi): Promise<DisDuzeltmeKaydi> {
  if ((await sistemAyariOku(db, 'logo.baglanti')) !== true) throw gecersiz(BEKLEME_NEDENLERI.kapali);
  const fisNo = g.no.trim();
  if (await coreSiparisiMi(db, fisNo, 0) || await s.coreSiparisiLogodaMi(db, fisNo, 0)) throw gecersiz(CORE_SIPARISI_ILETISI);
  const { no: _no, iz, ...duzeltme } = g;
  const id = await s.disDuzeltmeEkle(db, { fisNo, iz, duzeltme, kisiId });
  if (id === null) throw cakisma('Bu siparişin Logo\'ya gitmeyi bekleyen düzeltmesi var; sonucu gelince yeniden deneyin.');
  const kayit = await s.disDuzeltmeKaydi(db, id);
  if (kayit === null) throw bulunamadi();
  return kayit as DisDuzeltmeKaydi;
}

export async function disDuzeltmeleri(db: Db, no: string): Promise<DisDuzeltmeKaydi[]> {
  return (await s.disDuzeltmeleri(db, no.trim(), LISTE_SINIRI)) as DisDuzeltmeKaydi[];
}

export interface DisDuzeltmeOrtami {
  kopru: KopruIstemcisi | null;
  // Ortam anahtarı (TMIV2_LOGO_SIPARIS_DUZELTME); kapalıyken iş istek atmaz, kuyruk bekler.
  acik: () => boolean;
  saat: () => Date;
}

// Turda en çok bir düzeltme. Logo yeniden okunur: iz tutmuyorsa, sipariş yoksa ya da artık CORE MES siparişiyse yazılmaz (red).
// Gövde bu okumadan kurulur (G2: kayıt numarası istemciden gelmez). Gönderimin sonucu bilinmiyorsa (belirsiz) yinelenmez: "hata" olur,
// Logo'da elle bakılır; ulaşılamadıysa ya da yetki reddi geldiyse iş bekler, sonraki turda yeniden dener.
export async function disDuzeltmeTuru(vt: TxAcan, o: DisDuzeltmeOrtami): Promise<TurSonucu> {
  if (!o.acik()) return { tur: 'dis-duzeltme-kapali' };
  const k = await kapi(vt, o.kopru);
  if ('durum' in k) return { tur: k.durum };
  const is = await vt.tx((db) => s.siradakiDisDuzeltme(db));
  if (is === null) return { tur: 'bos' };
  const sonuclandir = async (durum: 'gonderildi' | 'reddedildi' | 'hata', hata: string | null,
    gonderilen: Parameters<typeof s.disDuzeltmeSonucu>[5] = null): Promise<TurSonucu> => {
    await vt.tx((db) => s.disDuzeltmeSonucu(db, is.id, durum, hata, o.saat(), gonderilen));
    return { tur: 'dis-duzeltme', no: is.id, sonuc: durum };
  };
  const okuma = await k.siparisIcerigiOku(is.fisNo);
  if (okuma.tur === 'reddedildi') return sonuclandir('reddedildi', okuma.ileti);
  if (okuma.tur !== 'basarili') return { tur: 'dis-duzeltme', no: is.id, sonuc: 'bekliyor' };
  const icerik = okuma.veri;
  if (icerik === null) return sonuclandir('reddedildi', 'Logo\'da bu numarayla satın alma siparişi yok.');
  if (await vt.tx((db) => coreSiparisi(db, icerik.no, icerik.ref))) return sonuclandir('reddedildi', CORE_SIPARISI_ILETISI);
  if (siparisIcerikIzi(icerik) !== is.iz) return sonuclandir('reddedildi', DEGISTI_ILETISI);
  const r = disSiparisDuzeltmeGovdesi(icerik, is.duzeltme as DisSiparisDuzeltmesi);
  if ('hata' in r) return sonuclandir('reddedildi', r.hata);
  const gonderilen = { logoKayitNo: icerik.ref, govde: r.govde, ozet: r.ozet };
  const yazma = await k.siparisGuncelle(r.govde);
  switch (yazma.tur) {
    case 'basarili': return sonuclandir('gonderildi', null, gonderilen);
    case 'reddedildi': return sonuclandir('reddedildi', yazma.ileti, gonderilen);
    case 'belirsiz': return sonuclandir('hata', `${yazma.ileti} Logo'da siparişe bakın; düzeltme kendiliğinden yinelenmez.`, gonderilen);
    case 'ulasilamadi': case 'yetkisiz': return { tur: 'dis-duzeltme', no: is.id, sonuc: 'bekliyor' };
  }
}
