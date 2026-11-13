import { type Db } from '#cekirdek/db.ts';
import { cakisma, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AcilanKart, IstegeLotlarlaGonderGovdesi, LotSirasi, TeslimCevabi, TeslimLotlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { binde, bindenMetin, istenenFazlaNotu, partiEtiketi, teslimLotlari } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { emirNoDe, emirNoHaritasi, sktBugun } from './ortak.ts';
import { teslimGonder } from './uretim.ts';

// 3187 a: teslim penceresinin okuması ve çok lotlu gönderimi. Öneri ve sıra çıkış önerisinin kuralıdır; burada kural yazılmaz.
export async function teslimLotlariOku(db: Db, malzemeId: number, miktar: string, sira: LotSirasi = 'fefo'): Promise<TeslimLotlariCevabi> {
  const b = await sorgular.serbestBakiyeler(db, malzemeId);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return teslimLotlari(b.map((x) => ({
    bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, miktar: x.miktar, ilkGiris: x.ilkGiris, sonKullanma: x.sonKullanma,
    partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.uretimEmriId }, emirNoDe(nolar, x.uretimEmriId)),
  })), miktar, sktBugun(), sira);
}

const OKUTULMADI = 'Okutulmadı';
// Her parça tek lotlu gönderimin bütün denetimlerinden geçer (kapsam, serbest miktar, rezerve, kart); ilkinden sonraki parçalar aynı
// isteğin bölünen teslimidir, yoldaki ilk parça onları engellemez. Uç tek işlemdedir: bir parça reddedilirse hiçbiri yazılmaz.
export async function istegeLotlarlaGonder(db: Db, k: Kullanici, istekId: number, g: IstegeLotlarlaGonderGovdesi): Promise<TeslimCevabi> {
  const istek = await sorgular.istekBul(db, istekId, true);
  if (!istek) throw dogrulama('Malzeme isteği bulunamadı.', 'istekId');
  if (istek.istasyonId === null) throw cakisma('İsteğin teslim yeri yok; kişiye teslim edin.');
  const anahtarlar = g.parcalar.map((p) => `${String(Number(p.konumId))}:${p.partiId === null ? '-' : String(Number(p.partiId))}`);
  if (new Set(anahtarlar).size !== anahtarlar.length) throw dogrulama('Aynı konumdaki aynı lot iki kez verilmiş.', 'parcalar');
  const teslimler: TeslimCevabi['teslim'][] = [];
  const acilanKartlar: AcilanKart[] = [];
  // Aynı kaynak kimliği yeniden gelirse ilk parça var olan kaydı döner; o zaman sonraki parçalar bölünen sayılmaz, yeniden gönderime
  // eklenmiş yeni bir parça yoldaki teslim engeline takılır.
  const yineleme = (await sorgular.teslimKaynaktan(db, `kisi:${String(k.id)}:${g.kaynakKimligi}:1`.slice(0, 120))) !== null;
  // Parçalar tek tek istenenle karşılaştırılır; toplamı aşan gönderim notu son parçaya yazılır (tek parça zaten aşıyorsa o parçada vardır).
  const toplamFazla = g.parcalar.some((p) => istenenFazlaNotu(istek.miktar, p.miktar) !== null)
    ? null : istenenFazlaNotu(istek.miktar, bindenMetin(g.parcalar.reduce((t, p) => t + binde(p.miktar), 0n)));
  for (const [i, p] of g.parcalar.entries()) {
    const notlar = [p.okutuldu ? null : OKUTULMADI, i === g.parcalar.length - 1 ? toplamFazla : null].filter((x) => x !== null);
    const c = await teslimGonder(db, k, {
      malzemeId: istek.malzemeId, miktar: p.miktar, partiId: p.partiId, statuId: null, kaynak: { konumId: p.konumId }, hedef: { istasyonId: istek.istasyonId },
      istekId, not: notlar.length === 0 ? null : notlar.join(' · '), kaynakKimligi: `${g.kaynakKimligi}:${String(i + 1)}`,
    }, i > 0 && !yineleme);
    teslimler.push(c.teslim);
    acilanKartlar.push(...(c.acilanKartlar ?? []));
  }
  return { teslim: teslimler[0]!, ...(teslimler.length > 1 ? { ekTeslimler: teslimler.slice(1) } : {}), ...(acilanKartlar.length > 0 ? { acilanKartlar } : {}) };
}
