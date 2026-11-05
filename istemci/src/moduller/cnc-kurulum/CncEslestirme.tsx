import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { BenCevabi, KayitlarCevabi, Tezgah, TezgahlarCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ONEK, yerelDegerler } from './yeni/veri.ts';
import type { MakineOzeti } from './yeni/sahne/model-uret.ts';
import { belgeAdi, kucukResimUret, mevcutEslesmeler, modeliCizimlereAktar, yayinlaVeEslestir } from './model-aktarimi.ts';
import type { AktarilacakModel, MevcutEslesme } from './model-aktarimi.ts';
import './cnc-kurulum.css';

// Çizim Merkezi'nin CNC makineleri sayfası (kart #1196, #1238): CNC Kurulum'un makineleri Çizim Merkezi'nde listelenir. Makineler İstasyonlar'ın
// aktif CNC makine kayıtlarıdır (1986, 1988 b), kurulumdaki ayar ve katalog modeliyle; gömülü liste kullanılmaz. Ayarı eksik makine listede görünür,
// işaretlenemez. Eşleştirmede model 3B model belgesi olarak yazılır, yayına alınır ve makinenin İstasyonlar'daki istasyonuna bağlanır. Makine-istasyon
// bağının tek kaynağı İstasyonlar'dır (2126-1 a): burada istasyon seçilmez; istasyonu olmayan makine bağlanmaz, İstasyonlar'a yönlendirilir.
// Satır makinenin Çizim Merkezi'ndeki son durumunu gösterir.
// Modeli CNC Kurulum ekranının sahnesi üretir (1135 a); sayfa kayıtları yalnız okur. Sahne kodu üç boyut kütüphanesini taşıdığı
// için sayfa açılınca ayrıca yüklenir.
const DURUM_ANAHTARI = `${ONEK}v1`;
const sahneYukle = () => import('./yeni/sahne/model-uret.ts');
export const ESLESTIRME_YOLU = '/cizimler/cnc-makineleri';
const OKUMA_ISLEMLERI = ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz'];
const AKTARMA_ISLEMI = 'belge-merkezi.yaz';
const YAYIN_ISLEMI = 'belge-merkezi.yayinla';
// Makinenin istasyonu İstasyonlar ekranında seçilir.
const ISTASYON_SAYFASI = { islem: 'sayfa.istasyonlar', yol: '/istasyonlar/is-merkezleri' } as const;

interface Satir { secili: boolean; sonuc: { ton: 'tamam' | 'hata' | 'suruyor'; metin: string } | null }
type Uretici = Awaited<ReturnType<typeof sahneYukle>>;

// Sahnenin bildirdiği model hatası; iletisi kullanıcıya olduğu gibi gösterilir (sunucu hatası değildir).
class ModelHatasi extends Error {}

// İstasyon adı yalnız gösterim içindir; liste okunamazsa ya da istasyon seçim listesinde yoksa genel ad yazılır.
export const istasyonGosterimi = (id: number, istasyonAdi: ReadonlyMap<number, string>): string => istasyonAdi.get(id) ?? 'İstasyonlar\'daki istasyon';

export function durumMetni(d: MevcutEslesme | undefined, istasyonId: number | null, istasyonAdi: ReadonlyMap<number, string>): string {
  if (d === undefined) return 'Çizim Merkezi\'nde modeli yok, eşleşmedi.';
  if (d.istasyonId === null) return 'Çizim Merkezi\'nde modeli var, eşleşmedi; haritaya eklenemez.';
  const ad = istasyonGosterimi(d.istasyonId, istasyonAdi);
  if (istasyonId !== null && d.istasyonId !== istasyonId) {
    return `Model ${ad} istasyonuna bağlı; İstasyonlar'daki istasyonu farklı. Eşleştirince ${istasyonGosterimi(istasyonId, istasyonAdi)} istasyonuna taşınır.`;
  }
  return d.yayinda ? `Eşleşti: ${ad}. Haritaya eklenebilir.` : `Eşleşti: ${ad}. Çizim yayınlanınca haritaya eklenebilir.`;
}

export function CncEslestirme() {
  const oturum = useOturum();
  const kullanici = oturum.data;
  const girebilir = kullanici?.islemler.some((i) => OKUMA_ISLEMLERI.includes(i)) ?? false;
  const aktarabilir = kullanici?.islemler.includes(AKTARMA_ISLEMI) ?? false;
  const yayinlayabilir = kullanici?.islemler.includes(YAYIN_ISLEMI) ?? false;
  const istasyonAcabilir = kullanici?.islemler.includes(ISTASYON_SAYFASI.islem) ?? false;
  // Ana sayfadaki düğme prototipte seçili tezgâhı verir; o satır işaretli gelir.
  const [arama] = useSearchParams();
  const gelenMakine = arama.get('makine');
  const [degerler, setDegerler] = useState<ReturnType<typeof yerelDegerler> | null>(null);
  const [tezgahlar, setTezgahlar] = useState<readonly Tezgah[] | null>(null);
  const [uretici, setUretici] = useState<Uretici | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [makineler, setMakineler] = useState<MakineOzeti[] | null>(null);
  const [satirlar, setSatirlar] = useState<Record<string, Satir>>({});
  const [calisiyor, setCalisiyor] = useState(false);
  const [mevcut, setMevcut] = useState<Map<string, MevcutEslesme> | null>(null);

  const istasyonlar = useQuery({
    queryKey: ['cnc-kurulum', 'istasyon-secimi'],
    queryFn: () => api.get<IstasyonSecimiCevabi>('/istasyonlar/secim'),
    enabled: aktarabilir,
  });
  const istasyonAdi = useMemo(
    () => new Map((istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.map((i) => [i.id, `${i.kod} - ${i.ad}`] as const))),
    [istasyonlar.data],
  );

  useEffect(() => {
    if (!aktarabilir) return;
    let bitti = false;
    void sahneYukle().then(
      (u) => { if (!bitti) setUretici(u); },
      () => { if (!bitti) setHata('CNC Kurulum Motoru yüklenemedi. Sayfayı yenileyin.'); },
    );
    return () => { bitti = true; };
  }, [aktarabilir]);

  // Makineler sunucudan, düzeltmeler (`mo`) kayıtlardan gelir; liste ikisiyle kurulur.
  useEffect(() => {
    if (!girebilir || !aktarabilir) return;
    let bitti = false;
    void (async () => {
      try {
        await api.get<BenCevabi>('/cnc-kurulum/ben');
        const [kayitlar, t] = await Promise.all([
          api.get<KayitlarCevabi>('/cnc-kurulum/kayitlar'),
          api.get<TezgahlarCevabi>('/cnc-kurulum/tezgahlar'),
        ]);
        if (!bitti) { setDegerler(yerelDegerler(kayitlar)); setTezgahlar(t.tezgahlar); }
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'CNC Kurulum kayıtları okunamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [girebilir, aktarabilir]);

  const kayitMetni = degerler?.[DURUM_ANAHTARI]?.deger;
  useEffect(() => {
    if (uretici === null || degerler === null || tezgahlar === null) return;
    setMakineler(uretici.makineListesi(tezgahlar, kayitMetni));
  }, [uretici, degerler, tezgahlar, kayitMetni]);

  // Çizim Merkezi'ndeki durum makine listesi gelince bir kez okunur; okunamazsa satırlar durumsuz kalır, eşleştirme yine yapılır.
  useEffect(() => {
    if (makineler === null) return;
    let bitti = false;
    mevcutEslesmeler(makineler.map(belgeAdi)).then(
      (m) => { if (!bitti) setMevcut(m); },
      () => { if (!bitti) setMevcut(new Map()); },
    );
    return () => { bitti = true; };
  }, [makineler]);

  // Satır yalnız bir kez kurulur; kullanıcının işareti korunur.
  useEffect(() => {
    if (makineler === null || mevcut === null) return;
    setSatirlar((once) => Object.fromEntries(makineler.map((m) => [m.makineId, once[m.makineId] ?? { secili: !m.eksik && m.makineId === gelenMakine, sonuc: null }])));
  }, [makineler, mevcut, gelenMakine]);

  const modelIste = async (makineId: string): Promise<AktarilacakModel> => {
    if (uretici === null || tezgahlar === null) throw new ModelHatasi('CNC Kurulum Motoru henüz hazır değil.');
    try { return uretici.modelUret(makineId, tezgahlar, kayitMetni); } catch (e) {
      throw new ModelHatasi(e instanceof Error ? e.message : 'Model üretilemedi.');
    }
  };

  const satirYaz = (id: string, d: Partial<Satir>) => { setSatirlar((once) => ({ ...once, [id]: { ...(once[id] ?? { secili: false, sonuc: null }), ...d } })); };

  // Sırayla: her model ayrı yüklenir (büyük dosya, tek bağlantı); biri başarısız olsa öbürleri sürer.
  const eslestir = async () => {
    if (makineler === null) return;
    setCalisiyor(true);
    for (const m of makineler) {
      const s = satirlar[m.makineId];
      if (!s?.secili) continue;
      satirYaz(m.makineId, { sonuc: { ton: 'suruyor', metin: 'Eşleştiriliyor' } });
      try {
        const model = await modelIste(m.makineId);
        const a = await modeliCizimlereAktar(model);
        let yayinda = a.yayinda;
        let resim = '';
        if (m.istasyonId !== null) {
          yayinda = (await yayinlaVeEslestir(a, m.istasyonId, yayinlayabilir)).yayinda;
          // Küçük resim eşleşmenin parçası değildir: üretilemezse bağ ve yayın geri alınmaz, yalnız satıra yazılır.
          try {
            if (yayinda && await kucukResimUret(a, model.glb) === 'uretildi') resim = '; küçük resim hazır';
          } catch (h) { resim = `; küçük resim üretilemedi (${h instanceof Error ? h.message : 'bilinmeyen hata'})`; }
        }
        const ilk = a.sonuc === 'yeni' ? 'Yeni belge' : a.sonuc === 'revizyon' ? 'Yeni revizyon' : 'Zaten güncel';
        const son = m.istasyonId === null
          ? 'istasyonu olmadığı için eşleşmedi; İstasyonlar\'da istasyon seçin'
          : (yayinda ? 'eşleşti, haritanın Ekle listesinde' : 'eşleşti; çizim yayınlanınca haritaya eklenir') + resim;
        const ad = belgeAdi(m);
        setMevcut((once) => new Map(once ?? []).set(ad, { belgeId: a.belgeId, yayinda, istasyonId: m.istasyonId ?? once?.get(ad)?.istasyonId ?? null }));
        satirYaz(m.makineId, { secili: false, sonuc: { ton: 'tamam', metin: `${ilk}, ${son}.` } });
      } catch (e) {
        satirYaz(m.makineId, { sonuc: { ton: 'hata', metin: e instanceof ModelHatasi ? e.message : hataIletisi(e, 'Eşleştirilemedi.') } });
      }
    }
    setCalisiyor(false);
  };

  if (oturum.isPending) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="yukleniyor" /></div>;
  if (!kullanici || !girebilir) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="hata" mesaj="Bu bölümü görme yetkiniz yok." /></div>;
  if (!aktarabilir) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="hata" mesaj="Çizim Merkezi'nde eşleştirme yetkiniz yok." /></div>;
  if (hata !== null) return <div className="tc-cnc-kurulum-durum"><DurumKutusu durum="hata" mesaj={hata} /></div>;

  const seciliSayisi = Object.values(satirlar).filter((s) => s.secili).length;
  const secilebilir = new Set((makineler ?? []).filter((m) => !m.eksik).map((m) => m.makineId));
  const hepsi = secilebilir.size > 0 && seciliSayisi === secilebilir.size;
  return (
    <section className="tc-cnc-aktarim" aria-label="CNC makineleri">
      <header className="tc-cnc-aktarim-ust">
        <div>
          <h1><Simge ad="rotate" /> CNC makineleri</h1>
          <p className="tc-cnc-aktarim-ipucu">
            İstasyonlar'daki CNC makineleri; ayarı eksik olan CNC Kurulum &gt; Tanımlar'da tamamlanınca işaretlenebilir. İşaretlenen makinenin modeli yayına alınır ve makinenin İstasyonlar'daki istasyonuna bağlanır; istasyon burada seçilmez, İstasyonlar ekranında değişir.
            {istasyonAcabilir && <> <Link to={ISTASYON_SAYFASI.yol}>İstasyonları aç</Link></>}
            {!yayinlayabilir && ' Yayınlama yetkiniz olmadığı için modeller taslak kalır.'}
          </p>
        </div>
        <Dugme tur="birincil" simge="check" yukleniyor={calisiyor} disabled={seciliSayisi === 0 || calisiyor} onClick={() => { void eslestir(); }}>
          {seciliSayisi === 0 ? 'Eşleştir' : `${seciliSayisi} makineyi eşleştir`}
        </Dugme>
      </header>
      {makineler === null
        ? <DurumKutusu durum="yukleniyor" mesaj="CNC makineleri okunuyor" />
        : makineler.length === 0
          ? <DurumKutusu durum="bos" mesaj="İstasyonlar'da aktif CNC makinesi yok." />
          : (
            <ul className="tc-cnc-aktarim-liste">
              <li className="tc-cnc-aktarim-hepsi">
                <IsaretKutusu
                  etiket="Tümünü seç"
                  checked={hepsi}
                  disabled={calisiyor || secilebilir.size === 0}
                  onChange={(e) => { const v = e.target.checked; setSatirlar((once) => Object.fromEntries(Object.entries(once).map(([k, s]) => [k, { ...s, secili: v && secilebilir.has(k) }]))); }}
                />
              </li>
              {makineler.map((m) => {
                const s = satirlar[m.makineId];
                const durum = mevcut?.get(belgeAdi(m));
                return (
                  <li key={m.makineId} className="tc-cnc-aktarim-satir">
                    <IsaretKutusu etiket={belgeAdi(m)} checked={s?.secili ?? false} disabled={calisiyor || m.eksik} onChange={(e) => { satirYaz(m.makineId, { secili: e.target.checked }); }} />
                    {m.istasyonId !== null && (
                      <p className="tc-cnc-aktarim-sonuc"><Simge ad="cpu" boyut="k" />{`İstasyon: ${istasyonGosterimi(m.istasyonId, istasyonAdi)}`}</p>
                    )}
                    {m.eksik && (
                      <p className="tc-cnc-aktarim-sonuc" role="note">
                        <Simge ad="alert" boyut="k" />{'Ayarı eksik; modeli üretilemez. CNC Kurulum > Tanımlar\'da tamamlayın.'}
                      </p>
                    )}
                    {!m.eksik && m.istasyonId === null && (
                      <p className="tc-cnc-aktarim-sonuc" role="note">
                        <Simge ad="cpu" boyut="k" />
                        İstasyonu yok; haritaya eklenebilmesi için İstasyonlar ekranında bu makineye istasyon seçin.
                        {istasyonAcabilir && <> <Link to={ISTASYON_SAYFASI.yol}>İstasyonlar</Link></>}
                      </p>
                    )}
                    {!s?.sonuc && mevcut !== null && (
                      <p className="tc-cnc-aktarim-sonuc" data-ton={durum?.istasyonId && durum.istasyonId === m.istasyonId ? 'tamam' : undefined}>
                        <Simge ad={durum?.istasyonId && durum.istasyonId === m.istasyonId ? 'check' : 'cube'} boyut="k" />{durumMetni(durum, m.istasyonId, istasyonAdi)}
                      </p>
                    )}
                    {s?.sonuc && (
                      <p className="tc-cnc-aktarim-sonuc" data-ton={s.sonuc.ton} role={s.sonuc.ton === 'hata' ? 'alert' : 'status'}>
                        <Simge ad={s.sonuc.ton === 'hata' ? 'alert' : s.sonuc.ton === 'tamam' ? 'check' : 'clock'} boyut="k" />{s.sonuc.metin}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
    </section>
  );
}
