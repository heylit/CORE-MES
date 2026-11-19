import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BildirimYayini, BildirimYayinAlicilariCevabi, BildirimYayinListeCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { DurumKutusu, Dugme, Kart, OnayPenceresi, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YAYIN_TURU, gecenZaman } from './gorunum.ts';
import { BosListe } from './ortak.tsx';

type KisiSuzgeci = 'hepsi' | 'bekliyor' | 'okudu' | 'onayladi';

const hedefMetni = (y: BildirimYayini): string => {
  if (y.hedef.tur === 'herkes') return 'Herkes';
  const ad = { rol: 'Rol', istasyon: 'İstasyon', kisi: 'Kişi' }[y.hedef.tur];
  const ilk = y.hedef.adlar.slice(0, 3).join(', ');
  return `${ad}: ${ilk}${y.hedef.adlar.length > 3 ? ` +${String(y.hedef.adlar.length - 3)}` : ''}`;
};
const sayi = (n: number | null, toplam: number | null): string => (n === null || toplam === null ? '—' : `${String(n)} / ${String(toplam)}`);

function Alicilar({ yayin }: { yayin: BildirimYayini }) {
  const [suzgec, suzgecYaz] = useState<KisiSuzgeci>('hepsi');
  const sorgu = useQuery({
    queryKey: anahtarlar.alicilar(yayin.id),
    queryFn: () => api.get<BildirimYayinAlicilariCevabi>(`/bildirimler/yayinlar/${String(yayin.id)}/alicilar`),
  });
  const secenekler: readonly { anahtar: KisiSuzgeci; baslik: string }[] = [
    { anahtar: 'hepsi', baslik: 'Hepsi' },
    { anahtar: 'bekliyor', baslik: 'Bekliyor' },
    yayin.onayIstenir ? { anahtar: 'onayladi', baslik: 'Onayladı' } : { anahtar: 'okudu', baslik: 'Okudu' },
  ];
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  const tamam = (r: { okundu: string | null; onaylandi: string | null }) => (yayin.onayIstenir ? r.onaylandi !== null : r.okundu !== null);
  const satirlar = sorgu.data.satirlar.filter((r) => (suzgec === 'hepsi' ? true : suzgec === 'bekliyor' ? !tamam(r) : tamam(r)));
  return (
    <>
      <div className="tc-bildirim-suzgec">
        {secenekler.map((s) => (
          <button key={s.anahtar} type="button" className="tc-bildirim-cip" aria-pressed={suzgec === s.anahtar} onClick={() => suzgecYaz(s.anahtar)}>{s.baslik}</button>
        ))}
      </div>
      {yayin.dagitildi === null ? <BosListe metin="Yayın zamanı gelmedi; alıcılar o an belirlenir." />
        : satirlar.length === 0 ? <BosListe metin="Bu süzgece uyan kişi yok." />
        : (
          <ul className="tc-bildirim-liste">
            {satirlar.map((r) => (
              <li key={r.kisi.id} className="tc-bildirim-kisi">
                <Simge ad={tamam(r) ? 'check' : 'clock'} boyut="k" />
                <span className="tc-bildirim-govde">{r.kisi.ad ?? `#${String(r.kisi.id)}`}</span>
                <span className="tc-bildirim-zaman">
                  {r.onaylandi !== null ? `Onayladı · ${gecenZaman(r.onaylandi, new Date())}`
                    : r.okundu !== null ? `Okudu · ${gecenZaman(r.okundu, new Date())}` : 'Bekliyor'}
                </span>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

const oran = (n: number | null, toplam: number | null): number | null => (n === null || toplam === null || toplam === 0 ? null : Math.round((n / toplam) * 100));

// 3456-2 a: okunma satırda çubukla görünür; sayı yoksa çubuk çizilmez (sıfır uydurulmaz).
function OkunmaCubugu({ n, toplam, ad }: { n: number | null; toplam: number | null; ad: string }) {
  const y = oran(n, toplam);
  return (
    <span className="tc-bildirim-okunma">
      {y !== null && <progress className="tc-bildirim-cubuk" max={100} value={y} aria-label={`${ad} yüzde ${String(y)}`} />}
      <span className="mono">{sayi(n, toplam)}</span>
    </span>
  );
}

// Duyurular (2147, 3456-2 a): tek sayfa; tablo, seçilen duyurunun okunması ve "Yeni duyuru" yan pencerede. bildirim.yayinla kendi
// yayınlarını, bildirim.yayin-oku hepsini görür (sunucu süzer). Geri çekme yalnız yazanındır; düğme yalnız kendi yayınında görünür.
export function Yayinlar({ kisiId, secili: ilkSecili, yeni }: { kisiId: number | null; secili?: number | null; yeni?: React.ReactNode }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [sayfa, sayfaYaz] = useState(1);
  const [secili, seciliYaz] = useState<number | null>(ilkSecili ?? null);
  const [geriSor, geriSorYaz] = useState<BildirimYayini | null>(null);
  const liste = useQuery({
    queryKey: anahtarlar.yayinlar(sayfa),
    queryFn: () => api.get<BildirimYayinListeCevabi>(`/bildirimler/yayinlar?sayfa=${String(sayfa)}`),
  });
  const geriCek = useMutation({
    mutationFn: (id: number) => api.post<BildirimYayini>(`/bildirimler/yayinlar/${String(id)}/geri-cek`),
    onSuccess: () => { bildir('tamam', 'Bildirim geri çekildi.'); geriSorYaz(null); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Geri çekilemedi.')),
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.kok }),
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const v = liste.data;
  const acik = v.satirlar.find((y) => y.id === secili) ?? v.satirlar[0];
  const sutunlar: Sutun<BildirimYayini>[] = [
    {
      anahtar: 'duyuru', baslik: 'Duyuru', kartTamSatir: true, csv: (y) => y.baslik,
      hucre: (y) => {
        const tur = YAYIN_TURU[y.tur];
        return (
          <span className="tc-bildirim-duyuru">
            <span className={`tc-bildirim-simge tc-bildirim-${tur.ton}`} title={tur.ad}><Simge ad={y.simge} /></span>
            <span className="tc-bildirim-govde">
              <span className={`tc-bildirim-baslik${y.geriCekildi !== null ? ' tc-bildirim-geri' : ''}`}>{y.baslik}</span>
              <span className="tc-bildirim-kaynak">
                {tur.ad} · {hedefMetni(y)}{y.yazan.id !== kisiId ? ` · ${y.yazan.ad ?? ''}` : ''}
                {y.geriCekildi !== null ? ' · geri çekildi' : y.dagitildi === null ? ' · zamanlandı' : ''}
              </span>
            </span>
          </span>
        );
      },
    },
    { anahtar: 'okudu', baslik: 'Okudu', csv: (y) => sayi(y.okuyanSayisi, y.aliciSayisi), hucre: (y) => <OkunmaCubugu n={y.okuyanSayisi} toplam={y.aliciSayisi} ad="Okudu" /> },
    {
      anahtar: 'onayladi', baslik: 'Onayladı', csv: (y) => (y.onayIstenir ? sayi(y.onaylayanSayisi, y.aliciSayisi) : ''),
      hucre: (y) => (y.onayIstenir ? <OkunmaCubugu n={y.onaylayanSayisi} toplam={y.aliciSayisi} ad="Onayladı" /> : <span className="tc-bildirim-kaynak">Onay istenmedi</span>),
    },
    { anahtar: 'zaman', baslik: 'Zaman', kirilmaz: true, csv: (y) => y.yayinZamani, hucre: (y) => <span className="tc-bildirim-zaman">{gecenZaman(y.yayinZamani, new Date())}</span> },
  ];
  return (
    <>
      <Tablo
        etiket="Duyurular"
        sutunlar={sutunlar}
        satirlar={v.satirlar}
        satirAnahtari={(y) => y.id}
        satirSec={(y) => seciliYaz(y.id)}
        bosMesaj="Henüz duyuru yok."
        bosEylem={yeni}
        arac={{ sag: yeni, csv: { ad: 'duyurular' } }}
        sayfalama={{ sayfa: v.sayfa, sayfaBoyu: v.sayfaBoyu, toplam: v.toplam, degistir: sayfaYaz }}
      />
      {acik !== undefined && (
        <Kart
          baslik={`Okunma: ${acik.baslik}`}
          sag={acik.yazan.id === kisiId && acik.geriCekildi === null ? (
            <Dugme simge="x" onClick={() => geriSorYaz(acik)} aria-label={`Geri çek: ${acik.baslik}`}>Geri çek</Dugme>
          ) : undefined}
        >
          <Alicilar key={acik.id} yayin={acik} />
        </Kart>
      )}
      {geriSor !== null && (
        <OnayPenceresi
          acik
          baslik="Bildirim geri çekilsin mi?"
          onayMetni="Geri çek"
          tehlikeli
          vazgec={() => geriSorYaz(null)}
          onayla={() => geriCek.mutate(geriSor.id)}
          yukleniyor={geriCek.isPending}
        >
          <p>"{geriSor.baslik}" ortada artık çıkmaz; alıcıların merkezinde üstü çizili kalır. Geri alınamaz.</p>
        </OnayPenceresi>
      )}
    </>
  );
}
