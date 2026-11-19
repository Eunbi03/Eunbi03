#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor에 Fcm 플러그인(getToken) 등록
CAP_PLUGIN(FcmPlugin, "Fcm",
    CAP_PLUGIN_METHOD(getToken, CAPPluginReturnPromise);
)
