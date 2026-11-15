import type { ProsesHalkasi, ProsesOperasyonu } from '#paylasilan/sozlesme/proses.ts';

// Halka durumu sahibin okumasından türer; Proses kendi "hazır" kuralını koymaz (3277 Kurgu 1): burada yalnız sahibin verdiği
// yürürlük, onay ve kayıt varlığı halkaya çevrilir. Parça düzeyinde okunacak yeri olmayan halka "kaynak-yok" kalır (3291).

export interface CizimGirdisi {
  // Kalite Merkezi'ne alınmış teknik resimlerin revizyonları (eski olmayanlar) ve parçaya hiç alınmamış yayındaki belge sayısı.
  revizyonlar: readonly (string | null)[];
  alinmamis: number;
}

export function cizimHalkasi(g: CizimGirdisi): ProsesHalkasi {
  const ortak = { anahtar: 'cizim', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi/parcalar' } as const;
  const revler = [...new Set(g.revizyonlar.map((r) => r ?? '-'))];
  if (revler.length === 0) {
    return { ...ortak, durum: g.alinmamis > 0 ? 'eksik' : 'yok', ozet: g.alinmamis > 0 ? `${String(g.alinmamis)} yayındaki belge alınmadı` : null };
  }
  const rev = `Rev ${revler.join(', ')}`;
  if (g.alinmamis > 0) return { ...ortak, durum: 'eksik', ozet: `${rev} · ${String(g.alinmamis)} yayındaki belge alınmadı` };
  return { ...ortak, durum: 'tamam', ozet: `${rev} alındı` };
}

export interface RotaGirdisi {
  yururlukte: { harf: string; adimSayisi: number } | null;
  acikTaslak: boolean;
}

export function rotaHalkasi(g: RotaGirdisi): ProsesHalkasi {
  const ortak = { anahtar: 'rota', sahip: 'Reçete ve Rota', yol: '/recete-rota/schema' } as const;
  if (g.yururlukte === null) return { ...ortak, durum: g.acikTaslak ? 'eksik' : 'yok', ozet: g.acikTaslak ? 'Taslak var, yürürlükte rota yok' : null };
  const ozet = `Rev ${g.yururlukte.harf} yürürlükte · ${String(g.yururlukte.adimSayisi)} op${g.acikTaslak ? ' · açık taslak var' : ''}`;
  return { ...ortak, durum: 'tamam', ozet };
}

export interface KontrolGirdisi {
  karakteristik: number;
  // Yürürlükteki rotanın numune planı olmayan operasyonları (fason adım sayılmaz).
  plansizOplar: readonly number[];
}

export function kontrolHalkasi(g: KontrolGirdisi): ProsesHalkasi {
  const ortak = { anahtar: 'kontrol', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi/parcalar' } as const;
  if (g.karakteristik === 0) return { ...ortak, durum: 'yok', ozet: null };
  const kar = `${String(g.karakteristik)} karakteristik`;
  if (g.plansizOplar.length > 0) {
    return { ...ortak, durum: 'eksik', ozet: `${kar} · numune planı yok: ${g.plansizOplar.map((o) => `OP ${String(o)}`).join(', ')}` };
  }
  return { ...ortak, durum: 'tamam', ozet: kar };
}

export interface IlkParcaGirdisi {
  acikEmir: number;
  onay: number;
  ret: number;
}

export function ilkParcaHalkasi(g: IlkParcaGirdisi): ProsesHalkasi {
  const ortak = { anahtar: 'ilk-parca', sahip: 'Kalite Merkezi', yol: '/kalite-merkezi' } as const;
  if (g.acikEmir === 0) return { ...ortak, durum: 'gerekmez', ozet: 'Açık emir yok' };
  if (g.ret > 0) return { ...ortak, durum: 'eksik', ozet: `${String(g.ret)} emirde ret` };
  const bekleyen = g.acikEmir - g.onay;
  if (bekleyen > 0) return { ...ortak, durum: 'eksik', ozet: `${String(bekleyen)}/${String(g.acikEmir)} açık emirde karar yok` };
  return { ...ortak, durum: 'tamam', ozet: `${String(g.onay)} açık emirde onay` };
}

// Parça düzeyinde okunacak yeri bugün olmayan halkalar (Atölye ön bakışı 3277; 3291 sahiplerden ister).
export const KAYNAKSIZ_HALKALAR: readonly ProsesHalkasi[] = [
  { anahtar: 'nc', durum: 'kaynak-yok', ozet: null, sahip: 'Sahibi belli değil', yol: null },
  { anahtar: 'takim', durum: 'kaynak-yok', ozet: null, sahip: 'CNC Kurulum', yol: null },
  { anahtar: 'baglama', durum: 'kaynak-yok', ozet: null, sahip: 'Rota', yol: null },
  { anahtar: 'kurulum', durum: 'kaynak-yok', ozet: null, sahip: 'CNC Kurulum', yol: null },
];

// Zincir sırası Atölye ön bakışıyladır: çizim, rota, NC, takım, bağlama, kurulum, kontrol planı, ilk parça.
export function zincir(h: { cizim: ProsesHalkasi; rota: ProsesHalkasi; kontrol: ProsesHalkasi; ilkParca: ProsesHalkasi }): ProsesHalkasi[] {
  const k = new Map(KAYNAKSIZ_HALKALAR.map((x) => [x.anahtar, x]));
  const al = (a: string): ProsesHalkasi => {
    const x = k.get(a as ProsesHalkasi['anahtar']);
    if (!x) throw new Error(`Halka tanımsız: ${a}`);
    return x;
  };
  return [h.cizim, h.rota, al('nc'), al('takim'), al('baglama'), al('kurulum'), h.kontrol, h.ilkParca];
}

export interface OperasyonGirdisi {
  opNo: number;
  ad: string;
  fason: boolean;
  tezgah: string | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  gercek: { ortancaDk: string; n: number } | null;
}

export type PlanBalonlari = 'hepsi' | 'kritik' | readonly number[];
export interface PlanBalonu { no: number; kritik: boolean }

// Numune planının kurallarının kapsadığı ayrı balonlar: "hepsi" bütün balonlar, "kritik" kritik olanlar, liste o numaralar.
export function planKarakteristigi(kurallar: readonly { balonlar: PlanBalonlari }[], balonlar: readonly PlanBalonu[]): number {
  const nolar = new Set<number>();
  for (const k of kurallar) {
    const secilen = k.balonlar === 'hepsi' ? balonlar.map((b) => b.no)
      : k.balonlar === 'kritik' ? balonlar.filter((b) => b.kritik).map((b) => b.no) : k.balonlar;
    for (const n of secilen) nolar.add(n);
  }
  return nolar.size;
}

export function operasyonlar(
  adimlar: readonly OperasyonGirdisi[], talimatli: ReadonlySet<number>, karakteristik: ReadonlyMap<number, number>,
): ProsesOperasyonu[] {
  return adimlar.map((a) => ({
    ...a, karakteristik: karakteristik.get(a.opNo) ?? null, talimat: talimatli.has(a.opNo), numunePlani: karakteristik.has(a.opNo),
  }));
}

export const plansizOperasyonlar = (adimlar: readonly OperasyonGirdisi[], planli: ReadonlySet<number>): number[] =>
  adimlar.filter((a) => !a.fason && !planli.has(a.opNo)).map((a) => a.opNo);
