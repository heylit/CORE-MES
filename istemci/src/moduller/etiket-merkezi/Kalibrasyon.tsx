import { useState } from 'react';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { EN_AZ_OLCEK, EN_COK_OLCEK, KART_GENISLIK_MM, KART_YUKSEKLIK_MM, mmOzniteligi, olcekSinirla } from './gercek-boyut.ts';

// Ekrandaki kart çizimi elde tutulan banka ya da kimlik kartıyla (85,6 x 54 mm, ISO 7810) aynı boya gelene kadar kaydırılır.
export function Kalibrasyon({ olcek, kaydet, kapat }: { olcek: number | null; kaydet: (o: number | null) => void; kapat: () => void }) {
  const [deger, setDeger] = useState(olcek ?? 1);
  const yuzde = Math.round(deger * 100);
  return (
    <section className="tc-etk-kalibrasyon" aria-label="Ekran ölçüsünü ayarla">
      <p className="tc-etk-not">Bir banka ya da kimlik kartını ekrandaki çizimin üstüne tutun; çizim kartla aynı boya gelene kadar kaydırın. Ayar yalnız bu ekranda ve bu tarayıcıda geçerlidir.</p>
      <div className="tc-etk-kagit-alani tc-etk-kagit-alani-gercek">
        <svg className="tc-etk-onizleme-gercek" width={mmOzniteligi(KART_GENISLIK_MM, deger)} height={mmOzniteligi(KART_YUKSEKLIK_MM, deger)}
          viewBox={`0 0 ${String(KART_GENISLIK_MM)} ${String(KART_YUKSEKLIK_MM)}`} role="img" aria-label="Kart ölçüsü">
          <rect className="tc-etk-kart" x={0.25} y={0.25} width={KART_GENISLIK_MM - 0.5} height={KART_YUKSEKLIK_MM - 0.5} rx={3.18} strokeWidth={0.5} />
        </svg>
      </div>
      <label className="tc-etk-kaydirici">
        <span>Ölçek: %{yuzde}</span>
        <input type="range" min={EN_AZ_OLCEK * 100} max={EN_COK_OLCEK * 100} step={0.5} value={deger * 100}
          onChange={(e) => setDeger(olcekSinirla(Number(e.target.value) / 100))} />
      </label>
      <div className="tc-etk-dugmeler">
        <Dugme tur="birincil" simge="check" onClick={() => { kaydet(deger); kapat(); }}>Kaydet</Dugme>
        <Dugme simge="trash" onClick={() => { kaydet(null); kapat(); }}>Ayarı sil</Dugme>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
      </div>
    </section>
  );
}
