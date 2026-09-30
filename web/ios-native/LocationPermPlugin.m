#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor에 LocationPerm 플러그인과 메서드를 등록한다.
CAP_PLUGIN(LocationPermPlugin, "LocationPerm",
    CAP_PLUGIN_METHOD(checkAlways, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAlways, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(openSettings, CAPPluginReturnPromise);
)
