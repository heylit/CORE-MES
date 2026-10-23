import { useId, type ReactNode } from 'react';
import { AcKapa, Dugme, GrupluSecim, Rozet, type SecimDugmesi } from '../../../../ortak/arayuz/index.ts';

export function BolumBasligi({ baslik, aciklama, eylem }: { baslik: string; aciklama?: ReactNode; eylem?: ReactNode }) {
  return (
    <div className="tc-ma-baslik">
      <div>
        <h3>{baslik}</h3>
        {aciklama && <p className="tc-ma-yardim">{aciklama}</p>}
      </div>
      {eylem}
    </div>
  );
}

export function Kutu({ baslik, children }: { baslik?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="tc-ma-kutu" aria-labelledby={baslik ? id : undefined}>
      {baslik && <h4 id={id}>{baslik}</h4>}
      {children}
    </section>
  );
}

// "12 kullanımda · 2 gizli · 1 eklendi"
export function Sayac({ kullanimda, gizli, eklendi }: { kullanimda: number; gizli: number; eklendi: number }) {
  return (
    <span className="tc-ma-sayac">
      <b>{kullanimda}</b> kullanımda
      {gizli > 0 && <> · <span className="tc-ma-sayac-gizli">{gizli} gizli</span></>}
      {eklendi > 0 && <> · <span className="tc-ma-sayac-ek">{eklendi} eklendi</span></>}
    </span>
  );
}

// Kullanımda / gizli anahtarı. Eklenen değer her zaman kullanımdadır (kilitli açık).
export function Kullan({ ad, acik, degistir, kilitli }: { ad: string; acik: boolean; degistir?: () => void; kilitli?: boolean }) {
  return (
    <AcKapa
      etiket={`${ad}: ${acik ? 'kullanımda, gizlemek için kapat' : 'gizli, kullanmak için aç'}`}
      acik={acik}
      degistir={() => degistir?.()}
      disabled={kilitli || !degistir}
    />
  );
}

// Tablo boş hücreye "yok" yazar; düğmesi olmayan işlem hücresi boş kalsın diye.
export const BosHucre = () => <span />;

export const EklendiIsareti = () => <Rozet ton="bilgi">eklendi</Rozet>;

export function YeniDugmesi({ acik, etiket, degistir }: { acik: boolean; etiket: string; degistir: () => void }) {
  return (
    <Dugme tur={acik ? 'ikincil' : 'birincil'} simge={acik ? 'x' : 'plus'} onClick={degistir}>
      {acik ? 'Vazgeç' : etiket}
    </Dugme>
  );
}

export function SilDugmesi({ ad, sil }: { ad: string; sil: () => void }) {
  return <Dugme tur="tehlike" simge="trash" aria-label={`${ad} sil`} title="Sil" onClick={sil} className="tc-ma-sil" />;
}

// Numaralı seçim satırları (1 Aile, 2 Sınıf ...) ve altında seçili yolun özeti.
export interface SeciciSatiri<D extends string> {
  anahtar: string;
  baslik: string;
  secenekler: readonly SecimDugmesi<D>[];
  secili: D | null;
  sec: (d: D) => void;
  bosMesaj?: string;
}

export function Secici<D extends string>({ satirlar, ozet }: { satirlar: readonly SeciciSatiri<D>[]; ozet?: ReactNode }) {
  return (
    <div className="tc-ma-secici">
      {satirlar.map((s, i) => (
        <GrupluSecim<D>
          key={s.anahtar}
          etiket={s.baslik}
          gruplar={[{ anahtar: s.anahtar, baslik: `${i + 1} ${s.baslik}`, secenekler: s.secenekler }]}
          secili={s.secili}
          sec={s.sec}
          bosMesaj={s.bosMesaj}
        />
      ))}
      {ozet && <p className="tc-ma-yol">{ozet}</p>}
    </div>
  );
}

// Basılı / basılı değil düğme takımı (yeni ailenin formları, yeni özelliğin aileleri).
export function CokluSecim({ etiket, secenekler, secili, degistir }: {
  etiket: string; secenekler: readonly { deger: string; baslik: string }[]; secili: readonly string[]; degistir: (l: string[]) => void;
}) {
  return (
    <div className="tc-ma-coklu" role="group" aria-label={etiket}>
      <span className="tc-ma-coklu-baslik">{etiket}</span>
      <div className="tc-ma-coklu-dugmeler">
        {secenekler.map((s) => {
          const basili = secili.includes(s.deger);
          return (
            <button
              key={s.deger} type="button" className="tc-ma-cip" aria-pressed={basili}
              onClick={() => degistir(basili ? secili.filter((x) => x !== s.deger) : [...secili, s.deger])}
            >
              {s.baslik}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function dosyaIndir(ad: string, metin: string, tur: string) {
  const adres = URL.createObjectURL(new Blob([metin], { type: tur }));
  const a = document.createElement('a');
  a.href = adres;
  a.download = ad;
  a.click();
  URL.revokeObjectURL(adres);
}
