import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { emirKuyrugu } from '../ortak/emir-no.ts';
import type { GuncellemeEtkisi } from './degisiklikler.ts';
import { sureYaz, type KokpitModeli } from './kurallar.ts';

// "Planı güncelle"nin sonucu (3532 b): tahtanın üstünde tek satır. Sayılar yalnız bu güncellemenin etkisidir (Risk R2). Plan ortak çalışmaya
// yazılmıştır (R1): Kapat yalnız gösterimi kapatır; Geri al güncellemeyi geri alır, alınamazsa Kokpit söyler (R3). Yazamayan kişide geriAl null.
export function GuncellemeSonucu({ e, m, zaman, geriAl, kapat }: { e: GuncellemeEtkisi; m: Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>; zaman: (t: number) => string; geriAl: (() => void) | null; kapat: () => void }) {
  const en = e.enCok ? m.isler[e.enCok.isId] : undefined;
  const no = (job: string): string => m.emirler.find((x) => x.id === job)?.no ?? emirKuyrugu(job);
  const enYazi = e.enCok && en ? ` · en çok ${no(en.job)} ${en.ad} ${Math.abs(e.enCok.fark) > 0.01 ? `${e.enCok.fark > 0 ? '+' : '−'}${sureYaz(e.enCok.fark)}` : `yeni tezgâh ${m.tezgahlar.find((t) => t.id === en.m)?.kod ?? en.m}`}` : '';
  const ilkGec = e.geciken[0] === undefined ? undefined : m.emirler.find((x) => x.no === e.geciken[0]);
  return (
    <div className="tc-pyq-ipucu tc-pyq-tasima-onayi tc-pyq-guncelleme" role="group" aria-label="Güncellemenin sonucu">
      <span role="status">
        <Simge ad="eye" boyut="k" />
        <b>{e.kayan.length === 0 ? 'Hiçbir iş kaymadı' : `${String(e.kayan.length)} iş kaydı`}</b>{enYazi}
        {e.geciken.length > 0 && <span className="tc-pyq-guncelleme-gec"> · {e.geciken.length} emir terminden geç kalıyor ({e.geciken.slice(0, 2).join(', ')}{e.geciken.length === 1 && ilkGec?.termin != null ? `, termin ${zaman(ilkGec.termin).slice(-5)}` : ''}{e.geciken.length > 2 ? ` +${String(e.geciken.length - 2)}` : ''})</span>}
        {' · ortak çalışma planına yazıldı, canlıya değil'}
      </span>
      {geriAl && <Dugme simge="back" onClick={geriAl}>Geri al</Dugme>}
      <Dugme tur="birincil" simge="check" onClick={kapat}>Kapat</Dugme>
    </div>
  );
}
