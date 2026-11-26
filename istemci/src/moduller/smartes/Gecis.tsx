import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GecisCevabi, GecisDegistirCevabi, GecisDegistirGovdesi, HareketYenidenDeneCevabi, SmartesUretimKaynagi } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Kart, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { YOK, zamanMetni } from './gosterim.ts';
import './smartes.css';

type IstasyonSatiri = GecisCevabi['satirlar'][number];
type MakineSatiri = IstasyonSatiri['makineler'][number];
// Tabloda istasyon satırı ve altında makineleri; makine satırı istasyonuna bağlıdır.
type Satir = { tur: 'istasyon'; istasyon: IstasyonSatiri } | { tur: 'makine'; istasyon: IstasyonSatiri; makine: MakineSatiri };
// Panelde seçilen değer: makinede "uy" istasyona uymaktır.
type Secilen = SmartesUretimKaynagi | 'uy';

const KAYNAK_ADI: Record<SmartesUretimKaynagi, string> = { smartes: 'SmartES', terminal: 'Terminal' };
const HAREKET_ADI: Record<string, string> = {
  ayar: 'Hazırlık başladı', baslat: 'Üretim başladı', duraklat: 'Duraklatıldı', devam: 'Devam etti', durdur: 'Duruş', bitir: 'Bitti',
};
const anahtar = (s: Satir): string => (s.tur === 'istasyon' ? `i${s.istasyon.istasyonId}` : `m${s.makine.id}`);
const saat = (z: string): string => zamanMetni(z);

function KaynakRozeti({ kaynak }: { kaynak: SmartesUretimKaynagi }) {
  return <Rozet ton={kaynak === 'smartes' ? 'bilgi' : 'pasif'}>{KAYNAK_ADI[kaynak]}</Rozet>;
}

function DegistirPaneli({ satir, kapat }: { satir: Satir; kapat: () => void }) {
  const qc = useQueryClient();
  const { bildir } = useBildirim();
  const makine = satir.tur === 'makine' ? satir.makine : null;
  const ilk: Secilen = makine === null ? satir.istasyon.kaynak : (makine.secim ?? 'uy');
  const [secilen, secilenYaz] = useState<Secilen>(ilk);
  const govde = (onizleme: boolean): GecisDegistirGovdesi => ({
    istasyonId: satir.istasyon.istasyonId, makineId: makine?.id ?? null, kaynak: secilen === 'uy' ? null : secilen, onizleme,
  });
  const onizleme = useQuery({
    queryKey: [...anahtarlar.gecis, 'onizleme', anahtar(satir), secilen],
    queryFn: () => api.post<GecisDegistirCevabi>('/smartes/gecis/degistir', govde(true)),
    enabled: secilen !== ilk,
  });
  const uygula = useMutation({
    mutationFn: () => api.post<GecisDegistirCevabi>('/smartes/gecis/degistir', govde(false)),
    onSuccess: (c) => {
      bildir('tamam', c.uygulandi ? `Üretim kaynağı değişti; geçerlilik ${zamanMetni(c.gecerlilik)}.` : 'Kaynak zaten bu değerdeydi.');
      void qc.invalidateQueries({ queryKey: anahtarlar.kok });
      kapat();
    },
    onError: (e) => { bildir('hata', hataIletisi(e, 'Kaynak değiştirilemedi')); },
  });
  const secenekler = [
    ...(makine === null ? [] : [{ deger: 'uy', baslik: `İstasyona uy (${KAYNAK_ADI[satir.istasyon.kaynak]})` }]),
    { deger: 'terminal', baslik: 'Terminal' }, { deger: 'smartes', baslik: 'SmartES' },
  ];
  const c = onizleme.data;
  return (
    <Pencere
      acik kapat={kapat}
      baslik={`Üretim kaynağını değiştir · ${makine?.kod ?? satir.istasyon.kod}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={uygula.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={uygula.isPending} disabled={secilen === ilk} onClick={() => { uygula.mutate(); }}>Uygula</Dugme>
        </>
      )}
    >
      <div className="tc-smartes-form">
        <Secim etiket="Yeni kaynak" value={secilen} onChange={(o) => { secilenYaz(o.target.value as Secilen); }} secenekler={secenekler}
          ipucu="Geçerlilik uyguladığınız andır; o andan önce başlamış SmartES kaydı bu seçimle yeniden işlenmez." />
        {secilen !== ilk && onizleme.isPending && <DurumKutusu durum="yukleniyor" />}
        {c && (
          <p className="tc-sga-bant" role="status">
            {c.etkilenen.length === 0 ? 'Etkin kaynağı değişen makine yok.' : (
              `Etkilenen: ${c.etkilenen.map((e) => `${e.kod} (${KAYNAK_ADI[e.once]} → ${KAYNAK_ADI[e.sonra]}${e.calisanIs === null ? '' : `, çalışan iş ${e.calisanIs}`})`).join(', ')}.`
              + (c.etkilenen.some((e) => e.sonra === 'terminal') ? ' Terminal’e alınan makinede SmartES aktarımı durur; önceki SmartES kayıtları yeniden işlenmez.' : '')
              + (c.etkilenen.some((e) => e.sonra === 'smartes') ? ' SmartES’e alınan makinede terminalin başlat, sayım, hurda ve duruş düğmeleri kapanır.' : '')
              + (c.bekleyenOnay > 0 ? ` Bekleyen ${c.bekleyenOnay} onay kuyrukta kalır.` : '')
            )}
          </p>
        )}
      </div>
    </Pencere>
  );
}

export function Gecis() {
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('ayarlar.yaz') === true;
  const qc = useQueryClient();
  const { bildir } = useBildirim();
  const [secili, seciliYaz] = useState<Satir | null>(null);
  const veri = useQuery({ queryKey: anahtarlar.gecis, queryFn: () => api.get<GecisCevabi>('/smartes/gecis') });
  const yeniden = useMutation({
    mutationFn: () => api.post<HareketYenidenDeneCevabi>('/smartes/hareketler/yeniden-dene', {}),
    onSuccess: (c) => {
      bildir(c.hatali === 0 ? 'tamam' : 'hata', `${c.yazilan} hareket yazıldı; ${c.hatali} hareket yine yazılamadı, ${c.bekleyen} kişi eşlemesi bekliyor.`);
      void qc.invalidateQueries({ queryKey: anahtarlar.kok });
    },
    onError: (e) => { bildir('hata', hataIletisi(e, 'Yeniden denenemedi')); },
  });
  const satirlar: Satir[] = (veri.data?.satirlar ?? []).flatMap((i) => [
    { tur: 'istasyon' as const, istasyon: i }, ...i.makineler.map((m) => ({ tur: 'makine' as const, istasyon: i, makine: m })),
  ]);
  const izleme = (s: Satir) => (s.tur === 'makine' && s.makine.etkin === 'smartes' ? s.makine : null);
  const sutunlar: readonly Sutun<Satir>[] = [
    {
      anahtar: 'ad', baslik: 'İstasyon / makine', kirilmaz: true, sabit: 'sol',
      hucre: (s) => (s.tur === 'istasyon' ? <strong>{s.istasyon.kod}</strong> : <span className="tc-sm-kod">{`↳ ${s.makine.kod}`}</span>),
      csv: (s) => (s.tur === 'istasyon' ? s.istasyon.kod : s.makine.kod),
    },
    {
      anahtar: 'kaynak', baslik: 'Üretim kaynağı', kartta: true,
      hucre: (s) => (s.tur === 'istasyon' ? <KaynakRozeti kaynak={s.istasyon.kaynak} /> : (
        <span className="tc-ob-eylem"><KaynakRozeti kaynak={s.makine.etkin} />{s.makine.secim === null && <span className="tc-sm-not">istasyona uyar</span>}</span>
      )),
      csv: (s) => KAYNAK_ADI[s.tur === 'istasyon' ? s.istasyon.kaynak : s.makine.etkin],
    },
    { anahtar: 'gecerli', baslik: 'Geçerli', kirilmaz: true, hucre: (s) => zamanMetni(s.tur === 'istasyon' ? s.istasyon.gecerlilik : s.makine.gecerlilik) },
    {
      anahtar: 'hareket', baslik: 'Son hareket',
      hucre: (s) => {
        const m = izleme(s);
        if (m === null) return s.tur === 'makine' ? <span className="tc-sm-not">{s.makine.smartesKodu === null ? 'SmartES makine eşlemesi yok' : 'Terminalden üretiyor'}</span> : null;
        return m.sonHareket === null ? YOK : `${saat(m.sonHareket.zaman)} ${HAREKET_ADI[m.sonHareket.tur] ?? m.sonHareket.tur}`;
      },
    },
    { anahtar: 'sayim', baslik: 'Son sayım', hucre: (s) => { const m = izleme(s); return m?.sonSayim ? `${saat(m.sonSayim.zaman)} · ${m.sonSayim.adet > 0 ? '+' : ''}${m.sonSayim.adet}` : (m ? YOK : null); } },
    { anahtar: 'hurda', baslik: 'Son hurda', hucre: (s) => { const m = izleme(s); return m?.sonHurda ? `${saat(m.sonHurda.zaman)} · ${m.sonHurda.adet}` : (m ? YOK : null); } },
    { anahtar: 'durus', baslik: 'Son duruş', hucre: (s) => { const m = izleme(s); return m?.sonDurus ? `${saat(m.sonDurus.zaman)} ${m.sonDurus.ad ?? ''}` : (m ? YOK : null); } },
    {
      anahtar: 'bekleyen', baslik: 'Bekleyen', kartta: true, kartTamSatir: true,
      hucre: (s) => {
        const m = izleme(s);
        if (m === null) return null;
        return (
          <span className="tc-ob-eylem">
            {m.bekleyenOnay > 0 && <Rozet ton="uyari">{`${m.bekleyenOnay} onay`}</Rozet>}
            {m.kisiBekleyen > 0 && <Rozet ton="uyari">{`${m.kisiBekleyen} kişi eşlemesi`}</Rozet>}
            {m.hataliHareket > 0 && <Rozet ton="hata">{`${m.hataliHareket} yazılamadı`}</Rozet>}
          </span>
        );
      },
    },
    ...(yazabilir ? [{
      anahtar: 'eylem', baslik: 'İşlem', csv: false as const, sabit: 'sag' as const,
      hucre: (s: Satir) => <Dugme simge="route" onClick={() => { seciliYaz(s); }}>Değiştir</Dugme>,
    }] : []),
  ];
  const d = veri.data;
  return (
    <>
      <Kart baslik="Geçiş">
        <div className="tc-smartes">
          <p className="tc-smartes-aciklama">
            Üretim kaynağı makine başına seçilir; seçilmemiş makine istasyonuna uyar. SmartES’ten üreten makinede başlat, duruş, sayım ve hurda SmartES’ten gelir,
            terminalde bu düğmeler kapalıdır. Kaynak yalnız burada değişir; istasyon ve makine formlarında salt okunur görünür.
          </p>
          {veri.isPending && <DurumKutusu durum="yukleniyor" />}
          {veri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Geçiş tablosu alınamadı')} yenile={() => { void veri.refetch(); }} />}
          {d && (
            <>
              {!d.aktarimAcik && <p className="tc-sga-bant" role="note">“SmartES: sayım aktarımı” ayarı kapalı: kaynak seçimi kaydedilir ama SmartES’ten hiçbir şey aktarılmaz, terminal düğmeleri açık kalır.</p>}
              <ul className="tc-gecis-ozet">
                <li><span className="tc-sm-not">SmartES’ten üreten makine</span><strong>{d.smartesMakine}</strong></li>
                <li>
                  <span className="tc-sm-not">Bekleyen onay</span>
                  <strong>{d.bekleyenOnay.saglam + d.bekleyenOnay.hurda + d.bekleyenOnay.duzeltme + d.bekleyenOnay.hatali}</strong>
                  <span className="tc-sm-not">{`${d.bekleyenOnay.saglam} sağlam, ${d.bekleyenOnay.hurda} hurda, ${d.bekleyenOnay.duzeltme} düzeltme, ${d.bekleyenOnay.hatali} hatalı`}</span>
                </li>
                <li><span className="tc-sm-not">Eşlenmemiş neden</span><strong>{d.eslenmemisDurus + d.eslenmemisFire}</strong><span className="tc-sm-not">{`duruş ${d.eslenmemisDurus}, fire ${d.eslenmemisFire}`}</span></li>
                <li><span className="tc-sm-not">Eşlenmemiş kullanıcı</span><strong>{d.eslenmemisKullanici}</strong><span className="tc-sm-not">{`${d.kisiBekleyenHareket} hareket bekliyor`}</span></li>
              </ul>
              {/* Dokuz sütunlu izleme: geniş ekranda tablo kayar, telefonda kayıt kartı. */}
              <Tablo etiket="Üretim kaynağı geçişi" kip="kayit" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={anahtar}
                bosMesaj="SmartES’e eşlenmiş istasyon ya da makine yok." />
              {yazabilir && satirlar.some((s) => izleme(s)?.hataliHareket) && (
                <Dugme simge="play" yukleniyor={yeniden.isPending} onClick={() => { yeniden.mutate(); }}>Yazılamayan hareketleri yeniden dene</Dugme>
              )}
            </>
          )}
        </div>
      </Kart>
      {secili !== null && <DegistirPaneli satir={secili} kapat={() => { seciliYaz(null); }} />}
    </>
  );
}
