import { kayitNoktasi, type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import type {
  SifirlamaAdaylariCevabi, SifirlamaCevabi, SifirlamaKomutu, SonDuzeltmelerCevabi, TopluSayimOnayCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeOzeti } from '../../malzemeler/disari.ts';
import { binde, bindenMetin, partiEtiketi, sifirlamaKartEngeli, sifirlamaSatirEngeli, stoklanirMi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { adlar, emirNoDe, emirNoHaritasi, korumali, siraliKilitle } from './ortak.ts';
import { sayimFarkiOnayYaz, sayimFarklari } from './hareket.ts';

// ---- Sayım ve düzeltme (3417 a) -------------------------------------------------------------------------------------------------
const anahtar = (konumId: number, partiId: number | null) => `${konumId}:${partiId ?? ''}`;

async function kartRezerveleri(db: Db, malzemeId: number) {
  const r = await sorgular.rezerveler(db, [malzemeId]);
  const nolar = await emirNoHaritasi(db, r.map((x) => x.uretimEmriId));
  return r.map((x) => ({ uretimEmriId: x.uretimEmriId, emirNo: emirNoDe(nolar, x.uretimEmriId), statuId: x.statuId, miktar: x.miktar }));
}

// Kartın bütün bakiye satırları ve sıfırlanamayanların nedeni; sıfırlama ekranı bunu gösterir.
export async function sifirlamaAdaylari(db: Db, malzemeId: number): Promise<SifirlamaAdaylariCevabi> {
  const kart = await malzemeOzeti(db, malzemeId);
  if (!kart) throw bulunamadi('Malzeme kartı bulunamadı.');
  const bakiyeler = await sorgular.sifirlamaBakiyeleri(db, malzemeId);
  const bekleyen = await sorgular.bekleyenFarkAnahtarlari(db, malzemeId);
  const rezerveler = await kartRezerveleri(db, malzemeId);
  const ayirmaIstekleri = await sorgular.acikAyirmaIstekleri(db, malzemeId);
  const bekleyenler = new Set(bekleyen.map((b) => anahtar(b.konumId, b.partiId)));
  const nolar = await emirNoHaritasi(db, bakiyeler.map((b) => b.partiEmirId));
  return {
    malzemeId, malzemeAd: kart.ad, kod: kart.kod, birim: kart.birim,
    satirlar: bakiyeler.map((b) => ({
      konumId: b.konumId, konumKod: b.konumKod, depoKod: b.depoKod, partiId: b.partiId,
      partiEtiketi: b.partiId === null ? null : partiEtiketi({ lotNo: b.lotNo, tedarikciPartiNo: b.tedarikciPartiNo, dokumNo: b.dokumNo, uretimEmriId: b.partiEmirId }, emirNoDe(nolar, b.partiEmirId)),
      miktar: b.miktar, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu, engel: sifirlamaSatirEngeli(b, bekleyenler.has(anahtar(b.konumId, b.partiId))),
    })),
    rezerveler, ayirmaIstekleri,
  };
}

// Seçilen serbest satırlar sıfıra inmek üzere sayım farkı olarak onaya gider; deponun eşiğinden bağımsız her zaman (3417 a madde 4).
// Stok bu komutla değişmez; ikinci yetkili onaylayınca sayım eksiği (ya da eksi bakiyede fazlası) yazılır.
export async function sifirla(db: Db, kisiId: number, g: SifirlamaKomutu): Promise<SifirlamaCevabi> {
  const malzemeId = Number(g.malzemeId);
  const kart = await malzemeOzeti(db, malzemeId);
  if (!kart) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (!stoklanirMi(kart.tur)) throw dogrulama(`${kart.ad ?? kart.kod}: hizmet stoklanmaz.`, 'malzemeId');
  const satirlar = g.satirlar.map((s) => ({ konumId: Number(s.konumId), partiId: s.partiId === null ? null : Number(s.partiId), beklenen: s.beklenenMiktar }));
  if (new Set(satirlar.map((s) => anahtar(s.konumId, s.partiId))).size !== satirlar.length) throw dogrulama('Aynı göz ve parti iki kez seçilmiş.', 'satirlar');
  let onayaGiden = 0;
  await korumali(async () => {
    await sorgular.rezerveKilidi(db, malzemeId);
    const engel = sifirlamaKartEngeli(await kartRezerveleri(db, malzemeId), await sorgular.acikAyirmaIstekleri(db, malzemeId));
    if (engel !== null) throw gecersiz(engel);
    await siraliKilitle(db, ...satirlar.map((s) => ({ malzemeId, konumId: s.konumId, partiId: s.partiId })));
    for (const s of satirlar) {
      const k = await sorgular.konumBul(db, s.konumId);
      if (!k || !k.aktif) throw gecersiz('Konum bulunamadı ya da pasif; ekranı yenileyin.');
      const b = await sorgular.bakiyeKilitle(db, malzemeId, s.konumId, s.partiId);
      const sistem = b?.miktar ?? '0';
      if (binde(sistem) !== binde(s.beklenen)) {
        throw cakisma(`${k.kod}: stok ekranı açtıktan sonra değişti; listeyi yenileyip yeniden seçin.`, { konumId: s.konumId, partiId: s.partiId, guncel: sistem });
      }
      if (binde(sistem) === 0n) continue;
      const id = await sorgular.sayimFarkiEkle(db, {
        konumId: s.konumId, malzemeId, partiId: s.partiId, sistemMiktar: bindenMetin(binde(sistem)), sayilanMiktar: '0', sayanKisiId: kisiId,
        sifirlama: { neden: g.neden, aciklama: g.aciklama ?? null },
      });
      if (id === null) throw cakisma(`${k.kod}: bu gözde bu malzemenin onay bekleyen farkı var; önce o karara bağlanır.`, { konumId: s.konumId, partiId: s.partiId });
      onayaGiden += 1;
    }
  });
  return { onayaGiden };
}

// Seçilenleri onayla: her fark kendi ara kaydında yazılır; reddedilen (kendi sayımı, eski sürüm, karar verilmiş) ötekileri durdurmaz.
export async function sayimFarklariniOnayla(db: Db, kisiId: number, g: { farklar: { id: number; surum: number }[] }): Promise<TopluSayimOnayCevabi> {
  const sonuclar: TopluSayimOnayCevabi['sonuclar'] = [];
  for (const f of g.farklar) {
    const id = Number(f.id);
    const r = await kayitNoktasi(db, () => sayimFarkiOnayYaz(db, kisiId, id, { surum: f.surum }));
    sonuclar.push({ id, tamam: r.tamam, ileti: r.tamam ? null : r.hata.message });
  }
  return { ...(await sayimFarklari(db)), sonuclar };
}

const SON_DUZELTME_SINIRI = 500;
export async function sonDuzeltmeler(db: Db, gun: number): Promise<SonDuzeltmelerCevabi> {
  const ham = await sorgular.sonDuzeltmeler(db, gun, SON_DUZELTME_SINIRI);
  const l = ham.slice(0, SON_DUZELTME_SINIRI);
  const ad = await adlar(db, l.map((h) => h.malzemeId));
  const kisiler = await kisiAdlari(db, [...new Set(l.flatMap((h) => (h.onaylayanKisiId === null ? [h.sayanKisiId] : [h.sayanKisiId, h.onaylayanKisiId])))]);
  const nolar = await emirNoHaritasi(db, l.map((h) => h.partiEmirId));
  return {
    satirlar: l.map((h) => ({
      hareketId: h.hareketId, fisNo: h.fisNo, zaman: h.zaman, konumId: h.konumId, konumKod: h.konumKod, malzemeId: h.malzemeId, malzemeAd: ad.get(h.malzemeId) ?? null,
      partiEtiketi: h.partiId === null ? null : partiEtiketi({ lotNo: h.lotNo, tedarikciPartiNo: h.tedarikciPartiNo, dokumNo: h.dokumNo, uretimEmriId: h.partiEmirId }, emirNoDe(nolar, h.partiEmirId)),
      fark: h.tur === 'sayim_fazla' ? bindenMetin(binde(h.miktar)) : bindenMetin(-binde(h.miktar)),
      kaynak: h.kaynak, neden: h.neden, sayanAd: kisiler.get(h.sayanKisiId) ?? null,
      onaylayanAd: h.onaylayanKisiId === null ? null : kisiler.get(h.onaylayanKisiId) ?? null, geriAlindi: h.geriAlindi,
    })),
    kesildi: ham.length > SON_DUZELTME_SINIRI,
  };
}
