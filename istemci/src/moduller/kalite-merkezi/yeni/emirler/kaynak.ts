import type { KmEmirKaynagi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { KAPALI } from '../sabitler.ts';
import type { Emir, Tedarikci } from '../tipler.ts';

const ACIK = 'Açık';

// 592 B1 c: iş emri ve siparişler sahiplerinden gelir; Kalite Merkezi yalnız okur. Satır uygulamanın iş emri biçimindedir: tedarikçi,
// firması Kalite Merkezi'nde tedarikçi kaydı olan satın almada o kaydın kimliğidir (lot kabul ve muayene bunu bekler). Aynı numaralı
// eski kendi kaydının proje ve notu gösterilir; eşleşmeyen eski kayıtlar ayrı ve salt okunur listelenir (B3 c, silme ayrı onaydır).
export function emirSatirlari(
  kaynaklar: readonly KmEmirKaynagi[], eskiler: readonly Emir[], tedarikciler: readonly Tedarikci[],
): { emir: Emir[]; eskiEmir: Emir[] } {
  const eskiNodan = new Map<string, Emir[]>();
  for (const e of eskiler) if (e.no) eskiNodan.set(e.no, [...(eskiNodan.get(e.no) ?? []), e]);
  const emir = kaynaklar.map((k): Emir => {
    const eski = eskiNodan.get(k.no) ?? [];
    const sup = k.tip === 'Satınalma siparişi' && k.firmaId !== null ? tedarikciler.find((s) => s.firmaId === k.firmaId) : undefined;
    return {
      _id: k.kimlik, kaynak: true, no: k.no, tip: k.tip, durum: k.acik ? ACIK : KAPALI,
      parcaNo: k.parcaNo ?? '', parcaAdi: k.parcaAdi ?? '', miktar: k.miktar, termin: k.termin ?? '',
      ...(sup ? { tedarikci: sup._id } : {}),
      ...(k.tip === 'Müşteri siparişi' && k.firmaAd ? { musteri: k.firmaAd } : {}),
      firmaId: k.firmaId, firmaAd: k.firmaAd,
      ...(eski[0]?.proje ? { proje: eski[0].proje } : {}), ...(eski[0]?.not ? { not: eski[0].not } : {}),
      eskiKimlikler: eski.map((e) => e._id),
    };
  });
  const bilinen = new Set(kaynaklar.map((k) => k.no));
  return { emir, eskiEmir: eskiler.filter((e) => !e.no || !bilinen.has(e.no)) };
}
