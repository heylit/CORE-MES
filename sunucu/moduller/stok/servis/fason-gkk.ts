import { type Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama } from '#cekirdek/hata.ts';
import { bildirimKapat } from '../../bildirim/disari.ts';
import { malzemeOzetleri } from '../../malzemeler/disari.ts';
import { emirAdimlari, isEmriOzeti } from '../../uretim-emirleri/disari.ts';
import { FASON_GKK_GOREVI, binde, bindenMetin, fasonAdedi, fasonGkkBekleyeni, fasonGkkKarariEngeli, fasonGkkKaynagi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { fasonDonusMiktari } from './dis-akis.ts';
import { aktifKonum, bakiyeDegistir, hareket, siraliKilitle, varsayilanKonum } from './ortak.ts';

// 3809: fason dönüşünün GKK'sı Kalite Merkezi'ndedir. Satır fason adımı (emir ve OP) başınadır: aynı adımın birden çok dönüşü tek satırda
// birikir. Miktar dönen kartın stok birimindedir; karar adetle verilir ve adet başına miktarla (yarı parçanın birimi, dönüş planı) stoğa çevrilir.
export interface FasonGkkSatiri {
  fasonIsEmriId: number; uretimEmriId: number; opNo: number; malzemeId: number; malzemeKod: string | null; malzemeAd: string | null; birim: string | null;
  gelen: string; kararlanan: string; bekleyen: string; gelenAdet: number | null; bekleyenAdet: number | null; sonZaman: string; malKabulNo: string | null;
}
export type FasonGkkSonucu = 'serbest' | 'sartli' | 'red';

const kararAciklamasi = (emirNo: string, opNo: number, not: string | null): string =>
  `${sorgular.FASON_GKK_ACIKLAMASI} · emir ${emirNo} · OP ${String(opNo)}${not === null ? '' : ` · ${not}`}`;

// Emir ve OP verilirse yalnız o adımın satırı; bekleyeni olmayan satır yalnız `hepsi` ile döner.
export async function fasonGkkSatirlari(db: Db, a: { uretimEmriId?: number; opNo?: number; hepsi?: boolean } = {}): Promise<FasonGkkSatiri[]> {
  const anahtarlar = await sorgular.fasonGkkAnahtarlari(db, a.uretimEmriId ?? null, a.opNo ?? null);
  const gruplar = new Map<string, Omit<FasonGkkSatiri, 'fasonIsEmriId' | 'gelen' | 'kararlanan' | 'bekleyen' | 'gelenAdet' | 'bekleyenAdet'> & { b: bigint; g: bigint; k: bigint }>();
  for (const x of anahtarlar) {
    const k = `${x.uretimEmriId}:${x.opNo}:${x.malzemeId}`;
    const bekleyen = fasonGkkBekleyeni(x.giren, x.kararlanan, x.bakiye);
    const o = gruplar.get(k);
    if (o === undefined) {
      gruplar.set(k, {
        uretimEmriId: x.uretimEmriId, opNo: x.opNo, malzemeId: x.malzemeId, malzemeKod: null, malzemeAd: null, birim: null,
        sonZaman: x.sonZaman, malKabulNo: x.malKabulNo, b: bekleyen, g: binde(x.giren), k: binde(x.kararlanan),
      });
      continue;
    }
    o.b += bekleyen; o.g += binde(x.giren); o.k += binde(x.kararlanan);
    if (x.sonZaman > o.sonZaman) { o.sonZaman = x.sonZaman; o.malKabulNo = x.malKabulNo ?? o.malKabulNo; }
  }
  const secilen = [...gruplar.values()].filter((g) => a.hepsi === true || g.b > 0n);
  const adimlar = await emirAdimlari(db, [...new Set(secilen.map((g) => g.uretimEmriId))]);
  const kartlar = await malzemeOzetleri(db, [...new Set(secilen.map((g) => g.malzemeId))]);
  const sonuc: FasonGkkSatiri[] = [];
  for (const { b, g, k, ...s } of secilen) {
    const fason = adimlar.find((x) => x.uretimEmriId === s.uretimEmriId && x.opNo === s.opNo && x.fason);
    if (fason === undefined) continue;
    const adetBasina = await fasonDonusMiktari(db, fason.isEmriId, 1000n);
    const m = kartlar.get(s.malzemeId);
    sonuc.push({
      ...s, fasonIsEmriId: fason.isEmriId, malzemeKod: m?.kod ?? null, malzemeAd: m?.ad ?? null, birim: m?.birim ?? null,
      gelen: bindenMetin(g), kararlanan: bindenMetin(k), bekleyen: bindenMetin(b), gelenAdet: fasonAdedi(g, adetBasina), bekleyenAdet: fasonAdedi(b, adetBasina),
    });
  }
  return sonuc;
}

// Fason adımının GKK durumu (adetle): karar bekleyen ve serbest + şartlı kararlanan. Adet başına miktar bulunamazsa bekleyen null.
export async function fasonGkkDurumu(db: Db, isEmriId: number): Promise<{ bekleyenAdet: number | null; kabulAdet: number }> {
  const is = await isEmriOzeti(db, isEmriId);
  if (is === null || is.kaynak?.tur !== 'fason') return { bekleyenAdet: null, kabulAdet: 0 };
  const anahtarlar = await sorgular.fasonGkkAnahtarlari(db, is.uretimEmriId, is.opNo);
  const bekleyen = anahtarlar.reduce((t, x) => t + fasonGkkBekleyeni(x.giren, x.kararlanan, x.bakiye), 0n);
  const kabul = anahtarlar.reduce((t, x) => t + binde(x.kabullenen), 0n);
  const adetBasina = await fasonDonusMiktari(db, isEmriId, 1000n);
  return { bekleyenAdet: bekleyen === 0n ? 0 : fasonAdedi(bekleyen, adetBasina), kabulAdet: fasonAdedi(kabul, adetBasina) ?? 0 };
}

// Kararın yazılmış hareketleri (Yapılan sekmesi): en yeni önce.
export const fasonGkkKararHareketleri = (db: Db, a: { baslangic: string; bitis: string; sinir: number }) => sorgular.fasonGkkKararlari(db, a);

// Karar: serbest ve şartlı karantinadan mal kabul alanına, red karantinada red kalır (sonrası NCR ve iade akışında). Bakiyeler en eski
// girişten başlayarak tüketilir. Hareketler fason adımının iş emrini taşır. Adımın bekleyeni sıfırlanınca görev kapanır.
// Yetkiyi çağıran (Kalite Merkezi) korur. Dönen: kararın ardından adımın kalan bekleyeni.
export async function fasonGkkKarari(db: Db, kisiId: number, g: { isEmriId: number; adet: number; sonuc: FasonGkkSonucu; not: string | null }):
  Promise<{ uretimEmriId: number; opNo: number; bekleyenAdet: number; kabulAdet: number; hareketIdler: number[] }> {
  const is = await isEmriOzeti(db, g.isEmriId);
  if (is === null || is.kaynak?.tur !== 'fason') throw dogrulama('Fason işi bulunamadı.', 'isEmriId');
  const hedefKonumId = g.sonuc === 'red' ? null : await varsayilanKonum(db, 'KABUL');
  if (hedefKonumId !== null) await aktifKonum(db, hedefKonumId, 'hedefKonumId');
  const ilk = await sorgular.fasonGkkAnahtarlari(db, is.uretimEmriId, is.opNo);
  await siraliKilitle(db, ...ilk.flatMap((x) => {
    const a = { malzemeId: x.malzemeId, partiId: x.partiId, statuId: x.statuId };
    return [{ ...a, konumId: x.konumId, kaliteDurumu: 'karar_bekliyor' as const }, { ...a, konumId: hedefKonumId ?? x.konumId, kaliteDurumu: g.sonuc }];
  }));
  // Kilitten sonra yeniden okunur: eşzamanlı ikinci karar ilkinin yazdığını görür.
  const anahtarlar = await sorgular.fasonGkkAnahtarlari(db, is.uretimEmriId, is.opNo);
  const bekleyenler = [];
  for (const x of anahtarlar) {
    const yolda = binde(await sorgular.yoldaAyrilan(db, x.malzemeId, x.konumId, x.partiId, x.statuId, 'karar_bekliyor'));
    const b = fasonGkkBekleyeni(x.giren, x.kararlanan, bindenMetin(binde(x.bakiye) - yolda));
    if (b > 0n) bekleyenler.push({ x, b });
  }
  const toplam = bekleyenler.reduce((t, y) => t + y.b, 0n);
  const adetBasina = await fasonDonusMiktari(db, g.isEmriId, 1000n);
  const bekleyenAdet = fasonAdedi(toplam, adetBasina);
  if (bekleyenAdet === null) throw cakisma('Fason dönüşünün adet başına miktarı bulunamadı (rota ya da emir değişmiş olabilir).');
  const engel = fasonGkkKarariEngeli(bekleyenAdet, g.adet);
  if (engel !== null) throw bekleyenAdet <= 0 ? cakisma(engel) : dogrulama(engel, 'adet');
  // Son adet bekleyenin tamamını alır: adet başına miktarın yuvarlaması karantinada artık bırakmasın.
  const istenen = g.adet === bekleyenAdet ? toplam : await fasonDonusMiktari(db, g.isEmriId, BigInt(g.adet) * 1000n);
  if (istenen === null || istenen <= 0n || istenen > toplam) throw cakisma('Karar adedinin stok miktarı bekleyeni aşıyor.');
  const aciklama = kararAciklamasi(is.emirNo, is.opNo, g.not);
  let kalan = istenen;
  const hareketIdler: number[] = [];
  for (const { x, b } of bekleyenler) {
    if (kalan <= 0n) break;
    const miktar = kalan < b ? kalan : b;
    kalan -= miktar;
    const hedefKonum = hedefKonumId ?? x.konumId;
    const anahtar = { malzemeId: x.malzemeId, partiId: x.partiId, statuId: x.statuId };
    const onceki = await sorgular.bakiyeKilitle(db, x.malzemeId, x.konumId, x.partiId, x.statuId, 'karar_bekliyor');
    hareketIdler.push(await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: x.malzemeId, miktar: bindenMetin(miktar), kisiId, partiId: x.partiId, partiSecimi: x.partiId === null ? null : 'kisi',
      kaynakKonumId: x.konumId, hedefKonumId: hedefKonum, kaynakStatuId: x.statuId, hedefStatuId: x.statuId,
      kaynakKaliteDurumu: 'karar_bekliyor', hedefKaliteDurumu: g.sonuc, uretimEmriId: is.uretimEmriId, isEmriId: g.isEmriId, aciklama,
    })));
    await bakiyeDegistir(db, { ...anahtar, konumId: x.konumId, kaliteDurumu: 'karar_bekliyor', fark: -miktar });
    await bakiyeDegistir(db, { ...anahtar, konumId: hedefKonum, kaliteDurumu: g.sonuc, fark: miktar, ilkGiris: onceki?.ilkGiris ?? null });
  }
  const kalanAdet = bekleyenAdet - g.adet;
  if (kalanAdet <= 0) await bildirimKapat(db, { tur: FASON_GKK_GOREVI, kaynakKimlik: fasonGkkKaynagi(is.uretimEmriId, is.opNo) });
  // Adımın sağlamı: bu adımın bütün dönüşlerinde serbest ve şartlı kararlanan (stok defterinden, kararın kendisi dahil).
  const kabul = (await sorgular.fasonGkkAnahtarlari(db, is.uretimEmriId, is.opNo)).reduce((t, x) => t + binde(x.kabullenen), 0n);
  return { uretimEmriId: is.uretimEmriId, opNo: is.opNo, bekleyenAdet: kalanAdet, kabulAdet: fasonAdedi(kabul, adetBasina) ?? 0, hareketIdler };
}
