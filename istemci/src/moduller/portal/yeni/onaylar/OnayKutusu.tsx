import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DurumKutusu, SayfaBasligi, SayiKarti, Sekmeler } from '../../../../ortak/arayuz/index.ts';
import { para, sayi } from '../bicim.ts';
import { degerler, onayKurallari, onaylayabilirMi, type Onaylayan } from '../kurallar.ts';
import { sahibi } from '../sahibinde.tsx';
import type { GorunumOzellikleri } from '../sekmeler.ts';
import type { Onay, OnayKurallari } from '../tipler.ts';
import { usePortal, usePortalDeposu } from '../veri.ts';
import { ONAY_KOLEKSIYONLARI, OnayKarti } from './OnayAyrintisi.tsx';
import './onaylar.css';

// Onay kutusu (prototip approvalsView): dört sayı, dört süzgeç sekmesi ve onay kartları; yanda geçerli onay kuralları.

export type Suzgec = 'mine' | 'requested' | 'pending' | 'all';

export const SUZGECLER: readonly (readonly [Suzgec, string])[] = [
  ['mine', 'Onayımı bekleyen'], ['requested', 'Benim taleplerim'], ['pending', 'Tüm bekleyenler'], ['all', 'Tümü'],
];

export function suzgecUyar(s: Suzgec, a: Onay, kisi: Onaylayan): boolean {
  switch (s) {
    case 'mine': return onaylayabilirMi(a, kisi);
    case 'requested': return a.requestedBy === kisi.id;
    case 'pending': return a.status === 'pending';
    case 'all': return true;
  }
}

// Karara bağlanmış onayların açılıştan son adıma kadar geçen ortalama süresi (saat); karar yoksa null.
export function ortalamaOnaySuresi(liste: readonly Onay[]): number | null {
  const sureler = liste.filter((a) => a.status !== 'pending').flatMap((a) => {
    const son = a.steps.flatMap((s) => (s.at ? [s.at] : [])).sort().pop();
    return son ? [(new Date(son).getTime() - new Date(a.at).getTime()) / 36e5] : [];
  });
  return sureler.length ? sureler.reduce((t, x) => t + x, 0) / sureler.length : null;
}

const limit = (n: number | undefined): string => (n === undefined ? '(limit tanımsız)' : para(n));

export function kuralSatirlari(R: OnayKurallari): readonly (readonly [string, string])[] {
  return [
    [`Satın alma siparişi ${limit(R.poMgr)} üstü`, `Satın alma müdürü; ${limit(R.poGM)} üstü ayrıca Genel müdür`],
    [`Tedarikçi ödemesi ${para(R.payFin)} üstü`, 'Finans müdürü'],
    [`Teklifte %${sayi(R.discMgr)} üstü iskonto`, 'Satış müdürü'],
    [`Tedarikçi fiyat artışı %${sayi(R.priceMgr)} üstü`, 'Satın alma müdürü'],
    ['Çerçeve sözleşme', `Satış veya satın alma müdürü; ${para(R.contractGM)} üstü ayrıca Genel müdür`],
    ['IBAN değişikliği (her zaman)', 'Muhasebe, ardından Finans müdürü'],
  ];
}

export function OnayKutusu(_: GorunumOzellikleri) {
  const p = usePortal();
  const { depo, yukleniyor, hata, yenile } = usePortalDeposu(ONAY_KOLEKSIYONLARI);
  const [suzgec, setSuzgec] = useState<Suzgec>('mine');
  const hepsi = useMemo(() => degerler(depo.approvals).sort((a, b) => b.at.localeCompare(a.at)), [depo.approvals]);

  if (yukleniyor) return <DurumKutusu durum="yukleniyor" mesaj="Onaylar yükleniyor…" />;
  if (hata) return <DurumKutusu durum="hata" mesaj="Onaylar okunamadı." yenile={yenile} />;

  const kisi = p.onaylayan;
  const liste = hepsi.filter((a) => suzgecUyar(suzgec, a, kisi));
  const bekleyenim = hepsi.filter((a) => onaylayabilirMi(a, kisi)).length;
  const ortalama = ortalamaOnaySuresi(hepsi);
  const R = onayKurallari(depo);
  const ad = p.kullanici?.name ?? p.ben.kisi.ad;
  const rol = p.kullanici?.role ?? '';

  return (
    <div className="tc-pt-onaylar">
      <SayfaBasligi
        baslik="Onay kutum" simge="check"
        alt={`${ad}${rol ? `, ${rol}` : ''}. Kendi talebinizi onaylayamazsınız; Genel müdür her adımı onaylayabilir.`}
      />
      <div className="tc-pt-sayilar">
        <SayiKarti baslik="Onayınızı bekleyen" simge="check" sayi={bekleyenim} ton="uyari" />
        <SayiKarti baslik="Toplam bekleyen" simge="clock" sayi={hepsi.filter((a) => a.status === 'pending').length} />
        <SayiKarti baslik="Ortalama onay süresi" simge="clock" metin={ortalama === null ? '—' : `${sayi(ortalama, 1)} sa`} />
        <SayiKarti baslik="Reddedilen" simge="x" sayi={hepsi.filter((a) => a.status === 'rejected').length} />
      </div>
      <div className="tc-pt-izgara">
        <section className="tc-pt-onaylar-liste" aria-label="Onaylar">
          <Sekmeler
            etiket="Onay süzgeci"
            sekmeler={SUZGECLER.map(([k, l]) => {
              const n = hepsi.filter((a) => suzgecUyar(k, a, kisi)).length;
              return { anahtar: k, baslik: n ? `${l} (${String(n)})` : l };
            })}
            secili={suzgec}
            sec={setSuzgec}
          />
          <div className="tc-pt-pano">
            {liste.length === 0 ? <p className="tc-pt-bos">Bu listede onay yok.</p>
              : liste.map((a) => <OnayKarti key={a.id} a={a} depo={depo} />)}
          </div>
        </section>
        <aside className="tc-pt-pano" aria-labelledby="tc-pt-onaylar-kurallar">
          <header className="tc-pt-pano-bas"><h3 id="tc-pt-onaylar-kurallar">Geçerli onay kuralları</h3></header>
          <ul className="tc-pt-onaylar-kurallar">
            {kuralSatirlari(R).map(([k, s]) => <li key={k}><span>{k}</span><small>{s}</small></li>)}
          </ul>
          {p.izin.var('admin') && <Link className="tc-pt-onaylar-ayar" to={sahibi('settings').yol}>Kuralları düzenle</Link>}
        </aside>
      </div>
    </div>
  );
}
