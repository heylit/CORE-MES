import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { GELEN_ADI, gelenTonu, type Gelen } from './gelenler.ts';

// Gelenler (3282, 3297): yeni ve değişen işlerin tam listesi. Sıra kartlarının başlığındaki "Tümü" düğmesiyle tahtanın üstüne açılır; kartı
// olan satır (emir Kokpit'te) kartı seçer. Karta bağlanamayan olaylar (tezgâh arızası, planda olmayan emir) kaybolmasın diye en üstte ayrı
// bölümdedir.
export interface GelenlerOzellikleri {
  l: readonly Gelen[];
  sec: (emirId: string) => void;
  // Yazamayan kişide Yerleştir yerine Göster çıkar. Satır düğmesi ikincildir: sayfanın tek birincili taslak çubuğundadır.
  yazabilir: boolean;
  secEmir: string | null;
  kapat: () => void;
}

export function Gelenler({ l, sec, yazabilir, secEmir, kapat }: GelenlerOzellikleri) {
  const kartsiz = l.filter((g) => g.emirId === null), kartli = l.filter((g) => g.emirId !== null);
  const satir = (g: Gelen) => (
    <li key={g.anahtar} aria-current={g.emirId !== null && g.emirId === secEmir}>
      <div className="tc-pyq-gelen-bas"><b className="tc-pyq-mono">{g.baslik}</b><Rozet ton={gelenTonu(g.tur)} gorunum="cizgi">{GELEN_ADI[g.tur]}</Rozet></div>
      <p>{g.metin}</p>
      {g.emirId !== null && (
        <Dugme className="tc-pyq-gelen-dugme" tur="ikincil" simge={g.tur === 'yeni' && yazabilir ? 'check' : 'eye'} onClick={() => { if (g.emirId !== null) sec(g.emirId); }}>
          {g.tur === 'yeni' && yazabilir ? 'Yerleştir' : 'Göster'}
        </Dugme>
      )}
    </li>
  );
  return (
    <aside className="tc-pyq-ayrinti tc-pyq-gelenler" aria-label="Gelenler">
      <header>
        <div><b>Gelenler</b><small>Yeni emirler ve son canlıya almadan sonraki saha olayları.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Gelenleri kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {l.length === 0 && <p className="tc-pyq-not">Yeni ya da değişen iş yok. Plan son canlıya almadan beri güncel.</p>}
      {kartsiz.length > 0 && (
        <section aria-label="Emre bağlı olmayan olaylar">
          <h3>Emre bağlı olmayan ({kartsiz.length})</h3>
          <ul>{kartsiz.map(satir)}</ul>
        </section>
      )}
      {kartli.length > 0 && (
        <section aria-label="Emirler">
          <h3>Emirler ({kartli.length})</h3>
          <ul>{kartli.map(satir)}</ul>
        </section>
      )}
    </aside>
  );
}
