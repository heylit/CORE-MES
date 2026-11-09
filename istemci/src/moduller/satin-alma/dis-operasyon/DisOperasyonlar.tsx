import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { DisOperasyon } from '#paylasilan/sozlesme/satin-alma.ts';
import type { FasonGidisGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../../ortak/arayuz/index.ts';
import type { Siralama } from '../../../ortak/veri/liste-durumu.ts';
import { ApiHatasi, api } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, anahtarlar, cagri } from '../talep/ortak.ts';
import { FasonSureGrafikleri } from './FasonSureGrafikleri.tsx';
import './dis-operasyonlar.css';

const gun = (t: string | null) => (t === null ? '—' : `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`);
const zaman = (z: string | null) => (z === null ? '—' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(z)));
const adet = (n: number | null) => (n === null ? '—' : n.toLocaleString('tr-TR'));
const disarida = (x: DisOperasyon) => (x.gonderilen ?? 0) - (x.donen ?? 0) - (x.hurda ?? 0);

const gunMetni = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün`;
function gecikmeHucresi(x: DisOperasyon) {
  if (x.gecikmeSonDonus === null) return '—';
  const ana = x.gecikmeSonDonus > 0 ? <Rozet ton="hata">{gunMetni(x.gecikmeSonDonus)}</Rozet> : <Rozet ton="tamam">Zamanında</Rozet>;
  const agirlikli = x.gecikmeAgirlikli !== null && x.gecikmeAgirlikli > 0 && x.gecikmeAgirlikli !== x.gecikmeSonDonus ? <small>adet ağırlıklı {gunMetni(x.gecikmeAgirlikli)}</small> : null;
  return agirlikli ? <span className="sa-gecikme">{ana}{agirlikli}</span> : ana;
}

type Islem = 'gidis' | 'tamamla';
const BASLIK: Record<Islem, string> = { gidis: 'Fasona gönder', tamamla: 'Fason adımını tamamla' };

// 2426: mal kabul formu iş emri, hizmet sipariş satırı ve firmanın fason kutusuyla dolar; bilinmeyen alan gönderilmez.
export function malKabulAdresi(x: DisOperasyon): string {
  const p = new URLSearchParams({ fasonIsEmri: String(x.isEmriId) });
  if (x.siparisSatirId !== null) p.set('siparisSatiri', String(x.siparisSatirId));
  if (x.fasonKonumId !== null) p.set('konum', String(x.fasonKonumId));
  return `/stok/mal-kabul?${p.toString()}`;
}

const SUTUNLAR: Sutun<DisOperasyon>[] = [
  { anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, sirala: true, hucre: (x) => x.emirNo },
  { anahtar: 'adim', baslik: 'Adım', hucre: (x) => `${x.opNo}${x.adim ? ` ${x.adim}` : ''}` },
  { anahtar: 'urun', baslik: 'Ürün', sirala: true, hucre: (x) => x.urun ?? '—' },
  { anahtar: 'firma', baslik: 'Firma', sirala: true, hucre: (x) => x.firmaAdi ?? 'Seçilmedi' },
  { anahtar: 'planlanan', baslik: 'Planlanan gidiş', kirilmaz: true, sirala: true, hucre: (x) => gun(x.planlananGidis) },
  { anahtar: 'gidis', baslik: 'Gidiş', kirilmaz: true, sirala: true, hucre: (x) => zaman(x.gerceklesenGidis) },
  { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, sirala: true, hucre: (x) => gun(x.termin) },
  { anahtar: 'donus', baslik: 'İlk dönüş', kirilmaz: true, hucre: (x) => zaman(x.ilkDonus) },
  { anahtar: 'adet', baslik: 'Giden / dönen / hurda', hizala: 'sag', hucre: (x) => `${adet(x.gonderilen)} / ${adet(x.donen)} / ${adet(x.hurda)}` },
  // 2424-a c: iki ölçü yan yana; ana sayı son dönüşe göre (karneyle aynı), altında adet ağırlıklı (farklıysa).
  { anahtar: 'gecikme', baslik: 'Gecikme', sirala: true, hucre: (x) => gecikmeHucresi(x) },
];

// Süzgeç: durum çipleri. "Dışarıda" gönderilmiş ve dönmemiş adedi olan, "Gidecek" henüz gitmemiş, "Dönen" hepsi dönmüş.
type Durum = 'hepsi' | 'geciken' | 'gonderilecek' | 'disarida' | 'donen';
const DURUMLAR: { deger: Durum; baslik: string; uyar: (x: DisOperasyon) => boolean }[] = [
  { deger: 'hepsi', baslik: 'Hepsi', uyar: () => true },
  { deger: 'geciken', baslik: 'Geciken', uyar: (x) => (x.gecikmeSonDonus ?? 0) > 0 },
  { deger: 'gonderilecek', baslik: 'Gidecek', uyar: (x) => !x.gonderilen },
  { deger: 'disarida', baslik: 'Dışarıda', uyar: (x) => !!x.gonderilen && disarida(x) > 0 },
  { deger: 'donen', baslik: 'Dönen', uyar: (x) => !!x.gonderilen && disarida(x) <= 0 },
];
const kucuk = (t: string | null) => (t ?? '').toLocaleLowerCase('tr-TR');
const SIRA_DEGERI: Record<string, (x: DisOperasyon) => string | number> = {
  emir: (x) => x.emirNo, urun: (x) => kucuk(x.urun), firma: (x) => kucuk(x.firmaAdi), planlanan: (x) => x.planlananGidis ?? '9999',
  gidis: (x) => x.gerceklesenGidis ?? '9999', termin: (x) => x.termin ?? '9999', gecikme: (x) => x.gecikmeSonDonus ?? -1,
};
// Varsayılan sıra (2424): geciken önde (çok geciken önce), sonra termini yakın olan; terminsiz sonda.
function varsayilanSira(a: DisOperasyon, b: DisOperasyon): number {
  const ga = a.gecikmeSonDonus ?? 0, gb = b.gecikmeSonDonus ?? 0;
  if ((ga > 0) !== (gb > 0)) return ga > 0 ? -1 : 1;
  if (ga !== gb) return gb - ga;
  return (a.termin ?? '9999').localeCompare(b.termin ?? '9999') || a.emirNo.localeCompare(b.emirNo);
}
export function disOperasyonSuz(liste: readonly DisOperasyon[], metin: string, durum: Durum, siralama: Siralama | null): DisOperasyon[] {
  const q = kucuk(metin.trim());
  const uyar = DURUMLAR.find((d) => d.deger === durum)?.uyar ?? (() => true);
  const l = liste.filter((x) => uyar(x) && (!q || [x.emirNo, x.urun, x.adim, x.firmaAdi, String(x.opNo)].some((v) => kucuk(v).includes(q))));
  const deger = siralama ? SIRA_DEGERI[siralama.alan] : undefined;
  if (!siralama || !deger) return l.sort(varsayilanSira);
  const yon = siralama.yon === 'azalan' ? -1 : 1;
  return l.sort((a, b) => { const x = deger(a), y = deger(b); return (x < y ? -1 : x > y ? 1 : 0) * yon || varsayilanSira(a, b); });
}

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
  const [metin, metinYaz] = useState('');
  const [durum, durumYaz] = useState<Durum>('hepsi');
  const [siralama, siralamaYaz] = useState<Siralama | null>(null);
  const satirlar = useMemo(() => disOperasyonSuz(l.data?.operasyonlar ?? [], metin, durum, siralama), [l.data, metin, durum, siralama]);
  const sutunlar: Sutun<DisOperasyon>[] = !yazar ? SUTUNLAR : [...SUTUNLAR, {
    anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, hucre: (x) => (
      <>
        <Dugme simge="truck" disabled={x.firmaId === null || !x.sirada} title={x.firmaId === null ? 'Önce fason firması seçilmeli' : !x.sirada ? 'Önceki iş emirleri bitmeden fasona gönderilmez.' : undefined} onClick={() => acikYaz({ x, islem: 'gidis' })}>Gönder</Dugme>
        <Dugme simge="box" disabled={disarida(x) <= 0} title="Dönüş (sağlam ve hurda) mal kabulden girilir" onClick={() => { void git(malKabulAdresi(x)); }}>Mal kabulde gir</Dugme>
        <Dugme simge="check" disabled={!(x.gonderilen && disarida(x) <= 0)} onClick={() => acikYaz({ x, islem: 'tamamla' })}>Tamamla</Dugme>
      </>
    ),
  }];
  return (
    <Kart baslik="Dış operasyonlar">
      <FasonSureGrafikleri />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : l.data && !l.data.hazir ? <DurumKutusu durum="bos" mesaj="Fason iş emirleri üretim emirlerinden gelecek; bağlantı henüz kurulmadı." />
        : (
          <Tablo
            etiket="Dış operasyonlar" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.isEmriId} mesgul={l.isPending}
            bosMesaj={(l.data?.operasyonlar ?? []).length ? 'Bu süzgece uyan iş yok.' : 'Dışarıda iş yok.'}
            siralama={siralama} siralamaDegistir={siralamaYaz}
            arac={{
              arama: { deger: metin, degistir: metinYaz, etiket: 'Dış operasyonlarda ara', yerTutucu: 'Emir, ürün, adım ya da firma' },
              suzgec: { etiket: 'Durum', secili: durum, sec: (d) => durumYaz(d as Durum), secenekler: DURUMLAR.map((d) => ({ deger: d.deger, baslik: d.baslik })) },
              csv: { ad: 'dis-operasyonlar' },
            }}
          />
        )}
      {acik && <IslemPenceresi key={`${acik.x.isEmriId}-${acik.islem}`} x={acik.x} islem={acik.islem} kapat={() => acikYaz(null)} />}
    </Kart>
  );
}
