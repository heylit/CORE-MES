/* ---- Tek kısıt hattı: her kısıt bir kez tanımlanır, veri yeri ve her çözücünün onu nasıl kullandığı burada yazılıdır.
   Hakem (motorun değerlendirmesi) hepsini tam uygular; öneri hangi çözücüden gelirse gelsin plana hakemden geçerek girer.
   tam: aynen; yaklasik: değiştirilmiş hâliyle (fark not'ta); gevsek: alt sınır geçerli kalsın diye bilerek küçültülmüş; yok: modelde yok. */
const KISITLAR=[
 {id:'takvim',ad:'Vardiya, tatil, tezgâh vardiyası, ek mesai',veri:'vardiyalar, calismaGunleri, tatiller, tezgahlar[].vardiyalar, ekMesai',
  motor:'tam',sinir:'tam',cerceve:'tam',cpsat:'tam',not:'CP-SAT takvimi motorun başla-bitir tablosundan okur.'},
 {id:'ariza',ad:'Arıza ve planlı bakım',veri:'down (tezgâh, başlangıç, bitiş)',motor:'tam',sinir:'tam',cerceve:'tam',cpsat:'tam',not:'Takvimden düşülür.'},
 {id:'tezgah',ad:'Alternatif tezgâh, verim, tek tezgâhta tek iş',veri:'urunler[].rota[].tezgahlar, tezgahlar[].verim',motor:'tam',sinir:'tam',cerceve:'yaklasik',cpsat:'tam',not:'Çerçeve tezgâh grubunu toplu sayar.'},
 {id:'rota',ad:'Rota sırası, örtüşmeli geçiş, taşıma süresi',veri:'rota[].bag, ayarlar.tasimaSaat, transferOran',motor:'tam',sinir:'gevsek',cerceve:'yaklasik',cpsat:'yaklasik',
  not:'Alt sınır ve CP-SAT örtüşmede ilk partiyi ayarsız sayar.'},
 {id:'ayar',ad:'Sıraya bağlı ayar (aile matrisi, aynı aile kısalması)',veri:'ayarMatrisi, rota[].aile, tezgahlar[].ayar, w.famK',motor:'tam',sinir:'gevsek',cerceve:'gevsek',cpsat:'yaklasik',
  not:'Alt sınır ve çerçeve en kısa ayarı alır. CP-SAT geçişi tezgâh sırasıyla hesaplar; geçişin uzattığı süreyi takvimsiz ekler.'},
 {id:'fai',ad:'İlk parça onayı',veri:'rota[].fai, ayarlar.faiSaat',motor:'tam',sinir:'tam',cerceve:'tam',cpsat:'tam',not:''},
 {id:'ayarci',ad:'Ayarcı sayısı',veri:'personel[].ayar, devamsizlik, eksik',motor:'tam',sinir:'yok',cerceve:'yok',cpsat:'yaklasik',not:'CP-SAT ayarcıyı en kısa ayar süresince sayar.'},
 {id:'personel',ad:'Operatör sayısı ve yetkinlik grubu, ışıksız tezgâh',veri:'personel[].vardiya/gruplar, tezgahlar[].opOran/isiksiz, devamsizlik, eksik',motor:'tam',sinir:'yok',cerceve:'tam',cpsat:'yaklasik',
  not:'CP-SAT ayar süresini de operatörlü sayar; ışıksız tezgâhı hiç saymaz.'},
 {id:'aparat',ad:'Aparat ve fikstür adedi',veri:'aparatlar[].adet, rota[].aparat',motor:'tam',sinir:'yok',cerceve:'yok',cpsat:'tam',not:''},
 {id:'fason',ad:'Fason çıkış günü, süre, kapasite',veri:'fasoncular',motor:'tam',sinir:'yaklasik',cerceve:'tam',cpsat:'tam',not:'Alt sınır fason kapasitesini saymaz.'},
 {id:'program',ad:'CNC programı hazır olmadan başlamaz',veri:'rota[].program, ayarlar.programSaat',motor:'tam',sinir:'tam',cerceve:'yok',cpsat:'tam',not:''},
 {id:'serbest',ad:'Siparişin serbest bırakılma zamanı',veri:'siparisler[].serbest',motor:'tam',sinir:'tam',cerceve:'tam',cpsat:'tam',not:''},
 {id:'malzeme',ad:'Malzeme (stok, satın alma, tedarikçi gecikmesi)',veri:'malzemeler, satinalma, tedarikciler',motor:'karar',sinir:'karar',cerceve:'karar',cpsat:'karar',
  not:'K3 kararı: eksik malzemede iş başlar, uyarı verilir; "sert" seçilirse hepsi başlangıç sınırı olarak alır.'},
 {id:'sabit',ad:'Başlamış, kilitli, dondurulmuş işler',veri:'gercek, locks, dondurma',motor:'tam',sinir:'tam',cerceve:'tam',cpsat:'tam',not:'Hakem değişmişse sayar ve reddeder.'},
 {id:'amac',ad:'Sıralı amaç: gecikme > değişiklik > ayar > maliyet',veri:'w.amac, oncelik, termin',motor:'tam',sinir:'yaklasik',cerceve:'yaklasik',cpsat:'yaklasik',
  not:'Alt sınır ve çerçeve yalnız ağırlıklı gecikmeyi; CP-SAT gecikmeyi, sonra ayarı sayar. Değişikliği hakem ölçer.'},
 {id:'butce',ad:'Değişiklik ve haftalık mesai bütçesi',veri:'w.degisimButce, mesaiButce',motor:'tam',sinir:'yok',cerceve:'tam',cpsat:'yok',not:'Hakem uygular.'}
];
const KDURUM={tam:'tam',yaklasik:'yaklaşık',gevsek:'gevşek (sınır geçerli kalsın)',yok:'yok',karar:'karara bağlı'};

/* Veri denetimi: kısıtlar birbirinden kopmasın diye veri birlikte sınanır. Çözücüye gitmeden önce koşar. */
function veriDenetimi(st,cx){
  cx=cx||compile(st);const D=cx.D,out=[];const bul=(k,t)=>out.push({k,t});
  const kim={};for(const p of D.personel)for(const g of p.gruplar||[])(kim[g]=kim[g]||new Set()).add(p.vardiya);
  const ayarci=new Set(D.personel.filter(p=>p.ayar).map(p=>p.vardiya));
  for(const m of D.tezgahlar){const vs=m.vardiyalar&&m.vardiyalar.length?m.vardiyalar:[...new Set(Object.values(D.calismaGunleri).flat())];
    const op=m.opOran==null?1:+m.opOran;
    for(const v of vs){if(op>0&&!(kim[m.grup]||new Set()).has(v))bul('personel',`${m.id} ${v} vardiyasında açık ama ${m.grup} yetkinliğinde personel yok; bu vardiyadaki işler yerleşemez.`);
      if(!ayarci.has(v))bul('ayarci',`${m.id} ${v} vardiyasında ayarcı yok; ayar bu vardiyada yapılamaz.`);}}
  for(const o of cx.ops){if(!o.c.length)bul('tezgah',`${o.id}: uygun tezgâh ya da fasoncu yok.`);
    if(o.aparat&&!cx.AP[o.aparat])bul('aparat',`${o.id}: ${o.aparat} aparatı tanımlı değil.`);}
  for(const u of D.urunler)for(const o of u.rota)for(const [k] of o.bag||[])if(!u.rota.some(x=>x.k===k))bul('rota',`${u.id} ${o.k}: öncül ${k} rotada yok.`);
  const fam={};for(const o of cx.ops)if(o.aile)for(const c of o.c)if(!c.fas)(fam[c.m]=fam[c.m]||new Set()).add(o.aile);
  const mx=new Set((D.ayarMatrisi||[]).map(e=>e.den+'|'+e.ye));let eksik=0;
  for(const m in fam){const a=[...fam[m]];for(const x of a)for(const y of a)if(x!==y&&!mx.has(x+'|'+y))eksik++;}
  if(eksik)bul('ayar',`${eksik} aile geçişinin ayar süresi matriste yok; tam ayar alınır.`);
  for(const j in cx.jobs){const r=cx.mat.res[j];if(r&&!isFinite(r.ready))bul('malzeme',`${j}: malzeme stok ve siparişle karşılanmıyor.`);}
  for(const f of D.fasoncular||[])if(!(f.cikisGunleri||[]).length)bul('fason',`${f.id}: çıkış günü yok.`);
  return out;
}
