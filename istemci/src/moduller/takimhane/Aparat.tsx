import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AparatCevabi, AparatKarsilastirma, AparatSatiri, EmirAparatCevabi, EmirAparatSatiri, SeceneklerCevabi } from '#paylasilan/sozlesme/takimhane.ts';
import { Dugme, DurumKutusu, GrupluSecim, Kart, Rozet, SayfaBasligi, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sutun, type TabloAraci } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  APARAT_ASAMA_ADI, APARAT_DURUMU_ADI, APARAT_DURUMU_TONU, APARAT_UYUMU_ADI, APARAT_UYUMU_TONU, KONUM_ADI, KONUM_SIMGESI, adetMetni, pencereMetni,
} from './gosterim.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import { BekleyenIadeCipi } from './Parcalar.tsx';
import './takimhane.css';

type Bolum = 'stok' | 'karsilastir';
const KONUMLAR = ['raf', 'tezgah', 'kisi', 'bileme', 'ara'] as const;
// Aparat bilemeye değil bakıma gider; sayılar aynı konum türünden gelir (fason), yalnız adı değişir.
const APARAT_KONUM_ADI = { ...KONUM_ADI, bileme: 'Bakımda' } as const;

export function AparatKonumlari({ konumlar }: { konumlar: AparatCevabi['konumlar'] }) {
  return (
    <dl className="tc-tkm-konum">
      {KONUMLAR.map((k) => (
        <div key={k}>
          <dt><Simge ad={KONUM_SIMGESI[k]} boyut="k" />{APARAT_KONUM_ADI[k]}</dt>
          <dd className="mono">{adetMetni(konumlar[k])}</dd>
        </div>
      ))}
    </dl>
  );
}

// Aparatın nerede durduğu tek çubukta: her adet bir dilimdir (genişlik adetle orantılı, satır içi stil gerekmez), renk konum türünden; yazı altta.
function DagilimCubugu({ satir }: { satir: AparatSatiri }) {
  const parcalar = KONUMLAR.map((k) => ({ anahtar: k, ad: APARAT_KONUM_ADI[k], adet: satir.konumlar[k] ?? 0 })).filter((p) => p.adet > 0);
  if (parcalar.length === 0) return null;
  const metin = parcalar.map((p) => `${p.ad} ${String(p.adet)}`);
  return (
    <div>
      <div className="tc-tkm-cubuk" role="img" aria-label={metin.join(', ')}>
        {parcalar.flatMap((p) => Array.from({ length: Math.min(p.adet, 200) }, (_, n) => <i key={`${p.anahtar}-${String(n)}`} data-konum={p.anahtar} />))}
      </div>
      <p className="tc-tkm-soluk">{metin.join(' · ')}</p>
    </div>
  );
}

const STOK_SUTUNLARI: readonly Sutun<AparatSatiri>[] = [
  { anahtar: 'ad', baslik: 'Aparat', hucre: (a) => <span className="tc-tkm-ad"><span>{a.ad}</span><span className="tc-tkm-soluk mono">{a.kod}</span></span> },
  { anahtar: 'toplam', baslik: 'Toplam', hizala: 'sag', mono: true, hucre: (a) => a.toplam },
  { anahtar: 'raf', baslik: 'Rafta', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.raf) },
  { anahtar: 'ayrilan', baslik: 'Ayrılan', hizala: 'sag', mono: true, hucre: (a) => a.ayrilan },
  { anahtar: 'tezgah', baslik: 'Tezgâhta', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.tezgah) },
  { anahtar: 'kisi', baslik: 'Kişide', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.kisi) },
  { anahtar: 'bakim', baslik: 'Bakımda', hizala: 'sag', mono: true, hucre: (a) => adetMetni(a.konumlar.bileme) },
];

function StokListesi({ satirlar, arac, sec }: { satirlar: readonly AparatSatiri[]; arac: TabloAraci<AparatSatiri>; sec: (a: AparatSatiri) => void }) {
  return (
    <IkiGorunum
      masa={<Tablo etiket="Aparatlar" sutunlar={STOK_SUTUNLARI} satirlar={satirlar} satirAnahtari={(a) => a.kartKimlik} satirSec={sec} arac={arac} bosMesaj="Aparat yok" />}
      kompakt={(
        <KompaktListe
          etiket="Aparatlar" satirlar={satirlar} satirAnahtari={(a) => a.kartKimlik}
          baslik={(a) => <button type="button" className="tc-tkm-kompakt-dugme" onClick={() => { sec(a); }}>{a.ad}</button>}
          sag={(a) => `${String(a.toplam)} adet`} alt={(a) => a.kod}
          ek={(a) => (
            <>
              <Rozet ton="bilgi">{`Rafta ${adetMetni(a.konumlar.raf)}`}</Rozet>
              <Rozet ton="uyari">{`Ayrılan ${String(a.ayrilan)}`}</Rozet>
              <Rozet ton="tamam">{`Tezgâhta ${adetMetni(a.konumlar.tezgah)}`}</Rozet>
              <Rozet ton="bilgi">{`Kişide ${adetMetni(a.konumlar.kisi)}`}</Rozet>
            </>
          )}
        />
      )}
    />
  );
}

function KarsilastirmaListesi({ satirlar, ac }: { satirlar: readonly AparatKarsilastirma[]; ac: () => void }) {
  const sutunlar: readonly Sutun<AparatKarsilastirma>[] = [
    { anahtar: 'ad', baslik: 'Aparat', hucre: (a) => <span className="tc-tkm-ad"><span>{a.ad}</span><span className="tc-tkm-soluk mono">{a.kod}</span></span> },
    { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (a) => a.istasyon ?? 'Ortak' },
    { anahtar: 'plan', baslik: 'Plan kapasitesi', hizala: 'sag', mono: true, hucre: (a) => a.planKapasitesi },
    { anahtar: 'stok', baslik: 'Stokta', hizala: 'sag', mono: true, hucre: (a) => a.stokta },
    { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <UyumRozeti a={a} /> },
    { anahtar: 'ac', baslik: '', kartTamSatir: true, hucre: () => <Dugme simge="gear" onClick={ac}>Kapasiteyi aç</Dugme> },
  ];
  return (
    <IkiGorunum
      masa={<Tablo etiket="Plan ile karşılaştırma" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(a) => `${String(a.kartKimlik)}-${String(a.istasyonKimligi)}`} bosMesaj="Planda tanımlı aparat kapasitesi yok" />}
      kompakt={(
        <KompaktListe
          etiket="Plan ile karşılaştırma" satirlar={satirlar} satirAnahtari={(a) => `${String(a.kartKimlik)}-${String(a.istasyonKimligi)}`}
          baslik={(a) => a.ad} sag={(a) => `Plan ${String(a.planKapasitesi)} · Stok ${String(a.stokta)}`} alt={(a) => `${a.kod} · ${a.istasyon ?? 'Ortak'}`}
          ek={(a) => (<><UyumRozeti a={a} /><Dugme simge="gear" onClick={ac}>Kapasiteyi aç</Dugme></>)}
        />
      )}
    />
  );
}

function UyumRozeti({ a }: { a: AparatKarsilastirma }) {
  const ek = a.durum === 'plan-fazla' ? ` (plan ${String(a.kartPlanToplami)}, stok ${String(a.stokta)})` : a.durum === 'bakimda' ? ` (${String(a.bakimda)})` : '';
  return <Rozet ton={APARAT_UYUMU_TONU[a.durum]}>{`${APARAT_UYUMU_ADI[a.durum]}${ek}`}</Rozet>;
}

// Aparat ekranı: stok ve konum (kart 3651 A) ve planın kapasitesiyle yan yana okuma (C). Ayırma yazılmaz, plan penceresinden türetilir.
export function AparatSayfasi() {
  const git = useNavigate();
  const sorgu = useQuery({ queryKey: anahtarlar.aparat, queryFn: () => api.get<AparatCevabi>('/takimhane/aparat') });
  const [bolum, bolumYaz] = useState<Bolum>('stok');
  const [ara, araYaz] = useState('');
  const [suzgec, suzgecYaz] = useState('hepsi');
  const [acik, acikYaz] = useState<AparatSatiri | null>(null);
  const liste = useMemo(() => (sorgu.data?.satirlar ?? []).filter((a) => {
    const aranan = ara.trim().toLocaleLowerCase('tr');
    const durumTamam = suzgec === 'hepsi' || (suzgec === 'iade' ? a.bekleyenIade > 0 : (a.konumlar.bileme ?? 0) > 0);
    return durumTamam && (aranan === '' || `${a.kod} ${a.ad}`.toLocaleLowerCase('tr').includes(aranan));
  }), [sorgu.data, ara, suzgec]);

  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError || !sorgu.data) return <DurumKutusu durum="hata" hata={sorgu.error} mesaj="Aparat yüklenemedi." yenile={() => { void sorgu.refetch(); }} />;
  const v = sorgu.data;
  const arac: TabloAraci<AparatSatiri> = {
    arama: { deger: ara, degistir: araYaz, etiket: 'Aparat ara', yerTutucu: 'Kod ya da ad' },
    suzgec: {
      etiket: 'Aparat süzgeci', secili: suzgec, sec: suzgecYaz,
      secenekler: [{ deger: 'hepsi', baslik: 'Tümü' }, { deger: 'iade', baslik: 'Bekleyen iade' }, { deger: 'bakim', baslik: 'Bakımda' }],
    },
  };
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi
        baslik="Aparat" simge="wrench"
        ek={<BekleyenIadeCipi sayi={v.bekleyenIade} ac={() => { void git('/takimhane/cikis-iade'); }} />}
      />
      <Kart baslik="Şu an nerede" simge="pin"><AparatKonumlari konumlar={v.konumlar} /></Kart>
      <Sekmeler
        etiket="Aparat görünümü" secili={bolum} sec={bolumYaz}
        sekmeler={[{ anahtar: 'stok', baslik: 'Stok', simge: 'box' }, { anahtar: 'karsilastir', baslik: 'Plan ile karşılaştır', simge: 'gantt' }]}
      />
      {bolum === 'stok' ? (
        <>
          <Kart baslik="Aparatlar" simge="list"><StokListesi satirlar={liste} arac={arac} sec={acikYaz} /></Kart>
          {acik !== null && (
            <Kart baslik={acik.ad} simge="wrench" baslikEki={<Dugme onClick={() => { acikYaz(null); }}>Kapat</Dugme>}>
              <div className="tc-tkm-ayrinti">
                <p className="tc-tkm-soluk mono">{acik.kod}</p>
                <DagilimCubugu satir={acik} />
                <dl className="tc-tkm-dagilim">
                  {KONUMLAR.map((k) => <div key={k}><dt><Simge ad={KONUM_SIMGESI[k]} boyut="k" />{APARAT_KONUM_ADI[k]}</dt><dd className="mono">{adetMetni(acik.konumlar[k])}</dd></div>)}
                  <div><dt><Simge ad="clock" boyut="k" />Ayrılan (plan)</dt><dd className="mono">{acik.ayrilan}</dd></div>
                  <div><dt><Simge ad="check" boyut="k" />Serbest raf</dt><dd className="mono">{acik.serbest}</dd></div>
                </dl>
              </div>
            </Kart>
          )}
        </>
      ) : (
        <Kart baslik="Plan kapasitesi ve stok" simge="gantt" baslikEki={<span className="tc-tkm-soluk">Yalnız okunur; plan etkilenmez</span>}>
          <KarsilastirmaListesi satirlar={v.karsilastirma} ac={() => { void git('/istasyonlar/is-merkezleri'); }} />
        </Kart>
      )}
    </div>
  );
}

// Tek düğme, duruma göre: dışarıdaysa İade, çıkabiliyorsa Çıkar. Kapalı düğmenin sebebi yazılır (plan bekliyor, eksik).
function SatirDugmesi({ a, emirId }: { a: EmirAparatSatiri; emirId: string }) {
  const git = useNavigate();
  const kalan = a.adet - a.disarida;
  if (a.disarida > 0 && kalan === 0) return <Dugme simge="rotate" onClick={() => { void git(`/takimhane/cikis-iade?iade=${String(a.kartKimlik)}`); }}>İade</Dugme>;
  if (a.durum === 'eksik' || a.durum === 'plan-bekliyor' || a.durum === 'yolda') return <span className="tc-tkm-soluk">{a.durum === 'eksik' ? 'Rafta yok' : a.durum === 'yolda' ? 'Alan bekleniyor' : 'Plan bekliyor'}</span>;
  return <Dugme simge="truck" onClick={() => { void git(`/takimhane/cikis-iade?emir=${emirId}&kart=${String(a.kartKimlik)}`); }}>Çıkar</Dugme>;
}

const emirSutunlari = (emirId: string): readonly Sutun<EmirAparatSatiri>[] => [
  { anahtar: 'ad', baslik: 'Aparat', hucre: (a) => <span className="tc-tkm-ad"><span>{a.ad}</span><span className="tc-tkm-soluk mono">{a.kod}</span></span> },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', mono: true, hucre: (a) => a.adet },
  { anahtar: 'asama', baslik: 'Aşama', hucre: (a) => APARAT_ASAMA_ADI[a.asama] },
  { anahtar: 'pencere', baslik: 'Plan penceresi', mono: true, kirilmaz: true, hucre: (a) => pencereMetni(a.baslangic, a.bitis) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (a) => <DurumRozeti a={a} /> },
  { anahtar: 'konum', baslik: 'Konum', hucre: (a) => a.konum ?? '—' },
  { anahtar: 'islem', baslik: '', csv: false, kartTamSatir: true, hucre: (a) => <SatirDugmesi a={a} emirId={emirId} /> },
];

function DurumRozeti({ a }: { a: EmirAparatSatiri }) {
  const metin = a.durum === 'eksik' ? `${APARAT_DURUMU_ADI.eksik}: ${String(a.eksik)}/${String(a.adet - a.disarida)}` : APARAT_DURUMU_ADI[a.durum];
  return (
    <span className="tc-tkm-bulgu">
      <Rozet ton={APARAT_DURUMU_TONU[a.durum]}>{metin}</Rozet>
      {a.planKaydi && a.baslangic !== null && <Rozet ton="uyari">{`Plan ertelendi · ${pencereMetni(a.baslangic, a.baslangic).slice(0, 5)}`}</Rozet>}
    </span>
  );
}

// Emrin çıkabilir aparatlarını tek alana verir: tezgâh (istasyon) ya da kişi. Her aparat ayrı çıkış kaydıdır, kalan adetle; biri başarısız olursa kalanı yazılmaz.
function EmirToplamCikisi({ emirId, satirlar }: { emirId: string; satirlar: readonly EmirAparatSatiri[] }) {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const secenekler = useQuery({ queryKey: [...anahtarlar.ozet, 'secenekler'], queryFn: () => api.get<SeceneklerCevabi>('/takimhane/secenekler') });
  const [hedef, hedefYaz] = useState<'tezgah' | 'kisi'>('tezgah');
  const [alan, alanYaz] = useState('');
  const cikabilen = satirlar.filter((a) => a.adet - a.disarida > 0 && a.durum === 'ayrildi');
  const cikar = useMutation({
    mutationFn: async () => {
      for (const a of cikabilen) {
        const istekKimligi = yeniIstekKimligi();
        await api.post('/takimhane/cikis', {
          kartKimlik: a.kartKimlik, adet: a.adet - a.disarida, kisiId: hedef === 'kisi' ? Number(alan) : null, istasyonId: hedef === 'tezgah' ? Number(alan) : null,
          uretimEmriId: Number(emirId), istekKimligi,
        }, { istekKimligi });
      }
    },
    onSuccess: () => { bildirim.bildir('tamam', 'Aparatlar çıkarıldı; alan kabul edince teslim tamamlanır.'); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Toplu çıkış tamamlanamadı; çıkanlar Teslimdekiler listesindedir.')); },
    onSettled: () => { void istemci.invalidateQueries({ queryKey: ['takimhane'] }); },
  });
  if (cikabilen.length === 0 || !secenekler.data) return null;
  const secenek = (hedef === 'tezgah' ? secenekler.data.istasyonlar : secenekler.data.kisiler).map((x) => ({ deger: String(x.id), baslik: x.ad }));
  return (
    <Kart baslik="Emir için toplu çıkış" simge="truck" baslikEki={<span className="tc-tkm-soluk">{cikabilen.length} aparat</span>}>
      <div className="tc-tkm-form">
        <GrupluSecim
          etiket="Alan türü" secili={hedef} sec={(d) => { hedefYaz(d); alanYaz(''); }}
          gruplar={[{ anahtar: 'h', baslik: 'Kime', secenekler: [{ deger: 'tezgah', baslik: 'Tezgâh', simge: 'cpu' }, { deger: 'kisi', baslik: 'Kişi', simge: 'user' }] }]}
        />
        <Secim etiket={hedef === 'tezgah' ? 'İstasyon' : 'Kişi'} value={alan} onChange={(e) => { alanYaz(e.target.value); }} bosSecenek="Seçiniz" secenekler={secenek} />
        <div className="tc-tkm-eylemler">
          <Dugme tur="birincil" simge="truck" disabled={alan === '' || cikar.isPending} onClick={() => { cikar.mutate(); }}>Hepsini çıkar</Dugme>
        </div>
      </div>
    </Kart>
  );
}

// Emir seçilince aparat satırları: durum, konum ve plan penceresi. Ayırma plandan türetilir; burada yazılmaz. Yalnız uyarır, başlatmayı engellemez.
export function EmirAparatlari({ emirId }: { emirId: string }) {
  const sorgu = useQuery({ queryKey: anahtarlar.emirAparat(emirId), queryFn: () => api.get<EmirAparatCevabi>(`/takimhane/emirler/${emirId}/aparat`) });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError || !sorgu.data) return <DurumKutusu durum="hata" hata={sorgu.error} mesaj="Aparat listesi yüklenemedi." yenile={() => { void sorgu.refetch(); }} />;
  const v = sorgu.data;
  const eksikler = v.satirlar.filter((s) => s.durum === 'eksik');
  const olcu = v.olcuAletleri.length === 0 ? null : (
    <Kart baslik="Ölçü aleti" simge="ruler" baslikEki={<span className="tc-tkm-soluk">Yalnız kalibrasyon durumu; stok tutulmaz</span>}>
      <ul className="tc-tkm-kritik" aria-label="Emrin ölçü aletleri">
        {v.olcuAletleri.map((o) => (
          <li key={o.turKimlik} className="tc-tkm-kritik-satir">
            <span>{o.ad}</span>
            <Rozet ton={o.gecerli === true ? 'tamam' : o.gecerli === false ? 'hata' : 'pasif'}>
              {o.gecerli === true ? 'Kalibrasyonu geçerli alet var' : o.gecerli === false ? 'Geçerli alet yok' : 'Bu türde alet kaydı yok'}
            </Rozet>
          </li>
        ))}
      </ul>
    </Kart>
  );
  if (v.satirlar.length === 0) return <><Kart baslik="Aparat" simge="wrench"><p className="tc-tkm-bos">Bu emrin rotasında aparat yok.</p></Kart>{olcu}</>;
  return (
    <>
    <Kart baslik="Aparat" simge="wrench" baslikEki={v.hazir ? <Rozet ton="tamam">Aparat hazır</Rozet> : <Rozet ton="hata">{`${String(eksikler.length)} aparat eksik`}</Rozet>}>
      <IkiGorunum
        masa={<Tablo etiket="Emrin aparatları" sutunlar={emirSutunlari(emirId)} satirlar={v.satirlar} satirAnahtari={(a) => a.kartKimlik} />}
        kompakt={(
          <KompaktListe
            etiket="Emrin aparatları" satirlar={v.satirlar} satirAnahtari={(a) => a.kartKimlik}
            baslik={(a) => a.ad} sag={(a) => `${String(a.adet)} adet`} alt={(a) => `${a.kod} · ${pencereMetni(a.baslangic, a.bitis)} · ${a.konum ?? '—'}`}
            ek={(a) => <><DurumRozeti a={a} /><SatirDugmesi a={a} emirId={emirId} /></>}
          />
        )}
      />
      {eksikler.length > 0 && (
        <p className="tc-tkm-uyari"><Simge ad="alert" boyut="k" />{`${eksikler.map((e) => e.ad).join(', ')}: planlı pencerede stok yetmiyor. Emir başlayabilir; bu yalnız uyarıdır, plan kapasitesini etkilemez.`}</p>
      )}
    </Kart>
    <EmirToplamCikisi emirId={emirId} satirlar={v.satirlar} />
    {olcu}
    </>
  );
}
