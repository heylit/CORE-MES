import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { AyarDegistirGovdesi } from '#paylasilan/sozlesme/ayarlar.ts';
import type {
  EntegrasyonAkisi, EntegrasyonGunlukCevabi, EntegrasyonGunlukSatiri, EntegrasyonKomutCevabi, EntegrasyonYonetimiCevabi, EntegrasyonYonu,
} from '#paylasilan/sozlesme/entegrasyon.ts';
import { SIKLIK_ETIKETI, type OkumaSikligi } from '#paylasilan/okuma-sikligi.ts';
import { api, hataIletisi } from '../veri/api.ts';
import { useOturum } from '../veri/oturum.ts';
import { zamanMetni } from '../veri/zaman-metni.ts';
import { AcKapa } from './AcKapa.tsx';
import { Secim } from './Alan.tsx';
import { useBildirim } from './Bildirim.tsx';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Kart } from './Kart.tsx';
import { OnayPenceresi } from './OnayPenceresi.tsx';
import { Rozet, type RozetTonu } from './Rozet.tsx';
import { Simge } from './Simge.tsx';
import { Tablo, type Sutun } from './Tablo.tsx';
import './entegrasyon-yonetimi.css';

// 3445: dış sistem (Logo, SmartES) yönetim bölümü, liste ve ayrıntı yerleşimi. Ayar değişikliği genel ayar ucundan gider (ayarlar.yaz);
// "Şimdi oku" ve bağlantı testi modülün yönetim ucundandır. Adres ve anahtar ekrana gelmez, ekrandan değişmez.

interface Ozellikler {
  // Kullanıcının tanıdığı ad: "Logo", "SmartES".
  ad: string;
  // Modülün uç kökü: '/logo', '/smartes'.
  kok: string;
}

const YON_ADI: Record<EntegrasyonYonu, string> = { okuma: 'Okuma', yazma: 'Yazma', istek: 'İstek üzerine' };
const GUNLUK_YON_ADI: Record<EntegrasyonGunlukSatiri['yon'], string> = { ...YON_ADI, baglanti: 'Bağlantı' };
const GRUPLAR: readonly { yon: EntegrasyonYonu; baslik: string; simge: 'down' | 'up' | 'search' }[] = [
  { yon: 'okuma', baslik: 'Okumalar', simge: 'down' },
  { yon: 'yazma', baslik: 'Yazmalar', simge: 'up' },
  { yon: 'istek', baslik: 'Tıklayınca gidenler', simge: 'search' },
];

// Özet şeridi (3737) aynı önbelleği okur: sayfadaki yönetim bölümüyle tek istek.
export const entegrasyonAnahtari = (kok: string) => ['entegrasyon', kok] as const;
const anahtar = entegrasyonAnahtari;

function akisRozeti(a: EntegrasyonAkisi): { metin: string; ton: RozetTonu } {
  if (!a.acik) return { metin: 'Kapalı', ton: 'pasif' };
  if (a.okunuyor) return { metin: 'Okunuyor', ton: 'bilgi' };
  if (a.son === null) return { metin: 'Henüz yok', ton: 'pasif' };
  return a.son.sonuc === 'tamam' ? { metin: zamanMetni(a.son.zaman), ton: 'tamam' } : { metin: 'Hata', ton: 'hata' };
}

function akisAlti(a: EntegrasyonAkisi): string {
  if (a.yon === 'okuma') return a.siklik === null ? 'Sıklık yok' : SIKLIK_ETIKETI[a.siklik];
  if (a.yon === 'yazma') return a.bekleyen === null ? 'Kayıt oluşunca gider' : `Kayıt oluşunca gider · ${a.bekleyen} bekleyen`;
  return 'Yalnız tıklayınca';
}

const GUNLUK_SUTUNLARI: readonly Sutun<EntegrasyonGunlukSatiri>[] = [
  { anahtar: 'zaman', baslik: 'Zaman', hucre: (g) => zamanMetni(g.zaman), mono: true, kirilmaz: true },
  { anahtar: 'akis', baslik: 'Akış', hucre: (g) => g.akisAdi },
  { anahtar: 'yon', baslik: 'Yön', hucre: (g) => GUNLUK_YON_ADI[g.yon] },
  { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (g) => (g.sonuc === 'tamam' ? <Rozet ton="tamam">Tamam</Rozet> : <Rozet ton="hata">Hata</Rozet>) },
  { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (g) => [g.sayi === null ? null : `${g.sayi.toLocaleString('tr-TR')} kayıt`, g.ileti].filter(Boolean).join(' · ') || '—' },
];

function Gunluk({ kok, akis, baslik }: { kok: string; akis?: string; baslik: string }) {
  const [yalnizHata, setYalnizHata] = useState(false);
  const g = useInfiniteQuery({
    queryKey: [...anahtar(kok), 'gunluk', akis ?? null, yalnizHata],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams();
      if (akis !== undefined) p.set('akis', akis);
      if (yalnizHata) p.set('yalnizHata', 'evet');
      if (pageParam !== null) p.set('once', String(pageParam));
      const q = p.toString();
      return api.get<EntegrasyonGunlukCevabi>(`${kok}/yonetim/gunluk${q === '' ? '' : `?${q}`}`);
    },
    getNextPageParam: (son) => (son.dahaVar ? (son.satirlar.at(-1)?.id ?? null) : null),
  });
  const satirlar = g.data?.pages.flatMap((s) => s.satirlar) ?? [];
  return (
    <div className="tc-ey-gunluk">
      <div className="tc-ey-gunluk-ust">
        <h3 className="tc-ey-altbaslik"><Simge ad="list" />{baslik}</h3>
        <Secim
          etiket="Süzgeç"
          value={yalnizHata ? 'hata' : 'hepsi'}
          onChange={(e) => setYalnizHata(e.target.value === 'hata')}
          secenekler={[{ deger: 'hepsi', baslik: 'Hepsi' }, { deger: 'hata', baslik: 'Yalnız hatalar' }]}
        />
      </div>
      {g.isPending && <DurumKutusu durum="yukleniyor" />}
      {g.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(g.error, 'Günlük alınamadı')} yenile={() => { void g.refetch(); }} />}
      {g.data && (satirlar.length === 0
        ? <p className="tc-ey-not">Kayıt yok. Günlük 30 gün saklanır.</p>
        : <Tablo etiket={baslik} sutunlar={GUNLUK_SUTUNLARI} satirlar={satirlar} satirAnahtari={(s) => String(s.id)} />)}
      {g.hasNextPage && <Dugme yukleniyor={g.isFetchingNextPage} onClick={() => { void g.fetchNextPage(); }}>Daha eski</Dugme>}
    </div>
  );
}

export function EntegrasyonYonetimi({ ad, kok }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazabilir = useOturum().data?.islemler.includes('ayarlar.yaz') === true;
  const [secili, setSecili] = useState<string | null>(null);
  const [kesOnayi, setKesOnayi] = useState(false);
  const ayrintiRef = useRef<HTMLElement>(null);
  const ilkSecim = useRef(true);

  const y = useQuery({
    queryKey: anahtar(kok),
    queryFn: () => api.get<EntegrasyonYonetimiCevabi>(`${kok}/yonetim`),
    refetchInterval: 30_000,
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtar(kok) });

  // Ekranın gördüğü değer `beklenen` gider; başka yönetici arada değiştirdiyse 409 gelir ve ekran yenilenir.
  const ayar = useMutation({
    mutationFn: ({ anahtar: a, deger, beklenen }: { anahtar: string; deger: boolean | string; beklenen: boolean | string | null }) =>
      api.post(`/ayarlar/${encodeURIComponent(a)}/degistir`, { deger, beklenen } satisfies AyarDegistirGovdesi),
    onSuccess: () => { bildir('tamam', 'Ayar kaydedildi.'); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Ayar kaydedilemedi.')); },
    onSettled: () => { void yenile(); },
  });
  const simdiOku = useMutation({
    mutationFn: (a: string) => api.post<EntegrasyonKomutCevabi>(`${kok}/yonetim/akislar/${encodeURIComponent(a)}/simdi-oku`, {}),
    onSuccess: (c) => { bildir('tamam', c.ileti); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Okuma başlatılamadı.')); },
    onSettled: () => { void yenile(); },
  });
  const test = useMutation({
    mutationFn: () => api.get<EntegrasyonKomutCevabi>(`${kok}/yonetim/baglanti-testi`),
    onSuccess: (c) => { bildir(c.sonuc === 'tamam' ? 'tamam' : 'hata', c.ileti); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Bağlantı denenemedi.')); },
    onSettled: () => { void yenile(); },
  });

  const d = y.data;
  const akislar = d?.akislar ?? [];
  const a = akislar.find((x) => x.anahtar === secili) ?? akislar[0];

  // Dar ekranda liste üstte, ayrıntı altta: listeden seçince sayfa ayrıntıya kayar (ilk açılışta kaymaz).
  useEffect(() => {
    if (ilkSecim.current) { ilkSecim.current = false; return; }
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 1279px)').matches) return;
    ayrintiRef.current?.scrollIntoView?.({ block: 'start' });
  }, [secili]);

  if (y.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (y.isError || !d) return <DurumKutusu durum="hata" mesaj={hataIletisi(y.error, 'Durum alınamadı')} yenile={() => { void y.refetch(); }} />;

  const b = d.baglanti;
  const durum: { metin: string; ton: RozetTonu } = !b.tanimli
    ? { metin: 'Adres tanımlı değil', ton: 'uyari' }
    : b.acik ? { metin: 'Açık', ton: 'tamam' } : { metin: 'Kesik', ton: 'pasif' };
  const okumalar = akislar.filter((x) => x.yon === 'okuma');
  const yazmalar = akislar.filter((x) => x.yon === 'yazma');
  const bekleyen = yazmalar.reduce<number | null>((t, x) => (x.bekleyen === null ? t : (t ?? 0) + x.bekleyen), null);
  const ayarKilidi = !yazabilir || ayar.isPending;

  return (
    <div className="tc-ey">
      <Kart
        baslik={`${ad} bağlantısı`}
        simge="bolt"
        baslikEki={<Rozet ton={durum.ton}>{durum.metin}</Rozet>}
        sag={<Dugme simge="rotate" aria-label="Yenile" yukleniyor={y.isFetching} onClick={() => { void y.refetch(); }} />}
      >
        <div className="tc-ey-baglanti">
          <dl className="tc-ey-alanlar">
            <div><dt>Karşı uç</dt><dd>{b.karsiUc}</dd></div>
            <div><dt>Adres ve anahtar</dt><dd>{b.tanimli ? 'Sunucu ayarında tanımlı' : 'Sunucu ayarında tanımlı değil'}</dd></div>
            <div>
              <dt>Son test</dt>
              <dd>{b.sonTest === null ? '—' : <>{zamanMetni(b.sonTest.zaman)} <Rozet ton={b.sonTest.sonuc === 'tamam' ? 'tamam' : 'hata'}>{b.sonTest.sonuc === 'tamam' ? 'Tamam' : 'Hata'}</Rozet></>}</dd>
            </div>
          </dl>
          {b.sonTest?.ileti && <p className="tc-ey-not">{b.sonTest.ileti}</p>}
          <p className="tc-ey-ozet" role="status">
            <span>{okumalar.filter((x) => x.acik).length}/{okumalar.length} okuma açık</span>
            <span>{yazmalar.filter((x) => x.acik).length}/{yazmalar.length} yazma açık</span>
            {bekleyen !== null && <span>{bekleyen} gönderim bekliyor</span>}
            <span className={d.bugunHata > 0 ? 'tc-ey-hata' : undefined}>{d.bugunHata} hata bugün</span>
          </p>
          {yazabilir && (
            <div className="tc-ey-dugmeler">
              <Dugme simge="gauge" yukleniyor={test.isPending} disabled={!b.acik || !b.tanimli} onClick={() => test.mutate()}>Bağlantıyı test et</Dugme>
              {b.acik
                ? <Dugme tur="tehlike" simge="x" disabled={ayarKilidi} onClick={() => setKesOnayi(true)}>Bağlantıyı kes</Dugme>
                : <Dugme simge="bolt" disabled={ayarKilidi} onClick={() => ayar.mutate({ anahtar: b.anaAyar, deger: true, beklenen: false })}>Bağlantıyı aç</Dugme>}
            </div>
          )}
          <p className="tc-ey-not">Adres ve anahtar ekrandan değişmez; sunucu ayarındadır.</p>
        </div>
      </Kart>
      <OnayPenceresi
        acik={kesOnayi}
        baslik={`${ad} bağlantısı kesilsin mi?`}
        onayMetni="Evet, kes"
        tehlikeli
        yukleniyor={ayar.isPending}
        vazgec={() => setKesOnayi(false)}
        onayla={() => ayar.mutate({ anahtar: b.anaAyar, deger: false, beklenen: true }, { onSettled: () => setKesOnayi(false) })}
      >
        <p>Okumalar ve yazmalar durur; kayıtlar kuyrukta bekler. Geri açmak için aynı yerde "Bağlantıyı aç" çıkar.</p>
      </OnayPenceresi>

      <div className="tc-ey-ikili">
        <Kart baslik="Akışlar" simge="layers">
          <div className="tc-ey-liste">
            {GRUPLAR.map((grup) => {
              const ogeler = akislar.filter((x) => x.yon === grup.yon);
              if (ogeler.length === 0) return null;
              return (
                <div key={grup.yon} className="tc-ey-grup" role="group" aria-label={grup.baslik}>
                  <h3 className="tc-ey-altbaslik"><Simge ad={grup.simge} />{grup.baslik}</h3>
                  {ogeler.map((x) => {
                    const r = akisRozeti(x);
                    return (
                      <button
                        key={x.anahtar}
                        type="button"
                        className="tc-ey-satir"
                        aria-pressed={x.anahtar === a?.anahtar}
                        onClick={() => setSecili(x.anahtar)}
                      >
                        <span className="tc-ey-satir-ad"><b>{x.ad}</b><small>{akisAlti(x)}</small></span>
                        <Rozet ton={r.ton}>{r.metin}</Rozet>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Kart>
        {a && (
          <section ref={ayrintiRef} className="tc-ey-ayrinti" aria-label={`${a.ad} ayrıntısı`}>
            <Kart baslik={a.ad} simge={a.yon === 'yazma' ? 'up' : 'down'} baslikEki={<Rozet ton={akisRozeti(a).ton}>{akisRozeti(a).metin}</Rozet>}>
              <div className="tc-ey-ayrinti-ic">
                <dl className="tc-ey-alanlar">
                  <div><dt>Yön</dt><dd>{a.yon === 'yazma' ? `CORE → ${ad}` : `${ad} → CORE (yalnız okur)`}</dd></div>
                  <div><dt>{ad}’da</dt><dd>{a.ne}</dd></div>
                  {a.yon === 'okuma' && <div><dt>Sonraki okuma</dt><dd>{a.okunuyor ? 'Şimdi' : a.sonrakiTur === null ? '—' : zamanMetni(a.sonrakiTur)}</dd></div>}
                  {a.yon === 'yazma' && a.bekleyen !== null && <div><dt>Bekleyen</dt><dd>{a.bekleyen}</dd></div>}
                  <div><dt>Son</dt><dd>{a.son === null ? '—' : `${zamanMetni(a.son.zaman)}${a.son.ileti ? ` · ${a.son.ileti}` : ''}`}</dd></div>
                </dl>
                <div className="tc-ey-ayarlar">
                  {a.acikAyari !== null
                    ? <AcKapa etiket={`${a.ad} açık`} acik={a.acik} disabled={ayarKilidi} degistir={(acik) => ayar.mutate({ anahtar: a.acikAyari!, deger: acik, beklenen: a.acik })} />
                    : <p className="tc-ey-not">Bu akış yalnız bağlantı anahtarıyla açılır.</p>}
                  {a.siklikAyari !== null && a.siklikSecenekleri.length > 0 && (
                    <Secim
                      etiket="Sıklık"
                      value={a.siklik ?? ''}
                      disabled={ayarKilidi || !a.acik}
                      ipucu={a.acik ? undefined : 'Önce açın'}
                      onChange={(e) => ayar.mutate({ anahtar: a.siklikAyari!, deger: e.target.value as OkumaSikligi, beklenen: a.siklik })}
                      secenekler={a.siklikSecenekleri.map((s) => ({ deger: s, baslik: SIKLIK_ETIKETI[s] }))}
                    />
                  )}
                  {a.yon === 'okuma' && yazabilir && (
                    <div className="tc-ey-dugmeler">
                      <Dugme
                        tur="birincil"
                        simge="play"
                        disabled={!a.simdiOkunabilir || a.okunuyor}
                        yukleniyor={simdiOku.isPending && simdiOku.variables === a.anahtar}
                        onClick={() => simdiOku.mutate(a.anahtar)}
                      >
                        Şimdi oku
                      </Dugme>
                      {!a.acik && <span className="tc-ey-not">Önce açın</span>}
                    </div>
                  )}
                  {a.yon === 'yazma' && <p className="tc-ey-not">Yazmalar kayıt oluştuğunda gider (kuyruk); sıklık yoktur. Kapalıyken kayıt bekler, açılınca gider.</p>}
                  {a.yon === 'istek' && <p className="tc-ey-not">Yalnız bir ekranda tıklayınca gider; sıklık yoktur.</p>}
                </div>
                <Gunluk kok={kok} akis={a.anahtar} baslik="Bu akışın günlüğü" />
              </div>
            </Kart>
          </section>
        )}
      </div>

      <Kart baslik="Akış günlüğü" simge="list">
        <Gunluk kok={kok} baslik="Bütün akışlar" />
      </Kart>
    </div>
  );
}
