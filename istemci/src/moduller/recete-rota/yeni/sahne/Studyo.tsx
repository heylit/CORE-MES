import { Suspense, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GeometriModelSatiri } from '#paylasilan/sozlesme/geometri.ts';
import type { SahneAdimi, TalimatlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Pencere, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { dosyaYukle, MontajOynatici as Sahne3B, type SahneDenetimi } from '../../../belge-merkezi/disari.ts';
import { anahtarlar as talimatAnahtarlari, useTalimatKomutu } from '../sartnameler/veri.ts';
import type { ParcaKutusu } from './kurallar.ts';
import { donguSuresi, hareketYaz, kaydedilecekler, SAHNE_SINIRI, SAHNE_YONLERI, parcaDegistir, sahneEksigi, sahneOner, VARSAYILAN_HAREKET } from './kurallar.ts';
import { useModelDosyasi, useSahneKaydet, useSahneler, useUrunModelleri } from './veri.ts';
import { tuvalKaydet, videoDesteklenirMi, videoluTaslak } from './video.ts';
import './sahne.css';

// 3B Adım Stüdyosu (3209 a, "A Adım şeridi"): yayındaki talimat sürümünün adımlarına montaj modelinden parça, giriş yönü, mesafe ve süre
// bağlanır. Kayıt yeni sahne sürümüdür (yalnız eklenir); talimat metni ve kontrol noktaları bugünkü talimat düzenleyicisinde kalır.
// Telefonda yalnız izlenir: düzenleme denetimleri dar ekranda gizlidir (Arayüz K3).
type Surum = TalimatlarCevabi['surumler'][number];

const sayi = (x: number, h = 1): string => x.toLocaleString('tr-TR', { minimumFractionDigits: h, maximumFractionDigits: h });

export function Studyo({ urunId, opNo, talimat, yazabilir, kapat }: { urunId: number; opNo: number; talimat: Surum; yazabilir: boolean; kapat: () => void }) {
  const sahneler = useSahneler(urunId, opNo);
  const modeller = useUrunModelleri(urunId);
  const kayitli = sahneler.data?.sahneler.find((s) => s.talimatSurum === talimat.surum) ?? null;
  // Bu sürümün sahnesi yoksa önceki sürümün son sahnesinden başlanır (talimat yeniden yayınlanınca sahne kaybolmasın); kayıt yine bu sürüme gider.
  const onceki = kayitli === null ? (sahneler.data?.sahneler.find((s) => s.talimatSurum < talimat.surum) ?? null) : null;
  const yukleniyor = sahneler.isPending || modeller.isPending;
  return (
    <Pencere acik tur="tam" kapat={kapat} baslik={`OP ${String(opNo)} · 3B adım stüdyosu · talimat sürüm ${String(talimat.surum)}`}>
      {yukleniyor ? <DurumKutusu durum="yukleniyor" mesaj="Sahne ve modeller okunuyor" />
        : sahneler.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(sahneler.error, 'Sahne okunamadı.')} yenile={() => { void sahneler.refetch(); }} />
          : (
            <StudyoGovdesi key={`${String(kayitli?.sahneSurum ?? 0)}`} yazabilir={yazabilir} urunId={urunId} opNo={opNo} talimat={talimat} kapat={kapat}
              kayitliSurum={kayitli?.sahneSurum ?? null} ilkAdimlar={(kayitli ?? onceki)?.adimlar ?? []} ilkModel={(kayitli ?? onceki)?.modelRevizyonId ?? null}
              oncekidenMi={onceki !== null} modeller={modeller.data ?? []} modelHatasi={modeller.isError ? hataIletisi(modeller.error, 'Modeller okunamadı.') : null} />
          )}
    </Pencere>
  );
}

function StudyoGovdesi({ yazabilir, urunId, opNo, talimat, kapat, kayitliSurum, ilkAdimlar, ilkModel, oncekidenMi, modeller, modelHatasi }: {
  yazabilir: boolean; urunId: number; opNo: number; talimat: Surum; kapat: () => void; kayitliSurum: number | null; ilkAdimlar: readonly SahneAdimi[];
  ilkModel: number | null; oncekidenMi: boolean; modeller: readonly GeometriModelSatiri[];
  modelHatasi: string | null;
}) {
  const kaydet = useSahneKaydet(urunId);
  const { bildir } = useBildirim();
  const talimatSiralari = useMemo(() => talimat.adimlar.map((a) => a.sira), [talimat.adimlar]);
  const [adimlar, adimlarYaz] = useState<SahneAdimi[]>(() => ilkAdimlar.filter((a) => talimatSiralari.includes(a.sira)));
  const [modelId, modelYaz] = useState<number | null>(ilkModel ?? modeller[0]?.revizyonId ?? null);
  const [aktif, aktifYaz] = useState<number>(talimatSiralari[0] ?? 1);
  const [oynuyor, oynuyorYaz] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [hayalet, hayaletYaz] = useState(true);
  const [yeniden, yenidenYaz] = useState(0);
  const [kirli, kirliYaz] = useState(oncekidenMi);
  const [hata, hataYaz] = useState<string | null>(null);
  const kutular = useRef<ParcaKutusu[]>([]);
  const [parcaSayisi, parcaSayisiYaz] = useState(0);
  const denetim = useRef<SahneDenetimi | null>(null);
  const [tuvalVar, tuvalVarYaz] = useState(false);
  const [video, videoYaz] = useState<'yok' | 'kayit' | 'yukleme'>('yok');
  const istemci = useQueryClient();
  const talimatKomutu = useTalimatKomutu(urunId);
  const dosya = useModelDosyasi(modelId);

  const degistir = (yeni: SahneAdimi[]) => { adimlarYaz(yeni); kirliYaz(true); hataYaz(null); };
  const hareket = adimlar.find((a) => a.sira === aktif)?.hareket ?? VARSAYILAN_HAREKET;
  const yaz = (d: Partial<typeof hareket>) => { degistir(hareketYaz(adimlar, aktif, d)); };
  const eksik = sahneEksigi(adimlar);
  const kayda = kaydedilecekler(adimlar);
  const adimNo = talimatSiralari.indexOf(aktif);
  const talimatAdimi = talimat.adimlar[adimNo];
  const git = (fark: number) => {
    const s = talimatSiralari[Math.max(0, Math.min(talimatSiralari.length - 1, adimNo + fark))];
    if (s !== undefined) aktifYaz(s);
  };

  const oner = () => {
    if (kutular.current.length === 0) { bildir('hata', 'Model açılmadan öneri yapılamaz.'); return; }
    degistir(sahneOner(kutular.current, talimatSiralari));
    bildir('tamam', 'Sıra ve yön önerildi: en büyük parça gövde kaldı, kalanlar büyükten küçüğe adımlara dağıtıldı. Kaydetmeden önce gözden geçirin.');
  };
  const aciyiKaydet = () => {
    const k = denetim.current?.kameraOku() ?? null;
    if (k === null) return;
    yaz({ kamera: { yatay: Math.max(-7, Math.min(7, k.yatay)), dikey: Math.max(-0.2, Math.min(1.5, k.dikey)), uzaklik: Math.max(10, Math.min(50000, k.uzaklik)) } });
  };
  const sahneyiKaydet = () => {
    if (modelId === null) return;
    hataYaz(null);
    kaydet.mutateAsync({ opNo, talimatSurum: talimat.surum, okunanSahneSurum: kayitliSurum, modelRevizyonId: modelId, adimlar: kayda })
      .then(() => { bildir('tamam', `OP ${String(opNo)} sahnesi kaydedildi (sürüm ${String((kayitliSurum ?? 0) + 1)}). Bu talimat sürümünü alan emirlerde görünür.`); kapat(); })
      .catch((h: unknown) => { hataYaz(hataIletisi(h, 'Sahne kaydedilemedi.')); });
  };

  // Video adımın bir turudur (hareket + bekleme); kayıt sırasında sahne baştan oynar. Video talimat taslağına gider, sahne kaydını beklemez.
  const videoNedeni = !videoDesteklenirMi() ? 'Bu tarayıcı MP4 video kaydedemiyor; Chrome ya da Edge ile deneyin.'
    : !tuvalVar ? 'Model açılınca video kaydedilir.'
      : hareket.parcalar.length === 0 ? 'Bu adımda giren parça yok.' : null;
  const videoKaydet = () => {
    const tuval = denetim.current?.tuval;
    if (tuval === undefined) return;
    hataYaz(null);
    videoYaz('kayit');
    oynuyorYaz(true);
    yenidenYaz((n) => n + 1);
    (async () => {
      const blob = await tuvalKaydet(tuval, donguSuresi(hareket) * 1000);
      videoYaz('yukleme');
      const ozet = await dosyaYukle(new Uint8Array(await blob.arrayBuffer()), () => {});
      const liste = await istemci.fetchQuery({
        queryKey: talimatAnahtarlari.talimat(urunId, opNo), staleTime: 0,
        queryFn: () => api.get<TalimatlarCevabi>(`/rota/urunler/${String(urunId)}/talimatlar/${String(opNo)}`),
      });
      const t = videoluTaslak(liste, talimat.surum, adimNo, opNo, { ozet, ad: `OP${String(opNo)}-adim${String(adimNo + 1)}-3b.mp4` });
      if ('hata' in t) throw new Error(t.hata);
      await talimatKomutu.mutateAsync(t.komut);
      bildir('tamam', `Video ${String(adimNo + 1)}. adıma eklendi (talimat taslağı). Talimat yayınlanınca emre geçer; yeni sürümde sahneyi bir kez kaydedin.`);
    })().catch((h: unknown) => { hataYaz(hataIletisi(h, 'Video eklenemedi.')); }).finally(() => { videoYaz('yok'); });
  };

  const durum = [kayitliSurum === null ? 'kayıtlı sahne yok' : `sahne sürüm ${String(kayitliSurum)}`, kirli ? 'kaydedilmemiş değişiklik var' : null].filter(Boolean).join(' · ');
  return (
    <div className={yazabilir ? 'tc-sh-studyo' : 'tc-sh-studyo tc-sh-salt'}>
      <div className="tc-sh-ust">
        <div className="tc-sh-model">
          {modeller.length > 0
            ? <Secim etiket="Montaj modeli" value={modelId === null ? '' : String(modelId)} onChange={(e) => { modelYaz(Number(e.target.value)); kirliYaz(true); }}
              secenekler={modeller.map((m) => ({ deger: String(m.revizyonId), baslik: `${m.belgeAdi} · rev ${m.revKodu ?? m.harf}` }))} />
            : <p className="tc-sh-not">{modelHatasi ?? 'Bu ürünün Belge Merkezi\'nde yayında 3B modeli yok. Önce montaj STEP dosyasını ürüne bağlayın.'}</p>}
        </div>
        <p className="tc-sh-not">{oncekidenMi ? `Sürüm ${String(talimat.surum)} için sahne yok; önceki sürümün sahnesinden başlandı. ${durum}` : durum}</p>
        <div className="tc-sh-duzen tc-sh-araclar">
          <Dugme simge="bolt" disabled={parcaSayisi === 0} onClick={oner}>Sırayı ve yönü öner</Dugme>
        </div>
      </div>

      <div className="tc-sh-govde">
        <div className="tc-sh-sol">
          <div className="tc-sh-kutu">
            {modelId === null ? <div className="tc-sh-sahne"><DurumKutusu durum="bos" mesaj="Model seçilince sahne açılır." /></div>
              : dosya.isPending ? <div className="tc-sh-sahne"><DurumKutusu durum="yukleniyor" mesaj="Model indiriliyor" /></div>
                : dosya.isError ? <div className="tc-sh-sahne"><DurumKutusu durum="hata" mesaj={hataIletisi(dosya.error, 'Model indirilemedi.')} /></div>
                  : (
                    <Suspense fallback={<div className="tc-sh-sahne"><DurumKutusu durum="yukleniyor" /></div>}>
                      <Sahne3B veri={dosya.data} bicim={modeller.find((m) => m.revizyonId === modelId)?.dosyaTuru ?? 'step'} adimlar={adimlar} aktifSira={aktif} oynuyor={oynuyor} hayalet={hayalet} baslangic={yeniden}
                        secili={hareket.parcalar} etiket={`Adım ${String(adimNo + 1)} hareketi`}
                        parcaTikla={yazabilir ? (p) => { degistir(parcaDegistir(adimlar, aktif, p)); } : undefined}
                        kutularAlici={(k) => { kutular.current = k; parcaSayisiYaz(k.length); }}
                        denetimAlici={(d) => { denetim.current = d; tuvalVarYaz(d !== null); }} />
                    </Suspense>
                  )}
            <div className="tc-sh-ust-yazi"><b>{`Adım ${String(adimNo + 1)} / ${String(talimatSiralari.length)}`}</b>{talimatAdimi ? ` · ${talimatAdimi.baslik}` : ''}</div>
            <div className="tc-sh-alt-yazi">
              <Dugme simge={oynuyor ? 'pause' : 'play'} onClick={() => { oynuyorYaz(!oynuyor); }}>{oynuyor ? 'Durdur' : 'Oynat'}</Dugme>
              <Dugme simge="rotate" onClick={() => { yenidenYaz((n) => n + 1); oynuyorYaz(true); }}>Yeniden</Dugme>
              <Dugme simge="eye" aria-pressed={hayalet} onClick={() => { hayaletYaz(!hayalet); }}>Sonrakiler soluk</Dugme>
              <span className="tc-sh-not tc-sh-duzen">Sürükle: döndür · tekerlek: yakınlaş · tıkla: parçayı bu adıma ekle ya da çıkar</span>
            </div>
          </div>
          <div className="tc-sh-serit" role="list" aria-label="Talimat adımları">
            {talimat.adimlar.map((t, i) => {
              const h = adimlar.find((a) => a.sira === t.sira)?.hareket ?? null;
              const n = h?.parcalar.length ?? 0;
              return (
                <div key={t.sira} role="listitem" className="tc-sh-kart-yeri">
                  <button type="button" className="tc-sh-kart" aria-current={t.sira === aktif} onClick={() => { aktifYaz(t.sira); }}>
                    <span className="tc-sh-kart-no"><span>{`ADIM ${String(i + 1)}`}</span>{h && n > 0 && <span>{`${sayi(h.sureSn)} sn`}</span>}</span>
                    <span className="tc-sh-kart-ad">{t.baslik}</span>
                    <span className="tc-sh-kart-alt"><Simge ad="cube" boyut="k" />{n > 0 && h ? `${String(n)} parça · ${h.yon}` : 'hareket yok'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="tc-sh-panel tc-sh-duzen" aria-label={`Adım ${String(adimNo + 1)} hareketi`}>
          <h3><Simge ad="cube" />{`Adım ${String(adimNo + 1)} hareketi`}</h3>
          <div className="tc-sh-alan">
            <span>Giren parçalar</span>
            <div className="tc-sh-cipler">
              {hareket.parcalar.length === 0 ? <span className="tc-sh-not">Sahnede parçaya tıklayın; bu adımda parça girmiyorsa boş bırakın.</span>
                : hareket.parcalar.map((p) => (
                  <button key={p} type="button" className="tc-sh-cip" aria-label={`${String(p + 1)}. parçayı çıkar`} onClick={() => { degistir(parcaDegistir(adimlar, aktif, p)); }}>
                    {`Parça ${String(p + 1)}`}<Simge ad="x" boyut="k" />
                  </button>
                ))}
            </div>
          </div>
          <div className="tc-sh-alan">
            <span>Giriş yönü</span>
            <div className="tc-sh-yonler">
              {SAHNE_YONLERI.map((y) => (
                <button key={y} type="button" aria-pressed={hareket.yon === y} onClick={() => { yaz({ yon: y }); }}>{y}</button>
              ))}
            </div>
          </div>
          <label className="tc-sh-alan">
            <span>Mesafe <b>{`${String(Math.round(hareket.mesafeMm))} mm`}</b></span>
            <input type="range" min={0} max={Math.min(SAHNE_SINIRI.mesafeMm, 500)} step={5} value={hareket.mesafeMm}
              onChange={(e) => { yaz({ mesafeMm: Number(e.target.value) }); }} />
          </label>
          <label className="tc-sh-alan">
            <span>Süre <b>{`${sayi(hareket.sureSn)} sn`}</b></span>
            <input type="range" min={SAHNE_SINIRI.sureSnAlt} max={6} step={0.1} value={hareket.sureSn}
              onChange={(e) => { yaz({ sureSn: Number(e.target.value) }); }} />
          </label>
          <IsaretKutusu etiket="Parçalar sırayla girsin (cıvata 1-2-3-4)" checked={hareket.sirali} disabled={hareket.parcalar.length < 2}
            onChange={(e) => { yaz({ sirali: e.target.checked }); }} />
          <div className="tc-sh-araclar">
            <Dugme simge="camera" onClick={aciyiKaydet}>{hareket.kamera ? 'Açıyı güncelle' : 'Bu açıyı adıma kaydet'}</Dugme>
            {hareket.kamera && <Dugme onClick={() => { yaz({ kamera: null }); }}>Açıyı kaldır</Dugme>}
          </div>
          <div className="tc-sh-alan">
            <span>Adım videosu</span>
            <Dugme simge="camera" disabled={videoNedeni !== null || video !== 'yok'} yukleniyor={video !== 'yok'} onClick={videoKaydet}>
              {video === 'kayit' ? 'Kaydediliyor…' : video === 'yukleme' ? 'Yükleniyor…' : 'Videoyu kaydet, talimata ekle'}
            </Dugme>
            <span className="tc-sh-not">{videoNedeni ?? 'Zayıf terminal için: adımın bir turu MP4 olarak talimat taslağına eklenir.'}</span>
          </div>
          <div className="tc-sh-araclar">
            <Dugme simge="chev-left" disabled={adimNo <= 0} onClick={() => { git(-1); }}>Önceki adım</Dugme>
            <Dugme simge="chev-right" disabled={adimNo >= talimatSiralari.length - 1} onClick={() => { git(1); }}>Sonraki adım</Dugme>
          </div>
          {talimatAdimi && <p className="tc-sh-not">{`Kontrol noktası ve metin talimatta kalır: ${talimatAdimi.metin ?? 'metin yok'}`}</p>}
        </aside>
      </div>

      <div className="tc-sh-alt">
        {eksik !== null && <p className="tc-sh-hata" role="alert">{eksik}</p>}
        {hata !== null && <p className="tc-sh-hata" role="alert">{hata}</p>}
        {yazabilir && <p className="tc-sh-not tc-sh-dar">Sahne telefonda yalnız izlenir; düzenleme masaüstündedir.</p>}
        <div className="tc-sh-araclar tc-sh-sag">
          <Dugme onClick={kapat}>Kapat</Dugme>
          <span className="tc-sh-duzen">
            <Dugme tur="birincil" simge="check" disabled={modelId === null || eksik !== null || kayda.length === 0 || !kirli} yukleniyor={kaydet.isPending} onClick={sahneyiKaydet}>
              {`Sahneyi kaydet (sürüm ${String((kayitliSurum ?? 0) + 1)})`}
            </Dugme>
          </span>
        </div>
        {kayda.length === 0 && <p className="tc-sh-not tc-sh-duzen">Kaydetmek için en az bir adıma parça bağlayın.</p>}
      </div>
    </div>
  );
}
