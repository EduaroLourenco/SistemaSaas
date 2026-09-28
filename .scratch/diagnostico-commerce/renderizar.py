import json, os, math, html, copy
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

root=Path('.scratch/diagnostico-commerce')
report=json.loads((root/'relatorio-conteudo.json').read_text(encoding='utf-8'))
summary=json.loads((root/'resumo.json').read_text(encoding='utf-8'))
out=Path('output/pdf/diagnostico-commerce-2026-09-22.pdf')
pdfmetrics.registerFont(TTFont('Arial','C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold','C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial',boldItalic='Arial-Bold')
teal=colors.HexColor('#0F5C57'); ink=colors.HexColor('#172A32'); muted=colors.HexColor('#526773'); pale=colors.HexColor('#EDF5F4'); line=colors.HexColor('#D7E2E3')
W,H=A4; margin=39; content=W-2*margin
styles={
 'body':ParagraphStyle('body',fontName='Arial',fontSize=9.5,leading=13.3,textColor=ink,spaceAfter=8),
 'title':ParagraphStyle('title',fontName='Arial-Bold',fontSize=23,leading=27,textColor=ink,spaceAfter=14),
 'kicker':ParagraphStyle('kicker',fontName='Arial-Bold',fontSize=8,leading=11,textColor=teal,spaceAfter=7),
 'heading':ParagraphStyle('heading',fontName='Arial-Bold',fontSize=11,leading=14,textColor=teal,spaceBefore=6,spaceAfter=6,keepWithNext=True),
 'cell':ParagraphStyle('cell',fontName='Arial',fontSize=8,leading=10.5,textColor=ink),
 'th':ParagraphStyle('th',fontName='Arial-Bold',fontSize=8,leading=10.5,textColor=colors.white),
 'call':ParagraphStyle('call',fontName='Arial-Bold',fontSize=9.4,leading=13.1,textColor=teal),
 'source':ParagraphStyle('source',fontName='Arial',fontSize=7.5,leading=10,textColor=muted,spaceAfter=5)
}
def escape(t):return html.escape(str(t).replace('—','-').replace('–','-').replace('\u00a0',' '))
def P(t,style='body'):return Paragraph(escape(t),copy.copy(styles[style]))
class MonthlyChart(Flowable):
 def __init__(self):super().__init__();self.width=content;self.height=154
 def draw(self):
  c=self.canv;left=35;top=129;width=content-48;bottom=27
  c.setFont('Arial',7);c.setFillColor(muted);c.drawString(0,142,'Total dos pedidos não cancelados - meses completos (R$ mil)')
  for value in (0,200,400,600):
   y=bottom+value/700*(top-bottom);c.setStrokeColor(line);c.line(left,y,left+width,y);c.setFillColor(muted);c.drawRightString(left-6,y-2,str(value))
  accounts=[a for a in summary['accounts'] if 'Mercado Livre' in a['name']]
  cs=[teal,colors.HexColor('#B8723A')]
  for acc,color in zip(accounts,cs):
   pts=[]
   for i in range(8):
    key=f'2026-{i+1:02d}|'+acc['name'];v=next((x['net'] for x in summary['monthly'] if x['key']==key),0)
    pts.append((left+i*width/7,bottom+v/1000/700*(top-bottom)))
   c.setStrokeColor(color);c.setLineWidth(2);p=c.beginPath();p.moveTo(*pts[0])
   for pt in pts[1:]:p.lineTo(*pt)
   c.drawPath(p);c.setFillColor(color)
   for pt in pts:c.circle(*pt,2.5,fill=1,stroke=0)
  c.setFillColor(muted)
  for i,mo in enumerate(['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago']):c.drawCentredString(left+i*width/7,15,mo)
  for i,(txt,color) in enumerate(zip(['Pronta entrega','Venda a prazo'],cs)):
   c.setFillColor(color);c.rect(left+i*145,0,9,5,fill=1,stroke=0);c.drawString(left+14+i*145,-1,txt)

def footer(c,doc):
 c.saveState();c.setStrokeColor(line);c.line(margin,H-29,W-margin,H-29)
 c.setFont('Arial-Bold',7);c.setFillColor(teal);c.drawString(margin,H-21,'COMMERCE / DIAGNÓSTICO ESTRATÉGICO')
 c.setFont('Arial',7);c.setFillColor(muted);c.drawRightString(W-margin,H-21,'22.09.2026')
 c.line(margin,30,W-margin,30);c.drawString(margin,19,'Uso interno | Base até 20/09 nas comparações recentes | Valores em BRL')
 c.drawRightString(W-margin,19,str(doc.page));c.restoreState()

story=[]
for idx,page in enumerate(report['pages']):
 if idx:story.append(PageBreak())
 if idx==len(report['pages'])-1:
  styles['body'].fontSize=8.8
  styles['body'].leading=11.8
  styles['body'].spaceAfter=6
  styles['title'].fontSize=21
  styles['title'].leading=24
 story.extend([P(page['kicker'],'kicker'),P(page['title'],'title')])
 for block in page['blocks']:
  typ=block['type']
  if typ=='p':story.append(P(block['text']))
  elif typ=='h':story.append(P(block['text'],'heading'))
  elif typ=='source':story.append(Paragraph(f'<link href="{html.escape(block["url"])}" color="#0F5C57">{escape(block["text"])}</link>',styles['source']))
  elif typ=='callout':
   t=Table([[P(block['text'],'call')]],colWidths=[content]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),pale),('BOX',(0,0),(-1,-1),.6,line),('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]));story.extend([t,Spacer(1,10)])
  elif typ=='table':
   rows=[[P(x,'th') for x in block['headers']]]+[[P(x,'cell') for x in row] for row in block['rows']]
   widths=[content*x for x in block.get('widths',[1/len(rows[0])]*len(rows[0]))]
   t=Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT')
   t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),teal),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F8F8')]),('LINEBELOW',(0,0),(-1,-1),.35,line),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
   story.extend([t,Spacer(1,10)])
  elif typ=='chart':story.extend([MonthlyChart(),Spacer(1,13)])

doc=SimpleDocTemplate(str(out),pagesize=A4,rightMargin=margin,leftMargin=margin,topMargin=44,bottomMargin=42,title=report['title'],author='Diagnóstico Commerce',allowSplitting=1)
doc.build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out)
print(json.dumps({'pdf':str(out),'pages':len(reader.pages),'chars_per_page':[len(p.extract_text()) for p in reader.pages]},ensure_ascii=False))
