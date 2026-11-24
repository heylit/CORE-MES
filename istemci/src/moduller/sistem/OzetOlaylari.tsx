import { Rozet } from '../../ortak/arayuz/index.ts';
import { EKSEN_YUZDELERI, OLAY_BILGISI, eksenEtiketi, gunluSaat, olayKonumu, ozetKutulari, sonOlaylar } from './izleme-yorumu.ts';
import { useSuAn, useYuk } from './izleme-sorgusu.ts';
import { useKapanmalar } from './kapanma-sorgusu.ts';
import { KutuSirasi } from './KutuSirasi.tsx';

// Özet'in üstü: üç kutu ve son 24 saatin olay çizelgesi. Kaynaklardan biri okunamazsa kutu "bilinmiyor" der, çizelge elindekini gösterir.
export function OzetOlaylari({ simdi = Date.now() }: { simdi?: number }) {
  const kapanmalar = useKapanmalar();
  const suAn = useSuAn(false);
  const yuk = useYuk('24s');
  const kutular = ozetKutulari(kapanmalar.data?.kapanmalar, suAn.data, simdi);
  const olaylar = sonOlaylar(kapanmalar.data?.kapanmalar, yuk.data?.takilmalar, simdi);
  return (
    <section aria-labelledby="tc-izleme-olaylar" className="tc-izleme-bolumler">
      <KutuSirasi etiket="Sistem durumu" kutular={kutular} />
      <h3 id="tc-izleme-olaylar" className="tc-sistem-baslik">Son 24 saat</h3>
      <figure className="tc-izleme-cizelge">
        <svg viewBox="0 0 400 16" aria-hidden="true" focusable="false">
          <line className="tc-sistem-izgara" x1="4" x2="396" y1="8" y2="8" />
          {EKSEN_YUZDELERI.map((y) => <line key={y} className="tc-sistem-izgara" x1={4 + y * 3.92} x2={4 + y * 3.92} y1="3" y2="13" />)}
          {olaylar.map((o) => <circle key={`${o.tur}-${o.an}`} className="tc-izleme-olay" data-tur={o.tur} cx={4 + olayKonumu(o.an, simdi) * 3.92} cy="8" r="4" />)}
        </svg>
        <div className="tc-izleme-eksen" aria-hidden="true">
          {EKSEN_YUZDELERI.map((y) => <span key={y}>{eksenEtiketi(y, simdi)}</span>)}
        </div>
        <figcaption className="tc-sistem-lejant">
          {(Object.keys(OLAY_BILGISI) as (keyof typeof OLAY_BILGISI)[]).map((t) => <span key={t}><i className="tc-izleme-nokta" data-tur={t} />{OLAY_BILGISI[t].ad}</span>)}
        </figcaption>
      </figure>
      {olaylar.length === 0 ? <p className="tc-sistem-soluk">Son 24 saatte kapanma, güncelleme ya da takılma olmadı.</p> : (
        <ul className="tc-izleme-olay-listesi" aria-label="Son 24 saatin olayları">
          {olaylar.map((o) => (
            <li key={`${o.tur}-${o.an}`}>
              <strong>{gunluSaat(o.an, simdi)}</strong>
              <Rozet ton={OLAY_BILGISI[o.tur].ton}>{o.ad}</Rozet>
              <span className="tc-sistem-soluk">{o.ayrinti}</span>
            </li>
          ))}
        </ul>
      )}
      {yuk.isError && <p className="tc-sistem-soluk">Takılma kayıtları okunamadı.</p>}
    </section>
  );
}
