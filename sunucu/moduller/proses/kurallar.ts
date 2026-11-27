import type { NcDurumu, ProsesHalkasi, ProsesOperasyonu, ProsesRevizyonu } from '#paylasilan/sozlesme/proses.ts';

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

// Parça düzeyinde okunacak yeri bugün olmayan halka (Atölye ön bakışı 3277); kurulum sayfası 3800-3'te NC kaydından üretilir.
export const KAYNAKSIZ_HALKALAR: readonly ProsesHalkasi[] = [
  { anahtar: 'kurulum', durum: 'kaynak-yok', ozet: null, sahip: 'CNC Kurulum', yol: null },
];

// Zincir sırası Atölye ön bakışıyladır: çizim, rota, NC, takım, bağlama, kurulum, kontrol planı, ilk parça.
export function zincir(h: {
  cizim: ProsesHalkasi; rota: ProsesHalkasi; nc: ProsesHalkasi; takim: ProsesHalkasi; baglama: ProsesHalkasi; kontrol: ProsesHalkasi; ilkParca: ProsesHalkasi;
}): ProsesHalkasi[] {
  const kurulum = KAYNAKSIZ_HALKALAR.find((x) => x.anahtar === 'kurulum');
  if (!kurulum) throw new Error('Halka tanımsız: kurulum');
  return [h.cizim, h.rota, h.nc, h.takim, h.baglama, kurulum, h.kontrol, h.ilkParca];
}

/* ---------------- NC/CAM program kaydı ve teknik resim revizyonu (3800) ---------------- */

// Revizyon kodu büyük-küçük harf ve kenar boşluğu ayırmadan karşılaştırılır (3788 markalama tanımıyla aynı).
export const revizyonAnahtari = (kod: string | null): string => (kod === null ? '' : kod.trim().toUpperCase());
export const ayniRevizyon = (a: string | null, b: string | null): boolean => revizyonAnahtari(a) === revizyonAnahtari(b);

export interface CizimRevizyonuGirdisi { kod: string | null; durum: 'yayinda' | 'eski'; sira: number }

// Belge Merkezi'nin revizyonlarından seçici listesi: kodsuz revizyon listeye girmez, aynı kod tek satırdır, yeniden eskiye.
// Yürürlükteki parça revizyonu (Değişiklik Yönetimi) listede işaretlenir; çizimde yoksa da başa eklenir.
export function revizyonListesi(cizim: readonly CizimRevizyonuGirdisi[], yururlukte: string | null): ProsesRevizyonu[] {
  const sonuc: ProsesRevizyonu[] = [];
  for (const r of [...cizim].sort((a, b) => b.sira - a.sira)) {
    if (r.kod === null || r.kod.trim() === '' || sonuc.some((x) => ayniRevizyon(x.kod, r.kod))) continue;
    sonuc.push({ kod: r.kod.trim(), durum: r.durum });
  }
  if (yururlukte !== null && yururlukte.trim() !== '') {
    const i = sonuc.findIndex((x) => ayniRevizyon(x.kod, yururlukte));
    if (i >= 0) sonuc[i] = { kod: sonuc[i]!.kod, durum: 'yururlukte' };
    else sonuc.unshift({ kod: yururlukte.trim(), durum: 'yururlukte' });
  }
  return sonuc;
}

// İstenen revizyon listede varsa o; yoksa yürürlükteki, o da yoksa ilk (en yeni) revizyon. Revizyonsuz parçada null.
export function revizyonSec(liste: readonly ProsesRevizyonu[], istenen: string | null): string | null {
  const bulunan = istenen === null ? undefined : liste.find((r) => ayniRevizyon(r.kod, istenen));
  return (bulunan ?? liste.find((r) => r.durum === 'yururlukte') ?? liste[0])?.kod ?? null;
}

// Yazılan revizyon kodu parçanın revizyonlarından biri olmalıdır; boş kod tüm revizyonlar demektir.
export function revizyonKoduGecerliMi(liste: readonly ProsesRevizyonu[], kod: string | null): string | null | false {
  if (kod === null) return null;
  const r = liste.find((x) => ayniRevizyon(x.kod, kod));
  return r === undefined ? false : r.kod;
}

export interface ProgramKapsami { opNo: number; revizyonKodu: string | null; durum: NcDurumu }

// Seçili revizyonda geçerli programlar: bir operasyonun bu revizyona özel (eski olmayan) programı varsa yalnız özel olanlar;
// yoksa tüm revizyonlar programları "genel yerine" işaretiyle. Başka revizyonun programı hiç gösterilmez. Eskiler sonda kalır.
export function gecerliProgramlar<T extends ProgramKapsami>(programlar: readonly T[], secili: string | null): (T & { genelYerine: boolean })[] {
  const ozelOp = new Set(programlar.filter((p) => p.revizyonKodu !== null && p.durum !== 'eski' && secili !== null && ayniRevizyon(p.revizyonKodu, secili)).map((p) => p.opNo));
  const sonuc = programlar.flatMap((p) => {
    if (p.revizyonKodu === null) return ozelOp.has(p.opNo) ? [] : [{ ...p, genelYerine: secili !== null && programlar.some((x) => x.opNo === p.opNo && x.revizyonKodu !== null) }];
    return secili !== null && ayniRevizyon(p.revizyonKodu, secili) ? [{ ...p, genelYerine: false }] : [];
  });
  return [...sonuc.filter((p) => p.durum !== 'eski'), ...sonuc.filter((p) => p.durum === 'eski')];
}

export interface NcHalkaGirdisi { ad: string; durum: NcDurumu; takimSayisi: number; aparatSayisi: number }

// NC, takım ve bağlama halkası seçili revizyonda geçerli (eski olmayan) programlardan türer. Hangi operasyonun NC istediği bugün
// bilinmez (3800 V): program yoksa "yok", onaysız program "eksik".
export function ncHalkalari(programlar: readonly NcHalkaGirdisi[]): { nc: ProsesHalkasi; takim: ProsesHalkasi; baglama: ProsesHalkasi } {
  const ortak = { sahip: 'Proses', yol: null } as const;
  const gecerli = programlar.filter((p) => p.durum !== 'eski');
  if (gecerli.length === 0) {
    return {
      nc: { ...ortak, anahtar: 'nc', durum: 'yok', ozet: null },
      takim: { ...ortak, anahtar: 'takim', durum: 'yok', ozet: null },
      baglama: { ...ortak, anahtar: 'baglama', durum: 'yok', ozet: null },
    };
  }
  const onaysiz = gecerli.filter((p) => p.durum !== 'onayli').length;
  const takimsiz = gecerli.filter((p) => p.takimSayisi === 0).length;
  const aparatsiz = gecerli.filter((p) => p.aparatSayisi === 0).length;
  const n = String(gecerli.length);
  return {
    nc: { ...ortak, anahtar: 'nc', durum: onaysiz > 0 ? 'eksik' : 'tamam', ozet: onaysiz > 0 ? `${n} program · ${String(onaysiz)} onaysız` : `${n} program onaylı` },
    takim: {
      ...ortak, anahtar: 'takim', durum: takimsiz > 0 ? 'eksik' : 'tamam',
      ozet: takimsiz > 0 ? `${String(takimsiz)} programda takım listesi yok` : `${String(gecerli.reduce((t, p) => t + p.takimSayisi, 0))} takım satırı`,
    },
    baglama: {
      ...ortak, anahtar: 'baglama', durum: aparatsiz > 0 ? 'eksik' : 'tamam',
      ozet: aparatsiz > 0 ? `${String(aparatsiz)} programda aparat yok` : `${String(gecerli.reduce((t, p) => t + p.aparatSayisi, 0))} aparat satırı`,
    },
  };
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
