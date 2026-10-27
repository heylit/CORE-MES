import { useState } from 'react';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import type { EmirSecimi } from './kopru.ts';
import './recete-rota.css';

interface Ozellikler { secenekler: AcilisSecenekleri; bitir: (secim: EmirSecimi | null) => void }

const terminYazisi = (t: string | null): string => (t === null ? '—' : t.split('-').reverse().join('.'));

// Üretim emri bir projeyle açılır (224). Tek proje önceden seçili gelir; satır yalnız projenin birden çok uygun satırı varsa sorulur
// (tek satırı sunucu bağlar). Satır listesi sunucunun bağlayacağı satırlardır, fiyat yoktur.
export function EmirProjeSecimi({ secenekler, bitir }: Ozellikler) {
  const [projeId, setProjeId] = useState<number | null>(secenekler.projeler.length === 1 ? secenekler.projeler[0]!.id : null);
  const [satirId, setSatirId] = useState<number | null>(null);
  const proje = secenekler.projeler.find((p) => p.id === projeId);
  const satirSorulur = proje !== undefined && proje.satirlar.length > 1;
  const hazir = proje !== undefined && (!satirSorulur || satirId !== null);
  const vazgec = () => { bitir(null); };
  return (
    <Pencere
      acik
      kapat={vazgec}
      baslik="Üretim emri için proje"
      alt={(
        <>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={!hazir} onClick={() => { if (proje) bitir({ projeId: proje.id, siparisSatiriId: satirSorulur ? satirId : null }); }}>
            Emri aç
          </Dugme>
        </>
      )}
    >
      <div className="tc-rr-secim">
        <fieldset className="tc-rr-secenekler">
          <legend>Proje</legend>
          {secenekler.projeler.map((p) => (
            <label key={p.id} className="tc-rr-secenek">
              <input type="radio" name="emir-proje" checked={p.id === projeId} onChange={() => { setProjeId(p.id); setSatirId(null); }} />
              <strong>{p.kod}</strong>
              <span>{p.ad}</span>
            </label>
          ))}
        </fieldset>
        {satirSorulur && (
          <fieldset className="tc-rr-secenekler">
            <legend>Sipariş satırı</legend>
            {proje.satirlar.map((s) => (
              <label key={s.id} className="tc-rr-secenek">
                <input type="radio" name="emir-satir" checked={s.id === satirId} onChange={() => { setSatirId(s.id); }} />
                <strong>{s.siparisNo} / satır {s.satirNo}</strong>
                <span>{s.adet} adet · termin {terminYazisi(s.termin)}</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Pencere>
  );
}
