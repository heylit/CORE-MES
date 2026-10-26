import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KmParcaKaynagi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KmNumune, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { DurumKutusu, Dugme, Rozet, Secim, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import type { Balon, Olcum } from '../../../ortak/cizim/kurallar.ts';
import type { TeknikResimKontrolu } from '../../../ortak/cizim/TeknikResim.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { tarihSaatMetni } from '../../../ortak/veri/zaman-metni.ts';
import { useParcaKaynaklari } from '../yeni/parcalar/kaynak.ts';
import { MalzemeSecici } from '../yeni/parcalar/MalzemeSecici.tsx';
import type { EkranOzellikleri, KmSayaci } from '../yeni/sekmeler.ts';
import {
  cizimBalonu, cizimOlcumleri, NUMUNE_DURUMU, numuneKuraliMetni, planGirdileri, sonOlcumler, uretimEmriKimligi, yeniOlcumler,
} from './kurallar.ts';
import { useBalonPlaniYaz, useEmirNumuneleri, useEmirOlcumleri, useOlcumYaz, useResimDosyasi, useStudyoParcasi } from './veri.ts';
import './studyo.css';

// Resim ve modeller (597 a): Arkon çizim stüdyosunun düzeni; solda parça, resimler ve üretim emri, ortada Arkon'la ortak teknik resim
// görüntüleyicisi (616 b), sağda numune planı ve numuneler. Kontrol planını onay yetkisi olan düzenler ve kaydeder; seçili emre ölçüm
// yazma yetkisiyle yazılır (603 a).
// Telefonda üç sütun sekmeyle değişir.
type MobilGorunum = 'dosya' | 'resim' | 'plan';

const TeknikResim = lazy(async () => ({ default: (await import('../../../ortak/cizim/TeknikResim.tsx')).TeknikResim }));
const BOS_SATIR: readonly never[] = [];

// Resmin dosyası gelince ortak parçaya verilir; parça dosyayı adının uzantısından (PDF, STEP, IGES, STL) tanır.
function Resim({ resim, kontrol }: { resim: KmResim; kontrol: Omit<TeknikResimKontrolu, 'anahtar' | 'dosyalar' | 'anaResim'> }) {
  const dosya = useResimDosyasi(resim);
  if (dosya.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(dosya.error, 'Resim dosyası alınamadı')} yenile={() => { void dosya.refetch(); }} />;
  if (!dosya.data) return <DurumKutusu durum="yukleniyor" />;
  const tam: TeknikResimKontrolu = {
    ...kontrol,
    anahtar: `km-resim-${String(resim.id)}-${resim.ozet}`,
    dosyalar: [{ kind: resim.tur === 'resim' ? 'pdf' : 'model', name: resim.ad, bytes: dosya.data, merkez: resim.merkezBelgeId, merkezOzet: resim.ozet }],
    anaResim: resim.ad,
  };
  return <Suspense fallback={<DurumKutusu durum="yukleniyor" />}><TeknikResim kontrol={tam} /></Suspense>;
}

function NumuneSatiri({ n }: { n: KmNumune }) {
  const d = NUMUNE_DURUMU[n.durum];
  return (
    <li className="km-st-numune">
      <div className="km-st-numune-ust"><b>{n.neden}</b><Rozet ton={d.ton}>{d.ad}</Rozet>{n.kritik ? <Rozet ton="hata">Kritik</Rozet> : null}</div>
      <span className="km-st-soluk">Op {n.opNo} · {n.balonlar.length} ölçü{n.parcaSayisi !== null ? ` · ${String(n.parcaSayisi)}. parça` : ''} · {tarihSaatMetni(n.istendi)}</span>
      {n.karar ? <span className="km-st-soluk">{n.karar.kisi ?? '—'} · {tarihSaatMetni(n.karar.zaman)}{n.karar.not ? ` · ${n.karar.not}` : ''}</span> : null}
    </li>
  );
}

export const ResimVeModellerSayaci: KmSayaci = null;

export function ResimVeModeller({ veri, yetki, gecis, gecisTamam }: EkranOzellikleri) {
  const [adres, adresYaz] = useSearchParams();
  const malzemeNo = Number(adres.get('parca')) || null;
  const emirKimligi = adres.get('emir');
  const [resimId, resimIdYaz] = useState<number | null>(null);
  const [secici, seciciYaz] = useState(false);
  const [mobil, mobilYaz] = useState<MobilGorunum>('resim');

  const parcaSec = (no: number) => {
    const y = new URLSearchParams(adres);
    y.set('parca', String(no));
    y.delete('emir');
    adresYaz(y, { replace: true });
    resimIdYaz(null);
  };

  // Başka görünümden "şu parçanın resmi" geçişi (malzeme kartı numarasıyla) bir kez işlenir.
  useEffect(() => {
    if (!gecis) return;
    const no = gecis.on?.malzemeNo;
    if (typeof no === 'number') parcaSec(no);
    gecisTamam();
  }, [gecis]);

  const kart: KmParcaKaynagi | undefined = useParcaKaynaklari(malzemeNo === null ? [] : [malzemeNo]).get(malzemeNo ?? 0);
  const parca = useStudyoParcasi(malzemeNo);
  const resimler = useMemo(() => (parca.data?.resimler ?? []).filter((r) => r.aktif), [parca.data]);
  const resim = resimler.find((r) => r.id === resimId) ?? resimler[0] ?? null;

  // Parçanın iş emirleri: Üretim emirleri'nden gelen satırlar, stok kodu kartınkiyle aynı olanlar (596).
  const emirler = useMemo(
    () => (kart ? veri.emir.filter((e) => e.tip === 'İş emri' && e.parcaNo === kart.kod && uretimEmriKimligi(e._id) !== null) : []),
    [veri.emir, kart],
  );
  const emir = emirler.find((e) => e._id === emirKimligi) ?? emirler.find((e) => e.durum === 'Açık') ?? emirler[0] ?? null;
  const uretimEmriId = emir ? uretimEmriKimligi(emir._id) : null;
  const olcumler = useEmirOlcumleri(uretimEmriId);
  const numuneler = useEmirNumuneleri(uretimEmriId);
  const sonlar = useMemo(() => sonOlcumler(olcumler.data?.olcumler ?? []), [olcumler.data]);
  const kmBalonlari = resim?.balonlar ?? BOS_SATIR;
  const balonlar = useMemo(() => kmBalonlari.map(cizimBalonu), [kmBalonlari]);
  const kayitli = useMemo(() => cizimOlcumleri(kmBalonlari, sonlar), [kmBalonlari, sonlar]);
  // Gönderilen ölçüm sunucu cevabına dek ekranda kalır; ret gelirse geri alınır.
  const [bekleyen, bekleyenYaz] = useState<Record<number, Olcum>>({});
  const gosterilen = useMemo(() => ({ ...kayitli, ...bekleyen }), [kayitli, bekleyen]);
  const { bildir } = useBildirim();

  // Görüntüleyicideki plan değişikliği kaydedilene dek taslaktır; resim ya da sürümü değişince düşer.
  const duzenler = yetki.onayla;
  const [taslak, taslakYaz] = useState<Balon[] | null>(null);
  useEffect(() => { taslakYaz(null); }, [resim?.id, resim?.surum]);
  const planYaz = useBalonPlaniYaz(malzemeNo);
  const planKaydet = () => {
    if (!resim || !taslak) return;
    planYaz.mutate({ resim, balonlar: planGirdileri(kmBalonlari, taslak) }, {
      onSuccess: () => { taslakYaz(null); bildir('tamam', 'Kontrol planı kaydedildi.'); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Kontrol planı kaydedilemedi.')); },
    });
  };

  const olcumYaz = useOlcumYaz();
  const olcumlerYaz = useCallback((yeni: Record<number, Olcum>) => {
    if (taslak !== null) { bildir('bilgi', 'Ölçümden önce kontrol planını kaydedin.'); return; }
    if (uretimEmriId === null) { bildir('bilgi', 'Ölçüm yazmak için üretim emri seçin.'); return; }
    if (!yetki.yaz) { bildir('bilgi', 'Ölçüm yazma yetkiniz yok.'); return; }
    const satirlar = yeniOlcumler(kmBalonlari, gosterilen, yeni);
    if (!satirlar.length) return;
    const nolar = Object.keys(yeni).map(Number).filter((no) => yeni[no] !== gosterilen[no]);
    bekleyenYaz((o) => ({ ...o, ...Object.fromEntries(nolar.map((no) => [no, yeni[no]])) }));
    const birak = () => { bekleyenYaz((o) => Object.fromEntries(Object.entries(o).filter(([no]) => !nolar.includes(Number(no))))); };
    olcumYaz.mutate({ uretimEmriId, olcumler: satirlar }, {
      onSuccess: birak,
      onError: (h) => { birak(); bildir('hata', hataIletisi(h, 'Ölçüm kaydedilemedi.')); },
    });
  }, [taslak, uretimEmriId, yetki.yaz, kmBalonlari, gosterilen, olcumYaz, bildir]);
  useEffect(() => { bekleyenYaz({}); }, [resim?.id, uretimEmriId]);

  const emirSec = (kimlik: string) => {
    const y = new URLSearchParams(adres);
    if (kimlik) y.set('emir', kimlik); else y.delete('emir');
    adresYaz(y, { replace: true });
  };

  const bos = malzemeNo === null ? 'Parça seçin' : parca.isPending ? 'Yükleniyor' : parca.isError ? undefined : 'Bu parçaya alınmış resim ya da model yok.';

  return (
    <div className={`km-st km-st-m-${mobil}`}>
      <div className="km-st-mseg" role="tablist" aria-label="Görünüm">
        {([['dosya', 'Parça'], ['resim', 'Resim'], ['plan', 'Plan']] as const).map(([k, ad]) => (
          <button key={k} type="button" role="tab" aria-selected={mobil === k} className={mobil === k ? 'on' : ''} onClick={() => { mobilYaz(k); }}>{ad}</button>
        ))}
      </div>

      <aside className="km-st-sol" aria-label="Parça ve resimler">
        <section className="km-st-kart">
          <span className="km-st-baslik">Parça</span>
          {kart ? <div className="km-st-parca"><b className="km-st-kod">{kart.kod}</b><span>{kart.ad ?? '—'}</span></div>
            : malzemeNo !== null ? <span className="km-st-soluk">Kart yükleniyor</span> : <span className="km-st-soluk">Malzemeler kartından seçilir.</span>}
          <Dugme tur="ikincil" simge="box" onClick={() => { seciciYaz(true); }}>{malzemeNo === null ? 'Parça seç' : 'Parça değiştir'}</Dugme>
        </section>

        {malzemeNo !== null ? (
          <section className="km-st-kart">
            <span className="km-st-baslik">Resim ve modeller</span>
            {parca.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(parca.error, 'Resimler alınamadı')} yenile={() => { void parca.refetch(); }} />
              : resimler.length ? (
                <ul className="km-st-liste">{resimler.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={`km-st-belge${r.id === resim?.id ? ' cur' : ''}`} aria-pressed={r.id === resim?.id} onClick={() => { resimIdYaz(r.id); mobilYaz('resim'); }}>
                      <span className={`km-st-tur km-st-tur-${r.tur}`}><Simge ad={r.tur === 'resim' ? 'file' : 'cube'} boyut="k" /></span>
                      <span className="km-st-belge-ad"><b>{r.ad}</b><small>{[r.revizyon ? `Rev ${r.revizyon}` : null, `${String(r.balonlar.length)} kontrol noktası`].filter(Boolean).join(' · ')}</small></span>
                    </button>
                  </li>
                ))}</ul>
              ) : <span className="km-st-soluk">{parca.isPending ? 'Yükleniyor' : 'Belge merkezinden alınmış resim yok.'}</span>}
          </section>
        ) : null}

        {kart ? (
          <section className="km-st-kart">
            <span className="km-st-baslik">Üretim emri</span>
            {emirler.length ? (
              <Secim etiket="Ölçümleri gösterilen emir" value={emir?._id ?? ''} onChange={(o) => { emirSec(o.target.value); }}
                secenekler={emirler.map((e) => ({ deger: e._id, baslik: `${e.no ?? e._id} · ${e.durum ?? ''}` }))} />
            ) : <span className="km-st-soluk">Bu parçanın iş emri yok.</span>}
          </section>
        ) : null}
      </aside>

      <section className="km-st-orta" aria-label="Teknik resim">
        {taslak !== null ? (
          <div className="km-st-taslak" role="status">
            <Simge ad="edit" boyut="k" />
            <span>Kontrol planında kaydedilmemiş değişiklik · {String(taslak.length)} nokta</span>
            <Dugme tur="ikincil" simge="x" disabled={planYaz.isPending} onClick={() => { taslakYaz(null); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={planYaz.isPending} onClick={planKaydet}>Planı kaydet</Dugme>
          </div>
        ) : null}
        {resim ? (
          <Resim resim={resim} kontrol={{
            balonlar: taslak ?? balonlar, balonlarYaz: (b) => { taslakYaz(b); }, olcumler: gosterilen, olcumlerYaz, saltOkunur: !duzenler,
          }} />
        ) : <DurumKutusu durum="bos" mesaj={bos ?? 'Resimler alınamadı.'} />}
      </section>

      <aside className="km-st-sag" aria-label="Numune planı ve numuneler">
        <section className="km-st-kart">
          <span className="km-st-baslik">Numune planı</span>
          {parca.data?.numunePlanlari.length ? parca.data.numunePlanlari.map((p) => (
            <div key={p.opNo} className="km-st-plan">
              <b>Op {p.opNo}</b>
              {p.kurallar.length ? <ul className="km-st-liste">{p.kurallar.map((k) => <li key={k.kimlik}>{numuneKuraliMetni(k)}</li>)}</ul> : <span className="km-st-soluk">Kural yok</span>}
            </div>
          )) : <span className="km-st-soluk">{malzemeNo === null ? 'Parça seçin.' : 'Numune planı tanımlı değil.'}</span>}
        </section>
        <section className="km-st-kart">
          <span className="km-st-baslik">Numuneler{emir ? ` · ${emir.no ?? ''}` : ''}</span>
          {uretimEmriId === null ? <span className="km-st-soluk">Üretim emri seçilmedi.</span>
            : numuneler.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(numuneler.error, 'Numuneler alınamadı')} yenile={() => { void numuneler.refetch(); }} />
              : numuneler.data?.numuneler.length ? <ul className="km-st-liste">{numuneler.data.numuneler.map((n) => <NumuneSatiri key={n.id} n={n} />)}</ul>
                : <span className="km-st-soluk">{numuneler.isPending ? 'Yükleniyor' : 'Bu emirde numune isteği yok.'}</span>}
          {olcumler.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(olcumler.error, 'Ölçümler alınamadı')} yenile={() => { void olcumler.refetch(); }} /> : null}
        </section>
      </aside>

      <MalzemeSecici acik={secici} kapat={() => { seciciYaz(false); }} sec={(k) => { seciciYaz(false); parcaSec(k.malzemeNo); }} />
    </div>
  );
}
