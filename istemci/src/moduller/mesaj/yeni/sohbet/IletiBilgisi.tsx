import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { KisiRozeti } from '../ortak/index.ts';
import { useMesaj } from '../durum.tsx';
import { onizleme } from '../kurallar.ts';
import type { Ileti, Kayit } from '../tipler.ts';
import { useSohbetOdasi } from './ortak.ts';
import { IletiMetni } from './IletiMetni.tsx';
import { bilinenKisiler, okuyanlar } from './yardimci.ts';

// Kendi iletimi kimler okudu, kimler henüz okumadı (openReadInfo).
export function IletiBilgisi({ ileti, kanal, kapat }: { ileti: Kayit<Ileti>; kanal: string; kapat: () => void }) {
  const { ben, ad, veri } = useMesaj();
  const { cevrimici, iletiler } = useSohbetOdasi();
  const okuyan = okuyanlar(ileti, kanal, veri.okuma, ben.id);
  const bekleyen = bilinenKisiler({
    cevrimici: [ben.id, ...cevrimici], iletiler, gorevler: veri.gorevler, onaylar: veri.onaylar, duyurular: veri.duyurular,
  }).filter((u) => u !== ileti.by && !okuyan.includes(u));

  const satir = (u: string, okudu: boolean) => (
    <li key={u} className="tc-ms-kisi-satiri">
      <KisiRozeti id={u} />
      <span className="tc-ms-kisi-adi">{ad(u)}</span>
      {okudu
        ? <span className="tc-ms-okudu"><Simge ad="check" boyut="k" /> Okudu</span>
        : <span className="tc-ms-soluk">Henüz okumadı</span>}
    </li>
  );

  return (
    <Pencere acik kapat={kapat} baslik="Mesaj bilgisi" tur="yan" alt={<Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>}>
      <div className="tc-ms-alinti-kutu"><IletiMetni metin={ileti.text || onizleme(ileti, ad)} /></div>
      <ul className="tc-ms-kisi-listesi">
        {okuyan.map((u) => satir(u, true))}
        {bekleyen.map((u) => satir(u, false))}
      </ul>
    </Pencere>
  );
}
