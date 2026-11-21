import { useSearchParams } from 'react-router-dom';
import { Simge } from '../../ortak/arayuz/index.ts';
import { tanitimKonulari, type TanitimKonusu } from '../../ortak/rota/tanitim.ts';
import './tanitim.css';

export const TANITIM_YOLU = '/profil/tanitim';

// Tanıtım (3535 a): ekranların tanıtımı ve kullanımı. Bu sayfa yalnız çerçevedir; her konunun içeriği ekranın sahibi modülün
// tanitim.tsx dosyasından gelir. Seçilen konu adreste durur ki bağlantıyla paylaşılsın.
export function Tanitim({ konular = tanitimKonulari }: { konular?: readonly TanitimKonusu[] }) {
  const [adres, setAdres] = useSearchParams();
  const secili = konular.find((k) => k.anahtar === adres.get('konu')) ?? konular[0];
  if (!secili) return <p className="tc-tnt-bos">Henüz tanıtım konusu yok.</p>;
  const Icerik = secili.icerik;
  return (
    <div className="tc-tnt">
      <h1 className="tc-tnt-baslik">Tanıtım</h1>
      <nav className="tc-tnt-konular" aria-label="Tanıtım konuları">
        {konular.map((k) => (
          <button key={k.anahtar} type="button" aria-current={k === secili ? 'page' : undefined} onClick={() => { setAdres({ konu: k.anahtar }, { replace: true }); }}>
            <Simge ad={k.simge} /><span><b>{k.baslik}</b><small>{k.alt}</small></span>
          </button>
        ))}
      </nav>
      <article className="tc-tnt-icerik" aria-label={`${secili.baslik} tanıtımı`}><Icerik /></article>
    </div>
  );
}
