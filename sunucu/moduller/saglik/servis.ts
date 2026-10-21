import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { promisify } from 'node:util';
import type { Db } from '#cekirdek/db.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { Ayrinti } from '#paylasilan/sozlesme/saglik.ts';
import { YOKLAMA_SURE_SINIRI_MS, commitSec, diskDurumu, isDurumuOzeti, uyarilar } from './kurallar.ts';
import type { YedekBilgisi } from './kurallar.ts';
import { sonGocAdi, veritabaniYokla, vtBaglantiSay } from './sorgular.ts';
import { yedekOrtaminiKur, yedekleriListele } from '../ayarlar/disari.ts';

const calistir = promisify(execFile);

export type GitOkuyucu = () => Promise<string | null>;

// git yoksa ya da dizin depo değilse hata verir; bu "bilinmiyor"dur, süreç düşmez.
export async function gitCommitOku(klasor?: string): Promise<string | null> {
  try {
    const { stdout } = await calistir('git', ['rev-parse', 'HEAD'], {
      timeout: 5000,
      windowsHide: true,
      ...(klasor === undefined ? {} : { cwd: klasor }),
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Çalışan commit süreç ömründe değişmez. Başarısızlık da saklanır: git'in ya da deponun olmadığı
// dağıtımda her istek yeni bir süreç açmasın.
export function onbellekliOkuyucu(oku: GitOkuyucu): GitOkuyucu {
  let bekleyen: Promise<string | null> | null = null;
  return () => {
    bekleyen ??= oku();
    return bekleyen;
  };
}

// Süre dolarsa null döner; zamanlayıcı her durumda temizlenir.
async function sureliBekle<T>(is: Promise<T>, sureSiniriMs: number): Promise<T | null> {
  let zamanlayici: NodeJS.Timeout | undefined;
  const sureDoldu = new Promise<null>((coz) => {
    zamanlayici = setTimeout(() => { coz(null); }, sureSiniriMs);
  });
  try {
    return await Promise.race([is, sureDoldu]);
  } finally {
    clearTimeout(zamanlayici);
  }
}

export async function saglikliMi(db: Db, sureSiniriMs: number = YOKLAMA_SURE_SINIRI_MS): Promise<boolean> {
  try {
    const ok = veritabaniYokla(db).then(() => true);
    // Süre dolduktan sonra gelen hata işlenmemiş red olmasın.
    ok.catch(() => undefined);
    return (await sureliBekle(ok, sureSiniriMs)) === true;
  } catch {
    return false;
  }
}

// Yedek klasöründeki en yeni yedek dosyası: Sistem Ayarları'ndaki yedek listesiyle aynı kaynak.
export async function surecYedegi(db: Db): Promise<YedekBilgisi> {
  const { durum, yedekler } = await yedekleriListele(await yedekOrtaminiKur(db));
  const en = yedekler[0];
  return { durum, sonYedek: en === undefined ? null : new Date(en.zaman) };
}

export type OlayDongusuOlcer = () => number | null;

// Ölçüm ilk istekte başlar ve her okumada sıfırlanır: değer son okumadan beri olan gecikmedir. Henüz örnek yoksa null.
export function olayDongusuOlceri(): OlayDongusuOlcer {
  let olcum: ReturnType<typeof monitorEventLoopDelay> | null = null;
  return () => {
    if (olcum === null) {
      olcum = monitorEventLoopDelay({ resolution: 20 });
      olcum.enable();
      return null;
    }
    const deger = olcum.count === 0 ? null : Math.round(olcum.percentile(99) / 10_000) / 100;
    olcum.reset();
    return deger;
  };
}

export interface DiskOlcusu { bos: number; toplam: number }
export type DiskOkuyucu = (dizin: string) => Promise<DiskOlcusu | null>;
export interface DiskDizinleri { yedek: string | null; veritabani: string | null }

// Klasör yoksa ya da okunamıyorsa bilinmiyor (null); sıfır uydurulmaz. Boş yer servis hesabının kullanabileceği yerdir.
export async function diskOku(dizin: string): Promise<DiskOlcusu | null> {
  try {
    const s = await statfs(dizin);
    return { bos: s.bavail * s.bsize, toplam: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export interface AyrintiGirdisi {
  gitOkuyucu: GitOkuyucu;
  ortamCommit: string | null;
  ortam: Ayrinti['ortam'];
  calismaSuresiSn: number;
  isDurumlari: () => readonly IsDurumu[];
  yoklamaSureSiniriMs?: number;
  // Verilmezse iki disk de bilinmiyor (null).
  diskDizinleri?: () => Promise<DiskDizinleri>;
  diskOku?: DiskOkuyucu;
  // Verilmezse ya da süresinde okunamazsa yedeğin durumu bilinmiyor: bu da uyarıdır.
  yedekOku?: () => Promise<YedekBilgisi>;
  // Verilmezse ölçülmez (null).
  olayDongusu?: OlayDongusuOlcer;
  bellekOku?: () => { rss: number; heapUsed: number };
  simdi?: Date;
}

// Ağ sürücüsündeki yedek klasörü ya da asılı veritabanı ucu askıda tutmasın: süre dolarsa bilinmiyor.
async function sureliGuvenli<T>(is: () => Promise<T>, sureSiniriMs: number): Promise<T | null> {
  try {
    const sozu = is();
    sozu.catch(() => undefined);
    return await sureliBekle(sozu, sureSiniriMs);
  } catch {
    return null;
  }
}

async function diskleriTopla(girdi: AyrintiGirdisi, sureSiniri: number): Promise<{ yedekDiski: Ayrinti['yedekDiski']; veritabaniDiski: Ayrinti['veritabaniDiski'] }> {
  const { diskDizinleri } = girdi;
  const dizinler = diskDizinleri === undefined ? null : await sureliGuvenli(diskDizinleri, sureSiniri);
  const oku = girdi.diskOku ?? diskOku;
  const olc = async (dizin: string | null | undefined) => {
    if (dizin === null || dizin === undefined) return null;
    const olcu = await sureliGuvenli(() => oku(dizin), sureSiniri);
    return olcu === null ? null : diskDurumu(olcu.bos, olcu.toplam);
  };
  return { yedekDiski: await olc(dizinler?.yedek), veritabaniDiski: await olc(dizinler?.veritabani) };
}

export async function ayrintiTopla(db: Db, girdi: AyrintiGirdisi): Promise<Ayrinti> {
  const sureSiniri = girdi.yoklamaSureSiniriMs ?? YOKLAMA_SURE_SINIRI_MS;
  const commit = commitSec(await girdi.gitOkuyucu(), girdi.ortamCommit);
  const baslangic = performance.now();
  let veritabaniGecikmeMs: number | null = null;
  let sonGoc: string | null = null;
  let vtBaglantiSayisi: number | null = null;
  if (await saglikliMi(db, sureSiniri)) {
    veritabaniGecikmeMs = Math.round(performance.now() - baslangic);
    sonGoc = await sureliGuvenli(() => sonGocAdi(db), sureSiniri);
    vtBaglantiSayisi = await sureliGuvenli(() => vtBaglantiSay(db), sureSiniri);
  }
  const bellek = girdi.bellekOku?.() ?? process.memoryUsage();
  const isler = girdi.isDurumlari();
  const diskler = await diskleriTopla(girdi, sureSiniri);
  const { yedekOku } = girdi;
  const yedek = yedekOku === undefined ? null : await sureliGuvenli(yedekOku, sureSiniri);
  const simdi = girdi.simdi ?? new Date();
  return {
    veritabaniGecikmeMs, sonGoc, commit, calismaSuresiSn: girdi.calismaSuresiSn, ortam: girdi.ortam,
    isler: isler.map(isDurumuOzeti),
    ...diskler,
    bellek: { rssBayt: bellek.rss, yiginBayt: bellek.heapUsed },
    olayDongusuGecikmeMs: girdi.olayDongusu?.() ?? null,
    vtBaglantiSayisi,
    uyarilar: uyarilar({
      simdi, surecBaslangici: new Date(simdi.getTime() - girdi.calismaSuresiSn * 1000), isler, yedek, ...diskler,
    }),
  };
}
