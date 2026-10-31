import { lazy, Suspense, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type {
  GeometriAnalizCevabi, GeometriDurumu, GeometriHamCevabi, GeometriModelListeCevabi, GeometriModelSatiri,
} from '#paylasilan/sozlesme/geometri.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Rozet, SayfaBasligi, Sayfalama, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi, OTURUM_BITTI } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { buyukSayi, DURUM_ADI, DURUM_TONU, DURUMLAR, FORM_ADI, kutuMetni, stokOlcuMetni, suruyorMu, uzunluk } from './gorunum.ts';
import './geometri.css';

const Goruntu3B = lazy(() => import('./Goruntu3B.tsx'));
const YENILEME_MS = 5000;

async function ikiliOku(yol: string, sinyal?: AbortSignal): Promise<Uint8Array> {
  const c = await fetch(`/api${yol}`, { credentials: 'include', ...(sinyal ? { signal: sinyal } : {}) });
  if (!c.ok) {
    if (c.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    throw new ApiHatasi(c.status, null);
  }
  return new Uint8Array(await c.arrayBuffer());
}

const yetkiyse = (hata: unknown, ekran: string): string =>
  hata instanceof ApiHatasi && hata.durum === 403 ? '3D Atölyesi için yetkiniz yok.' : hataIletisi(hata, ekran);

function ModelListesi({ secili, sec }: { secili: number | null; sec: (s: GeometriModelSatiri) => void }) {
  const [sayfa, sayfaYaz] = useState(1);
  const [ara, araYaz] = useState('');
  const [durum, durumYaz] = useState('');
  const sorgu = useQuery({
    queryKey: anahtarlar.modeller(sayfa, ara, durum),
    queryFn: () => {
      const q = new URLSearchParams({ sayfa: String(sayfa) });
      if (ara.trim()) q.set('ara', ara.trim());
      if (durum) q.set('durum', durum);
      return api.get<GeometriModelListeCevabi>(`/geometri/modeller?${q.toString()}`);
    },
    placeholderData: keepPreviousData,
    refetchInterval: (s) => (s.state.data?.satirlar.some((x) => suruyorMu(x.durum)) ? YENILEME_MS : false),
  });
  return (
    <section className="tc-g3b-liste" aria-label="Modeller">
      <div className="tc-g3b-suzgec">
        <Girdi etiket="Ara" type="search" placeholder="Malzeme kodu ya da adı" value={ara} onChange={(o) => { araYaz(o.target.value); sayfaYaz(1); }} />
        <Secim etiket="Durum" value={durum} bosSecenek="Tümü" onChange={(o) => { durumYaz(o.target.value); sayfaYaz(1); }}
          secenekler={DURUMLAR.map((d) => ({ deger: d, baslik: DURUM_ADI[d] }))} />
      </div>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" mesaj="Modeller okunuyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" mesaj={yetkiyse(sorgu.error, 'Model listesi okunamadı.')} yenile={() => { void sorgu.refetch(); }} />
          : sorgu.data.satirlar.length === 0
            ? <DurumKutusu durum="bos" mesaj="3B modeli olan malzeme yok. Malzeme kartına STEP ya da IGES ekleyip Çizim Merkezi'nde yayınlayın." />
            : (
              <>
                <ul className="tc-g3b-satirlar">
                  {sorgu.data.satirlar.map((s) => (
                    <li key={`${String(s.malzemeNo)}:${String(s.revizyonId)}`}>
                      <button type="button" className="tc-g3b-satir" aria-current={s.revizyonId === secili ? 'true' : undefined} onClick={() => sec(s)}>
                        <Simge ad="cube" />
                        <span className="tc-g3b-satir-metin">
                          <strong>{s.malzemeKodu}</strong>
                          <span>{s.malzemeAdi ?? s.belgeAdi}</span>
                          <span className="tc-g3b-soluk">Rev {s.harf} · {s.dosyaTuru.toUpperCase()}</span>
                        </span>
                        <Rozet ton={DURUM_TONU[s.durum]}>{DURUM_ADI[s.durum]}</Rozet>
                      </button>
                    </li>
                  ))}
                </ul>
                <Sayfalama sayfa={sorgu.data.sayfa} sayfaBoyu={sorgu.data.sayfaBoyu} toplam={sorgu.data.toplam} degistir={sayfaYaz} />
              </>
            )}
    </section>
  );
}

function AnalizKarti({ revizyonId, cevap }: { revizyonId: number; cevap: GeometriAnalizCevabi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kimlik] = useState(yeniIstekKimligi);
  const yeniden = useMutation({
    mutationFn: () => tekrarKorumaliGonder(
      (d) => api.post<GeometriAnalizCevabi>(`/geometri/analizler/${String(revizyonId)}/yeniden-hesapla`, { surum: cevap.is?.surum ?? null }, d),
      { istekKimligi: kimlik },
    ),
    onSuccess: (c) => {
      istemci.setQueryData(anahtarlar.analiz(revizyonId), c);
      void istemci.invalidateQueries({ queryKey: ['geometri', 'modeller'] });
      bildir('bilgi', 'Model hesap kuyruğuna alındı.');
    },
    onError: (h) => bildir('hata', yetkiyse(h, 'Yeniden hesaplatılamadı.')),
  });
  const a = cevap.analiz;
  const surer = suruyorMu(cevap.durum);
  return (
    <Kart baslik="Analiz (yaklaşık)" simge="ruler" baslikEki={<Rozet ton={DURUM_TONU[cevap.durum]}>{DURUM_ADI[cevap.durum]}</Rozet>}
      sag={<Dugme tur="ikincil" simge="rotate" yukleniyor={yeniden.isPending} disabled={surer} onClick={() => yeniden.mutate()}>Yeniden hesapla</Dugme>}>
      {cevap.durum === 'hata' && <p className="tc-g3b-hata">{cevap.is?.hataMetni}</p>}
      {a === null ? (
        <p className="tc-g3b-soluk">{surer ? 'Hesap sürüyor; sonuç gelince burada görünür.' : 'Analiz yok.'}</p>
      ) : (
        <dl className="tc-g3b-degerler">
          <div><dt>Dış kutu</dt><dd>{kutuMetni(a.kutu.x, a.kutu.y, a.kutu.z)}</dd></div>
          <div><dt>Döndürülmüş kutu</dt><dd>{kutuMetni(a.obb.a, a.obb.b, a.obb.c)}</dd></div>
          <div><dt>Kapsayan silindir</dt><dd>Ø {uzunluk(a.obb.cap)} x {uzunluk(a.obb.a)} mm</dd></div>
          <div><dt>Hacim</dt><dd>{a.hacimMm3 === null ? 'Model kapalı değil, hesaplanamadı' : buyukSayi(a.hacimMm3, 'mm³')}</dd></div>
          <div><dt>Yüzey alanı</dt><dd>{buyukSayi(a.alanMm2, 'mm²')}</dd></div>
          <div><dt>Gövde</dt><dd>{a.govdeSayisi}</dd></div>
        </dl>
      )}
    </Kart>
  );
}

const HAM_NEDEN: Readonly<Record<NonNullable<GeometriHamCevabi['neden']>, string>> = {
  'analiz-yok': 'Analiz gelince hesaplanır.',
  'stok-listesi-yok': 'Ölçüsü girilmiş aktif hammadde kartı yok (Malzemeler, hammadde form ve ölçüleri).',
  'sigan-yok': 'Bu ölçüye sığan hammadde kartı yok.',
};

// Stok listesi aktif hammadde kartlarıdır (1469 a). Pay boşsa sistem ayarı geçerlidir; ekran hangisinin kullanıldığını söyler.
function HamKarti({ revizyonId, analizVar }: { revizyonId: number; analizVar: boolean }) {
  const [pay, payYaz] = useState('');
  const [kalite, kaliteYaz] = useState('');
  const payMm = pay.trim() === '' ? null : Number(pay.replace(',', '.'));
  // Üst sınırı sunucu denetler (sözleşme PAY_EN_COK_MM); aşan pay sunucunun iletisiyle döner.
  const gecerli = payMm === null || (Number.isFinite(payMm) && payMm >= 0);
  const sorgu = useQuery({
    queryKey: anahtarlar.ham(revizyonId, payMm ?? -1, kalite),
    queryFn: () => {
      const q = new URLSearchParams();
      if (payMm !== null) q.set('payMm', String(payMm));
      if (kalite !== '') q.set('kalite', kalite);
      const ek = q.toString();
      return api.get<GeometriHamCevabi>(`/geometri/ham-onerisi/${String(revizyonId)}${ek === '' ? '' : `?${ek}`}`);
    },
    enabled: gecerli && analizVar,
    placeholderData: keepPreviousData,
  });
  const v = sorgu.data;
  const payIpucu = v === undefined || payMm !== null ? undefined
    : v.payKaynagi === 'ayar' ? `Boş bırakılırsa sistem ayarı: ${uzunluk(v.payMm)} mm` : 'Pay ayarı boş; pay 0 mm alındı.';
  return (
    <Kart baslik="Ham önerisi" simge="box">
      <Girdi etiket="İşleme payı (her yüz, mm)" inputMode="decimal" value={pay} onChange={(o) => payYaz(o.target.value)}
        ipucu={payIpucu} hata={!gecerli ? 'Sıfır ya da pozitif bir sayı yazın.' : undefined} />
      {v !== undefined && v.kaliteler.length > 0 && (
        <Secim etiket="Kalite" value={kalite} bosSecenek="Tüm kaliteler" onChange={(o) => kaliteYaz(o.target.value)}
          secenekler={v.kaliteler.map((k) => ({ deger: k, baslik: k }))} />
      )}
      {!analizVar ? <p className="tc-g3b-soluk">{HAM_NEDEN['analiz-yok']}</p>
        : !gecerli ? null
          : sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
            : sorgu.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Ham önerisi okunamadı.')} />
              : (
                <>
                  <dl className="tc-g3b-degerler">
                    <div><dt>En az ham</dt><dd>{sorgu.data.enAz ? kutuMetni(sorgu.data.enAz.a, sorgu.data.enAz.b, sorgu.data.enAz.c) : '-'}</dd></div>
                  </dl>
                  {sorgu.data.neden !== null ? <p className="tc-g3b-soluk">{HAM_NEDEN[sorgu.data.neden]}</p> : (
                    <ul className="tc-g3b-oneriler" aria-label="Stok önerileri">
                      {sorgu.data.oneriler.map((o) => (
                        <li key={o.form}>
                          <span className="tc-g3b-oneri-ust"><Simge ad="box" /> <strong>{FORM_ADI[o.form]}</strong> {stokOlcuMetni(o)}</span>
                          <span className="tc-g3b-soluk">{o.kod}{o.ad ? ` · ${o.ad}` : ''}{o.kalite ? ` · ${o.kalite}` : ''}</span>
                          {o.kesimBoyuMm !== null && <span>Kesim boyu {uzunluk(o.kesimBoyuMm)} mm</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
    </Kart>
  );
}

function ModelAyrintisi({ satir, revizyonId }: { satir: GeometriModelSatiri | null; revizyonId: number }) {
  const analiz = useQuery({
    queryKey: anahtarlar.analiz(revizyonId),
    queryFn: () => api.get<GeometriAnalizCevabi>(`/geometri/analizler/${String(revizyonId)}`),
    refetchInterval: (s) => (suruyorMu(s.state.data?.durum as GeometriDurumu | undefined) ? YENILEME_MS : false),
  });
  const dosya = useQuery({
    queryKey: anahtarlar.dosya(revizyonId),
    queryFn: ({ signal }) => ikiliOku(`/geometri/modeller/${String(revizyonId)}/dosya`, signal),
    staleTime: Infinity,
    retry: false,
  });
  if (analiz.isPending) return <DurumKutusu durum="yukleniyor" mesaj="Analiz okunuyor" />;
  if (analiz.isError) return <DurumKutusu durum="hata" mesaj={yetkiyse(analiz.error, 'Analiz okunamadı.')} />;
  return (
    <div className="tc-g3b-ayrinti">
      {satir && (
        <p className="tc-g3b-baslik">
          <strong>{satir.malzemeKodu}</strong> {satir.malzemeAdi ?? ''} <span className="tc-g3b-soluk">Rev {satir.harf} · {satir.belgeAdi}</span>
        </p>
      )}
      {dosya.isPending ? <div className="tc-g3b-sahne"><DurumKutusu durum="yukleniyor" mesaj="Model indiriliyor" /></div>
        : dosya.isError ? <div className="tc-g3b-sahne"><DurumKutusu durum="hata" mesaj={yetkiyse(dosya.error, 'Model dosyası alınamadı.')} /></div>
          : (
            <Suspense fallback={<div className="tc-g3b-sahne"><DurumKutusu durum="yukleniyor" /></div>}>
              <Goruntu3B veri={dosya.data} bicim={analiz.data.dosyaTuru} />
            </Suspense>
          )}
      <div className="tc-g3b-kartlar">
        <AnalizKarti revizyonId={revizyonId} cevap={analiz.data} />
        <HamKarti revizyonId={revizyonId} analizVar={analiz.data.analiz !== null} />
      </div>
    </div>
  );
}

// 3D Atölyesi (1432 a, taslak 1444 a): solda 3B modeli olan malzemeler, sağda seçilen modelin görüntüsü, analizi ve ham önerisi.
// Dar ekranda liste ve ayrıntı ayrı görünür; ayrıntıda geri düğmesi listeye döner.
export function Atolye3B() {
  const [adres, adresYaz] = useSearchParams();
  const rev = Number(adres.get('rev'));
  const revizyonId = Number.isSafeInteger(rev) && rev > 0 ? rev : null;
  const [satir, satirYaz] = useState<GeometriModelSatiri | null>(null);
  const sec = (s: GeometriModelSatiri) => { satirYaz(s); adresYaz({ rev: String(s.revizyonId) }); };
  return (
    <div className="tc-g3b">
      <SayfaBasligi baslik="3D Atölyesi" simge="expand" alt="STEP ve IGES modellerinin ölçüsü ve ham önerisi" />
      <div className={`tc-g3b-izgara${revizyonId === null ? '' : ' tc-g3b-secili'}`}>
        <ModelListesi secili={revizyonId} sec={sec} />
        <section className="tc-g3b-sag" aria-label="Model ayrıntısı">
          {revizyonId === null ? <DurumKutusu durum="bos" mesaj="Soldan bir model seçin." /> : (
            <>
              <Dugme tur="ikincil" simge="chev-left" className="tc-g3b-geri" onClick={() => { satirYaz(null); adresYaz({}); }}>Listeye dön</Dugme>
              <ModelAyrintisi key={revizyonId} revizyonId={revizyonId} satir={satir?.revizyonId === revizyonId ? satir : null} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
