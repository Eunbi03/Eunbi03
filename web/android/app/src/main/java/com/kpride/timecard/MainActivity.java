package com.kpride.timecard;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FcmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
