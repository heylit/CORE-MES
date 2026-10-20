import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GozKalemi, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { Dugme, useBildirim } from '../../ortak/arayuz/index.ts';
import type { MakineDurumu } from '../../ortak/arayuz/index.ts';
import { fabrikaTaslagiKur, kapsamKutusu, taslakKur } from './duzenleyici-durumu.ts';
import { fabrikayaCevir } from './fabrika.ts';
import { PlanCizimi } from './PlanCizimi.tsx';
import { SahneMotoru, webglVarMi } from './sahne/motor.ts';
import type { BolumYerlesimi, Gorunum, KameraYeri } from './sahne/motor.ts';
import { KucukHarita } from './KucukHarita.tsx';
import { gozOzetleri, hucreAnahtari, sayi } from './kurallar.ts';
import { malzemeModelDosyasi, merkezModelDosyasi, modelDosyasi } from './veri.ts';
import type { IstasyonCanli, ParcaModeli, RafYuku } from './kurallar.ts';
import { rafOzetleri } from './DepoGorunumu.tsx';
import { BolmeCephesi } from './RafCephesi.tsx';
import type { RafOdakSecimi } from './RafOdagi.tsx';

export interface SahneOzellikleri {
  // Gösterilen bölümler ve fabrika planındaki yerleri (tek bölümde yer sıfır).
  bolumler: readonly BolumYerlesimi[];
  // Nesne anahtarı (makine:<id>, istasyon:<id>) -> canlı hal; olmayan nesne bekliyor çizilir.
  canli: ReadonlyMap<string, IstasyonCanli>;
  secili: string | null;
  sec: (anahtar: string | null) => void;
  gorunum: { tur: Gorunum; sayac: number };
  // Bölüm metresinde nokta.
  odak: { x: number; z: number; salonId: number; sayac: number } | null;
  izgara: boolean;
  // Sahne etiketleri (kapalıyken yalnız seçili öğe ve bölüm adı).
  etiketler: boolean;
  // Rota bölüm metresindedir (sunucu bölüm içinde hesaplar).
  rota: { salonId: number; noktalar: readonly { x: number; z: number }[] } | null;
  yuruyus: boolean;
  yuruyusBitir: () => void;
  rotaIste: (salonId: number, bas: { x: number; z: number }, hedef: { x: number; z: number }) => Promise<{ x: number; z: number }[] | null>;
  // İşlenen parçanın modeli (istasyon kimliği -> model) ve hepsinin gösterilip gösterilmeyeceği.
  parcalar: ReadonlyMap<number, ParcaModeli>;
  parcaGoster: boolean;
  // Raf gözlerindeki yük (stok verisi; raf kimliği -> yükler).
  rafYukleri: ReadonlyMap<number, readonly RafYuku[]>;
  // Öğeye git: yürüyüşte oraya yürür, değilse kamera öğeyi çerçeveler (çift tıkla aynı).
  hedef: { anahtar: string; sayac: number } | null;
  // Bölmeye karşıdan bakış (null: salon görünümü) ve göz seçimi.
  rafOdak: RafOdakSecimi | null;
  rafOdakYaz: (s: RafOdakSecimi | null) => void;
  gozKalemleri: readonly GozKalemi[] | undefined;
}

// Bakışta sahnenin üstünü araç çubuğu, sağını (genişse) göz paneli örter; bölme kalan alana sığdırılır.
function odakBosluklari(kap: HTMLElement | null, gozAcik: boolean): { ustBosluk: number; sagBosluk: number } {
  const en = kap?.clientWidth ?? 0;
  const cubuk = kap?.parentElement?.parentElement?.querySelector<HTMLElement>('.tc-atolye-odak-cubuk');
  const ust = cubuk ? Math.ceil(cubuk.getBoundingClientRect().bottom - (kap?.getBoundingClientRect().top ?? 0)) + 8 : 64;
  const panel = kap?.parentElement?.parentElement?.querySelector<HTMLElement>('.tc-atolye-odak-panel');
  const sag = gozAcik && en >= 760 && panel ? Math.ceil(panel.getBoundingClientRect().width) + 24 : 0;
  return { ustBosluk: Math.max(0, ust), sagBosluk: sag };
}

// WebGL varsa üç boyutlu sahne; yoksa aynı yerleşim iki boyutlu planla gösterilir (ekran yine tam işlevli).
export function Sahne3B(o: SahneOzellikleri) {
  const [webgl] = useState(webglVarMi);
  return webgl ? <UcBoyut {...o} /> : <IkiBoyut {...o} />;
}

function IkiBoyut(o: SahneOzellikleri) {
  const odakRafi = o.rafOdak ? o.bolumler.flatMap((b) => b.yerlesim.raflar).find((r) => r.id === o.rafOdak?.rafId) : undefined;
  if (o.rafOdak && odakRafi) return <IkiBoyutOdak {...o} rafOdak={o.rafOdak} raf={odakRafi} />;
  return <IkiBoyutPlan {...o} />;
}

// WebGL yoksa bölmeye bakış iki boyutlu cepheyle: aynı göz seçimi, aynı gezinme.
function IkiBoyutOdak({ rafOdak, rafOdakYaz, raf, gozKalemleri }: SahneOzellikleri & { rafOdak: RafOdakSecimi; raf: YerlesimCevabi['raflar'][number] }) {
  const ozetler = useMemo(() => rafOzetleri(gozKalemleri ?? [], raf.id), [gozKalemleri, raf.id]);
  return (
    <div className="tc-atolye-sahne-plan tc-atolye-sahne-odak">
      <BolmeCephesi
        raf={raf}
        bolme={rafOdak.bolme}
        ozetler={ozetler}
        secili={rafOdak.kat !== null && rafOdak.goz !== null ? { kat: rafOdak.kat, goz: rafOdak.goz } : null}
        sec={(kat, goz) => rafOdakYaz({ ...rafOdak, kat, goz })}
      />
    </div>
  );
}

// Birden çok bölüm fabrika planında (her bölüm yerinde, dönüşüyle); tek bölüm kendi metresinde.
function IkiBoyutPlan({ bolumler, canli, secili, sec, rota }: SahneOzellikleri) {
  const durumlar = useMemo(() => new Map<string, MakineDurumu>([...canli].map(([a, c]) => [a, c.durum])), [canli]);
  const yerlesimler = useMemo(() => bolumler.map((b) => b.yerlesim), [bolumler]);
  const fabrika = bolumler.length > 1;
  const taslak = useMemo(() => (fabrika ? fabrikaTaslagiKur(yerlesimler) : taslakKur(yerlesimler[0] as YerlesimCevabi)), [fabrika, yerlesimler]);
  const k = kapsamKutusu(taslak);
  const pay = Math.max(1.5, Math.max(k.x1 - k.x0, k.z1 - k.z0) * 0.05) + (fabrika ? 2.5 : 0);
  // Taslak anahtarı raf ve alanda yereldir; seçim için kayıtlı kimliğe çevrilir (taslak bölüm sırasıyla kurulur).
  const kayitliAlanlar = yerlesimler.flatMap((y) => y.alanlar);
  const rafAnahtari = new Map(taslak.raflar.map((r) => [r.anahtar, `raf:${r.id ?? 0}`]));
  const alanAnahtari = new Map(taslak.alanlar.map((a, i) => [a.anahtar, `alan:${kayitliAlanlar[i]?.id ?? 0}`]));
  const geri = new Map([...rafAnahtari, ...alanAnahtari].map(([a, b]) => [b, a]));
  const rotaBolumu = rota ? bolumler.find((b) => b.yerlesim.salon.id === rota.salonId) : undefined;
  const rotaNoktalari = rota && rotaBolumu ? rota.noktalar.map((n) => fabrikayaCevir(rotaBolumu.konum, n)) : null;
  const tek = yerlesimler[0];
  return (
    <div className="tc-atolye-sahne-plan">
      <PlanCizimi
        taslak={taslak}
        sutunlar={fabrika ? [] : tek?.salon.sutunlar ?? []}
        satirlar={fabrika ? [] : tek?.salon.satirlar ?? []}
        secili={secili === null ? null : geri.get(secili) ?? secili}
        durumlar={durumlar}
        rota={rotaNoktalari}
        kutu={{ x: k.x0 - pay, y: k.z0 - pay, g: k.x1 - k.x0 + pay * 2, d: k.z1 - k.z0 + pay * 2 }}
        etiket={fabrika ? 'Fabrika planı' : 'Atölye planı'}
        ogeBas={(anahtar) => sec(rafAnahtari.get(anahtar) ?? alanAnahtari.get(anahtar) ?? (/^(istasyon|makine|bolum):/.test(anahtar) ? anahtar : null))}
        bosBas={() => sec(null)}
      />
    </div>
  );
}

function UcBoyut(o: SahneOzellikleri) {
  const { bolumler, canli, secili, sec, gorunum, odak, izgara, etiketler: etiketAcik, rota, yuruyus, yuruyusBitir, rotaIste, parcalar, parcaGoster, rafYukleri, hedef, rafOdak, rafOdakYaz, gozKalemleri } = o;
  const kap = useRef<HTMLDivElement>(null);
  const etiketler = useRef<HTMLDivElement>(null);
  const motor = useRef<SahneMotoru | null>(null);
  const [hata, hataYaz] = useState(false);
  const [yakin, yakinYaz] = useState<string | null>(null);
  const [yer, yerYaz] = useState<KameraYeri | null>(null);
  const { bildir } = useBildirim();
  const olaylar = useRef({ sec, rotaIste, bildir, rafOdakYaz });
  olaylar.current = { sec, rotaIste, bildir, rafOdakYaz };

  useEffect(() => {
    if (!kap.current || !etiketler.current) return undefined;
    try {
      motor.current = new SahneMotoru(kap.current, etiketler.current, {
        sec: (a) => olaylar.current.sec(a),
        rotaIste: (salonId, b, h) => olaylar.current.rotaIste(salonId, b, h),
        yuruyusDurumu: ({ yakin: y }) => yakinYaz(y),
        modelGetir: (m) => modelDosyasi(m),
        merkezModelGetir: (istasyonId, m) => merkezModelDosyasi(istasyonId, m),
        malzemeModelGetir: (malzemeNo, m) => malzemeModelDosyasi(malzemeNo, m),
        modelYuklenemedi: (ad, tur) => olaylar.current.bildir(
          'hata', tur === 'istasyon' ? `${ad} modeli yüklenemedi; istasyon tipinden çiziliyor.` : `${ad} parça modeli yüklenemedi.`,
        ),
        gozSec: (g) => olaylar.current.rafOdakYaz(g),
        kameraDegisti: yerYaz,
      });
    } catch {
      hataYaz(true);
    }
    return () => {
      motor.current?.yokEt();
      motor.current = null;
    };
  }, []);

  useEffect(() => { motor.current?.fabrikaKur(bolumler); }, [bolumler]);
  useEffect(() => { motor.current?.canliYaz(canli); }, [canli, bolumler]);
  useEffect(() => { motor.current?.secimYaz(secili); }, [secili, bolumler]);
  useEffect(() => { motor.current?.izgaraYaz(izgara); }, [izgara, bolumler]);
  useEffect(() => { motor.current?.etiketlerYaz(etiketAcik); }, [etiketAcik]);
  useEffect(() => { motor.current?.rotaYaz(rota?.noktalar ?? null, rota?.salonId ?? null); }, [rota, bolumler]);
  useEffect(() => { if (gorunum.sayac > 0) motor.current?.gorunum(gorunum.tur); }, [gorunum]);
  useEffect(() => { if (odak) motor.current?.odakla(odak.x, odak.z, 1, odak.salonId); }, [odak]);
  useEffect(() => { motor.current?.yuruyusYaz(yuruyus); }, [yuruyus, bolumler]);
  useEffect(() => { motor.current?.parcalarYaz(parcalar); }, [parcalar, bolumler]);
  useEffect(() => { motor.current?.parcaGosterYaz(parcaGoster); }, [parcaGoster]);
  useEffect(() => { motor.current?.rafYukleriYaz(rafYukleri); }, [rafYukleri, bolumler]);
  useEffect(() => { if (hedef) motor.current?.git(hedef.anahtar); }, [hedef]);

  // Bölmeye bakış: göz etiketleri göz kalemlerinden (baskın kalem ve toplam doluluk).
  const odakEtiketleri = useMemo(() => {
    const m = new Map<string, { kod: string; yuzde: number }>();
    if (!rafOdak) return m;
    for (const g of gozOzetleri((gozKalemleri ?? []).filter((k) => k.raf.id === rafOdak.rafId)).values()) {
      const b = g.kalemler[0];
      if (b) m.set(hucreAnahtari(g.bolme, g.kat, g.goz), { kod: g.kalemler.length > 1 ? `${b.kod} +${g.kalemler.length - 1}` : b.kod, yuzde: g.toplam });
    }
    return m;
  }, [rafOdak, gozKalemleri]);
  const gozAcik = rafOdak !== null && rafOdak.kat !== null;
  useEffect(() => {
    if (!rafOdak) { motor.current?.rafOdakYaz(null); return undefined; }
    // Arayüz (çubuk, panel) çizildikten sonra ölçülür.
    const kare = requestAnimationFrame(() => {
      motor.current?.rafOdakYaz({ ...rafOdak, etiketler: odakEtiketleri, ...odakBosluklari(kap.current, gozAcik) });
    });
    return () => cancelAnimationFrame(kare);
  }, [rafOdak, odakEtiketleri, gozAcik, rafYukleri, bolumler]);

  useEffect(() => {
    if (!yuruyus) return undefined;
    const tus = (o: KeyboardEvent) => { if (o.key === 'Escape') yuruyusBitir(); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [yuruyus, yuruyusBitir]);

  if (hata) return <IkiBoyut {...o} />;

  const yakinYer = yakin
    ? bolumler.flatMap((b) => [
      ...b.yerlesim.istasyonYerleri.map((i) => ({ anahtar: `istasyon:${i.istasyonId}`, kod: i.kod, ad: i.ad })),
      ...b.yerlesim.makineYerleri.map((m) => ({ anahtar: `makine:${m.makineId}`, kod: m.kod, ad: m.ad })),
    ]).find((i) => i.anahtar === yakin)
    : undefined;
  return (
    <div className="tc-atolye-sahne-kap">
      <div ref={kap} className="tc-atolye-sahne" />
      <div ref={etiketler} className="tc-sahne-etiketler" />
      {!rafOdak && <KucukHarita bolumler={bolumler} yer={yer} git={(x, z) => motor.current?.yereGit(x, z)} />}
      {!yuruyus && !rafOdak && (
        <p className="tc-atolye-gezinme" aria-hidden="true">
          <span className="tc-atolye-masaustu">Oklar: gez · Q E: döndür · + −: yaklaş · Shift: hızlı · çift tık: makineye git · Home: {bolumler.length > 1 ? 'tüm fabrika' : 'tüm bölüm'}</span>
          <span className="tc-atolye-dokunmatik">Sürükle: döndür · iki parmak: kaydır, yaklaş · çift dokun: makineye git</span>
        </p>
      )}
      {yuruyus && (
        <>
          <div className="tc-atolye-yuruyus-cubuk">
            <span>Yürüyüş</span>
            <span className="tc-atolye-ipucu tc-atolye-masaustu">↑ ↓ yürü · ← → dön · A D yana · Shift koş · sürükle: bak · tıkla: oraya yürü · çift tık: makineye yürü</span>
            <span className="tc-atolye-ipucu tc-atolye-dokunmatik">Çubukla yürü · sürükle: bak · dokun: oraya yürü · çift dokun: makineye yürü</span>
            <Dugme simge="x" onClick={yuruyusBitir}>Çık</Dugme>
          </div>
          {yakinYer && <p className="tc-atolye-yakin"><b className="mono">{yakinYer.kod}</b> {yakinYer.ad}</p>}
          <Kol degisti={(ileri, yana) => motor.current?.yuruyusKolu(ileri, yana)} />
        </>
      )}
    </div>
  );
}

// Dokunmatik yürüme çubuğu: merkezden uzaklık hız, yön adım yönüdür.
function Kol({ degisti }: { degisti: (ileri: number, yana: number) => void }) {
  const kutu = useRef<HTMLDivElement>(null);
  const [etkin, etkinYaz] = useState(false);
  const hesapla = (o: ReactPointerEvent) => {
    const el = kutu.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((o.clientX - r.left) / r.width) * 2 - 1;
    const y = ((o.clientY - r.top) / r.height) * 2 - 1;
    const l = Math.max(1, Math.hypot(x, y));
    degisti(-y / l, x / l);
  };
  return (
    <div
      ref={kutu}
      className="tc-atolye-kol"
      data-etkin={etkin}
      role="presentation"
      onPointerDown={(o) => { o.currentTarget.setPointerCapture(o.pointerId); etkinYaz(true); hesapla(o); }}
      onPointerMove={(o) => { if (etkin) hesapla(o); }}
      onPointerUp={() => { etkinYaz(false); degisti(0, 0); }}
      onPointerCancel={() => { etkinYaz(false); degisti(0, 0); }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
