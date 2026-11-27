import { useState } from 'react';
import type { KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { useStudyoParcalari } from '../../../kalite-merkezi/disari.ts';
import { kmOpBalonlari, kmTopluPlani, type KmParcaVerisi, type KmTopluSatiri } from './km-cizim.ts';
import type { Pkg } from './tipler.ts';

// 3701: seçili paketleri Kalite Merkezi'nden doldur. Kurallar km-cizim.ts'tedir; yazma Hazirlik.tsx'te. İş bitince sonuç pencerede kalır.
export interface KmTopluSonucu { doldu: number; hatalar: { paket: string; neden: string }[] }

interface Ozellikler {
  hedefler: readonly Pkg[] | null; kapat: () => void; uygula: (l: readonly KmTopluSatiri[]) => Promise<KmTopluSonucu>;
}

export function KmTopluPenceresi({ hedefler, kapat, uygula }: Ozellikler) {
  return hedefler === null ? null : <Icerik hedefler={hedefler} kapat={kapat} uygula={uygula} />;
}

// Seçili paketlerin parçaları için Kalite Merkezi verisi (toplu doldur ve yenile ortak).
export function useKmParcaVerisi(hedefler: readonly Pkg[]): { veri: Map<number, KmParcaVerisi>; yetkisiz: boolean } {
  const yetki = useYetki();
  const malzemeler = [...new Set(hedefler.flatMap((p) => (typeof p.malzemeNo === 'number' ? [p.malzemeNo] : [])))];
  const sorgular = useStudyoParcalari(yetki.hazir && yetki.var('kalite-merkezi.oku') ? malzemeler : []);
  const yetkisiz = yetki.hazir && !yetki.var('kalite-merkezi.oku');
  const veri = new Map<number, KmParcaVerisi>(malzemeler.map((no, i): [number, KmParcaVerisi] => {
    if (yetkisiz) return [no, 'yetkisiz'];
    const q = sorgular[i];
    if (q === undefined || q.isPending) return [no, 'bekliyor'];
    if (q.isError) return [no, q.error instanceof ApiHatasi && q.error.durum === 403 ? 'yetkisiz' : 'hata'];
    return [no, { resimler: (q.data as KmStudyoParcaCevabi).resimler }];
  }));
  return { veri, yetkisiz };
}
export const kmPaketAdi = (p: Pkg) => `${p.no} · ${p.op || (p.tmi?.opNo !== undefined ? `Op ${String(p.tmi.opNo)}` : 'Operasyon girilmedi')}`;

function Icerik({ hedefler, kapat, uygula }: { hedefler: readonly Pkg[]; kapat: () => void; uygula: Ozellikler['uygula'] }) {
  const { veri, yetkisiz } = useKmParcaVerisi(hedefler);
  const [mesgul, mesgulYaz] = useState(false);
  const [sonuc, sonucYaz] = useState<KmTopluSonucu | null>(null);
  const satirlar = kmTopluPlani(hedefler, veri);
  const dolacak = satirlar.filter((x) => x.resim !== null);
  const atlanan = satirlar.filter((x) => x.resim === null);
  const bekliyor = [...veri.values()].includes('bekliyor');
  const calistir = async () => {
    mesgulYaz(true);
    try { sonucYaz(await uygula(dolacak)); } finally { mesgulYaz(false); }
  };
  const bosNedeni = dolacak.length === 0 ? (bekliyor ? 'Kalite Merkezi okunuyor' : 'Doldurulacak paket yok') : null;
  return (
    <Pencere
      acik kapat={mesgul ? () => undefined : kapat} baslik={`${String(hedefler.length)} paketi Kalite Merkezi’nden doldur`}
      alt={(
        <>
          <Dugme tur="ikincil" disabled={mesgul} onClick={kapat}>{sonuc ? 'Kapat' : 'Vazgeç'}</Dugme>
          {sonuc ? null : (
            <Dugme tur="birincil" simge="layers" yukleniyor={mesgul} disabled={bosNedeni !== null} onClick={() => { void calistir(); }}>
              {bosNedeni ?? `${String(dolacak.length)} paketi doldur`}
            </Dugme>
          )}
        </>
      )}
    >
      <div className="tc-ay2-toplu-ic">
        {sonuc ? (
          <section className="tc-ay2-toplu-grup" aria-label="Sonuç" role="status">
            <h3 data-ton={sonuc.hatalar.length ? 'hold' : 'run'}><Simge ad={sonuc.hatalar.length ? 'alert' : 'check'} boyut="k" />
              {sonuc.hatalar.length ? `${String(sonuc.doldu)} paket doldu, ${String(sonuc.hatalar.length)} paket doldurulamadı` : `${String(sonuc.doldu)} paket doldu`}
            </h3>
            {sonuc.hatalar.length ? <ul>{sonuc.hatalar.map((h) => <li key={h.paket}>{h.paket} · {h.neden}</li>)}</ul> : null}
          </section>
        ) : (
          <>
            {yetkisiz ? <p className="tc-ay2-takip-uyari tc-ay2-toplu-sil"><Simge ad="lock" boyut="k" /><span>Kalite Merkezi’ni okuma yetkin yok; paketler doldurulamaz.</span></p> : null}
            {dolacak.length ? (
              <section className="tc-ay2-toplu-grup" aria-label="Doldurulacak">
                <h3 data-ton="run"><Simge ad="check" boyut="k" />Doldurulacak<b>{dolacak.length}</b></h3>
                <ul>{dolacak.map(({ hedef, resim }) => <li key={hedef.id}>{kmPaketAdi(hedef)} ← {resim!.ad}{resim!.revizyon ? ` Rev ${resim!.revizyon}` : ''} ({String(kmOpBalonlari(resim!, typeof hedef.tmi?.opNo === 'number' ? hedef.tmi.opNo : null).balonlar.length)} balon)</li>)}</ul>
              </section>
            ) : null}
            {atlanan.length ? (
              <section className="tc-ay2-toplu-grup" aria-label="Atlanacak">
                <h3 data-ton="idle"><Simge ad="x" boyut="k" />Atlanacak<b>{atlanan.length}</b></h3>
                <ul>{atlanan.map(({ hedef, neden }) => <li key={hedef.id}>{kmPaketAdi(hedef)} · {neden}</li>)}</ul>
              </section>
            ) : null}
            <p className="tc-ay2-soluk tc-ay2-toplu-not">Yalnız boş ve Kalite Merkezi bağı olmayan paketler doldurulur; plan adıma bağlı balon grubuna göre gelir. Paketler taslak kalır; terminale gitmez.</p>
          </>
        )}
      </div>
    </Pencere>
  );
}
