/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  net.fabricmc.api.ClientModInitializer
 */
package dev.polaris.config;

import dev.polaris.config.PolarisConfigSettings;
import dev.polaris.config.PolarisHud;
import dev.polaris.config.PolarisPresence;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.ByteBuffer;
import net.fabricmc.api.ClientModInitializer;

public final class PolarisConfigClient
implements ClientModInitializer {
    private static final long POLL_INTERVAL_MS = 75L;
    private static volatile boolean wasDown;
    private static volatile boolean reported;
    private static Class<?> minecraftClass;
    private static Class<?> screenBase;
    private static String screenClassName;
    private static boolean officialMappings;

    public void onInitializeClient() {
        Thread thread = new Thread(new Runnable(){

            @Override
            public void run() {
                PolarisConfigClient.watch();
            }
        }, "PolarisConfig-KeyWatcher");
        thread.setDaemon(true);
        thread.start();
        PolarisPresence.start();
        PolarisHud.start();
        System.out.println("[PolarisConfig] Ready - press Right Shift to open the config menu");
    }

    private static void watch() {
        try {
            try {
                minecraftClass = Class.forName("net.minecraft.class_310");
                screenBase = Class.forName("net.minecraft.class_437");
                screenClassName = "dev.polaris.config.PolarisConfigScreen";
                officialMappings = false;
                try {
                    Class.forName("net.minecraft.class_11909");
                    screenClassName = "dev.polaris.config.PolarisConfigScreenModern";
                }
                catch (ClassNotFoundException classNotFoundException) {
                }
            }
            catch (ClassNotFoundException classNotFoundException) {
                minecraftClass = Class.forName("net.minecraft.client.Minecraft");
                screenBase = Class.forName("net.minecraft.client.gui.screens.Screen");
                screenClassName = "dev.polaris.config.PolarisConfigScreenOfficial";
                officialMappings = true;
            }
        }
        catch (Throwable throwable) {
            PolarisConfigClient.warn(throwable);
            return;
        }
        while (true) {
            try {
                Method method;
                final Object object = PolarisConfigClient.getInstance(minecraftClass);
                if (object != null && (method = PolarisConfigClient.findOneArg(minecraftClass, Runnable.class)) != null) {
                    method.invoke(object, new Runnable(){

                        @Override
                        public void run() {
                            try {
                                PolarisConfigClient.tick(object);
                            }
                            catch (Throwable throwable) {
                                PolarisConfigClient.warn(throwable);
                            }
                        }
                    });
                }
            }
            catch (Throwable throwable) {
                PolarisConfigClient.warn(throwable);
            }
            try {
                Thread.sleep(75L);
            }
            catch (InterruptedException interruptedException) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private static void tick(Object object) throws Exception {
        Object object2 = PolarisConfigClient.currentScreen(object);
        boolean bl = PolarisConfigClient.isKeyDown();
        if (bl && !wasDown) {
            boolean bl2;
            boolean bl3 = bl2 = object2 != null && object2.getClass().getName().equals(screenClassName);
            if (bl2) {
                if (PolarisConfigSettings.load().keybindClosesGui) {
                    PolarisConfigClient.setScreen(object, null);
                }
            } else if (object2 == null) {
                // Never replace chat, signs, containers or any other focused
                // screen: Shift is typing input there and the draft would be lost.
                Object obj = Class.forName(screenClassName).getConstructor(new Class[0]).newInstance(new Object[0]);
                PolarisConfigClient.setScreen(object, obj);
            }
        }
        wasDown = bl;
    }

    private static Object currentScreen(Object object) throws Exception {
        if (officialMappings) {
            // 26.1 exposes Minecraft.screen; 26.2+ moved it to Gui.screen().
            // A null field is still a valid answer: the player is in-world with
            // no screen open, which is exactly when the menu should open.
            Field direct = PolarisConfigClient.findFieldObject(object.getClass(), "screen", screenBase);
            if (direct != null) {
                return direct.get(object);
            }
            Object object2 = PolarisConfigClient.findField(object, "gui", null);
            if (object2 == null) {
                return null;
            }
            try {
                Method method = object2.getClass().getMethod("screen", new Class[0]);
                return method.invoke(object2, new Object[0]);
            } catch (NoSuchMethodException noScreenAccessor) {
                return null;
            }
        }
        return PolarisConfigClient.findField(object, null, screenBase);
    }

    private static void setScreen(Object object, Object object2) throws Exception {
        if (officialMappings) {
            Method direct = PolarisConfigClient.findSetScreen(object.getClass(), screenBase);
            if (direct != null) {
                direct.invoke(object, object2);
                return;
            }
            Object object3 = PolarisConfigClient.findField(object, "gui", null);
            if (object3 == null) {
                return;
            }
            Method method = PolarisConfigClient.findSetScreen(object3.getClass(), screenBase);
            if (method != null) {
                method.invoke(object3, object2);
            }
            return;
        }
        Method method = PolarisConfigClient.findSetScreen(object.getClass(), screenBase);
        if (method != null) {
            method.invoke(object, object2);
        }
    }

    private static Object getInstance(Class<?> clazz) throws Exception {
        try {
            return clazz.getMethod("method_1551", new Class[0]).invoke(null, new Object[0]);
        }
        catch (NoSuchMethodException noSuchMethodException) {
            for (Method method : clazz.getMethods()) {
                if (!Modifier.isStatic(method.getModifiers()) || method.getParameterCount() != 0 || !clazz.isAssignableFrom(method.getReturnType())) continue;
                return method.invoke(null, new Object[0]);
            }
            return null;
        }
    }

    private static Method findOneArg(Class<?> clazz, Class<?> clazz2) {
        String[] stringArray = new String[]{"execute", "method_18859", "method_19537", "method_40000"};
        for (String object : stringArray) {
            try {
                Method method = clazz.getMethod(object, clazz2);
                if (method.getReturnType() != Void.TYPE) continue;
                return method;
            }
            catch (NoSuchMethodException noSuchMethodException) {
                // empty catch block
            }
        }
        for (Method method : clazz.getMethods()) {
            if (method.getParameterCount() != 1 || method.getReturnType() != Void.TYPE || !method.getParameterTypes()[0].isAssignableFrom(clazz2)) continue;
            return method;
        }
        return null;
    }

    private static Method findSetScreen(Class<?> clazz, Class<?> clazz2) {
        String[] stringArray = new String[]{"method_1507", "setScreen", "setScreenAndShow"};
        for (String object : stringArray) {
            try {
                return clazz.getMethod(object, clazz2);
            }
            catch (NoSuchMethodException noSuchMethodException) {
            }
        }
        for (Method method : clazz.getMethods()) {
            if (method.getParameterCount() != 1 || method.getReturnType() != Void.TYPE || method.getParameterTypes()[0] != clazz2) continue;
            return method;
        }
        return null;
    }

    private static Object findField(Object object, String string, Class<?> clazz) throws Exception {
        Field field = PolarisConfigClient.findFieldObject(object.getClass(), string, clazz);
        return field == null ? null : field.get(object);
    }

    private static Field findFieldObject(Class<?> clazz, String string, Class<?> type) {
        for (Field field : clazz.getFields()) {
            if (type != null && field.getType() != type || string != null && !field.getName().equals(string)) continue;
            return field;
        }
        for (Field field : clazz.getDeclaredFields()) {
            if (type != null && field.getType() != type || string != null && !field.getName().equals(string)) continue;
            field.setAccessible(true);
            return field;
        }
        return null;
    }

    private static boolean isKeyDown() throws Exception {
        try {
            Class<?> clazz = Class.forName("org.lwjgl.glfw.GLFW");
            long l = ((Number)clazz.getMethod("glfwGetCurrentContext", new Class[0]).invoke(null, new Object[0])).longValue();
            if (l == 0L) {
                return false;
            }
            int n = clazz.getField("GLFW_KEY_RIGHT_SHIFT").getInt(null);
            int n2 = ((Number)clazz.getMethod("glfwGetKey", Long.TYPE, Integer.TYPE).invoke(null, l, n)).intValue();
            return n2 == 1;
        }
        catch (ClassNotFoundException classNotFoundException) {
            Class<?> clazz = Class.forName("org.lwjgl.sdl.SDLKeyboard");
            ByteBuffer byteBuffer = (ByteBuffer)clazz.getMethod("SDL_GetKeyboardState", new Class[0]).invoke(null, new Object[0]);
            Class<?> clazz2 = Class.forName("org.lwjgl.sdl.SDLScancode");
            int n = clazz2.getField("SDL_SCANCODE_RSHIFT").getInt(null);
            return byteBuffer.get(n) != 0;
        }
    }

    private static synchronized void warn(Throwable throwable) {
        if (reported) {
            return;
        }
        reported = true;
        System.out.println("[PolarisConfig] Compatibility fallback: " + throwable);
        throwable.printStackTrace(System.out);
    }
}

