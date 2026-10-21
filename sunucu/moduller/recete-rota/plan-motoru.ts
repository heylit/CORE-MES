import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';

// Ortak plan motoru (ADR 0018): planlama çerçevesine gömülen dosyaların aynısı sunucuda koşar. Motor tarayıcı nesnesi kullanmaz; boş
// `vm` bağlamında yüklenir, sunucunun hiçbir nesnesini görmez. Uzun çözüm olay döngüsünü tutmasın diye ayrı iş parçacığında koşar.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
export const MOTOR_DOSYALARI = ['engine', 'kisitlar', 'mip'] as const;
const DISA = ['schedule', 'compile', 'evaluate', 'lowerBound', 'lbHeadsTails', 'W0'] as const;

let kod: string | null = null;
export function motorKodu(): string {
  kod ??= `${MOTOR_DOSYALARI.map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n')}\n;({ ${DISA.join(', ')} });`;
  return kod;
}

// Motorun girdisi ve çıktısı çerçevedeki biçimdir (saat ekseni, işlem kimliği 'sipariş.adım'); alanları `motor/kisitlar.betik` sayar.
export type MotorDurumu = Record<string, unknown>;
export interface MotorYerlesimi { m: string; S: number; C: number; Su?: number; pin?: number; act?: number; done?: number; fas?: number }
export interface MotorPlani { ops: Record<string, MotorYerlesimi>; fail?: unknown[] }
export interface Motor {
  schedule: (st: MotorDurumu, kip: string, taban: MotorPlani | null, secenek?: Record<string, unknown>) => MotorPlani;
  compile: (st: MotorDurumu) => unknown;
  evaluate: (plan: MotorPlani, st: MotorDurumu, ref: unknown, hizli?: boolean) => unknown;
  lowerBound: (st: MotorDurumu, cx?: unknown) => { C: Record<string, number>; wT: number };
  lbHeadsTails: (st: MotorDurumu, cx: unknown) => { fin: Record<string, number> };
  W0: Readonly<Record<string, unknown>>;
}

// Her çağrı yeni bağlam kurar: motorun üst düzey durumu çağrılar arasında taşınmaz.
export function motorYukle(): Motor {
  return vm.runInContext(motorKodu(), vm.createContext({}), { filename: 'plan-motoru.js' }) as Motor;
}

// Sunucunun son sözü (ADR 0018 karar 4): aramasız kipler. 'sabit' tabandaki tezgâh sırasını korur, 'yeni' sırayı kuraldan kurar;
// ikisi de aynı girdiyle her makinede aynı planı verir. Zaman bütçeli arama (LNS) yalnız tarayıcıdaki önizlemededir.
export const SUNUCU_KIPLERI = ['sabit', 'yeni'] as const;
export type SunucuKipi = (typeof SUNUCU_KIPLERI)[number];
export interface PlanIstegi { durum: MotorDurumu; kip: SunucuKipi; taban: MotorPlani | null }
export const COZUM_SURESI_MS = 60_000;

const ISCI = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const m = vm.runInContext(workerData.kod, vm.createContext({}), { filename: 'plan-motoru.js' });
const { durum, kip, taban } = workerData.istek;
const p = m.schedule({ ...durum, w: { ...m.W0, ...(durum.w || {}) } }, kip, taban);
parentPort.postMessage({ ops: p.ops, fail: p.fail || [] });
`;

// Aynı anda tek çözüm: kuyruk sırayla çalışır. Süre aşılırsa iş parçacığı durdurulur ve çağrı reddedilir.
let sira: Promise<unknown> = Promise.resolve();
export function planCoz(istek: PlanIstegi, sureMs: number = COZUM_SURESI_MS): Promise<MotorPlani> {
  if (!SUNUCU_KIPLERI.includes(istek.kip)) return Promise.reject(new Error(`Plan motoru kipi geçersiz: ${String(istek.kip)}`));
  const is = sira.then(() => calistir(istek, sureMs));
  sira = is.catch(() => undefined);
  return is;
}

function calistir(istek: PlanIstegi, sureMs: number): Promise<MotorPlani> {
  return new Promise((coz, reddet) => {
    const isci = new Worker(ISCI, { eval: true, workerData: { kod: motorKodu(), istek } });
    let bitti = false;
    const sonlan = (f: () => void): void => { if (bitti) return; bitti = true; clearTimeout(sayac); f(); void isci.terminate(); };
    const sayac = setTimeout(() => sonlan(() => reddet(new Error(`Plan motoru ${String(sureMs)} ms içinde bitmedi.`))), sureMs);
    isci.once('message', (p: MotorPlani) => sonlan(() => coz(p)));
    isci.once('error', (e) => sonlan(() => reddet(e)));
    isci.once('exit', (kodu) => sonlan(() => reddet(new Error(`Plan motoru iş parçacığı ${String(kodu)} koduyla kapandı.`))));
  });
}
