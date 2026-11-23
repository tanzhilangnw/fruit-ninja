package com.fruitdojo.game;
import android.app.*;
import android.os.Bundle;
import android.webkit.*;
import android.content.SharedPreferences;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

public class MainActivity extends Activity {
 private WebView game;
 private final AtomicBoolean updating=new AtomicBoolean(false);
 private static final String BASE="https://tanzhilangnw.github.io/fruit-ninja/";
 private SharedPreferences preferences;
 private File active;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  preferences=getSharedPreferences("updates",MODE_PRIVATE);
  String version=preferences.getString("active","");
  active=version.isEmpty()?null:new File(getFilesDir(),"bundles/"+version);
  if(active!=null&&!new File(active,"index.html").isFile()) active=null;
  game=new WebView(this);setContentView(game);
  game.getSettings().setJavaScriptEnabled(true);
  game.getSettings().setDomStorageEnabled(true);
  game.getSettings().setAllowFileAccess(true);
  game.getSettings().setAllowContentAccess(false);
  game.getSettings().setBlockNetworkLoads(true);
  game.addJavascriptInterface(new Object(){
   @JavascriptInterface public void checkUpdates(){runOnUiThread(()->showUpdate());}
  },"DojoApp");
  game.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
    String prefix="https://appassets.androidplatform.net/assets/";
    if(!request.getUrl().toString().startsWith(prefix)) return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
    String name=request.getUrl().getPath().replaceFirst("^/assets/","");
    if(!name.matches("[a-zA-Z0-9_.-]+")) return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
    try {
     InputStream stream=active==null?getAssets().open(name):new FileInputStream(new File(active,name));
     String mime=name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":name.endsWith(".png")?"image/png":"text/html";
     return new WebResourceResponse(mime,"UTF-8",stream);
    }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
   }
  });
  game.loadUrl("https://appassets.androidplatform.net/assets/index.html");
 }
 private void showUpdate(){
  new AlertDialog.Builder(this).setTitle("资源更新").setMessage("当前资源："+preferences.getString("active","内置 1.2")+"\n下载成功后可重启生效，离线仍可继续玩。").setPositiveButton("检查并下载",(d,w)->check())
  .setNeutralButton("恢复内置",(d,w)->{preferences.edit().remove("active").apply();active=null;game.reload();}).setNegativeButton("取消",null).show();
 }
 private byte[] download(String path,int limit)throws Exception{
  URL url=new URL(BASE+path);
  HttpURLConnection c=(HttpURLConnection)url.openConnection();
  c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setInstanceFollowRedirects(false);c.setRequestProperty("Cache-Control","no-cache");
  try{
   if(c.getResponseCode()!=200)throw new IOException("HTTP "+c.getResponseCode());
   try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
    byte[] b=new byte[16384];int n,total=0;
    while((n=in.read(b))!=-1){total+=n;if(total>limit)throw new IOException("文件过大");out.write(b,0,n);}return out.toByteArray();
   }
  }finally{c.disconnect();}
 }
 private void message(String text){runOnUiThread(()->new AlertDialog.Builder(this).setMessage(text).setPositiveButton("知道了",null).show());}
 private void check(){
  if(!updating.compareAndSet(false,true))return;
  android.widget.Toast.makeText(this,"正在检查更新…",android.widget.Toast.LENGTH_SHORT).show();
  new Thread(()->{File stage=null;try{
   JSONObject manifest=new JSONObject(new String(download("update.json?t="+System.currentTimeMillis(),65536),"UTF-8"));
   if(manifest.getInt("minShell")>3)throw new IOException("此版本需要更新安装包");
   String version=manifest.getString("version");
   if(!version.matches("[a-f0-9]{16}"))throw new IOException("版本号无效");
   if(version.equals(preferences.getString("active",""))){message("已经是最新资源");return;}
   JSONArray files=manifest.getJSONArray("files");
   if(files.length()>40)throw new IOException("清单过大");
   File root=new File(getFilesDir(),"bundles");root.mkdirs();
   stage=new File(root,"stage-"+System.currentTimeMillis());stage.mkdirs();
   long total=0;
   for(int i=0;i<files.length();i++){
    JSONObject item=files.getJSONObject(i);String name=item.getString("name");
    if(!name.matches("[a-zA-Z0-9_-]+[.](html|js|css|png)"))throw new IOException("文件名无效");
    byte[] data=download("updates/"+version+"/"+name,12*1024*1024);total+=data.length;
    if(total>80*1024*1024)throw new IOException("资源包过大");
    byte[] hash=MessageDigest.getInstance("SHA-256").digest(data);StringBuilder hex=new StringBuilder();
    for(byte b:hash)hex.append(String.format("%02x",b&255));
    if(!hex.toString().equals(item.getString("sha256"))||data.length!=item.getLong("size"))throw new IOException("资源校验失败");
    try(FileOutputStream out=new FileOutputStream(new File(stage,name))){out.write(data);}
   }
   for(String required:new String[]{"index.html","game.js","engine.js","style.css","fruits.png","orchard.png","specials.png","wood.png"})
    if(!new File(stage,required).isFile())throw new IOException("资源不完整");
   File target=new File(root,version);
   if(!target.exists()&&!stage.renameTo(target))throw new IOException("无法保存更新");
   preferences.edit().putString("active",version).commit();
   runOnUiThread(()->new AlertDialog.Builder(this).setTitle("更新已就绪").setMessage("资源已完整下载并校验。现在重新进入道场？").setPositiveButton("进入新版",(d,w)->{active=target;game.reload();}).setNegativeButton("下次启动",null).show());
  }catch(Exception e){message("更新未完成，当前版本仍可离线玩。\n"+e.getMessage());}
  finally{if(stage!=null&&stage.exists()){File[] entries=stage.listFiles();if(entries!=null)for(File f:entries)f.delete();stage.delete();}updating.set(false);}
  }).start();
 }
 @Override public void onBackPressed(){showUpdate();}
 @Override protected void onPause(){super.onPause();game.onPause();game.pauseTimers();}
 @Override protected void onResume(){super.onResume();if(game!=null){game.resumeTimers();game.onResume();}}
}