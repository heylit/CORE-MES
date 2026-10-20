import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { DisOperasyon } from '#paylasilan/sozlesme/satin-alma.ts';
import type { FasonGidisGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, anahtarlar, cagri } from '../talep/ortak.ts';
import { FasonSureGrafikleri } from './FasonSureGrafikleri.tsx';

const gun = (t: string | null) => (t === null ? '—' : `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`);
const zaman = (z: string | null) => (z === null ? '—' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(z)));
const adet = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR'));
const disarida = (x: DisOperasyon) => (x.gonderilen ?? 0) - (x.donen ?? 0) - (x.hurda ?? 0);

type Islem = 'gidis' | 'tamamla';
const BASLIK: Record<Islem, string> = { gidis: 'Fasona gönder', tamamla: 'Fason adımını tamamla' };

const SUTUNLAR: Sutun<DisOperasyon>[] = [
  { anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (x) => x.emirNo },
  { anahtar: 'adim', baslik: 'Adım', hucre: (x) => `${x.opNo}${x.adim ? ` ${x.adim}` : ''}` },
  { anahtar: 'urun', baslik: 'Ürün', hucre: (x) => x.urun ?? '—' },
  { anahtar: 'firma', baslik: 'Firma', hucre: (x) => x.firmaAdi ?? 'Seçilmedi' },
  { anahtar: 'planlanan', baslik: 'Planlanan gidiş', kirilmaz: true, hucre: (x) => gun(x.planlananGidis) },
  { anahtar: 'gidis', baslik: 'Gidiş', kirilmaz: true, hucre: (x) => zaman(x.gerceklesenGidis) },
  { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (x) => gun(x.termin) },
  { anahtar: 'donus', baslik: 'İlk dönüş', kirilmaz: true, hucre: (x) => zaman(x.ilkDonus) },
  { anahtar: 'adet', baslik: 'Giden / dönen / hurda', hizala: 'sag', hucre: (x) => `${adet(x.gonderilen)} / ${adet(x.donen)} / ${adet(x.hurda)}` },
  { anahtar: 'gecikme', baslik: 'Gecikme', hucre: (x) => (x.gecikmeGun === null ? '—' : x.gecikmeGun > 0 ? <Rozet ton="hata">{x.gecikmeGun} gün</Rozet> : <Rozet ton="tamam">Zamanında</Rozet>) },
];

const sayi = (m: string): number | null => (/^\d+$/.test(m.trim()) ? Number(m.trim()) : null);

// Gidiş ve tamamlama üretim emirlerinin komutlarıdır (kart #995); adet sınırlarını sunucu denetler, ekran iletisini gösterir. Dönüş
// (sağlam ve hurda) yalnız mal kabulden girer (kullanıcı kararı 15.10 B): stok ve dönüş kaydı tek yerde yazılır.
function IslemPenceresi({ x, islem, kapat }: { x: DisOperasyon; islem: Islem; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [gonderilen, gonderilenYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  // Pencere açıkken kimlik korunur: ağ kopup yeniden basılan gidiş adedi iki kez saymaz.
  const [kimlik] = useState(yeniIstekKimligi);
  const yol = `/adimli-emirler/${x.uretimEmriId}/is-emirleri/${x.isEmriId}/fason-${islem}`;
  const gonder = useMutation({
    mutationFn: (govde: FasonGidisGovdesi | undefined) =>
      tekrarKorumaliGonder((deneme) => api.post<unknown>(yol, govde, deneme), { ...SURE, istekKimligi: kimlik }),
    onSuccess: () => {
      bildir('tamam', islem === 'gidis' ? `${x.emirNo} fasona gönderildi.` : `${x.emirNo} fason adımı tamamlandı.`);
      void istemci.invalidateQueries({ queryKey: anahtarlar.disOperasyonlar });
      kapat();
    },
    onError: (h) => hataYaz(h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.'),
  });
  const kaydet = () => {
    hataYaz(null);
    if (islem === 'tamamla') return gonder.mutate(undefined);
    const a = sayi(gonderilen);
    if (a === null || a === 0) return hataYaz('Gönderilen adedi sıfırdan büyük tam sayı olarak yazın.');
    gonder.mutate({ adet: a });
  };
  return (
    <Pencere acik kapat={kapat} baslik={BASLIK[islem]}
      alt={<><Dugme tur="birincil" simge="check" yukleniyor={gonder.isPending} onClick={kaydet}>Kaydet</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <form onSubmit={(e) => { e.preventDefault(); kaydet(); }} noValidate>
        <p>{x.emirNo}, adım {x.opNo}{x.adim ? ` ${x.adim}` : ''}{x.firmaAdi ? `, ${x.firmaAdi}` : ''}. Giden {adet(x.gonderilen)}, dönen {adet(x.donen)}, hurda {adet(x.hurda)}.</p>
        {islem === 'gidis' && <Girdi etiket="Gönderilen adet" inputMode="numeric" value={gonderilen} onChange={(e) => gonderilenYaz(e.target.value)} required autoFocus />}
        {islem === 'tamamla' && <p>Adım dönen sağlam adetle ({adet(x.donen)}) biter; sonraki adıma geçilir.</p>}
        {hata && <p role="alert">{hata}</p>}
      </form>
    </Pencere>
  );
}

// Dış operasyonlar (kart #542, D1 a): fason iş emirlerinin gidiş, termin ve dönüşü; fason yetkisi olan gidişi buradan girer (#995),
// dönüş mal kabule yönlendirir.
export function DisOperasyonlar() {
  const { data: kullanici } = useOturum();
  const git = useNavigate();
  const yazar = kullanici?.islemler.includes('uretim-emirleri.fason') ?? false;
  const [acik, acikYaz] = useState<{ x: DisOperasyon; islem: Islem } | null>(null);
  const l = useQuery({ queryKey: anahtarlar.disOperasyonlar, queryFn: () => cagri.get('/satin-alma-dis-operasyonlar', SURE) });
  const sutunlar: Sutun<DisOperasyon>[] = !yazar ? SUTUNLAR : [...SUTUNLAR, {
    anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, hucre: (x) => (
      <>
        <Dugme simge="truck" disabled={x.firmaId === null} title={x.firmaId === null ? 'Önce fason firması seçilmeli' : undefined} onClick={() => acikYaz({ x, islem: 'gidis' })}>Gönder</Dugme>
        <Dugme simge="box" disabled={disarida(x) <= 0} title="Dönüş (sağlam ve hurda) mal kabulden girilir" onClick={() => { void git('/stok/mal-kabul'); }}>Mal kabulde gir</Dugme>
        <Dugme simge="check" disabled={!(x.gonderilen && disarida(x) <= 0)} onClick={() => acikYaz({ x, islem: 'tamamla' })}>Tamamla</Dugme>
      </>
    ),
  }];
  return (
    <Kart baslik="Dış operasyonlar">
      <FasonSureGrafikleri />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : l.data && !l.data.hazir ? <DurumKutusu durum="bos" mesaj="Fason iş emirleri üretim emirlerinden gelecek; bağlantı henüz kurulmadı." />
        : <Tablo etiket="Dış operasyonlar" sutunlar={sutunlar} satirlar={l.data?.operasyonlar ?? []} satirAnahtari={(x) => x.isEmriId} mesgul={l.isPending} bosMesaj="Dışarıda iş yok." />}
      {acik && <IslemPenceresi key={`${acik.x.isEmriId}-${acik.islem}`} x={acik.x} islem={acik.islem} kapat={() => acikYaz(null)} />}
    </Kart>
  );
}
