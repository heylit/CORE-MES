import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import type { MotorDurumu, MotorPlani } from './plan-motoru.ts';

// Planın girdisi (st) planlama çerçevesindeki kodla kurulur: motor/girdi.betik çerçeveye de gömülür (planlama-derle.ts), aynı kayıt,
// çalışma ve kaynak okuması iki yerde aynı st'yi verir. Motor gibi boş `vm` bağlamında yüklenir; duvar saati tesisin saat dilimindedir.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
const DOSYALAR = ['engine', 'kisitlar', 'girdi', 'durum'] as const;

let kod: string | null = null;
function girdiKodu(): string {
  kod ??= `${DOSYALAR.map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n')}\n;({ girdiKur });`;
  return kod;
}
// Sunucu çözücüsünün çevirisi (motor/emirler.betik) çerçeveye gömülmez; aynı dosyalarla aynı bağlamda yüklenir.
let cozumKod: string | null = null;
function cozumKodu(): string {
  cozumKod ??= `${[...DOSYALAR, 'emirler'].map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n')}\n;({ sunucuCozumGirdisi });`;
  return cozumKod;
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

// Asıl plana yazan komutun isteği motorun diline (ADR 0018 karar 3): anahtar "emir no|OP no", makine kimliği metin, anlar ISO.
export interface CozumIstegi {
  simdi: string;
  kuyruklar: { makineId: number; anahtarlar: string[] }[];
  sabitler: { anahtar: string; makineId: number; baslangic: string; bitis: string }[];
  calisanlar: { anahtar: string; makineId: number | null; baslangic: string | null; sayimAni: string | null; kalanVerimliDk: number }[];
}
export interface CozumGirdisi {
  st: MotorDurumu;
  taban: MotorPlani;
  // Planın saat ekseninin başlangıç günü ('GGGG-AA-GG'); motorun saatleri bu günün 00:00'ından, tesisin duvar saatiyle.
  baslangic: string;
  // Motorda karşılığı olmayan kuyruk işleri (rotasız emir, emirde değişen adım, Reçete ve Rota'da ürünü olmayan emir).
  yerlesmeyen: string[];
  // Vardiyası tanımsız tezgâhtaki kuyruk işleri (168 b): dizilmez; plan komutu durmaz, uyarıyla boş bırakır.
  vardiyasiz: string[];
  // Motorun işlem kimliği -> istekteki anahtar.
  kimlik: Record<string, string>;
  // Kuyruktaki işlerin motor kimlikleri.
  sira: string[];
}

// Çalışma planının çevirisi (motor/calisma.betik) de çerçeveye gömülmez.
let calismaKod: string | null = null;
function calismaKodu(): string {
  calismaKod ??= `${[...DOSYALAR, 'calisma'].map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n')}\n;({ sunucuCalismaPlani });`;
  return calismaKod;
}
export interface CalismaIslemi { id: string; m: string; S: number; C: number; bitti: boolean }
export interface CalismaPlani {
  // Planın saat ekseninin başlangıç günü ('GGGG-AA-GG').
  baslangic: string;
  guncel: boolean;
  // Motorun işlem kimliği (sipariş.k) -> "emir no|OP no"; yalnız sunucuda karşılığı olanlar.
  kimlik: Record<string, string>;
  // Çalışmada plan yoksa null.
  ops: CalismaIslemi[] | null;
}

// Girdiler kopyalanır, çağıranın nesneleri değişmez. Çalışma yoksa null.
export function calismaPlani(istek: GirdiIstegi, simdi: number = Date.now()): CalismaPlani | null {
  const baglam = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
  const { sunucuCalismaPlani } = vm.runInContext(calismaKodu(), baglam, { filename: 'calisma-plani.js' }) as {
    sunucuCalismaPlani: (calisma: unknown, kayit: unknown, kaynak: KaynakOkumasi | null, bugun: string) => CalismaPlani | null;
  };
  const kopya = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));
  const sonuc = sunucuCalismaPlani(kopya(istek.calisma), kopya(istek.kayit), kopya(istek.kaynak), istek.bugun ?? tesisGunu(simdi));
  return sonuc === null ? null : structuredClone(sonuc);
}

// Girdiler kopyalanır, çağıranın nesneleri değişmez. Çalışma yoksa null.
export function cozumGirdisi(g: Omit<GirdiIstegi, 'bugun'> & { istek: CozumIstegi }): CozumGirdisi | null {
  const baglam = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
  const { sunucuCozumGirdisi } = vm.runInContext(cozumKodu(), baglam, { filename: 'plan-cozumu.js' }) as {
    sunucuCozumGirdisi: (calisma: unknown, kayit: unknown, kaynak: KaynakOkumasi | null, istek: CozumIstegi, bugun: string) => CozumGirdisi | null;
  };
  const kopya = <T>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T));
  const sonuc = sunucuCozumGirdisi(kopya(g.calisma), kopya(g.kayit), kopya(g.kaynak), kopya(g.istek), tesisGunu(Date.parse(g.istek.simdi)));
  return sonuc === null ? null : structuredClone(sonuc);
}
