"""One-time asset authoring. Requires the six studio tools; never run by build."""
import json
import math
import pathlib
import subprocess
import colorsys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TMP = pathlib.Path('/tmp/opencode')
OUT = ROOT / 'public/assets'


def run(tool, *args):
    subprocess.run([tool, *map(str, args)], check=True, stdout=subprocess.DEVNULL, cwd=TMP)


def config(name, **values):
    p = TMP / (name + '.json')
    base = dict(width=128, height=128, duration_ms=800, fps=30,
                sample_rate=22050, channels='stereo', max_duration_ms=1000,
                seed=42, actions=str(TMP / (name + '-ops.json')),
                preview=str(TMP / (name + '.png')), wav=str(OUT / 'audio' / (name + '.wav')),
                mid=str(OUT / 'audio' / (name + '.mid')), system=str(OUT / 'fx' / name / 'system.json'))
    base.update(values)
    p.write_text(json.dumps(base))
    return p


def poly(pixels, points, color):
    for y in range(max(0, math.floor(min(p[1] for p in points))), min(64, math.ceil(max(p[1] for p in points)) + 1)):
        for x in range(64):
            inside = False
            for i, (a, b) in enumerate(points):
                c, d = points[i - 1]
                if (b > y) != (d > y) and x < (c-a)*(y-b)/(d-b)+a:
                    inside = not inside
            if inside:
                pixels[x, y] = color


def line(pixels, a, b, color):
    n = max(abs(b[0]-a[0]), abs(b[1]-a[1]), 1)
    for i in range(n+1):
        x, y = round(a[0]+(b[0]-a[0])*i/n), round(a[1]+(b[1]-a[1])*i/n)
        if 0 <= x < 64 and 0 <= y < 64:
            pixels[x, y] = color


def emit(pixels, path, sheet=False):
    path = OUT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    ops = [dict(op='set_pixel', x=x, y=y, color=c) for (x,y), c in sorted(pixels.items())]
    log = TMP / 'pixels.json'
    log.write_text(json.dumps(ops))
    run('draw-sheet' if sheet else 'draw', 'render', '--actions', log, '--out', path,
        '--width', 64, '--height', 64, '--no-layers')


KINDS = ['ruby', 'amber', 'citrine', 'jade', 'beryl', 'sapphire', 'amethyst', 'prism']
HUES = [0.965, .075, .135, .40, .49, .615, .77, .55]
SHAPES = [([(32,4),(55,27),(51,43),(32,59),(9,43),(9,26)]),
          [(22,6),(43,6),(57,31),(43,56),(21,56),(7,31)],
          [(32,3),(57,48),(32,58),(7,48)],
          [(17,9),(47,9),(55,18),(55,46),(47,55),(17,55),(9,46),(9,18)],
          [(32,3),(50,15),(57,35),(43,55),(21,55),(7,35),(14,15)],
          [(21,6),(43,6),(57,23),(51,46),(32,58),(13,46),(7,23)],
          [(32,3),(51,19),(51,45),(32,59),(13,45),(13,19)],
          [(32,3),(54,18),(54,46),(32,59),(10,46),(10,18)]]


def gem(k, strain=0, turn=0):
    pix = {}
    pts = SHAPES[k]
    if turn:
        pts = [(32+(x-32)*(.78+.22*abs(math.cos(turn))), y) for x,y in pts]
    poly(pix, pts, '#172433ff')
    center = (29,28)
    for i, p in enumerate(pts):
        q = pts[(i+1)%len(pts)]
        h = (HUES[k] + (i*.14+turn*.12 if k == 7 else 0)) % 1
        rgb = colorsys.hsv_to_rgb(h, .65 if k != 7 else .24, [.96,.67,.42,.58,.80,1,.76,.55][i])
        c = '#'+''.join(f'{round(v*255):02x}' for v in rgb)+'ff'
        poly(pix, [center,p,q], c)
    inner = [(center[0]+(x-center[0])*.51, center[1]+(y-center[1])*.51) for x,y in pts]
    rgb = colorsys.hsv_to_rgb(HUES[k], .46 if k != 7 else .12, .94)
    poly(pix, inner, '#'+''.join(f'{round(v*255):02x}' for v in rgb)+'ff')
    for i,p in enumerate(pts):
        q = pts[(i+1)%len(pts)]
        line(pix, tuple(map(round,p)), tuple(map(round,q)), '#e9f5d9ff' if i >= len(pts)-2 else '#243746ff')
    line(pix,(19,17),(28,12),'#ffffffff')
    line(pix,(18,18),(18,24),'#ffffffcc')
    cracks = [[(34,8),(28,25),(35,32),(27,47)],[(12,31),(28,25),(41,38),(51,35)],[(22,52),(27,37),(35,32),(47,16)]]
    for cr in cracks[:strain]:
        for a,b in zip(cr,cr[1:]):
            line(pix,a,b,'#081921ff')
            line(pix,(a[0]+1,a[1]),(b[0]+1,b[1]),'#fff7ceff' if strain == 3 else '#c4e3cfcc')
    if strain == 3:
        for a,b in [((32,2),(32,4)),((58,32),(62,32)),((2,32),(5,32)),((32,60),(32,62))]:
            line(pix,a,b,'#fff3b8ff')
    return pix


def art():
    for k,name in enumerate(KINDS):
        for strain in range(4):
            emit(gem(k,strain), f'gems/{name}-{strain}.png')
        if k < 7:
            original = gem(k,3)
            for f in range(6):
                pixels = {}
                for (x,y),c in original.items():
                    sector = int((math.atan2(y-32,x-32)+math.pi)/(math.pi/3)) % 6
                    angle = sector*math.pi/3-math.pi+math.pi/6
                    dx,dy = round(math.cos(angle)*f*3),round(math.sin(angle)*f*3+f*f*.15)
                    xx,yy=x+dx,y+dy
                    if 0 <= xx < 64 and 0 <= yy < 64:
                        pixels[xx,yy]=c[:7]+f'{max(0,255-f*38):02x}'
                emit(pixels,f'gems/break/{name}/{f}.png',True)
    for strain in range(4):
        for f in range(12):
            emit(gem(7,strain,turn=f*math.pi/6), f'gems/prism-turn/{str(strain)+"/" if strain else ""}{f}.png',True)
    for name in ['brilliant','star']:
        p={}
        if name == 'brilliant':
            pts=[(32,6),(55,32),(32,57),(8,32),(32,6)]
            for a,b in zip(pts,pts[1:]): line(p,a,b,'#fff3bbff')
            for x,y in [(32,7),(55,32),(32,56),(9,32)]:
                line(p,(x-3,y),(x+3,y),'#ffffffff');line(p,(x,y-3),(x,y+3),'#ffffffff')
        else:
            pts=[]
            for i in range(16):
                r=27 if i%2 == 0 else 11
                pts.append((round(32+math.sin(i*math.pi/8)*r),round(32+math.cos(i*math.pi/8)*r)))
            for a,b in zip(pts,pts[1:]+pts[:1]):line(p,a,b,'#fff9dbff')
            poly(p,[(32,22),(35,29),(42,32),(35,35),(32,42),(29,35),(22,32),(29,29)],'#ffffe9ff')
        emit(p,f'gems/{name}.png')
    # Hand-inlaid surround: full-size raster frame, with bevels and corner rivets.
    ops=[]
    def rect(x,y,w,h,c):ops.append(dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c))
    for inset,c in [(0,'#090f18ff'),(2,'#49646aff'),(3,'#162c36ff'),(8,'#29454bff'),(9,'#0c1b25ff'),(15,'#61807bff'),(16,'#101f2aff')]:
        n=608-inset*2
        for x,y,w,h in [(inset,inset,n,1),(inset,inset,1,n),(inset,607-inset,n,1),(607-inset,inset,1,n)]:rect(x,y,w,h,c)
    for x in [7,596]:
        for y in [7,596]:
            rect(x,y,5,5,'#b3b08bff');rect(x+1,y+1,3,3,'#43565aff')
    log=TMP/'frame.json';log.write_text(json.dumps(ops))
    run('draw','render','--actions',log,'--out',OUT/'gems/frame.png','--width',608,'--height',608,'--no-layers')


def audio():
    (OUT/'audio').mkdir(parents=True,exist_ok=True)
    notes={'select':(950,65),'swap':(580,130),'refuse':(105,140),'land':(75,180),'flaw':(170,95),'cut':(1400,440),'levelup':(660,650),'gameover':(330,800)}
    for i in range(8):notes[f'ladder-{i+1}']=(440*2**(i/12*2),380)
    for name,(freq,dur) in notes.items():
        cfg=config(name,max_duration_ms=dur+300)
        run('sfx-synth','--config',cfg,'init')
        run('sfx-synth','--config',cfg,'add-voice','--name','body','--wave','sine','--freq',freq,'--dur',dur,'--gain=-15')
        run('sfx-synth','--config',cfg,'set-envelope','--voice','body','--env','pluck')
        run('sfx-synth','--config',cfg,'add-fm','--voice','body','--modulator',2.76,'--index',.8 if 'ladder' in name or name=='cut' else .2)
        if name in ['levelup','gameover','swap','refuse']:
            run('sfx-synth','--config',cfg,'set-pitch','--voice','body','--slide-to',freq*(2 if name in ['levelup','swap'] else .4),'--over',dur)
        if name in ['land','flaw','refuse']:
            run('sfx-synth','--config',cfg,'add-voice','--name','dust','--wave','noise','--dur',dur*.5,'--gain=-27')
            run('sfx-synth','--config',cfg,'set-envelope','--voice','dust','--env','pluck')
        run('sfx-synth','--config',cfg,'render')
    cfg=config('shatter',sample_pack='combat-core',max_duration_ms=700)
    run('sfx-sample','--config',cfg,'init')
    run('sfx-sample','--config',cfg,'add-sample','--name','debris_glass','--t',0,'--gain=-20','--fade-out',150)
    run('sfx-sample','--config',cfg,'add-sample','--name','snap_transient','--t',0,'--gain=-26')
    run('sfx-sample','--config',cfg,'render')
    for name,tempo in [('title',108),('play',78)]:
        cfg=config(name,instrument_bank='gm-lite',max_duration_ms=26000 if name=='play' else 19000)
        run('music','--config',cfg,'init');run('music','--config',cfg,'set-tempo','--bpm',tempo)
        for tr,ins,gain in [('hook','music_box',-21),('chords','vibraphone',-28),('bass','marimba',-24)]:
            run('music','--config',cfg,'define-track','--name',tr,'--instrument',ins)
            run('music','--config',cfg,'set-track-fx','--track',tr,f'--gain={gain}','--reverb',.22)
        motif=[76,79,83,81,79,74,76,71,74,78,81,79,78,74,71,69]
        for bar,root in enumerate([52,48,55,50,52,48,55,59]):
            t=bar*4
            for off in [0,2]:run('music','--config',cfg,'add-note','--track','bass','--pitch',root-12,'--t',t+off,'--dur',1.5,'--velocity',58)
            for n in [root+12,root+15,root+19]:run('music','--config',cfg,'add-note','--track','chords','--pitch',n,'--t',t,'--dur',3.8,'--velocity',49)
            for j in range(4):
                run('music','--config',cfg,'add-note','--track','hook','--pitch',motif[(bar*4+j)%len(motif)],'--t',t+j+(0 if name=='title' else .25),'--dur',.65,'--velocity',65 if j%2==0 else 48)
        run('music','--config',cfg,'render')


def particles():
    for name,burst,speed,size in [('clear',14,65,3),('flawed',32,115,5),('cut',22,80,4),('aura',0,12,2)]:
        (OUT/'fx'/name).mkdir(parents=True,exist_ok=True)
        cfg=config(name,duration_ms=1200)
        run('particle-2d','--config',cfg,'init')
        run('particle-2d','--config',cfg,'add-emitter','--name','sparks','--shape','disc','--x',0,'--y',0,'--radius',20 if name=='aura' else 5,'--lifetime',700,'--speed',speed,'--cone-angle',180,*(['--rate',9] if name=='aura' else ['--burst',burst]))
        run('particle-2d','--config',cfg,'set-particle','--emitter','sparks','--size-from',size,'--size-to',0,'--opacity-from',.85,'--opacity-to',0,'--color-gradient','#fff4cf@0,#78ddd6@0.5,#326e92@1')
        run('particle-2d','--config',cfg,'set-forces','--gravity',-65 if name!='aura' else 0,'--drag',1.4)
        if name=='aura':run('particle-2d','--config',cfg,'set-timeline','--loop','true')
        run('particle-2d','--config',cfg,'render','--frame',10)


if __name__ == '__main__':
    art(); audio(); particles()
