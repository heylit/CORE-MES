import { Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import type { EmirTakimListesi, EmirTakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { LISTE_DURUMU_ADI, LISTE_DURUMU_TONU } from './gosterim.ts';
import './takimhane.css';

const SUTUNLAR: readonly Sutun<EmirTakimSatiri>[] = [
  { anahtar: 'cep', baslik: 'Cep', mono: true, kirilmaz: true, hucre: (s) => s.cep },
  { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (s) => s.kod },
  { anahtar: 'ad', baslik: 'Takım', hucre: (s) => s.ad },
  { anahtar: 'adet', baslik: 'Adet', mono: true, hizala: 'sag', hucre: (s) => s.adet },
  {
    anahtar: 'durum', baslik: 'Durum', kartTamSatir: true,
    hucre: (s) => <Rozet ton={LISTE_DURUMU_TONU[s.durum]}>{s.durum === 'eksik' ? `${LISTE_DURUMU_ADI.eksik}: ${s.eksik} adet` : LISTE_DURUMU_ADI[s.durum]}</Rozet>,
  },
];

// Emrin takım listesi; eksik takım emir başlamadan görünür. Yalnız uyarır, başlatmayı engellemez.
export function EmirTakimlari({ liste }: { liste: EmirTakimListesi }) {
  // Eksik takımlar üstte; başlıktaki çip hangi cepte olduğunu da söyler.
  const eksikler = liste.satirlar.filter((s) => s.durum === 'eksik');
  const eksik = eksikler.length;
  const sirali = [...eksikler, ...liste.satirlar.filter((s) => s.durum !== 'eksik')];
  return (
    <section className="tc-tkm-emir" aria-label={`${liste.emirNo} takım listesi`}>
      <header className="tc-tkm-emir-ust">
        <div className="tc-tkm-emir-ad">
          <span className="mono">{liste.emirNo}</span>
          <span className="tc-tkm-soluk">{liste.parca} · {liste.istasyon}</span>
        </div>
        {liste.hazir
          ? <Rozet ton="tamam">Takım hazır</Rozet>
          : <Rozet ton={eksik > 0 ? 'hata' : 'uyari'}>{eksik > 0 ? `${eksikler.map((e) => e.cep).join(', ')} eksik` : 'Takım hazırlanıyor'}</Rozet>}
      </header>
      <IkiGorunum
        masa={<Tablo etiket="Emrin takımları" sutunlar={SUTUNLAR} satirlar={sirali} satirAnahtari={(s) => `${s.cep}-${s.kod}`} />}
        kompakt={(
          <KompaktListe
            etiket="Emrin takımları" satirlar={sirali} satirAnahtari={(s) => `${s.cep}-${s.kod}`}
            baslik={(s) => s.ad} sag={(s) => `${String(s.adet)} adet`} alt={(s) => `${s.cep} · ${s.kod}`}
            ek={(s) => <Rozet ton={LISTE_DURUMU_TONU[s.durum]}>{s.durum === 'eksik' ? `${LISTE_DURUMU_ADI.eksik}: ${String(s.eksik)} adet` : LISTE_DURUMU_ADI[s.durum]}</Rozet>}
          />
        )}
      />
      {!liste.hazir && eksik > 0 && <p className="tc-tkm-uyari"><Simge ad="alert" boyut="k" />Eksik takım, emir başlamadan önce takımhaneden istenmeli.</p>}
    </section>
  );
}
