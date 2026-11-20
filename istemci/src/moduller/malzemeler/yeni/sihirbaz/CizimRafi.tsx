import { useEffect, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, Girdi, Rozet, Simge, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { DosyaHatasi, malzemeBelgesiYukle, useMalzemeResimYetkisi } from '../../../cizimler/disari.ts';
import { useSihirbaz } from './baglam.ts';
import { CIZIM_GRUPLARI, cizimEkle, cizimHedefi, dosyaHedefi, hedefMetni, ortadanKisalt, rafVar, tasimaIletisi, type BekleyenCizim, type CizimDurumu, type CizimGrubu } from './cizim-rafi.ts';
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
// İki grup alt alta (3305 a): 3B model, teknik resim. Kayıtlı kartta yalnız dosyası olan grup kalır, bırakma alanı çıkmaz.
export function CizimRafi({ serit = false }: { serit?: boolean }) {
  const { taslak: d, b, cizimler, cizimlerYaz, bildir } = useSihirbaz();
  const { merkezGorur } = useMalzemeResimYetkisi();
  if (!rafVar(d, b) || (d.id && cizimler.length === 0)) return null;
  const kartHedefi = cizimHedefi(d);
  const hedef = (c: BekleyenCizim) => hedefMetni(dosyaHedefi(d, c));
  const kayitli = !!d.id;
  const ekle = (dosyalar: readonly File[], tur: CizimGrubu['tur']) => {
    cizimlerYaz((l) => {
      const s = cizimEkle(l, dosyalar, tur);
      if (s.reddedilen.length) bildir(`Yalnız PDF ve STEP eklenir: ${s.reddedilen.join(', ')}.`, 'hata');
      const tasima = tasimaIletisi(s.tasinan, s.liste);
      if (tasima !== null) bildir(tasima, 'bilgi');
      return s.liste;
    });
  };
  const gruplar = CIZIM_GRUPLARI.filter((g) => !kayitli || cizimler.some((c) => c.tur === g.tur));
  return (
    <section className={serit ? 'tc-my-cz tc-my-cz-serit' : 'tc-my-cz'} aria-label="Çizimler">
      <div className="tc-my-cz-bas"><Simge ad="layers" /><span>Çizimler</span><Rozet ton="pasif" gorunum="cizgi">{cizimler.length}</Rozet></div>
      {gruplar.map((g) => (
        <CizimGrubuBolumu
          key={g.tur} grup={g} cizimler={cizimler.filter((c) => c.tur === g.tur)} hedef={hedef} kayitli={kayitli} merkezGorur={merkezGorur}
          ekle={(f) => { ekle(f, g.tur); }} kaldir={(a) => { cizimlerYaz((l) => l.filter((x) => x.anahtar !== a)); }}
          yenidenDene={(a) => { cizimlerYaz((l) => l.map((x) => (x.anahtar === a ? { ...x, durum: 'bekler', hata: null } : x))); }}
          elleYaz={(a, elle) => { cizimlerYaz((l) => l.map((x) => (x.anahtar === a ? { ...x, elle } : x))); }} kartHedefi={kartHedefi}
        />
      ))}
      {!kayitli && <p className="tc-my-cz-not">Kayıtta kartın teknik resim no ve revizyonuyla ({hedefMetni(kartHedefi)}) Çizim Merkezi'ne gider; dosyada "Düzenle" ile değiştirilebilir. Teknik resim hemen yayında olur, 3B model taslak girer. Sayfa yenilenirse dosyalar yeniden seçilir.</p>}
    </section>
  );
}

function CizimGrubuBolumu({ grup, cizimler, hedef, kayitli, merkezGorur, ekle, kaldir, yenidenDene, elleYaz, kartHedefi }: {
  grup: CizimGrubu; cizimler: readonly BekleyenCizim[]; hedef: (c: BekleyenCizim) => string; kayitli: boolean; merkezGorur: boolean;
  ekle: (dosyalar: readonly File[]) => void; kaldir: (anahtar: string) => void; yenidenDene: (anahtar: string) => void;
  elleYaz: (anahtar: string, elle: BekleyenCizim['elle']) => void; kartHedefi: { resimNo: string | null; rev: string | null };
}) {
  const [uzerinde, uzerindeYaz] = useState(false);
  const [duzenlenen, duzenlenenYaz] = useState<string | null>(null);
  const birak = (e: DragEvent) => { e.preventDefault(); uzerindeYaz(false); ekle([...e.dataTransfer.files]); };
  return (
    <section className="tc-my-cz-grup" aria-label={grup.ad}>
      <div className="tc-my-cz-grup-bas">
        <Simge ad={grup.simge} /><span>{grup.ad}</span><small>{grup.bicim}</small>
        <Rozet ton="pasif" gorunum="cizgi">{cizimler.length}</Rozet>
      </div>
      <ul className="tc-my-cz-kareler">
        {cizimler.map((c) => (
          <li key={c.anahtar} className={c.tasindi ? 'tc-my-cz-kare tc-my-cz-tasindi' : 'tc-my-cz-kare'} aria-label={c.dosya.name}>
            <Resimcik tur={c.tur} />
            <b title={c.dosya.name}>{ortadanKisalt(c.dosya.name)}</b>
            {c.durum === 'bekler' && !kayitli
              ? (
                <HedefDuzenle
                  c={c} metin={hedef(c)} kartHedefi={kartHedefi} yaz={(elle) => { elleYaz(c.anahtar, elle); }}
                  acik={duzenlenen === c.anahtar} acikYaz={(a) => { duzenlenenYaz(a ? c.anahtar : null); }}
                />
              )
              : <span className="tc-my-cz-hedef mono">{hedef(c)}</span>}
            {duzenlenen !== c.anahtar && <Rozet ton={DURUM[c.durum].ton}>{DURUM[c.durum].ad}</Rozet>}
            {c.durum === 'gidiyor' && <progress max={1} value={c.oran} aria-label={`${c.dosya.name} yükleniyor`} />}
            {c.hata !== null && <small className="tc-my-cz-hata" role="alert">{c.hata}</small>}
            {c.durum === 'bekler' && !kayitli && duzenlenen !== c.anahtar && (
              <Dugme simge="x" aria-label={`${c.dosya.name} kaldır`} onClick={() => { kaldir(c.anahtar); }}>Kaldır</Dugme>
            )}
            {c.durum === 'hata' && <Dugme simge="rotate" onClick={() => { yenidenDene(c.anahtar); }}>Yeniden dene</Dugme>}
            {c.belgeId !== null && merkezGorur && <Link className="tc-my-cz-ac" to={`/cizimler/belge/${String(c.belgeId)}`}><Simge ad="expand" />Çizim Merkezi'nde aç</Link>}
          </li>
        ))}
        {!kayitli && (
          <li>
            <label
              className={uzerinde ? 'tc-my-cz-kare tc-my-cz-ekle tc-my-cz-uzerinde' : 'tc-my-cz-kare tc-my-cz-ekle'}
              onDragOver={(e) => { e.preventDefault(); uzerindeYaz(true); }} onDragLeave={() => { uzerindeYaz(false); }} onDrop={birak}
            >
              <Simge ad="upload" /><span>{grup.birak}</span><small>ya da seç</small>
              <input
                className="tc-my-cz-girdi" type="file" accept={grup.kabul} multiple aria-label={`${grup.ad} seç (${grup.bicim})`}
                onChange={(e) => { ekle([...(e.target.files ?? [])]); e.target.value = ''; }}
              />
            </label>
          </li>
        )}
      </ul>
    </section>
  );
}

// 3479: dosya başına teknik resim no ve revizyon; karttan dolu açılır, düzenlenirse yalnız bu dosya için geçer.
// Düzenlerken rozet ve Kaldır gizlenir (karede yalnız alanlar ve iki düğme kalır).
function HedefDuzenle({ c, metin, kartHedefi, yaz, acik, acikYaz }: {
  c: BekleyenCizim; metin: string; kartHedefi: { resimNo: string | null; rev: string | null }; yaz: (elle: BekleyenCizim['elle']) => void;
  acik: boolean; acikYaz: (acik: boolean) => void;
}) {
  const deger = c.elle ?? { resimNo: kartHedefi.resimNo ?? '', rev: kartHedefi.rev ?? '' };
  if (!acik) {
    return (
      <>
        <span className="tc-my-cz-hedef mono">{metin}{c.elle && <small> (elle)</small>}</span>
        <Dugme simge="edit" aria-label={`${c.dosya.name} teknik resim no ve revizyonu düzenle`} onClick={() => { acikYaz(true); }}>Düzenle</Dugme>
      </>
    );
  }
  return (
    <div className="tc-my-cz-duzenle">
      <Girdi etiket="Teknik resim no" value={deger.resimNo} maxLength={60} onChange={(e) => { yaz({ ...deger, resimNo: e.target.value }); }} />
      <Girdi etiket="Revizyon kodu" value={deger.rev} maxLength={20} onChange={(e) => { yaz({ ...deger, rev: e.target.value }); }} />
      <div className="tc-my-cz-duzenle-dugmeler">
        {c.elle && <Dugme simge="rotate" onClick={() => { yaz(null); }}>Karttan al</Dugme>}
        <Dugme simge="check" onClick={() => { acikYaz(false); }}>Tamam</Dugme>
      </div>
    </div>
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
    const { resimNo, rev } = dosyaHedefi(d, bekleyen);
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
