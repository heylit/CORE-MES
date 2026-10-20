#!/usr/bin/env python3
"""İK zimmet yaması (karar 244 a): zimmetin sahibi İdari İşler; derlenmiş İK paketinden zimmet ekranları kalkar.

Kalanlar: Zimmet sayfası menüden ve görünüm tablosundan (adres /ik/zimmet panoya düşer), kişi kartının Zimmet sekmesi, özet
satırı, zaman çizelgesi süzgeci, çalışanın "Zimmetimdekiler" kutusu, belge menüsündeki zimmet tutanağı ve yardım konusu. Çıkış kontrol
listesindeki "Zimmetler iade alındı" adımı İK'nın işi olarak kalır. Her değişiklik paketin içinde tek kez geçen bir metne bağlanır;
uygulanmış pakette eski metin yoksa ve yenisi varsa atlanır, başka durumda yama durur ve hiçbir şey yazılmaz.

Kullanım: python3 istemci/src/moduller/ik/uygulama/yama/ik_zimmet_yamasi.py
"""
import json
import pathlib
import sys

KOK = pathlib.Path(__file__).resolve().parent
PAKET = KOK.parent / 'paket.ts'
ONEK = 'export const IK_PAKETI = '

YARDIM_KONUSU = (
    '{id:"zimmet",cat:"Gelişim",title:"Zimmet ve tutanak",view:"zimmet",keys:"zimmet demirbaş laptop telefon araç tutanak iade",'
    'rel:["isten-cikis"],sum:"Teslim edilen ekipmanı izleyin, tutanağı yazdırın, çıkışta iade alın.",body:"<p>Zimmet sayfasından veya '
    'personel kartından <b>Zimmet ver</b> ile eşya, seri numarası, teslim tarihi ve değeri girilir. <b>İade al</b> bugünün tarihiyle '
    'iadeyi kaydeder.</p><p>Personel kartı &gt; Zimmet &gt; <b>Zimmet tutanağı</b> imza alanlı belgeyi açar; yazdırabilir veya '
    'indirebilirsiniz. Ayrılan çalışanda iade edilmemiş eşya kalırsa panoda kırmızı uyarı çıkar.</p>"},'
)
CALISAN_KUTUSU = (
    '+b("Zimmetimdekiler",r.length?`<ul class="list">${r.map(y=>`<li><span class="grow">${c(y.tur)}<small class="muted" '
    'style="display:block">${c([y.marka,y.seriNo].filter(Boolean).join(", "))}</small></span><span class="muted small">${U(y.verilis)}'
    '</span></li>`).join("")}</ul>`:\'<p class="muted small" style="margin:0">Üzerinizde zimmetli eşya yok.</p>\')'
)

# (eski, yeni, ad)
DEGISIKLIKLER = [
    ('["isealim","İşe alım"],["zimmet","Zimmet"]]]', '["isealim","İşe alım"]]]', 'menü'),
    ('log:tc,zimmet:Od,rapor', 'log:tc,rapor', 'görünüm tablosu'),
    ('pozisyon:"pozisyon-ilan",zimmet:"zimmet",rapor', 'pozisyon:"pozisyon-ilan",rapor', 'sayfa yardımı'),
    (YARDIM_KONUSU, '', 'yardım konusu'),
    ('rel:["kidem-ihbar","zimmet","pozisyon-ilan"]', 'rel:["kidem-ihbar","pozisyon-ilan"]', 'yardım bağı'),
    ('Kimlik, İletişim, İş, Ücret, İzinler, Devam, Belgeler, Zimmet, Performans', 'Kimlik, İletişim, İş, Ücret, İzinler, Devam, Belgeler, Performans', 'yardım sekmeleri'),
    ('"Belgeler","Zimmet","Ayrılış"', '"Belgeler","Ayrılış"', 'yardım çizimi'),
    ('Zimmette eşya veya çıkıştan sonraya düşen izin varsa uyarı verilir.',
     'İdari İşler\'de iade edilmemiş zimmet ya da çıkıştan sonraya düşen izin varsa uyarı verilir.', 'yardım çıkış uyarısı'),
    ('["belge","Özlük belgeleri"],["zimmet","Zimmet"],', '["belge","Özlük belgeleri"],', 'kişi sekmesi'),
    ('\n      ${aa("Zimmetindeki eşyalar",o.length?c(o.map(p=>p.tur).join(", ")):"Yok")}', '', 'kişi özeti'),
    ('["egitim","Eğitim"],["zimmet","Zimmet"],["kayit"', '["egitim","Eğitim"],["kayit"', 'zaman çizelgesi süzgeci'),
    (CALISAN_KUTUSU, '', 'çalışan kutusu'),
    ('\n    <button type="button" data-d="asset"><b>Zimmet tutanağı</b><small>${L("asset").filter(t=>t.empId===a.id&&!t.iade).length} eşya zimmette.</small></button>',
     '', 'belge menüsü'),
]

YORUM_ONCEKI = '// İK puantaj yaması uygulandı (kart #1571): uygulama/yama/ik_puantaj_yamasi.py, NOTLAR.md.\n'
YORUM = '// İK zimmet yaması uygulandı (karar 244 a): uygulama/yama/ik_zimmet_yamasi.py.\n'


def main():
    kaynak = PAKET.read_text(encoding='utf-8')
    i = kaynak.index(ONEK) + len(ONEK)
    bas, govde = kaynak[:i], kaynak[i:].rstrip()
    if not govde.endswith(';'):
        sys.exit('Yama durdu: paket.ts beklenen biçimde değil.')
    p = json.loads(govde[:-1])
    for eski, yeni, ad in DEGISIKLIKLER:
        n = p.count(eski)
        if n == 1:
            p = p.replace(eski, yeni)
        elif n == 0 and YORUM in bas:
            continue
        else:
            sys.exit(f'Yama durdu: "{ad}" çapası {n} kez geçiyor (1 olmalı).')
    if YORUM not in bas:
        if bas.count(YORUM_ONCEKI) != 1:
            sys.exit('Yama durdu: başlık yorumu bulunamadı.')
        bas = bas.replace(YORUM_ONCEKI, YORUM_ONCEKI + YORUM)
    yeni = json.dumps(p, ensure_ascii=False).replace('</script', '<\\/script')
    PAKET.write_text(bas + yeni + ';\n', encoding='utf-8')
    print(f'paket.ts yamalandı ({len(yeni)} karakter).')


if __name__ == '__main__':
    main()
