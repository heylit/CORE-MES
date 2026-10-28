// Elle iş (958 a, 1062 a): numune, tamir, kalibrasyon, iade gibi kaynağı olmayan gidiş ya da geliş. Dönüşlü gidişte bağlı geliş
// kalemi de açılır; iade dönüşsüzdür. Kalem açılınca Sevkiyattaki görünümünde bekler, serbest bırakma gerekmez; sevk yok ⋯ ile seçilir (prototip).
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { ElleKalemGovdesi, ElleTuru, FirmaSecenegi, KalemYonu } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Girdi, IsaretKutusu, Pencere, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useFirmaArama, useKalemKomutu } from './veri.ts';

const TURLER: readonly { deger: ElleTuru; baslik: string }[] = [
  { deger: 'numune', baslik: 'Numune' }, { deger: 'tamir', baslik: 'Tamir' }, { deger: 'kalibrasyon', baslik: 'Kalibrasyon' },
  { deger: 'iade', baslik: 'İade' }, { deger: 'diger', baslik: 'Diğer' },
];
const YONLER: readonly { deger: KalemYonu; baslik: string }[] = [{ deger: 'gidis', baslik: 'Giden (bizden çıkar)' }, { deger: 'gelis', baslik: 'Gelen (bize girer)' }];

interface Taslak { tur: ElleTuru; yon: KalemYonu; firma: FirmaSecenegi | null; adet: string; istenenTarih: string; aciklama: string; donuslu: boolean; donusTarihi: string }

function FirmaAra({ secili, sec }: { secili: FirmaSecenegi | null; sec: (f: FirmaSecenegi | null) => void }) {
  const [metin, setMetin] = useState(''), [sorgu, setSorgu] = useState('');
  useEffect(() => { const h = setTimeout(() => setSorgu(metin), 250); return () => clearTimeout(h); }, [metin]);
  const arama = useFirmaArama(sorgu, secili === null);
  const liste = useId();
  if (secili) {
    return (
      <div className="tc-sevkiyat-arama">
        <Girdi etiket="Firma" required readOnly value={secili.ad} />
        <Dugme onClick={() => sec(null)}>Firmayı değiştir</Dugme>
      </div>
    );
  }
  const firmalar = arama.data?.firmalar ?? [];
  return (
    <div className="tc-sevkiyat-arama">
      <Girdi etiket="Firma" required type="search" value={metin} aria-controls={liste} placeholder="Müşteri ya da tedarikçi adı veya kodu" onChange={(e) => setMetin(e.target.value)} />
      {arama.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(arama.error, 'Firmalar alınamadı')}</p>}
      {arama.data && !firmalar.length && <p role="status" className="tc-sevkiyat-not">Firma bulunamadı. Finans &gt; Firmalar ekranından ekleyin.</p>}
      {firmalar.length > 0 && (
        <ul id={liste} className="tc-sevkiyat-arama-sonuclari" aria-label="Firmalar">
          {firmalar.map((f) => (
            <li key={f.id}><button type="button" onClick={() => { sec(f); setMetin(''); }}><b>{f.ad}</b><em>{[f.kod, f.il].filter(Boolean).join(' · ')}</em></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ElleIsFormu({ bugun, kapat, acildi }: { bugun: string; kapat: () => void; acildi: () => void }) {
  const [t, setT] = useState<Taslak>({ tur: 'numune', yon: 'gidis', firma: null, adet: '', istenenTarih: bugun, aciklama: '', donuslu: false, donusTarihi: '' });
  const komut = useKalemKomutu();
  const { bildir } = useBildirim();
  const formKimligi = useId();
  const alan = <K extends keyof Taslak>(ad: K) => (deger: Taslak[K]) => setT((x) => ({ ...x, [ad]: deger }));
  const donusAcilir = t.yon === 'gidis' && t.tur !== 'iade';
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    if (!t.firma) return;
    const govde: ElleKalemGovdesi = {
      tur: t.tur, yon: t.yon, firmaId: t.firma.id, malzemeNo: null, adet: t.adet.trim() === '' ? null : t.adet.trim().replace(',', '.'),
      istenenTarih: t.istenenTarih, aciklama: t.aciklama, tasima: 'biz', donusTarihi: donusAcilir && t.donuslu ? t.donusTarihi : null,
    };
    komut.mutate({ tur: 'elle', govde }, {
      onSuccess: (c) => {
        const n = 'kalemIdleri' in c ? c.kalemIdleri.length : 1;
        bildir('tamam', n > 1 ? 'Elle iş ve dönüşü açıldı.' : 'Elle iş açıldı.');
        acildi();
      },
    });
  };
  return (
    <Pencere acik kapat={kapat} tur="yan" baslik="Elle iş"
      alt={<><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme type="submit" form={formKimligi} tur="birincil" simge="plus" disabled={!t.firma} yukleniyor={komut.isPending}>Aç</Dugme></>}>
      <form id={formKimligi} className="tc-sevkiyat-form" onSubmit={gonder} aria-label="Elle iş">
        <Secim etiket="Tür" secenekler={TURLER} value={t.tur} onChange={(e) => alan('tur')(e.target.value as ElleTuru)} />
        <Secim etiket="Yön" secenekler={YONLER} value={t.yon} onChange={(e) => alan('yon')(e.target.value as KalemYonu)} />
        <FirmaAra secili={t.firma} sec={alan('firma')} />
        <Girdi etiket="Açıklama" required maxLength={400} placeholder="Ör. numune kutusu, kalibrasyona giden mastar" value={t.aciklama} onChange={(e) => alan('aciklama')(e.target.value)} />
        <Girdi etiket="Adet" inputMode="decimal" value={t.adet} onChange={(e) => alan('adet')(e.target.value)} />
        <Girdi etiket="İstenen gün" type="date" required value={t.istenenTarih} onChange={(e) => alan('istenenTarih')(e.target.value)} />
        {donusAcilir && (
          <fieldset className="tc-sevkiyat-alan-grubu">
            <legend>Dönüş</legend>
            <IsaretKutusu etiket="Dönüşlü (geri gelecek)" checked={t.donuslu} onChange={(e) => alan('donuslu')(e.target.checked)} />
            {t.donuslu && <Girdi etiket="Dönüş günü" type="date" required min={t.istenenTarih} value={t.donusTarihi} onChange={(e) => alan('donusTarihi')(e.target.value)} />}
          </fieldset>
        )}
        {komut.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(komut.error, 'Elle iş açılamadı')}</p>}
      </form>
    </Pencere>
  );
}
