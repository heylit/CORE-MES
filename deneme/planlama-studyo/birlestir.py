import os,re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('cikti',exist_ok=True)
L=open('app-v1.js').read().split('\n')
r=lambda a,b:'\n'.join(L[a-1:b])
P=lambda f:open('parca/'+f).read().rstrip('\n')
def rep(s,a,b,n=1):
    assert s.count(a)>=1,(a[:80]); return s.replace(a,b) if n==0 else s.replace(a,b,n)
bas=r(1,63).replace("'tmi-planlama-modulu-v1'","'tmi-planlama-modulu-v3'")
# sayı biçimi her çağrıda yeni Intl nesnesi kurmasın (büyük tabloda çizimin önemli payı); toLocaleString aynı seçeneklerle aynı biçimi verir
bas=rep(bas,"const sayi = (x, k = 1) => x == null || !isFinite(x) ? '—' : Number(x).toLocaleString('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 });","const SAYI_BICIM = {};\nconst sayi = (x, k = 1) => x == null || !isFinite(x) ? '—' : (SAYI_BICIM[k] || (SAYI_BICIM[k] = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 }))).format(Number(x));")
orta=r(367,698)
orta=rep(orta,"katsayı Çözücü sayfasında","katsayı Kısıtlar sayfasında")
orta=rep(orta,"U.sayfa = 'pano'","U.sayfa = 'masa'",0) if "U.sayfa = 'pano'" in orta else orta
veri="""  const veri = `<div class="pm-dik"><div class="pm-dugmeler">${Object.entries(VERI).map(([id, v]) => dugme(v.veri.meta.ad.replace(' (uydurma veri)', ''), 'set-yukle', { kucuk: true, veri: `data-v="${id}"`, yetki: 'veri.yaz', cls: S.setId === id ? 'tc-dugme-birincil' : '' })).join('')}</div><p class="pm-kucuk">Örnek veri setini yüklemek çalışmadaki veriyi değiştirir; senaryolar ve değişiklik izi kalır.</p>
  <div class="pm-dugmeler">${dugme('Veriyi kopyala (JSON)', 'disari', { simge: 'download', kucuk: true })}${dugme('İçe aktar', 'iceri-ac', { simge: 'upload', kucuk: true, yetki: 'veri.yaz' })}${dugme('Denemeyi sıfırla', 'sifirla', { simge: 'rotate', kucuk: true, tehlike: true, yetki: 'veri.yaz' })}</div></div>`;
"""
orta=rep(orta,"  return `<div class=\"pm-iki\">${kart('Çalışma', calisma + kaydetForm",veri+"  return `<div class=\"pm-iki\">${kart('Çalışma', calisma + kaydetForm")
orta=rep(orta,"${U.karsilastir.length >= 2 ? karsilastirma() : ''}`;","${U.karsilastir.length >= 2 ? karsilastirma() : ''}${kart('Veri seti', veri)}`;")
kat=r(718,750)
kat=rep(kat,"    if (p.tur === 'op') d = opPaneli(p.id) || { baslik: 'İş', govde: '<p class=\"pm-alt\">Bu iş artık planda yok.</p>', alt: dugme('Kapat', 'pencere-kapat'), yan: true };\n","")
ey=P('eski-eylem.txt')
ey=ey.replace("U.sayfa = 'pano'","U.sayfa = 'masa'")
ey=rep(ey,"S.plan = clone(s.plan); S.plan.dataVer = S.dataVer;","S.plan = clone(s.plan); S.plan.dataVer = S.dataVer; S.kapali = (s.plan && s.plan.kapali) || []; U.hamle = null;")
son=P('eski-son.txt')
son=rep(son,"  if (c === 'sure') { S.w.sure = +el.value; kaydet(); return; }","""  if (c === 'sure') { S.w.sure = +el.value; kaydet(); return; }
  if (c === 'kip-coz') { U.kipCoz = el.value; return; }
  if (c === 'yuk') { U.yuk = el.checked; U.gKoru = true; kaydet(); render(); return; }
  if (c === 'canli-goster') { U.canliGoster = el.checked; render(); return; }
  if (c === 'kisit') { const v = el.dataset.v, ac = el.checked; degistir(ac ? 'Kısıt açıldı' : 'Kısıt kapatıldı', KATALOG_DUZ[v].ad, () => { S.kapali = ac ? S.kapali.filter(x => x !== v) : [...S.kapali.filter(x => x !== v), v]; }, 'plan.yaz'); return; }
  if (c === 'oncelik') { const s = S.D.siparisler.find(x => x.id === el.dataset.v); if (!s) return; degistir('Öncelik değişti', `${s.id}: ${ONCELIK[s.oncelik]} → ${ONCELIK[+el.value]}`, () => { s.oncelik = +el.value; }); return; }
  if (c === 'param') {
    const yer = el.dataset.yer, k = el.dataset.k; const sec = el.tagName === 'SELECT';
    let val = sec ? el.value : Number(el.value);
    if (!sec && (el.value === '' || !isFinite(val) || val < +el.min || val > +el.max)) { bildir(`Değer ${el.min} ile ${el.max} arasında olmalı.`, 'hata'); render(); return; }
    if (k === 'fasonTalas' && !val) val = null;
    const hedef = yer === 'w' ? S.w : yer === 'param' ? S.param : (S.D.ayarlar = S.D.ayarlar || {});
    if (hedef[k] === val) return;
    const ad = (Object.values(KATALOG_DUZ).flatMap(x => x.p || []).find(p => p[1] === k) || [])[2] || k;
    if (k === 'maxChg') { S.param.maxChg = val; kaydet(); return; }
    degistir('Parametre değişti', `${ad}: ${hedef[k] ?? '—'} → ${val ?? '—'}`, () => { hedef[k] = val; }, yer === 'ayarlar' ? 'veri.yaz' : 'plan.yaz');
    return;
  }""")
son=rep(son,"  if (el.dataset.inp === 'ara-satir')","  if (el.dataset.inp === 'sen-not') { const s = S.senaryolar.find(x => x.id === el.dataset.v); if (s) { s.not = el.value; kaydet(); } return; }\n  if (el.dataset.inp === 'tb-not') { const n = (S.notlar || []).find(x => x.id === el.dataset.v); if (n) { n.metin = el.value; kaydet(); } return; }\n  if (el.dataset.inp === 'ara-satir')")
son=rep(son,"document.querySelectorAll('tr[data-ara]')","document.querySelectorAll('[data-ara]')")
a=son.index("  if (tur === 'cozucu') {"); b=son.index("  if (tur === 'senaryo-kaydet') {")
son=son[:a]+son[b:]
son=rep(son,"  if (tur === 'senaryo-kaydet') {",open('cp-submit.txt').read()+"  if (tur === 'senaryo-kaydet') {")
son=rep(son,"  if (c === 'kip-coz') { U.kipCoz = el.value; return; }","  if (c === 'kip-coz') { U.kipCoz = el.value; return; }\n  if (c === 'st-sen') { const l = (U.stSen && U.stSen.length ? U.stSen : senAdaylari().slice(0, 3).map(a => a.id)).filter(x => x !== el.dataset.v); if (el.checked) l.push(el.dataset.v); U.stSen = l.slice(0, 3); render(); return; }\n  if (c === 'tb-bul') { tbBul(el.value); el.value = ''; return; }\n  if (c === 'tb-yol') { U.tbYol = el.checked; render(); return; }\n"+open('cp-change.txt').read().rstrip('\n'))
son=rep(son,"  if (tur === 'senaryo-kaydet') {","  if (tur === 'kriz') { const { ev, hata } = olayOku(f); if (hata) return hataGoster([hata]); krizHesapla(ev); return; }\n  if (tur === 'senaryo-kaydet') {")
son=rep(son,"    if (adli) s.adli = true; S.senaryolar.push(s);","    if (f.dataset.sepet && U.taslak && U.taslak.adimlar.length) s.not = 'Sepetten: ' + U.taslak.adimlar.map((x, i) => (i + 1) + '. ' + x.ad).join('; ');\n    if (adli) s.adli = true; S.senaryolar.push(s);")
son=rep(son,"if (e.key === 'Escape') { if (U.onay)","if (e.key === 'Escape') { if (surukle) { surukleBitir(); surukle = null; } else if (U.onay)")
son=rep(son,"else if (U.menu || U.tum) { U.menu = false; U.tum = false; render(); }","else if (U.menu || U.tum || U.cozAcik) { U.menu = false; U.tum = false; U.cozAcik = false; render(); } else if (U.studyo) { tbStudyoKapat(); } else if (U.tbAg && U.agGun != null) { if (U.gySec) { U.gySec = null; render(); } else gyCik(); } else if (U.tamEkran) { U.tamEkran = false; render(); } else if (U.hamle) { U.hamle = null; render(); }")
son=rep(son,"U.sayfa = u.sayfa || 'pano'; U.zoom = u.zoom || 10;","U.sayfa = u.sayfa || 'tahta'; U.zoom = u.zoom || 10; U.yuk = !!u.yuk;")
son=rep(son,"ANAHTAR + '-ui'","ANAHTAR + '-ui4'")
out='\n'.join([bas,P('a-durum.js'),'',r(119,128),'',P('b-kabuk.js'),'',P('c-masa.js'),'',orta,'',P('d-kisitlar.js'),'',P('h-cozuculer.js'),'',P('i-studyo.js'),'',P('j-ag3b.js'),'',P('k-gorunum.js'),'',P('l-fabrika.js'),'',P('m-plan.js'),'',P('n-karar.js'),'',P('o-tahta.js'),'',P('p-ag.js'),'',P('q-studyo.js'),'',P('r-studyolar.js'),'',P('s-gun.js'),'',P('t-tekyer.js'),'',P('u-bugun.js'),'',P('v-yardim.js'),'',P('w-v20.js'),'',P('x-resim.js'),'',P('y-atolye.js'),'',P('z-komuta.js'),'',P('za-merkez.js'),'',P('zb-merkez2.js'),'',P('zc-tahta.js'),'',P('zd-tam.js'),'',P('ze-rota.js'),'',P('zf-resim.js'),'',P('zg-odak.js'),'',P('zh-nabiz.js'),'',P('zi-sade.js'),'',P('zj-gorunum.js'),'',P('zk-kabuk.js'),'',P('zl-yan.js'),'',P('zm-ozet.js'),'',P('zn-kesif.js'),'',P('zo-kontrol.js'),'',P('zp-klavye.js'),'',P('zq-olcek.js'),'',P('zr-agirlik.js'),'',P('zs-olcek-ortak.js'),'',P('zt-malzeme-plan.js'),'',P('zu-yan-sayfalar.js'),'',P('zv-termin.js'),'',P('zw-denge.js'),'',P('zx-sevkiyat.js'),'',P('zy-olay-uyum.js'),'',P('zz-karar-1650.js'),'',P('zz2-bolme.js'),'',P('zz3-erken-sevk.js'),'',P('zz4-oto-bolme.js'),'',P('zz5-olcek-her-yer.js'),'',P('zz6-maliyet-mesai.js'), P('zz7-malzeme-one.js'), P('zz8-boy.js'), P('zz9-yillik.js'), P('zz10-elle-bolme.js'), P('zz11-parti-tarama.js'), P('zz12-montaj.js'), P('zz13-ayar-sifir.js'), P('zz14-qmin-kasa.js'), P('zz15-ayar-one.js'), P('zz16-ortusme.js'), P('zz17-oto-akis.js'), P('zz18-montaj-arama.js'), P('zz20-kayan-pencere.js'), P('zz21-hiz.js'), P('zz22-plan-atolyesi.js'), P('zz24-sade.js'), P('zz25-sade-takvim.js'), P('zz25-sade-maliyet.js'), P('zz25-sade-plan.js'), P('zz26-recete-rota.js'), P('zz27-rr-veri.js'), P('zz28-rr-canli.js'), P('zz29-gorsel.js'), P('zz30-isi.js'), P('zz31-studyo.js'), P('zz32-tek-studyo.js'), P('zz33-studyo-ux.js'), P('zz34-adet-sayim.js'), P('zz35-plan-gercek.js'),'',kat,'',P('e-coz.js'),'',P('f-olay-bas.js'),ey,P('g-surukle.js'),'',son,''])
out=out.replace("ic('chevron-down', 'k')","ic('down', 'k')")
for bad in ['sPano','sCizelge','sCozucu(','opPaneli','tercih']:
    if bad in out: print('KALDI:',bad,[m.start() for m in re.finditer(bad,out)][:5])
import re as _re, collections as _c
_ad=_c.Counter(_re.findall(r'^(?:async )?(?:function|const|let) ([A-Za-z0-9_$]+)', out, _re.M))
_cift=[k for k,v in _ad.items() if v>1]
assert not _cift, 'ayni ad iki kez tanimli: '+', '.join(_cift)
open('cikti/app.js','w').write(out)
print(len(out.split('\n')))
