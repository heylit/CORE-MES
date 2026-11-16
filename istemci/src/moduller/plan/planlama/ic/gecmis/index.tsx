import { useState } from 'react';
import '../../../../../ortak/arayuz/tablo.css';
import { IZ_SINIRI } from '../../kayit.ts';
import type { IzSatiri, PlanlamaCalismasi } from '../../tipler.ts';
import { VeriKarti, VeriTablosu, type Sutun } from '../veri/ortak.tsx';
import '../veri/veri.css';
import './gecmis.css';
import { izKisileri, izSuz, izZamani } from './kurallar.ts';

// Değişiklik izi planlama çalışmasının kaydındadır (her çalışma yazması bir satır ekler); ekran yalnız okur. Değişiklik defteri kalıcıdır ve
// sunucudan okunur (2129-2 b, Defter.tsx). İkisi de Veri sayfasının bölümüdür (3308-2 a).
const IZ_SUTUNLARI: readonly Sutun<IzSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (x) => <span className="mono">{izZamani(x.t)}</span>, kirilmaz: true },
  { anahtar: 'kim', baslik: 'Kişi', hucre: (x) => x.kim || '—' },
  { anahtar: 'rol', baslik: 'Rol', hucre: (x) => x.rol || '—' },
  { anahtar: 'sayfa', baslik: 'Sayfa', hucre: (x) => x.sayfa || '—' },
  { anahtar: 'ne', baslik: 'İşlem', hucre: (x) => <b>{x.ne}</b> },
  { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (x) => <span className="tc-pyi-k">{x.ayrinti}</span> },
];

export function DegisiklikIzi({ c }: { c: PlanlamaCalismasi }) {
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
