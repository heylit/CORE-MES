import type { Db } from '#cekirdek/db.ts';
import { createHash } from 'node:crypto';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { BaslangicSatirDenetimi, SayimCevabi, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { iadeAdediEngeli, iadeEngeli, iadeHedefTuru, type IadeDurumu } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { baslangicDenetle, baslangicYukle } from './baslangic.ts';
import { anaDepo } from './depo.ts';
import { sayimYap } from './hareket.ts';
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

// `kaynakKonumId` (3762): kullanıcının seçtiği raf gözü; verilmezse takımın en dolu gözü.
export interface TakimCikisi { malzemeId: number; adet: number; kisiId: number | null; istasyonId: number | null; uretimEmriId: number | null; kaynakKimligi: string; kaynakKonumId?: number | null }
// Depo çıkarır, alan alır: kayıt yolda açılır; kişiye giden teslimi yalnız o kişi, istasyona gideni kapsamındaki kişi alır (K3).
export async function takimCikisi(db: Db, k: Kullanici, g: TakimCikisi): Promise<TeslimCevabi> {
  if ((g.kisiId === null) === (g.istasyonId === null)) throw dogrulama('Alan olarak kişi ya da istasyondan biri seçilir.', 'kisiId');
  const kaynak = g.kaynakKonumId == null ? await sorgular.malzemeRafKonumu(db, g.malzemeId) : await secilenGoz(db, g.malzemeId, g.kaynakKonumId);
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

async function secilenGoz(db: Db, malzemeId: number, konumId: number): Promise<number> {
  if ((await sorgular.rafGozuMu(db, konumId)) === null) throw dogrulama('Seçilen yer aktif bir raf gözü değil.', 'konumKimligi');
  if ((await sorgular.takimGozleri(db, [malzemeId])).every((g) => g.konumId !== konumId)) throw dogrulama('Seçilen gözde bu takım yok.', 'konumKimligi');
  return konumId;
}

// ---- 3762: açılış ve kör sayım ---------------------------------------------------------------------------------------------------
// Boş göze giriş açılıştır: Stok'un başlangıç belgesi (tek satır, geri alınabilir). Dolu göze giriş sayımdır: kör sayım, fark eşiğe göre
// onaya düşer. Hangisinin yapılacağına sunucu karar verir; ekran yalnız sonucu önceden gösterir.
export interface TakimGirisi { malzemeId: number; konumId: number; adet: number; istekKimligi: string }
export type GozTuru = 'acilis' | 'sayim';
export async function gozTuru(db: Db, malzemeId: number, konumId: number): Promise<GozTuru> {
  if ((await sorgular.rafGozuMu(db, konumId)) === null) throw dogrulama('Seçilen yer aktif bir raf gözü değil.', 'konumKimligi');
  return (await sorgular.takimGozPartileri(db, malzemeId, konumId)).length === 0 ? 'acilis' : 'sayim';
}

const ozet = (metin: string): string => createHash('sha256').update(metin).digest('hex');
const ilkHata = (d: readonly BaslangicSatirDenetimi[]): string => d.flatMap((s) => s.hatalar.map((h) => h.ileti))[0] ?? 'Açılış yazılamadı.';

// Boş göz kilitsiz okunur; iki kişi aynı boş göze aynı anda açılış yazmasın diye başlangıç kilidi alınıp göz kilit altında yeniden okunur.
export async function takimAcilisi(db: Db, k: Kullanici, g: TakimGirisi): Promise<{ belgeNo: string }> {
  await sorgular.baslangicKilidi(db);
  if ((await gozTuru(db, g.malzemeId, g.konumId)) !== 'acilis') throw cakisma('Bu gözde bu takım var; giriş sayım olarak yapılır.', { konumId: g.konumId });
  const r = await baslangicYukle(db, k, {
    dosyaOzeti: ozet(`takimhane-acilis:${g.istekKimligi}`), dosyaAdi: 'Takımhane açılışı', duzeltmeler: [],
    satirlar: [{ sira: 1, malzemeId: g.malzemeId, konumId: g.konumId, miktar: String(g.adet) }],
  });
  if (r.belge === null) throw dogrulama(ilkHata(r.denetim?.satirlar ?? []), 'adet');
  return { belgeNo: r.belge.no };
}

// Lotlu takımda gözde tek lot varsa sayım o lota yazılır; birden çok lot varsa toplam lotlara bölünemez, sayım Stok ekranından lot lot yapılır.
export async function takimSayimi(db: Db, kisiId: number, g: Omit<TakimGirisi, 'istekKimligi'>): Promise<SayimCevabi> {
  if ((await gozTuru(db, g.malzemeId, g.konumId)) !== 'sayim') throw cakisma('Bu gözde bu takım yok; giriş açılış olarak yapılır.', { konumId: g.konumId });
  const partiler = await sorgular.takimGozPartileri(db, g.malzemeId, g.konumId);
  if (partiler.length > 1) throw dogrulama('Bu gözde takımın birden çok lotu var; sayım Stok > Sayım ekranında lot lot yapılır.', 'konumKimligi');
  return sayimYap(db, kisiId, { konumId: g.konumId, satirlar: [{ malzemeId: g.malzemeId, partiId: partiler[0]!.partiId, sayilanMiktar: String(g.adet) }] });
}

// Toplu giriş (Excel): her satır gözüne göre açılış ya da sayım olur. Açılışlar tek başlangıç belgesine yazılır (ya hepsi ya hiçbiri); engel
// varsa hiçbir şey yazılmaz. Sayım satırları açılış belgesinden sonra aynı işlemde yazılır.
export interface TopluSatir { sira: number; malzemeId: number; gozKodu: string; adet: number }
export interface TopluSatirSonucu { sira: number; konumId: number | null; tur: GozTuru | null; hata: string | null }
export async function takimTopluDenetle(db: Db, satirlar: readonly TopluSatir[]): Promise<TopluSatirSonucu[]> {
  const gozler = new Map((await sorgular.rafGozleriKodla(db, [...new Set(satirlar.map((s) => s.gozKodu.trim()))])).map((g) => [g.kod.toUpperCase(), g]));
  const dolu = new Set((await sorgular.takimGozleri(db, [...new Set(satirlar.map((s) => s.malzemeId))])).map((g) => `${String(g.malzemeId)}|${String(g.konumId)}`));
  const ilk = new Set<string>();
  const sonuc = satirlar.map((s): TopluSatirSonucu => {
    const goz = gozler.get(s.gozKodu.trim().toUpperCase());
    if (goz === undefined) return { sira: s.sira, konumId: null, tur: null, hata: 'Raf gözü bulunamadı.' };
    const anahtar = `${String(s.malzemeId)}|${String(goz.konumId)}`;
    if (ilk.has(anahtar)) return { sira: s.sira, konumId: goz.konumId, tur: null, hata: 'Aynı takım aynı göze iki satırda; tek satıra indirilir.' };
    ilk.add(anahtar);
    return { sira: s.sira, konumId: goz.konumId, tur: dolu.has(anahtar) ? 'sayim' : 'acilis', hata: null };
  });
  const acilislar = sonuc.flatMap((r, i) => (r.tur === 'acilis' ? [{ r, s: satirlar[i]! }] : []));
  if (acilislar.length > 0) {
    const d = await baslangicDenetle(db, { satirlar: acilislar.map(({ r, s }) => ({ sira: s.sira, malzemeId: s.malzemeId, konumId: r.konumId!, miktar: String(s.adet) })) });
    const hatalar = new Map(d.satirlar.filter((x) => x.hatalar.length > 0).map((x) => [x.sira, x.hatalar[0]!.ileti]));
    for (const r of sonuc) if (hatalar.has(r.sira)) r.hata = hatalar.get(r.sira)!;
  }
  for (const [i, r] of sonuc.entries()) {
    if (r.tur !== 'sayim') continue;
    if ((await sorgular.takimGozPartileri(db, satirlar[i]!.malzemeId, r.konumId!)).length > 1) r.hata = 'Gözde birden çok lot var; Stok > Sayım ekranında sayılır.';
  }
  return sonuc;
}

export async function takimTopluYaz(db: Db, k: Kullanici, g: { satirlar: readonly TopluSatir[]; dosyaOzeti: string; dosyaAdi: string }): Promise<{ sonuc: TopluSatirSonucu[]; belgeNo: string | null; sayim: number }> {
  await sorgular.baslangicKilidi(db);
  const sonuc = await takimTopluDenetle(db, g.satirlar);
  if (sonuc.some((r) => r.hata !== null)) return { sonuc, belgeNo: null, sayim: 0 };
  const acilislar = sonuc.flatMap((r, i) => (r.tur === 'acilis' ? [{ r, s: g.satirlar[i]! }] : []));
  let belgeNo: string | null = null;
  if (acilislar.length > 0) {
    const y = await baslangicYukle(db, k, {
      dosyaOzeti: g.dosyaOzeti, dosyaAdi: g.dosyaAdi, duzeltmeler: [],
      satirlar: acilislar.map(({ r, s }) => ({ sira: s.sira, malzemeId: s.malzemeId, konumId: r.konumId!, miktar: String(s.adet) })),
    });
    if (y.belge === null) throw dogrulama(ilkHata(y.denetim?.satirlar ?? []), 'satirlar');
    belgeNo = y.belge.no;
  }
  let sayim = 0;
  for (const [i, r] of sonuc.entries()) {
    if (r.tur !== 'sayim') continue;
    await takimSayimi(db, k.id, { malzemeId: g.satirlar[i]!.malzemeId, konumId: r.konumId!, adet: g.satirlar[i]!.adet });
    sayim += 1;
  }
  return { sonuc, belgeNo, sayim };
}
