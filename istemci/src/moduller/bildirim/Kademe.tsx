import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import type { cihazDurumuCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  AcikTakiplerCevabi, GecikenlerimCevabi, KademeAyarDegistirGovdesi, KademeAyarlariCevabi, KademeAyarSatiri, KademeTakipSatiri,
} from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { KADEME_ADLARI, KADEME_GUN_EN_COK, KADEME_KAYNAKLARI, type Kademe } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import {
  Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import './bildirim.css';

// Kademeli uyarı (3405 a): kaynak başına ayar (yan pencere), kişinin Gecikenlerim listesi, bütün Açık takipler ve kişisel
// oturumdaki kırmızı şerit. Veri yetkisi uçlardadır; ekran yalnız gelen satırı çizer.

const KADEME_TONU: Record<Kademe, RozetTonu> = { 1: 'pasif', 2: 'bilgi', 3: 'uyari', 4: 'hata', 5: 'hata' };
const kademeAdi = (k: number): string => KADEME_ADLARI[k as Kademe] ?? `K${String(k)}`;
const KademeRozeti = ({ k }: { k: number }) => <Rozet ton={KADEME_TONU[k as Kademe] ?? 'pasif'}>{`K${String(k)} ${kademeAdi(k)}`}</Rozet>;
const kaynakAdi = (kaynak: string): string => (KADEME_KAYNAKLARI as Record<string, { ad: string }>)[kaynak]?.ad ?? kaynak;
const gunMetni = (g: number | null): string => (g === null ? 'kapalı' : `${String(g)} iş günü`);

function gunOzeti(s: KademeAyarSatiri): string {
  const parcalar = s.sayac === 'son-gun'
    ? [`K2 ${s.k2Gun === null ? 'kapalı' : `${String(s.k2Gun)} iş günü kala`}`, 'K3 son gün geçince']
    : [`K3 ${s.k3Birim === 'saat' && s.k3Gun !== null ? `${String(s.k3Gun)} saat` : gunMetni(s.k3Gun)} bekleyince`];
  parcalar.push(`K4 ${gunMetni(s.k4Gun)}`, `K5 ${gunMetni(s.k5Gun)}`);
  return parcalar.join(' · ');
}

export function KademeliUyari() {
  const d = useQuery({ queryKey: anahtarlar.kademeKaynaklari, queryFn: () => api.get<KademeAyarlariCevabi>('/bildirim-kademe/kaynaklar') });
  const [secili, seciliYaz] = useState<string | null>(null);
  if (d.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (d.isError) return <DurumKutusu durum="hata" yenile={() => { void d.refetch(); }} />;
  const satirlar = d.data.kaynaklar;
  const sutunlar: Sutun<KademeAyarSatiri>[] = [
    {
      anahtar: 'ad', baslik: 'Kaynak', kartTamSatir: true, csv: (s) => s.ad,
      hucre: (s) => (
        <span className="tc-bildirim-kaynak-ad">
          <b>{s.ad}</b>
          {s.asama === 2 && <Rozet ton="pasif" gorunum="cizgi">Sonraki aşama</Rozet>}
          {s.varsayilan && <span className="tc-bildirim-kaynak">varsayılan</span>}
        </span>
      ),
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={s.acik ? 'tamam' : 'pasif'}>{s.acik ? 'Açık' : 'Kapalı'}</Rozet>, csv: (s) => (s.acik ? 'Açık' : 'Kapalı') },
    { anahtar: 'gunler', baslik: 'Kademeler', hucre: gunOzeti, csv: gunOzeti, kartTamSatir: true },
    { anahtar: 'eposta', baslik: 'E-posta', hucre: (s) => `K${String(s.epostaKademe)} ve sonrası`, kirilmaz: true },
    { anahtar: 'takipte', baslik: 'Takipte', hizala: 'sag', hucre: (s) => s.takipte ?? null, csv: (s) => s.takipte ?? '' },
    { anahtar: 'gecikti', baslik: 'Gecikti', hizala: 'sag', hucre: (s) => s.gecikti ?? null, csv: (s) => s.gecikti ?? '' },
  ];
  const acik = satirlar.find((s) => s.kaynak === secili) ?? null;
  return (
    <div className="tc-bildirim-sayfa">
      <Kart baslik="Kademeli uyarı">
        <p className="tc-bildirim-not">
          Bekleyen iş yapılmadıkça uyarı kademe kademe sertleşir: K2 yaklaşıyor, K3 gecikti, K4 yöneticiye, K5 devret. Günler iş günüdür; saat, iş günlerinde geçen saattir.
          Takipte ve Gecikti boşsa kaynak henüz bağlanmamıştır.
        </p>
        <Tablo
          etiket="Kademeli uyarı kaynakları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.kaynak}
          satirSec={(s) => seciliYaz(s.kaynak)} grup={{ yol: (s) => [s.grup], baslik: (y) => y[0] ?? '' }}
          arac={{ csv: { ad: 'kademeli-uyari' } }}
        />
      </Kart>
      {acik && <AyarPenceresi key={acik.kaynak} satir={acik} roller={d.data.roller} kapat={() => seciliYaz(null)} />}
    </div>
  );
}

const BIRIM_SECENEKLERI = [{ deger: 'gun', baslik: 'İş günü' }, { deger: 'saat', baslik: 'Saat (iş günlerinde)' }];
const sayiYaz = (deger: string): number | null => (deger.trim() === '' ? null : Number(deger));

function AyarPenceresi({ satir, roller, kapat }: { satir: KademeAyarSatiri; roller: KademeAyarlariCevabi['roller']; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [g, gYaz] = useState<Omit<KademeAyarDegistirGovdesi, 'surum'>>({
    acik: satir.acik, k2Gun: satir.k2Gun, k3Gun: satir.k3Gun, k4Gun: satir.k4Gun, k5Gun: satir.k5Gun, k3Birim: satir.k3Birim, epostaKademe: satir.epostaKademe,
    serit: satir.serit, kapatilamaz: satir.kapatilamaz, yoneticiRolId: satir.yoneticiRolId,
  });
  const [hata, hataYaz] = useState<string | null>(null);
  const yaz = useMutation({
    mutationFn: () => api.post<KademeAyarlariCevabi>(`/bildirim-kademe/kaynaklar/${satir.kaynak}/ayarla`, { ...g, surum: satir.surum } satisfies KademeAyarDegistirGovdesi),
    onSuccess: (v) => { istemci.setQueryData(anahtarlar.kademeKaynaklari, v); bildir('tamam', 'Kademe ayarı kaydedildi.'); kapat(); },
    onError: (h) => {
      hataYaz(hataIletisi(h, 'Ayar kaydedilemedi.'));
      void istemci.invalidateQueries({ queryKey: anahtarlar.kademeKaynaklari });
    },
  });
  const degistir = (ek: Partial<typeof g>) => gYaz((o) => ({ ...o, ...ek }));
  const gunAlani = (etiket: string, deger: number | null, alan: 'k2Gun' | 'k3Gun' | 'k4Gun' | 'k5Gun', ipucu: string) => (
    <Girdi
      etiket={etiket} ipucu={ipucu} type="number" inputMode="numeric" min={0} max={KADEME_GUN_EN_COK} value={deger ?? ''}
      onChange={(o) => degistir({ [alan]: sayiYaz(o.target.value) })}
    />
  );
  const epostaSecenekleri = (satir.sayac === 'son-gun' ? [2, 3, 4, 5] : [3, 4, 5]).map((k) => ({ deger: String(k), baslik: `K${String(k)} ${kademeAdi(k)} ve sonrası` }));
  return (
    <Pencere
      acik kapat={kapat} baslik={satir.ad} tur="yan"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={yaz.isPending} onClick={() => { hataYaz(null); yaz.mutate(); }}>Kaydet</Dugme>
        </>
      )}
    >
      <div className="tc-bildirim-kademe-form">
        {satir.para && <p className="tc-bildirim-serit"><Simge ad="alert" boyut="k" />Bu kaynak para taşır: e-postaya yalnız kayıt numarası yazılır.</p>}
        <IsaretKutusu etiket="Bu kaynak takip edilsin" checked={g.acik} onChange={(o) => degistir({ acik: o.target.checked })} />
        {satir.sayac === 'son-gun'
          ? gunAlani('K2 Yaklaşıyor: son günden kaç iş günü önce', g.k2Gun, 'k2Gun', 'Boş bırakılırsa hatırlatma gitmez.')
          : (
            <>
              <Secim
                etiket="K3 süre birimi" value={g.k3Birim} secenekler={BIRIM_SECENEKLERI}
                onChange={(o) => degistir({ k3Birim: o.target.value === 'saat' ? 'saat' : 'gun' })}
              />
              {g.k3Birim === 'saat'
                ? gunAlani('K3 Gecikti: iş günlerinde kaç saat bekleyince', g.k3Gun, 'k3Gun', 'Hafta sonu ve resmi tatil sayılmaz; mesai dışı saatler sayılır.')
                : gunAlani('K3 Gecikti: kaç iş günü bekleyince', g.k3Gun, 'k3Gun', 'Bekleme bu kadar sürünce iş gecikmiş sayılır.')}
            </>
          )}
        {gunAlani('K4 Yöneticide: gecikmenin kaçıncı iş günü', g.k4Gun, 'k4Gun',
          satir.sayac === 'bekleme' && g.k3Birim === 'saat'
            ? "Gecikmenin 1. iş günü K3'ün geldiği gündür. Boş bırakılırsa yöneticiye gitmez." : 'Boş bırakılırsa yöneticiye gitmez.')}
        {gunAlani('K5 Devret: gecikmenin kaçıncı iş günü', g.k5Gun, 'k5Gun', 'K4 gününden sonra olmalıdır; boş bırakılırsa devredilmez.')}
        <Secim
          etiket="Ek yönetici rolü (K4 ve sonrası)" bosSecenek="Yalnız kaydın yöneticisi" value={g.yoneticiRolId === null ? '' : String(g.yoneticiRolId)}
          secenekler={roller.map((r) => ({ deger: String(r.id), baslik: r.ad }))} onChange={(o) => degistir({ yoneticiRolId: o.target.value === '' ? null : Number(o.target.value) })}
        />
        <Secim
          etiket="E-posta" value={String(g.epostaKademe)} secenekler={epostaSecenekleri}
          onChange={(o) => degistir({ epostaKademe: Number(o.target.value) })}
        />
        <IsaretKutusu etiket="Gecikince kişinin ekranında kırmızı şerit çıksın" checked={g.serit} onChange={(o) => degistir({ serit: o.target.checked })} />
        <IsaretKutusu etiket="Gecikti ve sonrasının e-postası kişi tercihinden kapatılamasın" checked={g.kapatilamaz} onChange={(o) => degistir({ kapatilamaz: o.target.checked })} />
        {hata && <p className="tc-bildirim-hata" role="alert">{hata}</p>}
        {satir.degisti && <p className="tc-bildirim-not">Son değişiklik: {satir.degistiren ?? 'bilinmiyor'}, {new Date(satir.degisti).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</p>}
      </div>
    </Pencere>
  );
}

function takipSutunlari(kaynakla: boolean): Sutun<KademeTakipSatiri>[] {
  const sutunlar: Sutun<KademeTakipSatiri>[] = [
    { anahtar: 'kademe', baslik: 'Kademe', hucre: (s) => <KademeRozeti k={s.kademe} />, csv: (s) => kademeAdi(s.kademe), kirilmaz: true },
    { anahtar: 'no', baslik: 'Kayıt', mono: true, kirilmaz: true, hucre: (s) => <Link to={s.yol}>{s.no}</Link>, csv: (s) => s.no },
    { anahtar: 'baslik', baslik: 'İş', hucre: (s) => s.baslik, kartTamSatir: true },
    { anahtar: 'sonGun', baslik: 'Son gün', kirilmaz: true, hucre: (s) => (s.sonGun === null ? null : tarihMetni(s.sonGun)), csv: (s) => s.sonGun ?? '' },
    { anahtar: 'gecikme', baslik: 'Gecikme', hizala: 'sag', hucre: (s) => (s.gecikmeGun === null ? null : `${String(s.gecikmeGun)} iş günü`), csv: (s) => s.gecikmeGun ?? '' },
  ];
  if (kaynakla) sutunlar.splice(1, 0, { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (s) => kaynakAdi(s.kaynak) });
  return sutunlar;
}

export function Gecikenlerim() {
  const d = useQuery({ queryKey: anahtarlar.gecikenlerim, queryFn: () => api.get<GecikenlerimCevabi>('/bildirim-kademe/gecikenlerim') });
  return (
    <div className="tc-bildirim-sayfa">
      <Kart baslik="Gecikenlerim">
        <p className="tc-bildirim-not">Size atanmış, son günü yaklaşan ya da geçen işler. İş bitince ya da kapanınca listeden kendiliğinden düşer.</p>
        {d.isError ? <DurumKutusu durum="hata" yenile={() => { void d.refetch(); }} /> : (
          <Tablo
            etiket="Geciken işlerim" sutunlar={takipSutunlari(true)} satirlar={d.data?.kayitlar ?? []} yukleniyor={d.isPending}
            satirAnahtari={(s) => `${s.kaynak}:${s.kayit}`} bosMesaj="Yaklaşan ya da geciken işiniz yok."
          />
        )}
      </Kart>
    </div>
  );
}

type AcikTakip = AcikTakiplerCevabi['kayitlar'][number];
const KIMDE: Sutun<AcikTakip> = {
  anahtar: 'kimde', baslik: 'Kimde', kartTamSatir: true, hucre: (s) => (s.kimde.length === 0 ? null : s.kimde.join(', ')), csv: (s) => s.kimde.join(', '),
};

export function AcikTakipler() {
  const d = useQuery({ queryKey: anahtarlar.acikTakipler, queryFn: () => api.get<AcikTakiplerCevabi>('/bildirim-kademe/acik-takipler') });
  return (
    <div className="tc-bildirim-sayfa">
      <Kart baslik="Açık takipler">
        {d.data?.kesik && <p className="tc-bildirim-serit"><Simge ad="alert" boyut="k" />En çok geciken 500 kayıt gösteriliyor; liste tam değil.</p>}
        {d.isError ? <DurumKutusu durum="hata" yenile={() => { void d.refetch(); }} /> : (
          <Tablo
            etiket="Açık takipler" sutunlar={[...takipSutunlari(true), KIMDE]} satirlar={d.data?.kayitlar ?? []} yukleniyor={d.isPending}
            satirAnahtari={(s) => `${s.kaynak}:${s.kayit}`} bosMesaj="Takipte kayıt yok." arac={{ csv: { ad: 'acik-takipler' } }}
          />
        )}
      </Kart>
    </div>
  );
}

const CIHAZ_ANAHTARI = ['bildirim', 'bu-cihaz'] as const;

// 3405-4 Arayüz ön bakışı 2: tek ortak şerit, sayfanın en üstünde. Ortak cihazda (terminal, istasyon) çıkmaz, orada yalnız zil çalar.
// İş bitince ya da kapanınca kendiliğinden kalkar; kapatma düğmesi bilerek yoktur.
export function KademeSeridi() {
  const cihaz = useQuery({ queryKey: CIHAZ_ANAHTARI, queryFn: () => api.get<z.output<typeof cihazDurumuCevabi>>('/oturum/cihaz'), staleTime: 600_000 });
  const kisisel = cihaz.data?.ortak === false;
  const d = useQuery({
    queryKey: anahtarlar.seridim, queryFn: () => api.get<GecikenlerimCevabi>('/bildirim-kademe/seridim'),
    enabled: kisisel, refetchInterval: 300_000,
  });
  const kayitlar = d.data?.kayitlar ?? [];
  if (!kisisel || kayitlar.length === 0) return null;
  const ilk = kayitlar[0];
  const enCok = Math.max(...kayitlar.map((k) => k.gecikmeGun ?? 0));
  const ozet = kayitlar.length === 1 && ilk
    ? `${ilk.no}: ${kaynakAdi(ilk.kaynak)} ${String(ilk.gecikmeGun ?? 0)} iş günü gecikti.`
    : `${String(kayitlar.length)} işiniz gecikti; en eskisi ${String(enCok)} iş günü.`;
  return (
    <div className="tc-bildirim-kserit" role="alert" data-testid="kademe-seridi">
      <Simge ad="alert" boyut="k" />
      <p><b>{ozet}</b><span className="tc-bildirim-kserit-ek"> İş bitmeden şerit kapanmaz.</span></p>
      <Link to={kayitlar.length === 1 && ilk ? ilk.yol : '/bildirim-merkezi/gecikenlerim'}>{kayitlar.length === 1 ? 'İşe git' : 'Gecikenlerim'}</Link>
    </div>
  );
}
