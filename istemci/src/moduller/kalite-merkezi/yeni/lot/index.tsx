import { useEffect, useState } from 'react';
import {
  Dugme, Girdi, OnayPenceresi, Rozet, SayfaBasligi, Secim, useBildirim, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { butunAnahtarlar, c0Numune, SIKI } from '../aql.ts';
import { trd } from '../bicim.ts';
import { KayitListesi } from '../KayitListesi.tsx';
import { bugun } from '../kurallar.ts';
import { useOnizleme } from '../Onizleme.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { Lot } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import { CubukGrafigi } from '../spc/Grafik.tsx';
import { kayitCsvIndir, type CsvSutunlari } from '../muayene/csv.ts';
import { KILIT_YASAK, KilitPenceresi, kilitKarari } from '../muayene/Kilit.tsx';
import {
  aqlMetni, lotRetNcrOnDegeri, lotSayaci, lotSuz, retAciklamasi, sikilikTonu, tedarikciAdi, tedarikciBazinda, varsayilanAql, type LotDegeri,
} from './hesap.ts';
import { LotBelgesi, PlanBelgesi } from './LotBelgesi.tsx';
import { LotFormu } from './LotFormu.tsx';
import { Sihirbaz, type SihirbazDurumu } from './Sihirbaz.tsx';
import { AnaTablo, KodTablosu } from './Tablolar.tsx';
import './lot.css';

export const LotKabulSayaci: KmSayaci = (veri) => lotSayaci(veri.lot);

// Uygulamadaki CSV sütunları (CSV_COLS.lot).
export const LOT_CSV: CsvSutunlari = [
  ['no', 'Kayıt no'], ['tarih', 'Tarih'], ['parcaNo', 'Parça no'], ['lotNo', 'Lot'], ['N', 'Parti'], ['seviye', 'Seviye'], ['siddet', 'Sıkılık'],
  ['kr', 'Kritik'], ['mj', 'Majör AQL'], ['mn', 'Minör AQL'], ['bKr', 'Bulunan kritik'], ['bMj', 'Bulunan majör'], ['bMn', 'Bulunan minör'],
  ['karar', 'Karar'], ['muayeneci', 'Muayeneci'],
];

type Form = { kayit: Lot | null; on?: Partial<Lot> } | null;

export function LotKabul({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const onizle = useOnizleme();
  const v = varsayilanAql(veri.ayarlar);
  const [f, fYaz] = useState<SihirbazDurumu>({ step: 0, N: '', lvl: v.seviye, sev: 'Normal', kr: v.kr, mj: v.mj, mn: v.mn, cls: 'Majör', key: '' });
  const [c0, c0Yaz] = useState({ N: '1500', L: '1', C: '95' });
  const [form, formYaz] = useState<Form>(null);
  const [kilit, kilitYaz] = useState<Lot | null>(null);
  const [ret, retYaz] = useState<LotDegeri | null>(null);
  const [silinecek, silinecekYaz] = useState<Lot | null>(null);
  const [yenidenBaslat, yenidenBaslatYaz] = useState<string | null>(null);

  const ac = (l: Lot) => {
    const k = kilitKarari('lot', l, yetki);
    if (k === 'yasak') { bildir('hata', KILIT_YASAK); return; }
    if (k === 'sor') { kilitYaz(l); return; }
    formYaz({ kayit: l });
  };

  useEffect(() => {
    if (!gecis) return;
    gecisTamam();
    if (gecis.ac === 'yeni') { if (yetki.yaz) formYaz({ kayit: null, on: gecis.on as Partial<Lot> | undefined }); return; }
    const l = gecis.ac ? veri.lot.find((x) => x._id === gecis.ac) : undefined;
    if (l && yetki.yaz) ac(l);
  }, [gecis]);

  const anahtarlar = butunAnahtarlar(veri.lot);
  const lotlar = lotSuz(veri.lot);
  const c0n = c0Numune(Number(c0.N) || 0, parseFloat(String(c0.L).replace(',', '.')), Number(c0.C));
  const rapor = (l: Lot) => { onizle(`${l.no ?? ''} lot kabul kaydı`, `LotKabul_${l.no ?? ''}`, <LotBelgesi veri={veri} l={l} />); };
  const sup = tedarikciBazinda(veri.lot, veri.sup);

  const sutunlar: Sutun<Lot>[] = [
    { anahtar: 'no', baslik: 'Kayıt', hucre: (l) => <><span className="tc-km2-kod">{l.no}</span><span className="tc-km2-iki">{`${trd(l.tarih)}${l.yenidenSunum ? ', yeniden sunum' : ''}`}</span></>, kirilmaz: true },
    { anahtar: 'parca', baslik: 'Parça', hucre: (l) => <>{l.parcaNo}<span className="tc-km2-iki">{`lot ${l.lotNo || '—'}`}</span></> },
    { anahtar: 'ted', baslik: 'Tedarikçi', hucre: (l) => tedarikciAdi(veri.sup, l.tedarikci) },
    { anahtar: 'N', baslik: 'Parti', hucre: (l) => Number(l.N ?? 0).toLocaleString('tr-TR'), hizala: 'sag', mono: true },
    { anahtar: 'siddet', baslik: 'Sıkılık', hucre: (l) => <Rozet ton={sikilikTonu(l.siddet || 'Normal')}>{l.siddet || 'Normal'}</Rozet> },
    {
      anahtar: 'plan', baslik: 'Majör plan', hucre: (l) => {
        const p = l.plan?.['Majör'];
        return <>{p ? `n ${p.n}, Ac ${p.ac} / Re ${p.re}` : '—'}<span className="tc-km2-iki">{`${l.seviye ?? ''} / AQL ${aqlMetni(l.mj ?? '')}`}</span></>;
      },
    },
    { anahtar: 'bulunan', baslik: 'Bulunan K / M / m', hucre: (l) => [l.bKr, l.bMj, l.bMn].map((x) => x ?? '—').join(' / '), mono: true },
    { anahtar: 'karar', baslik: 'Karar', hucre: (l) => <Rozet ton={l.karar === 'Kabul' ? 'tamam' : 'hata'}>{l.karar || '—'}</Rozet> },
    {
      anahtar: 'islem', baslik: '', hucre: (l) => (
        // Satır tıklaması kaydı açar; satırdaki düğme yalnız kendi işini yapsın.
        <span className="tc-km2-eylemler" onClick={(e) => { e.stopPropagation(); }}>
          <Dugme simge="printer" onClick={() => { rapor(l); }}>Rapor</Dugme>
          {yetki.silebilir('lot') && <Dugme tur="tehlike" simge="trash" onClick={() => { silinecekYaz(l); }}>Sil</Dugme>}
        </span>
      ),
    },
  ];

  const yenidenBaslatOnayla = async (k: string) => {
    const son = veri.lot.filter((l) => l.anahtar === k).slice(-1)[0];
    try {
      await komut.kaydet('lot', { tip: 'reset', anahtar: k, parcaNo: son?.parcaNo ?? '', tedarikci: son?.tedarikci ?? '', tarih: bugun(), no: `RESET-${bugun()}` });
      bildir('tamam', 'Sıkılaştırılmış muayeneyle yeniden başlatıldı');
    } catch { bildir('hata', 'Yeniden başlatılamadı.'); }
  };

  const varsayilanYap = async () => {
    try {
      await komut.ayarKaydet({ ...veri.ayarlar, seviye: f.lvl, kritik: f.kr, major: f.mj, minor: f.mn });
      bildir('tamam', 'Varsayılan AQL ve seviye kaydedildi');
    } catch { bildir('hata', 'Varsayılan kaydedilemedi.'); }
  };

  return (
    <div className="tc-km2-lot">
      <SayfaBasligi
        baslik="AQL ve numune alma" simge="target"
        alt="Numune planını adım adım belirleyin: her adımda ISO 2859-1 / ANSI-ASQ Z1.4 tablosunun ilgili kısmı gösterilir, sonunda planı önizleyip lot kaydına aktarırsınız."
        birincil={yetki.yaz ? { etiket: 'Lot kabul kaydı', simge: 'plus', yap: () => { formYaz({ kayit: null }); } } : undefined}
      />
      <Sihirbaz
        veri={veri} f={f} degistir={(p) => { fYaz((o) => ({ ...o, ...p })); }}
        ayarYetkisi={yetki.ayar} yazYetkisi={yetki.yaz}
        onizle={() => { const N = Math.floor(Number(f.N)); onizle(`Numune alma planı (${N})`, `NumunePlani_${N}`, <PlanBelgesi veri={veri} f={f} />); }}
        lotOlustur={() => {
          const kk = f.key ? anahtarlar.find((x) => x.k === f.key) : undefined;
          formYaz({ kayit: null, on: { N: Math.floor(Number(f.N)), seviye: f.lvl, kr: f.kr, mj: f.mj, mn: f.mn, parcaNo: kk?.son.parcaNo ?? '', parcaAdi: kk?.son.parcaAdi ?? '', tedarikci: kk?.son.tedarikci ?? '' } });
        }}
        varsayilanYap={() => { void varsayilanYap(); }}
      />
      <div className="tc-km2-iki-sutun">
        <section className="tc-km2-panel">
          <h3 className="tc-km2-bolum">Sıfır kabul (c=0) planı</h3>
          <p className="tc-km2-kucuk">Kritik ve emniyet karakteristiklerinde: numunede hiç hata yoksa partiyi kabul et.</p>
          <div className="tc-km2-izgara">
            <Girdi etiket="Parti (N)" type="number" min={1} value={c0.N} onChange={(e) => { c0Yaz({ ...c0, N: e.target.value }); }} />
            <Girdi etiket="Kabul edilemez hata oranı (%)" inputMode="decimal" value={c0.L} onChange={(e) => { c0Yaz({ ...c0, L: e.target.value }); }} />
            <Secim etiket="Güven düzeyi" value={c0.C} secenekler={['90', '95', '99'].map((c) => ({ deger: c, baslik: `%${c}` }))} onChange={(e) => { c0Yaz({ ...c0, C: e.target.value }); }} />
          </div>
          {c0n ? (
            <div className="tc-km2-c0">
              <div><b className="tc-km2-cok-buyuk">{c0n}</b><span>birim, Ac 0, Re 1</span></div>
              <p>{`Bu ${c0n} birimde hiç uygunsuzluk yoksa partideki hata oranının %${c0.L} altında olduğu %${c0.C} güvenle söylenebilir.${c0n >= Number(c0.N) ? ' Numune partiye eşit: %100 muayene.' : ''}`}</p>
            </div>
          ) : <p className="tc-km2-kucuk">0 ile 100 arasında bir oran girin.</p>}
        </section>
        <section className="tc-km2-panel">
          <h3 className="tc-km2-bolum">Sıkılık durumu</h3>
          <p className="tc-km2-kucuk">Parça ve tedarikçi bazında, lot geçmişinden otomatik</p>
          {anahtarlar.length ? (
            <ul className="tc-km2-sikilik">
              {anahtarlar.map(({ k, son, s }) => (
                <li key={k}>
                  <div><b>{son.parcaNo}</b><span className="tc-km2-iki">{tedarikciAdi(veri.sup, son.tedarikci)}</span></div>
                  <div><Rozet ton={sikilikTonu(s.st)}>{s.st}</Rozet><span className="tc-km2-iki">{s.sonraki}</span></div>
                  <span className="tc-km2-noktalar" aria-label={`Son lotlar: ${s.gecmis.map((o) => (o ? 'kabul' : 'ret')).join(', ')}`}>
                    {s.gecmis.map((o, i) => <span key={i} className={o ? undefined : 'tc-km2-nokta-ret'} title={o ? 'Kabul' : 'Ret'} />)}
                  </span>
                  {s.st === 'Durduruldu' && yetki.kapat && <Dugme simge="rotate" onClick={() => { yenidenBaslatYaz(k); }}>Yeniden başlat</Dugme>}
                </li>
              ))}
            </ul>
          ) : <p className="tc-km2-kucuk">Lot kaydı girildikçe burada görünür.</p>}
        </section>
      </div>
      <details className="tc-km2-panel tc-km2-referans">
        <summary>Referans tablolar: kod harfleri, normal ve sıkılaştırılmış ana tablolar</summary>
        <h4 className="tc-km2-bolum">Tablo 1: kod harfleri</h4>
        <KodTablosu N={Math.floor(Number(f.N)) >= 2 ? Math.floor(Number(f.N)) : 0} seviye={f.lvl} />
        <h4 className="tc-km2-bolum">Tablo 2-A: normal muayene</h4>
        <AnaTablo siddet="Normal" vurgu={null} />
        <h4 className="tc-km2-bolum">Tablo 2-B: sıkılaştırılmış muayene</h4>
        <AnaTablo siddet={SIKI} vurgu={null} />
      </details>
      <h3 className="tc-km2-baslik">Lot kabul kayıtları</h3>
      <KayitListesi<Lot>
        etiket="Lot kabul kayıtları" satirlar={lotlar} sutunlar={sutunlar} arsivli
        sag={<Dugme tur="ikincil" simge="download" onClick={() => { kayitCsvIndir('lot', veri.lot, LOT_CSV); }}>CSV</Dugme>}
        ac={yetki.yaz ? ac : rapor}
        bos='Henüz lot kabul kaydı yok. Sihirbazla plan belirleyip "Bu planla lot kaydı oluştur" diyebilirsiniz.'
      />
      {lotlar.length > 0 && (
        <section className="tc-km2-panel">
          <h3 className="tc-km2-bolum">Tedarikçi bazında lot sonuçları</h3>
          <p className="tc-km2-kucuk">İlk sunum lotları</p>
          <CubukGrafigi
            etiket="Tedarikçi bazında lot sonuçları" yatay yigin
            kategoriler={sup.map((x) => x.ad)}
            seriler={[{ ad: 'Kabul', degerler: sup.map((x) => x.kabul), renk: 'tamam' }, { ad: 'Ret', degerler: sup.map((x) => x.ret), renk: 'hata' }]}
          />
        </section>
      )}
      {form && <LotFormu veri={veri} yetki={yetki} kayit={form.kayit} on={form.on} kapat={() => { formYaz(null); }} retOldu={retYaz} />}
      {kilit && (
        <KilitPenceresi
          yetki={yetki} kol="lot" kimlik={kilit._id} no={kilit.no ?? ''}
          devam={() => { const k = kilit; kilitYaz(null); formYaz({ kayit: k }); }} vazgec={() => { kilitYaz(null); }}
        />
      )}
      <OnayPenceresi
        acik={ret !== null} baslik="Lot reddedildi" onayMetni="NCR aç"
        onayla={() => { const d = ret; retYaz(null); if (d) git('uygunsuzluklar', { ac: 'yeni', on: lotRetNcrOnDegeri(d) }); }}
        vazgec={() => { retYaz(null); }}
      >
        {ret && <p>{`${ret.no ?? ''} reddedildi. ${retAciklamasi(ret)}. Uygun olmayan ürün için NCR açılsın mı?`}</p>}
      </OnayPenceresi>
      <OnayPenceresi
        acik={yenidenBaslat !== null} baslik="Kabul muayenesini yeniden başlat" onayMetni="Yeniden başlat"
        onayla={() => { const k = yenidenBaslat; yenidenBaslatYaz(null); if (k) void yenidenBaslatOnayla(k); }}
        vazgec={() => { yenidenBaslatYaz(null); }}
      >
        <p>Tedarikçinin düzeltici faaliyeti doğrulandıysa bu parça için kabul muayenesi <b>sıkılaştırılmış</b> sıkılıkla yeniden başlar.</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={silinecek !== null} baslik="Kaydı sil" onayMetni="Sil" tehlikeli
        onayla={() => {
          const r = silinecek; silinecekYaz(null);
          if (r) void komut.sil('lot', r._id).then(() => { bildir('tamam', 'Kayıt silindi'); }, () => { bildir('hata', 'Kayıt silinemedi.'); });
        }}
        vazgec={() => { silinecekYaz(null); }}
      >
        {silinecek && <p><b>{silinecek.no}</b> kalıcı olarak silinecek. Bağlı kayıtlardaki referanslar kalır.</p>}
      </OnayPenceresi>
    </div>
  );
}
