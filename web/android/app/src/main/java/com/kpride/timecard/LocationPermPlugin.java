package com.kpride.timecard;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 위치 권한이 "항상 허용"인지 확인하고, 앱 설정 페이지를 여는 플러그인.
 * 안드로이드에서 "항상 허용" = 백그라운드 위치 권한(ACCESS_BACKGROUND_LOCATION, API 29+).
 * 안드로이드 11+(API 30+)는 백그라운드 위치를 앱 내 팝업으로 받을 수 없고 설정에서만 변경 가능하므로,
 * 미충족 시 JS가 openSettings로 설정 화면으로 유도한다.
 */
@CapacitorPlugin(name = "LocationPerm")
public class LocationPermPlugin extends Plugin {

    private boolean isGranted(String perm) {
        return ContextCompat.checkSelfPermission(getContext(), perm) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject statusResult() {
        boolean fine = isGranted(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = isGranted(Manifest.permission.ACCESS_COARSE_LOCATION);
        boolean locGranted = fine || coarse;

        boolean always;
        String status;
        if (!locGranted) {
            always = false;
            status = "denied";
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // 안드로이드 10+ : 백그라운드 위치 권한이 있어야 "항상 허용"
            boolean bg = isGranted(Manifest.permission.ACCESS_BACKGROUND_LOCATION);
            always = bg;
            status = bg ? "always" : "whenInUse";
        } else {
            // 안드로이드 9 이하: 위치 권한이 있으면 항상 허용된 것으로 간주
            always = true;
            status = "always";
        }

        JSObject ret = new JSObject();
        ret.put("always", always);
        ret.put("status", status);
        return ret;
    }

    // 현재 권한이 "항상 허용"인지 반환한다. (즉시 반환 — GPS 측정 없음)
    @PluginMethod
    public void checkAlways(PluginCall call) {
        call.resolve(statusResult());
    }

    // 안드로이드 11+는 백그라운드 위치를 앱 내에서 요청할 수 없어 설정으로 유도해야 하므로,
    // 현재 상태를 그대로 반환한다. (JS가 미충족 시 openSettings 호출)
    @PluginMethod
    public void requestAlways(PluginCall call) {
        call.resolve(statusResult());
    }

    // 앱 설정 페이지를 연다.
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("opened", false);
            call.resolve(ret);
        }
    }
}
