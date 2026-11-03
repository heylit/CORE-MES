import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RehberMaddesi } from '../rota/rehber.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Dugme } from './Dugme.tsx';
import { Pencere } from './Pencere.tsx';
import { Simge } from './Simge.tsx';
import './rehber.css';

interface Adim {
  anahtar: string;
  simge: SimgeAdi;
  baslik: string;
  icerik: ReactNode;
}

// Tanıtım kişinin rolüne göredir: rol yetkiyi, yetki görülen sayfaları belirler; "Sizin sayfalarınız" adımı yalnız onları anlatır.
// Ortak parçalar (menü, arama, "Ne oldu?") yalnız kişide varsa anlatılır.
export function tanitimAdimlari({ maddeler, kisayolVar }: { maddeler: readonly RehberMaddesi[]; kisayolVar: boolean }): Adim[] {
  const gruplar = [...new Set(maddeler.map((m) => m.grup))];
  const adimlar: (Adim | null)[] = [
    {
      anahtar: 'hosgeldin',
      simge: 'home',
      baslik: 'TMI CORE\'a hoş geldiniz',
      icerik: (
        <>
          <p>Atölyenin işi burada tek yerde: emir, malzeme, istasyon, kalite.</p>
          <p>
            Size açık {maddeler.length} sayfa var. Bu kısa tanıtım onları ve ekranın nasıl kullanıldığını anlatır;
            istediğiniz an kapatabilirsiniz.
          </p>
        </>
      ),
    },
    {
      anahtar: 'menu',
      simge: 'dash',
      baslik: 'Sayfalar solda, bölümler üstte',
      icerik: (
        <>
          <p>Sayfalar sol menüde gruplar halinde durur{gruplar.length > 0 ? ` (${gruplar.join(', ')})` : ''}. Telefonda alttaki çubuktadır.</p>
          <p>Sayfanın bölümleri başlığın altındaki sekmelerdir. Yalnız yetkinizin olduğu bölümleri görürsünüz.</p>
        </>
      ),
    },
    {
      anahtar: 'arama',
      simge: 'search',
      baslik: 'Aradığınızı yazın: Ctrl K',
      icerik: <p>Üst çubuktaki arama sayfa, bölüm ve kayıt bulur. Klavyede Ctrl K ile açılır, Enter ile gidersiniz.</p>,
    },
    kisayolVar ? {
      anahtar: 'ne-oldu',
      simge: 'plus',
      baslik: '"Ne oldu?" ile işe başlayın',
      icerik: <p>Üst çubuktaki + düğmesinde günlük olaylar var ("Malzeme geldi", "İzin istiyorum"). Olayı seçin; sistem sizi doğru ekrana götürür.</p>,
    } : null,
    maddeler.length > 0 ? {
      anahtar: 'sayfalar',
      simge: 'layers',
      baslik: 'Sizin sayfalarınız',
      icerik: <SayfaListesi maddeler={maddeler} />,
    } : null,
    {
      anahtar: 'yardim',
      simge: 'help',
      baslik: 'Takılırsanız: Yardım',
      icerik: (
        <>
          <p>Sağ üstteki soru işareti düğmesi Yardım'ı açar: açık olduğunuz sayfanın tarifi en üsttedir, soru yazarak arayabilirsiniz.</p>
          <p>Bu tanıtımı oradan yeniden başlatabilir, kitapçığı yazdırabilirsiniz.</p>
        </>
      ),
    },
  ];
  return adimlar.filter((a): a is Adim => a !== null);
}

function SayfaListesi({ maddeler }: { maddeler: readonly RehberMaddesi[] }) {
  const git = useNavigate();
  return (
    <ul className="tc-tanitim-sayfalar">
      {maddeler.map((m) => (
        <li key={m.yol}>
          <button type="button" className="tc-rehber-kisayol" onClick={() => { void git(m.yol); }}>
            <Simge ad={m.simge} />
            <span><b>{m.baslik}</b><span>{m.ozet}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TanitimPenceresi({ acik, kapat, maddeler, kisayolVar }: {
  acik: boolean;
  // Bitince de, yarıda kapatılınca da çağrılır: tanıtım bir kez önerilir, sonra Yardım'dadır.
  kapat: () => void;
  maddeler: readonly RehberMaddesi[];
  kisayolVar: boolean;
}) {
  const [sira, siraYaz] = useState(0);
  const adimlar = tanitimAdimlari({ maddeler, kisayolVar });
  const adim = adimlar[Math.min(sira, adimlar.length - 1)];
  const son = sira >= adimlar.length - 1;
  const bitir = () => { siraYaz(0); kapat(); };
  if (adim === undefined) return null;
  return (
    <Pencere
      acik={acik}
      kapat={bitir}
      baslik={`Tanıtım ${String(sira + 1)} / ${String(adimlar.length)}`}
      alt={(
        <>
          {sira > 0 && <Dugme simge="chev-left" onClick={() => siraYaz((s) => s - 1)}>Önceki</Dugme>}
          {son
            ? <Dugme tur="birincil" simge="check" onClick={bitir} data-ilk-odak>Bitti</Dugme>
            : <Dugme tur="birincil" simge="chev-right" onClick={() => siraYaz((s) => s + 1)} data-ilk-odak>Sonraki</Dugme>}
        </>
      )}
    >
      <div className="tc-tanitim" key={adim.anahtar}>
        <span className="tc-tanitim-simge"><Simge ad={adim.simge} boyut="b" /></span>
        <h3 className="tc-tanitim-baslik">{adim.baslik}</h3>
        <div className="tc-tanitim-metin">{adim.icerik}</div>
        <ol className="tc-tanitim-noktalar" aria-hidden="true">
          {adimlar.map((a, i) => <li key={a.anahtar} data-etkin={i === sira ? '' : undefined} />)}
        </ol>
      </div>
    </Pencere>
  );
}

// İlk girişte köşede çıkan öneri. Perde açmaz: karşılama ve işi örtmez, kişi isterse başlatır.
export function TanitimDaveti({ baslat, vazgec }: { baslat: () => void; vazgec: () => void }) {
  return (
    <aside className="tc-tanitim-davet" aria-label="Tanıtım önerisi">
      <Simge ad="help" boyut="b" />
      <div className="tc-tanitim-davet-metin">
        <b>Sistemi bir dakikada tanıyalım mı?</b>
        <span>Size açık sayfaları ve temel kullanımı anlatır.</span>
      </div>
      <div className="tc-tanitim-davet-dugmeler">
        <Dugme tur="birincil" simge="play" onClick={baslat}>Başla</Dugme>
        <Dugme onClick={vazgec}>Şimdi değil</Dugme>
      </div>
    </aside>
  );
}
