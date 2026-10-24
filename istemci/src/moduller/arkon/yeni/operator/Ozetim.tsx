import { useEffect, useState } from 'react';
import { DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import {
  OZET_DONEM_ADI, OZET_IS_DURUMU, fazlaMesaiDolulugu, ozetAdet, ozetGrafikUstu, ozetGunEtiketi, ozetSaat, ozetSayi, ozetSure, ozetTarih, ozetYuzde,
  type OperatorOzeti, type OzetDonemi, type OzetGunu,
} from '../../../../../../arkon/web/src/data/ozetim.ts';
import { basHarfler } from '../cekirdek/bicim.ts';
import type { User } from '../cekirdek/tipler.ts';
import { Cubuk } from '../hazirlik/index.tsx';
import { useArkon } from '../veri/baglam.ts';

// Operatör Özetim (ozetim.ts, kart #1295, #1322): kişinin kendi sağlamı, hurdası, çalıştığı süre ve işleri. Plana göre başarı, verim, ekip
// ortalaması ve kalite yüzdesi sunucuda durur ama gösterilmez (kullanıcı kararı, #1322). Sayılar TMI'deki üretim emri sayımındandır;
// terminaldeki vardiya özeti makineye göredir, bu sayfa kişiye göredir. Amir kendi iş merkezindeki kişiyi seçip salt okur.

const OZET_YENILEME_MS = 120000;
const DONEMLER: OzetDonemi[] = ['gun', 'hafta', 'ay'];

// Sekmeyi Arkon operatörü ve amiri görür; sunucu da yalnız bu iki işlemi kabul eder.
export const ozetimGorunur = (kisi: Pick<User, 'role'> | null): boolean => !!kisi && (kisi.role === 'operator' || kisi.role === 'lead');

function Grafik({ gunler, bugun }: { gunler: readonly OzetGunu[]; bugun: string }) {
  const ust = ozetGrafikUstu(gunler);
  // Dar ekranda yazılar küçülmesin diye çizim alanı da daralır.
  const dar = window.innerWidth < 600;
  const x0 = dar ? 30 : 40;
  const y0 = 160;
  const h = 130;
  const gen = dar ? 340 : 600;
  const adim = (gen - x0 - 8) / Math.max(1, gunler.length);
  const bw = Math.min(46, adim * (dar ? 0.62 : 0.55));
  const y = (v: number) => y0 - (ust ? (v / ust) * h : 0);
  return (
    <svg viewBox={`0 0 ${gen} 190`} className="tc-ay1-oz-grafik" role="img" aria-label="Son yedi günün sağlam ve hurda adedi">
      {ust ? [0, ust / 2, ust].map((v) => (
        <g key={`c${v}`}><line className="tc-ay1-oz-cizgi" x1={x0} x2={gen - 8} y1={y(v)} y2={y(v)} /><text x={x0 - 8} y={y(v) + 4} textAnchor="end">{ozetAdet(v)}</text></g>
      )) : null}
      {gunler.map((g, i) => {
        const cx = x0 + adim * i + adim / 2;
        const kayitsiz = g.saglam == null && g.hurda == null;
        const sg = Math.max(0, g.saglam ?? 0);
        const hr = Math.max(0, g.hurda ?? 0);
        return (
          <g key={g.tarih}>
            <text x={cx} y={y0 + 22} textAnchor="middle" className={g.tarih === bugun ? 'tc-ay1-oz-bugun' : undefined}>{ozetGunEtiketi(g.tarih, bugun)}</text>
            {kayitsiz ? <text x={cx} y={y0 - 8} textAnchor="middle" className="tc-ay1-soluk">–</text> : (
              <>
                <rect className="tc-ay1-oz-saglam" x={cx - bw / 2} y={y(sg)} width={bw} height={y0 - y(sg)} rx="6" />
                {hr ? <rect className="tc-ay1-oz-hurda" x={cx - bw / 2} y={y(sg + hr) - 2} width={bw} height={Math.max(3, y0 - y(hr))} rx="2" /> : null}
                <text x={cx} y={y(sg + hr) - 8} textAnchor="middle" className="tc-ay1-oz-bugun">{ozetAdet(sg)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Ozetim() {
  const { depo } = useArkon();
  const [donem, donemYaz] = useState<OzetDonemi>('gun');
  const [kisiId, kisiIdYaz] = useState<number | null>(null);
  const [o, oYaz] = useState<OperatorOzeti | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  useEffect(() => {
    let canli = true;
    const sor = () => depo.Server.operatorOzeti(donem, kisiId)
      .then((d) => { if (canli) { oYaz(d); hataYaz(null); } })
      .catch((e: unknown) => { if (canli) hataYaz((e as { status?: number } | null)?.status === 403 ? 'Bu özeti görme yetkiniz yok.' : 'Özet şu an alınamadı.'); });
    void sor();
    const t = setInterval(() => { void sor(); }, OZET_YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [depo, donem, kisiId]);

  if (!o) return <div className="tc-ay1-ozetim"><DurumKutusu durum={hata ? 'hata' : 'yukleniyor'} mesaj={hata || 'Özet hesaplanıyor'} /></div>;
  const ekip = o.ekip || [];
  const kendi = !kisiId;
  const doluluk = o.fazlaMesai ? fazlaMesaiDolulugu(o.fazlaMesai) : null;
  const enCokHurda = Math.max(1, o.hurdaNedenleri[0]?.adet ?? 1);
  return (
    <div className="tc-ay1-ozetim">
      <div className="tc-ay1-oz-ust">
        <div className="tc-ay1-oz-kisi"><span className="tc-ay1-avatar">{basHarfler(o.kisi.ad)}</span><div><b>{o.kisi.ad}</b><small>{kendi ? 'Kendi özetin' : 'Salt okunur · ekibinden'}</small></div></div>
        {ekip.length ? (
          <label className="tc-ay1-oz-sec"><Simge ad="user" boyut="k" />
            <select value={kisiId || ''} onChange={(e) => kisiIdYaz(Number(e.target.value) || null)} aria-label="Kişi seç">
              <option value="">Ben</option>{ekip.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
            </select>
          </label>
        ) : null}
        <div className="tc-ay1-oz-donem" role="group" aria-label="Dönem">
          {DONEMLER.map((d) => <button key={d} type="button" aria-pressed={donem === d} onClick={() => donemYaz(d)}>{OZET_DONEM_ADI[d]}</button>)}
        </div>
      </div>
      {hata ? <small className="tc-ay1-soluk">{hata} Gösterilen önceki okumadır.</small> : null}
      <div className="tc-ay1-oz-izgara">
        <div className="tc-ay1-oz-sayilar">
          <div className="tc-ay1-gosterge"><span className="tc-ay1-ust-yazi">Sağlam</span><b>{ozetAdet(o.saglam)}<small>adet</small></b><span className="tc-ay1-gosterge-alt">{OZET_DONEM_ADI[o.donem]}</span></div>
          <div className="tc-ay1-gosterge"><span className="tc-ay1-ust-yazi">Hurda</span><b>{ozetAdet(o.hurda)}<small>adet</small></b><span className="tc-ay1-gosterge-alt">{OZET_DONEM_ADI[o.donem]}</span></div>
          <div className="tc-ay1-gosterge"><span className="tc-ay1-ust-yazi">Çalıştığım süre</span><b>{ozetSure(o.calismaSn)}</b><span className="tc-ay1-gosterge-alt">İşe katıldığın süre</span></div>
          <div className="tc-ay1-gosterge"><span className="tc-ay1-ust-yazi">Hız</span><b>{o.saatlikSaglam == null ? '–' : ozetAdet(o.saatlikSaglam)}<small>adet/sa</small></b><span className="tc-ay1-gosterge-alt">Çalışılan saat başına sağlam</span></div>
          <div className="tc-ay1-gosterge" title="Ürettiğin sağlamın standart süresi, mesai süreni ne kadar dolduruyor (izinli günler sayılmaz)">
            <span className="tc-ay1-ust-yazi">Emek verimim</span><b>{ozetYuzde(o.emekVerimi.oran)}</b>
            <span className="tc-ay1-gosterge-alt">{o.emekVerimi.mesaiSn == null ? 'Vardiya takvimin yok' : `Standart ${ozetSure(o.emekVerimi.standartSn)} / mesai ${ozetSure(o.emekVerimi.mesaiSn)}`}</span>
          </div>
        </div>
        <div className="tc-ay1-oz-kart tc-ay1-oz-genis">
          <span className="tc-ay1-ust-yazi">Son 7 gün · sağlam ve hurda</span>
          <Grafik gunler={o.gunler} bugun={o.bitis} />
          <ul className="tc-ay1-oz-lejant"><li data-durum="calisiyor"><i aria-hidden="true" />Sağlam</li><li data-durum="durdu"><i aria-hidden="true" />Hurda</li><li>–: o gün kayıt yok</li></ul>
        </div>
        <div className="tc-ay1-oz-kart">
          <span className="tc-ay1-ust-yazi">Başarılarım</span>
          {o.rozetler.length ? (
            <div className="tc-ay1-oz-rozetler">
              {o.rozetler.map((r) => (
                <div key={r.kod} className="tc-ay1-oz-rozet"><span data-durum={r.kod === 'sifir-hurda' ? 'calisiyor' : 'ayar'}><Simge ad={r.kod === 'sifir-hurda' ? 'check' : 'chart'} /></span><div><b>{r.baslik}</b><small>{r.aciklama}</small></div></div>
              ))}
            </div>
          ) : <small className="tc-ay1-soluk">Birkaç gün kayıt birikince burada görünür.</small>}
        </div>
        <div className="tc-ay1-oz-kart tc-ay1-oz-genis">
          <span className="tc-ay1-ust-yazi">{OZET_DONEM_ADI[o.donem]} çalıştığım işler</span>
          {o.isler.length ? (
            <ul className="tc-ay1-oz-isler">
              {o.isler.map((i, n) => (
                <li key={`${i.isEmriId ?? 'e'}:${n}`}>
                  <div><b>{i.parca || i.emirNo}{i.opNo != null ? ` · OP ${i.opNo}` : ''}{i.adimAdi ? ` ${i.adimAdi}` : ''}</b><span className="tc-ay1-cip" data-durum={i.durum === 'calisiyor' ? 'calisiyor' : i.durum === 'tamam' ? 'bitti' : 'sirada'}><i aria-hidden="true" />{OZET_IS_DURUMU[i.durum]}</span>
                    <small>{i.emirNo}{i.saniye != null ? ` · ${ozetSure(i.saniye)}` : ''}</small></div>
                  <div className="tc-ay1-oz-n">{ozetAdet(i.saglam)}<small>{i.hurda ? `${ozetAdet(i.hurda)} hurda` : 'sağlam'}</small></div>
                </li>
              ))}
            </ul>
          ) : <small className="tc-ay1-soluk">Bu dönemde sayım ya da çalışma kaydın yok.</small>}
        </div>
        <div className="tc-ay1-oz-kart">
          <span className="tc-ay1-ust-yazi">Hurda nedenlerim</span>
          {o.hurdaNedenleri.length ? (
            <div className="tc-ay1-oz-barlar">
              {o.hurdaNedenleri.map((h) => (
                <div key={h.ad}><span>{h.ad}</span><b>{ozetAdet(h.adet)}</b><Cubuk yuzde={Math.max(4, Math.round((h.adet / enCokHurda) * 100))} ton="stop" etiket={h.ad} /></div>
              ))}
            </div>
          ) : <small className="tc-ay1-soluk">Bu dönemde hurdan yok.</small>}
        </div>
        <div className="tc-ay1-oz-kart tc-ay1-oz-genis">
          <span className="tc-ay1-ust-yazi">Mesailerim · önümüzdeki 7 gün</span>
          {o.mesailer === null ? <small className="tc-ay1-soluk">Vardiya takvimin yok: bir istasyona atanınca görünür.</small> : (
            <ul className="tc-ay1-oz-mesai">
              {o.mesailer.map((m) => (
                <li key={m.tarih} aria-current={m.tarih === o.bitis ? 'date' : undefined}>
                  <span>{m.tarih === o.bitis ? 'Bugün' : ozetTarih(m.tarih)}</span>
                  {m.baslangic ? <><b>{ozetSaat(m.baslangic)} – {ozetSaat(m.bitis)}</b><small>{ozetSure(m.dakika * 60)} net</small></>
                    : <><b className="tc-ay1-soluk">{m.kapali ? (m.kapali.ad ?? (m.kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı')) : 'Mesai yok'}</b><small /></>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="tc-ay1-oz-kart">
          <span className="tc-ay1-ust-yazi">Fazla mesaim</span>
          {o.fazlaMesai === null ? <small className="tc-ay1-soluk">İK kaydın bağlı değil.</small> : (
            <>
              <div className="tc-ay1-oz-fm">
                <div><span>Bu ay</span><b>{ozetSayi(o.fazlaMesai.aySaat)} <small>sa</small></b></div>
                <div><span>Bu yıl</span><b>{ozetSayi(o.fazlaMesai.yilSaat)}{o.fazlaMesai.yillikSinirSaat !== null ? <> <small>/ {ozetSayi(o.fazlaMesai.yillikSinirSaat)} sa</small></> : <> <small>sa</small></>}</b></div>
                {doluluk !== null ? <Cubuk yuzde={Math.max(2, Math.round(doluluk * 100))} ton={doluluk >= 0.9 ? 'stop' : 'run'} etiket="Yıllık fazla mesai sınırı" /> : null}
                {o.fazlaMesai.bekleyenSaat ? <small className="tc-ay1-soluk">{ozetSayi(o.fazlaMesai.bekleyenSaat)} sa onay bekliyor</small> : null}
              </div>
              {o.fazlaMesai.satirlar.length ? (
                <ul className="tc-ay1-oz-liste">
                  {o.fazlaMesai.satirlar.map((r, i) => <li key={r.tarih + i}><span>{ozetTarih(r.tarih)}<small>{r.tur}</small></span><b>{ozetSayi(r.saat)} sa{r.onay === 'Beklemede' ? <small>bekliyor</small> : null}</b></li>)}
                </ul>
              ) : <small className="tc-ay1-soluk">Bu ay fazla mesain yok.</small>}
            </>
          )}
        </div>
        <div className="tc-ay1-oz-kart tc-ay1-oz-genis">
          <span className="tc-ay1-ust-yazi">Yetkili olduğum yerler</span>
          {o.yetkiler.istasyonlar.length || o.yetkiler.makineler.length ? (
            <div className="tc-ay1-oz-yetki">
              {o.yetkiler.istasyonlar.map((i) => <span key={`i${i.id}`} className="tc-ay1-oz-yer" title={i.ad}><Simge ad="layers" boyut="k" /><b>{i.kod}</b><small>{i.ad}</small></span>)}
              {o.yetkiler.makineler.map((m) => <span key={`m${m.id}`} className="tc-ay1-oz-yer" title={m.ad}><Simge ad="gauge" boyut="k" /><b>{m.kod}</b><small>{m.istasyonKodu ? `${m.istasyonKodu} · ` : ''}{m.ad}</small></span>)}
            </div>
          ) : <small className="tc-ay1-soluk">Bugün sana atanmış istasyon ya da makine yok.</small>}
        </div>
        <div className="tc-ay1-oz-kart">
          <span className="tc-ay1-ust-yazi">İzinlerim</span>
          {o.izinler === null ? <small className="tc-ay1-soluk">İK kaydın bağlı değil.</small> : (
            <>
              <div className="tc-ay1-oz-fm">
                <div><span>Kalan yıllık izin</span><b>{ozetSayi(o.izinler.kalanGun)} <small>gün</small></b></div>
                <div><span>Kullanılan / bekleyen</span><b>{ozetSayi(o.izinler.kullanilanGun)} <small>/ {ozetSayi(o.izinler.bekleyenGun)} gün</small></b></div>
                {o.izinler.sonrakiHakTarihi ? <small className="tc-ay1-soluk">{ozetTarih(o.izinler.sonrakiHakTarihi)}: +{ozetSayi(o.izinler.sonrakiHakGun)} gün yeni hak</small> : null}
              </div>
              {o.izinler.yaklasan.length ? (
                <ul className="tc-ay1-oz-liste">
                  {o.izinler.yaklasan.map((z, i) => (
                    <li key={z.baslangic + i}><span>{ozetTarih(z.baslangic)}{z.bitis !== z.baslangic ? ` – ${ozetTarih(z.bitis)}` : ''}<small>{z.tur}</small></span>
                      <b>{ozetSayi(z.gun)} gün<small data-durum={z.durum === 'Onaylandı' ? 'calisiyor' : undefined}>{z.durum === 'Onaylandı' ? 'onaylı' : 'bekliyor'}</small></b></li>
                  ))}
                </ul>
              ) : <small className="tc-ay1-soluk">Yaklaşan izin yok.</small>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
