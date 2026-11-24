import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LogoBelirsizKontrolCevabi, LogoGidenIzlemeCevabi, LogoHazirlikCevabi, LogoKontrolCevabi, LogoKontrolluGonderCevabi, LogoYardimciSurumu, LogoYenidenGonderCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { SmartesGidenIzlemeCevabi, SmartesHazirlikCevabi, SmartesYenidenGonderCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Pencere, Rozet, Simge, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ADI, DURUM_TONU, duranGruplari, izlemeSatirlari, parcalara, sayac, type IzlemeDurumu, type IzlemeSatiri } from './baglanti-izleme.ts';
import { BOS, zamanMetni } from './gorunum.ts';
import './guvenlik.css';

const YENILEME_MS = 30_000;
type Gorunum = 'gitmeyen' | IzlemeDurumu | 'akislar';

const SUTUNLAR: readonly Sutun<IzlemeSatiri>[] = [
  { anahtar: 'belge', baslik: 'Belge', hucre: (s) => (
    <span className="tc-izleme-belge"><strong>{s.belgeAdi}</strong><span className="tc-guvenlik-not">{s.kaynak} · CORE no {s.no}</span></span>
  ) },
  { anahtar: 'durum', baslik: 'Durum', kirilmaz: true, hucre: (s) => <Rozet ton={DURUM_TONU[s.durum]}>{DURUM_ADI[s.durum]}</Rozet> },
  { anahtar: 'neden', baslik: 'Neden', kes: true, hucre: (s) => s.neden ?? BOS },
  { anahtar: 'deneme', baslik: 'Deneme', kirilmaz: true, hucre: (s) => denemeMetni(s) },
];

function denemeMetni(s: IzlemeSatiri): string {
  if (s.denemeSayisi === null) return 'Denenmedi';
  const son = s.sonDeneme === null ? '' : ` · son ${zamanMetni(s.sonDeneme)}`;
  return `${s.denemeSayisi}${son}`;
}

const BAGLANTI: Record<LogoHazirlikCevabi['baglanti'], { metin: string; ton: RozetTonu }> = {
  acik: { metin: 'Açık', ton: 'tamam' }, kapali: { metin: 'Anahtar kapalı', ton: 'pasif' }, 'ortam-degiskeni-yok': { metin: 'Ortam değişkeni eksik', ton: 'uyari' },
};
const AKIS_DURUMU: Record<LogoHazirlikCevabi['akislar'][number]['durum'], { metin: string; ton: RozetTonu }> = {
  hazir: { metin: 'Açık', ton: 'tamam' }, kapali: { metin: 'Kapalı', ton: 'pasif' }, 'ayar-eksik': { metin: 'Ayar eksik', ton: 'uyari' },
  baglanmadi: { metin: 'Bağlanmadı', ton: 'pasif' }, 'kodda-yok': { metin: 'Henüz yok', ton: 'pasif' },
};

interface AkisSatiri { anahtar: string; kaynak: string; yon: 'Giden' | 'Gelen'; baslik: string; durum: keyof typeof AKIS_DURUMU; sayi: number | null; hatali: number | null; son: string | null; sonHata: string | null }
const AKIS_SUTUNLARI: readonly Sutun<AkisSatiri>[] = [
  { anahtar: 'akis', baslik: 'Akış', hucre: (a) => <span className="tc-izleme-belge"><strong>{a.baslik}</strong><span className="tc-guvenlik-not">{a.kaynak} · {a.yon}</span></span> },
  { anahtar: 'durum', baslik: 'Durum', kirilmaz: true, hucre: (a) => <Rozet ton={AKIS_DURUMU[a.durum].ton}>{AKIS_DURUMU[a.durum].metin}</Rozet> },
  { anahtar: 'son', baslik: 'Son', kirilmaz: true, hucre: (a) => (a.son === null ? (a.yon === 'Gelen' ? 'Henüz okunmadı' : 'Henüz gitmedi') : zamanMetni(a.son)) },
  { anahtar: 'sayi', baslik: 'Sayı', hizala: 'sag', mono: true, hucre: (a) => (a.sayi === null ? BOS : a.hatali ? `${a.sayi} · ${a.hatali} hatalı` : a.sayi) },
  { anahtar: 'hata', baslik: 'Son hata', kes: true, hucre: (a) => a.sonHata ?? BOS },
];

function akisSatirlari(logo: LogoHazirlikCevabi | undefined, smartes: SmartesHazirlikCevabi | undefined): AkisSatiri[] {
  const l = (logo?.akislar ?? []).map((a): AkisSatiri => ({
    anahtar: `logo:${a.anahtar}`, kaynak: 'Logo', yon: a.yon === 'tmi-logo' ? 'Giden' : 'Gelen', baslik: a.baslik, durum: a.durum,
    sayi: a.gonderilen, hatali: a.hatali, son: a.sonDeneme, sonHata: a.sonHata ?? null,
  }));
  const s = (smartes?.akislar ?? []).map((a): AkisSatiri => ({
    anahtar: `smartes:${a.anahtar}`, kaynak: 'SmartES', yon: a.yon === 'tmi-smartes' ? 'Giden' : 'Gelen', baslik: a.baslik, durum: a.durum,
    sayi: a.islenen, hatali: a.hatali, son: a.sonDeneme, sonHata: a.sonHata,
  }));
  return [...l, ...s];
}

export function BaglantiIzleme() {
  const oturum = useOturum();
  const gonderir = oturum.data?.islemler.includes('ayarlar.yaz') === true;
  const [gorunum, gorunumYaz] = useState<Gorunum>('gitmeyen');
  const [secili, seciliYaz] = useState<IzlemeSatiri | null>(null);
  const [toplu, topluYaz] = useState(false);
  const logo = useQuery({ queryKey: anahtarlar.izlemeLogo, queryFn: () => api.get<LogoGidenIzlemeCevabi>('/logo/giden'), refetchInterval: YENILEME_MS });
  const smartes = useQuery({ queryKey: anahtarlar.izlemeSmartes, queryFn: () => api.get<SmartesGidenIzlemeCevabi>('/smartes/giden/sorunlar'), refetchInterval: YENILEME_MS });
  const logoHazirlik = useQuery({ queryKey: anahtarlar.izlemeLogoHazirlik, queryFn: () => api.get<LogoHazirlikCevabi>('/logo/hazirlik'), refetchInterval: YENILEME_MS });
  const smartesHazirlik = useQuery({ queryKey: anahtarlar.izlemeSmartesHazirlik, queryFn: () => api.get<SmartesHazirlikCevabi>('/smartes/hazirlik'), refetchInterval: YENILEME_MS });
  const satirlar = izlemeSatirlari(logo.data, smartes.data);
  const say = sayac(satirlar);
  const gitmeyen = satirlar.length;
  const gorunen = gorunum === 'gitmeyen' || gorunum === 'akislar' ? satirlar : satirlar.filter((s) => s.durum === gorunum);
  const gruplar = duranGruplari(satirlar);
  const yenile = () => { void logo.refetch(); void smartes.refetch(); void logoHazirlik.refetch(); void smartesHazirlik.refetch(); };
  const kesildi = logo.data?.kesildi === true || smartes.data?.kesildi === true;

  return (
    <div className="tc-guvenlik">
      <div className="tc-izleme-ust">
        <p className="tc-guvenlik-not">Logo ve SmartES'e giden ve gelen her akış; gitmeyen belgenin nedeni ve ne yapılacağı. Kendiliğinden yenilenir.</p>
        <div className="tc-guvenlik-cipler">
          <Dugme simge="rotate" onClick={yenile}>Yenile</Dugme>
          {gonderir && gruplar.length > 0 && <Dugme simge="next" onClick={() => topluYaz(true)}>Düzelttiklerimi yeniden gönder…</Dugme>}
        </div>
      </div>
      <div className="tc-izleme-kartlar">
        <BaglantiKarti ad="Logo yardımcısı" simge="laptop" baglanti={logoHazirlik.data?.baglanti} kontrolUcu="/logo/hazirlik/kontrol"
          surum={logoHazirlik.data?.yardimci ?? null} kontrolSonrasi={() => void logoHazirlik.refetch()} />
        <BaglantiKarti ad="SmartES" simge="cpu" baglanti={smartesHazirlik.data?.baglanti} kontrolUcu="/smartes/hazirlik/kontrol" />
        <section className="tc-izleme-kart" aria-label="Gitmeyen belgeler">
          <Simge ad="alert" />
          <div>
            <strong>Gitmeyen {gitmeyen}</strong>
            <div className="tc-guvenlik-cipler">
              <Rozet ton="hata">{say.durdu} durdu</Rozet>
              <Rozet ton="uyari">{say['yeniden-denenecek']} yeniden</Rozet>
              <Rozet ton="bilgi">{say['kart-bekliyor']} kart bekliyor</Rozet>
              {say['proje-bekliyor'] > 0 && <Rozet ton="bilgi">{say['proje-bekliyor']} proje bekliyor</Rozet>}
            </div>
          </div>
        </section>
      </div>
      <div className="tc-guvenlik-cipler" role="group" aria-label="Görünüm">
        {([['gitmeyen', `Gitmeyenler ${gitmeyen}`], ['durdu', `Durdu ${say.durdu}`], ['yeniden-denenecek', `Yeniden denenecek ${say['yeniden-denenecek']}`],
          ['kart-bekliyor', `Kart bekliyor ${say['kart-bekliyor']}`], ['proje-bekliyor', `Proje bekliyor ${say['proje-bekliyor']}`], ['sirada', `Sırada ${say.sirada}`], ['akislar', 'Akışlar']] as const).map(([g, metin]) => (
          <Dugme key={g} className="tc-guvenlik-cip" aria-pressed={g === gorunum} onClick={() => gorunumYaz(g)}>{metin}</Dugme>
        ))}
      </div>
      {gorunum === 'akislar' ? (
        logoHazirlik.isPending && smartesHazirlik.isPending ? <DurumKutusu durum="yukleniyor" />
          : <Tablo etiket="Logo ve SmartES akışları" sutunlar={AKIS_SUTUNLARI} satirlar={akisSatirlari(logoHazirlik.data, smartesHazirlik.data)} satirAnahtari={(a) => a.anahtar} bosMesaj="Akış bilgisi okunamadı" />
      ) : logo.isPending || smartes.isPending ? <DurumKutusu durum="yukleniyor" />
        : logo.isError && smartes.isError ? <DurumKutusu durum="hata" yenile={yenile} />
          : (
            <>
              {(logo.isError || smartes.isError) && <p className="tc-guvenlik-not">{logo.isError ? 'Logo' : 'SmartES'} listesi okunamadı; yalnız öteki gösteriliyor.</p>}
              {kesildi && <p className="tc-guvenlik-not">Liste uzun; en eski 500 belge gösteriliyor.</p>}
              <Tablo etiket="Gitmeyen belgeler" sutunlar={SUTUNLAR} satirlar={gorunen} satirAnahtari={(s) => s.anahtar} satirSec={seciliYaz}
                bosMesaj={gorunum === 'gitmeyen' ? 'Gitmeyen belge yok' : 'Bu durumda belge yok'} />
            </>
          )}
      {secili !== null && <BelgeAyrintisi satir={secili} gonderir={gonderir} kapat={() => seciliYaz(null)} />}
      {toplu && <TopluGonderim gruplar={gruplar} kapat={() => topluYaz(false)} />}
    </div>
  );
}

function BaglantiKarti({ ad, simge, baglanti, kontrolUcu, surum = null, kontrolSonrasi }: {
  ad: string; simge: 'laptop' | 'cpu'; baglanti: LogoHazirlikCevabi['baglanti'] | undefined; kontrolUcu: string;
  surum?: LogoYardimciSurumu | null; kontrolSonrasi?: () => void;
}) {
  const kontrol = useMutation({ mutationFn: () => api.get<LogoKontrolCevabi>(kontrolUcu), onSettled: kontrolSonrasi });
  const durum = baglanti === undefined ? null : BAGLANTI[baglanti];
  const eskiSurum = surum !== null && (surum.durum === 'farkli' || surum.durum === 'eski');
  return (
    <section className="tc-izleme-kart" aria-label={ad}>
      <Simge ad={simge} />
      <div>
        <strong>{ad}</strong> {durum !== null && <Rozet ton={durum.ton}>{durum.metin}</Rozet>}
        {eskiSurum && <Rozet ton="uyari">Eski sürüm</Rozet>}
        {eskiSurum && <p className="tc-guvenlik-not" role="status">{surum.ileti}</p>}
        <p className="tc-guvenlik-not">
          {kontrol.isSuccess ? (kontrol.data.ulasildi ? `Ulaşıldı · ${zamanMetni(kontrol.data.zaman)}` : `Ulaşılamadı: ${kontrol.data.adimlar[0]?.ileti ?? BOS}`)
            : kontrol.isError ? hataIletisi(kontrol.error, 'Denenemedi.') : 'Çalıştığını görmek için deneyin.'}
        </p>
        <Dugme simge="bolt" onClick={() => kontrol.mutate()} yukleniyor={kontrol.isPending}>Bağlantıyı dene</Dugme>
      </div>
    </section>
  );
}

function useYenidenGonder(kapat: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    // Logo ve SmartES ayrı uçlara gider; biri düşerse öteki yine gönderilir ve sonuç kaynak başına yazılır.
    mutationFn: async (belgeler: readonly IzlemeSatiri[]) => {
      let sirada = 0;
      let durmayan = 0;
      const hatalar: string[] = [];
      const gonder = async (kaynak: IzlemeSatiri['kaynak'], istek: (p: IzlemeSatiri[]) => Promise<{ sirada: number; durmayan: number }>) => {
        try {
          for (const p of parcalara(belgeler.filter((b) => b.kaynak === kaynak))) {
            const c = await istek(p);
            sirada += c.sirada;
            durmayan += c.durmayan;
          }
        } catch (h) {
          hatalar.push(`${kaynak}: ${hataIletisi(h, 'gönderilemedi.')}`);
        }
      };
      await gonder('Logo', (p) => api.post<LogoYenidenGonderCevabi>('/logo/giden/yeniden-gonder',
        { belgeler: p.map((b) => ({ belge: b.belge, no: b.no, islem: b.islem })) }, { istekKimligi: yeniIstekKimligi() }));
      await gonder('SmartES', (p) => api.post<SmartesYenidenGonderCevabi>('/smartes/giden/yeniden-gonder',
        { isEmirleri: p.map((b) => b.no) }, { istekKimligi: yeniIstekKimligi() }));
      return { sirada, durmayan, hatalar };
    },
    onSuccess: async ({ sirada, durmayan, hatalar }) => {
      const ozet = durmayan === 0 ? `${sirada} belge sıraya girdi; ilk turda gider.` : `${sirada} belge sıraya girdi; ${durmayan} belge artık durmuyordu, değişmedi.`;
      await istemci.invalidateQueries({ queryKey: anahtarlar.izleme });
      if (hatalar.length > 0) { bildir('hata', sirada + durmayan === 0 ? hatalar.join(' ') : `${ozet} ${hatalar.join(' ')}`); return; }
      bildir('tamam', ozet);
      kapat();
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Yeniden gönderilemedi.')),
  });
}

// 3626: iki adım. Önce Logo'da aranır (GET) ve sonuç gösterilir; belgeye dokunmak ayrı onayla (POST) olur.
function useLogoKontrol() {
  return useMutation({
    mutationFn: (s: IzlemeSatiri) => api.get<LogoBelirsizKontrolCevabi>(`/logo/giden/kontrol?belge=${encodeURIComponent(s.belge)}&no=${String(s.no)}&islem=${s.islem}`),
  });
}
function useKontrolluUygula() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: (s: IzlemeSatiri) => api.post<LogoKontrolluGonderCevabi>('/logo/giden/kontrollu-gonder', { belge: s.belge, no: s.no, islem: s.islem }, { istekKimligi: yeniIstekKimligi() }),
    onSuccess: async (c) => {
      bildir(c.sonuc === 'degisti' ? 'hata' : 'tamam', c.ileti);
      await istemci.invalidateQueries({ queryKey: anahtarlar.izleme });
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Uygulanamadı.')),
  });
}

function BelgeAyrintisi({ satir, gonderir, kapat }: { satir: IzlemeSatiri; gonderir: boolean; kapat: () => void }) {
  const gonder = useYenidenGonder(kapat);
  const kontrol = useLogoKontrol();
  const uygula = useKontrolluUygula();
  const karar = kontrol.data?.karar;
  const uygulanir = karar === 'bulundu' || karar === 'yok';
  const kontrolEder = satir.kontrolEdilebilir && gonderir;
  return (
    <Pencere acik tur="yan" kapat={kapat} baslik={satir.belgeAdi}
      alt={kontrolEder || (satir.yenidenGonderilebilir && gonderir) ? (
        <>
          {kontrolEder && !uygulanir && (
            <Dugme tur="birincil" simge="search" onClick={() => kontrol.mutate(satir)} yukleniyor={kontrol.isPending}>
              {kontrol.isPending ? "Logo'da aranıyor…" : "Logo'da kontrol et"}
            </Dugme>
          )}
          {kontrolEder && uygulanir && (
            <Dugme tur="birincil" simge={'next'} onClick={() => uygula.mutate(satir)} yukleniyor={uygula.isPending}>
              {uygula.isPending ? 'Uygulanıyor…' : karar === 'yok' ? 'Logo\'da yok, şimdi gönder' : 'Logo kaydına bağla'}
            </Dugme>
          )}
          {satir.yenidenGonderilebilir && gonderir && !satir.kontrolEdilebilir && (
            <Dugme tur="birincil" simge="next" onClick={() => gonder.mutate([satir])} yukleniyor={gonder.isPending}>Yeniden gönder</Dugme>
          )}
        </>
      ) : undefined}>
      <div className="tc-guvenlik-ayrinti">
        <div className="tc-guvenlik-cipler"><Rozet ton={DURUM_TONU[satir.durum]}>{DURUM_ADI[satir.durum]}</Rozet></div>
        <section>
          <h3>Ne yapmalı</h3>
          <p>{satir.neYapmali}</p>
        </section>
        <dl className="tc-guvenlik-alanlar">
          <dt>Neden</dt><dd>{satir.neden ?? BOS}</dd>
          <dt>Yön</dt><dd>CORE → {satir.kaynak}</dd>
          <dt>CORE no</dt><dd className="mono">{satir.no}</dd>
          <dt>Deneme</dt><dd className="mono">{satir.denemeSayisi ?? 'Denenmedi'}</dd>
          <dt>Son deneme</dt><dd>{zamanMetni(satir.sonDeneme)}</dd>
          <dt>Sonraki deneme</dt><dd>{satir.durum === 'durdu' ? 'Yok; yeniden gönderilmeyi bekliyor' : zamanMetni(satir.sonrakiDeneme)}</dd>
        </dl>
        {kontrol.data !== undefined && <p className="tc-guvenlik-not" role="status">{kontrol.data.karar === 'yapilamadi' ? `Kontrol yapılamadı, belgeye dokunulmadı. ${kontrol.data.ileti}` : kontrol.data.ileti}</p>}
        {kontrol.isError && <p className="tc-guvenlik-not" role="status">{hataIletisi(kontrol.error, 'Kontrol edilemedi.')}</p>}
        {satir.kontrolEdilebilir && gonderir && <p className="tc-guvenlik-not">Sonucu bilinmeyen belge önce Logo'da aranır; yeniden göndermek aynı reddi tekrar üretirdi.</p>}
        {(satir.yenidenGonderilebilir || satir.kontrolEdilebilir) && !gonderir && <p className="tc-guvenlik-not">Yeniden göndermek ya da Logo'da kontrol etmek Sistem Ayarları yazma yetkisi ister.</p>}
      </div>
    </Pencere>
  );
}

function TopluGonderim({ gruplar, kapat }: { gruplar: ReturnType<typeof duranGruplari>; kapat: () => void }) {
  const [secilen, secilenYaz] = useState<ReadonlySet<string>>(new Set());
  const gonder = useYenidenGonder(kapat);
  const belgeler = gruplar.filter((g) => secilen.has(g.neden)).flatMap((g) => g.belgeler);
  return (
    // Seçim yokken gönder düğmesi kapalıdır ve ne yapılacağını söyler (Arayüz kod bakışı 1).
    <Pencere acik kapat={kapat} baslik="Düzelttiklerimi yeniden gönder" alt={(
      <>
        <Dugme onClick={kapat} disabled={gonder.isPending} data-ilk-odak>Vazgeç</Dugme>
        <Dugme tur="birincil" disabled={belgeler.length === 0} yukleniyor={gonder.isPending} onClick={() => gonder.mutate(belgeler)}>
          {belgeler.length === 0 ? 'Grup seçin' : `${belgeler.length} belgeyi gönder`}
        </Dugme>
      </>
    )}>
      <p className="tc-guvenlik-not">Durdurulan belgeler nedenine göre gruplu. Yalnız düzelttiğiniz nedenleri işaretleyin; yalnız onlar gider.</p>
      <div className="tc-izleme-gruplar">
        {gruplar.map((g) => (
          <IsaretKutusu key={g.neden} etiket={`${g.neden} (${g.belgeler.length} belge)`} checked={secilen.has(g.neden)}
            onChange={(o) => secilenYaz((s) => { const y = new Set(s); if (o.target.checked) y.add(g.neden); else y.delete(g.neden); return y; })} />
        ))}
      </div>
    </Pencere>
  );
}
