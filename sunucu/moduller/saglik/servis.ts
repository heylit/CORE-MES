import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { cpus, freemem, totalmem } from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { surecHavuzDurumu } from '#cekirdek/db.ts';
import type { Db, HavuzDurumu } from '#cekirdek/db.ts';
import { istekSayaclari } from '#cekirdek/istek-olcumu.ts';
import type { UcSayaci } from '#cekirdek/istek-olcumu.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { Ayrinti, MetrikDakikasi, OtomatikAcilis } from '#paylasilan/sozlesme/saglik.ts';
import {
  BEKCI_GOREV_ADI, METRIK_PENCERESI, YOKLAMA_SURE_SINIRI_MS, commitSec, diskDurumu, isDurumuOzeti, makineIslemciYuzdesi, metrikDakikasi,
  otomatikAcilisCoz, sayacFarki, surecIslemciYuzdesi, uyarilar,
} from './kurallar.ts';
import type { GorevSorgusu, IslemciZamani, YedekBilgisi } from './kurallar.ts';
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

const GOREV_SORGU_SURESI_MS = 5000;
const OTOMATIK_ACILIS_ONBELLEK_MS = 10 * 60 * 1000;

// Yalnız okur: görevi kurmak, değiştirmek ya da çalıştırmak yönetici ister ve uygulamanın işi değildir. Program PATH'ten değil
// Windows klasöründen alınır, kabuk açılmaz, bağımsız değişkenler sabittir.
export async function zamanlayiciGoreviSorgula(gorevAdi: string, ortam: NodeJS.ProcessEnv = process.env): Promise<GorevSorgusu> {
  const windows = ortam['SystemRoot']?.trim() || ortam['windir']?.trim() || '';
  if (windows === '') return { tur: 'okunamadi' };
  try {
    const { stdout } = await calistir(path.win32.join(windows, 'System32', 'schtasks.exe'), ['/Query', '/TN', gorevAdi, '/XML'], {
      timeout: GOREV_SORGU_SURESI_MS, windowsHide: true, encoding: 'buffer', maxBuffer: 1024 * 1024,
    });
    return { tur: 'var', xml: stdout };
  } catch (hata) {
    // Süreç kendi çıkış koduyla bittiyse görev yok ya da görünmüyor; süre dolması ve başlatılamama bilinmiyor.
    const kod = (hata as { code?: unknown; killed?: boolean }).code;
    return typeof kod === 'number' && (hata as { killed?: boolean }).killed !== true ? { tur: 'yok' } : { tur: 'okunamadi' };
  }
}

export type OtomatikAcilisOkuyucu = () => Promise<OtomatikAcilis | null>;

// Ayrıntı ucu sık okunur; her istekte süreç açılmasın diye sonuç bir süre saklanır.
export function onbellekliOtomatikAcilis(
  sorgula: (gorevAdi: string) => Promise<GorevSorgusu>, simdi: () => number = Date.now, sureMs: number = OTOMATIK_ACILIS_ONBELLEK_MS,
): OtomatikAcilisOkuyucu {
  let son: { zaman: number; sonuc: Promise<OtomatikAcilis> } | null = null;
  return () => {
    const an = simdi();
    if (son === null || an - son.zaman >= sureMs) {
      son = { zaman: an, sonuc: sorgula(BEKCI_GOREV_ADI).catch((): GorevSorgusu => ({ tur: 'okunamadi' })).then((s) => otomatikAcilisCoz(s, BEKCI_GOREV_ADI)) };
    }
    return son.sonuc;
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
  // Verilmezse (Windows dışı) null.
  otomatikAcilisOku?: OtomatikAcilisOkuyucu;
  // Verilmezse ya da süresinde okunamazsa yayın bilinmiyor: null.
  yayinOku?: () => Promise<string | null>;
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
  const { otomatikAcilisOku } = girdi;
  // Sorgunun kendi süre sınırı vardır; bu sınır yalnız asılı okuyucuya karşıdır.
  const otomatikAcilis = otomatikAcilisOku === undefined ? null : await sureliGuvenli(otomatikAcilisOku, GOREV_SORGU_SURESI_MS + 1000);
  const { yayinOku } = girdi;
  const yayin = yayinOku === undefined ? null : await sureliGuvenli(yayinOku, sureSiniri);
  const simdi = girdi.simdi ?? new Date();
  return {
    veritabaniGecikmeMs, sonGoc, commit, yayin, calismaSuresiSn: girdi.calismaSuresiSn, ortam: girdi.ortam,
    isler: isler.map(isDurumuOzeti),
    ...diskler,
    bellek: { rssBayt: bellek.rss, yiginBayt: bellek.heapUsed },
    olayDongusuGecikmeMs: girdi.olayDongusu?.() ?? null,
    vtBaglantiSayisi,
    otomatikAcilis,
    uyarilar: uyarilar({
      simdi, surecBaslangici: new Date(simdi.getTime() - girdi.calismaSuresiSn * 1000), isler, yedek, ...diskler,
    }),
  };
}

export interface MetrikKaynagi {
  simdi: () => number;
  istekSayaclari: () => UcSayaci[];
  havuz: () => HavuzDurumu | null;
  surecIslemci: () => NodeJS.CpuUsage;
  makineIslemci: () => IslemciZamani;
  cekirdekSayisi: () => number;
  bellek: () => { rss: number; heapUsed: number };
  makineBellek: () => { bos: number; toplam: number };
  olayDongusu: OlayDongusuOlcer;
}

function makineIslemciZamani(): IslemciZamani {
  let bosta = 0;
  let toplam = 0;
  for (const c of cpus()) {
    bosta += c.times.idle;
    toplam += c.times.idle + c.times.user + c.times.nice + c.times.sys + c.times.irq;
  }
  return { bosta, toplam };
}

export const SUREC_METRIK_KAYNAGI: MetrikKaynagi = {
  simdi: () => Date.now(),
  istekSayaclari,
  havuz: surecHavuzDurumu,
  surecIslemci: () => process.cpuUsage(),
  makineIslemci: makineIslemciZamani,
  cekirdekSayisi: () => cpus().length,
  bellek: () => process.memoryUsage(),
  makineBellek: () => ({ bos: freemem(), toplam: totalmem() }),
  olayDongusu: olayDongusuOlceri(),
};

interface Taban { an: number; istek: UcSayaci[]; mesgulToplam: number | null; surecCpu: NodeJS.CpuUsage; makineCpu: IslemciZamani }

// Dakikalık tur: ilk tur yalnız taban alır, sonraki her tur bir önceki turdan bu yana olanı yazar. Son METRIK_PENCERESI dakika bellekte.
export class MetrikToplayici {
  private taban: Taban | null = null;
  private readonly pencere: MetrikDakikasi[] = [];
  private readonly k: MetrikKaynagi;

  constructor(kaynak: MetrikKaynagi) {
    this.k = kaynak;
  }

  tur(): MetrikDakikasi | null {
    const an = this.k.simdi();
    const istek = this.k.istekSayaclari();
    const havuz = this.k.havuz();
    const surecCpu = this.k.surecIslemci();
    const makineCpu = this.k.makineIslemci();
    const olayDongusuP99Ms = this.k.olayDongusu();
    const onceki = this.taban;
    this.taban = { an, istek, mesgulToplam: havuz?.mesgulToplam ?? null, surecCpu, makineCpu };
    if (onceki === null || an <= onceki.an) return null;
    const gecenMs = an - onceki.an;
    const cpuFarki = surecCpu.user + surecCpu.system - (onceki.surecCpu.user + onceki.surecCpu.system);
    const makine = this.k.makineBellek();
    const dakika = metrikDakikasi({
      an: new Date(an),
      aralikMs: gecenMs,
      istekFarki: sayacFarki(onceki.istek, istek),
      havuz,
      oncekiMesgulToplam: onceki.mesgulToplam,
      surecIslemciYuzde: surecIslemciYuzdesi(cpuFarki, gecenMs, this.k.cekirdekSayisi()),
      makineIslemciYuzde: makineIslemciYuzdesi(onceki.makineCpu, makineCpu),
      bellek: this.k.bellek(),
      makineBos: makine.bos,
      makineToplam: makine.toplam,
      olayDongusuP99Ms,
    });
    this.pencere.push(dakika);
    if (this.pencere.length > METRIK_PENCERESI) this.pencere.splice(0, this.pencere.length - METRIK_PENCERESI);
    return dakika;
  }

  dakikalar(): MetrikDakikasi[] {
    return [...this.pencere];
  }
}

export const surecMetrikleri = new MetrikToplayici(SUREC_METRIK_KAYNAGI);
