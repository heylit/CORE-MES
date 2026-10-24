import { useState } from 'react';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { ayAdi } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { Personel } from '../tipler.ts';
import { BordroPusulasi, TazminatDokumu } from './baska-parcalar.tsx';
import { CalismaBelgesi } from './CalismaBelgesi.tsx';
import { adSoyadMetni, bugun } from './kurallar.ts';

type Belge = 'calisma' | 'pusula' | 'tazminat';

// Zimmet tutanağı yoktur: zimmetin sahibi İdari İşler'dir (karar 244 a).
export function BelgeMenusu({ acik, kapat, p, o }: { acik: boolean; kapat: () => void; p: Personel; o: IkEkranOzellikleri }) {
  const [belge, belgeYaz] = useState<Belge | null>(null);
  const gun = bugun();
  const ay = gun.slice(0, 7);
  const secenekler: readonly { k: Belge; baslik: string; alt: string; simge: SimgeAdi }[] = [
    { k: 'calisma', baslik: 'Çalışma belgesi', alt: 'İşin türü ve süresini gösterir (md. 28).', simge: 'file' },
    { k: 'pusula', baslik: 'Bordro pusulası', alt: `${ayAdi(ay)} dönemi.`, simge: 'lira' },
    { k: 'tazminat', baslik: 'Tazminat hesap dökümü', alt: 'Kıdem, ihbar ve kullanılmayan izin ücreti.', simge: 'ruler' },
  ];
  const ac = (b: Belge) => { kapat(); belgeYaz(b); };
  const bitti = () => { belgeYaz(null); };
  return (
    <>
      <Pencere acik={acik} kapat={kapat} baslik={`${adSoyadMetni(p)}: belge oluştur`}>
        <ul className="tc-ikp-belge-menu">
          {secenekler.map((x) => (
            <li key={x.k}>
              <button type="button" onClick={() => { ac(x.k); }}>
                <Simge ad={x.simge} boyut="o" />
                <span><b>{x.baslik}</b><small>{x.alt}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </Pencere>
      {belge === 'calisma' && <CalismaBelgesi o={o} personel={p} kapat={bitti} />}
      {belge === 'pusula' && <BordroPusulasi o={o} personel={p} ay={ay} kapat={bitti} />}
      {belge === 'tazminat' && <TazminatDokumu o={o} personel={p} cikis={p.cikisTarihi || gun} kapat={bitti} />}
    </>
  );
}
