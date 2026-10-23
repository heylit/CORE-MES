import { useId, useState } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { eslesir } from '../kurallar.ts';
import type { Kisi } from '../tipler.ts';
import { KisiRozeti } from './KisiRozeti.tsx';

const suz = (kisiler: readonly Kisi[], sorgu: string): Kisi[] =>
  kisiler.filter((k) => k.ad && (sorgu.trim() === '' || eslesir(k.ad, sorgu.trim())));

interface TekliOzellikler {
  etiket: string;
  deger: string | null;
  degisti: (kisi: string | null) => void;
  // Kendini seçmek "Kendime" diye görünür (görev).
  kendim?: boolean;
}

// Eski ekranın kişi seçicisi: ad yazılır, ilk altı eşleşme listelenir; seçilen kişi "Değiştir" ile bırakılır.
export function KisiSecici({ etiket, deger, degisti, kendim = false }: TekliOzellikler) {
  const { kisiler, ad, ben } = useMesaj();
  const [sorgu, setSorgu] = useState('');
  const kimlik = useId();
  const gorunen = (id: string) => (kendim && id === ben.id ? 'Kendime' : ad(id));
  if (deger !== null) {
    return (
      <div className="tc-my-secici" role="group" aria-label={etiket}>
        <div className="tc-my-secilen">
          <KisiRozeti id={deger} />
          <b>{gorunen(deger)}</b>
          <Dugme tur="ikincil" type="button" onClick={() => { degisti(null); }}>Değiştir</Dugme>
        </div>
      </div>
    );
  }
  const liste = suz(kendim ? kisiler : kisiler.filter((k) => k.id !== ben.id), sorgu).slice(0, 6);
  return (
    <div className="tc-my-secici" role="group" aria-labelledby={kimlik}>
      <span id={kimlik} className="tc-my-secici-etiket">{etiket}</span>
      <input
        className="tc-my-secici-girdi"
        placeholder="İsim yaz…"
        autoComplete="off"
        aria-label={`${etiket}: kişi ara`}
        value={sorgu}
        onChange={(o) => { setSorgu(o.target.value); }}
      />
      <div className="tc-my-secici-liste">
        {liste.map((k) => (
          <button key={k.id} type="button" className="tc-my-secenek" onClick={() => { degisti(k.id); setSorgu(''); }}>
            <KisiRozeti id={k.id} boyut="s" />
            <span>{gorunen(k.id)}</span>
          </button>
        ))}
        {liste.length === 0 && <span className="tc-my-soluk">Kimse bulunamadı.</span>}
      </div>
    </div>
  );
}

interface CokluOzellikler {
  etiket: string;
  degerler: readonly string[];
  degisti: (kisiler: string[]) => void;
}

// Çoklu seçici (onaylayacaklar, katılımcılar): seçilenler çip olur; kendisi listede yoktur.
export function CokluKisiSecici({ etiket, degerler, degisti }: CokluOzellikler) {
  const { kisiler, ad, ben } = useMesaj();
  const [sorgu, setSorgu] = useState('');
  const kimlik = useId();
  const liste = suz(kisiler.filter((k) => k.id !== ben.id && !degerler.includes(k.id)), sorgu).slice(0, 5);
  return (
    <div className="tc-my-secici" role="group" aria-labelledby={kimlik}>
      <span id={kimlik} className="tc-my-secici-etiket">{etiket}</span>
      {degerler.length > 0 && (
        <div className="tc-my-cipler">
          {degerler.map((id) => (
            <span key={id} className="tc-my-cip">
              <KisiRozeti id={id} boyut="s" />
              {ad(id)}
              <button type="button" aria-label={`${ad(id)} çıkar`} onClick={() => { degisti(degerler.filter((x) => x !== id)); }}>
                <Simge ad="x" boyut="k" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="tc-my-secici-girdi"
        placeholder="İsim yazarak ekle…"
        autoComplete="off"
        aria-label={`${etiket}: kişi ekle`}
        value={sorgu}
        onChange={(o) => { setSorgu(o.target.value); }}
      />
      <div className="tc-my-secici-liste">
        {liste.map((k) => (
          <button key={k.id} type="button" className="tc-my-secenek" onClick={() => { degisti([...degerler, k.id]); setSorgu(''); }}>
            <KisiRozeti id={k.id} boyut="s" />
            <span>{ad(k.id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
