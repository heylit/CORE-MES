import { useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  AcikTeslim, AktarimSatiri, EmirTakimListesi, SeceneklerCevabi, TakimSatiri, TakimhaneOzeti,
} from '#paylasilan/sozlesme/takimhane.ts';
import { DurumKutusu, Girdi, Kart, SayfaBasligi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EmirAparatlari } from './Aparat.tsx';
import { AktarimOnizleme } from './Aktarim.tsx';
import { AcikTeslimler, CikisFormu, IadePenceresi } from './CikisIade.tsx';
import { EmirTakimlari } from './EmirTakimlari.tsx';
import { stokDurumu, type IadeDurumu } from './gosterim.ts';
import { BekleyenIadeCipi, KategoriCipleri, KonumOzeti, KritikListe, TakimTablosu } from './Parcalar.tsx';
import { TakimAyrinti } from './TakimAyrinti.tsx';
import './takimhane.css';


function useTakimlar() {
  return useQuery({ queryKey: anahtarlar.takimlar, queryFn: () => api.get<{ takimlar: TakimSatiri[] }>('/takimhane/takimlar') });
}

// Ana ekran (B+C): önce neresi sıkıştı (kritik liste, nerede), altında süzülebilir takım listesi. Yeni takım kartı katalogdan açılır.
export function TakimhaneGenel() {
  const git = useNavigate();
  const ozet = useQuery({ queryKey: anahtarlar.ozet, queryFn: () => api.get<TakimhaneOzeti>('/takimhane/ozet') });
  const takimlar = useTakimlar();
  const [kategori, kategoriYaz] = useState<string | null>(null);
  const [ara, araYaz] = useState('');
  const [durum, durumYaz] = useState('hepsi');
  const [acik, acikYaz] = useState<TakimSatiri | null>(null);
  const liste = useMemo(() => (takimlar.data?.takimlar ?? []).filter((t) => {
    const d = stokDurumu(t);
    const durumTamam = durum === 'hepsi' || (durum === 'kritik' ? d === 'kritik' || d === 'sifir' : d === 'esiksiz');
    const aranan = ara.trim().toLocaleLowerCase('tr');
    return (kategori === null || t.kategori === kategori) && durumTamam && (aranan === '' || `${t.kod} ${t.ad}`.toLocaleLowerCase('tr').includes(aranan));
  }), [takimlar.data, kategori, durum, ara]);

  if (ozet.isPending || takimlar.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ozet.isError || takimlar.isError || !ozet.data || !takimlar.data) {
    return <DurumKutusu durum="hata" hata={ozet.error ?? takimlar.error} mesaj="Takımhane yüklenemedi." yenile={() => { void ozet.refetch(); void takimlar.refetch(); }} />;
  }
  const o = ozet.data;
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi
        baslik="Takımhane" simge="tool"
        ek={<BekleyenIadeCipi sayi={o.bekleyenIade} ac={() => { void git('/takimhane/cikis-iade'); }} />}
        birincil={{ etiket: 'Çıkış yap', simge: 'truck', yap: () => { void git('/takimhane/cikis-iade'); } }}
      />
      <div className="tc-tkm-ust-yatay">
        <Kart baslik="Şu an nerede" simge="pin"><KonumOzeti konumlar={o.konumlar} /></Kart>
        <Kart baslik="Önce bunlar" simge="alert" baslikEki={<span className="tc-tkm-soluk">{o.kritik} kritik · {o.sifir} stok yok</span>}>
          <KritikListe takimlar={takimlar.data.takimlar} ac={acikYaz} toplam={o.kritik + o.sifir} tumu={() => { durumYaz('kritik'); }} />
        </Kart>
      </div>
      <Kart baslik="Takımlar" simge="list" baslikEki={<span className="tc-tkm-soluk">{o.esiksiz} kalemde eşik yok</span>}>
        <div className="tc-tkm-yigin">
          <KategoriCipleri kategoriler={o.kategoriler} kalem={o.kalem} secili={kategori} sec={kategoriYaz} />
          <TakimTablosu
            takimlar={liste} satirSec={acikYaz}
            arac={{
              arama: { deger: ara, degistir: araYaz, etiket: 'Takım ara', yerTutucu: 'Kod ya da ad' },
              suzgec: {
                etiket: 'Stok durumu', secili: durum, sec: durumYaz,
                secenekler: [{ deger: 'hepsi', baslik: 'Tümü' }, { deger: 'kritik', baslik: 'Kritik ve biten' }, { deger: 'esiksiz', baslik: 'Eşik yok' }],
              },
            }}
          />
        </div>
      </Kart>
      <TakimAyrinti takim={acik} kapat={() => { acikYaz(null); }} />
    </div>
  );
}

// Çıkış ve iade tek ekranda: depo çıkarır, alan kabul eder; iade durumu (sağlam, aşınmış, kırık) hedef konumu belirler.
export function CikisIade() {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const takimlar = useTakimlar();
  const teslimler = useQuery({ queryKey: anahtarlar.acikTeslimler, queryFn: () => api.get<{ teslimler: AcikTeslim[] }>('/takimhane/teslimdekiler') });
  const secenekler = useQuery({ queryKey: [...anahtarlar.ozet, 'secenekler'], queryFn: () => api.get<SeceneklerCevabi>('/takimhane/secenekler') });
  const [iade, iadeYaz] = useState<AcikTeslim | null>(null);
  const [son, sonYaz] = useState<number[]>([]);
  const yenile = () => { void istemci.invalidateQueries({ queryKey: ['takimhane'] }); };

  const cikis = useMutation({
    mutationFn: (g: { kartKimlik: number; adet: number; alici: string; emir: string }) => {
      const istekKimligi = yeniIstekKimligi();
      const [tur, id] = g.alici.split(':');
      return api.post('/takimhane/cikis', {
        kartKimlik: g.kartKimlik, adet: g.adet, kisiId: tur === 'k' ? Number(id) : null, istasyonId: tur === 'i' ? Number(id) : null,
        uretimEmriId: g.emir === '' ? null : Number(g.emir), istekKimligi,
      }, { istekKimligi });
    },
    onSuccess: (_c, g) => { sonYaz((s) => [g.kartKimlik, ...s.filter((x) => x !== g.kartKimlik)].slice(0, 5)); bildirim.bildir('tamam', 'Çıkış kaydedildi; alan kabul edince teslim tamamlanır.'); yenile(); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Çıkış kaydedilemedi.')); },
  });
  const iadeAl = useMutation({
    mutationFn: (g: { teslim: AcikTeslim; adet: number; durum: IadeDurumu; neden: string }) => {
      const istekKimligi = yeniIstekKimligi();
      return api.post('/takimhane/iade', {
        kartKimlik: g.teslim.kartKimlik, konumKimligi: g.teslim.konumKimligi, adet: g.adet, durum: g.durum, neden: g.neden === '' ? null : g.neden, istekKimligi,
      }, { istekKimligi });
    },
    onSuccess: () => { iadeYaz(null); bildirim.bildir('tamam', 'İade alındı.'); yenile(); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'İade alınamadı.')); },
  });

  if (takimlar.isPending || teslimler.isPending || secenekler.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takimlar.isError || teslimler.isError || secenekler.isError || !takimlar.data || !teslimler.data || !secenekler.data) {
    return <DurumKutusu durum="hata" hata={takimlar.error ?? teslimler.error ?? secenekler.error} mesaj="Çıkış ve iade yüklenemedi." yenile={() => { void takimlar.refetch(); void teslimler.refetch(); void secenekler.refetch(); }} />;
  }
  const sonTakimlar = son.flatMap((id) => takimlar.data.takimlar.filter((t) => t.kartKimlik === id));
  const alicilar = [
    ...secenekler.data.kisiler.map((k) => ({ deger: `k:${String(k.id)}`, baslik: k.ad })),
    ...secenekler.data.istasyonlar.map((i) => ({ deger: `i:${String(i.id)}`, baslik: i.ad })),
  ];
  const emirler = secenekler.data.emirler.map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.parca}` }));
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi baslik="Çıkış ve iade" simge="rotate" />
      <div className="tc-tkm-iki">
        <Kart baslik="Çıkış" simge="upload">
          <CikisFormu takimlar={takimlar.data.takimlar} son={sonTakimlar} alicilar={alicilar} emirler={emirler} gonder={(g) => { cikis.mutate(g); }} />
        </Kart>
        <Kart baslik="Teslimdekiler" simge="clock" baslikEki={<span className="tc-tkm-soluk">{teslimler.data.teslimler.length} kayıt</span>}>
          <AcikTeslimler teslimler={teslimler.data.teslimler} iade={iadeYaz} />
        </Kart>
      </div>
      <IadePenceresi key={iade === null ? 'kapali' : `${String(iade.konumKimligi)}-${String(iade.kartKimlik)}`} teslim={iade} kapat={() => { iadeYaz(null); }} onayla={(g) => { if (iade) iadeAl.mutate({ teslim: iade, ...g }); }} />
    </div>
  );
}

// Emrin takım listesi: eksik takım emir başlamadan görünür; yalnız uyarır, başlatmayı engellemez.
export function EmirTakimlariSayfasi() {
  const secenekler = useQuery({ queryKey: [...anahtarlar.ozet, 'secenekler-emir'], queryFn: () => api.get<SeceneklerCevabi>('/takimhane/secenekler') });
  const [emirId, emirYaz] = useState('');
  const liste = useQuery({
    queryKey: anahtarlar.emirListesi(emirId), enabled: emirId !== '',
    queryFn: () => api.get<EmirTakimListesi>(`/takimhane/emirler/${emirId}/takimlar`),
  });
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi baslik="Emir takımları" simge="tool" />
      <Kart baslik="Emir" simge="list">
        {secenekler.isPending ? <DurumKutusu durum="yukleniyor" /> : (
          <Secim
            etiket="Üretim emri" value={emirId} onChange={(e) => { emirYaz(e.target.value); }} bosSecenek="Emir seçin"
            secenekler={(secenekler.data?.emirler ?? []).map((e) => ({ deger: String(e.id), baslik: `${e.emirNo} · ${e.parca}` }))}
          />
        )}
      </Kart>
      {liste.isError && <DurumKutusu durum="hata" hata={liste.error} mesaj="Takım listesi yüklenemedi." yenile={() => { void liste.refetch(); }} />}
      {liste.data && (liste.data.satirlar.length === 0
        ? <Kart><p className="tc-tkm-bos">Bu emir için takım listesi girilmemiş.</p></Kart>
        : <Kart><EmirTakimlari liste={liste.data} /></Kart>)}
      {emirId !== '' && <EmirAparatlari emirId={emirId} />}
    </div>
  );
}

// Başlangıç stoğu ön izlemesi: CSV (kod;ad;kategori;adet;raf) okunur, temizlik bulguları sunucudan gelir; hiçbir şey kaydedilmez.
function csvSatirlari(metin: string) {
  return metin.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '').map((s) => {
    const [kod = '', ad = '', kategori = '', adet = '0', raf = ''] = s.split(';');
    return { kod, ad, kategori: kategori === '' ? null : kategori, adet: Math.max(0, Math.trunc(Number(adet) || 0)), rafKodu: raf === '' ? null : raf };
  });
}

export function BaslangicStogu() {
  const [satirlar, satirlarYaz] = useState<AktarimSatiri[] | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const onizle = useMutation({
    mutationFn: (metin: string) => api.post<{ satirlar: AktarimSatiri[]; uygun: boolean }>('/takimhane/baslangic/onizleme', { satirlar: csvSatirlari(metin) }),
    onSuccess: (c) => { hataYaz(null); satirlarYaz(c.satirlar); },
    onError: (h) => { hataYaz(hataIletisi(h, 'Dosya okunamadı.')); },
  });
  const sec = async (e: ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    if (dosya) onizle.mutate(await dosya.text());
  };
  return (
    <div className="tc-tkm-yigin">
      <SayfaBasligi baslik="Başlangıç stoğu" simge="upload" />
      <Kart baslik="Aktarım ön izlemesi" simge="file">
        <div className="tc-tkm-yigin">
          <Girdi etiket="CSV dosyası (kod;ad;kategori;adet;raf)" type="file" accept=".csv,text/csv" onChange={(e) => { void sec(e); }} />
          {hata !== null && <p role="alert" className="tc-tkm-soluk">{hata}</p>}
          {satirlar === null
            ? <p className="tc-tkm-bos">Dosya seçilince temizlik kararları satır satır görünür.</p>
            : <AktarimOnizleme satirlar={satirlar} vazgec={() => { satirlarYaz(null); }} />}
          {onizle.isPending && <DurumKutusu durum="yukleniyor" />}
        </div>
      </Kart>
    </div>
  );
}

