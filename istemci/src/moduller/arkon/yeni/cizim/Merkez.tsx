import { useEffect, useState } from 'react';
import { merkezBagi, merkezKontrolIstegi, merkezUyarilari, type MerkezDosyasi } from '../../../../../../arkon/web/src/data/cizim-merkezi.ts';
import { Dugme, Girdi, Pencere, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { useArkon } from '../veri/baglam.ts';
import type { MerkezBelgesi } from '../veri/depo.ts';
import './cizim.css';

// Çizim Merkezi'nden dosya alma (cizim-merkezi.ts, kart #800). Yalnız TMI'ye bağlıyken vardır: yayındaki PDF ve 3B modeller seçilir, dosya
// Arkon'un deposuna kopyalanır. Kayıtlı dosyanın merkezdeki yayındaki özeti değişirse "Yeni revizyon var" görünür.

const YENILEME_MS = 60000;
export type MerkezUyarisi = Record<number, 'yeni-revizyon' | 'yayindan-kalkti'>;

export function useMerkezVar(): boolean {
  const { depo } = useArkon();
  return depo.status().mode === 'server';
}

// Paketteki merkez dosyalarının durumu: belge no → yeni revizyon ya da yayından kalktı (güncel olan yok sayılır). Hata sessizdir: rozet çıkmaz.
export function useMerkezUyarilari(files: readonly MerkezDosyasi[] | null | undefined): MerkezUyarisi {
  const { depo } = useArkon();
  const [uyari, uyariYaz] = useState<MerkezUyarisi>({});
  const istek = depo.status().mode === 'server' ? merkezKontrolIstegi(files || []) : [];
  const imza = istek.map((x) => x.belgeId + ':' + x.ozet).join(',');
  useEffect(() => {
    if (!imza) { uyariYaz({}); return undefined; }
    let canli = true;
    const sor = () => {
      depo.Server.merkezKontrol(imza.split(',').map((c) => { const [b, o] = c.split(':'); return { belgeId: Number(b), ozet: o ?? '' }; }))
        .then((d) => { if (canli) uyariYaz(merkezUyarilari(d)); }, () => { if (canli) uyariYaz({}); });
    };
    sor();
    const t = setInterval(sor, YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [depo, imza]);
  return uyari;
}

// Dosya satırındaki merkez rozeti ve tek dokunuşla güncelleme.
export function MerkezRozeti({ f, uyari, mesgul, guncelle }: {
  f: MerkezDosyasi; uyari: MerkezUyarisi; mesgul: boolean; guncelle: (f: MerkezDosyasi) => void;
}) {
  const bag = merkezBagi(f);
  if (!bag) return null;
  const durum = uyari[bag.belgeId];
  if (durum === 'yeni-revizyon') {
    return (
      <span className="tc-ay5-merkez">
        <Rozet ton="uyari">Yeni revizyon var</Rozet>
        <Dugme tur="birincil" simge="rotate" disabled={mesgul} onClick={() => guncelle(f)}>Güncelle</Dugme>
      </span>
    );
  }
  if (durum === 'yayindan-kalkti') return <Rozet ton="pasif">Merkezde yayından kalktı</Rozet>;
  return <Rozet ton="bilgi">Çizim Merkezi</Rozet>;
}

export function MerkezSecici({ sec, kapat }: { sec: (b: MerkezBelgesi) => Promise<void>; kapat: () => void }) {
  const { depo } = useArkon();
  const [q, qYaz] = useState(''), [satirlar, satirlarYaz] = useState<MerkezBelgesi[] | null>(null), [hata, hataYaz] = useState(''), [mesgul, mesgulYaz] = useState(0);
  useEffect(() => {
    let canli = true;
    const t = setTimeout(() => {
      depo.Server.merkezBelgeleri(q).then((r) => { if (canli) { satirlarYaz(r || []); hataYaz(''); } }, (e: unknown) => {
        if (canli) { satirlarYaz([]); hataYaz((e instanceof Error && e.message) || 'Çizim Merkezi listesi alınamadı'); }
      });
    }, 250);
    return () => { canli = false; clearTimeout(t); };
  }, [depo, q]);
  const al = async (b: MerkezBelgesi) => { mesgulYaz(b.id); try { await sec(b); } finally { mesgulYaz(0); } };
  return (
    <Pencere acik kapat={kapat} baslik="Çizim Merkezi'nden ekle">
      <div className="tc-ay5-secici">
        <p className="tc-ay5-soluk">Yalnız yayındaki PDF ve 3B modeller listelenir. Seçilen dosya pakete kopyalanır.</p>
        <Girdi etiket="Belge ara" value={q} onChange={(e) => qYaz(e.target.value)} placeholder="Belge adı ile ara" />
        <ul className="tc-ay5-liste" aria-label="Yayındaki çizimler">
          {(satirlar || []).map((b) => (
            <li key={b.id}>
              <button type="button" className="tc-ay5-satir" disabled={mesgul !== 0} onClick={() => { void al(b); }}>
                <span className={`tc-ay5-tur tc-ay5-tur-${b.tip === 'pdf' ? 'pdf' : 'model'}`}>{b.tip === 'pdf' ? 'PDF' : '3B'}</span>
                <span className="tc-ay5-metin"><b>{b.ad}</b><small>Rev {b.harf} · {b.dosyaAdi}</small></span>
                <Simge ad={mesgul === b.id ? 'rotate' : 'plus'} />
              </button>
            </li>
          ))}
        </ul>
        {hata ? <small className="tc-ay5-soluk" role="alert">{hata}</small>
          : satirlar === null ? <small className="tc-ay5-soluk">Yükleniyor…</small>
          : !satirlar.length ? <small className="tc-ay5-soluk">Yayında uygun belge yok.</small> : null}
      </div>
    </Pencere>
  );
}
