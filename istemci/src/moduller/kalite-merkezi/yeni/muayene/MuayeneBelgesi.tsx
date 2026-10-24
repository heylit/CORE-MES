import { Belge, BelgeBasi, Imza } from '../Belge.tsx';
import { trd, YOK } from '../bicim.ts';
import { FAI_CHK, GIRIS_CHK } from '../sabitler.ts';
import type { Karakteristik } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';
import type { MuayeneDegeri } from './hesap.ts';

export const belgeKodu = (tur?: string) => (tur === 'Giriş' ? 'KF-03' : tur === 'FAI' ? 'KF-04' : 'KF-05');

export const olculen = (c: Karakteristik) => ((c.olcumler && c.olcumler.filter(Boolean).length > 1) ? c.olcumler.join(' / ') : c.olcum ?? '');
export const toleransMetni = (c: Karakteristik) => (c.tip === 'Nitel' ? YOK : `−${c.alt || 0} / +${c.ust || 0}`);

// Muayene raporu (KF-03 giriş, KF-04 FAI, KF-05 proses/final); yazdırılan belge bugünkü düzende kalır (203 a).
export function MuayeneBelgesi({ veri, i }: { veri: KmVerisi; i: MuayeneDegeri }) {
  const sp = i.tedarikci ? veri.sup.find((s) => s._id === i.tedarikci) : undefined;
  const kod = belgeKodu(i.tur);
  const sablon = veri.tpl.find((t) => t.kod === kod);
  return (
    <Belge>
      <BelgeBasi veri={veri} kod={kod} ad={sablon?.ad || `${i.tur ?? ''} muayene raporu`} />
      <table>
        <tbody>
          <tr><th>Muayene no</th><td>{i.no}</td><th>Tür</th><td>{i.tur}</td></tr>
          <tr><th>Parça no</th><td>{i.parcaNo}</td><th>Revizyon</th><td>{i.rev}</td></tr>
          <tr><th>Parça adı</th><td>{i.parcaAdi}</td><th>Lot / seri</th><td>{i.lot}</td></tr>
          <tr><th>Tarih</th><td>{trd(i.tarih)}</td><th>Muayeneci</th><td>{i.muayeneci}</td></tr>
          {i.aqlPlan && <tr><th>Numune planı</th><td colSpan={3}>{i.aqlPlan}</td></tr>}
          <tr><th>Parti / numune</th><td>{`${i.miktar ?? YOK} / ${i.numune ?? YOK}`}</td><th>Tedarikçi</th><td>{sp ? sp.ad : 'İç üretim'}</td></tr>
          {i.tur === 'FAI' && <tr><th>FAI nedeni</th><td>{i.faiNeden}</td><th>Kapsam</th><td>{i.faiKapsam}</td></tr>}
        </tbody>
      </table>
      {i.tur === 'Giriş' && (
        <table><tbody>{GIRIS_CHK.map((c) => <tr key={c}><td>{c}</td><td>{(i.gchk ?? []).includes(c) ? 'Evet' : 'Hayır'}</td></tr>)}</tbody></table>
      )}
      {i.tur === 'FAI' && (
        <table><tbody>{FAI_CHK.map((c) => <tr key={c}><td>{c}</td><td>{(i.fchk ?? []).includes(c) ? 'Evet' : 'Hayır'}</td></tr>)}</tbody></table>
      )}
      <table>
        <thead><tr><th>#</th><th>Karakteristik</th><th>Nominal</th><th>Tolerans</th><th>Ölçülen</th><th>Cihaz</th><th>Sonuç</th></tr></thead>
        <tbody>
          {(i.chars ?? []).map((c, k) => {
            const d = c.cihaz ? veri.dev.find((x) => x._id === c.cihaz) : undefined;
            return (
              <tr key={`${k}-${c.ad ?? ''}`}>
                <td>{k + 1}</td><td>{c.ad}</td><td>{c.tip === 'Nitel' ? 'Nitel' : c.nominal}</td><td>{toleransMetni(c)}</td>
                <td>{olculen(c)}</td><td>{d ? d.kod : YOK}</td><td>{c.sonuc === 'OK' ? 'Uygun' : c.sonuc === 'NOK' ? 'Ret' : YOK}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p><b>Sonuç:</b> {i.sonuc}{i.not ? ` | Not: ${i.not}` : ''}</p>
      <Imza hazirlayan={i.muayeneci} hazirlamaTarihi={i.tarih} />
    </Belge>
  );
}
