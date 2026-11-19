#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor에 BgLocation 플러그인과 메서드를 등록한다.
CAP_PLUGIN(BgLocationPlugin, "BgLocation",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
)
