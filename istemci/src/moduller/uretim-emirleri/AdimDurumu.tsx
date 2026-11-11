import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimliListeCevabi, AdimStatusu, AdimTedariki, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, Kart, Rozet, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ADIM_DURUMU_YAZ, ELLE_YAZILIR, STATU, adimDurumuUcu, isEmriKomutu } from './adim-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, zamanMetni } from './gorunum.ts';
import { MADDE, halGorunumu } from './HazirlikListesi.tsx';
import './uretim-emirleri.css';

type Adim = AdimDurumuCevabi['adimlar'][number];
const ACIK = new Set(['taslak', 'planli', 'basladi']);
// Sunucu kuralıyla aynı sınır (uretim-emirleri kurallar.ts GEREKCE_EN_AZ); sunucu kısa gerekçeyi 400 ile reddeder.
const GEREKCE_EN_AZ = 5;
const tedarikMetni = (t: AdimTedariki): string => t.asama === 'talep'
  ? `${t.fason ? 'Fason talebi' : 'Talep'} ${t.talepNo} siparişe dönmedi`
  : `Sipariş ${t.siparisNo ?? t.talepNo} bekleniyor${t.termin === null ? '' : ` · termin ${tarihMetni(t.termin)}`}`;

function Statu({ statu, elle }: { statu: AdimStatusu; elle: boolean }) {
  const g = STATU[statu];
  return (
    <span className="tc-adim-statu">
      <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" />{g.ad}</Rozet>
      {elle && <Rozet ton="uyari" gorunum="cizgi">Elle</Rozet>}
    </span>
  );
}

function Cubuk({ yuzde, etiket }: { yuzde: number; etiket: string }) {
  return (
    <span className="tc-emir-ilerleme-cubuk">
      <progress max={100} value={yuzde} aria-label={`${etiket} yüzde ${String(yuzde)}`} />
      <b>%{yuzde}</b>
    </span>
  );
}

// Adım Durumu (2893): açık emrin adımları yukarıdan aşağı rota sırasıyla, her adımın son statüsü ve hazırlık matrisi yan yana.
// Statüyü sunucu türetir; yetkili kişi (2893-1 a) statüyü elle yazar ve hazırlık maddesini elle onaylar. Durduran maddede onay
// gerekçe ister ve başlatmayı açar (2893-2 b).
export function AdimDurumu() {
  const oturum = useOturum();
  const yazar = ((oturum.data?.islemler ?? []) as readonly string[]).includes(ADIM_DURUMU_YAZ);
  const [adres, adresYaz] = useSearchParams();
  const secili = Number(adres.get('emir')) || null;
  const liste = useQuery({ queryKey: anahtarlar.liste(''), queryFn: () => api.get<AdimliListeCevabi>('/adimli-emirler') });
  const emirler = (liste.data?.emirler ?? []).filter((e) => ACIK.has(e.durum));
  const sec = (deger: string) => {
    adresYaz((a) => { const y = new URLSearchParams(a); if (deger === '') y.delete('emir'); else y.set('emir', deger); return y; }, { replace: true });
  };
  return (
    <div className="tc-kapanis">
      <Kart baslik="Adım Durumu" simge="flag">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Emirler alınamadı.')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Secim etiket="Emir" bosSecenek="Emir seçin" value={secili === null ? '' : String(secili)} onChange={(e) => sec(e.target.value)}
            secenekler={emirler.map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.urun.ad} · ${DURUM_ETIKETI[e.durum]}` }))} />
        )}
        <p className="tc-emir-not">
          Statü sistemden gelir. Elle yazılan statü "Elle" işaretiyle görünür ve adımın durumu değişince kendiliğinden düşer.
        </p>
      </Kart>
      {secili !== null && <EmrinAdimDurumu id={secili} yazar={yazar} />}
    </div>
  );
}

function EmrinAdimDurumu({ id, yazar }: { id: number; yazar: boolean }) {
  const d = useQuery({ queryKey: anahtarlar.adimDurumu(id), queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(id)) });
  const [seciliAdim, adimSec] = useState<number | null>(null);
  if (d.isPending) return <Kart baslik="Adımlar"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) return <Kart baslik="Adımlar"><DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Adım durumu alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  const v = d.data;
  const adim = v.adimlar.find((a) => a.isEmriId === seciliAdim) ?? null;
  // Sütunlar sunucunun madde sırasıyladır (sözleşmedeki liste); istemci listeyi ayrıca tutmaz.
  const maddeSutunlari: Sutun<Adim>[] = (v.adimlar[0]?.maddeler ?? []).map(({ madde }) => ({
    anahtar: madde, baslik: MADDE[madde].kisa,
    hucre: (a: Adim) => {
      const m = a.maddeler.find((x) => x.madde === madde);
      if (m === undefined) return null;
      const g = halGorunumu(madde, m.hal);
      const elle = m.hal !== m.ham && a.onaylar.some((o) => o.madde === madde);
      return <span className="tc-adim-statu"><Rozet ton={elle ? 'uyari' : g.ton}><Simge ad={elle ? 'edit' : g.simge} boyut="k" />{elle ? 'Elle onay' : g.ad}</Rozet></span>;
    },
  }));
  const sutunlar: Sutun<Adim>[] = [
    { anahtar: 'adim', baslik: 'Adım', hucre: (a) => <><span className="tc-emir-kod">OP {a.opNo}</span> {a.ad}{a.fason && <> <Rozet ton="pasif" gorunum="cizgi">Fason</Rozet></>}</> },
    { anahtar: 'statu', baslik: 'Son durum', hucre: (a) => <Statu statu={a.elle?.statu ?? a.sistemStatusu} elle={a.elle !== null} /> },
    { anahtar: 'ilerleme', baslik: 'İlerleme', hucre: (a) => <Cubuk yuzde={a.yuzde} etiket={`OP ${String(a.opNo)}`} /> },
    ...maddeSutunlari,
  ];
  return (
    <>
      <Kart baslik={`${v.emirNo} · ${v.urun.ad}`} baslikEki={<Rozet ton="bilgi">{DURUM_ETIKETI[v.durum]}</Rozet>}>
        <p className="tc-emir-kod">{v.adet} adet{v.teslim === null ? '' : ` · teslim ${v.teslim}`}</p>
        {v.rotaYuzde !== null && <Cubuk yuzde={v.rotaYuzde} etiket="Rota" />}
        <Tablo etiket="Adımlar ve hazırlık" sutunlar={sutunlar} satirlar={v.adimlar} satirAnahtari={(a) => a.isEmriId}
          satirSec={(a) => adimSec(a.isEmriId)} bosMesaj="Bu emrin adımı yok." />
        <p className="tc-emir-not">İlk adım en üsttedir. Satıra tıklayınca adımın nedenleri, elle statüsü ve onayları aşağıda açılır.</p>
      </Kart>
      {adim !== null && <AdimAyrintisi emirId={id} adim={adim} yazar={yazar && (v.durum === 'taslak' || v.durum === 'planli' || v.durum === 'basladi')} />}
    </>
  );
}

function AdimAyrintisi({ emirId, adim, yazar }: { emirId: number; adim: Adim; yazar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [statu, statuYaz] = useState<AdimStatusu | ''>('');
  const [not, notYaz] = useState('');
  const [madde, maddeYaz] = useState<HazirlikMaddesi | ''>('');
  const [gerekce, gerekceYaz] = useState('');
  const komut = useMutation({
    mutationFn: ({ yol, govde }: { yol: Parameters<typeof isEmriKomutu>[2]; govde: Record<string, unknown> }) =>
      api.post<AdimDurumuCevabi>(isEmriKomutu(emirId, adim.isEmriId, yol), govde),
    onSuccess: (c) => {
      istemci.setQueryData(anahtarlar.adimDurumu(emirId), c);
      bildir('tamam', 'Kaydedildi.');
      statuYaz(''); notYaz(''); maddeYaz(''); gerekceYaz('');
    },
    onError: async (x) => { bildir('hata', hataIletisi(x, 'Kaydedilemedi.')); await istemci.invalidateQueries({ queryKey: anahtarlar.adimDurumu(emirId) }); },
  });
  const onaylanir = adim.maddeler.filter((m) => (m.hal === 'eksik' || m.hal === 'bilinmiyor') && !adim.onaylar.some((o) => o.madde === m.madde));
  const seciliMadde = adim.maddeler.find((m) => m.madde === madde);
  const gerekceGerek = madde !== '' && !MADDE[madde].uyarir;
  return (
    <Kart baslik={`OP ${String(adim.opNo)} · ${adim.ad}`} baslikEki={<Statu statu={adim.elle?.statu ?? adim.sistemStatusu} elle={adim.elle !== null} />}>
      <dl className="tc-emir-liste">
        <dt>Sistemin dediği</dt><dd>{STATU[adim.sistemStatusu].ad}</dd>
        <dt>Nedenler</dt><dd>{adim.nedenler.length === 0 ? 'Yok' : adim.nedenler.join(', ')}</dd>
        {adim.tedarik.length > 0 && <><dt>Tedarik</dt><dd>{adim.tedarik.map(tedarikMetni).join(', ')}</dd></>}
        <dt>Sağlam / hedef</dt><dd>{adim.yapilan} / {adim.hedef}</dd>
        {adim.elle !== null && (
          <><dt>Elle statü</dt><dd>{STATU[adim.elle.statu].ad} · {adim.elle.kisiAdi ?? 'Kişi'} · {zamanMetni(adim.elle.zaman)}{adim.elle.not === null ? '' : ` · ${adim.elle.not}`}</dd></>
        )}
      </dl>
      {yazar ? (
        <div className="tc-kapanis-iki">
          <section className="tc-kapanis-onay" aria-label="Statüyü elle yaz">
            <h3 className="tc-kapanis-alt"><Simge ad="edit" boyut="k" />Statüyü elle yaz</h3>
            <Secim etiket="Statü" bosSecenek="Seçiniz" value={statu} onChange={(e) => statuYaz(e.target.value as AdimStatusu | '')}
              secenekler={ELLE_YAZILIR.map((s) => ({ deger: s, baslik: STATU[s].ad }))} />
            <CokSatir etiket="Not" placeholder="İsteğe bağlı" rows={2} value={not} onChange={(e) => notYaz(e.target.value)} />
            <div className="tc-emir-ust">
              <Dugme tur="birincil" simge="check" disabled={statu === '' || komut.isPending}
                onClick={() => komut.mutate({ yol: 'statu-yaz', govde: { statu, not: not.trim() === '' ? null : not.trim(), sistemStatusu: adim.sistemStatusu } })}>Yaz</Dugme>
              {adim.elle !== null && <Dugme simge="x" disabled={komut.isPending} onClick={() => komut.mutate({ yol: 'statu-kaldir', govde: {} })}>Elle statüyü kaldır</Dugme>}
            </div>
          </section>
          <section className="tc-kapanis-onay" aria-label="Hazırlığı elle onayla">
            <h3 className="tc-kapanis-alt"><Simge ad="clipboard-check" boyut="k" />Hazırlığı elle onayla</h3>
            {onaylanir.length === 0 ? <p className="tc-emir-not">Onay bekleyen eksik madde yok.</p> : (
              <>
                <Secim etiket="Madde" bosSecenek="Seçiniz" value={madde} onChange={(e) => maddeYaz(e.target.value as HazirlikMaddesi | '')}
                  secenekler={onaylanir.map((m) => ({ deger: m.madde, baslik: MADDE[m.madde].ad }))} />
                <CokSatir etiket="Gerekçe" placeholder={gerekceGerek ? 'Zorunlu, en az 5 karakter: bu madde eksikken iş başlamaz, onay başlatmayı açar' : 'İsteğe bağlı'}
                  rows={2} value={gerekce} onChange={(e) => gerekceYaz(e.target.value)} />
                <div className="tc-emir-ust">
                  <Dugme tur="birincil" simge="check" disabled={seciliMadde === undefined || (gerekceGerek && gerekce.trim().length < GEREKCE_EN_AZ) || komut.isPending}
                    onClick={() => { if (seciliMadde) komut.mutate({ yol: 'hazirlik-onayla', govde: { madde: seciliMadde.madde, gerekce: gerekce.trim() === '' ? null : gerekce.trim(), sistemHali: seciliMadde.hal } }); }}>
                    Onayla
                  </Dugme>
                </div>
              </>
            )}
          </section>
        </div>
      ) : <p className="tc-emir-not">Statüyü elle yazma ve hazırlığı elle onaylama müdür ve planlama rollerindedir.</p>}
      <h3 className="tc-kapanis-alt">Elle onaylar</h3>
      {adim.onaylar.length === 0 ? <p className="tc-emir-not">Yok.</p> : (
        <ul className="tc-kapanis-defter">
          {adim.onaylar.map((o) => (
            <li key={o.madde}>
              <time dateTime={o.zaman}>{zamanMetni(o.zaman)}</time>
              {MADDE[o.madde].ad} · {o.kisiAdi ?? 'Kişi'}{o.gerekce === null ? '' : ` · ${o.gerekce}`}
              {yazar && <> <Dugme simge="x" disabled={komut.isPending} onClick={() => komut.mutate({ yol: 'hazirlik-onay-kaldir', govde: { madde: o.madde } })}>Onayı kaldır</Dugme></>}
            </li>
          ))}
        </ul>
      )}
      <h3 className="tc-kapanis-alt">Geçmiş</h3>
      {adim.gecmis.length === 0 ? <p className="tc-emir-not">Kayıt yok.</p> : (
        <ol className="tc-kapanis-defter">
          {adim.gecmis.map((g, i) => (
            <li key={`${g.zaman}-${String(i)}`}>
              <time dateTime={g.zaman}>{zamanMetni(g.zaman)}</time>
              {gecmisMetni(g)} · {g.kisiAdi ?? 'Kişi'}{g.not === null ? '' : ` · ${g.not}`}
            </li>
          ))}
        </ol>
      )}
    </Kart>
  );
}

const gecmisMetni = (g: Adim['gecmis'][number]): string => {
  if (g.olay === 'statu') return `Statü elle yazıldı: ${g.deger in STATU ? STATU[g.deger as AdimStatusu].ad : g.deger}`;
  if (g.olay === 'statu-kaldir') return 'Elle statü kaldırıldı';
  const ad = g.deger in MADDE ? MADDE[g.deger as HazirlikMaddesi].ad : g.deger;
  return g.olay === 'onay' ? `${ad} elle onaylandı` : `${ad} onayı kaldırıldı`;
};
