import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { MALIYET_ANAHTARLARI, ONERILEN_IKINCI_MENU } from '../planlama-menusu.ts';
import type { CalismaKomutu } from './kayit.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import type { PlanlamaDeposu } from './veri.ts';
import type { PlanlamaYetkisi } from './yetki.ts';

// Görünüm kaydı: sıra, başlık ve simge ikinci menünün Planlama grubundan (planlama-menusu.ts), adres parçası eski ekranın anahtarıdır.
// Bileşenler parçalara iner (PARCA-SOZLESMESI.md); parçalar bu dosyaya dokunmaz, bileşen adları sözleşmededir.
export const KOK = '/recete-rota/planlama-yeni';

const PLANLAMA_GRUBU = ONERILEN_IKINCI_MENU.gruplar[1].maddeler;
export type PlanlamaGorunumu = (typeof PLANLAMA_GRUBU)[number]['anahtar'];
// Kök adres Planlama motoru'dur (ikinci menünün ilk planlama maddesi).
export const ACILIS: PlanlamaGorunumu = 'plan';

// Her görünüme verilen ortak özellikler. `git` başka görünüme geçer; `yenile` açılış okumalarını yeniden yapar. `calisma` çalışmanın güncel
// halidir (değişiklikten sonra yenisi gelir; `depo.calisma` açılıştakidir). `komut` yazma yetkisi yoksa ya da çalışma kaydı yoksa null'dır.
export interface PlanlamaEkranOzellikleri {
  depo: PlanlamaDeposu;
  calisma: PlanlamaCalismasi | null;
  komut: CalismaKomutu | null;
  yetki: PlanlamaYetkisi;
  git: (g: PlanlamaGorunumu) => void;
  yenile: () => void;
}

export interface GorunumKaydi {
  anahtar: PlanlamaGorunumu;
  baslik: string;
  simge: SimgeAdi;
  parca: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
  bilesen: LazyExoticComponent<ComponentType<PlanlamaEkranOzellikleri>>;
}

const parca = <M extends Record<string, unknown>>(yukle: () => Promise<M>, ad: keyof M & string) =>
  lazy(async () => ({ default: (await yukle())[ad] as ComponentType<PlanlamaEkranOzellikleri> }));

const BILESENLER: Record<PlanlamaGorunumu, Pick<GorunumKaydi, 'parca' | 'bilesen'>> = {
  plan: { parca: 'P1', bilesen: parca(() => import('./motor/index.tsx'), 'PlanlamaMotoru') },
  studio: { parca: 'P1', bilesen: parca(() => import('./motor/index.tsx'), 'PlanlamaAtolyesi') },
  ysiparis: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'Siparisler') },
  terminler: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'Terminler') },
  denge: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'TerminVeKar') },
  maliyet: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'Maliyetler') },
  giderler: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'GenelGider') },
  mesaiplan: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'EkMesaiPlani') },
  fasonplan: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'FasonPlani') },
  malzplan: { parca: 'P4', bilesen: parca(() => import('./malzeme/index.tsx'), 'MalzemePlani') },
  yillik: { parca: 'P5', bilesen: parca(() => import('./ufuk/index.tsx'), 'YillikPlan') },
  ufuk: { parca: 'P5', bilesen: parca(() => import('./ufuk/index.tsx'), 'Ufuk') },
  sevkiyat: { parca: 'P6', bilesen: parca(() => import('./sevkiyat/index.tsx'), 'Sevkiyat') },
};

export const GORUNUM_KAYITLARI: readonly GorunumKaydi[] = PLANLAMA_GRUBU.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge, ...BILESENLER[m.anahtar],
}));

export function gorunumOku(parca: string | undefined): PlanlamaGorunumu | null {
  return GORUNUM_KAYITLARI.find((k) => k.anahtar === parca)?.anahtar ?? null;
}

export function gorunumAdresi(g: PlanlamaGorunumu): string { return `${KOK}/${g}`; }

// Maliyet ve kâr gösteren görünümler birim maliyet okumasını da ister (menüdeki gibi; planlama rolü maliyet görmez, 200 a).
export function gorunumAcik(g: PlanlamaGorunumu, yetki: PlanlamaYetkisi): boolean {
  return MALIYET_ANAHTARLARI.includes(g) ? yetki.maliyetOku : yetki.planlamaOku;
}
