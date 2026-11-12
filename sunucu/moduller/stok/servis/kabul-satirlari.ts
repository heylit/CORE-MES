import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { MalKabulLotYeri, MalKabulSatirlariListesi, MalKabulSatirOzeti } from '#paylasilan/sozlesme/stok-mal-kabul-satirlari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeOzetleri } from '../../malzemeler/disari.ts';
import { siparisSatirlari } from '../../satin-alma/disari.ts';
import * as sorgular from '../sorgular.ts';
import { malKabullerinIrsaliyeleri } from './irsaliye.ts';
import { partiBelgeleri } from './pano.ts';

// 2890: Mal kabulü yapılanlar. Her satır kabul edilen malzemeyi, kimin ne zaman aldığını, lotunu ve lotun bugün durduğu konumları
// taşır. Sipariş no ve tedarikçi bugün yalnız mal kabul yapanın (açık sipariş satırları) ve satın almanın gördüğü veridir; stoğu
// yalnız okuyana boş döner, böylece bu liste yetkiyi genişletmez.
const tedarikGorur = (k: Kullanici): boolean => islemVarMi(k, 'stok.giris') || islemVarMi(k, 'satin-alma.oku');

export async function malKabulSatirListesi(db: Db, k: Kullanici, s: MalKabulSatirlariListesi): Promise<SayfaliListe<MalKabulSatirOzeti>> {
  const suzgec = { metin: s.metin, malzemeId: s.malzemeId, tur: s.tur, logoDurumu: s.logoDurumu, baslangic: s.baslangic, bitis: s.bitis };
  const l = await sayfaliListe(s, { say: () => sorgular.malKabulSatiriSay(db, suzgec), satirlar: (d) => sorgular.malKabulListeSatirlari(db, suzgec, s, d) });
  const partiler = [...new Set(l.satirlar.flatMap((x) => (x.partiId === null ? [] : [x.partiId])))];
  const siparisler = tedarikGorur(k) ? l.satirlar.flatMap((x) => (x.siparisSatirId === null ? [] : [x.siparisSatirId])) : [];
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.map((x) => x.kisiId))]);
  const kartlar = await malzemeOzetleri(db, l.satirlar.flatMap((x) => (x.fasonMalzemeId === null ? [x.malzemeId] : [x.malzemeId, x.fasonMalzemeId])));
  const yerler = partiler.length === 0 ? [] : await sorgular.lotYerleri(db, partiler);
  const belgeler = await partiBelgeleri(db, partiler);
  const siparis = siparisler.length === 0 ? [] : await siparisSatirlari(db, siparisler);
  const irsaliyeler = await malKabullerinIrsaliyeleri(db, l.satirlar.map((x) => x.malKabulId));
  const lotYerleri = new Map<number, MalKabulLotYeri[]>();
  for (const { partiId, ...y } of yerler) lotYerleri.set(partiId, [...(lotYerleri.get(partiId) ?? []), y]);
  const siparisi = new Map(siparis.map((x) => [x.id, x]));
  return {
    ...l,
    satirlar: l.satirlar.map((x) => {
      const kart = kartlar.get(x.malzemeId);
      const sp = x.siparisSatirId === null ? undefined : siparisi.get(x.siparisSatirId);
      return {
        id: x.id, malKabulId: x.malKabulId, belgeNo: x.belgeNo, tur: x.tur, irsaliyeNo: x.irsaliyeNo, zaman: x.zaman, kisiAd: kisiler.get(x.kisiId) ?? null,
        sira: x.sira, malzemeId: x.malzemeId, malzemeKod: kart?.kod ?? null, malzemeAd: kart?.ad ?? null, birim: kart?.birim ?? null, sayilanMiktar: x.sayilanMiktar,
        partiId: x.partiId, lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, partiBelgeleri: x.partiId === null ? [] : belgeler.get(x.partiId) ?? [],
        ilkKonumKod: x.ilkKonumKod, yerler: x.partiId === null ? [] : lotYerleri.get(x.partiId) ?? [],
        fasonGidenAd: x.fasonMalzemeId === null ? null : kartlar.get(x.fasonMalzemeId)?.ad ?? null,
        gkk: x.gkk, logoDurumu: x.logoDurumu, duzeltenId: x.duzeltenId,
        siparisNo: sp?.siparisNo ?? null, tedarikciAdi: sp?.tedarikciAdi ?? null, irsaliyeBelgeleri: irsaliyeler.get(x.malKabulId) ?? [],
      };
    }),
  };
}
