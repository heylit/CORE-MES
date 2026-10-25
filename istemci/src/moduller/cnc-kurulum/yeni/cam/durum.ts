import { state } from '../depo.ts';
import type { CamParametre } from './tipler.ts';

// Oto-CAM'in kayittaki alanlari (`state.cam`, `state.suProf`); adlar prototipindir, eski ekranla ayni kayit okunur.
export interface AtolyeKosullari { meas: string; jaw: string; fix: string; kit: string; job: string; op: string; qc: string; tol: string; faiw: string; [alan: string]: string }
export interface CamKaydi {
  prm: Partial<CamParametre> & Record<string, unknown>;
  dialect: string;
  cal: Record<string, { f?: number; [alan: string]: unknown } | undefined>;
  vis: Record<string, boolean | undefined>;
  sel: number;
  selRow?: number;
  route?: string;
  routeKey?: string;
  rt?: Record<string, Record<string, string> | undefined>;
  mtMill: string;
  mtLathe?: string;
  qty?: number;
  su: Record<string, number | '' | undefined>;
  suV?: number;
  sc: AtolyeKosullari;
  [alan: string]: unknown;
}
export type TezgahProfiliKaydi = Record<string, string | number | undefined>;

// Acilis varsayilanlari (prm, cal, su/suV, sc, mtMill, suProf) cekirdekte durum.ts'te bir kez uygulanir; burada yalniz tipli okuma.
export function camKaydi(): CamKaydi { return (state as Record<string, unknown>)['cam'] as CamKaydi; }
export function suProfKaydi(): Record<string, TezgahProfiliKaydi | undefined> {
  return (state as Record<string, unknown>)['suProf'] as Record<string, TezgahProfiliKaydi | undefined>;
}
export function SC(): AtolyeKosullari { return camKaydi().sc; }
