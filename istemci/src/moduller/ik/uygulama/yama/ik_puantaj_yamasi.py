#!/usr/bin/env python3
"""İK puantaj yaması (kart #1571): derlenmiş İK paketine puantaj ekranını ekler.

ik-modulu kaynağı depoda yok; paket v3'teki gibi yerinde yamalanır. Her değişiklik paketin içinde tek kez geçen bir
metne bağlanır; metin bulunamaz ya da birden çok geçerse yama durur ve hiçbir şey yazılmaz. Uygulanmış pakette yalnız ekran kodu yenilenir.

Kullanım: python3 istemci/src/moduller/ik/uygulama/yama/ik_puantaj_yamasi.py
"""
import json
import pathlib
import sys

KOK = pathlib.Path(__file__).resolve().parent
PAKET = KOK.parent / 'paket.ts'
EKRAN = KOK / 'ik_puantaj_ekran.js'
ONEK = 'export const IK_PAKETI = '
IMZA = 'function TmiPuantajSayfasi('

CSS = """
.pu-wrap{max-width:100%}
.gantt.pu th.pu-ad,.gantt.pu td.name{position:sticky;left:0;z-index:1;background:var(--surface)}
.gantt.pu th.pu-ad{text-align:left;padding-left:10px}
.gantt.pu td{min-width:34px;font-variant-numeric:tabular-nums}
.gantt.pu .pu-top{min-width:56px;padding:0 6px;font-weight:600}
.gantt.pu th.pu-top{font-weight:500}
.pu-gunad{font-size:10px}
.pu-tik{cursor:pointer}
.pu-tik:hover,.pu-tik:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
.gantt td.pu-tatil,.pu-k.pu-tatil{background:color-mix(in srgb,var(--tab) 18%,transparent)}
.pu-fazla{box-shadow:inset 0 -3px 0 var(--tab);font-weight:600}
.pu-acik,.pu-oneri{color:var(--muted)}
.pu-eksik,.pu-devamsiz{color:var(--bad)}
.pu-devamsiz{font-weight:600}
.gantt td.pu-izinli,.gantt td.pu-raporlu,.pu-k.pu-izinli,.pu-k.pu-raporlu{background:color-mix(in srgb,var(--primary) 16%,transparent)}
.legend i.pu-l-fazla{box-shadow:inset 0 -3px 0 var(--tab);border:1px solid var(--line)}
.legend i.pu-l-eksik{background:var(--bad)}
.pu-takvim{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.pu-k{border:1px solid var(--line);border-radius:6px;min-height:64px;padding:4px 6px;font-size:12px;display:flex;flex-direction:column;gap:2px;min-width:0;overflow:hidden}
.pu-k.bas{min-height:0;border:0;text-align:center;color:var(--muted);font-weight:500}
.pu-k.bos{border:0}
.pu-k small{color:var(--muted)}
.pu-k b{font-weight:600}
.pu-k em{font-style:normal;color:var(--warn);font-weight:600}
.pu-k.today{border-color:var(--tab)}
.pu-k.we{background:var(--surface-2)}
.pu-kisiler{max-height:240px;overflow:auto}
@media (max-width:640px){.pu-k{min-height:52px;padding:3px;font-size:11px}.pu-k span{overflow-wrap:anywhere}}"""

# Küçük düzeltmeler: (eski, yeni, ad). Uygulanmış pakette yeni metin zaten vardır, atlanır.
DUZELTMELER = [
    # Borç 195: Mesailerim'deki "Devamsızlık (gün)" kayıt değil ayrı gün sayar (aynı güne iki kayıt bir gün).
    ('s=n.filter(o=>o.tur==="Devamsızlık").length,d=l.filter(',
     's=new Set(n.filter(o=>o.tur==="Devamsızlık").map(o=>o.tarih)).size,d=l.filter(', 'Mesailerim devamsızlık günü'),
    # Borç V3-2: Devam ekranındaki "Devamsızlık" kişi başına ayrı gün sayar; asıl kaynak İK olmalı (UYUM-BORCU).
    ('<b>${s("Devamsızlık")}</b><span>Devamsızlık</span>',
     '<b>${new Set(n.filter(u=>u.tur==="Devamsızlık").map(u=>u.empId+"|"+u.tarih)).size}</b><span>Devamsızlık</span>', 'Devam devamsızlık günü'),
    # Soru 74: iş günüyle sayılan izinde gün önerisi sunucunun hesabından (kişinin vardiya takvimi); İK izin formu ve çalışanın izin talebi.
    ('a.elements.gun.value=Bt(i,t,Re.includes(a.elements.tur.value)))}}',
     'a.elements.gun.value=Bt(i,t,Re.includes(a.elements.tur.value)),Re.includes(a.elements.tur.value)&&TmiIzinGunu(a.elements.empId.value,C(i),C(t),g=>{a.elements.baslangic.value===C(i)&&a.elements.bitis.value===C(t)&&(a.elements.gun.value=g)}))}}',
     'İK izin formu gün önerisi'),
    ('let s=Re.includes(t),d=Bt(l,n,s),o=Ia(a)',
     'let s=Re.includes(t),d=(s?TmiIzinGunu(a.id,C(l),C(n),()=>i()):null)??Bt(l,n,s),o=Ia(a)', 'izin talebi gün önerisi'),
    # Soru 75: kişi sayfası Devam ve mesai sekmesinde kişinin vardiyası salt okunur (Vardiya modülünden).
    ('l=n("Puantaj takvimi",TmiKisiTakvim(a))', 'l=n("Vardiya",TmiKisiVardiya(a))+n("Puantaj takvimi",TmiKisiTakvim(a))', 'kişi vardiyası'),
    # Karar 84 (IK-72): değeri geçmişe yazılmayan alan (IBAN, ücret, kan grubu, engel) günlükte ve CSV'de "değişti" görünür.
    ("w.big?'<i class=\"muted\">büyük değer</i>':c(gn(w.from))",
     "w.big?'<i class=\"muted\">'+(w.gizli?'değişti':'büyük değer')+'</i>':c(gn(w.from))", 'günlük gizli alan (önce)'),
    ("w.big?'<i class=\"muted\">büyük değer</i>':c(gn(w.to))",
     "w.big?'<i class=\"muted\">'+(w.gizli?'değişti':'büyük değer')+'</i>':c(gn(w.to))", 'günlük gizli alan (sonra)'),
    ('t?t.big?"büyük değer":gn(t.from):""', 't?t.big?(t.gizli?"değişti":"büyük değer"):gn(t.from):""', 'günlük CSV gizli alan (önce)'),
    ('t?t.big?"büyük değer":gn(t.to):""', 't?t.big?(t.gizli?"değişti":"büyük değer"):gn(t.to):""', 'günlük CSV gizli alan (sonra)'),
]

YORUM_ESKI = '// İK v3 yaması uygulandı (Mesailerim, bordro onayı): ik_v3_uygulama_yamasi.py, NOTLAR.md.\n'
YORUM_YENI = YORUM_ESKI + '// İK puantaj yaması uygulandı (kart #1571): uygulama/yama/ik_puantaj_yamasi.py, NOTLAR.md.\n'


def degistir(metin, eski, yeni, ad):
    n = metin.count(eski)
    if n != 1:
        sys.exit(f'Yama durdu: "{ad}" çapası {n} kez geçiyor (1 olmalı).')
    return metin.replace(eski, yeni)


def duzelt(p):
    for eski, yeni, ad in DUZELTMELER:
        if yeni in p:
            continue
        p = degistir(p, eski, yeni, ad)
    return p


def main():
    kaynak = PAKET.read_text(encoding='utf-8')
    i = kaynak.index(ONEK) + len(ONEK)
    bas, govde = kaynak[:i], kaynak[i:].rstrip()
    if not govde.endswith(';'):
        sys.exit('Yama durdu: paket.ts beklenen biçimde değil.')
    p = json.loads(govde[:-1])
    ekran = EKRAN.read_text(encoding='utf-8')
    if IMZA in p:
        # Yama uygulanmış: yalnız ekran kodu yenilenir (çapalar ve stil yerinde kalır).
        bas_i = p.index(ekran.split('\n', 1)[0])
        son_i = p.index('\nvar sr={pano:Sd,')
        p = p[:bas_i] + ekran + p[son_i:]
        yaz(bas, duzelt(p))
        return

    # Devam ve mesai: sekme seçimi; Puantaj sekmesi kendi sayfasını çizer.
    p = degistir(p, 'function Ed(){let a=f.month,', 'function Ed(){if(f.devamTab==="puantaj")return TmiPuantajSayfasi();let a=f.month,', 'Ed')
    p = degistir(p, '$e("att","Kayıt ekle"))+`<div class="toolbar">${Tn("month")}${Ri("aq"',
                 '$e("att","Kayıt ekle"))+`<div class="toolbar">${TmiDevamSekme()}${Tn("month")}${Ri("aq"', 'Ed araç çubuğu')
    # Kişi sayfası, Devam ve mesai sekmesi: ay takvimi en üstte.
    p = degistir(p, 'l=n(`${r} fazla mesai`', 'l=n("Puantaj takvimi",TmiKisiTakvim(a))+n(`${r} fazla mesai`', 'kişi devam sekmesi')
    # Mesailerim: kendi takvimi, salt okunur, sayfanın ay seçicisiyle.
    p = degistir(p, '<span>${i} fazla mesai, sınıra kalan ${Y(g)} saat</span></div></div><section class="panel" style="padding:6px 10px">',
                 '<span>${i} fazla mesai, sınıra kalan ${Y(g)} saat</span></div></div><section class="panel"><h2>Puantaj takvimi</h2>${TmiKisiTakvim(a,!0,!0)}</section><section class="panel" style="padding:6px 10px">',
                 'Mesailerim')
    # Yeniden yüklemede puantaj önbelleği boşalır.
    p = degistir(p, 'async function nr(){D.readOnly=!!ra.readOnly;', 'async function nr(){TmiPuTemizle();D.readOnly=!!ra.readOnly;', 'yükleme')
    # Düğme işlemleri.
    p = degistir(p, 'var Ki={new(a){', 'var Ki={...TmiPuIslemleri,new(a){', 'işlemler')
    # Ekran kodu görünüm tablosundan önce.
    p = degistir(p, 'var sr={pano:Sd,', ekran + '\nvar sr={pano:Sd,', 'görünüm tablosu')
    # Stil: takvim stillerinin ardından.
    p = degistir(p, '.gantt th.today{color:var(--ink);font-weight:700;box-shadow:inset 0 -3px 0 var(--tab)}',
                 '.gantt th.today{color:var(--ink);font-weight:700;box-shadow:inset 0 -3px 0 var(--tab)}' + CSS, 'stil')

    bas = degistir(bas, YORUM_ESKI, YORUM_YENI, 'başlık yorumu')
    yaz(bas, duzelt(p))


def yaz(bas, p):
    yeni = json.dumps(p, ensure_ascii=False).replace('</script', '<\\/script')
    PAKET.write_text(bas + yeni + ';\n', encoding='utf-8')
    print(f'paket.ts yamalandı ({len(yeni)} karakter).')


if __name__ == '__main__':
    main()
