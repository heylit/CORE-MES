import type { ReactNode } from 'react';
import { Dugme, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { ayKaydir } from '../ortak/AySecici.tsx';
import './izin-devam.css';

export interface BaslikDugmesi { anahtar: string; etiket: string; simge: SimgeAdi; yap: () => void; birincil?: boolean; pasif?: boolean }

// Bugunku ekranda sayfa basligindaki dugmelerin hepsi gorunurdur; ortak baslik ikincilleri menuye topladigi icin bu sayfa kendi basligini cizer.
export function Baslik({ baslik, simge, alt, dugmeler }: { baslik: string; simge: SimgeAdi; alt?: ReactNode; dugmeler: readonly BaslikDugmesi[] }) {
  return (
    <header className="tc-iki-baslik">
      <div className="tc-iki-baslik-bas">
        <h2 className="tc-iki-baslik-ad"><Simge ad={simge} /><span>{baslik}</span></h2>
        {alt && <p className="tc-iki-baslik-alt">{alt}</p>}
      </div>
      {dugmeler.length > 0 && (
        <div className="tc-iki-baslik-eylem">
          {dugmeler.map((d) => (
            <Dugme key={d.anahtar} tur={d.birincil ? 'birincil' : 'ikincil'} simge={d.simge} disabled={d.pasif} onClick={d.yap}>{d.etiket}</Dugme>
          ))}
        </div>
      )}
    </header>
  );
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;

// Bugunku ekrandaki ay secimi: onceki ve sonraki ay dugmeleri arasinda ay ve yil listeleri.
export function AyYilSecici({ ay, degistir, bugun }: { ay: string; degistir: (ay: string) => void; bugun: string }) {
  const yil = Number(ay.slice(0, 4));
  const buYil = Number(bugun.slice(0, 4));
  const yillar = Array.from(new Set([...Array.from({ length: 7 }, (_, i) => buYil - 5 + i), yil])).sort((a, b) => a - b);
  return (
    <span className="tc-iki-ay" role="group" aria-label="Ay">
      <Dugme simge="chev-left" aria-label="Önceki ay" onClick={() => { degistir(ayKaydir(ay, -1)); }} />
      <Secim etiket="Ay" secenekler={AYLAR.map((a, i) => ({ deger: String(i + 1).padStart(2, '0'), baslik: a }))} value={ay.slice(5, 7)}
        onChange={(e) => { degistir(`${ay.slice(0, 4)}-${e.target.value}`); }} />
      <Secim etiket="Yıl" secenekler={yillar.map((y) => ({ deger: String(y), baslik: String(y) }))} value={String(yil)}
        onChange={(e) => { degistir(`${e.target.value}-${ay.slice(5, 7)}`); }} />
      <Dugme simge="chev-right" aria-label="Sonraki ay" onClick={() => { degistir(ayKaydir(ay, 1)); }} />
    </span>
  );
}
