#!/bin/sh

# Don't flash in recovery!
if ! $BOOTMODE; then
    abort "*********************************************************
! Install from recovery is NOT supported
! Recovery sucks
! Please install from Magisk / KernelSU / APatch app
*********************************************************"
fi

# Error on < Android 8
[ "$API" -lt 26 ] && abort "! You can't use this module on Android < 8.0"

check_zygisk() {
    local ZYGISK_MSG="Zygisk is not enabled. Please either:
- Enable Zygisk in Magisk settings
- Install ZygiskNext or ReZygisk module"

    # Check if Zygisk module directory exists
    [ -d "/data/adb/modules/zygisksu" ] || [ -d "/data/adb/modules/rezygisk" ] && return 0

    # If Magisk is installed, check Zygisk settings
    if [ -d "/data/adb/magisk" ]; then
        # Query Zygisk status from Magisk database
        magisk --sqlite "SELECT value FROM settings WHERE key='zygisk';" | grep -q "value=1" && return 0
    fi
    
    abort "$ZYGISK_MSG"
}

# Module requires Zygisk to work
check_zygisk

# safetynet-fix module is obsolete and it's incompatible with PIF
SNFix="/data/adb/modules/safetynet-fix"
if [ -d "$SNFix" ]; then
    ui_print "! safetynet-fix module is obsolete and it's incompatible with PIF, it will be removed on next reboot"
    ui_print "! Do not install it"
    touch "$SNFix/remove"
fi

# playcurl warn
[ -d "/data/adb/modules/playcurl" ] && ui_print "! playcurl may overwrite fingerprint with invalid one, be careful!"

# MagiskHidePropsConf module is obsolete in Android 8+ but it shouldn't give issues
[ -d "/data/adb/modules/MagiskHidePropsConf" ] && ui_print "! WARNING, MagiskHidePropsConf module may cause issues with PIF."

# Preserve previous setting
OLD_PIF="/data/adb/modules/playintegrityfix/pif.prop"
if [ -f "$OLD_PIF" ]; then
    spoofConfig="spoofBuild spoofProps spoofProvider spoofSignature spoofVendingBuild spoofVendingSdk"
    for config in $spoofConfig; do
        grep -q "^$config=true" "$OLD_PIF" && sed -i "s/^$config=.*/$config=true/" "$MODPATH/pif.prop"
        grep -q "^$config=false" "$OLD_PIF" && sed -i "s/^$config=.*/$config=false/" "$MODPATH/pif.prop"
    done
fi

# Restore previous settings
[ -f "/data/adb/modules/playintegrityfix/uninstall.sh" ] && cp -f "/data/adb/modules/playintegrityfix/uninstall.sh" "$MODPATH/uninstall.sh"

# Check custom fingerprint
[ -f "/data/adb/pif.prop" ] && ui_print "- Backup custom pif.prop" && mv -f /data/adb/pif.prop /data/adb/pif.prop.old

# give exec perm to autopif scripts
chmod +x "$MODPATH/autopif.sh" "$MODPATH/autopif_ota.sh"
