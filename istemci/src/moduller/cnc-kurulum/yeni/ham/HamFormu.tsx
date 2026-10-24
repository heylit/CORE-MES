import type { ReactNode } from 'react';
import { Dugme, Girdi, IsaretKutusu, Secim } from '../../../../ortak/arayuz/index.ts';
import { fmt } from '../bicim.ts';
import type { IsMalzemesi } from '../veri/tipler.ts';
import type { HamAyar, HamTipi } from '../hesap/ham.ts';

// Ham Malzeme yan paneli: prototipin #stockForm'u. Alanlar ayni anahtarlarla state.stock'a yazilir (degeri girdinin metni).
export type HamEylemi = 'open' | 'sample' | 'rx' | 'ry' | 'rz' | 'minbox' | 'rreset';

interface Ozellikler {
  st: HamAyar;
  malzemeler: readonly IsMalzemesi[];
  seciliMalzeme: string;
  varsayilanRho: number | undefined;
  modelVar: boolean;
  mesaj: ReactNode;
  degistir: <K extends keyof HamAyar>(k: K, v: HamAyar[K]) => void;
  malzemeSec: (id: string) => void;
  eylem: (a: HamEylemi) => void;
  sonuc: ReactNode;
}

const TIPLER: { deger: HamTipi; baslik: string }[] = [
  { deger: 'block', baslik: 'Blok / plaka' }, { deger: 'bar', baslik: 'Yuvarlak çubuk' }, { deger: 'tube', baslik: 'Boru' },
];

const deger = (v: unknown): string => (v == null ? '' : String(v));

export function HamFormu({ st, malzemeler, seciliMalzeme, varsayilanRho, modelVar, mesaj, degistir, malzemeSec, eylem, sonuc }: Ozellikler) {
  const cubuk = st.type === 'bar' || st.type === 'tube';
  const sayi = (k: keyof HamAyar, etiket: string, ek: { step?: string; min?: string; placeholder?: string } = {}) => (
    <Girdi
      etiket={etiket} type="number" step={ek.step ?? '0.5'} min={ek.min ?? '0'} placeholder={ek.placeholder}
      value={deger(st[k])} onChange={(e) => { degistir(k, e.target.value as never); }}
    />
  );
  return (
    <div className="tc-ch-form">
      <div className="tc-ch-dugmeler">
        <Dugme tur="birincil" simge="upload" onClick={() => { eylem('open'); }}>STEP / STL yükle</Dugme>
        <Dugme simge="box" onClick={() => { eylem('sample'); }}>Örnek parça</Dugme>
      </div>
      {mesaj && <div className="tc-ch-mesaj" role="status">{mesaj}</div>}

      <h3 className="tc-ch-bolum">Parça yönü</h3>
      <div className="tc-ch-dugmeler tc-ch-sik">
        <Dugme simge="rotate" onClick={() => { eylem('rx'); }}>X 90°</Dugme>
        <Dugme simge="rotate" onClick={() => { eylem('ry'); }}>Y 90°</Dugme>
        <Dugme simge="rotate" onClick={() => { eylem('rz'); }}>Z 90°</Dugme>
        <Dugme simge="fit" onClick={() => { eylem('minbox'); }}>Minimum kutu</Dugme>
        <Dugme simge="rotate" onClick={() => { eylem('rreset'); }}>Sıfırla</Dugme>
      </div>

      <h3 className="tc-ch-bolum">Hammadde tipi</h3>
      <div className="tc-ch-segment" role="radiogroup" aria-label="Hammadde tipi">
        {TIPLER.map((t) => (
          <button
            key={t.deger} type="button" role="radio" aria-checked={st.type === t.deger}
            className={st.type === t.deger ? 'tc-ch-seg tc-ch-seg-secili' : 'tc-ch-seg'} onClick={() => { degistir('type', t.deger); }}
          >{t.baslik}</button>
        ))}
      </div>

      {!cubuk && (
        <>
          <IsaretKutusu etiket="Tüm yüzlerde aynı işleme payı" checked={st.uni} onChange={(e) => { degistir('uni', e.target.checked); }} />
          <div className="tc-ch-izgara3">
            {sayi('ax', 'Pay X (mm / yüz)')}
            {!st.uni && sayi('ay', 'Pay Y')}
            {!st.uni && sayi('az', 'Pay Z')}
          </div>
          <IsaretKutusu etiket="Z kalınlığını standart plakaya yuvarla" checked={st.plate} onChange={(e) => { degistir('plate', e.target.checked); }} />
        </>
      )}
      {cubuk && (
        <>
          <div className="tc-ch-izgara2">
            <Secim
              etiket="Torna ekseni" value={st.axis} onChange={(e) => { degistir('axis', e.target.value as HamAyar['axis']); }}
              secenekler={[{ deger: 'auto', baslik: 'Otomatik' }, { deger: 'x', baslik: 'X' }, { deger: 'y', baslik: 'Y' }, { deger: 'z', baslik: 'Z' }]}
            />
            {sayi('dAllow', 'Çap payı (mm / yüz)')}
            {sayi('face', 'Alın payı (mm / yüz)')}
            {sayi('cut', 'Kesme payı (mm)')}
          </div>
          <IsaretKutusu etiket="Standart çubuk çapına yuvarla" checked={st.barStd} onChange={(e) => { degistir('barStd', e.target.checked); }} />
          {st.type === 'tube' && (
            <div className="tc-ch-izgara3">
              {sayi('idAllow', 'İç çap payı (mm / yüz)', { placeholder: 'çap payı' })}
              {sayi('idStep', 'İç çap adımı (mm)', { min: '0.1' })}
              {sayi('idMan', 'İç çap (elle)', { step: '1', placeholder: 'otomatik' })}
            </div>
          )}
        </>
      )}
      <Secim
        etiket="Ölçü yuvarlama" value={deger(st.round)} onChange={(e) => { degistir('round', e.target.value); }}
        secenekler={[{ deger: '0', baslik: 'Yok (0,1 mm)' }, { deger: '1', baslik: '1 mm' }, { deger: '5', baslik: '5 mm' }, { deger: '10', baslik: '10 mm' }]}
      />

      <h3 className="tc-ch-bolum">Malzeme ve parti</h3>
      <div className="tc-ch-izgara2">
        <Secim
          etiket="Malzeme" value={seciliMalzeme} onChange={(e) => { malzemeSec(e.target.value); }}
          secenekler={malzemeler.map((m) => ({ deger: m.id, baslik: m.name + ' · ' + fmt(m.rho) + ' g/cm³' }))}
        />
        {sayi('rho', 'Yoğunluk g/cm³', { step: '0.01', placeholder: fmt(varsayilanRho) + ' (malzemeden)' })}
        {sayi('qty', 'Adet', { step: '1', min: '1' })}
        {sayi('price', 'Fiyat (TL/kg)', { step: '0.1', placeholder: 'isteğe bağlı' })}
      </div>

      {!modelVar && (
        <>
          <h3 className="tc-ch-bolum">Model yoksa: parça zarf ölçüsü</h3>
          <div className="tc-ch-izgara3">
            {sayi('mx', 'X (mm)', { step: '1' })}
            {sayi('my', 'Y (mm)', { step: '1' })}
            {sayi('mz', 'Z (mm)', { step: '1' })}
          </div>
          {sayi('mvol', 'Parça hacmi (cm³ — CAD\'den, isteğe bağlı)', { step: '1' })}
        </>
      )}

      <h3 className="tc-ch-bolum">Sonuç</h3>
      {sonuc}
    </div>
  );
}
