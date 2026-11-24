import type { EkranHatasiDonemi, EkranHatasiSatiri } from '#paylasilan/sozlesme/saglik.ts';
import { useEffect, useRef } from 'react';
import { Dugme, DurumKutusu, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { Kompakt } from './Kompakt.tsx';
import { gunluSaat } from './izleme-yorumu.ts';
import { useEkranHatalari } from './izleme-sorgusu.ts';

const DONEMLER: readonly { anahtar: EkranHatasiDonemi; baslik: string }[] = [{ anahtar: '24s', baslik: '24 saat' }, { anahtar: '7g', baslik: '7 gün' }, { anahtar: '90g', baslik: '90 gün' }];
const SAYI = new Intl.NumberFormat('tr-TR');

export function EkranHatalariSekmesi({ donem, donemYaz, secili, sec, simdi = Date.now() }: {
  donem: EkranHatasiDonemi; donemYaz: (d: EkranHatasiDonemi) => void; secili: number | null; sec: (id: number | null) => void; simdi?: number;
}) {
  const q = useEkranHatalari(donem);
  const panel = useRef<HTMLElement | null>(null);
  // Dar ekranda panel listenin altında kalır: açılınca görünür alana gelir.
  useEffect(() => { if (secili !== null) panel.current?.scrollIntoView?.({ block: 'nearest' }); }, [secili, q.data]);
  const ayrintiDugmesi = (h: EkranHatasiSatiri) => (
    <Dugme tur="ikincil" simge="eye" aria-pressed={secili === h.id} aria-label={`${secili === h.id ? 'Ayrıntıyı kapat' : 'Ayrıntı'}: ${h.hata}`} onClick={() => { sec(secili === h.id ? null : h.id); }}>{secili === h.id ? 'Kapat' : 'Ayrıntı'}</Dugme>
  );
  const sutunlar: readonly Sutun<EkranHatasiSatiri>[] = [
    { anahtar: 'hata', baslik: 'Hata', hucre: (h) => h.hata },
    { anahtar: 'sayfa', baslik: 'Sayfa', hucre: (h) => h.sayfa, mono: true },
    { anahtar: 'kez', baslik: 'Kez', hucre: (h) => SAYI.format(h.kez), hizala: 'sag' },
    { anahtar: 'kisi', baslik: 'Kişi sayısı', hucre: (h) => h.kisiSayisi, hizala: 'sag', kirilmaz: true },
    { anahtar: 'son', baslik: 'Son', hucre: (h) => gunluSaat(h.sonAn, simdi), kirilmaz: true },
    { anahtar: 'surum', baslik: 'Sürüm', hucre: (h) => h.surum ?? '—', mono: true },
    { anahtar: 'ayrinti', baslik: 'Ayrıntı', csv: false, kartTamSatir: true, hucre: ayrintiDugmesi },
  ];
  const govde = (() => {
    if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
    if (q.isError) return <DurumKutusu durum="hata" hata={q.error} yenile={() => { void q.refetch(); }} />;
    const ayrinti = q.data.satirlar.find((h) => h.id === secili);
    return (
      <>
        {q.data.satirlar.length === 0 ? (
          <div role="status">
            <p>Bu dönemde ekran hatası yok.</p>
            <p className="tc-sistem-soluk">Hata bildirimi açık; {q.data.sonBildirim === null ? 'bugüne kadar hiç bildirim gelmedi' : `son bildirim ${gunluSaat(q.data.sonBildirim, simdi)}`}. Dış izleyici oturumlarından ve dakikada 20'den çok gönderen ekranlardan bildirim gelmeyebilir.</p>
          </div>
        )
          : <>
            <div className="tc-izleme-genis"><Tablo etiket="Ekran hataları" sutunlar={sutunlar} satirlar={q.data.satirlar} satirAnahtari={(h) => String(h.id)} /></div>
            <div className="tc-izleme-dar"><Kompakt etiket="Ekran hataları" satirlar={q.data.satirlar.map((h) => ({
              anahtar: String(h.id), baslik: h.hata, ozet: [['Sayfa', h.sayfa], ['Kez', SAYI.format(h.kez)], ['Kişi sayısı', h.kisiSayisi], ['Son', gunluSaat(h.sonAn, simdi)], ['Sürüm', h.surum ?? '—']],
              secili: secili === h.id, eylem: ayrintiDugmesi(h),
            }))} /></div>
 {q.data.toplam > q.data.satirlar.length && <p className="tc-sistem-soluk" role="status">En son görülen {SAYI.format(q.data.enCok)} hata gösteriliyor; bu dönemde toplam {SAYI.format(q.data.toplam)} ayrı hata var.</p>}
          </>}
        {ayrinti && (
          <section ref={panel} className="tc-izleme-detay" aria-label="Ekran hatası ayrıntısı">
            <h3 className="tc-sistem-baslik">Ayrıntı: {ayrinti.hata}</h3>
            <dl className="tc-sistem-liste">
              <dt>İlk görülme</dt><dd>{gunluSaat(ayrinti.ilkAn, simdi)}</dd>
              <dt>Son görülme</dt><dd>{gunluSaat(ayrinti.sonAn, simdi)}</dd>
              <dt>Sayfa</dt><dd>{ayrinti.sayfa}</dd>
              <dt>Son görülen kişi no</dt><dd>{ayrinti.sonKisiId ?? '—'}</dd>
            </dl>
            {ayrinti.yigin === null ? <p className="tc-sistem-soluk">Yığın izi yok.</p> : <pre className="tc-izleme-kod">{ayrinti.yigin}</pre>}
          </section>
        )}
      </>
    );
  })();
  return (
    <div className="tc-izleme-bolumler">
      <div className="tc-sistem-aralik" role="group" aria-label="Dönem">
        {DONEMLER.map((p) => <button key={p.anahtar} type="button" aria-pressed={p.anahtar === donem} onClick={() => { donemYaz(p.anahtar); }}>{p.baslik}</button>)}
      </div>
      <p className="tc-sistem-soluk">Aynı hata gruplanır; her ekran aynı hatayı dakikada en çok bir kez gönderir. Sayfa adresinden sorgu ve parça atılır. 90 gün saklanır; en çok 2.000 ayrı hata tutulur, dolunca yeni hata eklenmez.</p>
      {govde}
    </div>
  );
}
