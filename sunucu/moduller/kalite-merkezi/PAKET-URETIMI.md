# Paket üretimi (kalite-merkezi)

`istemci/src/moduller/kalite-merkezi/uygulama/paket.ts`, `ocr.ts` ve `ocr-cekirdek.ts` bu betikle KaliteMerkezi.html içinden üretilir. Yeni bir KaliteMerkezi.html geldiğinde:
`python3 -I km_paket_uret.py KaliteMerkezi.html istemci/src/moduller/kalite-merkezi/uygulama`; sonra `sayfa.test.ts` paketin beklenen yerlerini (sunucu kipi koşulu, kitaplık işaretleri, boş örnek veri) denetler.

```python
import re, sys, json, hashlib, os
html_yolu, hedef = sys.argv[1], sys.argv[2]
ham = open(html_yolu, 'rb').read()
ozet = hashlib.sha256(ham).hexdigest()
s = ham.decode('utf-8')
OCR = ['lib-tess', 'lib-tessworker', 'lib-tesscore', 'lib-tesslang']
ocr = {}
def kitaplik(m):
    k = m.group(1)
    if k in OCR: ocr[k] = m.group(2)
    return '<!--km-kitaplik:%s-->' % k
s, n = re.subn(r'<script type="text/x-lib" id="([^"]+)">(.*?)</script>', kitaplik, s, flags=re.S)
assert n == 10, n
# İlk düz betik Chart.js 4.4.1'dir (paketteki chart.umd.js ile bayt bayt aynı).
m = re.search(r'<script>(/\*!\n \* Chart\.js v4\.4\.1.*?)</script>', s, flags=re.S)
assert m
s = s[:m.start()] + '<!--km-grafik-->' + s[m.end():]
assert s.count('<script>') == 1, s.count('<script>')
# Uygulamanın örnek verisi (firma, parça, kişi, proje adları) depoya girmez (kullanıcı kararı 12.10.2026): boş nesneye çevrilir.
i = s.index('const DEMO={'); j = s.index('\n', i)
assert s.count('const DEMO=') == 1 and s[j-2:j] == '};'
s = s[:i] + 'const DEMO={};' + s[j:]
ust = ('// Üretilmiş dosya: Kalite Merkezi (yerel sürüm) KaliteMerkezi.html, %d bayt, sha256 %s.\n'
       '// Gömülü kitaplıklar çıkarılıp yerlerine işaret kondu (km-kitaplik, km-grafik); sayfa çerçevede kurulurken doldurulur.\n'
       '// Örnek veri (DEMO) boşaltıldı: gerçek olabilecek adlar depoya girmez (kullanıcı kararı 12.10.2026).\n'
       '// Elle değiştirilmez; yeniden üretme NOTLAR.md\'de.\n') % (len(ham), ozet)
open(os.path.join(hedef, 'paket.ts'), 'w', encoding='utf-8').write(ust + 'export const KM_PAKETI = ' + json.dumps(s, ensure_ascii=False) + ';\n')
ocr_ust = ('// Üretilmiş dosya: Kalite Merkezi\'nin internetsiz yazı tanıma kitaplıkları (tesseract.js 5.1.1, çekirdek ve İngilizce dil verisi),\n'
           '// KaliteMerkezi.html (sha256 %s) içinden olduğu gibi. Kullanıcı onayıyla (12.10.2026) uygulamadan alındığı gibi.\n'
           '// Elle değiştirilmez. Teslim aracının dosya sınırı (5 MB) için iki dosyadır: ocr.ts ve ocr-cekirdek.ts.\n') % ozet
def yaz(ad, ad_sabit, anahtarlar):
    open(os.path.join(hedef, ad), 'w', encoding='utf-8').write(ocr_ust + 'export const %s = {\n' % ad_sabit +
        ''.join('  %s: %s,\n' % (json.dumps(k), json.dumps(ocr[k], ensure_ascii=False)) for k in anahtarlar) + '} as const;\n')
yaz('ocr.ts', 'KM_OCR_KITAPLIKLARI', ['lib-tess', 'lib-tessworker', 'lib-tesslang'])
yaz('ocr-cekirdek.ts', 'KM_OCR_CEKIRDEGI', ['lib-tesscore'])
print(len(s), sum(len(v) for v in ocr.values()), ozet)
```
