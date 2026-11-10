/*
 * Decompiled with CFR 0.152.
 */
package dev.polaris.config;

import dev.polaris.config.PolarisConfigSettings;
import dev.polaris.config.PolarisFlatText;
import dev.polaris.config.PolarisPresence;
import dev.polaris.config.PolarisText;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;

public final class PolarisHud {
    private static final int[] ACCENTS = new int[]{-4939521, -13047553, -757066, -11870592, -278748};
    private static PolarisConfigSettings settings = new PolarisConfigSettings();
    private static long settingsLoadedAt;
    private static long fpsWindowStarted;
    private static int fpsFrames;
    private static int fps;

    private PolarisHud() {
    }

    public static void start() {
        try {
            Class<?> clazz = Class.forName("net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry");
            Class<?> clazz2 = Class.forName("net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement");
            Object object2 = PolarisText.identifier("polarisconfig", "hud");
            Object object3 = Proxy.newProxyInstance(clazz2.getClassLoader(), new Class[]{clazz2}, (object, method, objectArray) -> {
                if (objectArray != null && objectArray.length > 0) {
                    PolarisHud.render(objectArray[0]);
                }
                return null;
            });
            clazz.getMethod("addLast", object2.getClass(), clazz2).invoke(null, object2, object3);
            return;
        }
        catch (Throwable throwable) {
            try {
                Class<?> clazz = Class.forName("net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback");
                Object object4 = clazz.getField("EVENT").get(null);
                Object object5 = Proxy.newProxyInstance(clazz.getClassLoader(), new Class[]{clazz}, (object, method, objectArray) -> {
                    if (objectArray != null && objectArray.length > 0) {
                        PolarisHud.render(objectArray[0]);
                    }
                    return null;
                });
                object4.getClass().getMethod("register", Object.class).invoke(object4, object5);
            }
            catch (Throwable throwable2) {
                // empty catch block
            }
            return;
        }
    }

    private static void render(Object object) {
        try {
            int n;
            int n2;
            int n3;
            Object object2;
            long l = System.currentTimeMillis();
            if (l - settingsLoadedAt >= 1000L) {
                settings = PolarisConfigSettings.load();
                settingsLoadedAt = l;
            }
            if (!PolarisHud.settings.hudEnabled) {
                return;
            }
            if (fpsWindowStarted == 0L) {
                fpsWindowStarted = l;
            }
            ++fpsFrames;
            if (l - fpsWindowStarted >= 1000L) {
                fps = Math.round((float)fpsFrames * 1000.0f / (float)Math.max(1L, l - fpsWindowStarted));
                fpsFrames = 0;
                fpsWindowStarted = l;
            }
            if ((object2 = PolarisPresence.client()) == null) {
                return;
            }
            Object object3 = PolarisHud.field(object2, "field_1724");
            if (object3 == null) {
                object3 = PolarisHud.field(object2, "player");
            }
            if (object3 == null) {
                return;
            }
            Graphics graphics = new Graphics(object, object2);
            ArrayList<String> arrayList = new ArrayList<String>();
            if (PolarisHud.settings.hudFps) {
                arrayList.add("FPS " + fps);
            }
            if (PolarisHud.settings.hudCoords) {
                double d = PolarisHud.number(object3, "method_23317", "getX");
                double d2 = PolarisHud.number(object3, "method_23318", "getY");
                double d3 = PolarisHud.number(object3, "method_23321", "getZ");
                arrayList.add(String.format(Locale.ROOT, "XYZ %.1f / %.1f / %.1f", d, d2, d3));
            }
            if (PolarisHud.settings.hudPing && (n3 = PolarisHud.ping(object2, object3)) >= 0) {
                arrayList.add("Ping " + n3 + " ms");
            }
            int n4 = ACCENTS[Math.max(0, Math.min(ACCENTS.length - 1, PolarisHud.settings.accent))];
            int n5 = PolarisHud.mix(n4, -14494738, 0.45f);
            int n6 = 0;
            for (String string : arrayList) {
                n6 = Math.max(n6, graphics.width(string));
            }
            n6 = Math.max(n6, graphics.width("POLARIS") + 12);
            int n7 = Math.max(96, n6 + 20);
            int n8 = 17;
            int n9 = n8 + Math.max(1, arrayList.size()) * 10 + 6;
            int n10 = graphics.guiWidth();
            int n11 = graphics.guiHeight();
            int n12 = PolarisHud.settings.hudPosition % 2 == 1 ? Math.max(6, n10 - n7 - 6) : 6;
            int n13 = n2 = PolarisHud.settings.hudPosition >= 2 ? Math.max(6, n11 - n9 - 6) : 6;
            if (PolarisHud.settings.hudBackground) {
                PolarisHud.roundRect(graphics, n12, n2, n7, n9, 6, -536015080);
                PolarisHud.roundRectOutline(graphics, n12, n2, n7, n9, 6, 1200315638);
                graphics.fill(n12 + 6, n2 + 1, n12 + n7 - 6, n2 + 2, 0x1FFFFFFF);
                PolarisHud.roundRect(graphics, n12 + 1, n2 + 5, 2, n9 - 10, 1, n4);
            }
            PolarisHud.drawMark(graphics, n12 + 6, n2 + 5, n4);
            graphics.flat("POLARIS", n12 + 16, n2 + 6, n5);
            PolarisHud.fadeLine(graphics, n12 + 6, n2 + n8 - 1, n7 - 12, n4);
            for (n = 0; n < arrayList.size(); ++n) {
                graphics.flat((String)arrayList.get(n), n12 + 8, n2 + n8 + 2 + n * 10, -1117958);
            }
            if (PolarisHud.settings.hudKeystrokes) {
                n = n2 + n9 + 5;
                if (PolarisHud.settings.hudPosition >= 2) {
                    n = Math.max(2, n2 - 36);
                }
                PolarisHud.drawKey(graphics, n12 + 17, n, "W", PolarisHud.isDown("W"), n4);
                PolarisHud.drawKey(graphics, n12 + 1, n + 17, "A", PolarisHud.isDown("A"), n4);
                PolarisHud.drawKey(graphics, n12 + 17, n + 17, "S", PolarisHud.isDown("S"), n4);
                PolarisHud.drawKey(graphics, n12 + 33, n + 17, "D", PolarisHud.isDown("D"), n4);
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
    }

    private static void drawKey(Graphics graphics, int n, int n2, String string, boolean bl, int n3) {
        if (bl) {
            PolarisHud.roundRect(graphics, n, n2, 15, 15, 4, n3);
            PolarisHud.roundRect(graphics, n, n2, 15, 5, 4, 0x3DFFFFFF);
            graphics.flat(string, n + 5, n2 + 4, -16052971);
        } else {
            PolarisHud.roundRect(graphics, n, n2, 15, 15, 4, -1945630190);
            PolarisHud.roundRectOutline(graphics, n, n2, 15, 15, 4, 0x26FFFFFF);
            graphics.flat(string, n + 5, n2 + 4, -7563855);
        }
    }

    private static void drawMark(Graphics graphics, int n, int n2, int n3) {
        int[] nArray = new int[]{1, 3, 5, 3, 1};
        for (int i = 0; i < nArray.length; ++i) {
            int n4 = nArray[i] / 2;
            graphics.fill(n + 3 - n4, n2 + i, n + 3 - n4 + nArray[i], n2 + i + 1, n3);
        }
        graphics.fill(n + 2, n2 + 2, n + 4, n2 + 3, -1);
    }

    private static void roundRect(Graphics graphics, int n, int n2, int n3, int n4, int n5, int n6) {
        if (n3 <= 0 || n4 <= 0) {
            return;
        }
        int n7 = Math.max(0, Math.min(n5, Math.min(n3, n4) / 2));
        if (n7 == 0) {
            graphics.fill(n, n2, n + n3, n2 + n4, n6);
            return;
        }
        graphics.fill(n + n7, n2, n + n3 - n7, n2 + n4, n6);
        graphics.fill(n, n2 + n7, n + n7, n2 + n4 - n7, n6);
        graphics.fill(n + n3 - n7, n2 + n7, n + n3, n2 + n4 - n7, n6);
        for (int i = 0; i < n7; ++i) {
            int n8 = PolarisHud.cornerInset(n7, i);
            graphics.fill(n + n8, n2 + i, n + n7, n2 + i + 1, n6);
            graphics.fill(n + n3 - n7, n2 + i, n + n3 - n8, n2 + i + 1, n6);
            graphics.fill(n + n8, n2 + n4 - 1 - i, n + n7, n2 + n4 - i, n6);
            graphics.fill(n + n3 - n7, n2 + n4 - 1 - i, n + n3 - n8, n2 + n4 - i, n6);
        }
    }

    private static void roundRectOutline(Graphics graphics, int n, int n2, int n3, int n4, int n5, int n6) {
        int n7 = Math.max(0, Math.min(n5, Math.min(n3, n4) / 2));
        graphics.fill(n + n7, n2, n + n3 - n7, n2 + 1, n6);
        graphics.fill(n + n7, n2 + n4 - 1, n + n3 - n7, n2 + n4, n6);
        graphics.fill(n, n2 + n7, n + 1, n2 + n4 - n7, n6);
        graphics.fill(n + n3 - 1, n2 + n7, n + n3, n2 + n4 - n7, n6);
        for (int i = 0; i < n7; ++i) {
            int n8 = PolarisHud.cornerInset(n7, i);
            int n9 = i + 1 < n7 ? PolarisHud.cornerInset(n7, i + 1) : n8;
            int n10 = Math.min(n8, n9);
            int n11 = Math.max(n8, n9);
            graphics.fill(n + n10, n2 + i, n + n11 + 1, n2 + i + 1, n6);
            graphics.fill(n + n3 - 1 - n11, n2 + i, n + n3 - n10, n2 + i + 1, n6);
            graphics.fill(n + n10, n2 + n4 - 1 - i, n + n11 + 1, n2 + n4 - i, n6);
            graphics.fill(n + n3 - 1 - n11, n2 + n4 - 1 - i, n + n3 - n10, n2 + n4 - i, n6);
        }
    }

    private static void fadeLine(Graphics graphics, int n, int n2, int n3, int n4) {
        int n5 = 8;
        for (int i = 0; i < n5; ++i) {
            float f = ((float)i + 0.5f) / (float)n5;
            int n6 = Math.round(90.0f * (1.0f - f) * (1.0f - f));
            int n7 = n + Math.round((float)n3 * ((float)i / (float)n5));
            int n8 = Math.max(1, Math.round((float)n3 * ((float)(i + 1) / (float)n5)) - Math.round((float)n3 * ((float)i / (float)n5)));
            graphics.fill(n7, n2, n7 + n8, n2 + 1, n6 << 24 | n4 & 0xFFFFFF);
        }
    }

    private static int cornerInset(int n, int n2) {
        int n3 = n - n2;
        int n4 = n * n - n3 * n3;
        if (n4 <= 0) {
            return n;
        }
        return Math.round((float)n - (float)Math.sqrt(n4));
    }

    private static int mix(int n, int n2, float f) {
        float f2 = f < 0.0f ? 0.0f : (f > 1.0f ? 1.0f : f);
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

    private static int ping(Object object, Object object2) {
        try {
            Object object3 = PolarisHud.invokeNoArg(object, "method_1562");
            if (object3 == null) {
                object3 = PolarisHud.invokeNoArg(object, "getConnection");
            }
            if (object3 == null) {
                return -1;
            }
            Object object4 = PolarisHud.invokeNoArg(object2, "method_5667");
            if (!(object4 instanceof UUID)) {
                object4 = PolarisHud.invokeNoArg(object2, "getUUID");
            }
            if (!(object4 instanceof UUID)) {
                return -1;
            }
            Object object5 = PolarisHud.invokeOneArg(object3, "method_2871", object4);
            if (object5 == null) {
                object5 = PolarisHud.invokeOneArg(object3, "getPlayerInfo", object4);
            }
            if (object5 == null) {
                return -1;
            }
            Object object6 = PolarisHud.invokeNoArg(object5, "method_2959");
            if (object6 == null) {
                object6 = PolarisHud.invokeNoArg(object5, "getLatency");
            }
            return object6 instanceof Number ? ((Number)object6).intValue() : -1;
        }
        catch (Throwable throwable) {
            return -1;
        }
    }

    private static double number(Object object, String string, String string2) {
        try {
            Object object2 = object.getClass().getMethod(string, new Class[0]).invoke(object, new Object[0]);
            return object2 instanceof Number ? ((Number)object2).doubleValue() : 0.0;
        }
        catch (Throwable throwable) {
            try {
                Object object3 = object.getClass().getMethod(string2, new Class[0]).invoke(object, new Object[0]);
                return object3 instanceof Number ? ((Number)object3).doubleValue() : 0.0;
            }
            catch (Throwable throwable2) {
                return 0.0;
            }
        }
    }

    private static boolean isDown(String string) {
        try {
            Class<?> clazz = Class.forName("org.lwjgl.glfw.GLFW");
            long l = ((Number)clazz.getMethod("glfwGetCurrentContext", new Class[0]).invoke(null, new Object[0])).longValue();
            if (l == 0L) {
                return false;
            }
            int n = clazz.getField("GLFW_KEY_" + string).getInt(null);
            return ((Number)clazz.getMethod("glfwGetKey", Long.TYPE, Integer.TYPE).invoke(null, l, n)).intValue() == 1;
        }
        catch (Throwable throwable) {
            try {
                Class<?> clazz = Class.forName("org.lwjgl.sdl.SDLKeyboard");
                ByteBuffer byteBuffer = (ByteBuffer)clazz.getMethod("SDL_GetKeyboardState", new Class[0]).invoke(null, new Object[0]);
                Class<?> clazz2 = Class.forName("org.lwjgl.sdl.SDLScancode");
                int n = clazz2.getField("SDL_SCANCODE_" + string).getInt(null);
                return byteBuffer.get(n) != 0;
            }
            catch (Throwable throwable2) {
                return false;
            }
        }
    }

    private static Object field(Object object, String string) {
        try {
            for (Class<?> clazz = object.getClass(); clazz != null; clazz = clazz.getSuperclass()) {
                for (Field field : clazz.getDeclaredFields()) {
                    if (!field.getName().equals(string)) continue;
                    field.setAccessible(true);
                    return field.get(object);
                }
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return null;
    }

    private static Object invokeNoArg(Object object, String string) {
        try {
            return object.getClass().getMethod(string, new Class[0]).invoke(object, new Object[0]);
        }
        catch (Throwable throwable) {
            return null;
        }
    }

    private static Object invokeOneArg(Object object, String string, Object object2) {
        try {
            for (Method method : object.getClass().getMethods()) {
                if (!method.getName().equals(string) || method.getParameterCount() != 1 || !method.getParameterTypes()[0].isInstance(object2)) continue;
                return method.invoke(object, object2);
            }
        }
        catch (Throwable throwable) {
            // empty catch block
        }
        return null;
    }

    private static final class Graphics {
        private final Object graphics;
        private final Object client;
        private final Object font;
        private final Method fill;
        private final Method text;
        private final Method width;

        Graphics(Object object, Object object2) throws Exception {
            this.graphics = object;
            this.client = object2;
            boolean bl = object.getClass().getName().contains("class_332");
            if (bl) {
                this.font = PolarisHud.field(object2, "field_1772");
                Class<?> clazz = Class.forName("net.minecraft.class_2561");
                Class<?> clazz2 = Class.forName("net.minecraft.class_327");
                this.fill = object.getClass().getMethod("method_25294", Integer.TYPE, Integer.TYPE, Integer.TYPE, Integer.TYPE, Integer.TYPE);
                this.text = object.getClass().getMethod("method_27535", clazz2, clazz, Integer.TYPE, Integer.TYPE, Integer.TYPE);
                this.width = clazz2.getMethod("method_1727", String.class);
            } else {
                this.font = PolarisHud.field(object2, "font");
                Class<?> clazz = Class.forName("net.minecraft.client.gui.Font");
                this.fill = object.getClass().getMethod("fill", Integer.TYPE, Integer.TYPE, Integer.TYPE, Integer.TYPE, Integer.TYPE);
                this.text = object.getClass().getMethod("text", clazz, String.class, Integer.TYPE, Integer.TYPE, Integer.TYPE);
                this.width = clazz.getMethod("width", String.class);
            }
        }

        void fill(int n, int n2, int n3, int n4, int n5) {
            try {
                this.fill.invoke(this.graphics, n, n2, n3, n4, n5);
            }
            catch (Throwable throwable) {
                // empty catch block
            }
        }

        void text(String string, int n, int n2, int n3) {
            try {
                if (this.text.getParameterTypes()[1] == String.class) {
                    this.text.invoke(this.graphics, this.font, string, n, n2, n3);
                } else {
                    this.text.invoke(this.graphics, this.font, PolarisText.literal(string), n, n2, n3);
                }
            }
            catch (Throwable throwable) {
                // empty catch block
            }
        }

        void flat(String string, int n, int n2, int n3) {
            if (PolarisFlatText.draw(this.graphics, this.font, string, n, n2, n3)) {
                return;
            }
            this.text(string, n, n2, n3);
        }

        int width(String string) {
            try {
                Object object = this.width.invoke(this.font, string);
                return object instanceof Number ? ((Number)object).intValue() : string.length() * 6;
            }
            catch (Throwable throwable) {
                return string.length() * 6;
            }
        }

        int guiWidth() {
            return this.dimension("guiWidth", "method_4480");
        }

        int guiHeight() {
            return this.dimension("guiHeight", "method_4486");
        }

        private int dimension(String string, String string2) {
            Object object;
            try {
                object = this.graphics.getClass().getMethod(string, new Class[0]).invoke(this.graphics, new Object[0]);
                if (object instanceof Number) {
                    return ((Number)object).intValue();
                }
            }
            catch (Throwable throwable) {
                // empty catch block
            }
            try {
                Object object2;
                object = PolarisHud.invokeNoArg(this.client, "method_22683");
                if (object == null) {
                    object = PolarisHud.field(this.client, "field_1704");
                }
                if (object != null && (object2 = object.getClass().getMethod(string2, new Class[0]).invoke(object, new Object[0])) instanceof Number) {
                    return ((Number)object2).intValue();
                }
            }
            catch (Throwable throwable) {
                // empty catch block
            }
            return 0;
        }
    }
}

