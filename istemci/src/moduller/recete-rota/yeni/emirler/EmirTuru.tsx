import { useState } from 'react';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { Dugme, Secim } from '../../../../ortak/arayuz/index.ts';
import type { useEmirKomutu } from './komut.ts';
import { turAdi } from './gorunum.ts';
import type { Emir } from './kurallar.ts';

const TURLER = Object.entries(EMIR_TURU_ADLARI).map(([deger, baslik]) => ({ deger, baslik }));

// Bölündükten sonra alt emrin (parti ya da kol) türü (3099): yalnız etiket ve kapanış maddesi değişir; adım, adet ve plan değişmez.
// Geçerliliğe (açık emir, projesiz emirde proje isteyen tür) sahibinin ucu karar verir.
export function EmirTuruPaneli({ emir: o, komut, kapat }: { emir: Emir; komut: ReturnType<typeof useEmirKomutu>; kapat: () => void }) {
  const [tur, setTur] = useState(o.tur);
  const gonder = () => {
    void komut.calistir('emir-turu', { id: o.id, emirTuru: tur, surum: o.surum }, `${o.no} emrinin türü ${turAdi(tur)} oldu.`)
      .then((c) => { if (c.tamam) kapat(); });
  };
  return (
    <div className="tc-rr3-ek tc-rr3-turpanel" role="group" aria-label="Emir türünü değiştir">
      <h4>Emir türünü değiştir</h4>
      <p className="tc-rr3-ipucu">Yalnız bu {o.kol ? 'kolun' : 'partinin'} türü değişir; ana emir ve öteki partiler olduğu gibi kalır.</p>
      <div className="tc-rr3-satir">
        <Secim etiket="Emir türü" value={tur} secenekler={TURLER} onChange={(e) => { setTur(e.target.value); }} />
        <Dugme tur="birincil" simge="check" yukleniyor={komut.mesgul} disabled={tur === o.tur} onClick={gonder}>Kaydet</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </div>
  );
}
