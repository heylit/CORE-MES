import { useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import '../../../../../ortak/arayuz/tablo.css';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { IZ_SINIRI } from '../../kayit.ts';
import { HAZIRLANIYOR } from '../../motor/ortak.tsx';
import type { IzSatiri, PlanlamaCalismasi } from '../../tipler.ts';
import { VeriKarti, VeriTablosu, type Sutun } from '../veri/ortak.tsx';
import '../veri/veri.css';
import './gecmis.css';
import { GECMIS_BOLUMLERI, ILK_GECMIS, izKisileri, izSuz, izZamani, type GecmisBolumu } from './kurallar.ts';

export { gecmisBolumuOku, type GecmisBolumu } from './kurallar.ts';

// "Geçmiş" ekranı (bugünkü sayfa b-kabuk.betik EKRANLAR gecmis; 575 a): Senaryolar ve Değişiklik izi. Bölüm adresin `bolum`'undadır.
// Değişiklik izi planlama çalışmasının kaydındadır (her çalışma yazması bir satır ekler); ekran yalnız okur.
export interface GecmisOzellikleri extends PlanlamaEkranOzellikleri {
  bolum?: GecmisBolumu;
  bolumSec?: (b: GecmisBolumu) => void;
}

export function GecmisEkrani(o: GecmisOzellikleri) {
  const c = o.calisma;
  const [ic, icYaz] = useState<GecmisBolumu>(ILK_GECMIS);
  const bolum = o.bolum ?? ic;
  const sec = (b: GecmisBolumu) => { if (o.bolumSec) o.bolumSec(b); else icYaz(b); };
  return (
    <div className="tc-pyi" data-parca="gecmis" data-bolum={bolum}>
      <nav className="tc-pyi-serit-menu" aria-label="Geçmiş">
        {GECMIS_BOLUMLERI.map(([k, ad, s]) => (
          <button key={k} type="button" aria-current={k === bolum ? 'page' : undefined} onClick={() => { sec(k); }}>
            <Simge ad={s} boyut="k" /><span>{ad}</span>
          </button>
        ))}
      </nav>
      {!c ? (
        <div className="tc-pyi-bos"><Simge ad="book" /><strong>Planlama çalışması yok</strong><span>Çalışma kaydı açılınca senaryolar ve değişiklik izi burada görünür.</span></div>
      ) : (
        <section className="tc-pyi-icerik" aria-label={GECMIS_BOLUMLERI.find((x) => x[0] === bolum)?.[1]}>
          {bolum === 'iz' ? <DegisiklikIzi c={c} /> : <VeriKarti baslik="Senaryolar" simge="flag"><p className="tc-pyi-alt">{`Senaryolar: ${HAZIRLANIYOR}`}</p></VeriKarti>}
        </section>
      )}
    </div>
  );
}

const IZ_SUTUNLARI: readonly Sutun<IzSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (x) => <span className="mono">{izZamani(x.t)}</span>, kirilmaz: true },
  { anahtar: 'kim', baslik: 'Kişi', hucre: (x) => x.kim || '—' },
  { anahtar: 'rol', baslik: 'Rol', hucre: (x) => x.rol || '—' },
  { anahtar: 'sayfa', baslik: 'Sayfa', hucre: (x) => x.sayfa || '—' },
  { anahtar: 'ne', baslik: 'İşlem', hucre: (x) => <b>{x.ne}</b> },
  { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (x) => <span className="tc-pyi-k">{x.ayrinti}</span> },
];

function DegisiklikIzi({ c }: { c: PlanlamaCalismasi }) {
  const [kim, kimYaz] = useState<string | null>(null);
  const kisiler = izKisileri(c.iz); const l = izSuz(c.iz, kim);
  return (
    <>
      <div className="tc-pyi-sira">
        <select className="tc-alan-kutu tc-pyg-kisi" aria-label="Kişi" value={kim ?? ''} onChange={(e) => { kimYaz(e.target.value || null); }}>
          <option value="">Herkes</option>
          {kisiler.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <span className="tc-pyi-alt">{`${c.iz.length} kayıt. İz planlama çalışmasının kaydında tutulur; en yeni ${IZ_SINIRI} satır kalır.`}</span>
      </div>
      <VeriKarti baslik="Değişiklik izi" simge="book">
        <VeriTablosu etiket="Değişiklik izi" sutunlar={IZ_SUTUNLARI} satirlar={l} anahtar={(x, i) => `${x.t}-${i}`} />
      </VeriKarti>
    </>
  );
}
