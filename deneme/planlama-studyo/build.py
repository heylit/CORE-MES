import re,json,base64,os
M=os.path.dirname(os.path.abspath(__file__))+'/'
V2=M+'motor/'
K=os.path.normpath(M+'../../')+'/'
R=K+'istemci/src/ortak/'
VS=M+'veri/'
tok=open(R+'tasarim/tokens.css').read()
light=''.join(re.findall(r'\[data-theme="light"\]\s*\{([^}]*)\}',tok))
tok+='\n@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {'+light+'} }\n'
fonts=open(R+'tasarim/fonts.css').read()
def furl(m):
    f=m.group(1).split('/')[-1];return "url('data:font/woff2;base64,"+base64.b64encode(open(R+'tasarim/fonts/'+f,'rb').read()).decode()+"')"
fonts=re.sub(r"url\('([^']+)'\)",furl,fonts)
css=[fonts,tok,open(R+'tasarim/temel.css').read()]
for f in ['kabuk','ikinci-menu','dugme','kart','rozet','alan','sekmeler','tablo','sayi-karti','pencere','bildirim','simge']:
    css.append(open(R+'arayuz/'+f+'.css').read())
# Dış kütüphaneler depoya girmez (karar 401 c); lib/ klasörü elle konursa gömülür, yoksa sürükleme ve tur kapalı derlenir
LIBV=os.path.exists(M+'lib/driver.js')
if LIBV: css.append('/* driver.js 1.10.1, MIT */\n'+open(M+'lib/driver.css').read())
else: print('uyari: lib/ yok, surukleme ve tur kapali')
css.append(open(M+'modul.css').read())
ts=open(R+'tasarim/simgeler.ts').read()
ic=dict(re.findall(r'^  "([a-z0-9-]+)": "([^"]+)"',ts,re.M))
dol=re.search(r'DOLGULU[^\[]*\[([^\]]*)\]',ts).group(1)
dol=re.findall(r'"([^"]+)"',dol)
veri={k:json.load(open(VS+k+'.json')) for k in ['kucuk','orta','darbogaz','buyuk','montaj10']}
motor=open(V2+'engine.js').read()+'\n'+open(V2+'kisitlar.js').read()
# HiGHS depoya ikili olarak konmaz; onaylı highs paketi kuruluysa node_modules'tan gömülür, yoksa sayfadaki HiGHS seçeneği hata verir
HB=K+'node_modules/highs/build/'
mip=open(V2+'mip.js').read()
if os.path.exists(HB+'highs.wasm'):
    hj=open(HB+'highs.js').read(); hw=base64.b64encode(open(HB+'highs.wasm','rb').read()).decode()
else:
    hj="throw new Error('HiGHS kurulu degil: npm install sonrasi yeniden derleyin');"; hw=''
    print('uyari: node_modules/highs yok, HiGHS gomulmedi')
for s in [mip,hj]: assert '</script' not in s
for s in [motor]: assert '</script' not in s
import re as _re
LIB=[('driver.js 1.10.1, MIT','driver.js'),('@floating-ui/core 1.8.0, MIT','fu-core.js'),('@floating-ui/dom 1.8.0, MIT','fu-dom.js'),('interact.js 1.10.28, MIT','interact.min.js'),('SortableJS 1.15.7, MIT','sortable.min.js')]
libjs='' if not LIBV else ''.join('<script>\n/* '+ad+' (gömülü, ağdan yüklenmez) */\n'+_re.sub(r'//# sourceMappingURL=\S+','',open(M+'lib/'+f).read())+'\n</script>\n' for ad,f in LIB)
assert '</script' not in libjs.replace('</script>\n','')
app=open(M+'cikti/app.js').read()
rr=open(M+'rr/recete-rota-motoru.html').read().replace('<head>','<head>\n<script>try{window.tmiGorunum=parent.RR_KOPRU?parent.RR_KOPRU.gorunum():undefined;}catch(e){}</script>',1)
rr=re.sub(r'<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\n?','',rr)
rr=rr.replace('</head>','<style>\n'+fonts+'\n'+tok+'\n'+open(M+'rr-tema.css').read()+'\n</style>\n</head>',1)
rrj=json.dumps(rr,ensure_ascii=False).replace('</','<\\/')
html=('<title>Planlama Modülü</title>\n<style>\n'+'\n'.join(css)+'\n</style>\n'
 '<div id="kok"></div><div id="katman"></div><div class="tc-bildirimler" id="bildirimler" aria-live="polite"></div>\n'
 '<script id="motor">\n'+motor+'\n</script>\n<script>\n'+mip+'\n</script>\n<script type="text/plain" id="highs-js">'+hj+'</script>\n<script type="text/plain" id="highs-wasm">'+hw+'</script>\n<script>\nconst CP_ONERI={};\nconst VERI='+json.dumps(veri,ensure_ascii=False)+';\nconst IC='+json.dumps(ic)+';\nconst RR_HTML='+rrj+';\nconst DOLGU=new Set('+json.dumps(dol)+');\n</script>\n<script>\n'+app+'\n</script>\n')
html=html.replace('<script id="motor">',libjs+'<script id="motor">',1)
open(M+'cikti/planlama-modulu.html','w').write(html)
print(len(html),len(ic))
