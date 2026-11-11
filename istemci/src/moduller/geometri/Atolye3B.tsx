import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import type {
  GeometriAnalizCevabi, GeometriDurumu, GeometriGuncelRevizyonCevabi, GeometriHamCevabi, GeometriModelListeCevabi, GeometriModelSatiri, GeometriOzellik,
  GeometriOzellikCevabi, HamStokOnerisi,
} from '#paylasilan/sozlesme/geometri.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Rozet, SayfaBasligi, Sayfalama, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi, OTURUM_BITTI } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { Yetkili } from '../../ortak/veri/yetki.ts';
import { KucukResimKutusu, useKucukResimler } from '../belge-merkezi/disari.ts';
import { yerlesikKaliteYogunlugu } from '../malzemeler/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CALISMALAR, calismaOku, KOK, type CalismaAdi } from './calismalar.ts';
import {
  agirlikKg, analizKatilari, hamKatisi, agirlikMetni, bagliMetni, buyukSayi, delikMetni, DURUM_ADI, DURUM_TONU, DURUMLAR, FORM_ADI, kutuMetni, pahMetni, radyusMetni, stokOlcuMetni, suruyorMu,
  uzunluk, yogunlukBicimi, yogunlukOku, type Yon3,
} from './gorunum.ts';
import type { Onizleme, ParcaKutusu, ResimAl, Vurgu, YuzDurumu } from './Goruntu3B.tsx';
import { MontajKarti } from './MontajKarti.tsx';
import { YuzeyKarti, type YuzeySahnesi } from './YuzeyKarti.tsx';
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
  // Listedeki önizleme karesi (2396): malzemenin küçük resmi, sayfa için tek istekle; resmi olmayan satırda yer tutucu ikon
  // (kare yokken revizyon başına istek atılıp 404 alınmaz).
  const kareler = useKucukResimler('malzemeler', sorgu.data?.satirlar.map((s) => s.malzemeNo) ?? []);
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
            ? <DurumKutusu durum="bos" mesaj={ara.trim() !== '' || durum !== ''
              ? 'Aramaya ya da süzgece uyan model yok.'
              : "3B modeli olan malzeme yok. Malzeme kartına STEP ya da IGES ekleyip Çizim Merkezi'nde yayınlayın."} />
            : (
              <>
                <ul className="tc-g3b-satirlar">
                  {sorgu.data.satirlar.map((s) => (
                    <li key={`${String(s.malzemeNo)}:${String(s.revizyonId)}`}>
                      <button type="button" className="tc-g3b-satir" aria-current={s.revizyonId === secili ? 'true' : undefined} onClick={() => sec(s)}>
                        <KucukResimKutusu resim={kareler.get(s.malzemeNo) ?? null} ad={`${s.malzemeKodu} önizleme`} />
                        <span className="tc-g3b-satir-metin">
                          <strong>{s.malzemeKodu}</strong>
                          <span>{s.malzemeAdi ?? s.belgeAdi}</span>
                          <span className="tc-g3b-soluk">{s.revKodu ? `Rev ${s.revKodu}` : 'Kodsuz revizyon'} · {s.dosyaTuru.toUpperCase()}{s.malzemeAdi === null ? '' : ` · ${s.belgeAdi}`}</span>
                        </span>
                        <Rozet ton={DURUM_TONU[s.durum]}>{DURUM_ADI[s.durum]}</Rozet>
                      </button>
                    </li>
                  ))}
                </ul>
                <Sayfalama sayfa={sorgu.data.sayfa} sayfaBoyu={sorgu.data.sayfaBoyu} toplam={sorgu.data.toplam} degistir={sayfaYaz} />
              </>
            )}
      <p className="tc-g3b-soluk">Yalnız STEP ve IGES modelleri ölçülür; STL, GLB ve GLTF yüzey ağıdır, bu listede yer almaz.</p>
    </section>
  );
}

// Yeniden hesaplatma Analiz ve Montaj kartında aynı komuttur (sürüm analiz cevabından).
function useYenidenHesapla(revizyonId: number, surum: number | null) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yeniden = useKorumaliKomut<void, GeometriAnalizCevabi>({
    gonder: (_g, d) => api.post<GeometriAnalizCevabi>(`/geometri/analizler/${String(revizyonId)}/yeniden-hesapla`, { surum }, d),
    onSuccess: (c) => {
      istemci.setQueryData(anahtarlar.analiz(revizyonId), c);
      void istemci.invalidateQueries({ queryKey: ['geometri', 'modeller'] });
      bildir('bilgi', 'Model hesap kuyruğuna alındı.');
    },
    onError: (h) => bildir('hata', yetkiyse(h, 'Yeniden hesaplatılamadı.')),
  });
  return { calistir: () => yeniden.mutate(), bekliyor: yeniden.isPending };
}

function AnalizKarti({ cevap, yeniden }: { cevap: GeometriAnalizCevabi; yeniden: { calistir: () => void; bekliyor: boolean } }) {
  const a = cevap.analiz;
  const surer = suruyorMu(cevap.durum);
  return (
    <Kart baslik="Analiz (yaklaşık)" simge="ruler" baslikEki={<Rozet ton={DURUM_TONU[cevap.durum]}>{DURUM_ADI[cevap.durum]}</Rozet>}
      sag={<Yetkili islem="geometri.hesapla"><Dugme tur="ikincil" simge="rotate" yukleniyor={yeniden.bekliyor} disabled={surer} onClick={yeniden.calistir}>Yeniden hesapla</Dugme></Yetkili>}>
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

// 1480: önerinin kalite yoğunluğu; sunucu bilmiyorsa (yerleşik kalite) Malzemeler'in tablosundan, aile ve kalite koduyla.
function useKaliteYogunluklari(oneriler: readonly HamStokOnerisi[]): (o: HamStokOnerisi) => number | null {
  const anahtar = (o: HamStokOnerisi) => `${o.aile ?? ''}|${o.kaliteKodu ?? ''}`;
  const aranan = [...new Set(oneriler.filter((o) => o.yogunluk === null && o.aile !== null && o.kaliteKodu !== null).map(anahtar))].sort();
  const tablo = useQuery({
    queryKey: anahtarlar.yogunluk(aranan),
    queryFn: async () => new Map(await Promise.all(aranan.map(async (k) => {
      const [aile = '', kod = ''] = k.split('|');
      return [k, await yerlesikKaliteYogunlugu(aile, kod)] as const;
    }))),
    enabled: aranan.length > 0,
    staleTime: Infinity,
  });
  return (o) => o.yogunluk ?? tablo.data?.get(anahtar(o)) ?? null;
}

const HAM_NEDEN: Readonly<Record<NonNullable<GeometriHamCevabi['neden']>, string>> = {
  'analiz-yok': 'Analiz gelince hesaplanır.',
  'stok-listesi-yok': 'Ölçüsü girilmiş aktif hammadde kartı yok (Malzemeler, hammadde form ve ölçüleri).',
  'sigan-yok': 'Bu ölçüye sığan hammadde kartı yok.',
};

// Stok listesi aktif hammadde kartlarıdır (1469 a). Pay boşsa sistem ayarı geçerlidir; ekran hangisinin kullanıldığını söyler.
function HamKarti({ revizyonId, analizVar, hacimMm3, onizlemeYaz }: {
  revizyonId: number; analizVar: boolean; hacimMm3: number | null; onizlemeYaz: (o: HamStokOnerisi | null) => void;
}) {
  const [pay, payYaz] = useState('');
  // Yoğunluğu kullanıcı yazar (1446 a, 1468 a), kaydedilmez. Boşken her önerinin kendi kalitesinin yoğunluğu (1480) kullanılır;
  // net ağırlıkta ön değer listedeki ilk öneri (kalite süzgeci seçiliyse o kalite).
  const [yogunlukMetni, yogunlukYaz] = useState('');
  const yazilan = yogunlukOku(yogunlukMetni);
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
  // Önizlemedeki öneri (2396): ilk öneri (en az talaş) önizlenir; kullanıcı başka satırı seçebilir.
  const [onizlenen, onizlenenYaz] = useState<string | null>(null);
  const oneriler = v?.neden === null ? v.oneriler : [];
  const gosterilen = oneriler.find((o) => o.form === onizlenen) ?? oneriler[0] ?? null;
  const gosterilenAnahtari = gosterilen === null ? '' : `${gosterilen.form}:${String(gosterilen.malzemeNo)}:${String(gosterilen.kesimBoyuMm)}`;
  const gosterilenRef = useRef(gosterilen);
  gosterilenRef.current = gosterilen;
  useEffect(() => { onizlemeYaz(gosterilenRef.current); }, [gosterilenAnahtari, onizlemeYaz]);
  useEffect(() => () => onizlemeYaz(null), [onizlemeYaz]);
  const kaliteYogunlugu = useKaliteYogunluklari(v?.oneriler ?? []);
  const onerininYogunlugu = (o: HamStokOnerisi): number | null => yazilan ?? kaliteYogunlugu(o);
  const onDeger = (v?.oneriler ?? []).map((o) => ({ o, ro: kaliteYogunlugu(o) })).find((x) => x.ro !== null) ?? null;
  const yogunluk = yazilan ?? onDeger?.ro ?? null;
  const payIpucu = v === undefined || payMm !== null ? undefined
    : v.payKaynagi === 'ayar' ? `Boş bırakılırsa sistem ayarı: ${uzunluk(v.payMm)} mm` : 'Pay ayarı boş; pay 0 mm alındı.';
  return (
    <Kart baslik="Ham önerisi" simge="box">
      <Girdi etiket="İşleme payı (her yüz, mm)" inputMode="decimal" value={pay} onChange={(o) => payYaz(o.target.value)}
        ipucu={payIpucu} hata={!gecerli ? 'Sıfır ya da pozitif bir sayı yazın.' : undefined} />
      <Girdi etiket="Yoğunluk (g/cm³)" inputMode="decimal" value={yogunlukMetni} onChange={(o) => yogunlukYaz(o.target.value)}
        placeholder={yazilan === null && onDeger !== null ? yogunlukBicimi(onDeger.ro!) : undefined}
        ipucu={yogunlukMetni.trim() === '' && onDeger !== null
          ? `Boş bırakılırsa ${onDeger.o.kalite ?? onDeger.o.kod} kalitesinin yoğunluğu: ${yogunlukBicimi(onDeger.ro!)} g/cm³`
          : 'Yazılınca net ve ham ağırlık görünür (yaklaşık).'}
        hata={yogunlukMetni.trim() !== '' && yazilan === null ? 'Pozitif bir sayı yazın.' : undefined} />
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
                    {yogunluk !== null && (
                      <div><dt>Net ağırlık</dt><dd>{hacimMm3 === null ? 'Hacim yok, hesaplanamadı' : `≈ ${agirlikMetni(agirlikKg(hacimMm3, yogunluk)!)}`}</dd></div>
                    )}
                  </dl>
                  {sorgu.data.neden !== null ? <p className="tc-g3b-soluk">{HAM_NEDEN[sorgu.data.neden]}</p> : (
                    <ul className="tc-g3b-oneriler" aria-label="Stok önerileri">
                      {sorgu.data.oneriler.map((o) => (
                        <li key={o.form}>
                          <span className="tc-g3b-oneri-ust"><Simge ad="box" /> <strong>{FORM_ADI[o.form]}</strong> {stokOlcuMetni(o)}
                            <Dugme simge="eye" className="tc-g3b-oneri-onizle" aria-pressed={gosterilen?.form === o.form} onClick={() => onizlenenYaz(o.form)}>Önizle</Dugme>
                          </span>
                          <span className="tc-g3b-soluk">{o.kod}{o.ad ? ` · ${o.ad}` : ''}{o.kalite ? ` · ${o.kalite}` : ''}</span>
                          {o.kesimBoyuMm !== null && <span>Kesim boyu {uzunluk(o.kesimBoyuMm)} mm</span>}
                          {onerininYogunlugu(o) !== null && <span>Ham ağırlık ≈ {agirlikMetni(agirlikKg(o.hamHacimMm3, onerininYogunlugu(o))!)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {sorgu.data.neden === null && (
                    <p className="tc-g3b-soluk">Önizleme yaklaşıktır: pay her yüzde eşit varsayılır; bağlama, testere ve alın payı çizilmez, kesim planı değildir.</p>
                  )}
                </>
              )}
    </Kart>
  );
}

// Özellikler (2044-2 prototipi): tanınan delik, kademe, havşa, pah ve radyüs; yalnız öneri. Delik satırı modelde vurgulanır (girişte halka
// ve eksen); pah ve radyüsün konumu sunucudan gelmez, yalnız listede durur. Analiz yenilenince (durum değişince) yeniden okunur.
function OzellikKarti({ revizyonId, durum, secili, sec }: {
  revizyonId: number; durum: GeometriDurumu; secili: number | null; sec: (o: GeometriOzellik | null) => void;
}) {
  const surer = suruyorMu(durum);
  const sorgu = useQuery({
    queryKey: [...anahtarlar.ozellik(revizyonId), durum],
    queryFn: () => api.get<GeometriOzellikCevabi>(`/geometri/ozellikler/${String(revizyonId)}`),
    enabled: !surer,
  });
  const oz = sorgu.data?.ozellikler ?? null;
  const ustler = oz?.filter((o) => o.ust === null) ?? [];
  const delikler = ustler.filter((o) => o.tur === 'delik');
  const pahlar = ustler.filter((o) => o.tur === 'pah');
  const radyuslar = ustler.filter((o) => o.tur === 'radyus');
  return (
    <Kart baslik="Özellikler (öneri)" simge="target" baslikEki={oz !== null && !surer ? <Rozet ton="pasif">{ustler.length} özellik</Rozet> : undefined}>
      {surer ? <p className="tc-g3b-soluk">Hesap sürüyor; sonuç gelince burada görünür.</p>
        : sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
          : sorgu.isError ? <DurumKutusu durum="hata" mesaj={yetkiyse(sorgu.error, 'Özellikler okunamadı.')} />
            : oz === null ? <p className="tc-g3b-soluk">Bu modelin yüzleri okunamadı; özellik tanınamadı. Ölçüler Analiz kartında.</p>
              : ustler.length === 0 ? <p className="tc-g3b-soluk">Tanınan delik, pah ya da radyüs yok.</p>
                : (
                  <>
                    <div className="tc-g3b-oz-ozet">
                      <Rozet gorunum="cizgi">{delikler.length} delik</Rozet>
                      <Rozet gorunum="cizgi">{pahlar.length} pah</Rozet>
                      <Rozet gorunum="cizgi">{radyuslar.length} radyüs</Rozet>
                    </div>
                    {delikler.length > 0 && (
                      <>
                        <h3 className="tc-g3b-oz-grup"><Simge ad="target" /> Delikler</h3>
                        <ul className="tc-g3b-oz-liste">
                          {delikler.map((d) => {
                            const m = delikMetni(d);
                            const bagli = oz.filter((o) => o.ust === d.sira);
                            return (
                              <li key={d.sira}>
                                <button type="button" className="tc-g3b-oz-satir" aria-pressed={secili === d.sira} onClick={() => sec(secili === d.sira ? null : d)}>
                                  <Simge ad="target" />
                                  <span className="tc-g3b-oz-metin">
                                    <strong>{m.ust}</strong>
                                    {m.alt !== '' && <span className="tc-g3b-soluk">{m.alt}</span>}
                                    {bagli.length > 0 && (
                                      <span className="tc-g3b-oz-alt">{bagli.map((b) => <Rozet key={b.sira} gorunum="cizgi">{bagliMetni(b)}</Rozet>)}</span>
                                    )}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                    {pahlar.length + radyuslar.length > 0 && (
                      <>
                        <h3 className="tc-g3b-oz-grup"><Simge ad="edit" /> Pah ve radyüs</h3>
                        <ul className="tc-g3b-oz-liste">
                          {[...pahlar.map((o) => ({ o, m: pahMetni(o), simge: 'edit' as const })), ...radyuslar.map((o) => ({ o, m: radyusMetni(o), simge: 'rotate' as const }))]
                            .map(({ o, m, simge }) => (
                              <li key={o.sira} className="tc-g3b-oz-satir tc-g3b-oz-duz">
                                <Simge ad={simge} />
                                <span className="tc-g3b-oz-metin">
                                  <strong>{m.ust}</strong>
                                  {m.alt !== '' && <span className="tc-g3b-soluk">{m.alt}</span>}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                    <p className="tc-g3b-soluk tc-g3b-oz-not">Kesin yüzlerden tanındı; yalnız öneridir, rotaya ve karta yazılmaz. Cep, kanal, diş ve tolerans tanınmaz.</p>
                  </>
                )}
    </Kart>
  );
}

const vurgusu = (o: GeometriOzellik | null): Vurgu | null =>
  o === null || o.konum === null || o.eksen === null || o.capMm === null
    ? null : { konum: o.konum, eksen: o.eksen, capMm: o.capMm, derinlikMm: o.derinlikMm ?? 0 };

// Bağlantıdaki revizyon yayından düştüyse (yeni revizyon yayınlandı) aynı belgenin yayındaki revizyonuna geçilir.
function EskiRevizyon({ revizyonId, yonlendir }: { revizyonId: number; yonlendir: (rev: number) => void }) {
  const { bildir } = useBildirim();
  const guncel = useQuery({
    queryKey: anahtarlar.guncel(revizyonId),
    queryFn: () => api.get<GeometriGuncelRevizyonCevabi>(`/geometri/modeller/${String(revizyonId)}/guncel`),
  });
  const yeni = guncel.data?.revizyonId ?? null;
  useEffect(() => {
    if (yeni === null || yeni === revizyonId) return;
    bildir('bilgi', 'Bağlantıdaki revizyon artık yayında değil; aynı belgenin yayındaki revizyonu açıldı.');
    yonlendir(yeni);
  }, [yeni, revizyonId, yonlendir, bildir]);
  if (guncel.isPending || (yeni !== null && yeni !== revizyonId)) return <DurumKutusu durum="yukleniyor" mesaj="Yayındaki revizyon aranıyor" />;
  return <DurumKutusu durum="bos" mesaj="Bu model artık listede değil: belge arşivde ya da malzeme kartından kaldırılmış." />;
}

// Çalışmanın modeldeki önizlemesi (2396). Boya ve maskede önizleme boyamanın kendisi, montajda seçilen parçaların kutularıdır (kartlar verir).
function useOnizleme(calisma: CalismaAdi, revizyonId: number, cevap: GeometriAnalizCevabi | undefined, ham: HamStokOnerisi | null): Onizleme | null {
  const a = cevap?.analiz ?? null;
  const durum = cevap?.durum;
  const ozellik = useQuery({
    queryKey: [...anahtarlar.ozellik(revizyonId), durum],
    queryFn: () => api.get<GeometriOzellikCevabi>(`/geometri/ozellikler/${String(revizyonId)}`),
    enabled: calisma === 'ozellikler' && durum !== undefined && !suruyorMu(durum),
  });
  const delikler = useMemo(() => (ozellik.data?.ozellikler ?? []).filter((o) => o.tur === 'delik' && o.ust === null).map(vurgusu)
    .filter((v): v is Vurgu => v !== null), [ozellik.data]);
  return useMemo((): Onizleme | null => {
    if (a === null) return null;
    const yon = a.obb.yon as unknown as readonly Yon3[];
    if (calisma === 'analiz') {
      return {
        anahtar: `analiz:${JSON.stringify(a.obb)}:${JSON.stringify(a.kutu)}`, etiket: 'dış kutu ve döndürülmüş kutu', delikler: [],
        katilar: (n) => analizKatilari(yon, [a.obb.a, a.obb.b, a.obb.c], [a.kutu.x, a.kutu.y, a.kutu.z], n),
      };
    }
    if (calisma === 'ham') {
      if (ham === null) return null;
      return {
        anahtar: `ham:${JSON.stringify(ham)}`, etiket: `${FORM_ADI[ham.form]} ${stokOlcuMetni(ham)} (yaklaşık)`, delikler: [],
        katilar: (n) => { const k = hamKatisi(ham, yon, n); return k === null ? [] : [k]; },
      };
    }
    if (calisma === 'ozellikler') {
      return delikler.length === 0 ? null : { anahtar: `delik:${JSON.stringify(delikler)}`, etiket: `${String(delikler.length)} delik`, delikler, katilar: () => [] };
    }
    return null;
  }, [a, calisma, ham, delikler]);
}

function ModelAyrintisi({ satir, revizyonId, yonlendir, calisma }: {
  satir: GeometriModelSatiri | null; revizyonId: number; yonlendir: (rev: number) => void; calisma: CalismaAdi;
}) {
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
  const [secili, seciliYaz] = useState<GeometriOzellik | null>(null);
  const [kutular, kutularYaz] = useState<ParcaKutusu[] | null>(null);
  // Yüzey kartı (2144) görüntüye renk ve seçim verir; görüntü yüz sırası denetiminin sonucunu ve resim alma işlevini geri verir.
  const [yuzeySahnesi, yuzeySahnesiYaz] = useState<YuzeySahnesi | null>(null);
  const [yuzDurumu, yuzDurumuYaz] = useState<YuzDurumu>('bekliyor');
  const [yuzNormalleri, yuzNormalleriYaz] = useState<readonly (Yon3 | null)[] | null>(null);
  const yuzBilgisiYaz = useCallback((d: YuzDurumu, n: readonly (Yon3 | null)[] | null) => { yuzDurumuYaz(d); yuzNormalleriYaz(n); }, []);
  const [resimAl, resimAlYaz] = useState<ResimAl | null>(null);
  const resimAlici = useCallback((al: ResimAl | null) => resimAlYaz(() => al), []);
  const yeniden = useYenidenHesapla(revizyonId, analiz.data?.is?.surum ?? null);
  const [ham, hamYaz] = useState<HamStokOnerisi | null>(null);
  const onizleme = useOnizleme(calisma, revizyonId, analiz.data, ham);
  if (analiz.isPending) return <DurumKutusu durum="yukleniyor" mesaj="Analiz okunuyor" />;
  if (analiz.isError) {
    if (analiz.error instanceof ApiHatasi && analiz.error.durum === 404) return <EskiRevizyon revizyonId={revizyonId} yonlendir={yonlendir} />;
    return <DurumKutusu durum="hata" mesaj={yetkiyse(analiz.error, 'Analiz okunamadı.')} />;
  }
  return (
    <div className="tc-g3b-ayrinti">
      {satir && (
        <p className="tc-g3b-baslik">
          <strong>{satir.malzemeKodu}</strong> {satir.malzemeAdi ?? ''} <span className="tc-g3b-soluk">{satir.revKodu ? `Rev ${satir.revKodu}` : 'Kodsuz revizyon'} · {satir.belgeAdi}</span>
        </p>
      )}
      {dosya.isPending ? <div className="tc-g3b-sahne"><DurumKutusu durum="yukleniyor" mesaj="Model indiriliyor" /></div>
        : dosya.isError ? <div className="tc-g3b-sahne"><DurumKutusu durum="hata" mesaj={yetkiyse(dosya.error, 'Model dosyası alınamadı.')} /></div>
          : (
            <Suspense fallback={<div className="tc-g3b-sahne"><DurumKutusu durum="yukleniyor" /></div>}>
              <Goruntu3B veri={dosya.data} bicim={analiz.data.dosyaTuru} vurgu={calisma === 'ozellikler' ? vurgusu(secili) : null}
                kutular={calisma === 'montaj' ? kutular : null} onizleme={onizleme}
                yuzBoyasi={calisma !== 'yuzey' || yuzeySahnesi === null ? null : { ...yuzeySahnesi.boyasi, durumYaz: yuzBilgisiYaz }}
                arac={calisma === 'yuzey' ? (yuzeySahnesi?.arac ?? null) : null} bilgi={calisma === 'yuzey' ? (yuzeySahnesi?.bilgi ?? null) : null}
                resimAlici={resimAlici} />
            </Suspense>
          )}
      <div className="tc-g3b-kartlar">
        {calisma === 'analiz' && <AnalizKarti cevap={analiz.data} yeniden={yeniden} />}
        {calisma === 'ham' && (
          <HamKarti revizyonId={revizyonId} analizVar={analiz.data.analiz !== null} hacimMm3={analiz.data.analiz?.hacimMm3 ?? null} onizlemeYaz={hamYaz} />
        )}
        {calisma === 'ozellikler' && <OzellikKarti revizyonId={revizyonId} durum={analiz.data.durum} secili={secili?.sira ?? null} sec={seciliYaz} />}
        {calisma === 'yuzey' && (
          <YuzeyKarti revizyonId={revizyonId} durum={analiz.data.durum} revKodu={satir?.revKodu ?? null} yuzDurumu={yuzDurumu} yuzNormalleri={yuzNormalleri}
            sahneYaz={yuzeySahnesiYaz} resimAl={resimAl} />
        )}
        {calisma === 'montaj' && <MontajKarti revizyonId={revizyonId} durum={analiz.data.durum} vurgula={kutularYaz} yenidenHesapla={yeniden} />}
      </div>
    </div>
  );
}

// Alt menü bağlantısı sorgu taşımaz (kabuk maddenin yolunu açar): seçili model sekme boyunca saklanır, çalışma değişince geri yazılır.
const SON_REV = 'geometri.son-rev';
function sonRevOku(): number | null {
  try {
    const x = Number(sessionStorage.getItem(SON_REV));
    return Number.isSafeInteger(x) && x > 0 ? x : null;
  } catch { return null; }
}
function sonRevYaz(rev: number | null): void {
  try {
    if (rev === null) sessionStorage.removeItem(SON_REV); else sessionStorage.setItem(SON_REV, String(rev));
  } catch { /* saklanamazsa yalnız adres kalır */ }
}

// 3D Atölyesi (1432 a, taslak 1444 a; alt menü 2396): solda 3B modeli olan malzemeler, sağda seçilen modelin görüntüsü ve adresteki
// çalışmanın kartı. Bütün çalışmalar aynı ekrandır; görüntü ve analiz çalışmalar arasında ortaktır. Dar ekranda liste ve ayrıntı
// ayrı görünür; ayrıntıda geri düğmesi listeye döner.
export function Atolye3B() {
  const { calisma: parca } = useParams();
  const { search } = useLocation();
  const calisma = calismaOku(parca);
  const [adres, adresYaz] = useSearchParams();
  const rev = Number(adres.get('rev'));
  const adrestekiRev = Number.isSafeInteger(rev) && rev > 0 ? rev : null;
  // Adreste yoksa saklanan model hemen kullanılır (adres sonra yazılır): ayrıntı bir an bile kapanmaz, görüntü yeniden kurulmaz.
  const [bosaldi, bosaldiYaz] = useState(false);
  const revizyonId = adrestekiRev ?? (bosaldi ? null : sonRevOku());
  const [satir, satirYaz] = useState<GeometriModelSatiri | null>(null);
  const sec = (s: GeometriModelSatiri) => { bosaldiYaz(false); satirYaz(s); adresYaz({ rev: String(s.revizyonId) }); };
  const yonlendir = useCallback((rev: number) => { satirYaz(null); adresYaz({ rev: String(rev) }, { replace: true }); }, [adresYaz]);
  useEffect(() => {
    if (revizyonId === null) return;
    sonRevYaz(revizyonId);
    if (adrestekiRev === null) adresYaz({ rev: String(revizyonId) }, { replace: true });
  }, [revizyonId, adrestekiRev, adresYaz]);
  if (calisma === null) return <Navigate to={`${KOK}${search}`} replace />;
  const c = CALISMALAR[calisma];
  return (
    <div className="tc-g3b">
      <SayfaBasligi baslik="3D Atölyesi" simge="expand" alt={`${c.baslik}: ${c.alt}`} />
      <div className={`tc-g3b-izgara${revizyonId === null ? '' : ' tc-g3b-secili'}`}>
        <ModelListesi secili={revizyonId} sec={sec} />
        <section className="tc-g3b-sag" aria-label="Model ayrıntısı">
          {revizyonId === null ? <DurumKutusu durum="bos" mesaj="Soldan bir model seçin." /> : (
            <>
              <Dugme tur="ikincil" simge="chev-left" className="tc-g3b-geri" onClick={() => { sonRevYaz(null); bosaldiYaz(true); satirYaz(null); adresYaz({}); }}>Listeye dön</Dugme>
              <ModelAyrintisi key={revizyonId} revizyonId={revizyonId} satir={satir?.revizyonId === revizyonId ? satir : null} yonlendir={yonlendir} calisma={calisma} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
