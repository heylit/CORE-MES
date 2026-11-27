import { useState } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { kmYenilePlani, type KmPlanFarki, type KmYenileSatiri } from './km-cizim.ts';
import { kmPaketAdi, useKmParcaVerisi, type KmTopluSonucu } from './KmTopluPenceresi.tsx';
import type { Pkg } from './tipler.ts';

// 3795: seçili taslakların Kalite Merkezi'ne bağsız planını Kalite Merkezi'nin planıyla değiştir. Önizleme zorunludur (paket başına eski ve
// yeni satır sayısı, değişen ölçüler); elle girilmiş plan yalnız kutu işaretlenince değişir; yayındaki paket atlanır. Kurallar km-cizim.ts'te,
// yazma Hazirlik.tsx'te.
interface Ozellikler {
  hedefler: readonly Pkg[] | null; kapat: () => void; uygula: (l: readonly KmYenileSatiri[]) => Promise<KmTopluSonucu>;
}

export function KmYenilePenceresi({ hedefler, kapat, uygula }: Ozellikler) {
  return hedefler === null ? null : <Icerik hedefler={hedefler} kapat={kapat} uygula={uygula} />;
}

const AZAMI_FARK = 8;
function Fark({ f }: { f: KmPlanFarki }) {
  const ozet = `${String(f.eski)} satır → ${String(f.yeni)} satır · ${f.degisen.length ? `${String(f.degisen.length)} ölçü değişir` : 'ölçüler aynı'}`;
  if (!f.degisen.length) return <small>{ozet}</small>;
  return (
    <details className="tc-ay2-yenile-fark">
      <summary>{ozet}</summary>
      <ul>
        {f.degisen.slice(0, AZAMI_FARK).map((d) => (
          <li key={d.no}><b>{d.no}</b> {d.once ?? 'yok'} → {d.sonra ?? 'kalkar'}</li>
        ))}
        {f.degisen.length > AZAMI_FARK ? <li>+{f.degisen.length - AZAMI_FARK} ölçü daha</li> : null}
      </ul>
    </details>
  );
}

function Satir({ s }: { s: KmYenileSatiri }) {
  return (
    <li className="tc-ay2-yenile-satir">
      <span>{kmPaketAdi(s.hedef)} ← {s.resim!.ad}{s.resim!.revizyon ? ` Rev ${s.resim!.revizyon}` : ''}</span>
      {s.fark ? <Fark f={s.fark} /> : null}
    </li>
  );
}

function Icerik({ hedefler, kapat, uygula }: { hedefler: readonly Pkg[]; kapat: () => void; uygula: Ozellikler['uygula'] }) {
  const { veri, yetkisiz } = useKmParcaVerisi(hedefler);
  const [mesgul, mesgulYaz] = useState(false);
  const [elleOnay, elleOnayYaz] = useState(false);
  const [sonuc, sonucYaz] = useState<KmTopluSonucu | null>(null);
  const satirlar = kmYenilePlani(hedefler, veri);
  const hazir = satirlar.filter((x) => x.resim !== null && !x.elle);
  const elle = satirlar.filter((x) => x.resim !== null && x.elle);
  const atlanan = satirlar.filter((x) => x.resim === null);
  const yenilenecek = elleOnay ? [...hazir, ...elle] : hazir;
  const bekliyor = [...veri.values()].includes('bekliyor');
  const calistir = async () => {
    mesgulYaz(true);
    try { sonucYaz(await uygula(yenilenecek)); } finally { mesgulYaz(false); }
  };
  const bosNedeni = yenilenecek.length === 0 ? (bekliyor ? 'Kalite Merkezi okunuyor' : elle.length ? 'Elle girilmiş planlar için onay verin' : 'Yenilenecek paket yok') : null;
  return (
    <Pencere
      acik kapat={mesgul ? () => undefined : kapat} baslik={`${String(hedefler.length)} paketi Kalite Merkezi’nden yenile`}
      alt={(
        <>
          <Dugme tur="ikincil" disabled={mesgul} onClick={kapat}>{sonuc ? 'Kapat' : 'Vazgeç'}</Dugme>
          {sonuc ? null : (
            <Dugme tur="birincil" simge="rotate" yukleniyor={mesgul} disabled={bosNedeni !== null} onClick={() => { void calistir(); }}>
              {bosNedeni ?? `${String(yenilenecek.length)} paketin planını değiştir`}
            </Dugme>
          )}
        </>
      )}
    >
      <div className="tc-ay2-toplu-ic">
        {sonuc ? (
          <section className="tc-ay2-toplu-grup" aria-label="Sonuç" role="status">
            <h3 data-ton={sonuc.hatalar.length ? 'hold' : 'run'}><Simge ad={sonuc.hatalar.length ? 'alert' : 'check'} boyut="k" />
              {sonuc.hatalar.length ? `${String(sonuc.doldu)} paket yenilendi, ${String(sonuc.hatalar.length)} paket yenilenemedi` : `${String(sonuc.doldu)} paket yenilendi`}
            </h3>
            {sonuc.hatalar.length ? <ul>{sonuc.hatalar.map((h) => <li key={h.paket}>{h.paket} · {h.neden}</li>)}</ul> : null}
          </section>
        ) : (
          <>
            {yetkisiz ? <p className="tc-ay2-takip-uyari tc-ay2-toplu-sil"><Simge ad="lock" boyut="k" /><span>Kalite Merkezi’ni okuma yetkin yok; planlar yenilenemez.</span></p> : null}
            {hazir.length ? (
              <section className="tc-ay2-toplu-grup" aria-label="Yenilenecek">
                <h3 data-ton="run"><Simge ad="rotate" boyut="k" />Yenilenecek<b>{hazir.length}</b></h3>
                <ul className="tc-ay2-yenile-liste">{hazir.map((s) => <Satir key={s.hedef.id} s={s} />)}</ul>
              </section>
            ) : null}
            {elle.length ? (
              <section className="tc-ay2-toplu-grup" aria-label="Elle girilmiş plan">
                <h3 data-ton="hold"><Simge ad="edit" boyut="k" />Elle girilmiş plan<b>{elle.length}</b></h3>
                <ul className="tc-ay2-yenile-liste">{elle.map((s) => <Satir key={s.hedef.id} s={s} />)}</ul>
                <label className="tc-ay2-toplu-kutu">
                  <input type="checkbox" checked={elleOnay} onChange={(o) => elleOnayYaz(o.target.checked)} />
                  <span>Elle girilmiş {elle.length} planı da değiştir<small>Kişinin bilerek girdiği ölçüler silinir; Kalite Merkezi’nin balonları gelir.</small></span>
                </label>
              </section>
            ) : null}
            {atlanan.length ? (
              <section className="tc-ay2-toplu-grup" aria-label="Atlanacak">
                <h3 data-ton="idle"><Simge ad="x" boyut="k" />Atlanacak<b>{atlanan.length}</b></h3>
                <ul>{atlanan.map(({ hedef, neden }) => <li key={hedef.id}>{kmPaketAdi(hedef)} · {neden}</li>)}</ul>
              </section>
            ) : null}
            <p className="tc-ay2-soluk tc-ay2-toplu-not">Yalnız taslak ve Kalite Merkezi’ne bağlı olmayan planlar değişir; plan adıma bağlı balon grubuna göre gelir, bağsız plana yazılmış numune kuralları silinir. Paketler taslak kalır; terminale gitmez.</p>
          </>
        )}
      </div>
    </Pencere>
  );
}
