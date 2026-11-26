import { useState } from 'react';
import { AramaliSecim, Dugme, Girdi, Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import type { EmirTakimListesi, EmirTakimSatiri, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { LISTE_DURUMU_ADI, LISTE_DURUMU_TONU } from './gosterim.ts';
import './takimhane.css';

const SUTUNLAR: readonly Sutun<EmirTakimSatiri>[] = [
  { anahtar: 'cep', baslik: 'Cep', mono: true, kirilmaz: true, hucre: (s) => s.cep },
  { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (s) => s.kod },
  { anahtar: 'ad', baslik: 'Takım', hucre: (s) => s.ad },
  { anahtar: 'adet', baslik: 'Adet', mono: true, hizala: 'sag', hucre: (s) => s.adet },
  {
    anahtar: 'durum', baslik: 'Durum', kartTamSatir: true,
    hucre: (s) => <Rozet ton={LISTE_DURUMU_TONU[s.durum]}>{s.durum === 'eksik' ? `${LISTE_DURUMU_ADI.eksik}: ${s.eksik} adet` : LISTE_DURUMU_ADI[s.durum]}</Rozet>,
  },
];

// Emrin takım listesi; eksik takım emir başlamadan görünür. Yalnız uyarır, başlatmayı engellemez.
export function EmirTakimlari({ liste }: { liste: EmirTakimListesi }) {
  // Eksik takımlar üstte; başlıktaki çip hangi cepte olduğunu da söyler.
  const eksikler = liste.satirlar.filter((s) => s.durum === 'eksik');
  const eksik = eksikler.length;
  const sirali = [...eksikler, ...liste.satirlar.filter((s) => s.durum !== 'eksik')];
  return (
    <section className="tc-tkm-emir" aria-label={`${liste.emirNo} takım listesi`}>
      <header className="tc-tkm-emir-ust">
        <div className="tc-tkm-emir-ad">
          <span className="mono">{liste.emirNo}</span>
          <span className="tc-tkm-soluk">{liste.parca} · {liste.istasyon}</span>
        </div>
        {liste.hazir
          ? <Rozet ton="tamam">Takım hazır</Rozet>
          : <Rozet ton={eksik > 0 ? 'hata' : 'uyari'}>{eksik > 0 ? `${eksikler.map((e) => e.cep).join(', ')} eksik` : 'Takım hazırlanıyor'}</Rozet>}
      </header>
      <IkiGorunum
        masa={<Tablo etiket="Emrin takımları" sutunlar={SUTUNLAR} satirlar={sirali} satirAnahtari={(s) => `${s.cep}-${s.kod}`} />}
        kompakt={(
          <KompaktListe
            etiket="Emrin takımları" satirlar={sirali} satirAnahtari={(s) => `${s.cep}-${s.kod}`}
            baslik={(s) => s.ad} sag={(s) => `${String(s.adet)} adet`} alt={(s) => `${s.cep} · ${s.kod}`}
            ek={(s) => <Rozet ton={LISTE_DURUMU_TONU[s.durum]}>{s.durum === 'eksik' ? `${LISTE_DURUMU_ADI.eksik}: ${String(s.eksik)} adet` : LISTE_DURUMU_ADI[s.durum]}</Rozet>}
          />
        )}
      />
      {!liste.hazir && eksik > 0 && <p className="tc-tkm-uyari"><Simge ad="alert" boyut="k" />Eksik takım, emir başlamadan önce takımhaneden istenmeli.</p>}
    </section>
  );
}

interface DuzenSatiri { anahtar: number; cep: string; kartKimlik: string; adet: string }
let sayac = 0;
const yeniSatir = (s?: Partial<DuzenSatiri>): DuzenSatiri => { sayac += 1; return { anahtar: sayac, cep: '', kartKimlik: '', adet: '1', ...s }; };

// Emrin takım listesi düzenleme (3677, 3762 içinde): cep, kalem, adet. Kalem seçici yalnız aktif kartlı kütüphane kalemlerini gösterir;
// kartı olmayan kalem önce açılışla stoğa girer.
export function EmirTakimDuzenleyici({ liste, takimlar, kaydet, vazgec, mesgul }: {
  liste: EmirTakimListesi;
  takimlar: readonly TakimSatiri[];
  kaydet: (satirlar: { cep: string; kartKimlik: number; adet: number }[]) => void;
  vazgec: () => void;
  mesgul: boolean;
}) {
  const kodla = new Map(takimlar.map((t) => [t.kod, t.kartKimlik]));
  const [satirlar, satirlarYaz] = useState<DuzenSatiri[]>(() => (liste.satirlar.length === 0 ? [yeniSatir({ cep: 'T1' })]
    : liste.satirlar.map((s) => yeniSatir({ cep: s.cep, kartKimlik: String(kodla.get(s.kod) ?? ''), adet: String(s.adet) }))));
  const secenekler = takimlar.filter((t) => t.kartDurumu === 'aktif').map((t) => ({ deger: String(t.kartKimlik), baslik: t.ad, alt: t.kod }));
  const degistir = (anahtar: number, d: Partial<DuzenSatiri>) => { satirlarYaz((l) => l.map((s) => (s.anahtar === anahtar ? { ...s, ...d } : s))); };
  const gecerli = satirlar.every((s) => s.cep.trim() !== '' && s.kartKimlik !== '' && Number.isInteger(Number(s.adet)) && Number(s.adet) >= 1);
  return (
    <div className="tc-tkm-duzen">
      {satirlar.map((s) => (
        <div key={s.anahtar} className="tc-tkm-duzen-satir">
          <Girdi etiket="Cep" value={s.cep} maxLength={12} onChange={(e) => { degistir(s.anahtar, { cep: e.target.value }); }} />
          <AramaliSecim etiket="Kütüphane kalemi" secenekler={secenekler} deger={s.kartKimlik} sec={(v) => { degistir(s.anahtar, { kartKimlik: v }); }} yerTutucu="Kalem seçin" />
          <Girdi etiket="Adet" type="number" inputMode="numeric" min={1} value={s.adet} onChange={(e) => { degistir(s.anahtar, { adet: e.target.value }); }} />
          <Dugme simge="x" aria-label={`${s.cep || 'Satırı'} sil`} onClick={() => { satirlarYaz((l) => l.filter((x) => x.anahtar !== s.anahtar)); }}>Sil</Dugme>
        </div>
      ))}
      <div className="tc-tkm-eylemler tc-tkm-sola">
        <Dugme simge="plus" onClick={() => { satirlarYaz((l) => [...l, yeniSatir({ cep: `T${String(l.length + 1)}` })]); }}>Satır ekle</Dugme>
      </div>
      <p className="tc-tkm-soluk">Kartı olmayan kalem burada görünmez; önce Takımhane listesinden açılış girilir.</p>
      <div className="tc-tkm-eylemler tc-tkm-eylem-sebepli">
        {!gecerli && <p id="tkm-duzen-sebep" className="tc-tkm-soluk">Her satırda cep, kalem ve en az 1 adet olmalı.</p>}
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={!gecerli || mesgul} aria-describedby={gecerli ? undefined : 'tkm-duzen-sebep'}
          onClick={() => { kaydet(satirlar.map((s) => ({ cep: s.cep.trim(), kartKimlik: Number(s.kartKimlik), adet: Number(s.adet) }))); }}>Kaydet</Dugme>
      </div>
    </div>
  );
}
