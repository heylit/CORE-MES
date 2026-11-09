import type { Db } from '#cekirdek/db.ts';
import {
  SATIN_ALMA_ANALIZI_GECMIS_AY, SATIN_ALMA_ANALIZI_HARCAMA_AY, SATIN_ALMA_ANALIZI_SURE_EN_AZ, SATIN_ALMA_ANALIZI_TAHMIN_EN_AZ_AY, type SatinAlmaAnaliziCevabi,
} from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { firmaAdlari, karneOzetleri, teslimGecikmeleri } from '../musteri-tedarikci/disari.ts';
import {
  asamaKirilimlari, asamaOzeti, enCokSapanlar, fiyatDegisimleri, fiyatFarki, gercekSure, harcamaAbc, hedefSapmalari, kacinilanMaliyet,
  kuralDisiAlim, oncekiAlislar, tamAylar, tedarikSuresi, tuketimMalzemesi, zamanindaBayes, type AnalizSatiri,
} from './analiz-kurallar.ts';
import * as sorgular from './sorgular.ts';

// 2151: Satın alma analizi. Tedarikçi başarımı firma karnesinden (2151-2 a); tedarik süresi, harcama ve fiyat kendi sipariş
// satırlarından; tüketim stok hareketlerinden. Yalnız okur.
const TUKETIM_EN_COK = 100;

// Stok satın almayı ithal ettiği için tüketim serisi ters yönde kablolamayla gelir (sunucu/kablolama.ts, stok/disari tuketimSerisi).
// Bağ yoksa tüketim bölümü boş döner ve bunu söyler; seri uydurulmaz.
export type TuketimSerisiCozucusu = (db: Db, a: { basAy: string; bitAy: string; malzemeIdler: readonly number[] }) => Promise<{
  aylar: readonly { malzemeId: number; ay: string; miktar: string }[];
  tarihler: readonly { malzemeId: number; ilkHareket: string; sonTuketim: string | null }[];
}>;
let tuketimCozucu: TuketimSerisiCozucusu | null = null;
export function tuketimSerisiCozucusuKaydet(cozucu: TuketimSerisiCozucusu | null): void { tuketimCozucu = cozucu; }

function birYilOnce(bugun: string): string {
  const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y - SATIN_ALMA_ANALIZI_HARCAMA_AY / 12, a - 1, g + 1)).toISOString().slice(0, 10);
}
const birGunOnce = (gun: string): string => new Date(Date.parse(`${gun}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export async function satinAlmaAnalizi(db: Db, simdi: number = Date.now()): Promise<SatinAlmaAnaliziCevabi> {
  const bugun = tesisGunu(simdi);
  const aylar = tamAylar(bugun.slice(0, 7), SATIN_ALMA_ANALIZI_GECMIS_AY);
  const satirlar = await sorgular.analizSiparisSatirlari(db, `${aylar[0]!}-01`, TESIS_SAAT_DILIMI);

  const firmaSatirlari = new Map<number, AnalizSatiri[]>();
  const sonAd = new Map<number, string>();
  let firmasiz = 0;
  for (const s of satirlar) {
    if (s.firmaId === null) { firmasiz += 1; continue; }
    firmaSatirlari.set(s.firmaId, [...(firmaSatirlari.get(s.firmaId) ?? []), s]);
    sonAd.set(s.firmaId, s.tedarikciAdi);
  }
  const firmaIdler = [...firmaSatirlari.keys()];
  const adlar = await firmaAdlari(db, firmaIdler);
  const karneler = await karneOzetleri(db, firmaIdler, simdi);
  const gecikmeler = await teslimGecikmeleri(db, firmaIdler, simdi);
  const tedarikciler = firmaIdler.map((firmaId) => {
    const l = firmaSatirlari.get(firmaId)!;
    const k = karneler.get(firmaId);
    const g = gecikmeler.get(firmaId)?.kaynaklar.find((x) => x.kaynak === 'satin-alma');
    return {
      firmaId, ad: adlar.get(firmaId) ?? sonAd.get(firmaId) ?? '', siparisSatiri: l.length,
      karne: k ? {
        teslimToplam: k.teslim.toplam, zamanindaOran: k.teslim.oran, kalitePuani: k.kalite.puan, puan: k.puan, sinif: k.sinif, yetersizVeri: k.yetersizVeri,
      } : null,
      zamanindaBayes: k ? zamanindaBayes(k.teslim.toplam, k.teslim.zamaninda) : null,
      gecikme: g ? {
        teslim: g.teslimSayisi, gecKalan: g.gecKalanSayisi, ortalamaGun: g.ortalamaGecikmeGun, yuzde80Gun: g.yuzde80GecikmeGun, enCokGun: g.enCokGecikmeGun,
      } : null,
      tedarikSuresi: tedarikSuresi(l),
    };
  }).sort((a, b) => b.siparisSatiri - a.siparisSatiri || a.ad.localeCompare(b.ad, 'tr'));

  // Tüketim yalnız satın alınan (kataloğa bağlı) malzemeler için.
  const malzemeAd = new Map<number, string>();
  const malzemeSureleri = new Map<number, number[]>();
  for (const s of satirlar) {
    if (s.malzemeNo === null) continue;
    malzemeAd.set(s.malzemeNo, s.ad);
    const gun = gercekSure(s);
    malzemeSureleri.set(s.malzemeNo, gun === null ? (malzemeSureleri.get(s.malzemeNo) ?? []) : [...(malzemeSureleri.get(s.malzemeNo) ?? []), gun]);
  }
  const seri = tuketimCozucu === null ? null : await tuketimCozucu(db, { basAy: aylar[0]!, bitAy: aylar.at(-1)!, malzemeIdler: [...malzemeAd.keys()] });
  const miktarlar = new Map<number, Map<string, number>>();
  for (const r of seri?.aylar ?? []) {
    const m = miktarlar.get(r.malzemeId) ?? new Map<string, number>();
    m.set(r.ay, (m.get(r.ay) ?? 0) + Number(r.miktar));
    miktarlar.set(r.malzemeId, m);
  }
  const ilkAy = new Map((seri?.tarihler ?? []).map((t) => [t.malzemeId, tesisGunu(Date.parse(t.ilkHareket)).slice(0, 7)]));
  const malzemeler = seri === null ? [] : [...malzemeAd].map(([malzemeNo, ad]) => tuketimMalzemesi({
    malzemeNo, ad, aylar, miktarlar: miktarlar.get(malzemeNo) ?? new Map(), ilkHareketAyi: ilkAy.get(malzemeNo) ?? null,
    tedarikSureleri: malzemeSureleri.get(malzemeNo) ?? [],
  })).sort((a, b) => (b.tahminAylik ?? -1) - (a.tahminAylik ?? -1) || a.ad.localeCompare(b.ad, 'tr')).slice(0, TUKETIM_EN_COK);

  const harcamaBas = birYilOnce(bugun);
  const oncekiBit = birGunOnce(harcamaBas);
  const oncekiBas = birYilOnce(oncekiBit);
  const harcama = harcamaAbc(satirlar, harcamaBas, bugun);

  // 2471: süreç ve fiyat ölçüleri.
  const ayar = await sorgular.ayarlariOku(db);
  const esik = Number(ayar.fiyatUyariYuzdesi);
  const asamaSatirlari = await sorgular.analizTalepAsamalari(db, oncekiBas, TESIS_SAAT_DILIMI);
  const buDonem = asamaSatirlari.filter((t) => t.acilis >= harcamaBas && t.acilis <= bugun);
  const kisiAdi = await kisiAdlari(db, buDonem.map((t) => t.kararVeren).filter((x): x is number => x !== null));
  const kimlikli = satirlar;
  const onceki = oncekiAlislar(kimlikli);
  const baglar = new Map((await sorgular.analizSiparisBaglari(db, `${aylar[0]!}-01`, TESIS_SAAT_DILIMI)).map((b) => [b.id, b]));
  const teklifler = await sorgular.analizTeklifFiyatlari(db, [...new Set([...baglar.values()].map((b) => b.talepId))]);
  const oncekiHarcama = harcamaAbc(satirlar, oncekiBas, oncekiBit).toplamTl;
  const sapmaSimdi = hedefSapmalari(kimlikli, onceki, esik, harcamaBas, bugun);
  const sapmaOnceki = hedefSapmalari(kimlikli, onceki, esik, oncekiBas, oncekiBit);
  return {
    hesaplanan: new Date(simdi).toISOString(),
    tedarikciler,
    sureGereken: SATIN_ALMA_ANALIZI_SURE_EN_AZ,
    firmasizSatir: firmasiz,
    harcama: { basTarih: harcamaBas, bitTarih: bugun, ...harcama },
    fiyatDegisimleri: fiyatDegisimleri(satirlar),
    tuketim: { stokBagi: seri !== null, aylar, gereken: SATIN_ALMA_ANALIZI_TAHMIN_EN_AZ_AY, malzemeler },
    donem: { bas: harcamaBas, bit: bugun, oncekiBas, oncekiBit },
    oncekiHarcamaTl: oncekiHarcama,
    asamaGereken: SATIN_ALMA_ANALIZI_SURE_EN_AZ,
    asamaSureleri: {
      tumu: asamaOzeti(buDonem),
      oncekiToplam: asamaOzeti(asamaSatirlari.filter((t) => t.acilis < harcamaBas)).toplam,
      kirilimlar: asamaKirilimlari(buDonem, kisiAdi),
    },
    tasarruf: {
      fiyatFarki: { simdi: fiyatFarki(kimlikli, onceki, harcamaBas, bugun), onceki: fiyatFarki(kimlikli, onceki, oncekiBas, oncekiBit) },
      kacinilan: {
        simdi: kacinilanMaliyet(kimlikli, baglar, teklifler, harcamaBas, bugun), onceki: kacinilanMaliyet(kimlikli, baglar, teklifler, oncekiBas, oncekiBit),
      },
    },
    fiyatSapmasi: { esikYuzde: esik, donem: { simdi: sapmaSimdi.donem, onceki: sapmaOnceki.donem }, kalemler: enCokSapanlar(sapmaSimdi.satirlar) },
    kuralDisi: {
      enAzTeklif: ayar.enAzTeklif,
      donem: {
        simdi: kuralDisiAlim(kimlikli, baglar, ayar.enAzTeklif, harcama.toplamTl, harcamaBas, bugun),
        onceki: kuralDisiAlim(kimlikli, baglar, ayar.enAzTeklif, oncekiHarcama, oncekiBas, oncekiBit),
      },
    },
  };
}
