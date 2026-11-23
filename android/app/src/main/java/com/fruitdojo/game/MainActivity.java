package com.fruitdojo.game;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
public class MainActivity extends Activity {
 private WebView game;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  game=new WebView(this); setContentView(game);
  game.getSettings().setJavaScriptEnabled(true);
  game.getSettings().setDomStorageEnabled(true);
  game.getSettings().setAllowFileAccess(true);
  game.getSettings().setBlockNetworkLoads(true);
  game.loadUrl("file:///android_asset/index.html");
 }
 @Override protected void onPause() { super.onPause(); game.onPause(); game.pauseTimers(); }
 @Override protected void onResume() { super.onResume(); if(game!=null) {game.resumeTimers();game.onResume();} }
}
