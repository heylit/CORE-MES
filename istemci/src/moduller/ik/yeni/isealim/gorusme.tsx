import { Link } from 'react-router-dom';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { kisaTarih } from '../bicim.ts';
import { gorunumAdresi } from '../gorunumler.ts';
import type { IkDeposu } from '../veri.ts';
import type { Aday, Gorusme } from '../tipler.ts';
import type { IseAlimIslemleri } from './islemler.tsx';
import { ONERI_TONU, adayAdi, degerlendirilebilirMi, gorusmeTamamMi, gorusmeTonu, puanOrtalamasi } from './kurallar.ts';
import { Puan, TonluRozet, bugun, type Hazirlik } from './ortak.tsx';

// Görüşme satırı (çerçevedeki intvItem): zaman, tür, durum, öneri, puan ve görüşmeci yorumları; değerlendir ve düzenle.
export function GorusmeOgesi({ g, adayla, depo, h, is }: { g: Gorusme; adayla: boolean; depo: IkDeposu; h: Hazirlik; is: IseAlimIslemleri }) {
  const c = depo.al(g.candId) as Aday | null;
  const tamam = gorusmeTamamMi(g);
  const puan = puanOrtalamasi(g);
  const kisiler = (g.gorusmeciler ?? []).map((id) => h.m.adi(id)).filter((n) => n !== '—');
  const ayrinti = [g.sekil, g.yer, kisiler.length ? `Görüşmeci: ${kisiler.join(', ')}` : ''].filter(Boolean).join('. ');
  return (
    <li className="tc-ika-gorusme">
      <div className="tc-ika-gorusme-zaman">
        <b>{kisaTarih(g.tarih)}</b>
        <span>{[g.saat, g.sure ? `${g.sure.toLocaleString('tr-TR')} dk` : ''].filter(Boolean).join(', ')}</span>
      </div>
      <div className="tc-ika-gorusme-govde">
        <div className="tc-ika-gorusme-ust">
          <b>{g.tur ?? 'Görüşme'}</b>
          {adayla && c && <><span className="tc-ika-soluk">ile</span> <Link to={gorunumAdresi('aday', c.id)}>{adayAdi(c)}</Link></>}
          <TonluRozet ton={gorusmeTonu(g.durum)}>{g.durum ?? '—'}</TonluRozet>
          {tamam && g.oneri && <TonluRozet ton={ONERI_TONU[g.oneri] ?? null}>{g.oneri}</TonluRozet>}
        </div>
        {ayrinti && <small className="tc-ika-soluk">{ayrinti}</small>}
        {tamam && puan !== null && <span className="tc-ika-gorusme-puan"><Puan deger={puan} /> / 5</span>}
        {tamam && (g.guclu || g.zayif) && (
          <div className="tc-ika-gorusme-not">
            {g.guclu && <p><span className="tc-ika-soluk">Güçlü yönler:</span> {g.guclu}</p>}
            {g.zayif && <p><span className="tc-ika-soluk">Gelişime açık yönler:</span> {g.zayif}</p>}
          </div>
        )}
      </div>
      {is.yazabilir && (
        <div className="tc-ika-gorusme-eylem">
          {degerlendirilebilirMi(g, bugun()) && <Dugme tur="birincil" onClick={() => { is.gorusmeDegerlendir(g); }}>Değerlendir</Dugme>}
          <Dugme simge="edit" onClick={() => { is.gorusmeDuzenle(g); }}>Düzenle</Dugme>
        </div>
      )}
    </li>
  );
}
