import { Belge, BelgeBasi, Imza } from '../Belge.tsx';
import { trd } from '../bicim.ts';
import { D8 } from '../sabitler.ts';
import type { KmVerisi } from '../veri.ts';
import { adimSayisi, type DofAlanlari } from './dof-kurallari.ts';

// KF-02 8D raporu (uygulamadaki capaDocHTML), bugünkü sayfa düzeninde (203 a).
export function DofBelgesi({ veri, c }: { veri: Pick<KmVerisi, 'ayarlar' | 'tpl' | 'ncr'>; c: DofAlanlari }) {
  const n = c.ncrRef ? veri.ncr.find((x) => x._id === c.ncrRef) : undefined;
  const adim = adimSayisi(c);
  return (
    <Belge>
      <BelgeBasi veri={veri} kod="KF-02" ad="8D düzeltici faaliyet raporu" />
      <table>
        <tbody>
          <tr><th>DÖF no</th><td>{c.no ?? ''}</td><th>Problem</th><td>{c.baslik ?? ''}</td></tr>
          <tr><th>İlgili NCR</th><td>{n ? `${n.no ?? ''} / ${n.parcaNo ?? ''}` : '—'}</td><th>Sorumlu</th><td>{c.sorumlu ?? ''}</td></tr>
          <tr><th>Açılış</th><td>{trd(c.acilis)}</td><th>Termin</th><td>{trd(c.termin)}</td></tr>
          <tr><th>Tür</th><td>{c.tur ?? ''}</td><th>Kök neden yöntemi</th><td>{c.yontem ?? ''}</td></tr>
          {D8.map((d, i) => <tr key={d}><th>D{i + 1}</th><td colSpan={2}>{d}</td><td>{adim > i ? 'Tamamlandı' : 'Açık'}</td></tr>)}
          <tr><th>Problem tanımı</th><td colSpan={3} className="tc-km3-uzun">{n?.tanim ?? ''}</td></tr>
          <tr><th>Kök neden</th><td colSpan={3} className="tc-km3-uzun">{c.kokNeden ?? ''}</td></tr>
          <tr><th>Kalıcı aksiyonlar</th><td colSpan={3} className="tc-km3-uzun">{c.aksiyon ?? ''}</td></tr>
          <tr><th>Etkinlik</th><td>{c.etkinlik ?? ''}</td><th>Kanıt</th><td>{c.etkinlikKanit ?? ''}</td></tr>
          <tr><th>Durum</th><td>{c.durum ?? ''}</td><th>Kapanış</th><td>{trd(c.kapanis)}</td></tr>
        </tbody>
      </table>
      <Imza hazirlayan={c.sorumlu ?? ''} hazirlamaTarihi={c.acilis} />
    </Belge>
  );
}
