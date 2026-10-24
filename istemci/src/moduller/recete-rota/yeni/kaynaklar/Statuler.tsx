import { useState } from 'react';
import { Dugme, OnayPenceresi, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import type { RrDurumu } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import { STATU_RENKLERI, STATU_TURLERI } from './kurallar.ts';
import { SatirGirdisi, useR2Komutu } from './parcalar.tsx';

// Statü tanımı uçları (durum.statuses, statu-tanimi-kaydet ve -sil) yalnız bu dosyadadır: statü işi (256) değişirse tek yer değişir.
type Statu = NonNullable<RrDurumu['statuses']>[number];

// Elle tanımlanan statüler (karantina, giriş onaylı, ret gibi): Reçete ve Rota'nın kendi tablosu, recete-rota.yaz ile. Sürüm satırdan gider.
export function Statuler({ durum, yetki }: { durum: RrDurumu; yetki: RrYetkisi }) {
  const { calistir, mesgul } = useR2Komutu();
  const [silinecek, silinecekYaz] = useState<Statu | null>(null);
  if (durum.statuses === undefined) return null;
  const liste = durum.statuses;
  const kaydet = async (s: Statu, yama: Partial<Pick<Statu, 'code' | 'name' | 'kind' | 'color'>>): Promise<boolean> => {
    const y = { ...s, ...yama };
    return (await calistir('statu-tanimi-kaydet', { id: s.id, code: y.code, name: y.name, kind: y.kind, color: y.color, beklenenSurum: s.surum })) === null;
  };
  const ekle = () => {
    let n = liste.length + 1;
    while (liste.some((x) => x.id === `S${String(n)}`)) n += 1;
    const kod = `S${String(n)}`;
    void calistir('statu-tanimi-kaydet', {
      id: kod, code: kod, name: 'Yeni statü', kind: 'uretim', color: STATU_RENKLERI[n % STATU_RENKLERI.length], beklenenSurum: null,
    }, { basari: 'Statü eklendi.' });
  };
  const sutunlar: Sutun<Statu>[] = [
    {
      anahtar: 'kod', baslik: 'Kod', kirilmaz: true,
      hucre: (s) => (yetki.yaz ? <SatirGirdisi deger={s.code} etiket="Statü kodu" kaydet={(v) => kaydet(s, { code: v.trim() })} /> : s.code),
    },
    {
      anahtar: 'ad', baslik: 'Ad',
      hucre: (s) => (yetki.yaz ? <SatirGirdisi deger={s.name} etiket="Statü adı" kaydet={(v) => kaydet(s, { name: v.trim() })} /> : s.name),
    },
    {
      anahtar: 'tur', baslik: 'Tür',
      hucre: (s) => (yetki.yaz
        ? (
          <select
            className="tc-alan-kutu tc-rr2-girdi" value={s.kind} disabled={mesgul} aria-label="Statü türü"
            onChange={(o) => { void kaydet(s, { kind: o.target.value as Statu['kind'] }); }}
          >
            {STATU_TURLERI.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
          </select>
        )
        : STATU_TURLERI.find(([k]) => k === s.kind)?.[1] ?? s.kind),
    },
    {
      anahtar: 'renk', baslik: 'Renk', csv: (s) => s.color,
      hucre: (s) => (yetki.yaz
        ? <input type="color" className="tc-rr2-renk" value={s.color} disabled={mesgul} aria-label="Renk" onChange={(o) => { void kaydet(s, { color: o.target.value }); }} />
        : s.color),
    },
    {
      anahtar: 'eylem', baslik: 'Eylem', csv: false,
      hucre: (s) => (yetki.yaz ? <Dugme simge="trash" aria-label={`${s.code} statüsünü sil`} onClick={() => silinecekYaz(s)} /> : null),
    },
  ];
  return (
    <section className="tc-rr2-grup" aria-label="Statüler">
      <h3 className="tc-rr2-grup-baslik"><span>Statüler</span></h3>
      <p className="tc-rr2-not">
        Operasyon statüleri otomatiktir: bir adımdan çıkan malzeme o adımın numarasını taşır ve sonraki adım onu bu statüde tüketir. Rotanın son adımının
        çıktısı normal stoktur. Burada yalnızca operasyona bağlı olmayan statüleri tanımla: karantina, giriş onaylı, kalite bekliyor, ret gibi.
      </p>
      <Tablo<Statu> etiket="Statü tanımları" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(s) => s.id} bosMesaj="Elle tanımlanan statü yok." />
      {yetki.yaz && <div className="tc-rr2-arac"><Dugme simge="plus" disabled={mesgul} onClick={ekle}>Statü</Dugme></div>}
      <OnayPenceresi
        acik={silinecek !== null} baslik="Statü silinsin mi?" onayMetni="Sil" tehlikeli yukleniyor={mesgul}
        vazgec={() => silinecekYaz(null)}
        onayla={() => {
          const s = silinecek;
          silinecekYaz(null);
          if (s) void calistir('statu-tanimi-sil', { id: s.id, beklenenSurum: s.surum }, { basari: 'Statü silindi.' });
        }}
      >
        <p>{silinecek ? `${silinecek.code} ${silinecek.name}` : ''} silinir.</p>
      </OnayPenceresi>
    </section>
  );
}
