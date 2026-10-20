import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sayiYaz, type MakineDurumu } from './durum.ts';
import './kadran.css';

interface Ozellikler {
  // Sayı henüz girilmediyse null: sıfır uydurulmaz, ortada tire durur ve halka boş kalır.
  deger: number | null;
  // Hedef bilinmiyorsa null: yüzde ve kalan uydurulmaz, halka boş kalır.
  hedef: number | null;
  etiket?: string;
  birim?: string;
  // Verilmezse renk üstteki data-durum'dan gelir.
  durum?: MakineDurumu;
  dokun?: () => void;
  dokunEtiketi?: string;
  sol?: ReactNode;
  sag?: ReactNode;
}

const CIZGI_SAYISI = 120;
const MERKEZ = 220;
const YARICAP = 180;
const CEVRE = 2 * Math.PI * YARICAP;
const CIZGILER = Array.from({ length: CIZGI_SAYISI }, (_, i) => {
  const aci = (i / CIZGI_SAYISI) * Math.PI * 2 - Math.PI / 2;
  const buyuk = i % 10 === 0;
  const ic = buyuk ? 196 : 202;
  const dis = 214;
  return {
    i, buyuk,
    x1: MERKEZ + ic * Math.cos(aci), y1: MERKEZ + ic * Math.sin(aci),
    x2: MERKEZ + dis * Math.cos(aci), y2: MERKEZ + dis * Math.sin(aci),
  };
});

export function Kadran({
  deger, hedef, etiket = 'Sağlam', birim = 'adet', durum, dokun, dokunEtiketi = 'Sayıyı düzelt', sol, sag,
}: Ozellikler) {
  const oran = deger !== null && hedef !== null && hedef > 0 ? Math.min(1, Math.max(0, deger / hedef)) : null;
  const yanan = oran === null ? 0 : Math.round(CIZGI_SAYISI * oran);

  // Sayı değişince anahtar değişir ve öğe yeniden doğar: zıplama animasyonu baştan oynar.
  const [sira, siraYaz] = useState(0);
  const onceki = useRef(deger);
  useEffect(() => {
    if (onceki.current === deger) return;
    onceki.current = deger;
    siraYaz((s) => s + 1);
  }, [deger]);

  const ic = (
    <>
      <span className="tc-kadran-etiket">{etiket}</span>
      <span key={sira} className={sira ? 'tc-kadran-sayi tc-kadran-zipla' : 'tc-kadran-sayi'}>{deger === null ? <><span aria-hidden="true">—</span><span className="tc-kadran-gizli">girilmedi</span></> : sayiYaz(deger)}</span>
      {hedef !== null && <span className="tc-kadran-hedef mono">/ {sayiYaz(hedef)} {birim}</span>}
      {oran !== null && deger !== null && hedef !== null && (
        <span className="tc-kadran-yuzde">%{Math.floor(oran * 100)} · {sayiYaz(Math.max(0, hedef - deger))} kaldı</span>
      )}
    </>
  );

  return (
    <div className={sol || sag ? 'tc-kadran tc-kadran-yanli' : 'tc-kadran'} data-durum={durum}>
      <svg viewBox="0 0 440 440" aria-hidden="true">
        {CIZGILER.map((c) => (
          <line
            key={c.i}
            className={`tc-kadran-cizgi${c.i < yanan ? ' tc-kadran-cizgi-yanik' : ''}${c.buyuk ? ' tc-kadran-cizgi-buyuk' : ''}`}
            x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
          />
        ))}
        <circle className="tc-kadran-yol" cx={MERKEZ} cy={MERKEZ} r={YARICAP} fill="none" strokeWidth="12" />
        {/* Yuvarlak uç sıfır uzunlukta da nokta çizer; oran bilinmiyorsa yay hiç çizilmez. */}
        {oran !== null && <circle
          className="tc-kadran-yay" cx={MERKEZ} cy={MERKEZ} r={YARICAP} fill="none" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${CEVRE * oran} ${CEVRE}`} transform={`rotate(-90 ${MERKEZ} ${MERKEZ})`}
        />}
      </svg>
      {dokun
        ? <button type="button" className="tc-kadran-cekirdek tc-kadran-dokunulur" onClick={dokun} title={dokunEtiketi}>
            {ic}
            <span className="tc-kadran-gizli">, {dokunEtiketi}</span>
          </button>
        : <div className="tc-kadran-cekirdek">{ic}</div>}
      {sol && <div className="tc-kadran-yan tc-kadran-yan-sol">{sol}</div>}
      {sag && <div className="tc-kadran-yan tc-kadran-yan-sag">{sag}</div>}
    </div>
  );
}

// Kadranın yanındaki küçük gösterge: üstte başlık, altta değer. Değer yoksa çağıran "yok" yazar.
export function KadranEtiketi({ baslik, ton, children }: { baslik: string; ton?: MakineDurumu; children: ReactNode }) {
  return (
    <span className="tc-kadran-gosterge" data-durum={ton}>
      {baslik}
      <b className={ton ? 'tc-kadran-gosterge-tonlu' : undefined}>{children}</b>
    </span>
  );
}
