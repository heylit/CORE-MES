import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { mesgul } from '#cekirdek/hata.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { motorGirdisiDenetle, motorPlaniDenetle, type MotorPlani } from './motor-sinir.ts';
import { hataSonucu, hesapBasladi, isciSinirlari, type HesapSonucu } from './isci-izleme.ts';

// Ortak plan motoru (ADR 0018): planlama çerçevesine gömülen dosyaların aynısı sunucuda koşar. Motor tarayıcı nesnesi kullanmaz; boş
// `vm` bağlamında yüklenir, sunucunun hiçbir nesnesini görmez. Uzun çözüm olay döngüsünü tutmasın diye ayrı iş parçacığında koşar.
// Sayfanın motor kancaları (motor/kancalar.js: TL amacı, fason kararı, termin, malzeme, hedef, montaj, ayar, örtüşme) de yüklenir (458 a):
// sunucunun planı sayfanın ve değerlendirme ucunun modeliyle kurulur. Kancalar girdinin ayarlarını (durum.js) okur.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
export const MOTOR_DOSYALARI = ['engine', 'kisitlar', 'mip', 'girdi', 'durum', 'kancalar'] as const;
const DISA = ['schedule', 'takvimliCoz', 'takvimGunu', 'compile', 'evaluate', 'lowerBound', 'lbHeadsTails', 'W0', 'stHazirla'] as const;

let kod: string | null = null;
export function motorKodu(): string {
  kod ??= `${MOTOR_DOSYALARI.map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;({ ${DISA.join(', ')} });`;
  return kod;
}

// Motorun girdisi ve çıktısı çerçevedeki biçimdir (saat ekseni, işlem kimliği 'sipariş.adım'); alanları `motor/kisitlar.js` sayar.
export type MotorDurumu = Record<string, unknown>;
export type { MotorPlani, MotorYerlesimi } from './motor-sinir.ts';
export interface Motor {
  schedule: (st: MotorDurumu, kip: string, taban: MotorPlani | null, secenek?: Record<string, unknown>) => MotorPlani;
  // 3501 a: iş takvim bittiği için yerleşmezse takvimi büyütüp yeniden çözer (en çok iki yıl); takvimGunu çözümün kurduğu takvimdir.
  takvimliCoz: (st: MotorDurumu, kip: string, taban: MotorPlani | null, secenek?: Record<string, unknown>) => MotorPlani;
  takvimGunu: () => number;
  compile: (st: MotorDurumu) => unknown;
  evaluate: (plan: MotorPlani, st: MotorDurumu, ref: unknown, hizli?: boolean) => unknown;
  lowerBound: (st: MotorDurumu, cx?: unknown) => { C: Record<string, number>; wT: number };
  lbHeadsTails: (st: MotorDurumu, cx: unknown) => { fin: Record<string, number> };
  W0: Readonly<Record<string, unknown>>;
  stHazirla: (st: MotorDurumu) => MotorDurumu;
}

// Her çağrı yeni bağlam kurar: motorun üst düzey durumu çağrılar arasında taşınmaz.
// `self`: kancalar bir kez kurulduklarını bağlamın genel nesnesinde işaretler.
function baglam(): vm.Context { const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b; return b; }
export function motorYukle(): Motor {
  return vm.runInContext(motorKodu(), baglam(), { filename: 'plan-motoru.js' }) as Motor;
}

// Sunucunun son sözü (ADR 0018 karar 4): aramasız kipler. 'sabit' tabandaki tezgâh sırasını korur, 'yeni' sırayı kuraldan kurar;
// ikisi de aynı girdiyle her makinede aynı planı verir. Zaman bütçeli arama (LNS) yalnız tarayıcıdaki önizlemededir.
export const SUNUCU_KIPLERI = ['sabit', 'yeni'] as const;
export type SunucuKipi = (typeof SUNUCU_KIPLERI)[number];
// olcu: yerleşmeyen iş kalırsa yerleşmeme ölçüsü de iş parçacığında alınır (3724); ana iş parçacığı motoru derlemez.
// sonAn: çağıranın toplam süre sınırı (epoch ms; 3724); çözümün süresi sırada bekledikten sonra kalan süreyi aşmaz.
export interface PlanIstegi { durum: MotorDurumu; kip: SunucuKipi; taban: MotorPlani | null; olcu?: boolean; sonAn?: number }
export const COZUM_SURESI_MS = 60_000;
// 3501 a: takvim büyüdükçe çözüm yeniden koşar. Sonraki turun sürenin bu payından sonra biteceği öngörülürse takvim büyütülmez; plan sığmayan
// işleriyle döner (motor takvimliCoz). Süre aşılırsa plan hiç yazılmaz; birkaç işin yerleşmemesi ondan hafiftir.
const BUYUME_PAYI = 0.75;

const ISCI = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const b = vm.createContext({ GIRDI_SAAT_DILIMI: workerData.dilim });
b.self = b;
const m = vm.runInContext(workerData.kod, b, { filename: 'plan-motoru.js' });
const { durum, kip, taban, olcu } = workerData.istek;
const p = m.takvimliCoz(m.stHazirla({ ...durum, w: { ...m.W0, ...(durum.w || {}) } }), kip, taban, { buyumeSonu: Date.now() + workerData.buyumeMs });
const fail = p.fail || [], takvimGun = m.takvimGunu();
parentPort.postMessage({ ops: p.ops, fail, takvimGun, ...(p.buyumeKesildi ? { buyumeKesildi: true } : {}), ...(olcu && fail.length > 0 ? { olcu: olc(durum, fail.map(String), takvimGun) } : {}) });
// Ölçü yeni bağlamda, çözümün kurduğu takvimle (3501 a) derlenir; çözümün bağlamındaki durum ölçüye taşınmaz. Malzeme hazır olma anı
// (525 4 a, engine.js matAlloc) yalnız katı malzeme kipinde okunur; zaman ölçüsü motorun zamanOlcusu'dur (3457).
function olc(durum, idler, takvimGun) {
  const c = vm.createContext({ GIRDI_SAAT_DILIMI: workerData.dilim });
  c.self = c;
  vm.runInContext(workerData.kod, c, { filename: 'plan-motoru.js' });
  c.durum = durum; c.idler = idler; c.takvimGun = takvimGun; c.sert = (durum.w || {}).mat === 'sert';
  return vm.runInContext(\`(() => {
    takvimIste(takvimGun);
    const cx = compile(stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } }));
    const gelmeyen = sert ? Object.entries(cx.mat.res).filter(([, r]) => !(r.ready < HDAYS * 24)).map(([j]) => String(j)) : [];
    return { gelmeyen, sinirda: HDAYS >= TAKVIM_ENCOK, olculer: idler.map((id) => { const o = cx.byId[id]; return o ? zamanOlcusu(cx, o, null) : null; }) };
  })()\`, c);
}
`;

// Aynı anda tek çözüm: kuyruk sırayla çalışır. Süre aşılırsa iş parçacığı durdurulur ve çağrı reddedilir.
// 3724: sonAn'da hâlâ sırada bekleyen çağrı orada reddedilir; sırası gelince iş parçacığı açılmaz.
let sira: Promise<unknown> = Promise.resolve();
export function planCoz(istek: PlanIstegi, sureMs: number = COZUM_SURESI_MS, buyumeMs: number = sureMs * BUYUME_PAYI): Promise<MotorPlani> {
  if (!SUNUCU_KIPLERI.includes(istek.kip)) return Promise.reject(new Error(`Plan motoru kipi geçersiz: ${String(istek.kip)}`));
  try {
    motorGirdisiDenetle(istek.durum);
    if (istek.taban !== null) motorPlaniDenetle(istek.taban, 'taban');
  } catch (e) { return Promise.reject(e as Error); }
  let basladi = false, vazgecildi = false;
  const is = sira.then(() => {
    if (vazgecildi) throw yetismedi(sureMs);
    basladi = true;
    return calistir(istek, sureMs, buyumeMs);
  });
  sira = is.catch(() => undefined);
  const { sonAn } = istek;
  if (sonAn === undefined) return is;
  return new Promise((coz, reddet) => {
    const sayac = setTimeout(() => { if (!basladi) { vazgecildi = true; reddet(yetismedi(sureMs)); } }, Math.max(0, sonAn - Date.now()));
    is.then((p) => { clearTimeout(sayac); coz(p); }, (e: unknown) => { clearTimeout(sayac); reddet(e as Error); });
  });
}

const yetismedi = (sureMs: number): Error =>
  mesgul(`Plan ${String(Math.max(1, Math.round(sureMs / 1000)))} saniyede hesaplanamadı; plan değişmedi. Biraz sonra yeniden deneyin, yinelenirse yöneticinize bildirin.`);

function calistir(istek: PlanIstegi, sureMs: number, buyumeMs: number): Promise<MotorPlani> {
  const kalan = istek.sonAn === undefined ? sureMs : Math.min(sureMs, istek.sonAn - Date.now());
  const ileti = yetismedi(sureMs);
  if (kalan <= 0) return Promise.reject(ileti);
  return new Promise((coz, reddet) => {
    const isci = new Worker(ISCI, { eval: true, resourceLimits: isciSinirlari(), workerData: { kod: motorKodu(), dilim: TESIS_SAAT_DILIMI, istek, buyumeMs: Math.min(buyumeMs, kalan * BUYUME_PAYI) } });
    let bitti = false;
    const bitir = hesapBasladi('motor');
    const sonlan = (f: () => void, sonuc: HesapSonucu = 'hata'): void => { if (bitti) return; bitti = true; clearTimeout(sayac); bitir(sonuc); f(); void isci.terminate(); };
    const sayac = setTimeout(() => sonlan(() => reddet(ileti), 'zaman-asimi'), kalan);
    isci.once('message', (p: unknown) => sonlan(() => {
      try { coz(motorPlaniDenetle(p)); } catch (e) { reddet(e as Error); }
    }, 'tamam'));
    isci.once('error', (e) => sonlan(() => reddet(e), hataSonucu(e)));
    isci.once('exit', (kodu) => sonlan(() => reddet(new Error(`Plan motoru iş parçacığı ${String(kodu)} koduyla kapandı.`))));
  });
}
