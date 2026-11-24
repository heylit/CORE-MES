import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { iadeAdediEngeli, iadeEngeli, iadeHedefTuru, type IadeDurumu } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { anaDepo } from './depo.ts';
import { teslimGonder } from './uretim.ts';

// 3613 Takımhane: kişi konumu (zimmet), takım çıkışı ve iadesi. Bakiye tek defterdedir; çıkış ve iade mevcut teslim akışının üstüne oturur.
export async function kisiKonumunuSagla(db: Db, kisiId: number): Promise<number> {
  const var0 = await sorgular.kisiKonumu(db, kisiId);
  if (var0 !== null) return var0;
  const ad = (await kisiAdlari(db, [kisiId])).get(kisiId);
  if (ad === undefined) throw bulunamadi('Kişi bulunamadı.');
  const acilan = await sorgular.kisiKonumuAc(db, { depoId: await anaDepo(db), kod: `KSI-${String(kisiId)}`, ad: ad.slice(0, 60), kisiId });
  return acilan ?? (await sorgular.kisiKonumu(db, kisiId))!;
}

// 3613-S2: takım ver/al işlemi taşıyan kişi, yalnız bu iki akışta depo teslim işlemini (raf kaynağı, depoya bırakma) kullanır; stok.transfer'in
// başka kapıları (sepet teslimi, refakat, istekli teslim) bu yoldan açılmaz. Yetkiyi uç ister, burada ayrıca doğrulanır.
function takimYetkilisi(k: Kullanici): Kullanici {
  if (!islemVarMi(k, 'takimhane.cikis-iade')) throw yetkiYok();
  return islemVarMi(k, 'stok.transfer') ? k : { ...k, islemler: [...k.islemler, 'stok.transfer'] };
}

export interface TakimCikisi { malzemeId: number; adet: number; kisiId: number | null; istasyonId: number | null; uretimEmriId: number | null; kaynakKimligi: string }
// Depo çıkarır, alan alır: kayıt yolda açılır; kişiye giden teslimi yalnız o kişi, istasyona gideni kapsamındaki kişi alır (K3).
export async function takimCikisi(db: Db, k: Kullanici, g: TakimCikisi): Promise<TeslimCevabi> {
  if ((g.kisiId === null) === (g.istasyonId === null)) throw dogrulama('Alan olarak kişi ya da istasyondan biri seçilir.', 'kisiId');
  const kaynak = await sorgular.malzemeRafKonumu(db, g.malzemeId);
  if (kaynak === null) throw dogrulama('Bu takımın raf konumu yok; önce rafa giriş yapılır.', 'kartKimlik');
  const hedef = g.kisiId !== null ? { konumId: await kisiKonumunuSagla(db, g.kisiId) } : { istasyonId: g.istasyonId! };
  return teslimGonder(db, takimYetkilisi(k), {
    malzemeId: g.malzemeId, miktar: String(g.adet), statuId: null, kaynak: { konumId: kaynak }, hedef,
    uretimEmriId: g.uretimEmriId, kaynakKimligi: g.kaynakKimligi, not: 'Takımhane çıkışı',
  });
}

// `uretimEmriId`: iadenin hangi emrin çıkışından döndüğü (aparat, kart 3651); çıkıştaki emirle eşleşince emrin dışarıdaki adedi düşer.
export interface TakimIadesi { malzemeId: number; konumId: number; adet: number; durum: IadeDurumu; neden: string | null; kaynakKimligi: string; uretimEmriId?: number | null }
// Depo iadeyi elden alır: kayıt anında kapanır (bırakma), hedef iade durumuna göre raf, ara alan ya da hurda olur.
export async function takimIadesi(db: Db, k: Kullanici, g: TakimIadesi): Promise<TeslimCevabi> {
  const yetkili = takimYetkilisi(k);
  const engel = iadeEngeli(g.durum, g.neden) ?? iadeAdediEngeli(g.adet, Number.MAX_SAFE_INTEGER);
  if (engel !== null) throw dogrulama(engel, g.durum === 'kirik' && (g.neden ?? '').trim() === '' ? 'neden' : 'adet');
  const tur = iadeHedefTuru(g.durum);
  const hedef = tur === 'raf_gozu' ? await sorgular.malzemeRafKonumu(db, g.malzemeId) : await sorgular.ilkAktifKonum(db, tur);
  if (hedef === null) throw dogrulama(tur === 'raf_gozu' ? 'Bu takımın raf konumu yok; iade rafa alınamaz.' : `Hedef konum yok (${tur}); önce stok tanımlarından açılır.`, 'durum');
  const cevap = await teslimGonder(db, yetkili, {
    malzemeId: g.malzemeId, miktar: String(g.adet), statuId: null, kaynak: { konumId: g.konumId }, hedef: { konumId: hedef },
    uretimEmriId: g.uretimEmriId ?? null, kaynakKimligi: g.kaynakKimligi, birak: true, not: `Takımhane iadesi (${g.durum})`,
  });
  await sorgular.teslimIadeDurumuYaz(db, cevap.teslim.id, g.durum, g.durum === 'kirik' ? g.neden!.trim() : null);
  return cevap;
}
