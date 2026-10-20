import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MODEL_AZAMI_BAYT } from '#paylasilan/atolye-sabitleri.ts';
import type { Model, ModelBirimi, ModelKaynakBicimi, YukariEkseni } from '#paylasilan/sozlesme/atolye.ts';
import { DurumKutusu, Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Rozet, Secim, Tablo, useBildirim } from '../../ortak/arayuz/index.ts';
import type { Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { sayiMetni } from './kurallar.ts';
import { dosyaAdindanAd, dosyaBicimi, mbMetni, sha256, varsayilanAyar } from './model-dosyasi.ts';
import { ModelOnizleme } from './ModelOnizleme.tsx';
import type { StepAyrintisi } from './sahne/model-cevir.ts';
import { kalemGorunumuSil, modelDosyasi, modelGonder, useModeller } from './veri.ts';
import { KalemGorunumuFormu } from './KalemGorunumu.tsx';

// 3B model kütüphanesi: gerçek makine ya da parça modeli yüklenir (STEP, STL, GLB, GLTF), önizlenir, ayarlanır; istasyona
// düzenleyiciden, parça numarasına bu pencereden bağlanır. Dosya bu cihazda GLB'ye çevrilir, şirket sunucusunda saklanır.

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  yazabilir: boolean;
}

interface Ayar {
  ad: string;
  birim: ModelBirimi;
  yukari: YukariEkseni;
  donus: number;
  sigdir: boolean;
}

type Yukleme =
  | { asama: 'ceviriyor'; dosya: File; bicim: ModelKaynakBicimi }
  | { asama: 'hazir'; dosya: File; bicim: ModelKaynakBicimi; glb: Uint8Array; ucgen: number }
  | { asama: 'gonderiyor'; dosya: File; bicim: ModelKaynakBicimi; glb: Uint8Array; ucgen: number; oran: number }
  | { asama: 'hata'; dosya: File; bicim: ModelKaynakBicimi; mesaj: string };

const BIRIMLER = [{ deger: 'mm', baslik: 'Milimetre' }, { deger: 'cm', baslik: 'Santimetre' }, { deger: 'm', baslik: 'Metre' }];
const EKSENLER = [{ deger: 'z', baslik: 'Z yukarı (CAD)' }, { deger: 'y', baslik: 'Y yukarı (GLB)' }];
const DONUSLER = [0, 90, 180, 270].map((d) => ({ deger: String(d), baslik: `${d}°` }));
const AYRINTILAR = [{ deger: 'ince', baslik: 'İnce (büyük dosya)' }, { deger: 'orta', baslik: 'Orta' }, { deger: 'kaba', baslik: 'Kaba (küçük dosya)' }];
const KAYNAK_ADI: Record<ModelKaynakBicimi, string> = { step: 'STEP', stl: 'STL', glb: 'GLB', gltf: 'GLTF' };

function AyarAlanlari({ ayar, degistir }: { ayar: Ayar; degistir: (a: Partial<Ayar>) => void }) {
  return (
    <>
      <Girdi etiket="Ad" value={ayar.ad} maxLength={120} onChange={(o) => degistir({ ad: o.target.value })} />
      <div className="tc-atolye-ozellik-ikili">
        <Secim etiket="Dosyanın birimi" secenekler={BIRIMLER} value={ayar.birim} onChange={(o) => degistir({ birim: o.target.value as ModelBirimi })} />
        <Secim etiket="Yukarı eksen" secenekler={EKSENLER} value={ayar.yukari} onChange={(o) => degistir({ yukari: o.target.value as YukariEkseni })} />
      </div>
      <Secim etiket="Dönüş" secenekler={DONUSLER} value={String(ayar.donus)} onChange={(o) => degistir({ donus: Number(o.target.value) })} />
      <IsaretKutusu etiket="Makinenin ayak izine sığdır" checked={ayar.sigdir} onChange={(o) => degistir({ sigdir: o.target.checked })} />
      <p className="tc-atolye-ipucu">
        Sığdırma kapalıysa model gerçek ölçüsüyle durur; ayak izinden büyükse komşu öğeye taşabilir. Önizleme modelin gerçek ölçüsünü gösterir.
      </p>
    </>
  );
}

// Kalem görünümü: modelin bağlı olduğu kodlar (parça no, malzeme kodu). Makinede işlenirken üstünde döner; depoda
// rafta "3B modeliyle" seçiliyse gözlere dizilir.
function KalemBaglari({ model, yazabilir }: { model: Model; yazabilir: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ekle, ekleYaz] = useState(false);
  const [duzenlenen, duzenlenenYaz] = useState<string | null>(null);
  const kaldir = useMutation({
    mutationFn: (kod: string) => kalemGorunumuSil(kod),
    onSuccess: (_c, kod) => {
      bildir('tamam', `${kod} görünümü kaldırıldı.`);
      void istemci.invalidateQueries({ queryKey: anahtarlar.kalemGorunumleri });
      void istemci.invalidateQueries({ queryKey: anahtarlar.modeller });
    },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Görünüm kaldırılamadı.')),
  });
  return (
    <section className="tc-atolye-parca-baglari" aria-label="Kalem görünümü">
      <h4>Parça ve malzeme olarak</h4>
      <p className="tc-atolye-ipucu">Kod üretim emrindeyse model makinenin üstünde döner; depoda stok bu koddaysa rafta paketli ya da modeliyle görünür.</p>
      {model.kalemKodlari.length === 0 ? (
        <p className="tc-atolye-ipucu">Bağlı kod yok.</p>
      ) : (
        <ul>
          {model.kalemKodlari.map((kod) => (
            <li key={kod}>
              <Dugme className="tc-atolye-kalem-kod" onClick={() => duzenlenenYaz((d) => (d === kod ? null : kod))} aria-expanded={duzenlenen === kod}>
                <span className="mono">{kod}</span>
              </Dugme>
              {yazabilir && <Dugme simge="x" aria-label={`${kod} bağını kaldır`} disabled={kaldir.isPending} onClick={() => kaldir.mutate(kod)} />}
            </li>
          ))}
        </ul>
      )}
      {duzenlenen && <KalemGorunumuFormu key={duzenlenen} kod={duzenlenen} yazabilir={yazabilir} bitti={() => duzenlenenYaz(null)} />}
      {yazabilir && !ekle && <Dugme simge="plus" onClick={() => ekleYaz(true)}>Koda bağla</Dugme>}
      {yazabilir && ekle && <KalemGorunumuFormu varsayilanModelId={model.id} yazabilir bitti={() => ekleYaz(false)} />}
    </section>
  );
}

export function ModelKutuphanesi({ acik, kapat, yazabilir }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const modeller = useModeller(acik);
  const dosyaGirdisi = useRef<HTMLInputElement>(null);
  // Kart kapanınca odaklı düğme kaybolur; odak pencerede kalsın ki Escape pencereyi kapatsın.
  const govde = useRef<HTMLDivElement>(null);
  const odakKoru = () => requestAnimationFrame(() => { if (!govde.current?.contains(document.activeElement)) govde.current?.focus(); });
  const [yukleme, yuklemeYaz] = useState<Yukleme | null>(null);
  const [ayar, ayarYaz] = useState<Ayar>({ ad: '', birim: 'mm', yukari: 'z', donus: 0, sigdir: true });
  const [ayrinti, ayrintiYaz] = useState<StepAyrintisi>('orta');
  const [secili, seciliYaz] = useState<Model | null>(null);
  const [seciliGlb, seciliGlbYaz] = useState<Uint8Array | null>(null);
  const [silinecek, silinecekYaz] = useState<Model | null>(null);

  const yenile = () => void istemci.invalidateQueries({ queryKey: anahtarlar.modeller });

  // Dosya seçilince ya da STEP ayrıntısı değişince bu cihazda GLB'ye çevrilir.
  const cevir = async (dosya: File, bicim: ModelKaynakBicimi, a: StepAyrintisi) => {
    yuklemeYaz({ asama: 'ceviriyor', dosya, bicim });
    try {
      const { dosyaCevir } = await import('./sahne/model-cevir.ts');
      const d = await dosyaCevir(dosya, bicim, a);
      if (d.glb.length > MODEL_AZAMI_BAYT) {
        yuklemeYaz({
          asama: 'hata', dosya, bicim,
          mesaj: `Çevrilen model ${mbMetni(d.glb.length)}; sınır ${mbMetni(MODEL_AZAMI_BAYT)}.${bicim === 'step' ? ' Üçgenleme ayrıntısını "Kaba" seçin.' : ' Modeli sadeleştirip yeniden deneyin.'}`,
        });
        return;
      }
      yuklemeYaz({ asama: 'hazir', dosya, bicim, glb: d.glb, ucgen: d.ucgen });
    } catch (hata) {
      yuklemeYaz({ asama: 'hata', dosya, bicim, mesaj: hata instanceof Error ? hata.message : 'Dosya çevrilemedi.' });
    }
  };

  const dosyaSecildi = (dosya: File | undefined) => {
    if (!dosya) return;
    const bicim = dosyaBicimi(dosya.name);
    if (!bicim) {
      bildir('hata', 'Yalnız STEP (.step, .stp), STL, GLB ve GLTF yüklenir.');
      return;
    }
    seciliYaz(null);
    ayarYaz({ ad: dosyaAdindanAd(dosya.name), ...varsayilanAyar(bicim), donus: 0, sigdir: true });
    void cevir(dosya, bicim, ayrinti);
  };

  const gonder = useMutation({
    mutationFn: async () => {
      if (yukleme?.asama !== 'hazir') throw new Error('Yüklenecek model yok.');
      const y = yukleme;
      const ozet = await sha256(y.glb);
      return modelGonder(
        { ad: ayar.ad.trim() || 'Model', birim: ayar.birim, yukari: ayar.yukari, donus: ayar.donus, sigdir: ayar.sigdir, kaynakBicim: y.bicim, boyutBayt: y.glb.length, ozet, ucgenSayisi: y.ucgen },
        y.glb,
        (oran) => yuklemeYaz({ ...y, asama: 'gonderiyor', oran }),
      );
    },
    onSuccess: (m) => {
      bildir('tamam', `${m.ad} yüklendi. Düzenleyicide makineyi seçip modeli atayın.`);
      yuklemeYaz(null);
      yenile();
      odakKoru();
    },
    onError: (hata) => {
      bildir('hata', hataIletisi(hata, 'Model yüklenemedi.'));
      if (yukleme && yukleme.asama === 'gonderiyor') yuklemeYaz({ ...yukleme, asama: 'hazir' });
    },
  });

  // Kayıtlı model seçilince dosyası indirilir (önbellekte varsa yeniden indirilmez), ayarı forma gelir.
  useEffect(() => {
    seciliGlbYaz(null);
    if (!secili || !secili.tamam) return undefined;
    let iptal = false;
    modelDosyasi(secili).then((g) => { if (!iptal) seciliGlbYaz(g); }, () => { if (!iptal) bildir('hata', 'Model dosyası indirilemedi.'); });
    return () => { iptal = true; };
  }, [secili, bildir]);

  const ayarla = useMutation({
    mutationFn: (m: Model) => api.post<Model>(`/atolye/modeller/${m.id}/ayarla`, {
      surum: m.surum, ad: ayar.ad.trim() || m.ad, birim: ayar.birim, yukari: ayar.yukari, donus: ayar.donus, sigdir: ayar.sigdir,
    }),
    onSuccess: (m) => {
      bildir('tamam', 'Model ayarı kaydedildi.');
      seciliYaz(m);
      yenile();
      // Sahnedeki istasyonlar modelin yeni ayarıyla yeniden kurulur.
      void istemci.invalidateQueries({ queryKey: ['atolye', 'yerlesim'] });
    },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Model ayarı kaydedilemedi.')),
  });

  const sil = useMutation({
    mutationFn: (m: Model) => api.post(`/atolye/modeller/${m.id}/sil`),
    onSuccess: () => {
      bildir('tamam', 'Model silindi.');
      silinecekYaz(null);
      seciliYaz(null);
      yenile();
      odakKoru();
    },
    onError: (hata) => {
      silinecekYaz(null);
      bildir('hata', hataIletisi(hata, 'Model silinemedi.'));
    },
  });

  const modelSec = (m: Model) => {
    yuklemeYaz(null);
    seciliYaz(m);
    ayarYaz({ ad: m.ad, birim: m.birim, yukari: m.yukari, donus: Number(m.donus), sigdir: m.sigdir });
  };

  const sutunlar: Sutun<Model>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.ad },
    { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (m) => KAYNAK_ADI[m.kaynakBicim] },
    { anahtar: 'boyut', baslik: 'Boyut', hucre: (m) => mbMetni(m.boyutBayt), hizala: 'sag', mono: true },
    { anahtar: 'ucgen', baslik: 'Üçgen', hucre: (m) => sayiMetni(m.ucgenSayisi), hizala: 'sag', mono: true },
    { anahtar: 'kullanim', baslik: 'Makine', hucre: (m) => String(m.kullanim), hizala: 'sag', mono: true },
    { anahtar: 'kalem', baslik: 'Kod', hucre: (m) => String(m.kalemKodlari.length), hizala: 'sag', mono: true },
    { anahtar: 'durum', baslik: 'Durum', hucre: (m) => (m.tamam ? <Rozet ton="tamam">Hazır</Rozet> : <Rozet ton="uyari">Yarım kaldı</Rozet>) },
  ];

  const kart = (() => {
    if (yukleme) {
      const y = yukleme;
      return (
        <section className="tc-atolye-model-kart" aria-label="Yeni model">
          <h3 className="tc-atolye-ozellik-baslik">{y.dosya.name}</h3>
          <p className="tc-atolye-ipucu">{KAYNAK_ADI[y.bicim]} · {mbMetni(y.dosya.size)}</p>
          {y.bicim === 'step' && (
            <Secim
              etiket="Üçgenleme ayrıntısı"
              secenekler={AYRINTILAR}
              value={ayrinti}
              disabled={y.asama === 'ceviriyor' || y.asama === 'gonderiyor'}
              onChange={(o) => {
                const a = o.target.value as StepAyrintisi;
                ayrintiYaz(a);
                void cevir(y.dosya, y.bicim, a);
              }}
            />
          )}
          {y.asama === 'ceviriyor' && <DurumKutusu durum="yukleniyor" mesaj={y.bicim === 'step' ? 'STEP üçgenleniyor (büyük modelde birkaç dakika sürebilir)…' : 'Dosya okunuyor…'} />}
          {y.asama === 'hata' && <DurumKutusu durum="hata" mesaj={y.mesaj} />}
          {(y.asama === 'hazir' || y.asama === 'gonderiyor') && (
            <>
              <ModelOnizleme glb={y.glb} ayar={ayar} />
              <p className="tc-atolye-ipucu">Saklanacak GLB: <b className="mono">{mbMetni(y.glb.length)}</b> · <b className="mono">{sayiMetni(y.ucgen)}</b> üçgen</p>
              <AyarAlanlari ayar={ayar} degistir={(a) => ayarYaz((o) => ({ ...o, ...a }))} />
              <div className="tc-atolye-kart-eylem">
                <Dugme tur="birincil" simge="upload" yukleniyor={y.asama === 'gonderiyor'} onClick={() => gonder.mutate()}>
                  {y.asama === 'gonderiyor' ? `Yükleniyor %${Math.round(y.oran * 100)}` : 'Kütüphaneye yükle'}
                </Dugme>
                <Dugme disabled={y.asama === 'gonderiyor'} onClick={() => { yuklemeYaz(null); odakKoru(); }}>Vazgeç</Dugme>
              </div>
            </>
          )}
          {y.asama === 'hata' && <Dugme onClick={() => { yuklemeYaz(null); odakKoru(); }}>Kapat</Dugme>}
        </section>
      );
    }
    if (secili) {
      return (
        <section className="tc-atolye-model-kart" aria-label={secili.ad}>
          <h3 className="tc-atolye-ozellik-baslik">{secili.ad}</h3>
          <p className="tc-atolye-ipucu">
            {KAYNAK_ADI[secili.kaynakBicim]} · {mbMetni(secili.boyutBayt)} · {sayiMetni(secili.ucgenSayisi)} üçgen · {secili.kullanim} istasyonda
            {secili.kaydeden.ad ? ` · ${secili.kaydeden.ad}` : ''}
          </p>
          {secili.tamam
            ? <ModelOnizleme glb={seciliGlb} ayar={ayar} />
            : <DurumKutusu durum="bos" mesaj="Yüklemesi yarım kalmış; silip yeniden yükleyin." />}
          {yazabilir && secili.tamam && <AyarAlanlari ayar={ayar} degistir={(a) => ayarYaz((o) => ({ ...o, ...a }))} />}
          {secili.tamam && (
            <KalemBaglari model={modeller.data?.modeller.find((m) => m.id === secili.id) ?? secili} yazabilir={yazabilir} />
          )}
          <div className="tc-atolye-kart-eylem">
            {yazabilir && secili.tamam && (
              <Dugme tur="birincil" simge="check" yukleniyor={ayarla.isPending} onClick={() => ayarla.mutate(secili)}>Ayarı kaydet</Dugme>
            )}
            {yazabilir && <Dugme tur="tehlike" simge="trash" onClick={() => silinecekYaz(secili)}>Sil</Dugme>}
            <Dugme onClick={() => { seciliYaz(null); odakKoru(); }}>Kapat</Dugme>
          </div>
        </section>
      );
    }
    return null;
  })();

  return (
    <Pencere acik={acik} kapat={kapat} baslik="3B modeller" tur="yan">
      <div ref={govde} className="tc-atolye-modeller" tabIndex={-1}>
        {yazabilir && (
          <div className="tc-atolye-kart-eylem">
            <Dugme tur="birincil" simge="upload" onClick={() => dosyaGirdisi.current?.click()} disabled={yukleme?.asama === 'gonderiyor'}>Model yükle</Dugme>
            <input
              ref={dosyaGirdisi}
              className="tc-atolye-gizli"
              type="file"
              accept=".step,.stp,.stl,.glb,.gltf"
              aria-label="Model dosyası"
              onChange={(o) => { dosyaSecildi(o.target.files?.[0]); o.target.value = ''; }}
            />
            <span className="tc-atolye-ipucu">STEP, STL, GLB, GLTF · çevrilmiş hali en çok {mbMetni(MODEL_AZAMI_BAYT)}</span>
          </div>
        )}
        {kart}
        {modeller.isPending && <DurumKutusu durum="yukleniyor" />}
        {modeller.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(modeller.error, 'Modeller alınamadı')} yenile={() => { void modeller.refetch(); }} />}
        {modeller.data && (
          <Tablo
            etiket="Yüklenmiş modeller"
            sutunlar={sutunlar}
            satirlar={modeller.data.modeller}
            satirAnahtari={(m) => m.id}
            satirSec={modelSec}
            bosMesaj="Henüz model yok. Makinenin STEP dosyasını yükleyin."
          />
        )}
      </div>
      <OnayPenceresi
        acik={silinecek !== null}
        baslik="Model silinsin mi?"
        onayMetni="Sil"
        tehlikeli
        yukleniyor={sil.isPending}
        onayla={() => { if (silinecek) sil.mutate(silinecek); }}
        vazgec={() => silinecekYaz(null)}
      >
        <p>{silinecek?.ad} kütüphaneden kalıcı olarak silinir. Makineye atanmışsa silinmez; önce makinelerden kaldırın.</p>
      </OnayPenceresi>
    </Pencere>
  );
}
