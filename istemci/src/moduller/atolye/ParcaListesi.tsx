import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { GozKalemi, KalemGorunumu, KalemMalzemesi } from '#paylasilan/sozlesme/atolye.ts';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Tablo, useBildirim } from '../../ortak/arayuz/index.ts';
import type { Sutun } from '../../ortak/arayuz/index.ts';
import { KalemGorunumuFormu } from './KalemGorunumu.tsx';
import { AMBALAJ_ADI, parcaListesi, saatMetni, sayi, sayiMetni } from './kurallar.ts';
import type { ParcaSatiri } from './kurallar.ts';
import { modelDosyasi } from './veri.ts';

// Parçalar ve malzemeler: kod başına bir satır (göz kaydı, görünüm ya da üretim emri olan her kod). Satırda nerede
// durduğu (göz ve doluluk), hangi makinede üretildiği (emirlerden) ve rafta nasıl göründüğü; seçilince 3B modeli,
// görünüm formu ve depoya ya da makineye gitme düğmeleri.

const ModelOnizleme = lazy(() => import('./ModelOnizleme.tsx').then((m) => ({ default: m.ModelOnizleme })));
const ModelKutuphanesi = lazy(() => import('./ModelKutuphanesi.tsx').then((m) => ({ default: m.ModelKutuphanesi })));

interface Ozellikler {
  gozKalemleri: readonly GozKalemi[];
  gorunumler: readonly KalemGorunumu[];
  emirler: readonly Emir[];
  // Emirler okunamadıysa makine sütunu "bilinmiyor" der (boş liste "üretilmemiş" demek olurdu).
  emirHatasi: boolean;
  // Göz kalemleri okunamadıysa "Depoda" sütunu bilinmiyor der.
  gozHatasi: boolean;
  yazabilir: boolean;
  gozeGit: (g: GozKalemi) => void;
  istasyonaGit: (istasyonId: number) => void;
}

const gorunumMetni = (g: KalemGorunumu | null): string => {
  if (!g) return '—';
  if (g.rafta === 'model' && g.model) return `3B · ${g.model.ad}`;
  return g.model ? `${AMBALAJ_ADI[g.ambalaj]} · model: ${g.model.ad}` : AMBALAJ_ADI[g.ambalaj];
};

// ATL-36: kod malzeme kartıyla eşleşmediyse uyarı; kayıt engellenmez, kartı Malzemeler ve Hizmetler'de açılır.
function MalzemeKarti({ m }: { m: KalemMalzemesi | null }) {
  return m ? <span className="mono">{m.stokKodu}</span> : <Rozet ton="uyari">Kartta yok</Rozet>;
}

function ParcaModeli({ g }: { g: KalemGorunumu }) {
  const { bildir } = useBildirim();
  const [glb, glbYaz] = useState<Uint8Array | null>(null);
  const model = g.model;
  useEffect(() => {
    glbYaz(null);
    if (!model) return undefined;
    let iptal = false;
    modelDosyasi(model).then((d) => { if (!iptal) glbYaz(d); }, () => { if (!iptal) bildir('hata', `${model.ad} modeli indirilemedi.`); });
    return () => { iptal = true; };
  }, [model, bildir]);
  if (!model) return null;
  return (
    <Suspense fallback={<DurumKutusu durum="yukleniyor" />}>
      <ModelOnizleme glb={glb} ayar={{ birim: model.birim, yukari: model.yukari, donus: sayi(model.donus), sigdir: false }} />
    </Suspense>
  );
}

export function ParcaListesi({ gozKalemleri, gorunumler, emirler, emirHatasi, gozHatasi, yazabilir, gozeGit, istasyonaGit }: Ozellikler) {
  const [arama, aramaYaz] = useState('');
  const [secili, seciliYaz] = useState<string | null>(null);
  const [yeni, yeniYaz] = useState(false);
  const [kutuphane, kutuphaneYaz] = useState(false);
  const satirlar = useMemo(() => parcaListesi(gozKalemleri, gorunumler, emirler), [gozKalemleri, gorunumler, emirler]);
  const suzulmus = useMemo(() => {
    const a = arama.trim().toLocaleLowerCase('tr');
    if (a === '') return satirlar;
    return satirlar.filter((s) => s.kod.toLocaleLowerCase('tr').includes(a) || (s.ad ?? '').toLocaleLowerCase('tr').includes(a)
      || s.gozler.some((g) => g.adres.toLocaleLowerCase('tr').includes(a)) || s.makineler.some((m) => m.ad.toLocaleLowerCase('tr').includes(a)));
  }, [satirlar, arama]);
  const s = satirlar.find((x) => x.anahtar === secili);

  const sutunlar: readonly Sutun<ParcaSatiri>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (r) => r.kod, mono: true, kirilmaz: true },
    { anahtar: 'ad', baslik: 'Ad', hucre: (r) => r.malzeme?.ad ?? r.ad ?? '—' },
    { anahtar: 'kart', baslik: 'Malzeme kartı', hucre: (r) => <MalzemeKarti m={r.malzeme} /> },
    { anahtar: 'gorunum', baslik: 'Rafta', hucre: (r) => gorunumMetni(r.gorunum) },
    {
      anahtar: 'depo', baslik: 'Depoda', hucre: (r) => (gozHatasi ? 'bilinmiyor' : r.gozler.length === 0 ? '—' : (
        <span className="mono">{r.gozler.slice(0, 2).map((g) => `${g.adres} %${g.doluluk}`).join(', ')}{r.gozler.length > 2 ? ` +${r.gozler.length - 2}` : ''}</span>
      )),
    },
    {
      anahtar: 'makine', baslik: 'Makine', hucre: (r) => {
        if (emirHatasi) return 'bilinmiyor';
        const suren = r.makineler.filter((m) => m.suruyor);
        if (suren.length > 0) return <span className="tc-atolye-suruyor">{suren.map((m) => m.ad).join(', ')}</span>;
        return r.makineler.length === 0 ? '—' : r.makineler.slice(0, 2).map((m) => m.ad).join(', ');
      },
    },
  ];

  return (
    <div className="tc-atolye-parcalar">
      <div className="tc-atolye-parcalar-ust">
        <Girdi etiket="Ara" type="search" placeholder="Kod, ad, göz adresi ya da makine" value={arama} onChange={(o) => aramaYaz(o.target.value)} />
        <span className="tc-atolye-ipucu">{sayiMetni(suzulmus.length)} kalem</span>
        {yazabilir && <Dugme simge="plus" aria-pressed={yeni} onClick={() => yeniYaz((v) => !v)}>Görünüm ekle</Dugme>}
        <Dugme simge="cube" onClick={() => kutuphaneYaz(true)}>3B modeller</Dugme>
      </div>
      {yeni && yazabilir && (
        <section className="tc-atolye-goz-gorunum" aria-label="Yeni kalem görünümü">
          <p className="tc-atolye-ipucu">Koda 3B model ya da ambalaj bağlayın; parça makinede işlenirken model makinenin üstünde döner, rafta seçtiğiniz biçimde görünür.</p>
          <KalemGorunumuFormu yazabilir bitti={() => yeniYaz(false)} />
        </section>
      )}
      {emirHatasi && <p className="tc-atolye-hata">Üretim emirleri okunamadı; makine bilgisi gösterilmiyor.</p>}
      {gozHatasi && <p className="tc-atolye-hata">Göz kalemleri okunamadı; depo bilgisi gösterilmiyor.</p>}
      <Tablo
        etiket="Parçalar ve malzemeler"
        sutunlar={sutunlar}
        satirlar={suzulmus}
        satirAnahtari={(r) => r.anahtar}
        satirSec={(r) => seciliYaz((x) => (x === r.anahtar ? null : r.anahtar))}
        bosMesaj={arama.trim() === '' ? 'Henüz kalem yok: göze kalem koyun, görünüm ekleyin ya da üretim emri açın.' : 'Eşleşen kalem yok.'}
      />
      {s && (
        <section className="tc-atolye-parca-ayrinti" aria-label={`${s.kod} ayrıntısı`}>
          <header className="tc-atolye-kart-ust">
            <div>
              <p className="tc-atolye-ust-baslik">Kalem</p>
              <h3><span className="mono">{s.kod}</span>{(s.malzeme?.ad ?? s.ad) ? ` · ${s.malzeme?.ad ?? s.ad}` : ''}</h3>
              {s.malzeme ? <p className="tc-atolye-ipucu">Malzeme kartı <span className="mono">{s.malzeme.stokKodu}</span></p>
                : <p className="tc-atolye-ipucu"><Rozet ton="uyari">Kartta yok</Rozet> Bu kod Malzemeler ve Hizmetler'deki bir stok koduyla eşleşmiyor.</p>}
            </div>
            <Dugme simge="x" aria-label="Ayrıntıyı kapat" onClick={() => seciliYaz(null)} />
          </header>
          <div className="tc-atolye-parca-bloklar">
            <section aria-label="Depoda">
              <h4>Depoda</h4>
              {gozHatasi ? <p className="tc-atolye-ipucu">Bilinmiyor (göz kalemleri okunamadı).</p> : s.gozler.length === 0 ? <p className="tc-atolye-ipucu">Hiçbir gözde değil.</p> : (
                <ul className="tc-atolye-liste">
                  {s.gozler.map((g) => (
                    <li key={g.id}>
                      <span className="mono">{g.adres}</span>
                      <span>%{g.doluluk}</span>
                      <Dugme simge="box" onClick={() => gozeGit(g)}>Rafta göster</Dugme>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Makineler">
              <h4>Üretildiği makineler</h4>
              {emirHatasi ? <p className="tc-atolye-ipucu">Bilinmiyor (emirler okunamadı).</p> : s.makineler.length === 0 ? <p className="tc-atolye-ipucu">Bu kod için üretim emri yok.</p> : (
                <ul className="tc-atolye-liste">
                  {s.makineler.map((m) => (
                    <li key={m.id}>
                      <span>{m.ad}</span>
                      {m.suruyor ? <Rozet ton="tamam">Üretiliyor</Rozet> : <small>{sayiMetni(m.emirSayisi)} emir · son {saatMetni(m.son) ?? '—'}</small>}
                      <Dugme simge="target" onClick={() => istasyonaGit(m.id)}>Haritada</Dugme>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Görünüm" className="tc-atolye-parca-gorunum">
              <h4>Rafta ve makinede görünüm</h4>
              {s.gorunum?.model && <ParcaModeli key={s.gorunum.model.id} g={s.gorunum} />}
              <KalemGorunumuFormu key={s.anahtar} kod={s.kod} yazabilir={yazabilir} />
            </section>
          </div>
        </section>
      )}
      {kutuphane && (
        <Suspense fallback={null}>
          <ModelKutuphanesi acik={kutuphane} kapat={() => kutuphaneYaz(false)} yazabilir={yazabilir} />
        </Suspense>
      )}
    </div>
  );
}
