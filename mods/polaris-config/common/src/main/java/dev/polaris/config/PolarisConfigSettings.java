/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import dev.polaris.config.PolarisConfigUi;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.Properties;

public final class PolarisConfigSettings {
    public boolean pauseGame = false;
    public boolean animations = true;
    public boolean openAnimation = true;
    public boolean backgroundBlur = true;
    public boolean uiSounds = true;
    public boolean clickSounds = true;
    public boolean menuSounds = true;
    public boolean keybindClosesGui = true;
    public boolean showKeybindHints = true;
    public boolean showDescriptions = true;
    public boolean rememberLastPage = true;
    public boolean pageAnimations = true;
    public boolean closingAnimation = true;
    public boolean sliderSounds = true;
    public boolean presenceAlerts = false;
    public boolean hudEnabled = true;
    public boolean hudFps = true;
    public boolean hudCoords = true;
    public boolean hudPing = true;
    public boolean hudKeystrokes = true;
    public boolean hudBackground = true;
    public int hudPosition = 0;
    public int pageOpacity = 88;
    public int sidebarOpacity = 80;
    public int uiScale = 100;
    public int glowOpacity = 25;
    public int animationMs = 220;
    public int accent = 0;
    public int soundVolume = 100;
    public int category = 0;
    public String profile = "Default";
    private static final File FILE = new File("config", "polarisconfig.properties");

    public static PolarisConfigSettings load() {
        PolarisConfigSettings polarisConfigSettings = new PolarisConfigSettings();
        if (!FILE.isFile()) {
            return polarisConfigSettings;
        }
        Properties properties = new Properties();
        try (FileInputStream fileInputStream = new FileInputStream(FILE);){
            properties.load(fileInputStream);
            polarisConfigSettings.pauseGame = PolarisConfigSettings.bool(properties, "pauseGame", polarisConfigSettings.pauseGame);
            polarisConfigSettings.animations = PolarisConfigSettings.bool(properties, "animations", polarisConfigSettings.animations);
            polarisConfigSettings.openAnimation = PolarisConfigSettings.bool(properties, "openAnimation", polarisConfigSettings.openAnimation);
            polarisConfigSettings.backgroundBlur = PolarisConfigSettings.bool(properties, "backgroundBlur", polarisConfigSettings.backgroundBlur);
            polarisConfigSettings.uiSounds = PolarisConfigSettings.bool(properties, "uiSounds", polarisConfigSettings.uiSounds);
            polarisConfigSettings.clickSounds = PolarisConfigSettings.bool(properties, "clickSounds", polarisConfigSettings.clickSounds);
            polarisConfigSettings.menuSounds = PolarisConfigSettings.bool(properties, "menuSounds", polarisConfigSettings.menuSounds);
            polarisConfigSettings.keybindClosesGui = PolarisConfigSettings.bool(properties, "keybindClosesGui", polarisConfigSettings.keybindClosesGui);
            polarisConfigSettings.showKeybindHints = PolarisConfigSettings.bool(properties, "showKeybindHints", polarisConfigSettings.showKeybindHints);
            polarisConfigSettings.showDescriptions = PolarisConfigSettings.bool(properties, "showDescriptions", polarisConfigSettings.showDescriptions);
            polarisConfigSettings.rememberLastPage = PolarisConfigSettings.bool(properties, "rememberLastPage", polarisConfigSettings.rememberLastPage);
            polarisConfigSettings.pageAnimations = PolarisConfigSettings.bool(properties, "pageAnimations", polarisConfigSettings.pageAnimations);
            polarisConfigSettings.closingAnimation = PolarisConfigSettings.bool(properties, "closingAnimation", polarisConfigSettings.closingAnimation);
            polarisConfigSettings.sliderSounds = PolarisConfigSettings.bool(properties, "sliderSounds", polarisConfigSettings.sliderSounds);
            polarisConfigSettings.presenceAlerts = PolarisConfigSettings.bool(properties, "presenceAlerts", polarisConfigSettings.presenceAlerts);
            polarisConfigSettings.hudEnabled = PolarisConfigSettings.bool(properties, "hudEnabled", polarisConfigSettings.hudEnabled);
            polarisConfigSettings.hudFps = PolarisConfigSettings.bool(properties, "hudFps", polarisConfigSettings.hudFps);
            polarisConfigSettings.hudCoords = PolarisConfigSettings.bool(properties, "hudCoords", polarisConfigSettings.hudCoords);
            polarisConfigSettings.hudPing = PolarisConfigSettings.bool(properties, "hudPing", polarisConfigSettings.hudPing);
            polarisConfigSettings.hudKeystrokes = PolarisConfigSettings.bool(properties, "hudKeystrokes", polarisConfigSettings.hudKeystrokes);
            polarisConfigSettings.hudBackground = PolarisConfigSettings.bool(properties, "hudBackground", polarisConfigSettings.hudBackground);
            polarisConfigSettings.hudPosition = PolarisConfigSettings.integer(properties, "hudPosition", polarisConfigSettings.hudPosition, 0, 3);
            polarisConfigSettings.pageOpacity = PolarisConfigSettings.integer(properties, "pageOpacity", polarisConfigSettings.pageOpacity, 30, 100);
            polarisConfigSettings.sidebarOpacity = PolarisConfigSettings.integer(properties, "sidebarOpacity", polarisConfigSettings.sidebarOpacity, 30, 100);
            polarisConfigSettings.uiScale = PolarisConfigSettings.integer(properties, "uiScale", polarisConfigSettings.uiScale, 75, 125);
            polarisConfigSettings.glowOpacity = PolarisConfigSettings.integer(properties, "glowOpacity", polarisConfigSettings.glowOpacity, 0, 100);
            polarisConfigSettings.animationMs = PolarisConfigSettings.integer(properties, "animationMs", polarisConfigSettings.animationMs, 100, 800);
            polarisConfigSettings.accent = PolarisConfigSettings.integer(properties, "accent", polarisConfigSettings.accent, 0, 4);
            polarisConfigSettings.soundVolume = PolarisConfigSettings.integer(properties, "soundVolume", polarisConfigSettings.soundVolume, 0, 100);
            polarisConfigSettings.category = PolarisConfigSettings.integer(properties, "category", polarisConfigSettings.category, 0, PolarisConfigUi.CATEGORIES.length - 1);
            polarisConfigSettings.profile = properties.getProperty("profile", polarisConfigSettings.profile);
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return polarisConfigSettings;
    }

    public void save() {
        Properties properties = new Properties();
        properties.setProperty("pauseGame", Boolean.toString(this.pauseGame));
        properties.setProperty("animations", Boolean.toString(this.animations));
        properties.setProperty("openAnimation", Boolean.toString(this.openAnimation));
        properties.setProperty("backgroundBlur", Boolean.toString(this.backgroundBlur));
        properties.setProperty("uiSounds", Boolean.toString(this.uiSounds));
        properties.setProperty("clickSounds", Boolean.toString(this.clickSounds));
        properties.setProperty("menuSounds", Boolean.toString(this.menuSounds));
        properties.setProperty("keybindClosesGui", Boolean.toString(this.keybindClosesGui));
        properties.setProperty("showKeybindHints", Boolean.toString(this.showKeybindHints));
        properties.setProperty("showDescriptions", Boolean.toString(this.showDescriptions));
        properties.setProperty("rememberLastPage", Boolean.toString(this.rememberLastPage));
        properties.setProperty("pageAnimations", Boolean.toString(this.pageAnimations));
        properties.setProperty("closingAnimation", Boolean.toString(this.closingAnimation));
        properties.setProperty("sliderSounds", Boolean.toString(this.sliderSounds));
        properties.setProperty("presenceAlerts", Boolean.toString(this.presenceAlerts));
        properties.setProperty("hudEnabled", Boolean.toString(this.hudEnabled));
        properties.setProperty("hudFps", Boolean.toString(this.hudFps));
        properties.setProperty("hudCoords", Boolean.toString(this.hudCoords));
        properties.setProperty("hudPing", Boolean.toString(this.hudPing));
        properties.setProperty("hudKeystrokes", Boolean.toString(this.hudKeystrokes));
        properties.setProperty("hudBackground", Boolean.toString(this.hudBackground));
        properties.setProperty("hudPosition", Integer.toString(this.hudPosition));
        properties.setProperty("pageOpacity", Integer.toString(this.pageOpacity));
        properties.setProperty("sidebarOpacity", Integer.toString(this.sidebarOpacity));
        properties.setProperty("uiScale", Integer.toString(this.uiScale));
        properties.setProperty("glowOpacity", Integer.toString(this.glowOpacity));
        properties.setProperty("animationMs", Integer.toString(this.animationMs));
        properties.setProperty("accent", Integer.toString(this.accent));
        properties.setProperty("soundVolume", Integer.toString(this.soundVolume));
        properties.setProperty("category", Integer.toString(this.category));
        properties.setProperty("profile", this.profile == null ? "Default" : this.profile);
        try {
            File file = FILE.getParentFile();
            if (file != null && !file.isDirectory()) {
                file.mkdirs();
            }
            try (FileOutputStream fileOutputStream = new FileOutputStream(FILE);){
                properties.store(fileOutputStream, "PolarisConfig");
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    public void reset() {
        this.pauseGame = false;
        this.animations = true;
        this.openAnimation = true;
        this.backgroundBlur = true;
        this.uiSounds = true;
        this.clickSounds = true;
        this.menuSounds = true;
        this.keybindClosesGui = true;
        this.showKeybindHints = true;
        this.showDescriptions = true;
        this.rememberLastPage = true;
        this.pageAnimations = true;
        this.closingAnimation = true;
        this.sliderSounds = true;
        this.presenceAlerts = false;
        this.hudEnabled = true;
        this.hudFps = true;
        this.hudCoords = true;
        this.hudPing = true;
        this.hudKeystrokes = true;
        this.hudBackground = true;
        this.hudPosition = 0;
        this.pageOpacity = 88;
        this.sidebarOpacity = 80;
        this.uiScale = 100;
        this.glowOpacity = 25;
        this.animationMs = 220;
        this.accent = 0;
        this.soundVolume = 100;
        this.category = 0;
        this.profile = "Default";
        this.save();
    }

    public void applyProfile(String string) {
        this.profile = string;
        if ("Competitive".equals(string)) {
            this.animations = false;
            this.openAnimation = false;
            this.backgroundBlur = false;
            this.uiSounds = false;
            this.clickSounds = false;
            this.menuSounds = false;
            this.pageOpacity = 96;
            this.sidebarOpacity = 92;
            this.uiScale = 100;
            this.glowOpacity = 10;
            this.animationMs = 100;
            this.pageAnimations = false;
            this.closingAnimation = false;
            this.pauseGame = false;
        } else if ("Quality".equals(string)) {
            this.animations = true;
            this.openAnimation = true;
            this.backgroundBlur = true;
            this.uiSounds = true;
            this.clickSounds = true;
            this.menuSounds = true;
            this.pageOpacity = 88;
            this.sidebarOpacity = 80;
            this.uiScale = 110;
            this.glowOpacity = 40;
            this.animationMs = 320;
            this.pageAnimations = true;
            this.closingAnimation = true;
            this.pauseGame = true;
        } else {
            this.profile = "Default";
            this.animations = true;
            this.openAnimation = true;
            this.backgroundBlur = true;
            this.uiSounds = true;
            this.clickSounds = true;
            this.menuSounds = true;
            this.pageOpacity = 88;
            this.sidebarOpacity = 80;
            this.uiScale = 100;
            this.glowOpacity = 25;
            this.animationMs = 220;
            this.pageAnimations = true;
            this.closingAnimation = true;
            this.pauseGame = false;
        }
        this.save();
    }

    public String nextProfile() {
        if ("Default".equals(this.profile)) {
            return "Competitive";
        }
        if ("Competitive".equals(this.profile)) {
            return "Quality";
        }
        return "Default";
    }

    private static boolean bool(Properties properties, String string, boolean bl) {
        String string2 = properties.getProperty(string);
        return string2 == null ? bl : Boolean.parseBoolean(string2);
    }

    private static int integer(Properties properties, String string, int n, int n2, int n3) {
        try {
            int n4 = Integer.parseInt(properties.getProperty(string, Integer.toString(n)));
            return Math.max(n2, Math.min(n3, n4));
        }
        catch (Throwable throwable) {
            return n;
        }
    }
}

