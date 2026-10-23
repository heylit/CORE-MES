import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useMesaj } from '../durum.tsx';
import type { teslimEtiketi } from '../kurallar.ts';
import { KisiRozeti } from '../ortak/index.ts';

export function TeslimEtiketi({ etiket }: { etiket: ReturnType<typeof teslimEtiketi> }) {
  if (!etiket) return null;
  return <span className={`tc-mi-teslim${etiket.c ? ` tc-mi-teslim-${etiket.c}` : ''}`}>{etiket.t}</span>;
}

// Bağlı siparişin numarası; sipariş listede yoksa (sevk edilmiş, okuma izni yok) çizilmez, prototipteki gibi.
export function SiparisCipi({ siparisId }: { siparisId: string | null }) {
  const { siparisler } = useMesaj();
  const s = siparisId ? siparisler?.find((o) => o.id === siparisId) : undefined;
  if (!s) return null;
  return <span className="tc-mi-cip"><Simge ad="box" />#{s.no}</span>;
}

// Onaylayan ya da katılımcı satırı: kişi, adı (kendisi "Sen") ve işareti.
export function KisiIsareti({ id, isaret, durum, baslik }: {
  id: string; isaret: string; durum: 'ok' | 'no' | 'maybe' | ''; baslik: string;
}) {
  const { ben, ilkAd } = useMesaj();
  return (
    <span className={`tc-mi-kisi${durum ? ` tc-mi-kisi-${durum}` : ''}`} title={baslik}>
      <KisiRozeti id={id} boyut="s" />
      {id === ben.id ? 'Sen' : ilkAd(id)}
      <b aria-hidden="true">{isaret}</b>
      <span className="tc-mi-gizli">{baslik}</span>
    </span>
  );
}

export interface Secim<A extends string> { anahtar: A; baslik: string; sayi?: number; simge?: SimgeAdi }

// Prototipin "segc" grubu (Bana/Benden/Herkes, Liste/Pano/Tablo): basılı düğmeler, sekme değil.
export function SecimGrubu<A extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly Secim<A>[]; secili: A; sec: (a: A) => void;
}) {
  return (
    <div className="tc-mi-secim" role="group" aria-label={etiket}>
      {secenekler.map((s) => (
        <button key={s.anahtar} type="button" aria-pressed={s.anahtar === secili} onClick={() => sec(s.anahtar)}>
          {s.simge && <Simge ad={s.simge} />}
          <span>{s.baslik}</span>
          {s.sayi ? <span className="tc-mi-sayi">{s.sayi}</span> : null}
        </button>
      ))}
    </div>
  );
}
