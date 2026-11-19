package com.wugui.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** 桌面小部件：显示关注统计（JS 侧经 Capacitor Preferences 写入 CapacitorStorage） */
public class WuGuiWidget extends AppWidgetProvider {

    static void updateOne(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_wugui);
        SharedPreferences p = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String stats = p.getString("widget_stats", ctx.getString(R.string.widget_empty));
        v.setTextViewText(R.id.widget_stats, stats);
        Intent i = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root, pi);
        mgr.updateAppWidget(id, v);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateOne(ctx, mgr, id);
    }
}
