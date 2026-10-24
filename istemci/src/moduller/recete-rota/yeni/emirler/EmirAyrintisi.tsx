import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme, Girdi, OnayPenceresi, Rozet, SayiKarti, Secim, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { miktar, sayi, tarih, YOK, zaman } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { RrDurumu } from '../veri.ts';
import { AdimSeridi, BolmePaneli, bolmeSonucu, bosBolme, type BolmeDurumu } from './Bolme.tsx';
import { guncelSurum, type useEmirKomutu } from './komut.ts';
import {
  acikMi, adimDurumu, adimPlani, emirAdimlari, emirAraligi, ilerleme, malzemeIhtiyaclari, planOzeti, planSirasi, plandaMi, rotaFarki, sureMetni, yeniOpNo,
  yururluktekiRevizyon, type EmirAdimi, type Emir, type IhtiyacSatiri,
} from './kurallar.ts';
import { DURUM_TONU, planMetni, turAdi } from './gorunum.ts';

const KANBAN_YOLU = '/recete-rota/kanban';
const TALEP_YOLU = '/satin-alma/talepler';
const ADIM_DURUMU = { bekliyor: 'Bekliyor', calisiyor: 'Çalışıyor', tamam: 'Bitti' } as const;
const ADIM_TONU = { bekliyor: 'pasif', calisiyor: 'uyari', tamam: 'tamam' } as const;

interface Ozellikler {
  durum: RrDurumu;
  emir: Emir;
  yetki: EkranOzellikleri['yetki'];
  git: EkranOzellikleri['git'];
  komut: ReturnType<typeof useEmirKomutu>;
  emirAc: (id: string) => void;
}

// Emir ayrıntısı: emrin alanları burada düzenlenmez (emir Üretim Emirleri'nde tutulur, ilerleme terminalden gelir); yalnız emir
// komutları (plana al, iptal, böl, kol, rotasız adımlar, rotayı güncelle) ve stoğa tamamlama.
export function EmirAyrintisi({ durum: d, emir: o, yetki, git, komut, emirAc }: Ozellikler) {
  const yonlen = useNavigate();
  const [iptal, setIptal] = useState(false);
  const [tamamla, setTamamla] = useState(false);
  const urun = d.items?.find((i) => i.id === o.itemId) ?? null;
  const adimlar = emirAdimlari(d, o);
  const plan = planOzeti(d, d.planYerlesim, o);
  const pm = planMetni(plan);
  const il = ilerleme(d, o);
  const rev = o.rev === null ? null : d.routeRevs?.find((r) => r.id === o.rev) ?? null;
  const yururlukte = yururluktekiRevizyon(d, o.itemId);
  const fark = rotaFarki(d, o);
  const surum = { surum: o.surum };

  return (
    <div className="tc-rr3-ayrinti" aria-label={`${o.no} ayrıntısı`}>
      <dl className="tc-rr3-alanlar">
        <div><dt>Miktar</dt><dd>{miktar(o.qty, urun?.unit)}</dd></div>
        <div><dt>Başlangıç</dt><dd>{tarih(o.start)}</dd></div>
        <div><dt>Teslim</dt><dd>{tarih(o.due)}</dd></div>
        <div><dt>Öncelik</dt><dd>{['', 'Acil', 'Yüksek', 'Normal', 'Düşük'][o.priority]}</dd></div>
        <div><dt>Durum</dt><dd><Rozet ton={DURUM_TONU[o.status]}>{({ taslak: 'Taslak', serbest: 'Serbest', uretimde: 'Üretimde', tamam: 'Tamamlandı', iptal: 'İptal' })[o.status]}</Rozet></dd></div>
        <div><dt>Emir türü</dt><dd>{turAdi(o.tur)}</dd></div>
        {!o.rotasiz && (
          <div>
            <dt>Rota revizyonu</dt>
            <dd>{rev ? `${fark ? 'Emrin rotası' : 'Yürürlükteki'} (Rev ${rev.no})` : yururlukte ? `Yürürlükteki (Rev ${yururlukte.no})` : YOK}</dd>
          </div>
        )}
        <div><dt>Plan</dt><dd>{pm.metin}{pm.alt ? ` (${pm.alt})` : ''}</dd></div>
        <div><dt>İlerleme</dt><dd>{il.toplam ? `${String(il.biten)}/${String(il.toplam)} adım` : YOK}</dd></div>
      </dl>
      {o.note && <p className="tc-rr3-ipucu">{o.note}</p>}

      {fark && (
        <div className="tc-rr3-uyari-kutu" role="status">
          <Simge ad="layers" />
          <span>
            Bu emir Rev {fark.eskiNo} rotasıyla açıldı; yürürlükte Rev {fark.yeniNo} var.
            {fark.eklenen.length > 0 && ` Rotaya eklenen: ${fark.eklenen.map((x) => `OP ${String(x.opNo)}${x.ad ? ` ${x.ad}` : ''}`).join(', ')}.`}
            {fark.cikan.length > 0 && ` Rotadan çıkan: ${fark.cikan.map((x) => `OP ${String(x)}`).join(', ')}.`}
            {' '}Başlamış ya da bitmiş adımlar değişmez.
          </span>
          {yetki.rotaEmreKopyala && (
            <Dugme
              simge="rotate" yukleniyor={komut.mesgul}
              onClick={() => {
                void komut.calistir('emir-rota-guncelle', { id: o.id }).then((c) => {
                  if (!c.tamam) return;
                  const degisen = (c.sonuc as { degisenler?: string[] } | null)?.degisenler ?? [];
                  komut.bildir('tamam', degisen.length ? degisen.join(', ') : 'Emrin rotası güncellendi.');
                });
              }}
            >
              Rotayı güncelle
            </Dugme>
          )}
        </div>
      )}

      <EmirYapisi durum={d} emir={o} adimlar={adimlar} yetki={yetki} komut={komut} emirAc={emirAc} />
      {o.rotasiz && <RotasizAdimlar durum={d} emir={o} adimlar={adimlar} yetki={yetki} komut={komut} />}

      <div className="tc-rr3-arac">
        {o.status === 'taslak' && yetki.emirYaz && (
          <Dugme tur="birincil" simge="play" yukleniyor={komut.mesgul} onClick={() => { void komut.calistir('emir-serbest', { id: o.id, ...surum }, 'Emir plana alındı.'); }}>
            Plana al
          </Dugme>
        )}
        {plandaMi(o) && <Dugme simge="grid" onClick={() => { void yonlen(KANBAN_YOLU); }}>Kanbanda göster</Dugme>}
        <Dugme simge="route" onClick={() => { git('schema', o.itemId); }}>Akışta aç</Dugme>
        {acikMi(o) && yetki.emirYaz && <Dugme tur="tehlike" simge="x" onClick={() => { setIptal(true); }}>İptal et</Dugme>}
      </div>

      <PlanBolumu durum={d} emir={o} adimlar={adimlar} yetki={yetki} tamamla={() => { setTamamla(true); }} />

      <OnayPenceresi
        acik={iptal} baslik={`${o.no} iptal edilsin mi?`} onayMetni="İptal et" tehlikeli yukleniyor={komut.mesgul} vazgec={() => { setIptal(false); }}
        onayla={() => { setIptal(false); void komut.calistir('emir-iptal', { id: o.id, ...surum }, 'Emir iptal edildi.'); }}
      >
        <p>Emir iptal edilir; plandan ve terminalden kalkar.</p>
      </OnayPenceresi>
      <OnayPenceresi
        acik={tamamla} baslik={`${o.no} stoğa işlensin mi?`} onayMetni="Tamamla ve stoktan düş" yukleniyor={komut.mesgul} vazgec={() => { setTamamla(false); }}
        onayla={() => {
          setTamamla(false);
          void komut.calistir('stok-emir-tamamla', { id: o.kayitNo }, `${o.no} stoğa işlendi: kalan sarf düşüldü, çıktı üretim alanına girdi.`);
        }}
      >
        <p>Kalan sarf stoktan düşülür, çıktı üretim alanına girer.</p>
      </OnayPenceresi>
    </div>
  );
}

function EmirYapisi({ durum: d, emir: o, adimlar, yetki, komut, emirAc }: {
  durum: RrDurumu; emir: Emir; adimlar: EmirAdimi[]; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>; emirAc: (id: string) => void;
}) {
  const [katil, setKatil] = useState(false);
  const [bolme, setBolme] = useState<BolmeDurumu>(bosBolme(false));
  const emirler = d.emirler?.orders ?? [];
  const ana = o.parentId === null ? null : emirler.find((x) => x.id === o.parentId) ?? null;
  const altlar = emirler.filter((x) => x.parentId === o.id);
  const partiler = altlar.filter((x) => x.kol === null);
  const toplam = partiler.reduce((a, x) => a + x.qty, o.qty);
  const acik = acikMi(o);
  const kisa = (j: number) => { const a = adimlar[j - 1]; return a ? d.opdefs?.find((x) => x.id === a.opId)?.abbr ?? a.ad : String(j); };
  const opStatus = d.emirler?.opStatus ?? {};
  const opProg = d.emirler?.opProg ?? {};
  const baslamis = adimlar.filter((a) => {
    const k = `${o.id}|root|${String(o.kol ? a.sira - o.kol.n : a.sira)}`;
    return Object.keys(opStatus).some((x) => x === k || x.startsWith(`${k}~`)) || Object.entries(opProg).some(([x, v]) => (x === k || x.startsWith(`${k}~`)) && v > 0);
  }).map((a) => a.sira);
  const girdi = {
    anaAd: o.no, miktar: o.qty, adimSayisi: adimlar.length, aralik: emirAraligi(o, adimlar.length),
    mevcutKollar: altlar.filter((x) => x.kol !== null).map((x) => ({ n: x.kol!.n, m: x.kol!.m, miktar: x.qty })),
    bitti: (j: number) => adimDurumu(o, j, opStatus) === 'tamam',
  };

  const bol = async () => {
    const r = bolmeSonucu(girdi, bolme);
    if (!r?.hazir) { komut.bildir('hata', r?.ileti ?? r?.ipucu ?? 'Bölmeyi tamamlayın.'); return; }
    const ekAdimlar = bolme.ekler.map((e) => ({
      tur: e.tur, sonra: e.sonra, ad: e.ad.trim() || (d.opdefs?.find((x) => x.id === e.opId)?.name ?? ''), operasyonTipiId: e.opId,
      ayarSuresiDk: sureMetni(e.ayar), birimSureDk: sureMetni(e.birim), aciklama: e.aciklama.trim(),
    }));
    if (bolme.tur === 'kol') {
      const c = await komut.calistir('emir-bol', { id: o.id, adet: r.partiler[0], kolN: bolme.n, kolM: bolme.m, surum: o.surum, ekAdimlar },
        `Kol ${sayi(r.partiler[0])} adetle ${String(bolme.n)}. adımdan sonra ayrıldı, ${String(bolme.m)}. adımda ${o.no} emrine yeniden bağlanır.`);
      if (c.tamam) setBolme(bosBolme(false));
      return;
    }
    if (ekAdimlar.length && r.partiler.length !== 1) { komut.bildir('hata', 'Rework, tamir ya da ek adım yalnız tek parti ayrılırken eklenir; partileri tek tek ayırın.'); return; }
    let surum: number | null = o.surum;
    for (const q of r.partiler) {
      const c = await komut.calistir('emir-bol', { id: o.id, adet: q, surum, ...(ekAdimlar.length ? { ekAdimlar } : {}) });
      if (!c.tamam) return;
      surum = guncelSurum(c.durum, o.id);
    }
    setBolme(bosBolme(false));
    komut.bildir('tamam', `${o.no} bölündü: ${String(r.partiler.length)} alt emir açıldı.`);
  };

  return (
    <div className="tc-rr3-yapi">
      {o.parentId !== null && (
        <p className="tc-rr3-ipucu">
          {o.kol
            ? `Kol emri: ana emrin ${String(o.kol.n)}. adımından sonra ${sayi(o.qty)} adetle ayrılır, ${String(o.kol.m)}. adımında ana emre yeniden bağlanır; ara adımları bu emir, ana emir de kalan miktarla yapar.`
            : 'Alt emir: ana emre bağlı parti.'}
          {ana ? '' : ' Ana emri listede yok.'}
        </p>
      )}
      {o.parentId !== null && (
        <div className="tc-rr3-arac">
          {ana && <Dugme simge="back" onClick={() => { emirAc(ana.id); }}>Ana emir {ana.no}</Dugme>}
          {ana && acik && yetki.emirYaz && (
            <Dugme
              yukleniyor={komut.mesgul}
              onClick={() => {
                void komut.calistir('emir-birlestir', { id: o.id, surum: o.surum }, `${o.no} ${ana.no} emrine geri katıldı.`)
                  .then((c) => { if (c.tamam) emirAc(ana.id); });
              }}
            >
              {o.kol ? 'Kolu geri al' : 'Ana emre geri kat'}
            </Dugme>
          )}
        </div>
      )}
      {o.kol && acik && (
        <div className="tc-rr3-katil">
          <h4>Katılma adımı</h4>
          <p className="tc-rr3-ipucu">Bu kol ana emre {o.kol.m} {kisa(o.kol.m)} adımında katılır.</p>
          {yetki.emirYaz && (
            <Dugme aria-expanded={katil} onClick={() => { setKatil(!katil); }}>Katılma adımını değiştir</Dugme>
          )}
          {katil && yetki.emirYaz && (
            <>
              <p className="tc-rr3-ipucu">Kolun ana emre katılacağı yeni adımı seçin; seçim hemen uygulanır.</p>
              <AdimSeridi
                etiket="Katılma adımı" adimlar={adimlar} opdefs={d.opdefs} istasyonlar={d.stations}
                durum={(j) => (j === o.kol!.n ? ['ayril', 'Kol bu adımdan sonra ayrılır'] : j === o.kol!.m ? ['birles', 'Şu an burada katılır']
                  : j > o.kol!.n && j < o.kol!.m ? ['kol', 'Kol yapar'] : ['', ''])}
                secili={(j) => j === o.kol!.m}
                sec={(j) => {
                  setKatil(false);
                  void komut.calistir('emir-katilma', { id: o.id, m: j, surum: o.surum }, `${o.no} ${String(j)}. adımda ${ana?.no ?? 'ana emre'} bağlanır.`);
                }}
              />
            </>
          )}
        </div>
      )}
      {altlar.length > 0 && <p className="tc-rr3-ipucu">{altlar.length} alt emir listede bu emrin altında görünür.</p>}
      {partiler.length > 0 && (
        <p className="tc-rr3-ipucu">Parti toplamı: ana emir {sayi(o.qty)} + alt emirler {sayi(toplam - o.qty)} = {sayi(toplam)}</p>
      )}
      {acik && yetki.emirYaz && adimlar.length > 0 && (
        <div className="tc-rr3-bol">
          <h4>Böl</h4>
          <BolmePaneli
            yeni={false} girdi={girdi} adimlar={adimlar} baslamis={baslamis} opdefs={d.opdefs} istasyonlar={d.stations} deger={bolme} degistir={setBolme}
            gonder={() => { void bol(); }} vazgec={() => { setBolme(bosBolme(false)); }} mesgul={komut.mesgul}
          />
        </div>
      )}
    </div>
  );
}

// Rotasız emir: adımlar emrin kendisindedir; yalnız başlamamış adım düzenlenir ya da silinir.
function RotasizAdimlar({ durum: d, emir: o, adimlar, yetki, komut }: {
  durum: RrDurumu; emir: Emir; adimlar: EmirAdimi[]; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>;
}) {
  const acik = acikMi(o) && yetki.emirYaz;
  const [duzen, setDuzen] = useState<{ opNo: number; ad: string; opId: string; ayar: string; birim: string } | null>(null);
  const [yeni, setYeni] = useState({ opId: '', ad: '', ayar: '', birim: '' });
  const [sil, setSil] = useState<number | null>(null);
  const opSecenekleri = (secili: string) => (d.opdefs ?? []).filter((x) => x.aktif || x.id === secili).map((x) => ({ deger: x.id, baslik: `${x.abbr ?? x.code} ${x.name}` }));
  const kaynak = (o.adimlar ?? []);
  const sutunlar: Sutun<EmirAdimi>[] = [
    { anahtar: 'op', baslik: 'Op', hucre: (a) => a.opNo, hizala: 'sag', mono: true },
    { anahtar: 'ad', baslik: 'Ad', hucre: (a) => a.ad },
    { anahtar: 'operasyon', baslik: 'Operasyon', hucre: (a) => { const x = d.opdefs?.find((p) => p.id === a.opId); return x ? `${x.abbr ?? x.code} ${x.name}` : null; } },
    { anahtar: 'ayar', baslik: 'Hazırlık (dk)', hizala: 'sag', hucre: (a) => sayi(kaynak.find((k) => k.opNo === a.opNo)?.setup ?? null) },
    { anahtar: 'birim', baslik: 'Birim (dk)', hizala: 'sag', hucre: (a) => sayi(kaynak.find((k) => k.opNo === a.opNo)?.cycle ?? null) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (a) => ADIM_DURUMU[a.durum ?? 'bekliyor'] },
    {
      anahtar: 'eylem', baslik: 'İşlem', csv: false,
      hucre: (a) => (acik && (a.durum ?? 'bekliyor') === 'bekliyor' ? (
        <span className="tc-rr3-eylemler">
          <Dugme simge="edit" onClick={() => {
            const k = kaynak.find((x) => x.opNo === a.opNo);
            setDuzen({ opNo: a.opNo, ad: a.ad, opId: a.opId ?? '', ayar: k?.setup === null || k?.setup === undefined ? '' : String(k.setup), birim: k?.cycle === null || k?.cycle === undefined ? '' : String(k.cycle) });
          }}
          >
            Düzenle
          </Dugme>
          <Dugme simge="trash" onClick={() => { setSil(a.opNo); }}>Sil</Dugme>
        </span>
      ) : null),
    },
  ];
  const ekle = () => {
    const op = d.opdefs?.find((x) => x.id === yeni.opId);
    if (!op) { komut.bildir('hata', 'Önce operasyonu seçin.'); return; }
    const son = adimlar.at(-1);
    const ad = yeni.ad.trim() || op.name;
    void komut.calistir('emir-adim-ekle', {
      id: o.id, surum: o.surum, oncekiOpNo: son ? son.opNo : null, opNo: yeniOpNo(adimlar), ad, operasyonTipiId: op.id,
      ayarSuresiDk: sureMetni(yeni.ayar), birimSureDk: sureMetni(yeni.birim),
    }, `${ad} adımı eklendi.`).then((c) => { if (c.tamam) setYeni({ opId: '', ad: '', ayar: '', birim: '' }); });
  };

  return (
    <div className="tc-rr3-rotasiz">
      <h4>Adımlar <small>Rotasız emir: adımlar bu emre aittir.</small></h4>
      <Tablo
        etiket={`${o.no} adımları`} sutunlar={sutunlar} satirlar={adimlar} satirAnahtari={(a) => a.opNo}
        bosMesaj="Bu emrin henüz adımı yok. Adım eklenene kadar plana ve terminale gitmez."
      />
      {acik && (
        <div className="tc-rr3-satir" role="group" aria-label="Yeni adım">
          <Secim etiket="Operasyon" bosSecenek="Seçin" value={yeni.opId} secenekler={opSecenekleri(yeni.opId)} onChange={(e) => { setYeni({ ...yeni, opId: e.target.value }); }} />
          <Girdi etiket="Adım adı" placeholder="Boşsa operasyon adı" value={yeni.ad} onChange={(e) => { setYeni({ ...yeni, ad: e.target.value }); }} />
          <Girdi etiket="Hazırlık süresi (dk)" inputMode="decimal" value={yeni.ayar} onChange={(e) => { setYeni({ ...yeni, ayar: e.target.value }); }} />
          <Girdi etiket="Birim süre (dk)" inputMode="decimal" value={yeni.birim} onChange={(e) => { setYeni({ ...yeni, birim: e.target.value }); }} />
          <Dugme tur="birincil" simge="plus" yukleniyor={komut.mesgul} onClick={ekle}>Adım ekle</Dugme>
        </div>
      )}
      {duzen && (
        <div className="tc-rr3-satir" role="group" aria-label={`OP ${String(duzen.opNo)} düzenle`}>
          <Girdi etiket="Adım adı" value={duzen.ad} onChange={(e) => { setDuzen({ ...duzen, ad: e.target.value }); }} />
          <Secim etiket="Operasyon" value={duzen.opId} secenekler={opSecenekleri(duzen.opId)} onChange={(e) => { setDuzen({ ...duzen, opId: e.target.value }); }} />
          <Girdi etiket="Hazırlık süresi (dk)" inputMode="decimal" value={duzen.ayar} onChange={(e) => { setDuzen({ ...duzen, ayar: e.target.value }); }} />
          <Girdi etiket="Birim süre (dk)" inputMode="decimal" value={duzen.birim} onChange={(e) => { setDuzen({ ...duzen, birim: e.target.value }); }} />
          <Dugme
            tur="birincil" simge="check" yukleniyor={komut.mesgul}
            onClick={() => {
              const g = duzen;
              setDuzen(null);
              void komut.calistir('emir-adim-duzenle', {
                id: o.id, surum: o.surum, opNo: g.opNo, ad: g.ad.trim(), operasyonTipiId: g.opId, ayarSuresiDk: sureMetni(g.ayar), birimSureDk: sureMetni(g.birim),
              }, 'Adım kaydedildi.');
            }}
          >
            Kaydet
          </Dugme>
          <Dugme onClick={() => { setDuzen(null); }}>Vazgeç</Dugme>
        </div>
      )}
      <OnayPenceresi
        acik={sil !== null} baslik={`OP ${String(sil ?? '')} silinsin mi?`} onayMetni="Sil" tehlikeli yukleniyor={komut.mesgul} vazgec={() => { setSil(null); }}
        onayla={() => { const opNo = sil; setSil(null); void komut.calistir('emir-adim-sil', { id: o.id, surum: o.surum, opNo }, 'Adım silindi.'); }}
      >
        <p>Başlamamış adım emirden çıkar.</p>
      </OnayPenceresi>
    </div>
  );
}

interface OpSatiri { adim: EmirAdimi; durum: 'bekliyor' | 'calisiyor' | 'tamam'; baslangic: string | null; makine: string | null; saglam: number | null }

// Plan bölümü: emir plandaysa (serbest ya da üretimde) adımların yerleşimi, malzeme ihtiyacı, yan ürün ve tamamlama.
function PlanBolumu({ durum: d, emir: o, adimlar, yetki, tamamla }: {
  durum: RrDurumu; emir: Emir; adimlar: EmirAdimi[]; yetki: EkranOzellikleri['yetki']; tamamla: () => void;
}) {
  const yonlen = useNavigate();
  const ihtiyaclar = useMemo(() => malzemeIhtiyaclari(d), [d]);
  if (!plandaMi(o)) {
    const metin = o.status === 'taslak' ? 'Taslak emirler plana girmez. Plana alınca yerleşir.'
      : o.status === 'tamam' ? 'Bu emir tamamlandı.' : 'Bu emir iptal edildi.';
    return <p className="tc-rr3-ipucu">{metin}</p>;
  }
  const R = ihtiyaclar.get(o.id) ?? null;
  const sira = planSirasi(d).findIndex((x) => x.id === o.id);
  const plan = planOzeti(d, d.planYerlesim, o);
  const { ilk, son } = emirAraligi(o, adimlar.length);
  const opStatus = d.emirler?.opStatus ?? {};
  const opProg = d.emirler?.opProg ?? {};
  const makineKodu = (id: string) => d.machines?.find((m) => m.id === id)?.code ?? id;
  const ops: OpSatiri[] = adimlar.filter((a) => a.sira >= ilk && a.sira <= son).map((a) => {
    const p = adimPlani(d.planYerlesim, o.no, a.opNo);
    const k = `${o.id}|root|${String(o.kol ? a.sira - o.kol.n : a.sira)}`;
    return {
      adim: a, durum: a.durum ?? adimDurumu(o, a.sira, opStatus), baslangic: p?.baslangic ?? null,
      makine: p && p.makineIdler.length ? p.makineIdler.map(makineKodu).join(', ') : null, saglam: opProg[k] ?? null,
    };
  });
  const birim = (id: string) => d.items?.find((i) => i.id === id)?.unit ?? null;
  const kart = (id: string) => d.items?.find((i) => i.id === id) ?? null;
  const tutar = (e: IhtiyacSatiri): string | null => {
    const k = kart(e.malzemeId);
    const m = k && d.maliyet ? d.maliyet.malzeme[String(k.kayitNo)] : undefined;
    return m ? `${sayi(e.alinacak * Number(m.birimMaliyet))} ${m.paraBirimi}` : null;
  };
  const opSutunlari: Sutun<OpSatiri>[] = [
    { anahtar: 'sira', baslik: 'Sıra', hucre: (s) => s.adim.sira, hizala: 'sag' },
    { anahtar: 'op', baslik: 'OP', hucre: (s) => s.adim.opNo, mono: true },
    { anahtar: 'kisa', baslik: 'Kısaltma', hucre: (s) => d.opdefs?.find((x) => x.id === s.adim.opId)?.abbr ?? s.adim.ad },
    { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (s) => d.stations?.find((x) => x.id === s.adim.stationId)?.name ?? null },
    { anahtar: 'baslangic', baslik: 'Plan başlangıç', hucre: (s) => (s.durum === 'tamam' ? '–' : s.baslangic ? zaman(s.baslangic) : null) },
    { anahtar: 'makine', baslik: 'Makine', hucre: (s) => s.makine },
    { anahtar: 'saglam', baslik: 'Sağlam', hizala: 'sag', hucre: (s) => (s.saglam === null ? null : sayi(s.saglam)) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (s) => <Rozet ton={ADIM_TONU[s.durum]}>{ADIM_DURUMU[s.durum]}</Rozet> },
  ];
  const hamSutunlar: Sutun<IhtiyacSatiri>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (e) => kart(e.malzemeId)?.code ?? e.malzemeId, mono: true },
    { anahtar: 'ad', baslik: 'Malzeme', hucre: (e) => kart(e.malzemeId)?.name ?? null },
    { anahtar: 'brut', baslik: 'Brüt', hizala: 'sag', hucre: (e) => miktar(e.brut, birim(e.malzemeId)) },
    { anahtar: 'stoktan', baslik: 'Stoktan', hizala: 'sag', hucre: (e) => miktar(e.stoktan, birim(e.malzemeId)) },
    { anahtar: 'alinacak', baslik: 'Alınacak', hizala: 'sag', hucre: (e) => miktar(e.alinacak, birim(e.malzemeId)) },
    ...(yetki.maliyetOku ? [{ anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag' as const, hucre: tutar }] : []),
  ];
  const yanSutunlar: Sutun<{ malzemeId: string; miktar: number }>[] = [
    { anahtar: 'kod', baslik: 'Kod', hucre: (e) => kart(e.malzemeId)?.code ?? e.malzemeId, mono: true },
    { anahtar: 'ad', baslik: 'Malzeme', hucre: (e) => kart(e.malzemeId)?.name ?? null },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (e) => miktar(e.miktar, birim(e.malzemeId)) },
  ];
  const ipuclari = [
    ...(plan.tur === 'plan' && plan.gecikiyor ? [`Son açık adım teslimden sonra başlıyor (${tarih(plan.son)}, teslim ${tarih(o.due)}).`] : []),
    ...(plan.tur === 'yerlesmedi' ? ['Emrin açık adımları plan motorunun yerleşiminde yok: rota, istasyon ya da vardiya eksik olabilir.'] : []),
    ...(R && R.eksikler.length ? [`${String(R.eksikler.length)} kalem malzeme stokta yetersiz.`] : []),
    ...(R?.uyarilar ?? []),
  ];

  return (
    <section className="tc-rr3-plan" aria-label={`${o.no} planı`}>
      <div className="tc-rr3-kpi">
        <SayiKarti baslik="Plan (son adım)" simge="gantt" metin={planMetni(plan).metin} altMetin={`Teslim ${tarih(o.due)}`} ton={plan.tur === 'plan' && plan.gecikiyor ? 'hata' : 'bilgi'} />
        <SayiKarti baslik="Plan sırası" simge="list" metin={sira >= 0 ? `${String(sira + 1)}. emir` : YOK} altMetin="Öncelik ve teslim tarihine göre" />
        <SayiKarti baslik="Eksik malzeme" simge="box" sayi={R ? R.eksikler.length : null} ton="uyari" altMetin="kalem" />
      </div>
      {ipuclari.length > 0 && <ul className="tc-rr3-mesajlar">{ipuclari.map((t) => <li key={t}>{t}</li>)}</ul>}
      <h4>Operasyonlar</h4>
      <Tablo etiket={`${o.no} operasyonları`} sutunlar={opSutunlari} satirlar={ops} satirAnahtari={(s) => s.adim.sira} bosMesaj="Adım yok." />
      {!o.rotasiz && (
        <p className="tc-rr3-ipucu">
          Fason adımlar atölye kapasitesi kullanmaz. Bu emirde bir adımı iç üretimden fasona ya da fasondan içeri almak için{' '}
          <button type="button" className="tc-rr3-bag" onClick={() => { void yonlen(`/uretim-emirleri/${String(o.kayitNo)}`); }}>Üretim Emirleri'nde iç ve dış üretim</button>.
          Rota değişmez.
        </p>
      )}
      <div className="tc-rr3-iki">
        <div>
          <h4>Malzeme ihtiyacı</h4>
          <Tablo etiket={`${o.no} malzeme ihtiyacı`} sutunlar={hamSutunlar} satirlar={R?.hammadde ?? []} satirAnahtari={(e) => e.malzemeId} bosMesaj="Satın alınacak malzeme yok." />
        </div>
        <div>
          <h4>Yan ürün ve hurda</h4>
          <Tablo etiket={`${o.no} yan ürünleri`} sutunlar={yanSutunlar} satirlar={R?.yanUrun ?? []} satirAnahtari={(e) => e.malzemeId} bosMesaj="Yan ürün ya da hurda çıkmıyor." />
        </div>
      </div>
      <h4>Stok ve tamamlama</h4>
      {R && R.eksikler.length > 0 ? (
        <>
          <p className="tc-rr3-ipucu">
            {R.eksikler.length} kalem eksik: {R.eksikler.map((e) => `${kart(e.malzemeId)?.code ?? e.malzemeId} ${miktar(e.alinacak, birim(e.malzemeId))}`).join(', ')}.
            Stok, plan sırasında önceki emirlere ayrıldıktan sonra kalan miktara göre hesaplanır.
          </p>
          <div className="tc-rr3-arac">
            <Dugme simge="cart" onClick={() => { void yonlen(TALEP_YOLU); }}>Satın alma talebi aç</Dugme>
          </div>
        </>
      ) : o.kol ? (
        <p className="tc-rr3-ipucu">Bu kol ana emre bağlıdır; ana emir tamamlanınca birlikte tamamlanır ve girenleri stoktan düşer.</p>
      ) : (
        <>
          <p className="tc-rr3-ipucu">
            Tüm girenler stokta. Tamamladığınızda kalan sarf stoktan düşülür, {miktar(o.qty, kart(o.itemId)?.unit)} {kart(o.itemId)?.code ?? ''} üretim alanına girer.
            {ops.filter((s) => s.durum !== 'tamam').length > 0 ? ` ${String(ops.filter((s) => s.durum !== 'tamam').length)} adım henüz bitmedi.` : ''}
          </p>
          {yetki.stokGiris && (
            <div className="tc-rr3-arac"><Dugme tur="birincil" simge="check" onClick={tamamla}>Emri tamamla, stoktan düş</Dugme></div>
          )}
        </>
      )}
    </section>
  );
}
