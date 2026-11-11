import type { OzelOlcuBilgisi, Sablon } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, Girdi, IsaretKutusu, Rozet } from '../../ortak/arayuz/index.ts';
import { olcuYazisi } from './ozel-olcu.ts';

// Standart dışı rulo: şablonun tasarımı girilen ene ve boya orantılı ölçeklenir, ortalanır. Okunmayacak ölçüyü sunucu reddeder;
// sınırdaki ölçüde uyarı görünür ve baskı açık kalır.
export function OzelOlcuAyari({ sablon, acik, en, boy, enHatasi, boyHatasi, bilgi, degistir }: {
  sablon: Sablon; acik: boolean; en: string; boy: string; enHatasi?: string; boyHatasi?: string; bilgi: OzelOlcuBilgisi | null;
  degistir: (d: { acik?: boolean; en?: string; boy?: string }) => void;
}) {
  const tasarim = olcuYazisi(sablon);
  return (
    <section className="tc-etk-ozel-olcu" aria-label="Etiket ölçüsü">
      <IsaretKutusu etiket="Standart dışı etikete bas" checked={acik} onChange={(e) => degistir({ acik: e.target.checked })} />
      {acik && (
        <>
          <div className="tc-etk-secimler">
            <Girdi etiket="Etiket eni (mm)" inputMode="decimal" value={en} onChange={(e) => degistir({ en: e.target.value })} hata={enHatasi} />
            <Girdi etiket="Etiket boyu (mm)" inputMode="decimal" value={boy} onChange={(e) => degistir({ boy: e.target.value })} hata={boyHatasi} />
          </div>
          {bilgi ? (
            <p className="tc-etk-not" role="status">
              <Rozet ton="bilgi">%{Math.round(bilgi.olcek * 100)}</Rozet>{' '}
              {tasarim} tasarım {olcuYazisi({ genislik: Number(en.replace(',', '.')), yukseklik: Number(boy.replace(',', '.')) })} etikete orantılı
              {bilgi.olcek < 1 ? ' küçültülür ve ortalanır' : bilgi.olcek > 1 ? ' büyütülür ve ortalanır' : ' aynı boyda ortalanır'}. Bu tasarımın en küçük ölçüsü {olcuYazisi(bilgi.enKucuk)}.
            </p>
          ) : (
            <p className="tc-etk-not">İçerik {tasarim} tasarımdan orantılı ölçeklenir; yerleşim aynı kalır. Hazır ölçülerden etiketinize en yakın oranlı olanı seçin.</p>
          )}
          {bilgi?.uyarilar.map((u) => <p key={u} className="tc-etk-not"><Rozet ton="uyari">Okunurluk</Rozet> {u}</p>)}
          <div className="tc-etk-dugmeler">
            <Dugme simge="rotate" onClick={() => degistir({ acik: false })}>Standart ölçüye dön ({tasarim})</Dugme>
          </div>
        </>
      )}
    </section>
  );
}
