import { Sekmeler, type Sekme } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { kysIstatistigi } from '../kurallar/kys.ts';
import type { KysSekmesi } from '../tipler.ts';
import { DokumanUretici } from './dokuman-uretici.tsx';
import { Dosyalama } from './dosyalama.tsx';
import { GenelBakis, Olgunluk } from './genel-bakis.tsx';
import { GorevTanimlari } from './gorev-tanimlari.tsx';
import { KisiOnerileri, KysGecisSaglayici } from './ortak.tsx';
import { RutinGorevler } from './rutin-gorevler.tsx';
import { SemalarSekmesi } from './semalar-sekmesi.tsx';
import { Surecler } from './surecler.tsx';
import { YapiTaslari } from './yapi-taslari.tsx';
import { YolHaritasi } from './yol-haritasi.tsx';
import './kys.css';

// KYS (prototip vKys, KSEC): dokuz alt sekme. Açık sekme kişinin ekran durumundadır (204 a), kayda yazılmaz.

export const KSEC: readonly Sekme<KysSekmesi>[] = [
  { anahtar: 'nedir', baslik: 'Genel bakış', simge: 'help' },
  { anahtar: 'yol', baslik: 'Kurulum yol haritası', simge: 'flag' },
  { anahtar: 'blok', baslik: 'Yapı taşları', simge: 'layers' },
  { anahtar: 'surec', baslik: 'Süreçler', simge: 'rotate' },
  { anahtar: 'uret', baslik: 'Doküman üretici', simge: 'printer' },
  { anahtar: 'dosya', baslik: 'Dosyalama', simge: 'file' },
  { anahtar: 'gorev', baslik: 'Görev tanımları', simge: 'users' },
  { anahtar: 'rutin', baslik: 'Rutin görevler', simge: 'clipboard-check' },
  { anahtar: 'sema', baslik: 'Şemalar ve grafikler', simge: 'chart' },
];

const EKRAN: Record<KysSekmesi, () => React.JSX.Element> = {
  nedir: GenelBakis, yol: YolHaritasi, blok: YapiTaslari, surec: Surecler, uret: DokumanUretici, dosya: Dosyalama, gorev: GorevTanimlari,
  rutin: RutinGorevler, sema: SemalarSekmesi,
};

export function Kys() {
  const d = useDenetim();
  const sekme = d.ekran.kys.tab;
  const baslik = KSEC.find((x) => x.anahtar === sekme)?.baslik ?? 'Genel bakış';
  const Ekran = EKRAN[sekme];
  return (
    <KysGecisSaglayici><div className="tc-dhk">
      <Sekmeler etiket="KYS bölümleri" sekmeler={KSEC} secili={sekme} sec={(k) => { d.ekranDegistir((e) => { e.kys.tab = k; }); }} />
      <header className="tc-dhk-baslik">
        <h2>{baslik}</h2>
        <p>Kalite yönetim sistemi · ISO 9001, AS9100 ve EYDEP için ortak</p>
      </header>
      {sekme === 'nedir' && <Olgunluk ist={kysIstatistigi(d.profil, d.program)} />}
      <Ekran />
      <KisiOnerileri />
    </div></KysGecisSaglayici>
  );
}
