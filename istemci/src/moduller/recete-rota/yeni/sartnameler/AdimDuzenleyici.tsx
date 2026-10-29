import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { KontrolNoktasi } from '#paylasilan/sozlesme/rota.ts';
import { CokSatir, Dugme, Girdi, IsaretKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { DosyaHatasi, dosyaYukle } from '../../../cizimler/disari.ts';
import {
  adimArkasinaTasi, adimTasi, AZAMI_ADIM_MEDYASI, AZAMI_KONTROL_SECENEGI, AZAMI_TALIMAT_ADIMI, bosAdim, KONTROL_ADLARI, KONTROL_TURLERI, kontrolKur, kontrolOzeti, MEDYA_IPUCU, medyaAdresi, medyaHatasi, medyaTuru, sayiOku, videoSuresiHatasi,
  type AdimTaslagi,
} from './kurallar.ts';

// Adım adım talimat düzenleyicisi (prototip Duzenleyici): solda adım listesi, sağda seçili adımın başlığı, açıklaması, resim ve videosu,
// kontrol noktası. Şablon düzenlemesi ve rota adımının talimatı aynı bileşeni kullanır; kaydet ve yayınla düğmeleri çağıranındır (alt).

interface Ozellikler {
  adimlar: readonly AdimTaslagi[];
  degistir: (adimlar: AdimTaslagi[]) => void;
  // "Şablondan başla" listesi (rota adımında); verilmezse düğme yoktur.
  sablonlar?: ReactNode;
  alt?: ReactNode;
  kapali?: boolean;
}

// Yüklenip henüz kaydedilmemiş medya sunucuda bağsızdır; önizlemesi tarayıcıdaki dosyadan çizilir.
// Sürüklenen adımın sırası bu türle taşınır; başka sürükleme (dosya, rota şeması) bırakılmaz.
const SURUKLE_TURU = 'application/x-tc-talimat-adimi';

const yerelAdresler = new Map<string, string>();
const onizlemeAdresi = (ozet: string): string => yerelAdresler.get(ozet) ?? medyaAdresi(ozet);

function videoSuresi(dosya: File): Promise<number> {
  return new Promise((coz) => {
    const v = document.createElement('video');
    const adres = URL.createObjectURL(dosya);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(adres); coz(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(adres); coz(Number.NaN); };
    v.src = adres;
  });
}

export function AdimDuzenleyici({ adimlar, degistir, sablonlar, alt, kapali = false }: Ozellikler) {
  const [secili, setSecili] = useState(0);
  const [sablonAcik, setSablonAcik] = useState(false);
  const i = Math.min(secili, Math.max(adimlar.length - 1, 0));
  const adim = adimlar[i];
  const yaz = (yeni: Partial<AdimTaslagi>) => { degistir(adimlar.map((a, j) => (j === i ? { ...a, ...yeni } : a))); };
  // Bırakma yeri: adımın sırası ya da 'bas' (listenin başı). Klavye ve dokunmatik yolu yukarı ve aşağı düğmeleridir.
  const [ustunde, setUstunde] = useState<number | 'bas' | null>(null);
  const birak = (veri: string, sonra: number | null) => {
    setUstunde(null);
    if (veri === '') return;
    const t = adimArkasinaTasi(adimlar, Number(veri), sonra);
    degistir(t.liste);
    setSecili(t.yeni);
  };
  const birakmaYeri = (yer: number | 'bas') => (kapali ? {} : {
    onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(SURUKLE_TURU)) { e.preventDefault(); setUstunde(yer); } },
    onDragLeave: () => { setUstunde(null); },
    onDrop: (e: DragEvent) => { e.preventDefault(); birak(e.dataTransfer.getData(SURUKLE_TURU), yer === 'bas' ? null : yer); },
  });
  const ekle = () => {
    if (adimlar.length >= AZAMI_TALIMAT_ADIMI) return;
    degistir([...adimlar, bosAdim()]);
    setSecili(adimlar.length);
  };

  return (
    <div className="tc-st-duz">
      <section className="tc-st-kutu tc-st-duz-liste" aria-label="Talimat adımları">
        <div className="tc-st-satir" data-birak={ustunde === 'bas' ? '' : undefined} {...birakmaYeri('bas')}>
          <h3 className="tc-st-etiket">Talimat · nasıl yapılır</h3>
          <span className="tc-st-soluk">{`${String(adimlar.length)} / ${String(AZAMI_TALIMAT_ADIMI)} adım`}</span>
        </div>
        {!kapali && (
          <div className="tc-st-araclar">
            {sablonlar !== undefined && (
              <Dugme simge="file" aria-expanded={sablonAcik} onClick={() => { setSablonAcik(!sablonAcik); }}>Şablondan başla</Dugme>
            )}
            <Dugme simge="plus" onClick={ekle} disabled={adimlar.length >= AZAMI_TALIMAT_ADIMI}>Adım ekle</Dugme>
          </div>
        )}
        {sablonAcik && sablonlar}
        <ol className="tc-st-adimlar">
          {adimlar.map((a, j) => {
            const kontrol = kontrolOzeti(a.kontrol);
            const resim = a.medya.filter((m) => m.tur === 'resim').length;
            const video = a.medya.length - resim;
            const ozet = [resim ? `${String(resim)} resim` : '', video ? `${String(video)} video` : '', kontrol ?? ''].filter(Boolean).join(' · ');
            return (
              <li key={a.anahtar} data-birak={ustunde === j ? '' : undefined} {...birakmaYeri(j)}>
                <button type="button" className="tc-st-adim-sec" aria-current={j === i ? 'step' : undefined} onClick={() => { setSecili(j); }}
                  draggable={!kapali} title={kapali ? undefined : 'Sürükleyerek taşı; bırakılan adımın ardına girer'}
                  onDragStart={(e) => { e.dataTransfer.setData(SURUKLE_TURU, String(j)); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setUstunde(null); }}>
                  <span className="tc-st-no">{j + 1}</span>
                  <span className="tc-st-adim-metin">
                    <span className="tc-st-kalin">{a.baslik.trim() || 'Başlıksız adım'}</span>
                    <span className="tc-st-soluk">{ozet || 'Yalnız metin'}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="tc-st-kutu tc-st-duz-ayrinti" aria-label="Adım ayrıntısı">
        {adim === undefined ? <p className="tc-st-soluk">Adım yok. Adım ekleyin ya da şablondan başlayın.</p> : (
          <>
            <div className="tc-st-satir">
              <h3 className="tc-st-baslik">{`Adım ${String(i + 1)}`}</h3>
              {!kapali && (
                <div className="tc-st-araclar">
                  <Dugme simge="up" aria-label="Adımı yukarı taşı" disabled={i === 0}
                    onClick={() => { degistir(adimTasi(adimlar, i, -1)); setSecili(i - 1); }} />
                  <Dugme simge="down" aria-label="Adımı aşağı taşı" disabled={i === adimlar.length - 1}
                    onClick={() => { degistir(adimTasi(adimlar, i, 1)); setSecili(i + 1); }} />
                  <Dugme simge="trash" tur="tehlike" aria-label="Adımı sil"
                    onClick={() => { degistir(adimlar.filter((_, j) => j !== i)); setSecili(Math.max(i - 1, 0)); }} />
                </div>
              )}
            </div>
            <Girdi etiket="Başlık" value={adim.baslik} maxLength={120} disabled={kapali} required onChange={(e) => { yaz({ baslik: e.target.value }); }} />
            <CokSatir etiket="Açıklama" value={adim.metin} maxLength={2000} rows={3} disabled={kapali} onChange={(e) => { yaz({ metin: e.target.value }); }} />
            <MedyaAlani adim={adim} kapali={kapali} yaz={(medya) => { yaz({ medya }); }} />
            <KontrolAlani kontrol={adim.kontrol} zorunlu={adim.zorunlu} kapali={kapali} yaz={yaz} />
          </>
        )}
        {alt !== undefined && <div className="tc-st-alt">{alt}</div>}
      </section>
    </div>
  );
}

function MedyaAlani({ adim, kapali, yaz }: { adim: AdimTaslagi; kapali: boolean; yaz: (m: AdimTaslagi['medya']) => void }) {
  const girdi = useRef<HTMLInputElement>(null);
  const [yukleme, setYukleme] = useState<number | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  // Yükleme sürerken adım değişirse sonuç eski adımın son hâline eklenmesin diye en son medya burada tutulur.
  const son = useRef(adim.medya);
  useEffect(() => { son.current = adim.medya; }, [adim.medya]);

  const sec = async (dosya: File) => {
    setHata(null);
    const red = medyaHatasi(dosya, adim.medya.length);
    if (red) { setHata(red); return; }
    const tur = medyaTuru(dosya.type);
    if (tur === null) return;
    if (tur === 'video') {
      const sureHatasi = videoSuresiHatasi(await videoSuresi(dosya));
      if (sureHatasi) { setHata(sureHatasi); return; }
    }
    setYukleme(0);
    try {
      const ozet = await dosyaYukle(new Uint8Array(await dosya.arrayBuffer()), setYukleme);
      yerelAdresler.set(ozet, URL.createObjectURL(dosya));
      if (!son.current.some((m) => m.ozet === ozet)) yaz([...son.current, { ozet, ad: dosya.name.slice(0, 120), tur, boyut: dosya.size }]);
    } catch (h) {
      setHata(h instanceof DosyaHatasi || h instanceof Error ? h.message : 'Dosya yüklenemedi.');
    } finally {
      setYukleme(null);
    }
  };

  return (
    <fieldset className="tc-st-alan">
      <legend>Resim ve video</legend>
      <div className="tc-st-medyalar">
        {adim.medya.map((m) => (
          <figure key={m.ozet} className="tc-st-medya">
            {m.tur === 'video'
              ? <video src={onizlemeAdresi(m.ozet)} controls preload="metadata" aria-label={m.ad} />
              : <img src={onizlemeAdresi(m.ozet)} alt={m.ad} loading="lazy" />}
            <figcaption>
              <span>{m.ad}</span>
              {!kapali && (
                <button type="button" className="tc-st-kaldir" aria-label={`${m.ad} kaldır`}
                  onClick={() => { yaz(adim.medya.filter((x) => x.ozet !== m.ozet)); }}>
                  <Simge ad="x" boyut="k" />
                </button>
              )}
            </figcaption>
          </figure>
        ))}
        {!kapali && adim.medya.length < AZAMI_ADIM_MEDYASI && (
          <button type="button" className="tc-st-yukle" disabled={yukleme !== null} onClick={() => girdi.current?.click()}>
            <Simge ad="upload" />
            {yukleme === null ? 'Resim ya da video ekle' : `Yükleniyor %${String(Math.round(yukleme * 100))}`}
          </button>
        )}
      </div>
      <input ref={girdi} type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4" aria-label="Resim ya da video dosyası"
        onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void sec(d); }} />
      {hata && <p className="tc-st-hata" role="alert">{hata}</p>}
      <span className="tc-st-soluk">{MEDYA_IPUCU}</span>
    </fieldset>
  );
}

function SinirGirdisi({ etiket, deger, kapali, yaz }: { etiket: string; deger: number | null; kapali: boolean; yaz: (n: number | null) => void }) {
  const metin = deger === null ? '' : String(deger).replace('.', ',');
  const [yerel, setYerel] = useState<string | null>(null);
  const okunan = yerel === null ? null : sayiOku(yerel);
  return (
    <Girdi etiket={etiket} inputMode="decimal" value={yerel ?? metin} disabled={kapali} placeholder="boş"
      hata={okunan === undefined ? 'Sayı girin.' : undefined}
      onChange={(e) => { setYerel(e.target.value); }}
      onBlur={() => { if (yerel !== null) { const n = sayiOku(yerel); if (n !== undefined) yaz(n); } setYerel(null); }} />
  );
}

function KontrolAlani({ kontrol, zorunlu, kapali, yaz }: {
  kontrol: KontrolNoktasi; zorunlu: boolean; kapali: boolean; yaz: (y: Partial<AdimTaslagi>) => void;
}) {
  const kur = (k: KontrolNoktasi) => { yaz({ kontrol: k, ...(k.tur === 'yok' ? { zorunlu: false } : {}) }); };
  return (
    <fieldset className="tc-st-alan tc-st-cerceve">
      <legend>Kontrol noktası</legend>
      <div role="radiogroup" aria-label="Kontrol noktası türü" className="tc-st-turler">
        {KONTROL_TURLERI.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={kontrol.tur === t} className="tc-st-tur" disabled={kapali}
            onClick={() => { kur(kontrolKur(t, kontrol)); }}>
            {KONTROL_ADLARI[t]}
          </button>
        ))}
      </div>
      {kontrol.tur === 'olcum' && (
        <div className="tc-st-olcum">
          <Girdi etiket="Ölçü" value={kontrol.ad} maxLength={60} disabled={kapali} onChange={(e) => { kur({ ...kontrol, ad: e.target.value }); }} />
          <SinirGirdisi etiket="Alt sınır" deger={kontrol.alt} kapali={kapali} yaz={(alt) => { kur({ ...kontrol, alt }); }} />
          <SinirGirdisi etiket="Üst sınır" deger={kontrol.ust} kapali={kapali} yaz={(ust) => { kur({ ...kontrol, ust }); }} />
          <Girdi etiket="Birim" value={kontrol.birim} maxLength={12} disabled={kapali} onChange={(e) => { kur({ ...kontrol, birim: e.target.value }); }} />
        </div>
      )}
      {kontrol.tur === 'foto' && (
        <Girdi etiket="Ne çekilecek" value={kontrol.aciklama ?? ''} maxLength={120} disabled={kapali}
          onChange={(e) => { kur({ ...kontrol, aciklama: e.target.value === '' ? null : e.target.value }); }} />
      )}
      {kontrol.tur === 'secim' && (
        <div className="tc-st-secenekler">
          {kontrol.secenekler.map((s, j) => (
            <div key={j} className="tc-st-secenek">
              <Girdi etiket={`Seçenek ${String(j + 1)}`} value={s} maxLength={60} disabled={kapali}
                onChange={(e) => { kur({ ...kontrol, secenekler: kontrol.secenekler.map((x, k) => (k === j ? e.target.value : x)) }); }} />
              {!kapali && kontrol.secenekler.length > 2 && (
                <Dugme simge="x" aria-label={`Seçenek ${String(j + 1)} kaldır`}
                  onClick={() => { kur({ ...kontrol, secenekler: kontrol.secenekler.filter((_, k) => k !== j) }); }} />
              )}
            </div>
          ))}
          {!kapali && kontrol.secenekler.length < AZAMI_KONTROL_SECENEGI && (
            <Dugme simge="plus" onClick={() => { kur({ ...kontrol, secenekler: [...kontrol.secenekler, ''] }); }}>Seçenek ekle</Dugme>
          )}
        </div>
      )}
      {kontrol.tur !== 'yok' && (
        <IsaretKutusu etiket="Zorunlu: geçilmeden sonraki adıma geçilmez" checked={zorunlu} disabled={kapali}
          onChange={(e) => { yaz({ zorunlu: e.target.checked }); }} />
      )}
    </fieldset>
  );
}
