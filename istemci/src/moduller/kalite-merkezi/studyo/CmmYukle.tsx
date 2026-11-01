import { useEffect, useState } from 'react';
import type { KmCmmEsleme, KmCmmOnizlemeCevabi, KmCmmSatiri } from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { CMM_DURUMU, CMM_ESLEME_ANAHTARI, CMM_METIN_SINIRI, cmmBaslikImzasi, cmmMetniCoz } from './kurallar.ts';
import { useCmmOnizle, useCmmYaz } from './veri.ts';

// CMM sonucu yükleme (1439 a): dosya seçilir, sunucu önizler (yazmaz), kullanıcı nominal farkı olan satırları tek tek onaylar ve yazar.
// Yazma dosyayı sunucuda yeniden okur; ekrandaki değer gönderilmez.

function hatirlananlar(): Record<string, KmCmmEsleme> {
  try { return JSON.parse(localStorage.getItem(CMM_ESLEME_ANAHTARI) ?? '{}') as Record<string, KmCmmEsleme>; } catch { return {}; }
}
function hatirla(basliklar: readonly string[], e: KmCmmEsleme): void {
  try { localStorage.setItem(CMM_ESLEME_ANAHTARI, JSON.stringify({ ...hatirlananlar(), [cmmBaslikImzasi(basliklar)]: e })); } catch { /* özel kipte saklama yok */ }
}

export function CmmYukle({ acik, kapat, uretimEmriId, emirAdi, resim }: {
  acik: boolean; kapat: () => void; uretimEmriId: number; emirAdi: string; resim: KmResim;
}) {
  const { bildir } = useBildirim();
  const onizle = useCmmOnizle();
  const yazici = useCmmYaz();
  const [metin, metinYaz] = useState<string | null>(null);
  const [dosyaAdi, dosyaAdiYaz] = useState('');
  const [sonuc, sonucYaz] = useState<KmCmmOnizlemeCevabi | null>(null);
  const [onay, onayYaz] = useState<ReadonlySet<number>>(new Set());
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => { if (!acik) { metinYaz(null); sonucYaz(null); onayYaz(new Set()); hataYaz(null); dosyaAdiYaz(''); } }, [acik]);

  const getir = (m: string, esleme?: KmCmmEsleme, ilk = false) => {
    hataYaz(null);
    onizle.mutate({ uretimEmriId, resimId: resim.id, metin: m, ...(esleme ? { esleme } : {}) }, {
      onSuccess: (c) => {
        const hatirlanan = ilk && c.bicim === 'csv' ? hatirlananlar()[cmmBaslikImzasi(c.basliklar)] : undefined;
        if (hatirlanan && JSON.stringify(hatirlanan) !== JSON.stringify(c.esleme)) { getir(m, hatirlanan); return; }
        sonucYaz(c);
        onayYaz(new Set());
      },
      onError: (h) => { sonucYaz(null); hataYaz(hataIletisi(h, 'Dosya okunamadı.')); },
    });
  };

  const dosyaSec = async (dosya: File | undefined) => {
    if (!dosya) return;
    const m = cmmMetniCoz(new Uint8Array(await dosya.arrayBuffer()));
    if (m.length > CMM_METIN_SINIRI) { hataYaz('Dosya çok büyük; en çok yaklaşık 900 KB okunur.'); return; }
    dosyaAdiYaz(dosya.name);
    metinYaz(m);
    getir(m, undefined, true);
  };

  const eslemeDegis = (alan: keyof KmCmmEsleme, deger: string) => {
    if (!sonuc || metin === null) return;
    const onceki = sonuc.esleme ?? { karakteristik: 0, olculen: 1, nominal: null };
    const yeni = { ...onceki, [alan]: deger === '' ? null : Number(deger) } as KmCmmEsleme;
    if (yeni.karakteristik === null || yeni.olculen === null) return;
    getir(metin, yeni);
  };

  const satirlar = sonuc?.satirlar ?? [];
  const yazilacak = satirlar.filter((s) => s.durum === 'eslesti' || (s.durum === 'nominalFarki' && onay.has(s.satir))).length;
  const yaz = () => {
    if (!sonuc || metin === null) return;
    yazici.mutate({
      uretimEmriId, resimId: resim.id, metin, resimSurumu: sonuc.resimSurumu, onaylananlar: [...onay],
      ...(sonuc.esleme ? { esleme: sonuc.esleme } : {}),
    }, {
      onSuccess: (c) => {
        if (sonuc.esleme) hatirla(sonuc.basliklar, sonuc.esleme);
        bildir('tamam', `${String(c.olcumler.length)} CMM ölçümü yazıldı${c.atlanan ? `, ${String(c.atlanan)} satır atlandı` : ''}.`);
        kapat();
      },
      onError: (h) => { bildir('hata', hataIletisi(h, 'CMM sonucu yazılamadı.')); },
    });
  };

  const sutunlar: Sutun<KmCmmSatiri>[] = [
    { anahtar: 'satir', baslik: 'Satır', hucre: (s) => s.satir, hizala: 'sag', mono: true },
    { anahtar: 'karakteristik', baslik: 'Karakteristik', hucre: (s) => s.karakteristik || '—' },
    { anahtar: 'balon', baslik: 'Balon', hucre: (s) => (s.balonNo === null ? '—' : `${String(s.balonNo)} · ${s.balonNominali ?? ''}`) },
    { anahtar: 'olculen', baslik: 'Ölçülen', hucre: (s) => s.olculen ?? '—', hizala: 'sag', mono: true },
    { anahtar: 'nominal', baslik: 'Dosya nominali', hucre: (s) => s.dosyaNominali ?? '—', hizala: 'sag', mono: true },
    { anahtar: 'sinir', baslik: 'Sınır', hucre: (s) => (s.alt !== null && s.ust !== null ? `${s.alt} – ${s.ust}` : '—'), mono: true, kirilmaz: true },
    {
      anahtar: 'uygun', baslik: 'Sonuç',
      hucre: (s) => (s.uygun === null ? '—' : <Rozet ton={s.uygun ? 'tamam' : 'hata'}>{s.uygun ? 'Uygun' : 'Uygun değil'}</Rozet>),
      csv: (s) => (s.uygun === null ? null : s.uygun ? 'Uygun' : 'Uygun değil'),
    },
    {
      anahtar: 'durum', baslik: 'Durum',
      hucre: (s) => (s.durum === 'nominalFarki'
        ? <IsaretKutusu etiket="Nominal farklı, yine de yaz" checked={onay.has(s.satir)} onChange={(o) => {
          const y = new Set(onay);
          if (o.target.checked) y.add(s.satir); else y.delete(s.satir);
          onayYaz(y);
        }} />
        : <Rozet ton={CMM_DURUMU[s.durum].ton}>{CMM_DURUMU[s.durum].ad}</Rozet>),
      csv: (s) => CMM_DURUMU[s.durum].ad,
    },
  ];

  const secenekler = (sonuc?.basliklar ?? []).map((b, i) => ({ deger: String(i), baslik: b || `Sütun ${String(i + 1)}` }));
  return (
    <Pencere acik={acik} kapat={kapat} baslik="CMM sonucu yükle" tur="yan" alt={(
      <>
        <Dugme tur="ikincil" simge="x" onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={yazilacak === 0 || yazici.isPending || onizle.isPending} onClick={yaz}>
          {`${String(yazilacak)} ölçüyü yaz`}
        </Dugme>
      </>
    )}>
      <div className="km-st-cmm">
        <p className="km-st-soluk">
          {emirAdi} · {resim.ad}{resim.revizyon ? ` · Rev ${resim.revizyon}` : ''}. CSV ya da QIF 3.0 sonuç dosyası. Balon numarası karakteristik adından okunur
          (12, B12, #12); eşleşmeyen, belirsiz ve yinelenen satır yazılmaz.
        </p>
        <label className="km-st-dosya">
          <Simge ad="upload" boyut="k" />
          <span>{dosyaAdi || 'Dosya seç'}</span>
          <input type="file" accept=".csv,.txt,.xml,.qif" onChange={(o) => { void dosyaSec(o.target.files?.[0]); o.target.value = ''; }} />
        </label>
        {hata ? <DurumKutusu durum="hata" mesaj={hata} /> : null}
        {onizle.isPending ? <DurumKutusu durum="yukleniyor" /> : null}
        {sonuc?.bicim === 'csv' ? (
          <div className="km-st-cmm-esleme">
            <Secim etiket="Karakteristik sütunu" value={String(sonuc.esleme?.karakteristik ?? '')} bosSecenek="Seçin"
              onChange={(o) => { eslemeDegis('karakteristik', o.target.value); }} secenekler={secenekler} />
            <Secim etiket="Ölçülen sütunu" value={String(sonuc.esleme?.olculen ?? '')} bosSecenek="Seçin"
              onChange={(o) => { eslemeDegis('olculen', o.target.value); }} secenekler={secenekler} />
            <Secim etiket="Nominal sütunu" value={String(sonuc.esleme?.nominal ?? '')} bosSecenek="Yok"
              onChange={(o) => { eslemeDegis('nominal', o.target.value); }} secenekler={secenekler} disabled={sonuc.esleme === null} />
          </div>
        ) : null}
        {sonuc && sonuc.bicim === 'csv' && sonuc.esleme === null
          ? <DurumKutusu durum="bos" mesaj="Sütunlar başlıktan tanınmadı; karakteristik ve ölçülen sütununu seçin." /> : null}
        {sonuc && (sonuc.esleme !== null || sonuc.bicim === 'qif') ? (
          <Tablo etiket="CMM sonuç satırları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.satir} bosMesaj="Dosyada satır yok." />
        ) : null}
      </div>
    </Pencere>
  );
}
