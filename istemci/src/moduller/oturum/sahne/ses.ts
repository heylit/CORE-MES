// Giriş açılış sesi (kart 2170): "Atölye akoru". Tarayıcıda Web Audio ile üretilir; ses dosyası, dış kaynak ya da ağ isteği yoktur.
// Akor cihazın değil atölyenindir: ortak saat her 20 saniyede bir sonraki akora geçer. Aynı anlarda açan terminaller aynı akoru
// çalar; dört akor da Re majör pentatonikten (Re Mi Fa# La Si) seçildi, üst üste binseler de çatışmaz. Sert vuruş yoktur (kaymış
// vuruşlar kalabalıkta karmaşa yaratır); notalar yarım saniyelik saat ızgarasına oturur. Her cihaz akorun bir partisini çalar,
// birlikte açan cihazlar dört sesli koro olur. Zamanlar sahneyle aynıdır: patlama 3,0, harfler 3,67 ve 3,79, ışık taraması 5,0.

export const IZGARA_MS = 500;
export const PENCERE_MS = 20000;
export const PARTI_SAYISI = 4;

interface Akor { readonly kok: number; readonly ses: readonly [number, number, number, number, number] }
export const AKORLAR: readonly Akor[] = [
  { kok: 38, ses: [50, 57, 64, 69, 76] },
  { kok: 35, ses: [47, 54, 62, 66, 71] },
  { kok: 33, ses: [45, 52, 59, 64, 69] },
  { kok: 42, ses: [54, 57, 62, 69, 74] },
];
// Re majör pentatonik: Re, Mi, Fa#, La, Si (nota numarasının 12'ye kalanı).
export const DIZI: readonly number[] = [2, 4, 6, 9, 11];
const SIRALAR: readonly (readonly number[])[] = [[0, 1, 2, 3], [1, 2, 3, 4], [0, 2, 1, 4], [2, 3, 4, 1]];

// Saat ızgarasına kalan süre: başlangıç bir sonraki yarım saniyeye ertelenir.
export const bekleme = (simdiMs: number): number => (IZGARA_MS - (simdiMs % IZGARA_MS)) % IZGARA_MS;
// O anın akoru: bütün cihazlarda aynı saat aynı akoru verir.
export const akorNo = (simdiMs: number): number => Math.floor(simdiMs / PENCERE_MS) % AKORLAR.length;

// Bir açılışta çalınacak bütün notalar (zaman saniye, nota numarası); saf, sınanır.
export interface Nota { readonly t: number; readonly m: number; readonly guc: number; readonly sure: number; readonly atak: number }
export function notalar(akor: number, parti: number): Nota[] {
  const A = AKORLAR[akor % AKORLAR.length]!, sira = (SIRALAR[parti % SIRALAR.length] ?? SIRALAR[0]!).map((i) => A.ses[i]!);
  const n: Nota[] = sira.map((m, i) => ({ t: 0.5 + i * 0.5, m, guc: 0.55 + 0.15 * i, sure: 5.0 - i * 0.4, atak: 0.03 }));
  n.push({ t: 3.0, m: A.kok, guc: 1.1, sure: 4.0, atak: 0.01 }, { t: 3.0, m: A.kok + 12, guc: 0.7, sure: 4.5, atak: 0.01 });
  n.push({ t: 3.67, m: A.ses[3] + 12, guc: 0.6, sure: 3.2, atak: 0.008 }, { t: 3.79, m: A.ses[4] + 12, guc: 0.5, sure: 3.2, atak: 0.008 });
  [...A.ses].reverse().forEach((m, i) => n.push({ t: 5.0 + i * 0.125, m: m + 24 > 98 ? m + 12 : m + 24, guc: 0.28, sure: 1.6, atak: 0.008 }));
  return n;
}

const PARTI_ANAHTARI = 'core.giris.ses-parti';
const TERCIH_ANAHTARI = 'core.giris.ses';

// Cihazın partisi bir kez seçilir ve saklanır; saklanamazsa her açılışta rastgele seçilir (uyum yine bozulmaz).
export function cihazPartisi(): number {
  try {
    const k = Number(window.localStorage.getItem(PARTI_ANAHTARI));
    if (Number.isInteger(k) && k >= 0 && k < PARTI_SAYISI && window.localStorage.getItem(PARTI_ANAHTARI) !== null) return k;
    const yeni = Math.floor(Math.random() * PARTI_SAYISI);
    window.localStorage.setItem(PARTI_ANAHTARI, String(yeni));
    return yeni;
  } catch {
    return Math.floor(Math.random() * PARTI_SAYISI);
  }
}

// Varsayılan kapalıdır; yalnız bu cihazda açılır.
export function sesAcikMi(): boolean {
  try { return window.localStorage.getItem(TERCIH_ANAHTARI) === 'acik'; } catch { return false; }
}
export function sesTercihiYaz(acik: boolean): void {
  try { window.localStorage.setItem(TERCIH_ANAHTARI, acik ? 'acik' : 'kapali'); } catch { /* saklanamazsa yalnız bu açılış için geçerlidir */ }
}

const frekans = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type SesBaglami = AudioContext;
const baglamYap = (): SesBaglami | null => {
  const Yapici = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (Yapici === undefined) return null;
  try { return new Yapici(); } catch { return null; }
};

let baglam: SesBaglami | null = null;
let ana: GainNode | null = null;

// Tarayıcı kullanıcı dokunmadan sesi başlatmaz. Bağlam açılışta çalışır durumdaysa (terminalde tarayıcı ayarıyla) true döner.
export function sesHazirMi(): boolean {
  baglam ??= baglamYap();
  return baglam !== null && baglam.state === 'running';
}

// Sesi baştan çalar; bağlam kurulamazsa false döner. Kullanıcı düğmeye bastığında çağrılırsa tarayıcı bağlamı açar.
export async function sesCal(gecikmeSn = 0, simdiMs = Date.now()): Promise<boolean> {
  baglam ??= baglamYap();
  const ac = baglam;
  if (ac === null) return false;
  try { await ac.resume(); } catch { return false; }
  ana?.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05);
  const sr = ac.sampleRate;

  const gurultu = ac.createBuffer(1, sr * 3, sr), gv = gurultu.getChannelData(0);
  for (let i = 0; i < gv.length; i++) gv[i] = Math.random() * 2 - 1;
  // Yapay salon yankısı: sönümlenen gürültüden iki kanallı darbe yanıtı.
  const uz = Math.floor(sr * 3.2), ir = ac.createBuffer(2, uz, sr);
  for (let k = 0; k < 2; k++) { const d = ir.getChannelData(k); for (let i = 0; i < uz; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / uz, 3.2); }
  const sk = ac.createDynamicsCompressor(); sk.threshold.value = -16; sk.knee.value = 8; sk.ratio.value = 3.5; sk.attack.value = 0.004; sk.release.value = 0.25;
  const bu = ac.createGain(); bu.gain.value = 0.47; bu.connect(sk).connect(ac.destination); ana = bu;
  const cv = ac.createConvolver(); cv.buffer = ir; const yg = ac.createGain(); yg.gain.value = 0.32; cv.connect(yg).connect(sk);
  const yanki = ac.createGain(); yanki.connect(cv);
  const cik = (n: AudioNode, kuru: number, islak: number): void => {
    const k = ac.createGain(); k.gain.value = kuru; n.connect(k).connect(bu);
    const y = ac.createGain(); y.gain.value = islak; n.connect(y).connect(yanki);
  };

  // Kâse: tam oranlı kısmi tonlar, her biri hafif ikiz ayarlı (yavaş dalgalanma); yumuşak vuruş, uzun sönüm.
  const kase = (t: number, m: number, guc: number, sure: number, atak: number): void => {
    const f = frekans(m), g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * guc, t + atak); g.gain.exponentialRampToValueAtTime(0.0001, t + atak + sure);
    ([[1, 1], [2, 0.42], [3, 0.16], [4.02, 0.07]] as const).forEach(([r, k], i) => [0, 0.9 + i * 0.4].forEach((dt) => {
      const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = f * r + dt; og.gain.value = k * 0.5;
      o.connect(og).connect(g); o.start(t); o.stop(t + atak + sure + 0.1);
    }));
    cik(g, 0.9, 0.9);
  };
  // Hava: yumuşak süzülmüş gürültü, nefes gibi kabarır.
  const hava = (t: number, sure: number, guc: number): void => {
    const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(); n.buffer = gurultu;
    bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3200, t + sure * 0.5); bp.frequency.exponentialRampToValueAtTime(1400, t + sure);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03 * guc, t + sure * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + sure);
    n.connect(bp).connect(g); cik(g, 0.8, 1); n.start(t, 0, sure);
  };
  // Işık: akorun oktav üstü, yavaş açılan ve titreşen ince yüzey (patlama anı).
  const isik = (t: number, ns: readonly number[], sure: number, guc: number): void => {
    const g = ac.createGain(), tr = ac.createOscillator(), tg = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * guc, t + 0.8); g.gain.setValueAtTime(0.035 * guc, t + sure - 1.8); g.gain.linearRampToValueAtTime(0.0001, t + sure);
    tr.frequency.value = 0.4; tg.gain.value = 0.012 * guc; tr.connect(tg).connect(g.gain); tr.start(t); tr.stop(t + sure + 0.1);
    ns.forEach((m) => [-7, 7].forEach((c) => { const o = ac.createOscillator(); o.frequency.value = frekans(m + 12); o.detune.value = c; o.connect(g); o.start(t); o.stop(t + sure + 0.1); }));
    cik(g, 0.8, 1);
  };

  const t0 = ac.currentTime + 0.08 + gecikmeSn, no = akorNo(simdiMs + gecikmeSn * 1000);
  hava(t0, 3.2, 0.6);
  notalar(no, cihazPartisi()).forEach((n) => kase(t0 + n.t, n.m, n.guc, n.sure, n.atak));
  isik(t0 + 2.8, AKORLAR[no]!.ses, 5.2, 1.1);
  return true;
}

export function sesSustur(): void {
  if (baglam !== null && ana !== null) ana.gain.setTargetAtTime(0.0001, baglam.currentTime, 0.05);
}
