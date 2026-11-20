import { useState } from 'react';
import { Dugme, Pencere } from '../../../ortak/arayuz/index.ts';
import { TOPLU_DUZENLER, bolmeBaslangici, bolmeHatasi, type Birlesme, type TopluDuzen } from './teslim.ts';

// 3485 a: talep formunun "Teslimleri topla" denetimi. Düzen seçilir, kaç kalemin kaça ineceği düğmede yazar; uygulanınca form değişir,
// gönderilene kadar geri alınabilir (form yeniden doldurulur ya da "Teslimi böl"). Geniş ekranda düğmeler, dar ekranda seçim kutusu.
export function TeslimleriTopla({ kalemSayisi, plan, uygula }: {
  kalemSayisi: number; plan: (duzen: TopluDuzen, n: number) => Birlesme[]; uygula: (b: Birlesme[]) => void;
}) {
  const [duzen, duzenYaz] = useState<TopluDuzen>('haftalik');
  const [n, nYaz] = useState('3');
  const nSayi = Math.max(1, Math.min(366, Math.floor(Number(n)) || 1));
  const b = plan(duzen, nSayi);
  const sonra = kalemSayisi - b.reduce((t, x) => t + x.birlesenler.length, 0);
  return (
    <div className="sa-talep-topla" role="group" aria-label="Teslimleri topla">
      <span className="tc-alan-etiket">Teslimleri topla</span>
      <span className="sa-talep-topla-seg">
        {TOPLU_DUZENLER.map(([k, ad]) => (
          <button key={k} type="button" aria-pressed={duzen === k} onClick={() => duzenYaz(k)}>{ad}</button>
        ))}
      </span>
      <select className="tc-alan-kutu sa-talep-topla-sec" aria-label="Toplama düzeni" value={duzen} onChange={(e) => duzenYaz(e.target.value as TopluDuzen)}>
        {TOPLU_DUZENLER.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
      </select>
      {duzen === 'herN' && (
        <span className="sa-talep-topla-n">
          <input className="tc-alan-kutu sa-talep-sayi" type="number" min={1} max={366} aria-label="Gün sayısı" value={n} onChange={(e) => nYaz(e.target.value)} />
          <span className="sa-talep-not">günde bir</span>
        </span>
      )}
      <Dugme simge="layers" disabled={b.length === 0} onClick={() => uygula(b)}>
        {b.length === 0 ? 'Birleşecek kalem yok' : `Uygula (${String(kalemSayisi)} → ${String(sonra)} kalem)`}
      </Dugme>
      <span className="sa-talep-not">
        Aynı malzeme, birim, emir ve kabul sınırındaki kalemler dönem başına tek kaleme iner; termin dönemin ilk tarihi, miktar toplamdır.
        Toplama bölmez: ayırmak için kalemde "Teslimi böl".
      </span>
    </div>
  );
}

export interface BolunenSatir { termin: string; miktar: string }

// 3485 a: "Teslimi böl" penceresi. Kalem aynı malzemeyle tarih ve miktar satırlarına ayrılır; toplam tutmazsa bölünmez.
export function TeslimiBol({ ad, birim, toplam, termin, miktar, enCok, oku, kapat, bol }: {
  ad: string; birim: string; toplam: number; termin: string; miktar: string; enCok: number;
  oku: (m: string) => number | null; kapat: () => void; bol: (l: BolunenSatir[]) => void;
}) {
  const [satirlar, satirlarYaz] = useState<BolunenSatir[]>(() => bolmeBaslangici(termin, miktar));
  const hata = bolmeHatasi(toplam, satirlar.map((s) => ({ termin: s.termin, miktar: oku(s.miktar) })), birim);
  const girilen = satirlar.reduce((t, s) => t + (oku(s.miktar) ?? 0), 0);
  const sayi = (x: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
  const degistir = (i: number, d: Partial<BolunenSatir>) => satirlarYaz((l) => l.map((s, j) => (j === i ? { ...s, ...d } : s)));
  return (
    <Pencere acik kapat={kapat} baslik={`Teslimi böl: ${ad}`}
      alt={<>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="layers" disabled={hata !== null} onClick={() => bol(satirlar)}>{`Böl (${String(satirlar.length)} satır)`}</Dugme>
      </>}>
      <div className="sa-talep sa-talep-bol">
        <p className="sa-talep-not">Kalem aynı malzemeyle ayrı satırlara ayrılır; kart föyü, kabul sınırı, emir ve açıklama her satıra kopyalanır.</p>
        {satirlar.map((s, i) => (
          <div key={i} className="sa-talep-bol-satir">
            <input className="tc-alan-kutu" type="date" aria-label={`Teslim ${String(i + 1)} tarihi`} value={s.termin} onChange={(e) => degistir(i, { termin: e.target.value })} />
            <span className="sa-talep-bol-miktar">
              <input className="tc-alan-kutu sa-talep-sayi" inputMode="decimal" aria-label={`Teslim ${String(i + 1)} miktarı (${birim})`} placeholder="0" value={s.miktar}
                onChange={(e) => degistir(i, { miktar: e.target.value })} />
              <span className="sa-talep-not" aria-hidden="true">{birim}</span>
            </span>
            <Dugme simge="x" aria-label={`Teslim ${String(i + 1)}: kaldır`} disabled={satirlar.length <= 2}
              onClick={() => satirlarYaz((l) => l.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="sa-talep-bol-alt">
          <Dugme simge="plus" disabled={satirlar.length >= enCok} onClick={() => satirlarYaz((l) => [...l, { termin: l[l.length - 1]?.termin ?? termin, miktar: '' }])}>Teslim ekle</Dugme>
          <span>Toplam <b>{`${sayi(girilen)} / ${sayi(toplam)} ${birim}`}</b></span>
        </div>
        {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
