import { Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GeometriModelListeCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { SablonSahneHareketi, SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Pencere, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { MontajOynatici as Sahne3B } from '../../../belge-merkezi/disari.ts';
import type { AdimTaslagi } from '../sartnameler/kurallar.ts';
import { onizlemeParcalari, SAHNE_SINIRI, SAHNE_YONLERI, type ParcaKutusu } from './kurallar.ts';
import { useModelDosyasi } from './veri.ts';
import './sahne.css';

// Şablon adımlarının 3B hareketi (3646): yön, mesafe, süre, sıralı ve beklenen parça sayısı. Parça ve kamera modele özgü olduğundan şablona
// yazılmaz; ürün modeli yalnız hareketi görmek için seçilir ve kaydedilmez. Değişiklik düzenleyicinin taslağında kalır, şablon sürümüyle kaydedilir.
export const VARSAYILAN_SABLON_HAREKETI: SablonSahneHareketi = { yon: '+Z', mesafeMm: 80, sureSn: 1.6, sirali: false, parcaSayisi: 1 };

const sayi = (x: number): string => x.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function SablonStudyosu({ kod, adimlar, degistir, kapat, kaydedilmedi }: {
  kod: string; adimlar: readonly AdimTaslagi[]; degistir: (a: AdimTaslagi[]) => void; kapat: () => void; kaydedilmedi: boolean;
}) {
  const modeller = useQuery({
    queryKey: ['recete-rota', 'yeni', 'sablon-studyosu', 'modeller'],
    queryFn: async () => (await api.get<GeometriModelListeCevabi>(`/geometri/modeller?${new URLSearchParams({ sayfaBoyu: '100' }).toString()}`)).satirlar.filter((m) => m.yayinda),
    retry: false,
  });
  const [modelId, modelYaz] = useState<number | null>(null);
  const secilen = modelId ?? modeller.data?.[0]?.revizyonId ?? null;
  const dosya = useModelDosyasi(secilen);
  const [aktif, aktifYaz] = useState(0);
  const [oynuyor, oynuyorYaz] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [yeniden, yenidenYaz] = useState(0);
  const [kutular, kutularYaz] = useState<ParcaKutusu[]>([]);
  // Oynatıcı kutuları her kurulumda bildirir; aynıysa durum değişmez ki yeniden çizim döngüsü olmasın.
  const kutulariAl = (k: ParcaKutusu[]) => { kutularYaz((eski) => (JSON.stringify(eski) === JSON.stringify(k) ? eski : k)); };

  // Kutu kapatılınca değerler bu pencere açıkken saklanır; yeniden açınca geri gelir (kaydetmede kapalı adım null yazılır).
  const [kapatilan, kapatilanYaz] = useState<ReadonlyMap<string, SablonSahneHareketi>>(new Map());
  const seritRef = useRef<HTMLDivElement>(null);
  // Dar ekranda şerit yatay kayar; Önceki/Sonraki ile seçilen adım görünür kalsın.
  useEffect(() => { seritRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }); }, [aktif]);
  const adim = adimlar[aktif];
  const hareket = adim?.sahneHareketi ?? null;
  const yaz = (i: number, h: SablonSahneHareketi | null) => { degistir(adimlar.map((a, j) => (j === i ? { ...a, sahneHareketi: h } : a))); };
  const guncelle = (d: Partial<SablonSahneHareketi>) => { if (hareket !== null) yaz(aktif, { ...hareket, ...d }); };

  const hareketli = adimlar.map((a, i) => ({ a, i })).filter((x) => x.a.sahneHareketi !== null);
  const dilimler = onizlemeParcalari(kutular, hareketli.map((x) => x.a.sahneHareketi?.parcaSayisi ?? 0));
  const onizleme: SahneAdimi[] = hareketli.map((x, k) => {
    const h = x.a.sahneHareketi ?? VARSAYILAN_SABLON_HAREKETI;
    return { sira: x.i + 1, hareket: { parcalar: dilimler[k] ?? [], yon: h.yon, mesafeMm: h.mesafeMm, sureSn: h.sureSn, sirali: h.sirali, kamera: null } };
  });
  const goster = onizleme.find((o) => o.sira === aktif + 1)?.hareket.parcalar ?? [];

  return (
    <Pencere acik tur="tam" kapat={kapat} baslik={`${kod === '' ? 'Yeni şablon' : kod} · 3B hareketler`}>
      <div className="tc-sh-studyo">
        <div className="tc-sh-ust">
          <div className="tc-sh-model">
            {modeller.isError ? <p className="tc-sh-not">{hataIletisi(modeller.error, 'Modeller okunamadı.')} Hareket yine de düzenlenir; önizleme açılmaz.</p>
              : (modeller.data?.length ?? 0) > 0
                ? <Secim etiket="Önizleme modeli (şablona kaydedilmez)" value={secilen === null ? '' : String(secilen)} onChange={(e) => { modelYaz(Number(e.target.value)); }}
                  secenekler={(modeller.data ?? []).map((m) => ({ deger: String(m.revizyonId), baslik: `${m.belgeAdi} · rev ${m.revKodu ?? m.harf}` }))} />
                : <p className="tc-sh-not">Yayında 3B model yok.</p>}
          </div>
        </div>
        <div className="tc-sh-govde">
          <div className="tc-sh-sol">
            <div className="tc-sh-kutu">
              {secilen === null ? <div className="tc-sh-sahne"><DurumKutusu durum="bos" mesaj={(modeller.data?.length ?? 0) > 0 ? 'Önizleme için bir model seçin.' : 'Önizleme kapalı; hareket yine de düzenlenir.'} /></div>
                : dosya.isPending ? <div className="tc-sh-sahne"><DurumKutusu durum="yukleniyor" mesaj="Model indiriliyor" /></div>
                  : dosya.isError ? <div className="tc-sh-sahne"><DurumKutusu durum="hata" mesaj={hataIletisi(dosya.error, 'Model indirilemedi.')} /></div>
                    : (
                      <Suspense fallback={<div className="tc-sh-sahne"><DurumKutusu durum="yukleniyor" /></div>}>
                        <Sahne3B veri={dosya.data} bicim={modeller.data?.find((m) => m.revizyonId === secilen)?.dosyaTuru ?? 'step'} adimlar={onizleme} aktifSira={aktif + 1}
                          oynuyor={oynuyor} hayalet baslangic={yeniden} secili={goster} etiket={`Adım ${String(aktif + 1)} önizlemesi`}
                          kutularAlici={kutulariAl} />
                      </Suspense>
                    )}
              <div className="tc-sh-ust-yazi"><b>{`Adım ${String(aktif + 1)} / ${String(adimlar.length)}`}</b>{adim ? ` · ${adim.baslik || 'Adsız adım'}` : ''}</div>
              <div className="tc-sh-alt-yazi">
                <Dugme simge={oynuyor ? 'pause' : 'play'} onClick={() => { oynuyorYaz(!oynuyor); }}>{oynuyor ? 'Durdur' : 'Oynat'}</Dugme>
                <Dugme simge="rotate" onClick={() => { yenidenYaz((n) => n + 1); oynuyorYaz(true); }}>Yeniden</Dugme>
                <span className="tc-sh-not">Önizlemede parçalar modelden sırayla alınır; ürününüzde parçaları kendiniz seçersiniz.</span>
              </div>
            </div>
            <div ref={seritRef} className="tc-sh-serit" role="list" aria-label="Şablon adımları">
              {adimlar.map((t, i) => {
                const h = t.sahneHareketi ?? null;
                return (
                  <div key={t.anahtar} role="listitem" className="tc-sh-kart-yeri">
                    <button type="button" className="tc-sh-kart" aria-current={i === aktif} onClick={() => { aktifYaz(i); }}>
                      <span className="tc-sh-kart-no"><span>{`ADIM ${String(i + 1)}`}</span>{h && <span>{`${sayi(h.sureSn)} sn`}</span>}</span>
                      <span className="tc-sh-kart-ad">{t.baslik || 'Adsız adım'}</span>
                      <span className="tc-sh-kart-alt"><Simge ad="cube" boyut="k" />{h ? `${String(h.parcaSayisi)} parça · ${h.yon}` : 'hareket yok'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="tc-sh-panel" aria-label={`Adım ${String(aktif + 1)} hareketi`}>
            <h3><Simge ad="cube" />{`Adım ${String(aktif + 1)} hareketi`}</h3>
            <IsaretKutusu etiket="Bu adımın 3B hareketi var" checked={hareket !== null}
              onChange={(e) => {
                if (e.target.checked) { yaz(aktif, (adim && kapatilan.get(adim.anahtar)) ?? VARSAYILAN_SABLON_HAREKETI); return; }
                if (adim && hareket) kapatilanYaz(new Map(kapatilan).set(adim.anahtar, hareket));
                yaz(aktif, null);
              }} />
            {hareket !== null && (
              <>
                <div className="tc-sh-alan">
                  <span>Giriş yönü</span>
                  <div className="tc-sh-yonler">
                    {SAHNE_YONLERI.map((y) => (
                      <button key={y} type="button" aria-pressed={hareket.yon === y} onClick={() => { guncelle({ yon: y }); }}>{y}</button>
                    ))}
                  </div>
                </div>
                <label className="tc-sh-alan">
                  <span>Mesafe <b>{`${String(Math.round(hareket.mesafeMm))} mm`}</b></span>
                  <input type="range" min={0} max={Math.min(SAHNE_SINIRI.mesafeMm, 500)} step={5} value={hareket.mesafeMm} aria-valuetext={`${String(Math.round(hareket.mesafeMm))} mm`} onChange={(e) => { guncelle({ mesafeMm: Number(e.target.value) }); }} />
                </label>
                <label className="tc-sh-alan">
                  <span>Süre <b>{`${sayi(hareket.sureSn)} sn`}</b></span>
                  <input type="range" min={SAHNE_SINIRI.sureSnAlt} max={6} step={0.1} value={hareket.sureSn} aria-valuetext={`${sayi(hareket.sureSn)} sn`} onChange={(e) => { guncelle({ sureSn: Number(e.target.value) }); }} />
                </label>
                <Girdi etiket="Beklenen parça sayısı" type="number" min={0} max={SAHNE_SINIRI.parca} value={String(hareket.parcaSayisi)}
                  onChange={(e) => { guncelle({ parcaSayisi: Math.max(0, Math.min(SAHNE_SINIRI.parca, Math.trunc(Number(e.target.value) || 0))) }); }} />
                <IsaretKutusu etiket="Parçalar sırayla girsin (cıvata 1-2-3-4)" checked={hareket.sirali} disabled={hareket.parcaSayisi < 2}
                  onChange={(e) => { guncelle({ sirali: e.target.checked }); }} />
              </>
            )}
            <div className="tc-sh-araclar">
              <Dugme simge="chev-left" disabled={aktif <= 0} onClick={() => { aktifYaz(aktif - 1); }}>Önceki adım</Dugme>
              <Dugme simge="chev-right" disabled={aktif >= adimlar.length - 1} onClick={() => { aktifYaz(aktif + 1); }}>Sonraki adım</Dugme>
            </div>
            <p className="tc-sh-not">Hareketler şablonun yeni sürümüyle kaydedilir. Şablonu talimata kopyalayınca stüdyoda &quot;Şablondan uygula&quot; ile adımlara gelir.</p>
          </aside>
        </div>
        <div className="tc-sh-alt">
          <p className={kaydedilmedi ? 'tc-sh-hata' : 'tc-sh-not'} role="status">
            {kaydedilmedi ? 'Hareket değişiklikleri henüz kaydedilmedi: şablon düzenleyicide "Yeni sürümü kaydet"e basınca şablona yazılır.' : 'Hareketlerde kaydedilmemiş değişiklik yok.'}
          </p>
          <div className="tc-sh-araclar tc-sh-sag"><Dugme tur="birincil" simge="check" onClick={kapat}>Bitti</Dugme></div>
        </div>
      </div>
    </Pencere>
  );
}
