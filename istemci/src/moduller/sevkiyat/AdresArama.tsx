// Çevrimdışı adres arama: semt, cadde, işyeri, kayıtlı nokta, koordinat ya da harita bağlantısı.
import { useEffect, useId, useState } from 'react';
import type { AramaSonucu } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Girdi } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useAdresArama } from './veri.ts';

// baslangic: aramaya önceden yazılan metin (firmanın adresi); değişince bileşen anahtarla yeniden kurulur.
export function AdresArama({ etiket, sec, baslangic = '' }: { etiket: string; sec: (sonuc: AramaSonucu) => void; baslangic?: string }) {
  const [metin, setMetin] = useState(baslangic), [sorgu, setSorgu] = useState(baslangic);
  useEffect(() => { const h = setTimeout(() => setSorgu(metin), 250); return () => clearTimeout(h); }, [metin]);
  const arama = useAdresArama(sorgu);
  const liste = useId();
  const sonuclar = arama.data?.sonuclar ?? [];
  return (
    <div className="tc-sevkiyat-arama">
      <Girdi etiket={etiket} type="search" value={metin} onChange={(e) => setMetin(e.target.value)} aria-controls={liste} placeholder="Semt, cadde, firma, koordinat ya da harita bağlantısı"
        onKeyDown={(e) => { if (e.key === 'Enter' && sonuclar[0]) { e.preventDefault(); sec(sonuclar[0]); setMetin(''); } }} />
      {arama.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(arama.error, 'Arama yapılamadı')}</p>}
      {arama.data?.kisaBaglanti && <p role="status" className="tc-sevkiyat-not">Kısa harita bağlantısı internetsiz çözülemez. Bağlantıyı tarayıcıda açıp adres çubuğundaki uzun adresi ya da koordinatı yapıştırın.</p>}
      {arama.data && !arama.data.dizinVar && <p className="tc-sevkiyat-ince">Adres dizini yüklü değil; kayıtlı noktalar ve koordinat aranır.</p>}
      {sorgu && arama.data && !sonuclar.length && !arama.data.kisaBaglanti && <p role="status" className="tc-sevkiyat-not">Sonuç yok.</p>}
      {sonuclar.length > 0 && (
        <ul id={liste} className="tc-sevkiyat-arama-sonuclari" aria-label="Arama sonuçları">
          {sonuclar.map((s, i) => (
            <li key={`${s.ad}-${i}`}>
              <button type="button" onClick={() => { sec(s); setMetin(''); }}>
                <b>{s.ad}</b><em>{s.kategori}{s.baglam ? ` · ${s.baglam}` : ''}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
