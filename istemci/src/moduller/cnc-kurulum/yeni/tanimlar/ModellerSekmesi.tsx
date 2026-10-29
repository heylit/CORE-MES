import { useEffect, useState, useSyncExternalStore } from 'react';
import type {
  CncModel, ModelBaglaCevabi, ModelBaglaGovdesi, ModelBelgesi, ModelHedefi, ModellerCevabi, ModelSecenekleriCevabi,
} from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { DurumKutusu, Secim, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { useCncSurum } from '../depo.ts';
import { onbellekSil } from '../sahne/gl.ts';
import { hedefAnahtari, modelAbone, modelDurumu, modelGuncelle, modelListesiniKur, modelSurumu } from '../sahne/glb-yukle.ts';
import { cust, sunucuTezgahSatirlari } from '../secici.ts';
import { D } from '../veri/cncdata.ts';

// 3B modeller (1212 a): dosya Çizim Merkezi'ndedir; burada makineye ve bağlama aparatına yayındaki bir 3B model seçilir. Modeli olmayan
// hedef sahnede çizilen gövdeyle görünür. Takım, tutucu ve çene ölçüden çizilir, model bağlanmaz.

interface Satir { anahtar: string; hedef: ModelHedefi; tur: 'Tezgâh' | 'Aparat'; ad: string }

const belgeAdi = (b: ModelBelgesi): string => `${b.ad} · Rev. ${b.harf} · ${b.dosyaTuru.toUpperCase()}`;

function satirlar(): Satir[] {
  const tezgahlar: Satir[] = (sunucuTezgahSatirlari() ?? []).filter((x) => x.sunucu.aktif).map((x) => ({
    anahtar: hedefAnahtari({ tur: 'makine', makineId: x.sunucu.makineId }), hedef: { tur: 'makine', makineId: x.sunucu.makineId },
    tur: 'Tezgâh', ad: `${x.sunucu.kod} · ${x.sunucu.ad}`,
  }));
  const aparatlar: Satir[] = D.FIX.mill.concat(D.FIX.lathe, cust('fix')).map((f) => ({
    anahtar: hedefAnahtari({ tur: 'aparat', anahtar: f.id }), hedef: { tur: 'aparat', anahtar: f.id }, tur: 'Aparat', ad: f.name,
  }));
  return [...tezgahlar, ...aparatlar];
}

function ModelDurumu({ anahtar }: { anahtar: string }) {
  useSyncExternalStore(modelAbone, modelSurumu);
  const d = modelDurumu(anahtar);
  if (d?.durum === 'yukleniyor') return <>iniyor…</>;
  if (d?.durum === 'hata') return <span className="tc-cl-ozel" role="alert">{d.ileti}</span>;
  return null;
}

export function ModellerSekmesi({ yazabilir }: { yazabilir: boolean }) {
  useCncSurum();
  const [modeller, modellerYaz] = useState<Map<string, CncModel> | null>(null);
  const [secenekler, seceneklerYaz] = useState<readonly ModelBelgesi[]>([]);
  const [hata, hataYaz] = useState<string | null>(null);
  const [mesgul, mesgulYaz] = useState<string | null>(null);
  const [deneme, denemeYaz] = useState(0);

  useEffect(() => {
    let bitti = false;
    void (async () => {
      try {
        const c = await api.get<ModellerCevabi>('/cnc-kurulum/modeller');
        const s = yazabilir ? (await api.get<ModelSecenekleriCevabi>('/cnc-kurulum/model-secenekleri')).belgeler : [];
        if (bitti) return;
        modelListesiniKur(c.modeller);
        modellerYaz(new Map(c.modeller.map((m) => [hedefAnahtari(m.hedef), m])));
        seceneklerYaz(s);
      } catch (e) {
        if (!bitti) hataYaz(hataIletisi(e, '3B model bağları okunamadı.'));
      }
    })();
    return () => { bitti = true; };
  }, [yazabilir, deneme]);

  if (modeller === null) {
    return hata === null
      ? <DurumKutusu durum="yukleniyor" />
      : <DurumKutusu durum="hata" mesaj={hata} yenile={() => { hataYaz(null); denemeYaz((d) => d + 1); }} />;
  }

  const bagla = async (s: Satir, belgeId: number | null): Promise<void> => {
    mesgulYaz(s.anahtar);
    hataYaz(null);
    try {
      const govde: ModelBaglaGovdesi = { hedef: s.hedef, belgeId, beklenenSurum: modeller.get(s.anahtar)?.surum ?? 0 };
      const { model } = await api.post<ModelBaglaCevabi>('/cnc-kurulum/modeller/bagla', govde);
      modelGuncelle(model);
      if (s.hedef.tur === 'aparat') onbellekSil(s.hedef.anahtar);
      modellerYaz(new Map(modeller).set(s.anahtar, model));
    } catch (e) {
      hataYaz(hataIletisi(e, 'Model bağlanamadı.'));
    } finally {
      mesgulYaz(null);
    }
  };

  // Seçicide bağlı belge yoksa da (arşive alınmış olabilir) kendi adıyla görünür.
  const secimler = (m: CncModel | undefined) => {
    const l = secenekler.map((b) => ({ deger: String(b.belgeId), baslik: belgeAdi(b) }));
    return m?.belge && !secenekler.some((b) => b.belgeId === m.belge?.belgeId) ? [{ deger: String(m.belge.belgeId), baslik: belgeAdi(m.belge) }, ...l] : l;
  };
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'tur', baslik: 'Tür', hucre: (s) => <><Simge ad={s.tur === 'Tezgâh' ? 'cpu' : 'box'} boyut="k" /> {s.tur}</> },
    { anahtar: 'ad', baslik: 'Ad', hucre: (s) => <b>{s.ad}</b> },
    {
      anahtar: 'model', baslik: '3B model',
      hucre: (s) => {
        const m = modeller.get(s.anahtar);
        if (!yazabilir) return m?.belge ? belgeAdi(m.belge) : 'çizilen gövde';
        return (
          <Secim
            etiket={`${s.ad} modeli`} bosSecenek="Çizilen gövde (model yok)" secenekler={secimler(m)} value={m?.belge ? String(m.belge.belgeId) : ''}
            disabled={mesgul !== null} onChange={(o) => { void bagla(s, o.target.value === '' ? null : Number(o.target.value)); }}
          />
        );
      },
    },
    { anahtar: 'durum', baslik: '', csv: false, hucre: (s) => <ModelDurumu anahtar={s.anahtar} /> },
  ];

  const liste = satirlar();
  return (
    <>
      <p className="tc-cl-not">
        Makine ve bağlama aparatı modeli Çizim Merkezi&apos;nde yayındaki 3B model belgesidir (GLB, glTF, STEP, IGES ya da STL). Seçilen model sahnede
        çizilen gövdenin yerini alır; model yoksa çizilen gövde görünür. Takım, tutucu ve çeneler ölçüden çizilir.
      </p>
      {sunucuTezgahSatirlari() === null && (
        <div className="tc-cl-uyari" role="status"><Simge ad="alert" boyut="k" /> İstasyonlar&apos;dan tezgâh listesi gelmedi; yalnız aparatlara model bağlanır.</div>
      )}
      {yazabilir && secenekler.length === 0 && (
        <p className="tc-cl-not" role="note">Çizim Merkezi&apos;nde yayında 3B model yok. Model önce orada yüklenip yayınlanır.</p>
      )}
      {hata !== null && <div className="tc-cl-uyari" role="alert"><Simge ad="alert" boyut="k" /> {hata}</div>}
      <Tablo etiket="3B modeller" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(s) => s.anahtar} />
    </>
  );
}
