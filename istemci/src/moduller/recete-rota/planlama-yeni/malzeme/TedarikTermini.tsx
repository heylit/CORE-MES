import { useState } from 'react';
import { Kart, Rozet, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../../ortak/veri/istek-kimligi.ts';
import type { PlanVerisi } from '../tipler.ts';
import { DURUM_ADI, DURUM_TONU, gunYaz, tedarikTerminiSatirlari, type AlimPlaniSatiri, type TedarikTerminiSatiri } from './kurallar.ts';

// 533 a, 534 1 a: malzeme başına tedarik termini; planlamada da Satın Alma'da da aynı satır. Kayıt Satın Alma'nındır (sahibinin ucuna
// yazılır); plan girilen termini o günün 08:00'inde geliş sayar, termini girilmemiş malzemeyi olması gereken tarihte gelmiş sayar (554 a).
// Satın almayı ya da planı yazan girer (yazar; ekran yalnız gizler, sunucu aynısını denetler).
const YOL = '/satin-alma-tedarik-terminleri/kaydet';

const hataMetni = (h: unknown): string => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Termin kaydedilemedi; yeniden deneyin.');

function TerminGirdisi({ x, yenile }: { x: TedarikTerminiSatiri; yenile: () => void }) {
  const { bildir } = useBildirim();
  const [mesgul, mesgulYaz] = useState(false);
  const kaydet = (termin: string) => {
    if (x.malzemeNo === null || termin === (x.termin ?? '')) return;
    mesgulYaz(true);
    const govde = { malzemeNo: x.malzemeNo, termin: termin === '' ? null : termin, aciklama: x.aciklama, surum: x.surum };
    tekrarKorumaliGonder((d) => api.post<unknown>(YOL, govde, d)).then(
      () => { bildir('tamam', termin === '' ? `${x.kod} termini kaldırıldı.` : `${x.kod} termini kaydedildi.`); },
      (h: unknown) => { bildir('hata', hataMetni(h)); },
    ).finally(() => { mesgulYaz(false); yenile(); });
  };
  return (
    <input
      className="tc-alan-kutu tc-pys-tarih" type="date" defaultValue={x.termin ?? ''} disabled={mesgul} aria-label={`${x.kod} tedarik termini`}
      onChange={(e) => { kaydet(e.target.value); }}
    />
  );
}

export function TedarikTerminiKarti({ D, l, taban, yazar, yenile }: {
  D: PlanVerisi; l: readonly AlimPlaniSatiri[]; taban: number; yazar: boolean; yenile: () => void;
}) {
  const satirlar = tedarikTerminiSatirlari(D, l);
  const sut: Sutun<TedarikTerminiSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (x) => <><b className="mono">{x.kod}</b> <span className="tc-pyz-kucuk">{x.ad}</span></> },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <Rozet ton={DURUM_TONU[x.durum]}>{DURUM_ADI[x.durum]}</Rozet> },
    { anahtar: 'gerekli', baslik: 'Olması gereken', kirilmaz: true, hucre: (x) => (x.gerekli === null ? '—' : <span className="mono">{gunYaz(taban, x.gerekli)}</span>) },
    {
      anahtar: 'termin', baslik: 'Tedarik termini', kirilmaz: true,
      hucre: (x) => (yazar && x.malzemeNo !== null
        ? <TerminGirdisi key={`${x.kod}|${x.surum ?? 0}|${x.termin ?? ''}`} x={x} yenile={yenile} />
        : <span className="mono">{x.termin === null ? 'bekleniyor' : `${x.termin.slice(8, 10)}.${x.termin.slice(5, 7)}.${x.termin.slice(0, 4)}`}</span>),
    },
    { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (x) => x.aciklama || '—' },
    { anahtar: 'isler', baslik: 'Siparişler', hucre: (x) => <span className="mono">{x.isler.join(', ')}</span> },
  ];
  return (
    <Kart baslik="Tedarik terminleri" simge="flag">
      <Tablo etiket="Tedarik terminleri" sutunlar={sut} satirlar={satirlar} satirAnahtari={(x) => x.kod} bosMesaj="Satın alma gerektiren malzeme yok." />
      <p className="tc-pyz-kucuk">
        Termin malzeme başınadır ve Satın Alma'daki kayıtla aynıdır; girildiği an plan o günü kullanır, geç kalırsa katı kipte iş bekler. Termini girilmemiş
        malzeme olması gereken tarihte gelmiş sayılır, iş kaymaz.
      </p>
    </Kart>
  );
}
