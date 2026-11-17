import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { URETIM_EMRI_YAZMA_ISLEMLERI, type Islem } from '#paylasilan/islemler.ts';
import type { HazirDosya, HazirDosyalarCevabi, HazirKaynak, HazirKayitlarCevabi, HazirListe } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { ADIMLI_OKUMA_ISLEMLERI as SUNUCUDAKI_LISTE } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ikiliOku } from '../belge-merkezi/disari.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';

// Hazır listeler (kart 3390, 3390 a): kaydın dosyaları kaynağına göre gruplu. Liste ve satır sunucuda yetkiyle süzülür (Risk K1);
// buradaki yetki yalnız menüde boş liste göstermemek içindir.

// Emri okuyabilen işlemler; tip sözleşmedeki listeye birebir eşittir (sapma derlemede yakalanır).
const ADIMLI_OKUMA_ISLEMLERI: typeof SUNUCUDAKI_LISTE = ['sayfa.uretim-emirleri', 'sayfa.rota', ...URETIM_EMRI_YAZMA_ISLEMLERI, 'uretim-emirleri.fason', 'plan.yaz'];
interface ListeTanimi { baslik: string; simge: SimgeAdi; ara: string; okuma: readonly Islem[] }
export const HAZIR_LISTE_TANIMLARI: Readonly<Record<HazirListe, ListeTanimi>> = {
  'uretim-emri': { baslik: 'Üretim emirleri', simge: 'list', ara: 'Emir no ya da malzeme', okuma: ADIMLI_OKUMA_ISLEMLERI },
  'satin-alma-siparisi': { baslik: 'Satın alma siparişleri', simge: 'cart', ara: 'Sipariş no, tedarikçi ya da kalem', okuma: ['satin-alma.oku', 'satin-alma.yaz'] },
  'uretim-kaydi': { baslik: 'Üretim kayıtları', simge: 'clipboard-check', ara: 'Biten emir no ya da malzeme', okuma: ADIMLI_OKUMA_ISLEMLERI },
  plan: { baslik: 'Plan (7 gün)', simge: 'calendar', ara: 'Planlı emir no ya da malzeme', okuma: ['plan.oku', 'plan.yaz'] },
};
const KAYNAK_ADI: Record<HazirKaynak, { baslik: string; kaynak: string; simge: SimgeAdi; ton: 'bilgi' | 'uyari' | 'tamam' | 'pasif' }> = {
  cizim: { baslik: 'Çizim ve 3B', kaynak: 'Çizim Merkezi', simge: 'ruler', ton: 'bilgi' },
  talimat: { baslik: 'Talimat medyası', kaynak: 'Rota', simge: 'book', ton: 'bilgi' },
  'adim-foto': { baslik: 'Adım fotoğrafları', kaynak: 'Üretim', simge: 'camera', ton: 'tamam' },
  'satin-alma': { baslik: 'Sipariş satırı belgeleri', kaynak: 'Satın alma', simge: 'cart', ton: 'uyari' },
  irsaliye: { baslik: 'Mal kabul irsaliyeleri', kaynak: 'Stok', simge: 'truck', ton: 'tamam' },
  parti: { baslik: 'Parti sertifikaları', kaynak: 'Stok', simge: 'tag', ton: 'tamam' },
  klasor: { baslik: 'Sipariş ve proje klasörü', kaynak: 'Klasör', simge: 'layers', ton: 'pasif' },
};

const uzanti = (d: HazirDosya): string => (d.dosyaTuru ?? d.ad.slice(d.ad.lastIndexOf('.') + 1)).toLowerCase();
const RESIM = new Set(['png', 'jpeg', 'jpg', 'webp']);
type Onizleme = 'pdf' | 'resim' | null;
const onizlemeTuru = (d: HazirDosya): Onizleme => (uzanti(d) === 'pdf' ? 'pdf' : RESIM.has(uzanti(d)) ? 'resim' : null);
const dosyaSimgesi = (d: HazirDosya): SimgeAdi => {
  const u = uzanti(d);
  if (['step', 'stl', 'iges', 'glb', 'gltf'].includes(u)) return 'cube';
  if (RESIM.has(u)) return 'camera';
  return 'file';
};

// İndirme kaynağın ucundan, sunucunun ekli cevabıyla; yetkiyi o uç yeniden denetler.
function indir(d: HazirDosya): void {
  const a = document.createElement('a');
  a.href = `/api${d.indir}`;
  a.rel = 'noopener';
  a.click();
}

export function useHazirListeler(): HazirListe[] {
  const yetki = useYetki();
  return (Object.keys(HAZIR_LISTE_TANIMLARI) as HazirListe[]).filter((l) => yetki.herhangi(...HAZIR_LISTE_TANIMLARI[l].okuma));
}

export function HazirMenu({ secili }: { secili: HazirListe | null }) {
  const listeler = useHazirListeler();
  if (listeler.length === 0) return null;
  return (
    <Kart baslik="Hazır listeler" simge="list">
      <nav className="tc-od-hazir-menu" aria-label="Hazır listeler">
        {listeler.map((l) => (
          <Link key={l} to={`/ortak-dosyalar/hazir/${l}`} aria-current={secili === l ? 'page' : undefined}>
            <Simge ad={HAZIR_LISTE_TANIMLARI[l].simge} boyut="k" />
            <span>{HAZIR_LISTE_TANIMLARI[l].baslik}</span>
          </Link>
        ))}
      </nav>
    </Kart>
  );
}

// PDF ve resim tarayıcıda gösterilir; içerik oturumla okunur, nesne adresiyle açılır (sunucuda dönüştürme yok).
function OnizlemePaneli({ dosya, kaynak, kapat }: { dosya: HazirDosya; kaynak: string; kapat: () => void }) {
  const tur = onizlemeTuru(dosya);
  const [adres, adresYaz] = useState<string | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const kutu = useRef<HTMLElement>(null);
  // Dar ekranda çekmece listenin altına düşer; açılınca görünür yere kaydırılır.
  useEffect(() => {
    const k = kutu.current;
    if (k !== null && getComputedStyle(k).position === 'static') k.scrollIntoView?.({ block: 'start' });
  }, []);
  useEffect(() => {
    if (tur === null) return undefined;
    const iptal = new AbortController();
    let url: string | null = null;
    ikiliOku(dosya.indir, iptal.signal)
      .then((v) => { url = URL.createObjectURL(new Blob([new Uint8Array(v)], { type: tur === 'pdf' ? 'application/pdf' : `image/${uzanti(dosya) === 'jpg' ? 'jpeg' : uzanti(dosya)}` })); adresYaz(url); })
      .catch((h: unknown) => { if (!iptal.signal.aborted) hataYaz(hataIletisi(h, 'Dosya okunamadı')); });
    return () => { iptal.abort(); if (url !== null) URL.revokeObjectURL(url); };
  }, [dosya, tur]);
  return (
    <aside ref={kutu} className="tc-od-cekmece" aria-label={`${dosya.ad} önizleme`}>
      <Kart
        baslik={dosya.ad}
        simge={dosyaSimgesi(dosya)}
        sag={<Dugme simge="x" aria-label="Önizlemeyi kapat" title="Kapat" onClick={kapat} />}
      >
        {dosya.bilgi !== null && <p className="tc-od-ipucu">{dosya.bilgi}</p>}
        <div className="tc-od-onizleme">
          {tur === null && <p className="tc-od-bos">Bu tür tarayıcıda gösterilmez; indirip açın.</p>}
          {tur !== null && hata !== null && <DurumKutusu durum="hata" mesaj={hata} />}
          {tur !== null && hata === null && adres === null && <DurumKutusu durum="yukleniyor" />}
          {tur === 'pdf' && adres !== null && <iframe title={dosya.ad} src={adres} />}
          {tur === 'resim' && adres !== null && <img src={adres} alt={dosya.ad} />}
        </div>
        <div className="tc-od-arac">
          <Dugme tur="birincil" simge="download" onClick={() => indir(dosya)}>İndir</Dugme>
          {dosya.ac !== null && <Link className="tc-od-kayda-git" to={dosya.ac}><Simge ad="next" boyut="k" />{`${kaynak}'nde aç`}</Link>}
        </div>
      </Kart>
    </aside>
  );
}

function KayitDosyalari({ liste, anahtar }: { liste: HazirListe; anahtar: string }) {
  const [suz, suzYaz] = useState<HazirKaynak | null>(null);
  const [onizle, onizleYaz] = useState<HazirDosya | null>(null);
  const q = useQuery({
    queryKey: anahtarlar.hazirKayit(liste, anahtar),
    queryFn: () => api.get<HazirDosyalarCevabi>(`/ortak-dosyalar/hazir/${liste}/${encodeURIComponent(anahtar)}`),
  });
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Kaydın dosyaları okunamadı')} />;
  const { kayit, kayitYolu, gruplar, kesildi, klasor } = q.data;
  const onizleKaynak = onizle === null ? null : gruplar.find((g) => g.dosyalar.some((d) => d.indir === onizle.indir))?.kaynak ?? null;
  const toplam = gruplar.reduce((t, g) => t + g.dosyalar.length, 0);
  const gorunen = suz === null ? gruplar : gruplar.filter((g) => g.kaynak === suz);
  return (
    <div className="tc-od-hazir-kayit">
      <div className="tc-od-hazir-bas">
        <div>
          <h2 className="mono">{kayit.no}</h2>
          <p className="tc-od-ipucu">{[kayit.baslik, kayit.alt, `${String(toplam)} dosya`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="tc-od-arac">
          {kayitYolu !== null && <Link className="tc-od-kayda-git" to={kayitYolu}><Simge ad="next" boyut="k" />Kayda git</Link>}
          {klasor !== null && (
            <Link className="tc-od-kayda-git" to={`/ortak-dosyalar?klasor=${String(klasor.id)}`}>
              <Simge ad="layers" boyut="k" />{klasor.tur === 'proje' ? 'Proje klasörü' : 'Sipariş klasörü'}
            </Link>
          )}
        </div>
      </div>
      {gruplar.length > 1 && (
        <div className="tc-od-cipler" role="group" aria-label="Kaynağa göre süz">
          <button type="button" aria-pressed={suz === null} onClick={() => suzYaz(null)}>Hepsi {toplam}</button>
          {gruplar.map((g) => (
            <button key={g.kaynak} type="button" aria-pressed={suz === g.kaynak} onClick={() => suzYaz(g.kaynak)}>
              {KAYNAK_ADI[g.kaynak].baslik} {g.dosyalar.length}
            </button>
          ))}
        </div>
      )}
      {toplam === 0 && <p className="tc-od-bos">Bu kayıtta görebileceğiniz dosya yok.</p>}
      {gorunen.map((g) => (
        <section key={g.kaynak} className="tc-od-hazir-grup" aria-label={KAYNAK_ADI[g.kaynak].baslik}>
          <h3><Simge ad={KAYNAK_ADI[g.kaynak].simge} boyut="k" />{KAYNAK_ADI[g.kaynak].baslik}</h3>
          <ul>
            {g.dosyalar.map((d) => (
              <li key={d.indir} aria-current={onizle?.indir === d.indir ? 'true' : undefined}>
                <span className="tc-od-hazir-ikon"><Simge ad={dosyaSimgesi(d)} boyut="k" /></span>
                <span className="tc-od-hazir-ad">
                  <strong>{d.ad}</strong>
                  <span className="tc-od-ipucu">
                    {d.bilgi !== null && <span>{d.bilgi}</span>}
                    <Rozet ton={KAYNAK_ADI[g.kaynak].ton}>{KAYNAK_ADI[g.kaynak].kaynak}</Rozet>
                    {d.zaman !== null && <time className="mono tc-od-mobil-gizle">{zamanMetni(d.zaman)}</time>}
                  </span>
                </span>
                <span className="tc-od-hazir-is">
                  <Dugme simge="eye" aria-label={`${d.ad} önizle`} title="Önizle" onClick={() => onizleYaz(d)} />
                  <Dugme simge="download" aria-label={`${d.ad} indir`} title="İndir" onClick={() => indir(d)} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {kesildi && <p className="tc-od-ipucu">Liste uzun; ilk dosyalar gösteriliyor. Kalanı kaydın kendi ekranında.</p>}
      <p className="tc-od-ipucu tc-od-aciklama"><Simge ad="lock" boyut="k" />Yetkiniz olmayan kaynaklardaki dosyalar listede görünmez.</p>
      {onizle !== null && (
        <OnizlemePaneli key={onizle.indir} dosya={onizle} kaynak={onizleKaynak === null ? 'Kaynak' : KAYNAK_ADI[onizleKaynak].kaynak} kapat={() => onizleYaz(null)} />
      )}
    </div>
  );
}

export function HazirListeGorunumu({ liste, anahtar }: { liste: HazirListe; anahtar: string | null }) {
  const git = useNavigate();
  const [ara, araYaz] = useState('');
  const t = HAZIR_LISTE_TANIMLARI[liste];
  const q = useQuery({
    queryKey: anahtarlar.hazirKayitlar(liste, ara.trim()),
    queryFn: () => api.get<HazirKayitlarCevabi>(`/ortak-dosyalar/hazir/${liste}${ara.trim() === '' ? '' : `?ara=${encodeURIComponent(ara.trim())}`}`),
  });
  const sec = (a: string) => { void git(`/ortak-dosyalar/hazir/${liste}?kayit=${encodeURIComponent(a)}`); };
  return (
    <div className="tc-od-hazir-kap">
    <div className={`tc-od-hazir${anahtar === null ? '' : ' tc-od-hazir-secili'}`}>
      <div className="tc-od-hazir-liste">
        <label className="tc-od-ara">
          <Simge ad="search" boyut="k" />
          <input type="search" placeholder={t.ara} aria-label={t.ara} value={ara} onChange={(o) => araYaz(o.target.value)} />
        </label>
        {anahtar !== null && (
          <Link className="tc-od-kayda-git tc-od-listeye-don" to={`/ortak-dosyalar/hazir/${liste}`}><Simge ad="chev-left" boyut="k" />Listeye dön</Link>
        )}
        {q.isPending && <DurumKutusu durum="yukleniyor" />}
        {q.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Liste okunamadı')} />}
        {q.isSuccess && (q.data.kayitlar.length === 0
          ? <p className="tc-od-bos">{ara.trim() === '' ? 'Listede kayıt yok.' : 'Aramaya uyan kayıt yok.'}</p>
          : (
            <ul aria-label={t.baslik}>
              {q.data.kayitlar.map((k) => (
                <li key={k.anahtar}>
                  <button type="button" aria-current={anahtar === k.anahtar ? 'true' : undefined} onClick={() => sec(k.anahtar)}>
                    <Simge ad={t.simge} boyut="k" />
                    <span><strong className="mono">{k.no}</strong> <span>{k.baslik}</span></span>
                    {k.alt !== null && <span className="tc-od-ipucu">{k.alt}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {q.isSuccess && q.data.daha && <p className="tc-od-ipucu">Daha fazla kayıt var; aramayı daraltın.</p>}
      </div>
      {anahtar === null
        ? <p className="tc-od-bos tc-od-mobil-gizle">Dosyalarını görmek için listeden bir kayıt seçin.</p>
        : <KayitDosyalari key={anahtar} liste={liste} anahtar={anahtar} />}
    </div>
    </div>
  );
}
