import { AKStore } from '../data/store';
import { OZET_DONEM_ADI, OZET_IS_DURUMU, fazlaMesaiDolulugu, ornekOzet, ozetAdet, ozetGrafikUstu, ozetGunEtiketi, ozetSaat, ozetSayi, ozetSure, ozetTarih, ozetYuzde } from '../data/ozetim';
import type { OperatorOzeti, OzetDonemi } from '../data/ozetim';
import { APPMODE, MEU, initials } from './ortak-ayarlar';
import { Fragment, I, html, useEffect, useState } from './temel';

/* ══════════ Operatör Özetim (kart #1295, 2. sürüm #1322) ══════════
   Kişinin kendi sağlamı, hurdası, çalıştığı süre ve işleri. Plana göre başarı, verim, ekip ortalaması ve kalite yüzdesi hesapları sunucuda
   durur ama gösterilmez (kullanıcı kararı, #1322: hesaplardan henüz emin olunmadı). Sayılar TMI'deki üretim emri sayımındandır; terminaldeki
   vardiya özeti makineye göredir, bu sayfa kişiye göredir. Amir kendi iş merkezindeki kişiyi seçip salt okur. */
const OZET_YENILEME_MS = 120000;
const DONEMLER: OzetDonemi[] = ['gun', 'hafta', 'ay'];

// Sekmeyi Arkon operatörü ve amiri görür; sunucu da yalnız bu iki işlemi kabul eder.
export const ozetimGorunur = (): boolean => APPMODE.demo || ['operator', 'lead'].includes((MEU() || {}).role);

function Grafik({ gunler, bugun }) {
  const ust = ozetGrafikUstu(gunler);
  // Dar ekranda yazılar küçülmesin diye çizim alanı da daralır.
  const dar = window.innerWidth < 600;
  const x0 = dar ? 30 : 40, y0 = 160, h = 130, gen = dar ? 340 : 600, adim = (gen - x0 - 8) / Math.max(1, gunler.length), bw = Math.min(46, adim * (dar ? 0.62 : 0.55));
  const y = (v: number) => y0 - (ust ? (v / ust) * h : 0);
  return html`<svg viewBox=${'0 0 ' + gen + ' 190'} className="ozgrafik" role="img" aria-label="Son yedi günün sağlam ve hurda adedi">
    ${ust ? [0, ust / 2, ust].map(v => html`<g key=${'c' + v}><line x1=${x0} x2=${gen - 8} y1=${y(v)} y2=${y(v)} stroke="var(--edge)" /><text x=${x0 - 8} y=${y(v) + 4} textAnchor="end">${ozetAdet(v)}</text></g>`) : null}
    ${gunler.map((g, i) => {
      const cx = x0 + adim * i + adim / 2, kayitsiz = g.saglam == null && g.hurda == null;
      const sg = Math.max(0, g.saglam ?? 0), hr = Math.max(0, g.hurda ?? 0);
      return html`<g key=${g.tarih}>
        <text x=${cx} y=${y0 + 22} textAnchor="middle" className=${g.tarih === bugun ? 'ozbu' : ''}>${ozetGunEtiketi(g.tarih, bugun)}</text>
        ${kayitsiz ? html`<text x=${cx} y=${y0 - 8} textAnchor="middle" className="ozbos">–</text>` : html`<${Fragment}>
          <rect x=${cx - bw / 2} y=${y(sg)} width=${bw} height=${y0 - y(sg)} rx="6" fill="var(--run)" />
          ${hr ? html`<rect x=${cx - bw / 2} y=${y(sg + hr) - 2} width=${bw} height=${Math.max(3, y0 - y(hr))} rx="2" fill="var(--stop)" />` : null}
          <text x=${cx} y=${y(sg + hr) - 8} textAnchor="middle" className="ozbu">${ozetAdet(sg)}</text>
        </${Fragment}>`}
      </g>`;
    })}
  </svg>`;
}

export function Ozetim() {
  const bugun = new Date().toLocaleDateString('sv-SE');
  const sunucusuz = APPMODE.demo;
  const [donem, setDonem] = useState<OzetDonemi>('gun');
  const [kisiId, setKisiId] = useState<number | null>(null);
  const [o, setO] = useState<OperatorOzeti | null>(() => (sunucusuz ? ornekOzet('gun', bugun) : null));
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    if (sunucusuz) { setO(ornekOzet(donem, bugun)); return; }
    let canli = true;
    const sor = () => AKStore.Server.operatorOzeti(donem, kisiId)
      .then(d => { if (canli) { setO(d); setHata(null); } })
      .catch(e => { if (canli) setHata(e && e.status === 403 ? 'Bu özeti görme yetkiniz yok.' : 'Özet şu an alınamadı.'); });
    sor();
    const t = setInterval(sor, OZET_YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [donem, kisiId]);

  if (!o) return html`<div className="ozetim"><p className="muted">${hata || 'Özet hesaplanıyor…'}</p></div>`;
  const ekip = o.ekip || [];
  const kendi = !kisiId;
  return html`<div className="ozetim">
    <div className="glass ozust">
      <div className="ozkisi"><span className="av">${initials(o.kisi.ad)}</span><div><b>${o.kisi.ad}</b><small>${kendi ? 'Kendi özetin' : 'Salt okunur · ekibinden'}</small></div></div>
      ${ekip.length ? html`<label className="ozsec"><${I} n="user" s=${16} /><select value=${kisiId || ''} onChange=${e => setKisiId(Number(e.target.value) || null)} aria-label="Kişi seç">
        <option value="">Ben</option>${ekip.map(k => html`<option key=${k.id} value=${k.id}>${k.ad}</option>`)}</select></label>` : null}
      <div className="ozdonem" role="group" aria-label="Dönem">${DONEMLER.map(d => html`<button key=${d} type="button" aria-pressed=${donem === d} onClick=${() => setDonem(d)}>${OZET_DONEM_ADI[d]}</button>`)}</div>
    </div>
    ${hata ? html`<small className="muted">${hata} Gösterilen önceki okumadır.</small>` : null}
    <div className="ozizgara">
      <div className="ozkpis">
        <div className="glass ozkpi"><span className="over">Sağlam</span><b>${ozetAdet(o.saglam)}<small>adet</small></b><span className="d">${OZET_DONEM_ADI[o.donem]}</span></div>
        <div className="glass ozkpi"><span className="over">Hurda</span><b>${ozetAdet(o.hurda)}<small>adet</small></b><span className="d">${OZET_DONEM_ADI[o.donem]}</span></div>
        <div className="glass ozkpi"><span className="over">Çalıştığım süre</span><b>${ozetSure(o.calismaSn)}</b><span className="d">İşe katıldığın süre</span></div>
        <div className="glass ozkpi"><span className="over">Hız</span><b>${o.saatlikSaglam == null ? '–' : ozetAdet(o.saatlikSaglam)}<small>adet/sa</small></b><span className="d">Çalışılan saat başına sağlam</span></div>
        <div className="glass ozkpi" title="Ürettiğin sağlamın standart süresi, mesai süreni ne kadar dolduruyor (izinli günler sayılmaz)"><span className="over">Emek verimim</span><b>${ozetYuzde(o.emekVerimi.oran)}</b><span className="d">${o.emekVerimi.mesaiSn == null ? 'Vardiya takvimin yok' : `Standart ${ozetSure(o.emekVerimi.standartSn)} / mesai ${ozetSure(o.emekVerimi.mesaiSn)}`}</span></div>
      </div>
      <div className="glass ozkart ozgenis">
        <span className="over">Son 7 gün · sağlam ve hurda</span>
        <${Grafik} gunler=${o.gunler} bugun=${o.bitis} />
        <div className="ozlejant"><span><i style=${{ background: 'var(--run)' }}></i>Sağlam</span><span><i style=${{ background: 'var(--stop)' }}></i>Hurda</span><span>–: o gün kayıt yok</span></div>
      </div>
      <div className="glass ozkart">
        <span className="over">Başarılarım</span>
        ${o.rozetler.length ? html`<div className="ozrozetler">${o.rozetler.map(r => html`<div key=${r.kod} className="ozrozet"><span style=${{ color: r.kod === 'sifir-hurda' ? 'var(--run)' : 'var(--hazard)' }}><${I} n=${r.kod === 'sifir-hurda' ? 'check' : 'chart'} s=${24} /></span><div><b>${r.baslik}</b><small>${r.aciklama}</small></div></div>`)}</div>`
          : html`<small className="muted">Birkaç gün kayıt birikince burada görünür.</small>`}
      </div>
      <div className="glass ozkart ozgenis">
        <span className="over">${OZET_DONEM_ADI[o.donem]} çalıştığım işler</span>
        ${o.isler.length ? html`<ul className="ozisler">${o.isler.map((i, n) => html`<li key=${(i.isEmriId ?? 'e') + ':' + n}>
          <div><b>${i.parca || i.emirNo}${i.opNo != null ? ' · OP ' + i.opNo : ''}${i.adimAdi ? ' ' + i.adimAdi : ''}</b><span className=${'ozdurum ' + i.durum}>${OZET_IS_DURUMU[i.durum]}</span>
            <small>${i.emirNo}${i.saniye != null ? ' · ' + ozetSure(i.saniye) : ''}</small></div>
          <div className="ozn">${ozetAdet(i.saglam)}<small>${i.hurda ? ozetAdet(i.hurda) + ' hurda' : 'sağlam'}</small></div></li>`)}</ul>`
          : html`<small className="muted">Bu dönemde sayım ya da çalışma kaydın yok.</small>`}
      </div>
      <div className="glass ozkart">
        <span className="over">Hurda nedenlerim</span>
        ${o.hurdaNedenleri.length ? html`<div className="ozbarlar">${o.hurdaNedenleri.map(h => html`<div key=${h.ad}><span>${h.ad}</span><b>${ozetAdet(h.adet)}</b><span className="ozt"><i style=${{ width: Math.max(4, Math.round((h.adet / Math.max(1, o.hurdaNedenleri[0].adet)) * 100)) + '%' }}></i></span></div>`)}</div>`
          : html`<small className="muted">Bu dönemde hurdan yok.</small>`}
      </div>
      <div className="glass ozkart ozgenis">
        <span className="over">Mesailerim · önümüzdeki 7 gün</span>
        ${o.mesailer === null ? html`<small className="muted">Vardiya takvimin yok: bir istasyona atanınca görünür.</small>` : html`<ul className="ozmesai">
          ${o.mesailer.map(m => html`<li key=${m.tarih} className=${m.tarih === o.bitis ? 'bugun' : ''}>
            <span>${m.tarih === o.bitis ? 'Bugün' : ozetTarih(m.tarih)}</span>
            ${m.baslangic ? html`<b>${ozetSaat(m.baslangic)} – ${ozetSaat(m.bitis)}</b><small>${ozetSure(m.dakika * 60)} net</small>`
              : html`<b className="muted">${m.kapali ? (m.kapali.ad ?? (m.kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı')) : 'Mesai yok'}</b><small></small>`}
          </li>`)}
        </ul>`}
      </div>
      <div className="glass ozkart">
        <span className="over">Fazla mesaim</span>
        ${o.fazlaMesai === null ? html`<small className="muted">İK kaydın bağlı değil.</small>` : html`<div className="ozfm">
          <div><span>Bu ay</span><b>${ozetSayi(o.fazlaMesai.aySaat)} <small>sa</small></b></div>
          <div><span>Bu yıl</span><b>${ozetSayi(o.fazlaMesai.yilSaat)}${o.fazlaMesai.yillikSinirSaat !== null ? html` <small>/ ${ozetSayi(o.fazlaMesai.yillikSinirSaat)} sa</small>` : html` <small>sa</small>`}</b></div>
          ${fazlaMesaiDolulugu(o.fazlaMesai) !== null ? html`<span className="ozt"><i className=${(fazlaMesaiDolulugu(o.fazlaMesai) ?? 0) >= 0.9 ? 'dolu' : ''} style=${{ width: Math.max(2, Math.round((fazlaMesaiDolulugu(o.fazlaMesai) ?? 0) * 100)) + '%' }}></i></span>` : null}
          ${o.fazlaMesai.bekleyenSaat ? html`<small className="muted">${ozetSayi(o.fazlaMesai.bekleyenSaat)} sa onay bekliyor</small>` : null}
        </div>
        ${o.fazlaMesai.satirlar.length ? html`<ul className="ozliste">${o.fazlaMesai.satirlar.map((r, i) => html`<li key=${r.tarih + i}><span>${ozetTarih(r.tarih)}<small>${r.tur}</small></span><b>${ozetSayi(r.saat)} sa${r.onay === 'Beklemede' ? html`<small>bekliyor</small>` : null}</b></li>`)}</ul>`
          : html`<small className="muted">Bu ay fazla mesain yok.</small>`}`}
      </div>
      <div className="glass ozkart ozgenis">
        <span className="over">Yetkili olduğum yerler</span>
        ${o.yetkiler.istasyonlar.length || o.yetkiler.makineler.length ? html`<div className="ozyetki">
          ${o.yetkiler.istasyonlar.map(i => html`<span key=${'i' + i.id} className="ozyer" title=${i.ad}><${I} n="layers" s=${16} /><b>${i.kod}</b><small>${i.ad}</small></span>`)}
          ${o.yetkiler.makineler.map(m => html`<span key=${'m' + m.id} className="ozyer" title=${m.ad}><${I} n="gauge" s=${16} /><b>${m.kod}</b><small>${m.istasyonKodu ? m.istasyonKodu + ' · ' : ''}${m.ad}</small></span>`)}
        </div>` : html`<small className="muted">Bugün sana atanmış istasyon ya da makine yok.</small>`}
      </div>
      <div className="glass ozkart">
        <span className="over">İzinlerim</span>
        ${o.izinler === null ? html`<small className="muted">İK kaydın bağlı değil.</small>` : html`<div className="ozfm">
          <div><span>Kalan yıllık izin</span><b>${ozetSayi(o.izinler.kalanGun)} <small>gün</small></b></div>
          <div><span>Kullanılan / bekleyen</span><b>${ozetSayi(o.izinler.kullanilanGun)} <small>/ ${ozetSayi(o.izinler.bekleyenGun)} gün</small></b></div>
          ${o.izinler.sonrakiHakTarihi ? html`<small className="muted">${ozetTarih(o.izinler.sonrakiHakTarihi)}: +${ozetSayi(o.izinler.sonrakiHakGun)} gün yeni hak</small>` : null}
        </div>
        ${o.izinler.yaklasan.length ? html`<ul className="ozliste">${o.izinler.yaklasan.map((z, i) => html`<li key=${z.baslangic + i}><span>${ozetTarih(z.baslangic)}${z.bitis !== z.baslangic ? ' – ' + ozetTarih(z.bitis) : ''}<small>${z.tur}</small></span><b>${ozetSayi(z.gun)} gün<small className=${z.durum === 'Onaylandı' ? 'onay' : ''}>${z.durum === 'Onaylandı' ? 'onaylı' : 'bekliyor'}</small></b></li>`)}</ul>`
          : html`<small className="muted">Yaklaşan izin yok.</small>`}`}
      </div>
    </div>
    ${sunucusuz ? html`<small className="ozornek">Gösterim kipi · örnek veri</small>` : null}
  </div>`;
}
