import type { ReactNode } from 'react';
import type { Teslim } from '#paylasilan/sozlesme/stok.ts';
import { Rozet, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { miktarMetni, TESLIM_DURUMU, zamanMetni } from './gorunum.ts';
import { KaliteRozeti } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';

export const ucMetni = (u: Teslim['kaynak']): string => (u.ad ? `${u.ad} (${u.kod})` : u.kod);

// İki kural, iki etiket (752 b): karşı taraf alınca taşınan "Onay bekliyor"; kod ya da kart okutularak hemen geçen, süresi
// bitmemiş ve itiraz edilmemiş teslim "Hemen geçti, itiraz edilebilir". Bütün teslim listeleri bu rozeti kullanır.
export function teslimRozeti(t: Teslim, simdi = Date.now()): { etiket: string; ton: RozetTonu } {
  if (t.durum === 'yolda') return { etiket: 'Onay bekliyor', ton: 'uyari' };
  if (t.durum === 'teslim' && t.okutarak && !t.itiraz && t.itirazSonu && Date.parse(t.itirazSonu) > simdi) return { etiket: 'Hemen geçti, itiraz edilebilir', ton: 'bilgi' };
  return TESLIM_DURUMU[t.durum];
}

export function TeslimSatiri({ t, children }: { t: Teslim; children?: ReactNode }) {
  const statuAdi = useStatuAdi();
  const d = teslimRozeti(t);
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{t.malzemeAd ?? `Malzeme #${t.malzemeId}`} · {miktarMetni(t.miktar)}</strong>
        <span>{ucMetni(t.kaynak)} → {ucMetni(t.hedef)} · {statuAdi(t.statuId)} <KaliteRozeti durum={t.kaliteDurumu} /></span>
        <span className="tc-stok-mono">{t.no} · {t.gonderenAd ?? '—'} · {zamanMetni(t.gonderim)}</span>
        {t.aliciAd && <span>Alıcı: {t.aliciAd}</span>}
        {t.aciklama && <span>{t.aciklama}</span>}
        {t.redNedeni && <span>Red: {t.redNedeni}</span>}
        {t.durum === 'yolda' && t.sureSonu && <span>Alınmazsa {zamanMetni(t.sureSonu)} iptal olur; stok kaynakta kalır</span>}
        {children}
      </div>
      <Rozet ton={d.ton}>{d.etiket}</Rozet>
    </li>
  );
}
