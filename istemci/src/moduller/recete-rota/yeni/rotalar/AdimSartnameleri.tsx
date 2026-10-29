import { useState } from 'react';
import type { ParametreDegeri, ParametreDegerleri, SartnameParametresiSatiri } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Girdi, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { degerMetni, sayiOku } from '../sartnameler/kurallar.ts';
import { useAdimSartnameleriKaydet, useRevizyonSartnameleri, useSartnameler } from '../sartnameler/veri.ts';
import {
  adimSartnameDurumu, adimSartnameKilidi, AZAMI_ADIM_SARTNAMESI, eklenebilirSartnameler, type AdimSartnamesi, type Revizyon,
} from './kurallar.ts';
import { Bolme } from './ortak.tsx';

// Rota adımının şartnameleri (prototip Duzenleyici "Şartname · ne isteniyor", 1187 a): seçilen şartname, durumu ve "adımda değişir"
// alanlarının değeri. Adımın listesi bütün olarak yazılır; yetki, kapsam ve sürüm denetimi uçtadır.

interface Ozellikler {
  rev: Revizyon | null;
  opNo: number | null;
  fason: boolean;
  yazabilir: boolean;
  kayitBekliyor: boolean;
  taslakAc: (() => void) | null;
}

export function AdimSartnameleri({ rev, opNo, fason, yazabilir, kayitBekliyor, taslakAc }: Ozellikler) {
  const revId = rev ? Number(rev.id) : null;
  const okuma = useRevizyonSartnameleri(revId);
  const satirlar = okuma.data?.adimlar.find((a) => a.opNo === opNo)?.sartnameler ?? [];
  const kilit = adimSartnameKilidi({ revDurumu: rev?.status ?? null, opNo, kayitBekliyor });
  return (
    <Bolme baslik={`Şartname (${String(satirlar.length)})`}>
      {okuma.isError && <p className="tc-rr1-hata" role="alert">{hataIletisi(okuma.error, 'Adımın şartnameleri okunamadı.')}</p>}
      {okuma.isSuccess && satirlar.length === 0 && <p className="tc-rr1-ipucu">Bu adıma bağlı şartname yok. Şartname, adımda ne istendiğini (tolerans, kaplama, ölçü) taşır.</p>}
      {rev && opNo !== null && okuma.isSuccess && (
        <Duzenleyici revId={Number(rev.id)} surum={rev.surum} opNo={opNo} fason={fason} satirlar={satirlar}
          kapali={!yazabilir || kilit !== null} />
      )}
      {yazabilir && kilit && <p className="tc-rr1-ipucu">{kilit}</p>}
      {yazabilir && taslakAc && rev && (rev.status === 'yururlukte' || rev.status === 'onayli') && (
        <Dugme tur="ikincil" simge="edit" onClick={taslakAc}>Değiştirmek için taslak aç</Dugme>
      )}
    </Bolme>
  );
}

function Duzenleyici({ revId, surum, opNo, fason, satirlar, kapali }: {
  revId: number; surum: number; opNo: number; fason: boolean; satirlar: readonly AdimSartnamesi[]; kapali: boolean;
}) {
  const kaydet = useAdimSartnameleriKaydet(revId);
  const kutuphane = useSartnameler();
  const { bildir } = useBildirim();
  const [secilen, setSecilen] = useState('');
  // Değer düzeltmesi yerelde tutulur, "Değerleri kaydet" ile gider: her tuşta revizyon sürümü artmasın.
  const [degisen, setDegisen] = useState<Record<number, ParametreDegerleri>>({});
  const degerler = (x: AdimSartnamesi): ParametreDegerleri => degisen[x.sartname.id] ?? x.degerler;
  const yaz = (liste: { sartnameId: number; degerler: ParametreDegerleri }[], ileti: string) => {
    kaydet.mutate({ surum, opNo, sartnameler: liste }, {
      onSuccess: () => { setDegisen({}); setSecilen(''); bildir('tamam', ileti); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Adımın şartnameleri kaydedilemedi.')); },
    });
  };
  const mevcut = () => satirlar.map((x) => ({ sartnameId: x.sartname.id, degerler: degerler(x) }));
  const adaylar = eklenebilirSartnameler(kutuphane.data?.sartnameler ?? [], new Set(satirlar.map((x) => x.sartname.id)), fason);
  const dolu = satirlar.length >= AZAMI_ADIM_SARTNAMESI;
  const kirli = Object.keys(degisen).length > 0;

  return (
    <>
      {satirlar.length > 0 && (
        <ul className="tc-rr1-sartnameler">
          {satirlar.map((x) => {
            const d = adimSartnameDurumu(x);
            const adimda = (x.yururlukte?.parametreler ?? []).filter((p) => p.adimdaDegisir);
            const sabit = (x.yururlukte?.parametreler ?? []).filter((p) => !p.adimdaDegisir)
              .map((p) => { const m = degerMetni(p, p.varsayilan); return m === null ? null : `${p.ad}: ${m}`; }).filter((m) => m !== null);
            return (
              <li key={x.sartname.id} className="tc-rr1-sartname">
                <div className="tc-rr1-sartname-ust">
                  <span className="tc-rr1-sartname-ad">
                    <b>{`${x.sartname.kod} · ${x.sartname.ad}`}</b>
                    {x.yururlukte && <small className="tc-rr1-ipucu">{`Sürüm ${String(x.yururlukte.surumNo)}${sabit.length ? ` · ${sabit.slice(0, 3).join(' · ')}` : ''}`}</small>}
                  </span>
                  <span className={d.tamam ? 'tc-rr1-tamam' : 'tc-rr1-eksik'}><Simge ad={d.tamam ? 'check' : 'alert'} boyut="k" />{d.metin}</span>
                  {!kapali && (
                    <button type="button" className="tc-rr1-ib" aria-label={`${x.sartname.kod} şartnamesini adımdan çıkar`} disabled={kaydet.isPending}
                      onClick={() => { yaz(mevcut().filter((y) => y.sartnameId !== x.sartname.id), `${x.sartname.kod} adımdan çıkarıldı.`); }}>
                      <Simge ad="x" boyut="k" />
                    </button>
                  )}
                </div>
                {adimda.length > 0 && (
                  <div className="tc-rr1-ig">
                    {adimda.map((p) => (
                      <DegerAlani key={p.anahtar} parametre={p} deger={degerler(x)[p.anahtar] ?? null} kapali={kapali}
                        yaz={(v) => { setDegisen({ ...degisen, [x.sartname.id]: { ...degerler(x), [p.anahtar]: v } }); }} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!kapali && kirli && (
        <div className="tc-rr1-btnrow">
          <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} onClick={() => { yaz(mevcut(), 'Şartname değerleri kaydedildi.'); }}>Değerleri kaydet</Dugme>
          <Dugme tur="ikincil" onClick={() => { setDegisen({}); }}>Vazgeç</Dugme>
        </div>
      )}
      {!kapali && !kirli && !dolu && (
        <div className="tc-rr1-ekle">
          <Secim etiket="Şartname ekle" bosSecenek={adaylar.length ? 'Şartname seç…' : 'Eklenebilir şartname yok'} value={secilen}
            secenekler={adaylar.map((s) => ({ deger: String(s.id), baslik: `${s.kod} · ${s.ad}` }))} onChange={(e) => { setSecilen(e.target.value); }} />
          <Dugme tur="ikincil" simge="plus" disabled={secilen === ''} yukleniyor={kaydet.isPending}
            onClick={() => {
              const s = adaylar.find((y) => String(y.id) === secilen);
              if (s) yaz([...mevcut(), { sartnameId: s.id, degerler: {} }], `${s.kod} adıma eklendi.`);
            }}>
            Şartnameyi ekle
          </Dugme>
        </div>
      )}
      {!kapali && dolu && <p className="tc-rr1-ipucu">{`Bir adıma en çok ${String(AZAMI_ADIM_SARTNAMESI)} şartname bağlanır.`}</p>}
      {!kapali && <p className="tc-rr1-ipucu">Listede yalnız yayınlanmış ve bu adımın türüne ({fason ? 'fason' : 'iç üretim'}) uyan şartnameler var.</p>}
    </>
  );
}

// "Adımda değişir" alanının girdisi: boş bırakılan alan şartnamenin varsayılanını alır.
function DegerAlani({ parametre: p, deger, kapali, yaz }: { parametre: SartnameParametresiSatiri; deger: ParametreDegeri; kapali: boolean; yaz: (d: ParametreDegeri) => void }) {
  const etiket = `${p.ad}${p.birim ? ` (${p.birim})` : ''}${p.zorunlu ? ' *' : ''}`;
  const yerTutucu = degerMetni(p, p.varsayilan) ?? 'boş';
  if (p.tur === 'evet') {
    return (
      <Secim etiket={etiket} bosSecenek={`Varsayılan: ${yerTutucu}`} disabled={kapali} secenekler={[{ deger: 'evet', baslik: 'Evet' }, { deger: 'hayir', baslik: 'Hayır' }]}
        value={deger === true ? 'evet' : deger === false ? 'hayir' : ''} onChange={(e) => { yaz(e.target.value === '' ? null : e.target.value === 'evet'); }} />
    );
  }
  if (p.tur === 'secim') {
    return (
      <Secim etiket={etiket} bosSecenek={`Varsayılan: ${yerTutucu}`} disabled={kapali} secenekler={(p.secenekler ?? []).map((s) => ({ deger: s, baslik: s }))}
        value={typeof deger === 'string' ? deger : ''} onChange={(e) => { yaz(e.target.value || null); }} />
    );
  }
  if (p.tur === 'metin' || p.tur === 'coklu') {
    const metin = Array.isArray(deger) ? deger.join(', ') : typeof deger === 'string' ? deger : '';
    return (
      <Girdi etiket={p.tur === 'coklu' ? `${etiket} (virgülle)` : etiket} value={metin} placeholder={yerTutucu} disabled={kapali} maxLength={200}
        onChange={(e) => {
          const v = e.target.value;
          if (p.tur === 'metin') { yaz(v.trim() === '' ? null : v); return; }
          const l = v.split(',').map((x) => x.trim()).filter(Boolean);
          yaz(l.length ? l : null);
        }} />
    );
  }
  return <SayiDegeri etiket={etiket} aralik={p.tur === 'aralik'} deger={deger} yerTutucu={yerTutucu} kapali={kapali} yaz={yaz} />;
}

// Sayı ve aralık virgülle yazılır; okunamayan giriş yerelde kalır, değere yazılmaz.
function SayiDegeri({ etiket, aralik, deger, yerTutucu, kapali, yaz }: {
  etiket: string; aralik: boolean; deger: ParametreDegeri; yerTutucu: string; kapali: boolean; yaz: (d: ParametreDegeri) => void;
}) {
  const bicim = (n: unknown) => (typeof n === 'number' ? String(n).replace('.', ',') : '');
  const ilk = aralik ? (Array.isArray(deger) ? `${bicim(deger[0])} - ${bicim(deger[1])}` : '') : bicim(deger);
  const [yerel, setYerel] = useState<string | null>(null);
  const oku = (ham: string): ParametreDegeri | undefined => {
    if (!aralik) return sayiOku(ham);
    if (ham.trim() === '') return null;
    const p = ham.split(/\s+-\s+|\s*;\s*/);
    if (p.length !== 2) return undefined;
    const a = sayiOku(p[0] ?? ''); const b = sayiOku(p[1] ?? '');
    return typeof a === 'number' && typeof b === 'number' && a <= b ? [a, b] : undefined;
  };
  const metin = yerel ?? ilk;
  const hatali = yerel !== null && oku(yerel) === undefined;
  return (
    <Girdi etiket={aralik ? `${etiket} (alt - üst)` : etiket} inputMode="decimal" value={metin} placeholder={yerTutucu} disabled={kapali}
      hata={hatali ? (aralik ? 'Örnek: 8 - 12' : 'Sayı girin.') : undefined}
      onChange={(e) => {
        const v = e.target.value;
        setYerel(v);
        const d = oku(v);
        if (d !== undefined) yaz(d);
      }} />
  );
}
