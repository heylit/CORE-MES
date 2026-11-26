import { useState } from 'react';
import type { KmBalonGrubu, KmNumuneKurali, KmNumunePlani, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { Dugme, IsaretKutusu, OnayPenceresi, Rozet, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../ortak/veri/api.ts';
import { tarihSaatMetni } from '../../../ortak/veri/zaman-metni.ts';
import { numuneKuraliMetni } from './kurallar.ts';
import {
  ilkParcaAcik, ilkParcaKarari, kurallarAyni, nGerekir, olceniOku, olceniYaz, OLCENLER, olcuSecimi, olcuYaz, planEksigi, SABLONLAR, yeniKural, zamanYaz, ZAMANLAR, type Olcen, type Zaman,
} from './numune-plani.ts';
import { useNumunePlaniGecmisi, useNumunePlaniYaz } from './veri.ts';

// 3689-2 (A): numune planı stüdyonun sağ sütununda op akordeonuyla düzenlenir; aynı anda tek op açıktır. Operasyonlar parçanın yürürlükteki
// rotasındandır; rotada olmayan eski satırlar salt okunur görünür. Yazım `kalite-merkezi.onayla` ister (sunucu da denetler).
type Operasyon = NonNullable<KmStudyoParcaCevabi['operasyonlar']>[number];

function IlkParcaRozeti({ kurallar }: { kurallar: readonly KmNumuneKurali[] }) {
  const k = ilkParcaKarari(kurallar);
  if (k === null) return <Rozet ton="bilgi">Rota seçimi geçerli</Rozet>;
  return <Rozet ton={k ? 'tamam' : 'uyari'}>{k ? 'İlk parça açık' : 'İlk parça yok'}</Rozet>;
}

function KuralSatiri({ k, sira, gruplar, yaz, sil }: {
  k: KmNumuneKurali; sira: number; gruplar: readonly KmBalonGrubu[]; yaz: (k: KmNumuneKurali) => void; sil: () => void;
}) {
  const olcu = olcuSecimi(k.balonlar, gruplar);
  const yanlisKapi = k.kapi === true && k.ne !== 'ilk';
  return (
    <li className="km-np-kural" data-hata={yanlisKapi ? '' : undefined}>
      <div className="km-np-satir">
        <select className="km-np-secim" aria-label={`${String(sira)}. kural ne zaman`} value={k.ne} onChange={(e) => { yaz(zamanYaz(k, e.target.value as Zaman)); }}>
          {ZAMANLAR.map((z) => <option key={z.ne} value={z.ne}>{z.ad}</option>)}
        </select>
        {nGerekir(k.ne) ? (
          <input className="km-np-n" type="number" inputMode="numeric" min={1} aria-label={k.ne === 'sure' ? 'Dakika' : 'Parça sayısı'} value={k.n ?? ''}
            onChange={(e) => { const n = Number.parseInt(e.target.value, 10); yaz({ ...k, n: Number.isNaN(n) ? 0 : n }); }} />
        ) : null}
        <button type="button" className="km-np-sil" aria-label={`${String(sira)}. kuralı sil`} onClick={sil}><Simge ad="trash" boyut="k" /></button>
      </div>
      <div className="km-np-satir">
        <select className="km-np-secim" aria-label={`${String(sira)}. kural kim ölçer`} value={olceniOku(k.kim)} onChange={(e) => { yaz({ ...k, kim: olceniYaz(e.target.value as Olcen) }); }}>
          {OLCENLER.map((o) => <option key={o.deger} value={o.deger}>{o.ad}</option>)}
        </select>
        <select className="km-np-secim" aria-label={`${String(sira)}. kural ölçüler`} value={olcu} onChange={(e) => { yaz({ ...k, balonlar: olcuYaz(e.target.value, k.balonlar, gruplar) }); }}>
          <option value="hepsi">Tüm balonlar</option>
          <option value="kritik">Kritik balonlar</option>
          {gruplar.map((g) => <option key={g.id} value={`g${String(g.id)}`} disabled={g.balonlar.length === 0}>{`Grup ${g.ad} (${String(g.balonlar.length)})`}</option>)}
          {olcu === 'secili' && Array.isArray(k.balonlar) ? <option value="secili">{`Balon ${k.balonlar.join(', ')}`}</option> : null}
        </select>
      </div>
      {k.ne === 'ilk' || yanlisKapi ? (
        <IsaretKutusu etiket="Kalite kararına kadar sayım kilitli (kapı)" checked={k.kapi === true} onChange={(e) => { yaz({ ...k, kapi: e.target.checked }); }} />
      ) : null}
      {yanlisKapi ? <p className="km-np-uyari" role="alert"><Simge ad="alert" boyut="k" />Kapı yalnız ilk parça kuralında olur; kaydetmeden önce kaldırın.</p> : null}
    </li>
  );
}

function Gecmis({ malzemeNo, opNo }: { malzemeNo: number; opNo: number }) {
  const g = useNumunePlaniGecmisi(malzemeNo, opNo);
  if (g.isPending) return <span className="km-st-soluk">Yükleniyor</span>;
  if (g.isError) return <span className="km-st-soluk">{hataIletisi(g.error, 'Geçmiş alınamadı.')}</span>;
  if (g.data.kayitlar.length === 0) return <span className="km-st-soluk">Bu opun plan geçmişi yok.</span>;
  return (
    <ol className="km-np-gecmis" aria-label="Plan geçmişi">
      {g.data.kayitlar.map((k, i) => (
        <li key={`${k.zaman}-${String(i)}`}>
          <span className="km-st-soluk">{tarihSaatMetni(k.zaman)} · {k.kisiAd ?? '—'}</span>
          <span>{k.kurallar === null ? 'Kurallar okunamadı' : k.kurallar.length === 0 ? 'İlk parça yok (kural yok)' : k.kurallar.map(numuneKuraliMetni).join(' / ')}</span>
        </li>
      ))}
    </ol>
  );
}

export function NumunePlani({ malzemeNo, veri, gruplar, duzenler }: {
  malzemeNo: number | null; veri: KmStudyoParcaCevabi | undefined; gruplar: readonly KmBalonGrubu[]; duzenler: boolean;
}) {
  const { bildir } = useBildirim();
  const [acik, acikYaz] = useState<number | null>(null);
  const [taslak, taslakYaz] = useState<KmNumuneKurali[] | null>(null);
  const [gecmis, gecmisYaz] = useState(false);
  const [cakisma, cakismaYaz] = useState(false);
  const [ilkYokOnayi, ilkYokOnayiYaz] = useState(false);
  const yaz = useNumunePlaniYaz(malzemeNo);

  if (malzemeNo === null) return <span className="km-st-soluk">Parça seçin.</span>;
  if (!veri) return <span className="km-st-soluk">Yükleniyor</span>;
  const operasyonlar: readonly Operasyon[] = veri.operasyonlar ?? [];
  const planBul = (opNo: number): KmNumunePlani | null => veri.numunePlanlari.find((p) => p.opNo === opNo) ?? null;
  const rotadaYok = veri.numunePlanlari.filter((p) => !operasyonlar.some((o) => o.opNo === p.opNo));
  const kirli = acik !== null && taslak !== null && !kurallarAyni(taslak, planBul(acik)?.kurallar ?? []);

  const ac = (opNo: number) => {
    if (kirli) return;
    gecmisYaz(false); cakismaYaz(false);
    if (acik === opNo) { acikYaz(null); taslakYaz(null); return; }
    acikYaz(opNo); taslakYaz(planBul(opNo)?.kurallar.map((k) => ({ ...k })) ?? []);
  };
  const vazgec = () => { if (acik !== null) taslakYaz(planBul(acik)?.kurallar.map((k) => ({ ...k })) ?? []); cakismaYaz(false); };
  const kaydet = () => {
    if (acik === null || taslak === null) return;
    ilkYokOnayiYaz(false);
    yaz.mutate({ opNo: acik, surum: planBul(acik)?.surum ?? null, kurallar: taslak }, {
      onSuccess: ({ plan }) => { taslakYaz(plan.kurallar.map((k) => ({ ...k }))); bildir('tamam', `Op ${String(plan.opNo)} numune planı kaydedildi (sürüm ${String(plan.surum)}).`); },
      onError: (h) => {
        if (h instanceof ApiHatasi && h.durum === 409) { cakismaYaz(true); return; }
        bildir('hata', hataIletisi(h, 'Numune planı kaydedilemedi.'));
      },
    });
  };
  const kaydetIste = () => { if (taslak !== null && ilkParcaKarari(taslak) === false) ilkYokOnayiYaz(true); else kaydet(); };
  const eksik = taslak === null ? null : planEksigi(taslak);

  if (operasyonlar.length === 0 && rotadaYok.length === 0) return <span className="km-st-soluk">Parçanın yürürlükte rotası yok; numune planı rotadaki operasyonlara yazılır.</span>;

  return (
    <div className="km-np">
      <ul className="km-np-oplar">
        {operasyonlar.map((o) => {
          const plan = planBul(o.opNo);
          const bu = acik === o.opNo;
          const kurallar = bu && taslak !== null ? taslak : plan?.kurallar ?? [];
          return (
            <li key={o.operasyonId} className="km-np-op" data-acik={bu ? '' : undefined}>
              <button type="button" className="km-np-op-bas" aria-expanded={bu} disabled={kirli && !bu} title={kirli && !bu ? 'Önce kaydedin ya da vazgeçin' : undefined} onClick={() => { ac(o.opNo); }}>
                <Simge ad={bu ? 'down' : 'chev-right'} boyut="k" />
                <b>Op {o.opNo}</b><span className="km-np-op-ad">{o.ad ?? ''}</span>
                {plan === null ? <Rozet ton="bilgi">Plan yok</Rozet> : <IlkParcaRozeti kurallar={plan.kurallar} />}
              </button>
              {bu ? (
                <div className="km-np-govde">
                  {plan === null ? <p className="km-st-soluk">Plan yok: rotadaki eski ilk parça seçimi geçerli. Kaydedince bu plan geçerli olur.</p> : null}
                  {cakisma ? (
                    <div className="km-np-uyari" role="alert">
                      <Simge ad="alert" boyut="k" /><span>Plan siz düzenlerken başka biri tarafından değiştirildi. Güncelini yükleyip değişikliğinizi yeniden yapın.</span>
                      <Dugme tur="ikincil" simge="rotate" onClick={() => { cakismaYaz(false); acikYaz(null); taslakYaz(null); }}>Güncelini yükle</Dugme>
                    </div>
                  ) : null}
                  {duzenler ? (
                    <>
                      <ol className="km-np-kurallar">
                        {kurallar.map((k, i) => (
                          <KuralSatiri key={k.kimlik} k={k} sira={i + 1} gruplar={gruplar}
                            yaz={(y) => { taslakYaz((t) => (t ?? []).map((x) => (x.kimlik === k.kimlik ? y : x))); }}
                            sil={() => { taslakYaz((t) => (t ?? []).filter((x) => x.kimlik !== k.kimlik)); }} />
                        ))}
                      </ol>
                      {kurallar.length === 0 ? <p className="km-st-soluk">Kural yok: kaydedilirse bu opta ilk parça onayı istenmez.</p>
                        : ilkParcaAcik(kurallar) ? null : <p className="km-st-soluk">Kapılı ilk parça kuralı yok: bu opta rotadaki ilk parça seçimi geçerli kalır.</p>}
                      {plan === null && kurallar.length === 0 ? (
                        <Dugme tur="ikincil" simge="x" disabled={yaz.isPending} onClick={kaydetIste}>İlk parça yok olarak kaydet</Dugme>
                      ) : null}
                      <div className="km-np-araclar">
                        <Dugme tur="ikincil" simge="plus" onClick={() => { taslakYaz((t) => [...(t ?? []), yeniKural()]); }}>Kural ekle</Dugme>
                        <select className="km-np-secim" aria-label="Şablon uygula" value="" onChange={(e) => { const s = SABLONLAR.find((x) => x.anahtar === e.target.value); if (s) taslakYaz(s.kurallar()); }}>
                          <option value="">Şablon…</option>
                          {SABLONLAR.map((s) => <option key={s.anahtar} value={s.anahtar}>{s.ad}</option>)}
                        </select>
                      </div>
                      {gruplar.length > 0 ? <p className="km-st-soluk">Grup seçilince kural o anki balon numaralarını alır; sonradan gruba eklenen balon bu kurala girmez.</p> : null}
                      {kirli ? (
                        <div className="km-st-taslak" role="status">
                          <Simge ad="edit" boyut="k" />
                          <span>{eksik ?? 'Kaydedilmemiş değişiklik'}</span>
                          <Dugme tur="ikincil" simge="x" disabled={yaz.isPending} onClick={vazgec}>Vazgeç</Dugme>
                          <Dugme tur="birincil" simge="check" disabled={yaz.isPending || eksik !== null || cakisma} onClick={kaydetIste}>Kaydet</Dugme>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    kurallar.length ? <ul className="km-st-liste">{kurallar.map((k) => <li key={k.kimlik}>{numuneKuraliMetni(k)}</li>)}</ul>
                      : <span className="km-st-soluk">{plan === null ? 'Numune planı tanımlı değil.' : 'Kural yok (ilk parça yok).'}</span>
                  )}
                  {!duzenler ? <p className="km-st-soluk"><Simge ad="lock" boyut="k" /> Planı kalite onayı yetkisi olan düzenler.</p> : null}
                  <button type="button" className="km-np-gecmis-dugme" aria-expanded={gecmis} onClick={() => { gecmisYaz((g) => !g); }}>
                    {gecmis ? 'Geçmişi gizle' : `Geçmiş${plan ? ` · sürüm ${String(plan.surum)}` : ''}`}
                  </button>
                  {gecmis ? <Gecmis malzemeNo={malzemeNo} opNo={o.opNo} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rotadaYok.length ? (
        <div className="km-np-eski">
          <span className="km-st-soluk">Rotada olmayan operasyonların eski planları (salt okunur):</span>
          {rotadaYok.map((p) => (
            <div key={p.opNo} className="km-st-plan">
              <b>Op {p.opNo} <Rozet ton="uyari">Rotada yok</Rozet></b>
              {p.kurallar.length ? <ul className="km-st-liste">{p.kurallar.map((k) => <li key={k.kimlik}>{numuneKuraliMetni(k)}</li>)}</ul> : <span className="km-st-soluk">Kural yok</span>}
            </div>
          ))}
        </div>
      ) : null}
      <OnayPenceresi acik={ilkYokOnayi} baslik="İlk parça onayı olmayacak" onayMetni="Yine de kaydet" yukleniyor={yaz.isPending}
        onayla={kaydet} vazgec={() => { ilkYokOnayiYaz(false); }}>
        <p>{`Op ${String(acik ?? '')} planı kuralsız ("İlk parça yok") kaydedilecek. Kaydedilince bu opta ilk parça onayı istenmez: sayım kilitlenmez, terminal ilk parça beklemez; rotadaki seçim de geçmez.`}</p>
      </OnayPenceresi>
    </div>
  );
}
