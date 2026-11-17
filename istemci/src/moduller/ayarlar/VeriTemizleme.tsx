import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TemizleCevabi, TemizlikAdayi, TemizlikAdaylariCevabi, TemizlikEtkisiCevabi, TemizlikKoku, YedekAlCevabi, YedeklerCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { TEMIZLIK_ONAY_METNI, TEMIZLIK_YEDEK_EN_ESKI_DK, type TemizlikTuru } from '#paylasilan/veri-temizleme.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Sekmeler, Tablo, useBildirim, type Sekme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import './veri-temizleme.css';

// Deneme verisi temizleme (3395 a): kayıt önce "Deneme" işaretlenir, etki görülür, yedek alınır, parola ve TEMIZLE ile silinir.
// Sunucu her adımı yeniden denetler; ekran yalnız akışı yürütür.
type Adim = 'kapsam' | 'etki' | 'yedek' | 'onay' | 'sonuc';
type Kip = 'secerek' | 'toplu';

const TUR_SEKMELERI: readonly Sekme<TemizlikTuru>[] = [
  { anahtar: 'uretim_emri', baslik: 'Üretim emirleri', simge: 'list' },
  { anahtar: 'siparis', baslik: 'Siparişler', simge: 'file' },
  { anahtar: 'malzeme', baslik: 'Malzemeler', simge: 'box' },
];
const TUR_ADI: Readonly<Record<TemizlikTuru, string>> = { uretim_emri: 'emir', siparis: 'sipariş', malzeme: 'malzeme' };
const KIP_SEKMELERI: readonly Sekme<Kip>[] = [
  { anahtar: 'secerek', baslik: 'Seçerek', simge: 'check' },
  { anahtar: 'toplu', baslik: 'Toplu (süzgece uyan işaretliler)', simge: 'list' },
];
const ADIMLAR: readonly { anahtar: Adim; baslik: string }[] = [
  { anahtar: 'kapsam', baslik: '1 Kapsam' }, { anahtar: 'etki', baslik: '2 Etki' }, { anahtar: 'yedek', baslik: '3 Yedek' }, { anahtar: 'onay', baslik: '4 Onay' },
];
const TABLO_ADI: Readonly<Record<string, string>> = {
  uretim_emri: 'Üretim emri', siparisler_siparis: 'Sipariş', siparisler_siparis_satiri: 'Sipariş satırı', malzeme_katalog_karti: 'Malzeme kartı',
  uretim_emirleri_is_emri: 'İş emri', emir_adimi: 'Emir adımı', uretim_kaydi: 'Üretim kaydı', uretim_sayimi: 'Üretim sayımı', stok_hareketi: 'Stok hareketi',
  stok_parti: 'Stok partisi', kalite_merkezi_olcum: 'Ölçüm',
};
const tabloAdi = (t: string): string => TABLO_ADI[t] ?? t.replaceAll('_', ' ');
const YEDEK_YOKLAMA_MS = 3000;

const anahtar = (k: TemizlikKoku): string => `${k.tur}:${String(k.kimlik)}`;
const tarihMetni = (iso: string): string => new Date(iso).toLocaleDateString('tr-TR');

function turSayilari(turler: readonly TemizlikTuru[]): string {
  return TUR_SEKMELERI.map((s) => [s.anahtar, turler.filter((t) => t === s.anahtar).length] as const)
    .filter(([, n]) => n > 0).map(([tur, n]) => `${String(n)} ${TUR_ADI[tur]}`).join(', ');
}
const sepetOzeti = (secim: readonly TemizlikKoku[]): string => turSayilari(secim.map((k) => k.tur));

function Adimlar({ simdi }: { simdi: Adim }) {
  const sira = ADIMLAR.findIndex((a) => a.anahtar === simdi);
  return (
    <ol className="tc-temizlik-adimlar" aria-label="Temizlik adımları">
      {ADIMLAR.map((a, i) => (
        <li key={a.anahtar} data-durum={i < sira || simdi === 'sonuc' ? 'tamam' : i === sira ? 'simdi' : 'sonra'} aria-current={i === sira ? 'step' : undefined}>
          {a.baslik}
        </li>
      ))}
    </ol>
  );
}

function Kapsam({ secim, setSecim, ilerle }: { secim: readonly TemizlikKoku[]; setSecim: (s: TemizlikKoku[]) => void; ilerle: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [tur, setTur] = useState<TemizlikTuru>('uretim_emri');
  const [kip, setKip] = useState<Kip>('secerek');
  const [baslangic, setBaslangic] = useState('');
  const [bitis, setBitis] = useState('');
  const [kisi, setKisi] = useState('');
  const [isaret, setIsaret] = useState<'isaretli' | 'hepsi'>('hepsi');
  const etkinIsaret = kip === 'toplu' ? 'isaretli' : isaret;
  const sorgu = new URLSearchParams({ tur, isaret: etkinIsaret });
  if (baslangic !== '') sorgu.set('baslangic', baslangic);
  if (bitis !== '') sorgu.set('bitis', bitis);
  if (kisi !== '') sorgu.set('kisi', kisi);
  const liste = useQuery({
    queryKey: [...anahtarlar.temizlikAdaylari, sorgu.toString()],
    queryFn: () => api.get<TemizlikAdaylariCevabi>(`/veri-temizleme/adaylar?${sorgu.toString()}`),
  });
  const isaretDegistir = useMutation({
    mutationFn: (x: { secim: TemizlikKoku[]; isaretli: boolean }) => api.post<{ degisen: number }>('/veri-temizleme/isaret', x),
    onSuccess: ({ degisen }, x) => {
      bildir('tamam', x.isaretli ? `${String(degisen)} kayıt Deneme işaretlendi.` : `${String(degisen)} kaydın işareti kaldırıldı.`);
      if (!x.isaretli) { const cikan = new Set(x.secim.map(anahtar)); setSecim(secim.filter((k) => !cikan.has(anahtar(k)))); }
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'İşaret değiştirilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.temizlikAdaylari }),
  });
  const sepette = useMemo(() => new Set(secim.map(anahtar)), [secim]);
  const ekle = (satirlar: readonly TemizlikAdayi[]) => {
    const isaretli = satirlar.filter((s) => s.isaretli);
    if (isaretli.length < satirlar.length) bildir('bilgi', 'İşaretsiz kayıt temizlenmez; önce Deneme işaretleyin.');
    const yeni = isaretli.map((s) => ({ tur, kimlik: s.kimlik })).filter((k) => !sepette.has(anahtar(k)));
    setSecim([...secim, ...yeni]);
  };
  const kokler = (satirlar: readonly TemizlikAdayi[]) => satirlar.map((s) => ({ tur, kimlik: s.kimlik }));
  // Satır düğmeleri tablonun toplu seçimi kapalıyken de (Görünüm > Etkileşim) işaretlemeyi ve eklemeyi açık tutar.
  const satirDugmeleri = (s: TemizlikAdayi) => (
    <span className="tc-temizlik-satir-dugme">
      <Dugme simge={s.isaretli ? 'x' : 'flag'} aria-label={`${s.no} ${s.isaretli ? 'işaretini kaldır' : 'Deneme işaretle'}`} title={s.isaretli ? 'İşareti kaldır' : 'Deneme işaretle'}
        disabled={isaretDegistir.isPending} onClick={() => { isaretDegistir.mutate({ secim: kokler([s]), isaretli: !s.isaretli }); }} />
      <Dugme simge="trash" tur="tehlike" aria-label={`${s.no} temizlemeye ekle`} title="Temizlemeye ekle"
        disabled={!s.isaretli || sepette.has(anahtar({ tur, kimlik: s.kimlik }))} onClick={() => ekle([s])} />
    </span>
  );
  const sutunlar: Sutun<TemizlikAdayi>[] = [
    { anahtar: 'no', baslik: 'No', mono: true, kirilmaz: true, hucre: (s) => s.no },
    { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad ?? '' },
    { anahtar: 'acan', baslik: 'Giren', hucre: (s) => s.acan },
    { anahtar: 'acilis', baslik: 'Açılış', kirilmaz: true, hucre: (s) => tarihMetni(s.acilis) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => s.durum },
    {
      anahtar: 'isaret', baslik: 'İşaret', hucre: (s) => (
        <span className="tc-temizlik-rozetler">
          {s.isaretli ? <Rozet ton="uyari">Deneme</Rozet> : <Rozet ton="pasif">İşaretsiz</Rozet>}
          {sepette.has(anahtar({ tur, kimlik: s.kimlik })) && <Rozet ton="hata">Temizlenecek</Rozet>}
        </span>
      ),
    },
    { anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, hucre: satirDugmeleri },
  ];
  const veri = liste.data;
  return (
    <>
      <Sekmeler etiket="Temizlik yolu" sekmeler={KIP_SEKMELERI} secili={kip} sec={setKip} />
      <Sekmeler etiket="Kayıt türü" sekmeler={TUR_SEKMELERI} secili={tur} sec={setTur} />
      <div className="tc-temizlik-suzgec">
        <Girdi etiket="Açılış tarihinden" type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} />
        <Girdi etiket="Açılış tarihine" type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
        <Secim etiket="Giren kişi" value={kisi} onChange={(e) => setKisi(e.target.value)} bosSecenek="Hepsi"
          secenekler={(veri?.kisiler ?? []).map((k) => ({ deger: String(k.id), baslik: k.ad }))} />
        <Secim etiket="İşaret" value={etkinIsaret} disabled={kip === 'toplu'} onChange={(e) => setIsaret(e.target.value === 'isaretli' ? 'isaretli' : 'hepsi')}
          secenekler={[{ deger: 'hepsi', baslik: 'Hepsi' }, { deger: 'isaretli', baslik: 'Deneme işaretli' }]} />
      </div>
      {liste.isError ? <DurumKutusu durum="hata" hata={liste.error} yenile={() => { void liste.refetch(); }} /> : (
        <Tablo
          etiket="Temizlik adayları"
          sutunlar={sutunlar}
          satirlar={veri?.adaylar ?? []}
          satirAnahtari={(s) => s.kimlik}
          yukleniyor={liste.isPending}
          bosMesaj={etkinIsaret === 'isaretli' ? 'Süzgece uyan Deneme işaretli kayıt yok.' : 'Süzgece uyan kayıt yok.'}
          toplu={{
            eylemler: [
              { anahtar: 'isaretle', baslik: 'Deneme işaretle', simge: 'flag', yap: (s) => { isaretDegistir.mutate({ secim: kokler(s), isaretli: true }); } },
              { anahtar: 'kaldir', baslik: 'İşareti kaldır', simge: 'x', yap: (s) => { isaretDegistir.mutate({ secim: kokler(s), isaretli: false }); } },
              { anahtar: 'ekle', baslik: 'Temizlemeye ekle', simge: 'trash', ton: 'tehlike', yap: ekle },
            ],
          }}
        />
      )}
      {veri !== undefined && veri.toplam > veri.adaylar.length && (
        <p className="tc-ayar-aciklama">{`Süzgece ${String(veri.toplam)} kayıt uyuyor; ilk ${String(veri.adaylar.length)} kayıt gösteriliyor. Süzgeci daraltın.`}</p>
      )}
      <div className="tc-temizlik-cubuk">
        <span className="tc-ayar-aciklama">{secim.length === 0 ? 'Temizlenecek kayıt seçilmedi.' : `Temizlenecek: ${sepetOzeti(secim)}`}</span>
        {kip === 'secerek' && veri !== undefined && veri.adaylar.some((a) => !a.isaretli) && (
          <Dugme simge="flag" yukleniyor={isaretDegistir.isPending} onClick={() => { isaretDegistir.mutate({ secim: kokler(veri.adaylar.filter((a) => !a.isaretli)), isaretli: true }); }}>
            {`Listelenen ${String(veri.adaylar.filter((a) => !a.isaretli).length)} kaydı işaretle`}
          </Dugme>
        )}
        {kip === 'toplu' && veri !== undefined && veri.adaylar.length > 0 && (
          <Dugme simge="list" onClick={() => ekle(veri.adaylar)}>{`Listelenen ${String(veri.adaylar.length)} işaretli kaydı ekle`}</Dugme>
        )}
        {secim.length > 0 && <Dugme simge="x" onClick={() => setSecim([])}>Boşalt</Dugme>}
        <Dugme tur="birincil" simge="search" disabled={secim.length === 0} onClick={ilerle}>Etkiyi gör</Dugme>
      </div>
    </>
  );
}

function Etki({ secim, setSecim, geri, ilerle }: {
  secim: readonly TemizlikKoku[]; setSecim: (s: TemizlikKoku[]) => void; geri: () => void; ilerle: (etki: TemizlikEtkisiCevabi) => void;
}) {
  const metin = secim.map(anahtar).join(',');
  const etki = useQuery({
    queryKey: [...anahtarlar.temizlikEtkisi, metin],
    queryFn: () => api.get<TemizlikEtkisiCevabi>(`/veri-temizleme/etki?secim=${encodeURIComponent(metin)}`),
  });
  if (etki.isPending) return <DurumKutusu durum="yukleniyor" mesaj="Bağlı kayıtlar sayılıyor" />;
  if (etki.isError) return <DurumKutusu durum="hata" hata={etki.error} yenile={() => { void etki.refetch(); }} />;
  const veri = etki.data;
  const kilitli = veri.kokler.filter((k) => k.kilitler.length > 0);
  const tablolar = Object.entries(veri.tablolar).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const toplam = tablolar.reduce((t, [, n]) => t + n, 0);
  const stokVar = tablolar.some(([t]) => t.startsWith('stok_'));
  return (
    <>
      <p className="tc-ayar-aciklama">{`${String(secim.length - kilitli.length)} kayıt ve bağlı ${String(toplam - (secim.length - kilitli.length))} kayıt birlikte silinir. Sayılar şimdiki sayımdır.`}</p>
      {tablolar.length > 0 && (
        <ul className="tc-temizlik-etki" aria-label="Silinecek kayıtlar">
          {tablolar.map(([t, n]) => <li key={t}><b>{n}</b><span>{tabloAdi(t)}</span></li>)}
        </ul>
      )}
      {stokVar && (
        <p className="tc-temizlik-uyari" role="note">Silinen stok hareketlerinin etkisi bakiyeden düşülür. Temizlikten sonra stok sayımı önerilir.</p>
      )}
      {kilitli.length > 0 && (
        <div className="tc-temizlik-kilit" role="alert">
          <p className="tc-ayar-baslik">{`${String(kilitli.length)} kayıt temizlenmez`}</p>
          <ul>
            {kilitli.map((k) => <li key={anahtar(k)}><span className="tc-temizlik-no">{k.no ?? String(k.kimlik)}</span>{` ${k.kilitler.join('; ')}`}</li>)}
          </ul>
          <Dugme simge="x" onClick={() => { const cikan = new Set(kilitli.map(anahtar)); setSecim(secim.filter((k) => !cikan.has(anahtar(k)))); }}>Kilitlileri çıkar</Dugme>
        </div>
      )}
      <div className="tc-temizlik-cubuk">
        <Dugme simge="back" onClick={geri}>Geri</Dugme>
        <Dugme tur="birincil" simge="box" disabled={kilitli.length > 0 || tablolar.length === 0} onClick={() => ilerle(veri)}>Yedek adımına geç</Dugme>
      </div>
    </>
  );
}

// Yedek elle alınır; ekran listede o andan sonra tamamlanan elle yedeği bekler. Sunucu temizlikte yedeğin yaşını yeniden denetler.
function YedekAdimi({ geri, ilerle }: { geri: () => void; ilerle: (ad: string) => void }) {
  const [baslangic, setBaslangic] = useState<string | null>(null);
  const al = useMutation({
    mutationFn: () => api.post<YedekAlCevabi>('/yedekler/al', {}),
    onSuccess: (c) => { setBaslangic(c.baslangic); },
  });
  const liste = useQuery({
    queryKey: [...anahtarlar.yedekler, 'temizlik'],
    queryFn: () => api.get<YedeklerCevabi>('/yedekler'),
    enabled: baslangic !== null,
    refetchInterval: (q) => (q.state.data?.suruyor === null && q.state.data.yedekler.some((y) => baslangic !== null && y.tur === 'elle' && y.zaman >= baslangic) ? false : YEDEK_YOKLAMA_MS),
  });
  const hazir = baslangic === null ? undefined : liste.data?.yedekler.find((y) => y.tur === 'elle' && y.zaman >= baslangic);
  const hata = baslangic !== null && liste.data?.suruyor === null && hazir === undefined && liste.data.sonHata !== null && liste.data.sonHata.zaman >= baslangic
    ? liste.data.sonHata.ileti : null;
  return (
    <>
      <p className="tc-ayar-aciklama">
        {`Temizlikten hemen önce veritabanının tam yedeği alınır. Yedek yalnız felaket dönüşüdür: geri yüklemek, temizlikten sonra girilen gerçek veriyi de geri alır. Yedek ${String(TEMIZLIK_YEDEK_EN_ESKI_DK)} dakika geçerlidir.`}
      </p>
      {al.isError && <DurumKutusu durum="hata" hata={al.error} mesaj={hataIletisi(al.error, 'Yedek başlatılamadı.')} />}
      {hata !== null && <DurumKutusu durum="hata" mesaj={`Yedek alınamadı: ${hata}`} />}
      {hazir !== undefined && <p className="tc-temizlik-bilgi"><Rozet ton="tamam">Yedek alındı</Rozet>{' '}<span className="tc-temizlik-no">{hazir.ad}</span></p>}
      <div className="tc-temizlik-cubuk">
        <Dugme simge="back" onClick={geri}>Geri</Dugme>
        {hazir === undefined
          ? <Dugme tur="birincil" simge="box" yukleniyor={al.isPending || (baslangic !== null && hata === null)} onClick={() => al.mutate()}>Yedek al</Dugme>
          : <Dugme tur="birincil" simge="check" onClick={() => ilerle(hazir.ad)}>Devam et</Dugme>}
      </div>
    </>
  );
}

function Onay({ secim, etki, yedekAdi, geri, bitti }: {
  secim: readonly TemizlikKoku[]; etki: TemizlikEtkisiCevabi; yedekAdi: string; geri: () => void; bitti: (s: TemizleCevabi) => void;
}) {
  const istemci = useQueryClient();
  const [onay, setOnay] = useState('');
  const [parola, setParola] = useState('');
  const [istekKimligi] = useState(yeniIstekKimligi);
  const toplam = Object.values(etki.tablolar).reduce((t, n) => t + n, 0);
  const temizle = useMutation({
    mutationFn: () => api.post<TemizleCevabi>('/veri-temizleme/temizle', { secim, ozet: etki.ozet, yedekAdi, onay, parola }, { istekKimligi }),
    onSuccess: (s) => { bitti(s); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.temizlikAdaylari }),
  });
  const gonder = (olay: FormEvent) => { olay.preventDefault(); temizle.mutate(); };
  return (
    <form className="tc-temizlik-onay" onSubmit={gonder}>
      <p className="tc-temizlik-bilgi"><Rozet ton="tamam">Yedek</Rozet>{' '}<span className="tc-temizlik-no">{yedekAdi}</span></p>
      <p className="tc-ayar-aciklama">Bu işlem geri alınmaz; geri dönüş yalnız yedekten. Kim, ne zaman, silinen numaralar ve yedek adı denetim kaydına yazılır.</p>
      <div className="tc-temizlik-suzgec">
        <Girdi etiket={`Onay için ${TEMIZLIK_ONAY_METNI} yazın`} value={onay} autoComplete="off" onChange={(e) => setOnay(e.target.value)} />
        <Girdi etiket="Parolanız" type="password" value={parola} autoComplete="current-password" onChange={(e) => setParola(e.target.value)} />
      </div>
      {temizle.isError && <DurumKutusu durum="hata" hata={temizle.error} mesaj={hataIletisi(temizle.error, 'Temizlik yapılamadı; hiçbir kayıt silinmedi.')} />}
      <div className="tc-temizlik-cubuk">
        <Dugme simge="back" onClick={geri}>Geri</Dugme>
        <Dugme type="submit" tur="tehlike" simge="trash" yukleniyor={temizle.isPending} disabled={onay !== TEMIZLIK_ONAY_METNI || parola === ''}>
          {`Temizle (${String(secim.length)} kayıt, ${String(Math.max(toplam - secim.length, 0))} bağlı)`}
        </Dugme>
      </div>
    </form>
  );
}

function Sonuc({ sonuc, yeni }: { sonuc: TemizleCevabi; yeni: () => void }) {
  const tablolar = Object.entries(sonuc.tablolar).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <p className="tc-temizlik-bilgi"><Rozet ton="tamam">Temizlendi</Rozet>{` ${turSayilari(sonuc.kokler.map((k) => k.tur))}`}</p>
      <ul className="tc-temizlik-etki" aria-label="Silinen kayıtlar">
        {tablolar.map(([t, n]) => <li key={t}><b>{n}</b><span>{tabloAdi(t)}</span></li>)}
      </ul>
      <p className="tc-ayar-aciklama">{`Geri dönüş için yedek: ${sonuc.yedekAdi}`}</p>
      <div className="tc-temizlik-cubuk"><Dugme tur="birincil" simge="plus" onClick={yeni}>Yeni temizlik</Dugme></div>
    </>
  );
}

export function VeriTemizleme() {
  const [adim, setAdim] = useState<Adim>('kapsam');
  const [secim, setSecim] = useState<TemizlikKoku[]>([]);
  const [etki, setEtki] = useState<TemizlikEtkisiCevabi | null>(null);
  const [yedekAdi, setYedekAdi] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<TemizleCevabi | null>(null);
  return (
    <Kart baslik="Deneme verisini temizle" simge="trash">
      <p className="tc-ayar-aciklama">Seçilen kayıtlar ve bağlı kayıtları kalıcı silinir. Logo'ya ya da SmartES'e gitmiş, sevkli, faturalı ya da gerçek kayıtta kullanılan kayıt temizlenmez.</p>
      <Adimlar simdi={adim} />
      {adim === 'kapsam' && <Kapsam secim={secim} setSecim={setSecim} ilerle={() => setAdim('etki')} />}
      {adim === 'etki' && <Etki secim={secim} setSecim={setSecim} geri={() => setAdim('kapsam')} ilerle={(e) => { setEtki(e); setAdim('yedek'); }} />}
      {adim === 'yedek' && <YedekAdimi geri={() => setAdim('etki')} ilerle={(ad) => { setYedekAdi(ad); setAdim('onay'); }} />}
      {adim === 'onay' && etki !== null && yedekAdi !== null && (
        <Onay secim={secim} etki={etki} yedekAdi={yedekAdi} geri={() => setAdim('etki')} bitti={(s) => { setSonuc(s); setSecim([]); setAdim('sonuc'); }} />
      )}
      {adim === 'sonuc' && sonuc !== null && <Sonuc sonuc={sonuc} yeni={() => { setSonuc(null); setEtki(null); setYedekAdi(null); setAdim('kapsam'); }} />}
    </Kart>
  );
}
