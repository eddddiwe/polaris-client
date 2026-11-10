/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import dev.polaris.config.PolarisConfigSettings;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public final class PolarisConfigUi {
    public static final String[] CATEGORIES = new String[]{"General", "Appearance", "HUD", "Themes", "Animations", "Sounds", "Keybinds", "Profiles"};
    private static final String[] CATEGORY_DESCRIPTIONS = new String[]{"Launcher behavior and menu defaults.", "Panel opacity, scale and background treatment.", "On-screen FPS, coordinates, ping and keystrokes.", "Polaris accent colours and visual identity.", "Opening, closing and page transition motion.", "UI feedback and volume.", "Open and close behavior for this menu.", "Quick presets for the whole menu."};
    private static final int[] ACCENTS = new int[]{-4939521, -13047553, -757066, -11870592, -278748};
    private static final String[] ACCENT_NAMES = new String[]{"Polaris purple", "Nebula cyan", "Solar pink", "Aurora green", "Amber glow"};
    static final String VERSION = "v1.2.2";
    private static final int BACKDROP = -16579574;
    private static final int PANEL = -15921384;
    private static final int PANEL_HI = -15328469;
    private static final int SIDEBAR = -16250350;
    private static final int CARD = 0xAFFFFFF;
    private static final int CARD_HOVER = 0x12FFFFFF;
    private static final int HAIRLINE = 0x14FFFFFF;
    private static final int TEXT = -1117958;
    private static final int MUTED = -7563855;
    private static final int DIM = -7695443;
    private static final int BRAND = -7643914;
    private static final int CYAN = -14494738;
    private static final int DANGER = -38015;
    private static final int WHITE = -1;
    private static int accent = ACCENTS[0];
    private static int accentSoft = -14494738;
    private static float uiScale = 1.0f;
    private static int rowHeightPx = 38;
    private static int layoutCategory = 0;
    private static int lastCategory = -1;
    private static long pageStart = 0L;
    private static int pageDir = 1;
    private static final Map<Integer, Anim> ANIM = new HashMap<Integer, Anim>();
    private static final String[][] ICONS = new String[][]{{".##..##.", "########", "##....##", "#......#", "#......#", "##....##", "########", ".##..##."}, {"...##...", "..####..", ".######.", "########", ".######.", "..####..", "...##...", "........"}, {"########", "#......#", "#.###..#", "#......#", "########", "...##...", "..####..", "........"}, {"...##...", "...##...", "..####..", ".######.", ".######.", "########", "########", ".######."}, {"........", ".#####..", "........", "...#####", "........", ".#####..", "........", "........"}, {"........", ".#.#.#..", ".#.#.#..", ".#.#.#..", ".#.#.#..", "........", "........", "........"}, {"........", "########", "#.#.#.#.", "#.#.#.#.", "########", "........", "........", "........"}, {"..####..", "..####..", "..####..", "........", ".######.", "########", "########", "........"}};
    private static final int[][] ICON_PIXELS = PolarisConfigUi.buildIconPixels();

    private PolarisConfigUi() {
    }

    public static Layout layout(int n, int n2, PolarisConfigSettings polarisConfigSettings) {
        PolarisConfigUi.prepare(polarisConfigSettings);
        Layout layout = new Layout();
        // Keep the whole menu on screen even at high GUI scale: cap the user
        // scale by the available logical resolution before sizing the panel.
        float f = Math.min(uiScale, Math.min((n - 16) / 548.0f, (n2 - 16) / 424.0f));
        f = Math.max(0.6f, f);
        // Downstream row/control math reads uiScale directly; pin it to the
        // resolution-capped value so controls shrink with the panel instead of
        // overlapping at high GUI scale or small windows.
        uiScale = f;
        layout.width = Math.min(n - 16, Math.round(548.0f * f));
        layout.height = Math.min(n2 - 16, Math.round(424.0f * f));
        layout.x = (n - layout.width) / 2;
        layout.y = (n2 - layout.height) / 2;
        layout.sidebarWidth = Math.round(152.0f * f);
        layout.headerHeight = Math.round(60.0f * f);
        layout.footerHeight = Math.round(48.0f * f);
        int n3 = PolarisConfigUi.rowsForCategory(layoutCategory);
        int n4 = layout.height - layout.headerHeight - layout.footerHeight - Math.round(16.0f * f) - Math.round(50.0f * f) - Math.round(12.0f * f);
        rowHeightPx = layout.rowHeight = Math.max(Math.round(28.0f * f), Math.min(Math.round(38.0f * f), n4 / Math.max(1, n3)));
        int n5 = layout.height - layout.headerHeight - Math.round(32.0f * f) - Math.round(64.0f * f);
        layout.sidebarItemHeight = Math.max(Math.round(24.0f * f), Math.min(Math.round(33.0f * f), n5 / CATEGORIES.length));
        layout.contentX = layout.x + layout.sidebarWidth + Math.round(20.0f * f);
        layout.contentY = layout.y + layout.headerHeight + Math.round(16.0f * f);
        layout.contentWidth = layout.x + layout.width - layout.contentX - Math.round(20.0f * f);
        return layout;
    }

    private static int rowsForCategory(int n) {
        switch (n) {
            case 0: {
                return 6;
            }
            case 1: {
                return 5;
            }
            case 2: {
                return 7;
            }
            case 3: {
                return 3;
            }
            case 4: {
                return 5;
            }
            case 5: {
                return 5;
            }
            case 6: {
                return 5;
            }
        }
        return 4;
    }

    public static void render(Paint paint, PolarisConfigSettings polarisConfigSettings, int n, int n2, int n3, int n4, int n5, long l) {
        long l2 = System.currentTimeMillis();
        PolarisConfigUi.prepare(polarisConfigSettings);
        layoutCategory = n;
        Layout layout = PolarisConfigUi.layout(n4, n5, polarisConfigSettings);
        float f = uiScale;
        int n6 = Math.max(9, Math.round(15.0f * f));
        if (n != lastCategory) {
            pageDir = n > lastCategory ? 1 : -1;
            lastCategory = n;
            pageStart = l2;
        }
        float f2 = 1.0f;
        if (polarisConfigSettings.animations && polarisConfigSettings.openAnimation) {
            f2 = PolarisConfigUi.ease(PolarisConfigUi.clamp01((float)(l2 - l) / (float)Math.max(150, polarisConfigSettings.animationMs)));
        }
        float f3 = 1.0f;
        if (polarisConfigSettings.animations && polarisConfigSettings.pageAnimations) {
            f3 = PolarisConfigUi.ease(PolarisConfigUi.clamp01((float)(l2 - pageStart) / (float)Math.max(150, polarisConfigSettings.animationMs)));
        }
        float f4 = Math.min(f2, f3);
        int n7 = Math.round((1.0f - f2) * 18.0f * f);
        int n8 = layout.x;
        int n9 = layout.y + n7;
        int n10 = layout.width;
        int n11 = layout.height;
        int n12 = Math.round((float)(polarisConfigSettings.backgroundBlur ? 216 : 150) * (0.35f + 0.65f * f2));
        paint.fill(0, 0, n4, n5, PolarisConfigUi.withAlpha(-16579574, n12));
        int n13 = Math.round((float)polarisConfigSettings.glowOpacity / 100.0f * 78.0f * f2);
        if (n13 > 2) {
            PolarisConfigUi.roundRectOutline(paint, n8 - 2, n9 - 2, n10 + 4, n11 + 4, n6 + 2, PolarisConfigUi.withAlpha(accent, n13));
            PolarisConfigUi.roundRectOutline(paint, n8 - 4, n9 - 4, n10 + 8, n11 + 8, n6 + 4, PolarisConfigUi.withAlpha(accent, n13 / 3));
        }
        int n14 = PolarisConfigUi.opacity(polarisConfigSettings.pageOpacity);
        PolarisConfigUi.roundRect(paint, n8, n9, n10, n11, n6, PolarisConfigUi.withAlpha(-15921384, Math.round((float)n14 * (0.55f + 0.45f * f2))));
        paint.fill(n8 + n6, n9 + 1, n8 + n10 - n6, n9 + 1 + Math.max(1, Math.round(2.0f * f)), PolarisConfigUi.withAlpha(-15328469, Math.round(190.0f * f2)));
        PolarisConfigUi.ellipseGlow(paint, n8 + n10 - Math.round(30.0f * f), n9 + Math.round(4.0f * f), Math.round(200.0f * f), Math.round(126.0f * f), accent, Math.round(30.0f * f2), n8 + 1, n9 + 1, n8 + n10 - 1, n9 + n11 - 1, 2);
        PolarisConfigUi.ellipseGlow(paint, n8 + Math.round(120.0f * f), n9 + n11 - Math.round(24.0f * f), Math.round(180.0f * f), Math.round(116.0f * f), -14494738, Math.round(17.0f * f2), n8 + 1, n9 + 1, n8 + n10 - 1, n9 + n11 - 1, 2);
        PolarisConfigUi.starfield(paint, n8, n9, n10, n11, n6, l2, f2);
        PolarisConfigUi.roundRectOutline(paint, n8, n9, n10, n11, n6, PolarisConfigUi.withAlpha(-7643914, Math.round(70.0f * (0.4f + 0.6f * f2))));
        PolarisConfigUi.drawHeader(paint, polarisConfigSettings, layout, n8, n9, n10, f, f2, l2, n2, n3);
        PolarisConfigUi.drawSidebar(paint, polarisConfigSettings, layout, n, n8, n9, n10, n11, n6, f, f2, f4, l2, n2, n3);
        PolarisConfigUi.drawContent(paint, polarisConfigSettings, layout, n, n8, n9, n10, n11, f, f2, f4, l2, n2, n3);
        PolarisConfigUi.drawFooter(paint, layout, n8, n9, n10, n11, f, f2, l2, n2, n3);
    }

    private static void drawHeader(Paint paint, PolarisConfigSettings polarisConfigSettings, Layout layout, int n, int n2, int n3, float f, float f2, long l, int n4, int n5) {
        int n6 = Math.round(18.0f * f);
        int n7 = Math.round(15.0f * f);
        int n8 = n2 + Math.round(16.0f * f);
        PolarisConfigUi.drawMark(paint, n + n6, n8, n7, accent, f2, l);
        int n9 = n + n6 + n7 + Math.round(10.0f * f);
        paint.flat("PolarisConfig", n9, n2 + Math.round(17.0f * f), PolarisConfigUi.withAlpha(-1117958, f2));
        int n10 = paint.textWidth("PolarisConfig");
        String string = VERSION;
        int n11 = Math.round(13.0f * f);
        int n12 = paint.textWidth(string) + Math.round(12.0f * f);
        int n13 = n9 + n10 + Math.round(9.0f * f);
        int n14 = n2 + Math.round(17.0f * f);
        PolarisConfigUi.pill(paint, n13, n14, n12, n11, PolarisConfigUi.withAlpha(-1, Math.round(16.0f * f2)));
        PolarisConfigUi.pillOutline(paint, n13, n14, n12, n11, PolarisConfigUi.withAlpha(accent, Math.round(58.0f * f2)));
        paint.flatCentered(string, n13 + n12 / 2, n14 + Math.round(3.0f * f), PolarisConfigUi.withAlpha(accentSoft, f2));
        paint.flat("In-game client settings", n9, n2 + Math.round(31.0f * f), PolarisConfigUi.withAlpha(-7695443, f2));
        if (polarisConfigSettings.showKeybindHints) {
            String string2 = "Right Shift";
            String string3 = "CONFIG KEY";
            int n15 = Math.max(paint.textWidth(string2), PolarisConfigUi.spacedWidth(paint, string3, Math.round(1.0f * f))) + Math.round(16.0f * f);
            int n16 = Math.round(28.0f * f);
            int n17 = n + n3 - n6 - n15;
            int n18 = n2 + Math.round(15.0f * f);
            boolean bl = PolarisConfigUi.inRect(n4, n5, n17, n18, n15, n16);
            float f3 = PolarisConfigUi.anim(900, bl ? 1.0f : 0.0f, l, 140.0f);
            PolarisConfigUi.pill(paint, n17, n18, n15, n16, PolarisConfigUi.withAlpha(-1, Math.round((12.0f + 12.0f * f3) * f2)));
            PolarisConfigUi.pillOutline(paint, n17, n18, n15, n16, PolarisConfigUi.withAlpha(-7643914, Math.round((50.0f + 50.0f * f3) * f2)));
            PolarisConfigUi.spaced(paint, string3, n17 + n15 / 2 - PolarisConfigUi.spacedWidth(paint, string3, Math.round(1.0f * f)) / 2, n18 + Math.round(4.0f * f), PolarisConfigUi.withAlpha(-7695443, f2), Math.round(1.0f * f));
            paint.flatCentered(string2, n17 + n15 / 2, n18 + Math.round(15.0f * f), PolarisConfigUi.withAlpha(-1117958, f2));
        }
        PolarisConfigUi.fadeLine(paint, n + n6, n2 + layout.headerHeight - 1, n3 - n6 * 2, Math.max(1, Math.round(f)), accent, f2);
    }

    private static void drawSidebar(Paint paint, PolarisConfigSettings polarisConfigSettings, Layout layout, int n, int n2, int n3, int n4, int n5, int n6, float f, float f2, float f3, long l, int n7, int n8) {
        int n9;
        int n10;
        int n11;
        int n12;
        int n13;
        int n14;
        int n15;
        int n16;
        int n17 = n3 + layout.headerHeight;
        int n18 = n5 - layout.headerHeight;
        int n19 = PolarisConfigUi.opacity(polarisConfigSettings.sidebarOpacity);
        PolarisConfigUi.sidebarShape(paint, n2, n17, layout.sidebarWidth, n18, n6, PolarisConfigUi.withAlpha(-16250350, Math.round((float)n19 * (0.6f + 0.4f * f2))));
        int n20 = n2 + layout.sidebarWidth;
        int n21 = n17 + Math.round(12.0f * f);
        int n22 = n18 - Math.round(24.0f * f);
        int n23 = 12;
        for (n16 = 0; n16 < n23; ++n16) {
            float f4 = (float)n16 / (float)(n23 - 1);
            float f5 = (float)Math.sin(Math.PI * (double)f4) * 0.55f;
            n15 = n21 + Math.round((float)n22 * ((float)n16 / (float)n23));
            n14 = Math.max(1, n22 / n23 + 1);
            paint.fill(n20 - 1, n15, n20, n15 + n14, PolarisConfigUi.withAlpha(-7643914, Math.round(120.0f * f5 * f2)));
        }
        n16 = Math.round(18.0f * f);
        PolarisConfigUi.spaced(paint, "MENU", n2 + n16, n17 + Math.round(13.0f * f), PolarisConfigUi.withAlpha(-7695443, f2), Math.round(2.0f * f));
        int n24 = n17 + Math.round(30.0f * f);
        int n25 = layout.sidebarItemHeight;
        n15 = n2 + Math.round(10.0f * f);
        n14 = layout.sidebarWidth - Math.round(20.0f * f);
        int n26 = Math.max(6, Math.round(9.0f * f));
        for (n13 = 0; n13 < CATEGORIES.length; ++n13) {
            int n27;
            int n28;
            n12 = n24 + n13 * n25;
            n11 = Math.max(Math.round(18.0f * f), n25 - Math.round(7.0f * f));
            n10 = n13 == n ? 1 : 0;
            n9 = PolarisConfigUi.inRect(n7, n8, n15, n12, n14, n11) ? 1 : 0;
            float f6 = PolarisConfigUi.anim(1000 + n13, n9 != 0 ? 1.0f : 0.0f, l, 130.0f);
            float f7 = PolarisConfigUi.anim(1500 + n13, n10 != 0 ? 1.0f : 0.0f, l, 190.0f);
            float f8 = PolarisConfigUi.clamp01((f3 - (float)n13 * 0.045f) * 2.6f);
            int n29 = Math.round((1.0f - f8) * -8.0f * f);
            int n30 = n15 + n29;
            float f9 = f2 * f8;
            if (f7 > 0.01f) {
                PolarisConfigUi.roundRect(paint, n30, n12, n14, n11, n26, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(accent, -15921384, 0.8f), Math.round(235.0f * f7 * f9)));
                n28 = Math.round((float)n11 * (0.42f + 0.58f * f7));
                n27 = n12 + (n11 - n28) / 2;
                PolarisConfigUi.roundRect(paint, n30 + Math.round(3.0f * f), n27, Math.max(2, Math.round(3.0f * f)), n28, Math.max(1, Math.round(1.5f * f)), PolarisConfigUi.withAlpha(accent, Math.round(255.0f * f7 * f9)));
                PolarisConfigUi.roundRectOutline(paint, n30 + Math.round(2.0f * f), n27 - 1, Math.max(4, Math.round(5.0f * f)), n28 + 2, Math.max(2, Math.round(2.0f * f)), PolarisConfigUi.withAlpha(accent, Math.round(60.0f * f7 * f9)));
            } else if (f6 > 0.01f) {
                PolarisConfigUi.roundRect(paint, n30, n12, n14, n11, n26, PolarisConfigUi.withAlpha(-1, Math.round(13.0f * f6 * f9)));
            }
            n28 = n10 != 0 ? accent : PolarisConfigUi.mix(-7695443, -1117958, 0.45f * f6);
            n27 = n11 >= Math.round(26.0f * f) ? 8 : 7;
            PolarisConfigUi.drawIcon(paint, n13, n30 + Math.round(10.0f * f), n12 + (n11 - n27) / 2, PolarisConfigUi.withAlpha(n28, f9));
            int n31 = n10 != 0 ? -1117958 : PolarisConfigUi.mix(-7563855, -1117958, f6);
            paint.flat(CATEGORIES[n13], n30 + Math.round(26.0f * f), n12 + (n11 - 8) / 2 + 1, PolarisConfigUi.withAlpha(n31, f9));
        }
        n13 = Math.round(20.0f * f);
        n12 = layout.sidebarWidth - Math.round(24.0f * f);
        n11 = n2 + Math.round(12.0f * f);
        n10 = n3 + n5 - Math.round(52.0f * f);
        PolarisConfigUi.pill(paint, n11, n10, n12, n13, PolarisConfigUi.withAlpha(-1, Math.round(12.0f * f2)));
        PolarisConfigUi.pillOutline(paint, n11, n10, n12, n13, PolarisConfigUi.withAlpha(-7643914, Math.round(46.0f * f2)));
        n9 = Math.max(2, Math.round(4.0f * f));
        PolarisConfigUi.circle(paint, n11 + Math.round(10.0f * f), n10 + n13 / 2, n9 / 2 + 1, PolarisConfigUi.withAlpha(accent, Math.round(220.0f * f2)));
        String string = PolarisConfigUi.trim(paint, polarisConfigSettings.profile, n12 - Math.round(26.0f * f));
        paint.flat(string, n11 + Math.round(20.0f * f), n10 + (n13 - 8) / 2 + 1, PolarisConfigUi.withAlpha(-7563855, f2));
        paint.flat("Polaris Client", n11 + Math.round(2.0f * f), n10 + n13 + Math.round(9.0f * f), PolarisConfigUi.withAlpha(-7695443, f2));
    }

    private static void drawContent(Paint paint, PolarisConfigSettings polarisConfigSettings, Layout layout, int n, int n2, int n3, int n4, int n5, float f, float f2, float f3, long l, int n6, int n7) {
        int n8 = layout.contentX + Math.round((1.0f - f3) * 12.0f * f * (float)pageDir);
        int n9 = layout.contentY;
        paint.flat(CATEGORIES[n], n8, n9, PolarisConfigUi.withAlpha(-1117958, f2));
        int n10 = Math.min(paint.textWidth(CATEGORIES[n]) + Math.round(14.0f * f), Math.round(150.0f * f));
        PolarisConfigUi.fadeLine(paint, n8, n9 + Math.round(14.0f * f), n10, Math.max(2, Math.round(2.0f * f)), accent, f2);
        paint.flat(CATEGORY_DESCRIPTIONS[n], n8, n9 + Math.round(23.0f * f), PolarisConfigUi.withAlpha(-7563855, f2));
        PolarisConfigUi.drawCategory(paint, polarisConfigSettings, n, layout, n6, n7, l, f2, f3);
    }

    private static void drawCategory(Paint paint, PolarisConfigSettings polarisConfigSettings, int n, Layout layout, int n2, int n3, long l, float f, float f2) {
        int n4 = PolarisConfigUi.rowTop(layout);
        boolean bl = polarisConfigSettings.showDescriptions;
        if (n == 0) {
            String[] stringArray = new String[]{"Pause game while open", "Remember last page", "Show descriptions", "Show keybind hints", "Share presence & show badges", "Reset all settings"};
            String[] stringArray2 = new String[]{"Pause singleplayer while the menu is open.", "Reopen the last category next time.", "Display helper text under each option.", "Show the activation key in the header.", "Broadcasts your UUID, name and server to the Polaris relay so other users see a [P] badge. Off by default.", "Restore every PolarisConfig option."};
            for (int i = 0; i < stringArray.length; ++i) {
                int n5 = n4 + i * layout.rowHeight;
                if (i == 5) {
                    PolarisConfigUi.buttonRow(paint, layout, i, n5, stringArray[i], bl ? stringArray2[i] : null, "Reset", -38015, false, n2, n3, l, f, f2);
                    continue;
                }
                PolarisConfigUi.toggleRow(paint, layout, i, n5, stringArray[i], bl ? stringArray2[i] : null, PolarisConfigUi.bool(polarisConfigSettings, n, i), n2, n3, l, f, f2);
            }
        } else if (n == 1) {
            String[] stringArray = new String[]{"Background dimming", "Page opacity", "Sidebar opacity", "UI scale", "Glow strength"};
            String[] stringArray3 = new String[]{"Dim the world behind the menu.", "Opacity of the main panel.", "Opacity of the category sidebar.", "Scale the entire PolarisConfig menu.", "Accent bloom around the panel."};
            for (int i = 0; i < stringArray.length; ++i) {
                int n6 = n4 + i * layout.rowHeight;
                if (i == 0) {
                    PolarisConfigUi.toggleRow(paint, layout, i, n6, stringArray[i], bl ? stringArray3[i] : null, polarisConfigSettings.backgroundBlur, n2, n3, l, f, f2);
                    continue;
                }
                int n7 = i == 1 || i == 2 ? 30 : (i == 3 ? 75 : 0);
                int n8 = i == 3 ? 125 : 100;
                String string = i == 3 ? "%" : "";
                PolarisConfigUi.sliderRow(paint, layout, i, n6, stringArray[i], bl ? stringArray3[i] : null, PolarisConfigUi.value(polarisConfigSettings, n, i), n7, n8, string, n2, n3, l, f, f2);
            }
        } else if (n == 2) {
            String[] stringArray = new String[]{"Show HUD", "FPS counter", "Coordinates", "Ping", "Keystrokes", "Background panel", "HUD position"};
            String[] stringArray4 = new String[]{"Enable the Polaris in-game HUD.", "Frames per second.", "Current X/Y/Z position.", "Current server latency.", "WASD key state.", "Draw a dark panel behind the HUD.", "Where the HUD sits on screen."};
            for (int i = 0; i < stringArray.length; ++i) {
                int n9 = n4 + i * layout.rowHeight;
                if (i == 6) {
                    PolarisConfigUi.buttonRow(paint, layout, i, n9, stringArray[i], bl ? stringArray4[i] : null, PolarisConfigUi.hudPositionName(polarisConfigSettings.hudPosition), accent, true, n2, n3, l, f, f2);
                    continue;
                }
                PolarisConfigUi.toggleRow(paint, layout, i, n9, stringArray[i], bl ? stringArray4[i] : null, PolarisConfigUi.bool(polarisConfigSettings, n, i), n2, n3, l, f, f2);
            }
        } else if (n == 3) {
            int n10;
            int n11;
            int n12;
            int n13 = n4;
            boolean bl2 = PolarisConfigUi.rowHovered(layout, n13, n2, n3);
            float f3 = PolarisConfigUi.anim(2000, bl2 ? 1.0f : 0.0f, l, 130.0f);
            float f4 = PolarisConfigUi.clamp01(f2 * 2.6f);
            PolarisConfigUi.rowCard(paint, layout, n13, f3, f * f4, f4, 0);
            PolarisConfigUi.rowText(paint, layout, n13, "Accent colour", bl ? "Polaris identity across the menu." : null, f3, f * f4, f4);
            int n14 = Math.max(6, Math.round(8.0f * uiScale));
            int n15 = Math.max(20, Math.round(23.0f * uiScale));
            int n16 = PolarisConfigUi.controlRight(layout) - n14;
            int n17 = n13 + PolarisConfigUi.cardHeight() / 2;
            for (n12 = 0; n12 < ACCENTS.length; ++n12) {
                int n18 = n16 - (ACCENTS.length - 1 - n12) * n15;
                boolean bl3 = n12 == polarisConfigSettings.accent;
                float f5 = PolarisConfigUi.anim(6000 + n12, bl3 ? 1.0f : 0.0f, l, 170.0f);
                n11 = Math.abs(n2 - n18) <= n14 + 2 && Math.abs(n3 - n17) <= n14 + 2 ? 1 : 0;
                float f6 = PolarisConfigUi.anim(6500 + n12, n11 != 0 ? 1.0f : 0.0f, l, 130.0f);
                n10 = n14 + Math.round(1.5f * (f5 + f6));
                PolarisConfigUi.circle(paint, n18, n17, n10 + 2, PolarisConfigUi.withAlpha(ACCENTS[n12], Math.round((30.0f + 60.0f * f5) * f * f4)));
                PolarisConfigUi.circle(paint, n18, n17, n10, PolarisConfigUi.withAlpha(ACCENTS[n12], Math.round(255.0f * f * f4)));
                if (!(f5 > 0.02f)) continue;
                PolarisConfigUi.circleOutline(paint, n18, n17, n10 + 2, PolarisConfigUi.withAlpha(-1, Math.round(190.0f * f5 * f * f4)));
            }
            n13 = n4 + layout.rowHeight;
            PolarisConfigUi.buttonRow(paint, layout, 1, n13, ACCENT_NAMES[PolarisConfigUi.clampIndex(polarisConfigSettings.accent, ACCENT_NAMES.length)], bl ? "Active accent used across the menu and HUD." : null, "Default", accent, true, n2, n3, l, f, f2);
            n13 = n4 + 2 * layout.rowHeight;
            n12 = PolarisConfigUi.rowHovered(layout, n13, n2, n3) ? 1 : 0;
            float f7 = PolarisConfigUi.anim(2002, n12 != 0 ? 1.0f : 0.0f, l, 130.0f);
            float f8 = PolarisConfigUi.clamp01((f2 - 0.1f) * 2.6f);
            PolarisConfigUi.rowCard(paint, layout, n13, f7, f * f8, f8, 2);
            PolarisConfigUi.rowText(paint, layout, n13, "Preview", bl ? "Cards, toggles and sliders use this colour." : null, f7, f * f8, f8);
            int n19 = Math.round(74.0f * uiScale);
            n11 = Math.round(20.0f * uiScale);
            int n20 = PolarisConfigUi.controlRight(layout) - n19;
            n10 = n13 + (PolarisConfigUi.cardHeight() - n11) / 2 + PolarisConfigUi.rowShift(f8, 2);
            PolarisConfigUi.pill(paint, n20 + PolarisConfigUi.rowShift(f8, 2), n10, n19, n11, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(accent, accentSoft, 0.45f), Math.round(255.0f * f * f8)));
            PolarisConfigUi.pill(paint, n20 + PolarisConfigUi.rowShift(f8, 2), n10, n19, Math.max(1, n11 / 3), PolarisConfigUi.withAlpha(-1, Math.round(38.0f * f * f8)));
        } else if (n == 4) {
            String[] stringArray = new String[]{"Animations", "Opening animation", "Closing animation", "Page transitions", "Animation duration"};
            String[] stringArray5 = new String[]{"Enable menu motion and hover transitions.", "Animate the panel when it opens.", "Animate the panel when it closes.", "Animate movement between categories.", "How long menu animations take, in milliseconds."};
            for (int i = 0; i < stringArray.length; ++i) {
                int n21 = n4 + i * layout.rowHeight;
                if (i < 4) {
                    PolarisConfigUi.toggleRow(paint, layout, i, n21, stringArray[i], bl ? stringArray5[i] : null, PolarisConfigUi.bool(polarisConfigSettings, n, i), n2, n3, l, f, f2);
                    continue;
                }
                PolarisConfigUi.sliderRow(paint, layout, i, n21, stringArray[i], bl ? stringArray5[i] : null, polarisConfigSettings.animationMs, 100, 800, "ms", n2, n3, l, f, f2);
            }
        } else if (n == 5) {
            String[] stringArray = new String[]{"UI sounds", "Menu sounds", "Click sounds", "Slider sounds", "Sound volume"};
            String[] stringArray6 = new String[]{"Play sounds for menu interactions.", "Play sounds when opening and closing screens.", "Play a click when activating controls.", "Play tick sounds while dragging sliders.", "Volume for PolarisConfig UI sounds."};
            for (int i = 0; i < stringArray.length; ++i) {
                int n22 = n4 + i * layout.rowHeight;
                if (i < 4) {
                    PolarisConfigUi.toggleRow(paint, layout, i, n22, stringArray[i], bl ? stringArray6[i] : null, PolarisConfigUi.bool(polarisConfigSettings, n, i), n2, n3, l, f, f2);
                    continue;
                }
                PolarisConfigUi.sliderRow(paint, layout, i, n22, stringArray[i], bl ? stringArray6[i] : null, polarisConfigSettings.soundVolume, 0, 100, "%", n2, n3, l, f, f2);
            }
        } else if (n == 6) {
            int n23 = n4;
            PolarisConfigUi.infoRow(paint, layout, 0, n23, "Open menu", "Right Shift", bl ? "The activation key for this menu." : null, n2, n3, l, f, f2);
            PolarisConfigUi.toggleRow(paint, layout, 1, n23 + layout.rowHeight, "Close with menu key", bl ? "Right Shift closes the menu." : null, polarisConfigSettings.keybindClosesGui, n2, n3, l, f, f2);
            PolarisConfigUi.toggleRow(paint, layout, 2, n23 + 2 * layout.rowHeight, "Show keybind hints", bl ? "Display shortcut hints in the header." : null, polarisConfigSettings.showKeybindHints, n2, n3, l, f, f2);
            PolarisConfigUi.buttonRow(paint, layout, 3, n23 + 3 * layout.rowHeight, "Close menu", bl ? "Return to the game." : null, "Close", accent, true, n2, n3, l, f, f2);
            PolarisConfigUi.infoRow(paint, layout, 4, n23 + 4 * layout.rowHeight, "Rebindable keys", "Coming soon", bl ? "Custom keybinds arrive in a later update." : null, n2, n3, l, f, f2);
        } else {
            int n24 = n4;
            PolarisConfigUi.infoRow(paint, layout, 0, n24, "Profile", polarisConfigSettings.profile, bl ? "Current menu preset." : null, n2, n3, l, f, f2);
            PolarisConfigUi.buttonRow(paint, layout, 1, n24 + layout.rowHeight, "Apply profile", bl ? "Apply the selected preset." : null, "Apply", accent, true, n2, n3, l, f, f2);
            PolarisConfigUi.buttonRow(paint, layout, 2, n24 + 2 * layout.rowHeight, "Reset all settings", bl ? "Restore all PolarisConfig defaults." : null, "Reset", -38015, false, n2, n3, l, f, f2);
            PolarisConfigUi.infoRow(paint, layout, 3, n24 + 3 * layout.rowHeight, "Next profile", polarisConfigSettings.nextProfile(), bl ? "Click the profile row to cycle." : null, n2, n3, l, f, f2);
        }
    }

    private static void toggleRow(Paint paint, Layout layout, int n, int n2, String string, String string2, boolean bl, int n3, int n4, long l, float f, float f2) {
        boolean bl2 = PolarisConfigUi.rowHovered(layout, n2, n3, n4);
        float f3 = PolarisConfigUi.anim(2000 + n, bl2 ? 1.0f : 0.0f, l, 130.0f);
        float f4 = PolarisConfigUi.rowFade(f2, n);
        int n5 = PolarisConfigUi.rowShift(f4, n);
        PolarisConfigUi.rowCard(paint, layout, n2, f3, f * f4, f4, n5);
        PolarisConfigUi.rowText(paint, layout, n2, string, string2, f3, f * f4, f4);
        int n6 = Math.round(40.0f * uiScale);
        int n7 = Math.round(20.0f * uiScale);
        int n8 = PolarisConfigUi.controlRight(layout) - n6 + n5;
        int n9 = n2 + (PolarisConfigUi.cardHeight() - n7) / 2;
        float f5 = PolarisConfigUi.anim(3000 + n, bl ? 1.0f : 0.0f, l, 170.0f);
        int n10 = PolarisConfigUi.mix(PolarisConfigUi.withAlpha(-1, 26), PolarisConfigUi.withAlpha(PolarisConfigUi.mix(accent, accentSoft, 0.35f), 235), f5);
        PolarisConfigUi.pill(paint, n8, n9, n6, n7, PolarisConfigUi.withAlpha(n10, f * f4));
        PolarisConfigUi.pillOutline(paint, n8, n9, n6, n7, PolarisConfigUi.withAlpha(f3 > 0.5f ? -1 : -7643914, Math.round((26.0f + 40.0f * f3 + 40.0f * f5) * f * f4)));
        if (f5 > 0.02f) {
            PolarisConfigUi.pill(paint, n8, n9, n6, n7, PolarisConfigUi.withAlpha(accent, Math.round(28.0f * f5 * f * f4)));
        }
        int n11 = Math.max(3, n7 / 2 - Math.round(3.0f * uiScale));
        int n12 = n8 + n7 / 2 + Math.round(f5 * (float)(n6 - n7));
        int n13 = n9 + n7 / 2;
        PolarisConfigUi.circle(paint, n12, n13 + 1, n11, PolarisConfigUi.withAlpha(0, Math.round(70.0f * f * f4)));
        PolarisConfigUi.circle(paint, n12, n13, n11, PolarisConfigUi.withAlpha(-1, Math.round(255.0f * f * f4)));
        PolarisConfigUi.circle(paint, n12, n13, Math.max(1, n11 - 2), PolarisConfigUi.withAlpha(PolarisConfigUi.mix(-1, accent, 0.35f * f5), Math.round(255.0f * f * f4)));
    }

    private static void sliderRow(Paint paint, Layout layout, int n, int n2, String string, String string2, int n3, int n4, int n5, String string3, int n6, int n7, long l, float f, float f2) {
        boolean bl = PolarisConfigUi.rowHovered(layout, n2, n6, n7);
        float f3 = PolarisConfigUi.anim(2000 + n, bl ? 1.0f : 0.0f, l, 130.0f);
        float f4 = PolarisConfigUi.rowFade(f2, n);
        int n8 = PolarisConfigUi.rowShift(f4, n);
        PolarisConfigUi.rowCard(paint, layout, n2, f3, f * f4, f4, n8);
        PolarisConfigUi.rowText(paint, layout, n2, string, string2, f3, f * f4, f4);
        String string4 = n3 + (string3 == null ? "" : string3);
        int n9 = Math.max(Math.round(34.0f * uiScale), paint.textWidth(string4) + Math.round(14.0f * uiScale));
        int n10 = Math.round(18.0f * uiScale);
        int n11 = PolarisConfigUi.controlRight(layout) - n9 + n8;
        int n12 = n2 + (PolarisConfigUi.cardHeight() - n10) / 2;
        PolarisConfigUi.pill(paint, n11, n12, n9, n10, PolarisConfigUi.withAlpha(-1, Math.round(14.0f * f * f4)));
        PolarisConfigUi.pillOutline(paint, n11, n12, n9, n10, PolarisConfigUi.withAlpha(-7643914, Math.round(44.0f * f * f4)));
        paint.flatCentered(string4, n11 + n9 / 2, n12 + (n10 - 8) / 2 + 1, PolarisConfigUi.withAlpha(-1117958, f * f4));
        int n13 = PolarisConfigUi.sliderWidth();
        int n14 = n11 - Math.round(12.0f * uiScale) - n13;
        int n15 = Math.max(3, Math.round(4.0f * uiScale));
        int n16 = n2 + PolarisConfigUi.cardHeight() / 2 - n15 / 2;
        float f5 = n5 == n4 ? 0.0f : PolarisConfigUi.clamp01((float)(n3 - n4) / (float)(n5 - n4));
        float f6 = PolarisConfigUi.anim(4000 + n, f5, l, 170.0f);
        PolarisConfigUi.pill(paint, n14 + n8, n16, n13, n15, PolarisConfigUi.withAlpha(-1, Math.round(20.0f * f * f4)));
        int n17 = Math.max(n15, Math.round(f6 * (float)n13));
        PolarisConfigUi.pill(paint, n14 + n8, n16, n17, n15, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(accent, accentSoft, 0.4f), Math.round(255.0f * f * f4)));
        int n18 = Math.max(4, Math.round(6.0f * uiScale));
        int n19 = n14 + n8 + Math.round(f6 * (float)n13);
        int n20 = n16 + n15 / 2;
        boolean bl2 = bl && PolarisConfigUi.overSlider(n6, layout);
        float f7 = PolarisConfigUi.anim(4500 + n, bl2 ? 1.0f : 0.0f, l, 130.0f);
        PolarisConfigUi.circle(paint, n19, n20, n18 + 3, PolarisConfigUi.withAlpha(accent, Math.round((26.0f + 40.0f * f7) * f * f4)));
        PolarisConfigUi.circle(paint, n19, n20 + 1, n18, PolarisConfigUi.withAlpha(0, Math.round(80.0f * f * f4)));
        PolarisConfigUi.circle(paint, n19, n20, n18, PolarisConfigUi.withAlpha(-1, Math.round(255.0f * f * f4)));
        PolarisConfigUi.circleOutline(paint, n19, n20, n18, PolarisConfigUi.withAlpha(accent, Math.round((120.0f + 90.0f * f7) * f * f4)));
    }

    private static void buttonRow(Paint paint, Layout layout, int n, int n2, String string, String string2, String string3, int n3, boolean bl, int n4, int n5, long l, float f, float f2) {
        boolean bl2 = PolarisConfigUi.rowHovered(layout, n2, n4, n5);
        float f3 = PolarisConfigUi.anim(2000 + n, bl2 ? 1.0f : 0.0f, l, 130.0f);
        float f4 = PolarisConfigUi.rowFade(f2, n);
        int n6 = PolarisConfigUi.rowShift(f4, n);
        PolarisConfigUi.rowCard(paint, layout, n2, f3, f * f4, f4, n6);
        PolarisConfigUi.rowText(paint, layout, n2, string, string2, f3, f * f4, f4);
        int n7 = Math.round(78.0f * uiScale);
        int n8 = Math.round(22.0f * uiScale);
        int n9 = PolarisConfigUi.controlRight(layout) - n7 + n6;
        int n10 = n2 + (PolarisConfigUi.cardHeight() - n8) / 2;
        int n11 = Math.max(5, Math.round(7.0f * uiScale));
        if (bl) {
            PolarisConfigUi.roundRect(paint, n9, n10, n7, n8, n11, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(n3, accentSoft, 0.25f + 0.2f * f3), Math.round(255.0f * f * f4)));
            PolarisConfigUi.roundRect(paint, n9, n10, n7, Math.max(1, n8 / 3), n11, PolarisConfigUi.withAlpha(-1, Math.round(34.0f * f * f4)));
            PolarisConfigUi.roundRectOutline(paint, n9, n10, n7, n8, n11, PolarisConfigUi.withAlpha(-1, Math.round((30.0f + 50.0f * f3) * f * f4)));
            paint.flatCentered(string3, n9 + n7 / 2, n10 + (n8 - 8) / 2 + 1, PolarisConfigUi.withAlpha(-16052971, f * f4));
        } else {
            PolarisConfigUi.roundRect(paint, n9, n10, n7, n8, n11, PolarisConfigUi.withAlpha(n3, Math.round((24.0f + 30.0f * f3) * f * f4)));
            PolarisConfigUi.roundRectOutline(paint, n9, n10, n7, n8, n11, PolarisConfigUi.withAlpha(n3, Math.round((80.0f + 90.0f * f3) * f * f4)));
            paint.flatCentered(string3, n9 + n7 / 2, n10 + (n8 - 8) / 2 + 1, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(n3, -1, 0.35f), f * f4));
        }
    }

    private static void infoRow(Paint paint, Layout layout, int n, int n2, String string, String string2, String string3, int n3, int n4, long l, float f, float f2) {
        boolean bl = PolarisConfigUi.rowHovered(layout, n2, n3, n4);
        float f3 = PolarisConfigUi.anim(2000 + n, bl ? 1.0f : 0.0f, l, 130.0f);
        float f4 = PolarisConfigUi.rowFade(f2, n);
        int n5 = PolarisConfigUi.rowShift(f4, n);
        PolarisConfigUi.rowCard(paint, layout, n2, f3, f * f4, f4, n5);
        PolarisConfigUi.rowText(paint, layout, n2, string, string3, f3, f * f4, f4);
        int n6 = paint.textWidth(string2) + Math.round(16.0f * uiScale);
        int n7 = Math.round(18.0f * uiScale);
        int n8 = PolarisConfigUi.controlRight(layout) - n6 + n5;
        int n9 = n2 + (PolarisConfigUi.cardHeight() - n7) / 2;
        PolarisConfigUi.pill(paint, n8, n9, n6, n7, PolarisConfigUi.withAlpha(-1, Math.round((12.0f + 10.0f * f3) * f * f4)));
        PolarisConfigUi.pillOutline(paint, n8, n9, n6, n7, PolarisConfigUi.withAlpha(-7643914, Math.round((40.0f + 40.0f * f3) * f * f4)));
        paint.flatCentered(string2, n8 + n6 / 2, n9 + (n7 - 8) / 2 + 1, PolarisConfigUi.withAlpha(-1117958, f * f4));
    }

    private static void rowCard(Paint paint, Layout layout, int n, float f, float f2, float f3, int n2) {
        int n3 = layout.contentX + n2;
        int n4 = layout.contentWidth;
        int n5 = PolarisConfigUi.cardHeight();
        int n6 = Math.max(6, Math.round(9.0f * uiScale));
        PolarisConfigUi.roundRect(paint, n3, n, n4, n5, n6, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(0xAFFFFFF, 0x12FFFFFF, f), f2));
        paint.fill(n3 + n6, n + 1, n3 + n4 - n6, n + 2, PolarisConfigUi.withAlpha(-1, Math.round(10.0f * f2)));
        if (f > 0.02f) {
            PolarisConfigUi.roundRectOutline(paint, n3, n, n4, n5, n6, PolarisConfigUi.withAlpha(-7643914, Math.round(120.0f * f * f2)));
            int n7 = Math.round((float)n5 * 0.5f);
            PolarisConfigUi.roundRect(paint, n3 + 1, n + (n5 - n7) / 2, Math.max(2, Math.round(3.0f * uiScale)), n7, Math.max(1, Math.round(1.5f * uiScale)), PolarisConfigUi.withAlpha(accent, Math.round(200.0f * f * f2)));
        } else {
            paint.fill(n3 + n6, n + n5 - 1, n3 + n4 - n6, n + n5, PolarisConfigUi.withAlpha(0, Math.round(50.0f * f2)));
        }
    }

    private static void rowText(Paint paint, Layout layout, int n, String string, String string2, float f, float f2, float f3) {
        int n2 = layout.contentX + PolarisConfigUi.rowShift(f3, 0) + Math.round(14.0f * uiScale);
        int n3 = PolarisConfigUi.cardHeight();
        int n4 = PolarisConfigUi.withAlpha(PolarisConfigUi.mix(-1117958, accentSoft, 0.18f * f), f2);
        if (string2 == null || n3 < Math.round(27.0f * uiScale)) {
            paint.flat(string, n2, n + (n3 - 8) / 2 + 1, n4);
            return;
        }
        paint.flat(string, n2, n + Math.max(4, Math.round(6.0f * uiScale)), n4);
        paint.flat(PolarisConfigUi.trim(paint, string2, layout.contentWidth - Math.round(120.0f * uiScale)), n2, n + n3 - Math.round(11.0f * uiScale), PolarisConfigUi.withAlpha(PolarisConfigUi.mix(-7563855, -1117958, 0.25f * f), f2 * 0.95f));
    }

    private static void drawFooter(Paint paint, Layout layout, int n, int n2, int n3, int n4, float f, float f2, long l, int n5, int n6) {
        int n7 = n2 + n4 - layout.footerHeight;
        int n8 = Math.round(18.0f * f);
        PolarisConfigUi.fadeLine(paint, n + n8, n7, n3 - n8 * 2, Math.max(1, Math.round(f)), accent, f2 * 0.8f);
        int n9 = Math.round(26.0f * f);
        int n10 = Math.round(104.0f * f);
        int n11 = n7 + Math.round(11.0f * f);
        PolarisConfigUi.footerButton(paint, n + layout.sidebarWidth + Math.round(20.0f * f), n11, n10, n9, "Reset all", -38015, false, 5000, l, f2, n5, n6);
        PolarisConfigUi.footerButton(paint, n + n3 - n8 - n10, n11, n10, n9, "Done", accent, true, 5001, l, f2, n5, n6);
    }

    private static void footerButton(Paint paint, int n, int n2, int n3, int n4, String string, int n5, boolean bl, int n6, long l, float f, int n7, int n8) {
        boolean bl2 = PolarisConfigUi.inRect(n7, n8, n, n2, n3, n4);
        float f2 = PolarisConfigUi.anim(n6, bl2 ? 1.0f : 0.0f, l, 130.0f);
        int n9 = Math.max(6, Math.round(9.0f * uiScale));
        if (bl) {
            if (f2 > 0.02f) {
                PolarisConfigUi.roundRectOutline(paint, n - 2, n2 - 2, n3 + 4, n4 + 4, n9 + 2, PolarisConfigUi.withAlpha(n5, Math.round(50.0f * f2 * f)));
            }
            PolarisConfigUi.roundRect(paint, n, n2, n3, n4, n9, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(n5, accentSoft, 0.3f + 0.2f * f2), Math.round(255.0f * f)));
            PolarisConfigUi.roundRect(paint, n, n2, n3, Math.max(1, n4 / 3), n9, PolarisConfigUi.withAlpha(-1, Math.round(40.0f * f)));
            paint.flatCentered(string, n + n3 / 2, n2 + (n4 - 8) / 2 + 1, PolarisConfigUi.withAlpha(-16052971, f));
        } else {
            PolarisConfigUi.roundRect(paint, n, n2, n3, n4, n9, PolarisConfigUi.withAlpha(n5, Math.round((20.0f + 26.0f * f2) * f)));
            PolarisConfigUi.roundRectOutline(paint, n, n2, n3, n4, n9, PolarisConfigUi.withAlpha(n5, Math.round((70.0f + 90.0f * f2) * f)));
            paint.flatCentered(string, n + n3 / 2, n2 + (n4 - 8) / 2 + 1, PolarisConfigUi.withAlpha(PolarisConfigUi.mix(n5, -1, 0.4f), f));
        }
    }

    public static ClickResult click(PolarisConfigSettings polarisConfigSettings, int n, double d, double d2, int n2, int n3) {
        int n4;
        int n5;
        int n6;
        PolarisConfigUi.prepare(polarisConfigSettings);
        layoutCategory = n;
        Layout layout = PolarisConfigUi.layout(n2, n3, polarisConfigSettings);
        float f = uiScale;
        int n7 = layout.x;
        int n8 = layout.y;
        int n9 = layout.width;
        int n10 = layout.height;
        int n11 = (int)Math.round(d);
        int n12 = (int)Math.round(d2);
        int n13 = n8 + n10 - layout.footerHeight;
        int n14 = Math.round(18.0f * f);
        int n15 = Math.round(26.0f * f);
        int n16 = Math.round(104.0f * f);
        int n17 = n13 + Math.round(11.0f * f);
        if (PolarisConfigUi.inRect(n11, n12, n7 + layout.sidebarWidth + Math.round(20.0f * f), n17, n16, n15)) {
            polarisConfigSettings.reset();
            return new ClickResult(0, false, true);
        }
        if (PolarisConfigUi.inRect(n11, n12, n7 + n9 - n14 - n16, n17, n16, n15)) {
            return new ClickResult(n, true, false);
        }
        int n18 = n8 + layout.headerHeight + Math.round(30.0f * f);
        int n19 = layout.sidebarItemHeight;
        int n20 = n7 + Math.round(10.0f * f);
        int n21 = layout.sidebarWidth - Math.round(20.0f * f);
        int n22 = Math.max(Math.round(18.0f * f), n19 - Math.round(7.0f * f));
        for (n6 = 0; n6 < CATEGORIES.length; ++n6) {
            n5 = n18 + n6 * n19;
            if (!PolarisConfigUi.inRect(n11, n12, n20, n5, n21, n22)) continue;
            polarisConfigSettings.category = n6;
            if (polarisConfigSettings.rememberLastPage) {
                polarisConfigSettings.save();
            }
            return new ClickResult(n6, false, true);
        }
        n6 = PolarisConfigUi.rowTop(layout);
        n5 = PolarisConfigUi.cardHeight();
        int n23 = -1;
        if (n11 >= layout.contentX && n11 <= layout.contentX + layout.contentWidth && (n4 = (n12 - n6) / layout.rowHeight) >= 0 && n12 - (n6 + n4 * layout.rowHeight) <= n5) {
            n23 = n4;
        }
        if (n23 < 0) {
            return new ClickResult(n, false, false);
        }
        n4 = 0;
        if (n == 0) {
            if (n23 == 0) {
                polarisConfigSettings.pauseGame = !polarisConfigSettings.pauseGame;
                n4 = 1;
            } else if (n23 == 1) {
                polarisConfigSettings.rememberLastPage = !polarisConfigSettings.rememberLastPage;
                n4 = 1;
            } else if (n23 == 2) {
                polarisConfigSettings.showDescriptions = !polarisConfigSettings.showDescriptions;
                n4 = 1;
            } else if (n23 == 3) {
                polarisConfigSettings.showKeybindHints = !polarisConfigSettings.showKeybindHints;
                n4 = 1;
            } else if (n23 == 4) {
                polarisConfigSettings.presenceAlerts = !polarisConfigSettings.presenceAlerts;
                n4 = 1;
            } else if (n23 == 5) {
                polarisConfigSettings.reset();
                return new ClickResult(0, false, true);
            }
        } else if (n == 1) {
            if (n23 == 0) {
                polarisConfigSettings.backgroundBlur = !polarisConfigSettings.backgroundBlur;
                n4 = 1;
            } else if (n23 == 1) {
                if (PolarisConfigUi.overSlider(n11, layout)) {
                    polarisConfigSettings.pageOpacity = PolarisConfigUi.slider(n11, layout, 30, 100);
                    n4 = 1;
                }
            } else if (n23 == 2) {
                if (PolarisConfigUi.overSlider(n11, layout)) {
                    polarisConfigSettings.sidebarOpacity = PolarisConfigUi.slider(n11, layout, 30, 100);
                    n4 = 1;
                }
            } else if (n23 == 3) {
                if (PolarisConfigUi.overSlider(n11, layout)) {
                    polarisConfigSettings.uiScale = PolarisConfigUi.slider(n11, layout, 75, 125);
                    n4 = 1;
                }
            } else if (n23 == 4 && PolarisConfigUi.overSlider(n11, layout)) {
                polarisConfigSettings.glowOpacity = PolarisConfigUi.slider(n11, layout, 0, 100);
                n4 = 1;
            }
        } else if (n == 2) {
            if (n23 == 0) {
                polarisConfigSettings.hudEnabled = !polarisConfigSettings.hudEnabled;
                n4 = 1;
            } else if (n23 == 1) {
                polarisConfigSettings.hudFps = !polarisConfigSettings.hudFps;
                n4 = 1;
            } else if (n23 == 2) {
                polarisConfigSettings.hudCoords = !polarisConfigSettings.hudCoords;
                n4 = 1;
            } else if (n23 == 3) {
                polarisConfigSettings.hudPing = !polarisConfigSettings.hudPing;
                n4 = 1;
            } else if (n23 == 4) {
                polarisConfigSettings.hudKeystrokes = !polarisConfigSettings.hudKeystrokes;
                n4 = 1;
            } else if (n23 == 5) {
                polarisConfigSettings.hudBackground = !polarisConfigSettings.hudBackground;
                n4 = 1;
            } else if (n23 == 6) {
                polarisConfigSettings.hudPosition = (polarisConfigSettings.hudPosition + 1) % 4;
                n4 = 1;
            }
        } else if (n == 3) {
            if (n23 == 0) {
                int n24 = PolarisConfigUi.accentSwatchIndex(n11, n12, layout, n6);
                if (n24 >= 0) {
                    polarisConfigSettings.accent = n24;
                    n4 = 1;
                }
            } else if (n23 == 1) {
                polarisConfigSettings.accent = 0;
                n4 = 1;
            }
        } else if (n == 4) {
            if (n23 == 0) {
                polarisConfigSettings.animations = !polarisConfigSettings.animations;
                n4 = 1;
            } else if (n23 == 1) {
                polarisConfigSettings.openAnimation = !polarisConfigSettings.openAnimation;
                n4 = 1;
            } else if (n23 == 2) {
                polarisConfigSettings.closingAnimation = !polarisConfigSettings.closingAnimation;
                n4 = 1;
            } else if (n23 == 3) {
                polarisConfigSettings.pageAnimations = !polarisConfigSettings.pageAnimations;
                n4 = 1;
            } else if (n23 == 4 && PolarisConfigUi.overSlider(n11, layout)) {
                polarisConfigSettings.animationMs = PolarisConfigUi.slider(n11, layout, 100, 800);
                n4 = 1;
            }
        } else if (n == 5) {
            if (n23 == 0) {
                polarisConfigSettings.uiSounds = !polarisConfigSettings.uiSounds;
                n4 = 1;
            } else if (n23 == 1) {
                polarisConfigSettings.menuSounds = !polarisConfigSettings.menuSounds;
                n4 = 1;
            } else if (n23 == 2) {
                polarisConfigSettings.clickSounds = !polarisConfigSettings.clickSounds;
                n4 = 1;
            } else if (n23 == 3) {
                polarisConfigSettings.sliderSounds = !polarisConfigSettings.sliderSounds;
                n4 = 1;
            } else if (n23 == 4 && PolarisConfigUi.overSlider(n11, layout)) {
                polarisConfigSettings.soundVolume = PolarisConfigUi.slider(n11, layout, 0, 100);
                n4 = 1;
            }
        } else if (n == 6) {
            if (n23 == 1) {
                polarisConfigSettings.keybindClosesGui = !polarisConfigSettings.keybindClosesGui;
                n4 = 1;
            } else if (n23 == 2) {
                polarisConfigSettings.showKeybindHints = !polarisConfigSettings.showKeybindHints;
                n4 = 1;
            } else if (n23 == 3) {
                return new ClickResult(n, true, false);
            }
        } else if (n == 7) {
            if (n23 == 0) {
                polarisConfigSettings.profile = polarisConfigSettings.nextProfile();
                n4 = 1;
            } else if (n23 == 1) {
                polarisConfigSettings.applyProfile(polarisConfigSettings.profile);
                n4 = 1;
            } else if (n23 == 2) {
                polarisConfigSettings.reset();
                return new ClickResult(0, false, true);
            }
        }
        if (n4 != 0) {
            polarisConfigSettings.save();
        }
        return new ClickResult(n, false, n4 != 0);
    }

    private static void prepare(PolarisConfigSettings polarisConfigSettings) {
        accent = ACCENTS[PolarisConfigUi.clampIndex(polarisConfigSettings.accent, ACCENTS.length)];
        accentSoft = PolarisConfigUi.mix(accent, -14494738, 0.45f);
        uiScale = PolarisConfigUi.scale(polarisConfigSettings);
    }

    private static int rowTop(Layout layout) {
        return layout.contentY + Math.round(50.0f * uiScale);
    }

    private static int cardHeight() {
        return Math.max(20, rowHeightPx - Math.round(6.0f * uiScale));
    }

    private static int controlRight(Layout layout) {
        return layout.contentX + layout.contentWidth - Math.round(14.0f * uiScale);
    }

    private static int sliderWidth() {
        return Math.round(116.0f * uiScale);
    }

    private static boolean rowHovered(Layout layout, int n, int n2, int n3) {
        return n2 >= layout.contentX && n2 <= layout.contentX + layout.contentWidth && n3 >= n && n3 <= n + PolarisConfigUi.cardHeight();
    }

    private static float rowFade(float f, int n) {
        return PolarisConfigUi.clamp01((f - (float)n * 0.05f) * 2.6f);
    }

    private static int rowShift(float f, int n) {
        return Math.round((1.0f - f) * 10.0f * uiScale * (float)pageDir);
    }

    private static int slider(int n, Layout layout, int n2, int n3) {
        int n4 = PolarisConfigUi.sliderWidth();
        int n5 = PolarisConfigUi.sliderTrackX(layout);
        float f = (float)(n - n5) / (float)n4;
        return Math.round((float)n2 + PolarisConfigUi.clamp01(f) * (float)(n3 - n2));
    }

    private static int sliderTrackX(Layout layout) {
        return PolarisConfigUi.controlRight(layout) - Math.round(46.0f * uiScale) - PolarisConfigUi.sliderWidth();
    }

    private static boolean overSlider(int n, Layout layout) {
        int n2 = PolarisConfigUi.sliderTrackX(layout);
        return n >= n2 - Math.round(8.0f * uiScale) && n <= n2 + PolarisConfigUi.sliderWidth() + Math.round(8.0f * uiScale);
    }

    private static int accentSwatchIndex(int n, int n2, Layout layout, int n3) {
        int n4 = Math.max(6, Math.round(8.0f * uiScale));
        int n5 = Math.max(20, Math.round(23.0f * uiScale));
        int n6 = PolarisConfigUi.controlRight(layout) - n4;
        int n7 = n3 + PolarisConfigUi.cardHeight() / 2;
        for (int i = 0; i < ACCENTS.length; ++i) {
            int n8 = n6 - (ACCENTS.length - 1 - i) * n5;
            if (Math.abs(n - n8) > n4 + 3 || Math.abs(n2 - n7) > n4 + 3) continue;
            return i;
        }
        return -1;
    }

    private static String hudPositionName(int n) {
        switch (n) {
            case 1: {
                return "Top right";
            }
            case 2: {
                return "Bottom left";
            }
            case 3: {
                return "Bottom right";
            }
        }
        return "Top left";
    }

    private static boolean bool(PolarisConfigSettings polarisConfigSettings, int n, int n2) {
        if (n == 0) {
            return n2 == 0 ? polarisConfigSettings.pauseGame : (n2 == 1 ? polarisConfigSettings.rememberLastPage : (n2 == 2 ? polarisConfigSettings.showDescriptions : (n2 == 3 ? polarisConfigSettings.showKeybindHints : polarisConfigSettings.presenceAlerts)));
        }
        if (n == 1) {
            return polarisConfigSettings.backgroundBlur;
        }
        if (n == 2) {
            return n2 == 0 ? polarisConfigSettings.hudEnabled : (n2 == 1 ? polarisConfigSettings.hudFps : (n2 == 2 ? polarisConfigSettings.hudCoords : (n2 == 3 ? polarisConfigSettings.hudPing : (n2 == 4 ? polarisConfigSettings.hudKeystrokes : polarisConfigSettings.hudBackground))));
        }
        if (n == 4) {
            return n2 == 0 ? polarisConfigSettings.animations : (n2 == 1 ? polarisConfigSettings.openAnimation : (n2 == 2 ? polarisConfigSettings.closingAnimation : polarisConfigSettings.pageAnimations));
        }
        return n2 == 0 ? polarisConfigSettings.uiSounds : (n2 == 1 ? polarisConfigSettings.menuSounds : (n2 == 2 ? polarisConfigSettings.clickSounds : polarisConfigSettings.sliderSounds));
    }

    private static int value(PolarisConfigSettings polarisConfigSettings, int n, int n2) {
        if (n == 1) {
            return n2 == 1 ? polarisConfigSettings.pageOpacity : (n2 == 2 ? polarisConfigSettings.sidebarOpacity : (n2 == 3 ? polarisConfigSettings.uiScale : polarisConfigSettings.glowOpacity));
        }
        if (n == 4) {
            return polarisConfigSettings.animationMs;
        }
        return polarisConfigSettings.soundVolume;
    }

    private static float scale(PolarisConfigSettings polarisConfigSettings) {
        return (float)Math.max(75, Math.min(125, polarisConfigSettings.uiScale)) / 100.0f;
    }

    private static void roundRect(Paint paint, int n, int n2, int n3, int n4, int n5, int n6) {
        if (n3 <= 0 || n4 <= 0) {
            return;
        }
        int n7 = Math.max(0, Math.min(n5, Math.min(n3, n4) / 2));
        if (n7 == 0) {
            paint.fill(n, n2, n + n3, n2 + n4, n6);
            return;
        }
        paint.fill(n + n7, n2, n + n3 - n7, n2 + n4, n6);
        paint.fill(n, n2 + n7, n + n7, n2 + n4 - n7, n6);
        paint.fill(n + n3 - n7, n2 + n7, n + n3, n2 + n4 - n7, n6);
        for (int i = 0; i < n7; ++i) {
            int n8 = PolarisConfigUi.cornerInset(n7, i);
            paint.fill(n + n8, n2 + i, n + n7, n2 + i + 1, n6);
            paint.fill(n + n3 - n7, n2 + i, n + n3 - n8, n2 + i + 1, n6);
            paint.fill(n + n8, n2 + n4 - 1 - i, n + n7, n2 + n4 - i, n6);
            paint.fill(n + n3 - n7, n2 + n4 - 1 - i, n + n3 - n8, n2 + n4 - i, n6);
        }
    }

    private static void roundRectOutline(Paint paint, int n, int n2, int n3, int n4, int n5, int n6) {
        if (n3 <= 0 || n4 <= 0) {
            return;
        }
        int n7 = Math.max(0, Math.min(n5, Math.min(n3, n4) / 2));
        if (n7 == 0) {
            paint.fill(n, n2, n + n3, n2 + 1, n6);
            paint.fill(n, n2 + n4 - 1, n + n3, n2 + n4, n6);
            paint.fill(n, n2, n + 1, n2 + n4, n6);
            paint.fill(n + n3 - 1, n2, n + n3, n2 + n4, n6);
            return;
        }
        paint.fill(n + n7, n2, n + n3 - n7, n2 + 1, n6);
        paint.fill(n + n7, n2 + n4 - 1, n + n3 - n7, n2 + n4, n6);
        paint.fill(n, n2 + n7, n + 1, n2 + n4 - n7, n6);
        paint.fill(n + n3 - 1, n2 + n7, n + n3, n2 + n4 - n7, n6);
        for (int i = 0; i < n7; ++i) {
            int n8 = PolarisConfigUi.cornerInset(n7, i);
            int n9 = i + 1 < n7 ? PolarisConfigUi.cornerInset(n7, i + 1) : n8;
            int n10 = Math.min(n8, n9);
            int n11 = Math.max(n8, n9);
            paint.fill(n + n10, n2 + i, n + n11 + 1, n2 + i + 1, n6);
            paint.fill(n + n3 - 1 - n11, n2 + i, n + n3 - n10, n2 + i + 1, n6);
            paint.fill(n + n10, n2 + n4 - 1 - i, n + n11 + 1, n2 + n4 - i, n6);
            paint.fill(n + n3 - 1 - n11, n2 + n4 - 1 - i, n + n3 - n10, n2 + n4 - i, n6);
        }
    }

    private static void pill(Paint paint, int n, int n2, int n3, int n4, int n5) {
        PolarisConfigUi.roundRect(paint, n, n2, n3, n4, n4 / 2, n5);
    }

    private static void pillOutline(Paint paint, int n, int n2, int n3, int n4, int n5) {
        PolarisConfigUi.roundRectOutline(paint, n, n2, n3, n4, n4 / 2, n5);
    }

    private static void sidebarShape(Paint paint, int n, int n2, int n3, int n4, int n5, int n6) {
        int n7 = Math.max(0, Math.min(n5, Math.min(n3, n4) / 2));
        paint.fill(n, n2, n + n3, n2 + n4 - n7, n6);
        for (int i = 0; i < n7; ++i) {
            int n8 = PolarisConfigUi.cornerInset(n7, i);
            paint.fill(n + n8, n2 + n4 - n7 + i, n + n3, n2 + n4 - n7 + i + 1, n6);
        }
    }

    private static int cornerInset(int n, int n2) {
        int n3 = n - n2;
        double d = (double)n * (double)n - (double)n3 * (double)n3;
        if (d <= 0.0) {
            return n;
        }
        return (int)Math.round((double)n - Math.sqrt(d));
    }

    private static void circle(Paint paint, int n, int n2, int n3, int n4) {
        if (n3 <= 0) {
            paint.fill(n, n2, n + 1, n2 + 1, n4);
            return;
        }
        for (int i = -n3; i <= n3; ++i) {
            int n5 = n3 * n3 - i * i;
            int n6 = n5 <= 0 ? 0 : (int)Math.sqrt(n5);
            paint.fill(n - n6, n2 + i, n + n6 + 1, n2 + i + 1, n4);
        }
    }

    private static void circleOutline(Paint paint, int n, int n2, int n3, int n4) {
        if (n3 <= 0) {
            return;
        }
        for (int i = -n3; i <= n3; ++i) {
            int n5 = n3 * n3 - i * i;
            if (n5 < 0) continue;
            int n6 = (int)Math.sqrt(n5);
            paint.fill(n - n6, n2 + i, n - n6 + 1, n2 + i + 1, n4);
            paint.fill(n + n6, n2 + i, n + n6 + 1, n2 + i + 1, n4);
        }
    }

    private static void ellipseGlow(Paint paint, int n, int n2, int n3, int n4, int n5, int n6, int n7, int n8, int n9, int n10, int n11) {
        if (n6 <= 0 || n3 <= 0 || n4 <= 0) {
            return;
        }
        for (int i = -n4; i <= n4; i += n11) {
            int n12;
            float f;
            int n13 = n2 + i;
            if (n13 < n8 || n13 >= n10 || (f = 1.0f - (float)(i * i) / (float)(n4 * n4)) <= 0.0f) continue;
            int n14 = Math.round((float)n3 * (float)Math.sqrt(f));
            int n15 = Math.max(n7, n - n14);
            int n16 = Math.min(n9, n + n14);
            if (n16 <= n15 || (n12 = Math.round((float)n6 * f * f)) <= 0) continue;
            paint.fill(n15, n13, n16, n13 + n11, PolarisConfigUi.withAlpha(n5, n12));
        }
    }

    private static void starfield(Paint paint, int n, int n2, int n3, int n4, int n5, long l, float f) {
        int n6 = n5 + 4;
        int n7 = Math.max(1, n3 - n6 * 2);
        int n8 = Math.max(1, n4 - n6 * 2);
        for (int i = 0; i < 44; ++i) {
            int n9 = n + n6 + PolarisConfigUi.hash(i * 31 + 7) % n7;
            int n10 = n2 + n6 + PolarisConfigUi.hash(i * 57 + 13) % n8;
            float f2 = 0.55f + 0.45f * (float)Math.sin((double)l / 1100.0 + (double)i * 1.9);
            int n11 = 16 + PolarisConfigUi.hash(i * 91 + 29) % 34;
            int n12 = Math.round((float)n11 * f2 * f);
            if (n12 <= 0) continue;
            int n13 = i % 9 == 0 ? accent : (i % 13 == 0 ? -14494738 : -1);
            int n14 = i % 11 == 0 ? 2 : 1;
            paint.fill(n9, n10, n9 + n14, n10 + n14, PolarisConfigUi.withAlpha(n13, n12));
        }
    }

    private static void fadeLine(Paint paint, int n, int n2, int n3, int n4, int n5, float f) {
        if (n3 <= 0) {
            return;
        }
        int n6 = Math.max(4, Math.min(28, n3 / 12));
        for (int i = 0; i < n6; ++i) {
            float f2 = (float)i / (float)n6;
            float f3 = (float)(i + 1) / (float)n6;
            float f4 = 1.0f - (f2 + f3) * 0.5f;
            int n7 = n + Math.round((float)n3 * f2);
            int n8 = Math.max(1, Math.round((float)n3 * f3) - Math.round((float)n3 * f2));
            paint.fill(n7, n2, n7 + n8, n2 + n4, PolarisConfigUi.withAlpha(n5, Math.round(120.0f * f4 * f4 * f)));
        }
    }

    private static void spaced(Paint paint, String string, int n, int n2, int n3, int n4) {
        int n5 = n;
        for (int i = 0; i < string.length(); ++i) {
            String string2 = string.substring(i, i + 1);
            paint.flat(string2, n5, n2, n3);
            n5 += paint.textWidth(string2) + n4;
        }
    }

    private static int spacedWidth(Paint paint, String string, int n) {
        int n2 = 0;
        for (int i = 0; i < string.length(); ++i) {
            n2 += paint.textWidth(string.substring(i, i + 1)) + n;
        }
        return Math.max(0, n2 - n);
    }

    private static String trim(Paint paint, String string, int n) {
        if (n <= 0 || paint.textWidth(string) <= n) {
            return string;
        }
        String string2 = string;
        while (string2.length() > 1 && paint.textWidth(string2 + "..") > n) {
            string2 = string2.substring(0, string2.length() - 1);
        }
        return string2 + "..";
    }

    private static void drawMark(Paint paint, int n, int n2, int n3, int n4, float f, long l) {
        int n5;
        int n6;
        int n7 = Math.max(3, n3 / 2);
        int n8 = n + n7;
        int n9 = n2 + n7;
        float f2 = 0.75f + 0.25f * (float)Math.sin((double)l / 1400.0);
        PolarisConfigUi.circle(paint, n8, n9, n7 + 4, PolarisConfigUi.withAlpha(n4, Math.round(16.0f * f2 * f)));
        PolarisConfigUi.circle(paint, n8, n9, n7 + 2, PolarisConfigUi.withAlpha(n4, Math.round(30.0f * f2 * f)));
        for (n6 = -n7; n6 <= n7; ++n6) {
            n5 = n7 - Math.abs(n6);
            paint.fill(n8 - n5, n9 + n6, n8 + n5 + 1, n9 + n6 + 1, PolarisConfigUi.withAlpha(n4, Math.round(255.0f * f)));
        }
        n6 = Math.max(1, n7 / 2);
        for (n5 = -n6; n5 <= n6; ++n5) {
            int n10 = n6 - Math.abs(n5);
            paint.fill(n8 - n10, n9 + n5, n8 + n10 + 1, n9 + n5 + 1, PolarisConfigUi.withAlpha(PolarisConfigUi.lighten(n4, 0.7f), Math.round(255.0f * f)));
        }
    }

    private static int[][] buildIconPixels() {
        int[][] nArrayArray = new int[ICONS.length][];
        for (int i = 0; i < ICONS.length; ++i) {
            ArrayList<Integer> arrayList = new ArrayList<Integer>();
            for (int j = 0; j < ICONS[i].length; ++j) {
                String string = ICONS[i][j];
                for (int k = 0; k < string.length(); ++k) {
                    if (string.charAt(k) != '#') continue;
                    arrayList.add(k);
                    arrayList.add(j);
                }
            }
            int[] nArray = new int[arrayList.size()];
            for (int j = 0; j < nArray.length; ++j) {
                nArray[j] = (Integer)arrayList.get(j);
            }
            nArrayArray[i] = nArray;
        }
        return nArrayArray;
    }

    private static void drawIcon(Paint paint, int n, int n2, int n3, int n4) {
        if (n < 0 || n >= ICON_PIXELS.length) {
            return;
        }
        int[] nArray = ICON_PIXELS[n];
        int n5 = 0;
        while (n5 + 1 < nArray.length) {
            paint.fill(n2 + nArray[n5], n3 + nArray[n5 + 1], n2 + nArray[n5] + 1, n3 + nArray[n5 + 1] + 1, n4);
            n5 += 2;
        }
    }

    private static float anim(int n, float f, long l, float f2) {
        Anim anim = ANIM.get(n);
        if (anim == null) {
            anim = new Anim();
            anim.value = f;
            anim.last = l;
            ANIM.put(n, anim);
            return f;
        }
        float f3 = l - anim.last;
        anim.last = l;
        if (f3 > 0.0f) {
            float f4 = Math.min(1.0f, f3 / Math.max(1.0f, f2));
            anim.value += (f - anim.value) * f4;
        }
        if (Math.abs(f - anim.value) < 0.003f) {
            anim.value = f;
        }
        return PolarisConfigUi.ease(PolarisConfigUi.clamp01(anim.value));
    }

    private static float ease(float f) {
        float f2 = 1.0f - PolarisConfigUi.clamp01(f);
        return 1.0f - f2 * f2 * f2;
    }

    private static float clamp01(float f) {
        return f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
    }

    private static int clampIndex(int n, int n2) {
        return n < 0 ? 0 : (n >= n2 ? n2 - 1 : n);
    }

    private static boolean inRect(int n, int n2, int n3, int n4, int n5, int n6) {
        return n >= n3 && n <= n3 + n5 && n2 >= n4 && n2 <= n4 + n6;
    }

    private static int opacity(int n) {
        return Math.max(0, Math.min(255, Math.round((float)n / 100.0f * 255.0f)));
    }

    private static int withAlpha(int n, int n2) {
        int n3 = Math.max(0, Math.min(255, n2));
        return n3 << 24 | n & 0xFFFFFF;
    }

    private static int withAlpha(int n, float f) {
        return PolarisConfigUi.withAlpha(n, Math.round((float)(n >>> 24 & 0xFF) * PolarisConfigUi.clamp01(f)));
    }

    private static int mix(int n, int n2, float f) {
        float f2 = PolarisConfigUi.clamp01(f);
        int n3 = n >>> 24 & 0xFF;
        int n4 = n2 >>> 24 & 0xFF;
        int n5 = n >>> 16 & 0xFF;
        int n6 = n2 >>> 16 & 0xFF;
        int n7 = n >>> 8 & 0xFF;
        int n8 = n2 >>> 8 & 0xFF;
        int n9 = n & 0xFF;
        int n10 = n2 & 0xFF;
        return Math.round((float)n3 + (float)(n4 - n3) * f2) << 24 | Math.round((float)n5 + (float)(n6 - n5) * f2) << 16 | Math.round((float)n7 + (float)(n8 - n7) * f2) << 8 | Math.round((float)n9 + (float)(n10 - n9) * f2);
    }

    private static int lighten(int n, float f) {
        return PolarisConfigUi.mix(n, -1, f);
    }

    private static int hash(int n) {
        int n2 = n;
        n2 ^= n2 >>> 16;
        n2 *= 2146121005;
        n2 ^= n2 >>> 15;
        n2 *= -2073254261;
        n2 ^= n2 >>> 16;
        return n2 & 0x3FFFFFFF;
    }

    public static final class Layout {
        public int x;
        public int y;
        public int width;
        public int height;
        public int sidebarWidth;
        public int headerHeight;
        public int footerHeight;
        public int rowHeight;
        public int sidebarItemHeight;
        public int contentX;
        public int contentY;
        public int contentWidth;
    }

    public static interface Paint {
        public void fill(int var1, int var2, int var3, int var4, int var5);

        public void text(String var1, int var2, int var3, int var4);

        public void centered(String var1, int var2, int var3, int var4);

        public int textWidth(String var1);

        default public void flat(String string, int n, int n2, int n3) {
            this.text(string, n, n2, n3);
        }

        default public void flatCentered(String string, int n, int n2, int n3) {
            this.centered(string, n, n2, n3);
        }
    }

    public static final class ClickResult {
        public final int category;
        public final boolean close;
        public final boolean changed;

        ClickResult(int n, boolean bl, boolean bl2) {
            this.category = n;
            this.close = bl;
            this.changed = bl2;
        }
    }

    private static final class Anim {
        float value;
        long last;

        private Anim() {
        }
    }
}

