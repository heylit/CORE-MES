import { useNavigate } from 'react-router-dom';
import { sonYerler, useGezinmeGecmisi, yerAdi } from '../rota/gezinme-gecmisi.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Menu } from './Menu.tsx';
import { Simge } from './Simge.tsx';

// Geri ve İleri tarayıcının geçmişinde yürür: tarayıcının tuşları, telefonun geri hareketi ve Alt+Sol/Sağ aynı sıradadır.
// Uygulamanın içinde atılmış adım yoksa pasif kalır; ipucu hedefin adını söyler.
export function GeziDugmeleri({ menuler }: { menuler?: readonly IkinciMenu[] }) {
  const gezin = useNavigate();
  const g = useGezinmeGecmisi();
  const geri = g.adimlar[g.konum - 1];
  const ileri = g.adimlar[g.konum + 1];
  const geriEtiket = geri === undefined ? 'Geri' : `Geri: ${yerAdi(geri.yol, menuler)}`;
  const ileriEtiket = ileri === undefined ? 'İleri' : `İleri: ${yerAdi(ileri.yol, menuler)}`;
  const yerler = sonYerler(g);

  return (
    <div className="tc-kabuk-gezi">
      <button type="button" className="tc-kabuk-tema" onClick={() => { void gezin(-1); }} disabled={geri === undefined} aria-label={geriEtiket} title={geriEtiket}>
        <Simge ad="chev-left" />
      </button>
      <button type="button" className="tc-kabuk-tema tc-kabuk-ileri" onClick={() => { void gezin(1); }} disabled={ileri === undefined} aria-label={ileriEtiket} title={ileriEtiket}>
        <Simge ad="chev-right" />
      </button>
      <span className="tc-kabuk-yerler">
        <Menu
          etiket="Son yerler"
          simge="clock"
          ogeler={yerler.map((y) => ({ anahtar: String(y.adim), baslik: yerAdi(y.yol, menuler), sec: () => { void gezin(y.adim); } }))}
        />
      </span>
    </div>
  );
}
