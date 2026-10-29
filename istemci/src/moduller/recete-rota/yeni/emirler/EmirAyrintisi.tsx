import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme, Girdi, Menu, OnayPenceresi, Rozet, Secim, Simge, Tablo, type MenuOgesi, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { miktar, sayi, tarih, YOK, zaman } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useStokOkumasi, type RrDurumu } from '../veri.ts';
import { AdimSeridi, BolmePaneli, bolmeSonucu, bosBolme, type BolmeDurumu } from './Bolme.tsx';
import { guncelSurum, type useEmirKomutu } from './komut.ts';
import {
  acikMi, adimDurumu, adimPlani, durumAdi, emirAdimlari, emirAraligi, ilerleme, malzemeIhtiyaclari, planOzeti, planSirasi, plandaMi, rotaFarki, stokKartiIdleri, sureMetni,
  ONCELIK_ADI, yeniOpNo, yururluktekiRevizyon, type EmirAdimi, type Emir, type IhtiyacSatiri,
} from './kurallar.ts';
import { planMetni, tamponRozeti, turAdi, type TamponRozeti } from './gorunum.ts';

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
  kapat: () => void;
}

// Eski ekranın plan hücresi: tarih renkli kalın yazı, tampon yanında küçük hap; tarih yoksa düz metin (plan dışı, motor yok).
export function PlanHucresi({ plan, tampon }: { plan: ReturnType<typeof planMetni>; tampon: TamponRozeti | null }) {
  return (
    <>
      {plan.ton ? <b className="tc-rr3-plan-t" data-ton={plan.ton}>{plan.metin}</b> : <span className="tc-rr3-plan-t">{plan.metin}</span>}
      {tampon && <span className="tc-rr3-tampon" data-tampon={tampon.tur} title={tampon.ipucu}>{tampon.metin}</span>}
    </>
  );
}

// Emir ayrıntısı (1100 B): listenin yanındaki panel. Emrin alanları burada düzenlenmez (812 a; emir Üretim Emirleri'nde tutulur, ilerleme
// terminalden gelir). Sıra: başlık ve üç bilgi, uyarılar, adımlar ve malzeme, en altta tek eylem çubuğu. Seyrek ya da geri alınamaz işler
// (böl, katılma, geri katma, iptal) "Diğer" menüsündedir (1102 a). Stoğa işleme Üretim Emirleri'ndedir (1106 a): bitmiş emri yalnız orası işler.
export function EmirAyrintisi({ durum: d, emir: o, yetki, git, komut, emirAc, kapat }: Ozellikler) {
  const yonlen = useNavigate();
  const [iptal, setIptal] = useState(false);
  const [islem, setIslem] = useState<'bol' | 'katil' | null>(null);
  const urun = d.items?.find((i) => i.id === o.itemId) ?? null;
  const adimlar = emirAdimlari(d, o);
  const plan = planOzeti(d, d.planYerlesim, o);
  const pm = planMetni(plan);
  const tampon = tamponRozeti(plan);
  const il = ilerleme(d, o);
  const rev = o.rev === null ? null : d.routeRevs?.find((r) => r.id === o.rev) ?? null;
  const yururlukte = yururluktekiRevizyon(d, o.itemId);
  const fark = rotaFarki(d, o);
  const surum = { surum: o.surum };
  const yuzde = il.toplam ? Math.round((il.biten / il.toplam) * 100) : o.status === 'tamam' ? 100 : 0;
  const ana = o.parentId === null ? null : d.emirler?.orders.find((x) => x.id === o.parentId) ?? null;
  const acik = acikMi(o);
  const sira = planSirasi(d).findIndex((x) => x.id === o.id);
  const ueAc = () => { void yonlen(`/uretim-emirleri/${String(o.kayitNo)}`); };
  const rotaMetni = o.rotasiz ? 'Rotasız'
    : rev ? `${fark ? 'Emrin rotası' : 'Yürürlükteki'}, Rev ${rev.no}` : yururlukte ? `Yürürlükteki, Rev ${yururlukte.no}` : null;
  const diger: MenuOgesi[] = [
    ...(acik && yetki.emirYaz && adimlar.length > 0 ? [{ anahtar: 'bol', baslik: 'Böl (parti ya da kol)', simge: 'layers' as const, sec: () => { setIslem('bol'); } }] : []),
    ...(o.kol && acik && yetki.emirYaz ? [{ anahtar: 'katil', baslik: 'Katılma adımını değiştir', simge: 'route' as const, sec: () => { setIslem('katil'); } }] : []),
    ...(ana && acik && yetki.emirYaz ? [{
      anahtar: 'kat', baslik: o.kol ? 'Kolu geri al' : 'Ana emre geri kat', simge: 'back' as const, ton: 'tehlike' as const,
      sec: () => {
        void komut.calistir('emir-birlestir', { id: o.id, surum: o.surum }, `${o.no} ${ana.no} emrine geri katıldı.`)
          .then((c) => { if (c.tamam) emirAc(ana.id); });
      },
    }] : []),
    ...(acik && yetki.emirYaz ? [{ anahtar: 'iptal', baslik: 'İptal et', simge: 'x' as const, ton: 'tehlike' as const, sec: () => { setIptal(true); } }] : []),
  ];

  return (
    <section className="tc-rr3-ayrinti" aria-label={`${o.no} ayrıntısı`}>
      <header className="tc-rr3-pbas">
        <Dugme className="tc-rr3-geri" simge="chev-left" onClick={kapat}>Emirler</Dugme>
        <h3 className="tc-rr3-emirno">{o.no}</h3>
        <span className="tc-rr3-durum" data-durum={o.status}>{durumAdi(o)}</span>
        <Dugme className="tc-rr3-kapat" simge="x" aria-label="Ayrıntıyı kapat" onClick={kapat} />
      </header>
      <p className="tc-rr3-purun">
        {urun ? <><b>{urun.code}</b> {urun.name}</> : 'Ürün okunamadı'}
        <small> · {sayi(o.qty)} {urun?.unit ?? ''} · {turAdi(o.tur)}{o.priority <= 2 ? ` · ${ONCELIK_ADI[o.priority] ?? ''}` : ''}</small>
      </p>
      <dl className="tc-rr3-bilgi">
        <div><dt>Teslim</dt><dd>{tarih(o.due)}</dd></div>
        <div>
          <dt>Plan bitiş</dt>
          <dd><PlanHucresi plan={pm} tampon={tampon} />{pm.alt && <small className="tc-rr3-plan-alt" data-ton={pm.altTon ?? undefined}>{pm.alt}</small>}</dd>
        </div>
        <div className="tc-rr3-ilerleme">
          <dt>İlerleme {il.toplam ? `${String(il.biten)}/${String(il.toplam)}` : ''}</dt>
          <dd><progress max={100} value={yuzde} aria-label={`İlerleme ${String(il.biten)}/${String(il.toplam)}`} /></dd>
        </div>
      </dl>

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
      {o.status === 'tamam' && !o.kapanisSonucu && (
        <div className="tc-rr3-uyari-kutu" data-ton="bilgi" role="status">
          <Simge ad="clipboard-check" />
          <span>Stoğa işleme ve kapanış Üretim Emirleri'ndedir: emir ayrıntısında stoğa tamamlanır, kapanış onaylarıyla kapanır.</span>
          <Dugme simge="next" onClick={ueAc}>Üretim Emirleri'nde aç</Dugme>
        </div>
      )}

      <EmirYapisi durum={d} emir={o} adimlar={adimlar} yetki={yetki} komut={komut} islem={islem} islemKapat={() => { setIslem(null); }} />
      {o.rotasiz && <RotasizAdimlar durum={d} emir={o} adimlar={adimlar} yetki={yetki} komut={komut} />}
      <PlanBolumu durum={d} emir={o} adimlar={adimlar} yetki={yetki} />

      <p className="tc-rr3-meta">
        {o.start && <span>Başlangıç <b>{tarih(o.start)}</b></span>}
        {rotaMetni && <span>Rota <b>{rotaMetni}</b></span>}
        {sira >= 0 && <span>Plan sırası <b>{sira + 1}</b></span>}
        {o.note && <span>Not <b>{o.note}</b></span>}
        <button type="button" className="tc-rr3-bag" onClick={ueAc}>Üretim Emirleri'nde aç</button>
      </p>

      <div className="tc-rr3-eylem">
        <Dugme simge="route" onClick={() => { git('schema', o.itemId); }}>Akışta aç</Dugme>
        {plandaMi(o) && <Dugme simge="grid" onClick={() => { void yonlen(KANBAN_YOLU); }}>Kanbanda göster</Dugme>}
        {ana && <Dugme simge="back" onClick={() => { emirAc(ana.id); }}>Ana emir {ana.no}</Dugme>}
        {diger.length > 0 && <Menu etiket={`${o.no} için diğer işlemler`} metin="Diğer" ogeler={diger} />}
        {o.status === 'taslak' && yetki.emirYaz && (
          <Dugme tur="birincil" simge="play" className="tc-rr3-ana" yukleniyor={komut.mesgul} onClick={() => { void komut.calistir('emir-serbest', { id: o.id, ...surum }, 'Emir plana alındı.'); }}>
            Plana al
          </Dugme>
        )}
      </div>

      <OnayPenceresi
        acik={iptal} baslik={`${o.no} iptal edilsin mi?`} onayMetni="İptal et" tehlikeli yukleniyor={komut.mesgul} vazgec={() => { setIptal(false); }}
        onayla={() => { setIptal(false); void komut.calistir('emir-iptal', { id: o.id, ...surum }, 'Emir iptal edildi.'); }}
      >
        <p>Emir iptal edilir; plandan ve terminalden kalkar.</p>
      </OnayPenceresi>
    </section>
  );
}

// Alt emir bilgisi her zaman; bölme ve katılma panelleri yalnız "Diğer" menüsünden seçilince açılır (1102 a), içerikleri değişmez.
function EmirYapisi({ durum: d, emir: o, adimlar, yetki, komut, islem, islemKapat }: {
  durum: RrDurumu; emir: Emir; adimlar: EmirAdimi[]; yetki: EkranOzellikleri['yetki']; komut: ReturnType<typeof useEmirKomutu>;
  islem: 'bol' | 'katil' | null; islemKapat: () => void;
}) {
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
      if (c.tamam) { setBolme(bosBolme(false)); islemKapat(); }
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
    islemKapat();
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
      {o.kol && acik && islem === 'katil' && yetki.emirYaz && (
        <div className="tc-rr3-katil">
          <h4>Katılma adımı</h4>
          <p className="tc-rr3-ipucu">Bu kol ana emre {o.kol.m} {kisa(o.kol.m)} adımında katılır. Yeni adımı seçin; seçim hemen uygulanır.</p>
          <AdimSeridi
            etiket="Katılma adımı" adimlar={adimlar} opdefs={d.opdefs} istasyonlar={d.stations}
            durum={(j) => (j === o.kol!.n ? ['ayril', 'Kol bu adımdan sonra ayrılır'] : j === o.kol!.m ? ['birles', 'Şu an burada katılır']
              : j > o.kol!.n && j < o.kol!.m ? ['kol', 'Kol yapar'] : ['', ''])}
            secili={(j) => j === o.kol!.m}
            sec={(j) => {
              islemKapat();
              void komut.calistir('emir-katilma', { id: o.id, m: j, surum: o.surum }, `${o.no} ${String(j)}. adımda ${ana?.no ?? 'ana emre'} bağlanır.`);
            }}
          />
          <div className="tc-rr3-arac"><Dugme onClick={islemKapat}>Vazgeç</Dugme></div>
        </div>
      )}
      {altlar.length > 0 && <p className="tc-rr3-ipucu">{altlar.length} alt emir listede bu emrin altında görünür.</p>}
      {partiler.length > 0 && (
        <p className="tc-rr3-ipucu">Parti toplamı: ana emir {sayi(o.qty)} + alt emirler {sayi(toplam - o.qty)} = {sayi(toplam)}</p>
      )}
      {acik && islem === 'bol' && yetki.emirYaz && adimlar.length > 0 && (
        <div className="tc-rr3-bol">
          <h4>Böl</h4>
          <BolmePaneli
            yeni={false} girdi={girdi} adimlar={adimlar} baslamis={baslamis} opdefs={d.opdefs} istasyonlar={d.stations} deger={bolme} degistir={setBolme}
            gonder={() => { void bol(); }} vazgec={() => { setBolme(bosBolme(false)); islemKapat(); }} mesgul={komut.mesgul}
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

// Adımlar ve malzeme: her emirde adım tablosu; plandaki (serbest ya da üretimdeki) emirde plan yerleşimi, uyarılar, malzeme ihtiyacı ve yan ürün.
function PlanBolumu({ durum: d, emir: o, adimlar, yetki }: {
  durum: RrDurumu; emir: Emir; adimlar: EmirAdimi[]; yetki: EkranOzellikleri['yetki'];
}) {
  const yonlen = useNavigate();
  // Ara adım stoğu stoktan okunur (Stok bölümüyle aynı okuma); okunamazsa yalnız serbest stokla hesaplanır.
  const stokIdleri = useMemo(() => stokKartiIdleri(d.items ?? []), [d.items]);
  const stok = useStokOkumasi(stokIdleri, yetki.stokOku).data ?? null;
  const ihtiyaclar = useMemo(() => malzemeIhtiyaclari(d, stok), [d, stok]);
  const planda = plandaMi(o);
  const R = planda ? ihtiyaclar.get(o.id) ?? null : null;
  const plan = planOzeti(d, d.planYerlesim, o);
  const { ilk, son } = emirAraligi(o, adimlar.length);
  const opStatus = d.emirler?.opStatus ?? {};
  const opProg = d.emirler?.opProg ?? {};
  const makineKodu = (id: string) => d.machines?.find((m) => m.id === id)?.code ?? id;
  const ops: OpSatiri[] = adimlar.filter((a) => a.sira >= ilk && a.sira <= son).map((a) => {
    const p = planda ? adimPlani(d.planYerlesim, o.no, a.opNo) : null;
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
  // Yan panel dardır: tablo sığmayıp karta döner; adım tek satırda (OP, operasyon ve yeri, sağlam, durum) yazılır (tuval 3).
  // Başlamamış adımın plan başlangıcı, makinesi ve sağlam adedi "henüz yok"tur, veri eksikliği değil: çizgi yazılır.
  const adimYeri = (s: OpSatiri): string => [
    d.stations?.find((x) => x.id === s.adim.stationId)?.name ?? null, s.makine, s.baslangic ? `plan ${zaman(s.baslangic)}` : null,
  ].filter((x) => x !== null).join(' · ') || YOK;
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
    ...(o.status === 'taslak' ? ['Taslak emirler plana girmez. Plana alınca yerleşir.'] : []),
    ...(o.status === 'iptal' ? ['Bu emir iptal edildi.'] : []),
    ...(o.kol && planda ? ['Bu kol ana emre bağlıdır; ana emirle birlikte stoğa işlenir.'] : []),
    ...(plan.tur === 'plan' && plan.gecikiyor ? [`Plan bitişi teslimden sonra (${tarih(plan.bitis)}, teslim ${tarih(o.due)}).`] : []),
    ...(plan.tur === 'planlanamiyor' ? plan.adimlar.map((a) => `OP ${String(a.opNo)} planlanamadı: ${a.neden}`) : []),
    ...(plan.tur === 'yerlesmedi' ? ['Emrin açık adımları plan motorunun yerleşiminde yok: rota, istasyon ya da vardiya eksik olabilir.'] : []),
    ...((plan.tur === 'plan' || plan.tur === 'yerlesmedi') ? plan.calisanPlanDisi.map((op) => `OP ${String(op)} çalışıyor, planda yok: makinesi bilinmiyor ya da plan kapsamı dışında.`) : []),
    ...(R?.uyarilar ?? []),
  ];
  const yanUrun = R?.yanUrun ?? [];

  return (
    <section className="tc-rr3-plan" aria-label={`${o.no} planı`}>
      {ipuclari.length > 0 && <ul className="tc-rr3-mesajlar">{ipuclari.map((t) => <li key={t}>{t}</li>)}</ul>}
      {R && R.eksikler.length > 0 && (
        <div className="tc-rr3-uyari-kutu" role="status">
          <Simge ad="box" />
          <span>
            {R.eksikler.length} kalem eksik: {R.eksikler.map((e) => `${kart(e.malzemeId)?.code ?? e.malzemeId} ${miktar(e.alinacak, birim(e.malzemeId))}`).join(', ')}.
            Stok, plan sırasında önceki emirlere ayrıldıktan sonra kalan miktara göre hesaplanır.
          </span>
          <Dugme simge="cart" onClick={() => { void yonlen(TALEP_YOLU); }}>Satın alma talebi aç</Dugme>
        </div>
      )}
      <h4>Adımlar</h4>
      <ol className="tc-rr3-adimlar" aria-label={`${o.no} operasyonları`}>
        {ops.map((s) => (
          <li key={s.adim.sira}>
            <span className="tc-rr3-op">{s.adim.opNo}</span>
            <span className="tc-rr3-adim-ad">
              <span>{d.opdefs?.find((x) => x.id === s.adim.opId)?.abbr ?? s.adim.ad}</span>
              <small>{adimYeri(s)}</small>
            </span>
            <span className="tc-rr3-adim-saglam"><small>Sağlam</small><b>{sayi(s.saglam)}</b></span>
            <Rozet ton={ADIM_TONU[s.durum]}>{ADIM_DURUMU[s.durum]}</Rozet>
          </li>
        ))}
        {ops.length === 0 && <li className="tc-rr3-adim-bos">Adım yok.</li>}
      </ol>
      {!o.rotasiz && <p className="tc-rr3-ipucu">Fason ya da iç üretim değişikliği Üretim Emirleri'nde yapılır; rota değişmez.</p>}
      {planda && (
        <>
          <h4>Malzeme</h4>
          <Tablo etiket={`${o.no} malzeme ihtiyacı`} sutunlar={hamSutunlar} satirlar={R?.hammadde ?? []} satirAnahtari={(e) => e.malzemeId} bosMesaj="Satın alınacak malzeme yok." />
          {yanUrun.length > 0
            ? <Tablo etiket={`${o.no} yan ürünleri`} sutunlar={yanSutunlar} satirlar={yanUrun} satirAnahtari={(e) => e.malzemeId} bosMesaj="Yan ürün ya da hurda çıkmıyor." />
            : <p className="tc-rr3-ipucu">Yan ürün ya da hurda çıkmıyor.</p>}
        </>
      )}
    </section>
  );
}
