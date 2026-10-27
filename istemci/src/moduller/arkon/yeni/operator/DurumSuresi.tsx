import { sure } from '../cekirdek/bicim.ts';
import { IS_DURUMLARI, type IsDurumu } from '../cekirdek/sabitler.ts';
import { useSimdi } from '../veri/baglam.ts';

/* 797: üst şeridin durum lambaları ve bu durumda geçen süre. Süre işin sunucudaki son durum kaydından gelir (sunucu saati); kayıt yoksa
   ya da bugünkü durumu tutmuyorsa süre bilinmez ve "—" yazılır, sıfırdan sayılmaz. */

const durumAdi = (s: string): string => IS_DURUMLARI[s as IsDurumu]?.etiket ?? s;
const durumRengi = (s: string) => IS_DURUMLARI[s as IsDurumu]?.durum ?? 'sirada';

export const BILINMEYEN_SURE = 'Süre bilinmiyor: bu durumun başlangıç kaydı yok';

export function GecenSure({ since }: { since: number | null }) {
  const simdi = useSimdi(1000);
  if (since === null) return <span className="tc-ay1-mono" title={BILINMEYEN_SURE}>—</span>;
  return <span className="tc-ay1-mono" title="Bu durumda geçen süre">{sure((simdi - since) / 1000)}</span>;
}

export function DurumSuresi({ durum, since }: { durum: string; since: number | null }) {
  const lamba = durum === 'stopped' ? 'r' : durum === 'paused' || durum === 'setup' ? 'y' : durum === 'running' ? 'g' : '';
  return (
    <div className="tc-ay1-lambali" data-durum={durumRengi(durum)}>
      <span className="tc-ay1-lambalar" aria-hidden="true">
        <i data-lamba="r" data-yanik={lamba === 'r' || undefined} /><i data-lamba="y" data-yanik={lamba === 'y' || undefined} /><i data-lamba="g" data-yanik={lamba === 'g' || undefined} />
      </span>
      <span className="tc-ay1-durum-adi" role="status"><i aria-hidden="true" />{durumAdi(durum)}<GecenSure since={since} /></span>
    </div>
  );
}
