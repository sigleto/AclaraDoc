param(
  [Parameter(Mandatory=$true)][string]$Source,
  [string]$OutputDirectory = 'assets/branding/icons'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
public static class BrandIcons {
  static readonly Color Blue = Color.FromArgb(255,9,43,96);
  static Bitmap Canvas(int size, Color color) {
    var b=new Bitmap(size,size,PixelFormat.Format32bppArgb);
    using(var g=Graphics.FromImage(b)) g.Clear(color);
    return b;
  }
  static Graphics Quality(Bitmap b) {
    var g=Graphics.FromImage(b);
    g.InterpolationMode=InterpolationMode.HighQualityBicubic;
    g.PixelOffsetMode=PixelOffsetMode.HighQuality;
    g.SmoothingMode=SmoothingMode.AntiAlias;
    return g;
  }
  static Rectangle Bounds(Bitmap b) {
    int x0=b.Width,y0=b.Height,x1=0,y1=0;
    for(int y=0;y<b.Height;y++) for(int x=0;x<b.Width;x++) if(b.GetPixel(x,y).A>8) {
      x0=Math.Min(x0,x);y0=Math.Min(y0,y);x1=Math.Max(x1,x);y1=Math.Max(y1,y);
    }
    if(x0>=x1 || y0>=y1) throw new Exception("Empty foreground");
    return Rectangle.FromLTRB(x0,y0,x1+1,y1+1);
  }
  static Bitmap Clean(Bitmap source) {
    int w=source.Width,h=source.Height;var seen=new bool[w*h];var result=new Bitmap(w,h,PixelFormat.Format32bppArgb);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
      int start=y*w+x;if(seen[start])continue;seen[start]=true;var color=source.GetPixel(x,y);
      if(color.A<8||Math.Max(color.R,Math.Max(color.G,color.B))<90)continue;
      var region=new List<int>();var queue=new Queue<int>();queue.Enqueue(start);
      while(queue.Count>0){int p=queue.Dequeue();region.Add(p);int px=p%w,py=p/w;
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=px+dx,ny=py+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;int n=ny*w+nx;if(seen[n])continue;seen[n]=true;var c=source.GetPixel(nx,ny);if(c.A>=8&&Math.Max(c.R,Math.Max(c.G,c.B))>=90)queue.Enqueue(n);}
      }
      // Remove disconnected extraction dust, retaining document/check and sparkle.
      if(region.Count>=500)foreach(int p in region)result.SetPixel(p%w,p/w,source.GetPixel(p%w,p/w));
    }
    return result;
  }
  static Bitmap Fit(Bitmap src, double radius) {
    var box=Bounds(src); double cx=box.X+box.Width/2.0,cy=box.Y+box.Height/2.0,max=0;
    for(int y=box.Top;y<box.Bottom;y++) for(int x=box.Left;x<box.Right;x++) if(src.GetPixel(x,y).A>8)
      max=Math.Max(max,Math.Sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy)));
    double scale=radius/max;
    var b=Canvas(1024,Color.Transparent);
    using(var g=Quality(b)) g.DrawImage(src,new RectangleF((float)(512-box.Width*scale/2),(float)(512-box.Height*scale/2),(float)(box.Width*scale),(float)(box.Height*scale)),box,GraphicsUnit.Pixel);
    return b;
  }
  static Bitmap Composite(Bitmap foreground) {
    var b=Canvas(1024,Blue);using(var g=Quality(b))g.DrawImageUnscaled(foreground,0,0);return b;
  }
  static Bitmap Mono(Bitmap src) {
    int n=src.Width; var paper=new bool[n,n];
    for(int y=0;y<n;y++)for(int x=0;x<n;x++){var c=src.GetPixel(x,y);paper[x,y]=c.A>128 && Math.Min(c.R,Math.Min(c.G,c.B))>225;}
    var result=Canvas(n,Color.Transparent);
    for(int y=0;y<n;y++)for(int x=0;x<n;x++){
      var c=src.GetPixel(x,y); if(c.A==0)continue;
      bool ink=!paper[x,y];
      if(!ink)for(int d=1;d<=7;d++)if(x-d<0||x+d>=n||y-d<0||y+d>=n||!paper[x-d,y]||!paper[x+d,y]||!paper[x,y-d]||!paper[x,y+d]){ink=true;break;}
      if(ink)result.SetPixel(x,y,Color.FromArgb(c.A,255,255,255));
    }
    return result;
  }
  static bool InMask(double x,double y,int kind) {
    x=Math.Abs(x);y=Math.Abs(y);
    if(kind==0)return x*x+y*y<=1;
    if(kind==2)return Math.Pow(x,4)+Math.Pow(y,4)<=1;
    double r=.36,a=Math.Max(0,x-(1-r)),b=Math.Max(0,y-(1-r));
    return x<=1&&y<=1&&a*a+b*b<=r*r;
  }
  static Bitmap Masked(Bitmap fg,int kind,out int clipped) {
    var result=Canvas(1024,Color.White);clipped=0;
    for(int y=0;y<1024;y++)for(int x=0;x<1024;x++){
      // Android's 72 dp visible viewport within the 108 dp asset.
      double dx=(x+.5-512)/(1024.0/3),dy=(y+.5-512)/(1024.0/3);
      bool inside=InMask(dx,dy,kind);var c=fg.GetPixel(x,y);
      if(!inside&&c.A>0)clipped++;
      if(inside){int a=c.A;result.SetPixel(x,y,Color.FromArgb(255,(c.R*a+Blue.R*(255-a))/255,(c.G*a+Blue.G*(255-a))/255,(c.B*a+Blue.B*(255-a))/255));}
    }
    return result;
  }
  static string Inspect(string path) {
    using(var b=new Bitmap(path)){
      int transparent=0,min=255;double radius=0;
      for(int y=0;y<b.Height;y++)for(int x=0;x<b.Width;x++){int a=b.GetPixel(x,y).A;if(a<255)transparent++;min=Math.Min(min,a);if(a>0)radius=Math.Max(radius,Math.Sqrt(Math.Pow(x+.5-b.Width/2.0,2)+Math.Pow(y+.5-b.Height/2.0,2)));}
      byte[] h=File.ReadAllBytes(path);
      if(h[0]!=137||h[1]!=80||h[2]!=78||h[3]!=71||h[24]!=8||h[25]!=6)throw new Exception("Expected 32-bit RGBA PNG: "+path);
      return String.Format("{0}: {1}x{2}; PNG RGBA 8-bit/channel (32-bit); {3} bytes; pixels alpha<255={4}; min alpha={5}; max visible radius={6:F2}",Path.GetFileName(path),b.Width,b.Height,h.Length,transparent,min,radius);
    }
  }
  public static void Run(string source,string directory) {
    Directory.CreateDirectory(directory);
    using(var original=new Bitmap(source))using(var src=Clean(original)){
      if(src.GetPixel(0,0).A!=0)throw new Exception("Source must have real alpha transparency");
      using(var fg=Fit(src,300))using(var mark=Fit(src,430))using(var master=Composite(mark))using(var background=Canvas(1024,Blue))using(var mono=Mono(fg))using(var play=Canvas(512,Blue)){
        fg.Save(Path.Combine(directory,"android-foreground.png"),ImageFormat.Png);
        mono.Save(Path.Combine(directory,"android-monochrome.png"),ImageFormat.Png);
        background.Save(Path.Combine(directory,"android-background.png"),ImageFormat.Png);
        master.Save(Path.Combine(directory,"app-icon-1024.png"),ImageFormat.Png);
        using(var g=Quality(play))g.DrawImage(master,0,0,512,512);
        play.Save(Path.Combine(directory,"play-store-512.png"),ImageFormat.Png);
        var lines=new List<string>();lines.Add("Background: #092B60 (dominant blue sampled from the reference). Safe radius: 66/108*1024/2 = 312.89 px.");
        for(int k=0;k<3;k++){
          int clipped=0;for(int y=0;y<1024;y++)for(int x=0;x<1024;x++)if(mark.GetPixel(x,y).A>0&&!InMask((x+.5-512)/512,(y+.5-512)/512,k))clipped++;
          if(clipped>0)throw new Exception("Master artwork clipped");lines.Add("Master mask "+k+": 0 artwork pixels clipped (full canvas).");
        }
        foreach(var name in new[]{"app-icon-1024.png","android-foreground.png","android-background.png","android-monochrome.png","play-store-512.png"})lines.Add(Inspect(Path.Combine(directory,name)));
        if(new FileInfo(Path.Combine(directory,"play-store-512.png")).Length>=1000000)throw new Exception("Play icon exceeds 1 MB");
        using(var preview=new Bitmap(1200,860,PixelFormat.Format32bppArgb))using(var g=Quality(preview))using(var font=new Font("Arial",16)){
          g.Clear(Color.FromArgb(255,242,245,249));
          g.DrawString("Master / Expo",font,Brushes.Black,35,20);g.DrawImage(master,35,60,320,320);
          g.DrawString("Adaptive foreground",font,Brushes.Black,435,20);
          for(int y=0;y<320;y+=16)for(int x=0;x<320;x+=16)g.FillRectangle((x/16+y/16)%2==0?Brushes.White:Brushes.LightGray,435+x,60+y,16,16);
          g.DrawImage(fg,435,60,320,320);
          g.DrawString("Play Console / 512 px",font,Brushes.Black,835,20);g.DrawImage(play,835,60,320,320);
          string[] labels={"Circle","Rounded square","Squircle"};
          for(int k=0;k<3;k++){int clipped;using(var masked=Masked(fg,k,out clipped)){if(clipped!=0)throw new Exception("Foreground clipped by "+labels[k]);lines.Add(labels[k]+": 0 foreground pixels clipped (72/108 viewport).");g.DrawString(labels[k],font,Brushes.Black,30+k*300,425);g.DrawImage(masked,new RectangleF(30+k*300,470,250,250),new RectangleF(1024f/6,1024f/6,1024f*2/3,1024f*2/3),GraphicsUnit.Pixel);}}
          int monoClipped;using(var masked=Masked(mono,0,out monoClipped)){if(monoClipped!=0)throw new Exception("Monochrome clipped");g.DrawString("Monochrome",font,Brushes.Black,930,425);g.DrawImage(masked,new RectangleF(930,470,250,250),new RectangleF(1024f/6,1024f/6,1024f*2/3,1024f*2/3),GraphicsUnit.Pixel);}
          g.DrawString("Android previews use the cropped 72/108 viewport. Important artwork stays inside the 66/108 safe circle.",new Font("Arial",13),Brushes.Black,30,790);
          preview.Save(Path.Combine(directory,"preview-masks.png"),ImageFormat.Png);
        }
        File.WriteAllLines(Path.Combine(directory,"validation.txt"),lines);Console.WriteLine(String.Join(Environment.NewLine,lines));
      }
    }
  }
}
'@
$resolvedSource = (Resolve-Path -LiteralPath $Source).Path
$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
[BrandIcons]::Run($resolvedSource, $resolvedOutput)
