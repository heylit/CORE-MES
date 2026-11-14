import { useEffect, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, Rozet, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { DosyaHatasi, malzemeBelgesiYukle, useMalzemeResimYetkisi } from '../../../cizimler/disari.ts';
import { useSihirbaz } from './baglam.ts';
import { CIZIM_KABULU, cizimEkle, cizimHedefi, ortadanKisalt, rafVar, type BekleyenCizim, type CizimDurumu } from './cizim-rafi.ts';
import type { Sihirbaz } from './baglam.ts';

const DURUM: Readonly<Record<CizimDurumu, { ad: string; ton: RozetTonu }>> = {
  bekler: { ad: 'Kayıtta gönderilir', ton: 'pasif' },
  gidiyor: { ad: 'Gönderiliyor', ton: 'bilgi' },
  yayinda: { ad: 'Yayında', ton: 'tamam' },
  taslak: { ad: 'Taslak', ton: 'uyari' },
  hata: { ad: 'Gönderilemedi', ton: 'hata' },
};

// Kare çizimi yalnız türü anlatır (gerçek küçük resim yüklemeden sonra Çizim Merkezi'nde üretilir).
function Resimcik({ tur }: { tur: BekleyenCizim['tur'] }) {
  return tur === 'teknik-resim' ? (
    <svg className="tc-my-cz-resim" viewBox="0 0 120 64" aria-hidden="true">
      <rect x="2" y="2" width="116" height="60" /><rect x="84" y="46" width="34" height="16" /><rect x="18" y="14" width="44" height="30" />
      <circle cx="40" cy="29" r="7" /><rect x="70" y="14" width="10" height="30" /><line className="tc-my-cz-olcu" x1="18" y1="50" x2="62" y2="50" />
    </svg>
  ) : (
    <svg className="tc-my-cz-resim tc-my-cz-model" viewBox="0 0 120 64" aria-hidden="true">
      <polygon className="tc-my-cz-yuz" points="30,22 74,14 98,24 54,32" /><polygon points="30,22 54,32 54,54 30,44" />
      <polygon points="54,32 98,24 98,46 54,54" /><ellipse cx="66" cy="22" rx="8" ry="3" />
    </svg>
  );
}

// Föyde (masaüstü) ve telefonda adımın üstünde şerit olarak aynı raf; yükleme `useCizimYukleme`dedir, raf yalnız gösterir.
export function CizimRafi({ serit = false }: { serit?: boolean }) {
  const { taslak: d, b, cizimler, cizimlerYaz, bildir } = useSihirbaz();
  const { merkezGorur } = useMalzemeResimYetkisi();
  const [uzerinde, uzerindeYaz] = useState(false);
  if (!rafVar(d, b) || (d.id && cizimler.length === 0)) return null;
  const { resimNo, rev } = cizimHedefi(d);
  const hedef = `${resimNo ?? 'resim no yok'} · Rev ${rev ?? '—'}`;
  const kayitli = !!d.id;
  const ekle = (dosyalar: readonly File[]) => {
    cizimlerYaz((l) => {
      const s = cizimEkle(l, dosyalar);
      if (s.reddedilen.length) bildir(`Yalnız PDF ve STEP eklenir: ${s.reddedilen.join(', ')}.`, 'hata');
      return s.liste;
    });
  };
  const birak = (e: DragEvent) => { e.preventDefault(); uzerindeYaz(false); ekle([...e.dataTransfer.files]); };
  return (
    <section className={serit ? 'tc-my-cz tc-my-cz-serit' : 'tc-my-cz'} aria-label="Çizimler">
      <div className="tc-my-cz-bas"><Simge ad="layers" /><span>Çizimler</span><Rozet ton="pasif" gorunum="cizgi">{cizimler.length}</Rozet></div>
      <ul className="tc-my-cz-kareler">
        {cizimler.map((c) => (
          <li key={c.anahtar} className="tc-my-cz-kare">
            <Resimcik tur={c.tur} />
            <b title={c.dosya.name}>{ortadanKisalt(c.dosya.name)}</b>
            <span className="tc-my-cz-hedef mono">{hedef}</span>
            <Rozet ton={DURUM[c.durum].ton}>{DURUM[c.durum].ad}</Rozet>
            {c.durum === 'gidiyor' && <progress max={1} value={c.oran} aria-label={`${c.dosya.name} yükleniyor`} />}
            {c.hata !== null && <small className="tc-my-cz-hata" role="alert">{c.hata}</small>}
            {c.durum === 'bekler' && !kayitli && (
              <Dugme simge="x" aria-label={`${c.dosya.name} kaldır`} onClick={() => { cizimlerYaz((l) => l.filter((x) => x.anahtar !== c.anahtar)); }}>Kaldır</Dugme>
            )}
            {c.durum === 'hata' && (
              <Dugme simge="rotate" onClick={() => { cizimlerYaz((l) => l.map((x) => (x.anahtar === c.anahtar ? { ...x, durum: 'bekler', hata: null } : x))); }}>Yeniden dene</Dugme>
            )}
            {c.belgeId !== null && merkezGorur && <Link className="tc-my-cz-ac" to={`/cizimler/belge/${String(c.belgeId)}`}><Simge ad="expand" />Çizim Merkezi'nde aç</Link>}
          </li>
        ))}
        {!kayitli && (
          <li>
            <label
              className={uzerinde ? 'tc-my-cz-kare tc-my-cz-ekle tc-my-cz-uzerinde' : 'tc-my-cz-kare tc-my-cz-ekle'}
              onDragOver={(e) => { e.preventDefault(); uzerindeYaz(true); }} onDragLeave={() => { uzerindeYaz(false); }} onDrop={birak}
            >
              <Simge ad="upload" /><span>STEP ya da PDF bırak</span><small>ya da dokunup seç</small>
              <input
                className="tc-my-cz-girdi" type="file" accept={CIZIM_KABULU} multiple aria-label="STEP ya da PDF seç"
                onChange={(e) => { ekle([...(e.target.files ?? [])]); e.target.value = ''; }}
              />
            </label>
          </li>
        )}
      </ul>
      {!kayitli && <p className="tc-my-cz-not">Kayıtta {hedef} ile Çizim Merkezi'ne gider. PDF hemen yayında olur, STEP taslak girer. Sayfa yenilenirse dosyalar yeniden seçilir.</p>}
    </section>
  );
}

// Kart kaydedilip numarası gelince bekleyen dosyalar sırayla yüklenir; sihirbazda bir kez çağrılır (raf iki yerde çizilse de).
export function useCizimYukleme(s: Pick<Sihirbaz, 'taslak' | 'kartlar' | 'cizimler' | 'cizimlerYaz' | 'bildir'> & { tazeleArttir: () => void }) {
  const { taslak: d, kartlar, cizimler, cizimlerYaz, bildir, tazeleArttir } = s;
  const [suruyor, suruyorYaz] = useState(false);
  const no = d.id ? kartlar.find((k) => k.kimlik === d.id)?.no : undefined;
  const bekleyen = cizimler.find((c) => c.durum === 'bekler');
  useEffect(() => {
    if (!no || !bekleyen || suruyor) return;
    suruyorYaz(true);
    const { resimNo, rev } = cizimHedefi(d);
    const yaz = (p: Partial<BekleyenCizim>) => { cizimlerYaz((l) => l.map((x) => (x.anahtar === bekleyen.anahtar ? { ...x, ...p } : x))); };
    yaz({ durum: 'gidiyor', oran: 0 });
    void (async () => {
      try {
        const { cevap, kareHatasi } = await malzemeBelgesiYukle(no, bekleyen.dosya, { tur: bekleyen.tur, resimNo, antetRev: rev }, (oran) => { yaz({ oran }); });
        const belge = cevap.belgeler.filter((x) => x.tur === bekleyen.tur).reduce<{ id: number } | null>((e, x) => (e === null || x.id > e.id ? x : e), null);
        yaz({ durum: bekleyen.tur === 'teknik-resim' ? 'yayinda' : 'taslak', oran: 1, belgeId: belge?.id ?? null });
        if (kareHatasi !== null) bildir(kareHatasi);
      } catch (e) {
        yaz({ durum: 'hata', hata: e instanceof DosyaHatasi ? e.message : hataIletisi(e, 'Dosya Çizim Merkezi\'ne gönderilemedi; kart kaydedildi.') });
      } finally {
        suruyorYaz(false);
        tazeleArttir();
      }
    })();
  }, [no, bekleyen, suruyor, d, cizimlerYaz, bildir, tazeleArttir]);
}
