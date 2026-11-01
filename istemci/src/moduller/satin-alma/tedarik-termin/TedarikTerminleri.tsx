import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TedarikTerminleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { DurumKutusu, Dugme, Girdi, Kart, Pencere, Rozet, Tablo, useBildirim, type Sutun } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, cagri } from '../talep/ortak.ts';

type Satir = TedarikTerminleriCevabi['terminler'][number];
const ANAHTAR = ['satin-alma', 'tedarik-terminleri'] as const;
// 534 1 a: termini satın almayı yazan ve planı yazan girer (sunucu da aynısını denetler).
const YAZAR_ISLEMLERI = ['satin-alma.yaz', 'plan.yaz'];
const gun = (t: string | null) => (t === null ? '—' : `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`);

// Açık siparişin en erken beklenen teslimi; tarihi olmayan sipariş tarih vermez.
const ilkGelis = (x: Satir): string | null =>
  x.siparisler.reduce<string | null>((en, s) => (s.tarih !== null && (en === null || s.tarih < en) ? s.tarih : en), null);
const bekliyorMu = (x: Satir) => x.termin === null && x.gerekenTarih !== null && x.siparisler.length === 0;

// Plan termin girilmemiş malzemeyi olması gereken tarihle hesaplar ve "termin bekleniyor" der; geç kalan termin katı kipte işi bekletir.
// Sipariş verilmişse elle termin yerine siparişin beklenen teslimi karşılaştırılır; gereken tarihi geçmiş satır gecikmiştir.
function durum(x: Satir, bugun: string | null) {
  const tarih = x.termin ?? ilkGelis(x);
  if (x.gerekenTarih === null) return x.termin !== null ? <Rozet>Plan istemiyor</Rozet> : x.siparisler.length > 0 ? <Rozet>Sipariş verildi</Rozet> : null;
  if (bugun !== null && x.gerekenTarih < bugun) return <Rozet ton="hata">Gecikti</Rozet>;
  if (tarih === null) return x.siparisler.length > 0 ? <Rozet ton="uyari">Sipariş verildi, teslim tarihi yok</Rozet> : <Rozet ton="uyari">Termin bekleniyor</Rozet>;
  return tarih > x.gerekenTarih ? <Rozet ton="hata">Geç kalıyor</Rozet> : <Rozet ton="tamam">Zamanında</Rozet>;
}

const siparisMetni = (x: Satir) => (x.siparisler.length === 0 ? '—' : x.siparisler.map((s) => `${s.siparisNo} · ${gun(s.tarih)}`).join(', '));

const sutunlarKur = (bugun: string | null): Sutun<Satir>[] => [
  { anahtar: 'kod', baslik: 'Malzeme', mono: true, kirilmaz: true, hucre: (x) => x.malzemeKodu || `#${x.malzemeNo}` },
  { anahtar: 'ad', baslik: 'Ad', hucre: (x) => x.malzemeAdi || '—' },
  { anahtar: 'gereken', baslik: 'Olması gereken', kirilmaz: true, hucre: (x) => gun(x.gerekenTarih) },
  { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (x) => gun(x.termin) },
  { anahtar: 'siparis', baslik: 'Açık sipariş', hucre: (x) => siparisMetni(x) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (x) => durum(x, bugun) ?? '—' },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (x) => x.aciklama || '—' },
  { anahtar: 'giren', baslik: 'Giren', hucre: (x) => x.kisiAdi ?? '—' },
];

const hataMetni = (h: unknown) => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.');

function TerminPenceresi({ x, kapat }: { x: Satir; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [termin, terminYaz] = useState(x.termin ?? '');
  const [aciklama, aciklamaYaz] = useState(x.aciklama);
  const kaydet = useMutation({
    mutationFn: () => cagri.post('/satin-alma-tedarik-terminleri/kaydet', {
      govde: { malzemeNo: x.malzemeNo, termin: termin === '' ? null : termin, aciklama: aciklama.trim(), surum: x.surum }, ...SURE,
    }),
    onSuccess: () => {
      bildir('tamam', termin === '' ? 'Termin kaldırıldı.' : 'Termin kaydedildi.');
      void istemci.invalidateQueries({ queryKey: ANAHTAR });
      kapat();
    },
    // Başkası (satın alma ya da planlama) araya girdiyse liste yenilenir; pencere eski sürümle yeniden göndermez.
    onError: (h) => { if (h instanceof ApiHatasi && h.durum === 409) void istemci.invalidateQueries({ queryKey: ANAHTAR }); },
  });
  return (
    <Pencere acik kapat={kapat} baslik={`Tedarik termini: ${x.malzemeKodu || `#${x.malzemeNo}`}`}
      alt={<><Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} onClick={() => kaydet.mutate()}>Kaydet</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <form onSubmit={(e) => { e.preventDefault(); kaydet.mutate(); }} noValidate>
        <p>{x.malzemeAdi || '—'}. Olması gereken: {gun(x.gerekenTarih)}.</p>
        <Girdi etiket="Termin" type="date" ipucu="Boş bırakılırsa termin kaldırılır; plan olması gereken tarihle hesaplar." value={termin}
          onChange={(e) => terminYaz(e.target.value)} autoFocus />
        <Girdi etiket="Açıklama" value={aciklama} onChange={(e) => aciklamaYaz(e.target.value)} maxLength={200} />
        {kaydet.isError && <p role="alert">{hataMetni(kaydet.error)}</p>}
      </form>
    </Pencere>
  );
}

// 533 a: malzeme başına tedarik termini. Satırı plan getirir (olması gereken tarih); satın alma termini girer, plan girildiği an onu kullanır.
export function TedarikTerminleri() {
  const { data: kullanici } = useOturum();
  const yazar = kullanici?.islemler.some((i) => YAZAR_ISLEMLERI.includes(i)) ?? false;
  const [ara, araYaz] = useState('');
  const [acik, acikYaz] = useState<Satir | null>(null);
  const l = useQuery({ queryKey: ANAHTAR, queryFn: () => cagri.get('/satin-alma-tedarik-terminleri', SURE) });
  const aranan = ara.trim().toLocaleUpperCase('tr-TR');
  const satirlar = (l.data?.terminler ?? []).filter((x) => aranan === '' || `${x.malzemeKodu} ${x.malzemeAdi}`.toLocaleUpperCase('tr-TR').includes(aranan));
  const bekleyen = (l.data?.terminler ?? []).filter(bekliyorMu).length;
  const temel = sutunlarKur(l.data?.bugun ?? null);
  const sutunlar: Sutun<Satir>[] = !yazar ? temel : [...temel, {
    anahtar: 'islem', baslik: 'İşlem', kirilmaz: true,
    hucre: (x) => <Dugme simge="edit" onClick={() => acikYaz(x)}>Termin gir</Dugme>,
  }];
  return (
    <Kart baslik="Tedarik terminleri" sag={bekleyen > 0 && <Rozet ton="uyari">{bekleyen} termin bekleniyor</Rozet>}>
      <Girdi etiket="Ara" type="search" placeholder="Malzeme kodu ya da adı" value={ara} onChange={(e) => araYaz(e.target.value)} />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : <Tablo etiket="Tedarik terminleri" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.malzemeNo} mesgul={l.isPending}
          bosMesaj={ara ? 'Aramaya uyan malzeme yok.' : 'Planın termin beklediği malzeme yok.'} />}
      {acik && <TerminPenceresi key={`${acik.malzemeNo}-${acik.surum}`} x={acik} kapat={() => acikYaz(null)} />}
    </Kart>
  );
}
