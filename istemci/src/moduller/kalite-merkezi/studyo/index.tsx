import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { KmParcaKaynagi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KmMerkezBelgesi, KmNumune, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { DurumKutusu, Dugme, OnayPenceresi, Rozet, Secim, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import type { Balon } from '../../../ortak/cizim/kurallar.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { tarihSaatMetni } from '../../../ortak/veri/zaman-metni.ts';
import { useParcaKaynaklari } from '../yeni/parcalar/kaynak.ts';
import { MalzemeSecici } from '../yeni/parcalar/MalzemeSecici.tsx';
import type { EkranOzellikleri, KmSayaci } from '../yeni/sekmeler.ts';
import { Resim, useKaliteFormu, type OlcumYazici } from './KaliteFormu.tsx';
import { NUMUNE_DURUMU, numuneKuraliMetni, planGirdileri, uretimEmriKimligi } from './kurallar.ts';
import { CmmPlani } from './CmmPlani.tsx';
import { CmmYukle } from './CmmYukle.tsx';
import { MerkezdenAl } from './MerkezdenAl.tsx';
import { useBalonPlaniYaz, useEmirNumuneleri, useOlcumYaz, useResimAl, useResimKaldir, useStudyoParcasi } from './veri.ts';
import './studyo.css';

// Resim ve modeller (597 a): Arkon çizim stüdyosunun düzeni; solda parça, resimler ve üretim emri, ortada Arkon'la ortak teknik resim
// görüntüleyicisi (616 b), sağda numune planı ve numuneler. Kontrol planını onay yetkisi olan düzenler ve kaydeder; seçili emre ölçüm
// yazma yetkisiyle yazılır (603 a).
// Telefonda üç sütun sekmeyle değişir.
type MobilGorunum = 'dosya' | 'resim' | 'plan';

// Geniş ekranda yan sütunlar katlanır, resim tam genişliğe çıkar (1738 c): üç sütunda resim balonlanamayacak kadar küçük kalır. Varsayılan
// kapalıdır; tercih yalnız bu tarayıcıda tutulur, depolama kullanılamıyorsa varsayılan geçerlidir.
const YAN_PANEL_ANAHTARI = 'kalite-merkezi:studyo-yan-panel';
function yanPanelOku(): boolean {
  try { return window.localStorage.getItem(YAN_PANEL_ANAHTARI) === 'acik'; } catch { return false; }
}
function yanPanelYaz(acik: boolean): void {
  try { window.localStorage.setItem(YAN_PANEL_ANAHTARI, acik ? 'acik' : 'kapali'); } catch { /* depolama yok: yalnız bu açılışta geçerli */ }
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
  const [cmm, cmmYaz] = useState<'yukle' | 'plan' | null>(null);
  const [yanAcik, yanAcikYaz] = useState(yanPanelOku);
  const yanDegistir = () => { const y = !yanAcik; yanAcikYaz(y); yanPanelYaz(y); };

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
  const numuneler = useEmirNumuneleri(uretimEmriId);
  const { bildir } = useBildirim();

  // Görüntüleyicideki plan değişikliği kaydedilene dek taslaktır; resim ya da sürümü değişince düşer.
  const duzenler = yetki.onayla;
  const [taslak, taslakYaz] = useState<Balon[] | null>(null);
  useEffect(() => { taslakYaz(null); }, [resim?.id, resim?.surum]);
  const planYaz = useBalonPlaniYaz(malzemeNo);
  const planKaydet = () => {
    if (!resim || !taslak) return;
    planYaz.mutate({ resim, balonlar: planGirdileri(resim.balonlar, taslak) }, {
      onSuccess: () => { taslakYaz(null); bildir('tamam', 'Kontrol planı kaydedildi.'); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Kontrol planı kaydedilemedi.')); },
    });
  };

  // Resim alma ve kaldırma kalite onayıdır (603 a).
  const [merkez, merkezYaz] = useState(false);
  const [kaldirilacak, kaldirilacakYaz] = useState<KmResim | null>(null);
  const resimAl = useResimAl();
  const resimKaldir = useResimKaldir();
  const al = (b: KmMerkezBelgesi) => {
    if (malzemeNo === null) return;
    resimAl.mutate({ malzemeNo, belge: b }, {
      onSuccess: ({ resim: r }) => { merkezYaz(false); resimIdYaz(r.id); bildir('tamam', `${r.ad} parçaya alındı.`); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Resim alınamadı.')); },
    });
  };
  const kaldir = () => {
    if (!kaldirilacak) return;
    resimKaldir.mutate(kaldirilacak, {
      onSuccess: ({ resim: r }) => { kaldirilacakYaz(null); resimIdYaz(null); bildir('tamam', `${r.ad} parçadan kaldırıldı.`); },
      onError: (h) => { kaldirilacakYaz(null); bildir('hata', hataIletisi(h, 'Resim kaldırılamadı.')); },
    });
  };

  // Ölçüm kalite formunun kaydıdır (798); stüdyo Kalite Merkezi ucuna yazar.
  const olcumYaz = useOlcumYaz();
  const yaz: OlcumYazici = useCallback((g) => olcumYaz.mutateAsync(g), [olcumYaz.mutateAsync]);
  const engel = useCallback(() => (taslak !== null ? 'Ölçümden önce kontrol planını kaydedin.' : yetki.yaz ? null : 'Ölçüm yazma yetkiniz yok.'), [taslak, yetki.yaz]);
  const { olcumler, balonlar, gosterilen, olcumlerYaz } = useKaliteFormu({ resim, uretimEmriId, yaz, engel });

  const emirSec = (kimlik: string) => {
    const y = new URLSearchParams(adres);
    if (kimlik) y.set('emir', kimlik); else y.delete('emir');
    adresYaz(y, { replace: true });
  };

  const bos = malzemeNo === null ? 'Parça seçin' : parca.isPending ? 'Yükleniyor' : parca.isError ? undefined : 'Bu parçaya alınmış resim ya da model yok.';

  return (
    <div className={`km-st km-st-m-${mobil}${yanAcik ? '' : ' km-st-genis'}`}>
      <div className="km-st-mseg" role="tablist" aria-label="Görünüm">
        {([['dosya', 'Parça'], ['resim', 'Resim'], ['plan', 'Plan']] as const).map(([k, ad]) => (
          <button key={k} type="button" role="tab" aria-selected={mobil === k} className={mobil === k ? 'on' : ''} onClick={() => { mobilYaz(k); }}>{ad}</button>
        ))}
      </div>

      <aside id="km-st-sol" className="km-st-sol" aria-label="Parça ve resimler">
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
                  <li key={r.id} className="km-st-belge-satir">
                    <button type="button" className={`km-st-belge${r.id === resim?.id ? ' cur' : ''}`} aria-pressed={r.id === resim?.id} onClick={() => { resimIdYaz(r.id); mobilYaz('resim'); }}>
                      <span className={`km-st-tur km-st-tur-${r.tur}`}><Simge ad={r.tur === 'resim' ? 'file' : 'cube'} boyut="k" /></span>
                      <span className="km-st-belge-ad"><b>{r.ad}</b><small>{[r.revizyon ? `Rev ${r.revizyon}` : null, `${String(r.balonlar.length)} kontrol noktası`].filter(Boolean).join(' · ')}</small></span>
                    </button>
                    {duzenler ? (
                      <button type="button" className="km-st-kaldir" aria-label={`${r.ad} resmini kaldır`} onClick={() => { kaldirilacakYaz(r); }}><Simge ad="trash" boyut="k" /></button>
                    ) : null}
                  </li>
                ))}</ul>
              ) : <span className="km-st-soluk">{parca.isPending ? 'Yükleniyor' : 'Belge merkezinden alınmış resim yok.'}</span>}
            {duzenler && kart ? <Dugme tur="ikincil" simge="plus" onClick={() => { merkezYaz(true); }}>Belge merkezinden al</Dugme> : null}
          </section>
        ) : null}

        {kart ? (
          <section className="km-st-kart">
            <span className="km-st-baslik">Üretim emri</span>
            {emirler.length ? (
              <Secim etiket="Ölçümleri gösterilen emir" value={emir?._id ?? ''} onChange={(o) => { emirSec(o.target.value); }}
                secenekler={emirler.map((e) => ({ deger: e._id, baslik: `${e.no ?? e._id} · ${e.durum ?? ''}` }))} />
            ) : <span className="km-st-soluk">Bu parçanın iş emri yok.</span>}
            {resim && uretimEmriId !== null && yetki.yaz ? (
              <Dugme tur="ikincil" simge="upload" disabled={taslak !== null} onClick={() => { cmmYaz('yukle'); }}>CMM sonucu yükle</Dugme>
            ) : null}
            {resim ? <Dugme tur="ikincil" simge="printer" onClick={() => { cmmYaz('plan'); }}>CMM ölçüm planı</Dugme> : null}
          </section>
        ) : null}
      </aside>

      <section className="km-st-orta" aria-label="Teknik resim">
        <div className="km-st-orta-ust">
          <Dugme tur="ikincil" simge="layers" aria-expanded={yanAcik} aria-controls="km-st-sol km-st-sag" onClick={yanDegistir}>
            {yanAcik ? 'Yan panelleri gizle' : 'Yan panelleri göster'}
          </Dugme>
          {!yanAcik && kart ? <span className="km-st-soluk"><b className="km-st-kod">{kart.kod}</b>{resim ? ` · ${resim.ad}` : ''}{emir ? ` · ${emir.no ?? ''}` : ''}</span> : null}
        </div>
        {taslak !== null ? (
          <div className="km-st-taslak" role="status">
            <Simge ad="edit" boyut="k" />
            <span>Kontrol planında kaydedilmemiş değişiklik · {String(taslak.length)} nokta</span>
            <Dugme tur="ikincil" simge="x" disabled={planYaz.isPending} onClick={() => { taslakYaz(null); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={planYaz.isPending} onClick={planKaydet}>Planı kaydet</Dugme>
          </div>
        ) : null}
        {resim ? (
          <Resim resim={resim} yerYaz={duzenler && taslak === null} kontrol={{
            balonlar: taslak ?? balonlar, balonlarYaz: (b) => { taslakYaz(b); }, olcumler: gosterilen, olcumlerYaz, saltOkunur: !duzenler,
          }} />
        ) : <DurumKutusu durum="bos" mesaj={bos ?? 'Resimler alınamadı.'} />}
      </section>

      <aside id="km-st-sag" className="km-st-sag" aria-label="Numune planı ve numuneler">
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

      <MerkezdenAl acik={merkez} kapat={() => { merkezYaz(false); }} al={al} alinan={resimAl.isPending ? resimAl.variables.belge.id : null} />
      <OnayPenceresi
        acik={kaldirilacak !== null} baslik="Resmi parçadan kaldır" onayMetni="Kaldır" tehlikeli yukleniyor={resimKaldir.isPending}
        onayla={kaldir} vazgec={() => { kaldirilacakYaz(null); }}
      >
        <p>{kaldirilacak?.ad} parçanın resimlerinden kaldırılır. Kontrol planı ve ölçümler silinmez; resim yeniden alınınca geri gelir.</p>
      </OnayPenceresi>
      {resim && uretimEmriId !== null ? (
        <CmmYukle acik={cmm === 'yukle'} kapat={() => { cmmYaz(null); }} uretimEmriId={uretimEmriId} emirAdi={emir?.no ?? emir?._id ?? ''} resim={resim} />
      ) : null}
      {resim ? <CmmPlani acik={cmm === 'plan'} kapat={() => { cmmYaz(null); }} resim={resim} /> : null}
      <MalzemeSecici acik={secici} kapat={() => { seciciYaz(false); }} sec={(k) => { seciciYaz(false); parcaSec(k.malzemeNo); }} />
    </div>
  );
}
