import { useMemo, useState } from 'react';
import { Girdi, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { IzTablosu } from '../GecmisPenceresi.tsx';
import { KOL_AD } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { IzKaydi, KmKoleksiyonu } from '../tipler.ts';
import '../gostergeler/k4.css';

export const IZ_SINIRI = 300;
const kolAdi = (c: string | undefined) => KOL_AD[c as KmKoleksiyonu] ?? c ?? '';

// Uygulamanın exportIz'i: eskiden yeniye, değişenler tek hücrede.
export function izCsvSatirlari(iz: readonly IzKaydi[]): string[][] {
  return [...iz].sort((a, b) => (a.t ?? '').localeCompare(b.t ?? '')).map((x) => [
    x.t ?? '', x.kim ?? '', x.rol ?? '', x.islem ?? '', kolAdi(x.col), x.no ?? '',
    (x.degisen ?? []).map((d) => `${d.alan}: ${d.eski} -> ${d.yeni}`).join(' | '), x.gerekce ?? '',
  ]);
}

export function DegisiklikIzi({ veri }: EkranOzellikleri) {
  const [aranan, arananYaz] = useState('');
  const [kim, kimYaz] = useState('');
  const [kol, kolYaz] = useState('');
  const kisiler = useMemo(() => [...new Set(veri.iz.map((x) => x.kim ?? ''))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr')), [veri.iz]);
  const turler = useMemo(() => [...new Set(veri.iz.map((x) => x.col ?? ''))].filter(Boolean), [veri.iz]);
  const L = useMemo(() => {
    let l = [...veri.iz].sort((a, b) => (b.t ?? '').localeCompare(a.t ?? ''));
    if (kim) l = l.filter((x) => x.kim === kim);
    if (kol) l = l.filter((x) => x.col === kol);
    const q = aranan.trim().toLocaleLowerCase('tr');
    if (q) l = l.filter((x) => JSON.stringify(x).toLocaleLowerCase('tr').includes(q));
    return l;
  }, [veri.iz, kim, kol, aranan]);

  return (
    <div className="tc-km4">
      <SayfaBasligi
        baslik="Değişiklik izi"
        simge="clock"
        alt="Kim, neyi, ne zaman değiştirdi. Kayıtlar oluşturma, değişiklik, silme, onay, kilit açma ve oturum işlemlerini kapsar."
        birincil={{
          etiket: 'CSV indir', simge: 'download', pasif: !veri.iz.length,
          yap: () => csvIndir('degisiklik_izi', ['Zaman', 'Kim', 'Rol', 'İşlem', 'Kayıt türü', 'Kayıt', 'Değişenler', 'Gerekçe'], izCsvSatirlari(veri.iz)),
        }}
      />
      <div className="tc-km-not tc-km-not-iyi"><p>Yerel sunucu modu: iz kayıtları sunucuda yalnızca eklenebilir; silinemez ve sonradan değiştirilemez.</p></div>
      <div className="tc-km4-form">
        <Girdi etiket="Ara" type="search" placeholder="Kayıt no, alan veya değer ara" value={aranan} onChange={(o) => arananYaz(o.target.value)} />
        <Secim etiket="Kişi" value={kim} onChange={(o) => kimYaz(o.target.value)} secenekler={[{ deger: '', baslik: 'Tüm kişiler' }, ...kisiler.map((k) => ({ deger: k, baslik: k }))]} />
        <Secim etiket="Kayıt türü" value={kol} onChange={(o) => kolYaz(o.target.value)} secenekler={[{ deger: '', baslik: 'Tüm kayıt türleri' }, ...turler.map((c) => ({ deger: c, baslik: kolAdi(c) }))]} />
        <p className="tc-km-soluk">{L.length} iz</p>
      </div>
      {L.length
        ? (
          <>
            <IzTablosu satirlar={L.slice(0, IZ_SINIRI)} />
            {L.length > IZ_SINIRI && <p className="tc-km-soluk">İlk {IZ_SINIRI} iz gösteriliyor; CSV ile tamamını alabilirsiniz.</p>}
          </>
        )
        : <p className="tc-km4-veri-yok"><b>Henüz iz yok.</b> Kayıt oluşturulup değiştirildikçe burada görünür.</p>}
    </div>
  );
}

export const DegisiklikIziSayaci: KmSayaci = null;
