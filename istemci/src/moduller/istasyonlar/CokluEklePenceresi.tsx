import { useState, type ReactNode } from 'react';
import { Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { kodDizisi } from './tesis.ts';

const ONIZLEME = 12;
// Sözleşmedeki `COKLU_EN_COK` ile aynı: istemci zod taşıyan sözleşmeden değer ithal edemez.
const COKLU_EN_COK = 200;

// Çoklu ekle (kart #1296, kullanıcı kararı): ilk kod ve adetle kodlar üretilir (CNC-01..CNC-20), ad sıra numarasıyla çoğalır.
// Kullanılan kod önizlemede işaretlenir ve kayıt gitmez; sunucu yine de denetler ve hepsini ya da hiçbirini açar.
export function CokluEklePenceresi({ baslik, kodOnerisi, adOnerisi, kullanilan, hazir, mesgul, ret, kaydet, kapat, children }: {
  baslik: string;
  kodOnerisi: string;
  adOnerisi: string;
  kullanilan: ReadonlySet<string>;
  // Ortak alanlar (istasyon, iş merkezi, kapasite) eksikse kayıt gitmez.
  hazir: boolean;
  mesgul: boolean;
  ret: string | null;
  kaydet: (kayitlar: { kod: string; ad: string }[]) => void;
  kapat: () => void;
  children: ReactNode;
}) {
  const [ilk, ilkYaz] = useState(kodOnerisi);
  const [adet, adetYaz] = useState('10');
  const [ad, adYaz] = useState(adOnerisi);
  const sayi = Number(adet);
  const kodlar = sayi > COKLU_EN_COK ? null : kodDizisi(ilk, sayi);
  const cakisan = (kodlar ?? []).filter((k) => kullanilan.has(k));
  const kayitlar = (kodlar ?? []).map((kod, i) => ({ kod, ad: `${ad.trim()} ${i + 1}`.slice(0, 120) }));
  const gecerli = kodlar !== null && cakisan.length === 0 && ad.trim() !== '' && hazir;

  return (
    <Pencere acik baslik={baslik} kapat={kapat} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" yukleniyor={mesgul} disabled={!gecerli} onClick={() => kaydet(kayitlar)}>
          {kodlar ? `${kodlar.length} kayıt ekle` : 'Ekle'}
        </Dugme>
      </>
    )}>
      <div className="tc-ist-kutular">
        <div className="tc-ist-ata">
          <Girdi etiket="İlk kod" value={ilk} onChange={(o) => ilkYaz(o.target.value)} autoComplete="off" ipucu="Son sayı artar: CNC-01, CNC-02…" />
          <Girdi etiket="Adet" type="number" min={1} max={COKLU_EN_COK} value={adet} onChange={(o) => adetYaz(o.target.value)} />
        </div>
        <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} autoComplete="off" ipucu="Her kaydın adına sıra numarası eklenir." />
        {children}
      </div>
      <section aria-label="Önizleme" className="tc-ist-onizleme">
        {kodlar === null
          ? <p className="tc-ist-hata" role="alert">{`Kod üretilemedi: ilk kodu ve 1-${COKLU_EN_COK} arası adedi girin; kod en çok 24 karakter.`}</p>
          : (
            <div className="tc-ist-cipler">
              {kodlar.slice(0, ONIZLEME).map((k) => (
                <span key={k} className="tc-ist-cip" data-durum={kullanilan.has(k) ? 'ariza' : undefined}>
                  <span className="tc-ist-mono">{k}</span>{kullanilan.has(k) && ' kullanılıyor'}
                </span>
              ))}
              {kodlar.length > ONIZLEME && <small className="tc-ist-ipucu">ve {kodlar.length - ONIZLEME} kayıt daha, son kod {kodlar.at(-1)}</small>}
            </div>
          )}
        {cakisan.length > 0 && <p className="tc-ist-hata" role="alert">{cakisan.length} kod kullanılıyor; ilk kodu değiştirin.</p>}
        {ret && <p className="tc-ist-hata" role="alert">{ret}</p>}
      </section>
    </Pencere>
  );
}
