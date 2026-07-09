package com.kpride.timecard;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * 서버가 랜덤 확인 시각에 보내는 무음(데이터) 푸시를 수신한다.
 * 앱이 종료/백그라운드 상태여도 잠깐 깨어나 현재 위치를 1회 측정해 서버로 전송한다.
 * (고우선순위 데이터 메시지에는 짧은 백그라운드 실행 + 백그라운드 위치 접근이 허용된다.)
 */
public class TimeCardMessagingService extends FirebaseMessagingService {

    private static final String TAG = "TimeCardFCM";
    private static final String API_BASE = "https://kstaff.synology.me:8443/api";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data == null || !"random_check".equals(data.get("type"))) return;
        final String token = data.get("t");
        if (token == null) return;

        // 위치 권한 확인 (없으면 조용히 종료)
        boolean fine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) { Log.w(TAG, "위치 권한 없음 — 건너뜀"); return; }

        try {
            FusedLocationProviderClient fused = LocationServices.getFusedLocationProviderClient(this);
            CancellationTokenSource cts = new CancellationTokenSource();
            fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                .addOnSuccessListener(loc -> {
                    if (loc != null) {
                        postLocation(token, loc.getLatitude(), loc.getLongitude(), loc.getAccuracy());
                    } else {
                        Log.w(TAG, "위치 null");
                    }
                })
                .addOnFailureListener(e -> Log.e(TAG, "위치 실패", e));
        } catch (SecurityException e) {
            Log.e(TAG, "권한 예외", e);
        }
    }

    private void postLocation(String t, double lat, double lng, float acc) {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                URL url = new URL(API_BASE + "/random-check/native-submit");
                c = (HttpURLConnection) url.openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(15000);
                c.setReadTimeout(15000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                String body = "{\"t\":\"" + t + "\",\"lat\":" + lat + ",\"lng\":" + lng + ",\"accuracyM\":" + Math.round(acc) + ",\"isMocked\":false}";
                try (OutputStream os = c.getOutputStream()) {
                    os.write(body.getBytes("UTF-8"));
                }
                int code = c.getResponseCode();
                Log.i(TAG, "위치 전송 응답: " + code);
            } catch (Exception e) {
                Log.e(TAG, "전송 실패", e);
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }
}
