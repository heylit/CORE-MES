import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Secim, Simge } from '../../ortak/arayuz/index.ts';
import type { Secenek } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ONEK, yerelDegerler } from './yeni/veri.ts';
import type { MakineOzeti } from './yeni/sahne/model-uret.ts';
import { belgeAdi, kucukResimUret, mevcutEslesmeler, modeliCizimlereAktar, yayinlaVeEslestir } from './model-aktarimi.ts';
import type { AktarilacakModel, MevcutEslesme } from './model-aktarimi.ts';
import './cnc-kurulum.css';

// Çizim Merkezi'nin CNC makineleri sayfası (kart #1196, #1238): CNC Kurulum'un makineleri Çizim Merkezi'nde listelenir, her biri sistemdeki
// istasyonla eşleştirilir. Eşleştirmede model 3B model belgesi olarak yazılır, yayına alınır ve istasyona bağlanır; fabrika haritasına
// yalnız eşleşen makine eklenebilir. Satır makinenin Çizim Merkezi'ndeki son durumunu gösterir.
// Modeli CNC Kurulum ekranının sahnesi üretir (1135 a); sayfa kayıtları yalnız okur. Sahne kodu üç boyut kütüphanesini taşıdığı
// için sayfa açılınca ayrıca yüklenir.
const DURUM_ANAHTARI = `${ONEK}v1`;
const sahneYukle = () => import('./yeni/sahne/model-uret.ts');
export const ESLESTIRME_YOLU = '/cizimler/cnc-makineleri';
const OKUMA_ISLEMLERI = ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz'];
const AKTARMA_ISLEMI = 'belge-merkezi.yaz';
const YAYIN_ISLEMI = 'belge-merkezi.yayinla';
// "Sistemdeki makine" listesi istasyon kayıtlarıdır; tezgâh orada yoksa istasyon İstasyonlar ekranında açılır.
const ISTASYON_SAYFASI = { islem: 'sayfa.istasyonlar', yol: '/istasyonlar/is-merkezleri' } as const;

interface Satir { secili: boolean; istasyonId: number | null; sonuc: { ton: 'tamam' | 'hata' | 'suruyor'; metin: string } | null }
type Uretici = Awaited<ReturnType<typeof sahneYukle>>;

// Sahnenin bildirdiği model hatası; iletisi kullanıcıya olduğu gibi gösterilir (sunucu hatası değildir).
class ModelHatasi extends Error {}

const kodu = (k: string): string => k.trim().toLocaleUpperCase('tr');

function durumMetni(d: MevcutEslesme | undefined, istasyonAdi: ReadonlyMap<number, string>): string {
  if (d === undefined) return 'Çizim Merkezi\'nde modeli yok, eşleşmedi.';
  if (d.istasyonId === null) return 'Çizim Merkezi\'nde modeli var, eşleşmedi; haritaya eklenemez.';
  const ad = istasyonAdi.get(d.istasyonId) ?? 'sistemdeki makine';
  return d.yayinda ? `Eşleşti: ${ad}. Haritaya eklenebilir.` : `Eşleşti: ${ad}. Çizim yayınlanınca haritaya eklenebilir.`;
}

// Makine numarası bir istasyonun koduyla aynıysa o istasyon önerilir (atölyede tezgâh numarası istasyon kodudur).
export function onerilenIstasyon(no: string | null, gruplar: IstasyonSecimiCevabi['gruplar']): number | null {
  if (no === null) return null;
  for (const g of gruplar) for (const i of g.istasyonlar) if (kodu(i.kod) === kodu(no)) return i.id;
  return null;
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
  const secenekler = useMemo<Secenek[]>(
    () => (istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.map((i) => ({ deger: String(i.id), baslik: `${i.kod} - ${i.ad}` }))),
    [istasyonlar.data],
  );
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

  // Elle eklenen makineler ve düzeltmeler kayıtlardadır; liste onlarla kurulur.
  useEffect(() => {
    if (!girebilir || !aktarabilir) return;
    let bitti = false;
    void (async () => {
      try {
        await api.get<BenCevabi>('/cnc-kurulum/ben');
        const kayitlar = await api.get<KayitlarCevabi>('/cnc-kurulum/kayitlar');
        if (!bitti) setDegerler(yerelDegerler(kayitlar));
      } catch (e) {
        if (!bitti) setHata(hataIletisi(e, 'CNC Kurulum kayıtları okunamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [girebilir, aktarabilir]);

  const kayitMetni = degerler?.[DURUM_ANAHTARI]?.deger;
  useEffect(() => {
    if (uretici === null || degerler === null) return;
    setMakineler(uretici.makineListesi(kayitMetni));
  }, [uretici, degerler, kayitMetni]);

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

  // Seçim yalnız henüz yazılmamış satıra konur: önce var olan eşleşme, yoksa aynı kodlu istasyon. Kullanıcının seçimi korunur.
  useEffect(() => {
    if (makineler === null || mevcut === null) return;
    const gruplar = istasyonlar.data?.gruplar ?? [];
    setSatirlar((once) => Object.fromEntries(makineler.map((m) => {
      const s = once[m.makineId];
      const istasyonId = mevcut.get(belgeAdi(m))?.istasyonId ?? onerilenIstasyon(m.no, gruplar);
      return [m.makineId, s ?? { secili: m.makineId === gelenMakine, istasyonId, sonuc: null }];
    })));
  }, [makineler, mevcut, istasyonlar.data, gelenMakine]);

  const modelIste = async (makineId: string): Promise<AktarilacakModel> => {
    if (uretici === null) throw new ModelHatasi('CNC Kurulum Motoru henüz hazır değil.');
    try { return uretici.modelUret(makineId, kayitMetni); } catch (e) {
      throw new ModelHatasi(e instanceof Error ? e.message : 'Model üretilemedi.');
    }
  };

  const satirYaz = (id: string, d: Partial<Satir>) => { setSatirlar((once) => ({ ...once, [id]: { ...(once[id] ?? { secili: false, istasyonId: null, sonuc: null }), ...d } })); };

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
        if (s.istasyonId !== null) {
          yayinda = (await yayinlaVeEslestir(a, s.istasyonId, yayinlayabilir)).yayinda;
          // Küçük resim eşleşmenin parçası değildir: üretilemezse bağ ve yayın geri alınmaz, yalnız satıra yazılır.
          try {
            if (yayinda && await kucukResimUret(a, model.glb) === 'uretildi') resim = '; küçük resim hazır';
          } catch (h) { resim = `; küçük resim üretilemedi (${h instanceof Error ? h.message : 'bilinmeyen hata'})`; }
        }
        const ilk = a.sonuc === 'yeni' ? 'Yeni belge' : a.sonuc === 'revizyon' ? 'Yeni revizyon' : 'Zaten güncel';
        const son = s.istasyonId === null
          ? 'sistemdeki makineyle eşleşmedi, haritaya eklenemez'
          : (yayinda ? 'eşleşti, haritanın Ekle listesinde' : 'eşleşti; çizim yayınlanınca haritaya eklenir') + resim;
        const ad = belgeAdi(m);
        setMevcut((once) => new Map(once ?? []).set(ad, { belgeId: a.belgeId, yayinda, istasyonId: s.istasyonId ?? once?.get(ad)?.istasyonId ?? null }));
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
  const hepsi = makineler !== null && makineler.length > 0 && seciliSayisi === makineler.length;
  return (
    <section className="tc-cnc-aktarim" aria-label="CNC makineleri">
      <header className="tc-cnc-aktarim-ust">
        <div>
          <h1><Simge ad="rotate" /> CNC makineleri</h1>
          <p className="tc-cnc-aktarim-ipucu">
            CNC Kurulum Motoru'ndaki makineler. Makineyi işaretleyip sistemdeki makineyle eşleştirin; eşleşen modelin çizimi yayına alınır. Fabrika Haritası'na yalnız eşleşen makine eklenebilir.
            {' "Sistemdeki makine" listesi İstasyonlar\'daki kayıtlardır; aynı kodlu istasyon kendiliğinden seçilir.'}
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
          ? <DurumKutusu durum="bos" mesaj="CNC Kurulum Motoru'nda makine yok" />
          : (
            <ul className="tc-cnc-aktarim-liste">
              <li className="tc-cnc-aktarim-hepsi">
                <IsaretKutusu
                  etiket="Tümünü seç"
                  checked={hepsi}
                  disabled={calisiyor}
                  onChange={(e) => { const v = e.target.checked; setSatirlar((once) => Object.fromEntries(Object.entries(once).map(([k, s]) => [k, { ...s, secili: v }]))); }}
                />
              </li>
              {makineler.map((m) => {
                const s = satirlar[m.makineId];
                const durum = mevcut?.get(belgeAdi(m));
                return (
                  <li key={m.makineId} className="tc-cnc-aktarim-satir">
                    <IsaretKutusu etiket={belgeAdi(m)} checked={s?.secili ?? false} disabled={calisiyor} onChange={(e) => { satirYaz(m.makineId, { secili: e.target.checked }); }} />
                    <Secim
                      etiket="Sistemdeki makine"
                      bosSecenek="Eşleştirme yok"
                      secenekler={secenekler}
                      value={s?.istasyonId === null || s === undefined ? '' : String(s.istasyonId)}
                      disabled={calisiyor || istasyonlar.isPending}
                      onChange={(e) => { satirYaz(m.makineId, { istasyonId: e.target.value === '' ? null : Number(e.target.value) }); }}
                    />
                    {s?.secili && s.istasyonId === null && istasyonlar.isSuccess && (
                      <p className="tc-cnc-aktarim-sonuc" role="note">
                        <Simge ad="cpu" boyut="k" />
                        {m.no === null
                          ? 'Haritaya eklenebilmesi için sistemdeki makineyi seçin; listede yoksa İstasyonlar ekranında açın.'
                          : `Haritaya eklenebilmesi için sistemdeki makineyi seçin; listede yoksa İstasyonlar ekranında ${m.no} koduyla açın, burada kendiliğinden seçilir.`}
                        {istasyonAcabilir && <> <Link to={ISTASYON_SAYFASI.yol}>İstasyonlar</Link></>}
                      </p>
                    )}
                    {!s?.sonuc && mevcut !== null && (
                      <p className="tc-cnc-aktarim-sonuc" data-ton={durum?.istasyonId ? 'tamam' : undefined}>
                        <Simge ad={durum?.istasyonId ? 'check' : 'cube'} boyut="k" />{durumMetni(durum, istasyonAdi)}
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
      {istasyonlar.isSuccess && secenekler.length === 0 && (
        <p className="tc-cnc-aktarim-ipucu" role="alert">
          Sistemde istasyon kaydı yok; modeller eşleştirmesiz yazılır ve haritaya eklenemez. Tezgâhları önce İstasyonlar ekranında açın.
          {istasyonAcabilir && <> <Link to={ISTASYON_SAYFASI.yol}>İstasyonlar</Link></>}
        </p>
      )}
      {istasyonlar.isError && <p className="tc-cnc-aktarim-ipucu" role="alert">Sistemdeki makine listesi alınamadı; modeller eşleştirmesiz yazılır.</p>}
    </section>
  );
}
