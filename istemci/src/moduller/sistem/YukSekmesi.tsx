import type { EkranYuku, MesguUc, TakilmaKaydi, TekrarSerisiKaydi, YukDonemi } from '#paylasilan/sozlesme/saglik.ts';
import { DurumKutusu, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { baytMetni } from './saglik-ozeti.ts';
import { ekranAdi, gunluSaat, kisaSure, oran } from './izleme-yorumu.ts';
import { Kompakt } from './Kompakt.tsx';
import { useYuk } from './izleme-sorgusu.ts';
import { sureMetni } from './sure.ts';

const DONEMLER: readonly { anahtar: YukDonemi; baslik: string }[] = [{ anahtar: '1s', baslik: '1 saat' }, { anahtar: '24s', baslik: '24 saat' }];
const SAYI = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });

function Cubuk({ deger, enBuyuk, etiket }: { deger: number; enBuyuk: number; etiket: string }) {
  return <meter className="tc-izleme-cubuk" min={0} max={1} value={oran(deger, enBuyuk)} aria-label={etiket}>{etiket}</meter>;
}

export function YukSekmesi({ donem, donemYaz, simdi = Date.now() }: { donem: YukDonemi; donemYaz: (d: YukDonemi) => void; simdi?: number }) {
  const y = useYuk(donem);
  const tekrarSutunlari: readonly Sutun<TekrarSerisiKaydi>[] = [
    { anahtar: 'kisi', baslik: 'Kişi no', hucre: (t) => t.kisiId, hizala: 'sag' },
    { anahtar: 'istek', baslik: 'İstek', hucre: (t) => `${t.yontem} ${t.adres}`, mono: true },
    { anahtar: 'kez', baslik: 'Deneme', hucre: (t) => t.kez, hizala: 'sag' },
    { anahtar: 'hatali', baslik: 'Hatalı', hucre: (t) => t.hatali, hizala: 'sag' },
    { anahtar: 'durum', baslik: 'Son sonuç', hucre: (t) => (t.sonHata === null ? String(t.sonDurum) : `${String(t.sonDurum)} · ${t.sonHata}`) },
    { anahtar: 'an', baslik: 'Son deneme', hucre: (t) => gunluSaat(t.sonAn, simdi), kirilmaz: true },
  ];
  const mesguSutunlari = (enBuyuk: number): readonly Sutun<MesguUc>[] => [
    { anahtar: 'uc', baslik: 'Uç', hucre: (u) => `${u.yontem} ${u.yol ?? 'eşleşmeyen'}`, mono: true },
    { anahtar: 'pay', baslik: 'Toplam süre payı', hucre: (u) => <Cubuk deger={u.toplamMs} enBuyuk={enBuyuk} etiket={`${u.yontem} ${u.yol ?? ''}`} /> },
    { anahtar: 'toplam', baslik: 'Toplam süre', hucre: (u) => sureMetni(u.toplamMs / 1000), hizala: 'sag', kirilmaz: true },
    { anahtar: 'istek', baslik: 'İstek', hucre: (u) => SAYI.format(u.istek), hizala: 'sag' },
    { anahtar: 'ort', baslik: 'Ortalama', hucre: (u) => `${SAYI.format(u.ortMs)} ms`, hizala: 'sag', kirilmaz: true },
    { anahtar: 'sorgu', baslik: 'Sorgu / istek', hucre: (u) => (u.sorguIstekBasina === null ? '—' : SAYI.format(u.sorguIstekBasina)), hizala: 'sag' },
    { anahtar: 'boyut', baslik: 'Ortalama cevap', hucre: (u) => (u.ortCevapBayt === null ? '—' : baytMetni(u.ortCevapBayt)), hizala: 'sag', kirilmaz: true },
    { anahtar: 'cakisma', baslik: 'Çakışma (409)', hucre: (u) => u.cakisma409, hizala: 'sag' },
  ];
  const takilmaSutunlari: readonly Sutun<TakilmaKaydi>[] = [
    { anahtar: 'an', baslik: 'Zaman', hucre: (t) => gunluSaat(t.an, simdi), kirilmaz: true },
    { anahtar: 'sure', baslik: 'Takılma', hucre: (t) => kisaSure(t.takilmaMs), hizala: 'sag', kirilmaz: true },
    { anahtar: 'suren', baslik: 'O sırada süren', hucre: (t) => (t.suren.length === 0 ? '—' : t.suren.slice(0, 3).map((i) => `${i.yontem} ${i.adres}`).join(', ')), mono: true },
    { anahtar: 'son', baslik: 'Son biten', hucre: (t) => (t.sonBiten === null ? '—' : `${t.sonBiten.yontem} ${t.sonBiten.adres} · ${SAYI.format(t.sonBiten.sureMs)} ms`), mono: true },
  ];
  const ekranSutunlari = (enBuyuk: number): readonly Sutun<EkranYuku>[] => [
    { anahtar: 'ekran', baslik: 'Ekran', hucre: (e) => ekranAdi(e.ekran) },
    { anahtar: 'pay', baslik: 'Yük', hucre: (e) => <Cubuk deger={e.istekDk} enBuyuk={enBuyuk} etiket={ekranAdi(e.ekran)} /> },
    { anahtar: 'istek', baslik: 'İstek / dk', hucre: (e) => SAYI.format(e.istekDk), hizala: 'sag', kirilmaz: true },
    { anahtar: 'kisi', baslik: 'Kişi sayısı', hucre: (e) => e.kisiSayisi, hizala: 'sag', kirilmaz: true },
  ];

  const govde = (() => {
    if (y.isPending) return <DurumKutusu durum="yukleniyor" />;
    if (y.isError) return <DurumKutusu durum="hata" hata={y.error} yenile={() => { void y.refetch(); }} />;
    const d = y.data;
    const enMesgul = Math.max(0, ...d.mesguUclar.map((u) => u.toplamMs));
    const enYuklu = Math.max(0, ...d.ekranlar.map((e) => e.istekDk));
    return (
      <>
        <p className="tc-sistem-soluk">{gunluSaat(d.baslangic, simdi)}'den beri ölçülüyor. Sunucu yeniden açılınca bu veriler sıfırlanır.</p>
        <section aria-labelledby="tc-izleme-tekrar">
          <h3 id="tc-izleme-tekrar" className="tc-sistem-baslik">Tekrar eden denemeler</h3>
          <p className="tc-sistem-soluk">Aynı kişinin aynı isteği {d.tekrarEsik.saniye} saniye içinde {d.tekrarEsik.kez} ya da daha çok kez yapması.</p>
          {d.tekrarlar.length === 0 ? <p>Bu dönemde tekrar eden deneme yok.</p>
            : <><div className="tc-izleme-genis"><Tablo etiket="Tekrar eden denemeler" sutunlar={tekrarSutunlari} satirlar={d.tekrarlar} satirAnahtari={(t) => `${String(t.kisiId)} ${t.yontem} ${t.adres} ${t.sonAn}`} /></div>
              <div className="tc-izleme-dar"><Kompakt etiket="Tekrar eden denemeler" satirlar={d.tekrarlar.map((t) => ({
                anahtar: `${String(t.kisiId)} ${t.yontem} ${t.adres} ${t.sonAn}`, baslik: <span className="mono">{t.yontem} {t.adres}</span>,
                ozet: [['Kişi no', t.kisiId], ['Deneme', `${String(t.kez)} (${String(t.hatali)} hatalı)`], ['Son sonuç', t.sonHata === null ? t.sonDurum : `${String(t.sonDurum)} · ${t.sonHata}`], ['Son deneme', gunluSaat(t.sonAn, simdi)]],
              }))} /></div></>}
        </section>
        <section aria-labelledby="tc-izleme-mesgul">
          <h3 id="tc-izleme-mesgul" className="tc-sistem-baslik">En çok meşgul eden uçlar</h3>
          {d.mesguUclar.length === 0 ? <p>Bu dönemde ölçülen istek yok.</p>
            : <><div className="tc-izleme-genis"><Tablo etiket="En çok meşgul eden uçlar" sutunlar={mesguSutunlari(enMesgul)} satirlar={d.mesguUclar} satirAnahtari={(u) => `${u.yontem} ${u.yol ?? ''}`} /></div>
              <div className="tc-izleme-dar"><Kompakt etiket="En çok meşgul eden uçlar" satirlar={d.mesguUclar.map((u) => ({
                anahtar: `${u.yontem} ${u.yol ?? ''}`, baslik: <span className="mono">{u.yontem} {u.yol ?? 'eşleşmeyen'}</span>, cubuk: { deger: oran(u.toplamMs, enMesgul), etiket: 'Toplam süre payı' },
                ozet: [['Toplam süre', sureMetni(u.toplamMs / 1000)], ['İstek', SAYI.format(u.istek)], ['Ortalama', `${SAYI.format(u.ortMs)} ms`]],
                ...(u.cakisma409 > 0 || (u.sorguIstekBasina ?? 0) >= 10 ? { not: `${(u.sorguIstekBasina ?? 0) >= 10 ? `${SAYI.format(u.sorguIstekBasina ?? 0)} sorgu/istek` : ''}${u.cakisma409 > 0 ? ` ${String(u.cakisma409)} çakışma (409)` : ''}`.trim() } : {}),
              }))} /></div></>}
        </section>
        <section aria-labelledby="tc-izleme-takilma">
          <h3 id="tc-izleme-takilma" className="tc-sistem-baslik">Takılma anları</h3>
          <p className="tc-sistem-soluk">Sunucunun bir işe takılıp ötekileri beklettiği anlar (eşik: {sureMetni(d.takilmaEsikMs / 1000)}).</p>
          {d.takilmalar.length === 0 ? <p>Bu dönemde takılma yok.</p>
            : <><div className="tc-izleme-genis"><Tablo etiket="Takılma anları" sutunlar={takilmaSutunlari} satirlar={d.takilmalar} satirAnahtari={(t) => t.an} /></div>
              <div className="tc-izleme-dar"><Kompakt etiket="Takılma anları" satirlar={d.takilmalar.map((t) => ({
                anahtar: t.an, baslik: `${gunluSaat(t.an, simdi)} · ${kisaSure(t.takilmaMs)}`,
                ozet: [['O sırada süren', t.suren.length === 0 ? '—' : t.suren.slice(0, 2).map((i) => `${i.yontem} ${i.adres}`).join(', ')], ['Son biten', t.sonBiten === null ? '—' : `${t.sonBiten.yontem} ${t.sonBiten.adres}`]],
              }))} /></div></>}
        </section>
        <section aria-labelledby="tc-izleme-ekran">
          <h3 id="tc-izleme-ekran" className="tc-sistem-baslik">Otomatik yenileme yükü</h3>
          <p className="tc-sistem-soluk">Son dakikada ekran başına gelen istek; ekranı açık tutan kişi sayısıyla birlikte.</p>
          {d.ekranlar.length === 0 ? <p>Son dakikada istek yok.</p>
            : <Tablo etiket="Otomatik yenileme yükü" sutunlar={ekranSutunlari(enYuklu)} satirlar={d.ekranlar} satirAnahtari={(e) => e.ekran} />}
        </section>
      </>
    );
  })();

  return (
    <div className="tc-izleme-bolumler">
      <div className="tc-sistem-aralik" role="group" aria-label="Dönem">
        {DONEMLER.map((p) => <button key={p.anahtar} type="button" aria-pressed={p.anahtar === donem} onClick={() => { donemYaz(p.anahtar); }}>{p.baslik}</button>)}
      </div>
      {govde}
    </div>
  );
}
