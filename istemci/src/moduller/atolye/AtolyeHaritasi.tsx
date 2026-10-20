import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AramaSonucu, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import {
  Dugme, DurumKutusu, Girdi, Kart, KuyrukKarti, KuyrukListesi, Rozet, Secim, Sekmeler, Simge, useBildirim,
} from '../../ortak/arayuz/index.ts';
import type { MakineDurumu } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { HaritaAraclari } from './HaritaAraclari.tsx';
import { useOtomatikTur, useTamEkran } from './tam-ekran.ts';
import { ISTASYON_TIPI_ADI, istasyonNesnesi, nesneCanlilari, olayNesnesi, turSirasi, depoMerkezi, gozKalemiYukleri, ilerleme, istasyonGorunumu, istasyonParcalari, parcaYerleri, ozetle, sayi, sayiMetni, siradakiEmirler, yerlesmemisCalisanlar } from './kurallar.ts';
import { DepoGorunumu } from './DepoGorunumu.tsx';
import { DijitalIkiz } from './DijitalIkiz.tsx';
import type { DepoSecimi } from './DepoGorunumu.tsx';
import { OgeKarti } from './OgeKarti.tsx';
import { ParcaListesi } from './ParcaListesi.tsx';
import { RafOdagi } from './RafOdagi.tsx';
import type { RafOdakSecimi } from './RafOdagi.tsx';
import { SalonPenceresi } from './SalonPenceresi.tsx';
import { SonHareketler } from './SonHareketler.tsx';
import { CANLI_ARALIK_MS, rotaGetir, useArama, useCanliDurum, useFabrika, useGozKalemleri, useKalemGorunumleri, useMakineArizalari, useMalzemeModelleri, useTumEmirler, useYerlesmemisIstasyonlar } from './veri.ts';
import { SIFIR_KONUM, bolumeCevir, fabrikayaCevir, konumOku, ogeninBolumu } from './fabrika.ts';
import type { BolumYerlesimi } from './sahne/motor.ts';
import { YerlesimDuzenleyici } from './YerlesimDuzenleyici.tsx';
import './atolye.css';

// Üç boyutlu sahne ayrı pakettir: three kütüphanesi yalnız bu sayfa açılınca yüklenir.
const Sahne3B = lazy(() => import('./Sahne3B.tsx').then((m) => ({ default: m.Sahne3B })));

type Gorunum = 'genel' | 'kus';
type SayfaSekmesi = 'harita' | 'ikiz' | 'depo' | 'parcalar';

const SEKMELER = [
  { anahtar: 'harita' as const, baslik: 'Harita', simge: 'cube' as const },
  { anahtar: 'ikiz' as const, baslik: 'Dijital ikiz', simge: 'cpu' as const },
  { anahtar: 'depo' as const, baslik: 'Depo', simge: 'box' as const },
  { anahtar: 'parcalar' as const, baslik: 'Parçalar', simge: 'layers' as const },
];

function Saat() {
  const [simdi, simdiYaz] = useState(() => new Date());
  useEffect(() => {
    const z = setInterval(() => simdiYaz(new Date()), 1000);
    return () => clearInterval(z);
  }, []);
  return <span className="tc-atolye-saat mono">{simdi.toLocaleTimeString('tr-TR')}</span>;
}

function Gosterge({ ad, deger, durum, birim }: { ad: string; deger: string; durum?: MakineDurumu; birim?: string }) {
  return (
    <div className="tc-atolye-gosterge" data-durum={durum}>
      <dt>{durum && <i aria-hidden="true" />}{ad}</dt>
      <dd>{deger}{birim && <small> {birim}</small>}</dd>
    </div>
  );
}

function aramaAnahtari(s: AramaSonucu, y: YerlesimCevabi | undefined): { anahtar: string | null; adres: string | null } {
  if (s.tur === 'istasyon') return { anahtar: y ? istasyonNesnesi([y], s.kimlik) : `istasyon:${s.kimlik}`, adres: null };
  if (s.tur === 'raf') return { anahtar: `raf:${s.kimlik}`, adres: null };
  if (s.tur === 'alan') return { anahtar: `alan:${s.kimlik}`, adres: null };
  // Göz sonucu rafını seçer; göz adresi kartta vurgulanır.
  const rafKodu = s.etiket.split('-')[0];
  const raf = y?.raflar.find((r) => r.kod === rafKodu);
  return { anahtar: raf ? `raf:${raf.id}` : null, adres: s.etiket };
}

export function AtolyeHaritasi() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('atolye.yaz') === true;
  const { bildir } = useBildirim();
  const fabrika = useFabrika();
  const tumBolumler = useMemo(() => fabrika.data?.bolumler ?? [], [fabrika.data]);
  // Kapsam: 'fabrika' bütün bölümler birlikte, sayı tek bölüm. Seçilmediyse birden çok bölümde fabrika.
  const [kapsamSecimi, kapsamSecimiYaz] = useState<number | 'fabrika' | null>(null);
  const gecerliSecim = kapsamSecimi === 'fabrika' || tumBolumler.some((b) => b.salon.id === kapsamSecimi) ? kapsamSecimi : null;
  const kapsam = gecerliSecim ?? (tumBolumler.length > 1 ? 'fabrika' : tumBolumler[0]?.salon.id ?? null);
  const fabrikaGorunumu = kapsam === 'fabrika';
  const salonId = typeof kapsam === 'number' ? kapsam : null;
  const gorunen = useMemo(() => (kapsam === 'fabrika' ? tumBolumler : tumBolumler.filter((b) => b.salon.id === kapsam)), [tumBolumler, kapsam]);
  // Tek bölüm görünümünde o bölüm; fabrikada yok (öğenin bölümü seçimden bulunur).
  const y: YerlesimCevabi | undefined = salonId === null ? undefined : gorunen[0];
  const bolumYerlesimleri = useMemo<BolumYerlesimi[]>(
    () => gorunen.map((b) => ({ yerlesim: b, konum: kapsam === 'fabrika' ? konumOku(b.salon) : SIFIR_KONUM })),
    [gorunen, kapsam],
  );
  const canli = useCanliDurum();
  const [secili, seciliYaz] = useState<string | null>(null);
  const [vurguAdres, vurguAdresYaz] = useState<string | null>(null);
  const [gorunum, gorunumYaz] = useState<{ tur: Gorunum; sayac: number }>({ tur: 'genel', sayac: 0 });
  const [odak, odakYaz] = useState<{ x: number; z: number; salonId: number; sayac: number } | null>(null);
  const [izgara, izgaraYaz] = useState(false);
  const [etiketler, etiketlerYaz] = useState(true);
  const [yuruyus, yuruyusYaz] = useState(false);
  const [rota, rotaYaz] = useState<{ salonId: number; noktalar: { x: number; z: number }[] } | null>(null);
  const [duzenleyici, duzenleyiciYaz] = useState(false);
  const [salonPenceresi, salonPenceresiYaz] = useState(false);
  const [arama, aramaYaz] = useState('');
  const [aramaAcik, aramaAcikYaz] = useState(false);
  // Her tuşta istek gitmez: yazma durunca aranır.
  const [gecikmeliArama, gecikmeliAramaYaz] = useState('');
  useEffect(() => {
    const z = setTimeout(() => gecikmeliAramaYaz(arama), 250);
    return () => clearTimeout(z);
  }, [arama]);
  const aramaSorgusu = useArama(gecikmeliArama, null);
  // Görünmeyen bölümdeki sonuç seçilince seçim, o bölüm görünür olunca uygulanır.
  const [bekleyenSecim, bekleyenSecimYaz] = useState<AramaSonucu | null>(null);

  const yerler = useMemo(() => gorunen.flatMap((b) => b.istasyonYerleri), [gorunen]);
  const raflar = useMemo(() => gorunen.flatMap((b) => b.raflar), [gorunen]);
  const bolumKodlari = useMemo(
    () => (kapsam === 'fabrika' ? new Map(gorunen.flatMap((b) => b.raflar.map((r) => [r.id, b.salon.kod] as const))) : undefined),
    [gorunen, kapsam],
  );
  const durumlar = useMemo(() => new Map<number, MakineDurumu>(yerler.map((i) => [i.istasyonId, istasyonGorunumu(i, canli.emirler.get(i.istasyonId)).durum])), [yerler, canli.emirler]);
  const { arizalar, okundu: arizaOkundu } = useMakineArizalari();
  const canliHaritasi = useMemo(() => nesneCanlilari(gorunen, canli.liste, arizalar), [gorunen, canli.liste, arizalar]);
  const haritadaYokCalisan = useMemo(() => (fabrika.data ? yerlesmemisCalisanlar(tumBolumler, canli.liste) : []), [fabrika.data, tumBolumler, canli.liste]);
  const arizaSayisi = useMemo(() => [...canliHaritasi.values()].filter((c) => c.ariza !== null).length, [canliHaritasi]);
  // Adres: /atolye?suzgec=yerlesmemis[&istasyon=<id>] yan listeyi "Yerleşmemiş makineler"de açar, verilen istasyonu vurgular
  // (İstasyonlar sayfasının "Haritada göster" bağlantısı, kart #1296).
  const [adres] = useSearchParams();
  const vurguIstasyon = Number(adres.get('istasyon')) || null;
  const [yanListe, yanListeYaz] = useState<'istasyon' | 'hareket' | 'yerlesmemis'>(() => (adres.get('suzgec') === 'yerlesmemis' ? 'yerlesmemis' : 'istasyon'));
  const yerlesmemis = useYerlesmemisIstasyonlar(yanListe === 'yerlesmemis', fabrika.dataUpdatedAt);
  const ozet = useMemo(() => ozetle(yerler, canli.emirler), [yerler, canli.emirler]);
  const kalemGorunumleri = useKalemGorunumleri();
  const kalemler = kalemGorunumleri.data?.kalemler;
  const [parcaGoster, parcaGosterYaz] = useState(false);
  const tamEkran = useTamEkran();
  const [tur, turYaz] = useState(false);
  const [turDurdu, turDurduYaz] = useState(false);
  // Tam ekranda istasyon listesi çekmecedir; geniş ekranda açık başlar.
  const [listeAcik, listeAcikYaz] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 1280px)').matches);
  const [sekme, sekmeYaz] = useState<SayfaSekmesi>('harita');
  const [depoSecimi, depoSecimiYaz] = useState<DepoSecimi | null>(null);
  // Bölmeye karşıdan bakış: sahne yalnız o raf bölmesini gösterir (öbür her şey gizlenir).
  const [rafOdak, rafOdakYaz] = useState<RafOdakSecimi | null>(null);
  const gozKalemleri = useGozKalemleri(salonId);
  const gozKalemListesi = gozKalemleri.data?.kalemler;
  const tumEmirler = useTumEmirler();
  const siradakiler = useMemo(() => siradakiEmirler(tumEmirler.data?.emirler ?? []), [tumEmirler.data]);
  const malzemeModelleri = useMalzemeModelleri();
  const parcalar = useMemo(
    () => istasyonParcalari(parcaYerleri(gorunen), canli.emirler, kalemler ?? [], malzemeModelleri, siradakiler),
    [gorunen, canli.emirler, kalemler, malzemeModelleri, siradakiler],
  );
  const rafYukleri = useMemo(() => gozKalemiYukleri(raflar, gozKalemListesi ?? [], kalemler ?? []), [raflar, gozKalemListesi, kalemler]);
  const canliTaze = !canli.hata && canli.guncellendi > 0 && Date.now() - canli.guncellendi < CANLI_ARALIK_MS * 3;
  // Seçili öğenin bölümü (kart, rota, yakınlaşma onun metresinde).
  const seciliBolum = secili ? ogeninBolumu(gorunen, secili) : undefined;

  // Kapsam değişince seçim, rota ve yürüyüş sıfırlanır.
  useEffect(() => { seciliYaz(null); vurguAdresYaz(null); rotaYaz(null); yuruyusYaz(false); depoSecimiYaz(null); rafOdakYaz(null); }, [kapsam]);
  useEffect(() => {
    const b = bekleyenSecim ? gorunen.find((o) => o.salon.id === bekleyenSecim.salon.id) : undefined;
    if (!bekleyenSecim || !b) return;
    const { anahtar, adres } = aramaAnahtari(bekleyenSecim, b);
    seciliYaz(anahtar);
    vurguAdresYaz(adres);
    odakYaz((o) => ({ x: sayi(bekleyenSecim.x), z: sayi(bekleyenSecim.z), salonId: b.salon.id, sayac: (o?.sayac ?? 0) + 1 }));
    bekleyenSecimYaz(null);
  }, [bekleyenSecim, gorunen]);

  const odakla = useCallback((x: number, z: number, bolum: number) => odakYaz((o) => ({ x, z, salonId: bolum, sayac: (o?.sayac ?? 0) + 1 })), []);
  const sec = useCallback((anahtar: string | null) => {
    // Fabrika görünümünde bölüm adına basmak o bölümü açar; giriş ve geçiş işareti seçilmez.
    if (anahtar?.startsWith('bolum:')) { kapsamSecimiYaz(Number(anahtar.slice(6))); return; }
    const a = anahtar?.startsWith('giris') || anahtar?.startsWith('gecis') ? null : anahtar;
    seciliYaz(a);
    if (a === null || !a.startsWith('raf:')) vurguAdresYaz(null);
  }, []);

  const yolGoster = async (bolum: number, hedef: { x: number; z: number }) => {
    try {
      const c = await rotaGetir(bolum, { bas: null, hedef });
      rotaYaz(c.rota ? { salonId: bolum, noktalar: c.rota.noktalar } : null);
      if (c.rota === null) bildir('bilgi', 'Bu noktaya giden yol bulunamadı.');
      else bildir('bilgi', `Girişten yol: ${sayiMetni(c.rota.uzunluk)} m`);
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Yol hesaplanamadı.'));
    }
  };
  // Yürüyüşte bölüm içindeki rota; fabrikada bölümler arası kapıları sahne seçer.
  const rotaIste = useCallback(async (bolum: number, bas: { x: number; z: number }, hedef: { x: number; z: number }) => {
    try {
      return (await rotaGetir(bolum, { bas, hedef })).rota?.noktalar ?? null;
    } catch {
      return null;
    }
  }, []);

  const aramaSec = (s: AramaSonucu) => {
    aramaAcikYaz(false);
    yuruyusYaz(false);
    const b = gorunen.find((o) => o.salon.id === s.salon.id);
    if (!b) {
      kapsamSecimiYaz(s.salon.id);
      bekleyenSecimYaz(s);
      return;
    }
    const { anahtar, adres } = aramaAnahtari(s, b);
    seciliYaz(anahtar);
    vurguAdresYaz(adres);
    odakla(sayi(s.x), sayi(s.z), b.salon.id);
  };

  // Depoya git: yürüyüşte depoya (rafların ortasına en yakın rafa) yürür; değilse kamera rafların ortasına gider.
  const [hedef, hedefYaz] = useState<{ anahtar: string; sayac: number } | null>(null);
  // Otomatik tur yalnız tam ekranda: sorunlu istasyon önce, her adımda seçilir ve kamera ona gider.
  useEffect(() => { if (!tamEkran.acik) turYaz(false); }, [tamEkran.acik]);
  useEffect(() => { if (!tur) turDurduYaz(false); }, [tur]);
  const turDenetimi = useOtomatikTur(tur && tamEkran.acik, turDurdu, () => turSirasi(yerler, durumlar).map((a) => istasyonNesnesi(gorunen, Number(a.split(':')[1]))), (anahtar) => {
    seciliYaz(anahtar);
    hedefYaz((h) => ({ anahtar, sayac: (h?.sayac ?? 0) + 1 }));
  });

  const depodaAc = (rafId: number, bolme: number, kat: number | null, goz: number | null) => {
    depoSecimiYaz({ rafId, bolme, kat, goz });
    rafOdakYaz(null);
    tamEkran.kapat();
    sekmeYaz('depo');
  };
  const ucBoyut = (rafId: number, bolme: number) => {
    yuruyusYaz(false);
    turYaz(false);
    seciliYaz(null);
    sekmeYaz('harita');
    rafOdakYaz({ rafId, bolme, kat: null, goz: null });
  };
  const istasyonaGit = (istasyonId: number) => {
    rafOdakYaz(null);
    sekmeYaz('harita');
    yuruyusYaz(false);
    const anahtar = istasyonNesnesi(tumBolumler, istasyonId);
    seciliYaz(anahtar);
    hedefYaz((h) => ({ anahtar, sayac: (h?.sayac ?? 0) + 1 }));
  };

  // Fabrikada raflar fabrika metresinde kümelenir; kamera kümenin ortasına (en yakın rafın bölüm metresinde) gider.
  const depoyaGit = () => {
    const konumlar = new Map(gorunen.map((b) => [b.salon.id, fabrikaGorunumu ? konumOku(b.salon) : SIFIR_KONUM]));
    const aday = gorunen.flatMap((b) => b.raflar.filter((r) => r.aktif).map((r) => {
      const f = fabrikayaCevir(konumlar.get(b.salon.id) ?? SIFIR_KONUM, { x: sayi(r.x), z: sayi(r.z) });
      return { id: r.id, x: String(f.x), z: String(f.z), salonId: b.salon.id };
    }));
    const depo = depoMerkezi(aday);
    if (!depo) { bildir('bilgi', fabrikaGorunumu ? 'Fabrikada raf yok.' : 'Bu bölümde raf yok.'); return; }
    if (yuruyus) {
      hedefYaz((h) => ({ anahtar: `raf:${depo.raf.id}`, sayac: (h?.sayac ?? 0) + 1 }));
      return;
    }
    const yerel = bolumeCevir(konumlar.get(depo.raf.salonId) ?? SIFIR_KONUM, depo);
    odakla(yerel.x, yerel.z, depo.raf.salonId);
  };

  const ustSag = (
    <div className="tc-atolye-ust-sag">
      {tumBolumler.length > 1 && (
        <Secim
          etiket="Bölüm"
          secenekler={[
            { deger: 'fabrika', baslik: 'Tüm fabrika' },
            ...tumBolumler.map((b) => ({ deger: String(b.salon.id), baslik: `${b.salon.kod} · ${b.salon.ad}` })),
          ]}
          value={String(kapsam ?? '')}
          onChange={(o) => kapsamSecimiYaz(o.target.value === 'fabrika' ? 'fabrika' : Number(o.target.value))}
        />
      )}
      {canliTaze ? <Rozet ton="tamam">Canlı</Rozet> : <Rozet ton="uyari">{canli.hata ? 'Durum alınamadı' : 'Bekleniyor'}</Rozet>}
      <Saat />
      {yazabilir && <Dugme simge="plus" onClick={() => salonPenceresiYaz(true)}>Bölüm</Dugme>}
    </div>
  );

  const salonEklendi = (
    <SalonPenceresi
      acik={salonPenceresi}
      kapat={() => salonPenceresiYaz(false)}
      eklendi={(s) => { salonPenceresiYaz(false); kapsamSecimiYaz(s.id); bildir('tamam', `${s.kod} bölümü eklendi.`); }}
    />
  );

  if (fabrika.isPending) {
    return <Kart baslik="Fabrika Haritası"><DurumKutusu durum="yukleniyor" /></Kart>;
  }
  if (fabrika.isError) {
    return <Kart baslik="Fabrika Haritası"><DurumKutusu durum="hata" mesaj={hataIletisi(fabrika.error, 'Fabrika planı alınamadı')} yenile={() => { void fabrika.refetch(); }} /></Kart>;
  }
  if (kapsam === null || gorunen.length === 0) {
    return (
      <Kart baslik="Fabrika Haritası" sag={ustSag}>
        <DurumKutusu durum="bos" mesaj="Henüz fabrika bölümü tanımlı değil.">
          {yazabilir ? <Dugme tur="birincil" simge="plus" onClick={() => salonPenceresiYaz(true)}>Bölüm ekle</Dugme> : <p>Bölümü yerleşim yetkisi olan kişi ekler.</p>}
        </DurumKutusu>
        {salonEklendi}
      </Kart>
    );
  }

  const sirali = [...yerler].sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
  const bos = gorunen.every((b) => b.istasyonYerleri.length === 0 && b.raflar.length === 0 && b.alanlar.length === 0 && b.duvarlar.length === 0);
  // Bölmeye bakarken sahne bütün genişliği alır.
  const listeGorunur = !rafOdak && (!tamEkran.acik || listeAcik);
  const baslik = fabrikaGorunumu ? 'Tüm fabrika' : y?.salon.ad ?? '';
  // Bölmeye bakılan rafın bölümü.
  const odakBolumu = rafOdak ? gorunen.find((b) => b.raflar.some((r) => r.id === rafOdak.rafId)) : undefined;

  const haritaGorunur = sekme === 'harita' || tamEkran.acik;
  const odakRafi = rafOdak ? odakBolumu?.raflar.find((r) => r.id === rafOdak.rafId) : undefined;
  const harita = (
    <div className={`tc-atolye${tamEkran.acik ? ' tc-atolye-tam' : ''}`} data-tam-ekran={tamEkran.acik || undefined} hidden={!haritaGorunur}>
      <div className="tc-atolye-serit">
        {tamEkran.acik && (
          <div className="tc-atolye-tam-baslik">
            <strong>Fabrika Haritası · {baslik}</strong>
            {canliTaze ? <Rozet ton="tamam">Canlı</Rozet> : <Rozet ton="uyari">{canli.hata ? 'Durum alınamadı' : 'Bekleniyor'}</Rozet>}
            <Saat />
          </div>
        )}
        <dl className="tc-atolye-gostergeler" aria-label="Özet">
          <Gosterge ad="Çalışıyor" deger={sayiMetni(ozet.calisiyor)} durum="calisiyor" />
          <Gosterge ad="Duraklatıldı" deger={sayiMetni(ozet.durakli)} durum="durakli" />
          <Gosterge ad="Durdu" deger={sayiMetni(ozet.durdu)} durum="durdu" />
          <Gosterge ad="Bekliyor" deger={sayiMetni(ozet.bekliyor)} durum="sirada" />
          {arizaOkundu && <Gosterge ad="Arıza, bakım (makine)" deger={sayiMetni(arizaSayisi)} durum={arizaSayisi > 0 ? 'durdu' : undefined} />}
          <Gosterge ad="Sağlam (süren işler)" deger={ozet.saglam === null ? '—' : sayiMetni(ozet.saglam)} birim={ozet.saglam === null ? undefined : 'adet'} />
          <Gosterge ad="Yerleşik istasyon" deger={sayiMetni(yerler.length)} />
          {fabrikaGorunumu && <Gosterge ad="Bölüm" deger={sayiMetni(gorunen.length)} />}
        </dl>
      </div>

      <div className="tc-atolye-ana" data-liste={listeGorunur}>
        <div className="tc-atolye-sahne-alani" data-yuruyus={yuruyus}>
          <Suspense fallback={<div className="tc-atolye-yukleniyor"><DurumKutusu durum="yukleniyor" mesaj="3B atölye hazırlanıyor" /></div>}>
            <Sahne3B
              bolumler={bolumYerlesimleri}
              canli={canliHaritasi}
              secili={secili}
              sec={sec}
              gorunum={gorunum}
              odak={odak}
              izgara={izgara}
              etiketler={etiketler}
              rota={rota}
              yuruyus={yuruyus}
              yuruyusBitir={() => yuruyusYaz(false)}
              rotaIste={rotaIste}
              parcalar={parcalar}
              parcaGoster={parcaGoster}
              rafYukleri={rafYukleri}
              hedef={hedef}
              rafOdak={odakRafi && rafOdak ? rafOdak : null}
              rafOdakYaz={rafOdakYaz}
              gozKalemleri={gozKalemListesi}
            />
          </Suspense>

          {odakRafi && rafOdak && odakBolumu && (
            <RafOdagi
              yerlesim={odakBolumu}
              raf={odakRafi}
              secim={rafOdak}
              secimYaz={rafOdakYaz}
              gozKalemleri={gozKalemListesi}
              yazabilir={yazabilir}
              depodaAc={depodaAc}
            />
          )}

          {!yuruyus && !rafOdak && (
            <div className="tc-atolye-arama">
              <Girdi
                etiket="Ara"
                type="search"
                placeholder="Göz, raf, istasyon, alan (R1-02-3-1, CNC)"
                value={arama}
                onChange={(o) => { aramaYaz(o.target.value); aramaAcikYaz(true); }}
                onFocus={() => aramaAcikYaz(true)}
                onKeyDown={(o) => { if (o.key === 'Escape') aramaAcikYaz(false); if (o.key === 'Enter' && aramaSorgusu.data?.sonuclar[0]) aramaSec(aramaSorgusu.data.sonuclar[0]); }}
                aria-controls="tc-atolye-sonuclar"
              />
              {aramaAcik && arama.trim() !== '' && (
                <div id="tc-atolye-sonuclar" className="tc-atolye-sonuclar" role="listbox" aria-label="Arama sonuçları">
                  {aramaSorgusu.isError && <p className="tc-atolye-hata">{hataIletisi(aramaSorgusu.error, 'Arama yapılamadı')}</p>}
                  {aramaSorgusu.data?.sonuclar.length === 0 && <p className="tc-atolye-ipucu">Sonuç yok.</p>}
                  {aramaSorgusu.data?.sonuclar.map((s) => (
                    <Dugme key={`${s.tur}:${s.kimlik}`} className="tc-atolye-sonuc" role="option" aria-selected={false} onClick={() => aramaSec(s)}>
                      <span className="mono">{s.etiket}</span>
                      <span>{s.ayrinti}</span>
                      <small>{s.salon.kod} · {s.hucre}</small>
                    </Dugme>
                  ))}
                </div>
              )}
            </div>
          )}

          {turDenetimi.konum && !rafOdak && (
            <div className="tc-atolye-tur-cubuk" role="group" aria-label="Fabrika turu">
              <Dugme className="tc-atolye-tur-geri" simge="next" aria-label="Önceki istasyon" title="Önceki istasyon" onClick={turDenetimi.geri} />
              <Dugme
                simge={turDurdu ? 'play' : 'pause'}
                aria-label={turDurdu ? 'Turu sürdür' : 'Turu duraklat'}
                title={turDurdu ? 'Turu sürdür' : 'Turu duraklat'}
                aria-pressed={turDurdu}
                onClick={() => turDurduYaz((v) => !v)}
              />
              <Dugme simge="next" aria-label="Sonraki istasyon" title="Sonraki istasyon" onClick={turDenetimi.ileri} />
              <span className="tc-atolye-tur-konum mono">
                {turDenetimi.konum.no} / {turDenetimi.konum.toplam} · {yerler.find((i) => istasyonNesnesi(gorunen, i.istasyonId) === turDenetimi.konum?.anahtar)?.kod ?? ''}
              </span>
              <Dugme simge="x" aria-label="Turu bitir" title="Turu bitir" onClick={() => turYaz(false)} />
            </div>
          )}

          {!rafOdak && <HaritaAraclari
            gorunum={yuruyus ? null : gorunum.tur}
            yuruyus={yuruyus}
            izgara={izgara}
            etiketler={etiketler}
            parcaVar={parcalar.size > 0}
            parcaGoster={parcaGoster}
            fabrika={fabrikaGorunumu}
            rotaVar={rota !== null}
            yazabilir={yazabilir}
            tamEkran={tamEkran.acik}
            tur={tur}
            listeAcik={listeGorunur}
            sec={(a) => {
              if (a === 'genel' || a === 'kus') { yuruyusYaz(false); gorunumYaz((g) => ({ tur: a, sayac: g.sayac + 1 })); }
              if (a === 'yuru') { seciliYaz(null); turYaz(false); yuruyusYaz((v) => !v); }
              if (a === 'izgara') izgaraYaz((v) => !v);
              if (a === 'etiket') etiketlerYaz((v) => !v);
              if (a === 'parca') {
                parcaGosterYaz((v) => !v);
                if (!parcaGoster && parcalar.size === 0) bildir('bilgi', 'Makinelerde şu an 3B modeli olan iş yok; model bağlanınca parça makinenin üstünde görünür.');
              }
              if (a === 'depo') depoyaGit();
              if (a === 'rota') rotaYaz(null);
              if (a === 'duzenle') { tamEkran.kapat(); turYaz(false); yuruyusYaz(false); duzenleyiciYaz(true); }
              if (a === 'tur') { yuruyusYaz(false); turYaz((v) => !v); }
              if (a === 'liste') listeAcikYaz((v) => !v);
              if (a === 'tam') { if (tamEkran.acik) { tamEkran.kapat(); turYaz(false); } else tamEkran.ac(); }
            }}
          />}

          {bos && <p className="tc-atolye-bos">{fabrikaGorunumu ? 'Bölümler boş.' : 'Bölüm boş.'} {yazabilir ? '"Yerleşimi düzenle" ile istasyon, raf ve alan ekleyin.' : 'Yerleşimi, yetkisi olan kişi düzenler.'}</p>}
          {secili && seciliBolum && !yuruyus && !rafOdak && (
            <OgeKarti
              yerlesim={seciliBolum}
              anahtar={secili}
              emirler={canli.emirler}
              canli={canliHaritasi}
              parcalar={parcalar}
              siradakiler={siradakiler}
              gozKalemleri={gozKalemListesi}
              tumEmirler={tumEmirler.data?.emirler ?? null}
              yazabilir={yazabilir}
              depodaAc={depodaAc}
              ucBoyut={ucBoyut}
              vurguAdres={vurguAdres}
              kapat={() => sec(null)}
              yolGoster={(h) => { void yolGoster(seciliBolum.salon.id, h); }}
              yakinlas={(h) => odakla(h.x, h.z, seciliBolum.salon.id)}
              girisVar={seciliBolum.salon.giris !== null}
            />
          )}
        </div>

        {listeGorunur && (
          <KuyrukListesi
            baslik={yanListe === 'istasyon' ? 'Makineler' : yanListe === 'yerlesmemis' ? 'Yerleşmemiş makineler' : 'Son hareketler'}
            sayac={yanListe === 'istasyon' ? `${yerler.length} istasyon` : yanListe === 'yerlesmemis' && yerlesmemis.data ? `${yerlesmemis.data.istasyonlar.length} makine` : undefined}
            sag={(
              <div className="tc-atolye-yan-secim" role="group" aria-label="Yan liste">
                <Dugme simge="list" aria-pressed={yanListe === 'istasyon'} title="Makineler" aria-label="Makineler" onClick={() => yanListeYaz('istasyon')} />
                <Dugme simge="clock" aria-pressed={yanListe === 'hareket'} title="Son hareketler" aria-label="Son hareketler" onClick={() => yanListeYaz('hareket')} />
                <Dugme simge="plus" aria-pressed={yanListe === 'yerlesmemis'} title="Yerleşmemiş makineler" aria-label="Yerleşmemiş makineler" onClick={() => yanListeYaz('yerlesmemis')} />
              </div>
            )}
          >
            {yanListe === 'hareket' && (
              <SonHareketler
                secili={secili}
                nesne={(o) => olayNesnesi(gorunen, o)}
                sec={(nesne) => { turYaz(false); sec(nesne); yuruyusYaz(false); hedefYaz((h) => ({ anahtar: nesne, sayac: (h?.sayac ?? 0) + 1 })); }}
              />
            )}
            {yanListe === 'yerlesmemis' && (
              <>
                {yerlesmemis.isError && <p className="tc-atolye-ipucu">{hataIletisi(yerlesmemis.error, 'Yerleşmemiş makineler alınamadı')}</p>}
                {yerlesmemis.data?.istasyonlar.length === 0 && <p className="tc-atolye-ipucu">Bütün aktif makineler haritada.</p>}
                {(yerlesmemis.data?.istasyonlar.length ?? 0) > 0 && (
                  <p className="tc-atolye-ipucu">{yazabilir ? 'Makineyi seçip Düzenle > Ekle\'den yerleştirin.' : 'Yerleşimi, yetkisi olan kişi Düzenle > Ekle\'den yapar.'}</p>
                )}
                {yerlesmemis.data?.istasyonlar.map((i) => (
                  <KuyrukKarti
                    key={i.istasyonId}
                    no={i.kod}
                    parca={i.ad}
                    adet={ISTASYON_TIPI_ADI[i.tip]}
                    ayrinti={[i.model ? `3B model: ${i.model.ad}${i.model.yayinda ? '' : ' (taslak, yayınlanınca görünür)'}` : 'Çizim Merkezi modeli yok']}
                    durum="sirada"
                    durumMetni="Haritada yok"
                    ilerleme={null}
                    secili={vurguIstasyon === i.istasyonId}
                    sec={() => { if (yazabilir) { tamEkran.kapat(); turYaz(false); yuruyusYaz(false); duzenleyiciYaz(true); } }}
                  />
                ))}
              </>
            )}
            {yanListe === 'istasyon' && haritadaYokCalisan.length > 0 && (
              <p className="tc-atolye-uyari" role="status">
                <Simge ad="alert" boyut="k" />
                Haritada olmayan makinede çalışan iş: {haritadaYokCalisan.map((e) => `${e.istasyon.ad} (${e.emirNo})`).join(', ')}. Canlı durumu görmek için makineyi Düzenle &gt; Ekle'den yerleştirin.
              </p>
            )}
            {yanListe === 'istasyon' && sirali.length === 0 && <p className="tc-atolye-ipucu">{fabrikaGorunumu ? 'Fabrikaya' : 'Bu bölüme'} istasyon yerleştirilmemiş.</p>}
            {yanListe === 'istasyon' && sirali.map((i) => {
              const emir = canli.emirler.get(i.istasyonId);
              const g = istasyonGorunumu(i, emir);
              const nesne = istasyonNesnesi(gorunen, i.istasyonId);
              const ayrinti = [i.ad, `Hücre ${i.hucre}`, emir?.canli?.durusNedeni?.ad].filter((m): m is string => Boolean(m));
              return (
                <KuyrukKarti
                  key={i.istasyonId}
                  no={i.kod}
                  parca={emir ? `${emir.emirNo} · ${emir.parcaAd}` : ISTASYON_TIPI_ADI[i.tip]}
                  adet={emir ? `${emir.canli ? sayiMetni(emir.canli.saglam) : '—'} / ${sayiMetni(emir.adet)}` : 'İş yok'}
                  ayrinti={ayrinti}
                  durum={g.durum}
                  durumMetni={g.metin}
                  ilerleme={ilerleme(emir)}
                  secili={secili === nesne || secili === `istasyon:${i.istasyonId}`}
                  sec={() => { turYaz(false); sec(nesne); yuruyusYaz(false); hedefYaz((h) => ({ anahtar: nesne, sayac: (h?.sayac ?? 0) + 1 })); }}
                />
              );
            })}
          </KuyrukListesi>
        )}
      </div>
      {!tamEkran.acik && (
        <p className="tc-atolye-not">
          Durum üretim emirlerinden, arıza ve bakım istasyonlardan {CANLI_ARALIK_MS / 1000} saniyede bir okunur; iş emrinin makinesi belli değilse durum istasyonun ilk makinesinde görünür. Makine gövdeleri istasyon tipinden çizilen temsili biçimlerdir (3B model atanmamışsa); ölçü, yerleşimdeki ayak izidir.
        </p>
      )}
    </div>
  );

  return (
    <Kart baslik={`Fabrika Haritası · ${baslik}`} sag={ustSag}>
      {!tamEkran.acik && <div className="tc-atolye-sekmeler"><Sekmeler etiket="Atölye bölümleri" sekmeler={SEKMELER} secili={sekme} sec={(a) => { sekmeYaz(a); if (a !== 'harita') rafOdakYaz(null); }} /></div>}
      {harita}
      {!tamEkran.acik && sekme === 'ikiz' && (
        <DijitalIkiz bolumler={gorunen} fabrika={fabrikaGorunumu} baslik={baslik} canli={canliHaritasi} tumEmirler={tumEmirler.data?.emirler ?? null} />
      )}
      {!tamEkran.acik && sekme === 'depo' && (
        <DepoGorunumu
          raflar={raflar}
          bolumKodlari={bolumKodlari}
          gozKalemleri={gozKalemListesi}
          hata={gozKalemleri.isError ? hataIletisi(gozKalemleri.error, 'Göz kalemleri alınamadı') : null}
          yenile={() => { void gozKalemleri.refetch(); }}
          yazabilir={yazabilir}
          secim={depoSecimi}
          secimYaz={depoSecimiYaz}
          ucBoyut={ucBoyut}
        />
      )}
      {!tamEkran.acik && sekme === 'parcalar' && (
        (gozKalemleri.isPending && !gozKalemleri.isError) || kalemGorunumleri.isPending
          ? <DurumKutusu durum="yukleniyor" />
          : (
            <ParcaListesi
              gozKalemleri={gozKalemListesi ?? []}
              gorunumler={kalemler ?? []}
              emirler={tumEmirler.data?.emirler ?? []}
              emirHatasi={tumEmirler.isError}
              gozHatasi={gozKalemleri.isError}
              yazabilir={yazabilir}
              gozeGit={(g) => depodaAc(g.raf.id, g.bolme, g.kat, g.goz)}
              istasyonaGit={istasyonaGit}
            />
          )
      )}
      {duzenleyici && (
        <YerlesimDuzenleyici
          salonId={salonId}
          bolumler={tumBolumler}
          kapat={() => duzenleyiciYaz(false)}
          kaydedildi={() => { duzenleyiciYaz(false); seciliYaz(null); rotaYaz(null); }}
        />
      )}
      {salonEklendi}
    </Kart>
  );
}
