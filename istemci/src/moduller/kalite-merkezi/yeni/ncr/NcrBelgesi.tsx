import { Belge, BelgeBasi, Imza } from '../Belge.tsx';
import { trd } from '../bicim.ts';
import type { Ncr } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';

// KF-01 uygunsuzluk raporu (uygulamadaki ncrDocHTML), bugünkü sayfa düzeninde (203 a).
export function NcrBelgesi({ veri, n }: { veri: Pick<KmVerisi, 'ayarlar' | 'tpl' | 'sup'>; n: Partial<Ncr> }) {
  const tedarikci = n.tedarikci ? veri.sup.find((s) => s._id === n.tedarikci) : undefined;
  return (
    <Belge>
      <BelgeBasi veri={veri} kod="KF-01" ad="Uygunsuzluk raporu (NCR)" />
      <table>
        <tbody>
          <tr><th>NCR no</th><td>{n.no ?? ''}</td><th>Tespit tarihi</th><td>{trd(n.tarih)}</td></tr>
          <tr><th>Tespit yeri</th><td>{n.kaynak ?? ''}</td><th>Ciddiyet</th><td><b>{n.ciddiyet ?? ''}</b></td></tr>
          <tr><th>Parça no / rev</th><td>{n.parcaNo ?? ''}{n.rev ? ` rev ${n.rev}` : ''}</td><th>Parça adı</th><td>{n.parcaAdi ?? ''}</td></tr>
          <tr><th>Lot / seri</th><td>{n.lot ?? ''}</td><th>Etkilenen miktar</th><td>{n.miktar ?? ''}</td></tr>
          <tr><th>Proje</th><td>{n.proje ?? ''}</td><th>Tedarikçi</th><td>{tedarikci ? tedarikci.ad : '—'}</td></tr>
          <tr><th>Hata tipi</th><td colSpan={3}>{n.hataTipi ?? ''}</td></tr>
          <tr><th>Uygunsuzluk tanımı</th><td colSpan={3} className="tc-km3-uzun">{n.tanim ?? ''}</td></tr>
          <tr><th>MRB kararı</th><td>{n.mrb ?? ''}</td><th>Gerekçe / onay ref.</th><td>{n.mrbGerekce ?? ''}</td></tr>
          <tr><th>Sorumlu</th><td>{n.sorumlu ?? ''}</td><th>Durum</th><td>{n.durum ?? ''}</td></tr>
        </tbody>
      </table>
      <Imza hazirlayan={n.sorumlu ?? ''} hazirlamaTarihi={n.tarih} />
    </Belge>
  );
}
