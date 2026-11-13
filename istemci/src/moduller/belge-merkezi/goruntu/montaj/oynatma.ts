import type { SahneAdimi, SahneHareketi, SahneYonu } from '#paylasilan/sozlesme/rota.ts';

// Montaj sahnesinin oynatma kuralları (3209 a): oynatma zamanı ve parçanın konumu. Stüdyo (recete-rota) ve terminal (arkon) aynı oynatıcıyı
// buradan alır; sıra ve yön önerisi, kayıt kuralları stüdyodadır.

export type Uc = readonly [number, number, number];
export interface ParcaKutusu { en: Uc; ust: Uc }

export const YON_VEKTORU: Record<SahneYonu, Uc> = {
  '+X': [1, 0, 0], '-X': [-1, 0, 0], '+Y': [0, 1, 0], '-Y': [0, -1, 0], '+Z': [0, 0, 1], '-Z': [0, 0, -1],
};

// Adım sonunda kısa bekleme: parça yerine oturduktan sonra döngü hemen başa sarmaz.
export const ADIM_BEKLEMESI_SN = 0.8;

const kisit = (x: number, alt: number, ust: number): number => Math.min(ust, Math.max(alt, x));
// Yumuşak başlayıp yumuşak duran geçiş: parça yuvaya yavaşlayarak oturur.
const yumusak = (x: number): number => x * x * (3 - 2 * x);

// Parçanın adım içindeki ilerleyişi (0: girişte uzakta, 1: yerinde). Sıralı adımda parçalar sırayla, eşit dilimlerle girer.
export function parcaIlerleyisi(h: SahneHareketi, parca: number, tSn: number): number {
  const i = h.parcalar.indexOf(parca);
  if (i < 0) return 1;
  const oran = kisit(tSn / h.sureSn, 0, 1);
  if (!h.sirali || h.parcalar.length < 2) return yumusak(oran);
  const n = h.parcalar.length;
  return yumusak(kisit(oran * n - i, 0, 1));
}

export interface ParcaHali { gorunur: boolean; hayalet: boolean; kayma: Uc }

// Etkin adımda parçanın hâli: önceki adımlarda girenler yerinde, sonrakiler gizli (ya da soluk), adımda hiç anılmayan parça gövdedir.
export function parcaHali(adimlar: readonly SahneAdimi[], aktifSira: number, parca: number, tSn: number, hayaletGoster: boolean): ParcaHali {
  const yerinde: ParcaHali = { gorunur: true, hayalet: false, kayma: [0, 0, 0] };
  const giren = adimlar.find((a) => a.hareket.parcalar.includes(parca));
  if (giren === undefined || giren.sira < aktifSira) return yerinde;
  if (giren.sira > aktifSira) return { gorunur: hayaletGoster, hayalet: true, kayma: [0, 0, 0] };
  const kalan = 1 - parcaIlerleyisi(giren.hareket, parca, tSn);
  const [x, y, z] = YON_VEKTORU[giren.hareket.yon];
  const m = giren.hareket.mesafeMm * kalan;
  return { gorunur: true, hayalet: false, kayma: [x * m, y * m, z * m] };
}

export const donguSuresi = (h: SahneHareketi): number => h.sureSn + ADIM_BEKLEMESI_SN;

// Terminal modeli adıyla değil içeriğiyle tanır: geometri STEP ve IGES alır (STEP "ISO-10303-21" ile başlar); ikili glTF "glTF" ile başlar.
export function modelBicimiBul(veri: Uint8Array): 'step' | 'iges' | 'glb' {
  const bas = String.fromCharCode(...veri.subarray(0, 32));
  if (bas.startsWith('glTF')) return 'glb';
  return bas.trimStart().startsWith('ISO-10303-21') ? 'step' : 'iges';
}
