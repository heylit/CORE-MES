import { useNavigate } from 'react-router-dom';
import { yerAdi, type Gecmis } from '../rota/gezinme-gecmisi.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Simge } from './Simge.tsx';

// Geri ve İleri tarayıcının geçmişinde yürür: tarayıcının tuşları, telefonun geri hareketi ve Alt+Sol/Sağ aynı sıradadır.
// Uygulamanın içinde atılmış adım yoksa pasif kalır; ipucu hedefin adını söyler. Son yerler aramanın boş halindedir (516 a).
// Kısayolu tarayıcı yürütür; burada ayrıca tuş dinlenirse bir basış iki adım atar. İpucu yalnız tuşu gösterir.
export function geziKisayollari(platform: string): { geri: string; ileri: string } {
  return /mac|iphone|ipad/i.test(platform) ? { geri: '⌘[', ileri: '⌘]' } : { geri: 'Alt+←', ileri: 'Alt+→' };
}

export function GeziDugmeleri({ menuler, gecmis }: { menuler?: readonly IkinciMenu[]; gecmis: Gecmis }) {
  const gezin = useNavigate();
  const geri = gecmis.adimlar[gecmis.konum - 1];
  const ileri = gecmis.adimlar[gecmis.konum + 1];
  const geriEtiket = geri === undefined ? 'Geri' : `Geri: ${yerAdi(geri.yol, menuler)}`;
  const ileriEtiket = ileri === undefined ? 'İleri' : `İleri: ${yerAdi(ileri.yol, menuler)}`;
  const kisayol = geziKisayollari(navigator.platform);

  return (
    <div className="tc-kabuk-gezi">
      <button type="button" className="tc-kabuk-tema" onClick={() => { void gezin(-1); }} disabled={geri === undefined} aria-label={geriEtiket} title={`${geriEtiket} (${kisayol.geri})`} aria-keyshortcuts="Alt+ArrowLeft">
        <Simge ad="chev-left" />
      </button>
      <button type="button" className="tc-kabuk-tema tc-kabuk-ileri" onClick={() => { void gezin(1); }} disabled={ileri === undefined} aria-label={ileriEtiket} title={`${ileriEtiket} (${kisayol.ileri})`} aria-keyshortcuts="Alt+ArrowRight">
        <Simge ad="chev-right" />
      </button>
    </div>
  );
}
