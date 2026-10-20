import type { Kontrol } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, Simge } from '../../ortak/arayuz/index.ts';
import { KONTROL_TURU, kalanMetni, siklikMetni, tarihMetni } from './gorunum.ts';

// Periyodik kalem satırı: tür simgesi, ad, sıklık ve firma, tarih; eylem düğmesi yalnız yazabilene.
export function KontrolKarti({ kontrol, sec, eylem }: { kontrol: Kontrol; sec: () => void; eylem?: () => void }) {
  return (
    <article className="tc-ii-kontrol" data-grup={kontrol.grup}>
      <button type="button" className="tc-ii-talep" onClick={sec}>
        <span className="tc-ii-konu" aria-hidden="true"><Simge ad={KONTROL_TURU[kontrol.tur].simge} /></span>
        <span className="tc-ii-govde">
          <strong>{kontrol.ad}</strong>
          <span className="tc-ii-soluk">{KONTROL_TURU[kontrol.tur].etiket} · {siklikMetni(kontrol)}{kontrol.firmaAd !== null && <> · {kontrol.firmaAd}</>}</span>
          <span className="tc-ii-tarih">
            <span className="mono">{tarihMetni(kontrol.sonrakiTarih)}</span> · <span className="tc-ii-kalan">{kalanMetni(kontrol.kalanGun)}</span>
          </span>
        </span>
      </button>
      {eylem && <Dugme simge="check" onClick={eylem}>{KONTROL_TURU[kontrol.tur].eylem}</Dugme>}
    </article>
  );
}
