"""deckkit -- a very small PowerPoint writer built on the standard library.

Only what this project's deck needs: rectangles, rounded panels, text with
per-run styling, monospace code blocks, arrows and bars. No python-pptx, no
other dependency, so the deck regenerates on any machine with Python.

Coordinates are in **points**, not EMU. A 16:9 slide is 960 x 540 pt, which is
a comfortable size to lay out by hand; EMU conversion happens at the boundary.
"""

from __future__ import annotations

import zipfile
from xml.sax.saxutils import escape

PT = 12700              # EMU per point
SLIDE_W = 960.0
SLIDE_H = 540.0


def emu(v: float) -> int:
    return int(round(v * PT))


def esc(t: str) -> str:
    return escape(str(t))


# --------------------------------------------------------------------------
# runs and paragraphs
# --------------------------------------------------------------------------

class Run:
    """One stretch of uniformly styled text."""

    def __init__(self, text, size=11.0, color="000000", bold=False,
                 italic=False, font="Segoe UI", spacing=None, caps=False):
        self.text = text
        self.size = size
        self.color = color
        self.bold = bold
        self.italic = italic
        self.font = font
        self.spacing = spacing      # letter spacing, in points
        self.caps = caps

    def xml(self) -> str:
        attrs = ['lang="en-US"', f'sz="{int(self.size * 100)}"', 'dirty="0"']
        if self.bold:
            attrs.append('b="1"')
        if self.italic:
            attrs.append('i="1"')
        if self.spacing is not None:
            attrs.append(f'spc="{int(self.spacing * 100)}"')
        if self.caps:
            attrs.append('cap="all"')
        # A space-only run still needs to occupy width, so preserve it.
        return (
            f'<a:r><a:rPr {" ".join(attrs)}>'
            f'<a:solidFill><a:srgbClr val="{self.color}"/></a:solidFill>'
            f'<a:latin typeface="{esc(self.font)}"/>'
            f'<a:cs typeface="{esc(self.font)}"/>'
            f'</a:rPr><a:t>{esc(self.text)}</a:t></a:r>'
        )


class Para:
    """One paragraph: a list of runs plus its own spacing and alignment."""

    def __init__(self, runs=None, align="l", line=None, before=0.0, after=0.0,
                 bullet=None, indent=0.0):
        if runs is None:
            runs = []
        elif isinstance(runs, Run):
            runs = [runs]
        self.runs = runs
        self.align = align
        self.line = line            # exact line height in points
        self.before = before
        self.after = after
        self.bullet = bullet        # a character, or None
        self.indent = indent        # left indent in points

    def xml(self) -> str:
        pr = [f'algn="{self.align}"']
        if self.indent:
            pr.append(f'marL="{emu(self.indent)}" indent="{emu(-self.indent)}"')
        body = ""
        if self.line:
            body += f'<a:lnSpc><a:spcPts val="{int(self.line * 100)}"/></a:lnSpc>'
        if self.before:
            body += f'<a:spcBef><a:spcPts val="{int(self.before * 100)}"/></a:spcBef>'
        if self.after:
            body += f'<a:spcAft><a:spcPts val="{int(self.after * 100)}"/></a:spcAft>'
        if self.bullet:
            first = self.runs[0] if self.runs else Run("")
            body += (f'<a:buClr><a:srgbClr val="{first.color}"/></a:buClr>'
                     f'<a:buFont typeface="Arial"/>'
                     f'<a:buChar char="{esc(self.bullet)}"/>')
        else:
            body += '<a:buNone/>'
        runs = "".join(r.xml() for r in self.runs) or '<a:endParaRPr lang="en-US"/>'
        return f'<a:p><a:pPr {" ".join(pr)}>{body}</a:pPr>{runs}</a:p>'


# --------------------------------------------------------------------------
# the slide
# --------------------------------------------------------------------------

class Slide:
    def __init__(self):
        self._shapes = []
        self._id = 1
        self.boxes = []          # (x, y, w, h, name) for the layout check

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    # -- primitives --------------------------------------------------------

    def shape(self, x, y, w, h, *, paras=None, fill=None, line=None,
              line_w=1.0, geom="rect", radius=None, pad=(8, 6, 8, 6),
              anchor="t", name="shape", rot=None, wrap=True):
        """One shape: optional fill, optional outline, optional text."""
        sid = self._next_id()
        self.boxes.append((x, y, w, h, name))

        sp = [f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{esc(name)}{sid}"/>'
              f'<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>']

        xfrm = f'<a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/>'
        rot_attr = f' rot="{int(rot * 60000)}"' if rot else ""
        sp.append(f'<a:xfrm{rot_attr}>{xfrm}</a:xfrm>')

        if geom == "roundRect":
            adj = radius if radius is not None else 6000
            sp.append(f'<a:prstGeom prst="roundRect"><a:avLst>'
                      f'<a:gd name="adj" fmla="val {int(adj)}"/></a:avLst></a:prstGeom>')
        else:
            sp.append(f'<a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>')

        if fill:
            sp.append(f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>')
        else:
            sp.append('<a:noFill/>')

        if line:
            sp.append(f'<a:ln w="{emu(line_w)}"><a:solidFill>'
                      f'<a:srgbClr val="{line}"/></a:solidFill></a:ln>')
        else:
            sp.append('<a:ln><a:noFill/></a:ln>')

        sp.append('</p:spPr><p:txBody>')
        pl, pt, pr, pb = pad
        sp.append(f'<a:bodyPr wrap="{"square" if wrap else "none"}" '
                  f'lIns="{emu(pl)}" tIns="{emu(pt)}" rIns="{emu(pr)}" bIns="{emu(pb)}" '
                  f'anchor="{anchor}"><a:noAutofit/></a:bodyPr><a:lstStyle/>')
        if paras:
            sp.append("".join(p.xml() for p in paras))
        else:
            sp.append('<a:p><a:endParaRPr lang="en-US"/></a:p>')
        sp.append('</p:txBody></p:sp>')

        self._shapes.append("".join(sp))

    # -- conveniences ------------------------------------------------------

    def rect(self, x, y, w, h, fill=None, line=None, line_w=1.0, **kw):
        self.shape(x, y, w, h, fill=fill, line=line, line_w=line_w, **kw)

    def panel(self, x, y, w, h, fill="FFFFFF", line=None, line_w=1.0, radius=3500):
        self.shape(x, y, w, h, fill=fill, line=line, line_w=line_w,
                   geom="roundRect", radius=radius, name="panel")

    def text(self, x, y, w, h, paras, **kw):
        self.shape(x, y, w, h, paras=paras, name="text", **kw)

    def line_h(self, x, y, w, color, thickness=1.0):
        """A hairline rule. Drawn as a filled rectangle so thickness is exact."""
        self.shape(x, y, w, thickness, fill=color, name="rule")

    def arrow(self, x, y, w, h, fill, direction="right"):
        geom = {"right": "rightArrow", "down": "downArrow",
                "left": "leftArrow", "up": "upArrow"}[direction]
        self.shape(x, y, w, h, fill=fill, geom=geom, name="arrow")

    def check(self, content_bottom=478.0, chrome_top=486.0,
              left=0.0, right=SLIDE_W, bottom=SLIDE_H):
        """Report shapes that leave the slide or intrude on the takeaway band.

        Layout here is hand-computed arithmetic, which is exactly the kind of
        thing that drifts silently when a panel gains a line. Catching it
        mechanically is cheaper than catching it in the rendered deck.
        """
        bad = []
        for (x, y, w, h, name) in self.boxes:
            if x < left - 0.5 or x + w > right + 0.5:
                bad.append(f"{name}: x {x:.0f}..{x + w:.0f} leaves the slide")
            elif y + h > bottom + 0.5:
                bad.append(f"{name}: y {y:.0f}..{y + h:.0f} leaves the slide")
            elif y < chrome_top and y + h > content_bottom + 0.5:
                bad.append(f"{name}: y {y:.0f}..{y + h:.0f} runs past the "
                           f"content limit ({content_bottom:.0f})")
        return bad

    def xml(self) -> str:
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            '<p:cSld><p:spTree>'
            '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
            '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
            '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
            + "".join(self._shapes) +
            '</p:spTree></p:cSld>'
            '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
        )


# --------------------------------------------------------------------------
# packaging
# --------------------------------------------------------------------------

_NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

_THEME = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="{_NS_A}" name="MatrixLang">
<a:themeElements>
<a:clrScheme name="MatrixLang">
<a:dk1><a:srgbClr val="14261F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="3F4F49"/></a:dk2><a:lt2><a:srgbClr val="FAF7F2"/></a:lt2>
<a:accent1><a:srgbClr val="0E7C6B"/></a:accent1><a:accent2><a:srgbClr val="B4690E"/></a:accent2>
<a:accent3><a:srgbClr val="9E2B3F"/></a:accent3><a:accent4><a:srgbClr val="7C8B85"/></a:accent4>
<a:accent5><a:srgbClr val="E3DDD2"/></a:accent5><a:accent6><a:srgbClr val="16221E"/></a:accent6>
<a:hlink><a:srgbClr val="0E7C6B"/></a:hlink><a:folHlink><a:srgbClr val="7C8B85"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="MatrixLang">
<a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
<a:fmtScheme name="MatrixLang">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'''


def _master(bg: str) -> str:
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="{_NS_A}" xmlns:r="{_NS_R}" xmlns:p="{_NS_P}">
<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg}"/></a:solidFill>
<a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2"
 accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6"
 hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>'''


def _layout(bg: str) -> str:
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="{_NS_A}" xmlns:r="{_NS_R}" xmlns:p="{_NS_P}" type="blank" preserve="1">
<p:cSld name="Blank"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg}"/></a:solidFill>
<a:effectLst/></p:bgPr></p:bg>
<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'''


def write(path: str, slides, title: str, author: str, bg: str = "FAF7F2") -> None:
    n = len(slides)
    z = zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED)

    slide_over = "".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.'
        f'openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, n + 1))

    z.writestr("[Content_Types].xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
        '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>'
        '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        + slide_over + '</Types>')

    z.writestr("_rels/.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{_NS_R}/officeDocument" Target="ppt/presentation.xml"/>'
        f'<Relationship Id="rId2" Type="{_NS_R}/metadata/core-properties" Target="docProps/core.xml"/>'
        f'<Relationship Id="rId3" Type="{_NS_R}/extended-properties" Target="docProps/app.xml"/>'
        '</Relationships>')

    sld_ids = "".join(f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, n + 1))
    z.writestr("ppt/presentation.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<p:presentation xmlns:a="{_NS_A}" xmlns:r="{_NS_R}" xmlns:p="{_NS_P}" saveSubsetFonts="1">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f'<p:sldIdLst>{sld_ids}</p:sldIdLst>'
        f'<p:sldSz cx="{emu(SLIDE_W)}" cy="{emu(SLIDE_H)}"/>'
        f'<p:notesSz cx="{emu(SLIDE_H)}" cy="{emu(SLIDE_W)}"/>'
        '</p:presentation>')

    rels = [f'<Relationship Id="rId1" Type="{_NS_R}/slideMaster" Target="slideMasters/slideMaster1.xml"/>']
    rels += [f'<Relationship Id="rId{i + 1}" Type="{_NS_R}/slide" Target="slides/slide{i}.xml"/>'
             for i in range(1, n + 1)]
    rels += [
        f'<Relationship Id="rId{n + 2}" Type="{_NS_R}/presProps" Target="presProps.xml"/>',
        f'<Relationship Id="rId{n + 3}" Type="{_NS_R}/viewProps" Target="viewProps.xml"/>',
        f'<Relationship Id="rId{n + 4}" Type="{_NS_R}/theme" Target="theme/theme1.xml"/>',
        f'<Relationship Id="rId{n + 5}" Type="{_NS_R}/tableStyles" Target="tableStyles.xml"/>',
    ]
    z.writestr("ppt/_rels/presentation.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(rels) + '</Relationships>')

    z.writestr("ppt/slideMasters/slideMaster1.xml", _master(bg))
    z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{_NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        f'<Relationship Id="rId2" Type="{_NS_R}/theme" Target="../theme/theme1.xml"/>'
        '</Relationships>')

    z.writestr("ppt/slideLayouts/slideLayout1.xml", _layout(bg))
    z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{_NS_R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        '</Relationships>')

    z.writestr("ppt/theme/theme1.xml", _THEME)

    for i, s in enumerate(slides, 1):
        z.writestr(f"ppt/slides/slide{i}.xml", s.xml())
        z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{_NS_R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
            '</Relationships>')

    z.writestr("ppt/presProps.xml",
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<p:presentationPr xmlns:a="{_NS_A}" xmlns:r="{_NS_R}" xmlns:p="{_NS_P}"/>')
    z.writestr("ppt/viewProps.xml",
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<p:viewPr xmlns:a="{_NS_A}" xmlns:r="{_NS_R}" xmlns:p="{_NS_P}"/>')
    z.writestr("ppt/tableStyles.xml",
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<a:tblStyleLst xmlns:a="{_NS_A}" def="{{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}}"/>')

    z.writestr("docProps/core.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f'<dc:title>{esc(title)}</dc:title><dc:creator>{esc(author)}</dc:creator>'
        f'<cp:lastModifiedBy>{esc(author)}</cp:lastModifiedBy></cp:coreProperties>')

    z.writestr("docProps/app.xml",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        f'<Application>Microsoft Office PowerPoint</Application><Slides>{n}</Slides>'
        f'<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>{esc(title)}</vt:lpstr>'
        '</vt:vector></TitlesOfParts></Properties>')

    z.close()
