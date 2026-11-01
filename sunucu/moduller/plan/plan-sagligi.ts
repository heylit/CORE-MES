import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { PlanSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { bitenIsEmirleri, emirlerinIsEmriIdleri, emirNolari, isEmriPlanBilgileri, isEmriZamanlari } from '../uretim-emirleri/disari.ts';
import { haftaSiniri, planSagligi as kural, type BitenEmir, type OlculenAdim } from './plan-sagligi-kurallar.ts';
import { planSapmalari } from './sapma.ts';
import { emirTahminleri, olcumler } from './sorgular.ts';
import { veriSagligi } from './veri-sagligi.ts';

// Plan sağlığı (1478): istekte hesaplanır, toplu tablo yok. Biten adımın sapması plan sapmasından (782), emrin bitişi bütün adımları
// bitmişse son adımın bitişidir; kayma geçmişi ve tutarlılık canlıya almada yazılan ölçüm kaydındandır (1470). Veri eksikleri veri
// sağlığı raporunun sayısıdır; kaynak çağıranın yetkisiyle okunur.
export async function planSagligi(db: Db, kullanici: Kullanici, simdi = Date.now()): Promise<PlanSagligiCevabi> {
  const { pencereBasi } = haftaSiniri(simdi);
  const biten = await bitenIsEmirleri(db, new Date(pencereBasi).toISOString(), new Date(simdi).toISOString());
  const ids = biten.map((b) => b.isEmriId);
  const sapmalar = await planSapmalari(db, { isEmriIdleri: ids, simdi });
  const bilgiler = await isEmriPlanBilgileri(db, ids);

  const emirIdleri = [...new Set(biten.map((b) => b.uretimEmriId))];
  const adimlari = await emirlerinIsEmriIdleri(db, emirIdleri);
  const zamanlar = await isEmriZamanlari(db, [...adimlari.values()].flat());
  const emirler: Omit<BitenEmir, 'emirNo'>[] = [];
  for (const [emirId, adimIdleri] of adimlari) {
    const z = adimIdleri.map((i) => zamanlar.get(i));
    if (z.length === 0 || z.some((x) => x === undefined || x.durum !== 'tamam' || x.bitis === null)) continue;
    const bitis = z.map((x) => x!.bitis!).sort().at(-1)!;
    emirler.push({ uretimEmriId: emirId, bitis, termin: z[0]!.emirTeslim });
  }

  const olcum = await olcumler(db, new Date(pencereBasi));
  const tahminler = await emirTahminleri(db, new Date(pencereBasi));
  const nolar = await emirNolari(db, [...emirIdleri, ...tahminler.map((t) => t.uretimEmriId)]);
  const istasyonIdleri = [...bilgiler.values()].map((b) => b.istasyonId).filter((x): x is number => x !== null);
  const adlar = await istasyonAdlari(db, istasyonIdleri);
  const no = (id: number) => nolar.get(id) ?? `#${String(id)}`;

  const adimlar: OlculenAdim[] = biten.map((b) => {
    const s = sapmalar.get(b.isEmriId), bilgi = bilgiler.get(b.isEmriId);
    const istasyonId = bilgi?.istasyonId ?? b.istasyonId;
    return {
      isEmriId: b.isEmriId, emirNo: no(b.uretimEmriId), opNo: bilgi?.opNo ?? 0, istasyonId,
      istasyonAdi: istasyonId === null ? 'İstasyonsuz' : adlar.get(istasyonId) ?? `#${String(istasyonId)}`, bitis: b.bitis,
      tezgahUyumu: s?.tezgahUyumu ?? null, siraUyumu: s?.siraUyumu ?? null,
      // Biten adım canlıdan kalkmış olabilir; o zaman ilk canlı yerine (taban) göre.
      kaymaDk: s?.bitisKaymasiDk ?? s?.tabanBitisKaymasiDk ?? null, sureOrani: s?.sureOrani ?? null,
    };
  });

  const v = await veriSagligi(db, kullanici);
  return kural({
    simdi, adimlar, olcumler: olcum, tahminler, emirNolari: nolar,
    emirler: emirler.map((e) => ({ ...e, emirNo: no(e.uretimEmriId) })),
    veri: { eksikKonu: v.kategoriler.filter((k) => (k.sayi ?? 0) > 0).length, okunamayanKonu: v.kategoriler.filter((k) => k.sayi === null).length },
  });
}
