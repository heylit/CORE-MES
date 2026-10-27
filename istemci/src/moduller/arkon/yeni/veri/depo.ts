import type { ArkonKisi } from '#paylasilan/sozlesme/arkon.ts';
import type { CihazDurumu } from '#paylasilan/sozlesme/oturum.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { tohumla } from '../../baglanti.ts';
import type { AnomaliDonemi, AnomaliIstatistigi, AnomaliOlaylari, Anomaliler } from '../../../../../../arkon/web/src/data/anomali.ts';
import type { CagriEkiplerim } from '../../../../../../arkon/web/src/data/cagri-ekiplerim.ts';
import type { MerkezDurumu } from '../../../../ortak/cizim/cekirdek/cizim-merkezi.ts';
import type { MakineAyrimlari } from '../../../../../../arkon/web/src/data/makine-secimi.ts';
import type { OperatorOzeti, OzetDonemi } from '../../../../../../arkon/web/src/data/ozetim.ts';
import type { RefakatKarti } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import type { PkgFile } from '../../../../../../arkon/shared/model.ts';
import type { BusMsg, User } from '../cekirdek/tipler.ts';
import type { Tasiyici } from './tasiyici.ts';

// Arkon'un veri katmanı (arkon/web/src/data/store.ts) yeni ekranda da tek kaynaktır: cihazdaki ayna, gönderim kuyruğu, sürümle yazma
// ve üç yollu birleştirme, ileti ve üretim kaydı aynen oradan gelir. Bu dosya onu yükler, taşıyıcıyla bağlar ve ekranın kullandığı
// yüzünü tipler. store.ts Arkon'un kendi tsconfig'iyle (strict) denetlenir; istemci derlemesi onu glob ile yükler, böylece istemcinin
// ek kuralları (noUncheckedIndexedAccess) eski dosyaya uygulanmaz. Yüz ile dosyanın eşliğini depo.test.ts gerçek modülle sınar.

export interface ArkonDurumu {
  mode: 'server' | 'local'; base: string | null; online: boolean; pending: number; baskasi: number; user: User | null; err: string; memory: boolean; kip: CihazKipi | null;
}
export type CihazKipi = 'ortak' | 'kisisel';
export type Ileti = BusMsg & Record<string, unknown>;
export interface KayitSorgusu {
  machine?: string | null; wc?: string | null; from?: number | null; to?: number | null; order?: string | null; pkg?: string | null;
  item?: number | string | null; limit?: number | null;
}

// store.ts'deki tanımlarla aynı (orada dışa verilmiş ama istemci derlemesi o dosyayı tip için izlemez).
export interface MerkezBelgesi { id: number; ad: string; tur: string; harf: string; tip: 'pdf' | 'model'; dosyaAdi: string; ozet: string }
export interface TmiAdim { id: number; sira: number; ad: string; aciklama: string | null; tamam: boolean }

export interface ArkonDeposu {
  DB: {
    all(depo: string): Promise<unknown[]>;
    get(depo: string, kimlik: string): Promise<unknown>;
    put(depo: string, belge: unknown, kimlik?: string): Promise<void>;
    del(depo: string, kimlik: string): Promise<void>;
    readonly memory: boolean;
  };
  Bus: { send(m: BusMsg): void; yerel(m: BusMsg): void; on(f: (m: Ileti) => void): () => void };
  Log: {
    add(tur: string, satir: Record<string, unknown>): Promise<Record<string, unknown>>;
    query(tur: string, sorgu?: KayitSorgusu): Promise<Record<string, unknown>[]>;
    on(f: (tur: string, satir: Record<string, unknown> | null) => void): () => void;
  };
  Auth: { current(): User | null; logout(): Promise<void> };
  Server: {
    flush(): Promise<void>;
    materials(q: string): Promise<{ id: number; kod: string; ad: string | null; birim: string | null }[]>;
    merkezBelgeleri(q: string): Promise<MerkezBelgesi[]>;
    merkezdenAl(belgeId: number): Promise<PkgFile & { bytes: Uint8Array }>;
    merkezKontrol(dosyalar: { belgeId: number; ozet: string }[]): Promise<MerkezDurumu[]>;
    anomaliler(): Promise<Anomaliler>;
    anomaliOlaylari(): Promise<AnomaliOlaylari>;
    anomaliIstatistigi(donem: AnomaliDonemi, tarih: string): Promise<AnomaliIstatistigi>;
    operatorOzeti(donem: OzetDonemi, kisiId?: number | null): Promise<OperatorOzeti>;
    makineAyrimlari(emirId: number): Promise<MakineAyrimlari | undefined>;
    refakatKartlari(istasyon: string, emirler: readonly number[]): Promise<RefakatKarti[]>;
    cagriEkiplerim(): Promise<CagriEkiplerim>;
    tmiAdimlari(emirId: number): Promise<TmiAdim[]>;
    tmiAdimIsaretle(emirId: number, adimId: number, tamam: boolean): Promise<TmiAdim[]>;
    uretimHazirligi(emirId: number, istasyon: string): Promise<{ hazir: boolean; metin?: string }>;
  };
  Plan: { sirala(g: { kaynak: { tur: string; id: number }; onceki: number[]; yeni: number[]; planSurumu: number }): Promise<unknown>; surum(): Promise<{ planSurumu: number }> };
  Kuyruk: { sirala(g: { istasyon: string; onceki: string[]; yeni: string[] }): Promise<{ surum: number }>; planaDon(istasyon: string): Promise<{ silinen: number }> };
  Cache: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void>; clear(): Promise<void> };
  Pkg: { toFile(p: unknown): string; fromFile(metin: string): unknown; fileName(p: { no?: string; rev?: string }): string };
  init(): Promise<ArkonDurumu>;
  status(): ArkonDurumu;
  onStatus(f: (s: ArkonDurumu) => void): () => void;
  tasiyiciKur(t: Pick<Tasiyici, 'fetch' | 'EventSource'> | null): void;
  sha256(u: Uint8Array): Promise<string>;
  // Tembel kip (kart #731): paket belgesindeki dosya `{ $blob, t, n }` işaretiyle gelir; açılacak paket `coz` ile baytlanır.
  tembelKur(): void;
  // Cihaz kipi (karar 738 a, kart #739): kişisel cihaz veriyi yalnız bellekte tutar; init'ten önce çağrılır.
  kipKur(k: CihazKipi): Promise<void>;
  coz<T>(x: T): Promise<T>;
  // Arka planda cihaza indirilecek belgeler: öncelikliler (açık iş, kuyruk) önce iner ve temizlikte silinmez.
  dosyalariIndir(oncelikli: readonly unknown[], diger?: readonly unknown[]): void;
}

// Yalnız bu dosya store.ts'yi yükler (alımda dosya bu klasöre taşınınca yalnız bu satır değişir).
const STORE = import.meta.glob<{ AKStore: ArkonDeposu }>('../../../../../../arkon/web/src/data/store.ts');

export async function depoModulu(): Promise<ArkonDeposu> {
  const yukle = Object.values(STORE)[0];
  if (yukle === undefined) throw new Error('Arkon veri katmanı bulunamadı.');
  return (await yukle()).AKStore;
}

export interface BaslatmaGirdisi {
  kisi: ArkonKisi;
  tema: 'dark' | 'light';
  tasiyici: Pick<Tasiyici, 'fetch' | 'EventSource'>;
  depo?: Pick<Storage, 'setItem' | 'getItem'>;
  koken?: string;
  cihaz?: () => Promise<CihazDurumu>;
}

const KIP_ANAHTARI = 'arkon:cihazKipi';

// Sunucu cihazı ortak diye tanımıyorsa kişiseldir. Sunucuya ulaşılamazsa son bilinen kip kullanılır: ortak terminal ağ kesintisinde
// sakladığı çizimleri silmesin. Hiç bilinmiyorsa kişisel sayılır.
export async function cihazKipiniBul(
  sor: () => Promise<CihazDurumu>, depo: Pick<Storage, 'setItem' | 'getItem'> | null,
): Promise<CihazKipi> {
  try {
    const kip: CihazKipi = (await sor()).ortak ? 'ortak' : 'kisisel';
    try { depo?.setItem(KIP_ANAHTARI, JSON.stringify(kip)); } catch { /* depolama kapalı */ }
    return kip;
  } catch {
    try { return JSON.parse(depo?.getItem(KIP_ANAHTARI) ?? 'null') === 'ortak' ? 'ortak' : 'kisisel'; } catch { return 'kisisel'; }
  }
}

// Çerçevedeki açılışın aynısı: oturum ve sunucu adresi cihaza yazılır (tohumla), sonra veri katmanı TMI'ye bağlanır. Oturum
// store.ts yüklenirken de okunduğu için tohum yüklemeden önce yazılır. Kişi değişince yeniden çağrılır (taşıyıcı oturumu tazeler).
// Kişisel cihazda kipKur önceki veriyi (oturum dahil) sildiği için tohum ondan sonra yeniden yazılır.
export async function depoyuBaslat(g: BaslatmaGirdisi): Promise<ArkonDeposu> {
  const yerel = (() => { try { return g.depo ?? window.localStorage; } catch { return null; } })();
  const tohum = () => {
    try {
      if (yerel !== null) tohumla(yerel, { kokAdres: g.koken ?? window.location.origin, kisi: g.kisi, tema: g.tema });
    } catch { /* depolama kapalı: veri katmanı bellekte çalışır, oturum sunucudan okunur */ }
  };
  tohum();
  const kip = await cihazKipiniBul(g.cihaz ?? (() => api.get<CihazDurumu>('/oturum/cihaz')), yerel);
  const depo = await depoModulu();
  await depo.kipKur(kip);
  tohum();
  depo.tembelKur();
  depo.tasiyiciKur(g.tasiyici);
  await depo.init();
  return depo;
}
