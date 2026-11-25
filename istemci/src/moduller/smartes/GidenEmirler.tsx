import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GidenEmirleriCevabi, SmartesYenidenGonderCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KimlikDefteri, korumaliGonder } from './kimlik-defteri.ts';
import { YOK, sayiMetni, zamanMetni } from './gosterim.ts';
import './smartes.css';

type Emir = GidenEmirleriCevabi['emirler'][number];
type Adim = Emir['adimlar'][number];

// Geniş ekranda adımlar tablo kalır (çok sütunlu izleme listesi; sığmazsa kendi kabında kayar), dar ekranda her adım kart olur.
const useGenis = (): boolean => {
  const sorgu = typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia('(min-width: 1024px)');
  const [genis, genisYaz] = useState(sorgu?.matches ?? false);
  useEffect(() => {
    if (sorgu === null) return undefined;
    const dinle = () => { genisYaz(sorgu.matches); };
    sorgu.addEventListener('change', dinle);
    return () => { sorgu.removeEventListener('change', dinle); };
  }, [sorgu]);
  return genis;
};

const GONDERILMEZ = { 'esleme-yok': 'İstasyon eşli değil', 'adim-disi': 'Gönderilmez', 'baglanti-kapali': 'Bağlantı kapalı' } as const;

function adimDurumu(a: Adim): { metin: string; ton: RozetTonu } {
  if (a.durum === 'gonderildi') return a.kapandi ? { metin: 'Kapatıldı', ton: 'pasif' } : { metin: 'Gönderildi', ton: 'tamam' };
  if (a.durum === 'sirada') return { metin: 'Sırada', ton: 'bilgi' };
  if (a.durum === 'yeniden-denenecek') return { metin: 'Yeniden denenecek', ton: 'uyari' };
  if (a.durum === 'durdu') return { metin: 'Eylem gerekli', ton: 'hata' };
  return { metin: a.gonderilmez === null ? YOK : GONDERILMEZ[a.gonderilmez], ton: 'pasif' };
}

// Emrin toplamı: en kötü adımın durumu. Sorunlu emir açık gelir.
function emirDurumu(e: Emir): { metin: string; ton: RozetTonu } {
  if (e.adimlar.some((a) => a.durum === 'durdu')) return { metin: 'Eylem gerekli', ton: 'hata' };
  if (e.adimlar.some((a) => a.durum === 'yeniden-denenecek')) return { metin: 'Yeniden denenecek', ton: 'uyari' };
  if (e.adimlar.some((a) => a.durum === 'sirada')) return { metin: 'Sırada', ton: 'bilgi' };
  return e.gonderilen > 0 ? { metin: 'Gönderildi', ton: 'tamam' } : { metin: 'Gönderilmez', ton: 'pasif' };
}

function GonderilenAlanlar({ adim, kapat }: { adim: Adim; kapat: () => void }) {
  return (
    <Pencere acik tur="yan" kapat={kapat} baslik={`OP ${adim.opNo}: SmartES’e giden alanlar`}>
      <div className="tc-smartes tc-sg-alanlar">
        {adim.alanlar.length === 0
          ? <p className="tc-smartes-aciklama">Bu adım için henüz SmartES’e istek hazırlanmadı.</p>
          : (
            <dl className="tc-smartes-liste tc-sg-ham">
              {adim.alanlar.map((a) => (<div key={a.ad} className="tc-sg-ham-satir"><dt>{a.ad}</dt><dd>{a.deger === '' ? YOK : a.deger}</dd></div>))}
            </dl>
          )}
      </div>
    </Pencere>
  );
}

function EmirGrubu({ e, gonderir }: { e: Emir; gonderir: boolean }) {
  const [acik, acikYaz] = useState(e.sorunlu);
  const [alanlar, alanlarYaz] = useState<Adim | null>(null);
  const genis = useGenis();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  // Tekrar korumalı komut: kimlik iş emri başına tutulur; sonucu bilinmeyen hatadan sonraki basış aynı kimliği taşır.
  const [defter] = useState(() => new KimlikDefteri());
  // Gönderim sürerken gelen ikinci tık düşer (çift tık tek istek, tek bildirim).
  const yeniden = useTekGonderim({
    mutationFn: (isEmriId: number) => korumaliGonder(defter, String(isEmriId), (d) => api.post<SmartesYenidenGonderCevabi>('/smartes/giden/yeniden-gonder', { isEmirleri: [isEmriId] }, d)),
    onSuccess: async (c) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir(c.sirada > 0 ? 'tamam' : 'bilgi', c.sirada > 0 ? 'Yeniden gönderilmek üzere sıraya alındı.' : 'Bu adım durmuş değil; sıraya alınmadı.');
    },
    onError: (x) => { bildir('hata', hataIletisi(x, 'Yeniden gönderilemedi')); },
  });
  const d = emirDurumu(e);
  const sutunlar: Sutun<Adim>[] = [
    {
      anahtar: 'op', baslik: 'Adım · makine · adet', sabit: 'sol', kartTamSatir: true, csv: (a) => `OP ${a.opNo} ${a.ad} ${a.makineKodu ?? ''} ${a.adet ?? ''}`, hucre: (a) => (
        <span className="tc-gd-yigin">
          <span className="tc-sga-ad"><span className="mono">{`OP ${a.opNo}`}</span><span>{a.ad}</span></span>
          <span className="tc-sm-not">{`${a.makineKodu ?? 'makine yok'} · ${sayiMetni(a.adet)} adet`}</span>
        </span>
      ),
    },
    {
      anahtar: 'istasyon', baslik: 'İstasyon', kartTamSatir: true, hucre: (a) => (
        <span className="tc-gd-yigin">
          <span className="mono tc-sm-kirilmaz">{`${a.coreIstasyonKodu ?? YOK} → ${a.smartesIstasyonKodu ?? YOK}`}</span>
          {a.istasyonEslemesi !== null && <Rozet ton="bilgi" gorunum="cizgi">{a.istasyonEslemesi === 'istasyon' ? 'kendi eşlemesi' : 'iş merkezinden'}</Rozet>}
        </span>
      ),
    },
    {
      anahtar: 'operasyon', baslik: 'Operasyon kodu', kartTamSatir: true, hucre: (a) => (
        <span className="tc-gd-yigin">
          <span className="mono">{a.operasyonKodu ?? YOK}</span>
          {a.operasyonTipi !== null && <span className="tc-sm-not">{`tip ${a.operasyonTipi}${a.kodKaynagi === 'onek' ? `, önek ${a.operasyonOneki ?? ''}` : a.kodKaynagi === 'tip-kodu' ? ', tip kodu' : ''}`}</span>}
          {a.operasyonTipi === null && <span className="tc-sm-not">tipi yok</span>}
        </span>
      ),
    },
    {
      anahtar: 'durum', baslik: 'Durum ve neden', kartTamSatir: true, csv: (a) => `${adimDurumu(a).metin} ${a.neden ?? ''}`, hucre: (a) => (
        <span className="tc-gd-deneme">
          <Rozet ton={adimDurumu(a).ton}>{adimDurumu(a).metin}</Rozet>
          {a.denemeSayisi !== null && (
            <span className="tc-sm-not">
              {`${sayiMetni(a.denemeSayisi)}. deneme, son ${zamanMetni(a.sonDeneme)}${a.sonrakiDeneme === null ? '' : `, sonraki ${zamanMetni(a.sonrakiDeneme)}`}`}
            </span>
          )}
          {a.neden !== null && <span>{a.neden}</span>}
        </span>
      ),
    },
    {
      anahtar: 'eylem', baslik: 'İşlem', kartTamSatir: true, csv: false, sabit: 'sag', hucre: (a) => {
        const takildi = a.durum === 'durdu' || a.durum === 'yeniden-denenecek';
        const eslemeNedeni = a.neden !== null && /operasyonu yok|operasyon tipi yok|operasyon kodu tanımsız/i.test(a.neden);
        return (
          <span className="tc-gd-islem">
            <Dugme simge="list" onClick={() => { alanlarYaz(a); }}>Alanlar</Dugme>
            {a.durum === 'durdu' && gonderir && (
              <Dugme simge="rotate" yukleniyor={yeniden.isPending && yeniden.variables === a.isEmriId} onClick={() => { yeniden.mutate(a.isEmriId); }}>Yeniden gönder</Dugme>
            )}
            {takildi && <Link className="tc-sg-baglanti" to={`/uretim-emirleri/${String(e.emirId)}`}>Rota adımını aç</Link>}
            {takildi && eslemeNedeni && <Link className="tc-sg-baglanti" to="/smartes/eslemeler">Eşlemeyi aç</Link>}
          </span>
        );
      },
    },
  ];
  return (
    <section className="tc-gd-emir" data-sorunlu={e.sorunlu ? '' : undefined}>
      <h3 className="tc-gd-baslik">
        <button type="button" className="tc-gd-ac" aria-expanded={acik} aria-label={`${e.emirNo} adımlarını ${acik ? 'kapat' : 'aç'}`} onClick={() => { acikYaz(!acik); }}>
          <Simge ad={acik ? 'down' : 'chev-right'} boyut="k" />
          <span className="mono">{e.emirNo}</span>
          <Rozet ton={d.ton}>{d.metin}</Rozet>
          <span className="tc-sm-not">{`${e.gonderilen} / ${e.adimSayisi} adım gönderildi`}</span>
        </button>
        <Link className="tc-sg-baglanti" to={`/uretim-emirleri/${String(e.emirId)}`}>Üretim emrine git</Link>
      </h3>
      {acik && <Tablo etiket={`${e.emirNo} adımları`} kip={genis ? 'kaydir' : 'uyarlanir'} sutunlar={sutunlar} satirlar={e.adimlar} satirAnahtari={(a) => a.isEmriId} bosMesaj="Adım yok." />}
      {alanlar !== null && <GonderilenAlanlar adim={alanlar} kapat={() => { alanlarYaz(null); }} />}
    </section>
  );
}

// İş emri gönderimi: üretim emri başına grup, içinde operasyon operasyon gönderim ayrıntısı. Sorunlu emirler üstte ve açık gelir.
export function Giden() {
  const [sayfa, sayfaYaz] = useState(1);
  const [ara, araYaz] = useState('');
  const oturum = useOturum();
  const gonderir = oturum.data?.islemler.includes('ayarlar.yaz') === true;
  const liste = useQuery({
    queryKey: anahtarlar.liste('giden-emirler', sayfa),
    queryFn: () => api.get<GidenEmirleriCevabi>(`/smartes/giden/emirler?sayfa=${String(sayfa)}`),
    placeholderData: keepPreviousData,
  });
  const v = liste.data;
  const aranan = ara.trim().toLocaleLowerCase('tr');
  const emirler = (v?.emirler ?? []).filter((e) => aranan === '' || e.emirNo.toLocaleLowerCase('tr').includes(aranan)
    || e.adimlar.some((a) => (a.operasyonKodu ?? '').toLocaleLowerCase('tr').includes(aranan)));
  const sonSayfa = v === undefined ? 1 : Math.max(1, Math.ceil(v.toplam / v.sayfaBoyu));
  return (
    <Kart baslik="İş emri gönderimi">
      <div className="tc-smartes">
        <p className="tc-smartes-aciklama">
          Planlı iş emirleri, istasyonu SmartES’te eşlenmişse operasyon operasyon SmartES’e gönderilir; her adımın hangi istasyon ve operasyon koduyla,
          hangi eşlemeyle gittiği burada görünür. Plandan düşen emir SmartES’te kapatılır, silinmez. Sorunlu emirler üstte ve açıktır.
        </p>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Liste alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {v && (
          <>
            <div className="tc-sga-ust">
              <p className="tc-smartes-ozet">
                <Rozet ton="bilgi">{`${v.toplam} emir`}</Rozet>
                {v.sorunlu > 0 && <Rozet ton="hata">{`Bu sayfada ${v.sorunlu} sorunlu`}</Rozet>}
              </p>
              <Girdi etiket="Emir ya da operasyon kodu ara" value={ara} onChange={(o) => { araYaz(o.target.value); }} />
            </div>
            {emirler.length === 0 && <p className="tc-smartes-aciklama">{v.toplam === 0 ? 'Henüz gönderilen iş emri yok.' : 'Aramaya uyan emir yok.'}</p>}
            {emirler.map((e) => <EmirGrubu key={e.emirId} e={e} gonderir={gonderir} />)}
            {sonSayfa > 1 && (
              <div className="tc-sga-ust">
                <Dugme disabled={v.sayfa <= 1} onClick={() => { sayfaYaz(v.sayfa - 1); }}>Önceki</Dugme>
                <span className="tc-sm-not">{`Sayfa ${v.sayfa} / ${sonSayfa}`}</span>
                <Dugme disabled={v.sayfa >= sonSayfa} onClick={() => { sayfaYaz(v.sayfa + 1); }}>Sonraki</Dugme>
              </div>
            )}
          </>
        )}
      </div>
    </Kart>
  );
}
