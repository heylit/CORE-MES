import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GunlukMesaiCevabi, TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { DurumKutusu, Dugme, Rozet, SayiKarti, Simge, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { BosVardiya } from './BosVardiya.tsx';
import { TarihGirdisi } from './ZamanAlani.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { anMetni, haftaGunuAdi, saat, tarihEkle, tarihMetni } from './gosterim.ts';
import './vardiya.css';

// Günlük mesai (sayfa.mesai): seçilen gün istasyona atanmış her kişinin planlı mesaisi. Gerçek giriş-çıkış kaydı tutulmadığı için
// saatler plandır ve ekran bunu açıkça söyler; uydurulmuş "geldi/gelmedi" gösterilmez.
type Satir = GunlukMesaiCevabi['satirlar'][number];

function durum(s: Satir): { ton: RozetTonu; metin: string } {
  if (s.plan === null) return { ton: 'pasif', metin: 'İş merkezi yok' };
  if (s.plan.kapali) return { ton: 'uyari', metin: s.plan.kapali.ad ?? (s.plan.kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı') };
  if (s.plan.dakika > 0) return { ton: 'tamam', metin: 'Mesaide' };
  return { ton: 'pasif', metin: 'Vardiya yok' };
}

// Personel yokken sayı uydurulmaz; kullanıcı nereden başlayacağını görür. Bağlantı yalnız sayfayı görebilene verilir.
function PersonelYok() {
  const islemler = useOturum().data?.islemler ?? [];
  return (
    <div className="tc-vr-bos-ic" role="status">
      <span className="tc-vr-bos-simge"><Simge ad="user" boyut="b" /></span>
      <p><strong>İstasyona atanmış personel yok.</strong></p>
      <p className="tc-vr-ipucu">
        Mesai, personel bir istasyona atanıp vardiyası seçilince hesaplanır.
        {islemler.includes('sayfa.istasyonlar') && <> Personeli istasyona <Link className="tc-vr-baglanti" to="/istasyonlar">İstasyonlar</Link> sayfasından ata.</>}
        {islemler.includes('sayfa.vardiya') && <> Vardiyasını <Link className="tc-vr-baglanti" to="/vardiya/personel">Vardiya başına personel</Link> sayfasından seç.</>}
      </p>
    </div>
  );
}

export function GunlukMesaiEkrani() {
  const takvim = useQuery({ queryKey: anahtarlar.takvim, queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi') });
  const [secilen, tarihYaz] = useState('');
  const bugun = takvim.data?.bugun ?? '';
  const tarih = secilen || bugun;
  const mesai = useQuery({
    queryKey: anahtarlar.gunlukMesai(tarih),
    queryFn: () => api.get<GunlukMesaiCevabi>(`/gunluk-mesai?tarih=${tarih}`),
    enabled: tarih !== '',
  });
  if (takvim.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takvim.isError) return <DurumKutusu durum="hata" yenile={() => { void takvim.refetch(); }} />;

  const t = takvim.data;
  if (t.vardiyalar.length === 0) return <div className="tc-vr-sayfa"><BosVardiya /></div>;
  const merkezAdi = (id: number | null) => { const m = t.isMerkezleri.find((x) => x.id === id); return m ? `${m.kod} ${m.ad}` : '–'; };
  const vardiyaAdi = (id: number | null) => (id === null ? 'Seçilmedi' : t.vardiyalar.find((v) => v.id === id)?.ad ?? '–');
  const satirlar = mesai.data?.satirlar ?? [];
  const calisan = satirlar.filter((s) => (s.plan?.dakika ?? 0) > 0);
  const toplamDakika = calisan.reduce((n, s) => n + (s.plan?.dakika ?? 0), 0);
  // Okuma gelmeden undefined (yükleniyor), personel yokken null (veri yok); sıfır yalnız gerçek sayımdır.
  const yok = mesai.data !== undefined && satirlar.length === 0;
  const sayi = (n: number) => (mesai.data === undefined ? undefined : yok ? null : n);
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'ad', baslik: 'Personel', hucre: (s) => s.ad },
    { anahtar: 'merkez', baslik: 'İş merkezi', hucre: (s) => merkezAdi(s.isMerkeziId) },
    { anahtar: 'vardiya', baslik: 'Vardiya', hucre: (s) => vardiyaAdi(s.vardiyaId) },
    { anahtar: 'giris', baslik: 'Plan giriş', mono: true, kirilmaz: true, hucre: (s) => { const a = s.plan?.araliklar[0]; return a ? anMetni(a.baslangic, tarih) : '–'; } },
    { anahtar: 'cikis', baslik: 'Plan çıkış', mono: true, kirilmaz: true, hucre: (s) => { const a = s.plan?.araliklar.at(-1); return a ? anMetni(a.bitis, tarih) : '–'; } },
    { anahtar: 'net', baslik: 'Net mesai', hizala: 'sag', mono: true, hucre: (s) => (s.plan && s.plan.dakika > 0 ? `${saat(s.plan.dakika)} sa` : '–') },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => { const d = durum(s); return <Rozet ton={d.ton}>{d.metin}</Rozet>; } },
  ];
  const kapali = t.gunler.find((g) => g.tarih === tarih);

  return (
    <div className="tc-vr-sayfa">
      <section className="tc-vr-panel" aria-label="Günlük mesai">
        <div className="tc-vr-baslik-satiri">
          <h3>Günlük mesai · {tarih ? `${tarihMetni(tarih)} ${haftaGunuAdi(tarih)}` : ''}</h3>
          <div className="tc-vr-satir">
            <Dugme simge="chev-left" aria-label="Önceki gün" title="Önceki gün" className="tc-vr-ikon" onClick={() => tarihYaz(tarihEkle(tarih, -1))} />
            <TarihGirdisi aria-label="Gün" deger={tarih} degistir={tarihYaz} />
            <Dugme simge="chev-right" aria-label="Sonraki gün" title="Sonraki gün" className="tc-vr-ikon" onClick={() => tarihYaz(tarihEkle(tarih, 1))} />
            <Dugme disabled={tarih === bugun} onClick={() => tarihYaz('')}>Bugün</Dugme>
          </div>
        </div>
        {kapali && <p className="tc-vr-uyari" role="status">{kapali.ad ?? (kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı gün')}: bu gün vardiya çalışmaz.</p>}
        {mesai.isError ? <DurumKutusu durum="hata" yenile={() => { void mesai.refetch(); }} /> : (
          <>
            <div className="tc-vr-ozet">
              <SayiKarti baslik="Mesaide" simge="user" sayi={sayi(calisan.length)} altMetin={mesai.data && !yok ? `${String(satirlar.length)} kişiden` : undefined} />
              <SayiKarti baslik="Planlı mesai" simge="clock" sayi={sayi(Math.round(toplamDakika / 6) / 10)} altMetin="saat, net" />
              <SayiKarti baslik="Vardiyası seçilmemiş" simge="alert" ton="uyari" yol="/vardiya/personel"
                sayi={sayi(satirlar.filter((s) => s.vardiyaId === null).length)} altMetin="kişiyi ata" />
              <SayiKarti baslik="İş merkezi yok" simge="gantt" ton="uyari" sayi={sayi(satirlar.filter((s) => s.plan === null).length)} altMetin="istasyonu bağlı değil" />
            </div>
            {yok ? <PersonelYok /> : (
              <Tablo etiket="Günlük mesai" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.kisiId} mesgul={mesai.isPending} bosMesaj="Personel yok" />
            )}
          </>
        )}
        <p className="tc-vr-ipucu">Saatler plandır: kişinin vardiyası, vardiyası seçilmemişse iş merkezinin o gün açık vardiyaları; molalar ve planlı duruşlar düşülür. Gerçek giriş-çıkış kaydı henüz tutulmuyor.</p>
      </section>
    </div>
  );
}
