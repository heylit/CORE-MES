import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TemizleCevabi, TemizlikAdayi, TemizlikAdaylariCevabi, TemizlikEtkisiCevabi, TemizlikKoku, TemizlikTarihi, TemizlikTarihSayisiCevabi, YedekAlCevabi, YedeklerCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { TEMIZLIK_ONAY_METNI, TEMIZLIK_TARIHLE_EN_COK_KOK, TEMIZLIK_TURLERI, TEMIZLIK_YEDEK_EN_ESKI_DK, type TemizlikTuru } from '#paylasilan/veri-temizleme.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Secim, Sekmeler, Tablo, useBildirim, type Sekme, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import './veri-temizleme.css';

// Deneme verisi temizleme (3395 a): kayıt önce "Deneme" işaretlenir, etki görülür, yedek alınır, parola ve TEMIZLE ile silinir.
// Sunucu her adımı yeniden denetler; ekran yalnız akışı yürütür.
type Adim = 'kapsam' | 'etki' | 'yedek' | 'onay' | 'sonuc';
type Kip = 'secerek' | 'toplu' | 'tarih';
// Kapsam ya elle toplanan seçimdir ya da tarihtir (o güne kadar açılmış işaretli kökler; sunucu çevirir).
type Kapsami = { secim: TemizlikKoku[] } | { tarih: TemizlikTarihi };

const TUR_SEKMELERI: readonly Sekme<TemizlikTuru>[] = [
  { anahtar: 'uretim_emri', baslik: 'Üretim emirleri', simge: 'list' },
  { anahtar: 'siparis', baslik: 'Siparişler', simge: 'file' },
  { anahtar: 'malzeme', baslik: 'Malzemeler', simge: 'box' },
];
const TUR_ADI: Readonly<Record<TemizlikTuru, string>> = { uretim_emri: 'emir', siparis: 'sipariş', malzeme: 'malzeme' };
const KIP_SEKMELERI: readonly Sekme<Kip>[] = [
  { anahtar: 'secerek', baslik: 'Seçerek', simge: 'check' },
  { anahtar: 'toplu', baslik: 'Toplu (süzgece uyan işaretliler)', simge: 'list' },
  { anahtar: 'tarih', baslik: 'Tarihle sıfırla', simge: 'calendar' },
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

function Kapsam({ secim, setSecim, ilerle, tarihleIlerle }: {
  secim: readonly TemizlikKoku[]; setSecim: (s: TemizlikKoku[]) => void; ilerle: () => void; tarihleIlerle: (t: TemizlikTarihi) => void;
}) {
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
  if (kip === 'tarih') {
    return (
      <>
        <Sekmeler etiket="Temizlik yolu" sekmeler={KIP_SEKMELERI} secili={kip} sec={setKip} />
        <TarihleKapsam ilerle={tarihleIlerle} />
      </>
    );
  }
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

// Tek tarihle toplu sıfırlama (3395 ek b): o gün dahil o güne kadar açılan bütün kayıtlar önce Deneme işaretlenir, sonra etki görülür.
// Bu yolda dış sisteme gitmiş kayıt da silinir; sayı işaretlemeden önce gösterilir, yanlış tarihin işareti geri alınır.
function TarihleKapsam({ ilerle }: { ilerle: (t: TemizlikTarihi) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [bitis, setBitis] = useState('');
  const [turler, setTurler] = useState<TemizlikTuru[]>([...TEMIZLIK_TURLERI]);
  const tarih: TemizlikTarihi = { bitis, turler };
  const hazir = bitis !== '' && turler.length > 0;
  const sorgu = `bitis=${bitis}&turler=${turler.join(',')}`;
  const sayi = useQuery({
    queryKey: [...anahtarlar.temizlikAdaylari, 'tarih-sayisi', sorgu],
    queryFn: () => api.get<TemizlikTarihSayisiCevabi>(`/veri-temizleme/tarih-sayisi?${sorgu}`),
    enabled: hazir,
  });
  const isaret = useMutation({
    mutationFn: (isaretli: boolean) => api.post<{ degisen: number }>('/veri-temizleme/isaret-tarihle', { ...tarih, isaretli }),
    onSuccess: ({ degisen }, isaretli) => {
      bildir('tamam', isaretli ? `${String(degisen)} kayıt Deneme işaretlendi.` : `${String(degisen)} kaydın işareti kaldırıldı.`);
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'İşaret değiştirilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.temizlikAdaylari }),
  });
  const turDegistir = (tur: TemizlikTuru, acik: boolean) => {
    setTurler(acik ? TEMIZLIK_TURLERI.filter((t) => t === tur || turler.includes(t)) : turler.filter((t) => t !== tur));
  };
  const s = hazir ? sayi.data : undefined;
  const durum = !hazir ? 'Tarih ve en az bir tür seçin.'
    : s === undefined ? (sayi.isError ? hataIletisi(sayi.error, 'Sayılamadı.') : 'Sayılıyor')
      : `Bu tarihe kadar ${String(s.toplam)} kayıt var, ${String(s.isaretli)} tanesi işaretli.`;
  return (
    <>
      <p className="tc-ayar-aciklama">
        {`Canlıda hiç gerçek veri yoksa: seçilen günün sonuna kadar açılmış bütün kayıtlar işaretlenir ve birlikte temizlenir. Bir seferde en çok ${String(TEMIZLIK_TARIHLE_EN_COK_KOK)} kayıt.`}
      </p>
      <p className="tc-temizlik-uyari" role="note">
        Bu yolda Logo'ya ya da SmartES'e gitmiş, etiketi basılmış, sevk ya da fatura görmüş kayıtlar da silinir; karşılıkları orada sahipsiz kalır. Geri dönüş yalnız yedekten.
      </p>
      <div className="tc-temizlik-suzgec">
        <Girdi etiket="Bu tarih dahil, öncesinde açılanlar" type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
      </div>
      <fieldset className="tc-temizlik-turler">
        <legend className="tc-ayar-aciklama">Kayıt türleri</legend>
        {TUR_SEKMELERI.map((t) => (
          <IsaretKutusu key={t.anahtar} etiket={t.baslik} checked={turler.includes(t.anahtar)} onChange={(e) => turDegistir(t.anahtar, e.target.checked)} />
        ))}
      </fieldset>
      <div className="tc-temizlik-cubuk">
        <span className="tc-ayar-aciklama" aria-live="polite">{durum}</span>
        <Dugme simge="rotate" disabled={(s?.isaretli ?? 0) === 0} yukleniyor={isaret.isPending && isaret.variables === false} onClick={() => isaret.mutate(false)}>İşaretleri geri al</Dugme>
        <Dugme simge="flag" disabled={s === undefined || s.toplam === s.isaretli} yukleniyor={isaret.isPending && isaret.variables === true} onClick={() => isaret.mutate(true)}>
          {s === undefined ? 'Tarihe kadar açılanları işaretle' : s.toplam === s.isaretli ? 'Hepsi işaretli' : `${String(s.toplam - s.isaretli)} kaydı işaretle`}
        </Dugme>
        <Dugme tur="birincil" simge="search" disabled={(s?.isaretli ?? 0) === 0} onClick={() => ilerle(tarih)}>Etkiyi gör</Dugme>
      </div>
    </>
  );
}

const kapsamSorgusu = (k: Kapsami): string => ('secim' in k
  ? `secim=${encodeURIComponent(k.secim.map(anahtar).join(','))}`
  : `bitis=${k.tarih.bitis}&turler=${k.tarih.turler.join(',')}`);

function Etki({ kapsam, setSecim, geri, ilerle }: {
  kapsam: Kapsami; setSecim: (s: TemizlikKoku[]) => void; geri: () => void; ilerle: (etki: TemizlikEtkisiCevabi) => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const metin = kapsamSorgusu(kapsam);
  const etki = useQuery({
    queryKey: [...anahtarlar.temizlikEtkisi, metin],
    queryFn: () => api.get<TemizlikEtkisiCevabi>(`/veri-temizleme/etki?${metin}`),
  });
  // Tarihle kapsamda kilitli kök seçimden ancak işareti kaldırılarak çıkar.
  const isaretKaldir = useMutation({
    mutationFn: (kokler: TemizlikKoku[]) => api.post<{ degisen: number }>('/veri-temizleme/isaret', { secim: kokler, isaretli: false }),
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Kilitliler çıkarılamadı.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.temizlikEtkisi }),
  });
  if (etki.isPending) return <DurumKutusu durum="yukleniyor" mesaj="Bağlı kayıtlar sayılıyor" />;
  if (etki.isError) return <DurumKutusu durum="hata" hata={etki.error} yenile={() => { void etki.refetch(); }} />;
  const veri = etki.data;
  const kilitli = veri.kokler.filter((k) => k.kilitler.length > 0);
  const kilitsizSayi = veri.kokler.length - kilitli.length;
  const kilitlileriCikar = () => {
    const kokler = kilitli.map((k) => ({ tur: k.tur, kimlik: k.kimlik }));
    if ('secim' in kapsam) { const cikan = new Set(kokler.map(anahtar)); setSecim(kapsam.secim.filter((k) => !cikan.has(anahtar(k)))); }
    else isaretKaldir.mutate(kokler);
  };
  const tablolar = Object.entries(veri.tablolar).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const toplam = tablolar.reduce((t, [, n]) => t + n, 0);
  const stokVar = tablolar.some(([t]) => t.startsWith('stok_'));
  return (
    <>
      <p className="tc-ayar-aciklama">{`${String(kilitsizSayi)} kayıt ve bağlı ${String(toplam - kilitsizSayi)} kayıt birlikte silinir. Sayılar şimdiki sayımdır.`}</p>
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
          <Dugme simge="x" yukleniyor={isaretKaldir.isPending} onClick={kilitlileriCikar}>Kilitlileri çıkar</Dugme>
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

function Onay({ kapsam, etki, yedekAdi, geri, bitti }: {
  kapsam: Kapsami; etki: TemizlikEtkisiCevabi; yedekAdi: string; geri: () => void; bitti: (s: TemizleCevabi) => void;
}) {
  const istemci = useQueryClient();
  const [onay, setOnay] = useState('');
  const [parola, setParola] = useState('');
  const [istekKimligi] = useState(yeniIstekKimligi);
  const toplam = Object.values(etki.tablolar).reduce((t, n) => t + n, 0);
  const kokSayisi = etki.kokler.filter((k) => k.kilitler.length === 0).length;
  const temizle = useMutation({
    mutationFn: () => api.post<TemizleCevabi>('/veri-temizleme/temizle', { ...kapsam, ozet: etki.ozet, yedekAdi, onay, parola }, { istekKimligi }),
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
          {`Temizle (${String(kokSayisi)} kayıt, ${String(Math.max(toplam - kokSayisi, 0))} bağlı)`}
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
  const [tarih, setTarih] = useState<TemizlikTarihi | null>(null);
  const kapsam: Kapsami = tarih === null ? { secim } : { tarih };
  const [etki, setEtki] = useState<TemizlikEtkisiCevabi | null>(null);
  const [yedekAdi, setYedekAdi] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<TemizleCevabi | null>(null);
  return (
    <Kart baslik="Deneme verisini temizle" simge="trash">
      <p className="tc-ayar-aciklama">Seçilen kayıtlar ve bağlı kayıtları kalıcı silinir. Seçerek ve toplu yolda Logo'ya ya da SmartES'e gitmiş, sevkli, faturalı ya da gerçek kayıtta kullanılan kayıt temizlenmez.</p>
      <Adimlar simdi={adim} />
      {adim === 'kapsam' && (
        <Kapsam secim={secim} setSecim={setSecim} ilerle={() => { setTarih(null); setAdim('etki'); }} tarihleIlerle={(t) => { setTarih(t); setAdim('etki'); }} />
      )}
      {adim === 'etki' && <Etki kapsam={kapsam} setSecim={setSecim} geri={() => setAdim('kapsam')} ilerle={(e) => { setEtki(e); setAdim('yedek'); }} />}
      {adim === 'yedek' && <YedekAdimi geri={() => setAdim('etki')} ilerle={(ad) => { setYedekAdi(ad); setAdim('onay'); }} />}
      {adim === 'onay' && etki !== null && yedekAdi !== null && (
        <Onay kapsam={kapsam} etki={etki} yedekAdi={yedekAdi} geri={() => setAdim('etki')} bitti={(s) => { setSonuc(s); setSecim([]); setTarih(null); setAdim('sonuc'); }} />
      )}
      {adim === 'sonuc' && sonuc !== null && <Sonuc sonuc={sonuc} yeni={() => { setSonuc(null); setEtki(null); setYedekAdi(null); setAdim('kapsam'); }} />}
    </Kart>
  );
}
