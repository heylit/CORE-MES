import { useState } from 'react';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import type { EmirSecimi } from './kopru.ts';
import './recete-rota.css';

interface Ozellikler { secenekler: AcilisSecenekleri; bitir: (secim: EmirSecimi | null) => void }

const terminYazisi = (t: string | null): string => (t === null ? '—' : t.split('-').reverse().join('.'));
const adetYazisi = (a: string): string => a.replace(/\.?0+$/, '').replace('.', ',');

// Üretim emri bir projeyle açılır (224). Tek proje önceden seçili gelir; satır yalnız projenin birden çok uygun satırı varsa sorulur
// (tek satırı sunucu bağlar). Satır listesi sunucunun bağlayacağı satırlardır, fiyat yoktur.
// 3244 b: satırın üretim çeşidi partileri varsa emir bir partiden açılabilir (10 FAI, 90 Seri); seçilmezse partisiz açılır.
export function EmirProjeSecimi({ secenekler, bitir }: Ozellikler) {
  const [projeId, setProjeId] = useState<number | null>(secenekler.projeler.length === 1 ? secenekler.projeler[0]!.id : null);
  const [satirId, setSatirId] = useState<number | null>(null);
  const [partiId, setPartiId] = useState<number | null>(null);
  const proje = secenekler.projeler.find((p) => p.id === projeId);
  const satirSorulur = proje !== undefined && proje.satirlar.length > 1;
  const satir = satirSorulur ? proje.satirlar.find((x) => x.id === satirId) : proje?.satirlar[0];
  const partiler = satir?.partiler ?? [];
  const parti = partiler.find((x) => x.id === partiId);
  const hazir = proje !== undefined && (!satirSorulur || satirId !== null);
  const sec = () => {
    if (proje === undefined) return;
    // Parti satırına bağlıdır: tek satırda da satır açıkça gider ki sunucu partiyi o satırda arasın.
    if (parti !== undefined && satir !== undefined) bitir({ projeId: proje.id, siparisSatiriId: satir.id, parti: { id: parti.id, emirTuru: parti.emirTuru } });
    else bitir({ projeId: proje.id, siparisSatiriId: satirSorulur ? satirId : null });
  };
  const vazgec = () => { bitir(null); };
  return (
    <Pencere
      acik
      kapat={vazgec}
      baslik="Üretim emri için proje"
      alt={(
        <>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={!hazir} onClick={sec}>
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
              <input type="radio" name="emir-proje" checked={p.id === projeId} onChange={() => { setProjeId(p.id); setSatirId(null); setPartiId(null); }} />
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
                <input type="radio" name="emir-satir" checked={s.id === satirId} onChange={() => { setSatirId(s.id); setPartiId(null); }} />
                <strong>{s.siparisNo} / satır {s.satirNo}</strong>
                <span>{s.adet} adet · termin {terminYazisi(s.termin)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {partiler.length > 0 && (
          <fieldset className="tc-rr-secenekler">
            <legend>Üretim çeşidi</legend>
            <label className="tc-rr-secenek">
              <input type="radio" name="emir-parti" checked={partiId === null} onChange={() => { setPartiId(null); }} />
              <strong>Parti seçmeden</strong>
              <span>Emir türü formdaki gibi kalır</span>
            </label>
            {partiler.map((x) => (
              <label key={x.id} className="tc-rr-secenek">
                <input type="radio" name="emir-parti" checked={x.id === partiId} onChange={() => { setPartiId(x.id); }} />
                <strong>{`${adetYazisi(x.adet)} ${EMIR_TURU_ADLARI[x.emirTuru]}`}</strong>
                <span>Emir türü partiden gelir</span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Pencere>
  );
}
