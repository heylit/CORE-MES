import { useCallback, useEffect, useState } from 'react';
import type { MotorUyarilariCevabi, PlanSurumCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { BenCevabi, DurumCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { calismaOku } from './durum.ts';
import type { PlanlamaCalismasi } from './tipler.ts';

// Açılış okumaları. Eski ekranın köprüsüyle aynı uçlar (kopru.ts: ben, kayitlar, durum-oku, plan-surum; motor uyarıları) doğrudan okunur;
// köprü ve çerçeve yoktur. İskelet yalnız okur: kayda yazma yolu (221 c: tercih ve ağırlık kayıtta) ve 222 cevabı bu dosyaya gelir.

// Kayıt anahtarları eski ekranınkiyle aynı (ReceteRotaCercevesi.tsx ONEK, PLANLAMA_ANAHTARI; test denetler). Çerçeve dosyası burada ithal
// edilmez: prototip yükleyicisini yeni ekrana taşırdı.
export const ONEK = 'recete-rota-motoru-v1';
export const PLANLAMA_ANAHTARI = `${ONEK}:planlama`;

// Okunamayan dilim null'dır (yetki yok ya da uç hata verdi); sıfır ya da boş liste uydurulmaz. Adı `okunamayan`a yazılır.
export type IstegeBagliDilim = 'durum' | 'planSurumu' | 'senaryolar' | 'motorUyarilari';

export interface PlanlamaDeposu {
  ben: BenCevabi;
  // Planlama çalışması (anahtar `recete-rota-motoru-v1:planlama`); kayıt yoksa ya da okunamıyorsa null.
  calisma: PlanlamaCalismasi | null;
  calismaSurumu: number | null;
  // Reçete ve Rota ana kaydı (anahtar `recete-rota-motoru-v1`): planlama verisi bundan kurulur (girdi.betik tmiCevir). Ekran yalnız okur.
  receteRotaKaydi: unknown;
  durum: DurumCevabi | null;
  planSurumu: PlanSurumCevabi | null;
  senaryolar: SenaryolarCevabi | null;
  motorUyarilari: string[] | null;
  okunamayan: IstegeBagliDilim[];
}

export interface Okuyucu { get: <T>(yol: string) => Promise<T> }

async function dilim<T>(okuma: Promise<T>): Promise<T | null> {
  try { return await okuma; } catch { return null; }
}

// ben ve kayitlar zorunludur (eski ekran da bunlarsız açılmaz); öteki okumalar düşerse ekran o dilimsiz açılır.
export async function acilisOku(o: Okuyucu = api): Promise<PlanlamaDeposu> {
  const [ben, kayitlar, durum, planSurumu, senaryolar, uyari] = await Promise.all([
    o.get<BenCevabi>('/recete-rota/ben'),
    o.get<KayitlarCevabi>('/recete-rota/kayitlar'),
    dilim(o.get<DurumCevabi>('/recete-rota/durum')),
    dilim(o.get<PlanSurumCevabi>('/plan/surum')),
    dilim(o.get<SenaryolarCevabi>('/plan/senaryolar')),
    dilim(o.get<MotorUyarilariCevabi>('/plan/motor-uyarilari')),
  ]);
  const kayit = (anahtar: string) => kayitlar.kayitlar.find((k) => k.anahtar === anahtar && k.bicim === 'json') ?? null;
  const calismaKaydi = kayit(PLANLAMA_ANAHTARI);
  const calisma = calismaKaydi === null ? null : calismaOku(calismaKaydi.deger);
  const dilimler = { durum, planSurumu, senaryolar, motorUyarilari: uyari };
  return {
    ben,
    calisma,
    calismaSurumu: calisma === null ? null : calismaKaydi?.surum ?? null,
    receteRotaKaydi: kayit(ONEK)?.deger ?? null,
    durum, planSurumu, senaryolar,
    motorUyarilari: uyari?.uyarilar ?? null,
    okunamayan: (Object.keys(dilimler) as IstegeBagliDilim[]).filter((k) => dilimler[k] === null),
  };
}

export type AcilisDurumu =
  | { tur: 'yukleniyor' }
  | { tur: 'hata'; ileti: string }
  | { tur: 'hazir'; depo: PlanlamaDeposu };

export function usePlanlamaDeposu(etkin: boolean): { durum: AcilisDurumu; yenile: () => void } {
  const [durum, setDurum] = useState<AcilisDurumu>({ tur: 'yukleniyor' });
  const [deneme, setDeneme] = useState(0);
  useEffect(() => {
    if (!etkin) return undefined;
    let bitti = false;
    setDurum({ tur: 'yukleniyor' });
    acilisOku().then(
      (depo) => { if (!bitti) setDurum({ tur: 'hazir', depo }); },
      (e: unknown) => { if (!bitti) setDurum({ tur: 'hata', ileti: hataIletisi(e, 'Planlama açılamadı.') }); },
    );
    return () => { bitti = true; };
  }, [etkin, deneme]);
  const yenile = useCallback(() => { setDeneme((d) => d + 1); }, []);
  return { durum, yenile };
}
