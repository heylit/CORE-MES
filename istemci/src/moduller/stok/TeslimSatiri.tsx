import type { ReactNode } from 'react';
import type { Teslim } from '#paylasilan/sozlesme/stok.ts';
import { Rozet } from '../../ortak/arayuz/index.ts';
import { miktarMetni, TESLIM_DURUMU, zamanMetni } from './gorunum.ts';
import { KaliteRozeti } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';

export const ucMetni = (u: Teslim['kaynak']): string => (u.ad ? `${u.ad} (${u.kod})` : u.kod);

export function TeslimSatiri({ t, children }: { t: Teslim; children?: ReactNode }) {
  const statuAdi = useStatuAdi();
  const d = TESLIM_DURUMU[t.durum];
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{t.malzemeAd ?? `Malzeme #${t.malzemeId}`} · {miktarMetni(t.miktar)}</strong>
        <span>{ucMetni(t.kaynak)} → {ucMetni(t.hedef)} · {statuAdi(t.statuId)} <KaliteRozeti durum={t.kaliteDurumu} /></span>
        <span className="tc-stok-mono">{t.no} · {t.gonderenAd ?? '—'} · {zamanMetni(t.gonderim)}</span>
        {t.aliciAd && <span>Alıcı: {t.aliciAd}</span>}
        {t.aciklama && <span>{t.aciklama}</span>}
        {t.redNedeni && <span>Red: {t.redNedeni}</span>}
        {children}
      </div>
      <Rozet ton={d.ton}>{d.etiket}</Rozet>
    </li>
  );
}
