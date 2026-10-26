// Operatör ekranının kayıt biçimi Arkon'un ortak modelidir (arkon/shared/model.ts): iş (Order) paket, sonuç ve ekran durumunun birleşimidir.
// Modelde `any` kalan alanlar (kararlar, hazırlık işaretleri, istasyon kaydı) burada tiplenir; kayıttaki değer olduğu gibi kalır.
import type { Meas, Order, Pkg, PlanItem, Result, SampleRequest } from '../hazirlik/tipler.ts';
import type { Olcen, Ton } from '../hazirlik/tipler.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';

export type { Meas, Order, Pkg, PlanItem, Result, SampleRequest, Olcen, Ton };

export type IsDurumu = Order['state'];

// Kalite kararı: numune sonucu gelince işe yazılır; ret kartı "Anladım" denene dek görünür.
// km: karar Kalite Merkezi'nin ilk parça reddidir; terminal durdurmaz, uyarır (559 2).
export interface KaliteKarari { status: string; bad?: string; note?: string; at: number; ack?: boolean; km?: boolean }

// Ekrandaki iş: paket ve sonuçla birleşmiş iş emri.
export interface Is extends Order {
  pkg?: Pkg;
  meas?: Record<string, Meas>;
  lastDecision?: KaliteKarari | null;
  ready?: Record<string, boolean>;
  toolEvt?: number;
  acks?: Record<string, UyariOnayi>;
  kart?: number | null;
}

export interface UyariOnayi { at: number; by: string; cnt: number; k: number; v?: number | undefined }

export interface SiradakiKontrol { v: number; u: 'parça' | 'dk'; b: PlanItem; who: Olcen }
export interface KontrolTakvimi { due: PlanItem[]; next: SiradakiKontrol | null; who: Record<number, Olcen>; why: Record<number, string> }

export type GorevEylemi =
  | 'start' | 'resume' | 'restart' | 'pause' | 'setup' | 'stop' | 'finish' | 'tool' | 'warns' | 'drawing' | 'st' | 'measure' | 'call'
  | 'prepnext' | 'ack' | 'sample' | 'next';

// "Şimdi" kartı: işin o an beklediği adım ve düğmesi.
export interface Gorev {
  tone: Ton; icon: SimgeAdi; t: string; d: string;
  act?: GorevEylemi | null; btn?: string | null; act2?: GorevEylemi; btn2?: string;
  pulse?: boolean; quiet?: boolean; key?: string; dismiss?: boolean; toolId?: string; id?: number;
}

export interface IlkParcaDurumu { acik: boolean; yeniden?: boolean; sayilan: number; kararBekleyen?: number | null }

// Çağrı takibi (Andon): aşama 0 çağrıldı, 1 alındı, 2 yolda, 3 geldi.
export interface CagriIletisi { from: 'sys' | 'me' | 'them'; text: string; at: number }
export interface Cagri {
  k: string; l: string; d: string; eta: number; t0: number; stage: number; who: string | null; note: string | null;
  times: number[]; msgs: CagriIletisi[]; esc?: boolean;
}

// Durum çizgisinin parçası (eski ekranda segs): f ve t vardiya dakikasıdır, n duruş nedeni.
export interface DurumParcasi { f: number; t: number; s: string; n?: string | null | undefined }

export type { SampleRequest as NumuneIstegi };

// 564 1 b, 600 a: kalite istasyonuna gelen numune; `kaliteIstasyonu` (istasyon kodu) yalnız sunucudan gelir.
export type KaliteNumunesi = SampleRequest & { kaliteIstasyonu?: string };

// 564 6 a, 600 a: kalite istasyonunun lot kararı sonuç belgesinin `lotKarari` alanıdır; `kayit` Kalite Merkezi'nin lot kaydıdır (sunucu yazar).
export type LotSinifi = 'Kritik' | 'Majör' | 'Minör';
export interface LotKarari {
  karar: 'kabul' | 'ret'; bulunan: Record<LotSinifi, number | null>; not?: string | null; at: number; by?: string;
  kayit?: { no: string; karar: 'Kabul' | 'Ret'; redde?: string };
}
