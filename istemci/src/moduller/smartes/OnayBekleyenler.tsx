import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdetKarariCevabi, AdetOnaylariCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Rozet, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK, zamanMetni } from './gosterim.ts';
import './smartes.css';

type OnaySatiri = AdetOnaylariCevabi['satirlar'][number];

// Bekleyen liste tek sayfada; sınırı aşarsa en eskiler önce gelir, onaylandıkça sıradakiler görünür.
const BEKLEYEN_SAYFA_BOYU = 200;
const KARAR_SAYFA_BOYU = 10;

// 3760: tür onaylanınca yazılacak kayıttır: sağlam sayım, hurda, sağlamdan düşen sayım düzeltmesi ("Fazla M30") ya da kalite kararı bekleyen
// hatalı parça ("Rework"). Eski "red" satırı fire eşlemesinden önce kuyruğa girmiş adettir; onaylanmaz.
const TUR: Record<OnaySatiri['tur'], { ad: string; ton: RozetTonu; birim: string }> = {
  saglam: { ad: 'Sağlam', ton: 'bilgi', birim: 'sağlam' },
  hurda: { ad: 'Hurda', ton: 'hata', birim: 'hurda' },
  'sayim-duzeltme': { ad: 'Sayım düzeltmesi', ton: 'uyari', birim: 'sağlamdan düşer' },
  hatali: { ad: 'Hatalı parça', ton: 'uyari', birim: 'hatalı parça' },
  red: { ad: 'Fire', ton: 'hata', birim: 'red' },
};
const HURDA_TURLERI: readonly OnaySatiri['tur'][] = ['hurda', 'sayim-duzeltme', 'hatali', 'red'];
const isaretli = (n: number): string => (n > 0 ? `+${n.toLocaleString('tr-TR')}` : `−${Math.abs(n).toLocaleString('tr-TR')}`);
const ozet = (s: OnaySatiri): string => `${s.duzeltme ? isaretli(s.adet) : s.adet.toLocaleString('tr-TR')} ${TUR[s.tur].birim}`;
const fark = (s: OnaySatiri): string | null =>
  s.makineSaglam !== null && s.smartesSaglam !== null && s.makineSaglam !== s.smartesSaglam ? `Makine sayacı ${s.makineSaglam.toLocaleString('tr-TR')}` : null;
const emirMetni = (s: { emirNo: string | null; opNo: number | null; isEmriNo: string | null }): string =>
  s.emirNo === null ? (s.isEmriNo ?? YOK) : `${s.emirNo}${s.opNo !== null ? ` · Op ${s.opNo}` : ''}`;

const SUZGEC = [
  { deger: 'hepsi', baslik: 'Hepsi' }, { deger: 'adet', baslik: 'Adet' }, { deger: 'fire', baslik: 'Fire' },
  { deger: 'durus', baslik: 'Duruş' }, { deger: 'farkli', baslik: 'Farkı olanlar' },
] as const;

function sonucIletisi(c: AdetKarariCevabi, fiil: string): string {
  const ilk = c.hatalar[0];
  return ilk === undefined ? `${c.islenen} kayıt ${fiil}.` : `${c.islenen} kayıt ${fiil}; ${c.hatalar.length} kayıt işlenemedi: ${ilk.ileti}`;
}

export function OnayBekleyenler() {
  const oturum = useOturum();
  const onaylayabilir = oturum.data?.islemler.includes('smartes.adet-onayla') === true;
  const { bildir } = useBildirim();
  const qc = useQueryClient();
  const [suzgec, suzgecYaz] = useState<string>('hepsi');
  const [red, redYaz] = useState<readonly OnaySatiri[] | null>(null);
  const [neden, nedenYaz] = useState('');
  // Toplu onayda sağlamdan düşen satır gözden kaçmasın: seçimde sayım düzeltmesi varsa önce sorulur.
  const [topluOnay, topluOnayYaz] = useState<readonly OnaySatiri[] | null>(null);
  const liste = useQuery({
    queryKey: anahtarlar.onay('bekliyor'),
    queryFn: () => api.get<AdetOnaylariCevabi>(`/smartes/adet-onaylari?gorunum=bekliyor&sayfaBoyu=${BEKLEYEN_SAYFA_BOYU}`),
  });
  const kararlar = useQuery({
    queryKey: anahtarlar.onay('karar'),
    queryFn: () => api.get<AdetOnaylariCevabi>(`/smartes/adet-onaylari?gorunum=karar&sayfaBoyu=${KARAR_SAYFA_BOYU}`),
  });
  const bitti = (c: AdetKarariCevabi, fiil: string) => {
    bildir(c.hatalar.length === 0 ? 'tamam' : 'hata', sonucIletisi(c, fiil));
    redYaz(null); nedenYaz('');
    void qc.invalidateQueries({ queryKey: anahtarlar.kok });
  };
  const onayla = useMutation({
    // Görülen tür de gider: arada fire eşlemesi değiştiyse sunucu yazmaz.
    mutationFn: (s: readonly OnaySatiri[]) => api.post<AdetKarariCevabi>('/smartes/adet-onaylari/onayla', {
      idler: s.map((x) => x.id), turler: Object.fromEntries(s.map((x) => [String(x.id), x.tur])),
    }),
    onSuccess: (c) => { topluOnayYaz(null); bitti(c, 'onaylandı ve üretim emrine işlendi'); },
    onError: (e) => { bildir('hata', hataIletisi(e, 'Onaylanamadı')); },
  });
  const reddet = useMutation({
    mutationFn: (g: { idler: number[]; neden: string }) => api.post<AdetKarariCevabi>('/smartes/adet-onaylari/reddet', g),
    onSuccess: (c) => { bitti(c, 'reddedildi; CORE’a işlenmedi'); },
    onError: (e) => { bildir('hata', hataIletisi(e, 'Reddedilemedi')); },
  });
  const satirlar = (liste.data?.satirlar ?? []).filter((s) => suzgec === 'hepsi'
    || (suzgec === 'farkli' ? fark(s) !== null : suzgec === 'adet' ? s.tur === 'saglam' : suzgec === 'fire' ? HURDA_TURLERI.includes(s.tur) : false));
  const sutunlar: readonly Sutun<OnaySatiri>[] = [
    // İlk sütun düz metindir: seçim kutusunun erişilebilir adı ondan kurulur.
    { anahtar: 'emir', baslik: 'Üretim emri', hucre: (s) => emirMetni(s), mono: true, kirilmaz: true },
    { anahtar: 'tur', baslik: 'Tür', hucre: (s) => <Rozet ton={TUR[s.tur].ton}>{TUR[s.tur].ad}</Rozet>, csv: (s) => TUR[s.tur].ad, kirilmaz: true },
    {
      anahtar: 'ozet', baslik: 'İşlenecek',
      hucre: (s) => {
        const f = fark(s);
        return (
          <span className="tc-ob-ozet">
            <span className="tc-ob-eylem">{s.duzeltme && <Rozet ton="uyari">Düzeltme</Rozet>}<strong>{ozet(s)}</strong>{f !== null && <Rozet ton="uyari">{f}</Rozet>}</span>
            {s.fireAdi !== null && <span className="tc-sm-not">{`SmartES fire adı: ${s.fireAdi}`}</span>}
            {s.emirId === null && <span className="tc-sm-not">CORE iş emriyle eşleşmedi; onaylanamaz.</span>}
            <span className="tc-sm-not">{s.istasyonKodu ?? YOK} · {s.makineKodu ?? YOK}</span>
          </span>
        );
      },
    },
    { anahtar: 'geldi', baslik: 'Geldi', hucre: (s) => zamanMetni(s.olusma), kirilmaz: true },
    ...(onaylayabilir ? [{
      anahtar: 'eylem', baslik: 'Karar', csv: false as const,
      hucre: (s: OnaySatiri) => (
        <span className="tc-ob-eylem">
          <Dugme simge="check" onClick={() => { onayla.mutate([s]); }} disabled={onayla.isPending || s.emirId === null || s.tur === 'red'}>Onayla</Dugme>
          <Dugme simge="x" aria-label={`${emirMetni(s)} ${ozet(s)} kaydını reddet`} onClick={() => { redYaz([s]); }} />
        </span>
      ),
    }] : []),
  ];
  const sonKararlar = kararlar.data?.satirlar ?? [];
  return (
    <>
      <Kart baslik="Onay bekliyor">
        <div className="tc-smartes tc-ob">
          <p className="tc-smartes-aciklama">
            SmartES’ten gelen adet, fire ve duruş kayıtları burada bekler. Onaylanınca üretim emrine ve stoğa işlenir; reddedilen kayıt CORE’a işlenmez, SmartES’te değişmez.
            {!onaylayabilir && ' Onaylamak için “SmartES adetlerini onaylama” yetkisi gerekir.'}
          </p>
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste alınamadı')} yenile={() => { void liste.refetch(); }} />}
          {liste.data && (
            <Tablo
              etiket="Onay bekleyen SmartES kayıtları"
              sutunlar={sutunlar}
              satirlar={satirlar}
              satirAnahtari={(s) => s.id}
              bosMesaj={suzgec === 'hepsi' ? 'Onay bekleyen kayıt yok.' : 'Bu süzgeçte bekleyen kayıt yok.'}
              arac={{ suzgec: { etiket: 'Tür', secenekler: SUZGEC, secili: suzgec, sec: suzgecYaz } }}
              {...(onaylayabilir ? { toplu: { buyukSecim: true, eylemler: [
                { anahtar: 'onayla', baslik: 'Seçilenleri onayla', simge: 'check' as const, ton: 'birincil' as const, yap: (s: readonly OnaySatiri[]) => { if (s.some((x) => x.tur === 'sayim-duzeltme')) topluOnayYaz(s); else onayla.mutate(s); } },
                { anahtar: 'reddet', baslik: 'Seçilenleri reddet', simge: 'x' as const, yap: (s: readonly OnaySatiri[]) => { redYaz(s); } },
              ] } } : {})}
            />
          )}
        </div>
      </Kart>
      {sonKararlar.length > 0 && (
        <Kart baslik="Son kararlar">
          <ul className="tc-ob-kararlar">
            {sonKararlar.map((k) => (
              <li key={k.id}>
                <Rozet ton={k.durum === 'onaylandi' ? 'tamam' : 'hata'}>{k.durum === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}</Rozet>
                <span className="tc-sm-kod">{emirMetni(k)}</span>
                <span>{TUR[k.tur].ad}: {ozet(k)}</span>
                <span className="tc-sm-not">{k.kararVeren ?? YOK} · {zamanMetni(k.kararZamani)}{k.redNedeni !== null && ` · ${k.redNedeni}`}</span>
              </li>
            ))}
          </ul>
        </Kart>
      )}
      {topluOnay !== null && (() => {
        const duzeltmeler = topluOnay.filter((x) => x.tur === 'sayim-duzeltme');
        const toplam = duzeltmeler.reduce((t, x) => t + x.adet, 0);
        return (
          <OnayPenceresi
            acik baslik={`${topluOnay.length} kayıt onaylansın mı?`} onayMetni="Onayla" yukleniyor={onayla.isPending}
            onayla={() => { onayla.mutate(topluOnay); }} vazgec={() => { topluOnayYaz(null); }}
          >
            <p className="tc-smartes-aciklama">{`${duzeltmeler.length} satır sağlamdan düşer, toplam −${toplam} adet. Sağlam sayım ve stok bu kadar azalır.`}</p>
          </OnayPenceresi>
        );
      })()}
      <OnayPenceresi
        acik={red !== null} baslik={red !== null && red.length > 1 ? `${red.length} kayıt reddedilsin mi?` : 'Kayıt reddedilsin mi?'}
        onayMetni="Reddet" tehlikeli yukleniyor={reddet.isPending}
        onayla={() => { if (red !== null && neden.trim() !== '') reddet.mutate({ idler: red.map((x) => x.id), neden: neden.trim() }); }}
        vazgec={() => { redYaz(null); nedenYaz(''); }}
      >
        <div className="tc-smartes">
          <p className="tc-smartes-aciklama">Reddedilen kayıt üretim emrine ve stoğa işlenmez. SmartES’teki kayıt değişmez; adet SmartES’te yeniden değişirse farkı onaya gelir.</p>
          {red !== null && red.length === 1 && <p><span className="tc-sm-kod">{emirMetni(red[0]!)}</span> {ozet(red[0]!)}</p>}
          <Girdi etiket="Red nedeni" value={neden} onChange={(o) => { nedenYaz(o.target.value); }} maxLength={500} required />
        </div>
      </OnayPenceresi>
    </>
  );
}
