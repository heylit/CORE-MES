import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import type { MotorDurumu } from './plan-motoru.ts';

// Planın girdisi (st) planlama çerçevesindeki kodla kurulur: motor/girdi.betik çerçeveye de gömülür (planlama-derle.ts), aynı kayıt,
// çalışma ve kaynak okuması iki yerde aynı st'yi verir. Motor gibi boş `vm` bağlamında yüklenir; duvar saati tesisin saat dilimindedir.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
const DOSYALAR = ['engine', 'kisitlar', 'girdi', 'durum'] as const;

let kod: string | null = null;
function girdiKodu(): string {
  kod ??= `${DOSYALAR.map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n')}\n;({ girdiKur });`;
  return kod;
}

export interface KaynakOkumasi { durum: unknown; ek: unknown }
export interface GirdiIstegi {
  // Ortak çalışma kaydı (recete-rota-motoru-v1:planlama) ve Reçete ve Rota kaydı (recete-rota-motoru-v1), kayıttaki biçimiyle.
  calisma: unknown;
  kayit: unknown;
  kaynak: KaynakOkumasi | null;
  // Başlangıcı olmayan çalışmanın başlangıç günü ('GGGG-AA-GG'); verilmezse tesisin bugünü.
  bugun?: string;
}
export interface PlanGirdisi { S: Record<string, unknown>; st: MotorDurumu }

type GirdiKur = (calisma: unknown, kayit: unknown, kaynak: KaynakOkumasi | null, bugun: string) => PlanGirdisi | null;

// Her çağrı yeni bağlam kurar; girdiler kopyalanır, çağıranın nesneleri değişmez. Çalışma yoksa null.
export function planGirdisi(istek: GirdiIstegi, simdi: number = Date.now()): PlanGirdisi | null {
  const baglam = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
  const { girdiKur } = vm.runInContext(girdiKodu(), baglam, { filename: 'plan-girdisi.js' }) as { girdiKur: GirdiKur };
  const kopya = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));
  const sonuc = girdiKur(kopya(istek.calisma), kopya(istek.kayit), kopya(istek.kaynak), istek.bugun ?? tesisGunu(simdi));
  // Bağlamın nesneleri onun dizi ve nesne türlerindendir; sunucunun türlerine yapılandırılmış kopyayla geçer (sonsuz değer korunur).
  return sonuc === null ? null : structuredClone(sonuc);
}
