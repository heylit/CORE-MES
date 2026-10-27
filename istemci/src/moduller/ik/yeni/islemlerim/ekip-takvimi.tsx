import { useState } from 'react';
import { Kart, Rozet, SayfaBasligi } from '../../../../ortak/arayuz/index.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ekipKimlikleri } from '../rol.ts';
import {
  ayinGunleri, calisiyorMu, enFazlaAyniGun, IZIN_BEKLIYOR, metindenGun, RAPOR_IZNI, takvimIzni,
} from './kurallar.ts';
import {
  AyYilSecici, BagliDegil, bugun, isGunuMu,
} from './parcalar.tsx';

const GUN_KISA = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];

// İzin takvimi (app.js viewTeamCal): ekibin onaylı ve bekleyen izinleri; aynı güne yığılan izin onaydan önce görünür.
export function EkipTakvimi(o: IkEkranOzellikleri) {
  const [ay, ayYaz] = useState(() => bugun().slice(0, 7));
  const me = o.ben;
  if (!me) return <BagliDegil baslik="İzin takvimi" simge="clock" />;
  const t = bugun();
  const personeller = o.depo.tur('emp');
  const aktif = personeller.filter((p) => calisiyorMu(p, t));
  const ids = ekipKimlikleri(aktif, o.depo.tur('dept'), me.id);
  const ekip = [me, ...aktif.filter((p) => ids.has(p.id)).sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr'))];
  const gunler = ayinGunleri(ay);
  const izinler = o.depo.tur('leave');
  const enFazla = enFazlaAyniGun(izinler, ekip.map((p) => p.id), gunler);
  const kapali = (g: string) => {
    const d = metindenGun(g);
    return !!d && !!o.motor && !isGunuMu(o.motor, d);
  };
  return (
    <>
      <SayfaBasligi baslik="İzin takvimi" simge="clock" alt="Ekibinizin onaylı ve bekleyen izinleri. Aynı güne yığılan izinleri onay vermeden önce görün." />
      <div className="tc-ikm-arac">
        <AyYilSecici ay={ay} degistir={ayYaz} />
        {enFazla > 1 && <Rozet ton="uyari">Bu ay aynı gün en fazla {enFazla} kişi izinde</Rozet>}
      </div>
      <Kart>
        <div className="tc-ikm-cizelge-kap">
          <table className="tc-ikm-cizelge">
            <thead>
              <tr>
                <th scope="col" className="tc-ikm-cizelge-ad">Çalışan</th>
                {gunler.map((g) => {
                  const d = metindenGun(g);
                  return (
                    <th key={g} scope="col" title={tarih(g)} data-kapali={kapali(g) ? '' : undefined} data-bugun={g === t ? '' : undefined}>
                      {Number(g.slice(8))}<br /><small>{d ? GUN_KISA[d.getDay()] : ''}</small>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ekip.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="tc-ikm-cizelge-ad">
                    {adSoyad(p)}{p.id === me.id && <small className="tc-ikm-soluk"> (siz)</small>}
                  </th>
                  {gunler.map((g) => {
                    const l = takvimIzni(izinler, p.id, g);
                    const tur = l ? (l.tur === RAPOR_IZNI ? 'rapor' : l.durum === IZIN_BEKLIYOR ? 'bekliyor' : 'onayli') : undefined;
                    return (
                      <td
                        key={g} data-izin={tur} data-kapali={kapali(g) ? '' : undefined}
                        title={l ? `${l.tur}, ${l.durum}` : undefined} aria-label={l ? `${tarih(g)}: ${l.tur}, ${l.durum}` : undefined}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="tc-ikm-lejant">
          <li><i data-izin="onayli" />Onaylı izin</li>
          <li><i data-izin="bekliyor" />Onay bekliyor</li>
          <li><i data-izin="rapor" />Rapor</li>
        </ul>
      </Kart>
    </>
  );
}
